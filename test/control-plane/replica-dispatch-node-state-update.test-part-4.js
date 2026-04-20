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
  SYSTEM_TABLE_NAME,
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
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  COLUMN,
  NUM,
  TYPEOF,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

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

const TEST_MEMBERSHIP_PUBLICATION_STATUS = Object.freeze({
  ACK_PENDING: 'ACK_PENDING',
  OPEN: 'OPEN',
  PUBLISHED: 'PUBLISHED',
});

test('ReplicaDispatchService replays SENDING rows through the canonical ' +
  'dispatch owner path',
async (t) => {
  initEnv();

  const now = Date.now();
  const readyNode = {
    node_id: 'node-1',
    node_address: 'localhost:8081',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    capabilities: '[]',
    last_heartbeat: now,
    ready_lease_expires_at: now + 30000,
    created_at: now - 5000,
  };
  const dispatchCalls = [];
  const operationRow = {
    operation_id: 'replace-op-dispatch-sending-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.SENDING,
    type: OperationType.REPLACE,
    steps_history: '[]',
    created_at: now - 1000,
    updated_at: now - 500,
  };

  const service = createService({
    cacheNodes: [readyNode],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation);
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return operation?.target_node_id === 'node-1' ||
          operation?.targetNodeId === 'node-1';
      },
    },
  });

  try {
    await service.reconcileOperationDispatch(
      operationRow.operation_id,
      {row: operationRow},
    );

    t.equal(
      dispatchCalls.length,
      1,
      'reconcile should replay SENDING rows instead of dropping them',
    );
    t.equal(
      dispatchCalls[0]?.operationId,
      operationRow.operation_id,
      'replayed dispatch should preserve the operation id',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService ignores remote-owned dispatch rows before ' +
  'readiness gating', async (t) => {
  initEnv();

  const scheduled = [];
  let readinessChecks = 0;
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-remote-owned-dispatch-1',
    type: OperationType.ADD,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-remote-owner',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        readinessChecks += 1;
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return false;
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
      readinessChecks,
      NUM.ZERO,
      'remote-owned rows should skip readiness evaluation entirely',
    );
    t.equal(
      dispatchCalls,
      NUM.ZERO,
      'remote-owned rows should not reach coordinator dispatch',
    );
    t.equal(
      scheduled.length,
      NUM.ZERO,
      'remote-owned rows should not arm deferred retries',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService defers not-ready dispatches back onto the ' +
  'owner queue', async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-target-not-ready-dispatch-1',
    type: OperationType.ADD,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          retryAfterMs: 123,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: [{code: 'control_plane_publication_pending'}],
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
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
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      NUM.ZERO,
      'not-ready targets should not dispatch inline',
    );
    t.equal(
      scheduled.length,
      1,
      'not-ready targets should arm one deferred retry timer',
    );
    t.equal(
      scheduled[0].delayMs,
      123,
      'not-ready target retries should honor readiness retryAfterMs',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'deferred retry state should be retained until the retry fires',
    );

    scheduled[0].callback();

    t.same(
      enqueues,
      [{
        operationId: operationRow.operation_id,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {row: operationRow},
      }],
      'deferred target-not-ready retry should re-enter the canonical owner lane with the dispatch row',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'deferred retry state should clear after re-enqueue',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test('ReplicaDispatchService uses authoritative readiness before dispatching',
  async (t) => {
    initEnv();

    const scheduled = [];
    const authoritativeCalls = [];
    let dispatchCalls = 0;
    const operationRow = {
      operation_id: 'op-authoritative-readiness-dispatch-1',
      type: OperationType.REPLACE,
      partition_id: 'replica_operations-p1',
      replica_id: 'replica_operations-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: Date.now(),
      updated_at: Date.now(),
      steps_history: '[]',
    };

    const service = createService({
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
        async getNodeReadiness(nodeId, options) {
          authoritativeCalls.push({nodeId, options});
          return {
            nodeId,
            retryAfterMs: 321,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
            },
            reasons: [{code: 'control_plane_publication_pending'}],
          };
        },
      },
      rebalanceCoordinator: {
        async dispatchOperation() {
          dispatchCalls += 1;
          return {success: true};
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
        NUM.ZERO,
        'authoritative ineligible readiness should block inline dispatch',
      );
      t.equal(
        authoritativeCalls.length,
        1,
        'dispatch readiness should refresh through the authoritative path',
      );
      t.same(
        authoritativeCalls[0],
        {
          nodeId: 'node-2',
          options: {
            allowAuthoritativeRefresh: true,
            decisionDimension:
              CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE,
            maxCachedAgeMs: NUM.ZERO,
          },
        },
        'authoritative dispatch readiness should bypass cached snapshots',
      );
      t.equal(
        scheduled.length,
        2,
        'authoritative ineligible readiness should arm the bounded refresh guard and one deferred retry timer',
      );
      t.equal(
        scheduled[0].delayMs,
        service.dispatchReadinessRefreshTimeoutMs,
        'dispatch should first arm the bounded authoritative readiness timeout',
      );
      t.equal(
        scheduled[1].delayMs,
        321,
        'authoritative readiness retryAfterMs should still drive the deferred dispatch retry',
      );
      t.equal(
        service.operationDispatchDeferredRetries.size,
        1,
        'authoritative readiness failures should remain queued for retry',
      );
    } finally {
      service.stop();
    }
  });

test('ReplicaDispatchService defers dispatch when authoritative readiness ' +
  'refresh fails', async (t) => {
  initEnv();

  const scheduled = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-error-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: ['sync_snapshot_not_recovery_eligible'],
        };
      },
      async getNodeReadiness() {
        const error = new Error('authoritative_row_source_unavailable');
        error.retryAfterMs = 222;
        throw error;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
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
      NUM.ZERO,
      'readiness refresh failures should not dispatch inline',
    );
    t.equal(
      scheduled.length,
      2,
      'readiness refresh failures should arm the bounded refresh guard and one deferred retry timer',
    );
    t.equal(
      scheduled[0].delayMs,
      service.dispatchReadinessRefreshTimeoutMs,
      'readiness refresh should first arm the bounded authoritative timeout',
    );
    t.equal(
      scheduled[1].delayMs,
      222,
      'retryable readiness refresh failures should reuse retryAfterMs for the deferred dispatch retry',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'readiness refresh failures should stay on the owner retry queue',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService dispatches same-node operations through the ' +
  'local handler capability snapshot', async (t) => {
  initEnv();

  const LOCAL_NODE_ID = 'node-1';
  const LOCAL_PARTITION_ID = 'split-child-p1';
  const LOCAL_REPLICA_ID = 'split-child-p1-r1';
  const LOCAL_OPERATION_ID = 'op-local-handler-ready-1';
  const LOCAL_SERVICE_ID = 'partition-service-local-1';
  const LOCAL_ENTITY_TYPE = 'partition';
  const LOCAL_READY_REASON = 'control_plane_publication_pending';

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: LOCAL_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: LOCAL_PARTITION_ID,
    replica_id: LOCAL_REPLICA_ID,
    source_node_id: LOCAL_NODE_ID,
    target_node_id: LOCAL_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.SENDING,
    entity_type: LOCAL_ENTITY_TYPE,
    entity_id: LOCAL_PARTITION_ID,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cacheServices: [
      {
        service_id: LOCAL_SERVICE_ID,
        node_id: LOCAL_NODE_ID,
        partition_id: 'services-p1',
        service_type: LOCAL_ENTITY_TYPE,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: [{code: LOCAL_READY_REASON}],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        return {
          nodeId,
          retryAfterMs: 321,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: [{code: LOCAL_READY_REASON}],
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
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
      'same-node dispatch should proceed when the local handler capability is already active',
    );
    t.equal(
      authoritativeCalls.length,
      0,
      'same-node local-handler dispatch should not perform an authoritative readiness refresh',
    );
    t.equal(
      scheduled.length,
      0,
      'same-node local-handler dispatch should not arm deferred readiness retries',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'same-node local-handler dispatch should not remain queued for retry',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService falls back to ready sync recovery evidence ' +
  'when authoritative refresh times out', async (t) => {
  initEnv();

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-timeout-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        const error = new Error('Message timeout while refreshing readiness');
        error.retryAfterMs = 111;
        throw error;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
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
      'retryable authoritative refresh timeouts should reuse ready sync recovery evidence',
    );
    t.equal(
      authoritativeCalls.length,
      1,
      'dispatch should still attempt authoritative readiness refresh first',
    );
    t.equal(
      scheduled.length,
      1,
      'sync fallback should only arm the bounded authoritative refresh guard',
    );
    t.equal(
      scheduled[0].delayMs,
      service.dispatchReadinessRefreshTimeoutMs,
      'sync fallback should use the bounded authoritative refresh budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'sync fallback should not leave a deferred dispatch retry behind',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService falls back to ready sync recovery evidence ' +
  'for retryable authoritative refresh failures', async (t) => {
  initEnv();

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-retryable-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r5',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        const error = new Error(
          'control_plane_pressure_degraded while refreshing readiness',
        );
        error.retryAfterMs = 111;
        throw error;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
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
      'retryable authoritative refresh failures should reuse ready sync recovery evidence',
    );
    t.equal(
      authoritativeCalls.length,
      1,
      'dispatch should still attempt authoritative readiness refresh first',
    );
    t.equal(
      scheduled.length,
      1,
      'sync fallback should only arm the bounded authoritative refresh guard for retryable failures',
    );
    t.equal(
      scheduled[0].delayMs,
      service.dispatchReadinessRefreshTimeoutMs,
      'retryable sync fallback should use the bounded authoritative refresh budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'sync fallback should not leave a deferred dispatch retry behind',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService falls back to ready sync recovery evidence ' +
  'when authoritative refresh never resolves promptly', async (t) => {
  initEnv();

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-hung-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r6',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    dispatchReadinessRefreshTimeoutMs: 25,
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        return new Promise(() => {});
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {delayMs, cleared: false};
      scheduled.push(handle);
      Promise.resolve().then(() => {
        if (!handle.cleared) {
          callback();
        }
      });
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'hung authoritative refreshes should fall back to ready sync recovery evidence',
    );
    t.equal(
      authoritativeCalls.length,
      1,
      'dispatch should still attempt one authoritative refresh before timing out',
    );
    t.equal(
      scheduled.length,
      1,
      'bounded authoritative refresh should arm one timeout guard',
    );
    t.equal(
      scheduled[0].delayMs,
      25,
      'timeout guard should honor the configured dispatch readiness refresh budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'sync fallback should not leave a deferred dispatch retry behind when readiness is already satisfied',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService defers retry when authoritative readiness ' +
  'refresh never resolves and sync readiness is still ineligible',
async (t) => {
  initEnv();

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-hung-ineligible-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r7',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    dispatchReadinessRefreshTimeoutMs: 25,
    operationDispatchRetryAfterMs: 75,
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: ['priority_spread_pending'],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        return new Promise(() => {});
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {delayMs, cleared: false};
      scheduled.push(handle);
      if (delayMs === 25) {
        Promise.resolve().then(() => {
          if (!handle.cleared) {
            callback();
          }
        });
      }
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      0,
      'hung authoritative refreshes must not dispatch when sync readiness is still ineligible',
    );
    t.equal(
      authoritativeCalls.length,
      1,
      'dispatch should still attempt one authoritative refresh before deferring',
    );
    t.equal(
      scheduled.length,
      2,
      'bounded refresh should time out once and then arm one deferred dispatch retry',
    );
    t.equal(
      scheduled[0].delayMs,
      25,
      'the first timer should be the bounded readiness refresh timeout',
    );
    t.equal(
      scheduled[1].delayMs,
      75,
      'the deferred retry should honor the dispatch retry-after budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'ineligible sync readiness should stay on the deferred dispatch retry lane',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService sends direct remote wake-up for target-owned ' +
  'coordinator-created operations', async (t) => {
  initEnv();

  const deliveries = [];
  const service = createService({
    messageRouter: {
      async deliver(address, payload) {
        deliveries.push({address, payload});
        return {acknowledged: true};
      },
    },
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        return {success: true};
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
  });

  try {
    await service.handleCoordinatorOperationCreated({
      operationId: 'op-remote-owned-create-1',
      partitionId: 'control_plane_publications-p1',
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stepsHistory: [],
    });

    t.same(
      deliveries,
      [{
        address: 'node-2/service/replica-dispatch',
        payload: {
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: 'op-remote-owned-create-1',
          [ControlPlaneField.OPERATION_ROW]: {
            operation_id: 'op-remote-owned-create-1',
            type: OperationType.REPLACE,
            partition_id: 'control_plane_publications-p1',
            replica_id: undefined,
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            status: undefined,
            workflow_step: WORKFLOW_STEP.PENDING,
            created_at: deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.created_at,
            updated_at: deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.updated_at,
            completed_at: undefined,
            error_message: undefined,
            steps_history: '[]',
            entity_type: undefined,
            entity_id: undefined,
          },
        },
      }],
      'remote-owned coordinator creates should wake the target owner directly',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService registers a direct dispatch wake-up handler',
  async (t) => {
    initEnv();

    const registrations = [];
    const unregistrations = [];
    const service = createService({
      messageRouter: {
        register(address, handler) {
          registrations.push({address, handler});
        },
        unregister(address) {
          unregistrations.push(address);
        },
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
    });
    const enqueues = [];
    const originalQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(operationId, reason, context) {
        enqueues.push({operationId, reason, context});
      },
      shutdown() {},
    };

    try {
      t.equal(
        registrations.length,
        1,
        'dispatch service should register one direct wake-up handler',
      );
      t.equal(
        registrations[0].address,
        'node-1/service/replica-dispatch',
        'dispatch service should register on the local service address',
      );

      await registrations[0].handler({
        payload: {
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: 'op-direct-wakeup-1',
          [ControlPlaneField.OPERATION_ROW]: {
            operation_id: 'op-direct-wakeup-1',
            partition_id: 'control_plane_publications-p1',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            workflow_step: WORKFLOW_STEP.PENDING,
            type: OperationType.REPLACE,
          },
        },
      });

      t.same(
        enqueues,
        [{
          operationId: 'op-direct-wakeup-1',
          reason: RECONCILE_REASON.MESSAGE_DISPATCH_REQUEST,
          context: {
            row: {
              operation_id: 'op-direct-wakeup-1',
              partition_id: 'control_plane_publications-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              workflow_step: WORKFLOW_STEP.PENDING,
              type: OperationType.REPLACE,
            },
          },
        }],
        'direct wake-up handler should enqueue the target operation',
      );
    } finally {
      service.operationDispatchQueue = originalQueue;
      service.stop();
    }

    t.same(
      unregistrations,
      ['node-1/service/replica-dispatch'],
      'dispatch service should unregister the direct wake-up handler on stop',
    );
  });
