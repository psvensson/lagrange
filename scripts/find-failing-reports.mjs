import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const LOCAL_STR_QUESTION = '?';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_17XHO = ' | ';
const LOCAL_STR_N = 'n | ';

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
      size: s.clusterSize || r.config?.size || LOCAL_STR_QUESTION,
      config: r.config?.configPath || r.metadata?.configPath || LOCAL_STR_QUESTION,
      ts: r.timestamp || LOCAL_STR_EMPTY,
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
    r.scenario + LOCAL_STR_17XHO + r.size + LOCAL_STR_N + r.config + LOCAL_STR_17XHO + r.file,
  );
}
