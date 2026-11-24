import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../lib/handler.js';

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
  process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  process.env.DEMO_SCENARIOS = 'true';
  process.env.PARTNER_PLACE_IDS = 'encarnacion,avenida-mar,mercado-central';
  delete process.env.OPENAI_API_KEY;
  delete process.env.VERCEL;
  const migration = await readFile(new URL('../db/001_init.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
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

test('interpreta respuestas libres con el modelo y guarda solo el perfil de la cuenta', async (t) => {
  const { account, token } = await createAccount('perfil@example.test');
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => delete process.env.OPENAI_API_KEY);
  const requestToModel = t.mock.method(globalThis, 'fetch', async (url, config) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const modelBody = JSON.parse(config.body);
    assert.equal(modelBody.store, false);
    assert.equal(modelBody.text.format.type, 'json_schema');
    assert.doesNotMatch(config.body, /perfil@example/);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: '{"value":"evitar"}' }] }] });
  });
  const { crowd, ...draft } = profile;
  const complete = await call('onboarding', {
    method: 'POST', token, body: { profile: draft, questionId: 'crowd', answer: 'Mejor sin demasiada gente' }
  });
  assert.equal(complete.status, 200);
  const result = await complete.json();
  assert.equal(result.interpretation, 'openai');
  assert.equal(result.complete, true);
  assert.equal(requestToModel.mock.callCount(), 1);
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

test('Premium se activa mediante pago firmado y recalcula con escenario de afluencia', async (t) => {
  const { account, token } = await createAccount('premium@example.test');
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
