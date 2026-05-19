import * as serialWaitFixtureConstants from
  './priority-recovery-snapshot-supplemental-serial-wait-fixture-constants.js';

export function registerPriorityRecoverySnapshotSupplementalRetainedSerialWaitReleaseTests(
  context,
) {
  const {
    buildPriorityRecoveryObservationSnapshot,
    buildTrackedPriorityRecoveryDecisionSnapshots,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED,
    PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
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
    PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_CREATING_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_STATUS_REMOVED,
    PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;
  const {
    STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED,
    STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
    STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
    STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
    STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
    STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP,
    SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
    RETAINED_CARRIER_SERIAL_WAIT_RELEASE_TEST_NAME,
    RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    RETAINED_CARRIER_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
    RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
    RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
    RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
    RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
    RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
    RETAINED_CARRIER_SERIAL_WAIT_SOURCE_TABLE_NAME,
    RETAINED_CARRIER_SERIAL_WAIT_CARRIER_TABLE_NAME,
  } = serialWaitFixtureConstants;

  test(RETAINED_CARRIER_SERIAL_WAIT_RELEASE_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots =
      buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
        },
        snapshots: [{
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: null,
          correlationKey:
            `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|operation_unknown`,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
          ],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
            reasonCode: STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED,
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
              capturedAt:
                RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
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
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
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
            state: 'transition_deferred',
            operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepAgeMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
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
            reasonCode: STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED,
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
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            ],
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
          correlationKey:
            `${PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
            `${RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID}`,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
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
              capturedAt:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              workflowSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
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
            latestOperationWorkflowStep:
              PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            latestOperationId:
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
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
              operationId:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
              partitionId:
                PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
              tableName: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_TABLE_NAME,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
              sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
              targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
              replicaId:
                PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
              createdAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              updatedAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              latestTimelineInFlight: true,
            },
            serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
            serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
          correlationKey:
            `${PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
            `${RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID}`,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state:
              PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            reasonCode:
              PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: false,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            provenance: {
              capturedAt:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              workflowSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
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
            latestOperationWorkflowStep:
              PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
            operationCount: 2,
            latestOperationId:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
            stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
            ready: false,
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
              PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
            satisfyingOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
            ],
            satisfyingOperationCount: 2,
            blockingOperationIds: [],
            blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
          coordinator: {
            operationCount: 2,
            operationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
            ],
            operation: {
              operationId:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              tableName: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_TABLE_NAME,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
              sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
              targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
              replicaId: PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID,
              createdAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              updatedAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              latestTimelineInFlight: true,
              targetVisibilityState:
                PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
              targetServiceProgressAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            },
            serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            serialWaitOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            ],
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId:
            RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
          correlationKey:
            `${PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
            `${RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID}`,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state:
              PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            reasonCode:
              PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: false,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            provenance: {
              capturedAt:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              workflowSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
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
            latestOperationWorkflowStep:
              PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
            operationCount: 2,
            latestOperationId:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
            stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
            ready: false,
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
              PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
            satisfyingOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
            ],
            satisfyingOperationCount: 2,
            blockingOperationIds: [],
            blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
          coordinator: {
            operationCount: 2,
            operationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
            ],
            operation: {
              operationId:
                RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              tableName: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_TABLE_NAME,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_REMOVED,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
              sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
              targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
              replicaId: PRIORITY_RECOVERY_SQL_WRITE_CREATING_REPLICA_ID,
              createdAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              updatedAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              completedAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
              latestTimelineInFlight: false,
              targetVisibilityState:
                PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
            },
            serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            serialWaitOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            ],
          },
        }],
      });

    const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) => snapshot.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    );

    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
      ],
      [],
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
      ],
      [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.coordinator?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.coordinator?.serialWaitPartitionIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.match(
      trackedTargetSnapshot?.progress,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
    });
    const targetWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses.find(
        (snapshot) => snapshot.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
      );

    t.same(
      targetWitness?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      targetWitness?.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.match(
      targetWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    );
  });
}
