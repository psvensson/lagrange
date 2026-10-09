import {confChangeProposalRefusal} from './raft-rs-conf-change-admission.js';
import {
  LEARNER_PROMOTION_PROOF_DECISION,
  evaluateLearnerPromotionProof,
} from './learner-promotion-progress.js';
import {raftRsConfStateKey} from './raft-rs-conf-state-key.js';
import {
  membershipTransitionRefusal,
  transitionFenceKey,
} from './raft-rs-membership-transition.js';
import {deepFreeze} from './raft-operation-port.js';
import {
  RAFT_MEMBERSHIP_AUTHORIZATION_REASON,
  RAFT_MEMBERSHIP_TRANSITION_REASON,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {CORE_OPERATION, ROLE, ROLE_LEADER} from
  './raft-rs-runtime-owner-constants.js';

const MEMBERSHIP_TRANSITION_MEMBER_ROLE = Object.freeze({
  VOTER: 'voter',
  LEARNER: 'learner',
  ABSENT: 'absent',
});
const NO_MEMBERSHIP_TRANSITION_ROLE_OUTCOME = undefined;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const objectIs = Object.is;
const bigIntFn = globalThis.BigInt;
const numberFn = globalThis.Number;
const MAX_SAFE_INDEX = bigIntFn(numberFn.MAX_SAFE_INTEGER);
const DECIMAL_LOWEST_DIGIT = '0';
const DECIMAL_HIGHEST_DIGIT = '9';

function transitionOk(reason, fields = {}) {
  return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK, reason,
    ...fields});
}

function memberRole(confState, peerId) {
  const id = String(peerId);
  if ([...(confState.voters || []), ...(confState.votersOutgoing || [])]
    .map(String).includes(id)) {
    return MEMBERSHIP_TRANSITION_MEMBER_ROLE.VOTER;
  }
  if ([...(confState.learners || []), ...(confState.learnersNext || [])]
    .map(String).includes(id)) {
    return MEMBERSHIP_TRANSITION_MEMBER_ROLE.LEARNER;
  }
  return MEMBERSHIP_TRANSITION_MEMBER_ROLE.ABSENT;
}

function transitionRoleOutcome(command, role) {
  if (role === MEMBERSHIP_TRANSITION_MEMBER_ROLE.VOTER && command.stage !==
      RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE) {
    return transitionOk(RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_VOTER,
      {role});
  }
  if (command.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER &&
      role === MEMBERSHIP_TRANSITION_MEMBER_ROLE.LEARNER) {
    return transitionOk(RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_LEARNER,
      {role});
  }
  if (command.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE &&
      role === MEMBERSHIP_TRANSITION_MEMBER_ROLE.ABSENT) {
    return transitionOk(RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_ABSENT,
      {role});
  }
  if (command.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE &&
      role !== MEMBERSHIP_TRANSITION_MEMBER_ROLE.LEARNER) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.NOT_LEARNER);
  }
  return NO_MEMBERSHIP_TRANSITION_ROLE_OUTCOME;
}

function canonicalDecimalString(value) {
  if (value.length === 0 ||
      (value.length > 1 && value[0] === DECIMAL_LOWEST_DIGIT)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] < DECIMAL_LOWEST_DIGIT ||
        value[index] > DECIMAL_HIGHEST_DIGIT) return false;
  }
  return true;
}

function canonicalUnsignedBigInt(value) {
  if (typeof value === 'number') {
    return numberIsSafeInteger(value) && !objectIs(value, -0) && value >= 0 ?
      bigIntFn(value) : null;
  }
  if (typeof value === 'bigint') return value < 0n ? null : value;
  return typeof value === 'string' && canonicalDecimalString(value) ?
    bigIntFn(value) : null;
}

function canonicalIndexValue(value) {
  const exact = canonicalUnsignedBigInt(value);
  return exact === null || exact > MAX_SAFE_INDEX ? null : numberFn(exact);
}

function canonicalPeerId(value) {
  const exact = canonicalUnsignedBigInt(value);
  return exact === null || exact === 0n ? null : exact;
}

function progressForPeer(progress, peerId) {
  if (peerId === null || !arrayIsArray(progress)) return null;
  for (let index = 0; index < progress.length; index += 1) {
    const entry = progress[index];
    if (canonicalPeerId(entry?.id) === peerId) return entry;
  }
  return null;
}

function promotionRefusal(command, status, currentTerm) {
  if (command.stage !== RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE) {
    return null;
  }
  const target = command.targetStatusObservation;
  if (target.replicaIdentity !== command.replicaIdentity ||
      target.peerId !== command.peerId) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.IDENTITY_MISMATCH);
  }
  // The target runtime/lifecycle values are provenance carried from its real
  // port. This leader cannot authenticate them; their owner validates the
  // transport binding. The leader can independently compare only the target's
  // applied term/configuration claim with its own native turn.
  if (target.term !== command.expectedLeaderTerm ||
      target.configurationKey !== command.expectedConfigurationKey ||
      target.membershipGenerationIndex !==
        command.expectedMembershipGenerationIndex) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_STALE);
  }
  const committedIndex = canonicalIndexValue(status.commit);
  if (committedIndex === null || committedIndex === 0) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
  }
  const progress = progressForPeer(
    status.progress, canonicalPeerId(command.peerId));
  const learnerMatchIndex = progress ?
    canonicalIndexValue(progress.matched) : null;
  if (learnerMatchIndex === null) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
  }
  const proof = evaluateLearnerPromotionProof({
    raftIsLeader: true,
    currentTerm,
    committedIndex,
    learnerMatchIndex,
    leaderMembershipEpoch: command.expectedMembershipGenerationIndex,
    learnerMembershipEpoch: target.membershipGenerationIndex,
  });
  return proof.decision === LEARNER_PROMOTION_PROOF_DECISION.GRANTED ? null :
    membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_BEHIND);
}

function staleTransitionFence(group, command) {
  const key = transitionFenceKey(command);
  const currentGeneration = group.membershipGenerationIndex;
  const retained = group.membershipTransitionFence;
  const previous = retained?.membershipGenerationIndex === currentGeneration &&
      retained.key === key ? retained : null;
  if (previous && (command.permitSequence < previous.permitSequence ||
      command.stageOrdinal < previous.stageOrdinal)) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_PERMIT);
  }
  group.membershipTransitionFence = {
    key,
    permitSequence: command.permitSequence,
    stageOrdinal: command.stageOrdinal,
    membershipGenerationIndex: currentGeneration,
  };
  return null;
}

function transitionOwnerRefusal(context) {
  const {group, expectedGeneration, command, runtimeGeneration} = context;
  if (command.expectedRuntimeGeneration !== runtimeGeneration ||
      expectedGeneration !== runtimeGeneration) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_RUNTIME);
  }
  if (command.replicaLifecycleIncarnation !== group.lifecycleIncarnation) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_LIFECYCLE);
  }
  return null;
}

function transitionState(context) {
  const {group, expectedGeneration, command, invokeCoreAt,
    leaderReplicaIdOf} = context;
  const status = invokeCoreAt(group, expectedGeneration, 'status');
  const conf = invokeCoreAt(group, expectedGeneration,
    CORE_OPERATION.CONF_STATE);
  if (!status.ok || !conf.ok) {
    return {refusal: status.ok ? conf.result : status.result};
  }
  if (group.membershipGenerationKnown !== true) {
    return {refusal: membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.CONFIGURATION_GENERATION_UNAVAILABLE)};
  }
  const currentTerm = canonicalIndexValue(status.value.term);
  if (ROLE[status.value.raftState] !== ROLE_LEADER ||
      currentTerm === null || currentTerm !== command.expectedLeaderTerm) {
    return {refusal: membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_LEADERSHIP)};
  }
  if (raftRsConfStateKey(conf.value) !== command.expectedConfigurationKey ||
      Number(group.membershipGenerationIndex) !==
        command.expectedMembershipGenerationIndex) {
    return {refusal: membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_CONFIGURATION)};
  }
  let address;
  try {
    address = group.resolvePeerAddress(command.peerId);
  } catch {
    address = null;
  }
  if (address !== command.peerAddress) {
    return {refusal: membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.IDENTITY_MISMATCH)};
  }
  const roleOutcome = transitionRoleOutcome(
    command, memberRole(conf.value, command.peerId));
  const refusal = promotionRefusal(command, status.value, currentTerm);
  const nativeRefusal = confChangeProposalRefusal({status: status.value,
    confState: conf.value, change: command.change,
    leaderReplicaIdOf: (lead) => leaderReplicaIdOf(group, lead)});
  return {status: status.value, roleOutcome, nativeRefusal,
    refusal};
}

function admittedTransitionOutcome(admitted) {
  const idempotent = [
    RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_VOTER,
    RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_LEARNER,
  ];
  return idempotent.includes(admitted.roleOutcome?.reason) ?
    admitted.roleOutcome : null;
}

function executionDeliveryRefusal(command) {
  // Generic privileged membership callers retain their existing native
  // contract. The issued-learner consumer always supplies this host fence.
  if (command.admitExecution === undefined) return null;
  try {
    if (typeof command.admitExecution === 'function' && command.admitExecution() === true) {
      return null;
    }
  } catch {
    // Unavailable lifetime evidence is never execution permission.
  }
  return deepFreeze({...membershipTransitionRefusal(
    RAFT_MEMBERSHIP_AUTHORIZATION_REASON.STALE_DELIVERY), retryable: true});
}

function anchoredProposal(context, admitted) {
  const {group, expectedGeneration, command, invokeCoreAt,
    answerRefusedProposal, drainReady, thenMaybe} = context;
  const preApplied = BigInt(admitted.status.applied ?? group.appliedIndex);
  const prePending = BigInt(admitted.status.pendingConfIndex ?? 0);
  // No await between this check and the native call. A context may have
  // expired while waiting for the group turn, inbound drain or recovery.
  const deliveryRefusal = executionDeliveryRefusal(command);
  if (deliveryRefusal !== null) return deliveryRefusal;
  const invoked = invokeCoreAt(group, expectedGeneration,
    'propose_conf_change_v2', command.change);
  if (!invoked.ok) {
    return answerRefusedProposal(group, expectedGeneration, invoked.result);
  }
  const after = invokeCoreAt(group, expectedGeneration, 'status');
  const proposalIndex = after.ok ? BigInt(after.value.pendingConfIndex ?? 0) :
    0n;
  const proposalNumber = Number(proposalIndex);
  if (!after.ok || proposalIndex <= preApplied ||
      proposalIndex <= prePending || !Number.isSafeInteger(proposalNumber)) {
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSAL_ANCHOR_UNAVAILABLE);
  }
  return thenMaybe(drainReady(group, expectedGeneration), (drained) =>
    drained.outcome === RAFT_OPERATION_OUTCOME.CORE_OK ? transitionOk(
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED,
      {proposalIndex: proposalNumber}) : drained);
}

function proposeMembershipTransition(context) {
  const ownerRefusal = transitionOwnerRefusal(context) ??
    executionDeliveryRefusal(context.command);
  if (ownerRefusal !== null) {
    return ownerRefusal;
  }
  const admitted = transitionState(context);
  if (admitted.refusal) {
    return admitted.refusal;
  }
  const immediate = staleTransitionFence(context.group, context.command) ??
    admittedTransitionOutcome(admitted) ?? admitted.refusal ??
    admitted.roleOutcome ?? admitted.nativeRefusal;
  return immediate ?? anchoredProposal(context, admitted);
}

export {proposeMembershipTransition};
