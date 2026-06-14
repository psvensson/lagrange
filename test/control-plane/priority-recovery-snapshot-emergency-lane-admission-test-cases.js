export function registerPriorityRecoverySnapshotEmergencyLaneAdmissionTests(context) {
  const {
    buildPriorityRecoveryAdmissionPlan,
    buildPriorityRecoveryDecisionSnapshot,
    buildPriorityRecoveryDecisionSnapshots,
    buildPriorityRecoveryPublicationContext,
    CONTROL_PLANE_READINESS_DIMENSION,
    isPriorityRecoveryEmergencyPartition,
    PRIORITY_RECOVERY_ACTIVE_SOURCE_REMOVAL_AGE_MS,
    PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
    PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
    PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
    PRIORITY_RECOVERY_ADMISSION_SOURCE,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_DUAL_EMERGENCY_BUDGET_LIMIT,
    PRIORITY_RECOVERY_DUAL_EMERGENCY_OVERFLOW_SLOT_COUNT,
    PRIORITY_RECOVERY_DUAL_PRIORITY_IN_FLIGHT_COUNT,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_NODE_ID_C,
    PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
    PRIORITY_RECOVERY_OPERATION_ID_SYNCING,
    PRIORITY_RECOVERY_OPERATION_TYPE_ADD,
    PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
    PRIORITY_RECOVERY_RAFT_ROLE_LEARNER,
    PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
    PRIORITY_RECOVERY_REASON_CLUSTER_MEMBER_UNHEALTHY,
    PRIORITY_RECOVERY_REASON_CONTROL_PLANE_WRITE_UNHEALTHY,
    PRIORITY_RECOVERY_REPLICA_ID_SYNCING,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SINGLE_ADD_BUDGET_LIMIT,
    PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
    PRIORITY_RECOVERY_SINGLE_EMERGENCY_OVERFLOW_SLOT_COUNT,
    PRIORITY_RECOVERY_SINGLE_PRIORITY_IN_FLIGHT_COUNT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_ACTIVE,
    PRIORITY_RECOVERY_STATUS_CREATING,
    PRIORITY_RECOVERY_STATUS_SYNCING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
    PUBLICATION_PRIORITY_PARTITION_ID,
    REPLICA_OPERATION_PRIORITY_PARTITION_ID,
    resolvePriorityRecoveryAdmissionPlanFromPublication,
    resolveTrackedPriorityRecoveryAdmissionPlan,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test('priority recovery emergency classification stays narrower than transport-critical routing',
    async (t) => {
      t.equal(
        isPriorityRecoveryEmergencyPartition(PUBLICATION_PRIORITY_PARTITION_ID),
        true,
        'publication partitions should retain the emergency overflow lane',
      );
      t.equal(
        isPriorityRecoveryEmergencyPartition(REPLICA_OPERATION_PRIORITY_PARTITION_ID),
        true,
        'replica-operation partitions should retain the emergency overflow lane',
      );
      t.equal(
        isPriorityRecoveryEmergencyPartition(SQL_TRANSACTION_PRIORITY_PARTITION_ID),
        false,
        'transaction partitions should remain ordinary priority recovery work',
      );
    });

  test('priority recovery admission plan reserves the emergency lane only for emergency blocked partitions',
    async (t) => {
      const ordinaryPlan = buildPriorityRecoveryAdmissionPlan({
        maxConcurrentAdds: PRIORITY_RECOVERY_SINGLE_ADD_BUDGET_LIMIT,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitions: [{
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
        },
        isPriorityPartition: (partitionId) =>
          partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        isEmergencyPriorityPartition: (partitionId) =>
          partitionId === PUBLICATION_PRIORITY_PARTITION_ID,
      });

      t.equal(
        ordinaryPlan.emergencyRecoveryActive,
        false,
        'ordinary priority recovery should not consume the emergency reservation',
      );
      t.equal(
        ordinaryPlan.getPartitionClass(SQL_TRANSACTION_PRIORITY_PARTITION_ID),
        PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY,
        'the canonical plan should classify ordinary priority partitions explicitly',
      );
      t.equal(
        ordinaryPlan.ordinaryPriorityAddBudgetLimit,
        PRIORITY_RECOVERY_SINGLE_ADD_BUDGET_LIMIT,
        'ordinary priority partitions should keep the full configured lane when no emergency partitions are blocked',
      );
      t.equal(
        ordinaryPlan.evaluatePriorityAddAdmission(
          SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          {
            priorityCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            ordinaryPriorityCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
        ).reason,
        PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ADMITTED,
        'ordinary priority admission should flow through the canonical decision helper',
      );

      const emergencyPlan = buildPriorityRecoveryAdmissionPlan({
        maxConcurrentAdds: PRIORITY_RECOVERY_SINGLE_ADD_BUDGET_LIMIT,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
        },
        isPriorityPartition: (partitionId) => (
          partitionId === PUBLICATION_PRIORITY_PARTITION_ID ||
        partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID
        ),
        isEmergencyPriorityPartition: (partitionId) =>
          partitionId === PUBLICATION_PRIORITY_PARTITION_ID,
      });

      t.equal(
        emergencyPlan.emergencyRecoveryActive,
        true,
        'critical publication partitions should activate the emergency lane',
      );
      t.equal(
        emergencyPlan.ordinaryPriorityAddBudgetLimit,
        PRIORITY_RECOVERY_SINGLE_ADD_BUDGET_LIMIT,
        'ordinary priority partitions should keep the configured lane while the emergency slot remains reserved as overflow',
      );
      t.equal(
        emergencyPlan.emergencyPriorityOverflowSlotCount,
        PRIORITY_RECOVERY_SINGLE_EMERGENCY_OVERFLOW_SLOT_COUNT,
        'a single blocked emergency owner should reserve one emergency overflow slot',
      );
      t.equal(
        emergencyPlan.emergencyPriorityAddBudgetLimit,
        PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
        'emergency control-plane partitions should get one bounded overflow slot',
      );
      t.equal(
        emergencyPlan.usesEmergencyPriorityOverflow(
          PUBLICATION_PRIORITY_PARTITION_ID,
        ),
        true,
        'the canonical plan should answer emergency-overflow usage directly',
      );
      t.equal(
        emergencyPlan.getReservedNonPrioritySlots('users-p1', 'add'),
        1,
        'non-priority reservations should also flow through the canonical plan contract',
      );

      const dualEmergencyPlan = buildPriorityRecoveryAdmissionPlan({
        maxConcurrentAdds: PRIORITY_RECOVERY_SINGLE_ADD_BUDGET_LIMIT,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }, {
            partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
        },
        isPriorityPartition: (partitionId) => (
          partitionId === PUBLICATION_PRIORITY_PARTITION_ID ||
        partitionId === REPLICA_OPERATION_PRIORITY_PARTITION_ID ||
        partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID
        ),
        isEmergencyPriorityPartition: (partitionId) => (
          partitionId === PUBLICATION_PRIORITY_PARTITION_ID ||
        partitionId === REPLICA_OPERATION_PRIORITY_PARTITION_ID
        ),
      });

      t.equal(
        dualEmergencyPlan.emergencyPriorityOverflowSlotCount,
        PRIORITY_RECOVERY_DUAL_EMERGENCY_OVERFLOW_SLOT_COUNT,
        'distinct emergency recovery owners should each contribute one overflow slot',
      );
      t.equal(
        dualEmergencyPlan.emergencyPriorityAddBudgetLimit,
        PRIORITY_RECOVERY_DUAL_EMERGENCY_BUDGET_LIMIT,
        'dual emergency recovery should keep publication and replica-operation scheduling independent',
      );
      t.equal(
        dualEmergencyPlan.evaluatePriorityAddAdmission(
          REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          {
            priorityCount: PRIORITY_RECOVERY_DUAL_PRIORITY_IN_FLIGHT_COUNT,
            ordinaryPriorityCount: PRIORITY_RECOVERY_SINGLE_PRIORITY_IN_FLIGHT_COUNT,
            emergencyPriorityCount: PRIORITY_RECOVERY_SINGLE_PRIORITY_IN_FLIGHT_COUNT,
          },
        ).reason,
        PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ADMITTED,
        'the second emergency owner should remain admitted after ordinary priority and the first emergency owner are already in flight',
      );
      t.equal(
        dualEmergencyPlan.evaluatePriorityAddAdmission(
          SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          {
            priorityCount: PRIORITY_RECOVERY_SINGLE_PRIORITY_IN_FLIGHT_COUNT,
            ordinaryPriorityCount: PRIORITY_RECOVERY_SINGLE_PRIORITY_IN_FLIGHT_COUNT,
          },
        ).reason,
        PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ORDINARY_PRIORITY_LANE_EXHAUSTED,
        'ordinary priority scheduling should still respect the configured lane while emergency overflow is reserved',
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

  test('priority recovery single decision snapshots reuse deferred owner visibility without inventing a second grammar',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: 'sql_transactions-p1',
        capturedAt: 9000,
        publicationConvergence: {
          publicationEpoch: 13,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['node-a'],
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
        operationId: 'op-runtime-sending',
        operationContexts: [{
          operationId: 'op-runtime-sending',
          partitionId: 'sql_transactions-p1',
          type: 'REPLACE',
          status: 'pending',
          workflowStep: 'SENDING',
          sourceNodeId: 'node-a',
          targetNodeId: 'node-b',
          replicaId: 'sql_transactions-p1-r4',
          createdAtMs: 1000,
          updatedAtMs: 2000,
          timelineLength: 2,
          timelineStepCount: 2,
          latestTimelineStep: 'SENDING',
          latestTimelineStatus: 'pending',
          latestTimelineInFlight: true,
        }],
        authoritativeOperationReadDeferred: true,
      });

      t.equal(
        snapshot?.completion?.state,
        PRIORITY_RECOVERY_COMPLETION_STATE.OPERATION_VISIBILITY_DEFERRED,
        'the single-partition runtime snapshot should preserve the canonical deferred completion state',
      );
      t.same(
        snapshot?.observation,
        {
          workflowState: 'in_flight',
          visibilityState: 'deferred',
          convergenceState: 'spread_gap',
          provenance: {
            capturedAt: 9000,
            workflowSource: 'system_table_cache',
            timelineSource: 'replica_operation_timeline',
            semanticSource: 'priority_recovery_snapshot',
          },
        },
        'the single-partition runtime snapshot should reuse the existing workflow/visibility/convergence grammar',
      );
      t.same(
        snapshot?.admission?.effectiveEligibleNodeIds,
        ['node-a', 'node-b'],
        'the single-partition runtime snapshot should reuse the published recovery cohort instead of rebuilding a separate eligible-node contract',
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
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
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
        targetSnapshot.observation,
        {
          workflowState: 'remove_phase',
          visibilityState: 'cache_visible',
          convergenceState: 'spread_satisfied_in_flight',
          provenance: {
            capturedAt: 5000,
            workflowSource: 'system_table_cache',
            timelineSource: 'replica_operation_timeline',
            semanticSource: 'priority_recovery_snapshot',
          },
        },
        'decision snapshots should preserve the unified workflow/visibility/convergence observation contract',
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

  test(
    'priority recovery decision snapshots keep recovery-cohort learners promotable ' +
    'before broader node readiness recovers',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: 7000,
        publicationConvergence: {
          publicationEpoch: 6,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: [PRIORITY_RECOVERY_NODE_ID_A],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 1,
              spreadGap: 2,
            }],
            missingPartitionIds: [
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            ],
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
        readinessByNodeId: {
          [PRIORITY_RECOVERY_NODE_ID_B]: {
            nodeId: PRIORITY_RECOVERY_NODE_ID_B,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              false,
            },
            reasons: [
              {code: PRIORITY_RECOVERY_REASON_CLUSTER_MEMBER_UNHEALTHY},
              {code: PRIORITY_RECOVERY_REASON_CONTROL_PLANE_WRITE_UNHEALTHY},
            ],
          },
        },
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_SYNCING,
          partition_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          entity_type: 'partition',
          operation_type: 'REPLACE',
          status: PRIORITY_RECOVERY_STATUS_SYNCING,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id: PRIORITY_RECOVERY_REPLICA_ID_SYNCING,
          created_at: 1000,
          updated_at: 2000,
        }],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_SYNCING]: [{
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
              status: PRIORITY_RECOVERY_STATUS_CREATING,
              inFlight: true,
            }, {
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
              status: PRIORITY_RECOVERY_STATUS_SYNCING,
              inFlight: true,
            }],
          },
        },
        serviceRows: [{
          partition_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          status: PRIORITY_RECOVERY_STATUS_ACTIVE,
          raft_role: PRIORITY_RECOVERY_RAFT_ROLE_LEARNER,
          node_id: PRIORITY_RECOVERY_NODE_ID_B,
        }],
      });

      t.same(
        decisionSnapshots.partitionIdsBySemanticState,
        {
          converged: [],
          spread_satisfied_in_flight: [],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          ],
          blocked_unclassified: [],
        },
        'active learners inside the recovery cohort should remain ordinary in-flight recovery work',
      );

      const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId ===
        PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID &&
      entry.operationId === PRIORITY_RECOVERY_OPERATION_ID_SYNCING,
      );
      t.ok(targetSnapshot, 'target partition snapshot should exist');
      t.equal(
        targetSnapshot.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        'recovery-cohort learners should not collapse into the learner-promotion blocker state',
      );
      t.same(
        targetSnapshot.readiness?.learnerPromotion?.promotableLearnerNodeIds,
        [PRIORITY_RECOVERY_NODE_ID_B],
        'the recovery-active learner should stay promotable while the broader readiness snapshot catches up',
      );
      t.same(
        targetSnapshot.readiness?.learnerPromotion?.learnerHoldByNodeId,
        {},
        'the recovery-cohort learner should not emit a synthetic hold reason',
      );
    },
  );

  test(
    'priority recovery decision snapshots expose ordinary serial-lane wait separately from missing operation creation',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_ACTIVE_SOURCE_REMOVAL_AGE_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: [PRIORITY_RECOVERY_NODE_ID_A],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            }, {
              partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            }, {
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            }],
            missingPartitionIds: [
              SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
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
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
          partition_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_ADD,
          status: PRIORITY_RECOVERY_STATUS_CREATING,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id:
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
          created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
        }],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD]: [{
              step: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
              status: PRIORITY_RECOVERY_STATUS_CREATING,
              inFlight: true,
            }],
          },
        },
        serviceRows: [],
      });

      t.same(
        decisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
        ],
        [
          SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        'ordinary priority partitions waiting behind the serial lane should get a dedicated progress class',
      );
      t.same(
        decisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
        ],
        [],
        'serial-lane wait should not be reported as no operation created',
      );
      const waitingSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
      );
      t.ok(waitingSnapshot, 'waiting partition snapshot should exist');
      t.match(
        waitingSnapshot.progress,
        {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
        'serial-lane wait should point at the in-flight workflow owner',
      );
      t.match(
        waitingSnapshot.actuation,
        {
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
        },
        'serial-lane wait should defer actuation instead of creating duplicate work',
      );
      t.same(
        waitingSnapshot.coordinator.serialWaitOperationIds,
        [PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD],
        'serial wait evidence should identify the operation that owns the lane',
      );
    },
  );
}
