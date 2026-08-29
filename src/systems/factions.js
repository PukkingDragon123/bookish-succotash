// Alliances.
//
// You could already befriend an individual animal: feed it, it follows you,
// eventually it fights for you. That is a relationship with one elk. It is not
// an alliance, because nothing you do for that elk means anything to the rest
// of the herd, and there was no way to be *owed* something by a group.
//
// So the basin now has four powers in it, and they keep score:
//
//   THE HERD    elk, bison, moose, pronghorn, bighorn. Slow to trust, and the
//               heaviest thing you can bring to a fight.
//   THE PACK    wolf, coyote, fox, bear. Interested in whether you can hunt.
//   THE FLOCK   raven, magpie, eagle, crane. They watch everything and they
//               will tell you what they saw.
//   THE BURROW  hare, marmot, pika, squirrel, beaver, otter, hedgehog, ferrets.
//               Small, numerous, and they know where everything is buried.
//   RIDGE FOLK  the humans who stayed. They build, and they hold a grudge.
//
// Standing goes up when you do something the faction cares about — freeing
// their kin from a pen, razing the outpost squatting on their ground, hauling
// them what they asked for. At thresholds they open up: a passive that changes
// how you play, a gift, and finally the thing worth having, which is that they
// turn up to your raids without being asked.

import { P } from '../art/palette.js';
import { audio } from '../engine/audio.js';
import { particles } from '../engine/particles.js';

export const FACTIONS = {
  herd: {
    name: 'The Herd', short: 'HERD', color: '#9d7845',
    members: ['elk', 'bison', 'moose', 'pronghorn', 'bighorn'],
    voice: 'A bull elk watches you from the treeline and does not run.',
    tiers: [
      { at: 25, title: 'Tolerated', gift: { hardwood: 6 },
        text: 'They stop moving off when you come over the rise.' },
      { at: 55, title: 'Kin-marked', passive: 'graze',
        text: 'Where the herd has grazed, the ground gives up more forage.' },
      { at: 85, title: 'Sworn', ally: ['bison', 'elk', 'moose'], allies: 2,
        text: 'They will come when you raid. Get out of the way when they do.' },
    ],
  },
  pack: {
    name: 'The Pack', short: 'PACK', color: '#8b8370',
    members: ['wolf', 'coyote', 'fox', 'bear'],
    voice: 'Something grey keeps pace with you, one ridge over.',
    tiers: [
      { at: 25, title: 'Watched', gift: { sinew: 6 },
        text: 'They stop treating you as something to be counted.' },
      { at: 55, title: 'Run-with', passive: 'track',
        text: 'The pack marks what it finds. Outposts show on your map unfound.' },
      { at: 85, title: 'Sworn', ally: ['wolf', 'coyote'], allies: 3,
        text: 'They hunt with you now. They will take the flanks.' },
    ],
  },
  flock: {
    name: 'The Flock', short: 'FLOCK', color: '#4e6280',
    members: ['raven', 'magpie', 'eagle', 'crane'],
    voice: 'A raven drops a bright bit of wire at your feet and waits.',
    tiers: [
      { at: 20, title: 'Noticed', gift: { wire: 4 },
        text: 'They bring you things. Mostly rubbish. Occasionally not.' },
      { at: 50, title: 'Spoken-to', passive: 'scout',
        text: 'They fly your ground. Landmarks name themselves from twice as far.' },
      { at: 80, title: 'Sworn', ally: ['raven', 'eagle'], allies: 3,
        text: 'They go in first and they take the eyes out of the drones.' },
    ],
  },
  burrow: {
    name: 'The Burrow', short: 'BURROW', color: '#a58a62',
    members: ['hare', 'marmot', 'pika', 'squirrel', 'beaver', 'otter', 'hedgehog', 'ferretWild', 'kit'],
    voice: 'Something small has left three good mushrooms on the workbench.',
    tiers: [
      { at: 20, title: 'Sheltered', gift: { clay: 6, reeds: 6 },
        text: 'The small ones stop bolting. Some of them follow.' },
      { at: 50, title: 'Dug-in', passive: 'cache',
        text: 'They know where things are buried. Caches show on your map.' },
      { at: 80, title: 'Sworn', ally: ['ferretWild', 'otter', 'hedgehog'], allies: 4,
        text: 'They swarm. It is not dignified and it works.' },
    ],
  },
  ridge: {
    name: 'Ridge Folk', short: 'RIDGE', color: '#c8a04a',
    members: [],
    voice: 'Somebody has left a lamp burning at the workbench for you.',
    tiers: [
      { at: 25, title: 'Neighbour', gift: { scrap: 8 },
        text: 'They build for you at cost.' },
      { at: 55, title: 'One of us', passive: 'forge',
        text: 'The forge runs hotter. Crafting costs a quarter less.' },
      { at: 85, title: 'Sworn', ally: ['ridge'], allies: 2,
        text: 'Two of them will walk into a raid alongside you, which is more than they owe anybody.' },
    ],
  },
};

export const FACTION_KEYS = Object.keys(FACTIONS);

/** Which faction an animal belongs to, if any. */
export function factionOf(key) {
  for (const f of FACTION_KEYS) {
    if (FACTIONS[f].members.includes(key)) return f;
  }
  return null;
}

export class Alliances {
  constructor() {
    this.standing = {};
    this.tier = {};
    this.seen = {};
    for (const k of FACTION_KEYS) { this.standing[k] = 0; this.tier[k] = -1; this.seen[k] = false; }
    this.log = [];
  }

  get(k) { return this.standing[k] || 0; }
  tierOf(k) { return this.tier[k]; }

  /** Everything a faction has unlocked so far. */
  passives(k) {
    const f = FACTIONS[k];
    const out = [];
    for (let i = 0; i <= this.tier[k]; i++) if (f.tiers[i] && f.tiers[i].passive) out.push(f.tiers[i].passive);
    return out;
  }

  has(passive) {
    for (const k of FACTION_KEYS) if (this.passives(k).includes(passive)) return true;
    return false;
  }

  /** How many allies a faction will send to a raid. */
  alliesFrom(k) {
    const f = FACTIONS[k];
    for (let i = f.tiers.length - 1; i >= 0; i--) {
      if (i <= this.tier[k] && f.tiers[i].ally) return f.tiers[i];
    }
    return null;
  }

  /**
   * Move a faction's opinion of you.
   *
   * Everything routes through here so the reason can be reported: standing
   * that moves without telling you why is just a number going up.
   */
  add(k, n, game, reason) {
    if (!FACTIONS[k]) return;
    const before = this.standing[k];
    this.standing[k] = Math.max(0, Math.min(100, before + n));
    if (this.standing[k] === before) return;
    const f = FACTIONS[k];
    if (n > 0 && game) {
      game.toast(f.short + ' ' + (n > 0 ? '+' : '') + Math.round(n) + (reason ? '  ' + reason : ''), f.color);
    } else if (n < 0 && game) {
      game.toast(f.short + ' ' + Math.round(n) + (reason ? '  ' + reason : ''), P.uiBad);
    }
    this.checkTier(k, game);
  }

  checkTier(k, game) {
    const f = FACTIONS[k];
    for (let i = 0; i < f.tiers.length; i++) {
      if (this.tier[k] >= i) continue;
      if (this.standing[k] < f.tiers[i].at) break;
      this.tier[k] = i;
      const t = f.tiers[i];
      if (game) {
        game.bigToast(f.name.toUpperCase() + ' — ' + t.title.toUpperCase(), t.text, f.color);
        audio.play('levelup', { vol: 0.7 });
        if (t.gift) {
          for (const [item, n] of Object.entries(t.gift)) game.player.inv.add(item, n);
          game.toast('A gift is waiting at the den.', f.color);
        }
        if (game.player) {
          for (let p = 0; p < 22; p++) {
            particles.spawn({
              x: game.player.x + (Math.random() - 0.5) * 24, y: game.player.y - 6, z: Math.random() * 10,
              vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 30, vz: 30 + Math.random() * 40,
              life: 0.9, size: 1, color: f.color, gravity: 40,
            });
          }
        }
      }
    }
  }
}
