import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {LIFECYCLE_REASON} from '../lifecycle-controller-constants.js';
import {
  BOOTSTRAP_API_PROBE_REASON,
} from '../bootstrap-api-constants.js';

const BOOTSTRAP_REQUEST_ADMISSION_DECISION = Object.freeze({
  ADMIT: 'admit',
  DEFER_STARTUP_INCOMPLETE: 'defer_startup_incomplete',
  DEFER_BOOTSTRAP_JOIN_BLOCKED: 'defer_bootstrap_join_blocked',
});
const BOOTSTRAP_REQUEST_STALE_STARTUP_COMPLETE_REASON_CODES = Object.freeze([
  BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);
const BOOTSTRAP_REQUEST_REQUIRED_STALE_STARTUP_COMPLETE_REASON_CODES =
  Object.freeze([
    BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  ]);

function normalizeBootstrapRequestAdmissionReason(reason) {
  if (typeof reason !== 'string') {
    return null;
  }
  const normalized = reason.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBootstrapRequestAdmissionReasons(snapshot) {
  if (!Array.isArray(snapshot?.reasons)) {
    return [];
  }
  return [
    ...new Set(
      snapshot.reasons
        .map((reason) => normalizeBootstrapRequestAdmissionReason(reason))
        .filter((reason) => reason !== null),
    ),
  ];
}

function hasStartupCompleteStaleAdmissionReasons(snapshot) {
  const reasons = normalizeBootstrapRequestAdmissionReasons(snapshot);
  const hasRequiredReasons =
    BOOTSTRAP_REQUEST_REQUIRED_STALE_STARTUP_COMPLETE_REASON_CODES.every(
      (reason) => reasons.includes(reason),
    );
  const hasOnlyStaleReasons = reasons.every((reason) =>
    BOOTSTRAP_REQUEST_STALE_STARTUP_COMPLETE_REASON_CODES.includes(reason),
  );
  return reasons.length > 0 && hasRequiredReasons && hasOnlyStaleReasons;
}

function canAdmitStartupCompleteStaleAdmissionSnapshot(
  startupComplete,
  snapshot,
) {
  return startupComplete === true &&
    snapshot?.draining !== true &&
    snapshot?.bootstrapJoinAuthorityAvailable === true &&
    hasStartupCompleteStaleAdmissionReasons(snapshot);
}

export {
  BOOTSTRAP_REQUEST_ADMISSION_DECISION,
  canAdmitStartupCompleteStaleAdmissionSnapshot,
};
