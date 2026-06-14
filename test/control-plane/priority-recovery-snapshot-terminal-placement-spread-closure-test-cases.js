export function registerPriorityRecoverySnapshotTerminalPlacementSpreadClosureTests(context) {
  const {
    buildPriorityRecoveryClosureWitness,
    buildPriorityRecoveryDecisionSnapshots,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED,
    PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
    PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
    PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
    PRIORITY_RECOVERY_NEWER_OPERATION_COMPLETED_AT_MS,
    PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_NODE_ID_C,
    PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE,
    PRIORITY_RECOVERY_OPERATION_ID_ELIGIBLE_REMOVE_PHASE,
    PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_TARGET_CREATING,
    PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
    PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
    PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
    PRIORITY_RECOVERY_REPLICA_ID_SYNCING,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLICA_ID,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_ACTIVE,
    PRIORITY_RECOVERY_STATUS_CREATING,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_STATUS_REMOVED,
    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
    PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    PUBLICATION_PRIORITY_PARTITION_ID,
    REPLICA_OPERATION_PRIORITY_PARTITION_ID,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test('priority recovery decision snapshots let eligible source removal supersede an excluded stale target',
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
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            }],
            missingPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
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
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_ELIGIBLE_REMOVE_PHASE,
          partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_ACTIVE,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id: PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLICA_ID,
          created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_NEWER_OPERATION_COMPLETED_AT_MS,
        }, {
          operation_id:
          PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_TARGET_CREATING,
          partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_CREATING,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_C,
          replica_id: PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
          created_at: PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
        }],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_ELIGIBLE_REMOVE_PHASE]: [{
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
              status: PRIORITY_RECOVERY_STATUS_ACTIVE,
              inFlight: true,
            }],
            [PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_TARGET_CREATING]: [{
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
              status: PRIORITY_RECOVERY_STATUS_CREATING,
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

      const excludedTargetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID &&
      entry.operationId ===
        PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_TARGET_CREATING,
      );
      t.ok(excludedTargetSnapshot, 'excluded target partition snapshot should exist');
      t.same(
        decisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED
        ],
        [],
        'a stale excluded target should not block recovery after eligible source-removal evidence satisfies spread',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH
        ],
        [],
        'eligible source-removal evidence should prevent stale excluded-target coordination mismatch',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
        ],
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        'the partition should remain spread-satisfied in flight',
      );
      t.notOk(
        excludedTargetSnapshot.blockerReasons.includes(
          PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED,
        ),
        'the stale excluded-target snapshot should inherit the satisfied partition outcome',
      );
    });

  test('priority recovery decision snapshots do not report completed child ' +
  'ADD operations as eligible-but-no-operation-created', async (t) => {
    const workflowId = 'split-sql_transactions-sql_transactions-p1-v2';
    const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
      capturedAt: 5000,
      publicationConvergence: {
        publicationEpoch: 3,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['node-a', 'node-b', 'node-c'],
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: 'sql_transactions_p_left',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 1,
            spreadGap: 2,
          }],
          missingPartitionIds: ['sql_transactions_p_left'],
          requiredDistinctNodeCount: 3,
        },
        membershipLifecycleSummary: {
          projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
          locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
        },
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {
        [workflowId]: {
          workflowId,
          workflowType: 'managed_split',
          sourcePartitionId: 'sql_transactions-p1',
          targetPartitionIds: ['sql_transactions_p_left', 'sql_transactions_p_right'],
          transitionState: 'failed',
          admissionDecisionAt: '1970-01-01T00:00:05.000Z',
          admission: {
            decisionType: 'admitted',
            eligibleNodeIds: ['node-a', 'node-b', 'node-c'],
            ineligibleNodes: [],
          },
        },
      },
      replicaOperationRows: [{
        operation_id: 'op-add-left-a',
        partition_id: 'sql_transactions_p_left',
        entity_type: 'partition',
        operation_type: 'ADD',
        status: 'active',
        workflow_step: 'ACTIVE',
        source_node_id: 'node-a',
        target_node_id: 'node-a',
        replica_id: 'sql_transactions_p_left-r1',
        created_at: 1000,
        updated_at: 2000,
      }, {
        operation_id: 'op-add-left-b',
        partition_id: 'sql_transactions_p_left',
        entity_type: 'partition',
        operation_type: 'ADD',
        status: 'active',
        workflow_step: 'ACTIVE',
        source_node_id: 'node-a',
        target_node_id: 'node-b',
        replica_id: 'sql_transactions_p_left-r2',
        created_at: 1000,
        updated_at: 2000,
      }, {
        operation_id: 'op-add-left-c',
        partition_id: 'sql_transactions_p_left',
        entity_type: 'partition',
        operation_type: 'ADD',
        status: 'active',
        workflow_step: 'ACTIVE',
        source_node_id: 'node-a',
        target_node_id: 'node-c',
        replica_id: 'sql_transactions_p_left-r3',
        created_at: 1000,
        updated_at: 2000,
      }],
      replicaOperations: {
        operationTimelineById: {
          'op-add-left-a': [
            {step: 'CREATING', status: 'creating', inFlight: true},
            {step: 'ACTIVE', status: 'active', inFlight: false},
          ],
          'op-add-left-b': [
            {step: 'CREATING', status: 'creating', inFlight: true},
            {step: 'ACTIVE', status: 'active', inFlight: false},
          ],
          'op-add-left-c': [
            {step: 'CREATING', status: 'creating', inFlight: true},
            {step: 'ACTIVE', status: 'active', inFlight: false},
          ],
        },
      },
      serviceRows: [],
    });

    t.same(
      decisionSnapshots.partitionIdsBySemanticState.blocked_unclassified,
      ['sql_transactions_p_left'],
      'completed child ADD operations without operational target visibility should stay outside the synthetic no-operation blocker without being misclassified as spread-satisfied',
    );
    t.same(
      decisionSnapshots.blockerPartitionIdsByReason.eligible_but_no_operation_created,
      [],
      'completed child ADD operations should not be misreported as if no operation was ever created',
    );
    t.same(
      decisionSnapshots.blockerPartitionIdsByReason.operation_created_but_no_step_transitions,
      [],
      'completed child ADD operations should not remain in the synthetic operation-stalled blocker bucket either',
    );
    const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === 'sql_transactions_p_left' &&
    entry.operationId === 'op-add-left-a',
    );
    t.ok(targetSnapshot, 'target split child snapshot should exist');
    t.notOk(
      targetSnapshot.blockerReasons.includes(
        'eligible_but_no_operation_created',
      ),
      'completed child add rows should not be misreported as if no operation was ever created',
    );
    t.not(
      targetSnapshot.semanticState,
      'needs_operation',
      'completed child add rows should not stay in the synthetic needs-operation state',
    );
  });

  test('priority recovery closure witness reports stale durable spread once decision snapshots satisfy publication closure',
    async (t) => {
      const decisionSnapshots = {
        publicationEpoch: 9,
        priorityPartitionSummary: {
          satisfied: false,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 3,
          totalPriorityPartitionCount: 1,
          missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
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
        unresolvedSemanticStateIds: [],
        unresolvedSemanticBlockedPartitionIds: [],
        snapshots: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          publication: {
            concreteEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
              PRIORITY_RECOVERY_NODE_ID_C,
            ],
          },
        }],
      };

      const closureWitness = buildPriorityRecoveryClosureWitness({
        decisionSnapshots,
        priorityPartitionSummary: decisionSnapshots.priorityPartitionSummary,
      });

      t.match(closureWitness, {
        state:
        PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE
          .SATISFIED_STALE_PUBLICATION,
        prioritySpreadPending: false,
        publicationRefreshRequired: true,
        closureRecordId:
        PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD,
        closureWitnessClass:
        PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
          .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING,
      });
      t.same(
        closureWitness.blockedPartitionIds,
        [],
        'closure satisfaction should clear the stale blocked-partition view',
      );
      t.match(closureWitness.refreshedPriorityPartitionSummary, {
        satisfied: true,
        requiredDistinctNodeCount: 3,
        readyEligibleNodeCount: 3,
        totalPriorityPartitionCount: 1,
        missingPartitionIds: [],
        blockedPartitions: [],
      });
    });

  test('priority recovery closure witness ignores unresolved non-priority partitions when priority publication closure is already satisfied',
    async (t) => {
      const nonPriorityPartitionId =
      'tbl-b932fa03-3835-4a50-87b4-bd158daed0ea-p1';
      const closureWitness = buildPriorityRecoveryClosureWitness({
        decisionSnapshots: {
          publicationEpoch: 9,
          priorityPartitionSummary: {
            satisfied: false,
            requiredDistinctNodeCount: 3,
            readyEligibleNodeCount: 3,
            totalPriorityPartitionCount: 1,
            missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
            blockedPartitions: [{
              partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
          },
          partitionIdsBySemanticState: {
            converged: [],
            spread_satisfied_in_flight: [PUBLICATION_PRIORITY_PARTITION_ID],
            needs_operation: [],
            operation_stalled: [nonPriorityPartitionId],
            learner_promotion_blocked: [],
            coordination_mismatch: [],
            recovering_in_flight: [],
            blocked_unclassified: [],
          },
          snapshots: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            publication: {
              concreteEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
                PRIORITY_RECOVERY_NODE_ID_C,
              ],
            },
          }, {
            partitionId: nonPriorityPartitionId,
            publication: {
              concreteEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
                PRIORITY_RECOVERY_NODE_ID_C,
              ],
            },
          }],
        },
      });

      t.match(closureWitness, {
        state:
        PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE
          .SATISFIED_STALE_PUBLICATION,
        prioritySpreadPending: false,
      });
      t.same(
        closureWitness.blockedPartitionIds,
        [],
        'non-priority stalls must not block the priority publication closure witness',
      );
      t.notOk(
        closureWitness.decisionPartitionIds.includes(nonPriorityPartitionId),
        'the closure witness should scope itself to tracked priority partitions',
      );
    });

  test('priority recovery decision snapshots treat completed ADD follow-up handoff on an eligible operational target as spread-satisfied',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 6,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 1,
              spreadGap: 2,
            }],
            missingPartitionIds: [REPLICA_OPERATION_PRIORITY_PARTITION_ID],
            requiredDistinctNodeCount: 3,
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
          operation_id: 'op-replica-removed',
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          entity_type: 'partition',
          operation_type: 'REPLACE',
          status: 'removed',
          workflow_step: 'REMOVED',
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id: 'replica_operations-p1-r4',
          created_at: 1000,
          updated_at: 2000,
          completed_at: 2000,
        }, {
          operation_id: 'op-replica-followup-add',
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          entity_type: 'partition',
          operation_type: 'ADD',
          status: 'active',
          workflow_step: 'ACTIVE',
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_C,
          replica_id: 'replica_operations-p1-r5',
          created_at: 2100,
          updated_at: 2600,
          completed_at: 2600,
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-replica-removed': [
              {step: 'SYNCING', status: 'syncing', inFlight: true},
              {step: 'ACTIVE', status: 'active', inFlight: true},
              {step: 'REMOVED', status: 'removed', inFlight: false},
            ],
            'op-replica-followup-add': [
              {step: 'CREATING', status: 'creating', inFlight: true},
              {step: 'SYNCING', status: 'syncing', inFlight: true},
              {step: 'ACTIVE', status: 'active', inFlight: false},
            ],
          },
        },
        serviceRows: [{
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          status: 'active',
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
          node_id: PRIORITY_RECOVERY_NODE_ID_C,
          replica_id: 'replica_operations-p1-r5',
        }],
      });

      t.same(
        decisionSnapshots.partitionIdsBySemanticState,
        {
          converged: [],
          spread_satisfied_in_flight: [REPLICA_OPERATION_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
        'completed ADD follow-up handoff on an eligible operational target should satisfy spread completion on the shared snapshot path',
      );
      t.same(
        decisionSnapshots.unresolvedSemanticStateIds,
        [],
        'the touched partition should no longer remain unresolved once the completed follow-up ADD is operationally visible',
      );

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === REPLICA_OPERATION_PRIORITY_PARTITION_ID &&
      entry.operationId === 'op-replica-followup-add',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.spreadCompletion,
        {
          satisfied: true,
          reasonCode: 'operational_target_visible_on_eligible_node',
          satisfyingOperationIds: ['op-replica-followup-add'],
          satisfyingOperationCount: 1,
          blockingOperationIds: [],
          blockingOperationCount: 0,
        },
        'the completed follow-up ADD should count as spread-satisfying evidence when its target is operationally visible on an eligible node',
      );
      t.equal(
        targetSnapshot.semanticState,
        'spread_satisfied_in_flight',
        'the partition should leave the blocked-unclassified fallback once the completed follow-up ADD is visible',
      );
      t.equal(
        targetSnapshot.completion?.state,
        PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        'completion should preserve the shared spread-satisfied state for the handoff seam',
      );
      t.match(
        targetSnapshot.progress,
        {
          contractState: 'ready',
          nextAction: 'proceed',
          currentOwner: 'none',
          nextRequiredAction: 'none',
          blockingBoundary: 'none',
          waitMode: 'none',
        },
        'the shared progress contract should stop reporting a blocked rebalancer-handoff stall once spread-satisfying evidence is present',
      );
    });

  test('priority recovery decision snapshots treat completed REPLACE on an eligible operational target as spread-satisfied',
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
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            }],
            missingPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
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
        replicaOperationRows: [{
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE,
          partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_REMOVED,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_C,
          replica_id: PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
          created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
          completed_at: PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
        }],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE]: [
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
          },
        },
        serviceRows: [{
          partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          status: PRIORITY_RECOVERY_STATUS_ACTIVE,
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
          node_id: PRIORITY_RECOVERY_NODE_ID_C,
          replica_id: PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
        }],
      });

      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
        ],
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        'completed REPLACE placement should satisfy a stale priority spread summary when the target is active on an eligible node',
      );
      t.same(
        decisionSnapshots.unresolvedSemanticStateIds,
        [],
        'completed REPLACE placement should not keep priority recovery unresolved',
      );

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID &&
      entry.operationId ===
        PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE,
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.spreadCompletion,
        {
          satisfied: true,
          reasonCode:
          PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: [
            PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        'terminal REPLACE rows should remain spread-relevant when they left an operational target',
      );
      t.equal(
        targetSnapshot.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        'completed REPLACE placement should leave the needs-operation state',
      );
    });

  test('priority recovery decision snapshots let completed REPLACE placement override stale pending no-transition blockers',
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
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
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
        replicaOperationRows: [{
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE,
          partition_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_REMOVED,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_C,
          replica_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
          created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
          completed_at: PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
        }, {
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
          partition_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_PENDING,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id: PRIORITY_RECOVERY_REPLICA_ID_SYNCING,
          created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
        }],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE]: [
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
            [PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE]: [{
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              inFlight: true,
            }],
          },
        },
        serviceRows: [{
          partition_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          status: PRIORITY_RECOVERY_STATUS_ACTIVE,
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
          node_id: PRIORITY_RECOVERY_NODE_ID_C,
          replica_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
        }],
      });

      t.same(
        decisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS
        ],
        [],
        'a stale pending REPLACE must not remain a no-transition blocker once completed placement evidence already satisfies spread',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
        ],
        [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
        'completed placement evidence should be canonical for the partition-level state',
      );
      t.same(
        decisionSnapshots.unresolvedSemanticStateIds,
        [],
        'completed placement evidence should close the unresolved priority state',
      );

      const pendingSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId ===
        PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID &&
      entry.operationId ===
        PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
      );
      t.ok(pendingSnapshot, 'pending partition snapshot should exist');
      t.same(
        pendingSnapshot.spreadCompletion,
        {
          satisfied: true,
          reasonCode:
          PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: [
            PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          blockingOperationIds: [
            PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
          ],
          blockingOperationCount: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
        },
        'the stale pending row should remain visible as context without owning the partition outcome',
      );
      t.same(
        pendingSnapshot.blockerReasons,
        [],
        'partition-level spread satisfaction should clear synthetic no-transition blockers',
      );
      t.equal(
        pendingSnapshot.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        'the stale pending row should inherit the partition-level spread-satisfied state',
      );
    });
}
