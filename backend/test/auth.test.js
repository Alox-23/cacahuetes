import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { SignJWT, exportJWK, exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { defaults } from '../lib/trip-contract.js';
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

const google = { clientId: 'cacahuete-test.apps.googleusercontent.com', secret: 'google-test-secret' };
const apple = { clientId: 'es.example.cacahuete.web', team: 'TEAM123456', keyId: 'KEY1234567' };
const keys = {};
const guestToken = 'ab'.repeat(32);

before(async () => {
  process.env.FRONTEND_ORIGINS = origin;
  process.env.QUOTA_SECRET = 'auth-test-secret-with-more-than-32-characters';
  delete process.env.VERCEL;
  process.env.APP_URL = appUrl;
  process.env.MAIL_FROM = 'Cacahuete <no-reply@example.test>';
  process.env.RESEND_API_KEY = 'test';
  process.env.GOOGLE_CLIENT_ID = google.clientId;
  process.env.GOOGLE_CLIENT_SECRET = google.secret;
  process.env.APPLE_CLIENT_ID = apple.clientId;
  process.env.APPLE_TEAM_ID = apple.team;
  process.env.APPLE_KEY_ID = apple.keyId;
  keys.google = await generateKeyPair('RS256', { extractable: true });
  keys.appleId = await generateKeyPair('RS256', { extractable: true });
  keys.appleClient = await generateKeyPair('ES256', { extractable: true });
  // Stored the way a dashboard often keeps it: one line with escaped newlines.
  process.env.APPLE_PRIVATE_KEY = (await exportPKCS8(keys.appleClient.privateKey)).replace(/\n/g, '\\n');
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

test('sin correo real en Vercel no se reenvía nada (el enlace no acaba en los logs)', async (t) => {
  const { token } = await register('vercel-sin-correo@example.test');
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  process.env.VERCEL = '1';
  t.after(() => {
    process.env.RESEND_API_KEY = saved;
    delete process.env.VERCEL;
  });
  const logged = t.mock.method(console, 'log', () => {});
  const response = await call('resendVerification', { method: 'POST', token, body: {} });
  assert.equal(response.status, 503);
  assert.equal(await errorCode(response), 'MAIL_UNAVAILABLE');
  assert.equal(logged.mock.callCount(), 0);
  assert.equal((await status(token)).auth.mail, false);
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

// ---- Google and Apple sign-in -------------------------------------------------------------

const jwks = async (pair, kid) => ({ keys: [{ ...(await exportJWK(pair.publicKey)), kid, alg: 'RS256', use: 'sig' }] });
const idToken = (pair, kid, claims) => new SignJWT(claims)
  .setProtectedHeader({ alg: 'RS256', kid }).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);

// Claims of the id_token returned for the next authorization code.
let claimsQueue = [];

/** Answers the provider endpoints with the test keys; returns the recorded token requests. */
function providerServer(onToken) {
  const tokenRequests = [];
  providerFetch = async (url, init) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json(await jwks(keys.google, 'g1'));
    if (url === 'https://appleid.apple.com/auth/keys') return Response.json(await jwks(keys.appleId, 'a1'));
    if (url === 'https://oauth2.googleapis.com/token' || url === 'https://appleid.apple.com/auth/token') {
      assert.ok(init.signal, 'token requests carry a timeout');
      const body = new URLSearchParams(init.body);
      tokenRequests.push({ url, body });
      onToken?.(url, body);
      const claims = claimsQueue.shift();
      if (!claims) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const token = url.includes('google')
        ? await idToken(keys.google, 'g1', claims)
        : await idToken(keys.appleId, 'a1', claims);
      return Response.json({ access_token: 'unused', id_token: token });
    }
    return assert.fail(`Unexpected request to ${url}`);
  };
  return tokenRequests;
}

async function start(provider) {
  const response = await call('oauthStart', { method: 'POST', body: { provider } });
  assert.equal(response.status, 200);
  const { url, state } = await response.json();
  const authorize = new URL(url);
  return { authorize, state, nonce: authorize.searchParams.get('nonce') };
}

/** Google returns with a top-level GET navigation (no Origin header). */
const googleReturn = (query) =>
  handle(new Request(`${base}?action=oauthCallback&${new URLSearchParams(query)}`), nextIp());

/** Apple returns with a cross-site form_post from its own origin. */
const appleReturn = (fields) => handle(new Request(`${base}?action=oauthCallback`, {
  method: 'POST',
  headers: { origin: 'https://appleid.apple.com', 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString()
}), nextIp());

function fragment(response) {
  assert.equal(response.status, 302);
  const location = response.headers.get('location');
  assert.ok(location.startsWith(`${appUrl}/auth/callback#`), location);
  assert.ok(!location.includes('?'), 'nothing travels in the query');
  return Object.fromEntries(new URLSearchParams(location.split('#')[1]));
}

const exchange = (ticket, headers) => call('oauthExchange', { method: 'POST', body: { ticket }, headers });
const googleClaims = (sub, email, nonce, extra = {}) =>
  ({ iss: 'https://accounts.google.com', aud: google.clientId, sub, email, email_verified: true, nonce, ...extra });

async function googleSignIn(sub, email, extra = {}) {
  const { state, nonce, authorize } = await start('google');
  claimsQueue.push(googleClaims(sub, email, nonce, extra));
  const result = fragment(await googleReturn({ code: 'google-code', state }));
  assert.equal(result.state, state);
  return { ...result, authorize };
}

test('oauthStart: URL de Google con PKCE; proveedor desconocido o sin configurar', async (t) => {
  const { authorize, state, nonce } = await start('google');
  assert.equal(authorize.origin + authorize.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(authorize.searchParams.get('client_id'), google.clientId);
  assert.equal(authorize.searchParams.get('redirect_uri'), `${base}?action=oauthCallback`);
  assert.equal(authorize.searchParams.get('state'), state);
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authorize.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(authorize.searchParams.get('scope'), 'openid email');
  const { rows } = await db.query('SELECT state_hash FROM oauth_states');
  assert.ok(rows.every((row) => row.state_hash !== state), 'states are stored hashed');

  const appleStart = await start('apple');
  assert.equal(appleStart.authorize.searchParams.get('response_mode'), 'form_post');
  assert.equal(appleStart.authorize.searchParams.get('code_challenge'), null);

  const unknown = await call('oauthStart', { method: 'POST', body: { provider: 'github' } });
  assert.equal(unknown.status, 400);
  // Only the provider names as strings: ['google'] would otherwise be coerced into a config key.
  const coerced = await call('oauthStart', { method: 'POST', body: { provider: ['google'] } });
  assert.equal(coerced.status, 400);
  assert.equal(await errorCode(coerced), 'INVALID_INPUT');
  assert.deepEqual((await (await call('status')).json()).auth, { providers: ['google', 'apple'], mail: true });

  const saved = process.env.APPLE_CLIENT_ID;
  delete process.env.APPLE_CLIENT_ID;
  t.after(() => { process.env.APPLE_CLIENT_ID = saved; });
  const unconfigured = await call('oauthStart', { method: 'POST', body: { provider: 'apple' } });
  assert.equal(unconfigured.status, 503);
  assert.equal(await errorCode(unconfigured), 'PROVIDER_UNAVAILABLE');
  assert.deepEqual((await (await call('status')).json()).auth.providers, ['google']);

  // Only the provider callback skips the Origin allow-list.
  const foreign = await call('oauthStart', {
    method: 'POST', body: { provider: 'google' }, clientOrigin: 'https://appleid.apple.com'
  });
  assert.equal(foreign.status, 403);
  const evil = await call('oauthExchange', { method: 'POST', body: { ticket: 'x' }, clientOrigin: 'https://evil.example.test' });
  assert.equal(evil.status, 403);
  assert.equal((await call('oauthCallback', { method: 'PUT', body: {} })).status, 405);
});

test('Google de principio a fin: ticket de un uso, invitado reclamado y cuentas vinculadas', async () => {
  const requests = providerServer();
  // Preferences saved as a guest move to the account on sign-in, as with password login.
  const saved = await call('savePreferences', { method: 'PUT', body: defaults, headers: { 'x-guest-token': guestToken } });
  assert.equal(saved.status, 204);

  const first = await googleSignIn('google-sub-1', ' Viajera@Gmail.Example ');
  assert.match(first.ticket, /^[A-Za-z0-9_-]{43}$/);
  const [tokenRequest] = requests;
  assert.equal(tokenRequest.body.get('client_id'), google.clientId);
  assert.equal(tokenRequest.body.get('client_secret'), google.secret);
  assert.equal(tokenRequest.body.get('redirect_uri'), `${base}?action=oauthCallback`);
  assert.equal(tokenRequest.body.get('grant_type'), 'authorization_code');
  assert.equal(tokenRequest.body.get('code'), 'google-code');
  // PKCE: the verifier sent to the token endpoint hashes to the challenge of its own authorization.
  assert.equal(createHash('sha256').update(tokenRequest.body.get('code_verifier')).digest('base64url'),
    first.authorize.searchParams.get('code_challenge'));
  const { rows } = await db.query('SELECT ticket_hash FROM login_tickets');
  assert.ok(rows.every((row) => row.ticket_hash !== first.ticket), 'tickets are stored hashed');

  const response = await exchange(first.ticket, { 'x-guest-token': guestToken });
  assert.equal(response.status, 200);
  const signedIn = await response.json();
  assert.equal(signedIn.account.email, 'viajera@gmail.example');
  assert.equal(signedIn.account.emailVerified, true);
  assert.equal(signedIn.quota.plan, 'free');
  assert.equal((await status(signedIn.token)).account.id, signedIn.account.id);
  assert.deepEqual(await (await call('getPreferences', { token: signedIn.token })).json(), defaults);
  const reused = await exchange(first.ticket);
  assert.equal(reused.status, 400);
  assert.equal(await errorCode(reused), 'INVALID_TICKET');

  const again = await googleSignIn('google-sub-1', 'viajera@gmail.example');
  assert.equal((await (await exchange(again.ticket)).json()).account.id, signedIn.account.id);

  // A Google identity whose email matches an existing password account links to it and verifies it.
  const { account } = await register('enlazada@example.test');
  assert.equal(account.emailVerified, false);
  const linked = await googleSignIn('google-sub-2', 'enlazada@example.test');
  const linkedAccount = (await (await exchange(linked.ticket)).json()).account;
  assert.equal(linkedAccount.id, account.id);
  assert.equal(linkedAccount.emailVerified, true);

  // Google must say the email is verified.
  const unverified = await googleSignIn('google-sub-3', 'sin-verificar@gmail.example', { email_verified: false });
  assert.equal(unverified.error, 'email_unverified');
  assert.equal(unverified.ticket, undefined);

  // An expired ticket is refused.
  const late = await googleSignIn('google-sub-1', 'viajera@gmail.example');
  await db.query("UPDATE login_tickets SET expires_at = now() - interval '1 second'");
  assert.equal((await exchange(late.ticket)).status, 400);
});

test('vincular con una cuenta sin confirmar anula su contraseña y sesiones; una confirmada las conserva', async () => {
  providerServer();
  // Someone registered the address without proving it (pre-registration takeover attempt).
  const squatter = await register('ocupada@example.test');
  const taken = await googleSignIn('google-sub-squat', 'ocupada@example.test');
  const owner = await (await exchange(taken.ticket)).json();
  assert.equal(owner.account.id, squatter.account.id);
  assert.equal(owner.account.emailVerified, true);
  const ended = await call('status', { token: squatter.token });
  assert.equal(ended.status, 401, "the squatter's session is gone");
  const login = await call('login', { method: 'POST', body: { email: 'ocupada@example.test', password: strongPassword } });
  assert.equal(login.status, 401, "the squatter's password no longer works");
  assert.equal((await status(owner.token)).account.id, owner.account.id, 'the new session works');

  // An account whose owner already confirmed the address keeps its password and its sessions.
  const confirmed = await register('confirmada@example.test');
  assert.equal((await verify(mailedToken('confirmada@example.test'))).status, 200);
  const linked = await googleSignIn('google-sub-confirmed', 'confirmada@example.test');
  assert.equal((await (await exchange(linked.ticket)).json()).account.id, confirmed.account.id);
  assert.equal((await status(confirmed.token)).account.id, confirmed.account.id);
  const kept = await call('login', { method: 'POST', body: { email: 'confirmada@example.test', password: strongPassword } });
  assert.equal(kept.status, 200);
});

test('claves rotadas: un kid desconocido vuelve a pedir las claves una sola vez', async () => {
  const rotated = await generateKeyPair('RS256', { extractable: true });
  let served = { pair: keys.google, kid: 'g1' };
  let signer = { pair: keys.google, kid: 'g1' };
  let keyFetches = 0;
  providerFetch = async (url) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
      keyFetches++;
      return Response.json(await jwks(served.pair, served.kid));
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ id_token: await idToken(signer.pair, signer.kid, claimsQueue.shift()) });
    }
    return assert.fail(`Unexpected request to ${url}`);
  };
  // Prime the cache with g1, then let it age past the one-second refetch guard.
  assert.ok((await googleSignIn('google-sub-rotation', 'rotacion@gmail.example')).ticket);
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  served = signer = { pair: rotated, kid: 'g2' };
  keyFetches = 0;
  assert.ok((await googleSignIn('google-sub-rotation', 'rotacion@gmail.example')).ticket);
  assert.equal(keyFetches, 1, 'one refetch on the kid miss');
  // A kid that is not in the fresh set either: refused without fetching again.
  signer = { pair: keys.appleId, kid: 'nope' };
  keyFetches = 0;
  const unknownKid = await googleSignIn('google-sub-rotation', 'rotacion@gmail.example');
  assert.equal(unknownKid.error, 'invalid_token');
  assert.equal(keyFetches, 0);
  // Rotate back to g1 so the cached key set matches the other tests.
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  served = signer = { pair: keys.google, kid: 'g1' };
  assert.ok((await googleSignIn('google-sub-rotation', 'rotacion@gmail.example')).ticket);
  assert.equal(keyFetches, 1);
});

test('contraseña en una cuenta creada con Google: 401 como una contraseña incorrecta', async () => {
  providerServer();
  const result = await googleSignIn('google-sub-only', 'solo-google@gmail.example');
  assert.equal((await exchange(result.ticket)).status, 200);
  const { rows: [row] } = await db.query("SELECT password_hash FROM accounts WHERE email = 'solo-google@gmail.example'");
  assert.equal(row.password_hash, null);
  const attempt = await call('login', { method: 'POST', body: { email: 'solo-google@gmail.example', password: strongPassword } });
  assert.equal(attempt.status, 401);
  const unknown = await call('login', { method: 'POST', body: { email: 'nadie@example.test', password: strongPassword } });
  assert.equal(unknown.status, 401);
  assert.deepEqual((await attempt.json()).error, (await unknown.json()).error);
});

test('Apple: form_post desde appleid.apple.com, email_verified como texto y client_secret ES256', async () => {
  let secret;
  providerServer((url, body) => { if (url.includes('apple')) secret = body.get('client_secret'); });
  const { state, nonce } = await start('apple');
  claimsQueue.push({
    iss: 'https://appleid.apple.com', aud: apple.clientId, sub: '001234.apple-sub',
    email: 'abc123@privaterelay.appleid.com', email_verified: 'true', nonce
  });
  const result = fragment(await appleReturn({ code: 'apple-code', state, user: '{"name":{"firstName":"Ignorado"}}' }));
  assert.equal(result.state, state);
  assert.ok(result.ticket, JSON.stringify(result));
  const response = await exchange(result.ticket);
  assert.equal(response.status, 200);
  const { account } = await response.json();
  assert.equal(account.email, 'abc123@privaterelay.appleid.com');
  assert.equal(account.emailVerified, true);

  const publicKey = await importSPKI(await exportSPKI(keys.appleClient.publicKey), 'ES256');
  const { payload, protectedHeader } = await jwtVerify(secret, publicKey, {
    issuer: apple.team, audience: 'https://appleid.apple.com', subject: apple.clientId
  });
  assert.equal(protectedHeader.kid, apple.keyId);
  assert.ok(payload.exp - payload.iat <= 300);
});

test('state erróneo, caducado o reutilizado; cancelación; nonce y audiencia incorrectos', async () => {
  providerServer();
  assert.equal(fragment(await googleReturn({ code: 'x', state: 'A'.repeat(43) })).error, 'invalid_state');
  assert.deepEqual(fragment(await googleReturn({ code: 'x' })), { error: 'invalid_state' });

  const used = await googleSignIn('google-sub-state', 'state@gmail.example');
  assert.ok(used.ticket);
  const replay = fragment(await googleReturn({ code: 'google-code', state: used.state }));
  assert.equal(replay.error, 'invalid_state');

  const old = await start('google');
  await db.query("UPDATE oauth_states SET expires_at = now() - interval '1 second'");
  assert.equal(fragment(await googleReturn({ code: 'x', state: old.state })).error, 'invalid_state');

  const cancelled = await start('google');
  const denied = fragment(await googleReturn({ error: 'access_denied', state: cancelled.state }));
  assert.deepEqual(denied, { state: cancelled.state, error: 'access_denied' });

  const wrong = await start('google');
  claimsQueue.push(googleClaims('google-sub-nonce', 'nonce@gmail.example', 'otro-nonce'));
  assert.equal(fragment(await googleReturn({ code: 'google-code', state: wrong.state })).error, 'invalid_token');

  const audience = await start('google');
  claimsQueue.push(googleClaims('google-sub-aud', 'aud@gmail.example', audience.nonce, { aud: 'otra-app' }));
  assert.equal(fragment(await googleReturn({ code: 'google-code', state: audience.state })).error, 'invalid_token');

  const refused = await start('google');
  assert.equal(fragment(await googleReturn({ code: 'rechazado', state: refused.state })).error, 'exchange_failed');
  claimsQueue = [];
});

test('common-passwords.json es idéntico en backend y frontend', async () => {
  const backend = await readFile(new URL('../lib/common-passwords.json', import.meta.url));
  const frontend = await readFile(new URL('../../frontend/src/lib/common-passwords.json', import.meta.url));
  assert.ok(backend.equals(frontend), 'copy backend/lib/common-passwords.json to frontend/src/lib/');
});
