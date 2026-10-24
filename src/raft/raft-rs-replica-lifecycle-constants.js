// Owned by the replica lifecycle owner (raft-rs-replica-lifecycle-owner.js):
// the durable table its rows live in and the row states it writes. A reader of
// that row names them through this module; a write stays with the owner and
// its named operations.
const REPLICA_LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';
const LIFECYCLE_STATE = Object.freeze({
  ACTIVE: 'active',
  RETIRED: 'retired',
});

export {LIFECYCLE_STATE, REPLICA_LIFECYCLE_TABLE};
