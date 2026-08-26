// Fixed-timestep game loop with an accumulator. Gameplay always steps at a
// constant 1/60s so bullet patterns, wave timers and physics are deterministic
// regardless of monitor refresh rate; rendering happens once per animation frame.

const STEP = 1 / 60;
const MAX_FRAME = 0.25;   // never simulate more than a quarter second at once

export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.timeScale = 1;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this.elapsed = 0;
    this._raf = null;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now() / 1000;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _tick(nowMs) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    const now = nowMs / 1000;
    let frame = now - this.last;
    this.last = now;
    if (frame > MAX_FRAME) frame = MAX_FRAME;

    this._fpsAcc += frame;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0; this._fpsFrames = 0;
    }

    this.acc += frame * this.timeScale;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.update(STEP);
      this.elapsed += STEP;
      this.acc -= STEP;
      steps++;
    }
    // If we blew the step budget (tab was backgrounded, heavy GC) drop the
    // backlog rather than spiral-of-death'ing.
    if (steps >= 5) this.acc = 0;

    this.render(frame, this.acc / STEP);
  }
}

export { STEP };
