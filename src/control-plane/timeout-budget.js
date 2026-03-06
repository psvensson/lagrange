const TIMEOUT_BUDGET_CLASSIFICATION = Object.freeze({
  LOCAL_SCHEDULER_STARVATION: 'local_scheduler_starvation',
  REMOTE_CALL_TIMEOUT: 'remote_call_timeout',
  PUBLICATION_WAIT_TIMEOUT: 'publication_wait_timeout',
  CACHE_VISIBILITY_TIMEOUT: 'cache_visibility_timeout',
  REBALANCE_OPERATION_TIMEOUT: 'rebalance_operation_timeout',
  ABSOLUTE_DEADLINE_EXHAUSTED: 'absolute_deadline_exhausted',
  EXACT_BOUNDARY_HIT: 'exact_boundary_hit',
});

const TIMEOUT_BUDGET_DEFAULT = Object.freeze({
  MINIMUM_OPERATION_BUDGET_MS: 5,
  REBALANCE_OPERATION_BUDGET_MS: 300000,
  SPLIT_OPERATION_BUDGET_MS: 300000,
  DISPATCH_OPERATION_BUDGET_MS: 60000,
});

const CONTROL_PLANE_TIMEOUT_DEFAULT = Object.freeze({
  SQL_QUERY_TIMEOUT_MS: 5000,
});

function resolveNow(now) {
  return typeof now === 'function' ? now : Date.now;
}

function normalizePositiveInteger(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    fallback;
}

function createTimeoutBudget(options = {}) {
  const now = resolveNow(options.now);
  const configuredBudgetMs = normalizePositiveInteger(
    options.configuredBudgetMs,
  );
  const startedAtMs = Number.isFinite(options.startedAtMs) ?
    options.startedAtMs :
    now();

  return Object.freeze({
    configuredBudgetMs,
    startedAtMs,
    deadlineMs: startedAtMs + configuredBudgetMs,
  });
}

function getBudgetTiming(budget, now) {
  const nowFn = resolveNow(now);
  const nowMs = nowFn();
  const rawRemainingMs = budget.deadlineMs - nowMs;

  return {
    nowMs,
    rawRemainingMs,
    remainingBudgetMs: Math.max(0, rawRemainingMs),
  };
}

function getRemainingBudgetMs(budget, options = {}) {
  return getBudgetTiming(budget, options.now).remainingBudgetMs;
}

function resolveControlPlaneQueryTimeoutMs(options = {}) {
  const requestedTimeoutMs = normalizePositiveInteger(
    options.requestedTimeoutMs,
    CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
  );
  const timeoutBudget = options.timeoutBudget;
  if (!timeoutBudget || typeof timeoutBudget !== 'object') {
    return requestedTimeoutMs;
  }

  const remainingBudgetMs = getRemainingBudgetMs(timeoutBudget, {
    now: options.now,
  });
  if (remainingBudgetMs <= 0) {
    return TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS;
  }

  return Math.max(
    TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
    Math.min(requestedTimeoutMs, remainingBudgetMs),
  );
}

function buildControlPlaneQueryOptions(options = {}) {
  return Object.freeze({
    timeoutMs: resolveControlPlaneQueryTimeoutMs(options),
  });
}

function buildTimeoutClassification(options = {}) {
  const budget = options.budget;
  const timing = getBudgetTiming(budget, options.now);
  const boundaryHit = timing.rawRemainingMs === 0;

  return Object.freeze({
    classification: boundaryHit ?
      TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT :
      options.classification,
    configuredBudgetMs: budget.configuredBudgetMs,
    remainingBudgetMs: timing.remainingBudgetMs,
    boundaryHit,
    nestedOperation: options.nestedOperation || null,
    operationName: budget.operationName || null,
    originalClassification: boundaryHit ?
      options.classification :
      null,
  });
}

function createChildTimeoutBudget(parentBudget, options = {}) {
  const timing = getBudgetTiming(parentBudget, options.now);
  const requestedBudgetMs = normalizePositiveInteger(
    options.requestedBudgetMs,
    timing.remainingBudgetMs,
  );
  const minimumBudgetMs = normalizePositiveInteger(
    options.minimumBudgetMs,
    TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
  );
  const grantedBudgetMs = Math.min(requestedBudgetMs, timing.remainingBudgetMs);

  if (grantedBudgetMs < minimumBudgetMs) {
    return Object.freeze({
      allowed: false,
      grantedBudgetMs,
      remainingBudgetMs: timing.remainingBudgetMs,
      budget: null,
      timeoutClassification: buildTimeoutClassification({
        budget: parentBudget,
        classification: options.classification ||
          TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
        nestedOperation: options.nestedOperation,
        now: () => timing.nowMs,
      }),
    });
  }

  return Object.freeze({
    allowed: true,
    grantedBudgetMs,
    remainingBudgetMs: timing.remainingBudgetMs,
    budget: createTimeoutBudget({
      configuredBudgetMs: grantedBudgetMs,
      startedAtMs: timing.nowMs,
      now: () => timing.nowMs,
    }),
    timeoutClassification: null,
  });
}

function createTimeoutBudgetError(options = {}) {
  const error = new Error(options.message);
  error.timeoutClassification = buildTimeoutClassification({
    budget: options.budget,
    classification: options.classification,
    nestedOperation: options.nestedOperation,
    now: options.now,
  });
  return error;
}

function createTopLevelOperationBudget(options = {}) {
  const configuredBudgetMs = normalizePositiveInteger(
    options.configuredBudgetMs,
  );
  const operationName = options.operationName || null;
  const budget = createTimeoutBudget({
    configuredBudgetMs,
    startedAtMs: options.startedAtMs,
    now: options.now,
  });
  return Object.freeze({
    ...budget,
    operationName,
  });
}

export {
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  buildTimeoutClassification,
  buildControlPlaneQueryOptions,
  createChildTimeoutBudget,
  createTimeoutBudget,
  createTimeoutBudgetError,
  createTopLevelOperationBudget,
  getRemainingBudgetMs,
  resolveControlPlaneQueryTimeoutMs,
};
