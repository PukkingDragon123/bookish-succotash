// Les Nest interior props. Everything in here is clean, rectangular and
// well-lit, which is exactly what makes it feel wrong after twenty minutes in
// a forest — and what makes the blood show up so well.

import { surface, ell, ellShaded, circ, rect, px, line, capsule, taper, tri, speckle, frameRect, outline, shade, getSheet } from './pixel.js';
import { P } from './palette.js';
import { drawNestLogo } from './machines.js';
import { TAU } from '../engine/math.js';
import { makeRng } from '../engine/rng.js';

function panelPlate(ctx, x, y, w, h, base = P.nestSteel) {
  rect(ctx, x, y, w, h, base);
  rect(ctx, x, y, w, 1, shade(base, 0.24));
  rect(ctx, x, y + h - 1, w, 1, shade(base, -0.32));
  rect(ctx, x, y, 1, h, shade(base, 0.1));
  rect(ctx, x + w - 1, y, 1, h, shade(base, -0.24));
}

// --- props -----------------------------------------------------------------

/** The tank you live in. Drawn open or closed, whole or shattered. */
function drawCage(ctx, rng, state) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  // steel frame
  panelPlate(ctx, cx - 16, base - 6, 32, 6, P.nestSteelDk);
  panelPlate(ctx, cx - 16, base - 34, 32, 4, P.nestSteelDk);
  rect(ctx, cx - 16, base - 32, 2, 26, P.nestSteel);
  rect(ctx, cx + 14, base - 32, 2, 26, P.nestSteel);
  // glass
  if (state !== 'broken') {
    ctx.globalAlpha = 0.55;
    rect(ctx, cx - 14, base - 31, 28, 25, '#5f8f96');
    ctx.globalAlpha = 1;
    rect(ctx, cx - 11, base - 30, 1, 23, '#a9dbe0');
    rect(ctx, cx - 10, base - 30, 1, 7, '#a9dbe0');
    rect(ctx, cx + 6, base - 24, 1, 17, '#a9dbe0');
    if (state === 'cracked') {
      const cxx = cx + 2, cyy = base - 20;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + 0.3;
        line(ctx, cxx, cyy, cxx + Math.cos(a) * (5 + i), cyy + Math.sin(a) * (5 + i), '#dff2f5');
      }
      circ(ctx, cxx, cyy, 2, '#eef8fa');
    }
  } else {
    // jagged remnants along the frame
    for (let i = 0; i < 10; i++) {
      const x = cx - 13 + i * 3;
      tri(ctx, x, base - 31, x + 3, base - 31, x + 1.5, base - 31 + 3 + rng() * 5, '#7fb4bb');
    }
    for (let i = 0; i < 8; i++) {
      const x = cx - 13 + i * 3.6;
      tri(ctx, x, base - 6, x + 3, base - 6, x + 1.5, base - 6 - 3 - rng() * 5, '#7fb4bb');
    }
  }
  // label plate
  panelPlate(ctx, cx - 9, base - 5, 18, 4, P.nestDark);
  rect(ctx, cx - 7, base - 4, 2, 2, P.nestTealHi);
  rect(ctx, cx - 3, base - 4, 8, 1, P.nestSteelHi);
  // status light
  circ(ctx, cx + 12, base - 33, 1.4, state === 'broken' ? P.nestEye : P.nestTealHi);
}

function drawConsole(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  panelPlate(ctx, cx - 11, base - 12, 22, 12, P.nestSteelDk);
  panelPlate(ctx, cx - 9, base - 20, 18, 9, P.nestDark);
  rect(ctx, cx - 7, base - 18, 14, 5, '#0d2a2a');
  for (let i = 0; i < 4; i++) {
    rect(ctx, cx - 6, base - 17 + i, 2 + rng() * 9, 1, i % 2 ? P.nestTealHi : P.springHot);
  }
  for (let i = 0; i < 5; i++) circ(ctx, cx - 8 + i * 4, base - 8, 1, i === 2 ? P.nestEye : P.nestSteelHi);
}

function drawVat(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  panelPlate(ctx, cx - 8, base - 4, 16, 4, P.nestSteelDk);
  ctx.globalAlpha = 0.7;
  rect(ctx, cx - 7, base - 26, 14, 22, '#1d5f63');
  ctx.globalAlpha = 1;
  rect(ctx, cx - 8, base - 28, 16, 3, P.nestSteel);
  rect(ctx, cx - 8, base - 28, 16, 1, P.nestSteelHi);
  // suspended specimen, indistinct on purpose
  ell(ctx, cx, base - 15, 4, 5.5, '#2a3c3a');
  ell(ctx, cx, base - 17, 2.4, 2.4, '#3a504c');
  for (let i = 0; i < 5; i++) {
    circ(ctx, cx - 4 + rng() * 8, base - 8 - rng() * 16, 1, '#8fd0d6');
  }
  rect(ctx, cx - 5, base - 27, 1, 22, '#4d8f96');
}

function drawOpTable(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  rect(ctx, cx - 2, base - 8, 4, 8, P.nestSteelDk);
  panelPlate(ctx, cx - 13, base - 12, 26, 5, P.nestSteel);
  // straps
  for (const x of [-7, 0, 7]) rect(ctx, cx + x - 1, base - 13, 3, 2, '#3a3226');
  // instrument arm
  taper(ctx, cx + 10, base - 12, cx + 6, base - 24, 1.4, 1, P.nestSteelDk);
  circ(ctx, cx + 6, base - 24, 2.4, P.nestSteel);
  circ(ctx, cx + 6, base - 24, 1.2, P.springHot);
  // old stains
  for (let i = 0; i < 6; i++) px(ctx, Math.round(cx - 8 + rng() * 16), Math.round(base - 8 + rng() * 6), '#5c1a1a');
}

function drawLabDoor(ctx, rng, open) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  panelPlate(ctx, cx - 12, base - 26, 24, 26, P.nestSteelDk);
  if (open) {
    rect(ctx, cx - 9, base - 23, 18, 23, '#101a1c');
    rect(ctx, cx - 10, base - 24, 2, 24, P.nestSteel);
    rect(ctx, cx + 8, base - 24, 2, 24, P.nestSteel);
  } else {
    panelPlate(ctx, cx - 9, base - 23, 9, 23, P.nestSteel);
    panelPlate(ctx, cx, base - 23, 9, 23, P.nestSteel);
    rect(ctx, cx - 1, base - 23, 2, 23, P.nestSteelDk);
    for (let i = 0; i < 3; i++) rect(ctx, cx - 7, base - 20 + i * 3, 5, 1, '#c9a23c');
  }
  circ(ctx, cx + 10, base - 14, 1.4, open ? P.uiGood : P.nestEye);
}

function drawHurdle(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  rect(ctx, cx - 10, base - 3, 3, 3, P.nestSteelDk);
  rect(ctx, cx + 7, base - 3, 3, 3, P.nestSteelDk);
  rect(ctx, cx - 10, base - 9, 20, 3, '#c9a23c');
  for (let i = 0; i < 4; i++) rect(ctx, cx - 9 + i * 5, base - 9, 2, 3, '#2c2418');
}

function drawFoodDish(ctx, rng, full) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 2, 7, 3, P.nestSteel);
  ell(ctx, cx, base - 3, 5.4, 2.2, P.nestSteelDk);
  if (full) {
    for (let i = 0; i < 6; i++) {
      circ(ctx, cx - 3 + rng() * 6, base - 3.5 + rng() * 1.5, 1.2, i % 2 ? '#8a6234' : '#a97c46');
    }
  }
}

function drawBanner(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  rect(ctx, cx - 13, base - 30, 26, 30, P.nestDark);
  rect(ctx, cx - 13, base - 30, 26, 1, P.nestTeal);
  drawNestLogo(ctx, cx, base - 17, 0.85);
  rect(ctx, cx - 9, base - 5, 18, 1, P.nestTeal);
  rect(ctx, cx - 6, base - 3, 12, 1, P.nestTealHi);
}

function drawLocker(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  panelPlate(ctx, cx - 8, base - 22, 16, 22, P.nestSteel);
  rect(ctx, cx, base - 22, 1, 22, P.nestSteelDk);
  circ(ctx, cx - 3, base - 11, 1, P.nestSteelDk);
  circ(ctx, cx + 3, base - 11, 1, P.nestSteelDk);
  rect(ctx, cx - 6, base - 20, 5, 2, P.nestTeal);
}

function drawCrateLab(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  panelPlate(ctx, cx - 7, base - 13, 14, 13, P.nestDark);
  rect(ctx, cx - 7, base - 8, 14, 1, P.nestTeal);
  rect(ctx, cx - 4, base - 11, 8, 2, P.nestTealHi);
}

function drawHeli(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, cy = H / 2;
  // body
  ellShaded(ctx, cx, cy, 15, 8, P.nestDark, P.nestSteelDk, '#0a1615');
  panelPlate(ctx, cx - 6, cy - 7, 14, 7, P.nestSteelDk);
  ell(ctx, cx + 10, cy - 1, 6, 5, '#2a5c60');
  ell(ctx, cx + 11, cy - 2, 3.5, 2.6, '#8fd0d6');
  // tail boom
  taper(ctx, cx - 12, cy - 1, cx - 30, cy - 4, 3.4, 1.8, P.nestDark);
  tri(ctx, cx - 30, cy - 9, cx - 30, cy - 1, cx - 24, cy - 4, P.nestSteelDk);
  // skids
  rect(ctx, cx - 12, cy + 8, 22, 1, P.nestSteel);
  rect(ctx, cx - 8, cy + 6, 1, 3, P.nestSteel);
  rect(ctx, cx + 6, cy + 6, 1, 3, P.nestSteel);
  // main rotor, blurred by speed
  const spin = Math.abs(Math.cos(t * TAU));
  ctx.globalAlpha = 0.5 + spin * 0.35;
  ell(ctx, cx - 2, cy - 11, 26 * (0.35 + spin * 0.65), 1.4, '#c4d0d4');
  ctx.globalAlpha = 1;
  rect(ctx, cx - 3, cy - 12, 3, 3, P.nestSteel);
  // tail rotor
  ctx.globalAlpha = 0.5;
  ell(ctx, cx - 30, cy - 4, 2, 6 * (0.4 + spin * 0.6), '#c4d0d4');
  ctx.globalAlpha = 1;
  drawNestLogo(ctx, cx - 2, cy + 1, 0.5);
}

const PROPS = {
  cage:       { w: 40, h: 40, fn: (c, r) => drawCage(c, r, 'whole') },
  cageCracked:{ w: 40, h: 40, fn: (c, r) => drawCage(c, r, 'cracked') },
  cageBroken: { w: 40, h: 40, fn: (c, r) => drawCage(c, r, 'broken') },
  console:    { w: 26, h: 24, fn: drawConsole },
  vat:        { w: 20, h: 32, fn: drawVat },
  opTable:    { w: 30, h: 28, fn: drawOpTable },
  labDoor:    { w: 28, h: 30, fn: (c, r) => drawLabDoor(c, r, false) },
  labDoorOpen:{ w: 28, h: 30, fn: (c, r) => drawLabDoor(c, r, true) },
  hurdle:     { w: 24, h: 12, fn: drawHurdle },
  dish:       { w: 18, h: 8, fn: (c, r) => drawFoodDish(c, r, true) },
  dishEmpty:  { w: 18, h: 8, fn: (c, r) => drawFoodDish(c, r, false) },
  banner:     { w: 30, h: 34, fn: drawBanner },
  locker:     { w: 20, h: 26, fn: drawLocker },
  labCrate:   { w: 18, h: 16, fn: drawCrateLab },
};
export const LAB_PROP_NAMES = Object.keys(PROPS);

export function labProp(kind, variant = 0) {
  const spec = PROPS[kind];
  if (!spec) return null;
  return getSheet(`lab:${kind}:${variant}`, () => {
    const rng = makeRng(variant * 7717 + 5);
    const ctx = surface(spec.w, spec.h);
    spec.fn(ctx, rng);
    outline(ctx, P.black);
    return [ctx.canvas];
  })[0];
}

export function heliFrames() {
  return getSheet('lab:heli', () => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const ctx = surface(74, 34);
      drawHeli(ctx, i / 6);
      outline(ctx, P.black);
      out.push(ctx.canvas);
    }
    return out;
  });
}
