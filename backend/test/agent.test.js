import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { runAgentTurn } from '../lib/agent.js';
import { describe as describeEvents, suggestionsFor } from '../lib/agent-texts.js';
import { closestPlaces, nextQuarter, runTool, toolSchemas } from '../lib/agent-tools.js';
import { createOllamaClient } from '../lib/ollama.js';
import { applySchema } from '../lib/schema.js';
import { claimGuest } from '../lib/trip-api.js';
import { defaults, tripRequest } from '../lib/trip-contract.js';
import { createTrip } from '../lib/trip-planner.js';
import { insertRoute, readRoute } from '../lib/trip-store.js';

const db = new PGlite();
before(() => applySchema(db));
after(() => db.close());

const client = { today: '2026-12-10', now: '11:40' };
const call = (name, args = {}) => ({ function: { name, arguments: args } });
const tools = (...calls) => ({ tool_calls: calls });
const say = (text, suggestions = []) => ({ content: JSON.stringify({ text, suggestions }) });
const none = { content: 'Texto del modelo de decisión que nadie debe ver.' };
const hang = (body, init) => new Promise((_, reject) => {
  init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
});
let owners = 0;
const newOwner = () => `guest:test-${++owners}`;

/** Fake Ollama scripted by call order: each step is a message, a Response or a function of the request. */
function fakeOllama(script, options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const step = script.shift();
    if (!step) throw new Error('unexpected Ollama call');
    const out = typeof step === 'function' ? await step(body, init) : step;
    if (out instanceof Response) return out;
    return Response.json({ message: { role: 'assistant', content: '', ...out }, done_reason: 'stop' });
  };
  return { calls, script, ollama: createOllamaClient({ fetchImpl, agentModel: 'tiny', model: 'narrator', ...options }) };
}

// Fallback warnings are expected in several tests; collect them instead of printing them.
async function quietly(run) {
  const original = console.warn;
  const logged = [];
  console.warn = (...args) => logged.push(args.join(' '));
  try {
    return { result: await run(), logged };
  } finally {
    console.warn = original;
  }
}

async function seedRoute(owner, from = '10:00', to = '15:00') {
  const request = tripRequest({ city: 'Marbella', date: '2026-12-10', timeWindow: { from, to },
    start: { label: 'Plaza de los Naranjos' }, mustInclude: [] });
  const route = createTrip(request, defaults, false);
  await insertRoute(db, owner, route, defaults);
  return route;
}
const turns = async owner => (await db.query('SELECT role, content, route_id FROM agent_turns WHERE owner_key=$1 ORDER BY id', [owner])).rows;

test('(a) crear con valores por defecto: eventos, suposiciones, memoria y poda', async () => {
  const owner = newOwner();
  for (let i = 0; i < 25; i++) {
    await db.query("INSERT INTO agent_turns(owner_key, role, content) VALUES ($1, 'user', $2)", [owner, `viejo ${i}`]);
  }
  const fake = fakeOllama([tools(call('create_route', { assumptions: ['inventado'] })), none,
    say('Te he preparado una ruta de tres horas. He supuesto hoy y salida desde la Plaza de los Naranjos.', ['Menos caminar', 'x'.repeat(80)])]);
  const reply = await runAgentTurn({ db, owner, text: 'Quiero una ruta', client, ollama: fake.ollama });

  assert.equal(reply.source, 'agent');
  assert.equal(reply.events.length, 1);
  const [event] = reply.events;
  assert.equal(event.type, 'route_created');
  assert.deepEqual(event.assumptions, ['hoy', 'salida a las 11:45', '3 horas', 'salida desde Plaza de los Naranjos']);
  assert.equal(reply.routeId, event.routeId);
  assert.equal(reply.route.id, event.routeId);
  assert.deepEqual(reply.route.request.timeWindow, { from: '11:45', to: '14:45' });
  assert.equal(reply.route.request.date, '2026-12-10');
  assert.equal(reply.route.saved, false);
  assert.match(reply.text, /tres horas/);
  assert.deepEqual(reply.suggestions, ['Menos caminar']);
  assert.ok(!JSON.stringify(reply).includes('nadie debe ver'));

  // Decision call: small model, tools, context before the history, the visitor's text last.
  const [decision, second, narration] = fake.calls;
  assert.equal(decision.model, 'tiny');
  assert.deepEqual(decision.tools.map(t => t.function.name),
    ['create_route', 'reschedule', 'add_stop', 'remove_stop', 'replace_stop', 'lock_stop', 'quick_change', 'undo', 'update_preferences']);
  assert.equal(decision.messages[0].role, 'system');
  assert.match(decision.messages[0].content, /only act through the tools/);
  const context = JSON.parse(decision.messages[1].content);
  assert.equal(context.today, '2026-12-10');
  assert.equal(context.now, '11:40');
  assert.equal(context.route, null);
  assert.equal(context.places.length, 21);
  assert.ok(context.starts.includes('Puerto Banús'));
  assert.equal(decision.messages.length, 2 + 10 + 1);
  assert.equal(decision.messages.at(-1).content, 'Quiero una ruta');
  // Round 2 sees the tool result.
  const toolMessage = second.messages.at(-1);
  assert.equal(toolMessage.role, 'tool');
  assert.match(JSON.parse(toolMessage.content).summary, /^Ruta creada/);
  // Narration: the 7B with the JSON schema and the events.
  assert.equal(narration.model, 'narrator');
  assert.deepEqual(narration.format.required, ['text', 'suggestions']);
  assert.deepEqual(JSON.parse(narration.messages[1].content).events, reply.events);

  const stored = await turns(owner);
  assert.equal(stored.length, 20);
  assert.deepEqual(stored.slice(-2).map(t => t.role), ['user', 'assistant']);
  assert.equal(stored.at(-2).content, 'Quiero una ruta');
  assert.match(stored.at(-1).content, /^\[acción\] create_route → Marbella en 3 horas \(\d paradas\)\n/);
  assert.equal(stored.at(-1).route_id, reply.routeId);
  const row = await readRoute(db, reply.routeId, owner);
  assert.equal(row.revision, 1);
});

test('(b) quitar una parada por su nombre aplica refineTrip y sube la revisión', async () => {
  const owner = newOwner();
  const route = await seedRoute(owner);
  const target = route.stops[1];
  const fake = fakeOllama([tools(call('remove_stop', { place: target.name })), none, say('He quitado la parada.')]);
  const reply = await runAgentTurn({ db, owner, text: `Quita ${target.name}`, routeId: route.id, client, ollama: fake.ollama });
  assert.deepEqual(reply.events, [{ type: 'route_changed', routeId: route.id, change: 'remove_stop' }]);
  assert.equal(reply.route.stops.length, route.stops.length - 1);
  assert.ok(!reply.route.stops.some(s => s.placeId === target.placeId));
  assert.equal(reply.route.version, 2);
  const context = JSON.parse(fake.calls[0].messages[1].content);
  assert.equal(context.route.stops.length, route.stops.length);
  const { rows: [row] } = await db.query('SELECT revision, jsonb_array_length(history) AS history FROM travel_routes WHERE id=$1', [route.id]);
  assert.equal(row.revision, 2);
  assert.equal(row.history, 1);
});

test('(c) un lugar desconocido da un error de herramienta y la segunda ronda lo corrige', async () => {
  const owner = newOwner();
  const route = await seedRoute(owner);
  const target = route.stops[0];
  const fake = fakeOllama([tools(call('remove_stop', { place: 'el castillo raro' })),
    tools(call('remove_stop', { place: target.name })), say('Hecho.')]);
  const reply = await runAgentTurn({ db, owner, text: 'Quita el castillo', routeId: route.id, client, ollama: fake.ollama });
  const error = JSON.parse(fake.calls[1].messages.at(-1).content);
  assert.equal(error.ok, false);
  assert.match(error.error, /No conozco «el castillo raro» en Marbella\. Lugares parecidos: Muralla del castillo de Marbella/);
  assert.deepEqual(reply.events, [{ type: 'route_changed', routeId: route.id, change: 'remove_stop' }]);
  assert.equal(fake.script.length, 0); // exactly two decision rounds and one narration
});

test('(d) cuatro llamadas en una ronda: solo se ejecutan tres', async () => {
  const owner = newOwner();
  const route = await seedRoute(owner, '09:00', '18:00');
  const fake = fakeOllama([tools(call('quick_change', { value: 'menos_caminar' }), call('quick_change', { value: 'anadir_pausa' }),
    call('quick_change', { value: 'mas_barato' }), call('quick_change', { value: 'mas_comida' })), none, say('Tres cambios.')]);
  const reply = await runAgentTurn({ db, owner, text: 'Todo a la vez', routeId: route.id, client, ollama: fake.ollama });
  assert.deepEqual(reply.events.map(e => e.change), ['menos_caminar', 'anadir_pausa', 'mas_barato']);
  assert.equal((await readRoute(db, route.id, owner)).revision, 4);
  assert.equal(fake.calls[1].messages.filter(m => m.role === 'tool').length, 3);
});

test('(e) si la decisión caduca, las reglas aplican el cambio rápido (source rules)', async () => {
  const owner = newOwner();
  const route = await seedRoute(owner, '09:00', '18:00');
  const fake = fakeOllama([hang, hang], { agentTimeoutMs: 10, timeoutMs: 10 });
  const { result: reply, logged } = await quietly(() =>
    runAgentTurn({ db, owner, text: 'Prefiero caminar menos y añadir una pausa', routeId: route.id, client, ollama: fake.ollama }));
  assert.equal(reply.source, 'rules');
  assert.deepEqual(reply.events.map(e => e.change), ['menos_caminar', 'anadir_pausa']);
  assert.ok(reply.route.stops.some(s => s.placeId === 'marbella-cafe'));
  // The narrator was tried (a timeout does not mean Ollama is down) and timed out too: template text.
  assert.deepEqual(logged, ['Cacahuete agent fallback: decide timeout', 'Cacahuete agent fallback: narrate timeout']);
  assert.match(reply.text, /trayectos largos a pie/);
  assert.match(reply.text, /pausa para café/);
  assert.deepEqual(reply.suggestions, suggestionsFor(reply.events, reply.route));
});

test('(f) narración con JSON no válido: texto de plantilla y source agent', async () => {
  const owner = newOwner();
  const fake = fakeOllama([tools(call('update_preferences', { pace: 'intenso', interests: ['historia', 'playa'] })), none,
    { content: 'esto no es JSON' }]);
  const { result: reply, logged } = await quietly(() =>
    runAgentTurn({ db, owner, text: 'A partir de ahora quiero ritmo intenso e historia', client, ollama: fake.ollama }));
  assert.equal(reply.source, 'agent');
  assert.deepEqual(reply.events, [{ type: 'preferences_updated', fields: ['interests', 'pace'] }]);
  assert.equal(reply.text, 'He guardado tus preferencias.');
  assert.equal(reply.route, undefined);
  assert.deepEqual(logged, ['Cacahuete agent fallback: narrate invalid']);
  const { rows: [row] } = await db.query('SELECT preferences FROM travel_preferences WHERE owner_key=$1', [owner]);
  assert.deepEqual(row.preferences, { ...defaults, pace: 'intenso', interests: ['historia'] });
});

test('(g) cola llena: turno degradado sin esperar al narrador', async () => {
  const owner = newOwner();
  let release;
  const fake = fakeOllama([() => new Promise(resolve => { release = () => resolve(say('ocupado')); })],
    { concurrency: 1, queueMs: 10 });
  const blocker = fake.ollama.narrate([], {});
  const { result: reply, logged } = await quietly(() =>
    runAgentTurn({ db, owner, text: 'Tengo dos horas y me gusta la historia', client, ollama: fake.ollama }));
  assert.deepEqual(logged, ['Cacahuete agent fallback: decide queue']);
  assert.equal(reply.source, 'rules');
  assert.equal(reply.events[0].type, 'route_created');
  assert.deepEqual(reply.route.request.timeWindow, { from: '11:45', to: '13:45' });
  assert.deepEqual(reply.route.request.overrides, { interests: ['historia'] });
  assert.match(reply.text, /^Ruta creada: Marbella en 2 horas/);
  assert.match(reply.text, /He supuesto: hoy, salida a las 11:45, salida desde Plaza de los Naranjos\./);
  release();
  await blocker;
  assert.equal(fake.calls.length, 1);
});

test('(h) claimGuest mueve la conversación del invitado a la cuenta', async () => {
  const guest = newOwner();
  const account = '6f1f7a4e-3d55-4c47-9d2c-2f3b7b0c1a11';
  const fake = fakeOllama([none, say('¡Hola!')]);
  await runAgentTurn({ db, owner: guest, text: 'Hola', client, ollama: fake.ollama });
  assert.equal((await turns(guest)).length, 2);
  await claimGuest(db, guest, account);
  assert.equal((await turns(guest)).length, 0);
  assert.deepEqual((await turns(account)).map(t => t.content), ['Hola', '¡Hola!']);
});

test('(i) fuera de Marbella: rechazo fijo sin llamar al modelo ni guardar nada', async () => {
  const owner = newOwner();
  const fake = fakeOllama([]);
  const reply = await runAgentTurn({ db, owner, text: 'Quiero una ruta por Málaga', client, ollama: fake.ollama });
  assert.equal(fake.calls.length, 0);
  assert.equal(reply.source, 'rules');
  assert.equal(reply.events[0].type, 'rejected');
  assert.match(reply.text, /exclusivamente por Marbella/);
  assert.equal((await turns(owner)).length, 0);
});

test('añadir y cambiar el horario, y deshacer ambos en la segunda ronda', async () => {
  const owner = newOwner();
  const route = await seedRoute(owner);
  const fake = fakeOllama([
    tools(call('add_stop', { place: 'Muralla del castillo de Marbella' }), call('reschedule', { to: '13:00' })),
    tools(call('undo', { times: 2 })), say('Vuelve a estar como antes.')]);
  const reply = await runAgentTurn({ db, owner, text: 'Añade la muralla, acaba a las 13:00 y luego deshazlo todo',
    routeId: route.id, client, ollama: fake.ollama });
  assert.deepEqual(reply.events.map(e => e.change ?? e.type), ['add_stop', 'reschedule', 'undone']);
  assert.deepEqual(reply.route, route);
  const results = fake.calls[1].messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content));
  assert.match(results[0].summary, /^Añadida Muralla del castillo de Marbella/);
  assert.match(results[1].summary, /^Horario cambiado: Marbella en 3 horas/);
});

test('errores que el modelo no corrige llegan como rejected y sin ruta no se cambia nada', async () => {
  const owner = newOwner();
  const fake = fakeOllama([tools(call('remove_stop', { place: 'Puerto Banús' }), call('create_route', { date: 'mañana' })),
    none, say('No hay ruta todavía.')]);
  const reply = await runAgentTurn({ db, owner, text: 'Quita Puerto Banús', client, ollama: fake.ollama });
  assert.deepEqual(reply.events, [
    { type: 'rejected', reason: 'No hay ninguna ruta en marcha; crea una primero.' },
    { type: 'rejected', reason: 'date debe ser una fecha AAAA-MM-DD.' }
  ]);
  assert.equal(reply.routeId, undefined);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM travel_routes WHERE owner_key=$1', [owner])).rows[0].n, 0);
});

test('sin herramientas el modelo solo habla: answered, el texto viene del narrador', async () => {
  const owner = newOwner();
  const route = await seedRoute(owner);
  const fake = fakeOllama([none, say('La muralla es del siglo IX.', ['Añade la muralla'])]);
  const reply = await runAgentTurn({ db, owner, text: '¿Qué es la muralla?', routeId: route.id, client, ollama: fake.ollama });
  assert.deepEqual(reply.events, [{ type: 'answered' }]);
  assert.equal(reply.route, undefined);
  assert.equal(reply.routeId, route.id);
  assert.equal(fake.calls.length, 2);
  const input = JSON.parse(fake.calls[1].messages[1].content);
  assert.ok(input.places.some(p => p.name === 'Muralla del castillo de Marbella' && p.description));
});

test('reglas sin Ollama: deshacer, crear y no entendido', async () => {
  const owner = newOwner();
  const down = () => createOllamaClient({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  const turn = (text, routeId) => quietly(() => runAgentTurn({ db, owner, text, routeId, client, ollama: down() }));
  const { result: created, logged } = await turn('Salgo de Puerto Banús, tengo cuatro horas');
  assert.deepEqual(logged, ['Cacahuete agent fallback: decide unreachable']); // the narrator is not tried
  assert.equal(created.route.request.start.label, 'Puerto Banús');
  const { result: paused } = await turn('añade una pausa para café', created.routeId);
  assert.deepEqual(paused.events.map(e => e.change), ['anadir_pausa']);
  const { result: undone } = await turn('Deshacer', created.routeId);
  assert.deepEqual(undone.events, [{ type: 'undone', routeId: created.routeId }]);
  assert.deepEqual(undone.route.stops, created.route.stops);
  const { result: lost } = await turn('¿y eso?', created.routeId);
  assert.deepEqual(lost.events, [{ type: 'rejected', reason: 'No he entendido qué quieres cambiar.' }]);
  assert.match(lost.text, /No he entendido/);
  assert.deepEqual(lost.suggestions, ['Menos caminar', 'Añade una pausa para café', 'Guardar la ruta']);
});

test('reglas sin Ollama con una ruta: «quita el museo» y «acaba a las 2» no crean otra ruta', async () => {
  const owner = newOwner();
  const request = tripRequest({ city: 'Marbella', date: '2026-12-10', timeWindow: { from: '10:00', to: '16:00' },
    start: { label: 'Plaza de los Naranjos' }, mustInclude: ['Museo del Grabado Español Contemporáneo'] });
  const route = createTrip(request, defaults, false);
  await insertRoute(db, owner, route, defaults);
  const down = createOllamaClient({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  const turn = text => quietly(() => runAgentTurn({ db, owner, text, routeId: route.id, client, ollama: down }));
  const { result: removed } = await turn('Quita el museo, por favor');
  assert.deepEqual(removed.events, [{ type: 'route_changed', routeId: route.id, change: 'remove_stop' }]);
  assert.ok(!removed.route.stops.some(s => s.placeId === 'grabado'));
  const { result: shorter } = await turn('Mejor acaba a las 2');
  assert.deepEqual(shorter.events, [{ type: 'route_changed', routeId: route.id, change: 'reschedule' }]);
  assert.equal(shorter.route.request.timeWindow.to, '14:00');
  const { result: interests } = await turn('me gusta la historia');
  assert.equal(interests.events[0].type, 'rejected');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM travel_routes WHERE owner_key=$1', [owner])).rows[0].n, 1);
});

test('validación de argumentos de las herramientas', async () => {
  const owner = newOwner();
  const route = await seedRoute(owner);
  const row = await readRoute(db, route.id, owner);
  const ctx = { db, owner, premium: false, client, stored: null, prefs: defaults, routeId: route.id, route: row };
  const run = (name, args) => runTool({ name, arguments: args }, ctx);
  assert.deepEqual(await run('borrar_todo', {}), { ok: false, error: 'La herramienta borrar_todo no existe.' });
  assert.match((await run('quick_change', { value: 'teletransporte' })).error, /value debe ser uno de/);
  assert.match((await run('add_stop', { place: 42 })).error, /Revisa el argumento place/);
  assert.match((await run('add_stop', { place: route.stops[0].name })).error, /ya está en la ruta/);
  assert.match((await run('reschedule', {})).error, /Indica la fecha/);
  assert.match((await run('reschedule', { from: '25:00' })).error, /from debe ser una hora/);
  assert.match((await run('create_route', { durationMinutes: 900 })).error, /entre 20 y 480/);
  assert.match((await run('create_route', { start: 'Pausa para café' })).error, /punto de salida/);
  assert.match((await run('create_route', { mustInclude: ['pausa'] })).error, /imprescindible/);
  assert.match((await run('lock_stop', { place: route.stops[0].name, locked: 'quizá' })).error, /locked/);
  assert.match((await run('undo', {})).error, /No hay ningún cambio que deshacer/);
  // null and "" mean "absent"; a "9:30" time is padded.
  const late = await run('create_route', { date: null, from: '9:30', durationMinutes: '60', start: '', interests: ['museos', 'ovnis'] });
  assert.equal(late.ok, true);
  assert.deepEqual(ctx.route.itinerary.request.timeWindow, { from: '09:30', to: '10:30' });
  assert.deepEqual(ctx.route.itinerary.request.overrides, { interests: ['museos'] });
  assert.deepEqual(late.event.assumptions, ['hoy', 'salida desde Plaza de los Naranjos']);
  // A locked stop that is already locked is not changed again.
  const lock = await run('lock_stop', { place: ctx.route.itinerary.stops[0].name, locked: false });
  assert.equal(lock.ok, true);
  assert.equal(lock.event, undefined);
  // Too late today for a route.
  const evening = { ...ctx, client: { today: '2026-12-10', now: '23:55' } };
  assert.match((await runTool({ name: 'create_route', arguments: {} }, evening)).error, /No queda tiempo/);
  assert.equal(toolSchemas.length, 9);
});

test('textos: plantillas, sugerencias por estado y lugares parecidos', () => {
  assert.equal(nextQuarter('11:40'), '11:45');
  assert.equal(nextQuarter('11:45'), '12:00');
  assert.deepEqual(closestPlaces('museo del grabado').slice(0, 1), ['Museo del Grabado Español Contemporáneo']);
  assert.equal(closestPlaces('zzz').length, 5);
  const route = { name: 'Marbella en 3 horas', request: { timeWindow: { from: '12:00', to: '15:00' } },
    stops: [{ arrive: '12:00', visitMinutes: 30 }, { arrive: '12:40', visitMinutes: 20 }, { arrive: '13:10', visitMinutes: 90 }] };
  assert.equal(describeEvents([{ type: 'route_created', routeId: 'x', assumptions: ['hoy', 'salida desde Plaza de los Naranjos'] }], route),
    'Ruta creada: Marbella en 3 horas, 3 paradas de 12:00 a 14:40. He supuesto: hoy, salida desde Plaza de los Naranjos.');
  assert.equal(describeEvents([{ type: 'route_changed', routeId: 'x', change: 'remove_stop' }, { type: 'undone', routeId: 'x' }], route),
    'He quitado una parada de la ruta. He deshecho el último cambio. Ahora son 3 paradas de 12:00 a 14:40.');
  assert.equal(describeEvents([], null), 'No he entendido qué ruta quieres. Cuéntame cuánto tiempo tienes, desde dónde sales y qué te apetece.');
  assert.equal(suggestionsFor([], null)[0], 'Tengo 3 horas y me gusta la historia');
});
