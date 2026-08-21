import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  OPERATION_OWNER_RESUME_ACTION,
  OPERATION_OWNER_RETRY_ACTION,
  OPERATION_OWNER_RETRY_KIND,
  buildOperationOwnerResumeOutcome,
  buildOperationOwnerRetryOutcome,
} from './topology-owner-constants.js';

const {
  OPERATION_OWNER_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REBALANCE_COORDINATOR_LOG_MSG,
  TRANSITION_RETRY_DELAY_MS,
  WORKFLOW_STEP,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;

function selectTransitionRetryRetainedOperation(
  owner,
  operationId,
  retryContext,
) {
  return retryContext.operationSnapshot ||
    retryContext.operation ||
    owner.getTransitionRetryOperationSnapshot(operationId);
}

function buildUninitializedTransitionRetryError(retryContext) {
  const error = new Error(
    OPERATION_WORKFLOW_OWNER_LITERAL
      .RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE,
  );
  error.code =
    OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
  error.errorCode =
    OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
  error.deferRetry = true;
  error.retryAfterMs = TRANSITION_RETRY_DELAY_MS;
  error.partitionId = retryContext.partitionId || null;
  return error;
}

function shouldRetainTransitionRetryWhileUninitialized(
  owner,
  operationId,
  retryContext,
) {
  const operation = selectTransitionRetryRetainedOperation(
    owner,
    operationId,
    retryContext,
  );
  const workflowStep =
    retryContext.workflowStep || operation?.workflowStep || WORKFLOW_STEP.PENDING;
  const now = Date.now();
  if (
    !operation ||
    owner.isDispatchRetryableWorkflowStep(operation) !== true ||
    owner.hasActiveTransitionRetryGrace(operationId, now) !== true ||
    owner.shouldUseOperationBudgetTransitionRetryGrace(
      retryContext,
      workflowStep,
    ) !== true
  ) {
    return false;
  }
  const handoffTimeoutDecision =
    owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision?.(
      operation,
      now,
    );
  return handoffTimeoutDecision?.shouldStop !== true;
}

function rearmTransitionRetryWhileUninitialized(
  owner,
  operationId,
  retryContext,
) {
  if (
    !shouldRetainTransitionRetryWhileUninitialized(
      owner,
      operationId,
      retryContext,
    )
  ) {
    return false;
  }
  return owner.deferTransitionRetry(
    operationId,
    buildUninitializedTransitionRetryError(retryContext),
    retryContext,
  );
}

async function resumeDeferredTransitionOperation(owner, operationId) {
  const visibilityObservation =
    await owner.repository.getOperationByIdVisibilityObservation(operationId, {
      allowPriorityRecoveryDeferredVisibility: true,
    });
  const operation =
    visibilityObservation?.operation ||
    owner.getTransitionRetryOperationSnapshot(operationId);
  const now = Date.now();
  const resumeOutcome = buildOperationOwnerResumeOutcome({
    operationAvailable: Boolean(operation),
    terminalOperation: operation ?
      owner.repository.isOperationTerminal(operation) :
      false,
    locallyOwned: operation ?
      owner.repository.isOperationLocallyOwned(operation) :
      false,
    dispatchRetryable: operation ?
      owner.isDispatchRetryableWorkflowStep(operation) :
      false,
    retryGraceActive: owner.hasActiveTransitionRetryGrace(operationId, now),
    stepTimedOut: operation ?
      owner.isOperationStepTimedOut(operation, now) :
      false,
  });
  if (resumeOutcome.action === OPERATION_OWNER_RESUME_ACTION.CLEAR_RETRY) {
    owner.clearTransitionRetry(operationId);
    return;
  }
  if (resumeOutcome.action === OPERATION_OWNER_RESUME_ACTION.DISPATCH) {
    await owner.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.DISPATCH,
      operation,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.TRANSITION_RETRY_RESUME,
        workflowStep: operation.workflowStep || null,
        partitionId: operation.partitionId || null,
        runInlineWhenOwnerLaneHeld: true,
      },
    );
    return;
  }
  await owner.reconcileTimeoutOperation(operation, now);
}

function deferTransitionRetry(
  owner,
  operationId,
  errorLike,
  retryContext = {},
) {
  const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
  const retryOutcome = buildOperationOwnerRetryOutcome({
    operationId,
    retryable: isRetryableControlPlaneError(errorLike),
    timerActive: owner.transitionRetryTimerByOperationId.has(operationId),
    retryAfterMs,
    fallbackDelayMs: TRANSITION_RETRY_DELAY_MS,
    retryKind: OPERATION_OWNER_RETRY_KIND.TRANSITION,
  });
  if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REJECT) {
    return false;
  }
  owner.recordTransitionRetryOperationSnapshot(
    retryContext.operationSnapshot || retryContext.operation || null,
  );
  const delayMs = retryOutcome.delayMs;
  owner.recordTransitionRetryGrace(operationId, retryContext, delayMs);
  if (retryOutcome.action === OPERATION_OWNER_RETRY_ACTION.REUSE_TIMER) {
    return true;
  }
  const errorMessage = owner.normalizeErrorMessage(
    errorLike,
    'Retryable control-plane transition failure',
  );
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
    {
      operationId,
      boundary: retryContext.boundary || null,
      partitionId: retryContext.partitionId || null,
      workflowStep: retryContext.workflowStep || null,
      delayMs,
      errorMessage,
    },
  );
  const timerHandle = owner.setTimeoutFn(() => {
    owner.transitionRetryTimerByOperationId.delete(operationId);
    if (owner.isShuttingDown) {
      return;
    }
    if (!owner.isInitialized) {
      rearmTransitionRetryWhileUninitialized(
        owner,
        operationId,
        retryContext,
      );
      return;
    }
    return owner.operationWorkflowRunExclusive(
      owner.getOperationOwnerSingleFlightKey(operationId),
      () => owner.resumeDeferredTransitionOperation(operationId),
    ).catch((retryError) => {
      owner.handleDeferredTransitionRetryFailure(
        operationId,
        retryError,
        retryContext,
      );
    });
  }, delayMs);
  owner.transitionRetryTimerByOperationId.set(operationId, timerHandle);
  return true;
}

function handleDeferredTransitionRetryFailure(
  owner,
  operationId,
  error,
  retryContext = {},
) {
  if (owner.deferTransitionRetry(operationId, error, retryContext)) {
    return;
  }
  owner.logger.error(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_FAILED,
    {
      operationId,
      boundary: retryContext.boundary || null,
      partitionId: retryContext.partitionId || null,
      workflowStep: retryContext.workflowStep || null,
      error: error?.message || error?.error || String(error),
    },
  );
}

export {
  deferTransitionRetry,
  handleDeferredTransitionRetryFailure,
  resumeDeferredTransitionOperation,
};
