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
  const P = (x, y, kind, extra = {}) =>
    w.props.push(Object.assign({ x: x * TS + TS / 2, y: y * TS + TS, kind, type: 'labprop', variant: (rng() * 4) | 0 }, extra));

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

  // --- corridor south -----------------------------------------------------
  const corrY0 = 32, corrY1 = 38;
  room(w, 6, corrY0, 88, corrY1, T.LAB_FLOOR);
  doorway(w, cageX - 1, hy1, cageX + 1, corrY0, T.LAB_FLOOR);
  doorway(w, 70, cy1, 72, corrY0, T.LAB_FLOOR);
  P(24, corrY1 - 1, 'labDoorOpen');
  P(52, corrY0 + 2, 'locker');
  P(56, corrY0 + 2, 'locker');
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
  marks.security = { x: 64 * TS, y: 52 * TS };

  // --- roof access & helipad ---------------------------------------------
  const px0 = 52, py0 = 64, px1 = 84, py1 = 72;
  room(w, px0, py0, px1, py1, T.LAB_PAD);
  doorway(w, 64, gy1, 66, py0, T.LAB_FLOOR);
  marks.helipad = { x: 68 * TS, y: 68 * TS };

  w.base.set(w.tiles);
  w.den = { x: marks.cage.x, y: marks.cage.y, tx: marks.cage.tx, ty: marks.cage.ty };
  w.npcSpots = [];
  w.rebuildGrid();
  return marks;
}
