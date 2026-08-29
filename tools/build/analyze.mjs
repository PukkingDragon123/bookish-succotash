// What would collide if every module were poured into one scope?
import fs from 'fs';
import path from 'path';

const ROOT = 'src';
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(ROOT);

export function topLevelNames(src) {
  const names = new Set();
  for (const line of src.split('\n')) {
    // function / class: one name, easy
    let m = /^(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) { names.add(m[1]); continue; }
    // const / let / var: possibly several declarators on one statement, e.g.
    //   const MIN_W = 340, MAX_W = 980;
    // Missing the second one is exactly the bug that broke the first build.
    m = /^(?:export\s+)?(const|let|var)\s+([\s\S]*)$/.exec(line);
    if (!m) continue;
    let depth = 0, buf = '', parts = [];
    for (const ch of m[2]) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
      buf += ch;
    }
    parts.push(buf);
    for (const part of parts) {
      const head = part.split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(head)) { names.add(head); continue; }
      // destructured:  const { a, b: c } = ...
      const d = /^[{[]([^}\]]*)[}\]]$/.exec(head);
      if (d) for (const n of d[1].split(',')) {
        const id = n.split(':').pop().trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(id)) names.add(id);
      }
    }
  }
  return names;
}

const owners = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const names = topLevelNames(src);
  for (const n of names) {
    if (!owners.has(n)) owners.set(n, []);
    owners.get(n).push(f);
  }
}

const dupes = [...owners].filter(([, fs2]) => fs2.length > 1);
console.log('modules:', files.length, ' top-level names:', owners.size, ' collisions:', dupes.length);
for (const [n, fs2] of dupes.sort((a, b) => b[1].length - a[1].length)) {
  console.log('  ' + n.padEnd(22) + fs2.join('  '));
}
