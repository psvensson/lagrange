// @ts-nocheck
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const dir = 'test-output/reports';
const files = readdirSync(dir).filter((f) => f.endsWith('.report.json'));
const results = [];

for (const f of files) {
  try {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const s = r.scenarios && r.scenarios[0];
    if (!s || s.passed) continue;
    results.push({
      file: f,
      scenario: s.scenario,
      size: s.clusterSize || r.config?.size || '?',
      config: r.config?.configPath || r.metadata?.configPath || '?',
      ts: r.timestamp || '',
    });
  } catch (_e) { /* skip */ }
}

results.sort((a, b) => b.ts.localeCompare(a.ts));
const seen = new Set();
for (const r of results) {
  const key = r.scenario + ':' + r.size;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(
    r.scenario + ' | ' + r.size + 'n | ' + r.config + ' | ' + r.file,
  );
}
