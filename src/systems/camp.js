// The camp you do not have.
//
// You arrive in the basin out of a burning transport with a stolen pistol and
// nothing else. There is no den, no workbench, no forge, no fire — just a
// clearing where those things could go. Everything downstream of crafting is
// behind somebody else's hands, and the only way to get any of it is to walk
// up to a neighbour, ask, and then go and find what they need.
//
// That is the whole point of the opening hour: the ferret is not a survivor
// with a base, it is an escaped lab animal asking strangers for help.

import { P } from '../art/palette.js';
import { audio } from '../engine/audio.js';
import { particles } from '../engine/particles.js';
import { TS } from '../world/tiles.js';
import { rnd, chance } from '../engine/rng.js';

/**
 * Everything that can be raised in the clearing, who is willing to raise it,
 * and what they want for it. `needs` is checked against another structure so
 * the camp goes up in a sensible order rather than all at once.
 */
export const STRUCTURES = {
  firepit: {
    name: 'Fire Pit', kind: 'firepit', prop: { type: 'prop' },
    builder: 'ember', cost: { wood: 6, stone: 4 }, buildTime: 4,
    offset: { x: 0, y: 0 },
    desc: 'Somewhere warm. Everything else goes up around it.',
    offer: "You're shaking. I know that shake, I did it for a week after I got out too.\nGet me six logs and four stones and I'll build us a fire. Then we can think.",
    done: "There. Sit down for a second. Nobody is going to shoot you in the next minute.",
    unlock: 'The camp has a centre now. The others will come to it.',
  },
  workbench: {
    name: 'Workbench', kind: 'workbench', prop: { type: 'station', station: 'workbench' },
    builder: 'brindle', cost: { wood: 12, stone: 6 }, buildTime: 5, needs: 'firepit',
    offset: { x: -46, y: 10 },
    desc: 'Powder, rounds, anything that has to be measured.',
    offer: "You want rounds? Rounds come off a bench, and there is no bench.\nTwelve logs, six stone. I'll cut the joints myself, I'm not having you do it.",
    done: "Bench. Flat, level, and it will still be here in ten years. Now we can work.",
    unlock: 'GUNPOWDER AND ROUNDS UNLOCKED  -  TAB TO CRAFT',
  },
  forge: {
    name: 'Forge', kind: 'forge', prop: { type: 'station', station: 'forge' },
    builder: 'thermal', cost: { stone: 14, iron: 6, wood: 4 }, buildTime: 6, needs: 'workbench',
    offset: { x: 46, y: 12 },
    desc: 'Heat. Guns, charcoal, anything that has to be beaten into shape.',
    offer: "Ohhh, you want a FORGE. Yes. Yes! There's a vent forty paces that way doing nothing —\nfourteen stone, six iron, four logs and I will plumb the ground itself into it.",
    done: "It's drawing! Listen to it draw! Don't touch the stones, they're at four hundred.",
    unlock: 'FORGE ONLINE  -  WEAPONS AND CHARCOAL UNLOCKED',
  },
  den: {
    name: 'The Den', kind: 'den', prop: { type: 'den' }, builder: 'juniper',
    cost: { wood: 16, fiber: 10 }, buildTime: 6, needs: 'firepit',
    offset: { x: 0, y: -6 },
    desc: 'Somewhere for the kits. Somewhere for you to wake up when you fall.',
    offer: "There are four kits sleeping under a log two ridges from here because there is nowhere else.\nSixteen logs and ten fibre. Not for you. For them.",
    done: "Look at that. Dry, deep, and out of the wind. You did that.",
    unlock: 'THE DEN IS OPEN  -  YOU RESPAWN HERE NOW',
  },
  drying: {
    name: 'Drying Rack', kind: 'logPile', prop: { type: 'prop' }, builder: 'quill',
    cost: { wood: 8, fiber: 6 }, buildTime: 4, needs: 'den',
    offset: { x: 22, y: -26 },
    desc: 'Salve, bandage, tincture. Fussy work, but you stop bleeding faster.',
    offer: "I cannot make anything worth having on wet ground, and I will not pretend otherwise.\nEight logs, six fibre, a proper rack. Then I can work.",
    done: "Now it is a clinic and not a puddle. Sit still, I am going to look at those stitches.",
    unlock: 'SALVE CRAFTING IMPROVED',
  },
  palisade: {
    name: 'Palisade', kind: 'crate', prop: { type: 'prop' }, builder: 'bramble',
    cost: { wood: 20, stone: 10 }, buildTime: 7, needs: 'forge',
    offset: { x: -22, y: -28 },
    desc: 'Something between them and the clearing.',
    offer: "Open ground. No cover. You want to die here? Twenty logs, ten stone.\nI dig, you carry. That is the arrangement.",
    done: "Dug in. It will not stop a machine but it will slow one down, and slow is enough.",
    unlock: 'BARRICADES RAISED AROUND THE CAMP',
  },
};

export const STRUCTURE_KEYS = Object.keys(STRUCTURES);

export class Camp {
  constructor(site) {
    this.site = site;                // { x, y } — the clearing
    this.built = new Set();
    this.building = null;            // { key, npc, t, total }
    this.announced = new Set();
  }

  has(key) { return this.built.has(key); }
  get hasWorkbench() { return this.built.has('workbench'); }
  get hasForge() { return this.built.has('forge'); }
  get hasDen() { return this.built.has('den'); }
  get count() { return this.built.size; }

  /** Where a given structure goes, in world coordinates. */
  siteFor(key) {
    const d = STRUCTURES[key];
    return { x: this.site.x + d.offset.x, y: this.site.y + d.offset.y };
  }

  /** Can this one be asked for yet? */
  available(key) {
    const d = STRUCTURES[key];
    if (!d || this.built.has(key)) return false;
    return !d.needs || this.built.has(d.needs);
  }

  /** The structures this NPC could offer to build, in order. */
  offersFor(npcKey) {
    return STRUCTURE_KEYS.filter(k => STRUCTURES[k].builder === npcKey && this.available(k));
  }

  /** Start the construction animation. The prop appears when it finishes. */
  beginBuild(key, npc, game) {
    const d = STRUCTURES[key];
    this.building = { key, npc, t: 0, total: d.buildTime };
    npc.state = 'building';
    npc.buildTarget = this.siteFor(key);
    game.toast(npc.name.toUpperCase() + ' IS BUILDING THE ' + d.name.toUpperCase(), P.uiGood, 4);
  }

  update(dt, game) {
    const b = this.building;
    if (!b) return;
    const d = STRUCTURES[b.key];
    const at = this.siteFor(b.key);
    const npc = b.npc;

    // walk over, then work
    const dx = at.x - npc.x, dy = at.y + 16 - npc.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 18) {
      const sp = 46 * dt;
      npc.x += (dx / dist) * sp;
      npc.y += (dy / dist) * sp;
      npc.anim = 'walk';
      npc.facing = dx > 0 ? 1 : -1;
      return;
    }

    npc.anim = 'work';
    npc.facing = at.x > npc.x ? 1 : -1;
    b.t += dt;
    // sawdust and hammer blows, so it is visibly happening
    if (chance(dt * 6)) {
      particles.woodChips(at.x + rnd(-8, 8), at.y - rnd(0, 10), 2);
      audio.play('chop', { vol: 0.3, pitch: 1.3 });
    }
    if (b.t >= b.total) this.finish(game);
  }

  finish(game) {
    const b = this.building;
    if (!b) return;
    const d = STRUCTURES[b.key];
    const at = this.siteFor(b.key);
    this.building = null;
    this.built.add(b.key);
    b.npc.state = 'idle';
    b.npc.buildTarget = null;

    // the structure goes into the world for real
    const prop = Object.assign(
      { x: at.x, y: at.y, kind: d.kind, variant: 0 }, d.prop);
    game.world.props.push(prop);
    game.world._insert(prop);

    audio.play('craft', { vol: 1 });
    audio.play('levelup', { vol: 0.7 });
    game.r.camera.addShake(3);
    particles.burst(at.x, at.y - 6, 22, {
      colors: ['#c8a878', '#8a6a48', P.uiGood], speed: 90, life: 0.9, vz: 90, gravity: 300, bounce: 0.3,
    });
    particles.ring(at.x, at.y - 4, 4, 40, 0.7, P.uiGood, 2, true);
    game.hud.showAnnounce(d.name.toUpperCase() + ' RAISED', d.unlock, P.uiGood, 4.5);

    if (b.key === 'den') game.world.den = { x: at.x, y: at.y };
    if (b.key === 'palisade') game.buildBarricades(1);
    game.onStructureBuilt(b.key, d);
  }

  /**
   * Raise everything at once. Used by the test harnesses, which need a
   * workbench to test crafting and should not have to play the opening hour
   * to get one.
   */
  grantAll(game) {
    for (const key of STRUCTURE_KEYS) {
      if (this.built.has(key)) continue;
      const d = STRUCTURES[key];
      const at = this.siteFor(key);
      const prop = Object.assign({ x: at.x, y: at.y, kind: d.kind, variant: 0 }, d.prop);
      game.world.props.push(prop);
      game.world._insert(prop);
      this.built.add(key);
      if (key === 'den') game.world.den = { x: at.x, y: at.y };
    }
    this.building = null;
  }

  /** Drawn under the entity list: a ghost of what could stand here. */
  drawGhosts(r, game) {
    const cam = r.camera;
    for (const key of STRUCTURE_KEYS) {
      if (!this.available(key)) continue;
      const at = this.siteFor(key);
      if (!cam.visible(at.x, at.y, 40)) continue;
      const pulse = 0.18 + Math.sin(game.time * 2 + at.x * 0.05) * 0.08;
      const d = STRUCTURES[key];
      const w = 22, h = 16;
      r.rectA(at.x - w / 2, at.y - h, w, h, P.uiDim, pulse * 0.5);
      // corner ticks, so it reads as a plot rather than a box
      for (const sx of [-1, 1]) {
        for (const sy of [0, 1]) {
          const cx = at.x + sx * w / 2, cy = at.y - h + sy * h;
          r.rectA(cx - (sx > 0 ? 4 : 0), cy - (sy ? 1 : 0), 4, 1, P.uiGood, pulse * 2.4);
          r.rectA(cx - (sx > 0 ? 1 : 0), cy - (sy ? 4 : 0), 1, 4, P.uiGood, pulse * 2.4);
        }
      }
    }
  }
}
