// A tiny pixel-drawing DSL. Everything works on integer coordinates against an
// offscreen 2D context, so shapes come out as honest hard-edged pixels rather
// than anti-aliased vectors. Sprites are baked once at load and cached.

import { hash2 } from '../engine/rng.js';

export function surface(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export const px = (ctx, x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); };

export function rect(ctx, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function frameRect(ctx, x, y, w, h, c) {
  rect(ctx, x, y, w, 1, c);
  rect(ctx, x, y + h - 1, w, 1, c);
  rect(ctx, x, y, 1, h, c);
  rect(ctx, x + w - 1, y, 1, h, c);
}

/** Filled ellipse, scanline-accurate on the pixel grid. */
export function ell(ctx, cx, cy, rx, ry, c) {
  if (rx <= 0 || ry <= 0) return;
  ctx.fillStyle = c;
  const y0 = Math.round(cy - ry), y1 = Math.round(cy + ry);
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const s = 1 - dy * dy;
    if (s <= 0) continue;
    const hw = Math.sqrt(s) * rx;
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

export function circ(ctx, cx, cy, r, c) { ell(ctx, cx, cy, r, r, c); }

/** Ellipse with a soft two-tone volume shade (light on top, dark below). */
export function ellShaded(ctx, cx, cy, rx, ry, base, light, dark) {
  ell(ctx, cx, cy, rx, ry, base);
  if (light) ell(ctx, cx, cy - ry * 0.32, rx * 0.72, ry * 0.5, light);
  if (dark) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.round(cx - rx), Math.round(cy + ry * 0.35), Math.ceil(rx * 2), Math.ceil(ry));
    ctx.clip();
    ell(ctx, cx, cy, rx, ry, dark);
    ctx.restore();
  }
}

/** Bresenham line. */
export function line(ctx, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = c;
  for (let guard = 0; guard < 4096; guard++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Thick line — limbs, branches, cables, gun barrels. */
export function capsule(ctx, x0, y0, x1, y1, r, c) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    circ(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, c);
  }
}

/** Tapered limb: thick at the root, thin at the tip. */
export function taper(ctx, x0, y0, x1, y1, r0, r1, c) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    circ(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, c);
  }
}

export function tri(ctx, x0, y0, x1, y1, x2, y2, c) {
  ctx.fillStyle = c;
  const minY = Math.round(Math.min(y0, y1, y2)), maxY = Math.round(Math.max(y0, y1, y2));
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5;
    let lo = Infinity, hi = -Infinity;
    const edges = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
        const t = (yc - ay) / (by - ay);
        const x = ax + (bx - ax) * t;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    if (lo <= hi) ctx.fillRect(Math.round(lo), y, Math.max(1, Math.round(hi) - Math.round(lo)), 1);
  }
}

/** Scatter deterministic speckles inside a rect — bark, gravel, fur texture. */
export function speckle(ctx, x, y, w, h, c, density, seed = 0) {
  ctx.fillStyle = c;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (hash2(x + i, y + j, seed) < density) ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** Checkerboard dither between two colours, used for gradients and mats. */
export function dither(ctx, x, y, w, h, c, phase = 0) {
  ctx.fillStyle = c;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (((i + j + phase) & 1) === 0) ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/**
 * Add a 1px outline around every opaque cluster. This is the single biggest
 * readability win in a busy bullet-hell: sprites stay legible over any terrain.
 */
export function outline(ctx, color = '#0d120f', alphaCut = 8) {
  const { width: w, height: h } = ctx.canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;
  const opaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) opaque[i] = d[i * 4 + 3] > alphaCut ? 1 : 0;
  const out = ctx.createImageData(w, h);
  const o = out.data;
  const [orr, og, ob] = hexToRgb(color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (opaque[i]) {
        o[i * 4] = d[i * 4]; o[i * 4 + 1] = d[i * 4 + 1];
        o[i * 4 + 2] = d[i * 4 + 2]; o[i * 4 + 3] = d[i * 4 + 3];
        continue;
      }
      let near = false;
      if (x > 0 && opaque[i - 1]) near = true;
      else if (x < w - 1 && opaque[i + 1]) near = true;
      else if (y > 0 && opaque[i - w]) near = true;
      else if (y < h - 1 && opaque[i + w]) near = true;
      if (near) { o[i * 4] = orr; o[i * 4 + 1] = og; o[i * 4 + 2] = ob; o[i * 4 + 3] = 255; }
    }
  }
  ctx.putImageData(out, 0, 0);
  return ctx;
}

export function hexToRgb(hex) {
  if (hex[0] === '#') hex = hex.slice(1);
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  if (amount >= 0) return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  return rgbToHex(r * (1 + amount), g * (1 + amount), b * (1 + amount));
}

export function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Flat-tinted copy of a canvas — hit flashes, silhouettes, scan highlights. */
export function tintCopy(src, color, amount = 1) {
  const ctx = surface(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = amount;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return ctx.canvas;
}

/** Bake `n` animation frames. `fn(ctx, i, t)` draws one, t is 0..1 cyclic. */
export function sheet(w, h, n, fn, opts = {}) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const ctx = surface(w, h);
    fn(ctx, i, i / n);
    if (opts.outline !== false) outline(ctx, opts.outlineColor || '#10160f');
    frames.push(ctx.canvas);
  }
  return frames;
}

// --- global sprite cache ---------------------------------------------------
const cache = new Map();

/** Get (and lazily bake) a named animation. `build` returns an array of canvases. */
export function getSheet(key, build) {
  let s = cache.get(key);
  if (!s) { s = build(); cache.set(key, s); }
  return s;
}

const flashCache = new Map();
export function flashFrames(key, frames, color = '#ffffff') {
  const k = key + '|' + color;
  let f = flashCache.get(k);
  if (!f) { f = frames.map(fr => tintCopy(fr, color, 1)); flashCache.set(k, f); }
  return f;
}

export function clearSpriteCache() { cache.clear(); flashCache.clear(); }
export function spriteCacheSize() { return cache.size; }
