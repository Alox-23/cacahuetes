import { authenticate, login, publicAccount, register, saveProfile } from './accounts.js';
import { startCheckout, stripeWebhook } from './billing.js';
import { listPlaces, starts } from './catalog.js';
import { getPool } from './db.js';
import { ApiError, configuredOrigins, json, readJson } from './http.js';
import { takeTurn, validateProfile, validateTurn } from './onboarding.js';
import { authorizeAgent, rateLimit, trialInfo, visitorNetwork } from './quota.js';
import { buildRoutes, routeInput } from './routes.js';

const methods = new Map([
  ['health', 'GET'], ['catalog', 'GET'], ['status', 'GET'], ['register', 'POST'], ['login', 'POST'],
  ['logout', 'POST'], ['profile', 'PUT'], ['onboarding', 'POST'], ['route', 'POST'],
  ['checkout', 'POST'], ['stripe-webhook', 'POST']
]);

function corsHeaders(request) {
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  const origin = request.headers.get('origin');
  if (origin && configuredOrigins().includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

export function createHandler(database = getPool) {
  return async function handle(request, localIp) {
    const headers = corsHeaders(request);
    const action = new URL(request.url).searchParams.get('action') ?? 'health';
    try {
      if (request.headers.has('origin') && !headers.has('Access-Control-Allow-Origin')) {
        throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Este origen web no está autorizado.');
      }
      const method = methods.get(action);
      if (!method) throw new ApiError(404, 'UNKNOWN_ACTION', 'La acción no existe.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== method) {
        headers.set('Allow', `${method}, OPTIONS`);
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Método HTTP no permitido.');
      }
      if (action === 'health') {
        await database().query('SELECT 1 FROM accounts LIMIT 1');
        return json({ ok: true, service: 'cacahuete', city: 'Marbella' }, 200, headers);
      }
      if (action === 'catalog') {
        return json({ city: 'Marbella', starts, places: listPlaces() }, 200, headers);
      }

      const db = database();
      if (action === 'stripe-webhook') return json(await stripeWebhook(db, request), 200, headers);
      if (action === 'register' || action === 'login') {
        const body = await readJson(request);
        const network = visitorNetwork(request, localIp);
        await rateLimit(db, `${action}:${network}`, 12, 300);
        const auth = action === 'register' ? await register(db, body) : await login(db, body);
        return json({ account: publicAccount(auth.account), token: auth.token, quota: trialInfo(auth.account) },
          action === 'register' ? 201 : 200, headers);
      }
      const account = await authenticate(db, request, ['logout', 'profile', 'checkout'].includes(action));
      if (action === 'logout') {
        await db.query('DELETE FROM sessions WHERE token_hash = $1', [account.sessionHash]);
        return new Response(null, { status: 204, headers });
      }
      if (action === 'profile') {
        const { profile } = await readJson(request);
        const validated = validateProfile(profile);
        await saveProfile(db, account, validated);
        return json({ profile: validated }, 200, headers);
      }
      if (action === 'checkout') {
        await rateLimit(db, `checkout:${account.id}`, 5);
        return json(await startCheckout(db, account), 200, headers);
      }
      const network = account ? null : visitorNetwork(request, localIp);
      if (action === 'status') {
        let guestTrial;
        if (!account) {
          ({ rows: [guestTrial] } = await db.query(
            'SELECT started_at AS trial_started_at FROM guest_trials WHERE network_key = $1', [network]));
        }
        return json({ account: account ? publicAccount(account) : null, quota: trialInfo(account, account ?? guestTrial) },
          200, headers);
      }

      const body = await readJson(request);
      if (action === 'onboarding') {
        const turn = validateTurn(body, account?.profile);
        const quota = await authorizeAgent(db, account, network);
        const result = await takeTurn(turn);
        if (account && result.complete && result.accepted) await saveProfile(db, account, result.profile);
        return json({ ...result, quota }, 200, headers);
      }
      const input = routeInput(body, account?.profile);
      const quota = await authorizeAgent(db, account, network);
      return json({ ...buildRoutes(input, quota.plan === 'premium'), quota }, 200, headers);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) headers.set('Retry-After', String(error.details.retryAfterSeconds));
        return json({ error: { code: error.code, message: error.message, ...error.details } }, error.status, headers);
      }
      console.error('Cacahuete request failed:', action, error.code ?? error.name);
      return json({ error: { code: 'SERVER_ERROR', message: 'Cacahuete no está disponible en este momento.' } }, 500, headers);
    }
  };
}
