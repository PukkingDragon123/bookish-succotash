// Rasterising a live rig into pixels.
//
// Rigs are solved in floating point and then have to land on a pixel grid
// without turning into porridge. These are the three primitives that do it,
// shared by the ferret and by every other animal in the basin so they sit in
// the same world instead of looking like two different games.
//
// The rule behind all of them: stamp *spans*, not squares. A square stamped
// along a centre line gives a lumpy sausage whose width changes as the body
// rotates; filling across the line's normal gives a clean tube at any angle,
// and hands each pixel a coordinate across the body so a shader callback can
// put the dark along the spine and the pale under the belly.
//
// They all write into a PixBuf rather than a 2D context. Painting a rig with
// one fillRect and one fillStyle assignment per pixel cost about six
// milliseconds an animal; writing words into a typed array costs almost
// nothing, and the whole sprite goes to the GPU in a single putImageData.

/**
 * A filled disc, scanned row by row.
 *
 * The obvious thing here is a square, and a square is what a head made of
 * stacked squares looks like: a brick. Scanning rows costs a handful of spans
 * and gives an actual round skull at five pixels across, which is the
 * difference between a face and a smudge.
 */
export function blob(t, x, y, r, col) {
  // Callers hand over a CSS colour; the buffer stores packed words. Doing the
  // conversion here rather than at every call site is one typeof per shape,
  // and skipping it writes a string into a Uint32Array — which coerces to
  // zero, so the limb is drawn perfectly and is entirely transparent.
  const v = typeof col === 'string' ? t.col(col) : col;
  const cx = Math.round(t.px(x, y)), cy = Math.round(t.py(x, y));
  if (r <= 0.7) { t.put(cx, cy, v); return; }
  if (r <= 1.2) { t.span(cx - 1, cx, cy - 1, v); t.span(cx - 1, cx, cy, v); return; }
  const top = Math.round(-r), bot = Math.round(r);
  for (let j = top; j <= bot; j++) {
    const dy = (Math.abs(j) + 0.5) - 0.5;
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    const w = Math.max(1, Math.round(half * 2));
    t.span(cx - (w >> 1), cx - (w >> 1) + w - 1, cy + j, v);
  }
}

/**
 * A limb segment that tapers, which is what a real leg does — thick at the
 * shoulder, one pixel at the hoof. Constant-width limbs are the single
 * loudest tell of a rig that was drawn by a programmer.
 */
export function taperSeg(t, x0, y0, x1, y1, w0, w1, col) {
  const v = typeof col === 'string' ? t.col(col) : col;
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.4));
  for (let s = 0; s <= steps; s++) {
    const k = s / steps;
    blob(t, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, w0 + (w1 - w0) * k, v);
  }
}

/** A limb segment of constant width. */
export function seg(t, x0, y0, x1, y1, w, v) { taperSeg(t, x0, y0, x1, y1, w, w, v); }

/**
 * Paint a body as a run of spans perpendicular to its centre line.
 *
 * `pts` are `{x, y, r, f}` — position, radius, and how far along the body this
 * node is (0 at the nose, 1 at the tail), which the shader uses to change the
 * colour along the length. The shader gets `(f, u, x, y)` where `u` runs -1 at
 * the top of the body to +1 at the bottom, and x/y are the pixel being filled
 * so a shader can dither its band edges — on a deep barrel a hard boundary
 * between two coat tones reads as a painted stripe rather than as a turn in
 * the form.
 */
export function tube(t, pts, color, grow, shade) {
  if (pts.length < 2) return;
  // Per-point normals, averaged from the segments either side.
  //
  // Stamping each segment's own perpendicular leaves wedge-shaped holes on the
  // outside of a curve, because consecutive spans fan apart — which is exactly
  // what turned a bison's hump into a row of spikes. Interpolating a smoothed
  // normal along each segment closes the fan and sweeps a continuous surface.
  const X = [], Y = [], NX = [], NY = [];
  for (let i = 0; i < pts.length; i++) { X.push(t.px(pts[i].x, pts[i].y)); Y.push(t.py(pts[i].x, pts[i].y)); }
  for (let i = 0; i < pts.length; i++) {
    const a = Math.max(0, i - 1), b = Math.min(pts.length - 1, i + 1);
    const dx = X[b] - X[a], dy = Y[b] - Y[a];
    const len = Math.hypot(dx, dy) || 1;
    NX.push(-dy / len); NY.push(dx / len);
  }
  const flat = t.col(color);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ax = X[i], ay = Y[i], bx = X[i + 1], by = Y[i + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len * 2.2));
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const cx = ax + dx * k, cy = ay + dy * k;
      const rr = (a.r + (b.r - a.r) * k) + grow;
      if (rr <= 0.2) continue;
      let nx = NX[i] + (NX[i + 1] - NX[i]) * k;
      let ny = NY[i] + (NY[i + 1] - NY[i]) * k;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      const f = a.f + (b.f - a.f) * k;
      const half = Math.max(1, Math.round(rr));
      for (let j = -half; j <= half; j++) {
        const u = j / half;
        const qx = Math.round(cx + nx * j), qy = Math.round(cy + ny * j);
        t.put(qx, qy, shade ? t.col(shade(f, u, qx, qy) || color) : flat);
      }
    }
  }
}

/**
 * Two-bone inverse kinematics.
 *
 * Given a hip, a foot, and two bone lengths, find the joint between them.
 * `bend` is +1 or -1 and decides which way the joint breaks — the single most
 * important number in animal animation, because a foreleg's elbow goes
 * backwards and a hind leg's stifle goes forwards, and getting it the wrong
 * way round turns a deer into a chair.
 */
export function ik2(hx, hy, fx, fy, l1, l2, bend) {
  let dx = fx - hx, dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = (l1 + l2) * 0.999;
  if (d > max) { const k = max / (d || 1); dx *= k; dy *= k; d = max; }
  if (d < 0.001) { dx = 0; dy = d = 0.001; }
  const base = Math.atan2(dy, dx);
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const a = Math.acos(cosA) * bend;
  return {
    jx: hx + Math.cos(base + a) * l1,
    jy: hy + Math.sin(base + a) * l1,
    fx: hx + dx, fy: hy + dy,
  };
}
