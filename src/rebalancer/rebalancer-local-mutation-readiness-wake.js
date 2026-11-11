import {TABLES} from '../constants/tables.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {RECONCILE_REASON} = UNIFIED_REBALANCER_SHARED;

// The rows whose change can end a local mutation-readiness deferral: the
// publication row carries the durable spread summary and the ack state, and
// the replica operations carry the open-operation evidence the priority
// recovery gate reads. Any other table cannot flip the published-convergence
// answer, so it never pays a readiness evaluation.
const LOCAL_MUTATION_READINESS_WAKE_TABLES = Object.freeze(new Set([
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.REPLICA_OPERATIONS,
]));

function isLocalMutationReadinessWakeArmed(rebalancer) {
  return Boolean(
    rebalancer.localMutationReadinessWakeListener ||
      rebalancer.localMutationReadinessPlanningUnsubscribe,
  );
}

function attachLocalMutationReadinessCacheListener(
  rebalancer,
  scheduleWakeEvaluation,
) {
  const cache = rebalancer.systemTableCache;
  if (!cache || typeof cache.onCacheChange !== 'function') {
    return false;
  }
  const listener = (tableName) => {
    if (LOCAL_MUTATION_READINESS_WAKE_TABLES.has(tableName)) {
      scheduleWakeEvaluation();
    }
  };
  rebalancer.localMutationReadinessWakeListener = listener;
  cache.onCacheChange(listener);
  return true;
}

function attachLocalMutationReadinessPlanningListener(
  rebalancer,
  scheduleWakeEvaluation,
) {
  const readinessService = rebalancer.controlPlaneReadinessService;
  if (
    !readinessService ||
    typeof readinessService.subscribeReadinessPlanningSnapshots !== 'function'
  ) {
    return false;
  }
  rebalancer.localMutationReadinessPlanningUnsubscribe =
    readinessService.subscribeReadinessPlanningSnapshots((snapshot) => {
      if (!snapshot?.nodeId || snapshot.nodeId === rebalancer.nodeId) {
        scheduleWakeEvaluation();
      }
    });
  return true;
}

/**
 * The rebalancer's readiness-planning wakes: two named waits ended by the
 * event that clears them, never by a timer alone.
 *
 * LOCAL_MUTATION_READINESS - event wake for a rebalancer deferred on local
 * mutation readiness (owner
 * rule: no early unblock may be ended only by a timer). While deferred, the
 * entity listens to the system-table cache through the same seam the
 * priority-recovery visibility listener uses; the first relevant change that
 * leaves no local mutation-readiness blocker resets the backed-off interval
 * and enqueues one check through the owner reconcile queue. The scheduled
 * timer stays armed as the fallback. Evaluations coalesce to one per event
 * burst.
 *
 * PLANNING_TARGET_READINESS_DEFERRED - a pass needed a move and found no
 * target because a candidate's planning readiness read was deferred; see
 * armPlanningTargetReadinessWake.
 */
const REBALANCER_LOCAL_MUTATION_READINESS_WAKE_METHODS = {
  // Arms the wake while the gate defers and disarms it once it does not;
  // returns whether the gate defers.
  syncLocalMutationReadinessWake(shouldDefer) {
    if (shouldDefer === true) {
      this.armLocalMutationReadinessWake();
      return true;
    }
    this.disarmLocalMutationReadinessWake();
    return false;
  },

  armLocalMutationReadinessWake() {
    if (isLocalMutationReadinessWakeArmed(this)) {
      return true;
    }
    const scheduleWakeEvaluation = () => {
      if (this.localMutationReadinessWakeCheckPending === true) {
        return;
      }
      this.localMutationReadinessWakeCheckPending = true;
      queueMicrotask(() => {
        this.localMutationReadinessWakeCheckPending = false;
        this.resolveLocalMutationReadinessWake();
      });
    };
    const armedCache = attachLocalMutationReadinessCacheListener(
      this,
      scheduleWakeEvaluation,
    );
    const armedPlanning = attachLocalMutationReadinessPlanningListener(
      this,
      scheduleWakeEvaluation,
    );
    return armedCache || armedPlanning;
  },

  disarmLocalMutationReadinessWake() {
    const listener = this.localMutationReadinessWakeListener;
    this.localMutationReadinessWakeListener = null;
    const cache = this.systemTableCache;
    if (listener && cache && typeof cache.offCacheChange === 'function') {
      cache.offCacheChange(listener);
    }
    const unsubscribe = this.localMutationReadinessPlanningUnsubscribe;
    this.localMutationReadinessPlanningUnsubscribe = null;
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  },

  /**
   * Named wait PLANNING_TARGET_READINESS_DEFERRED: a pass that needed a move
   * ended without a target because a candidate node's planning readiness
   * read was DEFERRED (the planning owner queued a rebuild and answered
   * neither ready nor not-ready). The wait is ended by the event that clears
   * it, the planning owner publishing a completed snapshot for one of those
   * node keys, through the same planning-snapshot subscription the local
   * mutation wake uses; it enqueues one check, which may run ahead of the
   * cadence floor (consumed once) because a fresh publication is exactly
   * when the deferred read can be answered. Re-arming replaces the node set;
   * the cadence timer stays armed as the fallback.
   * @param {Array<string>} nodeIds
   * @return {boolean} whether the wait is armed
   */
  armPlanningTargetReadinessWake(nodeIds) {
    const readinessService = this.controlPlaneReadinessService;
    const awaited = new Set(Array.isArray(nodeIds) ? nodeIds : []);
    if (
      awaited.size === 0 ||
      typeof readinessService?.subscribeReadinessPlanningSnapshots !==
        'function'
    ) {
      this.disarmPlanningTargetReadinessWake();
      return false;
    }
    this.planningTargetReadinessWakeNodeIds = awaited;
    if (!this.planningTargetReadinessWakeUnsubscribe) {
      this.planningTargetReadinessWakeUnsubscribe =
        readinessService.subscribeReadinessPlanningSnapshots((event) =>
          this.resolvePlanningTargetReadinessWake(event?.ownerKey));
    }
    return true;
  },

  disarmPlanningTargetReadinessWake() {
    this.planningTargetReadinessWakeNodeIds = null;
    const unsubscribe = this.planningTargetReadinessWakeUnsubscribe;
    this.planningTargetReadinessWakeUnsubscribe = null;
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  },

  resolvePlanningTargetReadinessWake(ownerKey) {
    const awaited = this.planningTargetReadinessWakeNodeIds;
    if (!(awaited instanceof Set) || !awaited.has(ownerKey)) {
      return false;
    }
    this.disarmPlanningTargetReadinessWake();
    if (!this.isLeader || this.isShuttingDown) {
      return false;
    }
    this.planningTargetReadinessWakeDue = true;
    return this.enqueueRebalanceCheck(
      RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED,
    );
  },

  /**
   * Consume the one cadence-floor exemption a planning-target wake grants.
   * @return {boolean}
   */
  consumePlanningTargetReadinessWakeDue() {
    const due = this.planningTargetReadinessWakeDue === true;
    this.planningTargetReadinessWakeDue = false;
    return due;
  },

  resolveLocalMutationReadinessWake() {
    if (!isLocalMutationReadinessWakeArmed(this)) {
      return false;
    }
    if (!this.isLeader || this.isShuttingDown) {
      this.disarmLocalMutationReadinessWake();
      return false;
    }
    if (this.getLocalControlPlaneMutationReadinessBlocker()) {
      return false;
    }
    this.disarmLocalMutationReadinessWake();
    this.currentInterval = this.periodicCheckIntervalMs;
    return this.enqueueRebalanceCheck(
      RECONCILE_REASON.LOCAL_MUTATION_READINESS_WAKE,
    );
  },
};

export {REBALANCER_LOCAL_MUTATION_READINESS_WAKE_METHODS};
