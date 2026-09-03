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

/**
 * Button glyphs, drawn rather than lettered.
 *
 * A three-letter label works on a desk. On a phone, under a thumb, at a glance,
 * during a firefight, it does not: you need a shape you can recognise without
 * reading it. Each of these draws into a circle of radius `r` centred on
 * (x, y), in a single colour, so the button can tint the whole icon by state.
 */
const BUTTON_ICONS = {
  // a paw print: move, gather, the general "do the thing" button
  interact(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    const p = r * 0.34;
    ell2(ctx, x, y + p * 0.5, p * 0.95, p * 0.8);
    for (let i = 0; i < 4; i++) {
      const a = -2.5 + i * 0.62;
      ell2(ctx, x + Math.cos(a) * p * 1.25, y + Math.sin(a) * p * 1.25 - p * 0.2, p * 0.42, p * 0.5);
    }
  },
  // a claw slash: three raking lines
  melee(ctx, x, y, r, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = Math.max(1, r * 0.14);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5 + i * r * 0.26, y - r * 0.52);
      ctx.quadraticCurveTo(x + i * r * 0.24, y, x + r * 0.42 + i * r * 0.24, y + r * 0.54);
      ctx.stroke();
    }
  },
  // motion lines behind a chevron: dash
  dash(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    tri2(ctx, x - r * 0.1, y - r * 0.52, x - r * 0.1, y + r * 0.52, x + r * 0.56, y);
    ctx.fillRect(Math.round(x - r * 0.62), Math.round(y - r * 0.34), Math.max(1, r * 0.26), Math.max(1, r * 0.16));
    ctx.fillRect(Math.round(x - r * 0.72), Math.round(y - r * 0.08), Math.max(1, r * 0.34), Math.max(1, r * 0.16));
    ctx.fillRect(Math.round(x - r * 0.62), Math.round(y + r * 0.18), Math.max(1, r * 0.26), Math.max(1, r * 0.16));
  },
  // a pulsing eye: the lab optic
  scan(ctx, x, y, r, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = Math.max(1, r * 0.13);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.56, r * 0.34, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = c;
    ell2(ctx, x, y, r * 0.2, r * 0.2);
  },
  // a droplet
  douse(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    tri2(ctx, x, y - r * 0.6, x - r * 0.4, y + r * 0.16, x + r * 0.4, y + r * 0.16);
    ell2(ctx, x, y + r * 0.16, r * 0.4, r * 0.4);
  },
  // a berry on a stem: eat
  use(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ell2(ctx, x - r * 0.2, y + r * 0.14, r * 0.3, r * 0.3);
    ell2(ctx, x + r * 0.24, y + r * 0.2, r * 0.26, r * 0.26);
    ctx.strokeStyle = c;
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.1, y - r * 0.1);
    ctx.lineTo(x + r * 0.16, y - r * 0.54);
    ctx.stroke();
  },
  // a puff
  smoke(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ell2(ctx, x - r * 0.26, y + r * 0.1, r * 0.3, r * 0.26);
    ell2(ctx, x + r * 0.2, y + r * 0.16, r * 0.26, r * 0.22);
    ell2(ctx, x, y - r * 0.22, r * 0.34, r * 0.3);
  },
  // a stubby gun
  weapon(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x - r * 0.56), Math.round(y - r * 0.16), Math.round(r * 1.1), Math.max(1, r * 0.3));
    ctx.fillRect(Math.round(x - r * 0.42), Math.round(y + r * 0.1), Math.max(1, r * 0.24), Math.max(1, r * 0.44));
    ctx.fillRect(Math.round(x + r * 0.34), Math.round(y - r * 0.34), Math.max(1, r * 0.2), Math.max(1, r * 0.2));
  },
  // a flame: overclock burns you for power
  overclock(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.62);
    ctx.quadraticCurveTo(x + r * 0.52, y - r * 0.05, x + r * 0.26, y + r * 0.3);
    ctx.quadraticCurveTo(x + r * 0.1, y + r * 0.58, x - r * 0.06, y + r * 0.56);
    ctx.quadraticCurveTo(x - r * 0.48, y + r * 0.3, x - r * 0.22, y - r * 0.16);
    ctx.quadraticCurveTo(x - r * 0.14, y - r * 0.36, x, y - r * 0.62);
    ctx.fill();
  },
  // a hammer and a plank: crafting
  craft(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x - r * 0.5), Math.round(y - r * 0.5), Math.round(r * 0.62), Math.max(1, r * 0.3));
    ctx.fillRect(Math.round(x - r * 0.28), Math.round(y - r * 0.24), Math.max(1, r * 0.2), Math.round(r * 0.72));
    ctx.fillRect(Math.round(x - r * 0.56), Math.round(y + r * 0.42), Math.round(r * 1.12), Math.max(1, r * 0.2));
  },
  // a chip: four legs and a die
  chips(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x - r * 0.34), Math.round(y - r * 0.34), Math.round(r * 0.68), Math.round(r * 0.68));
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(Math.round(x + i * r * 0.24 - r * 0.05), Math.round(y - r * 0.56), Math.max(1, r * 0.12), Math.max(1, r * 0.2));
      ctx.fillRect(Math.round(x + i * r * 0.24 - r * 0.05), Math.round(y + r * 0.36), Math.max(1, r * 0.12), Math.max(1, r * 0.2));
    }
  },
  // a folded map
  map(ctx, x, y, r, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = Math.max(1, r * 0.13);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.54, y - r * 0.3);
    ctx.lineTo(x - r * 0.18, y - r * 0.5);
    ctx.lineTo(x + r * 0.18, y - r * 0.3);
    ctx.lineTo(x + r * 0.54, y - r * 0.5);
    ctx.lineTo(x + r * 0.54, y + r * 0.36);
    ctx.lineTo(x + r * 0.18, y + r * 0.54);
    ctx.lineTo(x - r * 0.18, y + r * 0.36);
    ctx.lineTo(x - r * 0.54, y + r * 0.54);
    ctx.closePath();
    ctx.stroke();
  },
  // three dots in formation: squad command
  command(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ell2(ctx, x, y - r * 0.34, r * 0.19, r * 0.19);
    ell2(ctx, x - r * 0.38, y + r * 0.26, r * 0.19, r * 0.19);
    ell2(ctx, x + r * 0.38, y + r * 0.26, r * 0.19, r * 0.19);
    ctx.strokeStyle = c;
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.34); ctx.lineTo(x - r * 0.38, y + r * 0.26);
    ctx.lineTo(x + r * 0.38, y + r * 0.26); ctx.closePath();
    ctx.stroke();
  },
  // an arrow curling home: rally
  rally(ctx, x, y, r, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.08, r * 0.42, Math.PI * 0.15, Math.PI * 1.7);
    ctx.stroke();
    ctx.fillStyle = c;
    tri2(ctx, x + r * 0.5, y - r * 0.34, x + r * 0.12, y - r * 0.28, x + r * 0.44, y + r * 0.08);
  },
  // pause bars
  pause(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x - r * 0.34), Math.round(y - r * 0.42), Math.max(1, r * 0.22), Math.round(r * 0.84));
    ctx.fillRect(Math.round(x + r * 0.12), Math.round(y - r * 0.42), Math.max(1, r * 0.22), Math.round(r * 0.84));
  },
  // four corner brackets: fullscreen
  fullscreen(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    const t = Math.max(1, r * 0.16), l = r * 0.42, o = r * 0.48;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.fillRect(Math.round(x + sx * o - (sx > 0 ? l : 0)), Math.round(y + sy * o - (sy > 0 ? t : 0)), Math.round(l), Math.round(t));
        ctx.fillRect(Math.round(x + sx * o - (sx > 0 ? t : 0)), Math.round(y + sy * o - (sy > 0 ? l : 0)), Math.round(t), Math.round(l));
      }
    }
  },
};

// tiny local helpers, so the icon table stays readable
function ell2(ctx, cx, cy, rx, ry) {
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU); ctx.fill();
}
function tri2(ctx, x0, y0, x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill();
}

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
    // Buttons are sized in real screen pixels, not internal ones. A thumb is
    // about 44 CSS pixels across whatever resolution the game happens to be
    // rendering at, and a control that is the right size on an iPad and half
    // that on a phone is a control that only works on an iPad.
    const rect = this.canvas.getBoundingClientRect();
    const disp = rect.width > 0 ? rect.width / Math.max(1, this.canvas.width) : 1;
    const s = this.scale = clamp((1 / disp) * 2.15, 0.9, 4.2);

    const W = VIEW_W, H = VIEW_H;
    const bigR = Math.round(17 * s), midR = Math.round(13.5 * s), smallR = Math.round(10.5 * s);
    const gap = Math.round(5 * s);
    // Everything is placed off its own radius, so the margins hold at every
    // scale instead of the cluster sliding off the corner on a dense screen.
    const rightX = W - bigR - gap;
    const bottomY = H - bigR - gap;

    this.buttons = [
      // right thumb: the things you press in a fight
      { action: 'dash',     label: 'DSH', x: rightX, y: bottomY, r: bigR, tint: '#4de1ff' },
      { action: 'melee',    label: 'CLW', x: rightX - bigR - midR - gap, y: bottomY + Math.round(2 * s), r: midR, tint: '#ff8a5a' },
      { action: 'interact', label: 'E',   x: rightX + Math.round(2 * s), y: bottomY - bigR - midR - gap, r: midR, tint: '#8ac47a' },
      { action: 'overclock', label: 'OC', x: rightX - bigR - smallR - gap * 2, y: bottomY - midR - smallR - gap, r: smallR, tint: '#b8f5ff', toggle: true },

      // utility column up the right edge
      { action: 'scan',  label: 'Q',   x: W - smallR - gap, y: bottomY - bigR - midR * 2 - smallR - gap * 3, r: smallR, tint: '#4de1ff' },
      { action: 'douse', label: 'H2O', x: W - smallR - gap, y: bottomY - bigR - midR * 2 - smallR * 3 - gap * 4, r: smallR, tint: '#a7d8e6' },
      { action: 'use',   label: 'EAT', x: W - smallR - gap, y: bottomY - bigR - midR * 2 - smallR * 5 - gap * 5, r: smallR, tint: '#7fd48a' },
      { action: 'smoke', label: 'SMK', x: W - smallR - gap, y: bottomY - bigR - midR * 2 - smallR * 7 - gap * 6, r: smallR, tint: '#8a9483' },

      // left edge: weapon and squad, away from the movement thumb
      { action: 'weapon',  label: 'GUN', x: midR + gap, y: bottomY, r: midR, tint: '#e8d7b0' },
      { action: 'command', label: 'CMD', x: smallR + gap, y: bottomY - midR - smallR - gap, r: smallR, tint: '#f0c05a', toggle: true },
      { action: 'rally',   label: 'RLY', x: smallR + gap, y: bottomY - midR - smallR * 3 - gap * 2, r: smallR, tint: '#f0c05a' },

      // top-right row: menus, out of the way of both thumbs
      { action: 'craft',      label: 'CRF', x: W - smallR - gap, y: smallR + gap, r: smallR, tint: '#e8d7b0' },
      { action: 'bag',        label: 'BAG', x: W - smallR * 3 - gap * 2, y: smallR + gap, r: smallR, tint: '#c9a23c' },
      { action: 'chips',      label: 'CHP', x: W - smallR * 5 - gap * 3, y: smallR + gap, r: smallR, tint: '#4de1ff' },
      { action: 'map',        label: 'MAP', x: W - smallR * 7 - gap * 4, y: smallR + gap, r: smallR, tint: '#8ac47a' },
      { action: 'pause',      label: '||',  x: W - smallR * 9 - gap * 5, y: smallR + gap, r: smallR, tint: '#8a9483' },
      { action: 'fullscreen', label: 'FS',  x: W - smallR * 11 - gap * 6, y: smallR + gap, r: smallR, tint: '#8a9483' },
    ];
    this.stickR = Math.round(STICK_R * s * 0.8);
    this.knobR = Math.round(KNOB_R * s * 0.8);
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
        const flash = b.flash || 0;
        const base = held ? 0.92 : 0.4 + flash * 0.35;

        // A dark well with a lit rim, so the button reads against grass, snow,
        // water and fire without a solid plate blocking the view underneath.
        ctx.globalAlpha = held ? 0.92 : 0.5;
        ctx.fillStyle = 'rgba(6,12,11,0.86)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();

        // pressed state fills with the button's own colour
        if (held) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = b.tint;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1, 0, TAU); ctx.fill();
        }

        // rim: two rings, the outer one softer, which reads as depth
        ctx.globalAlpha = held ? 1 : 0.75;
        ctx.strokeStyle = b.tint; ctx.lineWidth = held ? 2 : 1.4;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1.5, 0, TAU); ctx.stroke();

        // a toggle that is on gets a filled pip on the rim
        if (b.toggle && b.on) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = b.tint;
          ell2(ctx, b.x, b.y - b.r, 1.6, 1.6);
        }

        // the icon itself
        ctx.globalAlpha = held ? 1 : 0.9;
        const icon = BUTTON_ICONS[b.action];
        if (icon) icon(ctx, b.x, b.y, b.r * 0.78, held ? '#0d1512' : b.tint);
        else drawText(ctx, b.label, b.x, b.y - 3, held ? '#0d1512' : b.tint, { align: 'center' });
        ctx.globalAlpha = 1;
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
