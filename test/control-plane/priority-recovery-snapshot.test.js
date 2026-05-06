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

import {
  registerPriorityRecoverySnapshotCore01Tests,
} from './priority-recovery-snapshot-core-01-test-cases.js';
import {
  registerPriorityRecoverySnapshotCore02Tests,
} from './priority-recovery-snapshot-core-02-test-cases.js';
import {
  registerPriorityRecoverySnapshotCore03Tests,
} from './priority-recovery-snapshot-core-03-test-cases.js';
import {
  registerPriorityRecoverySnapshotCore04Tests,
} from './priority-recovery-snapshot-core-04-test-cases.js';
import {
  registerPriorityRecoverySnapshotCore05Tests,
} from './priority-recovery-snapshot-core-05-test-cases.js';
import {
  registerPriorityRecoverySnapshotCore06Tests,
} from './priority-recovery-snapshot-core-06-test-cases.js';
import {
  registerPriorityRecoverySnapshotCore07Tests,
} from './priority-recovery-snapshot-core-07-test-cases.js';
import {
  registerPriorityRecoverySnapshotCore08Tests,
} from './priority-recovery-snapshot-core-08-test-cases.js';
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
const PRIORITY_RECOVERY_HIGHER_EPOCH_VALUE = 5;
const PRIORITY_RECOVERY_LOWER_EPOCH_VALUE = 2;
const PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_CAPTURED_AT_MS = 3600;
const PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_UPDATED_AT_MS = 3400;
const PRIORITY_RECOVERY_LOWER_EPOCH_SYNTHETIC_CAPTURED_AT_MS = 4000;
const PRIORITY_RECOVERY_OBSERVATION_STATE_NONE = 'none';
const PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP = 'spread_gap';
const PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL =
  'active_operational';
const PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_OPERATION_ID =
  'op-higher-epoch-progress';
const PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_CORRELATION_KEY =
  `${REPLICA_OPERATION_PRIORITY_PARTITION_ID}|` +
  `${PRIORITY_RECOVERY_HIGHER_EPOCH_VALUE}|` +
  `${PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_OPERATION_ID}`;
const PRIORITY_RECOVERY_FAILED_REPLACE_ACTIVE_TARGET_TEST_NAME =
  'priority recovery failed REPLACE with active target satisfies spread instead of missing operation';
const PRIORITY_RECOVERY_SERIAL_WAIT_WITNESS_TEST_NAME =
  'priority recovery serial-wait witnesses retain blocking operation evidence';
const PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_TEST_NAME =
  'priority recovery serial-wait ignores spread-satisfying replace targets';
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
const PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_IDS_MESSAGE =
  'serial-wait witnesses should keep current-partition operation ids separate';
const PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_MESSAGE =
  'serial-wait witnesses should expose the operation that owns the serial lane';
const PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_PARTITION_MESSAGE =
  'serial-wait witnesses should expose the partition that owns the serial lane';
const PRIORITY_RECOVERY_SERIAL_WAIT_WITNESS_ID_MESSAGE =
  'serial-wait operation ids should remain diagnostic witness ids';
const PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_MESSAGE =
  'spread-satisfying ordinary-lane replacements should not retain the serial wait blocker';
const PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE =
  'released serial-wait partitions should return to scheduling ownership';
const PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_TEST_NAME =
  'tracked priority recovery decision snapshots release stale serial-wait blockers when fresher terminal evidence exists';
const PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_MESSAGE =
  'fresher terminal spread satisfaction should clear stale serial-wait bookkeeping';
const PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE =
  'released serial wait should return the blocked partition to scheduling ownership';
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
const PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT =
  'op-released-serial-wait';
const PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID =
  'sql_write_operations-p1-r4';
const PRIORITY_RECOVERY_SQL_WRITE_CREATING_REPLICA_ID =
  'sql_write_operations-p1-r5';
const PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS = 2000;
const PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS = 2500;
const PRIORITY_RECOVERY_STALE_SERIAL_WAIT_CAPTURED_AT_MS = 4500;
const PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_CAPTURED_AT_MS = 5000;
const PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_PROGRESS_AT_MS = 4900;
const PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS = 2500;
const PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS = 1000;
const PRIORITY_RECOVERY_ARTIFACT_PUBLICATION_EPOCH = 3;
const PRIORITY_RECOVERY_ARTIFACT_PENDING_ACK_NODE_ID =
  '11601fe0-72d6-5853-8590-ec2881853e72';
const PRIORITY_RECOVERY_ARTIFACT_SOURCE_NODE_ID =
  '7493b0ab-a054-5fad-a91b-5e331db29304';
const PRIORITY_RECOVERY_ARTIFACT_TARGET_NODE_ID =
  'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58';
const PRIORITY_RECOVERY_ARTIFACT_PENDING_OPERATION_ID =
  '7a24201b-6f3c-4298-a32c-4efe04157ff9';
const PRIORITY_RECOVERY_ARTIFACT_SQL_TRANSACTIONS_REPLICA_ID =
  'sql_transactions-p1-r4';
const PRIORITY_RECOVERY_ARTIFACT_OPERATION_CREATED_AT_MS = 1778083009776;
const PRIORITY_RECOVERY_ARTIFACT_OPERATION_CAPTURED_AT_MS = 1778083032564;
const PRIORITY_RECOVERY_ARTIFACT_SYNTHETIC_CAPTURED_AT_MS = 1778083033777;
const PRIORITY_RECOVERY_ARTIFACT_OPERATION_STEP_AGE_MS =
  PRIORITY_RECOVERY_ARTIFACT_SYNTHETIC_CAPTURED_AT_MS -
  PRIORITY_RECOVERY_ARTIFACT_OPERATION_CREATED_AT_MS;
const PRIORITY_RECOVERY_ARTIFACT_REQUIRED_DISTINCT_NODE_COUNT = 2;
const PRIORITY_RECOVERY_ARTIFACT_READY_DISTINCT_NODE_COUNT = 1;
const PRIORITY_RECOVERY_SUPERSEDED_OPERATION_UPDATED_AT_MS = 3000;
const PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS = 4000;
const PRIORITY_RECOVERY_NEWER_OPERATION_COMPLETED_AT_MS = 4500;
const PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT = 2;
const PRIORITY_RECOVERY_SINGLE_SPREAD_GAP = 1;
const PRIORITY_RECOVERY_EMPTY_COUNT = 0;
const PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT = 1;
const PRIORITY_RECOVERY_FIRST_PARTITION_WITNESS_INDEX = 0;
const PRIORITY_RECOVERY_EMPTY_OPERATION_IDS = Object.freeze([]);
const PRIORITY_RECOVERY_ABSENT_OPERATION = null;
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

function registerPriorityRecoverySnapshotSupplementalTests(context) {
  const {
    buildPriorityRecoveryObservationSnapshot,
    buildTrackedPriorityRecoveryDecisionSnapshots,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
    PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED,
    PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
    PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
    PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
    PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_CREATING,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_STATUS_REMOVED,
    PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  const STALE_SOURCE_SERIAL_WAIT_TEST_NAME =
    'tracked priority recovery decision snapshots ignore stale serial-wait ' +
    'sources once a partition publishes newer terminal progress';
  const STALE_SOURCE_SERIAL_WAIT_MESSAGE =
    'serial-wait normalization should not use stale source-partition ' +
    'operation contexts once newer terminal progress exists';
  const STALE_SOURCE_SERIAL_WAIT_PROGRESS_MESSAGE =
    'when stale serial-wait source evidence is ignored, the blocked ' +
    'partition should return to explicit scheduling ownership';
  const STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID =
    'op-stale-source-creating';
  const STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID =
    'op-newer-source-removed';
  const STALE_SOURCE_SERIAL_WAIT_CREATE_CAPTURED_AT_MS = 5100;
  const STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS = 5000;
  const STALE_SOURCE_SERIAL_WAIT_RELEASE_CAPTURED_AT_MS = 7100;
  const STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS = 7000;
  const STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS = 7200;
  const STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED = 'unsatisfied';
  const STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE =
    'system_table_cache';
  const STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT =
    'priority_recovery_snapshot';
  const STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS =
    'blocker_reasons';
  const STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE =
    'completion_state';
  const STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP =
    'priority_spread_gap';
  const STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME =
    'sql_transaction_participants';
  const STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID = 'terminal';
  const MIXED_SUMMARY_SERIAL_WAIT_TEST_NAME =
    'tracked priority recovery decision snapshots keep serial-wait source ' +
    'context when the latest summary row is keyed by a newer removed ' +
    'operation';
  const MIXED_SUMMARY_SERIAL_WAIT_MESSAGE =
    'serial-wait normalization should preserve the live workflow-owned ' +
    'operation when a newer removed row still shares the same partition ' +
    'summary';
  const MIXED_SUMMARY_SERIAL_WAIT_PROGRESS_MESSAGE =
    'the blocked partition should stay on workflow-progress wait when the ' +
    'only eligible target is already occupied by another partition\'s live ' +
    'priority recovery operation';
  const MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID =
    'op-source-pending';
  const MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID =
    'op-source-removed';
  const MIXED_SUMMARY_SERIAL_WAIT_SOURCE_CAPTURED_AT_MS = 8300;
  const MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS = 8200;
  const MIXED_SUMMARY_SERIAL_WAIT_REMOVED_COMPLETED_AT_MS = 8100;
  const MIXED_SUMMARY_SERIAL_WAIT_TARGET_CAPTURED_AT_MS = 8400;
  const MIXED_SUMMARY_SERIAL_WAIT_SOURCE_TABLE_NAME = 'sql_transactions';
  const MIXED_SUMMARY_SERIAL_WAIT_REASON_UNSATISFIED = 'unsatisfied';
  const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TEST_NAME =
    'tracked priority recovery decision snapshots ignore mixed-summary ' +
    'serial-wait sources when the sibling live operation already ' +
    'satisfies spread';
  const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE =
    'mixed-summary serial-wait normalization should prefer the live ' +
    'sibling operation context when the latest workflow-owned operation ' +
    'already satisfies spread on an eligible target';
  const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_PROGRESS_MESSAGE =
    'when the live sibling operation already satisfies spread, the ' +
    'blocked partition should return to explicit scheduling ownership';
  const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_CAPTURED_AT_MS =
    8500;
  const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_SOURCE_TABLE_NAME =
    'sql_transaction_participants';
  const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_VISIBILITY_ABSENT =
    'absent';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TEST_NAME =
    'tracked priority recovery decision snapshots ignore serial-wait ' +
    'sources already subordinated to a spread-satisfied sibling';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE =
    'serial-wait normalization should not restore workflow-owned wait ' +
    'when a separate sibling already satisfies spread while pointing at ' +
    'the same source partition';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PROGRESS_MESSAGE =
    'once the spread-satisfied sibling already covers the source ' +
    'partition, the blocked partition should stay on explicit scheduling ' +
    'ownership';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_OPERATION_ID =
    'op-participants';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_OPERATION_ID =
    'op-transactions';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_CAPTURED_AT_MS = 8500;
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_PROGRESS_AT_MS =
    8400;
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_PROGRESS_AT_MS =
    8450;
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_STEP_AGE_MS = 100;
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PENDING_TIMEOUT_MS = 30000;
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_NUMERIC = null;
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_BOOLEAN = null;
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_UNSATISFIED =
    'unsatisfied';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD =
    'active_operation_still_blocks_spread';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_REPLACE_REMOVE_DISPATCH =
    'replace_remove_dispatch_phase_on_eligible_target';
  const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_PRIORITY_PARTITION_MISSING =
    'priority_partition_missing';
  const RETAINED_CARRIER_SERIAL_WAIT_RELEASE_TEST_NAME =
    'tracked priority recovery decision snapshots release stale serial-wait ' +
    'blockers once the only source collapses to a spread-satisfied carrier';
  const RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE =
    'stale serial-wait blockers should clear once their only remaining ' +
    'source is a spread-satisfied retained carrier';
  const RETAINED_CARRIER_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE =
    'when no live serial-wait source remains, the blocked partition ' +
    'should return to explicit scheduling ownership';
  const RETAINED_CARRIER_SERIAL_WAIT_TARGET_OPERATION_ID =
    'op-retained-carrier-target-stale-wait';
  const RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID =
    'op-retained-carrier-source-pending';
  const RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID =
    'op-retained-carrier-live';
  const RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID =
    'op-retained-carrier-removed';
  const RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS = 1000;
  const RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS = 900;
  const RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS = 950;
  const RETAINED_CARRIER_SERIAL_WAIT_SOURCE_TABLE_NAME =
    'sql_transaction_participants';
  const RETAINED_CARRIER_SERIAL_WAIT_CARRIER_TABLE_NAME =
    'sql_write_operations';

  test(STALE_SOURCE_SERIAL_WAIT_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
      publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
      blockerPartitionIdsByReason: {
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
      },
      partitionIdsBySemanticState: {
        [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
      },
      snapshots: [{
        partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: null,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        blockerReasons: [
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
        ],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          reasonCode: STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
          provenance: {
            capturedAt: STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            workflowSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
          ],
        },
        actuation: {
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepAgeMs: STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount: PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          ready: false,
          reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: false,
          reasonCode: STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED,
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          operationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        blockerReasons: [],
        completion: {
          state:
            PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: false,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
          provenance: {
            capturedAt: STALE_SOURCE_SERIAL_WAIT_CREATE_CAPTURED_AT_MS,
            workflowSource:
              STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_CREATING,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          latestOperationId: STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
          ready: false,
          reasons: [],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: true,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: [
            STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID],
          operation: {
            operationId: STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID,
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            tableName: STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_CREATING,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
            createdAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
            updatedAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            latestTimelineInFlight: true,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED,
        blockerReasons: [],
        completion: {
          state:
            PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: false,
        },
        observation: {
          workflowState: STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
          provenance: {
            capturedAt: STALE_SOURCE_SERIAL_WAIT_RELEASE_CAPTURED_AT_MS,
            workflowSource:
              STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_REMOVED,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
          workflowProgressPhaseId:
            STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
          nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          latestOperationId: STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          lastProgressAtMs: STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
          ready: false,
          reasons: [],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: true,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: [
            STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID],
          operation: {
            operationId: STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID,
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            tableName: STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_REMOVED,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
            createdAtMs: STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS,
            updatedAtMs: STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
            completedAtMs: STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            latestTimelineInFlight: false,
            targetVisibilityState:
              PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }],
    });

    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
      ],
      [],
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
      ],
      [PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID],
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );

    const trackedSqlWriteSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) =>
        snapshot.partitionId === PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    );

    t.same(
      trackedSqlWriteSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedSqlWriteSnapshot?.coordinator?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      trackedSqlWriteSnapshot?.progress,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      STALE_SOURCE_SERIAL_WAIT_PROGRESS_MESSAGE,
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
    });
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses.find((snapshot) =>
        snapshot.partitionId === PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );

    t.same(
      partitionWitness?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      partitionWitness?.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      STALE_SOURCE_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      partitionWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      STALE_SOURCE_SERIAL_WAIT_PROGRESS_MESSAGE,
    );
  });

  test(MIXED_SUMMARY_SERIAL_WAIT_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
      publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
      blockerPartitionIdsByReason: {
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
      },
      partitionIdsBySemanticState: {
        [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
          SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
      },
      snapshots: [{
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: null,
        correlationKey:
          `${PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID}|` +
          `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|operation_unknown`,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        blockerReasons: [
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
        ],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          reasonCode: MIXED_SUMMARY_SERIAL_WAIT_REASON_UNSATISFIED,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
          provenance: {
            capturedAt: MIXED_SUMMARY_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            workflowSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
          ],
        },
        actuation: {
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepAgeMs: MIXED_SUMMARY_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          ready: false,
          reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: false,
          reasonCode: MIXED_SUMMARY_SERIAL_WAIT_REASON_UNSATISFIED,
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          operationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
        correlationKey:
          `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
          `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
          `${MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID}`,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        blockerReasons: [],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          reasonCode: MIXED_SUMMARY_SERIAL_WAIT_REASON_UNSATISFIED,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
          provenance: {
            capturedAt: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_CAPTURED_AT_MS,
            workflowSource:
              STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          operationCount: 2,
          latestOperationId: MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          ready: false,
          reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: false,
          reasonCode:
            'active_operation_still_blocks_spread',
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [
            MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
          ],
          blockingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID],
          operation: {
            operationId: MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            tableName: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_PENDING,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
            createdAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            updatedAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            latestTimelineInFlight: true,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID,
        correlationKey:
          `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
          `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
          `${MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID}`,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        blockerReasons: [],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          reasonCode: MIXED_SUMMARY_SERIAL_WAIT_REASON_UNSATISFIED,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
          provenance: {
            capturedAt: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_CAPTURED_AT_MS,
            workflowSource:
              STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          operationCount: 2,
          latestOperationId: MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          ready: false,
          reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: false,
          reasonCode:
            'active_operation_still_blocks_spread',
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [
            MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
          ],
          blockingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
        },
        coordinator: {
          operationCount: 2,
          operationIds: [
            MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
            MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID,
          ],
          operation: {
            operationId: MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID,
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            tableName: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_REMOVED,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
            createdAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            updatedAtMs: MIXED_SUMMARY_SERIAL_WAIT_REMOVED_COMPLETED_AT_MS,
            completedAtMs: MIXED_SUMMARY_SERIAL_WAIT_REMOVED_COMPLETED_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            latestTimelineInFlight: false,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }],
    });

    const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) =>
        snapshot.partitionId ===
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    );

    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
      ],
      [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
      MIXED_SUMMARY_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
      ],
      [],
      MIXED_SUMMARY_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.coordinator?.serialWaitOperationIds,
      [MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID],
      MIXED_SUMMARY_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.coordinator?.serialWaitPartitionIds,
      [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
      MIXED_SUMMARY_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
      MIXED_SUMMARY_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      trackedTargetSnapshot?.progress,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      MIXED_SUMMARY_SERIAL_WAIT_PROGRESS_MESSAGE,
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
    });
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses.find((snapshot) =>
        snapshot.partitionId ===
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
      );

    t.same(
      partitionWitness?.serialWaitOperationIds,
      [MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID],
      MIXED_SUMMARY_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      partitionWitness?.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
      MIXED_SUMMARY_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      partitionWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      MIXED_SUMMARY_SERIAL_WAIT_PROGRESS_MESSAGE,
    );
  });

  test(MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
      publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
      blockerPartitionIdsByReason: {
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [
          SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
      },
      partitionIdsBySemanticState: {
        [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
          SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
      },
      snapshots: [{
        partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: null,
        correlationKey:
          `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
          `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|operation_unknown`,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        blockerReasons: [
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
        ],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          reasonCode: MIXED_SUMMARY_SERIAL_WAIT_REASON_UNSATISFIED,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
          provenance: {
            capturedAt:
              MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            workflowSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs:
            MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
          ],
        },
        actuation: {
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepAgeMs:
            MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          lastProgressAtMs:
            MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          ready: false,
          reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: false,
          reasonCode: MIXED_SUMMARY_SERIAL_WAIT_REASON_UNSATISFIED,
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          operationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
        correlationKey:
          `${PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID}|` +
          `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
          `${MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID}`,
        semanticState:
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        blockerReasons: [],
        completion: {
          state:
            PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: false,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
          provenance: {
            capturedAt: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_CAPTURED_AT_MS,
            workflowSource:
              STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          operationCount: 2,
          latestOperationId: MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
          ready: false,
          reasons: [],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: true,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: [
            MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID],
          operation: {
            operationId: MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            tableName:
              MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_SOURCE_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_PENDING,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
            createdAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            updatedAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            latestTimelineInFlight: true,
            targetVisibilityState:
              PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
            targetServiceProgressAtMs:
              MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID,
        correlationKey:
          `${PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID}|` +
          `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
          `${MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID}`,
        semanticState:
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        blockerReasons: [],
        completion: {
          state:
            PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: false,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
          provenance: {
            capturedAt: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_CAPTURED_AT_MS,
            workflowSource:
              STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          operationCount: 2,
          latestOperationId: MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
          stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
          lastProgressAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
          ready: false,
          reasons: [],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: true,
          reasonCode:
            PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: [
            MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: 2,
          operationIds: [
            MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID,
            MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID,
          ],
          operation: {
            operationId: MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID,
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            tableName:
              MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_SOURCE_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_REMOVED,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
            createdAtMs: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            updatedAtMs: MIXED_SUMMARY_SERIAL_WAIT_REMOVED_COMPLETED_AT_MS,
            completedAtMs: MIXED_SUMMARY_SERIAL_WAIT_REMOVED_COMPLETED_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            latestTimelineInFlight: false,
            targetVisibilityState:
              MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_VISIBILITY_ABSENT,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }],
    });

    const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) => snapshot.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    );

    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
      ],
      [],
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
      ],
      [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.coordinator?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.coordinator?.serialWaitPartitionIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      trackedTargetSnapshot?.progress,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_PROGRESS_MESSAGE,
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
    });
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses.find((snapshot) =>
        snapshot.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
      );

    t.same(
      partitionWitness?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      partitionWitness?.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      partitionWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_PROGRESS_MESSAGE,
    );
  });

  test(SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
      publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
      blockerPartitionIdsByReason: {
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
        [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
      },
      partitionIdsBySemanticState: {
        [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
          SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
          PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        ],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
        [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
      },
      snapshots: [{
        partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId:
          SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_OPERATION_ID,
        semanticState:
          PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        blockerReasons: [],
        completion: {
          state:
            PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          reasonCode:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_REPLACE_REMOVE_DISPATCH,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: false,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          provenance: {
            capturedAt:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_CAPTURED_AT_MS,
            workflowSource:
              STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_ACTIVE,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          latestOperationId:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_OPERATION_ID,
          stepAgeMs: SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_STEP_AGE_MS,
          stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          lastProgressAtMs:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId:
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          requiredDistinctNodeCount:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_NUMERIC,
          readyDistinctNodeCount:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_NUMERIC,
          spreadGap: SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_NUMERIC,
          ready: SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_BOOLEAN,
          reasons: [],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: true,
          reasonCode:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_REPLACE_REMOVE_DISPATCH,
          satisfyingOperationIds: [
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_OPERATION_ID,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_OPERATION_ID,
          ],
          operation: {
            operationId:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_OPERATION_ID,
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            tableName: STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_ACTIVE,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
            createdAtMs:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_PROGRESS_AT_MS,
            updatedAtMs:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_PROGRESS_AT_MS,
            stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            latestTimelineInFlight: false,
            targetVisibilityState:
              PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
            targetServiceProgressAtMs:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_PROGRESS_AT_MS,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          serialWaitOperationIds: [
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_OPERATION_ID,
          ],
          serialWaitPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        },
      }, {
        partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId:
          SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_OPERATION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        blockerReasons: [],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          reasonCode:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
          provenance: {
            capturedAt:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_CAPTURED_AT_MS,
            workflowSource:
              STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
          latestOperationWorkflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
          latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          latestOperationId:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_OPERATION_ID,
          stepAgeMs: SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_STEP_AGE_MS,
          stepTimeoutMs:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PENDING_TIMEOUT_MS,
          lastProgressAtMs:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_PROGRESS_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_NUMERIC,
          readyDistinctNodeCount:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_NUMERIC,
          spreadGap: SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_NUMERIC,
          ready: SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_BOOLEAN,
          reasons: [],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: false,
          reasonCode:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_OPERATION_ID,
          ],
          blockingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          operationIds: [
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_OPERATION_ID,
          ],
          operation: {
            operationId:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_OPERATION_ID,
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            tableName: MIXED_SUMMARY_SERIAL_WAIT_SOURCE_TABLE_NAME,
            type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_PENDING,
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
            targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
            replicaId:
              PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
            createdAtMs:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_PROGRESS_AT_MS,
            updatedAtMs:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_PROGRESS_AT_MS,
            stepTimeoutMs:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PENDING_TIMEOUT_MS,
            latestTimelineInFlight: false,
            targetVisibilityState:
              MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_VISIBILITY_ABSENT,
          },
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }, {
        partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        operationId: null,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        blockerReasons: [
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
        ],
        completion: {
          state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
          reasonCode:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_UNSATISFIED,
          retryAfterMs: null,
          activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        observation: {
          workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
          provenance: {
            capturedAt:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_CAPTURED_AT_MS,
            workflowSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            semanticSource:
              STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
          },
        },
        conditions: {
          visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          authoritativeOperationReadDeferred: false,
          blockerReasonCodes: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          admissionBlockingReasonCodes: [],
          pressure: {
            pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
            blocksCriticalRecoveryActuation: false,
          },
        },
        progress: {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          lastProgressAtMs:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          evidenceSourceIds: [
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
            STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
            PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
          ],
        },
        actuation: {
          workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          stepAgeMs:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_CAPTURED_AT_MS,
          lastProgressAtMs:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_CAPTURED_AT_MS,
          retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
          timeoutReconcileDue: false,
        },
        planner: {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          readyDistinctNodeCount:
            PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          ready: false,
          reasons: [
            STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP,
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_PRIORITY_PARTITION_MISSING,
          ],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          effectiveEligibleNodeCount:
            PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
          ineligibleNodeIds: [],
          recoveryEligibleExcludedNodeIds: [],
        },
        spreadCompletion: {
          satisfied: false,
          reasonCode:
            SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_UNSATISFIED,
          satisfyingOperationIds: [],
          satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        coordinator: {
          operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          operationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
          serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
        },
      }],
    });

    const trackedSqlWriteSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) =>
        snapshot.partitionId ===
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    );

    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
      ],
      [],
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
      ],
      [PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID],
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedSqlWriteSnapshot?.coordinator?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedSqlWriteSnapshot?.coordinator?.serialWaitPartitionIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      trackedSqlWriteSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      trackedSqlWriteSnapshot?.progress,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PROGRESS_MESSAGE,
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
    });
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses.find((snapshot) =>
        snapshot.partitionId ===
          PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );

    t.same(
      partitionWitness?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE,
    );
    t.same(
      partitionWitness?.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE,
    );
    t.match(
      partitionWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PROGRESS_MESSAGE,
    );
  });

  test(
    'tracked priority recovery decision snapshots keep terminal ' +
      'serial-wait carriers subordinate to the source workflow',
    async (t) => {
      const SOURCE_PARTITION_TABLE_NAME = 'sql_transactions';
      const TARGET_PARTITION_TABLE_NAME = 'sql_write_operations';
      const SOURCE_OPERATION_ID = 'op-terminal-carrier-source-pending';
      const TARGET_OPERATION_ID = 'op-terminal-carrier-target-removed';
      const SOURCE_REPLICA_ID = 'sql_transactions-p1-r4';
      const TARGET_REPLICA_ID = 'sql_write_operations-p1-r4';
      const SOURCE_OPERATION_PROGRESS_AT_MS = 6200;
      const TARGET_OPERATION_COMPLETED_AT_MS = 6000;
      const CAPTURED_AT_MS = 7000;
      const SOURCE_STEP_AGE_MS = 800;
      const TARGET_STEP_AGE_MS = 1000;
      const WORKFLOW_STATE_TERMINAL = 'terminal';
      const PROGRESS_PHASE_TERMINAL = 'terminal';
      const NEXT_REQUIRED_ACTION_FOLLOWUP =
        'schedule_followup_rebalance';
      const BLOCKING_BOUNDARY_REBALANCER_HANDOFF =
        'rebalancer_handoff';
      const SERIAL_WAIT_CARRIER_MESSAGE =
        'terminal removed snapshots that still advertise serial-wait lane ' +
        'ownership should remain subordinate to the source workflow';
      const SOURCE_CORRELATION_KEY =
        `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${SOURCE_OPERATION_ID}`;
      const TARGET_CORRELATION_KEY =
        `${PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${TARGET_OPERATION_ID}`;

      const trackedDecisionSnapshots =
        buildTrackedPriorityRecoveryDecisionSnapshots({
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
              SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            ],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
            operationId: SOURCE_OPERATION_ID,
            correlationKey: SOURCE_CORRELATION_KEY,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
            blockerReasons: [],
            completion: {
              state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              reasonCode: 'active_operation_still_blocks_spread',
              retryAfterMs: null,
              activeOperationCount: 1,
              temporaryOverflowVoterBudget: 0,
              allowTemporaryOverflowPromotion: false,
              blocked: true,
            },
            observation: {
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState:
                PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
              provenance: {
                capturedAt: CAPTURED_AT_MS,
                workflowSource: 'system_table_cache',
                timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                semanticSource: 'priority_recovery_snapshot',
              },
            },
            conditions: {
              visibilityState:
                PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              authoritativeOperationReadDeferred: false,
              blockerReasonCodes: [],
              admissionBlockingReasonCodes: [],
              pressure: {
                pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
                blocksCriticalRecoveryActuation: false,
              },
              latestOperationWorkflowStep:
                PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
              latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
            },
            progress: {
              contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
              nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
              workflowProgressPhaseId:
                PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
              currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
              nextRequiredAction:
                PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
              blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
              waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
              lastProgressAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
              retryAfterMs: 0,
              evidenceSourceIds: [
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
              ],
            },
            actuation: {
              workflowProgressPhaseId:
                PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
              owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
              state:
                PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
              operationCount: 1,
              latestOperationId: SOURCE_OPERATION_ID,
              stepAgeMs: SOURCE_STEP_AGE_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              lastProgressAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
              retryAfterMs: 0,
              timeoutReconcileDue: false,
            },
            planner: {
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount: null,
              readyDistinctNodeCount: null,
              spreadGap: null,
              ready: null,
              reasons: [],
            },
            admission: {
              effectiveEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
              ],
              effectiveEligibleNodeCount: 2,
              ineligibleNodes: [],
              ineligibleNodeIds: [],
              recoveryEligibleExcludedNodeIds: [],
            },
            spreadCompletion: {
              satisfied: false,
              reasonCode: 'active_operation_still_blocks_spread',
              satisfyingOperationIds: [],
              satisfyingOperationCount: 0,
              blockingOperationIds: [SOURCE_OPERATION_ID],
              blockingOperationCount: 1,
            },
            coordinator: {
              operationCount: 1,
              operationIds: [SOURCE_OPERATION_ID],
              operation: {
                operationId: SOURCE_OPERATION_ID,
                partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
                tableName: SOURCE_PARTITION_TABLE_NAME,
                type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
                status: PRIORITY_RECOVERY_STATUS_PENDING,
                workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
                sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
                targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
                replicaId: SOURCE_REPLICA_ID,
                createdAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                updatedAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                completedAtMs: null,
                stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
                latestTimelineInFlight: true,
                targetVisibilityState: 'absent',
              },
              serialWaitOperationCount: 0,
              serialWaitOperationIds: [],
              serialWaitPartitionIds: [],
            },
          }, {
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
            operationId: TARGET_OPERATION_ID,
            correlationKey: TARGET_CORRELATION_KEY,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
            blockerReasons: [],
            completion: {
              state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              reasonCode: 'unsatisfied',
              retryAfterMs: null,
              activeOperationCount: 0,
              temporaryOverflowVoterBudget: 0,
              allowTemporaryOverflowPromotion: false,
              blocked: true,
            },
            observation: {
              workflowState: WORKFLOW_STATE_TERMINAL,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState:
                PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
              provenance: {
                capturedAt: CAPTURED_AT_MS,
                workflowSource: 'system_table_cache',
                timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                semanticSource: 'priority_recovery_snapshot',
              },
            },
            conditions: {
              visibilityState:
                PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              authoritativeOperationReadDeferred: false,
              blockerReasonCodes: [],
              admissionBlockingReasonCodes: [],
              pressure: {
                pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
                blocksCriticalRecoveryActuation: false,
              },
              latestOperationWorkflowStep:
                PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
              latestOperationStatus: PRIORITY_RECOVERY_STATUS_REMOVED,
            },
            progress: {
              contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
              nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
              workflowProgressPhaseId: PROGRESS_PHASE_TERMINAL,
              currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              nextRequiredAction: NEXT_REQUIRED_ACTION_FOLLOWUP,
              blockingBoundary: BLOCKING_BOUNDARY_REBALANCER_HANDOFF,
              waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
              lastProgressAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
              retryAfterMs: 0,
              evidenceSourceIds: [
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
              ],
            },
            actuation: {
              workflowProgressPhaseId: PROGRESS_PHASE_TERMINAL,
              owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
              operationCount: 1,
              latestOperationId: TARGET_OPERATION_ID,
              stepAgeMs: TARGET_STEP_AGE_MS,
              stepTimeoutMs: 0,
              lastProgressAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
              retryAfterMs: 0,
              timeoutReconcileDue: false,
            },
            planner: {
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              requiredDistinctNodeCount: null,
              readyDistinctNodeCount: null,
              spreadGap: null,
              ready: null,
              reasons: [],
            },
            admission: {
              effectiveEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
              ],
              effectiveEligibleNodeCount: 2,
              ineligibleNodes: [],
              ineligibleNodeIds: [],
              recoveryEligibleExcludedNodeIds: [],
            },
            spreadCompletion: {
              satisfied: false,
              reasonCode: 'unsatisfied',
              satisfyingOperationIds: [],
              satisfyingOperationCount: 0,
              blockingOperationIds: [],
              blockingOperationCount: 0,
            },
            coordinator: {
              operationCount: 1,
              operationIds: [TARGET_OPERATION_ID],
              operation: {
                operationId: TARGET_OPERATION_ID,
                partitionId:
                  PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
                tableName: TARGET_PARTITION_TABLE_NAME,
                type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
                status: PRIORITY_RECOVERY_STATUS_REMOVED,
                workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
                sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
                targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
                replicaId: TARGET_REPLICA_ID,
                createdAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                updatedAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
                completedAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
                stepTimeoutMs: 0,
                latestTimelineInFlight: false,
                targetVisibilityState: 'absent',
              },
              serialWaitOperationCount: 1,
              serialWaitOperationIds: [SOURCE_OPERATION_ID],
              serialWaitPartitionIds: [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
            },
          }],
        });

      const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
        (snapshot) =>
          snapshot.partitionId ===
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
      );

      t.same(
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
        ],
        [PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        trackedTargetSnapshot?.blockerReasons,
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.equal(
        trackedTargetSnapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        trackedTargetSnapshot?.coordinator?.serialWaitOperationIds,
        [SOURCE_OPERATION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        trackedTargetSnapshot?.coordinator?.serialWaitPartitionIds,
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.match(
        trackedTargetSnapshot?.progress,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
        SERIAL_WAIT_CARRIER_MESSAGE,
      );

      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
      });
      const targetWitness =
        observationSnapshot.priorityRecoveryPartitionWitnesses.find(
          (snapshot) =>
            snapshot.partitionId ===
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        );

      t.same(
        targetWitness?.progressClassIds,
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.equal(
        targetWitness?.semanticStateId,
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        targetWitness?.serialWaitPartitionIds,
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.match(
        targetWitness,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        },
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
    },
  );

  test(
    'tracked priority recovery decision snapshots keep retained ' +
      'serial-wait carriers subordinate when spread-satisfied siblings ' +
      'keep diagnostic backlinks',
    async (t) => {
      const SOURCE_PARTITION_TABLE_NAME = 'sql_write_operations';
      const SIBLING_PARTITION_TABLE_NAME = 'sql_transactions';
      const TARGET_PARTITION_TABLE_NAME = 'sql_transaction_participants';
      const SOURCE_OPERATION_ID = 'op-retained-carrier-source-pending';
      const SIBLING_OPERATION_ID = 'op-spread-satisfied-sibling-active';
      const TARGET_OPERATION_ID = 'op-retained-carrier-target-removed';
      const SOURCE_REPLICA_ID = 'sql_write_operations-p1-r4';
      const SIBLING_REPLICA_ID = 'sql_transactions-p1-r4';
      const TARGET_REPLICA_ID = 'sql_transaction_participants-p1-r4';
      const SOURCE_OPERATION_PROGRESS_AT_MS = 6200;
      const SIBLING_OPERATION_PROGRESS_AT_MS = 6300;
      const TARGET_OPERATION_COMPLETED_AT_MS = 6000;
      const CAPTURED_AT_MS = 7000;
      const SOURCE_STEP_AGE_MS = 800;
      const SIBLING_STEP_AGE_MS = 700;
      const TARGET_STEP_AGE_MS = 1000;
      const WORKFLOW_STATE_TERMINAL = 'terminal';
      const PROGRESS_PHASE_TERMINAL = 'terminal';
      const SERIAL_WAIT_CARRIER_MESSAGE =
        'spread-satisfied siblings should not suppress the live workflow ' +
        'source needed to normalize retained serial-wait carriers';
      const SERIAL_WAIT_CARRIER_PROGRESS_MESSAGE =
        'retained serial-wait carriers should remain subordinate to the ' +
        'live workflow source';
      const SOURCE_CORRELATION_KEY =
        `${PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${SOURCE_OPERATION_ID}`;
      const SIBLING_CORRELATION_KEY =
        `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${SIBLING_OPERATION_ID}`;
      const TARGET_CORRELATION_KEY =
        `${PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID}|` +
        `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
        `${TARGET_OPERATION_ID}`;

      const trackedDecisionSnapshots =
        buildTrackedPriorityRecoveryDecisionSnapshots({
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
            [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
              SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            ],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            ],
            [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
            operationId: SOURCE_OPERATION_ID,
            correlationKey: SOURCE_CORRELATION_KEY,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
            blockerReasons: [],
            completion: {
              state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              reasonCode: 'active_operation_still_blocks_spread',
              retryAfterMs: null,
              activeOperationCount: 1,
              temporaryOverflowVoterBudget: 0,
              allowTemporaryOverflowPromotion: false,
              blocked: true,
            },
            observation: {
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState:
                PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
              provenance: {
                capturedAt: CAPTURED_AT_MS,
                workflowSource: 'system_table_cache',
                timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                semanticSource: 'priority_recovery_snapshot',
              },
            },
            conditions: {
              visibilityState:
                PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              authoritativeOperationReadDeferred: false,
              blockerReasonCodes: [],
              admissionBlockingReasonCodes: [],
              pressure: {
                pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
                blocksCriticalRecoveryActuation: false,
              },
              latestOperationWorkflowStep:
                PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
              latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
            },
            progress: {
              contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
              nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
              workflowProgressPhaseId:
                PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
              currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
              nextRequiredAction:
                PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
              blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
              waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
              lastProgressAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
              retryAfterMs: 0,
              evidenceSourceIds: [
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
              ],
            },
            actuation: {
              workflowProgressPhaseId:
                PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
              owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
              state:
                PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
              operationCount: 1,
              latestOperationId: SOURCE_OPERATION_ID,
              stepAgeMs: SOURCE_STEP_AGE_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              lastProgressAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
              retryAfterMs: 0,
              timeoutReconcileDue: false,
            },
            planner: {
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              requiredDistinctNodeCount: null,
              readyDistinctNodeCount: null,
              spreadGap: null,
              ready: null,
              reasons: [],
            },
            admission: {
              effectiveEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
              ],
              effectiveEligibleNodeCount: 2,
              ineligibleNodes: [],
              ineligibleNodeIds: [],
              recoveryEligibleExcludedNodeIds: [],
            },
            spreadCompletion: {
              satisfied: false,
              reasonCode: 'active_operation_still_blocks_spread',
              satisfyingOperationIds: [],
              satisfyingOperationCount: 0,
              blockingOperationIds: [SOURCE_OPERATION_ID],
              blockingOperationCount: 1,
            },
            coordinator: {
              operationCount: 1,
              operationIds: [SOURCE_OPERATION_ID],
              operation: {
                operationId: SOURCE_OPERATION_ID,
                partitionId:
                  PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
                tableName: SOURCE_PARTITION_TABLE_NAME,
                type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
                status: PRIORITY_RECOVERY_STATUS_PENDING,
                workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
                sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
                targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
                replicaId: SOURCE_REPLICA_ID,
                createdAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                updatedAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                completedAtMs: null,
                stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
                latestTimelineInFlight: true,
                targetVisibilityState: 'absent',
              },
              serialWaitOperationCount: 0,
              serialWaitOperationIds: [],
              serialWaitPartitionIds: [],
            },
          }, {
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
            operationId: SIBLING_OPERATION_ID,
            correlationKey: SIBLING_CORRELATION_KEY,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
            completion: {
              state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              reasonCode: 'spread_satisfied_by_active_operation',
              retryAfterMs: null,
              activeOperationCount: 1,
              temporaryOverflowVoterBudget: 0,
              allowTemporaryOverflowPromotion: false,
              blocked: true,
            },
            observation: {
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState:
                PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
              provenance: {
                capturedAt: CAPTURED_AT_MS,
                workflowSource: 'system_table_cache',
                timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                semanticSource: 'priority_recovery_snapshot',
              },
            },
            conditions: {
              visibilityState:
                PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              authoritativeOperationReadDeferred: false,
              blockerReasonCodes: [],
              admissionBlockingReasonCodes: [],
              pressure: {
                pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
                blocksCriticalRecoveryActuation: false,
              },
              latestOperationWorkflowStep:
                PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
              latestOperationStatus: PRIORITY_RECOVERY_STATUS_ACTIVE,
            },
            progress: {
              contractState:
                PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_DEFERRED,
              nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
              workflowProgressPhaseId:
                PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
              currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              nextRequiredAction:
                PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
              blockingBoundary: 'rebalancer_handoff',
              waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
              lastProgressAtMs: SIBLING_OPERATION_PROGRESS_AT_MS,
              retryAfterMs: 0,
              evidenceSourceIds: [
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
              ],
            },
            actuation: {
              workflowProgressPhaseId:
                PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
              owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              state:
                PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
              operationCount: 1,
              latestOperationId: SIBLING_OPERATION_ID,
              stepAgeMs: SIBLING_STEP_AGE_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              lastProgressAtMs: SIBLING_OPERATION_PROGRESS_AT_MS,
              retryAfterMs: 0,
              timeoutReconcileDue: false,
            },
            planner: {
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount: null,
              readyDistinctNodeCount: null,
              spreadGap: null,
              ready: null,
              reasons: [],
            },
            admission: {
              effectiveEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
              ],
              effectiveEligibleNodeCount: 2,
              ineligibleNodes: [],
              ineligibleNodeIds: [],
              recoveryEligibleExcludedNodeIds: [],
            },
            spreadCompletion: {
              satisfied: true,
              reasonCode: 'spread_satisfied_by_active_operation',
              satisfyingOperationIds: [SIBLING_OPERATION_ID],
              satisfyingOperationCount: 1,
              blockingOperationIds: [],
              blockingOperationCount: 0,
            },
            coordinator: {
              operationCount: 1,
              operationIds: [SIBLING_OPERATION_ID],
              operation: {
                operationId: SIBLING_OPERATION_ID,
                partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
                tableName: SIBLING_PARTITION_TABLE_NAME,
                type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
                status: PRIORITY_RECOVERY_STATUS_ACTIVE,
                workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
                sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
                targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
                replicaId: SIBLING_REPLICA_ID,
                createdAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                updatedAtMs: SIBLING_OPERATION_PROGRESS_AT_MS,
                completedAtMs: null,
                stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
                latestTimelineInFlight: true,
                targetVisibilityState:
                  PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
              },
              serialWaitOperationCount: 1,
              serialWaitOperationIds: [SOURCE_OPERATION_ID],
              serialWaitPartitionIds: [
                PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              ],
            },
          }, {
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
            operationId: TARGET_OPERATION_ID,
            correlationKey: TARGET_CORRELATION_KEY,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
            blockerReasons: [],
            completion: {
              state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
              reasonCode: 'unsatisfied',
              retryAfterMs: null,
              activeOperationCount: 0,
              temporaryOverflowVoterBudget: 0,
              allowTemporaryOverflowPromotion: false,
              blocked: true,
            },
            observation: {
              workflowState: WORKFLOW_STATE_TERMINAL,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState:
                PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
              provenance: {
                capturedAt: CAPTURED_AT_MS,
                workflowSource: 'system_table_cache',
                timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
                semanticSource: 'priority_recovery_snapshot',
              },
            },
            conditions: {
              visibilityState:
                PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              authoritativeOperationReadDeferred: false,
              blockerReasonCodes: [],
              admissionBlockingReasonCodes: [],
              pressure: {
                pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
                blocksCriticalRecoveryActuation: false,
              },
              latestOperationWorkflowStep:
                PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
              latestOperationStatus: PRIORITY_RECOVERY_STATUS_REMOVED,
            },
            progress: {
              contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
              nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
              workflowProgressPhaseId: PROGRESS_PHASE_TERMINAL,
              currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              nextRequiredAction: 'schedule_followup_rebalance',
              blockingBoundary: 'rebalancer_handoff',
              waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
              lastProgressAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
              retryAfterMs: 0,
              evidenceSourceIds: [
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
                PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
              ],
            },
            actuation: {
              workflowProgressPhaseId: PROGRESS_PHASE_TERMINAL,
              owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
              operationCount: 1,
              latestOperationId: TARGET_OPERATION_ID,
              stepAgeMs: TARGET_STEP_AGE_MS,
              stepTimeoutMs: 0,
              lastProgressAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
              retryAfterMs: 0,
              timeoutReconcileDue: false,
            },
            planner: {
              partitionId:
                PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
              requiredDistinctNodeCount: null,
              readyDistinctNodeCount: null,
              spreadGap: null,
              ready: null,
              reasons: [],
            },
            admission: {
              effectiveEligibleNodeIds: [
                PRIORITY_RECOVERY_NODE_ID_A,
                PRIORITY_RECOVERY_NODE_ID_B,
              ],
              effectiveEligibleNodeCount: 2,
              ineligibleNodes: [],
              ineligibleNodeIds: [],
              recoveryEligibleExcludedNodeIds: [],
            },
            spreadCompletion: {
              satisfied: false,
              reasonCode: 'unsatisfied',
              satisfyingOperationIds: [],
              satisfyingOperationCount: 0,
              blockingOperationIds: [],
              blockingOperationCount: 0,
            },
            coordinator: {
              operationCount: 1,
              operationIds: [TARGET_OPERATION_ID],
              operation: {
                operationId: TARGET_OPERATION_ID,
                partitionId:
                  PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
                tableName: TARGET_PARTITION_TABLE_NAME,
                type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
                status: PRIORITY_RECOVERY_STATUS_REMOVED,
                workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
                sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
                targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
                replicaId: TARGET_REPLICA_ID,
                createdAtMs: SOURCE_OPERATION_PROGRESS_AT_MS,
                updatedAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
                completedAtMs: TARGET_OPERATION_COMPLETED_AT_MS,
                stepTimeoutMs: 0,
                latestTimelineInFlight: false,
                targetVisibilityState: 'absent',
              },
              serialWaitOperationCount: 1,
              serialWaitOperationIds: [SOURCE_OPERATION_ID],
              serialWaitPartitionIds: [
                PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              ],
            },
          }],
        });

      const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
        (snapshot) =>
          snapshot.partitionId ===
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
      );

      t.same(
        trackedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
        ],
        [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.same(
        trackedTargetSnapshot?.blockerReasons,
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.equal(
        trackedTargetSnapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.match(
        trackedTargetSnapshot,
        {
          coordinator: {
            serialWaitOperationIds: [SOURCE_OPERATION_ID],
            serialWaitPartitionIds: [
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            ],
          },
          progress: {
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary:
              PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          },
        },
        SERIAL_WAIT_CARRIER_PROGRESS_MESSAGE,
      );

      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
      });
      const partitionWitness =
        observationSnapshot.priorityRecoveryPartitionWitnesses.find(
          (snapshot) =>
            snapshot.partitionId ===
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        );

      t.same(
        partitionWitness?.progressClassIds,
        [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT],
        SERIAL_WAIT_CARRIER_MESSAGE,
      );
      t.match(
        partitionWitness,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          serialWaitOperationIds: [SOURCE_OPERATION_ID],
          serialWaitPartitionIds: [
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
        },
        SERIAL_WAIT_CARRIER_PROGRESS_MESSAGE,
      );
    },
  );

  test(RETAINED_CARRIER_SERIAL_WAIT_RELEASE_TEST_NAME, async (t) => {
    const trackedDecisionSnapshots =
      buildTrackedPriorityRecoveryDecisionSnapshots({
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: [],
          [PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: [],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
            PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH]: [],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT]: [
            PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          ],
          [PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED]: [],
        },
        snapshots: [{
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: null,
          correlationKey:
            `${SQL_TRANSACTION_PRIORITY_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|operation_unknown`,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
          ],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
            reasonCode: STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: true,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
            provenance: {
              capturedAt:
                RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
              workflowSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
              timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
              semanticSource:
                STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
            },
          },
          conditions: {
            visibilityState: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            authoritativeOperationReadDeferred: false,
            blockerReasonCodes: [
              PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
            ],
            admissionBlockingReasonCodes: [],
            pressure: {
              pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
              blocksCriticalRecoveryActuation: false,
            },
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS,
              STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state: 'transition_deferred',
            operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepAgeMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            ready: false,
            reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            effectiveEligibleNodeCount:
              PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
            ineligibleNodes: [],
            ineligibleNodeIds: [],
            recoveryEligibleExcludedNodeIds: [],
          },
          spreadCompletion: {
            satisfied: false,
            reasonCode: STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED,
            satisfyingOperationIds: [],
            satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            blockingOperationIds: [],
            blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            operationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
            operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
            serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            serialWaitOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            ],
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
          correlationKey:
            `${PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
            `${RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID}`,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
            reasonCode:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: true,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState: PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
            provenance: {
              capturedAt:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              workflowSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
              semanticSource:
                STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
            },
          },
          conditions: {
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            authoritativeOperationReadDeferred: false,
            blockerReasonCodes: [],
            admissionBlockingReasonCodes: [],
            pressure: {
              pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
              blocksCriticalRecoveryActuation: false,
            },
            latestOperationWorkflowStep:
              PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            latestOperationId:
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId:
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
            ready: false,
            reasons: [STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP],
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            effectiveEligibleNodeCount:
              PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
            ineligibleNodes: [],
            ineligibleNodeIds: [],
            recoveryEligibleExcludedNodeIds: [],
          },
          spreadCompletion: {
            satisfied: false,
            reasonCode:
              SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD,
            satisfyingOperationIds: [],
            satisfyingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            blockingOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            blockingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            operationIds: [RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID],
            operation: {
              operationId:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
              partitionId:
                PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
              tableName: RETAINED_CARRIER_SERIAL_WAIT_SOURCE_TABLE_NAME,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
              sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
              targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
              replicaId:
                PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
              createdAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              updatedAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              latestTimelineInFlight: true,
            },
            serialWaitOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            serialWaitOperationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
            serialWaitPartitionIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
          correlationKey:
            `${PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
            `${RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID}`,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state:
              PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            reasonCode:
              PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: false,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            provenance: {
              capturedAt:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              workflowSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
              semanticSource:
                STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
            },
          },
          conditions: {
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            authoritativeOperationReadDeferred: false,
            blockerReasonCodes: [],
            admissionBlockingReasonCodes: [],
            pressure: {
              pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
              blocksCriticalRecoveryActuation: false,
            },
            latestOperationWorkflowStep:
              PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
            operationCount: 2,
            latestOperationId:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
            stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
            ready: false,
            reasons: [],
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            effectiveEligibleNodeCount:
              PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
            ineligibleNodes: [],
            ineligibleNodeIds: [],
            recoveryEligibleExcludedNodeIds: [],
          },
          spreadCompletion: {
            satisfied: true,
            reasonCode:
              PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
            satisfyingOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
            ],
            satisfyingOperationCount: 2,
            blockingOperationIds: [],
            blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
          coordinator: {
            operationCount: 2,
            operationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
            ],
            operation: {
              operationId:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              tableName: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_TABLE_NAME,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_PENDING,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
              sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
              targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
              replicaId: PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID,
              createdAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              updatedAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
              latestTimelineInFlight: true,
              targetVisibilityState:
                PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
              targetServiceProgressAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            },
            serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            serialWaitOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            ],
          },
        }, {
          partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          operationId:
            RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
          correlationKey:
            `${PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID}|` +
            `${PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH}|` +
            `${RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID}`,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
          blockerReasons: [],
          completion: {
            state:
              PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            reasonCode:
              PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
            retryAfterMs: null,
            activeOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            temporaryOverflowVoterBudget: PRIORITY_RECOVERY_EMPTY_COUNT,
            allowTemporaryOverflowPromotion: false,
            blocked: false,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            convergenceState:
              PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            provenance: {
              capturedAt:
                RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
              workflowSource:
                STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE,
              timelineSource: PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
              semanticSource:
                STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT,
            },
          },
          conditions: {
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
            authoritativeOperationReadDeferred: false,
            blockerReasonCodes: [],
            admissionBlockingReasonCodes: [],
            pressure: {
              pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
              blocksCriticalRecoveryActuation: false,
            },
            latestOperationWorkflowStep:
              PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
            latestOperationStatus: PRIORITY_RECOVERY_STATUS_PENDING,
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            evidenceSourceIds: [
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
              PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
            ],
          },
          actuation: {
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
            operationCount: 2,
            latestOperationId:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
            stepAgeMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
            lastProgressAtMs:
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS,
            retryAfterMs: PRIORITY_RECOVERY_EMPTY_COUNT,
            timeoutReconcileDue: false,
          },
          planner: {
            partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_EMPTY_COUNT,
            ready: false,
            reasons: [],
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            effectiveEligibleNodeCount:
              PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
            ineligibleNodes: [],
            ineligibleNodeIds: [],
            recoveryEligibleExcludedNodeIds: [],
          },
          spreadCompletion: {
            satisfied: true,
            reasonCode:
              PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
            satisfyingOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
            ],
            satisfyingOperationCount: 2,
            blockingOperationIds: [],
            blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
          },
          coordinator: {
            operationCount: 2,
            operationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID,
              RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
            ],
            operation: {
              operationId:
                RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID,
              partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
              tableName: RETAINED_CARRIER_SERIAL_WAIT_CARRIER_TABLE_NAME,
              type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
              status: PRIORITY_RECOVERY_STATUS_REMOVED,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
              sourceNodeId: PRIORITY_RECOVERY_NODE_ID_A,
              targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
              replicaId: PRIORITY_RECOVERY_SQL_WRITE_CREATING_REPLICA_ID,
              createdAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              updatedAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              completedAtMs:
                RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS,
              stepTimeoutMs: PRIORITY_RECOVERY_EMPTY_COUNT,
              latestTimelineInFlight: false,
              targetVisibilityState:
                PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
            },
            serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            serialWaitOperationIds: [
              RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            ],
          },
        }],
      });

    const trackedTargetSnapshot = trackedDecisionSnapshots.snapshots.find(
      (snapshot) => snapshot.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    );

    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT
      ],
      [],
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedDecisionSnapshots.blockerPartitionIdsByReason[
        PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION
      ],
      [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.coordinator?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      trackedTargetSnapshot?.coordinator?.serialWaitPartitionIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.match(
      trackedTargetSnapshot?.progress,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    );

    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: trackedDecisionSnapshots,
    });
    const targetWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses.find(
        (snapshot) => snapshot.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID,
      );

    t.same(
      targetWitness?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      targetWitness?.progressClassIds,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.match(
      targetWitness,
      {
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      RETAINED_CARRIER_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    );
  });
}

const priorityRecoverySnapshotTestContext = {
  buildPriorityRecoveryActuationDecisionInput,
  buildPriorityRecoveryAdmissionPlan,
  buildPriorityRecoveryClosureWitness,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryObservationSnapshot,
  buildPriorityRecoveryPublicationContext,
  buildTrackedPriorityRecoveryDecisionSnapshots,
  CONTROL_PLANE_READINESS_DIMENSION,
  isPriorityRecoveryEmergencyPartition,
  PRIORITY_RECOVERY_ABSENT_OPERATION,
  PRIORITY_RECOVERY_ACTIVE_SOURCE_REMOVAL_AGE_MS,
  PRIORITY_RECOVERY_ACTIVE_TARGET_COMPLETION_MESSAGE,
  PRIORITY_RECOVERY_ACTIVE_TARGET_NOT_MISSING_OPERATION_MESSAGE,
  PRIORITY_RECOVERY_ACTIVE_TARGET_PROGRESS_MESSAGE,
  PRIORITY_RECOVERY_ACTIVE_TARGET_SEMANTIC_MESSAGE,
  PRIORITY_RECOVERY_ACTIVE_TARGET_SPREAD_WITNESS_MESSAGE,
  PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
  PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
  PRIORITY_RECOVERY_ACTUATION_STATE_NO_ACTION_NEEDED,
  PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
  PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
  PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_REASON_CLUSTER_INTEGRITY,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  PRIORITY_RECOVERY_ADMISSION_STATE_BLOCKED,
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
  PRIORITY_RECOVERY_BLOCKED_FENCE,
  PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
  PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
  PRIORITY_RECOVERY_BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED,
  PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
  PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGED,
  PRIORITY_RECOVERY_CONVERGENCE_STATE_CONVERGING,
  PRIORITY_RECOVERY_CONVERGENCE_STATE_SPREAD_GAP,
  PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED,
  PRIORITY_RECOVERY_DUAL_EMERGENCY_BUDGET_LIMIT,
  PRIORITY_RECOVERY_DUAL_EMERGENCY_OVERFLOW_SLOT_COUNT,
  PRIORITY_RECOVERY_DUAL_PRIORITY_IN_FLIGHT_COUNT,
  PRIORITY_RECOVERY_EMPTY_COUNT,
  PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
  PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
  PRIORITY_RECOVERY_FAILED_REPLACE_ACTIVE_TARGET_TEST_NAME,
  PRIORITY_RECOVERY_FIRST_PARTITION_WITNESS_INDEX,
  PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_CAPTURED_AT_MS,
  PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_CORRELATION_KEY,
  PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_OPERATION_ID,
  PRIORITY_RECOVERY_HIGHER_EPOCH_PROGRESS_UPDATED_AT_MS,
  PRIORITY_RECOVERY_HIGHER_EPOCH_VALUE,
  PRIORITY_RECOVERY_LOWER_EPOCH_SYNTHETIC_CAPTURED_AT_MS,
  PRIORITY_RECOVERY_LOWER_EPOCH_VALUE,
  PRIORITY_RECOVERY_NEWER_OPERATION_COMPLETED_AT_MS,
  PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
  PRIORITY_RECOVERY_NODE_ID_A,
  PRIORITY_RECOVERY_NODE_ID_B,
  PRIORITY_RECOVERY_NODE_ID_C,
  PRIORITY_RECOVERY_OBSERVATION_STATE_NONE,
  PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
  PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
  PRIORITY_RECOVERY_OPERATION_ID_COMPLETED_REPLACE_VISIBLE,
  PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE,
  PRIORITY_RECOVERY_OPERATION_ID_ELIGIBLE_REMOVE_PHASE,
  PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_COMPLETED_REPLACE,
  PRIORITY_RECOVERY_OPERATION_ID_EXCLUDED_TARGET_CREATING,
  PRIORITY_RECOVERY_OPERATION_ID_FAILED_REPLACE_ACTIVE_TARGET,
  PRIORITY_RECOVERY_OPERATION_ID_NEWER_FAILED_REPLACE,
  PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY,
  PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
  PRIORITY_RECOVERY_OPERATION_ID_PENDING_PLANNER_READY,
  PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
  PRIORITY_RECOVERY_OPERATION_ID_RELEASED_SERIAL_WAIT,
  PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
  PRIORITY_RECOVERY_OPERATION_ID_SUPERSEDED_SYNCING,
  PRIORITY_RECOVERY_OPERATION_ID_SYNCING,
  PRIORITY_RECOVERY_OPERATION_ID_SYNCING_FOLLOWER_TARGET,
  PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
  PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
  PRIORITY_RECOVERY_OPERATION_TYPE_ADD,
  PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
  PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
  PRIORITY_RECOVERY_PENDING_CAPTURED_AT_MS,
  PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
  PRIORITY_RECOVERY_PENDING_SHORT_TIMEOUT_MS,
  PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
  PRIORITY_RECOVERY_PRESSURE_STATE_BACKPRESSURED,
  PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
  PRIORITY_RECOVERY_PRESSURE_STATE_WRITE_BACKLOG,
  PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
  PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
  PRIORITY_RECOVERY_PROGRESS_ACTION_OBSERVE_VISIBILITY,
  PRIORITY_RECOVERY_PROGRESS_ACTION_RECONCILE_STALE_OPERATION,
  PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
  PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
  PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
  PRIORITY_RECOVERY_PROGRESS_BOUNDARY_VISIBILITY,
  PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
  PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW_TIMEOUT,
  PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
  PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_DEFERRED,
  PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
  PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
  PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
  PRIORITY_RECOVERY_PROGRESS_EVIDENCE_OPERATION_CONTEXT,
  PRIORITY_RECOVERY_PROGRESS_EVIDENCE_WORKFLOW_STATE,
  PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
  PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
  PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
  PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
  PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
  PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
  PRIORITY_RECOVERY_PROGRESS_OWNER_VISIBILITY,
  PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
  PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
  PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
  PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
  PRIORITY_RECOVERY_PROGRESS_WAIT_DEFERRED_VISIBILITY,
  PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
  PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
  PRIORITY_RECOVERY_PROGRESS_WAIT_RETRY_SCHEDULED,
  PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
  PRIORITY_RECOVERY_PROGRESS_WAIT_TIMEOUT_RECONCILE_DUE,
  PRIORITY_RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING,
  PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_ADDRESS,
  PRIORITY_RECOVERY_PUBLICATION_REPLACEMENT_REPLICA_ID,
  PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
  PRIORITY_RECOVERY_RAFT_ROLE_FOLLOWER,
  PRIORITY_RECOVERY_RAFT_ROLE_LEARNER,
  PRIORITY_RECOVERY_RAFT_ROLE_VOTER,
  PRIORITY_RECOVERY_READY_ELIGIBLE_NODE_COUNT,
  PRIORITY_RECOVERY_REASON_CLUSTER_MEMBER_UNHEALTHY,
  PRIORITY_RECOVERY_REASON_CONTROL_PLANE_WRITE_UNHEALTHY,
  PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
  PRIORITY_RECOVERY_REASON_PLANNER_READY,
  PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
  PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_CAPTURED_AT_MS,
  PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_PROGRESS_AT_MS,
  PRIORITY_RECOVERY_REPLICA_ID_SYNCING,
  PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
  PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
  PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
  PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
  PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED,
  PRIORITY_RECOVERY_SEMANTIC_STATE_COORDINATION_MISMATCH,
  PRIORITY_RECOVERY_SEMANTIC_STATE_LEARNER_PROMOTION_BLOCKED,
  PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
  PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
  PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
  PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
  PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_MESSAGE,
  PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_PARTITION_MESSAGE,
  PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_IDS_MESSAGE,
  PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_MESSAGE,
  PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
  PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_TEST_NAME,
  PRIORITY_RECOVERY_SERIAL_WAIT_WITNESS_ID_MESSAGE,
  PRIORITY_RECOVERY_SERIAL_WAIT_WITNESS_TEST_NAME,
  PRIORITY_RECOVERY_SINGLE_ADD_BUDGET_LIMIT,
  PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
  PRIORITY_RECOVERY_SINGLE_EMERGENCY_OVERFLOW_SLOT_COUNT,
  PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
  PRIORITY_RECOVERY_SINGLE_PRIORITY_IN_FLIGHT_COUNT,
  PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
  PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_FAILED_REPLICA_ID,
  PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
  PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
  PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_STALE_REPLICA_ID,
  PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLACEMENT_REPLICA_ID,
  PRIORITY_RECOVERY_SQL_TRANSACTIONS_REPLICA_ID,
  PRIORITY_RECOVERY_SQL_WRITE_COMPLETED_REPLICA_ID,
  PRIORITY_RECOVERY_SQL_WRITE_CREATING_REPLICA_ID,
  PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
  PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
  PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
  PRIORITY_RECOVERY_STALE_SERIAL_WAIT_CAPTURED_AT_MS,
  PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_MESSAGE,
  PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
  PRIORITY_RECOVERY_STALE_SERIAL_WAIT_RELEASE_TEST_NAME,
  PRIORITY_RECOVERY_STATUS_ACTIVE,
  PRIORITY_RECOVERY_STATUS_COMPLETED,
  PRIORITY_RECOVERY_STATUS_CREATING,
  PRIORITY_RECOVERY_STATUS_FAILED,
  PRIORITY_RECOVERY_STATUS_PENDING,
  PRIORITY_RECOVERY_STATUS_REMOVED,
  PRIORITY_RECOVERY_STATUS_SYNCING,
  PRIORITY_RECOVERY_SUPERSEDED_OPERATION_UPDATED_AT_MS,
  PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
  PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
  PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT,
  PRIORITY_RECOVERY_TOTAL_PRIORITY_PARTITION_COUNT,
  PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
  PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
  PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
  PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
  PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
  PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
  PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
  PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
  PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
  PRIORITY_RECOVERY_WORKFLOW_STEP_SYNCING,
  PUBLICATION_PRIORITY_PARTITION_ID,
  REPLICA_OPERATION_PRIORITY_PARTITION_ID,
  resolvePriorityRecoveryAdmissionPlanFromPublication,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  SQL_TRANSACTION_PRIORITY_PARTITION_ID,
  test,
};

registerPriorityRecoverySnapshotCore01Tests(priorityRecoverySnapshotTestContext);
registerPriorityRecoverySnapshotCore02Tests(priorityRecoverySnapshotTestContext);
registerPriorityRecoverySnapshotCore03Tests(priorityRecoverySnapshotTestContext);
registerPriorityRecoverySnapshotCore04Tests(priorityRecoverySnapshotTestContext);
registerPriorityRecoverySnapshotCore05Tests(priorityRecoverySnapshotTestContext);
registerPriorityRecoverySnapshotCore06Tests(priorityRecoverySnapshotTestContext);
registerPriorityRecoverySnapshotCore07Tests(priorityRecoverySnapshotTestContext);
registerPriorityRecoverySnapshotCore08Tests(priorityRecoverySnapshotTestContext);
registerPriorityRecoverySnapshotSupplementalTests(
  priorityRecoverySnapshotTestContext,
);
