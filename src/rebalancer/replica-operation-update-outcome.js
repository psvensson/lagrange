import {FIELD} from '../constants/fields.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
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
const INVALID_REASON = Object.freeze({
  CYCLIC_DATA: 'cyclic operation data',
  DATA_PROTOTYPE: 'operation data must use plain records and arrays',
  ACCESSOR_OR_SYMBOL: 'operation data contains an accessor or symbol',
  DATA_FUNCTION: 'operation data contains a function',
  HISTORY_NOT_JSON_TEXT: 'persisted operation history is not JSON text',
  HISTORY_INVALID_JSON: 'persisted operation history is invalid JSON',
  HISTORY_NOT_ARRAY: 'persisted operation history is not an array',
  EXPECTED_PLAIN_RECORD: 'expected a plain record',
  INVALID_TIMESTAMPS: 'invalid operation timestamps',
  INVALID_HISTORY: 'invalid operation history',
  INVALID_ENTITY_IDENTITY: 'invalid canonical entity identity',
  INVALID_PARTITION_IDENTITY: 'invalid encoded entity partition identity',
  PARTITION_ENTITY_DIFFERS: 'partition entity differs',
  INVALID_TYPE_OR_STEP: 'invalid operation type or step',
  STEP_STATUS_DISAGREE: 'operation step/status disagree',
  INVALID_TERMINAL_TUPLE: 'invalid terminal operation tuple',
  FIXED_BINDING_DIFFERS: 'fixed replica binding differs',
  UNKNOWN_DISPOSITION: 'unknown disposition',
  PERSISTED_FLAG_CONTRADICTS_DISPOSITION: 'persisted flag contradicts disposition',
  REFUSAL_CARRIES_OPERATION: 'refusal carries an operation',
});
const DESCRIPTOR_VALUE_FIELD = 'value';
const PERSISTED_BY_DISPOSITION = Object.freeze({
  [DISPOSITION.UPDATED]: true,
  [DISPOSITION.RECOVERED]: true,
  [DISPOSITION.IDEMPOTENT_REPLAY]: true,
  [DISPOSITION.REINSERTED]: true,
  [DISPOSITION.TERMINAL_ADOPTED]: false,
  [DISPOSITION.REFUSED]: false,
});
const TEXT_IDENTITY_FIELDS = Object.freeze([
  FIELD.OPERATION_ID, FIELD.TYPE, FIELD.ENTITY_TYPE, FIELD.ENTITY_ID,
]);
const SUBJECT_FIELDS = Object.freeze([
  FIELD.OPERATION_ID, FIELD.TYPE, FIELD.PARTITION_ID, FIELD.ENTITY_TYPE, FIELD.ENTITY_ID,
]);
const REQUIRED_RECORD_FIELDS = Object.freeze([
  ...SUBJECT_FIELDS, 'workflowStep', 'status', 'completedAt',
  'createdAt', 'updatedAt', 'stepsHistory',
]);
const PLACEMENT_FIELDS = Object.freeze([
  FIELD.SOURCE_NODE_ID, FIELD.TARGET_NODE_ID, ReplicaOperationField.SOURCE_REPLICA_ID,
  'targetNodeBootIncarnation', 'targetNodeStorageIncarnation',
  ReplicaOperationField.PROMOTE_REPLICA_IDS,
]);
const OUTCOME_FIELDS = Object.freeze(['persisted', 'disposition', 'operation']);

function invalidOperationPersistenceOutcome(reason, cause) {
  const error = new Error(`Invalid replica operation persistence outcome: ${reason}`, {cause});
  error.code = INVALID_OPERATION_PERSISTENCE_OUTCOME;
  if (reason === GROWTH_PROMOTION_COHORT_UNRESOLVED) error.reasonCode = reason;
  return error;
}

function requireOutcome(condition, reason) {
  if (!condition) throw invalidOperationPersistenceOutcome(reason);
}

class FrozenOperationDataMemo {
  #validated = new WeakSet();

  has(value) {
    return this.#validated.has(value);
  }

  add(value) {
    this.#validated.add(value);
  }
}

const validatedFrozenOperationData = new FrozenOperationDataMemo();

function assertOperationData(value, visited = new Set()) {
  if (value === null || typeof value !== 'object') return;
  if (validatedFrozenOperationData.has(value)) return;
  requireOutcome(!visited.has(value), INVALID_REASON.CYCLIC_DATA);
  visited.add(value);
  const prototype = Object.getPrototypeOf(value);
  // Committed membership stamps use null-prototype data records.
  requireOutcome(Array.isArray(value) || prototype === Object.prototype || prototype === null,
    INVALID_REASON.DATA_PROTOTYPE);
  let allChildrenFrozenValid = Object.isFrozen(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireOutcome(typeof key === 'string' && Object.hasOwn(descriptor, DESCRIPTOR_VALUE_FIELD),
      INVALID_REASON.ACCESSOR_OR_SYMBOL);
    const {value: child} = descriptor;
    requireOutcome(typeof child !== 'function', INVALID_REASON.DATA_FUNCTION);
    if (child !== null && typeof child === 'object') {
      assertOperationData(child, visited);
      if (allChildrenFrozenValid && !validatedFrozenOperationData.has(child)) {
        allChildrenFrozenValid = false;
      }
    }
  }
  visited.delete(value);
  if (allChildrenFrozenValid) validatedFrozenOperationData.add(value);
}

function decodePersistedOperationHistory(raw) {
  requireOutcome(typeof raw === 'string', INVALID_REASON.HISTORY_NOT_JSON_TEXT);
  let history;
  try {
    history = JSON.parse(raw);
  } catch (_) {
    throw invalidOperationPersistenceOutcome(INVALID_REASON.HISTORY_INVALID_JSON);
  }
  requireOutcome(Array.isArray(history), INVALID_REASON.HISTORY_NOT_ARRAY);
  return history;
}

function copyOperationOutcomeData(operation) {
  assertOperationData(operation);
  const copy = structuredClone(operation);
  function freeze(value) {
    if (value === null || typeof value !== 'object') return value;
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
    validatedFrozenOperationData.add(value);
    return value;
  }
  return freeze(copy);
}

function requireDataFields(record, fields) {
  requireOutcome(record !== null && typeof record === 'object' &&
    Object.getPrototypeOf(record) === Object.prototype, INVALID_REASON.EXPECTED_PLAIN_RECORD);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(record, field);
    requireOutcome(descriptor && Object.hasOwn(descriptor, DESCRIPTOR_VALUE_FIELD), `missing data field ${field}`);
  }
}

function assertOperationUpdateRecord(operation, {terminal = false} = {}) {
  assertOperationData(operation);
  requireDataFields(operation, REQUIRED_RECORD_FIELDS);
  requireOutcome(Number.isFinite(operation.createdAt) && Number.isFinite(operation.updatedAt),
    INVALID_REASON.INVALID_TIMESTAMPS);
  requireOutcome(Array.isArray(operation.stepsHistory), INVALID_REASON.INVALID_HISTORY);
  for (const field of TEXT_IDENTITY_FIELDS) {
    requireOutcome(typeof operation[field] === 'string' && operation[field].length > 0,
      `invalid operation ${field}`);
  }
  try {
    assertCanonicalRebalancerEntityIdentity(operation);
  } catch (_) {
    throw invalidOperationPersistenceOutcome(INVALID_REASON.INVALID_ENTITY_IDENTITY);
  }
  requireOutcome(typeof operation.partitionId === 'string' && operation.partitionId.length > 0,
    INVALID_REASON.INVALID_PARTITION_IDENTITY);
  if (operation.entityType === SERVICE_TYPE.PARTITION) {
    requireOutcome(operation.partitionId === operation.entityId,
      INVALID_REASON.PARTITION_ENTITY_DIFFERS);
  }
  if (operation.type === OperationType.GROWTH_PROMOTE) {
    requireOutcome(readGrowthPromotionCohort(operation) !== null,
      GROWTH_PROMOTION_COHORT_UNRESOLVED);
  }
  requireOutcome((isValidWorkflowStep(operation.type, operation.workflowStep) ||
    (COORDINATOR_OWNED_OPERATION_TYPES.includes(operation.type) &&
      operation.workflowStep === WORKFLOW_STEP.FAILED)), INVALID_REASON.INVALID_TYPE_OR_STEP);
  const status = operation.workflowStep === WORKFLOW_STEP.FAILED ?
    ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[operation.workflowStep];
  requireOutcome(operation.status === status, INVALID_REASON.STEP_STATUS_DISAGREE);
  if (terminal || operation.workflowStep === WORKFLOW_STEP.FAILED ||
      operation.workflowStep === WORKFLOW_STEP.SUPERSEDED || operation.completedAt !== null) {
    requireOutcome(Number.isFinite(operation.completedAt) &&
      isTerminalStep(operation.type, operation.workflowStep),
    INVALID_REASON.INVALID_TERMINAL_TUPLE);
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
        (field === FIELD.SOURCE_NODE_ID || field === FIELD.TARGET_NODE_ID)) continue;
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
    requireOutcome(expected.replicaId === actual.replicaId, INVALID_REASON.FIXED_BINDING_DIFFERS);
  }
}

function assertOperationUpdateOutcome(outcome) {
  assertOperationData(outcome);
  requireDataFields(outcome, OUTCOME_FIELDS);
  requireOutcome(typeof outcome.disposition === 'string' &&
    Object.hasOwn(PERSISTED_BY_DISPOSITION, outcome.disposition),
  INVALID_REASON.UNKNOWN_DISPOSITION);
  requireOutcome(outcome.persisted === PERSISTED_BY_DISPOSITION[outcome.disposition],
    INVALID_REASON.PERSISTED_FLAG_CONTRADICTS_DISPOSITION);
  if (outcome.disposition === DISPOSITION.REFUSED) {
    requireOutcome(outcome.operation === null, INVALID_REASON.REFUSAL_CARRIES_OPERATION);
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
