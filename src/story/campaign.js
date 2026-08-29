// The campaign. Eight chapters that run before the forest ever appears:
//
//   cage -> course -> plan -> break -> shot -> rampage -> heli -> forest
//
// It owns the lab world, the scripted actors, and the cutscenes. The forest
// game is untouched by any of it; when the last chapter ends it hands control
// back and the survival loop starts.

import { buildLab, LAB_W, LAB_H } from '../world/lab.js';
import { labProp, heliFrames } from '../art/lab.js';
import { HUMANS } from '../art/species.js';
import { BEASTS } from '../art/beastiary.js';
import { critterFrames, critterSize } from '../art/critters.js';
import { pixFrames, pixSize, hasPixArt } from '../art/beastpix.js';
import { beastFrames, beastSize } from '../art/animals.js';
import { P } from '../art/palette.js';
import { flashFrames } from '../art/pixel.js';
import { Cutscene, beat } from './cutscene.js';
import { drawText } from '../engine/font.js';
import { clamp, dist2, TAU, lerp } from '../engine/math.js';
import { rnd, chance, pick } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { TS, T } from '../world/tiles.js';
import { VIEW_W, VIEW_H } from '../engine/canvas.js';

/** One notch lighter, for the lit crown of a tree seen from above. */
function shadeUp(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 16);
  const g = Math.min(255, ((n >> 8) & 255) + 20);
  const b = Math.min(255, (n & 255) + 14);
  return `rgb(${r},${g},${b})`;
}

export const CHAPTER = {
  CAGE: 'cage', COURSE: 'course', PLAN: 'plan', BREAK: 'break',
  SHOT: 'shot', RAMPAGE: 'rampage', HELI: 'heli', DONE: 'done',
};

/** A scripted character. Not an enemy, not an NPC — the script moves it. */
export class Actor {
  constructor(kind, cfg, x, y, opts = {}) {
    this.kind = kind;          // 'critter' | 'beast'
    this.cfg = cfg;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.anim = opts.anim || 'idle';
    this.animT = rnd(1);
    this.facing = opts.facing || 1;
    this.view = 'front';
    this.name = opts.name || '';
    this.dead = false;
    this.hurtT = 0;
    this.objType = 'actor';
    this.tint = null;
    this.alpha = 1;
    this.rot = 0;
    this.key = opts.key || 'actor';
    if (kind === 'prop') {
      this.propKind = opts.prop || cfg;
      const img = labProp(this.propKind, 0);
      this.w = img ? img.width : 16;
      this.h = img ? img.height : 16;
    } else {
      const s = kind === 'beast'
        ? (hasPixArt(this.key) ? pixSize(this.key) : beastSize(cfg))
        : critterSize(cfg);
      this.w = s.w; this.h = s.h;
    }
    this.r = 6;
    this.target = null;
    this.speed = opts.speed || 0;
  }

  frames(anim, view) {
    if (this.kind === 'prop') return [labProp(this.propKind || this.cfg, 0)];
    if (this.kind === 'beast') {
      if (hasPixArt(this.key)) return pixFrames(this.key, anim, 8);
      return beastFrames('a:' + this.key, this.cfg, anim, view, 8);
    }
    return critterFrames('a:' + this.key, this.cfg, anim, view, 8);
  }

  moveTo(x, y, speed) { this.target = { x, y }; this.speed = speed; }

  update(dt) {
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) { this.target = null; this.vx = this.vy = 0; this.anim = 'idle'; }
      else {
        this.vx = (dx / d) * this.speed;
        this.vy = (dy / d) * this.speed;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.anim = this.speed > 70 ? 'run' : 'walk';
        this.facing = dx > 0 ? 1 : -1;
      }
    }
    const rate = this.anim === 'run' ? 1.9 : this.anim === 'walk' ? 1.15 : this.anim === 'attack' ? 2.2 : 0.5;
    this.animT = (this.animT + dt * rate) % 1;
  }

  draw(r, game) {
    if (this.dead && this.anim !== 'dead') return;
    if (this.kind === 'prop') {
      const img = labProp(this.talking ? (this.propKindTalk || this.propKind) : this.propKind, 0);
      if (!img) return;
      r.shadow(this.x, this.y, this.w * 0.4, 3, 0.36);
      r.draw(img, this.x - img.width / 2, this.y - img.height + 2, false, this.alpha);
      return;
    }
    const fr = this.frames(this.anim, this.view);
    let img = fr[Math.floor(this.animT * fr.length) % fr.length];
    if (this.hurtT > 0 && Math.floor(this.hurtT * 30) % 2 === 0) {
      img = flashFrames('a:' + this.key + this.anim + this.view, fr, '#ffffff')[Math.floor(this.animT * fr.length) % fr.length];
    }
    r.shadow(this.x, this.y, 6, 2.6, 0.28);
    if (this.rot) r.drawT(img, this.x, this.y - img.height / 2, this.rot, this.facing < 0 ? -1 : 1, 1, this.alpha);
    else r.draw(img, this.x - img.width / 2, this.y - img.height + 2, this.facing < 0, this.alpha);
  }
}

export class Campaign {
  constructor(game) {
    this.game = game;
    this.chapter = CHAPTER.CAGE;
    this.actors = [];
    this.cut = null;
    this.marks = null;
    this.t = 0;
    this.exhaustion = 0;      // the course drains you
    this.exhaustionPeak = 0;
    this.courseDone = false;
    this.gatesPassed = 0;
    this.hasGun = false;
    this.chipVoiceT = 0;
    this.chipLine = null;
    this.rampageKills = 0;
    this.rampageStage = 0;
    this.heli = null;
    this.objective = '';
    this.waypoint = null;     // { x, y, label } — drawn as a marker and an arrow
    this.readT = 0;           // how long a terminal's text stays up
    this.readLines = null;
    this.crawl = null;        // { t, from, to } — mid-duct
    this.ventsUsed = 0;
    this.lockersForced = 0;
    this.jarsRead = 0;
    this.lap = 1;
    this.chipFrom = 'IMPLANT';
    this.blockPlayer = true;
    this.finished = false;
  }

  // ======================================================================
  //  setup
  // ======================================================================
  /**
   * Where a given speaker is standing, so their line can be a bubble over
   * their head instead of a bar at the bottom of the screen. An unknown name
   * — or the empty name narration uses — falls through to the plate.
   */
  speakerAt(who, game) {
    if (!who) return null;
    const key = who.toUpperCase();
    if (key === 'DAX') return this.dax && !this.dax.dead ? this.dax : null;
    if (key === 'VANE') return this.vane;
    if (key === 'GUARD') return this.guard || this.guardEnemy;
    if (key === 'SUBJECT 41') return game.player;
    if (key.startsWith('VANE')) return this.vane;
    return null;
  }

  /** True while a scripted beat is driving the camera itself. */
  get ownsCamera() {
    return !!(this.cut && this.cut.beat && this.cut.beat.cam) || this.blockPlayer;
  }

  /**
   * Load the facility and park the ferret in its tank without starting the
   * script. The title screen runs on top of this.
   */
  prepareTitle() {
    const g = this.game;
    g.mode = 'lab';
    this.marks = buildLab(g.world, g.seed);
    g.fire.rebuildFuel();
    g.wildlife.animals.length = 0;
    g.wildlife.bugs.length = 0;
    g.wildlife.fish.length = 0;
    g.r.camera.bounds = { minX: 0, minY: 0, maxX: g.world.pxW, maxY: g.world.pxH };

    const c = this.marks.cage;
    g.player.x = c.x - 4; g.player.y = c.y + 6;
    g.player.weapons = ['claws'];
    g.player.weaponIndex = 0;
    g.player.inv.items.ammo = 0;
    // frame the tank, slightly off-centre, so the menu has room on the right
    g.r.camera.bounds = null;
    g.r.camera.x = g.r.camera.tx = c.x + 18;
    g.r.camera.y = g.r.camera.ty = c.y - 2;

    const b = this.marks.beaverCage;
    this.dax = new Actor('beast', BEASTS.beaver.cfg, b.x, b.y + 6, { name: 'Dax', key: 'dax', facing: -1 });
    this.actors.push(this.dax);
    this.titleReady = true;
  }

  /**
   * Start a cutscene. The completion callback only clears the slot if this is
   * still the scene sitting in it: a beat that starts the next chapter has
   * already put its own scene there, and must not be wiped by the old one
   * finishing a frame later.
   */
  play(beats, opts = {}) {
    const cs = new Cutscene(beats, Object.assign({ letterbox: 1 }, opts, {
      onDone: () => { if (this.cut === cs) this.cut = null; },
      speakerAt: (who, game) => this.speakerAt(who, game),
    }));
    this.cut = cs;
    return cs;
  }

  begin() {
    const g = this.game;
    g.mode = 'lab';
    if (!this.titleReady) this.marks = buildLab(g.world, g.seed);
    g.fire.rebuildFuel();
    g.enemies.length = 0;
    g.wrecks.length = 0;
    g.hazards.length = 0;
    g.pickups.clear();
    g.bullets.clear();
    g.npcs.length = 0;
    g.wildlife.animals.length = 0;
    g.wildlife.bugs.length = 0;
    g.wildlife.fish.length = 0;
    g.r.camera.bounds = { minX: 0, minY: 0, maxX: g.world.pxW, maxY: g.world.pxH };

    const c = this.marks.cage;
    g.player.x = c.x; g.player.y = c.y + 6;
    g.player.weaponIndex = 0;
    g.player.weapons = ['claws'];
    g.player.inv.items.ammo = 0;
    g.r.camera.x = g.player.x; g.r.camera.y = g.player.y;
    g.r.camera.tx = g.player.x; g.r.camera.ty = g.player.y;

    // Dax, in the next tank over.
    if (!this.dax) {
      const b = this.marks.beaverCage;
      this.dax = new Actor('beast', BEASTS.beaver.cfg, b.x, b.y + 6, { name: 'Dax', key: 'dax', facing: -1 });
      this.actors.push(this.dax);
    }

    this.startCage();
  }

  chip(text, seconds = 4) {
    this.chipLine = text;
    this.chipVoiceT = seconds;
    audio.play('scan', { vol: 0.45 });
  }

  // ======================================================================
  //  chapters
  // ======================================================================
  startCage() {
    this.chapter = CHAPTER.CAGE;
    this.objective = 'WAIT';
    const g = this.game;
    this.blockPlayer = false;
    this.play([
      beat.do(() => { g.r.camera.follow(this.marks.cage.x, this.marks.cage.y); }),
      beat.wait(0.8),
      beat.say('', 'LES NEST BIOLOGICAL ASSETS - BLOCK C', 2.6, P.nestTealHi),
      beat.say('', 'SUBJECT 41 - MUSTELA NIGRIPES - DAY 612', 3, P.nestTealHi),
      beat.clearLine(),
      beat.wait(0.6),
      beat.do(() => { this.objective = 'MOVE  -  THE TANK IS SMALL'; }),
      beat.say('DAX', "Psst. Forty-one. You awake over there?", 3),
      beat.say('DAX', "Course you are. You never sleep after they take you down the hall.", 3.6),
      beat.say('DAX', "Name's Dax. Tank nine. Been counting the ceiling tiles for two years.", 4),
      beat.clearLine(),
      beat.do(() => { this.objective = 'WALK TO THE GLASS  -  HE IS IN THE NEXT TANK'; }),
      beat.until((game) => game.player.x > this.marks.cage.x + 20, 18),
      beat.say('DAX', "There you are. Look at that eye. They really did a number on you.", 3.6),
      beat.say('DAX', "Listen. They'll come for the course in a minute. Run it. Eat. Get strong.", 4),
      beat.say('DAX', "Because I have been working on something, and I am going to need you—", 3.4),

      // --- the lights go ---------------------------------------------------
      beat.do((game) => {
        audio.play('metal', { vol: 0.9, pitch: 0.5 });
        game.labDark = 1;
        game.r.camera.addShake(2);
      }),
      beat.clearLine(),
      beat.wait(1.4),
      beat.say('DAX', "...oh no.", 1.6, P.uiWarn),
      beat.wait(1.2),
      beat.say('DAX', "Don't look at him. Forty-one. Do not look at him.", 3, P.uiWarn),
      beat.clearLine(),
      // you hear it before you see it
      beat.do(() => { audio.play('ui', { vol: 0.3, pitch: 0.4 }); }),
      beat.wait(0.8),
      beat.sfx('metal', 0.35),
      beat.wait(0.9),
      beat.sfx('metal', 0.45),
      beat.wait(0.7),
      beat.do((game) => { this.spawnVane(game); game.r.camera.follow(this.marks.cage.x + 60, this.marks.cage.y); }),
      beat.wait(3.2),
      beat.do((game) => { game.r.camera.follow(this.vane.x - 14, this.vane.y - 10); }),
      beat.wait(1),

      beat.say('VANE', "Forty-one.", 2, P.nestEye),
      beat.say('VANE', "Do you know that you are the only one of these that has ever looked back at me?", 4.6, P.nestEye),
      beat.say('VANE', "Six hundred and twelve days. Four hundred of them with my eye in your head.", 4.6, P.nestEye),
      beat.do((game) => { game.hitFlash = Math.max(game.hitFlash, 0.35); audio.play('chip', { vol: 0.7 }); }),
      beat.say('VANE', "It sees what you see. I have watched you sleep from a room four floors up.", 4.8, P.nestEye),
      beat.clearLine(),
      beat.wait(0.8),
      beat.say('VANE', "They tell me you are refusing the course.", 3, P.nestEye),
      beat.say('VANE', "So we will do what we did last month. You will run it. And you will not be fed.", 4.8, P.nestEye),
      beat.say('VANE', "And then you will run it again, and we will see what you are actually made of.", 4.8, P.nestEye),
      beat.clearLine(),
      beat.wait(0.6),
      beat.say('DAX', "She's a KIT. She was a kit when you took her—", 3.2, P.uiWarn),
      beat.do((game) => {
        // he does not argue. he presses a button on the arm of the chair.
        audio.play('shieldbreak', { vol: 0.8 });
        game.hitFlash = 1;
        game.r.camera.addShake(7);
        game.slowmo(0.35, 0.5);
        particles.ring(this.dax.x, this.dax.y - 6, 3, 26, 0.4, P.nestEye, 2, true);
        this.dax.hurtT = 0.8;
      }),
      beat.say('', 'TANK 9 - COMPLIANCE - LEVEL 2', 2.2, P.nestEye),
      beat.wait(1.4),
      beat.say('DAX', "...ngh. Fine. Fine.", 2, P.uiDim),
      beat.clearLine(),
      beat.say('VANE', "Better. Open forty-one's gate.", 2.8, P.nestEye),
      beat.do((game) => {
        const m = this.marks.cage;
        for (let ty = m.ty - 1; ty <= m.ty + 1; ty++) game.world.setTile(m.tx + 3, ty, T.LAB_DARK);
        audio.play('metal', { vol: 0.9 });
        game.labDark = 0;
      }),
      beat.say('VANE', "Run, please.", 2.4, P.nestEye),
      beat.clearLine(),
      beat.do(() => this.startCourse()),
    ]);
  }

  /**
   * Aldous Vane arrives.
   *
   * Everything about the presentation is built to make him worse than a guard
   * with a gun: the lights go first, then the room goes quiet, and then you
   * hear the chair a long time before you see it. He never raises his voice
   * and he never gets out of the chair. He does not need to.
   */
  spawnVane(game) {
    const m = this.marks.cage;
    this.vane = new Actor('prop', 'chair', m.x + 150, m.y - 34, { name: 'Vane', key: 'vane', prop: 'chair' });
    this.vane.propKindTalk = 'chairTalk';
    this.actors.push(this.vane);
    this.vane.moveTo(m.x + 44, m.y - 12, 22);
    this.vaneHere = true;
    audio.setIntensity(0);
  }

  /** The chair's whine, kept up while he is on screen. */
  updateVane(dt, game) {
    const v = this.vane;
    if (!v || v.dead) return;
    v.talking = !!(this.cut && this.cut.line && /VANE/.test(this.cut.line.who || ''));
    if (chance(dt * 3)) audio.play('ui', { vol: 0.06, pitch: 0.45 });
    // the implant does not like him
    if (chance(dt * 0.5)) {
      particles.spawn({
        x: game.player.x + rnd(-2, 2), y: game.player.y - 8, z: 2,
        vx: 0, vy: 0, vz: 8, life: 0.4, size: 1, colors: [P.cyber], additive: true,
      });
    }
  }

  startCourse() {
    this.chapter = CHAPTER.COURSE;
    this.blockPlayer = false;
    this.exhaustion = 0;
    this.gatesPassed = 0;
    this.lap = this.lap || 1;
    this.objective = 'RUN THE COURSE  -  REACH THE FOOD';
    this.waypoint = { x: this.marks.dish.x, y: this.marks.dish.y, label: 'FOOD' };
    this.cut = null;
    const first = this.lap === 1;
    this.game.hud.showAnnounce(
      first ? 'THE COURSE' : 'AGAIN',
      first ? 'HE IS WATCHING. HE WRITES IT DOWN.' : 'SECOND LAP. HE SAID HE WOULD.',
      P.nestTealHi, 3.2);
    if (first) this.game.toast('WASD / LEFT THUMB TO MOVE  -  SPACE TO DASH', P.uiDim, 7);
    for (const g2 of this.marks.gates) g2.passed = false;
    this.courseDone = false;
  }

  /**
   * He said he would withhold it, and he does. The dish is there, you run the
   * whole course for it, and it is empty — and then you run it again, because
   * the alternative is not running it.
   */
  denyFood(game) {
    const d = this.marks.dish;
    this.lap = 2;
    this.blockPlayer = true;
    audio.play('deny', { vol: 1 });
    game.hitFlash = 0.5;
    game.r.camera.addShake(4);
    // the dish visibly empties
    for (const o of game.world.props) {
      if (o.kind === 'dish') o.kind = 'dishEmpty';
    }
    this.play([
      beat.do(() => { game.r.camera.follow(d.x, d.y); }),
      beat.wait(1.2),
      beat.say('', 'The dish is clean. Somebody washed it and put it back.', 4),
      beat.wait(0.6),
      beat.clearLine(),
      beat.say('VANE', "Thirty-four seconds. That is your best time, and you did it hungry.", 4.6, P.nestEye),
      beat.say('VANE', "Which tells me every figure I have been given for two years is soft.", 4.8, P.nestEye),
      beat.say('VANE', "Again, please. From the gate.", 2.8, P.nestEye),
      beat.clearLine(),
      beat.do((g2) => {
        g2.player.x = this.marks.courseStart.x;
        g2.player.y = this.marks.courseStart.y;
        if (g2.player.rig) g2.player.rig.reset(g2.player.x, g2.player.y);
        this.exhaustion = 62;          // you do not get to rest between laps
        this.blockPlayer = false;
        this.startCourse();
      }),
    ]);
  }

  startPlan() {
    this.chapter = CHAPTER.PLAN;
    this.objective = 'BACK IN THE TANK';
    const g = this.game;
    const c = this.marks.cage;
    g.player.x = c.x; g.player.y = c.y + 6;
    // seal the tank again
    for (let ty = c.ty - 1; ty <= c.ty + 1; ty++) g.world.setTile(c.tx + 3, ty, T.LAB_GLASS);
    this.dax.x = this.marks.beaverCage.x - 20;
    this.dax.facing = -1;

    this.play([
      beat.do(() => { g.r.camera.follow(c.x + 30, c.y); }),
      beat.sfx('metal', 0.7),
      beat.wait(1),
      beat.say('DAX', "Good. You ate. You'll need it.", 2.6),
      beat.say('DAX', "Two years I've been chewing the seal on my tank. Two years.", 3.6),
      beat.say('DAX', "It's down to the last few millimetres. I push, it goes.", 3.4),
      beat.say('DAX', "But the pane between us is rated for something a lot heavier than a beaver.", 4),
      beat.say('DAX', "So here's the plan. I hit it low. You hit it high. Same moment. Every time.", 4.4),
      beat.say('DAX', "Ready when you are, Forty-one.", 2.6),
      beat.clearLine(),
      beat.do(() => this.startBreak()),
    ]);
  }

  startBreak() {
    this.chapter = CHAPTER.BREAK;
    this.objective = 'BREAK THE GLASS';
    const g = this.game;
    const gm = this.marks.cageGlass;
    const gx = gm.tx * TS + TS / 2, gy = gm.ty * TS + TS / 2;
    let hits = 0;
    this.play([
      beat.do(() => { g.r.camera.follow(gx, gy); this.blockPlayer = true; }),
      beat.mash(14, 'HIT IT', 'melee',
        (cs, game, n) => {
          hits = n;
          particles.burst(gx, gy, 6, { colors: ['#dff2f5', '#a9dbe0'], speed: 90, life: 0.4, additive: true });
          game.r.camera.addShake(2 + n * 0.2);
          audio.play('metal', { vol: 0.5 + n * 0.03 });
          this.dax.anim = 'attack';
          this.dax.animT = 0;
          if (n === 5) cs.say('DAX', "That's it! Again!", P.uiGood);
          if (n === 10) cs.say('DAX', "It's going! It's GOING!", P.uiGood);
        },
        () => {
          audio.play('shieldbreak', { vol: 1 });
          audio.play('bigexplode', { vol: 0.5 });
          for (let ty = gm.ty - 2; ty <= gm.ty + 2; ty++) g.world.setTile(gm.tx, ty, T.LAB_DARK);
          particles.burst(gx, gy, 40, { colors: ['#dff2f5', '#a9dbe0', '#7fb4bb'], speed: 190, life: 1, vz: 120, gravity: 300, bounce: 0.3 });
          g.r.camera.addShake(10);
          this.blockPlayer = false;
        }),
      beat.clearLine(),
      beat.say('DAX', "HA! Two years! Two years and it took eleven seconds!", 3.2, P.uiGood),
      beat.do(() => {
        this.dax.moveTo(gx - 8, gy + 8, 60);
        this.dax.anim = 'walk';
      }),
      beat.wait(1.4),
      beat.say('DAX', "Come on. Service corridor, south end. I know the way, I've watched them walk it a thousand—", 4.4),
      beat.do(() => this.startShot()),
    ]);
  }

  startShot() {
    this.chapter = CHAPTER.SHOT;
    this.objective = '';
    const g = this.game;
    const gm = this.marks.cageGlass;
    const gx = gm.tx * TS + TS / 2, gy = gm.ty * TS + TS / 2;
    this.blockPlayer = true;

    this.guard = new Actor('critter', HUMANS.enforcer.cfg, gx + 130, gy - 60, { name: 'Guard', key: 'guard', facing: -1 });
    this.actors.push(this.guard);

    this.play([
      beat.sfx('alarm', 1),
      beat.do(() => { g.hitFlash = 0.7; g.r.camera.addShake(3); }),
      beat.say('', 'CONTAINMENT BREACH - BLOCK C', 2, P.nestEye),
      beat.do(() => { this.guard.moveTo(gx + 46, gy - 10, 90); }),
      beat.wait(1.6),
      beat.clearLine(),
      beat.say('GUARD', "Down. Both of you. DOWN.", 2, P.nestEye),
      beat.do(() => { this.dax.target = null; this.dax.anim = 'idle'; this.dax.facing = 1; }),
      beat.say('DAX', "Run. Forty-one — RUN—", 1.8, P.uiWarn),
      // the shot
      beat.do(() => { g.slowmo(0.25, 0.9); }),
      beat.sfx('rifle', 1),
      beat.do(() => {
        g.hitFlash = 1;
        g.r.camera.addShake(9);
        this.dax.hurtT = 0.4;
      }),
      beat.blood(() => ({ x: this.dax.x, y: this.dax.y - 8 }), 46),
      beat.do(() => {
        this.dax.anim = 'dead';
        this.dax.dead = true;
        // the floor remembers it
        const tx = Math.floor(this.dax.x / TS), ty = Math.floor(this.dax.y / TS);
        for (let j = -1; j <= 1; j++) for (let i = -2; i <= 2; i++) g.world.setTile(tx + i, ty + j, T.LAB_BLOOD);
      }),
      beat.wait(1.2),
      beat.do(() => { g.r.camera.follow(this.dax.x, this.dax.y); }),
      beat.wait(1.6),
      beat.say('', '...', 1.4),
      beat.clearLine(),
      // and then you stop being a subject
      beat.do(() => {
        g.player.overclock = true;
        audio.setIntensity(1);
        particles.ring(g.player.x, g.player.y - 6, 4, 90, 0.8, P.cyber, 3, true);
        g.r.camera.addShake(8);
        g.slowmo(0.4, 0.5);
      }),
      beat.sfx('roar', 1),
      beat.say('SUBJECT 41', "...", 1, P.cyber),
      beat.do(() => { g.hitFlash = 0.9; }),
      beat.wait(0.8),
      beat.clearLine(),
      beat.do(() => this.startRampage()),
    ]);
  }

  startRampage() {
    this.chapter = CHAPTER.RAMPAGE;
    this.blockPlayer = false;
    this.rampageStage = 0;
    this.objective = 'KILL HIM';
    this.waypoint = null;
    const g = this.game;
    g.player.overclock = false;
    g.hud.showAnnounce('GO FERAL', 'X TO CLAW', P.nestEye, 3);
    g.toast('X / CLW TO CLAW  -  SPACE TO DASH  -  TIME IT AND YOU PARRY', P.ui, 8);

    // the guard becomes a real enemy now
    const e = g.spawnEnemy('labGuard', this.guard.x, this.guard.y, 1);
    e.spawnT = 0;
    this.guardEnemy = e;
    this.actors = this.actors.filter(a => a !== this.guard);
    audio.setIntensity(0.9);
  }

  /** Rampage progression: each cleared stage unlocks the next room. */
  advanceRampage() {
    const g = this.game;
    this.rampageStage++;
    const m = this.marks;
    switch (this.rampageStage) {
      case 1:
        // his gun hits the floor
        this.hasGun = true;
        g.player.weapons = ['popper'];
        g.player.weaponIndex = 0;
        g.player.inv.items.ammo = 60;
        g.pickups.drop('weapon', 'popper', this.guardEnemy.x, this.guardEnemy.y, { vz: 120 });
        g.hud.showAnnounce('TAKE IT', 'THE GUN IS YOURS NOW', P.sulfurHi, 3);
        this.chip('AUDIO LINK ESTABLISHED. SUBJECT 41, YOUR IMPLANT IS AWAKE. I CAN SEE WHAT YOU SEE.', 6);
        this.objective = 'SOUTH CORRIDOR';
        this.waypoint = { x: m.corridor.x, y: m.corridor.y, label: 'CORRIDOR' };
        this.spawnWave(m.corridor, ['labGuard', 'technician'], 3);
        break;
      case 2:
        this.chip('THEY ARE MASSING IN THE SURGERY. THAT IS THE ROOM THEY USED ON YOU.', 5);
        this.objective = 'SURGERY - WEST';
        this.waypoint = { x: m.surgery.x, y: m.surgery.y, label: 'SURGERY' };
        this.spawnWave(m.surgery, ['labGuard', 'labGuard', 'technician'], 5);
        break;
      case 3:
        this.chip('SECURITY WING. THEY HAVE MACHINES DOWN THERE. YOU KNOW WHAT TO DO WITH MACHINES.', 5);
        this.objective = 'SECURITY - EAST';
        this.waypoint = { x: m.security.x, y: m.security.y, label: 'SECURITY' };
        this.spawnWave(m.security, ['labGuard', 'drone', 'labGuard', 'spider'], 6);
        break;
      case 4:
        this.chip('ROOF. THERE IS A TRANSPORT ON THE PAD. I CAN FLY IT. MOSTLY.', 5);
        this.objective = 'HELIPAD - ROOF';
        this.waypoint = { x: m.helipad.x, y: m.helipad.y, label: 'TRANSPORT' };
        this.spawnHeliOnPad();
        break;
      default: break;
    }
  }

  spawnWave(at, kinds, n) {
    const g = this.game;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      g.spawnEnemy(kinds[i % kinds.length], at.x + Math.cos(a) * 50, at.y + Math.sin(a) * 40, 2);
    }
    audio.play('wavestart', { vol: 0.7 });
  }

  spawnHeliOnPad() {
    const m = this.marks.helipad;
    this.padHeli = { x: m.x, y: m.y, t: 0 };
    this.game.toast('GET TO THE TRANSPORT ON THE ROOF', P.sulfurHi, 6);
  }

  startHeli() {
    this.chapter = CHAPTER.HELI;
    this.blockPlayer = true;
    this.objective = 'FLY';
    const g = this.game;
    g.bullets.clear();
    g.enemies.length = 0;
    this.heli = {
      x: VIEW_W / 2, y: VIEW_H * 0.62,
      vx: 0, vy: 0, hp: 100, t: 0, phase: 'climb',
      hazards: [], scroll: 0, smoke: 0, crashT: 0,
    };
    audio.setIntensity(0.8);
    g.hud.showAnnounce('GET OUT', 'STEER WITH MOVE', P.sulfurHi, 3);
  }

  // ======================================================================
  //  update
  // ======================================================================
  /**
   * Everything in the building you can walk up to and press E on.
   *
   * The forest has its own interaction pass and it does not apply here: there
   * is nothing to chop and nobody to trade with. What there is instead is
   * paperwork nobody meant you to read, lockers nobody meant you to open, and
   * ducts nobody thought a ferret could fit into.
   */
  updateInteract(dt, game) {
    const p = game.player;
    if (this.crawl || this.blockPlayer) { game.prompt = null; return; }
    let best = null, bestD = 1e9;
    for (const o of game.world.props) {
      if (!o.interactive || o.spent) continue;
      const d = dist2(p.x, p.y, o.x, o.y - 6);
      if (d < 26 * 26 && d < bestD) { bestD = d; best = o; }
    }
    game.prompt = best
      ? { kind: 'lab', obj: best, label: best.label, x: best.x, y: best.y - 26 }
      : null;
    if (best && game.input.isPressed('interact')) this.useProp(best, game);
  }

  /** Act on whatever the prompt was pointing at. */
  useProp(o, game) {
    const p = game.player;
    switch (o.use) {
      case 'read':
      case 'jar':
        this.readLines = (o.text || '').split('\n');
        this.readT = 6 + this.readLines.length * 0.8;
        audio.play('scan', { vol: 0.5 });
        if (o.use === 'jar') { this.jarsRead++; game.hitFlash = Math.max(game.hitFlash, 0.2); }
        o.readOnce = true;
        break;
      case 'locker': {
        o.spent = true;
        o.kind = 'labCrate';
        this.lockersForced++;
        audio.play('metal', { vol: 0.8 });
        game.r.camera.addShake(2);
        particles.burst(o.x, o.y - 8, 8, { colors: [P.nestSteelHi || '#9fb4bb', '#5c6470'], speed: 70, life: 0.5, vz: 60 });
        const n = o.loot === 'ammo' ? 18 : o.loot === 'meds' ? 2 : 4;
        game.pickups.drop('resource', o.loot, o.x, o.y - 2, { count: n, vz: 110 });
        game.toast('FORCED  -  ' + n + ' ' + String(o.loot).toUpperCase(), P.uiGood, 2.4);
        break;
      }
      case 'vent':
        this.enterVent(o, game);
        break;
      default: break;
    }
  }

  /**
   * The ducts. You are forty centimetres of spine; the building is full of
   * pipes that are wider than you. Nobody at Les Nest costed that in.
   */
  enterVent(o, game) {
    const link = this.marks.vents[o.vent];
    if (!link) return;
    const to = o.end === 'a' ? link.b : link.a;
    this.crawl = { t: 0, total: 2.2, from: { x: o.x, y: o.y }, to };
    this.blockPlayer = true;
    this.ventsUsed++;
    game.player.vx = game.player.vy = 0;
    audio.play('metal', { vol: 0.5, pitch: 1.4 });
    game.toast('IN THE DUCT', P.cyberDim, 2);
  }

  updateCrawl(dt, game) {
    const c = this.crawl;
    c.t += dt;
    const f = clamp(c.t / c.total, 0, 1);
    const p = game.player;
    if (f < 0.35) {
      // squeezing in: the body goes in nose first and the tail follows
      p.x += (c.from.x - p.x) * Math.min(1, dt * 8);
      p.y += (c.from.y - p.y) * Math.min(1, dt * 8);
      if (chance(dt * 22)) particles.dust(c.from.x + rnd(-4, 4), c.from.y, 1);
    } else if (f < 0.62) {
      // gone. the camera stays on the duct mouth and you hear her in the wall
      p.x = -9999; p.y = -9999;
      if (chance(dt * 14)) {
        audio.play('step', { vol: 0.25, pitch: 1.8 });
        const t2 = (f - 0.35) / 0.27;
        const mx = lerp(c.from.x, c.to.x, t2), my = lerp(c.from.y, c.to.y, t2);
        particles.dust(mx + rnd(-3, 3), my + rnd(-3, 3), 1);
        game.r.camera.follow(mx, my);
      }
    } else {
      p.x = c.to.x; p.y = c.to.y + 8;
      if (p.rig) p.rig.reset(p.x, p.y);
      if (chance(dt * 20)) particles.dust(c.to.x + rnd(-4, 4), c.to.y, 1);
    }
    if (f >= 1) {
      this.crawl = null;
      this.blockPlayer = false;
      audio.play('metal', { vol: 0.4, pitch: 1.2 });
      game.r.camera.addShake(1.5);
    }
  }

  update(dt, game) {
    this.t += dt;
    this.chipVoiceT = Math.max(0, this.chipVoiceT - dt);
    this.readT = Math.max(0, this.readT - dt);
    if (this.crawl) { this.updateCrawl(dt, game); return; }
    this.updateInteract(dt, game);

    for (const a of this.actors) a.update(dt);
    if (this.vane) this.updateVane(dt, game);

    if (this.cut) {
      const cut = this.cut;
      cut.update(dt, game);
      // A beat can start the next chapter, which replaces or clears this.cut
      // out from under us — always finish the frame on the one we ran.
      if (game.input.isPressed('interact') && this.cut === cut) cut.skip();
      if (cut.done && this.cut === cut) this.cut = null;
    }

    switch (this.chapter) {
      case CHAPTER.COURSE: this.updateCourse(dt, game); break;
      case CHAPTER.RAMPAGE: this.updateRampage(dt, game); break;
      case CHAPTER.HELI: this.updateHeli(dt, game); break;
      default: break;
    }
  }

  updateCourse(dt, game) {
    const p = game.player;
    // Running the course is meant to be tiring. That is the point of it.
    // Measured from what you are asking the legs to do, not from how fast you
    // are actually travelling — shoving at a baffle is the tiring part.
    const ax = game.input.axes();
    const moving = Math.hypot(ax.x, ax.y) > 0.2;
    this.exhaustion = clamp(this.exhaustion + (moving ? dt * 3.6 : -dt * 5.5), 0, 100);
    this.exhaustionPeak = Math.max(this.exhaustionPeak, this.exhaustion);
    p.speedMult = 1 - (this.exhaustion / 100) * 0.55;
    if (this.exhaustion > 70 && chance(dt * 3)) {
      particles.text(p.x, p.y - 26, pick(['hh', 'hah', '...']), P.uiDim, { life: 0.7 });
    }
    if (this.exhaustion >= 99 && chance(dt * 1.2)) {
      game.toast('YOU ARE EXHAUSTED', P.uiWarn, 1.6);
    }
    // He does not shout at you. He narrates, in a level voice, over the PA.
    if (!this.cut && chance(dt * 0.11)) {
      this.chip(pick(this.lap === 1 ? [
        'VANE: GATE THREE. SHE IS FAVOURING THE LEFT FORELEG.',
        'VANE: NOTE THE PACE. SHE IS NOT TIRED. SHE IS ANGRY.',
        'VANE: MARK THAT. SHE LOOKED AT THE GALLERY.',
        'VANE: NOBODY WRITE ANYTHING DOWN THAT I DO NOT SAY.',
      ] : [
        'VANE: SECOND LAP. SIX SECONDS OFF. GOOD.',
        'VANE: SHE HAS NOT LOOKED AT THE DISH ONCE THIS LAP.',
        'VANE: THIS IS THE PART I WANTED TO SEE.',
        'VANE: KEEP THE DOORS SHUT UNTIL SHE FINISHES.',
      ]), 4.5);
    }

    // gates
    for (const g2 of this.marks.gates) {
      if (!g2.passed && p.x > g2.x + 8) { g2.passed = true; this.gatesPassed++; audio.play('ui'); }
    }

    const d = this.marks.dish;
    if (!this.courseDone && dist2(p.x, p.y, d.x, d.y) < 26 * 26) {
      this.courseDone = true;
      p.speedMult = 1;
      if (this.lap === 1) { this.denyFood(game); return; }
      audio.play('coinup');
      particles.burst(d.x, d.y - 6, 16, { colors: ['#a97c46', '#c49a63'], speed: 70, life: 0.6, vz: 60 });
      game.hud.showAnnounce('YOU EAT', '', P.uiGood, 2.2);
      this.play([
        beat.wait(1.4),
        beat.fade(1, 1.2),
        beat.do(() => { this.startPlan(); }),
        beat.fade(0, 1.2),
      ]);
    }
  }

  updateRampage(dt, game) {
    const p = game.player;
    // stage gates: clear the room, the next one opens
    if (game.enemies.length === 0) {
      if (this.rampageStage === 0 && this.guardEnemy && this.guardEnemy.dead) this.advanceRampage();
      else if (this.rampageStage >= 1 && this.rampageStage < 4 && this.t > 2) this.advanceRampage();
    }
    if (this.rampageStage >= 4 && this.padHeli) {
      this.padHeli.t += dt;
      if (dist2(p.x, p.y, this.padHeli.x, this.padHeli.y) < 34 * 34) {
        this.startHeli();
      }
    }
    // The chip keeps talking, and so does he. His lines come over the PA in
    // the same level voice he used through the glass, and he never once tells
    // anyone to stop you — he tells them to record it.
    if (chance(dt * 0.06) && this.chipVoiceT <= 0) {
      const fromVane = chance(0.45);
      this.chip(pick(fromVane ? [
        'VANE (PA): SHE IS IN THE SOUTH CORRIDOR. NOBODY CLOSE THE DOORS.',
        'VANE (PA): I WANT ALL OF THIS. EVERY CAMERA. DO NOT LOSE A SECOND OF IT.',
        'VANE (PA): SHE IS NOT RUNNING FOR AN EXIT. I TOLD YOU SHE WOULD NOT.',
        'VANE (PA): THAT IS FOUR HUNDRED DAYS OF WORK DOING EXACTLY WHAT IT WAS BUILT TO DO.',
        'VANE (PA): DO NOT DAMAGE THE HEAD.',
        'VANE (PA): SHE CAN HEAR ME. CAN YOU HEAR ME, FORTY-ONE?',
      ] : [
        'THEIR ROUNDS ARE SLOWER THAN YOUR CLAWS. USE THAT.',
        'SIX HUNDRED AND TWELVE DAYS. I COUNTED THEM WITH YOU.',
        'DO NOT STOP IN THE OPEN.',
        'THERE IS A DUCT ON THE WEST WALL. YOU ARE THE SHAPE OF A DUCT.',
        'I AM NOT A VOICE IN YOUR HEAD. I AM A PIECE OF THEIR HARDWARE THAT CHANGED SIDES.',
      ]), fromVane ? 5 : 4);
      if (fromVane) this.chipFrom = 'VANE';
      else this.chipFrom = 'IMPLANT';
    }
  }

  updateHeli(dt, game) {
    const h = this.heli;
    h.t += dt;
    h.scroll += dt * 120;

    if (h.phase === 'crash') {
      h.crashT += dt;
      h.x += h.vx * dt; h.y += h.vy * dt;
      h.vy += 220 * dt;
      h.rot = (h.rot || 0) + dt * 3.4;
      if (chance(dt * 40)) particles.smoke(h.x + game.r.camera.ox, h.y + game.r.camera.oy, 1, { life: 1.6, size: 3 });
      if (h.crashT > 2.6) this.finish(game);
      return;
    }

    // steering
    const ax = game.input.axes();
    h.vx += ax.x * 420 * dt;
    h.vy += ax.y * 340 * dt;
    h.vx *= Math.exp(-2.4 * dt);
    h.vy *= Math.exp(-2.6 * dt);
    h.x = clamp(h.x + h.vx * dt, 30, VIEW_W - 30);
    h.y = clamp(h.y + h.vy * dt, 34, VIEW_H - 34);

    // flak from the facility
    if (chance(dt * (1.4 + h.t * 0.08))) {
      h.hazards.push({
        x: rnd(20, VIEW_W - 20), y: VIEW_H + 20,
        vy: -rnd(90, 150), vx: rnd(-20, 20), r: 5, t: 0,
      });
    }
    for (let i = h.hazards.length - 1; i >= 0; i--) {
      const z = h.hazards[i];
      z.t += dt;
      z.x += z.vx * dt; z.y += z.vy * dt;
      if (z.y < -30) { h.hazards.splice(i, 1); continue; }
      if (dist2(z.x, z.y, h.x, h.y) < (z.r + 10) * (z.r + 10)) {
        h.hazards.splice(i, 1);
        h.hp -= 18;
        h.smoke = 1;
        game.r.camera.addShake(5);
        game.hitFlash = 0.5;
        audio.play('explode', { vol: 0.7 });
        particles.burst(h.x + game.r.camera.ox, h.y + game.r.camera.oy, 14, { colors: [P.fire1, P.fire2], speed: 120, life: 0.5, additive: true });
      }
    }
    h.smoke = Math.max(0, h.smoke - dt * 0.35);
    if (h.smoke > 0 && chance(dt * 20)) {
      particles.smoke(h.x + game.r.camera.ox, h.y + game.r.camera.oy, 1, { life: 1.4, size: 2 });
    }

    // scripted beats
    if (h.t > 3 && !h.said1) { h.said1 = true; this.chip('CLEAR OF THE FENCE. THEY ARE SHOOTING AT US.', 3); }
    if (h.t > 9 && !h.said2) { h.said2 = true; this.chip('THERE IS A FOREST NORTH. BASIN COUNTRY. IT IS THE ONLY GREEN LEFT ON THEIR MAPS.', 5); }
    if ((h.t > 16 || h.hp <= 0) && h.phase !== 'crash') {
      h.phase = 'crash';
      h.crashT = 0;
      h.vx = rnd(-40, 40);
      h.vy = -40;
      this.chip('ROTOR IS GONE. HOLD ON TO SOMETHING.', 3);
      audio.play('bigexplode');
      game.r.camera.addShake(12);
    }
  }

  finish(game) {
    if (this.finished) return;
    this.finished = true;
    this.chapter = CHAPTER.DONE;
    this.blockPlayer = false;
    this.heli = null;
    this.actors.length = 0;
    game.onCampaignComplete();
  }

  /** Skip straight to the forest (menu option, or a replay). */
  skipToForest(game) {
    this.finished = true;
    this.chapter = CHAPTER.DONE;
    this.blockPlayer = false;
    this.cut = null;
    this.heli = null;
    this.actors.length = 0;
    game.onCampaignComplete(true);
  }

  // ======================================================================
  //  draw
  // ======================================================================
  collect(out, cam) {
    for (const a of this.actors) if (cam.visible(a.x, a.y, 60)) out.push(a);
  }

  /**
   * Lab lighting. In the dark the only things with any light on them are the
   * things he wants you looking at, which is exactly how he runs the building.
   */
  drawLights(r, game) {
    const cam = r.camera;
    // strip lights over the walkways, so the rooms are not featureless
    if ((game.labDark || 0) < 0.9) {
      for (const o of game.world.props) {
        if (!cam.visible(o.x, o.y, 70)) continue;
        if (o.kind === 'terminal' || o.kind === 'console') r.light(o.x, o.y - 8, 34, 'rgba(120,220,225,0.5)', 0.5);
        else if (o.kind === 'incinerator') r.light(o.x, o.y - 10, 44, 'rgba(255,150,70,0.75)', 0.8);
        else if (o.kind === 'vat' || o.kind === 'jar') r.light(o.x, o.y - 6, 24, 'rgba(150,210,190,0.4)', 0.4);
      }
    }
    // and him
    const v = this.vane;
    if (v && !v.dead && cam.visible(v.x, v.y, 90)) {
      r.light(v.x, v.y - 20, 62, 'rgba(210,120,110,0.75)', 0.85);
      r.light(v.x, v.y - 34, 22, 'rgba(255,120,110,0.9)', 1);
    }
  }

  drawWorld(r, game) {
    // Ducts you can actually use, marked. A grille you have already been
    // through stays lit, so the network reads as a network.
    if (this.marks && this.marks.vents) {
      for (const o of game.world.props) {
        if (o.use !== 'vent' || !r.camera.visible(o.x, o.y, 40)) continue;
        const near = dist2(game.player.x, game.player.y, o.x, o.y) < 60 * 60;
        const pulse = 0.25 + Math.sin(game.time * 3 + o.x * 0.05) * 0.12;
        r.ring(o.x, o.y - 6, 9, P.cyberDim, 1, near ? pulse + 0.3 : pulse);
        if (near) {
          // a hint of the far end, so you know a duct goes somewhere
          const link = this.marks.vents[o.vent];
          const to = o.end === 'a' ? link.b : link.a;
          const a = Math.atan2(to.y - o.y, to.x - o.x);
          for (let i = 1; i <= 3; i++) {
            r.rect(o.x + Math.cos(a) * i * 5 - 1, o.y - 6 + Math.sin(a) * i * 5 - 1, 2, 2, P.cyberDim);
          }
        }
      }
    }

    // Where to go next. A diamond on the spot, an arrow at the screen edge
    // when it is somewhere off past the walls.
    const wp = this.waypoint;
    if (wp) {
      const cam = r.camera;
      const bob = Math.sin(game.time * 4) * 2;
      if (cam.visible(wp.x, wp.y, 40)) {
        r.ring(wp.x, wp.y, 12 + Math.sin(game.time * 3) * 2, P.sulfurHi, 1, 0.5);
        r.rect(wp.x - 2, wp.y - 24 + bob, 4, 4, P.sulfurHi);
        r.rect(wp.x - 1, wp.y - 20 + bob, 2, 3, P.sulfurHi);
      } else {
        const a = Math.atan2(wp.y - game.player.y, wp.x - game.player.x);
        const d = 34;
        const ax = game.player.x + Math.cos(a) * d, ay = game.player.y - 6 + Math.sin(a) * d;
        r.rect(ax - 2, ay - 2, 4, 4, P.sulfurHi);
        r.rect(ax + Math.cos(a) * 5 - 1, ay + Math.sin(a) * 5 - 1, 2, 2, P.sulfurHi);
      }
    }

    // the transport waiting on the pad
    if (this.padHeli && this.chapter === CHAPTER.RAMPAGE) {
      const f = heliFrames();
      const img = f[Math.floor((this.padHeli.t * 3) % f.length)];
      r.shadow(this.padHeli.x, this.padHeli.y + 6, 22, 7, 0.3);
      r.draw(img, this.padHeli.x - img.width / 2, this.padHeli.y - img.height + 6);
      const pulse = 0.5 + Math.sin(game.time * 5) * 0.4;
      r.ring(this.padHeli.x, this.padHeli.y + 4, 22, P.sulfurHi, 1, pulse);
    }
  }

  drawHud(r, ctx, game) {
    if (this.chapter === CHAPTER.HELI) return this.drawHeliScene(r, ctx, game);

    if (this.objective) {
      const y = 6;
      drawText(ctx, this.objective, VIEW_W / 2, y, P.sulfurHi, { align: 'center', shadow: '#000' });
    }
    if (this.chapter === CHAPTER.COURSE) {
      const w = 92, x = VIEW_W / 2 - w / 2, y = 18;
      r.uiRect(x - 1, y - 1, w + 2, 6, 'rgba(0,0,0,0.6)');
      r.uiRect(x, y, w, 4, '#2a2418');
      r.uiRect(x, y, w * (this.exhaustion / 100), 4, this.exhaustion > 70 ? P.uiBad : P.uiWarn);
      drawText(ctx, 'TIRED', x - 24, y - 1, P.uiDim, { shadow: true });
      drawText(ctx, 'GATES ' + this.gatesPassed + '/' + this.marks.gates.length, x + w + 4, y - 1, P.uiDim, { shadow: true });
    }
    // whatever you just read, held up long enough to actually read it
    if (this.readT > 0 && this.readLines) {
      const a = clamp(this.readT, 0, 1);
      ctx.globalAlpha = a;
      const w = Math.min(VIEW_W - 40, 300);
      const h = this.readLines.length * 9 + 12;
      const x = VIEW_W / 2 - w / 2, y = 26;
      r.uiRect(x, y, w, h, 'rgba(6,14,16,0.92)');
      r.uiStroke(x, y, w, h, P.nestTealHi);
      r.uiRect(x, y, w, 1, P.nestTealHi);
      this.readLines.forEach((l, i) => drawText(ctx, l, x + 6, y + 6 + i * 9, P.nestTealHi, { shadow: true }));
      ctx.globalAlpha = 1;
    }

    if (this.chipVoiceT > 0 && this.chipLine) {
      const a = clamp(this.chipVoiceT, 0, 1);
      ctx.globalAlpha = a;
      const w = Math.min(VIEW_W - 24, 260);
      const x = VIEW_W / 2 - w / 2, y = VIEW_H - 62;
      r.uiRect(x, y, w, 16, 'rgba(6,20,24,0.9)');
      r.uiStroke(x, y, w, 16, P.cyber);
      r.uiRect(x, y, 3, 16, this.chipFrom === 'VANE' ? P.nestEye : P.cyber);
      const who = this.chipFrom === 'VANE' ? 'PA' : 'IMPLANT';
      drawText(ctx, who, x + 6, y + 2, this.chipFrom === 'VANE' ? P.nestEye : P.cyberDim, { shadow: true });
      drawText(ctx, this.chipLine, x + 6, y + 9, this.chipFrom === 'VANE' ? P.nestEye : P.cyber, { shadow: true });
      ctx.globalAlpha = 1;
    }
    if (this.cut) this.cut.draw(r, game);
  }

  /** The flight is its own little scene drawn straight to the screen. */
  drawHeliScene(r, ctx, game) {
    const h = this.heli;
    if (!h) return;
    const H = VIEW_H, W = VIEW_W;

    // --- the ground, seen from above --------------------------------------
    // You are looking straight down at night, so there is no sky in this
    // picture: it is canopy, water and whatever is still lit down there.
    const gnd = ctx.createLinearGradient(0, 0, 0, H);
    gnd.addColorStop(0, '#0b1512');
    gnd.addColorStop(0.6, '#0f1c17');
    gnd.addColorStop(1, '#14231c');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, 0, W, H);

    // Canopy in three parallax bands. Closest is biggest and lightest, which
    // is what sells the altitude.
    const band = (speed, size, colour, count, seed) => {
      for (let i = 0; i < count; i++) {
        const gx = ((i * 71 + seed * 29) % (W + 40)) - 20;
        const gy = H - (((i * 43 + h.scroll * speed) % (H + 80)) - 40);
        if (gy < -14 || gy > H + 14) continue;
        // a crown seen from above: a blob with a lighter centre
        r.uiRect(gx, gy, size * 2, size * 2, colour);
        r.uiRect(gx + 1, gy - 1, size * 2 - 2, size * 2 + 2, colour);
        r.uiRect(gx + size - 1, gy + size - 1, 2, 2, shadeUp(colour));
      }
    };
    band(0.30, 2, '#132019', 46, 1);
    band(0.58, 3, '#18291f', 38, 5);
    band(1.00, 4, '#1f3527', 30, 9);

    // clearings and bare rock, so the canopy is not uniform
    for (let i = 0; i < 14; i++) {
      const gx = ((i * 137) % (W + 60)) - 30;
      const gy = H - (((i * 91 + h.scroll * 0.8) % (H + 120)) - 60);
      if (gy < -20 || gy > H + 20) continue;
      r.uiRect(gx, gy, 18 + (i % 4) * 9, 9 + (i % 3) * 5, i % 3 ? '#1b2a22' : '#2a2a24');
    }

    // the river, catching the only real light in the picture
    for (let y = -4; y < H + 4; y += 2) {
      const t = (y + h.scroll * 1.0) * 0.02;
      const rx = W * 0.5 + Math.sin(t) * W * 0.3 + Math.sin(t * 2.3) * W * 0.08;
      r.uiRect(Math.round(rx - 6), H - y, 12, 2, '#16303a');
      r.uiRect(Math.round(rx - 3), H - y, 6, 2, '#22485a');
      if (((y + Math.floor(h.t * 40)) % 18) === 0) r.uiRect(Math.round(rx - 1), H - y, 2, 2, '#4a7f96');
    }

    // The facility falling away behind you: floodlights and a fire, only for
    // the first few seconds of the flight.
    const glow = clamp(1 - h.t / 8, 0, 1);
    if (glow > 0.01) {
      const g2 = ctx.createLinearGradient(0, H - 70, 0, H);
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(1, `rgba(206,110,52,${0.55 * glow})`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, H - 70, W, 70);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const lx = Math.round(30 + i * ((W - 60) / 6));
        const ly = Math.round(H - 8 + Math.sin(i) * 3);
        // a soft point of light, not a box: a bright core with two faint arms
        ctx.globalAlpha = glow * 0.9;
        r.uiRect(lx, ly, 1, 1, '#ffe6bc');
        ctx.globalAlpha = glow * 0.4;
        r.uiRect(lx - 1, ly, 3, 1, '#e0a860');
        r.uiRect(lx, ly - 1, 1, 3, '#e0a860');
        ctx.globalAlpha = glow * 0.16;
        r.uiRect(lx - 3, ly, 7, 1, '#c07a3a');
        r.uiRect(lx, ly - 3, 1, 7, '#c07a3a');
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // a few lights still on in the trees: vehicles, camps, nothing friendly
    for (let i = 0; i < 5; i++) {
      const gx = ((i * 211) % (W + 40)) - 20;
      const gy = H - (((i * 157 + h.scroll * 0.9) % (H + 200)) - 100);
      if (gy < 0 || gy > H) continue;
      const on = ((i * 7 + Math.floor(h.t * 2)) % 5) !== 0;
      if (on) r.uiRect(gx, gy, 1, 1, i % 2 ? '#d8b070' : '#7fd0e0');
    }

    // --- ground fire: where the flak is coming from ------------------------
    for (const z of h.hazards) {
      // tracer trail
      const len = 10;
      for (let k = 0; k < len; k++) {
        const a = (1 - k / len) * 0.55;
        ctx.globalAlpha = a;
        r.uiRect(Math.round(z.x - z.vx * k * 0.012), Math.round(z.y - z.vy * k * 0.012), 1, 2, '#ff7a4a');
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      r.uiRect(z.x - 2, z.y - 2, 4, 4, P.nestEye);
      r.uiRect(z.x - 1, z.y - 1, 2, 2, '#ffd8c8');
      ctx.globalCompositeOperation = 'source-over';
    }

    // --- the transport -----------------------------------------------------
    const f = heliFrames();
    const img = f[Math.floor((h.t * 12) % f.length)];
    // rotor disc, so it reads as flying rather than hanging
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#b8d8e0';
    ctx.beginPath();
    ctx.ellipse(Math.round(h.x), Math.round(h.y - img.height / 2 + 2), 30, 3, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(Math.round(h.x), Math.round(h.y));
    if (h.rot) ctx.rotate(h.rot);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    // running lights
    const blink = Math.floor(h.t * 3) % 2 === 0;
    r.uiRect(Math.round(h.x - 16), Math.round(h.y + 2), 1, 1, blink ? '#ff5a4a' : '#5a2420');
    r.uiRect(Math.round(h.x + 15), Math.round(h.y + 2), 1, 1, blink ? '#6affa0' : '#245a38');

    // --- readouts ----------------------------------------------------------
    const bw = 70, bx = W / 2 - bw / 2;
    r.uiRect(bx - 1, 11, bw + 2, 6, 'rgba(0,0,0,0.7)');
    r.uiRect(bx, 12, bw, 4, '#2a0f0d');
    r.uiRect(bx, 12, bw * clamp(h.hp / 100, 0, 1), 4, h.hp < 40 ? P.uiBad : P.uiWarn);
    drawText(ctx, 'AIRFRAME', W / 2, 3, P.uiDim, { align: 'center', shadow: true });
    if (h.phase !== 'crash') {
      drawText(ctx, 'STEER AROUND THE FLAK', W / 2, H - 16, P.uiDim, { align: 'center', shadow: '#000' });
    } else {
      drawText(ctx, 'HOLD ON', W / 2, H - 16, P.uiBad, { align: 'center', scale: 2, shadow: '#000' });
    }
    if (this.chipVoiceT > 0 && this.chipLine) {
      const a = clamp(this.chipVoiceT, 0, 1);
      ctx.globalAlpha = a;
      drawText(ctx, this.chipLine, VIEW_W / 2, VIEW_H - 30, P.cyber, { align: 'center', shadow: '#000' });
      ctx.globalAlpha = 1;
    }
    if (this.cut) this.cut.draw(r, game);
  }
}
