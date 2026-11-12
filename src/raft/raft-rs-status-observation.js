// The semantic parts of an rs-raft status observation that need no core
// entry: the peers of a configuration and the leader's follower progress,
// each resolved to the Lagrange identities and addresses the group knows, and
// the frozen status those make up. The runtime owner reads the core; these
// only shape what it read.

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME, RAFT_REPLICA_MEMBERSHIP as MEMBERSHIP} from './raft-operation-port-constants.js';
import {
  NO_LEADER,
  PEER_ADDRESS_STATUS,
  PEER_DELIVERY_OUTCOME,
  ROLE,
  ROLE_LEADER,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';
import {
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';

const NO_DELIVERY_OBSERVED = Object.freeze({
  outcome: PEER_DELIVERY_OUTCOME.NONE_OBSERVED,
});
let nativeStatusObserver = null;

// Passive observation of the existing runtime's native status publication.
// This introduces no core read, scheduler wake, authority or cached decision.
function setNativeStatusObserver(observer) {
  nativeStatusObserver = typeof observer === 'function' ? observer : null;
}

// One status read resolves each peer id it names once: the leader, every
// configured peer and every peer in the leader's progress share one
// reservation read per id (its identity and its committed node).
function peerResolverOf(group) {
  const resolved = new Map();
  return (id) => {
    const key = String(id);
    let identity = resolved.get(key);
    if (identity === undefined) {
      identity = group.resolvePeerIdentity(id);
      resolved.set(key, identity);
    }
    return identity;
  };
}

// One configured peer's identity and address, each a named state. A peer
// whose identity this replica never reserved is reported, not thrown: its
// reservation lives on the replica that admitted it.
function resolvePeerObservation(group, resolvePeer, id) {
  const identity = resolvePeer(id);
  if (identity.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED) {
    return {replicaIdentity: null, address: null,
      addressStatus: PEER_ADDRESS_STATUS.UNRESERVED};
  }
  try {
    return {replicaIdentity: identity.replicaIdentity,
      address: group.addressOfPeer(identity, id),
      addressStatus: PEER_ADDRESS_STATUS.RESOLVED};
  } catch {
    // Status is an observation. A temporarily unavailable address is not
    // a Ready failure and must not invalidate the execution container.
    return {replicaIdentity: identity.replicaIdentity, address: null,
      addressStatus: PEER_ADDRESS_STATUS.UNAVAILABLE};
  }
}

function peerSnapshot(group, resolvePeer, confState) {
  return [...confState.voters, ...confState.learners]
    .filter((id) => id !== group.peerId)
    .map((id) => ({
      peerId: id,
      ...resolvePeerObservation(group, resolvePeer, id),
      learner: confState.learners.includes(id),
      delivery: group.peerDelivery.get(String(id)) || NO_DELIVERY_OBSERVED,
    }));
}

// The leader a status names: its identity, address and their state. An
// unreserved leader is the same observation as an unreserved peer.
function leaderObservation(group, resolvePeer, lead) {
  if (lead === NO_LEADER) {
    return {leaderId: null, leaderAddress: null,
      leaderAddressStatus: PEER_ADDRESS_STATUS.NO_LEADER};
  }
  const observed = resolvePeerObservation(group, resolvePeer, lead);
  return {leaderId: observed.replicaIdentity, leaderAddress: observed.address,
    leaderAddressStatus: observed.addressStatus};
}

// The leader's own matched index per configured peer, keyed by the peer's
// replica identity (raft-rs Progress[id].matched, the id resolved through
// this replica's identity record). Whether the peer can be addressed is the
// transport's concern, never a reason to drop its progress; an id this
// replica never reserved has no identity to key it by.
function followerProgressSnapshot(group, resolvePeer, status) {
  const progress = Array.isArray(status?.progress) ? status.progress : [];
  const snapshot = {};
  for (const item of progress) {
    if (String(item?.id) === String(group.peerId)) {
      continue;
    }
    const matched = Number(item?.matched);
    const identity = resolvePeer(item?.id);
    if (Number.isFinite(matched) &&
        identity.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED) {
      snapshot[identity.replicaIdentity] = matched;
    }
  }
  return snapshot;
}

// This replica leads and its core has applied past its pending configuration
// index. raft-rs sets that index to the last log index when the replica becomes
// leader and only raises it while leading (raft-0.7.0 src/raft.rs:1227-1232,
// 2077), and every entry after that index is the leader's own: an entry of the
// current term has committed and been applied here, so no entry of an earlier
// term that this replica has not applied can commit any more. A replica that
// does not lead, or a status missing either index, answers false.
function currentTermApplied(status, role) {
  if (role !== ROLE_LEADER ||
      status.applied === undefined || status.applied === null ||
      status.pendingConfIndex === undefined || status.pendingConfIndex === null) {
    return false;
  }
  return BigInt(status.applied) > BigInt(status.pendingConfIndex);
}

const INVALID_NATIVE_ROLE = deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
  reason: RUNTIME_REASON.INVALID_NATIVE_ROLE, phase: RUNTIME_PHASE.STATUS_OBSERVATION,
  retryable: false, recoveryRequired: false});

// The role and the term a core status names: the shaped status's and the
// role-and-term read's, from one rule.
function observeNativeRoleAndTerm(status) {
  const nativeRole = status?.raftState;
  // The binding serializes StateRole as u32. Never coerce a string or read
  // an inherited dictionary member as a role, and never invent a follower.
  if (!Number.isInteger(nativeRole) || !Object.hasOwn(ROLE, nativeRole)) {
    return INVALID_NATIVE_ROLE;
  }
  return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    role: ROLE[nativeRole], term: Number(status.term)});
}

// Outgoing voters still vote in a joint configuration, including those due
// to become learners on leaving it. No progress/identity/address read is needed.
function replicaMembership(peerId, confState) {
  if (confState.voters.includes(peerId) || confState.votersOutgoing.includes(peerId)) {
    return MEMBERSHIP.VOTER;
  }
  return confState.learners.includes(peerId) ? MEMBERSHIP.LEARNER : MEMBERSHIP.ABSENT;
}

function observeReplicaRoleAndTerm(group, observation) {
  const election = observeNativeRoleAndTerm(observation.status);
  if (election.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) return election;
  return deepFreeze({...election,
    membership: replicaMembership(group.peerId, observation.confState),
    gateOpen: observation.participation.gateOpen,
  });
}

/**
 * The status one observation of the core describes.
 * @param {Object} group - The runtime group.
 * @param {Object} observation - {status, confState, appliedIndex, lastIndex,
 *   runtimeHealth, runtimeGeneration} as the runtime owner recorded them.
 * @param {Function} leaderIdentityUnresolved - The owner's outcome when the
 *   leader's identity cannot be resolved.
 * @return {Object} The frozen status, or the owner's outcome.
 */
function shapeGroupObservation(group, observation, leaderIdentityUnresolved) {
  const {status, confState} = observation;
  const roleAndTerm = observeReplicaRoleAndTerm(group, observation);
  if (roleAndTerm.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    return roleAndTerm;
  }
  const resolvePeer = peerResolverOf(group);
  let leader;
  let peers;
  try {
    leader = leaderObservation(group, resolvePeer, status.lead);
    peers = peerSnapshot(group, resolvePeer, confState);
  } catch (error) {
    // The registry itself could not be read: a host failure, not a peer's
    // reservation state.
    return leaderIdentityUnresolved(error);
  }
  const result = deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    groupId: group.groupId,
    replicaIdentity: group.replicaIdentity,
    peerId: group.peerId,
    term: roleAndTerm.term,
    commitIndex: Number(status.commit),
    // The core holds a proposed configuration change it has not applied
    // (the conf-change admission's own pending check).
    confChangePending:
      BigInt(status.pendingConfIndex ?? 0) > BigInt(status.applied ?? 0),
    currentTermApplied: currentTermApplied(status, roleAndTerm.role),
    // The runtime's applied index of this same observation (the one its
    // confState came from), and the persisted last index of the log it
    // applies from: equal when every entry this replica holds has applied.
    appliedIndex: observation.appliedIndex,
    lastIndex: Number(observation.lastIndex),
    configurationKey: observation.configurationKey,
    membershipGenerationIndex: observation.membershipGenerationIndex,
    lifecycleIncarnation: observation.lifecycleIncarnation,
    role: roleAndTerm.role,
    membership: roleAndTerm.membership,
    ...leader,
    voters: confState.voters,
    voterCount: confState.voters.length,
    peerCount: Math.max(0,
      confState.voters.length + confState.learners.length - 1),
    peers,
    followerProgress: followerProgressSnapshot(group, resolvePeer, status),
    // The raft peer ids the leader counts live in its current tenure (its
    // voter-liveness record; only itself when it does not lead).
    liveVoters: observation.voterLiveness.liveVoters,
    // Delivered envelopes the core refused to step, per sender (the runtime
    // owner's observation; each was dropped and answered nothing).
    inboundStepRefusals: [...group.inboundStepRefusals.values()],
    confState,
    // The participation gate recorded with this observation, and the applied
    // index the configuration above was applied at (O1 gate).
    ...observation.participation,
    runtimeHealth: observation.runtimeHealth,
    groupHealth: group.health,
    runtimeGeneration: observation.runtimeGeneration,
  });
  nativeStatusObserver?.(result);
  return result;
}

export {observeNativeRoleAndTerm, observeReplicaRoleAndTerm, shapeGroupObservation,
  setNativeStatusObserver};
