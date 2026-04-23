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
import { hasTransitionalStartupAuthorityEvidence } from "../../control-plane/startup-authority-snapshot-owner.js";
import { CONTROL_PLANE_WRITE_HEALTH_STATE } from "../control-plane-write-health-owner.js";
import { canBypassBootstrapInitPriorityReasons } from "../startup-recovery-coordinator.js";
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
  const details =
    priorityRecoveryHealth.details &&
    typeof priorityRecoveryHealth.details === TYPEOF.OBJECT
      ? priorityRecoveryHealth.details
      : null;
  if (details && hasTransitionalStartupAuthorityEvidence(details)) {
    return true;
  }
  return (
    !details ||
    typeof details.failureReason !== TYPEOF.STRING ||
    details.failureReason.length === NUM.ZERO
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
class BootstrapReadinessOwnerPart1 {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.lastBootstrapJoinBlockedSignature = null;
    this.lastBootstrapJoinProjectionEvaluation = null;
  }
  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }
  getReadinessState() {
    return this.delegates.getReadinessState?.() || null;
  }
  getBootstrapService() {
    return this.delegates.getBootstrapService?.() || null;
  }
  getMessageRouter() {
    return this.delegates.getMessageRouter?.() || null;
  }
  getSqlQueryEngine() {
    return this.delegates.getSqlQueryEngine?.() || null;
  }
  getControlPlaneReadinessService() {
    return this.delegates.getControlPlaneReadinessService?.() || null;
  }
  getControlPlaneWriteHealthProvider() {
    return this.delegates.getControlPlaneWriteHealthProvider?.() || null;
  }
  getLeaderReadinessStatusForProbe() {
    return (
      this.delegates.getLeaderReadinessStatusForProbe?.() || {
        ready: false,
      }
    );
  }
  getStartupRecoveryCoordinator() {
    return this.delegates.getStartupRecoveryCoordinator?.() || null;
  }
  getLogger() {
    return this.delegates.getLogger?.() || null;
  }
  handleLivenessProbeRequest(reply) {
    const statusCode = HTTP_STATUS.OK;
    const response = {
      alive: BOOTSTRAP_API_LIVENESS.ALIVE,
      state: BOOTSTRAP_API_LIVENESS.STATE_RUNNING,
      nodeId: this.getSeedNodeId(),
      timestamp: Date.now(),
    };
    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.LIVEZ, statusCode);
    reply.code(statusCode);
    return response;
  }
  handleStartupProbeRequest(reply) {
    const snapshot = this.evaluateReadinessSnapshot();
    const started = this.isStartupComplete();
    const statusCode = started
      ? HTTP_STATUS.OK
      : HTTP_STATUS.SERVICE_UNAVAILABLE;
    const reasons = this.getStartupProbeReasons(snapshot, started);
    const response = {
      started,
      phase:
        typeof snapshot.phase === TYPEOF.STRING
          ? snapshot.phase
          : LIFECYCLE_PHASE.INIT,
      state: snapshot.state,
      reasons,
      timestamp: snapshot.timestamp,
    };
    if (!started) {
      response.retryAfterMs = snapshot.retryAfterMs;
    }
    this.appendReadinessProgressFields(response, snapshot);
    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.STARTUPZ, statusCode);
    reply.code(statusCode);
    return response;
  }
  async handleReadinessProbeRequest(reply) {
    const snapshot = await this.evaluateReadinessSnapshotForProbe();
    const statusCode = snapshot.ready
      ? HTTP_STATUS.OK
      : HTTP_STATUS.SERVICE_UNAVAILABLE;
    const response = this.buildReadinessProbeResponse(snapshot);
    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.READYZ, statusCode);
    reply.code(statusCode);
    return response;
  }
  async handleBootstrapReadinessProbeRequest(reply) {
    const snapshot = this.resolveReadinessSnapshotForScope(
      await this.evaluateReadinessSnapshotForProbe(),
      BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    );
    const statusCode = snapshot.ready
      ? HTTP_STATUS.OK
      : HTTP_STATUS.SERVICE_UNAVAILABLE;
    const response = this.buildReadinessProbeResponse(snapshot, {
      scope: BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    });
    this.logBootstrapJoinReadinessProjection(snapshot, response);
    this.recordReadinessProbeResult(
      BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY,
      statusCode,
    );
    reply.code(statusCode);
    return response;
  }
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
          snapshot.ready === true
            ? BOOTSTRAP_JOIN_PROJECTION_RULE.ALREADY_READY
            : BOOTSTRAP_JOIN_PROJECTION_BLOCKER.PHASE_NOT_ELIGIBLE,
        normalizedPhase: normalizeLifecyclePhaseFromSnapshot(snapshot),
        reasons: normalizeReasonCodeArray(snapshot?.reasons),
        blockingReasons: [],
      };
      return snapshot;
    }
    const projectionEvaluation = this.evaluateBootstrapJoinProjection(
      snapshot,
      {
        bootstrapJoinAuthorityAvailable:
          snapshot?.bootstrapJoinAuthorityAvailable === true ||
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
  }
  evaluateBootstrapJoinProjection(snapshot, options = {}) {
    const normalizedReasons = Array.isArray(options.reasons)
      ? normalizeReasonCodeArray(options.reasons)
      : normalizeReasonCodeArray(snapshot?.reasons);
    const blockingReasons = Array.isArray(options.blockingReasons)
      ? normalizeReasonCodeArray(options.blockingReasons)
      : normalizedReasons.filter(
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
      projectionRule = joinStableWindowOnly
        ? BOOTSTRAP_JOIN_PROJECTION_RULE.JOIN_STABLE_WINDOW
        : null;
      blockerReason = joinStableWindowOnly
        ? null
        : BOOTSTRAP_JOIN_PROJECTION_BLOCKER.JOIN_STABLE_WINDOW_REASONS;
    } else if (normalizedPhase === LIFECYCLE_PHASE.INIT) {
      const bootstrapInitPriorityBypass = canBypassBootstrapInitPriorityReasons(
        normalizedReasons,
        {
          ...snapshot,
          phase: normalizedPhase,
        },
      );
      canProjectReady = bootstrapInitPriorityBypass;
      projectionRule = bootstrapInitPriorityBypass
        ? BOOTSTRAP_JOIN_PROJECTION_RULE.INIT_PRIORITY_BYPASS
        : null;
      blockerReason = bootstrapInitPriorityBypass
        ? null
        : BOOTSTRAP_JOIN_PROJECTION_BLOCKER.INIT_PRIORITY_BYPASS_REJECTED;
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
  }
  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    return this.evaluateBootstrapJoinProjection(snapshot, {
      reasons,
      blockingReasons,
    }).canProjectReady;
  }
  buildReadinessProbeResponse(snapshot, options = {}) {
    const response = {
      ready: snapshot.ready === true,
      phase:
        typeof snapshot.phase === TYPEOF.STRING
          ? snapshot.phase
          : LIFECYCLE_PHASE.INIT,
      state: snapshot.state,
      reasons: Array.isArray(snapshot.reasons) ? snapshot.reasons : [],
      timestamp: snapshot.timestamp,
    };
    if (snapshot.draining === true) {
      response.draining = true;
    }
    if (Number.isFinite(snapshot.drainDeadlineMs)) {
      response.drainDeadlineMs = Math.floor(snapshot.drainDeadlineMs);
    }
    if (Number.isFinite(snapshot.retryAfterMs)) {
      response.retryAfterMs = snapshot.retryAfterMs;
    }
    this.appendReadinessProgressFields(response, snapshot);
    this.appendStartupRecoveryFields(response, snapshot);
    this.appendMembershipPublicationFields(response, snapshot);
    this.appendReadinessStageFields(response);
    if (
      typeof options.scope === TYPEOF.STRING &&
      options.scope.length > NUM.ZERO
    ) {
      response.scope = options.scope;
    }
    return response;
  }
  appendReadinessProgressFields(response, snapshot) {
    if (
      !response ||
      typeof response !== TYPEOF.OBJECT ||
      !snapshot ||
      typeof snapshot !== TYPEOF.OBJECT
    ) {
      return response;
    }
    if (Number.isFinite(snapshot.phaseRank)) {
      response.phaseRank = Math.max(NUM.ZERO, Math.floor(snapshot.phaseRank));
    }
    if (Number.isFinite(snapshot.transitionCount)) {
      response.readinessEpoch = Math.max(
        NUM.ZERO,
        Math.floor(snapshot.transitionCount),
      );
    }
    if (Number.isFinite(snapshot.stableWindowMs)) {
      response.stableWindowMs = Math.max(
        NUM.ZERO,
        Math.floor(snapshot.stableWindowMs),
      );
    }
    if (Number.isFinite(snapshot.stableElapsedMs)) {
      response.stableElapsedMs = Math.max(
        NUM.ZERO,
        Math.floor(snapshot.stableElapsedMs),
      );
    }
    if (Number.isFinite(snapshot.stableSinceMs)) {
      response.stableSinceMs = Math.floor(snapshot.stableSinceMs);
    }
    return response;
  }
  appendStartupRecoveryFields(response, snapshot) {
    if (
      !response ||
      typeof response !== TYPEOF.OBJECT ||
      !snapshot ||
      typeof snapshot !== TYPEOF.OBJECT
    ) {
      return response;
    }
    const startupAuthority = this.getStartupAuthoritySnapshot(
      response?.timestamp,
    );
    const priorityRecoveryHealth = this.getPriorityControlPlaneRecoveryHealth();
    const priorityRecoveryDetails =
      priorityRecoveryHealth?.details &&
      typeof priorityRecoveryHealth.details === TYPEOF.OBJECT
        ? priorityRecoveryHealth.details
        : null;
    const startupRecovery = this.evaluateStartupRecovery({
      snapshot,
      priorityRecoveryHealth,
      startupAuthority,
    });
    if (!startupRecovery) {
      this.appendPriorityRecoveryProtocolFields(
        response,
        priorityRecoveryDetails,
      );
      return response;
    }
    this.appendStartupRecoverySnapshotFields(response, startupRecovery);
    this.appendPriorityRecoveryProtocolFields(
      response,
      this.resolvePriorityRecoveryProtocolDetails(
        startupRecovery,
        priorityRecoveryDetails,
      ),
    );
    return response;
  }
  evaluateStartupRecovery(options) {
    const coordinator = this.getStartupRecoveryCoordinator();
    if (!coordinator || typeof coordinator.evaluate !== TYPEOF.FUNCTION) {
      return null;
    }
    const startupRecovery = coordinator.evaluate(options);
    return startupRecovery && typeof startupRecovery === TYPEOF.OBJECT ?
      startupRecovery :
      null;
  }
  appendStartupRecoverySnapshotFields(response, startupRecovery) {
    if (
      typeof startupRecovery.recoveryStage === TYPEOF.STRING &&
      startupRecovery.recoveryStage.length > NUM.ZERO
    ) {
      response.recoveryStage = startupRecovery.recoveryStage;
    }
    if (Number.isFinite(startupRecovery.recoveryStageRank)) {
      response.recoveryStageRank = Math.max(
        NUM.ZERO,
        Math.floor(startupRecovery.recoveryStageRank),
      );
    }
    if (typeof startupRecovery.controlPlaneRecoveryReady === TYPEOF.BOOLEAN) {
      response.controlPlaneRecoveryReady =
        startupRecovery.controlPlaneRecoveryReady;
    }
    if (typeof startupRecovery.metadataPublicationReady === TYPEOF.BOOLEAN) {
      response.metadataPublicationReady =
        startupRecovery.metadataPublicationReady;
    }
    if (typeof startupRecovery.backgroundWorkReady === TYPEOF.BOOLEAN) {
      response.backgroundWorkReady = startupRecovery.backgroundWorkReady;
    }
    if (typeof startupRecovery.recoveryBlocked === TYPEOF.BOOLEAN) {
      response.recoveryBlocked = startupRecovery.recoveryBlocked;
    }
    if (
      typeof startupRecovery.startupAuthorityState === TYPEOF.STRING &&
      startupRecovery.startupAuthorityState.length > NUM.ZERO
    ) {
      response.startupAuthorityState = startupRecovery.startupAuthorityState;
    }
    if (typeof startupRecovery.startupAuthorityAvailable === TYPEOF.BOOLEAN) {
      response.startupAuthorityAvailable =
        startupRecovery.startupAuthorityAvailable;
    }
    if (
      startupRecovery.startupAuthorityFailure &&
      typeof startupRecovery.startupAuthorityFailure === TYPEOF.OBJECT
    ) {
      response.startupAuthorityFailure =
        startupRecovery.startupAuthorityFailure;
    }
    if (
      typeof startupRecovery.startupAuthorityFailureReason === TYPEOF.STRING &&
      startupRecovery.startupAuthorityFailureReason.length > NUM.ZERO
    ) {
      response.startupAuthorityFailureReason =
        startupRecovery.startupAuthorityFailureReason;
    }
    if (
      startupRecovery.startupAuthorityPublication &&
      typeof startupRecovery.startupAuthorityPublication === TYPEOF.OBJECT
    ) {
      response.startupAuthorityPublication =
        startupRecovery.startupAuthorityPublication;
    }
    if (
      typeof startupRecovery.publicationObservationState === TYPEOF.STRING &&
      startupRecovery.publicationObservationState.length > NUM.ZERO
    ) {
      response.startupAuthorityPublicationObservationState =
        startupRecovery.publicationObservationState;
    }
  }
  resolvePriorityRecoveryProtocolDetails(
    startupRecovery,
    priorityRecoveryDetails,
  ) {
    const hasPriorityRecoveryProtocolDetails =
      startupRecovery.targetParticipation ||
      startupRecovery.recoveryProtocolState ||
      (Array.isArray(startupRecovery.priorityRecoveryReasonCodes) &&
        startupRecovery.priorityRecoveryReasonCodes.length > NUM.ZERO);
    if (!hasPriorityRecoveryProtocolDetails) {
      return priorityRecoveryDetails;
    }
    return {
      recoveryProtocolState: startupRecovery.recoveryProtocolState || null,
      priorityRecoveryReasonCodes:
        startupRecovery.priorityRecoveryReasonCodes || [],
      targetParticipation: startupRecovery.targetParticipation || null,
    };
  }
  getStartupAuthoritySnapshot(observedAt = Date.now()) {
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    try {
      if (typeof service.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION) {
        return service.getStartupAuthoritySnapshotSync(
          this.getSeedNodeId(),
          observedAt,
        );
      }
      if (typeof service.getStartupAuthoritySnapshot !== TYPEOF.FUNCTION) {
        return null;
      }
      const startupAuthority = service.getStartupAuthoritySnapshot(
        this.getSeedNodeId(),
        observedAt,
      );
      if (
        startupAuthority &&
        typeof startupAuthority.then === TYPEOF.FUNCTION
      ) {
        return null;
      }
      return startupAuthority;
    } catch (_error) {
      return null;
    }
  }
  appendPriorityRecoveryProtocolFields(response, details) {
    if (
      !response ||
      typeof response !== TYPEOF.OBJECT ||
      !details ||
      typeof details !== TYPEOF.OBJECT
    ) {
      return response;
    }
    if (
      typeof details.recoveryProtocolState === TYPEOF.STRING &&
      details.recoveryProtocolState.length > NUM.ZERO
    ) {
      response.recoveryProtocolState = details.recoveryProtocolState;
    }
    if (
      Array.isArray(details.priorityRecoveryReasonCodes) &&
      details.priorityRecoveryReasonCodes.length > NUM.ZERO
    ) {
      response.priorityRecoveryReasonCodes = Object.freeze([
        ...details.priorityRecoveryReasonCodes,
      ]);
    }
    if (
      details.targetParticipation &&
      typeof details.targetParticipation === TYPEOF.OBJECT
    ) {
      response.targetParticipation = details.targetParticipation;
    }
    return response;
  }
  appendMembershipPublicationFields(response, snapshot) {
    if (!response || typeof response !== TYPEOF.OBJECT) {
      return response;
    }
    const membershipPublication = this.getMembershipPublicationDiagnostics(
      snapshot?.timestamp,
    );
    if (!membershipPublication) {
      return response;
    }
    if (Number.isFinite(membershipPublication.publicationEpoch)) {
      response.publishedControlPlaneEpoch = Math.max(
        NUM.ZERO,
        Math.floor(membershipPublication.publicationEpoch),
      );
    }
    if (
      typeof membershipPublication.status === TYPEOF.STRING &&
      membershipPublication.status.length > NUM.ZERO
    ) {
      response.publishedControlPlaneStatus = membershipPublication.status;
    }
    if (
      typeof membershipPublication.publicationObservationState ===
        TYPEOF.STRING &&
      membershipPublication.publicationObservationState.length > NUM.ZERO
    ) {
      response.publishedControlPlaneObservationState =
        membershipPublication.publicationObservationState;
    }
    const publicationRecoveryGate =
      membershipPublication.publicationRecoveryGate &&
      typeof membershipPublication.publicationRecoveryGate === TYPEOF.OBJECT
        ? membershipPublication.publicationRecoveryGate
        : null;
    if (publicationRecoveryGate) {
      this.appendPublicationRecoveryGateFields(
        response,
        publicationRecoveryGate,
      );
      return response;
    }
    this.appendPublicationAckFields(response, membershipPublication);
    return response;
  }
  appendPublicationRecoveryGateFields(response, publicationRecoveryGate) {
    if (
      typeof publicationRecoveryGate.state === TYPEOF.STRING &&
      publicationRecoveryGate.state.length > NUM.ZERO
    ) {
      response.publishedControlPlaneGateState = publicationRecoveryGate.state;
    }
    if (typeof publicationRecoveryGate.ready === TYPEOF.BOOLEAN) {
      response.publishedControlPlaneGateReady = publicationRecoveryGate.ready;
    }
    if (Number.isFinite(publicationRecoveryGate.pendingAckCount)) {
      response.publishedControlPlanePendingAckCount = Math.max(
        NUM.ZERO,
        Math.floor(publicationRecoveryGate.pendingAckCount),
      );
    }
  }
  appendPublicationAckFields(response, membershipPublication) {
    if (Array.isArray(membershipPublication.requiredAckNodeIds)) {
      response.publishedControlPlaneRequiredAckCount = Math.max(
        NUM.ZERO,
        membershipPublication.requiredAckNodeIds.length,
      );
    }
    if (Array.isArray(membershipPublication.acknowledgedNodeIds)) {
      response.publishedControlPlaneAcknowledgedCount = Math.max(
        NUM.ZERO,
        membershipPublication.acknowledgedNodeIds.length,
      );
    }
    if (
      Number.isFinite(response.publishedControlPlaneRequiredAckCount) &&
      Number.isFinite(response.publishedControlPlaneAcknowledgedCount)
    ) {
      response.publishedControlPlanePendingAckCount = Math.max(
        NUM.ZERO,
        response.publishedControlPlaneRequiredAckCount -
          response.publishedControlPlaneAcknowledgedCount,
      );
    }
  }
  appendReadinessStageFields(response) {
    if (!response || typeof response !== TYPEOF.OBJECT) {
      return response;
    }
    const readinessStage = buildBootstrapReadinessStage({
      ready: response.ready === true,
      controlPlaneRecoveryReady: response.controlPlaneRecoveryReady === true,
      backgroundWorkReady: response.backgroundWorkReady === true,
      publishedControlPlaneEpoch: response.publishedControlPlaneEpoch,
      publishedControlPlaneStatus: response.publishedControlPlaneStatus,
      publishedControlPlaneObservationState:
        response.publishedControlPlaneObservationState,
      publishedControlPlanePendingAckCount:
        response.publishedControlPlanePendingAckCount,
    });
    response.readinessStage = readinessStage.stage;
    response.readinessStageRank = readinessStage.stageRank;
    return response;
  }
  getControlPlanePublicationStory(observedAt) {
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    try {
      if (
        typeof service.getControlPlanePublicationStorySync === TYPEOF.FUNCTION
      ) {
        return service.getControlPlanePublicationStorySync(
          this.getSeedNodeId(),
          observedAt,
        );
      }
      if (typeof service.getControlPlanePublicationStory !== TYPEOF.FUNCTION) {
        return null;
      }
      const story = service.getControlPlanePublicationStory(
        this.getSeedNodeId(),
        observedAt,
      );
      if (story && typeof story.then === TYPEOF.FUNCTION) {
        return null;
      }
      return story;
    } catch (_error) {
      return null;
    }
  }
  getMembershipPublicationDiagnostics(observedAt) {
    const publicationStory = this.getControlPlanePublicationStory(observedAt);
    if (
      publicationStory?.membershipPublication &&
      typeof publicationStory.membershipPublication === TYPEOF.OBJECT
    ) {
      return publicationStory.membershipPublication;
    }
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    try {
      if (
        typeof service.getMembershipPublicationDiagnosticsSync ===
        TYPEOF.FUNCTION
      ) {
        return service.getMembershipPublicationDiagnosticsSync(
          this.getSeedNodeId(),
          observedAt,
        );
      }
      if (
        typeof service.getMembershipPublicationDiagnostics !== TYPEOF.FUNCTION
      ) {
        return null;
      }
      const diagnostics = service.getMembershipPublicationDiagnostics(
        this.getSeedNodeId(),
        observedAt,
      );
      if (diagnostics && typeof diagnostics.then === TYPEOF.FUNCTION) {
        return null;
      }
      return diagnostics;
    } catch (_error) {
      return null;
    }
  }
  buildMembershipPublicationPlanningSnapshot(
    membershipPublication,
    observedAt = Date.now(),
  ) {
    const service = this.getControlPlaneReadinessService();
    if (
      service &&
      typeof service.buildMembershipPublicationPlanningSnapshot ===
        TYPEOF.FUNCTION
    ) {
      try {
        return service.buildMembershipPublicationPlanningSnapshot({
          nodeId: this.getSeedNodeId(),
          observedAt,
          membershipPublication,
        });
      } catch (_error) {
        // Fall back to local normalization when the readiness service does not
        // expose the shared helper contract cleanly.
      }
    }
    return buildPublicationRecoveryProtocolSnapshot(membershipPublication, {
      targetNodeId: this.getSeedNodeId(),
    });
  }
  logBootstrapJoinReadinessProjection(snapshot, response) {
    const logger = this.getLogger();
    if (!logger || typeof logger.info !== TYPEOF.FUNCTION) {
      return;
    }
    if (snapshot?.ready === true) {
      this.lastBootstrapJoinBlockedSignature = null;
      this.lastBootstrapJoinProjectionEvaluation = null;
      return;
    }
    const bootstrapService = this.getBootstrapService();
    const leaderStatus = this.getLeaderReadinessStatusForProbe();
    const localQueryTransportReadiness = this.getLocalQueryTransportReadiness();
    const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
    const membershipPublication = this.getMembershipPublicationDiagnostics(
      response?.timestamp,
    );
    const projectionEvaluation =
      this.lastBootstrapJoinProjectionEvaluation &&
      typeof this.lastBootstrapJoinProjectionEvaluation === TYPEOF.OBJECT
        ? {
            canProjectReady:
              this.lastBootstrapJoinProjectionEvaluation.canProjectReady ===
              true,
            projectionRule:
              this.lastBootstrapJoinProjectionEvaluation.projectionRule || null,
            blockerReason:
              this.lastBootstrapJoinProjectionEvaluation.blockerReason || null,
            normalizedPhase:
              this.lastBootstrapJoinProjectionEvaluation.normalizedPhase ||
              null,
            reasons: Array.isArray(
              this.lastBootstrapJoinProjectionEvaluation.reasons,
            )
              ? this.lastBootstrapJoinProjectionEvaluation.reasons
              : [],
            blockingReasons: Array.isArray(
              this.lastBootstrapJoinProjectionEvaluation.blockingReasons,
            )
              ? this.lastBootstrapJoinProjectionEvaluation.blockingReasons
              : [],
          }
        : null;
    const messageRouter =
      this.getMessageRouter() || bootstrapService?.messageRouter || null;
    const logPayload = {
      nodeId: this.getSeedNodeId(),
      phase: response?.phase || null,
      state: response?.state || null,
      reasons: Array.isArray(response?.reasons) ? response.reasons : [],
      bootstrapServicePhase: bootstrapService?.phase || null,
      hasSqlQueryEngine: Boolean(this.getSqlQueryEngine()),
      hasMessageRouter: Boolean(messageRouter),
      leaderStatus,
      localQueryTransportReadiness,
      controlPlaneWriteHealth,
      publishedControlPlaneEpoch:
        membershipPublication?.publicationEpoch ?? null,
      publishedControlPlaneStatus: membershipPublication?.status ?? null,
      projectionEvaluation,
    };
    const signature = JSON.stringify({
      phase: logPayload.phase,
      state: logPayload.state,
      reasons: logPayload.reasons,
      bootstrapServicePhase: logPayload.bootstrapServicePhase,
      hasSqlQueryEngine: logPayload.hasSqlQueryEngine,
      hasMessageRouter: logPayload.hasMessageRouter,
      leaderReady: leaderStatus?.ready === true,
      localQueryTransportReady: isLocalQueryTransportReady(
        localQueryTransportReadiness,
      ),
      controlPlaneWriteHealthy: controlPlaneWriteHealth?.healthy === true,
      publishedControlPlaneEpoch: logPayload.publishedControlPlaneEpoch,
      publishedControlPlaneStatus: logPayload.publishedControlPlaneStatus,
      projectionEvaluation,
    });
    if (signature === this.lastBootstrapJoinBlockedSignature) {
      return;
    }
    this.lastBootstrapJoinBlockedSignature = signature;
    logger.info(
      BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_JOIN_READINESS_BLOCKED,
      logPayload,
    );
  }
  evaluateReadinessSnapshot() {
    const readinessState = this.getReadinessState();
    if (
      !readinessState ||
      typeof readinessState.setDependency !== TYPEOF.FUNCTION
    ) {
      if (typeof readinessState?.evaluate === TYPEOF.FUNCTION) {
        return readinessState.evaluate();
      }
      if (typeof readinessState?.getSnapshot === TYPEOF.FUNCTION) {
        return readinessState.getSnapshot();
      }
      return {
        ready: false,
        phase: LIFECYCLE_PHASE.INIT,
        state: BOOTSTRAP_PHASE.NOT_STARTED,
        reasons: [BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE],
        retryAfterMs: NUM.ZERO,
        timestamp: Date.now(),
      };
    }
    const priorityControlPlaneRecoveryHealth =
      this.getPriorityControlPlaneRecoveryHealth();
    return this.evaluateReadinessSnapshotWithPriorityRecoveryHealth(
      readinessState,
      priorityControlPlaneRecoveryHealth,
    );
  }
  async evaluateReadinessSnapshotAsync() {
    const readinessState = this.getReadinessState();
    if (
      !readinessState ||
      typeof readinessState.setDependency !== TYPEOF.FUNCTION
    ) {
      return this.evaluateReadinessSnapshot();
    }
    const priorityControlPlaneRecoveryHealth =
      await this.getPriorityControlPlaneRecoveryHealthAsync();
    return this.evaluateReadinessSnapshotWithPriorityRecoveryHealth(
      readinessState,
      priorityControlPlaneRecoveryHealth,
    );
  }

  /**
   * Evaluate readiness for HTTP probe handlers with a bounded async window.
   * Under sustained control-plane pressure, async diagnostics can stall long
   * enough to make probes time out; in that case probes should degrade to the
   * latest synchronous owner snapshot instead of hanging the endpoint.
   *
   * Non-timeout async failures remain fail-closed through the async owner path.
   *
   * @return {Promise<Object>}
   */
  async evaluateReadinessSnapshotForProbe() {
    try {
      return await this.evaluateReadinessSnapshotAsyncWithTimeout(
        READINESS_PROBE_ASYNC_TIMEOUT_MS,
      );
    } catch (error) {
      if (!this.isReadinessProbeAsyncTimeout(error)) {
        throw error;
      }
      this.getLogger()?.debug?.(
        BOOTSTRAP_READINESS_OWNER_LITERAL.READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING +
          BOOTSTRAP_READINESS_OWNER_LITERAL.SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK,
        {
          seedNodeId: this.getSeedNodeId(),
          timeoutMs: READINESS_PROBE_ASYNC_TIMEOUT_MS,
        },
      );
      return this.evaluateReadinessSnapshot();
    }
  }

  /**
   * @param {number} timeoutMs
   * @return {Promise<Object>}
   */
  async evaluateReadinessSnapshotAsyncWithTimeout(timeoutMs) {
    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const timeoutError = new Error(
          "Readiness probe async diagnostics timed out after " +
            `${timeoutMs}ms`,
        );
        timeoutError.code = READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE;
        reject(timeoutError);
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        this.evaluateReadinessSnapshotAsync(),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * @param {Error|Object|null} error
   * @return {boolean}
   */
  isReadinessProbeAsyncTimeout(error) {
    return error?.code === READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE;
  }
  evaluateReadinessSnapshotWithPriorityRecoveryHealth(
    readinessState,
    priorityControlPlaneRecoveryHealth,
  ) {
    const startupAuthority = this.getStartupAuthoritySnapshot(Date.now());
    const startupComplete = this.isStartupComplete();
    readinessState.setDependency(
      READINESS_DEPENDENCY.STARTUP_COMPLETE,
      startupComplete,
      {
        reasonCode: BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
        details: {
          phase: this.getBootstrapService()?.phase || null,
        },
      },
    );
    readinessState.setDependency(
      BOOTSTRAP_READINESS_DEPENDENCY.SQL_ENGINE_READY,
      this.isSqlEngineDependencyReady(),
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
      },
    );
    const leaderStatus = this.getLeaderReadinessStatusForProbe();
    readinessState.setDependency(
      BOOTSTRAP_READINESS_DEPENDENCY.LEADER_METADATA_READY,
      leaderStatus.ready === true,
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
        details: leaderStatus,
      },
    );
    readinessState.setDependency(
      BOOTSTRAP_READINESS_DEPENDENCY.RUNTIME_WIRING_READY,
      this.isRuntimeWiringReady(),
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      },
    );
    const localQueryTransportReadiness = this.getLocalQueryTransportReadiness();
    const requiresLocalQueryTransport =
      this.shouldRequireLocalQueryTransportReadiness();
    readinessState.setDependency(
      BOOTSTRAP_READINESS_DEPENDENCY.LOCAL_QUERY_TRANSPORT_READY,
      !requiresLocalQueryTransport ||
        isLocalQueryTransportReady(localQueryTransportReadiness),
      {
        reasonCode: LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
        details: localQueryTransportReadiness,
      },
    );
    const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
    readinessState.setDependency(
      BOOTSTRAP_READINESS_DEPENDENCY.CONTROL_PLANE_WRITE_HEALTH,
      controlPlaneWriteHealth.healthy === true,
      {
        reasonCode: controlPlaneWriteHealth.reasonCode,
        details: controlPlaneWriteHealth.details,
        classification:
          controlPlaneWriteHealth.classification ===
          LIFECYCLE_DEPENDENCY_CLASS.SOFT
            ? LIFECYCLE_DEPENDENCY_CLASS.SOFT
            : LIFECYCLE_DEPENDENCY_CLASS.HARD,
      },
    );
    readinessState.setDependency(
      BOOTSTRAP_READINESS_DEPENDENCY.PRIORITY_CONTROL_PLANE_RECOVERY,
      priorityControlPlaneRecoveryHealth.healthy === true,
      {
        reasonCode: priorityControlPlaneRecoveryHealth.reasonCode,
        details: priorityControlPlaneRecoveryHealth.details,
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
        demotionPolicy: LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.IMMEDIATE,
      },
    );
    const snapshot = readinessState.evaluate();
    return {
      ...snapshot,
      startupAuthorityState:
        startupAuthority?.state ||
        BOOTSTRAP_READINESS_OWNER_LITERAL.AUTHORITY_UNAVAILABLE,
      startupAuthorityAvailable: startupAuthority?.authorityAvailable === true,
      startupAuthorityFailure:
        startupAuthority?.failure ||
        Object.freeze({
          state: BOOTSTRAP_READINESS_OWNER_LITERAL.NONE,
        }),
      ...(startupAuthority?.failure?.state ===
      BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT
        ? {
            startupAuthorityFailureReason: startupAuthority.failure.reason,
          }
        : {}),
      startupAuthorityPublication:
        startupAuthority?.publication ||
        Object.freeze({
          observationState:
            BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE,
        }),
      startupAuthorityPublicationObservationState:
        startupAuthority?.publication?.observationState ||
        BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE,
      bootstrapJoinAuthorityAvailable:
        hasBootstrapJoinAuthority(priorityControlPlaneRecoveryHealth) ||
        startupAuthority?.authorityAvailable === true,
      ...(startupAuthority?.failure?.state ===
        BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT ||
      typeof priorityControlPlaneRecoveryHealth?.details?.failureReason ===
        TYPEOF.STRING
        ? {
            bootstrapJoinAuthorityFailureReason:
              startupAuthority?.failure?.state ===
              BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT
                ? startupAuthority.failure.reason
                : priorityControlPlaneRecoveryHealth.details.failureReason,
          }
        : {}),
    };
  }
}
export { BootstrapReadinessOwnerPart1 };
