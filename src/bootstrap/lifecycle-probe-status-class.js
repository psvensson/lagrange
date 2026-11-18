import {LIFECYCLE_PROBE_STATUS_CLASS} from './lifecycle-controller-constants.js';

const PROBE_STATUS_SUCCESS_MIN = 200;
const PROBE_STATUS_SUCCESS_MAX = 300;
const PROBE_STATUS_CLIENT_ERROR_MIN = 400;
const PROBE_STATUS_CLIENT_ERROR_MAX = 500;
const PROBE_STATUS_SERVER_ERROR_MIN = 500;
const PROBE_STATUS_SERVER_ERROR_MAX = 600;

/**
 * Classify one probe response status into the lifecycle's coarse status
 * class.
 * @param {*} statusCode
 * @return {string}
 */
function classifyLifecycleProbeStatusCode(statusCode) {
  if (!Number.isFinite(statusCode)) {
    return LIFECYCLE_PROBE_STATUS_CLASS.UNKNOWN;
  }
  const normalizedStatus = Math.floor(statusCode);
  if (normalizedStatus >= PROBE_STATUS_SUCCESS_MIN &&
      normalizedStatus < PROBE_STATUS_SUCCESS_MAX) {
    return LIFECYCLE_PROBE_STATUS_CLASS.SUCCESS_2XX;
  }
  if (normalizedStatus >= PROBE_STATUS_CLIENT_ERROR_MIN &&
      normalizedStatus < PROBE_STATUS_CLIENT_ERROR_MAX) {
    return LIFECYCLE_PROBE_STATUS_CLASS.CLIENT_4XX;
  }
  if (normalizedStatus >= PROBE_STATUS_SERVER_ERROR_MIN &&
      normalizedStatus < PROBE_STATUS_SERVER_ERROR_MAX) {
    return LIFECYCLE_PROBE_STATUS_CLASS.SERVER_5XX;
  }
  return LIFECYCLE_PROBE_STATUS_CLASS.UNKNOWN;
}

export {classifyLifecycleProbeStatusCode};
