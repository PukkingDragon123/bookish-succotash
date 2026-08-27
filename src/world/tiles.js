// Tile definitions and terrain painting. Tiles are never pre-rendered to fixed
// canvases; instead each one is drawn straight into a chunk buffer using a
// deterministic hash of its coordinates, so there is no visible tiling pattern
// anywhere in the basin.

import { P } from '../art/palette.js';
import { hash2 } from '../engine/rng.js';
import { TAU } from '../engine/math.js';
import { shade } from '../art/pixel.js';

export const TS = 16;   // tile size in pixels

export const T = {
  WATER_DEEP: 0, WATER: 1, SHALLOW: 2, SAND: 3, GRAVEL: 4, DIRT: 5,
  GRASS: 6, DUFF: 7, MEADOW: 8, MEADOW_DRY: 9, SAGE: 10, ROCK: 11,
  SINTER: 12, MUD: 13, MAT_ORANGE: 14, MAT_OLIVE: 15, SPRING: 16,
  ASH: 17, CHARRED: 18, SNOW: 19, OBSIDIAN: 20, MAT_RUST: 21, SPRING_DEEP: 22,
  // Les Nest interiors
  LAB_FLOOR: 23, LAB_DARK: 24, LAB_WALL: 25, LAB_GLASS: 26,
  LAB_GRATE: 27, LAB_TEAL: 28, LAB_BLOOD: 29, LAB_PAD: 30,
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

// --- laboratory ------------------------------------------------------------
def(T.LAB_FLOOR, { name: 'lab floor', base: '#3f4a4c', light: '#4e5a5c', dark: '#2f383a', indoor: true });
def(T.LAB_DARK,  { name: 'service floor', base: '#2c3436', light: '#3a4446', dark: '#20272a', indoor: true });
def(T.LAB_WALL,  { name: 'wall', base: '#59666a', light: '#6f7d81', dark: '#39454a', solid: true, indoor: true });
def(T.LAB_GLASS, { name: 'containment glass', base: '#5f8f96', light: '#a9dbe0', dark: '#3d666d', solid: true, glass: true, indoor: true });
def(T.LAB_GRATE, { name: 'grate', base: '#333c3e', light: '#49555a', dark: '#232b2d', indoor: true });
def(T.LAB_TEAL,  { name: 'company floor', base: '#17403e', light: '#22605c', dark: '#0f2c2b', indoor: true });
// Same floor as anywhere else in the block. The blood is painted on top, not
// baked into the panel grid, or every tile edge comes out as a red line.
def(T.LAB_BLOOD, { name: 'floor', base: '#3f4a4c', light: '#4e5a5c', dark: '#2f383a', indoor: true, bloody: true });
def(T.LAB_PAD,   { name: 'helipad', base: '#37403f', light: '#c9a23c', dark: '#232a2a', indoor: true });

export const isWater = (t) => TILES[t].water;
export const isSolid = (t) => TILES[t].solid;
export const tileSpeed = (t) => TILES[t].speed;
export const isHot = (t) => !!TILES[t].hot;
export const tileDamage = (t) => TILES[t].damage || 0;
export const isFlammable = (t) => TILES[t].burn >= 0;

// Ordered dither matrix, and how much of the neighbour survives at each step
// inward. Four pixels of bleed is enough to break the grid without smearing
// the terrain into mush.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BLEED = 4;
const BLEED_T = [13, 9, 5, 2];

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
    case T.LAB_FLOOR:
    case T.LAB_DARK:
    case T.LAB_TEAL:
    case T.LAB_BLOOD: {
      // clean panel grid, scuffed
      ctx.fillStyle = t.dark;
      ctx.fillRect(px, py + TS - 1, TS, 1);
      ctx.fillRect(px + TS - 1, py, 1, TS);
      ctx.fillStyle = t.light;
      ctx.fillRect(px, py, TS - 1, 1);
      for (let i = 0; i < 3; i++) {
        const x = px + Math.floor(hash2(tx * 7 + i, ty * 13, 40) * (TS - 3));
        const y = py + Math.floor(hash2(tx * 3, ty * 11 + i, 41) * (TS - 2));
        ctx.fillStyle = h(i) > 0.6 ? t.light : t.dark;
        ctx.fillRect(x, y, 2, 1);
      }
      if (id === T.LAB_BLOOD) {
        // A pool with a dark heart and a spattered edge, deterministic so it
        // never crawls between frames. Blobs, not scanlines.
        const cx = px + 3 + Math.floor(hash2(tx, ty, 44) * 9);
        const cy = py + 3 + Math.floor(hash2(tx, ty, 45) * 9);
        const rr = 3 + hash2(tx, ty, 46) * 3.4;
        for (let y = -5; y <= 5; y++) {
          for (let x = -5; x <= 5; x++) {
            const gx = cx + x, gy = cy + y;
            if (gx < px || gy < py || gx >= px + TS || gy >= py + TS) continue;
            // squashed circle, edge chewed up by a hash so it is not a disc
            const d = Math.hypot(x, y * 1.25) - hash2(gx, gy, 47) * 1.6;
            if (d > rr) continue;
            ctx.fillStyle = d < rr * 0.45 ? '#4a1414' : d < rr * 0.78 ? '#5c1a1a' : '#7a2323';
            ctx.fillRect(gx, gy, 1, 1);
          }
        }
        // thrown droplets, further out and smaller
        for (let i = 0; i < 9; i++) {
          const a = hash2(tx * 5 + i, ty, 42) * TAU;
          const r2 = rr + 1 + hash2(tx, ty * 5 + i, 43) * 6;
          const gx = Math.round(cx + Math.cos(a) * r2);
          const gy = Math.round(cy + Math.sin(a) * r2 * 0.8);
          if (gx < px || gy < py || gx >= px + TS || gy >= py + TS) continue;
          ctx.fillStyle = i % 3 === 0 ? '#8e2a2a' : '#5c1a1a';
          ctx.fillRect(gx, gy, 1, 1 + (i % 2 && r2 < rr + 3 ? 1 : 0));
        }
      }
      break;
    }
    case T.LAB_WALL: {
      ctx.fillStyle = t.light;
      ctx.fillRect(px, py, TS, 2);
      ctx.fillStyle = t.dark;
      ctx.fillRect(px, py + TS - 3, TS, 3);
      for (let i = 0; i < 2; i++) {
        const x = px + 2 + i * 7;
        ctx.fillStyle = t.dark;
        ctx.fillRect(x, py + 4, 1, TS - 8);
      }
      break;
    }
    case T.LAB_GLASS: {
      ctx.fillStyle = t.dark;
      ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = t.base;
      ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
      ctx.fillStyle = t.light;
      // a couple of specular streaks so it reads as glass, not water
      ctx.fillRect(px + 3, py + 2, 1, TS - 5);
      ctx.fillRect(px + 4, py + 2, 1, 4);
      ctx.fillRect(px + 9, py + 6, 1, TS - 9);
      break;
    }
    case T.LAB_GRATE: {
      ctx.fillStyle = t.dark;
      ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = t.light;
      for (let i = 1; i < TS; i += 3) ctx.fillRect(px, py + i, TS, 1);
      ctx.fillStyle = t.base;
      for (let i = 0; i < TS; i += 5) ctx.fillRect(px + i, py, 1, TS);
      break;
    }
    case T.LAB_PAD: {
      ctx.fillStyle = t.dark;
      ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = t.base;
      ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
      // hazard chevrons
      ctx.fillStyle = t.light;
      for (let i = 0; i < TS; i += 4) ctx.fillRect(px + ((i + tx * 3) % TS), py + i, 2, 1);
      break;
    }
    default: break;
  }

  // --- edge blending ------------------------------------------------------
  // A single dithered pixel row still reads as a hard grid line when two
  // greens meet. Instead the neighbour bleeds four pixels in, thinning out
  // with an ordered dither, and the diagonals get a corner patch so the
  // intersections don't stay square either.
  if (nb && !t.indoor) {
    const edges = [
      [0, -1, 0, 0, 1, 0],       // dx, dy, x0, y0, along-x?, — top
      [0, 1, 0, TS - 1, 1, 0],   // bottom
      [-1, 0, 0, 0, 0, 1],       // left
      [1, 0, TS - 1, 0, 0, 1],   // right
    ];
    for (const [dx, dy, ex, ey, ax, ay] of edges) {
      const other = nb(dx, dy);
      if (other === id || other == null) continue;
      const ot = TILES[other];
      if (!ot || ot.solid || ot.water !== t.water) continue;
      ctx.fillStyle = ot.base;
      const inx = -dx, iny = -dy;
      for (let d = 0; d < BLEED; d++) {
        for (let k = 0; k < TS; k++) {
          const gx = px + ex + ax * k + (dx ? inx * d : 0);
          const gy = py + ey + ay * k + (dy ? iny * d : 0);
          const j = BAYER[(gy & 3) * 4 + (gx & 3)] + hash2(gx, gy, 91) * 7 - 3.5;
          if (j < BLEED_T[d]) ctx.fillRect(gx, gy, 1, 1);
        }
      }
    }
    // corners, so two different neighbours meeting at a diagonal blend too
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const other = nb(dx, dy);
      if (other === id || other == null) continue;
      const ot = TILES[other];
      if (!ot || ot.solid || ot.water !== t.water) continue;
      ctx.fillStyle = ot.base;
      const cx = dx < 0 ? 0 : TS - 3, cy = dy < 0 ? 0 : TS - 3;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const gx = px + cx + x, gy = py + cy + y;
          const j = BAYER[(gy & 3) * 4 + (gx & 3)] + hash2(gx, gy, 92) * 7 - 3.5;
          if (j < 6) ctx.fillRect(gx, gy, 1, 1);
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
