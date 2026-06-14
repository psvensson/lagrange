export function registerPriorityRecoverySnapshotInFlightReplaceClassificationTests(context) {
  const {
    buildPriorityRecoveryDecisionSnapshots,
    PRIORITY_RECOVERY_ACTIVE_SOURCE_REMOVAL_AGE_MS,
    PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE_NO_ACTION_NEEDED,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_NODE_ID_C,
    PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY,
    PRIORITY_RECOVERY_OPERATION_ID_SYNCING_FOLLOWER_TARGET,
    PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_ADDRESS,
    PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
    PRIORITY_RECOVERY_RAFT_ROLE_FOLLOWER,
    PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
    PRIORITY_RECOVERY_READY_ELIGIBLE_NODE_COUNT,
    PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
    PRIORITY_RECOVERY_REASON_PLANNER_READY,
    PRIORITY_RECOVERY_REPLICA_ID_SYNCING,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLICA_ID,
    PRIORITY_RECOVERY_STATUS_ACTIVE,
    PRIORITY_RECOVERY_STATUS_COMPLETED,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_STATUS_SYNCING,
    PRIORITY_RECOVERY_TOTAL_PRIORITY_PARTITION_COUNT,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
    PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
    PUBLICATION_PRIORITY_PARTITION_ID,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test('priority recovery decision snapshots treat non-blocked SYNCING replace work as spread-satisfied in flight',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 12,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['node-a', 'node-b'],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'sql_write_operations-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['sql_write_operations-p1'],
            requiredDistinctNodeCount: 3,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: ['node-a', 'node-b'],
            locallyEligibleNodeIds: ['node-a', 'node-b'],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: 'op-replace-syncing',
          partition_id: 'control_plane_publications-p1',
          entity_type: 'partition',
          operation_type: 'REPLACE',
          status: 'syncing',
          workflow_step: 'SYNCING',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          replica_id: 'control_plane_publications-p1-r4',
          created_at: 1000,
          updated_at: 2000,
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-replace-syncing': [
              {step: 'PENDING', status: 'pending', inFlight: true},
              {step: 'SENDING', status: 'pending', inFlight: true},
              {step: 'CREATING', status: 'creating', inFlight: true},
              {step: 'SYNCING', status: 'syncing', inFlight: true},
            ],
          },
        },
        serviceRows: [],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'control_plane_publications-p1' &&
      entry.operationId === 'op-replace-syncing',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.blockerReasons,
        [],
        'non-blocked SYNCING replace work should not emit blocker reasons',
      );
      t.same(
        targetSnapshot.spreadCompletion,
        {
          satisfied: true,
          reasonCode: 'planner_ready',
          satisfyingOperationIds: [],
          satisfyingOperationCount: 0,
          blockingOperationIds: ['op-replace-syncing'],
          blockingOperationCount: 1,
        },
        'planner-ready partitions should treat in-flight replace work as satisfied for spread planning',
      );
      t.equal(
        targetSnapshot.semanticState,
        'spread_satisfied_in_flight',
        'non-blocked SYNCING replace work should stop appearing as recovering_in_flight',
      );
    });

  test('priority recovery decision snapshots do not let planner-ready PENDING ' +
  'work keep a spread-satisfied partition unresolved', async (t) => {
    const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
      capturedAt: PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
      publicationConvergence: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
        ],
        priorityPartitionSummary: {
          satisfied: true,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyEligibleNodeCount: PRIORITY_RECOVERY_READY_ELIGIBLE_NODE_COUNT,
          totalPriorityPartitionCount:
          PRIORITY_RECOVERY_TOTAL_PRIORITY_PARTITION_COUNT,
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
      replicaOperationRows: [{
        operation_id: PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY,
        partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_PENDING,
        workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
        source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
        target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
        replica_id: PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLICA_ID,
        created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
        updated_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
      }],
      replicaOperations: {
        operationTimelineById: {
          [PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY]: [{
            step: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
            status: PRIORITY_RECOVERY_STATUS_PENDING,
            inFlight: true,
          }],
        },
      },
      serviceRows: [],
    });

    const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID &&
    entry.operationId ===
      PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY,
    );
    t.ok(targetSnapshot, 'target partition snapshot should exist');
    t.same(
      targetSnapshot.blockerReasons,
      [],
      'planner-ready PENDING work should not emit no-transition blockers',
    );
    t.same(
      targetSnapshot.spreadCompletion,
      {
        satisfied: true,
        reasonCode: PRIORITY_RECOVERY_REASON_PLANNER_READY,
        satisfyingOperationIds: [],
        satisfyingOperationCount: 0,
        blockingOperationIds: [
          PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY,
        ],
        blockingOperationCount: 1,
      },
      'planner-ready partitions should preserve the blocking operation as non-blocking context',
    );
    t.equal(
      targetSnapshot.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
      'planner-ready PENDING work should be spread-satisfied in flight',
    );
    t.same(
      decisionSnapshots.unresolvedSemanticStateIds,
      [],
      'planner-ready PENDING work should not keep priority recovery unresolved',
    );
  });

  test('priority recovery decision snapshots keep planner-ready source removal workflow-owned',
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
            satisfied: true,
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyEligibleNodeCount: PRIORITY_RECOVERY_READY_ELIGIBLE_NODE_COUNT,
            totalPriorityPartitionCount:
            PRIORITY_RECOVERY_TOTAL_PRIORITY_PARTITION_COUNT,
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
        replicaOperationRows: [{
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY,
          partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_ACTIVE,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id: PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLICA_ID,
          created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          age_ms: PRIORITY_RECOVERY_ACTIVE_SOURCE_REMOVAL_AGE_MS,
        }],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY]: [{
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
              status: PRIORITY_RECOVERY_STATUS_ACTIVE,
              inFlight: true,
            }],
          },
        },
        serviceRows: [{
          partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          status: PRIORITY_RECOVERY_STATUS_ACTIVE,
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
          node_id: PRIORITY_RECOVERY_NODE_ID_B,
        }],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID &&
      entry.operationId ===
        PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY,
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.equal(
        targetSnapshot.completion?.state,
        PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
        'planner-ready source removal should keep planner convergence evidence',
      );
      t.same(
        decisionSnapshots.unresolvedSemanticStateIds,
        [],
        'planner-ready source removal should not reopen priority recovery',
      );
      t.match(
        targetSnapshot.actuation,
        {
          state: PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          workflowProgressPhaseId:
          PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          timeoutReconcileDue: false,
        },
        'active source-removal rows should not report no action needed',
      );
      t.not(
        targetSnapshot.actuation?.state,
        PRIORITY_RECOVERY_ACTUATION_STATE_NO_ACTION_NEEDED,
        'planner convergence should not hide active source-removal actuation',
      );
      t.match(
        targetSnapshot.progress,
        {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          workflowProgressPhaseId:
          PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
        },
        'planner-ready source removal should remain owned by the workflow owner',
      );
    });

  test(
    'priority recovery decision snapshots treat cache-visible SYNCING replace work ' +
    'with an operational target on an eligible node as spread-satisfied in flight',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 12,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['node-a', 'node-b'],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
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
            projectedServingNodeIds: ['node-a', 'node-b'],
            locallyEligibleNodeIds: ['node-a', 'node-b'],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: 'op-replace-syncing-operational-target',
          partition_id: 'control_plane_publications-p1',
          entity_type: 'partition',
          operation_type: 'REPLACE',
          status: 'syncing',
          workflow_step: 'SYNCING',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          replica_id: 'control_plane_publications-p1-r4',
          created_at: 1000,
          updated_at: 2000,
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-replace-syncing-operational-target': [
              {step: 'PENDING', status: 'pending', inFlight: true},
              {step: 'SENDING', status: 'pending', inFlight: true},
              {step: 'CREATING', status: 'creating', inFlight: true},
              {step: 'SYNCING', status: 'syncing', inFlight: true},
            ],
          },
        },
        serviceRows: [{
          partition_id: 'control_plane_publications-p1',
          replica_id: 'control_plane_publications-p1-r4',
          service_type: 'partition',
          status: 'active',
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
          node_id: 'node-b',
        }],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'control_plane_publications-p1' &&
      entry.operationId === 'op-replace-syncing-operational-target',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.blockerReasons,
        [],
        'operational target ownership should clear blocker reasons for stale cache-visible syncing work',
      );
      t.same(
        targetSnapshot.spreadCompletion,
        {
          satisfied: true,
          reasonCode:
          PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: ['op-replace-syncing-operational-target'],
          satisfyingOperationCount: 1,
          blockingOperationIds: [],
          blockingOperationCount: 0,
        },
        'operational target ownership should satisfy spread completion without waiting for a stale syncing row to replay into ACTIVE first',
      );
      t.equal(
        targetSnapshot.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        'stale cache-visible syncing work should use the canonical spread-satisfied semantic state once operational target ownership is visible',
      );
      t.equal(
        targetSnapshot.completion?.state,
        PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        'the canonical completion state should match the spread-satisfied semantic state',
      );
      t.same(
        targetSnapshot.observation,
        {
          workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState:
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          provenance: {
            capturedAt: 5000,
            workflowSource: 'system_table_cache',
            timelineSource: 'replica_operation_timeline',
            semanticSource: 'priority_recovery_snapshot',
          },
        },
        'observation should preserve cache visibility while still surfacing the canonical spread-satisfied convergence state',
      );
    },
  );

  test(
    'priority recovery decision snapshots treat syncing follower target rows with address as operational target evidence',
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
              partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
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
        replicaOperationRows: [{
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_SYNCING_FOLLOWER_TARGET,
          partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_SYNCING,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id: PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_REPLICA_ID,
          created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
        }],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_SYNCING_FOLLOWER_TARGET]: [
              {
                step: PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
                status: PRIORITY_RECOVERY_STATUS_SYNCING,
                inFlight: true,
              },
            ],
          },
        },
        serviceRows: [{
          partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
          replica_id: PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_REPLICA_ID,
          service_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          status: PRIORITY_RECOVERY_STATUS_SYNCING,
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_FOLLOWER,
          node_id: PRIORITY_RECOVERY_NODE_ID_B,
          address: PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_ADDRESS,
        }],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === PUBLICATION_PRIORITY_PARTITION_ID &&
      entry.operationId ===
        PRIORITY_RECOVERY_OPERATION_ID_SYNCING_FOLLOWER_TARGET,
      );

      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.spreadCompletion,
        {
          satisfied: true,
          reasonCode:
          PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: [
            PRIORITY_RECOVERY_OPERATION_ID_SYNCING_FOLLOWER_TARGET,
          ],
          satisfyingOperationCount: 1,
          blockingOperationIds: [],
          blockingOperationCount: 0,
        },
        'voter-ready syncing rows should satisfy spread while status persistence lags',
      );
      t.equal(
        targetSnapshot.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        'syncing follower target evidence should not remain recovering in flight',
      );
    },
  );

  test('priority recovery decision snapshots infer operation identity from malformed syncing rows',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 12,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['node-a', 'node-b'],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: 'sql_transactions-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 1,
              spreadGap: 2,
            }],
            missingPartitionIds: ['sql_transactions-p1'],
            requiredDistinctNodeCount: 3,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: ['node-a', 'node-b'],
            locallyEligibleNodeIds: ['node-a', 'node-b'],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: 'op-replace-syncing-missing-columns',
          type: '',
          status: 'syncing',
          workflow_step: 'SYNCING',
          replica_id: 'sql_transactions-p1-r4',
          steps_history: JSON.stringify([{
            step: 'PENDING',
            sourceReplicaId: 'sql_transactions-p1-r1',
            replicaIds: [
              'sql_transactions-p1-r2',
              'sql_transactions-p1-r3',
              'sql_transactions-p1-r4',
            ],
            peerAddresses: [
              'node-a/partition/sql_transactions-p1-r2',
              'node-a/partition/sql_transactions-p1-r3',
              'node-b/partition/sql_transactions-p1-r4',
            ],
          }, {
            step: 'SYNCING',
            readinessSnapshot: {
              nodeId: 'node-b',
            },
          }]),
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-replace-syncing-missing-columns': [
              {step: 'PENDING', status: 'pending', inFlight: true},
              {step: 'SYNCING', status: 'syncing', inFlight: true},
            ],
          },
        },
        serviceRows: [],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.operationId === 'op-replace-syncing-missing-columns',
      );
      t.ok(targetSnapshot, 'malformed syncing row should still produce one partition snapshot');
      t.equal(
        targetSnapshot.partitionId,
        'sql_transactions-p1',
        'priority recovery snapshots should recover the partition id from replica identity when the row omits it',
      );
      t.notOk(
        targetSnapshot.blockerReasons.includes(
          'eligible_but_no_operation_created',
        ),
        'live syncing work should not collapse back into the synthetic needs-operation state when persisted columns are missing',
      );
      t.equal(
        targetSnapshot.semanticState,
        'recovering_in_flight',
        'malformed syncing rows should still remain visible as in-flight recovery work',
      );
    });

  test('priority recovery decision snapshots reuse canonical summary rows when raw operation rows lag follow-up creation',
    async (t) => {
      const capturedAtMs = 5000;
      const followupOperationId = 'op-followup-sending';
      const followupReplicaId = 'control_plane_publications-p1-r5';

      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: capturedAtMs,
        publicationConvergence: {
          publicationEpoch: 12,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: [PRIORITY_RECOVERY_NODE_ID_A],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
            requiredDistinctNodeCount: 3,
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
        replicaOperationRows: [{
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
          partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
          entity_type: 'partition',
          operation_type: 'REPLACE',
          status: PRIORITY_RECOVERY_STATUS_COMPLETED,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id: PRIORITY_RECOVERY_REPLICA_ID_SYNCING,
          created_at: 1000,
          updated_at: 1500,
          completed_at: 1500,
        }],
        replicaOperations: {
          rows: [{
            operation_id: followupOperationId,
            partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
            entity_type: 'partition',
            operation_type: 'REPLACE',
            status: 'pending',
            workflow_step: 'SENDING',
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
            replica_id: followupReplicaId,
            created_at: 2000,
            updated_at: 2600,
          }],
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE]: [
              {
                step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
                status: PRIORITY_RECOVERY_STATUS_ACTIVE,
                inFlight: true,
              },
              {
                step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
                status: PRIORITY_RECOVERY_STATUS_COMPLETED,
                inFlight: false,
              },
            ],
            [followupOperationId]: [
              {step: 'PENDING', status: 'pending', inFlight: true},
              {step: 'SENDING', status: 'pending', inFlight: true},
            ],
          },
        },
        serviceRows: [],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === PUBLICATION_PRIORITY_PARTITION_ID &&
      entry.operationId === followupOperationId,
      );
      t.ok(targetSnapshot,
        'a newer follow-up operation visible only in the canonical summary rows should still produce one decision snapshot');
      t.same(
        decisionSnapshots.partitionIdsBySemanticState.recovering_in_flight,
        [PUBLICATION_PRIORITY_PARTITION_ID],
        'the newer summary-backed follow-up operation should keep the partition on the recovering-in-flight lane',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState.needs_operation,
        [],
        'the stale terminal raw row should not drag the partition back into needs-operation once the summary rows show the follow-up operation',
      );
      t.notOk(
        targetSnapshot.blockerReasons.includes(
          'eligible_but_no_operation_created',
        ),
        'summary-backed follow-up visibility should suppress the synthetic eligible/no-operation blocker',
      );
      t.equal(
        targetSnapshot.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        'summary-backed follow-up visibility should preserve the in-flight recovery semantic state',
      );
    });

  test('priority recovery decision snapshots classify out-of-cohort in-flight replace work as coordination mismatch',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 12,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['node-a', 'node-b'],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'sql_write_operations-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['sql_write_operations-p1'],
            requiredDistinctNodeCount: 3,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: ['node-a', 'node-b'],
            locallyEligibleNodeIds: ['node-a', 'node-b'],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: 'op-replace-sending',
          partition_id: 'sql_write_operations-p1',
          entity_type: 'partition',
          operation_type: 'REPLACE',
          status: 'pending',
          workflow_step: 'SENDING',
          source_node_id: 'node-a',
          target_node_id: 'node-c',
          replica_id: 'sql_write_operations-p1-r4',
          created_at: 1000,
          updated_at: 2000,
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-replace-sending': [
              {step: 'PENDING', status: 'pending', inFlight: true},
              {step: 'SENDING', status: 'pending', inFlight: true},
            ],
          },
        },
        serviceRows: [],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'sql_write_operations-p1' &&
      entry.operationId === 'op-replace-sending',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.blockerReasons,
        ['publication_recovery_eligible_but_coordinator_excludes_node'],
        'in-flight targets outside the eligible cohort should surface as coordination mismatch',
      );
      t.equal(
        targetSnapshot.semanticState,
        'coordination_mismatch',
        'out-of-cohort in-flight replace work should use the coordination mismatch semantic state',
      );
    });
}
