import {CLUSTER_SEGMENT_3} from './cluster-segment-3.js';
import {AUTHORITATIVE_REPAIR_TRIGGER} from
  '../../../src/admin/admin-authoritative-repair-policy.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../src/control-plane/owner-contract-outcome.js';
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
const CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD = 'adminObservation';
const CONTROL_SNAPSHOT_ADMIN_REPAIR_FIELD = 'repair';
const CONTROL_SNAPSHOT_OBSERVATION_NEXT_ACTION_FIELD = 'nextAction';
const CONTROL_SNAPSHOT_OBSERVATION_REASON_CODES_FIELD = 'reasonCodes';
const CONTROL_SNAPSHOT_REPAIR_TRIGGER_CODES_FIELD = 'triggerCodes';
const LOCAL_STR_EMPTY = '';
const LOCAL_TYPE_OBJECT = 'object';
const LOCAL_TYPE_STRING = 'string';
const PUBLICATION_CONVERGENCE_GATE_FIELD = 'publicationConvergenceGate';
const PUBLICATION_CONVERGENCE_FIELD = 'publicationConvergence';
const PUBLICATION_RECOVERY_GATE_FIELD = 'publicationRecoveryGate';
const PUBLICATION_RECOVERY_GATE_READY_FIELD = 'ready';
const CONTROL_SNAPSHOT_REFRESH_REPAIR_TRIGGER_CODES = Object.freeze([
  AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
  AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT,
]);
const FORCED_CONTROL_SNAPSHOT_FALLBACK_REASON = Object.freeze({
  MISSING_OBSERVATION: 'missing_observation',
  OBSERVATION_FAILED: 'observation_failed',
  OBSERVATION_CONTRACT_FAILED: 'observation_contract_failed',
  REPAIRABLE_COVERAGE_GAP: 'repairable_coverage_gap',
  REPAIR_DEFERRED_REFRESH_DEBT: 'repair_deferred_refresh_debt',
  PUBLICATION_RECOVERY_GATE_NOT_READY: 'publication_recovery_gate_not_ready',
});

/**
 * Resolve the request statement field for trace diagnostics.
 * @param {Object} requestPayload
 * @returns {string}
 */
function resolveAdminRequestStatement(requestPayload) {
  if (!requestPayload || typeof requestPayload !== LOCAL_TYPE_OBJECT) {
    return LOCAL_STR_EMPTY;
  }
  if (typeof requestPayload.sql === LOCAL_TYPE_STRING) {
    return requestPayload.sql;
  }
  if (typeof requestPayload.statement === LOCAL_TYPE_STRING) {
    return requestPayload.statement;
  }
  return LOCAL_STR_EMPTY;
}

/**
 * Convert an error-like value into a stable message.
 * @param {*} error
 * @returns {string}
 */
function normalizeAdminQueryError(error) {
  if (
    error &&
    typeof error.message === LOCAL_TYPE_STRING &&
    error.message.length > ZERO
  ) {
    return error.message;
  }
  if (typeof error === LOCAL_TYPE_STRING && error.length > ZERO) {
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
  return String(message || LOCAL_STR_EMPTY)
    .toLowerCase()
    .includes(ERROR_MESSAGE_TIMEOUT_FRAGMENT);
}

function extractControlSnapshotRow(result = null) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  return (
    rows.length > ZERO &&
    rows[ZERO] &&
    typeof rows[ZERO] === LOCAL_TYPE_OBJECT &&
    !Array.isArray(rows[ZERO]) ?
      rows[ZERO] :
      null
  );
}

function normalizeControlSnapshotReasonCodes(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) =>
        typeof value === LOCAL_TYPE_STRING ? value.trim() : LOCAL_STR_EMPTY)
      .filter((value) => value.length > ZERO),
  )].sort();
}

function extractControlSnapshotObservation(result = null) {
  const firstRow = extractControlSnapshotRow(result);
  const observation = firstRow?.[CONTROL_SNAPSHOT_OBSERVATION_FIELD];
  if (
    !observation ||
    typeof observation !== LOCAL_TYPE_OBJECT ||
    Array.isArray(observation)
  ) {
    return null;
  }
  return observation;
}

function extractControlSnapshotAdminRepair(result = null) {
  const firstRow = extractControlSnapshotRow(result);
  const adminObservation =
    firstRow?.[CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD];
  if (
    !adminObservation ||
    typeof adminObservation !== LOCAL_TYPE_OBJECT ||
    Array.isArray(adminObservation)
  ) {
    return null;
  }
  const repair = adminObservation[CONTROL_SNAPSHOT_ADMIN_REPAIR_FIELD];
  return repair &&
    typeof repair === LOCAL_TYPE_OBJECT &&
    !Array.isArray(repair) ?
    repair :
    null;
}

function extractControlSnapshotPublicationRecoveryGate(result = null) {
  const firstRow = extractControlSnapshotRow(result);
  const diagnostics = firstRow?.[CONTROL_PLANE_DIAGNOSTICS_FIELD];
  if (
    !diagnostics ||
    typeof diagnostics !== LOCAL_TYPE_OBJECT ||
    Array.isArray(diagnostics)
  ) {
    return null;
  }
  const publicationConvergence = diagnostics[PUBLICATION_CONVERGENCE_FIELD];
  const publicationRecoveryGate =
    diagnostics[PUBLICATION_CONVERGENCE_GATE_FIELD] ||
    publicationConvergence?.[PUBLICATION_RECOVERY_GATE_FIELD];
  return publicationRecoveryGate &&
    typeof publicationRecoveryGate === LOCAL_TYPE_OBJECT &&
    !Array.isArray(publicationRecoveryGate) ?
    publicationRecoveryGate :
    null;
}

function collectForcedControlSnapshotFallbackEvidence(result = null) {
  const observation = extractControlSnapshotObservation(result);
  const adminRepair = extractControlSnapshotAdminRepair(result);
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
  const nextAction = String(
    observation?.[CONTROL_SNAPSHOT_OBSERVATION_NEXT_ACTION_FIELD] || '',
  )
    .trim()
    .toLowerCase();
  const reasonCodes = normalizeControlSnapshotReasonCodes([
    ...normalizeControlSnapshotReasonCodes(
      observation?.[CONTROL_SNAPSHOT_OBSERVATION_REASON_CODES_FIELD],
    ),
    ...normalizeControlSnapshotReasonCodes(
      adminRepair?.[CONTROL_SNAPSHOT_REPAIR_TRIGGER_CODES_FIELD],
    ),
  ]);
  return Object.freeze({
    observationPresent: Boolean(observation),
    observationState,
    contractState,
    nextAction,
    reasonCodes: Object.freeze(reasonCodes),
    repairDeferred: adminRepair?.deferred === true,
    publicationRecoveryGatePresent: Boolean(publicationRecoveryGate),
    publicationRecoveryGateReady:
      publicationRecoveryGate?.[PUBLICATION_RECOVERY_GATE_READY_FIELD] === true,
  });
}

function hasRepairableCoverageGap(evidence = {}) {
  return Array.isArray(evidence.reasonCodes) &&
    evidence.reasonCodes.includes(
      AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
    );
}

function hasRepairableRefreshDebt(evidence = {}) {
  return Array.isArray(evidence.reasonCodes) &&
    CONTROL_SNAPSHOT_REFRESH_REPAIR_TRIGGER_CODES.some((triggerCode) =>
      evidence.reasonCodes.includes(triggerCode));
}

function hasRepairableSnapshotObservation(evidence = {}) {
  return (
    evidence.contractState === OWNER_CONTRACT_STATE.PENDING ||
    evidence.contractState === OWNER_CONTRACT_STATE.DEFERRED ||
    evidence.nextAction === OWNER_CONTRACT_NEXT_ACTION.WAIT ||
    evidence.nextAction === OWNER_CONTRACT_NEXT_ACTION.RETRY ||
    evidence.repairDeferred === true
  );
}

function hasPendingSnapshotRepairAction(evidence = {}) {
  return (
    evidence.contractState === OWNER_CONTRACT_STATE.PENDING ||
    evidence.contractState === OWNER_CONTRACT_STATE.DEFERRED ||
    evidence.nextAction === OWNER_CONTRACT_NEXT_ACTION.WAIT ||
    evidence.nextAction === OWNER_CONTRACT_NEXT_ACTION.RETRY
  );
}

function hasNonFailedControlSnapshotObservation(evidence = {}) {
  return evidence.observationPresent === true &&
    evidence.observationState !== CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED &&
    evidence.contractState !==
      CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED;
}

function hasRepairDeferredRefreshDebt(evidence = {}) {
  return hasNonFailedControlSnapshotObservation(evidence) &&
    evidence.repairDeferred === true &&
    hasPendingSnapshotRepairAction(evidence) &&
    hasRepairableRefreshDebt(evidence);
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
    hasRepairableCoverageGap(evidence) &&
    hasRepairableSnapshotObservation(evidence)
  ) {
    reasonCodes.push(
      FORCED_CONTROL_SNAPSHOT_FALLBACK_REASON.REPAIRABLE_COVERAGE_GAP,
    );
  }
  if (hasRepairDeferredRefreshDebt(evidence)) {
    reasonCodes.push(
      FORCED_CONTROL_SNAPSHOT_FALLBACK_REASON.REPAIR_DEFERRED_REFRESH_DEBT,
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
  extractControlSnapshotRow,
  extractControlSnapshotObservation,
  extractControlSnapshotAdminRepair,
  extractControlSnapshotPublicationRecoveryGate,
  collectForcedControlSnapshotFallbackEvidence,
  decideForcedControlSnapshotFallback,
  shouldFallbackToForcedControlSnapshot,
};
