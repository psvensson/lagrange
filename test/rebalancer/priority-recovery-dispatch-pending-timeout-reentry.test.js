import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';

const TEST_ENTITY_TYPE_PARTITION = 'partition';
const TEST_OPERATION_ID = 'priority-dispatch-pending-timeout-operation';
const TEST_OPERATION_TYPE_REPLACE = 'REPLACE';
const TEST_PARTITION_ID = 'sql_transaction_participants-p1';
const TEST_REPLICA_ID = 'sql_transaction_participants-p1-r4';
const TEST_SOURCE_NODE_ID = 'node-source';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_STATUS_PENDING = 'pending';
const TEST_STEP_PENDING = 'PENDING';
const TEST_STEP_HISTORY_LAG_MS = 1000;
const TEST_TIMEOUT_OVERRUN_MS = 1;
const TEST_HANDOFF_TIMEOUT_MS = 7;
const TEST_RETRY_AFTER_MS = 11;
const TEST_EMPTY_VALUE = null;
const TEST_REPLICA_DISPATCH_TARGET =
  'node-target/service/replica-dispatch';
const TEST_RETRYABLE_HANDOFF_ERROR = 'handoff retryable timeout';
const TEST_COORDINATOR_CREATED_REMOTE_HANDOFF =
  'coordinator_created_remote_handoff';
const TEST_OWNER_ACTION_WAKE_REMOTE_OWNER = 'wake_remote_owner';

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
      null,
      {now: nowMs},
    ),
    true,
    'the timeout witness should be eligible for dispatch re-arm while its operation budget remains active',
  );
  t.equal(
    drainSnapshot?.ownerAction,
    TEST_OWNER_ACTION_WAKE_REMOTE_OWNER,
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

  await coordinator.shutdown();
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
