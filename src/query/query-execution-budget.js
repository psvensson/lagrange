import {ERRORS} from '../constants/index.js';
import {pickTypedWriteAnswer} from '../partition/partition-write-kernel.js';

const QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE =
  'pre_submission_route_unavailable';

const QUERY_EXECUTION_BUDGET_FIELD = Object.freeze({
  DELIVERY_SOURCE: 'deliverySource',
  DELIVERY_PRIORITY: 'deliveryPriority',
  REPLACE_PENDING_KEY: 'replacePendingKey',
});

export function normalizeParticipantFailureString(value) {
  return typeof value === 'string' && value.length > 0 ?
    value :
    null;
}

export function normalizeParticipantRetryAfterMs(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

export function resolveParticipantBackpressureState(result = {}) {
  if (typeof result?.backpressured === 'boolean') {
    return result.backpressured;
  }
  if (result?.deferRetry === true) {
    return true;
  }
  return Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > 0;
}

export function buildParticipantFailureEntry(result) {
  return {
    partitionId: result.partitionId,
    participantNodeId: normalizeParticipantFailureString(result.participantNodeId),
    participantAddress: normalizeParticipantFailureString(result.participantAddress),
    errorCode: normalizeParticipantFailureString(result.errorCode),
    failureCode: normalizeParticipantFailureString(result.failureCode),
    committed: result?.committed === true,
    outcome: normalizeParticipantFailureString(result.outcome),
    disposition: normalizeParticipantFailureString(result.disposition),
    logIndex: Number.isSafeInteger(result?.logIndex) ? result.logIndex : null,
    entryId: normalizeParticipantFailureString(result.entryId),
    ...(result?.spentWait ? {spentWait: result.spentWait} : {}),
    error: result.error || ERRORS.QUERY_FAILED,
    durationMs:
      Number.isFinite(result?.durationMs) ?
        Math.max(0, Math.floor(result.durationMs)) :
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
      participantFailures.length > 0 ?
        participantFailures[0] :
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
    // The typed fields of the answer the delivery failed on (its code, its
    // entryId): a typed outcome never degrades to its text at this hop.
    ...pickTypedWriteAnswer(details),
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
    failureDetails.retryAfterMs > 0 ?
    Math.max(defaultRetryDelayMs, failureDetails.retryAfterMs) :
    defaultRetryDelayMs;
}

export {QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE};

export function createPartitionExecutionBudget({
  executionOptions = {},
  cancellationToken = null,
  delay,
  throwIfCancelled,
  nowFn = Date.now,
} = {}) {
  const executionTimeoutMs =
    Number.isFinite(executionOptions?.timeoutMs) &&
    executionOptions.timeoutMs > 0 ?
      Math.floor(executionOptions.timeoutMs) :
      null;
  const executionDeadlineMs =
    executionTimeoutMs === null ? null : nowFn() + executionTimeoutMs;
  let routerDeliveryAttemptCount = 0;

  const getRemainingExecutionBudgetMs = () => {
    if (executionDeadlineMs === null) {
      return null;
    }
    return Math.max(0, executionDeadlineMs - nowFn());
  };

  const getRouterDeliveryTimeoutMs = () => {
    if (executionTimeoutMs === null) {
      return null;
    }
    if (routerDeliveryAttemptCount === 0) {
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
        ] === 'string' &&
        executionOptions.deliveryPriority.length > 0
      ) {
        routerOptions.deliveryPriority = executionOptions.deliveryPriority;
      }
      if (
        typeof executionOptions?.[
          QUERY_EXECUTION_BUDGET_FIELD.DELIVERY_SOURCE
        ] === 'string' &&
        executionOptions.deliverySource.length > 0
      ) {
        routerOptions.deliverySource = executionOptions.deliverySource;
      }
      if (
        typeof executionOptions?.[
          QUERY_EXECUTION_BUDGET_FIELD.REPLACE_PENDING_KEY
        ] === 'string' &&
        executionOptions.replacePendingKey.length > 0
      ) {
        routerOptions.replacePendingKey = executionOptions.replacePendingKey;
      }
      const routerDeliveryTimeoutMs = getRouterDeliveryTimeoutMs();
      if (routerDeliveryTimeoutMs !== null) {
        if (routerDeliveryTimeoutMs <= 0) {
          return null;
        }
        routerOptions.timeoutMs = routerDeliveryTimeoutMs;
      }
      return Object.keys(routerOptions).length === 0 ?
        undefined :
        routerOptions;
    },
    recordRouterDeliveryAttempt() {
      routerDeliveryAttemptCount += 1;
    },
    async waitForRetryBudget(retryDelayMs) {
      const normalizedRetryDelayMs =
        Number.isFinite(retryDelayMs) && retryDelayMs > 0 ?
          Math.floor(retryDelayMs) :
          0;
      const remainingBudgetMs = getRemainingExecutionBudgetMs();
      if (remainingBudgetMs === null) {
        if (normalizedRetryDelayMs > 0) {
          await delay(normalizedRetryDelayMs);
          throwIfCancelled(cancellationToken);
        }
        return true;
      }
      if (remainingBudgetMs <= 0) {
        return false;
      }
      if (normalizedRetryDelayMs > remainingBudgetMs) {
        return false;
      }
      if (normalizedRetryDelayMs > 0) {
        await delay(normalizedRetryDelayMs);
        throwIfCancelled(cancellationToken);
      }
      const nextRemainingBudgetMs = getRemainingExecutionBudgetMs();
      return nextRemainingBudgetMs === null || nextRemainingBudgetMs > 0;
    },
  });
}
