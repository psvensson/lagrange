import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  NUM,
  QUERY_EXECUTOR_LITERAL,
  isPriorityControlPlanePartition,
} = QUERY_EXECUTOR_SHARED;

const READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS = NUM.ONE;
const READ_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS =
  READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS;
const RECOVERY_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS =
  READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS;
const RECOVERY_CANDIDATE_CONNECTED_CONNECTION_STATE = 'connected';
const RECOVERY_CANDIDATE_CONNECTING_CONNECTION_STATE = 'connecting';
const RECOVERY_CANDIDATE_UNOBSERVED_CONNECTION_STATE = 'unobserved';

function createPartitionAttemptBudget({
  executor,
  partitionId,
  forRead,
  executionOptions = {},
  routingReadinessDimension,
  cancellationToken = null,
}) {
  const executionTimeoutMs =
    Number.isFinite(executionOptions?.timeoutMs) &&
    executionOptions.timeoutMs > NUM.ZERO ?
      Math.floor(executionOptions.timeoutMs) :
      null;
  const executionDeadlineMs =
    executionTimeoutMs === null ? null : Date.now() + executionTimeoutMs;
  const getRemainingExecutionBudgetMs = () => {
    if (executionDeadlineMs === null) {
      return null;
    }
    return Math.max(NUM.ZERO, executionDeadlineMs - Date.now());
  };
  const resolveRecoveryCandidateConnectionState = (candidate) => {
    const candidateNodeId =
      typeof candidate?.nodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      candidate.nodeId.length > NUM.ZERO ?
        candidate.nodeId :
        typeof candidate?.node_id === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        candidate.node_id.length > NUM.ZERO ?
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
    return isPriorityControlPlanePartition({
      partitionId,
      partitionRow: executor.getPartitionRecord(partitionId),
    });
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
    if (Array.isArray(queue) && queue.length > NUM.ONE) {
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
      return NUM.ONE;
    }
    let remainingCount = NUM.ONE;
    for (
      let index = currentCandidateIndex + NUM.ONE;
      index < candidateQueue.length;
      index += NUM.ONE
    ) {
      const address = candidateQueue[index]?.address;
      if (
        typeof address === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        address.length > NUM.ZERO &&
        !attemptedAddresses.has(address)
      ) {
        remainingCount += NUM.ONE;
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
        reconnectIntervalMs <= NUM.ZERO
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
    if (remainingReadCandidates <= NUM.ONE) {
      return capRecoveryCandidateBudget(remainingBudgetMs);
    }
    return capRecoveryCandidateBudget(Math.max(
      READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS,
      Math.floor(remainingBudgetMs / remainingReadCandidates),
    ));
  };
  const buildRouterDeliveryOptions = (
    candidateQueue = null,
    currentCandidateIndex = NUM.ZERO,
    attemptedAddresses = new Set(),
  ) => {
    const routerOptions = {};
    if (
      typeof executionOptions?.deliveryPriority ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.deliveryPriority.length > NUM.ZERO
    ) {
      routerOptions.deliveryPriority = executionOptions.deliveryPriority;
    }
    if (
      typeof executionOptions?.deliverySource ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.deliverySource.length > NUM.ZERO
    ) {
      routerOptions.deliverySource = executionOptions.deliverySource;
    }
    if (
      typeof executionOptions?.replacePendingKey ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.replacePendingKey.length > NUM.ZERO
    ) {
      routerOptions.replacePendingKey = executionOptions.replacePendingKey;
    }
    const remainingBudgetMs = getRemainingExecutionBudgetMs();
    if (remainingBudgetMs !== null) {
      if (remainingBudgetMs <= NUM.ZERO) {
        return null;
      }
      routerOptions.timeoutMs = resolveRouterDeliveryTimeoutMs(
        remainingBudgetMs,
        candidateQueue,
        currentCandidateIndex,
        attemptedAddresses,
      );
    }
    if (Object.keys(routerOptions).length === NUM.ZERO) {
      return undefined;
    }
    return routerOptions;
  };
  const waitForRetryBudget = async (retryDelayMs) => {
    const normalizedRetryDelayMs =
      Number.isFinite(retryDelayMs) && retryDelayMs > NUM.ZERO ?
        Math.floor(retryDelayMs) :
        NUM.ZERO;
    const remainingBudgetMs = getRemainingExecutionBudgetMs();
    if (remainingBudgetMs === null) {
      if (normalizedRetryDelayMs > NUM.ZERO) {
        await executor.delay(normalizedRetryDelayMs);
        executor.throwIfCancelled(cancellationToken);
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
      await executor.delay(normalizedRetryDelayMs);
      executor.throwIfCancelled(cancellationToken);
    }
    const nextRemainingBudgetMs = getRemainingExecutionBudgetMs();
    return nextRemainingBudgetMs === null || nextRemainingBudgetMs > NUM.ZERO;
  };
  return Object.freeze({
    buildRouterDeliveryOptions,
    getRemainingExecutionBudgetMs,
    waitForRetryBudget,
  });
}

export {createPartitionAttemptBudget};
