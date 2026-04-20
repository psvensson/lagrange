import { CLUSTER_SEGMENT_3 } from "./cluster-segment-3.js";
const {
  ADMIN_QUERY_TRACE_ERROR_UNKNOWN,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD,
  ERROR_MESSAGE_TIMEOUT_FRAGMENT,
  ZERO,
} = CLUSTER_SEGMENT_3;

/**
 * Resolve the request statement field for trace diagnostics.
 * @param {Object} requestPayload
 * @returns {string}
 */
function resolveAdminRequestStatement(requestPayload) {
  if (!requestPayload || typeof requestPayload !== "object") {
    return "";
  }
  if (typeof requestPayload.sql === "string") {
    return requestPayload.sql;
  }
  if (typeof requestPayload.statement === "string") {
    return requestPayload.statement;
  }
  return "";
}

/**
 * Convert an error-like value into a stable message.
 * @param {*} error
 * @returns {string}
 */
function normalizeAdminQueryError(error) {
  if (
    error &&
    typeof error.message === "string" &&
    error.message.length > ZERO
  ) {
    return error.message;
  }
  if (typeof error === "string" && error.length > ZERO) {
    return error;
  }
  return ADMIN_QUERY_TRACE_ERROR_UNKNOWN;
}

/**
 * Determine whether a query failure message is timeout-shaped.
 * @param {string} message
 * @returns {boolean}
 */
function isTimeoutErrorMessage(message) {
  return String(message || "")
    .toLowerCase()
    .includes(ERROR_MESSAGE_TIMEOUT_FRAGMENT);
}

function extractControlSnapshotObservation(result = null) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const firstRow =
    rows.length > ZERO &&
    rows[ZERO] &&
    typeof rows[ZERO] === "object" &&
    !Array.isArray(rows[ZERO])
      ? rows[ZERO]
      : null;
  const observation = firstRow?.[CONTROL_SNAPSHOT_OBSERVATION_FIELD];
  if (
    !observation ||
    typeof observation !== "object" ||
    Array.isArray(observation)
  ) {
    return null;
  }
  return observation;
}

function shouldFallbackToForcedControlSnapshot(result = null) {
  const observation = extractControlSnapshotObservation(result);
  if (!observation) {
    return true;
  }
  const observationState = String(
    observation[CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD] || "",
  )
    .trim()
    .toLowerCase();
  const contractState = String(
    observation[CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD] || "",
  )
    .trim()
    .toLowerCase();
  return (
    observationState === CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED ||
    contractState === CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED
  );
}

export const CLUSTER_SEGMENT_4 = {
  ...CLUSTER_SEGMENT_3,
  resolveAdminRequestStatement,
  normalizeAdminQueryError,
  isTimeoutErrorMessage,
  extractControlSnapshotObservation,
  shouldFallbackToForcedControlSnapshot,
};
