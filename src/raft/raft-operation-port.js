import {
  RAFT_CONSENSUS_STARTUP_OUTCOME,
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';

const VALUE_DESCRIPTOR_KEY = 'value';
const OPENING_ERROR_METADATA = Object.freeze([
  'code', 'domain', 'identity', 'consensus',
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
  RAFT_OPERATION.OBSERVE_CURRENT_AUTHORITY,
  'configureTick',
  'startScheduling',
  'stopScheduling',
  'close',
]);

function isFreezableValue(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function deepFreeze(value, seen = null) {
  if (!isFreezableValue(value)) {
    return value;
  }
  let visited = seen;
  if (visited !== null) {
    if (visited.has(value)) {
      return value;
    }
    visited.add(value);
  }
  const keys = Reflect.ownKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
    if (descriptor && Object.hasOwn(descriptor, VALUE_DESCRIPTOR_KEY)) {
      const child = descriptor.value;
      if (isFreezableValue(child)) {
        if (visited === null) {
          visited = new Set();
          visited.add(value);
        }
        deepFreeze(child, visited);
      }
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

/**
 * Whether a port status names its group held by its host failure (the
 * port's recovery outcome): at open it is a startup refusal, while the
 * group runs it is a hold its consumers wait out.
 * @param {Object} status - A port status.
 * @return {boolean} Whether the group is held.
 */
function isHeldByHostFailure(status) {
  return status?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
    status.recoveryRequired === true;
}

function consensusInitRefusedMessage(domain, {groupId, replicaId}, answer) {
  const detail = answer?.failure?.detail ?? answer?.detail;
  return `${domain} ${groupId} replica ${replicaId} cannot initialize: its ` +
    `consensus port refused it in phase ${answer?.phase} ` +
    `(${answer?.outcome}: ${answer?.reason}` +
    `${detail ? ` ${JSON.stringify(detail)}` : ''})`;
}

/**
 * The one typed startup refusal of a replica its consensus port refused:
 * every service kind's, distinguished by its domain. The port's answer is
 * carried as is; its phase, reason and outcome are read from it, never
 * copied beside it.
 * @param {Object} refusal
 * @param {string} refusal.domain - The opening service kind (ENTITY_TYPE).
 * @param {{groupId: string, replicaId: string}} refusal.identity - The Raft
 *   group the port was opened for, and the replica.
 * @param {Object} refusal.answer - What the port answered.
 * @return {Error} The refusal.
 */
function consensusInitRefusedError({domain, identity, answer}) {
  const error = new Error(consensusInitRefusedMessage(domain, identity, answer));
  error.code = RAFT_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED;
  error.domain = domain;
  error.identity = Object.freeze({
    groupId: identity.groupId, replicaId: identity.replicaId});
  error.consensus = answer ?? null;
  return error;
}

/**
 * Whether an error is the typed startup refusal of a replica of the domain.
 * @param {*} error - A startup failure.
 * @param {string} domain - The opening service kind (ENTITY_TYPE).
 * @return {boolean} Whether it is that domain's consensus init refusal.
 */
function isConsensusInitRefusal(error, domain) {
  return error?.code === RAFT_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED &&
    error.domain === domain;
}

/**
 * What a failed port construction is to the opening service: the runtime
 * owner's opening failure is the domain's typed init refusal; any other
 * throw is the original error, never relabeled.
 * @param {*} error - What the port constructor threw.
 * @param {{domain: string, identity: Object}} opening - The opening
 *   service kind (ENTITY_TYPE) and the group/replica it opened.
 * @return {*} The typed refusal, or the original error.
 */
function consensusOpeningFailure(error, {domain, identity}) {
  return isRaftOpeningFailure(error) ?
    consensusInitRefusedError({domain, identity, answer: error.consensus}) :
    error;
}

/**
 * Refuse a port that opened its group held by its host failure (its durable
 * record could not be read at open): that status is the domain's typed init
 * refusal. A status that does not hold the group passes.
 * @param {Object} status - The port's status read at open.
 * @param {{domain: string, identity: Object}} opening - The opening
 *   service kind (ENTITY_TYPE) and the group/replica it opened.
 * @throws {Error} The typed init refusal when the group is held.
 */
function assertConsensusNotHeldAtOpen(status, {domain, identity}) {
  if (isHeldByHostFailure(status)) {
    throw consensusInitRefusedError({domain, identity, answer: status});
  }
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
      `Raft operation ${result.outcome}: reason ${result.reason}, phase ${result.phase}`);
    error.raftResult = result;
    throw error;
  }
  return result;
}

export {
  RAFT_OPERATION_PORT_METHODS,
  assertConsensusNotHeldAtOpen,
  assertRaftOperationSucceeded,
  consensusInitRefusedError,
  consensusOpeningFailure,
  createRaftOperationPort,
  deepFreeze,
  isConsensusInitRefusal,
  isHeldByHostFailure,
  isRaftOpeningFailure,
  withRaftOpeningCleanupFailure,
};
