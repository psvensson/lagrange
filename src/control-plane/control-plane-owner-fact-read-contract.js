// The owner-defined shapes of a leader-qualified system-table read (S0 of the
// fallback-read closure): the reasons an owner fact is unavailable, the field
// a request carries to its receiver, and the one predicate that both the
// receiver (on its own consensus observation) and the caller (on the witness
// it received) apply. readOwnerFact (control-plane-owner-fact-read.js) is the
// only issuer of the owner-fact kind; every other leader-REQUIRED read carries
// the leader-required kind, which the receiver refuses when it does not lead.
//
// What a witness that passes the owner-fact predicate guarantees, and what it
// does not, is stated in architecture/contracts/authority-and-recovery.md
// ("Owner fact and hint"). It is a leader-local read point, not a
// linearizable read: no quorum round confirms leadership when the rows are
// read.
import {isValidLeaderReadAuthorityWitness} from
  './control-plane-authoritative-read-witness.js';

const OWNER_FACT_UNAVAILABLE_REASON = Object.freeze({
  // The read threw or failed with no typed owner-fact refusal (no candidate,
  // transport, pressure deferral, deadline).
  READ_FAILED: 'owner_fact_read_failed',
  // The replica that answered does not lead, or stopped leading (another
  // term, another runtime) before its read finished.
  NOT_LEADER: 'owner_fact_not_leader',
  // A leader whose applied index is not its commit index.
  APPLY_BEHIND_COMMIT: 'owner_fact_apply_behind_commit',
  // A leader that has not applied every entry its log held when it was
  // elected: entries an earlier leader committed may still be missing from
  // its state (raft-rs commits them only through an entry of its own term).
  ELECTION_LOG_NOT_APPLIED: 'owner_fact_election_log_not_applied',
  // The leader's applied index moved while it read: the receiver cannot name
  // the applied position of the snapshot its rows came from.
  READ_POINT_MOVED: 'owner_fact_read_point_moved',
  BELOW_INDEX_FLOOR: 'owner_fact_below_index_floor',
  BELOW_TERM_FLOOR: 'owner_fact_below_term_floor',
  UNEXPECTED_SERVING_REPLICA: 'owner_fact_unexpected_serving_replica',
  // The serving leader did not declare the statement's row set complete.
  INCOMPLETE_ROW_SET: 'owner_fact_incomplete_row_set',
});
const OWNER_FACT_UNAVAILABLE_REASONS = new Set(
  Object.values(OWNER_FACT_UNAVAILABLE_REASON));

// The request field a leader-qualified read carries to its receiver.
const LEADER_READ_REQUEST_FIELD = 'leaderRead';
const LEADER_READ_KIND = Object.freeze({
  LEADER_REQUIRED: 'leader_required',
  OWNER_FACT: 'owner_fact',
});
// The receiver's refusal of a leaderRead field it cannot parse.
const LEADER_READ_REQUEST_MALFORMED = 'leader_read_request_malformed';
const LEADER_REQUIRED_READ = Object.freeze({
  kind: LEADER_READ_KIND.LEADER_REQUIRED,
});
// The fields of each leaderRead kind on the wire.
const LEADER_REQUIRED_READ_FIELDS = Object.freeze(['kind']);
const OWNER_FACT_READ_FIELDS = Object.freeze(['kind', 'minimumIndex', 'minimumTerm']);

function isFloor(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * The owner-fact read point a request asks for.
 * @param {Object} floor - {minimumIndex, minimumTerm}.
 * @return {Object|null} The frozen owner-fact read, or null when malformed.
 */
function ownerFactReadOf(floor) {
  if (!isFloor(floor?.minimumIndex) || !isFloor(floor?.minimumTerm)) {
    return null;
  }
  return Object.freeze({kind: LEADER_READ_KIND.OWNER_FACT,
    minimumIndex: floor.minimumIndex, minimumTerm: floor.minimumTerm});
}

/**
 * Parse the leaderRead field a receiver got.
 * @param {*} value - The request's leaderRead field.
 * @return {Object|null} The frozen read, or null when malformed.
 */
function leaderReadOf(value) {
  const fieldCount = value !== null && typeof value === 'object' ?
    Object.keys(value).length : 0;
  if (value?.kind === LEADER_READ_KIND.LEADER_REQUIRED &&
      fieldCount === LEADER_REQUIRED_READ_FIELDS.length) {
    return LEADER_REQUIRED_READ;
  }
  return value?.kind === LEADER_READ_KIND.OWNER_FACT &&
    fieldCount === OWNER_FACT_READ_FIELDS.length ? ownerFactReadOf(value) : null;
}

/**
 * The leaderRead field a leader-REQUIRED read sends: the owner-fact read
 * point when the caller is readOwnerFact (it alone passes a floor), the
 * leader-required kind otherwise.
 * @param {Object|undefined} ownerFactFloor - readOwnerFact's floor.
 * @return {Object} The frozen leaderRead field.
 */
function leaderReadRequestOf(ownerFactFloor) {
  if (ownerFactFloor === undefined) {
    return LEADER_REQUIRED_READ;
  }
  const read = ownerFactReadOf(ownerFactFloor);
  if (read === null) {
    throw new TypeError(LEADER_READ_REQUEST_MALFORMED);
  }
  return read;
}

function isIndexPosition(witness) {
  return [witness.appliedIndex, witness.commitIndex, witness.term]
    .every(Number.isSafeInteger);
}

function servedByExpectedReplica(witness, expectedReplica) {
  return expectedReplica === undefined ||
    (witness.servingNodeId === expectedReplica.nodeId &&
      witness.servingReplicaId === expectedReplica.replicaId);
}

function ownerFactPointRefusal(witness, read) {
  if (!isIndexPosition(witness) || witness.commitIndex !== witness.appliedIndex) {
    return OWNER_FACT_UNAVAILABLE_REASON.APPLY_BEHIND_COMMIT;
  }
  if (witness.electionLogApplied !== true) {
    return OWNER_FACT_UNAVAILABLE_REASON.ELECTION_LOG_NOT_APPLIED;
  }
  if (witness.appliedIndex < read.minimumIndex) {
    return OWNER_FACT_UNAVAILABLE_REASON.BELOW_INDEX_FLOOR;
  }
  if (witness.term < read.minimumTerm) {
    return OWNER_FACT_UNAVAILABLE_REASON.BELOW_TERM_FLOOR;
  }
  return servedByExpectedReplica(witness, read.expectedReplica) ? null :
    OWNER_FACT_UNAVAILABLE_REASON.UNEXPECTED_SERVING_REPLICA;
}

/**
 * The one witness predicate of a leader-qualified read. A leader-required
 * read asks only that the witness names a leader of the partition; an
 * owner-fact read also asks for an applied read point that is the leader's
 * commit index, covers every entry the leader's log held when it was
 * elected, and meets the caller's floors (and, when pinned, the expected
 * serving replica).
 * @param {Object} witness - The serving replica's readAuthorityWitness.
 * @param {Object} expectation - {partitionId, read}; read is a parsed
 *   leaderRead, optionally with expectedReplica.
 * @return {string|null} An OWNER_FACT_UNAVAILABLE_REASON, or null.
 */
function leaderReadWitnessRefusal(witness, {partitionId, read}) {
  if (!isValidLeaderReadAuthorityWitness(witness, partitionId)) {
    return OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER;
  }
  return read.kind === LEADER_READ_KIND.OWNER_FACT ?
    ownerFactPointRefusal(witness, read) : null;
}

/**
 * The reason a failed read answer names, when it is one of the owner-fact
 * reasons; READ_FAILED otherwise.
 * @param {*} answer - A failed read answer.
 * @return {string} An OWNER_FACT_UNAVAILABLE_REASON.
 */
function ownerFactFailureReasonOf(answer) {
  return OWNER_FACT_UNAVAILABLE_REASONS.has(answer?.failureCode) ?
    answer.failureCode : OWNER_FACT_UNAVAILABLE_REASON.READ_FAILED;
}

export {
  LEADER_READ_KIND,
  LEADER_READ_REQUEST_FIELD,
  LEADER_READ_REQUEST_MALFORMED,
  LEADER_REQUIRED_READ,
  OWNER_FACT_UNAVAILABLE_REASON,
  leaderReadOf,
  leaderReadRequestOf,
  leaderReadWitnessRefusal,
  ownerFactFailureReasonOf,
  ownerFactReadOf,
};
