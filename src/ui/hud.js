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
    this.sub = null;
    this.pings = [];
    this.toasts = [];
    this.announce = null;
    this.hintT = 0;
    this.hint = null;
  }

  toast(text, color = P.ui, seconds = 2.6) {
    this.toasts.push({ text, color, life: seconds, maxLife: seconds });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  /** A quiet line under the banner: flavour, not instruction. */
  subtitle(text, seconds = 3) { this.sub = { text, t: seconds, total: seconds }; }

  /** A marker out in the world, for something that just happened off-screen. */
  ping(x, y, color, seconds = 6) {
    this.pings.push({ x, y, color, t: seconds, total: seconds });
    if (this.pings.length > 8) this.pings.shift();
  }

  showAnnounce(title, sub, color, seconds) {
    this.announce = { title, sub, color, life: seconds, maxLife: seconds };
  }

  update(dt) {
    if (this.sub) { this.sub.t -= dt; if (this.sub.t <= 0) this.sub = null; }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.pings[i].t -= dt;
      if (this.pings[i].t <= 0) this.pings.splice(i, 1);
    }
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

    // On touch the thumb clusters own the bottom corners, so the readouts move
    // out from under them.
    this.touch = game.input.touch.visible;
    this.resY = this.touch ? 58 : VIEW_H - 14;
    this.squadY = this.touch ? 82 : 70;

    // Inside the facility you have no inventory, no squad and no waves — the
    // HUD shrinks to the two things that still matter.
    if (game.mode === 'lab') {
      this.drawVitals(r, ctx, p, game);
      if (game.campaign && game.campaign.hasGun) this.drawWeapon(r, ctx, p, game);
      this.drawToasts(r, ctx, game);
      this.drawAnnounce(r, ctx, game);
      this.drawCombo(r, ctx, game);
      return;
    }

    this.drawSubtitle(r, ctx, game);
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
    this.drawCombo(r, ctx, game);
  }

  /** Parry/graze chain. Only shows while it is actually paying you. */
  drawCombo(r, ctx, game) {
    const p = game.player;
    if (p.combo <= 0 || p.comboT <= 0) return;
    const cx = VIEW_W / 2;
    const y = 54;
    const bonus = Math.round(Math.min(0.6, 0.12 * p.combo) * 100);
    const a = clamp(p.comboT / 0.6, 0, 1);
    ctx.globalAlpha = a;
    drawText(ctx, 'x' + p.combo, cx, y, P.sulfurHi, { align: 'center', scale: 2, shadow: '#000' });
    drawText(ctx, '+' + bonus + '% DAMAGE', cx, y + 16, P.uiDim, { align: 'center', shadow: true });
    ctx.globalAlpha = 1;
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
    const y = this.resY;
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
    const bx = this.touch ? Math.round(VIEW_W / 2 - 43) : VIEW_W - 92;
    const by = VIEW_H - 26;
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
    // Outposts are the tempo now; the wave clock only shows for the scripted
    // set pieces, so the top of the screen is not two competing countdowns.
    if (game.occupation && game.occupation.outposts.length && !d.isBossWave && d.phase !== PHASE.ASSAULT) {
      this.drawOccupation(r, ctx, game);
      return;
    }
    const cx = VIEW_W / 2;
    // The director is on hold until the first fight is over; showing a wave
    // countdown that is not running would just be a lie.
    const stand = game.firstStand;
    if (stand && !stand.finished) {
      if (!stand.active) {
        drawText(ctx, 'SURVEY TEAM INBOUND', cx, 6, P.uiWarn, { align: 'center', shadow: '#000' });
        const t = Math.max(0, game.standDelay);
        drawText(ctx, '0:' + String(Math.floor(t)).padStart(2, '0'), cx, 15, t < 6 ? P.uiBad : P.uiDim, { align: 'center', shadow: '#000' });
      }
      return;
    }
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
    let y = VIEW_H - (this.touch ? 44 : 44);
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

  /** A quiet line under the banner, and markers for off-screen events. */
  drawSubtitle(r, ctx, game) {
    if (this.sub) {
      const a = clamp(this.sub.t / 0.6, 0, 1);
      ctx.globalAlpha = a;
      drawText(ctx, this.sub.text, VIEW_W / 2, VIEW_H - 62, P.uiDim, { align: 'center', shadow: '#000' });
      ctx.globalAlpha = 1;
    }
    // Pings sit on the rim of the screen pointing at where the thing happened,
    // so a patrol landing off-camera still tells you which way to look.
    for (const p of this.pings) {
      const sx = p.x - r.camera.ox, sy = p.y - r.camera.oy;
      const a = clamp(p.t / p.total, 0, 1) * (0.5 + Math.abs(Math.sin(game.time * 4)) * 0.5);
      const cx = clamp(sx, 10, VIEW_W - 10), cy = clamp(sy, 22, VIEW_H - 24);
      ctx.globalAlpha = a;
      r.uiRect(cx - 2, cy - 2, 5, 5, p.color);
      r.uiRect(cx - 4, cy, 1, 1, p.color);
      r.uiRect(cx + 4, cy, 1, 1, p.color);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * The occupation readout.
   *
   * This replaces the wave clock as the thing you glance at. It says how many
   * of their outposts are still up and how close the noise is to buying them
   * a patrol — both of which are numbers you can go and change.
   */
  drawOccupation(r, ctx, game) {
    const occ = game.occupation;
    if (!occ || !occ.outposts.length) return;
    const standing = occ.standing.length;
    const cx = VIEW_W / 2;
    const w = 132, h = standing ? 20 : 12;
    const y = 2;
    r.uiRect(cx - w / 2, y, w, h, 'rgba(9,16,13,0.82)');
    r.uiStroke(cx - w / 2, y, w, h, standing ? 'rgba(120,54,44,0.7)' : 'rgba(70,110,72,0.7)');
    if (!standing) {
      drawText(ctx, 'BASIN CLEAR', cx, y + 3, P.uiGood, { align: 'center' });
      return;
    }
    drawText(ctx, 'LES NEST: ' + standing + ' HOLDING', cx, y + 3, P.uiBad, { align: 'center' });
    // the heat bar: full means a patrol leaves for your camp
    const bw = w - 12;
    r.uiRect(cx - bw / 2, y + 12, bw, 4, 'rgba(0,0,0,0.55)');
    const f = clamp(occ.heat, 0, 1);
    r.uiRect(cx - bw / 2, y + 12, Math.round(bw * f), 4, f > 0.8 ? P.uiBad : f > 0.5 ? P.uiWarn : '#6a5a3a');
    r.uiStroke(cx - bw / 2, y + 12, bw, 4, 'rgba(61,90,65,0.5)');
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
    let y = this.squadY;
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
