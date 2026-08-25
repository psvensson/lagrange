import {
  NUM,
} from '../constants/index.js';
import {
  PRESSURE_GOVERNOR_ERROR_CODE,
} from './pressure-governor.js';
import {ROUTER_ERROR_MSG} from '../constants/transport.js';


const RETRYABLE_RAFT_WRITE_COMMIT_TIMEOUT_FRAGMENT =
  'Raft write commit timed out';
const numberIsSafeInteger = Number.isSafeInteger;

const RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS = Object.freeze([
  'Distributed operation failed due to participant failures',
  'authoritative_row_source_unavailable',
  'Outbound queue for node',
  'No connection to node',
  'Connection to node',
  'No handler registered for address',
  'Message timeout',
  'Cache update not observed for',
  'query_admission_deferred',
  'closed',
  'control_plane_pressure_degraded',
  ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT,
  'Transaction already active on this partition',
  'No active transaction to commit',
  RETRYABLE_RAFT_WRITE_COMMIT_TIMEOUT_FRAGMENT,
]);

const CONTROL_PLANE_FAILURE_REASON = Object.freeze({
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE:
    'authoritative_row_source_unavailable',
  DISTRIBUTED_PARTICIPANT_FAILURE:
    'distributed_participant_failure',
  RECONNECT_DELIVERY_FAILURE:
    'reconnect_delivery_failure',
  PRESSURE_DEGRADED:
    'control_plane_pressure_degraded',
  UNKNOWN:
    'unknown',
});

const CONTROL_PLANE_CONVERGENCE_CLASS = Object.freeze({
  CRITICAL: 'critical_convergence',
  ORDINARY_REPAIR: 'ordinary_repair',
  DIAGNOSTIC_REPAIR: 'diagnostic_repair',
});

const CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME = Object.freeze({
  CRITICAL_ADMITTED: 'critical_admitted',
  CRITICAL_DEFERRED: 'critical_deferred',
  CRITICAL_REJECTED: 'critical_rejected',
  ORDINARY_DEFERRED: 'ordinary_deferred',
  DIAGNOSTIC_DEFERRED: 'diagnostic_deferred',
});

const CONTROL_PLANE_FAILURE_FRAGMENT = Object.freeze({
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE:
    'authoritative_row_source_unavailable',
  DISTRIBUTED_PARTICIPANT_FAILURE:
    'Distributed operation failed due to participant failures',
  NO_CONNECTION_TO_NODE:
    'No connection to node',
  CONNECTION_TO_NODE:
    'Connection to node',
  OUTBOUND_QUEUE_FOR_NODE:
    'Outbound queue for node',
  NO_HANDLER_REGISTERED_FOR_ADDRESS:
    'No handler registered for address',
  PENDING_RESPONSE_TIMEOUT: ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT,
  CONTROL_PLANE_PRESSURE_DEGRADED:
    'control_plane_pressure_degraded',
});

const CONTROL_PLANE_FAILURE_ERROR_CODE = Object.freeze({
  DISTRIBUTED_PARTICIPANT_FAILURE:
    'DISTRIBUTED_PARTICIPANT_FAILURE',
  CONTROL_PLANE_PRESSURE_DEGRADED:
    PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED,
});

const STALE_NODE_INCARNATION_CODE = 'STALE_NODE_INCARNATION';

const STALE_NODE_INCARNATION_ERROR_MESSAGE =
  'Refusing node state update from a stale boot incarnation';

/**
 * Build the typed terminal refusal a receiver raises when a writer stamps a
 * boot incarnation LOWER than the receiver's best-known incarnation for that
 * nodeId. The error is terminal (never retried): a zombie writer can never
 * become fresh by retrying.
 * @param {Object} [options={}] - Fence context.
 * @param {string} [options.nodeId] - The fenced node id.
 * @param {number} [options.receivedIncarnation] - Incarnation on the write.
 * @param {number} [options.knownIncarnation] - Receiver high-water incarnation.
 * @return {Error} Typed error with code STALE_NODE_INCARNATION.
 */
function buildStaleNodeIncarnationError(options = {}) {
  const error = new Error(STALE_NODE_INCARNATION_ERROR_MESSAGE);
  error.code = STALE_NODE_INCARNATION_CODE;
  error.nodeId = options.nodeId || null;
  error.receivedIncarnation = Number.isSafeInteger(
    options.receivedIncarnation,
  ) ?
    options.receivedIncarnation :
    null;
  error.knownIncarnation = Number.isSafeInteger(options.knownIncarnation) ?
    options.knownIncarnation :
    null;
  return error;
}

/**
 * Normalize one boot-incarnation candidate: a positive safe integer is KNOWN,
 * anything else (0, absent, non-numeric — the pre-incarnation compat shape)
 * is UNKNOWN and never fences.
 * @param {*} value - Candidate incarnation.
 * @return {number} The known incarnation, or 0 when unknown.
 */
function normalizeKnownNodeBootIncarnation(value) {
  return typeof value === 'number' && numberIsSafeInteger(value) && value > 0 ?
    value : 0;
}

const MAX_LINKED_CONTROL_PLANE_FAILURES = NUM.EIGHT;

function getDirectControlPlaneErrorMessage(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value?.message === 'string') {
    return value.message;
  }
  if (typeof value?.error === 'string') {
    return value.error;
  }
  return '';
}

function getDirectControlPlaneErrorCode(value) {
  if (typeof value?.code === 'string') {
    return value.code;
  }
  if (typeof value?.errorCode === 'string') {
    return value.errorCode;
  }
  return '';
}

function getDirectControlPlaneRetryAfterMs(value) {
  return Number.isFinite(value?.retryAfterMs) ?
    Math.max(0, Math.floor(value.retryAfterMs)) :
    0;
}

// A candidate enters the collection when it is a first visit of an object or
// any string; other primitives are skipped.
function admitLinkedFailureCandidate(candidate, visited) {
  if (!candidate) {
    return false;
  }
  if (typeof candidate === 'object') {
    if (visited.has(candidate)) {
      return false;
    }
    visited.add(candidate);
    return true;
  }
  return typeof candidate === 'string';
}

function enqueueLinkedFailureSources(queue, candidate) {
  if (candidate.cause) {
    queue.push(candidate.cause);
  }
  if (candidate.firstFailedParticipant &&
      typeof candidate.firstFailedParticipant === 'object') {
    queue.push(candidate.firstFailedParticipant);
  }
  if (Array.isArray(candidate.participantFailures)) {
    for (const participantFailure of candidate.participantFailures) {
      queue.push(participantFailure);
    }
  }
}

function collectLinkedControlPlaneFailures(value) {
  const queue = [value];
  const visited = new Set();
  const collected = [];

  while (queue.length > 0 &&
      collected.length < MAX_LINKED_CONTROL_PLANE_FAILURES) {
    const candidate = queue.shift();
    if (!admitLinkedFailureCandidate(candidate, visited)) {
      continue;
    }
    collected.push(candidate);
    if (typeof candidate === 'object') {
      enqueueLinkedFailureSources(queue, candidate);
    }
  }

  return collected;
}

function getControlPlaneErrorMessage(value) {
  return getDirectControlPlaneErrorMessage(value);
}

function getControlPlaneErrorCode(value) {
  return getDirectControlPlaneErrorCode(value);
}

function getControlPlaneRetryAfterMs(value) {
  let retryAfterMs = 0;
  for (const candidate of collectLinkedControlPlaneFailures(value)) {
    retryAfterMs = Math.max(
      retryAfterMs,
      getDirectControlPlaneRetryAfterMs(candidate),
    );
  }
  return retryAfterMs;
}

function isRetryableControlPlaneError(value) {
  if (!value) {
    return false;
  }
  for (const candidate of collectLinkedControlPlaneFailures(value)) {
    if (candidate?.deferRetry === true) {
      return true;
    }
    if (getDirectControlPlaneErrorCode(candidate) ===
        PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED) {
      return true;
    }
    if (getDirectControlPlaneRetryAfterMs(candidate) > 0) {
      return true;
    }
    const message = getDirectControlPlaneErrorMessage(candidate);
    if (RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    )) {
      return true;
    }
  }
  return false;
}

function resolveControlPlanePrimaryFailureReason(summary) {
  if (summary.authoritativeRowSourceUnavailableCount > 0) {
    return CONTROL_PLANE_FAILURE_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE;
  }
  if (summary.distributedParticipantFailureCount > 0) {
    return CONTROL_PLANE_FAILURE_REASON.DISTRIBUTED_PARTICIPANT_FAILURE;
  }
  if (summary.reconnectDeliveryFailureCount > 0) {
    return CONTROL_PLANE_FAILURE_REASON.RECONNECT_DELIVERY_FAILURE;
  }
  if (summary.pressureDegradedCount > 0) {
    return CONTROL_PLANE_FAILURE_REASON.PRESSURE_DEGRADED;
  }
  return CONTROL_PLANE_FAILURE_REASON.UNKNOWN;
}

function getControlPlaneFailureSummary(value) {
  const summary = {
    primaryReason: CONTROL_PLANE_FAILURE_REASON.UNKNOWN,
    linkedFailureCount: 0,
    retryable: isRetryableControlPlaneError(value),
    authoritativeRowSourceUnavailableCount: 0,
    distributedParticipantFailureCount: 0,
    reconnectDeliveryFailureCount: 0,
    pressureDegradedCount: 0,
  };

  for (const candidate of collectLinkedControlPlaneFailures(value)) {
    summary.linkedFailureCount += 1;
    const message = getDirectControlPlaneErrorMessage(candidate);
    const errorCode = getDirectControlPlaneErrorCode(candidate);

    if (message.includes(
      CONTROL_PLANE_FAILURE_FRAGMENT.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
    )) {
      summary.authoritativeRowSourceUnavailableCount += 1;
    }
    if (
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.DISTRIBUTED_PARTICIPANT_FAILURE,
      ) ||
      errorCode ===
        CONTROL_PLANE_FAILURE_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE
    ) {
      summary.distributedParticipantFailureCount += 1;
    }
    if (
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.NO_CONNECTION_TO_NODE) ||
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.CONNECTION_TO_NODE) ||
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.OUTBOUND_QUEUE_FOR_NODE) ||
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.NO_HANDLER_REGISTERED_FOR_ADDRESS,
      )
    ) {
      summary.reconnectDeliveryFailureCount += 1;
    }
    if (
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.CONTROL_PLANE_PRESSURE_DEGRADED,
      ) ||
      errorCode ===
        CONTROL_PLANE_FAILURE_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED
    ) {
      summary.pressureDegradedCount += 1;
    }
  }

  summary.primaryReason = resolveControlPlanePrimaryFailureReason(summary);

  return summary;
}

export {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
  CONTROL_PLANE_FAILURE_REASON,
  STALE_NODE_INCARNATION_CODE,
  buildStaleNodeIncarnationError,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  normalizeKnownNodeBootIncarnation,
  RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS,
};
