import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyFailures} from '../../src/diagnostics/failure-class-taxonomy.js';
import {FAILURE_CLASS, RESOLUTION_STRATEGY} from '../../src/diagnostics/causal-analysis-schema.js';

const ACTIVE_REPORT_PATH = 'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json';
const ACTIVE_ARTIFACT_PATH = 'test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/failure-bundle.json';
const ACTIVE_GATE_NO_PROGRESS_REPORT_PATH =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json';
const CURRENT_STARTUP_READINESS_SUPPORT_REPORT_PATH =
  'test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json';
const PASSED_REPORT_PATH = 'test-output/reports/canary-rolling-restart-local-latest.report.json';
const JSON_ENCODING_UTF8 = 'utf8';
const SCENARIO_ROLLING_RESTART = 'rolling-restart';
const REPORT_COUNT_FAILED = 1;
const REPORT_COUNT_PASSED = 0;
const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
const READINESS_CLASS_SNAPSHOT_TIMEOUT = 'snapshot_timeout';
const READINESS_RECOVERABILITY_TERMINAL = 'terminal';
const READINESS_TERMINAL_REASON_STALLED = 'stalled_no_progress';
const READINESS_SOURCE_SELECTED_SNAPSHOT_ERROR = 'selectedSnapshotError';
const READINESS_CAUSE_SNAPSHOT_TIMEOUT = 'snapshot_timeout';
const SNAPSHOT_COVERAGE_COUNT = 1;
const EXPECTED_NODE_COUNT = 5;
const BLOCKER_SNAPSHOT_COVERAGE_ONE_OF_FIVE = 'snapshot_coverage=1/5';
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;

function readActiveArtifact() {
  return JSON.parse(fs.readFileSync(ACTIVE_ARTIFACT_PATH, JSON_ENCODING_UTF8));
}

function readActiveReport() {
  return JSON.parse(fs.readFileSync(ACTIVE_REPORT_PATH, JSON_ENCODING_UTF8));
}

function readPassedReport() {
  return JSON.parse(fs.readFileSync(PASSED_REPORT_PATH, JSON_ENCODING_UTF8));
}

function readActiveGateNoProgressReport() {
  return JSON.parse(fs.readFileSync(ACTIVE_GATE_NO_PROGRESS_REPORT_PATH, JSON_ENCODING_UTF8));
}

function readCurrentStartupReadinessSupportReport() {
  return JSON.parse(
    fs.readFileSync(CURRENT_STARTUP_READINESS_SUPPORT_REPORT_PATH, JSON_ENCODING_UTF8),
  );
}

function buildSelectedSnapshotTimeoutReport() {
  return {
    summary: {
      passed: REPORT_COUNT_PASSED,
      failed: REPORT_COUNT_FAILED,
    },
    scenarios: [
      {
        scenario: SCENARIO_ROLLING_RESTART,
        passed: false,
        readinessFailure: {
          classCode: READINESS_CLASS_SNAPSHOT_TIMEOUT,
          recoverability: READINESS_RECOVERABILITY_TERMINAL,
          terminalReason: READINESS_TERMINAL_REASON_STALLED,
          source: READINESS_SOURCE_SELECTED_SNAPSHOT_ERROR,
          cause: READINESS_CAUSE_SNAPSHOT_TIMEOUT,
        },
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckCount: REPORT_COUNT_PASSED,
          blockedNodeCount: REPORT_COUNT_PASSED,
          missingPublishedCount: REPORT_COUNT_PASSED,
          recoveryProtocolState: PUBLICATION_PROTOCOL_STEADY_PUBLISHED,
          activeGate: {
            state: ACTIVE_GATE_STATE_TIMED_OUT,
            ready: false,
            progress: {
              expectedNodeCount: EXPECTED_NODE_COUNT,
              snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
              snapshotCoverageComplete: false,
              priorityRecoveryProgressClasses: {
                unresolvedSemanticStateIds: [],
                blockedPartitionIds: [],
              },
              blockers: [BLOCKER_SNAPSHOT_COVERAGE_ONE_OF_FIVE],
            },
          },
        },
      },
    ],
  };
}

function assertNoNullOrUndefined(value) {
  assert.notEqual(value, NULL_VALUE);
  assert.notEqual(value, UNDEFINED_VALUE);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoNullOrUndefined(item);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const childValue of Object.values(value)) {
      assertNoNullOrUndefined(childValue);
    }
  }
}

describe('FailureClassTaxonomy', () => {
  it('normalizes weak active-gate no-progress evidence into causal failure classes', () => {
    const taxonomy = classifyFailures(readActiveArtifact());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(taxonomy);
  });

  it('contracts report and failure-bundle weak readiness evidence consistently', () => {
    const reportTaxonomy = classifyFailures(readActiveReport());
    const artifactTaxonomy = classifyFailures(readActiveArtifact());
    const reportClasses = reportTaxonomy.classes.map((entry) => entry.failureClass);
    const artifactClasses = artifactTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(reportClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(artifactClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assertNoNullOrUndefined(reportTaxonomy);
    assertNoNullOrUndefined(artifactTaxonomy);
  });

  it('migrates active-gate no-progress behind in-flight priority recovery', () => {
    const taxonomy = classifyFailures(readActiveGateNoProgressReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(
      failureClasses.includes(FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE),
      false,
    );
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(taxonomy);
  });

  it('treats weak zero-attempt startup readiness no-progress as inherited active-gate evidence', () => {
    const taxonomy = classifyFailures(readCurrentStartupReadinessSupportReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(taxonomy);
  });

  it('treats selected snapshot timeout as inherited active-gate evidence', () => {
    const taxonomy = classifyFailures(buildSelectedSnapshotTimeoutReport());
    const failureClasses = taxonomy.classes.map((entry) => entry.failureClass);

    assert.ok(
      failureClasses.includes(
        FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
      ),
    );
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.LOCAL_RUNTIME_OWNER_FIX);
    assertNoNullOrUndefined(taxonomy);
  });

  it('classifies a passed rolling-restart report without blockers as healthy', () => {
    const taxonomy = classifyFailures(readPassedReport());

    assert.equal(taxonomy.dominantFailureClass, FAILURE_CLASS.HEALTHY);
    assert.equal(taxonomy.resolutionStrategy, RESOLUTION_STRATEGY.NO_ACTION);
    assertNoNullOrUndefined(taxonomy);
  });
});
