// Every wild animal in the basin: what it looks like, how it behaves when
// something goes wrong, and what it is worth to you if you earn its trust.
//
// `temper` is the single most important field. It decides what an animal does
// when Les Nest turns up: most run, some hold, a few come looking for the
// people who started it.

import { P } from './palette.js';

export const TEMPER = {
  FLEE: 'flee',           // bolts at the first sound, never fights
  SKITTISH: 'skittish',   // runs, but comes back
  BOLD: 'bold',           // holds ground, joins in if you are winning
  DEFENSIVE: 'defensive', // will not start it, will absolutely finish it
  PACK: 'pack',           // fights, and fights harder near its own kind
  AGGRO: 'aggro',         // attacks intruders on sight
};

export const BEASTS = {
  // --- the heavies ---------------------------------------------------------
  bison: {
    name: 'Bison', hp: 220, speed: 20, mass: 5, r: 11, rescueValue: 3,
    temper: TEMPER.DEFENSIVE, role: 'tank', ability: 'stampede',
    personality: 'Immovable. Has stood in this valley longer than the company has existed.',
    pros: 'Enormous health, knocks machines flat', cons: 'Slow, cannot follow you through timber',
    likes: ['berries', 'fiber'], trustRate: 0.7,
    biomes: [8, 9, 10],
    cfg: {
      scale: 1.24,
      body: { len: 11, hgt: 6.4, chest: 1.25, haunch: 0.95, arch: 0 },
      neck: { len: 1.2, thick: 5 },
      head: { r: 4.4, muzzle: 3.4, muzzleH: 2.8, snout: 'blunt', jaw: 0.3, brow: 1 },
      ears: { style: 'tiny', size: 1.5, spread: 3.2 },
      legs: { len: 5.6, thick: 2.1, spread: 5, foot: 'hoof', digitigrade: false },
      tail: { style: 'switch', len: 7, thick: 0.9 },
      eye: { r: 1, color: '#120d0a' },
      coat: { base: '#54402d', dark: '#2e2216', light: '#6d5439', hi: '#82663f', belly: '#3d2e1e', muzzle: '#241b13', nose: '#120d0a', tailTip: '#241b13' },
      extras: { hump: 4.4, horns: 'bison', hornColor: '#3a332a', ruff: true },
    },
  },

  moose: {
    name: 'Moose', hp: 260, speed: 30, mass: 5, r: 12, rescueValue: 3,
    temper: TEMPER.AGGRO, role: 'tank', ability: 'gore',
    personality: 'Bad-tempered on a good day. Today is not a good day.',
    pros: 'Hits harder than anything else alive out here', cons: 'Will charge things it should not, including you',
    likes: ['fiber', 'water'], trustRate: 0.45,
    biomes: [6, 7, 2, 3],
    cfg: {
      scale: 1.3,
      body: { len: 10.5, hgt: 5.6, chest: 1.2, haunch: 0.85, arch: 1.6 },
      neck: { len: 2.6, thick: 4.2 },
      head: { r: 3.9, muzzle: 4.6, muzzleH: 3.2, snout: 'long', jaw: 0.4 },
      ears: { style: 'moose', size: 2, spread: 3.4 },
      legs: { len: 8.4, thick: 1.9, spread: 5, foot: 'hoof', digitigrade: false },
      tail: { style: 'stub', len: 3, thick: 0.9 },
      eye: { r: 1, color: '#120d0a' },
      coat: { base: '#4a3a28', dark: '#2a2016', light: '#5f4a32', hi: '#71583a', belly: '#3a2d1e', muzzle: '#2a2016', foot: '#6b6155', nose: '#120d0a' },
      extras: { antlers: 'moose', antlerColor: '#6b5334', bell: true },
    },
  },

  bear: {
    name: 'Black Bear', hp: 300, speed: 38, mass: 5, r: 12, rescueValue: 3,
    temper: TEMPER.DEFENSIVE, role: 'fighter', ability: 'maul',
    personality: 'Would rather be eating. Extremely good at the alternative.',
    pros: 'Devastating melee, shrugs off small arms', cons: 'Eats your berries. All of them.',
    likes: ['berries', 'meds'], trustRate: 0.55,
    biomes: [7, 6, 8],
    cfg: {
      scale: 1.26,
      body: { len: 10.5, hgt: 6.2, chest: 1.2, haunch: 1.05, arch: 0 },
      neck: { len: 2.5, thick: 4.2 },
      head: { r: 3.8, muzzle: 4.6, muzzleH: 2.0, snout: 'blunt', jaw: 0.2 },
      ears: { style: 'round', size: 2.4, spread: 3 },
      legs: { len: 4.6, thick: 2.3, spread: 4.8, foot: 'paw', digitigrade: false },
      tail: { style: 'stub', len: 2.2, thick: 1.3 },
      eye: { r: 1, color: '#0d0a08' },
      coat: { base: '#2e2622', dark: '#171310', light: '#41372f', hi: '#52463c', belly: '#241d19', muzzle: '#7a6144', nose: '#0d0a08', foot: '#120f0d' },
      extras: { rump: 2.6 },
    },
  },

  // --- the runners ---------------------------------------------------------
  elk: {
    name: 'Elk', hp: 120, speed: 46, mass: 4, r: 9, rescueValue: 2,
    temper: TEMPER.SKITTISH, role: 'scout', ability: 'bugle',
    personality: 'Nervous, enormous, and surprisingly hard to keep hold of.',
    pros: 'Its bugle rallies every animal in earshot', cons: 'Bolts the moment shooting starts',
    likes: ['fiber', 'berries'], trustRate: 0.8,
    biomes: [6, 7, 8],
    cfg: {
      scale: 1.14,
      body: { len: 9.6, hgt: 5, chest: 1.05, haunch: 1, arch: 0.6 },
      neck: { len: 4.4, thick: 3.2 },
      head: { r: 3.5, muzzle: 3.4, muzzleH: 2.4, snout: 'long' },
      ears: { style: 'long', size: 1.9, spread: 2.4 },
      legs: { len: 8, thick: 1.35, spread: 4.6, foot: 'hoof', digitigrade: false },
      tail: { style: 'stub', len: 3, thick: 0.9 },
      coat: { base: '#8a6a45', dark: '#54402a', light: '#a37f52', hi: '#b8925e', belly: '#d8c49a', muzzle: '#3d2f20', foot: '#3a2c1e', nose: '#171310' },
      extras: { antlers: 'elk', antlerColor: '#5e4830' },
    },
  },

  pronghorn: {
    name: 'Pronghorn', hp: 62, speed: 74, mass: 2, r: 7, rescueValue: 2,
    temper: TEMPER.FLEE, role: 'scout', ability: 'outrun',
    personality: 'The fastest thing on this continent, and it knows it.',
    pros: 'Nothing catches it; scouts half the basin in a minute', cons: 'Will not stand and fight, ever',
    likes: ['berries'], trustRate: 1.0,
    biomes: [8, 9, 10],
    cfg: {
      scale: 1,
      body: { len: 8, hgt: 4, chest: 1, haunch: 1 },
      neck: { len: 3.6, thick: 2.4 },
      head: { r: 3.1, muzzle: 2.6, muzzleH: 1.9, snout: 'tapered' },
      ears: { style: 'long', size: 1.7, spread: 2.1 },
      legs: { len: 7.2, thick: 1.05, spread: 3.8, foot: 'hoof', digitigrade: false },
      tail: { style: 'stub', len: 2.4, thick: 0.9 },
      coat: { base: '#c4a172', dark: '#8a6d47', light: '#ddba86', hi: '#eed49c', belly: '#f4ecd8', muzzle: '#3a2c1e', nose: '#171310', accent: '#ffffff' },
      extras: { horns: 'prong', hornColor: '#2e2820', patch: true },
    },
  },

  hare: {
    name: 'Jackrabbit', hp: 26, speed: 78, mass: 1, r: 5, rescueValue: 1,
    temper: TEMPER.FLEE, role: 'scout', ability: 'zigzag',
    personality: 'Pure panic with legs.',
    pros: 'Impossible to hit; draws fire beautifully', cons: 'Contributes nothing else',
    likes: ['berries'], trustRate: 1.2,
    biomes: [8, 9, 10],
    cfg: {
      scale: 0.86,
      body: { len: 5.6, hgt: 3.4, chest: 0.9, haunch: 1.25 },
      neck: { len: 1, thick: 2 },
      head: { r: 2.9, muzzle: 1.7, muzzleH: 1.4, snout: 'blunt' },
      ears: { style: 'long', size: 2.6, spread: 1.7, tilt: 0.4 },
      legs: { len: 3.6, thick: 1.1, spread: 3, foot: 'paw' },
      tail: { style: 'stub', len: 2.2, thick: 1.2 },
      eye: { r: 1.2, color: '#1a1410' },
      coat: { base: '#a89a80', dark: '#6e6353', light: '#c0b295', hi: '#d6c9ad', belly: '#f0e6cf', muzzle: '#ddd0b0', nose: '#3a2c1e', tailTip: '#f6f2e6' },
    },
  },

  // --- the hunters ---------------------------------------------------------
  wolf: {
    name: 'Grey Wolf', hp: 110, speed: 58, mass: 3, r: 8, rescueValue: 2,
    temper: TEMPER.PACK, role: 'fighter', ability: 'houndPack',
    personality: 'Reads the fight faster than you do. Waits for the flank.',
    pros: 'Fights harder with every other wolf nearby', cons: 'Will not take orders it thinks are stupid',
    likes: ['meds', 'berries'], trustRate: 0.6,
    biomes: [6, 7],
    cfg: {
      scale: 1.06,
      body: { len: 9, hgt: 4.6, chest: 1.1, haunch: 0.95, arch: 0.4 },
      neck: { len: 2.6, thick: 3.2 },
      head: { r: 3.6, muzzle: 3.6, muzzleH: 2.2, snout: 'tapered', brow: 1 },
      ears: { style: 'pointy', size: 2.2, spread: 2.2 },
      legs: { len: 6.2, thick: 1.45, spread: 4.2, foot: 'paw' },
      tail: { style: 'bushy', len: 8.5, thick: 1.9 },
      eye: { r: 1.1, color: '#e8bb2c' },
      coat: { base: '#7c7c80', dark: '#4a4a4f', light: '#9a9a9e', hi: '#b4b4b6', belly: '#cfcfc9', muzzle: '#b0b0aa', foot: '#3a3a3c', nose: '#141210', tailTip: '#3a3a3c' },
      extras: { whiskers: true, saddle: true, ruff: true },
    },
  },

  coyote: {
    name: 'Coyote', hp: 62, speed: 62, mass: 2, r: 7, rescueValue: 1,
    temper: TEMPER.BOLD, role: 'fighter', ability: 'harry',
    personality: 'Opportunist. Turns up the moment something is worth taking.',
    pros: 'Cheap to win over, harasses relentlessly', cons: 'Steals loot off the ground',
    likes: ['berries', 'meds'], trustRate: 1.0,
    biomes: [8, 9, 10],
    cfg: {
      scale: 0.98,
      body: { len: 7.8, hgt: 4.1, chest: 1, haunch: 0.95 },
      neck: { len: 2.4, thick: 2.7 },
      head: { r: 3.3, muzzle: 3.4, muzzleH: 2, snout: 'tapered' },
      ears: { style: 'pointy', size: 2.2, spread: 2.1 },
      legs: { len: 5.6, thick: 1.25, spread: 3.8, foot: 'paw' },
      tail: { style: 'bushy', len: 8, thick: 1.8 },
      eye: { r: 1.1, color: '#c9a83c' },
      coat: { base: '#a08a63', dark: '#6b5a3f', light: '#bda17a', hi: '#d4b98d', belly: '#e6dcc2', muzzle: '#c4b48f', foot: '#5a4a35', nose: '#241b14', tailTip: '#3a3026' },
      extras: { saddle: true },
    },
  },

  fox: {
    name: 'Red Fox', hp: 48, speed: 64, mass: 1, r: 6, rescueValue: 1,
    temper: TEMPER.BOLD, role: 'scout', ability: 'pounce',
    personality: 'Curious to the point of stupidity. Somehow always fine.',
    pros: 'Finds loot you walked straight past', cons: 'Fragile',
    likes: ['berries'], trustRate: 1.1,
    biomes: [6, 7, 8],
    cfg: {
      scale: 0.92,
      body: { len: 7, hgt: 3.6, chest: 0.95, haunch: 0.95 },
      neck: { len: 2.2, thick: 2.4 },
      head: { r: 3.1, muzzle: 3.2, muzzleH: 1.8, snout: 'tapered' },
      ears: { style: 'pointy', size: 2.5, spread: 2.1 },
      legs: { len: 4.8, thick: 1.1, spread: 3.4, foot: 'paw' },
      tail: { style: 'bushy', len: 8.6, thick: 2.1 },
      eye: { r: 1.1, color: '#e8bb2c' },
      coat: { base: '#c46a2a', dark: '#8a4418', light: '#e08a42', hi: '#f0a45c', belly: '#f2e8d4', muzzle: '#f2e8d4', foot: '#241b14', nose: '#141210', tailTip: '#f6f2e6', earInner: '#241b14' },
    },
  },

  // --- the small ones ------------------------------------------------------
  squirrel: {
    name: 'Pine Squirrel', hp: 20, speed: 66, mass: 1, r: 4, rescueValue: 1,
    temper: TEMPER.SKITTISH, role: 'support', ability: 'stash',
    personality: 'Furious about everything. Very small. Extremely loud.',
    pros: 'Hoards resources and brings them to you', cons: 'Nearly useless in a fight',
    likes: ['berries', 'wood'], trustRate: 1.3,
    biomes: [6, 7],
    cfg: {
      scale: 0.72,
      body: { len: 5, hgt: 3.2, chest: 0.9, haunch: 1.1 },
      neck: { len: 1.2, thick: 1.9 },
      head: { r: 2.7, muzzle: 1.5, muzzleH: 1.3, snout: 'blunt' },
      ears: { style: 'tuft', size: 1.5, spread: 1.7 },
      legs: { len: 2.8, thick: 1, spread: 2.6, foot: 'paw' },
      tail: { style: 'plume', len: 8, thick: 2.2 },
      eye: { r: 1.2, color: '#120d0a' },
      coat: { base: '#8a5a34', dark: '#5c3a1e', light: '#a8703f', hi: '#c4894f', belly: '#efe3cb', muzzle: '#e0d2b4', nose: '#241b14' },
      extras: { whiskers: true, whiskers: true, cheek: true },
    },
  },

  hedgehog: {
    name: 'Hedgehog', hp: 70, speed: 22, mass: 2, r: 5, rescueValue: 1,
    temper: TEMPER.DEFENSIVE, role: 'tank', ability: 'curl',
    personality: 'Refuses to be hurried. Has never once been wrong about that.',
    pros: 'Curls into a ball that eats bullets whole', cons: 'Slower than the fire is',
    likes: ['berries', 'fiber'], trustRate: 1.0,
    biomes: [6, 7, 8],
    cfg: {
      scale: 0.8,
      body: { len: 6, hgt: 3.8, chest: 0.85, haunch: 1.15 },
      neck: { len: 0.7, thick: 2 },
      head: { r: 2.4, muzzle: 2.4, muzzleH: 1.5, snout: 'tapered' },
      ears: { style: 'tiny', size: 1.2, spread: 1.6 },
      legs: { len: 2, thick: 1, spread: 2.6, foot: 'paw' },
      tail: { style: 'none', len: 0, thick: 0 },
      eye: { r: 1, color: '#0d0a08' },
      coat: { base: '#8a7a5e', dark: '#4a4034', light: '#a8977a', hi: '#c9b894', belly: '#d8ccae', muzzle: '#c9b894', nose: '#0d0a08' },
      extras: { whiskers: true, spines: true },
    },
  },

  marmot: {
    name: 'Marmot', hp: 34, speed: 26, mass: 2, r: 6, rescueValue: 1,
    temper: TEMPER.SKITTISH, role: 'support', ability: 'whistle',
    personality: 'Professional alarm system. Takes the job seriously.',
    pros: 'Whistles when a wave is forming, long before you see it', cons: 'Hides for the rest of the fight',
    likes: ['berries'], trustRate: 1.2,
    biomes: [4, 11, 5],
    cfg: {
      scale: 0.9,
      body: { len: 6.4, hgt: 4.2, chest: 1, haunch: 1.1 },
      neck: { len: 0.8, thick: 2.6 },
      head: { r: 2.9, muzzle: 1.8, muzzleH: 1.5, snout: 'blunt' },
      ears: { style: 'round', size: 1.3, spread: 2 },
      legs: { len: 2.4, thick: 1.3, spread: 3, foot: 'paw' },
      tail: { style: 'bushy', len: 5, thick: 1.4 },
      eye: { r: 1.1, color: '#1a1410' },
      coat: { base: '#8a6b45', dark: '#54402a', light: '#a5824f', hi: '#bd9760', belly: '#c9a877', muzzle: '#c9b898', nose: '#171310' },
    },
  },

  pika: {
    name: 'Pika', hp: 18, speed: 46, mass: 1, r: 4, rescueValue: 1,
    temper: TEMPER.FLEE, role: 'scout', ability: 'squeak',
    personality: 'A potato with opinions.',
    pros: 'Spots things in the rocks nothing else can', cons: 'Twenty grams of soldier',
    likes: ['berries', 'fiber'], trustRate: 1.3,
    biomes: [4, 11],
    cfg: {
      scale: 0.66,
      body: { len: 4.6, hgt: 3.2, chest: 0.9, haunch: 1 },
      neck: { len: 0.5, thick: 2 },
      head: { r: 2.8, muzzle: 1.4, muzzleH: 1.2, snout: 'blunt' },
      ears: { style: 'round', size: 2.2, spread: 2.1 },
      legs: { len: 2, thick: 1, spread: 2.3, foot: 'paw' },
      tail: { style: 'none', len: 0, thick: 0 },
      eye: { r: 1.2, color: '#120d0a' },
      coat: { base: '#96866d', dark: '#5e5344', light: '#b0a184', hi: '#c6b89b', belly: '#e0d6bd', muzzle: '#c9b898', nose: '#241b14' },
    },
  },

  // --- the water ones ------------------------------------------------------
  beaver: {
    name: 'Beaver', hp: 76, speed: 22, mass: 3, r: 7, rescueValue: 2, water: true,
    temper: TEMPER.BOLD, role: 'builder', ability: 'damBuild',
    personality: 'Has a plan. The plan involves felling something.',
    pros: 'Builds barricades wherever you point it', cons: 'Also fells your trees',
    likes: ['wood', 'fiber'], trustRate: 0.9,
    biomes: [2, 3],
    cfg: {
      scale: 0.98,
      body: { len: 7.6, hgt: 4.6, chest: 1, haunch: 1.15 },
      neck: { len: 0.7, thick: 3 },
      head: { r: 3.1, muzzle: 2.1, muzzleH: 1.8, snout: 'blunt' },
      ears: { style: 'tiny', size: 1.1, spread: 2.2 },
      legs: { len: 2.2, thick: 1.4, spread: 3.4, foot: 'flipper' },
      tail: { style: 'paddle', len: 7, thick: 1.6 },
      eye: { r: 1, color: '#120d0a' },
      coat: { base: '#6b4a2f', dark: '#3f2c1b', light: '#855e3c', hi: '#9d724a', belly: '#8a6b45', muzzle: '#c9a877', nose: '#141210', accent: '#e8bb2c' },
    },
  },

  otter: {
    name: 'River Otter', hp: 46, speed: 50, mass: 2, r: 6, rescueValue: 1, water: true,
    temper: TEMPER.BOLD, role: 'fighter', ability: 'slip',
    personality: 'Treats a firefight as a slightly rude game.',
    pros: 'Impossible to pin down; fights from the water', cons: 'Gets distracted by literally anything',
    likes: ['berries', 'meds'], trustRate: 1.1,
    biomes: [2, 3],
    cfg: {
      scale: 0.92,
      body: { len: 8.4, hgt: 3.4, chest: 0.9, haunch: 0.9 },
      neck: { len: 2, thick: 2.6 },
      head: { r: 2.9, muzzle: 2, muzzleH: 1.6, snout: 'blunt' },
      ears: { style: 'tiny', size: 1, spread: 2 },
      legs: { len: 2.2, thick: 1.2, spread: 3.2, foot: 'flipper' },
      tail: { style: 'thin', len: 9, thick: 1.9 },
      eye: { r: 1.1, color: '#120d0a' },
      coat: { base: '#5c4630', dark: '#33251a', light: '#77593c', hi: '#8d6b49', belly: '#c9a877', muzzle: '#ddd0b0', nose: '#141210' },
    },
  },

  bighorn: {
    name: 'Bighorn Sheep', hp: 130, speed: 34, mass: 4, r: 8, rescueValue: 2,
    temper: TEMPER.DEFENSIVE, role: 'fighter', ability: 'ram',
    personality: 'Solves problems by running at them head first.',
    pros: 'A charge that folds sheet metal', cons: 'Only ever goes in a straight line',
    likes: ['fiber'], trustRate: 0.85,
    biomes: [4, 11, 19],
    cfg: {
      scale: 1.06,
      body: { len: 8.4, hgt: 5, chest: 1.15, haunch: 0.95 },
      neck: { len: 1.8, thick: 3.6 },
      head: { r: 3.3, muzzle: 2.4, muzzleH: 2, snout: 'blunt', brow: 1 },
      ears: { style: 'ovine', size: 1.6, spread: 2.6 },
      legs: { len: 5.4, thick: 1.5, spread: 4.2, foot: 'hoof', digitigrade: false },
      tail: { style: 'stub', len: 2, thick: 0.9 },
      coat: { base: '#9a8a70', dark: '#645845', light: '#b6a68a', hi: '#cbbda0', belly: '#e0d6bd', muzzle: '#c9b898', foot: '#4a3f34', nose: '#171310', accent: '#efe6d2' },
      extras: { horns: 'curl', hornColor: '#8a7a5e', patch: true },
    },
  },

  // --- the birds -----------------------------------------------------------
  raven: {
    name: 'Raven', hp: 26, speed: 76, mass: 1, r: 5, flying: true, rescueValue: 1,
    temper: TEMPER.BOLD, role: 'flyer', ability: 'divebomb',
    personality: 'Watching. Has been watching for some time.',
    pros: 'Flies over everything, marks what it sees', cons: 'Bargains for shiny things',
    likes: ['scrap', 'berries'], trustRate: 1.0,
    biomes: [6, 7, 8, 9],
    cfg: {
      scale: 0.86,
      body: { len: 3.8, hgt: 4.0, chest: 1.24, haunch: 0.86, tilt: 0.42 },
      neck: { len: 1.4, thick: 2.2 },
      head: { r: 2.5, muzzle: 3, muzzleH: 1.6, snout: 'beak' },
      ears: { style: 'none', size: 0, spread: 0 },
      legs: { len: 3, thick: 1.2, spread: 1.8, count: 2, foot: 'paw', digitigrade: false },
      tail: { style: 'fan', len: 6, thick: 1.2 },
      eye: { r: 1, color: '#c4c4c0' },
      coat: { base: '#26262e', dark: '#121218', light: '#3d4056', hi: '#525a78', belly: '#1c1c22', muzzle: '#1c1c22', nose: '#15151a' },
      extras: { wings: true },
    },
  },

  // The one bird in the basin that came looking for you rather than away. A
  // blue jay is a corvid with a crest, and the crest is most of the read at
  // this size — so it sits on the head as its own piece rather than a colour.
  bluejay: {
    name: 'Blue Jay', hp: 20, speed: 74, mass: 1, r: 4, flying: true, rescueValue: 1,
    temper: TEMPER.BOLD, role: 'flyer', ability: 'scout',
    personality: 'Talks first, thinks about it later, means every word of it.',
    pros: 'Knows the whole basin and will tell you about all of it',
    cons: 'Will tell you about all of it',
    likes: ['berries', 'bug'], trustRate: 1.6,
    biomes: [6, 7, 8, 9],
    cfg: {
      scale: 0.78,
      body: { len: 3.6, hgt: 3.7, chest: 1.2, haunch: 0.84, tilt: 0.40 },
      neck: { len: 1.2, thick: 2.0 },
      head: { r: 2.3, muzzle: 2.0, muzzleH: 1.3, snout: 'beak' },
      ears: { style: 'none', size: 0, spread: 0 },
      legs: { len: 2.7, thick: 1.1, spread: 1.6, count: 2, foot: 'paw', digitigrade: false },
      tail: { style: 'fan', len: 7, thick: 1.1 },
      eye: { r: 1, color: '#1a1a20' },
      coat: {
        base: '#3f74c8', dark: '#22447e', light: '#6fa2e6', hi: '#a8ccf4',
        belly: '#e8eef6', muzzle: '#1a1a20', nose: '#15151a',
        wingBar: '#f2f6fb', crest: '#2f5aa4',
      },
      extras: { wings: true, crest: 1 },
    },
  },

  magpie: {
    name: 'Magpie', hp: 18, speed: 72, mass: 1, r: 4, flying: true, rescueValue: 1,
    temper: TEMPER.FLEE, role: 'flyer', ability: 'thieve',
    personality: 'A criminal in formalwear.',
    pros: 'Lifts ammunition straight out of enemy pouches', cons: 'Sometimes lifts yours',
    likes: ['scrap'], trustRate: 1.2,
    biomes: [8, 9, 10],
    cfg: {
      scale: 0.74,
      body: { len: 3.4, hgt: 3.4, chest: 1.15, haunch: 0.82, tilt: 0.40 },
      neck: { len: 1.2, thick: 1.9 },
      head: { r: 2.2, muzzle: 2.2, muzzleH: 1.3, snout: 'beak' },
      ears: { style: 'none', size: 0, spread: 0 },
      legs: { len: 2.6, thick: 1.1, spread: 1.6, count: 2, foot: 'paw', digitigrade: false },
      tail: { style: 'fan', len: 9, thick: 1 },
      eye: { r: 1, color: '#c4c4c0' },
      coat: { base: '#1c1c22', dark: '#0e0e12', light: '#3d4056', hi: '#5a6280', belly: '#eceae4', muzzle: '#1c1c22', nose: '#15151a', wingBar: '#eceae4' },
      extras: { wings: true },
    },
  },

  eagle: {
    name: 'Bald Eagle', hp: 54, speed: 88, mass: 2, r: 6, flying: true, rescueValue: 2,
    temper: TEMPER.AGGRO, role: 'flyer', ability: 'talons',
    personality: 'Regards everything below it as either food or furniture.',
    pros: 'Picks drones out of the air', cons: 'Answers to nobody until it decides otherwise',
    likes: ['meds'], trustRate: 0.5,
    biomes: [6, 7, 8],
    cfg: {
      scale: 1,
      body: { len: 4.4, hgt: 4.8, chest: 1.3, haunch: 0.84, tilt: 0.36 },
      neck: { len: 1.4, thick: 2.6 },
      head: { r: 2.7, muzzle: 3, muzzleH: 1.8, snout: 'beak' },
      ears: { style: 'none', size: 0, spread: 0 },
      legs: { len: 3, thick: 1.5, spread: 2, count: 2, foot: 'paw', digitigrade: false },
      tail: { style: 'fan', len: 6, thick: 1.5 },
      eye: { r: 1.1, color: '#e8d33c' },
      coat: { base: '#4a3a2c', dark: '#251d16', light: '#63503c', hi: '#7a6349', belly: '#3a2d22', muzzle: '#f4f2ea', nose: '#e8bb2c' },
      extras: { wings: true },
    },
  },

  crane: {
    name: 'Sandhill Crane', hp: 40, speed: 38, mass: 2, r: 6, rescueValue: 2,
    temper: TEMPER.FLEE, role: 'support', ability: 'call',
    personality: 'Dignified. Loud. Not remotely interested in your war.',
    pros: 'Its call carries for miles and steadies everyone', cons: 'Will not go near a machine',
    likes: ['berries'], trustRate: 1.0,
    biomes: [2, 3, 8],
    cfg: {
      scale: 1.02,
      body: { len: 5.0, hgt: 4.2, chest: 1.1, haunch: 0.92, tilt: 0.20 },
      neck: { len: 7.5, thick: 1.7 },
      head: { r: 2.1, muzzle: 3.4, muzzleH: 1.2, snout: 'beak' },
      ears: { style: 'none', size: 0, spread: 0 },
      legs: { len: 9, thick: 1.3, spread: 2, count: 2, foot: 'paw', digitigrade: false },
      tail: { style: 'fan', len: 5, thick: 1.4 },
      eye: { r: 1, color: '#e8d33c' },
      coat: { base: '#9aa0a0', dark: '#666c6c', light: '#b8bdbd', hi: '#d0d4d4', belly: '#c9cdcd', muzzle: '#3a3a3c', nose: '#3a3a3c', accent: '#c9422a' },
      extras: { wings: true, bustle: 1, crown: 1 },
    },
  },

  // --- your own kind -------------------------------------------------------
  ferretWild: {
    name: 'Ferret', hp: 44, speed: 52, mass: 1, r: 5, rescueValue: 4, kin: true,
    temper: TEMPER.BOLD, role: 'fighter', ability: 'kinShot',
    personality: 'One of yours. Knows exactly what the company is.',
    pros: 'Picks up a gun without being asked', cons: 'Takes it personally',
    likes: ['berries', 'meds', 'ammo'], trustRate: 1.6,
    biomes: [6, 8, 9, 10],
    cfg: {
      scale: 0.86,
      body: { len: 7.4, hgt: 3.4, chest: 0.95, haunch: 0.95 },
      neck: { len: 2.6, thick: 2.3 },
      head: { r: 3, muzzle: 2.2, muzzleH: 1.6, snout: 'tapered' },
      ears: { style: 'round', size: 1.9, spread: 2.1 },
      legs: { len: 3.4, thick: 1.15, spread: 3.2, foot: 'paw' },
      tail: { style: 'thin', len: 8.5, thick: 1.6 },
      eye: { r: 1.1, color: '#171310' },
      coat: { base: '#d8bd90', dark: '#8f7a56', light: '#e8d0a6', hi: '#f2e0bc', belly: '#f6eeda', muzzle: '#f0e2c4', foot: '#2e2620', nose: '#c07a86', tailTip: '#2e2620' },
      extras: { whiskers: true, mask: true, maskColor: '#4a3f33' },
    },
  },

  kit: {
    name: 'Ferret Kit', hp: 20, speed: 40, mass: 1, r: 4, rescueValue: 5, kin: true,
    temper: TEMPER.FLEE, role: 'support', ability: 'none',
    personality: 'Too small for any of this.',
    pros: 'The reason you are doing this', cons: 'Cannot fight and should not be asked to',
    likes: ['berries'], trustRate: 2.0,
    biomes: [8, 9, 6],
    cfg: {
      scale: 0.62,
      body: { len: 6, hgt: 3, chest: 0.9, haunch: 0.95 },
      neck: { len: 2, thick: 2 },
      head: { r: 3.1, muzzle: 1.7, muzzleH: 1.4, snout: 'blunt' },
      ears: { style: 'round', size: 1.9, spread: 2 },
      legs: { len: 2.6, thick: 1, spread: 2.6, foot: 'paw' },
      tail: { style: 'thin', len: 6, thick: 1.4 },
      eye: { r: 1.35, color: '#171310' },
      coat: { base: '#e6cfa5', dark: '#a08a63', light: '#f0e0bd', hi: '#f8eeda', belly: '#faf4e6', muzzle: '#f4e8ce', foot: '#463a2c', nose: '#c07a86', tailTip: '#463a2c' },
      extras: { whiskers: true, mask: true, maskColor: '#5c4f40' },
    },
  },
};

export const BEAST_KEYS = Object.keys(BEASTS);

/** Animals that will stand and fight once they trust you. */
export const FIGHTERS = BEAST_KEYS.filter(k =>
  [TEMPER.BOLD, TEMPER.DEFENSIVE, TEMPER.PACK, TEMPER.AGGRO].includes(BEASTS[k].temper));

export const ROLE_COLOR = {
  fighter: P.uiBad,
  tank: P.barkLight,
  scout: P.uiAccent,
  support: P.uiGood,
  builder: P.balsamroot,
  flyer: P.cyber,
};
