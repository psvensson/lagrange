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
const TEST_OPERATION_TYPE_REPLACE = OperationType.REPLACE;
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_LOCAL_OWNER_PARTITION_ID = 'control_plane_publications-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_LOCAL_OWNER_REPLICA_ID = 'control_plane_publications-p1-r4';
const TEST_OBSERVER_NODE_ID = 'node-observer';
const TEST_SOURCE_NODE_ID = 'node-source';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_STATUS_PENDING = ReplicaStatus.PENDING;
const TEST_STATUS_CREATING = ReplicaStatus.CREATING;
const TEST_STEP_PENDING = WORKFLOW_STEP.PENDING;
const TEST_STEP_CREATING = WORKFLOW_STEP.CREATING;
const TEST_STEP_HISTORY_LAG_MS = 1000;
const TEST_TIMEOUT_OVERRUN_MS = 1;
const TEST_HANDOFF_TIMEOUT_MS = 7;
const TEST_RETRY_AFTER_MS = 11;
const TEST_EMPTY_VALUE = null;
const TEST_ACTUAL_STATUS_ABSENT = null;
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
const TEST_RETRYABLE_HANDOFF_ERROR = 'handoff retryable timeout';
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
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
const TEST_SERVICES_TABLE = 'services';
const TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT = 'FROM replica_operations';
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
const TEST_SNAPSHOT_REENTRY_TEST_NAME =
  'priority recovery snapshots re-enter stale SENDING pending dispatch-' +
  'pending workflow-timeout operations through the workflow owner';
const TEST_ASSERT_SNAPSHOT_REENTRY_ADVANCE_ACTION =
  'the snapshot should return stale SENDING timeout rows to owner advancement';
const TEST_ASSERT_SNAPSHOT_REENTRY_WAKES_REMOTE_OWNER =
  'snapshot re-entry should wake the remote operation owner once';
const TEST_ASSERT_SNAPSHOT_REENTRY_TARGET =
  'snapshot re-entry should use the canonical remote replica-dispatch ingress';
const TEST_ASSERT_SNAPSHOT_REENTRY_NOT_TRANSITION_DEFERRED =
  'snapshot re-entry should not leave the stale SENDING row transition-deferred';
const TEST_ASSERT_SNAPSHOT_REENTRY_ARMS_RETRY =
  'snapshot re-entry should arm one verification retry for the stale SENDING row';
const TEST_ASSERT_SNAPSHOT_REENTRY_PRESERVES_PENDING =
  'snapshot re-entry should preserve the remote-owned durable pending status';

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
    async executeQuery(sql, params = []) {
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
    async executeQuery(sql, params = []) {
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
      getPriorityRecoveryPlanningAnswerBestEffort() {
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
      PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      TEST_ASSERT_SNAPSHOT_REENTRY_NOT_TRANSITION_DEFERRED,
    );
    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_SNAPSHOT_REENTRY_WAKES_REMOTE_OWNER,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
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
