// Value noise with fractal octaves and domain warping. Fast enough to generate
// a 240x200 tile basin in a few frames, and smooth enough that the terrain has
// real landforms rather than TV static.

import { hash2 } from '../engine/rng.js';

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return top + (bot - top) * v;
}

export function fbm(x, y, seed = 0, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged noise — sharp crests, good for mountain spines and thermal fissures. */
export function ridged(x, y, seed = 0, octaves = 4) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq, seed + i * 7919) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Push the sample point around with more noise: turns blobs into coastlines. */
export function warpedFbm(x, y, seed = 0, strength = 1.6, octaves = 4) {
  const wx = fbm(x + 5.2, y + 1.3, seed + 31, 3) - 0.5;
  const wy = fbm(x + 9.7, y + 4.6, seed + 57, 3) - 0.5;
  return fbm(x + wx * strength, y + wy * strength, seed, octaves);
}

/** Distance-to-nearest-feature-point, cell noise. Used for spring pools. */
export function cellular(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 10, bestId = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const px = cx + hash2(cx, cy, seed);
      const py = cy + hash2(cx, cy, seed + 991);
      const d = Math.hypot(px - x, py - y);
      if (d < best) { best = d; bestId = (cx * 73856093) ^ (cy * 19349663); }
    }
  }
  return { d: best, id: bestId >>> 0 };
}
