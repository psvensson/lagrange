import {NUM, TYPEOF} from '../../constants/index.js';
import {BOOTSTRAP_PIPELINE_ERROR_CODE} from '../bootstrap-constants.js';
import {BOOTSTRAP_API_PROBE_SCOPE} from '../bootstrap-api-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {hasTransitionalStartupAuthorityEvidence} from '../../control-plane/startup-authority-snapshot-owner.js';
import {canBypassBootstrapInitPriorityReasons} from '../startup-recovery-coordinator.js';
import {
  isUsableStartupAuthoritySnapshot,
} from './bootstrap-startup-authority-evidence.js';
import {BOOTSTRAP_READINESS_OWNER_LITERAL} from './bootstrap-readiness-owner-literals.js';

const BOOTSTRAP_JOIN_NON_BLOCKING_REASONS = Object.freeze([
  BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
]);
const BOOTSTRAP_JOIN_NON_BLOCKING_REASON_SET = new Set(
  BOOTSTRAP_JOIN_NON_BLOCKING_REASONS,
);
const BOOTSTRAP_JOIN_PROJECTION_RULE = Object.freeze({
  ALREADY_READY: 'already_ready',
  JOIN_STABLE_WINDOW: 'join_stable_window',
  INIT_PRIORITY_BYPASS: 'init_priority_bypass',
  CONTROL_DEGRADED_NON_BLOCKING: 'control_degraded_non_blocking',
});
const BOOTSTRAP_JOIN_PROJECTION_BLOCKER = Object.freeze({
  DRAINING: 'draining',
  PHASE_NOT_ELIGIBLE: 'phase_not_eligible',
  CONTROL_SNAPSHOT_AUTHORITY_UNAVAILABLE:
    'control_snapshot_authority_unavailable',
  JOIN_STABLE_WINDOW_REASONS: 'join_stable_window_reasons',
  INIT_PRIORITY_BYPASS_REJECTED: 'init_priority_bypass_rejected',
  CONTROL_DEGRADED_NO_REASONS: 'control_degraded_no_reasons',
  CONTROL_DEGRADED_BLOCKING_REASONS: 'control_degraded_blocking_reasons',
});

function normalizeReasonCode(reason) {
  if (typeof reason !== TYPEOF.STRING) {
    return null;
  }
  const normalized = reason.trim();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function normalizeReasonCodeArray(reasonCodes) {
  if (!Array.isArray(reasonCodes)) {
    return [];
  }
  return [
    ...new Set(
      reasonCodes
        .map((reason) => normalizeReasonCode(reason))
        .filter((reason) => reason !== null),
    ),
  ];
}

function normalizeLifecyclePhaseFromSnapshot(snapshot) {
  const phase =
    typeof snapshot?.phase === TYPEOF.STRING ?
      snapshot.phase.trim().toUpperCase() :
      '';
  if (Object.values(LIFECYCLE_PHASE).includes(phase)) {
    return phase;
  }
  const resolvedState =
    typeof snapshot?.state === TYPEOF.STRING ?
      snapshot.state.trim().toLowerCase() :
      '';
  switch (resolvedState) {
  case BOOTSTRAP_READINESS_OWNER_LITERAL.STARTING:
  case BOOTSTRAP_READINESS_OWNER_LITERAL.BOOTSTRAPPING:
    return LIFECYCLE_PHASE.INIT;
  case BOOTSTRAP_READINESS_OWNER_LITERAL.WARMING:
    return LIFECYCLE_PHASE.CONTROL_READY;
  case BOOTSTRAP_READINESS_OWNER_LITERAL.JOIN_READY:
    return LIFECYCLE_PHASE.JOIN_READY;
  case BOOTSTRAP_READINESS_OWNER_LITERAL.DEGRADED:
    return LIFECYCLE_PHASE.DEGRADED;
  default:
    return null;
  }
}

function hasBootstrapJoinAuthority(priorityRecoveryHealth) {
  if (
    !priorityRecoveryHealth ||
    typeof priorityRecoveryHealth !== TYPEOF.OBJECT
  ) {
    return false;
  }
  if (priorityRecoveryHealth.healthy === true) {
    return true;
  }
  const details =
    priorityRecoveryHealth.details &&
    typeof priorityRecoveryHealth.details === TYPEOF.OBJECT ?
      priorityRecoveryHealth.details :
      null;
  if (details && hasTransitionalStartupAuthorityEvidence(details)) {
    return true;
  }
  return (
    !details ||
    typeof details.failureReason !== TYPEOF.STRING ||
    details.failureReason.length === NUM.ZERO
  );
}

function buildBootstrapJoinProjectionResult(options = {}) {
  return {
    canProjectReady: options.canProjectReady === true,
    projectionRule: options.projectionRule || null,
    blockerReason: options.blockerReason || null,
    normalizedPhase: options.normalizedPhase || null,
    reasons: Array.isArray(options.reasons) ? options.reasons : [],
    blockingReasons: Array.isArray(options.blockingReasons) ?
      options.blockingReasons :
      [],
  };
}

function resolveControlPhaseBootstrapJoinProjection(
  normalizedReasons,
  blockingReasons,
) {
  if (normalizedReasons.length === NUM.ZERO) {
    return buildBootstrapJoinProjectionResult({
      blockerReason:
        BOOTSTRAP_JOIN_PROJECTION_BLOCKER.CONTROL_DEGRADED_NO_REASONS,
    });
  }
  const canProjectFromControlPhase = blockingReasons.length === NUM.ZERO;
  return buildBootstrapJoinProjectionResult({
    canProjectReady: canProjectFromControlPhase,
    projectionRule: canProjectFromControlPhase ?
      BOOTSTRAP_JOIN_PROJECTION_RULE.CONTROL_DEGRADED_NON_BLOCKING :
      null,
    blockerReason: canProjectFromControlPhase ?
      null :
      BOOTSTRAP_JOIN_PROJECTION_BLOCKER.CONTROL_DEGRADED_BLOCKING_REASONS,
  });
}

const BOOTSTRAP_JOIN_PROJECTION_METHODS = Object.freeze({
  resolveReadinessSnapshotForScope(snapshot, scope) {
    if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return snapshot;
    }
    if (
      scope !== BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN ||
      snapshot.ready === true
    ) {
      this.lastBootstrapJoinProjectionEvaluation = {
        scope,
        canProjectReady: false,
        projectionRule: BOOTSTRAP_JOIN_PROJECTION_RULE.ALREADY_READY,
        blockerReason:
          snapshot.ready === true ?
            BOOTSTRAP_JOIN_PROJECTION_RULE.ALREADY_READY :
            BOOTSTRAP_JOIN_PROJECTION_BLOCKER.PHASE_NOT_ELIGIBLE,
        normalizedPhase: normalizeLifecyclePhaseFromSnapshot(snapshot),
        reasons: normalizeReasonCodeArray(snapshot?.reasons),
        blockingReasons: [],
      };
      return snapshot;
    }
    const startupAuthority = this.getStartupAuthoritySnapshot(
      snapshot?.timestamp || Date.now(),
    );
    const projectionEvaluation = this.evaluateBootstrapJoinProjection(
      snapshot,
      {
        bootstrapJoinAuthorityAvailable:
          snapshot?.bootstrapJoinAuthorityAvailable === true ||
          isUsableStartupAuthoritySnapshot(startupAuthority) ||
          hasBootstrapJoinAuthority(
            this.getPriorityControlPlaneRecoveryHealth(),
          ),
      },
    );
    this.lastBootstrapJoinProjectionEvaluation = projectionEvaluation;
    if (projectionEvaluation.canProjectReady !== true) {
      return snapshot;
    }
    return {
      ...snapshot,
      ready: true,
      reasons: [],
      retryAfterMs: NUM.ZERO,
    };
  },
  evaluateBootstrapJoinProjection(snapshot, options = {}) {
    const normalizedReasons = Array.isArray(options.reasons) ?
      normalizeReasonCodeArray(options.reasons) :
      normalizeReasonCodeArray(snapshot?.reasons);
    const blockingReasons = Array.isArray(options.blockingReasons) ?
      normalizeReasonCodeArray(options.blockingReasons) :
      normalizedReasons.filter(
        (reason) => !BOOTSTRAP_JOIN_NON_BLOCKING_REASON_SET.has(reason),
      );
    const normalizedPhase = normalizeLifecyclePhaseFromSnapshot(snapshot);
    const draining = snapshot?.draining === true;
    const bootstrapJoinAuthorityAvailable =
      options.bootstrapJoinAuthorityAvailable === true ||
      snapshot?.bootstrapJoinAuthorityAvailable === true;
    let canProjectReady = false;
    let projectionRule = null;
    let blockerReason = BOOTSTRAP_JOIN_PROJECTION_BLOCKER.PHASE_NOT_ELIGIBLE;
    if (draining) {
      blockerReason = BOOTSTRAP_JOIN_PROJECTION_BLOCKER.DRAINING;
    } else if (!bootstrapJoinAuthorityAvailable) {
      blockerReason =
        BOOTSTRAP_JOIN_PROJECTION_BLOCKER.CONTROL_SNAPSHOT_AUTHORITY_UNAVAILABLE;
    } else if (normalizedPhase === LIFECYCLE_PHASE.JOIN_READY) {
      const joinStableWindowOnly =
        normalizedReasons.length === NUM.ONE &&
        normalizedReasons[NUM.ZERO] ===
          LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
      canProjectReady = joinStableWindowOnly;
      projectionRule = joinStableWindowOnly ?
        BOOTSTRAP_JOIN_PROJECTION_RULE.JOIN_STABLE_WINDOW :
        null;
      blockerReason = joinStableWindowOnly ?
        null :
        BOOTSTRAP_JOIN_PROJECTION_BLOCKER.JOIN_STABLE_WINDOW_REASONS;
    } else if (normalizedPhase === LIFECYCLE_PHASE.INIT) {
      const bootstrapInitPriorityBypass = canBypassBootstrapInitPriorityReasons(
        normalizedReasons,
        {
          ...snapshot,
          phase: normalizedPhase,
        },
      );
      canProjectReady = bootstrapInitPriorityBypass;
      projectionRule = bootstrapInitPriorityBypass ?
        BOOTSTRAP_JOIN_PROJECTION_RULE.INIT_PRIORITY_BYPASS :
        null;
      blockerReason = bootstrapInitPriorityBypass ?
        null :
        BOOTSTRAP_JOIN_PROJECTION_BLOCKER.INIT_PRIORITY_BYPASS_REJECTED;
    } else if (
      normalizedPhase === LIFECYCLE_PHASE.CONTROL_READY ||
      normalizedPhase === LIFECYCLE_PHASE.DEGRADED
    ) {
      const controlPhaseProjection = resolveControlPhaseBootstrapJoinProjection(
        normalizedReasons,
        blockingReasons,
      );
      canProjectReady = controlPhaseProjection.canProjectReady;
      projectionRule = controlPhaseProjection.projectionRule;
      blockerReason = controlPhaseProjection.blockerReason;
    }
    return buildBootstrapJoinProjectionResult({
      canProjectReady,
      projectionRule,
      blockerReason,
      normalizedPhase,
      reasons: normalizedReasons,
      blockingReasons,
    });
  },
  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    return this.evaluateBootstrapJoinProjection(snapshot, {
      reasons,
      blockingReasons,
    }).canProjectReady;
  },
});

function assignBootstrapJoinProjectionMethods(ownerClass) {
  Object.defineProperties(
    ownerClass.prototype,
    Object.fromEntries(
      Object.entries(BOOTSTRAP_JOIN_PROJECTION_METHODS).map(
        ([name, value]) => [
          name,
          {
            configurable: true,
            value,
            writable: true,
          },
        ],
      ),
    ),
  );
}

export {
  assignBootstrapJoinProjectionMethods,
  hasBootstrapJoinAuthority,
  normalizeLifecyclePhaseFromSnapshot,
  normalizeReasonCodeArray,
};
