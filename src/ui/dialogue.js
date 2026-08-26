// Speech. Everything an NPC says appears in a bubble over their head in world
// space, typed out character by character, so conversations never take the
// camera away from the fight going on behind them.

import { drawText, measure, wrapText, LINE_H } from '../engine/font.js';
import { P } from '../art/palette.js';
import { clamp } from '../engine/math.js';
import { audio } from '../engine/audio.js';

const MAX_W = 168;

export class Dialogue {
  constructor() {
    this.active = null;      // { npc, text, life, maxLife, chars, lines, accept }
    this.floats = [];        // short ambient barks
  }

  show(npc, text, seconds = 3, opts = {}) {
    this.active = {
      npc, text,
      life: seconds, maxLife: seconds,
      chars: 0,
      lines: wrapText(text, MAX_W),
      accept: !!opts.accept,
      voice: npc && npc.data ? npc.data.voice : 1,
    };
  }

  showFloating(npc, text) {
    this.floats.push({ npc, text, life: 2.4, maxLife: 2.4 });
    if (this.floats.length > 4) this.floats.shift();
  }

  close() { this.active = null; }

  get isOpen() { return !!this.active; }
  get needsAccept() { return !!(this.active && this.active.accept); }

  update(dt) {
    const a = this.active;
    if (a) {
      const total = a.text.length;
      const prev = Math.floor(a.chars);
      a.chars = Math.min(total, a.chars + dt * 42);
      if (Math.floor(a.chars) > prev && Math.floor(a.chars) % 2 === 0) {
        audio.play('talk', { pitch: a.voice, vol: 0.5 });
      }
      a.life -= dt;
      if (a.life <= 0) this.active = null;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].life -= dt;
      if (this.floats[i].life <= 0) this.floats.splice(i, 1);
    }
  }

  /** Skip the typewriter, or dismiss if it's already complete. */
  advance() {
    const a = this.active;
    if (!a) return false;
    if (a.chars < a.text.length) { a.chars = a.text.length; return true; }
    return false;
  }

  draw(r, game) {
    for (const f of this.floats) this._bubble(r, game, f.npc, [f.text], f.text.length, clamp(f.life / 0.4, 0, 1), false, true);
    const a = this.active;
    if (!a || !a.npc) return;
    this._bubble(r, game, a.npc, a.lines, Math.floor(a.chars), clamp(a.life / 0.35, 0, 1), a.accept, false);
  }

  _bubble(r, game, npc, lines, charBudget, alpha, showAccept, small) {
    const ctx = r.ctx;
    const cam = r.camera;
    const scale = small ? 1 : 1;
    let w = 0;
    for (const l of lines) w = Math.max(w, measure(l, scale));
    w = Math.min(MAX_W, w);
    const padX = 5, padY = 4;
    const bw = w + padX * 2;
    const bh = lines.length * LINE_H + padY * 2 + (showAccept ? LINE_H : 0);

    const anchorX = npc.x - cam.ox;
    const anchorY = npc.y - (npc.h || 20) - 10 - cam.oy;
    let bx = Math.round(anchorX - bw / 2);
    let by = Math.round(anchorY - bh);
    bx = clamp(bx, 4, 480 - bw - 4);
    by = clamp(by, 22, 270 - bh - 40);

    ctx.globalAlpha = alpha;
    r.uiRect(bx, by, bw, bh, small ? 'rgba(9,16,13,0.78)' : 'rgba(9,16,13,0.93)');
    r.uiStroke(bx, by, bw, bh, small ? '#2c4230' : P.uiBorder);
    // tail
    const tx = clamp(Math.round(anchorX), bx + 5, bx + bw - 6);
    r.uiRect(tx - 2, by + bh, 4, 2, small ? 'rgba(9,16,13,0.78)' : 'rgba(9,16,13,0.93)');
    r.uiRect(tx - 1, by + bh + 2, 2, 2, small ? 'rgba(9,16,13,0.78)' : 'rgba(9,16,13,0.93)');

    if (!small) {
      const nameW = measure(npc.name, 1);
      r.uiRect(bx + 3, by - 8, nameW + 6, 9, P.uiBorder);
      drawText(ctx, npc.name, bx + 6, by - 7, P.uiDark, { scale: 1 });
    }

    let used = 0;
    for (let i = 0; i < lines.length; i++) {
      const remain = charBudget - used;
      if (remain <= 0) break;
      const line = lines[i].slice(0, Math.max(0, remain));
      used += lines[i].length + 1;
      drawText(ctx, line, bx + padX, by + padY + i * LINE_H, small ? P.uiDim : P.ui, { scale });
    }

    if (showAccept && charBudget >= lines.join(' ').length - 1) {
      const blink = Math.floor(game.time * 3) % 2 === 0;
      drawText(ctx, blink ? '[E] ACCEPT' : ' [E] ACCEPT', bx + padX, by + padY + lines.length * LINE_H, P.favor, { scale: 1 });
    }
    ctx.globalAlpha = 1;
  }
}
