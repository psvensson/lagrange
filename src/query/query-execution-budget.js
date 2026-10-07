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

// The answer a participant failed with: its own, or - when it ran as a
// one-partition distributed statement (an UPDATE or DELETE participant is
// answered with the executor's mutation summary) - the participant failure
// that summary carries, so its typed fields are read where they are.
function participantFailureAnswerOf(result) {
  const nested = result?.firstFailedParticipant;
  if (!nested || typeof nested !== 'object') {
    return result;
  }
  return {
    ...result,
    ...nested,
    partitionId: result.partitionId ?? nested.partitionId,
    failedTable: nested.failedTable ?? result.failedTable,
  };
}

/**
 * The one participant failure entry of a write or read fan-out, for every
 * statement kind: what the participant was answered (its code, entryId, log
 * index, consensus state, committed outcome, the redelivery owner's spent
 * wait) is carried as it is - no path rebuilds it and drops a field.
 * @param {Object} result - A failed participant's result.
 * @return {Object} The participant failure entry.
 */
export function buildParticipantFailureEntry(result) {
  const answer = participantFailureAnswerOf(result);
  const typed = pickTypedWriteAnswer(answer);
  return {
    partitionId: answer.partitionId,
    participantNodeId: normalizeParticipantFailureString(answer.participantNodeId),
    participantAddress: normalizeParticipantFailureString(answer.participantAddress),
    errorCode: normalizeParticipantFailureString(answer.errorCode),
    failureCode: normalizeParticipantFailureString(answer.failureCode),
    committed: answer?.committed === true,
    outcome: normalizeParticipantFailureString(answer.outcome),
    disposition: normalizeParticipantFailureString(answer.disposition),
    logIndex: Number.isSafeInteger(answer?.logIndex) ? answer.logIndex : null,
    entryId: normalizeParticipantFailureString(answer.entryId),
    ...(typed.consensus ? {consensus: typed.consensus} : {}),
    ...(typed.spentWait ? {spentWait: typed.spentWait} : {}),
    error: answer.error || ERRORS.QUERY_FAILED,
    durationMs:
      Number.isFinite(answer?.durationMs) ?
        Math.max(0, Math.floor(answer.durationMs)) :
        null,
    retryAfterMs: normalizeParticipantRetryAfterMs(answer?.retryAfterMs),
    deferRetry: answer?.deferRetry === true,
    backpressured: resolveParticipantBackpressureState(answer),
    failedTable: normalizeParticipantFailureString(answer.failedTable),
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
