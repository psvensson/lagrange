export function registerPriorityRecoverySnapshotCore02Tests(context) {
  const {
    buildPriorityRecoveryActuationDecisionInput,
    buildPriorityRecoveryDecisionSnapshot,
    buildPriorityRecoveryDecisionSnapshots,
    buildPriorityRecoveryObservationSnapshot,
    buildTrackedPriorityRecoveryDecisionSnapshots,
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
    OPERATION_WORKFLOW_OUTCOME_VALUES,
    OPERATION_WORKFLOW_OWNER,
    OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    OPERATION_WORKFLOW_REASON_CODE_VALUES,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
    PRIORITY_RECOVERY_ARTIFACT_OPERATION_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_ARTIFACT_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_ARTIFACT_OPERATION_STEP_AGE_MS,
    PRIORITY_RECOVERY_ARTIFACT_PENDING_ACK_NODE_ID,
    PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID,
    PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_ARTIFACT_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID,
    PRIORITY_RECOVERY_ARTIFACT_SQL_TRANSACTIONS_REPLICA_ID,
    PRIORITY_RECOVERY_ARTIFACT_SYNTHETIC_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
    PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
    PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_PENDING_SHORT_TIMEOUT_MS,
    PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
    PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
    PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
    PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_CREATING,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
    PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
    PUBLICATION_PRIORITY_PARTITION_ID,
    REPLICA_OPERATION_PRIORITY_PARTITION_ID,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test(
    'priority recovery decision snapshots keep ordinary partitions behind ' +
    'fresh emergency workflow progress',
    async (t) => {
      const emergencyEligibleNodeIds = [
        PRIORITY_RECOVERY_ARTIFACT_PENDING_ACK_NODE_ID,
        PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID,
        PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID,
      ];
      const emergencyPriorityPartitionSummary = {
        blockedPartitions: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
        }],
        missingPartitionIds: [
          REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        requiredDistinctNodeCount:
        PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
      };
      const emergencyReplicaOperationRow = {
        operation_id: PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID,
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_PENDING,
        workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
        source_node_id: PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID,
        target_node_id: PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID,
        replica_id: PRIORITY_RECOVERY_ARTIFACT_SQL_TRANSACTIONS_REPLICA_ID,
        created_at: PRIORITY_RECOVERY_ARTIFACT_OPERATION_CREATED_AT_MS,
        updated_at: PRIORITY_RECOVERY_ARTIFACT_OPERATION_CREATED_AT_MS,
      };

      const directDecisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_ARTIFACT_SYNTHETIC_CAPTURED_AT_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: emergencyEligibleNodeIds,
          pendingAckNodeIds: [],
          priorityPartitionSummary: emergencyPriorityPartitionSummary,
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [emergencyReplicaOperationRow],
        replicaOperations: {
          operationTimelineById: {},
        },
        serviceRows: [],
        stepTimeoutMsByWorkflowStep: {
          [PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING]:
          PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
        },
      });
      const directWriteSnapshot =
      directDecisionSnapshots.snapshots.find((entry) =>
        entry.partitionId ===
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );
      t.match(
        directWriteSnapshot,
        {
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
          ],
          progress: {
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          },
          coordinator: {
            serialWaitOperationIds: [
              PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              REPLICA_OPERATION_PRIORITY_PARTITION_ID,
            ],
          },
        },
        'ordinary priority partitions should defer behind in-flight emergency workflow recovery',
      );

      const trackedDecisionSnapshots =
      buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
            REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
        },
        snapshots: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
          operationId: PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [],
          spreadCompletion: {
            satisfied: false,
          },
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          },
          conditions: {
            latestOperationWorkflowStep:
              PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
          },
          progress: {
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            operationIds: [
              PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID,
            ],
            operation: {
              operationId: PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID,
              partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
              sourceNodeId: PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID,
              targetNodeId: PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID,
              replicaId: PRIORITY_RECOVERY_ARTIFACT_SQL_TRANSACTIONS_REPLICA_ID,
              createdAtMs: PRIORITY_RECOVERY_ARTIFACT_OPERATION_CREATED_AT_MS,
              updatedAtMs: PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
              latestTimelineInFlight: true,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            },
          },
          admission: {
            effectiveEligibleNodeIds: emergencyEligibleNodeIds,
            effectiveEligibleNodeCount: emergencyEligibleNodeIds.length,
          },
          observation: {
            provenance: {
              capturedAt: PRIORITY_RECOVERY_ARTIFACT_SYNTHETIC_CAPTURED_AT_MS,
            },
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
          operationId: PRIORITY_RECOVERY_ABSENT_OPERATION,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          planner: {
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
            PRIORITY_RECOVERY_ARTIFACT_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            ready: false,
            reasons: [],
          },
          spreadCompletion: {
            satisfied: false,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
          admission: {
            effectiveEligibleNodeIds: emergencyEligibleNodeIds,
            effectiveEligibleNodeCount: emergencyEligibleNodeIds.length,
          },
          observation: {
            provenance: {
              capturedAt: PRIORITY_RECOVERY_ARTIFACT_SYNTHETIC_CAPTURED_AT_MS,
            },
          },
        }],
      });
      const trackedWriteSnapshot =
      trackedDecisionSnapshots.snapshots.find((entry) =>
        entry.partitionId ===
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );
      t.match(
        trackedWriteSnapshot,
        {
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
          ],
          progress: {
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          },
          coordinator: {
            serialWaitOperationIds: [
              PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              REPLICA_OPERATION_PRIORITY_PARTITION_ID,
            ],
          },
        },
        'tracked snapshot normalization should retain emergency workflow progress as the serial-wait source',
      );
    },
  );

  test(
    'priority recovery owner fixture keeps later priority work behind a fresh pending workflow',
    async (t) => {
      const artifactEligibleNodeIds = [
        PRIORITY_RECOVERY_ARTIFACT_PENDING_ACK_NODE_ID,
        PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID,
        PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID,
      ];
      const artifactPriorityPartitionSummary = {
        blockedPartitions: [{
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
        }],
        missingPartitionIds: [
          SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        requiredDistinctNodeCount:
        PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
      };
      const artifactPendingOperationRow = {
        operation_id: PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID,
        partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_PENDING,
        workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
        source_node_id: PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID,
        target_node_id: PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID,
        replica_id: PRIORITY_RECOVERY_ARTIFACT_SQL_TRANSACTIONS_REPLICA_ID,
        created_at: PRIORITY_RECOVERY_ARTIFACT_OPERATION_CREATED_AT_MS,
        updated_at: PRIORITY_RECOVERY_ARTIFACT_OPERATION_CREATED_AT_MS,
      };

      const coherentDecisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_ARTIFACT_SYNTHETIC_CAPTURED_AT_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: artifactEligibleNodeIds,
          pendingAckNodeIds: [
            PRIORITY_RECOVERY_ARTIFACT_PENDING_ACK_NODE_ID,
          ],
          priorityPartitionSummary: artifactPriorityPartitionSummary,
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID,
              PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID,
            ],
            locallyEligibleNodeIds: [
              PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID,
              PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID,
            ],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [artifactPendingOperationRow],
        replicaOperations: {
          operationTimelineById: {},
        },
        serviceRows: [],
        stepTimeoutMsByWorkflowStep: {
          [PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING]:
          PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
        },
      });

      const coherentTransactionsSnapshot =
      coherentDecisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
      );
      t.match(
        coherentTransactionsSnapshot?.progress,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          workflowProgressPhaseId:
          PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          stepAgeMs: PRIORITY_RECOVERY_ARTIFACT_OPERATION_STEP_AGE_MS,
          stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
        },
        'the pending sql_transactions operation should own the current workflow boundary',
      );

      const coherentWriteSnapshot =
      coherentDecisionSnapshots.snapshots.find((entry) =>
        entry.partitionId ===
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );
      t.same(
        coherentWriteSnapshot?.blockerReasons,
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
        'later ordinary priority work should wait behind the pending operation lane',
      );
      t.same(
        coherentWriteSnapshot?.coordinator.serialWaitOperationIds,
        [PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID],
        'serial-wait evidence should name the pending workflow operation',
      );

      const operationOnlyDecisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_ARTIFACT_OPERATION_CAPTURED_AT_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: artifactEligibleNodeIds,
          pendingAckNodeIds: [],
          priorityPartitionSummary: artifactPriorityPartitionSummary,
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [artifactPendingOperationRow],
        replicaOperations: {
          operationTimelineById: {},
        },
        serviceRows: [],
        stepTimeoutMsByWorkflowStep: {
          [PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING]:
          PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
        },
      });
      const trackedTransactionsProgressSnapshot =
      operationOnlyDecisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
      );
      const buildSyntheticNoOperationSnapshot = (partitionId) => ({
        partitionId,
        epoch: PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
        operationId: PRIORITY_RECOVERY_ABSENT_OPERATION,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        blockerReasons: [
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
        ],
        planner: {
          partitionId,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
          PRIORITY_RECOVERY_ARTIFACT_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          ready: false,
          reasons: [],
        },
        spreadCompletion: {
          satisfied: false,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        admission: {
          effectiveEligibleNodeIds: artifactEligibleNodeIds,
          effectiveEligibleNodeCount: artifactEligibleNodeIds.length,
        },
        observation: {
          provenance: {
            capturedAt: PRIORITY_RECOVERY_ARTIFACT_SYNTHETIC_CAPTURED_AT_MS,
          },
        },
      });
      const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
        },
        snapshots: [
          trackedTransactionsProgressSnapshot,
          buildSyntheticNoOperationSnapshot(
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ),
          buildSyntheticNoOperationSnapshot(
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ),
        ],
      });

      t.same(
        trackedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT
        ],
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        'fresh workflow evidence should keep the pending operation in-flight',
      );
      t.same(
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
        ],
        [PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID],
        'later synthetic missing-operation evidence should normalize to serial wait',
      );
      t.same(
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
        ],
        [],
        'tracked owner evidence should not schedule duplicate ordinary priority work',
      );

      const trackedWriteSnapshot =
      trackedDecisionSnapshots.snapshots.find((entry) =>
        entry.partitionId ===
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );
      t.match(
        trackedWriteSnapshot?.progress,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        },
        'tracked serial wait should point at the workflow owner',
      );
      t.same(
        trackedWriteSnapshot?.coordinator.serialWaitOperationIds,
        [PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID],
        'tracked serial wait should retain the pending operation witness',
      );
    },
  );

  test(
    'tracked priority recovery decision snapshots rebuild summary maps after ' +
    'synthetic no-operation filtering',
    async (t) => {
      const trackedDecisionSnapshots =
      buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
        },
        snapshots: [{
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          blockerReasons: [],
          spreadCompletion: {
            satisfied: true,
          },
          coordinator: {
            operationCount: 1,
            operationIds: [
              PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
            ],
            operation: {
              operationId: PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
              updatedAtMs: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
            },
          },
          observation: {
            provenance: {
              capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
            },
          },
        }, {
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
          ],
          spreadCompletion: {
            satisfied: false,
          },
          coordinator: {
            operationCount: 0,
          },
          observation: {
            provenance: {
              capturedAt: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
            },
          },
        }],
      });

      t.equal(
        trackedDecisionSnapshots.snapshots.length,
        1,
        'stale synthetic no-operation snapshot should be filtered',
      );
      t.same(
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
        ],
        [],
        'filtered synthetic blockers should be removed from explicit reason maps',
      );
      t.same(
        trackedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION
        ],
        [],
        'filtered synthetic semantic state should not survive in explicit maps',
      );
      t.same(
        trackedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
        ],
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        'remaining progress snapshot should own the explicit semantic map',
      );
      t.same(
        trackedDecisionSnapshots.unresolvedSemanticStateIds,
        [],
        'filtered summary should not leave unresolved semantic states behind',
      );
      t.same(
        trackedDecisionSnapshots.unresolvedSemanticBlockedPartitionIds,
        [],
        'filtered summary should not leave unresolved partition ids behind',
      );
    },
  );

  test(
    'tracked priority recovery decision snapshots prefer target progress over ' +
    'stale no-transition operation blockers',
    async (t) => {
      const trackedDecisionSnapshots =
      buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          ],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          ],
        },
        snapshots: [{
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          blockerReasons: [],
          spreadCompletion: {
            satisfied: true,
          },
          completion: {
            state:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .SPREAD_SATISFIED_IN_FLIGHT,
          },
          coordinator: {
            operationCount: 1,
            operationIds: [
              PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
            ],
            operation: {
              operationId:
                PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
              updatedAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
              targetServiceProgressAtMs:
                PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
              targetVisibilityState:
                PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
            },
          },
          progress: {
            lastProgressAtMs:
              PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
          },
          observation: {
            provenance: {
              capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
            },
          },
        }, {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
          ],
          spreadCompletion: {
            satisfied: false,
          },
          coordinator: {
            operationCount: 1,
            operationIds: [
              PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
            ],
            operation: {
              operationId:
                PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
              updatedAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
            },
          },
          progress: {
            lastProgressAtMs:
              PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
          },
          observation: {
            provenance: {
              capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
            },
          },
        }],
      });

      t.equal(
        trackedDecisionSnapshots.snapshots.length,
        1,
        'stale no-transition blockers should be filtered once target progress is fresher',
      );
      t.same(
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS
        ],
        [],
        'filtered stale operation blockers should not remain in explicit reason maps',
      );
      t.same(
        trackedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED
        ],
        [],
        'filtered operation-stalled state should not survive in explicit maps',
      );
      t.same(
        trackedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
        ],
        [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
        'target progress should own the tracked semantic summary',
      );
    },
  );

  test('priority recovery decision snapshots keep ACTIVE replace dispatch blocking when the target is outside the eligible cohort',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 12,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['node-a'],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: 'control_plane_publications-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['control_plane_publications-p1'],
            requiredDistinctNodeCount: 3,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: ['node-a', 'node-c'],
            locallyEligibleNodeIds: ['node-a', 'node-c'],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: 'op-replace-active',
          partition_id: 'control_plane_publications-p1',
          entity_type: 'partition',
          operation_type: 'REPLACE',
          status: 'active',
          workflow_step: 'ACTIVE',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          replica_id: 'control_plane_publications-p1-r4',
          created_at: 1000,
          updated_at: 2000,
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-replace-active': [{
              step: 'ACTIVE',
              status: 'active',
              inFlight: true,
            }],
          },
        },
        serviceRows: [{
          partition_id: 'control_plane_publications-p1',
          status: 'active',
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
          node_id: 'node-b',
        }],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'control_plane_publications-p1' &&
      entry.operationId === 'op-replace-active',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.blockerReasons,
        [
          'operation_created_but_no_step_transitions',
          'publication_recovery_eligible_but_coordinator_excludes_node',
        ],
        'ACTIVE replace dispatch should surface the cohort mismatch explicitly when the target is outside the eligible recovery cohort',
      );
      t.same(
        targetSnapshot.spreadCompletion,
        {
          satisfied: false,
          reasonCode: 'active_operation_still_blocks_spread',
          satisfyingOperationIds: [],
          satisfyingOperationCount: 0,
          blockingOperationIds: ['op-replace-active'],
          blockingOperationCount: 1,
        },
        'spread-completion should preserve the blocking reason when the target does not satisfy the cohort invariant',
      );
      t.equal(
        targetSnapshot.semanticState,
        'coordination_mismatch',
        'out-of-cohort ACTIVE replace dispatch should use the coordination mismatch semantic state',
      );
    });

  test('priority recovery decision snapshot emits one workflow-owned event-driven progress contract while work is in flight',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        capturedAt: 1300,
        stepTimeoutMsByWorkflowStep: {
          [PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING]:
          PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
        },
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: 1,
          ineligibleNodes: [],
        },
        operationContexts: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          operationId: 'op-in-flight',
          type: 'REPLACE',
          status: PRIORITY_RECOVERY_STATUS_CREATING,
          workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
          targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
          updatedAtMs: 1200,
          timelineLength: 2,
          timelineStepCount: 2,
        }],
      });

      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
        stepAgeMs: 100,
        stepTimeoutMs: PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
        lastProgressAtMs: 1200,
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
        stepAgeMs: 100,
        stepTimeoutMs: PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
        lastProgressAtMs: 1200,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.conditions, {
        visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
        authoritativeOperationReadDeferred: false,
        blockerReasonCodes: [],
        admissionBlockingReasonCodes: [],
        pressure: {
          pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
        },
        latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
        latestOperationStatus: PRIORITY_RECOVERY_STATUS_CREATING,
      });
      t.ok(
        snapshot?.progress?.evidenceSourceIds?.includes(
          PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
        ),
        'the progress contract should preserve operation-context evidence',
      );
      t.ok(
        snapshot?.progress?.evidenceSourceIds?.includes(
          PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
        ),
        'the progress contract should preserve workflow-state evidence',
      );
    });

  test('priority recovery decision snapshot replays the April 30 sql_transactions actuation contract',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot(
        buildPriorityRecoveryActuationDecisionInput(),
      );

      t.match(
        snapshot,
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED,
        'SENDING sql_transactions-p1 evidence should replay as workflow-owned owner advancement',
      );
    });

  test('priority recovery decision snapshot keeps young pending work workflow-owned instead of stalled',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        capturedAt: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS,
        stepTimeoutMsByWorkflowStep: {
          [PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING]:
          PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
        },
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
            PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          ineligibleNodes: [],
        },
        operationContexts: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
          type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_PENDING,
          workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
          targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
          updatedAtMs: PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
          timelineLength: PRIORITY_RECOVERY_EMPTY_COUNT,
          timelineStepCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        }],
      });

      t.same(
        snapshot?.blockerReasons,
        [],
        'young pending work under its step timeout should not be classified as no-transition stalled',
      );
      t.equal(
        snapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        'young pending work should remain the workflow-owned in-flight state',
      );
      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
        stepAgeMs: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS -
        PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
        stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
        lastProgressAtMs: PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
        stepAgeMs: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS -
        PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
        stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
        lastProgressAtMs: PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
        timeoutReconcileDue: false,
      });

      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: {
          capturedAt: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS,
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          snapshots: [snapshot],
        },
      });
      const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];

      t.match(partitionSnapshot, {
        semanticStateId:
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        progressClassIds: [],
        progressContractState:
        PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        progressNextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        actuationState:
        PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
        stepAgeMs: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS -
        PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
        stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
      });
    });

  test('priority recovery decision snapshot applies explicit owner timeout budgets to pending no-transition work',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        capturedAt: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS,
        stepTimeoutMsByWorkflowStep: {
          [PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING]:
          PRIORITY_RECOVERY_PENDING_SHORT_TIMEOUT_MS,
        },
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
            PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          ineligibleNodes: [],
        },
        operationContexts: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
          type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_PENDING,
          workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
          targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
          updatedAtMs: PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
          timelineLength: PRIORITY_RECOVERY_EMPTY_COUNT,
          timelineStepCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        }],
        operationOwnerOutcome: Object.freeze({
          owner: OPERATION_WORKFLOW_OWNER,
          boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
          operationKey: PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
          sourceRevision: PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
          outcome:
            OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
          nextRequiredAction:
            OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
          effectCommand:
            OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
              .RECONCILE_STALE_PROGRESS_COMMAND,
          reasons: Object.freeze([
            OPERATION_WORKFLOW_REASON_CODE_VALUES.TIMEOUT_BUDGET_EXPIRED,
            OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_HISTORY_STALE,
          ]),
        }),
      });

      t.same(
        snapshot?.blockerReasons,
        [],
        'overdue pending work should clear stale timeout blockers from the owner outcome',
      );
      t.equal(
        snapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        'overdue pending work should re-enter in-flight recovery',
      );
      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        blockingBoundary:
        PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode:
        PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
        stepAgeMs: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS -
        PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
        stepTimeoutMs: PRIORITY_RECOVERY_PENDING_SHORT_TIMEOUT_MS,
      });
    });
}
