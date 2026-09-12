import {PARTITION_SERVICE_ERROR_MSG} from
  '../../partition/partition-service-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../query-constants.js';

function isPrepareWriteConflictFailure(entry) {
  return entry?.error === PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT;
}

function projectTransactionParticipantFailure(result) {
  if (!result || result.success !== false) {
    return result;
  }
  if (result.errorCode === QUERY_ERROR_CODE.WRITE_CONFLICT) {
    return result;
  }
  if (
    result.errorCode !== QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE ||
    !Array.isArray(result.failedParticipants) ||
    !result.failedParticipants.some(isPrepareWriteConflictFailure)
  ) {
    return result;
  }
  return {
    ...result,
    errorCode: QUERY_ERROR_CODE.WRITE_CONFLICT,
    error: QUERY_ERROR_MSG.WRITE_CONFLICT,
  };
}

export {
  isPrepareWriteConflictFailure,
  projectTransactionParticipantFailure,
};
