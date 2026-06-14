const PRIORITY_RECOVERY_PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
const PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE_PUBLICATION_MEMBERSHIP =
  'publication_membership';
const PRIORITY_RECOVERY_PARTICIPATION_STATE_RECOVERY_PENDING_PUBLISH =
  'recovery_pending_publish';
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED =
  'readiness_projection_excluded';
const PRIORITY_RECOVERY_RECOVERY_ACTIVE_NODE_SOURCE_RECOVERY_ELIGIBLE_PROJECTION =
  'recovery_eligible_projection';
const PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON_ACTIVE_OPERATION_STILL_BLOCKS_SPREAD =
  'active_operation_still_blocks_spread';
const PRIORITY_RECOVERY_CORE_08_TEXT = Object.freeze({
  EXCLUDED_TERMINAL_TEST_NAME:
    'priority recovery decision snapshots keep excluded terminal placement rows out of spread blockers',
  CREATING_SNAPSHOT_EXISTS: 'creating partition snapshot should exist',
  EXCLUDED_TERMINAL_SPREAD_BLOCKER_MESSAGE:
    'excluded terminal placement evidence should not be reported as a live spread blocker',
  SUPERSEDED_STALE_TEST_NAME:
    'priority recovery decision snapshots let newer terminal operations supersede stale non-operational in-flight rows',
  SUPERSEDED_STALE_BLOCKER_MESSAGE:
    'a stale non-operational in-flight row should not keep owning the operation-stalled blocker after a newer terminal row exists',
  PARTITION_RETURNS_TO_FOLLOWUP_MESSAGE:
    'the partition should return to the explicit follow-up operation-needed lane',
  ACTIONABLE_NEEDS_OPERATION_MESSAGE:
    'superseding stale in-flight rows should expose the actionable needs-operation state',
  REBALANCER_OWNS_ACTUATION_MESSAGE:
    'superseded stale in-flight rows should not keep actuation owned by the operation workflow owner',
  REBALANCER_SCHEDULES_FOLLOWUP_MESSAGE:
    'superseded stale in-flight rows should let the rebalancer schedule a follow-up recovery operation',
  ADMISSION_BLOCKED_CONTEXT_TEST_NAME:
    'priority recovery publication context excludes an admission-blocked target from the effective eligible cohort',
  ADMITTED_PARTICIPATION_COHORT_MESSAGE:
    'priority recovery should only plan against the admitted participation cohort',
  BLOCKED_TARGET_EXCLUDED_MESSAGE:
    'recovery-active publication context should exclude the blocked target node',
  PUBLICATION_COHORT_ADMISSION_AWARE_MESSAGE:
    'the effective published cohort used by recovery planning should be admission-aware',
  PENDING_ACK_EXCLUSION_TEST_NAME:
    'priority recovery decision snapshots exclude projection-rejected pending-ACK nodes from follow-up eligibility',
  TARGET_SNAPSHOT_EXISTS: 'target partition snapshot should exist',
  PROJECTION_REJECTED_NODE_EXCLUDED_MESSAGE:
    'published members rejected by readiness projection should not stay in the follow-up eligible cohort',
  PUBLICATION_OWNED_ELIGIBILITY_EVIDENCE_MESSAGE:
    'the narrowed cohort should still be attributed to publication-owned eligibility evidence',
  EXCLUSION_REASONS_PRESERVED_MESSAGE:
    'the excluded pending-ACK node should keep its publication-owned exclusion reasons',
  NEEDS_OPERATION_FOLLOWUP_MESSAGE:
    'the partition should remain a needs-operation follow-up after narrowing the eligible cohort',
  NEEDS_OPERATION_STATE_PRESERVED_MESSAGE:
    'the narrowed cohort should preserve the canonical needs-operation state',
  REBALANCER_SCHEDULING_BOUNDARY_MESSAGE:
    'follow-up planning should still remain on the rebalancer scheduling boundary',
});

export function registerPriorityRecoverySnapshotStaleRowSupersessionCohortTests(context) {
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
    PRIORITY_RECOVERY_REASON_CLUSTER_MEMBER_UNHEALTHY,
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
    PRIORITY_RECOVERY_CORE_08_TEXT.EXCLUDED_TERMINAL_TEST_NAME,
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

      t.ok(
        creatingSnapshot,
        PRIORITY_RECOVERY_CORE_08_TEXT.CREATING_SNAPSHOT_EXISTS,
      );
      t.same(
        creatingSnapshot.spreadCompletion,
        {
          satisfied: false,
          reasonCode:
            PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON_ACTIVE_OPERATION_STILL_BLOCKS_SPREAD,
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [
            PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE,
          ],
          blockingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
        },
        PRIORITY_RECOVERY_CORE_08_TEXT
          .EXCLUDED_TERMINAL_SPREAD_BLOCKER_MESSAGE,
      );
    },
  );

  test(
    PRIORITY_RECOVERY_CORE_08_TEXT.SUPERSEDED_STALE_TEST_NAME,
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
        PRIORITY_RECOVERY_CORE_08_TEXT.SUPERSEDED_STALE_BLOCKER_MESSAGE,
      );
      t.same(
        decisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
        ],
        [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
        PRIORITY_RECOVERY_CORE_08_TEXT.PARTITION_RETURNS_TO_FOLLOWUP_MESSAGE,
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION
        ],
        [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
        PRIORITY_RECOVERY_CORE_08_TEXT.ACTIONABLE_NEEDS_OPERATION_MESSAGE,
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
        PRIORITY_RECOVERY_CORE_08_TEXT.REBALANCER_OWNS_ACTUATION_MESSAGE,
      );
      t.match(
        targetSnapshot?.progress,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
        PRIORITY_RECOVERY_CORE_08_TEXT.REBALANCER_SCHEDULES_FOLLOWUP_MESSAGE,
      );
    });

  test(
    PRIORITY_RECOVERY_CORE_08_TEXT.ADMISSION_BLOCKED_CONTEXT_TEST_NAME,
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
              state: PRIORITY_RECOVERY_PARTICIPATION_STATE_RECOVERY_PENDING_PUBLISH,
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
        recoveryActiveNodeSource:
          PRIORITY_RECOVERY_RECOVERY_ACTIVE_NODE_SOURCE_RECOVERY_ELIGIBLE_PROJECTION,
      });

      t.same(
        publicationContext.concreteEligibleNodeIds,
        [PRIORITY_RECOVERY_NODE_ID_A, PRIORITY_RECOVERY_NODE_ID_B],
        PRIORITY_RECOVERY_CORE_08_TEXT.ADMITTED_PARTICIPATION_COHORT_MESSAGE,
      );
      t.same(
        publicationContext.recoveryActiveNodeIds,
        [PRIORITY_RECOVERY_NODE_ID_A, PRIORITY_RECOVERY_NODE_ID_B],
        PRIORITY_RECOVERY_CORE_08_TEXT.BLOCKED_TARGET_EXCLUDED_MESSAGE,
      );
      t.same(
        publicationContext.publishedActiveNodeIds,
        [PRIORITY_RECOVERY_NODE_ID_A, PRIORITY_RECOVERY_NODE_ID_B],
        PRIORITY_RECOVERY_CORE_08_TEXT
          .PUBLICATION_COHORT_ADMISSION_AWARE_MESSAGE,
      );
    },
  );

  test(
    PRIORITY_RECOVERY_CORE_08_TEXT.PENDING_ACK_EXCLUSION_TEST_NAME,
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_ACK_PENDING,
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          pendingAckNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
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
            projectionDiagnostics: {
              readinessExcludedNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_C,
              ],
              clusterMemberUnhealthyExcludedNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_C,
              ],
            },
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [],
        replicaOperations: {},
        serviceRows: [],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );

      t.ok(
        targetSnapshot,
        PRIORITY_RECOVERY_CORE_08_TEXT.TARGET_SNAPSHOT_EXISTS,
      );
      t.same(
        targetSnapshot.admission?.effectiveEligibleNodeIds,
        [PRIORITY_RECOVERY_NODE_ID_A, PRIORITY_RECOVERY_NODE_ID_B],
        PRIORITY_RECOVERY_CORE_08_TEXT
          .PROJECTION_REJECTED_NODE_EXCLUDED_MESSAGE,
      );
      t.equal(
        targetSnapshot.admission?.eligibilityEvidenceSource,
        PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE_PUBLICATION_MEMBERSHIP,
        PRIORITY_RECOVERY_CORE_08_TEXT
          .PUBLICATION_OWNED_ELIGIBILITY_EVIDENCE_MESSAGE,
      );
      t.same(
        targetSnapshot.publication?.exclusionReasonsByNodeId?.[
          PRIORITY_RECOVERY_NODE_ID_C
        ],
        [
          PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED,
          PRIORITY_RECOVERY_REASON_CLUSTER_MEMBER_UNHEALTHY,
        ],
        PRIORITY_RECOVERY_CORE_08_TEXT.EXCLUSION_REASONS_PRESERVED_MESSAGE,
      );
      t.same(
        targetSnapshot.blockerReasons,
        [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
        PRIORITY_RECOVERY_CORE_08_TEXT.NEEDS_OPERATION_FOLLOWUP_MESSAGE,
      );
      t.equal(
        targetSnapshot.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        PRIORITY_RECOVERY_CORE_08_TEXT.NEEDS_OPERATION_STATE_PRESERVED_MESSAGE,
      );
      t.match(
        targetSnapshot.progress,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
          blockingBoundary:
          PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
        PRIORITY_RECOVERY_CORE_08_TEXT.REBALANCER_SCHEDULING_BOUNDARY_MESSAGE,
      );
    },
  );
}
