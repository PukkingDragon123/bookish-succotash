// The game itself: owns the world, every entity list, the wave director and
// the UI, and provides the shared services (spawn a bullet, explode, toast,
// drop loot) that the entity classes call back into.

import { updateWind, gustBurst } from './world/wind.js';
import { Occupation } from './systems/outposts.js';
import { beginBeastFrame } from './art/beastrig.js';
import { Alliances, FACTIONS, FACTION_KEYS, factionOf } from './systems/factions.js';
import { DISCOVER_R } from './world/landmarks.js';
import { outpostFrames, outpostWreck, outpostSize } from './art/outpost.js';
import { Renderer, VIEW_W, VIEW_H } from './engine/canvas.js';
import { Input } from './engine/input.js';
import { toggleFullscreen } from './engine/touch.js';
import { Loop } from './engine/loop.js';
import { audio } from './engine/audio.js';
import { particles } from './engine/particles.js';
import { drawText } from './engine/font.js';
import { clamp, lerp, dist2, TAU } from './engine/math.js';
import { rnd, pick, chance } from './engine/rng.js';

import { P } from './art/palette.js';
import { itemIcon, warnMarkerFrames } from './art/items.js';
import { nestLogoSprite } from './art/machines.js';

import { World, worldObjectSprite, FOREST_W, FOREST_H } from './world/world.js';
import { Arrival } from './story/arrival.js';
import { FireSim } from './world/fire.js';
import { TS, TILES, T, isWater, isSolid, drawWaterShimmer } from './world/tiles.js';

import { Player } from './entities/player.js';
import { Bullets } from './entities/bullets.js';
import { Enemy, Wreck } from './entities/enemies.js';
import { NPC, spawnNPCs } from './entities/npc.js';
import { Wildlife } from './entities/wildlife.js';
import { PickupManager } from './entities/pickups.js';
import { Mortar, Firebomb, SawTrap, SmokeCloud, Barricade, AllyTurret, SteamBurst } from './entities/hazards.js';

import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { Dialogue } from './ui/dialogue.js';

import { RESOURCES, WEAPONS, CHIPS, randomChipKey } from './systems/defs.js';
import { Director, PHASE } from './systems/waves.js';
import { Squad } from './systems/squad.js';
import { TOOLS, TOOL_KEYS } from './systems/tools.js';
import { TRUST_BOND } from './entities/wildlife.js';
import { Campaign, CHAPTER } from './story/campaign.js';
import { LAB_W, LAB_H } from './world/lab.js';
import { FirstStand } from './story/firststand.js';
import { Camp, STRUCTURES } from './systems/camp.js';

export const STATE = { TITLE: 'title', PLAY: 'play', PAUSED: 'paused', DEAD: 'dead', VICTORY: 'victory' };

// The basin. Big enough that you can get properly lost in it and the far side
// is a journey rather than a stroll.

export class Game {
  constructor(canvas, seed) {
    this.seed = seed >>> 0;
    this.r = new Renderer(canvas);
    this.input = new Input(canvas);
    // A rotated iPad changes the internal resolution, so anything that caches
    // a screen-space layout has to be told.
    this.r.onResize = () => {
      this.input.touch.onViewportChange();
      if (this.panels) this.panels.mapDirty = true;
    };
    this.state = STATE.TITLE;
    this.mode = 'forest';            // 'lab' while the campaign is running
    this.campaign = null;
    this.firstStand = null;
    this.arrival = null;
    this.blockPlayer = false;
    this.charges = [];
    this.standDelay = 0;
    this.camp = null;
    this.labDark = 0;                // block-wide blackout, 0..1
    this.storyDone = false;
    this.time = 0;
    this.dayTime = 0.28;             // 0..1 through the day; starts mid-morning
    this.nightFactor = 0;
    this.hitFlash = 0;
    this.slowT = 0;
    this.slowScale = 1;
    this.prompt = null;
    this.boss = null;
    this.intelLevel = 0;
    this.surveyLevel = 0;
    this.revives = 0;
    this.smokeBombCharges = 0;
    this.geyserControl = false;
    this.craftCounts = {};
    this.toolBag = {};              // animal kit built but not yet fitted
    this.rescued = 0;
    this.rescueTarget = 0;
    this.stats = { treesLost: 0, treesSaved: 0, animalsLost: 0, kills: 0, questsDone: 0 };
    this.flyers = [];
    this.slashes = [];
    this.titleT = 0;
    this.pound = { phase: 'pace', t: 0, cracks: 0, flash: 0 };
    this.menu = {
      sel: 0,
      rects: [],
      items: [
        { id: 'story', label: 'BEGIN', sub: 'DAY 612. BLOCK C. THE STORY.' },
        { id: 'skip', label: 'STRAIGHT TO THE BASIN', sub: 'SKIP THE FACILITY. START THE SIEGE.' },
      ],
    };
    this.deathT = 0;
    this.victoryT = 0;

    this.build();

    this.loop = new Loop((dt) => this.update(dt), () => this.render());
  }

  /**
   * Boot straight into the facility. The title screen is your own tank seen
   * from the outside, so the game opens on the thing the story is about.
   * The basin itself is not generated until the campaign hands over.
   */
  build() {
    this.world = new World(this.seed, LAB_W, LAB_H, { blank: true });
    this.fire = new FireSim(this.world);
    this.player = new Player(0, 0);
    this.bullets = new Bullets();
    this.pickups = new PickupManager();
    this.enemies = [];
    this.wrecks = [];
    this.hazards = [];
    this.npcs = [];
    this.wildlife = new Wildlife(this.world, this.seed);
    this.director = new Director(this.seed);
    this.squad = new Squad();
    this.hud = new Hud();
    this.panels = new Panels();
    this.dialogue = new Dialogue();
    this.drawList = [];

    this.mode = 'lab';
    this.campaign = new Campaign(this);
    this.campaign.prepareTitle();
  }

  /**
   * Generate the basin and move in. Called when the campaign ends (or when it
   * is skipped) — never before, because a 340x280 basin is not free.
   */
  buildForest(prebuilt = null) {
    this.mode = 'forest';
    this.campaign = null;
    this.storyDone = true;

    // The helicopter chapter flies over the real basin, so by the time you
    // come down through the canopy the world already exists — reuse it rather
    // than generating a second one and landing somewhere you never flew over.
    this.world = prebuilt || new World(this.seed, FOREST_W, FOREST_H);
    this.fire = new FireSim(this.world);
    this.npcs = spawnNPCs(this.world, this.seed);
    this.wildlife = new Wildlife(this.world, this.seed);
    this.director = new Director(this.seed);
    // The basin is occupied. Every outpost still standing is what sends
    // patrols at the camp, so the tempo of the game is a thing you can go and
    // change rather than a timer you wait out.
    this.occupation = new Occupation(this.seed);
    this.occupation.seed(this.world);
    this.alliances = new Alliances();
    this.found = 0;
    this.enemies.length = 0;
    this.wrecks.length = 0;
    this.hazards.length = 0;
    this.pickups.clear();
    this.bullets.clear();
    this.squad = new Squad();
    this.panels.mapDirty = true;

    this.camp = new Camp(this.world.campSite || { x: this.world.den.x, y: this.world.den.y });
    this.player.respawn(this.world.den.x, this.world.den.y + 26);
    this.player.weapons = ['popper'];
    this.player.weaponIndex = 0;
    this.player.speedMult = 1;

    this.r.camera.bounds = { minX: 0, minY: 0, maxX: this.world.pxW, maxY: this.world.pxH };
    this.r.camera.x = this.r.camera.tx = this.player.x;
    this.r.camera.y = this.r.camera.ty = this.player.y;

    // A starting kit so wave 1 is survivable while you learn the controls.
    this.player.inv.add('ammo', 30);
    this.player.inv.add('berries', 3);
  }

  /** Begin the story. The lab is already loaded from build(). */
  startStory() {
    this.mode = 'lab';
    if (!this.campaign) this.campaign = new Campaign(this);
    this.campaign.begin();
    this.state = STATE.PLAY;
  }

  /**
   * The transport goes down in the basin. Everything the campaign built is
   * thrown away and the survival game starts for real.
   */
  onCampaignComplete(skipped = false) {
    const flown = this.campaign && this.campaign.flyWorld;
    this.buildForest(flown);
    this.state = STATE.PLAY;
    if (skipped) {
      this.hud.showAnnounce('TAKE THE BASIN BACK', 'FIND THEIR OUTPOSTS. BURN THEM DOWN.', P.ui, 4.5);
    } else {
      // You arrive the way the helicopter left you.
      this.player.hp = Math.max(12, Math.round(this.player.maxHp * 0.35));
      this.hitFlash = 1;
      this.r.camera.addShake(14);
      audio.play('bigexplode');
      particles.burst(this.player.x, this.player.y, 40, {
        colors: [P.fire1, P.fire2, '#3a3a3a'], speed: 200, life: 1.2, vz: 160, gravity: 320, bounce: 0.3,
      });
      particles.smoke(this.player.x, this.player.y - 6, 24, { life: 2.4, size: 4 });
      this.hud.showAnnounce('THE BASIN', 'YOU ARE OUT. NOW STAY OUT.', P.uiGood, 4.5);
      this.toast('WASD MOVE  -  MOUSE AIM/FIRE  -  E GATHER  -  TAB CRAFT', P.uiDim, 10);
    }
    audio.setIntensity(0.2);

    // The first fight is scripted, and you lose it. Give the player long enough
    // to find their feet and see the basin first.
    this.firstStand = new FirstStand();
    this.standDelay = skipped ? 26 : 16;

    // Coming down in a helicopter is not an establishing shot, it is an
    // injury. Unless the whole story was skipped, the arrival takes over: you
    // black out, come round beside the burning wreck, and the implant walks
    // you through your first tools before anything is allowed to attack you.
    this.arrival = new Arrival();
    this.arrival.begin(this, skipped);
    this.standDelay = 999;        // nothing happens until Pip is finished
  }

  start() {
    this.loop.start();
  }

  get uiBlocksInput() {
    return this.panels.open || this.state !== STATE.PLAY;
  }

  // ======================================================================
  //  UPDATE
  // ======================================================================
  update(dt) {
    if (this.state === STATE.TITLE) return this.updateTitle(dt);
    if (this.state === STATE.VICTORY) return this.updateEnding(dt, true);
    if (this.state === STATE.DEAD) return this.updateEnding(dt, false);

    if (this.input.isPressed('pause') && !this.panels.open) {
      this.state = this.state === STATE.PAUSED ? STATE.PLAY : STATE.PAUSED;
      audio.play('ui');
      this.input.endFrame();
      return;
    }
    if (this.state === STATE.PAUSED) {
      if (this.input.keyPressed('KeyM')) audio.setMuted(audio.enabled);
      this.input.endFrame();
      return;
    }

    // slow-motion on big hits
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.slowScale = 1;
    }
    const sdt = dt * this.slowScale;
    this.dt = sdt;   // the live rigs need the step they are being advanced by

    this.time += sdt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.4);

    // day/night: a full cycle is long enough that most runs see one dusk
    this.dayTime = (this.dayTime + sdt / 420) % 1;
    const nightRaw = clamp((Math.cos(this.dayTime * TAU) + 0.25) * 1.1, -1, 1);
    this.nightFactor = clamp(-nightRaw, 0, 1);

    // panels & dialogue first: they can swallow input
    this.handlePanelKeys();
    this.panels.update(sdt, this);
    this.dialogue.update(sdt);
    this.hud.update(dt);

    const lab = this.mode === 'lab';

    const stand = this.firstStand;
    const standing = !!(stand && stand.active);
    const arriving = !!(this.arrival && this.arrival.blocksStand);

    this.world.update(sdt);
    if (!lab) {
      this.fire.update(sdt, this);
      if (this.arrival) {
        this.arrival.update(sdt, this);
        // once the arrival lets go, the scripted first fight gets its timer
        if (this.arrival.finished && this.standDelay > 900) this.standDelay = 30;
      }
      // The director waits its turn: no waves until the first fight is done,
      // and no first fight until she is on her feet with a friend.
      if (arriving) {
        /* the basin holds its breath */
      } else if (stand && !stand.finished) {
        if (!standing) {
          this.standDelay -= sdt;
          if (this.standDelay <= 0) stand.begin(this);
        } else {
          stand.update(sdt, this);
        }
      } else {
        this.director.update(sdt, this);
      }
    } else {
      this.campaign.update(sdt, this);
      // The last chapter tears the lab down and builds the basin. Everything
      // below this point is holding stale references, so stop the frame here.
      if (this.mode !== 'lab') { this.input.endFrame(); return; }
    }

    // During a cutscene the script owns the ferret.
    // Nothing may kill her while a script is holding her still — that is not
    // difficulty, it is a soft-lock with a health bar.
    if (this.blockPlayer) this.player.invuln = Math.max(this.player.invuln, 0.2);
    const scripted = (lab && this.campaign.blockPlayer) || this.blockPlayer ||
      (standing && stand.cut && stand.cut.prompt == null && stand.phase !== 'fight');
    this.player.update(sdt, this, scripted);
    if (!lab) {
      this.updateInteraction();
      this.handleAbilityKeys();
    }
    // in the lab the campaign owns the prompt: it set one during its own
    // update, and clobbering it here would wipe every terminal and duct

    this.bullets.update(sdt, this);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(sdt, this);
      if (e.dead) this.enemies.splice(i, 1);
    }
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.update(sdt, this);
      if (w.dead) this.wrecks.splice(i, 1);
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.update(sdt, this);
      if (h.dead) this.hazards.splice(i, 1);
    }
    if (!lab) {
      if (this.camp) { this.camp.update(sdt, this); this.updateCampWarmth(sdt); }
      // Somebody notices when you are about to fall over.
      if (this.player.hp < this.player.maxHp * 0.28 && chance(sdt * 0.16)) {
        this.npcsReact('lowHp', 0.4, 200);
      }
      for (const n of this.npcs) n.update(sdt, this);
      this.wildlife.update(sdt, this);
      this.squad.update(sdt, this);
      if (this.occupation) {
        this.occupation.update(sdt, this);
        this.updateOutposts(sdt);
        this.updateCharges(sdt);
      }
      this.updateDiscovery(sdt);
    }
    this.pickups.update(sdt, this);
    this.updateFlyers(sdt);
    this.updateSlashes(sdt);
    this.updateGeysers(sdt);
    particles.update(sdt);

    // camera leads slightly toward the cursor: you see what you aim at
    if ((!lab || !this.campaign.ownsCamera) && !(standing && stand.phase !== 'fight')) {
      const mw = this.r.camera.toWorld(this.input.mouse.sx, this.input.mouse.sy);
      const lx = clamp((mw.x - this.player.x) * 0.22, -54, 54);
      const ly = clamp((mw.y - this.player.y) * 0.22, -40, 40);
      this.r.camera.follow(this.player.x + lx, this.player.y - 6 + ly);
    }
    this.r.camera.update(dt);

    this.input.touch.uiMode = this.panels.open || this.state !== STATE.PLAY;
    this.input.touch.setToggle('overclock', this.player.overclock);
    this.updateTouchButtons(lab);
    this.updateAudioMood(dt);
    this.input.endFrame();
  }

  /**
   * The menu. You are still in the tank, and you are still hitting the glass.
   * Every four seconds the ferret throws itself at the pane; the glass cracks
   * a little more and never quite gives, which is the whole game in one loop.
   */
  /** Hide the thumb buttons that would do nothing where you are standing. */
  updateTouchButtons(lab) {
    const hide = [];
    if (!this.smokeBombCharges && !this.geyserControl) hide.push('smoke');
    if (lab) {
      // Nothing to craft, nobody to command, and no gun until you take one.
      hide.push('scan', 'douse', 'use', 'craft', 'chips', 'map', 'command', 'rally');
      if (!this.campaign.hasGun) hide.push('weapon');
    } else if (this.squad.size === 0) {
      hide.push('command', 'rally');
    }
    this.input.touch.setHidden(hide);
  }

  updateTitle(dt) {
    this.titleT += dt;
    this.time += dt;
    updateWind(dt);
    particles.update(dt);
    this.world.update(dt * 0.5);
    this.r.camera.update(dt);
    this.input.touch.uiMode = true;
    this.updateCagePound(dt);
    for (const a of this.campaign.actors) a.update(dt);

    const i = this.input;
    const n = this.menu.items.length;
    if (i.isPressed('up') || i.wheel < 0) { this.menu.sel = (this.menu.sel + n - 1) % n; audio.play('ui'); }
    if (i.isPressed('down') || i.wheel > 0) { this.menu.sel = (this.menu.sel + 1) % n; audio.play('ui'); }
    i.wheel = 0;

    // Pointer/touch: hover highlights, tap selects.
    const hit = (x, y) => {
      for (let k = 0; k < n; k++) {
        const b = this.menu.rects[k];
        if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
      }
      return -1;
    };
    const hov = hit(i.mouse.sx, i.mouse.sy);
    if (hov >= 0 && hov !== this.menu.sel && !i.usingTouch) { this.menu.sel = hov; audio.play('ui'); }

    let chosen = -1;
    const tap = i.takeTap();
    if (tap) { const k = hit(tap.x, tap.y); if (k >= 0) chosen = k; }
    if (i.isPressed('interact') || i.isPressed('dash') || i.keyPressed('Enter') || i.keyPressed('NumpadEnter')) {
      chosen = this.menu.sel;
    }

    if (chosen >= 0) {
      audio.resume();
      audio.play('uiselect');
      this.menu.sel = chosen;
      if (this.menu.items[chosen].id === 'story') {
        audio.play('levelup');
        this.startStory();
      } else {
        this.onCampaignComplete(true);
        this.toast(this.input.touch.visible
          ? 'LEFT THUMB MOVES  -  RIGHT THUMB AIMS AND FIRES  -  E GATHERS'
          : 'WASD MOVE  -  MOUSE AIM/FIRE  -  E INTERACT/GATHER  -  TAB CRAFT', P.uiDim, 9);
      }
    }
    this.input.endFrame();
  }

  /** Paces, winds up, hits the pane, recoils, paces again. */
  updateCagePound(dt) {
    const c = this.campaign.marks.cage;
    const paneX = (c.tx + 3) * TS;
    const p = this.player;
    const s = this.pound;
    s.t += dt;

    if (s.phase === 'pace') {
      const sway = Math.sin(s.t * 1.5);
      p.x = c.x - 6 + sway * 12;
      p.y = c.y + 8 + Math.cos(s.t * 2.1) * 4;
      p.anim = Math.abs(sway) > 0.2 ? 'walk' : 'idle';
      p.facing = Math.cos(s.t * 1.5) > 0 ? 1 : -1;
      p.view = 'front';
      if (s.t > 2.6) { s.phase = 'wind'; s.t = 0; p.facing = 1; }
    } else if (s.phase === 'wind') {
      p.x += (c.x - 12 - p.x) * Math.min(1, dt * 7);
      p.anim = 'idle';
      p.facing = 1;
      if (s.t > 0.45) { s.phase = 'lunge'; s.t = 0; audio.play('dash', { vol: 0.35 }); }
    } else if (s.phase === 'lunge') {
      p.x += (paneX - 10 - p.x) * Math.min(1, dt * 22);
      p.anim = 'run';
      if (s.t > 0.16) {
        s.phase = 'hit'; s.t = 0;
        s.cracks = Math.min(6, s.cracks + 1);
        s.flash = 1;
        audio.play('metal', { vol: 0.55 });
        this.r.camera.addShake(3.2);
        particles.burst(paneX - 2, c.y + 2, 7, {
          colors: ['#dff2f5', '#a9dbe0', '#7fb4bb'], speed: 80, life: 0.45, vz: 60, gravity: 300, additive: true,
        });
      }
    } else if (s.phase === 'hit') {
      p.x += (c.x - 2 - p.x) * Math.min(1, dt * 9);
      p.anim = 'idle';
      if (s.t > 1.1) { s.phase = 'pace'; s.t = 0; }
    }
    s.flash = Math.max(0, s.flash - dt * 4);
    p.animT = (p.animT + dt * (p.anim === 'run' ? 1.9 : p.anim === 'walk' ? 1.1 : 0.5)) % 1;
    // Keep the tank framed on the left third, whatever the device resolution
    // is, so the title plate on the right never lands on top of it.
    this.r.camera.follow(c.x + VIEW_W * 0.22, c.y + VIEW_H * 0.04);
  }

  updateEnding(dt, won) {
    this.time += dt;
    if (won) this.victoryT += dt; else this.deathT += dt;
    particles.update(dt);
    this.r.camera.update(dt);
    this.input.touch.uiMode = true;
    if ((won ? this.victoryT : this.deathT) > 2.5 && (this.input.anyKeyPressed || this.input.takeTap())) {
      if (won) {
        this.director.goEndless();
        this.state = STATE.PLAY;
        this.hud.showAnnounce('THEY WILL COME BACK', 'HOLD THE BASIN', P.uiWarn, 4);
      } else {
        this.respawnPlayer();
      }
    }
    this.input.endFrame();
  }

  updateAudioMood(dt) {
    if (this.mode === 'lab' || (this.firstStand && this.firstStand.active)) { audio.update(dt); return; }
    const d = this.director;
    let target = 0.1;
    if (d.phase === PHASE.ASSAULT) target = this.boss ? 1 : 0.62;
    else if (d.phase === PHASE.FIRE) target = 0.9;
    else if (d.phase === PHASE.PREP) target = d.timer < 8 ? 0.4 : 0.14;
    if (this.player.hp < this.player.maxHp * 0.3 && d.phase !== PHASE.PREP) target = Math.min(1, target + 0.2);
    audio.setIntensity(target);
    audio.update(dt);
  }

  handlePanelKeys() {
    const i = this.input;
    if (i.keyPressed('Tab') || i.touch.isPressed('craft')) this.panels.toggle('craft');
    if (i.keyPressed('KeyI') || i.touch.isPressed('bag')) this.panels.toggle('bag');
    if (i.keyPressed('KeyC') || i.touch.isPressed('chips')) this.panels.toggle('chips');
    if (i.keyPressed('KeyM') || i.touch.isPressed('map')) this.panels.toggle('map');
    if (i.isPressed('fullscreen')) toggleFullscreen(document.documentElement);
  }

  /**
   * Thumb aiming needs help a mouse does not. If the player is pointing within
   * a narrow cone of something shootable, quietly snap onto it.
   */
  aimAssist(x, y, angle) {
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || e.charmT > 0) continue;
      const dx = e.x - x, dy = e.y - 6 - y;
      const d = Math.hypot(dx, dy);
      if (d > 300) continue;
      let diff = Math.atan2(dy, dx) - angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const cone = 0.30 + Math.min(0.16, 26 / Math.max(30, d));
      if (Math.abs(diff) > cone) continue;
      const score = Math.abs(diff) * 220 + d * 0.35;
      if (score < bestScore) { bestScore = score; best = Math.atan2(dy, dx); }
    }
    return best;
  }

  handleAbilityKeys() {
    if (this.uiBlocksInput) return;
    const i = this.input;
    const p = this.player;

    // Touch has no number row, so one button cycles the arsenal.
    if (i.isPressed('weapon') && p.weapons.length > 1) {
      p.weaponIndex = (p.weaponIndex + 1) % p.weapons.length;
      audio.play('ui');
      this.toast(p.weapon.name, P.ui, 1.4);
    }

    // throw water where you're aiming
    if (i.isPressed('douse')) {
      if (p.inv.take('water', 1)) {
        const mw = this.r.camera.toWorld(i.mouse.sx, i.mouse.sy);
        const d = Math.min(120, Math.hypot(mw.x - p.x, mw.y - p.y));
        const a = Math.atan2(mw.y - p.y, mw.x - p.x);
        const tx = p.x + Math.cos(a) * d, ty = p.y + Math.sin(a) * d;
        const n = this.fire.extinguish(tx, ty, 46, 1.4);
        particles.water(tx, ty, 26);
        particles.ring(tx, ty, 4, 46, 0.35, P.waterFoam, 2, false);
        audio.play('splash');
        if (n) this.toast(n + ' FIRES OUT', P.waterFoam, 1.6);
      } else {
        this.toast('NO WATER - FILL AT THE RIVER [E]', P.uiWarn);
        audio.play('deny');
      }
    }

    // eat / patch up
    if (i.isPressed('use')) {
      if (p.hp >= p.maxHp) { this.toast('ALREADY PATCHED UP', P.uiDim, 1.2); }
      else if (p.inv.take('meds', 1)) { p.heal(45); audio.play('rescue', { vol: 0.6 }); }
      else if (p.inv.take('berries', 1)) { p.heal(12); audio.play('pick'); }
      else { this.toast('NOTHING TO EAT', P.uiWarn); audio.play('deny'); }
    }

    // smoke bomb
    if (i.isPressed('smoke')) {
      if (this.smokeBombCharges > 0) {
        this.smokeBombCharges--;
        const mw = this.r.camera.toWorld(i.mouse.sx, i.mouse.sy);
        this.smokeBomb(mw.x, mw.y, 56);
        this.toast('SMOKE (' + this.smokeBombCharges + ' LEFT)', P.uiDim, 1.4);
      } else if (this.geyserControl) {
        this.wakeNearestGeyser();
      } else {
        audio.play('deny');
      }
    }
  }

  // ======================================================================
  //  INTERACTION
  // ======================================================================
  /** True when something more specific than "gather" wants the E key. */
  interactPriority() { return !!this.prompt && this.prompt.kind !== 'gather'; }

  updateInteraction() {
    const p = this.player;
    this.prompt = null;
    if (p.dead) return;
    let best = null, bestD = Infinity;

    const consider = (obj, kind, label, x, y, range) => {
      const d = dist2(p.x, p.y, x, y);
      if (d < range * range && d < bestD) { bestD = d; best = { obj, kind, label, x, y: y - 26 }; }
    };

    // carrying an animal? the only thing that matters is getting it home
    if (p.carrying) {
      const den = this.world.den;
      const d = dist2(p.x, p.y, den.x, den.y);
      if (d < 46 * 46) consider(null, 'dropoff', 'RELEASE AT THE DEN', den.x, den.y, 46);
      else this.prompt = { kind: 'carry', label: 'CARRY IT TO THE DEN', x: p.x, y: p.y - 34 };
      if (best) this.prompt = best;
      if (this.input.isPressed('interact') && best && best.kind === 'dropoff' && !this.uiBlocksInput) this.releaseAnimal();
      return;
    }

    // Animals first: they are the thing you are most often standing next to.
    const beast = this.wildlife.nearestFriendly(p.x, p.y, 34);
    if (beast) {
      if (beast.downT > 0) {
        consider(beast, 'revive', 'REVIVE ' + beast.name.toUpperCase(), beast.x, beast.y, 34);
      } else {
        const tool = beast.bonded ? this.nextToolFor(beast) : null;
        const food = beast.def.likes.find(k => p.inv.get(k) > 0);
        if (tool) consider(beast, 'equip', 'FIT ' + TOOLS[tool].name.toUpperCase(), beast.x, beast.y, 34);
        else if (food && beast.trust < 100) {
          consider(beast, 'feed', 'FEED ' + beast.name.toUpperCase() + ' (' + food.toUpperCase() + ')', beast.x, beast.y, 34);
        }
      }
    }

    for (const n of this.npcs) {
      const lbl = n.currentPrompt(this);
      if (lbl) consider(n, 'npc', lbl, n.x, n.y, 30);
    }
    for (const w of this.wrecks) {
      if (!w.looted) consider(w, 'wreck', w.chipKey ? 'RIP OUT CHIP' : 'STRIP FOR SCRAP', w.x, w.y, 26);
    }
    const trapped = this.wildlife.nearestRescuable(p.x, p.y, 30);
    if (trapped) consider(trapped, 'rescue', 'PICK UP ' + trapped.def.name.toUpperCase(), trapped.x, trapped.y, 30);

    // water source
    if (!p.inv.isFull('water')) {
      for (const [dx, dy] of [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14]]) {
        const t = this.world.tileAtPx(p.x + dx, p.y + dy);
        if (isWater(t) && !TILES[t].hot) { consider(null, 'water', 'FILL WATER', p.x + dx, p.y + dy, 22); break; }
      }
    }

    for (const pr of this.world.props) {
      if (pr.type !== 'station') continue;
      consider(pr, 'station', 'USE ' + pr.station.toUpperCase(), pr.x, pr.y, 30);
    }

    // Their hardware. Standing under a relay mast with a satchel charge is
    // the moment the whole loop is built around, so it gets its own prompt
    // ahead of anything you might happen to be standing on.
    const post = this.outpostAt(p.x, p.y + 8);
    if (post) {
      if (post.def.frees && !post.pensOpen && this.toolCount('cutters') > 0) {
        consider(post, 'pens', 'CUT THE PENS OPEN', post.x, post.y, 40);
      } else if (p.inv.get('chargeBig') > 0) {
        consider(post, 'breach', 'SET BREACHING CHARGE', post.x, post.y, 40);
      } else if (p.inv.get('charge') > 0) {
        consider(post, 'charge', 'SET SATCHEL CHARGE', post.x, post.y, 40);
      } else {
        consider(post, 'scout', post.def.label.toUpperCase() + '  ' + Math.ceil(post.hp) + '/' + post.maxHp, post.x, post.y, 40);
      }
    }
    // A cache is a one-time reward for having walked somewhere.
    for (const l of (this.world.landmarks || [])) {
      if (!l.cache || l.cache.taken) continue;
      consider(l, 'cache', 'OPEN THE CACHE', l.cache.x, l.cache.y, 30);
    }

    // The wreck, while it is still burning and there is water in the bucket.
    if (this.arrival && this.arrival.canDouse(this)) {
      const w2 = this.arrival.wreck;
      consider(w2, 'douse', 'POUR IT ON THE FIRE', w2.x, w2.y, 40);
    }

    // A bug is small and it is running away from you, so it only offers itself
    // once you are genuinely on top of it.
    const bug = this.wildlife.nearestBug(p.x, p.y, 20);
    if (bug) consider(bug, 'bug', 'CATCH IT', bug.x, bug.y - bug.z, 20);

    if (!best) {
      const node = this.world.nearestNode(p.x, p.y, 22);
      if (node) {
        const verb = node.def.tool === 'axe' ? 'CHOP' : node.def.tool === 'pick' ? 'MINE' : 'GATHER';
        consider(node, 'gather', verb + ' ' + node.type.toUpperCase(), node.x, node.y, 26);
      }
    }

    this.prompt = best;
    if (!best || this.uiBlocksInput) return;

    // dialogue: E advances the typewriter before it triggers anything else
    if (this.input.isPressed('interact')) {
      if (this.dialogue.isOpen && this.dialogue.advance()) return;
      switch (best.kind) {
        case 'douse': this.arrival.douse(this); break;
        case 'bug': {
          const b = best.obj;
          b.dead = true;
          p.inv.add('bug', 1);
          audio.play('pickup', { vol: 0.6, pitch: 1.3 });
          particles.burst(b.x, b.y - b.z, 6, { colors: ['#8ad0a0', '#d8e8c8'], speed: 60, life: 0.4, vz: 40 });
          particles.text(b.x, b.y - b.z - 12, 'BUG', '#8ad0a0', { life: 0.7 });
          if (this.arrival) this.arrival.onBugCaught(this);
          break;
        }
        case 'npc': best.obj.interact(this); break;
        case 'feed': {
          const a = best.obj;
          const food = a.def.likes.find(k => p.inv.get(k) > 0);
          if (food && p.inv.take(food, 1)) {
            a.feed(food, this);
            this.flyItem(food, p.x, p.y - 10, a.x, a.y - 6, 0.32);
          }
          break;
        }
        case 'equip': {
          const a = best.obj;
          const tool = this.nextToolFor(a);
          if (tool && a.giveTool(tool, this)) this.toolBag[tool]--;
          break;
        }
        case 'charge':
        case 'breach': {
          const big = best.kind === 'breach';
          const item = big ? 'chargeBig' : 'charge';
          if (!p.inv.take(item, 1)) break;
          const o = best.obj;
          o.alert(this);
          this.charges.push({ x: o.x, y: o.y + 6, t: big ? 4.5 : 3.2, total: big ? 4.5 : 3.2,
                              dmg: big ? 400 : 130, r: big ? 90 : 60, outpost: o });
          audio.play('craft', { vol: 0.6, pitch: 0.7 });
          this.toast(big ? 'BREACHING CHARGE SET — MOVE' : 'CHARGE SET — MOVE', P.uiWarn, 2.4);
          break;
        }
        case 'pens': {
          const o = best.obj;
          o.pensOpen = true;
          this.toolBag.cutters = Math.max(0, (this.toolBag.cutters || 0) - 1);
          o.alert(this);
          this.announce('THE PENS ARE OPEN', 'THEY REMEMBER THIS', P.uiGood, 3.5);
          for (let i = 0; i < (o.def.frees || 3); i++) {
            const a = this.wildlife.spawnFreed(o.x + rnd(-26, 26), o.y + rnd(-14, 18), this);
            if (a) {
              a.addTrust(40, this, 'freed');
              const f = factionOf(a.key);
              if (f) this.alliances.add(f, 5, this, 'cut their kin loose');
            }
          }
          break;
        }
        case 'scout': {
          const o = best.obj;
          this.hud.subtitle(o.def.desc, 4);
          this.toast(o.guards.length + ' ON THE GROUND  -  ' + o.def.label.toUpperCase(), P.uiWarn, 3);
          break;
        }
        case 'cache': {
          const l = best.obj;
          l.cache.taken = true;
          audio.play('levelup', { vol: 0.7 });
          this.announce(l.name.toUpperCase(), 'SOMEBODY LEFT THIS AND DID NOT COME BACK', P.favor, 3.6);
          for (const item of l.cache.items) {
            this.dropPickup(item, 4 + Math.floor(Math.random() * 4), l.cache.x + rnd(-10, 10), l.cache.y + rnd(-6, 6));
          }
          this.dropPickup('scrap', 3, l.cache.x, l.cache.y);
          if (l.faction) this.alliances.add(l.faction, 4, this, 'they had left it for you');
          break;
        }
        case 'revive': {
          const a = best.obj;
          a.downT = 0;
          a.hp = a.maxHpStat * 0.5;
          audio.play('rescue');
          particles.ring(a.x, a.y - 6, 4, 30, 0.5, P.uiGood, 2, true);
          a.addTrust(8, this, 'revived');
          break;
        }
        case 'wreck': best.obj.loot(this); break;
        case 'rescue': this.pickUpAnimal(best.obj); break;
        case 'water': {
          const n = p.inv.add('water', p.inv.cap('water'));
          if (n > 0) { audio.play('splash', { vol: 0.5 }); particles.water(best.x, best.y, 8); this.toast('WATER FILLED', P.waterFoam, 1.4); }
          break;
        }
        case 'station': this.panels.toggle('craft'); break;
        default: break;
      }
    }
  }

  pickUpAnimal(a) {
    const p = this.player;
    a.trapped = false;
    a.carried = true;
    p.carrying = { animal: a, sprite: a.sprite };
    this.wildlife.animals = this.wildlife.animals.filter(x => x !== a);
    audio.play('pickup');
    this.toast('CARRY IT TO THE DEN', P.uiGood, 3);
    particles.text(p.x, p.y - 26, a.def.name.toUpperCase(), P.uiGood);
  }

  releaseAnimal() {
    const p = this.player;
    const c = p.carrying;
    if (!c) return;
    const a = c.animal;
    a.carried = false;
    a.trapped = false;
    a.x = this.world.den.x + rnd(-24, 24);
    a.y = this.world.den.y + rnd(16, 34);
    a.state = 'graze';
    a.hp = Math.max(a.hp, a.maxHp * 0.5);
    this.wildlife.animals.push(a);
    p.carrying = null;
    p.animalsRescued++;
    this.rescued++;
    audio.play('rescue');
    particles.ring(a.x, a.y, 4, 40, 0.6, P.uiGood, 2, true);
    particles.text(a.x, a.y - 20, 'SAFE', P.uiGood, { life: 1.4 });
    this.toast('RESCUED  ' + this.rescued + '/' + Math.max(this.rescueTarget, this.rescued), P.uiGood, 2.6);
  }

  // ======================================================================
  //  SERVICES used by entities
  // ======================================================================
  /**
   * Naming what you walk past.
   *
   * A landmark is worth nothing until you know it is there, so they are found
   * rather than given. The flock's scouting doubles the range you find them
   * at, which is the difference between exploring and being told.
   */
  updateDiscovery() {
    if (!this.world.landmarks) return;
    const reach = DISCOVER_R * (this.alliances && this.alliances.has('scout') ? 2 : 1);
    for (const l of this.world.landmarks) {
      if (l.found) continue;
      if (Math.hypot(this.player.x - l.x, this.player.y - l.y) > reach) continue;
      l.found = true;
      this.found++;
      this.panels.mapDirty = true;
      this.toast('FOUND: ' + l.name.toUpperCase(), P.uiAccent, 3);
      audio.play('coinup', { vol: 0.4, pitch: 1.3 });
      if (l.def.blurb) this.hud.subtitle(l.def.blurb, 3.4);
      if (l.def.reveals) {
        // a lookout shows you what it can see
        for (const o of this.world.landmarks) {
          if (o.found) continue;
          if (Math.hypot(o.x - l.x, o.y - l.y) < l.def.reveals) { o.found = true; this.found++; }
        }
      }
      if (l.faction && this.alliances) this.alliances.add(l.faction, 2, this, 'found their ground');
    }
    // the pack marks Les Nest for you once it runs with you
    if (this.alliances && this.alliances.has('track') && this.occupation) {
      for (const o of this.occupation.outposts) {
        if (!o.found) { o.found = true; this.panels.mapDirty = true; }
      }
    }
  }

  /**
   * Outposts only staff themselves when somebody is close enough to care.
   * A basin holding forty permanently-simulated guards is a basin at 12fps.
   */
  updateOutposts(dt) {
    for (const o of this.occupation.outposts) {
      if (o.razed) continue;
      const near = o.inRange(this.player.x, this.player.y, 300);
      if (near && !o.found) {
        o.found = true;
        this.panels.mapDirty = true;
        this.toast('LES NEST — ' + o.def.label.toUpperCase(), P.uiBad, 3);
        this.hud.subtitle(o.def.desc, 3.4);
        this.hud.ping(o.x, o.y, P.uiBad, 8);
        this.npcsReact('outpostFound', 0.8, 900);
      }
      if (near && !o.spawned) {
        o.spawned = true;
        for (const [kind, n] of o.def.garrison) {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + o.id;
            const e = this.spawnEnemy(kind, o.x + Math.cos(a) * rnd(30, o.r),
                                            o.y + Math.sin(a) * rnd(24, o.r * 0.8), 1);
            if (e) { e.homeX = o.x; e.homeY = o.y; e.garrisonOf = o; o.guards.push(e); }
          }
        }
      }
      if (!near && o.spawned && !o.alerted) {
        // walked away without a fight: they stand down and the pens refill
        o.spawned = false;
        for (const g of o.guards) if (!g.dead) g.dead = true;
        o.guards.length = 0;
      }
      o.alarmT = Math.max(0, o.alarmT - dt);
      o.guards = o.guards.filter(g => !g.dead);
    }
  }

  /** The nearest outpost you are standing inside, for prompts and the HUD. */
  outpostAt(x, y) {
    if (!this.occupation) return null;
    for (const o of this.occupation.outposts) {
      if (o.razed) continue;
      if (Math.hypot(x - o.x, y - o.y) < 34) return o;
    }
    return null;
  }

  /**
   * A patrol. This is what standing outposts eventually buy you, and it is
   * deliberately much rarer than the old forty-five-second wave clock.
   */
  sendPatrol(size, index) {
    const world = this.world;
    const a = Math.random() * TAU;
    const px = clamp(this.camp.x + Math.cos(a) * 420, 40, world.pxW - 40);
    const py = clamp(this.camp.y + Math.sin(a) * 420, 40, world.pxH - 40);
    const pool = index < 3 ? ['poacher', 'poacher', 'drone']
      : index < 6 ? ['poacher', 'drone', 'trapper', 'logger']
      : ['trapper', 'spider', 'enforcer', 'drone', 'turret'];
    for (let i = 0; i < size; i++) {
      this.spawnEnemy(pick(pool), px + rnd(-40, 40), py + rnd(-40, 40), 1 + Math.floor(index / 3));
    }
    this.announce('PATROL INBOUND', 'THE MASTS CALLED THEM', P.uiBad, 3.2);
    audio.play('alarm', { vol: 0.55 });
    this.hud.ping(px, py, P.uiBad, 8);
  }

  /**
   * An outpost goes down. This is the good moment in the loop, so it pays in
   * everything at once: materials, standing with whoever's ground it was on,
   * and permanently less pressure for the rest of the run.
   */
  onOutpostRazed(o) {
    this.announce(o.name.toUpperCase() + ' RAZED', 'THE BASIN GETS QUIETER', P.uiGood, 4);
    this.npcsReact('outpostRazed', 0.9, 2000);
    for (const [item, n] of Object.entries(o.def.loot || {})) {
      this.dropPickup(item, n, o.x + rnd(-16, 16), o.y + rnd(-8, 14));
    }
    for (const g of o.guards) if (!g.dead) g.damage(9999, this, {});
    o.guards.length = 0;
    this.occupation.razed++;

    const fac = o.landmark && o.landmark.faction;
    if (fac) this.alliances.add(fac, 13, this, 'took their ground back');
    // everybody notices a mast come down
    for (const k of FACTION_KEYS) if (k !== fac) this.alliances.add(k, 4, this, 'word travels');

    if (o.def.frees) {
      // the pens open. Whatever was in them is grateful, and remembers.
      for (let i = 0; i < o.def.frees; i++) {
        const a = this.wildlife.spawnFreed
          ? this.wildlife.spawnFreed(o.x + rnd(-24, 24), o.y + rnd(-16, 16), this)
          : null;
        if (a) {
          a.addTrust(30, this, 'freed');
          const f = factionOf(a.key);
          if (f) this.alliances.add(f, 2, this, 'freed one of theirs');
        }
      }
    }
    if (this.occupation.standing.length === 0) {
      this.announce('THE BASIN IS CLEAR', 'NOTHING LEFT TO CALL THEM IN', P.uiGood, 6);
    }
  }

  /**
   * One of their structures, standing or wrecked.
   *
   * A standing outpost carries its own health bar and a name plate once you
   * have found it, because the interesting question at four hundred pixels is
   * always "can I take that with what I am carrying".
   */
  drawOutpost(r, o) {
    if (o.razed) {
      const img = outpostWreck(o.def.core);
      r.shadow(o.x, o.y, 16, 6, 0.3);
      r.draw(img, o.x - img.width / 2, o.y - img.height + 3);
      return;
    }
    const f = outpostFrames(o.def.core);
    const img = f[Math.floor(this.time * 5) % f.length];
    r.shadow(o.x, o.y, 15, 6, 0.34);
    r.draw(img, o.x - img.width / 2, o.y - img.height + 3);

    const top = o.y - img.height;
    if (o.hp < o.maxHp) {
      const w = 30;
      r.rect(o.x - w / 2, top - 6, w, 3, 'rgba(0,0,0,0.6)');
      r.rect(o.x - w / 2, top - 6, Math.round(w * (o.hp / o.maxHp)), 3, P.uiBad);
    }
    if (o.alarmT > 0) {
      r.ring(o.x, o.y - 6, 20 + (3 - o.alarmT) * 26, P.uiBad, 1, o.alarmT / 3);
    }
  }

  /**
   * Charges you have set, counting down.
   *
   * The fuse is the interesting part. It is long enough that you have to
   * decide whether to stand and hold the ground or run for the treeline, and
   * short enough that the decision is not free.
   */
  updateCharges(dt) {
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      c.t -= dt;
      // a tick that gets faster, so you can hear how long you have
      const rate = c.t < 1 ? 0.1 : c.t < 2 ? 0.22 : 0.45;
      c.beep = (c.beep || 0) - dt;
      if (c.beep <= 0) {
        c.beep = rate;
        audio.play('ui', { vol: 0.32, pitch: 1 + (1 - c.t / c.total) });
        particles.spawn({ x: c.x, y: c.y - 2, z: 2, vx: 0, vy: 0, vz: 8, life: 0.3, size: 1, color: P.uiBad });
      }
      if (c.t > 0) continue;
      this.charges.splice(i, 1);
      this.explode(c.x, c.y, c.r, c.dmg * 0.5, true, this.player);
      if (c.outpost && !c.outpost.razed) c.outpost.damage(c.dmg, this);
      this.r.camera.addShake(7);
    }
  }

  /** Draw the fuse markers. */
  drawCharges(r) {
    for (const c of this.charges) {
      const t = 1 - c.t / c.total;
      r.rect(c.x - 3, c.y - 4, 6, 4, '#3a3630');
      r.rect(c.x - 3, c.y - 4, 6, 1, '#5c5648');
      const blink = Math.floor(c.t * (c.t < 1.5 ? 8 : 3)) % 2 === 0;
      r.rect(c.x + 1, c.y - 3, 1, 1, blink ? P.uiBad : '#40201c');
      r.ring(c.x, c.y - 2, 6 + t * 18, P.uiBad, 1, (1 - t) * 0.5);
    }
  }

  /**
   * The allies turning up.
   *
   * This is what an alliance is actually for. When you pick a fight at an
   * outpost, every faction that has sworn to you sends what it promised —
   * bison and elk that go straight through the middle, wolves onto the
   * flanks, ravens for the drones. They arrive from off-screen, which is the
   * whole feeling of it.
   */
  summonAllies(o) {
    if (!this.alliances || o.alliesCalled) return;
    o.alliesCalled = true;
    let sent = 0;
    for (const k of FACTION_KEYS) {
      const tier = this.alliances.alliesFrom(k);
      if (!tier) continue;
      const from = Math.random() * TAU;
      for (let i = 0; i < (tier.allies || 2); i++) {
        const key = tier.ally[i % tier.ally.length];
        if (key === 'ridge') {
          const n = this.npcs.find(x => x.recruited && !x.dead);
          if (n) { n.x = o.x + Math.cos(from) * 200; n.y = o.y + Math.sin(from) * 170; sent++; }
          continue;
        }
        const a = this.wildlife.spawnAlly
          ? this.wildlife.spawnAlly(key, o.x + Math.cos(from + i * 0.5) * 210,
                                         o.y + Math.sin(from + i * 0.5) * 175, this)
          : null;
        if (a) sent++;
      }
    }
    if (sent) {
      this.announce('THEY CAME', 'THE BASIN FIGHTS WITH YOU', P.favor, 3.6);
      audio.play('roar', { vol: 0.6 });
      this.npcsReact('allied', 0.9, 2000);
    }
  }

  /** A big centred banner, for a faction tier or another once-a-run moment. */
  bigToast(title, sub, color) { this.announce(title, sub, color || P.favor, 4.5); }

  toast(text, color, seconds) { this.hud.toast(text, color, seconds); }
  announce(title, sub, color, seconds) { this.hud.showAnnounce(title, sub, color, seconds); }
  weaponName(key) { return WEAPONS[key] ? WEAPONS[key].name : key; }

  slowmo(scale, seconds) { this.slowScale = scale; this.slowT = seconds; }

  spawnBullet(o) { return this.bullets.spawn(o); }

  spawnAllyBullet(npc, target, kind, damage, speed, offset = 0) {
    const a = Math.atan2(target.y - 6 - (npc.y - 8), target.x - npc.x) + offset;
    this.bullets.spawn({
      x: npc.x, y: npc.y - 8,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      damage, friendly: true, kind, life: 1.6, owner: npc, knock: 20,
    });
  }

  spawnEnemy(kind, x, y, level = 1) {
    x = clamp(x, 24, this.world.pxW - 24);
    y = clamp(y, 24, this.world.pxH - 24);
    // never spawn inside a rock
    let guard = 0;
    while (isSolid(this.world.tileAtPx(x, y)) && guard++ < 24) {
      x += rnd(-24, 24); y += rnd(-24, 24);
      x = clamp(x, 24, this.world.pxW - 24);
      y = clamp(y, 24, this.world.pxH - 24);
    }
    const e = new Enemy(kind, x, y, level);
    this.enemies.push(e);
    particles.ring(x, y, 2, 26, 0.4, P.nestEye, 2, true);
    return e;
  }

  callReinforcement(x, y) {
    const a = rnd(TAU);
    this.spawnEnemy(pick(['poacher', 'drone', 'trapper']), x + Math.cos(a) * 190, y + Math.sin(a) * 160, this.director.wave);
  }

  spawnHazard(kind, x, y) {
    if (kind === 'sawtrap') this.hazards.push(new SawTrap(x, y));
  }

  spawnMortar(x, y, delay, radius, damage, owner) {
    this.hazards.push(new Mortar(x, y, delay, radius, damage, owner));
  }

  spawnFirebomb(x, y, delay, owner, silent = false) {
    this.hazards.push(new Firebomb(x, y, delay, owner, silent));
  }

  smokeBomb(x, y, radius) {
    this.hazards.push(new SmokeCloud(x, y, radius));
    particles.smoke(x, y, 18, { life: 2.2, size: 3 });
    audio.play('explode', { vol: 0.4 });
  }

  steamBurst(x, y) {
    this.hazards.push(new SteamBurst(x, y, 2.4, true));
    audio.play('geyser', { vol: 0.6 });
  }

  buildAllyTurret(x, y) {
    this.hazards.push(new AllyTurret(x, y));
    this.toast('SENTRY ONLINE', P.uiAccent, 3);
  }

  buildBarricades(tier) {
    const den = this.world.den;
    const n = 6 + tier * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rad = 52 + tier * 6;
      const x = den.x + Math.cos(a) * rad;
      const y = den.y + Math.sin(a) * rad * 0.85;
      if (isSolid(this.world.tileAtPx(x, y))) continue;
      this.hazards.push(new Barricade(x, y));
    }
    this.toast('THE DEN IS WALLED', P.barkLight, 3);
    audio.play('craft');
  }

  surveyBasin(level) {
    this.surveyLevel = Math.max(this.surveyLevel, level);
    this.panels.mapDirty = true;
    this.toast('BASIN SURVEYED - CHECK THE MAP [M]', P.uiGood, 4);
  }

  dropPickup(item, count, x, y) { return this.pickups.drop('resource', item, x, y, { count }); }

  /** The little arc a resource makes when it leaves your pack for an NPC. */
  flyItem(item, x0, y0, x1, y1, dur = 0.4) {
    this.flyers.push({ item, x0, y0, x1, y1, t: 0, dur });
  }

  /** The crescent left behind by a claw swing. */
  spawnSlash(x, y, angle, reach, arc) {
    this.slashes.push({ x, y, a: angle, reach, arc, t: 0, life: 0.2 });
    if (this.slashes.length > 10) this.slashes.shift();
  }

  updateSlashes(dt) {
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.t += dt;
      if (s.t >= s.life) this.slashes.splice(i, 1);
    }
  }

  drawSlashes(r) {
    for (const s of this.slashes) {
      const f = clamp(s.t / s.life, 0, 1);
      const sweep = s.arc * (0.4 + f * 0.9);
      const rad = s.reach * (0.55 + f * 0.55);
      const a0 = s.a - sweep / 2, a1 = s.a + sweep / 2;
      r.arc(s.x, s.y, rad, a0, a1, '#ffffff', 2, (1 - f) * 0.9);
      r.arc(s.x, s.y, rad - 3, a0 + 0.12, a1 - 0.12, P.furCream, 1, (1 - f) * 0.6);
      r.glow(s.x + Math.cos(s.a) * rad * 0.6, s.y + Math.sin(s.a) * rad * 0.6, 18, 'rgba(255,255,235,0.5)', (1 - f) * 0.8);
    }
  }

  updateFlyers(dt) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      if (f.t >= f.dur) {
        particles.burst(f.x1, f.y1, 4, { colors: [P.favor, '#fff'], speed: 40, life: 0.3, additive: true });
        this.flyers.splice(i, 1);
      }
    }
  }

  updateGeysers(dt) {
    // Only wake up cones the player could plausibly be standing near; the basin
    // has dozens and every eruption is a particle-heavy hazard.
    for (const g of this.world.geysers) {
      if (!g.justErupted) continue;
      g.justErupted = false;
      if (dist2(g.x, g.y, this.player.x, this.player.y) > 520 * 520) continue;
      if (this.r.camera.visible(g.x, g.y, 200)) audio.play('geyser', { vol: 0.5 });
      this.hazards.push(new SteamBurst(g.x, g.y - 8, 3.2, false));
    }
  }

  wakeNearestGeyser() {
    let best = null, bd = Infinity;
    for (const g of this.world.geysers) {
      const d = dist2(g.x, g.y, this.player.x, this.player.y);
      if (d < bd) { bd = d; best = g; }
    }
    if (best && bd < 400 * 400) {
      this.world.triggerGeyser(best);
      this.toast('GEYSER WOKEN', P.springHot, 2);
    } else {
      this.toast('NO CONE IN RANGE', P.uiDim, 1.6);
      audio.play('deny');
    }
  }

  // --- combat queries ------------------------------------------------------
  nearestEnemy(x, y, range, exclude = null) {
    let best = null, bd = range * range;
    for (const e of this.enemies) {
      if (e.dead || e === exclude) continue;
      if (e.charmT > 0 && exclude === null) continue;   // hijacked machines are friendly
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Closest enemy to an arbitrary point — used by the command reticle. */
  enemyNear(x, y, r) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.charmT > 0) continue;
      const d = dist2(x, y, e.x, e.y);
      const reach = (r + e.r) * (r + e.r);
      if (d < reach && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  rallyBonus(seconds) { this.squad.rally(seconds); }

  buildBarricadeAt(x, y) {
    if (isSolid(this.world.tileAtPx(x, y))) return;
    this.hazards.push(new Barricade(x, y));
  }

  onAnimalBonded(a) {
    this.announce(a.name.toUpperCase() + ' FOLLOWS YOU', a.def.ability.toUpperCase(), P.favor, 3.4);
    this.toast(a.def.pros, P.uiGood, 4);
    if (this.squad.size === 0) this.toast('T TO COMMAND  -  Y ON ME  -  H HOLD', P.favor, 6);
  }

  /** Tools you have built but not yet strapped to anything. */
  toolCount(k) { return this.toolBag[k] || 0; }
  addTool(k, n = 1) { this.toolBag[k] = (this.toolBag[k] || 0) + n; }
  /** The first built tool this animal is not already wearing. */
  nextToolFor(a) {
    for (const k of TOOL_KEYS) {
      if (this.toolCount(k) > 0 && !a.hasTool(k)) return k;
    }
    return null;
  }

  nearestFire(x, y, range) {
    const f = this.fire;
    if (f.burning.size === 0) return null;
    let best = null, bd = range * range;
    let n = 0;
    for (const idx of f.burning) {
      if ((n++ & 1) !== 0) continue;
      const tx = (idx % f.w) * TS + 8, ty = ((idx / f.w) | 0) * TS + 8;
      const d = dist2(x, y, tx, ty);
      if (d < bd) { bd = d; best = { x: tx, y: ty }; }
    }
    return best;
  }

  fireNear(x, y, range) { return !!this.nearestFire(x, y, range); }

  /** Resolve one friendly bullet against enemies. Returns 'consumed' if gone. */
  hitEnemies(b) {
    // Shooting the wildlife is possible, and it costs you.
    if (b.owner === this.player) {
      for (const a of this.wildlife.animals) {
        if (a.dead || a.downT > 0) continue;
        const rr = a.r + b.radius;
        if (dist2(b.x, b.y, a.x, a.y - 4) < rr * rr) {
          a.damage(b.damage, this, true);
          b.alive = false;
          return 'consumed';
        }
      }
    }
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (e.charmT > 0) continue;
      const rr = e.r + b.radius;
      if (dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;
      if (b.hits && b.hits.has(e.id)) continue;
      const dmg = e.damage(b.damage, this, b);
      particles.text(e.x + rnd(-4, 4), e.y - e.h * 0.6, String(Math.round(dmg)), b.damage > 20 ? P.fire1 : P.ui, { life: 0.5, scale: 1 });
      if (b.chain > 0) this.chainLightning(e, b, b.chain);
      else if (b.arcChance && Math.random() < b.arcChance) this.chainLightning(e, b, 1);
      if (b.aoe > 0) { b.alive = false; this.explode(b.x, b.y, b.aoe, b.damage, true, b.owner); return 'consumed'; }
      if (b.pierce > 0) {
        b.pierce--;
        if (!b.hits) b.hits = new Set();
        b.hits.add(e.id);
        return 'pierced';
      }
      b.alive = false;
      return 'consumed';
    }
    // Their structures take hits like anything else. This is the whole raid:
    // walk in, shoot the mast down, walk out with the loot.
    if (this.occupation && b.owner === this.player) {
      for (const o of this.occupation.outposts) {
        if (o.razed) continue;
        const rr = 20 + b.radius;
        if (dist2(b.x, b.y, o.x, o.y - 10) > rr * rr) continue;
        o.damage(b.damage, this);
        particles.text(o.x + rnd(-6, 6), o.y - 26, String(Math.round(b.damage)), P.uiWarn, { life: 0.5, scale: 1 });
        b.alive = false;
        return 'consumed';
      }
    }
    // friendly fire can also break saw traps and enemy hardware
    for (const h of this.hazards) {
      if (!h.damage || h.dead) continue;
      if (!(h instanceof SawTrap)) continue;
      const rr = h.r + b.radius;
      if (dist2(b.x, b.y, h.x, h.y) < rr * rr) {
        h.damage(b.damage, this);
        b.alive = false;
        return 'consumed';
      }
    }
    return null;
  }

  hitAllies(b) {
    for (const n of this.npcs) {
      if (!n.recruited || n.downT > 0) continue;
      const rr = n.r + b.radius;
      if (dist2(b.x, b.y, n.x, n.y - 6) < rr * rr) {
        n.damage(b.damage, this);
        b.alive = false;
        return 'consumed';
      }
    }
    for (const h of this.hazards) {
      if (h.dead) continue;
      if (h instanceof Barricade || h instanceof AllyTurret) {
        const rr = h.r + b.radius;
        if (dist2(b.x, b.y, h.x, h.y - 6) < rr * rr) {
          h.hp -= b.damage;
          b.alive = false;
          particles.sparks(b.x, b.y, 3, P.nestSteelHi);
          return 'consumed';
        }
      }
    }
    return null;
  }

  chainLightning(from, b, jumps) {
    let src = from;
    const hit = new Set([from.id]);
    for (let i = 0; i < jumps; i++) {
      let best = null, bd = (b.chainRange || 64) ** 2;
      for (const e of this.enemies) {
        if (e.dead || hit.has(e.id) || e.charmT > 0) continue;
        const d = dist2(src.x, src.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hit.add(best.id);
      best.damage(b.damage * 0.7, this, null);
      this.drawArcs = this.drawArcs || [];
      this.drawArcs.push({ x1: src.x, y1: src.y - 6, x2: best.x, y2: best.y - 6, life: 0.16 });
      particles.sparks(best.x, best.y - 6, 4, P.cyber);
      src = best;
    }
    audio.play('sparker', { vol: 0.4 });
  }

  explode(x, y, radius, damage, friendly, owner) {
    particles.burst(x, y, 22, { colors: [P.fire1, P.fire2, P.fire3], speed: 190, life: 0.55, additive: true, vz: 100 });
    particles.smoke(x, y, 8, { life: 1.6, size: 3 });
    particles.ring(x, y, 4, radius, 0.34, P.fire2, 2, true);
    this.r.camera.addShake(radius > 40 ? 5 : 3);
    audio.play('explode', { vol: 0.7 });
    if (friendly) {
      this.damageEnemiesAt(x, y, radius, damage, owner);
      this.damageTreesAt(x, y, radius * 0.5, 1);
    } else {
      const p = this.player;
      const d = Math.sqrt(dist2(x, y, p.x, p.y - 6));
      if (d < radius && !p.dead) p.damage(damage * clamp(1 - d / radius, 0.25, 1), this);
      for (const n of this.npcs) {
        if (!n.recruited) continue;
        const dn = Math.sqrt(dist2(x, y, n.x, n.y));
        if (dn < radius) n.damage(damage * 0.6 * clamp(1 - dn / radius, 0.2, 1), this);
      }
      for (const a of this.wildlife.animals) {
        if (dist2(x, y, a.x, a.y) < radius * radius) a.damage(damage * 0.5, this, false);
      }
    }
  }

  damageEnemiesAt(x, y, radius, damage, owner) {
    for (const e of this.enemies) {
      if (e.dead || e.charmT > 0) continue;
      const d = Math.sqrt(dist2(x, y, e.x, e.y));
      if (d < radius + e.r) e.damage(damage * clamp(1 - d / (radius + e.r), 0.3, 1), this, null);
    }
  }

  markEnemies(x, y, radius, seconds) {
    for (const e of this.enemies) {
      if (dist2(x, y, e.x, e.y) < radius * radius) e.markT = Math.max(e.markT, seconds);
    }
  }

  healAllies(n) {
    for (const npc of this.npcs) if (npc.recruited) npc.heal(n);
  }

  damageTreesAt(x, y, radius, dmg) {
    const near = this.world.near(x, y, radius + 12);
    for (const o of near) {
      if (o.objType !== 'node' || !o.alive || o.def.art !== 'tree') continue;
      if (dist2(x, y, o.x, o.y) > radius * radius) continue;
      const yields = this.world.hitNode(o, dmg);
      if (yields) this.onTreeFelledByEnemy(o);
    }
  }

  // --- scan pulse ----------------------------------------------------------
  onScan(p) {
    this.markEnemies(p.x, p.y, 200, 6);
    this.scanT = 1.6;
    for (const e of this.enemies) {
      if (dist2(p.x, p.y, e.x, e.y) < 200 * 200) particles.text(e.x, e.y - e.h - 4, String(Math.ceil(e.hp)), P.cyber, { life: 1.4 });
    }
    const near = this.world.near(p.x, p.y, 180);
    let n = 0;
    for (const o of near) {
      if (o.objType !== 'node' || !o.alive) continue;
      if (!['iron', 'copper', 'obsidian', 'coal', 'sulfur', 'saltpeter'].includes(o.type)) continue;
      if (n++ > 24) break;
      particles.ring(o.x, o.y - 4, 2, 12, 0.8, RESOURCES[o.def.yields[0][0]] ? RESOURCES[o.def.yields[0][0]].color : P.cyber, 1, true);
    }
  }

  // ======================================================================
  //  EVENT HOOKS
  // ======================================================================
  onEnemyKilled(e) {
    this.stats.kills++;
    this.player.onKill(this);
    const def = e.def;

    // loot
    for (const [item, n, p] of def.loot || []) {
      if (Math.random() > p) continue;
      const count = Math.max(1, Math.round(n * rnd(0.6, 1.2)));
      for (let i = 0; i < Math.min(count, 6); i++) {
        this.pickups.drop('resource', item, e.x + rnd(-8, 8), e.y + rnd(-6, 6), { count: Math.ceil(count / Math.min(count, 6)) });
      }
    }

    if (def.machine) {
      // a machine leaves a husk with a chip still in its head
      const chips = def.chips || 1;
      for (let i = 0; i < chips; i++) {
        const key = Math.random() < (def.chipChance || 0) ? randomChipKey(Math.random, def.boss ? 3 : 0) : null;
        const wx = e.x + (i === 0 ? 0 : rnd(-26, 26));
        const wy = e.y + (i === 0 ? 0 : rnd(-20, 20));
        this.wrecks.push(new Wreck(wx, wy, def.species, key, def.boss ? 6 : 2));
      }
      if (def.chipChance > 0) this.toast('WRECK LEFT BEHIND - PRESS E TO RIP THE CHIP', P.cyber, 3.2);
    }

    if (def.boss) {
      this.boss = null;
      this.announce(def.name + ' DOWN', 'THE BASIN BREATHES', P.uiGood, 4.5);
      this.slowmo(0.25, 1.1);
      this.r.camera.addShake(12);
      for (let i = 0; i < 6; i++) {
        this.pickups.drop('resource', 'gunpowder', e.x + rnd(-24, 24), e.y + rnd(-20, 20), { count: 2 });
      }
    }
  }

  onTreeBurned(node) {
    this.stats.treesLost++;
  }

  onTreeFelledByEnemy(node) {
    this.stats.treesLost++;
    if (chance(0.4)) this.toast('THEY TOOK A TREE', P.uiWarn, 1.8);
  }

  onAnimalLost(a, byFire) {
    this.stats.animalsLost++;
    if (a.def.kin) this.toast('A FERRET IS GONE', P.uiBad, 3);
    else if (a.bonded) this.toast(a.name.toUpperCase() + ' IS GONE', P.uiBad, 3);
  }

  onQuestAccepted(npc, req) {
    this.toast('REQUEST ACCEPTED: ' + npc.name.toUpperCase(), P.favor, 3);
    // The handover is physical and never explained by a menu, so say it once.
    if (!this._taughtHandover) {
      this._taughtHandover = true;
      this.toast('BRING THE MATERIALS AND STAND NEXT TO THEM', P.ui, 7);
    }
  }

  /**
   * The fire is not decoration. Standing at it puts you back together, which
   * is the first concrete reason to have a camp at all.
   */
  updateCampWarmth(dt) {
    if (!this.camp || !this.camp.has('firepit')) return;
    const at = this.camp.siteFor('firepit');
    const p = this.player;
    if (p.dead || dist2(p.x, p.y, at.x, at.y) > 44 * 44) return;
    if (p.hp < p.maxHp) {
      // heal() deals in whole points, so bank the fraction between frames
      this._warmth = (this._warmth || 0) + dt * 6;
      if (this._warmth >= 1) {
        const n = Math.floor(this._warmth);
        this._warmth -= n;
        p.heal(n, false);
        if (chance(0.5)) particles.text(p.x + rnd(-6, 6), p.y - 20, '+', P.uiGood, { life: 0.7 });
      }
    }
    p.energy = Math.min(p.maxEnergy, p.energy + dt * 14);
  }

  /**
   * Everyone within earshot says something about what just happened. This is
   * the difference between a basin full of quest markers and a basin full of
   * neighbours.
   */
  npcsReact(kind, prob = 0.55, radius = 460) {
    if (!this.npcs) return;
    const p = this.player;
    for (const n of this.npcs) {
      if (dist2(n.x, n.y, p.x, p.y) > radius * radius) continue;
      n.react(kind, this, prob);
    }
  }

  /** A structure went up. Anything gated behind it opens now. */
  onStructureBuilt(key, def) {
    this.stats.built = (this.stats.built || 0) + 1;
    this.panels.mapDirty = true;
    if (key === 'firepit') {
      this.toast('THE OTHERS WILL COME TO A FIRE. GO AND TALK TO THEM.', P.uiGood, 8);
    }
    for (const n of this.npcs) n.onCampChanged && n.onCampChanged(this, key);
  }

  onQuestComplete(npc, req) {
    this.stats.questsDone++;
  }

  onRecruit(npc) {
    this.announce(npc.name.toUpperCase() + ' JOINS YOU', npc.data.abilityName.toUpperCase(), P.favor, 4);
  }

  onWaveStart(wave) {
    // survey markers where the enemies are coming from
    for (const pt of this.director.spawnPoints) {
      particles.ring(pt.x, pt.y, 6, 60, 0.9, P.nestEye, 2, true);
    }
    this.npcsReact('waveIncoming', 0.5);
  }

  onWaveCleared(wave) {
    const bonus = 4 + wave;
    this.player.inv.add('ammo', bonus);
    this.toast('SALVAGE: +' + bonus + ' ROUNDS', P.uiGood, 2.4);
    this.npcsReact('waveClear', 0.5);
  }

  onFireEventStart() {
    this.hitFlash = 0.6;
    this.r.camera.addShake(8);
    this.npcsReact('fire', 0.85, 900);
  }

  onFireEventEnd() {
    const lost = this.stats.treesLost;
    this.toast('TREES LOST: ' + lost + '   ANIMALS SAVED: ' + this.rescued, P.ui, 6);
  }

  bossPhase(boss, phase) {
    this.r.camera.addShake(6);
    this.slowmo(0.4, 0.4);
    particles.ring(boss.x, boss.y, 6, 130, 0.7, P.nestEye, 3, true);
    audio.play('roar', { vol: 0.7 });
    this.toast(boss.def.name + ' - PHASE ' + (phase + 1), P.nestEye, 2.6);
    this.bullets.clearHostile(this.r);
  }

  onPlayerDeath() {
    if (this.revives > 0) {
      this.revives--;
      this.player.dead = false;
      this.player.hp = this.player.maxHp * 0.5;
      this.player.invuln = 3;
      this.bullets.clearHostile(this.r);
      this.announce('DOC QUILL PATCHES YOU UP', 'ONE CHANCE SPENT', P.uiGood, 3.4);
      audio.play('rescue');
      return;
    }
    this.state = STATE.DEAD;
    this.deathT = 0;
    this.director.onPlayerDeath();
    audio.setIntensity(0.05);
  }

  respawnPlayer() {
    const den = this.world.den;
    this.player.respawn(den.x, den.y + 24);
    this.bullets.clearHostile(this.r);
    // scatter half your carried wood where you fell — a real cost, not a reset
    const lost = Math.floor(this.player.inv.get('wood') / 2);
    if (lost > 0) this.player.inv.take('wood', lost);
    this.state = STATE.PLAY;
    this.hud.showAnnounce('YOU WAKE IN THE DEN', 'THE STITCHES HOLD', P.ui, 3);
  }

  onVictory() {
    this.state = STATE.VICTORY;
    this.victoryT = 0;
    audio.play('levelup');
    audio.setIntensity(0.2);
  }

  // --- crafting ------------------------------------------------------------
  nearStation() {
    const p = this.player;
    for (const pr of this.world.props) {
      if (pr.type !== 'station') continue;
      if (dist2(p.x, p.y, pr.x, pr.y) < 42 * 42) return pr.station;
    }
    return null;
  }

  canCraft(rec) {
    const p = this.player;
    if (rec.station && this.nearStation() !== rec.station) return { ok: false, why: 'NEEDS THE ' + rec.station.toUpperCase() };
    if (!p.inv.hasAll(rec.cost)) return { ok: false, why: 'NOT ENOUGH MATERIALS' };
    if (rec.give.weapon && p.weapons.includes(rec.give.weapon)) return { ok: false, why: 'ALREADY BUILT' };
    return { ok: true };
  }

  craft(rec) {
    const check = this.canCraft(rec);
    if (!check.ok) { audio.play('deny'); this.toast(check.why, P.uiWarn); return false; }
    const p = this.player;
    p.inv.takeAll(rec.cost);
    this.craftCounts[rec.id] = (this.craftCounts[rec.id] || 0) + 1;

    if (rec.give.weapon) {
      p.addWeapon(rec.give.weapon);
      this.announce(WEAPONS[rec.give.weapon].name, 'BUILT', P.uiGood, 3);
    }
    if (rec.give.chipSlot) { p.chipSlots += rec.give.chipSlot; p.recompute(); this.toast('CHIP SOCKET ADDED', P.cyber); }
    if (rec.give.tool) {
      this.addTool(rec.give.tool);
      this.toast(TOOLS[rec.give.tool].name.toUpperCase() + ' BUILT  -  [E] ON A FOLLOWER TO FIT IT', TOOLS[rec.give.tool].color, 4);
    }
    if (rec.give.smokeBombs) {
      this.smokeBombCharges += rec.give.smokeBombs;
      this.toast('SMOKE POTS +' + rec.give.smokeBombs + '  [G TO THROW]', P.uiGood, 3.4);
    }
    if (rec.give.waterCap) { p.inv.setCap('water', p.inv.cap('water') + rec.give.waterCap); this.toast('WATER CAPACITY UP', P.waterFoam); }
    for (const k in rec.give) {
      if (['weapon', 'chipSlot', 'waterCap', 'tool', 'smokeBombs'].includes(k)) continue;
      p.grant(k, rec.give[k], this, p.x, p.y - 18);
    }
    audio.play('craft');
    particles.ring(p.x, p.y - 6, 3, 26, 0.4, P.favor, 2, true);
    return true;
  }

  // ======================================================================
  //  RENDER
  // ======================================================================
  drawWorldText(str, wx, wy, color, align = 'left', scale = 1) {
    drawText(this.r.ctx, str, wx - this.r.camera.ox, wy - this.r.camera.oy, color, { align, scale, shadow: true });
  }

  render() {
    beginBeastFrame();
    const r = this.r;
    const ctx = r.ctx;
    const cam = r.camera;
    const lab = this.mode === 'lab';

    // The helicopter flight is its own screen-space scene: no world at all.
    if (lab && this.campaign.chapter === CHAPTER.HELI) {
      r.beginFrame('#0a1018');
      particles.draw(r, 0);
      r.endWorld();
      particles.drawTexts(r, drawText);
      this.campaign.drawHud(r, ctx, this);
      r.vignette(0.5);
      if (this.hitFlash > 0) r.flash('#c0332a', this.hitFlash * 0.4);
      this.input.touch.draw(r, this);
      this.input.endFrame();
      return;
    }

    r.beginFrame(lab ? '#0a1214' : P.waterDeep);
    this.world.drawGround(r);
    if (!lab) {
      this.drawWaterAndScorch(r);
      this.wildlife.drawFish(r, cam);
    }
    particles.draw(r, -1);

    // ground-layer hazards (mortar rings, firebomb markers)
    for (const h of this.hazards) if (h.layer === 'ground') h.draw(r, this);
    // where the camp could be, if anyone would build it for you
    if (!lab && this.camp) this.camp.drawGhosts(r, this);

    // y-sorted world
    const list = this.drawList;
    list.length = 0;
    this.world.collectDrawables(cam, list);
    if (lab) this.campaign.collect(list, cam);
    else this.wildlife.collect(list, cam);
    this.pickups.collect(list, cam);
    for (const e of this.enemies) if (cam.visible(e.x, e.y, 60)) list.push(e);
    for (const w of this.wrecks) if (cam.visible(w.x, w.y, 40)) list.push(w);
    for (const n of this.npcs) if (cam.visible(n.x, n.y, 40)) list.push(n);
    for (const h of this.hazards) if (h.layer === 'entity' && cam.visible(h.x, h.y, 40)) list.push(h);
    if (this.occupation) {
      for (const o of this.occupation.outposts) {
        if (cam.visible(o.x, o.y, 90)) list.push({ y: o.y, outpost: o });
      }
    }
    if (!this.player.dead || this.player.deathT < 1.2) list.push(this.player);

    list.sort((a, b) => (a.y || 0) - (b.y || 0));
    for (const o of list) {
      if (o === this.player) { this.player.draw(r, this); continue; }
      if (o.outpost) { this.drawOutpost(r, o.outpost); continue; }
      if (o.draw) { o.draw(r, this); continue; }
      this.drawWorldObject(r, o);
    }

    if (!lab) {
      this.fire.draw(r, this.time);
      if (this.arrival) this.arrival.drawWorld(r, this);
    } else this.campaign.drawWorld(r, this);
    this.bullets.draw(r);
    this.drawCharges(r);
    this.drawChainArcs(r);
    this.drawSlashes(r);
    if (!lab) this.squad.drawWorld(r, this);
    this.drawFlyers(r);
    particles.draw(r, 0);
    for (const h of this.hazards) if (h.layer === 'over') h.draw(r, this);
    this.drawSpawnWarnings(r);

    // lighting
    const amb = this.state === STATE.TITLE ? 'rgb(74,86,94)' : this.ambientColor();
    if (amb) {
      r.clearLight(amb);
      if (lab && this.campaign) this.campaign.drawLights(r, this);
      if (this.state === STATE.TITLE) {
        // Two strip lights, one over each tank. Everything else is corridor.
        const c = this.campaign.marks.cage, b = this.campaign.marks.beaverCage;
        r.light(c.x, c.y - 4, 74, 'rgba(206,244,252,0.95)', 1);
        r.light(b.x, b.y - 4, 62, 'rgba(150,206,220,0.75)', 0.85);
        const pane = (c.tx + 3) * TS + TS / 2;
        if (this.pound.flash > 0) r.light(pane, c.y, 46, 'rgba(230,250,255,1)', this.pound.flash);
      }
      this.player.drawLight(r);
      for (const e of this.enemies) if (cam.visible(e.x, e.y, 60)) e.drawLight(r);
      this.fire.drawLight(r);
      for (const g of this.world.geysers) if (cam.visible(g.x, g.y, 60)) r.light(g.x, g.y, 40, 'rgba(140,240,235,0.5)', 0.4);
      for (const pr of this.world.props) {
        if (pr.kind === 'forge' && cam.visible(pr.x, pr.y, 60)) r.light(pr.x, pr.y - 6, 60, 'rgba(255,160,80,0.8)', 0.7);
      }
    }
    // A vignette, faint enough to read as falloff rather than as a filter. It
    // does the job a lens does: pulls the eye to the middle of the frame and
    // stops the corners competing with the thing you are aiming at.
    if (!lab) {
      const vg = ctx.createRadialGradient(
        VIEW_W / 2, VIEW_H / 2, Math.min(VIEW_W, VIEW_H) * 0.36,
        VIEW_W / 2, VIEW_H / 2, Math.max(VIEW_W, VIEW_H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(6,10,8,0.34)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    this.bullets.drawGlow(r);
    r.endWorld();

    // smoke haze during the fire
    if (this.fire.intensity > 0.02) {
      const a = clamp(this.fire.intensity * 0.45, 0, 0.45);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#6b5a4a';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }

    particles.drawTexts(r, drawText);
    this.dialogue.draw(r, this);

    r.vignette(0.42 + this.nightFactor * 0.2);
    if (this.hitFlash > 0) r.flash('#c0332a', this.hitFlash * 0.4);

    if (this.state === STATE.TITLE) { this.drawTitle(r, ctx); this.input.endFrame(); return; }

    this.hud.draw(r, this);
    if (lab) this.campaign.drawHud(r, ctx, this);
    else this.squad.drawHud(r, ctx, this);
    if (this.arrival) this.arrival.drawHud(r, ctx, this);
    if (this.firstStand) this.firstStand.drawHud(r, ctx, this);
    this.panels.draw(r, this);

    if (this.state === STATE.PAUSED) this.drawPause(r, ctx);
    if (this.state === STATE.DEAD) this.drawDeath(r, ctx);
    if (this.state === STATE.VICTORY) this.drawVictory(r, ctx);

    this.input.touch.draw(r, this);

    if (this.showFps) drawText(ctx, this.loop.fps + ' FPS  ' + this.bullets.count + ' B  ' + this.enemies.length + ' E', 4, VIEW_H - 34, P.uiDim);
  }

  ambientColor() {
    // Indoors it is always strip-lit dusk, whatever the clock says — and when
    // the block goes dark ahead of him, it goes almost black.
    if (this.mode === 'lab') {
      const d = this.labDark || 0;
      if (d <= 0.01) return 'rgb(126,142,150)';
      // Dark enough that he is the only thing you can see clearly, not so dark
      // that you cannot see him at all.
      const k = 1 - d * 0.54;
      return `rgb(${Math.round(96 * k)},${Math.round(112 * k)},${Math.round(134 * k + d * 26)})`;
    }
    const n = this.nightFactor;
    const fire = this.fire.intensity;
    // Daylight used to skip the grading pass entirely, and a scene with no
    // grade at all is exactly what "flat" looks like — every pixel arriving at
    // its painted value with nothing tying them together. Even at noon the
    // basin gets a warm key, so there is a time of day in the picture.
    const dayR = 255, dayG = 248, dayB = 226;
    const nightR = 92, nightG = 108, nightB = 150;
    let rr = lerp(dayR, nightR, n);
    let gg = lerp(dayG, nightG, n);
    let bb = lerp(dayB, nightB, n);
    // fire washes the world orange
    rr = lerp(rr, 255, fire * 0.5);
    gg = lerp(gg, 150, fire * 0.45);
    bb = lerp(bb, 110, fire * 0.5);
    return `rgb(${Math.round(rr)},${Math.round(gg)},${Math.round(bb)})`;
  }

  drawWaterAndScorch(r) {
    const cam = r.camera;
    const x0 = Math.floor(cam.ox / TS), x1 = Math.ceil((cam.ox + VIEW_W) / TS);
    const y0 = Math.floor(cam.oy / TS), y1 = Math.ceil((cam.oy + VIEW_H) / TS);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = this.world.tileAt(tx, ty);
        if (isWater(id)) drawWaterShimmer(r, tx, ty, id, this.time);
      }
    }
  }

  drawWorldObject(r, o) {
    const img = worldObjectSprite(o, this.time);
    if (!img) return;
    let x = o.x - img.width / 2;
    let y = o.y - img.height + 2;
    // shake and topple
    if (o.objType === 'node') {
      if (o.shake > 0) x += Math.sin(this.time * 60) * o.shake * 6;
      if (o.fallT > 0) {
        const t = 1 - o.fallT / 0.6;
        r.drawT(img, o.x, o.y - img.height / 2, t * 1.5, 1, 1, 1 - t * 0.6);
        return;
      }
      if (o.burning) {
        r.draw(img, x, y);
        r.glow(o.x, o.y - img.height * 0.5, 24, 'rgba(255,140,60,0.55)', 0.8);
        return;
      }
      if (o.def && o.def.tall) r.shadow(o.x, o.y, img.width * 0.22, img.width * 0.09, 0.24);
    }
    r.draw(img, x, y);
  }

  drawChainArcs(r) {
    if (!this.drawArcs || this.drawArcs.length === 0) return;
    for (let i = this.drawArcs.length - 1; i >= 0; i--) {
      const a = this.drawArcs[i];
      a.life -= 1 / 60;
      if (a.life <= 0) { this.drawArcs.splice(i, 1); continue; }
      // jagged bolt between the two points
      const steps = 5;
      let px = a.x1, py = a.y1;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const nx = lerp(a.x1, a.x2, t) + rnd(-3, 3);
        const ny = lerp(a.y1, a.y2, t) + rnd(-3, 3);
        r.line(px, py, nx, ny, s % 2 ? P.cyberHot : P.cyber, 1, 0.9);
        px = nx; py = ny;
      }
    }
  }

  drawFlyers(r) {
    for (const f of this.flyers) {
      const t = clamp(f.t / f.dur, 0, 1);
      const x = lerp(f.x0, f.x1, t);
      const y = lerp(f.y0, f.y1, t) - Math.sin(t * Math.PI) * 22;
      const icon = itemIcon(f.item);
      r.drawT(icon, x, y, t * 6, 1, 1, 1);
      r.glow(x, y, 10, 'rgba(240,192,90,0.5)', 0.6);
    }
  }

  /** Arrows at the screen edge pointing at things that matter off-screen. */
  drawSpawnWarnings(r) {
    const d = this.director;
    if (d.phase !== PHASE.PREP || d.timer > 12) return;
    const frames = warnMarkerFrames();
    const img = frames[Math.floor(this.time * 8) % frames.length];
    for (const pt of d.spawnPoints) {
      const sx = pt.x - r.camera.ox, sy = pt.y - r.camera.oy;
      const cx = clamp(sx, 10, VIEW_W - 10), cy = clamp(sy, 20, VIEW_H - 30);
      r.ctx.drawImage(img, Math.round(cx - 8), Math.round(cy - 8));
    }
  }

  // --- screens -------------------------------------------------------------
  drawTitle(r, ctx) {
    const cx = VIEW_W / 2;
    const cam = this.r.camera;
    const c = this.campaign.marks.cage;

    // cracks spreading across the pane you keep hitting
    this.drawCageCracks(r, ctx, c);

    // The facility only dims behind the title column: the tank stays lit.
    const gx = Math.round(VIEW_W * 0.36);
    const grad = ctx.createLinearGradient(gx, 0, VIEW_W, 0);
    grad.addColorStop(0, 'rgba(4,9,11,0)');
    grad.addColorStop(0.35, 'rgba(4,9,11,0.72)');
    grad.addColorStop(1, 'rgba(4,9,11,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(gx, 0, VIEW_W - gx, VIEW_H);
    r.uiRect(0, 0, VIEW_W, VIEW_H, 'rgba(4,9,11,0.14)');
    this.drawTankFrame(r, ctx);
    const logo = nestLogoSprite(1);
    ctx.globalAlpha = 0.14;
    ctx.drawImage(logo, Math.round(VIEW_W - logo.width - 6), 6);
    ctx.globalAlpha = 1;

    // --- title plate -------------------------------------------------------
    const narrow = VIEW_W < 380;
    const tx = narrow ? cx : Math.round(VIEW_W * 0.62);
    const align = 'center';
    const ts = narrow ? 3 : 4;
    let y = Math.round(VIEW_H * 0.13);
    drawText(ctx, 'FERRET', tx, y, P.furCream, { align, scale: ts, shadow: '#000' });
    y += ts * 8 + 3;
    drawText(ctx, 'FIGHTS BACK', tx, y, P.cyber, { align, scale: ts - 1, shadow: '#000' });
    y += (ts - 1) * 8 + 6;
    drawText(ctx, 'SUBJECT 41  -  MUSTELA NIGRIPES  -  DAY 612', tx, y, P.nestTealHi, { align, shadow: true });

    // --- menu --------------------------------------------------------------
    y += 16;
    const bw = Math.min(206, VIEW_W - 24);
    const bx = Math.round(tx - bw / 2);
    this.menu.rects.length = 0;
    this.menu.items.forEach((it, i) => {
      const on = i === this.menu.sel;
      const by = y + i * 26;
      this.menu.rects.push({ x: bx, y: by, w: bw, h: 22 });
      r.uiRect(bx, by, bw, 22, on ? 'rgba(20,44,44,0.92)' : 'rgba(8,16,18,0.82)');
      r.uiStroke(bx, by, bw, 22, on ? P.cyber : '#2b3c40');
      if (on) {
        r.uiRect(bx, by, 2, 22, P.cyber);
        const pulse = 0.5 + Math.sin(this.titleT * 8) * 0.5;
        ctx.globalAlpha = 0.25 + pulse * 0.2;
        r.uiRect(bx + 2, by + 1, bw - 3, 20, P.cyberDim);
        ctx.globalAlpha = 1;
      }
      drawText(ctx, it.label, bx + 8, by + 4, on ? P.ui : P.uiDim, { shadow: true });
      drawText(ctx, it.sub, bx + 8, by + 13, on ? '#bfe6ec' : '#5a6c70', { shadow: '#000' });
    });
    y += this.menu.items.length * 26 + 4;

    const hint = this.input.touch.visible ? 'TAP TO CHOOSE' : 'W / S  -  ENTER OR E';
    const blink = Math.floor(this.titleT * 2) % 2 === 0;
    if (blink) drawText(ctx, hint, tx, y + 2, P.uiWarn, { align, shadow: true });

    // --- controls, low and quiet ------------------------------------------
    const controls = this.input.touch.visible ? [
      'LEFT THUMB MOVES     RIGHT THUMB AIMS AND FIRES',
      'BUTTONS: GATHER  DASH  CLAW  PARRY  CRAFT  ORDERS',
    ] : [
      'WASD MOVE   MOUSE AIM/FIRE   SPACE DASH   X CLAW',
      'E GATHER/TALK   SHIFT FOCUS   Q SCAN   R WATER   F EAT',
      'TAB CRAFT   C CHIPS   M MAP   T ORDERS   RMB OVERCLOCK',
    ];
    const cy0 = VIEW_H - 8 - controls.length * 9;
    controls.forEach((l, i) => drawText(ctx, l, cx, cy0 + i * 9, '#46585c', { align: 'center', shadow: true }));
    drawText(ctx, 'SEED ' + this.seed, VIEW_W - 5, VIEW_H - 9, '#3a4a4e', { align: 'right' });
  }

  /** A hard specular edge around the tank, so it reads as a glass box. */
  drawTankFrame(r, ctx) {
    const cam = this.r.camera;
    const c = this.campaign.marks.cage;
    const x = (c.tx - 3) * TS - cam.ox, y = (c.ty - 3) * TS - cam.oy;
    const w = 7 * TS, h = 7 * TS;
    ctx.globalAlpha = 0.5;
    r.uiStroke(x, y, w, h, '#9fd8e2');
    ctx.globalAlpha = 0.22;
    r.uiStroke(x - 1, y - 1, w + 2, h + 2, '#5f939c');
    ctx.globalAlpha = 0.16;
    r.uiRect(x + 2, y + 2, w - 4, 3, '#dff2f5');
    ctx.globalAlpha = 1;
    const label = 'TANK 41';
    drawText(ctx, label, Math.round(x + w / 2), Math.round(y - 9), P.nestTealHi, { align: 'center', shadow: '#000' });
  }

  /**
   * The pane, drawn in screen space over the world: a fracture web that grows
   * by one branch every time the ferret hits it.
   */
  drawCageCracks(r, ctx, c) {
    const cam = this.r.camera;
    const px = (c.tx + 3) * TS + TS / 2 - cam.ox;
    const py = c.y - cam.oy;
    const n = this.pound.cracks + 2;   // it was never pristine

    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const a = -1.9 + i * 0.62;
      const len = 16 + (i % 3) * 11;
      ctx.strokeStyle = i % 2 ? 'rgba(233,250,253,0.95)' : 'rgba(179,229,234,0.75)';
      ctx.beginPath();
      let x = px, y = py;
      ctx.moveTo(x + 0.5, y + 0.5);
      for (let k = 1; k <= 4; k++) {
        const wob = Math.sin(i * 3.1 + k * 2.3) * 4;
        x = px + Math.cos(a) * (len * k / 4) + wob;
        y = py + Math.sin(a) * (len * k / 4) * 1.15 + Math.cos(i + k) * 3;
        ctx.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }
    ctx.restore();

    if (this.pound.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.pound.flash * 0.6;
      r.uiRect(px - 10, py - 12, 20, 24, '#bfe6ec');
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawPause(r, ctx) {
    r.uiRect(0, 0, VIEW_W, VIEW_H, 'rgba(6,10,8,0.72)');
    drawText(ctx, 'PAUSED', VIEW_W / 2, 100, P.ui, { align: 'center', scale: 3, shadow: '#000' });
    drawText(ctx, 'ESC TO RESUME    M TO MUTE', VIEW_W / 2, 128, P.uiDim, { align: 'center' });
    const s = this.stats;
    const rows = [
      'WAVE REACHED: ' + this.director.wave,
      'KILLS: ' + s.kills,
      'CHIPS STOLEN: ' + this.player.chipsStolen,
      'REQUESTS COMPLETED: ' + s.questsDone,
      'ANIMALS RESCUED: ' + this.player.animalsRescued,
      'TREES LOST: ' + s.treesLost,
    ];
    rows.forEach((t, i) => drawText(ctx, t, VIEW_W / 2, 150 + i * 10, P.uiDim, { align: 'center' }));
  }

  drawDeath(r, ctx) {
    const a = clamp(this.deathT / 1.4, 0, 1);
    r.uiRect(0, 0, VIEW_W, VIEW_H, `rgba(30,6,6,${0.7 * a})`);
    drawText(ctx, 'YOU FALL', VIEW_W / 2, 96, P.hpRed, { align: 'center', scale: 3, shadow: '#000' });
    drawText(ctx, 'THE DEN PULLS YOU BACK IN', VIEW_W / 2, 124, P.uiDim, { align: 'center' });
    if (this.deathT > 2.5 && Math.floor(this.time * 2) % 2 === 0) {
      drawText(ctx, 'PRESS ANY KEY TO WAKE UP', VIEW_W / 2, 150, P.ui, { align: 'center', shadow: true });
    }
  }

  drawVictory(r, ctx) {
    const a = clamp(this.victoryT / 1.6, 0, 1);
    r.uiRect(0, 0, VIEW_W, VIEW_H, `rgba(8,20,14,${0.72 * a})`);
    drawText(ctx, 'THE NEST IS BROKEN', VIEW_W / 2, 60, P.uiGood, { align: 'center', scale: 3, shadow: '#000' });
    const s = this.stats;
    const alive = this.wildlife.animals.length;
    const rows = [
      'WAVES HELD: ' + this.director.wave,
      'MACHINES DESTROYED: ' + s.kills,
      'CHIPS TORN OUT: ' + this.player.chipsStolen,
      'ANIMALS CARRIED TO SAFETY: ' + this.player.animalsRescued,
      'TREES LOST TO THE BURN: ' + s.treesLost,
      'STILL LIVING IN THE BASIN: ' + alive,
      'FRIENDS WHO STOOD WITH YOU: ' + this.npcs.filter(n => n.recruited).length,
    ];
    rows.forEach((t, i) => drawText(ctx, t, VIEW_W / 2, 96 + i * 11, P.ui, { align: 'center', shadow: true }));
    if (this.victoryT > 2.5 && Math.floor(this.time * 2) % 2 === 0) {
      drawText(ctx, 'PRESS ANY KEY - THEY ALWAYS SEND MORE', VIEW_W / 2, 190, P.uiWarn, { align: 'center', shadow: true });
    }
  }
}
