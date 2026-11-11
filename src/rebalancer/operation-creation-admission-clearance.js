// The one wait a consumer of the operation-creation admission owner takes
// between a TRANSIENT_REENTER denial and its re-entry. The owner names what
// clears each transient reason (OPERATION_CREATION_ADMISSION_CLEARANCE in
// rebalance-coordinator-operation-creation-admission.js); this module waits
// for exactly those events:
//
//  - IMMEDIATE: nothing to wait for; re-entry starts from the identity the
//    denial captured.
//  - PLANNING_IDENTITY_CURRENT: woken by a planning-snapshot publication for
//    the target node key (the readiness owner's subscription seam, the same
//    one the rebalancer's planning-target wake uses) and by a deferred cache
//    change (the delivery the planning owner classifies the pending source
//    change on); cleared when the node's planning identity reads CURRENT.
//  - REPLICA_OPERATION_ROUTE_SOURCE_CHANGED: woken by a deferred cache change
//    of a table replica_operations routing is resolved from; cleared when
//    one of those tables changed since the denial, or (for a denial taken by
//    the sync route resolution) when the route resolves now.
//
// Lost wake: the listeners are attached first and the condition re-checked
// after, so a change landing between the denial and the subscription is
// seen by the re-check (route source versions are captured with the denial).
// Every wait is bounded by the caller's remaining budget and ended by its
// cancellation token. Without a budget there is no bound to wait under, and
// a denial that needs an event is answered UNBOUNDED at once. The owner
// ports (planning identity, route observation, readiness subscription,
// cache change channel) are called directly; a composition without them
// cannot wait on these events and fails loudly. No timer ever
// ends a wait as cleared: the only timer is the budget, which ends it spent.
import {isPlanningIdentityCurrent} from
  '../control-plane/readiness-planning-semantic-generation.js';
import {
  OPERATION_CREATION_ADMISSION_CLEARANCE,
  REPLICA_OPERATION_ROUTE_OBSERVATION_ORIGIN,
  REPLICA_OPERATION_ROUTE_SOURCE_TABLES,
  captureReplicaOperationRouteSourceVersions,
  resolveOperationCreationAdmissionClearances,
} from './rebalance-coordinator-operation-creation-admission.js';

const OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME = Object.freeze({
  CLEARED: 'cleared',
  BUDGET_SPENT: 'budget_spent',
  CANCELLED: 'cancelled',
  // An event is needed and the caller gave no budget to wait under.
  UNBOUNDED: 'unbounded',
});

const ROUTE_SOURCE_TABLE_SET = Object.freeze(
  new Set(REPLICA_OPERATION_ROUTE_SOURCE_TABLES));

function haveRouteSourcesChanged(coordinator, deniedVersions) {
  const currentVersions = captureReplicaOperationRouteSourceVersions(
    coordinator.systemTableCache);
  return REPLICA_OPERATION_ROUTE_SOURCE_TABLES.some((tableName) =>
    currentVersions[tableName] !== deniedVersions[tableName]);
}

function isRouteCleared(coordinator, routeObservation) {
  if (haveRouteSourcesChanged(coordinator, routeObservation.sourceVersions)) {
    return true;
  }
  return routeObservation.origin ===
      REPLICA_OPERATION_ROUTE_OBSERVATION_ORIGIN.ROUTE_RESOLUTION &&
    coordinator.observeReplicaOperationMutationRoute().allowed === true;
}

const CLEARANCE_CHECK = Object.freeze({
  [OPERATION_CREATION_ADMISSION_CLEARANCE.PLANNING_IDENTITY_CURRENT]:
    (coordinator, denial, nodeId) => isPlanningIdentityCurrent(
      coordinator.captureOperationCreationPlanningIdentity(nodeId)),
  [OPERATION_CREATION_ADMISSION_CLEARANCE
    .REPLICA_OPERATION_ROUTE_SOURCE_CHANGED]:
    (coordinator, denial) => isRouteCleared(coordinator,
      denial.routeObservation),
});

// Attach the wake listeners the pending clearances need; returns the
// detach functions.
function attachClearanceWakes(coordinator, pending, nodeId, onWake) {
  const detach = [];
  const cache = coordinator.systemTableCache;
  const waitsForIdentity = pending.includes(
    OPERATION_CREATION_ADMISSION_CLEARANCE.PLANNING_IDENTITY_CURRENT);
  if (waitsForIdentity) {
    detach.push(coordinator.controlPlaneReadinessService
      .subscribeReadinessPlanningSnapshots((event) => {
        if (event.ownerKey === nodeId) onWake();
      }));
  }
  const listener = (tableName) => {
    if (waitsForIdentity || ROUTE_SOURCE_TABLE_SET.has(tableName)) onWake();
  };
  cache.onCacheChange(listener);
  detach.push(() => cache.offCacheChange(listener));
  return detach;
}

/**
 * Wait until what the admission owner names as clearing a transient denial
 * has happened, bounded by the caller's budget and cancellation.
 * @param {Object} coordinator the admission owner (rebalance coordinator)
 * @param {Object} denial a TRANSIENT_REENTER observation or re-entry error
 * @param {Object} options
 * @param {string} options.nodeId the target node the denial was about
 * @param {number|null} options.remainingBudgetMs null when unbudgeted
 * @param {Object|null} [options.cancellationToken]
 * @return {Promise<{outcome: string, clearances: Array<string>}>}
 */
function awaitOperationCreationAdmissionClearance(
  coordinator,
  denial,
  options,
) {
  const clearances = resolveOperationCreationAdmissionClearances(denial);
  const pending = clearances.filter((clearance) =>
    clearance !== OPERATION_CREATION_ADMISSION_CLEARANCE.IMMEDIATE);
  const answer = (outcome) => Object.freeze({outcome, clearances});
  if (pending.length === 0) {
    return Promise.resolve(
      answer(OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME.CLEARED));
  }
  const remainingBudgetMs = options.remainingBudgetMs;
  if (!Number.isFinite(remainingBudgetMs)) {
    return Promise.resolve(
      answer(OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME.UNBOUNDED));
  }
  const isCleared = () => pending.every((clearance) =>
    CLEARANCE_CHECK[clearance](coordinator, denial, options.nodeId));
  return new Promise((resolve) => {
    const detach = [];
    let done = false;
    const finish = (outcome) => {
      if (done) return;
      done = true;
      for (const off of detach) off();
      resolve(answer(outcome));
    };
    const onWake = () => {
      if (isCleared()) {
        finish(OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME.CLEARED);
      }
    };
    detach.push(...attachClearanceWakes(coordinator, pending,
      options.nodeId, onWake));
    const timer = setTimeout(() => finish(
      OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME.BUDGET_SPENT),
    Math.max(0, remainingBudgetMs));
    detach.push(() => clearTimeout(timer));
    if (options.cancellationToken) {
      detach.push(options.cancellationToken.onCancel(() =>
        finish(OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME.CANCELLED)));
    }
    // Subscribed first, re-checked after: a clearance that landed before
    // the listeners were attached is not lost.
    onWake();
  });
}

export {
  OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME,
  awaitOperationCreationAdmissionClearance,
};
