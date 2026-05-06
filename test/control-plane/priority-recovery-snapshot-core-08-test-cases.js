export function registerPriorityRecoverySnapshotCore08Tests(context) {
  const {
    buildPriorityRecoveryDecisionSnapshots,
    buildPriorityRecoveryPublicationContext,
    PRIORITY_RECOVERY_ADMISSION_REASON_CLUSTER_INTEGRITY,
    PRIORITY_RECOVERY_ADMISSION_STATE_BLOCKED,
    PRIORITY_RECOVERY_BLOCKED_FENCE,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
    PRIORITY_RECOVERY_NEWER_OPERATION_COMPLETED_AT_MS,
    PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_NODE_ID_C,
    PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE,
    PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_COMPLETED_REPLACE,
    PRIORITY_RECOVERY_OPERATION_ID_NEWER_FAILED_REPLACE,
    PRIORITY_RECOVERY_OPERATION_ID_SUPERSEDED_SYNCING,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
    PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_FAILED_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_STALE_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_CREATING_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_ACTIVE,
    PRIORITY_RECOVERY_STATUS_CREATING,
    PRIORITY_RECOVERY_STATUS_FAILED,
    PRIORITY_RECOVERY_STATUS_REMOVED,
    PRIORITY_RECOVERY_STATUS_SYNCING,
    PRIORITY_RECOVERY_SUPERSEDED_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
    PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
    test,
  } = context;

  test(
    'priority recovery decision snapshots keep excluded terminal placement rows out of spread blockers',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
              PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
              spreadGap: PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            }],
            missingPartitionIds: [
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            ],
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            locallyEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [
          {
            operation_id:
            PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_COMPLETED_REPLACE,
            partition_id: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
            operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_REMOVED,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_C,
            replica_id: PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID,
            created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
            updated_at: PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
            completed_at: PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
          },
          {
            operation_id: PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE,
            partition_id: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
            operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_CREATING,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
            replica_id: PRIORITY_RECOVERY_SQL_WRITE_CREATING_REPLICA_ID,
            created_at: PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
            updated_at: PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
          },
        ],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_COMPLETED_REPLACE]: [
              {
                step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
                status: PRIORITY_RECOVERY_STATUS_ACTIVE,
                inFlight: true,
              },
              {
                step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
                status: PRIORITY_RECOVERY_STATUS_REMOVED,
                inFlight: false,
              },
            ],
            [PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE]: [
              {
                step: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
                status: PRIORITY_RECOVERY_STATUS_CREATING,
                inFlight: true,
              },
            ],
          },
        },
        serviceRows: [{
          partition_id: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          status: PRIORITY_RECOVERY_STATUS_ACTIVE,
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
          node_id: PRIORITY_RECOVERY_NODE_ID_C,
          replica_id: PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID,
        }],
      });

      const creatingSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID &&
      entry.operationId ===
        PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE,
      );

      t.ok(creatingSnapshot, 'creating partition snapshot should exist');
      t.same(
        creatingSnapshot.spreadCompletion,
        {
          satisfied: false,
          reasonCode: 'active_operation_still_blocks_spread',
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [
            PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE,
          ],
          blockingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
        },
        'excluded terminal placement evidence should not be reported as a live spread blocker',
      );
    },
  );

  test(
    'priority recovery decision snapshots let newer terminal operations supersede stale non-operational in-flight rows',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
              PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
              spreadGap: PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            }],
            missingPartitionIds: [
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            ],
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
              PRIORITY_RECOVERY_NODE_ID_C,
            ],
            locallyEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
              PRIORITY_RECOVERY_NODE_ID_C,
            ],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [
          {
            operation_id: PRIORITY_RECOVERY_OPERATION_ID_SUPERSEDED_SYNCING,
            partition_id:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
            operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_SYNCING,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
            replica_id:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_STALE_REPLICA_ID,
            created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
            updated_at: PRIORITY_RECOVERY_SUPERSEDED_OPERATION_UPDATED_AT_MS,
          },
          {
            operation_id: PRIORITY_RECOVERY_OPERATION_ID_NEWER_FAILED_REPLACE,
            partition_id:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
            operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_FAILED,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_C,
            replica_id:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_FAILED_REPLICA_ID,
            created_at: PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
            updated_at: PRIORITY_RECOVERY_NEWER_OPERATION_COMPLETED_AT_MS,
            completed_at: PRIORITY_RECOVERY_NEWER_OPERATION_COMPLETED_AT_MS,
          },
        ],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_SUPERSEDED_SYNCING]: [{
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
              status: PRIORITY_RECOVERY_STATUS_SYNCING,
              inFlight: true,
            }],
            [PRIORITY_RECOVERY_OPERATION_ID_NEWER_FAILED_REPLACE]: [{
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
              status: PRIORITY_RECOVERY_STATUS_FAILED,
              inFlight: false,
            }],
          },
        },
        serviceRows: [],
      });

      t.same(
        decisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS
        ],
        [],
        'a stale non-operational in-flight row should not keep owning the operation-stalled blocker after a newer terminal row exists',
      );
      t.same(
        decisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
        ],
        [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
        'the partition should return to the explicit follow-up operation-needed lane',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION
        ],
        [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
        'superseding stale in-flight rows should expose the actionable needs-operation state',
      );
      const targetSnapshot = decisionSnapshots.snapshots.find((snapshot) =>
        snapshot.partitionId ===
        PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
      );
      t.match(
        targetSnapshot?.actuation,
        {
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        },
        'superseded stale in-flight rows should not keep actuation owned by the operation workflow owner',
      );
      t.match(
        targetSnapshot?.progress,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
        'superseded stale in-flight rows should let the rebalancer schedule a follow-up recovery operation',
      );
    });

  test('priority recovery publication context excludes an admission-blocked target from the effective eligible cohort',
    async (t) => {
      const publicationContext = buildPriorityRecoveryPublicationContext({
        targetNodeId: PRIORITY_RECOVERY_NODE_ID_C,
        admissionState: PRIORITY_RECOVERY_ADMISSION_STATE_BLOCKED,
        admissionReasonCodes: [
          PRIORITY_RECOVERY_ADMISSION_REASON_CLUSTER_INTEGRITY,
        ],
        clusterIncarnationFence: PRIORITY_RECOVERY_BLOCKED_FENCE,
        publishedActiveNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        membershipLifecycleSummary: {
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          projectedServingNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          locallyEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          participationByNodeId: {
            [PRIORITY_RECOVERY_NODE_ID_C]: {
              nodeId: PRIORITY_RECOVERY_NODE_ID_C,
              state: 'recovery_pending_publish',
              admissionState: PRIORITY_RECOVERY_ADMISSION_STATE_BLOCKED,
              admissionReasonCodes: [
                PRIORITY_RECOVERY_ADMISSION_REASON_CLUSTER_INTEGRITY,
              ],
              clusterIncarnationFence: PRIORITY_RECOVERY_BLOCKED_FENCE,
            },
          },
        },
        recoveryActiveNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
      });

      t.same(
        publicationContext.concreteEligibleNodeIds,
        [PRIORITY_RECOVERY_NODE_ID_A, PRIORITY_RECOVERY_NODE_ID_B],
        'priority recovery should only plan against the admitted participation cohort',
      );
      t.same(
        publicationContext.recoveryActiveNodeIds,
        [PRIORITY_RECOVERY_NODE_ID_A, PRIORITY_RECOVERY_NODE_ID_B],
        'recovery-active publication context should exclude the blocked target node',
      );
      t.same(
        publicationContext.publishedActiveNodeIds,
        [PRIORITY_RECOVERY_NODE_ID_A, PRIORITY_RECOVERY_NODE_ID_B],
        'the effective published cohort used by recovery planning should be admission-aware',
      );
    });
}
