// One parameterised quadruped/biped rig draws every living thing in the game:
// the player ferret, ten NPCs, the wildlife, and the poachers. Species are
// config objects; animation comes from analytic pose curves with deliberate
// lag between body, head and tail so movement reads as fluid rather than
// mechanical. Frames are baked once into canvases and cached.

import { surface, ell, ellShaded, circ, rect, px, line, capsule, taper, tri, speckle, outline, shade, getSheet } from './pixel.js';
import { P } from './palette.js';
import { TAU, clamp } from '../engine/math.js';
import { hash2 } from '../engine/rng.js';

// --- pose curves -----------------------------------------------------------
// Each animation is a pure function of phase -> a small bag of numbers. Adding
// phase offsets between parts is what gives the rig its follow-through.
function poseFor(anim, t) {
  const a = t * TAU;
  const p = {
    bob: 0, lean: 0, legA: 0, legB: 0, tail: 0, tailLift: 0, head: 0, headTilt: 0,
    sqx: 1, sqy: 1, ear: 0, blink: 0, lunge: 0, arm: 0, wing: 0, crouch: 0,
  };
  switch (anim) {
    case 'idle':
      p.bob = Math.sin(a) * 0.6;
      p.sqy = 1 + Math.sin(a) * 0.035;
      p.sqx = 1 - Math.sin(a) * 0.025;
      p.tail = Math.sin(a * 0.75 - 0.7) * 0.5;
      p.tailLift = Math.sin(a * 0.75) * 1.2;
      p.head = Math.sin(a - 0.9) * 0.5;
      p.headTilt = Math.sin(a * 0.5) * 0.09;
      p.ear = t > 0.72 && t < 0.82 ? 1 : 0;
      p.blink = t > 0.88 ? 1 : 0;
      break;
    // Hammering, sawing, hauling a beam into place. Used whenever someone is
    // building the camp for you, which in the opening hour is most of the time.
    case 'work': {
      const swing = Math.sin(a * 2);
      p.arm = 3.4 + swing * 4.6;
      p.lean = 1.2 + Math.max(0, swing) * 0.9;
      p.bob = Math.abs(swing) * -0.8;
      p.head = 0.9 + swing * 0.5;
      p.headTilt = 0.24;
      p.sqy = 1 - Math.max(0, swing) * 0.06;
      p.tail = Math.sin(a) * 0.9;
      p.crouch = 1.2;
      break;
    }

    // Gesturing while they speak. Small, but a static NPC talking at you reads
    // as a vending machine and one that moves reads as a person.
    case 'talk':
      p.bob = Math.sin(a * 2) * 0.5;
      p.arm = Math.sin(a * 3) * 2.6 + 1.4;
      p.head = Math.sin(a * 2.4) * 0.7;
      p.headTilt = Math.sin(a * 1.6) * 0.14;
      p.tail = Math.sin(a * 1.2) * 1.1;
      p.tailLift = 0.8;
      p.ear = t > 0.5 && t < 0.62 ? 1 : 0;
      break;

    case 'wave':
      p.arm = 5 + Math.sin(a * 4) * 3.4;
      p.lean = -0.6;
      p.bob = Math.sin(a * 2) * 0.6;
      p.head = -0.6;
      p.ear = 1;
      break;

    // Hauling: leaning into the weight, short choppy steps.
    case 'carry':
      p.legA = Math.sin(a) * 0.7;
      p.legB = Math.sin(a + Math.PI) * 0.7;
      p.bob = Math.abs(Math.sin(a)) * -0.7;
      p.lean = 1.8;
      p.crouch = 1.6;
      p.arm = 4.2;
      p.head = 1.2;
      p.headTilt = 0.16;
      break;

    case 'cheer':
      p.arm = 6.4 + Math.sin(a * 5) * 2;
      p.bob = -Math.abs(Math.sin(a * 3)) * 2.6;
      p.head = -1.4;
      p.tail = Math.sin(a * 6) * 2.4;
      p.tailLift = 2.4;
      p.ear = 1;
      break;

    // Down on one knee behind cover, gun up. What a recruit does in a wave.
    case 'aim':
      p.crouch = 3.4;
      p.lean = 1.4;
      p.arm = 5.6;
      p.head = 0.4;
      p.bob = Math.sin(a * 2) * 0.25;
      p.sqy = 0.94;
      break;

    case 'sleep':
      p.crouch = 5;
      p.sqy = 0.6;
      p.sqx = 1.24;
      p.head = 3.4;
      p.headTilt = 0.5;
      p.blink = 1;
      p.bob = Math.sin(a * 0.6) * 0.5;
      p.tail = 1.6;
      break;

    // A sharp recoil away from whatever just hit you.
    case 'flinch': {
      const q = Math.sin(Math.min(1, t * 2.2) * Math.PI);
      p.lean = -q * 3.2;
      p.head = q * 2;
      p.crouch = q * 2.4;
      p.blink = q > 0.4 ? 1 : 0;
      p.arm = -q * 2;
      break;
    }

    case 'walk':
      p.legA = Math.sin(a);
      p.legB = Math.sin(a + Math.PI);
      p.bob = Math.abs(Math.sin(a)) * -1.1;
      p.sqy = 1 + Math.abs(Math.sin(a)) * 0.05;
      p.tail = Math.sin(a * 0.5 - 1.1) * 1.1;
      p.tailLift = Math.sin(a - 0.8) * 1.1;
      p.head = Math.sin(a - 0.6) * 0.8;
      p.lean = 0.4;
      p.arm = Math.sin(a) * 2.2;
      break;
    case 'run':
      p.legA = Math.sin(a) * 1.5;
      p.legB = Math.sin(a + Math.PI) * 1.5;
      p.bob = -1.6 - Math.sin(a * 2) * 1.5;
      p.sqy = 1 + Math.sin(a * 2) * 0.09;
      p.sqx = 1 - Math.sin(a * 2) * 0.06;
      p.tail = Math.sin(a * 0.5 - 1.2) * 1.6 + 1.2;
      p.tailLift = 2.4 + Math.sin(a - 0.7) * 1.4;
      p.head = Math.sin(a - 0.5) * 1.2;
      p.lean = 1.6;
      p.arm = Math.sin(a) * 3.4;
      break;
    case 'attack': {
      // wind up over the first 40%, snap forward, settle
      const w = t < 0.4 ? -t / 0.4 : (t < 0.6 ? (t - 0.4) / 0.2 * 2.4 - 1 : 1.4 - (t - 0.6) / 0.4 * 1.4);
      p.lunge = w * 3.2;
      p.lean = w * 2.2;
      p.sqx = 1 + Math.max(0, w) * 0.09;
      p.sqy = 1 - Math.max(0, w) * 0.07;
      p.arm = w * 5;
      p.tail = -w * 1.6;
      p.head = w * 1.2;
      break;
    }
    case 'hurt':
      p.lean = -2.2;
      p.bob = 1;
      p.sqx = 1.14; p.sqy = 0.88;
      p.ear = 1;
      p.blink = 1;
      p.tail = -2;
      break;
    case 'sit':
      p.crouch = 3;
      p.bob = Math.sin(a) * 0.4;
      p.tail = Math.sin(a * 0.6) * 1.4;
      p.head = Math.sin(a * 0.8) * 0.4;
      break;
    case 'fly':
      p.wing = Math.sin(a * 2);
      p.bob = Math.sin(a * 2) * 1.8;
      p.tail = Math.sin(a) * 0.8;
      break;
    case 'swim':
      p.bob = Math.sin(a) * 0.8;
      p.tail = Math.sin(a * 2) * 2.4;
      break;
    case 'dead':
      p.crouch = 6; p.sqx = 1.3; p.sqy = 0.5; p.blink = 1; p.ear = 1;
      break;
    default:
      break;
  }
  return p;
}

// Default species config; every field can be overridden per creature.
const BASE = {
  bodyW: 7, bodyH: 4.4, headR: 4, neck: 3.4, snout: 2.2, snoutDrop: 1,
  ears: 'round', earSize: 2, earSpread: 2.4,
  tail: 'thin', tailLen: 8, tailR: 1.6,
  legs: 4, legLen: 4, legR: 1.4, legSpread: 3.6,
  hump: 0, antlers: 'none', quills: false, wings: false, beak: false,
  mask: false, cyberEye: false, stitches: null, spots: 0, stripes: 0,
  eyeR: 1, biped: false, chunky: 0,
  colors: {
    body: P.furTan, light: null, dark: null, belly: P.furBelly,
    ear: P.nose, eye: '#171310', nose: P.nose, foot: null, accent: null,
  },
  gear: null,
  scale: 1,
};

// How a face is set. Rides on top of whatever the body is doing, so a ferret
// can be sprinting and furious, or standing still and pleased with itself.
const FACE = {
  calm:    { lid: 0.15, brow: 0, mouth: 'closed', ear: 0, squint: 0 },
  alert:   { lid: 0,    brow: 0.5, mouth: 'closed', ear: 1, squint: 0 },
  curious: { lid: 0,    brow: 0.3, mouth: 'ajar', ear: 1, squint: 0 },
  happy:   { lid: 0.45, brow: 0.1, mouth: 'smile', ear: 1, squint: 0.5 },
  angry:   { lid: 0.4,  brow: -1, mouth: 'snarl', ear: -1, squint: 0.4 },
  afraid:  { lid: -0.1, brow: 0.9, mouth: 'ajar', ear: -1, squint: 0 },
  hurt:    { lid: 0.6,  brow: 0.6, mouth: 'open', ear: -1, squint: 0.35 },
  focused: { lid: 0.35, brow: -0.5, mouth: 'closed', ear: 0, squint: 0.2 },
  sad:     { lid: 0.5,  brow: 0.7, mouth: 'frown', ear: -1, squint: 0.1 },
  talk:    { lid: 0.1,  brow: 0.2, mouth: 'talk', ear: 0, squint: 0 },
  dead:    { lid: 0.9,  brow: 0, mouth: 'ajar', ear: -1, squint: 0 },
};
export const FACE_KEYS = Object.keys(FACE);

// Everything this rig draws is scaled up by this much. The camera pulled back
// when the wildlife got its detail pass, and the player and the NPCs have to
// come with it or the ferret ends up a thumbnail in its own game.
export const DETAIL = 1.5;

// Geometry fields, as opposed to flags and colours. Only these get scaled.
const DIMS = [
  'bodyW', 'bodyH', 'headR', 'neck', 'snout', 'snoutDrop',
  'earSize', 'earSpread', 'tailLen', 'tailR',
  'legLen', 'legR', 'legSpread', 'hump',
];

function resolve(cfg) {
  const c = Object.assign({}, BASE, cfg);
  const k = DETAIL * (cfg.scale || 1);
  for (const d of DIMS) c[d] = (c[d] || 0) * k;
  // Eyes grow more slowly than the skull, or every face turns into a doll's.
  c.eyeR = (c.eyeR || 1) * (1 + (k - 1) * 0.5);
  if (c.stitches) c.stitches = c.stitches.map(([a, b]) => [a * k, b * k]);
  c._k = k;
  c.colors = Object.assign({}, BASE.colors, cfg.colors || {});
  const col = c.colors;
  if (!col.light) col.light = shade(col.body, 0.16);
  if (!col.dark) col.dark = shade(col.body, -0.3);
  if (!col.foot) col.foot = shade(col.body, -0.42);
  if (!col.accent) col.accent = col.dark;
  return c;
}

/** Canvas size that comfortably fits this species in every pose. */
export function critterSize(cfg) {
  const c = resolve(cfg);
  const w = Math.ceil((Math.max(c.bodyW * 2 + c.tailLen * 0.9, c.headR * 2 + c.snout * 2, c.legSpread * 2 + 4)) + 10);
  const h = Math.ceil(c.legLen + c.bodyH * 2 + c.neck + c.headR * 2 + c.earSize * 2 + (c.antlers !== 'none' ? 9 : 0) + 8);
  return { w: Math.max(12, w), h: Math.max(14, h) };
}

/**
 * Draw one creature frame into ctx. Origin is bottom-centre of the canvas
 * (the feet), so world drawing can just anchor by ground position.
 */
export function drawCritter(ctx, cfgRaw, anim, t, view = 'front', exprName = 'calm') {
  const face = FACE[exprName] || FACE.calm;
  const c = resolve(cfgRaw);
  const col = c.colors;
  const p = poseFor(anim, t);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2;
  const groundY = H - 1;
  const back = view === 'back';

  const legLen = c.legLen;
  const bodyCy = groundY - legLen - c.bodyH + p.bob - p.crouch;
  const bodyW = c.bodyW * p.sqx;
  const bodyH = c.bodyH * p.sqy;
  const dir = back ? -1 : 1;

  // ---------------------------------------------------------------- tail
  if (c.tail !== 'none') {
    const tx = cx - (c.bodyW * 0.75) * dir;
    const ty = bodyCy + 0.5;
    const swing = p.tail;
    const lift = p.tailLift;
    const segs = Math.max(3, Math.round(c.tailLen / 2.2));
    let px0 = tx, py0 = ty;
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      // Each segment lags a little further behind: classic follow-through.
      const bend = swing * f * 1.5;
      const nx = tx - dir * (c.tailLen * f) + bend * 1.6;
      const ny = ty - lift * f - (c.tail === 'fan' ? f * 2 : 0) + Math.sin(f * 2.2 + swing) * 0.6;
      const r = c.tail === 'bushy' ? c.tailR * (1 + f * 0.7)
        : c.tail === 'stub' ? c.tailR * (1 - f * 0.5)
          : c.tailR * (1 - f * 0.35);
      const tipTail = col.tailTip && f > 0.62;
      capsule(ctx, px0, py0, nx, ny, Math.max(0.6, r), tipTail ? col.tailTip : (f > 0.5 ? col.dark : col.body));
      px0 = nx; py0 = ny;
    }
    if (c.tail === 'fan') {
      for (let k = -2; k <= 2; k++) {
        line(ctx, px0, py0, px0 - dir * 3 + k * 1.2, py0 - 3 + Math.abs(k) * 0.6, col.dark);
      }
    }
  }

  // ------------------------------------------------------------ back legs
  const drawLeg = (ox, phase, front) => {
    const hipX = cx + ox;
    const hipY = bodyCy + bodyH * 0.55;
    const swing = phase * 2.2;
    const footX = hipX + swing + p.lean * 0.4;
    const footY = groundY - Math.max(0, phase) * 1.6 - p.crouch * 0.4;
    const kneeX = (hipX + footX) / 2 + (front ? 0.6 : -0.6);
    const kneeY = (hipY + footY) / 2 + 0.6;
    const lc = front ? col.body : col.dark;
    taper(ctx, hipX, hipY, kneeX, kneeY, c.legR, c.legR * 0.85, lc);
    taper(ctx, kneeX, kneeY, footX, footY, c.legR * 0.85, c.legR * 0.7, lc);
    circ(ctx, footX, footY - 0.4, Math.max(1, c.legR * 0.9), col.foot);
  };

  if (c.legs >= 4) {
    drawLeg(-c.legSpread * dir, p.legB, false);
    drawLeg(c.legSpread * 0.55 * dir, p.legA, false);
  } else if (!c.biped) {
    drawLeg(-c.legSpread * 0.5, p.legB, false);
  }

  // ---------------------------------------------------------------- body
  // Two overlapping masses (haunch + chest) read as a real quadruped from 3/4.
  const haunchX = cx - c.bodyW * 0.42 * dir;
  const chestX = cx + c.bodyW * 0.38 * dir;
  if (c.hump) {
    ellShaded(ctx, haunchX, bodyCy - c.hump * 0.5, bodyW * 0.72, bodyH * (1 + c.hump * 0.16), col.body, col.light, col.dark);
  } else {
    ellShaded(ctx, haunchX, bodyCy + 0.4, bodyW * 0.66, bodyH * 0.95, col.body, col.light, col.dark);
  }
  ellShaded(ctx, chestX, bodyCy + p.lean * 0.2, bodyW * 0.7, bodyH, col.body, col.light, col.dark);

  if (!back) {
    ell(ctx, chestX, bodyCy + bodyH * 0.42, bodyW * 0.44, bodyH * 0.42, col.belly);
  } else {
    // A dorsal stripe of shadow gives the back view some form.
    ell(ctx, cx, bodyCy - bodyH * 0.3, bodyW * 0.5, bodyH * 0.4, col.light);
  }

  if (c.spots) {
    for (let i = 0; i < c.spots; i++) {
      const hx = hash2(i, 7, 3) * 2 - 1, hy = hash2(i, 11, 5) * 2 - 1;
      circ(ctx, cx + hx * bodyW * 0.6, bodyCy + hy * bodyH * 0.55, 1, col.accent);
    }
  }
  if (c.stripes) {
    for (let i = 0; i < c.stripes; i++) {
      const fx = cx - bodyW * 0.7 + (i + 0.5) * (bodyW * 1.4 / c.stripes);
      rect(ctx, fx, bodyCy - bodyH * 0.7, 1, bodyH * 1.2, col.accent);
    }
  }
  if (c.quills) {
    for (let i = -4; i <= 4; i++) {
      const qx = cx + i * 1.3;
      const qy = bodyCy - bodyH * 0.85 - Math.cos(i * 0.4) * 1.2;
      line(ctx, qx, qy, qx + i * 0.5 - dir * 1.5, qy - 3.4, col.accent);
    }
  }

  // ----------------------------------------------------------- front legs
  if (c.legs >= 4) {
    drawLeg(-c.legSpread * 0.2 * dir, p.legA, true);
    drawLeg(c.legSpread * 0.95 * dir, p.legB, true);
  } else if (c.biped) {
    drawLeg(-2.2, p.legA, true);
    drawLeg(2.2, p.legB, true);
    // arms swing opposite the legs
    const shY = bodyCy - bodyH * 0.3;
    taper(ctx, cx - bodyW * 0.7, shY, cx - bodyW * 0.9 - p.arm * 0.5, shY + 4 + Math.abs(p.arm) * 0.2, c.legR, c.legR * 0.8, col.dark);
    taper(ctx, cx + bodyW * 0.7, shY, cx + bodyW * 0.9 + p.arm * 0.5, shY + 4 + Math.abs(p.arm) * 0.2, c.legR, c.legR * 0.8, col.body);
  } else {
    drawLeg(c.legSpread * 0.5, p.legA, true);
  }

  // ---------------------------------------------------------------- head
  const headX = cx + (c.bodyW * 0.55 + p.lunge) * dir + p.head * 0.5;
  const headY = bodyCy - bodyH - c.neck + p.head * 0.5 - p.lean * 0.2;

  // neck
  taper(ctx, chestX, bodyCy - bodyH * 0.4, headX, headY + c.headR * 0.6, c.headR * 0.62, c.headR * 0.7, col.body);

  // ears behind the skull
  const earOut = p.ear ? 1.5 : 0;
  const drawEar = (side) => {
    const ex = headX + side * c.earSpread;
    const ey = headY - c.headR * 0.72 - c.earSize * 0.3;
    switch (c.ears) {
      case 'round':
        circ(ctx, ex, ey - earOut * 0.5, c.earSize, col.body);
        circ(ctx, ex, ey + 0.2 - earOut * 0.5, c.earSize * 0.5, col.ear);
        break;
      case 'pointy':
        tri(ctx, ex - c.earSize, ey + c.earSize, ex + c.earSize, ey + c.earSize, ex + side * (0.6 + earOut), ey - c.earSize * 1.7, col.body);
        tri(ctx, ex - c.earSize * 0.5, ey + c.earSize * 0.6, ex + c.earSize * 0.5, ey + c.earSize * 0.6, ex + side * 0.4, ey - c.earSize * 0.9, col.ear);
        break;
      case 'long':
        capsule(ctx, ex, ey + c.earSize, ex + side * (1 + earOut), ey - c.earSize * 2.4, c.earSize * 0.62, col.body);
        capsule(ctx, ex, ey + c.earSize * 0.5, ex + side * (0.7 + earOut), ey - c.earSize * 1.7, c.earSize * 0.3, col.ear);
        break;
      case 'tuft':
        line(ctx, ex, ey, ex + side * 2, ey - c.earSize * 2, col.dark);
        circ(ctx, ex, ey, c.earSize * 0.8, col.body);
        break;
      case 'horn':
        taper(ctx, ex, ey, ex + side * 2.6, ey - c.earSize * 1.6, c.earSize * 0.7, 0.6, col.accent);
        break;
      case 'none':
      default: break;
    }
  };
  drawEar(-1); drawEar(1);

  if (c.antlers !== 'none') {
    const beamLen = c.antlers === 'elk' ? 10 : 6;
    for (const side of [-1, 1]) {
      const bx = headX + side * c.headR * 0.55, by = headY - c.headR * 0.8;
      line(ctx, bx, by, bx + side * 3, by - beamLen, P.barkDead);
      line(ctx, bx + side * 1, by - beamLen * 0.4, bx + side * 4.5, by - beamLen * 0.55, P.barkDead);
      line(ctx, bx + side * 2, by - beamLen * 0.7, bx + side * 5, by - beamLen * 0.95, P.barkDead);
      if (c.antlers === 'elk') line(ctx, bx + side * 3, by - beamLen, bx + side * 5.5, by - beamLen - 2.5, P.barkDead);
    }
  }

  // skull
  ellShaded(ctx, headX, headY, c.headR, c.headR * 0.92, col.body, col.light, col.dark);

  if (!back) {
    // muzzle / beak
    if (c.beak) {
      tri(ctx, headX + dir * c.headR * 0.3, headY - 0.6, headX + dir * c.headR * 0.3, headY + 1.6,
        headX + dir * (c.headR + c.snout), headY + 0.4, col.nose);
    } else if (c.snout > 0) {
      ellShaded(ctx, headX + dir * (c.headR * 0.55), headY + c.snoutDrop, c.snout, c.snout * 0.72,
        col.muzzle || col.belly, null, shade(col.muzzle || col.belly, -0.14));
      circ(ctx, headX + dir * (c.headR * 0.5 + c.snout * 0.75), headY + c.snoutDrop - 0.2, 0.9, col.nose);
    }

    // bandit mask (black-footed ferret, raccoon-likes)
    if (c.mask) {
      rect(ctx, headX - c.headR * 0.95, headY - c.headR * 0.28, c.headR * 1.9, c.headR * 0.62, col.maskColor || P.furMask);
    }

    // eyes
    const eyeY = headY - c.headR * 0.05 - face.squint * 0.4;
    const eyeDX = c.headR * 0.5;
    const lid = clamp(face.lid + (p.blink ? 1 : 0), 0, 1);
    const shut = lid > 0.88;

    // the organic eye
    if (shut) {
      // a closed lid is a curve, not a flat bar: it is the difference between
      // asleep and switched off
      line(ctx, headX - eyeDX - c.eyeR, eyeY, headX - eyeDX, eyeY + 0.8, col.dark);
      line(ctx, headX - eyeDX, eyeY + 0.8, headX - eyeDX + c.eyeR, eyeY, col.dark);
    } else {
      const openH = Math.max(0.8, c.eyeR * (1 - lid * 0.72));
      ell(ctx, headX - eyeDX, eyeY, c.eyeR, openH, col.eye);
      if (c.eyeR > 1 && openH > 1) px(ctx, Math.round(headX - eyeDX - 0.4), Math.round(eyeY - openH * 0.4), P.white);
      if (lid > 0.12) rect(ctx, headX - eyeDX - c.eyeR, eyeY - c.eyeR, c.eyeR * 2 + 1, Math.max(1, c.eyeR * lid), col.body);
    }

    // the other one
    if (c.cyberEye) {
      // The lab's parting gift. It has no eyelid, so it stares straight
      // through a blink and through every expression on the face.
      rect(ctx, headX + eyeDX - c.eyeR - 1, eyeY - c.eyeR - 1, c.eyeR * 2 + 3, c.eyeR * 2 + 3, P.nestSteelDk);
      rect(ctx, headX + eyeDX - c.eyeR, eyeY - c.eyeR, c.eyeR * 2 + 1, c.eyeR * 2 + 1, P.cyberDim);
      circ(ctx, headX + eyeDX, eyeY, Math.max(0.9, c.eyeR * 0.8), P.cyber);
      px(ctx, Math.round(headX + eyeDX), Math.round(eyeY), P.cyberHot);
      px(ctx, Math.round(headX + eyeDX + c.eyeR + 1), Math.round(eyeY - c.eyeR - 1), P.cyberHot);
    } else if (shut) {
      line(ctx, headX + eyeDX - c.eyeR, eyeY, headX + eyeDX, eyeY + 0.8, col.dark);
      line(ctx, headX + eyeDX, eyeY + 0.8, headX + eyeDX + c.eyeR, eyeY, col.dark);
    } else {
      const openH = Math.max(0.8, c.eyeR * (1 - lid * 0.72));
      ell(ctx, headX + eyeDX, eyeY, c.eyeR, openH, col.eye);
      if (c.eyeR > 1 && openH > 1) px(ctx, Math.round(headX + eyeDX - 0.4), Math.round(eyeY - openH * 0.4), P.white);
      if (lid > 0.12) rect(ctx, headX + eyeDX - c.eyeR, eyeY - c.eyeR, c.eyeR * 2 + 1, Math.max(1, c.eyeR * lid), col.body);
    }

    // Brows. Angled in toward the nose is anger, up and out is fear, and that
    // one pair of pixels does most of the emotional work on a face this size.
    const browAmt = face.brow || (c.brow ? 0.2 : 0);
    if (Math.abs(browAmt) > 0.05 || c.brow) {
      const base = eyeY - c.eyeR - 1 + (c.brow || 0);
      for (const side of [-1, 1]) {
        const ex = headX + side * eyeDX;
        const inner = base - browAmt;
        const outer = base + browAmt;
        line(ctx, ex - 1.5, side > 0 ? inner : outer, ex + 1.5, side > 0 ? outer : inner, col.dark);
      }
    }

    // Mouth, on the snout.
    const mx = headX + dir * (c.headR * 0.42 + c.snout * 0.5);
    const my = headY + c.snoutDrop + c.headR * 0.34;
    if (face.mouth === 'snarl') {
      line(ctx, mx - dir * 2.4, my, mx + dir * 0.6, my + 0.8, col.dark);
      px(ctx, Math.round(mx - dir * 1.6), Math.round(my - 0.6), P.white);
      px(ctx, Math.round(mx - dir * 0.4), Math.round(my - 0.6), P.white);
    } else if (face.mouth === 'open') {
      ell(ctx, mx - dir * 0.8, my + 0.4, 1.5, 1.2, '#3a1a1a');
    } else if (face.mouth === 'talk') {
      const o = 0.6 + Math.abs(Math.sin(t * TAU * 3)) * 1.1;
      ell(ctx, mx - dir * 0.8, my + 0.3, 1.3, o, '#3a1a1a');
    } else if (face.mouth === 'smile') {
      line(ctx, mx - dir * 2.2, my - 0.4, mx - dir * 0.8, my + 0.6, col.dark);
      line(ctx, mx - dir * 0.8, my + 0.6, mx + dir * 0.6, my - 0.2, col.dark);
    } else if (face.mouth === 'frown') {
      line(ctx, mx - dir * 2.2, my + 0.6, mx - dir * 0.8, my - 0.3, col.dark);
      line(ctx, mx - dir * 0.8, my - 0.3, mx + dir * 0.6, my + 0.5, col.dark);
    } else if (face.mouth === 'ajar') {
      line(ctx, mx - dir * 1.8, my, mx + dir * 0.4, my + 0.4, col.dark);
    } else {
      line(ctx, mx - dir * 1.6, my, mx + dir * 0.2, my + 0.2, col.dark);
    }
  } else {
    // back of the head: just the skull shading plus ear backs
    ell(ctx, headX, headY - c.headR * 0.2, c.headR * 0.6, c.headR * 0.42, col.light);
  }

  // stitches — the lab left its seams behind
  if (c.stitches) {
    for (const s of c.stitches) {
      const sx = headX + s[0] * dir, sy = headY + s[1];
      line(ctx, sx - 2, sy, sx + 2, sy, P.stitch);
      for (let i = -2; i <= 2; i += 2) line(ctx, sx + i, sy - 1.2, sx + i, sy + 1.2, P.stitch);
    }
  }
  if (c.bodyStitch) {
    const sx = cx - c.bodyW * 0.2 * dir, sy = bodyCy - 0.5;
    line(ctx, sx, sy - 3, sx, sy + 3, P.stitch);
    for (let i = -3; i <= 3; i += 2) line(ctx, sx - 1.4, sy + i, sx + 1.4, sy + i, P.stitch);
  }

  // wings (birds) — drawn last so they overlap the body
  if (c.wings) {
    const wy = bodyCy - bodyH * 0.2;
    const flap = p.wing;
    for (const side of [-1, 1]) {
      const tipX = cx + side * (bodyW + 5 + Math.abs(flap) * 1.5);
      const tipY = wy - flap * 5;
      taper(ctx, cx + side * bodyW * 0.5, wy, tipX, tipY, c.bodyH * 0.7, 1, col.dark);
      line(ctx, tipX, tipY, tipX - side * 2, tipY + 3, col.body);
    }
  }

  // gear (hats, vests, goggles, packs) — NPC personality lives here
  if (c.gear) drawGear(ctx, c, p, { cx, bodyCy, bodyW, bodyH, headX, headY, dir, back, groundY });

  return ctx;
}

function drawGear(ctx, c, p, m) {
  const g = c.gear;
  const { headX, headY, cx, bodyCy, bodyW, bodyH, dir, back } = m;
  const r = c.headR;
  if (g.scarf) {
    rect(ctx, headX - r * 0.9, headY + r * 0.75, r * 1.8, 2, g.scarf);
    rect(ctx, headX - r * 0.9 - dir * 2, headY + r * 0.75 + 1, 2, 4 + p.arm * 0.3, g.scarf);
  }
  if (g.vest) {
    ell(ctx, cx + c.bodyW * 0.3 * dir, bodyCy + 0.4, bodyW * 0.62, bodyH * 0.8, g.vest);
    if (g.vestTrim) rect(ctx, cx + c.bodyW * 0.3 * dir - bodyW * 0.62, bodyCy + bodyH * 0.4, bodyW * 1.24, 1, g.vestTrim);
  }
  if (g.apron) {
    rect(ctx, cx - bodyW * 0.5, bodyCy - bodyH * 0.2, bodyW, bodyH * 1.3, g.apron);
    speckle(ctx, Math.round(cx - bodyW * 0.5), Math.round(bodyCy), Math.round(bodyW), Math.round(bodyH), shade(g.apron, -0.25), 0.16, 4);
  }
  if (g.pack) {
    ell(ctx, cx - c.bodyW * 0.8 * dir, bodyCy - bodyH * 0.3, bodyW * 0.42, bodyH * 0.8, g.pack);
    rect(ctx, cx - c.bodyW * 0.8 * dir - 1, bodyCy - bodyH * 0.3, 3, 1, shade(g.pack, -0.3));
  }
  // A working belt, and something hanging off it. Small, but it is the
  // difference between an animal and somebody with a job.
  if (g.belt) {
    rect(ctx, cx - bodyW * 0.56, bodyCy + bodyH * 0.34, bodyW * 1.12, 1.6, g.belt);
    rect(ctx, cx - 1, bodyCy + bodyH * 0.3, 2.4, 2.6, shade(g.belt, 0.28));
  }
  if (g.pouch) {
    ell(ctx, cx - c.bodyW * 0.55 * dir, bodyCy + bodyH * 0.42, bodyW * 0.24, bodyH * 0.34, g.pouch);
    rect(ctx, cx - c.bodyW * 0.55 * dir - bodyW * 0.24, bodyCy + bodyH * 0.28, bodyW * 0.48, 1, shade(g.pouch, -0.3));
  }
  if (g.hat === 'ranger') {
    rect(ctx, headX - r * 1.5, headY - r * 0.75, r * 3, 1.4, g.hatColor || P.poachCoat);
    tri(ctx, headX - r * 0.9, headY - r * 0.7, headX + r * 0.9, headY - r * 0.7, headX, headY - r * 2.2, g.hatColor || P.poachCoat);
  } else if (g.hat === 'cap') {
    ell(ctx, headX, headY - r * 0.85, r * 0.95, r * 0.55, g.hatColor || P.nestTeal);
    rect(ctx, headX + dir * r * 0.5, headY - r * 0.75, r * 1.1, 1, shade(g.hatColor || P.nestTeal, -0.2));
  } else if (g.hat === 'helmet') {
    ell(ctx, headX, headY - r * 0.5, r * 1.12, r * 0.9, g.hatColor || P.nestSteel);
    rect(ctx, headX - r * 1.1, headY - r * 0.2, r * 2.2, 1, shade(g.hatColor || P.nestSteel, -0.3));
  } else if (g.hat === 'bandana') {
    rect(ctx, headX - r, headY - r * 0.85, r * 2, 2, g.hatColor || P.nestRed);
    line(ctx, headX - r, headY - r * 0.5, headX - r - 3, headY + 1 + p.arm * 0.3, g.hatColor || P.nestRed);
  } else if (g.hat === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      px(ctx, Math.round(headX + Math.cos(a) * 1.6 - r * 0.6), Math.round(headY - r * 0.9 + Math.sin(a) * 1.6), g.hatColor || P.paintbrush);
    }
    px(ctx, Math.round(headX - r * 0.6), Math.round(headY - r * 0.9), P.balsamroot);
  } else if (g.hat === 'visor') {
    rect(ctx, headX - r, headY - r * 0.4, r * 2, 2, g.hatColor || P.cyberDim);
    rect(ctx, headX - r * 0.7, headY - r * 0.4 + 0.4, r * 1.4, 1, P.cyber);
  }
  if (g.goggles && !back) {
    rect(ctx, headX - r * 1.05, headY - r * 0.35, r * 2.1, 2.2, P.nestSteelDk);
    circ(ctx, headX - r * 0.5, headY + r * 0.05 - 0.3, 1.2, g.gogglesColor || P.springHot);
    circ(ctx, headX + r * 0.5, headY + r * 0.05 - 0.3, 1.2, g.gogglesColor || P.springHot);
  }
  if (g.antenna) {
    line(ctx, headX, headY - r, headX + dir * 1.5, headY - r - 5, P.nestSteel);
    circ(ctx, headX + dir * 1.5, headY - r - 5, 1, P.nestRed);
  }
}

/** Bake an animation for one species/view. */
export function critterFrames(key, cfg, anim, view = 'front', frameCount = 8, expr = 'calm') {
  return getSheet(`critter:${key}:${anim}:${view}:${frameCount}:${expr}`, () => {
    const { w, h } = critterSize(cfg);
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      const ctx = surface(w, h);
      drawCritter(ctx, cfg, anim, i / frameCount, view, expr);
      outline(ctx, cfg.outlineColor || P.black);
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

/** A single still frame, e.g. for portraits and UI. */
export function critterStill(key, cfg, anim = 'idle', view = 'front', t = 0) {
  return critterFrames(key, cfg, anim, view, 1)[0];
}
