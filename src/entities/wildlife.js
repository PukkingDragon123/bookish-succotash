// Wildlife and insects. Animals are placed once at worldgen and only simulated
// near the player; insects are spawned and reclaimed around the camera so the
// basin always looks busy without ever holding thousands of entities.
//
// During the fire sequence animals panic, and some become trapped — those are
// the ones you can pick up and carry to the den.

import { ANIMALS } from '../art/species.js';
import { critterFrames, critterSize } from '../art/critters.js';
import { bugFrames, bugGlow, FLYING_BUGS, fishFrames } from '../art/bugs.js';
import { P } from '../art/palette.js';
import { flashFrames } from '../art/pixel.js';
import { TAU, clamp, dist2, angleDiff } from '../engine/math.js';
import { rnd, pick, chance, makeRng } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { TS, isWater, isSolid, TILES } from '../world/tiles.js';

const SIM_RADIUS = 420;

export class Animal {
  constructor(key, x, y) {
    this.key = key;
    this.def = ANIMALS[key];
    this.x = x; this.y = y;
    this.hx = x; this.hy = y;              // home range centre
    this.vx = 0; this.vy = 0;
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.state = 'graze';
    this.stateT = rnd(1, 4);
    this.facing = chance(0.5) ? 1 : -1;
    this.view = 'front';
    this.anim = 'idle';
    this.animT = rnd(1);
    this.dir = rnd(TAU);
    this.trapped = false;
    this.rescued = false;
    this.dead = false;
    this.hurtT = 0;
    this.panicT = 0;
    this.objType = 'animal';
    this.bob = rnd(TAU);
    const s = critterSize(this.def.cfg);
    this.w = s.w; this.h = s.h;
    this.r = Math.max(4, this.def.cfg.bodyW * 0.8);
  }

  get sprite() {
    const fr = critterFrames('animal:' + this.key, this.def.cfg, this.anim, this.view, 8);
    return fr[Math.floor(this.animT * fr.length) % fr.length];
  }

  update(dt, game) {
    if (this.dead) return;
    const world = game.world;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.stateT -= dt;
    this.panicT = Math.max(0, this.panicT - dt);

    const p = game.player;
    const dPlayer = Math.sqrt(dist2(this.x, this.y, p.x, p.y));
    const fireHere = game.fire.burnAtPx(this.x, this.y);
    const nearFire = game.fire.active && game.fireNear(this.x, this.y, 90);

    if (this.trapped) {
      this.anim = 'sit';
      this.animT = (this.animT + dt * 1.6) % 1;
      if (fireHere > 0) this.hp -= dt * 4;
      if (chance(dt * 2.2)) particles.text(this.x, this.y - this.h - 2, '!', P.uiBad, { life: 0.7, vy: -14 });
      if (this.hp <= 0) this.die(game, true);
      return;
    }

    // --- decide ---------------------------------------------------------
    let flee = null;
    if (fireHere > 0 || nearFire) {
      this.state = 'panic';
      this.panicT = 2.2;
      flee = game.nearestFire(this.x, this.y, 160);
      this.hp -= fireHere > 0 ? dt * 6 : 0;
      if (fireHere > 0 && chance(dt * 3)) particles.embers(this.x, this.y - 4, 1);
    } else if (dPlayer < 60 && !this.def.kin) {
      this.state = 'flee';
      flee = { x: p.x, y: p.y };
    } else {
      const threat = game.nearestEnemy(this.x, this.y, 110);
      if (threat) { this.state = 'flee'; flee = threat; }
      else if (this.panicT > 0) this.state = 'panic';
      else if (this.stateT <= 0) {
        this.state = chance(0.55) ? 'graze' : 'wander';
        this.stateT = rnd(1.8, 5);
        this.dir = rnd(TAU);
      }
    }

    // --- act ------------------------------------------------------------
    let speed = 0;
    switch (this.state) {
      case 'graze':
        speed = 0;
        this.anim = chance(dt * 0.4) ? 'sit' : 'idle';
        break;
      case 'wander': {
        speed = this.def.speed * 0.4;
        // drift back toward the home range so herds don't disperse forever
        const home = Math.atan2(this.hy - this.y, this.hx - this.x);
        const d = Math.sqrt(dist2(this.x, this.y, this.hx, this.hy));
        if (d > 190) this.dir += clamp(angleDiff(this.dir, home), -dt * 2, dt * 2);
        else this.dir += rnd(-1, 1) * dt * 1.6;
        this.anim = 'walk';
        break;
      }
      case 'flee':
      case 'panic': {
        speed = this.def.speed * (this.state === 'panic' ? 1.15 : 1);
        if (flee) this.dir = Math.atan2(this.y - flee.y, this.x - flee.x) + rnd(-0.4, 0.4);
        this.anim = 'run';
        if (this.state === 'panic' && chance(dt * 1.4)) {
          particles.text(this.x, this.y - this.h, '!', P.uiWarn, { life: 0.6, vy: -18 });
        }
        break;
      }
      default: break;
    }

    if (this.def.flying) speed *= 1.25;

    // steer away from water and cliffs
    const ahead = 14;
    const tx = this.x + Math.cos(this.dir) * ahead, ty = this.y + Math.sin(this.dir) * ahead;
    const t = world.tileAtPx(tx, ty);
    const bad = (isSolid(t) || (isWater(t) && !this.def.water && !this.def.flying) || TILES[t].hot);
    if (bad) this.dir += (chance(0.5) ? 1 : -1) * dt * 6;

    this.vx = Math.cos(this.dir) * speed;
    this.vy = Math.sin(this.dir) * speed;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const nt = world.tileAtPx(nx, ny);
    if (!isSolid(nt) && (this.def.flying || this.def.water || !TILES[nt].deep)) {
      this.x = clamp(nx, 8, world.pxW - 8);
      this.y = clamp(ny, 8, world.pxH - 8);
    } else {
      this.dir += Math.PI * 0.6;
    }

    if (Math.abs(this.vx) > 1) this.facing = this.vx > 0 ? 1 : -1;
    this.view = this.vy < -6 ? 'back' : 'front';
    const rate = this.anim === 'run' ? 1.9 : this.anim === 'walk' ? 1.1 : 0.5;
    this.animT = (this.animT + dt * rate) % 1;

    if (speed > 6 && chance(dt * 5)) {
      particles.dust(this.x, this.y + 1, 1, TILES[world.tileAtPx(this.x, this.y)].dark || P.dirt);
    }

    if (this.hp <= 0) this.die(game);
  }

  damage(n, game, byPoacher = false) {
    if (this.dead) return;
    this.hp -= n;
    this.hurtT = 0.22;
    this.panicT = 4;
    this.state = 'panic';
    particles.blood(this.x, this.y - 6, 5);
    audio.play('flesh', { vol: 0.5 });
    if (this.hp <= 0) this.die(game, false, byPoacher);
  }

  die(game, byFire = false, byPoacher = false) {
    if (this.dead) return;
    this.dead = true;
    particles.blood(this.x, this.y - 5, 10);
    game.onAnimalLost(this, byFire, byPoacher);
  }

  draw(r, game) {
    if (this.dead) return;
    const img = this.sprite;
    if (!img) return;
    r.shadow(this.x, this.y, this.r + 1, (this.r + 1) * 0.4);
    let out = img;
    if (this.hurtT > 0 && Math.floor(this.hurtT * 30) % 2 === 0) {
      const fr = critterFrames('animal:' + this.key, this.def.cfg, this.anim, this.view, 8);
      out = flashFrames('animal:' + this.key + this.anim + this.view, fr, '#ffffff')[Math.floor(this.animT * fr.length) % fr.length];
    }
    const yOff = this.def.flying ? -10 - Math.sin(this.bob + game.time * 3) * 2 : 0;
    r.draw(out, this.x - img.width / 2, this.y - img.height + 2 + yOff, this.facing < 0);
    if (this.trapped) {
      const pulse = 0.5 + Math.sin(game.time * 7) * 0.4;
      r.ring(this.x, this.y - 6, 12, P.uiWarn, 1, pulse);
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
    const d2 = dist2(this.x, this.y, p.x, p.y);
    if (d2 < 26 * 26) {
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
    r.draw(img, this.x - img.width / 2, this.y - img.height - this.z);
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
    r.draw(img, this.x - img.width / 2, this.y - img.height / 2, Math.cos(this.dir) < 0, 0.75);
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
    // herds and singletons scattered by biome
    const plan = [
      ['bison', 14, [6, 8, 9, 10]],       // meadow / sage
      ['elk', 12, [6, 7, 8]],
      ['pronghorn', 10, [8, 9, 10]],
      ['wolf', 6, [7, 6]],
      ['coyote', 8, [8, 9, 10]],
      ['fox', 7, [6, 7, 8]],
      ['marmot', 12, [4, 11, 5]],
      ['pika', 12, [4, 11]],
      ['hare', 12, [8, 9, 10]],
      ['bighorn', 6, [4, 11, 19]],
      ['beaver', 5, [2, 3]],
      ['otter', 5, [2, 3]],
      ['raven', 10, [6, 7, 8, 9]],
      ['magpie', 10, [8, 9, 10]],
      ['eagle', 4, [6, 7, 8]],
      ['crane', 5, [2, 3, 8]],
      ['ferretWild', 10, [8, 9, 10, 6]],
      ['kit', 8, [8, 9, 6]],
    ];
    for (const [key, count, tiles] of plan) {
      let placed = 0, guard = 0;
      while (placed < count && guard++ < count * 400) {
        const tx = rng.int(3, w.w - 4), ty = rng.int(3, w.h - 4);
        const id = w.tileAt(tx, ty);
        if (!tiles.includes(id)) continue;
        const x = tx * TS + TS / 2, y = ty * TS + TS / 2;
        // a few of each key spawn as a loose family group
        const groupSize = (key === 'bison' || key === 'elk' || key === 'pronghorn') ? rng.int(2, 5) : 1;
        for (let g = 0; g < groupSize && placed < count; g++) {
          this.animals.push(new Animal(key, x + rng.range(-40, 40), y + rng.range(-30, 30)));
          placed++;
        }
      }
    }
    // trout in the river
    let f = 0, guard = 0;
    while (f < 40 && guard++ < 20000) {
      const tx = this.rng.int(2, w.w - 3), ty = this.rng.int(2, w.h - 3);
      if (!isWater(w.tileAt(tx, ty))) continue;
      if (TILES[w.tileAt(tx, ty)].hot) continue;
      this.fish.push(new Fish(tx * TS + 8, ty * TS + 8));
      f++;
    }
  }

  /** Wildlife near the den that a rescue mission can target. */
  nearestRescuable(x, y, r) {
    let best = null, bd = r * r;
    for (const a of this.animals) {
      if (a.dead || !a.trapped) continue;
      const d = dist2(x, y, a.x, a.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  trapNear(x, y, radius, count) {
    const cands = this.animals.filter(a => !a.dead && !a.trapped && dist2(a.x, a.y, x, y) < radius * radius);
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
      if (dist2(a.x, a.y, p.x, p.y) > SIM_RADIUS * SIM_RADIUS && !a.trapped) continue;
      a.update(dt, game);
    }
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
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
    // top up the population just outside the view so they drift in naturally
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
    for (const a of this.animals) if (!a.dead && cam.visible(a.x, a.y, 40)) out.push(a);
    for (const b of this.bugs) if (cam.visible(b.x, b.y, 20)) out.push(b);
  }

  drawFish(r, cam) {
    for (const f of this.fish) if (cam.visible(f.x, f.y, 20)) f.draw(r);
  }
}
