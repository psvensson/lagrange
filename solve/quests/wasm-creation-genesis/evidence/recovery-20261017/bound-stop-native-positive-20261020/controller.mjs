import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root = '/mnt/data/peter/projects/.worktrees/generic-stop-custody-witness-20261020';
const sha = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error('Full checkpoint SHA required');
const evidence = path.join(root, 'test-output', 'rsraft-b-positive-20261020', sha);
fs.mkdirSync(evidence, {recursive: true});
const lab = await import(pathToFileURL(path.join(root, 'scripts/lab/probe.js')));
const runner = await import(pathToFileURL(path.join(root, 'scripts/run-classified-test-files.js')));
const files = [
  'test/wasm-service/bound-remove-physical-operation.integration.test.js',
  'test/wasm-service/bound-creation-handler-embedding.integration.test.js',
];
const env = {...process.env, LAGRANGE_RETRY_FAILED_ONCE: '0',
  LAGRANGE_LAB_AGENT: 'codex:physical-custody-review-B-positive-20261020'};
const commit = lab.labTestCommit({root, sha});
try {
  const plan = runner.planClassifiedTestFiles(commit.gitRoot, files,
    runner.lastResultsRoots(root));
  fs.writeFileSync(path.join(evidence, 'plan.json'), JSON.stringify({sha, files, plan,
    host: 'adams-gamla', retry: 0, evidenceCeiling: 'single-process native RF3 with component metadata'}, null, 2));
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
    sha, status: process.exitCode, retry: 0, files, host: 'adams-gamla'}, null, 2));
} finally {
  commit.release();
}
