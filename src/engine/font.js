// A hand-drawn 5x7 bitmap font. Glyphs are authored as pixel strings, baked
// into a white atlas at load, then tinted per colour and cached. Variable
// width: empty columns are trimmed so text reads proportionally.

const G = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '.....'],
  'B': ['####.', '#...#', '####.', '#...#', '#...#', '####.', '.....'],
  'C': ['.####', '#....', '#....', '#....', '#....', '.####', '.....'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '####.', '.....'],
  'E': ['#####', '#....', '####.', '#....', '#....', '#####', '.....'],
  'F': ['#####', '#....', '####.', '#....', '#....', '#....', '.....'],
  'G': ['.####', '#....', '#....', '#..##', '#...#', '.####', '.....'],
  'H': ['#...#', '#...#', '#####', '#...#', '#...#', '#...#', '.....'],
  'I': ['#####', '..#..', '..#..', '..#..', '..#..', '#####', '.....'],
  'J': ['...##', '....#', '....#', '....#', '#...#', '.###.', '.....'],
  'K': ['#...#', '#..#.', '###..', '#.#..', '#..#.', '#...#', '.....'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#####', '.....'],
  'M': ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '.....'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '.....'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '.###.', '.....'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '.....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '.###.', '...#.'],
  'R': ['####.', '#...#', '#...#', '####.', '#..#.', '#...#', '.....'],
  'S': ['.####', '#....', '.###.', '....#', '....#', '####.', '.....'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '.....'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '.###.', '.....'],
  'V': ['#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..', '.....'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#', '.....'],
  'X': ['#...#', '.#.#.', '..#..', '..#..', '.#.#.', '#...#', '.....'],
  'Y': ['#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..', '.....'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#####', '.....'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '.###.', '.....'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '.###.', '.....'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#####', '.....'],
  '3': ['####.', '....#', '..##.', '....#', '#...#', '.###.', '.....'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '.....'],
  '5': ['#####', '#....', '####.', '....#', '#...#', '.###.', '.....'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '.###.', '.....'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.....'],
  '8': ['.###.', '#...#', '.###.', '#...#', '#...#', '.###.', '.....'],
  '9': ['.###.', '#...#', '#...#', '.####', '...#.', '.##..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '.....'],
  ',': ['.....', '.....', '.....', '.....', '..#..', '..#..', '.#...'],
  ':': ['.....', '..#..', '.....', '.....', '..#..', '.....', '.....'],
  ';': ['.....', '..#..', '.....', '.....', '..#..', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '.....', '..#..', '.....'],
  '?': ['.###.', '#...#', '...#.', '..#..', '.....', '..#..', '.....'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '\u2014': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '\u2013': ['.....', '.....', '.....', '.####', '.....', '.....', '.....'],
  '\u2026': ['.....', '.....', '.....', '.....', '.....', '#.#.#', '.....'],
  '\u2019': ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '\u2018': ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '\u201c': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '\u201d': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '\u00b7': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '/': ['....#', '...#.', '..#..', '.#...', '#....', '.....', '.....'],
  '\\': ['#....', '.#...', '..#..', '...#.', '....#', '.....', '.....'],
  '(': ['...#.', '..#..', '..#..', '..#..', '..#..', '...#.', '.....'],
  ')': ['.#...', '..#..', '..#..', '..#..', '..#..', '.#...', '.....'],
  '[': ['..##.', '..#..', '..#..', '..#..', '..#..', '..##.', '.....'],
  ']': ['.##..', '..#..', '..#..', '..#..', '..#..', '.##..', '.....'],
  '<': ['...#.', '..#..', '.#...', '..#..', '...#.', '.....', '.....'],
  '>': ['.#...', '..#..', '...#.', '..#..', '.#...', '.....', '.....'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '%': ['##..#', '##.#.', '..#..', '.#.##', '#..##', '.....', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '~': ['.....', '.....', '.##.#', '#.##.', '.....', '.....', '.....'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#....', '.###.', '.....'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '&': ['.##..', '#..#.', '.##..', '#.#.#', '#..#.', '.##.#', '.....'],
  '^': ['..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....'],
};

export const GLYPH_H = 7;
export const CAP_H = 6;
export const LINE_H = 9;

let atlasWhite = null;
const metrics = new Map();   // char -> {sx, w, off}
const tinted = new Map();    // colour string -> canvas
let atlasW = 0;

function buildAtlas() {
  const chars = Object.keys(G);
  let x = 0;
  const placed = [];
  for (const ch of chars) {
    const rows = G[ch];
    let first = 5, last = -1;
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < GLYPH_H; r++) {
        if (rows[r][c] === '#') { if (c < first) first = c; if (c > last) last = c; break; }
      }
    }
    let w;
    if (last < 0) { first = 0; w = 2; }            // space and friends
    else w = last - first + 1;
    metrics.set(ch, { sx: x, w, off: first });
    placed.push({ ch, rows, first, w, x });
    x += w + 1;
  }
  atlasW = x;
  const cv = document.createElement('canvas');
  cv.width = atlasW; cv.height = GLYPH_H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  for (const p of placed) {
    for (let r = 0; r < GLYPH_H; r++) {
      for (let c = 0; c < p.w; c++) {
        if (p.rows[r][p.first + c] === '#') ctx.fillRect(p.x + c, r, 1, 1);
      }
    }
  }
  atlasWhite = cv;
}

function atlasFor(color) {
  if (!atlasWhite) buildAtlas();
  let a = tinted.get(color);
  if (a) return a;
  const cv = document.createElement('canvas');
  cv.width = atlasW; cv.height = GLYPH_H;
  const ctx = cv.getContext('2d');
  ctx.drawImage(atlasWhite, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, atlasW, GLYPH_H);
  tinted.set(color, cv);
  return cv;
}

function normalize(str) { return String(str).toUpperCase(); }

export function measure(str, scale = 1, tracking = 1) {
  if (!atlasWhite) buildAtlas();
  const s = normalize(str);
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const m = metrics.get(s[i]) || metrics.get('?');
    w += m.w + tracking;
  }
  return Math.max(0, w - tracking) * scale;
}

export function textHeight(scale = 1) { return CAP_H * scale; }

/**
 * Draw text into a 2D context in screen space.
 * opts: { align:'left'|'center'|'right', alpha, shadow, scale, tracking, wave, waveAmp }
 */
export function drawText(ctx, str, x, y, color = '#e8d7b0', opts = {}) {
  if (!atlasWhite) buildAtlas();
  const s = normalize(str);
  const scale = opts.scale || 1;
  const tracking = opts.tracking == null ? 1 : opts.tracking;
  const align = opts.align || 'left';
  const w = measure(s, scale, tracking);
  let px = Math.round(x);
  if (align === 'center') px = Math.round(x - w / 2);
  else if (align === 'right') px = Math.round(x - w);
  const py = Math.round(y);

  if (opts.shadow) {
    const sc = typeof opts.shadow === 'string' ? opts.shadow : 'rgba(0,0,0,0.75)';
    _blit(ctx, s, px + scale, py + scale, sc, scale, tracking, opts);
  }
  _blit(ctx, s, px, py, color, scale, tracking, opts);
  return w;
}

function _blit(ctx, s, px, py, color, scale, tracking, opts) {
  const atlas = atlasFor(color);
  const prevAlpha = ctx.globalAlpha;
  if (opts.alpha != null) ctx.globalAlpha = prevAlpha * opts.alpha;
  let cx = px;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const m = metrics.get(ch) || metrics.get('?');
    let dy = py;
    if (opts.wave) dy += Math.round(Math.sin(opts.wave + i * 0.6) * (opts.waveAmp || 1));
    if (ch !== ' ') ctx.drawImage(atlas, m.sx, 0, m.w, GLYPH_H, cx, dy, m.w * scale, GLYPH_H * scale);
    cx += (m.w + tracking) * scale;
  }
  ctx.globalAlpha = prevAlpha;
}

/** Greedy word wrap. Returns an array of lines. */
export function wrapText(str, maxWidth, scale = 1, tracking = 1) {
  const words = String(str).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (measure(test, scale, tracking) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
