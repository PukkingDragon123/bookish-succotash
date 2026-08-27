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
  // the first duct: your tank block to the corridor, if you can find the grille
  VENT(hx0 + 2, cageY + 4, 20, 34, 'block C to the service run');

  // --- the course ---------------------------------------------------------
  // A testing maze east of the block. You run it for food, and it is tiring.
  const cx0 = 46, cy0 = 6, cx1 = 88, cy1 = 30;
  room(w, cx0, cy0, cx1, cy1, T.LAB_TEAL);
  doorway(w, hx1, cageY - 1, cx0, cageY + 1, T.LAB_FLOOR);
  marks.courseStart = { x: (cx0 + 3) * TS, y: cageY * TS };

  // baffles to weave through
  const gates = [];
  for (let i = 0; i < 6; i++) {
    const gx = cx0 + 5 + i * 6;
    const gapY = cy0 + 4 + ((i * 7) % 14);
    for (let ty = cy0 + 1; ty <= cy1 - 1; ty++) {
      if (Math.abs(ty - gapY) <= 2) continue;
      w.tiles[w.idx(gx, ty)] = T.LAB_WALL;
    }
    P(gx + 1, gapY + 3, 'hurdle');
    gates.push({ x: gx * TS, y: gapY * TS });
  }
  marks.gates = gates;
  // the dish at the far end: the entire point of the exercise
  const dishX = cx1 - 3, dishY = Math.floor((cy0 + cy1) / 2);
  P(dishX, dishY, 'dish');
  marks.dish = { x: dishX * TS + TS / 2, y: dishY * TS + TS / 2 };
  // the gallery: they watch this from behind glass and write it down
  for (let i = 0; i < 4; i++) P(cx0 + 6 + i * 8, cy0 + 1, 'terminal');
  P(cx0 + 2, cy0 + 2, 'signWay');
  P(cx1 - 2, cy1 - 3, 'drain');
  P(cx0 + 14, cy1 - 2, 'drain');
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
