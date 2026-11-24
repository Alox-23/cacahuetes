import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createHttpDataModule } from '../../frontend/src/data/httpData.ts';
import { createHandler } from '../lib/handler.js';
import { applySchema } from '../lib/schema.js';
import { defaults } from '../lib/trip-contract.js';

const db = new PGlite();
const origin = 'http://localhost:5173';
const handle = createHandler(() => db);
let server, endpoint;
before(async () => {
  process.env.FRONTEND_ORIGINS = origin;
  process.env.QUOTA_SECRET = 'integration-guest-quota-test-only-12345';
  delete process.env.VERCEL;
  await applySchema(db);
  server = createServer(async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    const response = await handle(new Request('http://localhost' + req.url, {
      method: req.method, headers: { ...req.headers, origin }, body: body.length ? Buffer.concat(body) : undefined
    }), '127.0.0.1');
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  endpoint = `http://127.0.0.1:${server.address().port}/api/cacahuete`;
});
after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await db.close();
});

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
}
const request = {
  city: 'Marbella', date: '2026-12-10', timeWindow: { from: '10:00', to: '15:00' },
  start: { label: 'Plaza de los Naranjos' }, mustInclude: ['Plaza de los Naranjos', 'Tapas'],
  overrides: { interests: ['arquitectura', 'gastronomia'] }
};

test('adaptador HTTP: crear, editar, deshacer, registrarse, guardar, valorar y borrar', async () => {
  const browser = storage();
  const data = createHttpDataModule(endpoint, browser);
  const stranger = createHttpDataModule(endpoint, storage());
  assert.deepEqual(await data.getSession(), { kind: 'guest' });
  assert.equal(await data.getPreferences(), null);
  const prefs = { ...defaults, transport: ['a_pie'] };
  await data.savePreferences(prefs);
  const hints = await data.interpretRequest('Tengo 90 minutos y necesito una ruta sin escaleras.');
  assert.equal(hints.durationMinutes, 90);
  assert.deepEqual(hints.overrides.needs, ['sin escaleras']);
  const route = await data.createRoute(request);
  assert.deepEqual(route.request, request);
  assert.ok(route.stops.some(s => s.placeId === 'naranjos'));
  assert.ok(route.stops.some(s => s.placeId === 'mercado-central'));
  assert.equal(route.stops[0].arrive, '10:00');
  assert.deepEqual(await createHttpDataModule(endpoint, browser).getRoute(route.id), route);
  assert.deepEqual(await stranger.listRoutes(), []);
  assert.equal(await stranger.getPreferences(), null);
  await assert.rejects(() => stranger.getRoute(route.id), /encontrado/);
  await assert.rejects(() => data.saveRoute(route.id), /Inicia sesión/);
  assert.ok((await data.getPlace(route.stops[0].placeId)).categories.includes('arquitectura'));
  const locked = await data.refineRoute(route.id, { type: 'lock_stop', order: 1 });
  assert.equal(locked.stops[0].locked, true);
  await assert.rejects(() => data.refineRoute(route.id, { type: 'remove_stop', order: 1 }), /Desfija/);
  assert.deepEqual(await data.undo(route.id), route);
  const candidates = await data.getAlternatives(route.id, 1);
  assert.ok(candidates.length);
  const swapped = await data.refineRoute(route.id, { type: 'swap_stop', order: 1, placeId: candidates[0].id });
  assert.equal(swapped.stops[0].placeId, candidates[0].id);
  assert.deepEqual(await data.undo(route.id), route);
  const paused = await data.refineRoute(route.id, { type: 'text', value: 'añade una pausa para café' });
  assert.ok(paused.stops.some(s => s.placeId === 'marbella-cafe'));
  assert.deepEqual(await data.undo(route.id), route);
  const email = 'alex@example.org', password = 'fruta-y-rutas-1234';
  assert.equal((await data.register(email, password)).kind, 'account');
  assert.equal((await data.getSession()).email, email);
  assert.deepEqual(await data.getPreferences(), prefs);
  assert.equal((await data.saveRoute(route.id)).saved, true);
  const rating = { stars: 4, stops: { 1: true }, comment: 'Buena ruta' };
  await data.rateRoute(route.id, rating);
  assert.deepEqual((await db.query('SELECT rating FROM travel_routes WHERE id=$1', [route.id])).rows[0].rating, rating);
  await data.logout();
  assert.deepEqual(await data.listRoutes(), []);
  await data.login(email, password);
  assert.equal((await data.listRoutes())[0].id, route.id);
  await data.deleteRoute(route.id);
  assert.deepEqual(await data.listRoutes(), []);
});

test('solo Marbella: destino, salida, catálogo, fechas y accesibilidad', async () => {
  const data = createHttpDataModule(endpoint, storage());
  for (const city of ['Valencia', 'Sevilla', 'Barcelona', 'Florencia']) {
    await assert.rejects(() => data.createRoute({ ...request, city }), /exclusivamente por Marbella/);
  }
  await assert.rejects(() => data.getPlace('bcn-sagrada-familia'), /desconocido/);
  await assert.rejects(() => data.createRoute({ ...request, start: { label: 'Puerta del Sol' } }), /salida/);
  await assert.rejects(() => data.interpretRequest('Quiero una ruta por Málaga'), /exclusivamente/);
  const local = await data.createRoute({ ...request, city: '  MARBELLA ', start: { label: 'Banus' },
    mustInclude: ['Playa del Duque'], overrides: { needs: ['sin escaleras'], pace: 'relajado' } });
  assert.equal(local.request.city, 'Marbella');
  assert.equal(local.request.start.label, 'Puerto Banús');
  assert.ok(local.stops.some(s => s.placeId === 'playa-duque'));
  assert.ok(!local.stops.some(s => s.placeId === 'grabado'));
  await assert.rejects(() => data.createRoute({ ...request, date: '2026-02-30' }), /fecha/);
  await assert.rejects(() => data.createRoute({ ...request, timeWindow: { from: '18:00', to: '17:00' } }), /franja/);
  assert.equal(await data.getPreferences(), null);
  const preflight = await fetch(endpoint + '?action=deleteRoute', { method: 'OPTIONS' });
  assert.match(preflight.headers.get('access-control-allow-headers'), /X-Guest-Token/i);
  assert.match(preflight.headers.get('access-control-allow-methods'), /DELETE/);
});

test('un mensaje con varios cambios se guarda y se deshace como una unidad', async () => {
  const data = createHttpDataModule(endpoint, storage());
  const route = await data.createRoute({ ...request, timeWindow: { from: '09:00', to: '18:00' } });
  const steps = await data.refineConversation(route, ['menos_caminar', 'anadir_pausa']);
  assert.equal(steps.length, 2);
  assert.ok(steps[1].stops.some(stop => stop.placeId === 'marbella-cafe'));
  assert.equal(steps[1].version, route.version + 1);
  await assert.rejects(() => data.refineConversation(route, ['mas_barato']), /ha cambiado/);
  assert.deepEqual(await data.undo(route.id), route);
  await assert.rejects(() => data.refineConversation(route, ['anadir_pausa', 'desconocido']), /reconocido/);
  assert.deepEqual(await data.getRoute(route.id), route);
});

test('una ruta anterior de otra ciudad se conserva sin aparecer en la app de Marbella', async () => {
  const data = createHttpDataModule(endpoint, storage());
  const route = await data.createRoute(request);
  await db.query("UPDATE travel_routes SET itinerary=jsonb_set(itinerary,'{request,city}',to_jsonb('Valencia'::text)) WHERE id=$1", [route.id]);
  assert.deepEqual(await data.listRoutes(), []);
  await assert.rejects(() => data.getRoute(route.id), /encontrado/);
  await assert.rejects(() => data.undo(route.id), /encontrado/);
  assert.equal((await db.query('SELECT id FROM travel_routes WHERE id=$1', [route.id])).rows.length, 1);
});

test('adaptador HTTP: reglas de contraseña, verificación del correo y acceso con proveedores', async (t) => {
  const realFetch = globalThis.fetch;
  const mails = [];
  const env = { RESEND_API_KEY: 'test', MAIL_FROM: 'Cacahuete <no-reply@example.test>' };
  Object.assign(process.env, env);
  t.after(() => {
    for (const key of [...Object.keys(env), 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) delete process.env[key];
  });
  // Mail goes to a mocked Resend; the adapter's own requests still reach the local server.
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url) === 'https://api.resend.com/emails') {
      mails.push(JSON.parse(init.body));
      return Response.json({ id: 'mail' });
    }
    return realFetch(url, init);
  });

  const email = 'verifica@example.org';
  const data = createHttpDataModule(endpoint, storage(), { session: storage() });
  assert.deepEqual(await data.getSession(), { kind: 'guest' });
  assert.deepEqual(await data.authProviders(), []);
  await assert.rejects(() => data.register('corta@example.org', 'once-chars!'), (error) =>
    error.code === 'INVALID_INPUT' && error.status === 400 &&
    error.details.field === 'password' && error.details.reason === 'PASSWORD_TOO_SHORT');
  assert.equal((await data.register(email, 'fruta-y-rutas-1234')).emailVerified, false);
  assert.equal((await data.getSession()).emailVerified, false);
  await assert.rejects(() => data.register(email, 'fruta-y-rutas-1234'), (error) => error.code === 'EMAIL_EXISTS');
  const token = mails.at(-1).text.match(/verify-email\?token=([A-Za-z0-9_-]{43})/)[1];
  assert.deepEqual(await data.verifyEmail(token), { email });
  assert.equal((await data.getSession()).emailVerified, true);
  await assert.rejects(() => data.verifyEmail(token), (error) => error.code === 'INVALID_TOKEN' && error.status === 400);
  await assert.rejects(() => data.resendVerification(), (error) => error.code === 'ALREADY_VERIFIED');

  process.env.GOOGLE_CLIENT_ID = 'cacahuete-test.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'google-test-secret';
  const tab = storage();
  let leave;
  const left = new Promise((resolve) => { leave = resolve; });
  const browser = createHttpDataModule(endpoint, storage(), { session: tab, navigate: (url) => leave(url) });
  assert.deepEqual(await browser.authProviders(), ['google']);
  void browser.signInWith('google');
  const authorize = new URL(await left);
  assert.equal(authorize.host, 'accounts.google.com');
  const stateKey = `rt.api.${endpoint}.oauthState`;
  assert.equal(tab.getItem(stateKey), authorize.searchParams.get('state'));
  await assert.rejects(() => browser.completeSignIn('#state=wrong&ticket=x'), (error) => error.code === 'INVALID_STATE');
  assert.equal(tab.getItem(stateKey), null, 'the stored state is single use');
  await assert.rejects(() => browser.completeSignIn('#error=access_denied'), (error) => error.code === 'ACCESS_DENIED');
});
