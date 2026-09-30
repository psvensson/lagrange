// The one read of a replica group's committed configuration (owner decision
// O1, committed-read amendment 1, section 3.1), shaped from the runtime
// owner's recorded observation: the configuration, the applied index of that
// same observation (never the core's own `applied`), the commit index, the
// term, the leader, the participation gate, and the replica identity of
// every id - as frozen data. No core, store, handle or mutable structure
// crosses; the runtime owner reads the core, this only shapes what it read.
//
// A bootstrap read is answered by the leader alone and refuses what a new
// replica cannot bootstrap from (a joint configuration, an id without a
// reserved identity); a witness read answers any replica's own applied
// configuration with unresolved identities as null.

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from './raft-committed-membership-constants.js';
import {
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';
import {ROLE_LEADER} from './raft-rs-runtime-owner-constants.js';

// Raft peer ids are decimal strings without leading zeros: the shorter one
// is the smaller, and equal lengths compare as text. Ascending id order is
// the one deterministic order of a membership list.
function ascendingPeerIdOrder(left, right) {
  return left.length - right.length || left.localeCompare(right);
}

function sortedIds(ids) {
  return [...(ids || [])].map(String).sort(ascendingPeerIdOrder);
}

/**
 * A typed refusal of the read.
 * @param {string} reason - A COMMITTED_MEMBERSHIP_REFUSAL.
 * @param {Object} [fields] - {leaderAddress} for NOT_LEADER.
 * @return {Object} Frozen {kind: REFUSED, reason, ...}.
 */
function committedMembershipRefusal(reason, fields = {}) {
  return deepFreeze({kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED, reason,
    ...fields});
}

/**
 * Every id of the configuration mapped to its reserved replica identity, or
 * null where this replica never reserved it.
 * @param {Object} group - The runtime group (resolvePeerIdentity).
 * @param {Array<string>} ids - The configuration's ids.
 * @return {Object} {peerId: replicaIdentity|null}.
 */
function identitiesOf(group, ids) {
  const identities = {};
  for (const id of ids) {
    const resolved = String(id) === String(group.peerId) ?
      {status: RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED,
        replicaIdentity: group.replicaIdentity} :
      group.resolvePeerIdentity(id);
    identities[String(id)] =
      resolved.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED ?
        resolved.replicaIdentity : null;
  }
  return identities;
}

/**
 * The answer a shaped status (one recorded observation) gives the read.
 * @param {Object} group - The runtime group.
 * @param {Object} status - The frozen status the runtime owner shaped from
 *   its recorded observation, or its typed failure.
 * @param {string} purpose - A COMMITTED_MEMBERSHIP_READ_PURPOSE.
 * @return {Object} The frozen answer or refusal.
 */
function answerCommittedMembership(group, status, purpose) {
  if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.HELD);
  }
  const bootstrap = purpose !== COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS;
  if (bootstrap && status.role !== ROLE_LEADER) {
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.NOT_LEADER,
      {leaderAddress: status.leaderAddress ?? null});
  }
  const confState = status.confState;
  const voters = sortedIds(confState.voters);
  const votersOutgoing = sortedIds(confState.votersOutgoing);
  const learners = sortedIds(confState.learners);
  if (bootstrap && votersOutgoing.length > 0) {
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.JOINT);
  }
  let identities;
  try {
    identities = identitiesOf(group,
      [...new Set([...voters, ...votersOutgoing, ...learners])]);
  } catch {
    // The registry itself could not be read: the replica cannot answer.
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.HELD);
  }
  if (bootstrap && Object.values(identities).some((identity) =>
    identity === null)) {
    return committedMembershipRefusal(
      COMMITTED_MEMBERSHIP_REFUSAL.IDENTITY_UNRESOLVED);
  }
  return deepFreeze({
    kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
    voters,
    votersOutgoing,
    learners,
    appliedIndex: status.appliedIndex,
    commitIndex: status.commitIndex,
    term: status.term,
    leaderId: status.leaderId ?? null,
    gateOpen: status.gateOpen,
    identities,
  });
}

export {
  answerCommittedMembership,
  ascendingPeerIdOrder,
  committedMembershipRefusal,
};
