import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE,
} from '../../partition/partition-participant-transaction-constants.js';
import {PARTITION_SERVICE_ERROR_MSG} from
  '../../partition/partition-service-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../query-constants.js';

const LOCAL_STR_WRITE_WRITE_CONFLICT = 'Write-write conflict detected';
const TX1_CONFLICT_FAILURE_CODES = new Set([
  PARTICIPANT_TRANSACTION_FAILURE_CODE.ALREADY_ACTIVE,
  PARTICIPANT_TRANSACTION_FAILURE_CODE.PREPARING,
  PARTICIPANT_TRANSACTION_FAILURE_CODE.PREPARE_CONTENT_CONFLICT,
  PARTICIPANT_TRANSACTION_FAILURE_CODE.REPLAY_DIVERGED,
]);

function isTypedTx1ConflictFailure(entry) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  if (TX1_CONFLICT_FAILURE_CODES.has(entry.failureCode)) {
    return true;
  }
  return (
    entry.failureCode === PARTICIPANT_TRANSACTION_FAILURE_CODE.PREPARE_REFUSED &&
    entry.refusalCause === PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT
  );
}

function isPrepareWriteConflictFailure(entry) {
  const errStr = String(entry?.error || entry?.message || '');
  return (
    isTypedTx1ConflictFailure(entry) ||
    entry?.error === PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT ||
    entry?.error === PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE ||
    entry?.errorCode === QUERY_ERROR_CODE.WRITE_CONFLICT ||
    entry?.errorCode === QUERY_ERROR_CODE.TRANSACTION_CONFLICT ||
    errStr.includes(PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT) ||
    errStr.includes(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE) ||
    errStr.includes(LOCAL_STR_WRITE_WRITE_CONFLICT) ||
    errStr.includes(QUERY_ERROR_MSG.WRITE_CONFLICT)
  );
}

function projectTransactionParticipantFailure(result) {
  if (!result || result.success !== false) {
    return result;
  }
  if (result.errorCode === QUERY_ERROR_CODE.WRITE_CONFLICT) {
    return result;
  }
  if (isPrepareWriteConflictFailure(result)) {
    return {
      ...result,
      errorCode: QUERY_ERROR_CODE.WRITE_CONFLICT,
      error: QUERY_ERROR_MSG.WRITE_CONFLICT,
    };
  }
  const hasParticipantFailure =
    isPrepareWriteConflictFailure(result.firstFailedParticipant) ||
    (Array.isArray(result.failedParticipants) &&
      result.failedParticipants.some(isPrepareWriteConflictFailure)) ||
    (Array.isArray(result.participantFailures) &&
      result.participantFailures.some(isPrepareWriteConflictFailure));

  if (hasParticipantFailure) {
    return {
      ...result,
      errorCode: QUERY_ERROR_CODE.WRITE_CONFLICT,
      error: QUERY_ERROR_MSG.WRITE_CONFLICT,
    };
  }
  return result;
}

export {
  isPrepareWriteConflictFailure,
  projectTransactionParticipantFailure,
};
