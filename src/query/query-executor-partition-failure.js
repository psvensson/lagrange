import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  NUM,
  QUERY_EXECUTOR_LITERAL,
  normalizeParticipantRetryAfterMs,
  resolveParticipantBackpressureState,
} = QUERY_EXECUTOR_SHARED;

function resolveRetryableLeaderFailureRetryAfterMs({
  executor,
  failure,
  forRead,
  participantNodeId,
}) {
  const explicitRetryAfterMs = normalizeParticipantRetryAfterMs(
    failure?.retryAfterMs,
  );
  if (explicitRetryAfterMs !== null) {
    return explicitRetryAfterMs;
  }
  if (
    typeof participantNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
    participantNodeId.length === NUM.ZERO ||
    forRead ||
    typeof executor.messageRouter?.getConnectionState !==
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
  ) {
    return null;
  }
  const errorMessage =
    typeof failure?.error === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
      failure.error :
      typeof failure?.message === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
        failure.message :
        QUERY_EXECUTOR_LITERAL.STRING_VALUE;
  const errorCode =
    typeof failure?.errorCode === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
      failure.errorCode :
      typeof failure?.code === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
        failure.code :
        null;
  if (!executor.isLeaderUnavailable(errorMessage, errorCode)) {
    return null;
  }
  const connectionState = executor.messageRouter.getConnectionState(
    participantNodeId,
  );
  if (
    connectionState !== QUERY_EXECUTOR_LITERAL.STRING_RECONNECTING &&
    connectionState !== QUERY_EXECUTOR_LITERAL.STRING_DISCONNECTED
  ) {
    return null;
  }
  const reconnectIntervalMs = Number(
    executor.messageRouter?.reconnectIntervalMs,
  );
  if (
    !Number.isFinite(reconnectIntervalMs) ||
    reconnectIntervalMs <= NUM.ZERO
  ) {
    return null;
  }
  return Math.floor(reconnectIntervalMs);
}

function buildQueryPartitionCandidateFailureDetails({
  executor,
  failure,
  forRead,
  participantNodeId,
  participantAddress,
}) {
  return {
    errorCode: failure?.errorCode || failure?.code,
    retryAfterMs: resolveRetryableLeaderFailureRetryAfterMs({
      executor,
      failure,
      forRead,
      participantNodeId,
    }),
    deferRetry: failure?.deferRetry,
    participantNodeId,
    participantAddress,
    backpressured: resolveParticipantBackpressureState(failure),
  };
}

export {
  buildQueryPartitionCandidateFailureDetails,
  resolveRetryableLeaderFailureRetryAfterMs,
};
