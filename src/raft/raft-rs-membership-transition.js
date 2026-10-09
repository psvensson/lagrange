import {types as nodeUtilTypes} from 'node:util';

import {
  RAFT_MEMBERSHIP_TRANSITION_REASON,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {deepFreeze} from './raft-operation-port.js';
import {
  committedMembershipChangeType,
  encodeCommittedMembershipContext,
} from './raft-rs-committed-membership-context.js';

const MEMBERSHIP_TRANSITION_REFUSAL_PHASE =
  'membership-transition-admission';
const STAGE_ORDINAL = Object.freeze({
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER]: 1,
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE]: 2,
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE]: 3,
});
const TARGET_STATUS_OBSERVATION_FIELDS = Object.freeze([
  'replicaIdentity', 'peerId', 'configurationKey',
  'membershipGenerationIndex', 'term', 'runtimeGeneration',
  'lifecycleIncarnation',
]);
const TARGET_STATUS_OBSERVATION_FIELD = 'targetStatusObservation';
const DATA_DESCRIPTOR_VALUE = 'value';
const ownDescriptor = Object.getOwnPropertyDescriptor;
const ownHas = Object.hasOwn;
const ownKeys = Reflect.ownKeys;
const getPrototype = Object.getPrototypeOf;
const isProxy = nodeUtilTypes.isProxy;
const arrayIsArray = Array.isArray;
const OBJECT_PROTOTYPE = Object.prototype;

function refusal(reason) {
  return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED, reason,
    phase: MEMBERSHIP_TRANSITION_REFUSAL_PHASE, retryable: false,
    recoveryRequired: false});
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function canonicalInteger(value, {positive = false} = {}) {
  return Number.isSafeInteger(value) && !Object.is(value, -0) &&
    value >= (positive ? 1 : 0);
}

function isOrdinaryRecord(value) {
  if (value === null || typeof value !== 'object' || isProxy(value) ||
      arrayIsArray(value)) return false;
  const prototype = getPrototype(value);
  return prototype === OBJECT_PROTOTYPE || prototype === null;
}

function snapshotExactDataRecord(value, fields) {
  if (!isOrdinaryRecord(value)) return null;
  try {
    const keys = ownKeys(value);
    if (keys.length !== fields.length) {
      return null;
    }
    const snapshot = {};
    for (const field of fields) {
      const descriptor = ownDescriptor(value, field);
      if (!descriptor || !ownHas(descriptor, DATA_DESCRIPTOR_VALUE) ||
          descriptor.enumerable !== true) {
        return null;
      }
      snapshot[field] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

// This is owner-fed evidence copied from the target operation port's real
// readStatus answer. Exact shape validation makes malformed evidence fail
// closed; it does not authenticate who supplied it. The workflow/transport
// owner remains responsible for obtaining it from the exact target port.
function normalizeTargetStatusObservation(request) {
  if (request.stage !== RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE) {
    return {observation: null};
  }
  const targetDescriptor = ownDescriptor(
    request, TARGET_STATUS_OBSERVATION_FIELD);
  if (!targetDescriptor) {
    return {refusal: refusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROOF_REQUIRED)};
  }
  if (!ownHas(targetDescriptor, DATA_DESCRIPTOR_VALUE)) {
    return {refusal: refusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID)};
  }
  const observation = snapshotExactDataRecord(
    targetDescriptor.value, TARGET_STATUS_OBSERVATION_FIELDS);
  if (observation === null ||
      !nonempty(observation.replicaIdentity) ||
      !nonempty(observation.peerId) ||
      !nonempty(observation.configurationKey) ||
      !nonempty(observation.lifecycleIncarnation) ||
      !canonicalInteger(observation.membershipGenerationIndex) ||
      !canonicalInteger(observation.term) ||
      !canonicalInteger(observation.runtimeGeneration)) {
    return {refusal: refusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID)};
  }
  return {observation: deepFreeze(observation)};
}

function stageOrdinalFor(stage) {
  if (typeof stage !== 'string' || !Object.hasOwn(STAGE_ORDINAL, stage)) {
    return undefined;
  }
  return STAGE_ORDINAL[stage];
}

function validMembershipTransitionRequest(request, stamp, stageOrdinal) {
  const requiredStrings = [request?.operationId, request?.transitionIdentity,
    request?.replicaIdentity, request?.peerAddress,
    request?.replicaLifecycleIncarnation, stamp?.configurationKey];
  const requiredChecks = [
    canonicalInteger(request?.permitSequence, {positive: true}),
    canonicalInteger(request?.runtimeGeneration),
    canonicalInteger(request?.leaderTerm),
    canonicalInteger(stamp?.membershipGenerationIndex),
    stageOrdinal !== undefined,
  ];
  return requiredStrings.every(nonempty) && requiredChecks.every(Boolean);
}

function transitionCommand(request, stamp, stageOrdinal, peerId,
  targetStatusObservation, admitExecution) {
  return deepFreeze({
    operationId: request.operationId,
    transitionIdentity: request.transitionIdentity,
    permitSequence: request.permitSequence,
    stage: request.stage,
    stageOrdinal,
    replicaIdentity: request.replicaIdentity,
    peerId,
    peerAddress: request.peerAddress,
    replicaLifecycleIncarnation: request.replicaLifecycleIncarnation,
    expectedRuntimeGeneration: request.runtimeGeneration,
    expectedLeaderTerm: request.leaderTerm,
    expectedConfigurationKey: stamp.configurationKey,
    expectedMembershipGenerationIndex: stamp.membershipGenerationIndex,
    targetStatusObservation,
    // Host-only lifetime predicate. It is never encoded into the replicated
    // ConfChange context and must be checked inside the queued native turn.
    admitExecution,
    change: deepFreeze({transition: 0, changes: [deepFreeze({
      changeType: committedMembershipChangeType(request.stage), nodeId: peerId,
    })], context: encodeCommittedMembershipContext({
      operationId: request.operationId,
      transitionIdentity: request.transitionIdentity,
      permitSequence: request.permitSequence,
      stage: request.stage,
      replicaIdentity: request.replicaIdentity,
      peerId,
    })}),
  });
}

function normalizeMembershipTransition(request, registry, admitExecution) {
  const stamp = request?.leaderConfigurationStamp;
  const stageOrdinal = stageOrdinalFor(request?.stage);
  if (!validMembershipTransitionRequest(request, stamp, stageOrdinal)) {
    return {refusal: refusal(RAFT_MEMBERSHIP_TRANSITION_REASON.MALFORMED)};
  }
  const peerId = registry.raftPeerIdOf(request.replicaIdentity);
  if (peerId === null) {
    return {refusal: refusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.IDENTITY_MISMATCH)};
  }
  const target = normalizeTargetStatusObservation(request);
  if (target.refusal) {
    return target;
  }
  return {command: transitionCommand(
    request, stamp, stageOrdinal, peerId, target.observation, admitExecution)};
}

function transitionFenceKey(command) {
  return `${command.operationId}\u0000${command.transitionIdentity}`;
}

export {
  normalizeMembershipTransition,
  refusal as membershipTransitionRefusal,
  transitionFenceKey,
};
