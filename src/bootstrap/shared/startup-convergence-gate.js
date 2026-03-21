import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
  createTimeoutBudgetError,
} from '../../control-plane/timeout-budget.js';
import {NUM, TYPEOF} from '../../constants/index.js';
import {TRANSPORT_EVENT} from '../../constants/transport.js';

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
      typeof systemTableCache.onCacheChange !== TYPEOF.FUNCTION) {
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
    if (typeof systemTableCache.offCacheChange === TYPEOF.FUNCTION) {
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
      typeof messageRouter.on !== TYPEOF.FUNCTION) {
    return () => {};
  }

  const eventNames = Array.isArray(options.eventNames) &&
    options.eventNames.length > NUM.ZERO ?
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
      if (typeof messageRouter.off === TYPEOF.FUNCTION) {
        messageRouter.off(eventName, listener);
        return;
      }
      if (typeof messageRouter.removeListener === TYPEOF.FUNCTION) {
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
  if (typeof options.evaluate !== TYPEOF.FUNCTION) {
    throw new Error('waitForStartupConvergence requires evaluate');
  }

  const now = typeof options.now === TYPEOF.FUNCTION ?
    options.now :
    () => Date.now();
  const setTimeoutFn = typeof options.setTimeoutFn === TYPEOF.FUNCTION ?
    options.setTimeoutFn :
    setTimeout;
  const clearTimeoutFn = typeof options.clearTimeoutFn === TYPEOF.FUNCTION ?
    options.clearTimeoutFn :
    clearTimeout;
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > NUM.ZERO ?
    Math.floor(options.timeoutMs) :
    NUM.ZERO;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
    options.pollIntervalMs > NUM.ZERO ?
    Math.floor(options.pollIntervalMs) :
    null;
  const subscriptions = Array.isArray(options.subscriptions) ?
    options.subscriptions :
    [];
  const buildProgressSignature =
    typeof options.buildProgressSignature === TYPEOF.FUNCTION ?
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
    if (typeof subscribe !== TYPEOF.FUNCTION) {
      continue;
    }
    const unbind = subscribe(notify);
    if (typeof unbind === TYPEOF.FUNCTION) {
      unsubscribeFns.push(unbind);
    }
  }

  const startMs = now();
  let attempt = NUM.ZERO;
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
      const onSignal = (signal) => {
        clearTimeoutFn(timer);
        resolve(signal);
      };
      waitResolver = onSignal;
    });
  };

  try {
    while (true) {
      attempt += NUM.ONE;
      const elapsedMs = Math.max(NUM.ZERO, now() - startMs);
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
      if (typeof options.onBlocked === TYPEOF.FUNCTION) {
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
          kind: 'internal_wake',
          attempt,
        };
        continue;
      }

      const remainingMs = timeoutMs - Math.max(NUM.ZERO, now() - startMs);
      if (remainingMs <= NUM.ZERO) {
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
    lastProgressElapsedMs: Math.max(NUM.ZERO, lastProgressAtMs - startMs),
    elapsedMs: Math.max(NUM.ZERO, now() - startMs),
  };
  if (typeof options.createTimeoutError === TYPEOF.FUNCTION) {
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
