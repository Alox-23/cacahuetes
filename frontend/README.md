# Frontend · rutas turísticas (feature 1)

Mobile-first web app in Spanish where a guest answers four questions inside the chat, asks the AI assistant
**Cacahuete** for a route, confirms "Esto es lo que entendí", watches the route being created and asks for
changes by chat. **There is no backend:** the assistant is a client-side script and all data lives in
`localStorage`.

- Tech spec: [`docs/tech-specs/feature-1-base-y-asistente.md`](docs/tech-specs/feature-1-base-y-asistente.md)
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
| `/creating` | Creating the route (redirects to `/chat` without a pending request) |
| `/route/:id` | Route — **placeholder** until feature 2 |
| `/route/:id/change` | Change the route by chat |
| `/preferences`, `/login`, `/my-routes`, `/profile` | Stubs owned by spec 2 |

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
  lib/                               small helpers (text, time, route end time, refine keywords)
```

Rules kept in the code: components use only CSS variables (no raw hex), every interactive element is at least
44 px, option chips use `aria-pressed`, the pace selector is a `radiogroup`, transcripts are `role="log"` with
`aria-live="polite"`, and `<html lang="es">`.

## Swapping the mocks for the real API

The two integration seams are factories that implement the shared contract (`src/contract/types.ts`):

- **Data** — `createDataModule(storage)` in `src/data/mockData.ts` implements `DataModule`. Write an HTTP
  implementation with the same interface and pass it to `<AppStateProvider data={httpDataModule}>` in
  `src/App.tsx`. Nothing in `pages/` imports the mock directly.
- **Assistant** — `createAssistant(deps)` in `src/assistant/mockAssistant.ts` implements
  `Assistant.sendMessage`. Pass another factory through `<AppStateProvider assistantFactory={…}>`; it receives
  the same `deps` (data functions and an injectable delay) and must provide `sendMessage` plus `reset(mode, ctx)`.

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

- The Route screen is a list placeholder (`// TODO(feature-2)`), no map.
- Transcripts live in memory: reloading mid-conversation starts it again (preferences and routes persist).
- Catalog data (places, times, `[HORARIO]`, `[PRECIO]`) is sample content.
