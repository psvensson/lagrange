// The one answer a partition entry gives a serving request on a replica
// whose persistence the lifecycle owner released (closePartitionPersistence
// Resources: shutdown, removal teardown, a failed initialization): the
// replica is no longer where this partition is served. That is a routing
// fact, never a failure of the request: the answer is typed and retryable,
// so its sender re-routes (to the partition's current replica) instead of
// failing. It covers a request that arrives after the release and one whose
// continuation resumes after it (a remote query, a write, a system-table
// write or a transaction control that reached the released connection, as
// the participant store's typed CONNECTION_CLOSED or a read through the
// connection the owner set to null). The closure is the decision; the
// failure the continuation met is carried as its cause.
import {participantStoreConnectionStateOf} from
  './partition-participant-transaction-store.js';
import {
  PARTICIPANT_STORE_CONNECTION_STATE as CONNECTION_STATE,
} from './partition-participant-transaction-constants.js';

const PARTITION_SERVICE_CLOSED = Object.freeze({
  CODE: 'partition_service_closed',
  MESSAGE: 'Partition replica closed: its persistence was released; ' +
    're-route to the partition\'s current replica',
});

/**
 * Whether the replica's persistence is released (the lifecycle owner closed
 * or never opened its connection).
 * @param {Object} service - The partition service.
 * @return {boolean}
 */
function isPartitionServiceClosed(service) {
  return participantStoreConnectionStateOf(service.db) ===
    CONNECTION_STATE.CLOSED;
}

/**
 * The service-closed refusal.
 * @param {Object} service - The partition service.
 * @param {Error|null} [cause] - What the continuation met at the released
 *   connection, or null when the request arrived after the release.
 * @return {Object} Frozen typed refusal.
 */
function partitionServiceClosedRefusal(service, cause = null) {
  return Object.freeze({
    success: false,
    error: PARTITION_SERVICE_CLOSED.MESSAGE,
    errorCode: PARTITION_SERVICE_CLOSED.CODE,
    code: PARTITION_SERVICE_CLOSED.CODE,
    deferRetry: true,
    partitionId: service.partitionId,
    replicaId: service.replicaId,
    // The participant store's CONNECTION_CLOSED, when that is what the
    // continuation met (absent for a request that arrived after release).
    causeCode: cause === null ? null : cause.code,
  });
}

export {
  PARTITION_SERVICE_CLOSED,
  isPartitionServiceClosed,
  partitionServiceClosedRefusal,
};
