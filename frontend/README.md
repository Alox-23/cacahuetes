# Frontend · rutas turísticas (features 1, 2 and 3)

Mobile-first web app in Spanish where a guest answers four questions inside the chat, asks the AI assistant
**Cacahuete** for a route, confirms "Esto es lo que entendí", watches the route being created and asks for
changes by chat. Feature 2 completes the app: the Route screen with a schematic map and per-stop actions, saving
routes (guest → account), register and login, Mis rutas with saved-route detail and rating, and the profile with
editable preferences and account settings. Feature 3 lets the user play Peanut Run (here "Cacahuete Run") while
the route is being created. **There is no backend:** the assistant is a client-side script and all
data lives in `localStorage`.

- Tech specs: [`docs/tech-specs/feature-1-base-y-asistente.md`](docs/tech-specs/feature-1-base-y-asistente.md),
  [`docs/tech-specs/feature-2-ruta-mis-rutas-perfil.md`](docs/tech-specs/feature-2-ruta-mis-rutas-perfil.md),
  [`docs/tech-specs/feature-3-juego-mientras-se-crea-la-ruta.md`](docs/tech-specs/feature-3-juego-mientras-se-crea-la-ruta.md)
- Design package (read only): [`docs/`](docs/README-paquete.md) — screens in `docs/design/screens/*.html`

## Run

Requires Node 22.

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # tsc --noEmit && eslint .
npm test         # vitest run (unit + React Testing Library smoke tests)
npm run build    # type-check + production build in dist/
npm run preview  # serve dist/
```

The only external request is Google Fonts (Space Grotesk, Inter). To start from scratch, clear the site's
`localStorage` (keys `rt.*`).

## URLs

| URL | Screen |
| --- | --- |
| `/` | Inicio |
| `/onboarding` | Four questions in the chat (redirects to `/chat` once preferences exist) |
| `/chat` | Main chat (redirects to `/onboarding` until preferences exist) |
| `/chat/conversation` | Request, clarifying questions and "Esto es lo que entendí" |
| `/creating` | Creating the route, with the game (redirects to `/chat` without a pending request) |
| `/route/:id` | Ruta: map, stops, quick changes, "Deshacer", save and share |
| `/route/:id/change` | Change the route by chat |
| `/route/:id/stop/:order` | Detalle de lugar: why, hours, price; change, remove, lock |
| `/route/:id/stop/:order/alternatives` | Cambiar parada: three alternatives |
| `/route/:id/save` | Guardar como invitado (accounts are redirected to the route) |
| `/register`, `/login` | Crear cuenta, Entrar (signed-in users are redirected to `/my-routes`) |
| `/my-routes` | Mis rutas: search, Próximas / Pasadas / Favoritas; empty state for guests and new accounts |
| `/my-routes/:id` | Ruta guardada: favourite, reuse, share, rate, start, delete (accounts only) |
| `/my-routes/:id/rate` | Valorar ruta (accounts only) |
| `/profile` | Perfil (account or guest card) |
| `/preferences` | Preferencias de viaje |
| `/account` | Cuenta (accounts only; guests go to `/login`) |

The tab bar is on every screen: `/my-routes*` highlights Mis rutas; `/profile`, `/preferences`, `/account`,
`/login` and `/register` highlight Perfil; everything else highlights Asistente.

## Trying feature 2

- **Example routes:** log in (any valid email and a password of 8+ characters, or "Continuar con Google / Apple")
  and the account gets three saved routes with dates relative to today: Barcelona in 12 days, Valencia with kids in
  26 days (Próximas) and Sevilla 10 days ago (Pasadas, favourite, rated 4 stars). Registering never seeds, so a new
  account starts with the empty state. Seeding happens once per account email.
- **Guest save:** create a route from the chat as a guest, tap "Guardar ruta", then "Crear cuenta": the route is
  saved and you land on its saved-route page.
- **Share:** uses `navigator.share` when available, otherwise copies a text summary (toast either way).
- **Reuse:** "Reutilizar" opens the request conversation with "Esto es lo que entendí" pre-filled (a past date
  moves to the next same weekday); "Crear ruta" creates a new route.

## Juego mientras se crea la ruta

The Creating screen (`/creating`) shows the four steps and, under them, **Peanut Run**, the one-button endless
runner from the `peanut-run-game` branch, in Spanish ("Cacahuete Run"). Tap the game, or focus it and press
Space / Up / W, to start and to jump; M toggles the sound.

- **Never interrupted:** if the game was never started, the screen goes to the route as soon as it is ready, as
  before. If the user is playing (or has played), the screen stays: the title becomes "Tu ruta está lista" and a
  banner with "Ver ruta" appears above where Cancel was. Answering "No" to "¿Otra partida?" also opens the route
  once it is ready.
- **Code:** the engine is vendored, as JavaScript, in `src/game/peanut-run/` (origin commit and the only local
  change, the `strings` option for the Spanish texts, in [`src/game/peanut-run/SOURCE.md`](src/game/peanut-run/SOURCE.md)).
  `index.d.ts` types its API; ESLint skips the vendored `.js`. `src/game/PeanutRunGame.tsx` is the React wrapper
  (creates the game once, destroys it on unmount, polls the state every 250 ms because the engine has no
  state-change event). Texts live in `es.json` under `game`.
- **Storage:** best score in `rt.peanutRun.highScore`, mute preference in `rt.peanutRun.muted`.
- **Small screens:** under 700 px of viewport height the steps card collapses to one line ("Paso 2 de 4 ·
  Trayectos calculados"). In a game slot narrower than 560 px the game-over dialog is laid out in two columns so
  its buttons are 44 px tall (scoped rules in `PeanutRunGame.module.css`; the vendored CSS is untouched).
- **Without canvas** (jsdom, very old browsers) the wrapper renders nothing and the screen behaves as if the user
  never played.

## Structure

```
src/
  main.tsx  App.tsx  router.tsx      entry, app frame, URL map and redirects
  styles/tokens.css                  CSS variables = docs/design/tokens.json (guarded by tokens.test.ts)
  styles/global.css                  reset, focus ring, app column (min(100%, 430px))
  contract/types.ts                  verbatim copy of docs/contract/types.ts
  i18n/es.json, i18n/index.ts        every user-visible string; t(), tDynamic(), useT()
  data/                              mock DataModule: storage.ts, catalog.ts, mockData.ts, defaults.ts
  assistant/                         simulated assistant: mockAssistant.ts, parser.ts, script.ts, format.ts
  state/AppState.tsx                 provider + hooks (preferences, session, current route, chats)
  components/                        shared UI (CSS Modules), exported from components/index.ts
  pages/                             screens; pages/chat/ holds the shared transcript renderers
  game/                              Peanut Run: vendored engine (peanut-run/) and the React wrapper
  lib/                               small helpers (text, time, route text, filters, share, validation, tabs)
```

Feature 2 components: `RouteMap` (schematic SVG, variants `full` / `card` / `thumb`, layout deterministic from the
stop count), `FloatingBackButton`, `Sheet`, `StopRow`, `ListRow`, `Checkbox`, `Textarea`, `StarRating`,
`ConfirmSheet` (destructive confirmations), `Toast` (rendered by the provider; `useToast().show(message)`),
`SearchField`, `IconButton`, `AlternativeOption`.

Rules kept in the code: components and pages use only CSS variables (no raw hex; the vendored game CSS under
`src/game/peanut-run/` keeps its own art and is exempt), every interactive element is at least
44 px, option chips use `aria-pressed`, the pace selector is a `radiogroup`, transcripts are `role="log"` with
`aria-live="polite"`, and `<html lang="es">`.

## Contract additions (feature 2)

Marked `// Añadido en feature 2` in `docs/contract/types.ts` (copied verbatim to `src/contract/types.ts`):
`AccountSettings`, `Session.settings`, `Rating`, and the `DataModule` methods `setFavorite`, `getRating`,
`updateAccount`, `deleteAccount`. `rateRoute` now takes a `Rating`. `listRoutes()` returns the signed-in account's
saved routes only, newest first by date (guests get `[]`).

The mock also attaches optional presentation hints to `Place` objects (`activity`, `visitMinutes`, `travel`, see
`src/lib/placeHints.ts`), used for "Visita / Paseo / Comida / Pausa" and the alternatives subtitle. They are not
part of the contract; screens fall back gracefully when a real API omits them.

## Swapping the mocks for the real API

The two integration seams are factories that implement the shared contract (`src/contract/types.ts`):

- **Data** — `createDataModule(storage)` in `src/data/mockData.ts` implements `DataModule`. Write an HTTP
  implementation with the same interface and pass it to `<AppStateProvider data={httpDataModule}>` in
  `src/App.tsx`. Nothing in `pages/` imports the mock directly.
- **Assistant** — `createAssistant(deps)` in `src/assistant/mockAssistant.ts` implements
  `Assistant.sendMessage`. Pass another factory through `<AppStateProvider assistantFactory={…}>`; it receives
  the same `deps` (data functions and an injectable delay) and must provide `sendMessage` plus `reset(mode, ctx)`.
  Since feature 2, `ctx.request` pre-fills request mode ("Reutilizar"): the next reply must be the summary.

The mock adds optional presentation hints to replies (`display`, see `src/assistant/types.ts`: intro bubble,
"Pregunta N de 4", hint, footer…). They are not part of the contract; the UI falls back to the plain
`AssistantReply` fields (`text`, `options`, `request`, `changes`) when they are absent, so a real API only has to
return the contract shape. Onboarding option values are namespaced (`"interests:museos"`) and a multi-select
answer is sent as a comma-separated `option` string.

## Simulated assistant (summary)

- **Onboarding:** 4 fixed questions; free text matches option labels and synonyms (accent-insensitive).
  "Omitir" saves the defaults from `data/defaults.ts`.
- **Request:** slots city → date → time → start, asked one at a time with quick replies. The three suggestions
  have prepared parses; free text goes through `parser.ts` (cities, "N horas", "un día", "tarde", "noche",
  weekdays, "hoy", "mañana" — see the rule at the top of the file — and must-include places).
- **Change:** quick actions and phrases ("menos caminar", "pausa", "café", "barato", "comida"…) map to
  `refineRoute` calls; one sentence can trigger several. "Deshacer" undoes every change of that reply.
- Every reply waits 500–900 ms behind a typing indicator (instant in tests via `assistantDelay`).

## Known limits

- The map is schematic (no tiles, no geocoding): marker positions depend only on the number of stops.
- Auth is simulated: no password check, no recovery, Google/Apple are mock sign-ins. Data is per device.
- Transcripts live in memory: reloading mid-conversation starts it again (preferences and routes persist).
- Catalog data (places, times, `[HORARIO]`, `[PRECIO]`) is sample content.
