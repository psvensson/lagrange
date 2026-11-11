/**
 * Owner contract:
 * Owner: the node's settlement of a replica whose removal state has no
 * running removal to carry it (2026-11-11), so no removal deferral is left
 * without something that clears it:
 *  - REMOVING_REDRIVE: a replica whose durable row reads REMOVING with no
 *    removal running here (a node restarted mid-removal; a removal that
 *    deferred) is re-driven through the one removal path on its lifecycle
 *    owner's REMOVING re-drive signal (the state machine's TIMEOUT for a
 *    REMOVING replica, re-armed every bound) - the durable REMOVING row is
 *    the removal's authority, so the re-drive needs no operation. The
 *    removal itself decides teardown from exact evidence (its own applied
 *    configuration, or its group's when it has no port).
 *  - REMOVED_OUTSIDE_REMOVAL: a replica whose own applied configuration no
 *    longer names it (absent past its gate) while no removal runs and its
 *    row serves (an earlier leader's RemoveNode that committed after its
 *    removal was cancelled) stops serving - its admission fence is raised -
 *    and is marked FAILED with this named cause: the repair path removes
 *    the FAILED replica through the removal owner (its exit is its applied
 *    removal) and the planner restores the replica count from the ACTIVE
 *    rows. Never a voter-less replica serving.
 * Inputs: the lifecycle owner's TIMEOUT events; the node's consensus relay
 *   (each tracked partition's applied configuration announcements).
 * Prohibited: a teardown here (only the removal owner tears down), a
 * decision from a row or from elapsed time alone (the TIMEOUT only re-asks).
 */
import {readPartitionReplicaMembership} from
  '../partition/partition-service-raft-membership-administration.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE as MEMBERSHIP} from
  '../partition/partition-replica-membership-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {REPLICA_HANDLER_LOG_MSG} from './replica-handler-constants.js';
import {REPLICA_STATE_MACHINE_EVENT} from './replica-state-machine-constants.js';

const FUNCTION_TYPE = 'function';
const REPLICA_REMOVAL_SETTLEMENT_CAUSE = Object.freeze({
  REMOVING_REDRIVE: 'removing_redrive',
  REMOVED_OUTSIDE_REMOVAL: 'own_removal_applied_outside_removal',
});

function removalRunning(handler, replicaId) {
  return handler.hasInProgressReplicaRemoval?.(replicaId) === true ||
    handler.removingRedrives?.has(replicaId) === true ||
    [...(handler.removalExecutions?.values() ?? [])]
      .some((removal) => removal.replicaId === replicaId);
}

/**
 * The lifecycle owner's REMOVING re-drive signal: re-run the removal of a
 * REMOVING replica no removal carries.
 * @param {Object} handler
 * @param {Object} event - {replicaId, partitionId, state}.
 */
function redriveRemovingReplica(handler, event) {
  const {replicaId, partitionId} = event || {};
  const local = handler.getLocalReplica?.(replicaId);
  if (event?.state !== ReplicaStatus.REMOVING || handler.shuttingDown ||
      local?.status !== ReplicaStatus.REMOVING ||
      removalRunning(handler, replicaId)) {
    return;
  }
  handler.removingRedrives ??= new Set();
  handler.removingRedrives.add(replicaId);
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVING_REDRIVE, {replicaId,
    partitionId, nodeId: handler.nodeId});
  handler.removeReplicaAsync({operationId: null, replicaId, partitionId,
    reason: REPLICA_REMOVAL_SETTLEMENT_CAUSE.REMOVING_REDRIVE})
    .catch(() => undefined)
    .finally(() => handler.removingRedrives.delete(replicaId));
}

/**
 * A replica that applied its own removal while no removal runs and its row
 * serves: it stops serving and is marked FAILED (the repair path removes it).
 * @param {Object} handler
 * @param {string} replicaId
 * @return {Promise<boolean>} Whether it was settled.
 */
async function settleRemovedOutsideRemoval(handler, replicaId) {
  const local = handler.getLocalReplica?.(replicaId);
  const service = handler.getTrackedService?.(replicaId);
  if (!service?.raft || local?.status !== ReplicaStatus.ACTIVE ||
      removalRunning(handler, replicaId)) {
    return false;
  }
  let own = null;
  try {
    own = await readPartitionReplicaMembership(service, replicaId);
  } catch (_error) {
    return false;
  }
  if (own?.state !== MEMBERSHIP.ABSENT || own.gateOpen !== true ||
      removalRunning(handler, replicaId)) {
    return false;
  }
  service.fenceServingAdmissionForRemoval?.();
  handler.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVED_OUTSIDE_REMOVAL, {
    replicaId, partitionId: service.partitionId, nodeId: handler.nodeId,
    cause: REPLICA_REMOVAL_SETTLEMENT_CAUSE.REMOVED_OUTSIDE_REMOVAL});
  await handler.persistReplicaStatusWithRetry(replicaId, ReplicaStatus.FAILED,
    {partitionId: service.partitionId,
      errorMessage: REPLICA_REMOVAL_SETTLEMENT_CAUSE.REMOVED_OUTSIDE_REMOVAL});
  return true;
}

/**
 * Subscribe a handler's settlement to its lifecycle owner and consensus
 * relay (the handler's lifetime).
 * @param {Object} handler - The ReplicaHandler.
 */
function subscribeRemovalSettlement(handler) {
  const stateMachine = handler.replicaStateMachine;
  if (typeof stateMachine?.on === FUNCTION_TYPE) {
    stateMachine.on(REPLICA_STATE_MACHINE_EVENT.TIMEOUT,
      (event) => redriveRemovingReplica(handler, event));
  }
  handler.consensusEvents?.subscribe?.((event) => {
    if (event?.confState && typeof event.replicaId === 'string') {
      // Never re-entered from inside the port event that woke it.
      queueMicrotask(() => settleRemovedOutsideRemoval(handler,
        event.replicaId).catch(() => undefined));
    }
  });
}

export {
  REPLICA_REMOVAL_SETTLEMENT_CAUSE,
  settleRemovedOutsideRemoval,
  subscribeRemovalSettlement,
};
