// The rebalancer's named waits and the one primitive they share.
//
// A rebalance pass is level-triggered: it re-reads current state every time
// it runs. A wait only decides WHEN the next pass runs. The rule every wait
// here keeps (client-go workqueue / CockroachDB purgatory: a waiting key is
// parked until a named event, never re-queued by its own run):
//
//  - A wait is ended only by its named clearing event, delivered from
//    outside the pass that armed it. Arming never resolves a wait by
//    re-reading the verdict the pass just decided on.
//  - A wait is armed against the generation (or listener) of the
//    observation the pass decided on, so an event that landed between that
//    observation and the arm is decided by generation comparison.
//  - A woken check runs at the cadence floor, except the planning-target
//    wait: one readiness-planning publication permits at most one
//    floor-skipping pass per rebalancer (PlanningPublicationCursor).
//  - Every wait has a declared bound (R13): the entity's scheduled cadence
//    check, which every deferring gate and no-move pass leaves armed, or the
//    admission clearance's own budget timer. No timer is a "fallback".
//
// The membership publication owner's recovery wait
// (control-plane/membership-publication-owner-recovery-wait.js) states the
// same contract without a listener; were it to take one, it would consume
// RebalancerWake from a workflow-level home rather than copy it.
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';

const REBALANCER_WAKE_STATE = Object.freeze({
  LOCAL_MUTATION_READINESS_DEFERRED: 'local_mutation_readiness_deferred',
  PLANNING_TARGET_READINESS_DEFERRED: 'planning_target_readiness_deferred',
  OPERATION_CREATION_ADMISSION_DEFERRED:
    'operation_creation_admission_deferred',
  OPERATION_LIST_READ_DEFERRED: 'operation_list_read_deferred',
});

const REBALANCER_WAKE_CLEARING_EVENT = Object.freeze({
  // A cache change of control_plane_publications or replica_operations, or
  // this node's planning publication, after which the local mutation
  // readiness blocker reads clear.
  LOCAL_MUTATION_SOURCE_CHANGED: 'local_mutation_source_changed',
  // The readiness planning owner's publication for an awaited node, newer
  // than the generation the deferred read was observed at.
  PLANNING_PUBLICATION: 'readiness_planning_publication',
  // What the admission owner names for the denial
  // (operation-creation-admission-clearance.js).
  ADMISSION_CLEARANCE: 'operation_creation_admission_clearance',
  // A cache change of replica_operations or a table its route resolves from.
  OPERATION_LIST_SOURCE_CHANGED: 'operation_list_source_changed',
});

const REBALANCER_WAKE_BOUND = Object.freeze({
  // The scheduled cadence check the deferring gate or no-move pass leaves.
  CADENCE_CHECK: 'cadence_check',
  // The clearance wait's budget timer (the entity's current interval).
  CLEARANCE_BUDGET: 'clearance_budget',
});

const REBALANCER_WAKE_ARMED_AGAINST = Object.freeze({
  // The listener attached in the same synchronous step as the gate's read.
  ARMING_STEP: 'arming_step',
  // The planning publication generation of the deferred read.
  PLANNING_PUBLICATION_GENERATION: 'planning_publication_generation',
  // The denial's captured identity and route source versions.
  DENIAL_CAPTURE: 'denial_capture',
});

function freezeContract(contract) {
  return Object.freeze(contract);
}

const REBALANCER_WAKE_CONTRACT = Object.freeze({
  [REBALANCER_WAKE_STATE.LOCAL_MUTATION_READINESS_DEFERRED]: freezeContract({
    clearingEvent: REBALANCER_WAKE_CLEARING_EVENT.LOCAL_MUTATION_SOURCE_CHANGED,
    armedAgainst: REBALANCER_WAKE_ARMED_AGAINST.ARMING_STEP,
    floorSkipsPerEvent: 0,
    bound: REBALANCER_WAKE_BOUND.CADENCE_CHECK,
    reconcileReason: RECONCILE_REASON.LOCAL_MUTATION_READINESS_WAKE,
  }),
  [REBALANCER_WAKE_STATE.PLANNING_TARGET_READINESS_DEFERRED]: freezeContract({
    clearingEvent: REBALANCER_WAKE_CLEARING_EVENT.PLANNING_PUBLICATION,
    armedAgainst:
      REBALANCER_WAKE_ARMED_AGAINST.PLANNING_PUBLICATION_GENERATION,
    floorSkipsPerEvent: 1,
    bound: REBALANCER_WAKE_BOUND.CADENCE_CHECK,
    reconcileReason: RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED,
  }),
  [REBALANCER_WAKE_STATE.OPERATION_CREATION_ADMISSION_DEFERRED]:
    freezeContract({
      clearingEvent: REBALANCER_WAKE_CLEARING_EVENT.ADMISSION_CLEARANCE,
      armedAgainst: REBALANCER_WAKE_ARMED_AGAINST.DENIAL_CAPTURE,
      floorSkipsPerEvent: 0,
      bound: REBALANCER_WAKE_BOUND.CLEARANCE_BUDGET,
      reconcileReason: RECONCILE_REASON.OPERATION_CREATION_ADMISSION_CLEARED,
    }),
  [REBALANCER_WAKE_STATE.OPERATION_LIST_READ_DEFERRED]: freezeContract({
    clearingEvent: REBALANCER_WAKE_CLEARING_EVENT.OPERATION_LIST_SOURCE_CHANGED,
    armedAgainst: REBALANCER_WAKE_ARMED_AGAINST.ARMING_STEP,
    floorSkipsPerEvent: 0,
    bound: REBALANCER_WAKE_BOUND.CADENCE_CHECK,
    reconcileReason: RECONCILE_REASON.OPERATION_LIST_READ_SOURCE_CHANGED,
  }),
});

// A read made before this rebalancer's publication cursor was attached has
// no publication generation; its wait is armed against the generation at
// attach, and a publication between that read and the attach is left to
// the wait's bound.
const PLANNING_PUBLICATION_UNOBSERVED = null;

function detachNothing() {}

/**
 * One named wait of one rebalancer: armed once, ended once by its clearing
 * event (fire) or by disarm, and enqueueing one check only while the entity
 * leads.
 */
class RebalancerWake {
  /**
   * @param {Object} rebalancer the owning entity
   * @param {string} state a REBALANCER_WAKE_STATE member
   * @param {Function} attach (context, fire, end) => detach|null; attaches
   *   the clearing-event listener. fire(beforeEnqueue?) and end() act only
   *   on the arming that handed them out, so a late answer of a released
   *   arming never fires or ends a newer one.
   */
  constructor(rebalancer, state, attach) {
    this.rebalancer = rebalancer;
    this.state = state;
    this.contract = REBALANCER_WAKE_CONTRACT[state];
    this.attach = attach;
    this.arming = null;
    this.detach = null;
  }

  get armed() {
    return this.arming !== null;
  }

  arm(context = null) {
    if (this.arming !== null) return true;
    const arming = Object.freeze({state: this.state});
    this.arming = arming;
    const detach = this.attach(
      context,
      (beforeEnqueue = null) =>
        this.arming === arming && this.fire(beforeEnqueue),
      () => {
        if (this.arming === arming) this.disarm();
      },
    ) || detachNothing;
    if (this.arming === arming) {
      this.detach = detach;
    } else {
      detach();
    }
    return true;
  }

  disarm() {
    const detach = this.detach;
    this.arming = null;
    this.detach = null;
    if (detach !== null) detach();
  }

  /**
   * The clearing event: disarm, then enqueue the one check this wait owes.
   * @param {Function|null} [beforeEnqueue] runs only when the check is owed
   * @return {boolean} whether a check was enqueued
   */
  fire(beforeEnqueue = null) {
    if (!this.armed) return false;
    this.disarm();
    const rebalancer = this.rebalancer;
    if (!rebalancer.isLeader || rebalancer.isShuttingDown) return false;
    if (beforeEnqueue !== null) beforeEnqueue();
    return rebalancer.enqueueRebalanceCheck(this.contract.reconcileReason);
  }

  describe() {
    return Object.freeze({
      state: this.state,
      armed: this.armed,
      clearingEvent: this.contract.clearingEvent,
      bound: this.contract.bound,
    });
  }
}

/**
 * This rebalancer's position in the readiness planning owner's publication
 * stream: one subscription for the leadership, a generation that advances
 * once per publication, the generation of each owner key's last publication,
 * and the one floor skip each publication generation may grant.
 */
class PlanningPublicationCursor {
  constructor(rebalancer, onPublication) {
    this.rebalancer = rebalancer;
    this.onPublication = onPublication;
    this.generation = 0;
    this.generationByOwnerKey = new Map();
    this.unsubscribe = null;
    this.grantedFloorSkipGeneration = PLANNING_PUBLICATION_UNOBSERVED;
    this.consumedFloorSkipGeneration = 0;
  }

  get attached() {
    return this.unsubscribe !== null;
  }

  attach() {
    if (this.unsubscribe === null) {
      this.unsubscribe = this.rebalancer.controlPlaneReadinessService
        .subscribeReadinessPlanningSnapshots((event) =>
          this.record(event.ownerKey));
    }
    return this.generation;
  }

  record(ownerKey) {
    this.generation += 1;
    this.generationByOwnerKey.set(ownerKey, this.generation);
    this.onPublication(ownerKey, this.generation);
  }

  read() {
    return this.attached ? this.generation : PLANNING_PUBLICATION_UNOBSERVED;
  }

  /**
   * The newest publication generation among the awaited keys that is newer
   * than the generation each was armed against, or UNOBSERVED.
   * @param {Map<string, number>} armedAgainstByOwnerKey
   * @return {number|null}
   */
  publishedSince(armedAgainstByOwnerKey) {
    let newest = PLANNING_PUBLICATION_UNOBSERVED;
    for (const [ownerKey, armedAgainst] of armedAgainstByOwnerKey) {
      const published = this.generationByOwnerKey.get(ownerKey);
      if (published > armedAgainst &&
          (newest === PLANNING_PUBLICATION_UNOBSERVED || published > newest)) {
        newest = published;
      }
    }
    return newest;
  }

  grantFloorSkip(generation) {
    if (generation > this.consumedFloorSkipGeneration) {
      this.grantedFloorSkipGeneration = generation;
    }
  }

  consumeFloorSkip() {
    const granted = this.grantedFloorSkipGeneration;
    if (granted === PLANNING_PUBLICATION_UNOBSERVED) return false;
    this.grantedFloorSkipGeneration = PLANNING_PUBLICATION_UNOBSERVED;
    this.consumedFloorSkipGeneration = granted;
    return true;
  }

  release() {
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = null;
    this.generationByOwnerKey.clear();
    this.grantedFloorSkipGeneration = PLANNING_PUBLICATION_UNOBSERVED;
    if (unsubscribe !== null) unsubscribe();
  }
}

export {
  PLANNING_PUBLICATION_UNOBSERVED,
  PlanningPublicationCursor,
  REBALANCER_WAKE_CONTRACT,
  REBALANCER_WAKE_STATE,
  RebalancerWake,
};
