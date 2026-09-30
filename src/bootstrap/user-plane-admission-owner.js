import {
  buildLifecycleReadinessNotReadyError,
  getTrafficReadinessSnapshotReadOnly,
  isTrafficReadySnapshot,
} from './traffic-readiness-utils.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const USER_PLANE_NOT_READY_CODE = 'USER_PLANE_TRAFFIC_NOT_READY';
const USER_PLANE_NOT_READY_LABEL = 'User-plane traffic readiness';

// NOT WIRED. The enforcement point was built and withdrawn: measured on a
// live three-node formation, the readiness controller is driven, ends
// DEGRADED with PRIORITY_CONTROL_PLANE_RECOVERY_PENDING and never reaches
// TRAFFIC_READY, so a wired gate refuses all ordinary user work permanently.
// Wiring waits on a node demonstrably reaching TRAFFIC_READY on the gated
// path, which in turn waits on critical system-table placement precedence.
//
// Why this owner exists: the refusal machinery was already complete — a
// TRAFFIC_READY predicate, a typed retryable error, and a progress contract —
// and had ZERO production callers, so nothing held ordinary user work outside
// a forming cluster. The decision is placed here rather than at the routing
// layer because "may this work run yet?" is a lifecycle question; routing
// answers "where does it go?". Table identity is not a lifecycle authority.
const USER_PLANE_ADMISSION_REASON = Object.freeze({
  ADMITTED_TRAFFIC_READY: 'admitted_traffic_ready',
  ADMITTED_CONTROL_PLANE: 'admitted_control_plane_capability',
  ADMITTED_NO_LIFECYCLE_AUTHORITY: 'admitted_no_lifecycle_authority',
  REFUSED_TRAFFIC_NOT_READY: 'refused_user_plane_traffic_not_ready',
  REFUSED_LIFECYCLE_UNREADABLE: 'refused_lifecycle_readiness_unreadable',
});

const ADMITTED_REASONS = Object.freeze([
  USER_PLANE_ADMISSION_REASON.ADMITTED_TRAFFIC_READY,
  USER_PLANE_ADMISSION_REASON.ADMITTED_CONTROL_PLANE,
  USER_PLANE_ADMISSION_REASON.ADMITTED_NO_LIFECYCLE_AUTHORITY,
]);

/**
 * Resolve the lifecycle snapshot from an injected provider. A provider that is
 * absent, not callable, or answers with no snapshot means this composition has
 * no lifecycle authority at all — an embedded single-node engine, not a node
 * mid-formation. That is a distinct, typed outcome rather than a silent
 * default, so a wiring regression is nameable instead of invisible.
 *
 * @param {Function|Object|null} provider
 * @return {Object|null}
 */
function resolveLifecycleAuthority(provider) {
  const state = typeof provider === LOCAL_STR_FUNCTION ?
    provider() :
    provider;
  if (!state || typeof state !== LOCAL_STR_OBJECT) {
    return {present: false, snapshot: null};
  }
  // The provider supplies the readiness STATE, the same shape isTrafficReady
  // consumes; the snapshot is projected from it by its own owner.
  const snapshot = getTrafficReadinessSnapshotReadOnly(state);
  // A projection that answers with a primitive is unreadable evidence, not a
  // not-yet-ready cluster; reporting it as the latter would name the wrong
  // cause and hide a broken provider.
  return {
    present: true,
    snapshot: snapshot && typeof snapshot === LOCAL_STR_OBJECT ?
      snapshot :
      null,
  };
}

/**
 * The single admission decision for one unit of work. Projection only: it mints
 * no lifecycle phase, publishes nothing, and derives nothing from nodes.status,
 * publication counts, or coverage.
 *
 * @param {Object} options
 * @param {boolean} [options.controlPlaneCapability] work the cluster needs in
 *   order to become safe (membership, placement, system-table replication).
 * @param {Function|Object|null} [options.lifecycleReadinessProvider]
 * @return {Object} frozen decision
 */
function resolveUserPlaneAdmission(options = {}) {
  const controlPlaneCapability = options.controlPlaneCapability === true;
  const authority = resolveLifecycleAuthority(
    options.lifecycleReadinessProvider,
  );
  const snapshot = authority.snapshot;

  // No authority at all is an embedded engine with no cluster to form, so
  // there is nothing to wait for. An authority that is PRESENT but yields no
  // readable snapshot is a wiring or evaluation fault, and unreadable evidence
  // must fail closed — collapsing the two would let a wiring regression read
  // as "no cluster" and silently admit everything.
  if (!authority.present) {
    return Object.freeze({
      admitted: true,
      reasonCode: USER_PLANE_ADMISSION_REASON.ADMITTED_NO_LIFECYCLE_AUTHORITY,
      lifecycleReadiness: null,
    });
  }
  if (snapshot === null) {
    return Object.freeze({
      admitted: controlPlaneCapability,
      reasonCode: controlPlaneCapability ?
        USER_PLANE_ADMISSION_REASON.ADMITTED_CONTROL_PLANE :
        USER_PLANE_ADMISSION_REASON.REFUSED_LIFECYCLE_UNREADABLE,
      lifecycleReadiness: null,
    });
  }
  // A lifecycle nobody has evaluated yet reports INIT/ready:false, which is
  // the ABSENCE of a decision, not a decision to hold traffic. Treating it as
  // not-ready would refuse every query forever wherever no component drives
  // evaluation on a cadence — measured to be the case today.
  if (isTrafficReadySnapshot(snapshot)) {
    return Object.freeze({
      admitted: true,
      reasonCode: USER_PLANE_ADMISSION_REASON.ADMITTED_TRAFFIC_READY,
      lifecycleReadiness: snapshot,
    });
  }
  // Before TRAFFIC_READY the control plane must still be able to build the
  // cluster; only ordinary user work waits.
  if (controlPlaneCapability) {
    return Object.freeze({
      admitted: true,
      reasonCode: USER_PLANE_ADMISSION_REASON.ADMITTED_CONTROL_PLANE,
      lifecycleReadiness: snapshot,
    });
  }
  return Object.freeze({
    admitted: false,
    reasonCode: USER_PLANE_ADMISSION_REASON.REFUSED_TRAFFIC_NOT_READY,
    lifecycleReadiness: snapshot,
  });
}

/**
 * The typed retryable refusal for a decision that was not admitted. Reuses the
 * existing lifecycle error builder so the progress contract, retryAfterMs and
 * wake source are the ones the readiness owner already publishes.
 *
 * @param {Object} decision
 * @return {Error}
 */
function buildUserPlaneAdmissionError(decision) {
  return buildLifecycleReadinessNotReadyError(
    decision?.lifecycleReadiness || null,
    {code: USER_PLANE_NOT_READY_CODE, label: USER_PLANE_NOT_READY_LABEL},
  );
}

function isUserPlaneAdmitted(decision) {
  return decision?.admitted === true &&
    ADMITTED_REASONS.includes(decision.reasonCode);
}

export {
  USER_PLANE_ADMISSION_REASON,
  USER_PLANE_NOT_READY_CODE,
  buildUserPlaneAdmissionError,
  isUserPlaneAdmitted,
  resolveUserPlaneAdmission,
};
