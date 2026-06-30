import {after, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {
  REQUIRED_VERDICTS,
  ROLLING_RESTART_LIVENESS_VERDICT,
  buildRollingRestartLivenessVerdict,
} from '../../scripts/rolling-restart-liveness-classifier.js';

const NODE_BIN = process.execPath;
const SCRIPT_PATH = 'scripts/analyze-rolling-restart-liveness.js';
const ENCODING_UTF8 = 'utf8';
const JSON_INDENT_SPACES = 2;
const NEWLINE = '\n';
const FIXTURE_DIRECTORY =
  'test/scripts/__fixtures__/rolling-restart-liveness';
const TOPOLOGY_FIXTURE_DIRECTORY =
  'test/scripts/__fixtures__/topology-convergence';
const SCENARIO_ROLLING_RESTART = 'rolling-restart';
const ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION =
  'reconcile_owner_membership_publication';
const REASON_OWNER_RECONCILE_PENDING = 'owner_reconcile_pending';
const OUTCOME_RECONCILE_TIMED_OUT = 'reconcile-timed-out';
const MSG_CONVERGENCE_DECISION_TRACE = 'convergence decision trace';
const TEMP_PREFIX = 'rolling-restart-liveness-';
const NONBLOCKING_PRIORITY_FIXTURE_SOURCE =
  'synthetic-spread-satisfied-nonblocking-priority';
const PRIORITY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_ACTION_ADVANCE_EXISTING_OPERATION =
  'advance_existing_operation';
const PRIORITY_WAIT_MODE_EVENT_DRIVEN = 'event_driven';
const PRIORITY_ACTUATION_PERSISTED_NOT_DISPATCHED =
  'persisted_not_dispatched';
const PRIORITY_WORKFLOW_PHASE_DISPATCH_PENDING = 'dispatch_pending';
const PRIORITY_WORKFLOW_STEP_AGE_MS = 74143;
const PRIORITY_WORKFLOW_STEP_TIMEOUT_MS = 30000;
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
const temporaryDirectories = [];

after(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

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

  it('classifies publication visibility stall from full logs', () => {
    const reportPath = writeFullLogReport({
      createFullLogs: true,
      logLines: [
        decisionTraceLine({
          time: '2026-06-29T05:00:50.000Z',
          decision: 'drive',
          reason: 'driven',
          outcome: OUTCOME_RECONCILE_TIMED_OUT,
          publicationEpoch: 7,
          missingPublishedCount: 1,
        }),
        decisionTraceLine({
          time: '2026-06-29T05:00:58.642Z',
          decision: 'drive',
          reason: 'driven',
          outcome: OUTCOME_RECONCILE_TIMED_OUT,
          publicationEpoch: 7,
          missingPublishedCount: 1,
        }),
      ],
    });

    const verdict = runAnalyzer(reportPath);

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_EXECUTED_NO_VISIBILITY,
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
    assert.equal(
      verdict.lastProgressTimestamp,
      '2026-06-29T05:00:58.642Z',
    );
    assert.equal(verdict.queueState.state, 'observed');
    assert.equal(verdict.queueState.pendingWrites, 2);
    assert.equal(verdict.publicationDelta.toMissingPublishedCount, 1);
    assert.equal(verdict.publicationDelta.changed, false);
    assert.equal(
      verdict.fullLogReplay.state,
      'complete',
    );
    assert.equal(verdict.fullLogReplay.filesScanned, 1);
    assert.equal(verdict.fullLogReplay.matchedSampleCount, 2);
    assert.equal(verdict.downstreamWorkflow.state, 'absent');
    assert.equal(verdict.evidenceGaps.length, 0);
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
    assert.equal(verdict.downstreamWorkflow.state, 'observed');
    assert.equal(
      verdict.downstreamWorkflow.partitionId,
      'sql_transaction_participants-p1',
    );
    assert.equal(
      verdict.downstreamWorkflow.operationId,
      'ecef9408-b66f-4f03-a0d7-6341b3c2f621',
    );
    assert.equal(verdict.downstreamWorkflow.currentStepId, 'dispatch_pending');
    assert.equal(verdict.downstreamWorkflow.actuationState, 'transition_deferred');
    assert.equal(verdict.downstreamWorkflow.stepAgeMs, 74121);
    assert.equal(verdict.downstreamWorkflow.stepTimeoutMs, 30000);
  });

  it('does not promote spread-satisfied priority telemetry to a downstream stall', () => {
    const verdict = buildRollingRestartLivenessVerdict(
      buildNonBlockingPriorityRecoveryReport(),
      {sourceArtifact: NONBLOCKING_PRIORITY_FIXTURE_SOURCE},
    );

    assert.notEqual(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_DOWNSTREAM_WORKFLOW_PROGRESS,
    );
    assert.equal(verdict.downstreamWorkflow.state, 'absent');
    assert.equal(verdict.topologyFrontier.edgeId, 'readiness_startup_support');
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

  it('uses full-log execution evidence for an executed-no-visibility verdict', () => {
    const reportPath = writeFullLogReport({
      createFullLogs: true,
      logLines: [
        decisionTraceLine({
          time: '2026-06-29T05:00:01.000Z',
          decision: 'drive',
          reason: 'driven',
          outcome: OUTCOME_RECONCILE_TIMED_OUT,
          publicationEpoch: 7,
          missingPublishedCount: 1,
        }),
        decisionTraceLine({
          time: '2026-06-29T05:00:06.000Z',
          decision: 'drive',
          reason: 'driven',
          outcome: OUTCOME_RECONCILE_TIMED_OUT,
          publicationEpoch: 7,
          missingPublishedCount: 1,
        }),
      ],
    });

    const verdict = runAnalyzer(reportPath);

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_EXECUTED_NO_VISIBILITY,
    );
    assert.equal(verdict.fullLogReplay.state, 'complete');
    assert.equal(verdict.fullLogReplay.decisionTraceCount, 2);
    assert.equal(verdict.lastProgressTimestamp, '2026-06-29T05:00:06.000Z');
    assert.equal(verdict.publicationDelta.changed, false);
  });

  it('uses complete full logs to classify enabled action not executed', () => {
    const reportPath = writeFullLogReport({
      createFullLogs: true,
      logLines: [
        decisionTraceLine({
          time: '2026-06-29T05:00:01.000Z',
          decision: 'skip',
          reason: 'not-owner',
        }),
      ],
    });

    const verdict = runAnalyzer(reportPath);

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.STUCK_ENABLED_ACTION_NOT_EXECUTED,
    );
    assert.equal(verdict.fullLogReplay.state, 'complete');
    assert.equal(verdict.fullLogReplay.matchedSampleCount, 0);
    assert.equal(verdict.evidenceGaps.length, 0);
  });

  it('keeps missing full logs as insufficient evidence', () => {
    const reportPath = writeFullLogReport({
      createFullLogs: false,
      logLines: [],
    });

    const verdict = runAnalyzer(reportPath);

    assert.equal(
      verdict.verdict,
      ROLLING_RESTART_LIVENESS_VERDICT.INSUFFICIENT_EVIDENCE,
    );
    assert.equal(verdict.fullLogReplay.state, 'missing');
    assert.ok(verdict.evidenceGaps.includes('full_owner_execution_trace'));
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

function writeFullLogReport({createFullLogs, logLines}) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), TEMP_PREFIX));
  temporaryDirectories.push(directory);
  const runDirectory = path.join(directory, 'playback', 'run1');
  const scenarioDirectory = path.join(runDirectory, SCENARIO_ROLLING_RESTART);
  const failureBundlePath = path.join(scenarioDirectory, 'failure-bundle.json');
  fs.mkdirSync(scenarioDirectory, {recursive: true});
  fs.writeFileSync(failureBundlePath, '{}', ENCODING_UTF8);
  if (createFullLogs) {
    const fullLogDirectory = path.join(
      runDirectory,
      '.full-logs',
      SCENARIO_ROLLING_RESTART,
    );
    fs.mkdirSync(fullLogDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(fullLogDirectory, 'node-a.log.gz'),
      gzipSync(`${logLines.join(NEWLINE)}${NEWLINE}`),
    );
  }
  const reportPath = path.join(directory, 'run.report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        scenarios: [
          {
            scenario: SCENARIO_ROLLING_RESTART,
            failureBundle: {
              jsonPath: failureBundlePath,
            },
            publicationConvergence: {
              activeGate: {
                progress: basePublicationProgress(),
              },
            },
          },
        ],
      },
      null,
      JSON_INDENT_SPACES,
    ),
    ENCODING_UTF8,
  );
  return reportPath;
}

function basePublicationProgress() {
  return {
    publicationEpoch: 7,
    missingPublishedCount: 1,
    publicationActiveGateHandoffPendingReconcileCount: 1,
    publicationActiveGateHandoffNextAction:
      ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
    activeGateOwnerCohortPendingReconcileCount: 1,
    activeGateOwnerCohortMissingPublishedCount: 1,
    membershipPublicationHandoffOutcomeState: 'write_deferred',
    membershipPublicationHandoffOutcomeReasonCode: 'owner_reconcile_enqueued',
    membershipPublicationHandoffOutcomeEnqueued: true,
    selectedControlPlaneOwnerQueueDepth: {
      pendingWrites: 2,
      pendingWriteGrowthCount: 3,
    },
  };
}

function buildNonBlockingPriorityRecoveryReport() {
  return {
    scenarios: [
      {
        scenario: SCENARIO_ROLLING_RESTART,
        passed: false,
        publicationConvergence: {
          publicationStatus: 'PUBLISHED',
          pendingAckCount: 0,
          blockedNodeCount: 0,
          missingPublishedCount: 0,
          prioritySpreadPending: false,
          activeGate: {
            state: 'unknown',
            ready: false,
            progress: {
              expectedNodeCount: 5,
              snapshotCoverageNodeCount: 5,
              snapshotCoverageComplete: true,
              priorityRecoveryProgressClasses: {
                unresolvedSemanticStateIds: [],
                blockedPartitionIds: [],
              },
              blockers: [],
            },
          },
          priorityRecoveryProgressSummary: {
            partitionCount: 5,
            dominantWitness: {
              partitionId: 'sql_transactions-p1',
              semanticStateId: PRIORITY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT,
              progressClassIds: [],
              blockerReasonCodes: [],
              currentOwner: 'operation_workflow_owner',
              blockingBoundary: 'workflow_progress',
              nextRequiredAction: PRIORITY_ACTION_ADVANCE_EXISTING_OPERATION,
              waitMode: PRIORITY_WAIT_MODE_EVENT_DRIVEN,
              workflowProgressPhaseId:
                PRIORITY_WORKFLOW_PHASE_DISPATCH_PENDING,
              actuationState: PRIORITY_ACTUATION_PERSISTED_NOT_DISPATCHED,
              stepAgeMs: PRIORITY_WORKFLOW_STEP_AGE_MS,
              stepTimeoutMs: PRIORITY_WORKFLOW_STEP_TIMEOUT_MS,
            },
          },
        },
      },
    ],
  };
}

function decisionTraceLine({
  time,
  decision,
  reason,
  outcome = '',
  publicationEpoch = '',
  missingPublishedCount = '',
}) {
  const trace = {
    level: 30,
    time,
    nodeId: 'node-a',
    pid: 1,
    subsystem: 'control-plane-readiness',
    msg: MSG_CONVERGENCE_DECISION_TRACE,
    decision,
    reason,
  };
  if (outcome) {
    trace.outcome = outcome;
    trace.contractReason = REASON_OWNER_RECONCILE_PENDING;
    trace.contractNextAction = ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION;
  }
  if (Number.isFinite(Number(publicationEpoch))) {
    trace.publicationEpoch = publicationEpoch;
  }
  if (Number.isFinite(Number(missingPublishedCount))) {
    trace.missingPublishedCount = missingPublishedCount;
  }
  return JSON.stringify(trace);
}
