import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {pickTypedWriteAnswer} from '../partition/partition-write-kernel.js';
import {classifyTransportDeliveryOutcome} from '../transport/transport-semantic-outcome.js';

const {
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
    participantNodeId.length === 0 ||
    forRead ||
    typeof executor.messageRouter?.getConnectionState !==
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
  ) {
    return null;
  }
  const outcome = classifyTransportDeliveryOutcome(failure);
  const errorMessage =
    typeof outcome.error === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
      outcome.error :
      QUERY_EXECUTOR_LITERAL.STRING_VALUE;
  const errorCode =
    typeof outcome.errorCode === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
      outcome.errorCode :
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
    reconnectIntervalMs <= 0
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
    // The failed answer's typed fields (its code, its entryId) travel with
    // it to the delivery's failure result.
    ...pickTypedWriteAnswer(failure),
    // A router answer or a thrown router error: the transport owner's one
    // conversion names its code.
    errorCode: classifyTransportDeliveryOutcome(failure).errorCode,
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
