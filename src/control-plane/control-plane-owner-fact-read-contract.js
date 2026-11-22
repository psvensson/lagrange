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
  // A leader whose applied position is behind the commit index it observed.
  APPLY_BEHIND_COMMIT: 'owner_fact_apply_behind_commit',
  // A leader that has not applied an entry of its own term (the raft owner's
  // currentTermApplied): entries an earlier leader committed may still be
  // missing from its state (raft-rs commits them only through such an entry).
  ELECTION_LOG_NOT_APPLIED: 'owner_fact_election_log_not_applied',
  BELOW_INDEX_FLOOR: 'owner_fact_below_index_floor',
  BELOW_TERM_FLOOR: 'owner_fact_below_term_floor',
  // The floor is a position of another raft group than the one read.
  FLOOR_OTHER_PARTITION: 'owner_fact_floor_other_partition',
  UNEXPECTED_SERVING_REPLICA: 'owner_fact_unexpected_serving_replica',
  // The serving leader did not declare the statement's row set complete.
  INCOMPLETE_ROW_SET: 'owner_fact_incomplete_row_set',
  // A leader is published but has no usable service. Only the published
  // leader is asked: the publication carries no term, so no other replica's
  // claim to lead can be ordered against it.
  PUBLISHED_LEADER_UNUSABLE: 'owner_fact_published_leader_unusable',
  // The leader's connection is inside a transaction its receiver did not
  // open: a read through it would see that transaction's staged rows.
  FOREIGN_TRANSACTION: 'owner_fact_foreign_transaction',
  // The answer's witness does not echo the leader-qualified read this caller
  // asked for (a shared, rebuilt or unqualified answer).
  ANSWER_FOR_ANOTHER_REQUEST: 'owner_fact_answer_for_another_request',
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
// The fields of each leaderRead kind on the wire, and of an owner-fact floor.
const LEADER_REQUIRED_READ_FIELDS = Object.freeze(['kind']);
const OWNER_FACT_READ_FIELDS = Object.freeze(['kind', 'floor']);
const FLOOR_FIELDS = Object.freeze(['partitionId', 'index', 'term']);

function hasExactly(value, fields) {
  return value !== null && typeof value === 'object' &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function isPosition(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * The owner-fact read point a request asks for: a floor typed by the raft
 * group it is a position of.
 * @param {Object} floor - {partitionId, index, term}.
 * @return {Object|null} The frozen owner-fact read {kind, floor}, or null
 *   when the floor is malformed.
 */
function ownerFactReadOf(floor) {
  if (!hasExactly(floor, FLOOR_FIELDS) || typeof floor.partitionId !== 'string' ||
      floor.partitionId.length === 0 || !isPosition(floor.index) ||
      !isPosition(floor.term)) {
    return null;
  }
  return Object.freeze({kind: LEADER_READ_KIND.OWNER_FACT, floor: Object.freeze({
    partitionId: floor.partitionId, index: floor.index, term: floor.term})});
}

/**
 * Parse the leaderRead field a receiver got (or a witness echoes).
 * @param {*} value - The leaderRead field.
 * @return {Object|null} The frozen read, or null when malformed.
 */
function leaderReadOf(value) {
  if (value?.kind === LEADER_READ_KIND.LEADER_REQUIRED &&
      hasExactly(value, LEADER_REQUIRED_READ_FIELDS)) {
    return LEADER_REQUIRED_READ;
  }
  return value?.kind === LEADER_READ_KIND.OWNER_FACT &&
    hasExactly(value, OWNER_FACT_READ_FIELDS) ? ownerFactReadOf(value.floor) : null;
}

// Whether a witness echoes exactly the owner-fact read asked for (kind and
// floor): the receiver puts the read it decided into its witness.
function echoesOwnerFactRead(echo, read) {
  const decided = leaderReadOf(echo);
  return decided?.kind === LEADER_READ_KIND.OWNER_FACT &&
    FLOOR_FIELDS.every((field) => decided.floor[field] === read.floor[field]);
}

/**
 * The leaderRead field a leader-REQUIRED read sends: the owner-fact read
 * point when the caller is readOwnerFact (it alone passes a floor), the
 * leader-required kind otherwise.
 * @param {Object|undefined} ownerFactFloor - readOwnerFact's typed floor
 *   {partitionId, index, term}.
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
  if (!echoesOwnerFactRead(witness.leaderRead, read)) {
    return OWNER_FACT_UNAVAILABLE_REASON.ANSWER_FOR_ANOTHER_REQUEST;
  }
  if (read.floor.partitionId !== witness.partitionId) {
    return OWNER_FACT_UNAVAILABLE_REASON.FLOOR_OTHER_PARTITION;
  }
  if (!isIndexPosition(witness) || witness.commitIndex > witness.appliedIndex) {
    return OWNER_FACT_UNAVAILABLE_REASON.APPLY_BEHIND_COMMIT;
  }
  if (witness.currentTermApplied !== true) {
    return OWNER_FACT_UNAVAILABLE_REASON.ELECTION_LOG_NOT_APPLIED;
  }
  if (witness.appliedIndex < read.floor.index) {
    return OWNER_FACT_UNAVAILABLE_REASON.BELOW_INDEX_FLOOR;
  }
  if (witness.term < read.floor.term) {
    return OWNER_FACT_UNAVAILABLE_REASON.BELOW_TERM_FLOOR;
  }
  return servedByExpectedReplica(witness, read.expectedReplica) ? null :
    OWNER_FACT_UNAVAILABLE_REASON.UNEXPECTED_SERVING_REPLICA;
}

/**
 * The one witness predicate of a leader-qualified read. Every such read asks
 * that the witness names a leader of the partition; an owner-fact read also
 * asks that the witness echoes exactly this read (kind and floor; the
 * receiver echoes the read it decided), that its floor is a position of the
 * partition read, and for an applied read point not behind the commit
 * index the leader observed, from a leader that has applied an entry of its
 * own term (so every entry an earlier leader committed), and meeting the floor (and, when pinned, the expected
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
 * The typed end of a leader-REQUIRED read that found no candidate while a
 * leader is published: the published leader has no usable service.
 * @param {boolean} leaderRequired - Whether the read requires the leader.
 * @param {Object} routingSnapshot - The routing snapshot it resolved.
 * @return {Object} {failureCode} or nothing.
 */
function publishedLeaderGapOf(leaderRequired, routingSnapshot) {
  const published = routingSnapshot?.canonicalLeaderNodeId;
  return leaderRequired === true && typeof published === 'string' && published.length > 0 ?
    {failureCode: OWNER_FACT_UNAVAILABLE_REASON.PUBLISHED_LEADER_UNUSABLE} : {};
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
  publishedLeaderGapOf,
};
