/**
 * Peanut (player), Squirrel (chaser) and Obstacle: state, update helpers and
 * procedural drawing. Positions are in logical world units.
 */
import { WORLD, PHYSICS, PEANUT, SQUIRREL, CATCH, OBSTACLE_KINDS, PALETTE as P } from './config.js';

const G = WORLD.groundY;
const TAU = Math.PI * 2;

const lerp = (a, b, t) => a + (b - a) * t;

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

/** Five-point star, used for dizzy stars and sparkles. */
export function drawStar(ctx, x, y, r, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(120, 70, 10, 0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * TAU - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Peanut                                                              */
/* ------------------------------------------------------------------ */

function peanutShellPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.bezierCurveTo(9, -30, 15, -23, 15, -15);
  ctx.bezierCurveTo(15, -8, 10, -6, 10, -1);
  ctx.bezierCurveTo(10, 3, 18, 4, 18, 11);
  ctx.bezierCurveTo(18, 20, 10, 26, 0, 26);
  ctx.bezierCurveTo(-10, 26, -18, 20, -18, 11);
  ctx.bezierCurveTo(-18, 4, -10, 3, -10, -1);
  ctx.bezierCurveTo(-10, -6, -15, -8, -15, -15);
  ctx.bezierCurveTo(-15, -23, -9, -30, 0, -30);
  ctx.closePath();
}

export class Peanut {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = PEANUT.x;
    this.y = G - PEANUT.feetOffset; // body centre
    this.vx = 0;
    this.vy = 0;
    this.rot = 0;
    this.spin = 0;
    this.onGround = true;
    this.coyote = 0;
    this.airTime = 0;
    this.phase = 0;
    this.legs = 'stand'; // stand | run | tuck | kick | limp
    this.mood = 'calm'; // calm | worried | dizzy | scared
    this.arms = 'rest'; // rest | swing | flail
  }

  get feetY() {
    return this.y + PEANUT.feetOffset;
  }

  hitbox() {
    const h = PEANUT.hitbox;
    return { l: this.x + h.left, r: this.x + h.right, t: this.y + h.top, b: this.y + h.bottom };
  }

  canJump() {
    return this.onGround || this.coyote > 0;
  }

  jump() {
    this.vy = PHYSICS.jumpVelocity;
    this.onGround = false;
    this.coyote = 0;
    this.airTime = 0;
  }

  /** Idle bob in the ready state. */
  updateIdle(dt, time) {
    this.y = G - PEANUT.feetOffset - Math.abs(Math.sin(time * 3)) * 2;
    this.rot = Math.sin(time * 1.5) * 0.03;
    this.legs = 'stand';
    this.arms = 'rest';
    this.mood = 'calm';
  }

  /** Running physics. `held` = jump button currently held (variable jump height). */
  updateRun(dt, speed, held) {
    if (!this.onGround) this.airTime += dt;
    if (!held && this.vy < PHYSICS.jumpCutVelocity && this.airTime >= PHYSICS.minJumpTime) {
      this.vy = PHYSICS.jumpCutVelocity;
    }
    if (!this.onGround) {
      this.vy += PHYSICS.gravity * dt;
      this.y += this.vy * dt;
      const floor = G - PEANUT.feetOffset;
      if (this.y >= floor) {
        this.y = floor;
        this.vy = 0;
        this.onGround = true;
      }
    }
    if (this.onGround) this.coyote = PHYSICS.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    this.phase += dt * (speed / 330) * 9.5;
    if (this.onGround) {
      this.legs = 'run';
      this.arms = 'swing';
      this.rot = Math.sin(this.phase * 2) * 0.04;
    } else {
      this.legs = 'tuck';
      this.arms = 'flail';
      this.rot = lerp(this.rot, 0.18, Math.min(1, dt * 10));
    }
    this.mood = 'worried';
  }

  /** Bounce back off the obstacle and tumble onto the ground (state `caught`). */
  startTumble() {
    this.vx = CATCH.bounceVx;
    this.vy = Math.min(this.vy, 0) + CATCH.bounceVy;
    this.onGround = false;
    this.spin = -5.5;
    this.legs = 'limp';
    this.arms = 'flail';
    this.mood = 'dizzy';
  }

  updateTumble(dt) {
    const target = -Math.PI / 2;
    const restOffset = lerp(PEANUT.feetOffset, PEANUT.lyingOffset, Math.min(1, Math.abs(this.rot / target)));
    const floor = G - restOffset;
    if (!this.onGround) {
      this.vy += PHYSICS.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot = Math.max(target, this.rot + this.spin * dt);
      if (this.y >= floor && this.vy > 0) {
        this.y = floor;
        if (this.vy > 260) {
          this.vy *= -0.3; // one small bounce
        } else {
          this.vy = 0;
          this.onGround = true;
        }
        this.vx *= 0.5;
      }
    } else {
      this.x += this.vx * dt;
      this.vx *= Math.max(0, 1 - dt * 10);
      this.rot = lerp(this.rot, target, Math.min(1, dt * 14));
      this.y = G - PEANUT.lyingOffset - (1 - Math.abs(this.rot / target)) * (PEANUT.feetOffset - PEANUT.lyingOffset);
    }
  }

  /** World position of the head (for dizzy stars), taking rotation into account. */
  headPos() {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return { x: this.x + 15 * s, y: this.y - 15 * c };
  }

  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    this.drawLegs(ctx, time);
    this.drawArm(ctx, time, -1);
    this.drawShell(ctx);
    this.drawFace(ctx, time);
    this.drawArm(ctx, time, 1);
    ctx.restore();
  }

  drawShell(ctx) {
    const g = ctx.createRadialGradient(-6, -14, 3, 0, 0, 34);
    g.addColorStop(0, P.peanutLight);
    g.addColorStop(0.55, P.peanut);
    g.addColorStop(1, P.peanutDark);
    peanutShellPath(ctx);
    ctx.fillStyle = g;
    ctx.fill();

    // Netted shell texture: crosshatch + little dimples, clipped to the shell.
    ctx.save();
    peanutShellPath(ctx);
    ctx.clip();
    ctx.strokeStyle = 'rgba(122, 74, 32, 0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = -60; k <= 60; k += 7) {
      ctx.moveTo(k - 30, -32);
      ctx.lineTo(k + 30, 28);
      ctx.moveTo(k + 30, -32);
      ctx.lineTo(k - 30, 28);
    }
    ctx.stroke();
    // Lengthwise ridges.
    ctx.strokeStyle = 'rgba(122, 74, 32, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, -28);
    ctx.quadraticCurveTo(-11, -14, -5, -2);
    ctx.quadraticCurveTo(-13, 10, -6, 24);
    ctx.moveTo(6, -28);
    ctx.quadraticCurveTo(11, -14, 5, -2);
    ctx.quadraticCurveTo(13, 10, 6, 24);
    ctx.stroke();
    // Waist shadow.
    ctx.fillStyle = 'rgba(110, 67, 32, 0.18)';
    ctx.fillRect(-20, -4, 40, 5);
    ctx.restore();

    peanutShellPath(ctx);
    ctx.strokeStyle = P.peanutLine;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  drawFace(ctx, time) {
    const ex1 = 2;
    const ex2 = 9.5;
    const ey = -17;
    ctx.lineCap = 'round';
    if (this.mood === 'dizzy') {
      // Spiral eyes.
      ctx.strokeStyle = P.eye;
      ctx.lineWidth = 1.3;
      for (const ex of [ex1, ex2]) {
        ctx.beginPath();
        for (let a = 0; a < TAU * 2; a += 0.3) {
          const r = 0.4 + a * 0.3;
          const aa = a + time * 10;
          ctx.lineTo(ex + Math.cos(aa) * r, ey + Math.sin(aa) * r);
        }
        ctx.stroke();
      }
      // Wobbly mouth.
      ctx.beginPath();
      ctx.moveTo(1, -8);
      ctx.quadraticCurveTo(4, -10, 6, -8);
      ctx.quadraticCurveTo(8, -6, 11, -8);
      ctx.stroke();
      return;
    }
    const scared = this.mood === 'scared';
    const big = scared ? 4.6 : 3.8;
    for (const ex of [ex1, ex2]) {
      ellipse(ctx, ex, ey, big * 0.85, big);
      ctx.fillStyle = '#fffdf7';
      ctx.fill();
      ctx.strokeStyle = P.peanutLine;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Worried peanut glances back at the squirrel; calm one looks ahead.
      const look = this.mood === 'worried' ? -1.1 : this.mood === 'calm' ? 0.9 : 0;
      const pr = scared ? 1.5 : 2.1;
      circle(ctx, ex + look, ey + 0.4, pr);
      ctx.fillStyle = P.eye;
      ctx.fill();
      circle(ctx, ex + look + 0.7, ey - 0.6, 0.7);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    // Eyebrows.
    ctx.strokeStyle = P.peanutLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (this.mood === 'calm') {
      ctx.moveTo(ex1 - 2.5, ey - 6);
      ctx.lineTo(ex1 + 2.5, ey - 6.3);
      ctx.moveTo(ex2 - 2.5, ey - 6.3);
      ctx.lineTo(ex2 + 2.5, ey - 6);
    } else {
      const lift = scared ? 1.5 : 0;
      ctx.moveTo(ex1 - 3, ey - 4.5 - lift);
      ctx.lineTo(ex1 + 2.5, ey - 7 - lift);
      ctx.moveTo(ex2 - 2.5, ey - 7 - lift);
      ctx.lineTo(ex2 + 3, ey - 4.5 - lift);
    }
    ctx.stroke();
    // Mouth.
    if (scared) {
      ellipse(ctx, 6, -7.5, 2.4, 3.2);
      ctx.fillStyle = '#5a2a14';
      ctx.fill();
    } else if (this.mood === 'worried') {
      ctx.beginPath();
      ctx.moveTo(2.5, -7.5);
      ctx.quadraticCurveTo(6, -10, 9.5, -7.5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(2.5, -9);
      ctx.quadraticCurveTo(6, -6, 9.5, -9);
      ctx.stroke();
    }
    // Sweat drop when worried or scared.
    if (this.mood !== 'calm') {
      const dy = scared ? Math.sin(time * 12) * 1.2 : (time * 14) % 6;
      ctx.fillStyle = P.sweat;
      ctx.beginPath();
      ctx.moveTo(-11, -26 + dy);
      ctx.quadraticCurveTo(-7, -20 + dy, -11, -18 + dy);
      ctx.quadraticCurveTo(-15, -20 + dy, -11, -26 + dy);
      ctx.fill();
    }
  }

  drawLegs(ctx, time) {
    const hips = [-6, 6];
    ctx.strokeStyle = P.peanutLine;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    hips.forEach((hx, i) => {
      const hy = 22;
      let kx;
      let ky;
      let fx;
      let fy;
      if (this.legs === 'run') {
        const a = this.phase + (i === 0 ? 0 : Math.PI);
        fx = hx + Math.sin(a) * 8;
        fy = 36 - Math.max(0, Math.cos(a)) * 6;
        kx = (hx + fx) / 2 + 2;
        ky = (hy + fy) / 2;
      } else if (this.legs === 'tuck') {
        kx = hx + 6;
        ky = 28;
        fx = hx + 1 + i * 2;
        fy = 33;
      } else if (this.legs === 'kick') {
        const a = time * 28 + i * Math.PI;
        fx = hx + Math.sin(a) * 6;
        fy = 35 + Math.cos(a) * 3;
        kx = (hx + fx) / 2 + Math.sin(a) * 2;
        ky = (hy + fy) / 2;
      } else if (this.legs === 'limp') {
        fx = hx * 1.8;
        fy = 35;
        kx = (hx + fx) / 2;
        ky = 29;
      } else {
        fx = hx;
        fy = 36;
        kx = hx;
        ky = 29;
      }
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(kx, ky, fx, fy);
      ctx.stroke();
      // Little shoe pointing forward.
      ellipse(ctx, fx + 2.5, fy - 0.5, 4.8, 2.9);
      ctx.fillStyle = P.shoe;
      ctx.fill();
    });
  }

  drawArm(ctx, time, side) {
    const sx = side * 10;
    const sy = -1;
    let hx;
    let hy;
    if (this.arms === 'swing') {
      const a = this.phase + (side > 0 ? Math.PI : 0);
      hx = sx + side * 3 + Math.sin(a) * 6;
      hy = sy + 8 - Math.abs(Math.cos(a)) * 2;
    } else if (this.arms === 'flail') {
      const a = time * 22 + (side > 0 ? 0 : 2);
      hx = sx + side * 7 + Math.cos(a) * 2;
      hy = sy - 10 + Math.sin(a) * 4;
    } else {
      hx = sx + side * 3;
      hy = sy + 8;
    }
    ctx.strokeStyle = P.peanutLine;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + side * 5, (sy + hy) / 2, hx, hy);
    ctx.stroke();
    circle(ctx, hx, hy, 2.4);
    ctx.fillStyle = '#fff6e6';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawDizzy(ctx, time) {
    const h = this.headPos();
    for (let i = 0; i < 3; i += 1) {
      const a = time * 5 + (i * TAU) / 3;
      drawStar(ctx, h.x + Math.cos(a) * 18, h.y - 10 + Math.sin(a) * 5, 4.5, a, P.star);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Squirrel                                                            */
/* ------------------------------------------------------------------ */

export class Squirrel {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = SQUIRREL.x; // centre of feet
    this.y = G; // feet y
    this.vy = 0;
    this.onGround = true;
    this.phase = 0;
    this.pose = 'idle'; // idle | run | leap | crouch | stand
    this.leapU = 0; // 0..1 progress through a leap (sets body tilt)
    this.armRaise = 0;
    this.hands = null; // explicit paw positions in stand pose (world coords)
    this.mood = 'eager'; // eager | surprised | happy
    this.squash = 0;
    this.exclaim = 0; // seconds of "!" bubble left
  }

  updateIdle(dt) {
    this.pose = 'idle';
    this.phase += dt * 0.8;
  }

  /**
   * Running behind the peanut. Hops scripted so the squirrel clears every
   * obstacle that scrolls under it.
   */
  updateRun(dt, speed, obstacles) {
    this.phase += dt * SQUIRREL.runCycle * (0.6 + 0.4 * (speed / 330));
    if (this.onGround) {
      for (const o of obstacles) {
        const centre = o.x + o.w / 2;
        const dist = centre - this.x;
        if (dist < 0) continue;
        const height = o.h + 18;
        let v0 = Math.sqrt(2 * SQUIRREL.gravity * height);
        // Air time must also cover obstacle width + squirrel body length.
        v0 = Math.max(v0, (SQUIRREL.gravity * (o.w + 70)) / (2 * speed));
        const air = (2 * v0) / SQUIRREL.gravity;
        if (dist <= (speed * air) / 2) {
          this.vy = -v0;
          this.onGround = false;
        }
        break; // only the nearest obstacle ahead matters
      }
    }
    this.fall(dt);
    this.pose = this.onGround ? 'run' : 'leap';
    if (!this.onGround) this.leapU = this.vy < 0 ? 0.25 : 0.75;
  }

  fall(dt) {
    if (this.onGround) return;
    this.vy += SQUIRREL.gravity * dt;
    this.y += this.vy * dt;
    if (this.y >= G) {
      this.y = G;
      this.vy = 0;
      this.onGround = true;
      this.squash = 0.12;
    }
  }

  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.squash > 0) {
      const k = this.squash / 0.12;
      ctx.scale(1 + 0.12 * k, 1 - 0.12 * k);
    }
    if (this.pose === 'stand') this.drawStanding(ctx, time);
    else this.drawOnFours(ctx, time);
    ctx.restore();
  }

  /** Things drawn in front of the peanut: paws holding it, the "!" bubble. */
  drawOverlay(ctx, time) {
    if (this.pose === 'stand' && this.hands) {
      for (const h of this.hands) {
        circle(ctx, h.x, h.y, 4.2);
        ctx.fillStyle = P.fur;
        ctx.fill();
        ctx.strokeStyle = P.furDark;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    if (this.exclaim > 0) {
      const bx = this.x + 22;
      const by = this.y - 84 - Math.sin(time * 20) * 1.5;
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = P.furDark;
      ctx.lineWidth = 2;
      ellipse(ctx, bx, by, 9, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d23b2a';
      ctx.fillRect(bx - 1.8, by - 8, 3.6, 10);
      circle(ctx, bx, by + 6, 2);
      ctx.fill();
    }
  }

  /** Big bushy S-shaped tail; origin at its base, swing = extra rotation. */
  drawTail(ctx, bx, by, swing, stretch = 1) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(swing);
    ctx.scale(stretch, 1);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-30, 2, -38, -36, -22, -50);
      ctx.bezierCurveTo(-12, -58, 4, -54, 6, -44);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path();
    ctx.strokeStyle = P.furDark;
    ctx.lineWidth = 25;
    ctx.stroke();
    path();
    ctx.strokeStyle = P.tail;
    ctx.lineWidth = 21;
    ctx.stroke();
    path();
    ctx.strokeStyle = P.tailTip;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Fluffy fur tufts along the outer edge.
    ctx.strokeStyle = P.furDark;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    const tufts = [
      [-30, -14, -36, -12],
      [-34, -28, -41, -29],
      [-30, -44, -35, -50],
      [-16, -58, -17, -64],
      [-2, -58, 2, -63],
    ];
    for (const [x1, y1, x2, y2] of tufts) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawHead(ctx, hx, hy, facingTilt) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(facingTilt);
    // Ear with a tuft.
    ctx.fillStyle = P.fur;
    ctx.strokeStyle = P.furDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.lineTo(-5, -22);
    ctx.lineTo(1, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e9a58a';
    ctx.beginPath();
    ctx.moveTo(-5.5, -10);
    ctx.lineTo(-4.8, -18);
    ctx.lineTo(-1.5, -11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.furDark;
    ctx.beginPath();
    ctx.moveTo(-5, -22);
    ctx.lineTo(-7, -26);
    ctx.moveTo(-5, -22);
    ctx.lineTo(-3, -26.5);
    ctx.stroke();
    // Skull + snout.
    circle(ctx, 0, 0, 12.5);
    ctx.fillStyle = P.fur;
    ctx.fill();
    ctx.stroke();
    ellipse(ctx, 10, 3, 8.5, 6.5, 0.1);
    ctx.fill();
    ctx.stroke();
    // Cream cheek.
    ellipse(ctx, 6, 6, 7, 4.8, 0.15);
    ctx.fillStyle = P.belly;
    ctx.fill();
    // Nose.
    ellipse(ctx, 18, 1.5, 2.8, 2.2);
    ctx.fillStyle = '#3b2016';
    ctx.fill();
    // Buck teeth.
    ctx.fillStyle = '#fffdf5';
    ctx.strokeStyle = P.furDark;
    ctx.lineWidth = 0.8;
    ctx.fillRect(13.5, 8, 3.4, 4);
    ctx.strokeRect(13.5, 8, 3.4, 4);
    // Whiskers.
    ctx.strokeStyle = 'rgba(60, 30, 15, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(15, 4);
    ctx.lineTo(24, 2);
    ctx.moveTo(15, 5);
    ctx.lineTo(23, 7);
    ctx.stroke();
    // Eye.
    if (this.mood === 'happy') {
      ctx.strokeStyle = P.eye;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(1, -2);
      ctx.quadraticCurveTo(4, -7, 7, -2);
      ctx.stroke();
      // Blush.
      ellipse(ctx, 4, 4, 3, 1.8);
      ctx.fillStyle = 'rgba(230, 110, 110, 0.45)';
      ctx.fill();
    } else {
      const r = this.mood === 'surprised' ? 4 : 3.3;
      ellipse(ctx, 4.5, -2.5, r * 0.85, r);
      ctx.fillStyle = P.eye;
      ctx.fill();
      circle(ctx, 5.5, -3.8, 1.1);
      ctx.fillStyle = '#fff';
      ctx.fill();
      // Determined brow.
      if (this.mood === 'eager') {
        ctx.strokeStyle = P.furDark;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0.5, -8);
        ctx.lineTo(8, -6.3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Side view on four legs: idle, run, crouch, leap. */
  drawOnFours(ctx, time) {
    let tilt = 0;
    let bob = 0;
    let front = { x: 15, y: 0 };
    let hind = { x: -9, y: 0 };
    let tailSwing = Math.sin(time * 2) * 0.08;
    let tailStretch = 1;
    let headTilt = 0;
    if (this.pose === 'run') {
      const a = this.phase * TAU;
      bob = -Math.abs(Math.sin(a)) * 5;
      tilt = Math.sin(a) * 0.1;
      front = { x: 15 + Math.cos(a) * 11, y: -Math.max(0, Math.sin(a)) * 7 };
      hind = { x: -9 - Math.cos(a) * 11, y: -Math.max(0, -Math.sin(a)) * 7 };
      tailSwing = Math.sin(a + 1) * 0.16 - 0.08;
    } else if (this.pose === 'leap') {
      tilt = lerp(-0.25, 0.25, this.leapU);
      front = { x: 30, y: -8 };
      hind = { x: -26, y: -6 };
      tailSwing = -0.35;
      tailStretch = 1.1;
      headTilt = tilt * 0.4;
    } else if (this.pose === 'crouch') {
      bob = 5;
      tilt = 0.12;
      front = { x: 18, y: 0 };
      hind = { x: -6, y: 0 };
      tailSwing = 0.15 + Math.sin(time * 30) * 0.06;
    } else {
      // idle: little sniff
      bob = Math.sin(time * 3) * 0.8;
      headTilt = Math.sin(time * 5) > 0.7 ? 0.08 : 0;
    }

    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(tilt);

    // Far legs (darker), drawn behind body.
    ctx.lineCap = 'round';
    ctx.strokeStyle = P.furDark;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(12, -16);
    ctx.lineTo(front.x - 4, front.y - 2 - bob);
    ctx.moveTo(-10, -16);
    ctx.lineTo(hind.x + 4, hind.y - 2 - bob);
    ctx.stroke();

    this.drawTail(ctx, -18, -24, tailSwing, tailStretch);

    // Body.
    const bg = ctx.createLinearGradient(0, -40, 0, -8);
    bg.addColorStop(0, P.furLight);
    bg.addColorStop(1, P.fur);
    ellipse(ctx, 1, -24, 23, 14.5, -0.08);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = P.furDark;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ellipse(ctx, 6, -15.5, 14, 6.5, -0.05);
    ctx.fillStyle = P.belly;
    ctx.fill();

    // Haunch + near hind leg.
    ellipse(ctx, -9, -20, 11, 10.5, 0.3);
    ctx.fillStyle = P.fur;
    ctx.fill();
    ctx.strokeStyle = P.furDark;
    ctx.stroke();
    ctx.strokeStyle = P.fur;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-9, -14);
    ctx.lineTo(hind.x, hind.y - 2 - bob);
    ctx.stroke();
    ellipse(ctx, hind.x + 3, hind.y - 1.5 - bob, 6, 2.8);
    ctx.fillStyle = P.furDark;
    ctx.fill();

    // Near front leg.
    ctx.strokeStyle = P.fur;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(15, -16);
    ctx.lineTo(front.x, front.y - 2 - bob);
    ctx.stroke();
    circle(ctx, front.x + 1, front.y - 2 - bob, 3.2);
    ctx.fillStyle = P.furDark;
    ctx.fill();

    this.drawHead(ctx, 21, -34, headTilt);
    ctx.restore();
  }

  /** Upright pose with arms raised (triumph). Hands come from `this.hands`. */
  drawStanding(ctx, time) {
    const swing = Math.sin(time * 6) * 0.18;
    this.drawTail(ctx, -9, -14, -0.25 + swing, 1);

    // Feet.
    ellipse(ctx, -5, -2.5, 8, 3.5);
    ctx.fillStyle = P.furDark;
    ctx.fill();
    ellipse(ctx, 10, -2.5, 8, 3.5);
    ctx.fill();
    // Haunch.
    ellipse(ctx, -3, -14, 11, 12);
    ctx.fillStyle = P.fur;
    ctx.fill();
    ctx.strokeStyle = P.furDark;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Body.
    const bg = ctx.createLinearGradient(-14, 0, 16, 0);
    bg.addColorStop(0, P.fur);
    bg.addColorStop(1, P.furLight);
    ellipse(ctx, 3, -30, 14.5, 20);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.stroke();
    ellipse(ctx, 7, -28, 8.5, 14);
    ctx.fillStyle = P.belly;
    ctx.fill();

    // Arms up to the paws (paws themselves drawn in drawOverlay, in front of the peanut).
    if (this.hands) {
      const shoulders = [
        { x: -6, y: -42 },
        { x: 13, y: -42 },
      ];
      ctx.strokeStyle = P.furDark;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      shoulders.forEach((s, i) => {
        const h = this.hands[i];
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(h.x - this.x, h.y - this.y);
        ctx.stroke();
      });
      ctx.strokeStyle = P.fur;
      ctx.lineWidth = 4.5;
      shoulders.forEach((s, i) => {
        const h = this.hands[i];
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(h.x - this.x, h.y - this.y);
        ctx.stroke();
      });
    }
    this.drawHead(ctx, 4, -55, -0.05);
  }
}

/* ------------------------------------------------------------------ */
/* Obstacles                                                           */
/* ------------------------------------------------------------------ */

export class Obstacle {
  /**
   * @param {Array<{kind: string, dx: number}>} parts one part, or several for a cluster
   * @param {number} x left edge
   */
  constructor(parts, x) {
    this.x = x;
    this.parts = parts.map((p) => ({ ...p, ...OBSTACLE_KINDS[p.kind] }));
    this.w = Math.max(...this.parts.map((p) => p.dx + p.w));
    this.h = Math.max(...this.parts.map((p) => p.h));
    this.seed = Math.random() * 1000;
  }

  get right() {
    return this.x + this.w;
  }

  hitboxes() {
    return this.parts.map((p) => ({
      l: this.x + p.dx + p.insetX,
      r: this.x + p.dx + p.w - p.insetX,
      t: G - p.h + p.insetTop,
      b: G,
    }));
  }

  draw(ctx) {
    for (const p of this.parts) {
      ctx.save();
      ctx.translate(Math.round((this.x + p.dx) * 2) / 2, G);
      // Soft contact shadow.
      ellipse(ctx, p.w / 2, 1, p.w / 2 + 3, 3.5);
      ctx.fillStyle = 'rgba(50, 30, 10, 0.28)';
      ctx.fill();
      DRAWERS[p.kind](ctx, p.w, p.h, this.seed);
      ctx.restore();
    }
  }
}

function drawRock(ctx, w, h) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-2, -h * 0.6, w * 0.2, -h, w * 0.5, -h);
  ctx.bezierCurveTo(w * 0.85, -h, w + 2, -h * 0.5, w, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -h, w, 0);
  g.addColorStop(0, P.rockLight);
  g.addColorStop(1, P.rockDark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#4e4c55';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Moss cap and a crack.
  ctx.fillStyle = P.moss;
  ctx.beginPath();
  ctx.moveTo(w * 0.22, -h * 0.82);
  ctx.quadraticCurveTo(w * 0.5, -h * 1.08, w * 0.78, -h * 0.84);
  ctx.quadraticCurveTo(w * 0.5, -h * 0.7, w * 0.22, -h * 0.82);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60, 58, 66, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.6, -h * 0.55);
  ctx.lineTo(w * 0.68, -h * 0.35);
  ctx.lineTo(w * 0.62, -h * 0.18);
  ctx.stroke();
}

function drawMushroomShape(ctx, w, h, capColor, capDark, spots) {
  const stemW = w * 0.38;
  const capH = h * 0.42;
  // Stem.
  ctx.beginPath();
  ctx.moveTo(w / 2 - stemW / 2 - 2, 0);
  ctx.quadraticCurveTo(w / 2 - stemW / 2 + 1, -h * 0.4, w / 2 - stemW / 2 + 1, -h + capH * 0.6);
  ctx.lineTo(w / 2 + stemW / 2 - 1, -h + capH * 0.6);
  ctx.quadraticCurveTo(w / 2 + stemW / 2 - 1, -h * 0.4, w / 2 + stemW / 2 + 2, 0);
  ctx.closePath();
  ctx.fillStyle = P.stem;
  ctx.fill();
  ctx.strokeStyle = P.stemDark;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Cap.
  ctx.beginPath();
  ctx.moveTo(0, -h + capH);
  ctx.bezierCurveTo(0, -h - capH * 0.2, w, -h - capH * 0.2, w, -h + capH);
  ctx.quadraticCurveTo(w / 2, -h + capH * 0.72, 0, -h + capH);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -h, 0, -h + capH);
  g.addColorStop(0, capColor);
  g.addColorStop(1, capDark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = capDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (spots) {
    ctx.fillStyle = P.spot;
    for (const [sx, sy, r] of [
      [0.3, 0.45, 0.09],
      [0.55, 0.22, 0.07],
      [0.75, 0.55, 0.08],
      [0.15, 0.78, 0.05],
      [0.5, 0.65, 0.05],
    ]) {
      circle(ctx, w * sx, -h + capH * sy, w * r);
      ctx.fill();
    }
  }
}

function drawMushroom(ctx, w, h) {
  drawMushroomShape(ctx, w, h, P.capRed, P.capRedDark, true);
  // A blade of grass at the foot.
  ctx.strokeStyle = P.groundTopLight;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, 0);
  ctx.lineTo(w * 0.1, -8);
  ctx.moveTo(w * 0.85, 0);
  ctx.lineTo(w * 0.92, -7);
  ctx.stroke();
}

function drawButton(ctx, w, h) {
  drawMushroomShape(ctx, w, h, '#c98a45', '#8f5a25', false);
}

function drawStump(ctx, w, h) {
  // Roots.
  ctx.fillStyle = P.barkDark;
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.quadraticCurveTo(2, -4, 4, -12);
  ctx.lineTo(w - 4, -12);
  ctx.quadraticCurveTo(w - 2, -4, w + 6, 0);
  ctx.closePath();
  ctx.fill();
  // Trunk.
  ctx.fillStyle = P.bark;
  ctx.fillRect(2, -h + 6, w - 4, h - 6);
  ctx.strokeStyle = P.barkDark;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(2, -h + 6, w - 4, h - 6);
  // Bark grooves.
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const gx of [0.25, 0.5, 0.72]) {
    ctx.moveTo(w * gx, -h + 12);
    ctx.quadraticCurveTo(w * gx + 2, -h * 0.5, w * gx - 1, -4);
  }
  ctx.stroke();
  // Cut top with rings.
  ellipse(ctx, w / 2, -h + 6, w / 2 - 1, 6);
  ctx.fillStyle = P.woodRing;
  ctx.fill();
  ctx.strokeStyle = P.barkDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = P.woodRingDark;
  ctx.lineWidth = 1;
  for (const k of [0.66, 0.38]) {
    ellipse(ctx, w / 2, -h + 6, (w / 2 - 1) * k, 6 * k);
    ctx.stroke();
  }
  // Small sprout.
  ctx.strokeStyle = P.moss;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.8, -h + 7);
  ctx.quadraticCurveTo(w * 0.85, -h - 2, w * 0.95, -h - 4);
  ctx.stroke();
  ellipse(ctx, w * 0.95, -h - 4, 3, 1.6, -0.5);
  ctx.fillStyle = P.moss;
  ctx.fill();
}

function drawLog(ctx, w, h) {
  const r = h / 2;
  // Body.
  ctx.beginPath();
  ctx.moveTo(r * 0.6, -h);
  ctx.lineTo(w - r * 0.6, -h);
  ctx.lineTo(w - r * 0.6, 0);
  ctx.lineTo(r * 0.6, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, '#946238');
  g.addColorStop(1, P.barkDark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = P.barkDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Bark streaks.
  ctx.strokeStyle = 'rgba(60, 35, 15, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(r, -h * 0.7);
  ctx.lineTo(w * 0.55, -h * 0.72);
  ctx.moveTo(w * 0.3, -h * 0.4);
  ctx.lineTo(w - r * 1.4, -h * 0.38);
  ctx.moveTo(r * 1.2, -h * 0.18);
  ctx.lineTo(w * 0.5, -h * 0.2);
  ctx.stroke();
  // Back end (left) cap.
  ellipse(ctx, r * 0.6, -r, r * 0.55, r);
  ctx.fillStyle = P.bark;
  ctx.fill();
  ctx.strokeStyle = P.barkDark;
  ctx.stroke();
  // Front end (right) cut face with rings.
  ellipse(ctx, w - r * 0.6, -r, r * 0.6, r);
  ctx.fillStyle = P.woodRing;
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = P.woodRingDark;
  ctx.lineWidth = 1;
  for (const k of [0.65, 0.35]) {
    ellipse(ctx, w - r * 0.6, -r, r * 0.6 * k, r * k);
    ctx.stroke();
  }
  // Moss + a leaf on top.
  ctx.fillStyle = P.moss;
  ellipse(ctx, w * 0.4, -h + 1, 9, 3);
  ctx.fill();
  ctx.fillStyle = P.leaves[0];
  ellipse(ctx, w * 0.62, -h, 5, 2.4, 0.3);
  ctx.fill();
}

function drawPebble(ctx, w, h) {
  drawRock(ctx, w, h);
}

const DRAWERS = Object.freeze({
  rock: drawRock,
  mushroom: drawMushroom,
  stump: drawStump,
  log: drawLog,
  pebble: drawPebble,
  button: drawButton,
});
