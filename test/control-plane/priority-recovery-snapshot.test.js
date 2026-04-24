import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  buildPriorityRecoveryAdmissionPlan,
  buildPriorityRecoveryClosureWitness,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryPublicationContext,
  isPriorityRecoveryEmergencyPartition,
  PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
  resolvePriorityRecoveryAdmissionPlanFromPublication,
  resolveTrackedPriorityRecoveryAdmissionPlan,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {buildPriorityRecoveryObservationSnapshot} from
  '../../src/control-plane/priority-recovery-observation-snapshot.js';

const PUBLICATION_PRIORITY_PARTITION_ID = 'control_plane_publications-p1';
const REPLICA_OPERATION_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const SQL_TRANSACTION_PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE =
  'operational_target_visible_on_eligible_node';
const PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT =
  'recovering_in_flight';
const PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE = 'cache_visible';
const PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT = 'in_flight';
const PRIORITY_RECOVERY_NODE_ID_A = 'node-a';
const PRIORITY_RECOVERY_NODE_ID_B = 'node-b';
const PRIORITY_RECOVERY_NODE_ID_C = 'node-c';
const PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID =
  'sql_transaction_participants-p1';
const PRIORITY_RECOVERY_OPERATION_ID_SYNCING = 'op-replace-syncing';
const PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE = 'op-terminal-replace';
const PRIORITY_RECOVERY_REPLICA_ID_SYNCING =
  'sql_transaction_participants-p1-r4';
const PRIORITY_RECOVERY_REASON_CLUSTER_MEMBER_UNHEALTHY =
  'cluster_member_unhealthy';
const PRIORITY_RECOVERY_ADMISSION_STATE_BLOCKED = 'blocked';
const PRIORITY_RECOVERY_ADMISSION_REASON_CLUSTER_INTEGRITY =
  'cluster_incarnation_identity_mismatch';
const PRIORITY_RECOVERY_BLOCKED_FENCE = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze([
    PRIORITY_RECOVERY_ADMISSION_REASON_CLUSTER_INTEGRITY,
  ]),
});
const PRIORITY_RECOVERY_REASON_CONTROL_PLANE_WRITE_UNHEALTHY =
  'control_plane_write_unhealthy';
const PRIORITY_RECOVERY_STATUS_ACTIVE = 'active';
const PRIORITY_RECOVERY_STATUS_COMPLETED = 'completed';
const PRIORITY_RECOVERY_STATUS_CREATING = 'creating';
const PRIORITY_RECOVERY_STATUS_SYNCING = 'syncing';
const PRIORITY_RECOVERY_RAFT_ROLE_LEARNER = 'learner';
const PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING = 'CREATING';
const PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING = 'SYNCING';
const PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE = 'ACTIVE';
const PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED = 'REMOVED';
const PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING = 'pending';
const PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED = 'blocked';
const PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_DEFERRED = 'deferred';
const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT = 'wait';
const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY = 'retry';
const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP = 'stop';
const PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW = 'operation_workflow_owner';
const PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER = 'rebalancer_leader';
const PRIORITY_RECOVERY_PROGRESS_OWNER_VISIBILITY =
  'authoritative_visibility_owner';
const PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS =
  'wait_for_operation_progress';
const PRIORITY_RECOVERY_PROGRESS_ACTION_RECONCILE_STALE_OPERATION =
  'reconcile_stale_operation_progress';
const PRIORITY_RECOVERY_PROGRESS_ACTION_OBSERVE_VISIBILITY =
  'observe_authoritative_visibility';
const PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION =
  'create_recovery_operation';
const PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW = 'workflow_progress';
const PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW_TIMEOUT =
  'workflow_timeout';
const PRIORITY_RECOVERY_PROGRESS_BOUNDARY_VISIBILITY =
  'authoritative_visibility';
const PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING =
  'operation_scheduling';
const PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN = 'event_driven';
const PRIORITY_RECOVERY_PROGRESS_WAIT_RETRY_SCHEDULED = 'retry_scheduled';
const PRIORITY_RECOVERY_PROGRESS_WAIT_TIMEOUT_RECONCILE_DUE =
  'timeout_reconcile_due';
const PRIORITY_RECOVERY_PROGRESS_WAIT_DEFERRED_VISIBILITY =
  'deferred_visibility';
const PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED = 'stalled';
const PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION = 'target_creation';
const PRIORITY_RECOVERY_CREATING_TIMEOUT_MS = 60000;
const PRIORITY_RECOVERY_ACTUATION_STATE_NO_ACTION_NEEDED =
  'no_action_needed';
const PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED =
  'action_required';
const PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED = 'dispatched';
const PRIORITY_RECOVERY_ACTUATION_STATE_AWAITING_OBSERVATION =
  'awaiting_observation';
const PRIORITY_RECOVERY_ACTUATION_STATE_RECONCILE_DUE = 'reconcile_due';
const PRIORITY_RECOVERY_ACTUATION_STATE_COMPLETED = 'completed';
const PRIORITY_RECOVERY_ACTUATION_STATE_PERSIST_FAILED_RETRYABLE =
  'persist_failed_retryable';
const PRIORITY_RECOVERY_ACTUATION_STATE_PERSIST_BLOCKED_BY_PRESSURE =
  'persist_blocked_by_pressure';
const PRIORITY_RECOVERY_PRESSURE_STATE_NONE = 'none';
const PRIORITY_RECOVERY_PRESSURE_STATE_WRITE_BACKLOG = 'write_backlog';
const PRIORITY_RECOVERY_PRESSURE_STATE_BACKPRESSURED = 'backpressured';
const PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT =
  'operation_context';
const PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE = 'workflow_state';
const PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS =
  'last_progress_timestamp';
const PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS =
  'operation_created_but_no_step_transitions';
const PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY =
  'op-visible-from-operation-object';
const PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT = Object.freeze({
  partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
  operationId: PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
  type: 'REPLACE',
  status: PRIORITY_RECOVERY_STATUS_COMPLETED,
  workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
  targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
  updatedAtMs: 1400,
  completedAtMs: 1500,
  timelineLength: 3,
  timelineStepCount: 3,
  latestTimelineStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
  latestTimelineStatus: PRIORITY_RECOVERY_STATUS_COMPLETED,
  latestTimelineInFlight: false,
});

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
      state: PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED,
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

test('priority recovery decision snapshot emits one workflow-owned timeout-reconcile-due contract for overdue creating work',
  async (t) => {
    const capturedAtMs = 62050;
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
      capturedAt: capturedAtMs,
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
        operationId: 'op-overdue-creating',
        type: 'REPLACE',
        status: PRIORITY_RECOVERY_STATUS_CREATING,
        workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
        targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
        updatedAtMs: 1000,
        timelineLength: 2,
        timelineStepCount: 2,
      }],
    });

    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_RECONCILE_STALE_OPERATION,
      blockingBoundary:
        PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW_TIMEOUT,
      waitMode:
        PRIORITY_RECOVERY_PROGRESS_WAIT_TIMEOUT_RECONCILE_DUE,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
      stepAgeMs: capturedAtMs - 1000,
      stepTimeoutMs: PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
      lastProgressAtMs: 1000,
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_RECONCILE_DUE,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
      stepAgeMs: capturedAtMs - 1000,
      stepTimeoutMs: PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
      lastProgressAtMs: 1000,
      timeoutReconcileDue: true,
    });
    t.match(snapshot?.conditions, {
      pressure: {
        pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
      },
    });

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: capturedAtMs,
        publicationEpoch: 3,
        snapshots: [snapshot],
      },
    });
    const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];

    t.match(partitionSnapshot, {
      progressContractState:
        PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      progressNextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_RECONCILE_STALE_OPERATION,
      blockingBoundary:
        PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW_TIMEOUT,
      waitMode:
        PRIORITY_RECOVERY_PROGRESS_WAIT_TIMEOUT_RECONCILE_DUE,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
      stepAgeMs: capturedAtMs - 1000,
      stepTimeoutMs: PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
    });
  });

test('priority recovery decision snapshot emits one visibility-owned deferred progress contract when authoritative reads are deferred',
  async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
      priorityPartitionSummary: {
        blockedPartitions: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 1,
          spreadGap: 2,
        }],
      },
      admission: {
        effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
        effectiveEligibleNodeCount: 1,
        ineligibleNodes: [],
      },
      authoritativeOperationReadDeferred: true,
    });

    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_DEFERRED,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_VISIBILITY,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_OBSERVE_VISIBILITY,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_VISIBILITY,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_DEFERRED_VISIBILITY,
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_AWAITING_OBSERVATION,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_VISIBILITY,
      timeoutReconcileDue: false,
    });
    t.match(snapshot?.conditions, {
      authoritativeOperationReadDeferred: true,
    });
  });

test('priority recovery observation snapshots preserve the rebalancer-owned actionable handoff contract after a terminal replace with no follow-up operation',
  async (t) => {
    const decisionSnapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
      publicationEpoch: 9,
      priorityPartitionSummary: {
        blockedPartitions: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }],
      },
      admission: {
        effectiveEligibleNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        effectiveEligibleNodeCount: 2,
        ineligibleNodes: [],
      },
      operationContexts: [PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT],
    });

    t.match(decisionSnapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      lastProgressAtMs: 1500,
    });
    t.match(decisionSnapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      lastProgressAtMs: 1500,
      timeoutReconcileDue: false,
    });
    t.ok(
      decisionSnapshot?.progress?.evidenceSourceIds?.includes(
        PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
      ),
      'the progress contract should preserve the latest progress timestamp as evidence',
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 2000,
        publicationEpoch: 9,
        snapshots: [decisionSnapshot],
      },
    });
    const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];

    t.match(partitionSnapshot, {
      progressContractState:
        PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      progressNextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      lastProgressAtMs: 1500,
    });
  });

test('priority recovery observation snapshots preserve operation ids from ' +
  'normalized operation objects',
  async (t) => {
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 2000,
        publicationEpoch: 9,
        snapshots: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
          ],
          planner: {
            spreadGap: 1,
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_B,
              PRIORITY_RECOVERY_NODE_ID_C,
            ],
          },
          coordinator: {
            operationCount: 1,
            operation: {
              operationId: PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
              status: PRIORITY_RECOVERY_STATUS_CREATING,
              updatedAtMs: 1500,
            },
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs: 1500,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          },
        }],
      },
    });
    const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses[0];

    t.same(
      partitionSnapshot.operationIds,
      [PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY],
      'partition snapshots should retain operation id evidence from the ' +
        'normalized operation object',
    );
    t.same(
      partitionWitness.operationIds,
      [PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY],
      'partition witnesses should not report operation absence when operation evidence exists',
    );
    t.ok(
      partitionWitness.witnessIds.includes(
        PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY,
      ),
      'operation ids should remain part of the witness id set for harness diagnostics',
    );
  });

test('priority recovery observation snapshots prefer explicit semantic-state indexes over local fallback inference',
  async (t) => {
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
      'observation snapshots should consume the explicit decision-layer semantic-state mapping before any local inference',
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [PUBLICATION_PRIORITY_PARTITION_ID],
      'semantic-state indexes should preserve the explicit authoritative mapping',
    );
    t.same(
      observationSnapshot.priorityRecoveryUnresolvedPartitionIds,
      [],
      'explicit spread-satisfied mapping should keep the partition out of the unresolved set',
    );
  });

test('priority recovery observation snapshots summarize the current partition state from the latest snapshot instead of historical unions',
  async (t) => {
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 3000,
        publicationEpoch: 9,
        priorityPartitionSummary: {
          satisfied: true,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 3,
          totalPriorityPartitionCount: 1,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
        snapshots: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
          ],
          planner: {
            ready: false,
            requiredDistinctNodeCount: 3,
            spreadGap: 1,
          },
          completion: {
            state: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: 'converging',
            provenance: {
              capturedAt: 1000,
            },
          },
        }, {
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
            workflowState: 'remove_phase',
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: 'converged',
            provenance: {
              capturedAt: 2000,
            },
          },
        }],
      },
    });

    t.same(
      observationSnapshot.priorityRecoverySemanticStateIds,
      [],
      'historical blocked semantic states should not remain unresolved once the latest snapshot is spread-satisfied',
    );
    t.same(
      observationSnapshot.priorityRecoveryBlockedPartitionIds,
      [],
      'current blocked partition ids should follow the latest partition snapshot instead of historical unions',
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [PUBLICATION_PRIORITY_PARTITION_ID],
      'the latest spread-satisfied snapshot should own the current semantic-state summary',
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .recovering_in_flight,
      [],
      'the old recovering-in-flight snapshot should remain history only',
    );
    t.equal(
      observationSnapshot.priorityRecoveryPartitionSnapshots[0].semanticStateId,
      PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
      'partition witnesses should align with the current spread-satisfied snapshot',
    );
  });

test('priority recovery observation snapshots scope the current summary to tracked priority partitions',
  async (t) => {
    const nonPriorityPartitionId =
      'tbl-b932fa03-3835-4a50-87b4-bd158daed0ea-p1';
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 3000,
        publicationEpoch: 9,
        priorityPartitionSummary: {
          satisfied: true,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 3,
          totalPriorityPartitionCount: 1,
          missingPartitionIds: [],
          blockedPartitions: [],
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
            workflowState: 'remove_phase',
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: 'converged',
            provenance: {
              capturedAt: 2000,
            },
          },
        }, {
          partitionId: nonPriorityPartitionId,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
          ],
          planner: {
            ready: false,
          },
          completion: {
            state: 'operation_stalled',
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: 'converging',
            provenance: {
              capturedAt: 3000,
            },
          },
        }],
      },
    });

    t.same(
      observationSnapshot.priorityRecoveryProgressClassIds,
      [],
      'non-priority workflow blockers must not survive as current priority-recovery progress classes',
    );
    t.same(
      observationSnapshot.priorityRecoverySemanticStateIds,
      [],
      'non-priority semantic blockers must not survive as current priority-recovery semantic states',
    );
    t.same(
      observationSnapshot.priorityRecoveryBlockedPartitionIds,
      [],
      'non-priority stalled partitions must not remain current priority-recovery blocked partitions',
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [PUBLICATION_PRIORITY_PARTITION_ID],
      'tracked priority partitions should continue to own the current semantic-state summary',
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .operation_stalled,
      [],
      'non-priority partitions should be cut out of the current priority-recovery semantic-state summary',
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionWitnesses.map(
        (partitionWitness) => partitionWitness.partitionId,
      ),
      [PUBLICATION_PRIORITY_PARTITION_ID],
      'partition witnesses should follow the tracked priority-recovery scope',
    );
  });

test('priority recovery observation snapshots do not invent semantic state when the decision-layer semantic-state contract is present but omits the partition',
  async (t) => {
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 2000,
        publicationEpoch: 9,
        partitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [],
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
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState:
              PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: 'converging',
            provenance: {
              capturedAt: 2000,
            },
          },
          progress: {
            contractState:
              PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
            blockingBoundary:
              PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
            evidenceSourceIds: [],
          },
          coordinator: {
            operationCount: 1,
          },
        }],
      },
    });
    const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];

    t.equal(
      partitionSnapshot.semanticStateId,
      null,
      'observation snapshots should leave semantic state unset instead of re-inferring it when the decision layer already published the semantic-state contract',
    );
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .operation_stalled,
      [],
      'the semantic-state index should remain authoritative rather than being backfilled from local inference',
    );
    t.same(
      partitionSnapshot.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS],
      'blocked progress evidence should remain available even when semantic state is intentionally unset',
    );
  });

test('priority recovery observation snapshots prefer the closure witness over stale publication spread metadata',
  async (t) => {
    const OBSERVATION_STALE_REASON_CODE = 'priority_partitions_not_spread';
    const OBSERVATION_RECOVERY_PROTOCOL_STATE = 'priority_spread_pending';
    const stalePriorityPartitionSummary = {
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
      blockedPartitionCount: 1,
      largestSpreadGap: 1,
      totalSpreadGap: 1,
    };
    const decisionSnapshots = {
      capturedAt: 2000,
      publicationEpoch: 9,
      priorityPartitionSummary: stalePriorityPartitionSummary,
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
        publication: {
          concreteEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
        },
      }],
    };
    const stalePublicationConvergenceGate = {
      state: 'priority_spread_pending',
      ready: false,
      active: true,
      publicationEpoch: 9,
      publicationStatus: 'PUBLISHED',
      recoveryProtocolState: OBSERVATION_RECOVERY_PROTOCOL_STATE,
      reasonCodes: [OBSERVATION_STALE_REASON_CODE],
      priorityPartitionSummary: stalePriorityPartitionSummary,
      pendingAckNodeIds: [],
      missingPublishedNodeIds: [],
      publicationPending: false,
      prioritySpreadPending: true,
    };
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      publicationConvergence: {
        publicationEpoch: 9,
        publicationStatus: 'PUBLISHED',
        recoveryProtocolState: OBSERVATION_RECOVERY_PROTOCOL_STATE,
        publishedActiveNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        pendingAckNodeIds: [],
        priorityRecoveryReasonCodes: [OBSERVATION_STALE_REASON_CODE],
        priorityPartitionSummary: stalePriorityPartitionSummary,
      },
      publicationConvergenceGate: stalePublicationConvergenceGate,
      priorityRecoveryDecisionSnapshots: decisionSnapshots,
    });

    t.equal(
      observationSnapshot.prioritySpreadPending,
      false,
      'a satisfied closure witness should keep stale spread metadata from reopening the observation gate',
    );
    t.equal(
      observationSnapshot.priorityRecoveryClosureState,
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION,
    );
    t.equal(
      observationSnapshot.closureRecordId,
      PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD,
    );
    t.equal(
      observationSnapshot.closureWitnessClass,
      PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
        .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING,
    );
    t.same(
      observationSnapshot.priorityRecoveryReasonCodes,
      [],
      'stale publication reason codes should be dropped once the closure witness says spread is satisfied',
    );
    t.same(
      observationSnapshot.publicationConvergenceGateReasons,
      [],
      'the synthesized observation gate should stay ready after applying the closure witness',
    );
    t.match(observationSnapshot.priorityPartitionSummary, {
      satisfied: true,
      blockedPartitionCount: 0,
      largestSpreadGap: 0,
      totalSpreadGap: 0,
    });
    t.same(observationSnapshot.priorityRecoveryBlockedPartitionIds, []);
    t.equal(observationSnapshot.priorityRecoveryBlockedPartitionCount, 0);
    t.same(observationSnapshot.priorityRecoveryUnresolvedPartitionIds, []);
    t.equal(observationSnapshot.priorityRecoveryUnresolvedPartitionCount, 0);
    t.same(
      observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [PUBLICATION_PRIORITY_PARTITION_ID],
    );
  });

test('priority recovery terminal follow-up stays actionable when logs-table backlog does not hard-block critical recovery',
  async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
      publicationEpoch: 9,
      priorityPartitionSummary: {
        blockedPartitions: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }],
      },
      admission: {
        effectiveEligibleNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        effectiveEligibleNodeCount: 2,
        ineligibleNodes: [],
      },
      logsTable: {
        pendingWrites: 9,
        pendingWriteGrowthCount: 3,
      },
      operationContexts: [PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT],
    });

    t.match(snapshot?.conditions, {
      pressure: {
        pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_WRITE_BACKLOG,
        blocksCriticalRecoveryActuation: false,
      },
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      lastProgressAtMs: 1500,
      timeoutReconcileDue: false,
    });
    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      lastProgressAtMs: 1500,
    });
  });

test('priority recovery terminal follow-up stays retry-scheduled instead of completed when the next operation already has a retry budget',
  async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
      publicationEpoch: 9,
      priorityPartitionSummary: {
        blockedPartitions: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }],
      },
      admission: {
        effectiveEligibleNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        effectiveEligibleNodeCount: 2,
        ineligibleNodes: [],
      },
      completion: {
        state: 'blocked',
        reasonCode: 'blocked',
        retryAfterMs: 2500,
        activeOperationCount: 0,
        temporaryOverflowVoterBudget: 0,
        allowTemporaryOverflowPromotion: false,
        blocked: true,
      },
      operationContexts: [PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT],
    });

    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_PERSIST_FAILED_RETRYABLE,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      lastProgressAtMs: 1500,
      retryAfterMs: 2500,
      timeoutReconcileDue: false,
    });
    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_RETRY_SCHEDULED,
      lastProgressAtMs: 1500,
      retryAfterMs: 2500,
    });
  });

test('priority recovery snapshots never report completed actuation while a new recovery action is still required',
  async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
      publicationEpoch: 9,
      priorityPartitionSummary: {
        blockedPartitions: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }],
      },
      admission: {
        effectiveEligibleNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        effectiveEligibleNodeCount: 2,
        ineligibleNodes: [],
      },
      operationContexts: [PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT],
    });

    t.notMatch(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_COMPLETED,
    });
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      'the shared decision contract should still require one follow-up recovery operation',
    );
  });

test('priority recovery decision snapshot emits one actuation-required contract when spread is blocked with no operation',
  async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
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
      operationContexts: [],
    });

    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      operationCount: 0,
      timeoutReconcileDue: false,
    });
    t.match(snapshot?.conditions, {
      pressure: {
        pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
      },
    });
  });

test('priority recovery decision snapshot keeps missing follow-up work actionable under logs-table backlog',
  async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
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
      logsTable: {
        pendingWrites: 9,
        pendingWriteGrowthCount: 3,
      },
      operationContexts: [],
    });

    t.match(snapshot?.conditions, {
      pressure: {
        pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_WRITE_BACKLOG,
        blocksCriticalRecoveryActuation: false,
        pendingWrites: 9,
        pendingWriteGrowthCount: 3,
      },
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      operationCount: 0,
      timeoutReconcileDue: false,
    });
    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    });
  });

test('priority recovery decision snapshot blocks missing follow-up persistence only under hard control-plane pressure',
  async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
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
      logsTable: {
        pendingWrites: 9,
        sharedPressureBackpressured: true,
      },
      operationContexts: [],
    });

    t.match(snapshot?.conditions, {
      pressure: {
        pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_BACKPRESSURED,
        blocksCriticalRecoveryActuation: true,
        pendingWrites: 9,
        sharedPressureBackpressured: true,
      },
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_PERSIST_BLOCKED_BY_PRESSURE,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      operationCount: 0,
      timeoutReconcileDue: false,
    });
    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
    });
  });

test('priority recovery decision snapshot classifies retryable missing follow-up work as retryable persist failure',
  async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
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
      completion: {
        state: 'blocked',
        reasonCode: 'blocked',
        retryAfterMs: 2500,
        activeOperationCount: 0,
        temporaryOverflowVoterBudget: 0,
        allowTemporaryOverflowPromotion: false,
        blocked: true,
      },
      operationContexts: [],
    });

    t.match(snapshot?.conditions, {
      pressure: {
        pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
      },
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_PERSIST_FAILED_RETRYABLE,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      operationCount: 0,
      retryAfterMs: 2500,
      timeoutReconcileDue: false,
    });
    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_RETRY_SCHEDULED,
      retryAfterMs: 2500,
    });
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
        raft_role: 'voter',
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
        raft_role: 'voter',
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
