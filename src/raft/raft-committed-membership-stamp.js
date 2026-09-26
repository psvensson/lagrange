// The committed-membership stamp (owner decision O1, committed-read
// amendment 1, section 3.2): the one serialised shape a creator puts on a new
// replica and every carrier passes unchanged to the target's port.
//
//   COMMITTED - the answer of the group leader's committed-membership read,
//     as the read answered it: {kind, voters, votersOutgoing, learners,
//     appliedIndex (j), commitIndex, term, leaderId, gateOpen, identities};
//   GENESIS - a founding set of a partition no group exists for:
//     {kind, founders} (replica identities).
//
// The two stamp origins are the creation owner's bootstrap read (COMMITTED,
// joins) and the founding provisioner (GENESIS). The target validates a stamp
// on arrival and never falls back to rows; the replica list a stamp yields is
// an address-hint list in ascending raft peer id order, never membership.

import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from './raft-committed-membership-constants.js';
import {ascendingPeerIdOrder} from './raft-rs-committed-membership-read.js';
import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';
import {deepFreeze} from './raft-operation-port.js';

const TYPE_STRING = 'string';

function invalid(defect) {
  return Object.freeze({valid: false,
    reason: COMMITTED_MEMBERSHIP_REFUSAL.STAMP_INVALID, defect});
}

const VALID = Object.freeze({valid: true});

function peerIdMatches(peerId, identity) {
  return typeof identity === TYPE_STRING && identity.length > 0 &&
    deriveRaftRsPeerId(identity) === String(peerId);
}

function committedStampDefect(stamp) {
  if (!Number.isSafeInteger(stamp.appliedIndex) || stamp.appliedIndex <= 0) {
    return COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_BOOTSTRAP_INDEX;
  }
  if (!Array.isArray(stamp.voters) || stamp.voters.length === 0) {
    return COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_VOTERS;
  }
  if ((stamp.votersOutgoing || []).length > 0) {
    return COMMITTED_MEMBERSHIP_STAMP_DEFECT.JOINT;
  }
  return identityDefect(stamp);
}

// Every id of the configuration names the replica identity it derives from.
function identityDefect(stamp) {
  const identities = stamp.identities || {};
  for (const peerId of [...stamp.voters, ...(stamp.learners || [])]) {
    const identity = identities[String(peerId)];
    if (identity === null || identity === undefined) {
      return COMMITTED_MEMBERSHIP_STAMP_DEFECT.IDENTITY_UNRESOLVED;
    }
    if (!peerIdMatches(peerId, identity)) {
      return COMMITTED_MEMBERSHIP_STAMP_DEFECT.IDENTITY_MISMATCH;
    }
  }
  return null;
}

/**
 * Validate a dispatched stamp on arrival: COMMITTED needs a committed index
 * j > 0, a non-joint configuration with voters, and every id resolvable to
 * the replica identity it derives from; GENESIS needs founders. Anything
 * else (no stamp, an unknown kind) is invalid.
 * @param {Object|null|undefined} stamp - The dispatched stamp.
 * @return {Object} Frozen {valid: true} or {valid: false, reason:
 *   STAMP_INVALID, defect}.
 */
function validateBootstrapMembershipStamp(stamp) {
  if (stamp === null || stamp === undefined || typeof stamp !== 'object') {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MISSING);
  }
  if (stamp.kind === COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED) {
    const defect = committedStampDefect(stamp);
    return defect === null ? VALID : invalid(defect);
  }
  if (stamp.kind === COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS) {
    return Array.isArray(stamp.founders) && stamp.founders.length > 0 &&
      stamp.founders.every((founder) => typeof founder === TYPE_STRING &&
        founder.length > 0) ?
      VALID : invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_FOUNDERS);
  }
  return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.UNKNOWN_KIND);
}

/**
 * The replica identities a valid stamp names, plus the new replica itself,
 * in ascending raft peer id order: the address-hint list of the new replica
 * (never its membership - the port opens from the stamp).
 * @param {Object} stamp - A valid stamp.
 * @param {string} replicaId - The new replica.
 * @return {Array<string>} Replica identities.
 */
function replicaIdsOfStamp(stamp, replicaId) {
  const named = stamp.kind === COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED ?
    Object.values(stamp.identities) : stamp.founders;
  const identities = [...new Set([...named, replicaId])];
  return identities
    .map((identity) => [deriveRaftRsPeerId(identity), identity])
    .sort(([left], [right]) => ascendingPeerIdOrder(left, right))
    .map(([, identity]) => identity);
}

/**
 * The COMMITTED stamp of a leader's committed-membership answer: the answer
 * itself, unchanged.
 * @param {Object} answer - A COMMITTED answer.
 * @return {Object|null} The stamp, or null when the answer is not COMMITTED.
 */
function committedStampOfAnswer(answer) {
  return answer?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ?
    deepFreeze({...answer}) : null;
}

/**
 * The GENESIS stamp of a founding set.
 * @param {Array<string>} founders - The founding replica identities.
 * @return {Object} Frozen {kind: GENESIS, founders}.
 */
function genesisStamp(founders) {
  return deepFreeze({kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
    founders: [...founders]});
}

export {
  committedStampOfAnswer,
  genesisStamp,
  replicaIdsOfStamp,
  validateBootstrapMembershipStamp,
};
