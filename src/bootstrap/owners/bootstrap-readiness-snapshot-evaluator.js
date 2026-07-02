import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {BOOTSTRAP_API_PROBE_REASON} from '../bootstrap-api-constants.js';
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
import {hasBootstrapJoinAuthority} from './bootstrap-join-projection-policy.js';
import {BOOTSTRAP_READINESS_OWNER_LITERAL} from './bootstrap-readiness-owner-literals.js';

const BOOTSTRAP_READINESS_DEPENDENCY = Object.freeze({
  SQL_ENGINE_READY: 'sql_engine_ready',
  LEADER_METADATA_READY: 'leader_metadata_ready',
  RUNTIME_WIRING_READY: 'runtime_wiring_ready',
  LOCAL_QUERY_TRANSPORT_READY: 'local_query_transport_ready',
  CONTROL_PLANE_WRITE_HEALTH: 'control_plane_write_health',
  PRIORITY_CONTROL_PLANE_RECOVERY: 'priority_control_plane_recovery',
});

const READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE =
  'READINESS_PROBE_ASYNC_TIMEOUT';
const READINESS_PROBE_ASYNC_TIMEOUT_MS = 250;

const BOOTSTRAP_READINESS_SNAPSHOT_EVALUATOR_METHODS = Object.freeze({
  evaluateReadinessSnapshot() {
    const readinessState = this.getReadinessState();
    let snapshot;
    if (
      !readinessState ||
      typeof readinessState.setDependency !== 'function'
    ) {
      if (typeof readinessState?.evaluate === 'function') {
        snapshot = readinessState.evaluate();
      } else if (typeof readinessState?.getSnapshot === 'function') {
        snapshot = readinessState.getSnapshot();
      } else {
        snapshot = {
          ready: false,
          phase: LIFECYCLE_PHASE.INIT,
          state: BOOTSTRAP_PHASE.NOT_STARTED,
          reasons: [BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE],
          retryAfterMs: 0,
          timestamp: Date.now(),
        };
      }
    } else {
      const priorityControlPlaneRecoveryHealth =
        this.getPriorityControlPlaneRecoveryHealth();
      snapshot = this.evaluateReadinessSnapshotWithPriorityRecoveryHealth(
        readinessState,
        priorityControlPlaneRecoveryHealth,
      );
    }
    if (snapshot && snapshot.ready !== true && !snapshot.progressContract) {
      snapshot.progressContract = this.buildStartupReadinessProgressContract(snapshot);
    }
    return snapshot;
  },
  async evaluateReadinessSnapshotAsync() {
    const readinessState = this.getReadinessState();
    let snapshot;
    if (
      !readinessState ||
      typeof readinessState.setDependency !== 'function'
    ) {
      snapshot = this.evaluateReadinessSnapshot();
    } else {
      const priorityControlPlaneRecoveryHealth =
        await this.getPriorityControlPlaneRecoveryHealthAsync();
      snapshot = this.evaluateReadinessSnapshotWithPriorityRecoveryHealth(
        readinessState,
        priorityControlPlaneRecoveryHealth,
      );
    }
    if (snapshot && snapshot.ready !== true && !snapshot.progressContract) {
      snapshot.progressContract = this.buildStartupReadinessProgressContract(snapshot);
    }
    return snapshot;
  },

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
  },

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
  },

  /**
   * @param {Error|Object|null} error
   * @return {boolean}
   */
  isReadinessProbeAsyncTimeout(error) {
    return error?.code === READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE;
  },
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
    const finalSnapshot = {
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
        'string' ?
        {
          bootstrapJoinAuthorityFailureReason:
              startupAuthority?.failure?.state ===
              BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT ?
                startupAuthority.failure.reason :
                priorityControlPlaneRecoveryHealth.details.failureReason,
        } :
        {}),
    };
    if (finalSnapshot.ready !== true) {
      finalSnapshot.progressContract = this.buildStartupReadinessProgressContract(finalSnapshot);
    }
    return finalSnapshot;
  },

  buildStartupReadinessProgressContract(snapshot) {
    const reasons = Array.isArray(snapshot?.reasons) ? snapshot.reasons : [];
    const primaryReason = reasons[0] || 'readiness_retryable';

    let nextAction = 'wait_for_readiness_support';
    let wakeSource = 'bootstrap';
    let blockingDependency = 'readiness_support';

    if (primaryReason === BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE) {
      nextAction = 'wait_for_bootstrap_phase';
      wakeSource = 'bootstrap';
      blockingDependency = 'bootstrap';
    } else if (primaryReason === BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE) {
      nextAction = 'wait_for_sql_engine';
      wakeSource = 'sql_engine';
      blockingDependency = 'sql_engine';
    } else if (primaryReason === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      nextAction = 'wait_for_leader_metadata';
      wakeSource = 'leader_metadata';
      blockingDependency = 'leader_metadata';
    } else if (primaryReason === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      nextAction = 'wait_for_runtime_wiring';
      wakeSource = 'runtime_wiring';
      blockingDependency = 'runtime_wiring';
    } else if (primaryReason === LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY) {
      nextAction = 'wait_for_local_query_transport';
      wakeSource = 'local_query_transport_event';
      blockingDependency = 'local_query_transport';
    } else if (
      primaryReason === LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING ||
      primaryReason === 'priority_control_plane_recovery_diagnostics_unavailable'
    ) {
      nextAction = 'wait_for_priority_control_plane_recovery';
      wakeSource = 'priority_control_plane_recovery_event';
      blockingDependency = 'priority_control_plane_recovery';
    }

    return {
      owner: 'startup_readiness_owner',
      boundary: 'startup_support_evidence',
      state: 'readiness_retryable',
      reason: primaryReason,
      nextAction,
      wakeSource,
      retryAfterMs: typeof snapshot?.retryAfterMs === 'number' ? snapshot.retryAfterMs : 0,
      terminalState: 'satisfied',
      evidencePath: 'startup_support_evidence',
      blockingDependency,
    };
  },
});

function assignBootstrapReadinessSnapshotEvaluatorMethods(ownerClass) {
  Object.defineProperties(
    ownerClass.prototype,
    Object.fromEntries(
      Object.entries(BOOTSTRAP_READINESS_SNAPSHOT_EVALUATOR_METHODS).map(
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

export {assignBootstrapReadinessSnapshotEvaluatorMethods};
