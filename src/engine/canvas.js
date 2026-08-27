// Pixel-perfect renderer. The screen canvas is a tiny internal resolution that
// the browser upscales with nearest-neighbour, so every drawn pixel is a real,
// chunky pixel. All world drawing goes through the camera transform.

import { clamp, damp, snap } from './math.js';

// Internal resolution. These are LIVE module bindings: `resize()` reassigns
// them so the game fills whatever screen it lands on — a 16:9 monitor, a 4:3
// iPad, a phone held sideways — instead of letterboxing a fixed 480x270 box.
export let VIEW_W = 640;
export let VIEW_H = 400;

// Roughly how many game pixels tall the picture should be. Bigger = more of
// the basin on screen and a smaller ferret in the middle of it; this is the
// knob that decides how much world you can see at once.
//
// It went up when the sprites did. The art now carries enough detail to stand
// being further away, and standing further away is what makes a forest feel
// like a forest rather than a corridor of trees.
const TARGET_PX = 420;
const MIN_H = 240, MAX_H = 560;
const MIN_W = 340, MAX_W = 980;

const evenDown = (v) => Math.max(2, Math.floor(v / 2) * 2);

/**
 * Pick an internal resolution and an integer upscale for the current window.
 * Tries every whole scale and keeps the one that covers the most screen while
 * staying near the target pixel size, so a 4:3 iPad fills edge to edge instead
 * of floating in a letterbox.
 */
export function computeViewport(availW, availH) {
  const ideal = Math.max(1, availH / TARGET_PX);
  let best = null;
  for (let scale = 1; scale <= 10; scale++) {
    const w = evenDown(Math.min(availW / scale, MAX_W));
    const h = evenDown(Math.min(availH / scale, MAX_H));
    if (w < MIN_W || h < MIN_H) continue;
    const coverage = (w * scale * h * scale) / (availW * availH);
    const sizePenalty = Math.abs(Math.log2(scale / ideal)) * 0.12;
    const score = coverage - sizePenalty;
    if (!best || score > best.score) best = { w, h, scale, score };
  }
  // Nothing fit the minimums (a very small window): fall back to 1:1.
  if (!best) best = { w: evenDown(Math.max(MIN_W, availW)), h: evenDown(Math.max(MIN_H, availH)), scale: 1, score: 0 };
  return best;
}

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.tx = 0; this.ty = 0;
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.zoom = 1;
    this.bounds = null; // {minX,minY,maxX,maxY} in world px
  }
  follow(x, y, lead = 0, leadX = 0, leadY = 0) {
    this.tx = x + leadX * lead;
    this.ty = y + leadY * lead;
  }
  addShake(amount) { this.shake = Math.min(this.shake + amount, 14); }
  update(dt) {
    this.x = damp(this.x, this.tx, 0.0008, dt);
    this.y = damp(this.y, this.ty, 0.0008, dt);
    if (this.bounds) {
      const hw = VIEW_W / 2, hh = VIEW_H / 2;
      const b = this.bounds;
      if (b.maxX - b.minX > VIEW_W) this.x = clamp(this.x, b.minX + hw, b.maxX - hw);
      else this.x = (b.minX + b.maxX) / 2;
      if (b.maxY - b.minY > VIEW_H) this.y = clamp(this.y, b.minY + hh, b.maxY - hh);
      else this.y = (b.minY + b.maxY) / 2;
    }
    this.shake = Math.max(0, this.shake - dt * 26);
    const s = this.shake;
    this.shakeX = (Math.random() * 2 - 1) * s;
    this.shakeY = (Math.random() * 2 - 1) * s;
  }
  // Top-left of the visible world rect, snapped to whole pixels.
  get ox() { return snap(this.x - VIEW_W / 2 + this.shakeX); }
  get oy() { return snap(this.y - VIEW_H / 2 + this.shakeY); }
  toScreen(wx, wy) { return { x: wx - this.ox, y: wy - this.oy }; }
  toWorld(sx, sy) { return { x: sx + this.ox, y: sy + this.oy }; }
  visible(wx, wy, pad = 40) {
    const ox = this.ox, oy = this.oy;
    return wx > ox - pad && wx < ox + VIEW_W + pad && wy > oy - pad && wy < oy + VIEW_H + pad;
  }
}

const RADIAL_CACHE = new Map();

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

export class Renderer {
  constructor(screenCanvas) {
    this.canvas = screenCanvas;
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.camera = new Camera();

    // Lightmap: multiplied over the frame for fire glow, night, geyser light.
    const lm = makeCanvas(VIEW_W, VIEW_H);
    this.lightCanvas = lm.canvas;
    this.lightCtx = lm.ctx;

    // Additive layer for glows, muzzle flashes, embers.
    const gl = makeCanvas(VIEW_W, VIEW_H);
    this.glowCanvas = gl.canvas;
    this.glowCtx = gl.ctx;

    this.resize();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
      window.visualViewport.addEventListener('scroll', onResize);
    }
  }

  resize() {
    // The visual viewport is what actually matters on iOS, where the browser
    // chrome and the on-screen keyboard shrink the usable area.
    const vv = window.visualViewport;
    const availW = Math.round(vv ? vv.width : window.innerWidth);
    const availH = Math.round(vv ? vv.height : window.innerHeight);
    const v = computeViewport(availW, availH);

    if (v.w !== VIEW_W || v.h !== VIEW_H) {
      VIEW_W = v.w; VIEW_H = v.h;
      this.canvas.width = VIEW_W;
      this.canvas.height = VIEW_H;
      this.ctx.imageSmoothingEnabled = false;
      // The compositing buffers have to match the new size.
      const lm = makeCanvas(VIEW_W, VIEW_H);
      this.lightCanvas = lm.canvas; this.lightCtx = lm.ctx;
      const gl = makeCanvas(VIEW_W, VIEW_H);
      this.glowCanvas = gl.canvas; this.glowCtx = gl.ctx;
      if (this.onResize) this.onResize(VIEW_W, VIEW_H);
    }

    // computeViewport already guaranteed this scale fits.
    this.scale = v.scale;
    this.canvas.style.width = (VIEW_W * v.scale) + 'px';
    this.canvas.style.height = (VIEW_H * v.scale) + 'px';
  }

  get width() { return VIEW_W; }
  get height() { return VIEW_H; }

  beginFrame(skyColor) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = skyColor;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    // Lightmap starts at "ambient" and gets brightened by light sources.
    this.lightCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.lightCtx.globalCompositeOperation = 'source-over';
    this.glowCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.glowCtx.globalCompositeOperation = 'source-over';
    this.glowCtx.clearRect(0, 0, VIEW_W, VIEW_H);
    this._lightUsed = false;
  }

  clearLight(ambient) {
    this.lightCtx.globalCompositeOperation = 'source-over';
    this.lightCtx.fillStyle = ambient;
    this.lightCtx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.lightCtx.globalCompositeOperation = 'lighter';
    this._lightUsed = true;
  }

  /**
   * Radial falloff sprites, baked once per (radius, colour) pair. Building a
   * CanvasGradient per call is fine for a handful of lights and ruinous for a
   * thousand glowing bullets, so everything goes through this cache.
   */
  _radial(radius, color) {
    const r = Math.max(2, Math.round(radius));
    const key = r + '|' + color;
    let c = RADIAL_CACHE.get(key);
    if (c) return c;
    const size = r * 2;
    const { canvas, ctx } = makeCanvas(size, size);
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    if (RADIAL_CACHE.size > 260) RADIAL_CACHE.clear();
    RADIAL_CACHE.set(key, canvas);
    return canvas;
  }

  // Radial light in world coordinates.
  light(wx, wy, radius, color = '#ffffff', intensity = 1) {
    const x = wx - this.camera.ox, y = wy - this.camera.oy;
    if (x < -radius || y < -radius || x > VIEW_W + radius || y > VIEW_H + radius) return;
    const img = this._radial(radius, color);
    const c = this.lightCtx;
    c.globalAlpha = intensity;
    c.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
    c.globalAlpha = 1;
  }

  glow(wx, wy, radius, color, intensity = 1) {
    const x = wx - this.camera.ox, y = wy - this.camera.oy;
    if (x < -radius || y < -radius || x > VIEW_W + radius || y > VIEW_H + radius) return;
    const img = this._radial(radius, color);
    const c = this.glowCtx;
    c.globalAlpha = intensity;
    c.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
    c.globalAlpha = 1;
  }

  endWorld() {
    if (this._lightUsed) {
      this.ctx.globalCompositeOperation = 'multiply';
      this.ctx.drawImage(this.lightCanvas, 0, 0);
    }
    this.ctx.globalCompositeOperation = 'lighter';
    this.ctx.drawImage(this.glowCanvas, 0, 0);
    this.ctx.globalCompositeOperation = 'source-over';
  }

  // --- world-space primitives ---------------------------------------------
  draw(img, wx, wy, flip = false, alpha = 1) {
    if (!img) return;
    const x = snap(wx - this.camera.ox), y = snap(wy - this.camera.oy);
    if (x + img.width < 0 || y + img.height < 0 || x > VIEW_W || y > VIEW_H) return;
    const c = this.ctx;
    if (alpha !== 1) c.globalAlpha = alpha;
    if (flip) {
      c.save();
      c.translate(x + img.width, y);
      c.scale(-1, 1);
      c.drawImage(img, 0, 0);
      c.restore();
    } else {
      c.drawImage(img, x, y);
    }
    if (alpha !== 1) c.globalAlpha = 1;
  }

  // Draw with arbitrary rotation/scale (used for bullets, debris, wings).
  drawT(img, wx, wy, rot = 0, sx = 1, sy = 1, alpha = 1, originX = null, originY = null) {
    if (!img) return;
    const c = this.ctx;
    const ox = originX == null ? img.width / 2 : originX;
    const oy = originY == null ? img.height / 2 : originY;
    c.save();
    c.globalAlpha = alpha;
    c.translate(snap(wx - this.camera.ox), snap(wy - this.camera.oy));
    if (rot) c.rotate(rot);
    if (sx !== 1 || sy !== 1) c.scale(sx, sy);
    c.drawImage(img, -ox, -oy);
    c.restore();
  }

  rect(wx, wy, w, h, color) {
    const c = this.ctx;
    c.fillStyle = color;
    c.fillRect(snap(wx - this.camera.ox), snap(wy - this.camera.oy), Math.round(w), Math.round(h));
  }
  rectA(wx, wy, w, h, color, alpha) {
    const c = this.ctx; c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(snap(wx - this.camera.ox), snap(wy - this.camera.oy), Math.round(w), Math.round(h));
    c.globalAlpha = 1;
  }
  strokeRect(wx, wy, w, h, color) {
    const c = this.ctx;
    c.strokeStyle = color; c.lineWidth = 1;
    c.strokeRect(snap(wx - this.camera.ox) + 0.5, snap(wy - this.camera.oy) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }
  circle(wx, wy, r, color, alpha = 1) {
    const c = this.ctx;
    c.globalAlpha = alpha; c.fillStyle = color;
    c.beginPath(); c.arc(snap(wx - this.camera.ox), snap(wy - this.camera.oy), r, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }
  ring(wx, wy, r, color, width = 1, alpha = 1) {
    const c = this.ctx;
    c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width;
    c.beginPath(); c.arc(snap(wx - this.camera.ox), snap(wy - this.camera.oy), r, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }
  arc(wx, wy, r, a0, a1, color, width = 1, alpha = 1) {
    const c = this.ctx;
    c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width;
    c.beginPath(); c.arc(snap(wx - this.camera.ox), snap(wy - this.camera.oy), r, a0, a1); c.stroke();
    c.globalAlpha = 1;
  }
  line(x1, y1, x2, y2, color, width = 1, alpha = 1) {
    const c = this.ctx;
    c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width;
    c.beginPath();
    c.moveTo(snap(x1 - this.camera.ox) + 0.5, snap(y1 - this.camera.oy) + 0.5);
    c.lineTo(snap(x2 - this.camera.ox) + 0.5, snap(y2 - this.camera.oy) + 0.5);
    c.stroke();
    c.globalAlpha = 1;
  }

  // Soft elliptical contact shadow under an entity.
  shadow(wx, wy, rx, ry = null, alpha = 0.28) {
    const c = this.ctx;
    c.globalAlpha = alpha;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(snap(wx - this.camera.ox), snap(wy - this.camera.oy), Math.round(rx), Math.round(ry == null ? rx * 0.45 : ry), 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }

  // --- screen-space (UI) ---------------------------------------------------
  uiRect(x, y, w, h, color, alpha = 1) {
    const c = this.ctx; c.globalAlpha = alpha; c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    c.globalAlpha = 1;
  }
  uiStroke(x, y, w, h, color, alpha = 1) {
    const c = this.ctx; c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = 1;
    c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
    c.globalAlpha = 1;
  }
  // Panel with the game's chunky two-tone border.
  panel(x, y, w, h, fill = 'rgba(9,16,13,0.92)', border = '#3d5a41') {
    this.uiRect(x, y, w, h, fill);
    this.uiStroke(x, y, w, h, border);
    this.uiRect(x + 1, y + 1, w - 2, 1, 'rgba(255,255,255,0.06)');
  }
  vignette(strength = 0.5) {
    const c = this.ctx;
    const g = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.82);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  flash(color, alpha) {
    if (alpha <= 0) return;
    const c = this.ctx;
    c.globalAlpha = Math.min(1, alpha);
    c.fillStyle = color;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.globalAlpha = 1;
  }
}
