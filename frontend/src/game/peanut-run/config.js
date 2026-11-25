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
  pebble: '#7A5F45',
  button: { w: 26, h: 34, insetX: 5, insetTop: 5 }, // small mushroom used in clusters
});

export const SINGLE_KINDS = Object.freeze(['rock', 'mushroom', 'stump', 'log']);
export const CLUSTER_KINDS = Object.freeze(['pebble', 'button']);

export const PALETTE = deepFreeze({
  skyTop: '#F6DDB6',
  skyMid: '#FBE8CF',
  skyBottom: '#FEF3E2',
  sun: '#FFF7E8',
  cloud: '#FFFFFF',
  hillFar: '#EFE2CC',
  hillNear: '#E9C48A',
  haze: 'rgba(244, 174, 82, 0.25)',
  treeTrunk: '#8A5A2B',
  treeCanopies: ['#F4AE52', '#D4621A', '#E9953A', '#F7C778', '#C9541A'],
  groundTop: '#8A5A2B',
  groundTopLight: '#F4AE52',
  earth: '#6B4A2E',
  earthDark: '#4A2F1B',
  pebble: '#C9B59A',
  leaves: ['#F4AE52', '#D4621A', '#E9C48A', '#F7C778'],
  peanutLight: '#F3D9A8',
  peanut: '#E9C48A',
  peanutDark: '#C9924E',
  peanutLine: '#8A5A2B',
  shoe: '#4A2F1B',
  furLight: '#8A5A2B',
  fur: '#6B4322',
  furDark: '#4A2F1B',
  belly: '#F3E0C4',
  tail: '#7A4E22',
  tailTip: '#A68A6D',
  eye: '#2A1A0E',
  rock: '#A68A6D',
  rockLight: '#C4AE93',
  rockDark: '#7A5F45',
  moss: '#A8A05A',
  capRed: '#D4621A',
  capRedDark: '#A84A12',
  spot: '#FEF3E2',
  stem: '#F3E0C4',
  stemDark: '#D9C4A0',
  bark: '#8A5A2B',
  barkDark: '#5E3B1C',
  woodRing: '#E9C48A',
  woodRingDark: '#C9924E',
  hud: '#4A2F1B',
  skyLow: '#F7C778',
  grassTuft: '#C9924E',
  dust: '#F3E0C4',
  hudPanel: 'rgba(255, 255, 255, 0.62)',
  hudBorder: 'rgba(74, 47, 27, 0.16)',
  hudPulse: '#983F0F',
  hudSoft: 'rgba(74, 47, 27, 0.8)',
  star: '#F4AE52',
  sweat: '#9FC5E8',
});
