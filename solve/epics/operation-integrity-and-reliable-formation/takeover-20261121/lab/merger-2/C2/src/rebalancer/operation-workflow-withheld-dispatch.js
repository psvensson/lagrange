// A storage-increasing dispatch the reservation gate withheld because the
// retained placement repair owner did not confirm its row. That owner later
// settles the record with no caller left to ask; its verdict (one event per
// record that refused a caller) is the only wake: no timer, no polling. The
// wait is bound to the attempt the gate refused (the operation's createdAt and
// the ownership fence epoch) and to the operation budget; a terminal
// transition and shutdown release it.
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {RETAINED_REPAIR_VERDICT} from './replica-operation-retained-repair-record.js';

const {OPERATION_WORKFLOW_OWNER_REASON, TIMEOUT_BUDGET_DEFAULT} = OPERATION_WORKFLOW_OWNER_SHARED;

const WITHHELD_DISPATCH_ANSWER = Object.freeze({REDRIVEN: 'redriven',
  NOT_WITHHELD: 'not_withheld', NOT_CURRENT: 'not_current', UNCONFIRMED: 'unconfirmed'});
const WITHHELD_DISPATCH_LOG = Object.freeze({
  UNCONFIRMED: 'Withheld dispatch ended: the retained owner did not confirm the row',
  REDRIVE_FAILED: 'Withheld dispatch re-drive failed'});

function retainWithheldDispatch(owner, operation) {
  owner.withheldDispatchByOperationId.set(operation.operationId, {
    createdAt: operation.createdAt,
    fenceEpoch: owner.getOperationOwnershipFenceEpoch(),
    deadlineMs: operation.createdAt + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
  });
}

function isCurrentWithheldDispatch(owner, wait) {
  return owner.isInitialized && !owner.isShuttingDown &&
    owner.getOperationOwnershipFenceEpoch() === wait.fenceEpoch &&
    wait.deadlineMs > owner.resolveTimeoutCheckNowMs();
}

// Consumes one retained verdict. Only the exact withheld attempt is woken, once:
// CONFIRMED re-enters the dispatch entry (which re-reads the operation and asks
// the gate again); UNCONFIRMED ends the wait with the gate's typed outcome.
function redriveWithheldDispatch(owner, {operationId, createdAt, verdict}) {
  const wait = owner.withheldDispatchByOperationId.get(operationId);
  if (!wait || wait.createdAt !== createdAt) {
    return {state: WITHHELD_DISPATCH_ANSWER.NOT_WITHHELD};
  }
  owner.withheldDispatchByOperationId.delete(operationId);
  if (!isCurrentWithheldDispatch(owner, wait)) {
    return {state: WITHHELD_DISPATCH_ANSWER.NOT_CURRENT};
  }
  if (verdict.state !== RETAINED_REPAIR_VERDICT.CONFIRMED) {
    owner.logger.warn(WITHHELD_DISPATCH_LOG.UNCONFIRMED, {operationId, reason: verdict.reason});
    return {state: WITHHELD_DISPATCH_ANSWER.UNCONFIRMED,
      outcome: owner.buildSkippedOperationResult(
        OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE, operationId,
        {error: verdict.reason})};
  }
  const dispatch = owner.dispatchOperation(operationId).catch((error) => {
    owner.logger.error(WITHHELD_DISPATCH_LOG.REDRIVE_FAILED,
      {operationId, error: error?.message || String(error)});
  });
  return {state: WITHHELD_DISPATCH_ANSWER.REDRIVEN, dispatch};
}

export {redriveWithheldDispatch, retainWithheldDispatch};
