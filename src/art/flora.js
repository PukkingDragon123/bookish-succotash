// Trees, plants, rocks, ore and thermal props. Everything is drawn from a seed
// so each individual lodgepole is a slightly different lodgepole, and canopies
// sway on a baked loop with the trunk held still.

import { surface, ell, ellShaded, circ, rect, px, line, taper, tri, speckle, dither, outline, shade, getSheet } from './pixel.js';
import { P } from './palette.js';
import { hash2, makeRng } from '../engine/rng.js';
import { TAU } from '../engine/math.js';

// Bend frames, not loop frames. Frame 0 is fully bent upwind, the last is
// fully bent downwind, and the world picks between them from the wind field —
// so a whole hillside leans together instead of every plant twitching alone.
const SWAY_FRAMES = 9;
const BEND_FRAMES = 9;
export const PLANT_BEND_FRAMES = BEND_FRAMES;
export const TREE_BEND_FRAMES = SWAY_FRAMES;

// --- trees -----------------------------------------------------------------

function drawLodgepole(ctx, rng, sway, opts = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const trunkH = opts.trunkH || Math.round(H * 0.34);
  const trunkW = opts.trunkW || 3;
  const burnt = opts.burnt;
  const trunkCol = burnt ? P.charred : P.bark;

  // trunk
  rect(ctx, cx - trunkW / 2, base - trunkH, trunkW, trunkH, trunkCol);
  rect(ctx, cx - trunkW / 2, base - trunkH, 1, trunkH, shade(trunkCol, -0.25));
  rect(ctx, cx + trunkW / 2 - 1, base - trunkH, 1, trunkH, shade(trunkCol, 0.14));
  speckle(ctx, Math.round(cx - trunkW / 2), Math.round(base - trunkH), trunkW, trunkH, shade(trunkCol, -0.3), 0.22, 11);
  // root flare
  ell(ctx, cx, base - 1, trunkW * 1.5, 2, shade(trunkCol, -0.15));

  if (burnt) {
    for (let i = 0; i < 5; i++) {
      const y = base - trunkH - i * 3;
      const s = rng() < 0.5 ? -1 : 1;
      line(ctx, cx, y, cx + s * rng() * 7, y - 2 - rng() * 3, P.charred);
    }
    return;
  }

  // canopy: stacked needle tiers, widest at the bottom
  const tiers = opts.tiers || 5;
  const topY = 3;
  const canopyH = base - trunkH + 4 - topY;
  const maxW = opts.maxW || W * 0.45;
  for (let i = tiers - 1; i >= 0; i--) {
    const f = i / (tiers - 1);           // 0 = top, 1 = bottom
    const y = topY + canopyH * f;
    const w = maxW * (0.22 + f * 0.78);
    const off = sway * (1 - f) * 1.6;
    const dark = i % 2 === 0 ? P.pineDark : P.pine;
    const lit = i % 2 === 0 ? P.pine : P.pineLight;
    // ragged tier edge: a run of small blobs rather than one clean triangle
    const blobs = Math.max(3, Math.round(w / 2.4));
    for (let b = 0; b < blobs; b++) {
      const bt = b / (blobs - 1);
      const bx = cx + off + (bt - 0.5) * 2 * w;
      const by = y + Math.abs(bt - 0.5) * 3.4 + (hash2(b, i, 3) - 0.5) * 1.6;
      const br = 2.2 + (1 - Math.abs(bt - 0.5) * 2) * 2 + hash2(b, i, 9) * 1.2;
      ell(ctx, bx, by, br, br * 0.82, dark);
    }
    for (let b = 0; b < blobs; b++) {
      const bt = b / (blobs - 1);
      const bx = cx + off + (bt - 0.5) * 2 * w * 0.8;
      const by = y - 1 + Math.abs(bt - 0.5) * 3;
      if (hash2(b, i, 21) < 0.55) ell(ctx, bx, by, 1.8, 1.4, lit);
    }
  }
  // crown spike
  taper(ctx, cx + sway * 1.8, topY - 2, cx + sway * 1.2, topY + 5, 0.6, 2.4, P.pineDark);
  if (opts.snow) {
    for (let i = 0; i < 8; i++) {
      const a = rng() * TAU;
      circ(ctx, cx + Math.cos(a) * maxW * 0.5 + sway, topY + 4 + rng() * canopyH * 0.7, 1.4, P.snow);
    }
  }
}

function drawSpruce(ctx, rng, sway) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const trunkH = 8;
  rect(ctx, cx - 1.5, base - trunkH, 3, trunkH, P.bark);
  const tiers = 7;
  for (let i = tiers - 1; i >= 0; i--) {
    const f = i / (tiers - 1);
    const y = 3 + (base - trunkH + 3) * f;
    const w = W * 0.44 * (0.14 + f * 0.86);
    const off = sway * (1 - f) * 1.8;
    tri(ctx, cx + off - w, y + 4, cx + off + w, y + 4, cx + off * 1.3, y - 3, i % 2 ? P.spruce : P.pineDark);
    tri(ctx, cx + off - w * 0.6, y + 2.6, cx + off + w * 0.6, y + 2.6, cx + off * 1.3, y - 1.4, i % 2 ? P.pine : P.spruce);
  }
}

function drawAspen(ctx, rng, sway) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const trunkH = Math.round(H * 0.46);
  const lean = (rng() - 0.5) * 3;
  taper(ctx, cx, base, cx + lean + sway * 0.5, base - trunkH, 2.4, 1.5, P.aspenBark);
  rect(ctx, cx - 2, base - trunkH + 2, 1, trunkH - 3, shade(P.aspenBark, -0.18));
  // the black "eyes" on aspen bark
  for (let i = 0; i < 5; i++) {
    const y = base - 4 - rng() * (trunkH - 6);
    const x = cx + lean * ((base - y) / trunkH) + (rng() < 0.5 ? -2 : 1);
    rect(ctx, x, y, 2, 1, P.aspenMark);
    px(ctx, x - 1, y, P.aspenMark);
  }
  // The crown. Aspen leaves are small and round and they hang in a loose,
  // ragged cloud — the old version drew one big filled disc with a highlight
  // on it, which is why a hillside of them looked like a row of lollipops.
  const topX = cx + lean + sway * 2.2;
  const topY = base - trunkH - 1;
  const leaves = 54;
  for (let i = 0; i < leaves; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * 11.5;
    const bx = topX + Math.cos(a) * rr + sway * (0.4 + rr * 0.09);
    const by = topY + Math.sin(a) * rr * 0.72 - 5;
    // lit on top, shadowed underneath, and a few dead leaves gone to rust
    const up = (by - topY) < -5;
    const col = rng() < 0.10 ? P.aspenRust
      : up ? P.aspenLeafHi
      : (by - topY) > 0 ? shade(P.aspenLeaf, -0.24) : P.aspenLeaf;
    ell(ctx, bx, by, 2.1 + rng() * 0.9, 1.7 + rng() * 0.7, col);
  }
  // a couple of gaps punched back through, so the crown has sky in it
  for (let i = 0; i < 3; i++) {
    const a = rng() * TAU, rr = 3 + rng() * 6;
    ctx.clearRect(Math.round(topX + Math.cos(a) * rr), Math.round(topY + Math.sin(a) * rr * 0.7), 2, 1);
  }
}

function drawSnag(ctx, rng, sway) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const trunkH = Math.round(H * 0.78);
  taper(ctx, cx, base, cx + sway * 0.4, base - trunkH, 2.6, 1.2, P.snagWood);
  rect(ctx, cx - 2, base - trunkH, 1, trunkH, shade(P.snagWood, -0.3));
  for (let i = 0; i < 4; i++) {
    const y = base - 6 - rng() * (trunkH - 8);
    const s = rng() < 0.5 ? -1 : 1;
    const len = 4 + rng() * 6;
    taper(ctx, cx, y, cx + s * len, y - 3 - rng() * 3 + sway * 0.4, 1.2, 0.6, P.barkDead);
  }
  speckle(ctx, Math.round(cx - 3), Math.round(base - trunkH), 6, trunkH, shade(P.snagWood, -0.28), 0.2, 5);
}

function drawStump(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 2, 5, 2.6, P.bark);
  rect(ctx, cx - 5, base - 4, 10, 3, P.bark);
  ell(ctx, cx, base - 4, 5, 2.4, '#a97c46');
  ell(ctx, cx, base - 4, 3.2, 1.5, '#8a6234');
  ell(ctx, cx, base - 4, 1.4, 0.7, '#6b4a2a');
}

// --- shrubs, flowers, ground cover ----------------------------------------

function drawSage(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.2;
    const len = 4 + rng() * 6;
    const ex = cx + Math.cos(a) * len, ey = base + Math.sin(a) * len;
    line(ctx, cx + (rng() - 0.5) * 3, base, ex, ey, P.sageDark);
    circ(ctx, ex, ey, 1.6, i % 2 ? P.sage : shade(P.sage, 0.12));
  }
  ell(ctx, cx, base - 1, 5, 2, P.sageDark);
}

function drawBerryBush(ctx, rng, kind = 'huckleberry') {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const leaf = kind === 'huckleberry' ? '#3d6630' : '#4b7a3a';
  for (let i = 0; i < 10; i++) {
    const a = rng() * TAU;
    const rr = rng() * 5;
    ell(ctx, cx + Math.cos(a) * rr, base - 4 + Math.sin(a) * rr * 0.7, 3.4, 2.8, i % 3 ? leaf : shade(leaf, 0.14));
  }
  const berryCol = kind === 'huckleberry' ? P.berry : '#8a2f3a';
  const berryHi = kind === 'huckleberry' ? P.berryHi : '#c04a52';
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU, rr = 1.5 + rng() * 4.5;
    const bx = cx + Math.cos(a) * rr, by = base - 4 + Math.sin(a) * rr * 0.8;
    circ(ctx, bx, by, 1.3, berryCol);
    px(ctx, Math.round(bx - 0.5), Math.round(by - 0.6), berryHi);
  }
}

function drawFlower(ctx, rng, kind) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const stemTop = base - (H - 4);
  switch (kind) {
    case 'lupine':
      line(ctx, cx, base, cx, stemTop, '#3d6630');
      for (let i = 0; i < 7; i++) {
        const y = stemTop + i * 1.6;
        const w = 1.2 + (i / 7) * 1.6;
        ell(ctx, cx - w * 0.6, y, w, 1, P.lupine);
        ell(ctx, cx + w * 0.6, y + 0.8, w, 1, shade(P.lupine, 0.16));
      }
      break;
    case 'paintbrush':
      line(ctx, cx, base, cx, stemTop + 1, '#3d6630');
      for (let i = 0; i < 5; i++) {
        const y = stemTop + i * 1.4;
        ell(ctx, cx + (i % 2 ? 1 : -1), y, 1.8, 1.2, i % 2 ? P.paintbrush : shade(P.paintbrush, 0.18));
      }
      break;
    case 'balsamroot':
      line(ctx, cx, base, cx, stemTop + 2, '#4b7a3a');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ell(ctx, cx + Math.cos(a) * 2.6, stemTop + 2 + Math.sin(a) * 2, 1.5, 1.1, P.balsamroot);
      }
      circ(ctx, cx, stemTop + 2, 1.4, '#8a6a1c');
      break;
    case 'fireweed':
      line(ctx, cx, base, cx, stemTop, '#4b7a3a');
      for (let i = 0; i < 6; i++) {
        const y = stemTop + i * 1.8;
        const s = i % 2 ? 1 : -1;
        circ(ctx, cx + s * 1.6, y, 1.4, P.fireweed);
      }
      break;
    case 'beargrass':
      for (let i = -3; i <= 3; i++) {
        line(ctx, cx, base, cx + i * 2.2, base - 6 - Math.abs(i), '#6b7a4a');
      }
      line(ctx, cx, base, cx, stemTop + 4, '#6b7a4a');
      ell(ctx, cx, stemTop + 3, 1.9, 2.6, shade(P.bearGrass, -0.14));
      ell(ctx, cx - 0.5, stemTop + 2.4, 1.2, 1.6, P.bearGrass);
      break;
    case 'mushroom': {
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const mx = cx + (i - (n - 1) / 2) * 4;
        rect(ctx, mx - 0.5, base - 3, 2, 3, P.mushroomPale);
        ell(ctx, mx, base - 3.5, 2.8, 1.8, P.mushroom);
        px(ctx, Math.round(mx - 1), Math.round(base - 4), P.mushroomPale);
      }
      break;
    }
    case 'fern':
      for (let i = -2; i <= 2; i++) {
        const a = -Math.PI / 2 + i * 0.42;
        const ex = cx + Math.cos(a) * 7, ey = base + Math.sin(a) * 8;
        line(ctx, cx, base, ex, ey, '#2f4a2c');
        for (let j = 1; j <= 3; j++) {
          const t = j / 4;
          const bx = cx + (ex - cx) * t, by = base + (ey - base) * t;
          line(ctx, bx, by, bx - 2, by - 1, '#3d6236');
          line(ctx, bx, by, bx + 2, by - 1, '#3d6236');
        }
      }
      break;
    case 'grass':
    default: {
      // A tuft is a fan of blades from one root — thick at the base, one
      // pixel at the tip, curving over as it goes. Five random scratches is
      // what the old one was, and it read as television static.
      const n = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const gx = cx + t * 3.0 + (rng() - 0.5);
        const len = (H - 2) - Math.abs(t) * (H * 0.34) - rng() * 1.6;
        const lean = t * 3.2 + (rng() - 0.5) * 1.2;
        const col = Math.abs(t) < 0.45 ? P.grassLight : P.grass;
        for (let sp = 0; sp <= len; sp++) {
          const u = sp / Math.max(1, len);
          const bx = Math.round(gx + lean * u * u);
          px(ctx, bx, Math.round(base - sp), col);
          // the root end is two pixels wide, which is what stops a blade
          // looking like a stray line of noise
          if (u < 0.3) px(ctx, bx + (t < 0 ? -1 : 1), Math.round(base - sp), shade(col, -0.22));
        }
      }
      break;
    }
  }
}

/**
 * A reed bed. Tall, straight, and it goes over further than anything else on
 * the map when a gust comes through, which is most of why it is worth drawing.
 */
function drawReeds(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  for (let i = 0; i < 11; i++) {
    const t = (i / 10) * 2 - 1;
    const x = cx + t * 7 + (rng() - 0.5) * 1.5;
    const hgt = H - 3 - Math.abs(t) * 5 - rng() * 3;
    const col = i % 3 === 0 ? '#a8b46a' : i % 3 === 1 ? '#8a9a52' : '#6b7a42';
    line(ctx, x, base, x + t * 1.6, base - hgt, col);
    // the seed head — a dark thumb at the top of every third stem
    if (i % 3 === 0) ell(ctx, x + t * 1.6, base - hgt + 1.5, 0.9, 2.0, '#6b5a2e');
  }
  for (let i = 0; i < 3; i++) {
    line(ctx, cx - 5 + i * 5, base, cx - 8 + i * 6, base - 3, '#4d5a34');
  }
}

/** Resin bleeding down a scarred trunk. Amber, and it catches the light. */
function drawResinSeep(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  taper(ctx, cx, base, cx, base - (H - 3), 3.2, 2.6, P.bark);
  rect(ctx, cx - 3, base - H + 4, 2, H - 5, shade(P.bark, -0.28));
  // the wound, and the run of amber below it
  ell(ctx, cx + 0.5, base - H * 0.6, 2.2, 3.4, '#8a6238');
  for (let i = 0; i < 4; i++) {
    const y = base - H * 0.6 + i * 3;
    ell(ctx, cx + 0.5 + (rng() - 0.5), y, 1.6 - i * 0.2, 2.2, i < 2 ? '#e8b455' : '#c88a2a');
  }
  ell(ctx, cx + 0.8, base - 4, 3.0, 1.6, '#c88a2a');
  px(ctx, Math.round(cx), Math.round(base - H * 0.62), '#f4d68a');
}

/** What the birds leave under a roost. */
function drawFeatherFall(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const base = H - 1;
  for (let i = 0; i < 5; i++) {
    const x = 3 + rng() * (W - 6), y = base - rng() * 5;
    const a = rng() * Math.PI;
    const ex = x + Math.cos(a) * 5, ey = y - Math.abs(Math.sin(a)) * 4;
    line(ctx, x, y, ex, ey, '#5a5448');
    for (let j = 1; j <= 3; j++) {
      const t = j / 4;
      line(ctx, x + (ex - x) * t, y + (ey - y) * t,
           x + (ex - x) * t + 1.6, y + (ey - y) * t - 0.8, j % 2 ? '#8a94a0' : '#6b7480');
    }
  }
  speckle(ctx, 2, base - 2, W - 4, 3, '#9aa2ac', 0.18, 5);
}

/** A cut bank of wet clay. */
function drawClayBank(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ellShaded(ctx, cx, base - 4, 10, 5.5, '#8a5a42', '#a87458', '#5c3a2a');
  ellShaded(ctx, cx - 6, base - 2, 5, 3, '#7a4e38', '#9c6a50', '#523226');
  // the horizontal bedding lines that say "bank" and not "boulder"
  for (let i = 0; i < 3; i++) {
    line(ctx, cx - 8 + rng() * 2, base - 3 - i * 2.4, cx + 8 - rng() * 2, base - 3.6 - i * 2.4, '#6b4432');
  }
  speckle(ctx, cx - 8, base - 7, 16, 6, '#b98a6a', 0.14, 9);
}

/** Winterkill, stacked where the drifts left it. */
function drawBonePile(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 1, 11, 3, '#4d4436');
  for (let i = 0; i < 7; i++) {
    const x = cx - 8 + rng() * 16, y = base - 2 - rng() * 6;
    const a = (rng() - 0.5) * 1.6;
    const ex = x + Math.cos(a) * 5, ey = y + Math.sin(a) * 2;
    line(ctx, x, y, ex, ey, i % 2 ? '#d8d0b8' : '#b2a98e');
    circ(ctx, x, y, 1.2, '#e6e0c8');
    circ(ctx, ex, ey, 1.1, '#e6e0c8');
  }
  // a skull, because a bone pile without one is a pile of sticks
  ell(ctx, cx + 4, base - 4, 3.2, 2.6, '#e0d8c0');
  taper(ctx, cx + 6, base - 4, cx + 10, base - 3, 2.0, 1.2, '#d2c9ae');
  px(ctx, Math.round(cx + 3.4), Math.round(base - 4.6), '#3a352c');
  px(ctx, Math.round(cx + 5.2), Math.round(base - 4.4), '#3a352c');
}

// --- rocks, ore, minerals --------------------------------------------------

function drawRock(ctx, rng, kind, size = 1) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  let base1 = P.stone, lightC = P.stoneLight, darkC = P.stoneDark;
  if (kind === 'obsidian') { base1 = P.obsidian; lightC = P.obsidianHi; darkC = '#0d0d14'; }
  if (kind === 'sulfur') { base1 = '#8a7a3a'; lightC = P.sulfur; darkC = '#5a4f22'; }
  if (kind === 'coal') { base1 = P.coal; lightC = '#4a4a4c'; darkC = '#161618'; }

  const r = 5 * size;
  // A rock is 3 overlapping lumps so the silhouette never looks like a circle.
  const lumps = [[0, 0, r], [-r * 0.7, r * 0.25, r * 0.72], [r * 0.65, r * 0.3, r * 0.66]];
  for (const [lx, ly, lr] of lumps) ellShaded(ctx, cx + lx, base - r * 0.7 + ly, lr, lr * 0.82, base1, lightC, darkC);
  // facet highlights
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU, rr = rng() * r * 0.7;
    line(ctx, cx + Math.cos(a) * rr, base - r * 0.7 + Math.sin(a) * rr * 0.7,
      cx + Math.cos(a) * rr + 2, base - r * 0.7 + Math.sin(a) * rr * 0.7 - 1, darkC);
  }
  if (kind === 'iron' || kind === 'copper' || kind === 'sulfurVein' || kind === 'saltpeter') {
    const veinCol = kind === 'iron' ? P.iron : kind === 'copper' ? P.copper : kind === 'saltpeter' ? P.saltpeter : P.sulfur;
    const veinHi = kind === 'iron' ? P.ironHi : kind === 'copper' ? P.copperHi : kind === 'saltpeter' ? '#ffffff' : P.sulfurHi;
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU, rr = rng() * r * 0.75;
      const vx = cx + Math.cos(a) * rr, vy = base - r * 0.7 + Math.sin(a) * rr * 0.7;
      circ(ctx, vx, vy, 1.4, veinCol);
      px(ctx, Math.round(vx - 0.4), Math.round(vy - 0.5), veinHi);
    }
  }
  if (kind === 'obsidian') {
    for (let i = 0; i < 3; i++) {
      const a = rng() * TAU;
      line(ctx, cx, base - r * 0.8, cx + Math.cos(a) * r * 0.8, base - r * 0.8 + Math.sin(a) * r * 0.6, P.obsidianHi);
    }
  }
}

function drawSulfurMound(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 2, 8, 4, '#8a7a3a');
  ell(ctx, cx, base - 3.5, 6.6, 3.2, P.sulfur);
  ell(ctx, cx - 1, base - 4.4, 4, 2, P.sulfurHi);
  for (let i = 0; i < 10; i++) {
    const a = rng() * TAU, rr = rng() * 6;
    px(ctx, Math.round(cx + Math.cos(a) * rr), Math.round(base - 3 + Math.sin(a) * rr * 0.5), rng() < 0.5 ? P.sulfurHi : '#c9b22a');
  }
  // vent hole
  ell(ctx, cx + 2, base - 4, 1.6, 0.9, '#5a4f22');
}

function drawSaltpeterCrust(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 1.5, 9, 3.4, P.sinter);
  ell(ctx, cx, base - 2.4, 7, 2.6, P.saltpeter);
  dither(ctx, Math.round(cx - 6), Math.round(base - 4), 12, 4, '#ffffff', 0);
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU, rr = rng() * 7;
    px(ctx, Math.round(cx + Math.cos(a) * rr), Math.round(base - 2 + Math.sin(a) * rr * 0.4), '#c9cdcd');
  }
}

// --- thermal features & props ---------------------------------------------

function drawGeyserCone(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 2, 11, 5, P.sinter);
  ell(ctx, cx, base - 5, 8, 4, shade(P.sinter, 0.1));
  ell(ctx, cx, base - 7.5, 5.4, 3, shade(P.sinter, 0.16));
  ell(ctx, cx, base - 8.5, 3, 1.6, '#3a3a38');
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU, rr = 3 + rng() * 7;
    px(ctx, Math.round(cx + Math.cos(a) * rr), Math.round(base - 4 + Math.sin(a) * rr * 0.45), rng() < 0.4 ? P.springRim1 : shade(P.sinter, -0.14));
  }
}

function drawFumarole(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 1.5, 7, 3.4, P.mudpot);
  ell(ctx, cx, base - 3, 4.4, 2.2, '#4a3b2a');
  ell(ctx, cx, base - 3.6, 2.2, 1.1, '#241f1c');
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU, rr = rng() * 5;
    px(ctx, Math.round(cx + Math.cos(a) * rr), Math.round(base - 2 + Math.sin(a) * rr * 0.5), P.sulfur);
  }
}

function drawBones(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 2, 4, 2.6, '#d8d2bb');
  circ(ctx, cx - 3.5, base - 3, 1.4, '#d8d2bb');
  ell(ctx, cx + 3, base - 1, 1.2, 0.8, '#c4bda6');
  for (let i = 0; i < 3; i++) line(ctx, cx - 2 + i * 2, base - 3.4, cx - 3 + i * 2, base - 0.6, '#c4bda6');
  circ(ctx, cx - 3.6, base - 3.4, 0.7, '#5a5348');
}

function drawLogPile(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  for (let i = 0; i < 3; i++) {
    const y = base - 2 - i * 3;
    const off = (i % 2) * 2 - 1;
    rect(ctx, cx - 7 + off, y - 2, 14, 3, P.bark);
    rect(ctx, cx - 7 + off, y - 2, 14, 1, P.barkLight);
    ell(ctx, cx - 7 + off, y - 0.5, 1.4, 1.5, '#a97c46');
    ell(ctx, cx + 7 + off, y - 0.5, 1.4, 1.5, '#8a6234');
  }
}

function drawDen(ctx, rng) {
  // The ferret den: the place you are defending.
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  ell(ctx, cx, base - 3, 15, 8, P.dirt);
  ell(ctx, cx, base - 5, 13, 7, P.dirtLight);
  ell(ctx, cx, base - 2, 6, 4.4, '#1a1410');
  ell(ctx, cx, base - 2.6, 5, 3.6, '#0d0a08');
  // grass fringe and a few scattered pebbles
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU, rr = 9 + rng() * 6;
    const gx = cx + Math.cos(a) * rr, gy = base - 4 + Math.sin(a) * rr * 0.45;
    line(ctx, gx, gy, gx + (rng() - 0.5) * 2, gy - 2 - rng() * 2, rng() < 0.5 ? P.grass : P.grassLight);
  }
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU, rr = 6 + rng() * 7;
    circ(ctx, cx + Math.cos(a) * rr, base - 3 + Math.sin(a) * rr * 0.4, 1.2, P.gravel);
  }
  // little bedding of dry grass at the mouth
  for (let i = 0; i < 8; i++) line(ctx, cx - 4 + i, base - 1, cx - 5 + i + (rng() - 0.5) * 2, base - 2.5, P.meadowDry);
}

function drawWorkbench(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  rect(ctx, cx - 10, base - 8, 20, 5, P.bark);
  rect(ctx, cx - 10, base - 8, 20, 1, P.barkLight);
  rect(ctx, cx - 9, base - 3, 2, 3, P.bark);
  rect(ctx, cx + 7, base - 3, 2, 3, P.bark);
  // vise, hammer, a scatter of parts
  rect(ctx, cx + 3, base - 11, 4, 3, P.stone);
  rect(ctx, cx - 7, base - 10, 5, 2, P.nestSteel);
  line(ctx, cx - 5, base - 10, cx - 5, base - 13, P.barkLight);
  circ(ctx, cx - 1, base - 9, 1.4, P.iron);
  circ(ctx, cx + 1, base - 9.5, 1, P.copper);
}

function drawForge(ctx, rng) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  rect(ctx, cx - 9, base - 10, 18, 10, P.stoneDark);
  rect(ctx, cx - 9, base - 10, 18, 2, P.stone);
  speckle(ctx, cx - 9, base - 10, 18, 10, P.stoneLight, 0.12, 3);
  rect(ctx, cx - 5, base - 7, 10, 6, '#160f0c');
  ell(ctx, cx, base - 3, 4.4, 2.4, P.fire3);
  ell(ctx, cx, base - 3, 3, 1.6, P.fire2);
  ell(ctx, cx, base - 3, 1.6, 0.9, P.fire1);
  rect(ctx, cx - 3, base - 14, 2, 4, P.stoneDark);
  rect(ctx, cx + 2, base - 13, 2, 3, P.stoneDark);
}

function drawCrate(ctx, rng, corp = false) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = W / 2, base = H - 1;
  const body = corp ? P.nestDark : P.bark;
  const trim = corp ? P.nestTeal : P.barkLight;
  rect(ctx, cx - 7, base - 12, 14, 12, body);
  rect(ctx, cx - 7, base - 12, 14, 1, trim);
  rect(ctx, cx - 7, base - 7, 14, 1, trim);
  rect(ctx, cx - 7, base - 12, 1, 12, shade(body, -0.25));
  rect(ctx, cx + 6, base - 12, 1, 12, shade(body, 0.15));
  if (corp) {
    // stencilled nest mark
    ell(ctx, cx, base - 5, 4, 2.4, P.nestTealHi);
    ell(ctx, cx, base - 5.4, 2.4, 1.4, P.nestDark);
    px(ctx, cx, base - 5.4, P.eggShell);
  } else {
    line(ctx, cx - 6, base - 11, cx + 5, base - 1, shade(body, -0.2));
  }
}

// --- public builders -------------------------------------------------------

const TREE_KINDS = {
  pine: { w: 34, h: 52, fn: drawLodgepole, shadow: 7 },
  pineSmall: { w: 26, h: 38, fn: (c, r, s) => drawLodgepole(c, r, s, { tiers: 4, maxW: 11, trunkH: 10 }), shadow: 5 },
  pineTall: { w: 38, h: 66, fn: (c, r, s) => drawLodgepole(c, r, s, { tiers: 6, maxW: 16, trunkH: 22 }), shadow: 8 },
  spruce: { w: 30, h: 54, fn: drawSpruce, shadow: 6 },
  aspen: { w: 34, h: 50, fn: drawAspen, shadow: 6 },
  snag: { w: 22, h: 46, fn: drawSnag, shadow: 4 },
  burnt: { w: 26, h: 40, fn: (c, r, s) => drawLodgepole(c, r, s, { burnt: true, trunkH: 30 }), shadow: 4 },
  stump: { w: 16, h: 12, fn: (c, r) => drawStump(c, r), shadow: 5, static: true },
};

export function treeFrames(kind, variant = 0) {
  const spec = TREE_KINDS[kind] || TREE_KINDS.pine;
  return getSheet(`tree:${kind}:${variant}`, () => {
    const frames = [];
    const n = spec.static ? 1 : SWAY_FRAMES;
    for (let i = 0; i < n; i++) {
      const rng = makeRng(variant * 7919 + 13);
      const ctx = surface(spec.w, spec.h);
      // A tree is heavy. It leans a long way at the crown and barely at all
      // at the butt, and it never leans as far as grass does.
      const bend = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      spec.fn(ctx, rng, bend * 2.2);
      outline(ctx, P.black);
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

export function treeShadowRadius(kind) { return (TREE_KINDS[kind] || TREE_KINDS.pine).shadow; }
export const TREE_KIND_NAMES = Object.keys(TREE_KINDS);

const PLANT_KINDS = {
  sage: { bend: 1.3, w: 18, h: 14, fn: (c, r) => drawSage(c, r) },
  huckleberry: { bend: 1.2, w: 20, h: 16, fn: (c, r) => drawBerryBush(c, r, 'huckleberry') },
  serviceberry: { bend: 1.2, w: 20, h: 16, fn: (c, r) => drawBerryBush(c, r, 'serviceberry') },
  lupine: { bend: 3.4, w: 12, h: 16, fn: (c, r) => drawFlower(c, r, 'lupine') },
  paintbrush: { bend: 3.0, w: 12, h: 14, fn: (c, r) => drawFlower(c, r, 'paintbrush') },
  balsamroot: { bend: 2.4, w: 14, h: 14, fn: (c, r) => drawFlower(c, r, 'balsamroot') },
  fireweed: { bend: 3.8, w: 12, h: 18, fn: (c, r) => drawFlower(c, r, 'fireweed') },
  beargrass: { bend: 3.6, w: 16, h: 18, fn: (c, r) => drawFlower(c, r, 'beargrass') },
  mushroom: { bend: 0, w: 14, h: 10, fn: (c, r) => drawFlower(c, r, 'mushroom') },
  fern: { bend: 2.2, w: 18, h: 14, fn: (c, r) => drawFlower(c, r, 'fern') },
  grass: { bend: 4.2, w: 12, h: 10, fn: (c, r) => drawFlower(c, r, 'grass') },
  reeds: { bend: 3.4, w: 20, h: 22, fn: (c, r) => drawReeds(c, r) },
  resin: { bend: 0.4, w: 16, h: 20, fn: (c, r) => drawResinSeep(c, r) },
  feathers: { bend: 1.2, w: 18, h: 12, fn: (c, r) => drawFeatherFall(c, r) },
};
export const PLANT_KIND_NAMES = Object.keys(PLANT_KINDS);

export function plantFrames(kind, variant = 0) {
  const spec = PLANT_KINDS[kind] || PLANT_KINDS.grass;
  return getSheet(`plant:${kind}:${variant}`, () => {
    const frames = [];
    const pad = 5;
    for (let i = 0; i < BEND_FRAMES; i++) {
      const rng = makeRng(variant * 104729 + 17);
      const ctx = surface(spec.w + pad * 2, spec.h);
      const bend = (i / (BEND_FRAMES - 1)) * 2 - 1;
      // Shear, not shift. Grass is rooted: the base stays exactly where it is
      // and the tips travel. Sliding the whole sprite sideways is what made
      // the old meadow look like it was shivering rather than blowing.
      const k = bend * (spec.bend == null ? 3.0 : spec.bend) / Math.max(1, spec.h);
      ctx.save();
      ctx.setTransform(1, 0, -k, 1, pad + k * spec.h, 0);
      spec.fn(ctx, rng);
      ctx.restore();
      outline(ctx, P.black);
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

const ROCK_KINDS = {
  stone: { w: 22, h: 18, fn: (c, r) => drawRock(c, r, 'stone', 1) },
  stoneBig: { w: 30, h: 24, fn: (c, r) => drawRock(c, r, 'stone', 1.5) },
  iron: { w: 22, h: 18, fn: (c, r) => drawRock(c, r, 'iron', 1.05) },
  copper: { w: 22, h: 18, fn: (c, r) => drawRock(c, r, 'copper', 1.05) },
  obsidian: { w: 22, h: 18, fn: (c, r) => drawRock(c, r, 'obsidian', 1) },
  coal: { w: 22, h: 18, fn: (c, r) => drawRock(c, r, 'coal', 1) },
  saltpeter: { w: 24, h: 12, fn: (c, r) => drawSaltpeterCrust(c, r) },
  sulfur: { w: 22, h: 14, fn: (c, r) => drawSulfurMound(c, r) },
  clay: { w: 24, h: 16, fn: (c, r) => drawClayBank(c, r) },
  bones: { w: 26, h: 16, fn: (c, r) => drawBonePile(c, r) },
};
export const ROCK_KIND_NAMES = Object.keys(ROCK_KINDS);

export function rockSprite(kind, variant = 0) {
  const spec = ROCK_KINDS[kind] || ROCK_KINDS.stone;
  return getSheet(`rock:${kind}:${variant}`, () => {
    const rng = makeRng(variant * 31337 + 7);
    const ctx = surface(spec.w, spec.h);
    spec.fn(ctx, rng);
    outline(ctx, P.black);
    return [ctx.canvas];
  })[0];
}

const PROPS = {
  geyserCone: { w: 28, h: 16, fn: drawGeyserCone },
  fumarole: { w: 20, h: 10, fn: drawFumarole },
  bones: { w: 16, h: 10, fn: drawBones },
  logPile: { w: 20, h: 14, fn: drawLogPile },
  den: { w: 40, h: 24, fn: drawDen },
  workbench: { w: 26, h: 18, fn: drawWorkbench },
  forge: { w: 22, h: 18, fn: drawForge },
  crate: { w: 18, h: 16, fn: (c, r) => drawCrate(c, r, false) },
  nestCrate: { w: 18, h: 16, fn: (c, r) => drawCrate(c, r, true) },
};
export const PROP_NAMES = Object.keys(PROPS);

export function propSprite(kind, variant = 0) {
  const spec = PROPS[kind];
  if (!spec) return null;
  return getSheet(`prop:${kind}:${variant}`, () => {
    const rng = makeRng(variant * 65537 + 3);
    const ctx = surface(spec.w, spec.h);
    spec.fn(ctx, rng);
    outline(ctx, P.black);
    return [ctx.canvas];
  })[0];
}
