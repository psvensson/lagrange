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
  REPLICA_LEADER_CLEAR_DEFERRED,
  REPLICA_REMOVAL_COMPLETION_DEFERRED,
  buildFailedRemovalOutcome,
  removalRowDeleteDeferred,
  retryableRemovalDebtError,
};
