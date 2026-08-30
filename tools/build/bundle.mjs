// Pour the whole game into one file.
//
// There is no bundler in this project and there is not going to be one, so
// this is the smallest thing that does the job honestly: a scope-hoisting
// bundler. Every module is concatenated into a single module scope in
// dependency order, with the import and export keywords stripped out.
//
// Scope hoisting rather than a module registry, because canvas.js exports
// `let VIEW_W` and mutates it at runtime — the viewport is a live binding that
// half the codebase reads. Wrapping modules in functions would freeze those
// bindings at import time and quietly break every layout in the game. Pouring
// everything into one scope keeps them as what they already are: module-scope
// `let`s that everybody references directly.
//
// This is only safe because no two modules declare the same top-level name
// (tools/build/analyze.mjs asserts that), so nothing needs renaming.

import fs from 'fs';
import path from 'path';
import { topLevelNames } from './analyze.mjs';

const ROOT = 'src';
const ENTRY = 'src/main.js';

// --- read every module ------------------------------------------------------
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d).sort()) {
    const p = path.join(d, f).replace(/\\/g, '/');
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(ROOT);

const IMPORT = /^import\s*\{[\s\S]*?\}\s*from\s*'([^']+)'\s*;?[ \t]*$/gm;
const mods = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const deps = [];
  for (const m of src.matchAll(IMPORT)) {
    deps.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
  }
  mods.set(f, { src, deps });
}

// --- order them, and refuse to guess if there is a cycle --------------------
const order = [];
const state = new Map();
function visit(f, stack) {
  const st = state.get(f);
  if (st === 'done') return;
  if (st === 'open') {
    throw new Error('import cycle, which scope hoisting cannot order:\n  ' +
      stack.slice(stack.indexOf(f)).concat(f).join('\n  '));
  }
  if (!mods.has(f)) throw new Error('missing module: ' + f);
  state.set(f, 'open');
  for (const d of mods.get(f).deps) visit(d, stack.concat(f));
  state.set(f, 'done');
  order.push(f);
}
visit(ENTRY, []);
for (const f of files) visit(f, []);   // pull in anything the entry misses

// --- strip the module syntax ------------------------------------------------
function strip(src, file) {
  let out = src;
  // imports: the binding already exists in the shared scope
  out = out.replace(IMPORT, (m) => '//' + ' bundled: ' + m.split('\n')[0].trim().slice(0, 60));
  // `export { a }` / `export { a as b }` re-export lists
  out = out.replace(/^export\s*\{([^}]*)\}\s*;?[ \t]*$/gm, (m, list) => {
    const aliases = list.split(',').map(s => s.trim()).filter(Boolean)
      .map(s => {
        const [a, b] = s.split(/\s+as\s+/).map(x => x.trim());
        return b && b !== a ? `const ${b} = ${a};` : null;
      })
      .filter(Boolean);
    return aliases.join(' ') || '// bundled: export list';
  });
  // `export default X;` — nothing imports a default in this codebase
  out = out.replace(/^export\s+default\s+[^;]+;[ \t]*$/gm, '// bundled: default export');
  // `export const/let/function/class` -> plain declaration
  out = out.replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/gm, '');
  if (/^export\b/m.test(out)) {
    throw new Error('unhandled export form in ' + file + ':\n  ' +
      out.split('\n').filter(l => /^export\b/.test(l)).join('\n  '));
  }
  return out;
}

// Scope hoisting only works while every module owns its own top-level names.
// Checking here rather than trusting it: the first build of this shipped a
// duplicate `const` because a two-declarator line hid the second name, and a
// bundle that cannot parse is worse than no bundle.
const owners = new Map();
for (const f of order) {
  for (const n of topLevelNames(mods.get(f).src)) {
    if (!owners.has(n)) owners.set(n, []);
    owners.get(n).push(f);
  }
}
const clashes = [...owners].filter(([, fs2]) => fs2.length > 1);
if (clashes.length) {
  throw new Error('top-level names declared in more than one module:\n' +
    clashes.map(([n, fs2]) => `  ${n}  ${fs2.join('  ')}`).join('\n'));
}

const parts = order.map(f =>
  `\n// ${'='.repeat(74)}\n// ${f}\n// ${'='.repeat(74)}\n` + strip(mods.get(f).src, f));

// --- wrap it up -------------------------------------------------------------
const bundled = parts.join('\n');
const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const artifact = flags.includes('--artifact');
// Flags are not filenames. Reading argv[2] blindly wrote a file called
// "--artifact" into the repo root the first time the flag came first.
const out = args[0] || (artifact ? 'dist/_artifact-preview.html' : 'dist/ferret-fights-back.html');

// Same boot code either way: main.js is already in the file, so the dynamic
// import the served page uses has nothing left to fetch.
const boot = `${bundled}

// ---------------------------------------------------------------------------
//  boot
// ---------------------------------------------------------------------------
const __msg = document.getElementById('bootmsg');
const __err = document.getElementById('booterr');
window.addEventListener('error', (e) => {
  __err.classList.remove('hidden');
  __err.textContent = (e.error && e.error.stack) || e.message || String(e);
  __msg.textContent = 'Failed to start.';
});
try { boot(); } catch (e) {
  __err.classList.remove('hidden');
  __err.textContent = (e && e.stack) || String(e);
  __msg.textContent = 'Failed to start.';
}`;

let html;
if (artifact) {
  // The Artifact host supplies <!doctype>, <head> and <body>, so this ships
  // the page contents only — its own <title>, <style>, markup and script.
  const shell = fs.readFileSync('tools/build/artifact-shell.html', 'utf8');
  html = shell.trimEnd() + '\n\n<script type="module">\n' + boot + '\n</' + 'script>\n';
} else {
  const page = fs.readFileSync('index.html', 'utf8');
  const bootStart = page.indexOf('  <script type="module">');
  const bootEnd = page.indexOf('</script>', bootStart) + '</script>'.length;
  if (bootStart < 0) throw new Error('could not find the boot script in index.html');
  html = page.slice(0, bootStart) + '  <script type="module">\n' + boot + '\n  </' + 'script>' + page.slice(bootEnd);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${order.length} modules -> ${out}  (${(html.length / 1024).toFixed(0)} KB)${artifact ? '  [artifact]' : ''}`);
