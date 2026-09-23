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
  ROLE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

function peerSnapshot(group, confState) {
  return [...confState.voters, ...confState.learners]
    .filter((id) => id !== group.peerId)
    .map((id) => {
      const replicaIdentity = group.resolvePeerIdentity(id);
      let address = null;
      let addressStatus = PEER_ADDRESS_STATUS.RESOLVED;
      try {
        address = group.resolvePeerAddress(id);
      } catch {
        // Status is an observation. A temporarily unavailable address is not
        // a Ready failure and must not invalidate the execution container.
        addressStatus = PEER_ADDRESS_STATUS.UNAVAILABLE;
      }
      return {
        peerId: id,
        replicaIdentity,
        address,
        addressStatus,
        learner: confState.learners.includes(id),
      };
    });
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
 * @param {Object} observation - {status, confState, runtimeHealth,
 *   runtimeGeneration} as the runtime owner recorded them.
 * @param {Function} leaderIdentityUnresolved - The owner's outcome when the
 *   leader's identity cannot be resolved.
 * @return {Object} The frozen status, or the owner's outcome.
 */
function shapeGroupObservation(group, observation, leaderIdentityUnresolved) {
  const {status, confState} = observation;
  let leaderId = null;
  let leaderAddress = null;
  try {
    leaderId = status.lead === NO_LEADER ? null :
      group.resolvePeerIdentity(status.lead);
  } catch (error) {
    return leaderIdentityUnresolved(error);
  }
  if (status.lead !== NO_LEADER) {
    try {
      leaderAddress = group.resolvePeerAddress(status.lead);
    } catch {
      // A network address can lag membership/identity without invalidating
      // the consensus runtime. Status reports the identity and a null address.
      leaderAddress = null;
    }
  }
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    groupId: group.groupId,
    replicaIdentity: group.replicaIdentity,
    peerId: group.peerId,
    term: Number(status.term),
    commitIndex: Number(status.commit),
    role: ROLE[status.raftState] || RUNTIME_REASON.UNKNOWN,
    leaderId,
    leaderAddress,
    peerCount: Math.max(0,
      confState.voters.length + confState.learners.length - 1),
    peers: peerSnapshot(group, confState),
    followerProgress: followerProgressSnapshot(group, status),
    confState,
    runtimeHealth: observation.runtimeHealth,
    groupHealth: group.health,
    runtimeGeneration: observation.runtimeGeneration,
  });
}

export {shapeGroupObservation};
