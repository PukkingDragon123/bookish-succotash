// Kit you can build and strap onto an animal. This is the "mod your animals"
// half of the army: trust gets them to follow you, tools decide what they are
// actually good for once they do.

import { P } from '../art/palette.js';

export const TOOLS = {
  harness: {
    name: 'Gun Harness', animal: true, color: P.nestSteelHi,
    cost: { iron: 4, wood: 3, scrap: 2 },
    desc: 'A shoulder-mounted popper. Turns anything into a shooter.',
    station: 'forge',
  },
  plate: {
    name: 'Scrap Plate', animal: true, color: P.nestSteel,
    cost: { scrap: 6, iron: 3 },
    desc: '+60 health, a little slower. Bolted on from dead machines.',
    station: 'forge',
  },
  chip: {
    name: 'Wired Chip', animal: true, color: P.cyber,
    cost: { scrap: 4, copper: 4, obsidian: 1 },
    desc: 'A Les Nest chip, wired in backwards. +50% melee damage.',
    station: 'workbench',
  },
  pack: {
    name: 'Forager Pack', animal: true, color: '#4b7a3a',
    cost: { fiber: 6, wood: 2 },
    desc: 'It gathers while it walks and drops the haul at your feet.',
    station: 'workbench',
  },
  lamp: {
    name: 'Basin Lamp', animal: true, color: P.sulfurHi,
    cost: { copper: 3, sulfur: 2, fiber: 2 },
    desc: 'Lights the ground around it. Useful after dark, useless in a fire.',
    station: 'workbench',
  },
};

export const TOOL_KEYS = Object.keys(TOOLS);
