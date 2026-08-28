// A small timeline player for interactive cutscenes. A cutscene is an array of
// beats; each beat runs until its condition clears, then the next one starts.
// Beats can move the camera, put words on the screen, spill blood, or hand
// control back for a moment and demand you do something.

import { drawText, measure, wrapText, LINE_H } from '../engine/font.js';
import { P } from '../art/palette.js';
import { clamp } from '../engine/math.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { VIEW_W, VIEW_H } from '../engine/canvas.js';
import { speechBubble } from '../ui/dialogue.js';

export class Cutscene {
  constructor(beats, opts = {}) {
    this.beats = beats;
    this.i = 0;
    this.t = 0;
    this.done = false;
    this.letterbox = opts.letterbox == null ? 1 : opts.letterbox;
    this.letterboxNow = 0;
    this.fade = 0;
    this.fadeColor = '#000';
    this.line = null;         // { who, text, chars, color }
    this.prompt = null;       // { label, kind, need, have }
    this.skippable = opts.skippable !== false;
    this.onDone = opts.onDone || null;
    this.camTarget = null;
    this.camHold = null;      // actor the camera is following
    this.enteredI = -1;       // last beat whose enter() has run
    this.game = null;
    // Given a speaker name, return { x, y } in world space — or nothing, for
    // narration, which has no mouth and belongs at the bottom of the screen.
    this.speakerAt = opts.speakerAt || null;
  }

  get beat() { return this.beats[this.i]; }

  say(who, text, color) {
    this.line = { who, text, chars: 0, color: color || P.ui, lines: wrapText(text, Math.min(200, VIEW_W - 60)) };
  }

  advance() {
    this.i++;
    this.t = 0;
    this.prompt = null;
    // enter() is fired from update(), once per beat. Firing it here as well
    // ran every do-beat twice, which is fine for a camera move and very much
    // not fine for anything that spawns something.
    if (this.i >= this.beats.length) {
      this.done = true;
      if (this.onDone) this.onDone();
    }
  }

  update(dt, game) {
    if (this.done) return;
    this.game = game;
    this.letterboxNow += ((this.letterbox ? 1 : 0) - this.letterboxNow) * Math.min(1, dt * 5);

    if (this.line) {
      this.line.chars = Math.min(this.line.text.length, this.line.chars + dt * 46);
      if (Math.floor(this.line.chars) % 3 === 0 && this.line.chars < this.line.text.length) {
        audio.play('talk', { vol: 0.4, pitch: this.line.pitch || 1 });
      }
    }

    const b = this.beat;
    if (!b) { this.done = true; return; }
    if (this.enteredI !== this.i) {
      this.enteredI = this.i;
      if (b.enter) b.enter(this, game);
    }
    this.t += dt;

    if (b.tick) b.tick(this, game, dt);

    // camera
    if (b.cam) {
      const target = typeof b.cam === 'function' ? b.cam(game) : b.cam;
      if (target) {
        game.r.camera.follow(target.x, target.y);
      }
    }

    // QTE beats hand input back for a moment
    if (b.mash) {
      if (!this.prompt) this.prompt = { label: b.label || 'MASH', kind: 'mash', need: b.mash, have: 0 };
      const pressed = game.input.isPressed(b.action || 'interact') ||
        (game.input.takeTap() && game.input.touch.visible);
      if (pressed) {
        this.prompt.have++;
        if (b.onHit) b.onHit(this, game, this.prompt.have);
        audio.play('hit', { vol: 0.6 });
        game.r.camera.addShake(1.6);
      }
      if (this.prompt.have >= this.prompt.need) {
        if (b.onDone) b.onDone(this, game);
        this.advance();
      }
      return;
    }

    if (b.hold) {
      if (!this.prompt) this.prompt = { label: b.label || 'HOLD', kind: 'hold', need: b.hold, have: 0 };
      if (game.input.isDown(b.action || 'interact') || game.input.touch.isDown(b.action || 'interact')) {
        this.prompt.have += dt;
      } else {
        this.prompt.have = Math.max(0, this.prompt.have - dt * 0.6);
      }
      if (this.prompt.have >= this.prompt.need) {
        if (b.onDone) b.onDone(this, game);
        this.advance();
      }
      return;
    }

    if (b.until) {
      // Every wait has a way out. A story that can deadlock is a story that
      // will deadlock, on someone's tablet, at the worst moment.
      if (b.until(game, this) || this.t > (b.maxT == null ? 25 : b.maxT)) this.advance();
      return;
    }

    const dur = b.dur == null ? 0 : b.dur;
    // A line of dialogue never gets cut off before it is readable.
    const textReady = !this.line || this.line.chars >= this.line.text.length;
    if (this.t >= dur && (dur > 0 ? true : textReady)) {
      if (this.t >= dur && (textReady || this.t > dur + 3)) this.advance();
    }
  }

  /**
   * A tap does the obvious thing: finish the line if it is still typing,
   * otherwise move on to the next beat.
   *
   * Never skips a beat that is waiting on the player — a mash, a hold, or a
   * condition — because those are the scene handing control back, and pressing
   * the button is how you play them, not how you leave them.
   */
  skip() {
    const b = this.beat;
    if (!b) return false;
    if (this.line && this.line.chars < this.line.text.length) {
      this.line.chars = this.line.text.length;
      return true;
    }
    if (b.mash || b.hold || b.until) return false;
    if (this.t < 0.12) return false;         // no double-taps eating two beats
    this.advance();
    return true;
  }

  /** Kept for callers that only want the typewriter finished. */
  skipLine() {
    if (this.line && this.line.chars < this.line.text.length) {
      this.line.chars = this.line.text.length;
      return true;
    }
    return false;
  }

  draw(r, game) {
    if (this.done) return;
    const ctx = r.ctx;
    const bar = Math.round(VIEW_H * 0.11 * this.letterboxNow);
    if (bar > 0) {
      r.uiRect(0, 0, VIEW_W, bar, '#000');
      r.uiRect(0, VIEW_H - bar, VIEW_W, bar, '#000');
    }

    if (this.line) {
      // Somebody speaking gets a bubble over their head; narration — the
      // voice with no mouth — stays in a plate at the bottom of the frame.
      const at = this.line.who && this.speakerAt ? this.speakerAt(this.line.who, game) : null;
      const done = this.line.chars >= this.line.text.length;

      if (at && r.camera.visible(at.x, at.y, 140)) {
        speechBubble(r, game, {
          x: at.x, y: at.y - (at.h || 22),
          lines: this.line.lines,
          chars: Math.floor(this.line.chars),
          name: this.line.who,
          color: this.line.color,
          more: done,
          maxW: Math.min(210, VIEW_W - 60),
        });
      } else {
        const boxH = Math.max(24, this.line.lines.length * LINE_H + 14);
        const by = VIEW_H - bar - boxH - 4;
        r.panel(12, by, VIEW_W - 24, boxH, 'rgba(6,10,10,0.92)', this.line.color);
        if (this.line.who) {
          const nw = measure(this.line.who, 1) + 6;
          r.uiRect(15, by - 8, nw, 9, this.line.color);
          drawText(ctx, this.line.who, 18, by - 7, '#0d1512');
        }
        if (done) {
          drawText(ctx, 'E', VIEW_W - 18, by + boxH - 9,
            Math.floor(game.time * 3) % 2 ? P.uiDim : P.uiAccent, { align: 'right' });
        }
        let used = 0;
        for (let i = 0; i < this.line.lines.length; i++) {
          const remain = Math.floor(this.line.chars) - used;
          if (remain <= 0) break;
          drawText(ctx, this.line.lines[i].slice(0, remain), 18, by + 7 + i * LINE_H, P.ui);
          used += this.line.lines[i].length + 1;
        }
      }
    }

    if (this.prompt) {
      const cx = VIEW_W / 2;
      const y = VIEW_H / 2 + 26;
      const pulse = 0.6 + Math.sin(game.time * 12) * 0.4;
      if (this.prompt.kind === 'mash') {
        drawText(ctx, this.prompt.label, cx, y, P.uiWarn, { align: 'center', scale: 2, shadow: '#000' });
        const w = 90, f = clamp(this.prompt.have / this.prompt.need, 0, 1);
        r.uiRect(cx - w / 2, y + 18, w, 5, 'rgba(0,0,0,0.7)');
        r.uiRect(cx - w / 2, y + 18, w * f, 5, P.uiWarn);
      } else {
        ctx.globalAlpha = pulse;
        drawText(ctx, this.prompt.label, cx, y, P.cyber, { align: 'center', scale: 2, shadow: '#000' });
        ctx.globalAlpha = 1;
        const w = 90, f = clamp(this.prompt.have / this.prompt.need, 0, 1);
        r.uiRect(cx - w / 2, y + 18, w, 5, 'rgba(0,0,0,0.7)');
        r.uiRect(cx - w / 2, y + 18, w * f, 5, P.cyber);
      }
    }

    if (this.fade > 0) r.flash(this.fadeColor, this.fade);
  }
}

// --- beat helpers ----------------------------------------------------------
export const beat = {
  wait: (dur) => ({ dur }),
  say: (who, text, dur = 3, color) => ({
    dur,
    enter(cs) { cs.say(who, text, color); },
  }),
  clearLine: () => ({ dur: 0, enter(cs) { cs.line = null; } }),
  do: (fn) => ({ dur: 0, enter(cs, game) { fn(game, cs); } }),
  cam: (getter, dur = 1) => ({ dur, cam: getter }),
  mash: (n, label, action, onHit, onDone) => ({ mash: n, label, action, onHit, onDone }),
  hold: (sec, label, action, onDone) => ({ hold: sec, label, action, onDone }),
  until: (fn, maxT = 25, tick) => ({ until: fn, maxT, tick }),
  fade: (to, dur, color = '#000') => ({
    dur,
    enter(cs) { cs._from = cs.fade; cs._to = to; cs.fadeColor = color; },
    tick(cs, game, dt) { cs.fade = cs._from + (cs._to - cs._from) * clamp(cs.t / Math.max(0.01, dur), 0, 1); },
  }),
  blood: (getPos, n = 24) => ({
    dur: 0,
    enter(cs, game) {
      const p = getPos(game);
      particles.blood(p.x, p.y, n);
      particles.burst(p.x, p.y, n, { colors: ['#c04141', '#8e2a2a', '#5c1a1a'], speed: 140, life: 1.1, vz: 90, gravity: 320, bounce: 0.2 });
    },
  }),
  shake: (n) => ({ dur: 0, enter(cs, game) { game.r.camera.addShake(n); } }),
  sfx: (name, vol = 1) => ({ dur: 0, enter(cs, game) { audio.play(name, { vol }); } }),
};
