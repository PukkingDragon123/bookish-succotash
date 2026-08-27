// Touch controls for phones and iPad. Two floating sticks — left to move,
// right to aim and fire — plus a ring of action buttons. Everything is fed back
// into the same action names the keyboard uses, so no gameplay code has to know
// whether a human is holding a mouse or a slab of glass.

import { drawText } from './font.js';
import { VIEW_W, VIEW_H } from './canvas.js';
import { clamp, TAU } from './math.js';

export function isTouchDevice() {
  return (typeof window !== 'undefined') &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
}

const STICK_R = 24;     // outer ring radius, scaled below
const KNOB_R = 9;
const DEAD = 0.14;

export class TouchControls {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = isTouchDevice();
    this.visible = this.enabled;
    this.pointers = new Map();     // pointerId -> {kind, ...}
    this.move = { x: 0, y: 0, active: false, ox: 0, oy: 0, kx: 0, ky: 0 };
    this.aim = { x: 1, y: 0, active: false, ox: 0, oy: 0, kx: 0, ky: 0 };
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.tap = null;               // {x,y} screen-space tap for menus/panels
    this.uiMode = false;           // when true the whole screen is a tap target
    // Buttons the game has switched off this frame (nothing to craft, no squad,
    // no gun yet). Hidden buttons do not draw and do not take taps.
    this.hidden = new Set();
    this.buttons = [];
    this.scale = 1;
    this._layout();
    this._bind();
  }

  /**
   * Buttons are laid out from the corners so they stay under the thumbs at any
   * aspect ratio, and scale with the internal resolution.
   */
  _layout() {
    const s = this.scale = clamp(VIEW_H / 270, 0.78, 1.5);
    const R = (v) => Math.round(v * s);
    const W = VIEW_W, H = VIEW_H;
    const bigR = R(16), midR = R(13), smallR = R(10);

    this.buttons = [
      // right thumb cluster
      { action: 'dash',     label: 'DSH', x: W - R(26), y: H - R(26), r: bigR, tint: '#4de1ff' },
      { action: 'melee',    label: 'CLW', x: W - R(58), y: H - R(20), r: midR, tint: '#ff8a5a' },
      { action: 'interact', label: 'E',   x: W - R(24), y: H - R(60), r: midR, tint: '#8ac47a' },
      { action: 'overclock',label: 'OC',  x: W - R(56), y: H - R(50), r: smallR, tint: '#b8f5ff', toggle: true },
      // utility column, right edge
      { action: 'scan',     label: 'Q',  x: W - R(13), y: H - R(96),  r: smallR, tint: '#4de1ff' },
      { action: 'douse',    label: 'H2O', x: W - R(13), y: H - R(120), r: smallR, tint: '#a7d8e6' },
      { action: 'use',      label: 'EAT', x: W - R(13), y: H - R(144), r: smallR, tint: '#7fd48a' },
      { action: 'smoke',    label: 'SMK', x: W - R(13), y: H - R(168), r: smallR, tint: '#8a9483' },
      // left edge: weapon + squad
      { action: 'weapon',   label: 'GUN', x: R(15), y: H - R(26), r: midR, tint: '#e8d7b0' },
      { action: 'command',  label: 'CMD', x: R(15), y: H - R(58), r: smallR, tint: '#f0c05a', toggle: true },
      { action: 'rally',    label: 'RLY', x: R(15), y: H - R(82), r: smallR, tint: '#f0c05a' },
      // top row
      { action: 'craft',    label: 'CRF', x: W - R(13), y: R(13), r: smallR, tint: '#e8d7b0' },
      { action: 'chips',    label: 'CHP', x: W - R(37), y: R(13), r: smallR, tint: '#4de1ff' },
      { action: 'map',      label: 'MAP', x: W - R(61), y: R(13), r: smallR, tint: '#8ac47a' },
      { action: 'pause',    label: '||',  x: W - R(85), y: R(13), r: smallR, tint: '#8a9483' },
      { action: 'fullscreen', label: 'FS', x: W - R(109), y: R(13), r: smallR, tint: '#8a9483' },
    ];
    this.stickR = Math.round(STICK_R * s);
    this.knobR = Math.round(KNOB_R * s);
  }

  onViewportChange() { this._layout(); }

  _toCanvas(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * VIEW_W,
      y: ((clientY - r.top) / r.height) * VIEW_H,
    };
  }

  /** The game tells us which actions make no sense right now. */
  setHidden(actions) {
    this.hidden.clear();
    for (const a of actions) this.hidden.add(a);
  }

  _hitButton(x, y) {
    // Generous hit radius: fingers are not mouse cursors.
    for (const b of this.buttons) {
      if (this.hidden.has(b.action)) continue;
      const pad = b.r + 6 * this.scale;
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= pad * pad) return b;
    }
    return null;
  }

  _bind() {
    const cv = this.canvas;
    const opts = { passive: false };

    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;      // mouse keeps its own path
      this.enabled = true; this.visible = true;
      e.preventDefault();
      const p = this._toCanvas(e.clientX, e.clientY);
      this.tap = { x: p.x, y: p.y };

      if (this.uiMode) {
        this.pointers.set(e.pointerId, { kind: 'ui' });
        return;
      }

      // Never let capture be fatal: some engines refuse it for synthetic or
      // already-released pointers.
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not important */ }
      const btn = this._hitButton(p.x, p.y);
      if (btn) {
        this.pointers.set(e.pointerId, { kind: 'button', action: btn.action });
        this.down.add(btn.action);
        this.pressed.add(btn.action);
        btn.flash = 1;
        return;
      }

      if (p.x < VIEW_W * 0.46) {
        this.pointers.set(e.pointerId, { kind: 'move' });
        this.move.active = true;
        this.move.ox = p.x; this.move.oy = p.y;
        this.move.kx = p.x; this.move.ky = p.y;
        this.move.x = 0; this.move.y = 0;
      } else {
        this.pointers.set(e.pointerId, { kind: 'aim' });
        this.aim.active = true;
        this.aim.ox = p.x; this.aim.oy = p.y;
        this.aim.kx = p.x; this.aim.ky = p.y;
      }
    }, opts);

    cv.addEventListener('pointermove', (e) => {
      const rec = this.pointers.get(e.pointerId);
      if (!rec) return;
      e.preventDefault();
      const p = this._toCanvas(e.clientX, e.clientY);
      if (rec.kind === 'move') this._dragStick(this.move, p);
      else if (rec.kind === 'aim') this._dragStick(this.aim, p);
      else if (rec.kind === 'ui') this.tap = { x: p.x, y: p.y };
    }, opts);

    const end = (e) => {
      const rec = this.pointers.get(e.pointerId);
      if (!rec) return;
      this.pointers.delete(e.pointerId);
      if (rec.kind === 'move') { this.move.active = false; this.move.x = 0; this.move.y = 0; }
      else if (rec.kind === 'aim') { this.aim.active = false; }
      else if (rec.kind === 'button') { this.down.delete(rec.action); this.released.add(rec.action); }
    };
    cv.addEventListener('pointerup', end, opts);
    cv.addEventListener('pointercancel', end, opts);

    // Stop iOS from scrolling, zooming or bouncing the page under the game.
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange']) {
      cv.addEventListener(ev, (e) => e.preventDefault(), opts);
    }
    document.addEventListener('touchmove', (e) => {
      if (e.target === cv) e.preventDefault();
    }, opts);
  }

  _dragStick(st, p) {
    let dx = p.x - st.ox, dy = p.y - st.oy;
    const len = Math.hypot(dx, dy);
    const R = this.stickR;
    if (len > R) {
      // Let the stick base follow the thumb once it leaves the ring, which is
      // what makes long drags on a small screen feel right.
      st.ox += dx * (1 - R / len);
      st.oy += dy * (1 - R / len);
      dx *= R / len; dy *= R / len;
    }
    st.kx = st.ox + dx; st.ky = st.oy + dy;
    const n = Math.min(1, len / R);
    if (n < DEAD) { st.x = 0; st.y = 0; return; }
    const inv = 1 / (len || 1);
    const mag = (n - DEAD) / (1 - DEAD);
    st.x = dx * inv * mag;
    st.y = dy * inv * mag;
  }

  // --- queries -------------------------------------------------------------
  axes() {
    if (!this.move.active) return null;
    return { x: this.move.x, y: this.move.y };
  }

  /** Unit aim direction while the right stick is held, else null. */
  aimVector() {
    if (!this.aim.active) return null;
    const l = Math.hypot(this.aim.x, this.aim.y);
    if (l < 0.001) return null;
    return { x: this.aim.x / l, y: this.aim.y / l };
  }

  get firing() { return this.aim.active && Math.hypot(this.aim.x, this.aim.y) > 0.2; }

  isDown(a) { return this.down.has(a); }
  isPressed(a) { return this.pressed.has(a); }
  isReleased(a) { return this.released.has(a); }

  takeTap() { const t = this.tap; this.tap = null; return t; }

  setToggle(action, on) {
    const b = this.buttons.find(x => x.action === action);
    if (b) b.on = on;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.tap = null;
    for (const b of this.buttons) if (b.flash) b.flash = Math.max(0, b.flash - 0.12);
  }

  // --- drawing -------------------------------------------------------------
  draw(r, game) {
    if (!this.visible) return;
    const ctx = r.ctx;
    const prev = ctx.globalAlpha;

    if (!this.uiMode) {
      for (const b of this.buttons) {
        if (this.hidden.has(b.action)) continue;
        const held = this.down.has(b.action) || b.on;
        const a = held ? 0.85 : 0.34 + (b.flash || 0) * 0.4;
        ctx.globalAlpha = a;
        ctx.fillStyle = held ? b.tint : 'rgba(9,16,13,0.9)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = Math.min(1, a + 0.3);
        ctx.strokeStyle = b.tint; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        drawText(ctx, b.label, b.x, b.y - 3, held ? '#0d1512' : b.tint, { align: 'center' });
      }
    }

    ctx.globalAlpha = 1;
    this._drawStick(r, this.move, '#8ac47a');
    this._drawStick(r, this.aim, '#ff8a5a');
    ctx.globalAlpha = prev;
  }

  _drawStick(r, st, color) {
    if (!st.active) return;
    const ctx = r.ctx;
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(st.ox, st.oy, this.stickR, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(st.kx, st.ky, this.knobR, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Best-effort fullscreen; iPad Safari supports it, iPhone Safari does not. */
export function toggleFullscreen(el) {
  const doc = document;
  const isFs = doc.fullscreenElement || doc.webkitFullscreenElement;
  try {
    if (isFs) {
      (doc.exitFullscreen || doc.webkitExitFullscreen || (() => {})).call(doc);
      return false;
    }
    const target = el || doc.documentElement;
    const req = target.requestFullscreen || target.webkitRequestFullscreen || target.webkitEnterFullscreen;
    if (req) { req.call(target); return true; }
  } catch (e) { /* Safari throws on unsupported surfaces; nothing to do */ }
  return false;
}
