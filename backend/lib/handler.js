import { authenticate, createSession, login, publicAccount, register, saveProfile } from './accounts.js';
import { startCheckout, stripeWebhook } from './billing.js';
import { listPlaces, starts } from './catalog.js';
import { chatInput, chatReply } from './chat.js';
import { getPool } from './db.js';
import { ApiError, badRequest, configuredOrigins, json, readJson } from './http.js';
import { takeTurn, validateProfile, validateTurn } from './onboarding.js';
import { authorizeAgent, rateLimit, trialInfo, visitorNetwork } from './quota.js';
import { buildRoutes, routeInput } from './routes.js';
import { claimGuest, guestForLogin, tripAction, tripMethods } from './trip-api.js';
import { isMarbella } from './marbella-scope.js';
import { verificationActive } from './mail.js';
import { exchangeTicket, handleCallback, isProvider, providers, startAuthorization } from './oauth.js';
import { issueVerification, verifyEmail } from './verification.js';

const methods = new Map([
  ['health', 'GET'], ['catalog', 'GET'], ['status', 'GET'], ['register', 'POST'], ['login', 'POST'],
  ['logout', 'POST'], ['profile', 'PUT'], ['chat', 'POST'], ['onboarding', 'POST'], ['route', 'POST'],
  ['checkout', 'POST'], ['stripe-webhook', 'POST'], ['verifyEmail', 'POST'], ['resendVerification', 'POST'],
  ['oauthStart', 'POST'], ['oauthCallback', ['GET', 'POST']], ['oauthExchange', 'POST'],
  ...tripMethods
]);

function corsHeaders(request) {
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  const origin = request.headers.get('origin');
  if (origin && configuredOrigins().includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Guest-Token');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

export function createHandler(database = getPool) {
  return async function handle(request, localIp) {
    const headers = corsHeaders(request);
    const action = new URL(request.url).searchParams.get('action') ?? 'health';
    try {
      // The provider redirect is a top-level navigation (Google GET, Apple cross-site form_post), not CORS.
      if (action !== 'oauthCallback' && request.headers.has('origin') && !headers.has('Access-Control-Allow-Origin')) {
        throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Este origen web no está autorizado.');
      }
      const method = methods.get(action);
      if (!method) throw new ApiError(404, 'UNKNOWN_ACTION', 'La acción no existe.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const allowed = [method].flat();
      if (!allowed.includes(request.method)) {
        headers.set('Allow', `${allowed.join(', ')}, OPTIONS`);
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
      if (action === 'oauthCallback') return handleCallback(db, request);
      if (action === 'oauthStart') {
        await rateLimit(db, `oauthStart:${visitorNetwork(request, localIp)}`, 20, 300);
        const { provider } = await readJson(request);
        if (!isProvider(provider)) throw badRequest('Este método de acceso no existe.');
        return json(await startAuthorization(db, provider, request), 200, headers);
      }
      if (action === 'oauthExchange') {
        await rateLimit(db, `oauthExchange:${visitorNetwork(request, localIp)}`, 20, 300);
        const { ticket } = await readJson(request);
        const guest = guestForLogin(request);
        const { account } = await exchangeTicket(db, ticket);
        const token = await createSession(db, account.id);
        if (guest) await claimGuest(db, guest, account.id);
        return json({ account: publicAccount(account), token, quota: trialInfo(account) }, 200, headers);
      }
      if (action === 'register' || action === 'login') {
        const body = await readJson(request);
        const network = visitorNetwork(request, localIp);
        await rateLimit(db, `${action}:${network}`, 12, 300);
        const guest = guestForLogin(request);
        const auth = action === 'register' ? await register(db, body) : await login(db, body);
        if (guest) await claimGuest(db, guest, auth.account.id);
        if (action === 'register' && verificationActive()) {
          // A mail outage must not block sign-up: the user can resend from the app.
          await issueVerification(db, auth.account)
            .catch((error) => console.error('Verification mail failed:', error.code ?? error.name));
        }
        return json({ account: publicAccount(auth.account), token: auth.token, quota: trialInfo(auth.account) },
          action === 'register' ? 201 : 200, headers);
      }
      if (action === 'verifyEmail') {
        await rateLimit(db, `verifyEmail:${visitorNetwork(request, localIp)}`, 20, 300);
        const { token } = await readJson(request);
        return json(await verifyEmail(db, token), 200, headers);
      }
      const account = await authenticate(db, request,
        ['logout', 'profile', 'checkout', 'resendVerification'].includes(action));
      if (action === 'resendVerification') {
        if (account.email_verified_at) throw new ApiError(409, 'ALREADY_VERIFIED', 'Tu correo ya está confirmado.');
        // Without real mail on Vercel nothing would be delivered and the link would end up in the logs.
        if (!verificationActive()) throw new ApiError(503, 'MAIL_UNAVAILABLE', 'El correo todavía no está disponible.');
        await rateLimit(db, `resendVerification:${account.id}`, 3, 600);
        await issueVerification(db, account);
        return new Response(null, { status: 204, headers });
      }
      if (tripMethods.has(action)) {
        const result = await tripAction(db, action, request, account, localIp);
        if (result === undefined) return new Response(null, { status: 204, headers });
        return json(result, action === 'createRoute' ? 201 : 200, headers);
      }
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
        if (verificationActive() && !account.email_verified_at) {
          throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Confirma tu correo antes de pasar a Premium.');
        }
        return json(await startCheckout(db, account), 200, headers);
      }
      const network = account && action === 'status' ? null : visitorNetwork(request, localIp);
      if (action === 'status') {
        let guestTrial;
        if (!account) {
          ({ rows: [guestTrial] } = await db.query(
            'SELECT started_at AS trial_started_at FROM guest_trials WHERE network_key = $1', [network]));
        }
        return json({
          account: account ? publicAccount(account) : null,
          quota: trialInfo(account, account ?? guestTrial),
          auth: { providers: providers(), mail: verificationActive() }
        }, 200, headers);
      }

      const body = await readJson(request);
      if (body.city !== undefined && !isMarbella(body.city)) {
        throw new ApiError(400, 'UNSUPPORTED_CITY', 'Cacahuete prepara rutas exclusivamente por Marbella.');
      }
      if (action === 'chat') {
        const turn = chatInput(body, account?.profile);
        const quota = await authorizeAgent(db, account, network);
        const result = await chatReply(turn, quota.plan === 'premium');
        if (account && result.state === 'route' && result.accepted) await saveProfile(db, account, result.profile);
        return json({ ...result, quota }, 200, headers);
      }
      if (action === 'onboarding') {
        const turn = validateTurn(body, account?.profile);
        const quota = await authorizeAgent(db, account, network);
        const result = takeTurn(turn);
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
