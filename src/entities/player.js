// The player: a black-footed ferret who was taken as a kit into a Les Nest
// laboratory and came back out with a cybernetic eye, a seam of stitches and
// two abilities nobody asked for. Movement, gathering, carrying, shooting,
// dashing, scanning and overclocking all live here.

import { PLAYER_CFG } from '../art/species.js';
import { critterFrames } from '../art/critters.js';
import { carryLogSprite, weaponSprite, WEAPON_MUZZLE, muzzleFlash } from '../art/items.js';
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
  update(dt, game) {
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
    this.blinkT += dt;

    // --- aim -------------------------------------------------------------
    const mw = game.r.camera.toWorld(input.mouse.sx, input.mouse.sy);
    this.aimX = mw.x; this.aimY = mw.y;
    this.aim = Math.atan2(mw.y - (this.y - 10), mw.x - this.x);

    // --- movement --------------------------------------------------------
    const ax = input.axes();
    const uiBlocked = game.uiBlocksInput;
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
      if (chance(dt * 60)) this.afterimages.push({ x: this.x, y: this.y, life: 0.22, maxLife: 0.22, view: this.view, facing: this.facing, anim: this.anim, t: this.animT });
      this.invuln = Math.max(this.invuln, 0.06);
    } else {
      const target = { x: moveX * speed, y: moveY * speed };
      const accel = moving ? 12 : 16;
      this.vx = damp(this.vx, target.x, 0.0001, dt * accel / 12);
      this.vy = damp(this.vy, target.y, 0.0001, dt * accel / 12);
    }

    this._move(this.vx * dt, this.vy * dt, world);

    // face the aim while shooting or standing, movement direction otherwise
    const aimingBack = Math.sin(this.aim) < -0.35;
    this.view = aimingBack ? 'back' : 'front';
    if (Math.abs(Math.cos(this.aim)) > 0.2) this.facing = Math.cos(this.aim) > 0 ? 1 : -1;

    // --- animation state --------------------------------------------------
    const spd = Math.hypot(this.vx, this.vy);
    let anim = 'idle';
    if (this.hurtT > 0.05) anim = 'hurt';
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

    // --- energy -----------------------------------------------------------
    const regenRate = this.dashT > 0 ? 0 : (moving ? 15 : 26);
    this.energy = clamp(this.energy + regenRate * dt, 0, this.maxEnergy);

    // --- overclock (the lab's other gift) ---------------------------------
    const wantOverclock = !uiBlocked && input.mouse.rdown && this.hp > 12;
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
    if (!uiBlocked && input.mouse.down && this.fireT <= 0 && this.gatherT <= 0) this.tryShoot(game);

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
    const muzzleDist = (WEAPON_MUZZLE[w.art] || 16) - 4;
    const ox = this.x + Math.cos(this.aim) * muzzleDist;
    const oy = this.y - 10 + Math.sin(this.aim) * muzzleDist;

    let dmg = w.damage * (1 + this.stats.damage) * (this.overclock ? 1.3 : 1);
    if (this.stats.overclock && this.hp < this.maxHp * 0.4) dmg *= 1 + this.stats.overclock;

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
  frames(anim, view) {
    return critterFrames('player', PLAYER_CFG, anim, view, anim === 'idle' ? 8 : 8);
  }

  draw(r, game) {
    if (this.dead && this.deathT > 1.2) return;
    const time = game.time;
    const fr = this.frames(this.anim, this.view);
    const idx = Math.floor(this.animT * fr.length) % fr.length;
    let img = fr[idx];
    const w = img.width, h = img.height;
    const bx = this.x - w / 2;
    const by = this.y - h + 2;

    // contact shadow, squashed when dashing
    r.shadow(this.x, this.y + 1, 6 + (this.dashT > 0 ? 2 : 0), 2.6);

    // dash afterimages
    for (const a of this.afterimages) {
      const af = critterFrames('player', PLAYER_CFG, a.anim, a.view, 8);
      const ai = af[Math.floor(a.t * af.length) % af.length];
      r.draw(ai, a.x - ai.width / 2, a.y - ai.height + 2, a.facing < 0, (a.life / a.maxLife) * 0.4);
    }

    const flipped = this.facing < 0;

    // Wood rides in a bundle behind the shoulder, offset away from the head so
    // the ferret stays readable even with a full ten-log load. Drawn behind the
    // body in front view, in front of it when you see their back.
    const drawWood = () => {
      const n = this.wood;
      if (n <= 0) return;
      const log = carryLogSprite(0);
      const dir = flipped ? -1 : 1;
      const moving = Math.hypot(this.vx, this.vy) > 20;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 2), col = i % 2;
        const wob = Math.sin(time * 7 + i * 0.8) * (moving ? 0.7 : 0.15);
        const lx = this.x - dir * (7 + col * 2);
        const ly = this.y - 9 - row * 2.6 - col * 0.8 + wob;
        r.drawT(log, lx, ly, -dir * 0.17 + wob * 0.03, dir, 1, 1);
      }
      // the strap that supposedly holds it all on
      r.line(this.x - dir * 11, this.y - 10, this.x + dir * 1, this.y - 6, '#4a3f2c', 1, 0.8);
    };

    if (this.view === 'front') drawWood();

    // hurt / overclock tinting
    const flashing = this.hurtT > 0 && Math.floor(this.hurtT * 24) % 2 === 0;
    const invulnBlink = this.invuln > 0 && this.hurtT <= 0 && Math.floor(this.invuln * 14) % 2 === 0;
    if (flashing) {
      const ff = flashFrames('player:' + this.anim + this.view, fr, '#ffffff');
      img = ff[idx];
    } else if (this.overclock) {
      const ff = flashFrames('player:oc:' + this.anim + this.view, fr, P.cyber);
      if (Math.floor(time * 18) % 3 === 0) img = ff[idx];
    }

    const squash = this.dashT > 0 ? 1.14 : 1;
    if (squash !== 1) {
      r.drawT(img, this.x, this.y - h / 2 + 2, 0, flipped ? -squash : squash, 1 / squash, invulnBlink ? 0.5 : 1);
    } else {
      r.draw(img, bx, by, flipped, invulnBlink ? 0.5 : 1);
    }

    if (this.view === 'back') drawWood();

    // carried animal
    if (this.carrying) {
      const cf = this.carrying.sprite;
      if (cf) r.drawT(cf, this.x + (flipped ? 5 : -5), this.y - h - 2, Math.sin(time * 5) * 0.12, 0.8, 0.8);
    }

    // held weapon, rotated to the aim
    this.drawWeapon(r, game, flipped);

    // shield bubble
    if (this.shieldUp) {
      const pulse = 0.5 + Math.sin(time * 4) * 0.12;
      r.ring(this.x, this.y - 8, 12 + Math.sin(time * 3) * 0.8, P.springHot, 1, pulse * 0.8);
    }

    // Cybernetic eye glow. Anchored to the skull in world units (not to the
    // sprite canvas, which carries headroom for taller species).
    const eyeX = this.x + (flipped ? -3.5 : 3.5);
    const eyeY = this.y - 16;
    r.glow(eyeX, eyeY, this.overclock ? 11 : 5, this.overclock ? 'rgba(180,245,255,0.8)' : 'rgba(77,225,255,0.5)', 1);

    // overclock aura
    if (this.overclock) {
      r.ring(this.x, this.y - 6, 14 + Math.sin(time * 12) * 2, P.cyber, 1, 0.35);
    }
  }

  drawWeapon(r, game, flipped) {
    const w = this.weapon;
    const img = weaponSprite(w.art);
    const dist = 5 - this.recoil * 3;
    const gx = this.x + Math.cos(this.aim) * dist;
    const gy = this.y - 10 + Math.sin(this.aim) * dist * 0.6;
    const flipY = Math.cos(this.aim) < 0 ? -1 : 1;
    r.drawT(img, gx, gy, this.aim, 1, flipY, 1, 2, img.height / 2);
    if (this.muzzleT > 0) {
      const mf = muzzleFlash(w.art === 'scatter' || w.art === 'lobber' ? 1.5 : 1);
      const i = Math.min(2, Math.floor((1 - this.muzzleT / 0.09) * 3));
      const md = (WEAPON_MUZZLE[w.art] || 16) - 2;
      const mx = this.x + Math.cos(this.aim) * md;
      const my = this.y - 10 + Math.sin(this.aim) * md;
      r.ctx.globalCompositeOperation = 'lighter';
      r.drawT(mf[i], mx, my, this.aim, 1, flipY, 1, 2, 6);
      r.ctx.globalCompositeOperation = 'source-over';
      r.glow(mx, my, 22, 'rgba(255,190,90,0.7)', 1);
    }
  }

  drawLight(r) {
    r.light(this.x, this.y - 8, 84, 'rgba(255,240,210,0.55)', 0.9);
    if (this.overclock) r.light(this.x, this.y - 8, 60, 'rgba(120,220,255,0.7)', 0.8);
  }
}

export { MAX_WOOD };
