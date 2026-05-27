const ZERO = 0;
const STARTUP_READINESS_PHASE_PROJECTABLE_RANK = 1;
const TYPEOF_STRING = 'string';
const TYPEOF_OBJECT = 'object';
const EMPTY_STRING = '';
const ERROR_MESSAGE_TIMEOUT_FRAGMENT = 'timeout';
const ERROR_MESSAGE_TIMEOUT_LIKE_FRAGMENT = 'timed out';
const STARTUP_READINESS_MODE_LOAD_VALUE = 'load';
const STARTUP_READINESS_MODE_STARTUP_VALUE = 'startup';
const ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE_VALUE = 'none';
const ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT_VALUE =
  'snapshot_timeout';
const ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT_VALUE =
  'snapshot_reachability_timeout';
const ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_TERMINAL_VALUE = 'terminal';
const ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE_VALUE =
  'recoverable';
const STARTUP_ADMISSION_STATE_STRONG_ACTIVE = 'strong_active';
const STARTUP_ADMISSION_STATE_DEGRADED_BUT_PROCEEDING =
  'degraded_but_proceeding';
const STARTUP_ADMISSION_STATE_BLOCKED = 'blocked';
const STARTUP_ACTIVE_PROJECTION_REASON_LOCAL_QUERY_TRANSPORT_NOT_READY =
  'local_query_transport_not_ready';
const STARTUP_ACTIVE_PROJECTION_REASON_READINESS_STABLE_WINDOW_PENDING =
  'readiness_stable_window_pending';
const STARTUP_ADMIN_REACHABLE_BY_ADMIN_HEALTH = 'admin_health';
export const STARTUP_READINESS_MODE_LOAD = STARTUP_READINESS_MODE_LOAD_VALUE;
export const STARTUP_READINESS_MODE_STARTUP =
  STARTUP_READINESS_MODE_STARTUP_VALUE;
export const ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE =
  ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE_VALUE;
export const ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT =
  ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT_VALUE;
export const ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT =
  ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT_VALUE;
export const ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_TERMINAL =
  ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_TERMINAL_VALUE;
export const ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE =
  ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE_VALUE;
const ACTIVE_GATE_READINESS_DELAY_SNAPSHOT_ERROR_SOURCE =
  'selectedSnapshotError';
const ACTIVE_GATE_READINESS_DELAY_REACHABILITY_ERROR_SOURCE =
  'selectedSnapshotReachabilityError';
export const STARTUP_ADMISSION_STATE = Object.freeze({
  STRONG_ACTIVE: STARTUP_ADMISSION_STATE_STRONG_ACTIVE,
  DEGRADED_BUT_PROCEEDING: STARTUP_ADMISSION_STATE_DEGRADED_BUT_PROCEEDING,
  BLOCKED: STARTUP_ADMISSION_STATE_BLOCKED,
});
const STARTUP_READINESS_PHASE_RANK = Object.freeze({
  INIT: 0,
  CONTROL_READY: 1,
  JOIN_READY: 2,
  TRAFFIC_READY: 3,
  DEGRADED: 1,
});
const STARTUP_ADMIN_REACHABILITY_TRANSIENT_ERROR_FRAGMENTS = Object.freeze([
  'econnrefused',
  'ehostunreach',
  'connection refused',
  'connection reset',
  'connection reset by peer',
  'host unreachable',
  'socket hang up',
  'connect timed out',
]);

/**
 * Transient-readyness reasons that allow projection from administrative proof.
 */
export const STARTUP_ACTIVE_PROJECTION_REASON = Object.freeze(new Set([
  STARTUP_ACTIVE_PROJECTION_REASON_LOCAL_QUERY_TRANSPORT_NOT_READY,
  STARTUP_ACTIVE_PROJECTION_REASON_READINESS_STABLE_WINDOW_PENDING,
]));

function resolveReadinessPhaseRank(readiness) {
  const phaseRank = readiness?.phaseRank;
  if (Number.isFinite(phaseRank)) {
    return Math.max(ZERO, Math.floor(phaseRank));
  }
  const normalizedPhase = typeof readiness?.phase === TYPEOF_STRING ?
    readiness.phase.toUpperCase() :
    EMPTY_STRING;
  return STARTUP_READINESS_PHASE_RANK[normalizedPhase] || ZERO;
}

/**
 * Convert a caught error value into a stable diagnostic message.
 * @param {*} error
 * @returns {string}
 */
function normalizeProbeError(error) {
  if (
    error &&
    typeof error.message === TYPEOF_STRING &&
    error.message.length > ZERO
  ) {
    return error.message;
  }
  if (typeof error === TYPEOF_STRING && error.length > ZERO) {
    return error;
  }
  return null;
}

/**
 * Determine whether one probe error string is timeout-shaped.
 * @param {*} error
 * @returns {boolean}
 */
export function isTimeoutShapedProbeError(error) {
  const normalizedError = String(normalizeProbeError(error)).toLowerCase();
  if (normalizedError.length === ZERO) {
    return false;
  }
  return normalizedError.includes(ERROR_MESSAGE_TIMEOUT_FRAGMENT) ||
    normalizedError.includes(ERROR_MESSAGE_TIMEOUT_LIKE_FRAGMENT);
}

/**
 * Determine whether one admin reachability error should be treated as transient.
 * @param {*} message
 * @returns {boolean}
 */
export function isStartupAdminReachabilityTransientError(message) {
  const normalizedMessage = String(normalizeProbeError(message)).toLowerCase();
  if (isTimeoutShapedProbeError(normalizedMessage)) {
    return true;
  }
  return STARTUP_ADMIN_REACHABILITY_TRANSIENT_ERROR_FRAGMENTS.some(
    (errorFragment) => normalizedMessage.includes(errorFragment),
  );
}

/**
 * Determine whether startup readiness reasons are strong enough for projection.
 * @param {*} readiness
 * @param {*} _adminDiagnostics
 * @returns {boolean}
 */
export function canProjectStartupActiveFromReadiness(readiness, _adminDiagnostics = null) {
  const phaseRank = resolveReadinessPhaseRank(readiness);
  if (phaseRank < STARTUP_READINESS_PHASE_PROJECTABLE_RANK) {
    return false;
  }

  const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
  if (reasons.length === ZERO) {
    return false;
  }

  return reasons.every((reason) =>
    STARTUP_ACTIVE_PROJECTION_REASON.has(
      String(reason || EMPTY_STRING).toLowerCase(),
    ),
  );
}

/**
 * Build a minimal startup admin projection signal from readiness + reachability.
 * @param {*} readiness
 * @param {*} adminDiagnostics
 * @returns {boolean}
 */
export function canProjectStartupActiveFromTransientAdmin(readiness, adminDiagnostics) {
  if (!canProjectStartupActiveFromReadiness(readiness, adminDiagnostics)) {
    return false;
  }

  if (adminDiagnostics?.adminReady === true) {
    return true;
  }

  if (adminDiagnostics?.reachable !== true) {
    return false;
  }

  const adminErrors = [
    adminDiagnostics?.adminHealth?.error,
    adminDiagnostics?.adminWs?.error,
    adminDiagnostics?.sqlProbe?.error,
    adminDiagnostics?.lastError,
  ];

  return adminErrors.some((error) =>
    isStartupAdminReachabilityTransientError(error),
  );
}

/**
 * Determine whether the selected startup snapshot witness is admin-backed.
 * @param {*} snapshot
 * @returns {boolean}
 */
export function hasStartupAdminWitness(snapshot = null) {
  const selected = snapshot && typeof snapshot === TYPEOF_OBJECT ?
    snapshot :
    {};
  return selected.selectedSnapshotAdminReady === true ||
    selected.selectedSnapshotReachableBy ===
      STARTUP_ADMIN_REACHABLE_BY_ADMIN_HEALTH ||
    isStartupAdminReachabilityTransientError(
      selected.selectedSnapshotReachabilityError ||
        selected.selectedReachabilityError,
    ) ||
    (selected.selectedSnapshotError == null &&
      selected.selectedError == null);
}

/**
 * Determine whether admin evidence is strong enough for closure witness emission.
 * Transient reachability-only evidence is intentionally excluded.
 * @param {*} snapshot
 * @returns {boolean}
 */
export function hasStartupAdminClosureWitness(snapshot = null) {
  const selected = snapshot && typeof snapshot === TYPEOF_OBJECT ?
    snapshot :
    {};
  return (
    selected.selectedSnapshotAdminReady === true ||
    selected.selectedSnapshotReachableBy ===
      STARTUP_ADMIN_REACHABLE_BY_ADMIN_HEALTH ||
    (
      selected.selectedSnapshotError == null &&
      selected.selectedError == null &&
      selected.selectedReachabilityError == null &&
      selected.selectedSnapshotReachabilityError == null
    )
  );
}

/**
 * Classify whether active-wait progress has a timeout-shaped snapshot signal.
 * Recoverability is load-mode specific to preserve existing soft-acceptance behavior
 * while still surfacing timeout-shaped progress delay.
 * @param {*} param0
 * @returns {object}
 */
export function classifyActiveGateReadinessDelay({
  readinessMode = null,
  selectedSnapshotError = null,
  selectedSnapshotReachabilityError = null,
} = {}) {
  const normalizedMode = readinessMode === STARTUP_READINESS_MODE_LOAD ?
    STARTUP_READINESS_MODE_LOAD :
    STARTUP_READINESS_MODE_STARTUP;
  const timeoutError = normalizeProbeError(selectedSnapshotError);
  const timeoutReachabilityError = normalizeProbeError(
    selectedSnapshotReachabilityError,
  );
  if (isTimeoutShapedProbeError(timeoutError)) {
    return {
      timedOut: true,
      cause: ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT,
      source: ACTIVE_GATE_READINESS_DELAY_SNAPSHOT_ERROR_SOURCE,
      recoverability: normalizedMode === STARTUP_READINESS_MODE_LOAD ?
        ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE :
        ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_TERMINAL,
      error: timeoutError,
    };
  }
  if (isTimeoutShapedProbeError(timeoutReachabilityError)) {
    return {
      timedOut: true,
      cause: ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT,
      source: ACTIVE_GATE_READINESS_DELAY_REACHABILITY_ERROR_SOURCE,
      recoverability: normalizedMode === STARTUP_READINESS_MODE_LOAD ?
        ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE :
        ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_TERMINAL,
      error: timeoutReachabilityError,
    };
  }
  return {
    timedOut: false,
    cause: ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE,
    source: null,
    recoverability: null,
    error: null,
  };
}
