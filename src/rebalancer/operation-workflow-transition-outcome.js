import {WORKFLOW_STEP} from '../constants/index.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from
  './replica-operation-update-disposition.js';
import {
  assertOperationData, copyOperationOutcomeData,
  assertOperationUpdateOutcome, assertOperationUpdateRecord,
  assertOperationUpdateSubject, invalidOperationPersistenceOutcome,
} from './replica-operation-update-outcome.js';
import {OPERATION_RECONCILE_OUTCOME as OUTCOME} from './operation-workflow-reconcile-outcome.js';

const TRANSITION_OUTCOME_FIELDS = Object.freeze([
  'committed',
  'disposition',
  'operation',
  'reconcileOutcome',
]);
const DESCRIPTOR_VALUE_KEY = 'value';
const UNPROVEN_REQUESTED_OPERATION_ERROR = 'answer does not prove the requested operation';
const MISSING_WORKFLOW_RESULT_ERROR = 'missing workflow result';
const INVALID_WORKFLOW_COMMITTED_FLAG_ERROR = 'invalid workflow committed flag';
const CONTRADICTORY_WORKFLOW_RESULT_ERROR = 'workflow result contradicts repository meaning';

function terminalOperationReconcileOutcome(operation) {
  assertOperationUpdateRecord(operation, {terminal: true});
  if (operation.workflowStep === WORKFLOW_STEP.FAILED) return OUTCOME.FAILED;
  if (operation.workflowStep === WORKFLOW_STEP.SUPERSEDED) return OUTCOME.SUPERSEDED;
  return OUTCOME.COMPLETED;
}

function resolveTransitionReconcileOutcome(disposition, operation, committed) {
  if (disposition === DISPOSITION.REFUSED) return OUTCOME.REFUSED;
  if (disposition === DISPOSITION.REINSERTED) return OUTCOME.WAITING;
  if (operation.completedAt !== null) return terminalOperationReconcileOutcome(operation);
  return committed ? OUTCOME.ADVANCED : OUTCOME.WAITING;
}

function buildOperationTransitionOutcome(persisted, {repository, requestedOperation} = {}) {
  assertOperationUpdateOutcome(persisted);
  const {disposition, operation} = persisted;
  if (requestedOperation && operation) {
    assertOperationUpdateSubject(requestedOperation, operation);
    if (disposition !== DISPOSITION.TERMINAL_ADOPTED &&
        !repository.isReplicaOperationUpdateSatisfied(requestedOperation, operation)) {
      throw invalidOperationPersistenceOutcome(UNPROVEN_REQUESTED_OPERATION_ERROR);
    }
  }
  const committed = disposition === DISPOSITION.UPDATED || disposition === DISPOSITION.RECOVERED;
  const reconcileOutcome = resolveTransitionReconcileOutcome(disposition, operation, committed);
  return Object.freeze({committed, disposition,
    operation: copyOperationOutcomeData(operation), reconcileOutcome});
}

function assertOperationTransitionOutcome(outcome) {
  assertOperationData(outcome);
  if (!outcome || typeof outcome !== 'object' ||
      Object.getPrototypeOf(outcome) !== Object.prototype) {
    throw invalidOperationPersistenceOutcome(MISSING_WORKFLOW_RESULT_ERROR);
  }
  for (const field of TRANSITION_OUTCOME_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(outcome, field);
    if (!descriptor || !Object.hasOwn(descriptor, DESCRIPTOR_VALUE_KEY)) {
      throw invalidOperationPersistenceOutcome(`missing workflow data field ${field}`);
    }
  }
  if (typeof outcome.committed !== 'boolean') {
    throw invalidOperationPersistenceOutcome(INVALID_WORKFLOW_COMMITTED_FLAG_ERROR);
  }
  const persisted = outcome.disposition !== DISPOSITION.REFUSED &&
    outcome.disposition !== DISPOSITION.TERMINAL_ADOPTED;
  const expected = buildOperationTransitionOutcome({persisted,
    disposition: outcome.disposition, operation: outcome.operation});
  if (outcome.committed !== expected.committed ||
      outcome.reconcileOutcome !== expected.reconcileOutcome) {
    throw invalidOperationPersistenceOutcome(CONTRADICTORY_WORKFLOW_RESULT_ERROR);
  }
  return outcome;
}

export {
  assertOperationTransitionOutcome,
  buildOperationTransitionOutcome,
  terminalOperationReconcileOutcome,
};
