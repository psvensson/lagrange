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
import {FAILURE_BUNDLE_FOUNDATION} from
  '../failure-bundle-foundation.js';
import {FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT} from
  '../failure-bundle-diagnostics-contract-reexport.js';
import {registerFailureBundlePlaybackTests} from './failure-bundle-playback-test-cases.js';
import {
  registerFailureBundleActiveGateTailTests,
} from './failure-bundle-active-gate-tail-test-cases.js';
import {
  registerFailureBundlePriorityRecoverySummaryTests,
} from './failure-bundle-priority-recovery-summary-test-cases.js';
import {
  registerFailureBundleStartupDecisionAndConvergenceMappingTests,
} from './failure-bundle-startup-decision-and-convergence-mapping-test-cases.js';
import {
  registerFailureBundleFailureClassClassificationTests,
} from './failure-bundle-failure-class-classification-test-cases.js';
import {
  registerFailureBundlePriorityRecoveryObservationReconciliationTests,
} from './failure-bundle-priority-recovery-observation-reconciliation-test-cases.js';
import {
  registerFailureBundlePriorityRecoveryPlaybackEvidenceTests,
} from './failure-bundle-priority-recovery-playback-evidence-test-cases.js';
import {
  registerFailureBundlePriorityRecoveryWitnessDominanceTests,
} from './failure-bundle-priority-recovery-witness-dominance-test-cases.js';
import {
  registerFailureBundleRestartRecoveryClassificationTests,
} from './failure-bundle-restart-recovery-classification-test-cases.js';
import {
  registerFailureBundlePublicationGateAndLoadPressureTests,
} from './failure-bundle-publication-gate-and-load-pressure-test-cases.js';
import {
  registerFailureBundlePriorityRecoveryClosureWitnessTests,
} from './failure-bundle-priority-recovery-closure-witness-test-cases.js';
import {
  registerFailureBundleActiveGatePublicationDebtNormalizationTests,
} from './failure-bundle-active-gate-publication-debt-normalization-test-cases.js';
import {
  registerFailureBundleActiveGateSnapshotCoverageTests,
} from './failure-bundle-active-gate-snapshot-coverage-test-cases.js';
import {
  registerFailureBundleStartupReachabilityWorkflowProgressTests,
} from './failure-bundle-startup-reachability-workflow-progress-test-cases.js';
import {
  registerFailureBundleMissingActiveDebtOverSerialWaitTests,
} from './failure-bundle-missing-active-debt-over-serial-wait-test-cases.js';
import {
  registerFailureBundleMissingActiveDebtOverPendingDispatchTests,
} from './failure-bundle-missing-active-debt-over-pending-dispatch-test-cases.js';
import {
  registerFailureBundleMissingActiveDebtOverCoordinationMismatchTests,
} from './failure-bundle-missing-active-debt-over-coordination-mismatch-test-cases.js';
import {
  registerFailureBundleAckClosureOrderingTests,
} from './failure-bundle-ack-closure-ordering-test-cases.js';
import {selectDominantPriorityRecoveryPartitionWitness} from
  '../priority-recovery-summary-normalization.js';
import {
  buildCanonicalPublicationEvidenceFromControlPlane,
} from '../publication-evidence-contract.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_REASON,
} from '../../../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildPriorityRecoveryDecisionSnapshot,
} from '../../../../src/control-plane/priority-recovery-snapshot.js';
import {
  buildPriorityRecoveryObservationSnapshot,
} from '../../../../src/control-plane/priority-recovery-observation-snapshot.js';
import {
  JOINING_PHASE,
} from '../../../../src/bootstrap/bootstrap-constants.js';
import {
  JOINING_LOG_MSG,
} from '../../../../src/bootstrap/node-joining-constants.js';
import {
  STARTUP_JOIN_MODE,
} from '../../../../src/bootstrap/rejoin-hints-constants.js';
import {
  ENTRYPOINT_LOG_MSG,
} from '../../../../src/constants/entrypoint.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
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
const ACTIVE_GATE_COUNT_ONLY_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME =
  'keeps count-only active-gate pending ACK while priority actuation remains open';
const ACTIVE_GATE_NESTED_COUNT_ONLY_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME =
  'keeps nested count-only active-gate pending ACK while priority actuation remains open';
const ACTIVE_GATE_CANONICAL_MISSING_DURING_COVERAGE_TEST_NAME =
  'keeps canonical missing published debt during active-gate coverage lag';
const ACTIVE_GATE_CANONICAL_MISSING_WITH_STALE_CLOSURE_TEST_NAME =
  'keeps canonical missing published debt during retained stale closure coverage lag';
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
const STARTUP_SEED_CONTACT_NODE_ID = 'joiner-seed-contact-1';
const STARTUP_SEED_CONTACT_SCENARIO = 'rolling-restart';
const STARTUP_SEED_CONTACT_AUTO_DECISION_TIME = '2026-05-04T12:36:34.040Z';
const STARTUP_SEED_CONTACT_JOIN_DECISION_TIME = '2026-05-04T12:36:34.042Z';
const STARTUP_SEED_CONTACT_FAILURE_TIME = '2026-05-04T12:38:38.057Z';
const STARTUP_SEED_CONTACT_RESUME_TIME = '2026-05-04T12:38:38.059Z';
const STARTUP_SEED_CONTACT_FOLLOWUP_DECISION_TIME =
  '2026-05-04T13:42:37.772Z';
const STARTUP_SEED_CONTACT_NODE_ADDRESS = 'ddb-test-reuse-5-5:8080';
const STARTUP_SEED_CONTACT_SEED_ADDRESS = '172.19.0.2:8080';
const STARTUP_SEED_CONTACT_AUTO_STATE = 'fresh_seed';
const STARTUP_SEED_CONTACT_AUTO_MODE = 'seed';
const STARTUP_SEED_CONTACT_AUTO_SOURCE = 'none';
const STARTUP_SEED_CONTACT_PEER_ADDRESS_STATE = 'unavailable';
const STARTUP_SEED_CONTACT_FAILURE_ERROR =
  'Failed to contact seed node: Request timeout after 30000ms';
const STARTUP_SEED_CONTACT_FAILURE_DURATION_MS = 123991;
const STARTUP_SEED_CONTACT_RETRY_AFTER_MS = 4310;
const STARTUP_SEED_CONTACT_JOIN_SESSION_ID = 'join-session-seed-contact-1';
const STARTUP_SEED_CONTACT_ATTEMPT = 1;
const STARTUP_SEED_CONTACT_MAX_ATTEMPTS = 4;
const STARTUP_SEED_CONTACT_REASON = 'seed_contact_retrying';
const STARTUP_SEED_CONTACT_BOOTSTRAP_REASON = 'BOOTSTRAP_PHASE_INCOMPLETE';
const STARTUP_SEED_CONTACT_CLASS_SIGNAL = 'startupOwner=seed_contact';
const STARTUP_SEED_CONTACT_PHASE_SIGNAL =
  'startupPhase=' + JOINING_PHASE.CONTACTING_SEED;
const STARTUP_SEED_CONTACT_RETRY_SIGNAL =
  'startupRetryAfterMs=' + STARTUP_SEED_CONTACT_RETRY_AFTER_MS;
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
  ROOT_CAUSE_CLASS_TOPOLOGY,
  PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  mergePriorityRecoveryDecisionSnapshots,
} = FAILURE_BUNDLE_FOUNDATION;
const {
  buildPublicationConvergenceSummary,
  hasPublicationMissingActiveNodeBlocker,
  isStartupReadinessBlocked,
  mergeControlPlaneDiagnostics,
} = FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT;

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
      activeGate: {
        mode: readinessMode,
        state: 'waiting',
        maxAttempts: 45,
        attemptsSinceProgress: 22,
        progress: activeGateCurrentProgress || {
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

function buildStartupSeedContactLogLine(timestamp, payload) {
  return `${timestamp} [${STARTUP_SEED_CONTACT_NODE_ID}] info: ` +
    JSON.stringify(payload);
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

  const failureBundleTestContext = {
    ACTIVE_GATE_ACK_IDS_CLEAR_STALE_COUNT_TEST_NAME,
    ACTIVE_GATE_ACK_SET_DIFFERENCE_TEST_NAME,
    ACTIVE_GATE_CANONICAL_MISSING_DURING_COVERAGE_TEST_NAME,
    ACTIVE_GATE_CANONICAL_MISSING_WITH_STALE_CLOSURE_TEST_NAME,
    ACTIVE_GATE_COUNT_ONLY_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME,
    ACTIVE_GATE_NESTED_COUNT_ONLY_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME,
    ACTIVE_GATE_SELECTED_COVERAGE_CLEARS_STALE_MISSING_TEST_NAME,
    assert,
    buildCanonicalPublicationEvidenceFromControlPlane,
    buildConvergenceDiagnosticsOnlyScenario,
    buildLoadLaneTimeoutFailureScenario,
    buildNoProgressFailureScenario,
    buildPlaybackActiveGateStageEvent,
    buildPlaybackDerivedFailureResult,
    buildPriorityRecoveryActuationDecisionInput,
    buildPriorityRecoveryDecisionSnapshot,
    buildPriorityRecoveryObservationSnapshot,
    buildPriorityRecoveryPublicationConvergenceFixture,
    buildPublicationConvergenceSummary,
    buildRuntimeFailureScenario,
    buildStartupModeWitnessProgress,
    buildStartupSeedContactLogLine,
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON,
    CONTROL_PLANE_QUIESCENCE_REASON,
    CONTROL_PLANE_QUIESCENCE_STATE,
    CONTROL_PLANE_READINESS_REASON,
    ENTRYPOINT_LOG_MSG,
    FAILURE_BUNDLE_FOUNDATION,
    FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT,
    FAILURE_CLASS_CACHE_STALE,
    FAILURE_CLASS_CDC_DEGRADED,
    FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
    FAILURE_CLASS_LOAD_PRESSURE,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
    FAILURE_CLASS_TOPOLOGY_UNSTABLE,
    FAILURE_CLASS_UNKNOWN,
    hasPublicationMissingActiveNodeBlocker,
    isStartupReadinessBlocked,
    it,
    join,
    JOINING_LOG_MSG,
    JOINING_PHASE,
    mergeControlPlaneDiagnostics,
    mergePriorityRecoveryDecisionSnapshots,
    mkdir,
    PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_FAILURE_DURATION_MS,
    PRIORITY_RECOVERY_ACTUATION_FAILURE_ERROR,
    PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_REPORT_FILENAME,
    PRIORITY_RECOVERY_ACTUATION_SCENARIO_NAME,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
    PRIORITY_RECOVERY_DECISION_SET_EXPECTED,
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED,
    PRIORITY_RECOVERY_FAILURE_EXPECTED,
    PRIORITY_RECOVERY_HISTORY_PARTITION_ID,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PROGRESS_OWNER,
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_ID,
    PRIORITY_RECOVERY_SERIAL_WAIT_CURRENT_BLOCKER_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
    PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_CORRELATION_KEY,
    PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
    PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_STATUS,
    PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
    PRIORITY_RECOVERY_SERIAL_WAIT_PROGRESS_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SERIAL_WAIT_SYNTHETIC_CORRELATION_KEY,
    PRIORITY_RECOVERY_TARGET_PROGRESS_AT_MS,
    PRIORITY_RECOVERY_TARGET_PROGRESS_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_TARGET_PROGRESS_CORRELATION_KEY,
    PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
    PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
    PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
    PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_TARGET_PROGRESS_STATUS,
    PRIORITY_RECOVERY_WAIT_MODE,
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
    readFile,
    ReportWriter,
    resolve,
    ROOT_CAUSE_CLASS_STARTUP,
    ROOT_CAUSE_CLASS_TOPOLOGY,
    selectDominantPriorityRecoveryPartitionWitness,
    STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
    STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
    STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
    STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
    STARTUP_JOIN_MODE,
    STARTUP_SEED_CONTACT_ATTEMPT,
    STARTUP_SEED_CONTACT_AUTO_DECISION_TIME,
    STARTUP_SEED_CONTACT_AUTO_MODE,
    STARTUP_SEED_CONTACT_AUTO_SOURCE,
    STARTUP_SEED_CONTACT_AUTO_STATE,
    STARTUP_SEED_CONTACT_BOOTSTRAP_REASON,
    STARTUP_SEED_CONTACT_CLASS_SIGNAL,
    STARTUP_SEED_CONTACT_FAILURE_DURATION_MS,
    STARTUP_SEED_CONTACT_FAILURE_ERROR,
    STARTUP_SEED_CONTACT_FAILURE_TIME,
    STARTUP_SEED_CONTACT_FOLLOWUP_DECISION_TIME,
    STARTUP_SEED_CONTACT_JOIN_DECISION_TIME,
    STARTUP_SEED_CONTACT_JOIN_SESSION_ID,
    STARTUP_SEED_CONTACT_MAX_ATTEMPTS,
    STARTUP_SEED_CONTACT_NODE_ADDRESS,
    STARTUP_SEED_CONTACT_NODE_ID,
    STARTUP_SEED_CONTACT_PEER_ADDRESS_STATE,
    STARTUP_SEED_CONTACT_PHASE_SIGNAL,
    STARTUP_SEED_CONTACT_REASON,
    STARTUP_SEED_CONTACT_RESUME_TIME,
    STARTUP_SEED_CONTACT_RETRY_AFTER_MS,
    STARTUP_SEED_CONTACT_RETRY_SIGNAL,
    STARTUP_SEED_CONTACT_SCENARIO,
    STARTUP_SEED_CONTACT_SEED_ADDRESS,
    TEST_COUNT_ZERO,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
    writeFile,
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
  };

  registerFailureBundlePriorityRecoverySummaryTests(failureBundleTestContext);
  registerFailureBundleStartupDecisionAndConvergenceMappingTests(failureBundleTestContext);
  registerFailureBundleFailureClassClassificationTests(failureBundleTestContext);
  registerFailureBundlePriorityRecoveryObservationReconciliationTests(failureBundleTestContext);
  registerFailureBundlePriorityRecoveryPlaybackEvidenceTests(failureBundleTestContext);
  registerFailureBundlePriorityRecoveryWitnessDominanceTests(failureBundleTestContext);
  registerFailureBundleRestartRecoveryClassificationTests(failureBundleTestContext);
  registerFailureBundlePublicationGateAndLoadPressureTests(failureBundleTestContext);
  registerFailureBundlePriorityRecoveryClosureWitnessTests(failureBundleTestContext);
  registerFailureBundleActiveGatePublicationDebtNormalizationTests(failureBundleTestContext);
  registerFailureBundleActiveGateSnapshotCoverageTests(failureBundleTestContext);
  registerFailureBundleStartupReachabilityWorkflowProgressTests(failureBundleTestContext);
  registerFailureBundleMissingActiveDebtOverSerialWaitTests(failureBundleTestContext);
  registerFailureBundleMissingActiveDebtOverPendingDispatchTests(failureBundleTestContext);
  registerFailureBundleMissingActiveDebtOverCoordinationMismatchTests(failureBundleTestContext);
  registerFailureBundleAckClosureOrderingTests(failureBundleTestContext);

  registerFailureBundleActiveGateTailTests({
    it,
    assert,
    UTF8_ENCODING,
    state: {
      get tempDir() {
        return tempDir;
      },
      get reportPath() {
        return reportPath;
      },
    },
  });
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
