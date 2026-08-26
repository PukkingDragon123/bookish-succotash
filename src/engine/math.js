// Small math helpers shared by every system. Kept allocation-free where it
// matters: the bullet-hell update loop runs thousands of these per frame.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Frame-rate independent approach-to-target. `rate` is "fraction remaining
// after one second", so damp(x, y, 0.001, dt) is snappy and 0.5 is sluggish.
export const damp = (a, b, rate, dt) => b + (a - b) * Math.pow(rate, dt);

export function approach(a, b, step) {
  if (a < b) return Math.min(a + step, b);
  if (a > b) return Math.max(a - step, b);
  return b;
}

export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
export function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function rotateToward(cur, target, maxStep) {
  const d = angleDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export function circleHit(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

export function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Quantise to the pixel grid so nothing shimmers between sub-pixels.
export const snap = (v) => Math.round(v);

export function wrapIndex(i, n) { return ((i % n) + n) % n; }
