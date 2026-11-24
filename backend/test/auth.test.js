import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../lib/handler.js';
import { applySchema } from '../lib/schema.js';

const origin = 'https://marbella.example.test';
const base = 'https://api.example.test/api/cacahuete';
const db = new PGlite();
const handle = createHandler(() => db);
let ipSeq = 0;
// Each call gets its own address unless one is given, so per-network rate limits do not interfere.
const nextIp = () => `198.51.100.${(ipSeq++ % 250) + 1}`;
const appUrl = 'https://app.example.test';
const strongPassword = 'k9!Tq#2mVw$z';

// Outgoing HTTP: Resend messages land in `outbox`; provider endpoints are answered by `providerFetch`.
const realFetch = globalThis.fetch;
const outbox = [];
let providerFetch = async (url) => assert.fail(`Unexpected request to ${url}`);

before(async () => {
  process.env.FRONTEND_ORIGINS = origin;
  process.env.QUOTA_SECRET = 'auth-test-secret-with-more-than-32-characters';
  delete process.env.VERCEL;
  process.env.APP_URL = appUrl;
  process.env.MAIL_FROM = 'Cacahuete <no-reply@example.test>';
  process.env.RESEND_API_KEY = 'test';
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target === 'https://api.resend.com/emails') {
      assert.equal(init.headers.Authorization, 'Bearer test');
      assert.ok(init.signal, 'mail requests carry a timeout');
      outbox.push(JSON.parse(init.body));
      return Response.json({ id: 'mail-' + outbox.length });
    }
    return providerFetch(target, init);
  };
  await applySchema(db);
});

after(async () => {
  globalThis.fetch = realFetch;
  await db.close();
});

/** Token from the last verification email sent to `email`. */
function mailedToken(email) {
  const mail = outbox.findLast((message) => message.to.includes(email));
  assert.ok(mail, `no mail for ${email}`);
  assert.equal(mail.subject, 'Confirma tu correo en Cacahuete');
  const match = mail.text.match(/(https:\/\/\S+\/verify-email\?token=([A-Za-z0-9_-]{43}))/);
  assert.ok(match, 'the mail contains the link');
  assert.ok(match[1].startsWith(appUrl + '/verify-email?token='));
  assert.ok(mail.html.includes(match[2]));
  return match[2];
}

async function register(email, password = strongPassword) {
  const response = await call('register', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 201);
  return response.json();
}

const status = (token) => call('status', { token }).then((response) => response.json());
const verify = (token) => call('verifyEmail', { method: 'POST', body: { token } });
const errorCode = async (response) => (await response.json()).error.code;

function call(action, { method = 'GET', body, token, ip = nextIp(), headers, clientOrigin = origin } = {}) {
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

test('reglas de contraseña: cada motivo devuelve 400 con campo y motivo', async () => {
  const cases = [
    ['corta-123', 'PASSWORD_TOO_SHORT'],
    ['a'.repeat(64) + 'b'.repeat(65), 'PASSWORD_TOO_LONG'],
    ['abababababab', 'PASSWORD_TOO_SIMPLE'],
    ['xx-reglas-fuertes-xx', 'PASSWORD_CONTAINS_EMAIL'],
    ['Contraseña123', 'PASSWORD_COMMON']
  ];
  for (const [password, reason] of cases) {
    const response = await call('register', { method: 'POST', body: { email: 'reglas@example.test', password } });
    assert.equal(response.status, 400, reason);
    const { error } = await response.json();
    assert.equal(error.code, 'INVALID_INPUT');
    assert.equal(error.field, 'password');
    assert.equal(error.reason, reason);
  }
  const email = await call('register', { method: 'POST', body: { email: 'no-es-un-correo', password: 'bastante-segura-42' } });
  assert.equal(email.status, 400);
  assert.deepEqual(
    (({ field, reason }) => ({ field, reason }))((await email.json()).error),
    { field: 'email', reason: 'EMAIL_INVALID' });
  await register('reglas@example.test');
});

test('el registro envía un enlace de un solo uso que confirma el correo', async () => {
  const { account, token } = await register('verifica@example.test');
  assert.equal(account.emailVerified, false);
  const link = mailedToken('verifica@example.test');
  const before = await status(token);
  assert.equal(before.account.emailVerified, false);
  assert.deepEqual(before.auth.mail, true);
  const verified = await verify(link);
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { email: 'verifica@example.test', verified: true });
  assert.equal((await status(token)).account.emailVerified, true);
  const again = await verify(link);
  assert.equal(again.status, 400);
  assert.equal(await errorCode(again), 'INVALID_TOKEN');
  assert.equal(await errorCode(await verify('demasiado-corto')), 'INVALID_TOKEN');
  const { rows } = await db.query('SELECT token_hash FROM email_verifications');
  assert.ok(rows.every((row) => row.token_hash !== link), 'tokens are stored hashed');

  await register('caducado@example.test');
  const old = mailedToken('caducado@example.test');
  await db.query("UPDATE email_verifications SET expires_at = now() - interval '1 minute'");
  const expired = await verify(old);
  assert.equal(expired.status, 410);
  assert.equal(await errorCode(expired), 'TOKEN_EXPIRED');
});

test('reenviar el correo: límite por cuenta y 409 cuando ya está confirmado', async () => {
  const { token } = await register('reenvio@example.test');
  const first = mailedToken('reenvio@example.test');
  for (let i = 0; i < 3; i++) {
    assert.equal((await call('resendVerification', { method: 'POST', token, body: {} })).status, 204);
  }
  const limited = await call('resendVerification', { method: 'POST', token, body: {} });
  assert.equal(limited.status, 429);
  assert.equal(await errorCode(limited), 'RATE_LIMITED');
  const latest = mailedToken('reenvio@example.test');
  assert.notEqual(latest, first);
  assert.equal((await verify(first)).status, 400, 'resending invalidates older links');
  assert.equal((await verify(latest)).status, 200);
  const done = await call('resendVerification', { method: 'POST', token, body: {} });
  assert.equal(done.status, 409);
  assert.equal(await errorCode(done), 'ALREADY_VERIFIED');
  assert.equal((await call('resendVerification', { method: 'POST', body: {} })).status, 401);
});

test('Premium exige un correo confirmado', async (t) => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_example';
  process.env.STRIPE_PRICE_ID = 'price_example';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
  t.after(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });
  const { token } = await register('sin-confirmar@example.test');
  const response = await call('checkout', { method: 'POST', token });
  assert.equal(response.status, 403);
  assert.equal(await errorCode(response), 'EMAIL_NOT_VERIFIED');
});
