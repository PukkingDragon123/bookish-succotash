// The HUD. Deliberately small and quiet: a health bar, a wood tally, a row of
// resource counts, the current gun, and — the one thing that must never be
// missed — the countdown to the next assault.

import { drawText, measure } from '../engine/font.js';
import { itemIcon, weaponSprite } from '../art/items.js';
import { P } from '../art/palette.js';
import { HUD_RESOURCES, CHIPS } from '../systems/defs.js';
import { MAX_WOOD } from '../entities/player.js';
import { PHASE } from '../systems/waves.js';
import { clamp } from '../engine/math.js';
import { VIEW_W, VIEW_H } from '../engine/canvas.js';

function timeStr(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}

export class Hud {
  constructor() {
    this.toasts = [];
    this.announce = null;
    this.hintT = 0;
    this.hint = null;
  }

  toast(text, color = P.ui, seconds = 2.6) {
    this.toasts.push({ text, color, life: seconds, maxLife: seconds });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  showAnnounce(title, sub, color, seconds) {
    this.announce = { title, sub, color, life: seconds, maxLife: seconds };
  }

  update(dt) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
    if (this.announce) {
      this.announce.life -= dt;
      if (this.announce.life <= 0) this.announce = null;
    }
    this.hintT = Math.max(0, this.hintT - dt);
  }

  draw(r, game) {
    const ctx = r.ctx;
    const p = game.player;

    this.drawVitals(r, ctx, p, game);
    this.drawWood(r, ctx, p, game);
    this.drawResources(r, ctx, p, game);
    this.drawWeapon(r, ctx, p, game);
    this.drawWaveBanner(r, ctx, game);
    this.drawObjective(r, ctx, game);
    this.drawBossBar(r, ctx, game);
    this.drawToasts(r, ctx, game);
    this.drawAnnounce(r, ctx, game);
    this.drawPrompt(r, ctx, game);
    this.drawSquad(r, ctx, game);
  }

  // --- health / energy / dash / chips --------------------------------------
  drawVitals(r, ctx, p, game) {
    const x = 6, y = 6;
    const w = 92, h = 7;
    // health
    r.uiRect(x - 1, y - 1, w + 2, h + 2, 'rgba(0,0,0,0.55)');
    r.uiRect(x, y, w, h, P.hpRedDark);
    const frac = clamp(p.hp / p.maxHp, 0, 1);
    const barColor = p.overclock ? P.cyber : frac < 0.28 ? '#ff6a5a' : P.hpRed;
    r.uiRect(x, y, Math.round(w * frac), h, barColor);
    r.uiRect(x, y, Math.round(w * frac), 1, 'rgba(255,255,255,0.28)');
    // segment ticks every 25 hp
    for (let v = 25; v < p.maxHp; v += 25) {
      const sx = x + Math.round((v / p.maxHp) * w);
      r.uiRect(sx, y, 1, h, 'rgba(0,0,0,0.4)');
    }
    drawText(ctx, Math.ceil(Math.max(0, p.hp)) + '/' + p.maxHp, x + w + 4, y + 1, P.uiDim, { scale: 1, shadow: true });

    // energy (dash fuel)
    const ey = y + h + 3;
    r.uiRect(x - 1, ey - 1, w + 2, 4, 'rgba(0,0,0,0.55)');
    r.uiRect(x, ey, w, 2, '#123a44');
    r.uiRect(x, ey, Math.round(w * clamp(p.energy / p.maxEnergy, 0, 1)), 2, P.energy);

    // dash charges
    for (let i = 0; i < p.dashMax; i++) {
      const dx = x + i * 6;
      const filled = i < p.dashCharges;
      r.uiRect(dx, ey + 4, 4, 3, filled ? P.cyber : 'rgba(20,40,46,0.9)');
    }

    // chip slots
    const cy = ey + 9;
    for (let i = 0; i < p.chipSlots; i++) {
      const cx = x + i * 9;
      const key = p.chips[i];
      const c = key ? CHIPS[key] : null;
      r.uiRect(cx, cy, 7, 7, 'rgba(0,0,0,0.5)');
      r.uiStroke(cx, cy, 7, 7, c ? c.color : '#2c4230');
      if (c) r.uiRect(cx + 2, cy + 2, 3, 3, c.color);
    }
    if (p.chipBag.length > 0) {
      const bx = x + p.chipSlots * 9 + 2;
      const blink = Math.floor(game.time * 2.5) % 2 === 0;
      drawText(ctx, '+' + p.chipBag.length, bx, cy + 1, blink ? P.cyber : P.cyberDim, { shadow: true });
    }

    if (p.shieldUp) r.uiRect(x + w + 34, y, 4, 7, P.springHot);
  }

  // --- the wood you are physically carrying ---------------------------------
  drawWood(r, ctx, p, game) {
    const n = p.inv.get('wood');
    const x = 6, y = 46;
    const icon = itemIcon('wood');
    r.ctx.globalAlpha = n > 0 ? 1 : 0.45;
    ctx.drawImage(icon, x, y - 1);
    r.ctx.globalAlpha = 1;
    // ten pips: full is a real limit you feel
    for (let i = 0; i < MAX_WOOD; i++) {
      const px = x + 13 + i * 4;
      const on = i < n;
      r.uiRect(px, y + 1, 3, 7, on ? (n >= MAX_WOOD ? P.uiWarn : P.barkLight) : 'rgba(0,0,0,0.45)');
      if (on) r.uiRect(px, y + 1, 3, 1, 'rgba(255,255,255,0.25)');
    }
    drawText(ctx, n + '/' + MAX_WOOD, x + 13 + MAX_WOOD * 4 + 4, y + 2, n >= MAX_WOOD ? P.uiWarn : P.uiDim, { shadow: true });
  }

  // --- compact resource row -------------------------------------------------
  drawResources(r, ctx, p, game) {
    let x = 6;
    const y = VIEW_H - 14;
    for (const key of HUD_RESOURCES) {
      const n = p.inv.get(key);
      if (n <= 0 && !['wood', 'ammo', 'gunpowder'].includes(key)) continue;
      const icon = itemIcon(key);
      ctx.globalAlpha = n > 0 ? 1 : 0.35;
      ctx.drawImage(icon, x, y);
      ctx.globalAlpha = 1;
      const label = String(n);
      drawText(ctx, label, x + 11, y + 3, n > 0 ? P.ui : P.uiDim, { shadow: true });
      x += 12 + measure(label, 1) + 5;
      if (x > VIEW_W - 120) break;
    }
  }

  // --- weapon + ammo --------------------------------------------------------
  drawWeapon(r, ctx, p, game) {
    const w = p.weapon;
    const bx = VIEW_W - 92, by = VIEW_H - 26;
    r.panel(bx, by, 86, 22);
    const img = weaponSprite(w.art);
    ctx.drawImage(img, bx + 3, by + 5);
    drawText(ctx, w.name, bx + 30, by + 4, P.ui, { shadow: true });
    if (w.ammo > 0) {
      const ammo = p.inv.get('ammo');
      drawText(ctx, ammo + ' RDS', bx + 30, by + 13, ammo <= 0 ? P.uiBad : ammo < 10 ? P.uiWarn : P.uiDim, { shadow: true });
    } else {
      drawText(ctx, 'NO AMMO NEEDED', bx + 30, by + 13, P.uiDim, { shadow: true });
    }
    // weapon slots
    if (p.weapons.length > 1) {
      for (let i = 0; i < p.weapons.length; i++) {
        const sx = bx - 2 + i * 9;
        const sy = by - 11;
        const on = i === p.weaponIndex;
        r.uiRect(sx, sy, 8, 9, on ? P.uiBorder : 'rgba(9,16,13,0.8)');
        drawText(ctx, String(i + 1), sx + 2, sy + 2, on ? P.ui : P.uiDim);
      }
    }
  }

  // --- the countdown --------------------------------------------------------
  drawWaveBanner(r, ctx, game) {
    const d = game.director;
    const cx = VIEW_W / 2;
    if (d.phase === PHASE.PREP) {
      const t = d.timer;
      const urgent = t <= 10;
      const label = d.waveLabel();
      const isBossNext = d.nextIsBoss;
      const isFireNext = d.nextIsFire;
      const col = isFireNext ? P.fire2 : isBossNext ? P.nestEye : urgent ? P.uiWarn : P.ui;
      const w = 128, h = 22;
      const bx = cx - w / 2;
      r.panel(bx, 4, w, h, 'rgba(9,16,13,0.86)', urgent ? col : P.uiBorder);
      drawText(ctx, 'NEXT: ' + label, cx, 7, col, { align: 'center', shadow: true });
      const pulse = urgent ? (Math.floor(game.time * 6) % 2 === 0 ? 1 : 0.55) : 1;
      ctx.globalAlpha = pulse;
      drawText(ctx, timeStr(t), cx, 15, urgent ? col : P.ui, { align: 'center', shadow: true, scale: 1 });
      ctx.globalAlpha = 1;
      // progress bar drains left-to-right
      r.uiRect(bx + 2, 4 + h - 3, w - 4, 1, 'rgba(0,0,0,0.5)');
      r.uiRect(bx + 2, 4 + h - 3, Math.round((w - 4) * clamp(t / d.prepTotal, 0, 1)), 1, col);
      if (game.intelLevel > 0) {
        drawText(ctx, 'INTEL: ' + d.describeNext(), cx, 4 + h + 2, P.uiDim, { align: 'center', shadow: true });
      }
    } else if (d.phase === PHASE.ASSAULT) {
      const left = game.enemies.length + d.spawnQueue.length;
      const w = 112, h = 13;
      r.panel(cx - w / 2, 4, w, h, 'rgba(9,16,13,0.8)', P.nestEye);
      drawText(ctx, 'WAVE ' + d.wave + '  -  ' + left + ' HOSTILE' + (left === 1 ? '' : 'S'), cx, 7, P.ui, { align: 'center', shadow: true });
    } else if (d.phase === PHASE.FIRE) {
      const ev = d.fireEvent;
      const w = 136, h = 13;
      const blink = Math.floor(game.time * 4) % 2 === 0;
      r.panel(cx - w / 2, 4, w, h, 'rgba(30,10,6,0.85)', blink ? P.fire1 : P.fire3);
      drawText(ctx, 'THE BURN  -  ' + timeStr(ev.duration - ev.t), cx, 7, blink ? P.fire1 : P.fire2, { align: 'center', shadow: true });
    } else if (d.phase === PHASE.CLEAR) {
      const w = 100, h = 13;
      r.panel(cx - w / 2, 4, w, h, 'rgba(9,16,13,0.8)', P.uiGood);
      drawText(ctx, 'AREA CLEAR', cx, 7, P.uiGood, { align: 'center', shadow: true });
    }
  }

  // --- fire-event objective tracker ----------------------------------------
  drawObjective(r, ctx, game) {
    const d = game.director;
    if (d.phase !== PHASE.FIRE) return;
    const x = VIEW_W - 106, y = 22;
    r.panel(x, y, 100, 30, 'rgba(30,10,6,0.8)', P.fire3);
    drawText(ctx, 'FIRES BURNING: ' + game.fire.burning.size, x + 4, y + 4, game.fire.burning.size > 60 ? P.uiBad : P.fire2, { shadow: true });
    drawText(ctx, 'RESCUED: ' + game.rescued + '/' + game.rescueTarget, x + 4, y + 13, game.rescued >= game.rescueTarget ? P.uiGood : P.ui, { shadow: true });
    const waterN = game.player.inv.get('water');
    drawText(ctx, 'WATER: ' + waterN + '/' + game.player.inv.cap('water'), x + 4, y + 22, waterN > 0 ? P.waterFoam : P.uiBad, { shadow: true });
  }

  // --- boss health ----------------------------------------------------------
  drawBossBar(r, ctx, game) {
    const b = game.boss;
    if (!b || b.dead) return;
    const w = 240, h = 8;
    const x = VIEW_W / 2 - w / 2, y = 34;
    r.uiRect(x - 1, y - 1, w + 2, h + 2, 'rgba(0,0,0,0.7)');
    r.uiRect(x, y, w, h, '#2a0f0d');
    const frac = clamp(b.hp / b.maxHp, 0, 1);
    r.uiRect(x, y, Math.round(w * frac), h, P.nestRed);
    r.uiRect(x, y, Math.round(w * frac), 1, 'rgba(255,255,255,0.25)');
    // phase dividers
    for (const f of [0.33, 0.66]) r.uiRect(x + Math.round(w * f), y, 1, h, 'rgba(0,0,0,0.6)');
    drawText(ctx, b.def.name, VIEW_W / 2, y - 9, P.nestEye, { align: 'center', shadow: true });
  }

  // --- toasts & announcements ----------------------------------------------
  drawToasts(r, ctx, game) {
    let y = VIEW_H - 44;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      const a = clamp(t.life / 0.4, 0, 1);
      ctx.globalAlpha = a;
      const w = measure(t.text, 1) + 8;
      r.uiRect(VIEW_W / 2 - w / 2, y, w, 11, 'rgba(9,16,13,0.85)');
      r.uiStroke(VIEW_W / 2 - w / 2, y, w, 11, 'rgba(61,90,65,0.6)');
      drawText(ctx, t.text, VIEW_W / 2, y + 3, t.color, { align: 'center' });
      ctx.globalAlpha = 1;
      y -= 13;
    }
  }

  drawAnnounce(r, ctx, game) {
    const a = this.announce;
    if (!a) return;
    const t = 1 - a.life / a.maxLife;
    const alpha = clamp(Math.min(a.life / 0.5, (1 - t) * 4 + 0.2), 0, 1);
    ctx.globalAlpha = alpha;
    const y = 74;
    const slide = Math.round((1 - clamp(t * 6, 0, 1)) * -14);
    drawText(ctx, a.title, VIEW_W / 2, y + slide, a.color, { align: 'center', scale: 2, shadow: '#000' });
    if (a.sub) drawText(ctx, a.sub, VIEW_W / 2, y + 16 + slide, P.uiDim, { align: 'center', shadow: true });
    ctx.globalAlpha = 1;
  }

  // --- world interaction prompt --------------------------------------------
  drawPrompt(r, ctx, game) {
    const pr = game.prompt;
    if (!pr) return;
    const sx = pr.x - r.camera.ox;
    const sy = pr.y - r.camera.oy;
    const label = '[E] ' + pr.label;
    const w = measure(label, 1) + 8;
    const bx = clamp(Math.round(sx - w / 2), 2, VIEW_W - w - 2);
    const by = clamp(Math.round(sy), 14, VIEW_H - 30);
    const bob = Math.sin(game.time * 4) * 1;
    r.uiRect(bx, by + bob, w, 11, 'rgba(9,16,13,0.88)');
    r.uiStroke(bx, by + bob, w, 11, P.uiAccent);
    drawText(ctx, label, bx + 4, by + 3 + bob, P.ui);
  }

  // --- recruited squad list -------------------------------------------------
  drawSquad(r, ctx, game) {
    const squad = game.npcs.filter(n => n.recruited);
    if (squad.length === 0) return;
    let y = 70;
    for (const n of squad) {
      const down = n.downT > 0;
      drawText(ctx, n.name, 6, y, down ? P.uiBad : P.uiDim, { shadow: true });
      const w = 26;
      r.uiRect(40, y + 1, w, 3, 'rgba(0,0,0,0.5)');
      r.uiRect(40, y + 1, Math.round(w * clamp(n.hp / n.maxHp, 0, 1)), 3, down ? P.uiBad : P.uiGood);
      y += 8;
    }
  }
}
