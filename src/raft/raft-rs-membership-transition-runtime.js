import {confChangeProposalRefusal} from './raft-rs-conf-change-admission.js';
import {raftRsConfStateKey} from './raft-rs-conf-state-key.js';
import {
  membershipTransitionRefusal,
  transitionFenceKey,
} from './raft-rs-membership-transition.js';
import {deepFreeze} from './raft-operation-port.js';
import {
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
  if (command.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE) {
    // Promotion is a different semantic turn: it must compare the target's
    // own applied membership generation with leader-owned follower progress
    // before proposing. This generic transition port cannot supply that
    // proof and therefore keeps the stage parked.
    return membershipTransitionRefusal(
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROOF_REQUIRED);
  }
  return NO_MEMBERSHIP_TRANSITION_ROLE_OUTCOME;
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
  if (ROLE[status.value.raftState] !== ROLE_LEADER ||
      Number(status.value.term) !== command.expectedLeaderTerm) {
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
  const nativeRefusal = confChangeProposalRefusal({status: status.value,
    confState: conf.value, change: command.change,
    leaderReplicaIdOf: (lead) => leaderReplicaIdOf(group, lead)});
  return {status: status.value, roleOutcome, nativeRefusal};
}

function admittedTransitionOutcome(admitted) {
  const idempotent = [
    RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_VOTER,
    RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_LEARNER,
  ];
  return idempotent.includes(admitted.roleOutcome?.reason) ?
    admitted.roleOutcome : null;
}

function anchoredProposal(context, admitted) {
  const {group, expectedGeneration, command, invokeCoreAt,
    answerRefusedProposal, drainReady, thenMaybe} = context;
  const preApplied = BigInt(admitted.status.applied ?? group.appliedIndex);
  const prePending = BigInt(admitted.status.pendingConfIndex ?? 0);
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
  const ownerRefusal = transitionOwnerRefusal(context);
  if (ownerRefusal !== null) {
    return ownerRefusal;
  }
  const admitted = transitionState(context);
  if (admitted.refusal) {
    return admitted.refusal;
  }
  const immediate = admittedTransitionOutcome(admitted) ??
    staleTransitionFence(context.group, context.command) ??
    admitted.roleOutcome ?? admitted.nativeRefusal;
  return immediate ?? anchoredProposal(context, admitted);
}

export {proposeMembershipTransition};
