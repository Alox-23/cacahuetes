# Feature 2 · Route, My routes, account and profile

Date: 2026-11-24 · Branch: `alex-frontend` · Source: `docs/specs/spec-2-ruta-mis-rutas-perfil.md` · Builds on: `feature-1-base-y-asistente.md`

This tech spec turns spec 2 of the design package into concrete, verifiable engineering decisions on top of the feature 1 codebase. Where the package leaves a decision open, this document closes it. Where this document is silent, the package rules and the feature 1 spec apply.

## 1. Goal

Complete the app: the real Route screen with a map and per-stop actions, saving routes (guest and account), register and login, My routes with saved-route detail and rating, and the profile with editable travel preferences and account settings. Everything stays in the browser on the existing mock data module. No backend.

## 2. Scope

### In scope (spec 2, all 13 designed screens)

| # | Screen | Design file | URL |
| --- | --- | --- | --- |
| 1 | Ruta | `Ruta.html` | `/route/:id` (replaces the feature 1 placeholder) |
| 2 | Detalle de lugar | `Lugar.html` | `/route/:id/stop/:order` |
| 3 | Cambiar parada | `CambiarParada.html` | `/route/:id/stop/:order/alternatives` |
| 4 | Guardar como invitado | `GuardarInvitado.html` | `/route/:id/save` |
| 5 | Crear cuenta | `Registro.html` | `/register` |
| 6 | Entrar | `Login.html` | `/login` (replaces stub) |
| 7 | Mis rutas | `MisRutas.html` | `/my-routes` (replaces stub) |
| 8 | Mis rutas · vacío | `MisRutasVacio.html` | `/my-routes` (empty state) |
| 9 | Ruta guardada | `RutaGuardada.html` | `/my-routes/:id` |
| 10 | Valorar ruta | `Valorar.html` | `/my-routes/:id/rate` |
| 11 | Perfil | `Perfil.html` | `/profile` (replaces stub) |
| 12 | Preferencias de viaje | `Preferencias.html` | `/preferences` (replaces stub) |
| 13 | Cuenta | `Cuenta.html` | `/account` |

Also in scope:

- **Contract additions** (§5) in both `docs/contract/types.ts` and `src/contract/types.ts`, kept byte-identical.
- **Undesigned states** that the flows need, kept minimal and consistent with the design language (§9): guest variant of Perfil, confirmation sheet for destructive actions, toast for share/copy feedback, "no results" line in Mis rutas, missing-route state.
- **Reuse flow**: "Reutilizar" on a saved route opens the request conversation with the "Esto es lo que entendí" summary pre-filled.
- Fix of the feature 1 review note: `listRoutes` returns only saved routes, so cancelled or unsaved routes never appear in Mis rutas.

### Out of scope

Real map tiles or geocoding, real auth (Google/Apple are mock sign-ins), password recovery, email verification, location permission, public share page, route-in-progress screen, manual stop adding, notifications, help, legal pages, desktop two-column layout.

## 3. Decisions (closing the open questions)

| Question | Decision | Why |
| --- | --- | --- |
| Map library | None. A schematic SVG `RouteMap` component draws a stylised street grid, the route line (accent `#D4621A`), numbered gold stop markers (`#F4AE52` with accent ring) and a dark start dot, exactly like the design SVGs. Layout is deterministic from the stop count. | No network, no tiles, pixel-faithful to the designs, zero dependencies. The backend can later swap it for a real map behind the same props. |
| Share without backend | `navigator.share` when available (title + text summary); otherwise copy the summary to the clipboard. Both show a toast. The summary lists name, date, window and numbered stops with times. | Package suggestion; works on mobile and desktop. |
| "Empezar ruta" | Navigates to `/route/:id` (the live Route screen). | No route-in-progress screen exists yet. |
| Example routes | Three example saved routes are seeded **when logging in** (an "existing account"), never on register and never for guests. Dates are relative to today so the tabs always have content: Barcelona in 12 days (upcoming), Valencia with kids in 26 days (upcoming), Sevilla 10 days ago (past, favourite). | Keeps the empty state reachable for guests and new accounts, and the guest-save acceptance test meaningful. |
| Próximas / Pasadas | By `request.date` compared with today (`>=` today is upcoming). Favoritas shows `favorite === true` regardless of date. | Simple and deterministic. |
| Destructive confirmations | A `ConfirmSheet` component (bottom sheet) for delete route, delete account and sign out. Destructive button in `--color-danger`. | Spec requires confirmation; no design exists, so one shared pattern. |
| Google / Apple buttons | Text only. They perform a mock sign-in with `google@ejemplo.com` / `apple@ejemplo.com` through `login` (seeds examples). | Package forbids logos; keeps the flow usable. |
| Form validation | Client-side: email must match a simple pattern; password ≥ 8 characters; register requires the terms checkbox. Errors render next to the field, inputs get `aria-invalid` and `aria-describedby`. `inputMode="email"` / `autoComplete` set. | Spec rule "errores junto al campo y teclado adecuado". |
| After login / register | Go to the `returnTo` passed in router state when present; otherwise `/my-routes`. From Guardar como invitado, the route is saved automatically after the account is created and the user lands on `/my-routes/:id`. | Matches the design links and the flow in `flows.md` §4. |
| Delete account | Clears session, saved routes and ratings. Keeps preferences (onboarding is asked only once, per the package rules). Lands on `/`. | Package rule on the four questions. |
| Preferences save | "Guardar cambios" writes through `savePreferences` and goes back (history or `/profile`). The chat preferences card re-reads on return. | Spec 2 acceptance. |
| Account settings | Name, email and the two reminder checkboxes persist in the session (`Session.name`, `Session.email`, `Session.settings`). | Smallest contract change that keeps everything behind the data module. |
| Route screen layout | `Screen fixed`: map fixed on top (230 px, 180 px when the viewport is under 700 px tall), white sheet below with `-20px` overlap and radius 24; the stop list scrolls inside the sheet; the "Pide un cambio" pill and the save/share row are pinned at the bottom of the sheet, above the always-present tab bar. | Spec rule "guardar y compartir siempre visibles abajo". |
| Undo on the Route screen | A text button "Deshacer" appears next to the quick buttons whenever `version > 1`. | Spec requires every change to be undoable from the route. |

## 4. Project layout additions

```
src/
  contract/types.ts                 # updated (see §5), identical to docs/contract/types.ts
  data/
    mockData.ts                     # new methods, listRoutes filter, seeding on login
    seeds.ts                        # the three example saved routes (dates relative to now)
    catalog.ts                      # alternatives per Barcelona place; food/free alternatives for other cities
  lib/
    share.ts                        # buildShareText(route), shareRoute(route) -> "shared" | "copied" | "failed"
    routeFilters.ts                 # isUpcoming(route, today), filterRoutes(routes, tab, query)
    tabs.ts                         # add /register and /account -> profile; /my-routes/* -> routes
  components/
    RouteMap/                       # schematic SVG map (props: stops, height, variant "full" | "card" | "thumb")
    FloatingBackButton/             # 44 px white round button over the map / photo
    Sheet/                          # white rounded-top sheet used by Ruta and Lugar
    StopRow/                        # order badge + name + detail + time (sizes 66 / 58)
    ListRow/                        # settings row with chevron and optional value (56 px)
    Checkbox/                       # 22 px, accent-color primary, 44 px label row
    Textarea/
    StarRating/                     # 5 × 52 px buttons, 40 px stars, aria-pressed, group label
    ConfirmSheet/                   # title, text, destructive + cancel
    Toast/                          # bottom toast, aria-live, auto-hides in 2.5 s; useToast() from the provider
    SearchField/                    # 48 px, radius 16, leading icon
    IconButton/                     # 56 px square secondary (share)
    AlternativeOption/              # 72 px selectable card with check icon
    SegmentedControl                # reuse; add a "tabs" variant if needed for Mis rutas (same look)
  pages/
    RoutePage.tsx                   # rewritten
    StopPage.tsx  AlternativesPage.tsx  SaveGuestPage.tsx
    RegisterPage.tsx  LoginPage.tsx
    MyRoutesPage.tsx  SavedRoutePage.tsx  RatePage.tsx
    ProfilePage.tsx  PreferencesPage.tsx  AccountPage.tsx
    stubs/                          # delete the four stubs and StubPage
  i18n/es.json                      # new keys for every string in the 13 designs and §9
```

## 5. Contract additions

Add to `docs/contract/types.ts` and copy verbatim to `src/contract/types.ts`:

```ts
export type AccountSettings = { remindDayBefore: boolean; remindToRate: boolean };

export type Session = {
  kind: "guest" | "account";
  name?: string;
  email?: string;
  settings?: AccountSettings;      // only for accounts; defaults { true, true }
};

export type Rating = { stars: number; stops: Record<number, boolean>; comment?: string };

export interface DataModule {
  // …existing methods unchanged…
  setFavorite(id: string, favorite: boolean): Promise<Route>;
  getRating(id: string): Promise<Rating | null>;
  updateAccount(patch: Partial<Pick<Session, "name" | "email" | "settings">>): Promise<Session>;
  deleteAccount(): Promise<void>;
}
```

`rateRoute` keeps its signature but its argument type is now `Rating`. `listRoutes()` returns saved routes only; the Mis rutas screen sorts upcoming routes soonest first and past or favourite routes most recent first (`lib/routeFilters.ts`). Mark the additions with a comment `// Añadido en feature 2` so the backend developer sees them.

## 6. Mock data module changes

- `register(email, password)`: creates `{ kind: "account", email, name: <part before @, capitalised>, settings: { remindDayBefore: true, remindToRate: true } }`. No seeding.
- `login(email, password)`: same session shape, then seeds the three example routes from `seeds.ts` if the account has no saved routes yet. Seed routes are built through the same scheduling code as `createRoute` so times are consistent; the Sevilla one is `favorite: true`. The past one has a stored rating of 4 stars so Valorar shows the prefilled state.
- `logout()`: back to guest; routes and preferences remain in storage but `listRoutes` returns `[]` for guests (routes belong to the account). Guests keep access to their unsaved current route by id.
- `saveRoute(id)`: sets `saved: true` on the current version; guest calls are rejected with an error `GUEST_CANNOT_SAVE` (the UI never calls it as guest).
- `deleteRoute(id)`: removes all versions and the rating.
- `setFavorite`, `getRating`, `updateAccount`, `deleteAccount`: as named. `deleteAccount` removes session, routes, ratings and `rt.currentRoute`.
- `getAlternatives(routeId, order)`: three places of the same city and kind not already in the route, preferring shared categories; Barcelona has hand-written alternatives for Casa Batlló (Casa Milà · La Pedrera, Palau de la Música Catalana, Casa Vicens) so the design screen is reproduced. Each alternative carries `visitMinutes` and a leg estimate so the option subtitle reads "Arquitectura · visita 50 min · 6 min a pie".
- Unit tests: login seeding (3 routes, dates relative to now, one favourite, one past with rating), register no seeding, guest `listRoutes` empty, `listRoutes` excludes unsaved, favourite toggle, rating round-trip, updateAccount, deleteAccount keeps preferences, alternatives exclude current stops, swap recalculates times.

## 7. Screens: behaviour details

- **Ruta** (`/route/:id`): map (`RouteMap` full, `aria-label` "Mapa de la ruta con N paradas") with `FloatingBackButton` (back in history, fallback `/chat`). Sheet: h1 route name 24 px, subtitle "N paradas · 10:00 a 15:00 · a pie y metro" (transport chip from preferences merged with overrides); horizontal row of the 4 quick buttons (44 px pills, `overflow-x: auto`, negative margins as in the design) plus "Deshacer" when `version > 1`; stop rows 66 px (badge 30 px, name 16/600 as a link to `/route/:id/stop/:order`, detail "Visita 1 h 15 · luego 20 min en metro" / "Comida 1 h · …" for food / "Pausa 20 min · …" / "Paseo 45 min · fin de la ruta" for the last, time 14/500 muted). Pinned bottom: "Pide un cambio al asistente" pill (48 px, mascot 24 px, background `--color-background`) → `/route/:id/change`; row with "Guardar ruta" primary and the share `IconButton`. When `route.saved`, the primary reads "Guardada · Ver en Mis rutas" and goes to `/my-routes/:id`. Guest tapping save → `/route/:id/save`. Account tapping save → `saveRoute` → `/my-routes/:id`. Missing id → "No encontramos esta ruta." with back (already exists in feature 1, keep).
- **Lugar** (`/route/:id/stop/:order`): photo block 240 px (`--color-photo-placeholder`, text "[FOTO DEL LUGAR]") with floating back; sheet: h1 26 px, "Parada N · HH:MM · visita 1 h 15"; chips: category labels plus "Imprescindible" when the place matches `mustInclude`, plus "Fijada" when locked; "Por qué este lugar" box (selected colour, radius 16) with the place `why`; rows Horario `[HORARIO]`, Entrada `[PRECIO]`, Siguiente parada "20 min en metro" (or "Fin de la ruta"); bottom: "Cambiar" (→ alternatives) and "Quitar" (secondary pair; Quitar runs `remove_stop` and returns to the route; disabled when locked, with a hint) and primary "Fijar en la ruta" / "Quitar fijación" toggling `lock_stop`. Pause stops have no alternatives: "Cambiar" is hidden.
- **Cambiar parada** (`/route/:id/stop/:order/alternatives`): note line, header "Cambiar parada" with back, h1 "Alternativas a <name>", subtitle "Misma zona, mismo interés y duración parecida.", three `AlternativeOption`s (first preselected), "Usar esta parada" → `swap_stop` → `/route/:id`.
- **Guardar como invitado** (`/route/:id/save`): header "Guardar ruta", `RouteMap` card 150 px, h1 "Crea una cuenta para guardarla", text, route card row (badge 1, name, "N paradas · sáb 5 dic", start time), "Crear cuenta" → `/register` with state `{ returnTo: "/my-routes/:id", saveRouteId: id }`, "Ya tengo cuenta" → `/login` with the same state, "Seguir sin guardar" → back to the route. If the session is already an account, redirect to the route.
- **Crear cuenta** (`/register`) and **Entrar** (`/login`): as designed (header with back to `/`, h1, Google/Apple 52 px buttons, "o con tu correo" divider, labelled fields 52 px radius 14, terms checkbox / "¿Olvidaste tu contraseña?" (inert link with toast "Función pendiente"), primary CTA pinned with `margin-top: auto`, switch link). On success: if `saveRouteId` in state, call `saveRoute` and go to `returnTo`; else go to `returnTo` or `/my-routes`. Already signed in → redirect to `/my-routes`.
- **Mis rutas** (`/my-routes`): h1, `SearchField` "Buscar por ciudad", segmented tabs Próximas / Pasadas / Favoritas, cards (`RouteMap` thumb 88×96, name 17/600, "Sáb 5 dic · 10:00 a 15:00", "4 paradas · arquitectura, gastronomía" built from interests in the request or preferences, or "con niños" / "a pie" from overrides). No saved routes at all → the empty state design (map 170, "Aún no tienes rutas", "Pídele la primera al asistente.", "Pedir una ruta" → `/chat`). Saved routes but none in the current tab or search → inline muted line "No hay rutas aquí." Guests see the empty state. Tab bar active "Mis rutas".
- **Ruta guardada** (`/my-routes/:id`): header "Ruta guardada" with back to `/my-routes` and the "Favorita" toggle (text button, `aria-pressed`, filled star icon when on); map card 150; h1 24; subtitle "Sáb 5 dic · 10:00 a 15:00 · 4 paradas"; stops card (58 px rows); 3-column action grid Reutilizar / Compartir / Valorar (56 px, radius 14); primary "Empezar ruta" → `/route/:id`; "Eliminar ruta" red text → `ConfirmSheet` → `deleteRoute` → `/my-routes`. Reutilizar: starts a request conversation seeded with this route's request so the next screen is `/chat/conversation` showing the summary card (date defaults to the next upcoming same weekday if the stored date is past). The assistant gains a `reset("request", { request })` entry whose first reply is the summary; the AppState exposes `startReuse(request)`.
- **Valorar** (`/my-routes/:id/rate`): header with back, h1 "¿Qué tal la ruta?", subtitle "<name> · sáb 5 dic", `StarRating`, "¿Te gustó cada parada?" with per-stop Sí/No `OptionChip` pairs (52 px min width), comment `Textarea` 72 px, "Enviar valoración" pinned → `rateRoute` → toast "Gracias por valorar" → `/my-routes/:id`. Prefilled from `getRating`. Submit disabled until stars > 0.
- **Perfil** (`/profile`): h1; account card (52 px initial avatar, name, email) or guest card (avatar "?" , "Invitado", "Crea una cuenta para guardar tus rutas", buttons "Crear cuenta" / "Entrar"); list card: Preferencias de viaje → `/preferences`, Cuenta → `/account` (accounts only), Idioma "Español" → `/account`, Ayuda → toast; preference chips; "Cerrar sesión" (accounts only) → `ConfirmSheet` → `logout` → stays on `/profile`. Tab bar active "Perfil".
- **Preferencias** (`/preferences`): header with back, sections Intereses (8 chips, design shows 6 but all 8 contract values must be offered), Ritmo (segmented), Transporte (chips; label "Público" for transporte_publico as in the design), Compañía habitual (chips, single), Presupuesto (segmented), "Guardar cambios" pinned. Loads current preferences; if none (direct URL before onboarding) uses the defaults.
- **Cuenta** (`/account`): header with back, fields Nombre and Correo (prefilled), list card: Cambiar contraseña (toast "Función pendiente"), Idioma "Español" (inert), checkboxes "Avisarme el día antes de una ruta" and "Recordarme valorar las rutas pasadas", "Eliminar cuenta" red → `ConfirmSheet` → `deleteAccount` → `/`; "Guardar cambios" pinned → `updateAccount` → toast → back. Guests are redirected to `/login`.

## 8. State and navigation

- `AppStateProvider` additionally exposes `refreshSession()`, `startReuse(request)`, and `useToast()` (`show(message)`).
- `tabForPath`: `/my-routes*` → routes; `/profile`, `/preferences`, `/account`, `/login`, `/register` → profile; everything else → assistant.
- Guards: `/account` requires an account; `/register` and `/login` redirect signed-in users to `/my-routes`; `/route/:id/save` redirects accounts to the route.
- Back buttons use history when available and fall back to the parent URL listed above.

## 9. Undesigned states (keep them small and on-brand)

- **ConfirmSheet**: bottom sheet, radius 24 top, title 20 px Space Grotesk, body 15 px muted, destructive primary in `--color-danger` with white text, "Cancelar" text button; closes on backdrop tap and Escape; focus moves into the sheet and returns on close.
- **Toast**: 44 px min height pill above the tab bar, surface background, border, 14 px text, `role="status"`.
- **Guest profile card** and **no results line** as described in §7.
- **Design tokens**: add `--color-photo-placeholder: #E6D3B5` and `--color-star-off: #9A8672` to the extra block of `tokens.css` (both appear in the designs but not in `tokens.json`).

## 10. Accessibility and UX rules (verify these)

- All targets ≥ 44 px (stars 52, stop rows 58/66, list rows 56).
- Forms: visible labels, `aria-invalid`, `aria-describedby` for errors, email keyboard, `autoComplete="email" | "new-password" | "current-password"`.
- Star rating: `role="group"` with a label; each star `aria-label="N de 5"` and `aria-pressed`.
- Favourite toggle `aria-pressed`; delete actions red with confirmation.
- Map SVGs carry `role="img"` and a meaningful label; thumbnails are `aria-hidden`.
- No horizontal scroll at 360 px except the intentional quick-button row.

## 11. Acceptance checklist (reviewer runs this)

- [ ] `npm run check && npm test && npm run build` pass; the stubs folder is gone.
- [ ] Route created from the chat opens `/route/:id` with the schematic map (numbered markers, line, start dot), stops, times and legs, matching `Ruta.html` at 390 px.
- [ ] Each quick button changes the route; "Deshacer" appears and restores the previous version.
- [ ] Tapping a stop opens Lugar; "Cambiar" shows three alternatives; "Usar esta parada" swaps it and times are recalculated; "Quitar" removes it; "Fijar" locks it (chip "Fijada", Quitar disabled).
- [ ] As a guest, "Guardar ruta" opens Guardar como invitado; "Crear cuenta" with a valid email/password and the terms checked saves the route and lands on `/my-routes/:id`; the route is in Mis rutas; preferences are unchanged.
- [ ] Invalid email, short password or unchecked terms show an error next to the field and block submission.
- [ ] Logging in (any email + 8-char password, or Google/Apple buttons) seeds three example routes: two in Próximas, one in Pasadas, one in Favoritas; search "Val" filters to Valencia.
- [ ] A guest or a fresh account sees the empty state in Mis rutas with "Pedir una ruta" → `/chat`.
- [ ] Ruta guardada: Favorita toggles and persists; Compartir shows a toast (copied or shared); Reutilizar opens the conversation with the summary and "Crear ruta" creates a new route; Empezar ruta opens `/route/:id`; Eliminar ruta asks for confirmation and removes it.
- [ ] Valorar: stars + per-stop answers + comment persist and are prefilled on return; submit disabled with 0 stars.
- [ ] Preferences edited in Perfil → Preferencias appear updated in the chat preferences card and in the next summary.
- [ ] Cuenta: name/email edits persist; Eliminar cuenta asks for confirmation, returns to `/`, keeps onboarding done (no questions on "Planificar mi ruta").
- [ ] Cerrar sesión asks for confirmation; after it, Perfil shows the guest card and Mis rutas the empty state.
- [ ] Reload keeps session, routes, favourites and ratings.
- [ ] No `fetch`/`XMLHttpRequest`/`axios` in `src/`; no raw hex in components/pages; contract files identical.
- [ ] Tab bar present on every screen and highlighting the right tab; layouts hold at 360 px.

## 12. Implementation plan (for the implementing agent)

1. Contract additions (§5) in both files; adjust `mockData.ts` (§6) with `seeds.ts`, alternatives, `listRoutes` filter; unit tests.
2. Tokens additions, `lib/share.ts`, `lib/routeFilters.ts`, `lib/tabs.ts` update, i18n keys.
3. Components (§4): `RouteMap` first (used by five screens), then the rest.
4. Provider additions (§8): session refresh, `startReuse`, toast.
5. Screens in flow order: Ruta → Lugar → Cambiar parada → Guardar invitado → Registro → Login → Mis rutas (+ empty) → Ruta guardada → Valorar → Perfil → Preferencias → Cuenta. Delete the stubs and update the router.
6. Tests: unit tests from §6, `routeFilters` and `share` text tests, and two RTL smoke tests: (a) guest save → register → route in Mis rutas; (b) login seeds → favourite toggle → delete with confirmation.
7. Self-review against §11, update `frontend/README.md` (new URLs, contract additions, how to seed).

## 13. Notes for the merge with the backend

- New contract methods are marked `// Añadido en feature 2`; the backend developer should mirror them or propose renames in `docs/contract/types.ts`.
- `RouteMap` takes only `stops` and a size; a real map can replace it without touching pages.
- Share text is built in one function (`buildShareText`) so a public link can replace it later.
