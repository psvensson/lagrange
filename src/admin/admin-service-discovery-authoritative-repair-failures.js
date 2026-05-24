import {NUM, TYPEOF} from '../constants/index.js';
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
  if (typeof cause !== TYPEOF.STRING || cause.length === NUM.ZERO) {
    return;
  }
  if (!causeChain.includes(cause)) {
    causeChain.push(cause);
  }
}

function normalizeFirstFailedParticipant(participant, tableName = null) {
  if (!participant || typeof participant !== TYPEOF.OBJECT) {
    return null;
  }
  return {
    partitionId:
      typeof participant.partitionId === TYPEOF.STRING ?
        participant.partitionId :
        null,
    participantNodeId:
      typeof participant.participantNodeId === TYPEOF.STRING ?
        participant.participantNodeId :
        null,
    participantAddress:
      typeof participant.participantAddress === TYPEOF.STRING ?
        participant.participantAddress :
        null,
    errorCode: getControlPlaneErrorCode(participant) || null,
    error: getControlPlaneErrorMessage(participant) || null,
    durationMs: Number.isFinite(participant.durationMs) ?
      Math.max(NUM.ZERO, Math.floor(participant.durationMs)) :
      null,
    retryAfterMs: getControlPlaneRetryAfterMs(participant) || null,
    backpressured:
      typeof participant.backpressured === TYPEOF.BOOLEAN ?
        participant.backpressured :
        isRetryableControlPlaneError(participant),
    failedTable:
      typeof participant.failedTable === TYPEOF.STRING ?
        participant.failedTable :
        tableName,
  };
}

function normalizeLocalQueryTransportDiagnostic(localQueryTransport) {
  if (!localQueryTransport || typeof localQueryTransport !== TYPEOF.OBJECT) {
    return null;
  }
  const ready =
    typeof localQueryTransport.ready === TYPEOF.BOOLEAN ?
      localQueryTransport.ready :
      null;
  return {
    state:
      typeof localQueryTransport.state === TYPEOF.STRING &&
      localQueryTransport.state.length > NUM.ZERO ?
        localQueryTransport.state :
        ready === true ?
          'ready' :
          ready === false ?
            'deferred' :
            'unknown',
    ready,
    reason:
      typeof localQueryTransport.reason === TYPEOF.STRING &&
      localQueryTransport.reason.length > NUM.ZERO ?
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
      error.participantFailures.length > NUM.ZERO) ||
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
        error.participantFailures[NUM.ZERO] :
        null),
    tableName,
  );
  return {
    tableName,
    error: getControlPlaneErrorMessage(error) || 'unknown_error',
    errorCode: getControlPlaneErrorCode(error) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(error) || null,
    readSource:
      typeof error?.readSource === TYPEOF.STRING ? error.readSource : null,
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
      (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
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
        typeof tableName === TYPEOF.STRING ?
          tableName.trim() :
          EMPTY_STRING,
      )
      .filter((tableName) => tableName.length > NUM.ZERO),
  );
}

function normalizeAuthoritativeRepairCauseChain(causeChain = []) {
  return uniqueSorted(
    (Array.isArray(causeChain) ? causeChain : EMPTY_ARRAY)
      .map((cause) =>
        typeof cause === TYPEOF.STRING ?
          cause.trim() :
          EMPTY_STRING,
      )
      .filter((cause) => cause.length > NUM.ZERO),
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
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      retryHints.push(Math.floor(retryAfterMs));
    }
    const participantRetryAfterMs = Number(
      errorSummary?.firstFailedParticipant?.retryAfterMs,
    );
    if (
      Number.isFinite(participantRetryAfterMs) &&
      participantRetryAfterMs > NUM.ZERO
    ) {
      retryHints.push(Math.floor(participantRetryAfterMs));
    }
    const localQueryTransportRetryAfterMs = Number(
      errorSummary?.localQueryTransport?.retryAfterMs,
    );
    if (
      Number.isFinite(localQueryTransportRetryAfterMs) &&
      localQueryTransportRetryAfterMs > NUM.ZERO
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
    Number.isFinite(baseRetryAfterMs) && baseRetryAfterMs > NUM.ZERO ?
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
    Number.isFinite(failureCount) && failureCount > NUM.ZERO ?
      Math.floor(failureCount) :
      NUM.ONE;
  const normalizedBaseRetryAfterMs =
    Number.isFinite(baseRetryAfterMs) && baseRetryAfterMs > NUM.ZERO ?
      Math.floor(baseRetryAfterMs) :
      AUTHORITATIVE_REPAIR_COOLDOWN_MS;
  const normalizedMaxRetryAfterMs =
    Number.isFinite(maxRetryAfterMs) && maxRetryAfterMs > NUM.ZERO ?
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
        (normalizedFailureCount - NUM.ONE);
    return Math.min(normalizedMaxRetryAfterMs, scaledRetryAfterMs);
  }
  const scaledRetryAfterMs =
    normalizedBaseRetryAfterMs *
    AUTHORITATIVE_REPAIR_FAILURE_RETRY_POLICY.BACKOFF_MULTIPLIER **
      (normalizedFailureCount - NUM.ONE);
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
