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
//   never reassigned after retirement
//                                  the retired replica's row stays. A retired
//                                  identity still resolves to the replica
//                                  that owned it, so it can never be handed
//                                  to another one, and the refusal is read
//                                  from the record rather than from a set a
//                                  process happens to be holding;
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
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
  RAFT_RS_PEER_IDENTITY_RETIRED,
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
   * Registration is idempotent for a live replica and refused by name for a
   * retired one: a replica that comes back is a new logical replica.
   * @param {string} replicaIdentity - The replica's own logical name.
   * @return {string} Its identity, as an exact decimal string.
   */
  registerReplica(replicaIdentity) {
    const derived = deriveRaftRsPeerId(replicaIdentity);
    const existing = this.reservationFor(replicaIdentity);
    if (existing !== undefined) {
      if (existing.retired === RAFT_RS_PEER_IDENTITY_RETIRED.YES) {
        throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.retired(
          replicaIdentity, existing.raft_peer_id));
      }
      return existing.raft_peer_id;
    }
    const holder = this.reservationOfPeerId(derived);
    if (holder !== undefined) {
      throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.collision(
        replicaIdentity, holder.replica_identity, derived));
    }
    this.db.prepare(RAFT_RS_PEER_IDENTITY_SQL.INSERT_RESERVATION)
      .run(replicaIdentity, derived);
    return derived;
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
   * The replica a raft peer identity belongs to, retired or not. A retired
   * identity still resolves, which is what keeps it out of circulation.
   * @param {string} raftPeerId - The identity.
   * @return {string|null} The replica, or null.
   */
  replicaIdentityOf(raftPeerId) {
    const reservation = this.reservationOfPeerId(raftPeerId);
    return reservation === undefined ? null : reservation.replica_identity;
  }

  /**
   * Retire a replica. Its row stays, so its identity is reserved forever.
   * @param {string} replicaIdentity - The replica.
   * @return {string} The identity now retired.
   */
  retireReplica(replicaIdentity) {
    const reservation = this.reservationFor(replicaIdentity);
    if (reservation === undefined) {
      throw new Error(
        RAFT_RS_PEER_IDENTITY_ERROR_MSG.unknownReplica(replicaIdentity));
    }
    this.db.prepare(RAFT_RS_PEER_IDENTITY_SQL.RETIRE).run(replicaIdentity);
    return reservation.raft_peer_id;
  }
}

export {RaftRsPeerIdentityRegistry};
