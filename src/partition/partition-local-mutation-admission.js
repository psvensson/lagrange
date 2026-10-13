// Direct local mutation has no replicated outcome. Once the current TX1
// generation origin exists, or while release admission is paused, this path is
// read-only. The partition write and participant owners remain the only
// replicated mutation paths.
import {readPartitionWriteOrigin} from
  './partition-participant-transaction-store.js';
import {participantCutoverPauseOf} from
  './partition-participant-transaction-pause.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_MESSAGE as MESSAGE,
} from './partition-participant-transaction-constants.js';

function refusalOf(service, failureCode, deferRetry = false) {
  return {success: false, operation: undefined, partitionId: service.partitionId,
    error: `${MESSAGE.REFUSED}${MESSAGE.CODE_SEPARATOR}${failureCode}`,
    failureCode, ...(deferRetry ? {deferRetry: true} : {})};
}

/**
 * Refuse an unreplicated local mutation when current mutation admission owns
 * the partition; null while bootstrap mutation remains admitted.
 * @param {Object} service - The partition.
 * @return {Object|null} Typed refusal, or null.
 */
function unreplicatedLocalMutationRefusal(service) {
  if (readPartitionWriteOrigin(service.db) !== null) {
    return refusalOf(service, CODE.UNREPLICATED_LOCAL_MUTATION);
  }
  return participantCutoverPauseOf(service) === null ? null :
    refusalOf(service, CODE.CUTOVER_PAUSED, true);
}

export {unreplicatedLocalMutationRefusal};
