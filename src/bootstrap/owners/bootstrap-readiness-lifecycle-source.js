// The lifecycle controller's dependency source, and the events that make
// its transitions observable when they happen.
//
// The controller used to hold dependency values that were written only
// while a bootstrap request or an HTTP probe was being answered, and every
// other consumer (the rebalancer's traffic gate, the partition services)
// re-projected those stored values. A dependency whose owner changed with
// no request in flight therefore stayed at its last sampled value for ever
// (2026-11-11: a seed held DEGRADED [PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]
// after recovery completed, and 39 system partitions never left it).
//
// Here the dependencies are a READ of their owners, bound into the
// controller as its one source: every evaluation, by any consumer, derives
// them from the owners at that instant, and nothing is stored between
// evaluations. Requests and probes evaluate like every other consumer; they
// write nothing.
//
// A read alone would leave the controller's transition event to fire only
// when somebody next evaluates. Two events evaluate at the change:
// - the readiness planning owner's publication for this node, which is how
//   the control-plane readiness owner announces that the answer the
//   recovery health derives from was rebuilt (the wake source the progress
//   contract names priority_control_plane_recovery_event);
// - the controller's own stable-window deadline, the one transition that is
//   caused by time and by nothing else.
import {performance} from 'node:perf_hooks';
import {readStateField} from '../../utils/state-field-read.js';
import {BOOTSTRAP_PIPELINE_ERROR_CODE} from '../bootstrap-constants.js';
import {BOOTSTRAP_API_PROBE_REASON} from '../bootstrap-api-constants.js';
import {READINESS_DEPENDENCY} from '../bootstrap-readiness-state-constants.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_DEPENDENCY_DEMOTION_POLICY,
  LIFECYCLE_EVENT,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {LifecycleController} from '../lifecycle-controller.js';
import {ControlPlaneReadinessService} from
  '../../control-plane/control-plane-readiness-service.js';
import {
  isLocalQueryTransportReady,
} from '../shared/local-query-transport-readiness.js';

const BOOTSTRAP_READINESS_DEPENDENCY = Object.freeze({
  SQL_ENGINE_READY: 'sql_engine_ready',
  LEADER_METADATA_READY: 'leader_metadata_ready',
  RUNTIME_WIRING_READY: 'runtime_wiring_ready',
  LOCAL_QUERY_TRANSPORT_READY: 'local_query_transport_ready',
  CONTROL_PLANE_WRITE_HEALTH: 'control_plane_write_health',
  PRIORITY_CONTROL_PLANE_RECOVERY: 'priority_control_plane_recovery',
});

// The events that evaluate the lifecycle when its sources change. The
// startup readiness progress contract names the first as the wake source of
// a pending priority recovery.
const LIFECYCLE_WAKE_SOURCE = Object.freeze({
  PRIORITY_CONTROL_PLANE_RECOVERY_EVENT:
    'priority_control_plane_recovery_event',
  STABLE_WINDOW_DEADLINE: 'readiness_stable_window_deadline',
});

const LIFECYCLE_FOLLOW_EVALUATION_FAILED =
  'Lifecycle evaluation on a readiness source event failed';
const LIFECYCLE_TRANSITION_ON_SOURCE_EVENT =
  'Lifecycle transition raised by a readiness source event';
const MIN_STABLE_WINDOW_DEADLINE_MS = 1; // ends-on: the lifecycle controller's stable window elapses
// What a follow that holds no publication subscription releases.
const releaseNothing = () => {};

function isStableWindowPending(snapshot) {
  return Array.isArray(snapshot.reasons) &&
    snapshot.reasons.length === 1 &&
    snapshot.reasons[0] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
}

const BOOTSTRAP_READINESS_LIFECYCLE_SOURCE_METHODS = Object.freeze({
  /**
   * Bind this owner's dependency read into the lifecycle controller and
   * start following the events that change it. A readiness state that is not
   * the controller (a test double answering evaluate() itself) has no
   * dependencies to source and is left alone.
   */
  followLifecycleSources() {
    const readinessState = this.getReadinessState();
    if (!(readinessState instanceof LifecycleController)) {
      return;
    }
    const follow = {
      readinessState,
      service: null,
      unsubscribePublication: releaseNothing,
      evaluationQueued: false,
      stableWindowTimer: null,
      onTransition: () => this.armStableWindowDeadline(),
      evaluationsOnPublication: 0,
      evaluationsOnStableWindowDeadline: 0,
      // What the dependency read costs this node: every lifecycle
      // evaluation by any consumer performs one.
      sourceReads: 0,
      sourceReadMs: 0,
    };
    this.lifecycleFollow = follow;
    readinessState.bindDependencySource(() => this.readLifecycleDependencies());
    readinessState.on(LIFECYCLE_EVENT.TRANSITION, follow.onTransition);
    // A readiness service that already exists is followed from now; one
    // wired later is followed from the first dependency read that sees it.
    this.followPriorityRecoveryPublication();
  },

  /**
   * Release the publication subscription, the stable-window deadline and
   * the transition listener. The dependency source stays bound: a later
   * evaluation still reads the owners.
   */
  stopFollowingLifecycleSources() {
    const follow = this.lifecycleFollow;
    if (follow === null) {
      return;
    }
    follow.unsubscribePublication();
    clearTimeout(follow.stableWindowTimer);
    follow.stableWindowTimer = null;
    follow.readinessState.off(LIFECYCLE_EVENT.TRANSITION, follow.onTransition);
    this.lifecycleFollow = null;
  },

  /**
   * Whether the readiness state's dependencies are sourced from this owner.
   * @param {Object|null} readinessState
   * @return {boolean}
   */
  sourcesLifecycleDependenciesOf(readinessState) {
    return this.lifecycleFollow !== null &&
      this.lifecycleFollow.readinessState === readinessState;
  },

  /**
   * Every lifecycle dependency, read from its owner now. It writes no
   * dependency; what an owner does to answer (the readiness service keeps
   * planning memos and queues its own rebuilds) stays that owner's.
   * @return {Array<Object>}
   */
  readLifecycleDependencies() {
    const startedAtMs = performance.now();
    try {
      return this.readLifecycleDependencyOwners();
    } finally {
      const follow = this.lifecycleFollow;
      if (follow !== null) {
        follow.sourceReads += 1;
        follow.sourceReadMs += performance.now() - startedAtMs;
      }
    }
  },

  readLifecycleDependencyOwners() {
    this.followPriorityRecoveryPublication();
    const leaderStatus = this.getLeaderReadinessStatusForProbe();
    const localQueryTransportReadiness = this.getLocalQueryTransportReadiness();
    const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
    const priorityControlPlaneRecoveryHealth =
      this.getPriorityControlPlaneRecoveryHealth();
    return [
      {
        name: READINESS_DEPENDENCY.STARTUP_COMPLETE,
        ready: this.isStartupComplete(),
        reasonCode: BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
        details: {phase: readStateField(this.getBootstrapService()?.phase)},
      },
      {
        name: BOOTSTRAP_READINESS_DEPENDENCY.SQL_ENGINE_READY,
        ready: this.isSqlEngineDependencyReady(),
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
      },
      {
        name: BOOTSTRAP_READINESS_DEPENDENCY.LEADER_METADATA_READY,
        ready: leaderStatus.ready === true,
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
        details: leaderStatus,
      },
      {
        name: BOOTSTRAP_READINESS_DEPENDENCY.RUNTIME_WIRING_READY,
        ready: this.isRuntimeWiringReady(),
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      },
      {
        name: BOOTSTRAP_READINESS_DEPENDENCY.LOCAL_QUERY_TRANSPORT_READY,
        ready: !this.shouldRequireLocalQueryTransportReadiness() ||
          isLocalQueryTransportReady(localQueryTransportReadiness),
        reasonCode: LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
        details: localQueryTransportReadiness,
      },
      {
        name: BOOTSTRAP_READINESS_DEPENDENCY.CONTROL_PLANE_WRITE_HEALTH,
        ready: controlPlaneWriteHealth.healthy === true,
        reasonCode: controlPlaneWriteHealth.reasonCode,
        details: controlPlaneWriteHealth.details,
        classification: controlPlaneWriteHealth.classification,
      },
      {
        name: BOOTSTRAP_READINESS_DEPENDENCY.PRIORITY_CONTROL_PLANE_RECOVERY,
        ready: priorityControlPlaneRecoveryHealth.healthy === true,
        reasonCode: priorityControlPlaneRecoveryHealth.reasonCode,
        details: priorityControlPlaneRecoveryHealth.details,
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
        demotionPolicy: LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.IMMEDIATE,
      },
    ];
  },

  /**
   * Follow the readiness planning owner of the control-plane readiness
   * service the dependencies are currently read from. The service is wired
   * after this owner is built and may be replaced, so the subscription
   * follows the identity the read observes.
   */
  followPriorityRecoveryPublication() {
    const follow = this.lifecycleFollow;
    if (follow === null) {
      return;
    }
    const service = this.getControlPlaneReadinessService();
    if (service === follow.service) {
      return;
    }
    follow.unsubscribePublication();
    follow.service = service;
    // The planning publication stream is the control-plane readiness
    // service's port. Anything else in its place (no service yet, a test
    // double) announces nothing: its changes are seen by the next evaluation.
    follow.unsubscribePublication =
      service instanceof ControlPlaneReadinessService ?
        service.subscribeReadinessPlanningSnapshots((event) => {
          if (event.ownerKey === this.getSeedNodeId()) {
            this.queueLifecycleEvaluationOnPublication();
          }
        }) :
        releaseNothing;
  },

  // The publication is delivered inside the planning owner's own completion;
  // the evaluation reads that owner, so it runs after the delivery returns,
  // once for any number of publications delivered in the same turn.
  queueLifecycleEvaluationOnPublication() {
    const follow = this.lifecycleFollow;
    if (follow === null || follow.evaluationQueued) {
      return;
    }
    follow.evaluationQueued = true;
    queueMicrotask(() => {
      follow.evaluationQueued = false;
      if (this.lifecycleFollow !== follow) {
        return;
      }
      follow.evaluationsOnPublication += 1;
      this.evaluateFollowedLifecycle(
        follow,
        LIFECYCLE_WAKE_SOURCE.PRIORITY_CONTROL_PLANE_RECOVERY_EVENT,
      );
    });
  },

  /**
   * Arm the deadline of a pending stable window. The window ends by time
   * alone, so its end is the one transition no owner event announces; the
   * deadline is bounded by the controller's stable window and is re-derived
   * from the controller on every transition.
   */
  armStableWindowDeadline() {
    const follow = this.lifecycleFollow;
    if (follow === null) {
      return;
    }
    clearTimeout(follow.stableWindowTimer);
    follow.stableWindowTimer = null;
    const snapshot = follow.readinessState.getSnapshot();
    if (!isStableWindowPending(snapshot)) {
      return;
    }
    const remainingMs = Math.max(
      MIN_STABLE_WINDOW_DEADLINE_MS,
      Math.ceil(snapshot.stableWindowMs - snapshot.stableElapsedMs),
    );
    follow.stableWindowTimer = setTimeout(() => {
      follow.stableWindowTimer = null;
      if (this.lifecycleFollow !== follow) {
        return;
      }
      follow.evaluationsOnStableWindowDeadline += 1;
      this.evaluateFollowedLifecycle(
        follow,
        LIFECYCLE_WAKE_SOURCE.STABLE_WINDOW_DEADLINE,
      );
      // A timer that fired a tick before the window's own clock agrees
      // leaves the window pending with no transition; arm the remainder.
      this.armStableWindowDeadline();
    }, remainingMs);
    follow.stableWindowTimer.unref();
  },

  evaluateFollowedLifecycle(follow, wakeSource) {
    const transitionsBefore = follow.readinessState.getSnapshot().transitionCount;
    let snapshot = null;
    try {
      snapshot = follow.readinessState.evaluate();
    } catch (error) {
      // Reported, never swallowed: the lifecycle keeps its last projection
      // (no transition) and the next evaluation by any consumer raises the
      // same failure.
      this.getLogger()?.error?.(LIFECYCLE_FOLLOW_EVALUATION_FAILED, {
        seedNodeId: this.getSeedNodeId(),
        wakeSource,
        error: error?.message || String(error),
      });
    }
    if (snapshot !== null && snapshot.transitionCount !== transitionsBefore) {
      this.getLogger()?.info?.(LIFECYCLE_TRANSITION_ON_SOURCE_EVENT, {
        seedNodeId: this.getSeedNodeId(),
        wakeSource,
        phase: snapshot.phase,
        ready: snapshot.ready,
        reasons: snapshot.reasons,
        sourceReads: follow.sourceReads,
        sourceReadMs: Math.round(follow.sourceReadMs),
      });
    }
  },
});

function assignBootstrapReadinessLifecycleSourceMethods(ownerClass) {
  Object.defineProperties(
    ownerClass.prototype,
    Object.fromEntries(
      Object.entries(BOOTSTRAP_READINESS_LIFECYCLE_SOURCE_METHODS).map(
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
  BOOTSTRAP_READINESS_DEPENDENCY,
  LIFECYCLE_WAKE_SOURCE,
  assignBootstrapReadinessLifecycleSourceMethods,
};
