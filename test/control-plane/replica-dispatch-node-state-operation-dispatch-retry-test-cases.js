import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const OPERATION_DISPATCH_RETRY_REFRESH_ROW_BEFORE_DISPATCH =
  'refreshRowBeforeDispatch';

async function waitForStartupReplay(service) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await service.nodeReadyRetryQueue.drain();
  if (Array.isArray(service.operationDispatchQueues)) {
    await Promise.all(
      service.operationDispatchQueues.map((queue) => queue.drain()),
    );
  }
}

export function registerReplicaDispatchNodeStateOperationDispatchRetryTests({
  createService,
  initEnv,
  READY_NODE_CAPABILITIES_JSON,
}) {
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
          context: {row: operationRow, deferredRetryProvenance: true},
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

  test('ReplicaDispatchService preserves refresh-row metadata across ' +
    'retryable replica operation dispatch failures', async (t) => {
    initEnv();

    const scheduled = [];
    const enqueues = [];
    const now = Date.now();
    const retryableError =
      new Error('control plane pressure while claiming dispatch transition');
    retryableError.retryAfterMs = 123;
    const operationRow = {
      operation_id: 'op-retryable-dispatch-refresh-1',
      type: OperationType.REPLACE,
      partition_id: 'control_plane_publications-p1',
      replica_id: 'control_plane_publications-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };

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
        {
          row: operationRow,
          [OPERATION_DISPATCH_RETRY_REFRESH_ROW_BEFORE_DISPATCH]: true,
        },
      );

      t.equal(
        scheduled.length,
        1,
        'retryable dispatch failure should arm one deferred retry timer',
      );
      t.equal(
        service.operationDispatchDeferredRetries.get(
          operationRow.operation_id,
        )?.[OPERATION_DISPATCH_RETRY_REFRESH_ROW_BEFORE_DISPATCH],
        true,
        'deferred retry state should retain refresh-row metadata',
      );

      scheduled[0].callback();

      t.same(
        enqueues,
        [{
          operationId: operationRow.operation_id,
          reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
          context: {
            row: operationRow,
            deferredRetryProvenance: true,
            [OPERATION_DISPATCH_RETRY_REFRESH_ROW_BEFORE_DISPATCH]: true,
          },
        }],
        'deferred retry should re-enter with refresh-row metadata intact',
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
        0,
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
        0,
        'authoritative progression should not arm another deferred retry',
      );
      t.equal(
        service.operationDispatchDeferredRetries.size,
        0,
        'authoritative progression should clear any deferred dispatch retry state',
      );
      t.equal(
        service.dispatchFailureSignaturesByOperationId.size,
        0,
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
      await waitForStartupReplay(service);
      service.clearNodeReadyRetryWatermark('node-1');
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
    await waitForStartupReplay(service);
    service.clearNodeReadyRetryWatermark(READY_TARGET_NODE_ID);
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
    await waitForStartupReplay(service);
    service.clearNodeReadyRetryWatermark(READY_SOURCE_NODE_ID);
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
    await waitForStartupReplay(service);
    service.clearNodeReadyRetryWatermark(READY_OWNER_NODE_ID);
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
}
