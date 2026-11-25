import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../lib/handler.js';
import { createOllamaClient } from '../lib/ollama.js';
import { applySchema } from '../lib/schema.js';

const origin = 'https://marbella.example.test';
const webhookSecret = 'whsec_cacahuete_test';
const base = 'https://api.example.test/api/cacahuete';
const db = new PGlite();
const handle = createHandler(() => db);
const profile = {
  start: 'naranjos', minutes: 90, interests: ['arte', 'historia', 'gastronomia'],
  budget: 'bajo', pace: 'normal', avoidStairs: true, crowd: 'evitar'
};

before(async () => {
  process.env.FRONTEND_ORIGINS = origin;
  process.env.QUOTA_SECRET = 'local-test-secret-with-more-than-32-characters';
  // Never reach a real Ollama: port 9 is a fetch "bad port", so the narrator falls back to the template at once.
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9/v1';
  process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  process.env.DEMO_SCENARIOS = 'true';
  process.env.PARTNER_PLACE_IDS = 'encarnacion,avenida-mar,mercado-central';
  delete process.env.VERCEL;
  // Applying the schema twice proves every migration is idempotent.
  await applySchema(db);
  await applySchema(db);
});

after(() => db.close());

function call(action, { method = 'GET', body, token, ip = '192.0.2.20', headers, clientOrigin = origin } = {}) {
  return handle(new Request(`${base}?action=${action}`, {
    method,
    headers: {
      ...(clientOrigin ? { origin: clientOrigin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers
    },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
  }), ip);
}

async function createAccount(email) {
  const response = await call('register', { method: 'POST', body: { email, password: 'cacahuete-fuerte-12345' } });
  assert.equal(response.status, 201);
  return response.json();
}

test('CORS y catálogo público de Marbella', async () => {
  const preflight = await call('route', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal((await call('catalog', { clientOrigin: 'https://evil.example.test' })).status, 403);
  assert.equal((await call('health')).status, 200);
  const catalog = await (await call('catalog')).json();
  assert.equal(catalog.city, 'Marbella');
  assert.equal(catalog.starts.naranjos.name, 'Plaza de los Naranjos');
  assert.ok(catalog.places.every((place) => place.crowd === 'desconocida'));
});

test('invitado: onboarding, inicio único de la prueba y vencimiento', async () => {
  const status = await (await call('status')).json();
  assert.equal(status.quota.expiresAt, null);
  const [first, second] = await Promise.all([{}, {}].map((body) =>
    call('onboarding', { method: 'POST', body }).then((result) => result.json())));
  assert.equal(first.question.id, 'start');
  assert.equal(first.quota.expiresAt, second.quota.expiresAt);
  const answer = await (await call('onboarding', {
    method: 'POST', body: { profile: { start: 'naranjos' }, questionId: 'minutes', answer: 'una hora y media' }
  })).json();
  assert.equal(answer.profile.minutes, 90);
  assert.equal(answer.interpretation, 'rules');
  const routes = await (await call('route', { method: 'POST', body: { profile } })).json();
  assert.ok(routes.route.stops.length > 0 && routes.route.stops.length <= 3);
  assert.deepEqual(routes.alternatives, []);
  const { rows: [ledger] } = await db.query('SELECT network_key FROM guest_trials');
  assert.match(ledger.network_key, /^[a-f\d]{64}$/);
  await db.query("UPDATE guest_trials SET started_at = now() - interval '3 hours'");
  const expired = await call('route', { method: 'POST', body: { profile } });
  assert.equal(expired.status, 403);
  assert.equal((await expired.json()).error.code, 'AGENT_TIME_EXPIRED');
});

test('interpreta respuestas libres y guarda solo el perfil de la cuenta', async () => {
  const { account, token } = await createAccount('perfil@example.test');
  const { crowd, ...draft } = profile;
  const complete = await call('onboarding', {
    method: 'POST', token, body: { profile: draft, questionId: 'crowd', answer: 'Mejor sin demasiada gente' }
  });
  assert.equal(complete.status, 200);
  const result = await complete.json();
  assert.equal(result.interpretation, 'rules');
  assert.equal(result.complete, true);
  const status = await (await call('status', { token })).json();
  assert.equal(status.account.id, account.id);
  assert.deepEqual(status.account.profile, profile);
  const login = await call('login', {
    method: 'POST', body: { email: account.email, password: 'cacahuete-fuerte-12345' }
  });
  assert.equal(login.status, 200);
  assert.equal((await call('logout', { method: 'POST', token })).status, 204);
  assert.equal((await call('status', { token })).status, 401);
});

test('el chat pide solo lo que falta y recalcula una ruta al cambiar el tiempo', async () => {
  const send = (body) => call('chat', { method: 'POST', body, ip: '192.0.2.21' }).then((response) => response.json());
  const first = await send({ message: 'Tengo una hora y media y quiero museos y tapas, sin escaleras.' });
  assert.equal(first.state, 'question');
  assert.equal(first.question.id, 'start');
  assert.equal(first.profile.minutes, 90);
  assert.deepEqual(first.profile.interests, ['arte', 'gastronomia']);
  assert.equal(first.profile.avoidStairs, true);

  const destination = await send({ profile: first.profile, message: 'Quiero visitar Puerto Banús' });
  assert.equal(destination.question.id, 'start');
  assert.equal(destination.profile.start, undefined);

  const trip = await send({ profile: first.profile, questionId: 'start', answer: 'naranjos' });
  assert.equal(trip.state, 'route');
  assert.equal(trip.route.start.name, 'Plaza de los Naranjos');
  assert.ok(trip.route.stops.length > 0);
  assert.ok(trip.route.totalMinutes <= 90);
  assert.ok(trip.route.stops.every((stop) => stop.id !== 'grabado'));
  assert.equal(trip.appliedDefaults.avoidStairs, undefined);

  const shorter = await send({ profile: trip.profile, message: 'Mejor 30 minutos', avoidStops: ['naranjos'] });
  assert.equal(shorter.profile.minutes, 30);
  assert.ok(shorter.route.stops.length > 0);
  assert.ok(shorter.route.totalMinutes <= 30 && shorter.route.totalMinutes < trip.route.totalMinutes);
  assert.ok(shorter.route.stops.every((stop) => stop.id !== 'naranjos'));
  assert.equal(shorter.quota.expiresAt, trip.quota.expiresAt);
});

test('el chat clasifica intereses localmente, genera la ruta y respeta el límite de uso', async (t) => {
  const { account, token } = await createAccount('chat@example.test');
  const outgoing = t.mock.method(globalThis, 'fetch', async () => assert.fail('El chat no necesita una API externa'));
  const response = await call('chat', {
    method: 'POST', token, body: {
      message: 'Salimos de la Alameda. Tenemos dos horas y quiero contemplar una pinacoteca llena de pinturas.'
    }
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.state, 'route');
  assert.equal(result.interpretation, 'model');
  assert.deepEqual(result.profile.interests, ['arte']);
  assert.equal(result.quota.plan, 'free');
  assert.equal(result.profile.plan, undefined);
  assert.equal(result.profile.pace, undefined);
  assert.equal(result.appliedDefaults.pace, 'normal');
  assert.ok(result.route.totalMinutes <= 120);

  const status = await (await call('status', { token })).json();
  assert.equal(status.account.id, account.id);
  assert.deepEqual(status.account.profile, result.profile);
  await db.query("UPDATE accounts SET trial_started_at = now() - interval '4 hours' WHERE id = $1", [account.id]);
  const expired = await call('chat', { method: 'POST', token, body: { message: 'Mejor 45 minutos' } });
  assert.equal(expired.status, 403);
  assert.equal(outgoing.mock.callCount(), 0);
});

test('Premium se activa mediante pago firmado y recalcula con escenario de afluencia', async (t) => {
  const { account, token } = await createAccount('premium@example.test');
  // Feature 4: Premium needs a confirmed email (verification is active locally).
  await db.query('UPDATE accounts SET email_verified_at = now() WHERE id = $1', [account.id]);
  process.env.STRIPE_SECRET_KEY = 'sk_test_example';
  process.env.STRIPE_PRICE_ID = 'price_example';
  t.after(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
  });
  const checkouts = t.mock.method(globalThis, 'fetch', async (url, config) => {
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(config.body.get('metadata[accountId]'), account.id);
    assert.equal(config.body.get('line_items[0][price]'), 'price_example');
    return Response.json({ url: 'https://checkout.stripe.com/example' });
  });
  for (let i = 0; i < 2; i++) {
    assert.equal((await call('checkout', { method: 'POST', token })).status, 200);
  }
  const [first, second] = checkouts.mock.calls;
  assert.equal(first.arguments[1].headers['Idempotency-Key'], second.arguments[1].headers['Idempotency-Key']);
  await db.query("UPDATE accounts SET trial_started_at = now() - interval '4 hours' WHERE id = $1", [account.id]);
  assert.equal((await call('route', { method: 'POST', token, body: { profile } })).status, 403);
  const body = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_123', mode: 'payment', payment_status: 'paid',
      metadata: { purpose: 'cacahuete_premium', accountId: account.id } } }
  });
  const webhook = (signature) => call('stripe-webhook', {
    method: 'POST', body, clientOrigin: null, headers: { 'stripe-signature': signature }
  });
  assert.equal((await webhook('invalid')).status, 400);
  const at = Math.floor(Date.now() / 1_000);
  const digest = createHmac('sha256', webhookSecret).update(`${at}.${body}`).digest('hex');
  for (let i = 0; i < 2; i++) assert.equal((await webhook(`t=${at},v1=${digest}`)).status, 200);
  assert.equal((await db.query('SELECT checkout_id FROM premium_payments')).rows.length, 1);
  const { route, quota, alternatives } = await (await call('route', {
    method: 'POST', token, body: { profile, scenario: 'busy-centre', avoidStops: ['muralla'] }
  })).json();
  assert.equal(quota.plan, 'premium');
  assert.equal(quota.remainingSeconds, null);
  assert.equal(route.crowdSource, 'simulated');
  assert.ok(route.totalMinutes <= profile.minutes && route.stops.length > 0);
  assert.ok(route.stops.every((stop) => stop.crowd !== 'alta' && stop.id !== 'muralla' && stop.id !== 'grabado'));
  assert.ok(route.stops.filter((stop) => stop.sponsored).length <= 1);
  assert.ok(alternatives.length > 0);
});

test('agent: turno conversacional con un Ollama simulado, rutas ajenas, cuota y health', async () => {
  let fetches = 0;
  const ollama = createOllamaClient({ agentModel: 'qwen2.5:3b', fetchImpl: async (url, init) => {
    fetches++;
    const body = JSON.parse(init.body);
    const last = body.messages.at(-1);
    const message = { role: 'assistant', content: '' };
    if (body.format) message.content = JSON.stringify({ text: 'Aquí tienes tu ruta.', suggestions: ['Menos caminar'] });
    else if (last.role === 'user' && /ruta/.test(last.content)) {
      message.tool_calls = [{ function: { name: 'create_route', arguments: { durationMinutes: 120 } } }];
    }
    return Response.json({ message, done_reason: 'stop' });
  } });
  const agentHandle = createHandler(() => db, { ollama });
  const guest = (n) => n.toString(16).padStart(64, 'a');
  const ask = (body, { ip = '192.0.2.40', token = guest(1) } = {}) => agentHandle(new Request(`${base}?action=agent`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { origin, 'content-type': 'application/json', 'x-guest-token': token }
  }), ip);

  const response = await ask({ text: 'Quiero una ruta de dos horas', client: { today: '2026-12-10', now: '09:58' } });
  assert.equal(response.status, 200);
  const reply = await response.json();
  assert.equal(reply.source, 'agent');
  assert.equal(reply.text, 'Aquí tienes tu ruta.');
  assert.deepEqual(reply.suggestions, ['Menos caminar']);
  assert.equal(reply.events[0].type, 'route_created');
  assert.equal(reply.routeId, reply.route.id);
  assert.deepEqual(reply.route.request.timeWindow, { from: '10:00', to: '12:00' });
  assert.equal(reply.route.request.date, '2026-12-10');
  assert.equal(reply.quota.plan, 'guest');

  const followUp = await (await ask({ text: '¿Qué tal?', routeId: reply.routeId })).json();
  assert.deepEqual(followUp.events, [{ type: 'answered' }]);
  assert.equal(followUp.routeId, reply.routeId);
  assert.equal(followUp.route, undefined);

  const foreign = await ask({ text: '¿Qué tal?', routeId: reply.routeId }, { token: guest(2) });
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json()).error.code, 'ROUTE_NOT_FOUND');
  assert.equal((await ask({ text: 'Hola', routeId: 'no-es-un-uuid' })).status, 404);
  assert.equal((await ask({ text: '' })).status, 400);
  assert.equal((await ask({ text: 'a'.repeat(501) })).status, 400);
  const malaga = await ask({ text: 'Mejor una ruta por Málaga' });
  assert.equal(malaga.status, 400);
  assert.equal((await malaga.json()).error.code, 'UNSUPPORTED_CITY');

  // A refused quota (429, 403) never reaches the model.
  const modelCalls = fetches;
  const network = createHmac('sha256', process.env.QUOTA_SECRET).update('192.0.2.41').digest('hex');
  await db.query('INSERT INTO rate_limits(subject, bucket, hits) VALUES ($1, floor(extract(epoch FROM now()) / 60)::bigint, 20)',
    [`agent:${network}`]);
  const limited = await ask({ text: 'Hola' }, { ip: '192.0.2.41' });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'RATE_LIMITED');

  const expiredNetwork = createHmac('sha256', process.env.QUOTA_SECRET).update('192.0.2.40').digest('hex');
  await db.query("UPDATE guest_trials SET started_at = now() - interval '3 hours' WHERE network_key = $1", [expiredNetwork]);
  const expired = await ask({ text: 'Quiero una ruta' });
  assert.equal(expired.status, 403);
  assert.equal((await expired.json()).error.code, 'AGENT_TIME_EXPIRED');
  assert.equal(fetches, modelCalls);

  const health = await (await agentHandle(new Request(`${base}?action=health`, { headers: { origin } }), '127.0.0.1')).json();
  assert.equal(health.llm.agentModel, 'qwen2.5:3b');
  const wrongMethod = await agentHandle(new Request(`${base}?action=agent`, { headers: { origin } }), '127.0.0.1');
  assert.equal(wrongMethod.status, 405);
});
