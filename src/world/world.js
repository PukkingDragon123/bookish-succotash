// Procedural generation of the basin: elevation, moisture and a thermal field
// carve out lodgepole forest, sage flats, a braided river, obsidian ridges, an
// old burn scar and a geyser basin with its rings of thermophile mats.
// Resource nodes, decorative flora and the home den are placed on top.

import { bendFrame } from './wind.js';
import { placeLandmarks, DISCOVER_R } from './landmarks.js';
import { makeRng, hash2 } from '../engine/rng.js';
import { fbm, ridged, warpedFbm, cellular } from './noise.js';
import { T, TILES, TS, drawTile, isSolid, isWater, tileSpeed } from './tiles.js';
import { makeCanvas, VIEW_W, VIEW_H } from '../engine/canvas.js';
import { clamp, dist2, TAU } from '../engine/math.js';
import { treeFrames, plantFrames, rockSprite, propSprite } from '../art/flora.js';
import { labProp } from '../art/lab.js';

export const CHUNK = 8;                 // tiles per chunk side
export const CHUNK_PX = CHUNK * TS;

// --- resource node catalogue ----------------------------------------------
export const NODE_DEFS = {
  pine:        { art: 'tree', kind: 'pine', hp: 5, tool: 'axe', yields: [['wood', 3]], flammable: true, r: 6, tall: true },
  pineTall:    { art: 'tree', kind: 'pineTall', hp: 7, tool: 'axe', yields: [['wood', 4]], flammable: true, r: 7, tall: true },
  pineSmall:   { art: 'tree', kind: 'pineSmall', hp: 3, tool: 'axe', yields: [['wood', 2]], flammable: true, r: 5, tall: true },
  spruce:      { art: 'tree', kind: 'spruce', hp: 6, tool: 'axe', yields: [['wood', 3]], flammable: true, r: 6, tall: true },
  aspen:       { art: 'tree', kind: 'aspen', hp: 4, tool: 'axe', yields: [['wood', 2], ['fiber', 1]], flammable: true, r: 5, tall: true },
  snag:        { art: 'tree', kind: 'snag', hp: 3, tool: 'axe', yields: [['wood', 2], ['charcoal', 1]], flammable: true, r: 4, tall: true },
  burnt:       { art: 'tree', kind: 'burnt', hp: 2, tool: 'axe', yields: [['charcoal', 2]], flammable: false, r: 4, tall: true },
  stone:       { art: 'rock', kind: 'stone', hp: 6, tool: 'pick', yields: [['stone', 3]], r: 7 },
  stoneBig:    { art: 'rock', kind: 'stoneBig', hp: 9, tool: 'pick', yields: [['stone', 5]], r: 9 },
  iron:        { art: 'rock', kind: 'iron', hp: 8, tool: 'pick', yields: [['iron', 2], ['stone', 1]], r: 7 },
  copper:      { art: 'rock', kind: 'copper', hp: 8, tool: 'pick', yields: [['copper', 2], ['stone', 1]], r: 7 },
  obsidian:    { art: 'rock', kind: 'obsidian', hp: 10, tool: 'pick', yields: [['obsidian', 2]], r: 7 },
  coal:        { art: 'rock', kind: 'coal', hp: 6, tool: 'pick', yields: [['coal', 3]], r: 7 },
  sulfur:      { art: 'rock', kind: 'sulfur', hp: 4, tool: 'hand', yields: [['sulfur', 3]], r: 7, respawn: 55 },
  saltpeter:   { art: 'rock', kind: 'saltpeter', hp: 4, tool: 'hand', yields: [['saltpeter', 3]], r: 8, respawn: 55 },
  huckleberry: { art: 'plant', kind: 'huckleberry', hp: 1, tool: 'hand', yields: [['berries', 2]], flammable: true, r: 6, respawn: 40 },
  serviceberry:{ art: 'plant', kind: 'serviceberry', hp: 1, tool: 'hand', yields: [['berries', 2]], flammable: true, r: 6, respawn: 40 },
  sagebush:    { art: 'plant', kind: 'sage', hp: 1, tool: 'hand', yields: [['fiber', 2]], flammable: true, r: 6, respawn: 30 },

  // --- what grows only at a named place ------------------------------------
  // These are seeded around landmarks, so a recipe that wants resin is a
  // recipe that sends you to a grove and back.
  reedbed:     { art: 'plant', kind: 'reeds', hp: 1, tool: 'hand', yields: [['reeds', 3]], flammable: true, r: 7, respawn: 45 },
  claybank:    { art: 'rock', kind: 'clay', hp: 3, tool: 'hand', yields: [['clay', 3]], r: 8, respawn: 60 },
  resinseep:   { art: 'plant', kind: 'resin', hp: 2, tool: 'hand', yields: [['resin', 2]], flammable: true, r: 6, respawn: 70 },
  oldpine:     { art: 'tree', kind: 'pineTall', hp: 12, tool: 'axe', yields: [['hardwood', 3], ['wood', 2]], flammable: true, r: 8, tall: true },
  bonepile:    { art: 'rock', kind: 'bones', hp: 3, tool: 'hand', yields: [['bone', 3], ['sinew', 1]], r: 8, respawn: 80 },
  featherfall: { art: 'plant', kind: 'feathers', hp: 1, tool: 'hand', yields: [['feather', 2]], r: 6, respawn: 50 },
};

let nextNodeId = 1;

export class World {
  constructor(seed = 12345, w = 200, h = 160, opts = {}) {
    this.seed = seed >>> 0;
    this.w = w; this.h = h;
    this.pxW = w * TS; this.pxH = h * TS;
    this.tiles = new Uint8Array(w * h);
    this.base = new Uint8Array(w * h);      // pre-fire terrain, for regrowth
    this.elev = new Float32Array(w * h);
    this.heat = new Float32Array(w * h);    // thermal field 0..1
    this.nodes = [];
    this.decor = [];
    this.props = [];
    this.grid = new Map();                  // spatial hash of nodes/decor/props
    this.cellSize = 64;
    this.chunks = new Map();
    this.time = 0;
    this.geysers = [];
    this.den = { x: 0, y: 0 };
    this.landmarks = [];
    this.npcSpots = [];
    // A blank world skips terrain generation entirely: the lab lays its own
    // floor plan into the same arrays.
    if (!opts.blank) this.generate();
  }

  idx(tx, ty) { return ty * this.w + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  tileAt(tx, ty) { return this.inBounds(tx, ty) ? this.tiles[this.idx(tx, ty)] : T.ROCK; }
  tileAtPx(x, y) { return this.tileAt(Math.floor(x / TS), Math.floor(y / TS)); }
  solidAtPx(x, y) { return isSolid(this.tileAtPx(x, y)); }
  speedAtPx(x, y) { return tileSpeed(this.tileAtPx(x, y)); }

  elevAt(tx, ty) { return this.inBounds(tx, ty) ? this.elev[this.idx(tx, ty)] : 0; }
  heatAt(tx, ty) { return this.inBounds(tx, ty) ? this.heat[this.idx(tx, ty)] : 0; }

  /** How many tiles within `r` satisfy `fn` — used for siting landmarks. */
  nearTile(tx, ty, r, fn) {
    let n = 0;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (fn(this.tileAt(tx + i, ty + j))) n++;
      }
    }
    return n / ((r * 2 + 1) * (r * 2 + 1)) * 10;
  }

  setTile(tx, ty, id) {
    if (!this.inBounds(tx, ty)) return;
    this.tiles[this.idx(tx, ty)] = id;
    this.invalidateChunkAt(tx, ty);
  }

  // ------------------------------------------------------------- generation
  generate() {
    const rng = makeRng(this.seed);
    const { w, h } = this;
    const S = this.seed;
    const scale = 0.028;

    // Field pass ------------------------------------------------------------
    const moistArr = new Float32Array(w * h);
    const riverArr = new Float32Array(w * h);
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        const nx = tx * scale, ny = ty * scale;

        // Elevation: broad ridges, plus a bowl so the map has a natural rim.
        let e = warpedFbm(nx, ny, S, 1.4, 5);
        const cxn = (tx / w - 0.5) * 2, cyn = (ty / h - 0.5) * 2;
        const bowl = Math.sqrt(cxn * cxn + cyn * cyn);
        e = e * 0.78 + clamp(bowl - 0.42, 0, 1) * 0.55;
        this.elev[i] = e;

        moistArr[i] = fbm(nx * 1.35 + 40, ny * 1.35 - 25, S + 777, 4);

        // Thermal: ridged fissures gated by a big soft blob in the west basin.
        const basin = fbm(nx * 0.55 - 12, ny * 0.55 + 8, S + 313, 3);
        const fissure = ridged(nx * 1.8 + 3, ny * 1.8 - 6, S + 4242, 3);
        this.heat[i] = clamp((basin - 0.46) * 2.6, 0, 1) * clamp(fissure * 1.25, 0, 1);

        // River: a winding zero-crossing band, wider downhill.
        const rv = fbm(nx * 0.62 + 91, ny * 0.62 + 17, S + 5150, 3);
        riverArr[i] = Math.abs(rv - 0.5);
      }
    }

    // Burn scar: an old fire from before the game starts, in the north-east.
    const scarCx = w * (0.68 + rng() * 0.1), scarCy = h * (0.22 + rng() * 0.1);
    const scarR = Math.min(w, h) * 0.16;

    // Tile pass -------------------------------------------------------------
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        const e = this.elev[i], m = moistArr[i], heat = this.heat[i];
        const riverW = 0.022 + (1 - e) * 0.02;
        const inRiver = riverArr[i] < riverW && e < 0.62;
        let id;

        if (heat > 0.72) {
          // hot spring pool with concentric thermophile rings
          const cellv = cellular(tx * 0.09, ty * 0.09, S + 31);
          const d = cellv.d;
          if (heat > 0.88 && d < 0.22) id = T.SPRING_DEEP;
          else if (heat > 0.82 && d < 0.34) id = T.SPRING;
          else if (heat > 0.79) id = T.MAT_ORANGE;
          else if (heat > 0.76) id = T.MAT_RUST;
          else id = T.MAT_OLIVE;
        } else if (heat > 0.5) {
          id = heat > 0.62 ? (hash2(tx, ty, 5) < 0.2 ? T.MUD : T.SINTER) : T.SINTER;
        } else if (inRiver) {
          id = riverArr[i] < riverW * 0.42 ? T.WATER : T.SHALLOW;
        } else if (e < 0.2) {
          id = T.WATER_DEEP;
        } else if (e < 0.26) {
          id = T.WATER;
        } else if (e < 0.3) {
          id = T.SHALLOW;
        } else if (e < 0.335) {
          id = T.SAND;
        } else if (e > 0.86) {
          id = hash2(tx, ty, 9) < 0.35 ? T.SNOW : T.ROCK;
        } else if (e > 0.76) {
          id = hash2(tx, ty, 11) < 0.28 ? T.ROCK : T.GRAVEL;
        } else if (e > 0.7) {
          id = T.GRAVEL;
        } else if (m > 0.58) {
          id = T.DUFF;
        } else if (m > 0.48) {
          id = T.GRASS;
        } else if (m > 0.38) {
          id = T.MEADOW;
        } else if (m > 0.3) {
          id = T.MEADOW_DRY;
        } else {
          id = T.SAGE;
        }

        // obsidian flows on the steepest dry high ground
        if (id === T.GRAVEL && ridged(tx * 0.06 + 60, ty * 0.06, S + 8080, 2) > 0.82) id = T.OBSIDIAN;

        // the old burn scar
        const dScar = Math.hypot(tx - scarCx, ty - scarCy);
        if (dScar < scarR && !isWater(id) && id !== T.ROCK) {
          const edge = dScar / scarR;
          if (hash2(tx, ty, 13) > edge * 0.9) id = hash2(tx, ty, 17) < 0.4 ? T.ASH : T.CHARRED;
        }

        this.tiles[i] = id;
      }
    }
    this.base.set(this.tiles);

    // Node & decor pass -----------------------------------------------------
    this.placeNodes(rng, moistArr, scarCx, scarCy, scarR);
    this.placeDecor(rng, moistArr);
    this.placeThermalFeatures(rng);
    this.chooseHome(rng);
    // Named places, once the ground exists and the camp has a home — they are
    // sited off the terrain and spaced away from both.
    this.landmarks = placeLandmarks(this, rng, { count: this.landmarkCount || 15 });
    this.dressLandmarks(rng);
    this.rebuildGrid();
  }

  placeNodes(rng, moistArr, scarCx, scarCy, scarR) {
    const { w, h } = this;
    for (let ty = 1; ty < h - 1; ty++) {
      for (let tx = 1; tx < w - 1; tx++) {
        const i = ty * w + tx;
        const id = this.tiles[i];
        const e = this.elev[i], m = moistArr[i], heat = this.heat[i];
        if (isWater(id) || isSolid(id)) continue;
        const r = hash2(tx, ty, 101);
        const dScar = Math.hypot(tx - scarCx, ty - scarCy);
        const x = tx * TS + TS / 2 + (hash2(tx, ty, 55) - 0.5) * 10;
        const y = ty * TS + TS / 2 + (hash2(tx, ty, 56) - 0.5) * 10;

        if (dScar < scarR * 1.05 && (id === T.ASH || id === T.CHARRED)) {
          if (r < 0.10) this.addNode('burnt', x, y);
          else if (r < 0.13) this.addNode('snag', x, y);
          continue;
        }

        if (id === T.DUFF) {
          if (r < 0.30) this.addNode(r < 0.09 ? 'pineTall' : (r < 0.2 ? 'pine' : 'pineSmall'), x, y);
          else if (r < 0.34) this.addNode('spruce', x, y);
          else if (r < 0.37) this.addNode('huckleberry', x, y);
          else if (r < 0.385) this.addNode('stone', x, y);
        } else if (id === T.GRASS) {
          if (r < 0.13) this.addNode(r < 0.05 ? 'pine' : 'pineSmall', x, y);
          else if (r < 0.18) this.addNode('aspen', x, y);
          else if (r < 0.21) this.addNode('serviceberry', x, y);
          else if (r < 0.225) this.addNode('stone', x, y);
        } else if (id === T.MEADOW || id === T.MEADOW_DRY) {
          if (r < 0.035) this.addNode('aspen', x, y);
          else if (r < 0.06) this.addNode('serviceberry', x, y);
          else if (r < 0.075) this.addNode('stone', x, y);
        } else if (id === T.SAGE) {
          if (r < 0.14) this.addNode('sagebush', x, y);
          else if (r < 0.155) this.addNode('stoneBig', x, y);
        } else if (id === T.GRAVEL || id === T.OBSIDIAN) {
          if (r < 0.07) this.addNode('stone', x, y);
          else if (r < 0.10) this.addNode('stoneBig', x, y);
          else if (r < 0.135) this.addNode('iron', x, y);
          else if (r < 0.155) this.addNode('copper', x, y);
          else if (r < 0.175) this.addNode('coal', x, y);
          else if (r < 0.195 && id === T.OBSIDIAN) this.addNode('obsidian', x, y);
        } else if (id === T.SINTER || id === T.MAT_OLIVE || id === T.MAT_RUST) {
          if (r < 0.10) this.addNode('sulfur', x, y);
          else if (r < 0.18) this.addNode('saltpeter', x, y);
        } else if (id === T.MUD) {
          if (r < 0.14) this.addNode('sulfur', x, y);
        }
      }
    }
  }

  placeDecor(rng, moistArr) {
    const { w, h } = this;
    const FLOWERS = ['lupine', 'paintbrush', 'balsamroot', 'fireweed', 'beargrass'];
    for (let ty = 1; ty < h - 1; ty++) {
      for (let tx = 1; tx < w - 1; tx++) {
        const i = ty * w + tx;
        const id = this.tiles[i];
        if (isWater(id) || isSolid(id)) continue;
        const r = hash2(tx, ty, 202);
        const x = tx * TS + TS / 2 + (hash2(tx, ty, 57) - 0.5) * 12;
        const y = ty * TS + TS / 2 + (hash2(tx, ty, 58) - 0.5) * 12;
        // Flowers grow in patches, not evenly sprinkled over every square
        // metre of the county. This is a slow field: where it is high you get
        // a bed of one species, and everywhere else you get none, which is
        // both what a meadow looks like and a quarter of the sprites.
        const patch = fbm(tx * 0.09, ty * 0.09, 3, 909);
        const bloom = patch > 0.60;
        const species = FLOWERS[Math.floor(hash2(Math.floor(tx / 7), Math.floor(ty / 7), 61) * FLOWERS.length)];

        let kind = null;
        if (id === T.DUFF) {
          if (r < 0.05) kind = 'fern';
          else if (patch > 0.66 && r < 0.11) kind = 'mushroom';
          else if (r < 0.13) kind = 'grass';
        } else if (id === T.GRASS) {
          if (r < 0.12) kind = 'grass';
          else if (bloom && r < 0.20) kind = species;
        } else if (id === T.MEADOW || id === T.MEADOW_DRY) {
          if (r < 0.11) kind = 'grass';
          else if (bloom && r < 0.26) kind = species;
        } else if (id === T.SAGE) {
          if (r < 0.07) kind = 'grass';
        } else if (id === T.ASH || id === T.CHARRED) {
          if (bloom && r < 0.08) kind = 'fireweed';   // first thing back after a burn
        }
        if (kind) this.decor.push({ x, y, kind, variant: Math.floor(hash2(tx, ty, 63) * 4), type: 'decor' });
        if (!kind && r > 0.9955) this.props.push({ x, y, kind: 'bones', variant: Math.floor(hash2(tx, ty, 64) * 3), type: 'prop' });
      }
    }
  }

  /**
   * Put something at each named place that is only there.
   *
   * This is what turns a label into a reason. A grove has resin seeps and old
   * pines nobody has cut; a boneyard has winterkill piled where the drifts
   * left it. The yields are deliberately narrow — you cannot get hardwood
   * anywhere else, so the recipe that needs it is a recipe that sends you out.
   */
  dressLandmarks(rng) {
    const DRESS = {
      spring:   [['reedbed', 9], ['claybank', 4], ['huckleberry', 4]],
      dam:      [['reedbed', 7], ['claybank', 5], ['oldpine', 3]],
      grove:    [['oldpine', 7], ['resinseep', 6], ['huckleberry', 5], ['serviceberry', 4]],
      boneyard: [['bonepile', 8], ['sagebush', 6]],
      lookout:  [['featherfall', 7], ['stoneBig', 4], ['iron', 3]],
      talus:    [['obsidian', 5], ['iron', 5], ['stoneBig', 6], ['coal', 3]],
      hotspring:[['sulfur', 7], ['saltpeter', 6], ['claybank', 3]],
      hoodoo:   [['saltpeter', 6], ['obsidian', 4], ['stoneBig', 5]],
      burn:     [['burnt', 9], ['snag', 5], ['resinseep', 3]],
      cache:    [['stoneBig', 4], ['sagebush', 4]],
    };
    for (const l of this.landmarks) {
      const spread = DRESS[l.kind];
      if (!spread) continue;
      for (const [type, count] of spread) {
        let placed = 0;
        // A spring is surrounded by water and a talus by rock, so a single
        // blind throw lands in the drink most of the time. Keep trying.
        for (let attempt = 0; attempt < count * 8 && placed < count; attempt++) {
          const a = rng() * TAU;
          const rr = (2 + rng() * 7) * TS;
          const x = l.x + Math.cos(a) * rr, y = l.y + Math.sin(a) * rr * 0.8;
          const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
          if (!this.inBounds(tx, ty)) continue;
          const id = this.tileAt(tx, ty);
          if (isWater(id) || isSolid(id)) continue;
          if (this.addNode(type, x, y)) placed++;
        }
      }
      // A cache: one crate of something worth the walk, taken once.
      if (l.def.yields && l.def.yields.length) {
        l.cache = { items: l.def.yields.slice(), taken: false, x: l.x, y: l.y + 10 };
      }
    }
  }

  placeThermalFeatures(rng) {
    const { w, h } = this;
    for (let ty = 2; ty < h - 2; ty += 2) {
      for (let tx = 2; tx < w - 2; tx += 2) {
        const i = ty * w + tx;
        if (this.heat[i] < 0.55) continue;
        const id = this.tiles[i];
        if (id !== T.SINTER) continue;
        const r = hash2(tx, ty, 303);
        const x = tx * TS + TS / 2, y = ty * TS + TS / 2;
        if (r < 0.020) {
          const g = { x, y, kind: 'geyserCone', type: 'geyser', timer: 8 + rng() * 26, period: 22 + rng() * 30, erupting: 0, variant: Math.floor(rng() * 3) };
          this.props.push(g);
          this.geysers.push(g);
        } else if (r < 0.055) {
          this.props.push({ x, y, kind: 'fumarole', type: 'prop', variant: Math.floor(rng() * 3), steam: true });
        }
      }
    }
  }

  /** Find a flat, dry, defensible clearing near the middle for the den. */
  chooseHome(rng) {
    const { w, h } = this;
    let best = null, bestScore = -Infinity;
    for (let attempt = 0; attempt < 900; attempt++) {
      const tx = Math.floor(w * 0.28 + rng() * w * 0.44);
      const ty = Math.floor(h * 0.28 + rng() * h * 0.44);
      const id = this.tileAt(tx, ty);
      if (isWater(id) || isSolid(id) || TILES[id].hot) continue;
      let score = 0;
      let ok = true;
      for (let j = -4; j <= 4 && ok; j++) {
        for (let i = -4; i <= 4; i++) {
          const t2 = this.tileAt(tx + i, ty + j);
          if (isSolid(t2)) { ok = false; break; }
          if (isWater(t2) || TILES[t2].hot) score -= 3;
          if (t2 === T.MEADOW || t2 === T.GRASS) score += 1;
        }
      }
      if (!ok) continue;
      // prefer the middle of the map, but not dead centre
      const dc = Math.hypot(tx - w / 2, ty - h / 2);
      score -= Math.abs(dc - Math.min(w, h) * 0.12) * 0.6;
      if (score > bestScore) { bestScore = score; best = { tx, ty }; }
    }
    if (!best) best = { tx: Math.floor(w / 2), ty: Math.floor(h / 2) };
    this.den = { x: best.tx * TS + TS / 2, y: best.ty * TS + TS / 2, tx: best.tx, ty: best.ty };

    // Clear a camp: flatten tiles, remove nodes, add den + benches.
    for (let j = -5; j <= 5; j++) {
      for (let i = -6; i <= 6; i++) {
        const tx = best.tx + i, ty = best.ty + j;
        if (!this.inBounds(tx, ty)) continue;
        const d = Math.hypot(i, j * 1.25);
        if (d > 6.2) continue;
        const cur = this.tileAt(tx, ty);
        if (isWater(cur) || TILES[cur].hot) continue;
        this.tiles[this.idx(tx, ty)] = d < 2.4 ? T.DIRT : (hash2(tx, ty, 71) < 0.3 ? T.MEADOW : T.GRASS);
      }
    }
    this.base.set(this.tiles);
    this.nodes = this.nodes.filter(n => dist2(n.x, n.y, this.den.x, this.den.y) > (7 * TS) * (7 * TS));
    this.decor = this.decor.filter(d => dist2(d.x, d.y, this.den.x, this.den.y) > (5 * TS) * (5 * TS));

    // Nothing is built. The clearing is a clearing: bare ground, a ring of
    // stones somebody left, and room for everything you are going to have to
    // ask other people to make for you.
    this.props.push({ x: this.den.x - 8, y: this.den.y + 20, kind: 'stump', type: 'stump', variant: 1 });
    this.props.push({ x: this.den.x + 30, y: this.den.y + 26, kind: 'stump', type: 'stump', variant: 2 });
    this.campSite = { x: this.den.x, y: this.den.y };

    // NPC camps ringed around the den at varying distances.
    const spots = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rng() * 0.4;
      for (let tryR = 0; tryR < 40; tryR++) {
        const rad = (9 + tryR * 1.2 + rng() * 4) * TS;
        const x = this.den.x + Math.cos(a) * rad;
        const y = this.den.y + Math.sin(a) * rad * 0.9;
        const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
        if (!this.inBounds(tx, ty)) continue;
        const id = this.tileAt(tx, ty);
        if (isWater(id) || isSolid(id) || TILES[id].hot) continue;
        spots.push({ x, y });
        break;
      }
    }
    this.npcSpots = spots;
  }

  // ------------------------------------------------------------- node access
  addNode(type, x, y) {
    const def = NODE_DEFS[type];
    if (!def) return null;
    const n = {
      id: nextNodeId++, type, def, x, y,
      hp: def.hp, maxHp: def.hp,
      alive: true, respawnAt: 0,
      variant: Math.floor(hash2(Math.round(x), Math.round(y), 88) * 10),
      shake: 0, burn: 0, burning: false, fallT: 0,
      r: def.r, objType: 'node',
    };
    this.nodes.push(n);
    return n;
  }

  /** Add a node after generation (seedlings coming up in a burn scar). */
  addNodeLive(type, x, y) {
    const n = this.addNode(type, x, y);
    if (n) this._insert(n);
    return n;
  }

  rebuildGrid() {
    this.grid.clear();
    for (const n of this.nodes) this._insert(n);
    for (const d of this.decor) this._insert(d);
    for (const p of this.props) this._insert(p);
  }

  _cellKey(x, y) { return ((x / this.cellSize) | 0) + ',' + ((y / this.cellSize) | 0); }
  _insert(o) {
    const k = this._cellKey(o.x, o.y);
    let arr = this.grid.get(k);
    if (!arr) { arr = []; this.grid.set(k, arr); }
    arr.push(o);
    o._cell = k;
  }

  /** All grid objects whose cell overlaps a radius around (x,y). */
  near(x, y, r, out = []) {
    out.length = 0;
    const c = this.cellSize;
    const x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0;
    const y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.grid.get(cx + ',' + cy);
        if (arr) for (const o of arr) out.push(o);
      }
    }
    return out;
  }

  _scratch = [];
  /** Closest harvestable node within `r`, optionally filtered by tool. */
  nearestNode(x, y, r, filter = null) {
    const cands = this.near(x, y, r + 16, this._scratch);
    let best = null, bestD = Infinity;
    for (const o of cands) {
      if (o.objType !== 'node' || !o.alive) continue;
      if (filter && !filter(o)) continue;
      const d = dist2(x, y, o.x, o.y);
      if (d < bestD && d < (r + o.r) * (r + o.r)) { bestD = d; best = o; }
    }
    return best;
  }

  /** Damage a node. Returns the yield list when it is destroyed. */
  hitNode(n, dmg = 1) {
    if (!n.alive) return null;
    n.hp -= dmg;
    n.shake = 0.25;
    if (n.hp <= 0) {
      n.alive = false;
      n.fallT = n.def.tall ? 0.55 : 0;
      if (n.def.respawn) n.respawnAt = this.time + n.def.respawn;
      if (n.def.art === 'tree' && n.def.kind !== 'burnt') {
        // leave a stump behind
        this.props.push({ x: n.x, y: n.y, kind: 'stump', type: 'stump', variant: n.variant, born: this.time });
        this._insert(this.props[this.props.length - 1]);
      }
      return n.def.yields;
    }
    return null;
  }

  update(dt) {
    this.time += dt;
    for (const n of this.nodes) {
      if (n.shake > 0) n.shake = Math.max(0, n.shake - dt * 1.6);
      if (n.fallT > 0) n.fallT = Math.max(0, n.fallT - dt);
      if (!n.alive && n.respawnAt && this.time >= n.respawnAt) {
        n.alive = true; n.hp = n.maxHp; n.respawnAt = 0;
      }
    }
    for (const g of this.geysers) {
      if (g.erupting > 0) { g.erupting -= dt; }
      else {
        g.timer -= dt;
        if (g.timer <= 0) { g.timer = g.period; g.erupting = 3.2; g.justErupted = true; }
      }
    }
  }

  triggerGeyser(g, duration = 3.2) {
    g.erupting = duration;
    g.timer = g.period;
    g.justErupted = true;
  }

  // ------------------------------------------------------------- rendering
  chunkKey(cx, cy) { return cx + ',' + cy; }

  invalidateChunkAt(tx, ty) {
    const k = this.chunkKey((tx / CHUNK) | 0, (ty / CHUNK) | 0);
    this.chunks.delete(k);
    // neighbours too, because of edge blending
    if (tx % CHUNK === 0) this.chunks.delete(this.chunkKey(((tx / CHUNK) | 0) - 1, (ty / CHUNK) | 0));
    if (ty % CHUNK === 0) this.chunks.delete(this.chunkKey((tx / CHUNK) | 0, ((ty / CHUNK) | 0) - 1));
    if (tx % CHUNK === CHUNK - 1) this.chunks.delete(this.chunkKey(((tx / CHUNK) | 0) + 1, (ty / CHUNK) | 0));
    if (ty % CHUNK === CHUNK - 1) this.chunks.delete(this.chunkKey((tx / CHUNK) | 0, ((ty / CHUNK) | 0) + 1));
  }

  getChunk(cx, cy) {
    const k = this.chunkKey(cx, cy);
    let c = this.chunks.get(k);
    if (c) return c;
    const { canvas, ctx } = makeCanvas(CHUNK_PX, CHUNK_PX);
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const tx = cx * CHUNK + i, ty = cy * CHUNK + j;
        const id = this.tileAt(tx, ty);
        drawTile(ctx, i * TS, j * TS, id, tx, ty, (dx, dy) => this.tileAt(tx + dx, ty + dy));
      }
    }
    c = canvas;
    this.chunks.set(k, c);
    // keep the cache bounded; the player only ever sees a couple of dozen
    if (this.chunks.size > 260) {
      const it = this.chunks.keys();
      for (let i = 0; i < 60; i++) { const kk = it.next().value; if (kk === k) continue; this.chunks.delete(kk); }
    }
    return c;
  }

  drawGround(r) {
    const cam = r.camera;
    const x0 = Math.floor(cam.ox / CHUNK_PX), x1 = Math.floor((cam.ox + VIEW_W) / CHUNK_PX);
    const y0 = Math.floor(cam.oy / CHUNK_PX), y1 = Math.floor((cam.oy + VIEW_H) / CHUNK_PX);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= this.w || cy * CHUNK >= this.h) continue;
        const c = this.getChunk(cx, cy);
        r.ctx.drawImage(c, cx * CHUNK_PX - cam.ox, cy * CHUNK_PX - cam.oy);
      }
    }
  }

  /** Push everything visible into the y-sorted draw list. */
  collectDrawables(cam, out) {
    const c = this.cellSize;
    const pad = 48;
    const x0 = ((cam.ox - pad) / c) | 0, x1 = ((cam.ox + VIEW_W + pad) / c) | 0;
    const y0 = ((cam.oy - pad) / c) | 0, y1 = ((cam.oy + VIEW_H + pad) / c) | 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.grid.get(cx + ',' + cy);
        if (!arr) continue;
        for (const o of arr) {
          if (o.objType === 'node' && !o.alive && o.fallT <= 0) continue;
          if (o.burned) continue;          // ground cover consumed by fire
          out.push(o);
        }
      }
    }
  }
}

/** Sprite lookup for any world object, used by the shared draw list. */
export function worldObjectSprite(o, time) {
  if (o.objType === 'node') {
    const d = o.def;
    if (d.art === 'tree') {
      const f = treeFrames(d.kind, o.variant);
      return f[f.length === 1 ? 0 : bendFrame(o.x, o.y, time, f.length)];
    }
    if (d.art === 'rock') return rockSprite(d.kind, o.variant);
    if (d.art === 'plant') {
      const f = plantFrames(d.kind, o.variant);
      return f[bendFrame(o.x, o.y, time, f.length)];
    }
  }
  if (o.type === 'decor') {
    const f = plantFrames(o.kind, o.variant);
    // Everything on the hillside bends off the same field, so a gust visibly
    // crosses the meadow instead of every tuft twitching on its own clock.
    return f[bendFrame(o.x, o.y, time, f.length)];
  }
  if (o.type === 'stump') return treeFrames('stump', o.variant)[0];
  if (o.type === 'labprop') return labProp(o.kind, o.variant);
  return propSprite(o.kind, o.variant);
}
