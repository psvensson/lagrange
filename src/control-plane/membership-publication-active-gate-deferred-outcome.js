// The active-gate reconcile's deferred-outcome vocabulary: how a deferred
// write is re-asked from inside the owner's own run, whether that re-ask was
// accepted, and the reason code and retry bound the deferred outcome states.
import {
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
  getControlPlaneRetryAfterMs,
} from './control-plane-error-classification.js';
import {
  CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS,
  normalizeControlPlaneConvergenceRetryAfterMs,
} from './membership-publication-control-plane-convergence.js';

// A deferred write re-asked from inside this owner's own run names no change
// (the same handoff, the same rows): it is retried after the critical
// convergence bound, never at once.
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DEFERRED_WRITE_REQUEUE = Object.freeze({
  selfRequeue: Object.freeze({
    delayMs: CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS,
  }),
});

function resolveActiveGateMembershipPublicationHandoffRetryAfterMs(
  error,
  controlPlaneConvergence,
) {
  if (
    Number.isFinite(controlPlaneConvergence?.retryAfterMs) &&
    controlPlaneConvergence.retryAfterMs > 0
  ) {
    return normalizeControlPlaneConvergenceRetryAfterMs(
      controlPlaneConvergence.retryAfterMs,
    );
  }
  return normalizeControlPlaneConvergenceRetryAfterMs(
    getControlPlaneRetryAfterMs(error),
  );
}
function isActiveGateMembershipPublicationHandoffRetryAccepted(
  rawEnqueueOutcome,
  controlPlaneConvergence,
) {
  return rawEnqueueOutcome === true ||
    controlPlaneConvergence?.pressureOutcome ===
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED;
}
function resolveActiveGateMembershipPublicationDeferredReasonCode(
  target,
  controlPlaneConvergence,
) {
  const convergenceReasonCode = controlPlaneConvergence?.reasonCode;
  if (
    typeof convergenceReasonCode === 'string' &&
    convergenceReasonCode.length > 0
  ) {
    return convergenceReasonCode;
  }
  const handoffReasonCode = target?.handoffContract?.reasonCode;
  return typeof handoffReasonCode === 'string' &&
    handoffReasonCode.length > 0 ?
    handoffReasonCode :
    null;
}

export {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DEFERRED_WRITE_REQUEUE,
  isActiveGateMembershipPublicationHandoffRetryAccepted,
  resolveActiveGateMembershipPublicationDeferredReasonCode,
  resolveActiveGateMembershipPublicationHandoffRetryAfterMs,
};
