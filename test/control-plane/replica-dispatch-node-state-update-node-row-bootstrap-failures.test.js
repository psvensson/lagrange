/**
 * Unit tests for ReplicaDispatchService NODE_STATE_UPDATE handling.
 */

import {test} from '../../src/test-helpers/tap.js';
import {registerReplicaDispatchNodeStateOperationDispatchRetryTests} from
  './replica-dispatch-node-state-operation-dispatch-retry-test-cases.js';
import {
  createService,
  initEnv,
  READY_NODE_CAPABILITIES_JSON,
} from './replica-dispatch-node-state-update-test-support.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
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
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

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
      0,
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

registerReplicaDispatchNodeStateOperationDispatchRetryTests({
  createService,
  initEnv,
  READY_NODE_CAPABILITIES_JSON,
});
