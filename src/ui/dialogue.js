// Speech. Everything an NPC says appears in a bubble over their head in world
// space, typed out character by character, so conversations never take the
// camera away from the fight going on behind them.

import { drawText, measure, wrapText, LINE_H } from '../engine/font.js';
import { P } from '../art/palette.js';
import { VIEW_W, VIEW_H } from '../engine/canvas.js';
import { clamp } from '../engine/math.js';
import { audio } from '../engine/audio.js';

const MAX_W = 168;

/**
 * One speech bubble, drawn in screen space over a world position.
 *
 * Everything that talks in this game uses this: neighbours in the basin, Dax
 * through the glass, Vane from the chair. A bar of text pinned to the bottom
 * of the screen tells you somebody is speaking; a bubble with a tail tells you
 * *who*, which matters a great deal in a room with three of them in it.
 */
export function speechBubble(r, game, o) {
  const ctx = r.ctx;
  const cam = r.camera;
  const lines = o.lines;
  const alpha = o.alpha == null ? 1 : o.alpha;
  const accent = o.color || P.uiBorder;
  const small = !!o.small;

  let w = 0;
  for (const l of lines) w = Math.max(w, measure(l, 1));
  w = Math.min(o.maxW || MAX_W, w);
  const padX = 5, padY = 4;
  const bw = w + padX * 2;

  // The box grows with the text rather than opening at its final height and
  // waiting to be filled. Width is fixed to the longest line so it only ever
  // grows downward — a bubble that also changes width mid-sentence twitches.
  const budget = o.chars == null ? Infinity : o.chars;
  let shown = 0, counted = 0;
  for (const l of lines) {
    if (counted >= budget) break;
    shown++;
    counted += l.length + 1;
  }
  shown = Math.max(1, shown);
  const bh = shown * LINE_H + padY * 2 + (o.accept ? LINE_H : 0);

  const anchorX = o.x - cam.ox;
  const anchorY = o.y - cam.oy;
  let bx = Math.round(anchorX - bw / 2);
  let by = Math.round(anchorY - bh - 6);
  // If the speaker is near the top of the screen the bubble flips under them,
  // so it never gets shoved off and pointed at nothing.
  const below = by < 20;
  if (below) by = Math.round(anchorY + 8);
  bx = clamp(bx, 4, VIEW_W - bw - 4);
  by = clamp(by, 16, VIEW_H - bh - 26);

  ctx.globalAlpha = alpha;
  const fill = small ? 'rgba(9,16,13,0.80)' : 'rgba(9,16,13,0.94)';
  r.uiRect(bx, by, bw, bh, fill);
  r.uiStroke(bx, by, bw, bh, small ? '#2c4230' : accent);
  // a lit top edge, so the bubble has a light source like everything else
  r.uiRect(bx + 1, by, bw - 2, 1, small ? '#2c4230' : accent);

  // the tail, pointing at whoever is talking
  const tx = clamp(Math.round(anchorX), bx + 5, bx + bw - 6);
  if (below) {
    r.uiRect(tx - 2, by - 2, 4, 2, fill);
    r.uiRect(tx - 1, by - 4, 2, 2, fill);
    r.uiRect(tx - 2, by - 3, 1, 1, accent);
    r.uiRect(tx + 1, by - 3, 1, 1, accent);
  } else {
    r.uiRect(tx - 2, by + bh, 4, 2, fill);
    r.uiRect(tx - 1, by + bh + 2, 2, 2, fill);
    r.uiRect(tx - 2, by + bh + 1, 1, 1, accent);
    r.uiRect(tx + 1, by + bh + 1, 1, 1, accent);
  }

  // the name tag sits on the bubble's shoulder
  if (o.name) {
    const nameW = measure(o.name, 1);
    const nx = clamp(bx + 3, 2, VIEW_W - nameW - 8);
    r.uiRect(nx, by - 8, nameW + 6, 9, accent);
    drawText(ctx, o.name, nx + 3, by - 7, P.uiDark, { scale: 1 });
  }

  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    const remain = budget - used;
    if (remain <= 0) break;
    drawText(ctx, lines[i].slice(0, Math.max(0, remain)), bx + padX, by + padY + i * LINE_H,
      small ? P.uiDim : (o.textColor || P.ui), { scale: 1 });
    used += lines[i].length + 1;
  }

  if (o.accept && budget >= lines.join(' ').length - 1) {
    const blink = Math.floor(game.time * 3) % 2 === 0;
    drawText(ctx, blink ? '[E] ACCEPT' : ' [E] ACCEPT', bx + padX, by + padY + lines.length * LINE_H, P.favor);
  }
  if (o.more) {
    const blink = Math.floor(game.time * 3) % 2 === 0;
    drawText(ctx, 'E', bx + bw - 5, by + bh - 9, blink ? accent : P.uiDim, { align: 'right' });
  }
  ctx.globalAlpha = 1;
  return { bx, by, bw, bh };
}

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
    speechBubble(r, game, {
      x: npc.x, y: npc.y - (npc.h || 20) - 4,
      lines, chars: charBudget, alpha, accept: showAccept, small,
      name: small ? null : npc.name,
    });
  }

}
