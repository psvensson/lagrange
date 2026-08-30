import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  deriveVerificationReports,
} from '../../scripts/checks/release-0-2-verification-derivation.js';
import {
  buildGithubGateReceipt,
  recordGithubGateReceipt,
} from '../../scripts/checks/record-github-gate-receipt.js';
import {
  newestSoakReportPath,
} from '../../scripts/checks/run-release-0-2-verification-scenarios.js';
import {
  GATE_RECEIPT_SCHEMA,
  GITHUB_GATE_RECEIPT_SCHEMA,
  GITHUB_REQUIRED_CHECK,
  RELEASE_VERSION,
  REQUIRED_GATE_RECEIPTS,
  SOAK_MIN_SAMPLES_PER_NODE,
  VERIFICATION_REASON,
  VERIFICATION_SCENARIO,
  VERIFICATION_VERDICT,
} from '../../scripts/checks/release-0-2-verification-constants.js';
import {
  computeSourceFingerprint,
} from '../../src/diagnostics/source-fingerprint.js';
import {
  scenarioHarnessProbe,
} from '../../scripts/solve/probes/scenario-harness.js';

// Deterministic witness for the release-0-2-verification-scenario-producer
// quest: the producer derives the three release-0-2-verification-v3
// frontier scenarios and the aggregate from recorded facts, fail-closed,
// with one typed verdictReason per scenario; the two helpers only record
// facts (the real exit code, the queried check-run conclusion). Every
// scenario below is a top-level test with an anchored name so the evidence
// harness can select it with --test-name-pattern.

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PRODUCER_SCRIPT = 'scripts/checks/run-release-0-2-verification-scenarios.js';
const GATE_RECEIPT_SCRIPT = 'scripts/checks/record-release-gate-receipt.js';
const TEMP_PREFIX = 'release-0-2-verification-';
const FIXTURE_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const FIXTURE_FINGERPRINT = 'f'.repeat(16);
const OTHER_FINGERPRINT = '0'.repeat(16);
const FIXTURE_TIMESTAMP = '2026-08-30T12:00:00.000Z';
const FIXTURE_NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const WITHIN_THRESHOLDS = 'within-thresholds';
const INSUFFICIENT_SAMPLES_REASON = 'insufficient-samples';
const CONCLUSION_FAILURE = 'failure';
const STATUS_COMPLETED = 'completed';
const FIXTURE_REPOSITORY = 'psvensson/lagrange';
const PROBE_EXIT_CODE = 3;
const HEX_16 = /^[0-9a-f]{16}$/u;
const SHA_40 = /^[0-9a-f]{40}$/u;
const SCENARIO_INDEX = 0;
const AGGREGATE_INDEX = 3;
const NODE_BINARY = 'node';
const PROBE_RECEIPT_NAME = 'probe-exit';
const PROBE_EXIT_SCRIPT = `process.exit(${PROBE_EXIT_CODE})`;
const CHECK_RUN_OLD_ID = 11;
const CHECK_RUN_NEW_ID = 12;
const CI_RUN_ID = 101;
const FULL_GATE_RUN_ID = 102;
const FULL_GATE_WORKFLOW_PATH = '.github/workflows/full-gate.yml';
const FULL_GATE_WORKFLOW_NAME = 'full-gate';
const EARLIER_TIMESTAMP = '2026-08-30T10:00:00.000Z';
const LATER_TIMESTAMP = '2026-08-30T11:00:00.000Z';
const OLDER_SOAK_TIMESTAMP = '2026-08-22T08:00:00.000Z';
const OTHER_VERSION = '0.1.0';
const STRING_EXIT_CODE = '0';
const SOAK_UNDATED_FILENAME = 'release-0-2-memory-soak.report.json';
const SOAK_DATED_FILENAME =
  'release-0-2-memory-soak-2026-08-25T05-40-00Z.report.json';
const PORCELAIN_ARGS = ['status', '--porcelain', '--', '.', ':!solve'];

function versionSources(version = RELEASE_VERSION) {
  return {
    packageJson: version,
    cli: version,
    entrypoint: version,
    chart: version,
    chartApp: version,
  };
}

function identity(overrides = {}) {
  return {
    headSha: FIXTURE_SHA,
    sourceFingerprint: FIXTURE_FINGERPRINT,
    releaseVersion: RELEASE_VERSION,
    versionSources: versionSources(),
    versionConsistent: true,
    ...overrides,
  };
}

function soakNode(nodeId, overrides = {}) {
  return {
    nodeId,
    metric: 'process_rss_bytes',
    analyzed: true,
    leakDetected: false,
    reason: WITHIN_THRESHOLDS,
    sampleCount: SOAK_MIN_SAMPLES_PER_NODE,
    ...overrides,
  };
}

// The exact per-node analysis shape of a real release-0-2-memory-soak
// report (scenarios[0].memoryLeak.nodes[]), plus the srcFingerprint stamp
// the fail-closed fingerprint binding reads from metadata.
function soakReport(options = {}) {
  const nodes = options.nodes || FIXTURE_NODE_IDS.map((id) => soakNode(id));
  const leakingNodes = nodes.filter((node) => node.leakDetected === true);
  return {
    timestamp: FIXTURE_TIMESTAMP,
    summary: {total: 1, passed: options.failed ? 0 : 1, failed: options.failed ? 1 : 0},
    optimizationSummary: {totalPriorityItems: 0},
    scenarios: [{
      scenario: 'sustained-write-throughput',
      passed: !options.failed,
      verdict: options.failed ? VERIFICATION_VERDICT.FAIL : VERIFICATION_VERDICT.PASS,
      memoryLeak: {
        enabled: true,
        analyzed: true,
        leakDetected: leakingNodes.length > 0,
        nodeCount: nodes.length,
        leakingNodeCount: leakingNodes.length,
        nodes,
      },
    }],
    metadata: {
      srcFingerprint: options.fingerprint ?? FIXTURE_FINGERPRINT,
    },
  };
}

function soakFact(report) {
  return {
    present: true,
    reportPath: 'test-output/reports/release-0-2-memory-soak-fixture.report.json',
    reportSha256: 'c'.repeat(64),
    report,
  };
}

function gateReceipt(name, overrides = {}) {
  return {
    schema: GATE_RECEIPT_SCHEMA,
    name,
    command: ['npm', 'run', name],
    exitCode: 0,
    signal: '',
    spawnError: '',
    startedAt: FIXTURE_TIMESTAMP,
    finishedAt: FIXTURE_TIMESTAMP,
    headSha: FIXTURE_SHA,
    treeClean: true,
    treeCleanAtFinish: true,
    sourceFingerprint: FIXTURE_FINGERPRINT,
    sourceFingerprintAtFinish: FIXTURE_FINGERPRINT,
    version: RELEASE_VERSION,
    ...overrides,
  };
}

function receiptsFact(overridesByName = {}, missing = []) {
  const receipts = {};
  for (const name of REQUIRED_GATE_RECEIPTS) {
    receipts[name] = missing.includes(name) ?
      {present: false, path: '', receipt: {}} :
      {
        present: true,
        path: `test-output/reports/release-gate-receipts/${name}.json`,
        receipt: gateReceipt(name, overridesByName[name] || {}),
      };
  }
  return receipts;
}

function gateJob(overrides = {}) {
  return {
    found: true,
    name: GITHUB_REQUIRED_CHECK.JOB,
    workflowName: GITHUB_REQUIRED_CHECK.WORKFLOW,
    workflowPath: GITHUB_REQUIRED_CHECK.WORKFLOW_PATH,
    runId: CI_RUN_ID,
    jobId: CHECK_RUN_NEW_ID,
    conclusion: GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION,
    status: STATUS_COMPLETED,
    completedAt: FIXTURE_TIMESTAMP,
    headSha: FIXTURE_SHA,
    htmlUrl: '',
    ...overrides,
  };
}

// The shape record-github-gate-receipt.js writes; overrides apply to the
// selected gateJob.
function remoteReceipt(overrides = {}, receiptOverrides = {}) {
  const job = gateJob(overrides);
  return {
    schema: GITHUB_GATE_RECEIPT_SCHEMA,
    sha: FIXTURE_SHA,
    repository: FIXTURE_REPOSITORY,
    requiredCheck: GITHUB_REQUIRED_CHECK.DISPLAY_NAME,
    requiredWorkflowPath: GITHUB_REQUIRED_CHECK.WORKFLOW_PATH,
    query: '',
    recordedAt: FIXTURE_TIMESTAMP,
    treeClean: true,
    workflowRunCount: 1,
    gateJobs: [job],
    gateJob: job,
    ...receiptOverrides,
  };
}

function remoteFact(receipt) {
  return {
    present: true,
    path: 'test-output/reports/release-gate-receipts/github-ci-gate.json',
    receipt,
  };
}

function passingFacts(overrides = {}) {
  return {
    identity: identity(),
    soak: soakFact(soakReport()),
    receipts: receiptsFact(),
    remote: remoteFact(remoteReceipt()),
    timestamp: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

function entryOf(derived, scenario) {
  const report = derived.reports.find((candidate) => candidate.scenario === scenario);
  return report.standardSummary.scenarios[SCENARIO_INDEX];
}

function assertVerdict(derived, scenario, verdict, reason) {
  const entry = entryOf(derived, scenario);
  assert.equal(entry.current.verdict, verdict, `${scenario} verdict`);
  assert.equal(entry.passed, verdict === VERIFICATION_VERDICT.PASS);
  assert.equal(entry.current.verdictReason, reason, `${scenario} reason`);
  return entry;
}

// GitHub Actions API shapes: a workflow run (carries the workflow file
// path) and one of its jobs.
function workflowRun(overrides = {}) {
  return {
    id: CI_RUN_ID,
    name: GITHUB_REQUIRED_CHECK.WORKFLOW,
    path: GITHUB_REQUIRED_CHECK.WORKFLOW_PATH,
    head_sha: FIXTURE_SHA,
    status: STATUS_COMPLETED,
    ...overrides,
  };
}

function fullGateRun() {
  return workflowRun({
    id: FULL_GATE_RUN_ID,
    name: FULL_GATE_WORKFLOW_NAME,
    path: FULL_GATE_WORKFLOW_PATH,
  });
}

function apiJob(overrides = {}) {
  return {
    id: CHECK_RUN_NEW_ID,
    run_id: CI_RUN_ID,
    name: GITHUB_REQUIRED_CHECK.JOB,
    head_sha: FIXTURE_SHA,
    status: STATUS_COMPLETED,
    conclusion: GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION,
    completed_at: FIXTURE_TIMESTAMP,
    html_url: 'https://github.com/psvensson/lagrange/actions/runs/101/job/12',
    ...overrides,
  };
}

// Injected queries over a {runId: [jobs]} table; records every query so
// the witness proves the network is never touched by anything else.
function injectedQueries(runs, jobsByRun, log = []) {
  return {
    queryWorkflowRuns: (repository, sha) => {
      log.push(['runs', repository, sha]);
      return {total_count: runs.length, workflow_runs: runs};
    },
    queryRunJobs: (repository, runId) => {
      log.push(['jobs', repository, runId]);
      const jobs = jobsByRun[runId] || [];
      return {total_count: jobs.length, jobs};
    },
  };
}

function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

async function withTempDirAsync(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  try {
    return await run(dir);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('soak-passing-report-passes: a soak report with every node analyzed, ' +
  '30 samples, within-thresholds, no leak, and the current fingerprint ' +
  'derives PASS', () => {
  const derived = deriveVerificationReports(passingFacts());
  const entry = assertVerdict(
    derived,
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.PASS,
    VERIFICATION_REASON.VERIFIED,
  );
  assert.equal(entry.detail.provenance.headCommit, FIXTURE_SHA);
  assert.equal(entry.detail.provenance.sourceFingerprint, FIXTURE_FINGERPRINT);
  assert.equal(entry.detail.provenance.releaseVersion, RELEASE_VERSION);
  assert.ok(entry.detail.conditions.every((condition) => condition.passed));
});

test('soak-analyzed-false-fails: one node with analyzed false fails the soak ' +
  'scenario with soak_node_not_analyzed naming the node', () => {
  const nodes = [soakNode('node-a'), soakNode('node-b', {analyzed: false})];
  const derived = deriveVerificationReports(
    passingFacts({soak: soakFact(soakReport({nodes}))}),
  );
  const entry = assertVerdict(
    derived,
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.SOAK_NODE_NOT_ANALYZED,
  );
  assert.equal(
    entry.current.verdictReasonDetail,
    `${VERIFICATION_REASON.SOAK_NODE_NOT_ANALYZED}: node-b`,
  );
});

test('soak-29-samples-fails: a node with 29 samples fails the soak scenario ' +
  'with soak_insufficient_samples', () => {
  const nodes = [
    soakNode('node-a'),
    soakNode('node-b', {sampleCount: SOAK_MIN_SAMPLES_PER_NODE - 1}),
  ];
  const derived = deriveVerificationReports(
    passingFacts({soak: soakFact(soakReport({nodes}))}),
  );
  assertVerdict(
    derived,
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.SOAK_INSUFFICIENT_SAMPLES,
  );
});

test('soak-insufficient-reason-fails: a node whose reason starts with ' +
  'insufficient- fails with soak_insufficient_analysis_reason', () => {
  const nodes = [
    soakNode('node-a'),
    soakNode('node-b', {reason: INSUFFICIENT_SAMPLES_REASON}),
  ];
  const derived = deriveVerificationReports(
    passingFacts({soak: soakFact(soakReport({nodes}))}),
  );
  assertVerdict(
    derived,
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.SOAK_INSUFFICIENT_REASON,
  );
});

test('soak-leak-fails: a detected leak on any node fails with ' +
  'soak_leak_detected', () => {
  const nodes = [soakNode('node-a'), soakNode('node-b', {leakDetected: true})];
  const derived = deriveVerificationReports(
    passingFacts({soak: soakFact(soakReport({nodes}))}),
  );
  assertVerdict(
    derived,
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.SOAK_LEAK_DETECTED,
  );
});

test('soak-fingerprint-mismatch-fails: a soak report stamped with another ' +
  'source fingerprint fails with fingerprint_mismatch; an unstamped report ' +
  'fails with fingerprint_missing; a failed soak scenario fails with ' +
  'soak_scenario_failed; no report at all fails with soak_report_missing', () => {
  const mismatch = deriveVerificationReports(passingFacts({
    soak: soakFact(soakReport({fingerprint: OTHER_FINGERPRINT})),
  }));
  assertVerdict(
    mismatch,
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.FINGERPRINT_MISMATCH,
  );
  const unstamped = soakReport();
  delete unstamped.metadata.srcFingerprint;
  assertVerdict(
    deriveVerificationReports(passingFacts({soak: soakFact(unstamped)})),
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.FINGERPRINT_MISSING,
  );
  assertVerdict(
    deriveVerificationReports(
      passingFacts({soak: soakFact(soakReport({failed: true}))}),
    ),
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.SOAK_SCENARIO_FAILED,
  );
  assertVerdict(
    deriveVerificationReports(passingFacts({
      soak: {present: false, reportPath: '', reportSha256: '', report: {}},
    })),
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.SOAK_REPORT_MISSING,
  );
});

test('local-receipts-complete-pass: all seven required receipts with exit 0 ' +
  'on the current HEAD and fingerprint derive PASS', () => {
  const derived = deriveVerificationReports(passingFacts());
  const entry = assertVerdict(
    derived,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.PASS,
    VERIFICATION_REASON.VERIFIED,
  );
  assert.deepEqual(
    Object.keys(entry.detail.provenance.gateReceipts),
    [...REQUIRED_GATE_RECEIPTS],
  );
});

test('local-receipt-missing-fails: one absent receipt fails with ' +
  'receipt_missing naming it', () => {
  const derived = deriveVerificationReports(
    passingFacts({receipts: receiptsFact({}, ['docker-smoke'])}),
  );
  const entry = assertVerdict(
    derived,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_MISSING,
  );
  assert.equal(
    entry.current.verdictReasonDetail,
    `${VERIFICATION_REASON.RECEIPT_MISSING}: docker-smoke`,
  );
});

test('local-receipt-wrong-sha-fails: a receipt recorded on another HEAD ' +
  'fails with receipt_sha_mismatch naming it; another fingerprint fails ' +
  'with receipt_fingerprint_mismatch', () => {
  const wrongSha = deriveVerificationReports(passingFacts({
    receipts: receiptsFact({'test-ci': {headSha: OTHER_SHA}}),
  }));
  const entry = assertVerdict(
    wrongSha,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_SHA_MISMATCH,
  );
  assert.equal(
    entry.current.verdictReasonDetail,
    `${VERIFICATION_REASON.RECEIPT_SHA_MISMATCH}: test-ci`,
  );
  const driftedTree = deriveVerificationReports(passingFacts({
    receipts: receiptsFact({
      'build-all': {sourceFingerprintAtFinish: OTHER_FINGERPRINT},
    }),
  }));
  assertVerdict(
    driftedTree,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_FINGERPRINT_MISMATCH,
  );
});

test('local-receipt-nonzero-exit-fails: a receipt recording a non-zero exit ' +
  'fails with receipt_failed naming it', () => {
  const derived = deriveVerificationReports(passingFacts({
    receipts: receiptsFact({'helm-package': {exitCode: 1}}),
  }));
  const entry = assertVerdict(
    derived,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_FAILED,
  );
  assert.equal(
    entry.current.verdictReasonDetail,
    `${VERIFICATION_REASON.RECEIPT_FAILED}: helm-package`,
  );
});

test('receipt-facts-only-exit-code-is-the-only-fact: a receipt with ' +
  'passed:true but no exitCode, or a string exitCode, fails with ' +
  'receipt_exit_code_missing naming it; passed is never honoured', () => {
  const noExit = gateReceipt('test-gate', {passed: true});
  delete noExit.exitCode;
  const receipts = receiptsFact();
  receipts['test-gate'].receipt = noExit;
  const handWritten = deriveVerificationReports(passingFacts({receipts}));
  const entry = assertVerdict(
    handWritten,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_EXIT_CODE_MISSING,
  );
  assert.equal(
    entry.current.verdictReasonDetail,
    `${VERIFICATION_REASON.RECEIPT_EXIT_CODE_MISSING}: test-gate`,
  );
  const stringExit = deriveVerificationReports(passingFacts({
    receipts: receiptsFact({
      'package-npm': {exitCode: STRING_EXIT_CODE, passed: true},
    }),
  }));
  assertVerdict(
    stringExit,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_EXIT_CODE_MISSING,
  );
  const allPassedFlags = {};
  for (const name of REQUIRED_GATE_RECEIPTS) {
    allPassedFlags[name] = {exitCode: 1, passed: true};
  }
  assertVerdict(
    deriveVerificationReports(
      passingFacts({receipts: receiptsFact(allPassedFlags)}),
    ),
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_FAILED,
  );
});

test('receipt-facts-only-version-mismatch-fails: a receipt recorded with ' +
  'another version fails with receipt_version_mismatch naming it', () => {
  const derived = deriveVerificationReports(passingFacts({
    receipts: receiptsFact({'docker-smoke': {version: OTHER_VERSION}}),
  }));
  const entry = assertVerdict(
    derived,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_VERSION_MISMATCH,
  );
  assert.equal(
    entry.current.verdictReasonDetail,
    `${VERIFICATION_REASON.RECEIPT_VERSION_MISMATCH}: docker-smoke`,
  );
});

test('receipt-facts-only-dirty-tree-fails: a gate receipt recorded on a ' +
  'dirty tree (at start or at finish) fails with receipt_tree_dirty naming ' +
  'it, and a GitHub receipt recorded on a dirty tree fails with ' +
  'remote_receipt_tree_dirty', () => {
  assertVerdict(
    deriveVerificationReports(passingFacts({
      receipts: receiptsFact({'build-all': {treeClean: false}}),
    })),
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_TREE_DIRTY,
  );
  const dirtyAtFinish = deriveVerificationReports(passingFacts({
    receipts: receiptsFact({'test-ci': {treeCleanAtFinish: false}}),
  }));
  const entry = assertVerdict(
    dirtyAtFinish,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.RECEIPT_TREE_DIRTY,
  );
  assert.equal(
    entry.current.verdictReasonDetail,
    `${VERIFICATION_REASON.RECEIPT_TREE_DIRTY}: test-ci`,
  );
  assertVerdict(
    deriveVerificationReports(passingFacts({
      remote: remoteFact(remoteReceipt({}, {treeClean: false})),
    })),
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.REMOTE_RECEIPT_TREE_DIRTY,
  );
});

test('receipt-facts-only-workflow-attribution: a ci gate failure plus a ' +
  'later full-gate gate success records the full-gate job under its own ' +
  'workflow path and the derivation fails with remote_workflow_mismatch; ' +
  'a ci gate success passes', () => {
  const log = [];
  const ciFailure = apiJob({
    conclusion: CONCLUSION_FAILURE,
    completed_at: EARLIER_TIMESTAMP,
  });
  const fullGateSuccess = apiJob({
    id: CHECK_RUN_OLD_ID,
    run_id: FULL_GATE_RUN_ID,
    completed_at: LATER_TIMESTAMP,
  });
  const receipt = buildGithubGateReceipt({
    sha: FIXTURE_SHA,
    repository: FIXTURE_REPOSITORY,
    queries: injectedQueries(
      [workflowRun(), fullGateRun()],
      {[CI_RUN_ID]: [ciFailure], [FULL_GATE_RUN_ID]: [fullGateSuccess]},
      log,
    ),
    recordedAt: FIXTURE_TIMESTAMP,
    treeClean: true,
  });
  assert.deepEqual(log, [
    ['runs', FIXTURE_REPOSITORY, FIXTURE_SHA],
    ['jobs', FIXTURE_REPOSITORY, CI_RUN_ID],
    ['jobs', FIXTURE_REPOSITORY, FULL_GATE_RUN_ID],
  ]);
  assert.equal(receipt.gateJobs.length, 2);
  assert.equal(receipt.gateJob.workflowPath, FULL_GATE_WORKFLOW_PATH);
  assert.equal(receipt.gateJob.workflowName, FULL_GATE_WORKFLOW_NAME);
  assert.equal(receipt.gateJob.runId, FULL_GATE_RUN_ID);
  assert.equal(
    receipt.gateJob.conclusion,
    GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION,
  );
  const derived = deriveVerificationReports(
    passingFacts({remote: remoteFact(receipt)}),
  );
  const entry = assertVerdict(
    derived,
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.REMOTE_WORKFLOW_MISMATCH,
  );
  assert.equal(entry.passed, false);
  const ciOnly = buildGithubGateReceipt({
    sha: FIXTURE_SHA,
    repository: FIXTURE_REPOSITORY,
    queries: injectedQueries([workflowRun()], {[CI_RUN_ID]: [apiJob()]}),
    recordedAt: FIXTURE_TIMESTAMP,
    treeClean: true,
  });
  assert.equal(
    ciOnly.gateJob.workflowPath,
    GITHUB_REQUIRED_CHECK.WORKFLOW_PATH,
  );
  assertVerdict(
    deriveVerificationReports(passingFacts({remote: remoteFact(ciOnly)})),
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    VERIFICATION_VERDICT.PASS,
    VERIFICATION_REASON.VERIFIED,
  );
});

test('receipt-facts-only-newest-soak-by-timestamp: the newest soak report ' +
  'is chosen by its own timestamp field, so an undated older file that ' +
  'sorts lexically last never wins', () => {
  withTempDir((dir) => {
    const older = soakReport();
    older.timestamp = OLDER_SOAK_TIMESTAMP;
    fs.writeFileSync(
      path.join(dir, SOAK_UNDATED_FILENAME),
      JSON.stringify(older),
    );
    fs.writeFileSync(
      path.join(dir, SOAK_DATED_FILENAME),
      JSON.stringify(soakReport()),
    );
    fs.writeFileSync(
      path.join(dir, 'unrelated.report.json'),
      JSON.stringify(soakReport()),
    );
    assert.equal(
      newestSoakReportPath(dir),
      path.join(dir, SOAK_DATED_FILENAME),
    );
    assert.equal(newestSoakReportPath(path.join(dir, 'absent')), '');
  });
});

test('remote-success-passes: a GitHub receipt recording ci / gate success ' +
  'for the exact current HEAD derives PASS', () => {
  const derived = deriveVerificationReports(passingFacts());
  assertVerdict(
    derived,
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    VERIFICATION_VERDICT.PASS,
    VERIFICATION_REASON.VERIFIED,
  );
});

test('remote-failure-fails: a failure conclusion fails with ' +
  'remote_check_not_success; a receipt for another sha fails with ' +
  'remote_sha_mismatch; no gate check run fails with remote_check_not_found', () => {
  assertVerdict(
    deriveVerificationReports(passingFacts({
      remote: remoteFact(remoteReceipt({conclusion: CONCLUSION_FAILURE})),
    })),
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.REMOTE_CHECK_NOT_SUCCESS,
  );
  const otherSha = remoteReceipt({headSha: OTHER_SHA});
  otherSha.sha = OTHER_SHA;
  assertVerdict(
    deriveVerificationReports(passingFacts({remote: remoteFact(otherSha)})),
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.REMOTE_SHA_MISMATCH,
  );
  assertVerdict(
    deriveVerificationReports(passingFacts({
      remote: remoteFact(remoteReceipt({found: false, conclusion: ''})),
    })),
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.REMOTE_CHECK_NOT_FOUND,
  );
});

test('remote-receipt-missing-fails: an absent GitHub receipt is FAIL with ' +
  'remote_receipt_missing, never skipped and never PASS', () => {
  const derived = deriveVerificationReports(passingFacts({
    remote: {present: false, path: '', receipt: {}},
  }));
  const entry = assertVerdict(
    derived,
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.REMOTE_RECEIPT_MISSING,
  );
  assert.equal(entry.current.passed, false);
  assert.equal(derived.allPassed, false);
});

test('aggregate-requires-all-children: the aggregate passes iff all three ' +
  'frontier scenarios pass and carries each child verdict and reason', () => {
  const allGreen = deriveVerificationReports(passingFacts());
  const aggregate = assertVerdict(
    allGreen,
    VERIFICATION_SCENARIO.AGGREGATE,
    VERIFICATION_VERDICT.PASS,
    VERIFICATION_REASON.VERIFIED,
  );
  assert.equal(allGreen.allPassed, true);
  assert.deepEqual(
    aggregate.detail.conditions.map((condition) => condition.receipt),
    [
      VERIFICATION_SCENARIO.MEMORY_SOAK,
      VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
      VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
    ],
  );
  assert.equal(allGreen.reports[AGGREGATE_INDEX].scenario, VERIFICATION_SCENARIO.AGGREGATE);
  const oneRed = deriveVerificationReports(passingFacts({
    remote: {present: false, path: '', receipt: {}},
  }));
  const redAggregate = assertVerdict(
    oneRed,
    VERIFICATION_SCENARIO.AGGREGATE,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.CHILD_SCENARIO_FAILED,
  );
  assert.equal(oneRed.allPassed, false);
  assert.equal(
    redAggregate.current.verdictReasonDetail,
    `${VERIFICATION_REASON.CHILD_SCENARIO_FAILED}: ` +
      VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
  );
  const remoteCondition = redAggregate.detail.conditions[AGGREGATE_INDEX - 1];
  assert.equal(remoteCondition.verdictReason, VERIFICATION_REASON.REMOTE_RECEIPT_MISSING);
  assert.equal(oneRed.reports[AGGREGATE_INDEX].optimizationSummary.totalPriorityItems, 1);
});

test('release-version-inconsistent-fails-every-scenario: a version source ' +
  'that is not 0.2.0 fails all four scenarios with ' +
  'release_version_inconsistent', () => {
  const derived = deriveVerificationReports(passingFacts({
    identity: identity({versionConsistent: false}),
  }));
  for (const scenario of [
    VERIFICATION_SCENARIO.MEMORY_SOAK,
    VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
    VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
  ]) {
    assertVerdict(
      derived,
      scenario,
      VERIFICATION_VERDICT.FAIL,
      VERIFICATION_REASON.RELEASE_VERSION_INCONSISTENT,
    );
  }
  assertVerdict(
    derived,
    VERIFICATION_SCENARIO.AGGREGATE,
    VERIFICATION_VERDICT.FAIL,
    VERIFICATION_REASON.CHILD_SCENARIO_FAILED,
  );
});

test('gate-receipt-helper-records-real-exit-code: the helper runs the ' +
  'command, records its real exit code with the current HEAD and source ' +
  'fingerprint, and exits with that code', () => {
  withTempDir((dir) => {
    const result = spawnSync(NODE_BINARY, [
      GATE_RECEIPT_SCRIPT,
      PROBE_RECEIPT_NAME,
      '--receipt-dir', dir,
      '--',
      NODE_BINARY, '-e', PROBE_EXIT_SCRIPT,
    ], {cwd: ROOT, encoding: 'utf8'});
    assert.equal(result.status, PROBE_EXIT_CODE, result.stderr);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, `${PROBE_RECEIPT_NAME}.json`), 'utf8'),
    );
    assert.equal(receipt.schema, GATE_RECEIPT_SCHEMA);
    assert.equal(receipt.name, PROBE_RECEIPT_NAME);
    assert.deepEqual(receipt.command, [NODE_BINARY, '-e', PROBE_EXIT_SCRIPT]);
    assert.equal(receipt.exitCode, PROBE_EXIT_CODE);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim();
    assert.equal(receipt.headSha, head);
    assert.match(receipt.sourceFingerprint, HEX_16);
    assert.equal(receipt.sourceFingerprintAtFinish, receipt.sourceFingerprint);
    assert.equal(receipt.version, RELEASE_VERSION);
    assert.ok(receipt.startedAt <= receipt.finishedAt);
    const porcelain = execFileSync(
      'git', PORCELAIN_ARGS, {cwd: ROOT, encoding: 'utf8'},
    ).trim();
    assert.equal(receipt.treeClean, porcelain === '');
    assert.equal(receipt.treeCleanAtFinish, porcelain === '');
  });
});

test('github-receipt-records-conclusion-without-network: the receipt ' +
  'builder records the newest completed ci gate job for the sha from ' +
  'injected workflow-run and job queries (an in-progress rerun never ' +
  'clobbers it, absence is found false), and the recorder writes it to ' +
  'disk without touching the network', async () => {
  const stale = apiJob({
    id: CHECK_RUN_OLD_ID,
    conclusion: CONCLUSION_FAILURE,
    completed_at: EARLIER_TIMESTAMP,
  });
  const inProgress = apiJob({
    id: CHECK_RUN_NEW_ID + 1,
    status: 'in_progress',
    conclusion: null,
    completed_at: null,
  });
  const foreign = apiJob({name: 'lint', conclusion: CONCLUSION_FAILURE});
  const receipt = buildGithubGateReceipt({
    sha: FIXTURE_SHA,
    repository: FIXTURE_REPOSITORY,
    queries: injectedQueries(
      [workflowRun()],
      {[CI_RUN_ID]: [stale, foreign, apiJob(), inProgress]},
    ),
    recordedAt: FIXTURE_TIMESTAMP,
    treeClean: true,
  });
  assert.equal(receipt.schema, GITHUB_GATE_RECEIPT_SCHEMA);
  assert.equal(receipt.sha, FIXTURE_SHA);
  assert.equal(receipt.workflowRunCount, 1);
  assert.equal(receipt.gateJobs.length, 3);
  assert.equal(receipt.gateJob.found, true);
  assert.equal(receipt.gateJob.jobId, CHECK_RUN_NEW_ID);
  assert.equal(
    receipt.gateJob.conclusion,
    GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION,
  );
  assert.equal(receipt.gateJob.headSha, FIXTURE_SHA);
  assert.equal(
    receipt.gateJob.workflowPath,
    GITHUB_REQUIRED_CHECK.WORKFLOW_PATH,
  );
  const absent = buildGithubGateReceipt({
    sha: FIXTURE_SHA,
    repository: FIXTURE_REPOSITORY,
    queries: injectedQueries([workflowRun()], {[CI_RUN_ID]: [foreign]}),
    recordedAt: FIXTURE_TIMESTAMP,
    treeClean: true,
  });
  assert.equal(absent.gateJob.found, false);
  assert.equal(absent.gateJob.conclusion, '');
  await withTempDirAsync(async (dir) => {
    const log = [];
    const outPath = path.join(dir, 'github-ci-gate.json');
    const written = await recordGithubGateReceipt({
      sha: FIXTURE_SHA,
      repository: FIXTURE_REPOSITORY,
      outPath,
      recordedAt: FIXTURE_TIMESTAMP,
      ...injectedQueries(
        [workflowRun()],
        {[CI_RUN_ID]: [apiJob({conclusion: CONCLUSION_FAILURE})]},
        log,
      ),
    });
    assert.deepEqual(log, [
      ['runs', FIXTURE_REPOSITORY, FIXTURE_SHA],
      ['jobs', FIXTURE_REPOSITORY, CI_RUN_ID],
    ]);
    const onDisk = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.deepEqual(onDisk, written.receipt);
    assert.equal(onDisk.gateJob.conclusion, CONCLUSION_FAILURE);
    assert.equal(typeof onDisk.treeClean, 'boolean');
  });
});

test('producer-cli-writes-discoverable-reports: the producer writes the ' +
  'four scenario reports in the shape the scenario-harness probe discovers, ' +
  'bound to the real HEAD and source fingerprint', async () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim();
  const fingerprint = await computeSourceFingerprint(path.join(ROOT, 'src'));
  assert.match(head, SHA_40);
  withTempDir((dir) => {
    const soakPath = path.join(dir, 'release-0-2-memory-soak-fixture.report.json');
    fs.writeFileSync(soakPath, JSON.stringify(soakReport({fingerprint})));
    const receiptDir = path.join(dir, 'receipts');
    fs.mkdirSync(receiptDir);
    for (const name of REQUIRED_GATE_RECEIPTS) {
      fs.writeFileSync(
        path.join(receiptDir, `${name}.json`),
        JSON.stringify(gateReceipt(name, {
          headSha: head,
          sourceFingerprint: fingerprint,
          sourceFingerprintAtFinish: fingerprint,
        })),
      );
    }
    const remote = remoteReceipt({headSha: head}, {sha: head});
    fs.writeFileSync(path.join(receiptDir, 'github-ci-gate.json'), JSON.stringify(remote));
    const reportDir = path.join(dir, 'reports');
    const result = spawnSync(NODE_BINARY, [
      PRODUCER_SCRIPT,
      '--soak-report', soakPath,
      '--receipt-dir', receiptDir,
      '--report-dir', reportDir,
    ], {cwd: ROOT, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const scenario of Object.values(VERIFICATION_SCENARIO)) {
      const measured = scenarioHarnessProbe.measure({scenario, reportDir});
      assert.equal(measured.done, true, `${scenario} discovered as done`);
      assert.equal(measured.metric, 0);
      assert.equal(measured.classification.verdict, VERIFICATION_VERDICT.PASS);
      assert.equal(measured.classification.verdictReason, VERIFICATION_REASON.VERIFIED);
      const written = JSON.parse(fs.readFileSync(measured.evidence, 'utf8'));
      const provenance = written.standardSummary.scenarios[SCENARIO_INDEX].detail.provenance;
      assert.equal(provenance.headCommit, head);
      assert.equal(provenance.sourceFingerprint, fingerprint);
      assert.equal(provenance.releaseVersion, RELEASE_VERSION);
      assert.deepEqual(provenance.versionSources, versionSources());
    }
    const missingRemote = spawnSync(NODE_BINARY, [
      PRODUCER_SCRIPT,
      '--soak-report', soakPath,
      '--receipt-dir', receiptDir,
      '--remote-receipt', path.join(dir, 'absent.json'),
      '--report-dir', path.join(dir, 'reports-missing-remote'),
    ], {cwd: ROOT, encoding: 'utf8'});
    assert.equal(missingRemote.status, 1);
    assert.match(missingRemote.stdout, new RegExp(VERIFICATION_REASON.REMOTE_RECEIPT_MISSING, 'u'));
  });
});

test('witness-deterministic: two derivations of identical facts produce ' +
  'byte-identical reports', () => {
  const first = deriveVerificationReports(passingFacts());
  const second = deriveVerificationReports(passingFacts());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const redFirst = deriveVerificationReports(
    passingFacts({receipts: receiptsFact({}, ['test-gate'])}),
  );
  const redSecond = deriveVerificationReports(
    passingFacts({receipts: receiptsFact({}, ['test-gate'])}),
  );
  assert.equal(JSON.stringify(redFirst), JSON.stringify(redSecond));
});
