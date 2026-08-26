// Loose items on the ground: spilled resources, upgrade chips torn out of
// machines, and finished tools an NPC has just handed over. They hop when they
// land, drift toward the player once they settle, and never expire.

import { pickupSprite, chipPickupFrames } from '../art/items.js';
import { CHIPS, RESOURCES } from '../systems/defs.js';
import { P } from '../art/palette.js';
import { TAU, dist2 } from '../engine/math.js';
import { rnd } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';

export class Pickup {
  constructor(kind, item, x, y, opts = {}) {
    this.kind = kind;             // 'resource' | 'chip' | 'weapon'
    this.item = item;
    this.count = opts.count || 1;
    this.x = x; this.y = y;
    this.z = opts.z == null ? 6 : opts.z;
    this.vx = opts.vx == null ? rnd(-34, 34) : opts.vx;
    this.vy = opts.vy == null ? rnd(-24, 24) : opts.vy;
    this.vz = opts.vz == null ? rnd(40, 100) : opts.vz;
    this.t = rnd(TAU);
    this.age = 0;
    this.dead = false;
    this.settled = false;
    this.magnetT = 0.55;          // brief grace so drops don't snap back instantly
    this.objType = 'pickup';
  }

  get sprite() {
    if (this.kind === 'chip') {
      const f = chipPickupFrames();
      return f[Math.floor((this.t * 0.9) % 1 * f.length)];
    }
    const f = pickupSprite(this.item);
    return f[Math.floor((this.t * 0.5) % 1 * f.length)];
  }

  update(dt, game) {
    this.age += dt;
    this.t += dt * 2.2;
    this.magnetT = Math.max(0, this.magnetT - dt);

    if (!this.settled) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      this.vz -= 340 * dt;
      this.vx *= Math.exp(-3 * dt);
      this.vy *= Math.exp(-3 * dt);
      if (this.z <= 0) {
        this.z = 0;
        if (Math.abs(this.vz) > 30) { this.vz = -this.vz * 0.32; }
        else { this.vz = 0; this.settled = true; }
      }
    } else {
      this.z = Math.sin(this.t * 1.6) * 1.2 + 1.6;
    }

    const p = game.player;
    if (p.dead) return;
    const range = (this.kind === 'chip' ? 34 : 22) * (1 + p.stats.magnet);
    const d2 = dist2(this.x, this.y, p.x, p.y - 4);
    if (this.magnetT <= 0 && d2 < range * range) {
      const a = Math.atan2(p.y - 4 - this.y, p.x - this.x);
      const pull = 190 * (1 - Math.sqrt(d2) / range) + 60;
      this.x += Math.cos(a) * pull * dt;
      this.y += Math.sin(a) * pull * dt;
    }
    if (d2 < 10 * 10) this.collect(game);
  }

  collect(game) {
    if (this.dead) return;
    const p = game.player;
    if (this.kind === 'chip') {
      p.chipBag.push(this.item);
      p.chipsStolen++;
      audio.play('chip');
      particles.chipSpark(this.x, this.y - 4);
      const c = CHIPS[this.item];
      game.toast('CHIP ACQUIRED: ' + (c ? c.name : this.item) + '  [C TO INSTALL]', P.cyber, 3.4);
      particles.text(this.x, this.y - 18, c ? c.name : 'CHIP', c ? c.color : P.cyber, { life: 1.4 });
      if (p.chips.length < p.chipSlots) p.installChip(this.item);
    } else if (this.kind === 'weapon') {
      if (p.addWeapon(this.item)) {
        audio.play('levelup');
        game.toast('NEW WEAPON: ' + (game.weaponName(this.item)), P.uiGood, 3.2);
      } else {
        p.inv.add('scrap', 3);
        game.toast('SPARE PARTS +3', P.uiDim);
      }
    } else {
      const taken = p.inv.add(this.item, this.count);
      if (taken <= 0) {
        // bag or back is full: leave it lying there
        this.magnetT = 1.4;
        return;
      }
      audio.play('pickup', { vol: 0.55 });
      particles.text(this.x, this.y - 14, '+' + taken, RESOURCES[this.item] ? RESOURCES[this.item].color : '#fff', { life: 0.6 });
    }
    this.dead = true;
  }

  draw(r, game) {
    const img = this.sprite;
    if (!img) return;
    r.shadow(this.x, this.y, 4, 1.8, 0.24 - Math.min(0.18, this.z * 0.012));
    r.draw(img, this.x - img.width / 2, this.y - img.height - this.z);
    if (this.kind === 'chip') {
      r.glow(this.x, this.y - 8 - this.z, 14, 'rgba(77,225,255,0.55)', 0.8);
    } else if (this.kind === 'weapon') {
      r.glow(this.x, this.y - 8 - this.z, 16, 'rgba(255,215,120,0.55)', 0.8);
    }
  }
}

export class PickupManager {
  constructor() { this.list = []; }
  clear() { this.list.length = 0; }

  drop(kind, item, x, y, opts = {}) {
    if (this.list.length > 420) this.list.shift();
    const p = new Pickup(kind, item, x, y, opts);
    this.list.push(p);
    return p;
  }

  update(dt, game) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.update(dt, game);
      if (p.dead) this.list.splice(i, 1);
    }
  }

  collect(out, cam) {
    for (const p of this.list) if (cam.visible(p.x, p.y, 24)) out.push(p);
  }
}
