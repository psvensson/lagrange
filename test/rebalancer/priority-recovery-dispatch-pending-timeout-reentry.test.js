import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {buildPriorityRecoveryDecisionSnapshot} from
  '../../src/control-plane/priority-recovery-snapshot.js';
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
const TEST_OPERATION_TYPE_REPLACE = OperationType.REPLACE;
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_LOCAL_OWNER_PARTITION_ID = 'control_plane_publications-p1';
const TEST_AUTHORITATIVE_ONLY_PARTITION_ID = 'replica_operations-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_LOCAL_OWNER_REPLICA_ID = 'control_plane_publications-p1-r4';
const TEST_AUTHORITATIVE_ONLY_REPLICA_ID = 'replica_operations-p1-r4';
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
const TEST_ASSERT_LOCAL_OWNER_HANDOFF_RETRY_CONSUMED =
  'local-owner retryable pressure should stay consumed by transition retry';
const TEST_ASSERT_LOCAL_OWNER_NO_HANDOFF_TIMER =
  'local-owner transition retry should not schedule remote handoff timers';
const TEST_ASSERT_LOCAL_OWNER_SCHEDULE_REJECTED =
  'local-owner operations should reject direct remote handoff scheduling';
const TEST_ASSERT_LOCAL_OWNER_TRANSITION_GRACE_REMAINS =
  'local-owner transition retry grace should remain active';

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

test(TEST_TRANSITION_RETRY_SNAPSHOT_REENTRY_TEST_NAME,
async (t) => {
  const deferredTimers = [];
  const resumedDispatchOperations = [];
  const nowMs = Date.now();
  const operation = Object.freeze({
    operationId: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partitionId: TEST_PARTITION_ID,
    entityType: TEST_ENTITY_TYPE_PARTITION,
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflowStep: TEST_STEP_PENDING,
    createdAt: nowMs,
    updatedAt: nowMs,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    stepsHistory: TEST_EMPTY_LIST,
  });
  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
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
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    messageRouter: {
      async deliver() {
        return {
          acknowledged: true,
          status: TEST_DELIVERY_STATUS_INITIATED,
        };
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  coordinator.initialize();
  coordinator.workflowOwner.repository.queryAuthoritativeOperationById =
    async () => TEST_EMPTY_VALUE;
  coordinator.workflowOwner.repository.getOperationByIdVisibilityObservation =
    async () => Object.freeze({
      operation: TEST_EMPTY_VALUE,
      deferredOutcome: Object.freeze({
        state: TEST_DEFERRED_VISIBILITY_STATE,
      }),
    });
  coordinator.workflowOwner.claimPendingDispatchOperation = async () => {
    throw buildRetryableTransitionFailure();
  };
  coordinator.workflowOwner.dispatchOperationInternal =
    async (dispatchOperation) => {
      resumedDispatchOperations.push(dispatchOperation);
      return TEST_DISPATCH_SUCCESS;
    };

  try {
    const applied =
      await coordinator.workflowOwner.armCoordinatorCreatedOperation(operation);
    const retrySnapshot =
      coordinator.workflowOwner.getTransitionRetryOperationSnapshot(
        TEST_OPERATION_ID,
      );

    t.equal(
      applied,
      false,
      'retryable coordinator-created claim failures should defer owner progress',
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      'the retryable claim failure should arm one transition retry',
    );
    t.equal(
      retrySnapshot?.operationId,
      TEST_OPERATION_ID,
      'the transition retry should retain the adapter operation snapshot',
    );

    await deferredTimers[NUM.ZERO].fn();

    t.equal(
      resumedDispatchOperations.length,
      NUM.ONE,
      'deferred visibility should re-enter dispatch from the retained snapshot',
    );
    t.equal(
      resumedDispatchOperations[NUM.ZERO]?.operationId,
      TEST_OPERATION_ID,
      'deferred retry dispatch should use the original operation id',
    );
    t.equal(
      resumedDispatchOperations[NUM.ZERO]?.workflowStep,
      TEST_STEP_PENDING,
      'deferred retry dispatch should preserve the dispatch-pending workflow step',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('dispatch transition retries preserve priority owner context after ' +
  'the step timeout',
async (t) => {
  const deferredTimers = [];
  const resumedDispatchOperations = [];
  let claimAttempts = NUM.ZERO;
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;
  const operationCreatedAt =
    TEST_CAPTURED_AT_MS - TEST_STEP_TIMEOUT_MS - TEST_TIMEOUT_OVERRUN_MS;
  const operation = {
    operationId: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    entityType: TEST_ENTITY_TYPE_PARTITION,
    entityId: TEST_LOCAL_OWNER_PARTITION_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflowStep: TEST_STEP_PENDING,
    createdAt: operationCreatedAt,
    updatedAt: operationCreatedAt,
    stepsHistory: [],
  };
  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
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
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    messageRouter: {
      async deliver() {
        return {
          acknowledged: true,
          status: TEST_DELIVERY_STATUS_INITIATED,
        };
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  coordinator.initialize();
  coordinator.workflowOwner.repository.getOperationByIdVisibilityObservation =
    async () => Object.freeze({
      operation: TEST_EMPTY_VALUE,
      deferredOutcome: Object.freeze({
        state: TEST_DEFERRED_VISIBILITY_STATE,
      }),
    });
  coordinator.workflowOwner.claimPendingDispatchOperation =
    async (dispatchOperation) => {
      claimAttempts += NUM.ONE;
      if (claimAttempts === NUM.ONE) {
        throw buildRetryableTransitionFailure();
      }
      return {
        ...dispatchOperation,
        status: TEST_STATUS_CREATING,
        workflowStep: TEST_STEP_SENDING,
      };
    };
  coordinator.workflowOwner.executeOperationInternal =
    async (dispatchOperation) => {
      resumedDispatchOperations.push(dispatchOperation);
      return TEST_DISPATCH_SUCCESS;
    };

  try {
    const dispatchResult =
      await coordinator.workflowOwner.dispatchOperation(operation);

    t.equal(
      dispatchResult?.reason,
      TEST_DEFERRED_RETRY_PENDING_REASON,
      'retryable transition pressure should defer the dispatch path',
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      'the transition failure should arm one retry timer',
    );
    t.equal(
      coordinator.workflowOwner.hasActiveTransitionRetryGrace(
        TEST_OPERATION_ID,
      ),
      true,
      'priority control-plane dispatch retries should keep operation-budget grace after the step timeout',
    );

    await deferredTimers[NUM.ZERO].fn();

    t.equal(
      resumedDispatchOperations.length,
      NUM.ONE,
      'deferred transition retry should re-enter dispatch instead of timeout reconcile',
    );
    t.equal(
      resumedDispatchOperations[NUM.ZERO]?.partitionId,
      TEST_LOCAL_OWNER_PARTITION_ID,
      'deferred retry dispatch should preserve the priority partition context',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('checkTimeouts re-wakes restart-discovered remote-owned priority ' +
  'dispatch-pending PENDING rows while the operation budget is still active',
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let deliveryAttempt = 0;
  let updateCount = 0;
  const nowMs = Date.now();
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
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
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('FROM replica_operations')) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: 1,
        };
      }
      if (normalizedSql.startsWith('UPDATE replica_operations SET')) {
        updateCount += 1;
        operationRow.status = params[0];
        operationRow.workflow_step = params[1];
        operationRow.updated_at = params[2];
        operationRow.completed_at = params[3];
        operationRow.error_message = params[4];
        operationRow.steps_history = params[5];
        operationRow.replica_id = params[6];
        return {
          success: true,
          affectedRows: 1,
        };
      }
      if (normalizedSql.includes('FROM services')) {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: 0,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_SOURCE_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== 'replica_operations') {
          return null;
        }
        return key === TEST_OPERATION_ID ? operationRow : null;
      },
      getAll(tableName) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        deliveryAttempt += 1;
        if (deliveryAttempt === 1) {
          return {
            acknowledged: false,
            error: TEST_RETRYABLE_HANDOFF_ERROR,
            deferRetry: true,
            retryAfterMs: TEST_RETRY_AFTER_MS,
          };
        }
        return {acknowledged: true, status: 'initiated'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 3};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  coordinator.initialize();

  const cachedOperation =
    coordinator.repository.queryCachedIncompleteOperations()[0];
  const drainSnapshot =
    await coordinator.workflowOwner.buildPriorityRecoveryOperationDrainSnapshot(
      cachedOperation,
    );

  await coordinator.checkTimeouts();

  t.equal(
    cachedOperation?.operationId,
    TEST_OPERATION_ID,
    'the timeout witness should normalize the cached replica_operations row into one operation contract',
  );
  t.equal(
    coordinator.repository.isOperationLocallyOwned(cachedOperation),
    false,
    'the timeout witness should stay remote-owned on the observing source node',
  );
  t.equal(
    coordinator.workflowOwner.shouldRearmDispatchFromProgressReconcile(
      cachedOperation,
      TEST_ACTUAL_STATUS_ABSENT,
      {now: nowMs},
    ),
    true,
    'the timeout witness should be eligible for dispatch re-arm while its operation budget remains active',
  );
  t.equal(
    drainSnapshot?.ownerState,
    PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_REARM_REQUIRED,
    'stale remote-owned timeout witnesses should use the explicit remote drain re-arm owner state',
  );
  t.equal(
    drainSnapshot?.ownerAction,
    PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER,
    'stale remote-owned timeout witnesses should route through remote-owner wake instead of staying transition-deferred',
  );

  t.equal(
    deliveries.length,
    1,
    'timeout reconciliation should wake the remote owner once while the retry timer remains armed',
  );
  t.equal(
    deliveries[0]?.target,
    TEST_REPLICA_DISPATCH_TARGET,
    'timeout reconciliation should target the canonical remote replica-dispatch ingress',
  );
  t.equal(
    deferredTimers.length,
    1,
    'timeout reconciliation should arm one remote handoff follow-up timer for the stale PENDING row',
  );
  t.equal(
    coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
      .size,
    1,
    'the remote handoff retry lane should stay armed after timeout reconciliation',
  );
  t.equal(
    operationRow.workflow_step,
    TEST_STEP_PENDING,
    'timeout reconciliation should keep the durable row in PENDING while the remote owner is being re-woken',
  );
  t.equal(
    operationRow.status,
    TEST_STATUS_PENDING,
    'timeout reconciliation should not fail or mutate the remote-owned row while the operation budget is still active',
  );
  t.equal(
    operationRow.error_message,
    TEST_EMPTY_VALUE,
    'timeout reconciliation should not record a timeout failure while the remote owner retry lane is active',
  );
  t.equal(
    updateCount,
    0,
    'timeout reconciliation should not persist step updates for the remote-owned row before remote progress is observed',
  );

  coordinator.initialized = false;
  await deferredTimers[0].fn();

  t.equal(
    deliveries.length,
    2,
    'the deferred remote handoff retry should still wake the remote owner while the source owner is transiently uninitialized',
  );
  t.equal(
    coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
      .size,
    1,
    'the successful remote handoff wake should leave the bounded verification lane armed while source initialization recovers',
  );

  coordinator.initialized = true;
  await deferredTimers[1].fn();

  t.equal(
    deliveries.length,
    3,
    'the verification retry should continue re-entering the owner wake path after source initialization recovers',
  );
  t.equal(
    deliveries[2]?.target,
    TEST_REPLICA_DISPATCH_TARGET,
    'deferred remote handoff retry should use the same canonical replica-dispatch ingress',
  );
  t.equal(
    coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
      .size,
    1,
    'successful retry wake should leave the bounded verification lane armed',
  );
  t.equal(
    updateCount,
    0,
    'deferred remote handoff retry should not mutate the remote-owned row before owner progress is observed',
  );

  await coordinator.shutdown();
});

test(TEST_STALE_REMOTE_HANDOFF_REWAKE_TEST_NAME,
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const pendingTimeoutMs = TEST_STEP_TIMEOUT_MS;
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: nowMs,
    updated_at: nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify([{
      step: TEST_STEP_PENDING,
      timestamp: nowMs - pendingTimeoutMs - TEST_STEP_HISTORY_LAG_MS,
    }]),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_SOURCE_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_OPERATION_ID ? operationRow : null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();

    const cachedOperation =
      coordinator.repository.queryCachedIncompleteOperations()[0];
    coordinator.workflowOwner.recordTransitionRetryGrace(
      TEST_OPERATION_ID,
      {
        boundary: TEST_COORDINATOR_CREATED_REMOTE_HANDOFF,
        partitionId: TEST_PARTITION_ID,
        workflowStep: TEST_STEP_PENDING,
        updatedAt: operationRow.updated_at,
        createdAt: operationRow.created_at,
      },
      TEST_LONG_REMOTE_HANDOFF_GRACE_MS,
    );
    t.equal(
      coordinator.workflowOwner.deferCoordinatorCreatedRemoteHandoffRetry(
        cachedOperation,
        {
          deferRetry: true,
          retryAfterMs: TEST_RETRY_AFTER_MS,
          error: TEST_RETRYABLE_HANDOFF_ERROR,
        },
      ),
      true,
      TEST_ASSERT_STALE_HANDOFF_ARMS_RETRY,
    );

    nowMs += TEST_RETRY_AFTER_MS + TEST_TIMEOUT_OVERRUN_MS;
    t.equal(
      coordinator.workflowOwner.hasActiveTransitionRetryGrace(
        TEST_OPERATION_ID,
        nowMs,
      ),
      true,
      TEST_ASSERT_LONGER_GRACE_REMAINS_ACTIVE,
    );

    await coordinator.checkTimeouts();

    t.equal(
      deliveries.length,
      1,
      TEST_ASSERT_STALE_HANDOFF_REWAKES_REMOTE_OWNER,
    );
    t.equal(
      deliveries[0]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_STALE_HANDOFF_REWAKE_TARGET,
    );
    t.equal(
      deferredTimers.length,
      2,
      TEST_ASSERT_STALE_HANDOFF_REPLACES_TIMER,
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      1,
      TEST_ASSERT_STALE_HANDOFF_REMAINS_SINGLE_TIMER,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('checkTimeouts re-dispatches restart-discovered locally owned priority ' +
  'dispatch-pending PENDING rows while the operation budget is still active',
async (t) => {
  const deliveries = [];
  let updateCount = 0;
  const nowMs = Date.now();
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_LOCAL_OWNER_PARTITION_ID,
    replica_id: TEST_LOCAL_OWNER_REPLICA_ID,
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
    entity_id: TEST_LOCAL_OWNER_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('FROM replica_operations')) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: 1,
        };
      }
      if (normalizedSql.startsWith('UPDATE replica_operations SET')) {
        updateCount += 1;
        operationRow.status = params[0];
        operationRow.workflow_step = params[1];
        operationRow.updated_at = params[2];
        operationRow.completed_at = params[3];
        operationRow.error_message = params[4];
        operationRow.steps_history = params[5];
        operationRow.replica_id = params[6];
        return {
          success: true,
          affectedRows: 1,
        };
      }
      if (normalizedSql.includes('FROM services')) {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: 0,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== 'replica_operations') {
          return null;
        }
        return key === TEST_OPERATION_ID ? operationRow : null;
      },
      getAll(tableName) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: 'initiated'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 3};
      },
    },
    enableTimeouts: false,
  });

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_LOCAL_OWNER_PARTITION_ID},
  );
  operationRow.created_at =
    nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  coordinator.initialize();

  const cachedOperation =
    coordinator.repository.queryCachedIncompleteOperations()[0];

  t.equal(
    coordinator.repository.isOperationLocallyOwned(cachedOperation),
    true,
    'the timeout witness should be locally owned by the replacement target node',
  );
  t.equal(
    coordinator.workflowOwner.shouldRearmDispatchFromProgressReconcile(
      cachedOperation,
      TEST_ACTUAL_STATUS_ABSENT,
      {now: nowMs},
    ),
    true,
    'the local timeout witness should be eligible for dispatch re-arm while its operation budget remains active',
  );

  await coordinator.checkTimeouts();

  t.equal(
    deliveries.length,
    1,
    'timeout reconciliation should dispatch the existing local-owner operation once',
  );
  t.equal(
    deliveries[0]?.target,
    TEST_REPLICA_HANDLER_DISPATCH_TARGET,
    'local-owner re-dispatch should target the canonical replica handler',
  );
  t.equal(
    operationRow.workflow_step,
    TEST_STEP_CREATING,
    'local-owner re-dispatch should advance durable workflow progress out of PENDING',
  );
  t.equal(
    operationRow.status,
    TEST_STATUS_CREATING,
    'local-owner re-dispatch should persist the creating status after dispatch acknowledgement',
  );
  t.equal(
    operationRow.error_message,
    TEST_EMPTY_VALUE,
    'local-owner re-dispatch should not record a timeout failure while operation budget remains active',
  );
  t.equal(
    updateCount,
    2,
    'local-owner re-dispatch should persist the SENDING and CREATING transitions',
  );

  await coordinator.shutdown();
});

test(TEST_SQL_PRIORITY_TIMEOUT_REDISPATCH_TEST_NAME, async (t) => {
  const deliveries = [];
  const updateOptions = [];
  const updateParams = [];
  let updateCount = 0;
  const nowMs = Date.now();
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    nowMs,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: 1,
        };
      }
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += 1;
        updateOptions.push({...options});
        updateParams.push([...params]);
        operationRow.status = params[0];
        operationRow.workflow_step = params[1];
        operationRow.updated_at = params[2];
        operationRow.completed_at = params[3];
        operationRow.error_message = params[4];
        operationRow.steps_history = params[5];
        operationRow.replica_id = params[6];
        return {
          success: true,
          affectedRows: 1,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: 0,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
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

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  coordinator.initialize();

  const cachedOperation =
    coordinator.repository.queryCachedIncompleteOperations()[0];

  t.equal(
    coordinator.repository.isOperationLocallyOwned(cachedOperation),
    true,
    TEST_ASSERT_SQL_PRIORITY_LOCAL_OWNER,
  );
  t.equal(
    coordinator.workflowOwner.shouldRearmDispatchFromProgressReconcile(
      cachedOperation,
      TEST_ACTUAL_STATUS_ABSENT,
      {now: nowMs},
    ),
    true,
    TEST_ASSERT_SQL_PRIORITY_REARM,
  );

  await coordinator.checkTimeouts();

  t.equal(
    deliveries.length,
    NUM.ONE,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH,
  );
  t.equal(
    deliveries[NUM.ZERO]?.target,
    TEST_REPLICA_HANDLER_DISPATCH_TARGET,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH_TARGET,
  );
  t.equal(
    deliveries[NUM.ZERO]?.options?.timeoutMs,
    TEST_HANDOFF_TIMEOUT_MS,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH_TIMEOUT,
  );
  t.equal(
    deliveries[NUM.ZERO]?.options?.deliverySource,
    TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH_SOURCE,
  );
  t.equal(
    operationRow.workflow_step,
    TEST_STEP_CREATING,
    TEST_ASSERT_SQL_PRIORITY_STEP,
  );
  t.equal(
    operationRow.status,
    TEST_STATUS_CREATING,
    TEST_ASSERT_SQL_PRIORITY_STATUS,
  );
  t.equal(
    updateCount,
    2,
    TEST_ASSERT_SQL_PRIORITY_TRANSITIONS,
  );
  t.equal(
    updateOptions[NUM.ZERO]?.disableSystemWriteSession,
    true,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_NO_SESSION,
  );
  t.equal(
    Object.hasOwn(updateOptions[NUM.ZERO] || {}, 'sessionId'),
    false,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_SESSION_ABSENT,
  );
  t.equal(
    updateParams[NUM.ZERO]?.[TEST_EXPECTED_WORKFLOW_STEP_PARAM_INDEX],
    TEST_STEP_PENDING,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_CAS,
  );
  t.equal(
    updateOptions[NUM.ZERO]?.timeoutBudget?.configuredBudgetMs,
    TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
  );
  t.ok(
    updateOptions[NUM.ZERO]?.timeoutMs <=
      TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS &&
      updateOptions[NUM.ZERO]?.timeoutMs > NUM.ZERO,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
  );
  t.equal(
    updateOptions[NUM.ONE]?.timeoutBudget?.configuredBudgetMs,
    TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
    TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET,
  );
  t.ok(
    updateOptions[NUM.ONE]?.timeoutMs <=
      TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS &&
      updateOptions[NUM.ONE]?.timeoutMs > NUM.ZERO,
    TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET,
  );

  await coordinator.shutdown();
});

test(TEST_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH_TEST_NAME, async (t) => {
  const deliveries = [];
  const updateParams = [];
  let updateCount = 0;
  const nowMs = Date.now();
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    nowMs,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += NUM.ONE;
        updateParams.push([...params]);
        if (updateCount === NUM.ONE) {
          return {
            success: false,
            error: TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
            errorCode: TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
            participantFailures: [
              {
                deferRetry: true,
                retryAfterMs: TEST_RETRY_AFTER_MS,
              },
            ],
            firstFailedParticipant: {
              deferRetry: true,
              retryAfterMs: TEST_RETRY_AFTER_MS,
            },
          };
        }
        operationRow.status = params[NUM.ZERO];
        operationRow.workflow_step = params[NUM.ONE];
        operationRow.updated_at = params[NUM.TWO];
        operationRow.completed_at = params[NUM.THREE];
        operationRow.error_message = params[NUM.FOUR];
        operationRow.steps_history = params[NUM.FIVE];
        operationRow.replica_id = params[NUM.SIX];
        return {
          success: true,
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
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

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  coordinator.initialize();

  await coordinator.checkTimeouts();

  t.equal(
    deliveries.length,
    NUM.ONE,
    TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH,
  );
  t.equal(
    operationRow.workflow_step,
    TEST_STEP_CREATING,
    TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_STEP,
  );
  t.equal(
    updateParams[NUM.ONE]?.[TEST_EXPECTED_WORKFLOW_STEP_PARAM_INDEX],
    TEST_STEP_PENDING,
    TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_CAS,
  );

  await coordinator.shutdown();
});

test(TEST_SQL_PRIORITY_DEFERRED_PROGRESS_DISPATCH_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const updateOptions = [];
  let updateCount = 0;
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    nowMs: TEST_CAPTURED_AT_MS,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += NUM.ONE;
        updateOptions.push({...options});
        if (updateCount === NUM.ONE || updateCount === NUM.THREE) {
          operationRow.status = params[NUM.ZERO];
          operationRow.workflow_step = params[NUM.ONE];
          operationRow.updated_at = params[NUM.TWO];
          operationRow.completed_at = params[NUM.THREE];
          operationRow.error_message = params[NUM.FOUR];
          operationRow.steps_history = params[NUM.FIVE];
          operationRow.replica_id = params[NUM.SIX];
          return {
            success: true,
            affectedRows: NUM.ONE,
          };
        }
        return {
          success: false,
          error: TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
          errorCode: TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
          participantFailures: [
            {
              deferRetry: true,
              retryAfterMs: TEST_RETRY_AFTER_MS,
            },
          ],
          firstFailedParticipant: {
            deferRetry: true,
            retryAfterMs: TEST_RETRY_AFTER_MS,
          },
        };
      }
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes(TEST_QUERY_OPERATION_BY_ID_FRAGMENT)
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
            [{...operationRow}] :
            [],
          affectedRows:
            operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
              NUM.ONE :
              NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildDispatchPendingReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.workflowOwner.repository
    .replicaOperationAuthoritativeVisibilityTimeoutMs = NUM.ZERO;

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    TEST_CAPTURED_AT_MS - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  try {
    coordinator.initialize();

    await coordinator.checkTimeouts();

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );

    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_SQL_PRIORITY_DISPATCH,
    );
    t.equal(
      updateCount,
      NUM.TWO,
      TEST_ASSERT_SQL_PRIORITY_TRANSITIONS,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_STEP_SENDING,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_STALE_ROW,
    );
    t.equal(
      updateOptions[NUM.ONE]?.timeoutBudget?.configuredBudgetMs,
      TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
      TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET,
    );
    t.equal(
      snapshot?.coordinator?.operation?.workflowStep,
      TEST_STEP_CREATING,
      TEST_ASSERT_SQL_PRIORITY_SNAPSHOT_STEP,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_TIMER,
    );

    await deferredTimers[NUM.ZERO].fn();

    t.equal(
      updateCount,
      NUM.THREE,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_STEP_CREATING,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STEP,
    );
    t.equal(
      operationRow.status,
      TEST_STATUS_CREATING,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STATUS,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_SQL_PRIORITY_PENDING_WAKE_ACTIVE_RECONCILE_TEST_NAME, async (t) => {
  const deliveries = [];
  let updateCount = NUM.ZERO;
  const nowMs = Date.now();
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    nowMs,
  });
  const serviceRow = {
    service_id: TEST_LOCAL_OWNER_REPLICA_ID,
    service_type: TEST_ENTITY_TYPE_PARTITION,
    node_id: TEST_TARGET_NODE_ID,
    partition_id: TEST_LOCAL_OWNER_PARTITION_ID,
    group_id: TEST_EMPTY_VALUE,
    replica_id: TEST_LOCAL_OWNER_REPLICA_ID,
    raft_role: TEST_RAFT_ROLE_FOLLOWER,
    status: TEST_STATUS_ACTIVE,
    address: TEST_REPLICA_SERVICE_ADDRESS,
    created_at: nowMs,
    updated_at: nowMs,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += NUM.ONE;
        operationRow.status = params[NUM.ZERO];
        operationRow.workflow_step = params[NUM.ONE];
        operationRow.updated_at = params[NUM.TWO];
        operationRow.completed_at = params[NUM.THREE];
        operationRow.error_message = params[NUM.FOUR];
        operationRow.steps_history = params[NUM.FIVE];
        operationRow.replica_id = params[NUM.SIX];
        return {
          success: true,
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        const requestedReplicaId = params[NUM.ZERO];
        const requestedNodeId = params[NUM.ONE];
        const serviceMatches =
          requestedReplicaId === TEST_LOCAL_OWNER_REPLICA_ID ||
          requestedNodeId === TEST_TARGET_NODE_ID;
        return {
          success: true,
          rows: serviceMatches ? [{...serviceRow}] : [],
          affectedRows: serviceMatches ? NUM.ONE : NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return TEST_EMPTY_VALUE;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          TEST_EMPTY_VALUE;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
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

  try {
    coordinator.initialize();
    const pendingWakeOperation =
      coordinator.repository.rowToOperation(operationRow);
    const pendingWakeOptions = {
      cause: TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
    };

    const dispatchResult = await coordinator.dispatchOperation(
      pendingWakeOperation,
      pendingWakeOptions,
    );

    t.equal(
      dispatchResult?.success,
      true,
      TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_SUCCESS,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_NO_CREATE,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_STEP_ACTIVE,
      TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STEP,
    );
    t.equal(
      operationRow.status,
      TEST_STATUS_ACTIVE,
      TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STATUS,
    );
    t.ok(updateCount >= NUM.ONE, TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STEP);
  } finally {
    await coordinator.shutdown();
  }
});

test(TEST_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_RECONCILE_TEST_NAME,
  async (t) => {
    const deliveries = [];
    let updateCount = NUM.ZERO;
    const nowMs = Date.now();
    const operationRow = buildPendingOperationRow({
      operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
      partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
      replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
      nowMs,
    });
    const serviceRow = {
      service_id: TEST_LOCAL_OWNER_REPLICA_ID,
      service_type: TEST_ENTITY_TYPE_PARTITION,
      node_id: TEST_TARGET_NODE_ID,
      partition_id: TEST_LOCAL_OWNER_PARTITION_ID,
      group_id: TEST_EMPTY_VALUE,
      replica_id: TEST_LOCAL_OWNER_REPLICA_ID,
      raft_role: TEST_RAFT_ROLE_FOLLOWER,
      status: TEST_STATUS_PENDING,
      address: TEST_REPLICA_SERVICE_ADDRESS,
      created_at: nowMs,
      updated_at: nowMs,
    };

    const sqlQueryEngine = {
      async executeQuery(sql, params = []) {
        const normalizedSql = String(sql);
        if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
          updateCount += NUM.ONE;
          operationRow.status = params[NUM.ZERO];
          operationRow.workflow_step = params[NUM.ONE];
          operationRow.updated_at = params[NUM.TWO];
          operationRow.completed_at = params[NUM.THREE];
          operationRow.error_message = params[NUM.FOUR];
          operationRow.steps_history = params[NUM.FIVE];
          operationRow.replica_id = params[NUM.SIX];
          return {
            success: true,
            affectedRows: NUM.ONE,
          };
        }
        if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
          return {
            success: true,
            rows: [{...operationRow}],
            affectedRows: NUM.ONE,
          };
        }
        if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
          const requestedReplicaId = params[NUM.ZERO];
          const requestedNodeId = params[NUM.ONE];
          const serviceMatches =
            requestedReplicaId === TEST_LOCAL_OWNER_REPLICA_ID ||
            requestedNodeId === TEST_TARGET_NODE_ID;
          return {
            success: true,
            rows: serviceMatches ? [{...serviceRow}] : [],
            affectedRows: serviceMatches ? NUM.ONE : NUM.ZERO,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: TEST_TARGET_NODE_ID,
      replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
      sqlQueryEngine,
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
            return TEST_EMPTY_VALUE;
          }
          return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
            operationRow :
            TEST_EMPTY_VALUE;
        },
        getAll(tableName) {
          if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
            return [];
          }
          return [operationRow];
        },
        filter(tableName, predicate) {
          if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
            return [];
          }
          return [operationRow].filter(predicate);
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              controlPlaneRecoveryEligible: true,
              repairEligible: true,
              serveEligible: true,
            },
          };
        },
      },
      messageRouter: {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
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

    try {
      coordinator.initialize();
      const pendingWakeOperation =
        coordinator.repository.rowToOperation(operationRow);
      const pendingWakeOptions = {
        cause: TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
      };

      const dispatchResult = await coordinator.dispatchOperation(
        pendingWakeOperation,
        pendingWakeOptions,
      );

      t.equal(
        dispatchResult?.success,
        true,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_SUCCESS,
      );
      t.equal(
        deliveries.length,
        NUM.ZERO,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_NO_CREATE,
      );
      t.equal(
        operationRow.workflow_step,
        TEST_STEP_CREATING,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STEP,
      );
      t.equal(
        operationRow.status,
        TEST_STATUS_CREATING,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STATUS,
      );
      t.ok(
        updateCount >= NUM.ONE,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STEP,
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test(TEST_SQL_PRIORITY_STALE_VISIBILITY_REDISPATCH_TEST_NAME, async (t) => {
  const deliveries = [];
  const updateOptions = [];
  let updateCount = 0;
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    nowMs: TEST_CAPTURED_AT_MS,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += 1;
        updateOptions.push({...options});
        if (updateCount === NUM.ONE) {
          operationRow.status = params[NUM.ZERO];
          operationRow.workflow_step = params[NUM.ONE];
          operationRow.updated_at = params[NUM.TWO];
          operationRow.completed_at = params[NUM.THREE];
          operationRow.error_message = params[NUM.FOUR];
          operationRow.steps_history = params[NUM.FIVE];
          operationRow.replica_id = params[NUM.SIX];
        }
        return {
          success: true,
          affectedRows: NUM.ONE,
        };
      }
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes(TEST_QUERY_OPERATION_BY_ID_FRAGMENT)
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
            [{...operationRow}] :
            [],
          affectedRows:
            operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
              NUM.ONE :
              NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildDispatchPendingReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
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
  coordinator.workflowOwner.repository
    .replicaOperationAuthoritativeVisibilityTimeoutMs = NUM.ZERO;

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    TEST_CAPTURED_AT_MS - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  try {
    coordinator.initialize();

    await coordinator.checkTimeouts();

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );

    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_SQL_PRIORITY_DISPATCH,
    );
    t.equal(
      updateCount,
      NUM.TWO,
      TEST_ASSERT_SQL_PRIORITY_TRANSITIONS,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_STEP_SENDING,
      TEST_ASSERT_SQL_PRIORITY_STALE_ROW,
    );
    t.equal(
      updateOptions[NUM.ZERO]?.timeoutBudget?.configuredBudgetMs,
      TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
      TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
    );
    t.ok(
      updateOptions[NUM.ZERO]?.timeoutMs <=
        TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS &&
        updateOptions[NUM.ZERO]?.timeoutMs > NUM.ZERO,
      TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
    );
    t.equal(
      snapshot?.coordinator?.operation?.workflowStep,
      TEST_STEP_CREATING,
      TEST_ASSERT_SQL_PRIORITY_SNAPSHOT_STEP,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('checkTimeouts supplements cache-visible priority scans with ' +
  'authoritative no-step rows',
async (t) => {
  const deliveries = [];
  const authoritativeIncompleteReads = [];
  const nowMs = Date.now();
  const cacheVisibleOperationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_OBSERVER_NODE_ID,
    target_node_id: TEST_SOURCE_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };
  const authoritativeOnlyOperationRow = {
    operation_id: TEST_AUTHORITATIVE_ONLY_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_AUTHORITATIVE_ONLY_PARTITION_ID,
    replica_id: TEST_AUTHORITATIVE_ONLY_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_AUTHORITATIVE_ONLY_PARTITION_ID,
  };
  const operationRows = new Map([
    [cacheVisibleOperationRow.operation_id, cacheVisibleOperationRow],
    [
      authoritativeOnlyOperationRow.operation_id,
      authoritativeOnlyOperationRow,
    ],
  ]);

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        const operationRow = operationRows.get(operationId) || null;
        return {
          success: true,
          rows: operationRow ? [{...operationRow}] : [],
          affectedRows: operationRow ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        authoritativeIncompleteReads.push({
          sql: normalizedSql,
          params: [...params],
        });
        return {
          success: true,
          rows: [...operationRows.values()]
            .filter((row) =>
              row.source_node_id === TEST_TARGET_NODE_ID ||
              row.target_node_id === TEST_TARGET_NODE_ID,
            )
            .map((row) => ({...row})),
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.startsWith('UPDATE replica_operations SET')) {
        const operationRow = operationRows.get(params[7]);
        operationRow.status = params[NUM.ZERO];
        operationRow.workflow_step = params[NUM.ONE];
        operationRow.updated_at = params[NUM.TWO];
        operationRow.completed_at = params[NUM.THREE];
        operationRow.error_message = params[NUM.FOUR];
        operationRow.steps_history = params[NUM.FIVE];
        operationRow.replica_id = params[NUM.SIX];
        return {
          success: true,
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return TEST_EMPTY_VALUE;
        }
        return key === TEST_OPERATION_ID ?
          cacheVisibleOperationRow :
          TEST_EMPTY_VALUE;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [cacheVisibleOperationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [cacheVisibleOperationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
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

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_AUTHORITATIVE_ONLY_PARTITION_ID},
  );
  authoritativeOnlyOperationRow.created_at =
    nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  authoritativeOnlyOperationRow.updated_at =
    authoritativeOnlyOperationRow.created_at;

  coordinator.initialize();

  await coordinator.checkTimeouts();

  t.ok(
    authoritativeIncompleteReads.some((entry) =>
      entry.sql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT),
    ),
    'priority timeout scans should supplement partial cache visibility with one authoritative owner read',
  );
  t.equal(
    authoritativeOnlyOperationRow.workflow_step,
    TEST_STEP_CREATING,
    'authoritative-only no-step priority rows should re-enter local dispatch',
  );
  t.equal(
    authoritativeOnlyOperationRow.status,
    TEST_STATUS_CREATING,
    'authoritative-only no-step priority rows should persist dispatch progress',
  );
  t.ok(
    deliveries.some((delivery) =>
      delivery.target === TEST_REPLICA_HANDLER_DISPATCH_TARGET &&
      delivery.payload?.operationId === TEST_AUTHORITATIVE_ONLY_OPERATION_ID,
    ),
    'authoritative-only priority rows should dispatch through the replica handler',
  );

  await coordinator.shutdown();
});

test(TEST_SNAPSHOT_REENTRY_TEST_NAME,
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: WORKFLOW_STEP.SENDING,
    created_at: TEST_OPERATION_CREATED_AT_MS,
    updated_at:
      nowMs - TEST_STEP_TIMEOUT_MS - TEST_TIMEOUT_OVERRUN_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_OPERATION_ID ? [{...operationRow}] : [],
          affectedRows:
            operationId === TEST_OPERATION_ID ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
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
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildDispatchPendingReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    const operation = coordinator.repository.rowToOperation(operationRow);
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );
    await new Promise((resolve) => {
      setTimeout(resolve, TEST_MICROTASK_DELAY_MS);
    });

    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      TEST_ASSERT_SNAPSHOT_REENTRY_ADVANCE_ACTION,
    );
    t.equal(
      snapshot?.actuation?.state,
      TEST_EXPECTED_SENDING_REENTRY_ACTUATION_STATE,
      TEST_ASSERT_SNAPSHOT_REENTRY_NOT_TRANSITION_DEFERRED,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_SNAPSHOT_REENTRY_WAKES_REMOTE_OWNER,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_UNDEFINED_VALUE,
      TEST_ASSERT_SNAPSHOT_REENTRY_TARGET,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_SNAPSHOT_REENTRY_ARMS_RETRY,
    );
    t.equal(
      operationRow.status,
      TEST_STATUS_PENDING,
      TEST_ASSERT_SNAPSHOT_REENTRY_PRESERVES_PENDING,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});


test('priority recovery snapshots defer dispatch-pending re-entry when the ' +
  'operation owner lane is already held',
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: TEST_OPERATION_CREATED_AT_MS,
    updated_at: TEST_OPERATION_CREATED_AT_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_OPERATION_ID ? [{...operationRow}] : [],
          affectedRows:
            operationId === TEST_OPERATION_ID ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
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
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildDispatchPendingReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    const operation = coordinator.repository.rowToOperation(operationRow);
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };
    const singleFlightKey =
      coordinator.workflowOwner.getOperationOwnerSingleFlightKey(
        TEST_OPERATION_ID,
      );
    let releaseOwnerLane;
    const heldOwnerLane = coordinator.workflowOwner.operationWorkflowRunExclusive(
      singleFlightKey,
      () => new Promise((resolve) => {
        releaseOwnerLane = resolve;
      }),
    );

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );

    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      TEST_ASSERT_SNAPSHOT_REENTRY_ADVANCE_ACTION,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_OWNER_LANE_HELD_NO_INLINE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_OWNER_LANE_HELD_DEFERS_REENTRY,
    );

    releaseOwnerLane();
    await heldOwnerLane;
    nowMs += deferredTimers[NUM.ZERO].delayMs;
    await deferredTimers[NUM.ZERO].fn();

    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_OWNER_LANE_HELD_RETRY_WAKES,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_SNAPSHOT_REENTRY_TARGET,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('priority recovery snapshots surface retry-scheduled rebalancer ' +
  'handoff progress while a remote handoff retry is already active',
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: WORKFLOW_STEP.SENDING,
    created_at: TEST_OPERATION_CREATED_AT_MS,
    updated_at: TEST_OPERATION_CREATED_AT_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_OPERATION_ID ? [{...operationRow}] : [],
          affectedRows:
            operationId === TEST_OPERATION_ID ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
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
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildDispatchPendingReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    const operation = coordinator.repository.rowToOperation(operationRow);
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };
    t.equal(
      coordinator.workflowOwner.deferCoordinatorCreatedRemoteHandoffRetry(
        operation,
        {
          deferRetry: true,
          retryAfterMs: TEST_RETRY_AFTER_MS,
          error: TEST_RETRYABLE_HANDOFF_ERROR,
        },
      ),
      true,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_TIMER_PRESERVED,
    );

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );

    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.equal(
      snapshot?.progress?.blockingBoundary,
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.equal(
      snapshot?.progress?.waitMode,
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_NO_INLINE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_TIMER_PRESERVED,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_RETRY_SCHEDULED_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = Object.freeze({
    operationId: TEST_OPERATION_ID,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    status: TEST_STATUS_PENDING,
    workflowStep: WORKFLOW_STEP.SENDING,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    createdAt: TEST_CAPTURED_AT_MS,
    updatedAt: TEST_CAPTURED_AT_MS,
  });
  const snapshot = Object.freeze({
    operationId: TEST_OPERATION_ID,
    actuation: Object.freeze({
      owner: OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    progress: Object.freeze({
      currentOwner: OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
  });
  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
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
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    t.equal(
      coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
        snapshot,
        [operation],
      ),
      true,
      TEST_ASSERT_RETRY_SCHEDULED_REENTRY_WAKES,
    );
    await new Promise((resolve) => {
      setTimeout(resolve, TEST_MICROTASK_DELAY_MS);
    });
    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_RETRY_SCHEDULED_REENTRY_WAKES,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TARGET,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TIMER,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('priority recovery snapshots re-enter serial-wait PENDING rows through ' +
  'the workflow owner',
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: TEST_OPERATION_CREATED_AT_MS,
    updated_at: TEST_OPERATION_CREATED_AT_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_OPERATION_ID ? [{...operationRow}] : [],
          affectedRows:
            operationId === TEST_OPERATION_ID ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
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
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildSerialWaitReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    const operation = coordinator.repository.rowToOperation(operationRow);
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );
    await new Promise((resolve) => {
      setTimeout(resolve, TEST_MICROTASK_DELAY_MS);
    });

    t.same(
      snapshot?.blockerReasons,
      TEST_EMPTY_LIST,
      'serial-wait PENDING rows with durable operation evidence should clear the stale serial blocker',
    );
    t.equal(
      snapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      'serial-wait PENDING rows should be classified as in-flight workflow progress',
    );
    t.equal(
      snapshot?.progress?.workflowProgressPhaseId,
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      'serial-wait PENDING rows should enter the dispatch-pending workflow phase',
    );
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      'serial-wait PENDING rows should surface owner advancement',
    );
    t.same(
      snapshot?.coordinator?.serialWaitOperationIds,
      TEST_SERIAL_WAIT_OPERATION_IDS,
      'serial-wait PENDING rows should retain the source operation witness',
    );
    t.same(
      snapshot?.coordinator?.serialWaitPartitionIds,
      TEST_SERIAL_WAIT_PARTITION_IDS,
      'serial-wait PENDING rows should retain the source partition witness',
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      'serial-wait PENDING rows should not wake the remote owner inline',
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_UNDEFINED_VALUE,
      'serial-wait re-entry should not use the remote dispatch ingress inline',
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      'serial-wait re-entry should arm one verification retry',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_LOCAL_OWNER_REMOTE_HANDOFF_GUARD_TEST_NAME, async (t) => {
  const deferredTimers = [];
  const nowMs = Date.now();
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_LOCAL_OWNER_PARTITION_ID,
    replica_id: TEST_LOCAL_OWNER_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_SENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify([{
      step: TEST_STEP_SENDING,
      timestamp: nowMs - TEST_STEP_HISTORY_LAG_MS,
    }]),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_LOCAL_OWNER_PARTITION_ID,
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return operationRow;
      },
      getAll() {
        return [operationRow];
      },
      filter(_tableName, predicate) {
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    const operation = coordinator.repository.rowToOperation(operationRow);
    coordinator.workflowOwner.recordTransitionRetryGrace(
      TEST_OPERATION_ID,
      {
        boundary: TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
        partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
        workflowStep: TEST_STEP_SENDING,
        updatedAt: operationRow.updated_at,
        createdAt: operationRow.created_at,
      },
      TEST_RETRY_AFTER_MS,
    );

    t.equal(
      coordinator.workflowOwner.deferCoordinatorCreatedRemoteHandoffRetry(
        operation,
        {
          deferRetry: true,
          retryAfterMs: TEST_RETRY_AFTER_MS,
          error: TEST_RETRYABLE_HANDOFF_ERROR,
        },
      ),
      true,
      TEST_ASSERT_LOCAL_OWNER_HANDOFF_RETRY_CONSUMED,
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      NUM.ZERO,
      TEST_ASSERT_LOCAL_OWNER_NO_HANDOFF_TIMER,
    );
    t.equal(
      deferredTimers.length,
      NUM.ZERO,
      TEST_ASSERT_LOCAL_OWNER_NO_HANDOFF_TIMER,
    );
    t.equal(
      coordinator.workflowOwner.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        operation,
        TEST_RETRY_AFTER_MS,
      ),
      false,
      TEST_ASSERT_LOCAL_OWNER_SCHEDULE_REJECTED,
    );
    t.equal(
      coordinator.workflowOwner.hasActiveTransitionRetryGrace(
        TEST_OPERATION_ID,
      ),
      true,
      TEST_ASSERT_LOCAL_OWNER_TRANSITION_GRACE_REMAINS,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('coordinator-created remote handoff uses bounded priority delivery for ' +
  'dispatch-pending PENDING rows',
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const nowMs = Date.now();
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
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
    entity_id: TEST_PARTITION_ID,
  };

  const coordinator = createCoordinator({
    nodeId: TEST_SOURCE_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== 'replica_operations') {
          return null;
        }
        return key === TEST_OPERATION_ID ? operationRow : null;
      },
      getAll(tableName) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [operationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {
          acknowledged: false,
          error: TEST_RETRYABLE_HANDOFF_ERROR,
          deferRetry: true,
          retryAfterMs: TEST_RETRY_AFTER_MS,
        };
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 3};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();

  const cachedOperation =
    coordinator.repository.queryCachedIncompleteOperations()[0];

  await coordinator.workflowOwner.armCoordinatorCreatedOperation(
    cachedOperation,
  );

  t.equal(
    deliveries.length,
    1,
    'remote-owned dispatch-pending priority rows should wake the target owner immediately',
  );
  t.equal(
    deliveries[0]?.target,
    TEST_REPLICA_DISPATCH_TARGET,
    'remote handoff should target the canonical target-owner replica-dispatch ingress',
  );
  t.equal(
    deliveries[0]?.options?.timeoutMs,
    TEST_HANDOFF_TIMEOUT_MS,
    'remote handoff should carry a bounded timeout so transport cannot strand PENDING workflow progress',
  );
  t.equal(
    deliveries[0]?.options?.deliverySource,
    TEST_COORDINATOR_CREATED_REMOTE_HANDOFF,
    'remote handoff should identify the coordinator-created handoff boundary to transport',
  );
  t.equal(
    deferredTimers.length,
    1,
    'retryable bounded handoff failure should arm a prompt verification retry',
  );
  t.equal(
    deferredTimers[0]?.delayMs,
    TEST_RETRY_AFTER_MS,
    'remote handoff retry should honor the bounded delivery retry-after value',
  );

  await coordinator.shutdown();
});

test('priority recovery snapshot builder reclassifies stale dispatch-pending ' +
  'PENDING rows to owner advancement',
(t) => {
  const snapshot = buildPriorityRecoveryDecisionSnapshot({
    partitionId: TEST_PARTITION_ID,
    capturedAt: TEST_CAPTURED_AT_MS,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationConvergence: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
      publishedActiveNodeIds: [
        TEST_SOURCE_NODE_ID,
        TEST_TARGET_NODE_ID,
      ],
      pendingAckNodeIds: TEST_EMPTY_LIST,
      pendingAckCount: NUM.ZERO,
    },
    priorityPartitionSummary: {
      blockedPartitions: [{
        partitionId: TEST_PARTITION_ID,
        spreadGap: TEST_SPREAD_GAP,
        readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
      }],
      readyEligibleNodeCount: TEST_READY_ELIGIBLE_NODE_COUNT,
    },
    operationContexts: [{
      operationId: TEST_OPERATION_ID,
      partitionId: TEST_PARTITION_ID,
      type: TEST_OPERATION_TYPE_REPLACE,
      status: TEST_STATUS_PENDING,
      workflowStep: TEST_STEP_PENDING,
      sourceNodeId: TEST_SOURCE_NODE_ID,
      targetNodeId: TEST_TARGET_NODE_ID,
      replicaId: TEST_REPLICA_ID,
      createdAtMs: TEST_OPERATION_CREATED_AT_MS,
      updatedAtMs: TEST_OPERATION_CREATED_AT_MS,
      stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
      timelineLength: TEST_TIMELINE_LENGTH,
      timelineStepCount: TEST_TIMELINE_STEP_COUNT,
      latestTimelineStep: TEST_STEP_PENDING,
      latestTimelineStatus: TEST_STATUS_PENDING,
      latestTimelineInFlight: true,
    }],
    stepTimeoutMsByWorkflowStep: {
      [TEST_STEP_PENDING]: TEST_STEP_TIMEOUT_MS,
    },
    operationOwnerOutcome: buildRemoteDispatchPendingOperationOwnerOutcome(),
  });

  t.equal(
    snapshot?.semanticState,
    PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    'stale dispatch-pending rows should remain in-flight, not operation-stalled',
  );
  t.same(
    snapshot?.blockerReasons,
    TEST_EMPTY_LIST,
    'stale dispatch-pending timeout blocker reasons should be cleared',
  );
  t.equal(
    snapshot?.actuation?.state,
    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    'stale dispatch-pending rows should preserve persisted-not-dispatched actuation',
  );
  t.equal(
    snapshot?.progress?.nextRequiredAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    'stale dispatch-pending rows should ask the owner to advance the existing operation',
  );
  t.equal(
    snapshot?.progress?.blockingBoundary,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    'stale dispatch-pending rows should not remain on workflow_timeout',
  );
  t.equal(
    snapshot?.progress?.waitMode,
    PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    'stale dispatch-pending rows should return to event-driven owner progress',
  );

  t.end();
});
