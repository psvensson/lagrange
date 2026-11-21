// usage: node attr.mjs <merge results.ndjson> --ours <ndjson|log>... --theirs <ndjson|log>...
// Reads per-file results. ndjson: {file, ok, firstFailureLine}; .log: "[host] ok|not ok test/... " lines (status only).
import fs from 'node:fs';
const args = process.argv.slice(2);
const mergeFile = args.shift();
const refs = {ours: [], theirs: []};
let side = null;
for (const a of args) {
  if (a === '--ours' || a === '--theirs') { side = a.slice(2); continue; }
  refs[side].push(a);
}
function load(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.ndjson')) {
    for (const line of text.split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      map.set(r.file, {ok: r.ok, first: r.firstFailureLine, src: file.split('/').slice(-2).join('/')});
    }
  } else {
    for (const m of text.matchAll(/^\[[^\]]+\] (ok|not ok) (test\/\S+\.test\.js)/gm)) {
      if (!map.has(m[2])) map.set(m[2], {ok: m[1] === 'ok', first: undefined, src: file.split('/').pop()});
    }
    // First failing subtest per file from the interleaved TAP: "not ok N - title" followed
    // within a few lines (same host prefix) by "location: '.../test/X.test.js:L:C'".
    const lines = text.split('\n');
    const firsts = new Map();
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\[[^\]]+\]) (not ok \d+ - .*)$/);
      if (!m) continue;
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        if (!lines[j].startsWith(m[1])) continue;
        const loc = lines[j].match(/location: '.*?\/(test\/[^:']+\.test\.js):\d+/);
        if (loc) { if (!firsts.has(loc[1])) firsts.set(loc[1], m[2]); break; }
      }
    }
    for (const [f, first] of firsts) {
      const r = map.get(f);
      if (r && !r.ok) r.first = first;
    }
  }
  return map;
}
const pick = (files, f) => {
  // prefer a source with a first failure line
  let best;
  for (const file of files) {
    const r = load(file).get(f);
    if (!r) continue;
    if (!best || (best.first === undefined && r.first !== undefined)) best = r;
  }
  return best;
};
const merge = load(mergeFile);
const norm = (s) => (s ?? '').replace(/^not ok \d+ - /, '').trim();
let pass = 0; let fail = 0; const rows = [];
for (const [f, r] of [...merge.entries()].sort()) {
  if (r.ok) { pass++; continue; }
  fail++;
  const o = pick(refs.ours, f); const t = pick(refs.theirs, f);
  // ndjson first lines are truncated: equal when one normalized title is a prefix of the other
  const same = (x) => {
    if (!x || x.ok || x.first === undefined || x.first === null) return false;
    const a = norm(x.first); const b = norm(r.first);
    return a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a));
  };
  let cls;
  if (same(o) && same(t)) cls = 'IDENTICAL on both parents';
  else if (same(o)) cls = 'IDENTICAL on ours (23344cddc)';
  else if (same(t)) cls = 'IDENTICAL on theirs (f42102c84 src)';
  else if ((o && !o.ok && o.first === undefined) || (t && !t.ok && t.first === undefined)) cls = 'red on a parent, first assertion UNKNOWN (status-only reference)';
  else cls = 'NEW or DIFFERENT first assertion: needs parent run';
  rows.push({f, first: r.first, ours: o ? `${o.ok ? 'ok' : 'FAIL'} ${o.first ?? ''} [${o.src}]` : 'no reference',
    theirs: t ? `${t.ok ? 'ok' : 'FAIL'} ${t.first ?? ''} [${t.src}]` : 'no reference', cls});
}
console.log(`merge: ${merge.size} files, ${pass} pass, ${fail} fail`);
for (const r of rows) {
  console.log(`- ${r.f}\n    merge : ${r.first}\n    ours  : ${r.ours}\n    theirs: ${r.theirs}\n    => ${r.cls}`);
}
