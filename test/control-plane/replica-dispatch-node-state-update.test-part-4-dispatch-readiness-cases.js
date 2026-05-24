import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  NUM,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update.test-part-4-fixtures.js';

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

test('ReplicaDispatchService uses recovery eligibility for critical ' +
  'system-table dispatches', async (t) => {
  initEnv();

  const TARGET_NODE_ID = 'node-2';
  const SOURCE_NODE_ID = 'node-1';
  const OPERATION_ID = 'op-critical-recovery-dispatch-1';
  const PARTITION_ID = 'sql_write_operations-p1';
  const REPLICA_ID = 'sql_write_operations-p1-r4';
  const OPERATION_STATUS = 'pending';
  const EMPTY_STEPS_HISTORY = '[]';

  const authoritativeCalls = [];
  let dispatchCalls = NUM.ZERO;
  const operationRow = {
    operation_id: OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: PARTITION_ID,
    replica_id: REPLICA_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: OPERATION_STATUS,
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: EMPTY_STEPS_HISTORY,
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId, options) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          decisionDimension: options?.decisionDimension,
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          decisionDimension: options?.decisionDimension,
          reasons: [],
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += NUM.ONE;
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
      NUM.ONE,
      'critical system-table dispatch should proceed on recovery eligibility',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'recovery-eligible critical dispatch should not defer as not-ready',
    );
    t.same(
      authoritativeCalls[NUM.ZERO],
      {
        nodeId: TARGET_NODE_ID,
        options: {
          allowAuthoritativeRefresh: true,
          decisionDimension:
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
          maxCachedAgeMs: NUM.ZERO,
        },
      },
      'critical dispatch readiness should refresh the recovery dimension',
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
