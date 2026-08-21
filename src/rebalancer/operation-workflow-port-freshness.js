/**
 * Lease-freshness and publication-fence resolution for the operation
 * workflow owner ports (verified-audit findings 15+18, quest
 * operation-progress-store-persistence).
 *
 * Before this change the owner ports hard-coded both evidence facets as
 * CURRENT regardless of the durable row: a lease the row said was
 * EXPIRED still read owner_lease_current, and a workflow whose persisted
 * transition mirror had been lost (the bare-coordinator no-op persist —
 * finding 15) still read publication_fence_current. Both now derive from
 * durable evidence:
 *
 *  - LEASE FRESHNESS: the Q9 durable owner lease
 *    (replica-operation-owner-lease.js, lease_expires_at on the row).
 *    An ACTIVE lease is CURRENT; an EXPIRED lease is STALE; a row with
 *    no lease stamp is UNAVAILABLE (unfenced is not freshness
 *    evidence, and the port never claims freshness it cannot prove).
 *  - PUBLICATION FENCE: the coordinator's persisted transition-history
 *    witness (wired by operation-workflow-persistence.js) against the
 *    durable row's steps_history mirror — over the DURABLE BASIS the
 *    witness was recovered from. The witness legitimately runs ahead of
 *    the row (in-memory transitions whose own repository persist lands
 *    after the coordinator mirror), so only what the row already mirrors
 *    of the witness's basis must agree: a basis prefix that matches is
 *    CURRENT; a divergence (a rewound witness, or a row mirroring steps
 *    beyond the witness's basis) is STALE; no persisted witness against
 *    a row that already carries history is INCOMPLETE.
 */

import {
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
} from './operation-workflow-owner-constants.js';
import {
  REPLICA_OPERATION_OWNER_LEASE_STATE,
  resolveOperationOwnerLeaseState,
} from './replica-operation-owner-lease.js';
import {
  readOperationWorkflowDurableStepsHistory,
} from './operation-workflow-persistence.js';
import {
  WORKFLOW_TRANSITION_FIELD,
} from '../workflow/workflow-constants.js';

const OPERATION_WORKFLOW_PORT_FRESHNESS_EMPTY_HISTORY_LENGTH = 0;

/**
 * Resolve the owner-lease freshness from the durable row lease — never a
 * hard-coded CURRENT.
 * @param {Object} operation
 * @param {number} [nowMs]
 * @return {string} One of OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.
 */
function resolveOperationWorkflowOwnerLeaseFreshnessState(
  operation,
  nowMs,
) {
  const lease = resolveOperationOwnerLeaseState(operation, nowMs);
  if (lease.state === REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE) {
    return OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.CURRENT;
  }
  if (lease.state === REPLICA_OPERATION_OWNER_LEASE_STATE.EXPIRED) {
    return OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.STALE;
  }
  return OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.UNAVAILABLE;
}

function resolveTransitionStep(entry) {
  return entry?.[WORKFLOW_TRANSITION_FIELD.NEXT_STEP] ?? null;
}

function normalizeDurableBasisStepCount(workflow) {
  return Number.isFinite(workflow?.durableBasisStepCount) ?
    Math.max(
      OPERATION_WORKFLOW_PORT_FRESHNESS_EMPTY_HISTORY_LENGTH,
      Math.floor(workflow.durableBasisStepCount),
    ) :
    OPERATION_WORKFLOW_PORT_FRESHNESS_EMPTY_HISTORY_LENGTH;
}

/**
 * Whether the mirrored basis prefix diverges: any step the durable row
 * already mirrors (within the witness's basis) disagreeing with the
 * witness's own persisted history.
 * @return {boolean}
 */
function basisPrefixDiverges(persistedHistory, durableHistory, basisCount) {
  const comparedPrefixLength = Math.min(
    durableHistory.length,
    basisCount,
    persistedHistory.length,
  );
  for (
    let index = OPERATION_WORKFLOW_PORT_FRESHNESS_EMPTY_HISTORY_LENGTH;
    index < comparedPrefixLength;
    index += 1
  ) {
    if (resolveTransitionStep(persistedHistory[index]) !==
        (durableHistory[index]?.step ?? null)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the durable row mirrors steps the witness never persisted AND
 * the witness's own basis confirms those steps were never recovered —
 * the row and the witness disagree about history the witness basis never
 * covered. (A row merely mirroring the in-memory operation's newer steps
 * is the durable store running AHEAD of the witness, which the CURRENT
 * leg tolerates: the witness basis is satisfied.)
 * @return {boolean}
 */
function durableRowDisagreesBeyondBasis(
  persistedStepCount,
  durableStepCount,
  durableBasisStepCount,
) {
  return durableStepCount > persistedStepCount &&
    durableBasisStepCount > persistedStepCount;
}

/**
 * Resolve the publication-fence state by comparing the coordinator's
 * persisted transition-history witness against the durable row's
 * steps_history mirror — over the DURABLE BASIS the witness was
 * recovered from. Three legs:
 *
 *  - INCOMPLETE: no persisted witness at all against a row that already
 *    carries history (the store simply has nothing to compare).
 *  - STALE: the witness is rewound below its own durable basis, or the
 *    durable row mirrors steps beyond the witness's basis, or the
 *    mirrored basis prefix DIVERGES — the witness disagrees with the
 *    durable row about history that is already persisted.
 *  - CURRENT: everything the durable row mirrors matches the witness
 *    prefix (the row may legitimately lag the witness — in-memory
 *    transitions whose own repository persist lands after the
 *    coordinator mirror — and the witness may extend past an empty
 *    mirror, which is a persisted basis, not a divergence).
 *
 * @param {Object} operation - The durable operation record.
 * @param {Object|null} workflow - The coordinator workflow record (or
 *   null when the store has never seen this operation).
 * @return {string} One of OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.
 */
function resolveOperationWorkflowPublicationFenceState(
  operation,
  workflow,
) {
  const persistedHistory = Array.isArray(workflow?.transitionHistory) ?
    workflow.transitionHistory :
    [];
  const durableHistory = readOperationWorkflowDurableStepsHistory(operation);
  const persistedStepCount = persistedHistory.length;
  const durableStepCount = durableHistory.length;
  const durableBasisStepCount = normalizeDurableBasisStepCount(workflow);
  if (
    persistedStepCount ===
    OPERATION_WORKFLOW_PORT_FRESHNESS_EMPTY_HISTORY_LENGTH
  ) {
    return durableStepCount ===
        OPERATION_WORKFLOW_PORT_FRESHNESS_EMPTY_HISTORY_LENGTH ?
      OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT :
      OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.INCOMPLETE;
  }
  if (persistedStepCount < durableBasisStepCount) {
    // The witness is rewound below its own durable basis — the one
    // shape that is always a stale witness.
    return OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.STALE;
  }
  if (
    basisPrefixDiverges(
      persistedHistory,
      durableHistory,
      durableBasisStepCount,
    )
  ) {
    return OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.STALE;
  }
  if (
    durableRowDisagreesBeyondBasis(
      persistedStepCount,
      durableStepCount,
      durableBasisStepCount,
    )
  ) {
    return OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.STALE;
  }
  return OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT;
}

export {
  resolveOperationWorkflowOwnerLeaseFreshnessState,
  resolveOperationWorkflowPublicationFenceState,
};
