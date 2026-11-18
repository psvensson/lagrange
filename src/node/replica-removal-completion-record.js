/**
 * Owner contract:
 * Owner: the node-local record of one completed replica removal - the
 * handler's local replica entry set REMOVED by the removal's completion
 * callback (the only writer of REMOVED for a partition replica, run only
 * after the removal authority's requireComplete and the lifecycle owner's
 * REMOVED transition, which then drops the replica from tracking), stamped
 * with the operation that completed it.
 * Canonical output: whether a REMOVE delivery is a redelivery of that
 * completed removal - the same operation, no generation tracked by the
 * lifecycle owner, and the authoritative SERVICES row absent (the bound
 * removal authority is ABSENT). Then the removal is complete and the
 * delivery is answered COMPLETED (WP-A run 1: the ledger REMOVE redelivered
 * 72 ms after completion was answered ERROR and failed the operation).
 * Prohibited: no completion verdict from absence alone; a different
 * operation, a tracked (newer) generation or a present row is never answered
 * from this record.
 */
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {REMOVAL_AUTHORITY_KIND} from './replica-state-machine-recovery.js';

/**
 * Record one completed removal on the handler's local replica entry.
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} completion - {replicaId, partitionId, operationId,
 *   service}.
 * @return {Object} The local replica entry.
 */
function recordReplicaRemovalCompletion(handler, {replicaId, partitionId,
  operationId, service}) {
  return handler.setLocalReplica(replicaId, {
    replicaId,
    partitionId,
    status: ReplicaStatus.REMOVED,
    service,
    completedRemovalOperationId: operationId ?? null,
  });
}

/**
 * Whether one REMOVE delivery re-delivers the removal this node completed.
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} delivery - {replicaId, operationId, authority}: authority
 *   is the delivery's bound removal authority.
 * @return {boolean}
 */
function isRecordedReplicaRemovalCompletion(handler, {replicaId, operationId,
  authority}) {
  const record = handler.localReplicas.get(replicaId);
  return authority?.kind === REMOVAL_AUTHORITY_KIND.ABSENT &&
    record?.status === ReplicaStatus.REMOVED &&
    typeof operationId === 'string' && operationId.length > 0 &&
    record.completedRemovalOperationId === operationId &&
    handler.replicaStateMachine?.getState?.(replicaId) === null;
}

export {isRecordedReplicaRemovalCompletion, recordReplicaRemovalCompletion};
