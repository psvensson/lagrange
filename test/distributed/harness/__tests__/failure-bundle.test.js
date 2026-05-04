import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {ReportWriter} from '../report-writer.js';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import {
  CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON,
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
} from '../control-plane-quiescence-snapshot.js';
import {FAILURE_BUNDLE_SEGMENT_1} from
  '../failure-bundle-segment-1.js';
import {FAILURE_BUNDLE_SEGMENT_4} from
  '../failure-bundle-segment-4.js';
import {registerFailureBundlePlaybackTests} from './failure-bundle-playback-test-cases.js';
import {selectDominantPriorityRecoveryPartitionWitness} from
  '../priority-recovery-summary-normalization.js';
import {
  buildCanonicalPublicationEvidenceFromControlPlane,
} from '../publication-evidence-contract.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildPriorityRecoveryDecisionSnapshot,
} from '../../../../src/control-plane/priority-recovery-snapshot.js';
import {
  buildPriorityRecoveryObservationSnapshot,
} from '../../../../src/control-plane/priority-recovery-observation-snapshot.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_DECISION_SET_EXPECTED,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED,
  PRIORITY_RECOVERY_FAILURE_EXPECTED,
  buildPriorityRecoveryActuationDecisionInput,
  buildPriorityRecoveryPublicationConvergenceFixture,
} from '../__fixtures__/priority-recovery-actuation-contract-fixture.js';

const UTF8_ENCODING = 'utf8';
const PRIORITY_RECOVERY_ACTUATION_SCENARIO_NAME = 'rolling-restart';
const PRIORITY_RECOVERY_ACTUATION_REPORT_FILENAME =
  'priority-recovery-actuation-contract-report.json';
const PRIORITY_RECOVERY_ACTUATION_FAILURE_ERROR = 'load readiness timeout';
const PRIORITY_RECOVERY_ACTUATION_FAILURE_DURATION_MS = 100;
const PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX =
  'priorityRecoveryOwner=';
const PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX =
  'priorityRecoveryBoundary=';
const PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX =
  'priorityRecoveryWaitMode=';
const PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX =
  'priorityRecoveryNextAction=';
const ACTIVE_GATE_SELECTED_COVERAGE_CLEARS_STALE_MISSING_TEST_NAME =
  'lets current selected active-gate coverage clear stale missing publication nodes';
const ACTIVE_GATE_ACK_IDS_CLEAR_STALE_COUNT_TEST_NAME =
  'lets current pending ACK ids clear stale active-gate count-only debt';
const ACTIVE_GATE_ACK_SET_DIFFERENCE_TEST_NAME =
  'keeps active-gate ACK set-difference debt when equal-length lists differ';
const PRIORITY_RECOVERY_HISTORY_PARTITION_ID = 'replica_operations-p1';
const PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID = 'sql_transactions-p1';
const PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID = 'op-current-spread';
const PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_ID = 'op-other-serial';
const PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH = 11;
const PRIORITY_RECOVERY_SERIAL_WAIT_PROGRESS_CAPTURED_AT_MS = 13000;
const PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS = 12000;
const PRIORITY_RECOVERY_SERIAL_WAIT_CURRENT_BLOCKER_CAPTURED_AT_MS = 14000;
const PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_STATUS = 'creating';
const PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_CORRELATION_KEY =
  'sql_transactions-p1|11|op-current-spread';
const PRIORITY_RECOVERY_SERIAL_WAIT_SYNTHETIC_CORRELATION_KEY =
  'sql_transactions-p1|11|unknown';
const PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID =
  'sql_transaction_participants-p1';
const PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID =
  'op-target-service-progress';
const PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH = 5;
const PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_OPERATION_UPDATED_AT_MS = 1000;
const PRIORITY_RECOVERY_TARGET_PROGRESS_AT_MS = 34000;
const PRIORITY_RECOVERY_TARGET_PROGRESS_CAPTURED_AT_MS = 34500;
const PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_CAPTURED_AT_MS = 35000;
const PRIORITY_RECOVERY_TARGET_PROGRESS_STATUS = 'pending';
const PRIORITY_RECOVERY_TARGET_PROGRESS_CORRELATION_KEY =
  PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID + '|' +
  PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH + '|' +
  PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID;
const {
  FAILURE_CLASS_LOAD_PRESSURE,
  FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
  FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
  FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
  FAILURE_CLASS_CACHE_STALE,
  FAILURE_CLASS_TOPOLOGY_UNSTABLE,
  FAILURE_CLASS_CDC_DEGRADED,
  FAILURE_CLASS_UNKNOWN,
  ROOT_CAUSE_CLASS_STARTUP,
  PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  mergePriorityRecoveryDecisionSnapshots,
} = FAILURE_BUNDLE_SEGMENT_1;
const {
  buildPublicationConvergenceSummary,
  hasPublicationMissingActiveNodeBlocker,
  isStartupReadinessBlocked,
  mergeControlPlaneDiagnostics,
} = FAILURE_BUNDLE_SEGMENT_4;

function buildRuntimeFailureScenario() {
  const workflowId = 'split-tbl-users-users-p1-v2';
  return {
    scenario: 'postgres-baseline-comparison',
    passed: false,
    error: 'verify failed',
    loadMetrics: {
      total: 100,
      success: 90,
      failed: 10,
      errors: 4,
      attemptErrors: 3,
      latency: {p50: 1, p95: 3, p99: 9},
      opsPerSec: 20,
      distinctErrors: [
        'NodeClient queryLoad failed (node=node-1, channel=load): timeout',
      ],
      perNode: {
        'node-1': {
          dispatched: 10,
          success: 7,
          attemptErrors: 3,
          admissionSignals: 1,
          queuePressureSignals: 2,
          rejected: 0,
        },
      },
    },
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'verify',
          dominantReason: 'leader_mismatch',
          reasonCounts: {
            leader_mismatch: 2,
            snapshot_timeout: 1,
          },
          affectedNodeIds: ['node-1'],
        },
        failedPhase: {
          phase: 'verify',
          artifacts: {
            partitionGrowth: {
              failureMode: 'replica_spread_stalled',
              baselinePartitionCount: 1,
              currentPartitionCount: 3,
              additionalPartitionCount: 2,
              replicaNodeCount: 4,
              sampleCount: 12,
              transientQueryErrors: 1,
              lastQueryError: 'none',
            },
            partitioningPlanner: {
              selectedNodeIds: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
              readyReplicaNodeIds: ['node-1', 'node-2'],
              admissionReadyNodeIds: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
              localPrimaryNodeIds: ['node-1', 'node-2'],
              routedSupportNodeIds: ['node-4', 'node-5'],
              readinessReasonHistogram: {
                nodeSlotUnavailable: 8,
                cluster_member_unhealthy: 2,
              },
              convergenceStateHistogram: {
                ready_replica: 2,
                replica_blocked: 1,
                routed_admission_only: 2,
              },
              dispatchContributionHistogram: {
                local_primary: 2,
                local_blocked: 1,
                routed_support: 2,
              },
              degradationStateHistogram: {
                healthy: 2,
                promotion_pending: 1,
                unknown: 2,
              },
              criticalControlPlaneStability: {
                state: 'pending',
                reasonCodes: [
                  'pending_write_growth',
                  'publication_pending',
                ],
                retryAfterMs: 250,
              },
              convergenceEvaluations: [
                {
                  nodeId: 'node-1',
                  state: 'ready_replica',
                  dispatchContributionState: 'local_primary',
                  localReplicaRole: 'leader',
                  localReplicaVoterReady: true,
                  leadershipStable: true,
                  admissionReady: true,
                  replicaBearing: true,
                  degradationState: 'healthy',
                  reasonCodes: [],
                  retryAfterMs: 0,
                },
                {
                  nodeId: 'node-2',
                  state: 'ready_replica',
                  dispatchContributionState: 'local_primary',
                  localReplicaRole: 'follower',
                  localReplicaVoterReady: true,
                  leadershipStable: true,
                  admissionReady: true,
                  replicaBearing: true,
                  degradationState: 'healthy',
                  reasonCodes: [],
                  retryAfterMs: 0,
                },
                {
                  nodeId: 'node-3',
                  state: 'replica_blocked',
                  dispatchContributionState: 'local_blocked',
                  localReplicaRole: 'candidate',
                  localReplicaVoterReady: false,
                  leadershipStable: false,
                  admissionReady: true,
                  replicaBearing: true,
                  degradationState: 'promotion_pending',
                  reasonCodes: ['local_replica_not_voter_ready'],
                  retryAfterMs: 125,
                },
                {
                  nodeId: 'node-4',
                  state: 'routed_admission_only',
                  dispatchContributionState: 'routed_support',
                  localReplicaRole: 'unknown',
                  localReplicaVoterReady: false,
                  leadershipStable: false,
                  admissionReady: true,
                  replicaBearing: false,
                  degradationState: 'unknown',
                  reasonCodes: [],
                  retryAfterMs: 0,
                },
                {
                  nodeId: 'node-5',
                  state: 'routed_admission_only',
                  dispatchContributionState: 'routed_support',
                  localReplicaRole: 'unknown',
                  localReplicaVoterReady: false,
                  leadershipStable: false,
                  admissionReady: true,
                  replicaBearing: false,
                  degradationState: 'unknown',
                  reasonCodes: [],
                  retryAfterMs: 0,
                },
              ],
            },
            nodeReasonsByNodeId: {
              'node-1': ['leader_mismatch'],
            },
          },
        },
        controlPlaneDiagnostics: {
          logsTable: {
            pendingWriteGrowthCount: 2,
            retainedBacklogGrowthCount: 1,
          },
          cdcReplay: {
            replayBufferGrowthCount: 3,
            replayRetryDepth: 2,
          },
        },
        rootCauseBundle: {
          snapshotsByNodeId: {
            'node-1': {
              nodeId: 'node-1',
              address: '10.0.0.1',
              capturedAtMs: 1,
              controlPlaneDiagnostics: {
                schemaVersion: 1,
                publicationConvergence: {
                  publicationEpoch: 7,
                  publicationStatus: 'pending',
                  publishedActiveNodeIds: ['node-1', 'node-2'],
                  requiredAckNodeIds: ['node-1', 'node-2'],
                  acknowledgedNodeIds: ['node-1'],
                  pendingAckNodeIds: ['node-2'],
                },
                publicationMode: {
                  currentMode: 'conservative_fanout',
                  reasonCode: 'grouped_delivery_failed',
                  recentTransitions: [{
                    mode: 'conservative_fanout',
                    reasonCode: 'grouped_delivery_failed',
                  }],
                },
                heartbeatPublication: {
                  publicationPath: 'node_state_reporter',
                  targetAddress: 'seed-1/message-group/mg-1',
                  targetNodeId: 'seed-1',
                  targetServiceType: 'message-group',
                  targetServiceId: 'mg-1',
                  lastAttemptAt: '2026-03-07T00:00:04.000Z',
                  lastSuccessAt: '2026-03-07T00:00:04.010Z',
                  lastFailureAt: '2026-03-07T00:00:03.000Z',
                  lastFailureStage: 'register',
                  lastFailureReason: 'control-plane route unavailable',
                  consecutiveFailures: 2,
                },
                readinessByNodeId: {
                  'node-1': {
                    nodeId: 'node-1',
                    nodeEvidence: {
                      lastHeartbeat: 1000,
                      heartbeatAgeMs: 5000,
                      readyLeaseExpiresAt: 1500,
                      readyLeaseAgeMs: 4500,
                    },
                    dimensions: {
                      processAlive: true,
                      clusterMemberHealthy: true,
                      routingReady: true,
                      loadReady: true,
                      placementEligible: false,
                      controlPlaneWritable: false,
                      metadataPublicationHealthy: false,
                    },
                    reasons: [{
                      code: 'metadata_publication_degraded',
                    }],
                  },
                },
                nodeLivenessByNodeId: {
                  'node-1': {
                    lastHeartbeat: 1000,
                    heartbeatAgeMs: 5000,
                    readyLeaseExpiresAt: 1500,
                    readyLeaseAgeMs: 4500,
                  },
                },
                readinessTransitionsByNodeId: {
                  'node-1': [{
                    nodeId: 'node-1',
                    observedAt: '2026-03-07T00:00:05.000Z',
                    observedAtMs: Date.parse('2026-03-07T00:00:05.000Z'),
                    previousServeEligible: true,
                    serveEligible: false,
                    previousRepairEligible: true,
                    repairEligible: false,
                    previousReasonCodes: [],
                    reasonCodes: ['metadata_publication_degraded'],
                    flippedDimensions: ['serveEligible', 'repairEligible'],
                    rawInputs: {
                      heartbeatAgeMs: 5000,
                      readyLeaseLagMs: 4500,
                      controlPlaneWritable: false,
                    },
                  }],
                },
                placementEligibilityByNodeId: {
                  'node-1': {
                    nodeId: 'node-1',
                    placementEligible: false,
                    failedDimensions: [
                      'controlPlaneWritable',
                      'metadataPublicationHealthy',
                      'placementEligible',
                    ],
                    reasonCodes: ['metadata_publication_degraded'],
                    reasons: [{
                      code: 'metadata_publication_degraded',
                    }],
                  },
                },
                workflowAdmissionsByWorkflowId: {
                  [workflowId]: {
                    workflowId,
                    workflowType: 'managed_split',
                    transitionState: 'failed',
                    tableId: 'tbl-users',
                    tableName: 'users',
                    topologySnapshotCapturedAt: '2026-03-07T00:00:02.000Z',
                    sourceLeaderNodeId: 'node-1',
                    candidateTargetNodeIds: ['node-1', 'node-2'],
                    sourceRoutableNodeIds: ['node-1', 'node-2'],
                    eligibleNodeIds: ['node-2'],
                    ineligibleNodes: [{
                      nodeId: 'node-1',
                    }],
                    estimatedBytes: 128,
                    admissionDecisionAt: '2026-03-07T00:00:06.000Z',
                    admission: {
                      decisionType: 'blocked',
                    },
                    blockingReasons: [{
                      code: 'metadata_publication_degraded',
                    }],
                    failedAt: '2026-03-07T00:00:07.000Z',
                    timeoutClassification: {
                      classification: 'cache_visibility_timeout',
                      boundaryHit: true,
                      nestedOperation: 'table_partition_metadata_wait',
                    },
                  },
                },
                timeoutClassifications: [{
                  workflowId,
                  workflowType: 'managed_split',
                  transitionState: 'failed',
                  timeoutClassification: {
                    classification: 'cache_visibility_timeout',
                    boundaryHit: true,
                    nestedOperation: 'table_partition_metadata_wait',
                  },
                }],
              },
            },
          },
          adminQueryTraceByNodeId: {
            'node-1': [{
              nodeId: 'node-1',
              queryId: 'q-timeout-1',
              lane: 'load',
              operation: 'queryLoad',
              timeoutMs: 4000,
              durationMs: 4000,
              startedAtMs: Date.parse('2026-03-07T00:00:01.000Z'),
              timeoutAtMs: Date.parse('2026-03-07T00:00:05.000Z'),
              outcome: 'timeout',
              error: 'Admin API query timed out',
            }],
          },
        },
      },
    },
  };
}

function buildNoProgressFailureScenario() {
  return {
    scenario: 'postgres-baseline-comparison',
    passed: false,
    error: 'pre-load gate stalled',
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'topology',
          dominantReason: 'stalled_no_progress:20',
          reasonCounts: {
            'stalled_no_progress:20': 1,
          },
          affectedNodeIds: ['seed-1'],
        },
        failedPhase: {
          phase: 'pre_load_gate',
          artifacts: {},
        },
        noProgress: {
          reasonCode: 'stalled_no_progress',
          phase: 'pre_load_gate',
          stalledReason: 'stalled_no_progress:20',
          lastProgressEvent: {
            message: 'waiting for quiescent benchmark topology',
          },
          lastMeaningfulChange: {
            message: 'benchmark table ready on system-under-test',
          },
          failedNoProgress: {
            message: 'pre-load gate aborted for no progress',
            details: {
              budgetMs: 20,
              attempts: 3,
            },
          },
        },
      },
    },
  };
}

function buildLoadLaneTimeoutFailureScenario() {
  const nodeId = '11601fe0-72d6-5853-8590-ec2881853e72';
  return {
    scenario: 'seven-node-postgres-baseline-partition-split',
    passed: false,
    error:
      'postgres-baseline-comparison failed in phase verify: ' +
      'load run completed with failed operations; ' +
      'load run completed with operation errors',
    loadMetrics: {
      total: 251,
      success: 178,
      failed: 73,
      errors: 73,
      attemptErrors: 73,
      latency: {p50: 6, p95: 120, p99: 4000},
      opsPerSec: 42,
      distinctErrors: [
        'NodeClient queryLoad failed (node=11601fe0-72d6-5853-8590-ec2881853e72, ' +
          'channel=load, timeoutClass=timeout, code=timeout): ' +
          'Admin API query timed out for node 11601fe0-72d6-5853-8590-ec2881853e72 ' +
          'on lane load after 4000ms',
        'NodeClient queryLoad failed (node=11601fe0-72d6-5853-8590-ec2881853e72, ' +
          'channel=load, timeoutClass=none, code=circuit_open): ' +
          'circuit breaker is open',
      ],
      perNode: {
        [nodeId]: {
          dispatched: 251,
          success: 178,
          attemptErrors: 73,
          admissionSignals: 18,
          queuePressureSignals: 127544,
          rejected: 0,
        },
      },
    },
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'load',
          dominantReason: 'load run completed with failed operations',
          reasonCounts: {
            'load run completed with failed operations': 1,
            'load run completed with operation errors': 1,
          },
          affectedNodeIds: [nodeId],
        },
        failedPhase: {
          phase: 'verify',
          artifacts: {
            assertionStatus: {
              failed: true,
            },
          },
        },
        rootCauseBundle: {
          schemaVersion: 1,
          rootCauseCode: 'load_failure',
          rootCauseClass: 'load',
          adminQueryTraceByNodeId: {
            [nodeId]: [{
              nodeId,
              queryId: 'q-load-timeout-1',
              lane: 'load',
              operation: 'queryLoad',
              timeoutMs: 4000,
              durationMs: 4000,
              outcome: 'timeout',
              timeoutClass: 'timeout',
              errorCode: 'timeout',
              error:
                'Admin API query timed out for node ' +
                `${nodeId} on lane load after 4000ms`,
            }, {
              nodeId,
              queryId: 'q-load-circuit-open-1',
              lane: 'load',
              operation: 'queryLoad',
              timeoutMs: 4000,
              durationMs: 3,
              outcome: 'error',
              timeoutClass: 'none',
              errorCode: 'circuit_open',
              error: 'circuit breaker is open',
            }],
          },
          playback: {
            artifactsDir: 'artifacts',
          },
        },
      },
    },
  };
}

function buildPlaybackDerivedFailureResult() {
  return {
    passed: false,
    duration: 1000,
    error: 'Expected no failed load operations during node join: observed 4',
    loadMetrics: {
      total: 100,
      success: 96,
      failed: 4,
      errors: 4,
      attemptErrors: 8,
      latency: {p50: 8, p95: 40, p99: 90},
      opsPerSec: 25,
      waitReasons: {
        nodeSlotUnavailable: 2,
        nodeAdmissionBlocked: 9,
        retryableControlPlanePressure: 0,
        timeoutWaits: 1,
        queueCapacityRejected: 0,
      },
      perNode: {
        'node-1': {
          dispatched: 60,
          success: 57,
          attemptErrors: 3,
          admissionSignals: 2,
        },
      },
    },
    details: {
      diagnostics: {
        failedPhase: {
          phase: 'verify_load',
          artifacts: {},
        },
      },
    },
  };
}

function buildPlaybackActiveGateStageEvent({
  readinessMode = 'startup',
  activeGateAdmissionState = {
    mode: 'blocked',
    blockedNodeIds: ['seed-1'],
    reasonCode: 'metadata_publication_degraded',
  },
  activeGateCurrentProgress,
} = {}) {
  return {
    timestamp: 5000,
    type: 'cluster.stage',
    scope: 'cluster',
    entityId: 'cluster',
    details: {
      stage: 'setup.cluster.waiting-active',
      nodeDiagnostics: [],
      snapshotCoverage: {
        completeCoverage: true,
        bestCoverageNodeCount: 2,
        expectedNodeCount: 2,
        selectedNodeId: 'seed-1',
        selectedCapturedAtMs: 4990,
        selectedObservedNodeIds: ['seed-1', 'joiner-1'],
        selectedControlPlaneDiagnosticsAvailable: true,
        selectedPublicationConvergence: {
          publicationEpoch: 3,
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          publishedActiveNodeIds: ['seed-1', 'joiner-1'],
        },
      },
      publicationConvergenceGate: {
        ready: false,
        reasons: [],
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
      },
      activeGateNoProgress: {
        enabled: true,
        mode: readinessMode,
        maxAttempts: 45,
        attemptsSinceProgress: 22,
        stalled: false,
        currentProgress: activeGateCurrentProgress || {
          expectedNodeCount: 2,
          activeNodeCount: 2,
          inactiveNodeCount: 0,
          snapshotCoverageNodeCount: 2,
          snapshotCoverageComplete: false,
          publicationStatus: 'PUBLISHED',
          pendingAckCount: 0,
          missingPublishedCount: 1,
          gateReasons: [],
          selectedSnapshotReachableBy: 'admin_health',
          selectedSnapshotError: 'metadata_publication_degraded',
          selectedReachabilityError: null,
          selectedError: null,
        },
      },
      activeGateAdmissionState,
    },
  };
}

const TEST_COUNT_ZERO = 0;

function buildStartupModeWitnessProgress({
  expectedNodeCount = 2,
  activeNodeCount = 2,
  snapshotCoverageNodeCount = 0,
  isTimeoutError = true,
  readinessDelay = null,
  missingPublishedCount = 1,
} = {}) {
  const selectedSnapshotReachableBy = 'admin_health';
  const selectedSnapshotError = isTimeoutError ?
    'Admin API query timed out for node seed-1 on lane snapshot after 30ms' :
    'metadata_publication_degraded';
  const progress = {
    expectedNodeCount,
    activeNodeCount,
    inactiveNodeCount:
      Math.max(TEST_COUNT_ZERO, expectedNodeCount - activeNodeCount),
    snapshotCoverageNodeCount,
    snapshotCoverageComplete: false,
    publicationStatus: 'PUBLISHED',
    pendingAckCount: 0,
    missingPublishedCount,
    gateReasons: [],
    prioritySpreadSatisfied: false,
    selectedSnapshotReachableBy,
    selectedSnapshotError,
    selectedReachabilityError: null,
    selectedError: null,
  };
  if (readinessDelay &&
      typeof readinessDelay === 'object' &&
      !Array.isArray(readinessDelay)) {
    progress.readinessDelay = readinessDelay;
  } else if (isTimeoutError === true &&
      readinessDelay === null) {
    progress.readinessDelay = {
      timedOut: true,
      cause: 'snapshot_timeout',
      source: 'selectedSnapshotError',
      recoverability: 'terminal',
      error: selectedSnapshotError,
    };
  } else if (isTimeoutError === false &&
      readinessDelay === null) {
    progress.readinessDelay = {
      timedOut: false,
      cause: 'none',
      source: 'selectedSnapshotError',
      recoverability: 'recoverable',
      error: selectedSnapshotError,
    };
  }
  return progress;
}

function buildConvergenceDiagnosticsOnlyScenario() {
  return {
    scenario: 'rolling-restart',
    passed: false,
    error: 'Convergence timeout after 120000ms',
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'topology',
          dominantReason: 'convergence_timeout',
          reasonCounts: {
            convergence_timeout: 1,
          },
          affectedNodeIds: ['seed-1', 'joiner-1'],
        },
        failedPhase: {
          phase: 'pre_load_gate',
          artifacts: {},
        },
        snapshotNodeId: 'seed-1',
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationEpoch: 8,
            publicationStatus: 'ack_pending',
            pendingAckNodeIds: ['joiner-1'],
            requiredAckNodeIds: ['seed-1', 'joiner-1', 'joiner-2'],
            acknowledgedNodeIds: ['seed-1', 'joiner-2'],
            publishedActiveNodeIds: ['seed-1', 'joiner-2'],
            recoveryProtocolState: 'publication_pending',
            priorityRecoveryReasonCodes: [
              'publication_epoch_pending',
              'priority_partitions_not_spread',
            ],
          },
          publicationMode: {
            currentMode: 'recovering',
            reasonCode: 'publication_ack_pending',
          },
          readinessByNodeId: {
            'joiner-1': {
              nodeId: 'joiner-1',
              dimensions: {
                serveEligible: false,
                repairEligible: true,
              },
              reasons: [{
                code: 'control_plane_publication_pending',
              }],
            },
          },
        },
      },
    },
  };
}

describe('failure-bundle', () => {
  let tempDir;
  let outputDir;
  let reportPath;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), `failure-bundle-test-${randomUUID()}-`));
    outputDir = join(tempDir, 'artifacts');
    reportPath = join(tempDir, 'report.report.json');
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it(
    'summarizes priority-recovery semantic state from the latest partition snapshot',
    () => {
      const mergedDecisionSnapshots = mergePriorityRecoveryDecisionSnapshots(
        {
          publicationEpoch: 6,
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_HISTORY_PARTITION_ID,
            epoch: 6,
            correlationKey:
              PRIORITY_RECOVERY_HISTORY_PARTITION_ID + '|6|op-current',
            semanticState: 'converged',
            blockerReasons: [],
            planner: {
              ready: true,
            },
            spreadCompletion: {
              satisfied: true,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: 'op-current',
                status: 'removed',
                updatedAtMs: 6000,
              },
            },
            observation: {
              provenance: {
                capturedAt: 6000,
              },
            },
          }],
        },
        {
          publicationEpoch: 4,
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_HISTORY_PARTITION_ID,
            epoch: 4,
            correlationKey:
              PRIORITY_RECOVERY_HISTORY_PARTITION_ID + '|4|op-stale',
            semanticState: 'recovering_in_flight',
            blockerReasons: [],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: 'op-stale',
                status: 'pending',
                updatedAtMs: 4000,
              },
            },
            observation: {
              provenance: {
                capturedAt: 4000,
              },
            },
          }],
        },
      );

      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState.converged,
        [PRIORITY_RECOVERY_HISTORY_PARTITION_ID],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState.recovering_in_flight,
        [],
      );
      assert.equal(
        mergedDecisionSnapshots.closureWitness.blockedPartitionCount,
        0,
      );
    },
  );

  it(
    'drops stale serial-wait synthetic snapshots behind operation progress',
    () => {
      const mergedDecisionSnapshots = mergePriorityRecoveryDecisionSnapshots(
        {
          publicationEpoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
            correlationKey:
              PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_CORRELATION_KEY,
            operationId: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: true,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
                status: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_STATUS,
                updatedAtMs:
                  PRIORITY_RECOVERY_SERIAL_WAIT_PROGRESS_CAPTURED_AT_MS,
              },
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_SERIAL_WAIT_PROGRESS_CAPTURED_AT_MS,
              },
            },
          }],
        },
        {
          publicationEpoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT]: [
              PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            ],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION]: [
              PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
            correlationKey:
              PRIORITY_RECOVERY_SERIAL_WAIT_SYNTHETIC_CORRELATION_KEY,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
            ],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: 0,
              serialWaitOperationIds: [
                PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_ID,
              ],
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS,
              },
            },
          }],
        },
      );

      assert.equal(mergedDecisionSnapshots.snapshots.length, 1);
      assert.deepEqual(
        mergedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT
        ],
        [],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION
        ],
        [],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT
        ],
        [PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID],
      );
      assert.equal(
        mergedDecisionSnapshots.closureWitness.blockedPartitionCount,
        0,
      );
    },
  );

  it(
    'keeps current synthetic no-operation snapshots ahead of stale progress',
    () => {
      const mergedDecisionSnapshots = mergePriorityRecoveryDecisionSnapshots(
        {
          publicationEpoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT]: [
              PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            ],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION]: [
              PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
            correlationKey:
              PRIORITY_RECOVERY_SERIAL_WAIT_SYNTHETIC_CORRELATION_KEY,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
            ],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: 0,
              serialWaitOperationIds: [
                PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_ID,
              ],
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_SERIAL_WAIT_CURRENT_BLOCKER_CAPTURED_AT_MS,
              },
            },
          }],
        },
        {
          publicationEpoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
            correlationKey:
              PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_CORRELATION_KEY,
            operationId: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: true,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
                status: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_STATUS,
                updatedAtMs:
                  PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS,
              },
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS,
              },
            },
          }],
        },
      );

      assert.equal(mergedDecisionSnapshots.snapshots.length, 2);
      assert.deepEqual(
        mergedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT
        ],
        [PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION
        ],
        [PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID],
      );
    },
  );

  it(
    'prefers target service progress over same-operation stale no-transition snapshots',
    () => {
      const mergedDecisionSnapshots = mergePriorityRecoveryDecisionSnapshots(
        {
          publicationEpoch: PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS]: [
              PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
            ],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED]: [
              PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
            correlationKey: PRIORITY_RECOVERY_TARGET_PROGRESS_CORRELATION_KEY,
            operationId: PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
            ],
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
                status: PRIORITY_RECOVERY_TARGET_PROGRESS_STATUS,
                updatedAtMs:
                  PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
              },
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_CAPTURED_AT_MS,
              },
            },
          }],
        },
        {
          publicationEpoch: PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
            correlationKey: PRIORITY_RECOVERY_TARGET_PROGRESS_CORRELATION_KEY,
            operationId: PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
            spreadCompletion: {
              satisfied: true,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
                status: PRIORITY_RECOVERY_TARGET_PROGRESS_STATUS,
                updatedAtMs:
                  PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
                targetServiceProgressAtMs:
                  PRIORITY_RECOVERY_TARGET_PROGRESS_AT_MS,
              },
            },
            progress: {
              lastProgressAtMs: PRIORITY_RECOVERY_TARGET_PROGRESS_AT_MS,
            },
            observation: {
              provenance: {
                capturedAt: PRIORITY_RECOVERY_TARGET_PROGRESS_CAPTURED_AT_MS,
              },
            },
          }],
        },
      );

      assert.equal(mergedDecisionSnapshots.snapshots.length, 1);
      assert.deepEqual(
        mergedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS
        ],
        [],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED
        ],
        [],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT
        ],
        [PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID],
      );
      assert.equal(
        mergedDecisionSnapshots.closureWitness.blockedPartitionCount,
        0,
      );
    },
  );

  it(
    'does not keep startup readiness blocked once the canonical publication gate is ready',
    () => {
      assert.equal(
        isStartupReadinessBlocked({
          readinessFailure: {
            mode: 'startup',
            classCode: 'snapshot_reachability_timeout',
            recoverability: 'terminal',
          },
          publicationConvergence: {
            publicationPending: false,
            pendingAckCount: 0,
            blockedNodeCount: 0,
            prioritySpreadPending: false,
            activeGate: {
              ready: true,
            },
          },
        }),
        false,
      );
    },
  );

  it('writes scenario and run failure bundles for runtime failures and links them from the report',
    async () => {
      const scenarioDir = join(outputDir, 'postgres-baseline-comparison');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(scenarioDir, 'node-1.log'),
        [
          'line-1',
          '2026-03-07T00:00:03.000Z [node-1] info: ' +
            '{"level":30,"time":"2026-03-07T00:00:03.000Z",' +
            '"nodeId":"node-1","msg":"Resolved startup auto-rejoin decision",' +
            '"mode":"join","source":"rejoin_hints",' +
            '"startupMode":"durable_rejoin","peerAddress":"seed-1:8080"}',
          '2026-03-07T00:00:03.500Z [node-1] info: ' +
            '{"level":30,"time":"2026-03-07T00:00:03.500Z",' +
            '"nodeId":"node-1","msg":"Startup runtime handoff completed",' +
            '"startupBranch":"join","startupPhase":"READY",' +
            '"bootstrapApiHasSqlQueryEngine":true,' +
            '"bootstrapApiHasMessageRouter":true,' +
            '"bootstrapApiHasStartupRecoveryCoordinator":true,' +
            '"adminRuntimeStarted":true,"adminPort":8081}',
          '2026-03-07T00:00:04.000Z [node-1] info: ' +
            '{"level":40,"time":"2026-03-07T00:00:04.000Z",' +
            '"nodeId":"node-1","pid":1,"subsystem":"query-executor",' +
            '"msg":"Partition routing candidates filtered by readiness",' +
            '"partitionId":"users-p1",' +
            '"routingSnapshot":{' +
              '"reasonCode":"all_services_filtered_by_readiness",' +
              '"routingReadinessDimension":"serveEligible",' +
              '"serviceRowCount":1,' +
              '"activeAddressedServiceCount":1,' +
              '"routableServiceCount":0,' +
              '"leaderKnown":true,' +
              '"canonicalLeaderNodeId":"node-1",' +
              '"deniedByNodeId":{' +
                '"node-1":{' +
                  '"decisionDimension":"serveEligible",' +
                  '"reasonCodes":["cluster_member_unhealthy"],' +
                  '"failedDimensions":[' +
                    '"clusterMemberHealthy","controlPlaneWritable","serveEligible"]' +
                '}' +
              '}' +
            '}}',
          'line-3',
        ].join('\n') + '\n',
      );
      await writeFile(join(scenarioDir, '_timeline.log'), 'timeline\n');
      await writeFile(join(scenarioDir, '_analysis.json'), '{"summary":"ok"}\n');
      await writeFile(
        join(scenarioDir, 'events.ndjson'),
        [
          {
            timestamp: 1709769601000,
            type: 'cluster.stage',
            scope: 'cluster',
            entityId: 'cluster',
            details: {
              stage: 'setup.cluster.active',
              nodeCount: 5,
            },
          },
          {
            timestamp: 1709769602000,
            type: 'load.started',
            scope: 'cluster',
            entityId: 'cluster',
            details: {
              metrics: {
                total: 10,
                attemptErrors: 0,
              },
            },
          },
          {
            timestamp: 1709769602500,
            type: 'partition.created',
            scope: 'topology',
            entityId: 'users-p2',
            details: {
              partitionId: 'users-p2',
              tableName: 'users',
              nodeId: 'node-2',
              status: 'active',
            },
          },
          {
            timestamp: 1709769603000,
            type: 'load.completed',
            scope: 'cluster',
            entityId: 'cluster',
            details: {
              metrics: {
                total: 10,
                attemptErrors: 3,
                waitReasons: {
                  nodeSlotUnavailable: 4,
                },
              },
            },
          },
          {
            timestamp: 1709769603500,
            type: 'node.restart.boundary',
            scope: 'node',
            entityId: 'node-1',
            details: {
              phase: 'after_ready',
              snapshot: {
                nodeId: 'node-1',
                publicationConvergence: {
                  publicationEpoch: 7,
                  pendingAckNodeIds: ['node-2'],
                },
                localReadiness: {
                  reasonCodes: ['control_plane_publication_pending'],
                },
              },
            },
          },
        ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
      );

      const scenario = buildRuntimeFailureScenario();
      const writer = new ReportWriter(reportPath);
      writer.scenarios.push(scenario);

      const failureBundle = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      await writer.write({
        failureBundle: failureBundle.runBundle,
      });

      assert.ok(scenario.failureBundle?.jsonPath);
      assert.ok(scenario.failureBundle?.triageJsonPath);
      assert.ok(failureBundle.runBundle?.jsonPath);

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(scenarioBundle.summary.phase, 'verify');
      assert.equal(scenarioBundle.topFailures.topReasons[0].reason, 'leader_mismatch');
      assert.equal(scenarioBundle.logs.nodeLogPaths['node-1'],
        'artifacts/postgres-baseline-comparison/node-1.log');
      assert.ok(Array.isArray(scenarioBundle.logs.excerptsByNodeId['node-1']));
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].loadMetrics.attemptErrors,
        3,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].adminQueryTrace[0].queryId,
        'q-timeout-1',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].placementEligibility.reasonCodes[0],
        'metadata_publication_degraded',
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationModeByNodeId['node-1'].currentMode,
        'conservative_fanout',
      );
      assert.equal(
        scenarioBundle.controlPlane.heartbeatPublicationByNodeId['node-1'].targetAddress,
        'seed-1/message-group/mg-1',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.pendingAckCount,
        1,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        'publication_convergence_blocked',
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.status,
        'open',
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          'pending_ack_nodes',
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.failover.status,
        'open',
      );
      assert.equal(
        scenarioBundle.controlPlane.workflowAdmissionsByWorkflowId[
          'split-tbl-users-users-p1-v2'
        ].timeoutClassification.classification,
        'cache_visibility_timeout',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].timelineCorrelation.firstLoadFailureAt,
        '2026-03-07T00:00:05.000Z',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1']
          .timelineCorrelation.heartbeatAgeMsAtFirstReadinessFlip,
        5000,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].readinessTransitions[0].serveEligible,
        false,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].routingDiagnostics.reasonCode,
        'all_services_filtered_by_readiness',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1']
          .decisionArtifacts.latestStartupDecision.startupMode,
        'durable_rejoin',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1']
          .decisionArtifacts.latestRuntimeHandoff.startupBranch,
        'join',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].restartBoundaries[0].phase,
        'after_ready',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1']
          .routingDiagnostics.deniedByNodeId['node-1'].reasonCodes[0],
        'cluster_member_unhealthy',
      );
      assert.equal(
        scenarioBundle.recoveryReadiness.routingDimensionCounts.serveEligible,
        1,
      );
      assert.equal(
        scenarioBundle.recoveryReadiness.pendingAckBlockedNodeIds.includes('node-2'),
        true,
      );
      assert.match(
        scenarioBundle.nodeDiagnostics['node-1'].errors[0],
        /node=node-1/i,
      );
      assert.deepEqual(
        scenarioBundle.diagnostics.controlPlaneDiagnostics,
        {
          logsTable: {
            pendingWriteGrowthCount: 2,
            retainedBacklogGrowthCount: 1,
          },
          cdcReplay: {
            replayBufferGrowthCount: 3,
            replayRetryDepth: 2,
          },
        },
      );
      assert.equal(
        scenarioBundle.controlPlane.logsTable.pendingWriteGrowthCount,
        2,
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenario.failureBundle.triageJsonPath),
          UTF8_ENCODING,
        ),
      );
      assert.equal(triageSummary.summary.phase, 'verify');
      assert.equal(
        triageSummary.summary.stabilityGates.convergence.status,
        'open',
      );
      assert.equal(
        triageSummary.summary.stabilityGates.convergence.blockers.includes(
          'pending_ack_nodes',
        ),
        true,
      );
      assert.equal(
        triageSummary.partitioning.failureMode,
        'replica_spread_stalled',
      );
      assert.deepEqual(
        triageSummary.partitioning.localPrimaryNodeIds,
        ['node-1', 'node-2'],
      );
      assert.deepEqual(
        triageSummary.partitioning.routedSupportNodeIds,
        ['node-4', 'node-5'],
      );
      assert.deepEqual(
        triageSummary.partitioning.dispatchContributionHistogram,
        {
          local_primary: 2,
          local_blocked: 1,
          routed_support: 2,
        },
      );
      assert.equal(
        triageSummary.partitioning.criticalControlPlaneStability.state,
        'pending',
      );
      assert.deepEqual(
        triageSummary.partitioning.criticalControlPlaneStability.reasonCodes,
        ['pending_write_growth', 'publication_pending'],
      );
      assert.equal(
        triageSummary.partitioning.convergenceEvaluations[2].state,
        'replica_blocked',
      );
      assert.equal(
        triageSummary.partitioning.convergenceEvaluations[2].retryAfterMs,
        125,
      );
      assert.equal(
        triageSummary.playback.eventSummary.load.startedAt,
        '2024-03-07T00:00:02.000Z',
      );
      assert.equal(
        triageSummary.playback.eventSummary.topology.partitionCreatedCount,
        1,
      );
      assert.equal(
        triageSummary.routingDiagnosticsByNodeId['node-1']
          .routingDiagnostics.reasonCode,
        'all_services_filtered_by_readiness',
      );

      const runBundle = JSON.parse(
        await readFile(resolve(tempDir, failureBundle.runBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(runBundle.failedScenarioCount, 1);
      assert.equal(runBundle.scenarios[0].scenario, 'postgres-baseline-comparison');

      const reportJson = JSON.parse(await readFile(reportPath, UTF8_ENCODING));
      assert.equal(reportJson.failureBundle.jsonPath, failureBundle.runBundle.jsonPath);
      assert.equal(
        reportJson.scenarios[0].failureBundle.jsonPath,
        scenario.failureBundle.jsonPath,
      );
      assert.equal(
        reportJson.scenarios[0].failureClassification.failureClass,
        'publication_convergence_blocked',
      );
      assert.equal(
        reportJson.scenarios[0].stabilityGates.convergence.status,
        'open',
      );
      assert.equal(
        reportJson.scenarios[0].publicationConvergence.pendingAckCount,
        1,
      );

      const markdown = await readFile(
        resolve(tempDir, scenario.failureBundle.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(markdown, /## Node Diagnostics/);
      assert.match(markdown, /## Publication Convergence/);
      assert.match(markdown, /## Stability Gates/);
      assert.match(markdown, /convergence: status=open/);
      assert.match(markdown, /## Recovery Readiness/);
      assert.match(markdown, /## Control Plane Diagnostics/);
      assert.match(markdown, /Heartbeat Publication/);
      assert.match(markdown, /Timeline Correlation/);
      assert.match(markdown, /Routing Diagnostics/);
      assert.match(markdown, /Latest Startup Decision/);
      assert.match(markdown, /Restart Boundaries/);
      assert.match(markdown, /cache_visibility_timeout/);
      assert.match(markdown, /operation=queryLoad/);
      const triageMarkdown = await readFile(
        resolve(tempDir, scenario.failureBundle.triageMarkdownPath),
        UTF8_ENCODING,
      );
      assert.match(triageMarkdown, /# Scenario Triage Summary/);
      assert.match(triageMarkdown, /## Stability Gates/);
      assert.match(triageMarkdown, /convergence: status=open/);
      assert.match(triageMarkdown, /pending_ack_nodes/);
      assert.match(triageMarkdown, /## Partitioning/);
      assert.match(triageMarkdown, /replica_spread_stalled/);
      assert.match(triageMarkdown, /Local Primary Nodes: node-1, node-2/);
      assert.match(triageMarkdown, /Routed Support Nodes: node-4, node-5/);
      assert.match(
        triageMarkdown,
        /Dispatch Contribution Histogram: local_primary:2, local_blocked:1, routed_support:2/,
      );
      assert.match(triageMarkdown, /Critical Control-Plane State: pending/);
      assert.match(
        triageMarkdown,
        /Critical Control-Plane Reasons: pending_write_growth, publication_pending/,
      );
      assert.match(triageMarkdown, /node-3, state=replica_blocked, dispatch=local_blocked/);
    });

  it('writes no-progress diagnostics into failure bundles', async () => {
    const scenarioDir = join(outputDir, 'postgres-baseline-comparison');
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(join(scenarioDir, 'seed-1.log'), 'progress stalled\n');

    const scenario = buildNoProgressFailureScenario();
    const failureBundle = await writeFailureBundlesForReport({
      scenarios: [scenario],
      reportOutputPath: reportPath,
      outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: tempDir,
    });

    const scenarioBundle = JSON.parse(
      await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
    );
    assert.equal(scenarioBundle.diagnostics.noProgress.reasonCode, 'stalled_no_progress');
    assert.equal(
      scenarioBundle.diagnostics.noProgress.failedNoProgress.details.budgetMs,
      20,
    );

    const markdown = await readFile(
      resolve(tempDir, scenario.failureBundle.markdownPath),
      UTF8_ENCODING,
    );
    assert.match(markdown, /## No Progress/);
    assert.equal(failureBundle.scenarioBundles.length, 1);
  });

  it('removes stale scenario and run failure artifacts when a later rerun passes',
    async () => {
      const scenarioName = 'postgres-baseline-comparison';
      const scenarioDir = join(outputDir, scenarioName);
      const runBundleDir = join(outputDir, 'failure-bundles');
      await mkdir(scenarioDir, {recursive: true});
      await mkdir(runBundleDir, {recursive: true});
      await writeFile(join(scenarioDir, 'node-1.log'), 'retained log\n');
      await writeFile(
        join(scenarioDir, 'failure-bundle.json'),
        '{"stale":true}\n',
      );
      await writeFile(
        join(scenarioDir, 'failure-bundle.md'),
        'stale failure bundle\n',
      );
      await writeFile(
        join(scenarioDir, 'triage-summary.json'),
        '{"stale":true}\n',
      );
      await writeFile(
        join(scenarioDir, 'triage-summary.md'),
        'stale triage summary\n',
      );
      await writeFile(
        join(runBundleDir, 'run-failure-bundle.json'),
        '{"stale":true}\n',
      );
      await writeFile(
        join(runBundleDir, 'run-failure-bundle.md'),
        'stale run failure bundle\n',
      );

      const passingScenario = {
        scenario: scenarioName,
        passed: true,
        failureBundle: {
          jsonPath: 'artifacts/postgres-baseline-comparison/failure-bundle.json',
        },
      };

      const failureBundle = await writeFailureBundlesForReport({
        scenarios: [passingScenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 0, pass: 1},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      assert.equal(failureBundle.runBundle, null);
      assert.equal(failureBundle.scenarioBundles.length, 0);
      assert.equal(
        Object.hasOwn(passingScenario, 'failureBundle'),
        false,
        'passing reruns should clear stale failure-bundle links from the scenario entry',
      );
      assert.equal(
        await readFile(join(scenarioDir, 'node-1.log'), UTF8_ENCODING),
        'retained log\n',
        'passing reruns should preserve non-failure artifacts in the scenario directory',
      );
      await assert.rejects(
        readFile(join(scenarioDir, 'failure-bundle.json'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(scenarioDir, 'failure-bundle.md'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(scenarioDir, 'triage-summary.json'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(scenarioDir, 'triage-summary.md'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(runBundleDir, 'run-failure-bundle.json'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(runBundleDir, 'run-failure-bundle.md'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
    },
  );

  it('captures load-lane timeout and circuit-open verify failures as targeted diagnostics',
    async () => {
      const scenarioDir = join(
        outputDir,
        'seven-node-postgres-baseline-partition-split',
      );
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(
          scenarioDir,
          '11601fe0-72d6-5853-8590-ec2881853e72.log',
        ),
        'load lane timeout\n',
      );

      const scenario = buildLoadLaneTimeoutFailureScenario();
      await writeFailureBundlesForReport({
        scenarios: [scenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      const nodeId = '11601fe0-72d6-5853-8590-ec2881853e72';

      assert.equal(scenarioBundle.summary.phase, 'verify');
      assert.equal(
        scenarioBundle.summary.rootCauseClass,
        'load',
      );
      assert.equal(
        scenarioBundle.topFailures.topReasons[0].reason,
        'load run completed with failed operations',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].loadMetrics.attemptErrors,
        73,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].errors.some((entry) =>
          entry.includes('timeoutClass=timeout'),
        ),
        true,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].errors.some((entry) =>
          entry.includes('circuit breaker is open'),
        ),
        true,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].adminQueryTrace[0].timeoutClass,
        'timeout',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].adminQueryTrace[1].errorCode,
        'circuit_open',
      );
      assert.equal(
        scenarioBundle.controlPlane,
        null,
        'load-lane verify failures should remain diagnosable even without snapshotsByNodeId',
      );

      const markdown = await readFile(
        resolve(tempDir, scenario.failureBundle.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(markdown, /operation=queryLoad/);
      assert.match(markdown, /timeoutClass=timeout/);
      assert.match(markdown, /circuit breaker is open/);
    });

  it('maps direct convergence diagnostics into control-plane bundle fields',
    async () => {
      const scenarioDir = join(outputDir, 'rolling-restart');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(join(scenarioDir, 'seed-1.log'), 'convergence timeout\n');

      const scenario = buildConvergenceDiagnosticsOnlyScenario();
      await writeFailureBundlesForReport({
        scenarios: [scenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergence.publicationStatus,
        'ack_pending',
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationModeByNodeId['seed-1'].currentMode,
        'recovering',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.pendingAckCount,
        1,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.recoveryProtocolState,
        'publication_pending',
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
        ['priority_partitions_not_spread', 'publication_epoch_pending'],
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        'publication_convergence_blocked',
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.signals.includes(
          'recoveryProtocolState=publication_pending',
        ),
        true,
      );
      assert.equal(
        scenarioBundle.recoveryReadiness.pendingAckRepairEligibleNodeIds[0],
        'joiner-1',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['joiner-1'].readiness.reasons[0].code,
        'control_plane_publication_pending',
      );
    });

  it('treats closed publication closure records and benign startup readiness as non-blocking',
    async () => {
      const scenarioDir = join(outputDir, 'node-join-under-load');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(join(scenarioDir, 'seed-1.log'), 'load completed\n');

      const writer = new ReportWriter(reportPath);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'load completed with admission backoff',
        loadMetrics: {
          total: 12,
          success: 12,
          failed: 0,
          errors: 0,
          attemptErrors: 4,
          latency: {p50: 10, p95: 50, p99: 75},
          opsPerSec: 4,
          waitReasons: {
            nodeAdmissionBlocked: 4,
          },
        },
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 6,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                pendingAckCount: 0,
                blockedNodeIds: [],
                blockedNodeCount: 0,
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                recoveryProtocolState: 'steady_published',
                priorityRecoveryReasonCodes: [],
                publicationPending: false,
                prioritySpreadPending: false,
                closureRecordId: 'CL-003',
                closureWitnessClass:
                  'publication_converged_priority_spread_pending',
                priorityRecoveryProgressClassCount: 0,
                priorityRecoveryInvariantFailingIds: [],
              },
              activeGateNoProgress: {
                mode: 'startup',
                attemptsSinceProgress: 1,
                stalled: false,
                readinessDelay: {
                  timedOut: false,
                  cause: 'none',
                  source: null,
                  recoverability: null,
                  error: null,
                },
              },
            },
          },
        },
      });

      const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      await writer.write({failureBundle: runBundle});

      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        'load_pressure',
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.status,
        'closed',
      );
      assert.deepEqual(
        scenarioBundle.summary.stabilityGates.convergence.blockers,
        [],
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.failover.status,
        'closed',
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure?.mode,
        'startup',
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure?.cause,
        'none',
      );

      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );
      assert.equal(triageSummary.summary.failureClass, 'load_pressure');

      const reportJson = JSON.parse(
        await readFile(reportPath, UTF8_ENCODING),
      );
      assert.equal(
        reportJson.scenarios[0].dominantReason,
        'nodeAdmissionBlocked',
      );
      assert.equal(
        reportJson.scenarios[0].rootCauseClass,
        'load',
      );
      assert.equal(
        reportJson.scenarios[0].failureClassification.failureClass,
        'load_pressure',
      );
    });

  it('classifies final leader mismatches after closed active readiness',
    async () => {
      const CLOSED_CLOSURE_TIMEOUT_REPORT_PATH = join(
        tempDir,
        'closed-closure-timeout-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const LEADER_MISMATCH_ERROR = 'Leader identities disagree';
      const LEADER_MISMATCH_REASON = 'leader_identities_disagree';
      const ROOT_CAUSE_CLASS_STARTUP = 'startup';
      const READINESS_TIMEOUT_REASON =
        'readiness_probe_timeout_fallback=Node readiness probe timed out for seed-1';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const STARTUP_READINESS_MODE = 'startup';
      const SNAPSHOT_REACHABILITY_TIMEOUT =
        'snapshot_reachability_timeout';
      const SNAPSHOT_REACHABILITY_SOURCE =
        'selectedSnapshotReachabilityError';
      const TERMINAL_RECOVERABILITY = 'terminal';
      const SNAPSHOT_REACHABILITY_ERROR =
        'Control snapshot reachability probe timed out for seed-1';
      const PUBLICATION_EPOCH = 5;
      const SCENARIO_DURATION_MS = 100;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 5;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const writer = new ReportWriter(CLOSED_CLOSURE_TIMEOUT_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: LEADER_MISMATCH_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: READINESS_TIMEOUT_REASON,
              reasonCounts: {
                [READINESS_TIMEOUT_REASON]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              mismatch: {
                reasonCode: LEADER_MISMATCH_REASON,
              },
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                publishedActiveNodeIds: [],
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoveryInvariantFailingIds: [],
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: true,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: EMPTY_COUNT,
                  unresolvedSemanticStateIds: [],
                  unresolvedSemanticStateCount: EMPTY_COUNT,
                  blockedPartitionIds: [],
                  blockedPartitionCount: EMPTY_COUNT,
                },
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
              activeGateNoProgress: {
                mode: STARTUP_READINESS_MODE,
                attemptsSinceProgress: SINGLE_COUNT,
                stalled: false,
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(
            CLOSED_CLOSURE_TIMEOUT_REPORT_PATH,
            UTF8_ENCODING,
          ),
        ).scenarios,
        reportOutputPath: CLOSED_CLOSURE_TIMEOUT_REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        LEADER_MISMATCH_REASON,
      );
      assert.notEqual(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.notEqual(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.status,
        'closed',
      );
      assert.deepEqual(
        scenarioBundle.summary.stabilityGates.convergence.blockers,
        [],
      );
    });

  it('classifies post-active convergence timeouts before retained startup readiness evidence',
    async () => {
      const POST_ACTIVE_CONVERGENCE_REPORT_PATH = join(
        tempDir,
        'post-active-convergence-barrier-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const CONVERGENCE_TIMEOUT_ERROR =
        'Convergence timeout after 120000ms. Max over-target: 69818ms.';
      const CONVERGENCE_TIMEOUT_REASON = 'convergence_timeout';
      const FAILURE_BARRIER_PHASE_CONVERGENCE = 'convergence';
      const FAILURE_BARRIER_SIGNAL = 'failureBarrier=convergence';
      const FAILURE_BARRIER_REASON_SIGNAL =
        'failureBarrierReason=' + CONVERGENCE_TIMEOUT_REASON;
      const POST_ACTIVE_CONVERGENCE_ACTION_MATCH =
        /Post-active topology convergence timed out/;
      const POST_ACTIVE_CONVERGENCE_RECOMMENDATION_MATCH =
        /final leader ownership/;
      const ROOT_CAUSE_CLASS_STARTUP = 'startup';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const READINESS_TIMEOUT_REASON =
        'readiness_probe_timeout_fallback=Node readiness probe timed out for seed-1';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const STARTUP_READINESS_MODE = 'startup';
      const SNAPSHOT_REACHABILITY_TIMEOUT =
        'snapshot_reachability_timeout';
      const SNAPSHOT_REACHABILITY_SOURCE =
        'selectedSnapshotReachabilityError';
      const TERMINAL_RECOVERABILITY = 'terminal';
      const SNAPSHOT_REACHABILITY_ERROR =
        'Control snapshot reachability probe timed out for seed-1';
      const PUBLICATION_EPOCH = 5;
      const SCENARIO_DURATION_MS = 100;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 5;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const writer = new ReportWriter(POST_ACTIVE_CONVERGENCE_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: READINESS_TIMEOUT_REASON,
              reasonCounts: {
                [READINESS_TIMEOUT_REASON]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                publishedActiveNodeIds: [],
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoveryInvariantFailingIds: [],
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: true,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: EMPTY_COUNT,
                  unresolvedSemanticStateIds: [],
                  unresolvedSemanticStateCount: EMPTY_COUNT,
                  blockedPartitionIds: [],
                  blockedPartitionCount: EMPTY_COUNT,
                },
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
              activeGateNoProgress: {
                mode: STARTUP_READINESS_MODE,
                attemptsSinceProgress: SINGLE_COUNT,
                stalled: false,
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(
            POST_ACTIVE_CONVERGENCE_REPORT_PATH,
            UTF8_ENCODING,
          ),
        ).scenarios,
        reportOutputPath: POST_ACTIVE_CONVERGENCE_REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONVERGENCE_TIMEOUT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_REASON_SIGNAL),
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier.phase,
        FAILURE_BARRIER_PHASE_CONVERGENCE,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.failover.status,
        'closed',
      );
      assert.match(
        scenarioBundle.summary.failureAction,
        POST_ACTIVE_CONVERGENCE_ACTION_MATCH,
      );
      assert.match(
        scenarioBundle.summary.operatorRecommendation,
        POST_ACTIVE_CONVERGENCE_RECOMMENDATION_MATCH,
      );
    });

  it('classifies open post-rebalance closure before stale priority recovery evidence',
    async () => {
      const REPORT_PATH = join(
        tempDir,
        'post-rebalance-closure-owner-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const CONVERGENCE_TIMEOUT_ERROR =
        'Convergence timeout after 120000ms. Max over-target: 151321ms.';
      const CONVERGENCE_TIMEOUT_REASON = 'convergence_timeout';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const POST_REBALANCE_CLOSURE_STATE_OPEN = 'open';
      const POST_REBALANCE_CLOSURE_STATE_SOFT_CLOSED = 'soft_closed';
      const MEMBERSHIP_TRIM_BLOCKER_ID = 'membership_trim_open';
      const NO_OVER_TARGET_BLOCKER_ID = 'no_over_target_open';
      const OPERATION_DRAIN_SOFT_CLOSURE_ID =
        'operation_drain_soft_closed';
      const MEMBERSHIP_TRIM_DIMENSION = 'membership_trim';
      const NO_OVER_TARGET_DIMENSION = 'no_over_target';
      const OPERATION_DRAIN_DIMENSION = 'operation_drain';
      const MEMBERSHIP_TRIM_REASON = 'published_membership_trim_debt';
      const OVERTARGET_REASON = 'overtarget_budget_exceeded';
      const STALE_REPLICA_OPERATIONS_REASON =
        'ignored_stale_replica_operations';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS = 'operation_stalled';
      const PRIORITY_RECOVERY_SEMANTIC_STATE = 'recovering_in_flight';
      const SCENARIO_DURATION_MS = 100;
      const PUBLICATION_EPOCH = 7;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const POST_REBALANCE_STATE_SIGNAL =
        'postRebalanceClosureState=' +
        POST_REBALANCE_CLOSURE_STATE_OPEN;
      const POST_REBALANCE_BLOCKER_SIGNAL =
        'postRebalanceBlocker=' + MEMBERSHIP_TRIM_BLOCKER_ID;
      const POST_REBALANCE_DIMENSION_SIGNAL =
        'postRebalanceDimension=' + MEMBERSHIP_TRIM_DIMENSION;
      const POST_REBALANCE_REASON_SIGNAL =
        'postRebalanceReason=' + MEMBERSHIP_TRIM_REASON;
      const POST_REBALANCE_SOFT_CLOSURE_SIGNAL =
        'postRebalanceSoftClosure=' + OPERATION_DRAIN_SOFT_CLOSURE_ID;
      const POST_REBALANCE_ACTION_MATCH =
        /Post-rebalance topology closure remains open/;
      const POST_REBALANCE_RECOMMENDATION_MATCH =
        /membership trim debt/;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: CONVERGENCE_TIMEOUT_REASON,
              reasonCounts: {
                [CONVERGENCE_TIMEOUT_REASON]: SINGLE_COUNT,
              },
            },
            postRebalanceClosure: {
              state: POST_REBALANCE_CLOSURE_STATE_OPEN,
              blockers: [
                {
                  id: MEMBERSHIP_TRIM_BLOCKER_ID,
                  dimension: MEMBERSHIP_TRIM_DIMENSION,
                  reasonCodes: [MEMBERSHIP_TRIM_REASON],
                },
                {
                  id: NO_OVER_TARGET_BLOCKER_ID,
                  dimension: NO_OVER_TARGET_DIMENSION,
                  reasonCodes: [OVERTARGET_REASON],
                },
              ],
              softClosures: [
                {
                  id: OPERATION_DRAIN_SOFT_CLOSURE_ID,
                  dimension: OPERATION_DRAIN_DIMENSION,
                  reasonCodes: [STALE_REPLICA_OPERATIONS_REASON],
                },
              ],
              dimensions: {
                [OPERATION_DRAIN_DIMENSION]: {
                  dimension: OPERATION_DRAIN_DIMENSION,
                  state: POST_REBALANCE_CLOSURE_STATE_SOFT_CLOSED,
                  reasonCodes: [STALE_REPLICA_OPERATIONS_REASON],
                },
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
                priorityRecoveryInvariantFailingIds: [],
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: SINGLE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE,
                ],
                priorityRecoverySemanticStateCount: SINGLE_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: SINGLE_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: SINGLE_COUNT,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONVERGENCE_TIMEOUT_REASON,
      );
      assert.notEqual(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_BLOCKER_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_DIMENSION_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_REASON_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_SOFT_CLOSURE_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.summary.postRebalanceClosure.state,
        POST_REBALANCE_CLOSURE_STATE_OPEN,
      );
      assert.equal(
        scenarioBundle.diagnostics.postRebalanceClosure.state,
        POST_REBALANCE_CLOSURE_STATE_OPEN,
      );
      assert.match(
        scenarioBundle.summary.failureAction,
        POST_REBALANCE_ACTION_MATCH,
      );
      assert.match(
        scenarioBundle.summary.operatorRecommendation,
        POST_REBALANCE_RECOMMENDATION_MATCH,
      );
    });

  it('classifies convergence timeouts with closed playback publication before readiness-only evidence',
    async () => {
      const REPORT_PATH = join(
        tempDir,
        'closed-playback-convergence-barrier-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const CONVERGENCE_TIMEOUT_ERROR =
        'Convergence timeout after 120000ms. Max over-target: 8444ms.';
      const CONVERGENCE_TIMEOUT_REASON = 'convergence_timeout';
      const FAILURE_BARRIER_PHASE_CONVERGENCE = 'convergence';
      const FAILURE_BARRIER_SIGNAL = 'failureBarrier=convergence';
      const FAILURE_BARRIER_REASON_SIGNAL =
        'failureBarrierReason=' + CONVERGENCE_TIMEOUT_REASON;
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const READINESS_NODE_ID = 'seed-1';
      const READINESS_TIMEOUT_REASON =
        'readiness_probe_timeout_fallback=Node readiness probe timed out for ' +
        READINESS_NODE_ID;
      const STARTUP_SNAPSHOT_READY_REASON = 'startup_snapshot_ready';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const PUBLICATION_EPOCH = 5;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_COUNT = 0;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failedPhase: {
              artifacts: {
                nodeReasonsByNodeId: {
                  [READINESS_NODE_ID]: [
                    READINESS_TIMEOUT_REASON,
                    STARTUP_SNAPSHOT_READY_REASON,
                  ],
                },
              },
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                publishedActiveNodeIds: [],
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONVERGENCE_TIMEOUT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_REASON_SIGNAL),
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier.phase,
        FAILURE_BARRIER_PHASE_CONVERGENCE,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.status,
        'closed',
      );
    });

  it('classifies final observer revision lag as cache stale',
    async () => {
      const REPORT_PATH = join(tempDir, 'observer-revision-lag-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const OBSERVER_REVISION_LAG_ERROR =
        'Observer snapshot revisions lag for final consistency';
      const OBSERVER_REVISION_LAG_REASON =
        'observer_snapshot_revision_lag';
      const OBSERVER_REVISION_LAG_STATE = 'observer_revision_lag';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: OBSERVER_REVISION_LAG_ERROR,
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              finalConsistency: {
                state: OBSERVER_REVISION_LAG_STATE,
                reasonCode: OBSERVER_REVISION_LAG_REASON,
              },
              mismatch: {
                reasonCode: OBSERVER_REVISION_LAG_REASON,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_CACHE_STALE,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        OBSERVER_REVISION_LAG_REASON,
      );
    });

  it('classifies final authority visibility lag as cache stale',
    async () => {
      const REPORT_PATH = join(tempDir, 'authority-visibility-lag-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const AUTHORITY_VISIBILITY_LAG_ERROR =
        'Partition leader authority mismatch for p1';
      const AUTHORITY_VISIBILITY_LAG_REASON =
        'observer_authority_visibility_lag';
      const AUTHORITY_VISIBILITY_LAG_STATE =
        'observer_authority_visibility_lag';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: AUTHORITY_VISIBILITY_LAG_ERROR,
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              finalConsistency: {
                state: AUTHORITY_VISIBILITY_LAG_STATE,
                reasonCode: AUTHORITY_VISIBILITY_LAG_REASON,
              },
              mismatch: {
                reasonCode: AUTHORITY_VISIBILITY_LAG_REASON,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_CACHE_STALE,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        AUTHORITY_VISIBILITY_LAG_REASON,
      );
    });

  it('classifies final CDC visibility lag from structured diagnostics',
    async () => {
      const REPORT_PATH = join(tempDir, 'final-cdc-lag-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const CDC_VISIBILITY_LAG_REASON = 'cdc_visibility_lag';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: 'final consistency cdc visibility lag',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              finalConsistency: {
                state: CDC_VISIBILITY_LAG_REASON,
                reasonCode: CDC_VISIBILITY_LAG_REASON,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_CDC_DEGRADED,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        CDC_VISIBILITY_LAG_REASON,
      );
    });

  it('does not use legacy leader-message inference when structured final state is unknown',
    async () => {
      const REPORT_PATH = join(tempDir, 'unknown-final-state-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const UNKNOWN_FINAL_STATE = 'unknown_final_consistency_state';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: 'Leader identities disagree for p1',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              finalConsistency: {
                state: UNKNOWN_FINAL_STATE,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_UNKNOWN,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        UNKNOWN_FINAL_STATE,
      );
    });

  it('keeps legacy leader-message compatibility without structured diagnostics',
    async () => {
      const REPORT_PATH = join(tempDir, 'legacy-leader-message-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const LEGACY_LEADER_REASON = 'leader_identities_disagree';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: 'Leader identities disagree for p1',
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        LEGACY_LEADER_REASON,
      );
    });

  it('includes bottleneck estimates in scenario failure bundle summaries',
    async () => {
      const reportPath = join(tempDir, 'report.json');
      const writer = new ReportWriter(reportPath);
      writer.addResult('postgres-baseline-comparison', {
        passed: false,
        duration: 100,
        error: 'load failed',
        loadMetrics: {
          total: 400,
          success: 380,
          failed: 20,
          errors: 20,
          attemptErrors: 120,
          latency: {avg: 12, p50: 10, p95: 14, p99: 18},
          queueDelay: {avg: 80, p50: 60, p95: 900, p99: 1200, max: 1400},
          opsPerSec: 20,
          targetOperations: 1000,
          dispatchedOperations: 400,
          undispatchedOperations: 600,
          waitReasons: {
            nodeSlotUnavailable: 20,
            nodeAdmissionBlocked: 5,
            retryableControlPlanePressure: 4,
            timeoutWaits: 3,
            queueCapacityRejected: 0,
          },
        },
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: 'load',
              dominantReason: 'dispatch_backlog',
              reasonCounts: {
                dispatch_backlog: 1,
              },
              affectedNodeIds: [],
            },
            failedPhase: {
              phase: 'load',
              errors: [],
              artifacts: {},
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(await readFile(reportPath, UTF8_ENCODING));

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: reportPath,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
        workspaceRoot: tempDir,
      });
      assert.equal(scenarioBundles.length, 1);

      const bundlePath = resolve(tempDir, scenarioBundles[0].links.jsonPath);
      const scenarioBundle = JSON.parse(await readFile(bundlePath, UTF8_ENCODING));
      assert.deepEqual(scenarioBundle.summary.bottleneckEstimate, {
        kind: 'dispatch_queue_backlog',
        primaryEvidence: {
          undispatchedOperations: 600,
          undispatchedRatio: 0.6,
          queueDelayP95Ms: 900,
        },
        likelyWaitingTimeSource: 'dispatch_queue',
      });
    });

  it('derives blocked-partition counts from retained priority-partition summaries',
    async () => {
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report.json',
      );
      const writer = new ReportWriter(priorityRecoveryReportPath);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 14,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 1,
                  totalPriorityPartitionCount: 5,
                  blockedPartitions: [{
                    partitionId: 'control_plane_publications-p1',
                    spreadGap: 1,
                  }, {
                    partitionId: 'replica_operations-p1',
                    spreadGap: 2,
                  }],
                  missingPartitionIds: [
                    'control_plane_publications-p1',
                    'replica_operations-p1',
                  ],
                },
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(priorityRecoveryReportPath, UTF8_ENCODING),
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: priorityRecoveryReportPath,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
        workspaceRoot: tempDir,
      });
      const bundlePath = resolve(tempDir, scenarioBundles[0].links.jsonPath);
      const scenarioBundle = JSON.parse(
        await readFile(bundlePath, UTF8_ENCODING),
      );

      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitionCount,
        2,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .largestSpreadGap,
        2,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .totalSpreadGap,
        3,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['control_plane_publications-p1', 'replica_operations-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        0,
      );
    });

  it(
    'distinguishes convergence-blocked partitions from unresolved decision partitions',
    async () => {
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-decision-mismatch.json',
      );
      const writer = new ReportWriter(priorityRecoveryReportPath);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 15,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 5,
                  blockedPartitions: [{
                    partitionId: 'control_plane_publications-p1',
                    spreadGap: 2,
                  }, {
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 15,
                snapshots: [{
                  partitionId: 'control_plane_publications-p1',
                  semanticState: 'spread_satisfied_in_flight',
                  planner: {
                    ready: false,
                    spreadGap: 2,
                  },
                }, {
                  partitionId: 'replica_operations-p1',
                  semanticState: 'recovering_in_flight',
                  planner: {
                    ready: false,
                    spreadGap: 1,
                  },
                  coordinator: {
                    operationCount: 1,
                    operationIds: ['op-1'],
                  },
                }],
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(priorityRecoveryReportPath, UTF8_ENCODING),
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: priorityRecoveryReportPath,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
        workspaceRoot: tempDir,
      });
      const bundlePath = resolve(tempDir, scenarioBundles[0].links.jsonPath);
      const scenarioBundle = JSON.parse(
        await readFile(bundlePath, UTF8_ENCODING),
      );

      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['replica_operations-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryBlockedPartitionCount,
        1,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitions.map((partition) => partition.partitionId),
        ['control_plane_publications-p1', 'replica_operations-p1'],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionIds,
        ['replica_operations-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        1,
      );
    });

  it(
    'prefers canonical priority-recovery observation over conflicting raw diagnostics',
    async () => {
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-canonical-observation.json',
      );
      const writer = new ReportWriter(priorityRecoveryReportPath);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 22,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                pendingAckNodeIds: [],
                pendingAckCount: 0,
                publicationConvergenceGateReasons: [
                  'priority_control_plane_spread_pending',
                ],
                closureRecordId: 'CL-OBS-022',
                closureWitnessClass:
                  'publication_converged_priority_spread_pending',
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitionCount: 1,
                  largestSpreadGap: 1,
                  totalSpreadGap: 1,
                  missingPartitionIds: ['replica_operations-p1'],
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                priorityRecoveryBlockedPartitionIds: [
                  'replica_operations-p1',
                ],
                priorityRecoveryBlockedPartitionCount: 1,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: 0,
                priorityRecoveryProgressClassIds: [
                  'operation_created_but_no_step_transitions',
                ],
                priorityRecoveryProgressClassCount: 1,
                priorityRecoverySemanticStateIds: ['operation_stalled'],
                priorityRecoverySemanticStateCount: 1,
                projectionDiagnostics: {
                  readinessDecisionMode: 'explicit_dimensions',
                  readinessDecisionDimensions: ['control_plane_writable'],
                  recoveryEligibleProjectionEnabled: true,
                  recoveryEligibleIncludedNodeIds: ['joiner-1'],
                  readinessExcludedNodeIds: [],
                  clusterMemberUnhealthyExcludedNodeIds: [],
                },
              },
              publicationConvergence: {
                publicationEpoch: 22,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 2,
                  blockedPartitions: [{
                    partitionId: 'control_plane_publications-p1',
                    spreadGap: 2,
                  }, {
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              publicationConvergenceGate: {
                publicationEpoch: 22,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitions: [{
                    partitionId: 'control_plane_publications-p1',
                    spreadGap: 2,
                  }, {
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 22,
                snapshots: [{
                  partitionId: 'control_plane_publications-p1',
                  semanticState: 'operation_stalled',
                  blockerReasons: [
                    'operation_created_but_no_step_transitions',
                  ],
                  planner: {
                    ready: false,
                    spreadGap: 2,
                  },
                }],
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(priorityRecoveryReportPath, UTF8_ENCODING),
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: priorityRecoveryReportPath,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['control_plane_publications-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryBlockedPartitionCount,
        1,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionIds,
        ['control_plane_publications-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        1,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        'CL-OBS-022',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        'publication_converged_priority_spread_pending',
      );
      assert.equal(
        triageSummary.publicationConvergence.priorityPartitionSummary
          .blockedPartitionCount,
        2,
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['control_plane_publications-p1'],
      );
    },
  );

  it(
    'rebuilds stale embedded priority-recovery observation from canonical publication evidence',
    async () => {
      const PRIORITY_RECOVERY_REPORT_PATH = join(
        tempDir,
        'priority-recovery-report-with-stale-embedded-observation.json',
      );
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const STALE_PRIORITY_RECOVERY_PROGRESS_CLASS =
        'eligible_but_no_operation_created';
      const STALE_PRIORITY_RECOVERY_BLOCKER =
        'priority_recovery_progress_class=' +
        STALE_PRIORITY_RECOVERY_PROGRESS_CLASS;
      const writer = new ReportWriter(PRIORITY_RECOVERY_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                prioritySpreadPending: true,
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                priorityRecoveryBlockedPartitionIds: [
                  'replica_operations-p1',
                ],
                priorityRecoveryBlockedPartitionCount: 1,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: 0,
              },
              publicationConvergence: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'steady_published',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
              },
              publicationConvergenceGate: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                pendingAckNodeIds: [],
                prioritySpreadPending: true,
                ready: false,
                active: true,
              },
              activeGateProgress: {
                expectedNodeCount: 2,
                activeNodeCount: 2,
                inactiveNodeCount: 0,
                snapshotCoverageNodeCount: 2,
                snapshotCoverageComplete: true,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                pendingAckCount: 0,
                missingPublishedCount: 0,
                gateReasonCount: 0,
                gateReasons: [],
                prioritySpreadSatisfied: false,
                priorityBlockedPartitionCount: 1,
                priorityRecoveryProgressClasses: {
                  partitionIdsByClass: {
                    [STALE_PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                      'replica_operations-p1',
                    ],
                  },
                  unresolvedClassIds: [
                    STALE_PRIORITY_RECOVERY_PROGRESS_CLASS,
                  ],
                  unresolvedClassCount: 1,
                  partitionIdsBySemanticState: {
                    needs_operation: ['replica_operations-p1'],
                  },
                  unresolvedSemanticStateIds: ['needs_operation'],
                  unresolvedSemanticStateCount: 1,
                  blockedPartitionIds: ['replica_operations-p1'],
                  blockedPartitionCount: 1,
                },
                priorityRecoveryUnresolvedClassCount: 1,
                priorityRecoveryUnresolvedSemanticStateCount: 1,
                priorityRecoveryBlockedPartitionCount: 1,
                blockers: [STALE_PRIORITY_RECOVERY_BLOCKER],
                blockerSignature: STALE_PRIORITY_RECOVERY_BLOCKER,
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 23,
                closureWitness: {
                  state: 'closure_satisfied_stale_publication',
                  prioritySpreadPending: false,
                  publicationRefreshRequired: true,
                  closureRecordId: CLOSURE_RECORD_ID,
                  closureWitnessClass: CLOSURE_WITNESS_CLASS,
                  refreshedPriorityPartitionSummary: {
                    satisfied: true,
                    requiredDistinctNodeCount: 3,
                    readyEligibleNodeCount: 3,
                    totalPriorityPartitionCount: 1,
                    missingPartitionIds: [],
                    blockedPartitions: [],
                    blockedPartitionCount: 0,
                    largestSpreadGap: 0,
                    totalSpreadGap: 0,
                  },
                },
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 1,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                  blockedPartitionCount: 0,
                  largestSpreadGap: 0,
                  totalSpreadGap: 0,
                },
                partitionIdsBySemanticState: {},
                snapshots: [],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(PRIORITY_RECOVERY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: PRIORITY_RECOVERY_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        CLOSURE_RECORD_ID,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        CLOSURE_WITNESS_CLASS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .satisfied,
        true,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitionCount,
        0,
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergenceGate.ready,
        true,
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergenceGate
          .prioritySpreadPending,
        false,
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergenceGate.closureRecordId,
        CLOSURE_RECORD_ID,
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryObservation
          .activeGateProgress.prioritySpreadSatisfied,
        true,
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryObservation
          .activeGateProgress.priorityRecoveryBlockedPartitionCount,
        0,
      );
      assert.deepEqual(
        scenarioBundle.controlPlane.priorityRecoveryObservation
          .activeGateProgress.blockers,
        ['ready'],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitions || [],
        [],
      );
      assert.equal(
        triageSummary.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.priorityRecoveryReasonCodes,
        [],
      );
    },
  );

  it(
    'prefers terminal active-gate diagnostics over stale playback priority-recovery evidence',
    async () => {
      const REPORT_PATH = join(
        tempDir,
        'terminal-active-gate-over-stale-playback-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const SCENARIO_DIR = join(tempDir, SCENARIO_NAME);
      const STALE_DOMINANT_REASON = 'priority_partitions_not_spread';
      const STALE_PROGRESS_CLASS = 'eligible_but_no_operation_created';
      const STALE_PARTITION_ID = 'sql_transactions-p1';
      const ACTIVE_GATE_BLOCKER = 'inactive_nodes=1';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_PENDING =
        'priority_spread_pending';
      const STARTUP_READINESS_MODE = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const READINESS_CLASS_NO_PROGRESS = 'no_progress_terminal';
      const TERMINAL_REASON_STALLED = 'stalled_no_progress';
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 4;
      const FULL_ACTIVE_NODE_COUNT = 5;
      const TERMINAL_ATTEMPT_COUNT = 6;
      const TERMINAL_ELAPSED_MS = 122546;
      const PLAYBACK_CAPTURED_AT_MS = 1700000000000;
      const writer = new ReportWriter(REPORT_PATH);
      await mkdir(SCENARIO_DIR, {recursive: true});
      await writeFile(
        join(SCENARIO_DIR, 'events.ndjson'),
        JSON.stringify({
          timestamp: PLAYBACK_CAPTURED_AT_MS,
          type: 'cluster.stage',
          details: {
            stage: 'setup.cluster.active',
            snapshotCoverage: {
              completeCoverage: true,
              bestCoverageNodeCount: EXPECTED_NODE_COUNT,
              selectedNodeId: 'seed-1',
              selectedCapturedAtMs: PLAYBACK_CAPTURED_AT_MS,
              selectedObservedNodeIds: [
                'seed-1',
                'seed-2',
                'seed-3',
                'seed-4',
                'seed-5',
              ],
              selectedPublicationConvergence: {
                publicationEpoch: 4,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_PENDING,
                priorityRecoveryReasonCodes: [STALE_DOMINANT_REASON],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: SINGLE_COUNT,
                  blockedPartitions: [{
                    partitionId: STALE_PARTITION_ID,
                    spreadGap: SINGLE_COUNT,
                  }],
                },
                pendingAckNodeIds: [],
              },
              selectedPublishedMembershipObservation: {
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              },
            },
            publicationConvergenceGate: {
              publicationEpoch: 4,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              recoveryProtocolState:
                RECOVERY_PROTOCOL_STATE_PRIORITY_PENDING,
              reasonCodes: [STALE_DOMINANT_REASON],
              prioritySpreadPending: true,
              ready: false,
              pendingAckNodeIds: [],
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitionCount: SINGLE_COUNT,
                blockedPartitions: [{
                  partitionId: STALE_PARTITION_ID,
                  spreadGap: SINGLE_COUNT,
                }],
              },
            },
            activeGateProgress: {
              expectedNodeCount: EXPECTED_NODE_COUNT,
              activeNodeCount: FULL_ACTIVE_NODE_COUNT,
              inactiveNodeCount: EMPTY_COUNT,
              snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
              snapshotCoverageComplete: true,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              recoveryProtocolState:
                RECOVERY_PROTOCOL_STATE_PRIORITY_PENDING,
              pendingAckCount: EMPTY_COUNT,
              missingPublishedCount: EMPTY_COUNT,
              gateReasonCount: EMPTY_COUNT,
              gateReasons: [],
              prioritySpreadSatisfied: false,
              priorityBlockedPartitionCount: SINGLE_COUNT,
              priorityRecoveryProgressClasses: {
                unresolvedClassIds: [STALE_PROGRESS_CLASS],
                unresolvedClassCount: SINGLE_COUNT,
                unresolvedSemanticStateIds: ['needs_operation'],
                unresolvedSemanticStateCount: SINGLE_COUNT,
                blockedPartitionIds: [STALE_PARTITION_ID],
                blockedPartitionCount: SINGLE_COUNT,
              },
              priorityRecoveryUnresolvedClassCount: SINGLE_COUNT,
              priorityRecoveryUnresolvedSemanticStateCount: SINGLE_COUNT,
              priorityRecoveryBlockedPartitionCount: SINGLE_COUNT,
              blockers: [
                'priority_recovery_progress_class=' + STALE_PROGRESS_CLASS,
              ],
            },
          },
        }) + '\n',
      );
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: 100,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: 'topology',
              dominantReason: STALE_DOMINANT_REASON,
              reasonCounts: {
                [STALE_DOMINANT_REASON]: SINGLE_COUNT,
                priority_recovery_progress_class: SINGLE_COUNT,
              },
            },
            activeGate: {
              mode: STARTUP_READINESS_MODE,
              state: ACTIVE_GATE_STATE_TIMED_OUT,
              ready: false,
              attempts: TERMINAL_ATTEMPT_COUNT,
              elapsedMs: TERMINAL_ELAPSED_MS,
              attemptsSinceProgress: 5,
              coordinatorCyclesSinceProgress: 5,
              reasonCode: TERMINAL_REASON_STALLED,
              progress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: SINGLE_COUNT,
                snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                publicationEpoch: 4,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: true,
                prioritySpreadGap: EMPTY_COUNT,
                priorityBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: EMPTY_COUNT,
                  unresolvedSemanticStateIds: [],
                  unresolvedSemanticStateCount: EMPTY_COUNT,
                  blockedPartitionIds: [],
                  blockedPartitionCount: EMPTY_COUNT,
                },
                priorityRecoveryUnresolvedClassCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedSemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                readinessDelay: {
                  timedOut: false,
                  cause: 'none',
                  source: null,
                  recoverability: null,
                  error: null,
                },
                blockers: [ACTIVE_GATE_BLOCKER],
                blockerSignature: ACTIVE_GATE_BLOCKER,
              },
              blockerHistory: [{
                blockers: [ACTIVE_GATE_BLOCKER],
                signature: ACTIVE_GATE_BLOCKER,
                count: TERMINAL_ATTEMPT_COUNT,
                firstAttempt: SINGLE_COUNT,
                lastAttempt: TERMINAL_ATTEMPT_COUNT,
              }],
              admissionState: {
                strong_active: ACTIVE_NODE_COUNT,
                blocked: SINGLE_COUNT,
              },
              readinessFailure: {
                mode: STARTUP_READINESS_MODE,
                classCode: READINESS_CLASS_NO_PROGRESS,
                progressSignal: {
                  attemptsSinceProgress: 5,
                  stalled: false,
                },
                terminalReason: TERMINAL_REASON_STALLED,
                cause: 'none',
              },
            },
            priorityRecoveryInvariants: {
              failingInvariantIds: [],
              passed: true,
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.notEqual(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.equal(failureClassification.dominantReason, ACTIVE_GATE_BLOCKER);
      assert.equal(
        scenarioBundle.publicationConvergence.publicationStatus,
        PUBLICATION_STATUS_PUBLISHED,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_STATE_STEADY,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryProgressClassCount,
        EMPTY_COUNT,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryBlockedPartitionCount,
        EMPTY_COUNT,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.activeGate.state,
        ACTIVE_GATE_STATE_TIMED_OUT,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.activeGateProgress.blockers,
        [ACTIVE_GATE_BLOCKER],
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure.classCode,
        READINESS_CLASS_NO_PROGRESS,
      );
    },
  );

  it(
    'replays playback snapshot priority-recovery evidence when a stale observation collapses active replace work to needs-operation',
    async () => {
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-playback-replay-cutover.json',
      );
      const scenarioName = 'node-join-under-load';
      const scenarioDir = join(tempDir, scenarioName);
      const playbackTimestampMs = 5000;
      const staleObservationTimestampMs = 4900;
      const replayPartitionId = 'replica_operations-p1';
      const replayOperationId = 'op-replay-active-replace';
      const replaySourceNodeId = 'seed-1';
      const replayTargetNodeId = 'joiner-1';
      const replayReplicaId = 'replica_operations-p1-r4';
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(scenarioDir, 'snapshots.ndjson'),
        JSON.stringify({
          timestamp: playbackTimestampMs,
          replicaOperations: [{
            operation_id: replayOperationId,
            partition_id: replayPartitionId,
            entity_type: 'partition',
            operation_type: 'REPLACE',
            status: 'active',
            workflow_step: 'ACTIVE',
            source_node_id: replaySourceNodeId,
            target_node_id: replayTargetNodeId,
            replica_id: replayReplicaId,
            created_at: 4000,
            updated_at: 4500,
          }],
          services: [{
            partition_id: replayPartitionId,
            node_id: replayTargetNodeId,
            replica_id: replayReplicaId,
            status: 'active',
            raft_role: 'follower',
          }],
        }) + '\n',
      );

      const writer = new ReportWriter(priorityRecoveryReportPath);
      writer.addResult(scenarioName, {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 31,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                pendingAckNodeIds: [],
                pendingAckCount: 0,
                publicationConvergenceGateReasons: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitionCount: 1,
                  largestSpreadGap: 1,
                  totalSpreadGap: 1,
                  missingPartitionIds: [replayPartitionId],
                  blockedPartitions: [{
                    partitionId: replayPartitionId,
                    spreadGap: 1,
                  }],
                },
                priorityRecoveryBlockedPartitionIds: [replayPartitionId],
                priorityRecoveryBlockedPartitionCount: 1,
                priorityRecoveryUnresolvedPartitionIds: [replayPartitionId],
                priorityRecoveryUnresolvedPartitionCount: 1,
                priorityRecoveryProgressClassIds: [
                  'eligible_but_no_operation_created',
                ],
                priorityRecoveryProgressClassCount: 1,
                priorityRecoverySemanticStateIds: ['needs_operation'],
                priorityRecoverySemanticStateCount: 1,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: replayPartitionId,
                  operationIds: [],
                  semanticStateId: 'needs_operation',
                  blockerReasonCodes: [
                    'eligible_but_no_operation_created',
                  ],
                  workflowState: 'none',
                  visibilityState: 'none',
                  currentOwner: 'rebalancer_leader',
                  nextRequiredAction: 'create_recovery_operation',
                  blockingBoundary: 'operation_scheduling',
                  waitMode: 'event_driven',
                  completionState: 'blocked',
                }],
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                capturedAt: staleObservationTimestampMs,
                publicationEpoch: 31,
                snapshots: [{
                  partitionId: replayPartitionId,
                  semanticState: 'needs_operation',
                  blockerReasons: [
                    'eligible_but_no_operation_created',
                  ],
                  planner: {
                    ready: false,
                    spreadGap: 1,
                  },
                  completion: {
                    state: 'blocked',
                    blocked: true,
                  },
                  observation: {
                    workflowState: 'none',
                    visibilityState: 'none',
                    convergenceState: 'spread_gap',
                    provenance: {
                      capturedAt: staleObservationTimestampMs,
                    },
                  },
                  coordinator: {
                    operationCount: 0,
                    operationIds: [],
                  },
                }],
              },
              publicationConvergence: {
                publicationEpoch: 31,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: [
                  replaySourceNodeId,
                  replayTargetNodeId,
                ],
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: replayPartitionId,
                    spreadGap: 1,
                  }],
                },
              },
              publicationConvergenceGate: {
                publicationEpoch: 31,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitions: [{
                    partitionId: replayPartitionId,
                    spreadGap: 1,
                  }],
                },
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(priorityRecoveryReportPath, UTF8_ENCODING),
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: priorityRecoveryReportPath,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.deepEqual(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots[0].coordinator.operationIds,
        [replayOperationId],
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshotCount,
        1,
      );
      assert.deepEqual(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .partitionIdsBySemanticState.needs_operation,
        [],
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots[0].semanticState,
        'spread_satisfied_in_flight',
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots[0].observation.workflowState,
        'remove_phase',
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots[0].completion.state,
        'spread_satisfied_in_flight',
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0]?.partitionId,
        replayPartitionId,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0]?.semanticStateId,
        'spread_satisfied_in_flight',
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionIds,
        [],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryProgressClassIds,
        [],
      );
      assert.equal(
        triageSummary.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        0,
      );
      assert.equal(
        scenarioBundle.summary.dominantReason,
        null,
      );
    },
  );

  it(
    'does not classify spread-satisfied witness summaries as blocked priority-recovery progress',
    async () => {
      const NON_BLOCKING_WITNESS_REPORT_PATH = join(
        tempDir,
        'priority-recovery-non-blocking-witness-report.json',
      );
      const NON_BLOCKING_PARTITION_ID = 'control_plane_publications-p1';
      const NON_BLOCKING_OPERATION_ID = 'op-spread-satisfied-active';
      const writer = new ReportWriter(NON_BLOCKING_WITNESS_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 32,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'steady_published',
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 1,
                  blockedPartitionCount: 0,
                  largestSpreadGap: 0,
                  totalSpreadGap: 0,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryBlockedPartitionIds: [],
                priorityRecoveryBlockedPartitionCount: 0,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: 0,
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: 0,
                priorityRecoverySemanticStateIds: [],
                priorityRecoverySemanticStateCount: 0,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: NON_BLOCKING_PARTITION_ID,
                  semanticStateId: 'spread_satisfied_in_flight',
                  completionState: 'converged',
                  workflowState: 'remove_phase',
                  visibilityState: 'cache_visible',
                  operationIds: [NON_BLOCKING_OPERATION_ID],
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(NON_BLOCKING_WITNESS_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: NON_BLOCKING_WITNESS_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.dominantReason,
        null,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        null,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .partitionCount,
        1,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.partitionId,
        NON_BLOCKING_PARTITION_ID,
      );
    },
  );

  it(
    'classifies stalled priority recovery after publication closure separately from publication convergence',
    async () => {
      const PRIORITY_RECOVERY_STALLED_REPORT_PATH = join(
        tempDir,
        'priority-recovery-operation-stalled-report.json',
      );
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID = 'op-priority-stalled';
      const PRIORITY_RECOVERY_PROGRESS_CLASS_ID =
        'operation_created_but_no_step_transitions';
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID = 'operation_stalled';
      const PRIORITY_RECOVERY_REASON_CODE =
        'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_WORKFLOW_STATE = 'remove_phase';
      const PRIORITY_RECOVERY_COMPLETION_STATE = 'converged';
      const LOAD_ROOT_CAUSE_CLASS = 'load';
      const LOAD_DOMINANT_REASON = 'nodeAdmissionBlocked';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const CONVERGENCE_TIMEOUT_ERROR = 'convergence timeout';
      const CLOSURE_WITNESS_STATE_PENDING = 'closure_pending';
      const SCENARIO_NAME = 'node-join-under-load';
      const PUBLICATION_EPOCH = 6;
      const SNAPSHOT_SCHEMA_VERSION = 1;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_COUNT = 0;
      const READY_NODE_COUNT = 3;
      const PRIORITY_RECOVERY_STALLED_COUNT = 1;
      const FAILURE_ACTION_MATCH = /Priority recovery progress is stalled/;
      const OPERATOR_RECOMMENDATION_MATCH = /operation workflow owner/;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE_ID;
      const PRIORITY_RECOVERY_PROGRESS_CLASS_SIGNAL =
        'priorityRecoveryProgressClass=' +
        PRIORITY_RECOVERY_PROGRESS_CLASS_ID;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const writer = new ReportWriter(PRIORITY_RECOVERY_STALLED_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: LOAD_ROOT_CAUSE_CLASS,
              dominantReason: LOAD_DOMINANT_REASON,
              reasonCounts: {
                [LOAD_DOMINANT_REASON]: PRIORITY_RECOVERY_STALLED_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: true,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [
                  PRIORITY_RECOVERY_REASON_CODE,
                ],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: READY_NODE_COUNT,
                  readyEligibleNodeCount: READY_NODE_COUNT,
                  totalPriorityPartitionCount:
                    PRIORITY_RECOVERY_STALLED_COUNT,
                  blockedPartitionCount: EMPTY_COUNT,
                  largestSpreadGap: EMPTY_COUNT,
                  totalSpreadGap: EMPTY_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS_ID,
                ],
                priorityRecoveryProgressClassCount:
                  PRIORITY_RECOVERY_STALLED_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                ],
                priorityRecoverySemanticStateCount:
                  PRIORITY_RECOVERY_STALLED_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount:
                  PRIORITY_RECOVERY_STALLED_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount:
                  PRIORITY_RECOVERY_STALLED_COUNT,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  completionState: PRIORITY_RECOVERY_COMPLETION_STATE,
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE,
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                }],
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: SNAPSHOT_SCHEMA_VERSION,
                publicationEpoch: PUBLICATION_EPOCH,
                closureWitness: {
                  publicationEpoch: PUBLICATION_EPOCH,
                  state: CLOSURE_WITNESS_STATE_PENDING,
                  prioritySpreadPending: true,
                  summarySpreadPending: false,
                  blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                  unresolvedSemanticStateIds: [
                    PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  ],
                },
                partitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE_ID]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                snapshots: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  blockerReasons: [PRIORITY_RECOVERY_PROGRESS_CLASS_ID],
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(PRIORITY_RECOVERY_STALLED_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: PRIORITY_RECOVERY_STALLED_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        LOAD_ROOT_CAUSE_CLASS,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PROGRESS_CLASS_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.match(
        scenarioBundle.summary.failureAction,
        FAILURE_ACTION_MATCH,
      );
      assert.match(
        scenarioBundle.summary.operatorRecommendation,
        OPERATOR_RECOMMENDATION_MATCH,
      );
    },
  );

  it(
    'classifies post-restart active gate owner evidence separately from publication convergence',
    async () => {
      const POST_RESTART_ACTIVE_GATE_REPORT_PATH = join(
        tempDir,
        'post-restart-active-gate-owner-evidence-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const FAILURE_ERROR = 'Not all nodes reached ACTIVE state within 120000ms';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const PRIORITY_RECOVERY_REASON_CODE = 'priority_partitions_not_spread';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        'priority_spread_pending';
      const STARTUP_READINESS_MODE = 'startup';
      const SNAPSHOT_REACHABILITY_TIMEOUT =
        'snapshot_reachability_timeout';
      const SNAPSHOT_REACHABILITY_SOURCE =
        'selectedSnapshotReachabilityError';
      const TERMINAL_RECOVERABILITY = 'terminal';
      const SNAPSHOT_REACHABILITY_ERROR =
        'Control snapshot reachability probe timed out for seed-1';
      const PRIORITY_RECOVERY_SEMANTIC_STATE = 'recovering_in_flight';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID = 'operation-recovering-in-flight';
      const PRIORITY_RECOVERY_COMPLETION_STATE = 'blocked';
      const PRIORITY_RECOVERY_WORKFLOW_STATE = 'in_flight';
      const PUBLICATION_EPOCH = 5;
      const SNAPSHOT_SCHEMA_VERSION = 1;
      const SCENARIO_DURATION_MS = 100;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 5;
      const READY_DISTINCT_NODE_COUNT = 1;
      const REQUIRED_DISTINCT_NODE_COUNT = 3;
      const SPREAD_GAP = 2;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const writer = new ReportWriter(POST_RESTART_ACTIVE_GATE_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: FAILURE_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PRIORITY_RECOVERY_REASON_CODE,
              reasonCounts: {
                [PRIORITY_RECOVERY_REASON_CODE]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: true,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                priorityRecoveryReasonCodes: [
                  PRIORITY_RECOVERY_REASON_CODE,
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount: SINGLE_COUNT,
                  blockedPartitionCount: SINGLE_COUNT,
                  largestSpreadGap: SPREAD_GAP,
                  totalSpreadGap: SPREAD_GAP,
                  missingPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                  blockedPartitions: [{
                    partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                    spreadGap: SPREAD_GAP,
                    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                    readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                  }],
                },
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE,
                ],
                priorityRecoverySemanticStateCount: SINGLE_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: SINGLE_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: SINGLE_COUNT,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE,
                  completionState: PRIORITY_RECOVERY_COMPLETION_STATE,
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE,
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                }],
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: false,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: EMPTY_COUNT,
                  partitionIdsBySemanticState: {
                    [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                      PRIORITY_RECOVERY_PARTITION_ID,
                    ],
                  },
                  unresolvedSemanticStateIds: [
                    PRIORITY_RECOVERY_SEMANTIC_STATE,
                  ],
                  unresolvedSemanticStateCount: SINGLE_COUNT,
                  blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                  blockedPartitionCount: SINGLE_COUNT,
                },
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
              activeGateNoProgress: {
                mode: STARTUP_READINESS_MODE,
                attemptsSinceProgress: SINGLE_COUNT,
                stalled: false,
                currentProgress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: EMPTY_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                  snapshotCoverageComplete: true,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  pendingAckCount: EMPTY_COUNT,
                  missingPublishedCount: EMPTY_COUNT,
                },
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: SNAPSHOT_SCHEMA_VERSION,
                publicationEpoch: PUBLICATION_EPOCH,
                partitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                snapshots: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE,
                  blockerReasons: [],
                  operationId: PRIORITY_RECOVERY_OPERATION_ID,
                  coordinator: {
                    operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                    operationCount: SINGLE_COUNT,
                  },
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(
            POST_RESTART_ACTIVE_GATE_REPORT_PATH,
            UTF8_ENCODING,
          ),
        ).scenarios,
        reportOutputPath: POST_RESTART_ACTIVE_GATE_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
    },
  );

  it(
    'prefers readiness owner priority recovery blockers over load-pressure fallback',
    async () => {
      const READINESS_OWNER_BLOCKER_REPORT_PATH = join(
        tempDir,
        'readiness-owner-priority-recovery-blocker-report.json',
      );
      const SCENARIO_NAME = 'node-join-under-load';
      const READINESS_NODE_ID = 'seed-1';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID =
        'control_plane_publications-p1';
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID = 'operation_stalled';
      const NON_DOMINANT_PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        'spread_satisfied_in_flight';
      const PRIORITY_RECOVERY_PROGRESS_CLASS_ID =
        'operation_created_but_no_step_transitions';
      const PRIORITY_RECOVERY_REASON_CODE =
        'priority_partitions_not_spread';
      const LOAD_ROOT_CAUSE_CLASS = 'load';
      const LOAD_DOMINANT_REASON = 'nodeAdmissionBlocked';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE = 'priority_spread_pending';
      const CONVERGENCE_TIMEOUT_ERROR = 'convergence timeout';
      const PUBLICATION_EPOCH = 6;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_COUNT = 0;
      const READY_NODE_COUNT = 3;
      const PRIORITY_PARTITION_COUNT = 1;
      const SPREAD_GAP = 1;
      const PRIORITY_RECOVERY_READINESS_NODE_SIGNAL =
        'priorityRecoveryReadinessNode=' + READINESS_NODE_ID;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' +
        NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE_ID;
      const PRIORITY_RECOVERY_REASON_SIGNAL =
        'priorityRecoveryReason=' +
        CONTROL_PLANE_READINESS_REASON
          .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING;
      const writer = new ReportWriter(READINESS_OWNER_BLOCKER_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: LOAD_ROOT_CAUSE_CLASS,
              dominantReason: LOAD_DOMINANT_REASON,
              reasonCounts: {
                [LOAD_DOMINANT_REASON]: PRIORITY_PARTITION_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE,
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: READY_NODE_COUNT,
                  readyEligibleNodeCount: READY_NODE_COUNT,
                  totalPriorityPartitionCount: PRIORITY_PARTITION_COUNT,
                  blockedPartitionCount: EMPTY_COUNT,
                  largestSpreadGap: EMPTY_COUNT,
                  totalSpreadGap: EMPTY_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateIds: [],
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionIds: [],
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
              },
              readinessByNodeId: {
                [READINESS_NODE_ID]: {
                  reasons: [{
                    code: CONTROL_PLANE_READINESS_REASON
                      .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
                    details: {
                      active: true,
                      reasonCodes: [PRIORITY_RECOVERY_REASON_CODE],
                      publicationGateReasonCodes: [
                        PRIORITY_RECOVERY_REASON_CODE,
                      ],
                      priorityRecoveryObservation: {
                        priorityRecoveryProgressClassIds: [
                          PRIORITY_RECOVERY_PROGRESS_CLASS_ID,
                        ],
                        priorityRecoverySemanticStateIds: [
                          PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                        ],
                        priorityRecoveryBlockedPartitionIds: [
                          NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                          PRIORITY_RECOVERY_PARTITION_ID,
                        ],
                        priorityRecoveryUnresolvedPartitionIds: [
                          PRIORITY_RECOVERY_PARTITION_ID,
                        ],
                        priorityRecoveryBlockerPartitionIdsByReason: {
                          [PRIORITY_RECOVERY_PROGRESS_CLASS_ID]: [
                            PRIORITY_RECOVERY_PARTITION_ID,
                          ],
                        },
                        priorityRecoveryPartitionIdsBySemanticState: {
                          [PRIORITY_RECOVERY_SEMANTIC_STATE_ID]: [
                            PRIORITY_RECOVERY_PARTITION_ID,
                          ],
                          [NON_DOMINANT_PRIORITY_RECOVERY_SEMANTIC_STATE_ID]: [
                            NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                          ],
                        },
                        priorityRecoveryPartitionWitnesses: [{
                          partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                          semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                          progressClassIds: [
                            PRIORITY_RECOVERY_PROGRESS_CLASS_ID,
                          ],
                        }],
                      },
                      publicationRecoveryGate: {
                        reasonCodes: [PRIORITY_RECOVERY_REASON_CODE],
                        priorityRecoveryClosureWitness: {
                          prioritySpreadPending: true,
                          blockedPartitionIds: [
                            PRIORITY_RECOVERY_PARTITION_ID,
                          ],
                          unresolvedSemanticStateIds: [
                            PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                          ],
                        },
                        priorityPartitionSummary: {
                          satisfied: false,
                          blockedPartitions: [{
                            partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                            spreadGap: SPREAD_GAP,
                          }],
                        },
                      },
                    },
                  }],
                },
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(
            READINESS_OWNER_BLOCKER_REPORT_PATH,
            UTF8_ENCODING,
          ),
        ).scenarios,
        reportOutputPath: READINESS_OWNER_BLOCKER_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        LOAD_ROOT_CAUSE_CLASS,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_READINESS_NODE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.equal(
        failureClassification.signals.includes(
          NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
        false,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_REASON_SIGNAL,
        ),
      );
    },
  );

  it(
    'classifies restarted-node recovery readiness timeout as restart recovery',
    async () => {
      const RESTART_RECOVERY_REPORT_PATH = join(
        tempDir,
        'restart-recovery-priority-spread-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const RESTART_RECOVERY_ERROR =
        'Restarted node did not become recovery-ready within 120000ms';
      const STALE_STARTUP_REASON = 'snapshot_reachability_timeout';
      const ROOT_CAUSE_CLASS_STARTUP = 'startup';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const FAILURE_BARRIER_PHASE = 'restart_recovery';
      const FAILURE_BARRIER_REASON = 'priority_spread_pending';
      const FAILURE_BARRIER_SIGNAL =
        'failureBarrier=' + FAILURE_BARRIER_PHASE;
      const FAILURE_BARRIER_REASON_SIGNAL =
        'failureBarrierReason=' + FAILURE_BARRIER_REASON;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        'priority_spread_pending';
      const PRIORITY_RECOVERY_REASON_CODE =
        'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID =
        'control_plane_publications-p1';
      const PRIORITY_RECOVERY_SEMANTIC_STATE = 'needs_operation';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        'eligible_but_no_operation_created';
      const PRIORITY_RECOVERY_NEXT_ACTION = 'create_recovery_operation';
      const PRIORITY_RECOVERY_BLOCKING_BOUNDARY = 'operation_scheduling';
      const PRIORITY_RECOVERY_WAIT_MODE = 'stalled';
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' +
        NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID;
      const PRIORITY_RECOVERY_UNRESOLVED_PARTITION_SIGNAL =
        'priorityRecoveryUnresolvedPartition=' +
        PRIORITY_RECOVERY_PARTITION_ID;
      const NON_DOMINANT_PRIORITY_RECOVERY_UNRESOLVED_PARTITION_SIGNAL =
        'priorityRecoveryUnresolvedPartition=' +
        NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID;
      const PRIORITY_SPREAD_PENDING_SIGNAL = 'prioritySpreadPending=true';
      const EXPECTED_NODE_COUNT = 5;
      const READY_DISTINCT_NODE_COUNT = 2;
      const REQUIRED_DISTINCT_NODE_COUNT = 3;
      const PUBLICATION_EPOCH = 5;
      const SCENARIO_DURATION_MS = 100;
      const OPEN_STABILITY_GATE_STATUS = 'open';
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT = 2;
      const SPREAD_GAP = 1;
      const writer = new ReportWriter(RESTART_RECOVERY_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: RESTART_RECOVERY_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: STALE_STARTUP_REASON,
              reasonCounts: {
                [STALE_STARTUP_REASON]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                priorityRecoveryReasonCodes: [
                  PRIORITY_RECOVERY_REASON_CODE,
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount:
                    PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                  blockedPartitionCount:
                    PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                  largestSpreadGap: SPREAD_GAP,
                  totalSpreadGap:
                    SPREAD_GAP * PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                  missingPartitionIds: [
                    NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                  blockedPartitions: [
                    {
                      partitionId:
                        NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                      spreadGap: SPREAD_GAP,
                      requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                      readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                    },
                    {
                      partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                      spreadGap: SPREAD_GAP,
                      requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                      readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                    },
                  ],
                },
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: SINGLE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE,
                ],
                priorityRecoverySemanticStateCount: SINGLE_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount:
                  PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount:
                  PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                priorityRecoveryBlockerPartitionIdsByReason: {
                  [PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE,
                  progressClassId: PRIORITY_RECOVERY_PROGRESS_CLASS,
                  nextRequiredAction: PRIORITY_RECOVERY_NEXT_ACTION,
                  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE,
                }],
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: EXPECTED_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: false,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  unresolvedClassCount: SINGLE_COUNT,
                  partitionIdsByClass: {
                    [PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                      PRIORITY_RECOVERY_PARTITION_ID,
                    ],
                  },
                  unresolvedSemanticStateIds: [
                    PRIORITY_RECOVERY_SEMANTIC_STATE,
                  ],
                  unresolvedSemanticStateCount: SINGLE_COUNT,
                  partitionIdsBySemanticState: {
                    [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                      PRIORITY_RECOVERY_PARTITION_ID,
                    ],
                  },
                  blockedPartitionIds: [
                    NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                  blockedPartitionCount:
                    PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                },
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RESTART_RECOVERY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RESTART_RECOVERY_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.dominantReason,
        FAILURE_BARRIER_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          FAILURE_BARRIER_REASON_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_UNRESOLVED_PARTITION_SIGNAL,
        ),
      );
      assert.equal(
        failureClassification.signals.includes(
          NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
        false,
      );
      assert.equal(
        failureClassification.signals.includes(
          NON_DOMINANT_PRIORITY_RECOVERY_UNRESOLVED_PARTITION_SIGNAL,
        ),
        false,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_SPREAD_PENDING_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier.phase,
        FAILURE_BARRIER_PHASE,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.restart_recovery.status,
        OPEN_STABILITY_GATE_STATUS,
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
    },
  );

  it(
    'ignores stale restart-recovery priority spread state after closure',
    async () => {
      const RESTART_RECOVERY_REPORT_PATH = join(
        tempDir,
        'restart-recovery-stale-priority-spread-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const RESTART_RECOVERY_ERROR =
        'Restarted node did not become recovery-ready within 120000ms';
      const STALE_STARTUP_REASON = 'snapshot_reachability_timeout';
      const ROOT_CAUSE_CLASS_STARTUP = 'startup';
      const FAILURE_BARRIER_PHASE = 'restart_recovery';
      const FAILURE_BARRIER_REASON = 'startup_readiness_blocked';
      const STALE_PRIORITY_SPREAD_REASON = 'priority_spread_pending';
      const FAILURE_BARRIER_SIGNAL =
        'failureBarrier=' + FAILURE_BARRIER_PHASE;
      const FAILURE_BARRIER_REASON_SIGNAL =
        'failureBarrierReason=' + FAILURE_BARRIER_REASON;
      const STALE_PRIORITY_SPREAD_SIGNAL =
        'failureBarrierReason=' + STALE_PRIORITY_SPREAD_REASON;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        STALE_PRIORITY_SPREAD_REASON;
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(RESTART_RECOVERY_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: RESTART_RECOVERY_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: STALE_STARTUP_REASON,
              reasonCounts: {
                [STALE_STARTUP_REASON]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: EMPTY_COUNT,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount: EMPTY_COUNT,
                  blockedPartitionCount: EMPTY_COUNT,
                  largestSpreadGap: EMPTY_COUNT,
                  totalSpreadGap: EMPTY_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateIds: [],
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionIds: [],
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: EXPECTED_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: true,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RESTART_RECOVERY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RESTART_RECOVERY_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_STARTUP,
      );
      assert.equal(
        failureClassification.dominantReason,
        FAILURE_BARRIER_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          FAILURE_BARRIER_REASON_SIGNAL,
        ),
      );
      assert.equal(
        failureClassification.signals.includes(
          STALE_PRIORITY_SPREAD_SIGNAL,
        ),
        false,
      );
    },
  );

  it(
    'keeps publication protocol open while stale priority-spread state has ACK debt',
    () => {
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        'priority_spread_pending';
      const RECOVERY_PROTOCOL_STATE_PUBLICATION_PENDING =
        'publication_pending';
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const ACK_DEBT_COUNT = 1;
      const EMPTY_COUNT = 0;
      const ACK_NODE_ID = 'node-ack-pending';

      const publicationConvergence = buildPublicationConvergenceSummary({
        hasExplicitPriorityRecoveryObservation: true,
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [ACK_NODE_ID],
          pendingAckCount: ACK_DEBT_COUNT,
          blockedNodeIds: [],
          blockedNodeCount: EMPTY_COUNT,
          publicationPending: true,
          prioritySpreadPending: false,
          recoveryProtocolState: RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
          priorityRecoveryReasonCodes: [],
          priorityPartitionSummary: {
            satisfied: true,
            requiredDistinctNodeCount: EMPTY_COUNT,
            readyEligibleNodeCount: EXPECTED_NODE_COUNT,
            totalPriorityPartitionCount: EMPTY_COUNT,
            blockedPartitionCount: EMPTY_COUNT,
            largestSpreadGap: EMPTY_COUNT,
            totalSpreadGap: EMPTY_COUNT,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
          priorityRecoveryProgressClassIds: [],
          priorityRecoveryProgressClassCount: EMPTY_COUNT,
          priorityRecoverySemanticStateIds: [],
          priorityRecoverySemanticStateCount: EMPTY_COUNT,
          priorityRecoveryBlockedPartitionIds: [],
          priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
          priorityRecoveryUnresolvedPartitionIds: [],
          priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
        },
      });

      assert.equal(publicationConvergence.pendingAckCount, ACK_DEBT_COUNT);
      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(publicationConvergence.prioritySpreadPending, false);
      assert.equal(
        publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_STATE_PUBLICATION_PENDING,
      );
    },
  );

  it(
    'classifies restart recovery admin refusal as the terminal owner state',
    async () => {
      const RESTART_RECOVERY_REPORT_PATH = join(
        tempDir,
        'restart-recovery-admin-refused-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const RESTARTED_NODE_ID = '11601fe0-72d6-5853-8590-ec2881853e72';
      const FAILURE_BARRIER_PHASE = 'restart_recovery';
      const FAILURE_BARRIER_SIGNAL =
        'failureBarrier=' + FAILURE_BARRIER_PHASE;
      const ADMIN_REFUSED_SIGNAL =
        'failureBarrierReason=' +
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED;
      const STALE_PRIORITY_SPREAD_SIGNAL =
        'failureBarrierReason=priority_spread_pending';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        'priority_spread_pending';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const EMPTY_COUNT = 0;
      const SCENARIO_DURATION_MS = 100;
      const RESTART_RECOVERY_ERROR =
        'Restarted node did not become recovery-ready within 120000ms ' +
        'for node ' +
        RESTARTED_NODE_ID +
        ' (reachable=true, ready=false, adminReady=false, ' +
        'controlPlaneRecoveryReady=false, ' +
        'publishedControlPlaneEpoch=unknown, ' +
        'expectedPublicationEpoch=none, readinessPhase=INIT, ' +
        'readinessStage=traffic_ready, readinessStageRank=5, ' +
        'readinessReasons=none, recoveryStage=unknown, ' +
        'bootstrapJoinProjectionBlocker=none, ' +
        'bootstrapJoinProjectionRule=init_priority_bypass, ' +
        'reachableBy=bootstrap_health, lastError=Admin API query failed ' +
        'for node ' +
        RESTARTED_NODE_ID +
        ' on lane probe: connect ECONNREFUSED 172.19.0.4:8081)';
      const writer = new ReportWriter(RESTART_RECOVERY_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: RESTART_RECOVERY_ERROR,
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount: EXPECTED_NODE_COUNT,
                  blockedPartitionCount: EMPTY_COUNT,
                  largestSpreadGap: EMPTY_COUNT,
                  totalSpreadGap: EMPTY_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateIds: [],
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionIds: [],
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RESTART_RECOVERY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RESTART_RECOVERY_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;
      const restartRecoveryGate =
        scenarioBundle.summary.stabilityGates.restart_recovery;

      assert.equal(
        scenarioBundle.summary.dominantReason,
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(ADMIN_REFUSED_SIGNAL),
      );
      assert.equal(
        failureClassification.signals.includes(STALE_PRIORITY_SPREAD_SIGNAL),
        false,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier
          .terminalRecoveryReadiness.ownerState,
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier
          .terminalRecoveryReadiness.nodeId,
        RESTARTED_NODE_ID,
      );
      assert.equal(restartRecoveryGate.status, 'open');
      assert.equal(
        restartRecoveryGate.blockers.includes(
          STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
        ),
        true,
      );
      assert.equal(
        restartRecoveryGate.evidence.terminalRecoveryReadiness.ownerState,
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_STATE_STEADY,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.prioritySpreadPending,
        false,
      );
    },
  );

  it(
    'uses closed best-progress publication evidence when the terminal snapshot probe is degraded',
    () => {
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 4;
      const INACTIVE_NODE_COUNT = 1;
      const ZERO_COUNT = 0;
      const ONE_COUNT = 1;
      const PUBLICATION_EPOCH = 5;
      const STALE_ACK_NODE_ID = 'joiner-ack-pending';
      const SNAPSHOT_NODE_ID = 'snapshot-node';
      const SNAPSHOT_TIMEOUT_ERROR =
        'Admin API query timed out for node snapshot-node';
      const BEST_PROGRESS_NODE_ID = 'best-progress-node';
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
        'priority_partitions_not_spread';
      const REASON_PUBLICATION_EPOCH_PENDING = 'publication_epoch_pending';
      const PROGRESS_CLASS_OPERATION_STALLED =
        'operation_created_but_no_step_transitions';
      const SEMANTIC_STATE_OPERATION_STALLED = 'operation_stalled';
      const BLOCKED_PARTITION_ID = 'sql_transaction_participants-p1';
      const STALE_PROGRESS_BLOCKER =
        'priority_recovery_progress_class=' + PROGRESS_CLASS_OPERATION_STALLED;
      const ACTIVE_GATE_BLOCKER_INACTIVE = 'inactive_nodes=1';
      const ACTIVE_GATE_BLOCKER_SNAPSHOT_COVERAGE = 'snapshot_coverage=0/5';
      const ACTIVE_GATE_BLOCKER_SNAPSHOT_ERROR = 'snapshot_error';
      const CLOSED_REASON_COUNTS = {};
      const stalePublicationConvergence = {
        publicationEpoch: PUBLICATION_EPOCH,
        publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
        pendingAckNodeIds: [STALE_ACK_NODE_ID],
        pendingAckCount: ONE_COUNT,
        recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
        priorityRecoveryReasonCodes: [
          REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
          REASON_PUBLICATION_EPOCH_PENDING,
        ],
        publicationPending: true,
        prioritySpreadPending: true,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount: ONE_COUNT,
          blockedPartitions: [{
            partitionId: BLOCKED_PARTITION_ID,
            blockerReasonCodes: [PROGRESS_CLASS_OPERATION_STALLED],
          }],
        },
      };
      const stalePriorityRecoveryObservation = {
        ...stalePublicationConvergence,
        priorityRecoveryProgressClassIds: [PROGRESS_CLASS_OPERATION_STALLED],
        priorityRecoveryProgressClassCount: ONE_COUNT,
        priorityRecoverySemanticStateIds: [SEMANTIC_STATE_OPERATION_STALLED],
        priorityRecoverySemanticStateCount: ONE_COUNT,
        priorityRecoveryBlockedPartitionIds: [BLOCKED_PARTITION_ID],
        priorityRecoveryBlockedPartitionCount: ONE_COUNT,
      };
      const staleDecisionSnapshots = {
        publicationEpoch: PUBLICATION_EPOCH,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount: ONE_COUNT,
        },
        snapshots: [{
          partitionId: BLOCKED_PARTITION_ID,
          semanticState: SEMANTIC_STATE_OPERATION_STALLED,
          blockerReasons: [PROGRESS_CLASS_OPERATION_STALLED],
        }],
      };
      const activeGate = {
        mode: ACTIVE_GATE_MODE_STARTUP,
        state: ACTIVE_GATE_STATE_TIMED_OUT,
        progress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          activeNodeCount: ACTIVE_NODE_COUNT,
          inactiveNodeCount: INACTIVE_NODE_COUNT,
          snapshotCoverageNodeCount: ZERO_COUNT,
          snapshotCoverageComplete: false,
          selectedSnapshotNodeId: SNAPSHOT_NODE_ID,
          selectedSnapshotError: SNAPSHOT_TIMEOUT_ERROR,
          pendingAckCount: ZERO_COUNT,
          missingPublishedCount: ZERO_COUNT,
          gateReasons: [],
          blockers: [
            ACTIVE_GATE_BLOCKER_INACTIVE,
            ACTIVE_GATE_BLOCKER_SNAPSHOT_COVERAGE,
            ACTIVE_GATE_BLOCKER_SNAPSHOT_ERROR,
          ],
        },
        bestProgress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          activeNodeCount: ACTIVE_NODE_COUNT,
          inactiveNodeCount: INACTIVE_NODE_COUNT,
          snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
          snapshotCoverageComplete: true,
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
          selectedSnapshotNodeId: BEST_PROGRESS_NODE_ID,
          pendingAckCount: ZERO_COUNT,
          missingPublishedCount: ZERO_COUNT,
          gateReasons: [],
          prioritySpreadSatisfied: true,
          blockers: [ACTIVE_GATE_BLOCKER_INACTIVE],
        },
      };
      const mergedControlPlane = mergeControlPlaneDiagnostics(
        {
          publicationConvergence: stalePublicationConvergence,
          priorityRecoveryObservation: stalePriorityRecoveryObservation,
          priorityRecoveryDecisionSnapshots: staleDecisionSnapshots,
          activeGate,
        },
        {
          publicationConvergence: stalePublicationConvergence,
          priorityRecoveryObservation: stalePriorityRecoveryObservation,
          priorityRecoveryDecisionSnapshots: staleDecisionSnapshots,
        },
      );
      const publicationConvergence =
        buildPublicationConvergenceSummary(mergedControlPlane);
      const reasonCounts =
        FAILURE_BUNDLE_SEGMENT_1.deriveReasonCountsFromPublicationConvergence(
          mergedControlPlane,
        );

      assert.equal(
        publicationConvergence.publicationStatus,
        PUBLICATION_STATUS_PUBLISHED,
      );
      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.deepEqual(publicationConvergence.priorityRecoveryReasonCodes, []);
      assert.equal(publicationConvergence.publicationPending, false);
      assert.equal(publicationConvergence.prioritySpreadPending, false);
      assert.equal(
        publicationConvergence.priorityRecoveryProgressClassCount,
        ZERO_COUNT,
      );
      assert.equal(publicationConvergence.closureRecordId, null);
      assert.equal(publicationConvergence.closureWitnessClass, null);
      assert.equal(
        publicationConvergence.activeGateProgress.blockers.includes(
          STALE_PROGRESS_BLOCKER,
        ),
        false,
      );
      assert.deepEqual(reasonCounts, CLOSED_REASON_COUNTS);
    },
  );

  it(
    'preserves publication gate reasons and projection diagnostics across failure-bundle and triage outputs',
    async () => {
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-gate-reason-codes.json',
      );
      const writer = new ReportWriter(priorityRecoveryReportPath);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 21,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                projectionDiagnostics: {
                  readinessDecisionMode: 'explicit_dimensions',
                  readinessDecisionDimensions: ['control_plane_writable'],
                  recoveryEligibleProjectionEnabled: true,
                  recoveryEligibleIncludedNodeIds: ['joiner-1'],
                  readinessExcludedNodeIds: [],
                  clusterMemberUnhealthyExcludedNodeIds: ['seed-2'],
                },
              },
              publicationConvergenceGate: {
                publicationEpoch: 21,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              activeGateBestProgress: {
                closureRecordId: 'CL-PR-021',
                closureWitnessClass:
                  'publication_converged_priority_spread_pending',
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 21,
                snapshots: [{
                  partitionId: 'replica_operations-p1',
                  semanticState: 'operation_stalled',
                  blockerReasons: [
                    'operation_created_but_no_step_transitions',
                  ],
                  planner: {
                    ready: false,
                    spreadGap: 1,
                  },
                  admission: {
                    decisionDimension: 'controlPlaneRecoveryEligible',
                  },
                }],
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(priorityRecoveryReportPath, UTF8_ENCODING),
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: priorityRecoveryReportPath,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );
      const scenarioMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.markdownPath),
        UTF8_ENCODING,
      );
      const triageMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.triageMarkdownPath),
        UTF8_ENCODING,
      );

      assert.deepEqual(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons,
        ['priority_partitions_not_spread'],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.pendingAckNodeIds,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        'CL-PR-021',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        'publication_converged_priority_spread_pending',
      );
      assert.equal(
        triageSummary.publicationConvergence.projectionDiagnostics
          .readinessDecisionMode,
        'explicit_dimensions',
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.publicationConvergenceGateReasons,
        ['priority_partitions_not_spread'],
      );
      assert.match(
        scenarioMarkdown,
        /Pending Ack Nodes: none/,
      );
      assert.match(
        scenarioMarkdown,
        /Publication Gate Reasons: priority_partitions_not_spread/,
      );
      assert.match(
        scenarioMarkdown,
        /Closure Witness Class: publication_converged_priority_spread_pending/,
      );
      assert.match(
        scenarioMarkdown,
        /Projection Diagnostics: mode=explicit_dimensions, dimensions=control_plane_writable, recoveryEligibleProjectionEnabled=true, recoveryEligibleIncluded=joiner-1, readinessExcluded=none, clusterMemberUnhealthyExcluded=seed-2/,
      );
      assert.match(
        triageMarkdown,
        /## Publication Convergence/,
      );
      assert.match(
        triageMarkdown,
        /Publication Gate Reasons: priority_partitions_not_spread/,
      );
      assert.match(
        triageMarkdown,
        /Blocked Partitions: replica_operations-p1/,
      );
      assert.match(
        triageMarkdown,
        /Closure Record Id: CL-PR-021/,
      );
    },
  );

  it(
    'does not let non-priority progress witnesses override generic node-admission wait summaries',
    async () => {
      const PRIORITY_RECOVERY_PROGRESS_REPORT_PATH = join(
        tempDir,
        'priority-recovery-progress-handoff-report.json',
      );
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const LOAD_WAIT_DOMINANT_REASON = 'nodeAdmissionBlocked';
      const PRIORITY_RECOVERY_CURRENT_OWNER = 'rebalancer_leader';
      const PRIORITY_RECOVERY_BLOCKING_BOUNDARY = 'rebalancer_handoff';
      const PRIORITY_RECOVERY_WAIT_MODE = 'stalled';
      const PRIORITY_RECOVERY_NEXT_ACTION = 'schedule_followup_rebalance';
      const PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE = 'target_creation';
      const PRIORITY_RECOVERY_STEP_AGE_MS = 62050;
      const PRIORITY_RECOVERY_STEP_TIMEOUT_MS = 60000;
      const LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
      const writer = new ReportWriter(PRIORITY_RECOVERY_PROGRESS_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        loadMetrics: {
          total: 100,
          success: 85,
          failed: 0,
          errors: 0,
          waitReasons: {
            [LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED]: 55,
          },
        },
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityRecoveryBlockedPartitionIds: [
                  'control_plane_publications-p1',
                  'sql_transaction_participants-p1',
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: 3,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: 1,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: 'operation_stalled',
                  progressContractState: 'blocked',
                  currentOwner: PRIORITY_RECOVERY_CURRENT_OWNER,
                  nextRequiredAction: PRIORITY_RECOVERY_NEXT_ACTION,
                  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE,
                  workflowProgressPhaseId:
                    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
                  stepAgeMs: PRIORITY_RECOVERY_STEP_AGE_MS,
                  stepTimeoutMs: PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
                  retryAfterMs: 5000,
                  lastProgressAtMs: 1234,
                  progressEvidenceSourceIds: ['op-55', 'handoff-1'],
                }],
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(PRIORITY_RECOVERY_PROGRESS_REPORT_PATH, UTF8_ENCODING),
      );

      assert.equal(
        report.scenarios[0].priorityRecoveryProgressSummary.dominantWitness
          .blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
      );
      assert.equal(
        report.scenarios[0].priorityRecoveryProgressSummary.dominantWitness
          .waitMode,
        PRIORITY_RECOVERY_WAIT_MODE,
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: PRIORITY_RECOVERY_PROGRESS_REPORT_PATH,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.triageMarkdownPath),
        UTF8_ENCODING,
      );

      assert.equal(
        scenarioBundle.summary.dominantReason,
        LOAD_WAIT_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        LOAD_WAIT_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary ?
          scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary :
          null,
        null,
      );
      assert.doesNotMatch(
        triageMarkdown,
        /partition=sql_write_operations-p1/,
      );
    },
  );

  it(
    'adds recovery witness guidance to load-pressure classification when admission is blocked',
    async () => {
      const LOAD_PRESSURE_REPORT_PATH = join(
        tempDir,
        'load-pressure-recovery-witness-report.json',
      );
      const SCENARIO_NAME = 'node-join-under-load';
      const LOAD_ROOT_CAUSE_CLASS = 'load';
      const LOAD_DOMINANT_REASON = 'nodeAdmissionBlocked';
      const RETRYABLE_PRESSURE_REASON = 'retryableControlPlanePressure';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID = 'op-load-pressure-recovery';
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        'spread_satisfied_in_flight';
      const PRIORITY_RECOVERY_WORKFLOW_STEP = 'STOPPING';
      const PRIORITY_RECOVERY_STATUS = 'removing';
      const PRIORITY_RECOVERY_WORKFLOW_STATE = 'remove_phase';
      const PRIORITY_RECOVERY_COMPLETION_STATE =
        'spread_satisfied_in_flight';
      const PRIORITY_RECOVERY_VISIBILITY_STATE = 'cache_visible';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE = 'priority_spread_pending';
      const CONVERGENCE_TIMEOUT_ERROR = 'convergence timeout';
      const PUBLICATION_EPOCH = 6;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_COUNT = 0;
      const READY_NODE_COUNT = 3;
      const PRIORITY_RECOVERY_WITNESS_COUNT = 1;
      const NODE_ADMISSION_BLOCKED_COUNT = 180;
      const RETRYABLE_PRESSURE_COUNT = 38;
      const LOAD_ACTION_MATCH = /Load traffic is admission-blocked/;
      const LOAD_RECOMMENDATION_MATCH = /priority recovery operation/;
      const DOMINANT_REASON_SIGNAL =
        'dominantReason=' + LOAD_DOMINANT_REASON;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE_ID;
      const PRIORITY_RECOVERY_LATEST_STEP_SIGNAL =
        'priorityRecoveryLatestStep=' + PRIORITY_RECOVERY_WORKFLOW_STEP;
      const PRIORITY_RECOVERY_LATEST_STATUS_SIGNAL =
        'priorityRecoveryLatestStatus=' + PRIORITY_RECOVERY_STATUS;
      const writer = new ReportWriter(LOAD_PRESSURE_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        loadMetrics: {
          total: EMPTY_COUNT,
          success: EMPTY_COUNT,
          failed: EMPTY_COUNT,
          errors: EMPTY_COUNT,
          attemptErrors: RETRYABLE_PRESSURE_COUNT,
          waitReasons: {
            [LOAD_DOMINANT_REASON]: NODE_ADMISSION_BLOCKED_COUNT,
            [RETRYABLE_PRESSURE_REASON]: RETRYABLE_PRESSURE_COUNT,
          },
        },
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: LOAD_ROOT_CAUSE_CLASS,
              dominantReason: LOAD_DOMINANT_REASON,
              reasonCounts: {
                [LOAD_DOMINANT_REASON]: NODE_ADMISSION_BLOCKED_COUNT,
                [RETRYABLE_PRESSURE_REASON]: RETRYABLE_PRESSURE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE,
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: READY_NODE_COUNT,
                  readyEligibleNodeCount: READY_NODE_COUNT,
                  totalPriorityPartitionCount:
                    PRIORITY_RECOVERY_WITNESS_COUNT,
                  blockedPartitionCount: EMPTY_COUNT,
                  largestSpreadGap: EMPTY_COUNT,
                  totalSpreadGap: EMPTY_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateIds: [],
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionIds: [],
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  completionState: PRIORITY_RECOVERY_COMPLETION_STATE,
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE,
                  visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE,
                  latestOperationWorkflowStep:
                    PRIORITY_RECOVERY_WORKFLOW_STEP,
                  latestOperationStatus: PRIORITY_RECOVERY_STATUS,
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(LOAD_PRESSURE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: LOAD_PRESSURE_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_LOAD_PRESSURE,
      );
      assert.equal(
        failureClassification.dominantReason,
        LOAD_DOMINANT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(DOMINANT_REASON_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_LATEST_STEP_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_LATEST_STATUS_SIGNAL,
        ),
      );
      assert.match(
        scenarioBundle.summary.failureAction,
        LOAD_ACTION_MATCH,
      );
      assert.match(
        scenarioBundle.summary.operatorRecommendation,
        LOAD_RECOMMENDATION_MATCH,
      );
    },
  );

  it(
    'preserves priority-recovery operation ids from normalized decision operation objects',
    async () => {
      const OPERATION_EVIDENCE_REPORT_PATH = join(
        tempDir,
        'priority-recovery-operation-evidence-report.json',
      );
      const OPERATION_EVIDENCE_PARTITION_ID = 'control_plane_publications-p1';
      const OPERATION_EVIDENCE_OPERATION_ID =
        'op-priority-operation-evidence';
      const OPERATION_EVIDENCE_PROGRESS_NEXT_ACTION = 'wait';
      const OPERATION_EVIDENCE_WORKFLOW_PHASE = 'target_creation';
      const OPERATION_EVIDENCE_STEP_AGE_MS = 500;
      const OPERATION_EVIDENCE_STEP_TIMEOUT_MS = 30000;
      const writer = new ReportWriter(OPERATION_EVIDENCE_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryDecisionSnapshots: {
                capturedAt: 2000,
                publicationEpoch: 23,
                snapshots: [{
                  partitionId: OPERATION_EVIDENCE_PARTITION_ID,
                  semanticState: 'recovering_in_flight',
                  blockerReasons: [
                    'operation_created_but_no_step_transitions',
                  ],
                  planner: {
                    spreadGap: 1,
                  },
                  coordinator: {
                    operationCount: 1,
                    operation: {
                      operationId: OPERATION_EVIDENCE_OPERATION_ID,
                      workflowStep: 'CREATING',
                      status: 'creating',
                      updatedAtMs: 1500,
                    },
                  },
                  conditions: {
                    pressure: {
                      pressureState: 'none',
                    },
                  },
                  actuation: {
                    state:
                      PRIORITY_RECOVERY_ACTUATION_STATE
                        .DISPATCHED_WAITING_PROGRESS,
                    owner: 'operation_workflow_owner',
                  },
                  progress: {
                    contractState: 'pending',
                    nextAction: OPERATION_EVIDENCE_PROGRESS_NEXT_ACTION,
                    currentOwner: 'operation_workflow_owner',
                    nextRequiredAction: 'wait_for_operation_progress',
                    blockingBoundary: 'workflow_progress',
                    waitMode: 'event_driven',
                    workflowProgressPhaseId:
                      OPERATION_EVIDENCE_WORKFLOW_PHASE,
                    stepAgeMs: OPERATION_EVIDENCE_STEP_AGE_MS,
                    stepTimeoutMs: OPERATION_EVIDENCE_STEP_TIMEOUT_MS,
                    lastProgressAtMs: 1500,
                    evidenceSourceIds: ['operation_context'],
                  },
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(OPERATION_EVIDENCE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: OPERATION_EVIDENCE_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].operationIds,
        [OPERATION_EVIDENCE_OPERATION_ID],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.operationIds,
        [OPERATION_EVIDENCE_OPERATION_ID],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].progressContractState,
        'pending',
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].progressNextAction,
        OPERATION_EVIDENCE_PROGRESS_NEXT_ACTION,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].actuationState,
        PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].currentOwner,
        'operation_workflow_owner',
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].nextRequiredAction,
        'wait_for_operation_progress',
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].workflowProgressPhaseId,
        OPERATION_EVIDENCE_WORKFLOW_PHASE,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].stepAgeMs,
        OPERATION_EVIDENCE_STEP_AGE_MS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryProgressSummary.dominantWitness.currentOwner,
        'operation_workflow_owner',
      );
    },
  );

  it(
    'classifies publication-closed priority actuation as workflow progress',
    async () => {
      const reportPath = join(
        tempDir,
        PRIORITY_RECOVERY_ACTUATION_REPORT_FILENAME,
      );
      const publicationConvergence =
        buildPriorityRecoveryPublicationConvergenceFixture();
      const decisionSnapshot = buildPriorityRecoveryDecisionSnapshot(
        buildPriorityRecoveryActuationDecisionInput(),
      );
      const priorityRecoveryDecisionSnapshots = {
        capturedAt: PRIORITY_RECOVERY_DECISION_SET_EXPECTED.capturedAt,
        publicationEpoch:
          PRIORITY_RECOVERY_DECISION_SET_EXPECTED.publicationEpoch,
        snapshots: [decisionSnapshot],
        priorityPartitionSummary:
          publicationConvergence.priorityPartitionSummary,
        closureWitness: {
          ...PRIORITY_RECOVERY_DECISION_SET_EXPECTED.closureWitness,
        },
      };
      const priorityRecoveryObservation =
        buildPriorityRecoveryObservationSnapshot({
          publicationConvergence,
          priorityRecoveryDecisionSnapshots,
        });
      const writer = new ReportWriter(reportPath);
      writer.addResult(PRIORITY_RECOVERY_ACTUATION_SCENARIO_NAME, {
        passed: false,
        duration: PRIORITY_RECOVERY_ACTUATION_FAILURE_DURATION_MS,
        error: PRIORITY_RECOVERY_ACTUATION_FAILURE_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: PRIORITY_RECOVERY_FAILURE_EXPECTED.rootCauseClass,
              dominantReason: PRIORITY_RECOVERY_FAILURE_EXPECTED.dominantReason,
            },
            controlPlaneDiagnostics: {
              publicationConvergence,
              priorityRecoveryDecisionSnapshots,
              priorityRecoveryObservation,
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(reportPath, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: reportPath,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;
      const priorityRecoveryWitness =
        scenarioBundle.publicationConvergence
          .priorityRecoveryProgressSummary.dominantWitness;

      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_FAILURE_EXPECTED.failureClass,
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        PRIORITY_RECOVERY_FAILURE_EXPECTED.dominantReason,
      );
      assert.equal(
        priorityRecoveryWitness.actuationState,
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.actuation.state,
      );
      assert.equal(
        priorityRecoveryWitness.currentOwner,
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress.currentOwner,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX +
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress.currentOwner,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX +
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress
              .blockingBoundary,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX +
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress.waitMode,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX +
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress
              .nextRequiredAction,
        ),
      );
    },
  );

  it(
    'preserves priority-recovery closure witnesses through normalized decision snapshot merges',
    async () => {
      const CLOSURE_EVIDENCE_REPORT_PATH = join(
        tempDir,
        'priority-recovery-closure-evidence-report.json',
      );
      const CLOSURE_EVIDENCE_PARTITION_ID = 'control_plane_publications-p1';
      const CLOSURE_EVIDENCE_RECORD_ID = 'CL-003';
      const CLOSURE_EVIDENCE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const writer = new ReportWriter(CLOSURE_EVIDENCE_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 24,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['seed-1', 'joiner-1', 'joiner-2'],
                pendingAckNodeIds: [],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [CLOSURE_EVIDENCE_PARTITION_ID],
                  blockedPartitions: [{
                    partitionId: CLOSURE_EVIDENCE_PARTITION_ID,
                    spreadGap: 1,
                    requiredDistinctNodeCount: 3,
                    readyDistinctNodeCount: 2,
                  }],
                  blockedPartitionCount: 1,
                  largestSpreadGap: 1,
                  totalSpreadGap: 1,
                },
              },
              priorityRecoveryDecisionSnapshots: {
                capturedAt: 3000,
                publicationEpoch: 24,
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [CLOSURE_EVIDENCE_PARTITION_ID],
                  blockedPartitions: [{
                    partitionId: CLOSURE_EVIDENCE_PARTITION_ID,
                    spreadGap: 1,
                    requiredDistinctNodeCount: 3,
                    readyDistinctNodeCount: 2,
                  }],
                  blockedPartitionCount: 1,
                  largestSpreadGap: 1,
                  totalSpreadGap: 1,
                },
                snapshots: [{
                  partitionId: CLOSURE_EVIDENCE_PARTITION_ID,
                  semanticState: 'spread_satisfied_in_flight',
                  blockerReasons: [],
                  planner: {
                    spreadGap: 1,
                    ready: false,
                  },
                  spreadCompletion: {
                    satisfied: true,
                  },
                  publication: {
                    concreteEligibleNodeIds: [
                      'seed-1',
                      'joiner-1',
                      'joiner-2',
                    ],
                  },
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(CLOSURE_EVIDENCE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: CLOSURE_EVIDENCE_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .priorityPartitionSummary.blockedPartitionCount,
        1,
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .closureWitness.state,
        'closure_satisfied_stale_publication',
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .closureWitness.closureRecordId,
        CLOSURE_EVIDENCE_RECORD_ID,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        CLOSURE_EVIDENCE_RECORD_ID,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        CLOSURE_EVIDENCE_WITNESS_CLASS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
        [],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary.satisfied,
        true,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitionCount,
        0,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionCount,
        0,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        0,
      );
    },
  );

  it(
    'preserves pressure-shaped witness details without overriding an active priority-spread gate',
    async () => {
      const PRESSURE_REPORT_PATH = join(
        tempDir,
        'priority-recovery-pressure-report.json',
      );
      const PRESSURE_DOMINANT_REASON = 'priority_partitions_not_spread';
      const writer = new ReportWriter(PRESSURE_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: 'sql_write_operations-p1',
                  progressContractState: 'pending',
                  currentOwner: 'rebalancer_leader',
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  nextRequiredAction: 'create_recovery_operation',
                  blockingBoundary: 'operation_scheduling',
                  waitMode: 'stalled',
                  pressureState: 'write_backlog',
                  pendingWrites: 36,
                  pendingWriteGrowthCount: 1626,
                  lastProgressAtMs: 1234,
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(PRESSURE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: PRESSURE_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.dominantReason,
        PRESSURE_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        PRESSURE_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary ?
          scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary :
          null,
        null,
      );
    },
  );

  it(
    'preserves retry-shaped witness details without overriding an active priority-spread gate',
    async () => {
      const RETRY_REPORT_PATH = join(
        tempDir,
        'priority-recovery-retry-report.json',
      );
      const RETRY_DOMINANT_REASON = 'priority_partitions_not_spread';
      const writer = new ReportWriter(RETRY_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: 'sql_write_operations-p1',
                  progressContractState: 'pending',
                  currentOwner: 'rebalancer_leader',
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  nextRequiredAction: 'create_recovery_operation',
                  blockingBoundary: 'operation_scheduling',
                  waitMode: 'retry_scheduled',
                  retryAfterMs: 2500,
                  lastProgressAtMs: 1234,
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RETRY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RETRY_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.dominantReason,
        RETRY_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        RETRY_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary ?
          scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary :
          null,
        null,
      );
    },
  );

  it(
    'breaks same-rank dominant witness ties with actuation specificity before falling back to timestamps',
    async () => {
      const selectedWitness = selectDominantPriorityRecoveryPartitionWitness([
        {
          partitionId: 'plain-scheduling',
          progressContractState: 'blocked',
          actuationState: 'action_required',
          blockingBoundary: 'operation_scheduling',
          waitMode: 'stalled',
          lastProgressAtMs: 1234,
        },
        {
          partitionId: 'pressure-shaped-scheduling',
          progressContractState: 'blocked',
          actuationState:
            PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
          blockingBoundary: 'operation_scheduling',
          waitMode: 'stalled',
          lastProgressAtMs: 1234,
        },
      ]);

      assert.equal(
        selectedWitness?.partitionId,
        'pressure-shaped-scheduling',
      );
    },
  );

  it(
    'classifies control-plane quiescence diagnostics from owner snapshot',
    async () => {
      const SCENARIO_NAME = 'rolling-restart';
      const ROOT_CAUSE_CLASS_DISCOVERY = 'discovery';
      const CONTROL_PLANE_QUIESCENCE_ERROR =
        'Control plane did not quiesce within 120000ms';
      const SNAPSHOT_TIMEOUT_REASON =
        'snapshot_query_error=Admin API query timed out';
      const CONTROL_PLANE_PRESSURE_REASON =
        'control_plane_pressure=Admin API query timed out';
      const QUIESCENCE_STATE_SIGNAL =
        'quiescenceState=' +
        CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE;
      const QUIESCENCE_BLOCKER_SIGNAL =
        'quiescenceBlocker=' +
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE;
      const QUIESCENCE_REASON_SIGNAL =
        'quiescenceReason=' +
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE;
      const QUIESCENCE_MARKDOWN_PATTERN =
        /- Quiescence: state=control_plane_pressure/;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_ELAPSED_MS = 0;
      const IN_FLIGHT_COUNT = 5;
      const SINGLE_REASON_COUNT = 1;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONTROL_PLANE_QUIESCENCE_ERROR,
        details: {
          diagnostics: {
            quiescence: {
              state:
                CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
              canonicalBlocker:
                CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
              reasonCodes: [
                CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
                CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
              ],
              reasons: [
                CONTROL_PLANE_PRESSURE_REASON,
                SNAPSHOT_TIMEOUT_REASON,
              ],
              stableElapsedMs: EMPTY_ELAPSED_MS,
              leaderQuietElapsedMs: EMPTY_ELAPSED_MS,
              inFlightCount: IN_FLIGHT_COUNT,
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
        reportOutputPath: reportPath,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const markdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.markdownPath),
        UTF8_ENCODING,
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.summary.dominantReason,
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
      );
      assert.equal(
        scenarioBundle.summary.rootCauseClass,
        ROOT_CAUSE_CLASS_DISCOVERY,
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
      );
      assert.ok(
        failureClassification.signals.includes(QUIESCENCE_STATE_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(QUIESCENCE_BLOCKER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(QUIESCENCE_REASON_SIGNAL),
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.quiescence.state,
        CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
      );
      assert.equal(
        scenarioBundle.topFailures.reasonCounts[
          CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR
        ],
        SINGLE_REASON_COUNT,
      );
      assert.match(markdown, QUIESCENCE_MARKDOWN_PATTERN);
    },
  );

  it(
    'classifies pending quiescence stable window from owner snapshot',
    async () => {
      const SCENARIO_NAME = 'rolling-restart';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const CONTROL_PLANE_QUIESCENCE_ERROR =
        'Control plane did not quiesce within 120000ms';
      const QUIESCENCE_STATE_SIGNAL =
        'quiescenceState=' +
        CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE;
      const QUIESCENCE_CANDIDATE_WINDOW_RESET_SIGNAL =
        'quiescenceCandidateWindowReset=' +
        CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
          .OPERATION_DRAIN_PROGRESSING;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_ELAPSED_MS = 0;
      const IN_FLIGHT_COUNT = 3;
      const EFFECTIVE_IN_FLIGHT_COUNT = 0;
      const STALE_IN_FLIGHT_COUNT = IN_FLIGHT_COUNT;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONTROL_PLANE_QUIESCENCE_ERROR,
        details: {
          diagnostics: {
            quiescence: {
              state:
                CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
              canonicalBlocker: null,
              reasonCodes: [],
              reasons: [],
              stableElapsedMs: EMPTY_ELAPSED_MS,
              leaderQuietElapsedMs: EMPTY_ELAPSED_MS,
              inFlightCount: IN_FLIGHT_COUNT,
              effectiveInFlightCount: EFFECTIVE_IN_FLIGHT_COUNT,
              staleInFlightCount: STALE_IN_FLIGHT_COUNT,
              candidateWindowReset: {
                reason:
                  CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
                    .OPERATION_DRAIN_PROGRESSING,
                state:
                  CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
                canonicalBlocker:
                  CONTROL_PLANE_QUIESCENCE_REASON
                    .REPLICA_OPERATIONS_IN_FLIGHT,
                reasonCodes: [
                  CONTROL_PLANE_QUIESCENCE_REASON
                    .REPLICA_OPERATIONS_IN_FLIGHT,
                ],
                reasons: [],
                observedAtMs: SCENARIO_DURATION_MS,
              },
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
        reportOutputPath: reportPath,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.summary.dominantReason,
        CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
      );
      assert.equal(
        scenarioBundle.summary.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
      );
      assert.ok(
        failureClassification.signals.includes(QUIESCENCE_STATE_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          QUIESCENCE_CANDIDATE_WINDOW_RESET_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.quiescence.effectiveInFlightCount,
        EFFECTIVE_IN_FLIGHT_COUNT,
      );
    },
  );

  it(
    'normalizes active-gate publication debt over stale top-level counts',
    () => {
      const PUBLICATION_EPOCH = 91;
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const PENDING_ACK_COUNT = 1;
      const MISSING_PUBLISHED_COUNT = 2;
      const MISSING_NODE_ONE = 'missing-node-1';
      const MISSING_NODE_TWO = 'missing-node-2';
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          activeGate: {
            progress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
              pendingAckCount: PENDING_ACK_COUNT,
              missingPublishedCount: MISSING_PUBLISHED_COUNT,
              selectedMissingPublishedNodeIds: [
                MISSING_NODE_ONE,
                MISSING_NODE_TWO,
              ],
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        MISSING_PUBLISHED_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ONE, MISSING_NODE_TWO],
      );
    },
  );

  it(
    ACTIVE_GATE_SELECTED_COVERAGE_CLEARS_STALE_MISSING_TEST_NAME,
    () => {
      const PUBLICATION_EPOCH = 93;
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const PENDING_ACK_NODE_ID = 'pending-ack-node';
      const STALE_MISSING_NODE_ONE = 'stale-missing-node-1';
      const STALE_MISSING_NODE_TWO = 'stale-missing-node-2';
      const SELECTED_NODE_ONE = 'selected-node-1';
      const SELECTED_NODE_TWO = 'selected-node-2';
      const SELECTED_NODE_THREE = 'selected-node-3';
      const SELECTED_NODE_FOUR = 'selected-node-4';
      const SELECTED_NODE_FIVE = 'selected-node-5';
      const EXPECTED_NODE_COUNT = 5;
      const PENDING_ACK_COUNT = 1;
      const STALE_MISSING_COUNT = 2;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: PENDING_ACK_COUNT,
          missingPublishedNodeIds: [
            STALE_MISSING_NODE_ONE,
            STALE_MISSING_NODE_TWO,
          ],
          missingPublishedCount: STALE_MISSING_COUNT,
          publicationPending: true,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: PENDING_ACK_COUNT,
          missingPublishedNodeIds: [
            STALE_MISSING_NODE_ONE,
            STALE_MISSING_NODE_TWO,
          ],
          missingPublishedCount: STALE_MISSING_COUNT,
          publicationPending: true,
          activeGate: {
            progress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedPublishedActiveNodeIds: [
                SELECTED_NODE_ONE,
                SELECTED_NODE_TWO,
                SELECTED_NODE_THREE,
                SELECTED_NODE_FOUR,
                SELECTED_NODE_FIVE,
              ],
              selectedPublishedActiveCount: EXPECTED_NODE_COUNT,
              selectedMissingPublishedNodeIds: [],
              pendingAckCount: PENDING_ACK_COUNT,
              missingPublishedCount: STALE_MISSING_COUNT,
              gateReasons: [],
              blockers: [],
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [PENDING_ACK_NODE_ID],
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(publicationConvergence.missingPublishedNodeIds, []);
      assert.equal(
        hasPublicationMissingActiveNodeBlocker(publicationConvergence),
        false,
      );
    },
  );

  it(
    ACTIVE_GATE_ACK_IDS_CLEAR_STALE_COUNT_TEST_NAME,
    () => {
      const PUBLICATION_EPOCH = 94;
      const PUBLICATION_STATUS_OPEN = 'OPEN';
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const PENDING_ACK_NODE_ID = 'pending-ack-node';
      const MISSING_NODE_ID = 'missing-published-node';
      const PUBLISHED_NODE_ONE = 'published-node-1';
      const PUBLISHED_NODE_TWO = 'published-node-2';
      const PUBLISHED_NODE_THREE = 'published-node-3';
      const PUBLISHED_NODE_FOUR = 'published-node-4';
      const PUBLISHED_NODE_FIVE = 'published-node-5';
      const EXPECTED_NODE_COUNT = 5;
      const CURRENT_PENDING_ACK_COUNT = 1;
      const STALE_PENDING_ACK_COUNT = 2;
      const MISSING_PUBLISHED_COUNT = 1;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_OPEN,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: CURRENT_PENDING_ACK_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ID],
          missingPublishedCount: MISSING_PUBLISHED_COUNT,
          publicationPending: true,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_OPEN,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: STALE_PENDING_ACK_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ID],
          missingPublishedCount: MISSING_PUBLISHED_COUNT,
          publicationPending: true,
          activeGate: {
            progress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_OPEN,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedPublishedActiveNodeIds: [
                PUBLISHED_NODE_ONE,
                PUBLISHED_NODE_TWO,
                PUBLISHED_NODE_THREE,
                PUBLISHED_NODE_FOUR,
              ],
              selectedPublishedActiveCount:
                EXPECTED_NODE_COUNT - CURRENT_PENDING_ACK_COUNT,
              selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
              pendingAckCount: STALE_PENDING_ACK_COUNT,
              missingPublishedCount: MISSING_PUBLISHED_COUNT,
              gateReasons: [],
              blockers: [],
            },
            bestProgress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedPublishedActiveNodeIds: [
                PUBLISHED_NODE_ONE,
                PUBLISHED_NODE_TWO,
                PUBLISHED_NODE_THREE,
                PUBLISHED_NODE_FOUR,
                PUBLISHED_NODE_FIVE,
              ],
              selectedPublishedActiveCount: EXPECTED_NODE_COUNT,
              selectedMissingPublishedNodeIds: [],
              pendingAckCount: STALE_PENDING_ACK_COUNT,
              missingPublishedCount: ZERO_COUNT,
              gateReasons: [],
              blockers: [],
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.pendingAckCount,
        CURRENT_PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [PENDING_ACK_NODE_ID],
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        MISSING_PUBLISHED_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ID],
      );
    },
  );

  it(
    ACTIVE_GATE_ACK_SET_DIFFERENCE_TEST_NAME,
    () => {
      const REQUIRED_ACK_NODE_ONE = 'required-ack-node-1';
      const REQUIRED_ACK_NODE_TWO = 'required-ack-node-2';
      const ACKED_FOREIGN_NODE = 'acked-foreign-node';
      const PUBLICATION_EPOCH = 95;
      const SINGLE_PENDING_ACK_COUNT = 1;
      const ZERO_COUNT = 0;
      const controlPlane = {
        activeGateProgress: {
          publicationEpoch: PUBLICATION_EPOCH,
          requiredAckNodeIds: [
            REQUIRED_ACK_NODE_ONE,
            REQUIRED_ACK_NODE_TWO,
          ],
          acknowledgedNodeIds: [
            REQUIRED_ACK_NODE_TWO,
            ACKED_FOREIGN_NODE,
          ],
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
        },
      };

      const publicationEvidence =
        buildCanonicalPublicationEvidenceFromControlPlane(controlPlane);
      const canonicalActiveGateProgress =
        publicationEvidence.priorityRecoveryObservation?.activeGateProgress ||
        publicationEvidence.priorityRecoveryObservation?.activeGate?.progress;
      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.deepEqual(
        canonicalActiveGateProgress.pendingAckNodeIds,
        [REQUIRED_ACK_NODE_ONE],
      );
      assert.equal(
        canonicalActiveGateProgress.pendingAckCount,
        SINGLE_PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [REQUIRED_ACK_NODE_ONE],
      );
      assert.equal(
        publicationConvergence.pendingAckCount,
        SINGLE_PENDING_ACK_COUNT,
      );
    },
  );

  it(
    'ignores stale best-progress missing publication evidence when current active-gate progress is clean',
    () => {
      const PUBLICATION_EPOCH = 92;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const MISSING_NODE_ID = 'stale-missing-node';
      const PUBLISHED_NODE_ID = 'published-node';
      const MISSING_NODE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_ID;
      const ACTIVE_GATE_MISSING_BLOCKER = 'publication_gate=' +
        MISSING_NODE_REASON;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
          activeGate: {
            progress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
              selectedPublishedActiveNodeIds: [PUBLISHED_NODE_ID],
              selectedMissingPublishedNodeIds: [],
              pendingAckCount: ZERO_COUNT,
              missingPublishedCount: ZERO_COUNT,
              gateReasons: [],
              blockers: [],
            },
            bestProgress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
              selectedPublishedActiveNodeIds: [PUBLISHED_NODE_ID],
              selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
              pendingAckCount: ZERO_COUNT,
              missingPublishedCount: ONE_COUNT,
              gateReasons: [MISSING_NODE_REASON],
              blockers: [ACTIVE_GATE_MISSING_BLOCKER],
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(publicationConvergence.missingPublishedNodeIds, []);
      assert.deepEqual(
        publicationConvergence.publicationConvergenceGateReasons,
        [],
      );
      assert.equal(
        hasPublicationMissingActiveNodeBlocker(publicationConvergence),
        false,
      );
    },
  );

  it(
    'separates active-gate snapshot coverage from serial priority recovery progress',
    async () => {
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_LOAD = 'load';
      const ACTIVE_GATE_STATE_STALLED = 'stalled';
      const GENERIC_PUBLICATION_REASON = 'publication_epoch_pending';
      const MISSING_NODE_ID = 'node-missing-published';
      const PUBLISHED_NODE_ID = 'node-published';
      const SELECTED_SNAPSHOT_NODE_ID = 'node-snapshot';
      const MISSING_NODE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_ID;
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=5';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=4/5';
      const ACTIVE_GATE_MISSING_BLOCKER = 'publication_gate=' +
        MISSING_NODE_REASON;
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_transactions-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        'priority_operation_serial_wait';
      const PRIORITY_RECOVERY_SEMANTIC_STATE = 'needs_operation';
      const PRIORITY_RECOVERY_OWNER = 'operation_workflow_owner';
      const PRIORITY_RECOVERY_BOUNDARY = 'workflow_progress';
      const PRIORITY_RECOVERY_WAIT_MODE = 'event_driven';
      const PRIORITY_RECOVERY_NEXT_ACTION = 'wait_for_operation_progress';
      const PRIORITY_RECOVERY_CONTRACT_STATE = 'pending';
      const PRIORITY_RECOVERY_ACTUATION_STATE = 'transition_deferred';
      const PRIORITY_RECOVERY_PROGRESS_CLASS_SIGNAL =
        'priorityRecoveryProgressClass=' + PRIORITY_RECOVERY_PROGRESS_CLASS;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const PUBLICATION_EPOCH = 25;
      const EXPECTED_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_COUNT = 4;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Cluster ACTIVE wait stalled with no meaningful progress',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason:
                CONTROL_PLANE_READINESS_REASON
                  .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
              reasonCounts: {
                [CONTROL_PLANE_READINESS_REASON
                  .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]: ONE_COUNT,
                [GENERIC_PUBLICATION_REASON]: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: ZERO_COUNT,
                missingPublishedNodeIds: [MISSING_NODE_ID],
                missingPublishedCount: ONE_COUNT,
                publicationPending: true,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                priorityRecoveryReasonCodes: [GENERIC_PUBLICATION_REASON],
                publicationConvergenceGateReasons: [
                  GENERIC_PUBLICATION_REASON,
                  MISSING_NODE_REASON,
                ],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: ONE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE,
                ],
                priorityRecoverySemanticStateCount: ONE_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: ONE_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: ONE_COUNT,
                priorityRecoveryBlockerPartitionIdsByReason: {
                  [PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE,
                  progressClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  blockerReasonCodes: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  progressContractState: PRIORITY_RECOVERY_CONTRACT_STATE,
                  currentOwner: PRIORITY_RECOVERY_OWNER,
                  blockingBoundary: PRIORITY_RECOVERY_BOUNDARY,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE,
                  nextRequiredAction: PRIORITY_RECOVERY_NEXT_ACTION,
                  actuationState: PRIORITY_RECOVERY_ACTUATION_STATE,
                  actuationOwner: PRIORITY_RECOVERY_OWNER,
                }],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: EXPECTED_NODE_COUNT,
                  readyEligibleNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  totalPriorityPartitionCount: EXPECTED_NODE_COUNT,
                  blockedPartitionCount: ZERO_COUNT,
                  largestSpreadGap: ZERO_COUNT,
                  totalSpreadGap: ZERO_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_LOAD,
                state: ACTIVE_GATE_STATE_STALLED,
                ready: false,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ZERO_COUNT,
                  inactiveNodeCount: EXPECTED_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                  selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                  selectedPublishedActiveNodeIds: [PUBLISHED_NODE_ID],
                  selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: ONE_COUNT,
                  gateReasons: [MISSING_NODE_REASON],
                  prioritySpreadSatisfied: true,
                  prioritySpreadGap: ZERO_COUNT,
                  priorityBlockedPartitionCount: ZERO_COUNT,
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    ACTIVE_GATE_MISSING_BLOCKER,
                  ],
                },
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ZERO_COUNT,
                inactiveNodeCount: EXPECTED_NODE_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                snapshotCoverageComplete: false,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                publicationEpoch: PUBLICATION_EPOCH,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                selectedPublishedActiveNodeIds: [PUBLISHED_NODE_ID],
                selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
                pendingAckCount: ZERO_COUNT,
                missingPublishedCount: ONE_COUNT,
                gateReasons: [MISSING_NODE_REASON],
                prioritySpreadSatisfied: true,
                prioritySpreadGap: ZERO_COUNT,
                priorityBlockedPartitionCount: ZERO_COUNT,
                blockers: [
                  ACTIVE_GATE_INACTIVE_BLOCKER,
                  ACTIVE_GATE_COVERAGE_BLOCKER,
                  ACTIVE_GATE_MISSING_BLOCKER,
                ],
              },
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
        reportOutputPath: reportPath,
        outputDir: tempDir,
        reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.publicationConvergence.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.missingPublishedNodeIds,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.publicationPending,
        false,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons,
        [ACTIVE_GATE_COVERAGE_BLOCKER],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
        [],
      );
      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.ok(
        failureClassification.signals.includes(ACTIVE_GATE_COVERAGE_BLOCKER),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PROGRESS_CLASS_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        false,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
        ),
        false,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.restart_recovery.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        false,
      );
    },
  );

  registerFailureBundlePlaybackTests({
    it,
    assert,
    join,
    mkdir,
    writeFile,
    readFile,
    resolve,
    ReportWriter,
    writeFailureBundlesForReport,
    UTF8_ENCODING,
    state: {
      get tempDir() {
        return tempDir;
      },
      get outputDir() {
        return outputDir;
      },
      get reportPath() {
        return reportPath;
      },
    },
    buildPlaybackDerivedFailureResult,
    buildPlaybackActiveGateStageEvent,
    buildStartupModeWitnessProgress,
  });
});
