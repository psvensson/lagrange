// The durable reservation of raft-rs peer identities, and what it refuses.
//
// One append-only row per logical Lagrange replica, kept forever. Replica
// lifecycle is owned by raft-rs-replica-lifecycle-owner.js, not this map.
//
// node_id is the node the replica was admitted on, recorded from a committed
// fact only (a founding stamp, a committed stamp, the committed admission
// context of an ADD, a snapshot image), once, never replaced. It is never an
// input to the peer-id derivation, which stays placement-independent.

const RAFT_RS_PEER_IDENTITY_TABLE = 'raft_rs_peer_identity';
const RAFT_RS_LEARNER_ADMISSION_COLUMN = 'learner_admission';
const RAFT_RS_NODE_ID_COLUMN = 'node_id';

const RAFT_RS_PEER_IDENTITY_SQL = Object.freeze({
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS ${RAFT_RS_PEER_IDENTITY_TABLE} (
      replica_identity TEXT PRIMARY KEY,
      raft_peer_id TEXT NOT NULL UNIQUE,
      learner_admission TEXT,
      node_id TEXT
    )
  `,
  SELECT_BY_IDENTITY: `
    SELECT replica_identity, raft_peer_id, learner_admission, node_id
    FROM ${RAFT_RS_PEER_IDENTITY_TABLE}
    WHERE replica_identity = ?
  `,
  SELECT_BY_PEER_ID: `
    SELECT replica_identity, raft_peer_id, learner_admission, node_id
    FROM ${RAFT_RS_PEER_IDENTITY_TABLE}
    WHERE raft_peer_id = ?
  `,
  SELECT_ALL: `
    SELECT replica_identity, raft_peer_id, learner_admission, node_id
    FROM ${RAFT_RS_PEER_IDENTITY_TABLE}
    ORDER BY replica_identity
  `,
  SELECT_COLUMNS: `SELECT name FROM pragma_table_info('${RAFT_RS_PEER_IDENTITY_TABLE}')`,
  ADD_LEARNER_ADMISSION: `ALTER TABLE ${RAFT_RS_PEER_IDENTITY_TABLE}
    ADD COLUMN learner_admission TEXT`,
  ADD_NODE_ID: `ALTER TABLE ${RAFT_RS_PEER_IDENTITY_TABLE}
    ADD COLUMN node_id TEXT`,
  RECORD_NODE_ID: `UPDATE ${RAFT_RS_PEER_IDENTITY_TABLE}
    SET node_id = ?
    WHERE replica_identity = ? AND node_id IS NULL`,
  RECORD_LEARNER_ADMISSION: `UPDATE ${RAFT_RS_PEER_IDENTITY_TABLE}
    SET learner_admission = ?
    WHERE replica_identity = ? AND learner_admission IS NULL`,
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

// What this registry can vouch about one replica's committed learner origin:
// RECORDED (an origin is stored), ABSENT (no reservation at all: nothing this
// registry ever applied, bootstrapped from, installed or proposed named the
// replica) or UNVOUCHED (a reservation without an origin, which proves
// nothing: a stamp or image bootstrap folds history it never applied, an older
// schema migrated its rows to NULL, a local proposal or address hint reserves
// before any application).
const RAFT_RS_LEARNER_ORIGIN_COVERAGE = Object.freeze({
  RECORDED: 'recorded',
  ABSENT: 'absent',
  UNVOUCHED: 'unvouched',
});

// Why a peer has no address: no committed node for it in this replica's
// identity record (it is not in the configuration this replica applied, or
// no committed fact placed it). The per-peer delivery outcome carries it.
const RAFT_RS_PEER_ADDRESS_REFUSAL = Object.freeze({
  PEER_NOT_IN_CONFIGURATION: 'peer_not_in_configuration',
  // A host-side address read with no usable status of its own group: the
  // configuration that would place the peer could not be read.
  CONFIGURATION_UNAVAILABLE: 'peer_configuration_unavailable',
});

const RAFT_RS_PEER_IDENTITY_ERROR_MSG = Object.freeze({
  LEARNER_ADMISSION_CONFLICT: 'committed learner origin conflicts with permanent identity',
  LEARNER_ADMISSION_TRANSACTION: 'committed learner origin requires the application transaction',
  NODE_ID_CONFLICT: 'committed node identity conflicts with the recorded one',
  RESERVATIONS_NOT_ARRAY:
    'raft-rs peer identity reservations must be an array',
  duplicateReservation: (replicaIdentity, peerId) =>
    'duplicate raft-rs peer identity reservation for ' +
    `${replicaIdentity}/${peerId}`,
  invalidIdentity: (value) =>
    'a Lagrange replica identity must be a non-empty string, got ' +
    `${JSON.stringify(value)}`,
  unreserved: (raftPeerId) => `unknown raft-rs peer identity ${raftPeerId}`,
  collision: (replicaIdentity, holder, raftPeerId) =>
    `raft peer id ${raftPeerId} is already reserved for ${holder}, so ` +
    `${replicaIdentity} cannot take it. Two logical replicas may never ` +
    'share one raft peer id',
  bindingMismatch: (replicaIdentity, raftPeerId, expectedPeerId) =>
    `committed membership context binds ${replicaIdentity} to raft peer id ` +
    `${raftPeerId}, expected ${expectedPeerId}`,
});

export {
  RAFT_RS_LEARNER_ADMISSION_COLUMN,
  RAFT_RS_NODE_ID_COLUMN,
  RAFT_RS_LEARNER_ORIGIN_COVERAGE,
  RAFT_RS_PEER_ADDRESS_REFUSAL,
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
  RAFT_RS_PEER_IDENTITY_SQL,
};
