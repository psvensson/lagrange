import * as serialWaitFixtureConstants from
  './priority-recovery-snapshot-supplemental-serial-wait-fixture-constants.js';

function registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitPreserveRestorationTests(
  context,
) {
  const {
    buildPriorityRecoveryObservationSnapshot,
    buildTrackedPriorityRecoveryDecisionSnapshots,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE_NO_ACTION_NEEDED,
    PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
    PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED,
    PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
    PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
    PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
    PRIORITY_RECOVERY_REASON_PLANNER_READY,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
    PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_ACTIVE,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
    PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;
  const {
    STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
    STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
    STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
    STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
    STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP,
    STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME,
    MIXED_SUMMARY_SERIAL_WAIT_SOURCE_TABLE_NAME,
    SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_UNSATISFIED,
    SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
    SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_REPLACE_REMOVE_DISPATCH,
    RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_TEST_NAME,
    RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_MESSAGE,
    RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_PROGRESS_MESSAGE,
    RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
    RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
    RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
    RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
    RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
  } = serialWaitFixtureConstants;

  test(RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots =
      buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
        },
        snapshots: [{
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: null,
          correlationKey:
            `${PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|operation_unknown`,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
          ],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
            reasonCode: SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_UNSATISFIED,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: true,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
            provenance: {
              capturedAt: RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
              workflowSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
              timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
              semanticSource:
                STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
            },
          },
          conditions: {
            visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            authoritativeOperationReadDeferred: false,
            blockerReasonCodes: [
              PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
            ],
            admissionBlockingReasonCodes: [],
            pressure: {
              pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
              blocksCriticalRecoveryActuation: false,
            },
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs: RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
              STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
            operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepAgeMs: RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            lastProgressAtMs: RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount: PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            ready: false,
            reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            effectiveEligibleNodeCount:
              PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
            ineligibleNodes: [],
            ineligibleNodeIds: [],
            recoveryEligibleExcludedNodeIds: [],
          },
          spreadCompletion: {
            satisfied: false,
            reasonCode: SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_UNSATISFIED,
            satisfyingOperationIds: [],
            satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            blockingOperationIds: [],
            blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            operationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
            operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
            serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            serialWaitOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            serialWaitPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
          },
        }, {
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
          correlationKey:
            `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
            `${RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID}`,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
            reasonCode:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: true,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
            provenance: {
              capturedAt: RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
              workflowSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              timelineSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              semanticSource:
                STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
            },
          },
          conditions: {
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            authoritativeOperationReadDeferred: false,
            blockerReasonCodes: [],
            admissionBlockingReasonCodes: [],
            pressure: {
              pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
              blocksCriticalRecoveryActuation: false,
            },
            latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            stepAgeMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS -
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state: PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            latestOperationId: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            stepAgeMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS -
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            lastProgressAtMs: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount: PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            ready: false,
            reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            effectiveEligibleNodeCount:
              PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
            ineligibleNodes: [],
            ineligibleNodeIds: [],
            recoveryEligibleExcludedNodeIds: [],
          },
          spreadCompletion: {
            satisfied: false,
            reasonCode:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
            satisfyingOperationIds: [],
            satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            blockingOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            blockingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            operationIds: [RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID],
            operation: {
              operationId: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              tableName: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_TABLE_NAME,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
              sourceNodeId: PRIORITY_RECOVERY_NODE_ID_B,
              targetNodeId: PRIORITY_RECOVERY_NODE_ID_A,
              replicaId: PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
              createdAtMs: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              updatedAtMs: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              completedAtMs: PRIORITY_RECOVERY_EMPTY_COUNT,
              ageMs:
                RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS -
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              timelineLength: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT + 1,
              timelineStepCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
              latestTimelineStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
              latestTimelineStatus: PRIORITY_RECOVERY_STATUS_PENDING,
              latestTimelineInFlight: true,
              targetVisibilityState: 'absent',
            },
            serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
            serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
          correlationKey:
            `${PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
            `${RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID}`,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED,
          blockerReasons: [],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.READY,
            reasonCode: PRIORITY_RECOVERY_REASON_PLANNER_READY,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: false,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
            provenance: {
              capturedAt: RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
              workflowSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              timelineSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              semanticSource:
                STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
            },
          },
          conditions: {
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            authoritativeOperationReadDeferred: false,
            blockerReasonCodes: [],
            admissionBlockingReasonCodes: [],
            pressure: {
              pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
              blocksCriticalRecoveryActuation: false,
            },
            latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_ACTIVE,
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
            workflowProgressPhaseId: PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            stepAgeMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS -
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
            nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
            lastProgressAtMs: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: null,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId: PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
            state: PRIORITY_RECOVERY_ACTUATION_STATE_NO_ACTION_NEEDED,
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            latestOperationId: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
            stepAgeMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS -
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: null,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
            ready: true,
            reasons: [],
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            effectiveEligibleNodeCount:
              PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
            ineligibleNodes: [],
            ineligibleNodeIds: [],
            recoveryEligibleExcludedNodeIds: [],
          },
          spreadCompletion: {
            satisfied: true,
            reasonCode:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_REPLACE_REMOVE_DISPATCH,
            satisfyingOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
            ],
            satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            blockingOperationIds: [],
            blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            operationIds: [RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID],
            operation: {
              operationId: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              partitionId:
                PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
              tableName: STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_ACTIVE,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
              sourceNodeId: PRIORITY_RECOVERY_NODE_ID_B,
              targetNodeId: PRIORITY_RECOVERY_NODE_ID_A,
              replicaId:
                PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
              createdAtMs: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              updatedAtMs: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              completedAtMs: PRIORITY_RECOVERY_EMPTY_COUNT,
              ageMs:
                RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS -
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              timelineLength: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT + 1,
              timelineStepCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
              latestTimelineStep: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
              latestTimelineStatus: PRIORITY_RECOVERY_STATUS_ACTIVE,
              latestTimelineInFlight: true,
              targetVisibilityState:
                PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
            },
            serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            serialWaitOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            serialWaitPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
          },
        }],
      });

    const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) =>
        snapshot.partitionId === PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
      ],
      [PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID],
      RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
      RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_MESSAGE,
    );
    t.match(
      trackedTargetSnapshot,
      {
        coordinator: {
          serialWaitOperationIds: [
            RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
          ],
          serialWaitPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        },
        progress: {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
      },
      RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_PROGRESS_MESSAGE,
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
    });
    const targetWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses.find(
        (snapshot) =>
          snapshot.partitionId ===
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );

    t.same(
      targetWitness?.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
      RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_MESSAGE,
    );
    t.match(
      targetWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        serialWaitOperationIds: [
          RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
        ],
        serialWaitPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
      },
      RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_PROGRESS_MESSAGE,
    );
  });

  test(
    'tracked priority recovery decision snapshots keep owner advancement ' +
      'out of retained serial-wait restoration',
    async (t) => {
      const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
        },
        snapshots: [{
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
            reasonCode:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
          },
          progress: {
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            lastProgressAtMs: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          },
          actuation: {
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state: PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            latestOperationId: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            lastProgressAtMs: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            operationIds: [RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID],
            operation: {
              operationId: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
            },
            serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
            serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
            reasonCode:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
          },
          progress: {
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          },
          actuation: {
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state: PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            latestOperationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            operationIds: [
              PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
            ],
            operation: {
              operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
            },
            serialWaitOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            serialWaitPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
          },
        }],
      });

      const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
        (snapshot) =>
          snapshot.partitionId ===
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );

      t.same(
        trackedTargetSnapshot?.blockerReasons,
        [],
        'owner advancement should not restore retained serial-wait blockers',
      );
      t.equal(
        trackedTargetSnapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        'owner advancement should remain in-flight recovery',
      );
      t.same(
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
        ],
        [],
        'summary blockers should not restore serial wait over owner advancement',
      );
      t.same(
        trackedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION
        ],
        [],
        'summary semantic state should not restore needs-operation state',
      );
    },
  );

  test(
    'tracked priority recovery decision snapshots keep workflow-progress ' +
      'waits out of retained serial-wait restoration',
    async (t) => {
      const SOURCE_OPERATION_ID = 'op-workflow-progress-wait-source';
      const TARGET_OPERATION_ID = 'op-workflow-progress-wait-target';
      const SOURCE_PROGRESS_AT_MS = 7100;
      const TARGET_PROGRESS_AT_MS = 7200;
      const SOURCE_REPLICA_ID = 'sql_transactions-p1-r4';
      const TARGET_REPLICA_ID = 'sql_write_operations-p1-r4';
      const SERIAL_WAIT_RESTORE_MESSAGE =
        'workflow-progress waits with active operation evidence should not ' +
        'be promoted back to synthetic serial-wait blockers';
      const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
        },
        snapshots: [{
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: SOURCE_OPERATION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          },
          progress: {
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            lastProgressAtMs: SOURCE_PROGRESS_AT_MS,
          },
          actuation: {
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            latestOperationId: SOURCE_OPERATION_ID,
            lastProgressAtMs: SOURCE_PROGRESS_AT_MS,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            operationIds: [SOURCE_OPERATION_ID],
            operation: {
              operationId: SOURCE_OPERATION_ID,
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
              replicaId: SOURCE_REPLICA_ID,
            },
            serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
            serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: TARGET_OPERATION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          },
          progress: {
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            lastProgressAtMs: TARGET_PROGRESS_AT_MS,
          },
          actuation: {
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            latestOperationId: TARGET_OPERATION_ID,
            lastProgressAtMs: TARGET_PROGRESS_AT_MS,
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            operationIds: [TARGET_OPERATION_ID],
            operation: {
              operationId: TARGET_OPERATION_ID,
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
              replicaId: TARGET_REPLICA_ID,
            },
            serialWaitOperationIds: [SOURCE_OPERATION_ID],
            serialWaitPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
          },
        }],
      });

      const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
        (snapshot) =>
          snapshot.partitionId ===
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );

      t.same(
        trackedTargetSnapshot?.blockerReasons,
        [],
        SERIAL_WAIT_RESTORE_MESSAGE,
      );
      t.equal(
        trackedTargetSnapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        SERIAL_WAIT_RESTORE_MESSAGE,
      );
      t.same(
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
        ],
        [],
        SERIAL_WAIT_RESTORE_MESSAGE,
      );
      t.same(
        trackedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION
        ],
        [],
        SERIAL_WAIT_RESTORE_MESSAGE,
      );

      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
      });
      const targetWitness =
        observationSnapshot.priorityRecoveryPartitionWitnesses.find(
          (snapshot) =>
            snapshot.partitionId ===
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        );

      t.equal(
        targetWitness?.semanticStateId,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        SERIAL_WAIT_RESTORE_MESSAGE,
      );
      t.same(
        targetWitness?.progressClassIds,
        [],
        SERIAL_WAIT_RESTORE_MESSAGE,
      );
      t.same(
        targetWitness?.serialWaitPartitionIds,
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        SERIAL_WAIT_RESTORE_MESSAGE,
      );
    },
  );
}

export {
  registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitPreserveRestorationTests,
};
