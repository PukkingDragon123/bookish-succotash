// Everything Les Nest sends at you: poachers on foot, machines on legs, and
// three bosses. Each type has a movement behaviour and a telegraphed attack
// cycle; the machines leave sparking wrecks you can rip an upgrade chip out of.

import { HUMANS } from '../art/species.js';
import { critterFrames, critterSize } from '../art/critters.js';
import { machineFrames } from '../art/machines.js';
import { flashFrames } from '../art/pixel.js';
import { P } from '../art/palette.js';
import { Pattern } from './bullets.js';

import { TAU, clamp, dist2 } from '../engine/math.js';
import { rnd, pick, chance } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { isSolid, TILES } from '../world/tiles.js';

// ---------------------------------------------------------------- catalogue
export const ENEMY_TYPES = {
  poacher: {
    name: 'Poacher', art: 'critter', species: 'poacher', hp: 34, speed: 36,
    r: 6, contact: 6, xp: 1, machine: false, keep: 90, fireEvery: 1.9,
    loot: [['ammo', 2, 0.5], ['gunpowder', 1, 0.25]],
  },
  trapper: {
    name: 'Trapper', art: 'critter', species: 'trapper', hp: 48, speed: 28,
    r: 6, contact: 6, xp: 1, machine: false, keep: 150, fireEvery: 2.6,
    loot: [['fiber', 2, 0.6], ['ammo', 2, 0.35]],
  },
  logger: {
    name: 'Logger', art: 'critter', species: 'logger', hp: 82, speed: 34,
    r: 7, contact: 14, xp: 2, machine: false, keep: 0, fireEvery: 1.4,
    loot: [['wood', 3, 0.7], ['iron', 1, 0.3]],
  },
  enforcer: {
    name: 'Nest Enforcer', art: 'critter', species: 'enforcer', hp: 130, speed: 44,
    r: 7, contact: 10, xp: 4, machine: false, keep: 110, fireEvery: 1.7,
    loot: [['ammo', 5, 0.8], ['scrap', 2, 0.5]], chipChance: 0.35,
  },
  // The lab's own security. Slower rounds than the field enforcers, because
  // the first fight of the game has to be winnable with claws alone.
  labGuard: {
    name: 'Block Guard', art: 'critter', species: 'enforcer', hp: 46, speed: 40,
    r: 7, contact: 8, xp: 3, machine: false, keep: 96, fireEvery: 2.2,
    bulletSpeed: 105, burst: 2,
    loot: [['ammo', 6, 0.9], ['scrap', 1, 0.4]], chipChance: 0,
  },
  technician: {
    name: 'Nest Technician', art: 'critter', species: 'scientist', hp: 28, speed: 30,
    r: 6, contact: 4, xp: 1, machine: false, keep: 190, fireEvery: 3.2,
    loot: [['scrap', 2, 0.7]], chipChance: 0.5,
  },
  drone: {
    name: 'Scout Drone', art: 'machine', species: 'drone', hp: 40, speed: 62,
    r: 7, contact: 8, xp: 2, machine: true, flying: true, keep: 110, fireEvery: 1.5,
    loot: [['scrap', 2, 1]], chipChance: 0.42,
  },
  spider: {
    name: 'Ripsaw', art: 'machine', species: 'spider', hp: 120, speed: 40,
    r: 11, contact: 16, xp: 4, machine: true, keep: 60, fireEvery: 2.4,
    loot: [['scrap', 4, 1], ['iron', 2, 0.5]], chipChance: 0.6,
  },
  turret: {
    name: 'Turret Walker', art: 'machine', species: 'turret', hp: 150, speed: 20,
    r: 10, contact: 12, xp: 4, machine: true, keep: 140, fireEvery: 3.0,
    loot: [['scrap', 4, 1], ['copper', 2, 0.5]], chipChance: 0.6,
  },
  harvester: {
    name: 'Harvester', art: 'machine', species: 'harvester', hp: 320, speed: 22,
    r: 18, contact: 22, xp: 8, machine: true, keep: 100, fireEvery: 2.6,
    loot: [['scrap', 8, 1], ['iron', 4, 0.8], ['copper', 2, 0.5]], chipChance: 0.9,
  },
  firebomber: {
    name: 'Firebomber', art: 'machine', species: 'firebomber', hp: 90, speed: 78,
    r: 9, contact: 10, xp: 5, machine: true, flying: true, keep: 130, fireEvery: 2.2,
    loot: [['scrap', 3, 1], ['sulfur', 2, 0.5]], chipChance: 0.7,
  },
  // --- bosses ---
  ripsawPrime: {
    name: 'RIPSAW PRIME', art: 'machine', species: 'ripsawPrime', hp: 1500, speed: 34,
    r: 24, contact: 26, xp: 30, machine: true, boss: true, keep: 90,
    loot: [['scrap', 20, 1], ['iron', 8, 1], ['copper', 6, 1]], chipChance: 1, chips: 2,
  },
  kiln: {
    name: 'THE KILN', art: 'machine', species: 'kiln', hp: 2100, speed: 44,
    r: 26, contact: 24, xp: 40, machine: true, boss: true, flying: true, keep: 150,
    loot: [['scrap', 24, 1], ['sulfur', 10, 1], ['obsidian', 4, 1]], chipChance: 1, chips: 2,
  },
  motherNest: {
    name: 'MOTHER NEST', art: 'machine', species: 'motherNest', hp: 4200, speed: 20,
    r: 40, contact: 30, xp: 80, machine: true, boss: true, keep: 120,
    loot: [['scrap', 40, 1], ['iron', 16, 1], ['copper', 12, 1], ['obsidian', 8, 1]], chipChance: 1, chips: 4,
  },
};

let nextId = 1;

export class Enemy {
  constructor(kind, x, y, level = 1) {
    const def = ENEMY_TYPES[kind];
    this.id = nextId++;
    this.kind = kind;
    this.def = def;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.level = level;
    const scale = 1 + (level - 1) * 0.13;
    this.maxHp = Math.round(def.hp * scale);
    this.hp = this.maxHp;
    this.r = def.r;
    this.speed = def.speed * (1 + (level - 1) * 0.02);
    this.facing = -1;
    this.view = 'front';
    this.anim = 'walk';
    this.animT = rnd(1);
    this.fireT = rnd(0.6, (def.fireEvery || 2));
    this.state = 'approach';
    this.stateT = 0;
    this.hurtT = 0;
    this.dead = false;
    this.markT = 0;
    this.burnT = 0;
    this.stunT = 0;
    this.phase = 0;
    this.spin = rnd(TAU);
    this.hover = rnd(TAU);
    this.strafe = chance(0.5) ? 1 : -1;
    this.telegraph = 0;
    this.burstN = 0;
    this.burstT = 0;
    this.telegraphKind = null;
    this.charmT = 0;             // Cobalt's hijack: fights for you for a while
    this.objType = 'enemy';
    this.bossBar = !!def.boss;
    this.spawnT = 0.45;
    this.chopT = 0;
    this.lastHitBy = null;
    const s = def.art === 'critter'
      ? critterSize(HUMANS[def.species].cfg)
      : { w: machineFrames(def.species)[0].width, h: machineFrames(def.species)[0].height };
    this.w = s.w; this.h = s.h;
  }

  get frames() {
    if (this.def.art === 'critter') {
      // The people who work for Les Nest only ever wear two faces: doing
      // the job, and having the job go wrong.
      const face = this.hp < this.maxHp * 0.35 ? 'afraid' : this.telegraph > 0 ? 'angry' : 'focused';
      return critterFrames('human:' + this.def.species, HUMANS[this.def.species].cfg, this.anim, this.view, 8, face);
    }
    return machineFrames(this.def.species);
  }

  get sprite() {
    const f = this.frames;
    return f[Math.floor(this.animT * f.length) % f.length];
  }

  // ------------------------------------------------------------------ update
  update(dt, game) {
    if (this.dead) return;
    const p = game.player;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.markT = Math.max(0, this.markT - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    this.charmT = Math.max(0, this.charmT - dt);
    this.spawnT = Math.max(0, this.spawnT - dt);
    this.spin += dt;
    this.hover += dt * 2.4;

    if (this.burnT > 0) {
      this.burnT -= dt;
      this.hp -= dt * 9;
      if (chance(dt * 12)) particles.embers(this.x + rnd(-4, 4), this.y - 6, 1);
      if (this.hp <= 0) { this.die(game); return; }
    }

    if (this.spawnT > 0) {
      this.animT = (this.animT + dt) % 1;
      return;
    }

    // target: normally the player, but a hijacked machine turns on its friends
    let target = p;
    if (this.charmT > 0) {
      target = game.nearestEnemy(this.x, this.y, 240, this) || p;
    }
    const tx = target.x, ty = target.y - (target === p ? 6 : 0);
    const d = Math.sqrt(dist2(this.x, this.y, tx, ty));

    if (this.stunT > 0) {
      this.vx *= Math.exp(-6 * dt);
      this.vy *= Math.exp(-6 * dt);
      this._integrate(dt, game);
      return;
    }

    this.fireT -= dt;
    if (this.telegraph > 0) this.telegraph -= dt;

    switch (this.kind) {
      case 'poacher':   this.aiPoacher(dt, game, target, d); break;
      case 'trapper':   this.aiTrapper(dt, game, target, d); break;
      case 'logger':    this.aiLogger(dt, game, target, d); break;
      case 'enforcer':  this.aiEnforcer(dt, game, target, d); break;
      case 'labGuard':  this.aiLabGuard(dt, game, target, d); break;
      case 'technician':this.aiTechnician(dt, game, target, d); break;
      case 'drone':     this.aiDrone(dt, game, target, d); break;
      case 'spider':    this.aiSpider(dt, game, target, d); break;
      case 'turret':    this.aiTurret(dt, game, target, d); break;
      case 'harvester': this.aiHarvester(dt, game, target, d); break;
      case 'firebomber':this.aiFirebomber(dt, game, target, d); break;
      case 'ripsawPrime': this.aiRipsawPrime(dt, game, target, d); break;
      case 'kiln':      this.aiKiln(dt, game, target, d); break;
      case 'motherNest':this.aiMotherNest(dt, game, target, d); break;
      default: this.approach(dt, game, tx, ty, 60); break;
    }

    this._integrate(dt, game);

    // contact damage
    if (this.charmT <= 0 && !p.dead && this.def.contact) {
      const rr = this.r + p.hitR;
      if (dist2(this.x, this.y, p.x, p.y - 6) < rr * rr) {
        p.damage(this.def.contact, game);
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        p.vx += Math.cos(a) * 140;
        p.vy += Math.sin(a) * 140;
      }
    }

    // machines take a beating standing in their own fire
    const burn = game.fire.burnAtPx(this.x, this.y);
    if (burn > 0 && !this.def.flying) this.damage(dt * 8, game, null, true);

    if (this.hp <= 0) this.die(game);
  }

  _integrate(dt, game) {
    const world = game.world;
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    if (this.def.flying) {
      this.x = clamp(nx, 6, world.pxW - 6);
      this.y = clamp(ny, 6, world.pxH - 6);
    } else {
      if (!isSolid(world.tileAtPx(nx, this.y)) && !TILES[world.tileAtPx(nx, this.y)].deep) this.x = clamp(nx, 6, world.pxW - 6);
      else this.vx *= -0.4;
      if (!isSolid(world.tileAtPx(this.x, ny)) && !TILES[world.tileAtPx(this.x, ny)].deep) this.y = clamp(ny, 6, world.pxH - 6);
      else this.vy *= -0.4;
    }
    const sp = Math.hypot(this.vx, this.vy);
    if (Math.abs(this.vx) > 4) this.facing = this.vx > 0 ? 1 : -1;
    this.view = this.vy < -10 ? 'back' : 'front';
    if (this.def.art === 'critter') {
      this.anim = this.telegraph > 0 ? 'attack' : sp > 18 ? 'walk' : 'idle';
      this.animT = (this.animT + dt * (sp > 18 ? 1.3 : 0.6)) % 1;
    } else {
      this.animT = (this.animT + dt * 1.4) % 1;
    }
    if (!this.def.flying && sp > 20 && chance(dt * 4)) {
      particles.dust(this.x, this.y + 1, 1, TILES[game.world.tileAtPx(this.x, this.y)].dark || P.dirt);
    }
  }

  // --- steering helpers ----------------------------------------------------
  approach(dt, game, tx, ty, keep = 0, accel = 320) {
    const a = Math.atan2(ty - this.y, tx - this.x);
    const d = Math.sqrt(dist2(this.x, this.y, tx, ty));
    let want = this.speed;
    if (keep > 0) {
      if (d < keep * 0.75) want = -this.speed * 0.8;
      else if (d < keep * 1.1) want = 0;
    }
    const sx = Math.cos(a) * want, sy = Math.sin(a) * want;
    // strafe component keeps fights circular instead of a straight line
    const px = -Math.sin(a) * this.speed * 0.55 * this.strafe;
    const py = Math.cos(a) * this.speed * 0.55 * this.strafe;
    const mix = keep > 0 ? 1 : 0.35;
    this.vx += ((sx + px * mix) - this.vx) * clamp(dt * accel / 60, 0, 1);
    this.vy += ((sy + py * mix) - this.vy) * clamp(dt * accel / 60, 0, 1);
    if (chance(dt * 0.25)) this.strafe *= -1;
  }

  hoverAround(dt, game, tx, ty, keep) {
    this.approach(dt, game, tx, ty, keep, 220);
    this.vy += Math.sin(this.hover) * 8;
  }

  telegraphed(kind, time) {
    this.telegraph = time;
    this.telegraphKind = kind;
  }

  // --- per-type AI ---------------------------------------------------------
  aiPoacher(dt, game, target, d) {
    this.approach(dt, game, target.x, target.y, this.def.keep);
    if (this.fireT <= 0 && d < 220) {
      if (this.telegraph <= 0) { this.telegraphed('shot', 0.45); audio.play('alarm', { vol: 0.25 }); return; }
      if (this.telegraph > 0.02) return;
      this.fireT = this.def.fireEvery * rnd(0.8, 1.25);
      Pattern.fan(game, this.x, this.y - 8, target.x, target.y - 6, 3, 0.22, 150, { damage: 9, kind: 'redOrb' });
      audio.play('shotgun', { vol: 0.5 });
      particles.burst(this.x, this.y - 8, 4, { colors: [P.fire1, P.fire2], speed: 60, life: 0.2, additive: true });
    }
  }

  aiLabGuard(dt, game, target, d) {
    // Deliberately legible: he backs off, telegraphs, then fires two slow
    // rounds you are meant to learn to parry.
    this.approach(dt, game, target.x, target.y, this.def.keep);
    if (this.fireT <= 0 && d < 220) {
      this.fireT = this.def.fireEvery * rnd(0.9, 1.2);
      this.telegraph = 0.34;
      this.burstN = this.def.burst || 2;
      this.burstT = 0.34;
    }
    if (this.burstN > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstN--;
        this.burstT = 0.18;
        Pattern.aimed(game, this.x, this.y - 8, target.x, target.y - 6, this.def.bulletSpeed || 110, {
          kind: 'dart', damage: 8, offset: rnd(-0.06, 0.06),
        });
        audio.play('rifle', { vol: 0.4 });
      }
    }
  }

  aiTrapper(dt, game, target, d) {
    this.approach(dt, game, target.x, target.y, this.def.keep);
    if (this.fireT <= 0 && d < 260) {
      this.fireT = this.def.fireEvery * rnd(0.9, 1.3);
      if (chance(0.5)) {
        Pattern.aimed(game, this.x, this.y - 8, target.x, target.y - 6, 120, {
          kind: 'net', damage: 6, life: 3,
          extra: { radius: 6, net: true, glow: 'rgba(200,180,120,0.4)' },
        });
        audio.play('lob', { vol: 0.5 });
      } else {
        game.spawnHazard('sawtrap', this.x + rnd(-30, 30), this.y + rnd(-24, 24));
        audio.play('metal', { vol: 0.5 });
      }
    }
  }

  aiLogger(dt, game, target, d) {
    // Loggers prefer trees to ferrets; that is what makes them urgent.
    this.chopT -= dt;
    const tree = game.world.nearestNode(this.x, this.y, 40, (n) => n.def.art === 'tree');
    if (tree && d > 60) {
      this.approach(dt, game, tree.x, tree.y, 14);
      if (this.chopT <= 0 && dist2(this.x, this.y, tree.x, tree.y) < 26 * 26) {
        this.chopT = 0.55;
        this.telegraphed('chop', 0.3);
        audio.play('chop', { vol: 0.6 });
        particles.woodChips(tree.x, tree.y - 8, 5);
        const y = game.world.hitNode(tree, 2);
        if (y) { game.onTreeFelledByEnemy(tree); audio.play('timber', { vol: 0.7 }); }
      }
      return;
    }
    this.approach(dt, game, target.x, target.y, 0);
    if (d < 34 && this.fireT <= 0) {
      this.fireT = this.def.fireEvery;
      this.telegraphed('swing', 0.28);
      Pattern.fan(game, this.x, this.y - 8, target.x, target.y - 6, 5, 0.5, 130, { damage: 12, kind: 'saw', life: 0.55, extra: { spin: 14, radius: 6 } });
      audio.play('metal', { vol: 0.6 });
    }
  }

  aiEnforcer(dt, game, target, d) {
    this.stateT -= dt;
    if (this.state === 'dash') {
      if (this.stateT <= 0) { this.state = 'approach'; this.stateT = rnd(2, 3.5); }
      return;
    }
    this.approach(dt, game, target.x, target.y, this.def.keep);
    if (this.stateT <= 0 && d < 190) {
      this.state = 'dash';
      this.stateT = 0.3;
      const a = Math.atan2(target.y - this.y, target.x - this.x);
      this.vx = Math.cos(a) * 300;
      this.vy = Math.sin(a) * 300;
      audio.play('dash', { vol: 0.6 });
      particles.burst(this.x, this.y, 8, { colors: [P.nestTealHi, P.nestTeal], speed: 70, life: 0.3, additive: true });
    }
    if (this.fireT <= 0 && d < 240) {
      this.fireT = this.def.fireEvery * rnd(0.8, 1.1);
      for (let i = 0; i < 3; i++) {
        Pattern.aimed(game, this.x, this.y - 8, target.x, target.y - 6, 165, {
          kind: 'dart', damage: 10, offset: (i - 1) * 0.1,
          extra: { homing: 1.6, life: 2.6, glow: 'rgba(53,179,171,0.6)' },
        });
      }
      audio.play('rifle', { vol: 0.5 });
    }
  }

  aiTechnician(dt, game, target, d) {
    // Runs away and calls for help.
    this.approach(dt, game, target.x, target.y, this.def.keep + 60);
    if (this.fireT <= 0) {
      this.fireT = this.def.fireEvery;
      if (d < 300 && chance(0.5)) {
        game.callReinforcement(this.x, this.y);
        particles.text(this.x, this.y - 22, 'CALLING IT IN', P.nestEye, { life: 1.2 });
        audio.play('alarm', { vol: 0.4 });
      } else {
        Pattern.aimed(game, this.x, this.y - 8, target.x, target.y - 6, 130, { kind: 'tealOrb', damage: 6 });
      }
    }
  }

  aiDrone(dt, game, target, d) {
    this.hoverAround(dt, game, target.x, target.y, this.def.keep);
    if (this.fireT <= 0 && d < 230) {
      if (this.telegraph <= 0) { this.telegraphed('burst', 0.4); return; }
      if (this.telegraph > 0.02) return;
      this.fireT = this.def.fireEvery * rnd(0.85, 1.2);
      for (let i = 0; i < 3; i++) {
        game.spawnBullet({
          x: this.x, y: this.y + 4, damage: 7, friendly: false, kind: 'tealOrb',
          vx: Math.cos(Math.atan2(target.y - 6 - this.y, target.x - this.x)) * 190,
          vy: Math.sin(Math.atan2(target.y - 6 - this.y, target.x - this.x)) * 190,
          delay: i * 0.09, life: 3,
        });
      }
      audio.play('shoot', { vol: 0.4 });
    }
  }

  aiSpider(dt, game, target, d) {
    this.approach(dt, game, target.x, target.y, this.def.keep);
    if (this.fireT <= 0) {
      if (this.telegraph <= 0) {
        this.telegraphed('ring', 0.55);
        particles.ring(this.x, this.y - 6, 4, 40, 0.5, P.nestEye, 1, true);
        audio.play('alarm', { vol: 0.3 });
        return;
      }
      if (this.telegraph > 0.02) return;
      this.fireT = this.def.fireEvery * rnd(0.85, 1.15);
      Pattern.radial(game, this.x, this.y - 6, 12, 120, { damage: 8, angle: this.spin });
      audio.play('explode', { vol: 0.4 });
      game.r.camera.addShake(1.4);
    }
  }

  aiTurret(dt, game, target, d) {
    this.approach(dt, game, target.x, target.y, this.def.keep);
    this.stateT -= dt;
    if (this.state === 'spray') {
      this.phase += dt * 5.2;
      if (chance(dt * 26)) Pattern.spiral(game, this.x, this.y - 14, 3, 130, this.phase, { damage: 8 });
      if (this.stateT <= 0) { this.state = 'approach'; this.fireT = this.def.fireEvery; }
      return;
    }
    if (this.fireT <= 0 && d < 260) {
      this.state = 'spray';
      this.stateT = 2.2;
      this.telegraphed('spiral', 0.4);
      audio.play('laser', { vol: 0.4 });
    }
  }

  aiHarvester(dt, game, target, d) {
    this.approach(dt, game, target.x, target.y, this.def.keep, 120);
    this.stateT -= dt;
    if (this.state === 'laser') {
      this.phase += dt * 1.1;
      if (chance(dt * 30)) {
        const a = this.laserBase + Math.sin(this.phase) * 0.8;
        game.spawnBullet({
          x: this.x, y: this.y - 14, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
          damage: 11, friendly: false, kind: 'laserBolt', life: 2.4,
        });
      }
      if (this.stateT <= 0) { this.state = 'approach'; this.fireT = this.def.fireEvery; }
      return;
    }
    if (this.fireT <= 0 && d < 280) {
      if (chance(0.55)) {
        this.state = 'laser';
        this.stateT = 2.6;
        this.laserBase = Math.atan2(target.y - this.y, target.x - this.x) - Math.sin(0) * 0.8;
        this.phase = 0;
        this.telegraphed('laser', 0.7);
        audio.play('laser', { vol: 0.6 });
      } else {
        this.fireT = this.def.fireEvery;
        this.telegraphed('mortar', 0.5);
        for (let i = 0; i < 4; i++) {
          const tx = target.x + rnd(-46, 46), ty = target.y + rnd(-40, 40);
          game.spawnMortar(tx, ty, 1.15 + i * 0.14, 34, 22, this);
        }
        audio.play('lob', { vol: 0.6 });
      }
    }
  }

  aiFirebomber(dt, game, target, d) {
    // Circles the treeline and drops incendiaries.
    this.hoverAround(dt, game, target.x, target.y, this.def.keep);
    if (this.fireT <= 0) {
      this.fireT = this.def.fireEvery * rnd(0.8, 1.2);
      this.telegraphed('bomb', 0.35);
      const tx = this.x + rnd(-30, 30), ty = this.y + rnd(10, 40);
      game.spawnFirebomb(tx, ty, 1.0, this);
      audio.play('lob', { vol: 0.6 });
    }
  }

  // --- bosses --------------------------------------------------------------
  aiRipsawPrime(dt, game, target, d) {
    const hpFrac = this.hp / this.maxHp;
    const phase = hpFrac > 0.66 ? 0 : hpFrac > 0.33 ? 1 : 2;
    if (phase !== this.phaseIdx) {
      this.phaseIdx = phase;
      this.state = 'approach';
      this.fireT = 0.8;
      game.bossPhase(this, phase);
    }
    this.stateT -= dt;

    if (this.state === 'charge') {
      if (this.stateT <= 0) {
        this.state = 'approach';
        this.fireT = 0.55;
        // It always leaves something behind when it stops: a ring of debris,
        // so a dodged charge is still a pattern you have to read.
        Pattern.radial(game, this.x, this.y - 8, 10 + phase * 3, 130, { damage: 9, angle: rnd(TAU) });
        game.r.camera.addShake(5);
        audio.play('explode', { vol: 0.5 });
      }
      if (chance(dt * 20)) particles.sparks(this.x + rnd(-16, 16), this.y + 6, 2, P.nestSteelHi);
      // Chews through the treeline as it goes, but on a timer — a per-frame
      // call here would clear-cut the whole forest in a second.
      this.chopT -= dt;
      if (this.chopT <= 0) { this.chopT = 0.2; game.damageTreesAt(this.x, this.y, 26, 1); }
      return;
    }
    if (this.state === 'spin') {
      this.spinPhase += dt * (2.4 + phase * 0.9);
      if (chance(dt * 34)) Pattern.spiral(game, this.x, this.y - 10, 4 + phase, 140, this.spinPhase, { damage: 9 });
      if (this.stateT <= 0) { this.state = 'approach'; this.fireT = 1.0; }
      return;
    }

    this.approach(dt, game, target.x, target.y, this.def.keep, 140);
    if (this.fireT <= 0) {
      const roll = Math.random();
      if (roll < 0.34) {
        this.state = 'charge';
        this.stateT = 1.1;
        this.telegraphed('charge', 0.6);
        const a = Math.atan2(target.y - this.y, target.x - this.x);
        this.vx = Math.cos(a) * 280; this.vy = Math.sin(a) * 280;
        audio.play('roar', { vol: 0.6 });
        game.r.camera.addShake(4);
      } else if (roll < 0.7) {
        this.state = 'spin';
        this.stateT = 2.4 + phase * 0.6;
        this.spinPhase = rnd(TAU);
        this.telegraphed('spiral', 0.5);
        audio.play('laser', { vol: 0.5 });
      } else {
        this.fireT = 2.0;
        Pattern.wave(game, this.x, this.y - 10, 18 + phase * 6, 115, { damage: 9, sine: phase > 1 ? 30 : 0 });
        audio.play('explode', { vol: 0.5 });
      }
    }
  }

  aiKiln(dt, game, target, d) {
    const hpFrac = this.hp / this.maxHp;
    const phase = hpFrac > 0.6 ? 0 : hpFrac > 0.3 ? 1 : 2;
    if (phase !== this.phaseIdx) { this.phaseIdx = phase; game.bossPhase(this, phase); this.fireT = 0.6; }
    this.hoverAround(dt, game, target.x, target.y, this.def.keep);
    this.stateT -= dt;

    if (this.state === 'rain') {
      if (chance(dt * (5 + phase * 4))) {
        game.spawnFirebomb(target.x + rnd(-90, 90), target.y + rnd(-70, 70), 1.2, this);
      }
      if (this.stateT <= 0) { this.state = 'approach'; this.fireT = 2.2; }
      return;
    }
    if (this.fireT <= 0) {
      const roll = Math.random();
      if (roll < 0.45) {
        this.state = 'rain';
        this.stateT = 3.2 + phase;
        this.telegraphed('rain', 0.8);
        audio.play('firewhoosh', { vol: 0.8 });
        game.toast('INCENDIARY RUN INBOUND', P.uiBad, 2.4);
      } else if (roll < 0.75) {
        this.fireT = 2.0;
        Pattern.radial(game, this.x, this.y, 14 + phase * 4, 120, { damage: 9, kind: 'ember', angle: this.spin, extra: { kind: 'ember', glow: 'rgba(255,120,60,0.6)' } });
        audio.play('explode', { vol: 0.5 });
      } else {
        this.fireT = 2.4;
        for (let i = 0; i < 5 + phase * 2; i++) {
          Pattern.aimed(game, this.x, this.y, target.x, target.y, 150, {
            kind: 'ember', damage: 8, offset: rnd(-0.4, 0.4), extra: { delay: i * 0.07, sine: 24 },
          });
        }
        audio.play('laserfire', { vol: 0.5 });
      }
    }
  }

  aiMotherNest(dt, game, target, d) {
    const hpFrac = this.hp / this.maxHp;
    const phase = hpFrac > 0.7 ? 0 : hpFrac > 0.4 ? 1 : 2;
    if (phase !== this.phaseIdx) {
      this.phaseIdx = phase;
      game.bossPhase(this, phase);
      this.fireT = 1.2;
      // it sheds its escort every time the egg cracks further
      for (let i = 0; i < 3 + phase * 2; i++) {
        game.spawnEnemy(pick(['drone', 'spider', 'enforcer']), this.x + rnd(-70, 70), this.y + rnd(-50, 50), this.level);
      }
    }
    this.stateT -= dt;
    this.approach(dt, game, target.x, target.y, this.def.keep, 90);

    if (this.state === 'flower') {
      this.spinPhase += dt * 1.6;
      if (chance(dt * 22)) Pattern.flower(game, this.x, this.y - 10, 6 + phase * 2, 105, this.spinPhase, { damage: 10 });
      if (this.stateT <= 0) { this.state = 'approach'; this.fireT = 1.6; }
      return;
    }
    if (this.state === 'sweep') {
      this.phase += dt * 2.2;
      if (chance(dt * 40)) {
        for (const side of [-1, 1]) {
          const a = Math.atan2(target.y - this.y, target.x - this.x) + Math.sin(this.phase) * 0.9 * side;
          game.spawnBullet({
            x: this.x + side * 24, y: this.y - 6, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
            damage: 12, friendly: false, kind: 'laserBolt', life: 2.6,
          });
        }
      }
      if (this.stateT <= 0) { this.state = 'approach'; this.fireT = 2.0; }
      return;
    }

    if (this.fireT <= 0) {
      const roll = Math.random();
      if (roll < 0.3) {
        this.state = 'flower';
        this.stateT = 3.4;
        this.spinPhase = rnd(TAU);
        this.telegraphed('flower', 0.7);
        audio.play('laser', { vol: 0.6 });
      } else if (roll < 0.6) {
        this.state = 'sweep';
        this.stateT = 2.8;
        this.phase = 0;
        this.telegraphed('laser', 0.8);
        audio.play('laser', { vol: 0.7 });
      } else if (roll < 0.82) {
        this.fireT = 2.4;
        this.telegraphed('mortar', 0.7);
        for (let i = 0; i < 8; i++) game.spawnMortar(target.x + rnd(-100, 100), target.y + rnd(-80, 80), 1.2 + i * 0.1, 36, 24, this);
        audio.play('lob', { vol: 0.7 });
      } else {
        this.fireT = 2.6;
        Pattern.wave(game, this.x, this.y - 6, 26 + phase * 8, 110, { damage: 10, sine: 20 });
        audio.play('explode', { vol: 0.6 });
        game.r.camera.addShake(4);
      }
    }
  }

  // --- damage & death ------------------------------------------------------
  damage(n, game, bullet = null, silent = false) {
    if (this.dead) return 0;
    let dmg = n;
    if (this.markT > 0) dmg *= 1.2;
    // Scripted ceramic plate: the hit lands, the damage does not.
    if (this.armour) {
      dmg *= this.armour;
      if (!silent && chance(0.5)) {
        particles.text(this.x, this.y - 22, 'PLATE', P.uiDim, { life: 0.6 });
        audio.play('metal', { vol: 0.35 });
      }
    }
    this.hp -= dmg;
    this.hurtT = 0.14;
    if (bullet) {
      this.lastHitBy = bullet.owner || null;
      if (bullet.knock) {
        const a = Math.atan2(bullet.vy, bullet.vx);
        const mass = this.def.boss ? 0.12 : this.def.hp > 200 ? 0.3 : 1;
        this.vx += Math.cos(a) * bullet.knock * mass;
        this.vy += Math.sin(a) * bullet.knock * mass;
      }
      if (bullet.burn) this.burnT = Math.max(this.burnT, 2.4);
      if (bullet.scald) this.stunT = Math.max(this.stunT, 0.18);
    }
    if (!silent) {
      if (this.def.machine) { audio.play('metal', { vol: 0.45 }); particles.sparks(this.x + rnd(-4, 4), this.y - 6, 4, P.nestSteelHi); }
      else { audio.play('flesh', { vol: 0.45 }); particles.blood(this.x + rnd(-3, 3), this.y - 6, 4); }
      // What the hit was actually worth.
      //
      // Without a number the only feedback is a flash, so a graze and a
      // perfect-dodge counter that pays triple look identical — which makes
      // every skill in the game invisible. Big hits are bigger and warmer.
      const shown = Math.max(1, Math.round(dmg));
      const heavy = shown >= 40;
      particles.text(this.x + rnd(-4, 4), this.y - 16, String(shown),
        heavy ? P.sulfurHi : shown >= 18 ? P.ui : P.uiDim,
        { life: heavy ? 0.85 : 0.55, vy: heavy ? -34 : -22 });
    }
    if (this.hp <= 0) this.die(game);
    return dmg;
  }

  die(game) {
    if (this.dead) return;
    this.dead = true;
    const def = this.def;
    if (def.machine) {
      audio.play(def.boss ? 'bigexplode' : 'explode');
      particles.scrap(this.x, this.y - 6, def.boss ? 40 : 14);
      particles.burst(this.x, this.y - 6, def.boss ? 40 : 16, { colors: [P.fire1, P.fire2, P.fire3], speed: def.boss ? 220 : 130, life: 0.8, additive: true, vz: 130 });
      particles.smoke(this.x, this.y - 6, def.boss ? 20 : 8, { life: 2.4, size: 3 });
      particles.ring(this.x, this.y - 6, 6, def.boss ? 140 : 46, 0.5, P.fire2, 2, true);
      game.r.camera.addShake(def.boss ? 12 : 3.5);
    } else {
      audio.play('flesh', { vol: 0.9 });
      particles.blood(this.x, this.y - 6, 16);
      game.r.camera.addShake(1.5);
    }
    game.onEnemyKilled(this);
  }

  // --- drawing -------------------------------------------------------------
  draw(r, game) {
    if (this.dead) return;
    const img = this.sprite;
    if (!img) return;
    const flying = this.def.flying;
    const hoverY = flying ? -14 - Math.sin(this.hover) * 2 : 0;

    r.shadow(this.x, this.y, this.r * (flying ? 0.7 : 1), this.r * 0.4, flying ? 0.18 : 0.3);

    // spawn-in warp
    if (this.spawnT > 0) {
      const t = 1 - this.spawnT / 0.45;
      r.ring(this.x, this.y, this.r + 20 * (1 - t), P.nestEye, 2, t);
      r.drawT(img, this.x, this.y - img.height / 2 + hoverY, 0, this.facing < 0 ? -1 : 1, clamp(t * 1.4, 0.05, 1), t);
      return;
    }

    let out = img;
    if (this.hurtT > 0) {
      const f = this.frames;
      out = flashFrames('enemy:' + this.kind + this.anim + this.view, f, '#ffffff')[Math.floor(this.animT * f.length) % f.length];
    } else if (this.charmT > 0 && Math.floor(game.time * 8) % 2 === 0) {
      const f = this.frames;
      out = flashFrames('enemy:charm:' + this.kind + this.anim + this.view, f, P.cyber)[Math.floor(this.animT * f.length) % f.length];
    }

    const flip = this.def.art === 'critter' && this.facing < 0;
    r.draw(out, this.x - out.width / 2, this.y - out.height + (flying ? 0 : 2) + hoverY, flip);

    // telegraph flare: the visual promise that something is about to happen
    if (this.telegraph > 0) {
      const t = this.telegraph;
      r.ring(this.x, this.y - 8 + hoverY, this.r + 6 + (1 - t) * 6, P.nestEye, 1, clamp(t * 2, 0, 0.9));
      r.glow(this.x, this.y - 8 + hoverY, 20, 'rgba(255,70,55,0.5)', 0.8);
    }
    if (this.burnT > 0) r.glow(this.x, this.y - 8 + hoverY, 16, 'rgba(255,140,60,0.6)', 0.8);
    if (this.markT > 0) {
      r.ring(this.x, this.y - 8 + hoverY, this.r + 4, P.cyber, 1, 0.5 + Math.sin(game.time * 8) * 0.3);
    }

    // health pip for anything tough (bosses use the top bar instead)
    if (!this.def.boss && this.hp < this.maxHp) {
      const w = Math.max(10, this.r * 2);
      const frac = clamp(this.hp / this.maxHp, 0, 1);
      const by = this.y - out.height - 3 + hoverY;
      r.rect(this.x - w / 2, by, w, 2, 'rgba(0,0,0,0.6)');
      r.rect(this.x - w / 2, by, w * frac, 2, this.def.machine ? P.nestTealHi : P.hpRed);
    }
  }

  drawLight(r) {
    if (this.def.machine) r.light(this.x, this.y - 8, 40, 'rgba(255,90,70,0.5)', 0.5);
    if (this.burnT > 0) r.light(this.x, this.y - 8, 40, 'rgba(255,150,70,0.8)', 0.7);
  }
}

// --------------------------------------------------------------------- wreck
/**
 * What a machine leaves behind. Walk up and press E to rip the chip out of its
 * skull — the game's whole progression system in one interaction.
 */
export class Wreck {
  constructor(x, y, species, chipKey, scrap) {
    this.x = x; this.y = y;
    this.species = species;
    this.chipKey = chipKey;
    this.scrap = scrap;
    this.t = rnd(TAU);
    this.dead = false;
    this.looted = false;
    this.life = 90;
    this.objType = 'wreck';
    this.r = 10;
  }

  update(dt, game) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (chance(dt * 2.2)) particles.sparks(this.x + rnd(-6, 6), this.y - rnd(0, 8), 2, P.nestSteelHi);
    if (chance(dt * 1.1)) particles.smoke(this.x + rnd(-4, 4), this.y - 4, 1, { life: 1.6 });
  }

  loot(game) {
    if (this.looted) return;
    this.looted = true;
    this.dead = true;
    const p = game.player;
    if (this.chipKey) {
      game.pickups.drop('chip', this.chipKey, this.x, this.y - 6, { vz: 120 });
      particles.chipSpark(this.x, this.y - 6);
      particles.ring(this.x, this.y - 6, 4, 30, 0.4, P.cyber, 2, true);
      audio.play('chip');
    }
    for (let i = 0; i < this.scrap; i++) {
      game.pickups.drop('resource', 'scrap', this.x + rnd(-4, 4), this.y + rnd(-3, 3), { count: 1 });
    }
    audio.play('metal', { vol: 0.6 });
    game.r.camera.addShake(1.2);
  }

  draw(r, game) {
    const f = machineFrames(this.species);
    const img = f[0];
    // slumped, darkened husk
    const tilt = 0.5 + Math.sin(this.t * 0.6) * 0.02;
    r.shadow(this.x, this.y, 10, 4, 0.32);
    r.ctx.globalAlpha = this.life < 6 ? clamp(this.life / 6, 0.2, 1) : 1;
    r.drawT(img, this.x, this.y - img.height * 0.3, tilt, 0.9, 0.7, 0.75);
    r.ctx.globalAlpha = 1;
    if (this.chipKey) {
      const pulse = 0.5 + Math.sin(this.t * 5) * 0.4;
      r.glow(this.x, this.y - 8, 14, 'rgba(77,225,255,0.55)', pulse);
    }
  }
}
