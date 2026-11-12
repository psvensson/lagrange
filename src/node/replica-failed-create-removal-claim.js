/**
 * Owner contract:
 * Owner: the one predicate for "this authoritative services row is the
 * failed-create cleanup claim of this removal": the row the lifecycle
 * owner's exact-generation FAILED -> REMOVING transition wrote under a
 * failed-create remove token. That write is the only writer of such a token
 * and it verified the FAILED row against the cleanup's precondition, so the
 * durable row IS the claim. Two readings, by who drives the removal:
 *  - a REMOVE operation (matchesClaimedFailedCreateRemoval): the row holds
 *    the removal's OWN token, for the same replica identity, incarnation and
 *    create attempt as the FAILED row the cleanup was decided on (the
 *    precondition the REMOVE carries), and is of a later lifecycle
 *    generation than it;
 *  - the node's REMOVING re-drive, which carries no operation because the
 *    durable REMOVING row is its authority (replica-removal-settlement.js;
 *    the cleanup takeover reads the row's token the same way):
 *    isRowOwnedFailedCreateRemoval - the row of exactly this replica, group
 *    and node is REMOVING out of FAILED under a failed-create remove token,
 *    whichever operation's. A claimed removal whose operation ended while it
 *    held is finished by the re-drive under the claim its row still holds.
 * Inputs: the authoritative row; the precondition and token of a REMOVE
 * operation, or the re-driven replica's identity.
 * Consumers: the REMOVE's admission (replica-handler-remove-request-methods)
 * and the sole founder's group retirement (replica-removal-sole-founder).
 * Prohibited: a reading of the claim outside this module; a row-owned
 * reading for a removal that carries an operation.
 */
import {isFailedCreateRemoveToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';

function matchesFailedCreateCleanupPrecondition(precondition, expected) {
  if (!precondition || typeof precondition !== 'object' ||
      Array.isArray(precondition)) return false;
  return Object.entries(expected).every(
    ([field, value]) => precondition[field] === value,
  );
}

function isLaterLifecycleGeneration(row, precondition) {
  const sourceVersion = precondition?.state_entered_at;
  return Number.isFinite(sourceVersion) &&
    Number.isFinite(row?.state_entered_at) &&
    row.state_entered_at > sourceVersion;
}

function matchesClaimedFailedCreateRemoval(row, precondition, cleanupToken) {
  const identityMatches = matchesFailedCreateCleanupPrecondition(row, {
    service_id: precondition?.service_id,
    replica_id: precondition?.replica_id,
    group_id: precondition?.group_id ?? null,
    partition_id: precondition?.partition_id,
    node_id: precondition?.node_id,
    service_type: precondition?.service_type,
    created_at: precondition?.created_at,
    status: ReplicaStatus.REMOVING,
    previous_state: ReplicaStatus.FAILED,
    cleanup_token: cleanupToken,
    create_attempt_token: precondition?.create_attempt_token,
  });
  return identityMatches && isLaterLifecycleGeneration(row, precondition);
}

// The re-drive's reading: this replica's own row, claimed by the admission
// of some failed-create cleanup and still REMOVING out of FAILED.
function isRowOwnedFailedCreateRemoval(row, {replicaId, partitionId, nodeId}) {
  return matchesFailedCreateCleanupPrecondition(row, {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: nodeId,
    status: ReplicaStatus.REMOVING,
    previous_state: ReplicaStatus.FAILED,
  }) && isFailedCreateRemoveToken(row.cleanup_token);
}

export {
  isRowOwnedFailedCreateRemoval,
  matchesClaimedFailedCreateRemoval,
  matchesFailedCreateCleanupPrecondition,
};
