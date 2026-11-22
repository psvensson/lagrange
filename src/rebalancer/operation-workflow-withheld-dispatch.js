// A storage-increasing dispatch the reservation gate withheld because the
// retained placement repair owner did not confirm its row. That owner later
// settles the record with no caller left to ask; its verdict (one event per
// record that refused a caller) is the only wake: no timer, no polling. The
// wait is bound to the attempt the gate refused (the operation's createdAt and
// the ownership fence epoch) and to the operation budget; a terminal
// transition and shutdown release it.
import {OPERATION_OWNER_TURN_POLICY} from './operation-owner-turn-policy.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  RETAINED_REPAIR_CALLER, RETAINED_REPAIR_RETIREMENT, RETAINED_REPAIR_VERDICT,
} from './replica-operation-retained-repair-record.js';

const {OPERATION_WORKFLOW_OWNER_REASON, TIMEOUT_BUDGET_DEFAULT} = OPERATION_WORKFLOW_OWNER_SHARED;
const OPERATION_ROW_REPAIR_REFUSED = 'retained operation row repair refused';

const WITHHELD_DISPATCH_ANSWER = Object.freeze({REDRIVEN: 'redriven',
  NOT_WITHHELD: 'not_withheld', NOT_CURRENT: 'not_current', UNCONFIRMED: 'unconfirmed'});
const WITHHELD_DISPATCH_LOG = Object.freeze({
  UNCONFIRMED: 'Withheld dispatch ended: the retained owner did not confirm the row',
  REDRIVE_FAILED: 'Withheld dispatch re-drive failed'});

function retainWithheldDispatch(owner, operation) {
  const existing = owner.withheldDispatchByOperationId.get(operation.operationId);
  const wait = {
    createdAt: operation.createdAt,
    fenceEpoch: owner.getOperationOwnershipFenceEpoch(),
    deadlineMs: operation.createdAt + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
    awaitingVerdict: true,
    changedRedriven: existing?.createdAt === operation.createdAt &&
      existing.changedRedriven === true,
    outcome: null,
  };
  owner.withheldDispatchByOperationId.set(operation.operationId, wait);
  return wait;
}

function clearWithheldDispatch(owner, operationId) {
  owner.withheldDispatchByOperationId.delete(operationId);
}

function hasWithheldRetainedRepairRecord(owner, operationId) {
  const repairs = owner.repository?.retainedPlacementRepairs;
  if (!(repairs instanceof Map)) return true;
  return repairs.get(operationId)?.callerAnswer === RETAINED_REPAIR_CALLER.WITHHELD;
}

function settleWithheldGateRefusal(owner, operation, wait) {
  if (!hasWithheldRetainedRepairRecord(owner, operation.operationId)) {
    const current = owner.withheldDispatchByOperationId.get(operation.operationId);
    if (current === wait && current.awaitingVerdict !== false) {
      owner.withheldDispatchByOperationId.delete(operation.operationId);
    }
  }
  return wait.outcome ?? owner.buildSkippedOperationResult(
    OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
    operation.operationId,
    {error: OPERATION_ROW_REPAIR_REFUSED},
  );
}

function isCurrentWithheldDispatch(owner, wait) {
  return owner.isInitialized && !owner.isShuttingDown &&
    owner.getOperationOwnershipFenceEpoch() === wait.fenceEpoch &&
    wait.deadlineMs > owner.resolveTimeoutCheckNowMs();
}

function shouldRedriveRetainedVerdict(wait, verdict) {
  if (verdict.state === RETAINED_REPAIR_VERDICT.CONFIRMED) return true;
  return verdict.reason === RETAINED_REPAIR_RETIREMENT.CHANGED &&
    wait.changedRedriven !== true;
}

// The one decision: what a verdict means for the wait of this operation.
function withheldDispatchState(owner, wait, createdAt, verdict) {
  if (!wait || wait.awaitingVerdict === false || wait.createdAt !== createdAt) {
    return WITHHELD_DISPATCH_ANSWER.NOT_WITHHELD;
  }
  if (!isCurrentWithheldDispatch(owner, wait)) return WITHHELD_DISPATCH_ANSWER.NOT_CURRENT;
  return shouldRedriveRetainedVerdict(wait, verdict) ?
    WITHHELD_DISPATCH_ANSWER.REDRIVEN : WITHHELD_DISPATCH_ANSWER.UNCONFIRMED;
}

function settleChangedRedriveWait(owner, operationId, wait) {
  if (owner.withheldDispatchByOperationId.get(operationId) === wait &&
      wait.awaitingVerdict === false) {
    owner.withheldDispatchByOperationId.delete(operationId);
  }
}

// Consumes one retained verdict. Only the exact withheld attempt is woken, once:
// CONFIRMED (and the first row_changed) re-enters the dispatch entry in its own
// retained lane turn; a definite UNCONFIRMED ends the wait with the gate's typed outcome.
function redriveWithheldDispatch(owner, {operationId, createdAt, verdict}) {
  const wait = owner.withheldDispatchByOperationId.get(operationId);
  const state = withheldDispatchState(owner, wait, createdAt, verdict);
  if (state === WITHHELD_DISPATCH_ANSWER.REDRIVEN &&
      verdict.reason === RETAINED_REPAIR_RETIREMENT.CHANGED) {
    wait.awaitingVerdict = false;
    wait.changedRedriven = true;
  } else if (state !== WITHHELD_DISPATCH_ANSWER.NOT_WITHHELD) {
    owner.withheldDispatchByOperationId.delete(operationId);
  }
  switch (state) {
  case WITHHELD_DISPATCH_ANSWER.REDRIVEN:
    return {state, dispatch: owner.dispatchOperation(operationId, {
      ownerTurnPolicy: OPERATION_OWNER_TURN_POLICY.RETAIN,
    }).catch((error) => {
      owner.logger.error(WITHHELD_DISPATCH_LOG.REDRIVE_FAILED,
        {operationId, error: error?.message || String(error)});
    }).finally(() => {
      settleChangedRedriveWait(owner, operationId, wait);
    })};
  case WITHHELD_DISPATCH_ANSWER.UNCONFIRMED: {
    owner.logger.warn(WITHHELD_DISPATCH_LOG.UNCONFIRMED, {operationId, reason: verdict.reason});
    const outcome = owner.buildSkippedOperationResult(
      OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE, operationId,
      {error: verdict.reason});
    wait.outcome = outcome;
    return {state, outcome};
  }
  default:
    return {state};
  }
}

export {
  clearWithheldDispatch,
  redriveWithheldDispatch,
  retainWithheldDispatch,
  settleWithheldGateRefusal,
};
