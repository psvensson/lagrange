// The semantic parts of an rs-raft status observation that need no core
// entry: the peers of a configuration and the leader's follower progress,
// each resolved to the Lagrange identities and addresses the group knows, and
// the frozen status those make up. The runtime owner reads the core; these
// only shape what it read.

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {
  NO_LEADER,
  PEER_ADDRESS_STATUS,
  PEER_DELIVERY_OUTCOME,
  ROLE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';
import {
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';

const NO_DELIVERY_OBSERVED = Object.freeze({
  outcome: PEER_DELIVERY_OUTCOME.NONE_OBSERVED,
});

// One configured peer's identity and address, each a named state. A peer
// whose identity this replica never reserved is reported, not thrown: its
// reservation lives on the replica that admitted it.
function resolvePeerObservation(group, id) {
  const identity = group.resolvePeerIdentity(id);
  if (identity.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED) {
    return {replicaIdentity: null, address: null,
      addressStatus: PEER_ADDRESS_STATUS.UNRESERVED};
  }
  try {
    return {replicaIdentity: identity.replicaIdentity,
      address: group.resolvePeerAddress(id),
      addressStatus: PEER_ADDRESS_STATUS.RESOLVED};
  } catch {
    // Status is an observation. A temporarily unavailable address is not
    // a Ready failure and must not invalidate the execution container.
    return {replicaIdentity: identity.replicaIdentity, address: null,
      addressStatus: PEER_ADDRESS_STATUS.UNAVAILABLE};
  }
}

function peerSnapshot(group, confState) {
  return [...confState.voters, ...confState.learners]
    .filter((id) => id !== group.peerId)
    .map((id) => ({
      peerId: id,
      ...resolvePeerObservation(group, id),
      learner: confState.learners.includes(id),
      delivery: group.peerDelivery.get(String(id)) || NO_DELIVERY_OBSERVED,
    }));
}

// The leader a status names: its identity, address and their state. An
// unreserved leader is the same observation as an unreserved peer.
function leaderObservation(group, lead) {
  if (lead === NO_LEADER) {
    return {leaderId: null, leaderAddress: null,
      leaderAddressStatus: PEER_ADDRESS_STATUS.NO_LEADER};
  }
  const observed = resolvePeerObservation(group, lead);
  return {leaderId: observed.replicaIdentity, leaderAddress: observed.address,
    leaderAddressStatus: observed.addressStatus};
}

function followerProgressSnapshot(group, status) {
  const progress = Array.isArray(status?.progress) ? status.progress : [];
  const snapshot = {};
  for (const item of progress) {
    if (String(item?.id) === String(group.peerId)) {
      continue;
    }
    const matched = Number(item?.matched);
    if (!Number.isFinite(matched)) {
      continue;
    }
    let address = null;
    try {
      address = group.resolvePeerAddress(item.id);
    } catch {
      continue;
    }
    if (typeof address === 'string' && address.length > 0) {
      snapshot[address] = matched;
    }
  }
  return snapshot;
}

/**
 * The status one observation of the core describes.
 * @param {Object} group - The runtime group.
 * @param {Object} observation - {status, confState, appliedIndex,
 *   runtimeHealth, runtimeGeneration} as the runtime owner recorded them.
 * @param {Function} leaderIdentityUnresolved - The owner's outcome when the
 *   leader's identity cannot be resolved.
 * @return {Object} The frozen status, or the owner's outcome.
 */
function shapeGroupObservation(group, observation, leaderIdentityUnresolved) {
  const {status, confState} = observation;
  let leader;
  let peers;
  try {
    leader = leaderObservation(group, status.lead);
    peers = peerSnapshot(group, confState);
  } catch (error) {
    // The registry itself could not be read: a host failure, not a peer's
    // reservation state.
    return leaderIdentityUnresolved(error);
  }
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    groupId: group.groupId,
    replicaIdentity: group.replicaIdentity,
    peerId: group.peerId,
    term: Number(status.term),
    commitIndex: Number(status.commit),
    // The runtime's applied index of this same observation (the one its
    // confState came from).
    appliedIndex: observation.appliedIndex,
    role: ROLE[status.raftState] || RUNTIME_REASON.UNKNOWN,
    ...leader,
    peerCount: Math.max(0,
      confState.voters.length + confState.learners.length - 1),
    peers,
    followerProgress: followerProgressSnapshot(group, status),
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
}

export {shapeGroupObservation};
