# Peanut Run: vendored source

- Origin: branch `peanut-run-game`, commit `f021912` (`f021912e648555a0ab8f8ada8c9831c1afc20cf7`, "Add Peanut Run game"), folder `peanut-run/src/peanut-run/`.
- Copied: `index.js`, `game.js`, `entities.js`, `background.js`, `input.js`, `audio.js`, `config.js`, `peanut-run.css`, and `peanut-run/README.md`.
- Not copied: `PeanutRun.jsx` (the app has its own typed wrapper, `src/game/PeanutRunGame.tsx`), `index.html`, `PLAN.md`.
- Ours, not upstream: `index.d.ts` (typings for the public API) and this file.
- ESLint ignores `src/game/peanut-run/*.js`; TypeScript reads `index.d.ts`, not the JS (no `allowJs`).

## Local changes

One behaviour change, the `strings` option (spec §4.3), backwards compatible (the colour changes are listed under "Theme" and the taller-canvas support under "Fit" below): without `options.strings` the game shows exactly the upstream English texts.

- `index.js`: new exported `DEFAULT_STRINGS` (the upstream English texts) and a `PeanutRunStrings` typedef; `createPeanutRun` merges `options.strings` over the defaults, passes them to `buildDom(strings)` (every hard-coded text replaced by its key) and to `new Game({ ..., strings })`.
- `game.js`: the constructor keeps `this.strings`; the three places that write text use it: the sound button `aria-label` (`mute` / `unmute`) and `title` (`soundOn` / `soundOff`) in `syncMuteButton()`, the end card score (`finalScore(score)`) in `chooseNo()`, and the canvas HUD label (`best`, upper-cased, was `BEST`) in `drawHud()`.
- `README.md`: one row for `strings` in the options table.

Keys beyond the spec's list: `soundOn` / `soundOff`, because upstream also sets a `title` tooltip ("Sound on (M)" / "Sound off (M)") on the sound button. The `mute` / `unmute` defaults are the upstream labels "Mute sound" / "Unmute sound".

## Theme

The dusk-sky colours are replaced with the app palette (`docs/design/tokens.json`), spec §10. Only colour values change: no keys, selectors, sizes, layout, animations or drawing code.

- `config.js`: every `PALETTE` value and `OBSTACLE_KINDS.pebble` take the values of spec table §10.1.
- `peanut-run.css`: the `--pr-*` variables, the `.peanut-run` background and box-shadow (and the matching `:focus-visible` shadow), the title text-shadow, the paused overlay background, the secondary button (white, `1.5px` `--pr-accent` border, brown text) and the primary button (flat `--pr-accent`, white text, hover `--pr-accent-2`) take the values of spec table §10.2.

Single-value adjustments beyond the spec tables:

- Text contrast (4.5:1, measured on the worst background in screenshots):
  - `PALETTE.hudSoft` is `rgba(74, 47, 27, 0.8)`, not `0.62` (the "MEJOR" label was 3.5:1, now 5.6:1).
  - `PALETTE.hudPulse` is `#983F0F`, not `#D4621A` (the pulsing score was 3.0:1, now 5.4:1).
  - `--pr-text-soft` is `rgba(74, 47, 27, 0.8)`, not `0.66` (dialog stat labels and the soft "MEJOR" value were 3.7:1, now 5.2:1).
  - `--pr-gold` is `#983F0F`, not `#D4621A` (the "New record" line was 2.7:1, now 4.9:1).
- Leftover dusk-purple values that the spec tables do not list, moved to the same alpha in the brown/light family:
  - `.peanut-run__mute` background: `rgba(255, 255, 255, 0.62)`, hover `0.9`. The old dark-purple chip left the brown icon unreadable.
  - `.peanut-run__backdrop` background: `rgba(42, 26, 14, 0.38)`.
  - `.peanut-run__dialog` drop shadow: `rgba(42, 26, 14, 0.35)`.
  - Primary button shadow: `rgba(74, 47, 27, 0.35)`.
  - Secondary button hover: `#FEF3E2`, because the upstream translucent white would look lighter than the new white button.

Not changed (drawing code): the hard-coded colours in `background.js`, `entities.js` and `game.js`. These include the edge vignette `rgba(18, 10, 48, 0.3)`, the catch dim `rgba(12, 6, 36, …)`, the rock outline `#4e4c55` and the twinkle star `#fff2a8`. They now give the corners a faint grey tint.

Upstream quirk: `OBSTACLE_KINDS.pebble` is a string, but `game.js` (`spawn`) and `entities.js` (`Obstacle`) read `.w` / `.h` / `.insetX` from it. A cluster with a `pebble` part therefore gets `NaN` geometry and is never drawn or hit. The cluster pebble would use `drawRock` colours anyway. The value is themed as the spec asks, and the bug is left as upstream has it.

## Fit

The game fills the free height of its host without distorting the art, spec §11. Only `game.js` changes; the logical world stays 800 × 300 (physics, spawning, hitboxes, `WORLD`, `config.js`, `entities.js`, `input.js` and `peanut-run.css` unchanged). Without a taller host (the root keeps `aspect-ratio: 800 / 300`) the output is the same as upstream.

- `constructor`: two new fields, `viewH` (visible logical height, `H` by default) and `offsetY` (logical y of the world band's top inside the canvas, `0` by default).
- `resize()`: the backing height comes from the root's real CSS height when it is taller than `cssW × 300 / 800` (the host sets it, see `src/game/PeanutRunGame.module.css`), otherwise from the width as before. The scale stays uniform from the width (`scale = bw / 800`); `viewH = bh / scale` and `offsetY = round((viewH − 300) × 0.65)`, so 65 % of the extra height is sky above the band and 35 % earth below it.
- `render()`: the solid backdrop fills the whole visible area (`PALETTE.skyTop` down to the ground line, `PALETTE.earthDark` below it); the world is drawn translated by `offsetY`. The sky gradient starts at `skyTop` and the earth gradient ends at `earthDark`, so both extensions are seamless. When the canvas is taller, the world is clipped at the band's bottom edge (floored to a whole device pixel), because the sun glow reaches y = 358 and would show as a light square on the earth; above the band nothing is clipped, so the sun glow fades out naturally and falling leaves drift through the extra sky. Screen shake is applied inside the band as before.
- Vignette: upstream `Background#drawVignette` is drawn over the full visible area through a vertical `ctx.scale(1, viewH / 300)` (identity when the canvas is 800:300), so there is no band edge. `background.js` is not changed.
- HUD: `drawHud()` is unchanged; it runs after the band translation is restored, so the score chip stays at the canvas top-right corner (as upstream; the sound button is top-left).

Not changed on purpose: the catch effects (`drawImpact` star, `drawSparkles`) are anchored to the peanut and squirrel, so they stay in world coordinates and move with the band; `makeLeaf` bounds are not extended (leaves already start above the band, y −10…−90, and are now visible in the extra sky).

## Re-syncing with the branch

```sh
for f in index.js game.js entities.js background.js input.js audio.js config.js peanut-run.css; do
  git show origin/peanut-run-game:peanut-run/src/peanut-run/$f > frontend/src/game/peanut-run/$f
done
git show origin/peanut-run-game:peanut-run/README.md > frontend/src/game/peanut-run/README.md
```

Then re-apply the changes above, including the Theme values and the Fit change (`diff` against the previous version of each file shows them) and run `npm test`: `src/game/peanutRun.test.ts` checks the Spanish strings and the English defaults.
