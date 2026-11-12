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
 *   (each tracked partition's consensus announcements).
 * Canonical output of one settlement read (REPLICA_REMOVAL_SETTLEMENT_OUTCOME):
 *   NOT_OUTSIDE_REMOVAL     no serving replica with a port and no removal
 *                           running: nothing to settle here;
 *   STILL_NAMED             its own applied configuration names it a voter;
 *   UNREADABLE              its configuration could not be read (the port's
 *                           typed refusal), names a voter it cannot resolve,
 *                           or reads absent below its gate: nothing is
 *                           concluded - it neither settles nor fails, and
 *                           is read again on the replica's next consensus
 *                           observation of any kind;
 *   STATUS_WRITE_DEFERRED   fenced, but the FAILED row write exhausted its
 *                           retry on a retryable control-plane failure: read
 *                           again (and written again) on the next
 *                           observation, as UNREADABLE;
 *   SETTLED                 fenced and marked FAILED.
 * Owned state (on the handler): removingRedrives (replicas a re-drive
 * carries), removalSettlementRereads (replicas whose last settlement read
 * concluded nothing).
 * Prohibited: a teardown here (only the removal owner tears down), a
 * decision from a row or from elapsed time alone (the TIMEOUT only re-asks),
 * a caught error read as "nothing to settle".
 */
import {readPartitionReplicaMembership} from
  '../partition/partition-service-raft-membership-administration.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE as MEMBERSHIP} from
  '../partition/partition-replica-membership-constants.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {REPLICA_HANDLER_LOG_MSG} from './replica-handler-constants.js';
import {REPLICA_STATE_MACHINE_EVENT} from './replica-state-machine-constants.js';
import {captureReplicaRuntimeObservation, isReplicaRuntimeObservationCurrent} from
  './replica-runtime-observation.js';
import {REPLICA_RUNTIME_OBSERVATION_CHANGED} from
  './replica-state-machine-serialization.js';

const REPLICA_REMOVAL_SETTLEMENT_CAUSE = Object.freeze({
  REMOVING_REDRIVE: 'removing_redrive',
  REMOVED_OUTSIDE_REMOVAL: 'own_removal_applied_outside_removal',
});
const REPLICA_REMOVAL_SETTLEMENT_OUTCOME = Object.freeze({
  NOT_OUTSIDE_REMOVAL: 'not_outside_removal',
  STILL_NAMED: 'own_configuration_names_it',
  UNREADABLE: 'own_configuration_unreadable',
  STATUS_WRITE_DEFERRED: 'failed_status_write_deferred',
  SETTLED: 'settled_failed',
  OBSOLETE: 'observed_generation_changed',
});
// The outcomes that conclude nothing: read again on the next observation.
const PENDING_SETTLEMENT_OUTCOMES = Object.freeze(new Set([
  REPLICA_REMOVAL_SETTLEMENT_OUTCOME.UNREADABLE,
  REPLICA_REMOVAL_SETTLEMENT_OUTCOME.STATUS_WRITE_DEFERRED,
]));

function removalRunning(handler, replicaId) {
  return handler.hasInProgressReplicaRemoval(replicaId) ||
    handler.removingRedrives.has(replicaId) ||
    [...handler.removalExecutions.values()]
      .some((removal) => removal.replicaId === replicaId);
}

/**
 * The lifecycle owner's REMOVING re-drive signal: re-run the removal of a
 * REMOVING replica no removal carries. A re-driven removal that defers
 * (typed) is reported as every detached removal is, and re-asked on the
 * next signal.
 * @param {Object} handler
 * @param {Object} event - {replicaId, partitionId, state}.
 */
function redriveRemovingReplica(handler, event) {
  const {replicaId, partitionId, state} = event;
  if (state !== ReplicaStatus.REMOVING || handler.shuttingDown ||
      handler.getLocalReplica(replicaId)?.status !== ReplicaStatus.REMOVING ||
      removalRunning(handler, replicaId)) {
    return;
  }
  handler.removingRedrives.add(replicaId);
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVING_REDRIVE, {replicaId,
    partitionId, nodeId: handler.nodeId});
  handler.registerOperationTask(handler.removeReplicaAsync({operationId: null,
    replicaId, partitionId,
    reason: REPLICA_REMOVAL_SETTLEMENT_CAUSE.REMOVING_REDRIVE})
    .catch((error) => {
      handler.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED, {
        operationId: null, replicaId, partitionId,
        cause: REPLICA_REMOVAL_SETTLEMENT_CAUSE.REMOVING_REDRIVE,
        errorCode: error.code ?? null, error: error.message});
    })
    .finally(() => handler.removingRedrives.delete(replicaId)));
}

// What the replica's own applied configuration says about it.
function ownConfigurationOutcomeOf(observation) {
  if (observation.state === MEMBERSHIP.VOTER) {
    return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.STILL_NAMED;
  }
  return observation.state === MEMBERSHIP.ABSENT &&
    observation.gateOpen === true ? null :
    REPLICA_REMOVAL_SETTLEMENT_OUTCOME.UNREADABLE;
}

/**
 * A replica that applied its own removal while no removal runs and its row
 * serves: it stops serving and is marked FAILED (the repair path removes it).
 * @param {Object} handler
 * @param {string} replicaId
 * @return {Promise<string>} A REPLICA_REMOVAL_SETTLEMENT_OUTCOME.
 */
async function settleRemovedOutsideRemoval(handler, replicaId, observation) {
  const local = observation?.local;
  const service = observation?.service;
  if (!service?.raft || local?.status !== ReplicaStatus.ACTIVE ||
      removalRunning(handler, replicaId)) {
    return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.NOT_OUTSIDE_REMOVAL;
  }
  if (!observation.sourceEvidence) return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.UNREADABLE;
  if (!isReplicaRuntimeObservationCurrent(observation)) {
    return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.OBSOLETE;
  }
  if (observation.sourceEvidence.status !== ReplicaStatus.ACTIVE) {
    return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.NOT_OUTSIDE_REMOVAL;
  }
  const own = ownConfigurationOutcomeOf(
    await readPartitionReplicaMembership(service, replicaId));
  if (!isReplicaRuntimeObservationCurrent(observation)) {
    return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.OBSOLETE;
  }
  if (own !== null) return own;
  if (removalRunning(handler, replicaId)) {
    return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.NOT_OUTSIDE_REMOVAL;
  }
  service.fenceServingAdmissionForRemoval();
  handler.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVED_OUTSIDE_REMOVAL, {
    replicaId, partitionId: service.partitionId, nodeId: handler.nodeId,
    cause: REPLICA_REMOVAL_SETTLEMENT_CAUSE.REMOVED_OUTSIDE_REMOVAL});
  try {
    const settled = await handler.persistReplicaStatusWithRetry(replicaId,
      ReplicaStatus.FAILED, {partitionId: service.partitionId,
        runtimeObservation: observation,
        errorMessage: REPLICA_REMOVAL_SETTLEMENT_CAUSE.REMOVED_OUTSIDE_REMOVAL});
    if (settled !== true) return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.OBSOLETE;
  } catch (error) {
    if (error.code === REPLICA_RUNTIME_OBSERVATION_CHANGED) {
      return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.OBSOLETE;
    }
    if (!isRetryableControlPlaneError(error)) {
      throw error;
    }
    return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.STATUS_WRITE_DEFERRED;
  }
  return REPLICA_REMOVAL_SETTLEMENT_OUTCOME.SETTLED;
}

// One settlement read, outside the port event that woke it (a detached
// task: its outcome and its failure each have one sink). An outcome that
// concludes nothing is re-asked on the next observation; a failure is
// reported at ERROR, never read as settled or as nothing to settle.
function runRemovalSettlement(handler, replicaId, debt) {
  if (handler.removalSettlementRereads.get(replicaId) !== debt) return;
  return settleRemovedOutsideRemoval(handler, replicaId, debt.observation).then(
    (outcome) => recordSettlementOutcome(handler, replicaId, debt, outcome),
    (error) => {
      if (handler.removalSettlementRereads.get(replicaId) === debt) debt.running = false;
      handler.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVAL_SETTLEMENT_FAILED, {
        replicaId, nodeId: handler.nodeId, error: error.message, stack: error.stack});
    });
}

function recordSettlementOutcome(handler, replicaId, debt, outcome) {
  if (handler.removalSettlementRereads.get(replicaId) !== debt) return;
  if (PENDING_SETTLEMENT_OUTCOMES.has(outcome)) {
    debt.running = false;
    handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVAL_SETTLEMENT_PENDING, {
      replicaId, nodeId: handler.nodeId, outcome});
  } else {
    handler.removalSettlementRereads.delete(replicaId);
  }
}

function queueRemovalSettlement(handler, replicaId) {
  if (handler.shuttingDown) return;
  const previous = handler.removalSettlementRereads.get(replicaId);
  const current = previous && isReplicaRuntimeObservationCurrent(previous.observation);
  if (current && previous.running) return;
  // An unavailable source has not supplied membership proof. Its wake may
  // admit a new read, while a retry of existing proof retains the exact value.
  const observation = current && previous.observation.sourceEvidence ?
    previous.observation : captureReplicaRuntimeObservation(handler, replicaId);
  if (!observation) return;
  const debt = {observation, running: true};
  handler.removalSettlementRereads.set(replicaId, debt);
  queueMicrotask(() => runRemovalSettlement(handler, replicaId, debt));
}

/**
 * Subscribe a handler's settlement to its lifecycle owner and consensus
 * relay (the handler's lifetime). An applied configuration announcement
 * asks; any announcement re-asks a replica whose last read concluded
 * nothing.
 * @param {Object} handler - The ReplicaHandler.
 */
function subscribeRemovalSettlement(handler) {
  handler.replicaStateMachine.on(REPLICA_STATE_MACHINE_EVENT.TIMEOUT,
    (event) => redriveRemovingReplica(handler, event));
  handler.consensusEvents.subscribe((event) => {
    if (event.confState ||
        handler.removalSettlementRereads.has(event.replicaId)) {
      // Never re-entered from inside the port event that woke it.
      queueRemovalSettlement(handler, event.replicaId);
    }
  });
}

export {
  REPLICA_REMOVAL_SETTLEMENT_CAUSE,
  REPLICA_REMOVAL_SETTLEMENT_OUTCOME,
  subscribeRemovalSettlement,
};
