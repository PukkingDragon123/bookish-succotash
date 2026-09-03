// Wildlife: the animals themselves, their trust in you, and what they do about
// it. Most creatures out here run from a firefight. A few do not, and those are
// the ones worth feeding.
//
// Trust is earned by hand — food, medicine, and pulling them out of a burning
// treeline. Past a threshold an animal follows you; past a second one it fights
// like it means it. Tools bolted on top change what it can do at all.

import { BEASTS, TEMPER } from '../art/beastiary.js';
import { beastFrames, beastSize } from '../art/animals.js';
import { BeastRig } from '../art/beastrig.js';
import { factionOf } from '../systems/factions.js';
import { bugFrames, bugGlow, FLYING_BUGS, fishFrames } from '../art/bugs.js';
import { P } from '../art/palette.js';
import { flashFrames } from '../art/pixel.js';
import { TAU, clamp, dist2, angleDiff } from '../engine/math.js';
import { rnd, pick, chance, makeRng } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { TS, isWater, isSolid, TILES } from '../world/tiles.js';
import { TOOLS } from '../systems/tools.js';

const SIM_RADIUS = 460;
export const TRUST_BOND = 50;      // follows you
export const TRUST_DEVOTED = 100;  // fights like it means it

let animalId = 1;

export class Animal {
  constructor(key, x, y) {
    this.id = animalId++;
    this.key = key;
    this.def = BEASTS[key];
    this.cfg = this.def.cfg;
    this.x = x; this.y = y;
    this.hx = x; this.hy = y;
    this.vx = 0; this.vy = 0;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.state = 'graze';
    this.stateT = rnd(1, 4);
    this.facing = chance(0.5) ? 1 : -1;
    this.view = 'front';
    this.anim = 'idle';
    this.animT = rnd(1);
    this.dir = rnd(TAU);
    this.trapped = false;
    this.dead = false;
    this.hurtT = 0;
    this.panicT = 0;
    this.objType = 'animal';
    this.bob = rnd(TAU);
    this.r = this.def.r;

    // relationship
    this.trust = 0;
    this.bonded = false;
    this.devoted = false;
    this.fedT = 0;
    this.tools = [];
    this.downT = 0;

    // orders
    this.order = 'follow';
    this.orderX = x; this.orderY = y;
    this.orderTarget = null;
    this.selected = false;

    // combat
    this.atkCd = rnd(0.5, 2);
    this.abilityCd = rnd(2, 6);
    this.chargeT = 0;
    this.curlT = 0;

    // Solved live, like the ferret. The baked sprite sheets are gone: an
    // animal's walk is now a consequence of how far it actually moved, so it
    // can never drift out of step with its own feet.
    this.rig = new BeastRig(this.cfg, this.def);
    const s = this.rig.size();
    this.w = s.w; this.h = s.h;
  }

  get name() { return this.nick || this.def.name; }
  get fights() {
    if (!this.bonded) return false;
    return [TEMPER.BOLD, TEMPER.DEFENSIVE, TEMPER.PACK, TEMPER.AGGRO].includes(this.def.temper)
      || this.hasTool('harness');
  }
  hasTool(k) { return this.tools.includes(k); }

  get statMult() { return this.devoted ? 1.5 : this.bonded ? 1.15 : 1; }
  get speedStat() {
    let s = this.def.speed * (this.devoted ? 1.12 : 1);
    if (this.hasTool('plate')) s *= 0.78;
    return s;
  }
  get maxHpStat() {
    let h = this.def.hp * this.statMult;
    if (this.hasTool('plate')) h += 60;
    return h;
  }

  /** Kept for anything that still wants a still frame (the bestiary UI). */
  frames(anim, view, expr) {
    return beastFrames('b:' + this.key, this.cfg, anim, view, 8, expr || this.expression);
  }

  /**
   * What its face is doing. Read off its situation rather than stored, so an
   * animal that has just been shot at looks like one without anything having
   * to remember to set a flag.
   */
  get expression() {
    if (this.dead) return 'dead';
    if (this.downT > 0) return 'hurt';
    if (this.hp < this.maxHpStat * 0.35) return 'hurt';
    if (this.state === 'panic' || this.state === 'flee') return 'afraid';
    if (this.state === 'attack' || this.anim === 'attack' || this.anim === 'charge') return 'angry';
    if (this.hurtT > 0.05) return 'hurt';
    if (this.devoted && this.order === 'follow') return 'happy';
    if (this.state === 'alert' || this.anim === 'alert') return 'alert';
    if (this.anim === 'sniff') return 'curious';
    if (this.bonded) return 'happy';
    return 'calm';
  }

  get sprite() {
    const fr = this.frames(this.anim, this.view);
    return fr[Math.floor(this.animT * fr.length) % fr.length];
  }

  // --- relationship --------------------------------------------------------
  addTrust(n, game, reason) {
    if (this.dead) return;
    // Helping one animal is noticed by the rest of its kind. A tenth of the
    // trust bleeds outward, which is slow — an alliance should take a while.
    if (n > 0 && game && game.alliances) {
      const f = factionOf(this.key);
      if (f) game.alliances.add(f, n * 0.06, null);
    }
    const before = this.trust;
    this.trust = clamp(this.trust + n * (n > 0 ? this.def.trustRate : 1), 0, TRUST_DEVOTED);
    if (n > 0) {
      particles.text(this.x, this.y - this.h - 2, '+' + Math.round(n * this.def.trustRate) + ' TRUST', P.favor, { life: 1 });
      for (let i = 0; i < 5; i++) {
        particles.spawn({
          x: this.x + rnd(-5, 5), y: this.y - 8, z: rnd(0, 6),
          vx: rnd(-8, 8), vy: rnd(-14, -4), vz: rnd(10, 26),
          life: rnd(0.6, 1.1), size: 1, colors: [P.favor, '#ffe9a8'], additive: true, gravity: -12,
        });
      }
    } else if (n < 0) {
      particles.text(this.x, this.y - this.h - 2, Math.round(n) + ' TRUST', P.uiBad, { life: 1 });
    }
    if (!this.bonded && this.trust >= TRUST_BOND) {
      this.bonded = true;
      this.order = 'follow';
      audio.play('recruit');
      particles.ring(this.x, this.y - 6, 4, 34, 0.6, P.favor, 2, true);
      game.onAnimalBonded(this);
    }
    if (!this.devoted && this.trust >= TRUST_DEVOTED) {
      this.devoted = true;
      this.hp = this.maxHpStat;
      audio.play('levelup');
      game.toast(this.name.toUpperCase() + ' IS DEVOTED  -  ' + this.def.ability.toUpperCase(), P.favor, 4);
    }
    if (this.trust < TRUST_BOND && before >= TRUST_BOND) this.bonded = false;
  }

  /** Hand-feeding. The only way most of these will ever come near you. */
  feed(item, game) {
    if (!this.def.likes.includes(item)) return false;
    this.fedT = 2.4;
    this.panicT = 0;
    this.state = 'graze';
    this.addTrust(18, game, 'fed');
    audio.play('pick');
    particles.burst(this.x, this.y - 6, 8, { colors: [P.berryHi, P.favor], speed: 40, life: 0.5, vz: 30 });
    return true;
  }

  giveTool(key, game) {
    if (this.tools.includes(key)) return false;
    const t = TOOLS[key];
    if (!t || !t.animal) return false;
    this.tools.push(key);
    this.hp = Math.min(this.maxHpStat, this.hp + 40);
    this.addTrust(10, game, 'tool');
    audio.play('craft');
    particles.ring(this.x, this.y - 6, 3, 26, 0.5, t.color, 2, true);
    game.toast(this.name.toUpperCase() + ' FITTED WITH ' + t.name.toUpperCase(), t.color, 3);
    return true;
  }

  // --- update --------------------------------------------------------------
  update(dt, game) {
    if (this.dead) return;
    // Somebody else is flying this one. Pip walks his own beats during the
    // arrival, and the grazing AI would only pull him back into the trees.
    if (this.scripted) { this.animT = (this.animT || 0) + dt; return; }
    const world = game.world;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.stateT -= dt;
    this.panicT = Math.max(0, this.panicT - dt);
    this.fedT = Math.max(0, this.fedT - dt);
    this.atkCd -= dt;
    this.abilityCd -= dt;
    this.curlT = Math.max(0, this.curlT - dt);

    if (this.downT > 0) {
      this.downT -= dt;
      this.anim = 'dead';
      if (this.downT <= 0) { this.hp = this.maxHpStat * 0.4; }
      return;
    }

    if (this.trapped) return this.updateTrapped(dt, game);

    const p = game.player;
    const fireHere = game.fire.burnAtPx(this.x, this.y);
    const nearFire = game.fire.active && game.fireNear(this.x, this.y, 90);
    if (fireHere > 0) {
      this.hp -= dt * 6;
      if (chance(dt * 3)) particles.embers(this.x, this.y - 4, 1);
    }

    if (this.bonded) this.updateCompanion(dt, game, nearFire || fireHere > 0);
    else this.updateWild(dt, game, fireHere, nearFire);

    this._move(dt, world);
    this._animate(dt, game);
    if (this.hp <= 0) this.die(game);
  }

  updateTrapped(dt, game) {
    this.anim = 'sit';
    this.animT = (this.animT + dt * 1.6) % 1;
    if (game.fire.burnAtPx(this.x, this.y) > 0) this.hp -= dt * 4;
    if (chance(dt * 2.2)) particles.text(this.x, this.y - this.h - 2, '!', P.uiBad, { life: 0.7, vy: -14 });
    if (this.hp <= 0) this.die(game, true);
  }

  // --- wild behaviour ------------------------------------------------------
  updateWild(dt, game, fireHere, nearFire) {
    const p = game.player;
    const temper = this.def.temper;
    const dPlayer = Math.sqrt(dist2(this.x, this.y, p.x, p.y));
    let flee = null;
    let speed = 0;

    const threat = game.nearestEnemy(this.x, this.y, temper === TEMPER.AGGRO ? 200 : 130);

    if (fireHere > 0 || nearFire) {
      this.state = 'panic';
      this.panicT = 2.2;
      flee = game.nearestFire(this.x, this.y, 160);
    } else if (threat && (temper === TEMPER.AGGRO || (temper === TEMPER.DEFENSIVE && Math.sqrt(dist2(this.x, this.y, threat.x, threat.y)) < 70))) {
      // Some animals do not run. They come to meet it.
      this.state = 'fight';
      this.target = threat;
    } else if (threat) {
      this.state = 'flee';
      flee = threat;
    } else if (this.fedT > 0) {
      this.state = 'graze';
    } else if (dPlayer < (temper === TEMPER.FLEE ? 78 : temper === TEMPER.SKITTISH ? 52 : 30) && !this.def.kin && this.trust < 30) {
      this.state = 'flee';
      flee = p;
    } else if (this.panicT > 0) {
      this.state = 'panic';
    } else if (this.stateT <= 0) {
      // A wider idle repertoire, weighted so an animal mostly does the thing
      // its species actually does all day.
      const roll = chance(0.42) ? 'graze'
        : chance(0.45) ? 'wander'
        : chance(0.4) ? 'alert'
        : chance(0.5) ? 'sniff'
        : chance(0.6) ? 'groom' : 'shake';
      this.state = roll;
      this.stateT = rnd(1.8, 5);
      this.dir = rnd(TAU);
    }

    switch (this.state) {
      case 'graze': this.anim = 'graze'; break;
      case 'alert': this.anim = 'alert'; break;
      // standing behaviours: no movement, just something to watch
      case 'sniff': this.anim = 'sniff'; break;
      case 'groom': this.anim = 'groom'; break;
      case 'shake': this.anim = 'shake'; break;
      case 'wander': {
        speed = this.speedStat * 0.36;
        const home = Math.atan2(this.hy - this.y, this.hx - this.x);
        const d = Math.sqrt(dist2(this.x, this.y, this.hx, this.hy));
        if (d > 190) this.dir += clamp(angleDiff(this.dir, home), -dt * 2, dt * 2);
        else this.dir += rnd(-1, 1) * dt * 1.6;
        this.anim = 'walk';
        break;
      }
      case 'flee':
      case 'panic':
        speed = this.speedStat * (this.state === 'panic' ? 1.15 : 1);
        if (flee) this.dir = Math.atan2(this.y - flee.y, this.x - flee.x) + rnd(-0.4, 0.4);
        this.anim = 'run';
        if (this.state === 'panic' && chance(dt * 1.4)) {
          particles.text(this.x, this.y - this.h, '!', P.uiWarn, { life: 0.6, vy: -18 });
        }
        break;
      case 'fight':
        speed = this.attackRun(dt, game, this.target);
        break;
      default: break;
    }
    this.vx = Math.cos(this.dir) * speed;
    this.vy = Math.sin(this.dir) * speed;
  }

  // --- companion behaviour -------------------------------------------------
  updateCompanion(dt, game, inFire) {
    const p = game.player;
    let speed = 0;
    let target = null;

    if (this.order === 'attack' && this.orderTarget && !this.orderTarget.dead) {
      target = this.orderTarget;
    } else if (this.fights) {
      const range = this.def.role === 'flyer' ? 320 : 240;
      target = game.nearestEnemy(this.x, this.y, range);
    }

    if (inFire) {
      // Even a devoted animal will not stand in a fire for you.
      const f = game.nearestFire(this.x, this.y, 140);
      if (f) {
        this.dir = Math.atan2(this.y - f.y, this.x - f.x);
        this.vx = Math.cos(this.dir) * this.speedStat;
        this.vy = Math.sin(this.dir) * this.speedStat;
        this.anim = 'run';
        return;
      }
    }

    if (this.order === 'hold') {
      const d = Math.sqrt(dist2(this.x, this.y, this.orderX, this.orderY));
      if (d > 14) {
        this.dir = Math.atan2(this.orderY - this.y, this.orderX - this.x);
        speed = this.speedStat * 0.9;
        this.anim = 'run';
      } else {
        this.anim = target ? 'alert' : 'idle';
        if (target) this.shootAt(dt, game, target);
      }
    } else if (this.order === 'move') {
      const d = Math.sqrt(dist2(this.x, this.y, this.orderX, this.orderY));
      if (d > 14) {
        this.dir = Math.atan2(this.orderY - this.y, this.orderX - this.x);
        speed = this.speedStat;
        this.anim = 'run';
      } else {
        this.order = 'hold';
        this.anim = 'idle';
      }
    } else if (target) {
      speed = this.attackRun(dt, game, target);
    } else {
      // loose formation behind the player
      const a = (this.id * 1.9) % TAU;
      const spot = { x: p.x + Math.cos(a) * (26 + this.r * 1.6), y: p.y + Math.sin(a) * (20 + this.r) };
      const d = Math.sqrt(dist2(this.x, this.y, spot.x, spot.y));
      if (d > 18) {
        this.dir = Math.atan2(spot.y - this.y, spot.x - this.x);
        speed = d > 120 ? this.speedStat * 1.25 : this.speedStat * 0.62;
        this.anim = d > 120 ? 'run' : 'walk';
      } else {
        this.anim = 'idle';
      }
    }

    this.vx = Math.cos(this.dir) * speed;
    this.vy = Math.sin(this.dir) * speed;
    if (this.chargeT > 0) {
      this.chargeT -= dt;
      game.damageEnemiesAt(this.x, this.y, this.r + 12, 60 * dt * this.statMult, this);
      if (chance(dt * 26)) particles.dust(this.x, this.y, 2, P.dirtLight);
    }
    this.useAbility(dt, game, target);
  }

  /** Close and hit. Returns the speed to move at. */
  attackRun(dt, game, target) {
    if (!target) return 0;
    const reach = this.def.role === 'flyer' ? 26 : this.r + target.r + 8;
    const d = Math.sqrt(dist2(this.x, this.y, target.x, target.y));
    this.dir = Math.atan2(target.y - this.y, target.x - this.x);
    this.facing = target.x > this.x ? 1 : -1;

    if (this.hasTool('harness') && d < 190) {
      this.anim = 'alert';
      this.shootAt(dt, game, target);
      return d > 120 ? this.speedStat * 0.7 : 0;
    }
    if (d <= reach) {
      this.anim = 'attack';
      if (this.atkCd <= 0) {
        this.atkCd = 0.9;
        const dmg = (10 + this.def.mass * 6) * this.statMult * (this.hasTool('chip') ? 1.5 : 1);
        target.damage(dmg, game, { vx: Math.cos(this.dir), vy: Math.sin(this.dir), knock: 40 + this.def.mass * 26, owner: this, melee: true });
        particles.burst(target.x, target.y - 6, 6, { colors: ['#ffffff', P.hpRed], speed: 90, life: 0.3, additive: true });
        audio.play('flesh', { vol: 0.4 });
        game.r.camera.addShake(this.def.mass * 0.5);
      }
      return 0;
    }
    this.anim = 'run';
    return this.speedStat * 1.05;
  }

  shootAt(dt, game, target) {
    if (this.atkCd > 0) return;
    this.atkCd = 0.7;
    game.spawnAllyBullet(this, target, 'pellet', 12 * this.statMult, 280);
    audio.play('shoot', { vol: 0.25 });
  }

  /** The one thing this species is uniquely good at. Devotion unlocks it. */
  useAbility(dt, game, target) {
    if (!this.devoted || this.abilityCd > 0) return;
    const ab = this.def.ability;
    switch (ab) {
      case 'stampede':
      case 'ram':
      case 'gore':
      case 'maul':
        if (!target) return;
        this.abilityCd = 7;
        this.chargeT = 0.8;
        this.dir = Math.atan2(target.y - this.y, target.x - this.x);
        this.vx = Math.cos(this.dir) * 320;
        this.vy = Math.sin(this.dir) * 320;
        audio.play('roar', { vol: 0.5 });
        particles.text(this.x, this.y - this.h, ab.toUpperCase(), P.uiWarn, { life: 0.9 });
        break;
      case 'houndPack': {
        // stronger with every other wolf in earshot
        let pack = 0;
        for (const a of game.wildlife.animals) {
          if (a !== this && a.key === this.key && !a.dead && dist2(a.x, a.y, this.x, this.y) < 140 * 140) pack++;
        }
        if (!target || pack === 0) return;
        this.abilityCd = 6;
        game.markEnemies(target.x, target.y, 90, 4);
        particles.ring(this.x, this.y - 6, 6, 90, 0.5, P.cyber, 1, true);
        particles.text(this.x, this.y - this.h, 'PACK x' + (pack + 1), P.cyber, { life: 0.9 });
        break;
      }
      case 'curl':
        if (game.bullets.count > 40) {
          this.abilityCd = 8;
          this.curlT = 4;
          particles.ring(this.x, this.y - 4, 3, 22, 0.4, P.uiWarn, 2, false);
        }
        break;
      case 'whistle':
      case 'bugle':
      case 'call':
      case 'squeak':
        this.abilityCd = 12;
        game.markEnemies(this.x, this.y, 260, 6);
        game.rallyBonus(6);
        particles.ring(this.x, this.y - 6, 6, 260, 0.9, P.favor, 1, true);
        particles.text(this.x, this.y - this.h, ab.toUpperCase(), P.favor, { life: 1.2 });
        audio.play('alarm', { vol: 0.4 });
        break;
      case 'stash':
        this.abilityCd = 16;
        game.pickups.drop('resource', pick(['wood', 'berries', 'fiber', 'scrap']), this.x, this.y, { count: 2 });
        particles.text(this.x, this.y - this.h, 'STASH', P.uiGood, { life: 0.9 });
        break;
      case 'damBuild':
        this.abilityCd = 20;
        game.buildBarricadeAt(this.x + rnd(-20, 20), this.y + rnd(-16, 16));
        particles.text(this.x, this.y - this.h, 'DAM', P.barkLight, { life: 0.9 });
        break;
      case 'divebomb':
      case 'talons':
        if (!target) return;
        this.abilityCd = 6;
        target.damage(40 * this.statMult, game, { vx: 0, vy: 1, knock: 80, owner: this });
        this.x = target.x; this.y = target.y - 4;
        particles.burst(target.x, target.y - 8, 12, { colors: ['#ffffff', P.nestSteelHi], speed: 120, life: 0.4, additive: true });
        audio.play('metal', { vol: 0.5 });
        break;
      case 'thieve':
        if (!target) return;
        this.abilityCd = 10;
        game.pickups.drop('resource', 'ammo', target.x, target.y, { count: 3 });
        particles.text(target.x, target.y - 18, 'LIFTED', P.uiGood, { life: 0.9 });
        break;
      case 'outrun':
      case 'zigzag':
      case 'slip':
      case 'pounce':
      case 'harry':
        if (!target) return;
        this.abilityCd = 5;
        game.markEnemies(target.x, target.y, 40, 4);
        break;
      default: break;
    }
  }

  // --- physics & anim ------------------------------------------------------
  _move(dt, world) {
    const ahead = 14;
    const tx = this.x + Math.cos(this.dir) * ahead, ty = this.y + Math.sin(this.dir) * ahead;
    const t = world.tileAtPx(tx, ty);
    const bad = isSolid(t) || (isWater(t) && !this.def.water && !this.def.flying) || TILES[t].hot;
    if (bad) this.dir += (chance(0.5) ? 1 : -1) * dt * 6;

    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const nt = world.tileAtPx(nx, ny);
    if (!isSolid(nt) && (this.def.flying || this.def.water || !TILES[nt].deep)) {
      this.x = clamp(nx, 8, world.pxW - 8);
      this.y = clamp(ny, 8, world.pxH - 8);
    } else {
      this.dir += Math.PI * 0.6;
    }
  }

  _animate(dt, game) {
    if (Math.abs(this.vx) > 1) this.facing = this.vx > 0 ? 1 : -1;
    this.view = this.vy < -6 ? 'back' : 'front';
    const rate = this.anim === 'run' ? 1.9 : this.anim === 'walk' ? 1.1 : this.anim === 'attack' ? 2.2 : 0.5;
    this.animT = (this.animT + dt * rate) % 1;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 8 && chance(dt * 5)) {
      particles.dust(this.x, this.y + 1, 1, TILES[game.world.tileAtPx(this.x, this.y)].dark || P.dirt);
    }
  }

  // --- damage --------------------------------------------------------------
  damage(n, game, byPlayer = false) {
    if (this.dead || this.downT > 0) return;
    if (this.curlT > 0) n *= 0.25;
    this.hp -= n;
    this.hurtT = 0.22;
    this.panicT = 4;
    if (!this.bonded) this.state = this.def.temper === TEMPER.AGGRO ? 'fight' : 'panic';
    particles.blood(this.x, this.y - 6, 5);
    audio.play('flesh', { vol: 0.5 });
    if (byPlayer) this.addTrust(-25, game, 'shot');
    if (this.hp <= 0) {
      if (this.bonded) {
        // Companions go down rather than die; you can get them back up.
        this.hp = 0;
        this.downT = 16;
        game.toast(this.name.toUpperCase() + ' IS DOWN', P.uiBad, 3);
        particles.blood(this.x, this.y - 6, 12);
      } else {
        this.die(game);
      }
    }
  }

  heal(n) { this.hp = Math.min(this.maxHpStat, this.hp + n); }

  die(game, byFire = false) {
    if (this.dead) return;
    this.dead = true;
    particles.blood(this.x, this.y - 5, 12);
    game.onAnimalLost(this, byFire);
  }

  // --- drawing -------------------------------------------------------------
  draw(r, game) {
    if (this.dead) return;
    const flying = this.def.flying;
    const yOff = flying ? -10 - Math.sin(this.bob + game.time * 3) * 2 : 0;

    r.shadow(this.x, this.y, this.r + 1, (this.r + 1) * 0.38, flying ? 0.18 : 0.3);

    // The rig is solved from the animal's own movement, so it only needs to be
    // told where the animal is and what it is doing.
    this.rig.update(game.dt || 1 / 60, {
      x: this.x, y: this.y, vx: this.vx || 0, vy: this.vy || 0,
      facing: this.facing < 0 ? -1 : 1,
      anim: this.anim,
      downed: this.downT > 0,
    });
    const hurtFlash = this.hurtT > 0 && Math.floor(this.hurtT * 30) % 2 === 0;
    this.rig.draw(r, this.x, this.y + yOff, {
      facing: this.facing < 0 ? -1 : 1,
      flash: hurtFlash,
    });

    this.drawTools(r, game, yOff);

    const headY = this.y - this.h + yOff - 3;
    if (this.trapped) {
      r.ring(this.x, this.y - 6, 12, P.uiWarn, 1, 0.5 + Math.sin(game.time * 7) * 0.4);
    }
    if (this.downT > 0) {
      r.ring(this.x, this.y - 4, 12, P.uiBad, 1, 0.5 + Math.sin(game.time * 6) * 0.4);
      return;
    }
    if (this.curlT > 0) {
      r.ring(this.x, this.y - 5, this.r + 5, P.uiWarn, 2, 0.6);
    }

    // trust / selection markers
    if (this.bonded) {
      const col = this.devoted ? P.favor : P.uiAccent;
      r.rect(this.x - 2, headY, 4, 1, col);
      r.rect(this.x - 1, headY + 1, 2, 1, col);
      if (this.hp < this.maxHpStat) {
        const w = 14, frac = clamp(this.hp / this.maxHpStat, 0, 1);
        r.rect(this.x - w / 2, headY + 3, w, 2, 'rgba(0,0,0,0.6)');
        r.rect(this.x - w / 2, headY + 3, w * frac, 2, P.uiGood);
      }
      if (this.selected) r.ring(this.x, this.y, this.r + 4, P.favor, 1, 0.7);
      if (this.order === 'hold') r.rect(this.x + 5, headY, 2, 2, P.uiWarn);
    } else if (this.trust > 0) {
      const w = 12, frac = this.trust / TRUST_BOND;
      r.rect(this.x - w / 2, headY + 2, w, 2, 'rgba(0,0,0,0.5)');
      r.rect(this.x - w / 2, headY + 2, w * clamp(frac, 0, 1), 2, P.favor);
    }
  }

  /** Kit strapped to an animal, drawn over the coat. */
  drawTools(r, game, yOff) {
    if (!this.tools.length) return;
    const bx = this.x, by = this.y - this.h * 0.42 + yOff;
    for (const k of this.tools) {
      const t = TOOLS[k];
      if (!t) continue;
      switch (k) {
        case 'harness':
          r.rect(bx - 4, by, 8, 2, P.nestSteelDk);
          r.rect(bx + (this.facing < 0 ? -9 : 3), by - 2, 6, 2, P.nestSteel);
          r.rect(bx + (this.facing < 0 ? -10 : 8), by - 2, 2, 1, P.nestSteelHi);
          break;
        case 'plate':
          r.rect(bx - 6, by - 2, 12, 5, P.nestSteelDk);
          r.rect(bx - 6, by - 2, 12, 1, P.nestSteel);
          for (let i = -1; i <= 1; i++) r.rect(bx + i * 4, by + 2, 1, 1, P.nestSteelHi);
          break;
        case 'chip':
          r.rect(bx - 1, by - 6, 3, 3, P.cyberDim);
          r.glow(bx, by - 5, 8, 'rgba(77,225,255,0.55)', 0.7);
          break;
        case 'pack':
          r.rect(bx - 5, by - 3, 6, 5, '#4b7a3a');
          r.rect(bx - 5, by - 3, 6, 1, '#6d9146');
          break;
        case 'lamp':
          r.circle(bx + (this.facing < 0 ? -6 : 6), by - 4, 2, P.sulfurHi);
          r.light(bx, by - 4, 70, 'rgba(255,240,180,0.7)', 0.7);
          break;
        default: break;
      }
    }
  }
}

// --- insects ---------------------------------------------------------------
export class Bug {
  constructor(kind, x, y) {
    this.kind = kind;
    this.x = x; this.y = y;
    this.flying = FLYING_BUGS.includes(kind);
    this.z = this.flying ? rnd(4, 18) : 0;
    this.dir = rnd(TAU);
    this.speed = this.flying ? rnd(14, 34) : rnd(6, 16);
    this.t = rnd(TAU);
    this.animT = rnd(1);
    this.dead = false;
    this.glow = bugGlow(kind);
    this.objType = 'bug';
    this.scatter = 0;
  }

  update(dt, game) {
    this.t += dt;
    this.animT = (this.animT + dt * (this.flying ? 6 : 3)) % 1;
    const p = game.player;
    if (dist2(this.x, this.y, p.x, p.y) < 26 * 26) {
      this.scatter = 0.8;
      this.dir = Math.atan2(this.y - p.y, this.x - p.x) + rnd(-0.5, 0.5);
    }
    this.scatter = Math.max(0, this.scatter - dt);
    this.dir += Math.sin(this.t * 2.2) * dt * 2.4;
    const sp = this.speed * (1 + this.scatter * 2.4);
    this.x += Math.cos(this.dir) * sp * dt;
    this.y += Math.sin(this.dir) * sp * dt * 0.7;
    if (this.flying) this.z = clamp(this.z + Math.sin(this.t * 1.7) * dt * 12, 2, 24);
    if (game.fire.burnAtPx(this.x, this.y) > 0) this.dead = true;
  }

  draw(r, game) {
    const f = bugFrames(this.kind);
    const img = f[Math.floor(this.animT * f.length) % f.length];
    r.draw(img, this.x - this.w / 2, this.y - this.h - this.z);
    if (this.glow && game.nightFactor > 0.15) {
      const pulse = 0.4 + Math.abs(Math.sin(this.t * 2.4)) * 0.6;
      r.glow(this.x, this.y - this.z - 3, 10, 'rgba(200,255,120,0.6)', pulse * game.nightFactor);
    }
  }
}

export class Fish {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.dir = rnd(TAU);
    this.t = rnd(TAU);
    this.animT = rnd(1);
    this.dead = false;
    this.objType = 'fish';
  }
  update(dt, game) {
    this.t += dt;
    this.animT = (this.animT + dt * 3) % 1;
    this.dir += Math.sin(this.t * 1.6) * dt * 2;
    const sp = 22 + Math.sin(this.t * 3) * 12;
    const nx = this.x + Math.cos(this.dir) * sp * dt;
    const ny = this.y + Math.sin(this.dir) * sp * dt * 0.6;
    if (isWater(game.world.tileAtPx(nx, ny))) { this.x = nx; this.y = ny; }
    else this.dir += Math.PI * 0.7;
    if (chance(dt * 0.4)) particles.water(this.x, this.y, 2);
  }
  draw(r) {
    const f = fishFrames('trout');
    const img = f[Math.floor(this.animT * f.length) % f.length];
    r.draw(img, this.x - this.w / 2, this.y - this.h / 2, Math.cos(this.dir) < 0, 0.75);
  }
}

// --- manager ---------------------------------------------------------------
export class Wildlife {
  constructor(world, seed) {
    this.world = world;
    this.animals = [];
    this.bugs = [];
    this.fish = [];
    this.rng = makeRng(seed ^ 0x5eed);
    this.bugBudget = 90;
    this.populate();
  }

  populate() {
    const w = this.world;
    const rng = this.rng;
    // Population scaled to map area so a bigger basin actually feels fuller.
    const areaMul = (w.w * w.h) / (200 * 160);
    const plan = [
      ['bison', 16], ['moose', 8], ['bear', 7], ['elk', 14], ['pronghorn', 12],
      ['hare', 14], ['wolf', 9], ['coyote', 10], ['fox', 9], ['squirrel', 18],
      ['hedgehog', 10], ['marmot', 12], ['pika', 12], ['beaver', 6], ['otter', 6],
      ['bighorn', 7], ['raven', 10], ['magpie', 10], ['eagle', 5], ['crane', 5],
      ['ferretWild', 12], ['kit', 9],
    ];
    for (const [key, base] of plan) {
      const def = BEASTS[key];
      const count = Math.round(base * areaMul);
      let placed = 0, guard = 0;
      while (placed < count && guard++ < count * 300) {
        const tx = rng.int(3, w.w - 4), ty = rng.int(3, w.h - 4);
        if (!def.biomes.includes(w.tileAt(tx, ty))) continue;
        const x = tx * TS + TS / 2, y = ty * TS + TS / 2;
        // herd animals arrive as a family group
        const herd = ['bison', 'elk', 'pronghorn', 'wolf', 'bighorn'].includes(key) ? rng.int(2, 5) : 1;
        for (let g = 0; g < herd && placed < count; g++) {
          this.animals.push(new Animal(key, x + rng.range(-42, 42), y + rng.range(-32, 32)));
          placed++;
        }
      }
    }
    let f = 0, guard = 0;
    const fishTarget = Math.round(40 * areaMul);
    while (f < fishTarget && guard++ < 40000) {
      const tx = this.rng.int(2, w.w - 3), ty = this.rng.int(2, w.h - 3);
      if (!isWater(w.tileAt(tx, ty)) || TILES[w.tileAt(tx, ty)].hot) continue;
      this.fish.push(new Fish(tx * TS + 8, ty * TS + 8));
      f++;
    }
  }

  get bonded() { return this.animals.filter(a => a.bonded && !a.dead); }

  nearestRescuable(x, y, r) {
    let best = null, bd = r * r;
    for (const a of this.animals) {
      if (a.dead || !a.trapped) continue;
      const d = dist2(x, y, a.x, a.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Closest animal you could plausibly interact with (feed, revive, equip). */
  /** The nearest catchable insect. They are tiny, so the radius is tiny. */
  nearestBug(x, y, r) {
    let best = null, bd = r * r;
    for (const b of this.bugs) {
      if (b.dead) continue;
      const d = dist2(x, y, b.x, b.y - b.z * 0.5);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Put one bug somewhere specific — the jay's quest needs them to hand. */
  spawnBugAt(x, y) {
    const w = this.world;
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    if (!w.inBounds(tx, ty)) return null;
    const id = w.tileAt(tx, ty);
    if (isWater(id) || isSolid(id)) return null;
    const b = new Bug(pick(['beetle', 'moth', 'grasshopper', 'firefly']), x, y);
    this.bugs.push(b);
    return b;
  }

  nearestFriendly(x, y, r) {
    let best = null, bd = r * r;
    for (const a of this.animals) {
      if (a.dead || a.trapped) continue;
      const d = dist2(x, y, a.x, a.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  trapNear(x, y, radius, count) {
    const cands = this.animals.filter(a => !a.dead && !a.trapped && !a.bonded && dist2(a.x, a.y, x, y) < radius * radius);
    cands.sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y));
    let n = 0;
    for (const a of cands) {
      if (n >= count) break;
      a.trapped = true;
      a.state = 'trapped';
      n++;
    }
    return n;
  }

  update(dt, game) {
    const p = game.player;
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.dead) { this.animals.splice(i, 1); continue; }
      // Companions always simulate; wild animals only near the player.
      if (!a.bonded && !a.trapped && dist2(a.x, a.y, p.x, p.y) > SIM_RADIUS * SIM_RADIUS) continue;
      a.update(dt, game);
    }
    for (const f of this.fish) {
      if (dist2(f.x, f.y, p.x, p.y) > 300 * 300) continue;
      f.update(dt, game);
    }
    this.updateBugs(dt, game);
  }

  updateBugs(dt, game) {
    const cam = game.r.camera;
    for (let i = this.bugs.length - 1; i >= 0; i--) {
      const b = this.bugs[i];
      b.update(dt, game);
      if (b.dead || !cam.visible(b.x, b.y, 140)) this.bugs.splice(i, 1);
    }
    const budget = game.fire.active ? 12 : this.bugBudget;
    let guard = 0;
    while (this.bugs.length < budget && guard++ < 12) {
      const a = rnd(TAU);
      const d = rnd(150, 240);
      const x = cam.x + Math.cos(a) * d;
      const y = cam.y + Math.sin(a) * d * 0.7;
      const t = this.world.tileAtPx(x, y);
      if (isSolid(t) || TILES[t].hot) continue;
      const night = game.nightFactor > 0.35;
      let kind;
      if (isWater(t)) kind = 'waterstrider';
      else if (night) kind = pick(['firefly', 'firefly', 'moth', 'beetle']);
      else kind = pick(['butterfly', 'bee', 'dragonfly', 'grasshopper', 'beetle', 'ant']);
      this.bugs.push(new Bug(kind, x, y));
    }
  }

  collect(out, cam) {
    for (const a of this.animals) if (!a.dead && cam.visible(a.x, a.y, 48)) out.push(a);
    for (const b of this.bugs) if (cam.visible(b.x, b.y, 20)) out.push(b);
  }

  drawFish(r, cam) {
    for (const f of this.fish) if (cam.visible(f.x, f.y, 20)) f.draw(r);
  }
}

/**
 * An ally arriving for a raid.
 *
 * It comes in already devoted, already fighting, and already pointed at the
 * outpost — a sworn faction turning up should feel like the cavalry, not like
 * four more animals wandering about being skittish.
 */
Wildlife.prototype.spawnAlly = function (key, x, y, game) {
  const a = new Animal(key, x, y);
  a.trust = 100;
  a.bonded = true;
  a.devoted = true;
  a.order = 'attack';
  a.state = 'attack';
  a.anim = 'run';
  a.hp = a.maxHpStat;
  a.summoned = true;
  this.animals.push(a);
  particles.burst(x, y - 6, 14, { colors: ['#c8b48a', '#8a7a5c'], speed: 90, life: 0.6, gravity: 60, vz: 40 });
  return a;
};

/**
 * Something coming out of a pen.
 *
 * Whatever Les Nest had in the cages was worth catching, so it skews toward
 * the things they can sell: fur, antler, and whatever was small enough to grab.
 * It comes out already frightened, and already halfway to trusting you.
 */
Wildlife.prototype.spawnFreed = function (x, y, game) {
  const pool = ['hare', 'fox', 'marmot', 'ferretWild', 'kit', 'squirrel', 'coyote', 'otter', 'pronghorn'];
  const key = pool[Math.floor(Math.random() * pool.length)];
  const a = new Animal(key, x, y);
  a.state = 'flee';
  a.anim = 'run';
  a.fear = 1;
  this.animals.push(a);
  particles.burst(x, y - 6, 10, { colors: ['#c8c8a0', '#8a8a6a'], speed: 70, life: 0.5, gravity: 90, vz: 40 });
  return a;
};
