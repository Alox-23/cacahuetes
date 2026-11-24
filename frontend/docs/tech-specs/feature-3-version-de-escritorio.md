# Feature 3 · Desktop version and chat interface

Date: 2026-11-24 · Branch: `alex-frontend` · Sources: `docs/specs/spec-3-version-de-escritorio.md`, `docs/specs/spec-4-interfaz-de-chat.md`, `docs/design/desktop/*.html`, `docs/README-paquete-escritorio.md` · Builds on: `feature-1-base-y-asistente.md` (implemented) and `feature-2-ruta-mis-rutas-perfil.md` (specified, **not yet implemented**)

This is the implementation plan for the desktop design package. It turns specs 3 and 4 into engineering decisions on top of the current codebase. Where the package leaves a decision open, this document closes it. Where this document is silent, the package specs and the feature 1 and 2 tech specs apply. If a design HTML contradicts a spec, the spec wins.

## 1. Goal

One responsive codebase. Below 768 px the app is the mobile app, unchanged apart from the new chat bubble measurements of spec 4. At 1,024 px and above it is a three-zone window: sidebar, an always-visible chat, and a right panel that exists only when there is something to show (a finished route, a saved route, or settings). No backend, same contract, same mock assistant and data module.

## 2. Starting point (what is true on this branch today)

- Feature 1 is implemented: app frame, tokens, components, mock data module, scripted assistant, and the chat screens. `npm run check` and `npm test` pass (44 tests).
- Feature 2 exists only as a tech spec. `/route/:id` is a list placeholder; `/my-routes`, `/profile`, `/preferences`, `/login` are stubs. There is no map, no saving, no account, no rating, no settings.
- The chat is split over five routes (`/onboarding`, `/chat`, `/chat/conversation`, `/creating`, `/route/:id/change`) with three independent in-memory transcripts (`chats.onboarding | request | change` in `src/state/AppState.tsx`). `startChat` wipes a transcript. Nothing about the conversation is persisted.
- `.app-frame` is a single column `min(100%, 430px)`; `Screen` always renders the bottom `TabBar`.
- `src/styles/tokens.test.ts` guards `tokens.css` against `docs/design/tokens.json`, which now has two new sections, `desktop` and `chatBubble`, that the CSS does not cover yet.

Consequence: the desktop right panel, the Mis rutas dropdown, every dialog and the settings page all need feature 2 content that does not exist. **Feature 2 is therefore built as part of this work (phase 2), not assumed.** It is built once, in a layout-agnostic way, so mobile pages and desktop panels share the same content components.

## 3. Decisions (closing the open questions of specs 3 and 4)

| Question | Decision |
| --- | --- |
| Who builds desktop | One pass over the whole app, in the phases of §10. |
| Design the missing desktop screens first? | No. Implement from spec 3 and the seven designed screens; undesigned states follow §8. |
| Breakpoints | As proposed: tablet 768, desktop 1024, max content 1440. Exposed as tokens. |
| Tablet tier (768–1,023) | The mobile layout, centred, column `min(100%, 560px)`. No two-column tablet layout. Below 768 the column stays `min(100%, 430px)` as today. |
| Sidebar | Always open at 240 px. No collapsed state. |
| Chat / panel divider | Not draggable. Chat column is `clamp(400px, 34%, 480px)` when a panel is present. |
| Extra keyboard shortcuts | None beyond Enter / Shift+Enter / Esc / Tab. |
| Bubble tail | No drawn tail; the 6 px corner is enough. |
| Grouping consecutive messages | No grouping; every assistant bubble keeps its label. |
| Message timestamps | Not shown. |
| Typing indicator / delay | Existing three-dot indicator, now inside an assistant bubble with its label; existing 500–900 ms delay. |
| Text reveal | All at once. |
| History size | Last 200 thread items are kept in `localStorage`. |
| Edit / resend last message | No. |
| Layout switch mechanism | A `useLayout()` hook over `matchMedia` returns `'mobile' \| 'tablet' \| 'desktop'`. Structure is chosen in JS (the route tree differs); widths are CSS. Tablet uses the mobile structure. |
| URLs | **One URL space for both layouts** (§5). The same URL renders a mobile screen or a desktop arrangement, so resizing never loses the place. |
| Reordering stops | Up/down buttons on each stop (keyboard alternative) plus native HTML5 drag and drop on desktop. Needs one contract addition (§6). |

## 4. Architecture

### 4.1 Layout layer

- `src/lib/useLayout.ts`: `useLayout()` and a `LayoutProvider` so tests can force a layout (`<LayoutProvider value="desktop">`). Default reads `window.matchMedia('(min-width: 1024px)')` / `(min-width: 768px)` and subscribes to changes. In jsdom without `matchMedia` it returns `'mobile'`, so all existing tests keep passing untouched.
- `src/styles/global.css`: `.app-frame` becomes `min(100%, 430px)` below 768, `min(100%, 560px)` from 768, and full width capped at `var(--desktop-max-content)` and centred from 1,024. No horizontal scroll at any width.
- `src/shell/DesktopShell.tsx` (new): CSS grid `240px | chat | panel`, height `100dvh`, `overflow: hidden`. Sidebar and chat are always mounted; the panel column exists only when the matched route provides panel content. Chat and panel scroll independently; sidebar and map stay fixed. The chat column animates its width (200 ms, disabled under `prefers-reduced-motion`) when the panel appears or disappears, and keeps its scroll position.
- `src/shell/Sidebar.tsx` (new): mascot + app name, `Asistente` link, `Mis rutas` disclosure, `Perfil` link, and the account block at the bottom (initial avatar, name, email for accounts; an "Entrar" button for guests). Replaces `TabBar` on desktop. `nav aria-label="Principal"`, `aria-current="page"` on the active item, 48 px rows, selected background `--color-selected`, hover per §7.
- `Screen` keeps rendering `TabBar` only when the layout is not desktop. On desktop, pages are never wrapped in `Screen`; they render inside the shell.

### 4.2 Content components vs. wrappers (the rule that makes this one codebase)

Every feature 2 screen is split in two:

- a **content component** in `src/features/<area>/` that takes its data through props or hooks and knows nothing about `Screen`, back buttons, sheets or dialogs (`RouteView`, `StopDetail`, `AlternativesList`, `SaveGuestForm`, `RegisterForm`, `LoginForm`, `SavedRouteView`, `RateForm`, `PreferencesForm`, `AccountForm`, `PersonalDataForm`, `MyRoutesList`);
- thin **wrappers**: the mobile page in `src/pages/` (adds `Screen`, header, sheet, thumb-zone button placement) and the desktop host (panel, slide-over, dialog, or sidebar dropdown).

No content is duplicated between layouts. A component may take a `layout` or `variant` prop for placement differences (for example, primary button at the end of its block on desktop instead of pinned to the bottom).

### 4.3 One conversation thread

Spec 3 needs one continuous conversation visible in every section; today there are three transcripts that reset. Keep the three assistant modes and the mock assistant untouched, and change only how messages are stored:

- `AppState` holds a single ordered `thread: ThreadItem[]`. Each item carries `mode` and `epoch` (the per-mode counter `startChat` already bumps). Item kinds: `user`, `assistant` (a `RichReply`), `progress` (route creation, §4.4) and `notice` (assistant text produced by the UI, not the script, for example "Ruta creada: 4 paradas, de 10:00 a 15:00. La tienes a la derecha." or "Has abierto «…»").
- `startChat` no longer deletes anything: it bumps the epoch and resets the mode's assistant.
- **Mobile view of a mode** = thread items of that mode with the current epoch. This reproduces today's behaviour exactly, so `useChat(mode)` keeps its shape and the mobile pages barely change.
- **Desktop view** = the whole thread. Only the newest assistant item of the live epoch is interactive; everything older is read-only history with its options disabled (spec 4, "Respuesta registrada").
- The thread is persisted under a new key `rt.thread` (capped at 200 items) and restored on load as history. Restored items belong to a dead epoch, so they are never interactive; the assistants start fresh. If a current route exists, change mode is re-armed for it without a greeting. This satisfies "se conserva al recargar" without serialising the assistant's internal state.
- `pendingRequest` and the creation state (§4.4) live in the provider, not in a page, so a resize in the middle of a flow loses nothing.

### 4.4 Route creation as provider state

Extract the logic of `CreatingPage` into the provider: `creation: { request, step, status: 'running' | 'done' | 'failed', routeId? } | null`, started once by `startCreation(request)` ("Crear ruta"), StrictMode-safe, advancing the four steps every `STEP_MS`. It appends one `progress` thread item whose rendering reads `creation`.

- Mobile: `/creating` renders `CreatingPage` from this state (same visuals as today).
- Desktop: the chat renders the `progress` item as an assistant bubble ("Estoy creando tu ruta", four steps with done / active / pending icons, and the line "La ruta aparecerá a la derecha cuando esté lista."). No panel yet.
- On completion, both layouts set the current route and navigate to `/route/:id`. On desktop a `notice` "Ruta creada: N paradas, de HH:MM a HH:MM. La tienes a la derecha." is appended and change mode is armed for that route without its scripted greeting.

### 4.5 The chat dock (`src/shell/ChatDock.tsx`)

The single chat instance on desktop. It is built from the same `MessageList`, `ReplyView`, `ChatInput`, `SummaryCard` and `OnboardingForm` the mobile pages use. It picks the mode that receives input from state, not from the URL:

1. no preferences → `onboarding` (greets automatically; "Omitir" lives in the chat header);
2. a route is shown in the panel (`/route/:id…`, `/my-routes/:id…`) → `change` for that route;
3. otherwise → `request`. With an empty live request it shows the content of mobile `Chat` as the bottom of the thread: heading, helper and the three suggestions; and the saved preferences in a **collapsible strip** under the chat header (`aria-expanded`, "Cambiar" link to `/preferences`).

Other rules:

- Header 72 px on desktop: avatar, "Cacahuete", "Asistente de IA". No back arrow on desktop.
- Full-width mode (no panel): the conversation is centred in a column of `--desktop-chat-wide-max` (680 px). With a panel: 400–480 px.
- Change replies on desktop hide "Ver ruta actualizada" and keep "Deshacer"; the panel updates in place (§4.6).
- Opening a saved route appends the notice from `DeskMisRutas.html` with three quick replies: "Cambiar la hora" and "Añadir una parada" are sent as text to change mode; "Pedir otra ruta" navigates to `/chat` and starts a fresh request.
- In Perfil the dock stays in request mode and shows the notice from `DeskAjustes.html` once per visit.
- The text field takes focus when the Asistente section opens.

### 4.6 Shared route state

The chat and the panel show the same route at once, so page-local `useState<Route>` is not enough. Add `useRoute(id)` backed by a provider-level revision counter: every mutation that goes through the provider (`refineRoute`, `undo`, `saveRoute`, `setFavorite`, swap, remove, lock, move, and the assistant's own refine/undo calls through `AssistantDeps`) bumps the revision, and every `useRoute` consumer refetches. `listRoutes` consumers (sidebar dropdown, mobile Mis rutas) subscribe to the same revision. Acceptance: a change requested by chat updates the visible route without navigation.

## 5. URL map (same URLs, two arrangements)

| URL | Mobile / tablet | Desktop |
| --- | --- | --- |
| `/` | Inicio | Inicio, two columns, no sidebar, no chat (`DeskInicio.html`): message and button left, example route card right, "Entrar" top right opens the login dialog |
| `/onboarding`, `/chat`, `/chat/conversation`, `/creating` | The existing screens | Shell with no panel; the dock shows the thread. Existing guards and redirects stay |
| `/route/:id` | Ruta | Panel: `RouteView` (map on top, quick buttons above the list, stops below; "Compartir" and "Guardar ruta" in the header row) |
| `/route/:id/change` | Change chat | Redirects to `/route/:id` (the views merge) |
| `/route/:id/stop/:order` | Detalle de lugar | Slide-over on top of the stop list inside the panel; the map stays visible |
| `/route/:id/stop/:order/alternatives` | Cambiar parada | Small dialog over the panel |
| `/route/:id/save`, `/register`, `/login` | Full screens | Centred dialog, 440 px, over the current view |
| `/my-routes` | Mis rutas list (or empty state) | Sidebar dropdown open; no panel |
| `/my-routes/:id` | Ruta guardada | Sidebar dropdown open with the item current; `SavedRouteView` in the panel |
| `/my-routes/:id/rate` | Valorar | Centred dialog over the saved route |
| `/profile`, `/preferences`, `/account` | Perfil, Preferencias, Cuenta | Settings panel with three tabs (Datos personales, Preferencias, Cuenta), content max 720 px; the tab is the URL |

Dialog background on desktop: dialogs are routes. The view behind is the natural parent (`/route/:id` for save and alternatives, `/my-routes/:id` for rate). `/register` and `/login` use `location.state.background` set by the link that opened them; on a direct load the background is `/chat` when preferences exist and `/` otherwise. Closing a dialog navigates back to its background.

"Mis rutas" in the sidebar is a disclosure button (`aria-expanded`, `aria-controls`), not a page: it toggles the list, the list items are links to `/my-routes/:id` showing name and short date, and with no saved routes it shows "Aún no tienes rutas". It is open automatically on `/my-routes*`.

## 6. Contract and data changes

- All contract additions of the feature 2 tech spec (§5 there).
- One more, marked `// Añadido en feature 3`: `RefineAction` gains `{ type: "move_stop"; order: number; to: number }`. The mock recomputes travel legs and arrival times and creates a new version, like every other refine, so it can be undone.
- `docs/contract/types.ts` and `src/contract/types.ts` stay byte-identical.
- New storage key `rt.thread`. Nothing else in storage changes shape.

## 7. Chat component (spec 4), applies to mobile too

- **Tokens**: add to `tokens.css` and extend `tokens.test.ts` to cover them: the `desktop` group (`--desktop-sidebar-width`, `--desktop-chat-min`, `--desktop-chat-max`, `--desktop-chat-wide-max`, `--desktop-reading-max`, `--desktop-dialog-width`, `--desktop-chat-header-height`, `--desktop-max-content`, breakpoints as documented constants since CSS variables cannot be used in media queries) and the `chatBubble` group (max widths, radius 22, tail corner 6, gap 10, paddings, shadow, assistant border). Components keep using variables only, never raw hex.
- **Bubbles**: assistant `max-width: min(100%, 520px)`, user `min(80%, 460px)`, both `box-sizing: border-box`, radius 22 with the 6 px corner, paddings 14/18 and 12/18, shared shadow, log gap 10 px. This replaces the current 354 / 312 px limits on mobile as well; the seven updated mobile chat designs in `docs/design/screens/` show the result.
- **Message types**: text, single-choice, multi-choice with "Listo", "Esto entendí", progress (new, §4.4) and change. All render inside the assistant bubble. The typing indicator renders inside an assistant bubble with its label.
- **Input**: `<textarea>` that grows to four lines and then scrolls; Enter sends, Shift+Enter inserts a line break (do not send while an IME composition is active); send disabled when empty; hidden label kept.
- **Scrolling**: stick to the bottom on new messages only if the reader is already near the bottom; otherwise leave the position alone and show a "Mensaje nuevo" pill button that jumps down.
- **Accessibility**: the log stays `role="log"` `aria-live="polite"`; each user bubble gets a visually hidden "Tú:" prefix so authorship does not depend on colour; options are real buttons with `aria-pressed`; answered options are disabled, not removed, in history.
- **Persistence**: §4.3.

## 8. Desktop interaction and undesigned states

- **Dialog** (`src/components/Dialog/`): `role="dialog"`, `aria-modal`, labelled by its title, backdrop dims the view, focus trap, Esc and backdrop click close, focus returns to the opener, body scroll locked. Width `--desktop-dialog-width`. Used for save-as-guest, register, login, rate, alternatives, and for the feature 2 `ConfirmSheet` on desktop (same component API, dialog presentation).
- **SlideOver** (`src/components/SlideOver/`): slides over the stop list from the right inside the panel; Esc closes; focus moves in and returns. Used for stop detail.
- **Hover**: buttons, cards, chips, sidebar items and stop rows get a hover state using `--color-primary-hover`, inside `@media (hover: hover)` so touch devices are unaffected.
- **Map and list linked**: hovering or focusing a stop row highlights its marker in `RouteMap`, and hovering a marker highlights the row; clicking either opens the stop detail. `RouteMap` takes `highlighted` and `onHighlight` props.
- **Reorder**: up/down icon buttons per stop (disabled at the ends, `aria-label` "Subir parada" / "Bajar parada") and drag and drop on desktop, both calling `move_stop`. An `aria-live` message announces the new position.
- **Primary buttons** on desktop sit at the end of their content block, not pinned to the window bottom.
- **Resize**: crossing 1,024 px in either direction keeps URL, thread, creation state and route. Because URLs are shared, no redirect is needed except `/route/:id/change` → `/route/:id` on desktop.
- **Undesigned, kept minimal and on-brand**: login and rate dialogs reuse the mobile form content inside `Dialog`; onboarding questions 2–4 and the summary card are the existing bubble content at full width; empty Mis rutas dropdown is one muted line; Datos personales and Cuenta tabs reuse the mobile form content; loading states are the existing spinner icon with a visually hidden label; errors are an inline `role="alert"` line.
- **Strings**: every new string goes in `src/i18n/es.json`. `[NOMBRE APP]`, `[NOMBRE]` and `[CORREO]` stay as provisional placeholders where no real value exists.

## 9. Tests

Existing tests must keep passing unmodified except where a bubble width or the input element type is asserted. Add:

- `tokens.test.ts`: the `desktop` and `chatBubble` groups.
- `useLayout` unit test with a mocked `matchMedia`, including a change event.
- Thread: mobile mode view equals the previous per-mode behaviour; desktop view keeps earlier epochs as non-interactive history; persistence round-trip and the 200-item cap.
- Data: `move_stop` reorders, recalculates times, bumps the version and can be undone; plus the unit tests listed in the feature 2 spec.
- Dialog: focus trap, Esc closes, focus returns to the opener.
- ChatInput: Enter sends, Shift+Enter does not, disabled when empty.
- Desktop smoke tests (RTL, layout forced to desktop): (a) onboarding in the dock → request → summary → progress bubble with no panel → route appears in the panel while the chat is still present; (b) a change sent by chat updates the stop list in the panel without a URL change; (c) "Guardar ruta" as guest opens a dialog, registering saves the route and it appears in the sidebar dropdown; (d) choosing a saved route opens it in the panel; (e) `/preferences` shows the settings tabs with the chat still visible; (f) switching the forced layout from desktop to mobile on `/route/:id` keeps the route and the conversation.
- The two mobile smoke tests required by the feature 2 spec.

## 10. Phases

Each phase ends with `npm run check && npm test && npm run build` green. Do them in order; do not start a phase on a red tree.

1. **Chat component and tokens (spec 4, both layouts).** Tokens and their test; bubbles; textarea input with Enter / Shift+Enter; typing indicator in a bubble; near-bottom scrolling with the "Mensaje nuevo" pill; "Tú:" prefix. Mobile screens must still match `docs/design/screens/`.
2. **Feature 2, layout-agnostic.** Follow `feature-2-ruta-mis-rutas-perfil.md` in its own order (contract, mock data, components, provider additions, screens, tests), with two differences: apply the content/wrapper split of §4.2 from the start, and add `useRoute` with the revision counter of §4.6 instead of page-local route state. Delete the stubs. Add `move_stop` and the up/down buttons here.
3. **State refactor.** Single thread with epochs and persistence (§4.3); creation moved into the provider with the `progress` item (§4.4). Mobile behaviour unchanged; this phase is invisible to the user and is verified by the existing smoke tests plus the new thread tests.
4. **Desktop shell.** `useLayout`, `.app-frame` tiers including tablet, `DesktopShell`, `Sidebar` with the Mis rutas disclosure, `ChatDock` (§4.5), route tree arrangement of §5 for the assistant section, desktop Inicio.
5. **Desktop panels and dialogs.** `Dialog`, `SlideOver`; route panel with linked map and list and drag reorder; saved route panel; settings panel with tabs; all dialog routes with background handling.
6. **Interaction polish and verification.** Hover states, focus order and visible focus everywhere, reduced motion, resize behaviour, the §11 checklist, README update (URL table, structure, known limits).

## 11. Acceptance checklist

Spec 3:

- [ ] At 1,024 px and above the sidebar is present and the bottom tab bar is gone.
- [ ] In Asistente the chat and the route are visible together, and a change requested by chat updates the route without navigation.
- [ ] Until a route is finished the chat takes all free space (conversation centred, max 680 px); the panel appears when the route is done.
- [ ] Create account, log in, save as guest and rate open as dialogs and close with Esc, returning focus.
- [ ] "Mis rutas" expands the saved routes in the sidebar; choosing one opens it on the right; with none it reads "Aún no tienes rutas".
- [ ] The chat is visible in every section, including Mis rutas and Perfil.
- [ ] Every action is reachable by keyboard with a visible focus indicator.
- [ ] Hovering a stop highlights it on the map, and the reverse.
- [ ] No horizontal scroll at 1,024, 1,280, 1,440 and 1,920 px.
- [ ] Narrowing below 1,024 px keeps the conversation and the route.
- [ ] Below 768 px the app matches the mobile designs.

Spec 4:

- [ ] Bubble measurements match on mobile and desktop; in a 640 px conversation a long assistant bubble and a long user bubble overlap horizontally; no user bubble exceeds 80 %.
- [ ] Messages are anchored to the bottom and the newest is visible after sending.
- [ ] All six assistant message types render inside the bubble; choosing an option produces a user bubble and disables that question's options.
- [ ] The same component serves mobile, desktop full width and desktop with a panel.
- [ ] The conversation survives a section change, a width change and a reload.
- [ ] A screen reader announces each new message and who sent it.

Engineering:

- [ ] `npm run check && npm test && npm run build` pass; `src/pages/stubs/` is gone.
- [ ] No `fetch` / `XMLHttpRequest` / `axios` in `src/`; no raw hex in components, pages, features or shell; the two contract files are identical.
- [ ] The feature 2 acceptance checklist passes on mobile.
- [ ] Visual check against the seven desktop designs at 1,440 × 900 and against the mobile chat designs at 390 × 844 (headless Firefox screenshots of `npm run preview`).

## 12. Addendum (2026-11-24, later the same day): port onto `dev`

After this plan was written, `dev` gained its own feature 2 implementation (`7c781da`) and the fran-backend integration (`27f16d4`, `5288aee`): an HTTP data module (`src/data/httpData.ts`), an assistant wired to the backend through `interpretRequest` / `refineConversation` in `src/App.tsx`, and a Marbella catalogue. A first implementation of this plan was built in parallel from the older base and lives on the local branch `alex-desktop` (`de68003`). It is a **reference to port from**, not something to merge.

The decision is to rebuild the desktop version on top of `dev`, keeping dev's feature 2 code. This changes the plan as follows:

- **§2 and phase 2 no longer apply as written.** Feature 2 exists on `dev`; do not re-implement it and do not replace its files with the `alex-desktop` versions. Dev's pages, components, data modules, seeds, catalogue, assistant and tests are the base.
- **§4.2 becomes a refactor, not a build.** Extract the content of dev's existing feature 2 pages into content components only where a desktop host needs them (route view, stop detail, alternatives, save-as-guest / register / login forms, saved route view, rate form, the three settings forms, My routes list). Keep dev's markup, behaviour and data calls; the mobile pages become thin wrappers around the extracted content. Do not restructure pages that desktop does not reuse.
- **Both data paths must keep working.** The app runs on the mock module when `VITE_CACAHUETE_API_URL` is unset and on `createHttpDataModule` when it is set. Everything added here (thread, creation state, `useRoute` revision counter, panels) goes through the `DataModule` and assistant seams and must not assume the mock. Do not change `backend/`.
- **`move_stop` (§6)**: add it to the contract and the mock. The HTTP module has no backend endpoint for it; in HTTP mode the reorder controls are hidden (feature-detect an optional capability on the data module rather than checking the endpoint variable in UI code). Note it in the README as pending backend work.
- **Phases 1, 3, 4, 5 and 6 stand**, ported from `alex-desktop` where the code applies and adapted to dev's component names, hooks (`src/pages/routeHooks.ts`), state additions and i18n keys. Dev's 67 tests must keep passing, changed only where this plan deliberately changes behaviour.
- **Naming**: `origin/alex-frontend` has a separate "feature 3" spec (Peanut Run while the route is created) that is not on `dev`. It is out of scope here; keep the creation progress self-contained so that feature can replace the mobile creating screen later.

## 13. Out of scope

Backend, real AI, real maps or geocoding, a two-column tablet layout, a collapsible sidebar, a draggable divider, extra keyboard shortcuts, message timestamps, message editing, dark mode, and anything the feature 2 tech spec already lists as out of scope.
