// One-way guard for a navigability baseline update: compares, per baseline file,
// the (filePath, kind) counts of HEAD's committed baseline with the working-tree
// baseline. Exit 0 only when no count rose and no new (filePath, kind) appeared.
// usage (from the worktree): node nav-guard.mjs <report.txt>
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const report = process.argv[2];
const files = fs.readdirSync('scripts').filter((name) =>
  name.startsWith('check-guideline-navigability-baseline-') && name.endsWith('.json'));
const counts = (text) => {
  const map = new Map();
  for (const v of JSON.parse(text).violations ?? []) {
    const key = `${v.filePath}\t${v.kind}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};
const lines = [];
let raised = 0;
for (const name of files) {
  const path = `scripts/${name}`;
  const before = counts(execFileSync('git', ['show', `HEAD:${path}`], {encoding: 'utf8'}));
  const after = counts(fs.readFileSync(path, 'utf8'));
  let total = [0, 0];
  for (const value of before.values()) total[0] += value;
  for (const value of after.values()) total[1] += value;
  lines.push(`${name}: ${total[0]} -> ${total[1]}`);
  for (const [key, value] of after) {
    const old = before.get(key) ?? 0;
    if (value > old) { raised += 1; lines.push(`  RAISED ${key}: ${old} -> ${value}`); }
  }
  for (const [key, value] of before) {
    const now = after.get(key) ?? 0;
    if (now < value) lines.push(`  tightened ${key}: ${value} -> ${now}`);
  }
}
lines.push(raised === 0 ? 'GUARD OK' : `GUARD REFUSED: ${raised} raised`);
fs.writeFileSync(report, lines.join('\n') + '\n');
process.exitCode = raised === 0 ? 0 : 1;
