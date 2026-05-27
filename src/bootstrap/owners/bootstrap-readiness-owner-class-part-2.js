import {NUM, TYPEOF} from '../../constants/index.js';
import {
  BOOTSTRAP_PHASE,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_RESPONSE_FIELD,
} from '../bootstrap-api-constants.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {
  getLocalQueryTransportReadiness,
} from '../shared/local-query-transport-readiness.js';
import {CONTROL_PLANE_WRITE_HEALTH_STATE} from '../control-plane-write-health-owner.js';
import {BootstrapReadinessOwnerPart1} from './bootstrap-readiness-owner-class-part-1.js';
const PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE =
  'priority_control_plane_recovery_diagnostics_unavailable';

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
const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze({
  SERVICE_UNAVAILABLE: 'control_plane_recovery_service_unavailable',
  DIAGNOSTICS_PROVIDER_UNAVAILABLE:
    'control_plane_recovery_diagnostics_provider_unavailable',
  DIAGNOSTICS_READ_FAILED: 'control_plane_recovery_diagnostics_read_failed',
  DIAGNOSTICS_UNAVAILABLE: 'control_plane_recovery_diagnostics_unavailable',
  DIAGNOSTICS_INCOMPLETE: 'control_plane_recovery_diagnostics_incomplete',
});
class BootstrapReadinessOwner extends BootstrapReadinessOwnerPart1 {
  getPriorityControlPlaneRecoveryHealth() {
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
      );
    }
    if (
      typeof service.getPriorityControlPlaneRecoveryHealthSync ===
      TYPEOF.FUNCTION
    ) {
      try {
        return service.getPriorityControlPlaneRecoveryHealthSync(
          this.getSeedNodeId(),
          Date.now(),
        );
      } catch (error) {
        return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
          PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED,
          error,
        );
      }
    }
    const publicationStory = this.getControlPlanePublicationStory(Date.now());
    if (
      publicationStory?.membershipPublication &&
      typeof publicationStory.membershipPublication === TYPEOF.OBJECT
    ) {
      return this.buildPriorityControlPlaneRecoveryHealthFromDiagnostics(
        publicationStory.membershipPublication,
      );
    }
    if (
      typeof service.getMembershipPublicationDiagnosticsSync !== TYPEOF.FUNCTION
    ) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_PROVIDER_UNAVAILABLE,
      );
    }
    try {
      const membershipPublication =
        service.getMembershipPublicationDiagnosticsSync(
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
    const observedAt = Date.now();
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
      );
    }
    if (
      typeof service.getPriorityControlPlaneRecoveryHealth === TYPEOF.FUNCTION
    ) {
      try {
        return await service.getPriorityControlPlaneRecoveryHealth(
          this.getSeedNodeId(),
          observedAt,
        );
      } catch (error) {
        return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
          PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED,
          error,
        );
      }
    }
    if (typeof service.getControlPlanePublicationStory === TYPEOF.FUNCTION) {
      try {
        const publicationStory = await service.getControlPlanePublicationStory(
          this.getSeedNodeId(),
          observedAt,
        );
        if (
          publicationStory?.membershipPublication &&
          typeof publicationStory.membershipPublication === TYPEOF.OBJECT
        ) {
          return this.buildPriorityControlPlaneRecoveryHealthFromDiagnostics(
            publicationStory.membershipPublication,
          );
        }
      } catch (error) {
        return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
          PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_READ_FAILED,
          error,
        );
      }
    }
    const membershipPublicationReader =
      typeof service.getMembershipPublicationDiagnostics === TYPEOF.FUNCTION ?
        () =>
          service.getMembershipPublicationDiagnostics(
            this.getSeedNodeId(),
            observedAt,
          ) :
        typeof service.getMembershipPublicationDiagnosticsSync ===
            TYPEOF.FUNCTION ?
          () =>
            Promise.resolve(
              service.getMembershipPublicationDiagnosticsSync(
                this.getSeedNodeId(),
                observedAt,
              ),
            ) :
          null;
    if (!membershipPublicationReader) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_PROVIDER_UNAVAILABLE,
      );
    }
    try {
      const membershipPublication = await membershipPublicationReader();
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
  buildPriorityControlPlaneRecoveryHealthFromDiagnostics(
    membershipPublication,
  ) {
    if (
      !membershipPublication ||
      typeof membershipPublication !== TYPEOF.OBJECT
    ) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.DIAGNOSTICS_UNAVAILABLE,
      );
    }
    const planningSnapshot = this.buildMembershipPublicationPlanningSnapshot(
      membershipPublication,
    );
    const publicationStatus =
      planningSnapshot?.publicationStatus ??
      membershipPublication?.status ??
      null;
    if (
      typeof publicationStatus !== TYPEOF.STRING ||
      publicationStatus.length === NUM.ZERO
    ) {
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
      planningSnapshot?.priorityPartitionSummary ??
      (membershipPublication?.priorityPartitionSummary &&
      typeof membershipPublication.priorityPartitionSummary === TYPEOF.OBJECT ?
        membershipPublication.priorityPartitionSummary :
        null);
    if (
      !priorityPartitionSummary ||
      typeof priorityPartitionSummary.satisfied !== TYPEOF.BOOLEAN
    ) {
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
    const reasonCodes = Array.isArray(
      planningSnapshot?.priorityRecoveryReasonCodes,
    ) ?
      [...planningSnapshot.priorityRecoveryReasonCodes] :
      [];
    return {
      healthy: reasonCodes.length === NUM.ZERO,
      reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      details:
        reasonCodes.length > NUM.ZERO ?
          {
            publicationEpoch:
                planningSnapshot?.publicationEpoch ??
                membershipPublication?.publicationEpoch ??
                null,
            publicationStatus,
            priorityPartitionSummary,
            recoveryProtocolState:
                planningSnapshot?.recoveryProtocolState ?? null,
            targetParticipation:
                planningSnapshot?.targetParticipation ?? null,
            priorityRecoveryReasonCodes: Object.freeze([...reasonCodes]),
          } :
          null,
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
    const isWebSocketClosed = error && (
      String(error).includes('WebSocket') ||
      String(error).includes('closed') ||
      String(error).includes('transport')
    );
    if (isWebSocketClosed) {
      details.retryAfterMs = 15000;
    }
    const health = {
      healthy: false,
      reasonCode: PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
      details,
    };
    if (isWebSocketClosed) {
      health.retryAfterMs = 15000;
    }
    return health;
  }
  getControlPlaneWriteHealth() {
    const provider = this.getControlPlaneWriteHealthProvider();
    if (typeof provider !== TYPEOF.FUNCTION) {
      return {
        healthy: true,
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
        reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        state: CONTROL_PLANE_WRITE_HEALTH_STATE.HEALTHY,
        details: {
          state: CONTROL_PLANE_WRITE_HEALTH_STATE.HEALTHY,
        },
      };
    }
    try {
      const health = provider() || {};
      const healthy = health.healthy !== false;
      const state =
        typeof health.state === TYPEOF.STRING && health.state.length > NUM.ZERO ?
          health.state :
          healthy ?
            CONTROL_PLANE_WRITE_HEALTH_STATE.HEALTHY :
            CONTROL_PLANE_WRITE_HEALTH_STATE.CRITICAL_WRITE_UNHEALTHY;
      return {
        healthy,
        classification:
          health.classification === LIFECYCLE_DEPENDENCY_CLASS.SOFT ?
            LIFECYCLE_DEPENDENCY_CLASS.SOFT :
            LIFECYCLE_DEPENDENCY_CLASS.HARD,
        reasonCode:
          typeof health.reasonCode === TYPEOF.STRING &&
          health.reasonCode.length > NUM.ZERO ?
            health.reasonCode :
            LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        state,
        details:
          health.details && typeof health.details === TYPEOF.OBJECT ?
            health.details :
            {
              state,
            },
      };
    } catch (error) {
      return {
        healthy: false,
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
        reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        state: CONTROL_PLANE_WRITE_HEALTH_STATE.CRITICAL_WRITE_UNHEALTHY,
        details: {
          state: CONTROL_PLANE_WRITE_HEALTH_STATE.CRITICAL_WRITE_UNHEALTHY,
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
    if (
      !reasons.includes(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE)
    ) {
      reasons.unshift(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE);
    }
    return reasons;
  }
  isStartupComplete() {
    const bootstrapService = this.getBootstrapService();
    if (!bootstrapService) {
      return true;
    }
    if (
      typeof bootstrapService.isBootstrapStartupComplete === TYPEOF.FUNCTION
    ) {
      return bootstrapService.isBootstrapStartupComplete();
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
  shouldRequireLocalQueryTransportReadiness() {
    const bootstrapService = this.getBootstrapService();
    const messageRouter =
      this.getMessageRouter() || bootstrapService?.messageRouter || null;
    return (
      typeof messageRouter?.getQueryDataPlaneTransportReadiness ===
      TYPEOF.FUNCTION
    );
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
      return readinessState.transitionTo(
        BOOTSTRAP_READINESS_OWNER_LITERAL.DEGRADED_2,
        {
          ready: false,
          reasons: [options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING],
        },
      );
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
        Number.isFinite(snapshot.retryAfterMs) ?
          snapshot.retryAfterMs :
          NUM.ZERO,
    };
    if (
      typeof options.phase === TYPEOF.STRING &&
      options.phase.length > NUM.ZERO
    ) {
      response.phase = options.phase;
    }
    if (
      options.startupAuthority &&
      typeof options.startupAuthority === TYPEOF.OBJECT
    ) {
      response[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY] =
        options.startupAuthority;
    }
    if (
      typeof snapshot.state === TYPEOF.STRING &&
      snapshot.state.length > NUM.ZERO
    ) {
      response.state = snapshot.state;
    }
    if (
      options.leaderReadiness &&
      typeof options.leaderReadiness === TYPEOF.OBJECT
    ) {
      response.leaderReadiness = {
        ...options.leaderReadiness,
      };
      for (const field of [
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERS,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERNODES,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERADDRESSES,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERS,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERNODES,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERADDRESSES,
      ]) {
        if (!Array.isArray(options.leaderReadiness[field])) {
          continue;
        }
        response[field] = [...options.leaderReadiness[field]];
      }
    }
    if (snapshot?.progressContract || options?.progressContract) {
      response.progressContract = snapshot?.progressContract || options?.progressContract;
    }
    return response;
  }
  getReadinessSnapshotForDiagnostics() {
    const readinessState = this.getReadinessState();
    try {
      return this.evaluateReadinessSnapshot();
    } catch (_error) {
      const fallbackSnapshot =
        typeof readinessState?.getSnapshot === TYPEOF.FUNCTION ?
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
    const merged = Array.isArray(reasons) ? [...reasons] : [];
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
