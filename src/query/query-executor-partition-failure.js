import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {pickTypedWriteAnswer} from '../partition/partition-write-kernel.js';
import {classifyThrownDeliveryError} from '../transport/transport-semantic-outcome.js';

const {
  ERRORS,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  normalizeParticipantRetryAfterMs,
  resolveParticipantBackpressureState,
} = QUERY_EXECUTOR_SHARED;

const LOCAL_STR_PLANNING_SNAPSHOT_REFRESH_PENDING =
  'planning_snapshot_refresh_pending';
const ADDRESS_NODE_SEPARATOR = '/';

// A candidate failure is a thrown router Error or one delivery reading (the
// partition's answer, or the transport outcome when undelivered); its text
// and code come from the thrown error's transport outcome or the reading.
function failureFactsOf(failure) {
  return failure instanceof Error ? classifyThrownDeliveryError(failure) : failure ?? {};
}

function normalizeOptionalQueryString(value, fallback = null) {
  return typeof value === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
    value.length > 0 ?
    value :
    fallback;
}

function isDisconnectedOrReconnectingNode(executor, participantNodeId) {
  if (
    !normalizeOptionalQueryString(participantNodeId) ||
    typeof executor.messageRouter?.getConnectionState !==
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
  ) {
    return false;
  }
  const connectionState = executor.messageRouter.getConnectionState(
    participantNodeId,
  );
  return (
    connectionState === QUERY_EXECUTOR_LITERAL.STRING_RECONNECTING ||
    connectionState === QUERY_EXECUTOR_LITERAL.STRING_DISCONNECTED
  );
}

function isOutcomeLeaderUnavailable(executor, failure) {
  const outcome = failureFactsOf(failure);
  const errorMessage =
    typeof outcome.error === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
      outcome.error :
      QUERY_EXECUTOR_LITERAL.STRING_VALUE;
  const errorCode =
    typeof outcome.errorCode === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
      outcome.errorCode :
      null;
  return Boolean(executor.isLeaderUnavailable(errorMessage, errorCode));
}

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
    forRead ||
    !isDisconnectedOrReconnectingNode(executor, participantNodeId) ||
    !isOutcomeLeaderUnavailable(executor, failure)
  ) {
    return null;
  }
  const reconnectIntervalMs = Number(
    executor.messageRouter?.reconnectIntervalMs,
  );
  return Number.isFinite(reconnectIntervalMs) && reconnectIntervalMs > 0 ?
    Math.floor(reconnectIntervalMs) :
    null;
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
    errorCode: failureFactsOf(failure).errorCode ?? null,
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

function collectDeniedNodeCodes(deniedByNodeId) {
  const codes = new Set();
  for (const entry of Object.values(deniedByNodeId || {})) {
    for (const rawCode of entry?.reasonCodes || []) {
      const code =
        typeof rawCode === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
          rawCode :
          typeof rawCode?.code === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
            rawCode.code :
            null;
      if (code) {
        codes.add(code);
      }
    }
  }
  return [...codes];
}

function resolveNonEmptyDeniedByNodeId(routingSnapshot) {
  const deniedByNodeId = routingSnapshot?.deniedByNodeId;
  return deniedByNodeId &&
    typeof deniedByNodeId === 'object' &&
    Object.keys(deniedByNodeId).length > 0 ?
    deniedByNodeId :
    null;
}

function buildQueryPartitionRoutingDenialFailureDetails(routingSnapshot = null) {
  const deniedByNodeId = resolveNonEmptyDeniedByNodeId(routingSnapshot);
  const codes = deniedByNodeId ? collectDeniedNodeCodes(deniedByNodeId) : [];
  const details = {
    routingReasonCode: normalizeOptionalQueryString(
      routingSnapshot?.reasonCode,
      null,
    ),
    routingReadinessDimension: normalizeOptionalQueryString(
      routingSnapshot?.routingReadinessDimension,
      null,
    ),
  };
  if (codes.length > 0) {
    details.routingDenialReasonCodes = codes;
  }
  if (deniedByNodeId) {
    details.deniedByNodeId = deniedByNodeId;
  }
  return details;
}

function resolveNoCandidateErrorMessage({
  forRead,
  hasRoutableService,
  hasPartitionRecord,
  isFinalWriteAttempt,
}) {
  if (forRead) {
    return QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND;
  }
  if (hasRoutableService) {
    return ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE;
  }
  return hasPartitionRecord && !isFinalWriteAttempt ?
    ERRORS.PARTITION_SERVICE_NOT_FOUND :
    QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND;
}

function hasPlanningRefreshPendingDenial(routingSnapshot) {
  return Object.values(routingSnapshot?.deniedByNodeId || {}).some((entry) =>
    Array.isArray(entry?.reasonCodes) &&
    entry.reasonCodes.some(
      (code) =>
        String(code?.code ?? code) ===
        LOCAL_STR_PLANNING_SNAPSHOT_REFRESH_PENDING,
    ),
  );
}

function clearPinnedCandidateAddress(
  executor,
  executionOptions,
  partitionId,
  address,
) {
  if (
    executor.getSessionPartitionAddress(
      executionOptions.sessionId,
      partitionId,
    ) === address
  ) {
    executor.clearSessionPartitionAddress(
      executionOptions.sessionId,
      partitionId,
    );
  }
}

function applySuccessfulCandidateAffinity(
  executor,
  executionOptions,
  partitionId,
  address,
  forRead,
) {
  executor.clearTemporarilyUnroutableAddress(partitionId, address);
  if (executionOptions.clearSessionPartitionAffinityOnSuccess === true) {
    executor.clearSessionPartitionAddress(
      executionOptions.sessionId,
      partitionId,
    );
  } else if (!forRead) {
    executor.setSessionPartitionAddress(
      executionOptions.sessionId,
      partitionId,
      address,
    );
  }
}

function resolveRedirectParticipantNodeId(leaderAddress, fallbackNodeId) {
  return typeof leaderAddress === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
    leaderAddress.includes(ADDRESS_NODE_SEPARATOR) ?
    leaderAddress.split(ADDRESS_NODE_SEPARATOR)[0] || fallbackNodeId :
    fallbackNodeId;
}

export {
  applySuccessfulCandidateAffinity,
  buildQueryPartitionCandidateFailureDetails,
  buildQueryPartitionRoutingDenialFailureDetails,
  clearPinnedCandidateAddress,
  hasPlanningRefreshPendingDenial,
  resolveNoCandidateErrorMessage,
  resolveRedirectParticipantNodeId,
  resolveRetryableLeaderFailureRetryAfterMs,
};
