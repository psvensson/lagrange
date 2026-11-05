/**
 * Authoritative FAILED publication for an admitted replica create.
 */
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {isUnclaimedPreRuntimeFailedCreateRow} from
  '../rebalancer/failed-create-cleanup-token.js';
import {CREATE_ADMISSION_ERROR_CODE} from './replica-create-admission-owner.js';
import {isReplicaCreateProgressRowSuperseded} from './replica-create-process-owner.js';

function initialStatusDeferral(evidence, cause) {
  return Object.assign(new Error(
    `CREATE initial status recovery deferred ${evidence.operationId}`, {cause}), {
    code: CREATE_ADMISSION_ERROR_CODE.DEFERRED,
    errorCode: CREATE_ADMISSION_ERROR_CODE.DEFERRED,
    deferRetry: true,
  });
}

// A timeout can win after the initial-status replay probes. Only its exact,
// still-live pre-runtime attempt retains retry custody; this grants no effect
// authority and leaves settlement and worker release with the failure owner.
async function expiredCreateInitialStatusError(handler, options, error, observeCreateReplay) {
  const evidence = options.createAdmissionEvidence;
  if (!evidence || error?.code || error?.deferRetry) return error;
  const owner = handler.getReplicaCreateAdmissionOwner();
  if (!await owner.revalidatePhysicalWorker(options.createPhysicalWorkerClaim, evidence)) {
    return error;
  }
  const operation = await owner.readOperation(evidence.operationId);
  if (!operation || operation.completed_at != null ||
      isReplicaCreateProgressRowSuperseded(owner, operation, evidence)) return error;
  const observation = await observeCreateReplay(handler, options.replicaId,
    options.partitionId, ReplicaStatus.FAILED, evidence).catch((readError) => {
    throw initialStatusDeferral(evidence, readError);
  });
  // Unavailable authority cannot turn uncertainty into terminal cleanup.
  // A positively observed cleanup/identity refusal keeps its original meaning.
  if (observation.available && !isUnclaimedPreRuntimeFailedCreateRow(observation.row)) return error;
  return initialStatusDeferral(evidence, error);
}

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

export {expiredCreateInitialStatusError, persistFailedCreateLifecycle};
