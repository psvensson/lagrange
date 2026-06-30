import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {decideStopCondition} from '../../src/diagnostics/stop-condition-decision.js';
import {buildCausalAnalysis} from '../../src/diagnostics/index.js';
import {
  FAILURE_CLASS,
  STOP_CONDITION,
  STOP_OUTCOME,
} from '../../src/diagnostics/causal-analysis-schema.js';
import {
  buildActiveGateDominantWithReadinessBlockerReport,
  buildPassedRollingRestartReport,
  buildPostRebalanceClosureBlockedReport,
  buildSelectedSnapshotTimeoutReport,
  fixturePath,
  readActivePriorityBackpressureArtifact,
  readActivePriorityBackpressureReport,
  readPriorityBackpressureReport,
  readPublicationAckReport,
} from './causal-analysis-fixtures.js';

const JSON_ENCODING_UTF8 = 'utf8';
const NODE_COMMAND = 'node';
const CLI_SCRIPT = 'scripts/analyze-causal-model.js';
const EXIT_SUCCESS = 0;
const LOCAL_RUNTIME_OWNER_BLOCKER_REASON = 'local_runtime_owner_blocker';
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;
const ACTIVE_PRIORITY_BACKPRESSURE_FIXTURE =
  'publication-operation-active-gate-handoff.fixture.json';

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

function writeTemporaryReport(report) {
  const reportDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'causal-analysis-report-'),
  );
  const reportPath = path.join(reportDirectory, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report), JSON_ENCODING_UTF8);
  return reportPath;
}

describe('StopConditionDecision', () => {
  it('contracts weak active-gate no-progress to classified priority backpressure', () => {
    const decision = decideStopCondition(readActivePriorityBackpressureArtifact());

    assert.equal(decision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assert.equal(decision.condition, STOP_CONDITION.CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(decision);
  });

  it('preserves weak active-gate no-progress classes after budget cascade classification', () => {
    const artifact = buildCausalAnalysis(readActivePriorityBackpressureReport());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_BACKPRESSURE);
    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assert.equal(failureClasses.includes(FAILURE_CLASS.BUDGET_TIMEOUT_CASCADE), false);
    assertNoNullOrUndefined(artifact);
  });

  it('migrates active-gate no-progress to classified priority backpressure', () => {
    const artifact = buildCausalAnalysis(readActivePriorityBackpressureReport());
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
    const artifact = buildCausalAnalysis(readPriorityBackpressureReport());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_BACKPRESSURE);
    assert.ok(failureClasses.includes(FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT));
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assertNoNullOrUndefined(artifact);
  });

  it('does not migrate selected snapshot timeout support evidence to startup readiness', () => {
    const artifact = buildCausalAnalysis(buildSelectedSnapshotTimeoutReport());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.CONTINUE_LOCAL_FIX);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_LOCAL_BLOCKER);
    assert.ok(
      failureClasses.includes(
        FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
      ),
    );
    assert.equal(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED), false);
    assertNoNullOrUndefined(artifact);
  });

  it('keeps active-gate dominant evidence local when readiness blockers are downstream', () => {
    const artifact = buildCausalAnalysis(buildActiveGateDominantWithReadinessBlockerReport());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.CONTINUE_LOCAL_FIX);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_LOCAL_BLOCKER);
    assert.deepEqual(artifact.stopDecision.reasons, [
      LOCAL_RUNTIME_OWNER_BLOCKER_REASON,
    ]);
    assert.equal(
      artifact.failureTaxonomy.dominantFailureClass,
      FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
    );
    assert.equal(
      artifact.stopDecision.dominantFailureClass,
      FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
    );
    assert.ok(
      failureClasses.includes(
        FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
      ),
    );
    assert.ok(failureClasses.includes(FAILURE_CLASS.STARTUP_READINESS_BLOCKED));
    assertNoNullOrUndefined(artifact);
  });

  it('keeps deferred publication ACK frontier as a classified local blocker', () => {
    const artifact = buildCausalAnalysis(readPublicationAckReport());
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) => entry.failureClass);

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.CONTINUE_LOCAL_FIX);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_LOCAL_BLOCKER);
    assert.deepEqual(artifact.stopDecision.reasons, [
      LOCAL_RUNTIME_OWNER_BLOCKER_REASON,
    ]);
    assert.equal(artifact.summary.outcome, STOP_OUTCOME.CONTINUE_LOCAL_FIX);
    assert.ok(failureClasses.includes(FAILURE_CLASS.PUBLICATION_ACK_BLOCKED));
    assert.equal(
      artifact.failureTaxonomy.dominantFailureClass,
      FAILURE_CLASS.PUBLICATION_ACK_BLOCKED,
    );
    assertNoNullOrUndefined(artifact);
  });

  it('continues locally for post-rebalance closure blockers despite absent readiness evidence', () => {
    const artifact = buildCausalAnalysis(
      buildPostRebalanceClosureBlockedReport(),
    );
    const failureClasses = artifact.failureTaxonomy.classes.map((entry) =>
      entry.failureClass,
    );

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.CONTINUE_LOCAL_FIX);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.CLASSIFIED_LOCAL_BLOCKER);
    assert.deepEqual(artifact.stopDecision.reasons, [
      LOCAL_RUNTIME_OWNER_BLOCKER_REASON,
    ]);
    assert.equal(artifact.summary.outcome, STOP_OUTCOME.CONTINUE_LOCAL_FIX);
    assert.equal(
      artifact.failureTaxonomy.dominantFailureClass,
      FAILURE_CLASS.POST_REBALANCE_CLOSURE_BLOCKED,
    );
    assert.ok(
      failureClasses.includes(FAILURE_CLASS.POST_REBALANCE_CLOSURE_BLOCKED),
    );
    assert.equal(
      failureClasses.includes(FAILURE_CLASS.EVIDENCE_INCOMPLETE),
      false,
    );
    assertNoNullOrUndefined(artifact);
  });

  it('completes causal analysis for a passed rolling-restart report', () => {
    const artifact = buildCausalAnalysis(buildPassedRollingRestartReport());

    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.COMPLETE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.ALL_INVARIANTS_PASSED);
    assert.equal(artifact.summary.outcome, STOP_OUTCOME.COMPLETE);
    assertNoNullOrUndefined(artifact);
  });

  it('prints the canonical causal-analysis artifact through the CLI', () => {
    const result = spawnSync(NODE_COMMAND, [
      CLI_SCRIPT,
      fixturePath(ACTIVE_PRIORITY_BACKPRESSURE_FIXTURE),
    ], {
      encoding: JSON_ENCODING_UTF8,
    });
    const artifact = JSON.parse(result.stdout);

    assert.equal(result.status, EXIT_SUCCESS);
    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE);
    assertNoNullOrUndefined(artifact);
  });

  it('prints complete stop condition through the CLI for a passed report', () => {
    const passedReportPath = writeTemporaryReport(buildPassedRollingRestartReport());
    const result = spawnSync(NODE_COMMAND, [CLI_SCRIPT, passedReportPath], {
      encoding: JSON_ENCODING_UTF8,
    });
    const artifact = JSON.parse(result.stdout);

    assert.equal(result.status, EXIT_SUCCESS);
    assert.equal(artifact.stopDecision.outcome, STOP_OUTCOME.COMPLETE);
    assert.equal(artifact.stopDecision.condition, STOP_CONDITION.ALL_INVARIANTS_PASSED);
    assertNoNullOrUndefined(artifact);
  });
});
