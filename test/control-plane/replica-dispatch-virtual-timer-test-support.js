import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';

/**
 * Build one non-system runtime_service replica_operations row in the SENDING
 * dispatch shape shared by the retained-verification and owner-rearm suites.
 *
 * @param {Object} identity - operationId/serviceId/replicaId/sourceNodeId/
 *   targetNodeId for the suite under test.
 * @param {Object} [overrides={}]
 * @return {Object}
 */
function buildRuntimeReplicaOperationRow(identity, overrides = {}) {
  return {
    operation_id: identity.operationId,
    type: OperationType.ADD,
    partition_id: identity.serviceId,
    entity_type: 'runtime_service',
    entity_id: identity.serviceId,
    replica_id: identity.replicaId,
    source_node_id: identity.sourceNodeId,
    target_node_id: identity.targetNodeId,
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

/**
 * Wait for the operation dispatch queue to fully drain.
 * @param {Object} service
 * @return {Promise<void>}
 */
async function drainOperationDispatchQueue(service) {
  await new Promise((resolve) => setImmediate(resolve));
  while (
    service.operationDispatchQueue.size > 0 ||
    service.operationDispatchQueue.draining
  ) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Capture setTimeout/clearTimeout into an inspectable list so tests can fire
 * armed timers deterministically instead of waiting wall-clock delays.
 * @return {{scheduledTimers: Array, captureTimer: Function,
 *   releaseTimer: Function}}
 */
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

/**
 * Fire every armed, uncleared timer whose delay fits the remaining virtual
 * budget, earliest first, draining the dispatch queue between firings.
 * @param {Array} scheduledTimers
 * @param {Object} service
 * @param {number} budgetMs
 * @return {Promise<void>}
 */
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

export {
  buildRuntimeReplicaOperationRow,
  createTimerCapture,
  drainOperationDispatchQueue,
  drainScheduledTimers,
};
