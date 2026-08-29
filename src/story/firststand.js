// The first fight in the basin, which you lose.
//
// Les Nest does not send a wave at you. It sends a survey team with an escort,
// and the escort is armoured well past anything a stolen popper can dent. The
// sequence is scripted: their armour holds, your health drains, and when you go
// down they take what they came for and leave you in the dirt.
//
// You do not get a game over. You get up, and the whole rest of the game is
// what you do about it.

import { Cutscene, beat } from './cutscene.js';
import { P } from '../art/palette.js';
import { clamp, dist2, TAU } from '../engine/math.js';
import { rnd, chance, pick } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { drawText } from '../engine/font.js';
import { VIEW_W, VIEW_H } from '../engine/canvas.js';
import { TS } from '../world/tiles.js';

export const STAND = {
  IDLE: 'idle', WARN: 'warn', FIGHT: 'fight', BEATEN: 'beaten', OATH: 'oath', DONE: 'done',
};

/** How long you are allowed to believe you can win this. */
const FIGHT_TIME = 30;
const ARMOUR = 0.06;          // fraction of your damage that gets through

export class FirstStand {
  constructor() {
    this.phase = STAND.IDLE;
    this.t = 0;
    this.cut = null;
    this.squad = [];
    this.finished = false;
    this.spite = 0;
    this.objective = '';
    this.hitsLanded = 0;
    this.treesTaken = 0;
  }

  get active() { return this.phase !== STAND.IDLE && this.phase !== STAND.DONE; }
  get blocksDirector() { return this.active; }

  /**
   * Start a cutscene. The completion callback only clears the slot if this is
   * still the scene sitting in it: a beat that starts the next chapter has
   * already put its own scene there, and must not be wiped by the old one
   * finishing a frame later.
   */
  play(beats, opts = {}) {
    const cs = new Cutscene(beats, Object.assign({ letterbox: 1 }, opts, {
      onDone: () => { if (this.cut === cs) this.cut = null; },
      // The escort speak from wherever they happen to be standing.
      speakerAt: (who, game) => {
        const k = String(who).toUpperCase();
        if (k === 'ENFORCER') return this.squad.find(e => !e.dead) || null;
        if (k === 'SUBJECT 41') return game.player;
        if (k === 'IMPLANT') return game.player;
        return null;
      },
    }));
    this.cut = cs;
    return cs;
  }

  /** Called a few seconds after the crash, once you can walk. */
  begin(game) {
    this.phase = STAND.WARN;
    this.t = 0;
    const den = game.world.den;
    audio.play('wavewarn', { vol: 0.9 });
    game.hud.showAnnounce('THEY FOLLOWED YOU DOWN', 'SURVEY TEAM - ARMOURED ESCORT', P.uiBad, 4);
    this.objective = 'STOP THEM';

    this.play([
      beat.wait(0.6),
      beat.say('IMPLANT', 'CONTACT. THEY TRACKED THE TRANSPORT. THIS IS NOT A PATROL.', 3.6, P.cyber),
      beat.say('IMPLANT', 'I AM READING CERAMIC PLATE ON ALL FOUR. YOUR POPPER WILL NOT GO THROUGH IT.', 4.4, P.cyber),
      beat.clearLine(),
      beat.do((g) => this.deploy(g)),
      beat.do(() => { this.phase = STAND.FIGHT; this.t = 0; }),
    ]);
  }

  deploy(game) {
    const den = game.world.den;
    const kinds = ['enforcer', 'enforcer', 'logger', 'spider'];
    for (let i = 0; i < kinds.length; i++) {
      const a = (i / kinds.length) * TAU + 0.4;
      const e = game.spawnEnemy(kinds[i], den.x + Math.cos(a) * 150, den.y + Math.sin(a) * 120, 3);
      // Scripted armour. Not invulnerable — you want to feel the hits land and
      // do almost nothing, which is worse.
      e.scripted = true;
      e.armour = ARMOUR;
      e.hp = e.maxHp = e.maxHp * 4;
      this.squad.push(e);
    }
    audio.play('wavestart', { vol: 1 });
    audio.setIntensity(0.85);
  }

  update(dt, game) {
    if (this.phase === STAND.IDLE || this.phase === STAND.DONE) return;
    this.t += dt;
    if (this.cut) {
      const cut = this.cut;
      cut.update(dt, game);
      if (cut.done && this.cut === cut) this.cut = null;
    }

    const p = game.player;
    if (this.phase === STAND.FIGHT) {
      // They are here for timber, and they take it while you shoot at them.
      for (const e of this.squad) {
        if (e.dead) { e.hp = 1; e.dead = false; }      // they do not fall today
      }
      if (chance(dt * 0.5)) this.takeTree(game);

      // The fight ends on a clock, or when you are on the floor. Whichever
      // comes first — you cannot outlast it.
      const beaten = p.hp <= p.maxHp * 0.18 || this.t > FIGHT_TIME;
      if (beaten) this.knockDown(game);
    }
  }

  /** A logger drops one of your trees, every time, all through the fight. */
  takeTree(game) {
    const p = game.player;
    const near = [];
    for (const n of game.world.nodes) {
      if (!n.alive || !n.def.flammable || n.def.art !== 'tree') continue;
      if (dist2(n.x, n.y, p.x, p.y) < 260 * 260) near.push(n);
      if (near.length > 12) break;
    }
    if (!near.length) return;
    const t = pick(near);
    game.world.hitNode(t, 99);
    this.treesTaken++;
    particles.text(t.x, t.y - 20, 'TAKEN', P.uiBad, { life: 1 });
    audio.play('timber', { vol: 0.5 });
  }

  knockDown(game) {
    if (this.phase !== STAND.FIGHT) return;
    this.phase = STAND.BEATEN;
    this.t = 0;
    const p = game.player;
    p.hp = Math.max(1, Math.round(p.maxHp * 0.06));
    p.invuln = 999;
    p.vx = p.vy = 0;
    game.bullets.clear();
    game.slowmo(0.3, 1.4);
    game.hitFlash = 1;
    game.r.camera.addShake(10);
    audio.play('hurt', { vol: 1 });
    audio.setIntensity(0.15);
    particles.blood(p.x, p.y - 6, 30);
    this.objective = '';

    const den = game.world.den;
    this.play([
      beat.do((g) => { g.r.camera.follow(p.x, p.y); }),
      beat.wait(1.2),
      beat.say('', 'You are on your side in the needles. You can hear them working.', 4.4),
      beat.wait(0.6),
      beat.say('ENFORCER', "That's the one from Block C. Look at the eye.", 3.2, P.nestEye),
      beat.say('ENFORCER', "Leave it. It's a ferret. It'll be dead of something by Friday.", 4, P.nestEye),
      beat.clearLine(),
      // they take the stand and go
      beat.do((g) => {
        for (let i = 0; i < 6; i++) this.takeTree(g);
        g.r.camera.addShake(6);
      }),
      beat.sfx('timber', 0.9),
      beat.wait(1.4),
      beat.do((g) => {
        for (const e of this.squad) { e.scripted = false; e.armour = 0; e.leaving = true; }
      }),
      beat.say('', 'They walk back to the transport. Nobody looks round.', 3.8),
      beat.clearLine(),
      beat.fade(1, 1.6),
      beat.do((g) => { this.startOath(g); }),
    ]);
  }

  startOath(game) {
    this.phase = STAND.OATH;
    this.t = 0;
    const p = game.player;
    const den = game.world.den;
    // clear the field: they are gone, and so is a good part of your forest
    for (const e of game.enemies) e.dead = true;
    game.enemies.length = 0;
    this.squad.length = 0;
    game.bullets.clear();
    p.x = den.x; p.y = den.y + 20;
    p.hp = Math.max(1, Math.round(p.maxHp * 0.06));

    this.play([
      beat.fade(0, 1.6),
      beat.do((g) => { g.r.camera.follow(p.x, p.y); }),
      beat.wait(1),
      beat.say('IMPLANT', 'YOU ARE AWAKE. IT IS MORNING. THEY TOOK ELEVEN TREES AND TWO OF THE OTHERS.', 5, P.cyber),
      beat.say('IMPLANT', 'I CAN LIST WHAT WENT WRONG. YOU FOUGHT ALONE, AND YOU FOUGHT WITH WHAT YOU STOLE.', 5.2, P.cyber),
      beat.say('IMPLANT', 'THERE ARE OTHERS IN THIS BASIN. FEED THEM. ARM THEM. THEY WILL STAND WITH YOU.', 5.2, P.cyber),
      beat.clearLine(),
      beat.say('', 'GET UP', 1.4, P.uiBad),
      beat.mash(12, 'GET UP', 'melee',
        (cs, g, n) => {
          particles.burst(p.x, p.y - 4, 4, { colors: [P.cyber, '#ffffff'], speed: 60, life: 0.3, additive: true });
          g.r.camera.addShake(1.4 + n * 0.25);
          if (n === 6) cs.say('', 'GET UP', P.uiWarn);
        },
        (cs, g) => {
          audio.play('levelup');
          g.r.camera.addShake(9);
          particles.ring(p.x, p.y - 6, 4, 110, 0.9, P.cyber, 3, true);
          g.hitFlash = 0.6;
        }),
      beat.clearLine(),
      beat.say('SUBJECT 41', 'Every one of them. Every machine. Every truck.', 3.6, P.cyber),
      beat.say('SUBJECT 41', 'They can have the basin when there is nothing of me left to bury in it.', 4.4, P.cyber),
      beat.clearLine(),
      beat.do((g) => this.grantSpite(g)),
      beat.wait(1.6),
      beat.do((g) => this.finish(g)),
    ]);
  }

  /** What losing buys you. A real, permanent number, not a consolation line. */
  grantSpite(game) {
    const p = game.player;
    this.spite = 1;
    p.bonus.hp += 25;
    p.bonus.damage += 0.5;      // stats.damage is a multiplier on a base of 1
    p.bonus.speed += 0.16;
    p.spite = true;
    p.recompute();
    p.hp = p.maxHp;
    game.hud.showAnnounce('SPITE', '+25 HEALTH   +25% DAMAGE   +8% SPEED', P.cyber, 5);
    game.toast('THEY MADE YOU. NOW GO AND BE WHAT THEY MADE.', P.cyber, 7);
    particles.text(p.x, p.y - 26, 'SPITE', P.cyber, { life: 2, scale: 2 });
  }

  finish(game) {
    if (this.finished) return;
    this.finished = true;
    this.phase = STAND.DONE;
    this.cut = null;
    this.objective = '';
    game.player.invuln = 1.5;
    game.hud.showAnnounce('TAKE THE BASIN BACK', 'FIND THEIR OUTPOSTS. BURN THEM DOWN.', P.ui, 4.5);
    game.toast('TALK TO EVERY ANIMAL YOU MEET  -  E  -  FEED THEM AND THEY FIGHT WITH YOU', P.uiGood, 9);
    audio.setIntensity(0.15);
  }

  /** Skip the whole thing (used when the story was skipped from the menu). */
  skip(game) {
    this.phase = STAND.DONE;
    this.finished = true;
    this.cut = null;
    for (const e of this.squad) e.dead = true;
    this.squad.length = 0;
  }

  drawHud(r, ctx, game) {
    if (!this.active) return;
    if (this.objective) {
      drawText(ctx, this.objective, VIEW_W / 2, 6, P.uiBad, { align: 'center', shadow: '#000' });
    }
    if (this.phase === STAND.FIGHT) {
      // Their armour, shown honestly, so the futility is information and not
      // a bug you think you are hitting.
      const w = 96, x = VIEW_W / 2 - w / 2, y = 16;
      r.uiRect(x - 1, y - 1, w + 2, 6, 'rgba(0,0,0,0.6)');
      r.uiRect(x, y, w, 4, '#3a1c1c');
      const f = clamp(1 - this.t / FIGHT_TIME, 0, 1);
      r.uiRect(x, y, w * f, 4, P.uiBad);
      drawText(ctx, 'PLATE HOLDING', x + w / 2, y - 9, P.uiBad, { align: 'center', shadow: true });
      if (this.treesTaken > 0) {
        drawText(ctx, 'TREES TAKEN ' + this.treesTaken, VIEW_W / 2, y + 7, P.uiWarn, { align: 'center', shadow: true });
      }
    }
    if (this.cut) this.cut.draw(r, game);
  }
}
