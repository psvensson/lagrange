/** Control-plane failure payload shaping for ReplicaOperationRepository.
 * Pure translation of a gateway result/error into the repository's failure
 * record; no retry, authority or ownership decision lives here.
 */
import {NUM} from '../constants/index.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
} from '../control-plane/control-plane-error-classification.js';

const isRecord = (value) => Boolean(value) && typeof value === 'object';
const stringOrNull = (value) => (typeof value === 'string' ? value : null);
function participantFailuresOf(resultOrError) {
  return Array.isArray(resultOrError?.participantFailures) ?
    resultOrError.participantFailures.filter((entry) => isRecord(entry)) :
    [];
}
function firstFailedParticipantOf(resultOrError, participantFailures, clone) {
  if (isRecord(resultOrError?.firstFailedParticipant)) {
    return clone ? {...resultOrError.firstFailedParticipant} : resultOrError.firstFailedParticipant;
  }
  return participantFailures.length > 0 ? participantFailures[0] : null;
}
function failedTableNameOf(resultOrError, firstFailedParticipant) {
  return stringOrNull(resultOrError?.tableName) ??
    stringOrNull(firstFailedParticipant?.failedTable);
}
function buildControlPlaneFailurePayload(nodeId, resultOrError) {
  const participantFailures = participantFailuresOf(resultOrError).slice(0, NUM.THREE);
  const firstFailedParticipant =
    firstFailedParticipantOf(resultOrError, participantFailures, false);
  return {
    error: resultOrError?.error || resultOrError?.message || null,
    nodeId,
    code: getControlPlaneErrorCode(resultOrError) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(resultOrError),
    reasonCode: stringOrNull(resultOrError?.reasonCode),
    participationKind: stringOrNull(resultOrError?.participationKind),
    tableName: failedTableNameOf(resultOrError, firstFailedParticipant),
    participantFailures,
    firstFailedParticipant,
  };
}
function cloneControlPlaneFailureParticipants(resultOrError) {
  const participantFailures = participantFailuresOf(resultOrError).map((entry) => ({...entry}));
  const firstFailedParticipant =
    firstFailedParticipantOf(resultOrError, participantFailures, true);
  return {participantFailures, firstFailedParticipant};
}

export {buildControlPlaneFailurePayload, cloneControlPlaneFailureParticipants};
