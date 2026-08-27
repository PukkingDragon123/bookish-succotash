// Top-down army control. Everything that has bonded with you obeys the same
// four orders; the only question is which of them you are talking to.
//
// Command mode replaces your trigger with a reticle: click ground to send them,
// click a machine to send them at it. Everything else stays live while you do
// it — this is not a pause menu.

import { drawText } from '../engine/font.js';
import { P } from '../art/palette.js';
import { ROLE_COLOR } from '../art/beastiary.js';
import { clamp, TAU } from '../engine/math.js';
import { audio } from '../engine/audio.js';
import { VIEW_W, VIEW_H } from '../engine/canvas.js';

export const ROLE_ORDER = ['fighter', 'tank', 'scout', 'support', 'builder', 'flyer'];

export class Squad {
  constructor() {
    this.commandMode = false;
    this.filter = 'all';        // 'all' or a role name
    this.markers = [];          // transient order markers in the world
    this.rallyT = 0;            // temporary morale bonus from a bugle/whistle
    this.lastOrder = '';
    this.lastOrderT = 0;
    this._size = 0;
  }

  members(game) { return game.wildlife.bonded; }

  get size() { return this._size; }

  selected(game) {
    const all = this.members(game);
    if (this.filter === 'all') return all;
    return all.filter(a => a.def.role === this.filter);
  }

  selectedHas(a) { return this.filter === 'all' || a.def.role === this.filter; }

  update(dt, game) {
    const all = this.members(game);
    this._size = all.length;
    this.rallyT = Math.max(0, this.rallyT - dt);
    this.lastOrderT = Math.max(0, this.lastOrderT - dt);
    for (let i = this.markers.length - 1; i >= 0; i--) {
      this.markers[i].life -= dt;
      if (this.markers[i].life <= 0) this.markers.splice(i, 1);
    }
    for (const a of all) a.selected = this.commandMode && this.selectedHas(a);

    const input = game.input;
    if (game.uiBlocksInput) return;

    if (input.isPressed('command')) {
      if (all.length === 0) {
        game.toast('NOBODY FOLLOWS YOU YET  -  FEED THE WILDLIFE [E]', P.uiWarn, 3);
        audio.play('deny');
      } else {
        this.commandMode = !this.commandMode;
        audio.play(this.commandMode ? 'uiselect' : 'ui');
      }
      game.input.touch.setToggle('command', this.commandMode);
    }

    if (input.isPressed('rally')) this.issueFollow(game);
    if (input.isPressed('hold')) this.issueHold(game);

    if (this.commandMode) {
      for (let i = 0; i < ROLE_ORDER.length; i++) {
        if (input.isPressed('slot' + (i + 1))) {
          this.filter = this.filter === ROLE_ORDER[i] ? 'all' : ROLE_ORDER[i];
          audio.play('ui');
        }
      }
      const tap = input.takeTap();
      if (tap) {
        const w = game.r.camera.toWorld(tap.x, tap.y);
        this.issueAt(game, w.x, w.y);
      }
    }
  }

  issueAt(game, wx, wy) {
    const group = this.selected(game);
    if (!group.length) return;
    const target = game.enemyNear(wx, wy, 26);
    if (target) {
      for (const a of group) { a.order = 'attack'; a.orderTarget = target; }
      this.markers.push({ x: target.x, y: target.y, kind: 'attack', life: 1.4 });
      this.say('ATTACK', group.length);
      audio.play('alarm', { vol: 0.4 });
    } else {
      // fan them out so five animals do not pile onto one pixel
      group.forEach((a, i) => {
        const ang = (i / Math.max(1, group.length)) * TAU;
        const spread = Math.min(30, 6 + group.length * 3);
        a.order = 'move';
        a.orderTarget = null;
        a.orderX = wx + Math.cos(ang) * spread;
        a.orderY = wy + Math.sin(ang) * spread * 0.8;
      });
      this.markers.push({ x: wx, y: wy, kind: 'move', life: 1.4 });
      this.say('MOVE', group.length);
      audio.play('ui');
    }
  }

  issueFollow(game) {
    const group = this.selected(game);
    if (!group.length) return;
    for (const a of group) { a.order = 'follow'; a.orderTarget = null; }
    this.markers.push({ x: game.player.x, y: game.player.y, kind: 'rally', life: 1.2 });
    this.say('ON ME', group.length);
    audio.play('uiselect');
  }

  issueHold(game) {
    const group = this.selected(game);
    if (!group.length) return;
    for (const a of group) { a.order = 'hold'; a.orderTarget = null; a.orderX = a.x; a.orderY = a.y; }
    this.say('HOLD', group.length);
    audio.play('ui');
  }

  say(what, n) {
    this.lastOrder = what + '  x' + n + (this.filter === 'all' ? '' : '  (' + this.filter.toUpperCase() + ')');
    this.lastOrderT = 2;
  }

  /** A rally call from an elk or a marmot briefly steadies the whole line. */
  rally(seconds) { this.rallyT = Math.max(this.rallyT, seconds); }

  // --- drawing -------------------------------------------------------------
  drawWorld(r, game) {
    for (const m of this.markers) {
      const f = 1 - m.life / 1.4;
      const col = m.kind === 'attack' ? P.uiBad : m.kind === 'rally' ? P.favor : P.uiAccent;
      r.ring(m.x, m.y, 6 + f * 14, col, 1, 1 - f);
      if (m.kind === 'attack') {
        const s = 5;
        r.line(m.x - s, m.y - s, m.x + s, m.y + s, col, 1, 1 - f);
        r.line(m.x + s, m.y - s, m.x - s, m.y + s, col, 1, 1 - f);
      }
    }
    if (!this.commandMode) return;

    // faint leash from each animal to whatever it has been told to do
    for (const a of this.selected(game)) {
      if (a.order === 'move' || a.order === 'hold') {
        r.line(a.x, a.y, a.orderX, a.orderY, P.uiAccent, 1, 0.22);
      } else if (a.order === 'attack' && a.orderTarget && !a.orderTarget.dead) {
        r.line(a.x, a.y, a.orderTarget.x, a.orderTarget.y, P.uiBad, 1, 0.22);
      }
    }

    // reticle
    const m = game.input.mouse;
    const w = game.r.camera.toWorld(m.sx, m.sy);
    const target = game.enemyNear(w.x, w.y, 26);
    const col = target ? P.uiBad : P.uiAccent;
    const pulse = 0.6 + Math.sin(game.time * 8) * 0.3;
    r.ring(target ? target.x : w.x, target ? target.y : w.y, target ? target.r + 5 : 9, col, 1, pulse);
    r.line(w.x - 8, w.y, w.x - 3, w.y, col, 1, pulse);
    r.line(w.x + 3, w.y, w.x + 8, w.y, col, 1, pulse);
    r.line(w.x, w.y - 8, w.x, w.y - 3, col, 1, pulse);
    r.line(w.x, w.y + 3, w.x, w.y + 8, col, 1, pulse);
  }

  drawHud(r, ctx, game) {
    const all = this.members(game);
    if (!all.length) return;
    const touch = game.input.touch.visible;
    const x = 6;
    let y = touch ? 96 : 84;

    drawText(ctx, 'FOLLOWING  ' + all.length, x, y, this.commandMode ? P.favor : P.uiDim, { shadow: true });
    y += 9;

    const shown = all.slice(0, 8);
    for (const a of shown) {
      const roleCol = ROLE_COLOR[a.def.role] || P.uiDim;
      const dim = this.filter !== 'all' && a.def.role !== this.filter;
      ctx.globalAlpha = dim ? 0.4 : 1;
      r.uiRect(x, y + 1, 2, 5, roleCol);
      drawText(ctx, a.name, x + 5, y, a.downT > 0 ? P.uiBad : P.ui, { shadow: true });
      const bw = 20, bx = x + 52;
      r.uiRect(bx, y + 1, bw, 4, 'rgba(0,0,0,0.5)');
      r.uiRect(bx, y + 1, bw * clamp(a.hp / a.maxHpStat, 0, 1), 4, a.downT > 0 ? P.uiBad : a.devoted ? P.favor : P.uiGood);
      const tag = a.downT > 0 ? 'DOWN' : a.order.toUpperCase();
      drawText(ctx, tag, bx + bw + 3, y, a.downT > 0 ? P.uiBad : P.uiDim, { shadow: true });
      for (let i = 0; i < a.tools.length; i++) r.uiRect(bx + bw + 22 + i * 3, y + 1, 2, 4, P.cyber);
      ctx.globalAlpha = 1;
      y += 8;
    }
    if (all.length > shown.length) {
      drawText(ctx, '+' + (all.length - shown.length) + ' MORE', x + 5, y, P.uiDim, { shadow: true });
    }

    if (this.commandMode) {
      const label = 'COMMAND  -  CLICK TO ORDER  -  ' + (this.filter === 'all' ? 'ALL' : this.filter.toUpperCase());
      drawText(ctx, label, VIEW_W / 2, VIEW_H - 40, P.favor, { align: 'center', shadow: true });
      drawText(ctx, '1-6 FILTER BY ROLE   Y ON ME   H HOLD   T EXIT', VIEW_W / 2, VIEW_H - 31, P.uiDim, { align: 'center', shadow: true });
    }
    if (this.lastOrderT > 0) {
      ctx.globalAlpha = clamp(this.lastOrderT, 0, 1);
      drawText(ctx, this.lastOrder, VIEW_W / 2, 66, P.favor, { align: 'center', shadow: true });
      ctx.globalAlpha = 1;
    }
    if (this.rallyT > 0) drawText(ctx, 'RALLIED', VIEW_W / 2, 76, P.uiGood, { align: 'center', shadow: true });
  }
}
