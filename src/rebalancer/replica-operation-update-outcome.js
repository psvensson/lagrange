import {
  GROWTH_PROMOTION_COHORT_UNRESOLVED, readGrowthPromotionCohort,
} from './growth-promotion-subject.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {assertCanonicalRebalancerEntityIdentity} from './rebalancer-entity-identity.js';
import {isDeepStrictEqual} from 'node:util';
import {WORKFLOW_STEP} from '../constants/index.js';
import {
  OperationType, ReplicaStatus, WORKFLOW_STEP_TO_STATUS,
  COORDINATOR_OWNED_OPERATION_TYPES, isTerminalStep, isValidWorkflowStep,
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

function invalidOperationPersistenceOutcome(reason, cause) {
  const error = new Error(`Invalid replica operation persistence outcome: ${reason}`, {cause});
  error.code = INVALID_OPERATION_PERSISTENCE_OUTCOME;
  if (reason === GROWTH_PROMOTION_COHORT_UNRESOLVED) error.reasonCode = reason;
  return error;
}

function requireOutcome(condition, reason) {
  if (!condition) throw invalidOperationPersistenceOutcome(reason);
}

function assertOperationData(value, visited = new Set()) {
  if (value === null || typeof value !== 'object') return;
  requireOutcome(!visited.has(value), 'cyclic operation data');
  visited.add(value);
  const prototype = Object.getPrototypeOf(value);
  // Committed membership stamps use null-prototype data records.
  requireOutcome(Array.isArray(value) || prototype === Object.prototype || prototype === null,
    'operation data must use plain records and arrays');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireOutcome(typeof key === 'string' && Object.hasOwn(descriptor, 'value'),
      'operation data contains an accessor or symbol');
    const {value: child} = descriptor;
    requireOutcome(typeof child !== 'function', 'operation data contains a function');
    assertOperationData(child, visited);
  }
  visited.delete(value);
}

function decodePersistedOperationHistory(raw) {
  requireOutcome(typeof raw === 'string', 'persisted operation history is not JSON text');
  let history;
  try {
    history = JSON.parse(raw);
  } catch (_) {
    throw invalidOperationPersistenceOutcome('persisted operation history is invalid JSON');
  }
  requireOutcome(Array.isArray(history), 'persisted operation history is not an array');
  assertOperationData(history);
  return history;
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
  requireDataFields(operation, [...SUBJECT_FIELDS, 'workflowStep', 'status', 'completedAt',
    'createdAt', 'updatedAt', 'stepsHistory']);
  requireOutcome(Number.isFinite(operation.createdAt) && Number.isFinite(operation.updatedAt),
    'invalid operation timestamps');
  requireOutcome(Array.isArray(operation.stepsHistory), 'invalid operation history');
  for (const field of ['operationId', 'type', 'entityType', 'entityId']) {
    requireOutcome(typeof operation[field] === 'string' && operation[field].length > 0,
      `invalid operation ${field}`);
  }
  try {
    assertCanonicalRebalancerEntityIdentity(operation);
  } catch (_) {
    throw invalidOperationPersistenceOutcome('invalid canonical entity identity');
  }
  requireOutcome(typeof operation.partitionId === 'string' && operation.partitionId.length > 0,
    'invalid encoded entity partition identity');
  if (operation.entityType === SERVICE_TYPE.PARTITION) {
    requireOutcome(operation.partitionId === operation.entityId, 'partition entity differs');
  }
  if (operation.type === OperationType.GROWTH_PROMOTE) {
    requireOutcome(readGrowthPromotionCohort(operation) !== null,
      GROWTH_PROMOTION_COHORT_UNRESOLVED);
  }
  requireOutcome((isValidWorkflowStep(operation.type, operation.workflowStep) ||
    (COORDINATOR_OWNED_OPERATION_TYPES.includes(operation.type) &&
      operation.workflowStep === WORKFLOW_STEP.FAILED)), 'invalid operation type or step');
  const status = operation.workflowStep === WORKFLOW_STEP.FAILED ?
    ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[operation.workflowStep];
  requireOutcome(operation.status === status, 'operation step/status disagree');
  if (terminal || operation.workflowStep === WORKFLOW_STEP.FAILED ||
      operation.workflowStep === WORKFLOW_STEP.SUPERSEDED || operation.completedAt !== null) {
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
  const mayBindReplaceReplica = expected.type === OperationType.REPLACE &&
    (expected.createAdmissionState === null || expected.createAdmissionState === undefined);
  if (!mayBindReplaceReplica) {
    requireOutcome(expected.replicaId === actual.replicaId, 'fixed replica binding differs');
  }
}

function assertOperationUpdateOutcome(outcome) {
  assertOperationData(outcome);
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

function buildOperationUpdateOutcome(outcome) {
  assertOperationUpdateOutcome(outcome);
  const {persisted, disposition, operation} = outcome;
  return Object.freeze({persisted, disposition,
    operation: copyOperationOutcomeData(operation)});
}

export {
  INVALID_OPERATION_PERSISTENCE_OUTCOME,
  assertOperationData,
  copyOperationOutcomeData,
  decodePersistedOperationHistory,
  assertOperationUpdateOutcome,
  assertOperationUpdateRecord,
  assertOperationUpdateSubject,
  buildOperationUpdateOutcome,
  invalidOperationPersistenceOutcome,
};
