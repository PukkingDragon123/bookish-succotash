// A pixel buffer you can draw a rig into.
//
// The rig primitives used to paint straight onto a 2D context, one
// `fillRect(x, y, 1, 1)` per pixel, with `fillStyle` reassigned per pixel
// wherever a shader was in play. That is the single most expensive way to move
// a pixel in a browser: every assignment reparses a CSS colour string and
// dirties the context state, and a bison came out at about six milliseconds a
// frame. Forty animals on screen took the game from sixty frames to twenty.
//
// So the rig rasterises into a plain Uint32Array instead and hands the whole
// thing over in one `putImageData`. Same output, about thirty times faster.
//
// It carries a small affine stack because the rig genuinely needs one — the
// body pitches and a downed animal rolls — but only points are transformed,
// never pixels, so a rotation stays exact and a disc stays a disc.

const packCache = new Map();

/** '#rrggbb' or 'rgb(r,g,b)' to a little-endian ABGR word. */
export function packColor(str) {
  let v = packCache.get(str);
  if (v !== undefined) return v;
  let r = 0, g = 0, b = 0;
  if (str.charCodeAt(0) === 35) {           // '#'
    const n = parseInt(str.slice(1), 16);
    if (str.length === 4) {
      r = ((n >> 8) & 15) * 17; g = ((n >> 4) & 15) * 17; b = (n & 15) * 17;
    } else {
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    }
  } else {
    const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(str);
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
  }
  v = (255 << 24) | (b << 16) | (g << 8) | r;
  packCache.set(str, v);
  return v;
}

export class PixBuf {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint32Array(w * h);
    // affine: [a c e / b d f]. Rotation and translation only, so radii pass
    // through untouched.
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    this._stack = [];
    // Shaders hand back colour strings, and along any one span the colour
    // changes maybe four times. Remembering the last one turns the common
    // case into a single string comparison.
    this._lastStr = null; this._lastVal = 0;
  }

  save() { this._stack.push(this.a, this.b, this.c, this.d, this.e, this.f); }
  restore() {
    if (this._stack.length < 6) return;
    this.f = this._stack.pop(); this.e = this._stack.pop();
    this.d = this._stack.pop(); this.c = this._stack.pop();
    this.b = this._stack.pop(); this.a = this._stack.pop();
  }
  translate(x, y) {
    this.e += this.a * x + this.c * y;
    this.f += this.b * x + this.d * y;
  }
  rotate(t) {
    const cs = Math.cos(t), sn = Math.sin(t);
    const a = this.a, b = this.b, c = this.c, d = this.d;
    this.a = a * cs + c * sn; this.b = b * cs + d * sn;
    this.c = a * -sn + c * cs; this.d = b * -sn + d * cs;
  }
  /** Transformed x of a local point. */
  px(x, y) { return this.a * x + this.c * y + this.e; }
  /** Transformed y of a local point. */
  py(x, y) { return this.b * x + this.d * y + this.f; }

  col(str) {
    if (str === this._lastStr) return this._lastVal;
    this._lastStr = str;
    this._lastVal = packColor(str);
    return this._lastVal;
  }

  /** Already-transformed, already-rounded. The hot path. */
  put(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = v;
  }

  /** A horizontal run, for the span rasterisers. */
  span(x0, x1, y, v) {
    if (y < 0 || y >= this.h) return;
    let a = x0 < 0 ? 0 : x0;
    const b = x1 >= this.w ? this.w - 1 : x1;
    const row = y * this.w;
    for (; a <= b; a++) this.data[row + a] = v;
  }

  /** Hand the finished sprite to a canvas, once. */
  toCanvas() {
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(this.w, this.h)
      : Object.assign(document.createElement('canvas'), { width: this.w, height: this.h });
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.data);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}
