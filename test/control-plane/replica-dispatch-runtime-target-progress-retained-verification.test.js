import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  createMockControlPlaneReadinessService,
} from '../rebalancer/test-helpers.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';
import {
  buildRuntimeReplicaOperationRow,
  createTimerCapture,
  drainOperationDispatchQueue,
} from './replica-dispatch-virtual-timer-test-support.js';

const OPERATION_ID = 'runtime-service-target-progress-owner-cutover';
const ROW_IDENTITY = Object.freeze({
  operationId: OPERATION_ID,
  serviceId: 'svc-movielens-topn',
  replicaId: 'svc-movielens-topn-r2',
  sourceNodeId: 'node-1',
  targetNodeId: 'node-2',
});

function buildRuntimeSendingOperationRow(overrides = {}) {
  return buildRuntimeReplicaOperationRow(ROW_IDENTITY, overrides);
}

function createDispatchService(dispatchOperation) {
  const timerCapture = createTimerCapture();
  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      dispatchOperation,
      isOperationLocallyOwned() {
        return true;
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      defaultRepairEligible: true,
    }),
    setTimeoutFn: timerCapture.captureTimer,
    clearTimeoutFn: timerCapture.releaseTimer,
  });
  return {...timerCapture, service};
}

// Quest operation-dispatch-completion-owner-cutover. Successful delivery is
// retained at the workflow-owner transport gate. ReplicaDispatchService keeps
// transport-failure retries and remote-wakeup verification only; it must not
// recreate a caller-local target-progress authority after a successful call.
test(
  'a successful runtime CREATE call leaves no caller-local progress retry',
  async (t) => {
    initEnv();

    const dispatchCalls = [];
    const {scheduledTimers, service} = createDispatchService(
      async (operation, options) => {
        dispatchCalls.push({operation, options});
        return {success: true};
      },
    );
    const row = buildRuntimeSendingOperationRow();

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: OPERATION_ID,
        [ControlPlaneField.OPERATION_ROW]: row,
      });
      await drainOperationDispatchQueue(service);

      t.equal(dispatchCalls.length, 1, 'the owner call should run once');
      t.equal(
        service.operationDispatchDeferredRetries.size,
        0,
        'successful delivery must not create a dispatch-service retry slot',
      );
      t.equal(
        scheduledTimers.filter((timer) => !timer.cleared).length,
        0,
        'successful delivery must not arm a dispatch-service timer',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'system-operation success remains free of caller-local verification work',
  async (t) => {
    initEnv();

    const dispatchCalls = [];
    const {scheduledTimers, service} = createDispatchService(
      async (operation) => {
        dispatchCalls.push(operation);
        return {success: true};
      },
    );
    const row = buildRuntimeSendingOperationRow({
      operation_id: `${OPERATION_ID}-system`,
      partition_id: 'nodes-p1',
      entity_type: 'partition',
      entity_id: 'nodes-p1',
    });

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: row.operation_id,
        [ControlPlaneField.OPERATION_ROW]: row,
      });
      await drainOperationDispatchQueue(service);

      t.equal(dispatchCalls.length, 1);
      t.equal(service.operationDispatchDeferredRetries.size, 0);
      t.equal(
        scheduledTimers.filter((timer) => !timer.cleared).length,
        0,
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'a retryable transport failure still uses the existing service retry lane',
  async (t) => {
    initEnv();

    let dispatchCallCount = 0;
    const {service} = createDispatchService(async () => {
      dispatchCallCount += 1;
      if (dispatchCallCount === 1) {
        const error = new Error('operation visibility is temporarily delayed');
        error.retryAfterMs = 250;
        throw error;
      }
      return {success: true};
    });
    const row = buildRuntimeSendingOperationRow({
      operation_id: `${OPERATION_ID}-failure-retry`,
    });

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: row.operation_id,
        [ControlPlaneField.OPERATION_ROW]: row,
      });
      await drainOperationDispatchQueue(service);
      const retry =
        service.operationDispatchDeferredRetries.get(row.operation_id);
      t.ok(retry, 'the failure should retain the existing retry slot');

      retry.timeoutHandle.fired = true;
      await retry.timeoutHandle.callback();
      await drainOperationDispatchQueue(service);

      t.equal(dispatchCallCount, 2, 'the failure retry should run once');
      t.equal(
        service.operationDispatchDeferredRetries.size,
        0,
        'success after failure should consume the service retry slot',
      );
    } finally {
      service.stop();
    }
  },
);
