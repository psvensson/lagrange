import {test} from '../../src/test-helpers/tap.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  buildPriorityRecoveryAdmissionPlan,
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryPublicationContext,
  resolvePriorityRecoveryAdmissionPlanFromPublication,
  resolveTrackedPriorityRecoveryAdmissionPlan,
} from '../../src/control-plane/priority-recovery-snapshot.js';

test('priority recovery admission plan reserves the emergency lane only for emergency blocked partitions',
  async (t) => {
    const ordinaryPlan = buildPriorityRecoveryAdmissionPlan({
      maxConcurrentAdds: 1,
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [{
          partitionId: 'sql_transactions-p1',
          spreadGap: 1,
        }],
      },
      isPriorityPartition: (partitionId) =>
        partitionId === 'sql_transactions-p1',
      isEmergencyPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
    });

    t.equal(
      ordinaryPlan.emergencyRecoveryActive,
      false,
      'ordinary priority recovery should not consume the emergency reservation',
    );
    t.equal(
      ordinaryPlan.getPartitionClass('sql_transactions-p1'),
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY,
      'the canonical plan should classify ordinary priority partitions explicitly',
    );
    t.equal(
      ordinaryPlan.ordinaryPriorityAddBudgetLimit,
      1,
      'ordinary priority partitions should keep the full configured lane when no emergency partitions are blocked',
    );
    t.equal(
      ordinaryPlan.evaluatePriorityAddAdmission(
        'sql_transactions-p1',
        {priorityCount: 0, ordinaryPriorityCount: 0},
      ).reason,
      PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ADMITTED,
      'ordinary priority admission should flow through the canonical decision helper',
    );

    const emergencyPlan = buildPriorityRecoveryAdmissionPlan({
      maxConcurrentAdds: 1,
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [{
          partitionId: 'control_plane_publications-p1',
          spreadGap: 1,
        }],
      },
      isPriorityPartition: (partitionId) => (
        partitionId === 'control_plane_publications-p1' ||
        partitionId === 'sql_transactions-p1'
      ),
      isEmergencyPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
    });

    t.equal(
      emergencyPlan.emergencyRecoveryActive,
      true,
      'critical publication partitions should activate the emergency lane',
    );
    t.equal(
      emergencyPlan.ordinaryPriorityAddBudgetLimit,
      1,
      'ordinary priority partitions should keep the configured lane while the emergency slot remains reserved as overflow',
    );
    t.equal(
      emergencyPlan.emergencyPriorityAddBudgetLimit,
      2,
      'emergency control-plane partitions should get one bounded overflow slot',
    );
    t.equal(
      emergencyPlan.usesEmergencyPriorityOverflow(
        'control_plane_publications-p1',
      ),
      true,
      'the canonical plan should answer emergency-overflow usage directly',
    );
    t.equal(
      emergencyPlan.getReservedNonPrioritySlots('users-p1', 'add'),
      1,
      'non-priority reservations should also flow through the canonical plan contract',
    );
  });

test('priority recovery admission resolution reuses the last active publication summary inside the stale grace window',
  async (t) => {
    const activeResolution = resolvePriorityRecoveryAdmissionPlanFromPublication({
      publicationRow: {
        priority_partition_summary: {
          satisfied: false,
          blockedPartitions: [{
            partitionId: 'control_plane_publications-p1',
            spreadGap: 1,
          }],
        },
      },
      nowMs: 1000,
      maxConcurrentAdds: 2,
      isPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
      isEmergencyPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
    });

    t.equal(
      activeResolution.admissionPlan.recoveryActive,
      true,
      'a live spread gap should create an active admission plan',
    );
    t.equal(
      activeResolution.admissionPlan.admissionSource,
      PRIORITY_RECOVERY_ADMISSION_SOURCE.PUBLICATION_SUMMARY,
      'live publication summaries should be marked as the admission source',
    );

    const staleReuse = resolvePriorityRecoveryAdmissionPlanFromPublication({
      publicationRow: null,
      nowMs: 1400,
      staleGraceMs: 500,
      lastObservedAdmissionPlan: activeResolution.lastObservedAdmissionPlan,
      lastObservedAdmissionPlanAtMs:
        activeResolution.lastObservedAdmissionPlanAtMs,
      maxConcurrentAdds: 2,
      isPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
      isEmergencyPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
    });

    t.equal(
      staleReuse.admissionPlan.recoveryActive,
      true,
      'transient publication read gaps should reuse the last active plan within grace',
    );
    t.equal(
      staleReuse.admissionPlan.admissionSource,
      PRIORITY_RECOVERY_ADMISSION_SOURCE.STALE_ACTIVE_GRACE,
      'stale grace reuse should surface a canonical source reason',
    );

    const staleExpired = resolvePriorityRecoveryAdmissionPlanFromPublication({
      publicationRow: null,
      nowMs: 1700,
      staleGraceMs: 500,
      lastObservedAdmissionPlan: activeResolution.lastObservedAdmissionPlan,
      lastObservedAdmissionPlanAtMs:
        activeResolution.lastObservedAdmissionPlanAtMs,
      maxConcurrentAdds: 2,
      isPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
      isEmergencyPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
    });

    t.equal(
      staleExpired.admissionPlan.recoveryActive,
      false,
      'once the stale grace expires the synthetic active plan should clear',
    );
    t.equal(
      staleExpired.admissionPlan.admissionSource,
      PRIORITY_RECOVERY_ADMISSION_SOURCE.INACTIVE_DEFAULT,
      'expired stale grace should fall back to the inactive default source',
    );
  });

test('tracked priority recovery admission plan updates shared tracker state and reuses it within stale grace',
  async (t) => {
    const tracker = {
      lastObservedAdmissionPlan: null,
      lastObservedAdmissionPlanAtMs: null,
    };

    const activePlan = resolveTrackedPriorityRecoveryAdmissionPlan({
      tracker,
      publicationRow: {
        priority_partition_summary: {
          satisfied: false,
          blockedPartitions: [{
            partitionId: 'control_plane_publications-p1',
            spreadGap: 1,
          }],
        },
      },
      nowMs: 1000,
      staleGraceMs: 500,
      maxConcurrentAdds: 2,
      isPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
      isEmergencyPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
    });

    t.equal(
      activePlan.recoveryActive,
      true,
      'tracked resolution should return the active admission plan',
    );
    t.ok(
      tracker.lastObservedAdmissionPlan,
      'tracked resolution should persist the last active plan into the caller tracker',
    );
    t.equal(
      tracker.lastObservedAdmissionPlanAtMs,
      1000,
      'tracked resolution should persist the observation timestamp',
    );

    const reusedPlan = resolveTrackedPriorityRecoveryAdmissionPlan({
      tracker,
      publicationRow: null,
      nowMs: 1400,
      staleGraceMs: 500,
      maxConcurrentAdds: 2,
      isPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
      isEmergencyPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
    });

    t.equal(
      reusedPlan.recoveryActive,
      true,
      'tracked resolution should reuse the last active plan within stale grace',
    );

    const clearedPlan = resolveTrackedPriorityRecoveryAdmissionPlan({
      tracker,
      publicationRow: null,
      nowMs: 1700,
      staleGraceMs: 500,
      maxConcurrentAdds: 2,
      isPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
      isEmergencyPriorityPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
    });

    t.equal(
      clearedPlan.recoveryActive,
      false,
      'tracked resolution should clear once the stale grace expires',
    );
    t.equal(
      tracker.lastObservedAdmissionPlan,
      null,
      'tracker state should clear after the synthetic active plan expires',
    );
    t.equal(
      tracker.lastObservedAdmissionPlanAtMs,
      null,
      'tracker timestamp should clear after the synthetic active plan expires',
    );
  });

test('priority recovery publication context widens the active cohort from lifecycle projection diagnostics',
  async (t) => {
    const publicationContext = buildPriorityRecoveryPublicationContext({
      publishedActiveNodeIds: ['node-1', 'node-2'],
      membershipLifecycleSummary: {
        publishedActiveNodeIds: ['node-1', 'node-2'],
        projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
        locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
        projectionDiagnostics: {
          recoveryEligibleIncludedNodeIds: ['node-3'],
          livenessFallbackIncludedNodeIds: [],
        },
      },
    });

    t.same(
      publicationContext.recoveryActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'publication context should expose the widened recovery cohort',
    );
    t.equal(
      publicationContext.recoveryActiveNodeSource,
      'locally_eligible_projection',
      'publication context should record the canonical cohort source',
    );
    t.same(
      publicationContext.missingPublishedRecoveryActiveNodeIds,
      ['node-3'],
      'publication context should explain which recovery-active nodes are missing from the published membership',
    );
  });

test('priority recovery decision snapshots classify eligible ACTIVE replace dispatch as spread-satisfied in flight',
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
      'eligible ACTIVE replace dispatch should resolve into the spread-satisfied semantic state',
    );
    t.same(
      decisionSnapshots.unresolvedSemanticStateIds,
      [],
      'spread-satisfied in-flight replace dispatch should not remain in the unresolved semantic set',
    );

    const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === 'control_plane_publications-p1' &&
      entry.operationId === 'op-replace-active',
    );
    t.ok(targetSnapshot, 'target partition snapshot should exist');
    t.same(
      targetSnapshot.blockerReasons,
      [],
      'eligible ACTIVE replace dispatch should stop emitting blocker reasons',
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
      'spread-completion should record the canonical satisfied reason and operation ownership',
    );
    t.equal(
      targetSnapshot.semanticState,
      'spread_satisfied_in_flight',
      'eligible ACTIVE replace dispatch should use the spread-satisfied semantic state',
    );
    t.equal(
      targetSnapshot.completion?.state,
      PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      'decision snapshots should preserve the canonical completion state alongside the semantic state',
    );
    t.same(
      decisionSnapshots.partitionIdsByCompletionState,
      {
        converged: [],
        spread_satisfied_in_flight: ['control_plane_publications-p1'],
        temporary_over_target_allowed: [],
        operation_visibility_deferred: [],
        blocked: [],
      },
      'completion-state aggregation should use the same canonical owner contract',
    );
  });

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
        raft_role: 'voter',
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
