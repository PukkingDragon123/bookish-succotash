// Places.
//
// A big map is not the same thing as a map worth crossing. Before this, the
// basin was four hundred tiles of texture with a den in the middle: bigger
// just meant further to walk for the same grass. A place needs three things
// before it earns the walk — a name you can hold in your head, a silhouette
// you can recognise from a ridge away, and something there that is only there.
//
// So the generator lays down a dozen or so named sites, spaced out, matched to
// the terrain they belong on, and each one carries a reason: a seam of
// something you cannot dig anywhere else, a cache somebody left, a den full of
// animals that will remember you helped them, or a Les Nest outpost squatting
// on top of all of it.
//
// Landmarks are discovered, not given. You learn one by walking within sight
// of it, and the map screen fills in as you go.

import { T, TILES, TS, isWater, isSolid } from './tiles.js';
import { hash2 } from '../engine/rng.js';

export const DISCOVER_R = 190;      // how close before a place names itself

/**
 * The kinds of place the basin can grow.
 *
 * `want` scores a candidate tile — a spring wants water, a talus wants rock,
 * a lookout wants to be high. `yields` is what only this place has.
 */
export const SITE_KINDS = {
  spring: {
    label: 'Spring', icon: 'water', faction: 'burrow',
    names: ['Cold Spring', 'Elkwater', 'Sweetwater Seep', 'The Cistern'],
    want: (w, tx, ty) => w.nearTile(tx, ty, 3, isWater) * 4 + (w.elevAt(tx, ty) < 0.5 ? 2 : 0),
    yields: ['reeds', 'clay'],
    blurb: 'Clean water, and everything in the basin knows it.',
  },
  hotspring: {
    label: 'Hot Spring', icon: 'steam', faction: null,
    names: ['Sulphur Pots', 'The Kettle', 'Steamground', 'Yellow Pool'],
    want: (w, tx, ty) => (w.heatAt(tx, ty) > 0.35 ? 8 : -20),
    yields: ['sulfur', 'saltpeter'],
    blurb: 'Stinks of eggs. Everything you need for powder is in the crust.',
  },
  talus: {
    label: 'Talus', icon: 'rock', faction: null,
    names: ['The Slide', 'Broken Ground', 'Scree Fan', 'Rockfall'],
    want: (w, tx, ty) => w.nearTile(tx, ty, 3, isSolid) * 3 + w.elevAt(tx, ty) * 4,
    yields: ['obsidian', 'iron'],
    blurb: 'Loose rock all the way down. Good stone, bad footing.',
  },
  grove: {
    label: 'Grove', icon: 'tree', faction: 'herd',
    names: ['The Old Grove', 'Aspen Stand', 'Whitebark Hollow', 'Kin Grove'],
    want: (w, tx, ty) => (w.tileAt(tx, ty) === T.DUFF ? 6 : 0) + w.nearTile(tx, ty, 3, (id) => id === T.DUFF) * 2,
    yields: ['resin', 'hardwood'],
    blurb: 'Old trees, thick duff. The herds come here to calve.',
  },
  boneyard: {
    label: 'Boneyard', icon: 'bone', faction: 'pack',
    names: ['The Boneyard', 'Winterkill', 'The Ossuary', 'Long Bones'],
    want: (w, tx, ty) => (w.tileAt(tx, ty) === T.MEADOW_DRY || w.tileAt(tx, ty) === T.SAGE ? 5 : 0),
    yields: ['bone', 'sinew'],
    blurb: 'Where the winter leaves what it takes. The pack holds it.',
  },
  dam: {
    label: 'Beaver Dam', icon: 'water', faction: 'burrow',
    names: ['The Dam', 'Stickworks', 'Flood Meadow', 'Chewed Bend'],
    want: (w, tx, ty) => w.nearTile(tx, ty, 2, isWater) * 6,
    yields: ['hardwood', 'clay'],
    blurb: 'Built over generations. Les Nest keeps trying to blow it.',
  },
  hoodoo: {
    label: 'Hoodoos', icon: 'rock', faction: null,
    names: ['The Chimneys', 'Standing Stones', 'The Fingers', 'Ash Spires'],
    want: (w, tx, ty) => (w.tileAt(tx, ty) === T.ASH || w.tileAt(tx, ty) === T.SAGE ? 5 : 0) + w.elevAt(tx, ty) * 3,
    yields: ['saltpeter', 'obsidian'],
    blurb: 'Wind-cut columns of old ash. You can see the whole basin from the base.',
  },
  lookout: {
    label: 'Lookout', icon: 'eye', faction: 'flock',
    names: ['The Lookout', 'Raven Rock', 'High Seat', 'The Perch'],
    want: (w, tx, ty) => w.elevAt(tx, ty) * 10,
    yields: ['feather'],
    reveals: 700,
    blurb: 'High enough to see who is coming. The birds got here first.',
  },
  burn: {
    label: 'Burn', icon: 'fire', faction: null,
    names: ['The Old Burn', 'Blackstand', 'Charcoal Flat', 'Last Year’s Fire'],
    want: (w, tx, ty) => (w.tileAt(tx, ty) === T.CHARRED || w.tileAt(tx, ty) === T.ASH ? 8 : -6),
    yields: ['charcoal', 'fireweed'],
    blurb: 'It burned before. Fireweed first, then aspen, then nothing for years.',
  },
  cache: {
    label: 'Cache', icon: 'crate', faction: 'ridge',
    names: ['Trapper’s Cache', 'The Drop', 'Somebody’s Stash', 'The Cellar'],
    want: (w, tx, ty) => 2 + w.nearTile(tx, ty, 2, isSolid),
    yields: ['scrap', 'powder'],
    blurb: 'Somebody buried this and did not come back for it.',
  },
};

export const SITE_KEYS = Object.keys(SITE_KINDS);

let nextId = 1;

export class Landmark {
  constructor(kind, tx, ty, name) {
    this.id = nextId++;
    this.kind = kind;
    this.def = SITE_KINDS[kind];
    this.tx = tx; this.ty = ty;
    this.x = tx * TS + TS / 2;
    this.y = ty * TS + TS / 2;
    this.name = name;
    this.found = false;
    this.cleared = false;      // an outpost that stood here, razed
    this.outpost = null;       // set by the raid system if one squats here
    this.looted = false;
  }

  get faction() { return this.def.faction; }

  /** Distance at which the player learns its name. */
  discover(game, px, py) {
    if (this.found) return false;
    if (Math.hypot(px - this.x, py - this.y) > DISCOVER_R) return false;
    this.found = true;
    return true;
  }
}

/**
 * Lay out the basin's named places.
 *
 * Sites are placed one at a time by scoring a scatter of candidate tiles and
 * taking the best that is far enough from everything already placed. Spacing
 * is the important part: two landmarks within sight of each other are one
 * landmark with a confusing name.
 */
export function placeLandmarks(world, rng, opts = {}) {
  const minGap = opts.minGap || Math.min(world.w, world.h) * 0.17;
  const out = [];
  const used = new Map();

  // one of each kind first, then extras of the commoner sorts
  const order = SITE_KEYS.slice();
  const extras = ['spring', 'talus', 'grove', 'cache', 'boneyard', 'burn', 'hoodoo'];
  while (order.length < (opts.count || 15)) order.push(extras[order.length % extras.length]);

  for (const kind of order) {
    const def = SITE_KINDS[kind];
    let best = null, bestScore = -Infinity;
    for (let attempt = 0; attempt < 420; attempt++) {
      const tx = 6 + Math.floor(rng() * (world.w - 12));
      const ty = 6 + Math.floor(rng() * (world.h - 12));
      const id = world.tileAt(tx, ty);
      if (isWater(id) || isSolid(id)) continue;
      // keep clear of the camp — the point is that you have to go somewhere
      const dDen = Math.hypot(tx - world.den.tx, ty - world.den.ty);
      if (dDen < minGap * 0.8) continue;
      let ok = true;
      for (const o of out) {
        if (Math.hypot(tx - o.tx, ty - o.ty) < minGap) { ok = false; break; }
      }
      if (!ok) continue;
      let score = def.want(world, tx, ty) + rng() * 1.5;
      score += Math.min(dDen, minGap * 3) * 0.02;     // spread toward the edges
      if (score > bestScore) { bestScore = score; best = { tx, ty }; }
    }
    if (!best || bestScore < -5) continue;
    const pool = def.names;
    let name = pool[Math.floor(hash2(best.tx, best.ty, 771) * pool.length)];
    let n = 2;
    while (used.has(name)) name = pool[0] + ' ' + n++;
    used.set(name, 1);
    out.push(new Landmark(kind, best.tx, best.ty, name));
  }
  return out;
}
