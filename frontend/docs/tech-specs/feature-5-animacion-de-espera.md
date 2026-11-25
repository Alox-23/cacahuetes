# Feature 5 · Waiting animation instead of the Peanut Run game

Date: 2026-11-25 · Branch: `dev-peanut-animation` (forked from `dev` at `57f933a`) · Replaces: `feature-3-juego-mientras-se-crea-la-ruta.md`

## 1. Goal

While the route is being created, the mobile creating screen shows a small automatic animation: the peanut running away from the squirrel. Nothing to play, nothing to tap, no score, no sound. The playable Peanut Run game and everything that exists only to support it are removed. The result must be as simple and as cheap to run as possible.

## 2. What is there today

- `src/game/peanut-run/`: a vendored canvas engine, about 3,000 lines of JavaScript plus 320 lines of CSS (`game.js`, `entities.js`, `background.js`, `input.js`, `audio.js`, `config.js`, `index.js`, `index.d.ts`, `peanut-run.css`, two docs).
- `src/game/PeanutRunGame.tsx` (+ CSS module, test), `src/game/gameStrings.ts`, `src/game/peanutRun.test.ts`, `src/test/fakeCanvas.ts`.
- `src/pages/CreatingPage.tsx`: mounts the game, polls its state, and because a run must never be interrupted it only auto-navigates to the route when the game was never touched; otherwise it shows a "Tu ruta está lista / Ver ruta" banner.
- `es.json`: the whole `game` group (19 strings), plus `creating.gameLabel`, `creating.gameHint`, `creating.readyBanner`, `creating.viewRoute`, `creating.titleReady`.
- `localStorage` keys `rt.peanutRun.highScore` and `rt.peanutRun.muted`.
- `eslint.config.js` ignores `src/game/peanut-run/*.js`; `src/test/setup.ts` stubs `HTMLCanvasElement.prototype.getContext`.
- Desktop has no game: the creation progress is a bubble in the chat (`src/shell/ChatDock.tsx`).

## 3. Decisions

| Question | Decision |
| --- | --- |
| Technique | One inline SVG animated with CSS keyframes only. No canvas, no `requestAnimationFrame`, no timers, no JavaScript at runtime beyond rendering the markup. |
| Why | CSS animations of `transform` run on the compositor, stop by themselves when the tab is hidden or the element is off screen, cost nothing when idle, need no cleanup and cannot leak. It is also the smallest possible code. |
| Engine | Deleted entirely. Nothing is kept "just in case"; it stays in git history and on the `peanut-run-game` branch. |
| Art | Two small hand-written SVG figures in the app palette: the peanut (reuse the shapes of `public/mascot/cacahuete.svg` / the `Mascot` component) and a simple squirrel (body, head, ear, bushy tail, eye). Before deleting the engine, read `Peanut` and `Squirrel` in `src/game/peanut-run/entities.js` for proportions and colours so the new figures are recognisably the same characters. Flat shapes, no gradients or filters. |
| Motion | A loop of about 1.2–1.6 s: both figures bob up and down on a short "run" cycle (the squirrel slightly out of phase and with a tail sway), the peanut ahead on the right and the squirrel behind on the left, both facing right; a dashed or dotted ground line scrolls left underneath to give the sense of speed. The gap between them oscillates a little so it reads as a chase. Nobody is ever caught; the loop is seamless. |
| Properties animated | `transform` only (and `stroke-dashoffset` for the ground if that is simpler). No layout-affecting properties, no `filter`, no `box-shadow` animation. |
| Size | The animation fills the width of its slot with a fixed aspect ratio (`viewBox`), height between 96 and 160 px. It no longer grows to fill the free space. |
| Reduced motion | Under `prefers-reduced-motion: reduce` the figures are shown still (the global rule in `global.css` already neutralises animations; verify the still frame looks right). |
| Accessibility | The SVG is decorative: `aria-hidden="true"`, not focusable, no role, no label. The step list keeps announcing progress as it does today. |
| Navigation | With nothing to interrupt, the screen goes to the route as soon as it is ready, always. The "Tu ruta está lista / Ver ruta" banner, the "untouched" logic, the state polling and the game handle are removed. "Cancelar" stays as it is. |
| Texts | Remove the `game` group and `creating.gameLabel`, `creating.gameHint`, `creating.readyBanner`, `creating.viewRoute`. Remove `creating.titleReady` if nothing uses it afterwards. No visible label or hint is added for the animation. |
| Storage | The app stops reading and writing `rt.peanutRun.*`. Leftover values in users' browsers are harmless and are not cleaned up. |
| Desktop | Unchanged: the progress bubble in the chat, no animation. Out of scope. |
| Colours | CSS variables only, like every other component; the "vendored CSS is exempt from the no-raw-hex rule" exception disappears with the engine. |

## 4. Implementation

1. **New component** `src/components/ChaseAnimation/ChaseAnimation.tsx` + `ChaseAnimation.module.css`, exported from `src/components/index.ts`. No props except an optional `className`. Target: well under 150 lines for both files together.
2. **`src/pages/CreatingPage.tsx`**: replace the game section with `<ChaseAnimation />`; delete `gameState`, the `game` ref, `untouched`, `onExit`, `showBanner` and the banner markup; the effect becomes "when the route is ready, go to it". Keep the title row, the steps card (including the short-viewport one-line variant), the failed state and Cancel.
3. **`src/pages/CreatingPage.module.css`**: remove the game label, hint and banner rules and the grow-to-fill behaviour of the game block; lay the animation out between the steps and the footer.
4. **Delete**: `src/game/` (whole folder), `src/test/fakeCanvas.ts`.
5. **Clean up references**: the `game` group and the four or five `creating.*` keys in `src/i18n/es.json`; the `src/game/peanut-run/*.js` ignore in `eslint.config.js`; the canvas stub in `src/test/setup.ts` (only if nothing else needs it; run the tests to confirm); any `game` mention in `vitest.config.ts`, `tsconfig.json` or `vite.config.ts`; a raised vitest timeout that existed only for the game's smoke tests may go back to the default if the suite stays green.
6. **Tests**: rewrite `src/pages/CreatingPage.test.tsx` for the new behaviour: the animation is present and `aria-hidden`; there is no canvas and no button inside it; the screen navigates to the route when creation finishes; no banner; Cancel returns to the conversation; the failed state still shows the error. Remove the game tests with the game. Every other test in the suite must keep passing unmodified (baseline on this branch: 23 files, 157 tests).
7. **Docs**: in `frontend/README.md`, replace the Peanut Run section, the `/creating` row of the URL table, the `game/` line of the structure and the storage keys with a short description of the animation. Add a line at the top of `feature-3-juego-mientras-se-crea-la-ruta.md` saying it is superseded by this document; do not delete it.

## 5. Acceptance checklist

- [ ] `/creating` on mobile shows the peanut running from the squirrel, looping, with no interaction: tapping, clicking and pressing keys on it do nothing, and it cannot receive focus.
- [ ] No `<canvas>`, no `requestAnimationFrame`, no `setInterval` / `setTimeout`, no audio and no `localStorage` access in the new component.
- [ ] Only `transform` (and optionally `stroke-dashoffset`) is animated.
- [ ] With reduced motion the figures are visible and still.
- [ ] When the route is ready the screen goes to it automatically, every time; there is no "Ver ruta" banner.
- [ ] Steps, title, failed state and Cancel behave as before.
- [ ] `src/game/` and `src/test/fakeCanvas.ts` no longer exist; `grep -ri "peanutrun\|peanut-run\|gameStrings\|fakeCanvas" src eslint.config.js vitest.config.ts` finds nothing.
- [ ] No unused keys left under `game` or `creating` in `es.json`.
- [ ] No raw hex in the new component.
- [ ] `npm run check && npm test && npm run build` pass; the production JS bundle is smaller than before (record both sizes).
- [ ] Looks right at 360, 390 and 430 px wide and on a short viewport (under 700 px tall): nothing overlaps the steps or the footer.
- [ ] Desktop creating flow is unchanged.

## 6. Out of scope

Adding the animation to the desktop chat or anywhere else, sound, any interaction, obstacles, scores, new dependencies (no Lottie, no animation library), and changes to the creation logic in the provider.
