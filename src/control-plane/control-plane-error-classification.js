import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRESSURE_GOVERNOR_ERROR_CODE,
} from './pressure-governor.js';

const RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS = Object.freeze([
  'Distributed operation failed due to participant failures',
  'authoritative_row_source_unavailable',
  'Outbound queue for node',
  'No connection to node',
  'Connection to node',
  'Message timeout',
  'Cache update not observed for',
  'query_admission_deferred',
  'closed',
  'control_plane_pressure_degraded',
  'Transaction already active on this partition',
  'No active transaction to commit',
]);

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

export {
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS,
};
