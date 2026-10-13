import {
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';

const FREEZABLE_VALUE_TYPES = Object.freeze(['object', 'function']);
const VALUE_DESCRIPTOR_KEY = 'value';
const OPENING_ERROR_METADATA = Object.freeze([
  'code', 'phase', 'consensus', 'partitionId', 'groupId', 'replicaId',
  'serviceDefinitionId',
]);
const RAFT_OPERATION_PORT_METHODS = Object.freeze([
  'subscribe',
  'step',
  'propose',
  'proposeConfChange',
  'transferLeadership',
  'probePeerProgress',
  'tick',
  'campaign',
  'readStatus',
  RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP,
  RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION,
  'configureTick',
  'startScheduling',
  'stopScheduling',
  'close',
]);

function deepFreeze(value, seen = new Set()) {
  if (value === null || !FREEZABLE_VALUE_TYPES.includes(typeof value) ||
      seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, VALUE_DESCRIPTOR_KEY)) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function createRaftOperationPort(operations) {
  const port = Object.create(null);
  for (const methodName of RAFT_OPERATION_PORT_METHODS) {
    if (typeof operations[methodName] !== 'function') {
      throw new TypeError(`missing Raft operation: ${methodName}`);
    }
    Object.defineProperty(port, methodName, {
      enumerable: true,
      configurable: false,
      writable: false,
      value: deepFreeze(operations[methodName]),
    });
  }
  return Object.freeze(port);
}

// A constructor can refuse semantically, lose the shared core, or fail at
// its host boundary. Every service kind consumes the same failure vocabulary
// and retains the exact consensus answer; unrelated throws are not relabeled.
function isRaftOpeningFailure(error) {
  const result = error?.consensus?.outcome;
  return result === RAFT_OPERATION_OUTCOME.CORE_REFUSED ||
    result === RAFT_OPERATION_OUTCOME.CORE_FATAL ||
    result === RAFT_OPERATION_OUTCOME.HOST_FAILURE;
}

// Preserve the exact original error and owner answer when its existing
// service lifecycle cleanup also fails. This composes data only: no resource,
// retry, deadline, or cleanup permission lives in the public port module.
function withRaftOpeningCleanupFailure(primary, cleanup) {
  const combined = new AggregateError([primary, cleanup], primary?.message,
    {cause: primary});
  for (const key of OPENING_ERROR_METADATA) {
    if (primary != null && Object.hasOwn(primary, key)) {
      combined[key] = primary[key];
    }
  }
  return combined;
}

function assertRaftOperationSucceeded(result) {
  if (result && typeof result === 'object' &&
      typeof result.outcome === 'string' &&
      result.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    const error = new Error(
      `Raft operation ${result.outcome}: ${result.reason || result.phase ||
        'refused'}`);
    error.raftResult = result;
    throw error;
  }
  return result;
}

export {
  RAFT_OPERATION_PORT_METHODS,
  assertRaftOperationSucceeded,
  createRaftOperationPort,
  deepFreeze,
  isRaftOpeningFailure,
  withRaftOpeningCleanupFailure,
};
