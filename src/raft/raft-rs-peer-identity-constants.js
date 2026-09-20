// The durable reservation of raft-rs peer identities, and what it refuses.
//
// One row per logical Lagrange replica, kept forever. A retired replica's row
// stays, which is what makes "never reassigned after retirement" a property
// of the record rather than of a process that happens to still be running.

const RAFT_RS_PEER_IDENTITY_TABLE = 'raft_rs_peer_identity';

const RAFT_RS_PEER_IDENTITY_SQL = Object.freeze({
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS ${RAFT_RS_PEER_IDENTITY_TABLE} (
      replica_identity TEXT PRIMARY KEY,
      raft_peer_id TEXT NOT NULL UNIQUE,
      retired INTEGER NOT NULL DEFAULT 0
    )
  `,
  SELECT_BY_IDENTITY: `
    SELECT replica_identity, raft_peer_id, retired
    FROM ${RAFT_RS_PEER_IDENTITY_TABLE}
    WHERE replica_identity = ?
  `,
  SELECT_BY_PEER_ID: `
    SELECT replica_identity, raft_peer_id, retired
    FROM ${RAFT_RS_PEER_IDENTITY_TABLE}
    WHERE raft_peer_id = ?
  `,
  INSERT_RESERVATION: `
    INSERT INTO ${RAFT_RS_PEER_IDENTITY_TABLE}
      (replica_identity, raft_peer_id, retired)
    VALUES (?, ?, 0)
  `,
  RETIRE: `
    UPDATE ${RAFT_RS_PEER_IDENTITY_TABLE}
    SET retired = 1
    WHERE replica_identity = ?
  `,
});

const RAFT_RS_PEER_IDENTITY_RETIRED = Object.freeze({NO: 0, YES: 1});

const RAFT_RS_PEER_IDENTITY_ERROR_MSG = Object.freeze({
  invalidIdentity: (value) =>
    'a Lagrange replica identity must be a non-empty string, got ' +
    `${JSON.stringify(value)}`,
  retired: (replicaIdentity, raftPeerId) =>
    `raft peer id ${raftPeerId} was reserved for ${replicaIdentity}, which ` +
    'has retired. It is never handed to another logical replica, and a ' +
    'replica that comes back is a new logical replica with its own identity',
  collision: (replicaIdentity, holder, raftPeerId) =>
    `raft peer id ${raftPeerId} is already reserved for ${holder}, so ` +
    `${replicaIdentity} cannot take it. Two logical replicas may never ` +
    'share one raft peer id',
  unknownReplica: (replicaIdentity) =>
    `${replicaIdentity} has no reserved raft peer id, so there is nothing ` +
    'to retire; a replica is registered before it is retired',
});

export {
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
  RAFT_RS_PEER_IDENTITY_RETIRED,
  RAFT_RS_PEER_IDENTITY_SQL,
};
