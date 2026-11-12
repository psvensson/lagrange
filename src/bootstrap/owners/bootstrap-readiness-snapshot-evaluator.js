import {STATE_ABSENT, readStateField} from '../../utils/state-field-read.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {BOOTSTRAP_API_PROBE_REASON} from '../bootstrap-api-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {hasBootstrapJoinAuthority} from './bootstrap-join-projection-policy.js';
import {BOOTSTRAP_READINESS_OWNER_LITERAL} from './bootstrap-readiness-owner-literals.js';
import {LIFECYCLE_WAKE_SOURCE} from './bootstrap-readiness-lifecycle-source.js';

const BOOTSTRAP_READINESS_SNAPSHOT_EVALUATOR_METHODS = Object.freeze({
  /**
   * The readiness snapshot requests and probes answer from: one evaluation
   * of the lifecycle, described with the startup authority. A read. The
   * lifecycle derives its dependencies from their owners at every
   * evaluation (bootstrap-readiness-lifecycle-source.js); nothing here
   * writes a dependency, so answering a probe changes nothing a later
   * consumer reads.
   * @return {Object}
   */
  evaluateReadinessSnapshot() {
    const readinessState = this.getReadinessState();
    let snapshot;
    if (readinessState === null) {
      snapshot = {
        ready: false,
        phase: LIFECYCLE_PHASE.INIT,
        state: BOOTSTRAP_PHASE.NOT_STARTED,
        reasons: [BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE],
        retryAfterMs: 0,
        timestamp: Date.now(),
      };
    } else if (this.sourcesLifecycleDependenciesOf(readinessState)) {
      snapshot = this.describeLifecycleSnapshotWithStartupAuthority(
        readinessState.evaluate(),
      );
    } else {
      snapshot = readinessState.evaluate();
    }
    if (snapshot && snapshot.ready !== true && !snapshot.progressContract) {
      snapshot.progressContract = this.buildStartupReadinessProgressContract(snapshot);
    }
    return snapshot;
  },
  describeLifecycleSnapshotWithStartupAuthority(snapshot) {
    const startupAuthority = this.getStartupAuthoritySnapshot(Date.now());
    const priorityControlPlaneRecoveryHealth =
      this.getPriorityControlPlaneRecoveryHealth();
    // An authority that states no state, or a publication that states no
    // observation state, is named unavailable rather than left absent.
    const startupAuthorityState = readStateField(startupAuthority?.state);
    const publicationObservationState =
      readStateField(startupAuthority?.publication?.observationState);
    return {
      ...snapshot,
      startupAuthorityState: startupAuthorityState === STATE_ABSENT ?
        BOOTSTRAP_READINESS_OWNER_LITERAL.AUTHORITY_UNAVAILABLE :
        startupAuthorityState,
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
        publicationObservationState === STATE_ABSENT ?
          BOOTSTRAP_READINESS_OWNER_LITERAL.OBSERVATION_UNAVAILABLE :
          publicationObservationState,
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
      wakeSource = LIFECYCLE_WAKE_SOURCE.PRIORITY_CONTROL_PLANE_RECOVERY_EVENT;
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
