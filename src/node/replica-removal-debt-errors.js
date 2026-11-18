/**
 * The replica removal's typed, retryable debt errors and the failed-removal
 * outcome built from them: a removal step whose durable owner is not yet
 * settled (the REMOVING generation unbound, the canonical leader clear
 * pending, the REMOVING row not yet deletable) throws one of these; the
 * executor outcome carries its code, retry hint and mutation outcome.
 */
import {REPLICA_HANDLER_TYPEOF} from './replica-handler-constants.js';

const REPLICA_REMOVAL_COMPLETION_DEFERRED =
  'REPLICA_REMOVAL_COMPLETION_DEFERRED';
const REPLICA_LEADER_CLEAR_DEFERRED = 'REPLICA_LEADER_CLEAR_DEFERRED';
const REPLICA_REMOVAL_AUTHORITY_DEFERRED = 'REPLICA_REMOVAL_AUTHORITY_DEFERRED';
const REPLICA_REMOVAL_CREATE_ADMISSION_DEFERRED =
  'REPLICA_REMOVAL_CREATE_ADMISSION_DEFERRED';
// Why the CREATE admission of the generation a REMOVING intent would name is
// not closed yet; each is cleared by its own owner's fact, never by time.
const CREATE_ADMISSION_CLOSE_DEFERRAL = Object.freeze({
  LIFECYCLE_AUTHORITY_UNAVAILABLE: 'lifecycle_authority_unavailable',
  LIFECYCLE_ROW_ABSENT: 'lifecycle_row_absent',
  CENSUS_UNAVAILABLE: 'census_unavailable',
  ADMISSION_HELD: 'admission_held',
});

function retryableRemovalDebtError(code, message, metadata = {}) {
  const error = new Error(message);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = true;
  if (Number.isFinite(metadata.retryAfterMs)) {
    error.retryAfterMs = metadata.retryAfterMs;
  }
  if (typeof metadata.mutationOutcome === REPLICA_HANDLER_TYPEOF.STRING) {
    error.mutationOutcome = metadata.mutationOutcome;
  }
  return error;
}

function removalRowDeleteDeferred(replicaId, metadata = {}) {
  return retryableRemovalDebtError(
    REPLICA_REMOVAL_COMPLETION_DEFERRED,
    `Replica REMOVING row deletion deferred for ${replicaId}`,
    metadata,
  );
}

// The authoritative lifecycle read a removal decision needs did not answer:
// an unavailability, never a refusal of the removal.
function removalAuthorityDeferred(replicaId) {
  return retryableRemovalDebtError(
    REPLICA_REMOVAL_AUTHORITY_DEFERRED,
    `Replica removal lifecycle authority unavailable for ${replicaId}`,
  );
}

// The removal is deferred before its durable REMOVING intent: the CREATE
// admission of the generation that intent would name is not closed.
function createAdmissionCloseDeferred(replicaId, reason, cause = null) {
  const error = retryableRemovalDebtError(
    REPLICA_REMOVAL_CREATE_ADMISSION_DEFERRED,
    `Replica removal deferred before its REMOVING intent for ${replicaId}: ` +
      `CREATE admission not closed (${reason})`,
  );
  error.deferralReason = reason;
  if (cause) error.cause = cause;
  return error;
}

function buildFailedRemovalOutcome(replicaId, error) {
  const outcome = {replicaId, errorMessage: error.message};
  if (error?.deferRetry === true) outcome.deferRetry = true;
  const errorCode = typeof error?.errorCode === REPLICA_HANDLER_TYPEOF.STRING ?
    error.errorCode :
    typeof error?.code === REPLICA_HANDLER_TYPEOF.STRING ? error.code : null;
  if (errorCode) outcome.errorCode = errorCode;
  if (Number.isFinite(error?.retryAfterMs)) {
    outcome.retryAfterMs = error.retryAfterMs;
  }
  if (typeof error?.mutationOutcome === REPLICA_HANDLER_TYPEOF.STRING) {
    outcome.mutationOutcome = error.mutationOutcome;
  }
  return outcome;
}

export {
  CREATE_ADMISSION_CLOSE_DEFERRAL,
  REPLICA_LEADER_CLEAR_DEFERRED,
  REPLICA_REMOVAL_COMPLETION_DEFERRED,
  buildFailedRemovalOutcome,
  createAdmissionCloseDeferred,
  removalAuthorityDeferred,
  removalRowDeleteDeferred,
  retryableRemovalDebtError,
};
