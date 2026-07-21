import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_DEFAULT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  createMockControlPlaneReadinessService,
  createTestCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

const SOURCE_NODE_ID = 'node-1';
const TARGET_NODE_ID = 'node-2';
const OPERATION_ID = 'runtime-service-target-progress-retained-verification';
const SERVICE_ID = 'svc-movielens-topn';
const REPLICA_ID = `${SERVICE_ID}-r2`;
const DISPATCH_DEFER_RETRY_AFTER_MS = 250;
const CREATING_STEP_TIMEOUT_MS =
  REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS;

function buildRuntimeSendingOperationRow(overrides = {}) {
  return {
    operation_id: OPERATION_ID,
    type: OperationType.ADD,
    partition_id: SERVICE_ID,
    entity_type: 'runtime_service',
    entity_id: SERVICE_ID,
    replica_id: REPLICA_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflow_step: WORKFLOW_STEP.SENDING,
    created_at: 1700000000000,
    updated_at: 1700000000000,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    ...overrides,
  };
}

async function drainOperationDispatchQueue(service) {
  await new Promise((resolve) => setImmediate(resolve));
  while (
    service.operationDispatchQueue.size > 0 ||
    service.operationDispatchQueue.draining
  ) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createTimerCapture() {
  const scheduledTimers = [];
  return {
    scheduledTimers,
    captureTimer(callback, delayMs) {
      const timerHandle = {callback, delayMs};
      scheduledTimers.push(timerHandle);
      return timerHandle;
    },
    releaseTimer(timerHandle) {
      if (timerHandle) {
        timerHandle.cleared = true;
      }
    },
  };
}

function createRetainedVerificationService(dispatchOperation, options = {}) {
  const timerCapture = createTimerCapture();
  const service = createService({
    ...options,
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

async function drainScheduledTimers(scheduledTimers, service, budgetMs) {
  let remainingVirtualBudgetMs = budgetMs;
  for (;;) {
    const dueTimer = scheduledTimers
      .filter(
        (timer) =>
          !timer.cleared &&
          !timer.fired &&
          timer.delayMs <= remainingVirtualBudgetMs,
      )
      .sort((left, right) => left.delayMs - right.delayMs)[0];
    if (!dueTimer) {
      break;
    }
    dueTimer.fired = true;
    remainingVirtualBudgetMs -= dueTimer.delayMs;
    await dueTimer.callback();
    await drainOperationDispatchQueue(service);
  }
}

// Quest runtime-service-creating-owner-wake-progress-admission, retained
// verification after a SUCCESSFUL source dispatch. Sealed production ordering:
//   1. The source-owned coordinator-created runtime ADD dispatch defers once
//      (retryable), the armed deferred-retry timer fires, and the dispatch
//      SUCCEEDS — clearDeferredOperationDispatchRetry destroys the slot on the
//      success path of dispatchOperationRow.
//   2. The durable operation row commits CREATING; the exact target services
//      row is durably ACTIVE.
//   3. The target's TARGET_EXECUTOR_OUTCOME remote handoff retry stops at the
//      CREATING step timeout without ever reaching the source; simulated by
//      never delivering any handoff wake.
//   4. Every remaining armed source-side timer is fired through twice the
//      CREATING step timeout window.
// The terminal assertions are the discriminator: with the slot destroyed by
// the successful dispatch there is no deferred-retry edge, no ready-node
// replay for a non-system CREATING row, and no planner rearm — on current
// code nothing re-enters the row, it stays CREATING forever, and the final
// assertions FAIL.
test(
  'a successful dispatch retains one verification re-entry so a lost target ' +
  'handoff still reaches terminal ACTIVE from durable target ACTIVE proof',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-lost-handoff-after-success`;
    const sendingRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
    });
    const durableCreatingRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
      status: ReplicaStatus.CREATING,
      workflow_step: WORKFLOW_STEP.CREATING,
      updated_at: 1700000000500,
    });
    const activeServiceRow = {
      service_id: REPLICA_ID,
      service_type: 'runtime_service',
      node_id: TARGET_NODE_ID,
      status: ReplicaStatus.ACTIVE,
      created_at: 1700000000510,
      updated_at: 1700000000514,
    };
    const {scheduledTimers, captureTimer, releaseTimer} = createTimerCapture();
    const sourceCoordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        services: [activeServiceRow],
        replicaOperations: [durableCreatingRow],
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
        async updateSystemTableRow() {
          return {success: true};
        },
        async refreshAuthoritativeCacheRow() {
          return true;
        },
      },
      sqlQueryResults: {
        'FROM services WHERE service_id = ?': {
          success: true,
          rows: [activeServiceRow],
        },
      },
      setTimeoutFn: captureTimer,
      clearTimeoutFn: releaseTimer,
    });
    const dispatchOperation =
      sourceCoordinator.dispatchOperation.bind(sourceCoordinator);
    let dispatchCallCount = 0;
    sourceCoordinator.dispatchOperation = async (...args) => {
      dispatchCallCount += 1;
      if (dispatchCallCount === 1) {
        const retryableError =
          new Error('source owner visibility is temporarily unavailable');
        retryableError.retryAfterMs = DISPATCH_DEFER_RETRY_AFTER_MS;
        throw retryableError;
      }
      if (dispatchCallCount === 2) {
        // The deferred-retry dispatch reaches the target and SUCCEEDS; the
        // durable row steps to CREATING while the target's outcome handoff
        // back to the source is lost at its retry budget.
        return {success: true};
      }
      return dispatchOperation(...args);
    };
    const sourceDispatch = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: sourceCoordinator,
      controlPlaneReadinessService: createMockControlPlaneReadinessService({
        defaultRepairEligible: true,
      }),
      setTimeoutFn: captureTimer,
      clearTimeoutFn: releaseTimer,
    });
    // Authoritative row visibility as the source dispatch owner observes it:
    // SENDING through the deferred retry and its successful dispatch, then
    // converging to the durable CREATING commit.
    let visibleOperationRow = sendingRow;
    sourceDispatch.replicaOperationsOwner = {
      async getReplicaOperationFromCache(requestedOperationId) {
        return requestedOperationId === operationId ?
          {...visibleOperationRow} :
          null;
      },
    };

    try {
      await sourceDispatch.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationId,
        [ControlPlaneField.OPERATION_ROW]: sendingRow,
      });
      await drainOperationDispatchQueue(sourceDispatch);

      t.equal(
        dispatchCallCount,
        1,
        'the initial source dispatch pass should reach the owner once',
      );
      const deferredRetry =
        sourceDispatch.operationDispatchDeferredRetries.get(operationId);
      t.ok(
        deferredRetry,
        'the retryable failure should arm the existing deferred retry',
      );

      deferredRetry.timeoutHandle.fired = true;
      await deferredRetry.timeoutHandle.callback();
      await drainOperationDispatchQueue(sourceDispatch);

      t.equal(
        dispatchCallCount,
        2,
        'the deferred-retry dispatch should succeed and clear its slot',
      );

      // The durable row commits CREATING; the target handoff wake is never
      // delivered; no readiness transition and no planner rearm occur.
      visibleOperationRow = durableCreatingRow;

      await drainScheduledTimers(
        scheduledTimers,
        sourceDispatch,
        CREATING_STEP_TIMEOUT_MS * 2,
      );

      const progressedOperation =
        await sourceCoordinator.repository.queryOperationById(operationId);
      t.equal(
        progressedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the source-owned ADD must progress to ACTIVE once the exact target ' +
        'services row is durably ACTIVE, without a delivered handoff wake',
      );
      t.equal(
        progressedOperation?.status,
        ReplicaStatus.ACTIVE,
        'the source-owned durable operation must reach its terminal state ' +
        'instead of remaining CREATING forever after the successful dispatch',
      );
    } finally {
      sourceDispatch.stop();
      await sourceCoordinator.shutdown();
    }
  },
);

test(
  'a successful system-table dispatch retains no verification timer',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-system-success`;
    const dispatchCalls = [];
    const systemSendingRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
      partition_id: 'nodes-p1',
      entity_type: 'partition',
      entity_id: 'nodes-p1',
    });
    const {scheduledTimers, service} = createRetainedVerificationService(
      async (operation, options) => {
        dispatchCalls.push({operation, options});
        return {success: true};
      },
    );

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationId,
        [ControlPlaneField.OPERATION_ROW]: systemSendingRow,
      });
      await drainOperationDispatchQueue(service);

      t.equal(
        dispatchCalls.length,
        1,
        'the system SENDING dispatch should reach the owner once',
      );
      t.equal(
        service.operationDispatchDeferredRetries.size,
        0,
        'a system dispatch success must not retain a verification slot',
      );
      t.equal(
        scheduledTimers.filter((timer) => !timer.cleared).length,
        0,
        'no verification timer may remain armed for system rows',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'a retained verification dispatch is one-shot when the durable row remains ' +
  'temporarily unreadable',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-unreadable-sending-one-shot`;
    const sendingRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
    });
    const dispatchCalls = [];
    const {scheduledTimers, service} = createRetainedVerificationService(
      async (operation, options) => {
        dispatchCalls.push({operation, options});
        return {success: true};
      },
    );
    service.replicaOperationsOwner = {
      async getReplicaOperationFromCache() {
        return null;
      },
    };
    service.getAuthoritativeReplicaOperationRow = async () => null;

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationId,
        [ControlPlaneField.OPERATION_ROW]: sendingRow,
      });
      await drainOperationDispatchQueue(service);

      t.equal(
        dispatchCalls.length,
        1,
        'the initial SENDING row should dispatch once',
      );

      await drainScheduledTimers(
        scheduledTimers,
        service,
        CREATING_STEP_TIMEOUT_MS * 4,
      );

      t.equal(
        dispatchCalls.length,
        2,
        'the retained verification may dispatch the fallback SENDING row ' +
        'once but must not create a periodic replay loop',
      );
      t.equal(
        scheduledTimers.filter((timer) => !timer.cleared && !timer.fired)
          .length,
        0,
        'no later verification window remains armed',
      );
      t.equal(
        service.operationDispatchDeferredRetries.size,
        0,
        'the one-shot verification leaves no retained retry slot',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'a row already ACTIVE when the retained verification fires is a no-op',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-active-before-fire`;
    const dispatchCalls = [];
    const sendingRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
    });
    const terminalActiveRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
      status: ReplicaStatus.ACTIVE,
      workflow_step: WORKFLOW_STEP.ACTIVE,
      updated_at: 1700000000600,
    });
    const {scheduledTimers, service} = createRetainedVerificationService(
      async (operation, options) => {
        dispatchCalls.push({operation, options});
        return {success: true};
      },
    );
    let visibleOperationRow = sendingRow;
    service.replicaOperationsOwner = {
      async getReplicaOperationFromCache(requestedOperationId) {
        return requestedOperationId === operationId ?
          {...visibleOperationRow} :
          null;
      },
    };

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationId,
        [ControlPlaneField.OPERATION_ROW]: sendingRow,
      });
      await drainOperationDispatchQueue(service);

      t.equal(
        dispatchCalls.length,
        1,
        'the runtime SENDING dispatch should reach the owner once',
      );

      visibleOperationRow = terminalActiveRow;
      await drainScheduledTimers(
        scheduledTimers,
        service,
        CREATING_STEP_TIMEOUT_MS * 2,
      );

      t.equal(
        dispatchCalls.length,
        1,
        'a row already terminal ACTIVE must not be dispatched again',
      );
      t.equal(
        service.operationDispatchDeferredRetries.size,
        0,
        'the fired verification must leave no retained slot behind',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'one-shot provenance survives a retryable verification dispatch failure',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-verification-retry-one-shot`;
    const sendingRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
    });
    let dispatchCallCount = 0;
    const {scheduledTimers, service} = createRetainedVerificationService(
      async () => {
        dispatchCallCount += 1;
        if (dispatchCallCount === 2) {
          const error = new Error('verification dispatch temporarily failed');
          error.retryAfterMs = DISPATCH_DEFER_RETRY_AFTER_MS;
          throw error;
        }
        return {success: true};
      },
    );
    service.replicaOperationsOwner = {
      async getReplicaOperationFromCache() {
        return null;
      },
    };
    service.getAuthoritativeReplicaOperationRow = async () => null;

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationId,
        [ControlPlaneField.OPERATION_ROW]: sendingRow,
      });
      await drainOperationDispatchQueue(service);
      await drainScheduledTimers(
        scheduledTimers,
        service,
        CREATING_STEP_TIMEOUT_MS * 3,
      );

      t.equal(
        dispatchCallCount,
        3,
        'initial dispatch, one verification failure, and its canonical retry ' +
        'are the only owner calls',
      );
      t.equal(
        scheduledTimers.filter((timer) => !timer.cleared && !timer.fired)
          .length,
        0,
        'the successful retry cannot rearm the creation-window verification',
      );
      t.equal(service.operationDispatchDeferredRetries.size, 0);
    } finally {
      service.stop();
    }
  },
);

test(
  'the retained verification re-entry never replays unrelated pending rows',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-exact-row-only`;
    const unrelatedOperationId = `${OPERATION_ID}-unrelated-pending`;
    const dispatchCalls = [];
    const sendingRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
    });
    const durableCreatingRow = buildRuntimeSendingOperationRow({
      operation_id: operationId,
      status: ReplicaStatus.CREATING,
      workflow_step: WORKFLOW_STEP.CREATING,
      updated_at: 1700000000500,
    });
    const unrelatedPendingRow = buildRuntimeSendingOperationRow({
      operation_id: unrelatedOperationId,
      replica_id: `${SERVICE_ID}-r3`,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
    });
    // Seeded after startup so the initial cache replay cannot dispatch it;
    // only a broad replay from the retained re-entry could reach it.
    const cacheReplicaOperations = [];
    const {scheduledTimers, service} = createRetainedVerificationService(
      async (operation, options) => {
        dispatchCalls.push({operation, options});
        return {success: true};
      },
      {cacheReplicaOperations},
    );
    let visibleOperationRow = sendingRow;
    service.replicaOperationsOwner = {
      async getReplicaOperationFromCache(requestedOperationId) {
        if (requestedOperationId === operationId) {
          return {...visibleOperationRow};
        }
        if (requestedOperationId === unrelatedOperationId) {
          return {...unrelatedPendingRow};
        }
        return null;
      },
    };

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationId,
        [ControlPlaneField.OPERATION_ROW]: sendingRow,
      });
      await drainOperationDispatchQueue(service);

      t.equal(
        dispatchCalls.length,
        1,
        'the runtime SENDING dispatch should reach the owner once',
      );

      cacheReplicaOperations.push(unrelatedPendingRow);
      visibleOperationRow = durableCreatingRow;
      await drainScheduledTimers(
        scheduledTimers,
        service,
        CREATING_STEP_TIMEOUT_MS * 2,
      );

      t.notOk(
        dispatchCalls.some(
          ({operation}) => operation?.operationId === unrelatedOperationId,
        ),
        'the retained re-entry must not dispatch unrelated pending rows',
      );
      t.ok(
        dispatchCalls.every(
          ({operation}) => operation?.operationId === operationId,
        ),
        'the retained re-entry stays bounded to its exact operation row',
      );
    } finally {
      service.stop();
    }
  },
);
