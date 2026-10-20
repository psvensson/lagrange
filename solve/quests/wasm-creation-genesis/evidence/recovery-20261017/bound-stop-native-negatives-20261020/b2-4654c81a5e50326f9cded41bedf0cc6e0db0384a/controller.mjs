import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const label = process.argv[2];
const sha = process.argv[3];
if (!['b1', 'b2'].includes(label) || !/^[0-9a-f]{40}$/.test(sha ?? '')) {
  throw new Error('Reviewed mutant label and full checkpoint SHA required');
}
const root = `/mnt/data/peter/projects/.worktrees/bound-stop-custody-mutant-${label}-20261020`;
const positiveRoot = '/mnt/data/peter/projects/.worktrees/generic-stop-custody-witness-20261020';
const evidence = path.join(positiveRoot, 'test-output/rsraft-b-mutants-20261020', `${label}-${sha}`);
fs.mkdirSync(evidence, {recursive: true});
const lab = await import(pathToFileURL(path.join(root, 'scripts/lab/probe.js')));
const runner = await import(pathToFileURL(path.join(root, 'scripts/run-classified-test-files.js')));
const files = ['test/wasm-service/bound-remove-physical-operation.integration.test.js'];
const expected = {
  'test/wasm-service/bound-remove-physical-operation-fixture.js':
    'f11ef265730a036c342f7ad1344227ded9700046de70537643b1ac8dffe0af7f',
  'test/wasm-service/bound-remove-physical-operation.integration.test.js':
    '09a365dd29bb022821d2c16e4ee4f827d328c634a67a1eec70a56a57b41fe7c4',
};
for (const [file, hash] of Object.entries(expected)) {
  const bytes = execFileSync('git', ['show', `${sha}:${file}`], {cwd: root});
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== hash) {
    throw new Error(`Frozen oracle bytes changed: ${file}`);
  }
}
const env = {...process.env, LAGRANGE_RETRY_FAILED_ONCE: '0',
  LAGRANGE_LAB_AGENT: `codex:physical-custody-review-${label}-20261020`};
const commit = lab.labTestCommit({root, sha});
try {
  const plan = runner.planClassifiedTestFiles(commit.gitRoot, files,
    runner.lastResultsRoots(root));
  fs.writeFileSync(path.join(evidence, 'plan.json'), JSON.stringify({label, sha, files, plan,
    positiveSha: '0e19f5e07da01d6d8fe59131b7617ac8ed33b758', testHashes: expected,
    host: 'adams-gamla', retry: 0}, null, 2));
  fs.writeFileSync(path.join(evidence, 'source.patch'), execFileSync('git',
    ['diff', '0e19f5e07da01d6d8fe59131b7617ac8ed33b758', sha, '--', 'src'], {cwd: root}));
  const deps = lab.labTestDeps({root, env});
  const discover = deps.discover;
  deps.discover = async (exactSha) => {
    const result = await discover(exactSha);
    fs.writeFileSync(path.join(evidence, 'fleet.json'), JSON.stringify(result.fleet, null, 2));
    const host = result.fleet.find((entry) => entry.name === 'adams-gamla');
    if (host?.capability?.machineLock?.state !== 'free') {
      throw new Error('Authorized host adams-gamla is not free; root decision required');
    }
    if (!host.readiness?.ready || host.capability.repo.dependenciesCurrent !== true) {
      throw new Error('Authorized host adams-gamla dependencies/readiness unavailable');
    }
    console.log(JSON.stringify({event: 'exact-candidate-discovery', sha: exactSha, host}));
    return result;
  };
  process.exitCode = await lab.runLabTest({root, commit, plan,
    costs: runner.estimateFileCosts(plan, runner.lastResultsRoots(root)),
    on: 'adams-gamla', env}, deps);
  const returned = path.join(root, 'test-output/reports/test-results-adams-gamla.ndjson');
  if (fs.existsSync(returned)) {
    fs.copyFileSync(returned, path.join(evidence, 'test-results-adams-gamla.ndjson'));
  }
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({
    label, sha, status: process.exitCode, retry: 0, files, host: 'adams-gamla'}, null, 2));
} finally {
  commit.release();
}
