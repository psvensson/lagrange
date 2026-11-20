// Only a validated terminal result permits discharge of retained obligations.
import {assertOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {isOperationReconcileTerminal} from './operation-workflow-reconcile-outcome.js';

function isTerminalTransitionOutcomeSettled(outcome) {
  try {
    assertOperationTransitionOutcome(outcome);
    return isOperationReconcileTerminal(outcome.reconcileOutcome);
  } catch (_) {
    return false;
  }
}

function shouldReleaseReservationForTerminalOutcome(outcome) {
  return isTerminalTransitionOutcomeSettled(outcome);
}

export {
  isTerminalTransitionOutcomeSettled,
  shouldReleaseReservationForTerminalOutcome,
};
