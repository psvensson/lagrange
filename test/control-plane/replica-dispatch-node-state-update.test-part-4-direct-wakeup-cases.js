import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
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

const DIRECT_WAKEUP_RETRY_TEST_NAME =
  'ReplicaDispatchService retries bounded remote direct dispatch wake-ups';
const DIRECT_WAKEUP_VERIFICATION_TEST_NAME =
  'ReplicaDispatchService verifies acknowledged remote direct wake-ups';
const DIRECT_WAKEUP_TARGET_DISPATCH_TEST_NAME =
  'ReplicaDispatchService refreshes rows for direct dispatch ingress';
const DIRECT_WAKEUP_COALESCE_RETRY_REFRESH_TEST_NAME =
  'ReplicaDispatchService promotes coalesced direct wake retries to row refresh';
const DIRECT_WAKEUP_RETRY_OPERATION_ID = 'op-remote-wakeup-retry-1';
const DIRECT_WAKEUP_VERIFICATION_OPERATION_ID =
  'op-remote-wakeup-verification-1';
const DIRECT_WAKEUP_IN_FLIGHT_OPERATION_ID =
  'op-remote-wakeup-in-flight-1';
const DIRECT_WAKEUP_TARGET_DISPATCH_OPERATION_ID =
  'op-remote-wakeup-target-dispatch-1';
const DIRECT_WAKEUP_COALESCE_RETRY_OPERATION_ID =
  'op-remote-wakeup-coalesce-refresh-1';
const DIRECT_WAKEUP_RETRY_PARTITION_ID = 'control_plane_publications-p1';
const DIRECT_WAKEUP_RETRY_REPLICA_ID = 'control_plane_publications-p1-r4';
const DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID = 'node-1';
const DIRECT_WAKEUP_RETRY_TARGET_NODE_ID = 'node-2';
const DIRECT_WAKEUP_RETRY_TARGET_ADDRESS =
  'node-2/service/replica-dispatch';
const DIRECT_WAKEUP_RETRY_STEPS_HISTORY_JSON = '[]';
const DIRECT_WAKEUP_RETRY_CREATED_AT = 1700000000000;
const DIRECT_WAKEUP_RETRY_UPDATED_AT = 1700000000100;
const DIRECT_WAKEUP_RETRY_TIMEOUT_MS = 17;
const DIRECT_WAKEUP_RETRY_AFTER_MS = 23;
const DIRECT_WAKEUP_RETRY_DELIVERY_SOURCE =
  'coordinator_created_remote_handoff';
const DIRECT_WAKEUP_RETRY_DELIVERY_PRIORITY = 'critical';
const DIRECT_WAKEUP_RETRY_ERROR = 'Message timeout';
const DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL = 1;
const DIRECT_WAKEUP_RETRY_EXPECTED_TWO_CALLS = 2;
const DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH =
  'refreshRowBeforeDispatch';
const DIRECT_WAKEUP_RETRY_ASSERT_FIRST_DELIVERY =
  'initial remote wake-up should use bounded target-owner delivery';
const DIRECT_WAKEUP_RETRY_ASSERT_RETRY_ARMED =
  'retryable remote wake-up failure should stay on the dispatch retry lane';
const DIRECT_WAKEUP_RETRY_ASSERT_RETRY_DELAY =
  'remote wake-up retry should honor the transport retry-after';
const DIRECT_WAKEUP_RETRY_ASSERT_RETRY_REENTRY =
  'retry timer should re-enter the remote direct wake-up path';
const DIRECT_WAKEUP_RETRY_ASSERT_VERIFICATION_ARMED =
  'successful remote wake-up retry should arm a verification dispatch slot';
const DIRECT_WAKEUP_RETRY_ASSERT_COALESCED =
  'duplicate remote wake-up should coalesce while retry is armed';
const DIRECT_WAKEUP_RETRY_ASSERT_RETAINED_ROW =
  'coalesced retry should retain the freshest operation row';
const DIRECT_WAKEUP_IN_FLIGHT_ASSERT_COALESCED =
  'duplicate remote wake-up should coalesce while transport is in flight';
const DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER =
  'acknowledged remote wake-up should arm a source-side verification timer';
const DIRECT_WAKEUP_VERIFICATION_ASSERT_REENTRY =
  'verification timer should refresh the row before re-waking the remote owner';

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

test(DIRECT_WAKEUP_TARGET_DISPATCH_TEST_NAME, async (t) => {
  initEnv();

  const enqueues = [];
  const operationRow = {
    operation_id: DIRECT_WAKEUP_TARGET_DISPATCH_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: DIRECT_WAKEUP_RETRY_PARTITION_ID,
    replica_id: DIRECT_WAKEUP_RETRY_REPLICA_ID,
    source_node_id: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
    target_node_id: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: DIRECT_WAKEUP_RETRY_CREATED_AT,
    updated_at: DIRECT_WAKEUP_RETRY_UPDATED_AT,
    steps_history: DIRECT_WAKEUP_RETRY_STEPS_HISTORY_JSON,
  };
  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        t.fail('direct dispatch ingress should enqueue before dispatching');
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
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
    await service.handleReplicaOperationDispatch({
      type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
      [ControlPlaneField.OPERATION_ID]: DIRECT_WAKEUP_TARGET_DISPATCH_OPERATION_ID,
      [ControlPlaneField.OPERATION_ROW]: operationRow,
    });

    t.same(
      enqueues,
      [{
        operationId: DIRECT_WAKEUP_TARGET_DISPATCH_OPERATION_ID,
        reason: RECONCILE_REASON.MESSAGE_DISPATCH_REQUEST,
        context: {
          row: operationRow,
          [DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH]: true,
        },
      }],
      'target ingress should use the payload row only as a fallback',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test(DIRECT_WAKEUP_VERIFICATION_TEST_NAME, async (t) => {
  initEnv();

  const deliveries = [];
  const deferredTimers = [];
  const service = createService({
    operationDispatchRetryAfterMs: DIRECT_WAKEUP_RETRY_AFTER_MS,
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
        t.fail('remote-owned direct wake verification should not dispatch locally');
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    await service.handleCoordinatorOperationCreated({
      operationId: DIRECT_WAKEUP_VERIFICATION_OPERATION_ID,
      partitionId: DIRECT_WAKEUP_RETRY_PARTITION_ID,
      replicaId: DIRECT_WAKEUP_RETRY_REPLICA_ID,
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
      targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
      createdAt: DIRECT_WAKEUP_RETRY_CREATED_AT,
      updatedAt: DIRECT_WAKEUP_RETRY_UPDATED_AT,
      stepsHistory: [],
    });

    t.equal(
      deliveries.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER,
    );
    t.equal(
      deferredTimers.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER,
    );
    t.equal(
      deferredTimers[NUM.ZERO]?.delayMs,
      DIRECT_WAKEUP_RETRY_AFTER_MS,
      DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER,
    );

    const retryEnqueues = [];
    const originalQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(operationId, reason, context) {
        retryEnqueues.push({operationId, reason, context});
      },
      shutdown() {},
    };

    deferredTimers[NUM.ZERO].callback();

    t.same(
      retryEnqueues,
      [{
        operationId: DIRECT_WAKEUP_VERIFICATION_OPERATION_ID,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {
          row: deliveries[NUM.ZERO]?.payload?.[
            ControlPlaneField.OPERATION_ROW
          ],
          [DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH]: true,
        },
      }],
      DIRECT_WAKEUP_VERIFICATION_ASSERT_REENTRY,
    );

    service.operationDispatchQueue = originalQueue;
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService coalesces duplicate remote direct wake-ups ' +
  'while transport delivery is still in flight', async (t) => {
  initEnv();

  const deliveries = [];
  const deferredTimers = [];
  let resolveDelivery = null;
  const pendingDelivery = new Promise((resolve) => {
    resolveDelivery = resolve;
  });
  const service = createService({
    operationDispatchRetryAfterMs: DIRECT_WAKEUP_RETRY_AFTER_MS,
    messageRouter: {
      async deliver(address, payload, options) {
        deliveries.push({address, payload, options});
        return pendingDelivery;
      },
    },
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        t.fail('remote-owned direct wake should not dispatch locally');
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    const firstWakeup = service.handleCoordinatorOperationCreated({
      operationId: DIRECT_WAKEUP_IN_FLIGHT_OPERATION_ID,
      partitionId: DIRECT_WAKEUP_RETRY_PARTITION_ID,
      replicaId: DIRECT_WAKEUP_RETRY_REPLICA_ID,
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
      targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
      createdAt: DIRECT_WAKEUP_RETRY_CREATED_AT,
      updatedAt: DIRECT_WAKEUP_RETRY_UPDATED_AT,
      stepsHistory: [],
    });

    await service.handleCoordinatorOperationCreated({
      operationId: DIRECT_WAKEUP_IN_FLIGHT_OPERATION_ID,
      partitionId: DIRECT_WAKEUP_RETRY_PARTITION_ID,
      replicaId: DIRECT_WAKEUP_RETRY_REPLICA_ID,
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
      targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
      createdAt: DIRECT_WAKEUP_RETRY_CREATED_AT,
      updatedAt: DIRECT_WAKEUP_RETRY_UPDATED_AT + NUM.ONE,
      stepsHistory: [],
    });

    t.equal(
      deliveries.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_IN_FLIGHT_ASSERT_COALESCED,
    );

    resolveDelivery({acknowledged: true});
    await firstWakeup;

    t.equal(
      service.operationDispatchDeferredRetries.get(
        DIRECT_WAKEUP_IN_FLIGHT_OPERATION_ID,
      )?.row?.updated_at,
      DIRECT_WAKEUP_RETRY_UPDATED_AT + NUM.ONE,
      DIRECT_WAKEUP_RETRY_ASSERT_RETAINED_ROW,
    );
    t.equal(
      deferredTimers.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER,
    );
  } finally {
    service.stop();
  }
});

test(DIRECT_WAKEUP_COALESCE_RETRY_REFRESH_TEST_NAME, async (t) => {
  initEnv();

  const deferredTimers = [];
  const retryEnqueues = [];
  const retryableError = new Error(DIRECT_WAKEUP_RETRY_ERROR);
  retryableError.retryAfterMs = DIRECT_WAKEUP_RETRY_AFTER_MS;
  const staleOperationRow = {
    operation_id: DIRECT_WAKEUP_COALESCE_RETRY_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: DIRECT_WAKEUP_RETRY_PARTITION_ID,
    replica_id: DIRECT_WAKEUP_RETRY_REPLICA_ID,
    source_node_id: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
    target_node_id: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: DIRECT_WAKEUP_RETRY_CREATED_AT,
    updated_at: DIRECT_WAKEUP_RETRY_UPDATED_AT,
    steps_history: DIRECT_WAKEUP_RETRY_STEPS_HISTORY_JSON,
  };
  const freshOperationRow = {
    ...staleOperationRow,
    updated_at: DIRECT_WAKEUP_RETRY_UPDATED_AT + NUM.ONE,
  };
  const service = createService({
    operationDispatchRetryAfterMs: DIRECT_WAKEUP_RETRY_AFTER_MS,
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        t.fail('coalesced retry metadata should enqueue before dispatching');
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });
  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      retryEnqueues.push({operationId, reason, context});
      return true;
    },
    shutdown() {},
  };

  try {
    service.deferOperationDispatchRetry(
      DIRECT_WAKEUP_COALESCE_RETRY_OPERATION_ID,
      retryableError,
      staleOperationRow,
    );
    t.notOk(
      service.operationDispatchDeferredRetries.get(
        DIRECT_WAKEUP_COALESCE_RETRY_OPERATION_ID,
      )?.[DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH],
      'plain deferred retries should keep the default no-refresh mode',
    );

    service.coalesceActiveDirectDispatchWakeup(
      DIRECT_WAKEUP_COALESCE_RETRY_OPERATION_ID,
      freshOperationRow,
    );

    t.equal(
      service.operationDispatchDeferredRetries.get(
        DIRECT_WAKEUP_COALESCE_RETRY_OPERATION_ID,
      )?.row?.updated_at,
      freshOperationRow.updated_at,
      DIRECT_WAKEUP_RETRY_ASSERT_RETAINED_ROW,
    );
    t.equal(
      service.operationDispatchDeferredRetries.get(
        DIRECT_WAKEUP_COALESCE_RETRY_OPERATION_ID,
      )?.[DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH],
      true,
      'coalesced direct wake should promote deferred retry row refresh',
    );

    deferredTimers[NUM.ZERO].callback();

    t.same(
      retryEnqueues,
      [{
        operationId: DIRECT_WAKEUP_COALESCE_RETRY_OPERATION_ID,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {
          row: freshOperationRow,
          [DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH]: true,
        },
      }],
      'coalesced direct wake retry should re-enter with row refresh metadata',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test(DIRECT_WAKEUP_RETRY_TEST_NAME, async (t) => {
  initEnv();

  const deliveries = [];
  const deferredTimers = [];
  const service = createService({
    replicaOperationDispatchTimeoutMs: DIRECT_WAKEUP_RETRY_TIMEOUT_MS,
    operationDispatchRetryAfterMs: DIRECT_WAKEUP_RETRY_AFTER_MS,
    messageRouter: {
      async deliver(address, payload, options) {
        deliveries.push({address, payload, options});
        if (deliveries.length === DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL) {
          return {
            error: DIRECT_WAKEUP_RETRY_ERROR,
            deferRetry: true,
            retryAfterMs: DIRECT_WAKEUP_RETRY_AFTER_MS,
          };
        }
        return {acknowledged: true};
      },
    },
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        t.fail('remote-owned direct wake retry should not dispatch locally');
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    await service.handleCoordinatorOperationCreated({
      operationId: DIRECT_WAKEUP_RETRY_OPERATION_ID,
      partitionId: DIRECT_WAKEUP_RETRY_PARTITION_ID,
      replicaId: DIRECT_WAKEUP_RETRY_REPLICA_ID,
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
      targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
      createdAt: DIRECT_WAKEUP_RETRY_CREATED_AT,
      updatedAt: DIRECT_WAKEUP_RETRY_UPDATED_AT,
      stepsHistory: [],
    });

    t.equal(
      deliveries.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_RETRY_ASSERT_FIRST_DELIVERY,
    );
    t.same(
      deliveries[NUM.ZERO],
      {
        address: DIRECT_WAKEUP_RETRY_TARGET_ADDRESS,
        payload: {
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: DIRECT_WAKEUP_RETRY_OPERATION_ID,
          [ControlPlaneField.OPERATION_ROW]: {
            operation_id: DIRECT_WAKEUP_RETRY_OPERATION_ID,
            type: OperationType.REPLACE,
            partition_id: DIRECT_WAKEUP_RETRY_PARTITION_ID,
            replica_id: DIRECT_WAKEUP_RETRY_REPLICA_ID,
            source_node_id: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
            target_node_id: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
            status: undefined,
            workflow_step: WORKFLOW_STEP.PENDING,
            created_at: DIRECT_WAKEUP_RETRY_CREATED_AT,
            updated_at: DIRECT_WAKEUP_RETRY_UPDATED_AT,
            completed_at: undefined,
            error_message: undefined,
            steps_history: DIRECT_WAKEUP_RETRY_STEPS_HISTORY_JSON,
            entity_type: undefined,
            entity_id: undefined,
          },
        },
        options: {
          targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
          timeoutMs: DIRECT_WAKEUP_RETRY_TIMEOUT_MS,
          deliverySource: DIRECT_WAKEUP_RETRY_DELIVERY_SOURCE,
          deliveryPriority: DIRECT_WAKEUP_RETRY_DELIVERY_PRIORITY,
        },
      },
      DIRECT_WAKEUP_RETRY_ASSERT_FIRST_DELIVERY,
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_RETRY_ASSERT_RETRY_ARMED,
    );
    t.equal(
      deferredTimers[NUM.ZERO]?.delayMs,
      DIRECT_WAKEUP_RETRY_AFTER_MS,
      DIRECT_WAKEUP_RETRY_ASSERT_RETRY_DELAY,
    );

    await service.handleCoordinatorOperationCreated({
      operationId: DIRECT_WAKEUP_RETRY_OPERATION_ID,
      partitionId: DIRECT_WAKEUP_RETRY_PARTITION_ID,
      replicaId: DIRECT_WAKEUP_RETRY_REPLICA_ID,
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
      targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
      createdAt: DIRECT_WAKEUP_RETRY_CREATED_AT,
      updatedAt: DIRECT_WAKEUP_RETRY_UPDATED_AT + NUM.ONE,
      stepsHistory: [],
    });

    t.equal(
      deliveries.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_RETRY_ASSERT_COALESCED,
    );
    t.equal(
      service.operationDispatchDeferredRetries.get(
        DIRECT_WAKEUP_RETRY_OPERATION_ID,
      )?.row?.updated_at,
      DIRECT_WAKEUP_RETRY_UPDATED_AT + NUM.ONE,
      DIRECT_WAKEUP_RETRY_ASSERT_RETAINED_ROW,
    );

    let retryPromise = null;
    const retryEnqueues = [];
    const originalQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(operationId, reason, context) {
        retryEnqueues.push({operationId, reason, context});
        retryPromise = service.reconcileOperationDispatch(
          operationId,
          context,
        );
      },
      shutdown() {},
    };

    deferredTimers[NUM.ZERO].callback();
    await retryPromise;

    t.same(
      retryEnqueues.map((entry) => ({
        operationId: entry.operationId,
        reason: entry.reason,
      })),
      [{
        operationId: DIRECT_WAKEUP_RETRY_OPERATION_ID,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
      }],
      DIRECT_WAKEUP_RETRY_ASSERT_RETRY_REENTRY,
    );
    t.equal(
      retryEnqueues[NUM.ZERO]?.context?.row?.updated_at,
      DIRECT_WAKEUP_RETRY_UPDATED_AT + NUM.ONE,
      DIRECT_WAKEUP_RETRY_ASSERT_RETAINED_ROW,
    );
    t.equal(
      deliveries.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_TWO_CALLS,
      DIRECT_WAKEUP_RETRY_ASSERT_RETRY_REENTRY,
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_RETRY_ASSERT_VERIFICATION_ARMED,
    );

    service.operationDispatchQueue = originalQueue;
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
            [DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH]: true,
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
