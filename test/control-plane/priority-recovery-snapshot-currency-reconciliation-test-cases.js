export function registerPriorityRecoverySnapshotCurrencyReconciliationTests(context) {
  const {
    buildPriorityRecoveryObservationSnapshot,
    buildTrackedPriorityRecoveryDecisionSnapshots,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
    PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
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
    PRIORITY_RECOVERY_FIRST_PARTITION_WITNESS_INDEX,
    PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_CORRELATION_KEY,
    PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_OPERATION_ID,
    PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_UPDATED_AT_MS,
    PRIORITY_RECOVERY_HIGHER_EPOCH_VALUE,
    PRIORITY_RECOVERY_LOWER_EPOCH_SYNTHETIC_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_LOWER_EPOCH_VALUE,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
    PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
    PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
    PRIORITY_RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING,
    PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
    PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
    PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_PROGRESS_AT_MS,
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
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STALE_SERIAL_WAIT_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_MESSAGE,
    PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_TEST_NAME,
    PRIORITY_RECOVERY_STATUS_ACTIVE,
    PRIORITY_RECOVERY_STATUS_REMOVED,
    PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    PUBLICATION_PRIORITY_PARTITION_ID,
    REPLICA_OPERATION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test(PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
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
        [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
      },
      snapshots: [{
        partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: null,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        blockerReasons: [
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
        ],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          reasonCode: 'unsatisfied',
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
            capturedAt: PRIORITY_RECOVERY_STALE_SERIAL_WAIT_CAPTURED_AT_MS,
            workflowSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource: 'priority_recovery_snapshot',
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
          lastProgressAtMs: PRIORITY_RECOVERY_STALE_SERIAL_WAIT_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            'blocker_reasons',
            'completion_state',
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepAgeMs: PRIORITY_RECOVERY_STALE_SERIAL_WAIT_CAPTURED_AT_MS,
          lastProgressAtMs: PRIORITY_RECOVERY_STALE_SERIAL_WAIT_CAPTURED_AT_MS,
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
          reasons: ['priority_spread_gap'],
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
          reasonCode: 'unsatisfied',
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
            PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT,
          ],
          serialWaitPartitionIds: [
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          ],
        },
      }, {
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        blockerReasons: [],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          reasonCode:
          PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: false,
        },
        observation: {
          workflowState: 'terminal',
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState:
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          provenance: {
            capturedAt: PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_CAPTURED_AT_MS,
            workflowSource: 'system_table_cache',
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource: 'priority_recovery_snapshot',
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
          workflowProgressPhaseId: 'terminal',
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
          nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
          lastProgressAtMs: PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            'completion_state',
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId: 'terminal',
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          latestOperationId: PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          lastProgressAtMs: PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
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
            PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT],
          operation: {
            operationId: PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT,
            partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            tableName: 'sql_transaction_participants',
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_REMOVED,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
            createdAtMs: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
            updatedAtMs: PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_PROGRESS_AT_MS,
            completedAtMs: PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_PROGRESS_AT_MS,
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
      PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
      ],
      [PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID],
      PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_MESSAGE,
    );

    const trackedSqlWriteSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) =>
        snapshot.partitionId === PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    );

    t.same(
      trackedSqlWriteSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedSqlWriteSnapshot?.coordinator?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.match(
      trackedSqlWriteSnapshot?.progress,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
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
      PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.match(
      partitionWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    );
  });

  const EXPLICIT_SEMANTIC_STATE_TEST_NAME =
    'priority recovery observation snapshots prefer explicit semantic-state ' +
    'indexes over local fallback inference';
  const EXPLICIT_SEMANTIC_STATE_OWNER_MESSAGE =
    'observation snapshots should consume the explicit decision-layer ' +
    'semantic-state mapping before any local inference';
  const EXPLICIT_SEMANTIC_STATE_INDEX_MESSAGE =
    'semantic-state indexes should preserve the explicit authoritative ' +
    'mapping';
  const EXPLICIT_SEMANTIC_STATE_UNRESOLVED_MESSAGE =
    'explicit spread-satisfied mapping should keep the partition out of ' +
    'the unresolved set';

  test(EXPLICIT_SEMANTIC_STATE_TEST_NAME, async (t) => {
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 2000,
        publicationEpoch: 9,
        partitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [PUBLICATION_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
        snapshots: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
          ],
          planner: {
            ready: false,
          },
          spreadCompletion: {
            satisfied: false,
          },
          completion: {
            state:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .SPREAD_SATISFIED_IN_FLIGHT,
          },
          observation: {
            workflowState: 'terminal',
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: 'converging',
            provenance: {
              capturedAt: 2000,
            },
          },
          progress: {
            contractState: 'ready',
            nextAction: 'proceed',
            currentOwner: 'none',
            nextRequiredAction: 'none',
            blockingBoundary: 'none',
            waitMode: 'none',
            evidenceSourceIds: [],
          },
          coordinator: {
            operationCount: 0,
          },
        }],
      },
    });
    const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];

    t.equal(
      partitionSnapshot.semanticStateId,
      PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
      EXPLICIT_SEMANTIC_STATE_OWNER_MESSAGE,
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [PUBLICATION_PRIORITY_PARTITION_ID],
      EXPLICIT_SEMANTIC_STATE_INDEX_MESSAGE,
    );
    t.same(
      observationSnapshot.priorityRecoveryUnresolvedPartitionIds,
      [],
      EXPLICIT_SEMANTIC_STATE_UNRESOLVED_MESSAGE,
    );
  });

  const HIGHER_EPOCH_PROGRESS_TEST_NAME =
    'priority recovery observation snapshots prefer higher publication ' +
    'epoch progress over later lower-epoch synthetic blockers';
  const HIGHER_EPOCH_STATE_MESSAGE =
    'higher publication epoch progress should keep the witness on the ' +
    'spread-satisfied lane';
  const HIGHER_EPOCH_CLASS_MESSAGE =
    'lower-epoch synthetic no-operation blockers should not override ' +
    'stronger higher-epoch progress';
  const HIGHER_EPOCH_OPERATION_MESSAGE =
    'the witness should retain the higher-epoch operation evidence';
  const HIGHER_EPOCH_OWNER_MESSAGE =
    'the witness should stay with workflow ownership while higher-epoch ' +
    'progress is active';
  const HIGHER_EPOCH_CORRELATION_MESSAGE =
    'the witness should keep the higher-epoch operation correlation key';

  test(HIGHER_EPOCH_PROGRESS_TEST_NAME, async (t) => {
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: PRIORITY_RECOVERY_LOWER_EPOCH_SYNTHETIC_CAPTURED_AT_MS,
        publicationEpoch: PRIORITY_RECOVERY_HIGHER_EPOCH_VALUE,
        snapshots: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_HIGHER_EPOCH_VALUE,
          operationId: PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_OPERATION_ID,
          semanticState:
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          blockerReasons: [],
          planner: {
            ready: false,
            spreadGap: 1,
            readyDistinctNodeCount: 1,
            requiredDistinctNodeCount: 2,
          },
          completion: {
            state:
            PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            provenance: {
              capturedAt:
              PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_CAPTURED_AT_MS,
            },
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            lastProgressAtMs:
            PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_UPDATED_AT_MS,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            ],
          },
          coordinator: {
            operationCount: 1,
            operationIds: [
              PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_OPERATION_ID,
            ],
            operation: {
              operationId: PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_OPERATION_ID,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
              status: PRIORITY_RECOVERY_STATUS_ACTIVE,
              updatedAtMs:
              PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_UPDATED_AT_MS,
              targetServiceProgressAtMs:
              PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_UPDATED_AT_MS,
            },
          },
        }, {
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_LOWER_EPOCH_VALUE,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          planner: {
            ready: false,
            spreadGap: 1,
            readyDistinctNodeCount: 1,
            requiredDistinctNodeCount: 2,
          },
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
            provenance: {
              capturedAt:
              PRIORITY_RECOVERY_LOWER_EPOCH_SYNTHETIC_CAPTURED_AT_MS,
            },
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
            nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            lastProgressAtMs:
            PRIORITY_RECOVERY_LOWER_EPOCH_SYNTHETIC_CAPTURED_AT_MS,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            ],
          },
          coordinator: {
            operationCount: 0,
            operationIds: [],
            operation: null,
          },
        }],
      },
    });
    const partitionWitness =
    observationSnapshot.priorityRecoveryPartitionWitnesses[
      PRIORITY_RECOVERY_FIRST_PARTITION_WITNESS_INDEX
    ];

    t.equal(
      partitionWitness.semanticStateId,
      PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
      HIGHER_EPOCH_STATE_MESSAGE,
    );
    t.same(
      partitionWitness.progressClassIds,
      [],
      HIGHER_EPOCH_CLASS_MESSAGE,
    );
    t.same(
      partitionWitness.operationIds,
      [PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_OPERATION_ID],
      HIGHER_EPOCH_OPERATION_MESSAGE,
    );
    t.equal(
      partitionWitness.currentOwner,
      PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      HIGHER_EPOCH_OWNER_MESSAGE,
    );
    t.equal(
      partitionWitness.correlationKey,
      PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_CORRELATION_KEY,
      HIGHER_EPOCH_CORRELATION_MESSAGE,
    );
  });

  const SAME_EPOCH_WORKFLOW_TEST_NAME =
    'priority recovery observation snapshots prefer same-epoch workflow ' +
    'evidence over later synthetic operation-unknown blockers';
  const SAME_EPOCH_WORKFLOW_STATE_MESSAGE =
    'same-epoch workflow-backed spread evidence should remain the current ' +
    'witness';
  const SAME_EPOCH_WORKFLOW_CLASS_MESSAGE =
    'later synthetic eligible-no-operation blockers should not reopen the ' +
    'same partition when workflow evidence exists';
  const SAME_EPOCH_WORKFLOW_OWNER_MESSAGE =
    'workflow ownership should remain current for the selected partition ' +
    'witness';
  const SAME_EPOCH_WORKFLOW_VISIBILITY_MESSAGE =
    'the selected witness should keep the real workflow-state evidence';
  const SAME_EPOCH_WORKFLOW_CORRELATION_MESSAGE =
    'the selected witness should keep the real operation correlation key ' +
    'instead of the synthetic operation_unknown key';
  const SAME_EPOCH_WORKFLOW_SUMMARY_MESSAGE =
    'the current semantic-state summary should stay on the workflow-backed ' +
    'spread witness';
  const SAME_EPOCH_WORKFLOW_HISTORY_MESSAGE =
    'the synthetic same-epoch blocker should remain history only';

  test(SAME_EPOCH_WORKFLOW_TEST_NAME, async (t) => {
    const sameEpochPublicationValue = 3;
    const sameEpochWorkflowOperationId = 'op-same-epoch-publication-progress';
    const sameEpochWorkflowCorrelationKey =
      `${PUBLICATION_PRIORITY_PARTITION_ID}|` +
      `${sameEpochPublicationValue}|` +
      `${sameEpochWorkflowOperationId}`;
    const sameEpochSyntheticCorrelationKey =
      `${PUBLICATION_PRIORITY_PARTITION_ID}|` +
      `${sameEpochPublicationValue}|` +
      'operation_unknown';
    const sameEpochWorkflowCapturedAtMs = 3400;
    const sameEpochWorkflowUpdatedAtMs = 3300;
    const sameEpochSyntheticCapturedAtMs = 3600;
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: sameEpochSyntheticCapturedAtMs,
        publicationEpoch: sameEpochPublicationValue,
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
            PUBLICATION_PRIORITY_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
        },
        snapshots: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          epoch: sameEpochPublicationValue,
          operationId: sameEpochWorkflowOperationId,
          correlationKey: sameEpochWorkflowCorrelationKey,
          blockerReasons: [],
          planner: {
            ready: true,
            spreadGap: 0,
            readyDistinctNodeCount: 3,
            requiredDistinctNodeCount: 3,
          },
          completion: {
            state:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .SPREAD_SATISFIED_IN_FLIGHT,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState:
              PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
            provenance: {
              capturedAt: sameEpochWorkflowCapturedAtMs,
            },
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            lastProgressAtMs: sameEpochWorkflowUpdatedAtMs,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          coordinator: {
            operationCount: 1,
            operationIds: [sameEpochWorkflowOperationId],
            operation: {
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
              status: PRIORITY_RECOVERY_STATUS_ACTIVE,
            },
          },
        }, {
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          epoch: sameEpochPublicationValue,
          correlationKey: sameEpochSyntheticCorrelationKey,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          planner: {
            ready: false,
            spreadGap: 1,
            readyDistinctNodeCount: 2,
            requiredDistinctNodeCount: 3,
          },
          completion: {
            state: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            convergenceState:
              PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
            provenance: {
              capturedAt: sameEpochSyntheticCapturedAtMs,
            },
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
            blockingBoundary:
              PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            lastProgressAtMs: sameEpochSyntheticCapturedAtMs,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            ],
          },
          coordinator: {
            operationCount: 0,
            operationIds: [],
            operation: null,
          },
        }],
      },
    });
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses[
        PRIORITY_RECOVERY_FIRST_PARTITION_WITNESS_INDEX
      ];

    t.equal(
      partitionWitness.semanticStateId,
      PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
      SAME_EPOCH_WORKFLOW_STATE_MESSAGE,
    );
    t.same(
      partitionWitness.progressClassIds,
      [],
      SAME_EPOCH_WORKFLOW_CLASS_MESSAGE,
    );
    t.equal(
      partitionWitness.currentOwner,
      PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      SAME_EPOCH_WORKFLOW_OWNER_MESSAGE,
    );
    t.equal(
      partitionWitness.workflowState,
      PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
      SAME_EPOCH_WORKFLOW_VISIBILITY_MESSAGE,
    );
    t.equal(
      partitionWitness.correlationKey,
      sameEpochWorkflowCorrelationKey,
      SAME_EPOCH_WORKFLOW_CORRELATION_MESSAGE,
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [PUBLICATION_PRIORITY_PARTITION_ID],
      SAME_EPOCH_WORKFLOW_SUMMARY_MESSAGE,
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .needs_operation,
      [],
      SAME_EPOCH_WORKFLOW_HISTORY_MESSAGE,
    );
  });

  const CURRENT_NEEDS_OPERATION_TEST_NAME =
    'priority recovery observation snapshots prefer explicit same-epoch ' +
    'needs-operation snapshots over stale terminal follow-up rows';

  test(CURRENT_NEEDS_OPERATION_TEST_NAME, async (t) => {
    const STALE_OPERATION_ID = 'op-stale-terminal-followup';
    const OPERATION_UNKNOWN_CORRELATION_SUFFIX = 'operation_unknown';
    const STALE_CORRELATION_KEY =
        `${REPLICA_OPERATION_PRIORITY_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${STALE_OPERATION_ID}`;
    const CURRENT_CORRELATION_KEY =
        `${REPLICA_OPERATION_PRIORITY_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${OPERATION_UNKNOWN_CORRELATION_SUFFIX}`;
    const STALE_CAPTURE_OFFSET_MS = 100;
    const STALE_ELIGIBLE_NODE_COUNT = 2;
    const CURRENT_ELIGIBLE_NODE_COUNT =
        PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT;
    const STALE_OPERATION_UPDATED_AT_MS = 6100;
    const CURRENT_CAPTURED_AT_MS = 7100;
    const CURRENT_PROGRESS_AT_MS = CURRENT_CAPTURED_AT_MS;
    const WORKFLOW_STATE_TERMINAL = 'terminal';
    const NEXT_REQUIRED_ACTION_FOLLOWUP =
        'schedule_followup_rebalance';
    const BLOCKING_BOUNDARY_REBALANCER_HANDOFF =
        'rebalancer_handoff';
    const CURRENT_BLOCKER_MESSAGE =
        'explicit same-epoch needs-operation evidence should displace ' +
        'stale terminal follow-up rows in the current observation summary';
    const CURRENT_WITNESS_MESSAGE =
        'the selected partition witness should come from the current ' +
        'operation-unknown needs-operation snapshot';
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots:
          buildTrackedPriorityRecoveryDecisionSnapshots({
            publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
            blockerPartitionIdsByReason: {
              [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
              [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [
                REPLICA_OPERATION_PRIORITY_PARTITION_ID,
              ],
              [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
              [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]:
                [],
            },
            partitionIdsBySemanticState: {
              [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
              [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]:
                [],
              [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
                REPLICA_OPERATION_PRIORITY_PARTITION_ID,
              ],
              [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
              [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]:
                [],
              [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
              [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [],
              [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
            },
            snapshots: [{
              partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
              epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
              operationId: STALE_OPERATION_ID,
              correlationKey: STALE_CORRELATION_KEY,
              semanticState:
                PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
              blockerReasons: [],
              completion: {
                state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              },
              observation: {
                workflowState: WORKFLOW_STATE_TERMINAL,
                visibilityState:
                  PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
                convergenceState:
                  PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
                provenance: {
                  capturedAt: CURRENT_CAPTURED_AT_MS - STALE_CAPTURE_OFFSET_MS,
                },
              },
              progress: {
                contractState:
                  PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
                nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
                currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
                nextRequiredAction: NEXT_REQUIRED_ACTION_FOLLOWUP,
                blockingBoundary: BLOCKING_BOUNDARY_REBALANCER_HANDOFF,
                waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
                lastProgressAtMs: STALE_OPERATION_UPDATED_AT_MS,
                evidenceSourceIds: [
                  PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                  PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
                  PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
                ],
              },
              actuation: {
                owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
                state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_RECOVERY_NODE_ID_A,
                  PRIORITY_RECOVERY_NODE_ID_B,
                ],
                effectiveEligibleNodeCount: STALE_ELIGIBLE_NODE_COUNT,
                ineligibleNodes: [],
                ineligibleNodeIds: [],
                recoveryEligibleExcludedNodeIds: [],
              },
              coordinator: {
                operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
                operationIds: [STALE_OPERATION_ID],
                operation: {
                  operationId: STALE_OPERATION_ID,
                  workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
                  status: PRIORITY_RECOVERY_STATUS_REMOVED,
                  updatedAtMs: STALE_OPERATION_UPDATED_AT_MS,
                },
              },
            }, {
              partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
              epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
              operationId: null,
              correlationKey: CURRENT_CORRELATION_KEY,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
              blockerReasons: [
                PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
              ],
              completion: {
                state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              },
              observation: {
                workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                convergenceState:
                  PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
                provenance: {
                  capturedAt: CURRENT_CAPTURED_AT_MS,
                },
              },
              progress: {
                contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
                nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
                currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
                nextRequiredAction:
                  PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
                blockingBoundary:
                  PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
                waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
                lastProgressAtMs: CURRENT_PROGRESS_AT_MS,
                evidenceSourceIds: [
                  PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                ],
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_RECOVERY_NODE_ID_B,
                ],
                effectiveEligibleNodeCount: CURRENT_ELIGIBLE_NODE_COUNT,
                ineligibleNodes: [],
                ineligibleNodeIds: [
                  PRIORITY_RECOVERY_NODE_ID_A,
                ],
                recoveryEligibleExcludedNodeIds: [
                  PRIORITY_RECOVERY_NODE_ID_A,
                ],
              },
              coordinator: {
                operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
                operationIds: [],
                operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
              },
            }],
          }),
    });
    const partitionWitness =
        observationSnapshot.priorityRecoveryPartitionWitnesses[
          PRIORITY_RECOVERY_FIRST_PARTITION_WITNESS_INDEX
        ];

    t.same(
      observationSnapshot.priorityRecoveryProgressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      CURRENT_BLOCKER_MESSAGE,
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .needs_operation,
      [REPLICA_OPERATION_PRIORITY_PARTITION_ID],
      CURRENT_BLOCKER_MESSAGE,
    );
    t.same(
      partitionWitness?.blockerReasonCodes,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      CURRENT_WITNESS_MESSAGE,
    );
    t.same(
      partitionWitness?.eligibleNodeIds,
      [PRIORITY_RECOVERY_NODE_ID_B],
      CURRENT_WITNESS_MESSAGE,
    );
    t.same(
      partitionWitness?.recoveryEligibleExcludedNodeIds,
      [PRIORITY_RECOVERY_NODE_ID_A],
      CURRENT_WITNESS_MESSAGE,
    );
    t.match(
      partitionWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary:
            PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      CURRENT_WITNESS_MESSAGE,
    );
    t.equal(
      partitionWitness?.correlationKey,
      CURRENT_CORRELATION_KEY,
      CURRENT_WITNESS_MESSAGE,
    );
  },
  );

  const CURRENT_UNRESOLVED_DECISION_TEST_NAME =
    'priority recovery observation snapshots prefer current unresolved ' +
    'decision partitions over stale spread summary ids';
  const CURRENT_UNRESOLVED_BLOCKED_MESSAGE =
    'current unresolved decision evidence should own the blocked partition ' +
    'id instead of the stale spread-summary partition';
  const CURRENT_UNRESOLVED_SPREAD_MESSAGE =
    'the stale spread partition should remain visible only as non-blocking ' +
    'semantic evidence';

  test(CURRENT_UNRESOLVED_DECISION_TEST_NAME, async (t) => {
    const stalePriorityPartitionSummary = {
      satisfied: false,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: 2,
      missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
      blockedPartitions: [{
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        requiredDistinctNodeCount: 3,
        readyDistinctNodeCount: 2,
        spreadGap: 1,
      }],
      blockedPartitionCount: 1,
      largestSpreadGap: 1,
      totalSpreadGap: 1,
    };
    const partitionIdsBySemanticState = {
      [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
      [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
        PUBLICATION_PRIORITY_PARTITION_ID,
      ],
      [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
        REPLICA_OPERATION_PRIORITY_PARTITION_ID,
      ],
      [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
      [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
      [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
      [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [],
      [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
    };
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      publicationConvergence: {
        publicationEpoch: 9,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        recoveryProtocolState:
          PRIORITY_RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING,
        priorityRecoveryReasonCodes: [
          PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        priorityPartitionSummary: stalePriorityPartitionSummary,
      },
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 3000,
        publicationEpoch: 9,
        priorityPartitionSummary: stalePriorityPartitionSummary,
        partitionIdsBySemanticState,
        snapshots: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          blockerReasons: [],
          planner: {
            ready: true,
            requiredDistinctNodeCount: 3,
            spreadGap: 0,
          },
          completion: {
            state:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .SPREAD_SATISFIED_IN_FLIGHT,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
            provenance: {
              capturedAt: 2000,
            },
          },
        }, {
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          planner: {
            ready: false,
            requiredDistinctNodeCount: 3,
            spreadGap: 1,
          },
          completion: {
            state: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
            provenance: {
              capturedAt: 3000,
            },
          },
        }],
      },
    });

    t.same(
      observationSnapshot.priorityRecoveryBlockedPartitionIds,
      [REPLICA_OPERATION_PRIORITY_PARTITION_ID],
      CURRENT_UNRESOLVED_BLOCKED_MESSAGE,
    );
    t.same(
      observationSnapshot.priorityRecoveryUnresolvedPartitionIds,
      [REPLICA_OPERATION_PRIORITY_PARTITION_ID],
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState[
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION
      ],
      [REPLICA_OPERATION_PRIORITY_PARTITION_ID],
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState[
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
      ],
      [PUBLICATION_PRIORITY_PARTITION_ID],
      CURRENT_UNRESOLVED_SPREAD_MESSAGE,
    );
  });
}
