# Peanut Run

An original one-button endless runner. A peanut runs away from a hungry squirrel through an
autumn forest and jumps over rocks, mushrooms, stumps and logs. If it hits one, the squirrel
pounces, catches it and lifts it overhead in triumph. Then a dialog shows your score and asks
"Play again?".

The game is plain ES modules and Canvas 2D: no dependencies, no build step, and no image or
audio assets (all the art is drawn in code).

## Run the demo

ES modules do not load from `file://`, so serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

Controls: **Space**, **Up arrow** or **W** to jump (hold for a higher jump, tap for a short hop),
or tap/click the game. The keyboard works when the game has focus or the pointer is over it.

## Use it in a React app

1. Copy `src/peanut-run/` into your project, for example to `src/peanut-run/`.
2. Render the wrapper:

```jsx
import PeanutRun from './peanut-run/PeanutRun.jsx';

export function GamePage() {
  return (
    <PeanutRun
      onGameOver={(score, highScore) => console.log('caught at', score, 'best', highScore)}
      onExit={(score) => navigate('/')}
      className="my-game-slot"
    />
  );
}
```

`PeanutRun.jsx` imports `./peanut-run.css`. Vite, CRA and Next.js handle that import. Outside
React, link the CSS yourself (see `index.html`).

The wrapper creates the game in a single `useEffect` and calls `destroy()` on unmount, so it is
safe under React StrictMode's mount, unmount and remount cycle. The latest callbacks are kept in
a ref, so passing new functions on each render does not restart the game.

## Framework-agnostic API

```js
import { createPeanutRun } from './src/peanut-run/index.js';

const game = createPeanutRun(document.getElementById('slot'), {
  onGameOver: (score, highScore) => {},
  onExit: (score) => {},
  highScoreKey: 'peanut-run:highscore',
});

game.pause();
game.resume();
game.restart();
game.getState(); // { state, score, highScore, paused, speed }
game.destroy();
```

| Option         | Type                                   | Default                  | Description |
| -------------- | -------------------------------------- | ------------------------ | ----------- |
| `onGameOver`   | `(score, highScore) => void`           | none                     | Fired when the catch animation ends and the "Play again?" dialog opens. |
| `onExit`       | `(score) => void`                      | none                     | Fired when the player answers **No**. An end card with a small **Play** button stays visible in case the host ignores this. |
| `highScoreKey` | `string \| null`                       | `'peanut-run:highscore'` | localStorage key for the best score. Pass `null` to disable persistence. |
| `autoFocus`    | `boolean`                              | `true`                   | Focus the game when it is created, so Space works straight away. |
| `sound`        | `boolean`                              | `true`                   | Sound effects. `false` disables them and hides the mute button. |
| `soundKey`     | `string \| null`                       | `'peanut-run:muted'`     | localStorage key for the player's mute preference. Pass `null` to disable persistence. |
| `strings`      | `Partial<PeanutRunStrings>`            | `DEFAULT_STRINGS` (English) | UI texts, merged over the defaults: `title`, `startHint`, `paused`, `pausedHint`, `caught`, `score`, `best` (also the canvas HUD label, upper-cased), `newHigh`, `playAgain`, `yes`, `no`, `thanks`, `finalScore` (a function `(score) => string`), `play`, `ariaLabel` (game root), `mute` / `unmute` (sound button `aria-label`), `soundOn` / `soundOff` (sound button tooltip). Local addition in this app, see `SOURCE.md`. |

| Method       | Description |
| ------------ | ----------- |
| `pause()`    | Freeze the game. Mid-run, it shows a "Paused" overlay. The game also pauses itself when the tab is hidden or the window loses focus. |
| `resume()`   | Continue with no time jump. Pressing a jump key or tapping also resumes. |
| `restart()`  | Full reset and straight into a new run. |
| `setMuted(muted)` | Mute or unmute the sound effects. `isMuted()` returns the current setting. |
| `getState()` | Read-only snapshot. `state` is one of `ready`, `running`, `caught`, `gameover` or `exited`. |
| `destroy()`  | Cancels the animation frame and removes every listener, the ResizeObserver and all the DOM the game created. Safe to call twice. |

The game builds its own DOM inside the container: a focusable `div.peanut-run`, a `<canvas>`
and the overlays (start hint, paused, dialog, end card). The game-over dialog is real DOM, with
`role="dialog"` and `aria-modal="true"`, and it is labelled by its heading. Every CSS selector is
scoped under `.peanut-run`, and the `--pr-*` custom properties on `.peanut-run` can be
overridden for theming.

There is no module-level mutable state, so several instances can share a page. Keyboard input
goes only to the instance that is focused or under the pointer.

## Sound

Sound effects are synthesised with the Web Audio API in `audio.js`, so there are no audio files to bundle.
Effects: run start, jump, landing, 100-point chime, crash, the squirrel's pounce and grab, game over,
new-best fanfare and button clicks.

- Browsers only allow audio after a user gesture, so the first sound plays with the first key press or tap.
- The player can mute with the speaker button in the top-left corner or the **M** key; the choice is remembered.
- Sound is silenced while the game is paused.

## Tunable constants (`src/peanut-run/config.js`)

| Group            | Key                                    | Default            | Meaning |
| ---------------- | -------------------------------------- | ------------------ | ------- |
| `WORLD`          | `width`, `height`, `groundY`           | 800, 300, 240      | Logical resolution. The canvas scales to the container (max 800 CSS px wide) and is sharp at any devicePixelRatio. |
| `PHYSICS`        | `gravity`                              | 2600 u/s²          | |
|                  | `jumpVelocity`                         | −820 u/s           | Full jump: about 129 u high and 0.63 s in the air. |
|                  | `jumpCutVelocity`                      | −300 u/s           | Upward speed is capped to this when the button is released early. |
|                  | `minJumpTime`                          | 0.06 s             | The cut only applies after this long, so an instant tap still gives a usable hop. |
|                  | `jumpBuffer`, `coyoteTime`             | 0.1 s, 0.08 s      | A press just before landing still jumps; so does a press just after leaving the ground. |
|                  | `maxDt`                                | 1/30 s             | Frame-delta clamp. |
| `SPEED`          | `start`, `max`, `rampSeconds`          | 330, 760, 90       | World speed ramps linearly from start to max. |
| `SPAWN`          | `firstDelay`                           | 1.5 s              | |
|                  | `reactionTime`, `extraMax`, `safety`   | 0.2 s, 0.9 s, 30 u | gap = full-jump distance + peanut width + safety + speed × (reaction + random extra). |
|                  | `clusterFromSpeed`, `clusterChance`    | 470 u/s, 0.3       | When clusters of 2–3 small obstacles start appearing, and how often. |
| `PEANUT`         | `x`, `hitbox`                          | 170                | The hitbox is inset about 25% from the drawn outline. |
| `SQUIRREL`       | `x`                                    | 62                 | |
| `CATCH`          | `impactEnd`, `sprintEnd`, `pounceEnd`, `total` | 0.3, 0.55, 1.0, 1.55 s | Phase timings of the catch animation. |
|                  | `shakeAmplitude`, `leapHeight`, `pinOffset`, `holdHeight` | | Feel of the catch. |
| `SCORE`          | `unitsPerPoint`, `pulseEvery`          | 10, 100            | Score = distance / 10. The score pulses every 100 points. |
| `DIALOG`         | `inputGuardMs`                         | 400 ms             | Clicks and key presses on the dialog are ignored for this long after it opens. Auto-repeating keys are always ignored. |
| `OBSTACLE_KINDS` | per kind `w`, `h`, `insetX`, `insetTop` |                   | Drawn size and hitbox inset. |
| `PALETTE`        | colours                                |                    | The whole palette: dusk sky, violet hills, warm autumn foliage. |

When the OS asks for reduced motion (`prefers-reduced-motion: reduce`), screen shake, the score
pulse and the CSS animations are turned off.

## Files

```
index.html                    standalone demo
src/peanut-run/index.js       public API (createPeanutRun) and DOM construction
src/peanut-run/game.js        state machine, loop, spawning, scoring, collisions, catch sequence
src/peanut-run/entities.js    Peanut, Squirrel and Obstacle: update and drawing
src/peanut-run/background.js  parallax sky, hills, trees, ground and drifting leaves
src/peanut-run/input.js       keyboard and pointer handling (attach/detach)
src/peanut-run/config.js      tunable constants
src/peanut-run/peanut-run.css styles, scoped under .peanut-run
src/peanut-run/PeanutRun.jsx  React wrapper
```
