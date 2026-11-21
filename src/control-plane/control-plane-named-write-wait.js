import {RealTimeSource} from '../time/time-source.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
  createTimeoutBudgetError,
  getRemainingBudgetMs,
  resolveControlPlaneQueryTimeoutMs,
} from './timeout-budget.js';

const DEFAULT_WAIT_CLOCK = new RealTimeSource();
const NAMED_WRITE_WAIT = 'observe named control-plane write';
const NAMED_WRITE_WAIT_EXPIRED = 'Named control-plane write wait expired';

function createNamedWriteCaller(options) {
  const {cancellationToken, timeSource = DEFAULT_WAIT_CLOCK} = options;
  const now = options.now || (() => timeSource.now());
  const startedAtMs = now();
  const requestedMs = resolveControlPlaneQueryTimeoutMs({
    requestedTimeoutMs: options.timeoutMs,
  });
  const deadlineMs = Math.min(
    startedAtMs + requestedMs, options.timeoutBudget?.deadlineMs ?? Infinity);
  const budget = createTimeoutBudget({startedAtMs, configuredBudgetMs: deadlineMs - startedAtMs});
  return {cancellationToken, timeSource, now, budget};
}

function namedWriteWaitTimeout(caller) {
  const error = createTimeoutBudgetError({
    budget: caller.budget,
    now: caller.now,
    classification: TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
    nestedOperation: NAMED_WRITE_WAIT,
    message: NAMED_WRITE_WAIT_EXPIRED,
  });
  error.deferRetry = true;
  return error;
}

function requireNamedWriteWaitBudget(caller) {
  caller.cancellationToken?.throwIfCancelled();
  const remaining = getRemainingBudgetMs(caller.budget, {now: caller.now});
  if (remaining <= 0) throw namedWriteWaitTimeout(caller);
  return remaining;
}

async function waitForNamedWriteDelivery(delivery, caller) {
  const remaining = requireNamedWriteWaitBudget(caller);
  const {timeSource, cancellationToken} = caller;
  let timer = null;
  let unsubscribe = null;
  try {
    const abandon = new Promise((_resolve, reject) => {
      timer = timeSource.setTimeout(() => reject(namedWriteWaitTimeout(caller)), remaining);
      unsubscribe = cancellationToken?.onCancel((reason) => reject(new Error(reason)));
    });
    const receipt = await Promise.race([delivery, abandon]);
    requireNamedWriteWaitBudget(caller);
    return receipt;
  } finally {
    if (timer !== null) timeSource.clearTimeout(timer);
    unsubscribe?.();
  }
}

export {createNamedWriteCaller, requireNamedWriteWaitBudget, waitForNamedWriteDelivery};
