export function registerAdminControlSnapshotPriorityRecoveryDecisionTests({
  test,
  AdminControlSnapshot,
  CONTROL_PLANE_READINESS_DIMENSION,
}) {
  test('AdminControlSnapshot builds priority-recovery decision snapshots with cross-service blockers',
    async (t) => {
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
      });

      const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 1234,
        publicationConvergence: {
          publicationEpoch: 8,
          publicationStatus: 'ACK_PENDING',
          pendingAckNodeIds: ['node-b'],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: 'users-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['orders-p1', 'payments-p1'],
            requiredDistinctNodeCount: 3,
          },
          projectionDiagnostics: {
            recoveryEligibleIncludedNodeIds: ['node-b'],
            readinessExcludedNodeIds: ['node-b'],
            clusterMemberUnhealthyExcludedNodeIds: [],
          },
        },
        readinessByNodeId: {
          'node-b': {
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
            reasons: [{
              code: 'control_plane_publication_pending',
            }],
          },
        },
        workflowAdmissionsByWorkflowId: {
          'wf-users': {
            workflowId: 'wf-users',
            workflowType: 'managed_split',
            sourcePartitionId: 'users-p1',
            admission: {
              decisionType: 'blocked',
              decisionDimension: 'repairEligible',
              eligibleNodeIds: ['node-b'],
              ineligibleNodes: [{
                nodeId: 'node-b',
                reasonCodes: ['control_plane_publication_pending'],
              }],
            },
            blockingReasons: ['priority_spread_gap'],
          },
          'wf-orders': {
            workflowId: 'wf-orders',
            workflowType: 'managed_split',
            sourcePartitionId: 'orders-p1',
            admission: {
              decisionType: 'allowed',
              decisionDimension: 'repairEligible',
              eligibleNodeIds: ['node-c'],
              ineligibleNodes: [],
            },
            blockingReasons: [],
          },
        },
        replicaOperationRows: [{
          operation_id: 'op-1',
          partition_id: 'users-p1',
          entity_type: 'partition',
          status: 'in_progress',
          workflow_step: 'LEARNER_START',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          replica_id: 'rep-1',
          created_at: 100,
          updated_at: 101,
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-1': [{
              step: 'LEARNER_START',
              status: 'running',
              inFlight: true,
            }],
          },
        },
        serviceRows: [{
          partition_id: 'users-p1',
          status: 'active',
          raft_role: 'learner',
          node_id: 'node-b',
        }],
      });

      t.equal(
        decisionSnapshots.snapshotCount,
        3,
        'decision snapshots should include one row per partition/operation correlation key',
      );
      t.same(
        decisionSnapshots.blockerPartitionIdsByReason,
        {
          priority_operation_serial_wait: [],
          eligible_but_no_operation_created: ['orders-p1'],
          operation_created_but_no_step_transitions: ['users-p1'],
          learner_active_but_never_promotable: [],
          publication_recovery_eligible_but_coordinator_excludes_node: ['users-p1'],
        },
        'decision snapshots should expose deterministic blocker classes by partition',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState,
        {
          converged: [],
          spread_satisfied_in_flight: [],
          needs_operation: ['orders-p1'],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: ['users-p1'],
          recovering_in_flight: [],
          blocked_unclassified: ['payments-p1'],
        },
        'decision snapshots should expose canonical partition semantic states',
      );
      t.same(
        decisionSnapshots.unresolvedSemanticStateIds,
        ['needs_operation', 'coordination_mismatch', 'blocked_unclassified'],
        'decision snapshots should report unresolved semantic states',
      );

      const usersSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'users-p1',
      );
      t.ok(usersSnapshot, 'users partition snapshot should exist');
      t.equal(
        usersSnapshot.correlationKey,
        'users-p1|8|op-1',
        'decision snapshots should emit correlation keys with partition, epoch, and operation',
      );
      t.same(
        usersSnapshot.blockerReasons,
        [
          'operation_created_but_no_step_transitions',
          'publication_recovery_eligible_but_coordinator_excludes_node',
        ],
        'users partition should include coordinator, learner, and publication blockers',
      );
      t.equal(
        usersSnapshot.semanticState,
        'coordination_mismatch',
        'decision snapshot should classify blocker precedence into one semantic state',
      );
      t.same(
        usersSnapshot.admission.recoveryEligibleExcludedNodeIds,
        ['node-b'],
        'decision snapshots should surface recovery-eligible nodes excluded by coordinator admission',
      );
    });

  test('AdminControlSnapshot classifies spread-gap partitions with only terminal operations as eligible/no-operation blockers',
    async (t) => {
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-a',
        nowFn: () => 5000,
      });

      const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 12,
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            readyEligibleNodeCount: 2,
            blockedPartitions: [{
              partitionId: 'sql_transaction_participants-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['sql_transaction_participants-p1'],
            requiredDistinctNodeCount: 3,
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: 'op-removed',
          partition_id: 'sql_transaction_participants-p1',
          entity_type: 'partition',
          status: 'removed',
          workflow_step: 'REMOVED',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          replica_id: 'sql_transaction_participants-p1-r4',
          created_at: 1000,
          updated_at: 2000,
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-removed': [{
              step: 'REMOVED',
              status: 'removed',
              inFlight: false,
            }],
          },
        },
        serviceRows: [],
      });

      t.same(
        decisionSnapshots.blockerPartitionIdsByReason,
        {
          priority_operation_serial_wait: [],
          eligible_but_no_operation_created: ['sql_transaction_participants-p1'],
          operation_created_but_no_step_transitions: [],
          learner_active_but_never_promotable: [],
          publication_recovery_eligible_but_coordinator_excludes_node: [],
        },
        'terminal operation history should not mask missing active recovery operations',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState,
        {
          converged: [],
          spread_satisfied_in_flight: [],
          needs_operation: ['sql_transaction_participants-p1'],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
        'terminal-only operation snapshots should still resolve semantic state as needs-operation',
      );

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'sql_transaction_participants-p1' &&
        entry.operationId === 'op-removed',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.blockerReasons,
        ['eligible_but_no_operation_created'],
        'terminal operation context should still emit eligible/no-operation blocker',
      );
      t.equal(
        targetSnapshot.admission.eligibilityEvidenceSource,
        'priority_summary_ready_eligible',
        'terminal-only context should record when needs-operation inference came from the shared priority summary',
      );
      t.equal(
        targetSnapshot.semanticState,
        'needs_operation',
        'terminal-only context should resolve a needs-operation semantic state',
      );
    });

  test('AdminControlSnapshot derives concrete eligible cohorts from publication membership summary',
    async (t) => {
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-a',
        nowFn: () => 5000,
      });

      const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['node-a'],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            readyEligibleNodeCount: 2,
            blockedPartitions: [{
              partitionId: 'replica_operations-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['replica_operations-p1'],
            requiredDistinctNodeCount: 3,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: ['node-b', 'node-c'],
            locallyEligibleNodeIds: ['node-b', 'node-c'],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [],
        replicaOperations: {
          operationTimelineById: {},
        },
        serviceRows: [],
      });

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'replica_operations-p1',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.admission.effectiveEligibleNodeIds,
        ['node-a', 'node-b', 'node-c'],
        'publication membership summary should provide the concrete eligible cohort',
      );
      t.equal(
        targetSnapshot.admission.effectiveEligibleNodeCount,
        3,
        'effective eligible count should match the publication cohort size',
      );
      t.equal(
        targetSnapshot.admission.eligibilityEvidenceSource,
        'publication_membership',
        'publication membership should outrank count-only summary evidence',
      );
      t.equal(
        targetSnapshot.admission.eligibilityCohortComplete,
        true,
        'publication-derived cohorts should be marked complete',
      );
      t.same(
        targetSnapshot.publication.missingPublishedEligibleNodeIds,
        ['node-b', 'node-c'],
        'decision snapshots should expose the concrete eligible nodes still missing from publication',
      );
    });

  test('AdminControlSnapshot reuses replica-operation summary rows when cache rows lag follow-up creation',
    async (t) => {
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-a',
        nowFn: () => 5000,
      });
      const terminalOperationId = 'op-terminal-replace';
      const followupOperationId = 'op-followup-sending';

      const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
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
            projectedServingNodeIds: ['node-a', 'node-b'],
            locallyEligibleNodeIds: ['node-a', 'node-b'],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: terminalOperationId,
          partition_id: 'control_plane_publications-p1',
          entity_type: 'partition',
          operation_type: 'REPLACE',
          status: 'completed',
          workflow_step: 'REMOVED',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          replica_id: 'control_plane_publications-p1-r4',
          created_at: 1000,
          updated_at: 1500,
          completed_at: 1500,
        }],
        replicaOperations: {
          rows: [{
            operation_id: followupOperationId,
            partition_id: 'control_plane_publications-p1',
            entity_type: 'partition',
            operation_type: 'REPLACE',
            status: 'pending',
            workflow_step: 'SENDING',
            source_node_id: 'node-a',
            target_node_id: 'node-b',
            replica_id: 'control_plane_publications-p1-r5',
            created_at: 2000,
            updated_at: 2600,
          }],
          operationTimelineById: {
            [terminalOperationId]: [
              {step: 'ACTIVE', status: 'active', inFlight: true},
              {step: 'REMOVED', status: 'completed', inFlight: false},
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
        entry.partitionId === 'control_plane_publications-p1' &&
        entry.operationId === followupOperationId,
      );
      t.ok(targetSnapshot,
        'summary-backed follow-up creation should remain visible through the admin control snapshot path');
      t.same(
        decisionSnapshots.partitionIdsBySemanticState,
        {
          converged: [],
          spread_satisfied_in_flight: [],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: ['control_plane_publications-p1'],
          blocked_unclassified: [],
        },
        'admin control snapshots should classify the partition from the newer follow-up summary row rather than the stale terminal cache row',
      );
      t.notOk(
        targetSnapshot.blockerReasons.includes(
          'eligible_but_no_operation_created',
        ),
        'admin control snapshots should not reintroduce the synthetic eligible/no-operation blocker once the summary rows show the follow-up operation',
      );
    });

  test('AdminControlSnapshot leaves spread-gap partitions blocked-unclassified when no eligibility evidence exists',
    async (t) => {
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-a',
        nowFn: () => 5000,
      });

      const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 12,
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: 'sql_write_operations-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['sql_write_operations-p1'],
            requiredDistinctNodeCount: 3,
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [],
        replicaOperations: {
          operationTimelineById: {},
        },
        serviceRows: [],
      });

      t.same(
        decisionSnapshots.blockerPartitionIdsByReason,
        {
          priority_operation_serial_wait: [],
          eligible_but_no_operation_created: [],
          operation_created_but_no_step_transitions: [],
          learner_active_but_never_promotable: [],
          publication_recovery_eligible_but_coordinator_excludes_node: [],
        },
        'missing admission evidence should not be reported as eligible/no-operation by default',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState,
        {
          converged: [],
          spread_satisfied_in_flight: [],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: ['sql_write_operations-p1'],
        },
        'spread gaps without eligibility evidence should remain blocked-unclassified',
      );

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'sql_write_operations-p1',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.equal(
        targetSnapshot.admission.eligibilityEvidenceSource,
        'unknown',
        'blocked-unclassified snapshots should retain the lack of eligibility evidence explicitly',
      );
    });

  test('AdminControlSnapshot classifies eligible ACTIVE replace operations as spread-satisfied in flight',
    async (t) => {
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-a',
        nowFn: () => 5000,
      });

      const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
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
            projectedServingNodeIds: ['node-a', 'node-b'],
            locallyEligibleNodeIds: ['node-a', 'node-b'],
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
          raft_role: 'voter',
          node_id: 'node-b',
        }],
      });

      t.same(
        decisionSnapshots.blockerPartitionIdsByReason,
        {
          priority_operation_serial_wait: [],
          eligible_but_no_operation_created: [],
          operation_created_but_no_step_transitions: [],
          learner_active_but_never_promotable: [],
          publication_recovery_eligible_but_coordinator_excludes_node: [],
        },
        'eligible ACTIVE replace operations should stop surfacing blocker reasons',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState,
        {
          converged: [],
          spread_satisfied_in_flight: ['control_plane_publications-p1'],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
        'eligible ACTIVE replace operations should move onto the spread-satisfied semantic lane',
      );

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'control_plane_publications-p1' &&
        entry.operationId === 'op-replace-active',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.blockerReasons,
        [],
        'eligible ACTIVE replace context should no longer emit blocker reasons',
      );
      t.same(
        targetSnapshot.spreadCompletion,
        {
          satisfied: true,
          reasonCode: 'replace_remove_dispatch_phase_on_eligible_target',
          satisfyingOperationIds: ['op-replace-active'],
          satisfyingOperationCount: 1,
          blockingOperationIds: [],
          blockingOperationCount: 0,
        },
        'decision snapshots should surface the canonical spread-completion invariant',
      );
      t.equal(
        targetSnapshot.semanticState,
        'spread_satisfied_in_flight',
        'eligible ACTIVE replace context should resolve onto the spread-satisfied semantic state',
      );
    });

  test('AdminControlSnapshot treats status-only ACTIVE add operations as terminal',
    async (t) => {
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-a',
        nowFn: () => 5000,
      });

      const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 5000,
        publicationConvergence: {
          publicationEpoch: 15,
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            readyEligibleNodeCount: 2,
            blockedPartitions: [{
              partitionId: 'sql_transactions-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['sql_transactions-p1'],
            requiredDistinctNodeCount: 3,
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: 'op-add-active-no-step',
          partition_id: 'sql_transactions-p1',
          entity_type: 'partition',
          operation_type: 'ADD',
          status: 'active',
          workflow_step: 'UNTRACKED',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          replica_id: 'sql_transactions-p1-r4',
          created_at: 1000,
          updated_at: 2000,
        }],
        replicaOperations: {
          operationTimelineById: {
            'op-add-active-no-step': [{
              step: 'UNTRACKED',
              status: 'active',
              inFlight: false,
            }],
          },
        },
        serviceRows: [],
      });

      t.same(
        decisionSnapshots.blockerPartitionIdsByReason,
        {
          priority_operation_serial_wait: [],
          eligible_but_no_operation_created: ['sql_transactions-p1'],
          operation_created_but_no_step_transitions: [],
          learner_active_but_never_promotable: [],
          publication_recovery_eligible_but_coordinator_excludes_node: [],
        },
        'status-only ACTIVE add rows should not be treated as in-flight recovery blockers',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState,
        {
          converged: [],
          spread_satisfied_in_flight: [],
          needs_operation: ['sql_transactions-p1'],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
        'status-only ACTIVE add rows should classify as needs-operation when spread remains blocked',
      );

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === 'sql_transactions-p1' &&
        entry.operationId === 'op-add-active-no-step',
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.same(
        targetSnapshot.blockerReasons,
        ['eligible_but_no_operation_created'],
        'status-only ACTIVE add context should not emit in-flight transition blockers',
      );
      t.equal(
        targetSnapshot.semanticState,
        'needs_operation',
        'status-only ACTIVE add context should resolve needs-operation',
      );
    });
}
