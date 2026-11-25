// One conversational turn (feature 5 §4.3): the decision model picks tools, the planner executes them, the
// narrator explains. When the decision model fails, the rules path (§4.6) decides instead.
import { readFileSync } from 'node:fs';
import { places, starts } from './catalog.js';
import { applyMessage } from './chat.js';
import { ApiError } from './http.js';
import { asksForAnotherCity, localStart } from './marbella-scope.js';
import { normalize } from './onboarding.js';
import { logFallback, ollamaClient, OllamaFailure } from './ollama.js';
import { describe, notUnderstood, notUnderstoodChange, outOfScope, suggestionsFor } from './agent-texts.js';
import { matchStop, routeSummary, runTool, toolSchemas } from './agent-tools.js';
import { defaults, validDate, validTime } from './trip-contract.js';
import { plannerPlaces, quickText } from './trip-planner.js';
import { readPreferences, readRoute, routeView } from './trip-store.js';

const decisionPrompt = readFileSync(new URL('./prompts/cacahuete-decision.en.txt', import.meta.url), 'utf8');
const narratorPrompt = readFileSync(new URL('./prompts/cacahuete-agente.es.txt', import.meta.url), 'utf8');
const sentences = new Intl.Segmenter('es', { granularity: 'sentence' });

export const MAX_ROUNDS = 2;
export const MAX_CALLS = 3;
export const HISTORY_TURNS = 10;
export const KEPT_TURNS = 20;

const narrationSchema = {
  type: 'object',
  properties: { text: { type: 'string' }, suggestions: { type: 'array', items: { type: 'string' }, maxItems: 3 } },
  required: ['text', 'suggestions']
};
const catalogLines = plannerPlaces().map(p => `${p.name} (${p.kind}: ${p.categories.join(', ')})`);
const startNames = Object.values(starts).map(s => s.name);
const routeEvents = new Set(['route_created', 'route_changed', 'undone']);

/* ---------- memory ---------- */

async function readTurns(db, owner) {
  const { rows } = await db.query('SELECT role, content FROM agent_turns WHERE owner_key=$1 ORDER BY id DESC LIMIT $2',
    [owner, HISTORY_TURNS]);
  return rows.reverse();
}

async function storeTurn(db, owner, routeId, role, content) {
  await db.query('INSERT INTO agent_turns(owner_key, route_id, role, content) VALUES ($1,$2,$3,$4)',
    [owner, routeId ?? null, role, content.slice(0, 2000)]);
  await db.query(`DELETE FROM agent_turns WHERE owner_key=$1 AND id NOT IN
    (SELECT id FROM agent_turns WHERE owner_key=$1 ORDER BY id DESC LIMIT ${KEPT_TURNS})`, [owner]);
}

/* ---------- context ---------- */

// The phone's wall clock when it is valid, the server's otherwise.
function clientClock(client, now) {
  const pad = n => String(n).padStart(2, '0');
  const serverToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const serverNow = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    today: validDate(client?.today) ? client.today : serverToday,
    now: validTime(client?.now) ? client.now : serverNow
  };
}

function decisionContext(ctx) {
  const { interests, pace, budget, company, transport } = ctx.prefs;
  return {
    today: ctx.client.today, now: ctx.client.now, plan: ctx.premium ? 'premium' : 'free',
    preferences: { interests, pace, budget, company, transport },
    route: routeSummary(ctx.route?.itinerary ?? null), places: catalogLines, starts: startNames
  };
}

/* ---------- decision ---------- */

async function decide(ctx, text, history, ollama) {
  const messages = [
    { role: 'system', content: decisionPrompt },
    { role: 'user', content: JSON.stringify(decisionContext(ctx)) },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: text }
  ];
  const done = new Set();
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let decision;
    try {
      decision = await ollama.decide(messages, toolSchemas);
    } catch (error) {
      // Round 1 failing sends the turn down the rules path; a failed round 2 keeps what round 1 did.
      if (round === 1 || !(error instanceof OllamaFailure)) throw error;
      break;
    }
    const calls = decision.toolCalls.slice(0, MAX_CALLS);
    if (!calls.length) break;
    messages.push({ role: 'assistant', content: '',
      tool_calls: calls.map(call => ({ function: { name: call.name, arguments: call.arguments } })) });
    for (const call of calls) {
      // A second identical call in round 2 (small models repeat themselves) is not executed again.
      const key = call.name + JSON.stringify(call.arguments);
      const result = done.has(key) ? { ok: true, summary: 'Ya hecho en este turno.' } : await execute(ctx, call);
      if (result.ok) done.add(key);
      messages.push({ role: 'tool', tool_name: call.name,
        content: JSON.stringify(result.ok ? { ok: true, summary: result.summary } : { ok: false, error: result.error }) });
    }
  }
}

async function execute(ctx, call) {
  const result = await runTool(call, ctx);
  ctx.calls.push({ name: call.name, ...result });
  if (result.event) ctx.events.push(result.event);
  return result;
}

/* ---------- degraded mode (§4.6) ---------- */

const quickChanges = text => Object.keys(quickText).filter(k => quickText[k].test(text))
  .sort((a, b) => text.search(quickText[a]) - text.search(quickText[b]));
const asksForRoute = /\b(?:ruta|paseo|recorrido|itinerario|plan|visita|ver|conocer)\b/;

const endsAt = /\b(?:acab|termin)\w*\s+(?:a las|sobre las|antes de las|a la)\s+(\d{1,2})(?:[:.h](\d{2}))?\b/;
const removes = /\b(?:quita|quitar|quitame|elimina|eliminar|borra|borrar)\s+(.+)/;
const newRoute = /\b(?:otra|nueva) ruta\b/;

export async function rulesTurn(text, ctx) {
  const words = normalize(text);
  if (/\bdeshac/.test(words)) return execute(ctx, { name: 'undo', arguments: {} });
  // Beyond the spec's list: "acaba a las 14:00" and "quita el museo" also work without the model.
  const end = ctx.routeId ? words.match(endsAt) : null;
  if (end) {
    const hour = Number(end[1]) < 9 ? Number(end[1]) + 12 : Number(end[1]);
    return execute(ctx, { name: 'reschedule', arguments: { to: `${String(hour).padStart(2, '0')}:${end[2] ?? '00'}` } });
  }
  const removal = ctx.routeId ? words.match(removes) : null;
  const stop = removal ? matchStop(removal[1].replace(/[.!?]+$/, ''), ctx.route.itinerary) : null;
  if (stop) return execute(ctx, { name: 'remove_stop', arguments: { place: stop.name } });
  const quick = ctx.routeId && !removal ? quickChanges(words).slice(0, 2) : [];
  if (quick.length) {
    for (const value of quick) await execute(ctx, { name: 'quick_change', arguments: { value } });
    return;
  }
  // Same mapping as interpretRequest: the rule engine's profile fields become planner overrides.
  const { updated } = applyMessage(text, {});
  const interests = updated.interests?.filter(i => i !== 'familia').map(i => (i === 'arte' ? 'museos' : i));
  const start = updated.start ? starts[updated.start].name : localStart(text);
  // With a route on screen only a new duration or start (or "otra ruta") means a new route; interests alone do not.
  const create = ctx.routeId
    ? !removal && (Boolean(updated.minutes || start) || newRoute.test(words))
    : Boolean(updated.minutes || start || interests?.length) || asksForRoute.test(words);
  if (create) {
    const args = {
      durationMinutes: updated.minutes, start,
      interests: interests?.length ? interests : undefined,
      pace: updated.pace ? { tranquilo: 'relajado', normal: 'equilibrado', activo: 'intenso' }[updated.pace] : undefined,
      budget: updated.budget ? { gratis: 'bajo', bajo: 'bajo', medio: 'medio', cualquiera: 'alto' }[updated.budget] : undefined,
      company: updated.interests?.includes('familia') ? 'con_ninos' : undefined
    };
    if (args.durationMinutes !== undefined && (args.durationMinutes < 20 || args.durationMinutes > 480)) delete args.durationMinutes;
    return execute(ctx, { name: 'create_route', arguments: args });
  }
  ctx.events.push({ type: 'rejected', reason: ctx.routeId ? notUnderstoodChange : notUnderstood });
}

/* ---------- narration ---------- */

function narrationInput(ctx, text, route) {
  const mentioned = normalize(text);
  const ids = new Set(route?.stops.map(s => s.placeId));
  const details = places.filter(p => ids.has(p.id) || [p.name, ...p.aliases].some(alias => mentioned.includes(normalize(alias))))
    .map(({ name, description, area, hours, price, rating }) => ({ name, description, area, hours, price, rating }));
  const { interests, pace, budget, company, transport } = ctx.prefs;
  return {
    message: text,
    events: ctx.events,
    results: ctx.calls.map(call => ({ tool: call.name, ...(call.ok ? { summary: call.summary } : { error: call.error }) })),
    route: routeSummary(route),
    places: details,
    preferences: { interests, pace, budget, company, transport },
    facts: ['Para guardar la ruta, el visitante pulsa «Guardar» en la pantalla de la ruta.']
  };
}

const cleanSuggestions = value => (Array.isArray(value) ? [...new Set(value
  .filter(item => typeof item === 'string').map(item => item.trim().replace(/^["«]|["»]$/g, ''))
  .filter(item => item && item.length <= 60))].slice(0, 3) : []);

async function narrate(ctx, text, route, ollama) {
  let reply;
  try {
    reply = await ollama.narrate([
      { role: 'system', content: narratorPrompt },
      { role: 'user', content: JSON.stringify(narrationInput(ctx, text, route)) }
    ], narrationSchema);
  } catch (error) {
    if (error instanceof OllamaFailure) return null;
    throw error;
  }
  const answer = typeof reply?.text === 'string' ? reply.text.trim() : '';
  if (!answer) {
    logFallback('narrate', 'empty');
    return null;
  }
  if ([...sentences.segment(answer)].length > 6) {
    logFallback('narrate', 'too-long');
    return null;
  }
  return { text: answer, suggestions: cleanSuggestions(reply.suggestions) };
}

/* ---------- the turn ---------- */

// Tool errors the model never fixed (no later success of the same tool) become `rejected` events.
function finishEvents(ctx) {
  const reasons = new Set();
  ctx.calls.forEach((call, i) => {
    if (!call.ok && !ctx.calls.slice(i + 1).some(later => later.ok && later.name === call.name)) reasons.add(call.error);
  });
  for (const reason of reasons) ctx.events.push({ type: 'rejected', reason });
  if (!ctx.events.length) ctx.events.push({ type: 'answered' });
}

// Stored for the next decisions: one compact line per action, then what Cacahuete said.
function compactTurn(ctx, text) {
  const lines = ctx.calls.map(call => {
    const route = ctx.route?.itinerary;
    if (!call.ok) return `[acción] ${call.name} → error: ${call.error}`;
    if (call.event?.type === 'preferences_updated') return `[acción] ${call.name} → ${call.event.fields.join(', ')}`;
    return `[acción] ${call.name} → ${route ? `${route.name} (${route.stops.length} paradas)` : 'hecho'}`;
  });
  return [...lines, text].join('\n');
}

/**
 * Runs one `agent` turn. `authorize` (the quota check) runs once, before any model call, and its quota is
 * returned; without it, `premium` decides the stop cap.
 */
export async function runAgentTurn({
  db, owner, text, routeId, client, authorize, premium = false, ollama = ollamaClient, now = () => new Date()
}) {
  text = text.trim();
  if (asksForAnotherCity(text)) {
    return { text: outOfScope, suggestions: suggestionsFor([], null), events: [{ type: 'rejected', reason: outOfScope }], source: 'rules' };
  }
  const stored = await readPreferences(db, owner);
  let row = null;
  if (routeId) {
    row = await readRoute(db, routeId, owner);
    if (!row) throw new ApiError(404, 'ROUTE_NOT_FOUND', 'No se ha encontrado esa ruta.');
  }
  const history = await readTurns(db, owner);
  const quota = authorize ? await authorize() : undefined;
  const ctx = {
    db, owner, premium: quota ? quota.plan === 'premium' : premium, client: clientClock(client, now()),
    stored, prefs: { ...defaults, ...stored }, routeId: row ? routeId : null, route: row, events: [], calls: []
  };
  await storeTurn(db, owner, ctx.routeId, 'user', text);

  let source = 'agent';
  let failure = null;
  try {
    await decide(ctx, text, history, ollama);
  } catch (error) {
    if (!(error instanceof OllamaFailure)) throw error;
    failure = error;
    source = 'rules';
    await rulesTurn(text, ctx);
  }
  finishEvents(ctx);

  const route = ctx.route ? routeView(ctx.route) : null;
  // In degraded mode the narrator is still worth a try unless Ollama is down or saturated.
  const tryNarrator = !failure || !['unreachable', 'queue'].includes(failure.reason);
  const narration = tryNarrator ? await narrate(ctx, text, route, ollama) : null;
  const reply = narration?.text ?? describe(ctx.events, route);
  const suggestions = narration?.suggestions.length ? narration.suggestions : suggestionsFor(ctx.events, route);
  await storeTurn(db, owner, ctx.routeId, 'assistant', compactTurn(ctx, reply));

  return {
    text: reply, suggestions,
    ...(route && ctx.events.some(e => routeEvents.has(e.type)) ? { route } : {}),
    ...(ctx.routeId ? { routeId: ctx.routeId } : {}),
    events: ctx.events, source,
    ...(quota ? { quota } : {})
  };
}
