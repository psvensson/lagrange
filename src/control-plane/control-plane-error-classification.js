import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRESSURE_GOVERNOR_ERROR_CODE,
} from './pressure-governor.js';

const RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS = Object.freeze([
  'Distributed operation failed due to participant failures',
  'Outbound queue for node',
  'No connection to node',
  'Connection to node',
  'Message timeout',
  'closed',
  'control_plane_pressure_degraded',
]);

function getControlPlaneErrorMessage(value) {
  if (typeof value?.message === TYPEOF.STRING) {
    return value.message;
  }
  if (typeof value?.error === TYPEOF.STRING) {
    return value.error;
  }
  return '';
}

function getControlPlaneErrorCode(value) {
  if (typeof value?.code === TYPEOF.STRING) {
    return value.code;
  }
  if (typeof value?.errorCode === TYPEOF.STRING) {
    return value.errorCode;
  }
  return '';
}

function getControlPlaneRetryAfterMs(value) {
  return Number.isFinite(value?.retryAfterMs) ?
    Math.max(NUM.ZERO, Math.floor(value.retryAfterMs)) :
    NUM.ZERO;
}

function isRetryableControlPlaneError(value) {
  if (!value) {
    return false;
  }
  if (value?.deferRetry === true) {
    return true;
  }
  if (getControlPlaneErrorCode(value) ===
      PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED) {
    return true;
  }
  if (getControlPlaneRetryAfterMs(value) > NUM.ZERO) {
    return true;
  }
  const message = getControlPlaneErrorMessage(value);
  return RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS.some((fragment) =>
    message.includes(fragment),
  );
}

export {
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS,
};
