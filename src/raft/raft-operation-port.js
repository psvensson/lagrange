import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';

const FREEZABLE_VALUE_TYPES = Object.freeze(['object', 'function']);
const VALUE_DESCRIPTOR_KEY = 'value';
const RAFT_OPERATION_PORT_METHODS = Object.freeze([
  'subscribe',
  'step',
  'propose',
  'proposeConfChange',
  'tick',
  'campaign',
  'readStatus',
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
      value: Object.freeze(operations[methodName]),
    });
  }
  return Object.freeze(port);
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
};
