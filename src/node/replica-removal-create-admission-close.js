/**
 * Owner contract:
 * Owner: the replica removal's close of the CREATE admission of the exact
 * create generation its REMOVING intent will name (the census of
 * replica-create-lifecycle-close.js, owned by the create-admission owner).
 * Inputs: the replica handler (its create-admission owner and lifecycle state
 * machine); the generation {replicaId, createdAt, createAttemptToken}, read
 * from the authoritative lifecycle row (an ordinary REMOVE) or carried by the
 * exact FAILED precondition (a failed-create cleanup).
 * Canonical output: {closed: true, generation} - the generation every REMOVING
 * writer passes as closedCreateGeneration, on which alone the lifecycle owner
 * writes REMOVING - or {closed: false, deferral}, a typed retryable deferral
 * (CREATE_ADMISSION_CLOSE_DEFERRAL) answered before anything durable changed.
 * Ordering: this runs before the durable REMOVING row, the point of no
 * return from which the group's leader proposes RemoveNode. CLOSED is
 * terminal (claim, advance and retained takeover refuse it), so no step
 * after the consensus exit consults the census (pre-gate 219c27bfe: a census
 * read that timed out after the exit stranded six replicas in REMOVING).
 * Prohibited: no REMOVING intent for a generation whose admission is open; no
 * close of any generation but the one the intent names.
 */
import {SERVICE_TYPE} from '../constants/index.js';
import {REPLICA_HANDLER_LOG_MSG} from './replica-handler-constants.js';
import {
  CREATE_ADMISSION_CLOSE_DEFERRAL,
  createAdmissionCloseDeferred,
} from './replica-removal-debt-errors.js';

function closeDeferred(replicaId, reason, cause = null) {
  return Object.freeze({closed: false,
    deferral: createAdmissionCloseDeferred(replicaId, reason, cause)});
}

// The authoritative lifecycle row of the replica this node is about to
// retire: the exact generation its REMOVING intent will name.
function isRetiringGenerationRow(row, replicaId, partitionId, nodeId) {
  return row?.service_id === replicaId &&
    row.service_type === SERVICE_TYPE.PARTITION &&
    row.partition_id === partitionId && row.node_id === nodeId &&
    Number.isFinite(row.created_at);
}

/**
 * Close the CREATE admission of one exact create generation. A census that
 * does not answer, or an admission a live create worker still holds, is a
 * typed deferral.
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} generation - {replicaId, createdAt, createAttemptToken}.
 * @return {Promise<Object>} Frozen {closed: true, generation} or
 *   {closed: false, deferral}.
 */
async function closeRemovalCreateAdmission(handler, generation) {
  let closed;
  try {
    closed = await handler.getReplicaCreateAdmissionOwner()
      .closeForLifecycle(generation);
  } catch (error) {
    if (error?.deferRetry !== true) throw error;
    return closeDeferred(generation.replicaId,
      CREATE_ADMISSION_CLOSE_DEFERRAL.CENSUS_UNAVAILABLE, error);
  }
  if (closed !== true) {
    return closeDeferred(generation.replicaId,
      CREATE_ADMISSION_CLOSE_DEFERRAL.ADMISSION_HELD);
  }
  return Object.freeze({closed: true, generation: Object.freeze({
    replicaId: generation.replicaId,
    createdAt: generation.createdAt,
    createAttemptToken: generation.createAttemptToken ?? null,
  })});
}

async function closeRetiringGeneration(handler, replicaId, partitionId) {
  const observation = await handler.replicaStateMachine
    .observeAuthoritativeReplicaLifecycle(replicaId);
  if (observation?.available !== true) {
    return closeDeferred(replicaId,
      CREATE_ADMISSION_CLOSE_DEFERRAL.LIFECYCLE_AUTHORITY_UNAVAILABLE);
  }
  const row = observation.row;
  if (!isRetiringGenerationRow(row, replicaId, partitionId, handler.nodeId)) {
    return closeDeferred(replicaId,
      CREATE_ADMISSION_CLOSE_DEFERRAL.LIFECYCLE_ROW_ABSENT);
  }
  return closeRemovalCreateAdmission(handler, {
    replicaId,
    createdAt: row.created_at,
    createAttemptToken: row.create_attempt_token,
  });
}

/**
 * Close the CREATE admission of the generation this node's REMOVING intent
 * for one replica will name: the authoritative lifecycle row's. A deferral
 * is logged with its typed reason; the caller defers the REMOVE without a
 * durable row (its operation owner re-dispatches it).
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} context - {operationId, replicaId, partitionId}.
 * @return {Promise<Object>} As closeRemovalCreateAdmission.
 */
async function closeRetiringGenerationCreateAdmission(handler,
  {operationId, replicaId, partitionId}) {
  const closure = await closeRetiringGeneration(handler, replicaId,
    partitionId);
  if (closure.closed !== true) {
    handler.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_CREATE_ADMISSION_DEFERRED,
      {operationId, replicaId, partitionId, nodeId: handler.nodeId,
        reason: closure.deferral.deferralReason,
        error: closure.deferral.message});
  }
  return closure;
}

export {closeRemovalCreateAdmission, closeRetiringGenerationCreateAdmission};
