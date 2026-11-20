const OPERATION_RECONCILE_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed',
  ADVANCED: 'advanced',
  WAITING: 'waiting',
  STOPPING_REDRIVE_CONFIRMED: 'stopping_redrive_confirmed',
  HELD: 'held',
  REFUSED: 'refused',
});

function didOperationReconcileAdvanceOrComplete(outcome) {
  return outcome === OPERATION_RECONCILE_OUTCOME.COMPLETED ||
    outcome === OPERATION_RECONCILE_OUTCOME.ADVANCED;
}

function isOperationReconcileTerminal(outcome) {
  return outcome === OPERATION_RECONCILE_OUTCOME.COMPLETED ||
    outcome === OPERATION_RECONCILE_OUTCOME.FAILED;
}

export {
  OPERATION_RECONCILE_OUTCOME,
  didOperationReconcileAdvanceOrComplete,
  isOperationReconcileTerminal,
};
