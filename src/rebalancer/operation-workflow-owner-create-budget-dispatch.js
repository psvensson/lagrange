import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {REBALANCER_SKIP_REASON} = OPERATION_WORKFLOW_OWNER_SHARED;

// Where the physical dispatch of a DISPATCH_AFTER_CLAIM coordinator-created
// operation runs relative to the coordinator's concurrent-create budget turn
// (rebalance-coordinator-concurrent-add-budget.js runConcurrentCreateBudgetGate).
//
// INLINE: the arm dispatches right after the claim, on the same owner lane
// turn (recovery re-drives, reused-operation rearms, direct arms).
//
// AFTER_CREATE_BUDGET_TURN: the arm claims the durable workflow step and
// RETAINS the claimed operation; the coordinator dispatches it once the
// create-budget turn is released. The budget turn therefore covers budget
// check + persist + claim (the atomic admission section) but not the
// transport round trip, so sibling priority ADDs of different partitions
// dispatch concurrently up to maxConcurrentAdds instead of one per lane hold
// (GCP run 2026-08-29T19-08-22.423Z: ADDs at 05.1/23.6/34.4/43.1/48.5 s).
const COORDINATOR_CREATED_DISPATCH_PHASE = Object.freeze({
  INLINE: 'inline',
  AFTER_CREATE_BUDGET_TURN: 'after_create_budget_turn',
});

const COORDINATOR_CREATED_RETAINED_DISPATCH_STATE = Object.freeze({
  NONE: 'none',
  RETAINED: 'retained',
});

const COORDINATOR_CREATED_RETAINED_DISPATCH_NONE = Object.freeze({
  state: COORDINATOR_CREATED_RETAINED_DISPATCH_STATE.NONE,
});

/**
 * @param {Object|null} context arm/prime context carrying
 *   `coordinatorCreatedDispatchPhase`
 * @return {string} COORDINATOR_CREATED_DISPATCH_PHASE member
 */
function resolveCoordinatorCreatedDispatchPhase(context) {
  return context?.coordinatorCreatedDispatchPhase ===
    COORDINATOR_CREATED_DISPATCH_PHASE.AFTER_CREATE_BUDGET_TURN ?
    COORDINATOR_CREATED_DISPATCH_PHASE.AFTER_CREATE_BUDGET_TURN :
    COORDINATOR_CREATED_DISPATCH_PHASE.INLINE;
}

/**
 * Typed arm context for the create-budget-turn phase, handed by the
 * coordinator to the owner arm and threaded through the workflow adapter
 * context to the local-owner prime.
 * @return {Object}
 */
function buildAfterCreateBudgetTurnArmContext() {
  return Object.freeze({
    coordinatorCreatedDispatchPhase:
      COORDINATOR_CREATED_DISPATCH_PHASE.AFTER_CREATE_BUDGET_TURN,
  });
}

/**
 * The same success mapping every DISPATCH_LOCAL / DISPATCH_AFTER_CLAIM arm
 * applies to a dispatch result.
 * @param {Object|null} dispatchResult
 * @return {boolean}
 */
function isArmedDispatchResult(dispatchResult) {
  return (
    dispatchResult?.success === true ||
    dispatchResult?.reason === REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING
  );
}

function getRetainedDispatchRegistry(owner) {
  if (!owner.coordinatorCreatedDispatchRetainedByCreateBudgetTurn) {
    owner.coordinatorCreatedDispatchRetainedByCreateBudgetTurn = new Map();
  }
  return owner.coordinatorCreatedDispatchRetainedByCreateBudgetTurn;
}

/**
 * Retain a claimed DISPATCH_AFTER_CLAIM operation for dispatch after the
 * coordinator releases the create-budget turn. The retained entry carries
 * the pre-claim operation and the prime's effect boundary so a later dispatch
 * failure is deferred through exactly the transition-retry context the inline
 * prime would have used.
 * @param {Object} owner
 * @param {Object} entry
 * @param {Object} entry.operation pre-claim operation (prime input)
 * @param {Object} entry.claimedOperation claimed operation to dispatch
 * @param {string} entry.boundary prime effect command boundary
 * @return {boolean} true — the arm is complete for this phase
 */
function retainCoordinatorCreatedDispatchAfterCreateBudgetTurn(owner, entry) {
  getRetainedDispatchRegistry(owner).set(
    entry.claimedOperation.operationId,
    Object.freeze({
      operation: entry.operation,
      claimedOperation: entry.claimedOperation,
      boundary: entry.boundary,
    }),
  );
  return true;
}

/**
 * @param {Object} owner
 * @param {string} operationId
 * @return {Object} typed retained-dispatch observation
 */
function takeRetainedCoordinatorCreatedDispatch(owner, operationId) {
  const registry = getRetainedDispatchRegistry(owner);
  const entry = registry.get(operationId);
  if (!entry) {
    return COORDINATOR_CREATED_RETAINED_DISPATCH_NONE;
  }
  registry.delete(operationId);
  return Object.freeze({
    state: COORDINATOR_CREATED_RETAINED_DISPATCH_STATE.RETAINED,
    entry,
  });
}

/**
 * Dispatch the operation retained by an AFTER_CREATE_BUDGET_TURN arm, on the
 * owner's own serialized lane turn (never coalesced onto another holder's
 * result). Error handling mirrors the inline prime: a transient dispatch
 * failure is deferred through the transition retry lane with the pre-claim
 * operation context; anything the retry lane refuses is offered to the
 * coordinator-created handoff retry, then re-thrown to the arming caller.
 * @param {Object} owner
 * @param {string} operationId
 * @return {Promise<boolean>} true when the retained dispatch was armed
 */
async function dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn(
  owner,
  operationId,
) {
  const retained = takeRetainedCoordinatorCreatedDispatch(owner, operationId);
  if (retained.state !== COORDINATOR_CREATED_RETAINED_DISPATCH_STATE.RETAINED) {
    return false;
  }
  const {operation, claimedOperation, boundary} = retained.entry;
  try {
    const result = await owner.runRetainedOperationOwnerAction(
      operationId,
      async () => {
        try {
          return isArmedDispatchResult(
            await owner.dispatchOperationInternal(claimedOperation),
          );
        } catch (error) {
          if (
            owner.deferTransitionRetry(operationId, error, {
              boundary,
              workflowStep: operation.workflowStep,
              partitionId: operation.partitionId,
              updatedAt: operation.updatedAt,
              createdAt: operation.createdAt,
            })
          ) {
            return false;
          }
          throw error;
        }
      },
    );
    return result === true;
  } catch (error) {
    if (owner.deferCoordinatorCreatedRemoteHandoffRetry(operation, error)) {
      return false;
    }
    throw error;
  }
}

export {
  COORDINATOR_CREATED_DISPATCH_PHASE,
  buildAfterCreateBudgetTurnArmContext,
  dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn,
  resolveCoordinatorCreatedDispatchPhase,
  retainCoordinatorCreatedDispatchAfterCreateBudgetTurn,
};
