/**
 * Sound effects, synthesised with the Web Audio API (no audio files).
 *
 * The AudioContext is created lazily by unlock(), which must be called from a
 * user gesture (key press, tap, click) because browsers block audio before one.
 * One Sfx instance per game; nothing is shared between instances.
 */

function loadMuted(key) {
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch (_) {
    return false;
  }
}

function saveMuted(key, muted) {
  if (!key) return;
  try {
    window.localStorage.setItem(key, muted ? '1' : '0');
  } catch (_) {
    /* storage may be unavailable */
  }
}

export class Sfx {
  /**
   * @param {object} [p]
   * @param {boolean} [p.enabled=true]  false turns sound off entirely (no AudioContext is ever created)
   * @param {string|null} [p.storageKey] localStorage key for the mute preference; null disables persistence
   * @param {number} [p.volume=0.5]     master volume, 0..1
   */
  constructor({ enabled = true, storageKey = null, volume = 0.5 } = {}) {
    const Ctor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    this.Ctor = Ctor || null;
    this.enabled = enabled && !!Ctor;
    this.storageKey = storageKey;
    this.volume = volume;
    this.muted = loadMuted(storageKey);
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.suspended = false;
  }

  /** Create / resume the AudioContext. Call from a user gesture. */
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        this.ctx = new this.Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.ctx.destination);
        // One second of white noise, reused by every noisy effect.
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, len);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      }
      if (!this.suspended && this.ctx.state === 'suspended') this.ctx.resume();
    } catch (_) {
      this.enabled = false;
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    saveMuted(this.storageKey, this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  /** Silence everything while the game is paused. */
  suspend() {
    this.suspended = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    this.suspended = false;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  destroy() {
    this.enabled = false;
    if (this.ctx) {
      try {
        this.ctx.close().catch(() => {});
      } catch (_) {
        /* already closed */
      }
    }
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  /**
   * @param {'start'|'jump'|'land'|'milestone'|'hit'|'pounce'|'grab'|'gameover'|'highscore'|'click'} name
   */
  play(name) {
    // A context that is still resuming after unlock() accepts scheduled sounds; a paused one must not.
    if (!this.enabled || this.muted || !this.ctx || this.suspended || this.ctx.state === 'closed') return;
    const fn = SOUNDS[name];
    if (!fn) return;
    try {
      fn(this, this.ctx.currentTime + 0.005);
    } catch (_) {
      /* a failed sound must never break the game */
    }
  }

  /* ---- building blocks ---- */

  /** A single oscillator note with an optional pitch glide and a fast attack / exponential release. */
  tone({ t, type = 'sine', from, to = from, dur, gain = 0.2, attack = 0.005 }) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A filtered burst of noise with an optional filter sweep. */
  burst({ t, dur, gain = 0.2, filter = 'lowpass', from, to = from, q = 1, attack = 0.005 }) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

const SOUNDS = {
  // Quick rising arpeggio when the run begins.
  start(s, t) {
    [523, 659, 784].forEach((f, i) => s.tone({ t: t + i * 0.06, type: 'triangle', from: f, dur: 0.12, gain: 0.16 }));
  },
  // Springy upward blip.
  jump(s, t) {
    s.tone({ t, type: 'triangle', from: 380, to: 820, dur: 0.14, gain: 0.2 });
    s.tone({ t, type: 'sine', from: 760, to: 1500, dur: 0.1, gain: 0.05 });
  },
  // Soft thud on landing.
  land(s, t) {
    s.tone({ t, type: 'sine', from: 150, to: 70, dur: 0.08, gain: 0.16 });
    s.burst({ t, dur: 0.05, gain: 0.05, from: 900 });
  },
  // Two-note chime every 100 points.
  milestone(s, t) {
    s.tone({ t, type: 'sine', from: 988, dur: 0.1, gain: 0.14 });
    s.tone({ t: t + 0.08, type: 'sine', from: 1319, dur: 0.22, gain: 0.14 });
  },
  // Crash into an obstacle: thump, crunch and a falling "bonk".
  hit(s, t) {
    s.burst({ t, dur: 0.22, gain: 0.34, from: 1800, to: 200 });
    s.tone({ t, type: 'sine', from: 180, to: 45, dur: 0.25, gain: 0.34 });
    s.tone({ t: t + 0.02, type: 'square', from: 320, to: 90, dur: 0.22, gain: 0.07 });
  },
  // Whoosh of the squirrel's leap.
  pounce(s, t) {
    s.burst({ t, dur: 0.42, gain: 0.2, filter: 'bandpass', from: 350, to: 2400, q: 1.4, attack: 0.18 });
  },
  // Landing on the peanut, then a happy squirrel chitter.
  grab(s, t) {
    s.tone({ t, type: 'sine', from: 130, to: 60, dur: 0.1, gain: 0.24 });
    s.burst({ t, dur: 0.07, gain: 0.08, from: 1200 });
    for (let i = 0; i < 4; i += 1) {
      const f = 1900 + (i % 2) * 500;
      s.tone({ t: t + 0.14 + i * 0.055, type: 'square', from: f, to: f * 0.8, dur: 0.035, gain: 0.05, attack: 0.002 });
    }
  },
  // Gentle descending "aww".
  gameover(s, t) {
    [392, 330, 262].forEach((f, i) =>
      s.tone({ t: t + i * 0.16, type: 'triangle', from: f, to: f * 0.97, dur: i === 2 ? 0.5 : 0.2, gain: 0.17 }),
    );
  },
  // Fanfare for a new best score.
  highscore(s, t) {
    [523, 659, 784, 1047].forEach((f, i) =>
      s.tone({ t: t + i * 0.1, type: 'triangle', from: f, dur: i === 3 ? 0.5 : 0.14, gain: 0.17 }),
    );
    s.tone({ t: t + 0.3, type: 'sine', from: 2093, dur: 0.5, gain: 0.05 });
  },
  // Button press.
  click(s, t) {
    s.tone({ t, type: 'sine', from: 720, to: 540, dur: 0.06, gain: 0.14, attack: 0.002 });
  },
};
