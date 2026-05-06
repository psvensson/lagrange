import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import {
  registerFailureBundlePublicationClosureTailTests,
} from './failure-bundle-publication-closure-tail-test-cases.js';
import {FAILURE_BUNDLE_SEGMENT_1} from '../failure-bundle-segment-1.js';
import {
  buildCanonicalPublicationEvidenceFromControlPlane,
} from '../publication-evidence-contract.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
} from '../../../../src/control-plane/priority-recovery-diagnostics-constants.js';

const ACTIVE_GATE_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME =
  'keeps explicit active-gate pending ACK while priority actuation remains open';
const ACTIVE_GATE_PENDING_ACK_WORKFLOW_PROGRESS_TEST_NAME =
  'keeps active-gate pending ACK dominant over subordinate workflow progress';
const {
  FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
} = FAILURE_BUNDLE_SEGMENT_1;

export function registerFailureBundleActiveGateTailTests({
  it,
  assert,
  UTF8_ENCODING,
  state,
}) {
  it(
    'keeps current publication gate debt when stale closure witness is retained',
    () => {
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=4/5';
      const MISSING_NODE_ID = 'selected-missing-node-open';
      const PUBLICATION_GATE_REASON =
        'publication_missing_active_node=' + MISSING_NODE_ID;
      const PUBLICATION_GATE_BLOCKER =
        'publication_gate=' + PUBLICATION_GATE_REASON;
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 4;
      const SNAPSHOT_COVERAGE_COUNT = 4;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
        publicationConvergenceGate: {
          ready: false,
          reasons: [PUBLICATION_GATE_REASON],
          reasonCodes: [PUBLICATION_GATE_REASON],
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ID],
          missingPublishedCount: ONE_COUNT,
          publicationPending: true,
          prioritySpreadPending: false,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ID],
          missingPublishedCount: ONE_COUNT,
          publicationPending: true,
          prioritySpreadPending: false,
          publicationConvergenceGateReasons: [PUBLICATION_GATE_REASON],
          closureRecordId: CLOSURE_RECORD_ID,
          closureWitnessClass: CLOSURE_WITNESS_CLASS,
        },
        activeGate: {
          mode: ACTIVE_GATE_MODE_STARTUP,
          ready: false,
          progress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: ACTIVE_NODE_COUNT,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            publicationEpoch: PUBLICATION_EPOCH,
            selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
            pendingAckCount: ZERO_COUNT,
            missingPublishedCount: ONE_COUNT,
            gateReasons: [PUBLICATION_GATE_REASON],
            prioritySpreadSatisfied: true,
            prioritySpreadGap: ZERO_COUNT,
            priorityBlockedPartitionCount: ZERO_COUNT,
            blockers: [
              ACTIVE_GATE_COVERAGE_BLOCKER,
              PUBLICATION_GATE_BLOCKER,
            ],
          },
        },
      });
      const activeGateProgress =
        publicationEvidence.priorityRecoveryObservation.activeGate.progress;

      assert.equal(
        publicationEvidence.publicationConvergence.missingPublishedCount,
        ONE_COUNT,
      );
      assert.deepEqual(
        publicationEvidence.publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ID],
      );
      assert.equal(activeGateProgress.missingPublishedCount, ONE_COUNT);
      assert.deepEqual(
        activeGateProgress.selectedMissingPublishedNodeIds,
        [MISSING_NODE_ID],
      );
      assert.deepEqual(activeGateProgress.gateReasons, [PUBLICATION_GATE_REASON]);
      assert.equal(
        activeGateProgress.blockers.includes(PUBLICATION_GATE_BLOCKER),
        true,
      );
    },
  );

  it(
    ACTIVE_GATE_PENDING_ACK_PRIORITY_ACTUATION_TEST_NAME,
    async () => {
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const GENERIC_PUBLICATION_REASON =
        CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING;
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION;
      const PRIORITY_RECOVERY_PROGRESS_BLOCKER =
        'priority_recovery_progress_class=' + PRIORITY_RECOVERY_PROGRESS_CLASS;
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=2';
      const SELECTED_SNAPSHOT_NODE_ID = 'selected-active-gate-node';
      const MISSING_NODE_ONE = 'selected-missing-node-one';
      const MISSING_NODE_TWO = 'selected-missing-node-two';
      const MISSING_NODE_THREE = 'selected-missing-node-three';
      const PENDING_ACK_NODE_ID = 'selected-pending-ack-node';
      const PUBLISHED_NODE_ONE = 'published-node-one';
      const PUBLISHED_NODE_TWO = 'published-node-two';
      const PUBLICATION_EPOCH = 2;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_COUNT = 2;
      const PRIORITY_SPREAD_GAP = 5;
      const NO_PROGRESS_ATTEMPT_COUNT = 9;
      const ATTEMPTS_SINCE_PROGRESS = 5;
      const ELAPSED_MS = 122065;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const PENDING_ACK_COUNT_SIGNAL = 'pendingAckCount=1';
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        duration: ELAPSED_MS,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason:
                'priority_recovery_actuation_state_action_required',
              reasonCounts: {
                [GENERIC_PUBLICATION_REASON]: ONE_COUNT,
                [PRIORITY_SPREAD_REASON]: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                priorityRecoveryReasonCodes: [],
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                pendingAckNodeIds: [PENDING_ACK_NODE_ID],
                pendingAckCount: ONE_COUNT,
                missingPublishedNodeIds: [
                  MISSING_NODE_ONE,
                  MISSING_NODE_TWO,
                  MISSING_NODE_THREE,
                ],
                missingPublishedCount: INACTIVE_NODE_COUNT + ONE_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                priorityRecoveryReasonCodes: [
                  PRIORITY_SPREAD_REASON,
                  GENERIC_PUBLICATION_REASON,
                ],
                publicationConvergenceGateReasons: [
                  PRIORITY_SPREAD_REASON,
                  GENERIC_PUBLICATION_REASON,
                ],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: ONE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
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
                  [PRIORITY_RECOVERY_SEMANTIC_STATE_ID]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  spreadGap: ONE_COUNT,
                  progressClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  blockerReasonCodes: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  progressContractState: 'pending',
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .CREATE_RECOVERY_OPERATION,
                }],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: EXPECTED_NODE_COUNT,
                  readyEligibleNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  totalPriorityPartitionCount: EXPECTED_NODE_COUNT,
                  blockedPartitionCount: ONE_COUNT,
                  largestSpreadGap: PRIORITY_SPREAD_GAP,
                  totalSpreadGap: PRIORITY_SPREAD_GAP,
                  missingPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                  blockedPartitions: [PRIORITY_RECOVERY_PARTITION_ID],
                },
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                attempts: NO_PROGRESS_ATTEMPT_COUNT,
                elapsedMs: ELAPSED_MS,
                attemptsSinceProgress: ATTEMPTS_SINCE_PROGRESS,
                coordinatorCyclesSinceProgress: ATTEMPTS_SINCE_PROGRESS,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                  selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                  ],
                  selectedPublishedActiveCount: SNAPSHOT_COVERAGE_COUNT,
                  selectedMissingPublishedNodeIds: [
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                    MISSING_NODE_THREE,
                  ],
                  pendingAckNodeIds: [PENDING_ACK_NODE_ID],
                  pendingAckCount: ONE_COUNT,
                  missingPublishedCount: INACTIVE_NODE_COUNT + ONE_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
                  priorityBlockedPartitionCount: ONE_COUNT,
                  priorityRecoveryProgressClasses: {
                    unresolvedClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                    unresolvedClassCount: ONE_COUNT,
                    unresolvedSemanticStateIds: [
                      PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                    ],
                    unresolvedSemanticStateCount: ONE_COUNT,
                    blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                    blockedPartitionCount: ONE_COUNT,
                  },
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    PRIORITY_RECOVERY_PROGRESS_BLOCKER,
                  ],
                },
              },
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
        reportOutputPath: state.reportPath,
        outputDir: state.tempDir,
        reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: state.tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(publicationConvergence.pendingAckCount, ONE_COUNT);
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [PENDING_ACK_NODE_ID],
      );
      assert.equal(publicationConvergence.missingPublishedCount, ZERO_COUNT);
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          GENERIC_PUBLICATION_REASON,
        ),
        false,
      );
      assert.ok(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          ACTIVE_GATE_COVERAGE_BLOCKER,
        ),
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.ok(
        failureClassification.signals.includes(
          PENDING_ACK_COUNT_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
        ),
        true,
      );
    },
  );

  it(
    ACTIVE_GATE_PENDING_ACK_WORKFLOW_PROGRESS_TEST_NAME,
    async () => {
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const GENERIC_PUBLICATION_REASON =
        CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING;
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION;
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=2';
      const PENDING_ACK_DOMINANT_REASON = 'pending_ack_nodes';
      const PENDING_ACK_NODE_ID = 'selected-pending-ack-node';
      const PUBLISHED_NODE_ONE = 'published-node-one';
      const PUBLISHED_NODE_TWO = 'published-node-two';
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_COUNT = 2;
      const PRIORITY_SPREAD_GAP = 2;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const PENDING_ACK_COUNT_SIGNAL = 'pendingAckCount=1';
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: GENERIC_PUBLICATION_REASON,
              reasonCounts: {
                [GENERIC_PUBLICATION_REASON]: ONE_COUNT,
                [PRIORITY_SPREAD_REASON]: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [PRIORITY_SPREAD_REASON],
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                pendingAckNodeIds: [PENDING_ACK_NODE_ID],
                pendingAckCount: ONE_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                priorityRecoveryReasonCodes: [
                  PRIORITY_SPREAD_REASON,
                  GENERIC_PUBLICATION_REASON,
                ],
                publicationConvergenceGateReasons: [
                  PRIORITY_SPREAD_REASON,
                  GENERIC_PUBLICATION_REASON,
                ],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: ONE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
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
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  progressClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  blockerReasonCodes: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  progressContractState: 'pending',
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE
                      .DISPATCHED_WAITING_PROGRESS,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .WAIT_FOR_OPERATION_PROGRESS,
                }],
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                  ],
                  selectedPublishedActiveCount: SNAPSHOT_COVERAGE_COUNT,
                  selectedMissingPublishedNodeIds: [],
                  pendingAckNodeIds: [PENDING_ACK_NODE_ID],
                  pendingAckCount: ONE_COUNT,
                  missingPublishedCount: ZERO_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
                  priorityBlockedPartitionCount: ONE_COUNT,
                  priorityRecoveryProgressClasses: {
                    unresolvedClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                    unresolvedClassCount: ONE_COUNT,
                    unresolvedSemanticStateIds: [
                      PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                    ],
                    unresolvedSemanticStateCount: ONE_COUNT,
                    blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                    blockedPartitionCount: ONE_COUNT,
                  },
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                  ],
                },
              },
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
        reportOutputPath: state.reportPath,
        outputDir: state.tempDir,
        reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: state.tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(publicationConvergence.pendingAckCount, ONE_COUNT);
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [PENDING_ACK_NODE_ID],
      );
      assert.equal(
        publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_PUBLICATION_PENDING,
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoveryProgressClassIds,
        [PRIORITY_RECOVERY_PROGRESS_CLASS],
      );
      assert.ok(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          ACTIVE_GATE_COVERAGE_BLOCKER,
        ),
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        PENDING_ACK_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.summary.dominantReason,
        PENDING_ACK_DOMINANT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(PENDING_ACK_COUNT_SIGNAL),
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
        ),
        true,
      );
    },
  );

  it(
    'clears stale generic publication epoch gate when closure witness is retained',
    () => {
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const PUBLICATION_GATE_REASON =
        CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING;
      const PUBLICATION_GATE_BLOCKER =
        'publication_gate=' + PUBLICATION_GATE_REASON;
      const MISSING_NODE_ONE = 'selected-missing-node-stale-one';
      const MISSING_NODE_TWO = 'selected-missing-node-stale-two';
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const CLOSURE_STATE = 'closure_satisfied_stale_publication';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const SNAPSHOT_COVERAGE_COUNT = 2;
      const MISSING_COUNT = 2;
      const ZERO_COUNT = 0;
      const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          prioritySpreadPending: false,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: [PUBLICATION_GATE_REASON],
          reasonCodes: [PUBLICATION_GATE_REASON],
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ONE, MISSING_NODE_TWO],
          missingPublishedCount: MISSING_COUNT,
          publicationPending: true,
          prioritySpreadPending: false,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ONE, MISSING_NODE_TWO],
          missingPublishedCount: MISSING_COUNT,
          publicationPending: true,
          prioritySpreadPending: false,
          publicationConvergenceGateReasons: [PUBLICATION_GATE_REASON],
          priorityRecoveryClosureState: CLOSURE_STATE,
          closureRecordId: CLOSURE_RECORD_ID,
          closureWitnessClass: CLOSURE_WITNESS_CLASS,
        },
        activeGate: {
          mode: ACTIVE_GATE_MODE_STARTUP,
          ready: false,
          closureRecordId: CLOSURE_RECORD_ID,
          closureWitnessClass: CLOSURE_WITNESS_CLASS,
          progress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: ACTIVE_NODE_COUNT,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            publicationEpoch: PUBLICATION_EPOCH,
            selectedMissingPublishedNodeIds: [
              MISSING_NODE_ONE,
              MISSING_NODE_TWO,
            ],
            pendingAckCount: ZERO_COUNT,
            missingPublishedCount: MISSING_COUNT,
            gateReasons: [PUBLICATION_GATE_REASON],
            prioritySpreadSatisfied: true,
            prioritySpreadGap: ZERO_COUNT,
            priorityBlockedPartitionCount: ZERO_COUNT,
            blockers: [
              ACTIVE_GATE_COVERAGE_BLOCKER,
              PUBLICATION_GATE_BLOCKER,
            ],
          },
        },
      });
      const activeGateProgress =
        publicationEvidence.priorityRecoveryObservation.activeGate.progress;

      assert.equal(
        publicationEvidence.publicationConvergence.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(
        publicationEvidence.publicationConvergence.missingPublishedNodeIds,
        [],
      );
      assert.equal(activeGateProgress.missingPublishedCount, ZERO_COUNT);
      assert.deepEqual(activeGateProgress.selectedMissingPublishedNodeIds, []);
      assert.deepEqual(activeGateProgress.gateReasons, []);
      assert.equal(
        activeGateProgress.blockers.includes(PUBLICATION_GATE_BLOCKER),
        false,
      );
      assert.equal(
        activeGateProgress.blockers.includes(ACTIVE_GATE_COVERAGE_BLOCKER),
        true,
      );
    },
  );

  it(
    'keeps current selected publication-membership deficit over stale closure ' +
      'when raw publication gate is absent',
    () => {
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_COUNT = 4;
      const ZERO_COUNT = 0;
      const PRIORITY_SPREAD_GAP = 10;
      const PUBLISHED_NODE_IDS = [
        'selected-published-node-1',
        'selected-published-node-2',
        'selected-published-node-3',
      ];
      const MISSING_NODE_IDS = [
        'selected-missing-node-current-1',
        'selected-missing-node-current-2',
      ];
      const PER_NODE_PUBLICATION_DISAGREEMENT_SET = {
        'selected-published-node-1': MISSING_NODE_IDS,
        'selected-published-node-2': MISSING_NODE_IDS,
        'selected-published-node-3': MISSING_NODE_IDS,
        'selected-missing-node-current-1': MISSING_NODE_IDS,
        'selected-missing-node-current-2': MISSING_NODE_IDS,
      };
      const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          prioritySpreadPending: false,
          recoveryProtocolState: 'steady_published',
          closureRecordId: CLOSURE_RECORD_ID,
          closureWitnessClass: CLOSURE_WITNESS_CLASS,
        },
        activeGate: {
          mode: ACTIVE_GATE_MODE_STARTUP,
          ready: false,
          closureRecordId: CLOSURE_RECORD_ID,
          closureWitnessClass: CLOSURE_WITNESS_CLASS,
          progress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: ACTIVE_NODE_COUNT,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            publicationEpoch: PUBLICATION_EPOCH,
            recoveryProtocolState:
              RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
            selectedPublishedActiveNodeIds: PUBLISHED_NODE_IDS,
            selectedPublishedActiveCount: PUBLISHED_NODE_IDS.length,
            selectedMissingPublishedNodeIds: [],
            pendingAckCount: ZERO_COUNT,
            missingPublishedCount: ZERO_COUNT,
            perNodePublicationDisagreementSet:
              PER_NODE_PUBLICATION_DISAGREEMENT_SET,
            gateReasons: [],
            prioritySpreadSatisfied: false,
            prioritySpreadGap: PRIORITY_SPREAD_GAP,
            priorityBlockedPartitionCount: 1,
            blockers: ['snapshot_coverage=4/5'],
          },
        },
      });
      const activeGateProgress =
        publicationEvidence.priorityRecoveryObservation.activeGate.progress;

      assert.equal(
        publicationEvidence.publicationConvergence.missingPublishedCount,
        MISSING_NODE_IDS.length,
      );
      assert.deepEqual(
        publicationEvidence.publicationConvergence.missingPublishedNodeIds,
        MISSING_NODE_IDS,
      );
      assert.equal(
        activeGateProgress.missingPublishedCount,
        MISSING_NODE_IDS.length,
      );
      assert.deepEqual(
        activeGateProgress.selectedMissingPublishedNodeIds,
        MISSING_NODE_IDS,
      );
    },
  );

  it(
    'does not reopen canonical publication debt when selected snapshot coverage ' +
      'misses nodes outside the authoritative published cohort',
    () => {
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=4/5';
      const PRIORITY_RECOVERY_BLOCKER =
        'priority_recovery_progress_class=eligible_but_no_operation_created';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 4;
      const SNAPSHOT_COVERAGE_COUNT = 4;
      const ZERO_COUNT = 0;
      const PRIORITY_SPREAD_GAP = 10;
      const AUTHORITATIVE_PUBLISHED_NODE_IDS = [
        '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
        '7493b0ab-a054-5fad-a91b-5e331db29304',
        '8be8d30f-4499-5eed-865c-71b4d529a67a',
      ];
      const SELECTED_MISSING_NODE_IDS = [
        '11601fe0-72d6-5853-8590-ec2881853e72',
        'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
      ];
      const PER_NODE_PUBLICATION_DISAGREEMENT_SET = {
        [AUTHORITATIVE_PUBLISHED_NODE_IDS[0]]: SELECTED_MISSING_NODE_IDS,
        [AUTHORITATIVE_PUBLISHED_NODE_IDS[1]]: SELECTED_MISSING_NODE_IDS,
        [AUTHORITATIVE_PUBLISHED_NODE_IDS[2]]: SELECTED_MISSING_NODE_IDS,
        [SELECTED_MISSING_NODE_IDS[0]]: SELECTED_MISSING_NODE_IDS,
        [SELECTED_MISSING_NODE_IDS[1]]: SELECTED_MISSING_NODE_IDS,
      };
      const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
          publishedActiveNodeIds: AUTHORITATIVE_PUBLISHED_NODE_IDS,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          prioritySpreadPending: true,
          priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
        },
        publicationConvergenceGate: {
          ready: true,
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
          requiredAckNodeIds: AUTHORITATIVE_PUBLISHED_NODE_IDS,
          acknowledgedNodeIds: AUTHORITATIVE_PUBLISHED_NODE_IDS,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: [],
          missingPublishedCount: ZERO_COUNT,
          publicationPending: false,
          prioritySpreadPending: true,
          reasonCodes: ['priority_partitions_not_spread'],
          reasons: ['priority_partitions_not_spread'],
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          missingPublishedNodeIds: SELECTED_MISSING_NODE_IDS,
          missingPublishedCount: SELECTED_MISSING_NODE_IDS.length,
          publicationPending: true,
          prioritySpreadPending: true,
          priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
          publicationConvergenceGateReasons: ['priority_partitions_not_spread'],
        },
        activeGate: {
          mode: ACTIVE_GATE_MODE_STARTUP,
          ready: false,
          progress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: ACTIVE_NODE_COUNT,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            publicationEpoch: PUBLICATION_EPOCH,
            recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
            selectedPublishedActiveNodeIds: AUTHORITATIVE_PUBLISHED_NODE_IDS,
            selectedPublishedActiveCount: AUTHORITATIVE_PUBLISHED_NODE_IDS.length,
            selectedMissingPublishedNodeIds: SELECTED_MISSING_NODE_IDS,
            pendingAckCount: ZERO_COUNT,
            missingPublishedCount: SELECTED_MISSING_NODE_IDS.length,
            perNodePublicationDisagreementSet:
              PER_NODE_PUBLICATION_DISAGREEMENT_SET,
            gateReasons: [
              'priority_partitions_not_spread',
              'publication_missing_active_node=' + SELECTED_MISSING_NODE_IDS[0],
              'publication_missing_active_node=' + SELECTED_MISSING_NODE_IDS[1],
            ],
            prioritySpreadSatisfied: false,
            prioritySpreadGap: PRIORITY_SPREAD_GAP,
            priorityBlockedPartitionCount: 2,
            priorityRecoveryProgressClasses: {
              unresolvedClassIds: ['eligible_but_no_operation_created'],
              unresolvedClassCount: 1,
              unresolvedSemanticStateIds: ['needs_operation'],
              unresolvedSemanticStateCount: 1,
              blockedPartitionIds: [
                'sql_transaction_participants-p1',
                'sql_write_operations-p1',
              ],
              blockedPartitionCount: 2,
            },
            blockers: [
              ACTIVE_GATE_COVERAGE_BLOCKER,
              PRIORITY_RECOVERY_BLOCKER,
            ],
          },
        },
      });
      const activeGateProgress =
        publicationEvidence.priorityRecoveryObservation.activeGate.progress;

      assert.equal(
        publicationEvidence.publicationConvergence.publicationPending,
        false,
      );
      assert.equal(
        publicationEvidence.publicationConvergence.missingPublishedCount,
        0,
      );
      assert.deepEqual(
        publicationEvidence.publicationConvergence.missingPublishedNodeIds,
        [],
      );
      assert.equal(activeGateProgress.missingPublishedCount, 0);
      assert.deepEqual(
        activeGateProgress.selectedMissingPublishedNodeIds,
        SELECTED_MISSING_NODE_IDS,
      );
      assert.deepEqual(
        activeGateProgress.gateReasons,
        ['priority_partitions_not_spread'],
      );
    },
  );

  registerFailureBundlePublicationClosureTailTests({
    it,
    assert,
    UTF8_ENCODING,
    state,
  });
}
