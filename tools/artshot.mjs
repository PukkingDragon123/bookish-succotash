import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 2200 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e.stack || e)));
page.on('requestfailed', () => {});
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
await page.goto(process.env.ART_URL || 'http://localhost:8099/tools/artcheck.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__done === true, { timeout: 30000 });
const el = await page.$('#c');
await el.screenshot({ path: process.env.OUT || '/tmp/claude-0/-home-user-bookish-succotash/03866d59-027e-5eb4-a9ad-855737c6ecf5/scratchpad/art.png' });
console.log('title:', await page.title());
if (errs.length) { console.log('ERRORS:'); errs.slice(0,10).forEach(e=>console.log(e)); process.exit(1); }
console.log('art ok');
await browser.close();
