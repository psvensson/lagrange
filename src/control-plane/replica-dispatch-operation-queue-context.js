import {
  CONTROL_PLANE_OPERATION_HANDOFF_MODE,
  ControlPlaneField,
} from './control-plane-constants.js';
import {
  REPLICA_DISPATCH_SERVICE_SHARED,
} from './replica-dispatch-service-shared.js';

const {
  REPLICA_DISPATCH_SERVICE_LITERAL,
} = REPLICA_DISPATCH_SERVICE_SHARED;

/**
 * Resolve context already retained for one operation owner key. The generic
 * owner-key queue intentionally uses last-writer context, so this boundary
 * merges operation-specific progress evidence before enqueue.
 *
 * @param {Object|null} queue
 * @param {string} ownerKey
 * @return {Object|null}
 */
function resolveQueuedOperationDispatchContext(queue, ownerKey) {
  return (
    queue?.pending?.get(ownerKey)?.context ||
    queue?.retryWorkItems?.get(ownerKey)?.context ||
    null
  );
}

/**
 * Merge coalesced operation-dispatch context monotonically. A target
 * executor-outcome wake is stronger than an ordinary dispatch request and
 * must survive later CDC or retry enqueues for the same owner key. Row data
 * remains last-writer-wins because reconcile refreshes it authoritatively.
 *
 * @param {Object|null} retainedContext
 * @param {Object|null} incomingContext
 * @return {Object|null}
 */
function mergeOperationDispatchReconcileContext(
  retainedContext,
  incomingContext,
) {
  const retained =
    retainedContext && typeof retainedContext === 'object' ?
      retainedContext :
      null;
  const incoming =
    incomingContext && typeof incomingContext === 'object' ?
      incomingContext :
      null;
  if (!retained) {
    return incomingContext;
  }
  if (!incoming) {
    return retainedContext;
  }

  const mergedContext = {
    ...retained,
    ...incoming,
  };
  if (
    retained[ControlPlaneField.HANDOFF_MODE] ===
      CONTROL_PLANE_OPERATION_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME ||
    incoming[ControlPlaneField.HANDOFF_MODE] ===
      CONTROL_PLANE_OPERATION_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME
  ) {
    mergedContext[ControlPlaneField.HANDOFF_MODE] =
      CONTROL_PLANE_OPERATION_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME;
  }
  if (
    retained[
      REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
    ] === true ||
    incoming[
      REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
    ] === true
  ) {
    mergedContext[
      REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
    ] = true;
  }
  return mergedContext;
}

/**
 * Build the compatibility facade for sharded operation owner queues.
 *
 * @param {Object} service
 * @return {Object}
 */
function buildOperationDispatchQueueFacade(service) {
  return {
    enqueue(ownerKey, reason, context, options) {
      const queue = service.resolveOperationDispatchQueue(ownerKey);
      const retainedContext =
        resolveQueuedOperationDispatchContext(queue, ownerKey);
      const mergedContext = mergeOperationDispatchReconcileContext(
        retainedContext,
        context,
      );
      return queue.enqueue(ownerKey, reason, mergedContext, options);
    },
    shutdown() {
      for (const queue of service.operationDispatchQueues) {
        queue.shutdown();
      }
    },
    get size() {
      return service.operationDispatchQueues.reduce(
        (sum, queue) => sum + queue.size,
        0,
      );
    },
    get draining() {
      return service.operationDispatchQueues.some(
        (queue) => queue.draining === true,
      );
    },
    operationDispatchQueues: service.operationDispatchQueues,
  };
}

export {
  buildOperationDispatchQueueFacade,
};
