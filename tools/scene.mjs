// Sets up specific game states and captures magnified crops so the pixel art
// can be judged at the size a player actually sees it.
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

const OUT = '/tmp/claude-0/-home-user-bookish-succotash/03866d59-027e-5eb4-a9ad-855737c6ecf5/scratchpad';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1240, height: 760 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e.stack || e)));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errs.push(t); });

await page.goto(process.env.URL || 'http://localhost:8099/index.html?seed=ferret', { waitUntil: 'load' });
const box = await enterGame(page);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(300);

// The magnifier lives in a second window-level canvas that we blit into just
// before each screenshot; the game canvas keeps rendering underneath.
await page.evaluate(() => {
  const m = document.createElement('canvas');
  m.id = 'mag';
  m.style.cssText = 'position:fixed;right:0;top:0;z-index:99;image-rendering:pixelated;background:#000';
  document.body.appendChild(m);
  window.__mag = (sx, sy, sw, sh) => {
    const src = document.getElementById('screen');
    const c = document.getElementById('mag');
    const k = Math.max(1, Math.floor(Math.min(1200 / sw, 720 / sh)));
    c.width = sw * k; c.height = sh * k;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  };
});

async function shot(name, crop) {
  const st = await page.evaluate(() => window.game.state);
  console.log('  shot', name, 'state=' + st);
  await page.evaluate(([x, y, w, h]) => window.__mag(x, y, w, h), crop);
  await page.waitForTimeout(120);
  await (await page.$('#mag')).screenshot({ path: `${OUT}/scene-${name}.png` });
}
async function setup(fn, wait = 800) { await page.evaluate(fn); await page.waitForTimeout(wait); }

await setup(() => {
  const g = window.game;
  g.player.inv.items.wood = 10;
  g.player.x = g.world.den.x; g.player.y = g.world.den.y + 34;
  g.r.camera.x = g.player.x; g.r.camera.y = g.player.y - 6;
  g.r.camera.tx = g.player.x; g.r.camera.ty = g.player.y - 6;
  g.player.aim = 0.25;
});
await shot('carry', [180, 80, 120, 100]);

await setup(() => { window.game.player.inv.items.wood = 0; window.game.player.aim = -0.4; });
await shot('player', [180, 80, 120, 100]);
await setup(() => { window.game.player.inv.items.wood = 5; window.game.player.aim = 3.0; });
await shot('carry5', [180, 80, 120, 100]);

await setup(() => {
  const g = window.game;
  const n = g.npcs[0];
  g.player.x = n.x - 22; g.player.y = n.y + 12;
  g.r.camera.x = g.player.x; g.r.camera.tx = g.player.x;
  g.r.camera.y = g.player.y - 6; g.r.camera.ty = g.player.y - 6;
  n.interact(g);
});
await shot('npc', [150, 50, 190, 150]);

await setup(() => {
  const g = window.game;
  for (let i = 0; i < 5; i++) g.spawnEnemy(['poacher','drone','spider','turret','enforcer'][i], g.player.x + 60 + i * 24, g.player.y - 40 + i * 18, 4);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    g.spawnBullet({ x: g.player.x + Math.cos(a) * 62, y: g.player.y + Math.sin(a) * 52, vx: Math.cos(a) * 25, vy: Math.sin(a) * 25, friendly: false, kind: i % 2 ? 'redOrb' : 'tealOrb', damage: 1, life: 8 });
  }
  g.player.invuln = 999;
}, 900);
await shot('combat', [110, 30, 260, 200]);
await shot('combat-full', [0, 0, 480, 270]);

await setup(() => {
  const g = window.game;
  g.enemies.length = 0; g.bullets.clear();
  for (let i = 0; i < 30; i++) g.fire.igniteAtPx(g.player.x + (i % 6) * 16 + 30, g.player.y + Math.floor(i / 6) * 16 - 34, 1.6);
  g.player.invuln = 9999;
}, 4000);
await shot('fire', [0, 0, 480, 270]);
await page.waitForTimeout(6000);
await shot('fire2', [0, 0, 480, 270]);
console.log('FIRE STATE:', JSON.stringify(await page.evaluate(() => ({ burning: window.game.fire.burning.size, scar: window.game.fire.scar.length }))));

await setup(() => {
  const g = window.game;
  g.fire.extinguishAll(); g.bullets.clear();
  const b = g.spawnEnemy('motherNest', g.player.x + 96, g.player.y - 26, 8);
  g.boss = b; g.player.invuln = 9999;
}, 2600);
await shot('boss', [0, 0, 480, 270]);

await setup(() => {
  const g = window.game;
  g.enemies.length = 0; g.bullets.clear(); g.boss = null;
  g.player.chipBag = ['target','coolant','servo','weave','pierce','arc'];
  g.player.installChip('target'); g.player.installChip('coolant');
  g.panels.mode = 'chips';
}, 500);
await shot('chips', [0, 0, 480, 270]);

await setup(() => { window.game.panels.mode = 'craft'; window.game.player.inv.items.wood = 9; window.game.player.inv.items.iron = 6; window.game.player.inv.items.gunpowder = 4; }, 400);
await shot('craft', [0, 0, 480, 270]);

await setup(() => { window.game.panels.mode = 'map'; window.game.surveyLevel = 2; }, 600);
await shot('map', [0, 0, 480, 270]);

console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 10).join('\n') : 'scenes ok');
await browser.close();
if (errs.length) process.exit(1);
