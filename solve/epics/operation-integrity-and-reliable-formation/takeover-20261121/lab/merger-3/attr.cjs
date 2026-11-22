// usage: node attr.cjs <run dir> <ref dir>...   (paths relative to lab/)
const fs = require('fs'); const path = require('path');
const lab = '/mnt/data/peter/projects/lagrange-takeover-20261121/lab';
const load = (d) => { const f = path.join(lab, d, 'test-results.ndjson'); const m = new Map();
  if (!fs.existsSync(f)) return m;
  for (const l of fs.readFileSync(f, 'utf8').trim().split('\n')) { if (!l) continue; const r = JSON.parse(l); m.set(r.file, r); }
  return m; };
const [run, ...refs] = process.argv.slice(2);
const cur = load(run); const refMaps = refs.map(load);
const sel = JSON.parse(fs.readFileSync(path.join(lab, run, 'selection.json'), 'utf8')).files;
const missing = sel.filter((f) => !cur.has(f));
let pass = 0, fail = 0, asserts = 0; const lines = [];
for (const [file, r] of cur) {
  asserts += r.assertions; if (r.ok) pass++; else fail++;
  const refInfo = refMaps.map((m, i) => { const x = m.get(file); return x ? `${refs[i].split('/').pop()}:${x.ok ? 'ok' : 'FAIL'} ${x.assertions}${!x.ok ? ' ' + (x.firstFailureLine === r.firstFailureLine ? 'SAME' : 'other: ' + (x.firstFailureLine || '').slice(0, 90)) : ''}` : null; }).filter(Boolean);
  const changedCount = refMaps.map((m) => m.get(file)).filter((x) => x && x.ok && r.ok && x.assertions !== r.assertions);
  if (!r.ok) lines.push(`FAIL ${file} (${r.assertions}) ${(r.firstFailureLine || '').slice(0, 160)}\n    refs: ${refInfo.join(' | ') || 'none'}`);
  else if (changedCount.length) lines.push(`OK-COUNT-DIFF ${file} ${r.assertions}  refs: ${refInfo.join(' | ')}`);
  else if (refMaps.every((m) => !m.has(file))) lines.push(`OK-NOREF ${file} ${r.assertions}`);
  else { const red = refInfo.filter((s) => s.includes('FAIL')); if (red.length) lines.push(`CURED ${file} ${r.assertions}  refs: ${refInfo.join(' | ')}`); }
}
console.log(`${run}: ${cur.size}/${sel.length} files with results; ${pass} pass / ${fail} fail; ${asserts} assertions; missing: ${missing.join(', ') || 'none'}`);
console.log(lines.sort().join('\n'));
