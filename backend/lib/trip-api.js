import { createHash } from 'node:crypto';
import { asksForAnotherCity } from './marbella-scope.js';
import { narrate } from './llm.js';
import { starts } from './catalog.js';
import { applyMessage } from './chat.js';
import { ApiError, badRequest, readJson } from './http.js';
import { authorizeAgent, visitorNetwork } from './quota.js';
import { defaults, preferences, shortText, tripRequest, validateRating } from './trip-contract.js';
import { alternatives, createTrip, lookupPlace, refineTrip } from './trip-planner.js';
import { runAgentTurn } from './agent.js';
import {
  historyUpdate, insertRoute, localTrip, readPreferences, readRoute, routeView as view, undoUpdate, updateRoute, writePreferences
} from './trip-store.js';

export const tripMethods = new Map([
  ['getPreferences', 'GET'], ['savePreferences', 'PUT'], ['createRoute', 'POST'], ['refineRoute', 'POST'],
  ['routeQuestion', 'POST'], ['interpretRequest', 'POST'], ['refineConversation', 'POST'], ['undo', 'POST'], ['getRoute', 'GET'], ['listRoutes', 'GET'], ['saveRoute', 'POST'],
  ['deleteRoute', 'DELETE'], ['rateRoute', 'PUT'], ['getPlace', 'GET'], ['getAlternatives', 'GET'], ['agent', 'POST']
]);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function guestOwner(request) {
  const token = request.headers.get('x-guest-token');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) throw badRequest('Falta el identificador de invitado del navegador.');
  return 'guest:' + createHash('sha256').update(token).digest('hex');
}
export async function claimGuest(db, owner, accountId) {
  // Moving the drafts and the agent's conversation and adopting preferences share a single PostgreSQL statement.
  // An existing account keeps its preferences; a draft retains its own planning snapshot.
  await db.query(`WITH moved AS (
    UPDATE travel_routes SET owner_key=$2 WHERE owner_key=$1
  ), turns AS (
    UPDATE agent_turns SET owner_key=$2 WHERE owner_key=$1
  ), previous AS (
    DELETE FROM travel_preferences WHERE owner_key=$1 RETURNING preferences
  )
  INSERT INTO travel_preferences(owner_key, preferences) SELECT $2, preferences FROM previous
  ON CONFLICT(owner_key) DO NOTHING`, [owner, accountId]);
}
export const guestForLogin = request => request.headers.has('x-guest-token') ? guestOwner(request) : null;

const notFound = () => new ApiError(404, 'ROUTE_NOT_FOUND', 'No se ha encontrado esa ruta.');

/** `options.ollama` replaces the agent's Ollama client (tests). */
export async function tripAction(db, action, request, account, localIp, options = {}) {
  const params = new URL(request.url).searchParams;
  if (action === 'getPlace') return lookupPlace(params.get('id'));
  const owner = account?.id ?? guestOwner(request);
  if (action === 'getPreferences') return readPreferences(db, owner);
  if (action === 'savePreferences') {
    await writePreferences(db, owner, preferences(await readJson(request)));
    return;
  }
  if (action === 'listRoutes') {
    const { rows } = await db.query(`SELECT itinerary,saved FROM travel_routes WHERE owner_key=$1 AND ${localTrip} ORDER BY created_at DESC`, [owner]);
    return rows.map(view);
  }
  const authorize = () => authorizeAgent(db, account, visitorNetwork(request, localIp));
  if (action === 'agent') {
    // Feature 5: one conversational turn; the model picks planner actions, the planner computes.
    const body = await readJson(request);
    const text = shortText(body.text, 'text', 500);
    if (asksForAnotherCity(text)) {
      throw new ApiError(400, 'UNSUPPORTED_CITY', 'Cacahuete prepara rutas exclusivamente por Marbella.');
    }
    const routeId = body.routeId ?? undefined;
    if (routeId !== undefined && (typeof routeId !== 'string' || !uuid.test(routeId))) throw notFound();
    return runAgentTurn({ db, owner, text, routeId, client: body.client, authorize, ollama: options.ollama });
  }
  if (action === 'interpretRequest') {
    const body = await readJson(request);
    const text = shortText(body.text, 'text', 500);
    if (asksForAnotherCity(text)) throw badRequest('Cacahuete prepara rutas exclusivamente por Marbella.');
    await authorize();
    const { updated, source } = applyMessage(text, {});
    const overrides = {};
    if (updated.pace) overrides.pace = { tranquilo: 'relajado', normal: 'equilibrado', activo: 'intenso' }[updated.pace];
    if (updated.budget) overrides.budget = { gratis: 'bajo', bajo: 'bajo', medio: 'medio', cualquiera: 'alto' }[updated.budget];
    if (updated.avoidStairs !== undefined) overrides.needs = updated.avoidStairs ? ['sin escaleras'] : [];
    if (updated.interests?.includes('familia')) overrides.company = 'con_ninos';
    const interests = updated.interests?.filter(i => i !== 'familia').map(i => i === 'arte' ? 'museos' : i);
    if (interests?.length) overrides.interests = interests;
    const openQuestion = /[¿?]|^(?:cuéntame|dime|háblame|qué|cómo|cuándo|cuánto|dónde)\b/iu.test(text);
    const message = openQuestion ? await narrate(text, { ...await readPreferences(db, owner), ...updated }, null) : null;
    return { ...(message && { message }), overrides, durationMinutes: updated.minutes, start: updated.start ? { label: starts[updated.start].name } : undefined,
      interpretation: source };
  }
  if (action === 'createRoute') {
    const input = tripRequest(await readJson(request));
    const prefs = { ...defaults, ...await readPreferences(db, owner), ...input.overrides };
    const quota = await authorize();
    const route = createTrip(input, prefs, quota.plan === 'premium');
    await insertRoute(db, owner, route, prefs);
    return route;
  }
  const id = params.get('id');
  if (!id || !uuid.test(id)) throw notFound();
  const key = [id, owner];
  if (action === 'deleteRoute') {
    await db.query('DELETE FROM travel_routes WHERE id=$1 AND owner_key=$2', key);
    return;
  }
  if (action === 'saveRoute') {
    if (!account) throw new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión para guardar la ruta.');
    const { rows } = await db.query(`UPDATE travel_routes SET saved=true WHERE id=$1 AND owner_key=$2 AND ${localTrip} RETURNING itinerary,saved`, key);
    if (!rows[0]) throw notFound();
    return view(rows[0]);
  }
  const row = await readRoute(db, id, owner);
  if (!row) throw notFound();
  if (action === 'routeQuestion') {
    const text = shortText((await readJson(request)).text, 'text', 500);
    if (asksForAnotherCity(text)) throw badRequest('Cacahuete prepara rutas exclusivamente por Marbella.');
    await authorize();
    const { stops, name, request: trip } = row.itinerary;
    return { message: await narrate(text, row.preferences, { stops, name, timeWindow: trip.timeWindow }) };
  }
  if (action === 'getRoute') return view(row);
  if (action === 'getAlternatives') return alternatives(row.itinerary, Number(params.get('order')), row.preferences);

  // Compare revisions so simultaneous edits cannot overwrite one another or undo the wrong version.
  let update;
  let value;
  let steps;
  if (action === 'rateRoute') {
    value = JSON.stringify(validateRating(await readJson(request), row.itinerary.stops));
    update = 'rating=$4::jsonb';
  } else if (action === 'undo') {
    update = undoUpdate;
    if (row.itinerary.version === 1) return view(row);
  } else {
    const body = await readJson(request);
    let next = row.itinerary;
    if (action === 'refineConversation') {
      if (!Array.isArray(body.changes) || body.changes.length < 1 || body.changes.length > 4) {
        throw badRequest('Envía de uno a cuatro cambios.');
      }
      if (body.version !== next.version) throw new ApiError(409, 'ROUTE_CHANGED', 'La ruta ha cambiado. Vuelve a abrirla.');
      steps = body.changes.map(value => {
        next = refineTrip(structuredClone(next), { type: 'quick', value }, row.preferences);
        next.version = body.version + 1;
        return next;
      });
    } else {
      next = refineTrip(next, body, row.preferences);
    }
    await authorize();
    value = JSON.stringify(next);
    update = historyUpdate;
  }
  const updated = await updateRoute(db, id, owner, row.revision, update, value);
  if (!updated) throw new ApiError(409, 'ROUTE_CHANGED', 'La ruta ha cambiado. Vuelve a abrirla.');
  if (steps) return steps.map(route => ({ ...route, saved: updated.saved }));
  if (action !== 'rateRoute') return view(updated);
}
