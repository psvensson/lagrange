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

function remoteReceipt(overrides = {}) {
  return {
    schema: GITHUB_GATE_RECEIPT_SCHEMA,
    sha: FIXTURE_SHA,
    repository: FIXTURE_REPOSITORY,
    requiredCheck: GITHUB_REQUIRED_CHECK.DISPLAY_NAME,
    recordedAt: FIXTURE_TIMESTAMP,
    checkRunCount: 1,
    checkRun: {
      found: true,
      name: GITHUB_REQUIRED_CHECK.JOB,
      conclusion: GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION,
      status: STATUS_COMPLETED,
      id: CHECK_RUN_NEW_ID,
      htmlUrl: '',
      completedAt: FIXTURE_TIMESTAMP,
      headSha: FIXTURE_SHA,
      ...overrides,
    },
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

function checkRunPayload(runs) {
  return {total_count: runs.length, check_runs: runs};
}

function checkRun(overrides = {}) {
  return {
    id: CHECK_RUN_NEW_ID,
    name: GITHUB_REQUIRED_CHECK.JOB,
    head_sha: FIXTURE_SHA,
    status: STATUS_COMPLETED,
    conclusion: GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION,
    completed_at: FIXTURE_TIMESTAMP,
    html_url: 'https://github.com/psvensson/lagrange/runs/12',
    app: {slug: GITHUB_REQUIRED_CHECK.APP_SLUG},
    ...overrides,
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
  });
});

test('github-receipt-records-conclusion-without-network: the receipt builder ' +
  'records the newest github-actions gate check run for the sha from an ' +
  'injected check-runs payload, and absence as found false', () => {
  const stale = checkRun({
    id: CHECK_RUN_OLD_ID,
    conclusion: CONCLUSION_FAILURE,
    completed_at: '2026-08-30T11:00:00.000Z',
  });
  const foreign = checkRun({name: 'lint', conclusion: CONCLUSION_FAILURE});
  const receipt = buildGithubGateReceipt({
    sha: FIXTURE_SHA,
    repository: FIXTURE_REPOSITORY,
    payload: checkRunPayload([stale, foreign, checkRun()]),
    recordedAt: FIXTURE_TIMESTAMP,
  });
  assert.equal(receipt.schema, GITHUB_GATE_RECEIPT_SCHEMA);
  assert.equal(receipt.sha, FIXTURE_SHA);
  assert.equal(receipt.checkRunCount, 3);
  assert.equal(receipt.checkRun.found, true);
  assert.equal(receipt.checkRun.id, CHECK_RUN_NEW_ID);
  assert.equal(receipt.checkRun.conclusion, GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION);
  assert.equal(receipt.checkRun.headSha, FIXTURE_SHA);
  const absent = buildGithubGateReceipt({
    sha: FIXTURE_SHA,
    repository: FIXTURE_REPOSITORY,
    payload: checkRunPayload([foreign]),
    recordedAt: FIXTURE_TIMESTAMP,
  });
  assert.equal(absent.checkRun.found, false);
  assert.equal(absent.checkRun.conclusion, '');
  withTempDir((dir) => {
    const queries = [];
    const outPath = path.join(dir, 'github-ci-gate.json');
    const written = recordGithubGateReceipt({
      sha: FIXTURE_SHA,
      repository: FIXTURE_REPOSITORY,
      outPath,
      recordedAt: FIXTURE_TIMESTAMP,
      queryCheckRuns: (repository, sha) => {
        queries.push([repository, sha]);
        return checkRunPayload([checkRun({conclusion: CONCLUSION_FAILURE})]);
      },
    });
    assert.deepEqual(queries, [[FIXTURE_REPOSITORY, FIXTURE_SHA]]);
    const onDisk = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.deepEqual(onDisk, written.receipt);
    assert.equal(onDisk.checkRun.conclusion, CONCLUSION_FAILURE);
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
    const remote = remoteReceipt({headSha: head});
    remote.sha = head;
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
