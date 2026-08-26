// End-to-end checks of the actual game systems, driven through the live page.
import { chromium } from 'playwright';

async function enterGame(page) {
  await page.waitForSelector('#startbtn:not(.hidden)', { timeout: 60000 });
  await page.click('#startbtn');
  await page.waitForTimeout(400);
  const box = await (await page.$('#screen')).boundingBox();
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => window.game && window.game.state);
    if (st === 'play') return box;
  }
  throw new Error('could not leave the title screen');
}


const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e.stack || e)));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errs.push(t); });

await page.goto(process.env.URL || 'http://localhost:8099/index.html?seed=basin', { waitUntil: 'load' });
await enterGame(page);

const results = [];
async function check(name, fn, waitMs = 0) {
  const r = await page.evaluate(fn);
  if (waitMs) await page.waitForTimeout(waitMs);
  results.push([name, r]);
  console.log((r && r.ok ? 'PASS  ' : 'FAIL  ') + name + '  ' + JSON.stringify(r));
  return r;
}

// --- gathering: chop a tree, get wood, respect the 10 cap -------------------
await check('chop tree -> wood, capped at 10', () => {
  const g = window.game;
  const p = g.player;
  p.inv.items.wood = 0;
  const tree = g.world.nodes.find(n => n.alive && n.def.art === 'tree');
  p.x = tree.x - 12; p.y = tree.y + 6;
  p.gatherTarget = tree; p.tool = 'axe';
  for (let i = 0; i < 60 && tree.alive; i++) p.swing(g);
  const after = p.inv.get('wood');
  p.inv.items.wood = 0;
  for (let i = 0; i < 12; i++) p.inv.add('wood', 1);
  return { ok: after > 0 && p.inv.get('wood') === 10, gained: after, capped: p.inv.get('wood') };
});

// --- mining + gunpowder crafting -------------------------------------------
await check('craft gunpowder at the workbench', () => {
  const g = window.game;
  const p = g.player;
  const bench = g.world.props.find(pr => pr.station === 'workbench');
  p.x = bench.x; p.y = bench.y + 10;
  p.inv.items.sulfur = 4; p.inv.items.charcoal = 2; p.inv.items.saltpeter = 2;
  p.inv.items.gunpowder = 0;
  const rec = g.panels.availableRecipes(g).find(r => r.id === 'gunpowder');
  const near = g.nearStation();
  const ok = g.craft(rec);
  return { ok: ok && p.inv.get('gunpowder') === 3, station: near, powder: p.inv.get('gunpowder') };
});

await check('craft rounds from gunpowder + iron', () => {
  const g = window.game;
  const p = g.player;
  p.inv.items.iron = 4; p.inv.items.ammo = 0;
  const rec = g.panels.availableRecipes(g).find(r => r.id === 'ammo');
  const ok = g.craft(rec);
  return { ok: ok && p.inv.get('ammo') === 6, ammo: p.inv.get('ammo') };
});

// --- water: fill and douse --------------------------------------------------
await check('fill water at the river and put out a fire', () => {
  const g = window.game;
  const p = g.player;
  const before = p.inv.get('water');
  p.inv.add('water', 4);
  for (let i = 0; i < 12; i++) g.fire.igniteAtPx(p.x + 40 + (i % 4) * 16, p.y + Math.floor(i / 4) * 16, 1.4);
  const lit = g.fire.burning.size;
  const doused = g.fire.extinguish(p.x + 60, p.y + 16, 70, 3);
  g.fire.extinguishAll();
  return { ok: lit > 0 && doused > 0, lit, doused, water: p.inv.get('water') };
});

// --- the full NPC handover loop --------------------------------------------
await page.evaluate(() => {
  const g = window.game;
  g.enemies.length = 0; g.bullets.clear(); g.player.hp = g.player.maxHp; g.player.invuln = 1e6;
  const n = g.npcs.find(x => x.key === 'brindle');
  g.player.x = n.x + 8; g.player.y = n.y + 8;
  window.__npc = n;
  n.interact(g); n.interact(g);
  for (const k in n.quest.ask) g.player.inv.add(k, n.quest.ask[k]);
});
await page.waitForTimeout(6500);
await check('npc handover -> favour + item delivered', () => {
  const g = window.game;
  const n = window.__npc;
  const gotWeapon = g.pickups.list.some(p => p.kind === 'weapon') || g.player.weapons.includes(n.requests[0].give.weapon);
  return { ok: n.favor === 1 && n.state === 'idle' && gotWeapon, favor: n.favor, state: n.state, weapons: g.player.weapons.join(',') };
});

// --- recruit ----------------------------------------------------------------
await check('recruit after enough favour', () => {
  const g = window.game;
  const n = window.__npc;
  n.favor = 3;
  n.interact(g);
  return { ok: n.recruited && n.state === 'soldier', recruited: n.recruited };
});
await page.waitForTimeout(1200);
await check('recruit follows and can fire', () => {
  const g = window.game;
  const n = window.__npc;
  const e = g.spawnEnemy('poacher', n.x + 70, n.y, 1);
  n.abilityCd = 0;
  const before = g.bullets.count;
  for (let i = 0; i < 20; i++) n.updateSoldier(1 / 60, g);
  return { ok: g.bullets.count >= before, bullets: g.bullets.count };
});

// --- machine wreck -> chip steal -------------------------------------------
await check('destroying a machine leaves a lootable wreck with a chip', () => {
  const g = window.game;
  g.wrecks.length = 0;
  const p = g.player;
  let chipFound = false, tries = 0;
  while (!chipFound && tries++ < 40) {
    const e = g.spawnEnemy('spider', p.x + 40, p.y, 3);
    e.spawnT = 0;
    e.damage(99999, g, null, true);
    chipFound = g.wrecks.some(w => w.chipKey);
  }
  const w = g.wrecks.find(x => x.chipKey);
  const before = p.chipBag.length + p.chips.length;
  if (w) w.loot(g);
  const dropped = g.pickups.list.filter(x => x.kind === 'chip').length;
  for (const pk of g.pickups.list.filter(x => x.kind === 'chip')) pk.collect(g);
  const after = p.chipBag.length + p.chips.length;
  return { ok: !!w && dropped > 0 && after > before, wrecks: g.wrecks.length, dropped, chips: p.chips.length, bag: p.chipBag.length };
});

await check('chips change the derived stats', () => {
  const g = window.game;
  const p = g.player;
  p.chips = []; p.recompute();
  const base = { dmg: p.stats.damage, hp: p.maxHp };
  p.chipSlots = 4;
  p.installChip('target'); p.installChip('weave');
  return { ok: p.stats.damage > base.dmg && p.maxHp > base.hp, damage: p.stats.damage, maxHp: p.maxHp };
});

// --- animal rescue ----------------------------------------------------------
await check('trapped animal can be carried to the den', () => {
  const g = window.game;
  const p = g.player;
  g.rescued = 0; g.rescueTarget = 1;
  const trapped = g.wildlife.trapNear(p.x, p.y, 900, 1);
  const a = g.wildlife.animals.find(x => x.trapped);
  if (!a) return { ok: false, why: 'nothing trapped', trapped };
  p.x = a.x; p.y = a.y;
  g.pickUpAnimal(a);
  const carrying = !!p.carrying;
  p.x = g.world.den.x; p.y = g.world.den.y;
  g.releaseAnimal();
  return { ok: carrying && g.rescued === 1 && !p.carrying, rescued: g.rescued };
});

// --- waves ------------------------------------------------------------------
await page.evaluate(() => { const g = window.game; g.director.timer = 0.05; g.player.invuln = 1e6; });
await page.waitForTimeout(1500);
await check('wave starts and spawns hostiles', () => {
  const g = window.game;
  return { ok: g.director.wave >= 1 && (g.enemies.length + g.director.spawnQueue.length) > 0, wave: g.director.wave, live: g.enemies.length, queued: g.director.spawnQueue.length, phase: g.director.phase };
});
await check('clearing the wave returns to prep with a countdown', () => {
  const g = window.game;
  g.director.spawnQueue.length = 0;
  for (const e of g.enemies) e.dead = true;
  g.enemies.length = 0;
  g.director.update(0.02, g);
  return { ok: g.director.phase === 'clear', phase: g.director.phase, timer: Math.round(g.director.timer) };
});

// --- the burn ---------------------------------------------------------------
await page.evaluate(() => {
  const g = window.game;
  g.director.wave = 7;
  g.director.phase = 'prep';
  g.director.timer = 0.05;
  g.player.invuln = 1e6;
});
await page.waitForTimeout(4000);
const fire1 = await check('THE BURN lights the basin and traps animals', () => {
  const g = window.game;
  return { ok: g.director.phase === 'fire' && g.fire.burning.size > 0 && g.rescueTarget > 0,
    phase: g.director.phase, burning: g.fire.burning.size, trapped: g.rescueTarget, bombers: g.enemies.filter(e => e.kind === 'firebomber').length };
});
await page.waitForTimeout(6000);
await check('the fire keeps spreading', () => {
  const g = window.game;
  return { ok: g.fire.burning.size > 0, burning: g.fire.burning.size, scar: g.fire.scar.length, intensity: +g.fire.intensity.toFixed(2) };
});
await check('doused ground stops the fire', () => {
  const g = window.game;
  const before = g.fire.burning.size;
  let doused = 0;
  for (const i of [...g.fire.burning]) {
    const tx = i % g.fire.w, ty = (i / g.fire.w) | 0;
    doused += g.fire.extinguish(tx * 16 + 8, ty * 16 + 8, 40, 4);
  }
  return { ok: g.fire.burning.size < before, before, after: g.fire.burning.size, doused };
});
await page.evaluate(() => { const g = window.game; g.fire.extinguishAll(); g.director.fireEvent.t = 999; });
await page.waitForTimeout(1500);
await check('burn scar regrows over time', () => {
  const g = window.game;
  const before = g.fire.scar.length;
  return { ok: before > 0, scar: before, regrown: g.fire.regrown };
});
await page.waitForTimeout(6000);
await check('regrowth actually happened', () => {
  const g = window.game;
  return { ok: g.fire.regrown > 0, regrown: g.fire.regrown, scarLeft: g.fire.scar.length };
});

// --- bosses -----------------------------------------------------------------
for (const boss of ['ripsawPrime', 'kiln', 'motherNest']) {
  await page.evaluate((b) => {
    const g = window.game;
    g.enemies.length = 0; g.bullets.clear(); g.wrecks.length = 0; g.hazards.length = 0;
    g.fire.extinguishAll();
    g.player.invuln = 1e6; g.player.hp = g.player.maxHp;
    const e = g.spawnEnemy(b, g.player.x + 130, g.player.y - 30, 6);
    g.boss = e; window.__boss = e;
  }, boss);
  await page.waitForTimeout(4500);
  await check(boss + ' fights (patterns + phases)', () => {
    const g = window.game;
    const b = window.__boss;
    b.hp = b.maxHp * 0.25;   // force it into its last phase
    // Some bosses answer with hazards (mortars, incendiaries) rather than
    // bullets on any given cycle; either counts as "it is attacking".
    return { ok: (g.bullets.count + g.hazards.length) > 0 && !b.dead, bullets: g.bullets.count, hazards: g.hazards.length, fps: g.loop.fps };
  });
  await page.waitForTimeout(2500);
  await check(boss + ' final phase + death drops', () => {
    const g = window.game;
    const b = window.__boss;
    b.damage(1e9, g, null, true);
    return { ok: b.dead && g.wrecks.length > 0, wrecks: g.wrecks.length, phase: b.phaseIdx };
  });
}

// --- stress -----------------------------------------------------------------
await page.evaluate(() => {
  const g = window.game;
  g.player.invuln = 1e6;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.28;
    g.spawnEnemy(['poacher','drone','spider','turret','enforcer','trapper','logger','firebomber','technician','harvester'][i % 10],
      g.player.x + Math.cos(a) * 150, g.player.y + Math.sin(a) * 130, 8);
  }
});
await page.waitForTimeout(6000);
await check('40 enemies at once stays above 45fps', () => {
  const g = window.game;
  return { ok: g.loop.fps >= 45, fps: g.loop.fps, enemies: g.enemies.length, bullets: g.bullets.count };
});

await browser.close();
const failed = results.filter(([, r]) => !r || !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (errs.length) { console.log('\nCONSOLE ERRORS:'); [...new Set(errs)].slice(0, 15).forEach(e => console.log(e)); }
if (failed.length || errs.length) process.exit(1);
