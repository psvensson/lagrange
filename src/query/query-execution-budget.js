import {ERRORS} from '../constants/index.js';

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

/**
 * Carry the routing denial cause onto an Error that reports a partition
 * execution failure. It is an own property beside errorCode, retryAfterMs and
 * deferRetry - never a message, a code or a class - so every string-matching
 * consumer of these errors keeps matching exactly as it did, and an error
 * with no routing denial behind it keeps main's exact shape.
 *
 * @param {Error} error - The error about to be thrown.
 * @param {Object|null} result - The partition execution result it reports.
 * @return {Error} That same error.
 */
export function attachRoutingDenialCause(error, result) {
  const cause = normalizeParticipantFailureString(result?.routingDenialCause);
  if (cause !== null && error && typeof error === 'object') {
    error.routingDenialCause = cause;
  }
  return error;
}

/**
 * The routing denial cause an error-like reports, wherever it carries it: on
 * the error itself, or on the first participant failure that names one. The
 * counterpart of `attachRoutingDenialCause`, so reading and writing the field
 * stay in one place.
 *
 * @param {Object|null} errorLike - An Error or a partition execution result.
 * @return {string|null} The typed cause, or null when none is stated.
 */
export function readRoutingDenialCause(errorLike) {
  const direct = normalizeParticipantFailureString(
    errorLike?.routingDenialCause,
  );
  if (direct !== null) {
    return direct;
  }
  // The failed participants, under either of the two names the query path
  // gives them: `participantFailures` on a distributed failure, and
  // `failedPartitions` on a partition-callback dispatcher outcome.
  const failures = Array.isArray(errorLike?.participantFailures) ?
    errorLike.participantFailures :
    (Array.isArray(errorLike?.failedPartitions) ?
      errorLike.failedPartitions :
      []);
  for (let index = 0; index < failures.length; index += 1) {
    const cause = normalizeParticipantFailureString(
      failures[index]?.routingDenialCause,
    );
    if (cause !== null) {
      return cause;
    }
  }
  return null;
}

export function buildParticipantFailureEntry(result) {
  return {
    partitionId: result.partitionId,
    // The cause of the routing denial this participant failure came out of,
    // when one did. `Partition service not found` on a heartbeat write was
    // exactly the participant failure the traced victim saw, and it could not
    // be told from a partition whose service rows are genuinely absent.
    routingDenialCause: normalizeParticipantFailureString(
      result.routingDenialCause,
    ),
    participantNodeId: normalizeParticipantFailureString(result.participantNodeId),
    participantAddress: normalizeParticipantFailureString(result.participantAddress),
    errorCode: normalizeParticipantFailureString(result.errorCode),
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

// `routingDenialCause` is the typed routing reason of the last resolution
// that found no candidate at all: `all_services_filtered_by_readiness` when
// readiness denied every active addressed row, `no_service_rows` when the
// partition has none. The message and the code are unchanged, so a caller
// that matched on them keeps matching; a caller that wants to tell a
// readiness freeze from a missing service now can.
export function buildPartitionExecutionFailureResult({
  partitionId,
  failedTable,
  errorMessage,
  details = {},
  routingDenialCause = null,
}) {
  return {
    partitionId,
    success: false,
    error: errorMessage || ERRORS.QUERY_FAILED,
    routingDenialCause: normalizeParticipantFailureString(routingDenialCause),
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
