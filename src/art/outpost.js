// Les Nest, on the ground.
//
// An outpost has to read from a long way off — you should be able to top a
// rise, see a shape against the trees, and know what it is and roughly how
// much trouble it will be, before anything has shot at you. So each core is
// built around one hard, unnatural silhouette: nothing in this basin grows in
// straight vertical lines except the things they put here.
//
// They are also all obviously *cheap*. Corrugated sheet, welded angle iron,
// yellow paint over rust. This is a company that will be somewhere else next
// quarter and does not care what it leaves behind.

import { surface, rect, frameRect, ell, circ, line, taper, tri, px, dither, speckle, outline, shade, getSheet } from './pixel.js';
import { P } from './palette.js';
import { drawNestLogo } from './machines.js';
import { hash2 } from '../engine/rng.js';

const STEEL = '#5a5f63';
const STEEL_D = '#3a3e42';
const STEEL_L = '#7c8288';
const RUST = '#7a4526';
const PAINT = '#c8a02e';
const PAINT_D = '#8a6c18';
const DARK = '#1a1c1e';

/** Corrugation: the vertical ribbing that says "sheet metal" in nine pixels. */
function ribbed(ctx, x, y, w, h, base, lit) {
  rect(ctx, x, y, w, h, base);
  for (let i = 0; i < w; i += 3) rect(ctx, x + i, y, 1, h, lit);
  rect(ctx, x, y, w, 1, lit);
  rect(ctx, x, y + h - 1, w, 1, shade(base, -0.25));
}

function drawMast(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 2;
  // guy wires first, so the tower sits in front of them
  line(ctx, cx - 1, base - 46, 5, base - 2, '#3d4247');
  line(ctx, cx + 1, base - 46, W - 6, base - 2, '#3d4247');
  // the lattice: two legs and a ladder of cross-braces, narrowing as it goes
  for (let i = 0; i < 24; i++) {
    const y = base - i * 2;
    const spread = 7 - (i / 24) * 5;
    rect(ctx, Math.round(cx - spread), y, 1, 2, STEEL);
    rect(ctx, Math.round(cx + spread), y, 1, 2, STEEL_L);
    if (i % 2 === 0) line(ctx, cx - spread, y, cx + spread, y - 2, STEEL_D);
  }
  // the dish, and the light that tells you it is awake
  ell(ctx, cx + 3, base - 44, 4, 5, STEEL_L);
  ell(ctx, cx + 4, base - 44, 2.4, 3.4, STEEL_D);
  rect(ctx, cx - 1, base - 50, 2, 5, STEEL);
  const blink = t < 0.5;
  circ(ctx, cx, base - 51, 1.6, blink ? '#e8503a' : '#5a2018');
  // a shed at the foot with the logo on it
  ribbed(ctx, cx - 11, base - 12, 22, 12, STEEL, STEEL_L);
  rect(ctx, cx - 11, base - 12, 22, 1, PAINT);
  rect(ctx, cx - 4, base - 8, 8, 8, DARK);
  drawNestLogo(ctx, cx + 7, base - 7, 0.42);
  speckle(ctx, cx - 11, base - 6, 22, 6, RUST, 0.14, 3);
}

function drawTank(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 2;
  // a stack of drums on a pallet, one of them leaking
  const rows = [[-14, 0], [-7, 0], [0, 0], [7, 0], [-10, -11], [-3, -11], [4, -11], [-6, -22]];
  rect(ctx, cx - 18, base - 2, 36, 3, '#4a3a28');
  for (const [dx, dy] of rows) {
    const x = cx + dx, y = base - 12 + dy;
    rect(ctx, x, y, 7, 12, PAINT_D);
    rect(ctx, x + 1, y, 3, 12, PAINT);
    rect(ctx, x, y, 7, 1, shade(PAINT, 0.2));
    rect(ctx, x, y + 4, 7, 1, shade(PAINT_D, -0.3));
    rect(ctx, x, y + 8, 7, 1, shade(PAINT_D, -0.3));
    if ((dx + dy) % 3 === 0) speckle(ctx, x, y + 2, 7, 9, RUST, 0.3, dx + 7);
  }
  // the puddle, and the shimmer over it
  ell(ctx, cx - 2, base + 1, 12, 3, '#2e2a1a');
  ell(ctx, cx - 4, base + 1, 6, 2, '#4a4426');
  if (t > 0.5) px(ctx, Math.round(cx + 4), Math.round(base - 1), '#6b6438');
}

function drawCages(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 2;
  // a bank of four, stacked two by two, bars drawn one pixel apart
  const put = (x, y, w, h, occupied) => {
    rect(ctx, x, y, w, h, '#2a2a2c');
    for (let i = 1; i < w; i += 2) rect(ctx, x + i, y, 1, h, STEEL_L);
    frameRect(ctx, x, y, w, h, STEEL);
    if (occupied) {
      // something in there, and two eyes
      ell(ctx, x + w / 2, y + h - 3, w * 0.3, 2.2, '#4a3a28');
      px(ctx, Math.round(x + w / 2 - 2), Math.round(y + h - 5), '#c8c8a0');
      px(ctx, Math.round(x + w / 2 + 1), Math.round(y + h - 5), '#c8c8a0');
    }
  };
  put(cx - 15, base - 12, 14, 12, true);
  put(cx + 1, base - 12, 14, 12, t < 0.5);
  put(cx - 15, base - 23, 14, 11, false);
  put(cx + 1, base - 23, 14, 11, true);
  rect(ctx, cx - 17, base - 1, 34, 2, '#4a3a28');
  drawNestLogo(ctx, cx, base - 26, 0.36);
}

function drawSaw(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 2;
  // a gantry over a bed, with a blade you can see turning
  rect(ctx, cx - 18, base - 6, 36, 6, '#4a3a28');
  for (let i = 0; i < 6; i++) rect(ctx, cx - 16 + i * 6, base - 7, 4, 2, '#6b5335');
  ribbed(ctx, cx - 20, base - 26, 6, 20, STEEL, STEEL_L);
  ribbed(ctx, cx + 14, base - 26, 6, 20, STEEL, STEEL_L);
  rect(ctx, cx - 20, base - 28, 40, 4, STEEL_D);
  rect(ctx, cx - 20, base - 28, 40, 1, PAINT);
  const a = t * Math.PI;
  for (let i = 0; i < 8; i++) {
    const th = a + (i / 8) * Math.PI * 2;
    px(ctx, Math.round(cx + Math.cos(th) * 8), Math.round(base - 15 + Math.sin(th) * 8), '#c8ccd0');
  }
  circ(ctx, cx, base - 15, 7.5, '#8a9096');
  circ(ctx, cx, base - 15, 5.5, STEEL_D);
  circ(ctx, cx, base - 15, 1.6, PAINT);
  speckle(ctx, cx - 14, base - 10, 28, 8, '#8a7a4a', 0.16, 5);   // sawdust
}

function drawTurretCore(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 2;
  // sandbags, a pintle, and a barrel that tracks
  for (let i = 0; i < 7; i++) {
    const x = cx - 18 + (i % 4) * 9 + (i > 3 ? 4 : 0);
    const y = base - 6 - (i > 3 ? 5 : 0);
    ell(ctx, x + 4, y + 2, 5, 3, i % 2 ? '#6b6048' : '#7a6e54');
  }
  rect(ctx, cx - 3, base - 18, 6, 12, STEEL);
  rect(ctx, cx - 3, base - 18, 2, 12, STEEL_L);
  circ(ctx, cx, base - 20, 5, STEEL_D);
  circ(ctx, cx - 1, base - 21, 3, STEEL);
  const swing = Math.sin(t * Math.PI * 2) * 0.5;
  taper(ctx, cx, base - 20, cx + Math.cos(swing) * 13, base - 21 + Math.sin(swing) * 5, 2.2, 1.2, STEEL_D);
  circ(ctx, cx + 2, base - 23, 1.4, t < 0.5 ? '#e8503a' : '#5a2018');
  drawNestLogo(ctx, cx - 12, base - 12, 0.32);
}

const CORES = {
  mast:   { w: 40, h: 60, frames: 4, fn: drawMast },
  tank:   { w: 44, h: 44, frames: 2, fn: drawTank },
  cages:  { w: 40, h: 34, frames: 2, fn: drawCages },
  saw:    { w: 46, h: 36, frames: 4, fn: drawSaw },
  turret: { w: 44, h: 30, frames: 4, fn: drawTurretCore },
};

export function outpostFrames(core) {
  const spec = CORES[core] || CORES.mast;
  return getSheet(`outpost:${core}`, () => {
    const frames = [];
    for (let i = 0; i < spec.frames; i++) {
      const ctx = surface(spec.w, spec.h);
      spec.fn(ctx, i / spec.frames);
      outline(ctx, P.black);
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

/** What is left after you blow one up: a stump of scorched frame. */
export function outpostWreck(core) {
  const spec = CORES[core] || CORES.mast;
  return getSheet(`outpostwreck:${core}`, () => {
    const ctx = surface(spec.w, Math.max(14, spec.h * 0.4));
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const cx = W / 2, base = H - 2;
    rect(ctx, cx - 14, base - 3, 28, 4, '#2a2420');
    for (let i = 0; i < 7; i++) {
      const x = cx - 12 + i * 4 + (hash2(i, 3, 51) - 0.5) * 3;
      const hgt = 3 + hash2(i, 7, 52) * 8;
      taper(ctx, x, base - 2, x + (hash2(i, 9, 53) - 0.5) * 5, base - 2 - hgt, 1.4, 0.7, i % 2 ? '#3a3e42' : '#2e2622');
    }
    speckle(ctx, cx - 15, base - 8, 30, 9, '#171412', 0.4, 11);
    dither(ctx, cx - 12, base - 4, 24, 4, '#8a4a20', 1);
    outline(ctx, P.black);
    return [ctx.canvas];
  })[0];
}

export function outpostSize(core) {
  const spec = CORES[core] || CORES.mast;
  return { w: spec.w, h: spec.h };
}
