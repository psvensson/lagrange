// The semantic parts of an rs-raft status observation that need no core
// entry: the peers of a configuration and the leader's follower progress,
// each resolved to the Lagrange identities and addresses the group knows.
// The runtime owner reads the core; these only shape what it read.

import {PEER_ADDRESS_STATUS} from './raft-rs-runtime-owner-constants.js';

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

export {followerProgressSnapshot, peerSnapshot};
