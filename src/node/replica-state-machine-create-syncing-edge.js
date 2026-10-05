/**
 * Owner contract:
 * Owner: the one idempotent edge of the replica lifecycle, CREATING ->
 * SYNCING (the ack-loss wedge, verifier I1 / F3). The SYNCING row is written
 * only by the create on its target node, after its port opened, and it IS the
 * replica's prior-existence fact (replica-prior-existence.js). A SYNCING
 * write that applied but whose answer was lost, or whose CAS retry found the
 * row already SYNCING, resolves against the authoritative row: the same
 * incarnation (service, type, partition, node, replica identity, group,
 * created_at) holding SYNCING is this write, applied. Its durable version is
 * adopted, so the next CAS (SYNCING -> ACTIVE or FAILED) fences on the row
 * that is actually durable.
 * Inputs: the state machine, the target replica state and the source state.
 * Canonical output: an APPLIED mutation result, null (the row read holds
 * anything else: the write's own outcome stands and is classified as ever),
 * or, while the row cannot be read, a thrown retryable deferral (the outcome
 * is still unknown, so the status owner's bounded retry reads again).
 * Prohibited: no other edge is idempotent; an unreadable row is never read
 * as applied; a row of another node or incarnation is never adopted.
 */
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../control-plane/control-plane-system-table-gateway.js';
import {
  durableTransitionNotAppliedError,
  reportServiceRowPersisted,
} from './replica-state-machine-durability.js';
import {
  durableRowVersion,
  observeAuthoritativeReplicaLifecycle,
  rowHoldsReplicaIncarnation,
} from './replica-state-machine-lifecycle-observation.js';
import {clearLeaderOrRecordDebt} from
  './replica-state-machine-leader-clear.js';
import {REPLICA_STATE_MACHINE_STATE as ReplicaState} from
  './replica-state-machine-constants.js';

/**
 * Whether this write is the idempotent CREATING -> SYNCING edge.
 * @param {Object} replicaState - The target replica state.
 * @param {Object|string|null} previousState - The source state.
 * @return {boolean}
 */
function isCreateSyncingEdge(replicaState, previousState) {
  const source = typeof previousState === 'object' ?
    previousState?.state : previousState;
  return source === ReplicaState.CREATING &&
    replicaState?.state === ReplicaState.SYNCING;
}

function deferredSyncingResolution(replicaState, cause) {
  const error = durableTransitionNotAppliedError(
    replicaState.replicaId, replicaState.state, {deferRetry: true});
  if (cause) {
    error.cause = cause;
  }
  return error;
}

/**
 * Resolve a CREATING -> SYNCING write that was not confirmed applied (its
 * answer lost, or a retry's CAS matched no row) against the authoritative
 * row.
 * @param {Object} stateMachine - The owning state machine.
 * @param {Object} replicaState - The target SYNCING state (adopts the row's
 *   durable version when it resolves applied).
 * @param {Object} previousState - The CREATING source state.
 * @param {Error|null} cause - The thrown write outcome, if it threw.
 * @return {Promise<Object|null>} APPLIED, or null when the row read is not
 *   SYNCING of this incarnation.
 * @throws {Error} A retryable deferral while the row is unreadable.
 */
async function resolveCreateSyncingEdge(stateMachine, replicaState,
  previousState, cause) {
  const serviceId = replicaState.serviceId || replicaState.replicaId;
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine, serviceId);
  if (observation.available !== true) {
    throw deferredSyncingResolution(replicaState, cause);
  }
  const row = observation.row;
  if (!rowHoldsReplicaIncarnation(row, replicaState)) {
    return null;
  }
  const version = durableRowVersion(row);
  replicaState.durableVersionColumn = version.column;
  replicaState.durableVersion = version.value;
  replicaState.stateEnteredAt = version.value;
  stateMachine.clearServiceRowLocalOnly?.(serviceId);
  await clearLeaderOrRecordDebt(stateMachine, replicaState, previousState);
  reportServiceRowPersisted(stateMachine, replicaState);
  return {
    success: true,
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    partitionResult: {affectedRows: 1},
  };
}

/**
 * A lifecycle write whose outcome says it did not apply: the create-SYNCING
 * edge resolves against the row; every other edge keeps its own outcome.
 * @param {Object} stateMachine - The owning state machine.
 * @param {Object} replicaState - The target state.
 * @param {Object} previousState - The source state.
 * @param {Object} result - The write's unapplied outcome.
 * @return {Promise<Object>} APPLIED for an idempotent create-SYNCING, else
 *   the outcome as written.
 */
async function settleUnappliedLifecycleWrite(stateMachine, replicaState,
  previousState, result) {
  const resolved = isCreateSyncingEdge(replicaState, previousState) ?
    await resolveCreateSyncingEdge(stateMachine, replicaState, previousState,
      null) : null;
  if (resolved !== null) {
    return resolved;
  }
  reportServiceRowPersisted(stateMachine, replicaState);
  return result;
}

export {
  isCreateSyncingEdge,
  resolveCreateSyncingEdge,
  settleUnappliedLifecycleWrite,
};
