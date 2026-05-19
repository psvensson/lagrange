import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {buildPriorityRecoveryDecisionSnapshot} from
  '../../src/control-plane/priority-recovery-snapshot.js';
import {buildPriorityRecoveryObservationSnapshot} from
  '../../src/control-plane/priority-recovery-observation-snapshot.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_REASON_CODE_VALUES,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as STAGE_SHARED} from
  '../../src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {registerPriorityRecoveryTopologyTimeoutOwnerReentryTestCases} from './priority-recovery-topology-timeout-owner-reentry-test-cases.js';
import {registerPriorityRecoverySqlDispatchTimeoutReentryTestCases} from './priority-recovery-sql-dispatch-timeout-reentry-test-cases.js';
import {registerPriorityRecoverySnapshotHandoffTimeoutReentryTestCases} from './priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js';
import {registerPriorityRecoverySerialWaitCoordinatorHandoffTestCases} from './priority-recovery-serial-wait-coordinator-handoff-test-cases.js';

const {
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE,
} = STAGE_SHARED;

const TEST_ENTITY_TYPE_PARTITION = 'partition';
const TEST_OPERATION_ID = 'priority-dispatch-pending-timeout-operation';
const TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID =
  'priority-sql-dispatch-pending-timeout-operation';
const TEST_AUTHORITATIVE_ONLY_OPERATION_ID =
  'priority-authoritative-only-timeout-operation';
const TEST_SERIAL_WAIT_OPERATION_ID =
  'priority-dispatch-pending-serial-wait-operation';
const TEST_REPRESENTATIVE_PUBLICATION_OPERATION_ID =
  '96c522ac-95c7-4713-96da-a98010d295d9';
const TEST_PUBLICATION_COUNT_ONLY_PUBLICATION_OPERATION_ID =
  '4c6da3d9-3dc9-4288-81d8-d0730df1657d';
const TEST_PUBLICATION_COUNT_ONLY_REPLICA_OPERATION_ID =
  '84f3d14d-b26a-4702-b7c4-4821eaf7acac';
const TEST_PUBLICATION_COUNT_ONLY_SQL_PARTICIPANT_OPERATION_ID =
  'c56129f4-fbc9-4ccc-8e72-c625ae9259a4';
const TEST_PUBLICATION_COUNT_ONLY_SQL_TRANSACTION_OPERATION_ID =
  '36b42a1f-bba3-487d-a7f4-c7cbc06c0c3e';
const TEST_OPERATION_TYPE_REPLACE = OperationType.REPLACE;
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_LOCAL_OWNER_PARTITION_ID = 'control_plane_publications-p1';
const TEST_AUTHORITATIVE_ONLY_PARTITION_ID = 'replica_operations-p1';
const TEST_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID =
  'sql_transaction_participants-p1';
const TEST_SQL_TRANSACTIONS_PARTITION_ID = 'sql_transactions-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_LOCAL_OWNER_REPLICA_ID = 'control_plane_publications-p1-r4';
const TEST_AUTHORITATIVE_ONLY_REPLICA_ID = 'replica_operations-p1-r4';
const TEST_SQL_TRANSACTION_PARTICIPANTS_REPLICA_ID =
  'sql_transaction_participants-p1-r4';
const TEST_SQL_TRANSACTIONS_REPLICA_ID = 'sql_transactions-p1-r4';
const TEST_OBSERVER_NODE_ID = 'node-observer';
const TEST_SOURCE_NODE_ID = 'node-source';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_STATUS_PENDING = ReplicaStatus.PENDING;
const TEST_STATUS_CREATING = ReplicaStatus.CREATING;
const TEST_STATUS_ACTIVE = ReplicaStatus.ACTIVE;
const TEST_STEP_PENDING = WORKFLOW_STEP.PENDING;
const TEST_STEP_SENDING = WORKFLOW_STEP.SENDING;
const TEST_STEP_CREATING = WORKFLOW_STEP.CREATING;
const TEST_STEP_ACTIVE = WORKFLOW_STEP.ACTIVE;
const TEST_STEP_HISTORY_LAG_MS = 1000;
const TEST_TIMEOUT_OVERRUN_MS = 1;
const TEST_HANDOFF_TIMEOUT_MS = 7;
const TEST_RETRY_AFTER_MS = 11;
const TEST_EMPTY_VALUE = null;
const TEST_ACTUAL_STATUS_ABSENT = null;
const TEST_UNDEFINED_VALUE = undefined;
const TEST_OPERATION_OWNER_STATE =
  'priority_dispatch_pending_timeout_owner_state';
const TEST_OPERATION_OWNER_CORRELATION_KEY =
  'priority_dispatch_pending_timeout_owner_correlation';
const TEST_OPERATION_OWNER_SOURCE_REVISION =
  'priority_dispatch_pending_timeout_owner_revision';
const TEST_REPLICA_DISPATCH_TARGET =
  'node-target/service/replica-dispatch';
const TEST_REPLICA_HANDLER_DISPATCH_TARGET =
  'node-target/service/replica-handler';
const TEST_REPLICA_SERVICE_ADDRESS =
  'node-target/partition/control_plane_publications-p1-r4';
const TEST_RAFT_ROLE_FOLLOWER = 'follower';
const TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE =
  STAGE_SHARED.OPERATION_WORKFLOW_OWNER_SHARED.OPERATION_WORKFLOW_OWNER_LITERAL
    .REPLICA_OPERATION_DISPATCH;
const TEST_RETRYABLE_HANDOFF_ERROR = 'handoff retryable timeout';
const TEST_RETRYABLE_TRANSITION_FAILURE =
  'retryable transition claim failure';
const TEST_DEFERRED_RETRY_PENDING_REASON =
  STAGE_SHARED.OPERATION_WORKFLOW_OWNER_SHARED.REBALANCER_SKIP_REASON
    .DEFERRED_RETRY_PENDING;
const TEST_COORDINATOR_CREATED_REMOTE_HANDOFF =
  'coordinator_created_remote_handoff';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_PUBLICATION_EPOCH = 2;
const TEST_CAPTURED_AT_MS = 1000000;
const TEST_OPERATION_CREATED_AT_MS = 900000;
const TEST_STEP_TIMEOUT_MS = 30000;
const TEST_LONG_REMOTE_HANDOFF_GRACE_MS = TEST_STEP_TIMEOUT_MS;
const TEST_SPREAD_GAP = 1;
const TEST_READY_DISTINCT_NODE_COUNT = 1;
const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
const TEST_READY_ELIGIBLE_NODE_COUNT = 2;
const TEST_TIMELINE_LENGTH = 1;
const TEST_TIMELINE_STEP_COUNT = 1;
const TEST_EMPTY_LIST = Object.freeze([]);
const TEST_SERIAL_WAIT_OPERATION_IDS = Object.freeze([
  TEST_SERIAL_WAIT_OPERATION_ID,
]);
const TEST_SERIAL_WAIT_PARTITION_IDS = Object.freeze([
  TEST_LOCAL_OWNER_PARTITION_ID,
]);
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
const TEST_SERVICES_TABLE = 'services';
const TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT = 'FROM replica_operations';
const TEST_QUERY_OPERATION_BY_ID_FRAGMENT = 'WHERE operation_id = ?';
const TEST_UPDATE_REPLICA_OPERATIONS_PREFIX =
  'UPDATE replica_operations SET';
const TEST_QUERY_SERVICES_FRAGMENT = 'FROM services';
const TEST_DELIVERY_STATUS_INITIATED = 'initiated';
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_MICROTASK_DELAY_MS = 0;
const TEST_STALE_REMOTE_HANDOFF_REWAKE_TEST_NAME =
  'checkTimeouts re-wakes stale remote-owned priority handoff retries ' +
  'even while transition grace remains active';
const TEST_ASSERT_STALE_HANDOFF_ARMS_RETRY =
  'the stale witness should arm the remote handoff retry lane first';
const TEST_ASSERT_LONGER_GRACE_REMAINS_ACTIVE =
  'the longer transition grace should still be active after the handoff ' +
  'retry is overdue';
const TEST_ASSERT_STALE_HANDOFF_REWAKES_REMOTE_OWNER =
  'timeout reconciliation should re-wake the remote owner when the armed ' +
  'handoff retry is overdue';
const TEST_ASSERT_STALE_HANDOFF_REWAKE_TARGET =
  'stale handoff retry reconciliation should use the canonical remote ' +
  'dispatch ingress';
const TEST_ASSERT_STALE_HANDOFF_REPLACES_TIMER =
  'the fresh remote owner wake should replace the stale retry with a new ' +
  'verification timer';
const TEST_ASSERT_STALE_HANDOFF_REMAINS_SINGLE_TIMER =
  'exactly one remote handoff retry timer should remain armed after stale ' +
  'retry reconciliation';
const TEST_SQL_PRIORITY_TIMEOUT_REDISPATCH_TEST_NAME =
  'checkTimeouts re-dispatches locally owned priority SQL PENDING rows ' +
  'while the operation budget is still active';
const TEST_ASSERT_SQL_PRIORITY_LOCAL_OWNER =
  'priority SQL timeout witness should be locally owned by the replacement ' +
  'target node';
const TEST_ASSERT_SQL_PRIORITY_REARM =
  'priority SQL PENDING rows should be eligible for dispatch re-arm while ' +
  'the operation budget remains active';
const TEST_ASSERT_SQL_PRIORITY_DISPATCH =
  'priority SQL timeout reconciliation should dispatch the local-owner ' +
  'operation once';
const TEST_ASSERT_SQL_PRIORITY_DISPATCH_TARGET =
  'priority SQL re-dispatch should target the canonical replica handler';
const TEST_ASSERT_SQL_PRIORITY_DISPATCH_TIMEOUT =
  'priority SQL replica dispatch should carry the owner delivery deadline';
const TEST_ASSERT_SQL_PRIORITY_DISPATCH_SOURCE =
  'priority SQL replica dispatch should identify the owner delivery source';
const TEST_ASSERT_SQL_PRIORITY_STEP =
  'priority SQL re-dispatch should advance durable workflow progress out of ' +
  'PENDING';
const TEST_ASSERT_SQL_PRIORITY_STATUS =
  'priority SQL re-dispatch should persist the creating status after ' +
  'dispatch acknowledgement';
const TEST_ASSERT_SQL_PRIORITY_TRANSITIONS =
  'priority SQL re-dispatch should persist the SENDING and CREATING ' +
  'transitions';
const TEST_EXPECTED_WORKFLOW_STEP_PARAM_INDEX = 8;
const TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS =
  STAGE_SHARED.OPERATION_WORKFLOW_OWNER_SHARED
    .REPLICA_OPERATION_DISPATCH_TIMEOUT_MS;
const TEST_ASSERT_SQL_PRIORITY_CLAIM_NO_SESSION =
  'priority SQL dispatch claim should bypass the routed system write session';
const TEST_ASSERT_SQL_PRIORITY_CLAIM_SESSION_ABSENT =
  'priority SQL dispatch claim should not create a routed session id';
const TEST_ASSERT_SQL_PRIORITY_CLAIM_CAS =
  'priority SQL dispatch claim should preserve the PENDING compare-and-set guard';
const TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET =
  'priority SQL dispatch claim should use a bounded per-attempt mutation budget';
const TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET =
  'priority SQL dispatch progress should use a bounded per-attempt mutation ' +
  'budget';
const TEST_SQL_PRIORITY_STALE_VISIBILITY_REDISPATCH_TEST_NAME =
  'local-owner priority SQL dispatch publishes deferred transition visibility ' +
  'while authoritative reads lag';
const TEST_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH_TEST_NAME =
  'local-owner priority SQL dispatch proceeds when the SENDING claim is ' +
  'retryably deferred';
const TEST_SQL_PRIORITY_DEFERRED_PROGRESS_DISPATCH_TEST_NAME =
  'local-owner priority SQL dispatch publishes deferred CREATING progress ' +
  'after target delivery';
const TEST_SQL_PRIORITY_PENDING_WAKE_ACTIVE_RECONCILE_TEST_NAME =
  'local-owner priority SQL dispatch wake reconciles PENDING rows from active ' +
  'target evidence';
const TEST_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_RECONCILE_TEST_NAME =
  'local-owner priority SQL dispatch wake reconciles PENDING rows from ' +
  'accepted target evidence';
const TEST_ASSERT_SQL_PRIORITY_STALE_ROW =
  'the test must keep the authoritative SQL row stale to model lagging ' +
  'visibility';
const TEST_ASSERT_SQL_PRIORITY_SNAPSHOT_STEP =
  'priority snapshot should consume the owner-persisted transition instead of ' +
  'reclassifying stale PENDING as dispatch-pending';
const TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH =
  'retryable priority claim pressure should not block local target dispatch';
const TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_STEP =
  'the next durable priority transition should advance directly to CREATING';
const TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_CAS =
  'deferred local priority claims should preserve the original PENDING CAS';
const TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_STALE_ROW =
  'retryable priority progress pressure should leave the durable row stale';
const TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_TIMER =
  'retryable priority progress pressure should arm one durable retry';
const TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY =
  'retryable priority progress pressure should retry the durable transition';
const TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STEP =
  'retryable priority progress retry should persist CREATING durably';
const TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STATUS =
  'retryable priority progress retry should persist creating status durably';
const TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_NO_CREATE =
  'active target evidence should preempt duplicate create dispatch';
const TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_SUCCESS =
  'dispatch wake reconciliation should report owner progress';
const TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STEP =
  'dispatch wake should reconcile the stale PENDING row to ACTIVE';
const TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STATUS =
  'dispatch wake should persist the active status from target evidence';
const TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STEP =
  'dispatch wake should reconcile accepted target evidence to CREATING';
const TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STATUS =
  'dispatch wake should persist the creating status from accepted target evidence';
const TEST_SNAPSHOT_REENTRY_TEST_NAME =
  'priority recovery snapshots re-enter stale SENDING pending dispatch-' +
  'pending workflow-timeout operations through the workflow owner';
const TEST_ASSERT_SNAPSHOT_REENTRY_ADVANCE_ACTION =
  'the snapshot should return stale SENDING timeout rows to owner advancement';
const TEST_ASSERT_SNAPSHOT_REENTRY_WAKES_REMOTE_OWNER =
  'snapshot re-entry should not wake the remote operation owner inline';
const TEST_ASSERT_SNAPSHOT_REENTRY_TARGET =
  'snapshot re-entry should not use the remote replica-dispatch ingress inline';
const TEST_ASSERT_SNAPSHOT_REENTRY_NOT_TRANSITION_DEFERRED =
  'snapshot re-entry should not leave the stale SENDING row transition-deferred';
const TEST_EXPECTED_SENDING_REENTRY_ACTUATION_STATE =
  PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED;
const TEST_ASSERT_SNAPSHOT_REENTRY_ARMS_RETRY =
  'snapshot re-entry should arm one verification retry for the stale SENDING row';
const TEST_ASSERT_SNAPSHOT_REENTRY_PRESERVES_PENDING =
  'snapshot re-entry should preserve the remote-owned durable pending status';

const TEST_ASSERT_OWNER_LANE_HELD_DEFERS_REENTRY =
  'owner-lane-held snapshots should defer dispatch-pending re-entry';
const TEST_ASSERT_OWNER_LANE_HELD_NO_INLINE_WAKE =
  'owner-lane-held snapshots should not wake the remote owner inline';
const TEST_ASSERT_OWNER_LANE_HELD_RETRY_WAKES =
  'deferred owner-lane re-entry should wake the remote owner after the lane releases';
const TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED =
  'active handoff retry should surface bounded rebalancer-handoff progress';
const TEST_ASSERT_ACTIVE_HANDOFF_RETRY_NO_INLINE_WAKE =
  'active handoff retry snapshots should not wake the remote owner inline';
const TEST_ASSERT_ACTIVE_HANDOFF_RETRY_TIMER_PRESERVED =
  'active handoff retry snapshots should preserve the existing bounded retry';
const TEST_RETRY_SCHEDULED_REENTRY_TEST_NAME =
  'retry-scheduled rebalancer handoff snapshots re-enter dispatch-pending ' +
  'owner progress';
const TEST_TRANSITION_RETRY_SNAPSHOT_REENTRY_TEST_NAME =
  'coordinator-created dispatch-pending transition retries preserve the ' +
  'operation snapshot for deferred visibility re-entry';
const TEST_LOCAL_OWNER_REMOTE_HANDOFF_GUARD_TEST_NAME =
  'local-owner coordinator-created transition retries do not arm remote ' +
  'handoff retries';
const TEST_DEFERRED_VISIBILITY_STATE = 'deferred_visibility';
const TEST_DISTRIBUTED_PARTICIPANT_FAILURE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const TEST_DISPATCH_SUCCESS = Object.freeze({
  success: true,
});
const TEST_ASSERT_RETRY_SCHEDULED_REENTRY_WAKES =
  'retry-scheduled handoff snapshots should wake the remote owner when no ' +
  'bounded retry is active';
const TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TARGET =
  'retry-scheduled handoff re-entry should use the canonical dispatch ingress';
const TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TIMER =
  'retry-scheduled handoff re-entry should arm bounded handoff verification';
const TEST_ASSERT_REPRESENTATIVE_HANDOFF_RETRY_BOUNDED =
  'representative publication handoff retry should stay bounded';
const TEST_ASSERT_REPRESENTATIVE_HANDOFF_NO_DUPLICATE_WAKE =
  'duplicate representative handoff witnesses should not duplicate remote wake';
const TEST_ASSERT_REPRESENTATIVE_HANDOFF_TIMER_PRESERVED =
  'duplicate representative handoff witnesses should preserve one retry timer';
const TEST_ASSERT_COUNT_ONLY_HANDOFF_UNIQUE_RETRIES =
  'count-only publication residual should normalize duplicate witnesses to ' +
  'unique retries';
const TEST_ASSERT_COUNT_ONLY_HANDOFF_NO_DUPLICATE_WAKE =
  'count-only publication residual should not duplicate remote wake state';
const TEST_ASSERT_COUNT_ONLY_HANDOFF_TIMERS_PRESERVED =
  'count-only publication residual should preserve one retry timer per ' +
  'unique operation';
const TEST_ASSERT_LOCAL_OWNER_HANDOFF_RETRY_CONSUMED =
  'local-owner retryable pressure should stay consumed by transition retry';
const TEST_ASSERT_LOCAL_OWNER_NO_HANDOFF_TIMER =
  'local-owner transition retry should not schedule remote handoff timers';
const TEST_ASSERT_LOCAL_OWNER_SCHEDULE_REJECTED =
  'local-owner operations should reject direct remote handoff scheduling';
const TEST_ASSERT_LOCAL_OWNER_TRANSITION_GRACE_REMAINS =
  'local-owner transition retry grace should remain active';
const TEST_TOPOLOGY_OPERATOR_WITNESS_STATE =
  STAGE_SHARED.OPERATION_WORKFLOW_OWNER_SHARED
    .TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE;
const TEST_TOPOLOGY_OPERATOR_CURRENT_STEP_COUNT = 1;
const TEST_TOPOLOGY_OPERATOR_KIND_PUBLICATION_ACK = 'publication_ack';
const TEST_TOPOLOGY_OPERATOR_KIND_ACTIVE_GATE_RECONCILE =
  'active_gate_reconcile';
const TEST_TOPOLOGY_OPERATOR_PUBLICATION_ACK_STEP =
  'publication_ack_wait';
const TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_RECONCILE_STEP =
  'active_gate_reconcile';
const TEST_TOPOLOGY_OPERATOR_PUBLICATION_OWNER =
  'topology_publication_owner';
const TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_OWNER =
  'startup_active_gate_owner';
const TEST_TOPOLOGY_OPERATOR_PUBLICATION_BOUNDARY =
  'publication_convergence';
const TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_BOUNDARY = 'snapshot_coverage';
const TEST_TOPOLOGY_OPERATOR_PUBLICATION_SOURCE =
  'publication_owner_ack';
const TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_SOURCE =
  'active_gate_owner_reconcile';
const TEST_TOPOLOGY_OPERATOR_WAIT_FOR_PUBLICATION_ACK =
  'wait_for_publication_ack';
const TEST_TOPOLOGY_OPERATOR_RECONCILE_ACTIVE_GATE =
  'reconcile_active_gate_snapshot';
const TEST_ASSERT_TOPOLOGY_OPERATOR_REQUIRED_FIELDS =
  'topology operator witness should expose the required owner contract fields';
const TEST_ASSERT_TOPOLOGY_OPERATOR_SINGLE_CURRENT_STEP =
  'topology operator witness should expose exactly one current step';
const TEST_ASSERT_TOPOLOGY_OPERATOR_SINGLE_NEXT_ACTION =
  'topology operator witness should expose one scalar next action';

function buildDispatchPendingReentryPlanningSnapshot() {
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
    ]),
    pendingAckNodeIds: TEST_EMPTY_LIST,
    pendingAckCount: NUM.ZERO,
    priorityPartitionSummary: Object.freeze({
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          spreadGap: TEST_SPREAD_GAP,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        }),
      ]),
      readyEligibleNodeCount: TEST_READY_ELIGIBLE_NODE_COUNT,
    }),
  });
}

function assertTopologyOperatorWitness(t, witness, expected) {
  const requiredFields = [
    'operatorId',
    'owner',
    'boundary',
    'kind',
    'partitionId',
    'targetNodeId',
    'steps',
    'currentStepId',
    'currentStepState',
    'witnessSource',
    'nextAction',
    'deadlineMs',
    'lastObservedAtMs',
  ];
  t.same(
    requiredFields.filter((fieldName) =>
      Object.prototype.hasOwnProperty.call(witness || {}, fieldName),
    ),
    requiredFields,
    TEST_ASSERT_TOPOLOGY_OPERATOR_REQUIRED_FIELDS,
  );
  t.equal(witness.operatorId, expected.operatorId, expected.message);
  t.equal(witness.owner, expected.owner, expected.message);
  t.equal(witness.boundary, expected.boundary, expected.message);
  t.equal(witness.kind, expected.kind, expected.message);
  t.equal(witness.partitionId, expected.partitionId, expected.message);
  t.equal(witness.targetNodeId, expected.targetNodeId, expected.message);
  t.equal(witness.currentStepId, expected.currentStepId, expected.message);
  t.equal(
    witness.currentStepState,
    expected.currentStepState,
    expected.message,
  );
  t.equal(witness.witnessSource, expected.witnessSource, expected.message);
  t.equal(witness.nextAction, expected.nextAction, expected.message);
  t.equal(
    witness.steps.filter((step) => step.current === true).length,
    TEST_TOPOLOGY_OPERATOR_CURRENT_STEP_COUNT,
    TEST_ASSERT_TOPOLOGY_OPERATOR_SINGLE_CURRENT_STEP,
  );
  t.equal(
    typeof witness.nextAction,
    'string',
    TEST_ASSERT_TOPOLOGY_OPERATOR_SINGLE_NEXT_ACTION,
  );
}

function buildSerialWaitSourceOperationContext() {
  return Object.freeze({
    operationId: TEST_SERIAL_WAIT_OPERATION_ID,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    status: TEST_STATUS_PENDING,
    workflowStep: TEST_STEP_PENDING,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    createdAtMs: TEST_OPERATION_CREATED_AT_MS,
    updatedAtMs: TEST_OPERATION_CREATED_AT_MS,
    stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
    timelineLength: TEST_TIMELINE_LENGTH,
    timelineStepCount: TEST_TIMELINE_STEP_COUNT,
    latestTimelineStep: TEST_STEP_PENDING,
    latestTimelineStatus: TEST_STATUS_PENDING,
    latestTimelineInFlight: true,
  });
}

function buildSerialWaitReentryPlanningSnapshot() {
  const planningSnapshot = buildDispatchPendingReentryPlanningSnapshot();
  const serialWaitSnapshot = buildPriorityRecoveryDecisionSnapshot({
    partitionId: TEST_PARTITION_ID,
    capturedAt: TEST_CAPTURED_AT_MS,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationConvergence: planningSnapshot,
    priorityPartitionSummary: planningSnapshot.priorityPartitionSummary,
    operationId: TEST_OPERATION_ID,
    operationContexts: TEST_EMPTY_LIST,
    serialLaneOperationContexts: Object.freeze([
      buildSerialWaitSourceOperationContext(),
    ]),
    stepTimeoutMsByWorkflowStep: {
      [TEST_STEP_PENDING]: TEST_STEP_TIMEOUT_MS,
    },
  });
  return Object.freeze({
    ...planningSnapshot,
    priorityRecoveryDecisionSnapshots: Object.freeze({
      schemaVersion: NUM.ONE,
      capturedAt: TEST_CAPTURED_AT_MS,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      priorityPartitionSummary: planningSnapshot.priorityPartitionSummary,
      snapshots: Object.freeze([serialWaitSnapshot]),
    }),
  });
}

function buildRemoteDispatchPendingOperationOwnerOutcome() {
  const outcome = OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER;
  return Object.freeze({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    state: TEST_OPERATION_OWNER_STATE,
    outcome,
    nextRequiredAction: outcome,
    effectCommand:
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.WAKE_REMOTE_OWNER_COMMAND,
    reasons: Object.freeze([
      OPERATION_WORKFLOW_REASON_CODE_VALUES.REMOTE_OWNER_AUTHORITATIVE,
      OPERATION_WORKFLOW_REASON_CODE_VALUES.WAKE_REQUIRED,
    ]),
    correlationKey: TEST_OPERATION_OWNER_CORRELATION_KEY,
    sourceRevision: TEST_OPERATION_OWNER_SOURCE_REVISION,
  });
}

function buildTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function createCoordinator(overrides = {}) {
  const sqlQueryEngine = overrides.sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: [], affectedRows: 0};
    },
  };

  return new RebalanceCoordinator({
    ...overrides,
    sqlQueryEngine,
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(_tableName, sql, params = [], options = {}) {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
      async readRows(_tableName, sql, params = [], options = {}) {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
      async executeQuery(sql, params = [], options = {}) {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
    },
  });
}

function createTopologyOperatorWitnessCoordinator() {
  return createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    systemTableCache: {
      get() {
        return TEST_EMPTY_VALUE;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    enableTimeouts: false,
  });
}

function buildPendingOperationRow({
  operationId,
  partitionId,
  replicaId,
  nowMs,
}) {
  return {
    operation_id: operationId,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: partitionId,
    replica_id: replicaId,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify([{
      step: TEST_STEP_PENDING,
      timestamp: nowMs - TEST_STEP_HISTORY_LAG_MS,
    }]),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: partitionId,
  };
}

function buildRetryableTransitionFailure() {
  const error = new Error(TEST_RETRYABLE_TRANSITION_FAILURE);
  error.deferRetry = true;
  error.retryAfterMs = TEST_RETRY_AFTER_MS;
  return error;
}

const testCases = [];

function registerCase(name, fn) {
  testCases.push(Object.freeze({name, fn}));
}

const registrationDependencies = Object.freeze({
  NUM,
  OPERATION_WORKFLOW_OWNER,
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
  TEST_ACTUAL_STATUS_ABSENT,
  TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
  TEST_ASSERT_ACTIVE_HANDOFF_RETRY_NO_INLINE_WAKE,
  TEST_ASSERT_ACTIVE_HANDOFF_RETRY_TIMER_PRESERVED,
  TEST_ASSERT_COUNT_ONLY_HANDOFF_NO_DUPLICATE_WAKE,
  TEST_ASSERT_COUNT_ONLY_HANDOFF_TIMERS_PRESERVED,
  TEST_ASSERT_COUNT_ONLY_HANDOFF_UNIQUE_RETRIES,
  TEST_ASSERT_LOCAL_OWNER_HANDOFF_RETRY_CONSUMED,
  TEST_ASSERT_LOCAL_OWNER_NO_HANDOFF_TIMER,
  TEST_ASSERT_LOCAL_OWNER_SCHEDULE_REJECTED,
  TEST_ASSERT_LOCAL_OWNER_TRANSITION_GRACE_REMAINS,
  TEST_ASSERT_LONGER_GRACE_REMAINS_ACTIVE,
  TEST_ASSERT_OWNER_LANE_HELD_DEFERS_REENTRY,
  TEST_ASSERT_OWNER_LANE_HELD_NO_INLINE_WAKE,
  TEST_ASSERT_OWNER_LANE_HELD_RETRY_WAKES,
  TEST_ASSERT_REPRESENTATIVE_HANDOFF_NO_DUPLICATE_WAKE,
  TEST_ASSERT_REPRESENTATIVE_HANDOFF_RETRY_BOUNDED,
  TEST_ASSERT_REPRESENTATIVE_HANDOFF_TIMER_PRESERVED,
  TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TARGET,
  TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TIMER,
  TEST_ASSERT_RETRY_SCHEDULED_REENTRY_WAKES,
  TEST_ASSERT_SNAPSHOT_REENTRY_ADVANCE_ACTION,
  TEST_ASSERT_SNAPSHOT_REENTRY_ARMS_RETRY,
  TEST_ASSERT_SNAPSHOT_REENTRY_NOT_TRANSITION_DEFERRED,
  TEST_ASSERT_SNAPSHOT_REENTRY_PRESERVES_PENDING,
  TEST_ASSERT_SNAPSHOT_REENTRY_TARGET,
  TEST_ASSERT_SNAPSHOT_REENTRY_WAKES_REMOTE_OWNER,
  TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
  TEST_ASSERT_SQL_PRIORITY_CLAIM_CAS,
  TEST_ASSERT_SQL_PRIORITY_CLAIM_NO_SESSION,
  TEST_ASSERT_SQL_PRIORITY_CLAIM_SESSION_ABSENT,
  TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET,
  TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_CAS,
  TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH,
  TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_STEP,
  TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY,
  TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STATUS,
  TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STEP,
  TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_STALE_ROW,
  TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_TIMER,
  TEST_ASSERT_SQL_PRIORITY_DISPATCH,
  TEST_ASSERT_SQL_PRIORITY_DISPATCH_SOURCE,
  TEST_ASSERT_SQL_PRIORITY_DISPATCH_TARGET,
  TEST_ASSERT_SQL_PRIORITY_DISPATCH_TIMEOUT,
  TEST_ASSERT_SQL_PRIORITY_LOCAL_OWNER,
  TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STATUS,
  TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STEP,
  TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_NO_CREATE,
  TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STATUS,
  TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STEP,
  TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_SUCCESS,
  TEST_ASSERT_SQL_PRIORITY_REARM,
  TEST_ASSERT_SQL_PRIORITY_SNAPSHOT_STEP,
  TEST_ASSERT_SQL_PRIORITY_STALE_ROW,
  TEST_ASSERT_SQL_PRIORITY_STATUS,
  TEST_ASSERT_SQL_PRIORITY_STEP,
  TEST_ASSERT_SQL_PRIORITY_TRANSITIONS,
  TEST_ASSERT_STALE_HANDOFF_ARMS_RETRY,
  TEST_ASSERT_STALE_HANDOFF_REMAINS_SINGLE_TIMER,
  TEST_ASSERT_STALE_HANDOFF_REPLACES_TIMER,
  TEST_ASSERT_STALE_HANDOFF_REWAKES_REMOTE_OWNER,
  TEST_ASSERT_STALE_HANDOFF_REWAKE_TARGET,
  TEST_AUTHORITATIVE_ONLY_OPERATION_ID,
  TEST_AUTHORITATIVE_ONLY_PARTITION_ID,
  TEST_AUTHORITATIVE_ONLY_REPLICA_ID,
  TEST_CAPTURED_AT_MS,
  TEST_COORDINATOR_CREATED_REMOTE_HANDOFF,
  TEST_DEFERRED_RETRY_PENDING_REASON,
  TEST_DEFERRED_VISIBILITY_STATE,
  TEST_DELIVERY_STATUS_INITIATED,
  TEST_DISPATCH_SUCCESS,
  TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
  TEST_EMPTY_LIST,
  TEST_EMPTY_VALUE,
  TEST_ENTITY_TYPE_PARTITION,
  TEST_EXPECTED_SENDING_REENTRY_ACTUATION_STATE,
  TEST_EXPECTED_WORKFLOW_STEP_PARAM_INDEX,
  TEST_HANDOFF_TIMEOUT_MS,
  TEST_LOCAL_OWNER_PARTITION_ID,
  TEST_LOCAL_OWNER_REMOTE_HANDOFF_GUARD_TEST_NAME,
  TEST_LOCAL_OWNER_REPLICA_ID,
  TEST_LONG_REMOTE_HANDOFF_GRACE_MS,
  TEST_MICROTASK_DELAY_MS,
  TEST_MIN_REPLICA_COUNT,
  TEST_OBSERVER_NODE_ID,
  TEST_OPERATION_CREATED_AT_MS,
  TEST_OPERATION_ID,
  TEST_OPERATION_OWNER_CORRELATION_KEY,
  TEST_OPERATION_TYPE_REPLACE,
  TEST_PARTITION_ID,
  TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
  TEST_PUBLICATION_COUNT_ONLY_PUBLICATION_OPERATION_ID,
  TEST_PUBLICATION_COUNT_ONLY_REPLICA_OPERATION_ID,
  TEST_PUBLICATION_COUNT_ONLY_SQL_PARTICIPANT_OPERATION_ID,
  TEST_PUBLICATION_COUNT_ONLY_SQL_TRANSACTION_OPERATION_ID,
  TEST_PUBLICATION_EPOCH,
  TEST_PUBLICATION_STATUS_PUBLISHED,
  TEST_QUERY_OPERATION_BY_ID_FRAGMENT,
  TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT,
  TEST_QUERY_SERVICES_FRAGMENT,
  TEST_RAFT_ROLE_FOLLOWER,
  TEST_READY_DISTINCT_NODE_COUNT,
  TEST_READY_ELIGIBLE_NODE_COUNT,
  TEST_REPLICA_DISPATCH_TARGET,
  TEST_REPLICA_HANDLER_DISPATCH_TARGET,
  TEST_REPLICA_ID,
  TEST_REPLICA_OPERATIONS_TABLE,
  TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
  TEST_REPLICA_SERVICE_ADDRESS,
  TEST_REPRESENTATIVE_PUBLICATION_OPERATION_ID,
  TEST_REQUIRED_DISTINCT_NODE_COUNT,
  TEST_RETRYABLE_HANDOFF_ERROR,
  TEST_RETRY_AFTER_MS,
  TEST_RETRY_SCHEDULED_REENTRY_TEST_NAME,
  TEST_SERIAL_WAIT_OPERATION_IDS,
  TEST_SERIAL_WAIT_PARTITION_IDS,
  TEST_SNAPSHOT_REENTRY_TEST_NAME,
  TEST_SOURCE_NODE_ID,
  TEST_SPREAD_GAP,
  TEST_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH_TEST_NAME,
  TEST_SQL_PRIORITY_DEFERRED_PROGRESS_DISPATCH_TEST_NAME,
  TEST_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_RECONCILE_TEST_NAME,
  TEST_SQL_PRIORITY_PENDING_WAKE_ACTIVE_RECONCILE_TEST_NAME,
  TEST_SQL_PRIORITY_STALE_VISIBILITY_REDISPATCH_TEST_NAME,
  TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
  TEST_SQL_PRIORITY_TIMEOUT_REDISPATCH_TEST_NAME,
  TEST_SQL_TRANSACTIONS_PARTITION_ID,
  TEST_SQL_TRANSACTIONS_REPLICA_ID,
  TEST_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
  TEST_SQL_TRANSACTION_PARTICIPANTS_REPLICA_ID,
  TEST_STALE_REMOTE_HANDOFF_REWAKE_TEST_NAME,
  TEST_STATUS_ACTIVE,
  TEST_STATUS_CREATING,
  TEST_STATUS_PENDING,
  TEST_STEP_ACTIVE,
  TEST_STEP_CREATING,
  TEST_STEP_HISTORY_LAG_MS,
  TEST_STEP_PENDING,
  TEST_STEP_SENDING,
  TEST_STEP_TIMEOUT_MS,
  TEST_TARGET_NODE_ID,
  TEST_TIMELINE_LENGTH,
  TEST_TIMELINE_STEP_COUNT,
  TEST_TIMEOUT_OVERRUN_MS,
  TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_BOUNDARY,
  TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_OWNER,
  TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_RECONCILE_STEP,
  TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_SOURCE,
  TEST_TOPOLOGY_OPERATOR_KIND_ACTIVE_GATE_RECONCILE,
  TEST_TOPOLOGY_OPERATOR_KIND_PUBLICATION_ACK,
  TEST_TOPOLOGY_OPERATOR_PUBLICATION_ACK_STEP,
  TEST_TOPOLOGY_OPERATOR_PUBLICATION_BOUNDARY,
  TEST_TOPOLOGY_OPERATOR_PUBLICATION_OWNER,
  TEST_TOPOLOGY_OPERATOR_PUBLICATION_SOURCE,
  TEST_TOPOLOGY_OPERATOR_RECONCILE_ACTIVE_GATE,
  TEST_TOPOLOGY_OPERATOR_WAIT_FOR_PUBLICATION_ACK,
  TEST_TOPOLOGY_OPERATOR_WITNESS_STATE,
  TEST_TRANSITION_RETRY_SNAPSHOT_REENTRY_TEST_NAME,
  TEST_UNDEFINED_VALUE,
  TEST_UPDATE_REPLICA_OPERATIONS_PREFIX,
  WORKFLOW_STEP,
  assertTopologyOperatorWitness,
  buildDispatchPendingReentryPlanningSnapshot,
  buildPendingOperationRow,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryObservationSnapshot,
  buildRemoteDispatchPendingOperationOwnerOutcome,
  buildRetryableTransitionFailure,
  buildSerialWaitReentryPlanningSnapshot,
  buildTransactionCoordinator,
  createCoordinator,
  createTopologyOperatorWitnessCoordinator,
});

registerPriorityRecoveryTopologyTimeoutOwnerReentryTestCases({registerCase, dependencies: registrationDependencies});
registerPriorityRecoverySqlDispatchTimeoutReentryTestCases({registerCase, dependencies: registrationDependencies});
registerPriorityRecoverySnapshotHandoffTimeoutReentryTestCases({registerCase, dependencies: registrationDependencies});
registerPriorityRecoverySerialWaitCoordinatorHandoffTestCases({registerCase, dependencies: registrationDependencies});

export const priorityRecoveryDispatchPendingTimeoutReentryTestCases =
  Object.freeze(testCases);
