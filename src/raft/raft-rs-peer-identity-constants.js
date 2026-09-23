// The durable reservation of raft-rs peer identities, and what it refuses.
//
// One append-only row per logical Lagrange replica, kept forever. Replica
// lifecycle is owned by raft-rs-replica-lifecycle-owner.js, not this map.

const RAFT_RS_PEER_IDENTITY_TABLE = 'raft_rs_peer_identity';

const RAFT_RS_PEER_IDENTITY_SQL = Object.freeze({
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS ${RAFT_RS_PEER_IDENTITY_TABLE} (
      replica_identity TEXT PRIMARY KEY,
      raft_peer_id TEXT NOT NULL UNIQUE
    )
  `,
  SELECT_BY_IDENTITY: `
    SELECT replica_identity, raft_peer_id
    FROM ${RAFT_RS_PEER_IDENTITY_TABLE}
    WHERE replica_identity = ?
  `,
  SELECT_BY_PEER_ID: `
    SELECT replica_identity, raft_peer_id
    FROM ${RAFT_RS_PEER_IDENTITY_TABLE}
    WHERE raft_peer_id = ?
  `,
  INSERT_RESERVATION: `
    INSERT INTO ${RAFT_RS_PEER_IDENTITY_TABLE}
      (replica_identity, raft_peer_id)
    VALUES (?, ?)
  `,
});

// What looking up a raft peer id finds: the replica it was reserved for, or
// no reservation at all (a peer the committed configuration names that this
// replica's registry never reserved).
const RAFT_RS_PEER_IDENTITY_RESOLUTION = Object.freeze({
  RESERVED: 'reserved',
  UNRESERVED: 'unreserved',
});

const RAFT_RS_PEER_IDENTITY_ERROR_MSG = Object.freeze({
  invalidIdentity: (value) =>
    'a Lagrange replica identity must be a non-empty string, got ' +
    `${JSON.stringify(value)}`,
  unreserved: (raftPeerId) => `unknown raft-rs peer identity ${raftPeerId}`,
  collision: (replicaIdentity, holder, raftPeerId) =>
    `raft peer id ${raftPeerId} is already reserved for ${holder}, so ` +
    `${replicaIdentity} cannot take it. Two logical replicas may never ` +
    'share one raft peer id',
});

export {
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
  RAFT_RS_PEER_IDENTITY_SQL,
};
