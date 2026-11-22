import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  ARTIFACT_STATUS,
  CLAIM_KIND,
  LAB_EVIDENCE_SCHEMA,
  OUTCOME,
  PROBLEM_CODE,
  REMOTE_STATE,
  evaluateLabEvidence,
  renderLabEvidenceMarkdown,
} from '../../scripts/checks/lab-evidence-report.js';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

const CLI_SCRIPT = path.resolve(
  import.meta.dirname,
  '../../scripts/checks/lab-evidence-report.js',
);

const TEST_FILES = Object.freeze([
  'test/distributed/cdc-propagation.test.js',
  'test/transaction/locking-read.test.js',
]);

const EXPECTED_HOST_PROFILE = Object.freeze({
  runtime: {nodeVersion: 'v22.14.0'},
  backend: {consensus: 'raft-rs', storage: 'sqlite'},
  artifact: {digest: 'sha256:aaaabbbbccccddddeeeeffff'},
  config: {mode: 'local', retry: 0, isolationMode: 'separate-node-caches'},
});

function git(cwd, ...args) {
  return execGit(args, {cwd, encoding: 'utf8', env: gitProcessEnvironment()}).trim();
}

function writeFile(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), {recursive: true});
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

function buildPlacementLog({
  headSha,
  pid = 41001,
  env = 'factor:1.5 mode:local retry:0 timeout:300s lanecap:6 base:1111',
  rows,
}) {
  const passCount = rows.filter((row) => row.ok).length;
  const failCount = rows.length - passCount;
  const assertionCount = rows.reduce((sum, row) => sum + Number(row.assertions || 0), 0);
  const lines = [
    `placement-shell=${pid - 1}`,
    `placement-head=${headSha}`,
    'placement-prepared=import-graph',
    `placement-env=${env}`,
    `placement-pid=${pid}`,
    `# test-files planned=${rows.length}`,
  ];
  for (const row of rows) {
    lines.push(`${row.ok ? 'ok' : 'not ok'} ${row.file} (${row.assertions} assertions, 100ms)`);
  }
  lines.push(
    `# test-files total=${rows.length} pass=${passCount} fail=${failCount} ` +
    `assertions=${assertionCount}`,
  );
  for (const row of rows) {
    lines.push(`placement-results=${JSON.stringify(row)}`);
  }
  return `${lines.join('\n')}\n`;
}

function makeHostManifests(sha, overrides = {}) {
  const baseHosts = {
    'tv-dator': {
      host: 'tv-dator',
      sourceSha: sha,
      runtime: {nodeVersion: 'v22.14.0', nodePath: '/usr/bin/node'},
      backend: {consensus: 'raft-rs', storage: 'sqlite'},
      artifact: {digest: 'sha256:aaaabbbbccccddddeeeeffff', kind: 'native-rs', sourceSha: sha},
      config: {mode: 'local', retry: 0, isolationMode: 'separate-node-caches'},
    },
    'adam-laptop': {
      host: 'adam-laptop',
      sourceSha: sha,
      runtime: {nodeVersion: 'v22.14.0', nodePath: '/usr/bin/node'},
      backend: {consensus: 'raft-rs', storage: 'sqlite'},
      artifact: {digest: 'sha256:aaaabbbbccccddddeeeeffff', kind: 'native-rs', sourceSha: sha},
      config: {mode: 'local', retry: 0, isolationMode: 'separate-node-caches'},
    },
  };
  return Object.entries(baseHosts).map(([host, item]) => ({
    ...item,
    ...(overrides[host] || {}),
  }));
}

function createLabFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-evidence-p6-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));

  const repo = path.join(root, 'repo');
  const remote = path.join(root, 'remote.git');
  const jobDir = path.join(root, 'job-batch');

  fs.mkdirSync(repo);
  git(repo, 'init', '--quiet');
  git(repo, 'config', 'user.name', 'Lab Verifier');
  git(repo, 'config', 'user.email', 'verifier@example.invalid');

  writeFile(repo, 'src/prod.js', 'export const value = 1;\n');
  writeFile(repo, TEST_FILES[0], 'export const testA = true;\n');
  writeFile(repo, TEST_FILES[1], 'export const testB = true;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '-m', 'initial');
  const mainSha = git(repo, 'rev-parse', 'HEAD');

  git(root, 'init', '--bare', '--quiet', remote);
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '--quiet', 'origin', 'HEAD:main');

  writeFile(repo, 'src/prod.js', 'export const value = 2;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '-m', 'candidate');
  const candidateSha = git(repo, 'rev-parse', 'HEAD');

  if (options.pushCandidate !== false) {
    git(repo, 'push', '--quiet', 'origin', 'HEAD:work/candidate');
  }

  const hostRows = {
    'tv-dator': [
      {
        file: TEST_FILES[0],
        attempt: 1,
        ok: true,
        assertions: 14,
        durationMs: 1200,
        retriedOnce: false,
        firstFailureLine: null,
      },
    ],
    'adam-laptop': [
      {
        file: TEST_FILES[1],
        attempt: 1,
        ok: true,
        assertions: 9,
        durationMs: 850,
        retriedOnce: false,
        firstFailureLine: null,
      },
    ],
  };

  writeFile(
    jobDir,
    'exit.json',
    JSON.stringify({status: 0, finishedAt: '2026-11-22T20:00:00.000Z'}),
  );
  writeFile(
    jobDir,
    'selection.json',
    JSON.stringify({
      sha: candidateSha,
      requestedHost: 'split',
      split: true,
      checkBase: mainSha,
      files: [...TEST_FILES],
      plan: [{files: [...TEST_FILES], jobs: 4, resourceClass: 'ordinary'}],
    }),
  );

  for (const [host, rows] of Object.entries(hostRows)) {
    const short = candidateSha.slice(0, 12);
    writeFile(
      jobDir,
      `${short}-run1-100-${host}.log`,
      buildPlacementLog({headSha: candidateSha, pid: host === 'tv-dator' ? 41001 : 52002, rows}),
    );
    writeFile(
      jobDir,
      `test-results-${host}.ndjson`,
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
    );
  }

  return {root, repo, remote, jobDir, mainSha, candidateSha, hostRows};
}

test('positive control: admits pushed multi-host evidence and builds factual report', (t) => {
  const {repo, jobDir, mainSha, candidateSha} = createLabFixture(t);
  const report = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    targetRef: 'HEAD',
    remote: 'origin',
    remoteRef: 'refs/heads/work/candidate',
    originMainRef: 'refs/heads/main',
    requireRemotePushed: true,
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
    expectedHostProfile: EXPECTED_HOST_PROFILE,
    claimKind: CLAIM_KIND.CROSS_NODE_CDC_PROPAGATION,
    topologyScope: {
      topology: 'multi-host-three-node',
      isolatedNodeCaches: true,
      sharedCache: false,
      nodeCount: 3,
    },
    applicabilityReceipt: {
      productionFileDigests: {'src/prod.js': sha256Hex('export const value = 2;\n')},
      testFileDigests: {[TEST_FILES[0]]: sha256Hex('export const testA = true;\n')},
      evidenceApplicability: {
        schema: 'evidence-applicability/1',
        productionFiles: ['src/prod.js'],
        testFiles: [TEST_FILES[0]],
        rule: 'exact-sha256-of-production-and-test-files',
      },
    },
  });

  assert.equal(report.schema, LAB_EVIDENCE_SCHEMA);
  assert.equal(report.outcome, OUTCOME.ADMITTED);
  assert.deepEqual(report.problems, []);
  assert.equal(report.git.remoteState, REMOTE_STATE.PUSHED_MATCH);
  assert.equal(report.git.originMainSha, mainSha);
  assert.equal(report.git.pushed, true);
  assert.deepEqual(report.totals, {files: 2, pass: 2, fail: 0, assertions: 23});

  const md = renderLabEvidenceMarkdown(report);
  assert.match(md, new RegExp(candidateSha, 'u'));
  assert.match(md, /`tv-dator`/u);
  assert.match(md, /`adam-laptop`/u);
  assert.match(md, /`PUSHED_MATCH`/u);
  assert.match(md, /sha256:aaaabbbbccccddddeeeeffff/u);
});

test('explicit not_applicable artifact with reason is admitted when no built artifact expected', (t) => {
  const {repo, jobDir, candidateSha} = createLabFixture(t);
  const manifests = makeHostManifests(candidateSha, {
    'tv-dator': {artifact: {status: ARTIFACT_STATUS.NOT_APPLICABLE, reason: 'pure JS run'}},
    'adam-laptop': {artifact: {status: ARTIFACT_STATUS.NOT_APPLICABLE, reason: 'pure JS run'}},
  });
  const report = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: manifests,
    claimKind: CLAIM_KIND.FOCUSED_SUITE,
    topologyScope: {
      topology: 'multi-host-split',
      isolatedNodeCaches: true,
      sharedCache: false,
      nodeCount: 2,
    },
  });
  assert.equal(report.outcome, OUTCOME.ADMITTED);
  assert.match(report.markdown, /not_applicable \(pure JS run\)/u);
});

test('unpushed commit is labeled UNPUSHED and refused when requireRemotePushed is true', (t) => {
  const {repo, jobDir, candidateSha} = createLabFixture(t, {pushCandidate: false});
  const allowedUnpushed = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    requireRemotePushed: false,
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
    claimKind: CLAIM_KIND.FOCUSED_SUITE,
    topologyScope: {topology: 'split', isolatedNodeCaches: true, sharedCache: false, nodeCount: 2},
  });
  assert.equal(allowedUnpushed.outcome, OUTCOME.ADMITTED);
  assert.equal(allowedUnpushed.git.remoteState, REMOTE_STATE.UNPUSHED);
  assert.equal(allowedUnpushed.git.pushed, false);

  const requirePushed = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    requireRemotePushed: true,
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
    claimKind: CLAIM_KIND.FOCUSED_SUITE,
    topologyScope: {topology: 'split', isolatedNodeCaches: true, sharedCache: false, nodeCount: 2},
  });
  assert.equal(requirePushed.outcome, OUTCOME.REFUSED);
  assert.ok(requirePushed.problems.some((p) => p.code === PROBLEM_CODE.REMOTE_REF_NOT_PUSHED));
});

test('negative control 1: rejects placement-head or selection SHA mismatch', (t) => {
  const {repo, jobDir, mainSha, candidateSha, hostRows} = createLabFixture(t);
  const short = candidateSha.slice(0, 12);
  writeFile(
    jobDir,
    `${short}-run1-100-tv-dator.log`,
    buildPlacementLog({headSha: mainSha, pid: 41001, rows: hostRows['tv-dator']}),
  );

  const badHead = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
    claimKind: CLAIM_KIND.COMPOSED_LAB_PROOF,
    topologyScope: {topology: 'split', isolatedNodeCaches: true, sharedCache: false, nodeCount: 2},
  });
  assert.equal(badHead.outcome, OUTCOME.REFUSED);
  assert.ok(badHead.problems.some((p) => p.code === PROBLEM_CODE.EXECUTION_SHA_MISMATCH));

  writeFile(
    jobDir,
    'selection.json',
    JSON.stringify({sha: mainSha, files: [...TEST_FILES]}),
  );
  const badSel = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
  });
  assert.equal(badSel.outcome, OUTCOME.REFUSED);
  assert.ok(badSel.problems.some((p) => p.code === PROBLEM_CODE.SELECTION_SHA_MISMATCH));
});

test('negative control 2: rejects failed job, missing required file, tampered ndjson, or retry', (t) => {
  const {repo, jobDir, candidateSha, hostRows} = createLabFixture(t);
  writeFile(jobDir, 'exit.json', JSON.stringify({status: 1, finishedAt: '2026-11-22T20:01:00Z'}));
  const failedExit = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
  });
  assert.equal(failedExit.outcome, OUTCOME.REFUSED);
  assert.ok(failedExit.problems.some((p) => p.code === PROBLEM_CODE.JOB_FAILED));

  writeFile(jobDir, 'exit.json', JSON.stringify({status: 0, finishedAt: '2026-11-22T20:01:00Z'}));
  const missingReq = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
    requiredFiles: [...TEST_FILES, 'test/missing-witness.test.js'],
  });
  assert.equal(missingReq.outcome, OUTCOME.REFUSED);
  assert.ok(
    missingReq.problems.some((p) => p.code === PROBLEM_CODE.REQUIRED_FILE_MISSING_OR_FAILED),
  );

  const retriedRow = [{...hostRows['adam-laptop'][0], attempt: 2, retriedOnce: true}];
  const short = candidateSha.slice(0, 12);
  writeFile(
    jobDir,
    `${short}-run1-100-adam-laptop.log`,
    buildPlacementLog({headSha: candidateSha, pid: 52002, rows: retriedRow}),
  );
  const tamperedResults = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
  });
  assert.equal(tamperedResults.outcome, OUTCOME.REFUSED);
  assert.ok(tamperedResults.problems.some((p) => p.code === PROBLEM_CODE.RESULTS_MISMATCH));

  writeFile(
    jobDir,
    'test-results-adam-laptop.ndjson',
    `${JSON.stringify(retriedRow[0])}\n`,
  );
  const retryViolation = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
  });
  assert.equal(retryViolation.outcome, OUTCOME.REFUSED);
  assert.ok(retryViolation.problems.some((p) => p.code === PROBLEM_CODE.RETRY_POLICY_VIOLATED));
});

test('negative control 3: refuses shared-cache substitution claiming cross-node CDC propagation', (t) => {
  const {repo, jobDir, candidateSha} = createLabFixture(t);
  const sharedCacheClaim = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
    claimKind: CLAIM_KIND.CROSS_NODE_CDC_PROPAGATION,
    topologyScope: {
      topology: 'in-process-shared-cache',
      isolatedNodeCaches: false,
      sharedCache: true,
      nodeCount: 3,
    },
  });
  assert.equal(sharedCacheClaim.outcome, OUTCOME.REFUSED);
  assert.ok(
    sharedCacheClaim.problems.some(
      (p) => p.code === PROBLEM_CODE.SHARED_CACHE_SUBSTITUTION_REFUSED,
    ),
  );

  const missingTopology = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
    claimKind: CLAIM_KIND.CROSS_NODE_CDC_PROPAGATION,
  });
  assert.equal(missingTopology.outcome, OUTCOME.REFUSED);
  assert.ok(missingTopology.problems.some((p) => p.code === PROBLEM_CODE.TOPOLOGY_SCOPE_MISSING));
});

test('negative control 4: refuses wrong per-host artifact, runtime, backend, config, or missing manifest', (t) => {
  const {repo, jobDir, candidateSha} = createLabFixture(t);

  const missingManifest = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha).filter((item) => item.host !== 'adam-laptop'),
    expectedHostProfile: EXPECTED_HOST_PROFILE,
  });
  assert.equal(missingManifest.outcome, OUTCOME.REFUSED);
  assert.ok(missingManifest.problems.some((p) => p.code === PROBLEM_CODE.HOST_MANIFEST_MISSING));

  const wrongArtifact = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha, {
      'adam-laptop': {artifact: {digest: 'sha256:stale-artifact-9999', sourceSha: candidateSha}},
    }),
    expectedHostProfile: EXPECTED_HOST_PROFILE,
  });
  assert.equal(wrongArtifact.outcome, OUTCOME.REFUSED);
  assert.ok(wrongArtifact.problems.some((p) => p.code === PROBLEM_CODE.HOST_ARTIFACT_MISMATCH));

  const wrongRuntimeBackendConfig = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha, {
      'tv-dator': {
        runtime: {nodeVersion: 'v20.11.0'},
        backend: {consensus: 'js', storage: 'memory'},
        config: {mode: 'local', retry: 1, isolationMode: 'shared'},
      },
    }),
    expectedHostProfile: EXPECTED_HOST_PROFILE,
  });
  assert.equal(wrongRuntimeBackendConfig.outcome, OUTCOME.REFUSED);
  assert.ok(
    wrongRuntimeBackendConfig.problems.some((p) => p.code === PROBLEM_CODE.HOST_RUNTIME_MISMATCH),
  );
  assert.ok(
    wrongRuntimeBackendConfig.problems.some((p) => p.code === PROBLEM_CODE.HOST_BACKEND_MISMATCH),
  );
  assert.ok(
    wrongRuntimeBackendConfig.problems.some((p) => p.code === PROBLEM_CODE.HOST_CONFIG_MISMATCH),
  );
});

test('refuses symlink artifact escape, stale applicability/executionReport, and CLI exits non-zero', (t) => {
  const {root, repo, jobDir, candidateSha} = createLabFixture(t);
  const outside = writeFile(root, 'outside.json', JSON.stringify({status: 0}));
  fs.unlinkSync(path.join(jobDir, 'exit.json'));
  fs.symlinkSync(outside, path.join(jobDir, 'exit.json'));

  const symlinkReport = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [jobDir],
    hostManifests: makeHostManifests(candidateSha),
    applicabilityReceipt: {
      productionFileDigests: {'src/prod.js': '0'.repeat(64)},
      evidenceApplicability: {schema: 'evidence-applicability/1', productionFiles: ['src/prod.js']},
    },
    executionReport: {schema: 'wrong-schema'},
  });
  assert.equal(symlinkReport.outcome, OUTCOME.REFUSED);
  assert.ok(symlinkReport.problems.some((p) => p.code === PROBLEM_CODE.JOB_PATH_UNSAFE));
  assert.ok(symlinkReport.problems.some((p) => p.code === PROBLEM_CODE.APPLICABILITY_REFUSED));
  assert.ok(symlinkReport.problems.some((p) => p.code === PROBLEM_CODE.EXECUTION_REPORT_REFUSED));

  const missingJobs = evaluateLabEvidence({
    repoRoot: repo,
    claimedSha: candidateSha,
    remoteRef: 'refs/heads/work/candidate',
    jobDirs: [path.join(root, 'does-not-exist')],
    hostManifests: [],
  });
  assert.equal(missingJobs.outcome, OUTCOME.UNAVAILABLE);

  const cliFail = spawnSync(
    process.execPath,
    [
      CLI_SCRIPT,
      '--repo', repo,
      '--claimed-sha', candidateSha,
      '--remote-ref', 'refs/heads/work/candidate',
      '--job-dir', jobDir,
      '--format', 'markdown',
    ],
    {encoding: 'utf8', env: gitProcessEnvironment()},
  );
  assert.notEqual(cliFail.status, 0);
  assert.match(cliFail.stdout, /`REFUSED`/u);
});

test('CLI admits pushed multi-host evidence and writes markdown output file', (t) => {
  const {root, repo, jobDir, candidateSha} = createLabFixture(t);
  const manifestPath = writeFile(
    root,
    'host-manifests.json',
    JSON.stringify(makeHostManifests(candidateSha)),
  );
  const expectedPath = writeFile(
    root,
    'expected-host.json',
    JSON.stringify(EXPECTED_HOST_PROFILE),
  );
  const topologyPath = writeFile(
    root,
    'topology.json',
    JSON.stringify({
      topology: 'multi-host-three-node',
      isolatedNodeCaches: true,
      sharedCache: false,
      nodeCount: 3,
    }),
  );
  const outPath = path.join(root, 'reports', 'p6-summary.md');

  const cliPass = spawnSync(
    process.execPath,
    [
      CLI_SCRIPT,
      '--repo', repo,
      '--claimed-sha', candidateSha,
      '--remote-ref', 'refs/heads/work/candidate',
      '--require-remote-pushed',
      '--job-dir', jobDir,
      '--host-manifest', manifestPath,
      '--expected-host', expectedPath,
      '--claim-kind', CLAIM_KIND.CROSS_NODE_CDC_PROPAGATION,
      '--topology-json', topologyPath,
      '--required-files', TEST_FILES.join(','),
      '--format', 'markdown',
      '--out', outPath,
    ],
    {encoding: 'utf8', env: gitProcessEnvironment()},
  );
  assert.equal(cliPass.status, 0, cliPass.stderr);
  const rendered = fs.readFileSync(outPath, 'utf8');
  assert.match(rendered, /\| Outcome \| `ADMITTED` \|/u);
  assert.match(rendered, /files=2 pass=2 fail=0 assertions=23/u);
});
