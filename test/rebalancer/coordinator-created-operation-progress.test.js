import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {
  OPERATION_METADATA_KEY,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_CRITICAL_CREATED_OPERATION_ID = 'critical-created-op';
const TEST_CRITICAL_CREATED_PARTITION_ID = 'sql_write_operations-p1';
const TEST_CRITICAL_CREATED_LOCAL_NODE_ID = 'node-local';
const TEST_CRITICAL_CREATED_SOURCE_NODE_ID = 'node-source';
const TEST_CRITICAL_CREATED_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_CRITICAL_CREATED_OPERATION_TYPE = 'REPLACE';
const TEST_CRITICAL_CREATED_ENTITY_TYPE = 'partition';
const TEST_CRITICAL_CREATED_PENDING_STATUS = 'pending';
const TEST_CRITICAL_CREATED_INITIATED_STATUS = 'initiated';
const TEST_CRITICAL_CREATED_MIN_REPLICA_COUNT = 1;
const TEST_CRITICAL_CREATED_EMPTY_COUNT = 0;
const TEST_CRITICAL_CREATED_ONE_DISPATCH = 1;
const TEST_CRITICAL_CREATED_FIRST_DISPATCH_INDEX = 0;
const TEST_CRITICAL_CREATED_NO_ROW = null;
const TEST_CRITICAL_CREATED_DISPATCH_SUCCESS = Object.freeze({
  success: true,
});

test('armCoordinatorCreatedOperation immediately dispatches locally owned ' +
  'critical system operations after claim', async (t) => {
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_CRITICAL_CREATED_LOCAL_NODE_ID,
    systemTableCache: {
      get() {
        return TEST_CRITICAL_CREATED_NO_ROW;
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
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_CRITICAL_CREATED_MIN_REPLICA_COUNT};
      },
    },
    messageRouter: {
      async deliver() {
        return {
          acknowledged: true,
          status: TEST_CRITICAL_CREATED_INITIATED_STATUS,
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {
          success: true,
          rows: [],
          affectedRows: TEST_CRITICAL_CREATED_EMPTY_COUNT,
        };
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
  coordinator.initialize();

  const operation = {
    operationId: TEST_CRITICAL_CREATED_OPERATION_ID,
    type: TEST_CRITICAL_CREATED_OPERATION_TYPE,
    partitionId: TEST_CRITICAL_CREATED_PARTITION_ID,
    entityType: TEST_CRITICAL_CREATED_ENTITY_TYPE,
    entityId: TEST_CRITICAL_CREATED_PARTITION_ID,
    replicaId: TEST_CRITICAL_CREATED_REPLICA_ID,
    sourceNodeId: TEST_CRITICAL_CREATED_SOURCE_NODE_ID,
    targetNodeId: TEST_CRITICAL_CREATED_LOCAL_NODE_ID,
    status: TEST_CRITICAL_CREATED_PENDING_STATUS,
    workflowStep: WORKFLOW_STEP.PENDING,
    stepsHistory: [],
    [ReplicaOperationField.REPLICA_IDS]: [
      TEST_CRITICAL_CREATED_REPLICA_ID,
      'sql_write_operations-p1-r5',
      'sql_write_operations-p1-r6',
    ],
    [ReplicaOperationField.PEER_ADDRESSES]: [
      'node-local/partition/sql_write_operations-p1-r4',
      'node-5/partition/sql_write_operations-p1-r5',
      'node-6/partition/sql_write_operations-p1-r6',
    ],
  };
  const {
    [ReplicaOperationField.REPLICA_IDS]: _staleReplicaIds,
    [ReplicaOperationField.PEER_ADDRESSES]: _stalePeerAddresses,
    ...staleAuthoritativeOperation
  } = operation;
  const dispatchedOperations = [];
  coordinator.workflowOwner.repository.queryAuthoritativeOperationById =
    async () => staleAuthoritativeOperation;
  coordinator.workflowOwner.claimPendingDispatchOperation =
    async (candidateOperation) => ({
      ...candidateOperation,
      workflowStep: WORKFLOW_STEP.SENDING,
    });
  coordinator.workflowOwner.dispatchOperationInternal = async (
    dispatchOperation,
  ) => {
    dispatchedOperations.push(dispatchOperation);
    return TEST_CRITICAL_CREATED_DISPATCH_SUCCESS;
  };

  try {
    const primed =
      await coordinator.workflowOwner.armCoordinatorCreatedOperation(operation);

    t.equal(
      primed,
      true,
      'critical local priming should report progress',
    );
    t.equal(
      dispatchedOperations.length,
      TEST_CRITICAL_CREATED_ONE_DISPATCH,
      'critical local priming should continue directly into dispatch',
    );
    t.equal(
      dispatchedOperations[TEST_CRITICAL_CREATED_FIRST_DISPATCH_INDEX]
        ?.workflowStep,
      WORKFLOW_STEP.SENDING,
      'dispatch should use the claimed operation snapshot',
    );
    t.same(
      dispatchedOperations[TEST_CRITICAL_CREATED_FIRST_DISPATCH_INDEX]
        ?.[ReplicaOperationField.REPLICA_IDS],
      operation[ReplicaOperationField.REPLICA_IDS],
      'a stale authoritative re-read should retain the coordinator bootstrap cohort',
    );
    t.same(
      dispatchedOperations[TEST_CRITICAL_CREATED_FIRST_DISPATCH_INDEX]
        ?.[ReplicaOperationField.PEER_ADDRESSES],
      operation[ReplicaOperationField.PEER_ADDRESSES],
      'dispatch should retain the coordinator bootstrap peer addresses',
    );
  } finally {
    await coordinator.shutdown();
  }
});

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
        target_claim_key: params[4],
        source_node_id: params[5],
        target_node_id: params[6],
        status: params[7],
        workflow_step: params[8],
        created_at: params[9],
        updated_at: params[10],
        completed_at: params[11],
        error_message: params[12],
        steps_history: params[13],
        entity_type: params[14],
        entity_id: params[15],
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

    const heldOperation = await coordinator.createOperation({
      type: 'REMOVE',
      partitionId: 'partition-bootstrap-hold-test',
      entityType: 'partition',
      entityId: 'partition-bootstrap-hold-test',
      nodeId: 'node-bootstrap-target',
      replicaId: 'partition-bootstrap-hold-test-r1',
      deferDispatchUntilBootstrapTopology: true,
      emitOperationCreated: false,
    });
    const heldStoredRow = operationRows.get(heldOperation.operationId);
    const heldStepsHistory = JSON.parse(heldStoredRow?.steps_history || '[]');
    t.equal(
      heldStepsHistory[0]?.[
        OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED
      ],
      true,
      'operation creation should make the pre-topology dispatch hold durable',
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
        target_claim_key: params[4],
        source_node_id: params[5],
        target_node_id: params[6],
        status: params[7],
        workflow_step: params[8],
        created_at: params[9],
        updated_at: params[10],
        completed_at: params[11],
        error_message: params[12],
        steps_history: params[13],
        entity_type: params[14],
        entity_id: params[15],
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

  // The universal remove-safety floor (audit finding 1) fails closed on an
  // empty replica-row read ("safety check unavailable"). This fixture tests
  // owner-lane retry priming, not the floor — seed one voter-ready peer row
  // (with the floor already lowered via tablePolicyService below) so the
  // plain REMOVE dispatch can proceed once the deferred retry resumes.
  const seededSafetyPeerRow = {
    service_id: 'partition-pressure-retry-test-r2',
    replica_id: 'partition-pressure-retry-test-r2',
    service_type: 'partition',
    partition_id: 'partition-pressure-retry-test',
    node_id: 'node-peer',
    status: 'active',
    raft_role: 'follower',
    address: 'node-peer/partition/partition-pressure-retry-test-r2',
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
      filter(tableName, predicate) {
        if (tableName !== 'services' || typeof predicate !== 'function') {
          return [];
        }
        return [seededSafetyPeerRow].filter(predicate);
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

test('dispatchOperationInternal executes the claimed operation snapshot ' +
  'instead of the stale pending snapshot', async (t) => {
  const staleOperation = {
    operationId: 'priority-claimed-snapshot-op',
    type: 'REPLACE',
    partitionId: 'sql_transactions-p1',
    replicaId: 'sql_transactions-p1-r5',
    sourceNodeId: 'node-remote',
    targetNodeId: 'node-local',
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    entityType: 'partition',
    entityId: 'sql_transactions-p1',
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
      async executeAuthoritativeSystemTableRead() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
      async readAuthoritativeRows() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
      async executeQuery() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
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

  const owner = coordinator.workflowOwner;
  let claimedOperationSnapshot = null;
  let executedOperationSnapshot = null;
  owner.resolveDispatchOperation = async () => staleOperation;
  owner.repository.isOperationLocallyOwned = () => true;
  owner.repository.isReplaceRemoveDispatchPhase = () => false;
  owner.isCreateRearmDispatchPhase = () => false;
  owner.claimPendingDispatchOperation = async (operation) => {
    claimedOperationSnapshot = {
      ...operation,
      status: 'sending',
      workflowStep: WORKFLOW_STEP.SENDING,
    };
    return claimedOperationSnapshot;
  };
  owner.executeOperationInternal = async (operation) => {
    executedOperationSnapshot = operation;
    return {
      success: true,
      operationId: operation.operationId,
    };
  };

  try {
    const result =
      await owner.dispatchOperationInternal(staleOperation.operationId);

    t.equal(
      result?.success,
      true,
      'dispatch should continue after the pending operation is claimed',
    );
    t.equal(
      staleOperation.workflowStep,
      WORKFLOW_STEP.PENDING,
      'the stale snapshot should remain pending in the test harness',
    );
    t.equal(
      claimedOperationSnapshot?.workflowStep,
      WORKFLOW_STEP.SENDING,
      'claiming should produce a sending snapshot',
    );
    t.equal(
      executedOperationSnapshot,
      claimedOperationSnapshot,
      'execution should use the claimed snapshot rather than the stale pending one',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('dispatchOperationInternal rehydrates REPLACE source replica metadata ' +
  'from a caller-provided operation snapshot', async (t) => {
  const SOURCE_REPLICA_ID_METADATA_KEY = 'sourceReplicaId';
  const SOURCE_REPLICA_ID = 'sql_transactions-p1-r1';
  const TARGET_REPLICA_ID = 'sql_transactions-p1-r5';
  const staleOperation = {
    operationId: 'priority-source-replica-rehydration-op',
    type: 'REPLACE',
    partitionId: 'sql_transactions-p1',
    replicaId: TARGET_REPLICA_ID,
    sourceNodeId: 'node-remote',
    targetNodeId: 'node-local',
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    entityType: 'partition',
    entityId: 'sql_transactions-p1',
    stepsHistory: [{
      step: WORKFLOW_STEP.PENDING,
      timestamp: Date.now(),
      [SOURCE_REPLICA_ID_METADATA_KEY]: SOURCE_REPLICA_ID,
    }],
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
      async executeAuthoritativeSystemTableRead() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
      async readAuthoritativeRows() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
      async executeQuery() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
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

  const owner = coordinator.workflowOwner;
  let claimedOperationSnapshot = null;
  owner.repository.isOperationLocallyOwned = () => true;
  owner.repository.isReplaceRemoveDispatchPhase = () => false;
  owner.isCreateRearmDispatchPhase = () => false;
  owner.claimPendingDispatchOperation = async (operation) => {
    claimedOperationSnapshot = {
      ...operation,
      status: 'sending',
      workflowStep: WORKFLOW_STEP.SENDING,
    };
    return claimedOperationSnapshot;
  };
  owner.executeOperationInternal = async (operation) => ({
    success: true,
    operationId: operation.operationId,
  });

  try {
    const result = await owner.dispatchOperationInternal(staleOperation);

    t.equal(
      result?.success,
      true,
      'dispatch should continue after the pending operation is claimed',
    );
    t.equal(
      claimedOperationSnapshot?.sourceReplicaId,
      SOURCE_REPLICA_ID,
      'dispatch should restore the replace source replica id before claim',
    );
    t.equal(
      claimedOperationSnapshot?.replicaId,
      TARGET_REPLICA_ID,
      'dispatch should preserve the replacement replica id',
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
