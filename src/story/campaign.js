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
import { World, CHUNK, FOREST_W, FOREST_H } from '../world/world.js';
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
    // the bubble should come from whoever in the gallery actually said it
    if (key === 'OBSERVER') return (this.observers || []).find((o) => !o.dead) || null;
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
      beat.do((game) => { this.spawnObservers(); this.startTour(game); }),
      beat.say('DAX', "Psst. Forty-one. You awake over there?", 3),
      beat.say('DAX', "Ignore the suits. Tuesday is tour day. They bring people to look at us.", 4.2),
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
      beat.do((game) => { this.spawnVane(game); game.r.camera.follow(this.marks.cage.x + 60, this.marks.cage.y + 40); }),
      beat.wait(3.2),
      // hold on the pane with the two of you either side of it
      beat.do((game) => { game.r.camera.follow(this.marks.cage.x + 44, this.marks.cage.y - 6); }),
      beat.wait(1),

      beat.say('VANE', "Forty-one.", 2, P.nestEye),
      beat.say('VANE', "No, I am not coming in. I have never once been in one of these rooms.", 4.4, P.nestEye),
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
  /**
   * The people on the other side of the glass.
   *
   * Three of them, at consoles, for the whole first chapter. They are not a
   * threat and they never do anything — that is the point. Containment is not
   * a locked door, it is somebody drinking tea four metres away while they
   * write down how you slept.
   */
  spawnObservers() {
    const seats = this.marks.obsSeats || [];
    this.observers = [];
    const kinds = ['scientist', 'scientist', 'enforcer'];
    for (let i = 0; i < seats.length; i++) {
      const cfg = (HUMANS[kinds[i]] || HUMANS.scientist).cfg;
      const a = new Actor('critter', cfg, seats[i].x, seats[i].y, {
        name: 'Observer', key: 'obs' + i, facing: -1, anim: 'idle',
      });
      a.deskT = Math.random() * 3;
      this.observers.push(a);
      this.actors.push(a);
    }
  }

  /** Idle life for the observation room: they lean, write, and look up. */
  updateObservers(dt) {
    if (!this.observers) return;
    for (const a of this.observers) {
      a.deskT -= dt;
      if (a.deskT <= 0) {
        a.deskT = 2 + Math.random() * 5;
        a.anim = a.anim === 'idle' ? 'work' : 'idle';
      }
    }
  }

  /**
   * The tour.
   *
   * Four visitors come in, are walked past the tanks, and are walked out
   * again. The guide counts them at the door on the way out and gets three.
   * Nobody stops. Nobody comes back. The headcount is in the observation log
   * if you go and read it, and the fourth one is still in this building.
   */
  startTour(game) {
    if (this.tourDone) return;
    this.tourDone = true;
    const c = this.marks.cage;
    const y = c.y + 70;
    const x0 = c.x - 190;
    const kinds = ['scientist', 'logger', 'trapper', 'poacher'];
    this.tour = [];
    for (let i = 0; i < 4; i++) {
      const cfg = (HUMANS[kinds[i]] || HUMANS.scientist).cfg;
      const a = new Actor('critter', cfg, x0 - i * 20, y + (i % 2) * 8, {
        name: i === 0 ? 'Guide' : 'Visitor', key: 'tour' + i, facing: 1, anim: 'walk',
      });
      this.tour.push(a);
      this.actors.push(a);
    }
    this.tourPhase = 'in';
    this.tourT = 0;
    for (let i = 0; i < this.tour.length; i++) {
      this.tour[i].moveTo(c.x + 30 - i * 22, y + (i % 2) * 8, 42);
    }
  }

  updateTour(dt, game) {
    if (!this.tour || !this.tour.length) return;
    this.tourT += dt;
    const c = this.marks.cage;
    if (this.tourPhase === 'in' && this.tourT > 7) {
      this.tourPhase = 'look';
      this.tourT = 0;
      this.tourLine = 0;
      for (const a of this.tour) { a.target = null; a.anim = 'idle'; a.facing = -1; }
    }
    // The worst thing in the room is not Vane. It is four people being polite
    // about you in the middle of a working day: one of them asks the human
    // question, and the guide answers it in company language without pausing.
    if (this.tourPhase === 'look') {
      const script = [
        [0.4, 0, 'Block C. Forty-one is the one with the eye.', 3.4],
        [4.0, 2, 'Does it know we are here?', 2.8],
        [7.0, 0, 'It has no way to form that. There is nothing behind it.', 3.6],
        [10.6, 3, "It's looking right at me though.", 2.8],
        [13.6, 0, 'They track movement. Please do not tap the glass.', 3.4],
        [17.0, 1, 'And the gap in the fur, that is where you—', 2.6],
        [19.6, 0, 'Six hundred and twelve days, and every figure inside tolerance.', 3.8],
      ];
      while (this.tourLine < script.length && this.tourT > script[this.tourLine][0]) {
        const [, who, text, dur] = script[this.tourLine++];
        const a = this.tour[who];
        if (a) game.dialogue.showFloating(a, text, dur);
      }
    }
    if (this.tourPhase === 'look' && this.tourT > 23.5) {
      this.tourPhase = 'out';
      this.tourT = 0;
      // The fourth one hangs back. Nobody notices, because nobody is counting
      // until they are already at the door.
      this.stayed = this.tour[3];
      for (const a of this.tour) {
        if (a === this.stayed) continue;
        a.anim = 'walk'; a.facing = -1;
        a.moveTo(c.x - 240, a.y, 46);
      }
      this.stayed.anim = 'idle';
      this.stayed.moveTo(c.x + 74, c.y + 46, 22);
    } else if (this.tourPhase === 'out' && this.tourT > 6.5) {
      this.tourPhase = 'gone';
      game.dialogue.showFloating(this.tour[0], 'One, two, three. Right, that is everyone.', 3.2);
      // the three who left stop existing; the fourth does not
      this.actors = this.actors.filter(a => a === this.stayed || !this.tour.includes(a));
      this.tour = [this.stayed];
      this.stayed.moveTo(c.x + 110, c.y + 60, 18);
    } else if (this.tourPhase === 'gone' && this.tourT > 9) {
      // he wanders off toward the service corridor and is not seen again
      this.tourPhase = 'lost';
      this.actors = this.actors.filter(a => a !== this.stayed);
      this.tour = [];
      this.visitorLost = true;
    }
  }

  spawnVane(game) {
    const m = this.marks.cage;
    // He does not come in. That is the whole point of him: the tank is sealed
    // for this entire scene, and he says all of it through a pane you have
    // already been told you cannot break. He rolls up the service gap between
    // your tank and Dax's and stops short of the glass — close enough to read
    // the label on your ear, outside the box the whole time.
    const gapX = m.x + 66;                       // the corridor between the tanks
    this.vane = new Actor('prop', 'chair', gapX, m.y + 150, { name: 'Vane', key: 'vane', prop: 'chair' });
    this.vane.propKindTalk = 'chairTalk';
    this.vane.facing = -1;
    this.actors.push(this.vane);
    this.vane.moveTo(gapX, m.y - 12, 26);
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
    this.hazT = 0;
    this.stagger = 0;
    this.zapT = 0;
    for (const pl of (this.marks.plates || [])) pl.live = false;
    for (const sh of (this.marks.shutters || [])) { sh.open = true; this.setShutter(sh, true); }
  }

  // ------------------------------------------------------------------ course
  //
  //  Three families of obstacle, all of them on a clock, none of them able to
  //  kill you. What they take is time and legs — which is the only thing being
  //  measured, and the only thing you have.

  /** Plates run warn -> live -> dead, so there is always a tell. */
  plateState(pl) {
    const u = (this.hazT * 0.42 + pl.phase) % 1;
    return u < 0.16 ? 'warn' : u < 0.44 ? 'live' : 'dead';
  }

  /** Shutters are open, then warn, then shut. */
  shutterState(sh) {
    const u = (this.hazT * 0.26 + sh.phase) % 1;
    return u < 0.52 ? 'open' : u < 0.66 ? 'warn' : 'shut';
  }

  setShutter(sh, open) {
    const g = this.game;
    if (!g || !g.world) return;
    for (let ty = sh.y0; ty <= sh.y1; ty++) {
      g.world.setTile(sh.tx, ty, open ? T.LAB_TEAL : T.LAB_WALL);
    }
  }

  /** Where a sweep arm's bar is right now, in world pixels. */
  sweepY(sw) {
    const u = (this.hazT * sw.speed + sw.phase) % 1;
    const tri = u < 0.5 ? u * 2 : 2 - u * 2;         // 0..1..0
    return lerp(sw.y0, sw.y1, tri);
  }

  /**
   * Being caught by any of it.
   *
   * Deliberately not damage: the chapter has no healing in it and a death here
   * would mean a reload, which is not the scene. It costs exhaustion and it
   * puts you on the floor for half a second, which in a timed run is worse.
   */
  zap(game, x, y, amount, colour) {
    if (this.zapT > 0) return;
    this.zapT = 0.45;
    this.stagger = 0.55;
    this.exhaustion = clamp(this.exhaustion + amount, 0, 100);
    game.hitFlash = Math.max(game.hitFlash, 0.5);
    game.r.camera.addShake(4);
    audio.play('sparker', { vol: 0.8 });
    particles.ring(x, y - 6, 3, 22, 0.35, colour, 2, true);
    particles.text(x, y - 28, pick(['nnh', 'agh', '—']), colour, { life: 0.6 });
  }

  updateCourseHazards(dt, game) {
    const p = game.player;
    this.hazT += dt;
    this.zapT = Math.max(0, this.zapT - dt);
    this.stagger = Math.max(0, this.stagger - dt);

    // plates
    for (const pl of (this.marks.plates || [])) {
      const st = this.plateState(pl);
      pl.live = st === 'live';
      pl.warn = st === 'warn';
      if (!pl.live) continue;
      const x0 = pl.tx * TS, y0 = pl.ty * TS;
      if (p.x > x0 && p.x < x0 + pl.w * TS && p.y > y0 && p.y < y0 + pl.h * TS) {
        this.zap(game, p.x, p.y, 16, P.cyber);
      }
    }

    // shutters
    for (const sh of (this.marks.shutters || [])) {
      const st = this.shutterState(sh);
      sh.warn = st === 'warn';
      const wantOpen = st !== 'shut';
      if (wantOpen !== sh.open) {
        sh.open = wantOpen;
        this.setShutter(sh, wantOpen);
        if (!wantOpen) {
          audio.play('metal', { vol: 0.8, pitch: 0.7 });
          // if it came down on top of you, it shoves you out rather than
          // sealing you into a wall
          const sx = sh.tx * TS + TS / 2;
          if (Math.abs(p.x - sx) < TS && p.y < (sh.y1 + 1) * TS) {
            p.x = sx + (p.x < sx ? -TS * 1.3 : TS * 1.3);
            this.zap(game, p.x, p.y, 14, P.uiWarn);
          }
        }
      }
    }

    // sweep arms
    for (const sw of (this.marks.sweeps || [])) {
      const by = this.sweepY(sw);
      if (Math.abs(p.x - sw.x) < 7 && Math.abs(p.y - by) < 9) {
        const dir = p.x < sw.x ? -1 : 1;
        p.x += dir * 16;
        this.zap(game, p.x, p.y, 12, P.uiWarn);
      }
    }
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
      // He goes first, and he goes all the way out — into the middle of the
      // block, in the open, where there is nothing between him and the door
      // they are about to come through.
      beat.do(() => {
        const o = this.corridorOut();
        this.dax.moveTo(o.x, o.y, 62);
        this.dax.anim = 'walk';
        this.objective = 'GET OUT OF THE TANK';
        this.waypoint = { x: o.x, y: o.y, label: 'DAX' };
      }),
      beat.wait(1.6),
      beat.say('DAX', "Well? Out. Come on, out, out—", 2.4, P.uiGood),
      // and you have to actually walk out of it yourself
      beat.until((game) => this.outsideCell(game.player), 14),
      // once you are out, you stand there and let him say it — otherwise you
      // can wander half the block away before the alarm goes and the camera
      // ends up framing two people you cannot see.
      beat.do((game) => {
        // If you never moved, the scene still has to happen outside the tank,
        // so it walks you through the hole you just made rather than playing
        // the whole thing around a ferret standing in her own cage.
        if (!this.outsideCell(game.player)) {
          const gm2 = this.marks.cageGlass;
          game.player.x = gm2.tx * TS + TS * 1.6;
          game.player.y = gm2.ty * TS + TS / 2;
          if (game.player.rig) game.player.rig.reset(game.player.x, game.player.y);
        }
        this.blockPlayer = true;
        this.waypoint = null;
        game.r.camera.follow((this.dax.x + game.player.x) / 2, (this.dax.y + game.player.y) / 2);
      }),
      beat.clearLine(),
      beat.say('DAX', "Six hundred and twelve days and you're standing on their floor.", 3.6),
      beat.say('DAX', "Service corridor, south end. I've watched them walk it a thousand—", 3.8),
      beat.do(() => this.startShot()),
    ]);
  }

  /**
   * The spot in the middle of the block, clear of both tanks.
   *
   * Everything that happens after the glass goes happens here rather than in
   * the doorway of your own tank: you are out, he is out, and the room is
   * suddenly very large.
   */
  corridorOut() {
    const m = this.marks.cage;
    return { x: m.x + 84, y: m.y + 112 };
  }

  /** True once the body is clear of the tank's walls, not just the doorway. */
  outsideCell(a) {
    const m = this.marks.cage;
    return Math.abs(a.x - m.x) > TS * 3.4 || Math.abs(a.y - m.y) > TS * 3.4;
  }

  startShot() {
    this.chapter = CHAPTER.SHOT;
    this.objective = '';
    const g = this.game;
    // Out on the block floor, well clear of both tanks. He is shot standing in
    // the open with the whole room around him, not wedged in your doorway.
    const o = this.corridorOut();
    const gx = o.x, gy = o.y;
    this.blockPlayer = true;
    this.waypoint = null;
    // wherever the player got to, the camera holds the two of them
    g.r.camera.follow((gx + g.player.x) / 2, (gy + g.player.y) / 2);

    this.guard = new Actor('critter', HUMANS.enforcer.cfg, gx + 190, gy - 20, { name: 'Guard', key: 'guard', facing: -1 });
    this.actors.push(this.guard);

    this.play([
      beat.sfx('alarm', 1),
      beat.do(() => { g.hitFlash = 0.7; g.r.camera.addShake(3); }),
      beat.say('', 'CONTAINMENT BREACH - BLOCK C', 2, P.nestEye),
      beat.do(() => { this.guard.moveTo(gx + 62, gy - 4, 95); }),
      beat.wait(1.8),
      beat.clearLine(),
      // Dax puts himself between the door and you, which is the last thing he
      // does and the reason he is the one who gets shot.
      beat.do(() => {
        this.dax.target = null;
        this.dax.x = gx; this.dax.y = gy;
        this.dax.facing = 1;
        this.dax.anim = 'idle';
        g.r.camera.follow(gx + 18, gy - 8);
      }),
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
      // The four people who were walked past you an hour ago are still in the
      // room behind the glass, and they have just watched it happen.
      beat.do(() => {
        for (const o of (this.observers || [])) { o.anim = 'idle'; o.facing = 1; o.alarmed = true; }
        audio.play('ui', { vol: 0.25, pitch: 1.4 });
      }),
      beat.say('OBSERVER', "—is it supposed to— should it be doing that—", 2.8, P.uiWarn),
      beat.clearLine(),
      // and he is still exactly where he was, because he never left either
      beat.do(() => {
        if (this.vane && !this.vane.dead) g.r.camera.follow(this.vane.x, this.vane.y + 20);
      }),
      beat.wait(1),
      beat.say('VANE', "Nobody clean that up. I want her to walk through it.", 3.4, P.nestEye),
      beat.clearLine(),
      beat.do(() => { g.r.camera.follow(g.player.x, g.player.y); }),
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

    // Generate the actual basin now, and fly over THAT.
    //
    // The flight used to be a field of procedural blobs standing in for a
    // forest, which is a cheat you can feel: you spend a minute over scenery
    // that has nothing to do with the place you are about to land in. Building
    // the real world here means the river you cross on the way down is the
    // river you will be standing next to in ninety seconds, and the handover
    // reuses it instead of generating a second, different basin.
    if (!this.flyWorld) {
      this.flyWorld = new World(g.seed, FOREST_W, FOREST_H);
      // pick a line across it that actually crosses something worth seeing
      const w = this.flyWorld;
      this.flyPath = {
        x: w.den.x - w.pxW * 0.28, y: w.pxH * 0.86,
        tx: w.den.x, ty: w.den.y,
      };
    }
    this.flyCam = { x: this.flyPath.x, y: this.flyPath.y };
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
      case 'lanyard': {
        // The badge off the fourth visitor. It opens every red reader in the
        // building, which he could have used at any point in the last year and
        // a half had it been on the corridor side of the door.
        o.spent = true;
        o.interactive = false;
        this.hasCard = true;
        this.readLines = (o.text || '').split('\n');
        this.readT = 7;
        audio.play('coinup', { vol: 0.6 });
        game.toast('VISITOR BADGE  -  IT OPENS THE RED DOORS', P.uiGood, 4);
        game.announce('VISITOR 0417', 'HE NEVER SIGNED OUT', P.nestEye, 4);
        break;
      }
      case 'carddoor': {
        if (!this.hasCard) {
          audio.play('deny', { vol: 0.6 });
          game.toast('THE READER IS RED  -  YOU NEED A CARD', P.uiBad, 2.4);
          break;
        }
        this.openCardDoor(o, game);
        break;
      }
      default: break;
    }
  }

  /** Swipe in. The leaves retract and the tiles behind them stop being wall. */
  openCardDoor(o, game) {
    if (o.opened) return;
    o.opened = true;
    o.locked = false;
    o.interactive = false;
    o.kind = 'cardDoorOpen';
    const d = (this.marks.doors || []).find(x => x.prop === o);
    if (d) {
      d.open = true;
      const w = game.world;
      const set = (tx, ty) => { w.tiles[w.idx(tx, ty)] = T.LAB_DARK; w.invalidateChunkAt(tx, ty); };
      if (d.horiz) { set(d.tx, d.ty); set(d.tx + 1, d.ty); }
      else { set(d.tx, d.ty); set(d.tx, d.ty + 1); }
    }
    audio.play('metal', { vol: 0.8, pitch: 1.15 });
    game.r.camera.addShake(1.5);
    game.toast('READER GREEN', P.uiGood, 2);
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
    this.updateObservers(dt);
    this.updateTour(dt, game);
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
    this.updateCourseHazards(dt, game);
    p.speedMult = (1 - (this.exhaustion / 100) * 0.55) * (this.stagger > 0 ? 0.28 : 1);
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
      'VANE: SHUTTER TWO AGAIN, PLEASE. I WANT TO SEE HER READ IT.',
      'VANE: SHE IS NOT AVOIDING THE ARMS. SHE IS TIMING THEM.',
      ] : [
        'VANE: SHE TOOK THE PLATES RATHER THAN GO ROUND. WRITE THAT DOWN.',
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
      this.stagger = 0;
      for (const sh of (this.marks.shutters || [])) { sh.open = true; this.setShutter(sh, true); }
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

    if (this.chapter === CHAPTER.COURSE) this.drawCourse(r, game);

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

  /**
   * The obstacles, drawn where they are.
   *
   * Every one of them telegraphs: a plate lights its border before it goes
   * live, a shutter flashes its rails before it drops, an arm is a solid bar
   * you can see coming. Nothing in the course is a gotcha — the difficulty is
   * that you are being timed while you read them.
   */
  drawCourse(r, game) {
    const cam = r.camera;
    const t = game.time;
    for (const pl of (this.marks.plates || [])) {
      const x = pl.tx * TS, y = pl.ty * TS, w = pl.w * TS, h = pl.h * TS;
      if (!cam.visible(x + w / 2, y + h / 2, 60)) continue;
      if (pl.live) {
        r.rect(x, y, w, h, 'rgba(77,225,255,0.20)');
        // arcs crawling across the plate
        for (let i = 0; i < 3; i++) {
          const u = ((t * 2.2 + i * 0.37 + pl.phase) % 1);
          r.rect(x + 1, y + 2 + u * (h - 4), w - 2, 1, P.cyber);
        }
        r.strokeRect(x, y, w, h, P.cyber);
      } else if (pl.warn) {
        r.ctx.globalAlpha = 0.35 + Math.sin(t * 22) * 0.25;
        r.strokeRect(x, y, w, h, P.cyber);
        r.ctx.globalAlpha = 1;
      } else {
        r.strokeRect(x, y, w, h, 'rgba(120,150,155,0.28)');
      }
    }
    for (const sh of (this.marks.shutters || [])) {
      const x = sh.tx * TS, y0 = sh.y0 * TS, y1 = (sh.y1 + 1) * TS;
      if (!cam.visible(x, (y0 + y1) / 2, 120)) continue;
      // the rails it runs in, always visible, so the trap is legible from afar
      r.rect(x - 1, y0, 1, y1 - y0, 'rgba(140,170,175,0.35)');
      r.rect(x + TS, y0, 1, y1 - y0, 'rgba(140,170,175,0.35)');
      if (sh.warn) {
        const a = 0.4 + Math.sin(t * 26) * 0.3;
        r.rect(x, y0, TS, y1 - y0, `rgba(224,90,60,${(a * 0.22).toFixed(3)})`);
        r.ctx.globalAlpha = a;
        r.strokeRect(x, y0, TS, y1 - y0, P.uiWarn);
        r.ctx.globalAlpha = 1;
      }
    }
    for (const sw of (this.marks.sweeps || [])) {
      const by = this.sweepY(sw);
      if (!cam.visible(sw.x, by, 80)) continue;
      r.shadow(sw.x, by + 5, sw.len * 0.4, 4, 0.25);
      r.rect(sw.x - sw.len / 2, by - 2, sw.len, 4, '#6b7a7e');
      r.rect(sw.x - sw.len / 2, by - 2, sw.len, 1, '#9fb0b4');
      r.rect(sw.x - sw.len / 2, by + 1, sw.len, 1, '#3c4749');
      // hazard stripes, so it reads as machinery and not a girder
      for (let i = 0; i < sw.len; i += 6) {
        r.rect(sw.x - sw.len / 2 + i, by - 2, 3, 4, 'rgba(201,162,60,0.65)');
      }
      r.rect(sw.x - 2, by - 4, 4, 8, '#8a9a9e');
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

    // --- the basin, from a thousand feet --------------------------------------
    //
    // This is the real generated world, drawn at a third scale with the camera
    // tracking along the flight path. Everything down there is where it will
    // be when you land on it: the river, the burn scar, the meadows, the
    // outposts with their lights on. Flying over a stand-in and then landing
    // somewhere else is the sort of seam you cannot unsee once you notice it.
    const wld = this.flyWorld;
    const ZOOM = 0.34;
    if (wld) {
      // travel: the flight runs from the south-west corner toward the den
      const p = this.flyPath;
      const prog = clamp(h.scroll / 2600, 0, 1);
      this.flyCam.x = lerp(p.x, p.tx, prog);
      this.flyCam.y = lerp(p.y, p.ty, prog);

      // `ox`/`oy` are derived from the camera's centre, so the centre is what
      // gets moved — and moved back before anything else reads it.
      const cam = r.camera;
      const keepX = cam.x, keepY = cam.y, kSX = cam.shakeX, kSY = cam.shakeY;
      ctx.save();
      ctx.scale(ZOOM, ZOOM);
      cam.shakeX = 0; cam.shakeY = 0;
      cam.x = this.flyCam.x + VIEW_W / 2 - (W / ZOOM) / 2;
      cam.y = this.flyCam.y + VIEW_H / 2 - (H / ZOOM) / 2;
      try {
        // Chunks covering the scaled viewport. drawGround() sizes itself off
        // VIEW_W/VIEW_H, which is a third of what is on screen once the
        // context is scaled down, so the range is walked here instead.
        const cw = CHUNK * TS;
        const x0 = Math.floor(cam.ox / cw), x1 = Math.floor((cam.ox + W / ZOOM) / cw);
        const y0 = Math.floor(cam.oy / cw), y1 = Math.floor((cam.oy + H / ZOOM) / cw);
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            if (cx < 0 || cy < 0 || cx * CHUNK >= wld.w || cy * CHUNK >= wld.h) continue;
            ctx.drawImage(wld.getChunk(cx, cy), cx * cw - cam.ox, cy * cw - cam.oy);
          }
        }
        // and the trees, so the canopy under you is the canopy you land in
        const list = [];
        for (const o of wld.props) {
          if (o.x < cam.ox - 40 || o.x > cam.ox + W / ZOOM + 40) continue;
          if (o.y < cam.oy - 40 || o.y > cam.oy + H / ZOOM + 40) continue;
          list.push(o);
        }
        for (const n of wld.nodes) {
          if (!n.alive || !n.def.tall) continue;
          if (n.x < cam.ox - 40 || n.x > cam.ox + W / ZOOM + 40) continue;
          if (n.y < cam.oy - 40 || n.y > cam.oy + H / ZOOM + 40) continue;
          list.push(n);
        }
        list.sort((a, b) => (a.y || 0) - (b.y || 0));
        for (const o of list) game.drawWorldObject(r, o);
      } catch (e) { /* the flight must never be the thing that crashes */ }
      cam.x = keepX; cam.y = keepY; cam.shakeX = kSX; cam.shakeY = kSY;
      ctx.restore();

      // Dusk over the top of it. Enough to say "night, and a long way down",
      // not so much that the thing you spent a whole chapter flying over turns
      // into a brown smear — the point of the sequence is that you can see it.
      const night = ctx.createLinearGradient(0, 0, 0, H);
      night.addColorStop(0, 'rgba(10,16,26,0.58)');
      night.addColorStop(1, 'rgba(12,20,26,0.40)');
      ctx.fillStyle = night;
      ctx.fillRect(0, 0, W, H);
      // a cold rim of moonlight from the north-west, so the ridges have a side
      ctx.globalCompositeOperation = 'lighter';
      const moon = ctx.createLinearGradient(0, 0, W * 0.7, H);
      moon.addColorStop(0, 'rgba(90,120,150,0.16)');
      moon.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
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

    // Les Nest ground lights, at the outposts that are actually down there
    if (wld) {
      ctx.globalCompositeOperation = 'lighter';
      for (const l of (wld.landmarks || [])) {
        const sx = (l.x - this.flyCam.x) * ZOOM + W / 2;
        const sy = (l.y - this.flyCam.y) * ZOOM + H / 2;
        if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue;
        const on = ((l.id * 7 + Math.floor(h.t * 2)) % 5) !== 0;
        if (!on) continue;
        ctx.globalAlpha = 0.9;
        r.uiRect(Math.round(sx), Math.round(sy), 1, 1, '#ffd8a0');
        ctx.globalAlpha = 0.28;
        r.uiRect(Math.round(sx) - 1, Math.round(sy), 3, 1, '#c08a40');
        r.uiRect(Math.round(sx), Math.round(sy) - 1, 1, 3, '#c08a40');
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
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
