import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

test('createOperation primes coordinator-created local operations through ' +
  'the owner transition lane before external observation arrives',
async (t) => {
  const operationRows = new Map();
  const persistedOperationUpdates = [];

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
    if (normalizedSql.includes('replica_operations') &&
        Array.isArray(params) &&
        params.length === 8) {
      const row = operationRows.get(params[7]);
      if (row) {
        row.status = params[0];
        row.workflow_step = params[1];
        row.updated_at = params[2];
        row.completed_at = params[3];
        row.error_message = params[4];
        row.steps_history = params[5];
        row.replica_id = params[6];
      }
      return {success: true, affectedRows: row ? 1 : 0};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
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
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'initiated'};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
  coordinator.initialize();
  const originalPersistOperationUpdate =
    coordinator.repository.persistOperationUpdate
      .bind(coordinator.repository);
  coordinator.repository.persistOperationUpdate =
    async (operation, options = {}) => {
      persistedOperationUpdates.push({
        operationId: operation?.operationId || null,
        workflowStep: operation?.workflowStep || null,
        status: operation?.status || null,
      });
      return originalPersistOperationUpdate(operation, options);
    };

  try {
    const operation = await coordinator.createOperation({
      type: 'REMOVE',
      partitionId: 'partition-prime-test',
      entityType: 'partition',
      entityId: 'partition-prime-test',
      nodeId: 'node-target',
      replicaId: 'partition-prime-test-r1',
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const storedRow = operationRows.get(operation.operationId);
    t.ok(storedRow, 'created operation should be persisted');
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.PENDING,
      'the returned create-operation snapshot should remain the inserted PENDING record',
    );
    t.equal(
      persistedOperationUpdates.length,
      1,
      'priming the owner lane should persist exactly one PENDING to SENDING transition',
    );
    t.equal(
      persistedOperationUpdates[0]?.workflowStep,
      WORKFLOW_STEP.SENDING,
      'the persisted owner-lane transition should claim the new local operation',
    );
    t.equal(
      coordinator.operationWorkflowCoordinator
        .getWorkflowById(operation.operationId)?.step,
      WORKFLOW_STEP.SENDING,
      'the workflow coordinator should record the primed owner step',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('createOperation defers retryable participant-pressure failures and ' +
  'resumes owner-lane priming', async (t) => {
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
    if (normalizedSql.includes('replica_operations') &&
        Array.isArray(params) &&
        params.length === 8) {
      const row = operationRows.get(params[7]);
      if (row) {
        row.status = params[0];
        row.workflow_step = params[1];
        row.updated_at = params[2];
        row.completed_at = params[3];
        row.error_message = params[4];
        row.steps_history = params[5];
        row.replica_id = params[6];
      }
      return {success: true, affectedRows: row ? 1 : 0};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
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
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: 'initiated'};
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
  const originalExecuteReplicaOperationGatewayMutationWithRetry =
    coordinator.repository.executeReplicaOperationGatewayMutationWithRetry
      .bind(coordinator.repository);
  let deferredFailureInjected = false;
  coordinator.repository.executeReplicaOperationGatewayMutationWithRetry =
    async (mutation, options, fallback) => {
      if (!deferredFailureInjected &&
          mutation?.operation === 'update' &&
          mutation?.tableName === 'replica_operations') {
        deferredFailureInjected = true;
        return {
          success: false,
          error: 'Query execution failed',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
          firstFailedParticipant: {
            error: 'control_plane_pressure_degraded',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 250,
            deferRetry: true,
            failedTable: 'replica_operations',
          },
          participantFailures: [{
            error: 'control_plane_pressure_degraded',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 250,
            deferRetry: true,
            failedTable: 'replica_operations',
          }],
        };
      }
      return originalExecuteReplicaOperationGatewayMutationWithRetry(
        mutation,
        options,
        fallback,
      );
    };

  try {
    const operation = await coordinator.createOperation({
      type: 'REMOVE',
      partitionId: 'partition-pressure-retry-test',
      entityType: 'partition',
      entityId: 'partition-pressure-retry-test',
      nodeId: 'node-target',
      replicaId: 'partition-pressure-retry-test-r1',
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      deferredTimers.length,
      1,
      'retryable participant pressure should schedule one shared owner-lane retry',
    );
    t.equal(
      operationRows.get(operation.operationId)?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'the inserted row should stay pending until the deferred retry resumes',
    );
    t.equal(
      deliveries.length,
      0,
      'no dispatch should leave the node before the deferred retry resumes',
    );

    await deferredTimers[0].fn();

    const resumedStep = coordinator.operationWorkflowCoordinator
      .getWorkflowById(operation.operationId)?.step;
    t.not(
      resumedStep,
      WORKFLOW_STEP.PENDING,
      'the deferred owner-lane retry should resume progression once pressure clears',
    );
    t.equal(
      deliveries.length,
      1,
      'the resumed owner path should continue into dispatch after claiming the operation',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('dispatchOperation defers priority claim misses when durable ' +
  'PENDING compare-and-set cannot commit yet', async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];
  const operationId = 'priority-claim-miss-op';
  const now = Date.now();
  operationRows.set(operationId, {
    operation_id: operationId,
    type: 'REPLACE',
    partition_id: 'sql_transactions-p1',
    replica_id: 'sql_transactions-p1-r5',
    source_node_id: 'node-remote',
    target_node_id: 'node-local',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: now,
    updated_at: now,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([{
      step: WORKFLOW_STEP.PENDING,
      timestamp: now,
    }]),
    entity_type: 'partition',
    entity_id: 'sql_transactions-p1',
  });

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
    if (normalizedSql.includes('replica_operations') &&
        Array.isArray(params) &&
        params.length === 8) {
      const row = operationRows.get(params[7]);
      if (row) {
        row.status = params[0];
        row.workflow_step = params[1];
        row.updated_at = params[2];
        row.completed_at = params[3];
        row.error_message = params[4];
        row.steps_history = params[5];
        row.replica_id = params[6];
      }
      return {success: true, affectedRows: row ? 1 : 0};
    }
    if (normalizedSql.includes('WHERE (') &&
        normalizedSql.includes('entity_type = ?') &&
        normalizedSql.includes('entity_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
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
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: 'initiated'};
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

  let injectedCompareAndSetMiss = false;
  const originalPersistOperationUpdate =
    coordinator.repository.persistOperationUpdate
      .bind(coordinator.repository);
  coordinator.repository.persistOperationUpdate =
    async (operation, options = {}) => {
      if (operation?.operationId === operationId &&
          options.expectedWorkflowStep === WORKFLOW_STEP.PENDING) {
        if (!injectedCompareAndSetMiss) {
          injectedCompareAndSetMiss = true;
          return false;
        }
        const row = operationRows.get(operationId);
        if (row) {
          row.status = operation.status;
          row.workflow_step = operation.workflowStep;
          row.updated_at = operation.updatedAt;
          row.completed_at = operation.completedAt;
          row.error_message = operation.errorMessage;
          row.steps_history = JSON.stringify(operation.stepsHistory || []);
          row.replica_id = operation.replicaId;
        }
        return true;
      }
      return originalPersistOperationUpdate(operation, options);
    };

  try {
    const result = await coordinator.dispatchOperation(operationId);

    t.equal(
      result?.reason,
      REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      'priority claim miss should defer dispatch through the retry lane',
    );
    t.equal(
      deferredTimers.length,
      1,
      'priority claim miss should arm one deferred retry',
    );
    t.equal(
      operationRows.get(operationId)?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'operation should remain PENDING until the deferred retry resumes',
    );
    t.equal(
      deliveries.length,
      0,
      'dispatch should not leave the node before deferred retry resumes',
    );

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      1,
      'deferred retry should re-enter dispatch and deliver once claim succeeds',
    );
    t.not(
      operationRows.get(operationId)?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'deferred retry should advance the durable workflow step beyond PENDING',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('priority deferred dispatch retry rehydrates from the authoritative ' +
  'operation row when the local query path misses',
async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];
  const operationId = 'priority-deferred-authoritative-op';
  const now = Date.now();
  operationRows.set(operationId, {
    operation_id: operationId,
    type: 'REPLACE',
    partition_id: 'sql_transactions-p1',
    replica_id: 'sql_transactions-p1-r5',
    source_node_id: 'node-remote',
    target_node_id: 'node-local',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: now,
    updated_at: now,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([{
      step: WORKFLOW_STEP.PENDING,
      timestamp: now,
    }]),
    entity_type: 'partition',
    entity_id: 'sql_transactions-p1',
  });

  let authoritativeReadCount = 0;
  const authoritativeRead = async (tableName, sql, params = []) => {
    if (tableName === 'replica_operations' &&
        String(sql).includes('WHERE operation_id = ?')) {
      authoritativeReadCount += 1;
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
    if (normalizedSql.includes('replica_operations') &&
        Array.isArray(params) &&
        params.length === 8) {
      const row = operationRows.get(params[7]);
      if (row) {
        row.status = params[0];
        row.workflow_step = params[1];
        row.updated_at = params[2];
        row.completed_at = params[3];
        row.error_message = params[4];
        row.steps_history = params[5];
        row.replica_id = params[6];
      }
      return {success: true, affectedRows: row ? 1 : 0};
    }
    if (normalizedSql.includes('WHERE (') &&
        normalizedSql.includes('entity_type = ?') &&
        normalizedSql.includes('entity_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
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
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: 'initiated'};
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

  let injectedCompareAndSetMiss = false;
  const originalPersistOperationUpdate =
    coordinator.repository.persistOperationUpdate
      .bind(coordinator.repository);
  coordinator.repository.persistOperationUpdate =
    async (operation, options = {}) => {
      if (operation?.operationId === operationId &&
          options.expectedWorkflowStep === WORKFLOW_STEP.PENDING) {
        if (!injectedCompareAndSetMiss) {
          injectedCompareAndSetMiss = true;
          return false;
        }
        const row = operationRows.get(operationId);
        if (row) {
          row.status = operation.status;
          row.workflow_step = operation.workflowStep;
          row.updated_at = operation.updatedAt;
          row.completed_at = operation.completedAt;
          row.error_message = operation.errorMessage;
          row.steps_history = JSON.stringify(operation.stepsHistory || []);
          row.replica_id = operation.replicaId;
        }
        return true;
      }
      return originalPersistOperationUpdate(operation, options);
    };

  try {
    const result = await coordinator.dispatchOperation(operationId);

    t.equal(
      result?.reason,
      REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      'priority claim miss should defer dispatch through the retry lane',
    );
    t.equal(
      deferredTimers.length,
      1,
      'priority claim miss should arm one deferred retry',
    );

    const authoritativeReadsBeforeRetry = authoritativeReadCount;
    const originalQueryOperationById =
      coordinator.repository.queryOperationById
        .bind(coordinator.repository);
    coordinator.repository.queryOperationById = async (requestedOperationId) => {
      if (requestedOperationId === operationId) {
        return null;
      }
      return originalQueryOperationById(requestedOperationId);
    };

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      1,
      'deferred retry should still dispatch when only the authoritative row is visible',
    );
    t.ok(
      authoritativeReadCount > authoritativeReadsBeforeRetry,
      'deferred retry should consult the authoritative operation owner path',
    );
    t.not(
      operationRows.get(operationId)?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'deferred retry should advance the durable workflow step beyond PENDING',
    );
  } finally {
    await coordinator.shutdown();
  }
});

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
