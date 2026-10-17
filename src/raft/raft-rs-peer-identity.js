// The mapping from a logical Lagrange replica to its raft-rs peer identity.
//
// §10 of the binding direction: raft-rs does not prevent logical peer-id
// reuse, so the obligation is Lagrange's. Five properties, and the mechanism
// that gives each one:
//
//   stable across process restart  the reservation is a durable row, and the
//                                  identity is derived from the replica's own
//                                  name, so even a lost file re-derives it;
//   independent of where a replica runs
//                                  the derivation reads the logical identity
//                                  and nothing else. Nothing about placement
//                                  reaches this module;
//   never list position            the identity is a digest of the replica's
//                                  own name. Registering the same replicas in
//                                  a different order, in a different file,
//                                  produces the same identities. The existing
//                                  raft-id-mapper allocates by iteration
//                                  order over an array and keeps the result
//                                  in memory only; that is exactly what is
//                                  NOT reused here;
//   never reassigned              reservation rows are append-only. Lifecycle
//                                  retirement is owned by the separate replica
//                                  lifecycle module and never mutates this map;
//   exact across the JavaScript boundary
//                                  the identity is a BigInt from the digest's
//                                  bytes and leaves as a decimal string. No
//                                  coercion to a JavaScript number occurs
//                                  anywhere on this path.
//
// The 63-bit width is deliberate: raft-rs takes a u64, and keeping the value
// below 2^63 means any projection of it into a signed 64-bit column is still
// the same value. Zero is the one identity raft-rs cannot use, so a digest
// that lands there is lifted by one.

import {createHash} from 'node:crypto';

import {
  RAFT_RS_LEARNER_ADMISSION_COLUMN,
  RAFT_RS_LEARNER_ORIGIN_COVERAGE,
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
  RAFT_RS_PEER_IDENTITY_SQL,
} from './raft-rs-peer-identity-constants.js';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'utf8';
const DIGEST_OFFSET = 0;
const IDENTITY_WIDTH_BITS = 63n;
const IDENTITY_MASK = (1n << IDENTITY_WIDTH_BITS) - 1n;
const LOWEST_USABLE_IDENTITY = 1n;
const EMPTY = 0;
const TYPE_STRING = 'string';
const ABSENT_ORIGIN_EVIDENCE = Object.freeze({
  coverage: RAFT_RS_LEARNER_ORIGIN_COVERAGE.ABSENT, encoded: null});
const UNVOUCHED_ORIGIN_EVIDENCE = Object.freeze({
  coverage: RAFT_RS_LEARNER_ORIGIN_COVERAGE.UNVOUCHED, encoded: null});

function validatedRaftRsPeerIdentityReservations(reservations) {
  if (!Array.isArray(reservations)) {
    throw new TypeError(RAFT_RS_PEER_IDENTITY_ERROR_MSG.RESERVATIONS_NOT_ARRAY);
  }
  const identities = new Set();
  const peerIds = new Set();
  return Object.freeze(reservations.map((reservation) => {
    const replicaIdentity = reservation?.replicaIdentity;
    const peerId = reservation?.peerId;
    const expectedPeerId = deriveRaftRsPeerId(replicaIdentity);
    if (typeof peerId !== TYPE_STRING || peerId !== expectedPeerId) {
      throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.bindingMismatch(
        replicaIdentity, peerId, expectedPeerId));
    }
    if (identities.has(replicaIdentity) || peerIds.has(peerId)) {
      throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.duplicateReservation(
        replicaIdentity, peerId));
    }
    identities.add(replicaIdentity);
    peerIds.add(peerId);
    const learnerAdmission = reservation.learnerAdmission ?? null;
    if (learnerAdmission !== null && typeof learnerAdmission !== TYPE_STRING) {
      throw new TypeError(RAFT_RS_PEER_IDENTITY_ERROR_MSG.LEARNER_ADMISSION_CONFLICT);
    }
    return Object.freeze({replicaIdentity, peerId,
      ...(learnerAdmission === null ? {} : {learnerAdmission})});
  }));
}

function readRaftRsPeerIdentityReservations(db) {
  return validatedRaftRsPeerIdentityReservations(
    db.prepare(RAFT_RS_PEER_IDENTITY_SQL.SELECT_ALL).all().map((row) => ({
      replicaIdentity: row.replica_identity,
      peerId: row.raft_peer_id,
      learnerAdmission: row.learner_admission,
    })));
}

/**
 * The raft-rs peer identity a logical Lagrange replica has, by derivation.
 * @param {string} replicaIdentity - The replica's own logical name.
 * @return {string} The identity, as an exact decimal string.
 */
function deriveRaftRsPeerId(replicaIdentity) {
  if (typeof replicaIdentity !== TYPE_STRING ||
    replicaIdentity.length === EMPTY) {
    throw new Error(
      RAFT_RS_PEER_IDENTITY_ERROR_MSG.invalidIdentity(replicaIdentity));
  }
  const digest = createHash(DIGEST_ALGORITHM)
    .update(replicaIdentity, DIGEST_ENCODING)
    .digest();
  const value = digest.readBigUInt64BE(DIGEST_OFFSET) & IDENTITY_MASK;
  return String(value === 0n ? LOWEST_USABLE_IDENTITY : value);
}

/**
 * The durable reservation of one replica's raft-rs peer identity.
 */
class RaftRsPeerIdentityRegistry {
  /**
   * @param {Object} db - A better-sqlite3 database this replica owns.
   */
  constructor(db) {
    this.db = db;
    this.db.exec(RAFT_RS_PEER_IDENTITY_SQL.CREATE_TABLE);
    const columns = this.db.prepare(RAFT_RS_PEER_IDENTITY_SQL.SELECT_COLUMNS).all();
    if (!columns.some(({name}) => name === RAFT_RS_LEARNER_ADMISSION_COLUMN)) {
      // No evidence is fabricated for an older reservation. Null stays unknown.
      this.db.exec(RAFT_RS_PEER_IDENTITY_SQL.ADD_LEARNER_ADMISSION);
    }
  }

  /**
   * @param {string} replicaIdentity - The replica.
   * @return {Object|undefined} Its reservation row.
   * @private
   */
  reservationFor(replicaIdentity) {
    return this.db.prepare(RAFT_RS_PEER_IDENTITY_SQL.SELECT_BY_IDENTITY)
      .get(replicaIdentity);
  }

  /**
   * @param {string} raftPeerId - A raft peer identity.
   * @return {Object|undefined} The reservation that holds it.
   * @private
   */
  reservationOfPeerId(raftPeerId) {
    return this.db.prepare(RAFT_RS_PEER_IDENTITY_SQL.SELECT_BY_PEER_ID)
      .get(raftPeerId);
  }

  /**
   * Reserve, or read back, this replica's raft-rs peer identity.
   *
   * Registration is idempotent. Lifecycle eligibility is deliberately not
   * represented here: this module owns only the append-only identity map.
   * @param {string} replicaIdentity - The replica's own logical name.
   * @return {string} Its identity, as an exact decimal string.
   */
  registerReplica(replicaIdentity) {
    return this.reserveCommittedReplica(
      replicaIdentity, deriveRaftRsPeerId(replicaIdentity));
  }

  /**
   * Reserve the exact logical identity carried by a committed configuration
   * entry. The peer id is still checked against this registry's deterministic
   * derivation, so committed context cannot authorize address-as-identity or
   * remap one logical replica to another peer id.
   * @param {string} replicaIdentity - The logical replica.
   * @param {string} raftPeerId - The committed raft peer id.
   * @return {string} Its identity, as an exact decimal string.
   */
  reserveCommittedReplica(replicaIdentity, raftPeerId) {
    const derived = deriveRaftRsPeerId(replicaIdentity);
    if (raftPeerId !== derived) {
      throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.bindingMismatch(
        replicaIdentity, raftPeerId, derived));
    }
    const existing = this.reservationFor(replicaIdentity);
    if (existing !== undefined) {
      if (existing.raft_peer_id !== raftPeerId) {
        throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.bindingMismatch(
          replicaIdentity, raftPeerId, existing.raft_peer_id));
      }
      return existing.raft_peer_id;
    }
    const holder = this.reservationOfPeerId(raftPeerId);
    if (holder !== undefined) {
      throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.collision(
        replicaIdentity, holder.replica_identity, raftPeerId));
    }
    this.db.prepare(RAFT_RS_PEER_IDENTITY_SQL.INSERT_RESERVATION)
      .run(replicaIdentity, raftPeerId);
    return raftPeerId;
  }

  /**
   * @param {string} replicaIdentity - The replica.
   * @return {string|null} Its reserved identity, or null.
   */
  raftPeerIdOf(replicaIdentity) {
    const reservation = this.reservationFor(replicaIdentity);
    return reservation === undefined ? null : reservation.raft_peer_id;
  }

  /**
   * The replica a raft peer identity belongs to.
   * @param {string} raftPeerId - The identity.
   * @return {string|null} The replica, or null.
   */
  replicaIdentityOf(raftPeerId) {
    const reservation = this.reservationOfPeerId(raftPeerId);
    return reservation === undefined ? null : reservation.replica_identity;
  }

  /** Persist native-validated origin inside the SAME committed-apply transaction.
   * The caller owns its canonical shape. This store never derives an outcome
   * from a reservation or accepts replacement of an already recorded origin.
   */
  recordCommittedLearnerAdmission(replicaIdentity, encoded) {
    if (!this.db.inTransaction) {
      throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.LEARNER_ADMISSION_TRANSACTION);
    }
    const row = this.reservationFor(replicaIdentity);
    if (!row || typeof encoded !== TYPE_STRING || encoded.length === EMPTY ||
        (row.learner_admission !== null && row.learner_admission !== encoded)) {
      throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.LEARNER_ADMISSION_CONFLICT);
    }
    if (row.learner_admission === null) {
      this.db.prepare(RAFT_RS_PEER_IDENTITY_SQL.RECORD_LEARNER_ADMISSION)
        .run(encoded, replicaIdentity);
    }
  }

  /** Raw stored evidence, decoded only by the native committed-context owner. */
  committedLearnerAdmission(replicaIdentity) {
    return this.reservationFor(replicaIdentity)?.learner_admission ?? null;
  }

  /**
   * What this registry vouches about one replica's committed learner origin
   * (RAFT_RS_LEARNER_ORIGIN_COVERAGE), with the raw stored origin when there
   * is one. Applying a managed ADD_LEARNER reserves the identity and records
   * its origin in one transaction, a stamp or image that folds it names the
   * identity while it is configured, and reservations are never removed, so
   * ABSENT vouches that no such ADD_LEARNER is in this replica's history. A
   * reservation without an origin (UNVOUCHED) vouches for nothing.
   * @param {string} replicaIdentity - The replica.
   * @return {Object} Frozen {coverage, encoded}; encoded is null unless RECORDED.
   */
  learnerOriginEvidence(replicaIdentity) {
    const row = this.reservationFor(replicaIdentity);
    if (row === undefined) return ABSENT_ORIGIN_EVIDENCE;
    return row.learner_admission === null ? UNVOUCHED_ORIGIN_EVIDENCE : Object.freeze({
      coverage: RAFT_RS_LEARNER_ORIGIN_COVERAGE.RECORDED, encoded: row.learner_admission});
  }

  /** All permanent reservations, in deterministic logical-identity order. */
  reservations() {
    return readRaftRsPeerIdentityReservations(this.db);
  }

  /**
   * What this registry holds for a raft peer identity, as a named state: a
   * peer the committed configuration names may have been reserved only on
   * another replica, which is an observation, not a failure.
   * @param {string} raftPeerId - The identity.
   * @return {Object} Frozen {status, replicaIdentity}: RESERVED with the
   *   replica, or UNRESERVED with replicaIdentity null.
   */
  resolveReplicaIdentity(raftPeerId) {
    const reservation = this.reservationOfPeerId(raftPeerId);
    return Object.freeze(reservation === undefined ? {
      status: RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED,
      replicaIdentity: null,
    } : {
      status: RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED,
      replicaIdentity: reservation.replica_identity,
    });
  }
}

export {
  RaftRsPeerIdentityRegistry,
  deriveRaftRsPeerId,
  readRaftRsPeerIdentityReservations,
  validatedRaftRsPeerIdentityReservations,
};
