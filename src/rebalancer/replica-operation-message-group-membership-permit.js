import {types as utilTypes} from 'node:util';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {REPLICA_OPERATION_OWNER_LEASE_TTL_MS} from
  './replica-operation-owner-lease.js';

const getDescriptors = Object.getOwnPropertyDescriptors.bind(Object);
const ownKeys = Reflect.ownKeys.bind(Reflect);
const hasOwn = Object.hasOwn.bind(Object);
const objectIs = Object.is.bind(Object);
const jsonParse = JSON.parse.bind(JSON);
const jsonStringify = JSON.stringify.bind(JSON);
const numberIsSafeInteger = Number.isSafeInteger.bind(Number);
const isProxy = utilTypes.isProxy.bind(utilTypes);
const DATA_VALUE = 'value';
const ERROR = Object.freeze({PERMIT: 'Invalid message-group membership permit',
  IDENTITY: 'Invalid message-group membership identity',
  LEASE_TIME: 'Invalid membership lease time'});
const VERSION = 1;
const PERMIT_KEYS = Object.freeze(['version', 'transitionIdentity',
  'permitSequence', 'permitStage', 'permitState', 'workflowOwnerNodeId',
  'workflowOwnerFence', 'membershipLeaseExpiresAt', 'proposerNodeId',
  'proposerBootIncarnation', 'destinationNodeId',
  'destinationBootIncarnation', 'replicaLifecycleIncarnation',
  'runtimeGeneration', 'leaderTerm', 'leaderConfigurationStamp',
  'proposalIndex']);
const CONFIG_KEYS = Object.freeze(['configurationKey',
  'membershipGenerationIndex']);
const IDENTITY_KEYS = Object.freeze(['operationId', 'groupId',
  'sourceReplicaId', 'sourceNodeId', 'sourceCreatedAt',
  'sourceCreateAttemptToken', 'targetReplicaId', 'targetPeerId',
  'targetNodeId', 'targetAddress', 'transitionIdentity',
  'membershipLaneKey']);
const STAGE = Object.freeze({ADD_LEARNER: 'add_learner', PROMOTE: 'promote',
  REMOVE: 'remove'});
const STATE = Object.freeze({IN_FLIGHT: 'in_flight', ANCHORED: 'anchored',
  COMMITTED: 'committed'});
const STAGES = Object.freeze({[STAGE.ADD_LEARNER]: 1, [STAGE.PROMOTE]: 2,
  [STAGE.REMOVE]: 3});
const VALID_STATES = Object.freeze({
  [STATE.IN_FLIGHT]: true,
  [STATE.ANCHORED]: true,
  [STATE.COMMITTED]: true,
});

function ownsEveryKey(descriptors, keys) {
  for (const key of keys) {
    if (!hasOwn(descriptors, key)) return false;
  }
  return true;
}
function dataSnapshot(value, keys) {
  if (value === null || typeof value !== 'object' || isProxy(value)) return null;
  try {
    const descriptors = getDescriptors(value);
    if (ownKeys(descriptors).length !== keys.length ||
        !ownsEveryKey(descriptors, keys)) return null;
    const snapshot = Object.create(null);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!hasOwn(descriptor, DATA_VALUE) || descriptor.enumerable !== true) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch (_error) {
    return null;
  }
}
function parseRecord(value, keys) {
  if (typeof value !== 'string') return dataSnapshot(value, keys);
  try {
    return dataSnapshot(jsonParse(value), keys);
  } catch (_error) {
    return null;
  }
}
function text(value) {
  return typeof value === 'string' && value.length > 0;
}
function integer(value, positive = false) {
  return typeof value === 'number' && numberIsSafeInteger(value) &&
    !objectIs(value, -0) && value >= (positive ? 1 : 0);
}
function canonicalConfiguration(value) {
  const stamp = dataSnapshot(value, CONFIG_KEYS);
  return stamp && text(stamp.configurationKey) &&
    integer(stamp.membershipGenerationIndex) ? Object.freeze(stamp) : null;
}
function validPermitStep(permit) {
  return permit.version === VERSION && text(permit.transitionIdentity) &&
    integer(permit.permitSequence, true) &&
    hasOwn(STAGES, permit.permitStage) &&
    hasOwn(VALID_STATES, permit.permitState);
}
function validPermitOwner(permit) {
  return text(permit.workflowOwnerNodeId) && text(permit.workflowOwnerFence) &&
    integer(permit.membershipLeaseExpiresAt, true);
}
function validPermitEndpoint(permit) {
  return text(permit.proposerNodeId) &&
    integer(permit.proposerBootIncarnation, true) &&
    text(permit.destinationNodeId) &&
    integer(permit.destinationBootIncarnation, true);
}
function validPermitAnchor(permit) {
  if (permit.permitState === STATE.IN_FLIGHT) {
    return permit.proposalIndex === null;
  }
  return integer(permit.proposalIndex, true);
}
function validPermitRuntime(permit) {
  return text(permit.replicaLifecycleIncarnation) &&
    integer(permit.runtimeGeneration) && integer(permit.leaderTerm, true) &&
    validPermitAnchor(permit);
}
function validPermitScalars(permit) {
  return validPermitStep(permit) && validPermitOwner(permit) &&
    validPermitEndpoint(permit) && validPermitRuntime(permit);
}
function normalizeMessageGroupMembershipPermit(value) {
  const permit = parseRecord(value, PERMIT_KEYS);
  const configuration = permit ?
    canonicalConfiguration(permit.leaderConfigurationStamp) : null;
  if (!permit || !configuration || !validPermitScalars(permit)) {
    throw new TypeError(ERROR.PERMIT);
  }
  return Object.freeze({...permit, leaderConfigurationStamp: configuration});
}
const IDENTITY_TEXT_KEYS = Object.freeze(['operationId', 'groupId',
  'sourceReplicaId', 'sourceNodeId', 'sourceCreateAttemptToken',
  'targetReplicaId', 'targetNodeId', 'targetAddress', 'transitionIdentity',
  'membershipLaneKey']);
function validIdentityText(identity) {
  for (const key of IDENTITY_TEXT_KEYS) {
    if (!text(identity[key])) return false;
  }
  return true;
}
function normalizeMessageGroupMembershipIdentity(value) {
  const identity = parseRecord(value, IDENTITY_KEYS);
  if (!identity || !validIdentityText(identity) ||
      !integer(identity.sourceCreatedAt, true) || !text(identity.targetPeerId) ||
      identity.membershipLaneKey !== `message-group:${identity.groupId}` ||
      deriveRaftRsPeerId(identity.targetReplicaId) !== identity.targetPeerId) {
    throw new TypeError(ERROR.IDENTITY);
  }
  return Object.freeze(identity);
}
function orderedObject(value, keys) {
  const result = {};
  for (const key of keys) result[key] = value[key];
  return result;
}
function encodeMessageGroupMembershipPermit(value) {
  const permit = normalizeMessageGroupMembershipPermit(value);
  return jsonStringify({...orderedObject(permit, PERMIT_KEYS),
    leaderConfigurationStamp: orderedObject(
      permit.leaderConfigurationStamp, CONFIG_KEYS)});
}
function encodeMessageGroupMembershipIdentity(value) {
  return jsonStringify(orderedObject(
    normalizeMessageGroupMembershipIdentity(value), IDENTITY_KEYS));
}
function membershipLeaseExpiry(nowMs) {
  if (!integer(nowMs)) throw new TypeError(ERROR.LEASE_TIME);
  return nowMs + REPLICA_OPERATION_OWNER_LEASE_TTL_MS;
}
function buildMessageGroupMembershipWorkflowOwnerFence(ownerNodeId, leaseExpiresAt) {
  if (!text(ownerNodeId) || !integer(leaseExpiresAt, true)) return null;
  return `${ownerNodeId}:${leaseExpiresAt}`;
}
function stageOrdinal(stage) {
  return STAGES[stage] ?? null;
}

export {buildMessageGroupMembershipWorkflowOwnerFence,
  encodeMessageGroupMembershipIdentity,
  encodeMessageGroupMembershipPermit, membershipLeaseExpiry,
  STAGE as MESSAGE_GROUP_MEMBERSHIP_PERMIT_STAGE,
  STATE as MESSAGE_GROUP_MEMBERSHIP_PERMIT_STATE,
  normalizeMessageGroupMembershipIdentity,
  normalizeMessageGroupMembershipPermit, stageOrdinal};
