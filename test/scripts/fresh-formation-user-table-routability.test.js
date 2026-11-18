import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  SCENARIO_TOPOLOGY_REQUIREMENT,
  run,
} from '../distributed/scenarios/fresh-formation-user-table-routability.js';
import {applySourceFingerprintConfig} from '../distributed/source-fingerprint-config.js';
import {PREDICATE} from '../distributed/harness/fresh-formation-routability-predicate.js';
import {questState, readLog} from '../../scripts/solve/store.js';
import {
  auditCanonicalCallerAndExportClosure,
  auditZeroUnresolvedViolations,
} from '../../scripts/checks/check-repository-legacy-fallback-closure.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../..');
const UTF8 = 'utf8';
const DIGEST_ALGO = 'sha256';
const DIGEST_ENCODING = 'hex';

const QUEST_ID = 'fresh-formation-user-table-routability';
const SEALED_AT = 'a23181ba9de7f308fcd681c3a4326099414bc267';
const SEALED_METRIC = 4;
const H1_EVIDENCE_SHA =
  'sha256:580c684639ae62838ef17f83cfacc1994d784700474be908e2faebde833eb9a9';

const SCENARIO_FILE_REL =
  'test/distributed/scenarios/fresh-formation-user-table-routability.js';
const PREDICATE_FILE_REL =
  'test/distributed/harness/fresh-formation-routability-predicate.js';
const MANIFEST_FILE_REL =
  'solve/quests/fresh-formation-user-table-routability/evidence/three-consecutive-runs-manifest.json';

const EXPECTED_MANIFEST_SCHEMA = 'fresh-formation-three-consecutive-runs/1';
const EXPECTED_RUN_COUNT = 3;
const EXPECTED_NODE_COUNT = 3;
const EXPECTED_SERVE_VIEW_COUNT = EXPECTED_NODE_COUNT * EXPECTED_NODE_COUNT;
const EXPECTED_MIN_DISTINCT_HOSTS = 0;
const EXPECTED_SUMMARY_PASSED = 1;
const EXPECTED_SUMMARY_FAILED = 0;
const EXPECTED_READ_FAILURES = 0;

const STATUS_SOLVED = 'solved';
const STATUS_PASS = 'pass';
const FUNCTION_TYPE = 'function';
const BOOT_PREFIX = 'boot:';
const HEX_64_PATTERN = /^[0-9a-f]{64}$/iu;

const BOUND_PATTERN_FORMATION =
  /const\s+FORMATION_BOUND_MS\s*=\s*420_?000\s*;/u;
const BOUND_PATTERN_FORMATION_POLL =
  /const\s+FORMATION_POLL_MS\s*=\s*1000\s*;/u;
const BOUND_PATTERN_QUIET_WINDOW =
  /const\s+QUIET_WINDOW_MS\s*=\s*TIMEOUTS\.QUIET_WINDOW\s*;/u;
const BOUND_PATTERN_ROUTABILITY =
  /const\s+ROUTABILITY_BOUND_MS\s*=\s*TIMEOUTS\.SCENARIO_DEFAULT\s*;/u;
const BOUND_PATTERN_PROJECTION =
  /const\s+PROJECTION_PERSISTENCE_BOUND_MS\s*=\s*1000\s*;/u;

const BLOCKER_QUEST_IDS = Object.freeze([
  'canonical-replica-completion-observation',
  'table-policy-outstanding-read-currency',
  'routing-overlay-complete-state-retirement',
  'formation-spread-progress-at-cause',
  'node-startup-natural-shutdown',
  'catalog-authority-and-visible-reconciliation',
  'cdc-recipient-domain-and-retained-debt',
  'cache-replica-incarnation-coherence',
  'management-action-authority',
  'load-admission-ingress-identity',
  'repository-legacy-fallback-closure',
]);

const PREDICATE_ORDER = Object.freeze(Object.values(PREDICATE));

async function computeCheckoutRef(rootDir = REPO_ROOT) {
  const fingerprinted = await applySourceFingerprintConfig({}, rootDir);
  return {
    srcFingerprint: fingerprinted?.docker?.srcFingerprint,
    srcFingerprintAlgo: fingerprinted?.docker?.srcFingerprintAlgo,
  };
}

function sha256Hex(data) {
  return createHash(DIGEST_ALGO).update(data).digest(DIGEST_ENCODING);
}

function verifyRetainedNodeLogs(runEntry) {
  assert.ok(
    Array.isArray(runEntry.nodeLogs) &&
      runEntry.nodeLogs.length === EXPECTED_NODE_COUNT,
    'runEntry.nodeLogs must be an array of 3 node log entries',
  );

  for (const logEntry of runEntry.nodeLogs) {
    assert.ok(logEntry.path, 'log entry must specify path');
    const logAbsPath = path.resolve(REPO_ROOT, logEntry.path);
    assert.ok(
      fs.existsSync(logAbsPath),
      `node log file must exist: ${logAbsPath}`,
    );

    const logBytes = fs.readFileSync(logAbsPath);
    assert.ok(
      logBytes.byteLength > 0,
      `node log file must not be empty: ${logEntry.path}`,
    );
    assert.equal(
      logBytes.byteLength,
      logEntry.bytes,
      `byteLength mismatch for ${logEntry.path}`,
    );

    assert.ok(
      HEX_64_PATTERN.test(logEntry.sha256),
      `sha256 digest invalid hex64 for ${logEntry.path}`,
    );
    const actualDigest = sha256Hex(logBytes);
    assert.equal(
      actualDigest,
      logEntry.sha256,
      `sha256 mismatch for ${logEntry.path}`,
    );
  }
}

function validatePredicateDetails(predMap) {
  const pServe = predMap.get(PREDICATE.SERVE_LANE_OPEN);
  assert.ok(pServe?.detail, 'a-serve-lane-open detail must exist');
  assert.ok(Array.isArray(pServe.detail.views), 'views must be array');
  assert.equal(pServe.detail.views.length, EXPECTED_SERVE_VIEW_COUNT);
  assert.ok(
    pServe.detail.views.every(
      (v) =>
        v.serveEligible === true &&
        Array.isArray(v.blockingReasonCodes) &&
        v.blockingReasonCodes.length === 0,
    ),
  );
  const observerNodeIds = new Set(
    pServe.detail.views.map((v) => v.observerNodeId),
  );
  const subjectNodeIds = new Set(pServe.detail.views.map((v) => v.nodeId));
  assert.equal(observerNodeIds.size, EXPECTED_NODE_COUNT);
  assert.equal(subjectNodeIds.size, EXPECTED_NODE_COUNT);

  const pSpread = predMap.get(PREDICATE.PRIORITY_SPREAD);
  assert.ok(pSpread?.detail, 'b-priority-spread detail must exist');
  assert.ok(
    Array.isArray(pSpread.detail.authoritative),
    'authoritative must be array',
  );
  assert.ok(pSpread.detail.authoritative.every((a) => a.satisfied === true));

  const pQuiet = predMap.get(PREDICATE.REPLICA_OPERATIONS_QUIET);
  assert.ok(pQuiet?.detail, 'c-replica-operations-quiet detail must exist');
  assert.equal(pQuiet.detail.authoritativeInFlightCount, 0);

  const pRoutable = predMap.get(PREDICATE.USER_TABLE_ROUTABLE);
  assert.ok(pRoutable?.detail, 'd-user-table-routable detail must exist');
  assert.equal(pRoutable.detail.countProbe?.error, null);

  const pReadback = predMap.get(PREDICATE.WRITE_READBACK);
  assert.ok(pReadback?.detail, 'e-write-readback detail must exist');
  assert.equal(pReadback.detail.insert?.rowCount, 1);
  assert.ok(Array.isArray(pReadback.detail.readbacks));
  assert.ok(pReadback.detail.readbacks.length >= EXPECTED_NODE_COUNT + 1);
  assert.ok(
    pReadback.detail.readbacks.every((r) => r.rowCount === 1 && !r.error),
  );

  const pIntegrity = predMap.get(PREDICATE.OBSERVATION_INTEGRITY);
  assert.ok(pIntegrity?.detail, 'observation-integrity detail must exist');
  assert.equal(pIntegrity.met, true);
  assert.equal(
    Array.isArray(pIntegrity.reasonCodes) ? pIntegrity.reasonCodes.length : 0,
    0,
  );
  assert.equal(pIntegrity.detail.failureCount, undefined);
}

function verifySingleRunReport(runEntry, index, context) {
  const relPath = runEntry.reportPath;
  assert.ok(relPath, `run ${index + 1} reportPath required`);
  assert.ok(
    !context.seenReportPaths.has(relPath),
    `duplicate report path across runs: ${relPath}`,
  );
  context.seenReportPaths.add(relPath);

  const reportPath = path.resolve(REPO_ROOT, relPath);
  assert.ok(fs.existsSync(reportPath), `report file must exist: ${reportPath}`);

  const reportBytes = fs.readFileSync(reportPath);
  const reportSha = sha256Hex(reportBytes);
  assert.ok(
    HEX_64_PATTERN.test(runEntry.reportSha256),
    `run ${index + 1} reportSha256 must be 64-hex`,
  );
  assert.equal(
    reportSha,
    runEntry.reportSha256,
    `run ${index + 1} report sha256 mismatch`,
  );
  assert.ok(
    !context.seenReportSha256.has(reportSha),
    `duplicate report sha256 across runs: ${reportSha}`,
  );
  context.seenReportSha256.add(reportSha);

  const report = JSON.parse(reportBytes.toString(UTF8));

  assert.equal(
    report.summary?.passed,
    EXPECTED_SUMMARY_PASSED,
    'summary.passed must be 1',
  );
  assert.equal(
    report.summary?.failed,
    EXPECTED_SUMMARY_FAILED,
    'summary.failed must be 0',
  );

  assert.equal(
    report.metadata?.srcFingerprint,
    context.currentCheckout.srcFingerprint,
    'report metadata.srcFingerprint must match checkout',
  );
  assert.equal(
    report.metadata?.executionTarget,
    'lab',
    'executionTarget must be lab',
  );
  assert.ok(
    Array.isArray(report.metadata?.executionHosts),
    'executionHosts must be array',
  );
  assert.equal(
    report.metadata.executionHosts.length,
    EXPECTED_NODE_COUNT,
    'must observe 3 executionHosts',
  );
  assert.equal(
    new Set(report.metadata.executionHosts).size,
    EXPECTED_NODE_COUNT,
    'executionHosts must be distinct',
  );

  const scenario = report.scenarios?.find((s) => s.scenario === QUEST_ID);
  assert.ok(scenario, `scenario ${QUEST_ID} must exist in report`);
  assert.equal(scenario.passed, true, 'scenario must have passed');
  assert.equal(scenario.outcome, 'passed', 'scenario.outcome must be passed');

  const startTimeMs = Date.parse(scenario.startedAt);
  assert.ok(Number.isFinite(startTimeMs), 'scenario.startedAt must be finite');
  assert.ok(
    startTimeMs > context.previousStartTimeMs,
    `run ${index + 1} startedAt (${startTimeMs}) must be strictly ` +
    `after previous (${context.previousStartTimeMs})`,
  );
  context.previousStartTimeMs = startTimeMs;

  const routability = scenario.details?.diagnostics?.freshFormationRoutability;
  assert.ok(
    routability,
    'scenario.details.diagnostics.freshFormationRoutability must be present',
  );
  assert.equal(
    routability.formationSatisfied,
    true,
    'formationSatisfied must be true',
  );
  assert.equal(
    routability.userTableIssuedAfterFormationSatisfied,
    true,
    'userTableIssuedAfterFormationSatisfied must be true',
  );
  assert.equal(routability.firstUnmet, null, 'firstUnmet must be null');
  assert.equal(
    routability.readFailureCount,
    EXPECTED_READ_FAILURES,
    'readFailureCount must be 0',
  );

  assert.ok(
    Array.isArray(routability.predicates),
    'routability.predicates must be an array',
  );
  const predMap = new Map(routability.predicates.map((p) => [p.id, p]));

  for (const predId of PREDICATE_ORDER) {
    const p = predMap.get(predId);
    assert.ok(p, `predicate ${predId} must be present`);
    assert.equal(p.met, true, `predicate ${predId} must be met`);
  }

  validatePredicateDetails(predMap);

  assert.ok(Array.isArray(runEntry.machineIds), 'machineIds must be an array');
  assert.equal(
    runEntry.machineIds.length,
    EXPECTED_NODE_COUNT,
    'must observe 3 machineIds',
  );
  const distinctMachineIds = new Set(runEntry.machineIds);
  assert.equal(
    distinctMachineIds.size,
    EXPECTED_NODE_COUNT,
    '3 distinct machineIds required',
  );
  for (const mId of distinctMachineIds) {
    assert.ok(
      String(mId).includes(BOOT_PREFIX),
      `machineId must contain ${BOOT_PREFIX}`,
    );
  }

  verifyRetainedNodeLogs(runEntry);
}

test('reproducer is registered with unchanged preregistered bounds and retained red H1 baseline', () => {
  assert.equal(typeof run, FUNCTION_TYPE, 'scenario run must be a function');
  assert.equal(
    SCENARIO_TOPOLOGY_REQUIREMENT.nodeCount,
    EXPECTED_NODE_COUNT,
    'nodeCount must be 3',
  );
  assert.equal(
    SCENARIO_TOPOLOGY_REQUIREMENT.minDistinctHosts,
    EXPECTED_MIN_DISTINCT_HOSTS,
    'minDistinctHosts must be 0',
  );

  const scenarioSource = fs.readFileSync(
    path.resolve(REPO_ROOT, SCENARIO_FILE_REL),
    UTF8,
  );
  assert.match(
    scenarioSource,
    BOUND_PATTERN_FORMATION,
    'FORMATION_BOUND_MS must be 420_000',
  );
  assert.match(
    scenarioSource,
    BOUND_PATTERN_FORMATION_POLL,
    'FORMATION_POLL_MS must be 1000',
  );
  assert.match(
    scenarioSource,
    BOUND_PATTERN_QUIET_WINDOW,
    'QUIET_WINDOW_MS must be TIMEOUTS.QUIET_WINDOW',
  );
  assert.match(
    scenarioSource,
    BOUND_PATTERN_ROUTABILITY,
    'ROUTABILITY_BOUND_MS must be TIMEOUTS.SCENARIO_DEFAULT',
  );

  const predicateSource = fs.readFileSync(
    path.resolve(REPO_ROOT, PREDICATE_FILE_REL),
    UTF8,
  );
  assert.match(
    predicateSource,
    BOUND_PATTERN_PROJECTION,
    'PROJECTION_PERSISTENCE_BOUND_MS must be 1000',
  );

  const log = readLog(REPO_ROOT, QUEST_ID);
  const sealEntry = log.find(
    (e) => e?.seal?.sealedAt === SEALED_AT &&
      e?.seal?.metric === SEALED_METRIC,
  );
  assert.ok(
    sealEntry,
    `log must retain seal at ${SEALED_AT} with metric ${SEALED_METRIC}`,
  );

  const h1Entry = log.find((e) => e?.evidence === H1_EVIDENCE_SHA);
  assert.ok(
    h1Entry,
    `log must retain H1 divergence evidence ${H1_EVIDENCE_SHA}`,
  );
});

test('first causal divergence and all bounded formation authority blockers are repaired at cause', () => {
  for (const blockerId of BLOCKER_QUEST_IDS) {
    const questLog = readLog(REPO_ROOT, blockerId);
    const state = questState(questLog);
    assert.equal(
      state.status,
      STATUS_SOLVED,
      `quest ${blockerId} must be solved`,
    );
    assert.ok(
      state.terminal !== null,
      `quest ${blockerId} must have terminal log entry`,
    );

    const receiptFile = path.resolve(
      REPO_ROOT,
      `solve/quests/${blockerId}/evidence/receipt.json`,
    );
    assert.ok(fs.existsSync(receiptFile), `receipt for ${blockerId} must exist`);
    const receipt = JSON.parse(fs.readFileSync(receiptFile, UTF8));
    assert.equal(
      receipt.status,
      STATUS_PASS,
      `receipt for ${blockerId} must pass`,
    );
  }

  const closure = auditCanonicalCallerAndExportClosure(REPO_ROOT);
  assert.equal(
    closure.isClosureComplete,
    true,
    'canonical caller closure must be complete',
  );

  const violations = auditZeroUnresolvedViolations(REPO_ROOT);
  assert.equal(
    violations.zeroUnresolvedViolations,
    true,
    'zero unresolved violations required',
  );
});

test('registered three-node formation scenario passes three consecutive runs on physical lab hosts', async () => {
  const manifestPath = path.resolve(REPO_ROOT, MANIFEST_FILE_REL);
  assert.ok(
    fs.existsSync(manifestPath),
    `manifest must exist at ${MANIFEST_FILE_REL}`,
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, UTF8));

  assert.equal(
    manifest.schema,
    EXPECTED_MANIFEST_SCHEMA,
    'manifest schema mismatch',
  );
  assert.ok(
    Array.isArray(manifest.runs) && manifest.runs.length === EXPECTED_RUN_COUNT,
    'manifest must contain exactly 3 runs',
  );
  const currentCheckout = await computeCheckoutRef(REPO_ROOT);
  assert.ok(
    currentCheckout.srcFingerprint,
    'expected source fingerprint must be defined',
  );
  assert.equal(
    manifest.srcFingerprint,
    currentCheckout.srcFingerprint,
    'manifest srcFingerprint mismatch',
  );

  const context = {
    currentCheckout,
    previousStartTimeMs: 0,
    seenReportPaths: new Set(),
    seenReportSha256: new Set(),
  };

  for (let index = 0; index < EXPECTED_RUN_COUNT; index += 1) {
    verifySingleRunReport(manifest.runs[index], index, context);
  }
});
