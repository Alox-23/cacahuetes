/**
 * Parallax autumn-forest background: sky, sun, clouds, far and near hills,
 * tree line, ground strip with scrolling grass tufts, pebbles and fallen leaves,
 * plus a few leaves drifting through the air.
 *
 * Static scenery is generated from a deterministic hash of the tile index, so
 * the only per-instance state is the scroll offsets and the floating leaves.
 */
import { WORLD, PALETTE } from './config.js';

/** Deterministic pseudo-random number in [0, 1) for an integer index and a salt. */
export function hash(n, salt = 0) {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

const W = WORLD.width;
const G = WORLD.groundY;

export class Background {
  constructor() {
    this.offset = 0; // total world distance scrolled (u)
    this.cloudDrift = 0;
    this.leaves = [];
    for (let i = 0; i < 7; i += 1) this.leaves.push(this.makeLeaf(true));
  }

  makeLeaf(anywhere) {
    return {
      x: anywhere ? Math.random() * W : W + Math.random() * 120,
      y: anywhere ? Math.random() * (G - 20) : -10 - Math.random() * 80,
      vy: 18 + Math.random() * 22,
      sway: Math.random() * Math.PI * 2,
      spin: Math.random() * Math.PI * 2,
      size: 4 + Math.random() * 3,
      color: PALETTE.leaves[Math.floor(Math.random() * PALETTE.leaves.length)],
    };
  }

  reset() {
    this.offset = 0;
  }

  /** @param {number} dt seconds @param {number} speed world speed in u/s (0 when stopped) */
  update(dt, speed) {
    this.offset += speed * dt;
    this.cloudDrift += dt * 8;
    for (let i = 0; i < this.leaves.length; i += 1) {
      const l = this.leaves[i];
      l.sway += dt * 2.2;
      l.spin += dt * 3;
      l.y += l.vy * dt;
      l.x -= (speed * 0.6 + 25) * dt - Math.sin(l.sway) * 20 * dt;
      if (l.y > G + 10 || l.x < -20) this.leaves[i] = this.makeLeaf(false);
    }
  }

  draw(ctx) {
    this.drawSky(ctx);
    this.drawClouds(ctx);
    this.drawHills(ctx, 0.08, PALETTE.hillFar, 170, 22, 0.006, 1);
    this.drawTrees(ctx, 0.25, 0.62, 70, 3, true);
    this.drawHills(ctx, 0.18, PALETTE.hillNear, 205, 16, 0.011, 2);
    this.drawTrees(ctx, 0.45, 0.9, 95, 7, false);
    this.drawGround(ctx);
  }

  drawFloatingLeaves(ctx) {
    for (const l of this.leaves) drawLeaf(ctx, l.x, l.y, l.size, l.spin, l.color);
  }

  drawSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, G);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.42, PALETTE.skyMid);
    g.addColorStop(0.72, PALETTE.skyLow);
    g.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, G);
    // Big low sun with a wide soft glow.
    const sx = 590;
    const sy = 128;
    const glow = ctx.createRadialGradient(sx, sy, 20, sx, sy, 230);
    glow.addColorStop(0, 'rgba(255, 228, 186, 0.75)');
    glow.addColorStop(0.45, 'rgba(255, 170, 160, 0.22)');
    glow.addColorStop(1, 'rgba(255, 170, 160, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 230, sy - 230, 460, 460);
    const disc = ctx.createLinearGradient(0, sy - 44, 0, sy + 44);
    disc.addColorStop(0, PALETTE.sun);
    disc.addColorStop(1, '#ffc98f');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(sx, sy, 44, 0, Math.PI * 2);
    ctx.fill();
  }

  drawClouds(ctx) {
    const span = W + 240;
    const scroll = this.offset * 0.03 + this.cloudDrift;
    ctx.fillStyle = PALETTE.cloud;
    for (let i = 0; i < 4; i += 1) {
      const baseX = i * (span / 4) + hash(i, 3) * 80;
      const x = (((baseX - scroll) % span) + span) % span - 120;
      const y = 32 + hash(i, 4) * 60;
      const s = 0.7 + hash(i, 5) * 0.6;
      ctx.globalAlpha = 0.5;
      for (const [dx, dy, rx, ry] of [
        [0, 0, 34, 12],
        [-20, 3, 20, 9],
        [22, 2, 22, 9],
        [4, -9, 18, 12],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawHills(ctx, factor, color, baseY, amp, freq, salt) {
    const o = this.offset * factor;
    // Each ridge fades towards its base, which reads as mist between the layers.
    const hg = ctx.createLinearGradient(0, baseY - amp * 1.75, 0, G);
    hg.addColorStop(0, color);
    hg.addColorStop(1, PALETTE.haze.replace(/[\d.]+\)$/, '1)'));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(0, G);
    for (let x = 0; x <= W; x += 10) {
      const wx = x + o;
      const y =
        baseY -
        amp * Math.sin(wx * freq + salt) -
        amp * 0.5 * Math.sin(wx * freq * 2.3 + salt * 2) -
        amp * 0.25 * Math.sin(wx * freq * 5.1 + salt * 3);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, G);
    ctx.closePath();
    ctx.fill();
  }

  /** A row of round-canopy autumn trees on a tile grid. */
  drawTrees(ctx, factor, scale, tile, salt, hazy) {
    const o = this.offset * factor;
    const first = Math.floor(o / tile) - 1;
    const last = Math.floor((o + W) / tile) + 1;
    for (let i = first; i <= last; i += 1) {
      if (hash(i, salt) < 0.25) continue; // leave some clearings
      const x = i * tile - o + hash(i, salt + 1) * tile * 0.6;
      const h = (60 + hash(i, salt + 2) * 50) * scale;
      const r = (22 + hash(i, salt + 3) * 14) * scale;
      const color = PALETTE.treeCanopies[Math.floor(hash(i, salt + 4) * PALETTE.treeCanopies.length)];
      const baseY = G + (hazy ? -24 : 0);
      ctx.fillStyle = PALETTE.treeTrunk;
      ctx.fillRect(x - 3 * scale, baseY - h, 6 * scale, h);
      ctx.fillStyle = color;
      for (const [dx, dy, rr] of [
        [0, 0, 1],
        [-0.7, 0.4, 0.7],
        [0.7, 0.35, 0.72],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx * r, baseY - h + dy * r, rr * r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lighter highlight on the canopy.
      ctx.fillStyle = 'rgba(255, 240, 200, 0.28)';
      ctx.beginPath();
      ctx.arc(x - r * 0.25, baseY - h - r * 0.3, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hazy) {
      // Atmospheric haze pushes the far layer back.
      const hg = ctx.createLinearGradient(0, 110, 0, G);
      hg.addColorStop(0, 'rgba(255, 176, 160, 0)');
      hg.addColorStop(1, PALETTE.haze);
      ctx.fillStyle = hg;
      ctx.fillRect(0, 110, W, G - 110);
    }
  }

  /** Subtle darkening towards the corners; drawn over the whole scene. */
  drawVignette(ctx) {
    const H = WORLD.height;
    const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.55, W / 2, H * 0.45, W * 0.62);
    v.addColorStop(0, 'rgba(18, 10, 48, 0)');
    v.addColorStop(1, 'rgba(18, 10, 48, 0.3)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  drawGround(ctx) {
    const o = this.offset;
    // Earth.
    const eg = ctx.createLinearGradient(0, G, 0, WORLD.height);
    eg.addColorStop(0, PALETTE.earth);
    eg.addColorStop(1, PALETTE.earthDark);
    ctx.fillStyle = eg;
    ctx.fillRect(0, G, W, WORLD.height - G);
    // Grass band with a wavy top edge.
    ctx.fillStyle = PALETTE.groundTop;
    ctx.beginPath();
    ctx.moveTo(0, G + 12);
    for (let x = 0; x <= W; x += 8) {
      const wx = x + o;
      ctx.lineTo(x, G - 1 + Math.sin(wx * 0.09) * 1.2 + Math.sin(wx * 0.23) * 0.8);
    }
    ctx.lineTo(W, G + 12);
    ctx.closePath();
    ctx.fill();
    // Thin rim of sunlight along the top edge.
    ctx.fillStyle = PALETTE.groundTopLight;
    ctx.fillRect(0, G - 1, W, 2);

    // Scrolling details on a 40 u tile grid.
    const tile = 40;
    const first = Math.floor(o / tile) - 1;
    const last = Math.floor((o + W) / tile) + 1;
    for (let i = first; i <= last; i += 1) {
      const bx = i * tile - o;
      // Grass tufts on the band.
      if (hash(i, 11) < 0.7) {
        const tx = bx + hash(i, 12) * tile;
        ctx.strokeStyle = PALETTE.grassTuft;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx - 3, G + 1);
        ctx.lineTo(tx - 5, G - 6);
        ctx.moveTo(tx, G + 1);
        ctx.lineTo(tx, G - 8);
        ctx.moveTo(tx + 3, G + 1);
        ctx.lineTo(tx + 5, G - 5);
        ctx.stroke();
      }
      // Pebbles in the earth.
      if (hash(i, 13) < 0.5) {
        const px = bx + hash(i, 14) * tile;
        const py = G + 22 + hash(i, 15) * 32;
        ctx.fillStyle = PALETTE.pebble;
        ctx.beginPath();
        ctx.ellipse(px, py, 3 + hash(i, 16) * 3, 2 + hash(i, 17) * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fallen leaves lying on the grass band.
      if (hash(i, 18) < 0.55) {
        const lx = bx + hash(i, 19) * tile;
        const ly = G + 6 + hash(i, 20) * 8;
        const c = PALETTE.leaves[Math.floor(hash(i, 21) * PALETTE.leaves.length)];
        drawLeaf(ctx, lx, ly, 4 + hash(i, 22) * 2, hash(i, 23) * 6.28, c);
      }
      // Darker soil streaks.
      if (hash(i, 24) < 0.4) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(bx + hash(i, 25) * tile, G + 16 + hash(i, 26) * 40, 10 + hash(i, 27) * 14, 2);
      }
    }
  }
}

/** A small pointed autumn leaf with a centre vein. */
export function drawLeaf(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(0, -size * 0.9, size, 0);
  ctx.quadraticCurveTo(0, size * 0.9, -size, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90, 40, 15, 0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-size * 1.2, 0);
  ctx.lineTo(size * 0.8, 0);
  ctx.stroke();
  ctx.restore();
}
