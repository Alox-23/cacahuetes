// Google and Apple sign-in: OAuth 2.0 / OpenID Connect authorization-code flow terminated on the backend.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, createLocalJWKSet, importPKCS8, jwtVerify } from 'jose';
import { ApiError, readText } from './http.js';
import { appUrl } from './mail.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const opaque = /^[A-Za-z0-9_-]{43}$/;
const env = process.env;

const config = {
  google: {
    configured: () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    clientId: () => env.GOOGLE_CLIENT_ID,
    clientSecret: async () => env.GOOGLE_CLIENT_SECRET,
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    pkce: true,
    params: { scope: 'openid email', prompt: 'select_account' },
    emailVerified: (claim) => claim === true
  },
  apple: {
    configured: () => Boolean(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY),
    clientId: () => env.APPLE_CLIENT_ID,
    clientSecret: appleClientSecret,
    authorize: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    jwks: 'https://appleid.apple.com/auth/keys',
    issuer: 'https://appleid.apple.com',
    pkce: false,
    params: { scope: 'email', response_mode: 'form_post' },
    // Apple sends a boolean or the string 'true' and only hands out addresses it has verified.
    emailVerified: (claim) => claim === undefined || claim === true || claim === 'true'
  }
};

export const isProvider = (name) => Object.hasOwn(config, name);

/** Configured sign-in providers, in a stable order. */
export const providers = () => ['google', 'apple'].filter((name) => config[name].configured());

/** Apple's client_secret: an ES256 JWT signed with the team's key, valid for five minutes. */
async function appleClientSecret() {
  const key = await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'ES256');
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
}

/** `${PUBLIC_API_URL}?action=oauthCallback`; without the variable, the request's own origin and path. */
function redirectUri(request) {
  const own = new URL(request.url);
  const url = new URL(env.PUBLIC_API_URL || own.origin + own.pathname);
  url.search = '';
  url.hash = '';
  url.searchParams.set('action', 'oauthCallback');
  return url.toString();
}

export async function startAuthorization(db, provider, request) {
  const settings = config[provider];
  if (!settings?.configured()) {
    throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Este método de acceso no está disponible.');
  }
  const state = random();
  const nonce = random();
  const verifier = settings.pkce ? random() : null;
  await db.query('DELETE FROM oauth_states WHERE expires_at <= now()');
  await db.query(`
    INSERT INTO oauth_states (state_hash, provider, nonce, code_verifier, expires_at)
    VALUES ($1, $2, $3, $4, now() + interval '10 minutes')
  `, [hash(state), provider, nonce, verifier]);
  const url = new URL(settings.authorize);
  const params = {
    client_id: settings.clientId(),
    redirect_uri: redirectUri(request),
    response_type: 'code',
    state,
    nonce,
    ...settings.params,
    ...(verifier ? {
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256'
    } : {})
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return { url: url.toString(), state };
}

// Key sets fetched by us (so tests can mock fetch), cached for an hour per provider.
const keySets = new Map();

async function keySet(provider, refresh = false) {
  const cached = keySets.get(provider);
  if (cached && !refresh && Date.now() - cached.at < 3_600_000) return cached;
  const response = await fetch(config[provider].jwks, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new ApiError(502, 'exchange_failed', 'JWKS unavailable');
  const entry = { at: Date.now(), keys: createLocalJWKSet(await response.json()) };
  keySets.set(provider, entry);
  return entry;
}

async function verifyIdToken(provider, idToken) {
  const options = { issuer: config[provider].issuer, audience: config[provider].clientId() };
  let entry = await keySet(provider);
  for (;;) {
    try {
      return (await jwtVerify(idToken, entry.keys, options)).payload;
    } catch (error) {
      // A rotated key: refetch the set once, unless it was fetched just now.
      if (error?.code === 'ERR_JWKS_NO_MATCHING_KEY' && Date.now() - entry.at > 1_000) {
        entry = await keySet(provider, true);
        continue;
      }
      throw new ApiError(400, 'invalid_token', 'id_token rejected');
    }
  }
}

async function exchangeCode(provider, code, verifier, request) {
  const settings = config[provider];
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(request),
    client_id: settings.clientId(),
    client_secret: await settings.clientSecret(),
    ...(verifier ? { code_verifier: verifier } : {})
  });
  const response = await fetch(settings.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new ApiError(502, 'exchange_failed', 'token endpoint refused the code');
  const result = await response.json().catch(() => null);
  if (typeof result?.id_token !== 'string') throw new ApiError(502, 'exchange_failed', 'no id_token');
  return result.id_token;
}

/**
 * The account behind a provider identity: the linked one, else the account with the same
 * (provider-verified) email, else a new password-less account. Identities are keyed by `sub`.
 */
export async function accountForIdentity(db, provider, subject, email) {
  const linked = () => db.query(`
    SELECT a.* FROM account_identities i JOIN accounts a ON a.id = i.account_id
    WHERE i.provider = $1 AND i.subject = $2
  `, [provider, subject]).then(({ rows }) => rows[0]);
  const existing = await linked();
  if (existing) return existing;
  await db.query(`
    INSERT INTO accounts (id, email, password_hash, email_verified_at) VALUES ($1, $2, NULL, now())
    ON CONFLICT (email) DO NOTHING
  `, [randomUUID(), email]);
  const { rows: [account] } = await db.query('SELECT id, email_verified_at FROM accounts WHERE email = $1', [email]);
  if (!account.email_verified_at) {
    // The provider has proven the address; a password set by whoever registered it unconfirmed is not
    // trusted (pre-registration takeover), so it is dropped along with that account's sessions.
    await db.query(`
      WITH ended AS (DELETE FROM sessions WHERE account_id = $1)
      UPDATE accounts SET email_verified_at = now(), password_hash = NULL
      WHERE id = $1 AND email_verified_at IS NULL
    `, [account.id]);
  }
  await db.query(`
    INSERT INTO account_identities (provider, subject, account_id, email) VALUES ($1, $2, $3, $4)
    ON CONFLICT (provider, subject) DO NOTHING
  `, [provider, subject, account.id, email]);
  return linked();
}

const callbackErrors = new Set([
  'access_denied', 'invalid_state', 'exchange_failed', 'invalid_token', 'email_unverified', 'provider_unavailable'
]);

function backToApp(fields) {
  const location = `${appUrl()}/auth/callback#${new URLSearchParams(fields)}`;
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  });
}

/** Provider redirect (GET from Google, form_post from Apple). Every outcome is a redirect into the app. */
export async function handleCallback(db, request) {
  let state = '';
  try {
    const params = request.method === 'POST'
      ? new URLSearchParams(await readText(request))
      : new URL(request.url).searchParams;
    const given = params.get('state') ?? '';
    if (!opaque.test(given)) throw new ApiError(400, 'invalid_state', 'malformed state');
    state = given;
    const { rows: [stored] } = await db.query(`
      DELETE FROM oauth_states WHERE state_hash = $1
      RETURNING provider, nonce, code_verifier, expires_at > now() AS fresh
    `, [hash(state)]);
    const providerError = params.get('error');
    if (providerError) {
      const cancelled = providerError === 'access_denied' || providerError === 'user_cancelled_authorize';
      throw new ApiError(400, cancelled ? 'access_denied' : 'exchange_failed', 'provider error');
    }
    if (!stored?.fresh) throw new ApiError(400, 'invalid_state', 'unknown or expired state');
    const { provider } = stored;
    if (!config[provider]?.configured()) throw new ApiError(503, 'provider_unavailable', 'not configured');
    const code = params.get('code');
    if (!code || code.length > 4_096) throw new ApiError(400, 'exchange_failed', 'missing code');
    const claims = await verifyIdToken(provider, await exchangeCode(provider, code, stored.code_verifier, request));
    if (claims.nonce !== stored.nonce) throw new ApiError(400, 'invalid_token', 'nonce mismatch');
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) {
      throw new ApiError(400, 'invalid_token', 'missing subject');
    }
    if (!email || email.length > 254 || !config[provider].emailVerified(claims.email_verified)) {
      throw new ApiError(400, 'email_unverified', 'email not verified by the provider');
    }
    const account = await accountForIdentity(db, provider, claims.sub, email);
    const ticket = random();
    await db.query('DELETE FROM login_tickets WHERE expires_at <= now()');
    await db.query(`
      INSERT INTO login_tickets (ticket_hash, account_id, expires_at) VALUES ($1, $2, now() + interval '120 seconds')
    `, [hash(ticket), account.id]);
    return backToApp({ state, ticket });
  } catch (error) {
    const code = callbackErrors.has(error?.code) ? error.code : 'exchange_failed';
    if (code !== 'access_denied') console.error('OAuth callback failed:', error?.code ?? error?.name);
    try {
      return backToApp(state ? { state, error: code } : { error: code });
    } catch {
      return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }
}

/** Single-use, 120-second ticket handed to the app in the URL fragment → the account to sign in. */
export async function exchangeTicket(db, ticket) {
  const invalid = () => new ApiError(400, 'INVALID_TICKET', 'El acceso ha caducado. Vuelve a intentarlo.');
  if (typeof ticket !== 'string' || !opaque.test(ticket)) throw invalid();
  const { rows: [row] } = await db.query(`
    DELETE FROM login_tickets WHERE ticket_hash = $1 RETURNING account_id, expires_at > now() AS fresh
  `, [hash(ticket)]);
  if (!row?.fresh) throw invalid();
  const { rows: [account] } = await db.query('SELECT * FROM accounts WHERE id = $1', [row.account_id]);
  if (!account) throw invalid();
  return { account };
}
