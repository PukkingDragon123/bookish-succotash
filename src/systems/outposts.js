// Les Nest outposts, and the pressure they put on you.
//
// The old loop was: a timer counts down, they come to you, you kill them, the
// timer resets. Forty-five seconds of gathering between fights you did not
// choose, forever. It made the whole basin into a corridor between the den and
// wherever the arrow said.
//
// So the pressure now has a *source you can go and remove*. Les Nest holds a
// handful of outposts out in the basin. Each one broadcasts, and the total
// broadcast is what eventually sends a patrol at your camp. Raze one and that
// pressure is gone for good — the tempo of the whole game is a dial you turn
// by walking somewhere and doing something about it.
//
// You can still stand at the den and fight what comes. It is simply the worst
// way to play, which is the correct relationship between a defensive option
// and an offensive one.

import { TS } from '../world/tiles.js';
import { P } from '../art/palette.js';
import { rnd, pick, makeRng } from '../engine/rng.js';
import { audio } from '../engine/audio.js';
import { particles } from '../engine/particles.js';
import { clamp } from '../engine/math.js';

/**
 * What an outpost is built around. The core is the thing you actually have to
 * destroy; killing the garrison alone just means they send more.
 */
export const OUTPOST_KINDS = {
  mast: {
    label: 'Relay Mast', core: 'mast', hp: 260, pressure: 1.4,
    desc: 'Calls the patrols in. Loudest thing in the basin.',
    garrison: [['poacher', 3], ['drone', 2], ['technician', 1]],
    loot: { scrap: 8, powder: 3, wire: 4 },
  },
  fuel: {
    label: 'Fuel Dump', core: 'tank', hp: 200, pressure: 1.0,
    desc: 'Drums stacked four high. Do not shoot it from close up.',
    garrison: [['poacher', 2], ['logger', 2], ['trapper', 1]],
    loot: { fuel: 6, powder: 6, scrap: 4 },
    blast: 120,
  },
  cages: {
    label: 'Holding Pens', core: 'cages', hp: 180, pressure: 1.1,
    desc: 'Whatever they caught this week, waiting for the truck.',
    garrison: [['trapper', 3], ['poacher', 2]],
    loot: { scrap: 5, sinew: 4 },
    frees: 4,
  },
  mill: {
    label: 'Cut Yard', core: 'saw', hp: 300, pressure: 1.3,
    desc: 'They are taking the grove out a hundred trunks at a time.',
    garrison: [['logger', 4], ['spider', 1], ['technician', 1]],
    loot: { hardwood: 10, scrap: 6, fuel: 3 },
  },
  battery: {
    label: 'Gun Battery', core: 'turret', hp: 340, pressure: 1.6,
    desc: 'Automated, and it does not need anybody awake to work.',
    garrison: [['turret', 2], ['enforcer', 1], ['drone', 3]],
    loot: { scrap: 12, powder: 8, wire: 6 },
  },
};

export const OUTPOST_KEYS = Object.keys(OUTPOST_KINDS);

let nextId = 1;

export class Outpost {
  constructor(kind, x, y, landmark = null) {
    this.id = nextId++;
    this.kind = kind;
    this.def = OUTPOST_KINDS[kind];
    this.x = x; this.y = y;
    this.r = 84;                         // how far the garrison holds
    this.landmark = landmark;
    this.name = landmark ? landmark.name : this.def.label;
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.razed = false;
    this.found = false;
    this.spawned = false;                // garrison built when you first arrive
    this.guards = [];
    this.alerted = false;
    this.alarmT = 0;
    this.rebuildT = 0;
  }

  get pressure() { return this.razed ? 0 : this.def.pressure; }
  get cleared() { return this.razed; }

  /** True when the player is close enough that the garrison should exist. */
  inRange(x, y, pad = 260) {
    return Math.hypot(x - this.x, y - this.y) < this.r + pad;
  }

  damage(n, game) {
    if (this.razed) return;
    this.hp -= n;
    particles.burst(this.x + rnd(-10, 10), this.y - rnd(4, 18), 4, {
      colors: ['#c8a04a', '#8a6a30', '#5c5048'], speed: 70, life: 0.4, gravity: 180, vz: 30,
    });
    if (!this.alerted) this.alert(game);
    if (this.hp <= 0) this.raze(game);
  }

  alert(game) {
    if (this.alerted) return;
    this.alerted = true;
    this.alarmT = 3;
    audio.play('alarm', { vol: 0.5 });
    game.toast(this.name.toUpperCase() + ' — ALARM', P.uiBad);
  }

  raze(game) {
    this.razed = true;
    this.hp = 0;
    audio.play('boom', { vol: 0.9 });
    game.r.camera.addShake(9);
    for (let i = 0; i < 60; i++) {
      particles.spawn({
        x: this.x + rnd(-18, 18), y: this.y + rnd(-8, 8), z: rnd(0, 20),
        vx: rnd(-90, 90), vy: rnd(-70, 70), vz: rnd(40, 140),
        life: rnd(0.5, 1.4), size: 1 + (Math.random() * 2 | 0),
        color: pick(['#e8a03a', '#c46a22', '#6b5a4a', '#2a2420']), gravity: 220,
      });
    }
    if (this.def.blast) {
      for (const e of game.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < this.def.blast) e.damage(200 * (1 - d / this.def.blast), game, { melee: false });
      }
    }
    if (this.landmark) this.landmark.cleared = true;
    game.onOutpostRazed(this);
  }
}

/**
 * The board: which outposts exist, how loud they are, and when that noise
 * finally turns into somebody knocking on your door.
 */
export class Occupation {
  constructor(seed) {
    this.rng = makeRng((seed ^ 0x0f5ea7) >>> 0);
    this.outposts = [];
    this.heat = 0;                // 0..1, fills from standing outposts
    this.patrolT = 0;
    this.patrols = 0;
    this.razed = 0;
  }

  /** Put an outpost on some of the basin's landmarks. */
  seed(world) {
    const cands = world.landmarks.filter(l => l.kind !== 'cache' && l.kind !== 'lookout');
    // sort by distance from the den so the near ones are the soft ones
    cands.sort((a, b) => Math.hypot(a.x - world.den.x, a.y - world.den.y)
                       - Math.hypot(b.x - world.den.x, b.y - world.den.y));
    // What they put where. A cut yard goes in a grove because that is what
    // they are cutting; a battery goes on the talus because that is the ground
    // worth holding. The near ones are the soft ones, so the first raid you
    // pick is winnable with a pipe gun and some nerve.
    const prefers = {
      grove: 'mill', dam: 'mill',
      spring: 'cages', boneyard: 'cages',
      burn: 'fuel', hotspring: 'fuel',
      talus: 'battery', hoodoo: 'mast',
    };
    const ladder = ['cages', 'fuel', 'mast', 'mill', 'battery', 'mast'];
    const n = Math.min(cands.length, 6);
    for (let i = 0; i < n; i++) {
      const l = cands[Math.floor(i * cands.length / n)];
      if (!l || l.outpost) continue;
      // near outposts stay soft even if the terrain suggests a battery
      const want = prefers[l.kind] || ladder[Math.min(i, ladder.length - 1)];
      const kind = i < 2 && (want === 'battery' || want === 'mast')
        ? ladder[i] : want;
      const o = new Outpost(kind, l.x, l.y, l);
      l.outpost = o;
      this.outposts.push(o);
    }
  }

  get standing() { return this.outposts.filter(o => !o.razed); }
  get totalPressure() { return this.standing.reduce((a, o) => a + o.pressure, 0); }

  /**
   * Heat fills at a rate set by what is still standing: about two minutes
   * between patrols with everything up, ten with one mast left, and never
   * once the last of them is down. That last state — the basin going quiet
   * because of something you did — is the win condition for this half of the
   * game, and it is why the rate has to be slow enough that you notice it
   * slowing.
   */
  update(dt, game) {
    const p = this.totalPressure;
    if (p <= 0) { this.heat = Math.max(0, this.heat - dt * 0.02); return; }
    this.heat += dt * p * 0.0012;
    if (this.heat >= 1) {
      this.heat = 0;
      this.patrols++;
      game.sendPatrol(Math.min(6, 2 + Math.floor(this.patrols * 0.7)), this.patrols);
    }
  }

  /** Minutes-ish until the next patrol, for the HUD. */
  timeToPatrol() {
    const p = this.totalPressure;
    if (p <= 0) return Infinity;
    return (1 - this.heat) / (p * 0.0012);
  }
}
