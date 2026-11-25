# Feature 3 · Peanut Run while the route is being created

> **Superseded** by [`feature-5-animacion-de-espera.md`](feature-5-animacion-de-espera.md) (2026-11-25): the game was removed and replaced by a non-interactive animation. Kept for history.

Date: 2026-11-24 · Branch: `alex-frontend` · Source: branch `peanut-run-game` (commit `f021912`, folder `peanut-run/`) · Builds on: features 1 and 2

## 1. Goal

While Cacahuete "creates" the route (the Creating screen, `/creating`), the user can play Peanut Run, the one-button endless runner committed on the `peanut-run-game` branch (a peanut runs from a squirrel and jumps over obstacles). The wait becomes a mini game instead of a spinner. When the route is ready the user is never yanked out of a run: they get a "ruta lista" banner and go to the route when they choose, or automatically if they were not playing.

## 2. Scope

### In scope

- Vendor the game engine from `peanut-run-game` into `frontend/src/game/peanut-run/` (the `src/peanut-run/*.js` and `peanut-run.css` files plus the README), unchanged except for the string option in §4.3 and the palette re-theme in §10. Record the origin commit in `frontend/src/game/peanut-run/SOURCE.md`.
- A typed React wrapper `PeanutRunGame.tsx` (TypeScript, ours; the branch's `PeanutRun.jsx` is not copied).
- A redesigned Creating screen that keeps the existing title, subtitle, progress steps and Cancel, and adds the game and the "ruta lista" banner (§5).
- Spanish strings for every piece of game UI text through the existing i18n file.
- Tests (§7) and README updates.

### Out of scope

Changing the game's mechanics, art or physics. Using the game anywhere else. Leaderboards or sharing scores. Changing how long route creation takes (the mock still takes ~2.4 s; the real backend will take longer, which is the point of this feature).

## 3. Decisions

| Question | Decision | Why |
| --- | --- | --- |
| How to bring the code in | Copy the files from the branch with `git show origin/peanut-run-game:peanut-run/src/peanut-run/<file>` into `frontend/src/game/peanut-run/`. Keep them as JavaScript. | The game is dependency-free ES modules; converting 3 600 lines to TypeScript gains nothing and makes re-syncing with the branch painful. |
| Type safety at the seam | A hand-written `index.d.ts` next to `index.js` declaring `createPeanutRun`, `PeanutRunOptions` and `PeanutRunInstance` (including the new `strings` option). `tsconfig` stays without `allowJs`. | TypeScript resolves the `.d.ts`; the app keeps `strict` without type-checking vendored code. |
| Lint | Add `src/game/peanut-run/*.js` to the ESLint `ignores`. The wrapper `.tsx` and `.d.ts` are linted as usual. | Vendored code follows its own style. |
| CSS | Import `peanut-run.css` from the wrapper only. Its selectors are scoped under `.peanut-run`, so no conflict with the app. The raw-hex grep rule in features 1 and 2 applies to `src/components` and `src/pages` only; the vendored CSS lives under `src/game` and is exempt. | Keeps the engine self-contained. |
| Theme | The game is re-coloured to the app's warm cream / brown / orange palette (§10). Only `config.js` (`PALETTE`) and the `--pr-*` variables plus root background/shadow in `peanut-run.css` change; shapes, physics and layout stay. | The user asked for the game to fit the website theme. Confining the change to the palette and CSS variables keeps the engine re-syncable. |
| Game language | Add an optional `strings` object to `createPeanutRun` options (§4.3) with the current English texts as defaults. The app passes Spanish strings from `es.json`. | The whole app is Spanish; the branch's engine is English-only. This is the only engine change and it is backwards compatible. |
| Sound | Enabled (`sound: true`), with the engine's own mute button and persisted preference. Storage keys namespaced to the app: `highScoreKey: "rt.peanutRun.highScore"`, `soundKey: "rt.peanutRun.muted"`. | Browsers only play audio after a gesture, which the first tap gives. Keys follow the app's `rt.*` convention. |
| Focus | `autoFocus: false`. The game root is focusable and gets focus on the first tap (engine behaviour). | Autofocusing a game on a screen that also has Cancel would steal focus from assistive tech users; the hint "toca para empezar" is enough. |
| Route ready while playing | If the game state is `ready` (the user never started), navigate to the route automatically as today. If the state is `running`, `caught` or `gameover`, show the banner (§5) and wait. "No" in the game's "¿Otra partida?" dialog (`onExit`) also goes to the route when it is ready. | Never interrupt a run; still zero friction for users who ignore the game. |
| Creation failure | Same as today: an alert text replaces the steps; the game stays playable; Cancel returns to the conversation. | No new states to design. |
| Layout | Vertical: title row (mascot + title + subtitle), compact steps card, then the game at full content width (the engine keeps the 800×300 aspect ratio, so about 342×128 px at 390 px wide), a one-line hint under it, the banner (when ready) and Cancel. Below 700 px of viewport height the steps card collapses to a single line "Paso 3 de 4 · Ordenando las paradas". | Keeps the design's elements, fits a phone without scrolling in the common case. |
| Reduced motion | Nothing extra; the engine already honours `prefers-reduced-motion`. | |

## 4. Vendored game

### 4.1 Files

```
frontend/src/game/peanut-run/
  SOURCE.md          origin branch + commit, list of local changes (only §4.3), how to re-sync
  README.md          copied from the branch
  index.js  game.js  entities.js  background.js  input.js  audio.js  config.js  peanut-run.css
  index.d.ts         typings for the public API (ours)
frontend/src/game/PeanutRunGame.tsx          React wrapper (ours)
frontend/src/game/PeanutRunGame.module.css   slot sizing only
```

### 4.2 Wrapper `PeanutRunGame`

```ts
type PeanutRunGameProps = {
  onStateChange?: (state: PeanutRunState) => void   // ready | running | caught | gameover | exited
  onGameOver?: (score: number, highScore: number) => void
  onExit?: (score: number) => void
  className?: string
}
export type PeanutRunHandle = { getState(): PeanutRunSnapshot; pause(): void; resume(): void; restart(): void }
export const PeanutRunGame = forwardRef<PeanutRunHandle, PeanutRunGameProps>(…)
```

- Creates the game once in a `useEffect` (StrictMode-safe: the effect's cleanup calls `destroy()`), keeps the latest callbacks in a ref, passes `sound: true`, `autoFocus: false`, the namespaced storage keys and the Spanish `strings` from i18n.
- Polls `getState().state` with a light `setInterval` (250 ms) and calls `onStateChange` only when it changes, because the engine has no state-change event. Clears the interval on unmount.
- Wraps `createPeanutRun` in `try/catch`. If the canvas is unavailable (jsdom, very old browsers) it renders nothing and reports `ready` once, so the Creating screen behaves as if the user never played. Logs the error once with `console.warn`.
- The slot `div` has `aria-label` from i18n ("Juego Cacahuete Run") via the engine's root label (`strings.ariaLabel`).

### 4.3 Engine change: `strings` option

In `index.js`, `buildDom(strings)` uses a `strings` object with these keys and the current English texts as defaults: `title` ("Peanut Run"), `startHint` ("Press Space or tap to start"), `paused` ("Paused"), `pausedHint` ("Press Space or tap to continue"), `caught` ("The squirrel got you!"), `score` ("Score"), `best` ("Best"), `newHigh` ("New high score!"), `playAgain` ("Play again?"), `yes` ("Yes"), `no` ("No"), `thanks` ("Thanks for playing!"), `finalScore` (a function `(n) => "Final score: " + n`), `play` ("Play"), `ariaLabel` ("Peanut Run game. Press Space or tap to jump."), `mute` ("Mute") and `unmute` ("Unmute") for the mute button's `aria-label` if the engine sets one. `createPeanutRun(container, options)` merges `options.strings` over the defaults and passes them to `buildDom`; `game.js` must use the same object wherever it writes text (`endScore.textContent`, the mute button label). No other engine change. Document it in `SOURCE.md` and in the vendored README under "Options".

Spanish values (in `es.json` under `game`): title "Cacahuete Run", startHint "Toca o pulsa espacio para empezar", paused "En pausa", pausedHint "Toca o pulsa espacio para seguir", caught "¡La ardilla te ha pillado!", score "Puntos", best "Mejor", newHigh "¡Nuevo récord!", playAgain "¿Otra partida?", yes "Sí", no "No", thanks "¡Gracias por jugar!", finalScore "Puntuación final: {n}", play "Jugar", ariaLabel "Juego Cacahuete Run. Toca o pulsa espacio para saltar.", mute "Silenciar", unmute "Activar sonido".

## 5. Creating screen behaviour

URL `/creating`, same guard as today (no pending request → `/chat`). State: `active` step (0–4), `route` (created or null), `failed`, `gameState` (from the wrapper, initially `ready`), `ready = active >= 4 && route !== null`.

Layout (top to bottom, content padding 24 / 24 / 16 as today):

1. Title row: mascot 56 px with pulse while not ready, h1 "Cacahuete está creando tu ruta", subtitle from the request. When `ready`, the h1 becomes "Tu ruta está lista" and the pulse stops.
2. Steps card as today (four rows, check / spinner / pending icons). Under 700 px viewport height: one row "Paso N de 4 · <step>" (sr-only list retained for screen readers).
3. Game section: label "Mientras tanto, juega" (13 px, 600, muted, uppercase tracking as the "Ejemplo · Barcelona" label on Main), the `PeanutRunGame` slot (full width, radius 20 from the engine), hint "Toca el juego para saltar. Tu ruta sigue en marcha." (13 px muted).
4. Ready banner (only when `ready` and the user is or was playing, i.e. `gameState !== "ready"`): a `Card` with selected background (`--color-selected`), text "Tu ruta está lista" 15/600 and a primary `Button` "Ver ruta" (56 px). It sits above Cancel. `role="status"` so it is announced.
5. Cancel text button as today (hidden once `ready`).

Navigation rules:

- `ready && gameState === "ready"` → navigate to `/route/:id` (replace) after the same 0 ms as today.
- `ready && gameState !== "ready"` → show the banner; "Ver ruta" navigates. `onExit` (the player answered "No") navigates as well when `ready`; when not yet ready, nothing happens (the engine shows its end card with "Jugar").
- The current-route id is set and the pending request is cleared by the Route page as today.
- Leaving the screen unmounts the game (`destroy()` stops the loop, listeners and audio).

The mock `STEP_MS` stays 600 ms. Do not slow creation down artificially; the game is for real waits.

## 6. Accessibility

- The game root keeps the engine's `role="application"` with the Spanish `aria-label`; the slot is reachable by Tab and Space/Up/W jump when it has focus. Cancel and Ver ruta remain reachable by Tab (the engine only intercepts jump keys when focused or hovered).
- The banner is a `role="status"` region; the steps list keeps `aria-live="polite"`.
- Reduced motion handled by the engine; the mascot pulse already respects it via the app's global rule (add one if missing: `@media (prefers-reduced-motion: reduce) { .pulse { animation: none } }`).
- Touch targets: the engine's dialog buttons are at least 44 px (check the CSS; if smaller, override `--pr-*` or add a scoped rule in the wrapper CSS, never edit the vendored CSS).

## 7. Tests

- `src/game/peanutRun.test.ts`: `createPeanutRun` with a stubbed canvas context (`HTMLCanvasElement.prototype.getContext` mocked to return a minimal 2D context object with no-op methods) builds the DOM with the Spanish strings, `getState().state === "ready"`, and `destroy()` removes the root and is idempotent.
- `src/pages/CreatingPage.test.tsx`: mock `../game/PeanutRunGame` with a component that exposes a way to emit `onStateChange`. (a) Game untouched: after the steps, navigation goes to `/route/:id`. (b) Game `running` when ready: no navigation, banner with "Ver ruta" appears, clicking it navigates. (c) `onExit` after ready navigates.
- Existing smoke tests (`App.test.tsx`, `feature2.test.tsx`) must keep passing: with jsdom's null canvas context the wrapper's try/catch path reports `ready`, so the flow still auto-navigates. Do not weaken those tests.

## 8. Acceptance checklist (reviewer runs this)

- [ ] `npm run check && npm test && npm run build` pass; the vendored JS is excluded from ESLint but the wrapper and `.d.ts` are linted.
- [ ] Vendored files are identical to the branch except: `index.js` and `game.js` (only the `strings` option), `config.js` (only the `PALETTE` values) and `peanut-run.css` (only the `--pr-*` variables, the root background and shadow, and the button/dialog colours that reference them). `diff` against `git show origin/peanut-run-game:peanut-run/src/peanut-run/<file>` shows nothing else. `SOURCE.md` names commit `f021912` and lists these three local changes.
- [ ] The game visibly uses the app palette (§10): cream sky, gold and orange foliage, brown ground, brown HUD text, primary-brown dialog buttons. No dusk purple remains. Text contrast on the HUD and the dialog is at least 4.5:1.
- [ ] `/creating` shows title, steps, the game (dusk-sky canvas with the peanut and squirrel), the hint and Cancel at 390 px without horizontal overflow; also at 360 px.
- [ ] All game text is Spanish: start hint, pause overlay, catch dialog ("¡La ardilla te ha pillado!", Puntos, Mejor, "¿Otra partida?", Sí / No), end card, mute button label.
- [ ] Tap or Space starts a run and jumps; hitting an obstacle shows the dialog; Sí restarts; No shows the end card (route not ready) or goes to the route (route ready).
- [ ] Without touching the game, the flow still auto-navigates to `/route/:id` after the steps.
- [ ] Start a run before the steps finish: the screen stays, "Tu ruta está lista" banner appears with "Ver ruta"; the game keeps running; "Ver ruta" opens the route.
- [ ] Cancel returns to the conversation with the summary intact and the game is destroyed (no console errors, no audio).
- [ ] High score persists across reloads under `rt.peanutRun.highScore`; mute persists under `rt.peanutRun.muted`.
- [ ] Tab bar still present and highlighting Asistente; keyboard users can reach Cancel and Ver ruta.
- [ ] No `fetch`/`XMLHttpRequest`/`axios` in `src/`; no raw hex in `src/components` or `src/pages`.

## 9. Implementation plan (for the implementing agent)

1. Vendor the files (`git show origin/peanut-run-game:peanut-run/src/peanut-run/<name>` for each) into `frontend/src/game/peanut-run/`, plus the README; write `SOURCE.md`.
2. Apply the `strings` option to `index.js` and `game.js` (§4.3) and the palette re-theme (§10) to `config.js` and `peanut-run.css`; write `index.d.ts`; extend ESLint ignores.
3. Add `game` strings to `es.json`; write `PeanutRunGame.tsx` and its CSS module.
4. Rework `CreatingPage.tsx` and its CSS (§5), including the short-viewport steps line and the banner.
5. Tests (§7); run the full quality bar; README section "Juego mientras se crea la ruta".
6. Self-review against §8 with headless Chromium screenshots of `/creating` (reach it by driving suggestion → quick replies → "Crear ruta", as the earlier CDP drivers in `/home/hackerman/.claude/jobs/c4a8f676/tmp/` do; copy and adapt one).

## 10. Theme: re-colour the game to the app palette

Replace the dusk-sky art direction with the app's warm palette so the game looks like part of the website. Source of truth: `docs/design/tokens.json` (background `#FEF3E2`, surface `#FFFFFF`, primary `#4A2F1B`, hover `#2A1A0E`, selected `#F4AE52`, accent `#D4621A`, border `#EBD9BF`, input border `#A68A6D`, divider `#F3E6D2`, segmented track `#F3E0C4`, map land `#EFE2CC`, map water `#F6DDB6`, mascot shell `#E9C48A`, mascot outline `#8A5A2B`, mascot face `#3B2412`, muted text `#6B5847`, label `#7A4E22`). Only the values below change; drawing code is untouched.

### 10.1 `config.js` → `PALETTE`

| Key(s) | New value | Note |
| --- | --- | --- |
| `skyTop` / `skyMid` / `skyBottom` | `#F6DDB6` / `#FBE8CF` / `#FEF3E2` | Cream daytime sky, fading to the app background. |
| `sun` / `cloud` | `#FFF7E8` / `#FFFFFF` | |
| `hillFar` / `hillNear` | `#EFE2CC` / `#E9C48A` | Map land and mascot shell. |
| `haze` | `rgba(244, 174, 82, 0.25)` | Selected gold at low alpha. |
| `treeTrunk` | `#8A5A2B` | |
| `treeCanopies` | `['#F4AE52', '#D4621A', '#E9953A', '#F7C778', '#C9541A']` | Gold and orange foliage. |
| `groundTop` / `groundTopLight` | `#8A5A2B` / `#F4AE52` | |
| `earth` / `earthDark` | `#6B4A2E` / `#4A2F1B` | |
| `pebble` (ground pebbles) | `#C9B59A` | |
| `leaves` | `['#F4AE52', '#D4621A', '#E9C48A', '#F7C778']` | |
| `peanutLight` / `peanut` / `peanutDark` / `peanutLine` | `#F3D9A8` / `#E9C48A` / `#C9924E` / `#8A5A2B` | Same colours as the mascot. |
| `shoe` | `#4A2F1B` | |
| `furLight` / `fur` / `furDark` | `#8A5A2B` / `#6B4322` / `#4A2F1B` | Dark-brown squirrel, contrasts with the light peanut. |
| `belly` / `tail` / `tailTip` / `eye` | `#F3E0C4` / `#7A4E22` / `#A68A6D` / `#2A1A0E` | |
| `rock` / `rockLight` / `rockDark` | `#A68A6D` / `#C4AE93` / `#7A5F45` | |
| `moss` | `#A8A05A` | Muted olive, the only green. |
| `capRed` / `capRedDark` / `spot` | `#D4621A` / `#A84A12` / `#FEF3E2` | Orange mushrooms. |
| `stem` / `stemDark` | `#F3E0C4` / `#D9C4A0` | |
| `bark` / `barkDark` / `woodRing` / `woodRingDark` | `#8A5A2B` / `#5E3B1C` / `#E9C48A` / `#C9924E` | |
| `hud` / `hudSoft` | `#4A2F1B` / `rgba(74, 47, 27, 0.62)` | Dark text on the light sky. |
| `hudPanel` / `hudBorder` / `hudPulse` | `rgba(255, 255, 255, 0.62)` / `rgba(74, 47, 27, 0.16)` / `#D4621A` | |
| `skyLow` / `grassTuft` / `dust` | `#F7C778` / `#C9924E` / `#F3E0C4` | |
| `star` / `sweat` | `#F4AE52` / `#9FC5E8` | Sweat drops stay a soft blue so they read as water. |
| `OBSTACLE_KINDS.pebble` (cluster pebble colour) | `#7A5F45` | Keep it darker than the ground so it is visible. |

If any drawn element becomes invisible against its new background (check: squirrel on ground, pebbles on earth, HUD text on sky, star burst on catch), adjust that single value within the same family and note it in `SOURCE.md`.

### 10.2 `peanut-run.css` → `--pr-*` and root

| Variable / rule | New value |
| --- | --- |
| `--pr-text` | `#4A2F1B` |
| `--pr-text-soft` | `rgba(74, 47, 27, 0.66)` |
| `--pr-glass` | `rgba(255, 255, 255, 0.82)` |
| `--pr-glass-border` | `rgba(74, 47, 27, 0.14)` |
| `--pr-accent` / `--pr-accent-2` | `#4A2F1B` / `#2A1A0E` (primary button and its hover, like the app's buttons) |
| `--pr-gold` | `#D4621A` |
| `--pr-focus` | `#D4621A` |
| `--pr-font` | `Inter, system-ui, sans-serif` |
| `.peanut-run` `background` | `#F6DDB6` |
| `.peanut-run` `box-shadow` | `0 0 0 1px #EBD9BF, 0 10px 30px -12px rgba(74, 47, 27, 0.35)`; focus-visible ring uses `--pr-focus` |
| Title / hint text-shadow | Lighten to `0 1px 10px rgba(255, 255, 255, 0.6)` so brown text stays readable on cream |
| Primary dialog button | Background `--pr-accent`, text `#FFFFFF`; secondary button white with `1.5px` `--pr-accent` border and brown text (the app's secondary style) |
| Paused overlay background | `rgba(254, 243, 226, 0.55)` |

Check every text colour against its background for 4.5:1 (brown `#4A2F1B` on cream and white passes; white on `#4A2F1B` passes). Do not touch selectors, sizes or animations.

## 11. Fit: the game fills the free space on mobile

User request (2026-11-24): on a phone the game is a 342 × 128 px strip with empty space under it. The game must fill the free vertical space of the Creating screen without distorting the art.

### 11.1 Approach

The logical world stays 800 × 300 (physics, spawning and hitboxes unchanged). The canvas is allowed to be taller than the 800:300 ratio; the engine keeps a uniform scale (from the width), centres the world band vertically with a bias towards the sky, and paints the extra area above with the sky and below with the earth, so the result looks like a taller scene rather than a letterbox.

### 11.2 Engine change (`game.js` only, documented in `SOURCE.md`)

- `resize()`: use the root's real CSS height when it differs from `cssW * H / W` (the host sets it through CSS, see 11.3); otherwise keep the current behaviour. Set `this.scale = bw / W` as now, `this.viewH = bh / this.scale` (visible logical height, ≥ H) and `this.offsetY = Math.round((this.viewH - H) * 0.65)` (65 % of the extra space goes above the world band, 35 % below). Both are 0 in the unchanged case.
- `render()`: before translating, fill the whole visible area (`0..viewH`) with `PALETTE.skyTop` above the band and `PALETTE.earthDark` below it, then `ctx.translate(0, this.offsetY)` and draw the world exactly as today. The sky gradient starts at `skyTop` at y = 0 and the earth gradient ends at `earthDark` at y = H, so the fills are seamless. Draw the vignette over the full visible area instead of the band (pass `viewH` and `-offsetY` to `drawVignette`, or draw it in `game.js`), so there is no visible band edge.
- HUD (score bar) and the catch star burst: draw them relative to the visible canvas top, not the band (`ctx.setTransform(scale…)` without the band offset, same positions as today), so the score stays in the top corner.
- Screen shake and the pulse scale keep working (they are applied inside the translated world).
- Floating leaves may spawn in the extra sky: extend `makeLeaf` bounds by `offsetY` only if trivial; otherwise leave as is.
- No change to `WORLD`, `config.js`, `entities.js` or `input.js`. `peanut-run.css` is not changed (the host overrides the aspect ratio, 11.3).

### 11.3 Host sizing

- `PeanutRunGame.module.css`: `.slot { flex: 1 1 0; min-height: 128px; max-height: 420px; display: flex }` and `.slot :global(.peanut-run) { aspect-ratio: auto; height: 100%; max-width: none }`. The engine's ResizeObserver on the root picks up the height.
- `CreatingPage.module.css`: the game section (label, slot, hint) becomes the flex-growing block of the column (`flex: 1 1 0; min-height: 0; display: flex; flex-direction: column`), the slot grows inside it, and `.center` stops centring (`justify-content: flex-start`) so the game takes the leftover space between the hint and the footer. At 390 × 844 the game should be roughly 342 × 240–280 px; at 360 × 640 at least 128 px tall; on desktop it caps at 420 px tall.
- The wrapper's existing narrow-slot dialog overrides stay; with more height the engine's own stacked dialog may fit again, so the `@container (max-width: 560px)` rule should become `@container (max-width: 560px) and (max-height: 200px)` so the two-column layout applies only to short slots.

### 11.4 Acceptance

- [ ] At 390 × 844 the game is at least 240 px tall and the screen does not scroll; at 360 × 640 the game is at least 128 px tall and nothing overflows; at 1280 × 900 the game is no taller than 420 px.
- [ ] The art is not stretched: the peanut and squirrel keep their proportions (compare against a 800 × 300 screenshot); the sky and ground extend seamlessly above and below.
- [ ] The score bar stays in the top-left of the canvas; the catch dialog is centred and its buttons are ≥ 44 px tall at every size.
- [ ] `diff` against the branch shows changes in `game.js` only for `resize()`, `render()`, the HUD/star positioning and the vignette call, plus the earlier `strings` change; `SOURCE.md` lists "Fit" as a local change.
- [ ] Gameplay unchanged: start, jump, catch, Sí / No, high score persistence; tests still pass (add one `resize()` test with a taller container that asserts `offsetY > 0` and the backing height).
