// The wildlife rig. This is a ground-up replacement for the generic critter
// rig: real three-segment legs, an arched spine, four-tone coat shading, and a
// per-species detail pass so a bear reads as a bear from twelve pixels away.
//
// Silhouette does the work. Before any colour goes down, each species gets its
// one unmistakable shape: the bison's shoulder hump, the moose's paddle
// antlers and bell, the hedgehog's spine dome, the squirrel's enormous tail.

import { surface, ell, ellShaded, circ, rect, px, line, capsule, taper, tri, speckle, outline, shade, getSheet } from './pixel.js';
import { P } from './palette.js';
import { TAU, clamp } from '../engine/math.js';
import { hash2 } from '../engine/rng.js';

// --- gait ------------------------------------------------------------------
// Quadrupeds walk on a diagonal gait and bound when they run; getting that
// distinction right is most of what makes an animal look alive.
function gait(anim, t) {
  const a = t * TAU;
  const g = {
    // per-leg phase offsets: [frontNear, frontFar, backNear, backFar]
    leg: [0, 0, 0, 0],
    lift: [0, 0, 0, 0],
    bob: 0, stretch: 1, squash: 1, lean: 0,
    headY: 0, headX: 0, headTilt: 0,
    tail: 0, tailLift: 0, ear: 0, blink: 0, breathe: 0,
  };
  const swing = (ph, amp) => Math.sin(a + ph) * amp;
  const lift = (ph) => Math.max(0, Math.sin(a + ph));

  switch (anim) {
    case 'idle':
      g.breathe = Math.sin(a) * 0.5;
      g.bob = Math.sin(a) * 0.4;
      g.tail = Math.sin(a * 0.7 - 0.8) * 0.9;
      g.tailLift = Math.sin(a * 0.7) * 0.8;
      g.headY = Math.sin(a - 0.9) * 0.5;
      g.headTilt = Math.sin(a * 0.45) * 0.06;
      g.ear = (t > 0.7 && t < 0.8) ? 1 : 0;
      g.blink = t > 0.9 ? 1 : 0;
      break;

    case 'graze':
      g.headY = 5 + Math.sin(a * 0.6) * 0.8;
      g.headTilt = 0.35;
      g.bob = 0.3;
      g.tail = Math.sin(a * 0.8) * 1.4;
      break;

    case 'alert':
      g.headY = -2.2;
      g.headTilt = -0.12;
      g.ear = 1;
      g.tailLift = 1.6;
      g.breathe = Math.sin(a * 2) * 0.3;
      break;

    case 'walk': {
      // diagonal pairs: FL+BR, then FR+BL
      const P0 = 0, P1 = Math.PI, P2 = Math.PI, P3 = 0;
      g.leg = [swing(P0, 2.4), swing(P1, 2.4), swing(P2, 2.2), swing(P3, 2.2)];
      g.lift = [lift(P0) * 1.6, lift(P1) * 1.6, lift(P2) * 1.4, lift(P3) * 1.4];
      g.bob = -Math.abs(Math.sin(a * 2)) * 0.9;
      g.headY = Math.sin(a * 2 - 0.7) * 0.7;
      g.tail = Math.sin(a - 1.0) * 1.2;
      g.lean = 0.4;
      break;
    }

    case 'run': {
      // bound: both fronts together, both backs together, spine flexing
      const F = 0, B = Math.PI * 0.62;
      g.leg = [swing(F, 4.2), swing(F + 0.35, 4.2), swing(B, 4.4), swing(B + 0.35, 4.4)];
      g.lift = [lift(F) * 3.4, lift(F + 0.35) * 3.4, lift(B) * 3.2, lift(B + 0.35) * 3.2];
      g.bob = -2.2 - Math.sin(a * 2) * 1.6;
      g.stretch = 1 + Math.sin(a) * 0.10;
      g.squash = 1 - Math.sin(a) * 0.07;
      g.lean = 1.8;
      g.headY = Math.sin(a - 0.5) * 1.4 - 0.6;
      g.tail = Math.sin(a * 0.5 - 1.1) * 1.6 + 1.4;
      g.tailLift = 2.2;
      break;
    }

    case 'attack': {
      const w = t < 0.35 ? -t / 0.35 : (t < 0.55 ? (t - 0.35) / 0.2 * 2.4 - 1 : 1.4 - (t - 0.55) / 0.45 * 1.4);
      g.lean = w * 3.4;
      g.headX = w * 3.2;
      g.headY = -w * 1.2;
      g.stretch = 1 + Math.max(0, w) * 0.12;
      g.squash = 1 - Math.max(0, w) * 0.08;
      g.tail = -w * 1.8;
      g.ear = 1;
      break;
    }

    case 'sit':
      g.bob = 3;
      g.headY = -1;
      g.tail = Math.sin(a * 0.6) * 1.6;
      g.leg = [0.6, 0.6, -1.6, -1.6];
      break;

    case 'hurt':
      g.lean = -2.4; g.bob = 1.2;
      g.stretch = 1.12; g.squash = 0.9;
      g.ear = 1; g.blink = 1; g.tail = -2;
      break;

    case 'dead':
      g.bob = 7; g.stretch = 1.35; g.squash = 0.42; g.blink = 1; g.ear = 1;
      break;

    case 'fly': {
      g.wing = Math.sin(a * 2);
      g.bob = Math.sin(a * 2) * 2.2;
      g.tail = Math.sin(a) * 0.8;
      break;
    }

    case 'swim':
      g.bob = Math.sin(a) * 0.9;
      g.tail = Math.sin(a * 2) * 2.6;
      g.headY = -1;
      break;

    default: break;
  }
  return g;
}

const DEFAULTS = {
  scale: 1,
  body: { len: 9, hgt: 5, chest: 1.0, haunch: 1.0, arch: 0 },
  neck: { len: 3, thick: 3, angle: -0.5 },
  head: { r: 4, muzzle: 3, muzzleH: 2, snout: 'blunt', jaw: 0, brow: 0 },
  ears: { style: 'round', size: 2, spread: 2.6, tilt: 0 },
  legs: { len: 5, thick: 1.6, spread: 4, count: 4, foot: 'paw', digitigrade: true },
  tail: { style: 'thin', len: 8, thick: 1.6 },
  coat: {},
  extras: {},
  eye: { r: 1.1, color: '#171310' },
};

function merge(cfg) {
  const c = {};
  for (const k of Object.keys(DEFAULTS)) {
    c[k] = (typeof DEFAULTS[k] === 'object' && !Array.isArray(DEFAULTS[k]))
      ? Object.assign({}, DEFAULTS[k], cfg[k] || {})
      : (cfg[k] === undefined ? DEFAULTS[k] : cfg[k]);
  }
  const co = c.coat;
  co.base = co.base || '#8a6b45';
  co.dark = co.dark || shade(co.base, -0.34);
  co.light = co.light || shade(co.base, 0.18);
  co.hi = co.hi || shade(co.base, 0.36);
  co.belly = co.belly || shade(co.base, 0.30);
  co.muzzle = co.muzzle || co.belly;
  co.foot = co.foot || shade(co.base, -0.48);
  co.nose = co.nose || '#171310';
  co.accent = co.accent || co.hi;
  return c;
}

export function beastSize(cfgRaw) {
  const c = merge(cfgRaw);
  const s = c.scale;
  const w = Math.ceil((c.body.len * 2.2 + c.tail.len * 0.9 + c.head.r * 2 + c.head.muzzle * 2) * s) + 8;
  const antler = c.extras.antlers === 'moose' ? 16 : c.extras.antlers === 'elk' ? 13 : c.extras.horns ? 6 : 0;
  const h = Math.ceil((c.legs.len + c.body.hgt * 2 + c.neck.len + c.head.r * 2 + c.ears.size * 2 + antler) * s) + 8;
  return { w: Math.max(14, w), h: Math.max(14, h) };
}

// --- parts -----------------------------------------------------------------

/** Three-segment leg with a real joint, so gaits read as gaits. */
function drawLeg(ctx, hipX, hipY, footX, footY, thick, col, colDark, foot, digitigrade, back) {
  const c = back ? colDark : col;
  const midX = (hipX + footX) / 2 + (digitigrade ? (back ? -0.8 : 0.8) : 0);
  const midY = hipY + (footY - hipY) * 0.5;
  const kneeX = midX + (digitigrade ? 0.9 : -0.5);
  const kneeY = midY - (digitigrade ? 0.8 : 0);
  taper(ctx, hipX, hipY, kneeX, kneeY, thick, thick * 0.8, c);
  taper(ctx, kneeX, kneeY, footX, footY - 1, thick * 0.78, thick * 0.58, c);
  // foot
  const fc = back ? shade(colDark, -0.12) : shade(col, -0.42);
  if (foot === 'hoof') {
    rect(ctx, footX - thick * 0.7, footY - 1.6, thick * 1.4, 1.8, fc);
  } else if (foot === 'flipper') {
    ell(ctx, footX, footY - 0.8, thick * 1.5, thick * 0.7, fc);
  } else {
    ell(ctx, footX + 0.4, footY - 0.8, thick * 1.15, thick * 0.8, fc);
  }
}

function drawEar(ctx, x, y, style, size, dir, tilt, col, inner, dark) {
  switch (style) {
    case 'round':
      circ(ctx, x, y, size, col);
      circ(ctx, x, y + size * 0.15, size * 0.52, inner);
      break;
    case 'pointy':
      tri(ctx, x - size, y + size * 0.9, x + size, y + size * 0.9, x + dir * size * 0.5, y - size * 1.8, col);
      tri(ctx, x - size * 0.48, y + size * 0.5, x + size * 0.48, y + size * 0.5, x + dir * size * 0.3, y - size * 0.95, inner);
      break;
    case 'long':
      capsule(ctx, x, y + size * 0.8, x + dir * size * 0.9 + tilt, y - size * 2.4, size * 0.6, col);
      capsule(ctx, x, y + size * 0.4, x + dir * size * 0.6 + tilt, y - size * 1.7, size * 0.28, inner);
      break;
    case 'ovine':      // small, set low and back
      ell(ctx, x + dir * size * 0.6, y + size * 0.3, size * 0.9, size * 0.5, col);
      break;
    case 'moose':      // wide paddle ears
      ell(ctx, x + dir * size * 0.7, y, size * 1.15, size * 0.62, col);
      ell(ctx, x + dir * size * 0.7, y, size * 0.6, size * 0.3, inner);
      break;
    case 'tiny':
      circ(ctx, x, y, size * 0.7, col);
      break;
    case 'tuft':
      line(ctx, x, y, x + dir * size, y - size * 1.9, dark);
      circ(ctx, x, y, size * 0.75, col);
      break;
    case 'none':
    default: break;
  }
}

function drawAntlers(ctx, x, y, kind, col) {
  if (kind === 'moose') {
    // broad palms with tines along the leading edge
    for (const side of [-1, 1]) {
      const bx = x + side * 3, by = y - 1;
      taper(ctx, bx, by, bx + side * 5, by - 5, 1.5, 1.2, col);
      const px0 = bx + side * 5, py0 = by - 5;
      ell(ctx, px0 + side * 3.5, py0 - 1.5, 5.2, 3.4, col);
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const tx = px0 + side * (1 + t * 7);
        const ty = py0 - 4 - Math.sin(t * Math.PI) * 1.4;
        line(ctx, tx, py0 - 2, tx + side * 0.6, ty - 2.4, col);
      }
    }
  } else if (kind === 'elk') {
    for (const side of [-1, 1]) {
      const bx = x + side * 2.4, by = y - 1;
      // main beam sweeping back and up
      let px0 = bx, py0 = by;
      for (let i = 1; i <= 4; i++) {
        const t = i / 4;
        const nx = bx + side * (1.5 + t * 5.5);
        const ny = by - t * 12;
        taper(ctx, px0, py0, nx, ny, 1.3 - t * 0.6, 1.1 - t * 0.6, col);
        // tines off the front of the beam
        line(ctx, nx, ny, nx + side * 3.2, ny - 3.4, col);
        px0 = nx; py0 = ny;
      }
    }
  } else if (kind === 'deer') {
    for (const side of [-1, 1]) {
      const bx = x + side * 2, by = y - 1;
      taper(ctx, bx, by, bx + side * 3, by - 7, 1.1, 0.7, col);
      line(ctx, bx + side * 1.6, by - 3.6, bx + side * 5, by - 4.6, col);
      line(ctx, bx + side * 2.6, by - 6, bx + side * 5.4, by - 7.6, col);
    }
  }
}

function drawHorns(ctx, x, y, kind, col) {
  if (kind === 'curl') {              // bighorn
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.15 + (i / 8) * Math.PI * 1.5;
        const rr = 3.2 - i * 0.12;
        const hx = x + side * (2.4 + Math.cos(a) * 3.2);
        const hy = y - 0.5 + Math.sin(a) * 2.6;
        circ(ctx, hx, hy, rr * 0.42 + 0.5, i % 2 ? col : shade(col, -0.14));
      }
    }
  } else if (kind === 'bison') {
    for (const side of [-1, 1]) {
      taper(ctx, x + side * 3, y - 0.4, x + side * 5.4, y - 2.6, 1.2, 0.5, col);
    }
  } else if (kind === 'prong') {
    for (const side of [-1, 1]) {
      taper(ctx, x + side * 1.8, y - 1, x + side * 2.6, y - 6, 1.1, 0.5, col);
      line(ctx, x + side * 2.3, y - 3.6, x + side * 4.4, y - 4.6, col);
    }
  }
}

// --- the main draw ---------------------------------------------------------
export function drawBeast(ctx, cfgRaw, anim, t, view = 'front') {
  const c = merge(cfgRaw);
  const g = gait(anim, t);
  const co = c.coat, ex = c.extras;
  const S = c.scale;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2;
  const ground = H - 1;
  const back = view === 'back';
  const dir = back ? -1 : 1;

  const legLen = c.legs.len * S;
  const bodyH = c.body.hgt * S * g.squash;
  const bodyL = c.body.len * S * g.stretch;
  const spineY = ground - legLen - bodyH + g.bob * S;

  // Body masses along the spine: rump, barrel, chest. Sizes differ per species
  // so a bear is chest-heavy and a pronghorn is barrel-light.
  const rumpX = cx - bodyL * 0.42 * dir;
  const barX = cx;
  const chestX = cx + bodyL * 0.40 * dir;
  const arch = (ex.hump ? ex.hump * S : 0) + c.body.arch * S;

  // ---- tail (behind everything) ----
  if (c.tail.style !== 'none') {
    const tx = rumpX - bodyL * 0.30 * dir;
    const ty = spineY + bodyH * 0.15;
    const segs = Math.max(3, Math.round(c.tail.len / 2));
    let px0 = tx, py0 = ty;
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      const bend = g.tail * f * 1.6;
      const nx = tx - dir * (c.tail.len * S * f) + bend * 1.7;
      const arcUp = c.tail.style === 'plume' ? f * 9 * S
        : c.tail.style === 'bushy' ? f * 2.2 * S : 0;
      const ny = ty - g.tailLift * S * f + Math.sin(f * 2.2 + g.tail) * 0.7 - arcUp;
      // A tail is fattest in the middle and comes to a point. Growing it
      // toward the tip turns every canid into a creature with two bodies.
      let rr;
      if (c.tail.style === 'bushy') rr = c.tail.thick * (0.5 + Math.sin(f * Math.PI) * 0.8);
      else if (c.tail.style === 'plume') rr = c.tail.thick * (0.4 + Math.sin(f * Math.PI * 0.85) * 1.35);
      else if (c.tail.style === 'stub') rr = c.tail.thick * (1 - f * 0.55);
      else if (c.tail.style === 'paddle') rr = c.tail.thick * (0.5 + f * 1.4);
      else rr = c.tail.thick * (1 - f * 0.45);
      rr *= S;
      const tipCol = co.tailTip && f > 0.76 ? co.tailTip : (f > 0.5 ? co.dark : co.base);
      capsule(ctx, px0, py0, nx, ny, Math.max(0.6, rr), tipCol);
      px0 = nx; py0 = ny;
    }
    if (c.tail.style === 'plume') {
      // a squirrel's tail catches the light along its whole outer edge
      for (let i = 0; i <= 6; i++) {
        const f = i / 6;
        const nx = tx - dir * (c.tail.len * S * f * 0.86) + g.tail * f * 1.7;
        const ny = ty - g.tailLift * S * f - f * 9 * S;
        circ(ctx, nx - dir * 1.0, ny - 1.0, c.tail.thick * S * (0.22 + Math.sin(f * Math.PI * 0.85) * 0.62), co.hi);
      }
    }
    if (c.tail.style === 'paddle') {
      ell(ctx, px0, py0, c.tail.thick * 2.2 * S, c.tail.thick * 1.3 * S, co.dark);
      speckle(ctx, Math.round(px0 - 4), Math.round(py0 - 2), 8, 4, shade(co.dark, -0.2), 0.3, 3);
    }
    if (c.tail.style === 'fan') {
      for (let k = -2; k <= 2; k++) {
        line(ctx, px0, py0, px0 - dir * 4 + k * 1.4, py0 - 3.4 + Math.abs(k) * 0.7, co.dark);
      }
    }
  }

  // ---- far legs ----
  const hipY = spineY + bodyH * 0.55;
  const spread = c.legs.spread * S;
  const legT = c.legs.thick * S;
  if (c.legs.count >= 4) {
    drawLeg(ctx, rumpX - dir * 0.6, hipY, rumpX - dir * 0.6 + g.leg[3] * S, ground - g.lift[3] * S,
      legT, co.base, co.dark, c.legs.foot, c.legs.digitigrade, true);
    drawLeg(ctx, chestX - dir * 0.6, hipY - 0.4, chestX - dir * 0.6 + g.leg[1] * S, ground - g.lift[1] * S,
      legT, co.base, co.dark, c.legs.foot, c.legs.digitigrade, true);
  }

  // ---- body ----
  const rumpR = bodyL * 0.34 * c.body.haunch;
  const chestR = bodyL * 0.34 * c.body.chest;
  ellShaded(ctx, rumpX, spineY + 0.4, rumpR, bodyH * 0.98, co.base, co.light, co.dark);
  ellShaded(ctx, barX, spineY + 0.2 - arch * 0.25, bodyL * 0.36, bodyH * 0.96, co.base, co.light, co.dark);
  ellShaded(ctx, chestX, spineY - arch * 0.55 + g.lean * 0.15, chestR, bodyH * (1 + (ex.hump ? 0.12 : 0)), co.base, co.light, co.dark);
  if (arch > 0) {
    // shoulder hump: the bison and bear read almost entirely off this shape
    ellShaded(ctx, chestX - dir * bodyL * 0.10, spineY - bodyH * 0.5 - arch * 0.55, chestR * 0.82, (bodyH * 0.55 + arch * 0.6), co.base, co.light, co.dark);
  }

  // belly band and dorsal shadow
  if (!back) {
    ell(ctx, barX + dir * bodyL * 0.05, spineY + bodyH * 0.5, bodyL * 0.42, bodyH * 0.38, co.belly);
  }
  ell(ctx, barX, spineY - bodyH * 0.62 - arch * 0.3, bodyL * 0.40, bodyH * 0.26, co.hi);

  // fur texture along the underside
  speckle(ctx, Math.round(barX - bodyL * 0.5), Math.round(spineY + bodyH * 0.2),
    Math.max(2, Math.round(bodyL)), Math.max(2, Math.round(bodyH * 0.7)), co.dark, 0.10, 17);

  if (ex.spots) {
    for (let i = 0; i < ex.spots; i++) {
      const hx = hash2(i, 7, 3) * 2 - 1, hy = hash2(i, 11, 5) * 2 - 1;
      circ(ctx, barX + hx * bodyL * 0.42, spineY + hy * bodyH * 0.5, 1 * S, co.accent);
    }
  }
  if (ex.saddle) {
    // a darker cape over the shoulders (wolf, coyote)
    ell(ctx, chestX - dir * bodyL * 0.06, spineY - bodyH * 0.42, chestR * 0.95, bodyH * 0.52, co.dark);
  }

  // ---- near legs ----
  if (c.legs.count >= 4) {
    drawLeg(ctx, rumpX + dir * 1.4, hipY, rumpX + dir * 1.4 + g.leg[2] * S, ground - g.lift[2] * S,
      legT, co.base, co.dark, c.legs.foot, c.legs.digitigrade, false);
    drawLeg(ctx, chestX + dir * 1.4, hipY - 0.4, chestX + dir * 1.4 + g.leg[0] * S, ground - g.lift[0] * S,
      legT, co.base, co.dark, c.legs.foot, c.legs.digitigrade, false);
  } else {
    drawLeg(ctx, cx - 2 * S, hipY, cx - 2 * S + g.leg[0] * S, ground - g.lift[0] * S, legT, co.base, co.dark, c.legs.foot, false, false);
    drawLeg(ctx, cx + 2 * S, hipY, cx + 2 * S + g.leg[1] * S, ground - g.lift[1] * S, legT, co.base, co.dark, c.legs.foot, false, false);
  }

  if (ex.spines) {
    // hedgehog: a dome of quills over the whole back, drawn as short strokes
    const n = 26;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const ax = barX - bodyL * 0.62 + f * bodyL * 1.24;
      const rise = Math.sin(f * Math.PI);
      const ay = spineY - bodyH * 0.55 - rise * bodyH * 0.55;
      const len = (2.4 + rise * 2.2) * S;
      const ang = -Math.PI / 2 + (f - 0.5) * 1.9;
      const tip = i % 3 === 0 ? co.hi : co.dark;
      line(ctx, ax, ay + 1, ax + Math.cos(ang) * len, ay + Math.sin(ang) * len, tip);
    }
    ell(ctx, barX, spineY - bodyH * 0.34, bodyL * 0.6, bodyH * 0.7, shade(co.dark, -0.1));
    for (let i = 0; i < 20; i++) {
      const f = i / 19;
      const ax = barX - bodyL * 0.58 + f * bodyL * 1.16;
      const ay = spineY - bodyH * 0.4 - Math.sin(f * Math.PI) * bodyH * 0.4;
      line(ctx, ax, ay, ax + (f - 0.5) * 2.4, ay - 3 * S, i % 2 ? co.base : co.hi);
    }
  }

  // ---- neck & head ----
  const neckLen = c.neck.len * S;
  const headR = c.head.r * S;
  const headX = chestX + dir * (chestR * 0.65 + g.headX * S) + g.lean * 0.3;
  const headY = spineY - bodyH * 0.55 - neckLen - arch * 0.35 + g.headY * S;

  taper(ctx, chestX + dir * chestR * 0.25, spineY - bodyH * 0.35 - arch * 0.4,
    headX, headY + headR * 0.55, c.neck.thick * S * 0.75, c.neck.thick * S * 0.62, co.base);
  if (ex.ruff) {
    // thick winter ruff at the throat (wolf, bison)
    ell(ctx, (headX + chestX) / 2, (headY + spineY - bodyH * 0.4) / 2 + 1, c.neck.thick * S * 1.25, c.neck.thick * S * 1.1, co.dark);
    ell(ctx, (headX + chestX) / 2, (headY + spineY - bodyH * 0.4) / 2, c.neck.thick * S * 0.9, c.neck.thick * S * 0.7, co.base);
  }
  if (ex.bell) {
    // moose dewlap
    const bx = headX - dir * headR * 0.2, by = headY + headR * 1.1;
    capsule(ctx, bx, by, bx - dir * 0.6, by + 5.5 * S, 1.5 * S, co.dark);
    ell(ctx, bx - dir * 0.6, by + 5.5 * S, 1.9 * S, 1.5 * S, co.dark);
  }

  // ears behind the skull
  const earY = headY - headR * 0.72;
  drawEar(ctx, headX - c.ears.spread * S, earY - (g.ear ? 0.8 : 0), c.ears.style, c.ears.size * S, -1, c.ears.tilt, co.base, co.earInner || co.belly, co.dark);
  drawEar(ctx, headX + c.ears.spread * S, earY - (g.ear ? 0.8 : 0), c.ears.style, c.ears.size * S, 1, c.ears.tilt, co.base, co.earInner || co.belly, co.dark);

  // skull
  ellShaded(ctx, headX, headY, headR, headR * (0.86 + c.head.jaw * 0.1), co.base, co.light, co.dark);

  if (ex.antlers) drawAntlers(ctx, headX, headY - headR * 0.7, ex.antlers, ex.antlerColor || P.barkDead);
  if (ex.horns) drawHorns(ctx, headX, headY - headR * 0.55, ex.horns, ex.hornColor || '#3a332a');

  if (!back) {
    // muzzle
    const mL = c.head.muzzle * S, mH = c.head.muzzleH * S;
    const mx = headX + dir * (headR * 0.55 + mL * 0.35);
    const my = headY + headR * (0.18 + c.head.jaw * 0.1);
    if (c.head.snout === 'beak') {
      tri(ctx, headX + dir * headR * 0.3, my - 1.2 * S, headX + dir * headR * 0.3, my + 1.2 * S,
        headX + dir * (headR + mL), my, co.nose);
      line(ctx, headX + dir * headR * 0.3, my, headX + dir * (headR + mL), my, shade(co.nose, -0.3));
    } else if (c.head.snout === 'long') {
      ellShaded(ctx, mx, my, mL * 0.9, mH * 0.72, co.muzzle, null, shade(co.muzzle, -0.16));
      ell(ctx, mx + dir * mL * 0.55, my - 0.2, mH * 0.5, mH * 0.42, co.nose);
    } else if (c.head.snout === 'tapered') {
      taper(ctx, headX + dir * headR * 0.3, my - 0.3, headX + dir * (headR * 0.5 + mL), my + 0.4, mH * 0.8, mH * 0.42, co.muzzle);
      circ(ctx, headX + dir * (headR * 0.5 + mL), my + 0.4, mH * 0.4, co.nose);
    } else {
      ellShaded(ctx, mx, my, mL * 0.8, mH * 0.8, co.muzzle, null, shade(co.muzzle, -0.16));
      circ(ctx, mx + dir * mL * 0.45, my - 0.1, mH * 0.45, co.nose);
    }

    if (ex.faceStripe) {
      // badger/skunk style blaze straight down the face
      rect(ctx, headX - 0.8 * S, headY - headR, 1.6 * S, headR * 1.7, co.accent);
    }
    if (ex.mask) {
      rect(ctx, headX - headR * 0.95, headY - headR * 0.3, headR * 1.9, headR * 0.6, co.maskColor || P.furMask);
    }
    if (ex.cheek) {
      ell(ctx, headX - dir * headR * 0.35, headY + headR * 0.35, headR * 0.5, headR * 0.3, co.accent);
    }

    // eyes
    const eyeY = headY - headR * 0.08;
    const eyeDX = headR * 0.48;
    const er = c.eye.r * S;
    if (g.blink) {
      rect(ctx, headX - eyeDX - er, eyeY, er * 2 + 1, 1, co.dark);
      rect(ctx, headX + eyeDX - er, eyeY, er * 2 + 1, 1, co.dark);
    } else {
      for (const side of [-1, 1]) {
        circ(ctx, headX + side * eyeDX, eyeY, er, c.eye.color);
        if (er > 1) px(ctx, Math.round(headX + side * eyeDX - 0.4), Math.round(eyeY - 0.6), '#ffffff');
      }
    }
    if (c.head.brow) {
      for (const side of [-1, 1]) {
        rect(ctx, headX + side * eyeDX - 1.4 * S, eyeY - er - 1, 3 * S, 1, co.dark);
      }
    }
  } else {
    ell(ctx, headX, headY - headR * 0.2, headR * 0.6, headR * 0.4, co.light);
  }

  // wings last, over the body
  if (ex.wings) {
    const wy = spineY - bodyH * 0.15;
    const flap = g.wing || 0;
    for (const side of [-1, 1]) {
      const tipX = cx + side * (bodyL * 0.6 + 5 * S + Math.abs(flap) * 2 * S);
      const tipY = wy - flap * 5 * S;
      taper(ctx, cx + side * bodyL * 0.3, wy, tipX, tipY, bodyH * 0.62, 1, co.dark);
      line(ctx, tipX, tipY, tipX - side * 2.4 * S, tipY + 3 * S, co.base);
      if (co.wingBar) line(ctx, cx + side * bodyL * 0.34, wy + 1, tipX - side * 1.6, tipY + 1.4, co.wingBar);
    }
  }
}

// --- bakery ----------------------------------------------------------------
export function beastFrames(key, cfg, anim, view = 'front', frames = 8) {
  return getSheet(`beast:${key}:${anim}:${view}:${frames}`, () => {
    const { w, h } = beastSize(cfg);
    const out = [];
    for (let i = 0; i < frames; i++) {
      const ctx = surface(w, h);
      drawBeast(ctx, cfg, anim, i / frames, view);
      outline(ctx, P.black);
      out.push(ctx.canvas);
    }
    return out;
  });
}
