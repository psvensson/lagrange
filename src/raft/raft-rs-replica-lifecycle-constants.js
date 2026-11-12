import {COMMITTED_MEMBERSHIP_REFUSAL} from
  './raft-committed-membership-constants.js';
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
  DATABASE_CUSTODY_REQUIRED: 'replica-database-custody-owner-required',
  // A lifecycle operation that commits with its caller's rows was called
  // outside the caller's open transaction; nothing was written.
  TRANSACTION_REQUIRED: 'replica-lifecycle-transaction-required',
});

const LIFECYCLE_REASON = Object.freeze({
  MISSING: 'lifecycle-record-missing',
  ACTIVE: 'lifecycle-active',
  CLAIM_SETTLED: 'lifecycle-claim-settled',
  OBSERVATION_UNAVAILABLE: 'lifecycle-observation-unavailable',
  STAGING_PREPARED: 'snapshot-lifecycle-prepared',
  ORIGINAL_PREPARED: 'original-allocation-lifecycle-prepared',
  ORIGINAL_ROW_PRESENT: 'original-allocation-lifecycle-row-present',
  IDENTITY_MISMATCH: 'lifecycle-identity-mismatch',
  RETIRED: 'retired',
  STALE_RUNTIME_GENERATION: 'runtime-generation-not-registered',
  // A replica whose own history was proven lost while it ran (owner decision
  // O4): retired with this reason, it is refused with it, also after a
  // restart.
  RESEED_REQUIRED: COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED,
});
// The birth of a replica database (birthReplicaLifecycle).
const LIFECYCLE_BIRTH = Object.freeze({
  BORN: 'lifecycle-born',
  UNPROVEN: 'lifecycle-birth-unproven',
  NOT_EMPTY: 'lifecycle-birth-database-not-empty',
});
// The construction seam's exclusive file acquisition, never inferred from size.
const REPLICA_DATABASE_CREATION = Object.freeze({
  NEW: 'replica-database-created',
  EXISTING: 'replica-database-existing',
});

// Shared by the owner's runtime refusal and its read-only snapshot observation.
function retiredRefusalReason(reason) {
  return reason === COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED ?
    COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED : LIFECYCLE_STATE.RETIRED;
}

export {LIFECYCLE_ERROR, LIFECYCLE_STATE, REPLICA_LIFECYCLE_TABLE,
  LIFECYCLE_REASON, LIFECYCLE_BIRTH, REPLICA_DATABASE_CREATION,
  retiredRefusalReason};
