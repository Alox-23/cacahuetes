/**
 * Game state machine, main loop, spawning, scoring, collisions and the
 * catch sequence. One Game instance per mounted widget; nothing is shared.
 *
 * States: ready -> running -> caught -> gameover -> running (Yes) | exited (No)
 */
import {
  WORLD,
  PHYSICS,
  SPEED,
  SPAWN,
  PEANUT,
  CATCH,
  SCORE,
  DIALOG,
  SINGLE_KINDS,
  CLUSTER_KINDS,
  OBSTACLE_KINDS,
  PALETTE,
} from './config.js';
import { Background } from './background.js';
import { Peanut, Squirrel, Obstacle, drawStar } from './entities.js';
import { attachInput } from './input.js';
import { Sfx } from './audio.js';

const W = WORLD.width;
const H = WORLD.height;
const G = WORLD.groundY;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInQuad = (t) => t * t;
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const FULL_AIR_TIME = (2 * -PHYSICS.jumpVelocity) / PHYSICS.gravity;
const PEANUT_HIT_W = PEANUT.hitbox.right - PEANUT.hitbox.left;

/** Hard minimum edge-to-edge gap: a full jump's ground distance + the peanut + a margin. */
export function minGap(speed) {
  return FULL_AIR_TIME * speed + PEANUT_HIT_W + SPAWN.safety;
}

function overlaps(a, b) {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}

function loadHigh(key) {
  if (!key) return 0;
  try {
    const v = parseInt(window.localStorage.getItem(key) || '0', 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (_) {
    return 0;
  }
}

function saveHigh(key, value) {
  if (!key) return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch (_) {
    /* storage may be unavailable (private mode, sandboxed iframe) */
  }
}

export class Game {
  /**
   * @param {object} p
   * @param {HTMLElement} p.root
   * @param {HTMLCanvasElement} p.canvas
   * @param {object} p.ui DOM references built by index.js
   * @param {object} p.options public options (callbacks, highScoreKey)
   * @param {object} [p.strings] UI texts (DEFAULT_STRINGS merged with options.strings, built by index.js)
   */
  constructor({ root, canvas, ui, options, strings }) {
    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.options = options;
    this.strings = strings || {};
    this.highScoreKey = options.highScoreKey === undefined ? 'peanut-run:highscore' : options.highScoreKey;
    this.highScore = loadHigh(this.highScoreKey);
    this.sfx = new Sfx({
      enabled: options.sound !== false,
      storageKey: options.soundKey === undefined ? 'peanut-run:muted' : options.soundKey,
    });

    this.background = new Background();
    this.peanut = new Peanut();
    this.squirrel = new Squirrel();
    this.obstacles = [];
    this.particles = [];

    this.state = 'ready';
    this.paused = false;
    this.destroyed = false;
    this.rafId = 0;
    this.lastTs = null;
    this.time = 0;
    this.scale = 1;
    this.viewH = H; // visible logical height (>= H when the host makes the canvas taller)
    this.offsetY = 0; // logical y of the world band's top inside the canvas
    this.uiShownAt = 0;
    this.suppressKeyClick = false;
    this.cleanups = [];
    this.motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    this.resetRun();
    this.state = 'ready';
    this.syncMuteButton();

    this.frame = this.frame.bind(this);
    this.bindDom();
    this.resize();
    this.ensureLoop();
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  bindDom() {
    const { root, ui } = this;
    const listen = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this.cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    this.cleanups.push(
      attachInput({
        root,
        playfield: root,
        onPress: () => this.onJumpPress(),
        onRelease: () => this.onJumpRelease(),
      }),
    );

    // Auto-pause when the tab is hidden or the window loses focus.
    listen(document, 'visibilitychange', () => {
      if (document.hidden) this.autoPause();
    });
    listen(window, 'blur', () => this.autoPause());

    // Resize the canvas backing store with the container.
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(root);
      this.cleanups.push(() => this.resizeObserver.disconnect());
    } else {
      listen(window, 'resize', () => this.resize());
    }

    // Dialog keyboard guard: a held (auto-repeating) or very early Space/Enter
    // must not activate Yes/No. Mouse clicks inside the guard window are ignored too.
    const guardKeys = (e) => {
      if (e.key !== ' ' && e.key !== 'Enter' && e.code !== 'Space') return;
      if (e.type === 'keydown') {
        if (e.repeat || performance.now() - this.uiShownAt < DIALOG.inputGuardMs) {
          e.preventDefault();
          this.suppressKeyClick = true;
        } else {
          this.suppressKeyClick = false;
        }
      } else if (this.suppressKeyClick) {
        e.preventDefault();
      }
    };
    for (const layer of [ui.dialogLayer, ui.endLayer]) {
      listen(layer, 'keydown', guardKeys, true);
      listen(layer, 'keyup', guardKeys, true);
    }
    const guarded = (fn) => (e) => {
      if (performance.now() - this.uiShownAt < DIALOG.inputGuardMs) return;
      if (e.detail === 0 && this.suppressKeyClick) {
        this.suppressKeyClick = false;
        return;
      }
      this.sfx.unlock();
      this.sfx.play('click');
      fn();
    };
    listen(ui.yes, 'click', guarded(() => this.chooseYes()));
    listen(ui.no, 'click', guarded(() => this.chooseNo()));
    listen(ui.play, 'click', guarded(() => this.restart()));

    // Sound toggle: the corner button, or the M key while the game has focus.
    if (!this.sfx.enabled) ui.mute.hidden = true;
    listen(ui.mute, 'click', () => {
      this.toggleMuted();
      // Hand focus back so Space keeps jumping instead of re-pressing the button.
      if (this.state === 'gameover') ui.yes.focus({ preventScroll: true });
      else if (this.state === 'exited') ui.play.focus({ preventScroll: true });
      else this.focusRoot();
    });
    listen(root, 'keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      this.toggleMuted();
    });

    // Keep Tab inside the modal dialog.
    listen(ui.dialogLayer, 'keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      (document.activeElement === ui.yes ? ui.no : ui.yes).focus();
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    for (const fn of this.cleanups.splice(0)) {
      try {
        fn();
      } catch (_) {
        /* keep cleaning */
      }
    }
    this.obstacles = [];
    this.particles = [];
    this.sfx.destroy();
  }

  ensureLoop() {
    if (this.rafId || this.paused || this.destroyed) return;
    this.lastTs = null;
    this.rafId = requestAnimationFrame(this.frame);
  }

  frame(ts) {
    this.rafId = 0;
    if (this.destroyed || this.paused) return;
    const dt = this.lastTs === null ? 0 : Math.min(Math.max(0, (ts - this.lastTs) / 1000), PHYSICS.maxDt);
    this.lastTs = ts;
    this.update(dt);
    this.render();
    // The end card is static: stop the loop there to save CPU.
    if (this.state !== 'exited') this.rafId = requestAnimationFrame(this.frame);
  }

  resize() {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = rect.width || W;
    // The host may make the root taller than 800:300 (Fit): use its real CSS height then.
    const fitH = (cssW * H) / W;
    const rootH = this.root.getBoundingClientRect().height;
    const cssH = rootH > fitH + 1 ? rootH : fitH;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.scale = bw / W;
    // Uniform scale from the width; the extra height is sky above (65 %) and earth below (35 %).
    this.viewH = Math.max(H, bh / this.scale);
    this.offsetY = Math.round((this.viewH - H) * 0.65);
    // A paused or stopped loop will not redraw on its own.
    if (!this.rafId) this.render();
  }

  get reducedMotion() {
    return !!(this.motionQuery && this.motionQuery.matches);
  }

  /* ---------------------------------------------------------------- */
  /* Public controls                                                   */
  /* ---------------------------------------------------------------- */

  pause() {
    if (this.destroyed || this.paused) return;
    this.paused = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.held = false;
    this.sfx.suspend();
    if (this.state === 'running' || this.state === 'caught') this.ui.pausedLayer.hidden = false;
  }

  resume() {
    if (this.destroyed || !this.paused) return;
    this.paused = false;
    this.sfx.resume();
    this.ui.pausedLayer.hidden = true;
    if (this.state !== 'exited') this.ensureLoop();
  }

  autoPause() {
    if (this.state === 'running' || this.state === 'caught') this.pause();
  }

  restart() {
    if (this.destroyed) return;
    this.hideLayers();
    this.resetRun();
    this.state = 'running';
    this.paused = false;
    this.sfx.resume();
    this.sfx.play('start');
    this.focusRoot();
    this.ensureLoop();
  }

  /* ---------------------------------------------------------------- */
  /* Sound                                                             */
  /* ---------------------------------------------------------------- */

  get muted() {
    return this.sfx.muted;
  }

  setMuted(muted) {
    if (this.destroyed) return;
    this.sfx.setMuted(muted);
    this.syncMuteButton();
  }

  toggleMuted() {
    this.sfx.unlock();
    this.setMuted(!this.sfx.muted);
    this.sfx.play('click');
  }

  syncMuteButton() {
    const { mute } = this.ui;
    mute.classList.toggle('is-muted', this.sfx.muted);
    mute.setAttribute('aria-pressed', String(this.sfx.muted));
    const str = this.strings;
    mute.setAttribute('aria-label', this.sfx.muted ? str.unmute || 'Unmute sound' : str.mute || 'Mute sound');
    mute.title = this.sfx.muted ? str.soundOff || 'Sound off (M)' : str.soundOn || 'Sound on (M)';
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  onJumpPress() {
    if (this.destroyed) return;
    this.sfx.unlock(); // a key press or tap is the user gesture browsers require for audio
    if (this.paused) {
      if (this.state === 'running' || this.state === 'caught' || this.state === 'ready') this.resume();
      if (this.state !== 'ready') return;
    }
    if (this.state === 'ready') {
      this.hideLayers();
      this.state = 'running';
      this.sfx.play('start');
      return;
    }
    if (this.state !== 'running') return;
    this.held = true;
    if (this.peanut.canJump()) {
      this.jump();
    } else {
      this.jumpBuffer = PHYSICS.jumpBuffer;
    }
  }

  jump() {
    this.peanut.jump();
    this.jumpBuffer = 0;
    this.sfx.play('jump');
    this.dust(this.peanut.x - 6, G, 3);
  }

  onJumpRelease() {
    this.held = false;
  }

  focusRoot() {
    try {
      this.root.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Run state                                                         */
  /* ---------------------------------------------------------------- */

  resetRun() {
    this.runTime = 0;
    this.speed = SPEED.start;
    this.distance = 0;
    this.score = 0;
    this.milestone = 0;
    this.pulse = 0;
    this.obstacles = [];
    this.particles = [];
    this.nextGap = 0;
    this.held = false;
    this.jumpBuffer = 0;
    this.catchT = 0;
    this.catchPlan = null;
    this.impact = null;
    this.shake = { x: 0, y: 0 };
    this.isNewHigh = false;
    this.peanut.reset();
    this.squirrel.reset();
    this.squirrel.mood = 'eager';
  }

  update(dt) {
    this.time += dt;
    const worldSpeed = this.state === 'running' ? this.speed : 0;
    this.background.update(dt, worldSpeed);
    this.updateParticles(dt);
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt);
    if (this.squirrel.squash > 0) this.squirrel.squash = Math.max(0, this.squirrel.squash - dt);

    switch (this.state) {
      case 'ready':
        this.peanut.updateIdle(dt, this.time);
        this.squirrel.updateIdle(dt);
        break;
      case 'running':
        this.updateRunning(dt);
        break;
      case 'caught':
        this.updateCaught(dt);
        break;
      default:
        this.updateTriumph();
    }
  }

  updateRunning(dt) {
    this.runTime += dt;
    const k = clamp01(this.runTime / SPEED.rampSeconds);
    this.speed = SPEED.start + (SPEED.max - SPEED.start) * k;
    this.distance += this.speed * dt;
    this.score = Math.floor(this.distance / SCORE.unitsPerPoint);
    const m = Math.floor(this.score / SCORE.pulseEvery);
    if (m > this.milestone) {
      this.milestone = m;
      this.sfx.play('milestone');
      if (!this.reducedMotion) this.pulse = SCORE.pulseDuration;
    }

    // Obstacles.
    for (const o of this.obstacles) o.x -= this.speed * dt;
    this.obstacles = this.obstacles.filter((o) => o.right > -80);
    if (this.runTime >= SPAWN.firstDelay) {
      const last = this.obstacles[this.obstacles.length - 1];
      const required = Math.max(this.nextGap, minGap(this.speed));
      if (!last || SPAWN.spawnX - last.right >= required) this.spawn();
    }

    // Peanut: buffered jump, then physics.
    if (this.jumpBuffer > 0) {
      if (this.peanut.canJump()) {
        this.jump();
      } else {
        this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      }
    }
    const wasAir = !this.peanut.onGround;
    this.peanut.updateRun(dt, this.speed, this.held);
    if (wasAir && this.peanut.onGround) {
      this.dust(this.peanut.x, G, 4);
      this.sfx.play('land');
    }

    this.squirrel.updateRun(dt, this.speed, this.obstacles);

    // Collision.
    const pb = this.peanut.hitbox();
    for (const o of this.obstacles) {
      if (o.x > pb.r || o.right < pb.l) continue;
      if (o.hitboxes().some((hb) => overlaps(pb, hb))) {
        this.startCatch();
        break;
      }
    }
  }

  spawn() {
    let parts;
    if (this.speed >= SPAWN.clusterFromSpeed && Math.random() < SPAWN.clusterChance) {
      const n = Math.random() < (this.speed - SPAWN.clusterFromSpeed) / 300 ? 3 : 2;
      parts = [];
      let dx = 0;
      for (let i = 0; i < n; i += 1) {
        const kind = pick(CLUSTER_KINDS);
        parts.push({ kind, dx });
        dx += OBSTACLE_KINDS[kind].w + 3 + Math.random() * 4;
      }
    } else {
      parts = [{ kind: pick(SINGLE_KINDS), dx: 0 }];
    }
    this.obstacles.push(new Obstacle(parts, SPAWN.spawnX));
    this.nextGap =
      minGap(this.speed) + this.speed * (SPAWN.reactionTime + Math.random() * SPAWN.extraMax);
  }

  /* ---------------------------------------------------------------- */
  /* Catch sequence                                                    */
  /* ---------------------------------------------------------------- */

  startCatch() {
    this.state = 'caught';
    this.catchT = 0;
    this.held = false;
    this.jumpBuffer = 0;
    this.impact = { x: this.peanut.x + 14, y: this.peanut.y - 2 };
    this.peanut.startTumble();
    this.squirrel.mood = 'surprised';
    this.squirrel.exclaim = 0.5;
    this.catchPlan = null;
    this.pounceSounded = false;
    this.sfx.play('hit');
  }

  updateCaught(dt) {
    this.catchT += dt;
    const t = this.catchT;
    const p = this.peanut;
    const s = this.squirrel;
    s.exclaim = Math.max(0, s.exclaim - dt);

    // Screen shake during impact.
    if (t < CATCH.impactEnd && !this.reducedMotion) {
      const a = CATCH.shakeAmplitude * (1 - t / CATCH.impactEnd);
      this.shake = { x: (Math.random() * 2 - 1) * a, y: (Math.random() * 2 - 1) * a };
    } else {
      this.shake = { x: 0, y: 0 };
    }

    if (t < CATCH.pounceEnd + 0.1) {
      const wasAir = !p.onGround;
      p.updateTumble(dt);
      if (wasAir && p.onGround) this.dust(p.x, G, 6);
    }

    if (t < CATCH.impactEnd) {
      // 1. Impact: the squirrel skids to a stop, surprised.
      s.fall(dt);
      s.pose = s.onGround ? 'crouch' : 'leap';
      s.leapU = 0.75;
    } else if (t < CATCH.sprintEnd) {
      // 2a. Sprint towards the peanut.
      if (!this.catchPlan) this.catchPlan = { x0: s.x };
      s.y = G;
      s.onGround = true;
      s.mood = 'eager';
      s.pose = 'run';
      s.phase += dt * 6;
      const target = p.x - CATCH.pinOffset;
      const sprintTo = lerp(this.catchPlan.x0, target, 0.35);
      s.x = lerp(this.catchPlan.x0, sprintTo, easeInQuad((t - CATCH.impactEnd) / (CATCH.sprintEnd - CATCH.impactEnd)));
      this.catchPlan.leapFrom = s.x;
    } else if (t < CATCH.pounceEnd) {
      // 2b. Pounce: eased arc onto the peanut.
      if (!this.catchPlan) this.catchPlan = { x0: s.x, leapFrom: s.x };
      if (this.catchPlan.leapFrom === undefined) this.catchPlan.leapFrom = s.x;
      if (!this.pounceSounded) {
        this.pounceSounded = true;
        this.sfx.play('pounce');
      }
      const u = clamp01((t - CATCH.sprintEnd) / (CATCH.pounceEnd - CATCH.sprintEnd));
      s.pose = 'leap';
      s.leapU = u;
      s.x = lerp(this.catchPlan.leapFrom, p.x - CATCH.pinOffset, easeInOutSine(u));
      s.y = G - 4 * CATCH.leapHeight * u * (1 - u);
      if (u > 0.55) p.mood = 'scared';
    } else {
      // 3. Caught: pin, then lift the peanut overhead in triumph.
      if (!this.catchPlan) this.catchPlan = {};
      if (!this.catchPlan.landed) {
        this.catchPlan.landed = true;
        s.y = G;
        s.squash = 0.12;
        this.sfx.play('grab');
        this.dust(s.x + 20, G, 10);
      }
      const k = t - CATCH.pounceEnd;
      if (k < 0.1) {
        s.pose = 'crouch';
        s.mood = 'happy';
        p.legs = 'kick';
        p.mood = 'scared';
      } else {
        if (!this.catchPlan.grab) this.catchPlan.grab = { x: p.x, y: p.y, rot: p.rot };
        const e = easeOutBack(clamp01((k - 0.1) / 0.35));
        const g = this.catchPlan.grab;
        s.pose = 'stand';
        s.mood = 'happy';
        p.x = lerp(g.x, s.x + 4, e);
        p.y = lerp(g.y, s.y - CATCH.holdHeight, e);
        p.rot = lerp(g.rot, 0, clamp01(e)) + Math.sin(this.time * 14) * 0.12 * clamp01(e);
        p.legs = 'kick';
        p.arms = 'flail';
        p.mood = 'scared';
        this.holdPeanut();
      }
    }

    if (t >= CATCH.total) this.finishCatch();
  }

  /** Paws follow the peanut's lower lobe (rotation-aware). */
  holdPeanut() {
    const p = this.peanut;
    const c = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    const at = (lx, ly) => ({ x: p.x + lx * c - ly * sn, y: p.y + lx * sn + ly * c });
    this.squirrel.hands = [at(-16, 12), at(17, 12)];
  }

  /** Gentle idle loop of the final pose while the dialog / end card is up. */
  updateTriumph() {
    const s = this.squirrel;
    const p = this.peanut;
    if (s.pose !== 'stand') return;
    const hop = Math.max(0, Math.sin(this.time * 5));
    s.y = G - hop * 4;
    p.x = s.x + 4;
    p.y = s.y - CATCH.holdHeight - hop * 2;
    p.rot = Math.sin(this.time * 9) * 0.12;
    this.holdPeanut();
  }

  finishCatch() {
    this.state = 'gameover';
    this.shake = { x: 0, y: 0 };
    this.updateTriumph();
    this.isNewHigh = this.score > this.highScore;
    if (this.isNewHigh) {
      this.highScore = this.score;
      saveHigh(this.highScoreKey, this.highScore);
    }
    this.sfx.play(this.isNewHigh ? 'highscore' : 'gameover');
    this.showDialog();
    this.callback('onGameOver', this.score, this.highScore);
  }

  callback(name, ...args) {
    const fn = this.options[name];
    if (typeof fn !== 'function') return;
    try {
      fn(...args);
    } catch (err) {
      console.error(`[peanut-run] ${name} callback threw`, err);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Dialog / end card                                                 */
  /* ---------------------------------------------------------------- */

  showLayer(layer) {
    layer.hidden = false;
    layer.classList.remove('is-visible');
    void layer.offsetWidth; // restart the fade-in transition
    layer.classList.add('is-visible');
    this.uiShownAt = performance.now();
    this.suppressKeyClick = false;
  }

  hideLayers() {
    const { ui } = this;
    for (const layer of [ui.hintLayer, ui.pausedLayer, ui.dialogLayer, ui.endLayer]) {
      layer.hidden = true;
      layer.classList.remove('is-visible');
    }
  }

  showDialog() {
    const { ui } = this;
    ui.score.textContent = String(this.score);
    ui.newHigh.hidden = !this.isNewHigh;
    ui.best.textContent = String(this.highScore);
    this.showLayer(ui.dialogLayer);
    try {
      ui.yes.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
  }

  chooseYes() {
    if (this.state !== 'gameover') return;
    this.restart();
  }

  chooseNo() {
    if (this.state !== 'gameover') return;
    const { ui } = this;
    ui.dialogLayer.hidden = true;
    ui.dialogLayer.classList.remove('is-visible');
    this.state = 'exited';
    ui.endScore.textContent = this.strings.finalScore ? this.strings.finalScore(this.score) : `Final score: ${this.score}`;
    this.showLayer(ui.endLayer);
    try {
      ui.play.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
    this.callback('onExit', this.score);
  }

  /* ---------------------------------------------------------------- */
  /* Particles                                                         */
  /* ---------------------------------------------------------------- */

  dust(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      this.particles.push({
        x: x + (Math.random() * 2 - 1) * 8,
        y: y - 2,
        vx: (Math.random() * 2 - 1) * 70,
        vy: -20 - Math.random() * 50,
        life: 0.35 + Math.random() * 0.25,
        age: 0,
        r: 2 + Math.random() * 3,
      });
    }
  }

  updateParticles(dt) {
    for (const q of this.particles) {
      q.age += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 120 * dt;
    }
    this.particles = this.particles.filter((q) => q.age < q.life);
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  render() {
    if (this.destroyed) return;
    const { ctx } = this;
    const { offsetY, viewH } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    // Solid backdrop over the whole visible area so the screen shake never reveals an
    // empty canvas edge; it also paints the extra sky above and earth below the band.
    ctx.fillStyle = PALETTE.skyTop;
    ctx.fillRect(0, 0, W, offsetY + G);
    ctx.fillStyle = PALETTE.earthDark;
    ctx.fillRect(0, offsetY + G, W, viewH - offsetY - G);
    ctx.save();
    ctx.translate(0, offsetY);
    if (viewH > H) {
      // Nothing drawn below the band (the sun glow reaches y = 358); above it the art may
      // spill into the extra sky (glow, falling leaves), which keeps the top seamless.
      // The bottom edge is floored to a whole device pixel so no half-covered row shows.
      const bottom = Math.floor((offsetY + H) * this.scale) / this.scale - offsetY;
      ctx.beginPath();
      ctx.rect(0, -offsetY, W, offsetY + bottom);
      ctx.clip();
    }
    ctx.translate(this.shake.x, this.shake.y);
    this.background.draw(ctx);

    this.background.drawFloatingLeaves(ctx);
    for (const o of this.obstacles) o.draw(ctx);

    const t = this.time;
    this.drawShadow(ctx, this.squirrel.x + 4, G - this.squirrel.y, 30);
    if (this.squirrel.pose !== 'stand') {
      this.drawShadow(ctx, this.peanut.x, G - (this.peanut.y + PEANUT.feetOffset), 20);
    }
    // While pinning, the squirrel is drawn on top of the peanut lying on the ground.
    const pinning = this.state === 'caught' && this.catchT >= CATCH.pounceEnd && this.squirrel.pose !== 'stand';
    if (pinning) {
      this.peanut.draw(ctx, t);
      this.squirrel.draw(ctx, t);
    } else {
      this.squirrel.draw(ctx, t);
      this.peanut.draw(ctx, t);
    }
    this.squirrel.drawOverlay(ctx, t);

    if (this.state === 'caught' && this.peanut.mood === 'dizzy') this.peanut.drawDizzy(ctx, t);
    if (this.state === 'caught' && this.impact && this.catchT < 0.25) this.drawImpact(ctx);
    if (this.squirrel.pose === 'stand' && (this.state === 'gameover' || this.state === 'exited' || this.catchT > 1.3)) {
      this.drawSparkles(ctx);
    }
    this.drawParticles(ctx);
    ctx.restore();

    // Vignette and HUD relative to the visible canvas, not the world band:
    // the vignette is stretched over the full visible height (a no-op when viewH === H).
    ctx.save();
    ctx.scale(1, viewH / H);
    this.background.drawVignette(ctx);
    ctx.restore();
    this.drawHud(ctx);
  }

  /** Soft contact shadow that shrinks and fades as the character leaves the ground. */
  drawShadow(ctx, x, height, radius) {
    const k = 1 - clamp01(height / 150);
    if (k <= 0) return;
    ctx.fillStyle = `rgba(12, 6, 36, ${0.34 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, G + 3, radius * (0.55 + 0.45 * k), 4.5 * (0.6 + 0.4 * k), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawImpact(ctx) {
    const k = this.catchT / 0.25;
    const { x, y } = this.impact;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#fff1b8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const r0 = 8 + k * 10;
      const r1 = 16 + k * 16;
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    ctx.stroke();
    drawStar(ctx, 0, 0, 9 * (1 - k * 0.5), k * 2, PALETTE.star);
    ctx.restore();
  }

  drawSparkles(ctx) {
    const s = this.squirrel;
    const cx = s.x + 4;
    const cy = s.y - CATCH.holdHeight;
    const spots = [
      [-38, -10],
      [36, -24],
      [42, 14],
      [-30, 26],
    ];
    spots.forEach(([dx, dy], i) => {
      const tw = (Math.sin(this.time * 6 + i * 1.7) + 1) / 2;
      if (tw < 0.15) return;
      drawStar(ctx, cx + dx, cy + dy, 2.5 + tw * 3.5, this.time + i, i % 2 ? '#fff2a8' : PALETTE.star);
    });
  }

  drawParticles(ctx) {
    for (const q of this.particles) {
      ctx.globalAlpha = 0.5 * (1 - q.age / q.life);
      ctx.fillStyle = PALETTE.dust;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawHud(ctx) {
    const score = String(this.score);
    const hi = `${(this.strings.best || 'Best').toUpperCase()} ${this.highScore}`;
    ctx.save();
    ctx.textBaseline = 'middle';
    const family = 'Inter, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif';
    const bigFont = `700 21px ${family}`;
    const smallFont = `600 11px ${family}`;
    ctx.font = bigFont;
    const sw = ctx.measureText(score).width;
    ctx.font = smallFont;
    const hw = ctx.measureText(hi).width;
    const padX = 14;
    const gapX = 12;
    const boxW = padX * 2 + sw + gapX + hw;
    const boxH = 34;
    const bx = W - 14 - boxW;
    const by = 12;
    // Frosted dark pill.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.strokeStyle = PALETTE.hudBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, boxW, boxH, 17);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    ctx.font = smallFont;
    ctx.fillStyle = PALETTE.hudSoft;
    ctx.textAlign = 'left';
    ctx.fillText(hi, bx + padX, by + boxH / 2 + 1);

    const pulse = this.pulse > 0 ? Math.sin((this.pulse / SCORE.pulseDuration) * Math.PI) : 0;
    ctx.save();
    ctx.translate(bx + boxW - padX - sw / 2, by + boxH / 2 + 1);
    ctx.scale(1 + pulse * 0.3, 1 + pulse * 0.3);
    ctx.font = bigFont;
    ctx.textAlign = 'center';
    ctx.fillStyle = pulse > 0 ? PALETTE.hudPulse : PALETTE.hud;
    ctx.fillText(score, 0, 0);
    ctx.restore();
    ctx.restore();
  }
}
