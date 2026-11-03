// The one definition of when a CREATE's replica may already be named by its
// partition's committed configuration. The partition leader admits a joining
// replica from the admission input the target publishes for it; the target
// cannot observe that the admission has NOT committed (the leader may commit
// it after any read), so from the first phase whose input may exist, a failed
// CREATE keeps its removal obligation: its FAILED row carries the failed-create
// cleanup claim and the failed-create cleanup owner removes the member.
//
// Today the leader admits from the target's services row once its status is
// admissible (isPeerRowStatusAdmissible: SYNCING or later), published after
// the target's runtime opened. Two phases therefore carry the input:
// - RUNTIME_OPENED: this attempt opened the runtime (its SYNCING row follows);
// - ADMISSIBLE_ROW_RESUMED: this attempt re-drives a create whose durable row
//   an earlier incarnation already published at an admissible status (the
//   restart of a SYNCING row, verifier finding B1). The row is the input even
//   though this attempt writes nothing before its runtime step.
// A change of the admission point (for example admission from the committed
// operation) changes ADMISSION_INPUT_BY_PHASE below, and nothing else.
import {isPeerRowStatusAdmissible} from '../rebalancer/replica-status.js';

const REPLICA_CREATE_PHASE = Object.freeze({
  BEFORE_RUNTIME: 'before_runtime',
  ADMISSIBLE_ROW_RESUMED: 'admissible_row_resumed',
  RUNTIME_OPENED: 'runtime_opened',
});

const REPLICA_CREATE_ADMISSION_INPUT = Object.freeze({
  ABSENT: 'admission_input_absent',
  MAY_EXIST: 'admission_input_may_exist',
});

const ADMISSION_INPUT_BY_PHASE = Object.freeze({
  [REPLICA_CREATE_PHASE.BEFORE_RUNTIME]: REPLICA_CREATE_ADMISSION_INPUT.ABSENT,
  [REPLICA_CREATE_PHASE.ADMISSIBLE_ROW_RESUMED]:
    REPLICA_CREATE_ADMISSION_INPUT.MAY_EXIST,
  [REPLICA_CREATE_PHASE.RUNTIME_OPENED]: REPLICA_CREATE_ADMISSION_INPUT.MAY_EXIST,
});

// Phases only advance within one attempt.
const PHASE_ORDER = Object.freeze([
  REPLICA_CREATE_PHASE.BEFORE_RUNTIME,
  REPLICA_CREATE_PHASE.ADMISSIBLE_ROW_RESUMED,
  REPLICA_CREATE_PHASE.RUNTIME_OPENED,
]);

/**
 * @param {string} phase - A REPLICA_CREATE_PHASE value.
 * @return {string} The REPLICA_CREATE_ADMISSION_INPUT state of that phase;
 *   an unknown phase is treated as one whose admission input may exist.
 */
function replicaCreateAdmissionInputOf(phase) {
  return ADMISSION_INPUT_BY_PHASE[phase] ?? REPLICA_CREATE_ADMISSION_INPUT.MAY_EXIST;
}

/**
 * The phase a create reaches by re-driving a durable lifecycle row of its own
 * identity: a row the leader admits from is admission input already
 * published; any other (or no) row leaves the phase unchanged.
 * @param {string} phase - The current REPLICA_CREATE_PHASE.
 * @param {string|null|undefined} durableStatus - The resumed row's status.
 * @return {string} The advanced REPLICA_CREATE_PHASE.
 */
function replicaCreatePhaseAfterResume(phase, durableStatus) {
  if (typeof durableStatus !== 'string' || durableStatus.length === 0 ||
      !isPeerRowStatusAdmissible(durableStatus)) {
    return phase;
  }
  return PHASE_ORDER.indexOf(phase) >=
    PHASE_ORDER.indexOf(REPLICA_CREATE_PHASE.ADMISSIBLE_ROW_RESUMED) ?
    phase : REPLICA_CREATE_PHASE.ADMISSIBLE_ROW_RESUMED;
}

/**
 * Whether a failed CREATE claims failed-create cleanup (the exact rule,
 * R09-clarified 2026-11-02): a create whose admission input may exist ALWAYS
 * claims; a create whose admission input is absent claims unless its failure
 * is retryable (deferRetry), because the coordinator then re-dispatches the
 * same create identity (executor outcome DEFER_RETRY), which a cleanup claim
 * would block. deferRetry never decides a create whose input may exist.
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
  replicaCreatePhaseAfterResume,
};
