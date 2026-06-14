export function registerFailureBundleMissingActiveDebtOverCoordinationMismatchTests(context) {
  const {
    it,
    assert,
    CONTROL_PLANE_READINESS_REASON,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PROGRESS_OWNER,
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_WAIT_MODE,
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
    readFile,
    resolve,
    ROOT_CAUSE_CLASS_TOPOLOGY,
    STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
    STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
  } = context;
  let tempDir;
  let reportPath;
  const refreshState = () => {
    tempDir = context.state.tempDir;
    reportPath = context.state.reportPath;
  };

  it(
    'keeps 183911Z missing-active debt canonical over coordination-mismatch workflow progress',
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const ACTIVE_GATE_STALLED_REASON =
        'active_wait_no_progress_coordinator_cycles=4';
      const ACTIVE_GATE_ERROR =
        'Not all nodes reached ACTIVE state within 120000ms';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=3/5';
      const ACTIVE_GATE_BEST_COVERAGE_BLOCKER = 'snapshot_coverage=4/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=1';
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_NO_TRANSITIONS_BLOCKER =
        'priority_recovery_progress_class=' +
        PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS;
      const PRIORITY_RECOVERY_EXCLUDED_BLOCKER =
        'priority_recovery_progress_class=' +
        PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED;
      const SELECTED_SNAPSHOT_NODE_ID =
        '35a891b8-c1a0-5064-9c6e-2acfba61c2a7';
      const SELECTED_SNAPSHOT_REACHABLE_BY = 'admin_health';
      const EMPTY_REACHABILITY_ERROR = '';
      const MISSING_NODE_ONE = '11601fe0-72d6-5853-8590-ec2881853e72';
      const MISSING_NODE_TWO = SELECTED_SNAPSHOT_NODE_ID;
      const MISSING_NODE_THREE = '8be8d30f-4499-5eed-865c-71b4d529a67a';
      const MISSING_NODE_ONE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_ONE;
      const MISSING_NODE_TWO_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_TWO;
      const MISSING_NODE_THREE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_THREE;
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_transaction_participants-p1';
      const PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID =
        'sql_write_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID =
        '834b0fe6-bf43-4f4e-8dec-2890cd5843f2';
      const PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID =
        '2b6d5fd0-3cea-406f-bd84-a580f41098a1';
      const PRIORITY_RECOVERY_CORRELATION_KEY =
        PRIORITY_RECOVERY_PARTITION_ID + '|2|' +
        PRIORITY_RECOVERY_OPERATION_ID;
      const PRIORITY_RECOVERY_SUPPORTING_CORRELATION_KEY =
        PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID + '|2|' +
        PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID;
      const PRIORITY_RECOVERY_OWNER_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER;
      const PRIORITY_RECOVERY_BOUNDARY_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS;
      const PRIORITY_RECOVERY_WAIT_MODE_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN;
      const PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS;
      const MISSING_PUBLISHED_SIGNAL =
        'missingPublishedNodeIds=' + MISSING_NODE_ONE + '|' +
        MISSING_NODE_TWO + '|' + MISSING_NODE_THREE;
      const BENCHMARK_GATE_SKIPPED = 'skipped';
      const PUBLICATION_EPOCH = 2;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 4;
      const INACTIVE_NODE_COUNT = 1;
      const SNAPSHOT_COVERAGE_COUNT = 3;
      const BEST_SNAPSHOT_COVERAGE_COUNT = 4;
      const PUBLISHED_ACTIVE_COUNT = 2;
      const READY_DISTINCT_NODE_COUNT = 1;
      const REQUIRED_DISTINCT_NODE_COUNT = 2;
      const PRIORITY_SPREAD_GAP = 5;
      const PRIORITY_RECOVERY_STEP_AGE_MS = 30792;
      const PRIORITY_RECOVERY_SUPPORTING_STEP_AGE_MS = 6956;
      const PRIORITY_RECOVERY_STEP_TIMEOUT_MS = 0;
      const PRIORITY_RECOVERY_SUPPORTING_STEP_TIMEOUT_MS = 30000;
      const PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS = 1778006461619;
      const PRIORITY_RECOVERY_SUPPORTING_LAST_PROGRESS_AT_MS =
        1778006485455;
      const PRIORITY_RECOVERY_CAPTURED_AT_MS = 1778006492411;
      const ACTIVE_GATE_ATTEMPTS = 12;
      const ACTIVE_GATE_ELAPSED_MS = 121019;
      const ACTIVE_GATE_ATTEMPTS_SINCE_PROGRESS = 4;
      const ONE_COUNT = 1;
      const TWO_COUNT = 2;
      const THREE_COUNT = 3;
      const FIVE_COUNT = 5;
      const ZERO_COUNT = 0;
      const PUBLISHED_NODE_ONE = '7493b0ab-a054-5fad-a91b-5e331db29304';
      const PUBLISHED_NODE_TWO = 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58';
      const MISSING_NODE_IDS = [
        MISSING_NODE_ONE,
        MISSING_NODE_TWO,
        MISSING_NODE_THREE,
      ];
      const PUBLISHED_NODE_IDS = [
        PUBLISHED_NODE_ONE,
        PUBLISHED_NODE_TWO,
      ];
      const CURRENT_PROGRESS_CLASS_IDS = [
        PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
        PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
      ];
      const CURRENT_BLOCKED_PARTITION_IDS = [
        PRIORITY_RECOVERY_PARTITION_ID,
        PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID,
      ];
      const CURRENT_SEMANTIC_STATE_IDS = [
        PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
      ];
      const CURRENT_PROGRESS_CLASSES = {
        unresolvedClassIds: CURRENT_PROGRESS_CLASS_IDS,
        unresolvedClassCount: TWO_COUNT,
        unresolvedSemanticStateIds: CURRENT_SEMANTIC_STATE_IDS,
        unresolvedSemanticStateCount: ONE_COUNT,
        blockedPartitionIds: CURRENT_BLOCKED_PARTITION_IDS,
        blockedPartitionCount: TWO_COUNT,
        partitionIdsByClass: {
          [PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS]: [
            PRIORITY_RECOVERY_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED]: [
            PRIORITY_RECOVERY_PARTITION_ID,
            PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID,
          ],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH]: [
            PRIORITY_RECOVERY_PARTITION_ID,
            PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE
            .SPREAD_SATISFIED_IN_FLIGHT]: [
            'control_plane_publications-p1',
            'replica_operations-p1',
            'sql_transactions-p1',
          ],
        },
      };
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: ACTIVE_GATE_ERROR,
        duration: ACTIVE_GATE_ELAPSED_MS,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PRIORITY_SPREAD_REASON,
              reasonCounts: {
                [PRIORITY_SPREAD_REASON]: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                publishedActiveNodeIds: PUBLISHED_NODE_IDS,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: MISSING_NODE_IDS,
                missingPublishedCount: THREE_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [
                  PRIORITY_SPREAD_REASON,
                  CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING,
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: FIVE_COUNT,
                  largestSpreadGap: PRIORITY_SPREAD_GAP,
                  totalSpreadGap: PRIORITY_SPREAD_GAP,
                },
              },
              publicationConvergenceGate: {
                ready: false,
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                publishedActiveNodeIds: PUBLISHED_NODE_IDS,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: MISSING_NODE_IDS,
                missingPublishedCount: THREE_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                reasons: [
                  CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING,
                  PRIORITY_SPREAD_REASON,
                ],
                reasonCodes: [
                  CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING,
                  PRIORITY_SPREAD_REASON,
                ],
              },
              priorityRecoveryDecisionSnapshots: {
                capturedAt: PRIORITY_RECOVERY_CAPTURED_AT_MS,
                publicationEpoch: PUBLICATION_EPOCH,
                snapshots: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  epoch: PUBLICATION_EPOCH,
                  correlationKey: PRIORITY_RECOVERY_CORRELATION_KEY,
                  operationId: PRIORITY_RECOVERY_OPERATION_ID,
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
                  blockerReasons: CURRENT_PROGRESS_CLASS_IDS,
                  planner: {
                    spreadGap: ONE_COUNT,
                    readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  },
                  progress: {
                    contractState: 'pending',
                    nextAction: 'wait',
                    currentOwner:
                      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                    blockingBoundary:
                      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                    waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                    nextRequiredAction:
                      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                        .WAIT_FOR_OPERATION_PROGRESS,
                    workflowProgressPhaseId:
                      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
                    lastProgressAtMs: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                    stepAgeMs: PRIORITY_RECOVERY_STEP_AGE_MS,
                    stepTimeoutMs: PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
                  },
                  actuation: {
                    state:
                      PRIORITY_RECOVERY_ACTUATION_STATE
                        .DISPATCHED_WAITING_PROGRESS,
                    owner:
                      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                    latestOperationId: PRIORITY_RECOVERY_OPERATION_ID,
                    workflowProgressPhaseId:
                      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
                    lastProgressAtMs: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                    stepAgeMs: PRIORITY_RECOVERY_STEP_AGE_MS,
                    stepTimeoutMs: PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
                  },
                  completion: {
                    state: 'blocked',
                    reasonCode: 'active_operation_still_blocks_spread',
                    blocked: true,
                  },
                  observation: {
                    visibilityState: 'cache_visible',
                    workflowState: 'remove_phase',
                    convergenceState: 'spread_gap',
                    provenance: {
                      capturedAt: PRIORITY_RECOVERY_CAPTURED_AT_MS,
                    },
                  },
                  conditions: {
                    visibilityState: 'cache_visible',
                    authoritativeOperationReadDeferred: false,
                    blockerReasonCodes: CURRENT_PROGRESS_CLASS_IDS,
                    admissionBlockingReasonCodes: [],
                    pressure: {
                      pressureState: 'none',
                      blocksCriticalRecoveryActuation: false,
                    },
                    latestOperationWorkflowStep: 'ACTIVE',
                    latestOperationStatus: 'active',
                  },
                  admission: {
                    workflowId: null,
                    workflowType: null,
                    transitionState: null,
                    decisionType: null,
                    decisionDimension: null,
                    admissionDecisionAt: null,
                    eligibleNodeIds: [],
                    ineligibleNodes: [],
                    blockingReasons: [],
                    effectiveEligibleNodeIds: PUBLISHED_NODE_IDS,
                    effectiveEligibleNodeCount: PUBLISHED_ACTIVE_COUNT,
                    eligibilityEvidenceSource: 'publication_membership',
                    eligibilityCohortComplete: true,
                    decisionMissing: false,
                    ineligibleNodeIds: [],
                    recoveryEligibleExcludedNodeIds: [],
                  },
                  spreadCompletion: {
                    satisfied: false,
                    reasonCode: 'active_operation_still_blocks_spread',
                    satisfyingOperationIds: [],
                    satisfyingOperationCount: ZERO_COUNT,
                    blockingOperationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                    blockingOperationCount: ONE_COUNT,
                  },
                  coordinator: {
                    operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                    operationCount: ONE_COUNT,
                    serialWaitOperationIds: [
                      PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID,
                    ],
                    serialWaitPartitionIds: [
                      PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID,
                    ],
                    operation: {
                      operationId: PRIORITY_RECOVERY_OPERATION_ID,
                      partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                      tableName: 'sql_transaction_participants',
                      type: 'REPLACE',
                      status: 'active',
                      workflowStep: 'ACTIVE',
                      sourceNodeId: PUBLISHED_NODE_ONE,
                      targetNodeId: MISSING_NODE_ONE,
                      replicaId: 'sql_transaction_participants-p1-r4',
                      createdAtMs: 1778006441564,
                      updatedAtMs: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                      completedAtMs: null,
                      ageMs: PRIORITY_RECOVERY_STEP_AGE_MS,
                      stepTimeoutMs: PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
                      timelineLength: ZERO_COUNT,
                      timelineStepCount: ZERO_COUNT,
                      latestTimelineStep: null,
                      latestTimelineStatus: null,
                      latestTimelineInFlight: false,
                      targetVisibilityState: 'active_operational',
                      targetServiceProgressAtMs: 1778006460967,
                    },
                  },
                  publication: {
                    publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                    publishedActiveNodeIds: PUBLISHED_NODE_IDS,
                    projectedServingNodeIds: [],
                    locallyEligibleNodeIds: [],
                    concreteEligibleNodeIds: PUBLISHED_NODE_IDS,
                    recoveryActiveNodeIds: PUBLISHED_NODE_IDS,
                    recoveryActiveNodeSource: 'published_membership',
                    missingPublishedRecoveryActiveNodeIds: [],
                    missingPublishedEligibleNodeIds: [],
                    pendingAckNodeIds: [],
                    inclusionReasonsByNodeId: {},
                    exclusionReasonsByNodeId: {},
                  },
                }, {
                  partitionId: PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID,
                  epoch: PUBLICATION_EPOCH,
                  correlationKey: PRIORITY_RECOVERY_SUPPORTING_CORRELATION_KEY,
                  operationId: PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID,
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
                  blockerReasons: [
                    PRIORITY_RECOVERY_BLOCKER_REASON
                      .RECOVERY_ELIGIBLE_EXCLUDED,
                  ],
                  planner: {
                    spreadGap: ONE_COUNT,
                    readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  },
                  progress: {
                    contractState: 'pending',
                    nextAction: 'wait',
                    currentOwner:
                      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                    blockingBoundary:
                      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                    waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                    nextRequiredAction:
                      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                        .WAIT_FOR_OPERATION_PROGRESS,
                    workflowProgressPhaseId:
                      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE
                        .DISPATCH_PENDING,
                    lastProgressAtMs:
                      PRIORITY_RECOVERY_SUPPORTING_LAST_PROGRESS_AT_MS,
                    stepAgeMs: PRIORITY_RECOVERY_SUPPORTING_STEP_AGE_MS,
                    stepTimeoutMs:
                      PRIORITY_RECOVERY_SUPPORTING_STEP_TIMEOUT_MS,
                  },
                  actuation: {
                    state:
                      PRIORITY_RECOVERY_ACTUATION_STATE
                        .DISPATCHED_WAITING_PROGRESS,
                    owner:
                      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                    latestOperationId:
                      PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID,
                    workflowProgressPhaseId:
                      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE
                        .DISPATCH_PENDING,
                    lastProgressAtMs:
                      PRIORITY_RECOVERY_SUPPORTING_LAST_PROGRESS_AT_MS,
                    stepAgeMs: PRIORITY_RECOVERY_SUPPORTING_STEP_AGE_MS,
                    stepTimeoutMs:
                      PRIORITY_RECOVERY_SUPPORTING_STEP_TIMEOUT_MS,
                  },
                  completion: {
                    state: 'blocked',
                    reasonCode: 'active_operation_still_blocks_spread',
                    blocked: true,
                  },
                  observation: {
                    visibilityState: 'cache_visible',
                    workflowState: 'in_flight',
                    convergenceState: 'spread_gap',
                    provenance: {
                      capturedAt: PRIORITY_RECOVERY_CAPTURED_AT_MS,
                    },
                  },
                  conditions: {
                    visibilityState: 'cache_visible',
                    authoritativeOperationReadDeferred: false,
                    blockerReasonCodes: [
                      PRIORITY_RECOVERY_BLOCKER_REASON
                        .RECOVERY_ELIGIBLE_EXCLUDED,
                    ],
                    admissionBlockingReasonCodes: [],
                    pressure: {
                      pressureState: 'none',
                      blocksCriticalRecoveryActuation: false,
                    },
                    latestOperationWorkflowStep: 'SENDING',
                    latestOperationStatus: 'pending',
                  },
                  admission: {
                    workflowId: null,
                    workflowType: null,
                    transitionState: null,
                    decisionType: null,
                    decisionDimension: null,
                    admissionDecisionAt: null,
                    eligibleNodeIds: [],
                    ineligibleNodes: [],
                    blockingReasons: [],
                    effectiveEligibleNodeIds: PUBLISHED_NODE_IDS,
                    effectiveEligibleNodeCount: PUBLISHED_ACTIVE_COUNT,
                    eligibilityEvidenceSource: 'publication_membership',
                    eligibilityCohortComplete: true,
                    decisionMissing: false,
                    ineligibleNodeIds: [],
                    recoveryEligibleExcludedNodeIds: [],
                  },
                  spreadCompletion: {
                    satisfied: false,
                    reasonCode: 'active_operation_still_blocks_spread',
                    satisfyingOperationIds: [],
                    satisfyingOperationCount: ZERO_COUNT,
                    blockingOperationIds: [
                      PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID,
                    ],
                    blockingOperationCount: ONE_COUNT,
                  },
                  coordinator: {
                    operationIds: [PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID],
                    operationCount: ONE_COUNT,
                    serialWaitOperationIds: [],
                    serialWaitPartitionIds: [],
                    operation: {
                      operationId: PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID,
                      partitionId: PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID,
                      tableName: 'sql_write_operations',
                      type: 'REPLACE',
                      status: 'pending',
                      workflowStep: 'SENDING',
                      sourceNodeId: PUBLISHED_NODE_ONE,
                      targetNodeId: MISSING_NODE_ONE,
                      replicaId: 'sql_write_operations-p1-r4',
                      createdAtMs: 1778006460313,
                      updatedAtMs: 1778006471167,
                      completedAtMs: null,
                      ageMs: 21244,
                      stepTimeoutMs:
                        PRIORITY_RECOVERY_SUPPORTING_STEP_TIMEOUT_MS,
                      timelineLength: ZERO_COUNT,
                      timelineStepCount: ZERO_COUNT,
                      latestTimelineStep: null,
                      latestTimelineStatus: null,
                      latestTimelineInFlight: false,
                      targetVisibilityState: 'non_active',
                      targetServiceProgressAtMs:
                        PRIORITY_RECOVERY_SUPPORTING_LAST_PROGRESS_AT_MS,
                    },
                  },
                  publication: {
                    publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                    publishedActiveNodeIds: PUBLISHED_NODE_IDS,
                    projectedServingNodeIds: [],
                    locallyEligibleNodeIds: [],
                    concreteEligibleNodeIds: PUBLISHED_NODE_IDS,
                    recoveryActiveNodeIds: PUBLISHED_NODE_IDS,
                    recoveryActiveNodeSource: 'published_membership',
                    missingPublishedRecoveryActiveNodeIds: [],
                    missingPublishedEligibleNodeIds: [],
                    pendingAckNodeIds: [],
                    inclusionReasonsByNodeId: {},
                    exclusionReasonsByNodeId: {},
                  },
                }],
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                attempts: ACTIVE_GATE_ATTEMPTS,
                elapsedMs: ACTIVE_GATE_ELAPSED_MS,
                attemptsSinceProgress: ACTIVE_GATE_ATTEMPTS_SINCE_PROGRESS,
                coordinatorCyclesSinceProgress:
                  ACTIVE_GATE_ATTEMPTS_SINCE_PROGRESS,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                stalledReason: ACTIVE_GATE_STALLED_REASON,
                readinessDelay: {
                  timedOut: false,
                  cause: 'none',
                  source: null,
                  recoverability: null,
                  error: null,
                },
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                  selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                  selectedSnapshotAdminReady: true,
                  selectedSnapshotReachableBy: SELECTED_SNAPSHOT_REACHABLE_BY,
                  selectedSnapshotReachabilityError:
                    EMPTY_REACHABILITY_ERROR,
                  selectedPublishedActiveNodeIds: PUBLISHED_NODE_IDS,
                  selectedPublishedActiveCount: PUBLISHED_ACTIVE_COUNT,
                  selectedMissingPublishedNodeIds: MISSING_NODE_IDS,
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: THREE_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
                  priorityBlockedPartitionCount: TWO_COUNT,
                  priorityRecoveryProgressClasses: CURRENT_PROGRESS_CLASSES,
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    PRIORITY_RECOVERY_NO_TRANSITIONS_BLOCKER,
                    PRIORITY_RECOVERY_EXCLUDED_BLOCKER,
                  ],
                },
                bestProgress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: BEST_SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                  selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                  selectedSnapshotAdminReady: true,
                  selectedSnapshotReachableBy: SELECTED_SNAPSHOT_REACHABLE_BY,
                  selectedSnapshotReachabilityError:
                    EMPTY_REACHABILITY_ERROR,
                  selectedPublishedActiveNodeIds: PUBLISHED_NODE_IDS,
                  selectedPublishedActiveCount: PUBLISHED_ACTIVE_COUNT,
                  selectedMissingPublishedNodeIds: MISSING_NODE_IDS,
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: THREE_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
                  priorityBlockedPartitionCount: TWO_COUNT,
                  priorityRecoveryProgressClasses: CURRENT_PROGRESS_CLASSES,
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_BEST_COVERAGE_BLOCKER,
                    PRIORITY_RECOVERY_NO_TRANSITIONS_BLOCKER,
                    PRIORITY_RECOVERY_EXCLUDED_BLOCKER,
                  ],
                },
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
        benchmarkRegressionGate: {status: BENCHMARK_GATE_SKIPPED},
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
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const activeGateProgress = publicationConvergence.activeGate.progress;
      const progressSummary =
        publicationConvergence.priorityRecoveryProgressSummary;
      const dominantWitness = progressSummary.dominantWitness;
      const partitionWitnesses =
        publicationConvergence.priorityRecoveryPartitionWitnesses;
      const priorityRecoveryWitness = partitionWitnesses[ZERO_COUNT];
      const supportingWitness = partitionWitnesses[ONE_COUNT];
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.summary.readinessFailure.classCode,
        'no_progress_terminal',
      );
      assert.equal(
        publicationConvergence.publicationStatus,
        PUBLICATION_STATUS_PUBLISHED,
      );
      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.equal(publicationConvergence.missingPublishedCount, THREE_COUNT);
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        MISSING_NODE_IDS,
      );
      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(
        publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_PUBLICATION_PENDING,
      );
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          PRIORITY_SPREAD_REASON,
        ),
        true,
      );
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          ACTIVE_GATE_COVERAGE_BLOCKER,
        ),
        true,
      );
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          MISSING_NODE_ONE_REASON,
        ),
        true,
      );
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          MISSING_NODE_TWO_REASON,
        ),
        true,
      );
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          MISSING_NODE_THREE_REASON,
        ),
        true,
      );
      assert.equal(
        activeGateProgress.selectedSnapshotNodeId,
        SELECTED_SNAPSHOT_NODE_ID,
      );
      assert.equal(
        activeGateProgress.selectedSnapshotReachabilityError,
        EMPTY_REACHABILITY_ERROR,
      );
      assert.equal(
        activeGateProgress.selectedPublishedActiveCount,
        PUBLISHED_ACTIVE_COUNT,
      );
      assert.equal(
        activeGateProgress.prioritySpreadGap,
        PRIORITY_SPREAD_GAP,
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoveryProgressClassIds,
        CURRENT_PROGRESS_CLASS_IDS,
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoverySemanticStateIds,
        CURRENT_SEMANTIC_STATE_IDS,
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoveryBlockedPartitionIds,
        CURRENT_BLOCKED_PARTITION_IDS,
      );
      assert.equal(
        dominantWitness.partitionId,
        PRIORITY_RECOVERY_PARTITION_ID,
      );
      assert.equal(
        dominantWitness.semanticStateId,
        PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
      );
      assert.deepEqual(
        dominantWitness.blockerReasonCodes,
        CURRENT_PROGRESS_CLASS_IDS,
      );
      assert.equal(
        dominantWitness.actuationState,
        PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      );
      assert.equal(
        dominantWitness.workflowProgressPhaseId,
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
      );
      assert.equal(
        dominantWitness.currentOwner,
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      );
      assert.equal(
        dominantWitness.blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      );
      assert.equal(
        dominantWitness.waitMode,
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      );
      assert.equal(
        dominantWitness.nextRequiredAction,
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      );
      assert.deepEqual(
        dominantWitness.operationIds,
        [PRIORITY_RECOVERY_OPERATION_ID],
      );
      assert.deepEqual(
        dominantWitness.serialWaitPartitionIds,
        [PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID],
      );
      assert.deepEqual(
        dominantWitness.eligibleNodeIds,
        PUBLISHED_NODE_IDS,
      );
      assert.equal(
        priorityRecoveryWitness.partitionId,
        PRIORITY_RECOVERY_PARTITION_ID,
      );
      assert.equal(
        supportingWitness.partitionId,
        PRIORITY_RECOVERY_SUPPORTING_PARTITION_ID,
      );
      assert.equal(
        supportingWitness.semanticStateId,
        PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
      );
      assert.deepEqual(
        supportingWitness.operationIds,
        [PRIORITY_RECOVERY_SUPPORTING_OPERATION_ID],
      );
      assert.equal(
        supportingWitness.workflowProgressPhaseId,
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      );
      assert.equal(
        supportingWitness.latestOperationWorkflowStep,
        'SENDING',
      );
      assert.equal(
        supportingWitness.latestOperationStatus,
        'pending',
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        MISSING_NODE_ONE_REASON,
      );
      assert.notEqual(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.ok(failureClassification.signals.includes(
        'missingPublishedCount=' + THREE_COUNT,
      ));
      assert.ok(
        failureClassification.signals.includes(MISSING_PUBLISHED_SIGNAL),
      );
      assert.ok(failureClassification.signals.includes(
        'recoveryProtocolState=' + RECOVERY_PROTOCOL_PUBLICATION_PENDING,
      ));
      assert.ok(
        failureClassification.signals.includes(
          'priorityRecoveryProgressClassCount=' + TWO_COUNT,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(PRIORITY_RECOVERY_OWNER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(PRIORITY_RECOVERY_BOUNDARY_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(PRIORITY_RECOVERY_WAIT_MODE_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.failover.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.restart_recovery.blockers
          .includes(STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE),
        true,
      );
      assert.equal(
        triageSummary.summary.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        MISSING_NODE_ONE_REASON,
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.missingPublishedNodeIds,
        MISSING_NODE_IDS,
      );
      assert.ok(
        triageSummary.summary.failureClassSignals.includes(
          PRIORITY_RECOVERY_OWNER_SIGNAL,
        ),
      );
      assert.ok(
        triageSummary.summary.failureClassSignals.includes(
          PRIORITY_RECOVERY_BOUNDARY_SIGNAL,
        ),
      );
      assert.ok(
        triageSummary.summary.failureClassSignals.includes(
          PRIORITY_RECOVERY_WAIT_MODE_SIGNAL,
        ),
      );
      assert.ok(
        triageSummary.summary.failureClassSignals.includes(
          PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL,
        ),
      );
    },
  );
}
