import * as serialWaitFixtureConstants from
  './priority-recovery-snapshot-supplemental-serial-wait-fixture-constants.js';

export function registerPriorityRecoverySnapshotSupplementalSerialWaitStaleSourceTests(
  context,
) {
  const {
    buildPriorityRecoveryObservationSnapshot,
    buildTrackedPriorityRecoveryDecisionSnapshots,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
    PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED,
    PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
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
    PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
    PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_CREATING,
    PRIORITY_RECOVERY_STATUS_REMOVED,
    PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    test,
  } = context;
  const {
    STALE_SOURCE_SERIAL_WAIT_TEST_NAME,
    STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    STALE_SOURCE_SERIAL_WAIT_PROGRESS_MESSAGE,
    STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
    STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
    STALE_SOURCE_SERIAL_WAIT_CREATE_CAPTURED_AT_MS,
    STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
    STALE_SOURCE_SERIAL_WAIT_RELEASE_CAPTURED_AT_MS,
    STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
    STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
    STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED,
    STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
    STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
    STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
    STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
    STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP,
    STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME,
    STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID,
  } = serialWaitFixtureConstants;

  test(STALE_SOURCE_SERIAL_WAIT_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
      publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
      blockerPartitionIdsByReason: {
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
      },
      partitionIdsBySemanticState: {
        [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
      },
      snapshots: [{
        partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: null,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        blockerReasons: [
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
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
            capturedAt: STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
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
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
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
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
          ],
        },
        actuation: {
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepAgeMs: STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
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
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
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
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
          provenance: {
            capturedAt: STALE_SOURCE_SERIAL_WAIT_CREATE_CAPTURED_AT_MS,
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
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_CREATING,
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
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
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
          latestOperationId: STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
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
            STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID],
          operation: {
            operationId: STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            tableName: STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_CREATING,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
            createdAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
            updatedAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            latestTimelineInFlight: true,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED,
        blockerReasons: [],
        completion: {
          state:
            PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: false,
        },
        observation: {
          workflowState: STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
          provenance: {
            capturedAt: STALE_SOURCE_SERIAL_WAIT_RELEASE_CAPTURED_AT_MS,
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
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_REMOVED,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
          workflowProgressPhaseId:
            STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
          nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          latestOperationId: STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
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
            STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID],
          operation: {
            operationId: STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            tableName: STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_REMOVED,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
            createdAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
            updatedAtMs: STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
            completedAtMs: STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            latestTimelineInFlight: false,
            targetVisibilityState:
              PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }],
    });

    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
      ],
      [],
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
      ],
      [PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID],
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );

    const trackedSqlWriteSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) =>
        snapshot.partitionId === PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    );

    t.same(
      trackedSqlWriteSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedSqlWriteSnapshot?.coordinator?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      trackedSqlWriteSnapshot?.progress,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      STALE_SOURCE_SERIAL_WAIT_PROGRESS_MESSAGE,
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
    });
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses.find((snapshot) =>
        snapshot.partitionId === PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );

    t.same(
      partitionWitness?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      partitionWitness?.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      partitionWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      STALE_SOURCE_SERIAL_WAIT_PROGRESS_MESSAGE,
    );
  });
}
