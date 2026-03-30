import {
  HTTP_STATUS,
  NUM,
  TYPEOF,
} from '../../constants/index.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_LIVENESS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_PROBE_SCOPE,
  BOOTSTRAP_API_ROUTE,
} from '../bootstrap-api-constants.js';
import {
  READINESS_DEPENDENCY,
} from '../bootstrap-readiness-state-constants.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_DEPENDENCY_DEMOTION_POLICY,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../control-plane/control-plane-publication-merge.js';
import {
  getLocalQueryTransportReadiness,
} from '../shared/local-query-transport-readiness.js';

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
]);

const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze({
  SERVICE_UNAVAILABLE: 'control_plane_recovery_service_unavailable',
  DIAGNOSTICS_PROVIDER_UNAVAILABLE:
    'control_plane_recovery_diagnostics_provider_unavailable',
  DIAGNOSTICS_READ_FAILED: 'control_plane_recovery_diagnostics_read_failed',
  DIAGNOSTICS_UNAVAILABLE: 'control_plane_recovery_diagnostics_unavailable',
  DIAGNOSTICS_INCOMPLETE: 'control_plane_recovery_diagnostics_incomplete',
});

class BootstrapReadinessOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.lastBootstrapJoinBlockedSignature = null;
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
    return this.delegates.getLeaderReadinessStatusForProbe?.() || {
      ready: false,
    };
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
      phase: typeof snapshot.phase === TYPEOF.STRING ?
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
    const snapshot = await this.evaluateReadinessSnapshotAsync();
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
      await this.evaluateReadinessSnapshotAsync(),
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
    if (scope !== BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN ||
        snapshot.ready === true) {
      return snapshot;
    }

    const reasons = Array.isArray(snapshot.reasons) ? snapshot.reasons : [];
    const blockingReasons = reasons.filter((reason) =>
      !BOOTSTRAP_JOIN_NON_BLOCKING_REASONS.includes(reason),
    );
    const canProjectReady = this.canProjectBootstrapJoinReadiness(
      snapshot,
      reasons,
      blockingReasons,
    );
    if (!canProjectReady) {
      return snapshot;
    }

    return {
      ...snapshot,
      ready: true,
      reasons: [],
      retryAfterMs: NUM.ZERO,
    };
  }

  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    if (snapshot.draining === true) {
      return false;
    }
    if (snapshot.phase === LIFECYCLE_PHASE.JOIN_READY) {
      return reasons.length === NUM.ONE &&
        reasons[NUM.ZERO] ===
          LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
    }

    if (snapshot.phase === LIFECYCLE_PHASE.CONTROL_READY ||
        snapshot.phase === LIFECYCLE_PHASE.DEGRADED) {
      if (reasons.length === NUM.ZERO) {
        return false;
      }
      return blockingReasons.length === NUM.ZERO;
    }

    return false;
  }

  buildReadinessProbeResponse(snapshot, options = {}) {
    const response = {
      ready: snapshot.ready === true,
      phase: typeof snapshot.phase === TYPEOF.STRING ?
        snapshot.phase :
        LIFECYCLE_PHASE.INIT,
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
    if (typeof options.scope === TYPEOF.STRING && options.scope.length > NUM.ZERO) {
      response.scope = options.scope;
    }
    return response;
  }

  appendReadinessProgressFields(response, snapshot) {
    if (!response || typeof response !== TYPEOF.OBJECT ||
        !snapshot || typeof snapshot !== TYPEOF.OBJECT) {
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
    if (!response || typeof response !== TYPEOF.OBJECT ||
        !snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return response;
    }
    const coordinator = this.getStartupRecoveryCoordinator();
    if (!coordinator || typeof coordinator.evaluate !== TYPEOF.FUNCTION) {
      return response;
    }
    const startupRecovery = coordinator.evaluate({snapshot});
    if (!startupRecovery || typeof startupRecovery !== TYPEOF.OBJECT) {
      return response;
    }
    if (typeof startupRecovery.recoveryStage === TYPEOF.STRING &&
        startupRecovery.recoveryStage.length > NUM.ZERO) {
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
    if (typeof membershipPublication.status === TYPEOF.STRING &&
        membershipPublication.status.length > NUM.ZERO) {
      response.publishedControlPlaneStatus = membershipPublication.status;
    }
    return response;
  }

  getMembershipPublicationDiagnostics(observedAt) {
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    try {
      if (typeof service.getMembershipPublicationDiagnosticsSync ===
          TYPEOF.FUNCTION) {
        return service.getMembershipPublicationDiagnosticsSync(
          this.getSeedNodeId(),
          observedAt,
        );
      }
      if (typeof service.getMembershipPublicationDiagnostics !== TYPEOF.FUNCTION) {
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

  logBootstrapJoinReadinessProjection(snapshot, response) {
    const logger = this.getLogger();
    if (!logger || typeof logger.info !== TYPEOF.FUNCTION) {
      return;
    }
    if (snapshot?.ready === true) {
      this.lastBootstrapJoinBlockedSignature = null;
      return;
    }

    const bootstrapService = this.getBootstrapService();
    const leaderStatus = this.getLeaderReadinessStatusForProbe();
    const localQueryTransportReadiness =
      this.getLocalQueryTransportReadiness();
    const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
    const membershipPublication = this.getMembershipPublicationDiagnostics(
      response?.timestamp,
    );
    const messageRouter = this.getMessageRouter() ||
      bootstrapService?.messageRouter ||
      null;
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
      publishedControlPlaneStatus:
        membershipPublication?.status ?? null,
    };
    const signature = JSON.stringify({
      phase: logPayload.phase,
      state: logPayload.state,
      reasons: logPayload.reasons,
      bootstrapServicePhase: logPayload.bootstrapServicePhase,
      hasSqlQueryEngine: logPayload.hasSqlQueryEngine,
      hasMessageRouter: logPayload.hasMessageRouter,
      leaderReady: leaderStatus?.ready === true,
      localQueryTransportReady:
        localQueryTransportReadiness?.ready !== false,
      controlPlaneWriteHealthy:
        controlPlaneWriteHealth?.healthy === true,
      publishedControlPlaneEpoch: logPayload.publishedControlPlaneEpoch,
      publishedControlPlaneStatus: logPayload.publishedControlPlaneStatus,
    });
    if (signature === this.lastBootstrapJoinBlockedSignature) {
      return;
    }
    this.lastBootstrapJoinBlockedSignature = signature;
    logger.info(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_JOIN_READINESS_BLOCKED,
      logPayload);
  }

  evaluateReadinessSnapshot() {
    const readinessState = this.getReadinessState();
    if (!readinessState ||
        typeof readinessState.setDependency !== TYPEOF.FUNCTION) {
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
    if (!readinessState ||
        typeof readinessState.setDependency !== TYPEOF.FUNCTION) {
      return this.evaluateReadinessSnapshot();
    }

    const priorityControlPlaneRecoveryHealth =
      await this.getPriorityControlPlaneRecoveryHealthAsync();
    return this.evaluateReadinessSnapshotWithPriorityRecoveryHealth(
      readinessState,
      priorityControlPlaneRecoveryHealth,
    );
  }

  evaluateReadinessSnapshotWithPriorityRecoveryHealth(
    readinessState,
    priorityControlPlaneRecoveryHealth,
  ) {
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

    const localQueryTransportReadiness =
      this.getLocalQueryTransportReadiness();
    readinessState.setDependency(
      BOOTSTRAP_READINESS_DEPENDENCY.LOCAL_QUERY_TRANSPORT_READY,
      localQueryTransportReadiness.ready !== false,
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
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
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

    return readinessState.evaluate();
  }

  getPriorityControlPlaneRecoveryHealth() {
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
      );
    }
    if (typeof service.getMembershipPublicationDiagnosticsSync !== TYPEOF.FUNCTION) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE
          .DIAGNOSTICS_PROVIDER_UNAVAILABLE,
      );
    }

    try {
      const membershipPublication = service.getMembershipPublicationDiagnosticsSync(
        this.getSeedNodeId(),
        Date.now(),
      );
      return this.buildPriorityControlPlaneRecoveryHealthFromDiagnostics(
        membershipPublication,
      );
    } catch (error) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED,
        error,
      );
    }
  }

  async getPriorityControlPlaneRecoveryHealthAsync() {
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
      );
    }
    const observedAt = Date.now();
    try {
      let membershipPublication = null;
      if (typeof service.getMembershipPublicationDiagnostics === TYPEOF.FUNCTION) {
        membershipPublication = await service.getMembershipPublicationDiagnostics(
          this.getSeedNodeId(),
          observedAt,
        );
      } else if (typeof service.getMembershipPublicationDiagnosticsSync ===
          TYPEOF.FUNCTION) {
        membershipPublication = service.getMembershipPublicationDiagnosticsSync(
          this.getSeedNodeId(),
          observedAt,
        );
      } else {
        return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
          PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE
            .DIAGNOSTICS_PROVIDER_UNAVAILABLE,
        );
      }
      return this.buildPriorityControlPlaneRecoveryHealthFromDiagnostics(
        membershipPublication,
      );
    } catch (error) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED,
        error,
      );
    }
  }

  buildPriorityControlPlaneRecoveryHealthFromDiagnostics(membershipPublication) {
    if (!membershipPublication ||
        typeof membershipPublication !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_UNAVAILABLE,
      );
    }
    const publicationStatus = membershipPublication?.status || null;
    if (typeof publicationStatus !== TYPEOF.STRING ||
        publicationStatus.length === NUM.ZERO) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_INCOMPLETE,
        null,
        {
          publicationEpoch: membershipPublication?.publicationEpoch ?? null,
          publicationStatus: publicationStatus || null,
        },
      );
    }
    const priorityPartitionSummary =
      membershipPublication?.priorityPartitionSummary &&
        typeof membershipPublication.priorityPartitionSummary === TYPEOF.OBJECT ?
        membershipPublication.priorityPartitionSummary :
        null;
    if (!priorityPartitionSummary ||
        typeof priorityPartitionSummary.satisfied !== TYPEOF.BOOLEAN) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_INCOMPLETE,
        null,
        {
          publicationEpoch: membershipPublication?.publicationEpoch ?? null,
          publicationStatus,
          priorityPartitionSummary,
        },
      );
    }

    const publicationPending = String(publicationStatus).toUpperCase() !==
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
    const localNodeId = String(this.getSeedNodeId() || '').trim();
    const publishedActiveNodeIds = Array.isArray(
      membershipPublication?.publishedActiveNodeIds,
    ) ?
      membershipPublication.publishedActiveNodeIds
        .map((nodeId) => String(nodeId || '').trim())
        .filter((nodeId) => nodeId.length > NUM.ZERO) :
      [];
    const publicationExcludesLocalNode = !publicationPending &&
      localNodeId.length > NUM.ZERO &&
      !publishedActiveNodeIds.includes(localNodeId);
    const reasonCodes = [];
    if (publicationPending || publicationExcludesLocalNode) {
      reasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      );
    }
    if (priorityPartitionSummary.satisfied === false) {
      reasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      );
    }

    return {
      healthy: reasonCodes.length === NUM.ZERO,
      reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      details: reasonCodes.length > NUM.ZERO ? {
        publicationEpoch: membershipPublication?.publicationEpoch ?? null,
        publicationStatus,
        priorityPartitionSummary,
        priorityRecoveryReasonCodes: Object.freeze([...reasonCodes]),
      } : null,
    };
  }

  buildPriorityControlPlaneRecoveryUnavailableHealth(
    failureReason,
    error = null,
    context = null,
  ) {
    const details = {
      failureReason,
    };
    if (context && typeof context === TYPEOF.OBJECT) {
      Object.assign(details, context);
    }
    if (error) {
      details.error = error?.message || String(error);
    }
    return {
      healthy: false,
      reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      details,
    };
  }

  getControlPlaneWriteHealth() {
    const provider = this.getControlPlaneWriteHealthProvider();
    if (typeof provider !== TYPEOF.FUNCTION) {
      return {
        healthy: true,
        reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        details: null,
      };
    }

    try {
      const health = provider() || {};
      const healthy = health.healthy !== false;
      return {
        healthy,
        reasonCode:
          typeof health.reasonCode === TYPEOF.STRING &&
            health.reasonCode.length > NUM.ZERO ?
            health.reasonCode :
            LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        details:
          health.details && typeof health.details === TYPEOF.OBJECT ?
            health.details :
            null,
      };
    } catch (error) {
      return {
        healthy: false,
        reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        details: {
          error: error?.message || String(error),
        },
      };
    }
  }

  getStartupProbeReasons(snapshot, started) {
    if (started) {
      return [];
    }

    const reasons = Array.isArray(snapshot?.reasons) ?
      [...snapshot.reasons] :
      [];
    if (!reasons.includes(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE)) {
      reasons.unshift(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE);
    }
    return reasons;
  }

  isStartupComplete() {
    const bootstrapService = this.getBootstrapService();
    if (!bootstrapService) {
      return true;
    }
    return bootstrapService.phase === BOOTSTRAP_PHASE.COMPLETE;
  }

  isRuntimeWiringReady() {
    const bootstrapService = this.getBootstrapService();
    if (!bootstrapService) {
      return true;
    }
    return Boolean(this.getMessageRouter() || bootstrapService?.messageRouter);
  }

  getLocalQueryTransportReadiness() {
    const bootstrapService = this.getBootstrapService();
    return getLocalQueryTransportReadiness(
      this.getMessageRouter() || bootstrapService?.messageRouter || null,
    );
  }

  isSqlEngineDependencyReady() {
    if (!this.getBootstrapService()) {
      return true;
    }
    return Boolean(this.getSqlQueryEngine());
  }

  recordReadinessProbeResult(endpoint, statusCode) {
    const readinessState = this.getReadinessState();
    if (typeof readinessState?.recordProbeResult !== TYPEOF.FUNCTION) {
      return;
    }
    readinessState.recordProbeResult(endpoint, statusCode);
  }

  markDraining(options = {}) {
    const readinessState = this.getReadinessState();
    if (typeof readinessState?.beginDrain === TYPEOF.FUNCTION) {
      return readinessState.beginDrain({
        drainDeadlineMs: options.drainDeadlineMs,
        reasonCode: options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING,
      });
    }

    if (typeof readinessState?.transitionTo === TYPEOF.FUNCTION) {
      return readinessState.transitionTo('DEGRADED', {
        ready: false,
        reasons: [options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING],
      });
    }

    return this.getReadinessSnapshotForDiagnostics();
  }

  buildBootstrapNotReadyResponse(options = {}) {
    const snapshot = this.getReadinessSnapshotForDiagnostics();
    const reasons = this.mergeReadinessReasons(
      snapshot.reasons,
      options.reasonCode,
    );
    const response = {
      success: false,
      error: options.error,
      code: options.code,
      reasons,
      retryAfterMs: Number.isFinite(options.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)) :
        (Number.isFinite(snapshot.retryAfterMs) ?
          snapshot.retryAfterMs :
          NUM.ZERO),
    };

    if (typeof options.phase === TYPEOF.STRING && options.phase.length > NUM.ZERO) {
      response.phase = options.phase;
    }

    if (typeof snapshot.state === TYPEOF.STRING && snapshot.state.length > NUM.ZERO) {
      response.state = snapshot.state;
    }

    if (options.leaderReadiness &&
        typeof options.leaderReadiness === TYPEOF.OBJECT) {
      response.leaderReadiness = {
        ...options.leaderReadiness,
      };
      for (const field of [
        'missingPartitionLeaders',
        'missingPartitionLeaderNodes',
        'missingPartitionLeaderAddresses',
        'missingMessageGroupLeaders',
        'missingMessageGroupLeaderNodes',
        'missingMessageGroupLeaderAddresses',
      ]) {
        if (!Array.isArray(options.leaderReadiness[field])) {
          continue;
        }
        response[field] = [...options.leaderReadiness[field]];
      }
    }

    return response;
  }

  getReadinessSnapshotForDiagnostics() {
    const readinessState = this.getReadinessState();
    try {
      return this.evaluateReadinessSnapshot();
    } catch (_error) {
      const fallbackSnapshot = typeof readinessState?.getSnapshot === TYPEOF.FUNCTION ?
        readinessState.getSnapshot() :
        null;
      if (fallbackSnapshot) {
        return fallbackSnapshot;
      }
      return {
        ready: false,
        phase: LIFECYCLE_PHASE.INIT,
        state: BOOTSTRAP_PHASE.NOT_STARTED,
        reasons: [],
        retryAfterMs: NUM.ZERO,
        timestamp: Date.now(),
      };
    }
  }

  mergeReadinessReasons(reasons, reasonCode) {
    const merged = Array.isArray(reasons) ?
      [...reasons] :
      [];
    if (typeof reasonCode !== TYPEOF.STRING || reasonCode.length === NUM.ZERO) {
      return merged;
    }
    if (!merged.includes(reasonCode)) {
      merged.push(reasonCode);
    }
    return merged;
  }
}

export {BootstrapReadinessOwner};
