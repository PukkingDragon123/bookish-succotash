// Plays the campaign end to end in headless Chromium: walks the tutorial,
// runs the obstacle course, mashes through the escape, fights the rampage,
// flies the transport, and checks it lands in the basin.
//
//   node tools/story.mjs [--url http://localhost:8099/index.html]

import { chromium } from 'playwright';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:8099/index.html';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(url);
await page.waitForTimeout(1200);
await page.click('#startbtn');
await page.waitForTimeout(400);

// Chapters can come and go inside a single long walk, so record them from the
// page instead of hoping a poll lands on the right frame.
await page.evaluate(() => {
  window.__seen = new Set();
  setInterval(() => {
    const g = window.game;
    if (!g) return;
    window.__seen.add(g.campaign ? g.campaign.chapter : 'forest:' + g.mode);
    if (g.campaign && g.campaign.hasGun) window.__seen.add('gun');
    if (g.firstStand) window.__seen.add('stand:' + g.firstStand.phase);
  }, 100);
});
const seen = () => page.evaluate(() => [...window.__seen]);

// ---------------------------------------------------------------- helpers
const snap = () => page.evaluate(() => {
  const g = window.game, c = g.campaign;
  return {
    state: g.state, mode: g.mode, chapter: c && c.chapter, finished: c ? c.finished : null,
    objective: c && c.objective, stage: c && c.rampageStage, hasGun: c && c.hasGun,
    x: Math.round(g.player.x), y: Math.round(g.player.y), hp: Math.round(g.player.hp),
    enemies: g.enemies.length, bullets: g.bullets.count, fps: g.loop.fps,
    exhaustion: c ? Math.round(c.exhaustionPeak) : -1, gates: c && c.gatesPassed, lap: c && c.lap,
    heliHp: c && c.heli ? Math.round(c.heli.hp) : null,
    prompt: c && c.cut && c.cut.prompt ? c.cut.prompt.kind : null,
    daxDead: c && c.dax ? c.dax.dead : null,
    weapons: g.player.weapons.slice(), worldW: g.world.w,
  };
});

/** Breadth-first path through walkable tiles, computed in the page. */
const pathTo = (tx, ty) => page.evaluate(async ([gx, gy]) => {
  const g = window.game, w = g.world;
  const { isSolid, TS } = await import('/src/world/tiles.js');
  const sx = Math.floor(g.player.x / TS), sy = Math.floor(g.player.y / TS);
  const ex = Math.floor(gx / TS), ey = Math.floor(gy / TS);
  const prev = new Int32Array(w.w * w.h).fill(-1);
  const seen = new Uint8Array(w.w * w.h);
  let head = 0; const q = [sy * w.w + sx];
  seen[q[0]] = 1;
  while (head < q.length) {
    const i = q[head++]; const x = i % w.w, y = (i / w.w) | 0;
    if (x === ex && y === ey) {
      const out = []; let k = i;
      while (k !== -1) { out.push({ x: (k % w.w) * TS + TS / 2, y: ((k / w.w) | 0) * TS + TS / 2 }); k = prev[k]; }
      return out.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w.w - 1 || ny >= w.h - 1) continue;
      const j = ny * w.w + nx;
      if (seen[j] || isSolid(w.tiles[j])) continue;
      seen[j] = 1; prev[j] = i; q.push(j);
    }
  }
  return null;
}, [tx, ty]);

/** Point the mouse at a world position, so claws and shots go that way. */
async function aimAt(wx, wy) {
  const c = await page.evaluate(async ([x, y]) => {
    const g = window.game;
    const { VIEW_W, VIEW_H } = await import('/src/engine/canvas.js');
    const s = g.r.camera.toScreen(x, y);
    const rect = g.r.canvas.getBoundingClientRect();
    return {
      cx: rect.left + (s.x / VIEW_W) * rect.width,
      cy: rect.top + (s.y / VIEW_H) * rect.height,
    };
  }, [wx, wy]);
  await page.mouse.move(c.cx, c.cy);
}

let held = new Set();
async function setKeys(want) {
  for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
  for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
  held = want;
}
const release = () => setKeys(new Set());

/** Walk a BFS path, re-planning if we fall behind. Returns true on arrival. */
async function walkTo(tx, ty, budgetMs = 40000, opts = {}) {
  const t0 = Date.now();
  let path = await pathTo(tx, ty);
  if (!path) { await release(); return false; }
  let n = 0, ticks = 0, stuck = 0, lastX = 0, lastY = 0;
  while (Date.now() - t0 < budgetMs) {
    const st = await page.evaluate(() => ({
      x: window.game.player.x, y: window.game.player.y,
      block: window.game.campaign ? window.game.campaign.blockPlayer : false,
      prompt: !!(window.game.campaign && window.game.campaign.cut && window.game.campaign.cut.prompt),
    }));
    if (st.prompt && opts.mash !== false) {
      await release();
      for (let i = 0; i < 8; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(40); }
      continue;
    }
    if (st.block) { await release(); await page.waitForTimeout(150); continue; }
    if (Math.hypot(st.x - tx, st.y - ty) < (opts.within || 20)) { await release(); return true; }

    // re-plan every couple of seconds, and immediately if we stop moving
    if (Math.hypot(st.x - lastX, st.y - lastY) < 1.2) stuck++; else stuck = 0;
    lastX = st.x; lastY = st.y;
    if (++ticks % 22 === 0 || stuck === 8) {
      const fresh = await pathTo(tx, ty);
      if (fresh) { path = fresh; n = 0; }
      if (stuck === 8) { await release(); await page.keyboard.press('Space'); await page.waitForTimeout(120); }
    }

    // advance along the path to the furthest node still close by
    while (path[n + 1] && Math.hypot(st.x - path[n].x, st.y - path[n].y) < 12) n++;
    const node = path[Math.min(n + 1, path.length - 1)];
    const dx = node.x - st.x, dy = node.y - st.y;
    const want = new Set();
    if (dx > 3) want.add('KeyD'); else if (dx < -3) want.add('KeyA');
    if (dy > 3) want.add('KeyS'); else if (dy < -3) want.add('KeyW');
    if (opts.fire) want.add('KeyX');
    await setKeys(want);
    await page.waitForTimeout(80);
  }
  await release();
  return false;
}

const waitFor = async (fn, ms, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn(await snap())) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

// ---------------------------------------------------------------- the run
const t0 = await snap();
check('title starts in the lab', t0.mode === 'lab' && t0.state === 'title', `mode=${t0.mode}`);
check('title ferret has claws, not a gun', t0.weapons.join() === 'claws', t0.weapons.join());

await page.keyboard.press('Enter');           // BEGIN
await page.waitForTimeout(700);
check('story begins in the cage', (await snap()).chapter === 'cage');

// chapter 1: nudge east until the technician opens the tank
const marks = await page.evaluate(() => {
  const m = window.game.campaign.marks;
  return { cage: m.cage, dish: m.dish, corridor: m.corridor, surgery: m.surgery, security: m.security, helipad: m.helipad, glass: m.cageGlass };
});
await walkTo(marks.cage.x + 26, marks.cage.y, 26000, { within: 14 });
// The arrival scene is long and deliberate. Tap through it the way a player
// who has already seen it once would.
const tapT0 = Date.now();
while (Date.now() - tapT0 < 90000) {
  if ((await snap()).chapter !== 'cage') break;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(160);
}
const gotCourse = await waitFor(s => s.chapter === 'course', 30000, 'course');
check('cage chapter hands over to the course', gotCourse, (await snap()).chapter);

// chapter 2: a sustained run is what tires you, so hold one direction first
await page.keyboard.down('KeyD');
await page.waitForTimeout(9000);
await page.keyboard.up('KeyD');
const tired = await snap();
check('running the course tires you out', tired.exhaustion > 25, 'peak exhaustion=' + tired.exhaustion);
check('exhaustion slows you down', await page.evaluate(() => window.game.player.speedMult < 1),
  'speedMult=' + (await page.evaluate(() => window.game.player.speedMult.toFixed(2))));
// Two laps: he withholds the food after the first one on purpose, teleports
// you back to the gate, and makes you run it again.
await walkTo(marks.dish.x, marks.dish.y, 70000, { within: 22 });
const denied = await waitFor(s => s.lap === 2 || s.chapter !== 'course', 20000);
check('the first lap is for nothing', denied, 'lap ' + (await snap()).lap);
await page.waitForTimeout(2500);
if ((await snap()).chapter === 'course') {
  await walkTo(marks.dish.x, marks.dish.y, 70000, { within: 22 });
}
const gotPlan = await waitFor(s => s.chapter === 'plan' || s.chapter === 'break', 25000);
check('eating the food starts the escape plan', gotPlan, (await snap()).chapter);

// chapter 3-4: mash the glass
const broke = await waitFor(s => s.chapter === 'shot' || s.chapter === 'rampage', 60000);
if (!broke) {
  for (let i = 0; i < 200; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(45); }
}
check('mashing breaks the pane', await waitFor(s => s.chapter === 'shot' || s.chapter === 'rampage', 40000), (await snap()).chapter);

// chapter 5: Dax is shot
const shot = await waitFor(s => s.daxDead === true, 45000);
check('the guard shoots Dax', shot);
const rampage = await waitFor(s => s.chapter === 'rampage', 45000);
check('you go feral', rampage, (await snap()).chapter);

// chapters 6-9: the rampage. Chase whatever is on screen, clear the room, then
// follow the implant's waypoint to the next one, until the transport.
const nearestEnemy = () => page.evaluate(() => {
  const g = window.game;
  if (!g.enemies.length) return null;
  let best = null, bd = 1e9;
  for (const e of g.enemies) {
    const d = (e.x - g.player.x) ** 2 + (e.y - g.player.y) ** 2;
    if (d < bd) { bd = d; best = { x: e.x, y: e.y }; }
  }
  return best;
});

const rampageT0 = Date.now();
let gunSeen = false, heliSeen = false, stalled = 0;
while (Date.now() - rampageT0 < 210000) {
  const st = await snap();
  if (st.chapter === 'heli') heliSeen = true;
  if (st.chapter === 'heli' || st.chapter === 'done' || st.mode === 'forest') break;
  if (st.hasGun) gunSeen = true;
  const foe = await nearestEnemy();
  if (foe) {
    await walkTo(foe.x, foe.y, 6000, { within: 22, fire: false, mash: false });
    // close the distance, then swing at where they actually are
    for (let i = 0; i < 14; i++) {
      const f = await nearestEnemy();
      if (!f) break;
      await aimAt(f.x, f.y - 6);
      await page.keyboard.press('KeyX');
      if (st.hasGun) { await page.mouse.down(); await page.waitForTimeout(220); await page.mouse.up(); }
      else await page.waitForTimeout(150);
    }
    continue;
  }
  const wp = await page.evaluate(() => {
    const c = window.game.campaign;
    return c.waypoint ? { x: c.waypoint.x, y: c.waypoint.y } : null;
  });
  if (!wp) { await page.waitForTimeout(400); continue; }
  const arrived = await walkTo(wp.x, wp.y, 60000, { within: 24, fire: true, mash: false });
  const now = await snap();
  console.log(`      leg: stage=${now.stage} arrived=${arrived} pos=${now.x},${now.y} goal=${Math.round(wp.x)},${Math.round(wp.y)} enemies=${now.enemies}`);
  // Two legs in a row that go nowhere means the script is wedged, not that the
  // walk is slow. Stop and let the checks report it rather than spin.
  if (!arrived && ++stalled >= 2) { console.log('      stalled, giving up on the rampage'); break; }
  if (arrived) stalled = 0;
  await page.waitForTimeout(700);
}
check('killing the guard hands you his gun', gunSeen || (await snap()).hasGun === true, JSON.stringify((await snap()).weapons));

const chapters = await seen();
const heli = heliSeen || chapters.includes('heli') || (await snap()).chapter === 'heli' ||
  await waitFor(s => s.chapter === 'heli', 20000);
check('the rampage reaches the transport', heli, 'chapters seen: ' + chapters.join(' '));

// chapter 10: fly it
const flown = await waitFor(s => s.chapter === 'done' || s.mode === 'forest', 60000);
check('the flight ends in a crash', flown, (await snap()).chapter);
const landed = await waitFor(s => s.mode === 'forest', 30000);
check('you wake up in the basin', landed);
const fin = await snap();
check('the basin is generated big', fin.worldW >= 300, 'world width ' + fin.worldW + ' tiles');
check('you carry a gun out', fin.weapons.includes('popper'), fin.weapons.join());
check('60fps held through the campaign', fin.fps >= 50, fin.fps + ' fps');
// the first fight, which you lose, starts on its own once you are on your feet
await page.evaluate(() => { window.game.standDelay = 0.4; });
const ambush = await waitFor(() => true, 100) &&
  await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const ph = await page.evaluate(() => window.game.firstStand && window.game.firstStand.phase);
      if (ph === 'warn' || ph === 'fight') return true;
      await page.waitForTimeout(300);
    }
    return false;
  })();
check('Les Nest follows you down for the first fight', ambush,
  'phase=' + await page.evaluate(() => window.game.firstStand && window.game.firstStand.phase));
// they deploy a couple of seconds into the warning, so wait for the fight
const deployed = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    const n = await page.evaluate(() => window.game.enemies.length);
    if (n > 0) return true;
    await page.waitForTimeout(300);
  }
  return false;
})();
const plate = deployed && await page.evaluate(() => {
  const g = window.game;
  const e = g.enemies[0];
  if (!e) return false;
  const before = e.hp;
  e.damage(50, g);
  return e.hp > before - 10;          // 50 damage should barely scratch them
});
check('their armour blunts what you can do to them', plate,
  'escort of ' + await page.evaluate(() => window.game.enemies.length));
check('the wave director waits until the first fight is over', await page.evaluate(
  () => window.game.director.wave === 0), 'wave ' + await page.evaluate(() => window.game.director.wave));

check('no runtime errors', errors.length === 0, errors.slice(0, 4).join(' | '));

await page.screenshot({ path: 'tools/scratch/story-end.png' });
await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} story checks passed`);
process.exit(failed.length ? 1 : 0);
