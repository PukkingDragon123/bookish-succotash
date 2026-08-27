// The wildlife rig.
//
// Every animal is built from a skeleton rather than a stack of ellipses: a
// spine that runs from croup to withers with the right slope for the species,
// a scapula and a femur hung off it, limbs with real joint counts, and a skull
// that is a cranium plus a muzzle with a stop between them. That is what makes
// a wolf read as a wolf next to a coyote instead of "grey dog, orange dog".
//
// Posture is the other half of it. A bear puts its whole foot on the ground, a
// wolf walks on its toes, an elk walks on one nail. The three cases give you
// completely different silhouettes from the same leg length, and getting them
// right is most of what "looks like the animal" means at this size.
//
// Faces carry an expression on top of the animation, so a hare that has seen
// you looks different from a hare that has not.

import {
  surface, px, rect, ell, circ, ellShaded, line, capsule, taper, tri,
  speckle, outline, shade, mix, getSheet,
} from './pixel.js';
import { P } from './palette.js';
import { TAU, clamp, lerp } from '../engine/math.js';
import { hash2 } from '../engine/rng.js';

// Everything is drawn at this multiple of its configured size. The camera sits
// further back than it used to, so the pixels go into detail rather than bulk.
export const DETAIL = 1.9;

// ---------------------------------------------------------------------------
//  gait
// ---------------------------------------------------------------------------

/**
 * Pose curves for one point in an animation cycle. Everything downstream reads
 * from this, so a new animation is a new case here and nothing else.
 */
export function gait(anim, t) {
  const a = t * TAU;
  const g = {
    // per-leg, ordered [frontNear, frontFar, backNear, backFar]
    leg: [0, 0, 0, 0],
    lift: [0, 0, 0, 0],
    knee: [0, 0, 0, 0],          // extra flex, for a crouch or a landing
    bob: 0, stretch: 1, squash: 1, lean: 0, roll: 0,
    headY: 0, headX: 0, headTilt: 0,
    neckStretch: 1,
    tail: 0, tailLift: 0, tailCurl: 0,
    ear: 0, earBack: 0, blink: 0, breathe: 0,
    jaw: 0, wing: 0, spine: 0,
    lowered: 0,                   // 0..1 how far the whole body is on the floor
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
      g.headY = 5.4 + Math.sin(a * 0.6) * 0.8;
      g.headTilt = 0.38;
      g.neckStretch = 1.24;
      g.bob = 0.3;
      g.jaw = Math.abs(Math.sin(a * 3)) * 0.7;
      g.tail = Math.sin(a * 0.8) * 1.4;
      break;

    // Nose down, ears working, one foreleg half-raised. What an animal that
    // has caught a scent but not yet found it actually does.
    case 'sniff':
      g.headY = 4.2 + Math.sin(a * 2.4) * 1.1;
      g.headX = Math.sin(a * 1.3) * 1.4;
      g.headTilt = 0.3;
      g.neckStretch = 1.16;
      g.ear = 1;
      g.lift[0] = Math.max(0, Math.sin(a * 0.5)) * 1.6;
      g.tail = Math.sin(a * 1.6) * 1.1;
      g.tailLift = 0.6;
      break;

    case 'eat':
      g.headY = 5.6;
      g.headTilt = 0.42;
      g.neckStretch = 1.2;
      g.jaw = (Math.sin(a * 5) * 0.5 + 0.5) * 1.4;
      g.bob = Math.sin(a * 5) * 0.35;
      g.tail = Math.sin(a * 2) * 1.6;
      g.tailLift = 1;
      break;

    case 'alert':
      g.headY = -2.6;
      g.headTilt = -0.14;
      g.neckStretch = 1.12;
      g.ear = 1;
      g.tailLift = 1.8;
      g.breathe = Math.sin(a * 2) * 0.3;
      break;

    // Ears flat, head low, weight back. Not running yet, but about to.
    case 'cower':
      g.lowered = 0.55;
      g.headY = 2.6;
      g.headTilt = 0.2;
      g.earBack = 1;
      g.tailCurl = 1;
      g.tailLift = -1.8;
      g.knee = [1, 1, 1.2, 1.2];
      g.breathe = Math.sin(a * 4) * 0.6;
      break;

    case 'sleep':
      g.lowered = 1;
      g.headY = 4.4;
      g.headTilt = 0.5;
      g.blink = 1;
      g.tailCurl = 1.4;
      g.breathe = Math.sin(a * 0.7) * 0.9;
      g.earBack = 0.6;
      break;

    // Head round to the flank, one back leg up. Reads instantly as an animal
    // at ease, which is what a bonded companion should look like in camp.
    case 'groom':
      g.headY = 3.4;
      g.headX = -3.6;
      g.headTilt = 0.9 + Math.sin(a * 4) * 0.18;
      g.lift[2] = 2.2;
      g.tailCurl = 0.8;
      g.bob = Math.sin(a * 4) * 0.3;
      break;

    case 'shake': {
      // a wet-dog shake: the body counter-rotates along its length
      const w = Math.sin(a * 6);
      g.roll = w * 0.16;
      g.headTilt = -w * 0.4;
      g.spine = w * 1.8;
      g.ear = 1;
      g.tail = w * 3;
      g.bob = Math.abs(w) * 0.6;
      break;
    }

    case 'walk': {
      // diagonal pairs, the way a quadruped actually walks
      const P0 = 0, P1 = Math.PI, P2 = Math.PI, P3 = 0;
      g.leg = [swing(P0, 2.4), swing(P1, 2.4), swing(P2, 2.2), swing(P3, 2.2)];
      g.lift = [lift(P0) * 1.6, lift(P1) * 1.6, lift(P2) * 1.4, lift(P3) * 1.4];
      g.bob = -Math.abs(Math.sin(a * 2)) * 0.9;
      g.headY = Math.sin(a * 2 - 0.7) * 0.7;
      g.tail = Math.sin(a - 1.0) * 1.2;
      g.lean = 0.4;
      break;
    }

    case 'trot': {
      // faster than a walk, same diagonal pattern, more suspension
      const P0 = 0, P1 = Math.PI, P2 = Math.PI, P3 = 0;
      g.leg = [swing(P0, 3.2), swing(P1, 3.2), swing(P2, 3.0), swing(P3, 3.0)];
      g.lift = [lift(P0) * 2.5, lift(P1) * 2.5, lift(P2) * 2.3, lift(P3) * 2.3];
      g.bob = -1 - Math.abs(Math.sin(a * 2)) * 1.2;
      g.headY = Math.sin(a * 2 - 0.5) * 0.9;
      g.tail = Math.sin(a - 0.8) * 1.6;
      g.tailLift = 0.8;
      g.lean = 0.7;
      break;
    }

    case 'run': {
      // a bound: fronts together, backs together, spine flexing between them
      const F = 0, B = Math.PI * 0.62;
      g.leg = [swing(F, 4.2), swing(F + 0.35, 4.2), swing(B, 4.4), swing(B + 0.35, 4.4)];
      g.lift = [lift(F) * 3.4, lift(F + 0.35) * 3.4, lift(B) * 3.2, lift(B + 0.35) * 3.2];
      g.bob = -2.2 - Math.sin(a * 2) * 1.6;
      g.stretch = 1 + Math.sin(a) * 0.10;
      g.squash = 1 - Math.sin(a) * 0.07;
      g.spine = Math.sin(a) * 2.2;
      g.headY = -1.4 + Math.sin(a * 2) * 0.8;
      g.headX = 1.2;
      g.neckStretch = 1.1;
      g.tail = Math.sin(a - 0.4) * 2.2;
      g.tailLift = 2.2;
      g.lean = 1.6;
      g.earBack = 0.7;
      break;
    }

    // Flat out, ears pinned, head thrust forward on the neck.
    case 'charge': {
      const F = 0, B = Math.PI * 0.55;
      g.leg = [swing(F, 5), swing(F + 0.3, 5), swing(B, 5.2), swing(B + 0.3, 5.2)];
      g.lift = [lift(F) * 3.8, lift(F + 0.3) * 3.8, lift(B) * 3.6, lift(B + 0.3) * 3.6];
      g.bob = -2.8 - Math.sin(a * 2) * 1.8;
      g.stretch = 1 + Math.sin(a) * 0.13;
      g.spine = Math.sin(a) * 2.6;
      g.headY = 1.6;
      g.headX = 3.2;
      g.neckStretch = 1.22;
      g.lean = 2.8;
      g.earBack = 1;
      g.jaw = 0.9;
      g.tailLift = 2.6;
      break;
    }

    case 'attack': {
      // wind up, then throw the whole front end at it
      const p = t < 0.35 ? -Math.sin(t / 0.35 * Math.PI) * 0.5 : Math.sin((t - 0.35) / 0.65 * Math.PI);
      g.lean = p * 4.5;
      g.headX = p * 4.2;
      g.headY = -p * 2.4;
      g.jaw = Math.max(0, p) * 1.6;
      g.lift[0] = Math.max(0, p) * 3.4;
      g.lift[1] = Math.max(0, p) * 2.6;
      g.bob = -Math.max(0, p) * 1.6;
      g.earBack = 1;
      g.tailLift = 2;
      break;
    }

    // Both front feet off the ground: bears, moose, bison do this and it is
    // the single most intimidating pose a quadruped has.
    case 'rear': {
      const p = Math.sin(clamp(t * 1.6, 0, 1) * Math.PI * 0.5);
      g.lean = -p * 3;
      g.lift[0] = p * 11;
      g.lift[1] = p * 9.5;
      g.leg[0] = p * 3;
      g.leg[1] = p * 2;
      g.headY = -p * 7;
      g.headX = p * 1.2;
      g.bob = -p * 3.2;
      g.jaw = p * 1.4;
      g.tailLift = p * 2;
      break;
    }

    case 'flinch': {
      const p = Math.sin(clamp(t * 2.4, 0, 1) * Math.PI);
      g.lean = -p * 3.4;
      g.headY = p * 2.6;
      g.headTilt = p * 0.3;
      g.earBack = 1;
      g.knee = [p * 1.4, p * 1.4, p * 1.6, p * 1.6];
      g.blink = p > 0.4 ? 1 : 0;
      g.tailCurl = p;
      break;
    }

    // Front end down, rump up, tail going. Only a canid does this.
    case 'celebrate':
      g.headY = 2.8 + Math.sin(a * 3) * 0.6;
      g.lowered = 0.28;
      g.tail = Math.sin(a * 6) * 3.4;
      g.tailLift = 2.2;
      g.ear = 1;
      g.jaw = 0.8;
      g.bob = Math.abs(Math.sin(a * 3)) * 0.8;
      break;

    case 'dead':
      g.lowered = 1.5;
      g.blink = 1;
      g.headTilt = 1.2;
      g.headY = 5;
      g.earBack = 1;
      break;

    case 'fly':
      g.wing = Math.sin(a);
      g.bob = Math.sin(a) * 1.6;
      g.headY = -0.6;
      break;

    case 'swim':
      g.bob = Math.sin(a * 2) * 0.7;
      g.lowered = 0.7;
      g.tail = Math.sin(a * 2) * 2.6;
      g.headY = -1;
      break;

    default:
      g.breathe = Math.sin(a) * 0.4;
      break;
  }
  return g;
}

// ---------------------------------------------------------------------------
//  expressions
// ---------------------------------------------------------------------------

/**
 * How the face is set. Kept separate from the gait so any expression can ride
 * on any animation: an animal can be walking and frightened at the same time.
 */
const EXPRESSIONS = {
  calm:    { lid: 0.18, brow: 0, mouth: 'closed', ear: 0, pupil: 1.0, squint: 0 },
  alert:   { lid: 0.0,  brow: 0.4, mouth: 'closed', ear: 1, pupil: 1.15, squint: 0 },
  curious: { lid: 0.05, brow: 0.2, mouth: 'ajar', ear: 1, pupil: 1.2, squint: 0, tilt: 0.16 },
  afraid:  { lid: -0.1, brow: 0.9, mouth: 'ajar', ear: -1, pupil: 1.35, squint: 0 },
  angry:   { lid: 0.35, brow: -1, mouth: 'snarl', ear: -1, pupil: 0.75, squint: 0.4 },
  hurt:    { lid: 0.55, brow: 0.6, mouth: 'open', ear: -1, pupil: 1.1, squint: 0.3 },
  happy:   { lid: 0.4,  brow: 0.1, mouth: 'pant', ear: 1, pupil: 1.05, squint: 0.5 },
  tired:   { lid: 0.7,  brow: 0.3, mouth: 'closed', ear: -0.4, pupil: 1, squint: 0.2 },
  asleep:  { lid: 1,    brow: 0.2, mouth: 'closed', ear: -0.6, pupil: 1, squint: 0 },
  dead:    { lid: 0.85, brow: 0, mouth: 'ajar', ear: -1, pupil: 1, squint: 0 },
};
export const EXPRESSION_KEYS = Object.keys(EXPRESSIONS);

function expressionOf(name) { return EXPRESSIONS[name] || EXPRESSIONS.calm; }

// ---------------------------------------------------------------------------
//  config
// ---------------------------------------------------------------------------

const DEFAULTS = {
  scale: 1,
  // withers is the shoulder height above the hip, croup the reverse. A bison
  // is +3, a hyena-shaped thing is +2, a rabbit is -2 (rump higher than
  // shoulder), a horse is 0.
  body: { len: 9, hgt: 5, chest: 1.0, haunch: 1.0, arch: 0, withers: 0, belly: 1, loin: 0.9 },
  neck: { len: 3, thick: 3, angle: -0.5, crest: 0 },
  head: {
    r: 4, muzzle: 3, muzzleH: 2, snout: 'blunt', jaw: 0, brow: 0,
    stop: 0.5,            // how sharply the muzzle steps down off the skull
    cheek: 0.5,           // zygomatic width
    eyeSet: 0.48,         // 0 = front of the face (predator), 1 = side (prey)
  },
  ears: { style: 'round', size: 2, spread: 2.6, tilt: 0 },
  legs: {
    len: 5, thick: 1.6, spread: 4, count: 4, foot: 'paw',
    posture: 'digitigrade',       // digitigrade | plantigrade | unguligrade
    hock: 0.55,                   // where the rear hock sits along the leg
  },
  tail: { style: 'thin', len: 8, thick: 1.6 },
  coat: {},
  extras: {},
  eye: { r: 1.1, color: '#171310', shine: true },
};

function merge(cfg) {
  const c = { ...DEFAULTS, ...cfg };
  for (const k of ['body', 'neck', 'head', 'ears', 'legs', 'tail', 'eye']) {
    c[k] = { ...DEFAULTS[k], ...(cfg[k] || {}) };
  }
  c.coat = { ...(cfg.coat || {}) };
  c.extras = { ...(cfg.extras || {}) };
  // legacy configs said digitigrade: true/false
  if (cfg.legs && cfg.legs.digitigrade != null && !(cfg.legs || {}).posture) {
    c.legs.posture = cfg.legs.digitigrade ? 'digitigrade' : 'unguligrade';
  }
  const co = c.coat;
  co.base = co.base || '#8a7a5e';
  co.dark = co.dark || shade(co.base, -0.35);
  co.light = co.light || shade(co.base, 0.18);
  co.hi = co.hi || shade(co.base, 0.34);
  co.belly = co.belly || shade(co.base, 0.3);
  co.muzzle = co.muzzle || co.dark;
  co.nose = co.nose || '#1a1310';
  co.accent = co.accent || co.hi;
  co.guard = co.guard || shade(co.dark, -0.12);
  c.scale = (cfg.scale || 1) * DETAIL;
  return c;
}

export function beastSize(cfgRaw) {
  const c = merge(cfgRaw);
  const s = c.scale;
  const w = Math.ceil((c.body.len * 2.3 + c.tail.len * 0.95 + c.head.r * 2 + c.head.muzzle * 2) * s) + 10;
  const antler = c.extras.antlers === 'moose' ? 17 : c.extras.antlers === 'elk' ? 14
    : c.extras.antlers === 'deer' ? 9 : c.extras.horns ? 6 : 0;
  const h = Math.ceil((c.legs.len + c.body.hgt * 2 + c.neck.len + c.head.r * 2
    + c.ears.size * 2 + antler + Math.abs(c.body.withers) + (c.extras.hump || 0)) * s) + 10;
  return { w: Math.max(16, w), h: Math.max(16, h) };
}

// ---------------------------------------------------------------------------
//  limbs
// ---------------------------------------------------------------------------

/**
 * One leg, built out of the segments the animal actually has.
 *
 * A digitigrade leg puts the heel high and the toes on the ground; an
 * unguligrade leg pushes that further so the whole foot is a single vertical
 * cannon bone ending in a hoof; a plantigrade leg lays the foot flat. Drawing
 * all three from the same joint chain is what keeps a bear from walking like
 * a deer.
 */
function drawLeg(ctx, o) {
  const {
    hipX, hipY, footX, footY, thick, col, dark, foot, posture, back, front,
    flex = 0, S = 1,
  } = o;
  const c = back ? dark : col;
  const shadowC = back ? shade(dark, -0.1) : shade(col, -0.22);
  const dropY = footY - hipY;
  const dropX = footX - hipX;

  // Joint positions along the limb. `bend` is which way the middle joint
  // points: forward for a front leg (elbow back, wrist forward), backward for
  // a rear leg (stifle forward, hock back).
  const bend = front ? 1 : -1;
  let kneeF, ankleF, kneeOut, ankleOut;
  if (posture === 'plantigrade') {
    kneeF = 0.44; ankleF = 0.80; kneeOut = 1.1 * bend; ankleOut = -0.5 * bend;
  } else if (posture === 'unguligrade') {
    kneeF = 0.34; ankleF = 0.66; kneeOut = 1.5 * bend; ankleOut = -1.6 * bend;
  } else {
    kneeF = 0.40; ankleF = 0.72; kneeOut = 1.3 * bend; ankleOut = -1.2 * bend;
  }
  kneeF += flex * 0.05;

  const kx = hipX + dropX * kneeF + kneeOut * S * (1 + flex);
  const ky = hipY + dropY * kneeF;
  const ax = hipX + dropX * ankleF + ankleOut * S * (1 + flex * 0.5);
  const ay = hipY + dropY * ankleF + flex * S * 0.6;

  // upper (humerus / femur) — the thickest part, carrying the muscle
  taper(ctx, hipX, hipY, kx, ky, thick * 1.15, thick * 0.85, c);
  // lower (radius / tibia)
  taper(ctx, kx, ky, ax, ay, thick * 0.82, thick * 0.62, c);
  // cannon / metacarpus — thin, and the giveaway for a hoofed animal
  const cannonT = posture === 'unguligrade' ? thick * 0.42 : thick * 0.58;
  taper(ctx, ax, ay, footX, footY - S * 0.6, cannonT, cannonT * 0.9, c);

  // a hint of the joint itself, so the leg has knuckles rather than being a tube
  if (thick > 1.6) {
    circ(ctx, kx, ky, thick * 0.5, back ? dark : shade(col, 0.06));
    circ(ctx, ax, ay, thick * 0.38, shadowC);
  }

  const fc = back ? shade(dark, -0.14) : shade(col, -0.42);
  if (foot === 'hoof') {
    // cloven, so it reads as a hoof and not a boot
    const w = thick * 0.62;
    rect(ctx, footX - w, footY - S * 1.9, w * 0.85, S * 2, fc);
    rect(ctx, footX + w * 0.15, footY - S * 1.9, w * 0.85, S * 2, shade(fc, 0.12));
  } else if (foot === 'flipper') {
    ell(ctx, footX, footY - S * 0.8, thick * 1.7, thick * 0.7, fc);
    for (let i = -1; i <= 1; i++) line(ctx, footX + i * thick * 0.6, footY - S, footX + i * thick * 0.8, footY, shade(fc, -0.2));
  } else if (foot === 'talon') {
    ell(ctx, footX, footY - S * 0.7, thick * 0.9, thick * 0.55, fc);
    for (let i = -1; i <= 1; i++) line(ctx, footX, footY - S * 0.5, footX + i * thick * 0.9, footY, shade(fc, -0.25));
  } else {
    // paw: a pad with toes, wider on a plantigrade foot
    const pw = posture === 'plantigrade' ? thick * 1.6 : thick * 1.15;
    ell(ctx, footX + (front ? 0.4 : 0.2), footY - S * 0.8, pw, thick * 0.8, fc);
    const toes = posture === 'plantigrade' ? 3 : 2;
    for (let i = 0; i < toes; i++) {
      const tx2 = footX - pw * 0.5 + (i + 0.5) * (pw / toes) + 0.6;
      px(ctx, Math.round(tx2), Math.round(footY - S * 0.2), shade(fc, -0.3));
    }
  }
}

// ---------------------------------------------------------------------------
//  head parts
// ---------------------------------------------------------------------------

function drawEar(ctx, x, y, style, size, dir, tilt, col, inner, dark, back) {
  const t = tilt + (back ? dir * 0.9 : 0);
  const ox = Math.sin(t) * size * (back ? 1.4 : 0.8) * -dir;
  const oy = Math.cos(t) * size * 0.2;
  const ex = x + ox, ey = y + oy;
  switch (style) {
    case 'round':
      circ(ctx, ex, ey, size, col);
      circ(ctx, ex, ey + size * 0.15, size * 0.55, inner);
      circ(ctx, ex - dir * size * 0.3, ey - size * 0.3, size * 0.3, shade(col, 0.12));
      break;
    case 'pointy':
      tri(ctx, ex - size * 0.8, ey + size * 0.9, ex + size * 0.8, ey + size * 0.9, ex + dir * size * 0.25, ey - size * 1.25, col);
      tri(ctx, ex - size * 0.42, ey + size * 0.62, ex + size * 0.42, ey + size * 0.62, ex + dir * size * 0.16, ey - size * 0.72, inner);
      line(ctx, ex - size * 0.8, ey + size * 0.9, ex + dir * size * 0.25, ey - size * 1.25, dark);
      break;
    case 'long':
      // hare: long, held back along the skull, with a dark tip
      capsule(ctx, ex, ey + size * 0.5, ex + dir * size * 0.5, ey - size * 2.6, size * 0.52, col);
      capsule(ctx, ex, ey + size * 0.3, ex + dir * size * 0.45, ey - size * 2.0, size * 0.26, inner);
      ell(ctx, ex + dir * size * 0.5, ey - size * 2.6, size * 0.5, size * 0.45, dark);
      break;
    case 'ovine':
      capsule(ctx, ex, ey, ex + dir * size * 1.8, ey + size * 0.7, size * 0.5, col);
      break;
    case 'moose':
      capsule(ctx, ex, ey, ex + dir * size * 2.1, ey + size * 0.2, size * 0.62, col);
      capsule(ctx, ex + dir * size * 0.3, ey + size * 0.05, ex + dir * size * 1.7, ey + size * 0.2, size * 0.3, inner);
      break;
    case 'tiny':
      circ(ctx, ex, ey, size * 0.75, col);
      break;
    case 'tuft':
      tri(ctx, ex - size * 0.5, ey + size * 0.7, ex + size * 0.5, ey + size * 0.7, ex + dir * size * 0.4, ey - size * 1.5, col);
      line(ctx, ex + dir * size * 0.4, ey - size * 1.5, ex + dir * size * 0.7, ey - size * 2.2, dark);
      break;
    case 'none':
    default:
      break;
  }
}

function drawAntlers(ctx, x, y, kind, col, S = 1) {
  const d = shade(col, -0.22), l = shade(col, 0.16);
  const u = S;                    // every measurement below is in sprite units
  if (kind === 'moose') {
    // Palmate: a broad blade held out sideways with points off the leading
    // edge. On a moose the antlers are wider than the animal is long.
    for (const s of [-1, 1]) {
      const bx = x + s * 2.2 * u, by = y - u;
      taper(ctx, bx, by, bx + s * 4.4 * u, by - 2.4 * u, 1.7 * u, 1.5 * u, col);
      const px1 = bx + s * 8.6 * u, py1 = by - 4.4 * u;
      ell(ctx, px1, py1, 5.8 * u, 3.6 * u, col);
      ell(ctx, px1, py1 - u, 4.6 * u, 2.1 * u, l);
      ell(ctx, px1 + s * u, py1 + u, 3.4 * u, 1.5 * u, d);
      for (let i = 0; i < 6; i++) {
        const a = -1.7 + i * 0.46;
        const tx = px1 + s * Math.cos(a) * 5.6 * u, ty = py1 + Math.sin(a) * 3.5 * u;
        line(ctx, tx, ty, tx + s * Math.cos(a) * 3 * u, ty + Math.sin(a) * 3 * u - 1.2 * u, d);
        line(ctx, tx, ty - 1, tx + s * Math.cos(a) * 2.6 * u, ty + Math.sin(a) * 2.6 * u - 1.4 * u, col);
      }
    }
  } else if (kind === 'elk') {
    // A long main beam sweeping back over the shoulders, six tines a side.
    for (const s of [-1, 1]) {
      const bx = x + s * 1.8 * u, by = y;
      let px0 = bx, py0 = by;
      for (let i = 1; i <= 5; i++) {
        const f = i / 5;
        const nx = bx + s * f * 5 * u, ny = by - f * 9 * u;
        taper(ctx, px0, py0, nx, ny, (1.9 - f) * u * 0.8, (1.7 - f) * u * 0.8, i % 2 ? col : l);
        if (i <= 4) {
          const tl = (4 - f * 1.6) * u;
          line(ctx, nx, ny, nx + s * tl * 0.55, ny - tl, d);
          line(ctx, nx + s, ny, nx + s * tl * 0.55 + s, ny - tl, col);
        }
        px0 = nx; py0 = ny;
      }
    }
  } else {
    // A young buck: one fork and a brow tine.
    for (const s of [-1, 1]) {
      const bx = x + s * 1.5 * u;
      taper(ctx, bx, y, bx + s * 2.2 * u, y - 7 * u, 1.3 * u, 0.8 * u, col);
      line(ctx, bx + s * 1.2 * u, y - 3.6 * u, bx + s * 4.2 * u, y - 6 * u, col);
      line(ctx, bx + s * 2.2 * u, y - 7 * u, bx + s * 3.8 * u, y - 9.6 * u, l);
    }
  }
}

function drawHorns(ctx, x, y, kind, col, S = 1) {
  const d = shade(col, -0.28), l = shade(col, 0.18);
  const u = S;
  if (kind === 'curl') {
    // Bighorn: a heavy spiral that comes forward past the eye and is visibly
    // ridged. The mass of it is the whole point of the animal.
    for (const s of [-1, 1]) {
      let a = -0.6, r = 4 * u;
      let px0 = x + s * 1.6 * u, py0 = y;
      for (let i = 0; i < 16; i++) {
        a += 0.42; r *= 0.94;
        const nx = x + s * (1.6 * u + Math.cos(a) * r), ny = y - u + Math.sin(a) * r * 0.82;
        taper(ctx, px0, py0, nx, ny, (2.4 - i * 0.09) * u * 0.85, (2.3 - i * 0.09) * u * 0.85,
          i % 4 < 2 ? col : l);
        px0 = nx; py0 = ny;
      }
    }
  } else if (kind === 'bison') {
    // Short, black, hooking up and in off a broad boss across the forehead.
    for (const s of [-1, 1]) {
      taper(ctx, x + s * 1.6 * u, y + 0.6 * u, x + s * 4.4 * u, y - 1.2 * u, 1.7 * u, 1.1 * u, col);
      taper(ctx, x + s * 4.4 * u, y - 1.2 * u, x + s * 5 * u, y - 3.4 * u, 1.1 * u, 0.45 * u, d);
      circ(ctx, x + s * 5 * u, y - 3.4 * u, 0.5 * u, l);
    }
    // the boss itself
    ell(ctx, x, y + 0.4 * u, 2.4 * u, 1.2 * u, d);
  } else {
    // Pronghorn: a straight spike with one forward prong.
    for (const s of [-1, 1]) {
      taper(ctx, x + s * 1.4 * u, y, x + s * 2.2 * u, y - 6.4 * u, 1.3 * u, 0.45 * u, col);
      line(ctx, x + s * 1.8 * u, y - 3 * u, x + s * 4.2 * u, y - 4.2 * u, d);
    }
  }
}

/** Eyes, brows and mouth. This is where an animal stops being a shape. */
function drawFace(ctx, o) {
  const {
    headX, headY, headR, dir, co, c, g, e, S, muzzleX, muzzleY, muzzleH,
  } = o;
  const lid = clamp(e.lid + (g.blink ? 1 : 0), 0, 1);
  // Eyes grow sublinearly with the sprite. At full scale they would be dinner
  // plates: a real animal's eye is about a tenth of its skull width, and the
  // moment you go past that it stops being wildlife and becomes a mascot.
  const er = c.eye.r * (1 + (S - 1) * 0.42);
  // Prey animals carry their eyes on the side of the skull, predators at the
  // front. That one number does more for species recognition than colour does.
  const eyeDX = headR * lerp(0.30, 0.62, c.head.eyeSet);
  const eyeY = headY - headR * 0.10 - e.squint * S * 0.3;
  // Whites only show when an animal is frightened, which is exactly when a
  // person notices them on a real animal too.
  const showSclera = e.pupil > 1.3 || !!c.eye.sclera;

  for (const side of [-1, 1]) {
    const ex = headX + side * eyeDX;
    // a soft socket so the eye is set into the skull rather than stuck on it
    ell(ctx, ex, eyeY, er * 1.35, er * 1.2, shade(co.base, -0.22));
    if (lid > 0.9) {
      line(ctx, ex - er, eyeY, ex + er, eyeY, shade(co.dark, -0.3));
      continue;
    }
    const openH = Math.max(0.7, er * (1 - lid * 0.75));
    if (showSclera) ell(ctx, ex, eyeY, er, openH, '#e6e0d4');
    const pr = Math.min(er * (showSclera ? 0.72 : 1), er) * clamp(e.pupil, 0.7, 1.15);
    ell(ctx, ex + side * er * 0.1 * dir, eyeY, pr, Math.max(0.6, Math.min(pr, openH)), c.eye.color);
    if (c.eye.shine && openH >= 1.2) px(ctx, Math.round(ex - er * 0.4), Math.round(eyeY - openH * 0.4), '#e8f2f4');
    // upper lid, which is what actually sells a squint
    if (lid > 0.12) rect(ctx, ex - er, eyeY - er, er * 2 + 1, Math.max(1, er * lid * 1.1), shade(co.base, -0.06));
  }

  // brow ridge — angled down toward the nose is anger, up is fear
  if (c.head.brow || Math.abs(e.brow) > 0.1) {
    const strength = Math.max(c.head.brow ? 0.6 : 0, Math.abs(e.brow));
    for (const side of [-1, 1]) {
      const ex = headX + side * eyeDX;
      const inner = eyeY - er - 1 - e.brow * S * 0.9;
      const outer = eyeY - er - 1 + e.brow * S * 0.9;
      const bw = 2.6 * S * strength;
      line(ctx, ex - side * bw * 0.5, side > 0 ? inner : outer, ex + side * bw * 0.5, side > 0 ? outer : inner, co.guard);
    }
  }

  // mouth, on the muzzle
  const mw = muzzleH * 0.8;
  if (e.mouth === 'snarl') {
    // lip curled off the teeth
    line(ctx, muzzleX - dir * mw, muzzleY + muzzleH * 0.35, muzzleX + dir * mw * 0.4, muzzleY + muzzleH * 0.55, shade(co.muzzle, -0.4));
    for (let i = 0; i < 3; i++) {
      px(ctx, Math.round(muzzleX - dir * mw * 0.6 + dir * i * S), Math.round(muzzleY + muzzleH * 0.42), '#f2ece0');
    }
    px(ctx, Math.round(muzzleX + dir * mw * 0.2), Math.round(muzzleY + muzzleH * 0.6), '#f2ece0');
  } else if (e.mouth === 'open' || (g.jaw > 0.4 && e.mouth !== 'closed')) {
    const jw = Math.max(muzzleH * 0.5, g.jaw * S * 1.6);
    ell(ctx, muzzleX - dir * mw * 0.2, muzzleY + muzzleH * 0.55, mw * 0.7, jw * 0.5, '#3a1a1a');
    ell(ctx, muzzleX - dir * mw * 0.2, muzzleY + muzzleH * 0.55 + jw * 0.15, mw * 0.42, jw * 0.26, '#8a3a44');
  } else if (e.mouth === 'pant') {
    ell(ctx, muzzleX - dir * mw * 0.2, muzzleY + muzzleH * 0.5, mw * 0.5, muzzleH * 0.34, '#3a1a1a');
    ell(ctx, muzzleX - dir * mw * 0.35, muzzleY + muzzleH * 0.72, mw * 0.4, muzzleH * 0.3, '#c46a72');
  } else if (e.mouth === 'ajar') {
    line(ctx, muzzleX - dir * mw * 0.7, muzzleY + muzzleH * 0.45, muzzleX + dir * mw * 0.1, muzzleY + muzzleH * 0.5, shade(co.muzzle, -0.36));
  } else {
    line(ctx, muzzleX - dir * mw * 0.6, muzzleY + muzzleH * 0.4, muzzleX + dir * mw * 0.15, muzzleY + muzzleH * 0.42, shade(co.muzzle, -0.28));
  }
}

// ---------------------------------------------------------------------------
//  the animal
// ---------------------------------------------------------------------------

export function drawBeast(ctx, cfgRaw, anim, t, view = 'front', exprName = 'calm') {
  const c = merge(cfgRaw);
  const g = gait(anim, t);
  const e = expressionOf(exprName);
  const co = c.coat, ex = c.extras;
  const S = c.scale;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2;
  const ground = H - 1;
  const back = view === 'back';
  const dir = back ? -1 : 1;

  const legLen = c.legs.len * S * (1 - g.lowered * 0.72);
  const bodyH = c.body.hgt * S * g.squash;
  const bodyL = c.body.len * S * g.stretch;
  const spineY = ground - legLen - bodyH + g.bob * S + g.lowered * S * 0.8;

  // The spine is not level. Withers above or below the croup is the single
  // biggest silhouette cue between a bison, a wolf and a hare.
  const withers = c.body.withers * S;
  const rumpX = cx - bodyL * 0.42 * dir;
  const barX = cx + g.spine * S * 0.12;
  const chestX = cx + bodyL * 0.40 * dir + g.lean * S * 0.18;
  const rumpY = spineY + Math.max(0, -withers) * 0.6;
  const chestY = spineY - Math.max(0, withers) * 0.6;
  const arch = (ex.hump ? ex.hump * S : 0) + c.body.arch * S;

  ctx.save();
  if (g.roll) {
    ctx.translate(cx, spineY);
    ctx.rotate(g.roll);
    ctx.translate(-cx, -spineY);
  }

  // ---- tail, behind everything -------------------------------------------
  if (c.tail.style !== 'none') {
    const tx = rumpX - bodyL * 0.30 * dir;
    const ty = rumpY + bodyH * 0.15;
    const segs = Math.max(4, Math.round(c.tail.len / 1.6));
    let px0 = tx, py0 = ty;
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      const curl = g.tailCurl * f * f * 5 * S;
      const bend = g.tail * f * 1.6;
      const nx = tx - dir * (c.tail.len * S * f) + bend * 1.7 + curl * dir * 0.5;
      const arcUp = c.tail.style === 'plume' ? f * 9 * S
        : c.tail.style === 'bushy' ? f * 2.2 * S : 0;
      const ny = ty - g.tailLift * S * f + Math.sin(f * 2.2 + g.tail) * 0.7 - arcUp + curl * 0.5;
      // A tail is fattest in the middle and comes to a point. Growing it
      // toward the tip turns every canid into a creature with two bodies.
      let rr;
      if (c.tail.style === 'bushy') rr = c.tail.thick * (0.5 + Math.sin(f * Math.PI) * 0.8);
      else if (c.tail.style === 'plume') rr = c.tail.thick * (0.4 + Math.sin(f * Math.PI * 0.85) * 1.35);
      else if (c.tail.style === 'flat') rr = c.tail.thick * (0.5 + f * 0.9);
      else if (c.tail.style === 'stub') rr = c.tail.thick * (1 - f * 0.5);
      else rr = c.tail.thick * (0.75 + Math.sin(f * Math.PI) * 0.3);
      const tipCol = co.tailTip && f > 0.76 ? co.tailTip : (f > 0.5 ? co.dark : co.base);
      taper(ctx, px0, py0, nx, ny, rr * S, rr * S * 0.86, tipCol);
      px0 = nx; py0 = ny;
    }
    if (c.tail.style === 'flat') {
      // beaver: a paddle, cross-hatched
      ell(ctx, px0, py0, c.tail.thick * 1.9 * S, c.tail.thick * 1.25 * S, co.dark);
      for (let i = -2; i <= 2; i++) {
        line(ctx, px0 + i * S, py0 - c.tail.thick * S, px0 + i * S, py0 + c.tail.thick * S, shade(co.dark, -0.22));
      }
    }
    if (co.tailTip && c.tail.style !== 'flat') circ(ctx, px0, py0, c.tail.thick * 0.7 * S, co.tailTip);
  }

  // ---- far legs -----------------------------------------------------------
  const hipY = rumpY + bodyH * 0.55;
  const shoulderY = chestY + bodyH * 0.5;
  const legT = c.legs.thick * S;
  const post = c.legs.posture;
  if (c.legs.count >= 4) {
    drawLeg(ctx, {
      hipX: rumpX - dir * 0.8, hipY, footX: rumpX - dir * 0.8 + g.leg[3] * S,
      footY: ground - g.lift[3] * S, thick: legT, col: co.base, dark: co.dark,
      foot: c.legs.foot, posture: post, back: true, front: false, flex: g.knee[3], S,
    });
    drawLeg(ctx, {
      hipX: chestX - dir * 0.8, hipY: shoulderY, footX: chestX - dir * 0.8 + g.leg[1] * S,
      footY: ground - g.lift[1] * S, thick: legT * 0.95, col: co.base, dark: co.dark,
      foot: c.legs.foot, posture: post, back: true, front: true, flex: g.knee[1], S,
    });
  }

  // ---- body ---------------------------------------------------------------
  const rumpR = bodyL * 0.34 * c.body.haunch;
  const chestR = bodyL * 0.34 * c.body.chest;
  // haunch, barrel, chest — three masses, each with its own volume shading
  ellShaded(ctx, rumpX, rumpY + 0.4, rumpR, bodyH * 0.98, co.base, co.light, co.dark);
  ellShaded(ctx, barX, (rumpY + chestY) / 2 + 0.2 - arch * 0.25, bodyL * 0.36 * c.body.loin, bodyH * 0.92, co.base, co.light, co.dark);
  ellShaded(ctx, chestX, chestY - arch * 0.55, chestR, bodyH * (1 + (ex.hump ? 0.12 : 0)), co.base, co.light, co.dark);
  if (arch > 0) {
    // shoulder hump: the bison and the bear read almost entirely off this
    ellShaded(ctx, chestX - dir * bodyL * 0.10, chestY - bodyH * 0.5 - arch * 0.55,
      chestR * 0.82, bodyH * 0.55 + arch * 0.6, co.base, co.light, co.dark);
  }

  // scapula: the shoulder blade sliding under the skin, visible on anything lean
  if (!back && c.body.chest >= 0.9) {
    ell(ctx, chestX - dir * chestR * 0.35, chestY - bodyH * 0.2, chestR * 0.36, bodyH * 0.48, shade(co.base, 0.06));
  }

  // countershading: dark along the spine, pale under the belly, which is how
  // almost every mammal is actually coloured
  const midY = (rumpY + chestY) / 2;
  if (!back) {
    // The pale underside hugs the belly line. Sitting it at mid-flank turns
    // every deer into a badly painted pony.
    const bw = bodyL * 0.38 * c.body.belly;
    ell(ctx, barX + dir * bodyL * 0.04, midY + bodyH * 0.74, bw, bodyH * 0.24, co.belly);
    ell(ctx, barX + dir * bodyL * 0.02, midY + bodyH * 0.86, bw * 0.72, bodyH * 0.13, shade(co.belly, 0.1));
    // and it fades up into the flank instead of stopping dead
    speckle(ctx, Math.round(barX - bw), Math.round(midY + bodyH * 0.44),
      Math.max(2, Math.round(bw * 2)), Math.max(2, Math.round(bodyH * 0.34)), co.belly, 0.34, 29);
  }
  ell(ctx, barX, midY - bodyH * 0.66 - arch * 0.3, bodyL * 0.42, bodyH * 0.24, co.hi);
  ell(ctx, barX, midY - bodyH * 0.78 - arch * 0.3, bodyL * 0.3, bodyH * 0.12, co.guard);

  // guard hairs: short strokes following the lie of the coat
  const gn = Math.max(6, Math.round(bodyL * 0.9));
  for (let i = 0; i < gn; i++) {
    const f = i / gn;
    const hx = barX - bodyL * 0.5 + f * bodyL;
    const hy = midY - bodyH * 0.3 + (hash2(i, 3, 11) - 0.5) * bodyH * 1.1;
    const len = (0.8 + hash2(i, 5, 13) * 1.4) * S;
    line(ctx, hx, hy, hx - dir * len, hy + len * 0.4, hash2(i, 7, 17) > 0.6 ? co.guard : shade(co.base, -0.08));
  }
  speckle(ctx, Math.round(barX - bodyL * 0.5), Math.round(midY + bodyH * 0.2),
    Math.max(2, Math.round(bodyL)), Math.max(2, Math.round(bodyH * 0.7)), co.dark, 0.08, 17);

  if (ex.spots) {
    for (let i = 0; i < ex.spots; i++) {
      const hx = hash2(i, 7, 3) * 2 - 1, hy = hash2(i, 11, 5) * 2 - 1;
      circ(ctx, barX + hx * bodyL * 0.42, midY + hy * bodyH * 0.5, 1 * S, co.accent);
    }
  }
  if (ex.saddle) {
    // the darker cape over the shoulders that a wolf or coyote carries
    ell(ctx, chestX - dir * bodyL * 0.08, chestY - bodyH * 0.4, chestR * 0.98, bodyH * 0.55, co.dark);
    ell(ctx, chestX - dir * bodyL * 0.08, chestY - bodyH * 0.52, chestR * 0.7, bodyH * 0.3, shade(co.dark, 0.08));
  }
  if (ex.dorsal) {
    // a stripe straight down the spine
    for (let i = 0; i < gn; i++) {
      const f = i / gn;
      const hx = barX - bodyL * 0.52 + f * bodyL * 1.04;
      const hy = lerp(rumpY, chestY, f) - bodyH * 0.72 - arch * 0.3;
      rect(ctx, hx, hy, S, S * 1.2, co.guard);
    }
  }
  if (ex.rumpPatch) {
    ell(ctx, rumpX - dir * rumpR * 0.5, rumpY + bodyH * 0.1, rumpR * 0.6, bodyH * 0.62, co.accent);
  }

  // ---- near legs ----------------------------------------------------------
  if (c.legs.count >= 4) {
    drawLeg(ctx, {
      hipX: rumpX + dir * 1.6, hipY, footX: rumpX + dir * 1.6 + g.leg[2] * S,
      footY: ground - g.lift[2] * S, thick: legT, col: co.base, dark: co.dark,
      foot: c.legs.foot, posture: post, back: false, front: false, flex: g.knee[2], S,
    });
    drawLeg(ctx, {
      hipX: chestX + dir * 1.6, hipY: shoulderY, footX: chestX + dir * 1.6 + g.leg[0] * S,
      footY: ground - g.lift[0] * S, thick: legT * 0.95, col: co.base, dark: co.dark,
      foot: c.legs.foot, posture: post, back: false, front: true, flex: g.knee[0], S,
    });
  } else {
    // birds: two legs under the middle of the body
    for (let i = 0; i < 2; i++) {
      drawLeg(ctx, {
        hipX: cx + (i ? 2 : -2) * S, hipY: midY + bodyH * 0.5,
        footX: cx + (i ? 2 : -2) * S + g.leg[i] * S, footY: ground - g.lift[i] * S,
        thick: legT, col: co.leg || co.dark, dark: co.dark, foot: c.legs.foot,
        posture: 'digitigrade', back: false, front: false, flex: g.knee[i], S,
      });
    }
  }

  if (ex.spines) {
    // hedgehog: a dome of quills over the whole back
    const n = 34;
    ell(ctx, barX, midY - bodyH * 0.34, bodyL * 0.62, bodyH * 0.74, shade(co.dark, -0.1));
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const ax = barX - bodyL * 0.64 + f * bodyL * 1.28;
      const rise = Math.sin(f * Math.PI);
      const ay = midY - bodyH * 0.5 - rise * bodyH * 0.55;
      const len = (2.2 + rise * 2.4) * S;
      const ang = -Math.PI / 2 + (f - 0.5) * 2;
      const tip = i % 3 === 0 ? co.hi : i % 3 === 1 ? co.base : co.dark;
      line(ctx, ax, ay + 1, ax + Math.cos(ang) * len, ay + Math.sin(ang) * len, tip);
      px(ctx, Math.round(ax + Math.cos(ang) * len), Math.round(ay + Math.sin(ang) * len), shade(co.hi, 0.2));
    }
  }

  // ---- neck ---------------------------------------------------------------
  const neckLen = c.neck.len * S * g.neckStretch;
  const headR = c.head.r * S;
  const headX = chestX + dir * (chestR * 0.62 + g.headX * S) + g.lean * S * 0.22;
  const headY = chestY - bodyH * 0.55 - neckLen - arch * 0.35 + g.headY * S;
  const neckBaseX = chestX + dir * chestR * 0.22;
  const neckBaseY = chestY - bodyH * 0.32 - arch * 0.4;

  taper(ctx, neckBaseX, neckBaseY, headX, headY + headR * 0.55,
    c.neck.thick * S * 0.82, c.neck.thick * S * 0.6, co.base);
  // the neck has a top line and an underline, not one flat tube
  taper(ctx, neckBaseX, neckBaseY - c.neck.thick * S * 0.3, headX, headY + headR * 0.2,
    c.neck.thick * S * 0.4, c.neck.thick * S * 0.26, co.light);
  if (c.neck.crest) {
    // the maned crest an elk or a bison carries along the top of the neck
    taper(ctx, neckBaseX, neckBaseY - c.neck.thick * S * 0.5, headX - dir * headR * 0.2, headY,
      c.neck.crest * S, c.neck.crest * S * 0.5, co.guard);
  }
  if (ex.ruff) {
    const rx = (headX + neckBaseX) / 2, ry = (headY + neckBaseY) / 2 + 1;
    ell(ctx, rx, ry, c.neck.thick * S * 1.35, c.neck.thick * S * 1.15, co.dark);
    ell(ctx, rx, ry - 0.5, c.neck.thick * S * 0.95, c.neck.thick * S * 0.72, co.base);
    for (let i = 0; i < 10; i++) {
      const a2 = (i / 10) * TAU;
      line(ctx, rx + Math.cos(a2) * c.neck.thick * S * 0.9, ry + Math.sin(a2) * c.neck.thick * S * 0.8,
        rx + Math.cos(a2) * c.neck.thick * S * 1.4, ry + Math.sin(a2) * c.neck.thick * S * 1.2, co.guard);
    }
  }
  if (ex.bell) {
    // moose dewlap
    const bx = headX - dir * headR * 0.2, by = headY + headR * 1.1;
    capsule(ctx, bx, by, bx - dir * 0.6, by + 5.5 * S, 1.5 * S, co.dark);
    ell(ctx, bx - dir * 0.6, by + 5.5 * S, 1.9 * S, 1.5 * S, co.dark);
  }

  // ---- head ---------------------------------------------------------------
  const earBackAmt = Math.max(g.earBack, e.ear < 0 ? 1 : 0);
  const earUp = (g.ear ? 0.9 : 0) + (e.ear > 0 ? 0.9 : 0);
  const earY = headY - headR * 0.72 - earUp * S * 0.5;
  drawEar(ctx, headX - c.ears.spread * S, earY, c.ears.style, c.ears.size * S, -1,
    c.ears.tilt, co.base, co.earInner || co.belly, co.dark, earBackAmt > 0.5);
  drawEar(ctx, headX + c.ears.spread * S, earY, c.ears.style, c.ears.size * S, 1,
    c.ears.tilt, co.base, co.earInner || co.belly, co.dark, earBackAmt > 0.5);

  // cranium
  ellShaded(ctx, headX, headY, headR, headR * (0.86 + c.head.jaw * 0.1), co.base, co.light, co.dark);
  // cheek / zygomatic arch — a real bump on the side of a carnivore's skull
  if (c.head.cheek > 0.2) {
    ell(ctx, headX - dir * headR * 0.35, headY + headR * 0.28,
      headR * 0.42 * c.head.cheek, headR * 0.34 * c.head.cheek, shade(co.base, 0.07));
  }

  if (ex.antlers) drawAntlers(ctx, headX, headY - headR * 0.7, ex.antlers, ex.antlerColor || P.barkDead, S);
  if (ex.horns) drawHorns(ctx, headX, headY - headR * 0.55, ex.horns, ex.hornColor || '#3a332a', S);

  if (!back) {
    // muzzle: its own mass, stepped down off the skull by the stop
    const mL = c.head.muzzle * S, mH = c.head.muzzleH * S;
    const mx = headX + dir * (headR * 0.55 + mL * 0.35);
    const my = headY + headR * (0.18 + c.head.jaw * 0.1) + c.head.stop * S * 0.5;
    let noseX = mx, noseY = my;

    if (c.head.snout === 'beak') {
      const bx = headX + dir * headR * 0.3;
      tri(ctx, bx, my - 1.3 * S, bx, my + 1.3 * S, headX + dir * (headR + mL), my, co.nose);
      tri(ctx, bx, my - 1.3 * S, bx, my - 0.2 * S, headX + dir * (headR + mL * 0.9), my - 0.4 * S, shade(co.nose, 0.22));
      line(ctx, bx, my, headX + dir * (headR + mL), my, shade(co.nose, -0.34));
      noseX = headX + dir * (headR + mL * 0.5);
    } else if (c.head.snout === 'long') {
      // moose / horse: a long deep muzzle carried below the skull line
      ellShaded(ctx, mx, my, mL * 0.92, mH * 0.74, co.muzzle, shade(co.muzzle, 0.1), shade(co.muzzle, -0.18));
      ell(ctx, mx + dir * mL * 0.52, my - 0.2, mH * 0.54, mH * 0.46, co.nose);
      noseX = mx + dir * mL * 0.52;
    } else if (c.head.snout === 'tapered') {
      // canid / mustelid: a wedge running to a small nose
      taper(ctx, headX + dir * headR * 0.25, my - 0.4, headX + dir * (headR * 0.5 + mL), my + 0.5,
        mH * 0.92, mH * 0.4, co.muzzle);
      taper(ctx, headX + dir * headR * 0.25, my - mH * 0.4, headX + dir * (headR * 0.45 + mL), my,
        mH * 0.4, mH * 0.2, shade(co.muzzle, 0.14));
      noseX = headX + dir * (headR * 0.5 + mL); noseY = my + 0.5;
      circ(ctx, noseX, noseY, mH * 0.42, co.nose);
    } else {
      ellShaded(ctx, mx, my, mL * 0.82, mH * 0.82, co.muzzle, shade(co.muzzle, 0.1), shade(co.muzzle, -0.18));
      noseX = mx + dir * mL * 0.45;
      circ(ctx, noseX, noseY - 0.1, mH * 0.48, co.nose);
    }
    // nostril
    if (c.head.snout !== 'beak') {
      px(ctx, Math.round(noseX + dir * 0.4), Math.round(noseY - 0.2), shade(co.nose, -0.5));
    }
    // Whiskers, on the animals that actually have prominent ones. Giving them
    // to a bison produced a catfish.
    if (ex.whiskers) {
      for (let i = -1; i <= 1; i++) {
        line(ctx, noseX - dir * mH * 0.2, noseY + i * 0.6, noseX + dir * (1.4 + Math.abs(i) * 0.5) * S,
          noseY + i * 1.2 * S - S * 0.4, shade(co.light, 0.28));
      }
    }

    if (ex.faceStripe) rect(ctx, headX - 0.9 * S, headY - headR, 1.8 * S, headR * 1.8, co.accent);
    if (ex.mask) rect(ctx, headX - headR * 0.95, headY - headR * 0.25, headR * 1.9, headR * 0.58, co.maskColor || P.furMask);
    if (ex.cheek) ell(ctx, headX - dir * headR * 0.35, headY + headR * 0.4, headR * 0.5, headR * 0.3, co.accent);
    if (ex.blaze) rect(ctx, headX + dir * headR * 0.1, headY - headR * 0.9, 1.4 * S, headR * 1.5, co.accent);

    drawFace(ctx, {
      headX, headY, headR, dir, co, c, g, e, S,
      muzzleX: noseX - dir * mH * 0.2, muzzleY: noseY, muzzleH: mH,
    });
  } else {
    // seen from behind: the back of the skull, and that is all
    ell(ctx, headX, headY - headR * 0.2, headR * 0.62, headR * 0.42, co.light);
    ell(ctx, headX, headY + headR * 0.3, headR * 0.5, headR * 0.3, co.dark);
  }

  // ---- wings, over everything --------------------------------------------
  if (ex.wings) {
    const wy = midY - bodyH * 0.15;
    const flap = g.wing || 0;
    for (const side of [-1, 1]) {
      const tipX = cx + side * (bodyL * 0.6 + 5 * S + Math.abs(flap) * 2 * S);
      const tipY = wy - flap * 5 * S;
      taper(ctx, cx + side * bodyL * 0.3, wy, tipX, tipY, bodyH * 0.66, 1, co.dark);
      // primaries: separate feathers at the tip, which is what makes a wing
      for (let i = 0; i < 4; i++) {
        const f = i / 3;
        line(ctx, tipX - side * f * 2 * S, tipY + f * S,
          tipX - side * (f * 2 + 2.6) * S, tipY + f * S + 3.2 * S, i % 2 ? co.base : co.dark);
      }
      if (co.wingBar) line(ctx, cx + side * bodyL * 0.34, wy + 1, tipX - side * 1.6, tipY + 1.4, co.wingBar);
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
//  bakery
// ---------------------------------------------------------------------------

export function beastFrames(key, cfg, anim, view = 'front', frames = 8, expr = 'calm') {
  return getSheet(`beast:${key}:${anim}:${view}:${frames}:${expr}`, () => {
    const { w, h } = beastSize(cfg);
    const out = [];
    for (let i = 0; i < frames; i++) {
      const ctx = surface(w, h);
      drawBeast(ctx, cfg, anim, i / frames, view, expr);
      outline(ctx, P.black);
      out.push(ctx.canvas);
    }
    return out;
  });
}
