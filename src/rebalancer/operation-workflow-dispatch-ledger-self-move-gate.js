import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  isDisruptiveOperationLedgerSelfMove,
} from './replica-status.js';

const {
  DISPATCH_RETRY_DELAY_MS,
  REBALANCER_SKIP_REASON,
  WORKFLOW_STEP,
} = OPERATION_WORKFLOW_OWNER_SHARED;

// The dispatch-time side of the run-20 ledger self-move interlock, owned by
// the workflow owner: a durable PENDING ledger self-move (REPLACE/REMOVE of a
// replica_operations partition) is DISPATCHED only into an idle ledger, and
// the coordinator's synchronous hold is ENGAGED at the last responsible
// moment — right before the owner claims PENDING -> SENDING and sends
// CREATE_REPLICA — never at createOperation (the creator's registered waiter
// admits dependents until the self-move is dispatch-admissible; see
// rebalance-coordinator-ledger-interlock-admission.js).
//
// The idle census is CLUSTER-WIDE and authoritative: the self-move's owner is
// its TARGET node (replica-operation-repository-row-methods.js
// resolveOperationOwnerNodeId keeps a system/priority REPLACE on the target
// from initial dispatch through source removal), while the dependents it must
// wait for are sourced by the creator; the node-scoped incomplete-operations
// read (source_node_id = ? OR target_node_id = ?) of the dispatching node
// cannot see them (GCP run 21-16-04: the target dispatched the self-move at
// 21:19:23.69 while the seed's control_plane_publications ADD was still
// CREATING). Every live ledger writer anywhere in the cluster is a contender.
const OPERATION_LEDGER_SELF_MOVE_IDLE_VISIBILITY_DEFER_REASON =
  'operation_ledger_self_move_idle_visibility_deferred';
const OPERATION_LEDGER_SELF_MOVE_WAITING_DEFER_REASON =
  'operation_ledger_self_move_waiting_for_idle_ledger';
const OPERATION_LEDGER_SELF_MOVE_HOLD_NOT_ENGAGED_MESSAGE_PREFIX =
  'operation-ledger self-move hold not engaged: ';
const OPERATION_LEDGER_SELF_MOVE_WAITING_MESSAGE_PREFIX =
  'operation-ledger self-move waiting for incumbent operation ';
const OPERATION_LEDGER_SELF_MOVE_VISIBILITY_UNAVAILABLE_MESSAGE =
  'authoritative operation-ledger visibility unavailable';
const LOCAL_STR_FUNCTION = 'function';

// Typed outcome of the coordinator's engagement point on the dispatching
// owner's PENDING -> SENDING claim (produced by
// rebalance-coordinator-ledger-interlock-hold-state.js
// engageOperationLedgerSelfMoveHold, consumed here):
//   ENGAGED       — the local hold is engaged; the claim may proceed.
//   NOT_IDLE      — a dependent create is between the interlock gate and its
//                   persist on this node (IDLE_ONLY at dispatch admissibility,
//                   synchronous lane): the claim parks and retries.
//   HELD_BY_OTHER — a different self-move holds the local interlock: the
//                   claim parks (fail closed; the authoritative census above
//                   normally parks such a candidate first).
const OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT = Object.freeze({
  ENGAGED: 'engaged',
  NOT_IDLE: 'not_idle',
  HELD_BY_OTHER: 'held_by_other',
});

// Typed outcome of the claim-time engagement point as seen by the claim.
const OPERATION_LEDGER_SELF_MOVE_CLAIM_ENGAGEMENT = Object.freeze({
  PROCEED: 'proceed',
  PARKED: 'parked',
});

function isPendingOperationLedgerSelfMove(operation) {
  return (
    operation?.workflowStep === WORKFLOW_STEP.PENDING &&
    isDisruptiveOperationLedgerSelfMove(
      operation?.type,
      operation?.partitionId,
    )
  );
}

function buildOperationLedgerSelfMoveRetryError(message, retryAfterMs = null) {
  const error = new Error(message);
  error.retryAfterMs = retryAfterMs || DISPATCH_RETRY_DELAY_MS;
  error.deferRetry = true;
  return error;
}

/**
 * Re-arm a parked PENDING self-move through the canonical dispatch retry
 * lane. No local timer/flag owns fairness or abandonment. The gate's own
 * callers park through the owner's method of the same name (the single
 * observable park seam); this is its implementation.
 * @param {Object} owner
 * @param {Object} operation
 * @param {string} reason
 * @param {string} errorMessage
 * @param {Error} error
 * @return {Object}
 */
function parkOperationLedgerSelfMoveDispatch(
  owner,
  operation,
  reason,
  errorMessage,
  error,
) {
  owner.deferDispatchRetry(operation, error);
  return owner.buildSkippedOperationResult(
    REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
    operation.operationId,
    {error: errorMessage, deferReason: reason},
  );
}

/**
 * The cluster-wide authoritative census of live ledger writers.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<{incompleteOperations: Array<Object>, skip: Object|null}>}
 */
async function readOperationLedgerSelfMoveDispatchIdleCensus(owner, operation) {
  try {
    return {
      incompleteOperations:
        await owner.repository.queryClusterWideIncompleteOperations(),
      skip: null,
    };
  } catch (error) {
    const retryError = buildOperationLedgerSelfMoveRetryError(
      error?.message || OPERATION_LEDGER_SELF_MOVE_VISIBILITY_UNAVAILABLE_MESSAGE,
      error?.retryAfterMs,
    );
    return {
      incompleteOperations: [],
      skip: owner.parkOperationLedgerSelfMoveDispatch(
        operation,
        OPERATION_LEDGER_SELF_MOVE_IDLE_VISIBILITY_DEFER_REASON,
        retryError.message,
        retryError,
      ),
    };
  }
}

function findOperationLedgerSelfMoveConflict(
  owner,
  operation,
  incompleteOperations,
) {
  const nowMs = owner.timeSource?.now?.() ?? Date.now();
  return (Array.isArray(incompleteOperations) ?
    incompleteOperations : []).find((candidate) => {
    if (
      !candidate ||
      candidate.operationId === operation.operationId ||
      owner.repository.isOperationTerminal(candidate)
    ) {
      return false;
    }
    if (
      isDisruptiveOperationLedgerSelfMove(
        candidate.type,
        candidate.partitionId,
      )
    ) {
      return true;
    }
    return !owner.isConcurrentOperationStalePastStepTimeout(candidate, nowMs);
  });
}

/**
 * Keep a durable operation-ledger self-move intent parked in PENDING until
 * the cluster-wide authoritative census proves every incumbent ledger writer
 * has drained (IDLE_ONLY at dispatch admissibility). The PENDING row is itself
 * the fairness waiter once the self-move is dispatch-admissible: admission
 * sees it and prevents newer dependent operations from overtaking it, while
 * the existing owner lease/reaper and dispatch-retry lifecycle owns recovery.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object|null>} Typed skip while parked, otherwise null.
 */
async function ensureOperationLedgerSelfMoveDispatchIdleOrSkip(
  owner,
  operation,
) {
  if (!isPendingOperationLedgerSelfMove(operation)) {
    return null;
  }
  const census = await readOperationLedgerSelfMoveDispatchIdleCensus(
    owner,
    operation,
  );
  if (census.skip) {
    return census.skip;
  }
  const conflictingOperation = findOperationLedgerSelfMoveConflict(
    owner,
    operation,
    census.incompleteOperations,
  );
  if (!conflictingOperation) {
    return null;
  }
  const waitError = buildOperationLedgerSelfMoveRetryError(
    OPERATION_LEDGER_SELF_MOVE_WAITING_MESSAGE_PREFIX +
      String(conflictingOperation.operationId),
  );
  return owner.parkOperationLedgerSelfMoveDispatch(
    operation,
    OPERATION_LEDGER_SELF_MOVE_WAITING_DEFER_REASON,
    waitError.message,
    waitError,
  );
}

/**
 * The engagement point: for a PENDING disruptive ledger self-move about to be
 * claimed PENDING -> SENDING, engage the coordinator's synchronous hold
 * through the owner port. NOT_IDLE (a dependent create between its gate and
 * its persist on this node) and HELD_BY_OTHER park the claim through the
 * dispatch retry lane; an owner without the port (no coordinator) proceeds.
 * @param {Object} owner
 * @param {Object} operation
 * @return {string} OPERATION_LEDGER_SELF_MOVE_CLAIM_ENGAGEMENT member
 */
function engageOperationLedgerSelfMoveHoldForClaim(owner, operation) {
  if (
    !isPendingOperationLedgerSelfMove(operation) ||
    typeof owner.engageOperationLedgerSelfMoveHold !== LOCAL_STR_FUNCTION
  ) {
    return OPERATION_LEDGER_SELF_MOVE_CLAIM_ENGAGEMENT.PROCEED;
  }
  const engagement = owner.engageOperationLedgerSelfMoveHold(operation);
  if (engagement === OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT.ENGAGED) {
    return OPERATION_LEDGER_SELF_MOVE_CLAIM_ENGAGEMENT.PROCEED;
  }
  const waitError = buildOperationLedgerSelfMoveRetryError(
    OPERATION_LEDGER_SELF_MOVE_HOLD_NOT_ENGAGED_MESSAGE_PREFIX +
      String(engagement),
  );
  owner.parkOperationLedgerSelfMoveDispatch(
    operation,
    OPERATION_LEDGER_SELF_MOVE_WAITING_DEFER_REASON,
    waitError.message,
    waitError,
  );
  return OPERATION_LEDGER_SELF_MOVE_CLAIM_ENGAGEMENT.PARKED;
}

/**
 * A claim that did not commit after engagement leaves no engaged hold behind.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object|null} claimedOperation
 * @return {void}
 */
function disengageOperationLedgerSelfMoveHoldAfterClaim(
  owner,
  operation,
  claimedOperation,
) {
  if (
    claimedOperation ||
    !isPendingOperationLedgerSelfMove(operation) ||
    typeof owner.disengageOperationLedgerSelfMoveHold !== LOCAL_STR_FUNCTION
  ) {
    return;
  }
  owner.disengageOperationLedgerSelfMoveHold(operation);
}

export {
  OPERATION_LEDGER_SELF_MOVE_CLAIM_ENGAGEMENT,
  OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT,
  buildOperationLedgerSelfMoveRetryError,
  disengageOperationLedgerSelfMoveHoldAfterClaim,
  engageOperationLedgerSelfMoveHoldForClaim,
  ensureOperationLedgerSelfMoveDispatchIdleOrSkip,
  findOperationLedgerSelfMoveConflict,
  isPendingOperationLedgerSelfMove,
  parkOperationLedgerSelfMoveDispatch,
  readOperationLedgerSelfMoveDispatchIdleCensus,
};
