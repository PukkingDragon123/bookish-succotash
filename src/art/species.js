// Every creature in the basin, as a config for the critter rig. Silhouette,
// colour and gear do the characterisation work — you should be able to tell a
// pika from a marten from a poacher at a glance in a screen full of bullets.

import { P } from './palette.js';
import { shade } from './pixel.js';

// --- the player ------------------------------------------------------------
export const PLAYER_CFG = {
  bodyW: 7, bodyH: 4.1, headR: 4, neck: 3.2, snout: 2.3, snoutDrop: 1,
  ears: 'round', earSize: 2, earSpread: 2.5,
  tail: 'thin', tailLen: 10, tailR: 1.8,
  legs: 4, legLen: 4, legR: 1.3, legSpread: 3.4,
  mask: true, cyberEye: true, eyeR: 1.2,
  stitches: [[-2.6, 2.0]], bodyStitch: true,
  colors: {
    body: P.furTan, belly: P.furBelly, muzzle: P.furCream,
    foot: P.furBlack, eye: '#171310', nose: P.nose,
    tailTip: P.furBlack, maskColor: P.furMask,
  },
};

// --- NPC roster ------------------------------------------------------------
// Each entry carries both the art config and the personality data the dialogue
// and recruit systems read.
export const NPCS = {
  brindle: {
    name: 'Brindle', title: 'Gunsmith', species: 'ferret',
    personality: 'gruff', voice: 0.7,
    ability: 'slug', abilityName: 'Heavy Slug',
    blurb: 'Old ferret. Older grudge. Builds guns out of scrap and spite.',
    cfg: {
      bodyW: 7.6, bodyH: 4.6, headR: 4.2, neck: 3, snout: 2.4,
      ears: 'round', earSize: 2, tail: 'thin', tailLen: 9, tailR: 1.9,
      legs: 4, legLen: 4, legR: 1.5, legSpread: 3.6, mask: true, brow: 1, eyeR: 1,
      colors: { body: '#a8916e', belly: '#d8cbaa', muzzle: '#cfc6b0', foot: '#3a332a', nose: P.nose, tailTip: '#3a332a', maskColor: '#4a4038' },
      gear: { apron: '#6b5a3f', goggles: true, gogglesColor: P.balsamroot },
    },
  },
  juniper: {
    name: 'Juniper', title: 'Botanist', species: 'marten',
    personality: 'sunny', voice: 1.35,
    ability: 'heal', abilityName: 'Bloom Salve',
    blurb: 'Pine marten. Knows every plant in the basin by its first name.',
    cfg: {
      bodyW: 6.8, bodyH: 4.2, headR: 3.9, neck: 3.4, snout: 2.4,
      ears: 'round', earSize: 2.2, tail: 'bushy', tailLen: 10, tailR: 1.5,
      legs: 4, legLen: 4.2, legR: 1.3, legSpread: 3.4, eyeR: 1.2,
      colors: { body: '#6b4326', belly: '#e0c98a', muzzle: '#c9a877', foot: '#3a2417', nose: '#2a1c14' },
      gear: { hat: 'flower', hatColor: P.fireweed, pack: '#4b7a3a' },
    },
  },
  cobalt: {
    name: 'Cobalt', title: 'Tinkerer', species: 'raven',
    personality: 'sardonic', voice: 0.95,
    ability: 'hack', abilityName: 'Hijack Protocol',
    blurb: 'Raven. Steals bolts, opinions and Les Nest firmware.',
    cfg: {
      bodyW: 6, bodyH: 4.6, headR: 3.4, neck: 2.6, snout: 3, beak: true,
      ears: 'none', tail: 'fan', tailLen: 7, tailR: 1.4, wings: true,
      legs: 2, legLen: 4, legR: 0.9, legSpread: 2.2, eyeR: 1.1,
      colors: { body: '#26262e', light: '#3d4056', dark: '#16161c', belly: '#1c1c22', nose: '#d8c07a', eye: '#e8d33c' },
      gear: { hat: 'visor' },
    },
  },
  mossback: {
    name: 'Mossback', title: 'Elder', species: 'bison',
    personality: 'stoic', voice: 0.45,
    ability: 'charge', abilityName: 'Thunder Charge',
    blurb: 'Bison. Has stood in this valley longer than the company has existed.',
    cfg: {
      bodyW: 11, bodyH: 7, headR: 5, neck: 2.2, snout: 3.4, hump: 4,
      ears: 'horn', earSize: 2.4, earSpread: 4, tail: 'stub', tailLen: 6, tailR: 1.2,
      legs: 4, legLen: 6, legR: 2.2, legSpread: 5.5, chunky: 1, eyeR: 1, brow: 1,
      colors: { body: '#4a3626', light: '#63492f', dark: '#2c2018', belly: '#3a2b1e', muzzle: '#2a2018', foot: '#1e1712', nose: '#171310', accent: '#d8cbaa' },
    },
  },
  wisp: {
    name: 'Wisp', title: 'Scout', species: 'pika',
    personality: 'frantic', voice: 1.7,
    ability: 'mark', abilityName: 'Squeak Mark',
    blurb: 'Pika. Talks at twice the speed of everyone and runs at three times.',
    cfg: {
      bodyW: 4.6, bodyH: 3.6, headR: 3.2, neck: 1.4, snout: 1.6,
      ears: 'round', earSize: 2.4, earSpread: 2.2, tail: 'none',
      legs: 4, legLen: 2.6, legR: 1.1, legSpread: 2.4, eyeR: 1.2,
      colors: { body: '#8a7a63', belly: '#d8cbaa', muzzle: '#c9b898', foot: '#5a4d3d', nose: '#2a1c14' },
      gear: { scarf: P.paintbrush },
    },
  },
  sable: {
    name: 'Sable', title: 'Defector', species: 'ferret',
    personality: 'haunted', voice: 0.85,
    ability: 'twinshot', abilityName: 'Twin Pistols',
    blurb: 'Ex-Les Nest security. Still flinches at the sound of a clipboard.',
    cfg: {
      bodyW: 7, bodyH: 4.1, headR: 4, neck: 3.2, snout: 2.3,
      ears: 'round', earSize: 2, tail: 'thin', tailLen: 10, tailR: 1.8,
      legs: 4, legLen: 4, legR: 1.3, legSpread: 3.4, mask: true, eyeR: 1.1,
      colors: { body: '#8a7f74', belly: '#c4bdb2', muzzle: '#b0a89c', foot: '#22201e', nose: '#3a3230', tailTip: '#22201e', maskColor: '#22201e' },
      gear: { vest: P.nestTeal, vestTrim: P.nestTealHi },
    },
  },
  thermal: {
    name: 'Thermal', title: 'Geologist', species: 'coyote',
    personality: 'excitable', voice: 1.1,
    ability: 'geyser', abilityName: 'Wake the Basin',
    blurb: 'Coyote. Can hear a geyser thinking about it twenty minutes early.',
    cfg: {
      bodyW: 8, bodyH: 4.8, headR: 4.2, neck: 3.6, snout: 3.4,
      ears: 'pointy', earSize: 2.4, earSpread: 2.6, tail: 'bushy', tailLen: 10, tailR: 1.8,
      legs: 4, legLen: 5.5, legR: 1.4, legSpread: 4, eyeR: 1.1,
      colors: { body: '#9a8461', belly: '#ddd0b0', muzzle: '#c4b48f', foot: '#5a4a35', nose: '#2a2018', accent: '#6b5a3f' },
      gear: { goggles: true, gogglesColor: P.sulfurHi, pack: '#7a6a4a' },
    },
  },
  ember: {
    name: 'Ember', title: 'Kit', species: 'ferret',
    personality: 'brave', voice: 1.55,
    ability: 'smoke', abilityName: 'Smoke Pop',
    blurb: 'A kit who has decided, loudly, that she is not afraid.',
    cfg: {
      bodyW: 5, bodyH: 3.2, headR: 3.2, neck: 2.2, snout: 1.8,
      ears: 'round', earSize: 1.8, tail: 'thin', tailLen: 7, tailR: 1.4,
      legs: 4, legLen: 3, legR: 1.1, legSpread: 2.6, mask: true, eyeR: 1.3,
      colors: { body: '#d8b98a', belly: '#f3e8cd', muzzle: '#eddcbb', foot: '#4a3a2a', nose: P.nose, tailTip: '#4a3a2a', maskColor: '#5a4a3a' },
      gear: { hat: 'bandana', hatColor: P.paintbrush },
    },
  },
  quill: {
    name: 'Doc Quill', title: 'Medic', species: 'porcupine',
    personality: 'fussy', voice: 0.8,
    ability: 'quills', abilityName: 'Quill Volley',
    blurb: 'Porcupine field medic. Will lecture you while stitching you up.',
    cfg: {
      bodyW: 7.4, bodyH: 5, headR: 3.6, neck: 1.8, snout: 2.2, quills: true,
      ears: 'round', earSize: 1.4, tail: 'stub', tailLen: 6, tailR: 2,
      legs: 4, legLen: 3, legR: 1.5, legSpread: 3.6, eyeR: 1,
      colors: { body: '#4a3f34', light: '#63563f', belly: '#5a4d3d', muzzle: '#3a322a', foot: '#2a2420', nose: '#171310', accent: '#d8cbaa' },
      gear: { apron: '#c4bdb2', goggles: true, gogglesColor: '#c9e8f0' },
    },
  },
  bramble: {
    name: 'Bramble', title: 'Digger', species: 'badger',
    personality: 'blunt', voice: 0.6,
    ability: 'burrow', abilityName: 'Burrow Slam',
    blurb: 'Badger. Two speeds: digging, and about to dig.',
    cfg: {
      bodyW: 9, bodyH: 5, headR: 4, neck: 1.6, snout: 2.6,
      ears: 'round', earSize: 1.6, tail: 'stub', tailLen: 5, tailR: 1.6,
      legs: 4, legLen: 3, legR: 1.8, legSpread: 4.4, eyeR: 1, brow: 1,
      colors: { body: '#5a5348', light: '#7a7264', dark: '#39342d', belly: '#4a453c', muzzle: '#e0dcd2', foot: '#22201e', nose: '#171310', accent: '#e0dcd2' },
      gear: { pack: '#4a3f34' },
    },
  },
};

export const NPC_ORDER = ['brindle', 'juniper', 'cobalt', 'mossback', 'wisp', 'sable', 'thermal', 'ember', 'quill', 'bramble'];

// --- wildlife --------------------------------------------------------------
export const ANIMALS = {
  bison: {
    name: 'Bison', big: true, speed: 16, hp: 90, rescueValue: 3,
    cfg: {
      bodyW: 11, bodyH: 7, headR: 5, neck: 2, snout: 3.4, hump: 4,
      ears: 'horn', earSize: 2.2, earSpread: 4, tail: 'stub', tailLen: 7, tailR: 1,
      legs: 4, legLen: 6, legR: 2.2, legSpread: 5.4, eyeR: 1,
      colors: { body: '#54402d', light: '#6b5238', dark: '#332619', belly: '#42311f', muzzle: '#2a2018', foot: '#1e1712', nose: '#171310', accent: '#d8cbaa' },
    },
  },
  elk: {
    name: 'Elk', big: true, speed: 34, hp: 55, rescueValue: 2,
    cfg: {
      bodyW: 10, bodyH: 5.4, headR: 4, neck: 5, snout: 3.4, antlers: 'elk',
      ears: 'long', earSize: 2, tail: 'stub', tailLen: 4, tailR: 1,
      legs: 4, legLen: 8, legR: 1.4, legSpread: 5, eyeR: 1,
      colors: { body: '#8a6a45', light: '#a3814f', dark: '#5c4630', belly: '#c9b087', muzzle: '#4a3826', foot: '#3a2c1e', nose: '#171310' },
    },
  },
  pronghorn: {
    name: 'Pronghorn', speed: 62, hp: 28, rescueValue: 2,
    cfg: {
      bodyW: 7.6, bodyH: 4.2, headR: 3.4, neck: 4, snout: 2.6, ears: 'long', earSize: 1.8,
      tail: 'stub', tailLen: 3, tailR: 0.9, legs: 4, legLen: 7, legR: 1.1, legSpread: 4, eyeR: 1,
      colors: { body: '#c4a172', light: '#ddba86', dark: '#8a6d47', belly: '#f0e6cf', muzzle: '#3a2c1e', foot: '#3a2c1e', nose: '#171310' },
    },
  },
  wolf: {
    name: 'Wolf', speed: 52, hp: 46, hostileToPoachers: true, rescueValue: 2,
    cfg: {
      bodyW: 9, bodyH: 5, headR: 4.2, neck: 3.6, snout: 3.6, ears: 'pointy', earSize: 2.4,
      tail: 'bushy', tailLen: 10, tailR: 2, legs: 4, legLen: 6.4, legR: 1.5, legSpread: 4.4, eyeR: 1.1,
      colors: { body: '#77777a', light: '#96969a', dark: '#4e4e52', belly: '#c4c4c0', muzzle: '#a8a8a4', foot: '#3a3a3c', nose: '#171310', eye: '#e8bb2c' },
    },
  },
  coyote: {
    name: 'Coyote', speed: 56, hp: 26, rescueValue: 1,
    cfg: {
      bodyW: 7.6, bodyH: 4.4, headR: 3.8, neck: 3.4, snout: 3.2, ears: 'pointy', earSize: 2.2,
      tail: 'bushy', tailLen: 9, tailR: 1.7, legs: 4, legLen: 5.4, legR: 1.3, legSpread: 3.8, eyeR: 1.1,
      colors: { body: '#a08a63', light: '#bda17a', dark: '#6b5a3f', belly: '#ddd0b0', muzzle: '#c4b48f', foot: '#5a4a35', nose: '#2a2018', eye: '#c9a83c' },
    },
  },
  fox: {
    name: 'Red Fox', speed: 58, hp: 20, rescueValue: 1,
    cfg: {
      bodyW: 6.6, bodyH: 3.8, headR: 3.4, neck: 2.8, snout: 3, ears: 'pointy', earSize: 2.4,
      tail: 'bushy', tailLen: 10, tailR: 2, legs: 4, legLen: 4.4, legR: 1.1, legSpread: 3.2, eyeR: 1.1,
      colors: { body: '#c46a2a', light: '#e08a42', dark: '#8a4418', belly: '#f0e6cf', muzzle: '#f0e6cf', foot: '#2a2018', nose: '#171310', tailTip: '#f0e6cf', eye: '#e8bb2c' },
    },
  },
  marmot: {
    name: 'Marmot', speed: 22, hp: 14, rescueValue: 1,
    cfg: {
      bodyW: 6, bodyH: 4, headR: 3.2, neck: 1.4, snout: 1.8, ears: 'round', earSize: 1.4,
      tail: 'bushy', tailLen: 5, tailR: 1.4, legs: 4, legLen: 2.4, legR: 1.3, legSpread: 3, eyeR: 1.1,
      colors: { body: '#8a6b45', light: '#a5824f', dark: '#5c4630', belly: '#c9a877', muzzle: '#c9b898', foot: '#3a2c1e', nose: '#171310' },
    },
  },
  pika: {
    name: 'Pika', speed: 40, hp: 8, rescueValue: 1,
    cfg: {
      bodyW: 4.2, bodyH: 3.2, headR: 3, neck: 1.2, snout: 1.5, ears: 'round', earSize: 2.2,
      tail: 'none', legs: 4, legLen: 2.2, legR: 1, legSpread: 2.2, eyeR: 1.2,
      colors: { body: '#96866d', belly: '#ddd0b0', muzzle: '#c9b898', foot: '#5a4d3d', nose: '#2a1c14' },
    },
  },
  hare: {
    name: 'Jackrabbit', speed: 66, hp: 10, rescueValue: 1,
    cfg: {
      bodyW: 5, bodyH: 3.4, headR: 3, neck: 1.8, snout: 1.6, ears: 'long', earSize: 2.6, earSpread: 1.8,
      tail: 'stub', tailLen: 3, tailR: 1.2, legs: 4, legLen: 3.6, legR: 1.1, legSpread: 2.8, eyeR: 1.2,
      colors: { body: '#a89a80', belly: '#f0e6cf', muzzle: '#ddd0b0', foot: '#6b5f4d', nose: '#3a2c1e' },
    },
  },
  beaver: {
    name: 'Beaver', speed: 18, hp: 24, rescueValue: 2, water: true,
    cfg: {
      bodyW: 7.4, bodyH: 4.6, headR: 3.6, neck: 1.4, snout: 2.2, ears: 'round', earSize: 1.2,
      tail: 'fan', tailLen: 7, tailR: 2.2, legs: 4, legLen: 2.4, legR: 1.4, legSpread: 3.4, eyeR: 1,
      colors: { body: '#6b4a2f', light: '#875f3c', dark: '#4a3220', belly: '#8a6b45', muzzle: '#c9a877', foot: '#2a2018', nose: '#171310', accent: '#3a2c1e' },
    },
  },
  otter: {
    name: 'River Otter', speed: 44, hp: 18, rescueValue: 1, water: true,
    cfg: {
      bodyW: 7, bodyH: 3.6, headR: 3.2, neck: 2.4, snout: 2, ears: 'round', earSize: 1.2,
      tail: 'thin', tailLen: 9, tailR: 1.8, legs: 4, legLen: 2.4, legR: 1.2, legSpread: 3, eyeR: 1.1,
      colors: { body: '#5c4630', light: '#77593c', dark: '#3c2d1e', belly: '#c9a877', muzzle: '#ddd0b0', foot: '#2a2018', nose: '#171310' },
    },
  },
  bighorn: {
    name: 'Bighorn Sheep', speed: 30, hp: 40, rescueValue: 2,
    cfg: {
      bodyW: 8.4, bodyH: 5, headR: 3.8, neck: 2.6, snout: 2.6, ears: 'horn', earSize: 3, earSpread: 3,
      tail: 'stub', tailLen: 3, tailR: 1, legs: 4, legLen: 5.4, legR: 1.5, legSpread: 4.2, eyeR: 1,
      colors: { body: '#9a8a70', light: '#b6a68a', dark: '#6b5f4d', belly: '#ddd0b0', muzzle: '#c9b898', foot: '#4a3f34', nose: '#171310', accent: '#c9b898' },
    },
  },
  raven: {
    name: 'Raven', speed: 70, hp: 10, flying: true, rescueValue: 1,
    cfg: {
      bodyW: 5, bodyH: 3.6, headR: 2.8, neck: 2, snout: 2.6, beak: true, ears: 'none',
      tail: 'fan', tailLen: 6, tailR: 1.2, wings: true, legs: 2, legLen: 3, legR: 0.8, legSpread: 1.8, eyeR: 1,
      colors: { body: '#26262e', light: '#3d4056', dark: '#16161c', belly: '#1c1c22', nose: '#171310', eye: '#c4c4c0' },
    },
  },
  magpie: {
    name: 'Magpie', speed: 66, hp: 8, flying: true, rescueValue: 1,
    cfg: {
      bodyW: 4.2, bodyH: 3, headR: 2.4, neck: 1.8, snout: 2, beak: true, ears: 'none',
      tail: 'fan', tailLen: 8, tailR: 1, wings: true, legs: 2, legLen: 2.6, legR: 0.7, legSpread: 1.6, eyeR: 1,
      colors: { body: '#1c1c22', light: '#3d4056', dark: '#101014', belly: '#e6e6e2', muzzle: '#e6e6e2', nose: '#171310', eye: '#c4c4c0' },
    },
  },
  eagle: {
    name: 'Bald Eagle', speed: 84, hp: 22, flying: true, rescueValue: 2,
    cfg: {
      bodyW: 6, bodyH: 4.2, headR: 3, neck: 2, snout: 3, beak: true, ears: 'none',
      tail: 'fan', tailLen: 6, tailR: 1.6, wings: true, legs: 2, legLen: 3, legR: 1, legSpread: 2, eyeR: 1.1,
      colors: { body: '#4a3a2c', light: '#63503c', dark: '#2e241b', belly: '#3a2d22', muzzle: '#f0efe6', nose: '#e8bb2c', eye: '#e8d33c' },
    },
  },
  crane: {
    name: 'Sandhill Crane', speed: 34, hp: 18, rescueValue: 2,
    cfg: {
      bodyW: 5.4, bodyH: 4, headR: 2.4, neck: 8, snout: 3.4, beak: true, ears: 'none',
      tail: 'fan', tailLen: 5, tailR: 1.4, legs: 2, legLen: 9, legR: 0.8, legSpread: 2, eyeR: 1,
      colors: { body: '#9aa0a0', light: '#b8bdbd', dark: '#6b7070', belly: '#c9cdcd', muzzle: '#3a3a3c', nose: '#3a3a3c', accent: '#c9422a' },
    },
  },
  ferretWild: {
    name: 'Ferret', speed: 46, hp: 16, rescueValue: 4, kin: true,
    cfg: {
      bodyW: 6.4, bodyH: 3.8, headR: 3.6, neck: 3, snout: 2.1, ears: 'round', earSize: 1.9,
      tail: 'thin', tailLen: 9, tailR: 1.6, legs: 4, legLen: 3.6, legR: 1.2, legSpread: 3.2,
      mask: true, eyeR: 1.1,
      colors: { body: '#d8bd90', belly: '#f3e8cd', muzzle: '#eddcbb', foot: '#33291f', nose: P.nose, tailTip: '#33291f', maskColor: '#4a3f33' },
    },
  },
  kit: {
    name: 'Ferret Kit', speed: 34, hp: 8, rescueValue: 5, kin: true,
    cfg: {
      bodyW: 4.2, bodyH: 2.8, headR: 2.8, neck: 1.8, snout: 1.5, ears: 'round', earSize: 1.6,
      tail: 'thin', tailLen: 5.5, tailR: 1.2, legs: 4, legLen: 2.4, legR: 1, legSpread: 2.2,
      mask: true, eyeR: 1.3,
      colors: { body: '#e6cfa5', belly: '#f6efdc', muzzle: '#f0e2c4', foot: '#463a2c', nose: P.nose, tailTip: '#463a2c', maskColor: '#5c4f40' },
    },
  },
};

export const ANIMAL_KEYS = Object.keys(ANIMALS);

// --- organic enemies -------------------------------------------------------
export const HUMANS = {
  poacher: {
    name: 'Poacher', hp: 34, speed: 34,
    cfg: {
      bodyW: 5, bodyH: 6, headR: 3.4, neck: 1.6, snout: 1.4, snoutDrop: 1.2,
      ears: 'none', tail: 'none', legs: 2, biped: true, legLen: 6, legR: 1.5, legSpread: 2.4, eyeR: 1, brow: 1,
      colors: { body: P.poachCoat, light: shade(P.poachCoat, 0.16), dark: P.poachCoat2, belly: P.poachCoat2, muzzle: P.poachSkin, foot: '#2e2419', nose: P.poachSkin2, eye: '#171310' },
      gear: { hat: 'ranger', hatColor: '#3d3120', vest: P.poachOrange, vestTrim: '#e0a05a' },
    },
  },
  trapper: {
    name: 'Trapper', hp: 44, speed: 28,
    cfg: {
      bodyW: 5.4, bodyH: 6.2, headR: 3.4, neck: 1.6, snout: 1.4, snoutDrop: 1.2,
      ears: 'none', tail: 'none', legs: 2, biped: true, legLen: 6, legR: 1.6, legSpread: 2.6, eyeR: 1, brow: 1,
      colors: { body: '#4a4230', light: '#665c44', dark: '#2e2a1e', belly: '#2e2a1e', muzzle: P.poachSkin2, foot: '#2e2419', nose: '#6b4a35', eye: '#171310' },
      gear: { hat: 'bandana', hatColor: '#8a3a2a', pack: '#3a3226' },
    },
  },
  logger: {
    name: 'Logger', hp: 70, speed: 30,
    cfg: {
      bodyW: 6.4, bodyH: 7, headR: 3.6, neck: 1.4, snout: 1.5, snoutDrop: 1.2,
      ears: 'none', tail: 'none', legs: 2, biped: true, legLen: 6.4, legR: 2, legSpread: 3, eyeR: 1, brow: 1,
      colors: { body: '#7a3a2a', light: '#9a5040', dark: '#4e2418', belly: '#4e2418', muzzle: P.poachSkin, foot: '#2e2419', nose: P.poachSkin2, eye: '#171310' },
      gear: { hat: 'helmet', hatColor: '#e8a13c', vest: '#3d4a63' },
    },
  },
  enforcer: {
    name: 'Nest Enforcer', hp: 100, speed: 38,
    cfg: {
      bodyW: 5.6, bodyH: 6.4, headR: 3.4, neck: 1.6, snout: 1.2, snoutDrop: 1.2,
      ears: 'none', tail: 'none', legs: 2, biped: true, legLen: 6.4, legR: 1.7, legSpread: 2.6, eyeR: 1,
      colors: { body: P.nestDark, light: P.nestTeal, dark: '#0a1f1d', belly: '#0a1f1d', muzzle: P.nestSteelDk, foot: '#0a1211', nose: P.nestSteelDk, eye: P.nestEye },
      gear: { hat: 'helmet', hatColor: P.nestSteel, vest: P.nestTeal, vestTrim: P.nestTealHi, goggles: true, gogglesColor: P.nestEye },
    },
  },
  scientist: {
    name: 'Nest Technician', hp: 30, speed: 26,
    cfg: {
      bodyW: 4.8, bodyH: 6, headR: 3.4, neck: 1.6, snout: 1.3, snoutDrop: 1.2,
      ears: 'none', tail: 'none', legs: 2, biped: true, legLen: 6, legR: 1.4, legSpread: 2.4, eyeR: 1,
      colors: { body: '#c9cdcd', light: '#e2e6e6', dark: '#8a9090', belly: '#a8adad', muzzle: '#c4a88a', foot: '#4a5257', nose: '#8a6448', eye: '#171310' },
      gear: { hat: 'cap', hatColor: P.nestTeal, goggles: true, gogglesColor: '#c9e8f0', apron: '#e6e9e9' },
    },
  },
};
