import {
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {uniqueSorted} from './admin-helpers.js';

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_STRING = '';
const AUTHORITATIVE_REPAIR_COOLDOWN_MS = 1000;
const AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT = 'timeout';
const AUTHORITATIVE_REPAIR_FAILURE_CLASS = Object.freeze({
  TRANSIENT: 'transient',
  PRESSURE_OR_TIMEOUT: 'pressure_or_timeout',
});
const AUTHORITATIVE_REPAIR_FAILURE_RETRY_POLICY = Object.freeze({
  BACKOFF_MULTIPLIER: 2,
  TRANSIENT_MAX_DELAY_MULTIPLIER: 4,
  PRESSURE_MIN_DELAY_MULTIPLIER: 8,
  PRESSURE_MAX_DELAY_MULTIPLIER: 32,
});
const AUTHORITATIVE_REPAIR_CAUSE = Object.freeze({
  QUERY_PARTICIPANT_FAILURE: 'query_participant_failure',
  QUERY_TIMEOUT: 'query_timeout',
  CONTROL_PLANE_BACKPRESSURE: 'control_plane_backpressure',
  LEADER_RESOLUTION_GAP: 'leader_resolution_gap',
  REPLAY_BACKLOG: 'replay_backlog',
});
const AUTHORITATIVE_REPAIR_LEADER_GAP_FRAGMENTS = Object.freeze([
  'leader is unknown',
  'leader unknown',
  'no handler',
  'no leader',
  'partition_service_not_found',
  'partition service not found',
]);
const AUTHORITATIVE_REPAIR_REPLAY_BACKLOG_FRAGMENTS = Object.freeze([
  'buffered cdc replay',
  'replay backlog',
  'replay buffer',
  'buffered backlog',
]);

function pushUniqueCause(causeChain, cause) {
  if (typeof cause !== 'string' || cause.length === 0) {
    return;
  }
  if (!causeChain.includes(cause)) {
    causeChain.push(cause);
  }
}

function normalizeParticipantString(value, fallback = null) {
  return typeof value === 'string' ? value : fallback;
}

function normalizeFirstFailedParticipant(participant, tableName = null) {
  if (!participant || typeof participant !== 'object') {
    return null;
  }
  return {
    partitionId: normalizeParticipantString(participant.partitionId),
    participantNodeId:
      normalizeParticipantString(participant.participantNodeId),
    participantAddress:
      normalizeParticipantString(participant.participantAddress),
    errorCode: getControlPlaneErrorCode(participant) || null,
    error: getControlPlaneErrorMessage(participant) || null,
    durationMs: Number.isFinite(participant.durationMs) ?
      Math.max(0, Math.floor(participant.durationMs)) :
      null,
    retryAfterMs: getControlPlaneRetryAfterMs(participant) || null,
    backpressured:
      typeof participant.backpressured === 'boolean' ?
        participant.backpressured :
        isRetryableControlPlaneError(participant),
    failedTable:
      normalizeParticipantString(participant.failedTable, tableName),
  };
}

function normalizeLocalQueryTransportDiagnostic(localQueryTransport) {
  if (!localQueryTransport || typeof localQueryTransport !== 'object') {
    return null;
  }
  const ready =
    typeof localQueryTransport.ready === 'boolean' ?
      localQueryTransport.ready :
      null;
  return {
    state:
      typeof localQueryTransport.state === 'string' &&
      localQueryTransport.state.length > 0 ?
        localQueryTransport.state :
        ready === true ?
          'ready' :
          ready === false ?
            'deferred' :
            'unknown',
    ready,
    reason:
      typeof localQueryTransport.reason === 'string' &&
      localQueryTransport.reason.length > 0 ?
        localQueryTransport.reason :
        null,
    retryAfterMs: getControlPlaneRetryAfterMs(localQueryTransport) || null,
  };
}

function deriveAuthoritativeRepairCauseChain(error, firstFailedParticipant) {
  const causeChain = [];
  const errorCode = getControlPlaneErrorCode(error);
  const errorMessage = getControlPlaneErrorMessage(error).toLowerCase();
  const participantMessage = getControlPlaneErrorMessage(
    firstFailedParticipant,
  ).toLowerCase();
  if (
    errorCode === 'DISTRIBUTED_PARTICIPANT_FAILURE' ||
    (Array.isArray(error?.participantFailures) &&
      error.participantFailures.length > 0) ||
    errorMessage.includes('participant failures')
  ) {
    pushUniqueCause(
      causeChain,
      AUTHORITATIVE_REPAIR_CAUSE.QUERY_PARTICIPANT_FAILURE,
    );
  }
  if (
    errorMessage.includes(AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT) ||
    participantMessage.includes(AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT)
  ) {
    pushUniqueCause(causeChain, AUTHORITATIVE_REPAIR_CAUSE.QUERY_TIMEOUT);
  }
  if (
    isRetryableControlPlaneError(error) ||
    isRetryableControlPlaneError(firstFailedParticipant)
  ) {
    pushUniqueCause(
      causeChain,
      AUTHORITATIVE_REPAIR_CAUSE.CONTROL_PLANE_BACKPRESSURE,
    );
  }
  if (
    AUTHORITATIVE_REPAIR_LEADER_GAP_FRAGMENTS.some(
      (fragment) =>
        errorMessage.includes(fragment) ||
        participantMessage.includes(fragment),
    )
  ) {
    pushUniqueCause(
      causeChain,
      AUTHORITATIVE_REPAIR_CAUSE.LEADER_RESOLUTION_GAP,
    );
  }
  if (
    AUTHORITATIVE_REPAIR_REPLAY_BACKLOG_FRAGMENTS.some(
      (fragment) =>
        errorMessage.includes(fragment) ||
        participantMessage.includes(fragment),
    )
  ) {
    pushUniqueCause(causeChain, AUTHORITATIVE_REPAIR_CAUSE.REPLAY_BACKLOG);
  }
  return causeChain;
}

function summarizeAuthoritativeRepairError(tableName, error) {
  const firstFailedParticipant = normalizeFirstFailedParticipant(
    error?.firstFailedParticipant ||
      (Array.isArray(error?.participantFailures) ?
        error.participantFailures[0] :
        null),
    tableName,
  );
  return {
    tableName,
    error: getControlPlaneErrorMessage(error) || 'unknown_error',
    errorCode: getControlPlaneErrorCode(error) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(error) || null,
    readSource:
      typeof error?.readSource === 'string' ? error.readSource : null,
    localQueryTransport: normalizeLocalQueryTransportDiagnostic(
      error?.localQueryTransport,
    ),
    firstFailedParticipant,
    causeChain: deriveAuthoritativeRepairCauseChain(
      error,
      firstFailedParticipant,
    ),
  };
}

function shouldAbortAuthoritativeRepairTableReads(errorSummary = null) {
  const causeChain = Array.isArray(errorSummary?.causeChain) ?
    errorSummary.causeChain.filter(
      (value) => typeof value === 'string' && value.length > 0,
    ) :
    EMPTY_ARRAY;
  return (
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE.QUERY_TIMEOUT) ||
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE.CONTROL_PLANE_BACKPRESSURE)
  );
}

function normalizeAuthoritativeRepairTableNames(tableNames = []) {
  return uniqueSorted(
    (Array.isArray(tableNames) ? tableNames : EMPTY_ARRAY)
      .map((tableName) =>
        typeof tableName === 'string' ?
          tableName.trim() :
          EMPTY_STRING,
      )
      .filter((tableName) => tableName.length > 0),
  );
}

function normalizeAuthoritativeRepairCauseChain(causeChain = []) {
  return uniqueSorted(
    (Array.isArray(causeChain) ? causeChain : EMPTY_ARRAY)
      .map((cause) =>
        typeof cause === 'string' ?
          cause.trim() :
          EMPTY_STRING,
      )
      .filter((cause) => cause.length > 0),
  );
}

function resolveAuthoritativeRepairFailureClass(causeChain = []) {
  const normalizedCauseChain =
    normalizeAuthoritativeRepairCauseChain(causeChain);
  if (
    normalizedCauseChain.includes(AUTHORITATIVE_REPAIR_CAUSE.QUERY_TIMEOUT) ||
    normalizedCauseChain.includes(
      AUTHORITATIVE_REPAIR_CAUSE.CONTROL_PLANE_BACKPRESSURE,
    )
  ) {
    return AUTHORITATIVE_REPAIR_FAILURE_CLASS.PRESSURE_OR_TIMEOUT;
  }
  return AUTHORITATIVE_REPAIR_FAILURE_CLASS.TRANSIENT;
}

function resolveAuthoritativeRepairFailureBaseRetryAfterMs(
  errorSummaries = [],
) {
  const retryHints = [];
  for (const errorSummary of Array.isArray(errorSummaries) ?
    errorSummaries :
    EMPTY_ARRAY) {
    const retryAfterMs = Number(errorSummary?.retryAfterMs);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
      retryHints.push(Math.floor(retryAfterMs));
    }
    const participantRetryAfterMs = Number(
      errorSummary?.firstFailedParticipant?.retryAfterMs,
    );
    if (
      Number.isFinite(participantRetryAfterMs) &&
      participantRetryAfterMs > 0
    ) {
      retryHints.push(Math.floor(participantRetryAfterMs));
    }
    const localQueryTransportRetryAfterMs = Number(
      errorSummary?.localQueryTransport?.retryAfterMs,
    );
    if (
      Number.isFinite(localQueryTransportRetryAfterMs) &&
      localQueryTransportRetryAfterMs > 0
    ) {
      retryHints.push(Math.floor(localQueryTransportRetryAfterMs));
    }
  }
  return Math.max(AUTHORITATIVE_REPAIR_COOLDOWN_MS, ...retryHints);
}

function resolveAuthoritativeRepairFailureMaxRetryAfterMs(
  failureClass,
  baseRetryAfterMs,
) {
  const normalizedBaseRetryAfterMs =
    Number.isFinite(baseRetryAfterMs) && baseRetryAfterMs > 0 ?
      Math.floor(baseRetryAfterMs) :
      AUTHORITATIVE_REPAIR_COOLDOWN_MS;
  if (failureClass === AUTHORITATIVE_REPAIR_FAILURE_CLASS.PRESSURE_OR_TIMEOUT) {
    return (
      normalizedBaseRetryAfterMs *
      AUTHORITATIVE_REPAIR_FAILURE_RETRY_POLICY.PRESSURE_MAX_DELAY_MULTIPLIER
    );
  }
  return (
    normalizedBaseRetryAfterMs *
    AUTHORITATIVE_REPAIR_FAILURE_RETRY_POLICY.TRANSIENT_MAX_DELAY_MULTIPLIER
  );
}

function computeAuthoritativeRepairFailureRetryAfterMs(
  failureClass,
  failureCount,
  baseRetryAfterMs,
  maxRetryAfterMs,
) {
  const normalizedFailureCount =
    Number.isFinite(failureCount) && failureCount > 0 ?
      Math.floor(failureCount) :
      1;
  const normalizedBaseRetryAfterMs =
    Number.isFinite(baseRetryAfterMs) && baseRetryAfterMs > 0 ?
      Math.floor(baseRetryAfterMs) :
      AUTHORITATIVE_REPAIR_COOLDOWN_MS;
  const normalizedMaxRetryAfterMs =
    Number.isFinite(maxRetryAfterMs) && maxRetryAfterMs > 0 ?
      Math.floor(maxRetryAfterMs) :
      resolveAuthoritativeRepairFailureMaxRetryAfterMs(
        failureClass,
        normalizedBaseRetryAfterMs,
      );
  if (failureClass === AUTHORITATIVE_REPAIR_FAILURE_CLASS.PRESSURE_OR_TIMEOUT) {
    const minimumRetryAfterMs =
      normalizedBaseRetryAfterMs *
      AUTHORITATIVE_REPAIR_FAILURE_RETRY_POLICY.PRESSURE_MIN_DELAY_MULTIPLIER;
    const scaledRetryAfterMs =
      minimumRetryAfterMs *
      AUTHORITATIVE_REPAIR_FAILURE_RETRY_POLICY.BACKOFF_MULTIPLIER **
        (normalizedFailureCount - 1);
    return Math.min(normalizedMaxRetryAfterMs, scaledRetryAfterMs);
  }
  const scaledRetryAfterMs =
    normalizedBaseRetryAfterMs *
    AUTHORITATIVE_REPAIR_FAILURE_RETRY_POLICY.BACKOFF_MULTIPLIER **
      (normalizedFailureCount - 1);
  return Math.min(normalizedMaxRetryAfterMs, scaledRetryAfterMs);
}

export {
  computeAuthoritativeRepairFailureRetryAfterMs,
  normalizeAuthoritativeRepairTableNames,
  normalizeLocalQueryTransportDiagnostic,
  resolveAuthoritativeRepairFailureBaseRetryAfterMs,
  resolveAuthoritativeRepairFailureClass,
  resolveAuthoritativeRepairFailureMaxRetryAfterMs,
  shouldAbortAuthoritativeRepairTableReads,
  summarizeAuthoritativeRepairError,
};
