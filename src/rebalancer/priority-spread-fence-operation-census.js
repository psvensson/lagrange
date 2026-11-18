// The release fence's authoritative operation census: the operation ledger
// owner's cluster-wide list of non-terminal operations
// (queryClusterWideIncompleteOperations, strict owner read), taken at most
// one at a time per coordinator and kept with the instant it answered.
//
// The fence reads its blocking operations from the cache projection, which
// can lag a committed row or miss one; an empty or lagging projection read
// CLEAR and the fence opened. The projection may still HOLD the fence (an
// operation it shows is in flight), but CLEAR needs the owner: a census that
// answered within the fence's stability window and holds no fence-blocking
// operation. Otherwise the fence observation is UNAVAILABLE, which holds the
// fence without restarting the dwell, and a census is requested.
//
// What re-asks: an answered census whose content changed enqueues one check
// of every rebalancer that requested it (the event that clears the wait). A failed census wakes
// nobody (no retry loop); the next evaluation, on the rebalancer's cadence
// or any fence wake, requests again. What breaks the recovery cycle: the
// fence holds ordinary work only; priority partitions, whose recovery
// restores the owner lane, never defer on it.
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';

const FENCE_OPERATION_CENSUS_STATE = Object.freeze({
  ANSWERED: 'answered',
  UNANSWERED: 'unanswered',
});

// The identity of a census answer: its operations and their steps.
function censusIdentityOf(operations) {
  if (operations === null) {
    return null;
  }
  return JSON.stringify(operations.map((operation) =>
    [operation.operationId, operation.workflowStep]).sort());
}

function ownerOf(rebalancer) {
  return rebalancer.rebalanceCoordinator;
}

/**
 * The census as of `observedAt`: ANSWERED with its operations when the
 * owner answered no earlier than `maximumAgeMs` before; else UNANSWERED.
 * @param {Object} rebalancer
 * @param {number} observedAt
 * @param {number} maximumAgeMs
 * @return {{state: string, operations: Array<Object>, answeredAtMs: (number|null)}}
 */
function readFenceOperationCensus(rebalancer, observedAt, maximumAgeMs) {
  const census = ownerOf(rebalancer).prioritySpreadFenceCensus || null;
  if (census && observedAt - census.answeredAtMs <= maximumAgeMs) {
    return Object.freeze({
      state: FENCE_OPERATION_CENSUS_STATE.ANSWERED,
      operations: census.operations,
      answeredAtMs: census.answeredAtMs,
    });
  }
  return Object.freeze({
    state: FENCE_OPERATION_CENSUS_STATE.UNANSWERED,
    operations: Object.freeze([]),
    answeredAtMs: census ? census.answeredAtMs : null,
  });
}

/**
 * Request one census; a request while one is in flight joins it. An answer
 * enqueues one check of each requesting rebalancer held on it, and of the
 * others when its content changed.
 * @param {Object} rebalancer
 * @param {{held: boolean}} [options] - held: the fence holds UNAVAILABLE
 *   until this census answers.
 * @return {void}
 */
function requestFenceOperationCensus(rebalancer, {held = false} = {}) {
  const owner = ownerOf(rebalancer);
  const waiting = owner.prioritySpreadFenceCensusWaiters || new Map();
  owner.prioritySpreadFenceCensusWaiters = waiting;
  waiting.set(rebalancer, held || waiting.get(rebalancer) === true);
  if (owner.prioritySpreadFenceCensusInFlight) {
    return;
  }
  owner.prioritySpreadFenceCensusInFlight = true;
  owner.repository.queryClusterWideIncompleteOperations().then(
    (operations) => {
      const changed = censusIdentityOf(operations) !==
        censusIdentityOf(owner.prioritySpreadFenceCensus?.operations || null);
      owner.prioritySpreadFenceCensus = Object.freeze({
        operations: Object.freeze([...operations]),
        answeredAtMs: rebalancer.nowFn(),
      });
      owner.prioritySpreadFenceCensusInFlight = false;
      owner.prioritySpreadFenceCensusWaiters = new Map();
      // A waiter held on an unanswered census is always woken; otherwise an
      // unchanged answer wakes nobody (a census re-asked while the
      // projection lags would else become a read loop).
      for (const [waiter, held] of waiting) {
        if ((changed || held) && waiter.isLeader && !waiter.isShuttingDown) {
          waiter.enqueueRebalanceCheck(
            RECONCILE_REASON.PRIORITY_SPREAD_FENCE_CENSUS_ANSWERED);
        }
      }
    },
    (error) => {
      // Recorded, never read as an empty census.
      owner.prioritySpreadFenceCensusInFlight = false;
      owner.prioritySpreadFenceCensusWaiters = new Map();
      owner.lastPrioritySpreadFenceCensusError = error;
    },
  );
}

export {
  FENCE_OPERATION_CENSUS_STATE,
  readFenceOperationCensus,
  requestFenceOperationCensus,
};
