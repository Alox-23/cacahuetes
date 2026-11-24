# Peanut Run — implementation plan

An original endless-runner web game: a peanut runs away from a hungry squirrel, jumping over
obstacles. When the peanut hits an obstacle, the squirrel catches it, the score is shown, and a
"Play again?" dialog offers **Yes** / **No**.

The game will later be embedded in a React app, so the core is a framework-agnostic module with a
thin React wrapper on top.

## 1. Constraints and decisions

- **No build step, no dependencies.** Plain ES modules + Canvas 2D. The machine has no Node, only
  Python 3 (`python3 -m http.server` for the demo). ES modules do not load from `file://`.
- **No image/audio assets.** All art is drawn procedurally on the canvas (shapes, curves), so
  there is nothing to bundle or license. Sound is out of scope for v1.
- **Original look.** Same genre as other one-button runners, but its own art direction: a warm,
  coloured autumn-forest style (not a monochrome pixel look, no copied sprites, sounds or layout
  from any existing game).
- **Engine knows nothing about React.** It takes a DOM container and callbacks. The React wrapper
  only mounts/unmounts it.
- **The dialog is real DOM** (not canvas-drawn), so buttons are focusable, keyboard-usable and
  styleable by the host app.

## 2. File layout

```
index.html                 standalone demo page (imports src/peanut-run/index.js)
src/peanut-run/
  index.js                 public API: createPeanutRun(container, options)
  game.js                  state machine, main loop, spawning, scoring, collisions
  entities.js              Peanut, Squirrel, Obstacle: update + draw
  background.js            parallax sky / hills / trees / ground
  input.js                 keyboard + pointer handling, attach/detach
  config.js                all tunable constants in one place
  peanut-run.css           styles, everything scoped under .peanut-run
  PeanutRun.jsx            React wrapper component
README.md                  how to run the demo + how to integrate in React
```

## 3. Public API

```js
const game = createPeanutRun(container, {
  onGameOver: (score, highScore) => {},  // fired when the catch animation ends
  onExit: (score) => {},                 // fired when the player presses "No"
  highScoreKey: 'peanut-run:highscore',  // localStorage key; null disables persistence
});
game.pause(); game.resume(); game.restart(); game.destroy();
```

- `createPeanutRun` builds its own DOM inside `container` (root `div.peanut-run`, a `<canvas>`,
  a score HUD is drawn on canvas, and overlay elements for the start hint and the dialog).
- `destroy()` must cancel the animation frame, remove every event listener and the
  ResizeObserver, and remove the DOM it created. Calling it twice is safe. This is what makes
  React StrictMode's mount → unmount → mount cycle work.
- No module-level mutable state: two instances on one page must not interfere.

React wrapper (`PeanutRun.jsx`): a function component with a `ref` div and one `useEffect` that
calls `createPeanutRun` and returns `game.destroy`. Props `onGameOver`, `onExit`, `className`.
Keep the latest callbacks in a ref so changing them does not recreate the game. Imports the CSS
(`import './peanut-run.css'`), which Vite/CRA/Next handle. The demo `index.html` links the CSS
with a `<link>` tag instead.

## 4. Game design

### Logical world
- Fixed logical resolution **800 × 300**, ground line at y = 240. The canvas scales to the
  container width (aspect ratio kept, max-width 800px), with devicePixelRatio scaling for
  sharpness. All game maths uses logical units.

### States
`ready` → `running` → `caught` (catch animation) → `gameover` (dialog) → `running` (Yes) or
`exited` (No).

- **ready**: scene drawn, peanut idling (small bob), hint "Press Space or tap to start".
- **running**: gameplay.
- **caught**: input ignored, world stops scrolling, catch animation plays (~1.5 s).
- **gameover**: dialog visible.
- **exited**: after "No": dialog replaced by a quiet end card ("Thanks for playing!", final score,
  and a small "Play" button so the game is not a dead end if the host ignores `onExit`).

### Controls
- Jump: `Space`, `ArrowUp`, `W`, or pointer down / tap on the game area.
- **Variable jump height**: releasing early cuts upward velocity (short hop vs. full jump).
- Jump buffering (~100 ms before landing) and coyote time are nice-to-have; buffering is required
  because it makes the game feel responsive.
- `preventDefault` on Space/ArrowUp only when the game has focus or the pointer is over it, so the
  host page still scrolls normally. The root element is focusable (`tabindex="0"`).
- No ducking in v1 (all obstacles are ground obstacles to jump over).

### Peanut (player)
- Fixed x ≈ 170. Drawn as a two-lobed peanut shell (figure-eight outline, tan fill, darker
  crosshatch texture), with eyes, tiny arms and two legs.
- Run cycle: legs alternate, body bobs slightly. In the air: legs tucked, slight forward rotation.
- Worried expression that intensifies when the squirrel is close is a nice touch, optional.
- Physics: gravity ≈ 2600 u/s², jump velocity ≈ −820 u/s, cut to ≈ −300 on early release. Tune so
  the highest obstacle is cleared comfortably at the starting speed and at max speed.

### Squirrel (chaser)
- Visible on screen during the run, at the left edge (x ≈ 40), running after the peanut — it is
  the reason the peanut runs. Bushy tail, bounding run cycle.
- Purely decorative during `running`; it cannot catch the peanut unless the peanut hits something.
- It also jumps obstacles as they pass under it (simple scripted hop when an obstacle reaches its
  x), so it never visibly runs through them.

### Obstacles
- Ground obstacles in a forest theme, at least 4 kinds with different hitbox sizes:
  small rock, tall mushroom, tree stump, log (wide, low), plus cluster variants (2–3 small ones
  together) at higher speeds.
- Spawned off the right edge, move left at the world speed, removed off the left edge.
- Spawn gap is derived from current speed so every pattern is always jumpable:
  `gap = speed * minReactionTime + random extra`, with a hard minimum larger than the jump's
  horizontal distance plus the obstacle width.
- First obstacle appears only after ~1.5 s.

### Difficulty and score
- World speed starts ≈ 330 u/s and rises smoothly to a cap ≈ 780 u/s over roughly 90 s.
- Score = distance travelled / 10, shown as an integer in the top-right corner. High score
  shown next to it ("HI 123"), persisted in localStorage (wrapped in try/catch).
- Small visual pulse on the score every 100 points.

### Collision
- Axis-aligned boxes, with the peanut's hitbox inset ~20% from its drawn outline so near-misses
  feel fair. Obstacle hitboxes slightly inset too.

### Catch animation (state `caught`)
Sequence, about 1.5 s total, driven by a timer in the same loop:
1. **Impact (0–0.3 s)**: world scrolling stops, short screen shake, peanut bounces back off the
   obstacle and tumbles onto the ground, dizzy stars/sweat drops.
2. **Pounce (0.3–1.0 s)**: the squirrel sprints from the left edge and leaps in an arc onto the
   peanut (eased motion).
3. **Caught (1.0–1.5 s)**: squirrel lands, grabs the peanut and lifts it over its head in
   triumph, tail swishing; peanut wiggles its legs. Keep it cartoonish and friendly — no eating
   or gore.
4. Then `onGameOver(score, highScore)` fires and the dialog fades in over the frozen (still
   gently animated) final pose.

### Game-over dialog
- DOM overlay centred over the canvas, `role="dialog"`, `aria-modal="true"`, labelled by its
  heading:
  - "The squirrel got you!"
  - "Score: 123" (+ "New high score!" when applicable, + "Best: 456")
  - "Play again?"
  - Buttons **Yes** and **No**.
- **Yes** gets focus when the dialog opens; `Enter`/`Space` on a focused button activates it.
  Jump keys must *not* restart the game instantly — add a ~400 ms guard so a held or mashed Space
  does not skip the dialog by accident.
- **Yes** → full reset (score, speed, obstacles, entities) and straight into `running`.
- **No** → `exited` state + `onExit(score)`.

### Background
- Parallax layers: sky gradient, slow distant hills, mid-speed tree silhouettes, ground strip
  with scrolling texture (grass tufts, pebbles, fallen leaves). A few drifting clouds.
- Autumn palette: warm oranges, browns, soft sky blue. Palette constants live in `config.js`.

## 5. Technical requirements

- **Loop**: `requestAnimationFrame` with delta time in seconds, clamped to 1/30 s so a tab
  switch or a long frame cannot tunnel the peanut through an obstacle. Frame-rate independent
  (same speed at 60 Hz and 144 Hz).
- **Auto-pause** on `visibilitychange` (hidden) and on window `blur`; resume cleanly without a
  time jump.
- **Resize**: ResizeObserver on the container re-sizes the canvas backing store.
- **`prefers-reduced-motion`**: disable screen shake and score pulse.
- **CSS**: every selector prefixed with `.peanut-run`; no global resets; `touch-action: none` and
  `user-select: none` on the game area only.
- Code style: small modules, constants in `config.js`, no globals, JSDoc on the public API.

## 6. Verification (must be done before reporting completion)

1. Serve with `python3 -m http.server` from the project root and load `index.html`.
2. If a headless browser is available (chromium / google-chrome / firefox, or Playwright via
   Python), drive the game: start it, confirm the score rises, let the peanut hit an obstacle,
   screenshot the catch animation and the dialog, click **Yes** (game restarts, score back to 0)
   and **No** (end card, `onExit` fired), and check the console for errors.
3. If no browser can be run, say so explicitly in the report, and at minimum confirm every module
   is served with 200 and re-read the code for import/export mismatches.
4. Check: `destroy()` then re-create works on the same container; two rapid create/destroy cycles
   leave no listeners or running loops (StrictMode simulation).

## 7. README contents

- How to run the demo.
- How to copy `src/peanut-run/` into a React project and use `<PeanutRun onExit={...} />`.
- The options/callbacks table and the tunable constants in `config.js`.
