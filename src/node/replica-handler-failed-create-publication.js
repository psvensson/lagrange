/**
 * Authoritative FAILED publication for an admitted replica create.
 */
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';

function trackedReplicaState(handler, replicaId) {
  return handler.replicaStateMachine?.getState?.(replicaId) ?? null;
}

function rowConflictsWithTrackedCreateIncarnation(
  handler,
  row,
  replicaId,
  partitionId,
  createAdmissionEvidence = null,
) {
  if (!row) return false;
  const tracked = trackedReplicaState(handler, replicaId);
  const expected = createAdmissionEvidence ? {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: handler.nodeId,
    created_at: createAdmissionEvidence.replicaCreatedAt,
    create_attempt_token: createAdmissionEvidence.attemptToken,
  } : tracked ? {
    service_id: tracked.serviceId || replicaId,
    replica_id: tracked.replicaIdentity || replicaId,
    partition_id: tracked.partitionId || partitionId,
    node_id: tracked.nodeId || handler.nodeId,
    created_at: tracked.createdAt,
  } : null;
  return expected !== null && Object.entries(expected).some(
    ([field, value]) => value !== null && value !== undefined &&
      row[field] !== value,
  );
}

async function hasConflictingCreateIncarnation(handler, options) {
  const observation = await handler.replicaStateMachine
    .observeAuthoritativeReplicaLifecycle(options.replicaId);
  return observation?.available === true &&
    rowConflictsWithTrackedCreateIncarnation(
      handler,
      observation.row,
      options.replicaId,
      options.partitionId,
      options.createAdmissionEvidence,
    );
}

async function persistFailedCreateLifecycle(
  handler,
  options,
  transitionOptions,
  resolveCreateReplay,
) {
  if (await hasConflictingCreateIncarnation(handler, options)) {
    return {conflict: true, replay: null};
  }
  try {
    await handler.updateReplicaStatus(
      options.replicaId,
      ReplicaStatus.FAILED,
      transitionOptions,
    );
  } catch (error) {
    const replay = await resolveCreateReplay(
      handler,
      options.replicaId,
      options.partitionId,
      ReplicaStatus.FAILED,
      options.createAdmissionEvidence,
    );
    if (replay) return {conflict: false, replay};
    if (await hasConflictingCreateIncarnation(handler, options)) {
      return {conflict: true, replay: null};
    }
    if (isRetryableControlPlaneError(error) !== true) throw error;
    await handler.persistReplicaStatusWithRetry(
      options.replicaId,
      ReplicaStatus.FAILED,
      transitionOptions,
    );
  }
  return {conflict: false, replay: await resolveCreateReplay(
    handler,
    options.replicaId,
    options.partitionId,
    ReplicaStatus.FAILED,
    options.createAdmissionEvidence,
  )};
}

export {persistFailedCreateLifecycle};
