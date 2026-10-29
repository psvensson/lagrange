import {PARTITION_SERVICE_ERROR_MSG} from
  '../../partition/partition-service-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../query-constants.js';

const LOCAL_STR_WRITE_WRITE_CONFLICT = 'Write-write conflict detected';

function isPrepareWriteConflictFailure(entry) {
  const errStr = String(entry?.error || entry?.message || '');
  return (
    entry?.error === PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT ||
    entry?.error === PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE ||
    entry?.errorCode === QUERY_ERROR_CODE.WRITE_CONFLICT ||
    errStr.includes(PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT) ||
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
  const errStr = String(result.error || result.message || '');
  if (
    typeof result.error === 'string' &&
    (errStr.includes(PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT) ||
      errStr.includes(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE) ||
      errStr.includes(LOCAL_STR_WRITE_WRITE_CONFLICT) ||
      errStr.includes(QUERY_ERROR_MSG.WRITE_CONFLICT))
  ) {
    return {
      ...result,
      errorCode: QUERY_ERROR_CODE.WRITE_CONFLICT,
      error: QUERY_ERROR_MSG.WRITE_CONFLICT,
    };
  }
  const hasParticipantFailure =
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
