// Keyboard + mouse + gamepad input. Exposes edge-triggered "pressed" queries so
// gameplay code never has to track previous frames itself.

import { TouchControls, isTouchDevice } from './touch.js';

const KEYMAP = {
  up:      ['KeyW', 'ArrowUp'],
  down:    ['KeyS', 'ArrowDown'],
  left:    ['KeyA', 'ArrowLeft'],
  right:   ['KeyD', 'ArrowRight'],
  interact:['KeyE'],
  dash:    ['Space'],
  focus:   ['ShiftLeft', 'ShiftRight'],
  scan:    ['KeyQ'],
  craft:   ['Tab'],
  chips:   ['KeyC'],
  map:     ['KeyM'],
  douse:   ['KeyR'],
  pause:   ['Escape', 'KeyP'],
  use:     ['KeyF'],
  smoke:   ['KeyG'],
  melee:   ['KeyX'],
  command: ['KeyT'],
  rally:   ['KeyY'],
  hold:    ['KeyH'],
  weapon:  ['KeyB'],
  fullscreen: ['F11'],
  slot1:   ['Digit1'],
  slot2:   ['Digit2'],
  slot3:   ['Digit3'],
  slot4:   ['Digit4'],
  slot5:   ['Digit5'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0, down: false, pressed: false, released: false, rdown: false, rpressed: false };
    this.wheel = 0;
    this.anyKeyPressed = false;
    this.touch = new TouchControls(canvas);
    this.usingTouch = isTouchDevice();
    this._bind();
  }

  _bind() {
    const consumed = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    window.addEventListener('keydown', (e) => {
      if (consumed.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      this.anyKeyPressed = true;
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.down = false; this.mouse.rdown = false; });

    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousemove', (e) => this._movePointer(e.clientX, e.clientY));
    cv.addEventListener('mousedown', (e) => {
      this._movePointer(e.clientX, e.clientY);
      if (e.button === 0) { this.mouse.down = true; this.mouse.pressed = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.mouse.rpressed = true; }
      this.anyKeyPressed = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouse.down = false; this.mouse.released = true; }
      if (e.button === 2) this.mouse.rdown = false;
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });

    // Touch is handled by TouchControls, which owns the pointer events and
    // feeds results back through the same action queries used below.
  }

  _movePointer(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.sx = ((clientX - r.left) / r.width) * this.canvas.width;
    this.mouse.sy = ((clientY - r.top) / r.height) * this.canvas.height;
  }

  // --- queries -------------------------------------------------------------
  isDown(action) {
    if (this.touch.isDown(action)) return true;
    const keys = KEYMAP[action];
    if (!keys) return false;
    for (const k of keys) if (this.down.has(k)) return true;
    return false;
  }
  isPressed(action) {
    if (this.touch.isPressed(action)) return true;
    const keys = KEYMAP[action];
    if (!keys) return false;
    for (const k of keys) if (this.pressed.has(k)) return true;
    return false;
  }
  isReleased(action) {
    if (this.touch.isReleased(action)) return true;
    const keys = KEYMAP[action];
    if (!keys) return false;
    for (const k of keys) if (this.released.has(k)) return true;
    return false;
  }

  /** Unit aim direction when a stick is driving, else null (mouse aiming). */
  aimVector() { return this.touch.aimVector(); }

  /** True when the player is asking to shoot, by mouse or by right stick. */
  get firing() { return this.mouse.down || this.touch.firing; }

  /** A screen-space tap that menus and panels can consume. */
  takeTap() {
    if (this.mouse.pressed) return { x: this.mouse.sx, y: this.mouse.sy };
    return this.touch.takeTap();
  }
  key(code) { return this.down.has(code); }
  keyPressed(code) { return this.pressed.has(code); }

  // Normalised movement axes with proper diagonal handling.
  axes() {
    let x = 0, y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('up')) y -= 1;
    if (this.isDown('down')) y += 1;
    const gp = this._gamepadAxes();
    if (gp) { x += gp.x; y += gp.y; }
    const t = this.touch.axes();
    if (t) { x += t.x; y += t.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, len: Math.min(len, 1) };
  }

  _gamepadAxes() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (!p) continue;
      const dx = p.axes[0] || 0, dy = p.axes[1] || 0;
      if (Math.hypot(dx, dy) > 0.22) return { x: dx, y: dy };
      return null;
    }
    return null;
  }

  // Called once at the very end of each frame.
  endFrame() {
    this.touch.endFrame();
    this.pressed.clear();
    this.released.clear();
    this.mouse.pressed = false;
    this.mouse.released = false;
    this.mouse.rpressed = false;
    this.wheel = 0;
    this.anyKeyPressed = false;
  }
}
