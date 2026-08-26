// Les Nest hardware. Machines are built from hard rectangles, exposed hydraulics
// and a single hot red optic, so they read as the opposite of the soft, round,
// hand-drawn wildlife they are here to strip-mine.

import { surface, ell, circ, rect, px, line, capsule, taper, tri, outline, shade, getSheet } from './pixel.js';
import { P } from './palette.js';
import { TAU } from '../engine/math.js';

/**
 * The Les Nest mark: an empty nest holding one cracked egg and one dead bird.
 * A company logo that tells you exactly what it does, if you look at it.
 */
export function drawNestLogo(ctx, cx, cy, scale = 1, opts = {}) {
  const s = scale;
  const twig = opts.twig || P.nestDark;
  const twigHi = opts.twigHi || P.nestTeal;
  // nest bowl
  ell(ctx, cx, cy + 2 * s, 9 * s, 4.4 * s, twig);
  ell(ctx, cx, cy + 1 * s, 7.4 * s, 3.4 * s, shade(twig, -0.28));
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    line(ctx, cx + Math.cos(a) * 9 * s, cy + 2 * s + Math.sin(a) * 4 * s,
      cx + Math.cos(a) * 6 * s, cy + 2.6 * s + Math.sin(a) * 1.6 * s, i % 2 ? twigHi : twig);
  }
  // cracked egg
  const ex = cx - 3.2 * s, ey = cy + 0.4 * s;
  ell(ctx, ex, ey, 3 * s, 3.6 * s, opts.egg || P.eggShell);
  line(ctx, ex - 2 * s, ey - 1 * s, ex, ey + 0.4 * s, P.eggCrack);
  line(ctx, ex, ey + 0.4 * s, ex + 1.4 * s, ey - 1.4 * s, P.eggCrack);
  line(ctx, ex, ey + 0.4 * s, ex + 0.6 * s, ey + 2.4 * s, P.eggCrack);
  // dead bird: on its back, legs up
  const bx = cx + 3.6 * s, by = cy + 0.8 * s;
  ell(ctx, bx, by, 3.2 * s, 2.2 * s, opts.bird || P.deadBird);
  ell(ctx, bx - 2.6 * s, by - 0.6 * s, 1.5 * s, 1.4 * s, shade(opts.bird || P.deadBird, 0.12));
  tri(ctx, bx - 3.6 * s, by - 1.1 * s, bx - 3.6 * s, by - 0.1 * s, bx - 5.4 * s, by - 0.6 * s, P.nestSteel);
  // the crossed-out eye
  line(ctx, bx - 3.2 * s, by - 1.2 * s, bx - 2 * s, by, P.nestSteelHi);
  line(ctx, bx - 2 * s, by - 1.2 * s, bx - 3.2 * s, by, P.nestSteelHi);
  // stiff legs
  line(ctx, bx + 0.6 * s, by - 1.6 * s, bx + 0.2 * s, by - 4 * s, P.nestSteel);
  line(ctx, bx + 1.8 * s, by - 1.6 * s, bx + 2.4 * s, by - 4 * s, P.nestSteel);
  line(ctx, bx + 0.2 * s, by - 4 * s, bx - 0.8 * s, by - 4.6 * s, P.nestSteel);
  line(ctx, bx + 2.4 * s, by - 4 * s, bx + 3.4 * s, by - 4.6 * s, P.nestSteel);
  // one limp wing hanging over the rim
  taper(ctx, bx + 1 * s, by + 0.6 * s, bx + 4.4 * s, by + 3.4 * s, 1.4 * s, 0.6 * s, shade(opts.bird || P.deadBird, -0.2));
}

export function nestLogoSprite(size = 1) {
  return getSheet(`logo:nest:${size}`, () => {
    const w = Math.ceil(30 * size), h = Math.ceil(24 * size);
    const ctx = surface(w, h);
    drawNestLogo(ctx, w / 2, h / 2 + 2 * size, size);
    outline(ctx, P.black);
    return [ctx.canvas];
  })[0];
}

// --- machine parts ---------------------------------------------------------

function panel(ctx, x, y, w, h, base = P.nestSteel) {
  rect(ctx, x, y, w, h, base);
  rect(ctx, x, y, w, 1, shade(base, 0.22));
  rect(ctx, x, y + h - 1, w, 1, shade(base, -0.3));
  rect(ctx, x, y, 1, h, shade(base, 0.1));
  rect(ctx, x + w - 1, y, 1, h, shade(base, -0.24));
}

function optic(ctx, x, y, r, color = P.nestEye) {
  circ(ctx, x, y, r + 1, P.nestSteelDk);
  circ(ctx, x, y, r, color);
  circ(ctx, x, y, Math.max(0.6, r * 0.45), '#ffffff');
}

function vent(ctx, x, y, w, n = 3) {
  for (let i = 0; i < n; i++) rect(ctx, x, y + i * 2, w, 1, P.nestSteelDk);
}

// --- machines --------------------------------------------------------------

function drawDrone(ctx, t, hostile = true) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, cy = H / 2 + Math.sin(t * TAU) * 1.4;
  const spin = (t * 4) % 1;
  // rotors: two blur ellipses whose width oscillates, reading as fast spin
  for (const side of [-1, 1]) {
    const rx = cx + side * 8;
    const bw = 5 + Math.abs(Math.cos(spin * TAU)) * 2.5;
    ell(ctx, rx, cy - 5, bw, 1.1, 'rgba(180,200,210,0.55)');
    rect(ctx, rx - 0.5, cy - 5, 1, 4, P.nestSteelDk);
  }
  panel(ctx, cx - 6, cy - 3, 12, 7, hostile ? P.nestDark : P.nestSteel);
  panel(ctx, cx - 9, cy - 2, 4, 3, P.nestSteelDk);
  panel(ctx, cx + 5, cy - 2, 4, 3, P.nestSteelDk);
  optic(ctx, cx, cy + 0.5, 1.8, hostile ? P.nestEye : P.cyber);
  vent(ctx, cx - 4, cy + 2, 8, 1);
  // underslung barrel
  rect(ctx, cx - 1, cy + 4, 2, 3, P.nestSteelDk);
  // rim light so it pops against dark forest
  rect(ctx, cx - 6, cy - 3, 12, 1, P.nestTealHi);
}

function drawSpiderMech(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const bob = Math.sin(t * TAU * 2) * 1.2;
  const bodyY = base - 13 + bob;
  // six legs, alternating tripod gait
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const idx = i % 3;
    const phase = ((i + (idx % 2)) % 2) ? t : (t + 0.5) % 1;
    const lift = Math.max(0, Math.sin(phase * TAU)) * 4;
    const reach = Math.cos(phase * TAU) * 3;
    const hipX = cx + side * 5, hipY = bodyY + 2 + idx * 1.4;
    const kneeX = cx + side * (11 + idx * 1.5), kneeY = bodyY - 3 - idx;
    const footX = cx + side * (14 + idx * 2.5) + reach, footY = base - 1 - lift - idx * 0.6;
    taper(ctx, hipX, hipY, kneeX, kneeY, 1.6, 1.2, P.nestSteelDk);
    taper(ctx, kneeX, kneeY, footX, footY, 1.2, 0.7, P.nestSteel);
    circ(ctx, kneeX, kneeY, 1.6, P.nestSteel);
  }
  // chassis
  panel(ctx, cx - 9, bodyY - 4, 18, 9, P.nestDark);
  panel(ctx, cx - 6, bodyY - 7, 12, 4, P.nestSteelDk);
  rect(ctx, cx - 9, bodyY - 4, 18, 1, P.nestTeal);
  // saw arms
  for (const side of [-1, 1]) {
    const sx = cx + side * 11, sy = bodyY - 1;
    rect(ctx, cx + side * 8, bodyY - 2, 4, 2, P.nestSteel);
    circ(ctx, sx, sy, 4, P.nestSteelHi);
    circ(ctx, sx, sy, 2.4, P.nestSteelDk);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + t * TAU * 3 * side;
      px(ctx, Math.round(sx + Math.cos(a) * 4.4), Math.round(sy + Math.sin(a) * 4.4), P.nestSteelHi);
    }
  }
  optic(ctx, cx, bodyY - 0.5, 2.4);
  // little chip port on the back — where you rip the upgrade out
  rect(ctx, cx - 2, bodyY - 7, 4, 2, P.cyberDim);
  px(ctx, cx, bodyY - 6, P.cyber);
}

function drawTurretWalker(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const step = Math.sin(t * TAU);
  // two heavy legs
  for (const side of [-1, 1]) {
    const ph = side > 0 ? step : -step;
    const footY = base - 1 - Math.max(0, ph) * 3;
    taper(ctx, cx + side * 3, base - 12, cx + side * 6, base - 6, 2.4, 2, P.nestSteelDk);
    taper(ctx, cx + side * 6, base - 6, cx + side * 5 + ph * 2, footY, 2, 1.6, P.nestSteel);
    rect(ctx, cx + side * 5 + ph * 2 - 3, footY - 1, 6, 2, P.nestSteelDk);
  }
  // hip block + rotating dome
  panel(ctx, cx - 7, base - 16, 14, 6, P.nestDark);
  ell(ctx, cx, base - 17, 8, 5, P.nestSteel);
  ell(ctx, cx, base - 18, 6, 3.6, P.nestSteelHi);
  const a = t * TAU;
  // three barrels around the dome
  for (let i = 0; i < 3; i++) {
    const ang = a + (i / 3) * TAU;
    const bx = cx + Math.cos(ang) * 9, by = base - 17 + Math.sin(ang) * 5;
    capsule(ctx, cx + Math.cos(ang) * 4, base - 17 + Math.sin(ang) * 2.6, bx, by, 1.4, P.nestSteelDk);
    px(ctx, Math.round(bx), Math.round(by), P.nestEye);
  }
  optic(ctx, cx, base - 17.5, 2);
  rect(ctx, cx - 2, base - 13, 4, 2, P.cyberDim);
}

function drawHarvester(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  // treads with scrolling cleats
  for (const side of [-1, 1]) {
    const tx = cx + side * 13;
    panel(ctx, tx - 5, base - 9, 10, 9, P.nestSteelDk);
    for (let i = 0; i < 5; i++) {
      const y = base - 9 + ((i * 2 + Math.floor(t * 8)) % 9);
      rect(ctx, tx - 5, y, 10, 1, P.nestSteel);
    }
    circ(ctx, tx, base - 7, 2.4, P.nestSteel);
    circ(ctx, tx, base - 2, 2.4, P.nestSteel);
  }
  // hull
  panel(ctx, cx - 14, base - 18, 28, 12, P.nestDark);
  rect(ctx, cx - 14, base - 18, 28, 1, P.nestTeal);
  vent(ctx, cx - 11, base - 15, 8, 3);
  drawNestLogo(ctx, cx + 5, base - 12, 0.55);
  // cutting head on a boom
  const swing = Math.sin(t * TAU) * 2;
  rect(ctx, cx - 6, base - 21 + swing, 12, 3, P.nestSteelDk);
  rect(ctx, cx - 10, base - 22 + swing, 6, 5, P.nestSteel);
  for (let i = 0; i < 5; i++) tri(ctx, cx - 12, base - 21 + i * 1.1 + swing, cx - 10, base - 22 + i * 1.1 + swing, cx - 10, base - 20 + i * 1.1 + swing, P.nestSteelHi);
  optic(ctx, cx + 8, base - 20 + swing * 0.5, 2.2);
  // exhaust stacks
  rect(ctx, cx + 2, base - 24, 2, 6, P.nestSteelDk);
  rect(ctx, cx + 6, base - 23, 2, 5, P.nestSteelDk);
  rect(ctx, cx - 3, base - 10, 5, 2, P.cyberDim);
}

function drawFirebomber(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, cy = H / 2 + Math.sin(t * TAU) * 1.8;
  // delta-wing body
  tri(ctx, cx - 12, cy + 4, cx + 12, cy + 4, cx, cy - 7, P.nestDark);
  tri(ctx, cx - 8, cy + 3, cx + 8, cy + 3, cx, cy - 4, P.nestSteelDk);
  panel(ctx, cx - 4, cy - 3, 8, 7, P.nestSteel);
  optic(ctx, cx, cy - 0.5, 2, P.fire3);
  // burning fuel pods
  for (const side of [-1, 1]) {
    const px1 = cx + side * 8;
    ell(ctx, px1, cy + 2, 2.4, 3.4, P.nestSteelDk);
    ell(ctx, px1, cy + 3.4, 1.6, 1.6, P.fire2);
    px(ctx, Math.round(px1), Math.round(cy + 3.4), P.fire1);
  }
  // thruster flare
  const flare = 3 + Math.abs(Math.sin(t * TAU * 3)) * 3;
  ell(ctx, cx, cy + 5 + flare * 0.4, 2.4, flare, P.fire3);
  ell(ctx, cx, cy + 4 + flare * 0.3, 1.4, flare * 0.6, P.fire1);
}

function drawSawTrap(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, cy = H / 2;
  circ(ctx, cx, cy, 6, P.nestSteel);
  circ(ctx, cx, cy, 3, P.nestSteelDk);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + t * TAU;
    tri(ctx, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6,
      cx + Math.cos(a + 0.25) * 6, cy + Math.sin(a + 0.25) * 6,
      cx + Math.cos(a + 0.12) * 9, cy + Math.sin(a + 0.12) * 9, P.nestSteelHi);
  }
  optic(ctx, cx, cy, 1.4);
}

function drawDropPod(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  panel(ctx, cx - 8, base - 18, 16, 18, P.nestDark);
  rect(ctx, cx - 8, base - 18, 16, 2, P.nestTeal);
  rect(ctx, cx - 8, base - 8, 16, 1, P.nestTealHi);
  drawNestLogo(ctx, cx, base - 12, 0.55);
  for (const side of [-1, 1]) {
    taper(ctx, cx + side * 7, base - 6, cx + side * 11, base - 1, 2, 1.4, P.nestSteelDk);
  }
  const glow = 1 + Math.abs(Math.sin(t * TAU)) * 2;
  ell(ctx, cx, base - 1, 8, glow, P.fire2);
}

/**
 * MOTHER NEST — the final Les Nest machine. It is literally the logo, built at
 * industrial scale: a steel nest cradling a cracked reactor-egg, with the
 * dead-bird figurehead bolted to the front as a trophy.
 */
function drawMotherNest(ctx, t, phase = 0) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const bob = Math.sin(t * TAU) * 2;
  const bodyY = base - 34 + bob;

  // eight anchoring legs
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const k = i % 4;
    const ph = (t + k * 0.25) % 1;
    const lift = Math.max(0, Math.sin(ph * TAU)) * 3;
    const hipX = cx + side * (8 + k * 2), hipY = bodyY + 12;
    const kneeX = cx + side * (20 + k * 4), kneeY = bodyY + 4 + k * 2;
    const footX = cx + side * (26 + k * 6), footY = base - 1 - lift;
    taper(ctx, hipX, hipY, kneeX, kneeY, 3, 2, P.nestSteelDk);
    taper(ctx, kneeX, kneeY, footX, footY, 2, 1.2, P.nestSteel);
    circ(ctx, kneeX, kneeY, 2.6, P.nestSteel);
  }

  // the woven steel nest
  ell(ctx, cx, bodyY + 8, 32, 14, P.nestDark);
  for (let i = 0; i < 22; i++) {
    const a = Math.PI + (i / 21) * Math.PI;
    line(ctx, cx + Math.cos(a) * 32, bodyY + 8 + Math.sin(a) * 13,
      cx + Math.cos(a) * 22, bodyY + 11 + Math.sin(a) * 5, i % 2 ? P.nestTeal : P.nestSteelDk);
  }
  ell(ctx, cx, bodyY + 5, 26, 10, shade(P.nestDark, -0.3));

  // reactor egg with a widening crack that leaks light
  const eggPulse = 1 + Math.sin(t * TAU * 2) * 0.06;
  ell(ctx, cx, bodyY - 4, 15 * eggPulse, 19 * eggPulse, P.eggShell);
  ell(ctx, cx - 4, bodyY - 9, 7, 8, shade(P.eggShell, 0.12));
  const crackCol = phase >= 2 ? P.fire1 : phase >= 1 ? P.fire2 : P.nestEye;
  line(ctx, cx - 10, bodyY - 12, cx - 2, bodyY - 3, crackCol);
  line(ctx, cx - 2, bodyY - 3, cx + 6, bodyY - 11, crackCol);
  line(ctx, cx - 2, bodyY - 3, cx + 1, bodyY + 8, crackCol);
  line(ctx, cx + 1, bodyY + 2, cx + 8, bodyY + 4, crackCol);
  if (phase >= 1) {
    line(ctx, cx - 6, bodyY - 8, cx - 11, bodyY - 2, crackCol);
    line(ctx, cx + 4, bodyY - 6, cx + 11, bodyY - 1, crackCol);
  }
  // core optic inside the crack
  optic(ctx, cx, bodyY - 3, 3.4, crackCol);

  // dead-bird figurehead, wired to the front of the hull
  const bx = cx, by = bodyY + 16;
  ell(ctx, bx, by, 9, 5, P.deadBird);
  ell(ctx, bx - 8, by - 1.4, 4, 3.4, shade(P.deadBird, 0.12));
  tri(ctx, bx - 11, by - 2.4, bx - 11, by - 0.4, bx - 16, by - 1.4, P.nestSteel);
  line(ctx, bx - 10, by - 3, bx - 6, by + 0.4, P.nestSteelHi);
  line(ctx, bx - 6, by - 3, bx - 10, by + 0.4, P.nestSteelHi);
  for (const s of [-1, 1]) taper(ctx, bx + s * 4, by + 2, bx + s * 12, by + 7, 3, 1, shade(P.deadBird, -0.2));

  // shoulder cannons
  for (const side of [-1, 1]) {
    const sx = cx + side * 24, sy = bodyY - 6;
    panel(ctx, sx - 5, sy - 4, 10, 9, P.nestSteelDk);
    capsule(ctx, sx, sy + 2, sx + side * 9, sy + 5, 2, P.nestSteel);
    optic(ctx, sx, sy - 1, 1.6);
  }
  // chip ports light up as it takes damage
  for (let i = -1; i <= 1; i++) {
    rect(ctx, cx + i * 8 - 2, bodyY + 12, 4, 2, phase >= 1 ? P.cyber : P.cyberDim);
  }
}

function drawRipsawPrime(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const bob = Math.sin(t * TAU * 2) * 1.6;
  const bodyY = base - 22 + bob;
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const k = i % 4;
    const ph = ((i + k) % 2) ? t : (t + 0.5) % 1;
    const lift = Math.max(0, Math.sin(ph * TAU)) * 4;
    const hipX = cx + side * 7, hipY = bodyY + 5 + k;
    const kneeX = cx + side * (15 + k * 2), kneeY = bodyY - 2 - k * 1.5;
    const footX = cx + side * (20 + k * 3.5), footY = base - 1 - lift;
    taper(ctx, hipX, hipY, kneeX, kneeY, 2, 1.4, P.nestSteelDk);
    taper(ctx, kneeX, kneeY, footX, footY, 1.4, 0.8, P.nestSteel);
  }
  panel(ctx, cx - 14, bodyY - 6, 28, 14, P.nestDark);
  rect(ctx, cx - 14, bodyY - 6, 28, 2, P.nestTeal);
  drawNestLogo(ctx, cx, bodyY + 1, 0.7);
  for (const side of [-1, 1]) {
    const sx = cx + side * 18, sy = bodyY - 2;
    circ(ctx, sx, sy, 7, P.nestSteelHi);
    circ(ctx, sx, sy, 4, P.nestSteelDk);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU + t * TAU * 4 * side;
      tri(ctx, sx + Math.cos(a) * 7, sy + Math.sin(a) * 7,
        sx + Math.cos(a + 0.2) * 7, sy + Math.sin(a + 0.2) * 7,
        sx + Math.cos(a + 0.1) * 10, sy + Math.sin(a + 0.1) * 10, P.nestSteelHi);
    }
  }
  optic(ctx, cx, bodyY - 9, 3.4);
  panel(ctx, cx - 5, bodyY - 13, 10, 5, P.nestSteelDk);
}

function drawKiln(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, cy = H / 2 + Math.sin(t * TAU) * 2.4;
  // a bloated airborne incinerator
  ell(ctx, cx, cy, 22, 14, P.nestSteelDk);
  ell(ctx, cx, cy - 3, 19, 9, P.nestSteel);
  rect(ctx, cx - 22, cy, 44, 2, P.nestDark);
  for (let i = -3; i <= 3; i++) {
    const gx = cx + i * 6;
    rect(ctx, gx - 2, cy + 4, 4, 5, P.nestSteelDk);
    const f = 2 + Math.abs(Math.sin(t * TAU * 2 + i)) * 3;
    ell(ctx, gx, cy + 9 + f * 0.4, 2, f, i % 2 ? P.fire2 : P.fire3);
    px(ctx, Math.round(gx), Math.round(cy + 9), P.fire1);
  }
  for (const side of [-1, 1]) {
    const rx = cx + side * 24;
    const bw = 6 + Math.abs(Math.cos(t * TAU * 4)) * 3;
    ell(ctx, rx, cy - 8, bw, 1.4, 'rgba(180,200,210,0.5)');
    rect(ctx, rx - 1, cy - 8, 2, 7, P.nestSteelDk);
  }
  drawNestLogo(ctx, cx, cy - 2, 0.8, { bird: '#2a2a2e' });
  optic(ctx, cx - 12, cy - 4, 2.4, P.fire3);
  optic(ctx, cx + 12, cy - 4, 2.4, P.fire3);
}

const MACHINES = {
  drone:        { w: 26, h: 22, frames: 8, fn: (c, t) => drawDrone(c, t, true) },
  droneFriend:  { w: 26, h: 22, frames: 8, fn: (c, t) => drawDrone(c, t, false) },
  spider:       { w: 44, h: 30, frames: 8, fn: drawSpiderMech },
  turret:       { w: 30, h: 26, frames: 8, fn: drawTurretWalker },
  harvester:    { w: 56, h: 34, frames: 8, fn: drawHarvester },
  firebomber:   { w: 30, h: 26, frames: 8, fn: drawFirebomber },
  sawtrap:      { w: 22, h: 22, frames: 6, fn: drawSawTrap },
  droppod:      { w: 26, h: 24, frames: 6, fn: drawDropPod },
  ripsawPrime:  { w: 60, h: 44, frames: 8, fn: drawRipsawPrime },
  kiln:         { w: 60, h: 40, frames: 8, fn: drawKiln },
  motherNest:   { w: 96, h: 72, frames: 8, fn: drawMotherNest },
};

export function machineFrames(kind, variant = 0) {
  const spec = MACHINES[kind] || MACHINES.drone;
  return getSheet(`machine:${kind}:${variant}`, () => {
    const frames = [];
    for (let i = 0; i < spec.frames; i++) {
      const ctx = surface(spec.w, spec.h);
      spec.fn(ctx, i / spec.frames, variant);
      outline(ctx, P.black);
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

export const MACHINE_NAMES = Object.keys(MACHINES);
