import { HTTP_STATUS, NUM, TYPEOF } from "../../constants/index.js";
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from "../bootstrap-constants.js";
import {
  BOOTSTRAP_API_LIVENESS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_PROBE_SCOPE,
  BOOTSTRAP_API_ROUTE,
} from "../bootstrap-api-constants.js";
import { READINESS_DEPENDENCY } from "../bootstrap-readiness-state-constants.js";
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_DEPENDENCY_DEMOTION_POLICY,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from "../lifecycle-controller-constants.js";
import {
  getLocalQueryTransportReadiness,
  isLocalQueryTransportReady,
} from "../shared/local-query-transport-readiness.js";
import { buildBootstrapReadinessStage } from "../bootstrap-readiness-ladder.js";
import { buildPublicationRecoveryProtocolSnapshot } from "../../control-plane/recovery-protocol-snapshot.js";
import { CONTROL_PLANE_WRITE_HEALTH_STATE } from "../control-plane-write-health-owner.js";
import { canBypassBootstrapInitPriorityReasons } from "../startup-recovery-coordinator.js";
import { BootstrapReadinessOwner } from './bootstrap-readiness-owner-class-part-2.js';
const BOOTSTRAP_READINESS_OWNER_LITERAL = Object.freeze({
  STARTING: "starting",
  BOOTSTRAPPING: "bootstrapping",
  WARMING: "warming",
  JOIN_READY: "join_ready",
  DEGRADED: "degraded",
  READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING:
    "Readiness probe async diagnostics timed out; using ",
  SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK:
    "synchronous readiness snapshot fallback",
  AUTHORITY_UNAVAILABLE: "authority_unavailable",
  NONE: "none",
  PRESENT: "present",
  OBSERVATION_UNAVAILABLE: "observation_unavailable",
  DEGRADED_2: "DEGRADED",
  MISSINGPARTITIONLEADERS: "missingPartitionLeaders",
  MISSINGPARTITIONLEADERNODES: "missingPartitionLeaderNodes",
  MISSINGPARTITIONLEADERADDRESSES: "missingPartitionLeaderAddresses",
  MISSINGMESSAGEGROUPLEADERS: "missingMessageGroupLeaders",
  MISSINGMESSAGEGROUPLEADERNODES: "missingMessageGroupLeaderNodes",
  MISSINGMESSAGEGROUPLEADERADDRESSES: "missingMessageGroupLeaderAddresses",
});
const BOOTSTRAP_READINESS_DEPENDENCY = Object.freeze({
  SQL_ENGINE_READY: "sql_engine_ready",
  LEADER_METADATA_READY: "leader_metadata_ready",
  RUNTIME_WIRING_READY: "runtime_wiring_ready",
  LOCAL_QUERY_TRANSPORT_READY: "local_query_transport_ready",
  CONTROL_PLANE_WRITE_HEALTH: "control_plane_write_health",
  PRIORITY_CONTROL_PLANE_RECOVERY: "priority_control_plane_recovery",
});
const BOOTSTRAP_JOIN_NON_BLOCKING_REASONS = Object.freeze([
  BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
]);
const BOOTSTRAP_JOIN_NON_BLOCKING_REASON_SET = new Set(
  BOOTSTRAP_JOIN_NON_BLOCKING_REASONS,
);
const BOOTSTRAP_JOIN_PROJECTION_RULE = Object.freeze({
  ALREADY_READY: "already_ready",
  JOIN_STABLE_WINDOW: "join_stable_window",
  INIT_PRIORITY_BYPASS: "init_priority_bypass",
  CONTROL_DEGRADED_NON_BLOCKING: "control_degraded_non_blocking",
});
const BOOTSTRAP_JOIN_PROJECTION_BLOCKER = Object.freeze({
  DRAINING: "draining",
  PHASE_NOT_ELIGIBLE: "phase_not_eligible",
  CONTROL_SNAPSHOT_AUTHORITY_UNAVAILABLE:
    "control_snapshot_authority_unavailable",
  JOIN_STABLE_WINDOW_REASONS: "join_stable_window_reasons",
  INIT_PRIORITY_BYPASS_REJECTED: "init_priority_bypass_rejected",
  CONTROL_DEGRADED_NO_REASONS: "control_degraded_no_reasons",
  CONTROL_DEGRADED_BLOCKING_REASONS: "control_degraded_blocking_reasons",
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
    typeof snapshot?.phase === TYPEOF.STRING
      ? snapshot.phase.trim().toUpperCase()
      : "";
  if (Object.values(LIFECYCLE_PHASE).includes(phase)) {
    return phase;
  }
  const legacyState =
    typeof snapshot?.state === TYPEOF.STRING
      ? snapshot.state.trim().toLowerCase()
      : "";
  switch (legacyState) {
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
  return (
    !priorityRecoveryHealth.details ||
    typeof priorityRecoveryHealth.details !== TYPEOF.OBJECT ||
    typeof priorityRecoveryHealth.details.failureReason !== TYPEOF.STRING ||
    priorityRecoveryHealth.details.failureReason.length === NUM.ZERO
  );
}
const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze({
  SERVICE_UNAVAILABLE: "control_plane_recovery_service_unavailable",
  DIAGNOSTICS_PROVIDER_UNAVAILABLE:
    "control_plane_recovery_diagnostics_provider_unavailable",
  DIAGNOSTICS_READ_FAILED: "control_plane_recovery_diagnostics_read_failed",
  DIAGNOSTICS_UNAVAILABLE: "control_plane_recovery_diagnostics_unavailable",
  DIAGNOSTICS_INCOMPLETE: "control_plane_recovery_diagnostics_incomplete",
});
const READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE =
  "READINESS_PROBE_ASYNC_TIMEOUT";
const READINESS_PROBE_ASYNC_TIMEOUT_MS = 250;
function buildBootstrapJoinProjectionResult(options = {}) {
  return {
    canProjectReady: options.canProjectReady === true,
    projectionRule: options.projectionRule || null,
    blockerReason: options.blockerReason || null,
    normalizedPhase: options.normalizedPhase || null,
    reasons: Array.isArray(options.reasons) ? options.reasons : [],
    blockingReasons: Array.isArray(options.blockingReasons)
      ? options.blockingReasons
      : [],
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
    projectionRule: canProjectFromControlPhase
      ? BOOTSTRAP_JOIN_PROJECTION_RULE.CONTROL_DEGRADED_NON_BLOCKING
      : null,
    blockerReason: canProjectFromControlPhase
      ? null
      : BOOTSTRAP_JOIN_PROJECTION_BLOCKER.CONTROL_DEGRADED_BLOCKING_REASONS,
  });
}
export { BootstrapReadinessOwner };
