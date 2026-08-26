// The wave director. Runs the loop the whole game hangs off:
//
//   PREP (visible countdown, go gather) -> ASSAULT (clear them) -> breather
//
// Waves 5, 10 and 15 are bosses. Wave 8 is THE BURN: no boss, but Les Nest
// torches the basin and the objective changes from "kill things" to "save the
// forest and everything living in it".

import { ENEMY_TYPES } from '../entities/enemies.js';
import { P } from '../art/palette.js';
import { TAU, clamp } from '../engine/math.js';
import { rnd, pick, chance, makeRng } from '../engine/rng.js';

import { audio } from '../engine/audio.js';

export const PHASE = { PREP: 'prep', ASSAULT: 'assault', CLEAR: 'clear', FIRE: 'fire', VICTORY: 'victory' };

const COST = {
  poacher: 2, trapper: 3, logger: 4, technician: 2,
  drone: 3, spider: 6, turret: 6, enforcer: 7, harvester: 12, firebomber: 6,
};

// What Les Nest is willing to field, by wave.
const POOLS = [
  { from: 1, pool: [['poacher', 6], ['drone', 2]] },
  { from: 2, pool: [['poacher', 6], ['drone', 3], ['logger', 2]] },
  { from: 3, pool: [['poacher', 5], ['drone', 3], ['logger', 3], ['trapper', 2]] },
  { from: 4, pool: [['poacher', 4], ['drone', 3], ['logger', 3], ['trapper', 3], ['spider', 2], ['technician', 2]] },
  { from: 6, pool: [['poacher', 3], ['drone', 3], ['logger', 2], ['trapper', 3], ['spider', 3], ['turret', 2], ['technician', 2]] },
  { from: 9, pool: [['poacher', 2], ['drone', 3], ['trapper', 2], ['spider', 3], ['turret', 3], ['enforcer', 3], ['harvester', 1], ['firebomber', 2]] },
  { from: 12, pool: [['drone', 2], ['spider', 3], ['turret', 3], ['enforcer', 4], ['harvester', 2], ['firebomber', 2], ['trapper', 2]] },
];

const BOSS_WAVES = { 5: 'ripsawPrime', 10: 'kiln', 15: 'motherNest' };
export const FIRE_WAVE = 8;
export const FINAL_WAVE = 15;

const PREP_TIME = [0, 55, 48, 46, 44, 50, 42, 42, 55, 40, 50, 40, 40, 38, 38, 60];

export class Director {
  constructor(seed) {
    this.rng = makeRng((seed ^ 0xd17ec7) >>> 0);
    this.wave = 0;
    this.phase = PHASE.PREP;
    this.timer = 42;                 // first prep is generous: learn the basin
    this.prepTotal = 42;
    this.spawnQueue = [];
    this.spawnT = 0;
    this.spawnPoints = [];
    this.alive = 0;
    this.totalSpawned = 0;
    this.bossRef = null;
    this.fireEvent = null;
    this.announce = null;
    this.announceT = 0;
    this.endless = false;
    this.peakWave = 0;
  }

  get isBossWave() { return !!BOSS_WAVES[this.wave]; }
  get nextIsBoss() { return !!BOSS_WAVES[this.wave + 1]; }
  get nextIsFire() { return this.wave + 1 === FIRE_WAVE; }

  waveLabel() {
    if (this.wave + 1 === FIRE_WAVE) return 'THE BURN';
    const b = BOSS_WAVES[this.wave + 1];
    if (b) return ENEMY_TYPES[b].name;
    return 'WAVE ' + (this.wave + 1);
  }

  // ------------------------------------------------------------------ update
  update(dt, game) {
    this.announceT = Math.max(0, this.announceT - dt);

    switch (this.phase) {
      case PHASE.PREP: {
        this.timer -= dt;
        // warning pips as the clock runs down
        const t = Math.ceil(this.timer);
        if (t !== this._lastTick && t <= 5 && t > 0) {
          this._lastTick = t;
          audio.play('wavewarn', { vol: 0.5 });
        }
        if (this.timer <= 0) this.startWave(game);
        break;
      }
      case PHASE.ASSAULT: {
        this.updateSpawning(dt, game);
        if (this.spawnQueue.length === 0 && game.enemies.length === 0) this.endWave(game);
        break;
      }
      case PHASE.FIRE: {
        this.updateFireEvent(dt, game);
        break;
      }
      case PHASE.CLEAR: {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = PHASE.PREP;
          this.timer = PREP_TIME[Math.min(this.wave + 1, PREP_TIME.length - 1)] || 40;
          if (this.endless) this.timer = 34;
          this.prepTotal = this.timer;
          this._lastTick = null;
        }
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------- waves
  startWave(game) {
    this.wave++;
    this.peakWave = Math.max(this.peakWave, this.wave);
    this._lastTick = null;
    this.spawnQueue.length = 0;
    this.chooseSpawnPoints(game);

    if (this.wave === FIRE_WAVE) {
      this.startFireEvent(game);
      return;
    }

    this.phase = PHASE.ASSAULT;
    const boss = BOSS_WAVES[this.wave];
    if (boss) {
      this.queueBoss(boss, game);
      game.announce(ENEMY_TYPES[boss].name, 'LES NEST HEAVY ASSET', P.nestEye, 4);
      audio.play('roar');
      audio.setIntensity(1);
    } else {
      this.queueWave(game);
      game.announce('WAVE ' + this.wave, this.describeWave(), P.uiWarn, 2.6);
      audio.play('wavestart');
      audio.setIntensity(0.65);
    }
    game.r.camera.addShake(3);
    game.onWaveStart(this.wave);
  }

  describeWave() {
    const kinds = new Set(this.spawnQueue.map(s => s.kind));
    const names = [...kinds].map(k => ENEMY_TYPES[k].name.toUpperCase());
    return names.slice(0, 3).join(' / ');
  }

  /** Sable's intel: a peek at what the next wave is actually made of. */
  describeNext() {
    const next = this.wave + 1;
    if (next === FIRE_WAVE) return 'INCENDIARY OPERATION';
    const boss = BOSS_WAVES[next];
    if (boss) return 'HEAVY ASSET DEPLOYING';
    const pool = this.poolFor(next);
    const names = pool.slice(0, 3).map(([k]) => ENEMY_TYPES[k].name.toUpperCase());
    return names.join(', ');
  }

  poolFor(wave) {
    let best = POOLS[0];
    for (const p of POOLS) if (wave >= p.from) best = p;
    return best.pool;
  }

  queueWave(game) {
    const budget = Math.round((6 + this.wave * 4.6) * (this.endless ? 1.25 : 1));
    const pool = this.poolFor(this.wave);
    let spent = 0;
    let guard = 0;
    while (spent < budget && guard++ < 300) {
      const kind = this.rng.weighted(pool);
      const c = COST[kind] || 3;
      if (spent + c > budget + 3) break;
      spent += c;
      this.spawnQueue.push({ kind, at: rnd(0, 6 + this.wave * 0.6), point: this.rng.int(0, this.spawnPoints.length - 1) });
    }
    // arrive in loose clusters rather than a uniform drip
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.spawnT = 0;
  }

  queueBoss(kind, game) {
    this.spawnQueue.push({ kind, at: 1.4, point: 0, boss: true });
    const escortPool = this.wave >= 10 ? [['spider', 3], ['drone', 3], ['enforcer', 2]] : [['poacher', 4], ['drone', 3]];
    const n = 4 + Math.floor(this.wave / 3);
    for (let i = 0; i < n; i++) {
      this.spawnQueue.push({ kind: this.rng.weighted(escortPool), at: 2.5 + i * 1.6, point: this.rng.int(0, this.spawnPoints.length - 1) });
    }
    this.spawnT = 0;
  }

  chooseSpawnPoints(game) {
    // Ring the den, biased to the edges of the screen the player is looking at.
    this.spawnPoints.length = 0;
    const world = game.world;
    const cx = game.player.x, cy = game.player.y;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.rng.range(0, 0.6);
      const d = 250 + this.rng.range(0, 90);
      let x = cx + Math.cos(a) * d;
      let y = cy + Math.sin(a) * d * 0.8;
      x = clamp(x, 40, world.pxW - 40);
      y = clamp(y, 40, world.pxH - 40);
      this.spawnPoints.push({ x, y, a });
    }
  }

  updateSpawning(dt, game) {
    this.spawnT += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.spawnT) {
      const s = this.spawnQueue.shift();
      const pt = this.spawnPoints[clamp(s.point, 0, this.spawnPoints.length - 1)] || this.spawnPoints[0];
      const x = pt.x + rnd(-30, 30), y = pt.y + rnd(-24, 24);
      const e = game.spawnEnemy(s.kind, x, y, this.wave);
      if (s.boss) { this.bossRef = e; game.boss = e; }
      this.totalSpawned++;
    }
  }

  endWave(game) {
    this.phase = PHASE.CLEAR;
    this.timer = 4.5;
    this.bossRef = null;
    game.boss = null;
    audio.play('waveclear');
    audio.setIntensity(0.12);
    game.onWaveCleared(this.wave);

    if (this.wave >= FINAL_WAVE && !this.endless) {
      this.phase = PHASE.VICTORY;
      game.onVictory();
      return;
    }
    game.announce('WAVE ' + this.wave + ' CLEARED', 'THE BASIN HOLDS', P.uiGood, 3);
  }

  // ------------------------------------------------------------- the burn
  startFireEvent(game) {
    this.phase = PHASE.FIRE;
    this.fireEvent = {
      t: 0,
      stage: 0,
      bombersLeft: 6,
      bomberT: 0,
      duration: 150,
      trapped: 0,
      startedFires: 0,
    };
    game.announce('THE BURN', 'SAVE THE BASIN', P.fire2, 5);
    game.toast('PUT OUT FIRES WITH WATER  -  CARRY TRAPPED ANIMALS TO THE DEN', P.fire1, 8);
    audio.play('firewhoosh');
    audio.setIntensity(0.9);
    game.onFireEventStart();

    // Opening salvo: a line of incendiaries across the treeline upwind.
    const world = game.world;
    const a = rnd(TAU);
    for (let i = 0; i < 9; i++) {
      const x = clamp(game.player.x + Math.cos(a) * (140 + i * 44) + rnd(-40, 40), 40, world.pxW - 40);
      const y = clamp(game.player.y + Math.sin(a) * (140 + i * 44) + rnd(-40, 40), 40, world.pxH - 40);
      game.spawnFirebomb(x, y, 1.2 + i * 0.25, null, true);
    }
    // Some animals get cut off and need carrying out.
    this.fireEvent.trapped = game.wildlife.trapNear(game.player.x, game.player.y, 460, 6);
    game.rescueTarget = this.fireEvent.trapped;
    game.rescued = 0;

    for (let i = 0; i < 3; i++) {
      game.spawnEnemy('firebomber', game.player.x + rnd(-260, 260), game.player.y + rnd(-220, 220), this.wave);
    }
  }

  updateFireEvent(dt, game) {
    const ev = this.fireEvent;
    ev.t += dt;
    ev.bomberT -= dt;

    // Waves of bombers keep re-lighting the basin for the first two thirds.
    if (ev.bomberT <= 0 && ev.bombersLeft > 0 && ev.t < ev.duration * 0.66) {
      ev.bomberT = 14;
      ev.bombersLeft--;
      const a = rnd(TAU);
      game.spawnEnemy('firebomber', game.player.x + Math.cos(a) * 300, game.player.y + Math.sin(a) * 260, this.wave);
      if (chance(0.6)) game.spawnEnemy('drone', game.player.x + Math.cos(a + 1) * 280, game.player.y + Math.sin(a + 1) * 240, this.wave);
      game.toast('MORE BOMBERS INBOUND', P.uiBad, 2.4);
    }

    // Ground troops arrive to stop you fighting the fire.
    if (chance(dt * 0.22) && game.enemies.length < 14) {
      const a = rnd(TAU);
      game.spawnEnemy(pick(['poacher', 'logger', 'trapper']), game.player.x + Math.cos(a) * 300, game.player.y + Math.sin(a) * 250, this.wave);
    }

    // More animals get cut off as the fire grows.
    if (chance(dt * 0.14) && game.fire.active) {
      const n = game.wildlife.trapNear(game.player.x, game.player.y, 380, 1);
      if (n) { ev.trapped += n; game.rescueTarget += n; game.toast('AN ANIMAL IS TRAPPED', P.uiWarn, 2.4); }
    }

    audio.setIntensity(clamp(0.7 + game.fire.intensity * 0.3, 0, 1));

    const fireOut = !game.fire.active && game.fire.burning.size === 0;
    const timeUp = ev.t > ev.duration;
    if ((fireOut && ev.t > 30) || timeUp) {
      // clear remaining bombers before calling it
      const bombersLeft = game.enemies.some(e => e.kind === 'firebomber');
      if (!bombersLeft || timeUp) {
        game.fire.extinguishAll();
        this.phase = PHASE.CLEAR;
        this.timer = 6;
        audio.play('waveclear');
        audio.setIntensity(0.12);
        game.onFireEventEnd();
        game.announce('THE BURN IS OUT', 'THE BASIN SURVIVES', P.uiGood, 4);
      }
    }
  }

  // Called when the player wipes; soften the next wave a little.
  onPlayerDeath() {
    if (this.phase === PHASE.ASSAULT) {
      this.spawnQueue.length = 0;
    }
  }

  goEndless() {
    this.endless = true;
    this.phase = PHASE.CLEAR;
    this.timer = 6;
  }
}
