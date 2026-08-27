// Checks the game on phone/tablet viewports: resolution selection, touch
// controls, and that a virtual thumb can actually move and shoot.
import { chromium, devices } from 'playwright';
import fs from 'fs';
const OUT = '/tmp/claude-0/-home-user-bookish-succotash/03866d59-027e-5eb4-a9ad-855737c6ecf5/scratchpad';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--mute-audio'] });

const cases = [
  ['ipad',     { width: 1180, height: 820 }, true],
  ['ipad-por', { width: 820, height: 1180 }, true],
  ['phone',    { width: 844, height: 390 }, true],
  ['desktop',  { width: 1920, height: 1080 }, false],
];

let fail = 0;
for (const [name, viewport, touch] of cases) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.stack || e)));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errs.push(t); });

  await page.goto(process.env.URL || 'http://localhost:8099/index.html?seed=ferret', { waitUntil: 'load' });
  await page.waitForSelector('#startbtn:not(.hidden)', { timeout: 60000 });
  await page.click('#startbtn');
  await page.waitForTimeout(400);

  const box = await (await page.$('#screen')).boundingBox();
  // Pick STRAIGHT TO THE BASIN off the title menu. On touch that means tapping
  // the second entry, which also exercises the menu's own hit testing at this
  // device's resolution.
  for (let i = 0; i < 10; i++) {
    if (touch) {
      const r = await page.evaluate(async () => {
        const g = window.game;
        const { VIEW_W, VIEW_H } = await import('/src/engine/canvas.js');
        const b = g.menu.rects[g.menu.items.findIndex(it => it.id === 'skip')];
        if (!b) return null;
        const rect = g.r.canvas.getBoundingClientRect();
        return {
          x: rect.left + ((b.x + b.w / 2) / VIEW_W) * rect.width,
          y: rect.top + ((b.y + b.h / 2) / VIEW_H) * rect.height,
        };
      });
      if (r) await page.touchscreen.tap(r.x, r.y);
      else await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(80);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({ s: window.game.state, m: window.game.mode }));
    if (st.s === 'play' && st.m === 'forest') break;
  }
  await page.evaluate(() => { if (window.game.firstStand) window.game.firstStand.skip(window.game); });

  const info = await page.evaluate(() => ({
    state: window.game.state,
    vw: document.getElementById('screen').width,
    vh: document.getElementById('screen').height,
    cssW: Math.round(document.getElementById('screen').getBoundingClientRect().width),
    cssH: Math.round(document.getElementById('screen').getBoundingClientRect().height),
    scale: window.game.r.scale,
    touchEnabled: window.game.input.touch.enabled,
    buttons: window.game.input.touch.buttons.length,
  }));

  // Drive a virtual left thumb (move) and right thumb (aim+fire).
  let moved = false, shot = false;
  if (touch) {
    const before = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
    await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.6);
    // pointer drag via CDP-free API: use mouse with touch emulation fallback
    await page.evaluate(([bx, by, bw, bh]) => {
      const cv = document.getElementById('screen');
      const send = (type, x, y, id) => cv.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true,
      }));
      // left stick: push right
      send('pointerdown', bx + bw * 0.2, by + bh * 0.6, 1);
      send('pointermove', bx + bw * 0.2 + 60, by + bh * 0.6, 1);
      // right stick: aim right and fire
      send('pointerdown', bx + bw * 0.8, by + bh * 0.6, 2);
      send('pointermove', bx + bw * 0.8 + 60, by + bh * 0.6, 2);
      window.__release = () => { send('pointerup', bx + bw * 0.2 + 60, by + bh * 0.6, 1); send('pointerup', bx + bw * 0.8 + 60, by + bh * 0.6, 2); };
    }, [box.x, box.y, box.width, box.height]);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y, bullets: window.game.bullets.count, aim: window.game.input.touch.aim.active }));
    moved = Math.hypot(after.x - before.x, after.y - before.y) > 8;
    shot = after.bullets > 0;
    await page.evaluate(() => window.__release && window.__release());
  }

  await page.screenshot({ path: `${OUT}/mobile-${name}.png` });
  const ok = info.state === 'play' && info.vw > 0 && (!touch || (info.touchEnabled && moved && shot));
  if (!ok || errs.length) fail++;
  console.log(`${ok && !errs.length ? 'PASS' : 'FAIL'}  ${name.padEnd(9)} internal=${info.vw}x${info.vh} css=${info.cssW}x${info.cssH} scale=${info.scale} touch=${info.touchEnabled} moved=${moved} shot=${shot}` + (errs.length ? '\n   ' + errs[0] : ''));
  await ctx.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
