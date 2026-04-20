import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

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

test('createOperation stops re-arming acknowledged remote handoff once the ' +
  'durable PENDING timeout budget is exhausted',
async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];
  let nowMs = 1_000_000;
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

    nowMs = operation.updatedAt + pendingTimeoutMs + 1;
    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      1,
      'expired durable PENDING budget should stop re-sending remote owner wake-ups',
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      0,
      'no further handoff verification timer should remain once the durable pending budget is exhausted',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});
