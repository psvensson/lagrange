import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  QUERY_EXECUTOR_LITERAL,
} = QUERY_EXECUTOR_SHARED;

const READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS = 1; // ends-on: n/a clamp
const READ_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS = // ends-on: the cold read candidate answers the delivery (1 ms: it is deferred unless already connected)
  READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS;
const RECOVERY_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS = // ends-on: the cold recovery candidate answers the delivery (1 ms: it is deferred unless already connected)
  READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS;
const RECOVERY_CANDIDATE_CONNECTED_CONNECTION_STATE = 'connected';
const RECOVERY_CANDIDATE_CONNECTING_CONNECTION_STATE = 'connecting';
const RECOVERY_CANDIDATE_UNOBSERVED_CONNECTION_STATE = 'unobserved';
const PARTITION_EXECUTION_DEADLINE_WAIT = Object.freeze({
  wait: 'partition_execution_deadline',
  awaited: 'successful partition delivery before the execution deadline',
  retryDelay: 'retry_delay_exceeds_budget',
  beforeRetry: 'budget_spent_before_retry',
  afterRetry: 'budget_spent_after_retry_delay',
  beforeDelivery: 'budget_spent_before_delivery',
  beforeAttempt: 'budget_spent_before_attempt',
});
const READ_ATTEMPTS_WAIT = Object.freeze({
  wait: 'getReadRetryAttemptLimit',
  awaited: 'successful partition read within the read attempt limit',
});

/**
 * One spent-bound reporter per executeOnPartition call: the deadline (or
 * the read attempt limit) is reported once, with the caller's observed
 * delivery state.
 * @param {Object} context - {executor, partitionId, forRead,
 *   executionTimeoutMs, startedAtMs, executionOptions}.
 * @return {Object} {setObserver, reportDeadlineSpent,
 *   reportReadAttemptsSpent}
 * @private
 */
function createPartitionSpentReporter(context) {
  let observe = null;
  let reported = false;
  const report = (waitIdentity, boundMs, extra) => {
    if (reported) {
      return;
    }
    reported = true;
    reportWaitBoundSpent(context.executor.logger, {
      wait: waitIdentity.wait,
      awaited: waitIdentity.awaited,
      boundMs,
      elapsedMs: executorNow(context.executor) - context.startedAtMs,
      lastObserved: {...(observe ? observe() : null), ...extra},
      scope: {
        partitionId: context.partitionId,
        forRead: context.forRead,
        nodeId: context.executor.nodeId ?? null,
      },
    });
  };
  return Object.freeze({
    setObserver: (fn) => {
      observe = fn;
    },
    reportDeadlineSpent: (site, extra = {}) => report(
      PARTITION_EXECUTION_DEADLINE_WAIT,
      context.executionTimeoutMs,
      {site, ...extra},
    ),
    reportReadAttemptsSpent: (maxAttempts) => report(
      READ_ATTEMPTS_WAIT,
      null,
      {maxAttempts},
    ),
  });
}

function resolvePartitionExecutionTimeoutMs(executor, forRead, options) {
  if (Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0) {
    return Math.floor(options.timeoutMs);
  }
  if (
    !forRead &&
    Number.isFinite(executor.queryTimeoutMs) &&
    executor.queryTimeoutMs > 0
  ) {
    return Math.floor(executor.queryTimeoutMs);
  }
  return null;
}

// The executing node's clock, when it was given one.
function executorNow(executor) {
  return typeof executor?.nowFn === 'function' ? executor.nowFn() : Date.now();
}

function createPartitionAttemptBudget({
  executor,
  partitionId,
  forRead,
  executionOptions = {},
  routingReadinessDimension,
  cancellationToken = null,
}) {
  const executionTimeoutMs = resolvePartitionExecutionTimeoutMs(
    executor,
    forRead,
    executionOptions,
  );
  const parentDeadlineMs =
    Number.isFinite(executionOptions?.timeoutBudget?.deadlineMs) ?
      Math.floor(executionOptions.timeoutBudget.deadlineMs) :
      null;
  const localDeadlineMs =
    executionTimeoutMs === null ? null : executorNow(executor) + executionTimeoutMs;
  const executionDeadlineMs =
    parentDeadlineMs === null ?
      localDeadlineMs :
      localDeadlineMs === null ?
        parentDeadlineMs :
        Math.min(parentDeadlineMs, localDeadlineMs);
  const spentReporter = createPartitionSpentReporter({
    executor,
    partitionId,
    forRead,
    executionTimeoutMs: executionDeadlineMs === null ?
      null :
      executionDeadlineMs - executorNow(executor),
    startedAtMs: executorNow(executor),
  });
  const getRemainingExecutionBudgetMs = () => {
    if (executionDeadlineMs === null) {
      return null;
    }
    return Math.max(0, executionDeadlineMs - executorNow(executor));
  };
  const resolveRecoveryCandidateConnectionState = (candidate) => {
    const candidateNodeId =
      typeof candidate?.nodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      candidate.nodeId.length > 0 ?
        candidate.nodeId :
        typeof candidate?.node_id === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        candidate.node_id.length > 0 ?
          candidate.node_id :
          null;
    if (candidateNodeId && candidateNodeId === executor.nodeId) {
      return RECOVERY_CANDIDATE_CONNECTED_CONNECTION_STATE;
    }
    if (
      !candidateNodeId ||
      typeof executor.messageRouter?.getConnectionState !==
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return RECOVERY_CANDIDATE_UNOBSERVED_CONNECTION_STATE;
    }
    return executor.messageRouter.getConnectionState(candidateNodeId);
  };
  const shouldUseRecoveryCandidateReconnectBudget = () => {
    if (
      routingReadinessDimension !==
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ) {
      return false;
    }
    if (forRead) {
      return true;
    }
    return classifySystemPartition({
      partitionId,
      partitionRow: executor.getPartitionRecord(partitionId),
    }).priorityControlPlane;
  };
  const shouldDeferRecoveryCandidateColdReconnect = (
    candidate,
    queue = null,
  ) => {
    if (!shouldUseRecoveryCandidateReconnectBudget()) {
      return false;
    }
    const connectionState = resolveRecoveryCandidateConnectionState(candidate);
    const isRecoveryRead =
      forRead &&
      routingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    if (
      isRecoveryRead &&
      connectionState !== RECOVERY_CANDIDATE_CONNECTED_CONNECTION_STATE
    ) {
      return true;
    }
    if (Array.isArray(queue) && queue.length > 1) {
      const hasConnected = queue.some((cand) => {
        const state = resolveRecoveryCandidateConnectionState(cand);
        return state === RECOVERY_CANDIDATE_CONNECTED_CONNECTION_STATE;
      });
      if (!hasConnected) {
        return false;
      }
    }
    return (
      connectionState === null ||
      connectionState === RECOVERY_CANDIDATE_CONNECTING_CONNECTION_STATE ||
      connectionState === QUERY_EXECUTOR_LITERAL.STRING_RECONNECTING ||
      connectionState === QUERY_EXECUTOR_LITERAL.STRING_DISCONNECTED ||
      connectionState === QUERY_EXECUTOR_LITERAL.STRING_CLOSED
    ) && connectionState !== RECOVERY_CANDIDATE_UNOBSERVED_CONNECTION_STATE;
  };
  const shouldBoundRecoveryCandidateAckTimeout = (candidate) => {
    if (!shouldUseRecoveryCandidateReconnectBudget()) {
      return false;
    }
    const connectionState = resolveRecoveryCandidateConnectionState(candidate);
    return connectionState === RECOVERY_CANDIDATE_CONNECTED_CONNECTION_STATE;
  };
  const countRemainingReadCandidates = (
    candidateQueue,
    currentCandidateIndex,
    attemptedAddresses,
  ) => {
    if (!forRead || !Array.isArray(candidateQueue)) {
      return 1;
    }
    let remainingCount = 1;
    for (
      let index = currentCandidateIndex + 1;
      index < candidateQueue.length;
      index += 1
    ) {
      const address = candidateQueue[index]?.address;
      if (
        typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        address.length > 0 &&
        !attemptedAddresses.has(address)
      ) {
        remainingCount += 1;
      }
    }
    return remainingCount;
  };
  const resolveRouterDeliveryTimeoutMs = (
    remainingBudgetMs,
    candidateQueue,
    currentCandidateIndex,
    attemptedAddresses,
  ) => {
    const candidate = Array.isArray(candidateQueue) ?
      candidateQueue[currentCandidateIndex] :
      null;
    if (shouldDeferRecoveryCandidateColdReconnect(candidate, candidateQueue)) {
      return Math.min(
        remainingBudgetMs,
        forRead ?
          READ_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS :
          RECOVERY_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS,
      );
    }
    const remainingReadCandidates = countRemainingReadCandidates(
      candidateQueue,
      currentCandidateIndex,
      attemptedAddresses,
    );
    const capRecoveryCandidateBudget = (deliveryTimeoutMs) => {
      if (!shouldBoundRecoveryCandidateAckTimeout(candidate)) {
        return deliveryTimeoutMs;
      }
      const reconnectIntervalMs = Number(
        executor.messageRouter?.reconnectIntervalMs,
      );
      if (
        !Number.isFinite(reconnectIntervalMs) ||
        reconnectIntervalMs <= 0
      ) {
        return deliveryTimeoutMs;
      }
      return Math.min(
        deliveryTimeoutMs,
        Math.max(
          READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS,
          Math.floor(reconnectIntervalMs),
        ),
      );
    };
    if (remainingReadCandidates <= 1) {
      return capRecoveryCandidateBudget(remainingBudgetMs);
    }
    return capRecoveryCandidateBudget(Math.max(
      READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS,
      Math.floor(remainingBudgetMs / remainingReadCandidates),
    ));
  };
  const buildRouterDeliveryOptions = (
    candidateQueue = null,
    currentCandidateIndex = 0,
    attemptedAddresses = new Set(),
  ) => {
    const routerOptions = {};
    if (
      typeof executionOptions?.deliveryPriority ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.deliveryPriority.length > 0
    ) {
      routerOptions.deliveryPriority = executionOptions.deliveryPriority;
    }
    if (
      typeof executionOptions?.deliverySource ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.deliverySource.length > 0
    ) {
      routerOptions.deliverySource = executionOptions.deliverySource;
    }
    if (
      typeof executionOptions?.replacePendingKey ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.replacePendingKey.length > 0
    ) {
      routerOptions.replacePendingKey = executionOptions.replacePendingKey;
    }
    const remainingBudgetMs = getRemainingExecutionBudgetMs();
    if (remainingBudgetMs !== null) {
      if (remainingBudgetMs <= 0) {
        spentReporter.reportDeadlineSpent(
          PARTITION_EXECUTION_DEADLINE_WAIT.beforeDelivery,
        );
        return null;
      }
      routerOptions.timeoutMs = resolveRouterDeliveryTimeoutMs(
        remainingBudgetMs,
        candidateQueue,
        currentCandidateIndex,
        attemptedAddresses,
      );
    }
    if (Object.keys(routerOptions).length === 0) {
      return undefined;
    }
    return routerOptions;
  };
  const waitForRetryBudget = async (retryDelayMs) => {
    // Stop retrying once the owning engine is shutting down. Without this, a
    // query whose reads keep returning a retryable "source unavailable" (the
    // cluster is being torn down) re-arms its backoff delay forever via the
    // unbudgeted (remainingBudgetMs === null) path below, leaking the timer and
    // keeping the event loop alive after teardown.
    if (typeof executor.isShuttingDownRequested === 'function' &&
        executor.isShuttingDownRequested()) {
      return false;
    }
    const normalizedRetryDelayMs =
      Number.isFinite(retryDelayMs) && retryDelayMs > 0 ?
        Math.floor(retryDelayMs) :
        0;
    const remainingBudgetMs = getRemainingExecutionBudgetMs();
    if (remainingBudgetMs === null) {
      if (normalizedRetryDelayMs > 0) {
        await executor.delay(normalizedRetryDelayMs);
        executor.throwIfCancelled(cancellationToken);
      }
      return true;
    }
    if (remainingBudgetMs <= 0) {
      spentReporter.reportDeadlineSpent(
        PARTITION_EXECUTION_DEADLINE_WAIT.beforeRetry,
      );
      return false;
    }
    if (normalizedRetryDelayMs > remainingBudgetMs) {
      spentReporter.reportDeadlineSpent(
        PARTITION_EXECUTION_DEADLINE_WAIT.retryDelay,
        {retryDelayMs: normalizedRetryDelayMs, remainingBudgetMs},
      );
      return false;
    }
    if (normalizedRetryDelayMs > 0) {
      await executor.delay(normalizedRetryDelayMs);
      executor.throwIfCancelled(cancellationToken);
    }
    return hasBudgetAfterRetryDelay(
      getRemainingExecutionBudgetMs(),
      spentReporter,
    );
  };
  return Object.freeze({
    buildRouterDeliveryOptions,
    getRemainingExecutionBudgetMs,
    waitForRetryBudget,
    observeSpent: spentReporter.setObserver,
    reportDeadlineSpentBeforeAttempt: () => spentReporter.reportDeadlineSpent(
      PARTITION_EXECUTION_DEADLINE_WAIT.beforeAttempt,
    ),
    reportReadAttemptsSpent: spentReporter.reportReadAttemptsSpent,
  });
}

/**
 * After the retry delay: the budget either remains or is reported spent.
 * @param {number|null} nextRemainingBudgetMs
 * @param {Object} spentReporter
 * @return {boolean} True when another attempt may run.
 * @private
 */
function hasBudgetAfterRetryDelay(nextRemainingBudgetMs, spentReporter) {
  if (nextRemainingBudgetMs === null || nextRemainingBudgetMs > 0) {
    return true;
  }
  spentReporter.reportDeadlineSpent(
    PARTITION_EXECUTION_DEADLINE_WAIT.afterRetry,
  );
  return false;
}

export {createPartitionAttemptBudget};
