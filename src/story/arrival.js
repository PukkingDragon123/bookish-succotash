// The first ten minutes in the basin.
//
// The transport used to put you on the ground and immediately hand you a to-do
// list about outposts. That is the wrong first move: you have just come down
// through a canopy in a burning helicopter, you have never held a tool, and the
// game has never once shown you how any of it works.
//
// So this is the arrival. You black out. You come round on your side with the
// wreck burning a few metres away and the implant — the only thing Les Nest
// left in your head that is any use to you — talking you through your first
// three tools: chop, craft, carry. The bucket you make puts out the fire that
// woke you up, which is the whole tutorial in one object.
//
// Then a blue jay lands, because somebody in this basin has been watching the
// sky all morning and has opinions about what just fell out of it.
//
// Everything here is a step with a `done(game)` predicate rather than a timer,
// so nothing advances until the player has actually done the thing, and every
// step publishes an objective and a waypoint so there is never a moment where
// you do not know what you are for.

import { Cutscene, beat } from './cutscene.js';
import { P } from '../art/palette.js';
import { clamp, dist2, lerp, TAU } from '../engine/math.js';
import { rnd, chance, pick } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { drawText } from '../engine/font.js';
import { VIEW_W, VIEW_H } from '../engine/canvas.js';
import { TS, TILES, isWater } from '../world/tiles.js';
import { Animal } from '../entities/wildlife.js';

export const ARRIVE = {
  BLACK: 'black', WAKE: 'wake', TEACH: 'teach', JAY: 'jay', BUGS: 'bugs', DONE: 'done',
};

/** How many bugs the jay wants before he calls you a friend. */
const BUG_ASK = 3;

export class Arrival {
  constructor() {
    this.phase = ARRIVE.BLACK;
    this.t = 0;
    this.cut = null;
    this.step = 0;
    this.objective = '';
    this.waypoint = null;
    this.jay = null;
    this.jayHop = 0;
    this.jayLine = '';
    this.jayLineT = 0;
    this.bugsCaught = 0;
    this.finished = false;
    this.wreck = null;
    this.fireOut = false;
    this.blackout = 1;          // full-screen black, lifted by the wake beat
    this.woozy = 0;             // the ring that closes in while you come round
    this.steps = null;
  }

  get active() { return !this.finished; }
  /** Nothing else in the basin gets to happen until she is on her feet. */
  get blocksDirector() { return !this.finished; }
  get blocksStand() { return !this.finished; }

  play(beats, opts = {}) {
    const cs = new Cutscene(beats, Object.assign({ letterbox: 0.7 }, opts, {
      onDone: () => { if (this.cut === cs) this.cut = null; },
      speakerAt: (who, game) => {
        const k = String(who).toUpperCase();
        if (k === 'JAY') return this.jay;
        if (k === 'IMPLANT' || k === 'SUBJECT 41') return game.player;
        return null;
      },
    }));
    this.cut = cs;
    return cs;
  }

  // ======================================================================
  //  the crash
  // ======================================================================
  /**
   * Called the instant the basin is built, before the player can move.
   *
   * The wreck is placed a short walk away rather than on top of her, because
   * the first thing the game asks you to do is look at it.
   */
  begin(game, quick = false) {
    const p = game.player;
    this.phase = ARRIVE.BLACK;
    this.t = 0;
    this.blackout = 1;
    game.blockPlayer = true;

    // The wreck, thrown clear of where she landed.
    //
    // Its fire is deliberately NOT the forest fire simulation. A real ignition
    // here spreads, and a spreading fire during a tutorial where the player is
    // held still and starting on a quarter of her health kills her before she
    // has pressed a key — which is exactly what it did the first time. This
    // fire is a prop: it burns until she pours a bucket on it and never moves.
    const a = rnd(TAU);
    this.wreck = { x: p.x + Math.cos(a) * 110, y: p.y + Math.sin(a) * 78, t: 0, burn: 1 };

    p.hp = Math.max(14, Math.round(p.maxHp * 0.4));
    p.anim = 'dead';
    game.r.camera.x = game.r.camera.tx = p.x;
    game.r.camera.y = game.r.camera.ty = p.y;

    // Skipping the story skips the helicopter, so there is nothing to black
    // out from — but the tutorial and the bird are the game teaching itself,
    // and everybody gets those. The opening just starts with the eyes open.
    const opening = quick ? [
      beat.do((g) => { this.phase = ARRIVE.WAKE; this.woozy = 0.7; }),
      beat.fade(0, 1.2),
      beat.say('IMPLANT', 'YOU ARE DOWN. IT HELD TOGETHER LONG ENOUGH.', 3.2, P.cyber),
      beat.say('IMPLANT', 'NOBODY IS COMING TO PUT THAT OUT. THAT IS THE WHOLE SITUATION.', 4, P.cyber),
      beat.clearLine(),
    ] : [
      // --- blacked out -----------------------------------------------------
      beat.wait(1.6),
      beat.say('', '. . .', 2.2, P.uiDim),
      beat.sfx('hurt', 0.4),
      beat.wait(1.4),
      beat.say('', 'Something is very hot and very close.', 3, P.uiDim),
      beat.clearLine(),
      beat.wait(1.2),
      beat.say('IMPLANT', 'GET UP.', 1.8, P.cyber),
      beat.wait(0.8),
      beat.say('IMPLANT', 'FORTY-ONE. GET UP.', 2.2, P.cyber),

      // --- coming round ----------------------------------------------------
      beat.do((g) => {
        this.phase = ARRIVE.WAKE;
        this.woozy = 1;
        audio.play('bigexplode', { vol: 0.5 });
        g.r.camera.addShake(6);
      }),
      beat.fade(0, 2.6),
      beat.wait(0.6),
      beat.do((g) => { g.player.anim = 'idle'; }),
      beat.say('IMPLANT', 'THERE SHE IS.', 2, P.cyber),
      beat.clearLine(),
    ];

    const look = quick ? [] : [
      beat.do((g) => { g.r.camera.follow(this.wreck.x, this.wreck.y); }),
      beat.wait(2.2),
      beat.say('IMPLANT', 'THAT WAS THE TRANSPORT. IT IS NOT GOING TO BE ANYTHING ELSE NOW.', 4.2, P.cyber),
      beat.do((g) => { g.r.camera.follow(g.player.x, g.player.y); }),
      beat.wait(1),
      beat.say('IMPLANT', 'NOBODY IS COMING TO PUT THAT OUT. THAT IS THE WHOLE SITUATION.', 4.2, P.cyber),
      beat.clearLine(),
    ];

    this.play([
      ...opening,
      ...look,
      beat.do((g) => {
        g.blockPlayer = false;
        this.phase = ARRIVE.TEACH;
        this.step = 0;
        this.startTeaching(g);
      }),
    ]);
  }

  // ======================================================================
  //  the tutorial, as three tools and one fire
  // ======================================================================
  startTeaching(game) {
    const p = game.player;
    const startWood = p.inv.get('wood');
    const startFiber = p.inv.get('fiber');

    // Each step is a thing you do, not a thing you watch. `done` is checked
    // every frame; `at` returns where the marker should point, re-evaluated as
    // you move, so the arrow always finds the nearest one of whatever it wants.
    this.steps = [
      {
        objective: 'CHOP THREE TREES  -  E',
        say: ['IMPLANT', 'YOU HAVE CLAWS AND THERE ARE TREES. WALK UP TO ONE AND HOLD E.', 4.6],
        at: (g) => this.nearestNodeOf(g, 'axe'),
        tip: 'E  -  CHOP, GATHER, TALK',
        done: (g) => g.player.inv.get('wood') - startWood >= 3,
      },
      {
        objective: 'STRIP ONE FIBRE  -  SAGE OR ASPEN',
        say: ['IMPLANT', 'NOW SOMETHING TO BIND IT. SAGEBRUSH. THE GREY ONES, LOW DOWN.', 4.6],
        at: (g) => this.nearestNodeOf(g, 'hand'),
        done: (g) => g.player.inv.get('fiber') - startFiber >= 1,
      },
      {
        objective: 'CRAFT A BARK BUCKET  -  TAB',
        say: ['IMPLANT', 'PRESS TAB. YOU CAN MAKE THINGS. YOU HAVE ALWAYS BEEN ABLE TO MAKE THINGS.', 4.8],
        at: () => null,
        tip: 'TAB  -  CRAFT',
        done: (g) => g.player.inv.get('bucket') > 0,
      },
      {
        objective: 'FILL IT AT THE WATER  -  E',
        say: ['IMPLANT', 'FIND WATER. THE BUCKET IS THE ONLY REASON YOU CAN CARRY ANY.', 4.4],
        at: (g) => this.nearestWater(g),
        done: (g) => g.player.inv.get('water') > 0,
      },
      {
        objective: 'PUT THE FIRE OUT',
        say: ['IMPLANT', 'NOW GO AND DEAL WITH THE THING THAT WOKE YOU UP.', 3.8],
        at: () => this.wreck,
        done: () => this.fireOut,
      },
    ];
    this.enterStep(game);
  }

  enterStep(game) {
    const s = this.steps[this.step];
    if (!s) return this.callTheJay(game);
    this.objective = s.objective;
    if (s.say) {
      const [who, text, dur] = s.say;
      this.play([beat.say(who, text, dur, P.cyber), beat.clearLine()], { letterbox: 0 });
    }
    if (s.tip) game.toast(s.tip, P.uiDim, 6);
  }

  nearestNodeOf(game, tool) {
    const p = game.player;
    let best = null, bd = 1e9;
    for (const n of game.world.nodes) {
      if (!n.alive || n.def.tool !== tool) continue;
      const d = dist2(p.x, p.y, n.x, n.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  nearestWater(game) {
    const p = game.player;
    const w = game.world;
    const ptx = Math.floor(p.x / TS), pty = Math.floor(p.y / TS);
    // Ring search outward, so it finds the near bank rather than the lake's
    // centre — which on this map can be a hundred metres of open water away.
    for (let r = 2; r < 60; r += 2) {
      for (let a = 0; a < 28; a++) {
        const th = (a / 28) * TAU;
        const tx = ptx + Math.round(Math.cos(th) * r);
        const ty = pty + Math.round(Math.sin(th) * r);
        if (!w.inBounds(tx, ty)) continue;
        const id = w.tileAt(tx, ty);
        if (isWater(id) && !TILES[id].hot) return { x: tx * TS + TS / 2, y: ty * TS + TS / 2 };
      }
    }
    return null;
  }

  // ======================================================================
  //  the jay
  // ======================================================================
  callTheJay(game) {
    this.phase = ARRIVE.JAY;
    this.objective = '';
    this.waypoint = null;
    const p = game.player;

    // He comes in from off-camera and lands short, the way a bird does — not
    // on you, a couple of body-lengths away, where he can leave.
    const a = rnd(TAU);
    this.jay = new Animal('bluejay', p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 200);
    this.jay.scripted = true;      // no wandering AI: this bird has business
    this.jay.bonded = true;
    this.jay.trust = 100;
    this.jay.nick = 'Pip';
    this.jay.guide = true;
    this.jayTarget = { x: p.x + Math.cos(a) * 40, y: p.y + Math.sin(a) * 30 };
    game.wildlife.animals.push(this.jay);

    this.play([
      beat.wait(0.4),
      beat.sfx('quest', 0.6),
      beat.do((g) => { g.r.camera.follow(this.jay.x, this.jay.y); }),
      beat.wait(1.6),
      beat.do((g) => { g.r.camera.follow(g.player.x, g.player.y); }),
      beat.until(() => dist2(this.jay.x, this.jay.y, this.jayTarget.x, this.jayTarget.y) < 30 * 30, 8),
      beat.wait(0.5),
      beat.say('JAY', "HI. Hi. Hello. You're the thing that fell out of the sky.", 4, '#8fc4ff'),
      beat.say('JAY', "I watched the whole thing. It was the best morning I have had in a year.", 4.4, '#8fc4ff'),
      beat.say('JAY', "Pip. Blue jay. I know every tree in this basin and most of the rocks.", 4.4, '#8fc4ff'),
      beat.clearLine(),
      beat.wait(0.4),
      beat.say('JAY', "You look like someone who has never been outside. I can fix that.", 4, '#8fc4ff'),
      beat.say('JAY', "Small thing first. I am starving and there are bugs in this grass.", 4.2, '#8fc4ff'),
      beat.say('JAY', "Bring me three. Get close, press E, be quick — they scatter.", 4.4, '#8fc4ff'),
      beat.clearLine(),
      beat.do((g) => {
        this.phase = ARRIVE.BUGS;
        this.objective = 'CATCH THREE BUGS FOR PIP  -  E';
        g.toast('BUGS SCATTER WHEN YOU GET CLOSE  -  SPACE TO DASH IN', P.uiDim, 7);
        this.seedBugs(g);
      }),
    ]);
  }

  /** Make sure there is actually something to catch where she is standing. */
  seedBugs(game) {
    const p = game.player;
    let near = 0;
    for (const b of game.wildlife.bugs) {
      if (dist2(b.x, b.y, p.x, p.y) < 300 * 300) near++;
    }
    for (let i = near; i < 8; i++) {
      const a = rnd(TAU), d = rnd(70, 220);
      game.wildlife.spawnBugAt(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    }
  }

  /**
   * Standing at the wreck with water in the bucket.
   *
   * This is the only place in the game the bucket is used on a script, and it
   * is the point of the whole tutorial: the thing you made puts out the thing
   * that woke you up.
   */
  canDouse(game) {
    return !!(this.wreck && !this.fireOut && this.phase === ARRIVE.TEACH
      && this.step >= 4 && game.player.inv.get('water') > 0);
  }

  douse(game) {
    if (!this.canDouse(game)) return false;
    game.player.inv.take('water', 1);
    this.fireOut = true;
    audio.play('splash', { vol: 0.9 });
    particles.smoke(this.wreck.x, this.wreck.y - 8, 26, { life: 3.2, size: 5 });
    particles.water && particles.water(this.wreck.x, this.wreck.y - 4, 14);
    game.r.camera.addShake(2);
    return true;
  }

  /** Called by the game when a bug is caught, so the jay can react to it. */
  onBugCaught(game) {
    if (this.phase !== ARRIVE.BUGS) return;
    this.bugsCaught++;
    if (this.bugsCaught < BUG_ASK) {
      this.jaySay(`${BUG_ASK - this.bugsCaught} more! You're good at this!`);
      this.objective = `CATCH ${BUG_ASK - this.bugsCaught} MORE  -  THEN BRING THEM TO PIP`;
    } else {
      this.objective = 'TAKE THEM TO PIP  -  E';
      this.jaySay('That is three! Bring them here, bring them here—');
    }
  }

  /** Handing them over, which is the whole quest loop in miniature. */
  deliverBugs(game) {
    const p = game.player;
    if (this.phase !== ARRIVE.BUGS || this.bugsCaught < BUG_ASK) return false;
    if (!p.inv.take('bug', BUG_ASK)) return false;
    audio.play('deliver', { vol: 0.8 });
    particles.burst(this.jay.x, this.jay.y - 6, 14, {
      colors: ['#8fc4ff', '#e8eef6', P.favor], speed: 80, life: 0.7, vz: 60,
    });
    this.objective = '';
    this.play([
      beat.say('JAY', "Oh that is GOOD. That is a good bug. Two good bugs. Three—", 3.8, '#8fc4ff'),
      beat.clearLine(),
      beat.do((g) => {
        // He pays you the way a bird pays anyone: in things he found.
        g.player.inv.add('berries', 4);
        g.player.inv.add('fiber', 3);
        g.player.inv.add('feather', 2);
        g.flyItem && g.flyItem('berries', this.jay.x, this.jay.y - 6, g.player.x, g.player.y - 10, 0.4);
        audio.play('coinup', { vol: 0.7 });
        g.announce('PIP IS YOUR FRIEND', 'HE WILL SHOW YOU THE BASIN', P.favor, 3.6);
      }),
      beat.say('JAY', "Right. You are mine now. I am going to show you everything.", 4, '#8fc4ff'),
      beat.say('JAY', "There are people down here with cages and fences. Six camps of them.", 4.4, '#8fc4ff'),
      beat.say('JAY', "You want them gone. I want them gone. This is going to be great.", 4.2, '#8fc4ff'),
      beat.clearLine(),
      beat.do((g) => this.finish(g)),
    ]);
    return true;
  }

  jaySay(text, dur = 2.6) {
    this.jayLine = text;
    this.jayLineT = dur;
  }

  finish(game) {
    this.phase = ARRIVE.DONE;
    this.finished = true;
    this.objective = '';
    this.waypoint = null;
    game.blockPlayer = false;
    if (this.jay) this.jay.scripted = false;   // he follows you now, as a friend
    game.announce('TAKE THE BASIN BACK', 'FIND THEIR CAMPS. BURN THEM DOWN.', P.ui, 4.5);
    game.toast('M  -  MAP    I  -  BAG    TAB  -  CRAFT', P.uiDim, 9);
  }

  /** The player pressed skip: give them everything and get out of the way. */
  skip(game) {
    if (this.cut) { this.cut.skip(); this.cut = null; }
    const p = game.player;
    p.inv.add('bucket', 1);
    p.inv.add('wood', 3);
    if (this.jay) this.jay.scripted = false;
    this.finish(game);
  }

  // ======================================================================
  //  update
  // ======================================================================
  update(dt, game) {
    if (this.finished && !this.cut) return;
    this.t += dt;
    this.jayLineT = Math.max(0, this.jayLineT - dt);
    this.woozy = Math.max(0, this.woozy - dt * 0.22);

    if (this.cut) {
      // The scene can finish inside its own update and clear the slot, so hold
      // a reference rather than reading this.cut again on the next line.
      const cs = this.cut;
      cs.update(dt, game);
      if (cs.fade != null) this.blackout = cs.fade;
    } else if (this.phase !== ARRIVE.BLACK) {
      this.blackout = Math.max(0, this.blackout - dt * 0.8);
    }

    if (this.wreck) {
      this.wreck.t += dt;
      if (!this.fireOut) {
        if (chance(dt * 18)) particles.smoke(this.wreck.x + rnd(-18, 20), this.wreck.y - 16, 1, { life: 2.6, size: 4 });
        if (chance(dt * 12)) particles.embers(this.wreck.x + rnd(-22, 24), this.wreck.y - 10, 1);
      }
    }

    if (this.phase === ARRIVE.TEACH) this.updateTeach(dt, game);
    else if (this.phase === ARRIVE.JAY || this.phase === ARRIVE.BUGS) this.updateJay(dt, game);
  }

  updateTeach(dt, game) {
    const s = this.steps && this.steps[this.step];
    if (!s) return;
    const at = s.at(game);
    this.waypoint = at ? { x: at.x, y: at.y } : null;
    if (s.done(game)) {
      this.step++;
      audio.play('ui', { vol: 0.5, pitch: 1.3 });
      particles.text(game.player.x, game.player.y - 30, 'GOOD', P.uiGood, { life: 0.9 });
      this.enterStep(game);
    }
  }

  updateJay(dt, game) {
    const j = this.jay;
    if (!j || j.dead || !this.jayTarget) return;
    const p = game.player;
    // He hops toward his mark, then toward you, and never further than a bird
    // would bother to go.
    const tgt = this.phase === ARRIVE.JAY ? this.jayTarget : { x: p.x, y: p.y };
    const want = this.phase === ARRIVE.JAY ? 8 : 46;
    const d = Math.hypot(tgt.x - j.x, tgt.y - j.y);
    if (d > want) {
      const sp = Math.min(150, 60 + d * 0.6);
      j.x += ((tgt.x - j.x) / d) * sp * dt;
      j.y += ((tgt.y - j.y) / d) * sp * dt;
      j.facing = tgt.x < j.x ? -1 : 1;
      j.anim = 'walk';
      this.jayHop += dt;
    } else {
      j.anim = 'idle';
    }
    if (this.phase === ARRIVE.BUGS) {
      this.waypoint = this.bugsCaught >= BUG_ASK ? { x: j.x, y: j.y } : null;
      if (chance(dt * 0.14) && this.jayLineT <= 0) {
        this.jaySay(pick([
          'Under the logs! They love a log.',
          'You are faster than you look.',
          'I could do this myself. I choose not to.',
          'Long grass. Always the long grass.',
        ]));
      }
    }
  }

  // ======================================================================
  //  draw
  // ======================================================================
  /** World-space: the burning wreck, the marker, and the jay's little voice. */
  drawWorld(r, game) {
    const w = this.wreck;
    if (w) {
      const cam = r.camera;
      if (cam.visible(w.x, w.y, 120)) {
        // A torn rotor and a piece of tail boom, half buried. Small, because
        // the fire is the thing you are meant to look at, not the model.
        // Scaled against the animals, not against the tiles: an elk is sixty
        // pixels across in this basin, so a transport that reads as debris at
        // thirty is a piece of litter, not the thing that nearly killed you.
        const dark = this.fireOut;
        r.shadow(w.x, w.y + 8, 56, 15, 0.42);
        // tail boom, thrown out to the left and bent
        r.rect(w.x - 62, w.y - 16, 40, 11, dark ? '#2a2a2f' : '#39353c');
        r.rect(w.x - 62, w.y - 16, 40, 2, '#4c4852');
        r.rect(w.x - 62, w.y - 7, 40, 2, '#211f26');
        r.rect(w.x - 70, w.y - 27, 8, 18, dark ? '#26262b' : '#332f38');   // tail fin
        r.rect(w.x - 70, w.y - 27, 8, 2, '#4c4852');
        // the cabin, on its side and open
        r.rect(w.x - 24, w.y - 32, 52, 30, dark ? '#2f2f35' : '#403a44');
        r.rect(w.x - 24, w.y - 32, 52, 3, '#565060');
        r.rect(w.x - 24, w.y - 6, 52, 4, '#211f26');
        r.rect(w.x - 26, w.y - 24, 3, 20, '#4a4650');
        r.rect(w.x - 17, w.y - 27, 19, 15, dark ? '#1d2a2e' : '#2d4a52');  // glass
        r.rect(w.x - 17, w.y - 27, 19, 2, '#4e7a84');
        r.rect(w.x - 12, w.y - 25, 3, 11, '#3d5f68');
        r.rect(w.x + 8, w.y - 26, 16, 10, dark ? '#241f22' : '#7a3018');   // torn plate
        r.rect(w.x + 8, w.y - 26, 16, 2, dark ? '#332b2e' : '#a34620');
        // skids, buckled
        r.rect(w.x - 20, w.y - 1, 44, 3, '#3a3640');
        r.rect(w.x - 22, w.y - 4, 4, 5, '#3a3640');
        r.rect(w.x + 20, w.y - 4, 4, 5, '#3a3640');
        // the rotor, snapped and lying across the whole thing
        r.rect(w.x - 54, w.y - 44, 104, 4, '#4a4650');
        r.rect(w.x - 54, w.y - 44, 104, 2, '#6a6474');
        r.rect(w.x + 34, w.y - 54, 4, 18, '#4a4650');    // a blade folded up
        r.rect(w.x - 6, w.y - 50, 11, 11, '#565060');    // the head
        r.rect(w.x - 6, w.y - 50, 11, 2, '#787287');
        if (!this.fireOut) {
          const fl = 0.6 + Math.sin(w.t * 9) * 0.4;
          r.glow(w.x, w.y - 14, 72, 'rgba(255,150,60,0.55)', 0.5 + fl * 0.3);
          r.glow(w.x + 14, w.y - 22, 34, 'rgba(255,214,120,0.6)', 0.4 + fl * 0.4);
          r.light && r.light(w.x, w.y - 14, 190, 'rgba(255,170,80,0.55)', 0.65);
        }
      }
    }

    const wp = this.waypoint;
    if (wp) {
      const cam = r.camera;
      const bob = Math.sin(game.time * 4) * 2;
      if (cam.visible(wp.x, wp.y, 40)) {
        r.ring(wp.x, wp.y, 12 + Math.sin(game.time * 3) * 2, P.sulfurHi, 1, 0.5);
        r.rect(wp.x - 2, wp.y - 26 + bob, 4, 4, P.sulfurHi);
        r.rect(wp.x - 1, wp.y - 22 + bob, 2, 3, P.sulfurHi);
      } else {
        const a = Math.atan2(wp.y - game.player.y, wp.x - game.player.x);
        const ax = game.player.x + Math.cos(a) * 34, ay = game.player.y - 6 + Math.sin(a) * 34;
        r.rect(ax - 2, ay - 2, 4, 4, P.sulfurHi);
        r.rect(ax + Math.cos(a) * 5 - 1, ay + Math.sin(a) * 5 - 1, 2, 2, P.sulfurHi);
      }
    }

    // The jay's asides are small and float over him rather than taking the
    // dialogue bar, because they are chatter and not a scene.
    if (this.jay && this.jayLineT > 0 && !this.jay.dead) {
      const j = this.jay;
      // Three things want the strip of screen just above the player: the
      // interaction prompt, a dialogue bubble, and this. If either of the
      // other two is up and near him, his aside waits its turn.
      const pr = game.prompt;
      const clash = (pr && Math.abs(pr.x - j.x) < 90 && Math.abs(pr.y - j.y) < 60)
        || (game.dialogue && game.dialogue.isOpen);
      if (clash) return;
      const a = clamp(this.jayLineT, 0, 1);
      r.ctx.globalAlpha = a;
      const wpx = this.jayLine.length * 4 + 8;
      const bx = Math.round(j.x - r.camera.ox - wpx / 2);
      const by = Math.round(j.y - r.camera.oy - 30);
      r.uiRect(bx, by, wpx, 11, 'rgba(8,18,28,0.9)');
      r.uiStroke(bx, by, wpx, 11, '#8fc4ff');
      drawText(r.ctx, this.jayLine, bx + 4, by + 2, '#cfe4ff');
      r.ctx.globalAlpha = 1;
    }
  }

  /** Screen-space: the blackout, the woozy ring, the objective and the count. */
  drawHud(r, ctx, game) {
    // The objective sits in a plate of its own with a coloured rail, so it
    // reads as the one thing being asked of you rather than another line of
    // text competing with the banners for the same six pixels.
    if (this.objective) {
      const w = Math.max(120, this.objective.length * 5 + 22);
      const x = Math.round(VIEW_W / 2 - w / 2), y = 4;
      const h = this.phase === ARRIVE.BUGS ? 21 : 13;
      r.uiRect(x, y, w, h, 'rgba(8,14,12,0.86)');
      r.uiStroke(x, y, w, h, 'rgba(140,170,120,0.45)');
      r.uiRect(x, y, 2, h, P.sulfurHi);
      drawText(ctx, this.objective, x + w / 2 + 1, y + 3, P.sulfurHi, { align: 'center', shadow: '#000' });
      if (this.phase === ARRIVE.BUGS) {
        const got = Math.min(this.bugsCaught, BUG_ASK);
        drawText(ctx, 'BUGS  ' + got + '/' + BUG_ASK, x + w / 2 + 1, y + 12,
          got >= BUG_ASK ? P.uiGood : P.uiDim, { align: 'center', shadow: '#000' });
      }
    }
    if (this.cut) this.cut.draw(r, game);

    // Coming round: a soft vignette that opens up, plus the black over the top
    // of everything while she is still out.
    if (this.woozy > 0.01) {
      const g2 = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.18,
                                          VIEW_W / 2, VIEW_H / 2, VIEW_H * (0.75 - this.woozy * 0.42));
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(1, `rgba(0,0,0,${(this.woozy * 0.85).toFixed(3)})`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.phase === ARRIVE.BLACK && this.blackout > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.blackout).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}
