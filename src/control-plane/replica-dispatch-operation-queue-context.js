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
 * Project only canonical progress evidence for a deferred dispatch retry.
 * Ordinary dispatch metadata is reconstructed by its existing retry owner.
 *
 * @param {Object|null} context
 * @return {Object|null}
 */
function extractOperationDispatchProgressContext(context) {
  const progressContext = {};
  if (
    context?.[ControlPlaneField.HANDOFF_MODE] ===
      CONTROL_PLANE_OPERATION_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME
  ) {
    progressContext[ControlPlaneField.HANDOFF_MODE] =
      CONTROL_PLANE_OPERATION_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME;
  }
  if (
    context?.[
      REPLICA_DISPATCH_SERVICE_LITERAL
        .RETAINED_TARGET_PROGRESS_VERIFICATION_PROVENANCE
    ] === true
  ) {
    progressContext[
      REPLICA_DISPATCH_SERVICE_LITERAL
        .RETAINED_TARGET_PROGRESS_VERIFICATION_PROVENANCE
    ] = true;
  }
  return Object.keys(progressContext).length > 0 ? progressContext : null;
}

/**
 * Merge a repeated deferral into the operation's existing retry owner slot.
 *
 * @param {Object} input
 * @return {boolean}
 */
function updateExistingOperationDispatchDeferredRetry(input) {
  const {
    deferredContext,
    desiredAttemptAt,
    errorMessage,
    existing,
    operationId,
    refreshRowBeforeDispatch,
    retryAfterMs,
    row,
    service,
  } = input;
  existing.errorMessage = errorMessage;
  existing.context = deferredContext;
  if (row) {
    existing.row = service.cloneDeferredOperationDispatchRow(row);
  }
  if (refreshRowBeforeDispatch) {
    existing[
      REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
    ] = true;
  }
  if (desiredAttemptAt < existing.nextAttemptAt) {
    if (existing.timeoutHandle) {
      service.clearTimeoutFn(existing.timeoutHandle);
    }
    existing.nextAttemptAt = desiredAttemptAt;
    existing.timeoutHandle = service.armDeferredOperationDispatchRetry(
      operationId,
      retryAfterMs,
    );
  }
  service.recordWorkflowOwnerOperationDispatchDeferredRetry(
    operationId,
    existing,
  );
  return true;
}

function retainTrueContextField(mergedContext, retained, incoming, field) {
  if (retained[field] === true || incoming[field] === true) {
    mergedContext[field] = true;
  }
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
  retainTrueContextField(
    mergedContext,
    retained,
    incoming,
    REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH,
  );
  retainTrueContextField(
    mergedContext,
    retained,
    incoming,
    REPLICA_DISPATCH_SERVICE_LITERAL
      .RETAINED_TARGET_PROGRESS_VERIFICATION_PROVENANCE,
  );
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
  extractOperationDispatchProgressContext,
  mergeOperationDispatchReconcileContext,
  updateExistingOperationDispatchDeferredRetry,
};
