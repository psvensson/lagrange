// The original seed allocation is a fact of the existing replica lifecycle
// row. These are its durable states, not startup readiness or placement.
const ORIGINAL_ALLOCATION = Object.freeze({
  VERSION: 1,
  PREPARING: 'PREPARING',
  ISSUED: 'ISSUED',
  UNUSED: 'UNUSED',
  SUBMITTED: 'SUBMITTED',
  TRANSFERRED: 'TRANSFERRED',
  LIVE_ISSUER: 'LIVE_ISSUER',
  COLD_RECOVERY: 'COLD_RECOVERY',
  ABSENT: 'ABSENT',
  PRESENT: 'PRESENT',
  UNAVAILABLE: 'UNAVAILABLE',
  HISTORY_ACCEPTED: 'ORIGINAL_HISTORY_ACCEPTED',
  HOLD: 'ORIGINAL_ALLOCATION_HOLD',
  DEFERRED: 'HANDOFF_COMPLETE_SERVING_DEFERRED',
});

const ORIGINAL_ALLOCATION_REASON = Object.freeze({
  AUTHORITY: 'original-allocation-authority-unavailable',
  DIRECTORY: 'original-allocation-directory-custody-unavailable',
  CLOSED: 'original-allocation-attempt-closed',
  REENTRANT: 'original-allocation-preparation-already-started',
  INCOMPLETE: 'original-allocation-incomplete',
  IDENTITY: 'original-allocation-identity-mismatch',
  HISTORY: 'original-allocation-history-unavailable',
  SPENT: 'original-allocation-current-authority-required',
  TRANSITION: 'original-allocation-right-transition-invalid',
  RESOURCE: 'original-allocation-resource-unreleased',
  CONTRARY: 'original-allocation-contrary-durable-work',
  OBSERVATION: 'original-allocation-observation-unavailable',
  NATIVE: 'original-allocation-native-entry-refused',
});

const ORIGINAL_ALLOCATION_COLUMN = Object.freeze({
  DECLARATION: 'original_allocation',
  MEMBER: 'original_allocation_member',
  ISSUE: 'original_allocation_issue',
  SERVICE_RIGHT: 'original_service_right',
  IDENTITY_RIGHT: 'original_identity_right',
});

// Consumption is monotonic. TRANSFERRED has no successor, and a duplicate
// submission must not authorize a second external INSERT.
const ORIGINAL_RIGHT_SUCCESSOR = Object.freeze({
  [ORIGINAL_ALLOCATION.UNUSED]: ORIGINAL_ALLOCATION.SUBMITTED,
  [ORIGINAL_ALLOCATION.SUBMITTED]: ORIGINAL_ALLOCATION.TRANSFERRED,
});

const REPLICA_LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';

function originalAllocationError(reason, detail = null, cause = undefined) {
  return Object.assign(new Error(reason, cause === undefined ? undefined : {cause}), {
    code: ORIGINAL_ALLOCATION.HOLD,
    reason,
    detail,
  });
}

export {ORIGINAL_ALLOCATION, ORIGINAL_ALLOCATION_REASON,
  ORIGINAL_ALLOCATION_COLUMN, ORIGINAL_RIGHT_SUCCESSOR,
  REPLICA_LIFECYCLE_TABLE, originalAllocationError};
