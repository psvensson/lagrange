// What an rs-raft partition port opens its group from when the replica holds
// no durable record (owner decision O1, committed-read amendment 1, section
// 3.2): the bootstrap membership the partition hands its backend, turned into
// the raft peer ids of the core's initial configuration and the participation
// gate's bootstrap index.
//
//   GENESIS (the default: a founder, a seed partition) - the founding set,
//     bootstrap index 0;
//   COMMITTED (a join) - the group's committed configuration as its leader
//     answered it at applied index j, plus this replica (owner decision O2),
//     learners passed through, bootstrap index j;
//   DURABLE_RECORD (a restart or rejoin) - nothing: the runtime owner restores
//     the record or refuses.
//
// A replica with a durable record is restored from it whatever it was handed
// here. Nothing in this module reads a row.

import {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
} from './raft-committed-membership-constants.js';
import {ascendingPeerIdOrder} from './raft-rs-committed-membership-read.js';

const GENESIS_BOOTSTRAP_INDEX = '0';

function stampDefect(defect) {
  return Object.assign(new Error(
    `raft-rs bootstrap membership refused: ${defect}`), {defect});
}

function committedBootstrap(membership, registry, peerId) {
  const identities = membership.identities || {};
  for (const [raftPeerId, replicaIdentity] of Object.entries(identities)) {
    if (typeof replicaIdentity !== 'string' ||
        registry.registerReplica(replicaIdentity) !== String(raftPeerId)) {
      throw stampDefect(COMMITTED_MEMBERSHIP_STAMP_DEFECT.IDENTITY_MISMATCH);
    }
  }
  const voters = (membership.voters || []).map(String);
  const learners = (membership.learners || []).map(String);
  const self = String(peerId);
  const selfCommittedVoter = voters.includes(self);
  // Under O2 a joiner names itself in its own bootstrap configuration; the
  // participation gate, not the configuration, holds it until the group's
  // own applied AddNode admits it.
  const joins = !selfCommittedVoter && !learners.includes(self);
  return {
    source: BOOTSTRAP_MEMBERSHIP_SOURCE.COMMITTED,
    voters: (joins ? [...voters, self] : voters).sort(ascendingPeerIdOrder),
    learners,
    bootstrapIndex: String(membership.appliedIndex),
    selfCommittedVoter,
  };
}

/**
 * The bootstrap the runtime owner opens a group from when it holds no record.
 * @param {Object} options - {membership, bootstrapPeerIds, registry, peerId}:
 *   the request's bootstrap membership (absent: a genesis of the bootstrap
 *   peer ids), the request's bootstrap peer ids, this replica's identity
 *   registry and its raft peer id.
 * @return {Object} Frozen {source, voters, learners, bootstrapIndex,
 *   selfCommittedVoter}.
 */
function bootstrapOfRequest({membership, bootstrapPeerIds, registry,
  peerId}) {
  const kind = membership?.kind ?? BOOTSTRAP_MEMBERSHIP_SOURCE.GENESIS;
  if (kind === BOOTSTRAP_MEMBERSHIP_SOURCE.COMMITTED) {
    return Object.freeze(committedBootstrap(membership, registry, peerId));
  }
  if (kind === BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD) {
    return Object.freeze({source: kind, voters: [], learners: [],
      bootstrapIndex: null, selfCommittedVoter: false});
  }
  if (kind !== BOOTSTRAP_MEMBERSHIP_SOURCE.GENESIS) {
    throw stampDefect(COMMITTED_MEMBERSHIP_STAMP_DEFECT.UNKNOWN_KIND);
  }
  const founders = membership?.founders ?? bootstrapPeerIds;
  return Object.freeze({
    source: kind,
    voters: founders.map((identity) => registry.registerReplica(identity)),
    learners: [],
    bootstrapIndex: GENESIS_BOOTSTRAP_INDEX,
    selfCommittedVoter: false,
  });
}

export {bootstrapOfRequest};
