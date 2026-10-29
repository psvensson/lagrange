import {PARTITION_SERVICE_ERROR_MSG} from
  '../../partition/partition-service-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../query-constants.js';

function isPrepareWriteConflictFailure(entry) {
  return (
    entry?.error === PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT ||
    entry?.error === PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE ||
    entry?.errorCode === QUERY_ERROR_CODE.WRITE_CONFLICT
  );
}

function projectTransactionParticipantFailure(result) {
  if (!result || result.success !== false) {
    return result;
  }
  if (result.errorCode === QUERY_ERROR_CODE.WRITE_CONFLICT) {
    return result;
  }
  if (
    typeof result.error === 'string' &&
    (result.error.includes(PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT) ||
      result.error.includes(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE))
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
