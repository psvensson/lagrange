import {TABLES} from '../constants/tables.js';
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
import {REPLICA_OPERATION_ROUTE_SOURCE_TABLES} from
  './rebalance-coordinator-operation-creation-admission.js';
import {
  PLANNING_PUBLICATION_UNOBSERVED,
  PlanningPublicationCursor,
  REBALANCER_WAKE_STATE,
  RebalancerWake,
} from './rebalancer-wake.js';

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
// The rows whose change can end an unanswered replica_operations list read:
// the ledger rows themselves, and the tables the owner route is resolved
// from (a route that comes back is what lets the owner answer).
const OPERATION_LIST_READ_WAKE_TABLES = Object.freeze(new Set([
  TABLES.REPLICA_OPERATIONS,
  ...REPLICA_OPERATION_ROUTE_SOURCE_TABLES,
]));

function attachCacheTables(rebalancer, tables, onChange) {
  const cache = rebalancer.systemTableCache;
  const listener = (tableName) => {
    if (tables.has(tableName)) onChange();
  };
  cache.onCacheChange(listener);
  return () => cache.offCacheChange(listener);
}

// LOCAL_MUTATION_READINESS_DEFERRED: the same cache seam the priority
// recovery visibility listener uses, plus this node's own planning
// publication. Evaluations coalesce to one per event burst (a microtask),
// and the wait fires only when the blocker the gate deferred on reads clear.
function attachLocalMutationReadinessWake(rebalancer, fire) {
  let evaluationPending = false;
  const evaluate = () => {
    if (evaluationPending) return;
    evaluationPending = true;
    queueMicrotask(() => {
      evaluationPending = false;
      rebalancer.resolveLocalMutationReadinessWake(fire);
    });
  };
  const detachCache = attachCacheTables(rebalancer,
    LOCAL_MUTATION_READINESS_WAKE_TABLES, evaluate);
  const unsubscribe = rebalancer.controlPlaneReadinessService
    .subscribeReadinessPlanningSnapshots((event) => {
      if (event.ownerKey === rebalancer.nodeId) evaluate();
    });
  return () => {
    detachCache();
    unsubscribe();
  };
}

// OPERATION_CREATION_ADMISSION_DEFERRED: the admission owner's own wait
// for what clears the denial, under the clearance budget and a token.
function attachOperationCreationAdmissionWake(rebalancer, context, fire, end) {
  const token = new CancellationToken();
  awaitOperationCreationAdmissionClearance(rebalancer.rebalanceCoordinator,
    context.error, {
      nodeId: context.nodeId,
      remainingBudgetMs: rebalancer.currentInterval,
      cancellationToken: token,
    }).then(({outcome}) => {
    rebalancer.lastOperationCreationAdmissionWakeOutcome = outcome;
    if (outcome === OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME.CLEARED) {
      fire();
      return;
    }
    // BUDGET_SPENT / CANCELLED / UNBOUNDED: the wait ended at its bound or
    // was released; the scheduled cadence check re-runs the pass.
    end();
  }, (waitError) => {
    // Recorded, never swallowed: the wait ends; the cadence check re-runs.
    rebalancer.lastOperationCreationAdmissionWakeError = waitError;
    end();
  });
  return () => token.cancel(OPERATION_CREATION_ADMISSION_WAKE_DISARMED);
}

const WAKE_ATTACH = Object.freeze({
  [REBALANCER_WAKE_STATE.LOCAL_MUTATION_READINESS_DEFERRED]:
    (rebalancer, _context, fire) =>
      attachLocalMutationReadinessWake(rebalancer, fire),
  // The cursor holds the one planning subscription for the leadership.
  [REBALANCER_WAKE_STATE.PLANNING_TARGET_READINESS_DEFERRED]: () => null,
  [REBALANCER_WAKE_STATE.OPERATION_CREATION_ADMISSION_DEFERRED]:
    attachOperationCreationAdmissionWake,
  [REBALANCER_WAKE_STATE.OPERATION_LIST_READ_DEFERRED]:
    (rebalancer, _context, fire) =>
      attachCacheTables(rebalancer, OPERATION_LIST_READ_WAKE_TABLES, fire),
});

/**
 * The rebalancer's four named waits (rebalancer-wake.js holds the contract
 * table: clearing event, what each is armed against, floor skips per event,
 * bound). Each is ended by its clearing event, delivered from outside the
 * pass that armed it; none resolves itself at arm by re-reading a verdict.
 */
const REBALANCER_LOCAL_MUTATION_READINESS_WAKE_METHODS = {
  getRebalancerWake(state) {
    if (!this.rebalancerWakes) this.rebalancerWakes = new Map();
    let wake = this.rebalancerWakes.get(state);
    if (!wake) {
      const attach = WAKE_ATTACH[state];
      wake = new RebalancerWake(this, state,
        (context, fire, end) => attach(this, context, fire, end));
      this.rebalancerWakes.set(state, wake);
    }
    return wake;
  },

  getPlanningPublicationCursor() {
    if (!this.planningPublicationCursor) {
      this.planningPublicationCursor = new PlanningPublicationCursor(this,
        (ownerKey, generation) =>
          this.notePlanningPublication(ownerKey, generation));
    }
    return this.planningPublicationCursor;
  },

  /**
   * The planning publication generation a readiness read is observed at:
   * read before (or in the same synchronous step as) the read; publications
   * are delivered only from the planning owner's queued builds.
   * @return {number|null} UNOBSERVED before the cursor is attached
   */
  readPlanningPublicationGeneration() {
    return this.planningPublicationCursor ?
      this.planningPublicationCursor.read() :
      PLANNING_PUBLICATION_UNOBSERVED;
  },

  // Arms the local mutation wait while the gate defers and disarms it once
  // it does not; returns whether the gate defers.
  syncLocalMutationReadinessWake(shouldDefer) {
    const wake = this.getRebalancerWake(
      REBALANCER_WAKE_STATE.LOCAL_MUTATION_READINESS_DEFERRED);
    if (shouldDefer === true) {
      wake.arm();
      return true;
    }
    wake.disarm();
    return false;
  },

  disarmLocalMutationReadinessWake() {
    this.getRebalancerWake(
      REBALANCER_WAKE_STATE.LOCAL_MUTATION_READINESS_DEFERRED).disarm();
  },

  /**
   * A local-mutation clearing event was delivered: fire once the blocker the
   * gate deferred on reads clear. A woken check resets the backed-off
   * interval but runs at the cadence floor (no floor skip).
   * @param {Function} fire the wait's fire
   * @return {boolean} whether a check was enqueued
   */
  resolveLocalMutationReadinessWake(fire) {
    if (this.isLeader && !this.isShuttingDown &&
        this.getLocalControlPlaneMutationReadinessBlocker()) {
      return false;
    }
    return fire(() => {
      this.currentInterval = this.periodicCheckIntervalMs;
    });
  },

  /**
   * Named wait PLANNING_TARGET_READINESS_DEFERRED: an answer of this pass
   * rested on a candidate whose planning readiness read was DEFERRED. The
   * wait is armed against the publication generation that read was observed
   * at, never by re-reading the verdict: a publication for an awaited node
   * newer than that generation (already landed, or the next one) fires it
   * once and grants one floor-skipping pass for that publication.
   * @param {Array<string>} nodeIds the deferred candidates
   * @param {number|null} observedGeneration the read's publication generation
   * @return {boolean} whether the wait is armed
   */
  armPlanningTargetReadinessWake(nodeIds, observedGeneration) {
    // Only a leader waits: the cursor's lifetime is the leadership.
    if (nodeIds.length === 0 || !this.isLeader || this.isShuttingDown) {
      return false;
    }
    const cursor = this.getPlanningPublicationCursor();
    const attachGeneration = cursor.attach();
    const armedAgainst =
      observedGeneration === PLANNING_PUBLICATION_UNOBSERVED ?
        attachGeneration :
        observedGeneration;
    const awaited = this.planningTargetReadinessAwaited || new Map();
    for (const nodeId of nodeIds) {
      const previous = awaited.get(nodeId);
      awaited.set(nodeId, previous === undefined ? armedAgainst :
        Math.min(previous, armedAgainst));
    }
    this.planningTargetReadinessAwaited = awaited;
    this.getRebalancerWake(
      REBALANCER_WAKE_STATE.PLANNING_TARGET_READINESS_DEFERRED).arm();
    const landed = cursor.publishedSince(awaited);
    if (landed !== PLANNING_PUBLICATION_UNOBSERVED) {
      this.resolvePlanningTargetReadinessWake(landed);
    }
    return true;
  },

  /**
   * A sync planning reader's single-node read, noted in the same synchronous
   * step as the read: a DEFERRED answer is unknown, never a final no, so the
   * node joins the awaited set.
   * @param {string} nodeId
   * @param {Object|null} readiness the read's answer
   * @return {boolean} whether the read was deferred
   */
  notePlanningTargetReadiness(nodeId, readiness) {
    if (!isDeferredReadinessPlanningSnapshot(readiness)) {
      return false;
    }
    this.armPlanningTargetReadinessWake([nodeId],
      this.readPlanningPublicationGeneration());
    return true;
  },

  /**
   * The awaited nodes of the planning-target wait, or none.
   * @return {Array<string>}
   */
  readPlanningTargetReadinessAwaitedNodeIds() {
    return [...(this.planningTargetReadinessAwaited?.keys() || [])];
  },

  /**
   * A pass placed moves on some awaited nodes: those are no longer awaited;
   * the wait is disarmed only when none remains.
   * @param {Set<string>} satisfiedNodeIds
   */
  releasePlanningTargetReadinessWakeNodes(satisfiedNodeIds) {
    const awaited = this.planningTargetReadinessAwaited;
    if (!awaited) return;
    for (const nodeId of satisfiedNodeIds) awaited.delete(nodeId);
    if (awaited.size === 0) this.disarmPlanningTargetReadinessWake();
  },

  disarmPlanningTargetReadinessWake() {
    this.planningTargetReadinessAwaited = null;
    this.getRebalancerWake(
      REBALANCER_WAKE_STATE.PLANNING_TARGET_READINESS_DEFERRED).disarm();
  },

  // The cursor's delivery of one publication to the waits that name it.
  notePlanningPublication(ownerKey, generation) {
    const armedAgainst = this.planningTargetReadinessAwaited?.get(ownerKey);
    if (armedAgainst !== undefined && generation > armedAgainst) {
      this.resolvePlanningTargetReadinessWake(generation);
    }
  },

  resolvePlanningTargetReadinessWake(generation) {
    const wake = this.getRebalancerWake(
      REBALANCER_WAKE_STATE.PLANNING_TARGET_READINESS_DEFERRED);
    this.planningTargetReadinessAwaited = null;
    return wake.fire(() =>
      this.getPlanningPublicationCursor().grantFloorSkip(generation));
  },

  /**
   * Consume the one cadence-floor exemption a planning publication grants:
   * at most one floor-skipping pass per publication generation.
   * @return {boolean}
   */
  consumePlanningTargetReadinessWakeDue() {
    return this.planningPublicationCursor ?
      this.planningPublicationCursor.consumeFloorSkip() :
      false;
  },

  /**
   * Named wait OPERATION_CREATION_ADMISSION_DEFERRED: a move's creation was
   * answered with the admission owner's own transient deferral. The wait the
   * owner names for that deferral ends it; CLEARED enqueues one check that
   * runs at the cadence floor. An IDENTITY_CHANGED denial clears at once (a
   * real changed input: the denial was decided on the identity current at
   * its end), so it permits one re-entry per denial, never ahead of the
   * floor. One wait per entity, bounded by the clearance budget (the
   * current interval) and released on disarm.
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
    return this.getRebalancerWake(
      REBALANCER_WAKE_STATE.OPERATION_CREATION_ADMISSION_DEFERRED)
      .arm({error, nodeId: move.nodeId});
  },

  disarmOperationCreationAdmissionWake() {
    this.getRebalancerWake(
      REBALANCER_WAKE_STATE.OPERATION_CREATION_ADMISSION_DEFERRED).disarm();
  },

  /**
   * Named wait OPERATION_LIST_READ_DEFERRED: a planning gate counted the
   * in-flight operations from a list read the owner did not answer
   * completely and held instead of reading the count as zero. Ended by a
   * change of the ledger rows or of a table the owner route is resolved
   * from; one check at the cadence floor; bounded by the cadence check.
   * @return {boolean} whether the wait is armed
   */
  armOperationListReadWake() {
    return this.getRebalancerWake(
      REBALANCER_WAKE_STATE.OPERATION_LIST_READ_DEFERRED).arm();
  },

  disarmOperationListReadWake() {
    this.getRebalancerWake(
      REBALANCER_WAKE_STATE.OPERATION_LIST_READ_DEFERRED).disarm();
  },

  /**
   * Leadership ended or the entity shut down: every wait and the planning
   * publication cursor are released (R13: their lifetime is the leadership).
   */
  disarmRebalancerWakes() {
    this.planningTargetReadinessAwaited = null;
    for (const wake of this.rebalancerWakes?.values() || []) wake.disarm();
    this.planningPublicationCursor?.release();
  },
};

export {REBALANCER_LOCAL_MUTATION_READINESS_WAKE_METHODS};
