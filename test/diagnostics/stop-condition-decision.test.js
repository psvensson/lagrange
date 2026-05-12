import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {decideStopCondition} from '../../src/diagnostics/stop-condition-decision.js';
import {buildCausalAnalysis} from '../../src/diagnostics/index.js';
import {
  FAILURE_CLASS,
  STOP_CONDITION,
  STOP_OUTCOME,
} from '../../src/diagnostics/causal-analysis-schema.js';

const ACTIVE_ARTIFACT_PATH = 'test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/failure-bundle.json';
const ACTIVE_GATE_NO_PROGRESS_REPORT_PATH =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json';
const CURRENT_STARTUP_READINESS_SUPPORT_REPORT_PATH =
  'test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json';
const PASSED_REPORT_PATH = 'test-output/reports/canary-rolling-restart-local-latest.report.json';
const JSON_ENCODING_UTF8 = 'utf8';
const NODE_COMMAND = 'node';
const CLI_SCRIPT = 'scripts/analyze-causal-model.js';
const EXIT_SUCCESS = 0;
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;

function readActiveArtifact() {
  return JSON.parse(fs.readFileSync(ACTIVE_ARTIFACT_PATH, JSON_ENCODING_UTF8));
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

describe('StopConditionDecision', () => {
  it('contracts weak active-gate no-progress to classified priority backpressure', () => {
    const decision = decideStopCondition(readActiveArtifact());

    assert.equal(decision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assert.equal(decision.condition, STOP_CONDITION.CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(decision);
  });

  it('preserves weak active-gate no-progress classes after budget cascade classification', () => {
    const artifact = buildCausalAnalysis(readActiveArtifact());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_BACKPRESSURE);
    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(failureClasses.includes(FAILURE_CLASS.BUDGET_TIMEOUT_CASCADE), false);
    assertNoNullOrUndefined(artifact);
  });

  it('migrates active-gate no-progress to classified priority backpressure', () => {
    const artifact = buildCausalAnalysis(readActiveGateNoProgressReport());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_BACKPRESSURE);
    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(
      failureClasses.includes(FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE),
      false,
    );
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assertNoNullOrUndefined(artifact);
  });

  it('does not migrate weak zero-attempt active-gate no-progress to startup readiness', () => {
    const artifact = buildCausalAnalysis(readCurrentStartupReadinessSupportReport());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_BACKPRESSURE);
    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assertNoNullOrUndefined(artifact);
  });

  it('completes causal analysis for a passed rolling-restart report', () => {
    const artifact = buildCausalAnalysis(readPassedReport());

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.COMPLETE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.ALL_INVARIANTS_PASSED);
    assert.equal(artifact.summary.outcome, STOP_OUTCOME.COMPLETE);
    assertNoNullOrUndefined(artifact);
  });

  it('prints the canonical causal-analysis artifact through the CLI', () => {
    const result = spawnSync(NODE_COMMAND, [CLI_SCRIPT, ACTIVE_ARTIFACT_PATH], {
      encoding: JSON_ENCODING_UTF8,
    });
    const artifact = JSON.parse(result.stdout);

    assert.equal(result.status, EXIT_SUCCESS);
    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(artifact);
  });

  it('prints complete stop condition through the CLI for a passed report', () => {
    const result = spawnSync(NODE_COMMAND, [CLI_SCRIPT, PASSED_REPORT_PATH], {
      encoding: JSON_ENCODING_UTF8,
    });
    const artifact = JSON.parse(result.stdout);

    assert.equal(result.status, EXIT_SUCCESS);
    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.COMPLETE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.ALL_INVARIANTS_PASSED);
    assertNoNullOrUndefined(artifact);
  });
});
