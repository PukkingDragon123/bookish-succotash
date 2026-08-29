// Wind.
//
// The basin used to have thousands of plants each running its own little
// four-frame loop on its own phase offset. Every tuft of grass twitched
// independently, forever, and the result was visual static — the eye could
// never settle anywhere because everything on screen was always moving.
//
// Real wind does not work like that. Wind is *one field*: a gust arrives from
// one side, sweeps across the meadow, and everything in its path leans the
// same way at the same moment. Between gusts the field goes quiet and the
// grass stands still. That coherence is the whole effect — and it costs less
// than the noise did, because it is two sine waves.
//
// Everything that bends reads from here: grass, ferns, flowers, tree crowns,
// smoke, the fire. One field, one direction, one weather.

// Where the weather comes from. A fixed bearing reads as a place with
// prevailing wind, which is what a mountain basin has.
const DIRX = 0.93, DIRY = 0.36;

// Wavelengths, in world pixels. The swell is long enough that a gust takes a
// couple of seconds to cross the screen, which is what makes it read as a
// gust rather than a shimmer.
const SWELL = 1 / 190;
const RIPPLE = 1 / 74;
const BAND = 1 / 620;

let strength = 0.62;      // overall weather, 0 = dead calm
let bias = 0;             // pushed by explosions and the fire

/** Set the day's weather. Storms during a burn, stillness before dawn. */
export function setWind(s) { strength = s; }
export function windStrength() { return strength; }

/** A shove, for a blast wave or a helicopter overhead. Decays on its own. */
export function gustBurst(amount) { bias = Math.max(bias, amount); }
export function updateWind(dt) { bias *= Math.pow(0.2, dt); }

/**
 * How hard the wind is leaning at a point, right now. Range about -1..1;
 * positive is downwind.
 *
 * Two travelling waves give the motion, and a third, much longer one is the
 * gust envelope — broad bands of strong and calm that drift across the map,
 * so the meadow visibly breathes instead of vibrating.
 */
export function windAt(x, y, t) {
  const s = x * DIRX + y * DIRY;
  const swell = Math.sin(s * SWELL - t * 1.35);
  const ripple = Math.sin(s * RIPPLE - t * 2.7 + 1.3);
  const band = Math.sin(s * BAND - t * 0.42);
  const gust = 0.28 + 0.72 * (band * 0.5 + 0.5) * (band * 0.5 + 0.5);
  return (swell * 0.68 + ripple * 0.32) * gust * (strength + bias);
}

/** Just the envelope, for things that want to know if a gust is passing. */
export function gustAt(x, y, t) {
  const s = x * DIRX + y * DIRY;
  const band = Math.sin(s * BAND - t * 0.42) * 0.5 + 0.5;
  return (0.28 + 0.72 * band * band) * (strength + bias);
}

/** Which way it is blowing, for smoke and embers. */
export const WIND_DIR = { x: DIRX, y: DIRY };

/**
 * Pick a bend frame for a sprite standing at (x, y).
 *
 * Frames run from fully-bent-upwind to fully-bent-downwind, so neighbouring
 * plants land on neighbouring frames and the whole stand leans together.
 */
export function bendFrame(x, y, t, n) {
  const w = windAt(x, y, t);
  const i = Math.round((Math.max(-1, Math.min(1, w)) * 0.5 + 0.5) * (n - 1));
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}
