// Static game data: resources, weapons, upgrade chips and crafting recipes.
// Kept in one place so the HUD, the crafting panel and the NPC request
// generator all read from the same source of truth.

import { P } from '../art/palette.js';

// --- resources -------------------------------------------------------------
export const RESOURCES = {
  wood:      { name: 'Wood', icon: 'wood', color: P.barkLight, carry: 10, hint: 'Chop trees. Carried on your back.' },
  stone:     { name: 'Stone', icon: 'stone', color: P.stoneLight, hint: 'Mine boulders.' },
  iron:      { name: 'Iron', icon: 'iron', color: P.ironHi, hint: 'Mine rusty ore on the ridges.' },
  copper:    { name: 'Copper', icon: 'copper', color: P.copperHi, hint: 'Green ore on the ridges.' },
  obsidian:  { name: 'Obsidian', icon: 'obsidian', color: P.obsidianHi, hint: 'Volcanic glass. Cuts anything.' },
  coal:      { name: 'Coal', icon: 'coal', color: '#6a6a6c', hint: 'Black seams in the gravel.' },
  charcoal:  { name: 'Charcoal', icon: 'charcoal', color: '#8a857c', hint: 'From burnt snags, or burn wood at the forge.' },
  sulfur:    { name: 'Sulfur', icon: 'sulfur', color: P.sulfur, hint: 'Yellow crust around the thermal basin.' },
  saltpeter: { name: 'Saltpeter', icon: 'saltpeter', color: P.saltpeter, hint: 'White sinter crust near the springs.' },
  gunpowder: { name: 'Gunpowder', icon: 'gunpowder', color: P.fire2, hint: 'Sulfur + charcoal + saltpeter.' },
  berries:   { name: 'Berries', icon: 'berries', color: P.berryHi, hint: 'Eat to heal. Bushes regrow.' },
  fiber:     { name: 'Fiber', icon: 'fiber', color: P.sage, hint: 'Stripped from sagebrush and aspen.' },
  scrap:     { name: 'Scrap', icon: 'scrap', color: P.nestSteelHi, hint: 'Torn out of dead machines.' },
  ammo:      { name: 'Rounds', icon: 'ammo', color: '#c9a23c', hint: 'Crafted from gunpowder and iron.' },
  meds:      { name: 'Salve', icon: 'meds', color: '#e6e9e9', hint: 'Heals a chunk instantly.' },
  water:     { name: 'Water', icon: 'water', color: P.waterLight, carry: 4, hint: 'Fill at the river. Puts out fire.' },
};

export const RESOURCE_ORDER = [
  'wood', 'stone', 'iron', 'copper', 'obsidian', 'coal', 'charcoal',
  'sulfur', 'saltpeter', 'gunpowder', 'berries', 'fiber', 'scrap', 'ammo', 'meds', 'water',
];

// Resources shown in the compact HUD bar (the rest live in the crafting panel).
export const HUD_RESOURCES = ['wood', 'stone', 'iron', 'sulfur', 'charcoal', 'saltpeter', 'gunpowder', 'ammo', 'berries', 'scrap'];

// --- weapons ---------------------------------------------------------------
export const WEAPONS = {
  // Chapter one. No gun, no ammo — the fire button does nothing and the only
  // thing you have is X.
  claws: {
    name: 'Claws', art: 'popper', sfx: 'hit',
    damage: 0, rof: 99, speed: 1, count: 0, spread: 0, ammo: 0,
    bullet: 'pellet', range: 0.1, knock: 0, meleeOnly: true,
    desc: 'What they left you with.',
  },
  popper: {
    name: 'Pine Popper', art: 'popper', sfx: 'shoot',
    damage: 7, rof: 0.22, speed: 250, count: 1, spread: 0.05, ammo: 0,
    bullet: 'pellet', range: 1.5, knock: 20,
    desc: 'Spring-loaded seed popper. Free forever, weak forever.',
  },
  scatter: {
    name: 'Scattergun', art: 'scatter', sfx: 'shotgun',
    damage: 6, rof: 0.68, speed: 210, count: 7, spread: 0.46, ammo: 2,
    bullet: 'pellet', range: 0.65, knock: 70, shake: 3,
    desc: 'Seven pellets of very direct conversation.',
  },
  bolt: {
    name: 'Boltbark Rifle', art: 'bolt', sfx: 'rifle',
    damage: 34, rof: 0.62, speed: 430, count: 1, spread: 0.012, ammo: 1,
    bullet: 'slug', range: 2.4, pierce: 1, knock: 60, shake: 2.4,
    desc: 'Punches through two poachers if they line up politely.',
  },
  nail: {
    name: 'Nail Driver', art: 'nail', sfx: 'shoot',
    damage: 5, rof: 0.075, speed: 320, count: 1, spread: 0.13, ammo: 1, ammoEvery: 2,
    bullet: 'nail', range: 1.2, knock: 12,
    desc: 'Empties a magazine faster than you can regret it.',
  },
  sparker: {
    name: 'Copper Sparker', art: 'sparker', sfx: 'sparker',
    damage: 11, rof: 0.26, speed: 300, count: 1, spread: 0.06, ammo: 1,
    bullet: 'spark', range: 1.1, chain: 2, chainRange: 58, knock: 10,
    desc: 'Arcs from target to target. Machines hate it.',
  },
  lobber: {
    name: 'Sulfur Lobber', art: 'lobber', sfx: 'lob',
    damage: 46, rof: 0.95, speed: 175, count: 1, spread: 0.04, ammo: 3,
    bullet: 'grenade', range: 0.9, aoe: 42, arc: true, knock: 110, shake: 5,
    desc: 'Lobs a sulfur charge. Mind the trees.',
  },
  geyser: {
    name: 'Geyser Cannon', art: 'geyser', sfx: 'laserfire',
    damage: 15, rof: 0.11, speed: 260, count: 2, spread: 0.22, ammo: 1, ammoEvery: 3,
    bullet: 'steam', range: 0.55, knock: 90, scald: true,
    desc: 'Superheated basin water. Short range, enormous shove.',
  },
};
export const WEAPON_ORDER = ['popper', 'scatter', 'bolt', 'nail', 'sparker', 'lobber', 'geyser'];

// --- upgrade chips ---------------------------------------------------------
// Every chip is torn out of a machine you destroyed. Stat chips stack.
export const CHIPS = {
  target:  { name: 'TARGET-1', color: '#ff8a5a', rarity: 1, desc: '+25% weapon damage.', stat: { damage: 0.25 } },
  coolant: { name: 'COOLANT-V', color: '#5ad8ff', rarity: 1, desc: '+25% fire rate.', stat: { rof: 0.25 } },
  servo:   { name: 'SERVO-9', color: '#8aff9a', rarity: 1, desc: '+18% move speed, +1 dash charge.', stat: { speed: 0.18, dash: 1 } },
  weave:   { name: 'NANO-WEAVE', color: '#ffd05a', rarity: 1, desc: '+30 max health and slow regeneration.', stat: { hp: 30, regen: 1.2 } },
  pierce:  { name: 'LANCE-4', color: '#c8a2ff', rarity: 2, desc: 'Shots pierce one extra target.', stat: { pierce: 1 } },
  ricochet:{ name: 'CAROM-2', color: '#a2d8ff', rarity: 2, desc: 'Shots bounce off terrain once.', stat: { bounce: 1 } },
  split:   { name: 'FORK-3', color: '#ffb0d8', rarity: 2, desc: '+1 projectile per shot, slightly wider spread.', stat: { count: 1, spread: 0.06 } },
  magnet:  { name: 'DRAW-COIL', color: '#d8ff5a', rarity: 1, desc: 'Triples pickup range.', stat: { magnet: 2 } },
  capacitor:{ name: 'AEGIS-CAP', color: '#8affea', rarity: 3, desc: 'A shield that eats one hit, then recharges.', stat: { shield: 1 } },
  vampire: { name: 'GRAFT-7', color: '#ff5a7a', rarity: 3, desc: 'Heal 3 health on every kill.', stat: { lifesteal: 3 } },
  arc:     { name: 'ARC-TAP', color: '#5affd8', rarity: 2, desc: '18% chance to chain lightning on hit.', stat: { arc: 0.18 } },
  dilate:  { name: 'DILATE-0', color: '#c8c8ff', rarity: 3, desc: 'Time slows for a moment when you are hit.', stat: { dilate: 1 } },
  scavenger:{ name: 'GLEAN-2', color: '#ffec8a', rarity: 2, desc: '+50% harvest yields.', stat: { harvest: 0.5 } },
  ember:   { name: 'EMBER-9', color: '#ff7a3a', rarity: 2, desc: 'Shots set enemies alight. Does not spread to trees.', stat: { burn: 1 } },
  overclock:{ name: 'REDLINE', color: '#ff3a3a', rarity: 3, desc: '+60% damage while below 40% health.', stat: { overclock: 0.6 } },
  siphon:  { name: 'SIPHON-K', color: '#a2ff5a', rarity: 2, desc: 'Kills return 2 rounds.', stat: { siphon: 2 } },
};
export const CHIP_KEYS = Object.keys(CHIPS);

export function randomChipKey(rng = Math.random, luck = 0) {
  const pool = [];
  for (const k of CHIP_KEYS) {
    const c = CHIPS[k];
    const weight = c.rarity === 1 ? 10 : c.rarity === 2 ? 5 + luck : 2 + luck;
    for (let i = 0; i < weight; i++) pool.push(k);
  }
  return pool[Math.floor(rng() * pool.length)];
}

// --- crafting --------------------------------------------------------------
// station: 'workbench' | 'forge' | null (anywhere)
export const RECIPES = [
  {
    id: 'gunpowder', name: 'Gunpowder', station: 'workbench', category: 'material',
    cost: { sulfur: 2, charcoal: 1, saltpeter: 1 }, give: { gunpowder: 3 },
    desc: 'The whole reason to visit the thermal basin.',
  },
  {
    id: 'charcoal', name: 'Burn Charcoal', station: 'forge', category: 'material',
    cost: { wood: 2 }, give: { charcoal: 1 },
    desc: 'Slow-burn wood in the forge.',
  },
  {
    id: 'ammo', name: 'Rounds x6', station: 'workbench', category: 'material',
    cost: { gunpowder: 1, iron: 1 }, give: { ammo: 6 },
    desc: 'Brass, powder, patience.',
  },
  {
    id: 'ammoBig', name: 'Rounds x20', station: 'workbench', category: 'material',
    cost: { gunpowder: 3, iron: 3, copper: 1 }, give: { ammo: 20 },
    desc: 'A proper production run.',
  },
  {
    id: 'meds', name: 'Salve x2', station: null, category: 'material',
    cost: { berries: 4, fiber: 2 }, give: { meds: 2 },
    desc: 'Juniper taught you this one.',
  },
  {
    id: 'scatter', name: 'Scattergun', station: 'forge', category: 'weapon',
    cost: { wood: 6, iron: 4, gunpowder: 2 }, give: { weapon: 'scatter' },
    desc: 'Close work.',
  },
  {
    id: 'bolt', name: 'Boltbark Rifle', station: 'forge', category: 'weapon',
    cost: { wood: 8, iron: 6, copper: 2, gunpowder: 3 }, give: { weapon: 'bolt' },
    desc: 'Reach out.',
  },
  {
    id: 'nail', name: 'Nail Driver', station: 'forge', category: 'weapon',
    cost: { wood: 4, iron: 8, scrap: 4 }, give: { weapon: 'nail' },
    desc: 'Built from a Les Nest riveter.',
  },
  {
    id: 'sparker', name: 'Copper Sparker', station: 'forge', category: 'weapon',
    cost: { copper: 8, iron: 3, scrap: 5 }, give: { weapon: 'sparker' },
    desc: 'Chains between machines.',
  },
  {
    id: 'lobber', name: 'Sulfur Lobber', station: 'forge', category: 'weapon',
    cost: { wood: 6, iron: 5, sulfur: 8, gunpowder: 4 }, give: { weapon: 'lobber' },
    desc: 'Area denial, ferret-sized.',
  },
  {
    id: 'geyser', name: 'Geyser Cannon', station: 'forge', category: 'weapon',
    cost: { obsidian: 4, copper: 6, iron: 6, scrap: 8 }, give: { weapon: 'geyser' },
    desc: 'Thermal taught you the plumbing.',
  },
  {
    id: 'chipslot', name: 'Extra Chip Socket', station: 'workbench', category: 'upgrade',
    cost: { scrap: 12, copper: 6, obsidian: 2 }, give: { chipSlot: 1 }, repeatable: 3,
    desc: 'Solder another socket into your skull. Nobody recommends this.',
  },
  {
    id: 'bucket', name: 'Water Skin', station: 'workbench', category: 'upgrade',
    cost: { fiber: 6, wood: 3 }, give: { waterCap: 2 }, repeatable: 3,
    desc: 'Carry more water. You will want it.',
  },
];

// Animal kit. Built like anything else, then fitted by walking up to a bonded
// animal and pressing E.
import { TOOLS, TOOL_KEYS } from './tools.js';
for (const k of TOOL_KEYS) {
  const t = TOOLS[k];
  RECIPES.push({
    id: 'tool_' + k, name: t.name, station: t.station, category: 'tool',
    cost: t.cost, give: { tool: k }, repeatable: 99, desc: t.desc,
  });
}

export function recipeById(id) { return RECIPES.find(r => r.id === id) || null; }
