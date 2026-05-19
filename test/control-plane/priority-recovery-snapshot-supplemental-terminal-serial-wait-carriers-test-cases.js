export function registerPriorityRecoverySnapshotSupplementalTerminalSerialWaitCarriersTests(
  context,
) {
  const {
    buildPriorityRecoveryObservationSnapshot,
    buildTrackedPriorityRecoveryDecisionSnapshots,
    PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
    PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED,
    PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_STATUS_REMOVED,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test(
    'tracked priority recovery decision snapshots keep terminal ' +
      'serial-wait carriers subordinate to the source workflow',
    async (t) => {
      const SOURCE_PARTITION_TABLE_NAME = 'sql_transactions';
      const TARGET_PARTITION_TABLE_NAME = 'sql_write_operations';
      const SOURCE_OPERATION_ID = 'op-terminal-carrier-source-pending';
      const TARGET_OPERATION_ID = 'op-terminal-carrier-target-removed';
      const SOURCE_REPLICA_ID = 'sql_transactions-p1-r4';
      const TARGET_REPLICA_ID = 'sql_write_operations-p1-r4';
      const SOURCE_OPERATION_PROGRESS_AT_MS = 6200;
      const TARGET_OPERATION_COMPLETED_AT_MS = 6000;
      const CAPTURED_AT_MS = 7000;
      const SOURCE_STEP_AGE_MS = 800;
      const TARGET_STEP_AGE_MS = 1000;
      const WORKFLOW_STATE_TERMINAL = 'terminal';
      const PROGRESS_PHASE_TERMINAL = 'terminal';
      const NEXT_REQUIRED_ACTION_FOLLOWUP =
        'schedule_followup_rebalance';
      const BLOCKING_BOUNDARY_REBALANCER_HANDOFF =
        'rebalancer_handoff';
      const SERIAL_WAIT_CARRIER_MESSAGE =
        'terminal removed snapshots that still advertise serial-wait lane ' +
        'ownership should remain subordinate to the source workflow';
      const SOURCE_CORRELATION_KEY =
        `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${SOURCE_OPERATION_ID}`;
      const TARGET_CORRELATION_KEY =
        `${PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${TARGET_OPERATION_ID}`;

      const trackedDecisionSnapshots =
        buildTrackedPriorityRecoveryDecisionSnapshots({
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
              SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            ],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
            operationId: SOURCE_OPERATION_ID,
            correlationKey: SOURCE_CORRELATION_KEY,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
            blockerReasons: [],
            completion: {
              state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              reasonCode: 'active_operation_still_blocks_spread',
              retryAfterMs: null,
              activeOperationCount: 1,
              temporaryOverflowVoterBudget: 0,
              allowTemporaryOverflowPromotion: false,
              blocked: true,
            },
            observation: {
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState:
                PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
              provenance: {
                capturedAt: CAPTURED_AT_MS,
                workflowSource: 'system_table_cache',
                timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                semanticSource: 'priority_recovery_snapshot',
              },
            },
            conditions: {
              visibilityState:
                PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              authoritativeOperationReadDeferred: false,
              blockerReasonCodes: [],
              admissionBlockingReasonCodes: [],
              pressure: {
                pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
                blocksCriticalRecoveryActuation: false,
              },
              latestOperationWorkflowStep:
                PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
              latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
            },
            progress: {
              contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
              nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
              workflowProgressPhaseId:
                PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
              currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
              nextRequiredAction:
                PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
              blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
              waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
              lastProgressAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
              retryAfterMs: 0,
              evidenceSourceIds: [
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
              ],
            },
            actuation: {
              workflowProgressPhaseId:
                PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
              owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
              state:
                PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
              operationCount: 1,
              latestOperationId: SOURCE_OPERATION_ID,
              stepAgeMs: SOURCE_STEP_AGE_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              lastProgressAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
              retryAfterMs: 0,
              timeoutReconcileDue: false,
            },
            planner: {
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount: null,
              readyDistinctNodeCount: null,
              spreadGap: null,
              ready: null,
              reasons: [],
            },
            admission: {
              effectiveEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
              ],
              effectiveEligibleNodeCount: 2,
              ineligibleNodes: [],
              ineligibleNodeIds: [],
              recoveryEligibleExcludedNodeIds: [],
            },
            spreadCompletion: {
              satisfied: false,
              reasonCode: 'active_operation_still_blocks_spread',
              satisfyingOperationIds: [],
              satisfyingOperationCount: 0,
              blockingOperationIds: [SOURCE_OPERATION_ID],
              blockingOperationCount: 1,
            },
            coordinator: {
              operationCount: 1,
              operationIds: [SOURCE_OPERATION_ID],
              operation: {
                operationId: SOURCE_OPERATION_ID,
                partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
                tableName: SOURCE_PARTITION_TABLE_NAME,
                type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
                status: PRIORITY_RECOVERY_STATUS_PENDING,
                workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
                sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
                targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
                replicaId: SOURCE_REPLICA_ID,
                createdAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                updatedAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                completedAtMs: null,
                stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
                latestTimelineInFlight: true,
                targetVisibilityState: 'absent',
              },
              serialWaitOperationCount: 0,
              serialWaitOperationIds: [],
              serialWaitPartitionIds: [],
            },
          }, {
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
            operationId: TARGET_OPERATION_ID,
            correlationKey: TARGET_CORRELATION_KEY,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
            blockerReasons: [],
            completion: {
              state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              reasonCode: 'unsatisfied',
              retryAfterMs: null,
              activeOperationCount: 0,
              temporaryOverflowVoterBudget: 0,
              allowTemporaryOverflowPromotion: false,
              blocked: true,
            },
            observation: {
              workflowState: WORKFLOW_STATE_TERMINAL,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState:
                PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
              provenance: {
                capturedAt: CAPTURED_AT_MS,
                workflowSource: 'system_table_cache',
                timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                semanticSource: 'priority_recovery_snapshot',
              },
            },
            conditions: {
              visibilityState:
                PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              authoritativeOperationReadDeferred: false,
              blockerReasonCodes: [],
              admissionBlockingReasonCodes: [],
              pressure: {
                pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
                blocksCriticalRecoveryActuation: false,
              },
              latestOperationWorkflowStep:
                PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
              latestOperationStatus: PRIORITY_RECOVERY_STATUS_REMOVED,
            },
            progress: {
              contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
              nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
              workflowProgressPhaseId: PROGRESS_PHASE_TERMINAL,
              currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              nextRequiredAction: NEXT_REQUIRED_ACTION_FOLLOWUP,
              blockingBoundary: BLOCKING_BOUNDARY_REBALANCER_HANDOFF,
              waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
              lastProgressAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
              retryAfterMs: 0,
              evidenceSourceIds: [
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
              ],
            },
            actuation: {
              workflowProgressPhaseId: PROGRESS_PHASE_TERMINAL,
              owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
              operationCount: 1,
              latestOperationId: TARGET_OPERATION_ID,
              stepAgeMs: TARGET_STEP_AGE_MS,
              stepTimeoutMs: 0,
              lastProgressAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
              retryAfterMs: 0,
              timeoutReconcileDue: false,
            },
            planner: {
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              requiredDistinctNodeCount: null,
              readyDistinctNodeCount: null,
              spreadGap: null,
              ready: null,
              reasons: [],
            },
            admission: {
              effectiveEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
              ],
              effectiveEligibleNodeCount: 2,
              ineligibleNodes: [],
              ineligibleNodeIds: [],
              recoveryEligibleExcludedNodeIds: [],
            },
            spreadCompletion: {
              satisfied: false,
              reasonCode: 'unsatisfied',
              satisfyingOperationIds: [],
              satisfyingOperationCount: 0,
              blockingOperationIds: [],
              blockingOperationCount: 0,
            },
            coordinator: {
              operationCount: 1,
              operationIds: [TARGET_OPERATION_ID],
              operation: {
                operationId: TARGET_OPERATION_ID,
                partitionId:
                  PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
                tableName: TARGET_PARTITION_TABLE_NAME,
                type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
                status: PRIORITY_RECOVERY_STATUS_REMOVED,
                workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
                sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
                targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
                replicaId: TARGET_REPLICA_ID,
                createdAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                updatedAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
                completedAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
                stepTimeoutMs: 0,
                latestTimelineInFlight: false,
                targetVisibilityState: 'absent',
              },
              serialWaitOperationCount: 1,
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
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
        ],
        [PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        trackedTargetSnapshot?.blockerReasons,
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.equal(
        trackedTargetSnapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        trackedTargetSnapshot?.coordinator?.serialWaitOperationIds,
        [SOURCE_OPERATION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        trackedTargetSnapshot?.coordinator?.serialWaitPartitionIds,
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.match(
        trackedTargetSnapshot?.progress,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
        SERIAL_WAIT_CARRIER_MESSAGE,
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
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.equal(
        targetWitness?.semanticStateId,
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        targetWitness?.serialWaitPartitionIds,
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.match(
        targetWitness,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
    },
  );
}
