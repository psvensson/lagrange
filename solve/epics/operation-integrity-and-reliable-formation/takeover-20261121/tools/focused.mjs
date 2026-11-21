// Run explicit classified test files of one pinned commit on one named lab host,
// through the repository's own lab placement (machine lock, thermal gate).
// usage: node focused.mjs <40-hex sha> <host> <check-base sha> <out dir> <test files...>
import fs from 'node:fs';
import path from 'node:path';
import {labTestCommit, labTestDeps, runLabTest} from '/mnt/data/peter/projects/lagrange/scripts/lab/probe.js';
import {planClassifiedTestFiles} from '/mnt/data/peter/projects/lagrange/scripts/run-classified-test-files.js';

const root = '/mnt/data/peter/projects/lagrange';
const [sha, host, checkBase, out, ...files] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[a-f0-9]{40}$/.test(checkBase ?? '') || !host || !out ||
    files.length === 0 || files.some(file => !/^test\/[A-Za-z0-9_./-]+\.test\.js$/.test(file))) {
  throw new Error('usage: focused.mjs <sha40> <host> <checkBase40> <outDir> <test/...test.js>...');
}
fs.mkdirSync(out, {recursive: true});
const commit = labTestCommit({root, sha});
try {
  const startedAt = Date.now();
  const plan = planClassifiedTestFiles(commit.gitRoot, files);
  fs.writeFileSync(path.join(out, 'selection.json'), JSON.stringify({sha, host, checkBase, files, plan}, null, 2));
  const deps = labTestDeps({root});
  const status = await runLabTest({plan, commit, on: host, split: false, root, checkBase,
    env: {...process.env, LAGRANGE_RETRY_FAILED_ONCE: '0'}}, deps);
  const ledger = path.join(root, `test-output/reports/test-results-${host}.ndjson`);
  if (fs.existsSync(ledger) && fs.statSync(ledger).mtimeMs >= startedAt) {
    fs.copyFileSync(ledger, path.join(out, 'test-results.ndjson'));
  }
  const placementDirectory = path.join(root, 'test-output/placement');
  for (const name of fs.readdirSync(placementDirectory)) {
    if (!name.startsWith(sha.slice(0, 12)) ||
        ![`${host}.log`, `${host}.err`].some(suffix => name.endsWith(suffix))) continue;
    const original = path.join(placementDirectory, name);
    if (fs.statSync(original).mtimeMs >= startedAt) fs.copyFileSync(original, path.join(out, name));
  }
  fs.writeFileSync(path.join(out, 'exit.json'), JSON.stringify({status, finishedAt: new Date().toISOString()}));
  process.exitCode = status;
} finally {
  commit.release();
}
