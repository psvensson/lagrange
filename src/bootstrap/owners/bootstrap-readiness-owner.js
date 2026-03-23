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
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LIVENESS,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_PROBE_SCOPE,
  BOOTSTRAP_API_ROUTE,
} from '../bootstrap-api-constants.js';
import {
  READINESS_DEPENDENCY,
} from '../bootstrap-readiness-state-constants.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {
  getLocalQueryTransportReadiness,
} from '../shared/local-query-transport-readiness.js';

const BOOTSTRAP_JOIN_NON_BLOCKING_REASONS = Object.freeze([
  BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
]);

class BootstrapReadinessOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
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

  getControlPlaneWriteHealthProvider() {
    return this.delegates.getControlPlaneWriteHealthProvider?.() || null;
  }

  getLeaderReadinessStatusForProbe() {
    return this.delegates.getLeaderReadinessStatusForProbe?.() || {
      ready: false,
    };
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

  handleReadinessProbeRequest(reply) {
    const snapshot = this.evaluateReadinessSnapshot();
    const statusCode = snapshot.ready ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const response = this.buildReadinessProbeResponse(snapshot);

    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.READYZ, statusCode);
    reply.code(statusCode);
    return response;
  }

  handleBootstrapReadinessProbeRequest(reply) {
    const snapshot = this.resolveReadinessSnapshotForScope(
      this.evaluateReadinessSnapshot(),
      BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    );
    const statusCode = snapshot.ready ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const response = this.buildReadinessProbeResponse(snapshot, {
      scope: BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    });

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
    if (snapshot.phase === LIFECYCLE_PHASE.CONTROL_READY) {
      if (reasons.length === NUM.ZERO) {
        return false;
      }
      return blockingReasons.length === NUM.ZERO;
    }

    if (snapshot.phase === LIFECYCLE_PHASE.JOIN_READY) {
      return reasons.length === NUM.ONE &&
        reasons[NUM.ZERO] ===
          LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
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
      'sql_engine_ready',
      this.isSqlEngineDependencyReady(),
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
      },
    );

    const leaderStatus = this.getLeaderReadinessStatusForProbe();
    readinessState.setDependency(
      'leader_metadata_ready',
      leaderStatus.ready === true,
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
        details: leaderStatus,
      },
    );

    readinessState.setDependency(
      'runtime_wiring_ready',
      this.isRuntimeWiringReady(),
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      },
    );

    const localQueryTransportReadiness =
      this.getLocalQueryTransportReadiness();
    readinessState.setDependency(
      'local_query_transport_ready',
      localQueryTransportReadiness.ready !== false,
      {
        reasonCode: LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
        details: localQueryTransportReadiness,
      },
    );

    const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
    readinessState.setDependency(
      'control_plane_write_health',
      controlPlaneWriteHealth.healthy === true,
      {
        reasonCode: controlPlaneWriteHealth.reasonCode,
        details: controlPlaneWriteHealth.details,
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
      },
    );

    return readinessState.evaluate();
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
