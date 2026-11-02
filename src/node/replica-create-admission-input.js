// The one definition of when a CREATE's replica may already be named by its
// partition's committed configuration. The partition leader admits a joining
// replica from the admission input the target publishes for it; the target
// cannot observe that the admission has NOT committed (the leader may commit
// it after any read), so from the first phase whose input may exist, a failed
// CREATE keeps its removal obligation: its FAILED row carries the failed-create
// cleanup claim and the failed-create cleanup owner removes the member.
//
// Today the leader admits from the target's SYNCING services row
// (partition-service-raft-peer-cache-reconciliation.js isPeerRowStatusAdmissible),
// which is published only after the target's runtime opened. A change of the
// admission point (for example admission from the committed operation) changes
// ADMISSION_INPUT_MAY_EXIST_BY_PHASE below, and nothing else.

const REPLICA_CREATE_PHASE = Object.freeze({
  BEFORE_RUNTIME: 'before_runtime',
  RUNTIME_OPENED: 'runtime_opened',
});

const REPLICA_CREATE_ADMISSION_INPUT = Object.freeze({
  ABSENT: 'admission_input_absent',
  MAY_EXIST: 'admission_input_may_exist',
});

const ADMISSION_INPUT_BY_PHASE = Object.freeze({
  [REPLICA_CREATE_PHASE.BEFORE_RUNTIME]: REPLICA_CREATE_ADMISSION_INPUT.ABSENT,
  [REPLICA_CREATE_PHASE.RUNTIME_OPENED]: REPLICA_CREATE_ADMISSION_INPUT.MAY_EXIST,
});

/**
 * @param {string} phase - A REPLICA_CREATE_PHASE value.
 * @return {string} The REPLICA_CREATE_ADMISSION_INPUT state of that phase;
 *   an unknown phase is treated as one whose admission input may exist.
 */
function replicaCreateAdmissionInputOf(phase) {
  return ADMISSION_INPUT_BY_PHASE[phase] ?? REPLICA_CREATE_ADMISSION_INPUT.MAY_EXIST;
}

/**
 * Whether a failed CREATE claims failed-create cleanup. Only a failure whose
 * admission input is absent may stay unclaimed, and only when it is retryable:
 * the coordinator then re-dispatches the same create identity (executor
 * outcome DEFER_RETRY), which a cleanup claim would block.
 * @param {string} phase - The REPLICA_CREATE_PHASE the CREATE failed in.
 * @param {Error} error - The CREATE failure.
 * @return {boolean}
 */
function failedReplicaCreateClaimsCleanup(phase, error) {
  return replicaCreateAdmissionInputOf(phase) ===
      REPLICA_CREATE_ADMISSION_INPUT.MAY_EXIST ||
    error?.deferRetry !== true;
}

export {
  REPLICA_CREATE_PHASE,
  failedReplicaCreateClaimsCleanup,
};
