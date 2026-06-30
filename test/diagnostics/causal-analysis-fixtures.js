import fs from 'node:fs';

const ENCODING_UTF8 = 'utf8';
const FIXTURE_DIR = 'test/scripts/__fixtures__/topology-convergence';
const ACTIVE_PRIORITY_BACKPRESSURE_FIXTURE =
  'publication-operation-active-gate-handoff.fixture.json';
const ACTIVE_GATE_LOCAL_BLOCKER_FIXTURE = 'active-gate-snapshot.fixture.json';
const ACTIVE_GATE_REACHABILITY_FIXTURE =
  'active-gate-snapshot-reachability.fixture.json';
const PUBLICATION_ACK_FIXTURE = 'publication-count-only-ack.fixture.json';
const PRIORITY_BACKPRESSURE_FIXTURE =
  'priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json';

const SCENARIO_ROLLING_RESTART = 'rolling-restart';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const ACTIVE_GATE_READY_STATE = 'ready';
const ACTIVE_GATE_TIMED_OUT_STATE = 'timed_out';
const ACTIVE_GATE_STALLED_STATE = 'stalled';
const REPORT_COUNT_FAILED = 1;
const REPORT_COUNT_PASSED = 0;
const EXPECTED_NODE_COUNT = 5;
const FULL_SNAPSHOT_COVERAGE_COUNT = 5;
const ZERO_COUNT = 0;
const CURRENT_ACTIVE_GATE_ELAPSED_MS = 87249;
const CURRENT_ACTIVE_GATE_ATTEMPTS = 9;
const CURRENT_ACTIVE_GATE_MAX_ATTEMPTS = 8;
const CURRENT_WORKFLOW_RETRY_AFTER_MS = 1000;
const DIRECT_STALLED_ACTIVE_GATE_ELAPSED_MS = 250;
const DIRECT_STALLED_ACTIVE_GATE_ATTEMPTS = 1;
const READINESS_PROGRESS_ATTEMPTS_SINCE_PROGRESS = 8;
const READINESS_PROGRESS_MAX_ATTEMPTS = 8;
const READINESS_CLASS_NO_PROGRESS_TERMINAL = 'no_progress_terminal';
const READINESS_TERMINAL_STALLED_NO_PROGRESS = 'stalled_no_progress';
const READINESS_MODE_STARTUP = 'startup';
const READINESS_CLASS_DEPENDENCY_UNAVAILABLE = 'dependency_unavailable';
const READINESS_RECOVERABILITY_RECOVERABLE = 'recoverable';
const READINESS_SOURCE_STARTUP_SUPPORT = 'startup_support';
const READINESS_CAUSE_DEPENDENCY_UNAVAILABLE = 'dependency_unavailable';
const READINESS_NODE_ID = '11601fe0-72d6-5853-8590-ec2881853e72';
const READINESS_NODE_REASON_DEPENDENCY_UNAVAILABLE =
  'dependency_unavailable=cluster_membership';
const SUMMARY_TIMEOUT_ERROR = 'Scenario timed out within 87249ms';
const DIRECT_TIMEOUT_ERROR = 'Scenario timed out within 30000ms';
const WORKFLOW_WAIT_MODE_RETRY_SCHEDULED = 'retry_scheduled';
const WORKFLOW_WAIT_MODE_EVENT_DRIVEN = 'event_driven';
const WORKFLOW_ACTION_ADVANCE_EXISTING_OPERATION =
  'advance_existing_operation';
const WORKFLOW_ACTUATION_PERSISTED_NOT_DISPATCHED =
  'persisted_not_dispatched';
const CONVERGENCE_TIMEOUT_REASON = 'convergence_timeout';
const POST_REBALANCE_CLOSURE_OPEN_STATE = 'open';
const POST_REBALANCE_OPERATION_DRAIN_BLOCKER = 'operation_drain_open';
const POST_REBALANCE_NO_OVER_TARGET_BLOCKER = 'no_over_target_open';
const POST_REBALANCE_OPERATION_DRAIN_DIMENSION = 'operation_drain';
const POST_REBALANCE_NO_OVER_TARGET_DIMENSION = 'no_over_target';
const POST_REBALANCE_IN_FLIGHT_REASON = 'in_flight_replica_operations';
const POST_REBALANCE_OVERTARGET_REASON = 'current_overtarget_voters';
const POST_REBALANCE_EFFECTIVE_IN_FLIGHT_REPLICA_OPERATIONS = 4;
const POST_REBALANCE_OBSERVED_IN_FLIGHT_REPLICA_OPERATIONS = 7;
const POST_REBALANCE_OVERTARGET_DURATION_MS = 10945;
const POST_REBALANCE_PARTITION_ID = 'sql_write_operations-p1';

function readJsonArtifact(artifactPath) {
  return JSON.parse(fs.readFileSync(artifactPath, ENCODING_UTF8));
}

function fixturePath(fixtureName) {
  return `${FIXTURE_DIR}/${fixtureName}`;
}

function readTopologyFixture(fixtureName) {
  return readJsonArtifact(fixturePath(fixtureName));
}

function firstScenario(report) {
  return Array.isArray(report.scenarios) ? report.scenarios[0] : report;
}

function readActivePriorityBackpressureReport() {
  return readTopologyFixture(ACTIVE_PRIORITY_BACKPRESSURE_FIXTURE);
}

function readActivePriorityBackpressureArtifact() {
  return firstScenario(readActivePriorityBackpressureReport());
}

function readActiveGateLocalBlockerReport() {
  return readTopologyFixture(ACTIVE_GATE_LOCAL_BLOCKER_FIXTURE);
}

function readActiveGateReachabilityReport() {
  return readTopologyFixture(ACTIVE_GATE_REACHABILITY_FIXTURE);
}

function readPriorityBackpressureReport() {
  return readTopologyFixture(PRIORITY_BACKPRESSURE_FIXTURE);
}

function readPublicationAckReport() {
  return readTopologyFixture(PUBLICATION_ACK_FIXTURE);
}

function buildPassedRollingRestartReport() {
  return {
    summary: {
      passed: REPORT_COUNT_FAILED,
      failed: REPORT_COUNT_PASSED,
    },
    scenarios: [
      {
        scenario: SCENARIO_ROLLING_RESTART,
        passed: true,
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckCount: ZERO_COUNT,
          blockedNodeCount: ZERO_COUNT,
          missingPublishedCount: ZERO_COUNT,
          activeGate: {
            state: ACTIVE_GATE_READY_STATE,
            ready: true,
            progress: {
              expectedNodeCount: EXPECTED_NODE_COUNT,
              snapshotCoverageNodeCount: FULL_SNAPSHOT_COVERAGE_COUNT,
              snapshotCoverageComplete: true,
              priorityRecoveryProgressClasses: {
                unresolvedSemanticStateIds: [],
                blockedPartitionIds: [],
              },
              blockers: [],
            },
          },
        },
      },
    ],
  };
}

function buildPostRebalanceClosureBlockedReport() {
  const report = buildPassedRollingRestartReport();
  const scenario = firstScenario(report);
  const postRebalanceClosure = {
    state: POST_REBALANCE_CLOSURE_OPEN_STATE,
    blockers: [
      {
        id: POST_REBALANCE_OPERATION_DRAIN_BLOCKER,
        dimension: POST_REBALANCE_OPERATION_DRAIN_DIMENSION,
        reasonCodes: [POST_REBALANCE_IN_FLIGHT_REASON],
      },
      {
        id: POST_REBALANCE_NO_OVER_TARGET_BLOCKER,
        dimension: POST_REBALANCE_NO_OVER_TARGET_DIMENSION,
        reasonCodes: [POST_REBALANCE_OVERTARGET_REASON],
      },
    ],
  };

  return {
    summary: {
      passed: REPORT_COUNT_PASSED,
      failed: REPORT_COUNT_FAILED,
    },
    scenarios: [
      {
        ...scenario,
        passed: false,
        publicationConvergence: {
          ...scenario.publicationConvergence,
          activeGate: {
            ...scenario.publicationConvergence.activeGate,
            state: ACTIVE_GATE_TIMED_OUT_STATE,
            ready: false,
          },
        },
        summary: {
          passed: false,
          dominantReason: CONVERGENCE_TIMEOUT_REASON,
          topReasons: [
            {
              reason: CONVERGENCE_TIMEOUT_REASON,
              count: REPORT_COUNT_FAILED,
            },
          ],
        },
        failureClassification: {
          failureBarrier: 'convergence',
          failureBarrierReason: CONVERGENCE_TIMEOUT_REASON,
          postRebalanceClosure,
          signals: [
            {
              kind: 'postRebalanceClosureState',
              value: POST_REBALANCE_CLOSURE_OPEN_STATE,
            },
            {
              kind: 'postRebalanceBlocker',
              value: POST_REBALANCE_OPERATION_DRAIN_BLOCKER,
            },
          ],
        },
        details: {
          diagnostics: {
            postRebalanceClosure,
            effectiveInFlightReplicaOperationCount:
              POST_REBALANCE_EFFECTIVE_IN_FLIGHT_REPLICA_OPERATIONS,
            observedInFlightReplicaOperationCount:
              POST_REBALANCE_OBSERVED_IN_FLIGHT_REPLICA_OPERATIONS,
            overTargetDurations: {
              [POST_REBALANCE_PARTITION_ID]:
                POST_REBALANCE_OVERTARGET_DURATION_MS,
            },
          },
        },
        readiness: {},
      },
    ],
  };
}

function buildTerminalBudgetReport() {
  return {
    scenario: SCENARIO_ROLLING_RESTART,
    duration: CURRENT_ACTIVE_GATE_ELAPSED_MS,
    error: SUMMARY_TIMEOUT_ERROR,
    summary: {
      passed: false,
      duration: CURRENT_ACTIVE_GATE_ELAPSED_MS,
      error: SUMMARY_TIMEOUT_ERROR,
      readinessFailure: {
        classCode: READINESS_CLASS_NO_PROGRESS_TERMINAL,
        terminalReason: READINESS_TERMINAL_STALLED_NO_PROGRESS,
        progressSignal: {
          attemptsSinceProgress: READINESS_PROGRESS_ATTEMPTS_SINCE_PROGRESS,
          maxAttempts: READINESS_PROGRESS_MAX_ATTEMPTS,
        },
      },
    },
    publicationConvergence: {
      activeGate: {
        state: ACTIVE_GATE_TIMED_OUT_STATE,
        elapsedMs: CURRENT_ACTIVE_GATE_ELAPSED_MS,
        attempts: CURRENT_ACTIVE_GATE_ATTEMPTS,
        maxAttempts: CURRENT_ACTIVE_GATE_ATTEMPTS,
      },
      priorityRecoveryProgressSummary: {
        dominantWitness: {
          waitMode: WORKFLOW_WAIT_MODE_EVENT_DRIVEN,
          stepAgeMs: CURRENT_ACTIVE_GATE_ELAPSED_MS,
          stepTimeoutMs: CURRENT_ACTIVE_GATE_ELAPSED_MS,
        },
      },
    },
  };
}

function buildCurrentTimeoutCascadeReport() {
  return {
    scenario: SCENARIO_ROLLING_RESTART,
    duration: CURRENT_ACTIVE_GATE_ELAPSED_MS,
    error: SUMMARY_TIMEOUT_ERROR,
    summary: {
      passed: false,
      duration: CURRENT_ACTIVE_GATE_ELAPSED_MS,
      error: SUMMARY_TIMEOUT_ERROR,
      readinessFailure: {
        classCode: READINESS_CLASS_NO_PROGRESS_TERMINAL,
        terminalReason: READINESS_TERMINAL_STALLED_NO_PROGRESS,
        progressSignal: {
          attemptsSinceProgress: READINESS_PROGRESS_ATTEMPTS_SINCE_PROGRESS,
        },
      },
    },
    publicationConvergence: {
      activeGate: {
        state: ACTIVE_GATE_TIMED_OUT_STATE,
        elapsedMs: CURRENT_ACTIVE_GATE_ELAPSED_MS,
        attempts: CURRENT_ACTIVE_GATE_ATTEMPTS,
        maxAttempts: CURRENT_ACTIVE_GATE_ATTEMPTS,
      },
      priorityRecoveryProgressSummary: {
        dominantWitness: {
          waitMode: WORKFLOW_WAIT_MODE_RETRY_SCHEDULED,
          retryAfterMs: CURRENT_WORKFLOW_RETRY_AFTER_MS,
          nextRequiredAction: WORKFLOW_ACTION_ADVANCE_EXISTING_OPERATION,
          actuationState: WORKFLOW_ACTUATION_PERSISTED_NOT_DISPATCHED,
        },
      },
    },
  };
}

function buildCurrentActiveGateBudgetReport() {
  return {
    scenario: SCENARIO_ROLLING_RESTART,
    duration: CURRENT_ACTIVE_GATE_ELAPSED_MS,
    summary: {
      passed: false,
      duration: CURRENT_ACTIVE_GATE_ELAPSED_MS,
    },
    publicationConvergence: {
      activeGate: {
        state: ACTIVE_GATE_TIMED_OUT_STATE,
        elapsedMs: CURRENT_ACTIVE_GATE_ELAPSED_MS,
        attempts: CURRENT_ACTIVE_GATE_ATTEMPTS,
        maxAttempts: CURRENT_ACTIVE_GATE_MAX_ATTEMPTS,
      },
    },
  };
}

function buildDirectStalledActiveGateReport() {
  return {
    publicationConvergence: {
      activeGate: {
        state: ACTIVE_GATE_STALLED_STATE,
        elapsedMs: DIRECT_STALLED_ACTIVE_GATE_ELAPSED_MS,
        attempts: DIRECT_STALLED_ACTIVE_GATE_ATTEMPTS,
      },
    },
  };
}

function buildActiveGateDominantWithReadinessBlockerReport() {
  const report = readActiveGateLocalBlockerReport();
  const scenario = firstScenario(report);
  return {
    scenarios: [
      {
        ...scenario,
        readinessFailure: {
          mode: READINESS_MODE_STARTUP,
          classCode: READINESS_CLASS_DEPENDENCY_UNAVAILABLE,
          recoverability: READINESS_RECOVERABILITY_RECOVERABLE,
          source: READINESS_SOURCE_STARTUP_SUPPORT,
          cause: READINESS_CAUSE_DEPENDENCY_UNAVAILABLE,
        },
        readiness: {
          nodeReasonsByNodeId: {
            [READINESS_NODE_ID]: [
              READINESS_NODE_REASON_DEPENDENCY_UNAVAILABLE,
            ],
          },
        },
      },
    ],
  };
}

function buildSelectedSnapshotTimeoutReport() {
  const report = readActiveGateLocalBlockerReport();
  const scenario = firstScenario(report);
  return {
    scenarios: [
      {
        ...scenario,
        summary: {
          ...(scenario.summary || {}),
          error: DIRECT_TIMEOUT_ERROR,
        },
      },
    ],
  };
}

export {
  CURRENT_ACTIVE_GATE_ATTEMPTS,
  CURRENT_ACTIVE_GATE_ELAPSED_MS,
  CURRENT_ACTIVE_GATE_MAX_ATTEMPTS,
  CURRENT_WORKFLOW_RETRY_AFTER_MS,
  DIRECT_STALLED_ACTIVE_GATE_ATTEMPTS,
  DIRECT_STALLED_ACTIVE_GATE_ELAPSED_MS,
  buildActiveGateDominantWithReadinessBlockerReport,
  buildCurrentActiveGateBudgetReport,
  buildCurrentTimeoutCascadeReport,
  buildDirectStalledActiveGateReport,
  buildPassedRollingRestartReport,
  buildPostRebalanceClosureBlockedReport,
  buildSelectedSnapshotTimeoutReport,
  buildTerminalBudgetReport,
  fixturePath,
  readActiveGateLocalBlockerReport,
  readActiveGateReachabilityReport,
  readActivePriorityBackpressureArtifact,
  readActivePriorityBackpressureReport,
  readJsonArtifact,
  readPriorityBackpressureReport,
  readPublicationAckReport,
};
