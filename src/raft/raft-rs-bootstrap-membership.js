// What an rs-raft partition port opens its group from when the replica holds
// no durable record (owner decision O1, committed-read amendment 1, section
// 3.2): the bootstrap membership the partition hands its backend, turned into
// the raft peer ids of the core's initial configuration and the participation
// gate's bootstrap index.
//
//   GENESIS (a founder: the founding provisioner, a seed partition) - the
//     founding set, bootstrap index 0; a replica that says it joins an
//     existing group carries that, and is refused when it holds no record;
//   COMMITTED (a join) - the group's committed configuration as its leader
//     answered it at applied index j, plus this replica (owner decision O2),
//     learners passed through, bootstrap index j;
//   DURABLE_RECORD (a restart or rejoin) - nothing: the runtime owner restores
//     the record or refuses.
//
// Whatever the source, the bootstrap carries `identityExisted`: the opening
// host's authoritative row proves this replica identity existed before. The
// participation gate's opening admission refuses such an opening without a
// durable record (reseed-required, held); a record present restores as ever.
//
// Every stamp passes the one stamp validator (validateBootstrapMembershipStamp)
// here, whoever built it; an absent stamp is refused typed (STAMP_INVALID,
// defect MISSING) and never read as a genesis (verification V1a): the
// durable-record bootstrap is the only opening without a stamp. A refusal is
// the port's typed CORE_REFUSED, which the partition surfaces as its
// consensus init refusal. A replica with a durable record is restored from it
// whatever valid stamp it was handed. Nothing in this module reads a row.

import {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
} from './raft-committed-membership-constants.js';
import {ascendingPeerIdOrder} from './raft-rs-committed-membership-read.js';
import {validateBootstrapMembershipStamp} from
  './raft-committed-membership-stamp.js';
import {validateDurableRecordBootstrap} from
  './raft-committed-membership-stamp.js';
import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {RUNTIME_PHASE} from './raft-rs-runtime-owner-constants.js';

const GENESIS_BOOTSTRAP_INDEX = '0';

// The port refuses to open: a typed, non-retryable CORE_REFUSED carrying the
// stamp's defect, thrown so the partition's port opening surfaces it as its
// consensus init refusal.
function stampDefect(defect) {
  const consensus = deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: COMMITTED_MEMBERSHIP_REFUSAL.STAMP_INVALID,
    defect,
    phase: RUNTIME_PHASE.STAMP_VALIDATION,
    retryable: false,
    recoveryRequired: false,
  });
  return Object.assign(new Error(
    `raft-rs bootstrap membership refused: ${defect}`), {defect, consensus});
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
 * @param {Object} options - {membership, registry, peerId,
 *   joiningExistingGroup, identityExisted}: the request's bootstrap
 *   membership (a stamp, or the durable-record bootstrap), this replica's
 *   identity registry, its raft peer id, whether it joins a group that
 *   already exists, and whether the host's authoritative row proves this
 *   identity existed before.
 * @return {Object} Frozen {source, voters, learners, bootstrapIndex,
 *   selfCommittedVoter, joiningExistingGroup, identityExisted}.
 * @throws {Error} The typed STAMP_INVALID refusal (`consensus`) of an absent
 *   or invalid stamp.
 */
function bootstrapOfRequest({membership, registry, peerId,
  joiningExistingGroup, identityExisted}) {
  const existed = identityExisted === true;
  const durableRecord = validateDurableRecordBootstrap(membership);
  if (durableRecord.valid) {
    return Object.freeze({source: durableRecord.stamp.kind,
      voters: [], learners: [],
      bootstrapIndex: null, selfCommittedVoter: false,
      identityExisted: existed});
  }
  const validation = validateBootstrapMembershipStamp(membership);
  if (!validation.valid) {
    throw stampDefect(validation.defect);
  }
  const canonical = validation.stamp;
  if (canonical.kind === BOOTSTRAP_MEMBERSHIP_SOURCE.COMMITTED) {
    return Object.freeze({...committedBootstrap(canonical, registry, peerId),
      identityExisted: existed});
  }
  return Object.freeze({
    source: canonical.kind,
    voters: canonical.founders.map((identity) =>
      registry.registerReplica(identity)),
    learners: [],
    bootstrapIndex: GENESIS_BOOTSTRAP_INDEX,
    selfCommittedVoter: false,
    joiningExistingGroup: joiningExistingGroup === true,
    identityExisted: existed,
  });
}

export {bootstrapOfRequest};
