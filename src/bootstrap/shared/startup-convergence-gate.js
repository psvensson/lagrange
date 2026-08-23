import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
  createTimeoutBudgetError,
} from '../../control-plane/timeout-budget.js';
import {TRANSPORT_EVENT} from '../../constants/transport.js';

const LOCAL_STR_WAITFORSTARTUPCONVERGENCE_REQUIRES_EVALU = 'waitForStartupConvergence requires evaluate';
const LOCAL_STR_INTERNAL_WAKE = 'internal_wake';

const STARTUP_CONVERGENCE_TIMEOUT_KIND = Object.freeze({
  NO_PROGRESS: 'no_progress',
  ABSOLUTE_DEADLINE_EXHAUSTED: 'absolute_deadline_exhausted',
});
const STARTUP_CONVERGENCE_SIGNAL = Object.freeze({
  POLL_TICK: 'poll_tick',
});
const DEFAULT_ROUTER_EVENTS = Object.freeze([
  TRANSPORT_EVENT.CONNECTION_ESTABLISHED,
  TRANSPORT_EVENT.CONNECTION_CLOSED,
  TRANSPORT_EVENT.NODE_CONNECTED,
  TRANSPORT_EVENT.NODE_IDENTIFIED,
]);

function subscribeToSystemTableCacheChanges(
  systemTableCache,
  notify,
  options = {},
) {
  if (!systemTableCache ||
      typeof systemTableCache.onCacheChange !== 'function') {
    return () => {};
  }

  const tableNames = Array.isArray(options.tableNames) ?
    new Set(options.tableNames) :
    null;
  const listener = (tableName, operation, record, metadata) => {
    if (tableNames && !tableNames.has(tableName)) {
      return;
    }
    notify({
      kind: 'cache_change',
      tableName,
      operation,
      record,
      metadata,
    });
  };
  systemTableCache.onCacheChange(listener);
  return () => {
    if (typeof systemTableCache.offCacheChange === 'function') {
      systemTableCache.offCacheChange(listener);
    }
  };
}

function subscribeToMessageRouterEvents(
  messageRouter,
  notify,
  options = {},
) {
  if (!messageRouter ||
      typeof messageRouter.on !== 'function') {
    return () => {};
  }

  const eventNames = Array.isArray(options.eventNames) &&
    options.eventNames.length > 0 ?
    options.eventNames :
    DEFAULT_ROUTER_EVENTS;
  const unbinders = [];

  for (const eventName of eventNames) {
    const listener = (payload) => {
      notify({
        kind: 'router_event',
        eventName,
        payload,
      });
    };
    messageRouter.on(eventName, listener);
    unbinders.push(() => {
      if (typeof messageRouter.off === 'function') {
        messageRouter.off(eventName, listener);
        return;
      }
      if (typeof messageRouter.removeListener === 'function') {
        messageRouter.removeListener(eventName, listener);
      }
    });
  }

  return () => {
    for (const unbind of unbinders) {
      unbind();
    }
  };
}

async function waitForStartupConvergence(options = {}) {
  if (typeof options.evaluate !== 'function') {
    throw new Error(LOCAL_STR_WAITFORSTARTUPCONVERGENCE_REQUIRES_EVALU);
  }

  const now = typeof options.now === 'function' ?
    options.now :
    () => Date.now();
  const setTimeoutFn = typeof options.setTimeoutFn === 'function' ?
    options.setTimeoutFn :
    setTimeout;
  const clearTimeoutFn = typeof options.clearTimeoutFn === 'function' ?
    options.clearTimeoutFn :
    clearTimeout;
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0 ?
    Math.floor(options.timeoutMs) :
    0;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
    options.pollIntervalMs > 0 ?
    Math.floor(options.pollIntervalMs) :
    null;
  const subscriptions = Array.isArray(options.subscriptions) ?
    options.subscriptions :
    [];
  const buildProgressSignature =
    typeof options.buildProgressSignature === 'function' ?
      options.buildProgressSignature :
      (result) => JSON.stringify({ready: result?.ready === true});
  const timeoutClassification =
    options.timeoutClassification ||
    TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED;
  const timeoutBudget = createTimeoutBudget({
    configuredBudgetMs: timeoutMs,
  });

  let settled = false;
  let pendingSignal = options.initialSignal || null;
  let waitResolver = null;
  const unsubscribeFns = [];

  const notify = (signal) => {
    if (settled) {
      return;
    }
    if (waitResolver) {
      const resolver = waitResolver;
      waitResolver = null;
      resolver(signal || true);
      return;
    }
    pendingSignal = signal || true;
  };

  for (const subscribe of subscriptions) {
    if (typeof subscribe !== 'function') {
      continue;
    }
    const unbind = subscribe(notify);
    if (typeof unbind === 'function') {
      unsubscribeFns.push(unbind);
    }
  }

  const startMs = now();
  let attempt = 0;
  let lastResult = null;
  let lastProgressSignature = null;
  let lastProgressAtMs = startMs;
  let lastSignal = options.initialSignal || null;

  const waitForSignal = (remainingMs) => {
    if (pendingSignal) {
      const signal = pendingSignal;
      pendingSignal = null;
      return Promise.resolve(signal);
    }

    const usingPollCadence = pollIntervalMs !== null;
    const waitMs = usingPollCadence ?
      Math.min(remainingMs, pollIntervalMs) :
      remainingMs;

    return new Promise((resolve) => {
      const timer = setTimeoutFn(() => {
        if (waitResolver === onSignal) {
          waitResolver = null;
        }
        resolve(usingPollCadence ?
          {kind: STARTUP_CONVERGENCE_SIGNAL.POLL_TICK} :
          null);
      }, waitMs);
      function onSignal(signal) {
        clearTimeoutFn(timer);
        resolve(signal);
      }
      waitResolver = onSignal;
    });
  };

  try {
    while (true) {
      attempt += 1;
      const elapsedMs = Math.max(0, now() - startMs);
      lastResult = await options.evaluate({
        attempt,
        elapsedMs,
        signal: lastSignal,
      });

      if (lastResult?.ready === true) {
        return lastResult;
      }

      const progressSignature = buildProgressSignature(lastResult);
      const progressChanged = progressSignature !== lastProgressSignature;
      if (progressChanged) {
        lastProgressSignature = progressSignature;
        lastProgressAtMs = now();
      }

      let blockedOutcome = null;
      if (typeof options.onBlocked === 'function') {
        blockedOutcome = await options.onBlocked(lastResult, {
          attempt,
          elapsedMs,
          signal: lastSignal,
          progressChanged,
        });
      }

      const shouldWakeImmediately = blockedOutcome === true ||
        blockedOutcome?.wake === true;
      if (shouldWakeImmediately) {
        lastSignal = blockedOutcome?.signal || {
          kind: LOCAL_STR_INTERNAL_WAKE,
          attempt,
        };
        continue;
      }

      const remainingMs = timeoutMs - Math.max(0, now() - startMs);
      if (remainingMs <= 0) {
        break;
      }

      lastSignal = await waitForSignal(remainingMs);
      if (lastSignal === null) {
        break;
      }
    }
  } finally {
    settled = true;
    if (waitResolver) {
      waitResolver = null;
    }
    for (const unsubscribe of unsubscribeFns) {
      unsubscribe();
    }
  }

  const timeoutKind = lastProgressAtMs === startMs ?
    STARTUP_CONVERGENCE_TIMEOUT_KIND.NO_PROGRESS :
    STARTUP_CONVERGENCE_TIMEOUT_KIND.ABSOLUTE_DEADLINE_EXHAUSTED;
  const timeoutContext = {
    attempt,
    timeoutMs,
    timeoutKind,
    lastProgressElapsedMs: Math.max(0, lastProgressAtMs - startMs),
    elapsedMs: Math.max(0, now() - startMs),
  };
  if (typeof options.createTimeoutError === 'function') {
    throw options.createTimeoutError(lastResult, timeoutContext);
  }

  const error = createTimeoutBudgetError({
    message:
      options.timeoutMessage ||
      `startup convergence timed out after ${timeoutMs}ms`,
    budget: timeoutBudget,
    classification: timeoutClassification,
    nestedOperation: options.operationName || 'startup_convergence',
  });
  error.timeoutMs = timeoutMs;
  error.timeoutKind = timeoutKind;
  error.lastProgressElapsedMs = timeoutContext.lastProgressElapsedMs;
  error.result = lastResult;
  throw error;
}

export {
  STARTUP_CONVERGENCE_TIMEOUT_KIND,
  subscribeToMessageRouterEvents,
  subscribeToSystemTableCacheChanges,
  waitForStartupConvergence,
};
