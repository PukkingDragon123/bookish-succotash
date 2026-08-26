// Everything that sits on the ground and does something: telegraphed mortar
// impacts, saw traps, smoke screens, the barricades Mossback builds, Sable's
// captured sentry, incendiary canisters, and geyser eruptions.

import { machineFrames } from '../art/machines.js';

import { P } from '../art/palette.js';
import { TAU, clamp, dist2 } from '../engine/math.js';
import { rnd, chance } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';

/** A shell already in the air: ring on the ground, then a real explosion. */
export class Mortar {
  constructor(x, y, delay, radius, damage, owner) {
    this.x = x; this.y = y;
    this.t = 0; this.delay = delay;
    this.radius = radius; this.damage = damage;
    this.owner = owner;
    this.dead = false;
    this.objType = 'hazard';
    this.layer = 'ground';
  }
  update(dt, game) {
    this.t += dt;
    if (chance(dt * 6)) particles.spawn({
      x: this.x + rnd(-this.radius, this.radius), y: this.y + rnd(-this.radius * 0.6, this.radius * 0.6),
      z: 0, vz: rnd(4, 14), life: 0.4, size: 1, colors: [P.nestEye, '#ffb0a8'], additive: true,
    });
    if (this.t >= this.delay) {
      this.dead = true;
      game.explode(this.x, this.y, this.radius, this.damage, false, this.owner);
    }
  }
  draw(r, game) {
    const f = clamp(this.t / this.delay, 0, 1);
    const col = f > 0.8 ? '#ffffff' : P.nestEye;
    r.ring(this.x, this.y, this.radius, col, 1, 0.35 + f * 0.5);
    r.ring(this.x, this.y, this.radius * f, col, 1, 0.7);
    if (f > 0.85 && Math.floor(game.time * 20) % 2 === 0) r.circle(this.x, this.y, this.radius * 0.3, 'rgba(255,90,70,0.35)');
  }
}

/** Incendiary canister — the thing that actually starts the forest fire. */
export class Firebomb {
  constructor(x, y, delay, owner, silent = false) {
    this.x = x; this.y = y;
    this.t = 0; this.delay = delay;
    this.owner = owner;
    this.silent = silent;
    this.dead = false;
    this.objType = 'hazard';
    this.layer = 'ground';
  }
  update(dt, game) {
    this.t += dt;
    if (chance(dt * 10)) particles.embers(this.x + rnd(-8, 8), this.y + rnd(-6, 6), 1);
    if (this.t >= this.delay) {
      this.dead = true;
      game.fire.firebomb(this.x, this.y, 2.6);
      game.explode(this.x, this.y, 28, 16, false, this.owner);
      game.r.camera.addShake(3);
    }
  }
  draw(r, game) {
    const f = clamp(this.t / this.delay, 0, 1);
    r.ring(this.x, this.y, 26, P.fire2, 1, 0.3 + f * 0.6);
    r.ring(this.x, this.y, 26 * f, P.fire1, 1, 0.8);
    r.glow(this.x, this.y, 20 * f + 6, 'rgba(255,140,60,0.6)', 0.8);
  }
}

/** Trapper deployable: spins in place, shreds anything that touches it. */
export class SawTrap {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp = 18;
    this.life = 26;
    this.t = rnd(TAU);
    this.dead = false;
    this.r = 8;
    this.objType = 'hazard';
    this.layer = 'entity';
    this.hitT = 0;
  }
  update(dt, game) {
    this.t += dt * 5;
    this.life -= dt;
    this.hitT = Math.max(0, this.hitT - dt);
    if (this.life <= 0) this.dead = true;
    const p = game.player;
    if (!p.dead && this.hitT <= 0 && dist2(this.x, this.y, p.x, p.y - 6) < (this.r + p.hitR) * (this.r + p.hitR)) {
      p.damage(10, game);
      this.hitT = 0.6;
      particles.sparks(this.x, this.y, 6, P.nestSteelHi);
    }
    if (chance(dt * 2)) particles.sparks(this.x + rnd(-6, 6), this.y + rnd(-4, 4), 1, P.nestSteelHi);
  }
  damage(n, game) {
    this.hp -= n;
    particles.sparks(this.x, this.y, 3, P.nestSteelHi);
    if (this.hp <= 0) {
      this.dead = true;
      audio.play('metal');
      particles.scrap(this.x, this.y, 6);
      game.pickups.drop('resource', 'scrap', this.x, this.y, { count: 1 });
    }
  }
  draw(r, game) {
    const f = machineFrames('sawtrap');
    const img = f[Math.floor((this.t * 0.4) % 1 * f.length) % f.length];
    r.shadow(this.x, this.y + 2, 7, 3);
    r.drawT(img, this.x, this.y, this.t, 1, 1, this.life < 3 ? (Math.floor(game.time * 8) % 2 ? 0.4 : 1) : 1);
  }
}

/** Ember's smoke pop: blocks line of sight and eats enemy bullets. */
export class SmokeCloud {
  constructor(x, y, radius) {
    this.x = x; this.y = y;
    this.r = radius;
    this.life = 7;
    this.maxLife = 7;
    this.dead = false;
    this.objType = 'hazard';
    this.layer = 'over';
  }
  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (chance(dt * 26)) {
      const a = rnd(TAU), d = rnd(0, this.r);
      particles.smoke(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d * 0.7, 1, {
        life: 2.2, size: 3, colors: ['#8a8e8a', '#6a6e6a', '#4a4e4c'],
      });
    }
    // scrub hostile bullets inside the cloud
    for (const b of game.bullets.pool) {
      if (!b.alive || b.friendly) continue;
      if (dist2(b.x, b.y, this.x, this.y) < this.r * this.r) {
        b.alive = false;
        particles.burst(b.x, b.y, 2, { colors: ['#b8bcb8'], speed: 20, life: 0.3 });
      }
    }
  }
  draw(r, game) {
    const a = clamp(this.life / 1.5, 0, 1) * 0.5;
    r.circle(this.x, this.y, this.r, 'rgba(120,125,122,1)', a * 0.5);
    r.circle(this.x, this.y, this.r * 0.7, 'rgba(150,155,152,1)', a * 0.4);
  }
}

/** Mossback's pine barricade: soaks bullets so the den doesn't. */
export class Barricade {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp = 90; this.maxHp = 90;
    this.dead = false;
    this.r = 9;
    this.objType = 'hazard';
    this.layer = 'entity';
    this.hurtT = 0;
  }
  update(dt, game) {
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (game.fire.burnAtPx(this.x, this.y) > 0) this.hp -= dt * 12;
    // barricades stop hostile fire
    for (const b of game.bullets.pool) {
      if (!b.alive || b.friendly) continue;
      if (dist2(b.x, b.y, this.x, this.y - 6) < (this.r + b.radius) * (this.r + b.radius)) {
        b.alive = false;
        this.hp -= b.damage * 0.5;
        this.hurtT = 0.15;
        particles.woodChips(b.x, b.y, 3);
      }
    }
    if (this.hp <= 0) {
      this.dead = true;
      particles.woodChips(this.x, this.y - 6, 12);
      audio.play('timber', { vol: 0.5 });
    }
  }
  draw(r, game) {
    r.shadow(this.x, this.y, 8, 3);
    const h = 14 * clamp(this.hp / this.maxHp, 0.3, 1);
    const col = this.hurtT > 0 ? '#c9a877' : P.bark;
    for (let i = -1; i <= 1; i++) {
      r.rect(this.x + i * 5 - 2, this.y - h, 4, h, col);
      r.rect(this.x + i * 5 - 2, this.y - h, 4, 1, P.barkLight);
    }
    r.rect(this.x - 8, this.y - h * 0.6, 16, 2, P.barkLight);
  }
}

/** Sable's rebuilt sentry: shoots the company with its own hardware. */
export class AllyTurret {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp = 120; this.maxHp = 120;
    this.dead = false;
    this.r = 8;
    this.fireT = 0;
    this.angle = 0;
    this.t = 0;
    this.objType = 'hazard';
    this.layer = 'entity';
  }
  update(dt, game) {
    this.t += dt;
    this.fireT -= dt;
    const e = game.nearestEnemy(this.x, this.y, 190);
    if (e) {
      this.angle = Math.atan2(e.y - this.y, e.x - this.x);
      if (this.fireT <= 0) {
        this.fireT = 0.5;
        game.spawnBullet({
          x: this.x + Math.cos(this.angle) * 8, y: this.y - 8 + Math.sin(this.angle) * 8,
          vx: Math.cos(this.angle) * 300, vy: Math.sin(this.angle) * 300,
          damage: 14, friendly: true, kind: 'nail', life: 1.4, owner: this,
        });
        audio.play('shoot', { vol: 0.28 });
      }
    } else {
      this.angle = Math.sin(this.t * 0.6) * 1.4;
    }
    if (game.fire.burnAtPx(this.x, this.y) > 0) this.hp -= dt * 10;
    if (this.hp <= 0) { this.dead = true; audio.play('explode'); particles.scrap(this.x, this.y - 6, 10); }
  }
  draw(r, game) {
    r.shadow(this.x, this.y, 8, 3);
    r.rect(this.x - 6, this.y - 8, 12, 8, P.nestSteelDk);
    r.rect(this.x - 6, this.y - 8, 12, 1, P.nestSteel);
    r.circle(this.x, this.y - 10, 4, P.nestSteel);
    r.line(this.x, this.y - 10, this.x + Math.cos(this.angle) * 9, this.y - 10 + Math.sin(this.angle) * 9, P.nestSteelHi, 2);
    r.circle(this.x, this.y - 10, 1.4, P.cyber);
    const w = 14, frac = clamp(this.hp / this.maxHp, 0, 1);
    r.rect(this.x - w / 2, this.y - 20, w, 2, 'rgba(0,0,0,0.6)');
    r.rect(this.x - w / 2, this.y - 20, w * frac, 2, P.uiAccent);
  }
}

/** A geyser going off: scalding column that hurts anything standing on it. */
export class SteamBurst {
  constructor(x, y, duration = 2.4, friendly = true) {
    this.x = x; this.y = y;
    this.life = duration;
    this.maxLife = duration;
    this.dead = false;
    this.r = 22;
    this.friendly = friendly;
    this.tick = 0;
    this.objType = 'hazard';
    this.layer = 'over';
  }
  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.25;
      game.damageEnemiesAt(this.x, this.y, this.r, 12, null);
      const p = game.player;
      if (!this.friendly && dist2(p.x, p.y, this.x, this.y) < this.r * this.r) p.damage(8, game);
    }
    for (let i = 0; i < 3; i++) {
      particles.spawn({
        x: this.x + rnd(-6, 6), y: this.y + rnd(-4, 4), z: rnd(0, 6),
        vx: rnd(-14, 14), vy: rnd(-8, 8), vz: rnd(70, 160),
        life: rnd(0.6, 1.4), size: 2, endSize: 4,
        colors: ['#ffffff', '#c9e8f0', '#8fd0e0'], gravity: -18, drag: 1.1,
      });
    }
    if (chance(dt * 8)) particles.water(this.x + rnd(-8, 8), this.y, 2);
  }
  draw(r, game) {
    const f = clamp(this.life / this.maxLife, 0, 1);
    const h = 40 * f + 16;
    r.ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const yy = this.y - i * (h / 5);
      const ww = (7 - i * 0.9) * (0.7 + f * 0.6);
      r.circle(this.x + Math.sin(game.time * 6 + i) * 2, yy, Math.max(1, ww), 'rgba(200,235,245,1)', 0.35 * f);
    }
    r.ctx.globalCompositeOperation = 'source-over';
    r.ring(this.x, this.y, this.r * (1 - f * 0.2), P.springHot, 1, 0.35 * f);
  }
}
