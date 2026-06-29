import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  REQUIRED_VERDICTS,
  ROLLING_RESTART_LIVENESS_VERDICT,
  buildRollingRestartLivenessVerdict,
} from '../../scripts/rolling-restart-liveness-classifier.js';

const NODE_BIN = process.execPath;
const SCRIPT_PATH = 'scripts/analyze-rolling-restart-liveness.js';
const ENCODING_UTF8 = 'utf8';
const FIXTURE_DIRECTORY =
  'test/scripts/__fixtures__/rolling-restart-liveness';
const TOPOLOGY_FIXTURE_DIRECTORY =
  'test/scripts/__fixtures__/topology-convergence';
const RUN1_REPORT_PATH =
  'test-output/reports/stat-gate-20260629T045155Z-run1.report.json';
const ENQUEUE_BACKLOG_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/enqueue-backlog-no-progress.fixture.json`;
const SLOW_PROGRESS_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/publication-slow-progress.fixture.json`;
const NO_ENABLED_ACTION_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/publication-no-enabled-action.fixture.json`;
const EXECUTED_NO_VISIBILITY_FIXTURE_PATH =
  `${FIXTURE_DIRECTORY}/publication-executed-no-visibility.fixture.json`;
const DRAIN_STALL_FIXTURE_PATH =
  `${TOPOLOGY_FIXTURE_DIRECTORY}/priority-workflow-timeout-transition-deferred.fixture.json`;

describe('rolling restart liveness classifier', () => {
  it('publishes the full verdict taxonomy', () => {
    assert.deepEqual(REQUIRED_VERDICTS, [
      ROLLING_RESTART_LIVENESS_VERDICT.OBSERVED_PROGRESSING_BUDGET_EXHAUSTED,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_NO_ENABLED_ACTION,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_ENABLED_ACTION_NOT_EXECUTED,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_EXECUTED_NO_VISIBILITY,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_DOWNSTREAM_WORKFLOW_PROGRESS,
      ROLLING_RESTART_LIVENESS_VERDICT.INSUFFICIENT_EVIDENCE,
    ]);
  });

  it('classifies latest publication_missing_active_node run without progress hand-waving', () => {
    const verdict = runAnalyzer(RUN1_REPORT_PATH);

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.INSUFFICIENT_EVIDENCE,
    );
    assert.notEqual(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.OBSERVED_PROGRESSING_BUDGET_EXHAUSTED,
    );
    assert.equal(verdict.owner, 'startup_active_gate_owner');
    assert.equal(verdict.boundary, 'publication_visibility');
    assert.equal(
      verdict.enabledAction,
      'reconcile_owner_membership_publication',
    );
    assert.equal(verdict.lastProgressTimestamp, 'absent');
    assert.equal(verdict.queueState.state, 'observed');
    assert.equal(verdict.queueState.pendingWrites, 3);
    assert.equal(verdict.publicationDelta.toMissingPublishedCount, 1);
    assert.equal(
      verdict.evidencePath,
      'report.scenarios[0].publicationConvergence.activeGate.progress',
    );
    assert.ok(verdict.evidenceGaps.includes('full_owner_execution_trace'));
  });

  it('keeps enqueue plus backlog from becoming a positive progress verdict', () => {
    const verdict = buildRollingRestartLivenessVerdict(
      readJson(ENQUEUE_BACKLOG_FIXTURE_PATH),
      {sourceArtifact: ENQUEUE_BACKLOG_FIXTURE_PATH},
    );

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_ENABLED_ACTION_NOT_EXECUTED,
    );
    assert.equal(verdict.progressWitness.state, 'absent');
  });

  it('classifies a synthetic slow-progress publication sample as progressing', () => {
    const verdict = buildRollingRestartLivenessVerdict(
      readJson(SLOW_PROGRESS_FIXTURE_PATH),
      {sourceArtifact: SLOW_PROGRESS_FIXTURE_PATH},
    );

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.OBSERVED_PROGRESSING_BUDGET_EXHAUSTED,
    );
    assert.equal(verdict.progressWitness.kind, 'owner_queue_depth_decreased');
    assert.equal(verdict.progressWitness.before, 3);
    assert.equal(verdict.progressWitness.after, 2);
  });

  it('classifies a publication stall with no enabled action', () => {
    const verdict = buildRollingRestartLivenessVerdict(
      readJson(NO_ENABLED_ACTION_FIXTURE_PATH),
      {sourceArtifact: NO_ENABLED_ACTION_FIXTURE_PATH},
    );

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_NO_ENABLED_ACTION,
    );
    assert.equal(verdict.enabledAction, 'absent');
  });

  it('classifies an executed owner action that never becomes visible', () => {
    const verdict = buildRollingRestartLivenessVerdict(
      readJson(EXECUTED_NO_VISIBILITY_FIXTURE_PATH),
      {sourceArtifact: EXECUTED_NO_VISIBILITY_FIXTURE_PATH},
    );

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_EXECUTED_NO_VISIBILITY,
    );
    assert.equal(verdict.lastProgressTimestamp, 2000);
    assert.equal(verdict.publicationDelta.changed, false);
  });

  it('classifies a known drain/in-flight stall through the same evidence model', () => {
    const verdict = buildRollingRestartLivenessVerdict(
      readJson(DRAIN_STALL_FIXTURE_PATH),
      {sourceArtifact: DRAIN_STALL_FIXTURE_PATH},
    );

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_DOWNSTREAM_WORKFLOW_PROGRESS,
    );
    assert.equal(verdict.owner, 'operation_workflow_owner');
    assert.equal(verdict.boundary, 'workflow_timeout');
    assert.equal(verdict.enabledAction, 'reconcile_stale_operation_progress');
  });

  it('prints the same verdict through the CLI', () => {
    const output = execFileSync(
      NODE_BIN,
      [SCRIPT_PATH, SLOW_PROGRESS_FIXTURE_PATH],
      {encoding: ENCODING_UTF8},
    );
    const verdict = JSON.parse(output);

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.OBSERVED_PROGRESSING_BUDGET_EXHAUSTED,
    );
  });
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), ENCODING_UTF8));
}

function runAnalyzer(filePath) {
  const output = execFileSync(
    NODE_BIN,
    [SCRIPT_PATH, filePath],
    {encoding: ENCODING_UTF8},
  );
  return JSON.parse(output);
}
