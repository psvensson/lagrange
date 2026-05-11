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
  it('selects owner-boundary migration after budget ownership is classified', () => {
    const decision = decideStopCondition(readActiveArtifact());

    assert.equal(decision.outcome, STOP_OUTCOME.MIGRATE_OWNER_BOUNDARY);
    assert.equal(decision.condition, STOP_CONDITION.OWNER_BOUNDARY_MIGRATION);
    assertNoNullOrUndefined(decision);
  });

  it('preserves active failed artifact classes after budget cascade classification', () => {
    const artifact = buildCausalAnalysis(readActiveArtifact());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.MIGRATE_OWNER_BOUNDARY);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.OWNER_BOUNDARY_MIGRATION);
    assert.ok(failureClasses.includes(FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE));
    assert.ok(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED));
    assert.equal(failureClasses.includes(FAILURE_CLASS.BUDGET_TIMEOUT_CASCADE), false);
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
    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.MIGRATE_OWNER_BOUNDARY);
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
