import {TABLES} from '../constants/tables.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {CancellationToken} from '../query/cancellation-token.js';
import {isDeferredReadinessPlanningSnapshot} from
  '../control-plane/readiness-planning-version-contract.js';
import {
  OPERATION_CREATION_ADMISSION_DENIAL_CLASS,
  OPERATION_CREATION_ADMISSION_ERROR_CODE,
  classifyOperationCreationAdmissionDenial,
} from './rebalance-coordinator-operation-creation-admission.js';
import {
  OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME,
  awaitOperationCreationAdmissionClearance,
} from './operation-creation-admission-clearance.js';
import {
  AVAILABLE_NODE_PLANNING_STATE,
} from './rebalancer-no-target-pass-diagnostic.js';

const {RECONCILE_REASON} = UNIFIED_REBALANCER_SHARED;
const OPERATION_CREATION_ADMISSION_WAKE_DISARMED =
  'operation creation admission wake disarmed';

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
    readinessService.subscribeReadinessPlanningSnapshots((event) => {
      // A publication event is {ownerKey, snapshot, capturedToken}; only
      // this node's own planning snapshot can end a LOCAL mutation-readiness
      // deferral.
      if (event.ownerKey === rebalancer.nodeId) {
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
 *
 * OPERATION_CREATION_ADMISSION_DEFERRED - a move's creation re-entered on
 * the admission owner's transient deferral; see
 * armOperationCreationAdmissionWake.
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
    const awaited = new Set(nodeIds);
    if (awaited.size === 0) {
      this.disarmPlanningTargetReadinessWake();
      return false;
    }
    this.planningTargetReadinessWakeNodeIds = awaited;
    if (!this.planningTargetReadinessWakeUnsubscribe) {
      this.planningTargetReadinessWakeUnsubscribe =
        this.controlPlaneReadinessService.subscribeReadinessPlanningSnapshots(
          (event) => this.resolvePlanningTargetReadinessWake(event.ownerKey));
    }
    // Subscribed first, re-read after: the deferral was read at the start of
    // the pass, several awaits ago. When none of the awaited nodes reads
    // DEFERRED any more, its publication landed before the subscription and
    // is not waited for again: the check is enqueued now.
    const stillDeferred = this.getAvailableNodePlan().candidates.some(
      (candidate) => awaited.has(candidate.nodeId) &&
        candidate.state === AVAILABLE_NODE_PLANNING_STATE.DEFERRED);
    if (!stillDeferred) {
      this.resolvePlanningTargetReadinessWake([...awaited][0]);
    }
    return true;
  },

  /**
   * A sync planning reader's single-node read: a DEFERRED answer is unknown,
   * never a final no, so the node joins the awaited set and its publication
   * re-asks.
   * @param {string} nodeId
   * @param {Object|null} readiness the read's answer
   * @return {boolean} whether the read was deferred
   */
  notePlanningTargetReadiness(nodeId, readiness) {
    if (!isDeferredReadinessPlanningSnapshot(readiness)) {
      return false;
    }
    this.armPlanningTargetReadinessWake([
      ...(this.planningTargetReadinessWakeNodeIds || []), nodeId]);
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

  /**
   * Named wait OPERATION_CREATION_ADMISSION_DEFERRED: a move's creation was
   * answered with the admission owner's own transient deferral (planning
   * identity changed or unavailable, replica_operations route unavailable).
   * The move is skipped for this pass, and the wait the owner names for that
   * deferral (operation-creation-admission-clearance.js) ends it: the
   * clearing event enqueues one check instead of leaving the entity to its
   * backed-off cadence. One wait per entity; bounded by the current cadence
   * interval (the scheduled check takes over after it) and cancelled on
   * shutdown or leadership loss.
   * @param {Error} error the creation error
   * @param {Object} move
   * @return {boolean} whether a wait is armed for this error
   */
  armOperationCreationAdmissionWake(error, move) {
    if (error?.code !== OPERATION_CREATION_ADMISSION_ERROR_CODE ||
        classifyOperationCreationAdmissionDenial(error) !==
          OPERATION_CREATION_ADMISSION_DENIAL_CLASS.TRANSIENT_REENTER) {
      return false;
    }
    if (this.operationCreationAdmissionWakeToken) {
      return true;
    }
    const token = new CancellationToken();
    this.operationCreationAdmissionWakeToken = token;
    awaitOperationCreationAdmissionClearance(this.rebalanceCoordinator, error, {
      nodeId: move.nodeId,
      remainingBudgetMs: this.currentInterval,
      cancellationToken: token,
    }).then(({outcome}) => {
      this.resolveOperationCreationAdmissionWake(token, outcome);
    }, (waitError) => {
      // Recorded, never swallowed; the cadence timer remains the fallback.
      this.lastOperationCreationAdmissionWakeError = waitError;
      this.resolveOperationCreationAdmissionWake(token, null);
    });
    return true;
  },

  resolveOperationCreationAdmissionWake(token, outcome) {
    if (this.operationCreationAdmissionWakeToken !== token) {
      return false;
    }
    this.operationCreationAdmissionWakeToken = null;
    if (outcome !== OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME.CLEARED ||
        !this.isLeader || this.isShuttingDown) {
      return false;
    }
    return this.enqueueRebalanceCheck(
      RECONCILE_REASON.OPERATION_CREATION_ADMISSION_CLEARED,
    );
  },

  disarmOperationCreationAdmissionWake() {
    const token = this.operationCreationAdmissionWakeToken;
    this.operationCreationAdmissionWakeToken = null;
    token?.cancel(OPERATION_CREATION_ADMISSION_WAKE_DISARMED);
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
