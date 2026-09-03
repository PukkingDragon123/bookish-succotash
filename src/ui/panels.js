// The three full-screen overlays: crafting, chip sockets, and the basin map.
// One class owns all of them so only one can ever be open, and so the "does
// this pause the world?" question has a single answer (it doesn't — waves keep
// counting down while you shop).

import { FACTIONS, FACTION_KEYS } from '../systems/factions.js';
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
    else if (this.mode === 'bag') this.updateBag(game, input);
    else if (this.mode === 'chips') this.updateChips(game, input);
    else if (this.mode === 'map') { /* map is read-only */ }
  }

  updateBag(game, input) {
    const held = game.player.inv.entries();
    if (!held.length) return;
    const step = (d) => { this.cursor = clamp(this.cursor + d, 0, held.length - 1); audio.play('ui', { vol: 0.3 }); };
    if (input.keyPressed('KeyW') || input.keyPressed('ArrowUp')) step(-3);
    if (input.keyPressed('KeyS') || input.keyPressed('ArrowDown')) step(3);
    if (input.keyPressed('KeyA') || input.keyPressed('ArrowLeft')) step(-1);
    if (input.keyPressed('KeyD') || input.keyPressed('ArrowRight')) step(1);
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
    else if (this.mode === 'bag') this.drawBag(r, ctx, game);
    else if (this.mode === 'chips') this.drawChips(r, ctx, game);
    else if (this.mode === 'map') this.drawMap(r, ctx, game);
  }

  /**
   * The bag.
   *
   * The HUD only ever had room for four or five counters, so most of what you
   * were carrying was invisible — you found out you had forty reeds by opening
   * the craft screen and reading a cost line. This is a plain grid of every
   * item with a count, its icon, and one line saying where it comes from, which
   * is the only thing a resource in this game needs to tell you.
   */
  drawBag(r, ctx, game) {
    const p = game.player;
    const held = p.inv.entries();
    // The panel is sized to what you are carrying rather than to the screen.
    // A full-height frame around four rows of items reads as a bug.
    const cols = 3, rowsNeeded = Math.max(1, Math.ceil(held.length / cols));
    const px = 12, pw = VIEW_W - 24;
    const ph = Math.min(VIEW_H - 32, 46 + Math.min(rowsNeeded, 12) * 17);
    const py = Math.round((VIEW_H - ph) / 2);
    r.panel(px, py, pw, ph);
    drawText(ctx, 'BAG', px + 6, py + 5, P.ui);
    const total = held.reduce((a, [, n]) => a + n, 0);
    drawText(ctx, held.length + ' KINDS  -  ' + total + ' THINGS', px + pw - 6, py + 5, P.uiDim, { align: 'right' });
    drawText(ctx, 'W/S SELECT   I CLOSE', px + pw - 6, py + ph - 10, P.uiDim, { align: 'right' });

    if (!held.length) {
      drawText(ctx, 'EMPTY. GO AND PICK SOMETHING UP.', px + pw / 2, py + ph / 2, P.uiDim, { align: 'center' });
      return;
    }
    this.cursor = clamp(this.cursor, 0, held.length - 1);

    // Three columns of slots, so it reads as a bag and not a spreadsheet.
    const cellW = Math.floor((pw - 16) / cols), cellH = 17;
    const rows = Math.floor((ph - 46) / cellH);
    const perPage = cols * rows;
    this.scroll = clamp(Math.floor(this.cursor / cols) - Math.floor(rows / 2), 0,
                        Math.max(0, Math.ceil(held.length / cols) - rows));
    const first = this.scroll * cols;

    for (let i = 0; i < perPage; i++) {
      const idx = first + i;
      if (idx >= held.length) break;
      const [key, n] = held[idx];
      const def = RESOURCES[key] || { name: key, icon: key, color: P.ui };
      const cx = px + 8 + (i % cols) * cellW;
      const cy = py + 18 + Math.floor(i / cols) * cellH;
      const sel = idx === this.cursor;
      if (sel) r.uiRect(cx - 2, cy - 2, cellW - 4, cellH - 2, 'rgba(61,90,65,0.38)');
      r.uiRect(cx, cy, 13, 13, 'rgba(0,0,0,0.45)');
      const icon = itemIcon(def.icon || key);
      if (icon) ctx.drawImage(icon, cx + 1, cy + 1);
      drawText(ctx, def.name, cx + 17, cy + 1, sel ? P.ui : P.uiDim);
      const cap = p.inv.cap(key);
      const full = cap !== Infinity && n >= cap;
      drawText(ctx, cap === Infinity ? String(n) : n + '/' + cap,
        cx + cellW - 10, cy + 1, full ? P.uiWarn : def.color || P.ui, { align: 'right' });
    }

    // one line about whatever is selected
    const [selKey] = held[this.cursor] || [];
    const selDef = RESOURCES[selKey];
    if (selDef) {
      r.uiRect(px + 4, py + ph - 22, pw - 8, 1, P.uiDim);
      drawText(ctx, selDef.hint || '', px + 8, py + ph - 18, P.uiDim);
    }
  }

  drawCraft(r, ctx, game) {
    const p = game.player;
    const list = this.availableRecipes(game);
    this.cursor = clamp(this.cursor, 0, Math.max(0, list.length - 1));

    const px = 12, py = 16, pw = VIEW_W - 24, ph = VIEW_H - 32;
    r.panel(px, py, pw, ph);
    drawText(ctx, 'CRAFTING', px + 6, py + 5, P.ui, { scale: 1 });
    const station = game.nearStation();
    const camp = game.camp;
    // Before anyone has built you anything, the useful thing to say is not
    // "no station nearby" but who to go and ask.
    let stationLabel, stationCol;
    if (station) { stationLabel = 'AT ' + station.toUpperCase(); stationCol = P.uiGood; }
    else if (camp && !camp.hasWorkbench) { stationLabel = 'NOTHING IS BUILT YET'; stationCol = P.uiWarn; }
    else { stationLabel = 'NO STATION NEARBY'; stationCol = P.uiDim; }
    drawText(ctx, stationLabel, px + pw - 6, py + 5, stationCol, { align: 'right' });
    if (camp && !camp.hasWorkbench) {
      drawText(ctx, 'GO AND ASK SOMEBODY TO BUILD A WORKBENCH. NOBODY OUT HERE OWES YOU ONE.',
        px + 6, py + 15, P.uiDim);
    }
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
    // Tiles per map pixel, chosen so the finished map fills the panel rather
    // than sitting as a postage stamp in the middle of it. A bigger basin
    // needs a coarser map, not a smaller one.
    const availW = VIEW_W - 36, availH = VIEW_H - 86;
    const scale = Math.max(1, Math.ceil(Math.max(world.w / availW, world.h / availH)));
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
    const avail = { w: pw - 12, h: ph - 58 };
    const s = Math.min(avail.w / mw, avail.h / mh);
    const dw = Math.round(mw * s), dh = Math.round(mh * s);
    const dx = Math.round(px + (pw - dw) / 2), dy = Math.round(py + 14);
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
    // --- named places -------------------------------------------------------
    // Only what you have actually walked to. The map filling in as you cross
    // the basin is most of what makes a big basin worth crossing.
    const known = (world.landmarks || []).filter(l => l.found);
    for (const l of known) {
      const m = toMap(l.x, l.y);
      const hostile = l.outpost && !l.outpost.razed;
      const col = hostile ? P.uiBad : l.cleared ? P.uiGood : P.uiAccent;
      r.uiRect(m.x - 2, m.y - 2, 5, 5, 'rgba(9,16,13,0.8)');
      r.uiRect(m.x - 1, m.y - 1, 3, 3, col);
      if (dw > 200) {
        const label = l.name.toUpperCase();
        drawText(ctx, label, m.x + 4, m.y - 3, col, { scale: 1 });
      }
    }
    // outposts you have found that are not on a named place
    if (game.occupation) {
      for (const o of game.occupation.outposts) {
        if (!o.found || o.landmark) continue;
        const m = toMap(o.x, o.y);
        r.uiRect(m.x - 1, m.y - 1, 3, 3, o.razed ? P.uiGood : P.uiBad);
      }
    }

    const pl = toMap(game.player.x, game.player.y);
    const blink = Math.floor(game.time * 3) % 2 === 0;
    r.uiRect(pl.x - 2, pl.y - 2, 5, 5, blink ? P.cyberHot : P.cyber);

    // --- the ledger ---------------------------------------------------------
    const total = (world.landmarks || []).length;
    const standing = game.occupation ? game.occupation.standing.length : 0;
    let ly = py + ph - 11;
    drawText(ctx, 'FOUND ' + known.length + '/' + total
      + (standing ? '   LES NEST HOLDING ' + standing : '   BASIN CLEAR'),
      px + 8, ly, standing ? P.uiWarn : P.uiGood);
    drawText(ctx, game.surveyLevel > 0 ? 'ORE SURVEYED' : 'ASK WISP TO SURVEY THE RIDGE',
      px + pw - 8, ly, P.uiDim, { align: 'right' });

    // --- standing with the powers of the basin -------------------------------
    if (game.alliances) {
      const keys = FACTION_KEYS;
      const colW = Math.floor((pw - 16) / keys.length);
      const fy = py + ph - 20;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i], f = FACTIONS[k];
        const v = game.alliances.get(k);
        const x = px + 8 + i * colW;
        const t = game.alliances.tierOf(k);
        drawText(ctx, f.short, x, fy - 15, v > 0 ? f.color : P.uiDim, { scale: 1 });
        drawText(ctx, t >= 0 ? f.tiers[t].title.toUpperCase() : 'UNKNOWN', x, fy - 7,
          t >= 0 ? f.color : P.uiDim, { scale: 1 });
        r.uiRect(x, fy, colW - 8, 3, 'rgba(0,0,0,0.5)');
        r.uiRect(x, fy, Math.round((colW - 8) * (v / 100)), 3, f.color);
      }
    }
  }
}
