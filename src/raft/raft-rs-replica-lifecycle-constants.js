// Owned by the replica lifecycle owner (raft-rs-replica-lifecycle-owner.js):
// the durable table its rows live in and the row states it writes. A reader of
// that row names them through this module; a write stays with the owner and
// its named operations.
const REPLICA_LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';
const LIFECYCLE_STATE = Object.freeze({
  ACTIVE: 'active',
  RETIRED: 'retired',
});
// The lifecycle owner's own errors, whichever of its operations raises them.
const LIFECYCLE_ERROR = Object.freeze({
  // A lifecycle operation that commits with its caller's rows was called
  // outside the caller's open transaction; nothing was written.
  TRANSACTION_REQUIRED: 'replica-lifecycle-transaction-required',
});

export {LIFECYCLE_ERROR, LIFECYCLE_STATE, REPLICA_LIFECYCLE_TABLE};
