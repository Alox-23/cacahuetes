# Frontend · rutas turísticas (features 1–3)

Mobile-first web app in Spanish where a guest answers four questions inside the chat, asks the AI assistant
**Cacahuete** for a route, confirms "Esto es lo que entendí", watches the route being created and asks for
changes by chat. Feature 2 completes the app: the Route screen with a schematic map and per-stop actions, saving
routes (guest → account), register and login, Mis rutas with saved-route detail and rating, and the profile with
editable preferences and account settings. The app can use the Cacahuete HTTP API and PostgreSQL (see
[the backend README](../backend/README.md)) or run the standalone demo, where the assistant is a client-side
script and all data lives in `localStorage`.

Feature 3 makes it one responsive codebase: below 768 px it is the mobile app; from 1,024 px a desktop window with a
sidebar, an always-visible chat and a right panel that appears when there is a route, a saved route or settings to show.

- Tech specs: [`docs/tech-specs/feature-1-base-y-asistente.md`](docs/tech-specs/feature-1-base-y-asistente.md),
  [`docs/tech-specs/feature-2-ruta-mis-rutas-perfil.md`](docs/tech-specs/feature-2-ruta-mis-rutas-perfil.md),
  [`docs/tech-specs/feature-3-version-de-escritorio.md`](docs/tech-specs/feature-3-version-de-escritorio.md)
  (desktop and chat interface; §12 explains how it was ported onto this branch)
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

For the API, prepare the database and start the backend as described in [the backend README](../backend/README.md).
Copy `.env.example` to `.env.local` in this directory and restart Vite. For deployment, set
`VITE_CACAHUETE_API_URL` to the full public function URL before building. Leaving it unset starts the standalone demo.
To start from scratch, clear the site's `localStorage` (keys `rt.*`).

## Layouts

| Width | Arrangement |
| --- | --- |
| < 768 px | Mobile screens, column `min(100%, 430px)`, bottom tab bar |
| 768–1,023 px | The same mobile screens in a centred `min(100%, 560px)` column |
| ≥ 1,024 px | Desktop shell capped at 1,440 px: sidebar 240 px · chat · right panel (only when there is something to show) |

`useLayout()` (`src/lib/useLayout.tsx`) picks the route tree with `matchMedia`; widths stay in CSS. Tests force a
layout with `<LayoutProvider value="desktop">`. Both layouts share the URLs, the conversation and the route state,
so resizing never loses the place.

## URLs

One URL space for both layouts.

| URL | Mobile / tablet | Desktop |
| --- | --- | --- |
| `/` | Inicio | Inicio in two columns, no sidebar or chat; "Entrar" opens the login dialog over it |
| `/onboarding` | Four questions in the chat (redirects to `/chat` once preferences exist) | The questions in the full-width chat; "Omitir" in the chat header |
| `/chat` | Main chat (redirects to `/onboarding` until preferences exist) | Full-width chat with the suggestions and a collapsible preferences strip |
| `/chat/conversation` | Request, clarifying questions and "Esto es lo que entendí" | The same conversation in the full-width chat |
| `/creating` | Creating the route (redirects to `/chat` without a creation in progress) | Progress bubble in the chat, no panel yet |
| `/route/:id` | Ruta: map, stops, quick changes, "Deshacer", save and share | Route panel next to the chat; map and list linked; reorder (mock data only) |
| `/route/:id/change` | Change the route by chat | Redirects to `/route/:id` (the chat is already next to the route) |
| `/route/:id/stop/:order` | Detalle de lugar: why, hours, price; change, remove, lock | Slide-over on the stop list |
| `/route/:id/stop/:order/alternatives` | Cambiar parada: three alternatives | Dialog over the stop detail |
| `/route/:id/save` | Guardar como invitado (accounts are redirected to the route) | Dialog "Crea una cuenta para guardarla" (register and save in one step) |
| `/register`, `/login` | Crear cuenta, Entrar (signed-in users are redirected to `/my-routes`) | Dialog over the view that opened it (`location.state.background`) |
| `/my-routes` | Mis rutas: search, Próximas / Pasadas / Favoritas; empty state for guests and new accounts | Sidebar "Mis rutas" open, no panel |
| `/my-routes/:id` | Ruta guardada: favourite, reuse, share, rate, start, delete (accounts only) | Saved route panel; the chat opens it with quick replies |
| `/my-routes/:id/rate` | Valorar ruta (accounts only) | Dialog over the saved route |
| `/profile`, `/preferences`, `/account` | Perfil, Preferencias de viaje, Cuenta (accounts only; guests go to `/login`) | Settings panel with tabs Datos personales / Preferencias / Cuenta |

On mobile the tab bar is on every screen: `/my-routes*` highlights Mis rutas; `/profile`, `/preferences`,
`/account`, `/login` and `/register` highlight Perfil; everything else highlights Asistente. On desktop the sidebar
replaces it.

## Trying feature 2

- **Example routes:** log in (any valid email and a password of 8+ characters, or "Continuar con Google / Apple")
  and the account gets three saved Marbella routes with dates relative to today: Plaza de los Naranjos in 5 hours
  (in 12 days); "Puerto Banús con niños, día completo" in 26 days (both in Próximas); and "Paseo marítimo, tarde
  tranquila" 10 days ago (Pasadas, favourite, rated 4 stars). Registering never seeds, so a new account starts with
  the empty state. Seeding happens once per account email (routes from other destinations left in storage do not
  count).
- **Guest save:** create a route from the chat as a guest, tap "Guardar ruta", then "Crear cuenta": the route is
  saved and you land on its saved-route page.
- **Share:** uses `navigator.share` when available, otherwise copies a text summary (toast either way).
- **Reuse:** "Reutilizar" opens the request conversation with "Esto es lo que entendí" pre-filled (a past date
  moves to the next same weekday); "Crear ruta" creates a new route.

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
  state/AppState.tsx                 provider + hooks: preferences, session, one conversation thread, route creation,
                                     route revision (every mutation through `useData()` refreshes route views)
  state/thread.ts                    thread items, mode views, persistence helpers (pure, unit-tested)
  components/                        shared UI (CSS Modules), exported from components/index.ts
                                     (incl. Dialog, SlideOver, useModal for desktop)
  features/<area>/                   content shared by both layouts, extracted from the feature 2 pages:
                                     route/ (RouteView, StopDetail, AlternativesList, useRouteScreen),
                                     account/AuthForm, myRoutes/ (SavedRouteView, RateForm, useSavedRouteScreen),
                                     profile/ (PreferencesForm, AccountForm, useAccountForm, ProfileCard)
  pages/                             mobile screens (thin wrappers around features/ where desktop reuses the content);
                                     pages/chat/ holds the shared transcript renderers
  shell/                             desktop: DesktopRoutes (guards, dialogs), DesktopShell, Sidebar, ChatDock (the
                                     one desktop chat), DesktopPanels, DesktopDialogs, DesktopMain (Inicio)
  lib/                               small helpers (text, time, route text, filters, share, validation, tabs,
                                     breakpoints, useLayout)
```

Feature 2 components: `RouteMap` (schematic SVG, variants `full` / `card` / `thumb`, layout deterministic from the
stop count), `FloatingBackButton`, `Sheet`, `StopRow`, `ListRow`, `Checkbox`, `Textarea`, `StarRating`,
`ConfirmSheet` (destructive confirmations), `Toast` (rendered by the provider; `useToast().show(message)`),
`SearchField`, `IconButton`, `AlternativeOption`.

Rules kept in the code: components use only CSS variables (no raw hex), every interactive element is at least
44 px, option chips use `aria-pressed`, the pace selector is a `radiogroup`, transcripts are `role="log"` with
`aria-live="polite"`, and `<html lang="es">`.

## Contract additions (feature 2)

Marked `// Añadido en feature 2` in `docs/contract/types.ts` (copied verbatim to `src/contract/types.ts`):
`AccountSettings`, `Session.settings`, `Rating`, and the `DataModule` methods `setFavorite`, `getRating`,
`updateAccount`, `deleteAccount`. `rateRoute` now takes a `Rating`. `listRoutes()` returns the signed-in account's
saved routes only, newest first by date (guests get `[]`).

The HTTP adapter (`src/data/httpData.ts`) implements these four methods and the favourite flag from the browser's
`localStorage` until the API provides actions for them (marked `TODO(backend)`); `deleteAccount` only signs out.

The mock also attaches optional presentation hints to `Place` objects (`activity`, `visitMinutes`, `travel`, see
`src/lib/placeHints.ts`), used for "Visita / Paseo / Comida / Pausa" and the alternatives subtitle. They are not
part of the contract; screens fall back gracefully when a real API omits them.

## Contract addition (feature 3)

`RefineAction` gains `{ type: "move_stop"; order: number; to: number }` (marked `// Añadido en feature 3`): move a
stop and recompute legs and times, as a new undoable version. **Pending backend work:** the mock implements it and
declares `capabilities: { moveStop: true }` (`src/data/capabilities.ts`); the HTTP adapter has no endpoint for it,
so the desktop reorder controls (drag and drop, up/down buttons) are hidden when the API is used.

## Chat (spec 4)

- One component everywhere: mobile screens, desktop full width (column centred at 680 px) and desktop next to a
  panel (400–480 px). Bubbles: assistant `min(100%, 520px)`, user `min(80%, 460px)`, radius 22 with a 6 px corner.
- The input is a textarea that grows to four lines: Enter sends, Shift+Enter breaks the line (not during IME input).
- New messages scroll into view only when the reader is near the bottom; otherwise a "Mensaje nuevo" button appears.
- Answered questions stay in the history with their options disabled and the chosen one pressed; each user bubble
  has a hidden "Tú:" for screen readers.
- **One thread**: every item carries its assistant mode and that mode's epoch. Mobile screens show one mode's live
  epoch (feature 1 behaviour); the desktop chat shows the whole thread, older items read-only. The last 200 items are
  kept in `rt.thread` and come back after a reload as history: the assistants start fresh and change mode is re-armed
  for the current route silently, so the desktop route view does not greet again under the restored history.

## API integration

The two integration seams are factories that implement the shared contract (`src/contract/types.ts`):

- **Data** — `src/App.tsx` selects `createHttpDataModule` when the endpoint is configured. The adapter implements
  `DataModule` for accounts, guest drafts, preferences, route versions, stops and ratings.
- **Assistant** — `createAssistant(deps)` in `src/assistant/mockAssistant.ts` implements
  `Assistant.sendMessage`. Pass another factory through `<AppStateProvider assistantFactory={…}>`; it receives
  the same `deps` (data functions and an injectable delay) and must provide `sendMessage` plus `reset(mode, ctx)`.
  Since feature 2, `ctx.request` pre-fills request mode ("Reutilizar"): the next reply must be the summary.
  In API mode it uses Cacahuete to interpret free-text requests. The browser handles the conversation and
  confirmation. PostgreSQL stores the route created from the confirmed summary and its edits.

The mock adds optional presentation hints to replies (`display`, see `src/assistant/types.ts`: intro bubble,
"Pregunta N de 4", hint, footer…). They are not part of the contract; the UI falls back to the plain
`AssistantReply` fields (`text`, `options`, `request`, `changes`) when they are absent, so a real API only has to
return the contract shape. Onboarding option values are namespaced (`"interests:museos"`) and a multi-select
answer is sent as a comma-separated `option` string.

## Simulated assistant (summary)

- **Onboarding:** 4 fixed questions; free text matches option labels and synonyms (accent-insensitive).
  "Omitir" saves the defaults from `data/defaults.ts`.
- **Request:** Marbella is fixed; slots date → time → local starting point, asked one at a time with quick replies. The three suggestions
  have prepared parses; free text goes through `parser.ts` (Marbella landmarks, "N horas", "un día", "tarde", "noche",
  weekdays, "hoy", "mañana" — see the rule at the top of the file — and must-include places).
- **Change:** quick actions and phrases ("menos caminar", "pausa", "café", "barato", "comida"…) map to
  `refineRoute` calls; one sentence can trigger several. "Deshacer" undoes every change of that reply.
- Every reply waits 500–900 ms behind a typing indicator (instant in tests via `assistantDelay`).

## Known limits

- Desktop reorder is mock-only until the API supports `move_stop` (see above).
- The desktop chat answers "Cambiar la hora" / "Añadir una parada" (saved-route quick replies) with the change
  assistant's generic reply: the script has no time or add-stop recipes.
- A reload restores the conversation as read-only history; an answer in progress is not resumed and a creation
  interrupted by a reload shows as cancelled.

- The map is schematic (no tiles, no geocoding): marker positions depend only on the number of stops.
- Auth is simulated: no password check, no recovery, Google/Apple are mock sign-ins. Data is per device.
- The live API and standalone demo use the same Marbella landmarks and coordinates. Travel and visit times are estimates.
