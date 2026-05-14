/**
 * Unit tests for ReplicaDispatchService NODE_STATE_UPDATE handling.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
} from '../../src/control-plane/replica-dispatch-service-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  COLUMN,
  NODE_CAPABILITY,
  NUM,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const READY_NODE_CAPABILITIES = Object.freeze([
  NODE_CAPABILITY.PARTITION_REPLICA,
  NODE_CAPABILITY.MESSAGE_GROUP_REPLICA,
]);
const READY_NODE_CAPABILITIES_JSON = JSON.stringify(READY_NODE_CAPABILITIES);

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({logging: {level: 'error'}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createService(options = {}) {
  const cacheNode = options.cacheNode || null;
  const cacheNodes = Array.isArray(options.cacheNodes) ?
    options.cacheNodes :
    (cacheNode ? [cacheNode] : []);
  const cacheServices = Array.isArray(options.cacheServices) ?
    options.cacheServices :
    [];
  const cacheReplicaOperations = Array.isArray(options.cacheReplicaOperations) ?
    options.cacheReplicaOperations :
    [];
  const cacheByNodeId = new Map();
  for (const node of cacheNodes) {
    if (!node || !node.node_id) {
      continue;
    }
    cacheByNodeId.set(node.node_id, node);
  }
  const cdcIntegrationService = options.cdcIntegrationService;
  const controlPlaneReadinessService =
    options.controlPlaneReadinessService;
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    (cdcIntegrationService ? {
      updateSystemTableRow: (...args) =>
        cdcIntegrationService.updateSystemTableRow(...args),
      insertSystemTableRow: (...args) =>
        cdcIntegrationService.insertSystemTableRow?.(...args),
      upsertSystemTableRow: (...args) =>
        cdcIntegrationService.upsertSystemTableRow?.(...args),
      deleteSystemTableRow: (...args) =>
        cdcIntegrationService.deleteSystemTableRow?.(...args),
    } : null);
  const rebalanceCoordinator = options.rebalanceCoordinator || {
    executeOperation: async () => ({success: true}),
  };

  const service = new ReplicaDispatchService({
    nodeId: 'node-1',
    messageRouter: options.messageRouter || {},
    cdcIntegrationService,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService,
    operationDispatchQueueShardCount:
      options.operationDispatchQueueShardCount,
    nodeStateUpdateQueueShardCount: options.nodeStateUpdateQueueShardCount,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    nodeStateUpdateRetryAfterMs: options.nodeStateUpdateRetryAfterMs,
    operationDispatchRetryAfterMs: options.operationDispatchRetryAfterMs,
    dispatchReadinessRefreshTimeoutMs:
      options.dispatchReadinessRefreshTimeoutMs,
    systemTableCache: {
      get: (tableName, nodeId) => {
        if (tableName !== 'nodes') {
          return null;
        }
        return cacheByNodeId.get(nodeId) || null;
      },
      getAll: (tableName) => {
        if (tableName === 'replica_operations') {
          return cacheReplicaOperations;
        }
        if (tableName === 'services') {
          return cacheServices;
        }
        if (tableName === 'nodes') {
          return cacheNodes;
        }
        return [];
      },
    },
    rebalanceCoordinator,
  });
  service.initialize();
  return service;
}


test('ReplicaDispatchService ignores non-owner replica_operations cache rows',
  async (t) => {
    initEnv();

    const service = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
    });
    const enqueueCalls = [];
    const originalOperationDispatchQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(...args) {
        enqueueCalls.push(args);
      },
    };

    service.handleCdcApplied(null, {
      tableName: 'replica_operations',
      data: {
        operation_id: 'add-op-2',
        source_node_id: 'node-2',
        target_node_id: 'node-1',
        workflow_step: WORKFLOW_STEP.PENDING,
        type: OperationType.ADD,
      },
    });
    service.handleCacheNodeChange('replica_operations', 'INSERT', {
      operation_id: 'add-op-2',
      source_node_id: 'node-2',
      target_node_id: 'node-1',
      workflow_step: WORKFLOW_STEP.PENDING,
      type: OperationType.ADD,
    });

    t.equal(
      enqueueCalls.length,
      NUM.ZERO,
      'non-owner nodes must not enqueue replica operation dispatch work',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService bootstraps missing node rows from NODE_STATE_UPDATE ' +
  'payloads when startup registration visibility lags',
async (t) => {
  initEnv();

  const now = Date.now();
  const updates = [];
  const upserts = [];

  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, options) => {
        updates.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 0},
        };
      },
      upsertSystemTableRow: async (tableName, row, options) => {
        upserts.push({tableName, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-joiner',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8099',
    [ControlPlaneField.STATE]: STATE.CONNECTED,
    [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
    [ControlPlaneField.HEARTBEAT_AT]: now,
    [ControlPlaneField.NODE_ROW]: {
      [COLUMN.NODE_ID]: 'node-joiner',
      [COLUMN.NODE_ADDRESS]: 'localhost:8099',
      [COLUMN.CPU_CORES]: 8,
      [COLUMN.MEMORY_MB]: 16384,
      [COLUMN.DISK_GB]: 500,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.CREATED_AT]: now - 1000,
      [COLUMN.STORAGE_BUDGET_BYTES]: 107374182400,
      [COLUMN.STORAGE_BUDGET_SOURCE]: 'backfill',
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: now - 500,
    },
  });
  t.equal(updates.length, 1, 'attempts the canonical update path once');
  t.equal(
    upserts.length,
    1,
    'dispatch should bootstrap a missing node row from the node-state payload',
  );
  t.equal(
    upserts[0].row[COLUMN.STORAGE_BUDGET_BYTES],
    107374182400,
    'bootstrap upsert should preserve startup-owned storage budget fields',
  );

  service.stop();
});

test('ReplicaDispatchService bootstraps missing node rows from heartbeat-only ' +
  'NODE_STATE_UPDATE payloads with background write options',
async (t) => {
  initEnv();

  const now = Date.now();
  const updates = [];
  const upserts = [];

  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, options) => {
        updates.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 0},
        };
      },
      upsertSystemTableRow: async (tableName, row, options) => {
        upserts.push({tableName, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-joiner-heartbeat-only',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8100',
    [ControlPlaneField.STATE]: STATE.CONNECTED,
    [ControlPlaneField.HEARTBEAT_ONLY]: true,
    [ControlPlaneField.HEARTBEAT_AT]: now,
    [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
    [ControlPlaneField.NODE_ROW]: {
      [COLUMN.NODE_ID]: 'node-joiner-heartbeat-only',
      [COLUMN.NODE_ADDRESS]: 'localhost:8100',
      [COLUMN.CPU_CORES]: 16,
      [COLUMN.MEMORY_MB]: 32768,
      [COLUMN.DISK_GB]: 1000,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.CREATED_AT]: now - 1000,
      [COLUMN.STORAGE_BUDGET_BYTES]: 107374182400,
      [COLUMN.STORAGE_BUDGET_SOURCE]: 'backfill',
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: now - 500,
    },
  });

  t.equal(updates.length, 1, 'attempts the canonical update path once');
  t.equal(
    upserts.length,
    1,
    'dispatch should bootstrap a missing row even for heartbeat-only updates',
  );
  t.equal(
    upserts[0].options?.allowPressureDefer,
    true,
    'heartbeat-only bootstrap should be pressure-deferrable',
  );
  t.equal(
    upserts[0].options?.deliveryPriority,
    'background',
    'heartbeat-only bootstrap should use background write delivery',
  );
  t.equal(
    upserts[0].options?.workClass,
    'background',
    'heartbeat-only bootstrap should use background work class',
  );
  t.equal(
    upserts[0].row[COLUMN.CPU_CORES],
    undefined,
    'heartbeat-only bootstrap should not persist resource participation fields',
  );
  t.equal(
    upserts[0].row[COLUMN.STORAGE_BUDGET_BYTES],
    undefined,
    'heartbeat-only bootstrap should not persist storage budget fields',
  );

  service.stop();
});

test('ReplicaDispatchService NODE_STATE_UPDATE uses injected control-plane ' +
  'system-table gateway', async (t) => {
  initEnv();

  const gatewayCalls = [];
  const cacheNode = {
    node_id: 'node-gateway',
    node_address: 'localhost:8090',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    cpu_usage_percent: 10,
    memory_usage_percent: 20,
    disk_usage_percent: 30,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: Date.now() - 1000,
    ready_lease_expires_at: null,
    created_at: Date.now() - 10000,
  };

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        throw new Error('cdcIntegrationService should not handle node writes');
      },
      upsertSystemTableRow: async () => {
        throw new Error('cdcIntegrationService should not handle node writes');
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(tableName, whereClause, row, options) {
        gatewayCalls.push({
          method: 'updateSystemTableRow',
          tableName,
          whereClause,
          row,
          options,
        });
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async upsertSystemTableRow(tableName, row, options) {
        gatewayCalls.push({
          method: 'upsertSystemTableRow',
          tableName,
          row,
          options,
        });
        return {success: true};
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-gateway',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8090',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: Date.now(),
  });

  t.equal(gatewayCalls.length, 1, 'gateway should own the node-state write');
  t.equal(
    gatewayCalls[0].method,
    'updateSystemTableRow',
    'dispatch should route NODE_STATE_UPDATE through the gateway',
  );
  t.equal(
    gatewayCalls[0].tableName,
    'nodes',
    'dispatch gateway writes should target the nodes table',
  );

  service.stop();
});

test('ReplicaDispatchService defers transient NODE_STATE_UPDATE failures and ' +
  're-enqueues only the latest payload', async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  const now = Date.now();
  const cacheNode = {
    node_id: 'node-deferred',
    node_address: 'localhost:8091',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: now - 1000,
    ready_lease_expires_at: null,
    created_at: now - 10000,
  };
  const transientError = new Error('Connection to node seed closed');
  transientError.retryAfterMs = 123;

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      isTransientCdcError(message) {
        return message.includes('Connection to node');
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow() {
        throw transientError;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.nodeStateUpdateQueue;
  service.nodeStateUpdateQueue = {
    enqueue(nodeId, reason, context) {
      enqueues.push({nodeId, reason, context});
      return true;
    },
    shutdown() {},
  };
  service.nodeStateUpdateQueues = [service.nodeStateUpdateQueue];

  const initialPayload = {
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-deferred',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8091',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  };
  const newerPayload = {
    ...initialPayload,
    [ControlPlaneField.HEARTBEAT_AT]: now + 5000,
    [ControlPlaneField.READY_LEASE_EXPIRES_AT]: now + 65000,
  };

  await service.reconcileNodeStateUpdate('node-deferred', {
    payload: initialPayload,
  });

  t.equal(
    scheduled.length,
    1,
    'transient failure should arm one deferred retry timer',
  );
  t.equal(
    scheduled[0].delayMs,
    123,
    'deferred retry should honor retryAfterMs',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    1,
    'deferred retry slot should be retained until replay',
  );

  const enqueueResult = service.enqueueNodeStateUpdate(newerPayload);
  t.equal(
    enqueueResult,
    false,
    'new payload should merge into the deferred retry slot instead of queueing immediately',
  );
  t.equal(
    enqueues.length,
    0,
    'deferred retry slot should suppress immediate queue traffic',
  );

  scheduled[0].callback();

  t.equal(enqueues.length, 1, 'timer should re-enqueue one retry');
  t.same(
    enqueues[0],
    {
      nodeId: 'node-deferred',
      reason: RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
      context: {payload: newerPayload},
    },
    'deferred retry should publish the newest merged payload only once',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    0,
    'deferred retry slot should clear after re-enqueue',
  );

  service.nodeStateUpdateQueue = originalQueue;
  service.stop();
});

test('ReplicaDispatchService defers steady-heartbeat participant-failure ' +
  'NODE_STATE_UPDATE errors via shared control-plane classification',
async (t) => {
  initEnv();

  const scheduled = [];
  const now = Date.now();
  const cacheNode = {
    node_id: 'node-participant-failure',
    node_address: 'localhost:8091',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: now - 1000,
    ready_lease_expires_at: null,
    created_at: now - 10000,
  };
  const retryableError =
    new Error('Distributed operation failed due to participant failures');
  retryableError.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      isTransientCdcError() {
        return false;
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow() {
        throw retryableError;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  await service.reconcileNodeStateUpdate('node-participant-failure', {
    payload: {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-participant-failure',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8091',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_ONLY]: true,
      [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    },
  });

  t.equal(
    scheduled.length,
    1,
    'retryable participant failure should arm one deferred retry timer',
  );
  t.equal(
    scheduled[0].delayMs,
    service.nodeStateUpdateRetryAfterMs *
      NODE_STATE_UPDATE_RETRY_POLICY.PUBLICATION_PRESSURE_MIN_DELAY_MULTIPLIER,
    'retryable participant failure should use the bounded publication-pressure delay floor',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    1,
    'retryable participant failure should keep the latest payload queued for replay',
  );
  t.same(
    service.nodeStateUpdateRetryStateByNodeId.get(
      'node-participant-failure',
    ),
    {
      retryClass: NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE,
      failureCount: 1,
      retryAfterMs:
        service.nodeStateUpdateRetryAfterMs *
        NODE_STATE_UPDATE_RETRY_POLICY.PUBLICATION_PRESSURE_MIN_DELAY_MULTIPLIER,
      errorMessage:
        'Distributed operation failed due to participant failures',
    },
    'participant-failure retries should record one canonical publication-pressure retry state',
  );

  service.stop();
});

test('ReplicaDispatchService backs off repeated steady-heartbeat participant-failure ' +
  'NODE_STATE_UPDATE retries and keeps one deferred owner slot per node',
async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  const now = Date.now();
  const cacheNode = {
    node_id: 'node-participant-backoff',
    node_address: 'localhost:8091',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: now - 1000,
    ready_lease_expires_at: null,
    created_at: now - 10000,
  };
  const retryableError =
    new Error('Distributed operation failed due to participant failures');
  retryableError.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      isTransientCdcError() {
        return false;
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow() {
        throw retryableError;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.nodeStateUpdateQueue;
  service.nodeStateUpdateQueue = {
    enqueue(nodeId, reason, context) {
      enqueues.push({nodeId, reason, context});
      return true;
    },
    shutdown() {},
  };
  service.nodeStateUpdateQueues = [service.nodeStateUpdateQueue];

  const initialPayload = {
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-participant-backoff',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8091',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_ONLY]: true,
    [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  };
  const newerPayload = {
    ...initialPayload,
    [ControlPlaneField.HEARTBEAT_AT]: now + 5000,
    [ControlPlaneField.READY_LEASE_EXPIRES_AT]: now + 65000,
  };

  await service.reconcileNodeStateUpdate('node-participant-backoff', {
    payload: initialPayload,
  });

  const firstDelayMs =
    service.nodeStateUpdateRetryAfterMs *
    NODE_STATE_UPDATE_RETRY_POLICY.PUBLICATION_PRESSURE_MIN_DELAY_MULTIPLIER;
  t.equal(
    scheduled[0].delayMs,
    firstDelayMs,
    'first participant-failure retry should use the publication-pressure floor',
  );

  scheduled[0].callback();
  t.equal(
    enqueues.length,
    1,
    'first deferred retry should re-enter the owner queue once',
  );

  await service.reconcileNodeStateUpdate(
    'node-participant-backoff',
    enqueues[0].context,
  );

  t.equal(
    scheduled[1].delayMs,
    firstDelayMs * NODE_STATE_UPDATE_RETRY_POLICY.BACKOFF_MULTIPLIER,
    'second participant-failure retry should back off through the same owner state',
  );
  t.same(
    service.nodeStateUpdateRetryStateByNodeId.get(
      'node-participant-backoff',
    ),
    {
      retryClass: NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE,
      failureCount: 2,
      retryAfterMs:
        firstDelayMs *
        NODE_STATE_UPDATE_RETRY_POLICY.BACKOFF_MULTIPLIER,
      errorMessage:
        'Distributed operation failed due to participant failures',
    },
    'retry state should preserve failure streak across replay attempts',
  );

  const enqueueResult = service.enqueueNodeStateUpdate(newerPayload);
  t.equal(
    enqueueResult,
    false,
    'newer payload should merge into the existing deferred owner slot during backoff',
  );

  scheduled[1].callback();
  t.same(
    enqueues[1],
    {
      nodeId: 'node-participant-backoff',
      reason: RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
      context: {payload: newerPayload},
    },
    'deferred replay should publish the newest payload after backoff merging',
  );

  service.nodeStateUpdateQueue = originalQueue;
  service.stop();
});

test('ReplicaDispatchService defers retryable replica operation dispatch ' +
  'failures back onto the owner queue', async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  const now = Date.now();
  const retryableError =
    new Error('Transaction already active on this partition');
  retryableError.retryAfterMs = 123;
  const operationRow = {
    operation_id: 'op-retryable-dispatch-1',
    type: OperationType.ADD,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: now,
    updated_at: now,
    steps_history: '[]',
  };

  let dispatchCalls = 0;
  const service = createService({
    cacheNodes: [{
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: READY_NODE_CAPABILITIES_JSON,
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
    }],
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        throw retryableError;
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      enqueues.push({operationId, reason, context});
      return true;
    },
    shutdown() {},
  };

  try {
    await service.reconcileOperationDispatch(
      operationRow.operation_id,
      {row: operationRow},
    );

    t.equal(
      dispatchCalls,
      1,
      'dispatch should attempt the operation once before deferring',
    );
    t.equal(
      scheduled.length,
      1,
      'retryable dispatch failure should arm one deferred retry timer',
    );
    t.equal(
      scheduled[0].delayMs,
      123,
      'retryable dispatch deferral should honor retryAfterMs',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'deferred retry state should be retained until the timer fires',
    );

    scheduled[0].callback();

    t.same(
      enqueues,
      [{
        operationId: operationRow.operation_id,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {row: operationRow},
      }],
      'deferred retry should re-enter the canonical operation owner queue with the last dispatch row',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      0,
      'deferred retry state should clear after re-enqueue',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test('ReplicaDispatchService defers one retry when dispatch wake-up arrives ' +
  'before the authoritative operation row is visible',
async (t) => {
  initEnv();

  const scheduled = [];
  const now = Date.now();
  const operationRow = {
    operation_id: 'op-dispatch-visibility-lag-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: now,
    updated_at: now,
    steps_history: '[]',
  };
  let dispatchCalls = 0;
  let authoritativeReadCalls = 0;

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date(now).toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
    },
    rebalanceCoordinator: {
      repository: {
        async queryAuthoritativeOperationById() {
          authoritativeReadCalls += 1;
          return null;
        },
      },
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: false};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'dispatch should still attempt the coordinator owner path once',
    );
    t.equal(
      authoritativeReadCalls,
      1,
      'dispatch should consult the authoritative operation row before dropping one unsuccessful wake-up',
    );
    t.equal(
      scheduled.length,
      1,
      'visibility lag should arm one deferred retry instead of recording a terminal dispatch failure',
    );
    t.equal(
      scheduled[0].delayMs,
      service.operationDispatchRetryAfterMs,
      'visibility-lag retry should honor the operation dispatch retry budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'the deferred retry state should retain the direct wake-up row until visibility converges',
    );
    t.equal(
      service.dispatchFailureSignaturesByOperationId.size,
      NUM.ZERO,
      'visibility lag should not record one dropped dispatch failure signature',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService preserves canonical visibility retry metadata ' +
  'when authoritative dispatch visibility lags',
async (t) => {
  initEnv();

  const OPERATION_ID = 'op-dispatch-visibility-fallback-1';
  const ORIGINAL_RETRY_DELAY_MS = 1000;
  const CANONICAL_RETRY_DELAY_MS = 125;
  const originalOperationRow = {
    operation_id: OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: 'sql_transactions-p1',
    replica_id: 'sql_transactions-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now() - 1000,
    updated_at: Date.now(),
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    entity_type: 'partition',
    entity_id: 'sql_transactions-p1',
  };
  const visibilityFallbackOperation = {
    operationId: OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: 'sql_transactions-p1',
    entityType: 'partition',
    entityId: 'sql_transactions-p1',
    replicaId: 'sql_transactions-p1-r4',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: originalOperationRow.created_at,
    updatedAt: originalOperationRow.updated_at + 25,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [{
      step: WORKFLOW_STEP.PENDING,
      timestamp: originalOperationRow.updated_at,
      sourceReplicaId: 'sql_transactions-p1-r1',
    }],
  };
  let dispatchCalls = 0;
  let authoritativeReadCalls = 0;
  let visibilityObservationCalls = 0;
  const scheduled = [];

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date(originalOperationRow.updated_at).toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
    },
    operationDispatchRetryAfterMs: ORIGINAL_RETRY_DELAY_MS,
    rebalanceCoordinator: {
      repository: {
        async queryAuthoritativeOperationById() {
          authoritativeReadCalls += 1;
          return null;
        },
        async getOperationByIdVisibilityObservation(observedOperationId) {
          visibilityObservationCalls += 1;
          t.equal(
            observedOperationId,
            OPERATION_ID,
            'visibility recovery should query the same operation id',
          );
          return {
            operation: {...visibilityFallbackOperation},
            deferredOutcome: {
              retryAfterMs: CANONICAL_RETRY_DELAY_MS,
            },
          };
        },
      },
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: false};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  try {
    await service.dispatchOperationRow(originalOperationRow);

    t.equal(
      dispatchCalls,
      1,
      'dispatch should still attempt the coordinator owner path once',
    );
    t.equal(
      visibilityObservationCalls,
      1,
      'visibility recovery should consult the canonical repository visibility observation',
    );
    t.equal(
      authoritativeReadCalls,
      0,
      'canonical visibility recovery should replace the raw authoritative row miss path when available',
    );
    t.equal(
      scheduled.length,
      1,
      'visibility recovery should still arm one deferred retry',
    );
    t.equal(
      scheduled[0].delayMs,
      CANONICAL_RETRY_DELAY_MS,
      'the deferred retry should honor the canonical visibility retry delay',
    );
    t.equal(
      service.operationDispatchDeferredRetries.get(OPERATION_ID)?.row
        ?.steps_history,
      JSON.stringify(visibilityFallbackOperation.stepsHistory),
      'the deferred retry should retain the canonical visibility fallback row, not the stale wake-up payload',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService suppresses stale dispatch failures when the ' +
  'authoritative operation row already advanced',
async (t) => {
  initEnv();

  const staleUpdatedAt = Date.now();
  const operationId = 'op-dispatch-authoritative-advance-1';
  const AUTHORITATIVE_ADVANCED_STATUS = 'failed';
  const operationRow = {
    operation_id: operationId,
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: staleUpdatedAt - 1000,
    updated_at: staleUpdatedAt,
    steps_history: '[]',
  };
  const authoritativeOperation = {
    operationId,
    type: OperationType.REPLACE,
    partitionId: 'replica_operations-p1',
    entityType: 'partition',
    entityId: 'replica_operations-p1',
    replicaId: 'replica_operations-p1-r4',
    sourceNodeId: 'node-2',
    targetNodeId: 'node-1',
    status: AUTHORITATIVE_ADVANCED_STATUS,
    workflowStep: WORKFLOW_STEP.FAILED,
    createdAt: staleUpdatedAt - 1000,
    updatedAt: staleUpdatedAt + 500,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
  };
  const OPERATION_NOT_DISPATCHABLE_REASON = 'operation_not_dispatchable';
  let dispatchCalls = 0;
  let authoritativeReadCalls = 0;
  const scheduled = [];

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date(staleUpdatedAt).toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
    },
    rebalanceCoordinator: {
      repository: {
        async queryAuthoritativeOperationById(observedOperationId) {
          authoritativeReadCalls += 1;
          t.equal(
            observedOperationId,
            operationId,
            'authoritative suppression should inspect the same operation id',
          );
          return {...authoritativeOperation};
        },
      },
      async dispatchOperation() {
        dispatchCalls += 1;
        return {
          success: false,
          skipped: true,
          reason: OPERATION_NOT_DISPATCHABLE_REASON,
        };
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'dispatch should still attempt one owner-lane execution against the queued stale row',
    );
    t.equal(
      authoritativeReadCalls,
      1,
      'stale-row suppression should read the authoritative operation row once',
    );
    t.equal(
      scheduled.length,
      NUM.ZERO,
      'authoritative progression should not arm another deferred retry',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'authoritative progression should clear any deferred dispatch retry state',
    );
    t.equal(
      service.dispatchFailureSignaturesByOperationId.size,
      NUM.ZERO,
      'authoritative progression should not record a generic dispatch failure signature',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService retries SENDING operations for ready target nodes',
  async (t) => {
    initEnv();

    const now = Date.now();
    const enqueueCalls = [];
    const readyNode = {
      node_id: 'node-1',
      node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: READY_NODE_CAPABILITIES_JSON,
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
      created_at: now - 5000,
    };
    const service = createService({
      cacheNodes: [readyNode],
      cacheReplicaOperations: [{
        operation_id: 'replace-op-ready-sending-1',
        partition_id: 'control_plane_publications-p1',
        source_node_id: 'node-2',
        target_node_id: 'node-1',
        workflow_step: WORKFLOW_STEP.SENDING,
        type: OperationType.REPLACE,
      }],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
          };
        },
      },
      rebalanceCoordinator: {
        resolveOperationOwnerNodeId(operation) {
          if (operation?.type === OperationType.REPLACE &&
              operation?.partition_id === 'control_plane_publications-p1') {
            return operation.target_node_id;
          }
          return operation?.source_node_id || null;
        },
      },
    });
    const originalQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(...args) {
        enqueueCalls.push(args);
        return true;
      },
      shutdown() {},
    };

    try {
      const retried = await service.retryPendingDispatchesForReadyNode({
        nodeId: 'node-1',
        nodeRow: readyNode,
      });

      t.equal(retried, true, 'ready-node retry should run for ready targets');
      t.same(
        enqueueCalls,
        [[
          'replace-op-ready-sending-1',
          RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
          {
            row: {
              operation_id: 'replace-op-ready-sending-1',
              partition_id: 'control_plane_publications-p1',
              source_node_id: 'node-2',
              target_node_id: 'node-1',
              workflow_step: WORKFLOW_STEP.SENDING,
              type: OperationType.REPLACE,
            },
            readyNodeId: 'node-1',
            readyNodeRow: readyNode,
          },
        ]],
        'ready-node retries should re-enter locally owned SENDING operations',
      );
    } finally {
      service.operationDispatchQueue = originalQueue;
      service.stop();
    }
  });

test('ReplicaDispatchService retries CREATING system-table operations for ' +
  'ready target nodes',
async (t) => {
  initEnv();

  const READY_TARGET_NODE_ID = 'node-1';
  const SOURCE_NODE_ID = 'node-2';
  const OPERATION_ID = 'replace-op-ready-creating-1';
  const PARTITION_ID = 'sql_write_operations-p1';
  const REPLICA_ID = 'sql_write_operations-p1-r5';
  const OPERATION_STATUS = 'creating';
  const now = Date.now();
  const enqueueCalls = [];
  const readyNode = {
    node_id: READY_TARGET_NODE_ID,
    node_address: 'localhost:8081',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: now,
    ready_lease_expires_at: now + 30000,
    created_at: now - 5000,
  };
  const operationRow = {
    operation_id: OPERATION_ID,
    partition_id: PARTITION_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: READY_TARGET_NODE_ID,
    replica_id: REPLICA_ID,
    status: OPERATION_STATUS,
    workflow_step: WORKFLOW_STEP.CREATING,
    type: OperationType.REPLACE,
  };
  const service = createService({
    cacheNodes: [readyNode],
    cacheReplicaOperations: [operationRow],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        if (
          operation?.type === OperationType.REPLACE &&
          operation?.partition_id === PARTITION_ID
        ) {
          return operation.target_node_id;
        }
        return operation?.source_node_id || null;
      },
    },
  });
  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(...args) {
      enqueueCalls.push(args);
      return true;
    },
    shutdown() {},
  };

  try {
    const retried = await service.retryPendingDispatchesForReadyNode({
      nodeId: READY_TARGET_NODE_ID,
      nodeRow: readyNode,
    });

    t.equal(
      retried,
      true,
      'ready-node retry should run for CREATING target rearm rows',
    );
    t.same(
      enqueueCalls,
      [[
        OPERATION_ID,
        RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
        {
          row: operationRow,
          readyNodeId: READY_TARGET_NODE_ID,
          readyNodeRow: readyNode,
        },
      ]],
      'ready-node retries should re-enter target-owned CREATING system-table operations',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test('ReplicaDispatchService retries ACTIVE priority REPLACE source-removal ' +
  'operations for ready source nodes',
async (t) => {
  initEnv();

  const READY_SOURCE_NODE_ID = 'node-2';
  const OWNER_NODE_ID = 'node-1';
  const OPERATION_ID = 'replace-op-ready-active-1';
  const PARTITION_ID = 'control_plane_publications-p1';
  const now = Date.now();
  const enqueueCalls = [];
  const readyNode = {
    node_id: READY_SOURCE_NODE_ID,
    node_address: 'localhost:8082',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: now,
    ready_lease_expires_at: now + 30000,
    created_at: now - 5000,
  };
  const service = createService({
    cacheNodes: [readyNode],
    cacheReplicaOperations: [{
      operation_id: OPERATION_ID,
      partition_id: PARTITION_ID,
      source_node_id: READY_SOURCE_NODE_ID,
      target_node_id: OWNER_NODE_ID,
      workflow_step: WORKFLOW_STEP.ACTIVE,
      type: OperationType.REPLACE,
    }],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        if (operation?.type === OperationType.REPLACE &&
              operation?.partition_id === PARTITION_ID) {
          return operation.target_node_id;
        }
        return operation?.source_node_id || null;
      },
    },
  });
  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(...args) {
      enqueueCalls.push(args);
      return true;
    },
    shutdown() {},
  };

  try {
    const retried = await service.retryPendingDispatchesForReadyNode({
      nodeId: READY_SOURCE_NODE_ID,
      nodeRow: readyNode,
    });

    t.equal(
      retried,
      true,
      'ready-node retry should run for ready source-removal nodes',
    );
    t.same(
      enqueueCalls,
      [[
        OPERATION_ID,
        RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
        {
          row: {
            operation_id: OPERATION_ID,
            partition_id: PARTITION_ID,
            source_node_id: READY_SOURCE_NODE_ID,
            target_node_id: OWNER_NODE_ID,
            workflow_step: WORKFLOW_STEP.ACTIVE,
            type: OperationType.REPLACE,
          },
          readyNodeId: READY_SOURCE_NODE_ID,
          readyNodeRow: readyNode,
        },
      ]],
      'ready-node retries should re-enter locally owned ACTIVE source-removal operations',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test('ReplicaDispatchService retries ACTIVE priority REPLACE source-removal ' +
  'operations for ready owner nodes',
async (t) => {
  initEnv();

  const READY_OWNER_NODE_ID = 'node-1';
  const SOURCE_NODE_ID = 'node-2';
  const OPERATION_ID = 'replace-op-ready-active-owner-1';
  const PARTITION_ID = 'control_plane_publications-p1';
  const now = Date.now();
  const enqueueCalls = [];
  const readyNode = {
    node_id: READY_OWNER_NODE_ID,
    node_address: 'localhost:8081',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: now,
    ready_lease_expires_at: now + 30000,
    created_at: now - 5000,
  };
  const operationRow = {
    operation_id: OPERATION_ID,
    partition_id: PARTITION_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: READY_OWNER_NODE_ID,
    workflow_step: WORKFLOW_STEP.ACTIVE,
    type: OperationType.REPLACE,
  };
  const service = createService({
    cacheNodes: [readyNode],
    cacheReplicaOperations: [operationRow],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        if (operation?.type === OperationType.REPLACE &&
              operation?.partition_id === PARTITION_ID) {
          return operation.target_node_id;
        }
        return operation?.source_node_id || null;
      },
    },
  });
  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(...args) {
      enqueueCalls.push(args);
      return true;
    },
    shutdown() {},
  };

  try {
    const retried = await service.retryPendingDispatchesForReadyNode({
      nodeId: READY_OWNER_NODE_ID,
      nodeRow: readyNode,
    });

    t.equal(
      retried,
      true,
      'ready-node retry should run for ready owner nodes',
    );
    t.same(
      enqueueCalls,
      [[
        OPERATION_ID,
        RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
        {
          row: operationRow,
          readyNodeId: READY_OWNER_NODE_ID,
          readyNodeRow: readyNode,
        },
      ]],
      'ready owner retries should re-enter target-owned ACTIVE source-removal operations',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});
