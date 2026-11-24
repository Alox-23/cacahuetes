# Feature 1 · App base, design system and simulated assistant

Date: 2026-11-24 · Branch: `alex-frontend` · Source: `docs/specs/spec-1-asistente-y-base.md`

This tech spec turns spec 1 of the design package into concrete, verifiable engineering decisions. Where the package leaves a decision open, this document closes it. Where this document is silent, the package rules apply (`docs/README-paquete.md`, "Reglas que no se pueden saltar").

## 1. Goal

Ship the first usable slice of the tourist-routes frontend: a mobile-first web app where a guest completes four onboarding questions inside the chat, asks the AI assistant (Cacahuete) for a route, confirms the "Esto es lo que entendí" card, watches the route being created, lands on a route screen, and can ask for changes by chat and undo them. Everything runs in the browser with scripted replies and mock data. No backend.

## 2. Scope

### In scope (spec 1, all 10 designed screens)

| # | Screen | Design file | URL |
| --- | --- | --- | --- |
| 1 | Inicio | `Main.html` | `/` |
| 2–5 | Preguntas iniciales 1–4 | `ChatInicio1..4.html` | `/onboarding` (single screen, internal step state) |
| 6 | Chat principal | `Chat.html` | `/chat` |
| 7 | Petición y aclaración | `ChatPeticion.html` | `/chat/conversation` |
| 8 | Esto entendí | `ChatResumen.html` | `/chat/conversation` (summary is a message in the same transcript) |
| 9 | Creando la ruta | `Cargando.html` | `/creating` |
| 10 | Cambio por chat | `ChatCambio.html` | `/route/:id/change` |

Also in scope because spec 1 depends on them:

- Project base: tooling, design tokens, shared components, tab bar, i18n file, app state, local persistence.
- A **mock data module** implementing the full `DataModule` interface from `docs/contract/types.ts` (spec 2 owns it long term, but spec 1 cannot be tested without `getPreferences`, `savePreferences`, `getSession`, `createRoute`, `refineRoute`, `undo`, `getRoute`). Implement every method so the contract compiles; methods spec 1 does not exercise may be simple.
- A **placeholder Route screen** at `/route/:id` so the create flow ends somewhere real: route name, stop list with arrival times and travel legs, the four quick refine buttons, "Pide un cambio al asistente", "Deshacer" and a back-to-chat link. No map. It is replaced in feature 2 (spec 2). Mark the file with a `// TODO(feature-2)` header comment.
- **Stub screens** for destinations linked from spec 1 screens that belong to spec 2: `/preferences`, `/login`, `/my-routes`, `/profile`. Each shows a header with a back control, the screen title and the text "Pantalla pendiente (spec 2)". The tab bar must work between `/chat`, `/my-routes` and `/profile`.

### Out of scope

Map, Lugar, CambiarParada, GuardarInvitado, Registro, real Login, Mis rutas, RutaGuardada, Valorar, Perfil, Preferencias (real editing), Cuenta. Any backend, real AI or route computation. Streaming (letter-by-letter) text. Mascot animation beyond a CSS pulse on the loading screen.

## 3. Decisions (closing the open questions)

| Question | Decision | Why |
| --- | --- | --- |
| Delivery format | Responsive web app (SPA). PWA manifest later. | Fastest to merge with the parallel backend; package allows it. |
| Location in repo | `frontend/` subfolder. Package docs stay in `frontend/docs/`. | Backend is developed in parallel on another branch; a subfolder avoids root conflicts. |
| Stack | Vite 6 + React 18 + TypeScript (strict) + `react-router-dom` v6. Node 22. | Proposed by the package; no reason to deviate. |
| Styling | Plain CSS with CSS custom properties generated from `docs/design/tokens.json`. CSS Modules per component. No UI library, no Tailwind. | Tokens must be the single source; small surface, exact design match. |
| Component library | Own components (listed in §6). | Package offers the choice; designs are simple and specific. |
| i18n | All user-visible strings in `src/i18n/es.json`; a tiny `t(key, params?)` helper and `useT()` hook. No i18n dependency. | Package requires translation files; a library is overkill for one locale. |
| State | One React context (`AppStateProvider`) holding preferences, session, chat transcripts and the current route id. Persistence through the data module (localStorage). | Simple, testable, replaceable. |
| Assistant | Pure TypeScript state machine behind a single `sendMessage` function (`Assistant` interface). Replies appear whole, after a simulated delay of 500–900 ms with a typing indicator. | Spec requires a single swappable function and a visible "thinking" state. |
| Recognized free text | Cities (Barcelona, Valencia, Sevilla, Madrid, Granada, Málaga, Bilbao), hours ("5 horas"), day parts ("mañana", "tarde", "un día"), weekday names, "hoy"/"mañana" (as date), and a small list of must-include places. See §7. | Enough to make the demo feel alive; anything unrecognized falls back to slot questions. |
| Tests | Vitest for the assistant script and the mock data module (unit), plus one React Testing Library smoke test for the onboarding flow. ESLint + `tsc --noEmit` in `npm run check`. | Cheap, protects the logic that spec 2 and the backend will rely on. |
| Fonts | Google Fonts `<link>` in `index.html` (Space Grotesk 500/700, Inter 400/500/600). | Permitted by the package; it is not a backend call. |
| Desktop behaviour | App column `width: min(100%, 430px)`, centered, `min-height: 100dvh`, page background `#E7DCCB` outside the column (as in the design HTML). | Mobile first, matches the mock frame. |

## 4. Project layout

```
frontend/
  index.html
  package.json  vite.config.ts  tsconfig.json  eslint.config.js  vitest.config.ts
  public/
    mascot/cacahuete.svg          # copied from docs/design/mascot
  docs/                           # design package (read only) + tech specs
  src/
    main.tsx  App.tsx  router.tsx
    styles/
      tokens.css                  # CSS variables; values must equal docs/design/tokens.json
      global.css                  # reset, fonts, focus ring, app frame
    contract/
      types.ts                    # VERBATIM copy of docs/contract/types.ts (+ exports only)
    i18n/
      es.json  index.ts           # t(), useT()
    data/
      mockData.ts                 # implements DataModule (localStorage)
      catalog.ts                  # cities, places, prepared routes, alternatives
      storage.ts                  # safe localStorage wrapper (try/catch, JSON)
    assistant/
      mockAssistant.ts            # implements Assistant.sendMessage
      parser.ts                   # free-text → partial RouteRequest
      script.ts                   # onboarding questions, prepared replies, change recipes
      format.ts                   # labels for chips ("Sáb 5 dic", "5 horas", "A pie y metro")
    state/
      AppState.tsx                # provider + hooks (usePreferences, useSession, useChat, useCurrentRoute)
    components/
      Button/  Chip/  OptionChip/  SegmentedControl/  QuickReply/  TextField/
      ChatInput/  Card/  Header/  AssistantHeader/  TabBar/  Mascot/
      AssistantBubble/  UserBubble/  TypingIndicator/  Screen/  SummaryCard/
    pages/
      MainPage.tsx  OnboardingPage.tsx  ChatPage.tsx  ConversationPage.tsx
      CreatingPage.tsx  RoutePage.tsx (placeholder)  ChangeChatPage.tsx
      stubs/PreferencesPage.tsx  stubs/LoginPage.tsx  stubs/MyRoutesPage.tsx  stubs/ProfilePage.tsx
  tests/ (or colocated *.test.ts)
```

## 5. Design tokens

`src/styles/tokens.css` exposes every value of `docs/design/tokens.json` as a CSS variable with a predictable name: `--color-background`, `--color-primary`, `--font-heading`, `--font-size-h1`, `--radius-button`, `--space-screen-padding`, `--size-touch-target`, etc. Components use only variables, never raw hex values. Add a unit test that parses `tokens.json` and asserts every color value appears in `tokens.css` (guards drift).

Palette reminder (from spec 1): background `#FEF3E2`, primary/text `#4A2F1B`, hover `#2A1A0E`, selected `#F4AE52`, accent `#D4621A`, surface `#FFFFFF`, assistant bubble border `#E9C48A`, muted text `#6B5847`, borders `#EBD9BF`, input border `#A68A6D`.

## 6. Shared components (contract for spec 2)

All components accept `className` and forward refs where relevant. Minimum touch target 44 px everywhere.

| Component | Props (essential) | Visual (from designs) |
| --- | --- | --- |
| `Button` | `variant: "primary" \| "secondary" \| "text"`, `fullWidth`, `as` link support | Primary: 56 px, radius 16, bg primary, white 17/600. Text: min-height 44, 15/600. |
| `Chip` | `children` | Static tag: 13 px, padding 6×12, radius 999, bg selected. |
| `OptionChip` | `selected`, `onToggle`, `children` | Toggle, `aria-pressed`. Selected: bg selected, border 2 px primary, 600. Unselected: white, 1 px `#A68A6D`, 500. 44 px high, radius 22. |
| `SegmentedControl` | `options`, `value`, `onChange` | Track `#F3E0C4`, radius 14, padding 4; selected segment white, radius 10. `role="radiogroup"`. |
| `QuickReply` | `label`, `onClick` | 44 px pill, white, 1.5 px primary border, 14/600. |
| `TextField` | `label`, `type`, `error` | Visible label (used by spec 2 forms). |
| `ChatInput` | `placeholder`, `onSend`, `disabled` | 48 px input, radius 24, bg background, border `#A68A6D`; 48 px round send button with up-arrow icon; white bar with top border. |
| `Card` | `children`, `padding` | White, 1 px border `#EBD9BF`, radius 20. |
| `Header` | `title`, `onBack?`, `right?` | 44 px row, back icon 44×44 with `-12px` left margin. |
| `AssistantHeader` | `onBack?`, `onSkip?` | Mascot 34–38 px, "Cacahuete" 16/600, "Asistente de IA" 13 muted, optional "Omitir" (44 px). |
| `TabBar` | `active` | 72 px, 3 columns, icons from designs, labels 12 px. Uses NavLink. |
| `Mascot` | `size` | Inline SVG from `docs/design/mascot/cacahuete.svg`, `aria-hidden` unless labelled. |
| `AssistantBubble` | `children`, `label?` | White, 2 px `#E9C48A` border, radius `20 20 20 4`, padding 14×16, 15/1.45, max-width 318. Always starts with "Cacahuete · IA" label row (20 px mascot + 13/600 `#7A4E22`). |
| `UserBubble` | `children` | Primary bg, white text, radius `20 20 4 20`, max-width 280. |
| `TypingIndicator` | – | Assistant bubble with three animated dots; `aria-live="polite"` text "Cacahuete está escribiendo". |
| `Screen` | `children`, `tabBar?`, `padding?` | Column flex, `min-height: 100dvh`, app frame. |
| `SummaryCard` | `request`, `preferences`, `onCreate`, `onChangePreferences` | "Esto es lo que entendí" (Space Grotesk 20/700), two groups "De tu mensaje" / "De tus preferencias" with chips, "Crear ruta" primary, hint text. |

## 7. Simulated assistant

Single entry point (`src/assistant/mockAssistant.ts`):

```ts
export function createAssistant(deps: { getPreferences: () => Promise<Preferences | null>; now?: () => Date }): Assistant & {
  reset(mode: "onboarding" | "request" | "change", ctx?: { route?: Route }): void;
}
```

`sendMessage` resolves after a simulated delay (500–900 ms, deterministic in tests via an injectable `delay`). The UI shows `TypingIndicator` while pending. All returned text comes from `es.json`.

### 7.1 Onboarding mode

Fixed script of 4 questions. The first reply contains two bubbles' worth of text (present as IA + "4 preguntas rápidas…") and question 1. Each step's `options` carry `multiple` and the screen renders:

1. Interests: 8 `OptionChip` (multi) + "Listo". Values: `arquitectura, gastronomia, museos, naturaleza, historia, compras, vida_nocturna, arte_urbano`.
2. Pace (`SegmentedControl`: relajado / equilibrado / intenso) and transport (`OptionChip` multi: a_pie, transporte_publico, coche, bici) + "Listo". The reply starts with "Apuntado.".
3. Company (`QuickReply`: solo, pareja, con_ninos, grupo). Tapping advances.
4. Budget (`QuickReply`: bajo, medio, alto) with hint "Afecta a las entradas y a los sitios para comer. Es la última pregunta.". Tapping finishes: preferences are saved and the app navigates to `/chat`.

When the user answers, their choice is echoed as a `UserBubble` with human labels ("Arquitectura y gastronomía", "Relajado, a pie y en transporte público", "En pareja").

Free text in onboarding: match option labels case- and accent-insensitively (e.g. "museos y arte urbano" selects both). If nothing matches, the assistant replies with the "no lo he entendido, elige una opción" text and the question stays open. "Omitir" at any step saves defaults: interests `["arquitectura","gastronomia"]`, pace `"equilibrado"`, transport `["a_pie","transporte_publico"]`, company `"solo"`, budget `"medio"`, needs `[]`.

Onboarding is complete when `getPreferences()` returns non-null. `/onboarding` redirects to `/chat` when complete; `/chat` redirects to `/onboarding` when not (acceptance: questions never repeat after reload).

### 7.2 Request mode (slot filling)

A `RouteRequest` needs four slots: `city`, `date`, `timeWindow`, `start`. `mustInclude` and `overrides` are optional extras.

The three suggestions of the main chat have prepared parses:

| Suggestion | Parsed | Still missing |
| --- | --- | --- |
| "5 horas en Barcelona, arquitectura y tapas" | city Barcelona; 5 h; mustInclude ["Sagrada Família", "Tapas"]; overrides.interests ["arquitectura","gastronomia"] | date, start |
| "Un día en Valencia con niños" | city Valencia; 10:00–19:00; overrides.company "con_ninos" | date, start |
| "Tarde tranquila en Sevilla, a pie" | city Sevilla; 16:00–20:00; overrides.pace "relajado", overrides.transport ["a_pie"] | date, start |

Free text goes through `parser.ts`: city list, `N horas`, "un día"/"todo el día" (10:00–19:00), "mañana" as day part (09:00–13:00) vs "mañana" as date (when preceded by "para"/"el día de" or standalone with no other time words it is the date; keep the rule simple and documented), "tarde" (16:00–20:00), "noche" (19:00–23:00), weekday names (next occurrence from `now`), "hoy", "el sábado", and must-include places from the catalog. A duration without a start hour starts at 10:00.

Slot questions are asked one at a time in the order city → date → time → start, each with quick replies:

- city: Barcelona, Valencia, Sevilla
- date: Hoy, Mañana, Este sábado
- time: 3 horas, 5 horas, Todo el día
- start: Mi ubicación actual, Mi hotel, Otra dirección (then the next free text becomes `start.label`)

The reply text for the start question matches the design: "Hecho, ya tengo ciudad, día, duración y dos imprescindibles. Solo me falta un dato: ¿desde dónde sales?" (built from what is known). When text is totally unrecognized, reply with the generic "Cuéntame ciudad, día, cuánto tiempo tienes y desde dónde sales" and ask the city with quick replies.

When all four slots are filled the reply is `kind: "summary"` with the `request`. The UI renders `SummaryCard`. Chips "De tu mensaje": city, date ("Sáb 5 dic"), duration ("5 horas"), start ("Desde mi hotel"), each must-include, each override as a human label. Chips "De tus preferencias": company, pace, transport ("A pie y metro"), budget ("Presupuesto medio"), taken from saved preferences minus any overridden field. "Cambiar" links to `/preferences`. Further free text after the summary re-parses and returns an updated summary.

"Crear ruta" navigates to `/creating`, which calls `createRoute(request)` and shows four steps (Lugares seleccionados, Trayectos calculados, Ordenando las paradas, Comprobando horarios) advancing every ~600 ms with check / spinner / pending icons as in `Cargando.html`, then navigates to `/route/:id`. "Cancelar" returns to the conversation with the summary intact.

### 7.3 Change mode

Entered from `/route/:id/change`. Header chip shows route name and "N paradas". Initially the assistant offers the four quick actions as quick replies (Menos caminar, Más comida, Más barato, Añadir pausa) plus free text. Recognized phrases map to `RefineAction`s:

- "menos caminar", "andar menos" → `menos_caminar`
- "pausa", "café", "descanso" → `anadir_pausa`
- "barato", "ahorrar" → `mas_barato`
- "comida", "comer", "tapas", "restaurante" → `mas_comida`

A sentence can trigger several (the design sentence "Menos caminar, y añade una pausa para café." triggers two). The assistant calls `refineRoute` for each, and replies `kind: "change"` with `changes` bullets derived from the diff (e.g. "De Casa Batlló al mercado vas en metro en lugar de a pie.", "Pausa de 20 min para café después de Casa Batlló.") and a final line "La ruta termina ahora a las HH:MM." The bubble shows "Ver ruta actualizada" (primary, to `/route/:id`) and "Deshacer" (text button → `undo(id)` → short confirmation reply). Unrecognized text → "No he entendido el cambio" with the four quick replies again.

## 8. Mock data module

`src/data/mockData.ts` exports `createDataModule(storage): DataModule` and a default instance. Keys: `rt.preferences`, `rt.session`, `rt.routes` (`Record<id, Route[]>` versions, last = current), `rt.ratings`. Each method resolves asynchronously (`await delay(30)`). Empty storage must boot cleanly.

- `createRoute(request)`: picks 4–5 places from `catalog.ts` for the city, favouring `mustInclude` and interests (saved preferences merged with overrides), then schedules sequentially from `timeWindow.from` using each place's `visitMinutes` and travel legs (mode from transport preference, minutes from the catalog's adjacency or a default of 15). Route name: `"${city} en ${hours} horas"` or `"Un día en ${city}"`. Cities without catalog get 4 generic places ("Centro histórico", "Mercado central", "Mirador", "Parque principal"). `version: 1, saved: false, favorite: false`.
- `refineRoute(id, action)`: creates a new version:
  - `menos_caminar`: walking legs > 15 min become `transporte_publico` with roughly half the minutes.
  - `mas_comida`: inserts a food place from the catalog after the stop nearest 13:00 (or at the end).
  - `mas_barato`: replaces the first unlocked paid place with a free alternative.
  - `anadir_pausa`: inserts "Pausa para café" (20 min) after stop 2.
  - `remove_stop`, `lock_stop`, `swap_stop`: implement plainly (spec 2 needs them).
  - `text`: parse with the same keyword table as §7.3.
  Arrival times are recomputed after every change. `version` increments.
- `undo(id)`: drops the last version if more than one exist.
- `getRoute`, `listRoutes`, `saveRoute`, `deleteRoute`, `rateRoute`, `getPlace`, `getAlternatives`: straightforward.
- `getSession` defaults to `{ kind: "guest" }`; `register`/`login` store `{ kind: "account", email, name }` without validation; `logout` returns to guest and keeps preferences and routes.

The Barcelona catalog must include at least: Sagrada Família, Casa Batlló, Mercat de la Boqueria, Barri Gòtic, Parc de la Ciutadella, Bar del Pla (tapas), Café (pausa), each with `categories`, `why`, `hours: "[HORARIO]"`, `price: "[PRECIO]"` and `paid: boolean`.

## 9. App state and persistence

`AppStateProvider` loads preferences, session and current route id on mount (show nothing until loaded to avoid redirect flicker). Exposes `usePreferences()`, `useSession()`, `useCurrentRoute()`. Chat transcripts live in memory per mode (onboarding, request, change) inside the provider so navigating to `/preferences` and back keeps the conversation. A preferences change made elsewhere must be reflected in `/chat` on return (the provider re-reads on `savePreferences`).

## 10. Screens: behaviour details

- **Main** (`/`): logo row with mascot 28 px + `[NOMBRE APP]`, "Entrar" link to `/login`; h1 36 px Space Grotesk; subtitle; example card with the static SVG map (copy from design) and four example rows; bottom block pushed with `margin-top: auto`: "Planificar mi ruta" → `/onboarding` (or `/chat` if onboarding is done) and the note text.
- **Onboarding** (`/onboarding`): `AssistantHeader` with "Omitir"; transcript area `justify-content: flex-end`, gap 14, padding `12 20 16`, scrollable, auto-scrolls to the bottom on new messages; `ChatInput` with placeholder "O escríbelo con tus palabras". Options and "Listo" render inside the current assistant bubble.
- **Chat** (`/chat`): title "Asistente" 28 px + "IA" badge with mascot 20 px; preferences card ("Tus preferencias guardadas", "Cambiar" → `/preferences`, chips from saved preferences); bottom block: mascot 72 px, h1 "Soy Cacahuete. ¿Qué ruta te preparo hoy?", helper text, three suggestion buttons (min-height 52, radius 16, white, border); `ChatInput` placeholder "Escribe tu petición"; `TabBar` active "Asistente". Sending text or tapping a suggestion starts request mode and navigates to `/chat/conversation` with the message pre-dispatched.
- **Conversation** (`/chat/conversation`): `AssistantHeader` with back to `/chat`; transcript; under the last question a muted note "El asistente solo pregunta lo que falta. Tus preferencias guardadas se aplican solas."; `ChatInput` placeholder "Responde o añade algo", and "Corrige o añade algo" once a summary exists. Redirects to `/chat` if the transcript is empty.
- **Creating** (`/creating`): padding `24 24 16`; static SVG map (copy from `Cargando.html`), mascot 56 px with pulse animation, h1 24 px "Cacahuete está creando tu ruta", subtitle "Barcelona · sáb 5 dic · 5 horas"; steps card; "Cancelar" text button centered at the bottom. Redirects to `/chat` if there is no pending request.
- **Route placeholder** (`/route/:id`): `Header` with back to `/chat`, route name, date line, stop list (order badge in `#F4AE52`, name, arrive, travel leg line), quick refine buttons (4 `QuickReply`), "Pide un cambio al asistente" (secondary) → `/route/:id/change`, "Deshacer" text button disabled when `version === 1`. Shows `version` small and muted.
- **Change chat** (`/route/:id/change`): as §7.3; `ChatInput` placeholder "Pide otro cambio".

## 11. Accessibility and UX rules (verify these)

- Every interactive element ≥ 44×44 px; `OptionChip` uses `aria-pressed`; `SegmentedControl` is a radio group; chat transcript is `role="log"` with `aria-live="polite"`.
- Visible focus ring (2 px `--color-accent` outline offset 2 px).
- Text contrast ≥ 4.5:1 (all token pairs used in designs comply; do not introduce new light-on-light combinations).
- Primary action in the bottom third; chat anchored to the bottom; no empty gap under content.
- Works at 360 px wide (no horizontal scroll) and matches designs at 390 px.
- `<html lang="es">`; all strings from `es.json`.

## 12. Acceptance checklist (reviewer runs this)

- [ ] `npm install && npm run check && npm test && npm run build` pass from `frontend/`.
- [ ] `npm run dev` serves the app; `/` renders Main matching `Main.html` at 390 px.
- [ ] Guest completes the 4 questions in the chat and lands on `/chat` without registering; reload keeps them on `/chat`; `/onboarding` redirects to `/chat` afterwards.
- [ ] "Omitir" on any step lands on `/chat` with default preferences shown as chips.
- [ ] First assistant message explicitly says it is an AI ("tu asistente de IA"), and every assistant bubble shows "Cacahuete · IA".
- [ ] Each of the three suggestions leads to one or more slot questions with quick replies, then a summary with the two separated groups, then `/creating`, then `/route/:id` with stops and times.
- [ ] Free text "hola" (unrecognized) gets a reply asking for city/date/time/start with quick replies.
- [ ] From the route screen, "Pide un cambio al asistente" → typing "Menos caminar, y añade una pausa para café." produces a change reply with two bullets and a new end time; "Ver ruta actualizada" shows the new version; "Deshacer" restores the previous one.
- [ ] Typing indicator appears before each assistant reply.
- [ ] No `fetch`/`XMLHttpRequest`/`axios` anywhere in `src/` (grep). Google Fonts is the only external request.
- [ ] Tokens test passes; no raw hex colours in component CSS (grep `#[0-9A-Fa-f]{6}` in `src/components` and `src/pages` returns nothing).
- [ ] Tab bar navigates between Asistente, Mis rutas (stub) and Perfil (stub).
- [ ] Layout holds at 360 px and 390 px widths; no horizontal scrollbar.
- [ ] Files `src/contract/types.ts` and `docs/contract/types.ts` are identical apart from `export` keywords.

## 13. Implementation plan (for the implementing agent)

1. **Scaffold** `frontend/` with `npm create vite@latest . -- --template react-ts`, add `react-router-dom`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`. Scripts: `dev`, `build`, `preview`, `check` (`tsc --noEmit && eslint .`), `test` (`vitest run`). Add `frontend/.gitignore` for `node_modules`, `dist`.
2. **Tokens and global styles**: `tokens.css` from `tokens.json`, `global.css` (reset, fonts, focus, app frame), Google Fonts link, `lang="es"`, `<title>` from i18n app name.
3. **Contract and i18n**: copy `types.ts`; create `es.json` with every string from the 10 designs and this spec; `t()` helper.
4. **Storage and mock data module**: `storage.ts`, `catalog.ts`, `mockData.ts`, unit tests (create, refine each quick action, undo, persistence round-trip, empty boot).
5. **Assistant**: `format.ts`, `parser.ts`, `script.ts`, `mockAssistant.ts`, unit tests (onboarding path, skip defaults, three suggestions, unrecognized text, slot order, summary groups, change recipes, undo message).
6. **Shared components** (§6) with CSS Modules; a quick visual check page is not required.
7. **State provider and router** (§9, URLs in §2) including redirects.
8. **Pages** in flow order: Main → Onboarding → Chat → Conversation → Creating → Route placeholder → Change chat → stubs.
9. **Smoke test**: RTL test that walks onboarding with option taps and asserts navigation to `/chat` and saved preferences.
10. **Self-review** against §12, fix, then write `frontend/README.md` (how to run, structure, how to swap the mock assistant/data module for the API).

## 14. Notes for the merge with the backend

- The only integration seams are `src/assistant/mockAssistant.ts` (`Assistant`) and `src/data/mockData.ts` (`DataModule`). Both are created through factory functions so an HTTP implementation can be dropped in without touching pages.
- Keep `src/contract/types.ts` as the single shared type source; propose changes in `docs/contract/types.ts` first.
