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

function refusal(reason) {
  return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED, reason,
    phase: MEMBERSHIP_TRANSITION_REFUSAL_PHASE, retryable: false,
    recoveryRequired: false});
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function canonicalInteger(value, {positive = false} = {}) {
  return Number.isSafeInteger(value) && value >= (positive ? 1 : 0);
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

function transitionCommand(request, stamp, stageOrdinal, peerId) {
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

function normalizeMembershipTransition(request, registry) {
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
  return {command: transitionCommand(request, stamp, stageOrdinal, peerId)};
}

function transitionFenceKey(command) {
  return `${command.operationId}\u0000${command.transitionIdentity}`;
}

export {
  normalizeMembershipTransition,
  refusal as membershipTransitionRefusal,
  transitionFenceKey,
};
