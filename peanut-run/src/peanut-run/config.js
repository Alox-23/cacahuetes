/**
 * Peanut Run — all tunable constants in one place.
 * Everything here is frozen: the module holds no mutable state.
 * Units are logical world units (the world is 800 x 300) and seconds.
 */

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => {
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(o);
};

export const WORLD = deepFreeze({
  width: 800,
  height: 300,
  groundY: 240,
});

export const PHYSICS = deepFreeze({
  gravity: 2600, // u/s^2
  jumpVelocity: -820, // u/s, full jump (peak ~129 u, ~0.63 s in the air)
  jumpCutVelocity: -300, // upward speed is capped to this when the button is released early
  minJumpTime: 0.06, // s, the cut only applies after this long, so even an instant tap is a usable hop
  jumpBuffer: 0.1, // s, a press this long before landing still jumps
  coyoteTime: 0.08, // s, a press this long after running off the ground still jumps
  maxDt: 1 / 30, // s, frame delta clamp (no tunnelling after long frames)
});

export const SPEED = deepFreeze({
  start: 330, // u/s
  max: 760, // u/s
  rampSeconds: 90, // time to reach max speed
});

export const SPAWN = deepFreeze({
  firstDelay: 1.5, // s after start before the first obstacle enters the screen
  reactionTime: 0.2, // s of travel added to every gap
  extraMax: 0.9, // s of travel, random extra gap in [0, extraMax]
  safety: 30, // u, added to the hard minimum gap
  clusterFromSpeed: 470, // u/s, cluster obstacles start appearing above this speed
  clusterChance: 0.3,
  spawnX: 820, // u, obstacles enter just off the right edge
});

export const PEANUT = deepFreeze({
  x: 170,
  // Local body metrics (origin = body centre between the two lobes).
  feetOffset: 36, // feet are this far below the body centre
  lyingOffset: 18, // body centre height when lying on its side
  // Hitbox relative to body centre, inset ~20-25% from the drawn outline (36 x 66).
  hitbox: deepFreeze({ left: -13, right: 13, top: -24, bottom: 30 }),
});

export const SQUIRREL = deepFreeze({
  x: 62,
  gravity: 2600,
  runCycle: 2.6, // strides per second at start speed (scaled with speed)
});

export const CATCH = deepFreeze({
  impactEnd: 0.3,
  sprintEnd: 0.55,
  pounceEnd: 1.0,
  total: 1.55,
  shakeAmplitude: 6,
  bounceVx: -75,
  bounceVy: -380,
  leapHeight: 70,
  pinOffset: 38, // squirrel lands this far behind the peanut's centre, paws on its head
  holdHeight: 106, // peanut centre height above the ground when held overhead
});

export const SCORE = deepFreeze({
  unitsPerPoint: 10,
  pulseEvery: 100,
  pulseDuration: 0.4,
});

export const DIALOG = deepFreeze({
  inputGuardMs: 400,
});

/**
 * Obstacle kinds. w/h are the drawn size, inset shrinks the hitbox (x on each side, top).
 */
export const OBSTACLE_KINDS = deepFreeze({
  rock: { w: 38, h: 28, insetX: 5, insetTop: 5 },
  mushroom: { w: 38, h: 56, insetX: 7, insetTop: 6 },
  stump: { w: 46, h: 46, insetX: 4, insetTop: 4 },
  log: { w: 92, h: 32, insetX: 6, insetTop: 5 },
  pebble: '#44367f',
  button: { w: 26, h: 34, insetX: 5, insetTop: 5 }, // small mushroom used in clusters
});

export const SINGLE_KINDS = Object.freeze(['rock', 'mushroom', 'stump', 'log']);
export const CLUSTER_KINDS = Object.freeze(['pebble', 'button']);

export const PALETTE = deepFreeze({
  skyTop: '#353a94',
  skyMid: '#8a6fd0',
  skyBottom: '#ffcf9e',
  sun: '#fff3d0',
  cloud: '#ffe9f0',
  hillFar: '#9d86dc',
  hillNear: '#6f5bbd',
  haze: 'rgba(255, 176, 160, 0.38)',
  treeTrunk: '#43306f',
  treeCanopies: ['#ff8a3d', '#ff5f6d', '#ffc24b', '#f2709c', '#ffa54b'],
  groundTop: '#3a2c78',
  groundTopLight: '#ffd27d',
  earth: '#2a1f55',
  earthDark: '#170f33',
  pebble: '#a89a8a',
  leaves: ['#ff8a3d', '#ff5f6d', '#ffc24b', '#f2709c'],
  peanutLight: '#f3d095',
  peanut: '#d8a15e',
  peanutDark: '#a86f36',
  peanutLine: '#6e4320',
  shoe: '#4a2c1a',
  furLight: '#e08a4a',
  fur: '#c4622d',
  furDark: '#8e3f1a',
  belly: '#f6dfba',
  tail: '#d0743a',
  tailTip: '#f0b47a',
  eye: '#2a1a12',
  rock: '#8f8d96',
  rockLight: '#b4b2ba',
  rockDark: '#66646d',
  moss: '#7d9a3a',
  capRed: '#d23b2a',
  capRedDark: '#9d2619',
  spot: '#fff4e2',
  stem: '#f1e3c6',
  stemDark: '#cdb88f',
  bark: '#7b4f2e',
  barkDark: '#55341c',
  woodRing: '#d9b07a',
  woodRingDark: '#b18555',
  hud: '#ffffff',
  skyLow: '#f48fa6',
  grassTuft: '#56449f',
  dust: '#e9dcff',
  hudPanel: 'rgba(20, 13, 48, 0.5)',
  hudBorder: 'rgba(255, 255, 255, 0.2)',
  hudPulse: '#ffc24b',
  hudSoft: 'rgba(255, 255, 255, 0.62)',
  star: '#ffd23f',
  sweat: '#7cc6f0',
});
