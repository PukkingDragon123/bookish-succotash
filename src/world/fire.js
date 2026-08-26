// Forest fire simulation. Fire lives on the tile grid: every flammable tile has
// a fuel budget, burning tiles push heat into their neighbours biased by a wind
// vector, and trees standing on a burning tile become torches that massively
// raise local intensity. Water, dirt and rain take fuel back out.

import { T, TS } from './tiles.js';
import { P } from '../art/palette.js';
import { clamp, TAU } from '../engine/math.js';
import { rnd, chance, hash2 } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';

const TICK = 0.2;                 // seconds between spread evaluations
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export class FireSim {
  constructor(world) {
    this.world = world;
    this.w = world.w; this.h = world.h;
    this.fuel = new Float32Array(this.w * this.h);
    this.burn = new Float32Array(this.w * this.h);   // 0 = unlit, >0 = intensity
    this.burning = new Set();
    this.wet = new Float32Array(this.w * this.h);
    this.acc = 0;
    this.windAngle = rnd(TAU);
    this.windSpeed = 0.55;
    this.windTarget = this.windAngle;
    this.totalFuel = 0;
    this.burnedTiles = 0;
    this.active = false;
    this.intensity = 0;           // 0..1, drives music, light and the HUD
    this.nodeByTile = new Map();
    this.decorByTile = new Map();
    this.scar = [];               // tiles that burned out, awaiting regrowth
    this.regrowT = 0;
    this.regrown = 0;
    this.rebuildFuel();
  }

  idx(tx, ty) { return ty * this.w + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }

  rebuildFuel() {
    const w = this.world;
    this.totalFuel = 0;
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const i = this.idx(tx, ty);
        const id = w.tiles[i];
        let f = 0;
        if (id === T.DUFF) f = 1.4;
        else if (id === T.GRASS) f = 1.0;
        else if (id === T.MEADOW) f = 0.85;
        else if (id === T.MEADOW_DRY) f = 1.1;
        else if (id === T.SAGE) f = 1.25;
        this.fuel[i] = f;
        this.totalFuel += f;
      }
    }
    // Ground cover is tracked separately: it does not feed the fire much, but
    // it has to stop existing once its tile has burned.
    this.decorByTile.clear();
    for (const d of w.decor) {
      const tx = Math.floor(d.x / TS), ty = Math.floor(d.y / TS);
      if (!this.inBounds(tx, ty)) continue;
      const i = this.idx(tx, ty);
      let arr = this.decorByTile.get(i);
      if (!arr) { arr = []; this.decorByTile.set(i, arr); }
      arr.push(d);
    }

    this.nodeByTile.clear();
    for (const n of w.nodes) {
      if (!n.def.flammable) continue;
      const tx = Math.floor(n.x / TS), ty = Math.floor(n.y / TS);
      if (!this.inBounds(tx, ty)) continue;
      const i = this.idx(tx, ty);
      let arr = this.nodeByTile.get(i);
      if (!arr) { arr = []; this.nodeByTile.set(i, arr); }
      arr.push(n);
      this.fuel[i] += n.def.hp * 0.9;
      this.totalFuel += n.def.hp * 0.9;
    }
  }

  fuelAt(tx, ty) { return this.inBounds(tx, ty) ? this.fuel[this.idx(tx, ty)] : 0; }
  isBurning(tx, ty) { return this.inBounds(tx, ty) && this.burn[this.idx(tx, ty)] > 0; }
  burnAtPx(x, y) {
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    return this.inBounds(tx, ty) ? this.burn[this.idx(tx, ty)] : 0;
  }

  ignite(tx, ty, intensity = 1) {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    if (this.burn[i] > 0) return false;
    if (this.fuel[i] <= 0.05) return false;
    if (this.wet[i] > 0.4) { this.wet[i] -= 0.35; return false; }
    this.burn[i] = intensity;
    this.burning.add(i);
    this.active = true;
    const arr = this.nodeByTile.get(i);
    if (arr) for (const n of arr) { if (n.alive) n.burning = true; }
    return true;
  }

  igniteAtPx(x, y, intensity = 1) {
    return this.ignite(Math.floor(x / TS), Math.floor(y / TS), intensity);
  }

  /** Drop an incendiary: lights a small blob rather than a single tile. */
  firebomb(x, y, radius = 2.5) {
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    const R = Math.ceil(radius);
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        if (i * i + j * j > radius * radius) continue;
        this.ignite(tx + i, ty + j, 1.2);
      }
    }
    particles.burst(x, y, 26, { colors: [P.fire1, P.fire2, P.fire3], speed: 150, life: 0.7, additive: true, vz: 130 });
    particles.smoke(x, y, 12, { life: 2.6, size: 3 });
    particles.ring(x, y, 4, radius * TS + 10, 0.5, P.fire2, 2, true);
    audio.play('explode', { vol: 0.9 });
  }

  /** Water/dirt/rain. Returns how many tiles were put out. */
  extinguish(x, y, radius, power = 1) {
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    const R = Math.ceil(radius / TS);
    let doused = 0;
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const nx = tx + i, ny = ty + j;
        if (!this.inBounds(nx, ny)) continue;
        const d = Math.hypot(i * TS, j * TS);
        if (d > radius) continue;
        const k = this.idx(nx, ny);
        const falloff = 1 - d / radius;
        this.wet[k] = Math.min(2.5, this.wet[k] + power * falloff * 1.6);
        if (this.burn[k] > 0) {
          this.burn[k] -= power * falloff * 1.5;
          if (this.burn[k] <= 0) {
            this.burn[k] = 0;
            this.burning.delete(k);
            doused++;
            particles.smoke(nx * TS + 8, ny * TS + 8, 4, { life: 1.6, colors: ['#b8bcb8', '#8a8e8a', '#5a5e5a'] });
          }
        }
      }
    }
    if (doused) audio.play('splash', { vol: 0.5 });
    return doused;
  }

  extinguishAll() {
    for (const i of this.burning) this.burn[i] = 0;
    this.burning.clear();
    this.active = false;
    this.intensity = 0;
  }

  update(dt, game) {
    // wind wanders slowly, and gusts when the fire is big
    this.windTarget += (Math.random() - 0.5) * dt * 0.5;
    this.windAngle += (this.windTarget - this.windAngle) * Math.min(1, dt * 0.4);
    this.windSpeed = 0.45 + Math.sin(this.world.time * 0.17) * 0.25 + this.intensity * 0.4;

    this.acc += dt;
    let ticks = 0;
    while (this.acc >= TICK && ticks < 3) {
      this.acc -= TICK;
      ticks++;
      this._tick(TICK, game);
    }

    // continuous per-frame effects for tiles that are alight
    const cam = game && game.r ? game.r.camera : null;
    let emitted = 0;
    for (const i of this.burning) {
      const tx = i % this.w, ty = (i / this.w) | 0;
      const x = tx * TS + 8, y = ty * TS + 8;
      if (cam && !cam.visible(x, y, 48)) continue;
      if (emitted > 90) break;
      emitted++;
      const b = this.burn[i];
      if (chance(dt * 9 * Math.min(2, b))) particles.embers(x + rnd(-6, 6), y + rnd(-6, 6), 1);
      // Pale smoke: it has to read against charred ground, not blend into it.
      if (chance(dt * 4.5)) {
        particles.smoke(x + rnd(-5, 5), y + rnd(-5, 5), 1, {
          life: 3.2, size: 3, colors: ['#9aa0a0', '#6f7574', '#454b4a'],
          vx: Math.cos(this.windAngle) * 10, vy: Math.sin(this.windAngle) * 6,
        });
      }
    }

    const frac = this.burning.size / 260;
    this.intensity += (clamp(frac, 0, 1) - this.intensity) * Math.min(1, dt * 1.4);
    if (this.burning.size === 0 && this.intensity < 0.02) { this.active = false; this.intensity = 0; }
    audio.setFire(this.intensity);

    this.regrow(dt, game);
  }

  /**
   * The basin heals. Once the flames are out, scorched tiles slowly green over
   * and the occasional seedling comes up — lodgepole cones actually need fire
   * to open, so the burn scar is where the next forest starts.
   */
  regrow(dt, game) {
    if (this.burning.size > 0 || this.scar.length === 0) return;
    this.regrowT -= dt;
    if (this.regrowT > 0) return;
    this.regrowT = 1.1;

    const i = Math.floor(Math.random() * this.scar.length);
    const idx = this.scar[i];
    this.scar.splice(i, 1);
    const tx = idx % this.w, ty = (idx / this.w) | 0;
    if (this.burn[idx] > 0) return;

    const base = this.world.base[idx];
    this.world.tiles[idx] = base;
    this.world.invalidateChunkAt(tx, ty);
    this.fuel[idx] = base === T.DUFF ? 1.4 : base === T.SAGE ? 1.25 : base === T.MEADOW_DRY ? 1.1 : base === T.GRASS ? 1.0 : base === T.MEADOW ? 0.85 : 0;
    this.regrown++;
    const dec = this.decorByTile.get(idx);
    if (dec) for (const d of dec) { if (Math.random() < 0.7) d.burned = false; }

    if (Math.random() < 0.16 && this.fuel[idx] > 0) {
      const n = this.world.addNodeLive('pineSmall', tx * TS + 8, ty * TS + 8);
      if (n) {
        let arr = this.nodeByTile.get(idx);
        if (!arr) { arr = []; this.nodeByTile.set(idx, arr); }
        arr.push(n);
        this.fuel[idx] += n.def.hp * 0.9;
        if (game && game.r.camera.visible(n.x, n.y, 40)) {
          particles.burst(n.x, n.y - 4, 6, { colors: ['#4f7a41', '#8ac47a'], speed: 34, life: 0.7, vz: 30 });
        }
      }
    }
  }

  _tick(dt, game) {
    const wx = Math.cos(this.windAngle), wy = Math.sin(this.windAngle);
    const toAdd = [];
    const toRemove = [];

    for (const i of this.burning) {
      const tx = i % this.w, ty = (i / this.w) | 0;
      const b = this.burn[i];

      // Consume fuel. Tuned so open grass burns for ~4 seconds and a torching
      // lodgepole for the better part of half a minute: long enough that the
      // fire is a place you have to fight through, not a flicker.
      const consume = (0.05 + b * 0.035) * dt * 3;
      this.fuel[i] = Math.max(0, this.fuel[i] - consume);

      // burn down any trees standing here
      const arr = this.nodeByTile.get(i);
      if (arr) {
        for (const n of arr) {
          if (!n.alive) continue;
          n.burning = true;
          n.burn += dt * 0.55;
          if (n.burn >= 1) {
            n.alive = false;
            n.fallT = 0.6;
            this.burn[i] = Math.max(this.burn[i], 2.2);   // torching flare-up
            if (game) game.onTreeBurned(n);
          }
        }
      }

      if (this.fuel[i] <= 0.05) {
        // burned out -> scorched ground, remembered so it can green up later
        toRemove.push(i);
        this.world.tiles[i] = hash2(tx, ty, 91) < 0.45 ? T.ASH : T.CHARRED;
        this.world.invalidateChunkAt(tx, ty);
        this.burnedTiles++;
        this.scar.push(i);
        const dec = this.decorByTile.get(i);
        if (dec) for (const d of dec) d.burned = true;
        continue;
      }

      // grow toward full intensity, then decay as fuel runs low
      this.burn[i] = clamp(b + dt * (this.fuel[i] > 0.35 ? 1.6 : -0.5), 0.2, 2.6);

      // spread
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = tx + dx, ny = ty + dy;
        if (!this.inBounds(nx, ny)) continue;
        const k = this.idx(nx, ny);
        if (this.burn[k] > 0 || this.fuel[k] <= 0.05) continue;
        const diag = dx && dy ? 0.62 : 1;
        const align = (dx * wx + dy * wy) / Math.hypot(dx, dy);
        const windBias = 0.55 + Math.max(0, align) * this.windSpeed * 2.2;
        const wetness = Math.max(0, 1 - this.wet[k] * 1.4);
        // Slow enough that a doused firebreak actually holds, fast enough
        // downwind that turning your back on it costs you the treeline.
        const p = 0.14 * dt * 2.4 * diag * windBias * clamp(this.fuel[k], 0, 2) * wetness * clamp(b, 0.3, 2);
        if (Math.random() < p) toAdd.push(k);
      }
    }

    for (const i of toRemove) { this.burn[i] = 0; this.burning.delete(i); }
    for (const k of toAdd) {
      if (this.burn[k] > 0) continue;
      this.burn[k] = 0.3;
      this.burning.add(k);
      const arr = this.nodeByTile.get(k);
      if (arr) for (const n of arr) if (n.alive) n.burning = true;
    }

    // wetness dries out over time
    for (let i = 0; i < this.wet.length; i += 7) {
      const j = (i + ((this.world.time * 13) | 0)) % this.wet.length;
      if (this.wet[j] > 0) this.wet[j] = Math.max(0, this.wet[j] - dt * 0.12);
    }
  }

  /** Fraction of the basin's original fuel that has been destroyed. */
  get destroyedFraction() {
    let left = 0;
    for (let i = 0; i < this.fuel.length; i++) left += this.fuel[i];
    return this.totalFuel > 0 ? clamp(1 - left / this.totalFuel, 0, 1) : 0;
  }

  /** Flames are drawn as stacked ellipses whose height follows a fast wave. */
  draw(r, time) {
    if (this.burning.size === 0) return;
    const cam = r.camera;
    const ctx = r.ctx;
    ctx.globalCompositeOperation = 'lighter';
    let drawn = 0;
    for (const i of this.burning) {
      const tx = i % this.w, ty = (i / this.w) | 0;
      const x = tx * TS + 8, y = ty * TS + 12;
      if (!cam.visible(x, y, 32)) continue;
      if (drawn++ > 380) break;
      const b = clamp(this.burn[i], 0.2, 2.6);
      const ph = time * 7 + tx * 1.3 + ty * 0.7;
      const hgt = (9 + Math.sin(ph) * 3.4 + Math.sin(ph * 2.3) * 2) * (0.45 + b * 0.55);
      const wid = (3.1 + Math.cos(ph * 1.7) * 0.9) * (0.55 + b * 0.38);
      const sway = Math.sin(ph * 0.8) * 2 + Math.cos(this.windAngle) * b * 1.4;
      // Stacked cones, hottest and narrowest at the tip. Alphas stay low
      // because these are additive and hundreds of them overlap.
      r.circle(x + sway * 0.35, y - hgt * 0.2, wid, P.fire4, 0.34);
      r.circle(x + sway * 0.55, y - hgt * 0.5, wid * 0.82, P.fire3, 0.4);
      r.circle(x + sway * 0.78, y - hgt * 0.8, wid * 0.55, P.fire2, 0.44);
      if (b > 0.7) r.circle(x + sway * 0.95, y - hgt * 1.04, wid * 0.28, P.fire1, 0.5);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Lights for the lightmap pass. */
  drawLight(r) {
    if (this.burning.size === 0) return;
    const cam = r.camera;
    let n = 0;
    for (const i of this.burning) {
      const tx = i % this.w, ty = (i / this.w) | 0;
      const x = tx * TS + 8, y = ty * TS + 8;
      if (!cam.visible(x, y, 40)) continue;
      if ((n++ & 3) !== 0) continue;   // every 4th tile is enough for the glow
      r.light(x, y, 46 + this.burn[i] * 14, 'rgba(255,150,70,0.85)', 0.8);
    }
  }
}
