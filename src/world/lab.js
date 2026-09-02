// The Les Nest facility. Hand-laid rather than noise-generated: the story needs
// to know exactly where your tank is, where the beaver's tank is, and which
// corridor the guard comes down.
//
// It fills the same World object the forest uses, so collision, chunk rendering
// and the draw list all work unchanged.

import { T, TS } from './tiles.js';
import { makeRng } from '../engine/rng.js';

export const LAB_W = 96, LAB_H = 74;

function room(w, x0, y0, x1, y1, floor = T.LAB_FLOOR) {
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!w.inBounds(tx, ty)) continue;
      const edge = tx === x0 || tx === x1 || ty === y0 || ty === y1;
      w.tiles[w.idx(tx, ty)] = edge ? T.LAB_WALL : floor;
    }
  }
}

function fill(w, x0, y0, x1, y1, id) {
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (w.inBounds(tx, ty)) w.tiles[w.idx(tx, ty)] = id;
    }
  }
}

/** Carve a doorway through a wall run. */
function doorway(w, x0, y0, x1, y1, floor = T.LAB_FLOOR) {
  fill(w, x0, y0, x1, y1, floor);
}

/**
 * Builds the whole facility into `world` and returns the landmarks the
 * campaign script needs to place actors and cameras.
 */
export function buildLab(world, seed = 1) {
  const rng = makeRng(seed ^ 0x1ab);
  const w = world;
  w.tiles.fill(T.LAB_WALL);
  w.props.length = 0;
  w.decor.length = 0;
  w.nodes.length = 0;
  w.geysers.length = 0;

  const marks = {};
  const P = (x, y, kind, extra = {}) => {
    const o = Object.assign(
      { x: x * TS + TS / 2, y: y * TS + TS, kind, type: 'labprop', variant: (rng() * 4) | 0 }, extra);
    w.props.push(o);
    return o;
  };
  // Something you can walk up to and press E on. `use` says what happens.
  const I = (x, y, kind, use, label, extra = {}) =>
    P(x, y, kind, Object.assign({ use, label, interactive: true }, extra));
  marks.vents = [];
  marks.terminals = [];
  // A duct link. Ferrets are the shape of a pipe; the building is full of
  // pipes; somebody at Les Nest did not think that through.
  const VENT = (ax, ay, bx, by, note) => {
    const a = P(ax, ay, 'vent', { vent: marks.vents.length, end: 'a', interactive: true, use: 'vent', label: 'CRAWL INTO THE DUCT' });
    const b = P(bx, by, 'vent', { vent: marks.vents.length, end: 'b', interactive: true, use: 'vent', label: 'CRAWL INTO THE DUCT' });
    marks.vents.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, note, open: false, propA: a, propB: b });
  };

  // --- holding block (start) ---------------------------------------------
  // A long room of tanks. Yours is third from the left.
  const hx0 = 6, hy0 = 6, hx1 = 44, hy1 = 26;
  room(w, hx0, hy0, hx1, hy1, T.LAB_FLOOR);
  fill(w, hx0 + 1, hy1 - 4, hx1 - 1, hy1 - 1, T.LAB_GRATE);

  // your tank: a glass box you can actually be inside
  const cageX = 14, cageY = 12;
  room(w, cageX - 3, cageY - 3, cageX + 3, cageY + 3, T.LAB_DARK);
  for (let tx = cageX - 3; tx <= cageX + 3; tx++) {
    w.tiles[w.idx(tx, cageY - 3)] = T.LAB_GLASS;
    w.tiles[w.idx(tx, cageY + 3)] = T.LAB_GLASS;
  }
  for (let ty = cageY - 3; ty <= cageY + 3; ty++) {
    w.tiles[w.idx(cageX - 3, ty)] = T.LAB_GLASS;
    w.tiles[w.idx(cageX + 3, ty)] = T.LAB_GLASS;
  }
  marks.cage = { x: cageX * TS + TS / 2, y: cageY * TS + TS / 2, tx: cageX, ty: cageY };
  marks.cageGlass = { tx: cageX + 3, ty: cageY };   // the pane you break

  // the beaver's tank, one over
  const bx = cageX + 9, by = cageY;
  room(w, bx - 3, by - 3, bx + 3, by + 3, T.LAB_DARK);
  for (let tx = bx - 3; tx <= bx + 3; tx++) {
    w.tiles[w.idx(tx, by - 3)] = T.LAB_GLASS;
    w.tiles[w.idx(tx, by + 3)] = T.LAB_GLASS;
  }
  for (let ty = by - 3; ty <= by + 3; ty++) {
    w.tiles[w.idx(bx - 3, ty)] = T.LAB_GLASS;
    w.tiles[w.idx(bx + 3, ty)] = T.LAB_GLASS;
  }
  marks.beaverCage = { x: bx * TS + TS / 2, y: by * TS + TS / 2, tx: bx, ty: by };

  // more tanks along the back wall, occupied and otherwise
  for (let i = 0; i < 5; i++) {
    const tx = 28 + i * 3;
    P(tx, hy0 + 5, 'vat');
  }
  P(hx0 + 3, hy1 - 6, 'console');
  P(hx0 + 8, hy1 - 6, 'console');
  P(hx1 - 5, hy0 + 3, 'banner');
  // the room you actually live in, dressed
  P(hx0 + 2, hy0 + 2, 'pipes');
  P(hx0 + 14, hy0 + 1, 'pipes');
  P(hx1 - 12, hy1 - 3, 'pipes');
  P(hx0 + 6, hy0 + 3, 'signHazard');
  P(hx0 + 18, hy1 - 2, 'drain');
  P(hx1 - 8, hy1 - 2, 'drain');
  P(hx0 + 20, hy1 - 6, 'mopBucket');
  P(hx0 + 12, hy0 + 5, 'specShelf');
  I(hx0 + 5, hy1 - 6, 'terminal', 'read', 'READ THE TERMINAL', {
    text: 'SUBJECT 41 - DAY 612\nAPPETITE: NORMAL. AGGRESSION: RISING.\nOPTIC INTEGRATION AT 96%. NO REJECTION.\nRECOMMEND: CONTINUE. VANE HAS ASKED FOR WEEKLY FIGURES.',
  });
  I(hx0 + 16, hy0 + 5, 'jar', 'jar', 'LOOK AT THE JAR', {
    text: 'SUBJECT 12. MUSTELA NIGRIPES. TERMINATED DAY 40.\nThe label is printed. They print them in advance.',
  });
  I(hx0 + 25, hy0 + 5, 'jar', 'jar', 'LOOK AT THE JAR', {
    text: 'SUBJECT 29. The tag says FAILED OPTIC. It is curled up\nthe way you curl up when the lights go out.',
  });
  // --- the observation room ------------------------------------------------
  //
  // A cage on its own is a prop. What makes it containment is the room on the
  // other side of the glass with the kettle in it — people come in, look at
  // you for a while, write something down, and go home. The whole first
  // chapter is you watching them through a pane you cannot break, and the
  // building is built so that you can see them the entire time.
  const obX0 = hx0 + 1, obY0 = hy1 - 3, obX1 = hx0 + 22, obY1 = hy1 - 1;
  fill(w, obX0, obY0, obX1, obY1, T.LAB_TEAL);
  for (let tx = obX0; tx <= obX1; tx++) w.tiles[w.idx(tx, obY0)] = T.LAB_GLASS;
  // the door into it is card-locked, and the card is not in this room
  doorway(w, obX1 - 6, obY0, obX1 - 5, obY0, T.LAB_TEAL);
  marks.observation = { x: (obX0 + 10) * TS, y: (obY0 + 2) * TS };
  for (let i = 0; i < 4; i++) P(obX0 + 2 + i * 5, obY0 + 2, 'console');
  P(obX0 + 18, obY0 + 2, 'coffee');
  P(obX0 + 20, obY0 + 1, 'clipboard');
  marks.obsSeats = [];
  for (let i = 0; i < 3; i++) {
    marks.obsSeats.push({ x: (obX0 + 3 + i * 5) * TS + TS / 2, y: (obY0 + 2) * TS + TS });
  }
  I(obX0 + 6, obY0 + 2, 'terminal', 'read', 'READ THE OBSERVATION LOG', {
    text: 'OBSERVATION - BLOCK C\n0840 TOUR GROUP 7 (4 PAX) ESCORTED IN.\n0902 GROUP EXITS. HEADCOUNT 3. LOGGED FOR REVIEW.\n0903 REVIEW CLOSED BY V. NO FURTHER ACTION.',
  });

  // --- card-locked doors ----------------------------------------------------
  // Three of them, and one card. The card is on the man who did not leave.
  marks.doors = [];
  const CARDDOOR = (tx, ty, horiz, label, note) => {
    const d = P(tx, ty, 'cardDoor', {
      interactive: true, use: 'carddoor', label: label || 'LOCKED - CARD READER',
      horiz, locked: true, note, doorIndex: marks.doors.length,
    });
    // the door itself is solid until it opens
    if (horiz) { w.tiles[w.idx(tx, ty)] = T.LAB_WALL; w.tiles[w.idx(tx + 1, ty)] = T.LAB_WALL; }
    else { w.tiles[w.idx(tx, ty)] = T.LAB_WALL; w.tiles[w.idx(tx, ty + 1)] = T.LAB_WALL; }
    marks.doors.push({ tx, ty, horiz, prop: d, open: false, note });
    return d;
  };
  marks.CARDDOOR = CARDDOOR;

  // the first duct: your tank block to the corridor, if you can find the grille
  VENT(hx0 + 2, cageY + 4, 20, 34, 'block C to the service run');

  // --- the course ---------------------------------------------------------
  //
  // Not a corridor with six doorways in it. Five sections, each testing a
  // different thing, laid west to east: weave, shock plates, shutters, the
  // coolant channel, and the sweep arms. Every section has a slow way through
  // that is always open and a fast way through that will hurt you, because the
  // whole exercise is Vane finding out which one you take when you are hungry.
  //
  // Nothing in here can kill you. It costs you the one currency the chapter
  // actually runs on, which is how tired you are.
  const cx0 = 46, cy0 = 6, cx1 = 93, cy1 = 30;
  room(w, cx0, cy0, cx1, cy1, T.LAB_TEAL);
  doorway(w, hx1, cageY - 1, cx0, cageY + 1, T.LAB_FLOOR);
  marks.courseStart = { x: (cx0 + 3) * TS, y: cageY * TS };
  const iy0 = cy0 + 1, iy1 = cy1 - 1;                  // walkable rows

  const gates = [];
  const gate = (gx, gapY) => gates.push({ x: gx * TS, y: gapY * TS });
  // A baffle with a gap in it. Nothing else in the course is ever fully solid.
  const baffle = (gx, gapY, half = 2) => {
    for (let ty = iy0; ty <= iy1; ty++) {
      if (Math.abs(ty - gapY) <= half) continue;
      w.tiles[w.idx(gx, ty)] = T.LAB_WALL;
    }
  };

  // --- 1. the weave: gaps that alternate top and bottom -------------------
  const weave = [[50, 9], [53, 25], [56, 11], [59, 24]];
  for (const [gx, gy] of weave) {
    baffle(gx, gy);
    P(gx + 1, gy + 3, 'hurdle');
    P(gx + 1, gy - 3, 'hurdle');
    gate(gx, gy);
  }
  marks.hurdles = [];
  for (const [gx, gy] of weave) marks.hurdles.push({ x: (gx + 1) * TS, y: gy * TS });

  // --- 2. the shock plates ------------------------------------------------
  //
  // Four columns of floor panels that go live on a cycle. They are laid so
  // that at any moment there is a way through — you just have to read it while
  // you are running, and the alternative is to stand still and be timed for it.
  marks.plates = [];
  for (let c = 0; c < 4; c++) {
    const px2 = 59 + c * 3;
    for (let k = 0; k < 4; k++) {
      const py2 = iy0 + 2 + k * 6;
      marks.plates.push({ tx: px2, ty: py2, w: 2, h: 4, phase: (c * 0.27 + k * 0.5) % 1 });
    }
  }
  gate(64, 18);

  // --- 3. the shutters ----------------------------------------------------
  //
  // Slam down across the top two thirds on a cycle. The bottom third is never
  // blocked, so there is always a route — it is just the long one, and it has
  // hurdles in it.
  marks.shutters = [];
  for (let i = 0; i < 3; i++) {
    const sx = 72 + i * 4;
    marks.shutters.push({ tx: sx, y0: iy0, y1: iy1 - 8, phase: i * 0.33, open: true });
    for (let ty = iy1 - 7; ty <= iy1; ty++) w.tiles[w.idx(sx, ty)] = T.LAB_TEAL;
    P(sx + 1, iy1 - 2, 'hurdle');
  }
  gate(76, 12);

  // --- 4. the coolant channel ---------------------------------------------
  // Ankle deep and freezing, with posts in it to break your line.
  for (let ty = iy0; ty <= iy1; ty++) {
    for (let tx = 82; tx <= 86; tx++) w.tiles[w.idx(tx, ty)] = T.LAB_WET;
  }
  for (let i = 0; i < 7; i++) {
    const ptx = 83 + (i % 3) * 2, pty = iy0 + 1 + i * 3;
    if (pty > iy1 - 1) continue;
    w.tiles[w.idx(ptx, pty)] = T.LAB_WALL;
  }
  gate(84, 18);

  // --- 5. the sweep arms --------------------------------------------------
  // Two bars on a hinge, tracking up and down the last straight. Walk into one
  // and it puts you on the floor; it does not stop you finishing.
  marks.sweeps = [
    { x: 88 * TS, y0: (iy0 + 1) * TS, y1: (iy1 - 1) * TS, len: 40, phase: 0, speed: 0.62 },
    { x: 90 * TS, y0: (iy0 + 1) * TS, y1: (iy1 - 1) * TS, len: 40, phase: 0.5, speed: 0.48 },
  ];

  marks.gates = gates;
  // the dish at the far end: the entire point of the exercise
  const dishX = cx1 - 1, dishY = Math.floor((cy0 + cy1) / 2);
  P(dishX, dishY, 'dish');
  marks.dish = { x: dishX * TS + TS / 2, y: dishY * TS + TS / 2 };
  // the gallery: they watch this from behind glass and write it down
  for (let i = 0; i < 5; i++) P(cx0 + 6 + i * 8, cy0 + 1, 'terminal');
  P(cx0 + 2, cy0 + 2, 'signWay');
  P(cx1 - 2, cy1 - 3, 'drain');
  P(cx0 + 14, cy1 - 2, 'drain');
  P(60, cy1 - 2, 'signHazard');
  P(74, cy0 + 2, 'signHazard');
  P(83, cy1 - 2, 'drain');
  I(cx0 + 3, cy1 - 3, 'terminal', 'read', 'READ THE TERMINAL', {
    text: 'COURSE TIMES, SUBJECT 41\nDAY 604: 41s.  DAY 607: 38s.  DAY 610: 36s.\nDAY 611: 51s. WITHHELD FOOD. DAY 612: PENDING.',
  });
  // second duct: the far end of the course into the security wing, which is
  // the whole reason to bother running it well
  VENT(cx1 - 2, cy0 + 2, 78, 44, 'course gallery to security');

  // --- corridor south -----------------------------------------------------
  const corrY0 = 32, corrY1 = 38;
  room(w, 6, corrY0, 88, corrY1, T.LAB_FLOOR);
  doorway(w, cageX - 1, hy1, cageX + 1, corrY0, T.LAB_FLOOR);
  doorway(w, 70, cy1, 72, corrY0, T.LAB_FLOOR);
  P(24, corrY1 - 1, 'labDoorOpen');
  P(52, corrY0 + 2, 'locker');
  P(56, corrY0 + 2, 'locker');
  P(12, corrY0 + 1, 'pipes');
  P(30, corrY0 + 1, 'pipes');
  P(46, corrY0 + 1, 'pipes');
  P(64, corrY0 + 1, 'pipes');
  P(80, corrY0 + 1, 'pipes');
  P(18, corrY1 - 1, 'signWay');
  P(44, corrY1 - 1, 'signWay');
  P(70, corrY0 + 2, 'signHazard');
  P(36, corrY1 - 1, 'drain');
  P(60, corrY1 - 1, 'drain');
  P(84, corrY0 + 2, 'mopBucket');
  I(54, corrY0 + 2, 'locker', 'locker', 'FORCE THE LOCKER', { loot: 'ammo' });
  I(58, corrY0 + 2, 'locker', 'locker', 'FORCE THE LOCKER', { loot: 'meds' });
  I(34, corrY0 + 2, 'terminal', 'read', 'READ THE TERMINAL', {
    text: 'FACILITY NOTICE\nDUCTWORK ACCESS PANELS ARE TO REMAIN SEALED.\nTHIS IS THE THIRD NOTICE. - FACILITIES',
  });
  marks.corridor = { x: 40 * TS, y: 35 * TS };

  // --- the plant room -------------------------------------------------------
  //
  // A dead-end off the corridor with a card reader on it. This is where the
  // fourth visitor ended up: he took a wrong turn off the tour looking for a
  // toilet, the door shut behind him, and the headcount that would have caught
  // it was closed by Vane the same morning. He has been in here since.
  const pvx0 = 74, pvy0 = 40, pvx1 = 86, pvy1 = 50;
  room(w, pvx0, pvy0, pvx1, pvy1, T.LAB_DARK);
  doorway(w, 79, corrY1, 80, pvy0, T.LAB_DARK);
  CARDDOOR(79, pvy0, true, 'CARD READER  -  RED', 'plant room');
  marks.plantRoom = { x: 80 * TS, y: 45 * TS };
  P(pvx0 + 2, pvy0 + 3, 'pipes');
  P(pvx1 - 3, pvy0 + 2, 'pipes');
  P(pvx0 + 4, pvy1 - 2, 'mopBucket');
  P(pvx1 - 2, pvy1 - 3, 'labCrate');
  // him, and the badge that opens everything he could not open
  marks.visitor = { x: (pvx0 + 6) * TS, y: (pvy1 - 3) * TS };
  I(pvx0 + 6, pvy1 - 3, 'lanyard', 'lanyard', 'TAKE THE BADGE', {
    text: 'VISITOR 0417. DAY PASS. EXPIRED 572 DAYS AGO.\nThe photograph is a man smiling in a car park.',
  });
  I(pvx0 + 9, pvy0 + 3, 'terminal', 'read', 'READ THE PANEL', {
    text: 'PLANT ROOM 4 - ACCESS LOG\nIN  0851 VISITOR 0417\nOUT --:--\nDOOR CYCLED 1,206 TIMES FROM THE CORRIDOR SIDE.',
  });
  // The way in is the duct, because the door is the whole point: he could not
  // fit through this and you can, and that is the only reason the badge is
  // still in here to be found.
  VENT(pvx0 + 2, pvy0 + 2, 68, corrY0 + 2, 'service run to plant room 4');

  // --- the store ------------------------------------------------------------
  // A second red reader, so the badge keeps paying after it has let you out.
  const stx0 = 46, sty0 = 40, stx1 = 58, sty1 = 48;
  room(w, stx0, sty0, stx1, sty1, T.LAB_FLOOR);
  doorway(w, 51, corrY1, 52, sty0, T.LAB_FLOOR);
  CARDDOOR(51, sty0, true, 'CARD READER  -  RED', 'bonded store');
  marks.store = { x: 52 * TS, y: 44 * TS };
  P(stx0 + 2, sty0 + 2, 'labCrate');
  P(stx0 + 5, sty0 + 2, 'labCrate');
  P(stx1 - 3, sty1 - 2, 'specShelf');
  I(stx0 + 3, sty1 - 2, 'locker', 'locker', 'FORCE THE LOCKER', { loot: 'ammo' });
  I(stx0 + 7, sty1 - 2, 'locker', 'locker', 'FORCE THE LOCKER', { loot: 'meds' });
  I(stx1 - 2, sty0 + 2, 'terminal', 'read', 'READ THE MANIFEST', {
    text: 'BONDED STORE - CONTROLLED ITEMS\nSIGNED OUT BY V. VANE: 41 ITEMS.\nRETURNED: 0.\nTHIS IS A REMINDER, NOT AN ACCUSATION. - STORES',
  });

  // --- surgery ------------------------------------------------------------
  const sx0 = 10, sy0 = 42, sx1 = 40, sy1 = 62;
  room(w, sx0, sy0, sx1, sy1, T.LAB_FLOOR);
  doorway(w, 20, corrY1, 22, sy0, T.LAB_FLOOR);
  P(20, 50, 'opTable');
  P(28, 50, 'opTable');
  P(14, 46, 'console');
  P(34, 46, 'console');
  P(34, 58, 'labCrate');
  P(16, 58, 'labCrate');
  // the rest of it, which is worse than the tables
  P(24, 46, 'gurney');
  P(30, 56, 'gurney');
  P(18, 47, 'ivStand');
  P(26, 47, 'ivStand');
  P(31, 51, 'ivStand');
  P(12, 52, 'specShelf');
  P(37, 52, 'specShelf');
  P(22, 55, 'drain');
  P(27, 55, 'drain');
  P(15, 44, 'signHazard');
  P(36, 61, 'incinerator');
  P(12, 60, 'pipes');
  P(30, 44, 'pipes');
  I(16, 46, 'terminal', 'read', 'READ THE TERMINAL', {
    text: 'PROCEDURE LOG - SUBJECT 41 - DAY 88\nOPTIC SEATED. SUBJECT CONSCIOUS THROUGHOUT PER PROTOCOL.\nANAESTHESIA INTERFERES WITH NERVE MAPPING.\nDURATION 6h 20m. SUBJECT DID NOT STOP.',
  });
  I(33, 47, 'jar', 'jar', 'LOOK AT THE JAR', {
    text: 'It is an eye. It is not yours. Yours is still in your head,\nbehind the one they put in front of it.',
  });
  // third duct: surgery to the roof stair, the escape a technician would use
  VENT(11, 44, 84, 46, 'surgery to the east stair');
  marks.surgery = { x: 24 * TS, y: 52 * TS };
  // this is where they did it to you
  for (let i = 0; i < 26; i++) {
    const tx = 18 + ((i * 5) % 12), ty = 48 + ((i * 3) % 6);
    w.tiles[w.idx(tx, ty)] = T.LAB_BLOOD;
  }

  // --- security wing ------------------------------------------------------
  const gx0 = 46, gy0 = 42, gx1 = 82, gy1 = 62;
  room(w, gx0, gy0, gx1, gy1, T.LAB_TEAL);
  doorway(w, 60, corrY1, 62, gy0, T.LAB_FLOOR);
  P(50, 46, 'locker'); P(54, 46, 'locker'); P(58, 46, 'locker');
  P(70, 50, 'console');
  P(76, 58, 'labCrate'); P(72, 58, 'labCrate');
  P(gx1 - 4, gy0 + 4, 'banner');
  P(62, 45, 'pipes');
  P(50, 60, 'pipes');
  P(66, 60, 'drain');
  P(56, 52, 'drain');
  P(48, 58, 'mopBucket');
  P(74, 45, 'signHazard');
  P(60, 61, 'signWay');
  I(52, 46, 'locker', 'locker', 'FORCE THE LOCKER', { loot: 'ammo' });
  I(56, 46, 'locker', 'locker', 'FORCE THE LOCKER', { loot: 'scrap' });
  I(68, 50, 'terminal', 'read', 'READ THE TERMINAL', {
    text: 'SECURITY BULLETIN\nIF THE ANIMAL IN BLOCK C IS OUT, IT WILL NOT RUN\nFOR AN EXIT. IT WILL COME HERE. - A. VANE',
  });
  marks.security = { x: 64 * TS, y: 52 * TS };

  // --- roof access & helipad ---------------------------------------------
  const px0 = 52, py0 = 64, px1 = 84, py1 = 72;
  room(w, px0, py0, px1, py1, T.LAB_PAD);
  doorway(w, 64, gy1, 66, py0, T.LAB_FLOOR);
  marks.helipad = { x: 68 * TS, y: 68 * TS };
  P(54, py0 + 2, 'signWay');
  P(82, py0 + 2, 'signHazard');
  P(58, py1 - 1, 'pipes');
  P(78, py1 - 1, 'drain');
  marks.props = w.props;

  w.base.set(w.tiles);
  w.den = { x: marks.cage.x, y: marks.cage.y, tx: marks.cage.tx, ty: marks.cage.ty };
  w.npcSpots = [];
  w.rebuildGrid();
  return marks;
}
