import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {NUM, SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {TIMEOUT_BUDGET_DEFAULT} from
  '../../src/control-plane/timeout-budget.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const REMOTE_HANDOFF_TEST_INITIAL_NOW_MS = 1_000_000;
const REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS = 1;
const RECENT_INTENT_POLICY_NODE_ID = 'recent-intent-policy-node';
const RECENT_INTENT_POLICY_TARGET_NODE_ID =
  'recent-intent-policy-target-node';
const RECENT_INTENT_PRIORITY_OPERATION_ID =
  'recent-intent-priority-operation';
const RECENT_INTENT_NON_PRIORITY_OPERATION_ID =
  'recent-intent-non-priority-operation';
const RECENT_INTENT_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
const RECENT_INTENT_NON_PRIORITY_PARTITION_ID = 'customer_orders-p1';

function createRecentIntentPolicyCoordinator() {
  return new RebalanceCoordinator({
    nodeId: RECENT_INTENT_POLICY_NODE_ID,
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
      async executeAuthoritativeSystemTableRead() {
        return {success: true, rows: [], affectedRows: NUM.ZERO};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: NUM.ONE};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], affectedRows: NUM.ZERO};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
}

test('createOperation retries coordinator-created handoff for remote-owned ' +
  'priority REPLACE operations until the canonical owner wake-up succeeds',
async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];

  const authoritativeRead = async (tableName, sql, params = []) => {
    if (tableName === 'replica_operations' &&
        String(sql).includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    return {
      success: true,
      rows: [],
      affectedRows: 0,
    };
  };
  const executeQuery = async (sql, params = []) => {
    const normalizedSql = String(sql);
    if (normalizedSql.includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    if (normalizedSql.includes('WHERE partition_id = ? AND target_node_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('WHERE (') &&
        normalizedSql.includes('entity_type = ?') &&
        normalizedSql.includes('entity_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('replica_operations') &&
        normalizedSql.includes('VALUES')) {
      const row = {
        operation_id: params[0],
        type: params[1],
        partition_id: params[2],
        replica_id: params[3],
        source_node_id: params[4],
        target_node_id: params[5],
        status: params[6],
        workflow_step: params[7],
        created_at: params[8],
        updated_at: params[9],
        completed_at: params[10],
        error_message: params[11],
        steps_history: params[12],
        entity_type: params[13],
        entity_id: params[14],
      };
      operationRows.set(row.operation_id, row);
      return {success: true, affectedRows: 1};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  let deliveryAttempt = 0;
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-source',
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
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
      ) {
        return authoritativeRead(tableName, sql, params);
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async readAuthoritativeRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 1024;
      },
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        deliveryAttempt += 1;
        if (deliveryAttempt === 1) {
          const error = new Error('connection unavailable');
          error.deferRetry = true;
          error.retryAfterMs = 250;
          throw error;
        }
        return {acknowledged: true};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = await coordinator.createOperation({
      type: 'REPLACE',
      partitionId: 'sql_write_operations-p1',
      entityType: 'partition',
      entityId: 'sql_write_operations-p1',
      nodeId: 'node-target',
      replicaId: 'sql_write_operations-p1-r1',
      skipProvisioningAdmissionRecheck: true,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      operationRows.get(operation.operationId)?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'the inserted row should stay pending until the remote owner accepts the handoff',
    );
    t.equal(
      deliveries.length,
      1,
      'remote-owned priority REPLACE handoff should wake the canonical owner immediately',
    );
    t.equal(
      deliveries[0]?.target,
      'node-target/service/replica-dispatch',
      'handoff should target the remote replica-dispatch owner ingress',
    );
    t.equal(
      deferredTimers.length,
      1,
      'retryable remote handoff failure should arm one deferred handoff retry',
    );

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      2,
      'deferred handoff retry should re-send the owner wake-up through the same ingress',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('createOperation re-arms acknowledged remote handoff while the ' +
  'authoritative priority REPLACE row remains PENDING',
async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];

  const authoritativeRead = async (tableName, sql, params = []) => {
    if (tableName === 'replica_operations' &&
        String(sql).includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    return {
      success: true,
      rows: [],
      affectedRows: 0,
    };
  };
  const executeQuery = async (sql, params = []) => {
    const normalizedSql = String(sql);
    if (normalizedSql.includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    if (normalizedSql.includes('WHERE partition_id = ? AND target_node_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('WHERE (') &&
        normalizedSql.includes('entity_type = ?') &&
        normalizedSql.includes('entity_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('replica_operations') &&
        normalizedSql.includes('VALUES')) {
      const row = {
        operation_id: params[0],
        type: params[1],
        partition_id: params[2],
        replica_id: params[3],
        source_node_id: params[4],
        target_node_id: params[5],
        status: params[6],
        workflow_step: params[7],
        created_at: params[8],
        updated_at: params[9],
        completed_at: params[10],
        error_message: params[11],
        steps_history: params[12],
        entity_type: params[13],
        entity_id: params[14],
      };
      operationRows.set(row.operation_id, row);
      return {success: true, affectedRows: 1};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-source',
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
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
      ) {
        return authoritativeRead(tableName, sql, params);
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async readAuthoritativeRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 1024;
      },
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        return {acknowledged: true};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = await coordinator.createOperation({
      type: 'REPLACE',
      partitionId: 'control_plane_publications-p1',
      entityType: 'partition',
      entityId: 'control_plane_publications-p1',
      nodeId: 'node-target',
      replicaId: 'control_plane_publications-p1-r1',
      skipProvisioningAdmissionRecheck: true,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      operationRows.get(operation.operationId)?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'the inserted row should remain pending when the remote owner has not advanced the durable workflow yet',
    );
    t.equal(
      deliveries.length,
      1,
      'remote-owned priority REPLACE creation should still send the initial owner wake-up immediately',
    );
    t.equal(
      deferredTimers.length,
      1,
      'an acknowledged handoff should still arm one follow-up verification while the authoritative row remains PENDING',
    );

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      2,
      'the follow-up verification should re-send the owner wake-up when the authoritative row is still PENDING',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('createOperation continues re-arming acknowledged remote handoff after ' +
  'durable PENDING timeout until operation budget exhaustion',
async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];
  let nowMs = REMOTE_HANDOFF_TEST_INITIAL_NOW_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;

  const authoritativeRead = async (tableName, sql, params = []) => {
    if (tableName === 'replica_operations' &&
        String(sql).includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    return {
      success: true,
      rows: [],
      affectedRows: 0,
    };
  };
  const executeQuery = async (sql, params = []) => {
    const normalizedSql = String(sql);
    if (normalizedSql.includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    if (normalizedSql.includes('WHERE partition_id = ? AND target_node_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('WHERE (') &&
        normalizedSql.includes('entity_type = ?') &&
        normalizedSql.includes('entity_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('replica_operations') &&
        normalizedSql.includes('VALUES')) {
      const row = {
        operation_id: params[0],
        type: params[1],
        partition_id: params[2],
        replica_id: params[3],
        source_node_id: params[4],
        target_node_id: params[5],
        status: params[6],
        workflow_step: params[7],
        created_at: params[8],
        updated_at: params[9],
        completed_at: params[10],
        error_message: params[11],
        steps_history: params[12],
        entity_type: params[13],
        entity_id: params[14],
      };
      operationRows.set(row.operation_id, row);
      return {success: true, affectedRows: 1};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-source',
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
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
      ) {
        return authoritativeRead(tableName, sql, params);
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async readAuthoritativeRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 1024;
      },
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        return {acknowledged: true};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = await coordinator.createOperation({
      type: 'REPLACE',
      partitionId: 'control_plane_publications-p1',
      entityType: 'partition',
      entityId: 'control_plane_publications-p1',
      nodeId: 'node-target',
      replicaId: 'control_plane_publications-p1-r1',
      skipProvisioningAdmissionRecheck: true,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const pendingTimeoutMs = coordinator.getTimeoutForStep(
      WORKFLOW_STEP.PENDING,
      {partitionId: 'control_plane_publications-p1'},
    );

    t.equal(
      deferredTimers.length,
      1,
      'the initial acknowledged handoff should still arm one verification timer',
    );

    nowMs =
      operation.updatedAt +
      pendingTimeoutMs +
      REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      2,
      'expired durable PENDING step budget should still re-send remote owner wake-ups while the operation budget remains',
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      1,
      'handoff verification should remain armed until the operation budget is exhausted',
    );

    nowMs =
      operation.createdAt +
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS +
      REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    await deferredTimers[1].fn();

    t.equal(
      deliveries.length,
      2,
      'exhausted operation budget should stop re-sending remote owner wake-ups',
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      0,
      'no further handoff verification timer should remain once the operation budget is exhausted',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('priority add-like recent intents survive deferred authoritative ' +
  'misses through the priority create-phase window',
async (t) => {
  let nowMs = REMOTE_HANDOFF_TEST_INITIAL_NOW_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;

  const coordinator = createRecentIntentPolicyCoordinator();

  try {
    const pendingTimeoutMs = coordinator.config.pendingTimeoutMs;
    const expiredStepStartedAtMs =
      nowMs - pendingTimeoutMs - REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    const priorityPendingOperation = {
      operationId: RECENT_INTENT_PRIORITY_OPERATION_ID,
      type: OperationType.REPLACE,
      partitionId: RECENT_INTENT_PRIORITY_PARTITION_ID,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: RECENT_INTENT_PRIORITY_PARTITION_ID,
      targetNodeId: RECENT_INTENT_POLICY_TARGET_NODE_ID,
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: expiredStepStartedAtMs,
      updatedAt: expiredStepStartedAtMs,
    };
    const priorityTtlMs =
      coordinator.getRecentOperationIntentTtlMs(priorityPendingOperation);

    t.ok(
      priorityTtlMs > pendingTimeoutMs,
      'priority recent-intent TTL should exceed the ordinary PENDING timeout',
    );
    t.equal(
      coordinator.getRecentOperationMissReuseBudgetMs(
        priorityPendingOperation,
      ),
      priorityTtlMs,
      'priority PENDING add-like operations should use the priority miss reuse window',
    );
    t.equal(
      coordinator.shouldReuseRecentOperationIntentOnAuthoritativeMiss(
        priorityPendingOperation,
      ),
      true,
      'priority PENDING add-like operations should remain reusable after the ordinary step timeout',
    );

    const prioritySendingOperation = {
      ...priorityPendingOperation,
      workflowStep: WORKFLOW_STEP.SENDING,
    };
    t.equal(
      coordinator.shouldReuseRecentOperationIntentOnAuthoritativeMiss(
        prioritySendingOperation,
      ),
      true,
      'priority SENDING add-like operations should remain reusable after the ordinary step timeout',
    );

    const nonPriorityPendingOperation = {
      ...priorityPendingOperation,
      operationId: RECENT_INTENT_NON_PRIORITY_OPERATION_ID,
      partitionId: RECENT_INTENT_NON_PRIORITY_PARTITION_ID,
      entityId: RECENT_INTENT_NON_PRIORITY_PARTITION_ID,
    };
    t.equal(
      coordinator.shouldReuseRecentOperationIntentOnAuthoritativeMiss(
        nonPriorityPendingOperation,
      ),
      false,
      'non-priority operation misses should not use priority recent-intent reuse',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});
