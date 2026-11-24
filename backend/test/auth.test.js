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

before(async () => {
  process.env.FRONTEND_ORIGINS = origin;
  process.env.QUOTA_SECRET = 'auth-test-secret-with-more-than-32-characters';
  delete process.env.VERCEL;
  await applySchema(db);
});

after(() => db.close());

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
  const strong = await call('register', { method: 'POST', body: { email: 'reglas@example.test', password: 'k9!Tq#2mVw$z' } });
  assert.equal(strong.status, 201);
});
