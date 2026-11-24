import { listPlaces, places, starts } from './catalog.js';
import { badRequest } from './http.js';
import { nextQuestion, validateProfile } from './onboarding.js';

const speeds = { tranquilo: 3, normal: 4, activo: 5 };
const budgets = { gratis: 0, bajo: 1, medio: 2, cualquiera: 3 };

function walkingMinutes(from, to, pace) {
  const rad = Math.PI / 180;
  const lat = (to.lat - from.lat) * rad;
  const lon = (to.lon - from.lon) * rad;
  const angle = Math.sin(lat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(lon / 2) ** 2;
  const kilometres = 12_742 * Math.asin(Math.min(1, Math.sqrt(angle)));
  return Math.ceil(kilometres * 1.35 / speeds[pace] * 60);
}

export function routeInput(body, savedProfile = {}) {
  const profile = validateProfile(body.profile ?? savedProfile);
  if (nextQuestion(profile)) throw badRequest('Completa primero el perfil de Cacahuete.');
  const avoidStops = body.avoidStops ?? [];
  if (!Array.isArray(avoidStops) || avoidStops.length > places.length ||
    !avoidStops.every((id) => places.some((place) => place.id === id))) {
    throw badRequest('avoidStops debe contener identificadores del catálogo.');
  }
  const scenario = body.scenario ?? null;
  if (scenario !== null && (scenario !== 'busy-centre' || process.env.DEMO_SCENARIOS !== 'true')) {
    throw badRequest('El escenario de simulación no está disponible.');
  }
  return { profile, avoidStops, scenario };
}

function directions(from, to) {
  const params = new URLSearchParams({
    api: '1', origin: `${from.lat},${from.lon}`, destination: `${to.lat},${to.lon}`, travelmode: 'walking'
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

function describeStop(place) {
  const match = place.matches.join(', ').replace('gastronomia', 'gastronomía');
  return `Encaja con tus intereses: ${match}.`;
}

function publicRoute(path, start, scenario) {
  let origin = start;
  const stops = path.stops.map(({ place, walk, elapsed }) => {
    const stop = {
      id: place.id, name: place.name, description: place.description, area: place.area,
      lat: place.lat, lon: place.lon, visitMinutes: place.visitMinutes, walkMinutes: walk,
      estimatedArrivalMinutes: elapsed - place.visitMinutes, budget: place.budget,
      sponsored: place.sponsored, crowd: place.crowd, reason: describeStop(place),
      directionsUrl: directions(origin, place)
    };
    origin = place;
    return stop;
  });
  return {
    start,
    stops,
    walkMinutes: path.walk,
    totalMinutes: path.elapsed,
    matchedInterests: [...path.coverage],
    crowdSource: scenario ? 'simulated' : 'unavailable',
    walkingTimeSource: 'estimate',
    summary: stops.length
      ? `${stops.length} ${stops.length === 1 ? 'parada' : 'paradas'} en unos ${path.elapsed} min. Terminas en ${stops.at(-1).name}.`
      : 'No he encontrado paradas que encajen. Prueba con más tiempo o amplía tus preferencias.'
  };
}

export function buildRoutes({ profile, avoidStops, scenario }, premium) {
  const start = starts[profile.start];
  const candidates = listPlaces(scenario).map((place) => ({
    ...place, matches: place.tags.filter((tag) => profile.interests.includes(tag))
  })).filter((place) =>
    place.matches.length &&
    !avoidStops.includes(place.id) &&
    budgets[place.budget] <= budgets[profile.budget] &&
    (!profile.avoidStairs || !place.stairs) &&
    (profile.crowd !== 'evitar' || place.crowd !== 'alta') &&
    walkingMinutes(start, place, profile.pace) + place.visitMinutes <= profile.minutes
  );
  const maxStops = premium ? 5 : 3;
  const empty = { last: start, stops: [], elapsed: 0, walk: 0, score: 0, partners: 0, coverage: new Set() };

  function append(path, place) {
    if (premium && place.sponsored && path.partners) return null;
    const walk = walkingMinutes(path.last, place, profile.pace);
    const elapsed = path.elapsed + walk + place.visitMinutes;
    if (elapsed > profile.minutes) return null;
    const coverage = new Set([...path.coverage, ...place.matches]);
    const points = 4 + place.matches.length * 2 + (coverage.size - path.coverage.size) * 6 -
      walk * 0.22 + (place.sponsored ? (premium ? -3.5 : 1.5) : 0);
    return {
      last: place, stops: [...path.stops, { place, walk, elapsed }], elapsed, walk: path.walk + walk,
      score: path.score + points, partners: path.partners + Number(place.sponsored), coverage
    };
  }

  if (!premium) {
    let path = empty;
    const remaining = new Set(candidates);
    for (let i = 0; i < maxStops; i++) {
      const best = [...remaining].map((place) => append(path, place)).filter(Boolean)
        .sort((a, b) => b.score - a.score || a.elapsed - b.elapsed)[0];
      if (!best || best.score <= path.score) break;
      path = best;
      remaining.delete(best.last);
    }
    return { route: publicRoute(path, start, scenario), alternatives: [] };
  }

  // Explore candidate orders and keep only the best order for each set of stops.
  const combinations = new Map();
  function explore(path, remaining) {
    if (path.stops.length) {
      const key = path.stops.map(({ place }) => place.id).sort().join(',');
      if (!combinations.has(key) || path.score > combinations.get(key).score) combinations.set(key, path);
    }
    if (path.stops.length === maxStops) return;
    for (const place of remaining) {
      const next = append(path, place);
      if (next) explore(next, remaining.filter((other) => other !== place));
    }
  }
  explore(empty, candidates);
  const sorted = [...combinations.values()].sort((a, b) => b.score - a.score || a.elapsed - b.elapsed);
  const [best = empty, ...rest] = sorted;
  const primaryIds = new Set(best.stops.map(({ place }) => place.id));
  const different = rest.find((path) => path.stops.some(({ place }) => !primaryIds.has(place.id)));
  const shorter = rest.find((path) =>
    path !== different && path.elapsed <= best.elapsed - 10 && path.coverage.size === best.coverage.size
  );
  return {
    route: publicRoute(best, start, scenario),
    alternatives: [
      ...(different ? [{ ...publicRoute(different, start, scenario), variant: 'different-stops' }] : []),
      ...(shorter ? [{ ...publicRoute(shorter, start, scenario), variant: 'shorter' }] : [])
    ]
  };
}
