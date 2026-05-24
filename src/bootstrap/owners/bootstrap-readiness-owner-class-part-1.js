import {HTTP_STATUS, NUM, TYPEOF} from '../../constants/index.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_LIVENESS,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_PROBE_SCOPE,
  BOOTSTRAP_API_RESPONSE_FIELD,
  BOOTSTRAP_API_ROUTE,
} from '../bootstrap-api-constants.js';
import {READINESS_DEPENDENCY} from '../bootstrap-readiness-state-constants.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_DEPENDENCY_DEMOTION_POLICY,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {
  isLocalQueryTransportReady,
} from '../shared/local-query-transport-readiness.js';
import {hasTransitionalStartupAuthorityEvidence} from '../../control-plane/startup-authority-snapshot-owner.js';
import {canBypassBootstrapInitPriorityReasons} from '../startup-recovery-coordinator.js';
import {
  applyBootstrapReadinessProbeDetailMethods,
} from './bootstrap-readiness-owner-probe-details.js';
const BOOTSTRAP_READINESS_OWNER_LITERAL = Object.freeze({
  STARTING: 'starting',
  BOOTSTRAPPING: 'bootstrapping',
  WARMING: 'warming',
  JOIN_READY: 'join_ready',
  DEGRADED: 'degraded',
  READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING:
    'Readiness probe async diagnostics timed out; using ',
  SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK:
    'synchronous readiness snapshot fallback',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
  NONE: 'none',
  PRESENT: 'present',
  OBSERVATION_UNAVAILABLE: 'observation_unavailable',
  DEGRADED_2: 'DEGRADED',
  MISSINGPARTITIONLEADERS: 'missingPartitionLeaders',
  MISSINGPARTITIONLEADERNODES: 'missingPartitionLeaderNodes',
  MISSINGPARTITIONLEADERADDRESSES: 'missingPartitionLeaderAddresses',
  MISSINGMESSAGEGROUPLEADERS: 'missingMessageGroupLeaders',
  MISSINGMESSAGEGROUPLEADERNODES: 'missingMessageGroupLeaderNodes',
  MISSINGMESSAGEGROUPLEADERADDRESSES: 'missingMessageGroupLeaderAddresses',
});
const BOOTSTRAP_READINESS_DEPENDENCY = Object.freeze({
  SQL_ENGINE_READY: 'sql_engine_ready',
  LEADER_METADATA_READY: 'leader_metadata_ready',
  RUNTIME_WIRING_READY: 'runtime_wiring_ready',
  LOCAL_QUERY_TRANSPORT_READY: 'local_query_transport_ready',
  CONTROL_PLANE_WRITE_HEALTH: 'control_plane_write_health',
  PRIORITY_CONTROL_PLANE_RECOVERY: 'priority_control_plane_recovery',
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
const READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE =
  'READINESS_PROBE_ASYNC_TIMEOUT';
const READINESS_PROBE_ASYNC_TIMEOUT_MS = 250;
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
function isStartupAuthoritySnapshot(value) {
  return Boolean(value && typeof value === TYPEOF.OBJECT);
}
function isUsableStartupAuthoritySnapshot(value) {
  return isStartupAuthoritySnapshot(value) && value.authorityAvailable === true;
}
function selectStartupAuthoritySnapshot(localStartupAuthority, seedContact) {
  if (isUsableStartupAuthoritySnapshot(localStartupAuthority)) {
    return localStartupAuthority;
  }
  if (isStartupAuthoritySnapshot(seedContact)) {
    return seedContact;
  }
  return isStartupAuthoritySnapshot(localStartupAuthority) ?
    localStartupAuthority :
    null;
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
  getSeedContactStartupAuthoritySnapshot() {
    const bootstrapService = this.getBootstrapService();
    const bootstrapResponse = bootstrapService?.bootstrapResponse || null;
    const startupAuthority =
      bootstrapResponse?.[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY] ||
      bootstrapService?.getSeedContactStartupAuthoritySnapshot?.() ||
      bootstrapService?.seedContactStartupAuthority ||
      null;
    return isStartupAuthoritySnapshot(startupAuthority) ?
      startupAuthority :
      null;
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
    const statusCode = started ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const reasons = this.getStartupProbeReasons(snapshot, started);
    const response = {
      started,
      phase:
        typeof snapshot.phase === TYPEOF.STRING ?
          snapshot.phase :
          LIFECYCLE_PHASE.INIT,
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
    const statusCode = snapshot.ready ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
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
    const statusCode = snapshot.ready ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
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
  }
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
  }
  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    return this.evaluateBootstrapJoinProjection(snapshot, {
      reasons,
      blockingReasons,
    }).canProjectReady;
  }
  resolveLocalStartupAuthoritySnapshot(service, observedAt) {
    if (typeof service.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION) {
      return service.getStartupAuthoritySnapshotSync(
        this.getSeedNodeId(),
        observedAt,
      );
    }
    if (typeof service.getStartupAuthoritySnapshot !== TYPEOF.FUNCTION) {
      return null;
    }
    const localStartupAuthority = service.getStartupAuthoritySnapshot(
      this.getSeedNodeId(),
      observedAt,
    );
    return localStartupAuthority &&
      typeof localStartupAuthority.then === TYPEOF.FUNCTION ?
      null :
      localStartupAuthority;
  }
  getStartupAuthoritySnapshot(observedAt = Date.now()) {
    const seedContactStartupAuthority =
      this.getSeedContactStartupAuthoritySnapshot();
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return seedContactStartupAuthority;
    }
    try {
      const localStartupAuthority = this.resolveLocalStartupAuthoritySnapshot(
        service,
        observedAt,
      );
      return selectStartupAuthoritySnapshot(
        localStartupAuthority,
        seedContactStartupAuthority,
      );
    } catch (_error) {
      return seedContactStartupAuthority;
    }
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
          'Readiness probe async diagnostics timed out after ' +
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
          LIFECYCLE_DEPENDENCY_CLASS.SOFT ?
            LIFECYCLE_DEPENDENCY_CLASS.SOFT :
            LIFECYCLE_DEPENDENCY_CLASS.HARD,
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
      BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT ?
        {
          startupAuthorityFailureReason: startupAuthority.failure.reason,
        } :
        {}),
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
        TYPEOF.STRING ?
        {
          bootstrapJoinAuthorityFailureReason:
              startupAuthority?.failure?.state ===
              BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT ?
                startupAuthority.failure.reason :
                priorityControlPlaneRecoveryHealth.details.failureReason,
        } :
        {}),
    };
  }
}
applyBootstrapReadinessProbeDetailMethods(BootstrapReadinessOwnerPart1);
export {BootstrapReadinessOwnerPart1};
