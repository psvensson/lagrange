// Dispatch-time membership epoch gate (audit finding 7). The creation-time
// assert only fences the moment of persistence; a queued ADD/REPLACE can sit
// PENDING across a membership epoch advance and then dispatch stale work
// from a plan the coordinator has already abandoned. This gate re-reads the
// operation's planning epoch at execution time: a readable current epoch
// that no longer matches fails the operation closed, and an unreadable
// current epoch defers the dispatch into the existing retry path instead of
// dispatching unfenced. The epoch is carried into the executor request so
// ADD/REPLACE execution can reject staleness downstream as well.
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  OperationType,
  REBALANCER_SKIP_REASON,
  ReplicaOperationField,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const DISPATCH_EPOCH_UNAVAILABLE_PREFIX =
  'current published membership epoch unreadable at dispatch';
const STALE_DISPATCH_EPOCH_PREFIX =
  'Stale dispatch for published membership epoch ';

function isEpochFencedOperationType(operationType) {
  return (
    operationType === OperationType.ADD ||
    operationType === OperationType.REPLACE
  );
}

function normalizePlanningEpoch(epochValue) {
  if (
    epochValue === null ||
    epochValue === undefined ||
    epochValue === ''
  ) {
    return null;
  }
  const epoch = Number(epochValue);
  return Number.isInteger(epoch) && epoch >= 0 ? epoch : null;
}

/**
 * Resolve the operation's canonical durable planning membership epoch.
 * @param {Object} operation - Resolved dispatch candidate.
 * @return {number|null}
 * @private
 */
function resolveOperationPlanningEpoch(operation) {
  return normalizePlanningEpoch(
    operation?.[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
  );
}

/**
 * Whether the dispatch-time epoch gate can engage for this owner: reduced
 * harnesses construct the owner without the coordinator's epoch delegate,
 * and there is nothing to fence against there. A production coordinator
 * always reports the delegate — creation asserts the same dependency.
 * @param {Object} owner - Operation workflow owner (this).
 * @return {boolean}
 * @private
 */
function isDispatchEpochGateEngaged(owner) {
  return typeof owner.getCurrentPublishedMembershipEpoch === 'function';
}

/**
 * Verify the dispatch candidate's planning epoch still matches the current
 * published membership epoch. A stale candidate is failed closed (the
 * operation belongs to an abandoned plan); an unreadable current epoch is
 * deferred via DEFERRED_RETRY_PENDING so the existing dispatch retry lane
 * re-drives it once the epoch is observable again.
 * @param {Object} owner - Operation workflow owner (this).
 * @param {Object} operation - Resolved dispatch candidate.
 * @return {Promise<Object|null>} Skip/failure result when the dispatch may
 *   not proceed, null when the epoch fence is satisfied.
 * @private
 */
async function ensureDispatchMembershipEpochOrSkip(owner, operation) {
  if (
    !isEpochFencedOperationType(operation?.type) ||
    !isDispatchEpochGateEngaged(owner)
  ) {
    return null;
  }
  const planningEpoch = resolveOperationPlanningEpoch(operation);
  if (planningEpoch === null) {
    // Direct unbound creates have no planning epoch to fence; creation only
    // admits this absence for non-planner operations.
    return null;
  }
  const currentEpoch = normalizePlanningEpoch(
    owner.getCurrentPublishedMembershipEpoch(),
  );
  if (currentEpoch === null) {
    return owner.buildSkippedOperationResult(
      REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      operation.operationId,
      {
        error: DISPATCH_EPOCH_UNAVAILABLE_PREFIX,
        requestedMembershipPublicationEpoch: planningEpoch,
      },
    );
  }
  if (currentEpoch === planningEpoch) {
    return null;
  }
  const staleDispatchError =
    `${STALE_DISPATCH_EPOCH_PREFIX}${planningEpoch}; ` +
    `current epoch is ${currentEpoch}`;
  await owner.failOperation(operation, staleDispatchError);
  return owner.buildFailedOperationResult(
    operation.operationId,
    staleDispatchError,
  );
}

export {ensureDispatchMembershipEpochOrSkip};
