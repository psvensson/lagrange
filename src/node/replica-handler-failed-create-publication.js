/**
 * Authoritative FAILED publication for an admitted replica create.
 */
import {WORKFLOW_STEP} from '../constants/index.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {OperationType, ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  buildFailedCreateCleanupToken,
  isUnclaimedPreRuntimeFailedCreateRow,
} from '../rebalancer/failed-create-cleanup-token.js';
import {CREATE_ADMISSION_ERROR_CODE} from './replica-create-admission-owner.js';
import {isReplicaCreateProgressRowSuperseded} from './replica-create-process-owner.js';
import {REPLICA_HANDLER_SERVICE} from './replica-handler-constants.js';

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

const FAILED_CREATE_CLAIM_ERROR = Object.freeze({
  INVALID_PRECONDITION: 'Invalid failed-create cleanup claim precondition',
  NOT_TERMINAL_FAILED: 'Operation is not durably terminal FAILED for attempt',
  CAS_REJECTED: 'Failed-create cleanup claim CAS rejected',
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function matchesUnclaimedFailedCreateIdentity(
  handler,
  partitionId,
  replicaId,
  precondition,
) {
  return Boolean(precondition) &&
    typeof precondition === 'object' &&
    !Array.isArray(precondition) &&
    precondition.service_id === replicaId &&
    precondition.replica_id === replicaId &&
    precondition.partition_id === partitionId &&
    precondition.node_id === handler.nodeId &&
    precondition.service_type === REPLICA_HANDLER_SERVICE.TYPE;
}

function hasValidUnclaimedFailedCreatePrecondition(
  handler,
  partitionId,
  replicaId,
  precondition,
) {
  if (!matchesUnclaimedFailedCreateIdentity(
    handler,
    partitionId,
    replicaId,
    precondition,
  )) {
    return false;
  }
  return precondition.status === ReplicaStatus.FAILED &&
    precondition.cleanup_token === null &&
    isNonEmptyString(precondition.create_attempt_token) &&
    Number.isFinite(precondition.created_at) &&
    Number.isFinite(precondition.state_entered_at);
}

function isTerminalFailedOperationRow(operation) {
  return Boolean(operation) &&
    operation.completed_at !== null &&
    operation.completed_at !== undefined &&
    typeof operation.workflow_step === 'string' &&
    operation.workflow_step.toUpperCase() === WORKFLOW_STEP.FAILED &&
    typeof operation.status === 'string' &&
    operation.status.toLowerCase() === ReplicaStatus.FAILED;
}

function matchesTerminalFailedCreateOperation(
  handler,
  operation,
  {operationId, operationType, partitionId, replicaId, precondition},
) {
  if (!isTerminalFailedOperationRow(operation) ||
      operation.operation_id !== operationId ||
      operation.type !== operationType ||
      operation.partition_id !== partitionId ||
      operation.replica_id !== replicaId ||
      operation.target_node_id !== handler.nodeId ||
      operation.create_admission_attempt_token !==
        precondition.create_attempt_token) {
    return false;
  }
  return !Number.isSafeInteger(operation.create_admission_replica_created_at) ||
    operation.create_admission_replica_created_at === precondition.created_at;
}

function extractFailedCreateClaimRequest(payload) {
  return {
    operationId: payload?.[ReplicaOperationField.OPERATION_ID] || null,
    operationType: payload?.[ReplicaOperationField.OPERATION_TYPE] || null,
    partitionId: payload?.[ReplicaOperationField.PARTITION_ID] || null,
    replicaId: payload?.[ReplicaOperationField.REPLICA_ID] || null,
    precondition: payload?.[
      ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
    ] || null,
  };
}

function isValidFailedCreateClaimRequest(handler, request) {
  const validType = request.operationType === OperationType.ADD ||
    request.operationType === OperationType.REPLACE;
  return isNonEmptyString(request.operationId) &&
    validType &&
    isNonEmptyString(request.partitionId) &&
    isNonEmptyString(request.replicaId) &&
    hasValidUnclaimedFailedCreatePrecondition(
      handler,
      request.partitionId,
      request.replicaId,
      request.precondition,
    );
}

function buildClaimErrorResponse(handler, request, error) {
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.ERROR,
    {
      operationId: request.operationId,
      replicaId: request.replicaId,
      error,
      nodeId: handler.nodeId,
    },
  );
}

async function executeFailedCreateCleanupClaim(handler, owner, request) {
  const operation = await owner.readOperation(request.operationId);
  if (!matchesTerminalFailedCreateOperation(handler, operation, request)) {
    return buildClaimErrorResponse(
      handler,
      request,
      FAILED_CREATE_CLAIM_ERROR.NOT_TERMINAL_FAILED,
    );
  }
  const claimed = await handler.replicaStateMachine.claimFailedCreateCleanup(
    request.precondition,
    buildFailedCreateCleanupToken(request.operationId),
  );
  if (claimed !== true) {
    return buildClaimErrorResponse(
      handler,
      request,
      FAILED_CREATE_CLAIM_ERROR.CAS_REJECTED,
    );
  }
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.COMPLETED,
    {
      operationId: request.operationId,
      replicaId: request.replicaId,
      nodeId: handler.nodeId,
    },
  );
}

async function claimTerminalFailedCreateTargetCleanup(handler, payload) {
  const request = extractFailedCreateClaimRequest(payload);
  if (!isValidFailedCreateClaimRequest(handler, request)) {
    return buildClaimErrorResponse(
      handler,
      request,
      FAILED_CREATE_CLAIM_ERROR.INVALID_PRECONDITION,
    );
  }
  const owner = handler.getReplicaCreateAdmissionOwner();
  return owner.runExclusive(request.operationId, async () => {
    try {
      return await executeFailedCreateCleanupClaim(handler, owner, request);
    } catch (error) {
      return buildClaimErrorResponse(handler, request, error.message);
    }
  });
}

export {
  claimTerminalFailedCreateTargetCleanup,
  expiredCreateInitialStatusError,
  persistFailedCreateLifecycle,
};
