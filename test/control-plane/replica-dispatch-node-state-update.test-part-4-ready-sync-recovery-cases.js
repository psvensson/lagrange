import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  NUM,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update.test-part-4-fixtures.js';

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

test('ReplicaDispatchService trusts router-registered same-node handler ' +
  'capability before service-row activation', async (t) => {
  initEnv();

  const LOCAL_NODE_ID = 'node-1';
  const LOCAL_PARTITION_ID = 'split-child-p2';
  const LOCAL_REPLICA_ID = 'split-child-p2-r1';
  const LOCAL_OPERATION_ID = 'op-local-handler-router-ready-1';
  const LOCAL_ENTITY_TYPE = 'partition';
  const LOCAL_HANDLER_ADDRESS = 'node-1/service/replica-handler';
  const LOCAL_READY_REASON = 'control_plane_publication_pending';

  const authoritativeCalls = [];
  const routerRegistrationChecks = [];
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
    messageRouter: {
      isRegistered(address) {
        routerRegistrationChecks.push(address);
        return address === LOCAL_HANDLER_ADDRESS;
      },
    },
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
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'same-node dispatch should proceed when the router already owns the local handler capability',
    );
    t.same(
      routerRegistrationChecks,
      [LOCAL_HANDLER_ADDRESS],
      'same-node dispatch should consult the canonical local handler address once',
    );
    t.equal(
      authoritativeCalls.length,
      0,
      'router-registered local capability should bypass authoritative readiness refreshes',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'router-registered local capability should not leave the operation parked for retry',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService ready-node retries reuse ready sync evidence ' +
  'instead of forcing a second authoritative refresh', async (t) => {
  initEnv();

  const readyNode = {
    node_id: 'node-2',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: Date.now(),
    ready_lease_expires_at: Date.now() + 60000,
  };
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-ready-trigger-sync-reuse-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r8',
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
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: [{code: 'should_not_run'}],
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
  });

  try {
    await service.dispatchOperationRow(operationRow, {
      readyNodeId: 'node-2',
      readyNodeRow: readyNode,
    });

    t.equal(
      dispatchCalls,
      1,
      'ready-node retries should proceed from the already-observed ready sync evidence',
    );
    t.equal(
      authoritativeCalls.length,
      0,
      'ready-node retries should not force a second authoritative readiness refresh for the same target',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'ready-node sync reuse should not leave the operation parked for another dispatch retry',
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
