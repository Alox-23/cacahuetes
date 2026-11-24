import { randomUUID } from 'node:crypto';
import { places, starts } from './catalog.js';
import { genericPlaces, sampleCities } from './destination-catalog.js';
import { ApiError, badRequest, object } from './http.js';
import { normalize, interpretWithRules, questions } from './onboarding.js';
import { walkingMinutes } from './route-features.js';
import { buildRoutes } from './routes.js';
import { clock, minutes, shortText } from './trip-contract.js';

const paceMap = { relajado: 'tranquilo', equilibrado: 'normal', intenso: 'activo' };
const interestMap = { arquitectura: 'historia', museos: 'arte', arte_urbano: 'arte', vida_nocturna: 'gastronomia' };
const accessibility = p => p.needs.some(n => /silla de ruedas|sin escalones|sin escaleras|movilidad reducida/.test(normalize(n)));
const marbella = {
  name: 'Marbella', legs: {}, places: [...places.map((p, order) => ({
    ...p, kind: p.id === 'mercado-central' ? 'food' : 'sight', paid: p.budget !== 'gratis',
    why: p.description, aliases: [p.id], order,
    categories: [...p.tags, ...Object.keys(interestMap).filter(i => p.tags.includes(interestMap[i]))]
  })), { ...genericPlaces.find(p => p.kind === 'pause'), id: 'marbella-cafe' }]
};
const catalogs = [marbella, ...sampleCities];
function catalogFor(name) {
  return catalogs.find(c => normalize(c.name) === normalize(name)) ?? { name, places: genericPlaces, legs: {} };
}
function asPlace(p) {
  return { id: p.id, name: p.name, categories: p.categories, why: p.why,
    ...(p.lat !== undefined ? { lat: p.lat, lon: p.lon } : {}) };
}
export function lookupPlace(id) {
  const place = catalogs.flatMap(c => c.places).concat(genericPlaces).find(p => p.id === id);
  if (!place) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Lugar desconocido.');
  return asPlace(place);
}
function stopFor(p) {
  return { order: 0, placeId: p.id, name: p.name, arrive: '', visitMinutes: p.visitMinutes, locked: false };
}
function matchesLabel(p, label) {
  const key = normalize(label);
  return [p.name, p.id, ...p.aliases].some(alias => normalize(alias) === key);
}

function routeName(request) {
  const duration = minutes(request.timeWindow.to) - minutes(request.timeWindow.from);
  if (duration >= 540) return `Un día en ${request.city}`;
  const hours = Math.floor(duration / 60), rest = duration % 60;
  const label = hours === 0 ? `${rest} min` : rest ? `${hours} h ${rest} min` : hours === 1 ? '1 hora' : `${hours} horas`;
  return `${request.city} en ${label}`;
}
function leg(catalog, a, b, prefs) {
  const segment = catalog.legs[`${a.id}|${b.id}`] ?? catalog.legs[`${b.id}|${a.id}`];
  const walk = a.kind === 'pause' || b.kind === 'pause' ? 3 : segment?.walk ??
    (a.lat !== undefined && b.lat !== undefined ? walkingMinutes(a, b, paceMap[prefs.pace]) : 15);
  const modes = prefs.transport;
  if (!modes.length || (modes.includes('a_pie') && (walk <= 20 || modes.length === 1))) return { mode: 'a_pie', minutes: walk };
  const mode = modes.find(m => m !== 'a_pie') ?? 'a_pie';
  return { mode, minutes: mode === 'bici' ? Math.ceil(walk / 3) : segment?.transit ?? Math.ceil(walk / 2) };
}

function anchor(catalog, label) {
  const key = normalize(label);
  const match = catalog.places.find(p => [p.id, p.name, ...p.aliases].some(alias => normalize(alias) === key));
  if (match || catalog !== marbella) return match;
  const start = interpretWithRules(questions[0], label);
  return start ? { ...starts[start], id: start } : undefined;
}

// Only estimate an approach leg if the label identifies an actual point in the catalog.
function schedule(route, catalog, prefs, oldLegs = new Map()) {
  let time = minutes(route.request.timeWindow.from);
  const points = route.stops.map(s => catalog.places.find(p => p.id === s.placeId));
  const start = anchor(catalog, route.request.start.label);
  if (start && start.id !== points[0]?.id && points.length) time += leg(catalog, start, points[0], prefs).minutes;
  route.stops.forEach((s, i) => {
    s.order = i + 1;
    s.arrive = clock(time);
    time += s.visitMinutes;
    if (i + 1 === points.length) delete s.travelToNext;
    else {
      const pair = points[i].id + '|' + points[i + 1].id;
      s.travelToNext = oldLegs.get(pair) ?? leg(catalog, points[i], points[i + 1], prefs);
      time += s.travelToNext.minutes;
    }
  });
  return time <= minutes(route.request.timeWindow.to);
}

function marbellaRanking(request, prefs, premium) {
  const start = interpretWithRules(questions[0], request.start.label) ?? 'naranjos';
  const interests = prefs.interests.map(i => Object.hasOwn(interestMap, i) ? interestMap[i] : i);
  if (prefs.company === 'con_ninos') interests.push('familia');
  const profile = { start, minutes: minutes(request.timeWindow.to) - minutes(request.timeWindow.from),
    interests, budget: prefs.budget === 'alto' ? 'cualquiera' : prefs.budget, pace: paceMap[prefs.pace],
    avoidStairs: accessibility(prefs), crowd: 'indiferente' };
  const { route } = buildRoutes({ profile, avoidStops: [], scenario: null }, premium);
  return route.stops.map(s => s.id);
}

export function createTrip(request, prefs, premium) {
  const catalog = catalogFor(request.city);
  const cap = premium ? 5 : 3;
  const ranked = catalog === marbella ? marbellaRanking(request, prefs, premium) : [];
  const score = p => (ranked.includes(p.id) ? 100 - ranked.indexOf(p.id) : 0)
    + p.categories.filter(c => prefs.interests.includes(c)).length * 4
    + (prefs.company === 'con_ninos' && p.kids ? 2 : 0) - (prefs.budget === 'bajo' && p.paid ? 2 : 0)
    - (p.kind === 'food' ? 6 : 0);
  const candidates = catalog.places.filter(p => p.kind !== 'pause' && !(p.stairs && accessibility(prefs)))
    .sort((a, b) => score(b) - score(a) || a.order - b.order);
  const required = new Set(request.mustInclude.map(label => {
    const key = normalize(label);
    const match = candidates.find(p => matchesLabel(p, label))
      ?? (key === 'tapas' ? candidates.find(p => p.kind === 'food') : undefined);
    if (!match) throw badRequest(`No hay una parada disponible para «${label}» en ${request.city}.`);
    return match;
  }));
  const route = { id: randomUUID(), name: routeName(request), request, stops: [], version: 1, saved: false, favorite: false };
  const suggested = catalog === marbella && ranked.length ? ranked.map(id => candidates.find(p => p.id === id)) : candidates;
  for (const p of new Set([...required, ...suggested])) {
    if (route.stops.length >= cap) {
      if (required.has(p)) throw badRequest('Hay demasiadas paradas imprescindibles para este plan.');
      break;
    }
    const previous = route.stops;
    route.stops = [...previous, stopFor(p)];
    if (catalog !== marbella) {
      route.stops.sort((a, b) => catalog.places.find(p => p.id === a.placeId).order - catalog.places.find(p => p.id === b.placeId).order);
    }
    if (!schedule(route, catalog, prefs)) {
      route.stops = previous;
      if (required.has(p)) throw badRequest('Los imprescindibles no caben en esa franja horaria.');
    }
  }
  if (!route.stops.length) throw badRequest('Amplía la franja horaria para que quepa al menos una visita.');
  schedule(route, catalog, prefs);
  return route;
}

function stopIndex(route, order) {
  const i = route.stops.findIndex(s => s.order === order);
  if (i < 0) throw badRequest('No existe esa parada en la ruta.');
  return i;
}

function replacements(route, i, catalog, prefs) {
  const ids = new Set(route.stops.map(s => s.placeId));
  const old = catalog.places.find(p => p.id === route.stops[i].placeId);
  const shared = p => p.categories.filter(c => old.categories.includes(c)).length;
  return catalog.places.filter(p => p.kind !== 'pause' && !ids.has(p.id) && !(p.stairs && accessibility(prefs)))
    .sort((a, b) => shared(b) - shared(a) || a.order - b.order);
}
export function alternatives(route, order, prefs) {
  const i = stopIndex(route, order);
  const catalog = catalogFor(route.request.city);
  return replacements(route, i, catalog, prefs).filter(p => {
    const candidate = structuredClone(route);
    candidate.stops[i] = stopFor(p);
    return schedule(candidate, catalog, prefs, existingLegs(route));
  }).slice(0, 3).map(asPlace);
}

const quickText = {
  menos_caminar: /menos caminar|caminar menos|andar menos|menos andar|menos a pie/,
  anadir_pausa: /pausa|cafe|descans/,
  mas_barato: /barat|ahorrar|economic/,
  mas_comida: /comida|comer|tapas|restaurante/
};

function existingLegs(route) {
  return new Map(route.stops.slice(0, -1).map((s, i) => [s.placeId + '|' + route.stops[i + 1].placeId, s.travelToNext]));
}

export function refineTrip(route, action, prefs) {
  object(action, 'action');
  const catalog = catalogFor(route.request.city);
  const legs = existingLegs(route);
  if (['remove_stop', 'lock_stop', 'swap_stop'].includes(action.type)) {
    const i = stopIndex(route, action.order);
    const s = route.stops[i];
    if (action.type === 'lock_stop') s.locked = !s.locked;
    else {
      if (s.locked) throw badRequest('Desfija la parada antes de cambiarla.');
      if (action.type === 'remove_stop') {
        if (route.stops.length === 1) throw badRequest('La ruta necesita al menos una parada.');
        route.stops.splice(i, 1);
      } else {
        const p = replacements(route, i, catalog, prefs).find(p => p.id === action.placeId);
        if (!p) throw badRequest('La alternativa no está disponible.');
        route.stops[i] = stopFor(p);
      }
    }
  } else {
    let changes;
    if (action.type === 'text') {
      const text = normalize(shortText(action.value, 'text', 1000));
      changes = Object.keys(quickText).filter(k => quickText[k].test(text)).sort((a, b) => text.search(quickText[a]) - text.search(quickText[b]));
    } else if (action.type === 'quick' && typeof action.value === 'string' && Object.hasOwn(quickText, action.value)) {
      changes = [action.value];
    }
    if (!changes?.length) throw badRequest('No he reconocido el cambio de ruta.');
    for (const change of changes) {
      if (change === 'menos_caminar') {
        for (const [pair, l] of legs) if (l.mode === 'a_pie' && l.minutes > 15) {
          legs.set(pair, { mode: 'transporte_publico', minutes: Math.ceil(l.minutes / 2) });
        }
      } else if (change === 'mas_barato') {
        const i = route.stops.findIndex(s => !s.locked && catalog.places.some(p => p.id === s.placeId && p.paid &&
          !route.request.mustInclude.some(label => matchesLabel(p, label) || (normalize(label) === 'tapas' && p.kind === 'food'))));
        if (i >= 0) {
          const free = replacements(route, i, catalog, prefs).find(p => !p.paid);
          if (free) route.stops[i] = stopFor(free);
        }
      } else {
        const kind = change === 'mas_comida' ? 'food' : 'pause';
        const p = catalog.places.find(p => p.kind === kind && !route.stops.some(s => s.placeId === p.id));
        if (p) route.stops.splice(Math.min(2, route.stops.length), 0, stopFor(p));
      }
    }
  }
  if (!schedule(route, catalog, prefs, legs)) throw badRequest('El cambio no cabe en la franja horaria.');
  route.version++;
  return route;
}
