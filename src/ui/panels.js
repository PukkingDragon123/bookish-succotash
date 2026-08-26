// The three full-screen overlays: crafting, chip sockets, and the basin map.
// One class owns all of them so only one can ever be open, and so the "does
// this pause the world?" question has a single answer (it doesn't — waves keep
// counting down while you shop).

import { drawText, measure } from '../engine/font.js';
import { itemIcon } from '../art/items.js';
import { P } from '../art/palette.js';
import { RECIPES, RESOURCES, CHIPS } from '../systems/defs.js';
import { VIEW_W, VIEW_H } from '../engine/canvas.js';
import { clamp } from '../engine/math.js';
import { audio } from '../engine/audio.js';
import { TS, TILES } from '../world/tiles.js';
import { makeCanvas } from '../engine/canvas.js';

export class Panels {
  constructor() {
    this.mode = 'none';
    this.cursor = 0;
    this.chipCursor = 0;
    this.chipPane = 'bag';       // 'bag' | 'slots'
    this.mapCanvas = null;
    this.mapDirty = true;
    this.scroll = 0;
  }

  get open() { return this.mode !== 'none'; }

  toggle(mode) {
    if (this.mode === mode) { this.mode = 'none'; audio.play('ui'); return; }
    this.mode = mode;
    this.cursor = 0;
    this.scroll = 0;
    audio.play('uiselect');
  }

  close() { this.mode = 'none'; }

  // ---------------------------------------------------------------- input
  update(dt, game) {
    if (!this.open) return;
    const input = game.input;
    if (input.isPressed('pause')) { this.close(); audio.play('ui'); return; }

    if (this.mode === 'craft') this.updateCraft(game, input);
    else if (this.mode === 'chips') this.updateChips(game, input);
    else if (this.mode === 'map') { /* map is read-only */ }
  }

  availableRecipes(game) {
    const p = game.player;
    return RECIPES.filter(rec => {
      if (rec.repeatable && (game.craftCounts[rec.id] || 0) >= rec.repeatable) return false;
      if (rec.give && rec.give.weapon && p.weapons.includes(rec.give.weapon)) return false;
      return true;
    });
  }

  updateCraft(game, input) {
    const list = this.availableRecipes(game);
    if (list.length === 0) return;
    if (input.isPressed('up')) { this.cursor = (this.cursor - 1 + list.length) % list.length; audio.play('ui'); }
    if (input.isPressed('down')) { this.cursor = (this.cursor + 1) % list.length; audio.play('ui'); }
    if (input.wheel) { this.cursor = clamp(this.cursor + input.wheel, 0, list.length - 1); audio.play('ui'); }
    if (input.isPressed('interact') || input.keyPressed('Enter')) {
      const rec = list[clamp(this.cursor, 0, list.length - 1)];
      game.craft(rec);
    }
  }

  updateChips(game, input) {
    const p = game.player;
    const list = this.chipPane === 'bag' ? p.chipBag : p.chips;
    const n = Math.max(1, this.chipPane === 'slots' ? p.chipSlots : list.length);
    if (input.isPressed('up')) { this.chipCursor = (this.chipCursor - 1 + n) % n; audio.play('ui'); }
    if (input.isPressed('down')) { this.chipCursor = (this.chipCursor + 1) % n; audio.play('ui'); }
    if (input.isPressed('left') || input.isPressed('right')) {
      this.chipPane = this.chipPane === 'bag' ? 'slots' : 'bag';
      this.chipCursor = 0;
      audio.play('ui');
    }
    if (input.isPressed('interact') || input.keyPressed('Enter')) {
      if (this.chipPane === 'bag') {
        const key = p.chipBag[this.chipCursor];
        if (key) {
          if (p.chips.length < p.chipSlots) {
            p.installChip(key);
            audio.play('chip');
            game.toast('INSTALLED ' + CHIPS[key].name, CHIPS[key].color);
          } else {
            game.toast('ALL SOCKETS FULL - REMOVE ONE FIRST', P.uiWarn);
            audio.play('deny');
          }
        }
      } else {
        if (p.removeChip(this.chipCursor)) { audio.play('ui'); game.toast('CHIP REMOVED', P.uiDim); }
        else audio.play('deny');
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  draw(r, game) {
    if (!this.open) return;
    const ctx = r.ctx;
    r.uiRect(0, 0, VIEW_W, VIEW_H, 'rgba(6,10,8,0.82)');
    if (this.mode === 'craft') this.drawCraft(r, ctx, game);
    else if (this.mode === 'chips') this.drawChips(r, ctx, game);
    else if (this.mode === 'map') this.drawMap(r, ctx, game);
  }

  drawCraft(r, ctx, game) {
    const p = game.player;
    const list = this.availableRecipes(game);
    this.cursor = clamp(this.cursor, 0, Math.max(0, list.length - 1));

    const px = 12, py = 16, pw = VIEW_W - 24, ph = VIEW_H - 32;
    r.panel(px, py, pw, ph);
    drawText(ctx, 'CRAFTING', px + 6, py + 5, P.ui, { scale: 1 });
    const station = game.nearStation();
    drawText(ctx, station ? 'AT ' + station.toUpperCase() : 'NO STATION NEARBY', px + pw - 6, py + 5,
      station ? P.uiGood : P.uiDim, { align: 'right' });
    drawText(ctx, 'W/S SELECT   E CRAFT   TAB CLOSE', px + pw - 6, py + ph - 10, P.uiDim, { align: 'right' });

    const rowH = 15;
    const visible = Math.floor((ph - 32) / rowH);
    this.scroll = clamp(this.cursor - Math.floor(visible / 2), 0, Math.max(0, list.length - visible));

    for (let i = 0; i < Math.min(visible, list.length); i++) {
      const idx = i + this.scroll;
      const rec = list[idx];
      if (!rec) break;
      const y = py + 16 + i * rowH;
      const sel = idx === this.cursor;
      const can = game.canCraft(rec);
      if (sel) r.uiRect(px + 3, y - 1, pw - 6, rowH - 1, 'rgba(61,90,65,0.35)');
      const nameColor = !can.ok ? P.uiDim : sel ? P.ui : P.uiDim;
      drawText(ctx, rec.name, px + 7, y + 1, nameColor, { shadow: sel });

      // cost line, coloured per ingredient
      let cx = px + 104;
      for (const k in rec.cost) {
        const need = rec.cost[k];
        const have = p.inv.get(k);
        const icon = itemIcon(k);
        ctx.globalAlpha = have >= need ? 1 : 0.45;
        ctx.drawImage(icon, cx, y - 1);
        ctx.globalAlpha = 1;
        drawText(ctx, have + '/' + need, cx + 11, y + 2, have >= need ? P.uiGood : P.uiBad);
        cx += 12 + measure(have + '/' + need, 1) + 6;
      }
      if (rec.station) {
        drawText(ctx, rec.station.toUpperCase(), px + pw - 8, y + 2,
          station === rec.station ? P.uiGood : P.uiWarn, { align: 'right' });
      }
      if (sel) {
        const desc = rec.desc + (can.ok ? '' : '  (' + can.why + ')');
        drawText(ctx, desc, px + 7, py + ph - 20, can.ok ? P.uiDim : P.uiWarn);
      }
    }
    if (list.length === 0) drawText(ctx, 'NOTHING LEFT TO BUILD.', px + 7, py + 20, P.uiDim);
  }

  drawChips(r, ctx, game) {
    const p = game.player;
    const px = 12, py = 16, pw = VIEW_W - 24, ph = VIEW_H - 32;
    r.panel(px, py, pw, ph);
    drawText(ctx, 'UPGRADE CHIPS', px + 6, py + 5, P.cyber);
    drawText(ctx, 'STOLEN: ' + p.chipsStolen, px + pw - 6, py + 5, P.uiDim, { align: 'right' });
    drawText(ctx, 'A/D SWITCH   W/S SELECT   E INSTALL/REMOVE   C CLOSE', px + pw - 6, py + ph - 10, P.uiDim, { align: 'right' });

    // installed sockets
    const colW = (pw - 20) / 2;
    drawText(ctx, 'SOCKETS (' + p.chips.length + '/' + p.chipSlots + ')', px + 8, py + 18, this.chipPane === 'slots' ? P.ui : P.uiDim);
    for (let i = 0; i < p.chipSlots; i++) {
      const y = py + 30 + i * 17;
      const key = p.chips[i];
      const c = key ? CHIPS[key] : null;
      const sel = this.chipPane === 'slots' && i === this.chipCursor;
      r.uiRect(px + 8, y, colW - 8, 15, sel ? 'rgba(61,90,65,0.35)' : 'rgba(0,0,0,0.25)');
      r.uiStroke(px + 8, y, colW - 8, 15, c ? c.color : '#2c4230');
      if (c) {
        r.uiRect(px + 12, y + 4, 7, 7, c.color);
        drawText(ctx, c.name, px + 23, y + 2, P.ui);
        drawText(ctx, c.desc, px + 23, y + 9, P.uiDim);
      } else {
        drawText(ctx, 'EMPTY SOCKET', px + 14, y + 5, P.uiDim);
      }
    }

    // bag
    const bx = px + colW + 12;
    drawText(ctx, 'SALVAGE (' + p.chipBag.length + ')', bx, py + 18, this.chipPane === 'bag' ? P.ui : P.uiDim);
    if (p.chipBag.length === 0) {
      drawText(ctx, 'RIP CHIPS OUT OF MACHINE', bx, py + 32, P.uiDim);
      drawText(ctx, 'WRECKS WITH [E].', bx, py + 41, P.uiDim);
    }
    const maxRows = Math.floor((ph - 50) / 17);
    for (let i = 0; i < Math.min(p.chipBag.length, maxRows); i++) {
      const key = p.chipBag[i];
      const c = CHIPS[key];
      const y = py + 30 + i * 17;
      const sel = this.chipPane === 'bag' && i === this.chipCursor;
      r.uiRect(bx, y, colW - 8, 15, sel ? 'rgba(61,90,65,0.35)' : 'rgba(0,0,0,0.25)');
      r.uiStroke(bx, y, colW - 8, 15, c.color);
      r.uiRect(bx + 4, y + 4, 7, 7, c.color);
      drawText(ctx, c.name, bx + 15, y + 2, P.ui);
      drawText(ctx, c.desc, bx + 15, y + 9, P.uiDim);
    }
  }

  // --- the basin map --------------------------------------------------------
  buildMap(game) {
    const world = game.world;
    const scale = 3;                                  // tiles per map pixel
    const mw = Math.ceil(world.w / scale), mh = Math.ceil(world.h / scale);
    const { canvas, ctx } = makeCanvas(mw, mh);
    const img = ctx.createImageData(mw, mh);
    const d = img.data;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const t = world.tileAt(Math.min(world.w - 1, x * scale), Math.min(world.h - 1, y * scale));
        const hex = TILES[t].base;
        const n = parseInt(hex.slice(1), 16);
        const i = (y * mw + x) * 4;
        d[i] = (n >> 16) & 255; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mapCanvas = canvas;
    this.mapScale = scale;
    this.mapDirty = false;
  }

  drawMap(r, ctx, game) {
    if (!this.mapCanvas || this.mapDirty) this.buildMap(game);
    const world = game.world;
    const px = 12, py = 16, pw = VIEW_W - 24, ph = VIEW_H - 32;
    r.panel(px, py, pw, ph);
    drawText(ctx, 'THE BASIN', px + 6, py + 5, P.ui);
    drawText(ctx, 'M TO CLOSE', px + pw - 6, py + 5, P.uiDim, { align: 'right' });

    const mw = this.mapCanvas.width, mh = this.mapCanvas.height;
    const avail = { w: pw - 12, h: ph - 24 };
    const s = Math.max(1, Math.floor(Math.min(avail.w / mw, avail.h / mh)));
    const dw = mw * s, dh = mh * s;
    const dx = Math.round(px + (pw - dw) / 2), dy = Math.round(py + 14 + (avail.h - dh) / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapCanvas, dx, dy, dw, dh);
    r.uiStroke(dx - 1, dy - 1, dw + 2, dh + 2, P.uiBorder);

    const toMap = (wx, wy) => ({
      x: dx + (wx / (world.w * TS)) * dw,
      y: dy + (wy / (world.h * TS)) * dh,
    });

    // markers
    const den = toMap(world.den.x, world.den.y);
    r.uiRect(den.x - 2, den.y - 2, 5, 5, P.furCream);
    drawText(ctx, 'DEN', den.x + 4, den.y - 3, P.furCream);

    for (const n of game.npcs) {
      const m = toMap(n.x, n.y);
      r.uiRect(m.x - 1, m.y - 1, 3, 3, n.recruited ? P.uiAccent : P.favor);
    }
    for (const e of game.enemies) {
      const m = toMap(e.x, e.y);
      r.uiRect(m.x - 1, m.y - 1, e.def.boss ? 4 : 2, e.def.boss ? 4 : 2, P.nestEye);
    }
    if (game.surveyLevel > 0) {
      for (const node of world.nodes) {
        if (!node.alive) continue;
        const k = node.type;
        if (!['iron', 'copper', 'obsidian', 'coal', 'sulfur', 'saltpeter'].includes(k)) continue;
        if (game.surveyLevel < 2 && Math.random() > 0.4) continue;
        const m = toMap(node.x, node.y);
        r.uiRect(m.x, m.y, 1, 1, RESOURCES[k] ? RESOURCES[k].color : '#fff');
      }
    }
    if (game.fire.burning.size) {
      let i = 0;
      for (const idx of game.fire.burning) {
        if ((i++ & 3) !== 0) continue;
        const tx = idx % world.w, ty = (idx / world.w) | 0;
        const m = toMap(tx * TS, ty * TS);
        r.uiRect(m.x, m.y, 2, 2, P.fire2);
      }
    }
    const pl = toMap(game.player.x, game.player.y);
    const blink = Math.floor(game.time * 3) % 2 === 0;
    r.uiRect(pl.x - 2, pl.y - 2, 5, 5, blink ? P.cyberHot : P.cyber);

    drawText(ctx, game.surveyLevel > 0 ? 'ORE SURVEYED BY WISP' : 'ASK WISP TO SURVEY THE RIDGE', px + 8, py + ph - 10, P.uiDim);
  }
}
