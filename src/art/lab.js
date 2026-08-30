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

// --- the chair -------------------------------------------------------------

/**
 * Aldous Vane, Chief Executive, Les Nest Holdings.
 *
 * He is drawn as a machine with a person in it rather than the other way
 * round, because that is how he treats himself: a failing body kept running by
 * the same division that keeps you running. The chair is the character. The
 * man in it barely moves.
 */
function drawChair(ctx, rng, mode = 'idle') {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, ground = H - 1;
  const steel = P.nestSteel, dark = P.nestSteelDk, teal = P.nestTeal;

  // wheels: big at the back, castors at the front
  for (const s of [-1, 1]) {
    const wx = cx + s * 9;
    circ(ctx, wx, ground - 7, 7, '#14181c');
    circ(ctx, wx, ground - 7, 5, shade(steel, -0.3));
    circ(ctx, wx, ground - 7, 2, dark);
    // spokes, so it reads as a wheel and not a hole
    for (let i = 0; i < 6; i++) {
      const a = i * (TAU / 6) + (mode === 'roll' ? 0.4 : 0);
      line(ctx, wx, ground - 7, wx + Math.cos(a) * 4.4, ground - 7 + Math.sin(a) * 4.4, shade(steel, -0.1));
    }
  }
  for (const s of [-1, 1]) {
    circ(ctx, cx + s * 6, ground - 2, 2.4, '#14181c');
    circ(ctx, cx + s * 6, ground - 2, 1.2, shade(steel, -0.2));
  }

  // frame and footplate
  rect(ctx, cx - 10, ground - 14, 20, 3, dark);
  rect(ctx, cx - 7, ground - 11, 14, 2, shade(steel, -0.4));
  rect(ctx, cx - 5, ground - 5, 10, 2, dark);

  // seat and a very high back
  rect(ctx, cx - 9, ground - 22, 18, 8, steel);
  rect(ctx, cx - 9, ground - 22, 18, 1, shade(steel, 0.3));
  rect(ctx, cx - 10, ground - 44, 20, 23, shade(steel, -0.12));
  rect(ctx, cx - 10, ground - 44, 20, 1, shade(steel, 0.28));
  rect(ctx, cx - 10, ground - 44, 1, 23, shade(steel, 0.12));
  rect(ctx, cx + 9, ground - 44, 1, 23, shade(steel, -0.3));

  // the life-support stack bolted to the back of the chair
  rect(ctx, cx - 14, ground - 40, 5, 18, dark);
  for (let i = 0; i < 3; i++) {
    rect(ctx, cx - 13, ground - 38 + i * 6, 3, 3, i === 1 ? P.nestEye : teal);
  }
  // an IV pole with a bag on it, leaning over his shoulder
  rect(ctx, cx + 11, ground - 52, 1, 32, shade(steel, -0.2));
  rect(ctx, cx + 8, ground - 54, 7, 9, '#8ab8a0');
  rect(ctx, cx + 9, ground - 53, 5, 6, '#c8e4d4');
  line(ctx, cx + 11, ground - 45, cx + 6, ground - 34, '#6a8a7a');

  // the man: small, sunken, mostly blanket
  rect(ctx, cx - 8, ground - 26, 16, 8, '#3a4048');           // lap blanket
  rect(ctx, cx - 8, ground - 26, 16, 1, '#4c545e');
  speckle(ctx, cx - 8, ground - 25, 16, 7, '#2c3138', 0.18, 3);
  // torso in a suit that no longer fits
  rect(ctx, cx - 6, ground - 38, 12, 13, '#23272e');
  rect(ctx, cx - 1, ground - 38, 2, 13, '#171a1f');            // the lapel gap
  rect(ctx, cx - 6, ground - 38, 1, 13, '#31363e');
  // hands: long, folded, wrong
  rect(ctx, cx - 5, ground - 27, 4, 2, '#c9bda8');
  rect(ctx, cx + 1, ground - 27, 4, 2, '#c9bda8');

  // head: hairless, hollow, a breathing mask over the lower half
  const hy = ground - 45;
  ell(ctx, cx, hy, 5, 5.6, '#cfc3ad');
  ell(ctx, cx, hy - 2, 4.4, 3.4, '#ded2bc');
  // the sunken sockets are most of the face
  rect(ctx, cx - 4, hy - 1, 3, 2, '#4a4238');
  rect(ctx, cx + 1, hy - 1, 3, 2, '#4a4238');
  px(ctx, cx - 3, hy - 1, P.nestEye);
  px(ctx, cx + 2, hy - 1, P.nestEye);
  // mask and hose
  rect(ctx, cx - 4, hy + 2, 8, 4, shade(steel, -0.1));
  rect(ctx, cx - 3, hy + 3, 6, 2, dark);
  for (let i = 0; i < 6; i++) {
    px(ctx, cx + 4 + i, hy + 4 + (i % 2), shade(steel, -0.28));
  }
  // collar and the company pin
  rect(ctx, cx - 6, ground - 39, 12, 2, '#31363e');
  px(ctx, cx + 4, ground - 38, P.nestTealHi);

  if (mode === 'talk') {
    // the mask lights when he speaks, which is the only movement he makes
    rect(ctx, cx - 2, hy + 3, 4, 2, P.nestTealHi);
  }
}

// --- vents ------------------------------------------------------------------

function drawVentGrille(ctx, rng, open) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  rect(ctx, 0, 0, W, H, shade(P.nestSteelDk, -0.2));
  frameRect(ctx, 0, 0, W, H, shade(P.nestSteel, -0.1));
  if (open) {
    // a black hole with the duct receding into it
    rect(ctx, 2, 2, W - 4, H - 4, '#080b0d');
    rect(ctx, 4, H - 6, W - 8, 2, '#141a1e');
    rect(ctx, 5, 4, W - 10, 1, '#1a2226');
    // the grille itself, hanging off one corner
    rect(ctx, W - 5, H - 3, 6, 2, shade(P.nestSteel, -0.3));
  } else {
    for (let i = 2; i < H - 2; i += 3) {
      rect(ctx, 2, i, W - 4, 2, shade(P.nestSteel, -0.34));
      rect(ctx, 2, i, W - 4, 1, shade(P.nestSteel, 0.06));
    }
    for (const x of [3, W - 4]) px(ctx, x, 2, shade(P.nestSteel, 0.3));
  }
}

// --- more of the building ---------------------------------------------------

function drawGurney(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  rect(ctx, 2, H - 8, 2, 7, P.nestSteelDk);
  rect(ctx, W - 4, H - 8, 2, 7, P.nestSteelDk);
  circ(ctx, 3, H - 2, 1.6, '#14181c');
  circ(ctx, W - 3, H - 2, 1.6, '#14181c');
  panelPlate(ctx, 0, H - 14, W, 6, P.nestSteel);
  rect(ctx, 1, H - 16, W - 2, 3, '#5c6470');       // a mattress nobody washed
  speckle(ctx, 1, H - 16, W - 2, 3, '#6d2320', 0.1, 9);
  // restraint straps, buckled and empty
  for (const x of [4, W - 8]) {
    rect(ctx, x, H - 17, 3, 5, '#3a352c');
    px(ctx, x + 1, H - 15, '#8a8070');
  }
}

function drawIVStand(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2;
  rect(ctx, cx, 4, 1, H - 6, shade(P.nestSteel, -0.2));
  for (const s of [-1, 1]) line(ctx, cx, H - 2, cx + s * 4, H - 1, shade(P.nestSteel, -0.35));
  rect(ctx, cx - 4, 2, 8, 9, '#8ab8a0');
  rect(ctx, cx - 3, 3, 6, 6, '#c8e4d4');
  rect(ctx, cx - 3, 7, 6, 2, '#9ccdb6');
  line(ctx, cx, 11, cx - 2, 20, '#6a8a7a');
}

function drawJar(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  rect(ctx, 2, H - 3, W - 4, 3, shade(P.nestSteelDk, -0.1));
  rect(ctx, 1, 3, W - 2, H - 6, 'rgba(150,200,205,0.30)');
  frameRect(ctx, 1, 3, W - 2, H - 6, '#7fb4bb');
  rect(ctx, 2, H - 9, W - 4, 6, 'rgba(120,170,150,0.55)');
  // whatever is in it is small and curled and you do not look twice
  ell(ctx, W / 2, H - 6, 2.6, 2, '#b8a888');
  ell(ctx, W / 2 + 1, H - 7, 1.4, 1.2, '#c9bda0');
  rect(ctx, 0, 1, W, 3, shade(P.nestSteel, -0.15));
  rect(ctx, 2, 0, W - 4, 2, shade(P.nestSteel, 0.12));
}

function drawTerminal(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  panelPlate(ctx, 0, H - 12, W, 12, P.nestSteelDk);
  rect(ctx, 2, 2, W - 4, H - 15, '#0d1418');
  frameRect(ctx, 2, 2, W - 4, H - 15, shade(P.nestSteel, -0.2));
  // lines of text nobody was ever meant to read
  for (let i = 0; i < 5; i++) {
    const w = 4 + Math.floor(rng() * (W - 12));
    rect(ctx, 4, 4 + i * 3, w, 1, i === 2 ? P.nestEye : P.nestTealHi);
  }
  rect(ctx, 4, H - 9, 3, 2, P.nestTealHi);
  rect(ctx, W - 8, H - 9, 4, 2, shade(P.nestSteel, -0.3));
}

function drawPipes(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  for (let i = 0; i < 3; i++) {
    const y = 2 + i * 5;
    rect(ctx, 0, y, W, 3, i === 1 ? '#5a6068' : shade(P.nestSteel, -0.24));
    rect(ctx, 0, y, W, 1, shade(P.nestSteel, 0.1));
    // couplings
    for (let x = 3; x < W; x += 11) rect(ctx, x, y - 1, 3, 5, shade(P.nestSteel, -0.36));
  }
  // a slow leak, because nothing in this building is maintained
  px(ctx, Math.floor(W * 0.6), H - 2, P.nestTealHi);
}

function drawFloorDrain(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ell(ctx, W / 2, H / 2, W / 2 - 1, H / 2 - 1, shade(P.nestSteelDk, -0.3));
  ell(ctx, W / 2, H / 2, W / 2 - 2, H / 2 - 2, '#0a0d0f');
  for (let i = -2; i <= 2; i++) rect(ctx, W / 2 + i * 2 - 1, 2, 1, H - 4, shade(P.nestSteel, -0.15));
  rect(ctx, 1, H / 2 - 1, W - 2, 1, '#3a2020');
}

function drawIncinerator(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  panelPlate(ctx, 0, 4, W, H - 4, shade(P.nestSteel, -0.2));
  rect(ctx, 3, H - 16, W - 6, 11, '#0d0a08');
  frameRect(ctx, 3, H - 16, W - 6, 11, shade(P.nestSteel, -0.4));
  // the fire behind the hatch
  for (let i = 0; i < 8; i++) {
    const x = 5 + Math.floor(rng() * (W - 10)), y = H - 8 + Math.floor(rng() * 4);
    px(ctx, x, y, i % 3 === 0 ? P.fire1 : P.fire2);
  }
  rect(ctx, W / 2 - 5, 0, 10, 5, shade(P.nestSteelDk, -0.1));
  rect(ctx, 2, H - 20, W - 4, 2, shade(P.nestSteel, -0.35));
}

function drawSign(ctx, rng, kind) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  rect(ctx, 0, 0, W, H, kind === 'hazard' ? '#c8a72e' : P.nestTeal);
  frameRect(ctx, 0, 0, W, H, shade(kind === 'hazard' ? '#c8a72e' : P.nestTeal, -0.4));
  if (kind === 'hazard') {
    // biohazard, roughly: three arcs round a dot
    circ(ctx, W / 2, H / 2, 2, '#1a1610');
    for (let i = 0; i < 3; i++) {
      const a = i * (TAU / 3) - 1.6;
      circ(ctx, W / 2 + Math.cos(a) * 4, H / 2 + Math.sin(a) * 4, 2.4, '#1a1610');
      circ(ctx, W / 2 + Math.cos(a) * 4, H / 2 + Math.sin(a) * 4, 1.2, '#c8a72e');
    }
  } else {
    // an arrow, pointing somewhere you are not allowed to go
    tri(ctx, W - 4, H / 2, W - 10, H / 2 - 4, W - 10, H / 2 + 4, '#dff2f5');
    rect(ctx, 4, H / 2 - 1, W - 12, 3, '#dff2f5');
  }
}

function drawMopBucket(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  rect(ctx, 2, H - 8, W - 4, 8, '#c8a72e');
  rect(ctx, 2, H - 8, W - 4, 1, '#e2c04a');
  rect(ctx, 3, H - 7, W - 6, 3, '#6d5c3a');
  rect(ctx, W - 6, 0, 1, H - 8, '#8a8070');
  rect(ctx, W - 9, 0, 7, 2, '#9a9284');
}

function drawSpecShelf(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  panelPlate(ctx, 0, 0, W, H, shade(P.nestSteel, -0.24));
  for (let row = 0; row < 3; row++) {
    const y = 3 + row * 8;
    rect(ctx, 1, y + 6, W - 2, 1, shade(P.nestSteel, -0.4));
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 6;
      rect(ctx, x, y, 4, 6, 'rgba(150,200,205,0.35)');
      rect(ctx, x, y + 2, 4, 4, 'rgba(120,170,150,0.5)');
      px(ctx, x + 1, y + 4, '#b8a888');
      rect(ctx, x, y - 1, 4, 1, shade(P.nestSteel, -0.1));
    }
  }
}

/**
 * A card reader beside a door.
 *
 * The single most institutional object in the building: a beige box with one
 * light on it that decides whether you are allowed to be where you are. Red
 * until somebody with the right plastic waves at it.
 */
function drawCardDoor(ctx, rng, open) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  // the frame
  rect(ctx, 0, 0, W, H, P.nestSteelDk);
  panelPlate(ctx, 1, 1, W - 2, H - 2, P.nestSteel);
  if (open) {
    // both leaves retracted into the jambs
    rect(ctx, 3, 2, 4, H - 4, P.nestSteelDk);
    rect(ctx, W - 7, 2, 4, H - 4, P.nestSteelDk);
    rect(ctx, 7, 3, W - 14, H - 6, '#0b1114');
    speckle(ctx, 8, 4, W - 16, H - 8, '#16232a', 0.25, 3);
  } else {
    // two leaves meeting in the middle, with the seam and the hazard chevrons
    rect(ctx, 3, 2, W - 6, H - 4, P.nestSteelHi);
    rect(ctx, W / 2 - 1, 2, 2, H - 4, P.nestSteelDk);
    for (let i = 0; i < 3; i++) {
      const y = 4 + i * 5;
      rect(ctx, 5, y, 5, 2, '#c8a02e');
      rect(ctx, W - 10, y, 5, 2, '#c8a02e');
    }
    rect(ctx, 3, H - 6, W - 6, 1, P.nestSteelDk);
  }
  // the reader on the jamb, and its light
  rect(ctx, W - 5, H - 14, 4, 8, '#cfc9b4');
  rect(ctx, W - 5, H - 14, 4, 1, '#e8e2cc');
  px(ctx, W - 3, H - 12, open ? '#5ad86a' : '#e0685a');
  px(ctx, W - 3, H - 10, '#3a3a34');
}

/** A mug somebody left on the desk. Cold by now. */
function drawCoffee(ctx) {
  rect(ctx, 3, 4, 7, 7, '#d8d2c4');
  rect(ctx, 3, 4, 7, 1, '#f0ebdc');
  rect(ctx, 4, 5, 5, 2, '#3a2a1c');
  rect(ctx, 10, 6, 2, 3, '#d8d2c4');
  px(ctx, 11, 7, '#b8b2a4');
  rect(ctx, 2, 11, 9, 1, '#8e8a80');
}

/** A clipboard on a desk, with something written on it you cannot read. */
function drawClipboard(ctx, rng) {
  rect(ctx, 2, 2, 11, 14, '#8a6a3a');
  rect(ctx, 3, 4, 9, 11, '#e6e2d2');
  rect(ctx, 5, 1, 5, 3, '#9aa0a4');
  for (let i = 0; i < 5; i++) {
    rect(ctx, 4, 6 + i * 2, 4 + Math.floor(rng() * 5), 1, '#7a7668');
  }
}

/** A visitor lanyard, dropped. This is the thing you are looking for. */
function drawLanyard(ctx) {
  // the cord
  line(ctx, 3, 1, 7, 7, '#2a4a6a');
  line(ctx, 11, 1, 7, 7, '#2a4a6a');
  // the badge
  rect(ctx, 3, 7, 9, 8, '#e6e2d2');
  rect(ctx, 3, 7, 9, 1, '#f4f0e2');
  rect(ctx, 4, 8, 4, 4, '#9aa8b0');       // the photograph
  rect(ctx, 4, 13, 7, 1, '#7a7668');
  rect(ctx, 9, 9, 2, 2, '#c8a02e');       // the company mark
  rect(ctx, 3, 14, 9, 1, '#b8b2a0');
}

const LAB_PROPS = {
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
  // the chief executive, and the building he built
  chair:      { w: 40, h: 58, fn: (c, r) => drawChair(c, r, 'idle') },
  chairTalk:  { w: 40, h: 58, fn: (c, r) => drawChair(c, r, 'talk') },
  vent:       { w: 16, h: 14, fn: (c, r) => drawVentGrille(c, r, false) },
  ventOpen:   { w: 16, h: 14, fn: (c, r) => drawVentGrille(c, r, true) },
  gurney:     { w: 26, h: 20, fn: drawGurney },
  ivStand:    { w: 12, h: 26, fn: drawIVStand },
  jar:        { w: 12, h: 16, fn: drawJar },
  terminal:   { w: 22, h: 24, fn: drawTerminal },
  pipes:      { w: 32, h: 18, fn: drawPipes },
  drain:      { w: 12, h: 10, fn: drawFloorDrain },
  incinerator:{ w: 28, h: 34, fn: drawIncinerator },
  signHazard: { w: 14, h: 14, fn: (c, r) => drawSign(c, r, 'hazard') },
  signWay:    { w: 22, h: 10, fn: (c, r) => drawSign(c, r, 'way') },
  mopBucket:  { w: 14, h: 16, fn: drawMopBucket },
  specShelf:  { w: 28, h: 28, fn: drawSpecShelf },
  cardDoor:   { w: 28, h: 30, fn: (c, r) => drawCardDoor(c, r, false) },
  cardDoorOpen:{ w: 28, h: 30, fn: (c, r) => drawCardDoor(c, r, true) },
  coffee:     { w: 14, h: 13, fn: drawCoffee },
  clipboard:  { w: 15, h: 17, fn: drawClipboard },
  lanyard:    { w: 15, h: 16, fn: drawLanyard },
};
export const LAB_PROP_NAMES = Object.keys(LAB_PROPS);

export function labProp(kind, variant = 0) {
  const spec = LAB_PROPS[kind];
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
