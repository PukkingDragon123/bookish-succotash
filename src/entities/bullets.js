// Pooled projectiles. One flat array serves the player, the recruits and every
// enemy pattern in the game, because a bullet-hell needs to push a couple of
// thousand of these around without allocating.

import { bulletSprite } from '../art/items.js';
import { P } from '../art/palette.js';
import { TAU, clamp, dist2 } from '../engine/math.js';
import { rnd, chance } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { isSolid } from '../world/tiles.js';

const MAX_BULLETS = 2200;

export class Bullets {
  constructor() {
    this.pool = new Array(MAX_BULLETS);
    for (let i = 0; i < MAX_BULLETS; i++) this.pool[i] = { alive: false };
    this.head = 0;
    this.count = 0;
  }

  _get() {
    for (let i = 0; i < MAX_BULLETS; i++) {
      const idx = (this.head + i) % MAX_BULLETS;
      if (!this.pool[idx].alive) { this.head = (idx + 1) % MAX_BULLETS; return this.pool[idx]; }
    }
    const b = this.pool[this.head];
    this.head = (this.head + 1) % MAX_BULLETS;
    return b;
  }

  spawn(o) {
    const b = this._get();
    b.alive = true;
    b.x = o.x; b.y = o.y;
    b.vx = o.vx || 0; b.vy = o.vy || 0;
    b.damage = o.damage || 5;
    b.friendly = !!o.friendly;
    b.kind = o.kind || (o.friendly ? 'pellet' : 'redOrb');
    b.life = b.maxLife = o.life == null ? 2 : o.life;
    b.pierce = o.pierce || 0;
    b.bounce = o.bounce || 0;
    b.aoe = o.aoe || 0;
    b.arc = !!o.arc;
    b.z = o.arc ? 6 : 0;
    b.vz = o.arc ? 90 : 0;
    b.chain = o.chain || 0;
    b.chainRange = o.chainRange || 0;
    b.knock = o.knock || 0;
    b.burn = o.burn || 0;
    b.arcChance = o.arcChance || 0;
    b.scald = !!o.scald;
    b.owner = o.owner || null;
    b.radius = o.radius || (b.kind === 'saw' ? 6 : b.kind === 'net' ? 6 : 3);
    b.homing = o.homing || 0;
    b.accel = o.accel || 0;
    b.sine = o.sine || 0;
    b.sinePhase = o.sinePhase || rnd(TAU);
    b.sineFreq = o.sineFreq || 6;
    b.spin = o.spin || 0;
    b.rot = Math.atan2(b.vy, b.vx);
    b.trail = o.trail !== false;
    b.grav = o.grav || 0;
    b.hits = null;
    b.color = o.color || null;
    b.glow = o.glow == null ? (b.friendly ? 'rgba(255,220,140,0.5)' : 'rgba(255,90,70,0.5)') : o.glow;
    b.delay = o.delay || 0;
    b.ignoreTerrain = !!o.ignoreTerrain;
    this.count++;
    return b;
  }

  clear(friendlyToo = true) {
    for (const b of this.pool) {
      if (!b.alive) continue;
      if (!friendlyToo && b.friendly) continue;
      b.alive = false;
    }
    this.count = 0;
  }

  /** Convert every enemy bullet on screen into a harmless puff. */
  clearHostile(r) {
    let n = 0;
    for (const b of this.pool) {
      if (!b.alive || b.friendly) continue;
      particles.burst(b.x, b.y, 3, { colors: [P.nestTealHi, '#ffffff'], speed: 40, life: 0.25, additive: true });
      b.alive = false;
      n++;
    }
    return n;
  }

  update(dt, game) {
    const world = game.world;
    let live = 0;
    for (let i = 0; i < MAX_BULLETS; i++) {
      const b = this.pool[i];
      if (!b.alive) continue;

      if (b.delay > 0) { b.delay -= dt; live++; continue; }

      b.life -= dt;
      if (b.life <= 0) { this._expire(b, game); continue; }
      live++;

      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        b.vx += (b.vx / sp) * b.accel * dt;
        b.vy += (b.vy / sp) * b.accel * dt;
      }
      if (b.homing) {
        const target = b.friendly ? game.nearestEnemy(b.x, b.y, 180) : game.player;
        if (target && !target.dead) {
          const a = Math.atan2(target.y - 8 - b.y, target.x - b.x);
          const sp = Math.hypot(b.vx, b.vy);
          const cur = Math.atan2(b.vy, b.vx);
          let d = a - cur;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          const na = cur + clamp(d, -b.homing * dt, b.homing * dt);
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }
      }
      if (b.grav) b.vy += b.grav * dt;

      let mvx = b.vx, mvy = b.vy;
      if (b.sine) {
        const perp = Math.atan2(b.vy, b.vx) + Math.PI / 2;
        const s = Math.sin((b.maxLife - b.life) * b.sineFreq + b.sinePhase) * b.sine;
        mvx += Math.cos(perp) * s;
        mvy += Math.sin(perp) * s;
      }

      const nx = b.x + mvx * dt;
      const ny = b.y + mvy * dt;

      if (b.arc) {
        b.z += b.vz * dt;
        b.vz -= 240 * dt;
        if (b.z <= 0) { b.z = 0; this._expire(b, game); b.x = nx; b.y = ny; continue; }
      }

      // terrain
      if (!b.ignoreTerrain && !b.arc) {
        const t = world.tileAtPx(nx, ny);
        if (isSolid(t)) {
          if (b.bounce > 0) {
            b.bounce--;
            // reflect off whichever axis actually blocked us
            if (isSolid(world.tileAtPx(nx, b.y))) b.vx = -b.vx;
            if (isSolid(world.tileAtPx(b.x, ny))) b.vy = -b.vy;
            b.rot = Math.atan2(b.vy, b.vx);
            particles.sparks(nx, ny, 4, P.stoneLight);
            audio.play('metal', { vol: 0.4 });
            continue;
          }
          this._expire(b, game, true);
          continue;
        }
      }

      b.x = nx; b.y = ny;
      if (b.spin) b.rot += b.spin * dt;
      else b.rot = Math.atan2(b.vy, b.vx);

      if (b.x < -40 || b.y < -40 || b.x > world.pxW + 40 || b.y > world.pxH + 40) { b.alive = false; continue; }

      // trails
      if (b.trail && chance(dt * (b.friendly ? 26 : 16))) {
        particles.spawn({
          x: b.x, y: b.y, z: b.z, vx: -b.vx * 0.06, vy: -b.vy * 0.06,
          life: 0.22, size: 1, additive: true,
          colors: b.friendly ? ['#fff3c4', '#ffd97a'] : [P.nestRed, '#ff9a8a'],
        });
      }

      // --- collisions ---
      if (b.friendly) {
        const hit = game.hitEnemies(b);
        if (hit === 'consumed') continue;
      } else {
        const p = game.player;
        // Claws first: a shot met by an active guard is turned around before
        // it ever gets a chance to be a hit.
        if (!p.dead && p.parryActive && p.tryParry(b, game)) continue;
        if (!p.dead) p.tryGraze(b, game);
        if (!p.dead && p.invuln <= 0 && dist2(b.x, b.y, p.x, p.y - 7) < (b.radius + p.hitR) * (b.radius + p.hitR)) {
          p.damage(b.damage, game);
          this._expire(b, game);
          continue;
        }
        // recruited soldiers can be hit too
        const ally = game.hitAllies(b);
        if (ally === 'consumed') continue;
      }
    }
    this.count = live;
  }

  _expire(b, game, onTerrain = false) {
    b.alive = false;
    if (b.aoe > 0) {
      game.explode(b.x, b.y, b.aoe, b.damage, b.friendly, b.owner);
    } else if (onTerrain) {
      particles.burst(b.x, b.y, 3, { colors: b.friendly ? ['#ffd97a', '#fff'] : [P.nestRed, '#fff'], speed: 40, life: 0.2, additive: true });
    }
  }

  draw(r) {
    const ctx = r.ctx;
    for (let i = 0; i < MAX_BULLETS; i++) {
      const b = this.pool[i];
      if (!b.alive || b.delay > 0) continue;
      if (!r.camera.visible(b.x, b.y, 24)) continue;
      const img = bulletSprite(b.kind);
      if (b.arc) r.shadow(b.x, b.y, 3, 1.5, 0.3);
      r.drawT(img, b.x, b.y - b.z, b.rot, 1, 1, 1);
    }
  }

  drawGlow(r) {
    // In a heavy pattern the individual glows merge anyway, so thin them out
    // rather than paying for one per bullet.
    const step = this.count > 700 ? 3 : this.count > 350 ? 2 : 1;
    let n = 0;
    for (let i = 0; i < MAX_BULLETS; i++) {
      const b = this.pool[i];
      if (!b.alive || b.delay > 0 || !b.glow) continue;
      if (step > 1 && (n++ % step) !== 0) continue;
      if (!r.camera.visible(b.x, b.y, 24)) continue;
      r.glow(b.x, b.y - b.z, b.radius * 3.4, b.glow, step > 1 ? 0.9 : 0.7);
    }
  }
}

// --- reusable enemy patterns ----------------------------------------------
// Every boss and turret composes its attacks out of these.
export const Pattern = {
  radial(game, x, y, n, speed, opts = {}) {
    const base = opts.angle || 0;
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * TAU;
      game.spawnBullet(Object.assign({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        friendly: false, kind: 'redOrb', damage: opts.damage || 8, life: opts.life || 4,
      }, opts.extra));
    }
  },

  spiral(game, x, y, arms, speed, phase, opts = {}) {
    for (let i = 0; i < arms; i++) {
      const a = phase + (i / arms) * TAU;
      game.spawnBullet(Object.assign({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        friendly: false, kind: opts.kind || 'tealOrb', damage: opts.damage || 8, life: opts.life || 5,
      }, opts.extra));
    }
  },

  aimed(game, x, y, tx, ty, speed, opts = {}) {
    const a = Math.atan2(ty - y, tx - x) + (opts.offset || 0);
    game.spawnBullet(Object.assign({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      friendly: false, kind: opts.kind || 'redOrb', damage: opts.damage || 9, life: opts.life || 4,
    }, opts.extra));
  },

  fan(game, x, y, tx, ty, n, spread, speed, opts = {}) {
    const base = Math.atan2(ty - y, tx - x);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
      const a = base + t * spread;
      game.spawnBullet(Object.assign({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        friendly: false, kind: opts.kind || 'redOrb', damage: opts.damage || 8, life: opts.life || 3.5,
      }, opts.extra));
    }
  },

  /** A ring that arrives with a stagger, so it reads as a wave, not a wall. */
  wave(game, x, y, n, speed, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (opts.angle || 0);
      game.spawnBullet(Object.assign({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        friendly: false, kind: opts.kind || 'tealOrb', damage: opts.damage || 8,
        life: opts.life || 5, delay: (i % 4) * 0.06, sine: opts.sine || 0,
      }, opts.extra));
    }
  },

  /** Two counter-rotating rings — the classic "flower". */
  flower(game, x, y, n, speed, phase, opts = {}) {
    Pattern.spiral(game, x, y, n, speed, phase, opts);
    Pattern.spiral(game, x, y, n, speed * 0.75, -phase * 1.3, opts);
  },

  burstAt(game, x, y, n, speed, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU);
      const s = speed * rnd(0.7, 1.25);
      game.spawnBullet(Object.assign({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        friendly: false, kind: opts.kind || 'ember', damage: opts.damage || 7, life: opts.life || 2.6,
      }, opts.extra));
    }
  },
};
