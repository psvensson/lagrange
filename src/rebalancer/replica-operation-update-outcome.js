import {isDeepStrictEqual} from 'node:util';
import {WORKFLOW_STEP} from '../constants/index.js';
import {
  OperationType, ReplicaStatus, WORKFLOW_STEP_TO_STATUS, getWorkflowSteps, isTerminalStep,
} from './replica-operation-progress.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from
  './replica-operation-update-disposition.js';

const INVALID_OPERATION_PERSISTENCE_OUTCOME = 'INVALID_OPERATION_PERSISTENCE_OUTCOME';
const PERSISTED_BY_DISPOSITION = Object.freeze({
  [DISPOSITION.UPDATED]: true,
  [DISPOSITION.RECOVERED]: true,
  [DISPOSITION.IDEMPOTENT_REPLAY]: true,
  [DISPOSITION.REINSERTED]: true,
  [DISPOSITION.TERMINAL_ADOPTED]: false,
  [DISPOSITION.REFUSED]: false,
});
const SUBJECT_FIELDS = ['operationId', 'type', 'partitionId', 'entityType', 'entityId'];
const PLACEMENT_FIELDS = [
  'sourceNodeId', 'targetNodeId', 'sourceReplicaId', 'targetNodeBootIncarnation',
  'targetNodeStorageIncarnation', 'promoteReplicaIds',
];

function invalidOperationPersistenceOutcome(reason) {
  const error = new Error(`Invalid replica operation persistence outcome: ${reason}`);
  error.code = INVALID_OPERATION_PERSISTENCE_OUTCOME;
  return error;
}

function requireOutcome(condition, reason) {
  if (!condition) throw invalidOperationPersistenceOutcome(reason);
}

function assertOperationData(value, visited = new Set()) {
  if (value === null || typeof value !== 'object') return;
  requireOutcome(!visited.has(value), 'cyclic operation data');
  visited.add(value);
  requireOutcome(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype,
    'operation data must use plain records and arrays');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireOutcome(typeof key === 'string' && Object.hasOwn(descriptor, 'value'),
      'operation data contains an accessor or symbol');
    requireOutcome(typeof descriptor.value !== 'function', 'operation data contains a function');
    assertOperationData(descriptor.value, visited);
  }
  visited.delete(value);
}

function copyOperationOutcomeData(operation) {
  assertOperationData(operation);
  const copy = structuredClone(operation);
  function freeze(value) {
    if (value === null || typeof value !== 'object') return value;
    for (const item of Object.values(value)) freeze(item);
    return Object.freeze(value);
  }
  return freeze(copy);
}

function requireDataFields(record, fields) {
  requireOutcome(record !== null && typeof record === 'object' &&
    Object.getPrototypeOf(record) === Object.prototype, 'expected a plain record');
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(record, field);
    requireOutcome(descriptor && Object.hasOwn(descriptor, 'value'), `missing data field ${field}`);
  }
}

function assertOperationUpdateRecord(operation, {terminal = false} = {}) {
  assertOperationData(operation);
  requireDataFields(operation, [...SUBJECT_FIELDS, 'workflowStep', 'status', 'completedAt']);
  for (const field of SUBJECT_FIELDS) {
    requireOutcome(typeof operation[field] === 'string' && operation[field].length > 0,
      `invalid operation ${field}`);
  }
  const steps = getWorkflowSteps(operation.type);
  requireOutcome(steps.length > 0 && (steps.includes(operation.workflowStep) ||
    operation.workflowStep === WORKFLOW_STEP.FAILED), 'invalid operation type or step');
  const status = operation.workflowStep === WORKFLOW_STEP.FAILED ?
    ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[operation.workflowStep];
  requireOutcome(operation.status === status, 'operation step/status disagree');
  if (terminal || operation.workflowStep === WORKFLOW_STEP.FAILED ||
      operation.completedAt !== null) {
    requireOutcome(Number.isFinite(operation.completedAt) &&
      isTerminalStep(operation.type, operation.workflowStep), 'invalid terminal operation tuple');
  }
  return operation;
}

function assertOperationUpdateSubject(expected, actual) {
  assertOperationData(expected);
  assertOperationData(actual);
  for (const field of SUBJECT_FIELDS) {
    requireOutcome(expected[field] === actual[field], `operation subject differs at ${field}`);
  }
  for (const field of PLACEMENT_FIELDS) {
    // A growth operation's current administrator is a route, not placement intent.
    if (expected.type === OperationType.GROWTH_PROMOTE &&
        (field === 'sourceNodeId' || field === 'targetNodeId')) continue;
    const expectedValue = expected[field] === undefined ? null : expected[field];
    const actualValue = actual[field] === undefined ? null : actual[field];
    requireOutcome(isDeepStrictEqual(expectedValue, actualValue),
      `operation placement differs at ${field}`);
  }
  // An admitted CREATE owns its exact binding; a pre-admission REPLACE can
  // legitimately allocate a replica before the expected-step write.
  if (expected.createAdmissionState !== null && expected.createAdmissionState !== undefined) {
    requireOutcome(expected.replicaId === actual.replicaId, 'admitted replica binding differs');
  }
}

function assertOperationUpdateOutcome(outcome) {
  requireDataFields(outcome, ['persisted', 'disposition', 'operation']);
  requireOutcome(typeof outcome.disposition === 'string' &&
    Object.hasOwn(PERSISTED_BY_DISPOSITION, outcome.disposition), 'unknown disposition');
  requireOutcome(outcome.persisted === PERSISTED_BY_DISPOSITION[outcome.disposition],
    'persisted flag contradicts disposition');
  if (outcome.disposition === DISPOSITION.REFUSED) {
    requireOutcome(outcome.operation === null, 'refusal carries an operation');
  } else {
    assertOperationUpdateRecord(outcome.operation,
      {terminal: outcome.disposition === DISPOSITION.TERMINAL_ADOPTED});
  }
  return outcome;
}

function buildOperationUpdateOutcome({persisted, disposition, operation}) {
  assertOperationUpdateOutcome({persisted, disposition, operation});
  return Object.freeze({persisted, disposition,
    operation: copyOperationOutcomeData(operation)});
}

export {
  INVALID_OPERATION_PERSISTENCE_OUTCOME,
  assertOperationData,
  copyOperationOutcomeData,
  assertOperationUpdateOutcome,
  assertOperationUpdateRecord,
  assertOperationUpdateSubject,
  buildOperationUpdateOutcome,
  invalidOperationPersistenceOutcome,
};
