import {
  REPLICA_DISPATCH_SERVICE_SHARED,
} from './replica-dispatch-service-shared.js';

const {REPLICA_DISPATCH_SERVICE_LITERAL} = REPLICA_DISPATCH_SERVICE_SHARED;

function retainDispatchVerification(
  service,
  operationId,
  row,
  retryAfterMs,
  errorMessage,
  context = null,
) {
  const deferredRetry = {
    context,
    errorMessage,
    nextAttemptAt: Date.now() + retryAfterMs,
    row: row ? service.cloneDeferredOperationDispatchRow(row) : null,
    [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]: true,
    timeoutHandle: service.armDeferredOperationDispatchRetryWithOptions(
      operationId,
      retryAfterMs,
      {
        [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]: true,
      },
    ),
  };
  service.operationDispatchDeferredRetries.set(operationId, deferredRetry);
  service.recordWorkflowOwnerOperationDispatchDeferredRetry(
    operationId,
    deferredRetry,
    retryAfterMs,
  );
  return true;
}

function scheduleRemoteDispatchWakeupVerification(
  service,
  operationId,
  row = null,
) {
  if (!operationId) {
    return false;
  }
  service.clearDeferredOperationDispatchRetry(operationId);
  return retainDispatchVerification(
    service,
    operationId,
    row,
    service.operationDispatchRetryAfterMs,
    REPLICA_DISPATCH_SERVICE_LITERAL.DIRECT_WAKEUP_VERIFICATION,
  );
}

export {
  scheduleRemoteDispatchWakeupVerification,
};
