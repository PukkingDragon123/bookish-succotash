// Item icons, held weapons, projectiles and pickups. Icons are tiny (10-12px)
// and drawn to read at a glance in the resource bar; weapons are drawn pointing
// right and rotated to the aim angle at draw time.

import { surface, ell, ellShaded, circ, rect, px, line, taper, tri, speckle, frameRect, outline, shade, getSheet } from './pixel.js';
import { P } from './palette.js';
import { TAU } from '../engine/math.js';

// --- resource icons --------------------------------------------------------
const ICONS = {
  wood: (c) => {
    rect(c, 1, 3, 9, 5, P.bark);
    rect(c, 1, 3, 9, 1, P.barkLight);
    ell(c, 1.5, 5.5, 1.6, 2.4, '#a97c46');
    ell(c, 1.5, 5.5, 0.9, 1.4, '#8a6234');
    speckle(c, 2, 4, 8, 4, shade(P.bark, -0.25), 0.2, 3);
  },
  stone: (c) => { ellShaded(c, 5.5, 6, 4.4, 3.4, P.stone, P.stoneLight, P.stoneDark); },
  iron: (c) => {
    ellShaded(c, 5.5, 6, 4.4, 3.4, P.stone, P.stoneLight, P.stoneDark);
    circ(c, 4, 5.5, 1.3, P.iron); circ(c, 7, 6.5, 1.1, P.iron);
    px(c, 4, 5, P.ironHi);
  },
  copper: (c) => {
    ellShaded(c, 5.5, 6, 4.4, 3.4, P.stone, P.stoneLight, P.stoneDark);
    circ(c, 4.4, 5.6, 1.3, P.copper); circ(c, 7.2, 6.6, 1.1, P.copper);
    px(c, 4, 5, P.copperHi);
  },
  obsidian: (c) => {
    ellShaded(c, 5.5, 6, 4.2, 3.4, P.obsidian, P.obsidianHi, '#0b0b12');
    line(c, 3, 7, 6, 3.5, P.obsidianHi);
  },
  coal: (c) => { ellShaded(c, 5.5, 6, 4.2, 3.2, P.coal, '#4a4a4c', '#141416'); },
  charcoal: (c) => {
    rect(c, 2, 4, 3, 6, P.charcoal); rect(c, 6, 3, 3, 7, '#26251f');
    rect(c, 2, 4, 3, 1, '#4a463c'); px(c, 7, 4, '#4a463c');
  },
  sulfur: (c) => {
    ell(c, 5.5, 6.4, 4.4, 3.2, '#8a7a3a');
    ell(c, 5.5, 5.6, 3.4, 2.4, P.sulfur);
    ell(c, 4.6, 5, 1.8, 1.1, P.sulfurHi);
  },
  saltpeter: (c) => {
    ell(c, 5.5, 6.6, 4.4, 2.6, P.sinter);
    ell(c, 5.5, 5.8, 3.2, 2, P.saltpeter);
    px(c, 4, 5, '#ffffff'); px(c, 7, 6, '#ffffff');
  },
  gunpowder: (c) => {
    // a small keg
    rect(c, 2, 3, 8, 7, '#4a3527');
    rect(c, 2, 4, 8, 1, '#7a6a4a');
    rect(c, 2, 8, 8, 1, '#7a6a4a');
    ell(c, 6, 3, 4, 1.4, '#63482f');
    line(c, 6, 2.4, 8, 0.6, P.sulfur);
    px(c, 8, 0, P.fire1);
  },
  berries: (c) => {
    circ(c, 4, 6, 2.2, P.berry); circ(c, 7.4, 7, 2, P.berry); circ(c, 6, 3.6, 1.9, P.berryHi);
    px(c, 3.4, 5.2, P.berryHi); px(c, 6.8, 6.2, P.berryHi);
    line(c, 6, 2.6, 5, 0.8, '#3d6630');
  },
  fiber: (c) => {
    for (let i = 0; i < 5; i++) line(c, 1 + i * 2, 9, 3 + i * 1.4, 1 + (i % 2), P.sage);
    rect(c, 3, 5, 5, 1, P.sageDark);
  },
  scrap: (c) => {
    rect(c, 1, 5, 5, 3, P.nestSteel); rect(c, 5, 3, 4, 4, P.nestSteelDk);
    rect(c, 1, 5, 5, 1, P.nestSteelHi);
    px(c, 7, 4, P.nestEye);
  },
  chip: (c) => {
    rect(c, 2, 3, 7, 6, P.cyberDim);
    rect(c, 3, 4, 5, 4, '#0d2a33');
    circ(c, 5.5, 6, 1.4, P.cyber);
    for (let i = 0; i < 3; i++) { rect(c, 1, 4 + i * 2, 1, 1, P.nestSteelHi); rect(c, 9, 4 + i * 2, 1, 1, P.nestSteelHi); }
  },
  ammo: (c) => {
    for (let i = 0; i < 3; i++) {
      const x = 1.5 + i * 3;
      rect(c, x, 4, 2, 5, '#c9a23c');
      tri(c, x, 4, x + 2, 4, x + 1, 1.4, P.nestSteelHi);
      px(c, x, 8, '#8a6a1c');
    }
  },
  meds: (c) => {
    rect(c, 1, 3, 9, 6, '#e6e9e9');
    rect(c, 1, 3, 9, 1, '#c4c9c9');
    rect(c, 4.5, 4, 2, 4, P.hpRed);
    rect(c, 3, 5.5, 5, 1.4, P.hpRed);
  },
  water: (c) => {
    rect(c, 2, 3, 7, 7, P.nestSteelDk);
    rect(c, 3, 4, 5, 5, P.waterLight);
    ell(c, 5.5, 4.5, 2.6, 1, P.waterFoam);
    rect(c, 2, 2.4, 7, 1, P.nestSteel);
  },

  // --- what the named places give up ---------------------------------------
  reeds: (c) => {
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 1.7;
      rect(c, x, 2 + (i % 2), 1, 8 - (i % 2), i % 2 ? '#7a8a4a' : '#96a45c');
    }
    ell(c, 3.5, 2.5, 0.9, 1.6, '#6b5a2e');
    ell(c, 7, 3.2, 0.9, 1.6, '#6b5a2e');
  },
  clay: (c) => {
    ellShaded(c, 5.5, 6.5, 4.2, 3.2, '#8a5a42', '#a87458', '#5c3a2a');
    px(c, 4, 5, '#b98a6a'); px(c, 7, 6, '#b98a6a');
  },
  resin: (c) => {
    ell(c, 5.5, 6, 3.2, 3.6, '#c88a2a');
    ell(c, 4.8, 5, 1.6, 1.8, '#e8b455');
    px(c, 4, 4, '#f4d68a');
  },
  hardwood: (c) => {
    rect(c, 1, 3, 9, 5, '#6b4a2a');
    rect(c, 1, 3, 9, 1, '#8a6238');
    rect(c, 1, 5, 9, 1, '#4d331c');
    ell(c, 1.5, 5.5, 1.6, 2.4, '#8a6238');
  },
  bone: (c) => {
    rect(c, 2, 5, 7, 2, '#d8d0b8');
    circ(c, 2.2, 4.4, 1.3, '#e6e0c8'); circ(c, 2.2, 7.4, 1.3, '#e6e0c8');
    circ(c, 8.6, 4.6, 1.2, '#e6e0c8'); circ(c, 8.6, 7.2, 1.2, '#e6e0c8');
    rect(c, 4, 6, 4, 1, '#b2a98e');
  },
  sinew: (c) => {
    for (let i = 0; i < 3; i++) {
      line(c, 1.5, 3 + i * 2, 9, 4 + i * 2, i % 2 ? '#c8b48a' : '#ab9670');
    }
    ell(c, 5.5, 5.5, 2, 3.4, 'rgba(0,0,0,0)');
    px(c, 2, 3, '#e0d0aa'); px(c, 9, 8, '#e0d0aa');
  },
  feather: (c) => {
    line(c, 2, 9, 8, 2, '#5a5448');
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const x = 2 + t * 6, y = 9 - t * 7;
      line(c, x, y, x + 2.2 - t, y - 0.6, i % 2 ? '#8a94a0' : '#6b7480');
    }
    px(c, 8, 2, '#b0b8c2');
  },
  wire: (c) => {
    for (let i = 0; i < 4; i++) circ(c, 5.5, 6, 4 - i, i % 2 ? '#a8792a' : '#7a5a20');
    px(c, 9, 3, '#c8a04a');
  },
  fuel: (c) => {
    rect(c, 2, 2, 7, 8, '#8a6c18');
    rect(c, 3, 2, 2, 8, '#c8a02e');
    rect(c, 2, 4, 7, 1, '#5c4a12');
    rect(c, 2, 7, 7, 1, '#5c4a12');
    px(c, 8, 3, '#7a4526');
  },
  powder: (c) => {
    ell(c, 5.5, 7, 4, 2.8, '#3a3630');
    speckle(c, 2, 5, 8, 4, '#c8a04a', 0.35, 7);
  },
};
export const ICON_NAMES = Object.keys(ICONS);

export function itemIcon(name) {
  return getSheet(`icon:${name}`, () => {
    const ctx = surface(11, 11);
    const fn = ICONS[name];
    if (fn) { fn(ctx); outline(ctx, P.black); }
    return [ctx.canvas];
  })[0];
}

// --- carried wood ----------------------------------------------------------
/** The short log used for the bundle riding on the player's back. */
export function carryLogSprite(variant = 0) {
  return getSheet(`carrylog:${variant}`, () => {
    const ctx = surface(11, 5);
    rect(ctx, 1, 1, 9, 3, P.barkLight);
    rect(ctx, 1, 1, 9, 1, '#7d5c3a');
    rect(ctx, 1, 3, 9, 1, P.bark);
    ell(ctx, 1.6, 2.5, 1.4, 1.7, '#c49a63');
    ell(ctx, 1.6, 2.5, 0.7, 0.9, '#8a6234');
    speckle(ctx, 3, 1, 6, 3, shade(P.barkLight, -0.3), 0.18, variant + 5);
    outline(ctx, P.black);
    return [ctx.canvas];
  })[0];
}

/** One log, drawn end-on for ground piles and item icons. */
export function logSprite(variant = 0) {
  return getSheet(`log:${variant}`, () => {
    const ctx = surface(13, 5);
    rect(ctx, 1, 1, 11, 3, P.bark);
    rect(ctx, 1, 1, 11, 1, P.barkLight);
    ell(ctx, 1.5, 2.5, 1.4, 1.8, '#a97c46');
    ell(ctx, 1.5, 2.5, 0.7, 1, '#8a6234');
    ell(ctx, 11.5, 2.5, 1.2, 1.6, '#7a5730');
    speckle(ctx, 2, 1, 9, 3, shade(P.bark, -0.3), 0.18, variant + 2);
    outline(ctx, P.black);
    return [ctx.canvas];
  })[0];
}

// --- weapons ---------------------------------------------------------------
// Drawn pointing right, origin at the grip (left-centre).
const WEAPONS = {
  popper: (c) => {
    rect(c, 0, 3, 4, 4, P.bark);          // wooden grip
    rect(c, 3, 2, 9, 3, P.nestSteelDk);   // body
    rect(c, 3, 2, 9, 1, P.nestSteel);
    rect(c, 11, 2.5, 4, 2, P.copper);     // copper barrel
    px(c, 15, 3, P.copperHi);
  },
  scatter: (c) => {
    rect(c, 0, 3, 5, 4, '#4a3527');
    rect(c, 4, 2, 8, 4, P.nestSteelDk);
    rect(c, 4, 2, 8, 1, P.nestSteel);
    rect(c, 11, 2, 6, 2, P.stoneDark);
    rect(c, 11, 4, 6, 2, P.stoneDark);
    px(c, 17, 2.5, P.stoneLight); px(c, 17, 4.5, P.stoneLight);
  },
  bolt: (c) => {
    rect(c, 0, 3, 6, 4, P.bark);
    rect(c, 5, 2, 10, 3, P.nestSteelDk);
    rect(c, 5, 2, 10, 1, P.nestSteelHi);
    rect(c, 14, 2.5, 7, 2, P.nestSteel);
    rect(c, 7, 0.5, 4, 1.6, P.nestSteelDk);  // scope
    px(c, 21, 3, P.sulfurHi);
  },
  sparker: (c) => {
    rect(c, 0, 3, 4, 4, '#3a3226');
    rect(c, 3, 2, 8, 4, P.nestSteelDk);
    circ(c, 12, 4, 3, P.copper);
    circ(c, 12, 4, 1.6, P.copperHi);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      px(c, Math.round(12 + Math.cos(a) * 4), Math.round(4 + Math.sin(a) * 4), P.cyber);
    }
  },
  lobber: (c) => {
    rect(c, 0, 4, 5, 4, P.bark);
    rect(c, 4, 2, 7, 5, P.nestSteelDk);
    ell(c, 13, 4, 4, 3.4, P.stoneDark);
    ell(c, 13, 4, 2.6, 2.2, '#241f1c');
    rect(c, 5, 1, 3, 2, P.sulfur);
  },
  geyser: (c) => {
    rect(c, 0, 4, 5, 4, '#3a3226');
    rect(c, 4, 2, 9, 5, P.sinter);
    rect(c, 4, 2, 9, 1, '#ffffff');
    ell(c, 15, 4.5, 3.4, 3, P.spring);
    ell(c, 15, 4.5, 2, 1.8, P.springHot);
    for (let i = 0; i < 3; i++) px(c, 6 + i * 2, 7, P.spring);
  },
  nail: (c) => {
    rect(c, 0, 3, 4, 4, P.bark);
    rect(c, 3, 1, 9, 5, P.nestSteelDk);
    rect(c, 3, 1, 9, 1, P.nestSteel);
    for (let i = 0; i < 3; i++) rect(c, 12, 1.5 + i * 1.6, 5, 1, P.nestSteelHi);
    rect(c, 5, 6, 5, 2, P.iron);   // magazine
  },
};
export const WEAPON_ART_NAMES = Object.keys(WEAPONS);

export function weaponSprite(kind) {
  return getSheet(`weapon:${kind}`, () => {
    const ctx = surface(24, 10);
    const fn = WEAPONS[kind] || WEAPONS.popper;
    fn(ctx);
    outline(ctx, P.black);
    return [ctx.canvas];
  })[0];
}

/** Where the muzzle sits, in weapon-sprite pixels, for flash + spawn offset. */
export const WEAPON_MUZZLE = {
  popper: 16, scatter: 18, bolt: 22, sparker: 16, lobber: 17, geyser: 19, nail: 18,
};

// --- projectiles -----------------------------------------------------------
const BULLETS = {
  pellet: (c) => { circ(c, 3, 3, 2, P.sulfurHi); circ(c, 3, 3, 1, '#ffffff'); },
  slug: (c) => { ell(c, 4, 3, 3.4, 1.8, '#ffd97a'); ell(c, 4.4, 3, 2, 1, '#ffffff'); },
  spark: (c) => { circ(c, 3, 3, 2.2, P.cyber); circ(c, 3, 3, 1, P.cyberHot); },
  nail: (c) => { rect(c, 0, 2, 6, 2, P.nestSteelHi); px(c, 6, 2, '#ffffff'); px(c, 6, 3, '#ffffff'); },
  grenade: (c) => { circ(c, 4, 4, 3.2, '#3a3226'); circ(c, 3, 3, 1.4, P.sulfur); px(c, 5, 1, P.fire1); },
  steam: (c) => { circ(c, 4, 4, 3.4, P.springHot); circ(c, 4, 4, 2, '#ffffff'); },
  quill: (c) => { taper(c, 0, 3, 8, 3, 0.6, 1.6, '#d8cbaa'); px(c, 0, 3, '#3a2a20'); },
  // enemy
  redOrb: (c) => { circ(c, 4, 4, 3.2, P.nestRed); circ(c, 4, 4, 1.8, '#ff9a8a'); px(c, 4, 4, '#ffffff'); },
  tealOrb: (c) => { circ(c, 4, 4, 3.2, P.nestTeal); circ(c, 4, 4, 1.8, P.nestTealHi); px(c, 4, 4, '#ffffff'); },
  laserBolt: (c) => { rect(c, 0, 2, 10, 3, P.nestEye); rect(c, 1, 3, 8, 1, '#ffd0c8'); },
  shell: (c) => { ell(c, 4, 4, 2.6, 3.4, P.nestSteelDk); ell(c, 4, 3, 1.6, 2, P.nestSteel); px(c, 4, 6, P.fire2); },
  saw: (c) => {
    circ(c, 6, 6, 4.4, P.nestSteelHi);
    circ(c, 6, 6, 2, P.nestSteelDk);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      px(c, Math.round(6 + Math.cos(a) * 5.4), Math.round(6 + Math.sin(a) * 5.4), P.nestSteelHi);
    }
  },
  ember: (c) => { circ(c, 4, 4, 3, P.fire3); circ(c, 4, 4, 1.8, P.fire2); px(c, 4, 4, P.fire1); },
  net: (c) => {
    frameRect(c, 0, 0, 10, 10, '#8a7a5a');
    line(c, 0, 5, 10, 5, '#8a7a5a'); line(c, 5, 0, 5, 10, '#8a7a5a');
  },
  dart: (c) => { taper(c, 0, 3, 9, 3, 0.8, 2, P.nestTealHi); px(c, 9, 3, '#ffffff'); },
};
export const BULLET_ART_NAMES = Object.keys(BULLETS);

export function bulletSprite(kind) {
  return getSheet(`bullet:${kind}`, () => {
    const sizes = { nail: [8, 6], laserBolt: [12, 7], quill: [10, 7], saw: [14, 14], net: [12, 12], slug: [10, 7], dart: [11, 7] };
    const [w, h] = sizes[kind] || [9, 9];
    const ctx = surface(w, h);
    const fn = BULLETS[kind] || BULLETS.pellet;
    fn(ctx);
    outline(ctx, 'rgba(13,18,15,0.85)');
    return [ctx.canvas];
  })[0];
}

// --- world pickups ---------------------------------------------------------
export function pickupSprite(item) {
  return getSheet(`pickup:${item}`, () => {
    const frames = [];
    for (let i = 0; i < 4; i++) {
      const ctx = surface(14, 14);
      const bob = Math.sin((i / 4) * TAU) * 1;
      // soft glow disc so loot is visible in tall grass
      ell(ctx, 7, 11, 4, 1.6, 'rgba(0,0,0,0.28)');
      const icon = itemIcon(item);
      ctx.drawImage(icon, 2, 1 + bob);
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

/** The stolen upgrade chip, spinning in the air. */
export function chipPickupFrames() {
  return getSheet('pickup:chipSpin', () => {
    const frames = [];
    for (let i = 0; i < 8; i++) {
      const ctx = surface(16, 16);
      const t = i / 8;
      const w = Math.abs(Math.cos(t * TAU)) * 5 + 1.2;
      const bob = Math.sin(t * TAU) * 1.4;
      const cy = 8 + bob;
      rect(ctx, 8 - w, cy - 4, w * 2, 8, P.cyberDim);
      rect(ctx, 8 - w * 0.6, cy - 2.6, w * 1.2, 5.2, '#0d2a33');
      circ(ctx, 8, cy, Math.min(2, w), P.cyber);
      if (w > 2) {
        for (let k = 0; k < 3; k++) {
          rect(ctx, 8 - w - 1, cy - 3 + k * 2.4, 1, 1, P.nestSteelHi);
          rect(ctx, 8 + w, cy - 3 + k * 2.4, 1, 1, P.nestSteelHi);
        }
      }
      outline(ctx, P.black);
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

/** Marker showing where a wave will break through. */
export function warnMarkerFrames() {
  return getSheet('fx:warnMarker', () => {
    const frames = [];
    for (let i = 0; i < 6; i++) {
      const ctx = surface(16, 16);
      const t = i / 6;
      const a = 0.4 + Math.abs(Math.sin(t * TAU)) * 0.6;
      ctx.globalAlpha = a;
      tri(ctx, 3, 3, 13, 3, 8, 13, P.nestRed);
      tri(ctx, 5, 4.4, 11, 4.4, 8, 10.4, '#ffd0c8');
      rect(ctx, 7, 5, 2, 3, P.nestRed);
      px(ctx, 8, 9, P.nestRed);
      ctx.globalAlpha = 1;
      frames.push(ctx.canvas);
    }
    return frames;
  });
}

/** Muzzle flash, drawn additively at the barrel tip. */
export function muzzleFlash(size = 1) {
  return getSheet(`fx:muzzle:${size}`, () => {
    const frames = [];
    for (let i = 0; i < 3; i++) {
      const ctx = surface(16, 12);
      const s = (1 - i / 3) * size;
      ell(ctx, 4, 6, 5 * s, 3.4 * s, P.fire2);
      ell(ctx, 3, 6, 3.4 * s, 2.2 * s, P.fire1);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        line(ctx, 4, 6, 4 + Math.cos(a) * 7 * s, 6 + Math.sin(a) * 5 * s, P.fire2);
      }
      frames.push(ctx.canvas);
    }
    return frames;
  });
}
