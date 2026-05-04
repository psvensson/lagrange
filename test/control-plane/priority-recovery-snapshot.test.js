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
  buildTrackedPriorityRecoveryDecisionSnapshots,
  isPriorityRecoveryEmergencyPartition,
  PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
  resolvePriorityRecoveryAdmissionPlanFromPublication,
  resolveTrackedPriorityRecoveryAdmissionPlan,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {buildPriorityRecoveryObservationSnapshot} from
  '../../src/control-plane/priority-recovery-observation-snapshot.js';
import {
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED,
  buildPriorityRecoveryActuationDecisionInput,
} from '../distributed/harness/__fixtures__/priority-recovery-actuation-contract-fixture.js';

const PUBLICATION_PRIORITY_PARTITION_ID = 'control_plane_publications-p1';
const REPLICA_OPERATION_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const SQL_TRANSACTION_PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE =
  'operational_target_visible_on_eligible_node';
const PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT =
  'recovering_in_flight';
const PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED = 'converged';
const PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED =
  'operation_stalled';
const PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED =
  'learner_promotion_blocked';
const PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH =
  'coordination_mismatch';
const PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED =
  'blocked_unclassified';
const PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE = 'cache_visible';
const PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE = 'remove_phase';
const PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED = 'converged';
const PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING = 'converging';
const PRIORITY_RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING =
  'priority_spread_pending';
const PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
  'priority_partitions_not_spread';
const PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT = 'in_flight';
const PRIORITY_RECOVERY_NODE_ID_A = 'node-a';
const PRIORITY_RECOVERY_NODE_ID_B = 'node-b';
const PRIORITY_RECOVERY_NODE_ID_C = 'node-c';
const PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID =
  'sql_transaction_participants-p1';
const PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION = 'partition';
const PRIORITY_RECOVERY_REASON_PLANNER_READY = 'planner_ready';
const PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH = 12;
const PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS = 5000;
const PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT = 3;
const PRIORITY_RECOVERY_READY_ELIGIBLE_NODE_COUNT = 6;
const PRIORITY_RECOVERY_TOTAL_PRIORITY_PARTITION_COUNT = 5;
const PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS = 1000;
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
const PRIORITY_RECOVERY_STATUS_FAILED = 'failed';
const PRIORITY_RECOVERY_STATUS_PENDING = 'pending';
const PRIORITY_RECOVERY_STATUS_REMOVED = 'removed';
const PRIORITY_RECOVERY_STATUS_SYNCING = 'syncing';
const PRIORITY_RECOVERY_RAFT_ROLE_LEARNER = 'learner';
const PRIORITY_RECOVERY_RAFT_ROLE_FOLLOWER = 'follower';
const PRIORITY_RECOVERY_RAFT_ROLE_VOTER = 'voter';
const PRIORITY_RECOVERY_OPERATION_TYPE_ADD = 'ADD';
const PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE = 'REPLACE';
const PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING = 'PENDING';
const PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING = 'SENDING';
const PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING = 'CREATING';
const PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED = 'FAILED';
const PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING = 'SYNCING';
const PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE = 'ACTIVE';
const PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED = 'REMOVED';
const PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING = 'pending';
const PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED = 'blocked';
const PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_DEFERRED = 'deferred';
const PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY = 'ready';
const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT = 'wait';
const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY = 'retry';
const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP = 'stop';
const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED = 'proceed';
const PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW = 'operation_workflow_owner';
const PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER = 'rebalancer_leader';
const PRIORITY_RECOVERY_PROGRESS_OWNER_VISIBILITY =
  'authoritative_visibility_owner';
const PRIORITY_RECOVERY_PROGRESS_OWNER_NONE = 'none';
const PRIORITY_RECOVERY_PROGRESS_ACTION_NONE = 'none';
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
const PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE = 'none';
const PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN = 'event_driven';
const PRIORITY_RECOVERY_PROGRESS_WAIT_RETRY_SCHEDULED = 'retry_scheduled';
const PRIORITY_RECOVERY_PROGRESS_WAIT_TIMEOUT_RECONCILE_DUE =
  'timeout_reconcile_due';
const PRIORITY_RECOVERY_PROGRESS_WAIT_DEFERRED_VISIBILITY =
  'deferred_visibility';
const PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED = 'stalled';
const PRIORITY_RECOVERY_PROGRESS_WAIT_NONE = 'none';
const PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING =
  'dispatch_pending';
const PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION = 'target_creation';
const PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL = 'source_removal';
const PRIORITY_RECOVERY_PENDING_TIMEOUT_MS = 30000;
const PRIORITY_RECOVERY_PENDING_SHORT_TIMEOUT_MS = 1000;
const PRIORITY_RECOVERY_CREATING_TIMEOUT_MS = 60000;
const PRIORITY_RECOVERY_ACTIVE_SOURCE_REMOVAL_AGE_MS = 134113;
const PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED =
  'action_required';
const PRIORITY_RECOVERY_ACTUATION_STATE_NO_ACTION_NEEDED =
  'no_action_needed';
const PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED =
  'persisted_not_dispatched';
const PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS =
  'dispatched_waiting_progress';
const PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED =
  'transition_deferred';
const PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED =
  'terminal_completed';
const PRIORITY_RECOVERY_PRESSURE_STATE_NONE = 'none';
const PRIORITY_RECOVERY_PRESSURE_STATE_WRITE_BACKLOG = 'write_backlog';
const PRIORITY_RECOVERY_PRESSURE_STATE_BACKPRESSURED = 'backpressured';
const PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT =
  'operation_context';
const PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE = 'workflow_state';
const PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS =
  'last_progress_timestamp';
const PRIORITY_RECOVERY_OPERATION_ID_SYNCING_FOLLOWER_TARGET =
  'op-replace-syncing-follower-target';
const PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD =
  'op-ordinary-priority-serial-lane-add';
const PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_REPLICA_ID =
  'control_plane_publications-p1-r4';
const PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_ADDRESS =
  'node-b/partition/control_plane_publications-p1-r4';
const PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS =
  'operation_created_but_no_step_transitions';
const PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT =
  'priority_operation_serial_wait';
const PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION =
  'eligible_but_no_operation_created';
const PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED =
  'publication_recovery_eligible_but_coordinator_excludes_node';
const PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION =
  'needs_operation';
const PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY =
  'op-visible-from-operation-object';
const PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY =
  'op-pending-planner-ready';
const PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE =
  'op-completed-replace-visible';
const PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE =
  'op-pending-replace-stale';
const PRIORITY_RECOVERY_OPERATION_ID_SUPERSEDED_SYNCING =
  'op-superseded-syncing';
const PRIORITY_RECOVERY_OPERATION_ID_NEWER_FAILED_REPLACE =
  'op-newer-failed-replace';
const PRIORITY_RECOVERY_OPERATION_ID_FAILED_REPLACE_ACTIVE_TARGET =
  'op-failed-replace-active-target';
const PRIORITY_RECOVERY_OPERATION_ID_ELIGIBLE_REMOVE_PHASE =
  'op-eligible-remove-phase';
const PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_TARGET_CREATING =
  'op-excluded-target-creating';
const PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT =
  'op-pending-dispatch-owner-wait';
const PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS =
  'op-target-service-progress';
const PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS =
  'control_plane_publications-p1-r5';
const PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS = 1000;
const PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS = 34000;
const PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS = 35000;
const PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL =
  'active_operational';
const PRIORITY_RECOVERY_FAILED_REPLACE_ACTIVE_TARGET_TEST_NAME =
  'priority recovery failed REPLACE with active target satisfies spread instead of missing operation';
const PRIORITY_RECOVERY_ACTIVE_TARGET_NOT_MISSING_OPERATION_MESSAGE =
  'an active operational replacement target should not be reported as missing operation work';
const PRIORITY_RECOVERY_ACTIVE_TARGET_SPREAD_WITNESS_MESSAGE =
  'the failed replacement should still witness spread when its target is active operational on an eligible node';
const PRIORITY_RECOVERY_ACTIVE_TARGET_SEMANTIC_MESSAGE =
  'the partition should leave needs_operation once the active target satisfies recovery';
const PRIORITY_RECOVERY_ACTIVE_TARGET_COMPLETION_MESSAGE =
  'completion should use the spread-satisfied recovery state';
const PRIORITY_RECOVERY_ACTIVE_TARGET_PROGRESS_MESSAGE =
  'the progress contract should not schedule a duplicate recovery operation';
const PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLICA_ID =
  'sql_transactions-p1-r5';
const PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID =
  'sql_transactions-p1-r6';
const PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID =
  'sql_transaction_participants-p1-r7';
const PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_STALE_REPLICA_ID =
  'sql_transaction_participants-p1-r8';
const PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_FAILED_REPLICA_ID =
  'sql_transaction_participants-p1-r9';
const PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID =
  'sql_write_operations-p1';
const PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_COMPLETED_REPLACE =
  'op-excluded-completed-replace';
const PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE =
  'op-creating-replace-stale';
const PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID =
  'sql_write_operations-p1-r4';
const PRIORITY_RECOVERY_SQL_WRITE_CREATING_REPLICA_ID =
  'sql_write_operations-p1-r5';
const PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS = 2000;
const PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS = 2500;
const PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS = 2500;
const PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS = 1000;
const PRIORITY_RECOVERY_SUPERSEDED_OPERATION_UPDATED_AT_MS = 3000;
const PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS = 4000;
const PRIORITY_RECOVERY_NEWER_OPERATION_COMPLETED_AT_MS = 4500;
const PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT = 2;
const PRIORITY_RECOVERY_SINGLE_SPREAD_GAP = 1;
const PRIORITY_RECOVERY_EMPTY_COUNT = 0;
const PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT = 1;
const PRIORITY_RECOVERY_SINGLE_ADD_BUDGET_LIMIT = 1;
const PRIORITY_RECOVERY_SINGLE_EMERGENCY_OVERFLOW_SLOT_COUNT = 1;
const PRIORITY_RECOVERY_DUAL_EMERGENCY_OVERFLOW_SLOT_COUNT = 2;
const PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT = 2;
const PRIORITY_RECOVERY_DUAL_EMERGENCY_BUDGET_LIMIT = 3;
const PRIORITY_RECOVERY_SINGLE_PRIORITY_IN_FLIGHT_COUNT = 1;
const PRIORITY_RECOVERY_DUAL_PRIORITY_IN_FLIGHT_COUNT = 2;
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
      'SENDING sql_transactions-p1 evidence should replay as workflow-owned waiting progress',
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
        PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
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
        PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
      stepAgeMs: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS -
        PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
      stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
    });
  });

test('priority recovery decision snapshot applies caller timeout budgets to pending no-transition work',
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
    });

    t.same(
      snapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS],
      'overdue pending work should use the caller timeout map for semantic classification',
    );
    t.equal(
      snapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
      'overdue pending work should not stay recovering-in-flight',
    );
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
        PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
      stepAgeMs: PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS -
        PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
      stepTimeoutMs: PRIORITY_RECOVERY_PENDING_SHORT_TIMEOUT_MS,
    });
  });

test('priority recovery decision snapshots count target service creation as ' +
  'operation progress while operation rows lag',
  async (t) => {
    const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
      capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
      stepTimeoutMsByWorkflowStep: {
        [PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING]:
          PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
      },
      publicationConvergence: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
          missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
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
        operation_id: PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
        partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
        entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_PENDING,
        workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
        source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
        target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
        replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
        created_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        updated_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
      }],
      serviceRows: [{
        partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
        replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
        service_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        status: PRIORITY_RECOVERY_STATUS_CREATING,
        node_id: PRIORITY_RECOVERY_NODE_ID_B,
        state_entered_at: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
      }],
    });
    const snapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === PUBLICATION_PRIORITY_PARTITION_ID &&
      entry.operationId === PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
    );

    t.ok(snapshot, 'target partition snapshot should exist');
    t.same(
      snapshot?.blockerReasons,
      [],
      'fresh target service progress should prevent synthetic no-transition stalls',
    );
    t.equal(
      snapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
      'target service progress should keep lagging operation rows in flight',
    );
    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
      stepAgeMs: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS -
        PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
      stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
      lastProgressAtMs: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      timeoutReconcileDue: false,
      lastProgressAtMs: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
    });
    t.equal(
      snapshot?.coordinator?.operation?.targetServiceProgressAtMs,
      PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
      'operation context should carry target service progress evidence',
    );
  });

test('priority recovery decision snapshots ignore failed target service ' +
  'timestamps when operation rows lag',
  async (t) => {
    const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
      capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
      stepTimeoutMsByWorkflowStep: {
        [PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING]:
          PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
      },
      publicationConvergence: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
          missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
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
        operation_id: PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
        partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
        entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_PENDING,
        workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
        source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
        target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
        replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
        created_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        updated_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
      }],
      serviceRows: [{
        partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
        replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
        service_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        status: PRIORITY_RECOVERY_STATUS_FAILED,
        node_id: PRIORITY_RECOVERY_NODE_ID_B,
        state_entered_at: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
      }],
    });
    const snapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === PUBLICATION_PRIORITY_PARTITION_ID &&
      entry.operationId ===
        PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
    );

    t.ok(snapshot, 'target partition snapshot should exist');
    t.same(
      snapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS],
      'failed target rows should not refresh operation progress',
    );
    t.equal(
      snapshot?.coordinator?.operation?.targetServiceProgressAtMs,
      undefined,
      'failed target row timestamps should stay out of operation context',
    );
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      timeoutReconcileDue: true,
      lastProgressAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
    });
  });

test('priority recovery observation keeps set-difference ACK debt when ACK ' +
  'lists have equal length but different members',
  async (t) => {
    const observation = buildPriorityRecoveryObservationSnapshot({
      publicationConvergence: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        pendingAckNodeIds: [],
        pendingAckCount: PRIORITY_RECOVERY_EMPTY_COUNT,
      },
      publicationConvergenceGate: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        requiredAckNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
        ],
        acknowledgedNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        pendingAckNodeIds: [],
        pendingAckCount: PRIORITY_RECOVERY_EMPTY_COUNT,
      },
    });

    t.same(
      observation.pendingAckNodeIds,
      [PRIORITY_RECOVERY_NODE_ID_A],
      'same-size ACK lists should still preserve the missing required node',
    );
    t.equal(observation.pendingAckCount, PRIORITY_RECOVERY_SINGLE_SPREAD_GAP);
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
      state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
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
      state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
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

test('priority recovery observation snapshots prefer current unresolved decision partitions over stale spread summary ids',
  async (t) => {
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
      'current unresolved decision evidence should own the blocked partition id instead of the stale spread-summary partition',
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
      'the stale spread partition should remain visible only as non-blocking semantic evidence',
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
      state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
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
      state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
    });
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
      'the shared decision contract should still require one follow-up recovery operation',
    );
  });

test(PRIORITY_RECOVERY_FAILED_REPLACE_ACTIVE_TARGET_TEST_NAME,
  async (t) => {
    const failedReplaceActiveTargetOperation = {
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
      operationId: PRIORITY_RECOVERY_OPERATION_ID_FAILED_REPLACE_ACTIVE_TARGET,
      type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
      status: PRIORITY_RECOVERY_STATUS_FAILED,
      workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
      targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
      targetVisibilityState:
        PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
      updatedAtMs: PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
      completedAtMs: PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
      timelineLength:
        PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT.timelineLength,
      timelineStepCount:
        PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT
          .timelineStepCount,
      latestTimelineStep: PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
      latestTimelineStatus: PRIORITY_RECOVERY_STATUS_FAILED,
      latestTimelineInFlight: false,
    };
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
      publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
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
        effectiveEligibleNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        effectiveEligibleNodeCount:
          PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
        ineligibleNodes: [],
      },
      operationContexts: [failedReplaceActiveTargetOperation],
    });

    t.same(
      snapshot?.blockerReasons,
      [],
      PRIORITY_RECOVERY_ACTIVE_TARGET_NOT_MISSING_OPERATION_MESSAGE,
    );
    t.match(
      snapshot?.spreadCompletion,
      {
        satisfied: true,
        reasonCode:
          PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
        satisfyingOperationIds: [
          PRIORITY_RECOVERY_OPERATION_ID_FAILED_REPLACE_ACTIVE_TARGET,
        ],
        satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
        blockingOperationIds: [],
        blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
      },
      PRIORITY_RECOVERY_ACTIVE_TARGET_SPREAD_WITNESS_MESSAGE,
    );
    t.equal(
      snapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
      PRIORITY_RECOVERY_ACTIVE_TARGET_SEMANTIC_MESSAGE,
    );
    t.equal(
      snapshot?.completion?.state,
      PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      PRIORITY_RECOVERY_ACTIVE_TARGET_COMPLETION_MESSAGE,
    );
    t.match(
      snapshot?.progress,
      {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
        nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
      },
      PRIORITY_RECOVERY_ACTIVE_TARGET_PROGRESS_MESSAGE,
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

test('priority recovery decision snapshot defers missing follow-up actuation only under hard control-plane pressure',
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
      state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
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

test('priority recovery decision snapshot defers missing follow-up actuation under transport/query pressure',
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
        transportPressureBackpressured: true,
        queryPressureBackpressured: true,
      },
      operationContexts: [],
    });

    t.match(snapshot?.conditions, {
      pressure: {
        pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_BACKPRESSURED,
        blocksCriticalRecoveryActuation: true,
        pendingWrites: 9,
        transportPressureBackpressured: true,
        queryPressureBackpressured: true,
      },
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
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

test('priority recovery decision snapshot classifies retryable missing follow-up work as transition deferred',
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
      state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
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
