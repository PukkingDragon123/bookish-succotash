// Pooled particle system. Everything is a small axis-aligned rect so the whole
// effects layer stays inside the pixel-art look — no soft blurry sprites.
// Particles have a `z` height so sparks and debris can arc and land.

import { rnd } from './rng.js';
import { TAU, clamp } from './math.js';

const MAX = 1400;

export class Particles {
  constructor() {
    this.pool = new Array(MAX);
    for (let i = 0; i < MAX; i++) this.pool[i] = { alive: false };
    this.head = 0;
    this.texts = [];
    this.rings = [];
  }

  _get() {
    for (let i = 0; i < MAX; i++) {
      const idx = (this.head + i) % MAX;
      if (!this.pool[idx].alive) { this.head = (idx + 1) % MAX; return this.pool[idx]; }
    }
    // Pool exhausted: recycle the oldest slot.
    const p = this.pool[this.head];
    this.head = (this.head + 1) % MAX;
    return p;
  }

  spawn(o) {
    const p = this._get();
    p.alive = true;
    p.x = o.x; p.y = o.y; p.z = o.z || 0;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = p.maxLife = o.life || 0.5;
    p.size = o.size || 1;
    p.endSize = o.endSize == null ? p.size : o.endSize;
    p.colors = o.colors || [o.color || '#fff'];
    p.gravity = o.gravity || 0;
    p.drag = o.drag == null ? 1.6 : o.drag;
    p.additive = !!o.additive;
    p.bounce = o.bounce || 0;
    p.fade = o.fade == null ? true : o.fade;
    p.wobble = o.wobble || 0;
    p.phase = rnd(TAU);
    p.shrink = o.shrink !== false;
    p.layer = o.layer || 0;   // 0 = above ground, -1 = flat on the ground
    return p;
  }

  // --- effect recipes ------------------------------------------------------
  burst(x, y, n, o = {}) {
    const speed = o.speed || 60;
    for (let i = 0; i < n; i++) {
      const a = o.angle != null ? o.angle + rnd(-o.spread || -0.6, o.spread || 0.6) : rnd(TAU);
      const s = speed * rnd(0.35, 1);
      this.spawn({
        x, y, z: o.z || 2,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7,
        vz: o.vz != null ? rnd(0, o.vz) : rnd(10, 60),
        life: (o.life || 0.5) * rnd(0.6, 1.3),
        size: o.size || 1, endSize: o.endSize,
        colors: o.colors, color: o.color,
        gravity: o.gravity == null ? 220 : o.gravity,
        drag: o.drag, additive: o.additive, bounce: o.bounce,
      });
    }
  }

  sparks(x, y, n = 8, color = '#ffd97a') {
    this.burst(x, y, n, { colors: [color, '#fff3c4', '#ff9c4a'], speed: 120, life: 0.36, additive: true, vz: 70, size: 1 });
  }

  blood(x, y, n = 8, colors = ['#8e2a2a', '#c04141', '#5c1a1a']) {
    this.burst(x, y, n, { colors, speed: 70, life: 0.6, vz: 40, size: 1, gravity: 320, bounce: 0.2 });
  }

  woodChips(x, y, n = 8) {
    this.burst(x, y, n, { colors: ['#8a6234', '#a97c46', '#5f4224', '#c49a63'], speed: 80, life: 0.7, vz: 90, size: 1, gravity: 340, bounce: 0.35 });
  }

  rockChips(x, y, n = 8, colors = ['#7c8489', '#9aa3a8', '#5a6165']) {
    this.burst(x, y, n, { colors, speed: 85, life: 0.6, vz: 90, size: 1, gravity: 360, bounce: 0.4 });
  }

  smoke(x, y, n = 4, o = {}) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + rnd(-3, 3), y: y + rnd(-2, 2), z: o.z || 3,
        vx: rnd(-8, 8) + (o.vx || 0), vy: rnd(-6, 2) + (o.vy || 0), vz: rnd(12, 30),
        life: (o.life || 1.4) * rnd(0.7, 1.3),
        size: o.size || 2, endSize: (o.size || 2) + 2,
        colors: o.colors || ['#3a3d3c', '#4a4e4c', '#2a2d2c'],
        gravity: -8, drag: 1.1, shrink: false,
      });
    }
  }

  embers(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + rnd(-4, 4), y: y + rnd(-3, 3), z: rnd(0, 4),
        vx: rnd(-14, 14), vy: rnd(-10, 2), vz: rnd(24, 60),
        life: rnd(0.8, 2.0), size: 1,
        colors: ['#ff9a3c', '#ffd05a', '#ff5b2e'],
        gravity: -14, drag: 1.2, additive: true, wobble: rnd(8, 20),
      });
    }
  }

  dust(x, y, n = 5, color = '#6d7a5e') {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU);
      this.spawn({
        x, y, z: 1,
        vx: Math.cos(a) * rnd(10, 34), vy: Math.sin(a) * rnd(6, 20), vz: rnd(2, 12),
        life: rnd(0.3, 0.7), size: 1, colors: [color, '#8a9776'], gravity: 40, drag: 2.4,
      });
    }
  }

  leaves(x, y, n = 6, colors = ['#4b7a3a', '#3d6630', '#6d9146']) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + rnd(-6, 6), y: y + rnd(-6, 6), z: rnd(6, 22),
        vx: rnd(-18, 18), vy: rnd(-6, 12), vz: rnd(-4, 8),
        life: rnd(1.2, 2.6), size: 1, colors, gravity: 26, drag: 1.0, wobble: rnd(14, 30),
      });
    }
  }

  water(x, y, n = 8) {
    this.burst(x, y, n, { colors: ['#5fa8c4', '#8fd0e0', '#3c7f99'], speed: 70, life: 0.5, vz: 70, gravity: 300, size: 1 });
  }

  chipSpark(x, y) {
    this.burst(x, y, 10, { colors: ['#4de1ff', '#b8f5ff', '#2596c9'], speed: 90, life: 0.5, additive: true, vz: 60 });
  }

  scrap(x, y, n = 10) {
    this.burst(x, y, n, { colors: ['#9aa3a8', '#c9d2d6', '#5a6165', '#ffb14a'], speed: 110, life: 0.8, vz: 110, gravity: 380, bounce: 0.35 });
  }

  /** Expanding ring — shockwaves, scan pulses, spawn telegraphs. */
  ring(x, y, r0, r1, life, color, width = 1, additive = false) {
    this.rings.push({ x, y, r0, r1, life, maxLife: life, color, width, additive });
  }

  /** Floating combat text. */
  text(x, y, str, color = '#fff', o = {}) {
    this.texts.push({
      x, y, str, color,
      life: o.life || 0.9, maxLife: o.life || 0.9,
      vy: o.vy == null ? -26 : o.vy,
      vx: o.vx || 0,
      scale: o.scale || 1,
      shadow: o.shadow !== false,
    });
    if (this.texts.length > 60) this.texts.shift();
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      if (p.wobble) p.vx += Math.sin(p.phase + p.life * 6) * p.wobble * dt;
      p.vz -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        if (p.bounce > 0 && Math.abs(p.vz) > 12) { p.vz = -p.vz * p.bounce; p.vx *= 0.6; p.vy *= 0.6; }
        else { p.vz = 0; p.vx *= 0.85; p.vy *= 0.85; }
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.x += t.vx * dt;
      t.vy *= Math.exp(-2.2 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  draw(r, layer = 0) {
    const ctx = r.ctx;
    const ox = r.camera.ox, oy = r.camera.oy;
    let additiveOn = false;
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (!p.alive || p.layer !== layer) continue;
      const sx = Math.round(p.x - ox);
      const sy = Math.round(p.y - p.z - oy);
      if (sx < -8 || sy < -8 || sx > 488 || sy > 278) continue;
      const t = p.life / p.maxLife;
      const ci = clamp(Math.floor((1 - t) * p.colors.length), 0, p.colors.length - 1);
      // t runs 1 -> 0 over the lifetime, so this interpolates size -> endSize.
      const size = Math.max(1, Math.round(p.size + (p.endSize - p.size) * (1 - t)));
      if (p.additive !== additiveOn) {
        ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
        additiveOn = p.additive;
      }
      ctx.globalAlpha = p.fade ? clamp(t * 1.6, 0, 1) : 1;
      ctx.fillStyle = p.colors[ci];
      ctx.fillRect(sx, sy, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (layer === 0) {
      for (const rg of this.rings) {
        const t = 1 - rg.life / rg.maxLife;
        const rad = rg.r0 + (rg.r1 - rg.r0) * t;
        if (rg.additive) ctx.globalCompositeOperation = 'lighter';
        r.ring(rg.x, rg.y, rad, rg.color, rg.width, 1 - t);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  drawTexts(r, drawText) {
    for (const t of this.texts) {
      const a = clamp(t.life / t.maxLife * 1.8, 0, 1);
      const sx = t.x - r.camera.ox;
      const sy = t.y - r.camera.oy;
      drawText(r.ctx, t.str, sx, sy, t.color, { align: 'center', alpha: a, shadow: t.shadow, scale: t.scale });
    }
  }

  clear() {
    for (const p of this.pool) p.alive = false;
    this.texts.length = 0;
    this.rings.length = 0;
  }
}

export const particles = new Particles();
