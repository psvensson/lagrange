import {NUM, TYPEOF} from '../../constants/index.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {CONTROL_PLANE_WRITE_HEALTH_STATE} from '../control-plane-write-health-owner.js';

const PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE =
  'priority_control_plane_recovery_diagnostics_unavailable';

const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze({
  SERVICE_UNAVAILABLE: 'control_plane_recovery_service_unavailable',
  DIAGNOSTICS_PROVIDER_UNAVAILABLE:
    'control_plane_recovery_diagnostics_provider_unavailable',
  DIAGNOSTICS_READ_FAILED: 'control_plane_recovery_diagnostics_read_failed',
  DIAGNOSTICS_UNAVAILABLE: 'control_plane_recovery_diagnostics_unavailable',
  DIAGNOSTICS_INCOMPLETE: 'control_plane_recovery_diagnostics_incomplete',
});

const BOOTSTRAP_CONTROL_PLANE_RECOVERY_HEALTH_METHODS = Object.freeze({
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
  },
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
  },
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
  },
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
  },
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
  },
});

function assignBootstrapControlPlaneRecoveryHealthMethods(ownerClass) {
  Object.defineProperties(
    ownerClass.prototype,
    Object.fromEntries(
      Object.entries(BOOTSTRAP_CONTROL_PLANE_RECOVERY_HEALTH_METHODS).map(
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
  assignBootstrapControlPlaneRecoveryHealthMethods,
  PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
};
