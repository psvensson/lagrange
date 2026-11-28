// The leadership transfer's decisions, from the core's own facts: which voter
// a transfer names and whether the core would act on it, and whether a
// proposal the core dropped was dropped because a transfer is running.
//
// raft-rs moves leadership only to a named transferee, through the
// MsgTransferLeader its own RawNode::transfer_leader steps, and it ignores a
// request it cannot serve - a learner, a peer outside the configuration, the
// leader itself, a follower that knows no leader - while the binding's step
// answers Ok. So every "the core would ignore this" is decided here, from the
// status and configuration the runtime owner read in the same queued turn,
// and answered as a typed refusal with nothing stepped.
//
// Pure: it reads only its arguments and the owners' constants, and never
// enters the core; the runtime owner remains its only caller that does.

import {deepFreeze} from './raft-operation-port.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {RAFT_RS_CORE_REFUSAL_TEXT} from './raft-rs-core-constants.js';
import {
  FOLLOWER_RAFT_STATE,
  NO_LEADER,
  ROLE,
  ROLE_LEADER,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

const {CORE_OK, CORE_REFUSED, HOST_FAILURE} = RAFT_OPERATION_OUTCOME;
const ROLE_FOLLOWER = ROLE[FOLLOWER_RAFT_STATE];

function transferRefusal(reason, retryable = false) {
  return deepFreeze({
    outcome: CORE_REFUSED,
    reason,
    phase: RUNTIME_PHASE.LEADERSHIP_TRANSFER,
    retryable,
    recoveryRequired: false,
  });
}

function transferAccepted(reason) {
  return deepFreeze({outcome: CORE_OK, reason});
}

// The voters of a configuration, incoming and outgoing, that are not
// learners: the peers raft-rs accepts as a transferee.
function transferableVoters(confState) {
  const learners = new Set(confState.learners || []);
  return new Set([...(confState.voters || []),
    ...(confState.votersOutgoing || [])]
    .filter((raftPeerId) => !learners.has(raftPeerId)));
}

function roleOf(status) {
  return ROLE[status.raftState] || ROLE_FOLLOWER;
}

// A source-named request with the source binding it was captured under (term,
// configuration, membership generation, lifecycle incarnation, runtime
// generation) and the host's placement predicate, or SOURCE_CHANGED when any
// of them is missing or out of range.
function sourceNamedTransferCommand(request, successor, target, admitExecution) {
  const {term, configurationKey, membershipGenerationIndex, lifecycleIncarnation,
    runtimeGeneration} = request;
  if (!Number.isSafeInteger(term) || term <= 0 ||
      !Number.isSafeInteger(membershipGenerationIndex) ||
      membershipGenerationIndex < 0 || !Number.isSafeInteger(runtimeGeneration) ||
      runtimeGeneration < 0 ||
      typeof lifecycleIncarnation !== 'string' || !lifecycleIncarnation ||
      typeof configurationKey !== 'string' || !configurationKey || typeof admitExecution !== 'function') {
    return {refusal: transferRefusal(RUNTIME_REASON.SOURCE_CHANGED)};
  }
  return {command: Object.freeze({successor, target: String(target), term, configurationKey,
    membershipGenerationIndex, lifecycleIncarnation, runtimeGeneration, admitExecution})};
}

// {successor: NAMED, replicaIdentity} resolved to the raft id the replica's
// registry reserved for it, {successor: MOST_CAUGHT_UP} as it is, or the
// refusal naming how the request missed the canonical shape.
function normalizedTransferRequest(request, registry, admitExecution) {
  const successor = request?.successor;
  if (successor === RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP) {
    return {command: deepFreeze({successor})};
  }
  const sourceNamed = successor === RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.SOURCE_NAMED;
  if (!sourceNamed && successor !== RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED) {
    return {refusal: transferRefusal(RUNTIME_REASON.UNKNOWN_SUCCESSOR)};
  }
  if (typeof request.replicaIdentity !== 'string' ||
      request.replicaIdentity.length === 0) {
    return {refusal: transferRefusal(RUNTIME_REASON.WITHOUT_REPLICA_IDENTITY)};
  }
  const target = registry.raftPeerIdOf(request.replicaIdentity);
  if (target === null) {
    return {refusal: transferRefusal(RUNTIME_REASON.TARGET_UNRESERVED)};
  }
  if (sourceNamed) {
    return sourceNamedTransferCommand(request, successor, target, admitExecution);
  }
  return {command: deepFreeze({successor, target: String(target)})};
}

// A named target: it already leads (no step); it is no transferable voter
// (refused); this replica leads (the leader steps it); this replica follows a
// known leader (the core forwards it); otherwise no leader is known to take
// it (refused, retryable).
function decideNamedTransfer({status, confState}, target) {
  if (status.lead !== NO_LEADER && String(status.lead) === target) {
    return {answer: transferAccepted(RUNTIME_REASON.ALREADY_LEADER)};
  }
  if (!transferableVoters(confState).has(target)) {
    return {answer: transferRefusal(RUNTIME_REASON.TARGET_NOT_VOTER)};
  }
  const role = roleOf(status);
  if (role === ROLE_LEADER) {
    return {transferee: target,
      accepted: transferAccepted(RUNTIME_REASON.TRANSFER_REQUESTED)};
  }
  if (role === ROLE_FOLLOWER && status.lead !== NO_LEADER) {
    return {transferee: target,
      accepted: transferAccepted(RUNTIME_REASON.TRANSFER_FORWARDED)};
  }
  return {answer: transferRefusal(RUNTIME_REASON.NO_KNOWN_LEADER, true)};
}

function progressOrder(left, right) {
  const leftMatched = BigInt(left.matched);
  const rightMatched = BigInt(right.matched);
  if (leftMatched !== rightMatched) {
    return leftMatched > rightMatched ? -1 : 1;
  }
  return BigInt(left.id) < BigInt(right.id) ? -1 : 1;
}

// The most caught-up successor, by the leader's own progress: the
// transferable voter other than this replica with the highest matched index,
// the lowest raft id on a tie. Only the leader holds that progress.
function decideMostCaughtUpTransfer({status, confState}, peerId) {
  if (roleOf(status) !== ROLE_LEADER) {
    return {answer: transferRefusal(RUNTIME_REASON.NOT_LEADER)};
  }
  const voters = transferableVoters(confState);
  voters.delete(String(peerId));
  const [successor] = (status.progress || [])
    .filter((progress) => voters.has(String(progress?.id)))
    .sort(progressOrder);
  if (successor === undefined) {
    return {answer: transferRefusal(RUNTIME_REASON.NO_ELIGIBLE_SUCCESSOR)};
  }
  return {transferee: String(successor.id),
    accepted: transferAccepted(RUNTIME_REASON.TRANSFER_REQUESTED)};
}

// Whether this replica no longer holds the leadership the source-named
// command was captured under: not the leader, a transfer to itself, another
// term, configuration, membership generation, lifecycle incarnation or runtime
// generation, an unapplied configuration change, a joint configuration, or a
// closed participation gate.
function sourceTransferStale(peerId, status, confState, observation, command) {
  return roleOf(status) !== ROLE_LEADER || String(status.lead) !== String(peerId) ||
    command.target === String(peerId) || Number(status.term) !== command.term ||
    observation.configurationKey !== command.configurationKey ||
    observation.membershipGenerationIndex !== command.membershipGenerationIndex ||
    observation.lifecycleIncarnation !== command.lifecycleIncarnation ||
    observation.runtimeGeneration !== command.runtimeGeneration ||
    BigInt(status.pendingConfIndex ?? 0) > BigInt(status.applied) ||
    confState.votersOutgoing.length > 0 || !observation.participation.gateOpen;
}

// A source-named transfer: refused as SOURCE_CHANGED (retryable) when the
// captured source is stale, refused when the target is no settled voter,
// otherwise decided as a named transfer.
function decideSourceNamedTransfer(peerId, observation, command) {
  const {status, confState} = observation;
  if (sourceTransferStale(peerId, status, confState, observation, command)) {
    return {answer: transferRefusal(RUNTIME_REASON.SOURCE_CHANGED, true)};
  }
  if (!confState.voters.includes(command.target) ||
      confState.learnersNext.includes(command.target)) {
    return {answer: transferRefusal(RUNTIME_REASON.TARGET_NOT_VOTER)};
  }
  return decideNamedTransfer(observation, command.target);
}

/**
 * What a normalized transfer command means against the core's facts.
 * @param {string} peerId - This replica's raft id.
 * @param {Object} observation - {status, confState} read in the same turn.
 * @param {Object} command - The normalized request.
 * @return {Object} {answer} when nothing is stepped, or {transferee,
 *   accepted}: the raft id to step as the transferee and the answer once the
 *   step's Ready drained.
 */
function decideLeadershipTransfer(peerId, observation, command) {
  if (command.successor === RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.SOURCE_NAMED) {
    return decideSourceNamedTransfer(peerId, observation, command);
  }
  return command.successor === RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED ?
    decideNamedTransfer(observation, command.target) :
    decideMostCaughtUpTransfer(observation, peerId);
}

/**
 * Whether the core dropped a proposal because a transfer is running. raft-rs's
 * leader drops a proposal for two causes (raft.rs step_leader, MsgPropose):
 * it has no progress for itself - it applied its own removal - or a transfer
 * it accepted is in progress. The first never holds for a leader here: the
 * binding steps a leader down in the call that applies a configuration in
 * which it is no voter (fork fix 5), so a leader always holds its own
 * progress. The binding sets no uncommitted-size limit and encodes every
 * configuration change it proposes, so no other cause is reachable. The
 * transfer window ends within one election timeout, so its drop is a
 * retryable answer that leaves the group usable, never a terminal refusal.
 * @param {Object} refused - The core's refusal.
 * @param {Object} observation - {status} read in the same turn.
 * @return {boolean} True when the drop is the transfer's.
 */
function droppedByLeadershipTransfer(refused, {status}) {
  return refused.outcome === CORE_REFUSED &&
    String(refused.reason).endsWith(RAFT_RS_CORE_REFUSAL_TEXT.PROPOSAL_DROPPED) &&
    roleOf(status) === ROLE_LEADER;
}

function leadershipTransferInProgress(phase) {
  return deepFreeze({
    outcome: HOST_FAILURE,
    reason: RUNTIME_REASON.TRANSFER_IN_PROGRESS,
    phase,
    retryable: true,
    recoveryRequired: false,
  });
}

export {
  decideLeadershipTransfer,
  droppedByLeadershipTransfer,
  leadershipTransferInProgress,
  normalizedTransferRequest,
  transferRefusal,
};
