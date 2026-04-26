import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRESSURE_GOVERNOR_ERROR_CODE,
} from './pressure-governor.js';
import {ROUTER_ERROR_MSG} from '../constants/transport.js';

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

const MAX_LINKED_CONTROL_PLANE_FAILURES = NUM.EIGHT;

function getDirectControlPlaneErrorMessage(value) {
  if (typeof value === TYPEOF.STRING) {
    return value;
  }
  if (typeof value?.message === TYPEOF.STRING) {
    return value.message;
  }
  if (typeof value?.error === TYPEOF.STRING) {
    return value.error;
  }
  return '';
}

function getDirectControlPlaneErrorCode(value) {
  if (typeof value?.code === TYPEOF.STRING) {
    return value.code;
  }
  if (typeof value?.errorCode === TYPEOF.STRING) {
    return value.errorCode;
  }
  return '';
}

function getDirectControlPlaneRetryAfterMs(value) {
  return Number.isFinite(value?.retryAfterMs) ?
    Math.max(NUM.ZERO, Math.floor(value.retryAfterMs)) :
    NUM.ZERO;
}

function collectLinkedControlPlaneFailures(value) {
  const queue = [value];
  const visited = new Set();
  const collected = [];

  while (queue.length > NUM.ZERO &&
      collected.length < MAX_LINKED_CONTROL_PLANE_FAILURES) {
    const candidate = queue.shift();
    if (!candidate) {
      continue;
    }
    if (typeof candidate === TYPEOF.OBJECT) {
      if (visited.has(candidate)) {
        continue;
      }
      visited.add(candidate);
    } else if (typeof candidate !== TYPEOF.STRING) {
      continue;
    }

    collected.push(candidate);
    if (typeof candidate !== TYPEOF.OBJECT) {
      continue;
    }

    if (candidate.cause) {
      queue.push(candidate.cause);
    }
    if (candidate.firstFailedParticipant &&
        typeof candidate.firstFailedParticipant === TYPEOF.OBJECT) {
      queue.push(candidate.firstFailedParticipant);
    }
    if (Array.isArray(candidate.participantFailures)) {
      for (const participantFailure of candidate.participantFailures) {
        queue.push(participantFailure);
      }
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
  let retryAfterMs = NUM.ZERO;
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
    if (getDirectControlPlaneRetryAfterMs(candidate) > NUM.ZERO) {
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

function getControlPlaneFailureSummary(value) {
  const summary = {
    primaryReason: CONTROL_PLANE_FAILURE_REASON.UNKNOWN,
    linkedFailureCount: NUM.ZERO,
    retryable: isRetryableControlPlaneError(value),
    authoritativeRowSourceUnavailableCount: NUM.ZERO,
    distributedParticipantFailureCount: NUM.ZERO,
    reconnectDeliveryFailureCount: NUM.ZERO,
    pressureDegradedCount: NUM.ZERO,
  };

  for (const candidate of collectLinkedControlPlaneFailures(value)) {
    summary.linkedFailureCount += NUM.ONE;
    const message = getDirectControlPlaneErrorMessage(candidate);
    const errorCode = getDirectControlPlaneErrorCode(candidate);

    if (message.includes(
      CONTROL_PLANE_FAILURE_FRAGMENT.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
    )) {
      summary.authoritativeRowSourceUnavailableCount += NUM.ONE;
    }
    if (
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.DISTRIBUTED_PARTICIPANT_FAILURE,
      ) ||
      errorCode ===
        CONTROL_PLANE_FAILURE_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE
    ) {
      summary.distributedParticipantFailureCount += NUM.ONE;
    }
    if (
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.NO_CONNECTION_TO_NODE) ||
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.CONNECTION_TO_NODE) ||
      message.includes(CONTROL_PLANE_FAILURE_FRAGMENT.OUTBOUND_QUEUE_FOR_NODE) ||
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.NO_HANDLER_REGISTERED_FOR_ADDRESS,
      )
    ) {
      summary.reconnectDeliveryFailureCount += NUM.ONE;
    }
    if (
      message.includes(
        CONTROL_PLANE_FAILURE_FRAGMENT.CONTROL_PLANE_PRESSURE_DEGRADED,
      ) ||
      errorCode ===
        CONTROL_PLANE_FAILURE_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED
    ) {
      summary.pressureDegradedCount += NUM.ONE;
    }
  }

  if (summary.authoritativeRowSourceUnavailableCount > NUM.ZERO) {
    summary.primaryReason =
      CONTROL_PLANE_FAILURE_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE;
  } else if (summary.distributedParticipantFailureCount > NUM.ZERO) {
    summary.primaryReason =
      CONTROL_PLANE_FAILURE_REASON.DISTRIBUTED_PARTICIPANT_FAILURE;
  } else if (summary.reconnectDeliveryFailureCount > NUM.ZERO) {
    summary.primaryReason =
      CONTROL_PLANE_FAILURE_REASON.RECONNECT_DELIVERY_FAILURE;
  } else if (summary.pressureDegradedCount > NUM.ZERO) {
    summary.primaryReason =
      CONTROL_PLANE_FAILURE_REASON.PRESSURE_DEGRADED;
  }

  return summary;
}

export {
  CONTROL_PLANE_FAILURE_REASON,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS,
};
