// One-way tightening of the navigability count baselines (run from the worktree
// right after `node scripts/check-guideline-navigability.js --update-baseline`,
// which wrote the CURRENT sites into the baseline files). For every identity the
// checker matches on (filePath, kind, functionName) the new allowance is
// min(committed allowance, current count); entries come from the committed
// baseline (no identity is ever added, no allowance ever rises). Report: per file
// before -> after, and the identities that are above their committed allowance
// (reported, never absorbed).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const report = process.argv[2];
const identity = (v) => [v.filePath, v.kind, v.functionName].join('\u0000');
const lines = [];
let above = 0;
for (const name of fs.readdirSync('scripts')) {
  if (!name.startsWith('check-guideline-navigability-baseline-') || !name.endsWith('.json')) continue;
  const path = `scripts/${name}`;
  const committed = JSON.parse(execFileSync('git', ['show', `HEAD:${path}`],
    {encoding: 'utf8', maxBuffer: 1 << 30}));
  const current = JSON.parse(fs.readFileSync(path, 'utf8'));
  const currentCounts = new Map();
  for (const v of current.violations) {
    currentCounts.set(identity(v), (currentCounts.get(identity(v)) ?? 0) + 1);
  }
  const committedCounts = new Map();
  const kept = [];
  for (const v of committed.violations) {
    const key = identity(v);
    const used = committedCounts.get(key) ?? 0;
    committedCounts.set(key, used + 1);
    if (used < (currentCounts.get(key) ?? 0)) kept.push(v);
  }
  for (const [key, count] of currentCounts) {
    if (count > (committedCounts.get(key) ?? 0)) {
      above += count - (committedCounts.get(key) ?? 0);
      lines.push(`  ABOVE (not absorbed) ${key.replaceAll('\u0000', ' | ')}: ` +
        `${committedCounts.get(key) ?? 0} allowed, ${count} present`);
    }
  }
  lines.push(`${name}: ${committed.violations.length} -> ${kept.length}`);
  const unchanged = kept.length === committed.violations.length;
  const text = unchanged ? execFileSync('git', ['show', `HEAD:${path}`],
    {encoding: 'utf8', maxBuffer: 1 << 30}) :
    JSON.stringify({...committed, generatedAt: new Date().toISOString(),
      rawViolationCount: kept.length, violations: kept}, null, 2) + '\n';
  fs.writeFileSync(path, text);
}
lines.push(`above-baseline sites present and not absorbed: ${above}`);
fs.writeFileSync(report, lines.join('\n') + '\n');
