// The agent's tools (feature 5 §4.4): JSON schema for Ollama + server-side validation + execution over the
// deterministic planner. The model only names a tool and its arguments; every argument is checked here and
// every route is computed by the planner. Places are resolved against the catalog, never taken as ids.
import { ApiError } from './http.js';
import { localStart } from './marbella-scope.js';
import { normalize } from './onboarding.js';
import { noRoute, routeEnd } from './agent-texts.js';
import { defaults, minutes, clock, preferences, tripRequest, validDate, validTime } from './trip-contract.js';
import { alternatives, createTrip, plannerPlaces, refineTrip, resolvePlace } from './trip-planner.js';
import {
  historyUpdate, insertRoute, readRoute, undoUpdate, updateRoute, writePreferences
} from './trip-store.js';

/**
 * A refused tool call. `forModel` goes back to the decision model and may quote its own arguments and the closest
 * catalog names; `forVisitor` becomes the `rejected` reason when the model never fixes the call, so it is a fixed
 * Spanish text (or one built from catalog data only), never model input.
 */
export class ToolError extends Error {
  constructor(forModel, forVisitor = forModel) {
    super(forModel);
    this.reason = forVisitor;
  }
}

// Fixed visitor texts for refusals whose model message quotes the model's own arguments.
export const VISITOR = {
  generic: 'No he podido hacer ese cambio.',
  place: 'No conozco ese lugar en Marbella.',
  time: 'Esa fecha u hora no es válida.',
  past: 'Esa fecha u hora ya ha pasado.',
  conflict: 'La ruta ha cambiado en otra pantalla mientras tanto; vuelve a pedírmelo.'
};

export const INTERESTS = ['arquitectura', 'gastronomia', 'museos', 'naturaleza', 'historia', 'compras', 'vida_nocturna', 'arte_urbano'];
const PACES = ['relajado', 'equilibrado', 'intenso'];
const BUDGETS = ['bajo', 'medio', 'alto'];
const COMPANIES = ['solo', 'pareja', 'con_ninos', 'grupo'];
const TRANSPORTS = ['a_pie', 'transporte_publico', 'coche', 'bici'];
const QUICK = ['menos_caminar', 'mas_comida', 'mas_barato', 'anadir_pausa'];
export const DEFAULT_START = 'Plaza de los Naranjos';
export const DEFAULT_MINUTES = 180;

/* ---------- argument checks ---------- */

// Small models often send null or "" for an argument they do not use: both mean "absent".
const absent = value => value === undefined || value === null || value === '';
const bad = field => new ToolError(`Revisa el argumento ${field}.`, VISITOR.generic);

function text(value, field, max = 120) {
  if (absent(value)) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw bad(field);
  return value.trim();
}
function choice(value, field, allowed) {
  if (absent(value)) return undefined;
  if (!allowed.includes(value)) throw new ToolError(`${field} debe ser uno de: ${allowed.join(', ')}.`, VISITOR.generic);
  return value;
}
function integer(value, field, min, max) {
  if (absent(value)) return undefined;
  const number = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ToolError(`${field} debe ser un número entero entre ${min} y ${max}.`, VISITOR.generic);
  }
  return number;
}
function date(value, field) {
  if (absent(value)) return undefined;
  if (!validDate(value)) throw new ToolError(`${field} debe ser una fecha AAAA-MM-DD.`, VISITOR.time);
  return value;
}
function time(value, field) {
  if (absent(value)) return undefined;
  const padded = typeof value === 'string' && /^\d:\d\d$/.test(value) ? '0' + value : value;
  if (!validTime(padded)) throw new ToolError(`${field} debe ser una hora HH:MM.`, VISITOR.time);
  return padded;
}
function list(value, field, max) {
  if (absent(value)) return undefined;
  const items = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(items) || items.length > max || !items.every(item => typeof item === 'string' && item.length <= 120)) throw bad(field);
  return [...new Set(items.map(item => item.trim()).filter(Boolean))];
}
// Unknown interests are dropped: they only steer the ranking.
const interests = value => list(value, 'interests', 8)?.map(i => normalize(i).replace(/\s+/g, '_')).filter(i => INTERESTS.includes(i));
function bool(value, field) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw bad(field);
}

// The five catalog names that share most words with an unknown label.
const stopWords = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'marbella']);
const tokens = label => normalize(label).split(/[^a-z0-9ñ]+/).filter(word => word.length > 1 && !stopWords.has(word));
export function closestPlaces(label, count = 5) {
  const wanted = new Set(tokens(label));
  return plannerPlaces()
    .map((p, order) => ({ p, order, score: tokens(p.name).filter(word => wanted.has(word)).length }))
    .sort((a, b) => b.score - a.score || a.order - b.order).slice(0, count).map(({ p }) => p.name);
}
/** The one stop of `route` a loose label ("el museo") points to: exact catalog match first, then shared words. */
export function matchStop(label, route) {
  const exact = resolvePlace(label);
  if (exact) return route.stops.find(s => s.placeId === exact.id) ?? null;
  const wanted = new Set(tokens(label));
  const names = stop => {
    const p = resolvePlace(stop.placeId);
    return p ? [p.name, ...p.aliases] : [stop.name];
  };
  const hits = route.stops.filter(s => names(s).some(name => tokens(name).some(word => wanted.has(word))));
  return hits.length === 1 ? hits[0] : null;
}
function place(value, field) {
  const label = text(value, field);
  if (!label) throw new ToolError(`Falta ${field}.`, VISITOR.generic);
  const found = resolvePlace(label);
  if (!found) {
    throw new ToolError(`No conozco «${label}» en Marbella. Lugares parecidos: ${closestPlaces(label).join(', ')}.`, VISITOR.place);
  }
  return found;
}

/* ---------- route state ---------- */

/** Compact route state for the model and the narrator. */
export function routeSummary(route) {
  if (!route) return null;
  return {
    name: route.name, date: route.request.date, from: route.request.timeWindow.from, to: route.request.timeWindow.to,
    ends: routeEnd(route), start: route.request.start.label,
    stops: route.stops.map(s => ({
      n: s.order, name: s.name, arrive: s.arrive, minutes: s.visitMinutes, locked: s.locked,
      ...(s.travelToNext ? { next: `${s.travelToNext.mode.replace('_', ' ')} ${s.travelToNext.minutes} min` } : {})
    }))
  };
}
const stateLine = route => `${route.name}, ${route.stops.length} paradas de ${route.stops[0].arrive} a ${routeEnd(route)}: ` +
  route.stops.map(s => `${s.order}. ${s.name} (${s.arrive}${s.locked ? ', fijada' : ''})`).join('; ') + '.';

function requireRoute(ctx) {
  if (!ctx.routeId) throw new ToolError(noRoute);
}
function stopOf(route, p) {
  const stop = route.stops.find(s => s.placeId === p.id);
  if (!stop) throw new ToolError(`${p.name} no está en la ruta. Paradas: ${route.stops.map(s => s.name).join(', ')}.`);
  return stop;
}

/**
 * Applies `mutate` to the current route, reloaded from the database (another tab may have changed it), with the
 * revision-checked update; one retry on a conflict. `mutate` returns the next itinerary, or null for "no change".
 */
async function changeRoute(ctx, mutate) {
  requireRoute(ctx);
  for (let attempt = 0; ; attempt++) {
    const row = await readRoute(ctx.db, ctx.routeId, ctx.owner);
    if (!row) throw new ToolError(noRoute);
    const next = mutate(structuredClone(row.itinerary), row);
    if (!next) {
      ctx.route = row;
      return { before: row.itinerary, after: row.itinerary, changed: false };
    }
    const updated = await updateRoute(ctx.db, ctx.routeId, ctx.owner, row.revision, historyUpdate, JSON.stringify(next));
    if (updated) {
      ctx.route = updated;
      return { before: row.itinerary, after: updated.itinerary, changed: true };
    }
    if (attempt === 1) throw conflict();
  }
}
// A second ROUTE_CHANGED inside one turn is a refusal, not a 409, so the turn (and its memory) still completes.
const conflict = () => new ToolError('La ruta ha cambiado en otra pantalla mientras tanto; vuelve a leerla antes de cambiarla.',
  VISITOR.conflict);
const changed = (ctx, change, result, summary) => ({
  summary, ...(result.changed ? { event: { type: 'route_changed', routeId: ctx.routeId, change } } : {})
});

/* ---------- create_route defaults ---------- */

/** "HH:MM" rounded up to the next quarter hour. */
export const nextQuarter = now => clock(Math.ceil((minutes(now) + 1) / 15) * 15);
const LAST_MINUTE = 23 * 60 + 59;

// No route in the past: a date before the visitor's today, or a start earlier than now for today.
function notInThePast(day, from, ctx) {
  const { today, now } = ctx.client;
  if (day < today) throw new ToolError(`date ${day} es anterior a hoy (${today}).`, VISITOR.past);
  if (day === today && from && from < now) throw new ToolError(`from ${from} es anterior a la hora actual (${now}).`, VISITOR.past);
}

function timeWindow(args, ctx, assumptions) {
  const duration = args.durationMinutes ?? DEFAULT_MINUTES;
  const durationAssumed = args.durationMinutes === undefined;
  const defaultFrom = () => {
    const from = args.date && args.date !== ctx.client.today ? '10:00' : nextQuarter(ctx.client.now);
    assumptions.push(`salida a las ${from}`);
    return from;
  };
  let from = args.from;
  let to = args.to;
  if (!from && to) {
    from = args.durationMinutes ? minutes(to) - duration : null;
    from = from !== null && from >= 0 ? clock(from) : defaultFrom();
  } else if (!to) {
    from ??= defaultFrom();
    to = minutes(from) + duration;
    // A window cut at midnight is not the duration the visitor asked for (or was told): say where it ends.
    if (to > LAST_MINUTE) assumptions.push('hasta las 23:59');
    else if (durationAssumed) assumptions.push('3 horas');
    to = clock(Math.min(to, LAST_MINUTE));
  }
  if (minutes(from) >= 24 * 60 || from >= to) throw new ToolError('No queda tiempo para esa ruta en ese día. Pide otro día u otra hora.');
  notInThePast(args.date, from, ctx);
  return { from, to };
}

/* ---------- the tools ---------- */

const str = description => ({ type: 'string', description });
const placeArg = str('Place name exactly as in places.');

export const tools = {
  create_route: {
    description: 'Create a new route and make it the current one. Omitted arguments get defaults.',
    parameters: {
      date: str('YYYY-MM-DD; default today.'), from: str('Start time HH:MM.'), to: str('End time HH:MM.'),
      durationMinutes: { type: 'integer', description: '20 to 480; default 180.' },
      start: str('Starting place name from starts or places; default Plaza de los Naranjos.'),
      mustInclude: { type: 'array', items: { type: 'string' }, description: 'Place names the visitor asked for.' },
      interests: { type: 'array', items: { type: 'string', enum: INTERESTS } },
      pace: { type: 'string', enum: PACES }, budget: { type: 'string', enum: BUDGETS }, company: { type: 'string', enum: COMPANIES }
    },
    validate(raw) {
      const args = {
        date: date(raw.date, 'date'), from: time(raw.from, 'from'), to: time(raw.to, 'to'),
        durationMinutes: integer(raw.durationMinutes, 'durationMinutes', 20, 480),
        start: text(raw.start, 'start'), interests: interests(raw.interests),
        pace: choice(raw.pace, 'pace', PACES), budget: choice(raw.budget, 'budget', BUDGETS),
        company: choice(raw.company, 'company', COMPANIES)
      };
      if (args.start) {
        const label = localStart(args.start) ?? resolvePlace(args.start)?.name;
        if (!label || !localStart(label)) {
          throw new ToolError(`No conozco «${args.start}» como punto de salida. Lugares parecidos: ${closestPlaces(args.start).join(', ')}.`,
            VISITOR.place);
        }
        args.start = label;
      }
      args.mustInclude = (list(raw.mustInclude, 'mustInclude', 5) ?? []).map(label => {
        const p = place(label, 'mustInclude');
        if (p.kind === 'pause') {
          throw new ToolError('Una pausa no es una parada imprescindible; usa quick_change anadir_pausa.',
            'Una pausa no puede ser una parada imprescindible; pídemela como pausa para café.');
        }
        return p.name;
      });
      return args;
    },
    async execute(args, ctx) {
      // The event lists the defaults the server applied (the model is never asked for them).
      const assumptions = [];
      const day = args.date ?? ctx.client.today;
      if (!args.date) assumptions.push('hoy');
      const window = timeWindow({ ...args, date: day }, ctx, assumptions);
      if (!args.start) assumptions.push(`salida desde ${DEFAULT_START}`);
      const overrides = Object.fromEntries(Object.entries({
        interests: args.interests?.length ? args.interests : undefined, pace: args.pace, budget: args.budget, company: args.company
      }).filter(([, value]) => value !== undefined));
      const request = tripRequest({
        city: 'Marbella', date: day, timeWindow: window, start: { label: args.start ?? DEFAULT_START },
        mustInclude: args.mustInclude, ...(Object.keys(overrides).length ? { overrides } : {})
      });
      const prefs = { ...ctx.prefs, ...request.overrides };
      const route = createTrip(request, prefs, ctx.premium);
      await insertRoute(ctx.db, ctx.owner, route, prefs);
      ctx.routeId = route.id;
      ctx.route = { itinerary: route, saved: false, revision: 1, preferences: prefs };
      return { summary: `Ruta creada: ${stateLine(route)}`, event: { type: 'route_created', routeId: route.id, assumptions } };
    }
  },
  reschedule: {
    description: 'Change the date, start time, end time or duration of the current route (stops that no longer fit are ' +
      'dropped from the end). It cannot change the starting place.',
    parameters: {
      date: str('YYYY-MM-DD.'), from: str('New start HH:MM.'), to: str('New end HH:MM.'),
      durationMinutes: { type: 'integer', description: '20 to 480.' }
    },
    validate(raw) {
      const args = { date: date(raw.date, 'date'), from: time(raw.from, 'from'), to: time(raw.to, 'to'),
        durationMinutes: integer(raw.durationMinutes, 'durationMinutes', 20, 480) };
      if (Object.values(args).every(value => value === undefined)) throw new ToolError('Indica la fecha, la hora de inicio, la de fin o la duración.');
      return args;
    },
    async execute(args, ctx) {
      const result = await changeRoute(ctx, (route, row) => {
        const old = route.request.timeWindow;
        // A new date or start time must not be in the past; moving the end of a route already under way is fine.
        if (args.date || args.from) notInThePast(args.date ?? route.request.date, args.from ?? old.from, ctx);
        const length = args.durationMinutes ?? minutes(old.to) - minutes(old.from);
        let { from, to } = args;
        if (from && !to) to = clock(Math.min(minutes(from) + length, LAST_MINUTE));
        else if (!from && to) from = args.durationMinutes ? clock(Math.max(0, minutes(to) - length)) : old.from;
        else if (!from && !to) {
          from = old.from;
          to = clock(Math.min(minutes(from) + length, LAST_MINUTE));
        }
        return refineTrip(route, { type: 'reschedule', date: args.date, timeWindow: { from, to } }, row.preferences);
      });
      const dropped = result.before.stops.filter(s => !result.after.stops.some(a => a.placeId === s.placeId)).map(s => s.name);
      return changed(ctx, 'reschedule', result, `Horario cambiado: ${stateLine(result.after)}` +
        (dropped.length ? ` Quitadas por falta de tiempo: ${dropped.join(', ')}.` : ''));
    }
  },
  add_stop: {
    description: 'Add a place to the current route.',
    parameters: { place: placeArg, position: { type: 'integer', description: '1-based; omit for the best fit.' } },
    required: ['place'],
    validate: raw => ({ place: place(raw.place, 'place'), position: integer(raw.position, 'position', 1, 12) }),
    async execute(args, ctx) {
      const result = await changeRoute(ctx, (route, row) =>
        refineTrip(route, { type: 'add_stop', placeId: args.place.id, position: args.position }, row.preferences));
      return changed(ctx, 'add_stop', result, `Añadida ${args.place.name}: ${stateLine(result.after)}`);
    }
  },
  remove_stop: {
    description: 'Remove a stop from the current route.',
    parameters: { place: placeArg },
    required: ['place'],
    validate: raw => ({ place: place(raw.place, 'place') }),
    async execute(args, ctx) {
      const result = await changeRoute(ctx, (route, row) =>
        refineTrip(route, { type: 'remove_stop', order: stopOf(route, args.place).order }, row.preferences));
      return changed(ctx, 'remove_stop', result, `Quitada ${args.place.name}: ${stateLine(result.after)}`);
    }
  },
  replace_stop: {
    description: 'Replace a stop of the current route with another place (or the best alternative).',
    parameters: { place: placeArg, with: str('Replacement place name; omit for the best alternative.') },
    required: ['place'],
    validate: raw => ({ place: place(raw.place, 'place'), with: absent(raw.with) ? undefined : place(raw.with, 'with') }),
    async execute(args, ctx) {
      let chosen;
      const result = await changeRoute(ctx, (route, row) => {
        const { order } = stopOf(route, args.place);
        const options = alternatives(route, order, row.preferences);
        // The visitor's choice when it fits; otherwise the planner's first alternative.
        chosen = args.with ? { id: args.with.id, name: args.with.name } : options[0];
        if (!chosen) throw new ToolError(`No hay ninguna alternativa que quepa en lugar de ${args.place.name}.`);
        return refineTrip(route, { type: 'swap_stop', order, placeId: chosen.id }, row.preferences);
      });
      return changed(ctx, 'replace_stop', result, `Cambiada ${args.place.name} por ${chosen.name}: ${stateLine(result.after)}`);
    }
  },
  lock_stop: {
    description: 'Lock (keep) or unlock a stop of the current route.',
    parameters: { place: placeArg, locked: { type: 'boolean' } },
    required: ['place', 'locked'],
    validate: raw => ({ place: place(raw.place, 'place'), locked: bool(raw.locked, 'locked') }),
    async execute(args, ctx) {
      const result = await changeRoute(ctx, (route, row) => {
        const stop = stopOf(route, args.place);
        return stop.locked === args.locked ? null : refineTrip(route, { type: 'lock_stop', order: stop.order }, row.preferences);
      });
      return changed(ctx, 'lock_stop', result, `${args.place.name} ${args.locked ? 'fijada' : 'sin fijar'}: ${stateLine(result.after)}`);
    }
  },
  quick_change: {
    description: 'Quick change on the current route: menos_caminar (less walking), mas_comida (add food), mas_barato (cheaper), anadir_pausa (coffee break).',
    parameters: { value: { type: 'string', enum: QUICK } },
    required: ['value'],
    validate(raw) {
      const value = choice(raw.value, 'value', QUICK);
      if (!value) throw new ToolError(`value debe ser uno de: ${QUICK.join(', ')}.`, VISITOR.generic);
      return { value };
    },
    async execute(args, ctx) {
      const result = await changeRoute(ctx, (route, row) => refineTrip(route, { type: 'quick', value: args.value }, row.preferences));
      return changed(ctx, args.value, result, `Cambio ${args.value}: ${stateLine(result.after)}`);
    }
  },
  undo: {
    description: 'Undo the last changes of the current route.',
    parameters: { times: { type: 'integer', description: '1 to 3; default 1.' } },
    validate: raw => ({ times: integer(raw.times, 'times', 1, 3) ?? 1 }),
    async execute(args, ctx) {
      requireRoute(ctx);
      let undone = 0;
      for (let attempt = 0; undone < args.times;) {
        const row = await readRoute(ctx.db, ctx.routeId, ctx.owner);
        if (!row) throw new ToolError(noRoute);
        ctx.route = row;
        if (row.itinerary.version === 1) break;
        const updated = await updateRoute(ctx.db, ctx.routeId, ctx.owner, row.revision, undoUpdate);
        if (updated) {
          ctx.route = updated;
          undone++;
        } else if (++attempt > 1) throw conflict();
      }
      if (!undone) throw new ToolError('No hay ningún cambio que deshacer.');
      return { summary: `Deshecho: ${stateLine(ctx.route.itinerary)}`, event: { type: 'undone', routeId: ctx.routeId } };
    }
  },
  update_preferences: {
    description: 'Save the visitor\'s lasting preferences (not the current route).',
    parameters: {
      interests: { type: 'array', items: { type: 'string', enum: INTERESTS } },
      pace: { type: 'string', enum: PACES }, budget: { type: 'string', enum: BUDGETS }, company: { type: 'string', enum: COMPANIES },
      transport: { type: 'array', items: { type: 'string', enum: TRANSPORTS } }
    },
    validate(raw) {
      const partial = Object.fromEntries(Object.entries({
        interests: interests(raw.interests), pace: choice(raw.pace, 'pace', PACES), budget: choice(raw.budget, 'budget', BUDGETS),
        company: choice(raw.company, 'company', COMPANIES), transport: list(raw.transport, 'transport', 4)
      }).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)));
      if (partial.transport?.some(mode => !TRANSPORTS.includes(mode))) throw new ToolError(`transport admite: ${TRANSPORTS.join(', ')}.`, VISITOR.generic);
      if (!Object.keys(partial).length) throw new ToolError('Indica qué preferencia cambia.', VISITOR.generic);
      return partial;
    },
    async execute(partial, ctx) {
      const merged = preferences({ ...defaults, ...ctx.stored, ...preferences(partial, true) });
      await writePreferences(ctx.db, ctx.owner, merged);
      ctx.stored = merged;
      ctx.prefs = merged;
      const fields = Object.keys(partial);
      return { summary: `Preferencias guardadas: ${fields.join(', ')}.`, event: { type: 'preferences_updated', fields } };
    }
  }
};

/** Tool definitions in Ollama's `tools` format. */
export const toolSchemas = Object.entries(tools).map(([name, tool]) => ({
  type: 'function',
  function: { name, description: tool.description,
    parameters: { type: 'object', properties: tool.parameters, ...(tool.required ? { required: tool.required } : {}) } }
}));

/**
 * Runs one tool call. Refusals (unknown tool, invalid arguments, planner 400s, a repeated revision conflict) come
 * back as { ok: false, error, reason }: `error` for the decision model, `reason` safe to show the visitor. Planner
 * 400 messages only quote catalog names, so they serve as both. Anything else (database) propagates.
 */
export async function runTool(call, ctx) {
  const tool = Object.hasOwn(tools, call.name) ? tools[call.name] : null;
  if (!tool) return { ok: false, error: `La herramienta ${String(call.name).slice(0, 40)} no existe.`, reason: VISITOR.generic };
  try {
    const raw = call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments) ? call.arguments : {};
    const result = await tool.execute(tool.validate(raw, ctx), ctx);
    return { ok: true, summary: result.summary, ...(result.event ? { event: result.event } : {}) };
  } catch (error) {
    if (error instanceof ToolError) return { ok: false, error: error.message, reason: error.reason };
    if (error instanceof ApiError && error.status === 400) return { ok: false, error: error.message, reason: error.message };
    throw error;
  }
}

/**
 * What a call acts on, to tell a correction from a different request: the resolved place, the quick change, or ''
 * for tools without one; null when the target itself is unknown (any later success of that tool then fixes it).
 */
const placeTools = new Set(['add_stop', 'remove_stop', 'replace_stop', 'lock_stop']);
export function callTarget(call) {
  const args = call.arguments && typeof call.arguments === 'object' ? call.arguments : {};
  if (placeTools.has(call.name)) return typeof args.place === 'string' ? resolvePlace(args.place)?.id ?? null : null;
  if (call.name === 'quick_change') return QUICK.includes(args.value) ? args.value : null;
  return '';
}
