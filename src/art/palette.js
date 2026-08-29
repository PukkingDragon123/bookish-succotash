// One curated palette for the whole game. Colours are grouped by where they
// come from in the basin: cold lodgepole shadow, sun-bleached meadow, the
// mineral rainbow of the thermal features, and Les Nest's sickly corporate teal.

export const P = {
  // Ground & terrain
  grassDark:   '#2f4a2c',
  grass:       '#3d6236',
  grassLight:  '#4f7a41',
  meadow:      '#6f8a45',
  meadowLight: '#889d55',
  meadowDry:   '#9a9a55',
  sage:        '#7d8a6b',
  sageDark:    '#5c6a51',
  dirt:        '#5c4a35',
  dirtLight:   '#75603f',
  mud:         '#4a3b2a',
  gravel:      '#7a7468',
  gravelLight: '#98928a',
  sand:        '#c2b087',
  ash:         '#4a4744',
  ashLight:    '#6a6663',
  charred:     '#241f1c',
  snow:        '#dfe7ea',

  // Water & thermal
  water:       '#22506b',
  waterDeep:   '#173a52',
  waterLight:  '#3a7a97',
  waterFoam:   '#a7d8e6',
  spring:      '#38c2d6',
  springHot:   '#8ef0ea',
  springRim1:  '#e8a13c',   // thermophile mats: orange
  springRim2:  '#c9622a',   // rust
  springRim3:  '#8a9c3a',   // olive
  springRim4:  '#e0d089',   // pale sinter
  sinter:      '#d8d2bb',
  mudpot:      '#6b5a48',
  mudpotLight: '#8a7660',

  // Trees & flora
  pine:        '#22402a',
  pineLight:   '#2f5836',
  pineDark:    '#17301f',
  spruce:      '#1d3a34',
  aspenLeaf:   '#9d9a3e',
  aspenLeafHi: '#bdb857',
  aspenBark:   '#b4b9ab',
  aspenMark:   '#5c6656',
  aspenRust:   '#8a6330',
  bark:        '#4a3527',
  barkLight:   '#63482f',
  barkDead:    '#8a8175',
  snagWood:    '#6b6055',
  fireweed:    '#c2478c',
  lupine:      '#6b5bc4',
  paintbrush:  '#d9432f',
  balsamroot:  '#e8bb2c',
  bearGrass:   '#e8e2c4',
  mushroom:    '#b9603c',
  mushroomPale:'#d8c9a6',
  berry:       '#5a2f6b',
  berryHi:     '#8a4ba0',
  huckleberry: '#3d2352',

  // Rock & ore
  stone:       '#6b6f72',
  stoneLight:  '#8a9094',
  stoneDark:   '#4a4e51',
  obsidian:    '#1b1a24',
  obsidianHi:  '#4b4a63',
  iron:        '#9a6a4a',
  ironHi:      '#c48a5f',
  copper:      '#3fae91',
  copperHi:    '#6fe0be',
  sulfur:      '#e8d33c',
  sulfurHi:    '#f7ef86',
  saltpeter:   '#e4e8ea',
  coal:        '#2a2a2c',
  charcoal:    '#33322f',

  // Ferret / fur
  furCream:    '#e8d7b0',
  furTan:      '#c9a877',
  furDark:     '#5a4632',
  furBlack:    '#26221e',
  furMask:     '#2e2721',
  furBelly:    '#f3e8cd',
  nose:        '#c07a86',
  tongue:      '#d4707f',

  // Player cybernetics
  cyber:       '#4de1ff',
  cyberHot:    '#b8f5ff',
  cyberDim:    '#1c7a99',
  stitch:      '#3a2a26',
  scar:        '#b98a86',

  // Les Nest corporate
  nestTeal:    '#1f7f7a',
  nestTealHi:  '#35b3ab',
  nestDark:    '#10322f',
  nestSteel:   '#7d878c',
  nestSteelHi: '#aeb8bd',
  nestSteelDk: '#4a5257',
  nestRed:     '#d63b2f',
  nestEye:     '#ff4d3d',
  nestPurple:  '#5b3a86',
  eggShell:    '#e6dcc4',
  eggCrack:    '#8a7c63',
  deadBird:    '#3b3b40',

  // Poachers
  poachCoat:   '#5c4a2f',
  poachCoat2:  '#42361f',
  poachOrange: '#c9622a',
  poachSkin:   '#b98a63',
  poachSkin2:  '#8a6448',
  denim:       '#3d4a63',

  // Fire
  fire1:       '#ffe66a',
  fire2:       '#ffab33',
  fire3:       '#ff5b2e',
  fire4:       '#b32a1f',
  smoke1:      '#4a4e4c',
  smoke2:      '#2f3331',
  smokeLight:  '#787d7a',

  // UI
  ui:          '#e8d7b0',
  uiDim:       '#8a9483',
  uiDark:      '#0d1512',
  uiPanel:     'rgba(9,16,13,0.92)',
  uiBorder:    '#3d5a41',
  uiAccent:    '#8ac47a',
  uiWarn:      '#e8a13c',
  uiBad:       '#e0685a',
  uiGood:      '#7fd48a',
  hpRed:       '#d6403a',
  hpRedDark:   '#5c1d1c',
  energy:      '#4de1ff',
  favor:       '#f0c05a',

  black:       '#0d120f',
  white:       '#f6f4ea',
  shadow:      'rgba(0,0,0,0.3)',
};

// Ambient light tints per time-of-day / event state.
export const AMBIENT = {
  day:      '#ffffff',
  dusk:     '#b09a8a',
  night:    '#5a6a8a',
  fire:     '#ffb07a',
  smoke:    '#8a8a92',
};

export default P;
