/**
 * Peanut Run — public API.
 *
 * Framework-agnostic: builds its own DOM inside `container`, knows nothing about React.
 */
import { Game } from './game.js';

/**
 * @typedef {object} PeanutRunOptions
 * @property {(score: number, highScore: number) => void} [onGameOver]
 *   Fired when the catch animation ends and the "Play again?" dialog appears.
 * @property {(score: number) => void} [onExit]
 *   Fired when the player answers "No".
 * @property {string|null} [highScoreKey='peanut-run:highscore']
 *   localStorage key for the high score; `null` disables persistence.
 * @property {boolean} [sound=true]
 *   Sound effects (synthesised, no audio files). `false` disables them and hides the mute button.
 * @property {string|null} [soundKey='peanut-run:muted']
 *   localStorage key for the player's mute preference; `null` disables persistence.
 * @property {boolean} [autoFocus=true]
 *   Focus the game on creation so the keyboard works straight away.
 */

/**
 * @typedef {object} PeanutRunInstance
 * @property {() => void} pause    Freeze the game (shows a "Paused" overlay mid-run).
 * @property {() => void} resume   Continue after pause(); no time jump.
 * @property {() => void} restart  Full reset, straight into a new run.
 * @property {(muted: boolean) => void} setMuted  Mute / unmute the sound effects.
 * @property {() => boolean} isMuted
 * @property {() => void} destroy  Stop the loop, remove all listeners, observers and DOM. Idempotent.
 * @property {() => {state: string, score: number, highScore: number, paused: boolean, muted: boolean, speed: number}} getState
 *   Read-only snapshot (state is one of ready | running | caught | gameover | exited).
 */

function el(tag, className, attrs = {}, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

/** Builds the widget's DOM. Returns the root plus references the game needs. */
function buildDom() {
  const id = uid();
  const root = el('div', 'peanut-run', {
    tabindex: '0',
    role: 'application',
    'aria-label': 'Peanut Run game. Press Space or tap to jump.',
  });
  const canvas = el('canvas', 'peanut-run__canvas', { 'aria-hidden': 'true' });

  const hintLayer = el('div', 'peanut-run__layer peanut-run__hint');
  hintLayer.append(
    el('div', 'peanut-run__title', {}, 'Peanut Run'),
    el('div', 'peanut-run__hint-text', {}, 'Press Space or tap to start'),
  );

  const pausedLayer = el('div', 'peanut-run__layer peanut-run__paused');
  pausedLayer.hidden = true;
  pausedLayer.append(
    el('div', 'peanut-run__title', {}, 'Paused'),
    el('div', 'peanut-run__hint-text', {}, 'Press Space or tap to continue'),
  );

  const dialogLayer = el('div', 'peanut-run__layer peanut-run__backdrop', { 'data-peanut-run-ui': '' });
  dialogLayer.hidden = true;
  const headingId = `peanut-run-title-${id}`;
  const dialog = el('div', 'peanut-run__dialog', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': headingId,
  });
  const heading = el('h2', 'peanut-run__heading', { id: headingId }, 'The squirrel got you!');
  const score = el('span', 'peanut-run__stat-value', {}, '0');
  const newHigh = el('p', 'peanut-run__new-high', {}, 'New high score!');
  newHigh.hidden = true;
  const best = el('span', 'peanut-run__stat-value', {}, '0');
  const question = el('p', 'peanut-run__question', {}, 'Play again?');
  const buttons = el('div', 'peanut-run__buttons');
  const yes = el('button', 'peanut-run__button peanut-run__button--primary', { type: 'button' }, 'Yes');
  const no = el('button', 'peanut-run__button', { type: 'button' }, 'No');
  buttons.append(yes, no);
  const stats = el('div', 'peanut-run__stats');
  const scoreTile = el('p', 'peanut-run__stat');
  scoreTile.append(el('span', 'peanut-run__stat-label', {}, 'Score'), score);
  const bestTile = el('p', 'peanut-run__stat peanut-run__stat--soft');
  bestTile.append(el('span', 'peanut-run__stat-label', {}, 'Best'), best);
  stats.append(scoreTile, bestTile);
  dialog.append(heading, stats, newHigh, question, buttons);
  dialogLayer.append(dialog);

  const endLayer = el('div', 'peanut-run__layer peanut-run__backdrop', { 'data-peanut-run-ui': '' });
  endLayer.hidden = true;
  const endCard = el('div', 'peanut-run__dialog peanut-run__endcard', { role: 'status' });
  const endScore = el('p', 'peanut-run__score', {}, 'Final score: 0');
  const play = el('button', 'peanut-run__button peanut-run__button--small', { type: 'button' }, 'Play');
  endCard.append(el('h2', 'peanut-run__heading', {}, 'Thanks for playing!'), endScore, play);
  endLayer.append(endCard);

  // Sound toggle, top-left. Two icons; CSS shows the one matching the state.
  const mute = el('button', 'peanut-run__mute', { type: 'button', 'data-peanut-run-ui': '', 'aria-pressed': 'false' });
  mute.innerHTML =
    '<svg class="peanut-run__icon-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
    '<svg class="peanut-run__icon-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  root.append(canvas, hintLayer, pausedLayer, dialogLayer, endLayer, mute);
  return {
    root,
    canvas,
    ui: { hintLayer, pausedLayer, dialogLayer, endLayer, score, newHigh, best, yes, no, endScore, play, mute },
  };
}

/**
 * Create a Peanut Run game inside `container`.
 *
 * @param {HTMLElement} container element to mount into (the game appends its own root div)
 * @param {PeanutRunOptions} [options]
 * @returns {PeanutRunInstance}
 */
export function createPeanutRun(container, options = {}) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new TypeError('createPeanutRun: container must be a DOM element');
  }
  const { root, canvas, ui } = buildDom();
  container.appendChild(root);
  const game = new Game({ root, canvas, ui, options });
  if (options.autoFocus !== false) {
    try {
      root.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
  }

  let destroyed = false;
  return {
    pause: () => game.pause(),
    resume: () => game.resume(),
    restart: () => game.restart(),
    setMuted: (muted) => game.setMuted(muted),
    isMuted: () => game.muted,
    getState: () => ({
      state: game.state,
      score: game.score,
      highScore: game.highScore,
      paused: game.paused,
      muted: game.muted,
      speed: Math.round(game.speed),
    }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      game.destroy();
      root.remove();
    },
  };
}

export default createPeanutRun;
