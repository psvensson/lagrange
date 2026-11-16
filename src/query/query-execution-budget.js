import {ERRORS} from '../constants/index.js';
import {pickTypedWriteAnswer} from '../partition/partition-write-kernel.js';

const QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE =
  'pre_submission_route_unavailable';

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

const EMPTY_DENIAL_CODE_LIST = Object.freeze([]);

function normalizeRoutingDenialCodeList(rawCodes) {
  const list = Array.isArray(rawCodes) ? rawCodes : EMPTY_DENIAL_CODE_LIST;
  return list
    .map((code) => normalizeParticipantFailureString(code))
    .filter(Boolean);
}

function normalizeNonEmptyObjectMap(value) {
  return value && typeof value === 'object' && Object.keys(value).length > 0 ?
    value :
    null;
}

export function pickRoutingDenialFields(source = {}) {
  const routingReasonCode = normalizeParticipantFailureString(
    source?.routingReasonCode,
  );
  const routingReadinessDimension = normalizeParticipantFailureString(
    source?.routingReadinessDimension,
  );
  const routingDenialReasonCodes = normalizeRoutingDenialCodeList(
    source?.routingDenialReasonCodes,
  );
  const deniedByNodeId = normalizeNonEmptyObjectMap(source?.deniedByNodeId);
  const picked = {};
  if (routingReasonCode) {
    picked.routingReasonCode = routingReasonCode;
  }
  if (routingReadinessDimension) {
    picked.routingReadinessDimension = routingReadinessDimension;
  }
  if (routingDenialReasonCodes.length > 0) {
    picked.routingDenialReasonCodes = routingDenialReasonCodes;
  }
  if (deniedByNodeId) {
    picked.deniedByNodeId = deniedByNodeId;
  }
  return picked;
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
    ...pickRoutingDenialFields(answer),
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
    ...pickRoutingDenialFields(details),
    partitionId,
    success: false,
    error: errorMessage || ERRORS.QUERY_FAILED,
    errorCode: normalizeParticipantFailureString(details?.errorCode),
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
