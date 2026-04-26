import {CLUSTER_SEGMENT_3} from './cluster-segment-3.js';
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
const CONTROL_PLANE_DIAGNOSTICS_FIELD = 'controlPlaneDiagnostics';
const PUBLICATION_CONVERGENCE_GATE_FIELD = 'publicationConvergenceGate';
const PUBLICATION_CONVERGENCE_FIELD = 'publicationConvergence';
const PUBLICATION_RECOVERY_GATE_FIELD = 'publicationRecoveryGate';
const PUBLICATION_RECOVERY_GATE_READY_FIELD = 'ready';
const FORCED_CONTROL_SNAPSHOT_FALLBACK_REASON = Object.freeze({
  MISSING_OBSERVATION: 'missing_observation',
  OBSERVATION_FAILED: 'observation_failed',
  OBSERVATION_CONTRACT_FAILED: 'observation_contract_failed',
  PUBLICATION_RECOVERY_GATE_NOT_READY: 'publication_recovery_gate_not_ready',
});

/**
 * Resolve the request statement field for trace diagnostics.
 * @param {Object} requestPayload
 * @returns {string}
 */
function resolveAdminRequestStatement(requestPayload) {
  if (!requestPayload || typeof requestPayload !== 'object') {
    return '';
  }
  if (typeof requestPayload.sql === 'string') {
    return requestPayload.sql;
  }
  if (typeof requestPayload.statement === 'string') {
    return requestPayload.statement;
  }
  return '';
}

/**
 * Convert an error-like value into a stable message.
 * @param {*} error
 * @returns {string}
 */
function normalizeAdminQueryError(error) {
  if (
    error &&
    typeof error.message === 'string' &&
    error.message.length > ZERO
  ) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > ZERO) {
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
  return String(message || '')
    .toLowerCase()
    .includes(ERROR_MESSAGE_TIMEOUT_FRAGMENT);
}

function extractControlSnapshotObservation(result = null) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const firstRow =
    rows.length > ZERO &&
    rows[ZERO] &&
    typeof rows[ZERO] === 'object' &&
    !Array.isArray(rows[ZERO]) ?
      rows[ZERO] :
      null;
  const observation = firstRow?.[CONTROL_SNAPSHOT_OBSERVATION_FIELD];
  if (
    !observation ||
    typeof observation !== 'object' ||
    Array.isArray(observation)
  ) {
    return null;
  }
  return observation;
}

function extractControlSnapshotPublicationRecoveryGate(result = null) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const firstRow =
    rows.length > ZERO &&
    rows[ZERO] &&
    typeof rows[ZERO] === 'object' &&
    !Array.isArray(rows[ZERO]) ?
      rows[ZERO] :
      null;
  const diagnostics = firstRow?.[CONTROL_PLANE_DIAGNOSTICS_FIELD];
  if (
    !diagnostics ||
    typeof diagnostics !== 'object' ||
    Array.isArray(diagnostics)
  ) {
    return null;
  }
  const publicationConvergence = diagnostics[PUBLICATION_CONVERGENCE_FIELD];
  const publicationRecoveryGate =
    diagnostics[PUBLICATION_CONVERGENCE_GATE_FIELD] ||
    publicationConvergence?.[PUBLICATION_RECOVERY_GATE_FIELD];
  return publicationRecoveryGate &&
    typeof publicationRecoveryGate === 'object' &&
    !Array.isArray(publicationRecoveryGate) ?
    publicationRecoveryGate :
    null;
}

function collectForcedControlSnapshotFallbackEvidence(result = null) {
  const observation = extractControlSnapshotObservation(result);
  const publicationRecoveryGate =
    extractControlSnapshotPublicationRecoveryGate(result);
  const observationState = String(
    observation?.[CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD] || '',
  )
    .trim()
    .toLowerCase();
  const contractState = String(
    observation?.[CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD] || '',
  )
    .trim()
    .toLowerCase();
  return Object.freeze({
    observationPresent: Boolean(observation),
    observationState,
    contractState,
    publicationRecoveryGatePresent: Boolean(publicationRecoveryGate),
    publicationRecoveryGateReady:
      publicationRecoveryGate?.[PUBLICATION_RECOVERY_GATE_READY_FIELD] === true,
  });
}

function decideForcedControlSnapshotFallback(evidence = {}) {
  const reasonCodes = [];
  if (evidence.observationPresent !== true) {
    reasonCodes.push(
      FORCED_CONTROL_SNAPSHOT_FALLBACK_REASON.MISSING_OBSERVATION,
    );
  }
  if (evidence.observationState === CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED) {
    reasonCodes.push(
      FORCED_CONTROL_SNAPSHOT_FALLBACK_REASON.OBSERVATION_FAILED,
    );
  }
  if (
    evidence.contractState ===
    CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED
  ) {
    reasonCodes.push(
      FORCED_CONTROL_SNAPSHOT_FALLBACK_REASON.OBSERVATION_CONTRACT_FAILED,
    );
  }
  if (
    evidence.publicationRecoveryGatePresent === true &&
    evidence.publicationRecoveryGateReady !== true
  ) {
    reasonCodes.push(
      FORCED_CONTROL_SNAPSHOT_FALLBACK_REASON
        .PUBLICATION_RECOVERY_GATE_NOT_READY,
    );
  }
  return Object.freeze({
    fallback: reasonCodes.length > ZERO,
    reasonCodes: Object.freeze([...reasonCodes]),
  });
}

function shouldFallbackToForcedControlSnapshot(result = null) {
  return decideForcedControlSnapshotFallback(
    collectForcedControlSnapshotFallbackEvidence(result),
  ).fallback;
}

export const CLUSTER_SEGMENT_4 = {
  ...CLUSTER_SEGMENT_3,
  resolveAdminRequestStatement,
  normalizeAdminQueryError,
  isTimeoutErrorMessage,
  extractControlSnapshotObservation,
  extractControlSnapshotPublicationRecoveryGate,
  collectForcedControlSnapshotFallbackEvidence,
  decideForcedControlSnapshotFallback,
  shouldFallbackToForcedControlSnapshot,
};
