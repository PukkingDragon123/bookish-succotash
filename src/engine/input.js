// Keyboard + mouse + gamepad input. Exposes edge-triggered "pressed" queries so
// gameplay code never has to track previous frames itself.

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

    // Touch: drag anywhere to aim + fire. Good enough to poke at on a tablet.
    cv.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._movePointer(t.clientX, t.clientY);
      this.mouse.down = true; this.mouse.pressed = true; this.anyKeyPressed = true;
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchmove', (e) => {
      const t = e.changedTouches[0];
      this._movePointer(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchend', (e) => { this.mouse.down = false; this.mouse.released = true; e.preventDefault(); }, { passive: false });
  }

  _movePointer(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.sx = ((clientX - r.left) / r.width) * this.canvas.width;
    this.mouse.sy = ((clientY - r.top) / r.height) * this.canvas.height;
  }

  // --- queries -------------------------------------------------------------
  isDown(action) {
    const keys = KEYMAP[action];
    if (!keys) return false;
    for (const k of keys) if (this.down.has(k)) return true;
    return false;
  }
  isPressed(action) {
    const keys = KEYMAP[action];
    if (!keys) return false;
    for (const k of keys) if (this.pressed.has(k)) return true;
    return false;
  }
  isReleased(action) {
    const keys = KEYMAP[action];
    if (!keys) return false;
    for (const k of keys) if (this.released.has(k)) return true;
    return false;
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
    this.pressed.clear();
    this.released.clear();
    this.mouse.pressed = false;
    this.mouse.released = false;
    this.mouse.rpressed = false;
    this.wheel = 0;
    this.anyKeyPressed = false;
  }
}
