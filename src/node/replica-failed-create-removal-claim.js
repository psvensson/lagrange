/**
 * Owner contract:
 * Owner: the one predicate for "this authoritative services row is the
 * failed-create cleanup claim of this removal": the row the lifecycle
 * owner's exact-generation FAILED -> REMOVING transition wrote under the
 * removal's own failed-create remove token, for the same replica identity,
 * incarnation and create attempt as the FAILED row the cleanup was decided
 * on (its precondition), and of a later lifecycle generation than it.
 * Inputs: the authoritative row, the precondition the REMOVE carries, the
 * removal's failed-create remove token.
 * Consumers: the REMOVE's admission (replica-handler-remove-request-methods)
 * and the sole founder's group retirement (replica-removal-sole-founder).
 * Prohibited: a second, looser reading of the claim anywhere.
 */
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

export {
  matchesClaimedFailedCreateRemoval,
  matchesFailedCreateCleanupPrecondition,
};
