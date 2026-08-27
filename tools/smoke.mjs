// Headless smoke test: boots the game, plays it for a while by driving real
// input, and fails on any console error or uncaught exception.
import { chromium } from 'playwright';
import fs from 'fs';

async function enterGame(page, opts = {}) {
  await page.waitForSelector('#startbtn:not(.hidden)', { timeout: 60000 });
  await page.click('#startbtn');
  await page.waitForTimeout(400);
  const box = await (await page.$('#screen')).boundingBox();
  // The title screen is a menu now. Take the second entry, STRAIGHT TO THE
  // BASIN, so the harness lands in the survival game rather than the lab.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => window.game && ({ state: window.game.state, mode: window.game.mode }));
    if (st && st.state === 'play' && st.mode === 'forest') {
      if (opts.keepFirstStand !== true) {
        // The scripted first defeat holds the wave director back for about a
        // minute. Tests that care about waves skip past it on purpose.
        await page.evaluate(() => {
          if (window.game.firstStand) window.game.firstStand.skip(window.game);
        });
      }
      await page.waitForTimeout(200);
      return box;
    }
  }
  throw new Error('could not leave the title screen');
}


const URL = process.env.URL || 'http://localhost:8099/index.html?seed=ferret';
const SECONDS = Number(process.env.SECONDS || 12);
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/claude-0/-home-user-bookish-succotash/03866d59-027e-5eb4-a9ad-855737c6ecf5/scratchpad';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--mute-audio', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = `${m.type()}: ${m.text()}`;
  logs.push(t);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('#startbtn:not(.hidden)', { timeout: 60000 });
console.log('BOOT:', (await page.textContent('#bootmsg')).trim());
await enterGame(page);

const canvas = await page.$('#screen');
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

async function shot(name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

// Drive the game: walk, gather, shoot, dash, open panels.
const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
for (let i = 0; i < SECONDS * 4; i++) {
  const k = keys[i % keys.length];
  await page.keyboard.down(k);
  await page.mouse.move(cx + Math.cos(i) * 260, cy + Math.sin(i * 1.3) * 160);
  if (i % 3 === 0) await page.mouse.down();
  await page.waitForTimeout(120);
  if (i % 3 === 0) await page.mouse.up();
  await page.keyboard.up(k);
  if (i % 7 === 0) await page.keyboard.press('KeyE');
  if (i % 11 === 0) await page.keyboard.press('Space');
  if (i % 17 === 0) await page.keyboard.press('KeyQ');
  if (i === 10) await shot('01-play');
}
await shot('02-play-late');

// Panels
await page.keyboard.press('Tab'); await page.waitForTimeout(300); await shot('03-craft');
await page.keyboard.press('Tab'); await page.waitForTimeout(150);
await page.keyboard.press('KeyC'); await page.waitForTimeout(300); await shot('04-chips');
await page.keyboard.press('KeyC'); await page.waitForTimeout(150);
await page.keyboard.press('KeyM'); await page.waitForTimeout(400); await shot('05-map');
await page.keyboard.press('KeyM'); await page.waitForTimeout(150);

// Exercise the deeper systems directly.
const probe = await page.evaluate(async () => {
  const g = window.game;
  const out = {};
  try {
    g.director.timer = 0.05;               // force a wave
    await new Promise(r => setTimeout(r, 900));
    out.wave = g.director.wave;
    out.enemies = g.enemies.length;
    for (let i = 0; i < 6; i++) g.spawnEnemy(['poacher','drone','spider','turret','harvester','firebomber','trapper','logger','enforcer','technician'][i], g.player.x + 60 + i * 12, g.player.y, 3);
    await new Promise(r => setTimeout(r, 1200));
    out.enemiesAfter = g.enemies.length;
    out.bullets = g.bullets.count;
  } catch (e) { out.err = String(e && e.stack || e); }
  return out;
});
console.log('PROBE:', JSON.stringify(probe));
await page.waitForTimeout(1200);
await shot('06-combat');

// Fire sequence
const fireProbe = await page.evaluate(async () => {
  const g = window.game;
  const out = {};
  try {
    g.director.wave = 7;
    g.director.timer = 0.05;
    g.director.phase = 'prep';
    await new Promise(r => setTimeout(r, 1500));
    out.phase = g.director.phase;
    out.burning = g.fire.burning.size;
    await new Promise(r => setTimeout(r, 2500));
    out.burningLater = g.fire.burning.size;
    out.trapped = g.wildlife.animals.filter(a => a.trapped).length;
  } catch (e) { out.err = String(e && e.stack || e); }
  return out;
});
console.log('FIRE:', JSON.stringify(fireProbe));
await page.waitForTimeout(800);
await shot('07-fire');

// Boss
const bossProbe = await page.evaluate(async () => {
  const g = window.game;
  const out = {};
  try {
    g.fire.extinguishAll();
    const b = g.spawnEnemy('motherNest', g.player.x + 120, g.player.y - 40, 8);
    g.boss = b;
    await new Promise(r => setTimeout(r, 2500));
    out.bossHp = Math.round(b.hp);
    out.bullets = g.bullets.count;
    out.fps = g.loop.fps;
  } catch (e) { out.err = String(e && e.stack || e); }
  return out;
});
console.log('BOSS:', JSON.stringify(bossProbe));
await shot('08-boss');

// NPC handover
const npcProbe = await page.evaluate(async () => {
  const g = window.game;
  const out = {};
  try {
    const n = g.npcs[0];
    g.enemies.length = 0; g.bullets.clear(); g.fire.extinguishAll();
    g.player.dead = false; g.player.hp = g.player.maxHp; g.player.invuln = 1e6;
    if (g.state !== 'play') g.state = 'play';
    g.player.x = n.x + 10; g.player.y = n.y + 10;
    n.interact(g); n.interact(g);
    out.quest = !!n.quest;
    if (n.quest) for (const k in n.quest.ask) g.player.inv.add(k, n.quest.ask[k] + 2);
    await new Promise(r => setTimeout(r, 3000));
    out.state = n.state;
    out.favor = n.favor;
    await new Promise(r => setTimeout(r, 3000));
    out.state2 = n.state;
    out.favor2 = n.favor;
    out.pickups = g.pickups.list.length;
  } catch (e) { out.err = String(e && e.stack || e); }
  return out;
});
console.log('NPC:', JSON.stringify(npcProbe));
await shot('09-npc');

const perf = await page.evaluate(() => ({ fps: window.game.loop.fps, sprites: window.game.enemies.length }));
console.log('PERF:', JSON.stringify(perf));

await browser.close();

if (errors.length) {
  console.log('\n=== ERRORS (' + errors.length + ') ===');
  for (const e of [...new Set(errors)].slice(0, 25)) console.log(e);
  process.exit(1);
}
console.log('\nOK - no console errors');
