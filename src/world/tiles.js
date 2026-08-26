// Tile definitions and terrain painting. Tiles are never pre-rendered to fixed
// canvases; instead each one is drawn straight into a chunk buffer using a
// deterministic hash of its coordinates, so there is no visible tiling pattern
// anywhere in the basin.

import { P } from '../art/palette.js';
import { hash2 } from '../engine/rng.js';
import { shade } from '../art/pixel.js';

export const TS = 16;   // tile size in pixels

export const T = {
  WATER_DEEP: 0, WATER: 1, SHALLOW: 2, SAND: 3, GRAVEL: 4, DIRT: 5,
  GRASS: 6, DUFF: 7, MEADOW: 8, MEADOW_DRY: 9, SAGE: 10, ROCK: 11,
  SINTER: 12, MUD: 13, MAT_ORANGE: 14, MAT_OLIVE: 15, SPRING: 16,
  ASH: 17, CHARRED: 18, SNOW: 19, OBSIDIAN: 20, MAT_RUST: 21, SPRING_DEEP: 22,
};

export const TILES = [];
function def(id, o) { TILES[id] = Object.assign({ id, solid: false, water: false, speed: 1, burn: -1, dark: null, light: null }, o); }

def(T.WATER_DEEP, { name: 'deep water', base: P.waterDeep, light: P.water, water: true, speed: 0.45, deep: true });
def(T.WATER,      { name: 'water', base: P.water, light: P.waterLight, water: true, speed: 0.55 });
def(T.SHALLOW,    { name: 'shallows', base: P.waterLight, light: P.waterFoam, water: true, speed: 0.75 });
def(T.SAND,       { name: 'sand', base: P.sand, light: shade(P.sand, 0.12), dark: shade(P.sand, -0.16) });
def(T.GRAVEL,     { name: 'gravel', base: P.gravel, light: P.gravelLight, dark: shade(P.gravel, -0.25), speed: 0.94 });
def(T.DIRT,       { name: 'dirt', base: P.dirt, light: P.dirtLight, dark: shade(P.dirt, -0.22) });
def(T.GRASS,      { name: 'grass', base: P.grass, light: P.grassLight, dark: P.grassDark, burn: T.CHARRED });
def(T.DUFF,       { name: 'needle duff', base: '#42402c', light: '#55503a', dark: '#2e2c1e', burn: T.CHARRED });
def(T.MEADOW,     { name: 'meadow', base: P.meadow, light: P.meadowLight, dark: shade(P.meadow, -0.24), burn: T.ASH });
def(T.MEADOW_DRY, { name: 'dry meadow', base: P.meadowDry, light: shade(P.meadowDry, 0.14), dark: shade(P.meadowDry, -0.22), burn: T.ASH });
def(T.SAGE,       { name: 'sage flat', base: P.sage, light: shade(P.sage, 0.12), dark: P.sageDark, burn: T.ASH });
def(T.ROCK,       { name: 'rock', base: P.stone, light: P.stoneLight, dark: P.stoneDark, solid: true });
def(T.SINTER,     { name: 'sinter', base: P.sinter, light: '#f0ece0', dark: shade(P.sinter, -0.18) });
def(T.MUD,        { name: 'mudpot', base: P.mudpot, light: P.mudpotLight, dark: shade(P.mudpot, -0.3), speed: 0.6, hot: true });
def(T.MAT_ORANGE, { name: 'bacterial mat', base: P.springRim1, light: shade(P.springRim1, 0.16), dark: P.springRim2, hot: true });
def(T.MAT_RUST,   { name: 'rust mat', base: P.springRim2, light: shade(P.springRim2, 0.18), dark: shade(P.springRim2, -0.22), hot: true });
def(T.MAT_OLIVE,  { name: 'olive mat', base: P.springRim3, light: shade(P.springRim3, 0.16), dark: shade(P.springRim3, -0.24), hot: true });
def(T.SPRING,     { name: 'hot spring', base: P.spring, light: P.springHot, water: true, speed: 0.5, hot: true, damage: 6 });
def(T.SPRING_DEEP,{ name: 'spring pool', base: '#1b8fa3', light: P.spring, water: true, speed: 0.4, hot: true, damage: 12 });
def(T.ASH,        { name: 'ash', base: P.ash, light: P.ashLight, dark: shade(P.ash, -0.3) });
def(T.CHARRED,    { name: 'burned ground', base: P.charred, light: '#3a322c', dark: '#161210' });
def(T.SNOW,       { name: 'snow', base: P.snow, light: '#ffffff', dark: '#b8c4c9', speed: 0.9 });
def(T.OBSIDIAN,   { name: 'obsidian flow', base: P.obsidian, light: P.obsidianHi, dark: '#0b0b12', speed: 0.95 });

export const isWater = (t) => TILES[t].water;
export const isSolid = (t) => TILES[t].solid;
export const tileSpeed = (t) => TILES[t].speed;
export const isHot = (t) => !!TILES[t].hot;
export const tileDamage = (t) => TILES[t].damage || 0;
export const isFlammable = (t) => TILES[t].burn >= 0;

/**
 * Paint one tile into a chunk buffer.
 * `nb` is a callback (dx,dy) -> neighbouring tile id, used for edge blending.
 */
export function drawTile(ctx, px, py, id, tx, ty, nb) {
  const t = TILES[id];
  ctx.fillStyle = t.base;
  ctx.fillRect(px, py, TS, TS);

  const h = (s) => hash2(tx, ty, s);

  switch (id) {
    case T.GRASS:
    case T.DUFF: {
      // clumps of lighter blades plus a few darker shadowed patches
      const n = 5 + Math.floor(h(1) * 4);
      ctx.fillStyle = t.light;
      for (let i = 0; i < n; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 2) * TS);
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 3) * TS);
        ctx.fillRect(x, y, 1, 2);
      }
      ctx.fillStyle = t.dark;
      for (let i = 0; i < 3; i++) {
        const x = px + Math.floor(hash2(tx + i, ty * 5, 4) * (TS - 3));
        const y = py + Math.floor(hash2(tx * 5, ty + i, 5) * (TS - 2));
        ctx.fillRect(x, y, 2 + Math.floor(h(6 + i) * 2), 1);
      }
      if (id === T.DUFF) {
        ctx.fillStyle = '#6b6142';
        for (let i = 0; i < 5; i++) {
          const x = px + Math.floor(hash2(tx * 11 + i, ty, 7) * (TS - 3));
          const y = py + Math.floor(hash2(tx, ty * 17 + i, 8) * TS);
          ctx.fillRect(x, y, 3, 1);
        }
      }
      break;
    }
    case T.MEADOW:
    case T.MEADOW_DRY:
    case T.SAGE: {
      ctx.fillStyle = t.light;
      for (let i = 0; i < 7; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 9) * TS);
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 10) * (TS - 3));
        ctx.fillRect(x, y, 1, 3);
      }
      ctx.fillStyle = t.dark;
      for (let i = 0; i < 4; i++) {
        const x = px + Math.floor(hash2(tx + i * 3, ty * 5, 11) * TS);
        const y = py + Math.floor(hash2(tx * 5, ty + i * 3, 12) * TS);
        ctx.fillRect(x, y, 1, 2);
      }
      break;
    }
    case T.DIRT:
    case T.SAND:
    case T.ASH:
    case T.SNOW: {
      ctx.fillStyle = t.light;
      for (let i = 0; i < 6; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 13) * TS);
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 14) * TS);
        ctx.fillRect(x, y, 1 + Math.floor(h(i) * 2), 1);
      }
      ctx.fillStyle = t.dark || shade(t.base, -0.2);
      for (let i = 0; i < 4; i++) {
        const x = px + Math.floor(hash2(tx + i, ty * 9, 15) * TS);
        const y = py + Math.floor(hash2(tx * 9, ty + i, 16) * TS);
        ctx.fillRect(x, y, 1, 1);
      }
      break;
    }
    case T.GRAVEL:
    case T.ROCK:
    case T.OBSIDIAN: {
      for (let i = 0; i < 9; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 17) * (TS - 2));
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 18) * (TS - 2));
        const s = 1 + Math.floor(hash2(i, tx + ty, 19) * 2);
        ctx.fillStyle = i % 3 === 0 ? t.light : t.dark;
        ctx.fillRect(x, y, s, s);
      }
      if (id === T.OBSIDIAN) {
        ctx.fillStyle = P.obsidianHi;
        const x = px + Math.floor(h(20) * (TS - 6));
        const y = py + Math.floor(h(21) * (TS - 4));
        ctx.fillRect(x, y, 4, 1);
      }
      break;
    }
    case T.CHARRED: {
      ctx.fillStyle = t.light;
      for (let i = 0; i < 5; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 22) * TS);
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 23) * TS);
        ctx.fillRect(x, y, 2, 1);
      }
      ctx.fillStyle = '#1b1512';
      for (let i = 0; i < 3; i++) {
        const x = px + Math.floor(hash2(tx + i, ty * 5, 24) * TS);
        const y = py + Math.floor(hash2(tx * 5, ty + i, 25) * TS);
        ctx.fillRect(x, y, 3, 2);
      }
      break;
    }
    case T.SINTER: {
      ctx.fillStyle = t.light;
      for (let i = 0; i < 4; i++) {
        const y = py + Math.floor(hash2(tx, ty * 3 + i, 26) * TS);
        ctx.fillRect(px, y, TS, 1);
      }
      ctx.fillStyle = t.dark;
      for (let i = 0; i < 3; i++) {
        const x = px + Math.floor(hash2(tx * 5 + i, ty, 27) * TS);
        ctx.fillRect(x, py, 1, TS);
      }
      break;
    }
    case T.MUD: {
      for (let i = 0; i < 4; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 28) * (TS - 6));
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 29) * (TS - 5));
        ctx.fillStyle = i % 2 ? t.light : t.dark;
        ctx.beginPath();
        ctx.ellipse(x + 3, y + 2, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case T.MAT_ORANGE:
    case T.MAT_RUST:
    case T.MAT_OLIVE: {
      // thermophile mats: fibrous streaks running away from the pool
      ctx.fillStyle = t.light;
      for (let i = 0; i < 6; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 30) * TS);
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 31) * TS);
        ctx.fillRect(x, y, 3, 1);
      }
      ctx.fillStyle = t.dark;
      for (let i = 0; i < 4; i++) {
        const x = px + Math.floor(hash2(tx + i, ty * 5, 32) * TS);
        const y = py + Math.floor(hash2(tx * 5, ty + i, 33) * TS);
        ctx.fillRect(x, y, 2, 1);
      }
      break;
    }
    case T.SPRING:
    case T.SPRING_DEEP:
    case T.WATER:
    case T.WATER_DEEP:
    case T.SHALLOW: {
      ctx.fillStyle = t.light;
      for (let i = 0; i < 3; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 34) * (TS - 5));
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 35) * TS);
        ctx.fillRect(x, y, 4, 1);
      }
      break;
    }
    default: break;
  }

  // --- edge blending: dither the neighbour's colour into the shared border
  if (nb) {
    const edges = [[0, -1, 0, 0, TS, 1], [0, 1, 0, TS - 1, TS, 1], [-1, 0, 0, 0, 1, TS], [1, 0, TS - 1, 0, 1, TS]];
    for (const [dx, dy, ex, ey, ew, eh] of edges) {
      const other = nb(dx, dy);
      if (other === id || other == null) continue;
      const ot = TILES[other];
      if (!ot || ot.solid || ot.water !== t.water) continue;
      ctx.fillStyle = ot.base;
      for (let y = 0; y < eh; y++) {
        for (let x = 0; x < ew; x++) {
          const gx = px + ex + x, gy = py + ey + y;
          if (((gx + gy) & 1) === 0) ctx.fillRect(gx, gy, 1, 1);
        }
      }
    }
  }
}

/** Water shimmer drawn live over the baked chunk, so pools actually move. */
export function drawWaterShimmer(r, tx, ty, id, time) {
  const px = tx * TS, py = ty * TS;
  const t = TILES[id];
  const phase = time * 1.4 + tx * 0.7 + ty * 0.45;
  const n = 2;
  for (let i = 0; i < n; i++) {
    const off = Math.sin(phase + i * 2.1) * 3;
    const y = py + 4 + i * 7 + Math.sin(phase * 0.7 + i) * 1.5;
    const w = 4 + Math.sin(phase + i) * 2;
    r.rectA(px + 3 + off, y, Math.max(2, w), 1, t.light, 0.55);
  }
}
