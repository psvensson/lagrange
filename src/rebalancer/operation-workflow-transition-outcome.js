import {WORKFLOW_STEP} from '../constants/index.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from
  './replica-operation-update-disposition.js';
import {
  assertOperationData, copyOperationOutcomeData,
  assertOperationUpdateOutcome, assertOperationUpdateRecord,
  assertOperationUpdateSubject, invalidOperationPersistenceOutcome,
} from './replica-operation-update-outcome.js';
import {OPERATION_RECONCILE_OUTCOME as OUTCOME} from './operation-workflow-reconcile-outcome.js';

function terminalOperationReconcileOutcome(operation) {
  assertOperationUpdateRecord(operation, {terminal: true});
  return operation.workflowStep === WORKFLOW_STEP.FAILED ? OUTCOME.FAILED : OUTCOME.COMPLETED;
}

function buildOperationTransitionOutcome(persisted, {repository, requestedOperation} = {}) {
  assertOperationUpdateOutcome(persisted);
  const {disposition, operation} = persisted;
  if (requestedOperation && operation) {
    assertOperationUpdateSubject(requestedOperation, operation);
    if (disposition !== DISPOSITION.TERMINAL_ADOPTED &&
        !repository.isReplicaOperationUpdateSatisfied(requestedOperation, operation)) {
      throw invalidOperationPersistenceOutcome('answer does not prove the requested operation');
    }
  }
  const committed = disposition === DISPOSITION.UPDATED || disposition === DISPOSITION.RECOVERED;
  let reconcileOutcome;
  if (disposition === DISPOSITION.REFUSED) reconcileOutcome = OUTCOME.REFUSED;
  else if (disposition === DISPOSITION.REINSERTED) reconcileOutcome = OUTCOME.WAITING;
  else if (operation.completedAt !== null) {
    reconcileOutcome = terminalOperationReconcileOutcome(operation);
  } else reconcileOutcome = committed ? OUTCOME.ADVANCED : OUTCOME.WAITING;
  return Object.freeze({committed, disposition,
    operation: copyOperationOutcomeData(operation), reconcileOutcome});
}

function assertOperationTransitionOutcome(outcome) {
  assertOperationData(outcome);
  if (!outcome || typeof outcome !== 'object' || typeof outcome.committed !== 'boolean') {
    throw invalidOperationPersistenceOutcome('missing workflow result');
  }
  const persisted = outcome.disposition !== DISPOSITION.REFUSED &&
    outcome.disposition !== DISPOSITION.TERMINAL_ADOPTED;
  const expected = buildOperationTransitionOutcome({persisted,
    disposition: outcome.disposition, operation: outcome.operation});
  if (outcome.committed !== expected.committed ||
      outcome.reconcileOutcome !== expected.reconcileOutcome) {
    throw invalidOperationPersistenceOutcome('workflow result contradicts repository meaning');
  }
  return outcome;
}

export {
  assertOperationTransitionOutcome,
  buildOperationTransitionOutcome,
  terminalOperationReconcileOutcome,
};
