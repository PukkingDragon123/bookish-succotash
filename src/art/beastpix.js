// Hand-drawn animals.
//
// The old version of this solved a skeleton at runtime — a spine, joints,
// posture rules, the lot. It was clever and it looked like porridge, because
// pixel art at this size is not a simulation problem. A 30-pixel wolf is not a
// small wolf; it is a *symbol* of a wolf, and which nine pixels you spend on
// the head matters far more than whether the elbow bends correctly.
//
// So these are drawn the way pixel artists actually draw animals:
//
//   1. BLOCK IN the silhouette from a few overlapping masses — chest, barrel,
//      haunch, skull, muzzle. Animals are not tubes on sticks; they are a
//      couple of big volumes with a neck between them.
//   2. CLEAN the mask. Kill orphan pixels, fill single-pixel pinholes. A
//      ragged edge is the single loudest tell of bad pixel art.
//   3. OUTLINE it, one pixel, all the way round, in a dark tint of the coat
//      and never in pure black — black outlines make everything look like a
//      sticker sitting on top of the world instead of standing in it.
//   4. SHADE with three tones and a belly, lit from above: a light band on the
//      back, mid over the mass, dark under the belly. Per column, following
//      the silhouette, so it never pillow-shades.
//   5. PLACE THE FEATURES last, by hand: eye, nose, ear, markings, horns.
//      One pixel of eye in the wrong place ruins an otherwise good animal.
//
// The silhouette carries the species. Every one of these should be
// identifiable as a flat black shape, and the check harness renders them that
// way so it can be verified rather than hoped for.
//
// Animation moves what is already drawn — the leg groups swing, the body bobs
// a pixel, the tail sways — instead of re-solving anything. That is also how
// it is really done.

import { surface, getSheet, shade } from './pixel.js';

// One authored pixel is this many screen pixels. It is deliberately the same
// for every species: mixed pixel sizes in one scene is the other loudest tell.
export const PIX = 2;

// ---------------------------------------------------------------------------
//  mask rasterising
//
//  Everything is drawn into a byte-per-pixel grid first, with no colour at
//  all. Colour is decided afterwards from the shape, which is what keeps the
//  shading consistent between species.
// ---------------------------------------------------------------------------

function Grid(w, h) {
  return { w, h, d: new Uint8Array(w * h) };
}
const gat = (g, x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : g.d[y * g.w + x]);
const gset = (g, x, y, v) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.d[y * g.w + x] = v; };

function fillEll(g, cx, cy, rx, ry, v) {
  const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / (rx + 0.001), dy = (y + 0.5 - cy) / (ry + 0.001);
      if (dx * dx + dy * dy <= 1) gset(g, x, y, v);
    }
  }
}

function fillRect(g, x, y, w, h, v) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) gset(g, x + i, y + j, v);
}

/** A capsule: the workhorse. Necks, legs, tails, the barrel of a body. */
function fillCap(g, x0, y0, x1, y1, r0, r1, v) {
  if (r1 == null) r1 = r0;
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillEll(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t, v);
  }
}

function fillTri(g, ax, ay, bx, by, cx, cy, v) {
  const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(area) < 1e-6) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / area;
      const w1 = ((cx - bx) * (py - by) - (px - bx) * (cy - by)) / area;
      const w2 = ((ax - cx) * (py - cy) - (px - cx) * (ay - cy)) / area;
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) gset(g, x, y, v);
    }
  }
}

/** A tapering curve — antler beams, crane necks, the sweep of a horn. */
function fillArc(g, cx, cy, r, a0, a1, thick0, thick1, v) {
  const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = a0 + (a1 - a0) * t;
    const th = thick0 + (thick1 - thick0) * t;
    fillEll(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, th, th, v);
  }
}

function shapeInto(g, s, v) {
  switch (s[0]) {
    case 'e': fillEll(g, s[1], s[2], s[3], s[4], v); break;
    case 'r': fillRect(g, s[1], s[2], s[3], s[4], v); break;
    case 'c': fillCap(g, s[1], s[2], s[3], s[4], s[5], s[6], v); break;
    case 't': fillTri(g, s[1], s[2], s[3], s[4], s[5], s[6], v); break;
    case 'a': fillArc(g, s[1], s[2], s[3], s[4], s[5], s[6], s[7], v); break;
    case 'x': fillEll(g, s[1], s[2], s[3], s[4], 0); break;   // carve back out
    default: break;
  }
}

/**
 * Tidy the silhouette.
 *
 * Fills pinholes and shaves off pixels that are only diagonally attached.
 * Rasterised ellipses produce both, and both look like dirt on the screen.
 */
function clean(g) {
  const nb = (x, y) => gat(g, x - 1, y) + gat(g, x + 1, y) + gat(g, x, y - 1) + gat(g, x, y + 1);
  for (let pass = 0; pass < 2; pass++) {
    const src = g.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : src[y * g.w + x]);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const n = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
        if (!at(x, y) && n >= 3) gset(g, x, y, 1);          // pinhole
        else if (at(x, y) && n === 0) gset(g, x, y, 0);      // orphan
      }
    }
  }
  void nb;
}

// ---------------------------------------------------------------------------
//  compositing
//
//  A species is a stack of layers, but it is drawn as ONE animal: the whole
//  silhouette gets a single unbroken outline, and only the near limbs get an
//  extra internal line to lift them off the body. That is the difference
//  between a drawn animal and a pile of separately-outlined parts, and it is
//  the thing that made the first attempt at this look like two dogs stapled
//  together at the shoulder.
//
//  Shading is grouped, not per-layer: the barrel, neck and skull share one set
//  of column extents, so the light band runs unbroken along the topline from
//  rump to nose. Each leg shades on its own, because each leg is its own form.
// ---------------------------------------------------------------------------

// Which limb group a layer belongs to, so the gait can move it.
//  body  the barrel and chest        head  skull, neck, ears, horns
//  tail  what sways behind           l1/l2 near fore / near hind
//  l3/l4 far fore / far hind         wing  what flaps
const SETS = ['body', 'head', 'tail', 'l1', 'l2', 'l3', 'l4', 'wing'];

/**
 * Per-layer colour ramp.
 *
 * Four bands, not three: a rim of light on the very top, the body tone, a
 * half-step down where the barrel turns under, and the shadow along the
 * underside. Three tones is the usual advice and it is right for a 12-pixel
 * sprite; at forty pixels across, three tones is a paper cut-out.
 */
function toneOf(pal, tone) {
  if (tone === 'far') {
    // Everything on the far side of the animal is in its own shadow. Tone
    // alone puts it behind — no extra outline needed, and no second pair of
    // black stilts.
    const d = pal.far || shade(pal.dark, -0.06);
    return { light: d, mid: d, mid2: shade(d, -0.10), dark: shade(d, -0.18) };
  }
  if (tone && pal[tone]) {
    const c = pal[tone];
    return { light: shade(c, 0.14), mid: c, mid2: shade(c, -0.08), dark: shade(c, -0.2) };
  }
  return { light: pal.light, mid: pal.mid, mid2: pal.mid2 || shade(pal.mid, -0.11), dark: pal.dark };
}

/** Offset a grid's set pixels into a destination grid. */
function stamp(dst, g, ox, oy) {
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!g.d[y * g.w + x]) continue;
      gset(dst, x + ox, y + oy, 1);
    }
  }
}

/** Trace one pixel of outline around everything set in `u`, into `col`. */
function outlineOf(col, u, colour, W, H) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (u.d[y * W + x]) continue;
      let touch = 0;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (gat(u, x + dx, y + dy)) { touch = 1; break; }
        }
      }
      if (touch) col[y * W + x] = colour;
    }
  }
}

/**
 * Fill one layer, shaded per column against `ext` — the column extents of the
 * whole group this layer belongs to, so a light band crosses part seams
 * without a step in it.
 */
function fillLayer(col, g, ext, ramp, ox, oy, W, H) {
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!g.d[y * g.w + x]) continue;
      const px = x + ox, py = y + oy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const e = ext[px];
      let c = ramp.mid;
      if (e) {
        const dt = py - e[0], db = e[1] - py, span = e[1] - e[0];
        if (dt <= 0) c = ramp.light;
        else if (span >= 8 && dt === 1) c = ramp.light;
        else if (span >= 3 && db <= 0) c = ramp.dark;
        else if (span >= 7 && db <= 2) c = ramp.mid2;
        else if (span >= 5 && db <= 1) c = ramp.mid2;
      }
      col[py * W + px] = c;
    }
  }
}

/** Top and bottom of every column of a mask, for the shading pass. */
function extents(u, W, H) {
  const ext = new Array(W).fill(null);
  for (let x = 0; x < W; x++) {
    let top = -1, bot = -1;
    for (let y = 0; y < H; y++) if (u.d[y * W + x]) { if (top < 0) top = y; bot = y; }
    if (top >= 0) ext[x] = [top, bot];
  }
  return ext;
}

/** Features are painted last and clipped to the sprite unless marked free. */
function paintFeat(col, mask, f, pal, ox, oy, W, H) {
  const g = Grid(W, H);
  const kind = f[0];
  const c = pal[f[f.length - 1]] || f[f.length - 1];
  const free = kind === kind.toUpperCase();
  const k = kind.toLowerCase();
  if (k === 'p') gset(g, Math.round(f[1] + ox), Math.round(f[2] + oy), 1);
  else if (k === 'r') fillRect(g, Math.round(f[1] + ox), Math.round(f[2] + oy), f[3], f[4], 1);
  else if (k === 'e') fillEll(g, f[1] + ox, f[2] + oy, f[3], f[4], 1);
  else if (k === 'c') fillCap(g, f[1] + ox, f[2] + oy, f[3] + ox, f[4] + oy, f[5], f[5], 1);
  else if (k === 't') fillTri(g, f[1] + ox, f[2] + oy, f[3] + ox, f[4] + oy, f[5] + ox, f[6] + oy, 1);
  else if (k === 'a') fillArc(g, f[1] + ox, f[2] + oy, f[3], f[4], f[5], f[6], f[7], 1);
  for (let i = 0; i < g.d.length; i++) {
    if (!g.d[i]) continue;
    if (!free && !mask.d[i]) continue;
    col[i] = c;
  }
}

/** The gait. Two diagonal pairs, opposed, with a lift on the swing leg. */
function gaitOffsets(spec, anim, phase) {
  const off = {};
  for (const s of SETS) off[s] = [0, 0];
  const a = phase * Math.PI * 2;
  const moving = anim === 'walk' || anim === 'run' || anim === 'trot' || anim === 'charge';
  const fast = anim === 'run' || anim === 'charge';
  const base = spec.stride || 2;
  const amp = fast ? base + 1 : base;
  const bob = moving ? (Math.sin(a * 2) > 0.2 ? -1 : 0) : (Math.sin(a) > 0.75 ? -1 : 0);

  off.body = [0, bob];
  off.head = [0, bob];
  off.tail = [0, bob];
  for (const s of ['l1', 'l2', 'l3', 'l4']) off[s] = [0, bob];

  if (moving) {
    // diagonal pairs: near fore travels with far hind, near hind with far fore
    const pA = Math.sin(a), pB = Math.sin(a + Math.PI);
    const lift = (p) => (p > 0.55 ? -1 : 0) + (fast && p > 0.9 ? -1 : 0);
    off.l1 = [Math.round(pA * amp), bob + lift(pA)];
    off.l4 = [Math.round(pA * amp), bob + lift(pA)];
    off.l2 = [Math.round(pB * amp), bob + lift(pB)];
    off.l3 = [Math.round(pB * amp), bob + lift(pB)];
    off.tail = [Math.round(-pA), bob + (fast ? -1 : 0)];
    off.head = [fast ? 1 : 0, bob];
  } else if (anim === 'graze' || anim === 'sniff') {
    off.head = [1, (spec.grazeDrop || 3)];
  } else if (anim === 'alert' || anim === 'attack') {
    off.head = [0, bob - 1];
    off.tail = [0, bob - 1];
  } else if (anim === 'idle') {
    off.tail = [Math.sin(a) > 0 ? 0 : -1, bob];
    off.head = [0, bob + (Math.sin(a * 0.5) > 0.85 ? 1 : 0)];
  } else if (anim === 'sit') {
    // haunches down, chest still up
    off.body = [0, 2];
    off.head = [0, 1];
    off.tail = [0, 3];
    off.l2 = [-1, 3]; off.l4 = [-1, 3];
  } else if (anim === 'groom') {
    // nose turned back into the flank
    off.head = [-2, 3 + (Math.sin(a * 2) > 0 ? 1 : 0)];
  } else if (anim === 'shake') {
    const j = Math.sin(a * 6) > 0 ? 1 : -1;
    off.body = [j, bob];
    off.head = [-j, bob];
    off.tail = [j * 2, bob];
  }

  // wings: flap hard in the air, settle on the ground
  if (anim === 'fly' || anim === 'run') off.wing = [0, Math.round(Math.sin(a) * 2)];
  else off.wing = [0, Math.sin(a) > 0.8 ? -1 : 0];
  return off;
}

function layerVisible(L, anim) {
  const isMove = anim === 'walk' || anim === 'run' || anim === 'trot' || anim === 'charge';
  if (L.anim && L.anim !== anim && !(L.anim === 'move' && isMove)) return false;
  if (L.not && (L.not === anim || (L.not === 'move' && isMove))) return false;
  return true;
}

/**
 * Expressions.
 *
 * One pixel around the eye is the whole vocabulary, and it is enough: a brow
 * dropped toward the nose is anger, a brow lifted off it is interest, and an
 * eye squeezed to a line is pain. Anything more elaborate than that at this
 * size just turns the face to mud.
 */
const EXPR = {
  calm: null,
  alert: { brow: -2 },
  curious: { brow: -2, tilt: 1 },
  angry: { brow: -1, slant: 1 },
  afraid: { wide: 1 },
  hurt: { shut: 1 },
  happy: { squint: 1 },
  dead: { shut: 1 },
};

/** Draw the expression onto whatever the species uses for an eye. */
function paintExpr(col, union, spec, name, off, W, H) {
  const e = EXPR[name];
  if (!e) return;
  const pal = spec.pal;
  let eye = null;
  for (const f of (spec.feats || [])) {
    const k = String(f.f[0]).toLowerCase();
    if (f.f[f.f.length - 1] !== 'eye') continue;
    if (k !== 'p' && k !== 'e') continue;
    const [ox, oy] = off[f.set || 'head'] || [0, 0];
    eye = { x: Math.round(f.f[1] + ox), y: Math.round(f.f[2] + oy) };
    break;
  }
  if (!eye) return;
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (!union.d[y * W + x]) return;
    col[y * W + x] = c;
  };
  const dark = pal.out;
  if (e.shut) { put(eye.x, eye.y, dark); put(eye.x + 1, eye.y, dark); put(eye.x - 1, eye.y, dark); }
  if (e.wide) { put(eye.x, eye.y + 1, pal.eye || dark); put(eye.x, eye.y - 1, pal.eye || dark); }
  if (e.squint) { put(eye.x, eye.y + 1, dark); }
  if (e.brow != null) {
    const by = eye.y + e.brow;
    put(eye.x, by, dark);
    put(eye.x + 1, by + (e.slant ? 1 : 0), dark);
    if (e.tilt) put(eye.x - 1, by - 1, dark);
  }
}

/** One frame, at 1:1 authored resolution, then blown up by PIX. */
function renderFrame(spec, anim, phase, scale, expr) {
  const W = spec.w, H = spec.h;
  const off = gaitOffsets(spec, anim, phase);
  const col = new Array(W * H).fill(null);
  const pal = spec.pal;

  // rasterise every visible layer once, in its animated position
  const layers = [];
  for (const L of spec.layers) {
    if (!layerVisible(L, anim)) continue;
    const g = Grid(W, H);
    for (const s of L.shapes) shapeInto(g, s, 1);
    if (L.clean !== false) clean(g);
    const [ox, oy] = off[L.set || 'body'] || [0, 0];
    layers.push({ L, g, ox, oy, z: L.z || 0 });
  }
  layers.sort((a, b) => a.z - b.z);

  // the whole animal, as one shape — this is what gets the outline
  const union = Grid(W, H);
  for (const it of layers) stamp(union, it.g, it.ox, it.oy);
  outlineOf(col, union, pal.out, W, H);

  // shading groups: the core shades together so the topline is continuous
  const groups = new Map();
  for (const it of layers) {
    const key = it.L.shade || (['body', 'head', 'tail'].includes(it.L.set || 'body') ? 'core' : (it.L.set || 'body'));
    it.group = key;
    if (!groups.has(key)) groups.set(key, Grid(W, H));
    stamp(groups.get(key), it.g, it.ox, it.oy);
  }
  const ext = new Map();
  for (const [k, g] of groups) ext.set(k, extents(g, W, H));

  for (const it of layers) fillLayer(col, it.g, ext.get(it.group), toneOf(pal, it.L.tone), it.ox, it.oy, W, H);

  // near limbs get one internal line so they lift off the barrel
  for (const it of layers) {
    if (!it.L.sep) continue;
    const only = Grid(W, H);
    stamp(only, it.g, it.ox, it.oy);
    const line = pal.sep || pal.out;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (only.d[y * W + x] || !union.d[y * W + x]) continue;
        let touch = 0;
        for (let dy = -1; dy <= 1 && !touch; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (gat(only, x + dx, y + dy)) { touch = 1; break; }
          }
        }
        if (touch) col[y * W + x] = line;
      }
    }
  }

  for (const f of (spec.feats || [])) {
    const [ox, oy] = off[f.set || 'head'] || [0, 0];
    paintFeat(col, union, f.f, pal, ox, oy, W, H);
  }
  paintExpr(col, union, spec, expr, off, W, H);

  // 1:1 first, then integer-scale it. Enlarging authored pixels any other way
  // is the fastest possible way to stop looking like pixel art.
  const s1 = surface(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = col[y * W + x];
      if (!c) continue;
      s1.fillStyle = c;
      s1.fillRect(x, y, 1, 1);
    }
  }
  const S = Math.max(1, Math.round(scale));
  if (S === 1) return s1.canvas;
  const ctx = surface(W * S, H * S);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s1.canvas, 0, 0, W, H, 0, 0, W * S, H * S);
  return ctx.canvas;
}

// ---------------------------------------------------------------------------
//  legs
//
//  Every quadruped in the basin uses the same two joints, because every
//  quadruped in the world does: the foreleg is a near-vertical column, and the
//  hind leg breaks backwards at the hock. Getting that one backwards bend in
//  is most of what makes a drawn animal read as an animal rather than a table.
// ---------------------------------------------------------------------------

function fore(x, top, bot, r) {
  const mid = top + (bot - top) * 0.55;
  return [
    ['c', x, top, x, mid, r, r * 0.78],
    ['c', x, mid, x + 0.4, bot - 1, r * 0.78, r * 0.62],
    ['r', Math.round(x - r * 0.75), bot - 1, Math.max(2, Math.round(r * 1.5)), 1],
  ];
}

function hind(x, top, bot, r) {
  const stifle = top + (bot - top) * 0.42;
  const hock = top + (bot - top) * 0.70;
  return [
    ['c', x, top, x + 0.7, stifle, r, r * 0.8],
    ['c', x + 0.7, stifle, x - 1.5, hock, r * 0.8, r * 0.58],
    ['c', x - 1.5, hock, x - 0.4, bot - 1, r * 0.58, r * 0.55],
    ['r', Math.round(x - r * 0.75 - 0.4), bot - 1, Math.max(2, Math.round(r * 1.5)), 1],
  ];
}

/** Bird leg: a stick with a backwards-kinked ankle and a splayed foot. */
function birdLeg(x, top, bot, r) {
  const ankle = top + (bot - top) * 0.55;
  return [
    ['c', x, top, x - 0.6, ankle, r, r * 0.8],
    ['c', x - 0.6, ankle, x + 0.6, bot - 1, r * 0.8, r * 0.6],
    ['r', Math.round(x - 1), bot - 1, 3, 1],
  ];
}

const SPECS = {};
const def = (key, spec) => { SPECS[key] = spec; return spec; };

// ---------------------------------------------------------------------------
//  canids — the shape everything else is measured against
// ---------------------------------------------------------------------------

def('wolf', {
  w: 49, h: 35, stride: 3, grazeDrop: 7,
  pal: { out: '#221f1b', outFar: '#1a1714', far: '#332f29', sep: '#2b2823',
         dark: '#443f36', mid: '#6b6453', light: '#918872', belly: '#7d7565', eye: '#0c0a08', nose: '#141110' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: fore(27, 17, 34, 1.6) },
    { set: 'l4', z: -2, tone: 'far', shapes: hind(14, 16, 34, 2.2) },
    { set: 'tail', z: -3, shapes: [['c', 12, 17.0, 5.5, 20.5, 3.2, 2.6], ['c', 5.5, 19.5, 1.5, 23, 2.8, 1.3]] },
    { set: 'body', z: 0, shapes: [
      ['c', 12, 15.0, 29, 14.5, 5.6, 6.4],   // topline: level, withers a touch higher
      ['e', 29.5, 16.0, 5.8, 6.2],           // deep chest
      ['e', 13.5, 15.0, 6.2, 5.8],           // haunch
      ['x', 21, 24.0, 5.5, 2.4],             // belly tuck, carved back out
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 30, 12.5, 38.5, 9.0, 4.6, 3.2],      // neck, thick and low-slung
      ['e', 41, 8.8, 3.9, 3.5],                  // skull
      ['t', 38.2, 7.4, 40.2, 2.4, 42.4, 7.0],    // ear
      ['c', 43.2, 10.2, 47.2, 11.0, 1.9, 1.4],   // blocky muzzle
      ['e', 44.5, 11.8, 2.2, 1.2],               // jaw
    ] },
    { set: 'l1', z: -1, shapes: fore(31, 17, 34, 1.7) },
    { set: 'l2', z: -1, shapes: hind(17, 16, 34, 2.3) },
  ],
  feats: [
    { set: 'head', f: ['p', 42.6, 8.6, 'eye'] },
    { set: 'head', f: ['e', 47.3, 10.9, 1.1, 1.0, 'nose'] },
    { set: 'head', f: ['c', 43.4, 12.3, 46.6, 12.6, 0.9, 'belly'] },
    { set: 'head', f: ['t', 39.0, 6.6, 40.3, 3.6, 41.6, 6.4, 'dark'] },
  ],
});

def('coyote', {
  w: 42, h: 31, stride: 3, grazeDrop: 6,
  pal: { out: '#33261a', outFar: '#261c13', far: '#4a3826', sep: '#3d2e1f',
         dark: '#5c4630', mid: '#886a46', light: '#a98a5e', belly: '#a58a62', eye: '#0c0a08', nose: '#141110' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: fore(23, 15.5, 30, 1.3) },
    { set: 'l4', z: -2, tone: 'far', shapes: hind(11.5, 14.5, 30, 1.8) },
    { set: 'tail', z: -3, shapes: [['c', 10, 14.8, 5, 19, 2.7, 2.1], ['c', 5, 18, 2, 22, 2.3, 1.1]] },
    { set: 'body', z: 0, shapes: [
      ['c', 11, 13.4, 25, 13.0, 4.4, 5.0],
      ['e', 25.5, 14.2, 4.6, 5.0],
      ['e', 11, 13.4, 4.9, 4.6],
      ['x', 18, 20.4, 4.6, 2.2],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 26.5, 12.0, 33, 7.8, 3.1, 2.4],
      ['e', 35, 7.4, 2.9, 2.6],
      ['t', 32.4, 5.9, 34.0, 0.9, 36.2, 5.7],     // tall coyote ear
      ['c', 37.0, 8.5, 40.6, 9.2, 1.4, 1.0],      // narrow muzzle
      ['e', 38.2, 9.8, 1.8, 1.0],
    ] },
    { set: 'l1', z: -1, shapes: fore(26.5, 15.5, 30, 1.4) },
    { set: 'l2', z: -1, shapes: hind(14, 14.5, 30, 1.9) },
  ],
  feats: [
    { set: 'head', f: ['p', 36.4, 7.0, 'eye'] },
    { set: 'head', f: ['e', 40.7, 9.1, 1.0, 0.9, 'nose'] },
    { set: 'head', f: ['t', 33.1, 5.1, 34.2, 2.1, 35.3, 5.1, 'dark'] },
    { set: 'head', f: ['c', 37.2, 10.2, 40.0, 10.4, 0.8, 'belly'] },
  ],
});

def('fox', {
  w: 40, h: 28, stride: 3, grazeDrop: 5,
  pal: { out: '#5c2711', outFar: '#40190c', far: '#7d3413', sep: '#6b2c12',
         dark: '#93411a', mid: '#c25f24', light: '#e5843a', belly: '#d9c9a8', eye: '#0c0a08', nose: '#141110', sock: '#241a15' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: fore(20, 14, 27, 1.2) },
    { set: 'l4', z: -2, tone: 'far', shapes: hind(9.5, 13.5, 27, 1.6) },
    // the brush: as long as the body is deep, and the white tip is the species
    { set: 'tail', z: -3, shapes: [
      ['c', 9, 13.4, 3.0, 16.4, 3.4, 3.0],
      ['c', 3.0, 16.4, 0.8, 20.0, 3.0, 1.7],
    ] },
    { set: 'body', z: 0, shapes: [
      ['c', 9.5, 12.4, 22, 12.2, 3.9, 4.3],
      ['e', 22.5, 13.0, 4.0, 4.3],
      ['e', 9.5, 12.4, 4.3, 4.1],
      ['x', 16, 18.4, 4.2, 2.0],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 23.5, 11.2, 29, 7.4, 2.7, 2.2],
      ['e', 30.6, 6.9, 2.8, 2.5],
      ['t', 27.8, 5.4, 29.6, 0.8, 31.6, 5.2],     // big triangular ear
      ['c', 32.6, 8.0, 36.4, 8.8, 1.2, 0.8],      // sharp thin muzzle
      ['e', 33.6, 9.4, 1.8, 0.9],
    ] },
    { set: 'l1', z: -1, shapes: fore(23, 14, 27, 1.25) },
    { set: 'l2', z: -1, shapes: hind(12, 13.5, 27, 1.65) },
  ],
  feats: [
    { set: 'tail', f: ['e', 0.9, 19.2, 2.0, 1.8, 'belly'] },       // white tip
    { set: 'head', f: ['p', 31.9, 6.5, 'eye'] },
    { set: 'head', f: ['e', 36.5, 8.7, 0.9, 0.9, 'nose'] },
    { set: 'head', f: ['t', 28.5, 4.6, 29.7, 1.9, 30.9, 4.6, 'sock'] },
    { set: 'head', f: ['c', 32.6, 9.6, 35.8, 9.8, 0.8, 'belly'] },
    { set: 'l1', f: ['r', 21.6, 21, 3, 6, 'sock'] },                 // black stockings
    { set: 'l2', f: ['r', 9.6, 21, 4, 6, 'sock'] },
    { set: 'l3', f: ['r', 18.6, 21, 3, 6, 'outFar'] },
    { set: 'l4', f: ['r', 7.6, 21, 4, 6, 'outFar'] },
  ],
});

// ---------------------------------------------------------------------------
//  the heavies
//
//  The trick with a big animal is that it must not read as a big dog. Each of
//  these has one silhouette feature doing all the work: the bison's hump is
//  higher than its skull, the moose's nose overhangs its own chin, the bear
//  has no hump at all and its rump is its highest point.
// ---------------------------------------------------------------------------

def('bison', {
  w: 62, h: 55, stride: 3, grazeDrop: 5,
  pal: { out: '#221710', outFar: '#180f0a', far: '#2e2015', sep: '#2a1c12',
         dark: '#33241a', mid: '#523c28', mid2: '#412f20', light: '#705338', eye: '#0c0a08', horn: '#a3906f', hoof: '#181310', cape: '#2b1e14' },
  layers: [
    // Short legs. A bison stands about as high at the hump as it is long, and
    // almost all of that is body — put it on deer legs and it turns into a cow.
    { set: 'l3', z: -2, tone: 'far', shapes: fore(36, 37, 54, 2.8) },
    { set: 'l4', z: -2, tone: 'far', shapes: hind(14, 36, 54, 3.2) },
    { set: 'tail', z: -3, shapes: [['c', 9, 31, 6, 41, 1.5, 0.8]] },
    { set: 'body', z: 0, shapes: [
      ['e', 15, 30, 8.0, 7.6],                 // hindquarters, small and dropping away
      ['c', 15, 30, 27, 28, 7.6, 10.5],
      ['e', 31, 24, 11.5, 11.5],               // the hump — higher than the skull
      ['x', 22, 41, 8.0, 2.6],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 38, 27, 45, 33, 6.5, 5.2],         // head carried low, slung off the hump
      ['e', 48, 34, 4.4, 4.6],
      ['c', 50, 35.5, 56, 36.5, 3.0, 2.4],     // broad muzzle
      ['e', 45, 39, 3.6, 3.4],                 // the beard
      ['e', 43, 30, 5.0, 4.4],                 // shaggy forehead boss
    ] },
    { set: 'l1', z: -1, shapes: fore(40, 37, 54, 3.0) },
    { set: 'l2', z: -1, shapes: hind(18, 36, 54, 3.4) },
  ],
  feats: [
    // the horn: short, black at the base, hooking up and forward
    { set: 'head', f: ['A', 47.5, 30.5, 2.6, 1.4, -0.5, 1.1, 0.7, 'horn'] },
    { set: 'head', f: ['p', 47.4, 32.4, 'eye'] },
    { set: 'head', f: ['e', 56.2, 36.3, 1.3, 1.2, 'out'] },
    { set: 'head', f: ['e', 43, 29, 4.4, 3.4, 'cape'] },           // dark woolly cap
    { set: 'body', f: ['c', 26, 14.0, 38, 15.5, 1.6, 'light'] },   // lit crest of the hump
    { set: 'l1', f: ['r', 38, 52, 4, 2, 'hoof'] },
    { set: 'l2', f: ['r', 16, 52, 4, 2, 'hoof'] },
  ],
});

def('moose', {
  w: 60, h: 68, stride: 4, grazeDrop: 6,
  pal: { out: '#1d150f', outFar: '#150f0a', far: '#281c14', dark: '#2e2118', mid: '#453224', mid2: '#382819', light: '#5d4430', eye: '#0c0a08', horn: '#8d7c5e', leg: '#7d6a52' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: fore(33, 36, 67, 2.4) },
    { set: 'l4', z: -2, tone: 'far', shapes: hind(15, 35, 67, 2.8) },
    { set: 'tail', z: -3, shapes: [['c', 10, 30, 8, 34, 1.5, 1.0]] },
    { set: 'body', z: 0, shapes: [
      ['e', 15, 30, 7.5, 7.5],
      ['c', 15, 30, 28, 27, 7.5, 9.5],
      ['e', 30, 25, 9.5, 10.0],                 // withers hump, high and forward
      ['x', 22, 40, 7.5, 2.6],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 34, 21, 41, 13, 4.2, 3.2],          // long upright neck
      ['e', 44, 11, 4.0, 3.6],                  // skull
      ['c', 45, 13, 51, 16, 3.0, 3.2],          // that overhanging bulbous muzzle
      ['e', 44.5, 17.5, 2.0, 2.6],              // the bell
      ['t', 40.5, 9.0, 42.0, 5.0, 44.0, 8.8],   // ear
      // palmate antlers: two slabs with tines off the leading edge
      ['c', 42, 7.0, 35, 4.0, 1.2, 2.6],
      ['c', 45, 6.6, 53, 4.0, 1.2, 2.8],
      ['t', 33, 4.0, 31, 0.5, 36, 2.0],
      ['t', 54, 3.6, 57, 0.5, 51, 1.8],
    ] },
    { set: 'l1', z: -1, shapes: fore(37, 36, 67, 2.6) },
    { set: 'l2', z: -1, shapes: hind(19, 35, 67, 3.0) },
  ],
  feats: [
    { set: 'head', f: ['p', 46.0, 10.6, 'eye'] },
    { set: 'head', f: ['e', 51.4, 16.4, 1.2, 1.1, 'out'] },
    { set: 'head', f: ['c', 36, 5.6, 52, 5.0, 0.9, 'horn'] },      // antler top edge catches the light
    { set: 'l1', f: ['r', 35, 56, 4, 10, 'leg'] },                  // pale stockings, the moose tell
    { set: 'l2', f: ['r', 17, 56, 4, 10, 'leg'] },
  ],
});

def('bear', {
  w: 56, h: 45, stride: 3, grazeDrop: 8,
  pal: { out: '#15110e', outFar: '#0d0b09', far: '#241e19', dark: '#2b241e', mid: '#42372d', mid2: '#352c24', light: '#5c4c3d', eye: '#0c0a08', muzzle: '#8a7052' },
  layers: [
    // plantigrade: the whole foot on the ground, and no hump — the rump is the
    // highest point on a black bear, which is what separates it from a grizzly
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 33, 27, 34, 42, 3.0, 2.6], ['r', 32, 42, 7, 2]] },
    { set: 'l4', z: -2, tone: 'far', shapes: [['c', 15, 26, 15, 42, 3.6, 3.0], ['r', 12, 42, 8, 2]] },
    { set: 'body', z: 0, shapes: [
      ['e', 16, 22, 9.5, 9.0],                  // heavy rump, the high point
      ['c', 16, 22, 33, 24, 9.0, 8.5],
      ['e', 36, 24, 8.0, 8.0],
      ['x', 25, 33, 7.0, 2.2],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 40, 21, 45, 17, 4.6, 3.8],
      ['e', 47.5, 15.5, 5.0, 4.6],              // round skull, straight profile
      ['c', 49, 18, 54, 19.5, 2.4, 2.0],
      ['e', 44.4, 10.4, 2.4, 2.2],              // round ear, set wide and high
      ['e', 50.6, 10.2, 2.2, 2.0],
    ] },
    { set: 'l1', z: -1, shapes: [['c', 37, 27, 38, 42, 3.2, 2.8], ['r', 36, 42, 8, 2]] },
    { set: 'l2', z: -1, shapes: [['c', 19, 26, 19, 42, 3.8, 3.2], ['r', 16, 42, 9, 2]] },
  ],
  feats: [
    { set: 'head', f: ['p', 50.4, 15.4, 'eye'] },
    { set: 'head', f: ['c', 49.5, 18.6, 53.6, 19.4, 1.5, 'muzzle'] },   // tan muzzle
    { set: 'head', f: ['e', 54.2, 18.8, 1.2, 1.1, 'out'] },
    { set: 'head', f: ['e', 44.4, 10.4, 1.3, 1.2, 'dark'] },
    { set: 'head', f: ['e', 50.6, 10.2, 1.2, 1.1, 'dark'] },
  ],
});

// ---------------------------------------------------------------------------
//  the hoofed
// ---------------------------------------------------------------------------

def('elk', {
  w: 50, h: 57, stride: 4, grazeDrop: 8,
  pal: { out: '#2c1f12', outFar: '#1f160c', far: '#3a2a18', dark: '#4d3820', mid: '#7d5e35', mid2: '#664c2b', light: '#9d7845', eye: '#0c0a08', horn: '#a08e6a', neck: '#33230f', rump: '#cbb37e' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: fore(29, 31, 56, 1.8) },
    { set: 'l4', z: -2, tone: 'far', shapes: hind(13, 30, 56, 2.2) },
    { set: 'tail', z: -3, shapes: [['c', 9, 27, 7, 31, 1.4, 0.9]] },
    { set: 'body', z: 0, shapes: [
      ['e', 13, 26, 6.5, 6.6],
      ['c', 13, 26, 27, 25, 6.6, 7.4],
      ['e', 29, 25, 6.6, 7.2],
      ['x', 20, 34, 6.0, 2.2],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 32, 21, 39, 12, 4.0, 3.0],          // long neck carried high
      ['e', 42, 10, 3.4, 3.0],
      ['c', 43.5, 11.5, 48.5, 13, 2.0, 1.6],
      ['t', 39.0, 8.0, 40.6, 3.6, 42.6, 7.6],
      // the rack: a long beam sweeping back over the shoulders with tines
      ['c', 42.0, 7.4, 31, 3.2, 1.2, 0.8],
      ['c', 33, 4.0, 32, 0.5, 0.8, 0.6],
      ['c', 37, 4.4, 36.5, 1.0, 0.8, 0.6],
      ['c', 40.5, 5.2, 40.5, 1.6, 0.8, 0.6],
    ] },
    { set: 'l1', z: -1, shapes: fore(33, 31, 56, 1.9) },
    { set: 'l2', z: -1, shapes: hind(17, 30, 56, 2.3) },
  ],
  feats: [
    { set: 'head', f: ['p', 43.6, 9.6, 'eye'] },
    { set: 'head', f: ['e', 48.6, 12.8, 1.1, 1.0, 'out'] },
    { set: 'head', f: ['c', 32.5, 20, 38, 13.5, 2.4, 'neck'] },    // dark mane
    { set: 'body', f: ['e', 9.5, 24.5, 3.0, 3.4, 'rump'] },        // pale rump patch
  ],
});

def('pronghorn', {
  w: 38, h: 38, stride: 3, grazeDrop: 8,
  pal: { out: '#43301a', outFar: '#2f2112', far: '#5a4224', dark: '#7a5a2f', mid: '#a8813f', mid2: '#8d6b34', light: '#c39a56', eye: '#0c0a08', white: '#e6dfcb', horn: '#221a14' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: fore(22, 21, 37, 1.2) },
    { set: 'l4', z: -2, tone: 'far', shapes: hind(10, 20, 37, 1.5) },
    { set: 'body', z: 0, shapes: [
      ['e', 10, 17.5, 4.6, 4.6],
      ['c', 10, 17.5, 21, 17, 4.6, 5.2],
      ['e', 22.5, 17, 4.6, 5.2],
      ['x', 16, 23.5, 4.2, 1.8],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 25, 13.5, 30, 7.5, 2.6, 2.0],
      ['e', 32, 6.4, 2.6, 2.4],
      ['c', 33, 7.6, 36.6, 8.6, 1.5, 1.2],
      ['t', 29.6, 4.8, 30.6, 1.4, 32.2, 4.6],     // big mule-ish ear
      ['c', 32.2, 4.4, 32.6, 0.6, 0.8, 0.5],      // the pronged horn
      ['c', 32.4, 2.4, 34.4, 1.6, 0.6, 0.5],
    ] },
    { set: 'l1', z: -1, shapes: fore(25, 21, 37, 1.25) },
    { set: 'l2', z: -1, shapes: hind(13, 20, 37, 1.55) },
  ],
  feats: [
    { set: 'head', f: ['p', 33.4, 6.0, 'eye'] },
    { set: 'head', f: ['e', 36.6, 8.4, 0.9, 0.9, 'out'] },
    { set: 'head', f: ['c', 32.2, 4.2, 32.6, 0.8, 0.6, 'horn'] },
    // the white: rump, flank and two throat bars. This is the whole species.
    { set: 'body', f: ['e', 8.5, 17.5, 3.2, 3.6, 'white'] },
    { set: 'body', f: ['c', 13, 21.8, 21, 21.6, 1.0, 'white'] },
    { set: 'head', f: ['c', 26.5, 12.4, 29.6, 9.4, 1.0, 'white'] },
    { set: 'head', f: ['c', 28.0, 13.4, 30.6, 10.6, 0.8, 'white'] },
  ],
});

def('bighorn', {
  w: 42, h: 39, stride: 3, grazeDrop: 6,
  pal: { out: '#282018', outFar: '#1b160f', far: '#3a2e21', dark: '#463a2b', mid: '#63523c', mid2: '#513f2e', light: '#7e6a4e', eye: '#0c0a08', horn: '#9c8760', horn2: '#7a6746', white: '#d6cdb6' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: fore(22, 22, 38, 1.5) },
    { set: 'l4', z: -2, tone: 'far', shapes: hind(10, 21, 38, 1.8) },
    { set: 'body', z: 0, shapes: [
      ['e', 11, 18.5, 5.4, 5.4],
      ['c', 11, 18.5, 22, 18, 5.4, 6.0],
      ['e', 23.5, 18, 5.4, 6.0],
      ['x', 17, 25.5, 4.8, 1.8],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 26, 14, 31, 10.5, 3.4, 2.6],
      ['e', 33.5, 10, 2.9, 2.7],
      ['c', 34.5, 11.5, 38.5, 12.5, 1.7, 1.3],
    ] },
    // The curl: it starts above the eye, goes back over the skull, drops
    // behind the jaw and comes forward again. Drawn on its own so it keeps its
    // own colour instead of dissolving into the coat.
    { set: 'head', z: 3, tone: 'horn', shapes: [['a', 31.5, 9.5, 4.6, -1.1, -4.3, 1.6, 1.1]] },
    { set: 'l1', z: -1, shapes: fore(25, 22, 38, 1.6) },
    { set: 'l2', z: -1, shapes: hind(13, 21, 38, 1.9) },
  ],
  feats: [
    { set: 'head', f: ['a', 31.5, 9.5, 4.9, -1.5, -3.9, 0.6, 0.5, 'horn2'] },   // growth rings
    { set: 'head', f: ['p', 35.0, 9.4, 'eye'] },
    { set: 'head', f: ['e', 38.5, 12.3, 1.0, 0.9, 'out'] },
    { set: 'body', f: ['e', 8.5, 18.5, 2.8, 3.0, 'white'] },
    { set: 'head', f: ['c', 34.8, 12.9, 38.0, 13.2, 0.8, 'white'] },
  ],
});

// ---------------------------------------------------------------------------
//  the small and the round
//
//  Below about twenty pixels an animal stops being anatomy and becomes a
//  posture. A hare is two ears and a crouch; a pika is a potato with ears.
// ---------------------------------------------------------------------------

def('hare', {
  w: 26, h: 24, stride: 2, grazeDrop: 4,
  pal: { out: '#3b3123', outFar: '#2a231a', far: '#4d4130', dark: '#5c4f3a', mid: '#8a7a5c', mid2: '#736548', light: '#a89873', eye: '#0c0a08', white: '#ded4bb', inner: '#8a6a5c' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 13, 15, 13, 22, 1.3, 1.1], ['r', 12, 22, 3, 1]] },
    { set: 'tail', z: -3, shapes: [['e', 5, 14, 1.8, 1.7]] },
    { set: 'body', z: 0, shapes: [
      ['e', 9, 13.5, 5.2, 5.0],                  // crouched, weight over the haunch
      ['c', 9, 13.5, 16.5, 13.2, 5.0, 3.6],
      ['e', 17.6, 12.8, 3.2, 3.4],
    ] },
    { set: 'head', z: 1, shapes: [
      ['e', 21, 9.8, 3.0, 2.9],
      ['c', 22, 10.8, 24.8, 11.6, 1.4, 1.0],
      // the ears. Everything else is negotiable.
      ['c', 19.0, 7.8, 17.6, 0.9, 1.4, 1.1],
      ['c', 21.0, 7.6, 21.2, 0.7, 1.3, 1.0],
    ] },
    { set: 'l1', z: -1, shapes: [['c', 16, 15, 16.5, 22, 1.4, 1.2], ['r', 15, 22, 3, 1]] },
    // the hind leg is a folded spring, not a column
    { set: 'l2', z: -1, shapes: [['e', 9, 16.5, 3.4, 3.0], ['c', 8, 19, 12, 22.5, 1.5, 1.3], ['r', 10, 22, 4, 1]] },
    { set: 'l4', z: -2, tone: 'far', shapes: [['e', 7, 16.5, 3.0, 2.6], ['c', 6, 19, 10, 22.5, 1.3, 1.1]] },
  ],
  feats: [
    { set: 'head', f: ['p', 22.0, 9.3, 'eye'] },
    { set: 'head', f: ['e', 24.9, 11.5, 0.9, 0.8, 'out'] },
    { set: 'head', f: ['c', 19.0, 7.0, 17.8, 2.1, 0.5, 'inner'] },
    { set: 'head', f: ['c', 21.0, 6.8, 21.2, 1.9, 0.5, 'inner'] },
    { set: 'tail', f: ['e', 4.6, 14, 1.2, 1.1, 'white'] },
  ],
});

def('squirrel', {
  w: 25, h: 19, stride: 1,
  pal: { out: '#3d2313', outFar: '#2c190d', far: '#57301a', dark: '#6b3d20', mid: '#96562e', mid2: '#7e4826', light: '#b06d3d', eye: '#0c0a08', white: '#e0d2ba' },
  layers: [
    // the plume: arched up over the back, wider than the animal is deep
    { set: 'tail', z: -3, shapes: [
      ['c', 7, 13, 3, 7, 2.2, 2.8],
      ['c', 3, 7, 6, 2.5, 2.8, 2.4],
    ] },
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 13, 13.5, 13, 17.5, 1.1, 0.9]] },
    { set: 'body', z: 0, shapes: [
      ['e', 8.5, 12, 4.0, 3.8],
      ['c', 8.5, 12, 15, 11.5, 3.8, 3.2],
      ['e', 16, 11.5, 3.0, 3.2],
    ] },
    { set: 'head', z: 1, shapes: [
      ['e', 18.5, 8.5, 2.8, 2.6],
      ['c', 19.5, 9.4, 22.4, 9.8, 1.3, 0.9],
      ['e', 17.2, 5.6, 1.5, 1.6],                 // small round ear with a tuft
    ] },
    { set: 'l1', z: -1, shapes: [['c', 15.5, 13.5, 15.5, 17.5, 1.2, 1.0]] },
    { set: 'l2', z: -1, shapes: [['e', 8.5, 14, 2.4, 2.2], ['c', 8, 15.5, 10.5, 17.5, 1.2, 1.0]] },
  ],
  feats: [
    { set: 'head', f: ['e', 20.0, 8.2, 1.1, 1.0, 'eye'] },        // big eye — it is a squirrel
    { set: 'head', f: ['e', 22.5, 9.7, 0.8, 0.7, 'out'] },
    { set: 'body', f: ['c', 12, 14.2, 16.5, 13.4, 0.8, 'white'] }, // pale belly
    { set: 'tail', f: ['c', 3.4, 7, 6, 3.0, 0.9, 'light'] },       // lit edge of the plume
  ],
});

def('hedgehog', {
  w: 24, h: 19, stride: 1,
  pal: { out: '#2a231c', outFar: '#1d1813', far: '#3b3229', dark: '#43392c', mid: '#5f5443', mid2: '#4e4436', light: '#7d7059', eye: '#0c0a08', face: '#a89075', tip: '#cbbfa0' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 10, 14.5, 10, 17.5, 0.9, 0.8]] },
    // the dome of spines, and a small pointed face poking out of the front of it
    { set: 'body', z: 0, shapes: [
      ['e', 10, 11.5, 8.0, 6.2],
      ['x', 4, 18, 5.0, 1.6],
    ] },
    { set: 'head', z: 1, tone: 'face', shapes: [
      ['e', 18, 12.5, 3.0, 2.8],
      ['c', 19, 13.4, 22, 14.0, 1.4, 0.9],
    ] },
    { set: 'l1', z: -1, shapes: [['c', 13, 14.5, 13, 17.5, 1.0, 0.9]] },
    { set: 'l2', z: -1, shapes: [['c', 6, 14.5, 6, 17.5, 1.0, 0.9]] },
  ],
  feats: [
    { set: 'head', f: ['p', 19.2, 11.8, 'eye'] },
    { set: 'head', f: ['e', 22.2, 13.9, 0.9, 0.8, 'out'] },
    { set: 'head', f: ['e', 16.0, 10.2, 1.2, 1.1, 'face'] },
    // banded quills: the light tips are what make it read as spines rather
    // than as a rock with a nose
    { set: 'body', f: ['c', 4, 7.2, 8, 5.6, 0.8, 'tip'] },
    { set: 'body', f: ['c', 9, 5.4, 13, 6.0, 0.8, 'tip'] },
    { set: 'body', f: ['c', 14, 6.6, 17, 8.6, 0.8, 'tip'] },
    { set: 'body', f: ['c', 2.6, 10.5, 4.2, 13.5, 0.8, 'tip'] },
    { set: 'body', f: ['c', 6, 9.0, 8, 11.0, 0.7, 'dark'] },
    { set: 'body', f: ['c', 11, 8.4, 13, 10.4, 0.7, 'dark'] },
  ],
});

def('marmot', {
  w: 31, h: 23, stride: 2,
  pal: { out: '#31241a', outFar: '#231a12', far: '#43331f', dark: '#513e28', mid: '#7a6140', mid2: '#645033', light: '#9a7d55', eye: '#0c0a08', face: '#413020' },
  layers: [
    { set: 'tail', z: -3, shapes: [['c', 5, 15, 1.5, 17.5, 2.0, 1.2]] },
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 16, 17, 16, 21.5, 1.3, 1.1]] },
    { set: 'body', z: 0, shapes: [
      ['e', 9, 14.5, 6.0, 5.6],                  // fat cylinder, low to the ground
      ['c', 9, 14.5, 19, 14.5, 5.6, 4.8],
      ['e', 20, 14.5, 4.6, 4.8],
    ] },
    { set: 'head', z: 1, shapes: [
      ['e', 24, 12.5, 3.4, 3.2],                 // blunt face
      ['c', 25, 13.4, 28.5, 14.0, 1.6, 1.2],
      ['e', 22.4, 9.6, 1.4, 1.3],
    ] },
    { set: 'l1', z: -1, shapes: [['c', 19, 17, 19, 21.5, 1.4, 1.2]] },
    { set: 'l2', z: -1, shapes: [['c', 8, 17, 8, 21.5, 1.5, 1.3]] },
  ],
  feats: [
    { set: 'head', f: ['p', 25.4, 11.8, 'eye'] },
    { set: 'head', f: ['e', 28.6, 13.9, 1.0, 0.9, 'out'] },
    { set: 'head', f: ['c', 24.5, 14.4, 28, 14.8, 1.0, 'face'] },
  ],
});

def('pika', {
  w: 18, h: 17, stride: 1,
  pal: { out: '#3b3226', outFar: '#2a231a', far: '#4d4231', dark: '#584c39', mid: '#7d6f55', mid2: '#685c46', light: '#9a8c6d', eye: '#0c0a08', inner: '#8a7060' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 8, 12.5, 8, 15.5, 0.9, 0.8]] },
    // no neck, no tail: a round body with the head fused onto the front of it
    { set: 'body', z: 0, shapes: [
      ['e', 7.5, 10.5, 5.4, 4.8],
      ['c', 7.5, 10.5, 12, 10, 4.8, 3.8],
    ] },
    { set: 'head', z: 1, shapes: [
      ['e', 13, 8.5, 3.4, 3.2],
      ['c', 14, 9.4, 16.4, 9.8, 1.4, 0.9],
      ['e', 11.4, 3.4, 2.4, 2.3],                 // the ears: huge, round, edge-on
      ['e', 14.8, 4.0, 2.0, 2.0],
    ] },
    { set: 'l1', z: -1, shapes: [['c', 11, 12.5, 11, 15.5, 1.0, 0.9]] },
    { set: 'l2', z: -1, shapes: [['c', 6, 12.5, 6, 15.5, 1.0, 0.9]] },
  ],
  feats: [
    { set: 'head', f: ['p', 14.4, 8.0, 'eye'] },
    { set: 'head', f: ['e', 16.5, 9.7, 0.8, 0.7, 'out'] },
    { set: 'head', f: ['e', 11.4, 3.4, 1.3, 1.3, 'inner'] },
    { set: 'head', f: ['e', 14.9, 4.0, 1.1, 1.1, 'inner'] },
  ],
});

// ---------------------------------------------------------------------------
//  the water-shaped
// ---------------------------------------------------------------------------

def('beaver', {
  w: 40, h: 25, stride: 2,
  pal: { out: '#2a1c13', outFar: '#1c130d', far: '#3b2819', dark: '#452f1e', mid: '#6b4a2e', mid2: '#573c26', light: '#8a6440', eye: '#0c0a08', tail: '#4d3b2c', tooth: '#dcc46e' },
  layers: [
    // the paddle: flat, horizontal, scaly. Drawn as its own slab so it reads
    // as a separate object rather than as a fat tail.
    { set: 'tail', z: -3, tone: 'tail', shapes: [['e', 5, 20, 6.5, 2.0]] },
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 21, 18, 21, 22.5, 1.3, 1.1]] },
    { set: 'body', z: 0, shapes: [
      ['e', 13, 14.5, 7.5, 6.6],                 // pear-shaped, heaviest at the hips
      ['c', 13, 14.5, 25, 14, 6.6, 4.6],
      ['e', 26, 14, 4.4, 4.6],
    ] },
    { set: 'head', z: 1, shapes: [
      ['e', 30.5, 12, 4.0, 3.8],
      ['c', 32, 13.2, 36.5, 14.2, 2.0, 1.5],     // blunt heavy muzzle
      ['e', 28.6, 8.6, 1.4, 1.3],
    ] },
    { set: 'l1', z: -1, shapes: [['c', 24, 18, 24, 22.5, 1.4, 1.2], ['r', 22, 22, 4, 1]] },
    { set: 'l2', z: -1, shapes: [['c', 12, 19, 12, 22.5, 1.6, 1.4], ['r', 10, 22, 5, 1]] },
  ],
  feats: [
    { set: 'head', f: ['p', 32.0, 11.2, 'eye'] },
    { set: 'head', f: ['e', 36.6, 14.0, 1.1, 1.0, 'out'] },
    { set: 'head', f: ['r', 35.4, 14.4, 2, 2, 'tooth'] },          // the incisors
    { set: 'tail', f: ['c', 0.5, 20, 9.5, 20, 0.6, 'outFar'] },    // scaled paddle
    { set: 'tail', f: ['c', 3, 18.7, 3, 21.3, 0.5, 'outFar'] },
    { set: 'tail', f: ['c', 7, 18.7, 7, 21.3, 0.5, 'outFar'] },
  ],
});

def('otter', {
  w: 40, h: 22, stride: 2,
  pal: { out: '#241c15', outFar: '#18120d', far: '#33281e', dark: '#3b2f24', mid: '#5c4b3a', mid2: '#4b3c2e', light: '#7a6650', eye: '#0c0a08', throat: '#b5a68a' },
  layers: [
    // one long low tube from nose to tail tip, and the tail is a third of it
    { set: 'tail', z: -3, shapes: [['c', 9, 15.5, 1, 18.5, 2.6, 1.0]] },
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 22, 17, 22, 20.5, 1.1, 0.9]] },
    { set: 'body', z: 0, shapes: [
      ['e', 11, 14.5, 5.4, 4.2],
      ['c', 11, 14.5, 26, 13.5, 4.2, 3.8],
      ['e', 27, 13.5, 3.6, 3.8],
    ] },
    { set: 'head', z: 1, shapes: [
      ['e', 31.5, 11.5, 3.4, 3.2],               // broad flat skull
      ['c', 33, 12.6, 36.8, 13.2, 1.7, 1.3],
      ['e', 29.6, 8.6, 1.2, 1.1],                // tiny round ear, set far back
    ] },
    { set: 'l1', z: -1, shapes: [['c', 25, 17, 25, 20.5, 1.2, 1.0], ['r', 23, 20, 4, 1]] },
    { set: 'l2', z: -1, shapes: [['c', 12, 17, 12, 20.5, 1.3, 1.1], ['r', 10, 20, 4, 1]] },
  ],
  feats: [
    { set: 'head', f: ['p', 33.2, 10.8, 'eye'] },
    { set: 'head', f: ['e', 36.9, 13.0, 1.1, 1.0, 'out'] },
    { set: 'head', f: ['c', 31.5, 14.0, 36, 14.2, 1.1, 'throat'] },   // pale throat
    { set: 'body', f: ['c', 27.5, 15.6, 30, 14.6, 1.0, 'throat'] },
  ],
});

// ---------------------------------------------------------------------------
//  the mustelids you fight beside
// ---------------------------------------------------------------------------

def('ferretWild', {
  w: 36, h: 24, stride: 2,
  pal: { out: '#3b2d1d', outFar: '#2a1f14', far: '#54402a', dark: '#5e4830', mid: '#8f7752', mid2: '#77613f', light: '#b8a179', eye: '#0c0a08', mask: '#2e2417', cream: '#d3c39c' },
  layers: [
    { set: 'tail', z: -3, shapes: [['c', 8, 14, 1, 16.5, 2.0, 1.2]] },
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 20, 17, 20, 21.5, 1.0, 0.9]] },
    { set: 'body', z: 0, shapes: [
      ['e', 10, 14, 4.4, 3.6],                   // long, low, and almost the same
      ['c', 10, 14, 23, 13.5, 3.6, 3.2],         // depth from shoulder to hip
      ['e', 24, 13.5, 3.0, 3.2],
    ] },
    { set: 'head', z: 1, shapes: [
      ['e', 28, 11.5, 2.8, 2.6],
      ['c', 29, 12.4, 32.6, 13.0, 1.4, 1.0],
      ['e', 26.4, 8.8, 1.4, 1.3],                // small round ear
    ] },
    { set: 'l1', z: -1, shapes: [['c', 22.5, 17, 22.5, 21.5, 1.1, 1.0], ['r', 21, 21, 3, 1]] },
    { set: 'l2', z: -1, shapes: [['c', 10, 17, 10, 21.5, 1.2, 1.1], ['r', 8, 21, 4, 1]] },
  ],
  feats: [
    { set: 'head', f: ['c', 26.6, 11.0, 31.0, 12.0, 1.2, 'mask'] },   // the bandit mask
    { set: 'head', f: ['p', 29.0, 11.0, 'eye'] },
    { set: 'head', f: ['e', 32.7, 12.9, 1.0, 0.9, 'out'] },
    { set: 'head', f: ['c', 30, 13.4, 32.4, 13.6, 0.9, 'cream'] },
    { set: 'body', f: ['c', 13, 16.6, 22, 16.2, 0.8, 'cream'] },
    { set: 'tail', f: ['e', 1.4, 16.4, 1.4, 1.2, 'mask'] },           // dark tail tip
  ],
});

def('kit', {
  w: 24, h: 18, stride: 1,
  pal: { out: '#43331f', outFar: '#2f2416', far: '#5e4830', dark: '#75593c', mid: '#b09a72', mid2: '#96825b', light: '#dccaa2', eye: '#0c0a08', mask: '#3b2f1e', cream: '#eee2c4' },
  layers: [
    { set: 'tail', z: -3, shapes: [['c', 6, 11, 1, 12.5, 1.5, 0.9]] },
    { set: 'l3', z: -2, tone: 'far', shapes: [['c', 13, 13, 13, 16, 0.8, 0.7]] },
    { set: 'body', z: 0, shapes: [
      ['e', 7.5, 11, 3.2, 2.8],
      ['c', 7.5, 11, 15, 10.5, 2.8, 2.5],
      ['e', 16, 10.5, 2.4, 2.5],
    ] },
    { set: 'head', z: 1, shapes: [
      ['e', 19, 9, 2.4, 2.3],                    // proportionally huge head
      ['c', 19.8, 9.8, 22, 10.2, 1.1, 0.8],
      ['e', 17.6, 6.6, 1.3, 1.2],
    ] },
    { set: 'l1', z: -1, shapes: [['c', 15, 13, 15, 16, 0.9, 0.8]] },
    { set: 'l2', z: -1, shapes: [['c', 7, 13, 7, 16, 0.9, 0.8]] },
  ],
  feats: [
    { set: 'head', f: ['c', 17.8, 8.6, 20.6, 9.4, 1.0, 'mask'] },
    { set: 'head', f: ['p', 19.8, 8.6, 'eye'] },
    { set: 'head', f: ['e', 22.1, 10.1, 0.8, 0.7, 'out'] },
    { set: 'body', f: ['c', 8, 12.8, 15, 12.4, 0.8, 'cream'] },
  ],
});

// ---------------------------------------------------------------------------
//  the birds
//
//  Birds are a body, a wing laid over it, and legs like wire. The wing is a
//  separate layer so it can lift; the folded wing's trailing edge is the one
//  line that stops a bird looking like a fish.
// ---------------------------------------------------------------------------

def('raven', {
  w: 34, h: 21, stride: 1,
  pal: { out: '#090c10', outFar: '#06080b', far: '#131820', dark: '#151b24', mid: '#242e3c', mid2: '#1b2330', light: '#3d4b60', eye: '#c8b25a', sheen: '#4e6280', bill: '#0e1116' },
  layers: [
    { set: 'tail', z: -3, shapes: [['c', 9, 12, 0.5, 15, 2.4, 1.5]] },     // wedge tail, held low
    // The body tilts: tail down at the back, chest up at the front. A level
    // ellipse is what makes a drawn bird look like a fish.
    { set: 'body', z: 0, shapes: [
      ['c', 8, 12.5, 18, 8.5, 4.4, 4.0],
      ['e', 20, 8.0, 3.2, 3.4],
      ['e', 20.5, 10.5, 3.0, 2.0],                                          // shaggy throat hackles
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 21, 7.5, 24, 5.0, 2.8, 2.6],                                    // a real neck
      ['e', 25.5, 4.2, 2.8, 2.6],
    ] },
    { set: 'head', z: 3, tone: 'bill', shapes: [['c', 27, 4.2, 32.5, 5.4, 1.7, 0.8]] },
    { set: 'wing', z: 2, shapes: [['c', 16.5, 9.5, 8, 13, 3.0, 1.3]] },
    { set: 'l1', z: -1, tone: 'dark', shapes: birdLeg(15, 14, 20, 0.9) },
    { set: 'l2', z: -2, tone: 'far', shapes: birdLeg(12, 14, 20, 0.8) },
  ],
  feats: [
    { set: 'head', f: ['p', 26.6, 3.6, 'eye'] },
    { set: 'head', f: ['c', 27.5, 5.0, 31.6, 6.0, 0.5, 'outFar'] },         // the bill's seam
    { set: 'wing', f: ['c', 15.5, 11.6, 8.5, 13.6, 0.9, 'sheen'] },         // lit trailing edge
    { set: 'wing', f: ['c', 14, 8.6, 10, 10.4, 0.8, 'light'] },
  ],
});

def('magpie', {
  w: 29, h: 17, stride: 1,
  pal: { out: '#090c10', outFar: '#06080b', far: '#131820', dark: '#151b24', mid: '#242e3c', mid2: '#1b2330', light: '#3d4b60', eye: '#0c0a08', white: '#e2e4e0', sheen: '#2f6a5e', bill: '#0e1116' },
  layers: [
    // the tail is longer than the bird, and it is the whole species
    { set: 'tail', z: -3, shapes: [['c', 9, 9.5, 0.5, 13.5, 1.7, 0.9]] },
    { set: 'body', z: 0, shapes: [
      ['c', 8.5, 10, 16, 6.5, 3.4, 3.0],
      ['e', 17.5, 6.0, 2.4, 2.6],
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 18.5, 5.5, 20.5, 3.6, 2.2, 2.1],
      ['e', 21.5, 3.2, 2.2, 2.1],
    ] },
    { set: 'head', z: 3, tone: 'bill', shapes: [['c', 22.6, 3.4, 26, 4.4, 1.1, 0.6]] },
    { set: 'wing', z: 2, shapes: [['c', 14, 7.5, 7, 11, 2.3, 1.0]] },
    { set: 'l1', z: -1, tone: 'dark', shapes: birdLeg(13, 11, 16, 0.8) },
    { set: 'l2', z: -2, tone: 'far', shapes: birdLeg(11, 11, 16, 0.7) },
  ],
  feats: [
    { set: 'head', f: ['p', 22.4, 2.8, 'eye'] },
    { set: 'body', f: ['e', 13.5, 9.2, 2.8, 1.6, 'white'] },                // white flank and belly
    { set: 'body', f: ['e', 16.5, 7.6, 1.6, 1.4, 'white'] },
    { set: 'wing', f: ['c', 12, 8.8, 8, 10.8, 1.0, 'white'] },              // white primaries
    { set: 'tail', f: ['c', 6, 11.0, 2, 13.0, 0.6, 'sheen'] },
  ],
});

def('eagle', {
  w: 40, h: 25, stride: 1,
  pal: { out: '#150e09', outFar: '#0d0906', far: '#241a11', dark: '#2b1f15', mid: '#4a3626', mid2: '#3a2a1c', light: '#63492f', eye: '#d8c88a', white: '#e6e2d6', beak: '#dfae2c', foot: '#c8951f' },
  layers: [
    { set: 'tail', z: -3, tone: 'white', shapes: [['c', 9, 15.5, 1, 17.5, 3.0, 2.2]] },
    { set: 'body', z: 0, shapes: [
      ['c', 9, 15, 20, 11, 5.4, 4.6],
      ['e', 21.5, 11, 3.4, 4.2],
    ] },
    // the white head is the species; it must be clearly a head on a neck, not
    // a pale patch on the front of the body
    { set: 'head', z: 1, tone: 'white', shapes: [
      ['c', 23, 10, 26.5, 6.0, 2.9, 2.9],
      ['e', 28.5, 4.6, 3.0, 2.8],
    ] },
    { set: 'head', z: 3, tone: 'beak', shapes: [
      ['c', 30.4, 4.2, 34.6, 5.0, 1.8, 1.2],
      ['c', 34.4, 4.9, 35.2, 6.8, 1.2, 0.7],                                // the hook
    ] },
    { set: 'wing', z: 2, shapes: [['c', 17, 12.5, 8.5, 16.5, 3.6, 1.6]] },
    { set: 'l1', z: -1, tone: 'foot', shapes: [['c', 19, 16.5, 19, 21, 1.3, 1.1], ['r', 17, 21, 5, 1]] },
    { set: 'l2', z: -2, tone: 'far', shapes: [['c', 16, 16.5, 16, 21, 1.1, 0.9], ['r', 14, 21, 4, 1]] },
  ],
  feats: [
    { set: 'head', f: ['p', 30.0, 3.8, 'eye'] },
    { set: 'head', f: ['p', 30.6, 3.8, 'out'] },
    { set: 'head', f: ['c', 31, 5.0, 34.2, 5.8, 0.5, 'out'] },                // gape line
    { set: 'wing', f: ['c', 15.5, 14.6, 9, 17.4, 1.1, 'dark'] },
    { set: 'wing', f: ['c', 15, 11.2, 11, 12.6, 0.9, 'light'] },
  ],
});

def('crane', {
  w: 36, h: 34, stride: 2, grazeDrop: 7,
  pal: { out: '#332f2b', outFar: '#232120', far: '#474139', dark: '#4e4840', mid: '#7d766a', mid2: '#665f55', light: '#a09889', eye: '#b8a05a', crown: '#a83226', beak: '#3e3830' },
  layers: [
    { set: 'l3', z: -2, tone: 'far', shapes: birdLeg(15, 20, 33, 0.9) },
    { set: 'body', z: 0, shapes: [
      ['e', 14, 17, 6.4, 4.4],
      ['c', 14, 17, 21, 16, 4.4, 3.6],
      ['e', 8.5, 15.5, 4.4, 3.6],                 // the bustle over the rump
    ] },
    { set: 'head', z: 1, shapes: [
      ['c', 21, 14, 25, 4.5, 2.4, 1.7],           // long neck, held straight up
      ['e', 26, 3.5, 2.2, 2.0],
      ['c', 27, 3.6, 33.5, 4.6, 1.1, 0.7],        // long straight bill
    ] },
    { set: 'wing', z: 2, shapes: [['e', 15, 16.5, 5.4, 2.8]] },
    { set: 'l1', z: -1, tone: 'dark', shapes: birdLeg(18, 20, 33, 1.0) },
  ],
  feats: [
    { set: 'head', f: ['p', 27.0, 2.9, 'eye'] },
    { set: 'head', f: ['e', 25.6, 1.9, 1.6, 1.0, 'crown'] },        // the red crown
    { set: 'head', f: ['C', 27.5, 3.7, 33.5, 4.6, 0.7, 'beak'] },
    { set: 'body', f: ['c', 6, 13.4, 11, 14.4, 1.2, 'light'] },     // lit bustle plumes
    { set: 'wing', f: ['c', 11.5, 17.6, 19, 17.0, 0.9, 'dark'] },
  ],
});

// ---------------------------------------------------------------------------
//  the public face of it
// ---------------------------------------------------------------------------

export const BEAST_PIX_KEYS = () => Object.keys(SPECS);
export function hasPixArt(key) { return !!SPECS[key]; }
export function pixSpec(key) { return SPECS[key]; }

/** Frames for one animal, cached. Null for a species with no art yet. */
export function pixFrames(key, anim, frames = 6, scale = PIX, expr = 'calm') {
  const spec = SPECS[key];
  if (!spec) return null;
  return getSheet(`pix:${key}:${anim}:${frames}:${scale}:${expr}`, () => {
    const out = [];
    for (let i = 0; i < frames; i++) out.push(renderFrame(spec, anim, i / frames, scale, expr));
    return out;
  });
}

export function pixSize(key, scale = PIX) {
  const spec = SPECS[key];
  if (!spec) return null;
  const S = Math.max(1, Math.round(scale));
  return { w: spec.w * S, h: spec.h * S };
}

/** Flat black, for checking that the silhouette alone carries the species. */
export function pixSilhouette(key, anim = 'idle', scale = PIX) {
  const spec = SPECS[key];
  if (!spec) return null;
  const flat = { out: '#000000', dark: '#000000', mid: '#000000', light: '#000000' };
  const sub = Object.assign({}, spec, { pal: Object.assign({}, spec.pal, flat), feats: [] });
  return renderFrame(sub, anim, 0, scale);
}

export { SPECS as BEASTS_PIX };
