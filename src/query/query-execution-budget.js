import {ERRORS, NUM, TYPEOF} from '../constants/index.js';

const QUERY_EXECUTION_BUDGET_FIELD = Object.freeze({
  DELIVERY_SOURCE: 'deliverySource',
  DELIVERY_PRIORITY: 'deliveryPriority',
  REPLACE_PENDING_KEY: 'replacePendingKey',
});

export function normalizeParticipantFailureString(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

export function normalizeParticipantRetryAfterMs(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ? Math.floor(value) : null;
}

export function resolveParticipantBackpressureState(result = {}) {
  if (typeof result?.backpressured === TYPEOF.BOOLEAN) {
    return result.backpressured;
  }
  if (result?.deferRetry === true) {
    return true;
  }
  return Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > NUM.ZERO;
}

export function buildParticipantFailureEntry(result) {
  return {
    partitionId: result.partitionId,
    participantNodeId: normalizeParticipantFailureString(result.participantNodeId),
    participantAddress: normalizeParticipantFailureString(result.participantAddress),
    errorCode: normalizeParticipantFailureString(result.errorCode),
    error: result.error || ERRORS.QUERY_FAILED,
    durationMs:
      Number.isFinite(result?.durationMs) ?
        Math.max(NUM.ZERO, Math.floor(result.durationMs)) :
        null,
    retryAfterMs: normalizeParticipantRetryAfterMs(result?.retryAfterMs),
    deferRetry: result?.deferRetry === true,
    backpressured: resolveParticipantBackpressureState(result),
    failedTable: normalizeParticipantFailureString(result.failedTable),
  };
}

export function buildDistributedFailureSummary(failedResults) {
  const participantFailures = failedResults.map((result) =>
    buildParticipantFailureEntry(result),
  );
  return {
    failedPartitions: failedResults.map((result) => result.partitionId),
    partitionErrors: participantFailures,
    participantFailures,
    firstFailedParticipant:
      participantFailures.length > NUM.ZERO ?
        participantFailures[NUM.ZERO] :
        null,
  };
}

export function buildPartitionExecutionFailureResult({
  partitionId,
  failedTable,
  errorMessage,
  details = {},
}) {
  return {
    partitionId,
    success: false,
    error: errorMessage || ERRORS.QUERY_FAILED,
    errorCode: normalizeParticipantFailureString(
      details?.errorCode || details?.code,
    ),
    retryAfterMs: normalizeParticipantRetryAfterMs(details?.retryAfterMs),
    deferRetry: details?.deferRetry === true,
    participantNodeId: normalizeParticipantFailureString(
      details?.participantNodeId,
    ),
    participantAddress: normalizeParticipantFailureString(
      details?.participantAddress,
    ),
    backpressured: resolveParticipantBackpressureState(details),
    failedTable,
    rows: [],
  };
}

export function resolvePartitionRetryDelayMs(
  defaultRetryDelayMs,
  failureDetails = null,
) {
  return Number.isFinite(failureDetails?.retryAfterMs) &&
    failureDetails.retryAfterMs > NUM.ZERO ?
    Math.max(defaultRetryDelayMs, failureDetails.retryAfterMs) :
    defaultRetryDelayMs;
}

export function createPartitionExecutionBudget({
  executionOptions = {},
  cancellationToken = null,
  delay,
  throwIfCancelled,
  nowFn = Date.now,
} = {}) {
  const executionTimeoutMs =
    Number.isFinite(executionOptions?.timeoutMs) &&
    executionOptions.timeoutMs > NUM.ZERO ?
      Math.floor(executionOptions.timeoutMs) :
      null;
  const executionDeadlineMs =
    executionTimeoutMs === null ? null : nowFn() + executionTimeoutMs;
  let routerDeliveryAttemptCount = NUM.ZERO;

  const getRemainingExecutionBudgetMs = () => {
    if (executionDeadlineMs === null) {
      return null;
    }
    return Math.max(NUM.ZERO, executionDeadlineMs - nowFn());
  };

  const getRouterDeliveryTimeoutMs = () => {
    if (executionTimeoutMs === null) {
      return null;
    }
    if (routerDeliveryAttemptCount === NUM.ZERO) {
      return executionTimeoutMs;
    }
    return getRemainingExecutionBudgetMs();
  };

  return Object.freeze({
    getRemainingExecutionBudgetMs,
    buildRouterDeliveryOptions() {
      const routerOptions = {};
      if (
        typeof executionOptions?.[
          QUERY_EXECUTION_BUDGET_FIELD.DELIVERY_PRIORITY
        ] === TYPEOF.STRING &&
        executionOptions.deliveryPriority.length > NUM.ZERO
      ) {
        routerOptions.deliveryPriority = executionOptions.deliveryPriority;
      }
      if (
        typeof executionOptions?.[
          QUERY_EXECUTION_BUDGET_FIELD.DELIVERY_SOURCE
        ] === TYPEOF.STRING &&
        executionOptions.deliverySource.length > NUM.ZERO
      ) {
        routerOptions.deliverySource = executionOptions.deliverySource;
      }
      if (
        typeof executionOptions?.[
          QUERY_EXECUTION_BUDGET_FIELD.REPLACE_PENDING_KEY
        ] === TYPEOF.STRING &&
        executionOptions.replacePendingKey.length > NUM.ZERO
      ) {
        routerOptions.replacePendingKey = executionOptions.replacePendingKey;
      }
      const routerDeliveryTimeoutMs = getRouterDeliveryTimeoutMs();
      if (routerDeliveryTimeoutMs !== null) {
        if (routerDeliveryTimeoutMs <= NUM.ZERO) {
          return null;
        }
        routerOptions.timeoutMs = routerDeliveryTimeoutMs;
      }
      return Object.keys(routerOptions).length === NUM.ZERO ?
        undefined :
        routerOptions;
    },
    recordRouterDeliveryAttempt() {
      routerDeliveryAttemptCount += NUM.ONE;
    },
    async waitForRetryBudget(retryDelayMs) {
      const normalizedRetryDelayMs =
        Number.isFinite(retryDelayMs) && retryDelayMs > NUM.ZERO ?
          Math.floor(retryDelayMs) :
          NUM.ZERO;
      const remainingBudgetMs = getRemainingExecutionBudgetMs();
      if (remainingBudgetMs === null) {
        if (normalizedRetryDelayMs > NUM.ZERO) {
          await delay(normalizedRetryDelayMs);
          throwIfCancelled(cancellationToken);
        }
        return true;
      }
      if (remainingBudgetMs <= NUM.ZERO) {
        return false;
      }
      if (normalizedRetryDelayMs > remainingBudgetMs) {
        return false;
      }
      if (normalizedRetryDelayMs > NUM.ZERO) {
        await delay(normalizedRetryDelayMs);
        throwIfCancelled(cancellationToken);
      }
      const nextRemainingBudgetMs = getRemainingExecutionBudgetMs();
      return nextRemainingBudgetMs === null || nextRemainingBudgetMs > NUM.ZERO;
    },
  });
}
