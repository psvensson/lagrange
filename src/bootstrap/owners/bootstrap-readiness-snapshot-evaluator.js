import {STATE_ABSENT, readStateField} from '../../utils/state-field-read.js';
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
import {
  BOOTSTRAP_READINESS_DEPENDENCY,
  LIFECYCLE_WAKE_SOURCE,
} from './bootstrap-readiness-lifecycle-source.js';

const READINESS_PROBE_ASYNC_TIMEOUT_ERROR_CODE =
  'READINESS_PROBE_ASYNC_TIMEOUT';
const READINESS_PROBE_ASYNC_TIMEOUT_MS = 250; // ends-on: the evaluateReadinessSnapshotAsync() evaluation resolves
const PRIORITY_RECOVERY_DIAGNOSTICS_UNAVAILABLE =
  'priority_control_plane_recovery_diagnostics_unavailable';
const DEFAULT_PROGRESS_CONTRACT_ENTRY = Object.freeze({
  nextAction: 'wait_for_readiness_support',
  wakeSource: 'bootstrap',
  blockingDependency: 'readiness_support',
});
const PROGRESS_CONTRACT_BY_REASON = Object.freeze({
  [BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE]: Object.freeze({
    nextAction: 'wait_for_bootstrap_phase',
    wakeSource: 'bootstrap',
    blockingDependency: 'bootstrap',
  }),
  [BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE]: Object.freeze({
    nextAction: 'wait_for_sql_engine',
    wakeSource: 'sql_engine',
    blockingDependency: 'sql_engine',
  }),
  [BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE]: Object.freeze({
    nextAction: 'wait_for_leader_metadata',
    wakeSource: 'leader_metadata',
    blockingDependency: 'leader_metadata',
  }),
  [BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY]: Object.freeze({
    nextAction: 'wait_for_runtime_wiring',
    wakeSource: 'runtime_wiring',
    blockingDependency: 'runtime_wiring',
  }),
  [LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY]: Object.freeze({
    nextAction: 'wait_for_local_query_transport',
    wakeSource: 'local_query_transport_event',
    blockingDependency: 'local_query_transport',
  }),
  [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]: Object.freeze({
    nextAction: 'wait_for_priority_control_plane_recovery',
    wakeSource: LIFECYCLE_WAKE_SOURCE.PRIORITY_CONTROL_PLANE_RECOVERY_EVENT,
    blockingDependency: 'priority_control_plane_recovery',
  }),
  [PRIORITY_RECOVERY_DIAGNOSTICS_UNAVAILABLE]: Object.freeze({
    nextAction: 'wait_for_priority_control_plane_recovery',
    wakeSource: LIFECYCLE_WAKE_SOURCE.PRIORITY_CONTROL_PLANE_RECOVERY_EVENT,
    blockingDependency: 'priority_control_plane_recovery',
  }),
});

function resolveStartupAuthorityFailureField(startupAuthority) {
  const failure = startupAuthority?.failure;
  if (failure?.state === BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT) {
    return {startupAuthorityFailureReason: failure.reason};
  }
  return {};
}

function resolveBootstrapJoinAuthorityFailureField(
  startupAuthority,
  priorityControlPlaneRecoveryHealth,
) {
  const failure = startupAuthority?.failure;
  const reason = failure?.state === BOOTSTRAP_READINESS_OWNER_LITERAL.PRESENT ?
    failure.reason :
    priorityControlPlaneRecoveryHealth?.details?.failureReason;
  return typeof reason === 'string' ?
    {bootstrapJoinAuthorityFailureReason: reason} :
    {};
}

function applyAsyncProbeRecoveryHealth(snapshot, recoveryHealth) {
  if (recoveryHealth?.healthy === true) {
    return snapshot;
  }
  const reasonCode = recoveryHealth?.reasonCode;
  const existingReasons = Array.isArray(snapshot?.reasons) ?
    snapshot.reasons :
    [];
  const reasons =
    typeof reasonCode === 'string' &&
    reasonCode.length > 0 &&
    !existingReasons.includes(reasonCode) ?
      [...existingReasons, reasonCode] :
      existingReasons;
  const phase = snapshot?.phase === LIFECYCLE_PHASE.INIT ?
    LIFECYCLE_PHASE.INIT :
    LIFECYCLE_PHASE.DEGRADED;
  return {
    ...snapshot,
    ready: false,
    phase,
    reasons,
  };
}

function resolveStartupAuthorityEnvelope(startupAuthority) {
  const rawState = readStateField(startupAuthority?.state);
  const rawObservationState = readStateField(
    startupAuthority?.publication?.observationState,
  );
  return {
    startupAuthorityState: rawState === STATE_ABSENT ?
      BOOTSTRAP_READINESS_OWNER_LITERAL.AUTHORITY_UNAVAILABLE :
      rawState,
    startupAuthorityAvailable: startupAuthority?.authorityAvailable === true,
    startupAuthorityFailure:
      startupAuthority?.failure ||
      Object.freeze({
        state: BOOTSTRAP_READINESS_OWNER_LITERAL.NONE,
      }),
    startupAuthorityPublication:
      startupAuthority?.publication ||
      Object.freeze({
        observationState:
          BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE,
      }),
    startupAuthorityPublicationObservationState:
      rawObservationState === STATE_ABSENT ?
        BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE :
        rawObservationState,
  };
}

const BOOTSTRAP_READINESS_SNAPSHOT_EVALUATOR_METHODS = Object.freeze({
  evaluateReadinessSnapshot() {
    const readinessState = this.getReadinessState();
    let snapshot;
    if (this.sourcesLifecycleDependenciesOf(readinessState)) {
      snapshot = this.describeLifecycleSnapshotWithStartupAuthority(
        readinessState.evaluate(),
      );
    } else if (
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
    if (this.sourcesLifecycleDependenciesOf(readinessState)) {
      const priorityControlPlaneRecoveryHealth =
        await this.getPriorityControlPlaneRecoveryHealthAsync();
      snapshot = this.describeLifecycleSnapshotWithStartupAuthority(
        applyAsyncProbeRecoveryHealth(
          readinessState.evaluate(),
          priorityControlPlaneRecoveryHealth,
        ),
        priorityControlPlaneRecoveryHealth,
      );
    } else if (
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
          phase: readStateField(this.getBootstrapService()?.phase),
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
    const finalSnapshot = this.describeLifecycleSnapshotWithStartupAuthority(
      snapshot,
      priorityControlPlaneRecoveryHealth,
      startupAuthority,
    );
    if (finalSnapshot.ready !== true) {
      finalSnapshot.progressContract = this.buildStartupReadinessProgressContract(finalSnapshot);
    }
    return finalSnapshot;
  },
  describeLifecycleSnapshotWithStartupAuthority(
    snapshot,
    priorityControlPlaneRecoveryHealth =
    this.getPriorityControlPlaneRecoveryHealth(),
    startupAuthority = this.getStartupAuthoritySnapshot(Date.now()),
  ) {
    return {
      ...snapshot,
      ...resolveStartupAuthorityEnvelope(startupAuthority),
      ...resolveStartupAuthorityFailureField(startupAuthority),
      bootstrapJoinAuthorityAvailable:
        hasBootstrapJoinAuthority(priorityControlPlaneRecoveryHealth) ||
        startupAuthority?.authorityAvailable === true,
      ...resolveBootstrapJoinAuthorityFailureField(
        startupAuthority,
        priorityControlPlaneRecoveryHealth,
      ),
    };
  },

  buildStartupReadinessProgressContract(snapshot) {
    const reasons = Array.isArray(snapshot?.reasons) ? snapshot.reasons : [];
    const primaryReason = reasons[0] || 'readiness_retryable';
    const contractEntry =
      PROGRESS_CONTRACT_BY_REASON[primaryReason] ||
      DEFAULT_PROGRESS_CONTRACT_ENTRY;

    return {
      owner: 'startup_readiness_owner',
      boundary: 'startup_support_evidence',
      state: 'readiness_retryable',
      reason: primaryReason,
      nextAction: contractEntry.nextAction,
      wakeSource: contractEntry.wakeSource,
      retryAfterMs: typeof snapshot?.retryAfterMs === 'number' ?
        snapshot.retryAfterMs :
        0,
      terminalState: 'satisfied',
      evidencePath: 'startup_support_evidence',
      blockingDependency: contractEntry.blockingDependency,
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
