// The identity of every operation the placement admission applier admits
// (quest replica-placement-admission-owner, design section 2.5 step 8): its
// operation_id is minted from the committed entry's apply index, unique by
// construction and identical on every replica, so it never collides with a
// retained terminal row; the new replica's replica_id is derived from that
// operation_id by the one digest rule (absorbed from the coordinator's
// REPLACE intent identity, which delegates here until it is deleted).
import {createHash} from 'node:crypto';
import {PLACEMENT_OPERATION_ID_PREFIX, PLACEMENT_OPERATION_ID_SEPARATOR} from
  '../rebalancer/replica-placement-owner-constants.js';

const REPLICA_ID_PREFIX = 'replace-replica-';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const ID_DIGEST_LENGTH = 32;

/**
 * @param {string} partitionId - The admitted operation's partition_id.
 * @param {number} applyIndex - The committed entry's log index.
 * @param {number} ordinal - The row's position in the admitted set.
 * @return {string} pl-<partitionId>-<applyIndex>-<n>.
 */
function placementOperationIdOf(partitionId, applyIndex, ordinal) {
  return `${PLACEMENT_OPERATION_ID_PREFIX}${partitionId}` +
    `${PLACEMENT_OPERATION_ID_SEPARATOR}${applyIndex}` +
    `${PLACEMENT_OPERATION_ID_SEPARATOR}${ordinal}`;
}

/**
 * The replica identity an operation creates, derived from its operation id.
 * @param {string} operationId - The operation id.
 * @return {string} The replica id.
 */
function placementReplicaIdOf(operationId) {
  return REPLICA_ID_PREFIX + createHash(HASH_ALGORITHM).update(operationId)
    .digest(HASH_ENCODING).slice(0, ID_DIGEST_LENGTH);
}

export {placementOperationIdOf, placementReplicaIdOf};
