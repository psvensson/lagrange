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
// A REMOVE of a replica this node already removed, whose durable row is
// ABSENT, asked by an operation other than the one that removed it: final
// (no later state changes the answer), so never deferred.
const REPLICA_ABSENT_NOT_BY_OPERATION = 'REPLICA_ABSENT_NOT_BY_OPERATION';
// A removal whose replica has no evidence it left consensus (no port to read
// its applied configuration through while its durable lifecycle still holds
// an active record): nothing local retires; its owner re-drives it.
const REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED =
  'REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED';
// A removal resumed without a consensus port whose group (its leader's
// committed configuration) still names the replica: it must take part again
// before it can be removed; nothing retires.
const REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT =
  'REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT';
// A removal whose replica's participant custody is not proven settled (a
// durable PREPARED participant, volatile participant work, or custody that
// cannot be read): nothing is retired, deleted or completed; the PREPARED
// state is kept until its decision settles it.
const REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED =
  'REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED';

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

/**
 * The typed, final answer of a REMOVE whose replica is already absent, not
 * by the asking operation.
 * @param {string} replicaId
 * @param {string|null} operationId - The asking operation.
 * @return {Error} deferRetry false, code REPLICA_ABSENT_NOT_BY_OPERATION.
 */
function replicaAbsentNotByOperationError(replicaId, operationId) {
  const error = new Error(`Replica ${replicaId} is already absent; it was ` +
    `not removed by operation ${operationId}`);
  error.code = REPLICA_ABSENT_NOT_BY_OPERATION;
  error.errorCode = REPLICA_ABSENT_NOT_BY_OPERATION;
  error.deferRetry = false;
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
  REPLICA_ABSENT_NOT_BY_OPERATION,
  REPLICA_LEADER_CLEAR_DEFERRED,
  REPLICA_REMOVAL_COMPLETION_DEFERRED,
  REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED,
  REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED,
  REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT,
  buildFailedRemovalOutcome,
  removalRowDeleteDeferred,
  replicaAbsentNotByOperationError,
  retryableRemovalDebtError,
};
