// The ferret, drawn live.
//
// Every other animal in the game is baked: eight frames per animation, painted
// once into canvases and blitted. That is right for a bison, which is a barrel
// on four posts and moves like one. It is wrong for a mustelid.
//
// A black-footed ferret is forty centimetres of spine with very short legs
// bolted underneath. It does not walk, it flows: the body is a wave, the back
// arches on every bound, and when it turns, the front end goes first and the
// rest of it follows a beat later. None of that survives being cut into eight
// keyframes.
//
// So this one is a rig, not a sprite sheet. A chain of spine nodes trails the
// head with real follow-the-leader constraints, a travel-driven phase runs a
// bound wave down it, and the feet are placed by inverse kinematics: a paw
// plants, the body moves over it, and it swings forward only when it has been
// left too far behind. The animation is a side effect of the movement rather
// than a loop playing next to it.

import { P } from './palette.js';
import { TAU, clamp, lerp } from '../engine/math.js';

/** Cheap scatter for blink timing. Does not need to be good. */
/** Lighten a hex by a fraction. */
function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amt));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt));
  const b = Math.min(255, Math.round((n & 255) + (255 - (n & 255)) * amt));
  return `rgb(${r},${g},${b})`;
}

function rndish(v) { const x = Math.sin(v * 12.9898) * 43758.5453; return x - Math.floor(x); }

// ---------------------------------------------------------------------------
//  shape
// ---------------------------------------------------------------------------

const SEGS = 15;            // spine nodes, nose to tail tip
const LINK = 1.15;          // world units between nodes: short, so it curves smoothly
const MAX_BEND = 0.42;      // radians of bend allowed at each joint

// Body radius along the spine, nose (0) to tail tip (1). A black-footed ferret
// is a tube: barely thicker at the shoulder than at the hip, and never as tall
// as it is long. Small numbers here are the whole point.
const PROFILE = [
  1.5, 1.8, 1.9, 2.0, 2.0,  // neck and shoulder
  2.0, 1.9, 1.9, 1.9, 1.9,  // the long middle
  1.7, 1.3, 1.0, 0.8, 0.5,  // hip into tail
];
const SHOULDER = 4;         // spine index the front legs hang off
const HIP = 9;              // ...and the back legs
const TAIL_FROM = 11;       // where the tail starts, for colouring

const COL = {
  base: '#c9b083',
  light: '#e2cca0',
  belly: '#f2e6c8',
  dark: '#a8926a',
  guard: '#8a7452',
  mask: '#3a3026',
  earInner: '#b98d84',
  face: '#f0e4cc',
  foot: '#2a241c',
  tailTip: '#2a241c',
  nose: '#1a1410',
  eye: '#171310',
  outline: '#171a16',
};

// ---------------------------------------------------------------------------
//  the rig
// ---------------------------------------------------------------------------

export class FerretRig {
  constructor() {
    this.spine = [];
    for (let i = 0; i < SEGS; i++) this.spine.push({ x: 0, y: 0 });
    this.ready = false;
    this.phase = 0;          // gait phase, advanced by distance travelled
    this.bound = 0;          // 0..1 how much of a bound is in the gait
    this.headBob = 0;
    this.lift = 0;           // whole-body lift, for a dash
    this.crouch = 0;
    this.feet = [];
    for (let i = 0; i < 4; i++) this.feet.push({ x: 0, y: 0, px: 0, py: 0, swing: 0, planted: true });
    this.travel = 0;
    this.facing = 1;
    this.lastX = 0; this.lastY = 0;
    // the bite: a lunge and a snap, driven from the same place as everything
    // else so the body comes with the head instead of the head sliding off it
    this.biteT = 0;
    this.biteDur = 0.26;
    this.biteAng = 0;
    this.blinkT = 0;
    this.earFlick = 0;
  }

  /**
   * Dash in and bite. The head goes first and hard, the jaw opens on the way
   * in and closes at full extension, and the body follows because it has no
   * choice — which is the whole reason the rig exists.
   */
  bite(ang) {
    this.biteT = this.biteDur;
    this.biteAng = ang;
  }

  /** 0 while idle, 0..1 through the lunge, for anything that wants to react. */
  get biteProgress() {
    return this.biteT > 0 ? 1 - this.biteT / this.biteDur : 0;
  }

  /** Snap the whole body to a point. Used on spawn and after a teleport. */
  reset(x, y) {
    for (let i = 0; i < SEGS; i++) { this.spine[i].x = x - i * LINK; this.spine[i].y = y; }
    for (const f of this.feet) { f.x = x; f.y = y; f.px = x; f.py = y; f.swing = 0; }
    this.lastX = x; this.lastY = y;
    this.ready = true;
  }

  /**
   * Advance the body. `head` is where the nose wants to be; everything else
   * is derived from how far it actually moved.
   */
  update(dt, o) {
    const { x, y, vx, vy, facing, anim, dashing, aim } = o;
    if (!this.ready) this.reset(x, y);

    const speed = Math.hypot(vx, vy);
    const moved = Math.hypot(x - this.lastX, y - this.lastY);
    this.lastX = x; this.lastY = y;
    this.travel += moved;

    // The gait phase runs off distance, not time, so the feet never skate and
    // the body never keeps bounding while you stand still.
    const strideLen = speed > 150 ? 16 : 11;
    this.phase = (this.travel / strideLen) % 1;

    // How much of a bound is in it. A ferret trots at low speed and bounds
    // flat out, and the arch in the back is the difference.
    const wantBound = clamp((speed - 45) / 130, 0, 1);
    this.bound += (wantBound - this.bound) * Math.min(1, dt * 7);
    this.lift += ((dashing ? 2.2 : 0) - this.lift) * Math.min(1, dt * 12);
    const wantCrouch = anim === 'sit' || anim === 'dead' ? 2.4 : anim === 'hurt' ? 1.2 : 0;
    this.crouch += (wantCrouch - this.crouch) * Math.min(1, dt * 8);
    if (facing) this.facing = facing;

    // --- the spine ---------------------------------------------------------
    // The nose leads. Every other node is pulled to a fixed distance behind
    // the one in front of it, which is the entire secret: turn and the body
    // sweeps round behind you on its own, with no animation authored for it.
    const head = this.spine[0];
    // The nose leads toward whatever has her attention: where she is going if
    // she is moving, where she is looking if she is not.
    let lookAng = this.lookAng == null ? 0 : this.lookAng;
    const want = speed > 12 ? Math.atan2(vy, vx) : (aim != null ? aim : lookAng);
    let d2 = want - lookAng;
    while (d2 > Math.PI) d2 -= TAU;
    while (d2 < -Math.PI) d2 += TAU;
    lookAng += d2 * Math.min(1, dt * 13);
    this.lookAng = lookAng;
    // A bite throws the nose a long way forward for a fifth of a second, and
    // points it at what she is biting rather than where she is walking.
    this.biteT = Math.max(0, this.biteT - dt);
    let lead = 2.2, headAng = lookAng;
    if (this.biteT > 0) {
      const f = this.biteProgress;
      // out fast, back slow: the snap is on the way in
      const reach = f < 0.45 ? f / 0.45 : 1 - (f - 0.45) / 0.55 * 0.75;
      lead = 2.2 + reach * 7.5;
      headAng = this.biteAng;
      this.lookAng = this.biteAng;
    }
    head.x = x + Math.cos(headAng) * lead;
    head.y = y - 2.6 + Math.sin(headAng) * lead * 0.55;

    // blinks and ear flicks, so a standing ferret is never completely still
    this.blinkT -= dt;
    if (this.blinkT < -0.1) this.blinkT = rndish(this.travel + x) * 3 + 2.2;
    this.earFlick = Math.max(0, this.earFlick - dt);
    if (this.earFlick <= 0 && speed < 20 && Math.random() < dt * 0.4) this.earFlick = 0.3;

    for (let i = 1; i < SEGS; i++) {
      const a = this.spine[i - 1], b = this.spine[i];
      let dx = b.x - a.x, dy = b.y - a.y;
      let ang = (dx || dy) ? Math.atan2(dy, dx) : Math.PI;

      // Limit how far each joint can bend away from the one in front of it.
      // This is what turns a loose chain into a spine: the head goes first,
      // and the turn travels down the body a joint at a time, which is the
      // whip you see when a real mustelid corners.
      if (i >= 2) {
        const prev = this.spine[i - 2];
        const pang = Math.atan2(a.y - prev.y, a.x - prev.x);
        let da = ang - pang;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        da = clamp(da, -MAX_BEND, MAX_BEND);
        // Uncoil when she is not going anywhere. Without this the chain keeps
        // whatever curl it was left in and a standing ferret is a croissant.
        const straighten = Math.min(0.9, dt * (speed < 24 ? 4.2 : 1.1));
        ang = pang + da * (1 - straighten);
      }

      // Placed exactly, never sprung. A soft constraint stretches at speed and
      // the ferret comes out as a smear; a hard one cannot.
      const link = LINK * (i > TAIL_FROM ? 1.2 : 1);
      b.x = a.x + Math.cos(ang) * link;
      b.y = a.y + Math.sin(ang) * link;
    }

    // --- feet ---------------------------------------------------------------
    // Each foot has a target under its shoulder or hip. It stays planted until
    // the target has walked too far away, then swings to meet it. That is what
    // stops the legs from skating and it costs almost nothing.
    const stepDist = 3.6 + speed * 0.022;
    for (let i = 0; i < 4; i++) {
      const f = this.feet[i];
      const front = i < 2;
      const node = this.spine[front ? SHOULDER : HIP];
      const side = i % 2 === 0 ? 1 : -1;
      // perpendicular to the local spine direction, so feet sit either side
      const ahead = this.spine[front ? SHOULDER - 1 : HIP - 1];
      const ang = Math.atan2(node.y - ahead.y, node.x - ahead.x);
      const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
      const tgtX = node.x + nx * side * 1.3 - Math.cos(ang) * 0.8;
      const tgtY = node.y + ny * side * 0.6 + 3.4;

      if (f.swing > 0) {
        f.swing = Math.max(0, f.swing - dt * (7 + speed * 0.05));
        const t = 1 - f.swing;
        f.x = lerp(f.px, tgtX + Math.cos(ang) * stepDist * 0.5, t);
        f.y = lerp(f.py, tgtY, t);
      } else {
        const gap = Math.hypot(f.x - tgtX, f.y - tgtY);
        // A foot that has somehow been left a long way behind — a teleport, a
        // respawn, a dash through a wall — just catches up rather than
        // stringing the leg out across the screen.
        if (gap > stepDist * 3.5) { f.x = tgtX; f.y = tgtY; f.swing = 0; }
        else if (gap > stepDist) {
          // diagonal pairs on a trot, front-and-back pairs on a bound
          const partner = this.feet[i ^ (this.bound > 0.5 ? 1 : 3)];
          if (!partner || partner.swing <= 0.35) {
            f.px = f.x; f.py = f.y; f.swing = 1;
          }
        }
      }
    }

    this.headBob = Math.sin(this.phase * TAU) * (0.5 + this.bound * 1.2);
  }

  /** Height of the arch at a point along the body, 0 (nose) to 1 (tail). */
  _arch(f) {
    // One hump that travels down the spine as the gait cycles: the back rises
    // as the hind feet come under, which is the shape of a mustelid bound.
    const wave = Math.sin((f - this.phase) * TAU) * Math.sin(f * Math.PI);
    return wave * (0.8 + this.bound * 4.2);
  }

  // -------------------------------------------------------------------------
  //  drawing
  // -------------------------------------------------------------------------

  /**
   * Draw straight into the world buffer. No baked frames, no cache: the pose
   * only exists this frame.
   */
  draw(r, opts = {}) {
    const ctx = r.ctx;
    const cam = r.camera;
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const tint = opts.tint || null;
    const S = opts.scale == null ? 1 : opts.scale;
    if (alpha <= 0) return;

    const ox = cam.ox, oy = cam.oy;

    // per-node screen positions, with the gait arch folded in
    const pts = [];
    for (let i = 0; i < SEGS; i++) {
      const f = i / (SEGS - 1);
      const n = this.spine[i];
      pts.push({
        x: n.x - ox,
        y: n.y - oy - this._arch(f) - this.lift + this.crouch * (0.5 + f * 0.5),
        r: PROFILE[i] * S,
        f,
      });
    }

    ctx.globalAlpha = alpha;

    // --- legs, behind the body ---------------------------------------------
    for (let i = 0; i < 4; i++) {
      const f = this.feet[i];
      const front = i < 2;
      const node = pts[front ? SHOULDER : HIP];
      const far = i % 2 === 1;
      const hipX = node.x + (front ? 0.5 : -0.5) * this.facing;
      const hipY = node.y + node.r * 0.4;
      const lifted = f.swing > 0 ? Math.sin((1 - f.swing) * Math.PI) * 2 : 0;
      const fx = f.x - ox, fy = f.y - oy - lifted;
      // short, thick, bent: a ferret's leg is barely longer than its foot
      const kneeX = (hipX + fx) / 2 + (front ? 0.7 : -0.7) * this.facing;
      const kneeY = (hipY + fy) / 2 - 0.4;
      ctx.fillStyle = tint || (far ? COL.guard : COL.dark);
      this._seg(ctx, hipX, hipY, kneeX, kneeY, 1);
      this._seg(ctx, kneeX, kneeY, fx, fy, 0.8);

      // Black feet: the thing the species is actually named after. A paw pad
      // with toes on it, and a lighter top edge when the foot is off the
      // ground, so a step reads as a step and not a shadow twitching.
      const px3 = Math.round(fx), py3 = Math.round(fy);
      ctx.fillStyle = tint || COL.foot;
      ctx.fillRect(px3 - 1, py3 - 1, 3, 2);
      if (!tint) {
        // two toes on the leading edge, and a lit top when the foot is up
        const tang = Math.atan2(fy - kneeY, fx - kneeX);
        const tnx = -Math.sin(tang), tny = Math.cos(tang);
        ctx.fillStyle = shadeHex(COL.foot, 0.3);
        for (const k of [-0.7, 0.7]) {
          ctx.fillRect(Math.round(fx + Math.cos(tang) * 1.2 + tnx * k), Math.round(fy + Math.sin(tang) * 1.2 + tny * k), 1, 1);
        }
        if (lifted > 0.5) { ctx.fillStyle = COL.dark; ctx.fillRect(px3 - 1, py3 - 2, 2, 1); }
      }
    }

    // --- body ---------------------------------------------------------------
    // A tube, painted as perpendicular spans along the spine, so the silhouette
    // stays clean whichever way the body is pointing. Outline first, at one
    // pixel wider, which is a free black keyline without a getImageData pass.
    this._tube(ctx, pts, tint || COL.outline, 1, null);
    this._tube(ctx, pts, tint || COL.base, 0, tint ? null : (f, up) => {
      // shading picked per span: dark along the ridge, pale under the belly
      if (f > 0.82) return COL.tailTip;
      if (up < -0.62) return COL.guard;      // the dark ridge along the spine
      if (up < -0.2) return COL.light;
      if (up > 0.7) return COL.belly;
      return null;
    });

    if (!tint) {
      // guard hairs along the spine, sparse, following the ridge
      ctx.fillStyle = COL.guard;
      for (let i = 2; i < TAIL_FROM; i += 3) {
        const p2 = pts[i];
        ctx.fillRect(Math.round(p2.x), Math.round(p2.y - p2.r), 1, 1);
      }
    }

    // --- head ---------------------------------------------------------------
    const h = pts[0], n1 = pts[1];
    const ang = Math.atan2(h.y - n1.y, h.x - n1.x);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const px2 = -sa, py2 = ca;                 // unit normal
    const bite = this.biteProgress;
    // the jaw is wide open on the way in and shut at full extension
    const jaw = this.biteT > 0 ? (bite < 0.5 ? bite / 0.5 : Math.max(0, 1 - (bite - 0.5) / 0.22)) : 0;
    const hx = h.x + ca * 0.6, hy = h.y + sa * 0.6 + this.headBob * 0.2;
    const hr = 2.7 * S;

    // --- ears, behind the skull so it overlaps their bases ------------------
    // Small, round, set wide and low on the back of the head. They flick, they
    // pin back when she is running flat out, and they are half of why a face
    // this size reads as a face at all.
    if (!tint) {
      const pin = clamp(this.bound * 0.9 + (this.biteT > 0 ? 1 : 0), 0, 1);
      const flick = this.earFlick > 0 ? Math.sin(this.earFlick * 40) * 0.5 : 0;
      for (const side of [-1, 1]) {
        // pinned ears slide back along the skull instead of standing up
        const back = 0.35 + pin * 0.55;
        const out = (0.95 - pin * 0.3) * (1 + (side > 0 ? flick : -flick) * 0.2);
        const ex = hx - ca * hr * back + px2 * side * hr * out;
        const ey = hy - sa * hr * back + py2 * side * hr * out - hr * (0.34 - pin * 0.24);
        ctx.fillStyle = COL.outline;
        this._blob(ctx, ex, ey, 1.8 * S);
        ctx.fillStyle = COL.face;
        this._blob(ctx, ex, ey, 1.2 * S);
        ctx.fillStyle = COL.base;
        this._blob(ctx, ex - ca * 0.4, ey - sa * 0.4, 0.7 * S);
        // the pink inside, one pixel, only when the ear is up
        if (pin < 0.5) {
          ctx.fillStyle = COL.earInner;
          ctx.fillRect(Math.round(ex + ca * 0.6), Math.round(ey + sa * 0.6), 1, 1);
        }
      }
    }

    // --- skull ---------------------------------------------------------------
    // The head is the pale part. A black-footed ferret's face is cream from
    // the crown to the chin with one dark band across the eyes, and painting
    // the skull in body colour throws that away and leaves a brown lump.
    ctx.fillStyle = tint || COL.outline;
    this._blob(ctx, hx, hy, hr + 1);
    ctx.fillStyle = tint || COL.face;
    this._blob(ctx, hx, hy, hr);

    if (!tint) {
      // the crown is a shade darker, so the skull still has a top and a side
      ctx.fillStyle = COL.base;
      this._blob(ctx, hx - ca * hr * 0.62, hy - sa * hr * 0.62, hr * 0.42);

      // --- muzzle -----------------------------------------------------------
      // A ferret's face is mostly nose: a pale wedge running forward off the
      // skull, a dark button on the end of it, and a mouth line underneath.
      const mL = hr * 0.88;
      const mx = hx + ca * mL, my = hy + sa * mL;
      // No keyline on the muzzle: it sits inside the skull silhouette, and an
      // outline there just draws a dark ring across the middle of the face.
      ctx.fillStyle = COL.face;
      this._blob(ctx, mx, my, hr * 0.5);
      ctx.fillStyle = shadeHex(COL.face, 0.35);
      this._blob(ctx, mx - ca * 0.4, my - sa * 0.4 - 0.5, hr * 0.28);

      const nx2 = mx + ca * hr * 0.52, ny2 = my + sa * hr * 0.52;
      ctx.fillStyle = COL.nose;
      ctx.fillRect(Math.round(nx2), Math.round(ny2), 2, 1);
      ctx.fillStyle = shadeHex(COL.nose, 0.35);
      ctx.fillRect(Math.round(nx2), Math.round(ny2), 1, 1);

      // --- jaw --------------------------------------------------------------
      if (jaw > 0.05) {
        // open mouth: a dark wedge under the nose with two teeth in it
        const gape = jaw * hr * 1.15;
        const jx = mx - ca * hr * 0.15, jy = my - sa * hr * 0.15;
        ctx.fillStyle = '#3a1414';
        for (let d = 0; d <= gape; d += 0.6) {
          const wdt = Math.max(1, Math.round((1 - d / (gape + 0.6)) * hr * 0.9));
          for (let k = -wdt; k <= wdt; k++) {
            ctx.fillRect(Math.round(jx + ca * d + px2 * k * 0.7), Math.round(jy + sa * d + py2 * k * 0.7), 1, 1);
          }
        }
        ctx.fillStyle = '#f4efe2';
        for (const side of [-1, 1]) {
          ctx.fillRect(Math.round(jx + ca * 0.6 + px2 * side * hr * 0.5), Math.round(jy + sa * 0.6 + py2 * side * hr * 0.5), 1, 1);
          ctx.fillRect(Math.round(jx + ca * gape * 0.7 + px2 * side * hr * 0.3), Math.round(jy + sa * gape * 0.7 + py2 * side * hr * 0.3), 1, 1);
        }
      } else {
        // closed: one short line, which is all a mouth needs at this size
        ctx.fillStyle = shadeHex(COL.nose, 0.18);
        ctx.fillRect(Math.round(mx + px2 * 0.5), Math.round(my + py2 * 0.5 + 1), 1, 1);
        ctx.fillRect(Math.round(mx - px2 * 0.5), Math.round(my - py2 * 0.5 + 1), 1, 1);
      }

      // --- the mask ----------------------------------------------------------
      // The band across the eyes is the single most recognisable thing about a
      // black-footed ferret, so it is drawn as a band and not a smudge.
      ctx.fillStyle = COL.mask;
      for (let t = -1.3; t <= 1.3; t += 0.22) {
        const bx2 = hx + px2 * t * hr * 0.9 + ca * hr * 0.12;
        const by2 = hy + py2 * t * hr * 0.9 + sa * hr * 0.12;
        // two pixels deep, following the face's own axis
        ctx.fillRect(Math.round(bx2), Math.round(by2), 1, 1);
        ctx.fillRect(Math.round(bx2 + ca * 0.9), Math.round(by2 + sa * 0.9), 1, 1);
      }

      // --- eyes ---------------------------------------------------------------
      const blinking = this.blinkT > 0 && this.blinkT < 0.09;
      const eF = hr * 0.22, eS = hr * 0.66;
      const e1x = hx + ca * eF + px2 * eS, e1y = hy + sa * eF + py2 * eS;
      const e2x = hx + ca * eF - px2 * eS, e2y = hy + sa * eF - py2 * eS;

      // hers: a dark bead with a catchlight, and it blinks
      if (blinking) {
        ctx.fillStyle = COL.mask;
        ctx.fillRect(Math.round(e1x) - 1, Math.round(e1y), 2, 1);
      } else {
        // Flat black, no catchlight. A pale highlight here reads as a second
        // glowing optic, and the whole point is that she only has one.
        ctx.fillStyle = COL.eye;
        ctx.fillRect(Math.round(e1x) - 1, Math.round(e1y) - 1, 2, 2);
      }

      // theirs: a hard little optic with a housing. It has no lid, so it does
      // not blink with the other one, and that is the point of it.
      ctx.fillStyle = P.nestSteelDk;
      ctx.fillRect(Math.round(e2x) - 1, Math.round(e2y) - 1, 3, 2);
      ctx.fillStyle = P.cyberHot;
      ctx.fillRect(Math.round(e2x), Math.round(e2y) - 1, 1, 1);

      // stitches over the shoulder, where they opened her up
      const st = pts[SHOULDER + 1];
      ctx.fillStyle = P.stitch;
      const sang = Math.atan2(pts[SHOULDER].y - pts[SHOULDER + 2].y, pts[SHOULDER].x - pts[SHOULDER + 2].x);
      const snx = -Math.sin(sang), sny = Math.cos(sang);
      for (let t = -1; t <= 1; t++) {
        ctx.fillRect(Math.round(st.x + snx * t * st.r * 0.7), Math.round(st.y + sny * t * st.r * 0.7), 1, 1);
      }
    }

    ctx.globalAlpha = 1;
  }

  /** The glow of the optic, for the light pass. */
  eyePos() {
    const h = this.spine[0], n1 = this.spine[1];
    const ang = Math.atan2(h.y - n1.y, h.x - n1.x);
    return { x: h.x + Math.cos(ang) * 1.4, y: h.y + Math.sin(ang) * 1.4 - 0.5 };
  }

  /** Body radius at a spine index, for anything that wants to mirror the shape. */
  radiusAt(i) { return PROFILE[clamp(i, 0, SEGS - 1)]; }

  /** A recorded pose, drawn flat. Used for the dash trail. */
  drawGhost(r, spine, alpha, color) {
    if (alpha <= 0) return;
    const ctx = r.ctx, cam = r.camera;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < spine.length - 1; i++) {
      const a = spine[i], b = spine[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s2 = 0; s2 <= steps; s2++) {
        const t = s2 / steps;
        const x = Math.round(a.x + (b.x - a.x) * t - cam.ox);
        const y = Math.round(a.y + (b.y - a.y) * t - cam.oy);
        const d = Math.max(1, Math.round((a.r + (b.r - a.r) * t)));
        ctx.fillRect(x - (d >> 1), y - (d >> 1), d, d);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Where the gun sits, and where the wood rides. */
  shoulder() { return this.spine[SHOULDER]; }
  hipNode() { return this.spine[HIP]; }
  nose() { return this.spine[0]; }

  // -- primitives ------------------------------------------------------------

  /**
   * A filled disc, centred, rasterised row by row.
   *
   * The obvious thing here is a square, and a square is what a head made of
   * stacked squares looks like: a brick. Scanning rows costs a handful of
   * fillRects and gives an actual round skull at five pixels across, which is
   * the difference between a face and a smudge.
   */
  _blob(ctx, x, y, r) {
    const cx = Math.round(x), cy = Math.round(y);
    if (r <= 0.7) { ctx.fillRect(cx, cy, 1, 1); return; }
    if (r <= 1.2) { ctx.fillRect(cx - 1, cy - 1, 2, 2); return; }
    const R = r;
    const top = Math.round(-R), bot = Math.round(R);
    for (let j = top; j <= bot; j++) {
      const dy = (Math.abs(j) + 0.5) - 0.5;
      const half = Math.sqrt(Math.max(0, R * R - dy * dy));
      const w = Math.max(1, Math.round(half * 2));
      ctx.fillRect(cx - (w >> 1), cy + j, w, 1);
    }
  }

  /** A tapering limb segment. */
  _seg(ctx, x0, y0, x1, y1, w) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const d = Math.max(1, Math.round(w * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      ctx.fillRect(Math.round(x0 + (x1 - x0) * t) - (d >> 1), Math.round(y0 + (y1 - y0) * t) - (d >> 1), d, d);
    }
  }

  /**
   * Paint the body as a run of spans perpendicular to the spine.
   *
   * Stamping squares along a centre line gives a lumpy sausage that changes
   * width as the body rotates. Walking the spine and filling across its normal
   * gives a clean tube at any angle, and hands each pixel its position across
   * the body so the shader callback can put the dark on top and the pale
   * underneath.
   */
  _tube(ctx, pts, color, grow, shade) {
    ctx.fillStyle = color;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(len * 1.6));
      const nx = len > 0.001 ? -dy / len : 0;
      const ny = len > 0.001 ? dx / len : 1;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = a.x + dx * t, cy = a.y + dy * t;
        const rr = (a.r + (b.r - a.r) * t) + grow;
        if (rr <= 0.2) continue;
        const f = a.f + (b.f - a.f) * t;
        const half = Math.max(1, Math.round(rr));
        for (let k = -half; k <= half; k++) {
          const u = k / half;                    // -1 top, +1 bottom of the body
          if (shade) {
            const c = shade(f, u);
            ctx.fillStyle = c || color;
          }
          ctx.fillRect(Math.round(cx + nx * k), Math.round(cy + ny * k), 1, 1);
        }
        if (shade) ctx.fillStyle = color;
      }
    }
  }
}

export const FERRET_COL = COL;
