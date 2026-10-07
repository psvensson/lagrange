import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const OPERATION_PERSIST_RETRY_WAIT = Object.freeze({
  wait: 'OPERATION_PERSIST_RETRY_TIMEOUT_MS',
  awaited: 'replica_operations mutation committed by the control plane',
});

// The persist-retry bound (the local timeout, or the caller's tighter
// timeout budget) is spent with the mutation still failing retryably:
// one wait_bound_spent ERROR; the caller still gets the last failure.
function reportOperationMutationRetrySpent(
  owner,
  result,
  spent,
  getControlPlaneErrorCode,
  localBoundMs,
) {
  const budgeted = Boolean(spent.options?.timeoutBudget);
  reportWaitBoundSpent(owner.logger, {
    ...OPERATION_PERSIST_RETRY_WAIT,
    boundMs: spent.elapsedMs + spent.remainingMs,
    elapsedMs: spent.elapsedMs,
    lastObserved: () => ({
      errorCode: getControlPlaneErrorCode(result) || null,
      error: owner.getOperationPersistErrorMessage(result) || null,
      retryAttempt: spent.retryAttempt,
      callerBudgetBound: budgeted,
      localBoundMs,
    }),
    scope: {
      nodeId: owner.nodeId || null,
      ownerId: spent.options?.ownerId || null,
    },
  });
}

export {reportOperationMutationRetrySpent};
