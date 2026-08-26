// Insects and fish. Tiny, cheap, and everywhere — they are what makes the basin
// feel alive between firefights. Each is a handful of pixels with a fast wing
// loop; fireflies additionally emit light at dusk.

import { surface, ell, circ, rect, px, line, taper, tri, outline, getSheet } from './pixel.js';

import { TAU } from '../engine/math.js';

const BUGS = {
  firefly: { w: 7, h: 7, frames: 4, glow: '#c8ff6a', draw: (c, t) => {
    const flap = Math.sin(t * TAU) * 1.4;
    ell(c, 3.5, 4, 1.6, 1.1, '#2e2a1e');
    ell(c, 3.5, 3 + flap * 0.2, 1.2, 0.8, '#4a4230');
    ell(c, 3.5, 5, 1.2, 0.9, '#c8ff6a');
    line(c, 2.4, 3, 1, 2 - flap, 'rgba(220,230,200,0.7)');
    line(c, 4.6, 3, 6, 2 + flap, 'rgba(220,230,200,0.7)');
  } },
  dragonfly: { w: 14, h: 9, frames: 4, draw: (c, t) => {
    const flap = Math.sin(t * TAU * 2) * 2;
    taper(c, 3, 4.5, 12, 4.5, 1.2, 0.5, '#2f8a9a');
    circ(c, 2.6, 4.5, 1.6, '#3fae91');
    circ(c, 1.8, 4, 0.8, '#171310');
    for (const s of [-1, 1]) {
      ell(c, 5, 4.5 + s * (1.6 + Math.abs(flap) * 0.4), 3.4, 1, 'rgba(200,230,235,0.75)');
      ell(c, 8.4, 4.5 + s * (1.4 + Math.abs(flap) * 0.3), 2.6, 0.9, 'rgba(200,230,235,0.6)');
    }
  } },
  butterfly: { w: 11, h: 10, frames: 6, draw: (c, t) => {
    const open = 0.35 + Math.abs(Math.sin(t * TAU)) * 0.65;
    rect(c, 5, 3, 1, 5, '#3a2a20');
    for (const s of [-1, 1]) {
      ell(c, 5.5 + s * 2.6 * open, 4, 2.6 * open + 0.6, 2.2, '#e8a13c');
      ell(c, 5.5 + s * 2.2 * open, 6.4, 2 * open + 0.5, 1.6, '#c9622a');
      px(c, Math.round(5.5 + s * 2.6 * open), 4, '#f7ef86');
    }
    line(c, 5.5, 3, 4.4, 1.4, '#3a2a20');
    line(c, 5.5, 3, 6.6, 1.4, '#3a2a20');
  } },
  bee: { w: 9, h: 8, frames: 4, draw: (c, t) => {
    const flap = Math.sin(t * TAU * 2);
    ell(c, 4.5, 4.5, 2.4, 1.8, '#e8bb2c');
    rect(c, 3.4, 3.2, 1, 2.8, '#2e2a1e');
    rect(c, 5.4, 3.2, 1, 2.8, '#2e2a1e');
    circ(c, 2.2, 4.2, 1.2, '#2e2a1e');
    ell(c, 4.6, 2.6 - Math.abs(flap) * 0.6, 2.2, 0.8, 'rgba(230,240,240,0.7)');
  } },
  beetle: { w: 9, h: 8, frames: 4, draw: (c, t) => {
    const step = Math.sin(t * TAU);
    ell(c, 4.5, 4.5, 3, 2.6, '#2f4a2c');
    ell(c, 4.5, 4, 2.4, 1.8, '#3d6236');
    line(c, 4.5, 2.2, 4.5, 6.6, '#1c2e1a');
    circ(c, 4.5, 2, 1.4, '#1c2e1a');
    for (const s of [-1, 1]) {
      line(c, 4.5 + s * 2, 3.6, 4.5 + s * 4, 2.6 + step * 0.8, '#1c2e1a');
      line(c, 4.5 + s * 2, 5.4, 4.5 + s * 4, 6.4 - step * 0.8, '#1c2e1a');
    }
  } },
  grasshopper: { w: 11, h: 8, frames: 4, draw: (c, t) => {
    const kick = Math.max(0, Math.sin(t * TAU));
    ell(c, 5, 4.6, 3.4, 1.6, '#6f8a45');
    circ(c, 8, 4.2, 1.5, '#889d55');
    line(c, 9, 3.4, 10.4, 2, '#4b6b2c');
    line(c, 4, 4, 2, 3, '#4b6b2c');
    line(c, 4.6, 5.4, 3.2 - kick, 7, '#4b6b2c');
    line(c, 3.2 - kick, 7, 1.4 - kick, 5.6, '#4b6b2c');
    ell(c, 5.4, 3.8, 2.6, 0.9, 'rgba(200,215,170,0.6)');
  } },
  moth: { w: 11, h: 9, frames: 5, draw: (c, t) => {
    const open = 0.4 + Math.abs(Math.sin(t * TAU)) * 0.6;
    rect(c, 5, 3, 1, 4, '#5a4d3d');
    for (const s of [-1, 1]) {
      ell(c, 5.5 + s * 2.4 * open, 4.4, 2.4 * open + 0.7, 2.4, '#a89a80');
      px(c, Math.round(5.5 + s * 2.4 * open), 4, '#3a2c1e');
    }
  } },
  waterstrider: { w: 11, h: 9, frames: 4, draw: (c, t) => {
    const glide = Math.sin(t * TAU) * 1.2;
    ell(c, 5.5, 4.5, 2.2, 0.9, '#2e2a1e');
    for (const s of [-1, 1]) {
      line(c, 5.5, 4.5, 2 + glide, 4.5 + s * 3, '#3a3226');
      line(c, 5.5, 4.5, 9 - glide, 4.5 + s * 3, '#3a3226');
    }
  } },
  ant: { w: 7, h: 6, frames: 4, draw: (c, t) => {
    const wob = Math.sin(t * TAU) * 0.6;
    circ(c, 2, 3 + wob * 0.3, 1.1, '#3a2418');
    circ(c, 3.6, 3, 0.8, '#3a2418');
    circ(c, 5.2, 3 - wob * 0.3, 1.2, '#3a2418');
    for (const s of [-1, 1]) {
      line(c, 3.6, 3, 2.6, 3 + s * 2 + wob, '#241610');
      line(c, 3.6, 3, 4.8, 3 + s * 2 - wob, '#241610');
    }
  } },
};

export const BUG_NAMES = Object.keys(BUGS);
export const FLYING_BUGS = ['firefly', 'dragonfly', 'butterfly', 'bee', 'moth'];
export const GROUND_BUGS = ['beetle', 'grasshopper', 'ant'];

export function bugFrames(kind) {
  const spec = BUGS[kind] || BUGS.firefly;
  return getSheet(`bug:${kind}`, () => {
    const frames = [];
    for (let i = 0; i < spec.frames; i++) {
      const ctx = surface(spec.w, spec.h);
      spec.draw(ctx, i / spec.frames);
      outline(ctx, 'rgba(13,18,15,0.7)');
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

export function bugGlow(kind) { return (BUGS[kind] || {}).glow || null; }

// --- fish ------------------------------------------------------------------
export function fishFrames(kind = 'trout') {
  return getSheet(`fish:${kind}`, () => {
    const frames = [];
    const body = kind === 'trout' ? '#5c6b52' : '#4a5f6b';
    const belly = kind === 'trout' ? '#c9b898' : '#a8bcc4';
    const spot = kind === 'trout' ? '#c9422a' : '#2f4a5c';
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const wig = Math.sin(t * TAU) * 1.6;
      const ctx = surface(16, 9);
      ell(ctx, 7, 4.5, 5, 2.2, body);
      ell(ctx, 7, 5.4, 4, 1.2, belly);
      tri(ctx, 12, 4.5, 14 + wig * 0.4, 2 + wig, 14 + wig * 0.4, 7 + wig, body);
      tri(ctx, 6, 2.6, 9, 2.6, 7.5, 0.8, body);
      circ(ctx, 3, 4, 0.8, '#171310');
      for (let k = 0; k < 3; k++) px(ctx, 5 + k * 2, 4 - (k % 2), spot);
      outline(ctx, 'rgba(13,18,15,0.6)');
      frames.push(ctx.canvas);
    }
    return frames;
  });
}
