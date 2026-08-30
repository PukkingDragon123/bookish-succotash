// Every animal, solved live.
//
// The wildlife used to be baked: eight frames per animation, painted once and
// blitted. That is cheap and it is what the whole basin ran on, and it is also
// why the animals never looked like they were in the same game as the ferret.
// The ferret is a rig — a spine that trails the head, feet placed by inverse
// kinematics, a gait driven by distance travelled — so she flows. Everything
// else played a loop next to its own movement and the two never quite agreed.
//
// So this is the same treatment for the other twenty-two. It is a side-profile
// rig with:
//
//   * a body that pitches and rolls with the gait instead of bobbing on a sine
//   * a neck chain that LEADS — the head goes first into a turn and the
//     shoulders follow a beat later, which is most of what makes an animal
//     look alive rather than dragged
//   * four legs solved by two-bone IK onto feet that PLANT. A hoof stays where
//     it was put while the body travels over it, and swings forward only once
//     it has been left too far behind. Feet that skate are the thing your eye
//     catches before it catches anything else
//   * real gaits that change with speed — a lateral walk, a diagonal trot, a
//     transverse gallop — because a bison at a walk and a bison at a charge do
//     not move the same way at different speeds, they move differently
//   * a spine that flexes and extends through a gallop, so the back rounds
//     under the animal at the gather and stretches out at the reach
//
// Proportions come straight out of the beastiary `cfg` blocks that the old
// baked art was built from, so all the anatomy work carries over: a moose
// still has its dewlap and its overhanging muzzle, a bison still has a hump
// higher than its skull.

import { P } from './palette.js';
import { clamp, lerp, TAU } from '../engine/math.js';
import { blob, seg, taperSeg, tube, ik2 } from './rigdraw.js';
import { PixBuf } from './pixbuf.js';

// --- gaits -----------------------------------------------------------------
// Phase offsets per foot, in the order [front-near, front-far, hind-near,
// hind-far]. These are the real footfall sequences, which is why they read.
const GAITS = {
  // lateral sequence walk: LH, LF, RH, RF. Three feet down at any moment.
  walk:   { off: [0.5, 0.0, 0.0, 0.5], duty: 0.68, beats: 4, lift: 0.30, reach: 0.34, flex: 0.10 },
  // diagonal pairs, suspended between: the two-beat trot
  trot:   { off: [0.0, 0.5, 0.5, 0.0], duty: 0.48, beats: 2, lift: 0.52, reach: 0.52, flex: 0.16 },
  // transverse gallop: hinds together, then fores together, then airborne
  gallop: { off: [0.62, 0.72, 0.06, 0.16], duty: 0.34, beats: 1, lift: 0.78, reach: 0.86, flex: 0.55 },
};

// How many screen pixels one beastiary unit is worth.
const UNIT = 3.3;

/** Feet, in the order the gait tables use them. */
const FN = 0, FF = 1, HN = 2, HF = 3;

// Baked poses, shared across every animal of a species.
//
// A per-rig cache is nearly useless: forty elk in forty different phases each
// re-bake their own frame and nothing is reused. Keying on species-plus-pose
// means the herd shares sixteen canvases between them, which is the difference
// between twenty-eight frames a second and sixty.
const POSE_CACHE = new Map();
const POSE_CAP = 900;

// How many new poses may be rasterised in one frame.
//
// A cache miss costs a couple of thousand single-pixel fills, and a herd
// crossing the screen together changes phase bucket together — so without a
// ceiling, one frame in six does eight bakes and the frame rate saws. With a
// ceiling, a rig that cannot get its exact pose this frame draws the last one
// it had, which is at most a sixteenth of a stride stale and invisible.
let bakeBudget = 12;
export function beginBeastFrame() { bakeBudget = 12; }

/** Every coat slot white, for the hit flash. */
const FLASH = {
  base: '#ffffff', dark: '#e8e8e8', light: '#ffffff', hi: '#ffffff',
  belly: '#ffffff', muzzle: '#e8e8e8', nose: '#d0d0d0', tailTip: '#ffffff',
  earInner: '#ffffff',
};

function tint(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const up = amt >= 0;
  const a = Math.abs(amt);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(up ? v + (255 - v) * a : v * (1 - a))));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/**
 * The coat ramp across the body, top (-1) to bottom (+1).
 *
 * Four tones with a one-pixel checkerboard straddling each boundary. On a
 * shallow animal the dither is invisible; on something as deep as a bison it
 * is the difference between a rounded barrel and a set of painted stripes.
 */
function band(u, px, py, coat, belly) {
  const chk = ((px + py) & 1) === 0;
  const edge = (at, w) => (u > at - w && u < at + w) ? (chk ? 1 : 0) : (u > at ? 1 : 0);
  if (u < -0.86) return coat.hi || coat.light;
  if (edge(-0.56, 0.09) === 0) return coat.light;
  if (u > 0.86) return tint(belly, -0.18);
  if (edge(0.46, 0.10) === 1) return coat.dark;
  return coat.base;
}

/** An axis-aligned block, for hooves and bird toes. */
function _rect(t, x, y, w, h, col) {
  const v = typeof col === 'string' ? t.col(col) : col;
  const x0 = Math.round(t.px(x, y)), y0 = Math.round(t.py(x, y));
  for (let j = 0; j < h; j++) t.span(x0, x0 + w - 1, y0 + j, v);
}

export class BeastRig {
  /**
   * @param {object} cfg  a beastiary cfg block
   * @param {object} def  the beastiary entry, for temper-flavoured idles
   */
  constructor(cfgIn, def = {}) {
    // The beastiary is data, and data has holes in it — three species were
    // missing an `eye` block entirely. Fill them in once here so the draw
    // path can assume a complete config instead of guarding every field.
    const cfg = Object.assign({}, cfgIn);
    cfg.eye = Object.assign({ r: 1, color: '#12100c' }, cfgIn.eye);
    cfg.extras = Object.assign({}, cfgIn.extras);
    cfg.coat = Object.assign({
      base: '#7a6244', dark: '#4a3a26', light: '#9a7f58', hi: '#b09468',
      belly: '#6a5438', muzzle: '#3a2e20', nose: '#12100c', tailTip: null,
      earInner: null,
    }, cfgIn.coat);
    this.cfg = cfg;
    this.def = def;
    this.species = def.name || 'beast';
    // The beastiary's numbers are in a small abstract unit the old baked art
    // multiplied up before drawing. Same factor here, so a bison comes out the
    // size a bison came out before and nothing else in the world has to move.
    const s = (cfg.scale || 1) * UNIT;
    this.s = s;

    // --- skeleton, in local side-profile units. +x is forward, -y is up, and
    // the origin sits between the hooves on the ground.
    this.bodyLen = cfg.body.len * s * 1.18;
    this.bodyHgt = cfg.body.hgt * s;
    this.legLen = cfg.legs.len * s;
    this.legThick = cfg.legs.thick * s;
    this.spread = (cfg.legs.spread || 4) * s * 0.34;   // near/far offset in x
    this.neckLen = Math.min(
      Math.max(cfg.neck.len * s * 1.9, cfg.head.r * s * 0.60 * 0.85),
      cfg.body.len * s * 1.18 * (cfg.legs.count === 2 ? 1.15 : 1.0));
    this.neckThick = cfg.neck.thick * s * 0.50;
    this.headR = cfg.head.r * s * 0.60;
    this.muzzle = cfg.head.muzzle * s * 0.70;
    this.muzzleH = (cfg.head.muzzleH || cfg.head.r * 0.6) * s * 0.42;
    this.tailLen = (cfg.tail.len || 4) * s * (cfg.tail.style === 'stub' ? 0.34 : 0.62);
    this.tailThick = (cfg.tail.thick || 1) * s * 0.5;
    this.hump = (cfg.extras && cfg.extras.hump || 0) * s * 0.5;
    // Some animals are highest at the rump, not the withers. It is the whole
    // difference between a black bear and a grizzly, and it reads from a
    // hundred metres away.
    this.rump = (cfg.extras && cfg.extras.rump || 0) * s * 0.5;
    // The beastiary already said which of these are birds; the rig just never
    // read it. Two legs, a wing folded over the back and a beak instead of a
    // muzzle — a raven drawn on the quadruped path comes out as a small dog.
    this.biped = cfg.legs.count === 2;
    // A quadruped's spine runs level between two pairs of legs. A bird's does
    // not: its body hangs off one pair of hips, breast-high and tail-low. This
    // is the angle it hangs at — steep for a crane standing upright, shallow
    // for a corvid.
    this.tilt = cfg.body.tilt != null ? cfg.body.tilt : (cfg.legs.count === 2 ? 0.30 : 0);
    this.wings = !!cfg.extras.wings;

    // How much the spine gives. A mustelid is a whip; a bison is a wall.
    this.flexy = clamp(1.35 - cfg.body.hgt / Math.max(1, cfg.body.len) * 2.4, 0.12, 1);

    // Stride length in world units — how far the animal travels per full gait
    // cycle. Derived from leg length so a pika does not take bison steps.
    this.stride = this.legLen * 2.1 + this.bodyLen * 0.22;

    // --- solved state
    this.ready = false;
    this.phase = 0;
    this.travel = 0;
    this.gait = 'walk';
    this.speed = 0;
    this.lastX = 0; this.lastY = 0;
    this.facing = 1;
    this.turn = 0;            // -1..1 how hard it is turning, for the lead
    this.headLead = 0;        // the neck's own heading, lagging the body's
    this.headDrop = 0;        // 0 up, 1 nose on the ground
    this.headDropT = 0;
    this.pitch = 0;
    this.roll = 0;
    this.bob = 0;
    this.arch = 0;            // spine flexion through a gallop
    this.alarm = 0;           // 0..1 head high, ears up
    this.hurt = 0;
    this.blinkT = Math.random() * 4;
    this.blink = 0;
    this.earFlick = 0;
    this.earT = Math.random() * 3;
    this.tailSwing = 0;
    this.tailPhase = Math.random() * TAU;
    this.down = 0;            // 0 standing, 1 collapsed

    this.feet = [];
    for (let i = 0; i < 4; i++) {
      this.feet.push({ x: 0, y: 0, px: 0, py: 0, plant: 0, swing: 0, lift: 0 });
    }
  }

  /** Where each foot's hip/shoulder sits in local space. */
  _hip(i) {
    const front = i === FN || i === FF;
    const near = i === FN || i === HN;
    if (this.biped) {
      // both legs hang from the same place — a bird's hips sit under its
      // centre of mass and the body pivots over them
      return { x: this.bodyLen * 0.40 + (near ? 1 : -1) * this.spread * 0.3,
               y: -this.legLen - this.bodyHgt * 0.30, z: 0 };
    }
    return {
      x: front ? this.bodyLen * 0.82 : this.bodyLen * 0.12,
      y: -this.legLen - this.bodyHgt * 0.32,
      z: near ? this.spread : -this.spread,
    };
  }

  reset(x, y) {
    this.lastX = x; this.lastY = y;
    for (let i = 0; i < 4; i++) {
      const h = this._hip(i);
      const f = this.feet[i];
      f.x = h.x; f.y = 0; f.px = h.x; f.py = 0; f.swing = 0; f.lift = 0;
    }
    this.ready = true;
  }

  /**
   * Advance the animal.
   *
   * `o` carries where it is and how fast, and the rig works out everything
   * else. Nothing here is a keyframe: the gait comes from the speed, the
   * footfalls come from the distance travelled, and the pitch and the arch
   * come from the gait.
   */
  update(dt, o) {
    const { x, y, vx, vy, facing } = o;
    if (!this.ready) this.reset(x, y);
    const anim = o.anim || 'idle';

    const moved = Math.hypot(x - this.lastX, y - this.lastY);
    const speed = dt > 0 ? moved / dt : 0;
    this.lastX = x; this.lastY = y;
    this.speed = lerp(this.speed, speed, 1 - Math.pow(0.001, dt));

    // Turning: the difference between where the body points and where it is
    // going. The neck uses it to lead the turn.
    const want = facing;
    if (want !== this.facing && Math.abs(this.speed) < 6) this.facing = want;
    else if (want !== this.facing) this.turn = clamp(this.turn + dt * 6, -1, 1) * 0;
    this.facing = want || this.facing;

    // --- pick a gait off the speed, in leg-lengths per second so a marmot
    // and a moose change gait at the sizes that suit them
    const rel = this.speed / Math.max(1, this.legLen * 6);
    const gait = rel > 1.5 ? 'gallop' : rel > 0.62 ? 'trot' : 'walk';
    this.gait = anim === 'run' || anim === 'charge' ? (rel > 1.1 ? 'gallop' : 'trot')
      : (anim === 'walk' && gait === 'gallop') ? 'trot' : gait;
    let G = GAITS[this.gait];
    if (this.biped) G = Object.assign({}, G, { off: [0, 0, 0.5, 0.5], duty: 0.58, beats: 2 });

    // The phase runs off distance travelled, so the feet never skate. When
    // the animal is standing still it stops, rather than marching on the spot.
    const stride = this.stride * (this.gait === 'gallop' ? 1.55 : this.gait === 'trot' ? 1.18 : 1);
    this.travel += moved;
    const moving = this.speed > this.legLen * 0.35;
    if (moving) this.phase = (this.travel / Math.max(2, stride)) % 1;

    // --- feet ---------------------------------------------------------------
    // A foot is planted for `duty` of the cycle, then swings. During stance it
    // holds its ground point and the body walks over it; during swing it lifts
    // and reaches forward to where the body will be.
    //
    // The reach is NOT a free parameter. In stance the foot slides backwards
    // through 2*reach of local space while the body travels stride*duty of
    // world space, and if those two numbers disagree the hoof skates — which
    // is the first thing an eye catches and the reason most procedural walks
    // look wrong. So it is solved, not tuned.
    const reach = stride * G.duty * 0.5;
    for (let i = 0; i < 4; i++) {
      const f = this.feet[i];
      const h = this._hip(i);
      const p = ((this.phase + G.off[i]) % 1 + 1) % 1;
      if (!moving) {
        // standing: feet under the hips, with a slow settle
        f.x = lerp(f.x, h.x, 1 - Math.pow(0.002, dt));
        f.y = lerp(f.y, 0, 1 - Math.pow(0.002, dt));
        f.lift = lerp(f.lift, 0, 1 - Math.pow(0.002, dt));
        f.swing = 0;
        continue;
      }
      if (p < G.duty) {
        // stance: the hoof travels backwards under the body at body speed
        const t = p / G.duty;
        f.x = lerp(h.x + reach, h.x - reach, t);
        f.y = 0;
        f.lift = 0;
        f.swing = 0;
      } else {
        // swing: forward and up, on an arc that lands toe-first
        const t = (p - G.duty) / (1 - G.duty);
        const e = t * t * (3 - 2 * t);                 // ease, so it does not snap
        f.x = lerp(h.x - reach, h.x + reach, e);
        f.lift = Math.sin(t * Math.PI) * this.legLen * G.lift;
        f.y = -f.lift;
        f.swing = 1;
      }
    }

    // --- body -----------------------------------------------------------------
    // Everything below is a consequence of the gait rather than a loop laid
    // next to it, which is the whole point of doing this live.
    const cyc = this.phase * TAU * G.beats;
    const amp = moving ? this.legLen * (this.gait === 'gallop' ? 0.20 : 0.085) : 0;
    this.bob = lerp(this.bob, -Math.abs(Math.sin(cyc)) * amp, 1 - Math.pow(0.0005, dt));

    // pitch: nose-down as the forehand takes the weight, up as it pushes off
    const wantPitch = moving ? Math.sin(cyc + 0.6) * (this.gait === 'gallop' ? 0.17 : 0.05) : 0;
    this.pitch = lerp(this.pitch, wantPitch, 1 - Math.pow(0.0006, dt));

    // arch: a gallop rounds the back at the gather and stretches it at the
    // reach. This is the difference between a running animal and a trotting
    // table, and it only exists in the gallop.
    const wantArch = moving ? Math.sin(this.phase * TAU) * G.flex * this.flexy : 0;
    this.arch = lerp(this.arch, wantArch, 1 - Math.pow(0.0004, dt));

    // --- head, neck, tail ------------------------------------------------------
    this.alarm = lerp(this.alarm, anim === 'alert' || anim === 'attack' ? 1 : 0, 1 - Math.pow(0.004, dt));
    const wantDrop = (anim === 'graze' || anim === 'sniff') ? 1 : 0;
    this.headDrop = lerp(this.headDrop, wantDrop, 1 - Math.pow(0.01, dt));

    // The neck leads. Its own heading chases the body's, but slowly, so on a
    // turn the head is already pointed where the animal is going while the
    // shoulders are still coming round.
    this.headLead = lerp(this.headLead, moving ? -this.pitch * 1.6 : 0, 1 - Math.pow(0.02, dt));

    // idle life: blinks, ear flicks, a tail that swings on its own clock
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 1.6 + Math.random() * 4.5; this.blink = 0.12; }
    this.blink = Math.max(0, this.blink - dt);
    this.earT -= dt;
    if (this.earT <= 0) { this.earT = 1.2 + Math.random() * 4; this.earFlick = 0.22; }
    this.earFlick = Math.max(0, this.earFlick - dt);
    this.tailPhase += dt * (moving ? 3.2 + this.speed * 0.05 : 1.1);
    this.tailSwing = Math.sin(this.tailPhase) * (moving ? 0.5 : 0.22) + this.pitch * 0.5;

    this.hurt = Math.max(0, this.hurt - dt * 3);
    this.down = clamp(this.down + (o.downed ? dt * 5 : -dt * 5), 0, 1);
  }

  /** Flag a hit, so the body flinches rather than just flashing white. */
  flinch() { this.hurt = 1; }

  // ==========================================================================
  //  drawing
  // ==========================================================================

  /**
   * The spine, as a run of nodes from tail root to withers.
   *
   * The arch bends it in the middle; the hump (bison, moose) rides on top of
   * the front third. Everything downstream — neck root, hip and shoulder
   * positions — is read off this curve so nothing detaches when it flexes.
   */
  _spine() {
    const n = 15;
    const pts = [];
    const topY = -this.legLen - this.bodyHgt;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);                    // 0 croup, 1 withers
      const x = lerp(0, this.bodyLen, t);
      // the back line: dips behind the withers, rises over the hump
      const sag = Math.sin(t * Math.PI) * this.bodyHgt * 0.10;
      // A bison's hump sits over the SHOULDERS, not the middle of the back:
      // a raised cosine peaking at t=0.78, just behind the withers, tapering
      // to nothing by the last third of the barrel. Centring it mid-back is
      // what makes a bison read as a camel.
      const hu = clamp((t - 0.50) / 0.56, 0, 1);
      const humpY = this.hump * (0.5 - 0.5 * Math.cos(hu * TAU)) * (hu > 0 && hu < 1 ? 1 : 0);
      // The rump swell is the same shape mirrored, peaking at t=0.18 over the
      // hindquarters — a black bear's high point is its backside, which is
      // most of what separates its silhouette from a bison's.
      const ru = clamp((0.46 - t) / 0.56, 0, 1);
      const rumpY = this.rump * (0.5 - 0.5 * Math.cos(ru * TAU)) * (ru > 0 && ru < 1 ? 1 : 0);
      const flex = Math.sin(t * Math.PI) * this.arch * this.bodyHgt;
      pts.push({
        x, y: topY + sag - humpY - rumpY + flex + this.bodyHgt * 0.5,
        r: this._girth(t), f: 1 - t * 0.75,
      });
    }
    if (this.tilt) {
      // Rotated about the hip node rather than the centre, so the leg solve is
      // untouched and the barrel, wing, tail and head all come along with it.
      const p = 0.42 * (n - 1), i0 = Math.floor(p), i1 = Math.min(n - 1, i0 + 1), fr = p - i0;
      const ox = lerp(pts[i0].x, pts[i1].x, fr), oy = lerp(pts[i0].y, pts[i1].y, fr);
      const ca = Math.cos(-this.tilt), sa = Math.sin(-this.tilt);
      for (const q of pts) {
        const dx = q.x - ox, dy = q.y - oy;
        q.x = ox + dx * ca - dy * sa;
        q.y = oy + dx * sa + dy * ca;
      }
    }
    return pts;
  }

  /** Body radius along the back, croup (0) to withers (1). */
  _girth(t) {
    const c = this.cfg.body;
    const chest = (c.chest || 1) * this.bodyHgt * 0.5;
    const haunch = (c.haunch || 1) * this.bodyHgt * 0.48;
    // barrel: full through the middle, tucked at the flank
    const barrel = 0.82 + Math.sin(t * Math.PI) * 0.2;
    return lerp(haunch, chest, t) * barrel;
  }

  /**
   * Draw the animal at a world position.
   *
   * Order is silhouette-first: far legs, then the barrel, then near legs on
   * top, then the head. Same rule as the drawn sprites — the far side of the
   * animal is in its own shadow and separates by tone, not by an outline.
   */
  /**
   * A short string naming the exact pose the rig is in.
   *
   * Solving a rig live is cheap; rasterising one is not — a bison is a couple
   * of thousand single-pixel fills, and forty animals on screen took the game
   * from sixty frames to twenty. So the *motion* stays live (the gait phase
   * still comes from distance actually travelled, so nothing skates) and only
   * the *rasterising* is amortised: quantise the pose, draw it once, blit it
   * every frame after that. Twenty-four phase buckets is three times finer than
   * the eight baked frames this replaced, so it is more animation than
   * before, not less.
   */
  poseKey(flash) {
    const ph = Math.round(this.phase * 24) % 24;
    const moving = this.speed > this.legLen * 0.35 ? 1 : 0;
    const hd = Math.round(this.headDrop * 3);
    const al = Math.round(this.alarm * 2);
    const dn = Math.round(this.down * 3);
    const tl = Math.round((this.tailSwing + 1) * 2);
    return `${this.gait}${moving}${ph}h${hd}a${al}d${dn}t${tl}${this.blink > 0 ? 'b' : ''}${this.earFlick > 0 ? 'e' : ''}${flash ? 'f' : ''}`;
  }

  /** Render the current pose into its own canvas, once. */
  _bake(flash) {
    const sz = this.size();
    const pad = 10;
    const W = sz.w + pad * 2, H = sz.h + pad * 2;
    const buf = new PixBuf(W, H);
    // origin: feet on the ground, body centred
    this._paint(buf, W / 2, H - pad, flash);
    return { canvas: buf.toCanvas(), ax: W / 2, ay: H - pad };
  }

  draw(r, wx, wy, opts = {}) {
    const ctx = r.ctx;
    const cam = r.camera;
    const flip = (opts.facing || this.facing) < 0;
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const flash = !!opts.flash;

    const key = this.species + '|' + this.poseKey(flash);
    let pose = POSE_CACHE.get(key);
    if (!pose) {
      if (bakeBudget > 0) {
        bakeBudget--;
        pose = this._bake(flash);
        if (POSE_CACHE.size >= POSE_CAP) {
          // plain FIFO eviction: the working set is whatever is on screen, and
          // that turns over slowly enough that anything cleverer is not worth it
          POSE_CACHE.delete(POSE_CACHE.keys().next().value);
        }
        POSE_CACHE.set(key, pose);
      } else {
        pose = this._last;                 // one bucket stale, and unnoticeable
        if (!pose) { bakeBudget--; pose = this._bake(flash); POSE_CACHE.set(key, pose); }
      }
    }
    this._last = pose;

    const ox = Math.round(wx - cam.ox);
    const oy = Math.round(wy - cam.oy);
    // The blit itself goes to the real context, not the buffer.
    if (flip) {
      ctx.save();
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.translate(ox, oy);
      ctx.scale(-1, 1);
      ctx.drawImage(pose.canvas, -pose.ax, -pose.ay);
      ctx.restore();
    } else {
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.drawImage(pose.canvas, ox - pose.ax, oy - pose.ay);
      if (alpha !== 1) ctx.globalAlpha = 1;
    }
  }

  /** The actual rasterising, into whatever context the caller hands over. */
  _paint(pb, ox, oy, flash) {
    let _c = '#000000';
    // A hit flashes the whole animal white. Swapping the palette rather than
    // compositing a tinted copy keeps it free.
    const coat = flash ? FLASH : this.cfg.coat;
    pb.save();
    pb.translate(ox, oy);
    // the whole body rides the bob, and rolls with the pitch
    pb.translate(-this.bodyLen * 0.5, this.bob);
    if (this.down > 0.01) {
      pb.translate(this.bodyLen * 0.5, 0);
      pb.rotate(this.down * 1.35);
      pb.translate(-this.bodyLen * 0.5, 0);
    }
    pb.rotate(this.pitch * 0.5);

    const spine = this._spine();
    const withers = spine[spine.length - 1];
    const croup = spine[0];

    // --- far legs -------------------------------------------------------------
    const farTone = tint(coat.dark, -0.18);
    if (!this.biped) {
      this._leg(pb, FF, spine, farTone, true);
      this._leg(pb, HF, spine, farTone, true);
    } else {
      this._birdLeg(pb, HN, spine, farTone);
    }

    // --- tail (behind the body for most, over it for a plume) ------------------
    if (this.cfg.tail.style !== 'plume') this._tail(pb, croup, coat);

    // --- barrel ---------------------------------------------------------------
    this._barrel(pb, spine, coat);

    // --- near legs ------------------------------------------------------------
    if (this.biped) {
      this._birdLeg(pb, FN, spine, coat.dark);
    } else {
      this._leg(pb, FN, spine, coat.dark, false);
      this._leg(pb, HN, spine, coat.dark, false);
    }

    if (this.cfg.extras.spines) this._spines(pb, spine, coat);
    if (this.wings) this._wing(pb, spine, coat);
    if (this.cfg.extras.bustle) this._bustle(pb, spine, coat);
    if (this.cfg.tail.style === 'plume') this._tail(pb, croup, coat);

    // --- neck and head --------------------------------------------------------
    this._head(pb, withers, coat);

    pb.restore();
  }

  _barrel(pb, spine, coat) {
    let _c = '#000000';
    const pts = spine.map(p => ({ x: p.x, y: p.y, r: p.r, f: p.f }));
    const belly = coat.belly || tint(coat.dark, -0.1);
    // One hard outline around the whole barrel, then the form inside it. The
    // bands are deliberately lopsided: a thin lit rim along the topline, most
    // of the animal in its base coat, and the underside sunk into shadow with
    // only a sliver of belly showing. Splitting it evenly top and bottom is
    // what made the first pass read as a painted plank.
    tube(pb, pts, coat.base, 1.2, () => tint(coat.dark, -0.62));
    tube(pb, pts, coat.base, 0, (f, u, px, py) => band(u, px, py, coat, belly));
    // shaggy ruff on the forequarter, for the ones that have one
    if (this.cfg.extras && this.cfg.extras.ruff) {
      const w = spine[spine.length - 1];
      _c = tint(coat.dark, -0.12);
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        blob(pb, w.x - t * this.bodyLen * 0.30, w.y + this._girth(1) * (0.35 + t * 0.5),
             this.bodyHgt * 0.16, _c)
      }
    }
  }

  /**
   * One leg, solved onto its planted foot.
   *
   * Forelegs break backwards at the elbow, hind legs forwards at the stifle
   * and back again at the hock. That Z in the hind leg is the single most
   * recognisable thing about a standing hoofed animal.
   */
  _leg(pb, i, spine, tone, far) {
    let _c = '#000000';
    const f = this.feet[i];
    const front = i === FN || i === FF;
    const h = this._hip(i);
    // hang the leg off the actual spine curve so it stays attached when the
    // back flexes
    const at = front ? 0.86 : 0.14;
    const node = this._spineAt(spine, at);
    const hx = node.x + (far ? -this.spread * 0.5 : this.spread * 0.4);
    const hy = node.y + this._girth(at) * 0.55;

    // Bone lengths come from where the hip ACTUALLY ended up on the spine,
    // not from the nominal leg length. Those two drift apart as soon as the
    // barrel has any girth, and when they do the IK solver clamps: the leg
    // reaches as far as it can, stops short of the floor, and the animal walks
    // on stilts an inch above the ground with its feet drawn separately below.
    const dig = this.cfg.legs.digitigrade;
    const drop = Math.max(this.legLen * 0.5, -hy);
    const pastern = drop * (dig ? 0.17 : 0.12);
    const upper = (drop - pastern) * (front ? 0.54 : 0.52);
    const lower = (drop - pastern) * (front ? 0.46 : 0.48);

    const fx = hx + (f.x - h.x);
    const fy = f.y - pastern * 0.5;

    const bend = front ? 1 : -1;                     // elbow back / stifle forward
    const k = ik2(hx, hy, fx, fy, upper, lower, bend);

    const w0 = this.legThick * (front ? 0.62 : 0.72);
    const w1 = this.legThick * 0.34;
    const w2 = this.legThick * 0.26;

    _c = tone;
    taperSeg(pb, hx, hy, k.jx, k.jy, w0, w1, _c)
    // the hind cannon bends back again below the hock
    if (front) {
      taperSeg(pb, k.jx, k.jy, k.fx, k.fy, w1, w2, _c)
      taperSeg(pb, k.fx, k.fy, f.x - h.x + hx, f.y, w2, w2 * 0.9, _c)
    } else {
      const hockX = k.fx, hockY = k.fy;
      taperSeg(pb, k.jx, k.jy, hockX, hockY, w1, w2, _c)
      taperSeg(pb, hockX, hockY, hx + (f.x - h.x), f.y, w2, w2 * 0.85, _c)
    }
    // foot
    const footY = f.y;
    const footX = hx + (f.x - h.x);
    if (this.cfg.legs.foot === 'hoof') {
      // a hoof is a hard dark box, and it is the only truly black thing on
      // a deer — which is why it reads from across the basin
      _c = tint(tone, -0.62);
      _rect(pb, Math.round(footX - w2), Math.round(footY - w2 * 1.4),
                   Math.max(2, Math.round(w2 * 2.1)), Math.max(2, Math.round(w2 * 1.5)), _c);
    } else if (this.cfg.legs.digitigrade === false && this.legThick > 4) {
      // Plantigrade: the whole sole on the ground, heel and all. A bear
      // standing on its toes is a dog, and the flat foot is half of why a
      // bear looks heavy.
      _c = tint(tone, -0.52);
      taperSeg(pb, footX - w2 * 1.5, footY - w2 * 0.6, footX + w2 * 1.9, footY - w2 * 0.5, w2 * 0.95, w2 * 0.7, _c)
      _c = tint(tone, -0.24);
      taperSeg(pb, footX - w2 * 1.2, footY - w2 * 0.9, footX + w2 * 1.6, footY - w2 * 0.8, w2 * 0.6, w2 * 0.45, _c)
    } else {
      _c = tint(tone, -0.5);
      blob(pb, footX + w2 * 0.35, footY - w2 * 0.5, w2 * 1.35, _c)
      _c = tint(tone, -0.2);
      blob(pb, footX + w2 * 0.2, footY - w2 * 0.8, w2 * 0.9, _c)
    }
  }

  /**
   * A bird's leg: a bare shank, an ankle that kinks backwards, and a splayed
   * foot. That backward kink is the joint everyone draws as a knee and it is
   * the one thing that makes a drawn bird look like a bird.
   */
  _birdLeg(pb, i, spine, tone) {
    let _c = '#000000';
    const f = this.feet[i];
    const h = this._hip(i);
    const node = this._spineAt(spine, 0.42);
    const hx = node.x, hy = node.y + this._girth(0.42) * 0.62;
    const fx = hx + (f.x - h.x), fy = f.y;

    const thigh = this.legLen * 0.34;      // mostly buried in the feathers
    const shank = this.legLen * 0.72;
    const k = ik2(hx, hy, fx, fy, thigh, shank, -1);
    const w = this.legThick * 0.62;

    _c = tint(tone, -0.5);
    taperSeg(pb, hx, hy, k.jx, k.jy, w * 1.5 + 0.8, w + 0.8, _c)
    taperSeg(pb, k.jx, k.jy, fx, fy, w + 0.8, w * 0.7 + 0.8, _c)
    _c = this.cfg.extras.footColor || tint(tone, 0.1);
    taperSeg(pb, hx, hy, k.jx, k.jy, w * 1.5, w, _c)
    taperSeg(pb, k.jx, k.jy, fx, fy, w, w * 0.7, _c)
    // three toes forward, one back
    _rect(pb, Math.round(fx - w), Math.round(fy - 1), Math.max(3, Math.round(w * 4)), 1, _c);
    _rect(pb, Math.round(fx - w * 2.2), Math.round(fy - 1), Math.max(2, Math.round(w * 1.6)), 1, _c);
  }

  /**
   * The folded wing.
   *
   * It sits over the barrel with its tip trailing past the rump, and it lifts
   * a little at speed. The lit leading edge and the dark trailing primaries
   * are what stop it reading as a stripe painted on the side.
   */
  _wing(pb, spine, coat) {
    let _c = '#000000';
    const a = this._spineAt(spine, 0.62);
    const b = this._spineAt(spine, 0.10);
    const lift = -this.speed * 0.012 - (this.gait === 'gallop' ? 2 : 0);
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push({
        x: lerp(a.x, b.x - this.bodyLen * 0.16, t),
        y: lerp(a.y + this._girth(0.62) * 0.12 + lift, b.y + this._girth(0.10) * 0.62, t),
        r: this._girth(0.5) * (0.62 - t * 0.5) + 1,
        f: 0.5,
      });
    }
    tube(pb, pts, coat.base, 1.1, () => tint(coat.dark, -0.6));
    tube(pb, pts, coat.base, 0, (f, u) =>
      (u < -0.35 ? (coat.hi || coat.light) : u > 0.35 ? tint(coat.dark, -0.16) : coat.base));
    // the primaries, as a few hard strokes off the trailing end
    _c = tint(coat.dark, -0.34);
    for (let i = 0; i < 3; i++) {
      const t = 0.62 + i * 0.13;
      const px2 = lerp(a.x, b.x - this.bodyLen * 0.16, t);
      const py2 = lerp(a.y, b.y + this._girth(0.10) * 0.62, t);
      taperSeg(pb, px2, py2, px2 - this.bodyLen * 0.14, py2 + 1.5 + i, 1.1, 0.6, _c)
    }
  }

  /**
   * The bustle: the drooping tertial feathers a crane carries over its tail.
   *
   * It is the one thing that tells a crane from a heron at a distance, and
   * without it a long-legged grey bird is just a long-legged grey bird. Drawn
   * as a short curtain of curved plumes falling off the rump.
   */
  _bustle(pb, spine, coat) {
    let _c = '#000000';
    const a = this._spineAt(spine, 0.28);
    const g = this._girth(0.28);
    const drop = this.bodyHgt * 0.62;
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x0 = a.x - this.bodyLen * (0.02 + t * 0.20);
      const y0 = a.y + g * (0.10 + t * 0.30);
      const sway = Math.sin(this.tailPhase * 0.6 + t * 1.2) * 1.1;
      const x1 = x0 - this.bodyLen * 0.30 + sway;
      const y1 = y0 + drop * (0.55 + t * 0.45);
      const w = g * (0.34 - t * 0.14) + 1;
      _c = tint(coat.dark, -0.58);
      taperSeg(pb, x0, y0, x1, y1, w + 1, 1.4, _c)
      _c = i < 2 ? (coat.light || coat.base) : coat.base;
      taperSeg(pb, x0, y0, x1, y1, w, 0.9, _c)
    }
  }

  /**
   * Quills. Not a texture — a hedgehog's whole silhouette is spines, so they
   * are drawn as a fringe standing off the back with pale tips.
   */
  _spines(pb, spine, coat) {
    let _c = '#000000';
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = 0.06 + (i / (n - 1)) * 0.82;
      const node = this._spineAt(spine, t);
      const r = this._girth(pb);
      const lean = -0.35 - t * 0.9;                  // sweep back over the rump
      const len = Math.max(4, r * (1.15 + Math.sin(t * Math.PI) * 0.75));
      const bx = node.x, by = node.y - r * 0.78;
      const tx = bx + Math.cos(lean + Math.PI) * len * 0.55;
      const ty = by + Math.sin(lean + Math.PI) * len - len * 0.5;
      _c = tint(coat.dark, -0.6);
      taperSeg(pb, bx, by, tx, ty, 1.8, 1.0, _c)
      _c = i % 3 === 0 ? (coat.hi || coat.light) : coat.base;
      taperSeg(pb, bx, by, tx, ty, 1.2, 0.5, _c)
    }
  }

  /** Read a point off the spine curve at parameter t. */
  _spineAt(spine, t) {
    const n = spine.length - 1;
    const ft = clamp(t, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(ft));
    const u = ft - i;
    return {
      x: lerp(spine[i].x, spine[i + 1].x, u),
      y: lerp(spine[i].y, spine[i + 1].y, u),
    };
  }

  /**
   * The tail, hanging off the croup.
   *
   * Carriage is per style, because it is species-identifying: a wolf carries a
   * bushy tail low and straight, a fox trails a brush almost on the ground, a
   * squirrel arches a plume up over its own back, and a bison has a rope with
   * a switch on the end that it flicks at flies.
   */
  _tail(pb, croup, coat) {
    let _c = '#000000';
    const st = this.cfg.tail.style;
    if (st === 'fan') { this._fanTail(pb, croup, coat); return; }
    const len = this.tailLen;
    // base angle: PI is straight back, larger is back-and-down
    const carry = st === 'plume' ? Math.PI + 0.55       // up and over the back
      : st === 'brush' ? Math.PI - 0.50                 // trailing, almost down
      : st === 'switch' ? Math.PI - 1.02                // a rope, hanging
      : st === 'stub' ? Math.PI - 0.62                  // a nub, pointing down
      : Math.PI - 0.34;
    // negative curls it further toward the ground as it goes; a plume curls up
    const droop = st === 'plume' ? 0.34 : st === 'switch' ? 0.44 : -0.30;
    const a0 = carry + this.tailSwing * 0.28 + this.alarm * 0.30 + this.pitch * 0.4;

    const n = 6;
    const pts = [];
    let x = croup.x - this._girth(0) * 0.35, y = croup.y - this._girth(0) * 0.25;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = st === 'plume' ? this.tailThick * (0.8 + Math.sin(t * Math.PI) * 3.0)
        : st === 'brush' ? this.tailThick * (1.1 + Math.sin(t * Math.PI) * 1.5)
        : st === 'bushy' ? this.tailThick * (1.0 + Math.sin(t * Math.PI) * 0.9)
        // a bison's switch: bare rope for four fifths, then the black tuft
        : st === 'switch' ? this.tailThick * (t < 0.78 ? 0.9 - t * 0.2 : 2.6)
        : st === 'stub' ? this.tailThick * (1.3 - t * 0.9)
        : this.tailThick * (1.0 - t * 0.5);
      pts.push({ x, y, r, f: 1 });
      const aa = a0 + droop * t * 1.6 + Math.sin(this.tailPhase + t * 2.4) * 0.18 * t;
      x += Math.cos(aa) * (len / n);
      y += Math.sin(aa) * (len / n);
    }
    tube(pb, pts, coat.base, 1.2, () => tint(coat.dark, -0.62));
    const lit = st === 'stub' || st === 'switch' ? coat.base : coat.light;
    tube(pb, pts, coat.base, 0, (f, u) =>
      (u < -0.5 ? lit : u > 0.5 ? tint(coat.dark, -0.1) : coat.base));
    if (coat.tailTip && st !== 'stub') {
      _c = coat.tailTip;
      blob(pb, pts[n].x, pts[n].y, Math.max(1.2, pts[n].r * 0.85), _c)
    }
  }

  /**
   * A bird's tail: a graduated fan of separate rectrices, not a rope.
   *
   * The feathers all leave the same point and spread through a shallow arc,
   * the middle pair longest, so a magpie's tail reads as the long stepped
   * wedge that is most of what identifies it and a raven's as a short blunt
   * fan. Drawn back to front so the near feathers overlap the far ones.
   */
  _fanTail(pb, croup, coat) {
    let _c = '#000000';
    const len = this.tailLen * 1.25;
    const n = 7;
    const spread = 0.30 + this.alarm * 0.16;      // fans out when startled
    const base = Math.PI - 0.10 + this.tailSwing * 0.16 + this.pitch * 0.4;
    const bx = croup.x - this._girth(0) * 0.30, by = croup.y - this._girth(0) * 0.10;
    const w = Math.max(1.1, this.tailThick * 0.85);
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;             // -1 far edge .. +1 near edge
      const a = base + u * spread;
      // graduated: the central pair carry the length, the outer ones are short
      const l = len * (1 - Math.abs(u) * 0.34);
      const tx = bx + Math.cos(a) * l, ty = by + Math.sin(a) * l;
      // the far half of the fan sits behind the body and is shaded for it
      const lit = u < -0.2 ? tint(coat.dark, -0.22) : u > 0.45 ? (coat.light || coat.base) : coat.base;
      _c = tint(coat.dark, -0.62);
      taperSeg(pb, bx, by, tx, ty, w + 1, w * 0.5 + 1, _c)
      _c = lit;
      taperSeg(pb, bx, by, tx, ty, w, w * 0.5, _c)
    }
    if (coat.tailTip) {
      _c = coat.tailTip;
      blob(pb, bx + Math.cos(base) * len * 0.94, by + Math.sin(base) * len * 0.94, w, _c)
    }
  }

  /**
   * Neck, skull, muzzle, ears and whatever is growing out of the top.
   *
   * The neck is a tube from the withers to the poll whose angle is the sum of
   * the carriage the species stands with, how alarmed it is, and how far it
   * has dropped its head to graze — so an elk carries its head high, a bison
   * carries it low, and both of them put their nose in the grass the same way.
   */
  /**
   * Neck, skull, muzzle, ears and whatever is growing out of the top.
   *
   * The important idea: the head has its OWN angle. Deriving the muzzle's
   * direction from the neck's is what makes procedural animals look like they
   * are sniffing the sky — a real animal holds its face level regardless of
   * how steeply the neck rises to meet it, and only tips it when it is
   * grazing, threatening, or looking at something.
   */
  _head(pb, withers, coat) {
    let _c = '#000000';
    const c = this.cfg;

    // Neck carriage: steep for the long-necked, flat for the heavy-headed.
    // A bison's head hangs off the front of the hump; an elk's stands above it.
    const carriage = this.hump > 0 ? 0.26 : this.rump > 0 ? 0.05 : -0.62 - c.neck.len * 0.055;
    const ang = carriage + this.headDrop * 1.30 - this.alarm * 0.30
      + this.headLead * 0.5 + this.pitch * 0.6;

    const nx = withers.x, ny = withers.y - this._girth(1) * 0.30;
    const px = nx + Math.cos(ang) * this.neckLen;
    const py = ny + Math.sin(ang) * this.neckLen;

    // the neck: thick where it leaves the shoulder, narrow at the poll, with
    // a crest along the top
    const nPts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const bow = Math.sin(t * Math.PI) * this.neckThick * 0.34;
      nPts.push({
        x: lerp(nx, px, t) + Math.cos(ang - Math.PI / 2) * bow,
        y: lerp(ny, py, t) + Math.sin(ang - Math.PI / 2) * bow,
        r: lerp(this.neckThick * 1.7, this.neckThick * 0.95, t),
        f: 0.28 - t * 0.24,
      });
    }
    tube(pb, nPts, coat.base, 1.2, () => tint(coat.dark, -0.62));
    tube(pb, nPts, coat.base, 0, (f, u) =>
      (u < -0.55 ? coat.light : u > 0.62 ? tint(coat.dark, -0.1) : coat.base));

    if (c.extras.bell) {
      // A moose's bell is a narrow flap of skin hanging off the throat, not
      // a beach ball. Drawn as a short taper so it reads as something that
      // swings.
      const bx0 = lerp(nx, px, 0.62), by0 = lerp(ny, py, 0.62) + this.neckThick * 1.0;
      const sway = Math.sin(this.tailPhase * 0.7) * this.neckThick * 0.18;
      _c = tint(coat.dark, -0.6);
      taperSeg(pb, bx0, by0, bx0 + sway, by0 + this.neckThick * 1.5, this.neckThick * 0.42 + 1, this.neckThick * 0.30 + 1, _c)
      _c = tint(coat.dark, -0.05);
      taperSeg(pb, bx0, by0, bx0 + sway, by0 + this.neckThick * 1.5, this.neckThick * 0.42, this.neckThick * 0.30, _c)
    }
    if (c.extras.mane) {
      _c = tint(coat.dark, -0.28);
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        blob(pb, lerp(nx, px, t) + Math.cos(ang + Math.PI / 2) * this.neckThick * 0.8,
                  lerp(ny, py, t) + Math.sin(ang + Math.PI / 2) * this.neckThick * 0.8,
                  this.neckThick * 0.75, _c)
      }
    }

    // --- the head, level ------------------------------------------------------
    // Level, then tipped by whatever the animal is doing. Grazing puts the
    // nose on the floor; alarm lifts the chin.
    const face = 0.08 + this.headDrop * 1.15 - this.alarm * 0.22 + this.pitch * 0.5;
    const fx = Math.cos(face), fy = Math.sin(face);

    // skull: a disc at the poll, sitting slightly forward of the neck's end
    const sx = px + fx * this.headR * 0.15;
    const sy = py + fy * this.headR * 0.15;
    // muzzle: a tapering tube off the front of the skull, level with the face
    const mx = sx + fx * this.muzzle;
    const my = sy + fy * this.muzzle;

    const blunt = c.head.snout === 'blunt';
    const hPts = [
      { x: sx - fx * this.headR * 0.55, y: sy - fy * this.headR * 0.55, r: this.headR * 0.80, f: 0.08 },
      { x: sx, y: sy, r: this.headR, f: 0.06 },
      { x: lerp(sx, mx, 0.55), y: lerp(sy, my, 0.55), r: lerp(this.headR, this.muzzleH, blunt ? 0.45 : 0.72), f: 0.03 },
      { x: mx, y: my, r: Math.max(1.2, this.muzzleH * (blunt ? 1.30 : 0.90)), f: 0 },
    ];
    tube(pb, hPts, coat.base, 1.2, () => tint(coat.dark, -0.62));
    tube(pb, hPts, coat.base, 0, (f, u) =>
      (u < -0.5 ? coat.light : u > 0.62 ? tint(coat.dark, -0.08) : coat.base));

    // the jaw, hanging under the back half of the muzzle — this is what stops
    // a head reading as a cone
    _c = tint(coat.dark, -0.6);
    taperSeg(pb, sx + fx * this.headR * 0.25 - fy * this.headR * 0.42,
                  sy + fy * this.headR * 0.25 + fx * this.headR * 0.42,
                  lerp(sx, mx, 0.82) - fy * this.muzzleH * 0.45,
                  lerp(sy, my, 0.82) + fx * this.muzzleH * 0.45,
                  this.headR * 0.30 + 1, this.muzzleH * 0.38 + 1, _c)
    _c = tint(coat.dark, -0.05);
    taperSeg(pb, sx + fx * this.headR * 0.25 - fy * this.headR * 0.42,
                  sy + fy * this.headR * 0.25 + fx * this.headR * 0.42,
                  lerp(sx, mx, 0.82) - fy * this.muzzleH * 0.45,
                  lerp(sy, my, 0.82) + fx * this.muzzleH * 0.45,
                  this.headR * 0.30, this.muzzleH * 0.38, _c)

    this._headgear(pb, sx, sy, face, coat);
    if (c.extras.crown && coat.accent) {
      // A sandhill crane's bare red crown, on the forehead ahead of the eye.
      _c = coat.accent;
      blob(pb, sx + fx * this.headR * 0.42 - fy * this.headR * 0.52,
               sy + fy * this.headR * 0.42 + fx * this.headR * 0.52,
           Math.max(1.2, this.headR * 0.46), _c)
    }
    this._ears(pb, sx, sy, face, coat);

    // nose and eye last: a face is where the reader looks first
    _c = coat.nose;
    blob(pb, mx + fx * this.muzzleH * 0.35, my + fy * this.muzzleH * 0.3,
         Math.max(1, this.muzzleH * 0.48), _c)

    const ex = sx + fx * this.headR * 0.34 - fy * this.headR * 0.40;
    const ey = sy + fy * this.headR * 0.34 + fx * this.headR * 0.40;
    const er = Math.max(0.8, c.eye.r * this.s * 0.26);
    if (this.blink > 0) {
      _c = tint(coat.dark, -0.45);
      _rect(pb, Math.round(ex - er), Math.round(ey), Math.max(2, Math.round(er * 2.2)), 1, _c);
    } else {
      // A dark socket with the iris inside it, not a coloured lamp. Amber
      // eyes belong to the wolf, but at this size a full amber disc is the
      // only thing you see on the whole animal.
      _c = tint(coat.dark, -0.72);
      blob(pb, ex, ey, er + 1, _c)
      _c = c.eye.color;
      blob(pb, ex, ey, er, _c)
      _c = tint(coat.dark, -0.8);
      blob(pb, ex + 0.2, ey + 0.2, er * 0.5, _c)
    }
  }

  _ears(pb, sx, sy, face, coat) {
    let _c = '#000000';
    const e = this.cfg.ears;
    if (e.style === 'none') return;
    // Half the beastiary's number. At full size an ear came out as wide as the
    // skull, which read as a fin rather than an ear.
    const size = (e.size || 2) * this.s * 0.52;
    const flick = this.earFlick > 0 ? 0.42 : 0;
    const up = -1.28 - this.alarm * 0.28 + flick + (e.tilt || 0);
    const fx = Math.cos(face), fy = Math.sin(face);
    // far ear first, darker and set back, so the near one reads in front of it
    for (const [side, tone, back] of [[-1, tint(coat.dark, -0.26), 1.6], [1, coat.base, 0]]) {
      const bx = sx - fx * (this.headR * 0.62 + back);
      const by = sy - fy * (this.headR * 0.62 + back) - back * 0.35;
      const a = face + up + side * 0.16;
      const tipX = bx + Math.cos(a) * size, tipY = by + Math.sin(a) * size;
      if (e.style === 'round') {
        // A bear's ear is a disc standing off the back of the skull, not a
        // cone. Drawn as a rimmed circle centred at two thirds of the reach.
        const cx = lerp(bx, tipX, 0.62), cy = lerp(by, tipY, 0.62);
        _c = tint(tone, -0.62);
        blob(pb, cx, cy, size * 0.60, _c)
        _c = tone;
        blob(pb, cx - fx * 0.6, cy - fy * 0.6, size * 0.44, _c)
        if (side > 0) { _c = tint(coat.dark, -0.34); blob(pb, cx, cy + size * 0.10, size * 0.24, _c) }
        continue;
      }
      _c = tint(tone, -0.6);
      taperSeg(pb, bx, by, tipX, tipY, size * 0.42 + 1, 1.2, _c)
      _c = tone;
      taperSeg(pb, bx, by, tipX, tipY, size * 0.36, 0.6, _c)
      // The inner ear is a shadow, not a highlight. Lighting it was what made
      // every dark-coated animal look like it had a lamp behind its head.
      if (side > 0 && e.style !== 'tiny') {
        _c = coat.earInner || tint(coat.dark, -0.18);
        taperSeg(pb, lerp(bx, tipX, 0.3), lerp(by, tipY, 0.3),
                 lerp(bx, tipX, 0.76), lerp(by, tipY, 0.76), size * 0.17, 0.5, _c)
      }
    }
  }

  _headgear(pb, px, py, face, coat) {
    let _c = '#000000';
    const x = this.cfg.extras || {};
    const col = x.hornColor || '#8d7c5e';
    const s = this.s;
    if (x.horns === 'bison') {
      for (const side of [-1, 1]) {
        const bx = px - Math.cos(face) * this.headR * 0.2 + side * 0.6;
        const by = py - Math.sin(face) * this.headR * 0.9 - Math.abs(side) * 0.4;
        _c = side < 0 ? tint(col, -0.3) : col;
        // short, up and forward, hooking in
        taperSeg(pb, bx, by, bx + Math.cos(face - 1.5) * 3.4 * s, by + Math.sin(face - 1.5) * 3.4 * s, 1.5 * s, 0.9 * s, _c)
        taperSeg(pb, bx + Math.cos(face - 1.5) * 3.4 * s, by + Math.sin(face - 1.5) * 3.4 * s,
                 bx + Math.cos(face - 0.7) * 5.0 * s, by + Math.sin(face - 0.7) * 5.0 * s, 0.9 * s, 0.5 * s, _c)
      }
    } else if (x.horns === 'curl') {
      for (const side of [-1, 1]) {
        _c = side < 0 ? tint(col, -0.3) : col;
        // A ram's horn is a spiral, and a spiral only reads if the gap
        // between turns is wider than the horn is thick. Fatter links than
        // steps fused it into a solid disc.
        let a = face - 1.55;
        let cx = px - Math.cos(face) * this.headR * 0.35, cy = py - Math.sin(face) * this.headR * 0.75;
        for (let i = 0; i < 15; i++) {
          const t = i / 14;
          const step = 1.12 * s * (1 - t * 0.30);
          const w = (0.62 - t * 0.26) * s;
          taperSeg(pb, cx, cy, cx + Math.cos(a) * step, cy + Math.sin(a) * step, w + 0.8, w * 0.9 + 0.8, _c)
          cx += Math.cos(a) * step; cy += Math.sin(a) * step;
          a += 0.40;
        }
      }
    } else if (x.horns === 'prong') {
      for (const side of [-1, 1]) {
        _c = side < 0 ? tint(col, -0.35) : col;
        const bx = px - Math.cos(face) * this.headR * 0.25 + side * 0.5;
        const by = py - Math.sin(face) * this.headR * 0.85;
        const tx = bx + Math.cos(face - 1.45) * 5.2 * s, ty = by + Math.sin(face - 1.45) * 5.2 * s;
        taperSeg(pb, bx, by, tx, ty, 1.1 * s, 0.5 * s, _c)
        taperSeg(pb, lerp(bx, tx, 0.55), lerp(by, ty, 0.55),
                 lerp(bx, tx, 0.55) + Math.cos(face - 0.4) * 2.6 * s,
                 lerp(by, ty, 0.55) + Math.sin(face - 0.4) * 2.6 * s, 0.8 * s, 0.4 * s, _c)
      }
    } else if (x.antlers) {
      const style = x.antlers;
      const big = style === 'moose' ? 0.92 : style === 'elk' ? 0.95 : 0.68;
      for (const side of [-1, 1]) {
        _c = side < 0 ? tint(col, -0.32) : col;
        const bx = px - Math.cos(face) * this.headR * 0.35 + side * 0.7;
        const by = py - Math.sin(face) * this.headR * 0.9 - Math.abs(side) * 0.5;
        if (style === 'moose') {
          // palmate: a slab either side with tines off the leading edge
          const ax = bx + Math.cos(face - 1.2) * 4 * s * big, ay = by + Math.sin(face - 1.2) * 4 * s * big;
          taperSeg(pb, bx, by, ax, ay, 1.4 * s, 1.2 * s, _c)
          const ex = ax + Math.cos(face - 0.25) * 5.2 * s * big, ey = ay + Math.sin(face - 0.25) * 5.2 * s * big;
          taperSeg(pb, ax, ay, ex, ey, 1.5 * s, 1.1 * s, _c)
          for (let i = 0; i < 4; i++) {
            const t = 0.25 + i * 0.24;
            taperSeg(pb, lerp(ax, ex, t), lerp(ay, ey, t),
                     lerp(ax, ex, t) + Math.cos(face - 1.5) * 2.6 * s,
                     lerp(ay, ey, t) + Math.sin(face - 1.5) * 2.6 * s, 0.8 * s, 0.4 * s, _c)
          }
        } else {
          // a beam sweeping back over the shoulders with tines standing off it
          const ex = bx - Math.cos(face) * 9 * s * big, ey = by - Math.sin(face) * 2 * s * big - 5 * s * big;
          taperSeg(pb, bx, by, ex, ey, 1.2 * s, 0.6 * s, _c)
          const tines = style === 'elk' ? 4 : 2;
          for (let i = 0; i < tines; i++) {
            const t = 0.2 + i * (0.72 / tines);
            taperSeg(pb, lerp(bx, ex, t), lerp(by, ey, t),
                     lerp(bx, ex, t) + Math.cos(face - 1.35) * (3.4 - i * 0.4) * s * big,
                     lerp(by, ey, t) + Math.sin(face - 1.35) * (3.4 - i * 0.4) * s * big, 0.8 * s, 0.35 * s, _c)
          }
        }
      }
    }
  }

  /**
   * On-screen footprint. Also the size of the buffer each pose is baked into,
   * which is why the headgear has to be in it: an elk's rack stands a third of
   * its own height above its skull, and leaving it out of this number clipped
   * every antler in the basin the moment poses started being baked rather than
   * drawn straight to the screen.
   */
  size() {
    const x = this.cfg.extras;
    const s = this.s;
    let up = 0, back = 0, fwd = 0;
    if (x.antlers) {
      const big = x.antlers === 'moose' ? 0.92 : x.antlers === 'elk' ? 0.95 : 0.68;
      up = 9 * s * big; back = 10 * s * big; fwd = 6 * s * big;
    } else if (x.horns === 'curl') { up = 5 * s; back = 6 * s; fwd = 5 * s; }
    else if (x.horns === 'prong') { up = 6 * s; fwd = 3 * s; }
    else if (x.horns === 'bison') { up = 5 * s; fwd = 4 * s; }
    const ears = (this.cfg.ears.size || 2) * s * 0.52;

    const w = this.bodyLen + this.neckLen + this.muzzle + this.tailLen * 0.7 + back + fwd;
    const h = this.legLen + this.bodyHgt + this.neckLen * 0.9 + this.headR * 2
      + Math.max(this.hump, this.rump) + Math.max(up, ears)
      + this.bodyLen * Math.sin(this.tilt) * 0.62;
    return { w: Math.ceil(w), h: Math.ceil(h) };
  }
}
