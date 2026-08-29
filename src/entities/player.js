// The player: a black-footed ferret who was taken as a kit into a Les Nest
// laboratory and came back out with a cybernetic eye, a seam of stitches and
// two abilities nobody asked for. Movement, gathering, carrying, shooting,
// dashing, scanning and overclocking all live here.

import { PLAYER_CFG } from '../art/species.js';
import { critterFrames } from '../art/critters.js';
import { carryLogSprite, weaponSprite, WEAPON_MUZZLE, muzzleFlash } from '../art/items.js';
import { FerretRig } from '../art/ferret.js';
import { P } from '../art/palette.js';
import { flashFrames } from '../art/pixel.js';
import { WEAPONS, CHIPS, RESOURCES } from '../systems/defs.js';
import { Inventory } from '../systems/inventory.js';
import { clamp, damp } from '../engine/math.js';
import { rnd, chance, pick } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { isSolid, isWater, TILES, tileDamage } from '../world/tiles.js';

const BASE_SPEED = 92;
const RUN_MULT = 1.34;
const MAX_WOOD = 10;

const MELEE_REACH = 27;
const MELEE_ARC = 1.15;        // radians, total spread
const MELEE_COST = 12;
const MELEE_CD = 0.40;
const PARRY_WINDOW = 0.18;     // guard is live for this long from the swing
const PARRY_PERFECT = 0.09;    // ...and this much of it is a perfect parry
const GRAZE_DIST = 11;

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 6;                 // collision radius
    this.hitR = 3.2;            // bullet-hell hitbox: deliberately tiny
    this.facing = 1;            // -1 left, 1 right
    this.view = 'front';
    this.aim = 0;
    this.anim = 'idle';
    this.animT = 0;
    this.speedMult = 1;

    this.maxHp = 100; this.hp = 100;
    this.maxEnergy = 100; this.energy = 100;
    this.invuln = 0;
    this.hurtT = 0;
    this.dead = false;
    this.deathT = 0;

    this.dashT = 0; this.dashCd = 0; this.dashCharges = 1; this.dashMax = 1;
    this.dashAngle = 0;
    this.afterimages = [];

    this.overclock = false;
    this.overclockT = 0;

    // Close-quarters combat. One button does both jobs: press it and you swing;
    // press it as something is about to hit you and the first frames of that
    // swing are a parry. Timing is the whole skill.
    this.meleeT = 0;          // swing animation timer
    this.meleeCd = 0;
    this.parryT = 0;          // remaining guard window
    this.parryPerfectT = 0;   // the tighter window inside it
    this.parryFlash = 0;
    this.combo = 0;           // successful parries/grazes in a row
    this.comboT = 0;
    this.edgeBuffT = 0;       // damage bonus from parries and perfect dodges
    this.grazeCd = 0;
    this.lastMeleeAngle = 0;

    this.scanT = 0; this.scanCd = 0;

    this.inv = new Inventory();
    this.weapons = ['popper'];
    this.weaponIndex = 0;
    this.fireT = 0;
    this.shotCounter = 0;
    this.recoil = 0;
    this.muzzleT = 0;

    this.chips = [];             // installed
    this.chipSlots = 3;
    this.chipBag = [];           // collected but not installed
    this.stats = {};
    this.shieldUp = false;
    this.shieldT = 0;

    this.gatherTarget = null;
    this.gatherT = 0;
    this.gatherSwing = 0;
    this.tool = 'hand';

    this.kills = 0;
    this.chipsStolen = 0;
    this.treesSaved = 0;
    this.animalsRescued = 0;
    this.carrying = null;        // a rescued animal being carried
    this.footT = 0;
    this.blinkT = 0;
    this.regenAcc = 0;
    // Permanent story bonuses. Kept apart from chips so recompute() can rebuild
    // the chip stats from scratch without wiping them.
    this.bonus = { damage: 0, speed: 0, hp: 0, rof: 0 };
    // The ferret is not a sprite sheet. It is a spine that trails the nose and
    // four feet that plant themselves, solved fresh every frame.
    this.rig = new FerretRig();
    this.spite = false;

    this.recompute();
    this.hp = this.maxHp;
  }

  // --- derived stats -------------------------------------------------------
  recompute() {
    const s = {
      damage: 1, rof: 1, speed: 1, hp: 0, regen: 0, pierce: 0, bounce: 0,
      count: 0, spread: 0, magnet: 0, shield: 0, lifesteal: 0, arc: 0,
      dilate: 0, harvest: 0, burn: 0, overclock: 0, siphon: 0, dash: 0,
    };
    for (const key of this.chips) {
      const c = CHIPS[key];
      if (!c) continue;
      for (const k in c.stat) s[k] = (s[k] || 0) + c.stat[k];
    }
    for (const k in this.bonus) s[k] = (s[k] || 0) + this.bonus[k];
    this.stats = s;
    const newMax = 100 + s.hp;
    if (newMax !== this.maxHp) {
      const frac = this.hp / this.maxHp;
      this.maxHp = newMax;
      this.hp = Math.min(this.maxHp, Math.max(this.hp, Math.round(frac * this.maxHp)));
    }
    this.dashMax = 1 + s.dash;
    this.dashCharges = Math.min(this.dashCharges + 0, this.dashMax);
    if (s.shield > 0 && !this.shieldUp && this.shieldT <= 0) this.shieldUp = true;
  }

  get weapon() { return WEAPONS[this.weapons[this.weaponIndex]] || WEAPONS.popper; }
  get weaponKey() { return this.weapons[this.weaponIndex]; }
  get wood() { return this.inv.get('wood'); }
  get woodFull() { return this.wood >= MAX_WOOD; }

  addWeapon(key) {
    if (this.weapons.includes(key)) return false;
    this.weapons.push(key);
    this.weaponIndex = this.weapons.length - 1;
    return true;
  }

  installChip(key, slot = -1) {
    if (slot < 0) {
      if (this.chips.length >= this.chipSlots) return false;
      this.chips.push(key);
    } else {
      if (slot >= this.chipSlots) return false;
      const old = this.chips[slot];
      this.chips[slot] = key;
      if (old) this.chipBag.push(old);
    }
    const i = this.chipBag.indexOf(key);
    if (i >= 0) this.chipBag.splice(i, 1);
    this.recompute();
    return true;
  }

  removeChip(slot) {
    const key = this.chips[slot];
    if (!key) return false;
    this.chips.splice(slot, 1);
    this.chipBag.push(key);
    this.recompute();
    return true;
  }

  // --- main update ---------------------------------------------------------
  update(dt, game, frozen = false) {
    if (this.dead) { this.deathT += dt; return; }
    const input = game.input;
    const world = game.world;

    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.scanT = Math.max(0, this.scanT - dt);
    this.scanCd = Math.max(0, this.scanCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryPerfectT = Math.max(0, this.parryPerfectT - dt);
    this.parryFlash = Math.max(0, this.parryFlash - dt * 3.5);
    this.grazeCd = Math.max(0, this.grazeCd - dt);
    this.edgeBuffT = Math.max(0, this.edgeBuffT - dt);
    if (this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.blinkT += dt;

    // --- aim -------------------------------------------------------------
    const stick = input.aimVector();
    if (stick) {
      // Twin-stick aiming, with a light magnetism toward whatever you are
      // clearly pointing at — a thumb is not a mouse.
      let a = Math.atan2(stick.y, stick.x);
      const snap = game.aimAssist(this.x, this.y - 10, a);
      if (snap != null) a = snap;
      this.aim = a;
      this.aimX = this.x + Math.cos(a) * 140;
      this.aimY = this.y - 10 + Math.sin(a) * 140;
    } else {
      const mw = game.r.camera.toWorld(input.mouse.sx, input.mouse.sy);
      this.aimX = mw.x; this.aimY = mw.y;
      this.aim = Math.atan2(mw.y - (this.y - 10), mw.x - this.x);
    }

    // --- movement --------------------------------------------------------
    const ax = input.axes();
    const uiBlocked = game.uiBlocksInput || frozen;
    const moveX = uiBlocked ? 0 : ax.x, moveY = uiBlocked ? 0 : ax.y;
    const moving = Math.hypot(moveX, moveY) > 0.05;

    // carrying wood is heavy; a full load is a real decision
    const load = this.wood / MAX_WOOD;
    const carryPenalty = 1 - load * 0.20 - (this.carrying ? 0.16 : 0);
    let speed = BASE_SPEED * (1 + this.stats.speed) * carryPenalty * this.speedMult;
    const tileMul = world.speedAtPx(this.x, this.y);
    speed *= tileMul;
    if (input.isDown('focus')) speed *= 0.45;   // focus-walk for threading bullets

    if (this.dashT > 0) {
      this.dashT -= dt;
      const dashSpeed = 330 * (1 - Math.pow(1 - this.dashT / 0.18, 2) * 0.35);
      this.vx = Math.cos(this.dashAngle) * dashSpeed;
      this.vy = Math.sin(this.dashAngle) * dashSpeed;
      // The trail records the shape the body was actually in, not a stamped
      // silhouette: at speed the ferret leaves a ribbon behind it.
      if (chance(dt * 70)) {
        this.afterimages.push({
          life: 0.24, maxLife: 0.24,
          spine: this.rig.spine.map((n, i) => ({ x: n.x, y: n.y, r: this.rig.radiusAt(i) })),
        });
      }
      this.invuln = Math.max(this.invuln, 0.06);
    } else {
      const target = { x: moveX * speed, y: moveY * speed };
      const accel = moving ? 12 : 16;
      this.vx = damp(this.vx, target.x, 0.0001, dt * accel / 12);
      this.vy = damp(this.vy, target.y, 0.0001, dt * accel / 12);
    }

    this._move(this.vx * dt, this.vy * dt, world);

    // the body follows wherever the nose ended up
    this.rig.update(dt, {
      x: this.x, y: this.y, vx: this.vx, vy: this.vy,
      facing: this.facing, anim: this.anim,
      dashing: this.dashT > 0, aim: this.aim,
    });

    // face the aim while shooting or standing, movement direction otherwise
    const aimingBack = Math.sin(this.aim) < -0.35;
    this.view = aimingBack ? 'back' : 'front';
    if (Math.abs(Math.cos(this.aim)) > 0.2) this.facing = Math.cos(this.aim) > 0 ? 1 : -1;

    // --- animation state --------------------------------------------------
    const spd = Math.hypot(this.vx, this.vy);
    let anim = 'idle';
    if (this.meleeT > 0) anim = 'attack';
    else if (this.hurtT > 0.05) anim = 'hurt';
    else if (this.dashT > 0) anim = 'run';
    else if (this.gatherT > 0) anim = 'attack';
    else if (spd > 130) anim = 'run';
    else if (spd > 12) anim = 'walk';
    if (anim !== this.anim) { this.anim = anim; if (anim !== 'walk' && anim !== 'run') this.animT = 0; }
    const rate = anim === 'run' ? 1.7 : anim === 'walk' ? 1.15 : anim === 'attack' ? 2.2 : 0.55;
    this.animT = (this.animT + dt * rate) % 1;

    if ((anim === 'walk' || anim === 'run') && !world.tileAtPx(this.x, this.y)) { /* noop */ }
    if (anim === 'walk' || anim === 'run') {
      this.footT -= dt * (anim === 'run' ? 6.4 : 4.2);
      if (this.footT <= 0) {
        this.footT = 1;
        audio.play('step', { vol: 0.6 });
        const t = world.tileAtPx(this.x, this.y);
        if (isWater(t)) particles.water(this.x, this.y + 3, 3);
        else particles.dust(this.x, this.y + 2, 2, TILES[t].dark || P.dirt);
      }
    }

    // --- dash -------------------------------------------------------------
    if (this.dashCharges < this.dashMax && this.dashCd <= 0) {
      this.dashCharges++;
      this.dashCd = 1.1;
    }
    if (!uiBlocked && input.isPressed('dash') && this.dashT <= 0 && this.dashCharges > 0 && this.energy >= 18) {
      this.dashCharges--;
      this.energy -= 18;
      this.dashT = 0.18;
      this.dashCd = Math.max(this.dashCd, 0.5);
      this.dashAngle = moving ? Math.atan2(moveY, moveX) : this.aim;
      audio.play('dash');
      particles.burst(this.x, this.y + 2, 12, { colors: [P.cyber, P.cyberHot, '#ffffff'], speed: 90, life: 0.3, additive: true, angle: this.dashAngle + Math.PI, spread: 0.9 });
      game.r.camera.addShake(1.6);
    }

    // --- claw / parry ------------------------------------------------------
    if (!uiBlocked && input.isPressed('melee')) this.tryMelee(game);

    // --- energy -----------------------------------------------------------
    const regenRate = this.dashT > 0 ? 0 : (moving ? 15 : 26);
    this.energy = clamp(this.energy + regenRate * dt, 0, this.maxEnergy);

    // --- overclock (the lab's other gift) ---------------------------------
    const wantOverclock = !uiBlocked && (input.mouse.rdown || input.isDown('overclock')) && this.hp > 12;
    if (wantOverclock !== this.overclock) {
      this.overclock = wantOverclock;
      if (wantOverclock) audio.play('scan', { vol: 0.4 });
    }
    if (this.overclock) {
      this.overclockT += dt;
      this.hp -= dt * 4.5;
      if (chance(dt * 24)) particles.spawn({
        x: this.x + rnd(-5, 5), y: this.y - 8 + rnd(-4, 4), z: 2,
        vx: rnd(-10, 10), vy: rnd(-24, -6), vz: rnd(4, 18),
        life: rnd(0.3, 0.7), size: 1, colors: [P.cyberHot, P.cyber, P.cyberDim], additive: true, gravity: -20,
      });
      if (this.hp <= 8) this.overclock = false;
    } else {
      this.overclockT = Math.max(0, this.overclockT - dt * 2);
    }

    // --- scan pulse -------------------------------------------------------
    if (!uiBlocked && input.isPressed('scan') && this.scanCd <= 0) {
      this.scanCd = 6;
      this.scanT = 1.6;
      audio.play('scan');
      particles.ring(this.x, this.y - 6, 6, 200, 0.9, P.cyber, 2, true);
      game.onScan(this);
    }

    // --- regen from chips -------------------------------------------------
    if (this.stats.regen > 0 && this.hp < this.maxHp) {
      this.regenAcc += dt * this.stats.regen;
      if (this.regenAcc >= 1) { const n = Math.floor(this.regenAcc); this.regenAcc -= n; this.heal(n, false); }
    }

    // --- shield recharge --------------------------------------------------
    if (this.stats.shield > 0 && !this.shieldUp) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) { this.shieldUp = true; audio.play('pickup', { vol: 0.5 }); }
    }

    // --- shooting ---------------------------------------------------------
    this.fireT -= dt;
    // In command mode the click issues orders instead of pulling a trigger.
    if (!uiBlocked && !game.squad.commandMode && input.firing && this.fireT <= 0 && this.gatherT <= 0) this.tryShoot(game);

    // --- weapon select ----------------------------------------------------
    if (!uiBlocked) {
      for (let i = 0; i < 5; i++) {
        if (input.isPressed('slot' + (i + 1)) && i < this.weapons.length) {
          this.weaponIndex = i; audio.play('ui');
        }
      }
      if (input.wheel !== 0 && this.weapons.length > 1) {
        this.weaponIndex = (this.weaponIndex + (input.wheel > 0 ? 1 : -1) + this.weapons.length) % this.weapons.length;
        audio.play('ui');
      }
    }

    // --- gathering --------------------------------------------------------
    this.updateGather(dt, game, uiBlocked);

    // --- environment hazards ----------------------------------------------
    const tid = world.tileAtPx(this.x, this.y);
    const scald = tileDamage(tid);
    if (scald > 0 && this.invuln <= 0) this.damage(scald * dt * 2, game, { silent: true, source: 'scald' });
    const burn = game.fire.burnAtPx(this.x, this.y);
    if (burn > 0) {
      this.damage(11 * dt, game, { silent: true, source: 'fire' });
      if (chance(dt * 8)) particles.embers(this.x + rnd(-4, 4), this.y - 4, 1);
    }

    // --- afterimages ------------------------------------------------------
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.life -= dt;
      if (a.life <= 0) this.afterimages.splice(i, 1);
    }

    if (this.hp <= 0) this.die(game);
  }

  _move(dx, dy, world) {
    // Axis-separated sweep so sliding along a boulder feels smooth.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sy = dy / steps;
      if (!this._blocked(this.x + sx, this.y, world)) this.x += sx;
      else this.vx *= 0.4;
      if (!this._blocked(this.x, this.y + sy, world)) this.y += sy;
      else this.vy *= 0.4;
    }
    this.x = clamp(this.x, 8, world.pxW - 8);
    this.y = clamp(this.y, 8, world.pxH - 8);
  }

  _blocked(x, y, world) {
    const r = this.r * 0.6;
    for (const [ox, oy] of [[-r, 0], [r, 0], [0, -r * 0.6], [0, r * 0.6]]) {
      const t = world.tileAtPx(x + ox, y + oy);
      if (isSolid(t)) return true;
      if (TILES[t].deep) return true;   // no swimming in the deep channel
    }
    return false;
  }

  // --- combat --------------------------------------------------------------
  tryShoot(game) {
    const w = this.weapon;
    const key = this.weaponKey;
    if (w.meleeOnly) return;                 // claws: the trigger does nothing
    const rof = w.rof / (1 + this.stats.rof + (this.overclock ? 0.6 : 0));
    // ammo
    if (w.ammo > 0) {
      const every = w.ammoEvery || 1;
      const needs = (this.shotCounter % every) === 0;
      if (needs && !this.inv.has('ammo', w.ammo)) {
        if (this.fireT <= -0.3) { audio.play('deny'); this.fireT = 0.35; game.toast('OUT OF ROUNDS', P.uiBad); }
        return;
      }
      if (needs) this.inv.take('ammo', w.ammo);
    }
    this.shotCounter++;
    this.fireT = rof;
    this.recoil = 1;
    this.muzzleT = 0.09;

    const count = w.count + this.stats.count;
    const spread = w.spread + this.stats.spread;
    // Rounds leave the barrel where the barrel actually is.
    const sh = this.rig.shoulder();
    const muzzleDist = ((WEAPON_MUZZLE[w.art] || 16) - 4) * 0.62;
    const ox = sh.x + Math.cos(this.aim) * muzzleDist;
    const oy = sh.y - 2 + Math.sin(this.aim) * muzzleDist;

    const dmg = w.damage * (1 + this.stats.damage) * this.damageMult;

    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i / (count - 1) - 0.5) * 2 : 0;
      const a = this.aim + off * spread + rnd(-spread * 0.3, spread * 0.3);
      const sp = w.speed * rnd(0.92, 1.08);
      game.spawnBullet({
        x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        damage: dmg, friendly: true, kind: w.bullet,
        life: w.range * 1.2, pierce: (w.pierce || 0) + this.stats.pierce,
        bounce: this.stats.bounce, aoe: w.aoe || 0, arc: w.arc,
        chain: w.chain || 0, chainRange: w.chainRange || 0,
        knock: w.knock || 0, burn: this.stats.burn, arcChance: this.stats.arc,
        scald: w.scald, owner: this,
      });
    }
    audio.play(w.sfx || 'shoot');
    if (w.shake) game.r.camera.addShake(w.shake);
    this.vx -= Math.cos(this.aim) * (w.knock || 20) * 0.5;
    this.vy -= Math.sin(this.aim) * (w.knock || 20) * 0.5;
    particles.burst(ox, oy, 3, { colors: [P.fire1, P.fire2], speed: 60, life: 0.15, additive: true, angle: this.aim, spread: 0.4, gravity: 0 });
  }

  // --- close quarters ------------------------------------------------------
  /** Swing the claws. The opening frames double as a parry. */
  /**
   * The bite.
   *
   * Not a sword swing with a white arc drawn over it. She picks the nearest
   * thing in front of her, throws herself at it, and closes her jaws on it —
   * the lunge is the attack, the rig plays the snap, and the only thing on
   * screen that was not already there is blood.
   */
  tryMelee(game) {
    if (this.meleeCd > 0) return false;
    if (this.energy < MELEE_COST) {
      audio.play('deny', { vol: 0.5 });
      return false;
    }

    // Pick a target first, so she commits to something rather than swinging at
    // the cursor and hoping. Anything inside the arc counts; the closest wins.
    let target = null, bestD = 1e9;
    const reach = MELEE_REACH + 8;
    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || e.charmT > 0) continue;
      const dx = e.x - this.x, dy = (e.y - 6) - (this.y - 8);
      const d = Math.hypot(dx, dy);
      if (d > reach + e.r) continue;
      let diff = Math.atan2(dy, dx) - this.aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > MELEE_ARC) continue;
      if (d < bestD) { bestD = d; target = e; }
    }

    this.energy -= MELEE_COST;
    this.meleeCd = MELEE_CD;
    this.meleeT = 0.24;
    this.parryT = PARRY_WINDOW;
    this.parryPerfectT = PARRY_PERFECT;

    // She goes where the bite is going. With a target that means straight at
    // it; without one it is still a lunge, because the lunge is also how you
    // cross ground quickly without spending a dash.
    const ang = target
      ? Math.atan2((target.y - 6) - (this.y - 8), target.x - this.x)
      : this.aim;
    this.lastMeleeAngle = ang;
    this.aim = ang;
    this.rig.bite(ang);

    const lunge = target ? clamp(bestD * 7, 150, 320) : 165;
    this.vx += Math.cos(ang) * lunge;
    this.vy += Math.sin(ang) * lunge;
    audio.play('dash', { vol: 0.35, pitch: 1.35 });

    const dmg = 26 * (1 + this.stats.damage) * this.damageMult;
    let hits = 0;
    const strike = (e) => {
      e.damage(dmg, game, { vx: Math.cos(ang), vy: Math.sin(ang), knock: 190, owner: this, melee: true });
      // teeth, not sparks
      particles.blood(e.x, e.y - 6, 7);
      particles.burst(e.x, e.y - 6, 4, {
        colors: ['#c04141', '#8e2a2a'], speed: 90, life: 0.32,
        angle: ang, spread: 0.8, gravity: 260, vz: 40,
      });
      hits++;
    };

    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || e.charmT > 0) continue;
      const dx = e.x - this.x, dy = (e.y - 6) - (this.y - 8);
      const d = Math.hypot(dx, dy);
      if (d > MELEE_REACH + e.r) continue;
      let diff = Math.atan2(dy, dx) - ang;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > MELEE_ARC / 2) continue;
      strike(e);
    }
    // Machines take the teeth badly; so do saw traps in the way.
    for (const h of game.hazards) {
      if (h.dead || !h.damage) continue;
      if (Math.hypot(h.x - this.x, h.y - this.y) < MELEE_REACH + 6) { h.damage(dmg, game); hits++; }
    }
    // And so, eventually, does a relay mast, though it takes a while and she
    // is standing under it the whole time.
    if (game.occupation) {
      for (const o of game.occupation.outposts) {
        if (o.razed) continue;
        if (Math.hypot(o.x - this.x, (o.y - 10) - (this.y - 8)) < MELEE_REACH + 16) { o.damage(dmg * 0.8, game); hits++; }
      }
    }

    if (hits) {
      game.r.camera.addShake(2.2);
      audio.play('flesh', { vol: 0.8 });
      game.slowmo(0.5, 0.07);
    } else {
      audio.play('hit', { vol: 0.2, pitch: 1.5 });
    }
    return true;
  }


  get parryActive() { return this.parryT > 0; }

  /** A hostile shot met by the claws is sent back where it came from. */
  tryParry(b, game) {
    if (this.parryT <= 0) return false;
    const dx = b.x - this.x, dy = b.y - (this.y - 8);
    const d = Math.hypot(dx, dy);
    if (d > MELEE_REACH + b.radius + 4) return false;
    let diff = Math.atan2(dy, dx) - this.lastMeleeAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > MELEE_ARC * 0.75) return false;

    const perfect = this.parryPerfectT > 0;
    this.combo++;
    this.comboT = 3.2;
    this.edgeBuffT = Math.max(this.edgeBuffT, perfect ? 5 : 3);
    this.energy = Math.min(this.maxEnergy, this.energy + (perfect ? 26 : 12));
    this.parryFlash = 1;
    this.invuln = Math.max(this.invuln, perfect ? 0.35 : 0.16);

    // Send it back, at whatever is nearest to the aim.
    const target = game.nearestEnemy(this.x, this.y, 260);
    const a = target ? Math.atan2(target.y - 6 - b.y, target.x - b.x) : this.lastMeleeAngle;
    const sp = Math.max(230, Math.hypot(b.vx, b.vy) * 1.5);
    b.friendly = true;
    b.owner = this;
    b.vx = Math.cos(a) * sp;
    b.vy = Math.sin(a) * sp;
    b.rot = a;
    b.damage = b.damage * (perfect ? 3.2 : 2) * (1 + this.stats.damage);
    b.life = Math.max(b.life, 1.6);
    b.pierce = Math.max(b.pierce, perfect ? 1 : 0);
    b.glow = 'rgba(255,240,160,0.7)';
    b.hits = null;

    audio.play(perfect ? 'shieldbreak' : 'metal', { vol: 0.9 });
    particles.ring(b.x, b.y, 3, perfect ? 34 : 22, 0.3, perfect ? '#ffffff' : P.sulfurHi, 2, true);
    particles.text(this.x, this.y - 30, perfect ? 'PERFECT PARRY' : 'PARRY', perfect ? '#ffffff' : P.sulfurHi, { life: 0.9 });
    game.slowmo(perfect ? 0.22 : 0.45, perfect ? 0.3 : 0.12);
    game.r.camera.addShake(perfect ? 4 : 2);
    return true;
  }

  /** Threading a shot at point-blank range during a dash pays you for it. */
  tryGraze(b, game) {
    if (this.grazeCd > 0 || this.dashT <= 0) return;
    const d = Math.hypot(b.x - this.x, b.y - (this.y - 7));
    if (d > GRAZE_DIST) return;
    this.grazeCd = 0.35;
    this.combo++;
    this.comboT = 3.2;
    this.edgeBuffT = Math.max(this.edgeBuffT, 2.6);
    this.energy = Math.min(this.maxEnergy, this.energy + 10);
    particles.text(this.x, this.y - 26, 'CLOSE', P.cyber, { life: 0.7 });
    particles.ring(this.x, this.y - 7, 4, 16, 0.22, P.cyber, 1, true);
    audio.play('sparker', { vol: 0.4 });
    game.slowmo(0.6, 0.05);
  }

  /** Every damage source multiplies through here. */
  get damageMult() {
    let m = this.overclock ? 1.3 : 1;
    if (this.stats.overclock && this.hp < this.maxHp * 0.4) m *= 1 + this.stats.overclock;
    if (this.edgeBuffT > 0) m *= 1 + Math.min(0.6, 0.12 * this.combo);
    return m;
  }

  damage(n, game, opts = {}) {
    if (this.dead) return;
    if (this.invuln > 0 && !opts.silent) return;
    if (this.shieldUp && !opts.silent) {
      this.shieldUp = false;
      this.shieldT = 9;
      this.invuln = 0.6;
      audio.play('shieldbreak');
      particles.ring(this.x, this.y - 6, 4, 26, 0.35, P.springHot, 2, true);
      game.toast('SHIELD BROKEN', P.springHot);
      return;
    }
    this.hp -= n;
    if (!opts.silent) {
      this.invuln = 0.65;
      this.hurtT = 0.32;
      audio.play('hurt');
      game.r.camera.addShake(4);
      game.hitFlash = Math.max(game.hitFlash, 0.35);
      particles.blood(this.x, this.y - 6, 8, ['#c04141', '#8e2a2a', P.cyber]);
      particles.text(this.x, this.y - 20, '-' + Math.round(n), P.uiBad);
      if (this.stats.dilate) game.slowmo(0.35, 0.28);
    }
    if (this.hp <= 0) this.die(game);
  }

  heal(n, showText = true) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (showText && this.hp > before) particles.text(this.x, this.y - 22, '+' + Math.round(this.hp - before), P.uiGood);
  }

  onKill(game) {
    this.kills++;
    if (this.stats.lifesteal) this.heal(this.stats.lifesteal, false);
    if (this.stats.siphon) this.inv.add('ammo', this.stats.siphon);
  }

  die(game) {
    if (this.dead) return;
    // You do not get a game over during a fight the script says you lose.
    if (game.firstStand && game.firstStand.phase === 'fight') {
      game.firstStand.knockDown(game);
      return;
    }
    this.dead = true;
    this.deathT = 0;
    this.overclock = false;
    audio.play('die');
    particles.burst(this.x, this.y - 6, 30, { colors: ['#c04141', '#8e2a2a', P.furTan, P.cyber], speed: 120, life: 1.1, vz: 120 });
    game.onPlayerDeath();
  }

  respawn(x, y) {
    this.dead = false;
    this.hp = this.maxHp * 0.6;
    this.energy = this.maxEnergy;
    this.x = x; this.y = y;
    this.vx = this.vy = 0;
    this.invuln = 2.5;
    this.shieldUp = this.stats.shield > 0;
    this.carrying = null;
    this.rig.reset(this.x, this.y);
  }

  // --- gathering -----------------------------------------------------------
  updateGather(dt, game, uiBlocked) {
    const world = game.world;
    const holding = !uiBlocked && game.input.isDown('interact');

    if (this.gatherT > 0) {
      this.gatherT -= dt;
      this.gatherSwing += dt * 5;
      if (this.gatherSwing >= 1) {
        this.gatherSwing = 0;
        this.swing(game);
      }
      if (!holding || !this.gatherTarget || !this.gatherTarget.alive) {
        this.gatherT = 0;
        this.gatherTarget = null;
      }
      return;
    }

    if (!holding) { this.gatherTarget = null; return; }

    // Only start a swing if there is nothing more interesting in range —
    // NPCs, wrecks and pickups get priority so E is never ambiguous.
    if (game.interactPriority()) return;

    const node = world.nearestNode(this.x, this.y, 22, (n) => {
      if (n.def.tool === 'axe' && this.inv.isFull('wood') && n.def.yields.every(y => y[0] === 'wood')) return false;
      return true;
    });
    if (!node) return;
    this.gatherTarget = node;
    this.gatherT = 0.4;
    this.gatherSwing = 0.9;
    this.tool = node.def.tool;
  }

  swing(game) {
    const n = this.gatherTarget;
    if (!n || !n.alive) return;
    const world = game.world;
    const dx = n.x - this.x, dy = n.y - this.y;
    if (dx * dx + dy * dy > 30 * 30) { this.gatherT = 0; return; }
    this.facing = dx >= 0 ? 1 : -1;
    this.gatherT = 0.4;

    const power = n.def.tool === 'hand' ? 1 : 1;
    const yields = world.hitNode(n, power);

    if (n.def.tool === 'axe') {
      audio.play('chop');
      particles.woodChips(n.x, n.y - 8, 6);
      game.r.camera.addShake(0.8);
    } else if (n.def.tool === 'pick') {
      audio.play('mine');
      particles.rockChips(n.x, n.y - 4, 6, n.def.kind === 'obsidian' ? [P.obsidianHi, '#2b2a38'] : undefined);
      game.r.camera.addShake(0.8);
    } else {
      audio.play('pick');
      particles.burst(n.x, n.y - 5, 4, { colors: [P.berryHi, P.grassLight], speed: 40, life: 0.4 });
    }

    if (yields) {
      if (n.def.art === 'tree') { audio.play('timber'); particles.leaves(n.x, n.y - 20, 10); game.r.camera.addShake(2); }
      const mult = 1 + this.stats.harvest;
      for (const [item, base] of yields) {
        const amount = Math.max(1, Math.round(base * mult));
        this.grant(item, amount, game, n.x, n.y - 10);
      }
      this.gatherTarget = null;
      this.gatherT = 0;
    }
  }

  /** Add resources, spilling anything over the carry cap onto the ground. */
  grant(item, amount, game, fx, fy) {
    const taken = this.inv.add(item, amount);
    const spill = amount - taken;
    if (taken > 0) {
      particles.text(fx == null ? this.x : fx, (fy == null ? this.y - 16 : fy), '+' + taken + ' ' + (RESOURCES[item] ? RESOURCES[item].name : item), RESOURCES[item] ? RESOURCES[item].color : '#fff');
      audio.play('pickup', { vol: 0.6 });
    }
    if (spill > 0 && game) {
      for (let i = 0; i < Math.min(spill, 6); i++) {
        game.dropPickup(item, 1, (fx == null ? this.x : fx) + rnd(-8, 8), (fy == null ? this.y : fy) + rnd(-6, 6));
      }
      if (item === 'wood') game.toast('BACK IS FULL - 10 LOGS MAX', P.uiWarn);
    }
    return taken;
  }

  // --- drawing -------------------------------------------------------------
  /**
   * The face. Derived, so it is always telling the truth about the state the
   * ferret is actually in rather than whatever was last set on it.
   */
  get expression() {
    if (this.dead) return 'dead';
    if (this.hurtT > 0.05) return 'hurt';
    if (this.hp < this.maxHp * 0.3) return 'hurt';
    if (this.overclock) return 'angry';
    if (this.meleeT > 0 || this.parryT > 0) return 'angry';
    if (this.combo >= 3) return 'happy';
    if (this.gatherT > 0) return 'focused';
    if (this.dashT > 0) return 'focused';
    return 'calm';
  }

  frames(anim, view) {
    return critterFrames('player', PLAYER_CFG, anim, view, 8, this.expression);
  }

  draw(r, game) {
    if (this.dead && this.deathT > 1.2) return;
    const time = game.time;

    // contact shadow, squashed when dashing
    r.shadow(this.x, this.y + 1, 5 + (this.dashT > 0 ? 2 : 0), 2.2);

    // Dash afterimages: the shape the body was actually in a few frames ago,
    // so at speed the ferret leaves a ribbon rather than a row of stamps.
    for (const a of this.afterimages) {
      if (!a.spine) continue;
      this.rig.drawGhost(r, a.spine, (a.life / a.maxLife) * 0.4, P.cyberDim);
    }

    const flipped = this.facing < 0;

    // Wood rides in a bundle over the shoulders, tracked to the live spine so
    // it stays on her back through every turn and bound.
    const drawWood = () => {
      const n = this.wood;
      if (n <= 0) return;
      const log = carryLogSprite(0);
      const sh = this.rig.shoulder(), hp = this.rig.hipNode();
      const bx = (sh.x + hp.x) / 2, by = (sh.y + hp.y) / 2;
      const ang = Math.atan2(hp.y - sh.y, hp.x - sh.x);
      const moving = Math.hypot(this.vx, this.vy) > 20;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 2), col = i % 2;
        const wob = Math.sin(time * 7 + i * 0.8) * (moving ? 0.7 : 0.15);
        const along = (col - 0.5) * 3.4;
        const lx = bx + Math.cos(ang) * along;
        const ly = by + Math.sin(ang) * along - 5 - row * 2.4 + wob;
        r.drawT(log, lx, ly, ang + Math.PI / 2 + wob * 0.04, 1, 1, 1);
      }
      r.line(sh.x, sh.y - 3, hp.x, hp.y - 3, '#4a3f2c', 1, 0.8);
    };

    if (this.view === 'front') drawWood();

    // hurt / overclock tinting, applied to the whole rig at once
    const flashing = this.hurtT > 0 && Math.floor(this.hurtT * 24) % 2 === 0;
    const invulnBlink = this.invuln > 0 && this.hurtT <= 0 && Math.floor(this.invuln * 14) % 2 === 0;
    let tint = null;
    if (flashing) tint = '#ffffff';
    else if (this.overclock && Math.floor(time * 18) % 3 === 0) tint = P.cyber;

    this.rig.draw(r, { alpha: invulnBlink ? 0.5 : 1, tint });

    if (this.view === 'back') drawWood();

    // carried animal, riding on the shoulders
    if (this.carrying) {
      const cf = this.carrying.sprite;
      const sh = this.rig.shoulder();
      if (cf) r.drawT(cf, sh.x + (flipped ? 4 : -4), sh.y - 8, Math.sin(time * 5) * 0.12, 0.8, 0.8);
    }

    // held weapon, rotated to the aim
    this.drawWeapon(r, game, flipped);

    // The guard window still needs to be visible, but a two-pixel arc swept
    // round the whole animal is a special effect, not information. A glint on
    // her teeth says the same thing and stays out of the way.
    if (this.parryT > 0) {
      const nose = this.rig.nose();
      const f = this.parryT / 0.18;
      const perfect = this.parryPerfectT > 0;
      r.rect(nose.x + Math.cos(this.lastMeleeAngle) * 3 - 1, nose.y + Math.sin(this.lastMeleeAngle) * 3 - 1,
        2, 2, perfect ? '#ffffff' : P.sulfurHi);
      if (perfect) r.glow(nose.x, nose.y, 4, 'rgba(255,255,255,0.5)', f);
    }
    // A parry actually landing does get a flash, because it is the single best
    // thing you can do in a fight and it should feel like it.
    if (this.parryFlash > 0) {
      const nose = this.rig.nose();
      r.ring(nose.x, nose.y, 6 + (1 - this.parryFlash) * 10, '#ffffff', 1, this.parryFlash * 0.7);
    }

    // shield bubble
    if (this.shieldUp) {
      const pulse = 0.5 + Math.sin(time * 4) * 0.12;
      const mid = this.rig.shoulder();
      r.ring(mid.x, mid.y, 12 + Math.sin(time * 3) * 0.8, P.springHot, 1, pulse * 0.8);
    }

    // Cybernetic eye glow, tracked to the actual skull the rig solved this
    // frame rather than to a fixed offset from the feet.
    // The optic is one pixel on a very small animal. A five-pixel bloom on it
    // buries the whole face, so it gets a glint, not a headlamp.
    const eye = this.rig.eyePos();
    r.glow(eye.x, eye.y, this.overclock ? 7 : 2.5,
      this.overclock ? 'rgba(180,245,255,0.7)' : 'rgba(77,225,255,0.35)', 1);

    // overclock aura
    if (this.overclock) {
      r.ring(this.x, this.y - 6, 14 + Math.sin(time * 12) * 2, P.cyber, 1, 0.35);
    }
  }

  drawWeapon(r, game, flipped) {
    if (this.weapon.meleeOnly) return;      // claws are already on your hands
    const w = this.weapon;
    const img = weaponSprite(w.art);
    // The gun rides on the shoulders the rig solved this frame, and it is
    // scaled down to something a two-kilo animal could plausibly hold.
    const sh = this.rig.shoulder();
    const GS = 0.62;
    const dist = 3.5 - this.recoil * 2;
    const gx = sh.x + Math.cos(this.aim) * dist;
    const gy = sh.y - 2 + Math.sin(this.aim) * dist * 0.6;
    const flipY = Math.cos(this.aim) < 0 ? -1 : 1;
    r.drawT(img, gx, gy, this.aim, GS, flipY * GS, 1, 2, img.height / 2);
    if (this.muzzleT > 0) {
      const mf = muzzleFlash(w.art === 'scatter' || w.art === 'lobber' ? 1.5 : 1);
      const i = Math.min(2, Math.floor((1 - this.muzzleT / 0.09) * 3));
      const md = ((WEAPON_MUZZLE[w.art] || 16) - 2) * GS;
      const mx = sh.x + Math.cos(this.aim) * md;
      const my = sh.y - 2 + Math.sin(this.aim) * md;
      r.ctx.globalCompositeOperation = 'lighter';
      r.drawT(mf[i], mx, my, this.aim, GS, flipY * GS, 1, 2, 6);
      r.ctx.globalCompositeOperation = 'source-over';
      r.glow(mx, my, 22, 'rgba(255,190,90,0.7)', 1);
    }
  }

  drawLight(r) {
    const eye = this.rig.eyePos();
    r.light(eye.x, eye.y, 84, 'rgba(255,240,210,0.55)', 0.9);
    if (this.overclock) r.light(this.x, this.y - 8, 60, 'rgba(120,220,255,0.7)', 0.8);
  }
}

export { MAX_WOOD };
