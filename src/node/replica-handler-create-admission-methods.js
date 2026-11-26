import {WORKFLOW_STEP} from '../constants/index.js';
import {
  SERVICE_TYPE,
  isPartitionCleanupServiceRow,
} from '../constants/service.js';
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {classifySystemPartition} from
  '../bootstrap/system-partition-classification.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../rebalancer/replica-status.js';
import {buildFailedCreateCleanupToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
} from './replica-create-admission-owner.js';
import {isReplicaCreateAdmissionEvidence} from
  './replica-create-admission-evidence.js';
import {REPLICA_CLEANUP_ERROR_CODE} from
  './replica-cleanup-tombstone-owner.js';
import {observeAuthoritativeReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';
import {durableRowVersion} from './replica-state-machine-recovery.js';
import {
  reconcileCreateAdmissionProgress,
  recoverRetainedCreateAdmissionRows,
} from './replica-create-admission-retained-recovery.js';
import {
  REPLICA_HANDLER_CREATE_DECISION,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {traceCreateWorker} from './replica-handler-create-work.js';
const LOCAL_STR_CONSTRUCTOR = 'constructor';
const CREATE_OWNER_DEFERRED_CODE = 'CREATE_OWNER_DEFERRED';
const ROTATING_ADMISSION_RECOVERY_REFUSED = false;
function createAdmissionLifecycleError(message, code, deferRetry = false) {
  const error = new Error(message);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = deferRetry;
  return error;
}
function isOperationLedgerCreate(operationType) {
  return operationType === OperationType.ADD ||
    operationType === OperationType.REPLACE;
}
function buildCreateAdmissionRequest(handler, request) {
  return {
    operationId: request?.[ReplicaOperationField.OPERATION_ID],
    operationType: request?.[ReplicaOperationField.OPERATION_TYPE],
    entityType: request?.[ReplicaOperationField.ENTITY_TYPE],
    entityId: request?.[ReplicaOperationField.ENTITY_ID],
    partitionId: request?.[ReplicaOperationField.PARTITION_ID],
    replicaId: request?.[ReplicaOperationField.REPLICA_ID],
    targetNodeId: handler.nodeId,
    admissionToken:
      request?.[ReplicaOperationField.CREATE_ADMISSION_TOKEN],
    workflowUpdatedAt:
      request?.[ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT],
    attemptToken:
      request?.[ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN],
    attemptSeq:
      request?.[ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ],
  };
}

function matchesInternalAdmissionEvidence(handler, request, evidence) {
  const expected = buildCreateAdmissionRequest(handler, request);
  return isReplicaCreateAdmissionEvidence(evidence) &&
    evidence.operationId === expected.operationId &&
    evidence.operationType === expected.operationType &&
    evidence.entityType === expected.entityType &&
    evidence.entityId === expected.entityId &&
    evidence.partitionId === expected.partitionId &&
    evidence.replicaId === expected.replicaId &&
    evidence.targetNodeId === expected.targetNodeId &&
    evidence.admissionToken === expected.admissionToken &&
    evidence.workflowUpdatedAt === expected.workflowUpdatedAt &&
    (evidence.attemptToken === expected.attemptToken ||
      evidence.previousAttemptToken === expected.attemptToken);
}

function rowMatchesCreateAdmissionLifecycle(handler, row, evidence) {
  const expected = {
    service_id: evidence.replicaId,
    replica_id: evidence.replicaId,
    partition_id: evidence.partitionId,
    node_id: handler.nodeId,
    service_type: SERVICE_TYPE.PARTITION,
    created_at: evidence.replicaCreatedAt,
    create_attempt_token: evidence.attemptToken,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
}

function rowMatchesCreateAdmissionIncarnation(handler, row, evidence) {
  const expected = {
    service_id: evidence.replicaId,
    replica_id: evidence.replicaId,
    partition_id: evidence.partitionId,
    node_id: handler.nodeId,
    service_type: SERVICE_TYPE.PARTITION,
    created_at: evidence.replicaCreatedAt,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
}

function rowIsPreviousFailedAttempt(row, evidence) {
  return row.status === ReplicaStatus.FAILED &&
    row.cleanup_token == null &&
    row.create_attempt_token === evidence.previousAttemptToken;
}

async function finishMaterializedRotation(handler, evidence, row) {
  installCreateAdmissionLifecycleSnapshot(handler, row, evidence);
  const finished = await handler.getReplicaCreateAdmissionOwner()
    .finishFailedAttemptRotation(evidence);
  return finished ? {evidence: finished, row} : null;
}

function installCreateAdmissionLifecycleSnapshot(handler, row, evidence) {
  const version = durableRowVersion(row);
  handler.replicaStateMachine.registerReplicaSnapshot(evidence.replicaId, {
    partitionId: evidence.partitionId,
    nodeId: handler.nodeId,
    state: row.status,
    serviceId: row.service_id,
    serviceType: row.service_type,
    serviceAddress: row.address,
    replicaIdentity: row.replica_id,
    groupId: row.group_id,
    cleanupToken: row.cleanup_token,
    createAttemptToken: row.create_attempt_token,
    createdAt: row.created_at,
    durableVersionColumn: version?.column,
    durableVersion: version?.value,
    authoritativeSnapshot: true,
  });
  handler.setLocalReplica(evidence.replicaId, {
    replicaId: evidence.replicaId,
    partitionId: evidence.partitionId,
    status: row.status,
    service: handler.getTrackedService(evidence.replicaId),
  });
}

async function recoverRotatingAdmissionLifecycle(handler, evidence, row) {
  if (!rowMatchesCreateAdmissionIncarnation(handler, row, evidence)) {
    return ROTATING_ADMISSION_RECOVERY_REFUSED;
  }
  if (row.create_attempt_token === evidence.attemptToken) {
    return finishMaterializedRotation(handler, evidence, row);
  }
  if (!rowIsPreviousFailedAttempt(row, evidence)) {
    return ROTATING_ADMISSION_RECOVERY_REFUSED;
  }
  installCreateAdmissionLifecycleSnapshot(handler, row, evidence);
  const restarted = await handler.replicaStateMachine.restartFailedCreate(
    evidence.replicaId,
    {
      partitionId: evidence.partitionId,
      nodeId: handler.nodeId,
      serviceId: row.service_id,
      serviceType: row.service_type,
      serviceAddress: row.address,
      createAttemptToken: evidence.attemptToken,
      createAdmissionEvidence: evidence,
    },
    {persist: true, expectedSourceEvidence: row},
  );
  if (restarted !== true) return ROTATING_ADMISSION_RECOVERY_REFUSED;
  const finished = await handler.getReplicaCreateAdmissionOwner()
    .finishFailedAttemptRotation(evidence);
  if (!finished) return ROTATING_ADMISSION_RECOVERY_REFUSED;
  const after = await observeAuthoritativeReplicaLifecycle(
    handler.replicaStateMachine,
    evidence.replicaId,
  );
  if (after?.available !== true ||
      !rowMatchesCreateAdmissionLifecycle(handler, after.row, finished)) {
    return ROTATING_ADMISSION_RECOVERY_REFUSED;
  }
  installCreateAdmissionLifecycleSnapshot(handler, after.row, finished);
  return {evidence: finished, row: after.row};
}

async function reconcileCreateAdmissionLifecycle(handler, evidence) {
  if (!evidence) return {evidence: null, row: null};
  const observation = await observeAuthoritativeReplicaLifecycle(
    handler.replicaStateMachine,
    evidence.replicaId,
  );
  if (observation?.available !== true) {
    throw createAdmissionLifecycleError(
      `CREATE lifecycle authority unavailable for ${evidence.replicaId}`,
      CREATE_ADMISSION_ERROR_CODE.DEFERRED,
      true,
    );
  }
  if (!observation.row) {
    if (evidence.admissionState === CREATE_ADMISSION_STATE.ADMITTED) {
      return {evidence, row: null};
    }
    await handler.getReplicaCreateAdmissionOwner().close(evidence);
    throw createAdmissionLifecycleError(
      `Removed CREATE admission refused resurrection ${evidence.operationId}`,
      CREATE_ADMISSION_ERROR_CODE.STALE,
    );
  }
  if (evidence.admissionState === CREATE_ADMISSION_STATE.ROTATING) {
    const recovered = await recoverRotatingAdmissionLifecycle(
      handler,
      evidence,
      observation.row,
    );
    if (recovered) return recovered;
  }
  if (!rowMatchesCreateAdmissionLifecycle(handler, observation.row, evidence)) {
    throw createAdmissionLifecycleError(
      `CREATE admission lifecycle conflict ${evidence.operationId}`,
      CREATE_ADMISSION_ERROR_CODE.STALE,
    );
  }
  const currentEvidence = await reconcileCreateAdmissionProgress(
    handler.getReplicaCreateAdmissionOwner(), evidence, observation.row.status);
  if (!currentEvidence) {
    throw createAdmissionLifecycleError(
      `CREATE admission lifecycle progress deferred ${evidence.operationId}`,
      CREATE_ADMISSION_ERROR_CODE.DEFERRED,
      true,
    );
  }
  installCreateAdmissionLifecycleSnapshot(
    handler,
    observation.row,
    currentEvidence,
  );
  return {evidence: currentEvidence, row: observation.row};
}

function rowMatchesActiveStorageAdmission(row, handler, replicaId,
  partitionId, version) {
  if (!version) return false;
  const expected = {
    service_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: handler.nodeId,
    status: ReplicaStatus.ACTIVE,
    [version.column]: version.value,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
}

async function requireActiveReplicaStorageAdmission(
  handler,
  replicaId,
  partitionId,
) {
  const cached = handler.systemTableCache?.get?.(
    SYSTEM_TABLE_NAME.SERVICES,
    replicaId,
  );
  const version = durableRowVersion(cached);
  const observation = await observeAuthoritativeReplicaLifecycle(
    handler.replicaStateMachine,
    replicaId,
  );
  const row = observation.row;
  if (observation.available !== true ||
      !rowMatchesActiveStorageAdmission(
        row, handler, replicaId, partitionId, version)) {
    const error = new Error(
      `Replica storage admission deferred for ${replicaId}`,
    );
    error.code = isPartitionCleanupServiceRow(row) ?
      REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS :
      CREATE_OWNER_DEFERRED_CODE;
    error.deferRetry = true;
    throw error;
  }
  return row;
}

function explicitCreateOperationType(request) {
  const value = request?.[ReplicaOperationField.OPERATION_TYPE];
  return typeof value === REPLICA_HANDLER_TYPEOF.STRING ? value : null;
}

function internalCreateAdmissionEvidence(handler, request) {
  const candidate = request?.createAdmissionEvidence ?? null;
  return matchesInternalAdmissionEvidence(handler, request, candidate) ?
    candidate : null;
}

async function claimOperationLedgerCreate(handler, request, operationId) {
  const owner = handler.getReplicaCreateAdmissionOwner();
  try {
    return await owner.runExclusive(operationId, async () => {
      const evidence = await owner.claim(
        buildCreateAdmissionRequest(handler, request),
      );
      return handler.handleCreateReplica({...request, createAdmissionEvidence: evidence});
    });
  } catch (error) {
    return handler.buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.ERROR,
      {
        error: error?.message ?? String(error),
        errorCode: error?.errorCode ?? error?.code ??
          CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        deferRetry: error?.deferRetry === true,
        operationId,
        nodeId: handler.nodeId,
      },
    );
  }
}

function optionalObjectField(request, field) {
  const value = request?.[field];
  return value && typeof value === REPLICA_HANDLER_TYPEOF.OBJECT ? value : null;
}

function optionalArrayField(request, field) {
  const value = request?.[field];
  return Array.isArray(value) ? value : [];
}

function nullableValue(value) {
  return value ?? null;
}

async function buildPreparedCreateRequest(handler, request, admissionEvidence) {
  let reconciledAdmission = {evidence: admissionEvidence, row: null};
  if (admissionEvidence) {
    reconciledAdmission = await reconcileCreateAdmissionLifecycle(
      handler,
      admissionEvidence,
    );
  }
  const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
  const bootstrapPartitionMetadata = optionalObjectField(
    request,
    ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA,
  );
  const createRequest = {
    operationId: request?.[ReplicaOperationField.OPERATION_ID],
    explicitOperationType: explicitCreateOperationType(request),
    partitionId,
    replicaId: request?.[ReplicaOperationField.REPLICA_ID],
    bootstrapReplicaIds: optionalArrayField(
      request,
      ReplicaOperationField.REPLICA_IDS,
    ),
    bootstrapTableMetadata: optionalObjectField(
      request,
      ReplicaOperationField.BOOTSTRAP_TABLE_METADATA,
    ),
    bootstrapPartitionMetadata,
    bootstrapMembership: nullableValue(
      request?.[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP],
    ),
    createAdmissionEvidence: reconciledAdmission.evidence,
    createAttemptToken: nullableValue(
      reconciledAdmission.evidence?.attemptToken,
    ),
    deferCdcPropagationHandshake: classifySystemPartition({
      partitionId,
      partitionRow: bootstrapPartitionMetadata,
    }).priorityControlPlane,
  };
  return {createRequest, reconciledAdmission};
}

function missingCreateFields(createRequest) {
  return [
    createRequest.operationId,
    createRequest.partitionId,
    createRequest.replicaId,
  ].some((value) => !value);
}

function buildMissingCreateFieldsResponse(handler, createRequest) {
  const {operationId, partitionId, replicaId} = createRequest;
  handler.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_MISSING_FIELDS, {
    operationId,
    partitionId,
    replicaId,
    nodeId: handler.nodeId,
  });
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.ERROR,
    {error: REPLICA_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
      nodeId: handler.nodeId},
  );
}

async function terminalFailedCreateResponse(handler, prepared) {
  const {createRequest, reconciledAdmission} = prepared;
  if (reconciledAdmission.evidence?.operationTerminal !== true ||
      reconciledAdmission.row?.status !== ReplicaStatus.FAILED) return null;
  if (reconciledAdmission.row.cleanup_token === null &&
      typeof reconciledAdmission.evidence.attemptToken === 'string' &&
      reconciledAdmission.evidence.attemptToken.length > 0 &&
      reconciledAdmission.row.create_attempt_token ===
        reconciledAdmission.evidence.attemptToken) {
    await handler.replicaStateMachine?.claimFailedCreateCleanup?.(
      reconciledAdmission.row,
      buildFailedCreateCleanupToken(reconciledAdmission.evidence.operationId),
    );
  }
  await handler.getReplicaCreateAdmissionOwner().markProgress(
    reconciledAdmission.evidence,
    CREATE_ADMISSION_STATE.FAILED,
  );
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.ERROR,
    {
      operationId: createRequest.operationId,
      replicaId: createRequest.replicaId,
      [ReplicaOperationField.REPLICA_STATUS]: ReplicaStatus.FAILED,
      error: `Terminal CREATE attempt already failed for ${createRequest.replicaId}`,
      nodeId: handler.nodeId,
    },
  );
}

function existingActiveCreateResponse(handler, existingReplica, createRequest) {
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE, {
    replicaId: existingReplica.replicaId,
    nodeId: handler.nodeId,
  });
  handler.emitExecutorOutcome(
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
    createRequest.operationId,
    WORKFLOW_STEP.ACTIVE,
    {
      replicaId: existingReplica.replicaId,
      partitionId: existingReplica.partitionId ?? createRequest.partitionId,
    },
  );
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.ALREADY_EXISTS,
    {
      replicaId: existingReplica.replicaId,
      [ReplicaOperationField.REPLICA_STATUS]: ReplicaStatus.ACTIVE,
      nodeId: handler.nodeId,
    },
  );
}

function isPendingCreateStatus(status) {
  return [
    ReplicaStatus.PENDING,
    ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING,
  ].includes(status);
}

async function claimCreatePhysicalWorker(handler, createRequest) {
  const evidence = createRequest.createAdmissionEvidence;
  if (!evidence) {
    traceCreateWorker(handler, createRequest, 'claim', 'not_required');
    return true;
  }
  let claim;
  try {
    claim = await handler.getReplicaCreateAdmissionOwner().claimPhysicalWorker(evidence);
  } catch (error) {
    traceCreateWorker(handler, createRequest, 'claim', 'error', error);
    throw error;
  }
  traceCreateWorker(handler, createRequest, 'claim', claim ? 'acquired' : 'refused');
  if (!claim) return false;
  createRequest.createPhysicalWorkerClaim = claim;
  return true;
}

function inProgressCreateResponse(handler, operationId, replicaId,
  replicaStatus) {
  const details = {operationId, replicaId, nodeId: handler.nodeId};
  if (replicaStatus) {
    details[ReplicaOperationField.REPLICA_STATUS] = replicaStatus;
  }
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.IN_PROGRESS,
    details,
  );
}

async function restartPendingCreate(handler, existingReplica, createRequest,
  tableName) {
  if (!await claimCreatePhysicalWorker(handler, createRequest)) {
    return inProgressCreateResponse(
      handler, createRequest.operationId, createRequest.replicaId,
    );
  }
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_RESTARTING_PENDING, {
    replicaId: existingReplica.replicaId,
    status: existingReplica.status,
    nodeId: handler.nodeId,
  });
  handler.trackReplicaCreateOperation(
    createRequest.operationId,
    createRequest.partitionId,
    createRequest.replicaId,
    tableName,
  );
  createRequest.pendingStatusPersisted =
    existingReplica.status === ReplicaStatus.PENDING;
  // The restarted row's status reaches the create's admission-input owner
  // before any step of the attempt (verifier finding B1).
  createRequest.resumedLifecycleStatus = existingReplica.status;
  handler.startCreateReplicaAsync(createRequest);
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.INITIATED,
    {operationId: createRequest.operationId,
      replicaId: createRequest.replicaId, nodeId: handler.nodeId},
  );
}

async function pendingCreateResponse(handler, existingReplica, createRequest,
  tableName) {
  const decision = handler.resolvePendingReplicaCreateDecision(
    existingReplica,
    createRequest.replicaId,
    createRequest.createAdmissionEvidence,
  );
  if (decision === REPLICA_HANDLER_CREATE_DECISION.RESTART_CREATE) {
    return restartPendingCreate(
      handler, existingReplica, createRequest, tableName,
    );
  }
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_IN_PROGRESS, {
    replicaId: existingReplica.replicaId,
    status: existingReplica.status,
    nodeId: handler.nodeId,
  });
  handler.emitReplicaCreateInProgressOutcome(
    existingReplica,
    createRequest.operationId,
  );
  return inProgressCreateResponse(
    handler,
    createRequest.operationId,
    existingReplica.replicaId,
    existingReplica.status,
  );
}

async function existingCreateResponse(handler, existingReplica, createRequest,
  tableName) {
  if (!existingReplica) return null;
  if (handler.isReplicaCreateAlreadySatisfied(existingReplica)) {
    return existingActiveCreateResponse(handler, existingReplica, createRequest);
  }
  if (isPendingCreateStatus(existingReplica.status)) {
    return pendingCreateResponse(
      handler, existingReplica, createRequest, tableName,
    );
  }
  return null;
}

async function persistCreateLifecycle(handler, createRequest,
  needsReplicaRuntimeRepair, needsFailedCreateReplay) {
  if (needsReplicaRuntimeRepair) {
    await handler.requireActiveReplicaStorageAdmission(
      createRequest.replicaId,
      createRequest.partitionId,
    );
    return;
  }
  if (needsFailedCreateReplay) return;
  await handler.persistReplicaStatusWithRetry(
    createRequest.replicaId,
    ReplicaStatus.PENDING,
    {
      partitionId: createRequest.partitionId,
      createAdmissionEvidence: createRequest.createAdmissionEvidence,
      createAttemptToken: createRequest.createAttemptToken,
    },
  );
  if (createRequest.createAdmissionEvidence) {
    createRequest.createAdmissionEvidence =
      await handler.getReplicaCreateAdmissionOwner()
        .markMaterialized(createRequest.createAdmissionEvidence);
    if (!createRequest.createAdmissionEvidence) {
      throw new Error(
        `CREATE admission materialization deferred for ${createRequest.operationId}`,
      );
    }
  }
  createRequest.pendingStatusPersisted = true;
}

async function startPreparedCreate(handler, createRequest, tableName,
  needsReplicaRuntimeRepair) {
  if (!await claimCreatePhysicalWorker(handler, createRequest)) {
    return inProgressCreateResponse(
      handler, createRequest.operationId, createRequest.replicaId,
    );
  }
  handler.trackReplicaCreateOperation(
    createRequest.operationId,
    createRequest.partitionId,
    createRequest.replicaId,
    tableName,
  );
  createRequest.skipLifecycleStatusPersistence = needsReplicaRuntimeRepair;
  handler.startCreateReplicaAsync(createRequest);
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.INITIATED,
    {operationId: createRequest.operationId,
      replicaId: createRequest.replicaId, nodeId: handler.nodeId},
  );
}

async function executePreparedCreate(handler, prepared, tableName) {
  const {createRequest} = prepared;
  if (missingCreateFields(createRequest)) {
    return buildMissingCreateFieldsResponse(handler, createRequest);
  }
  const terminalResponse = await terminalFailedCreateResponse(handler, prepared);
  if (terminalResponse) return terminalResponse;
  const existingReplica = handler.getLocalReplica(createRequest.replicaId);
  const existingResponse = await existingCreateResponse(
    handler, existingReplica, createRequest, tableName,
  );
  if (existingResponse) return existingResponse;
  if (handler.inProgressOperations.has(createRequest.operationId)) {
    handler.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, {
      operationId: createRequest.operationId,
      nodeId: handler.nodeId,
    });
    return inProgressCreateResponse(handler, createRequest.operationId);
  }
  const needsReplicaRuntimeRepair =
    existingReplica?.status === ReplicaStatus.ACTIVE &&
    !handler.isReplicaCreateAlreadySatisfied(existingReplica);
  await persistCreateLifecycle(
    handler,
    createRequest,
    needsReplicaRuntimeRepair,
    existingReplica?.status === ReplicaStatus.FAILED,
  );
  return await startPreparedCreate(
    handler, createRequest, tableName, needsReplicaRuntimeRepair,
  );
}

function assignReplicaHandlerCreateAdmissionMethods(ReplicaHandler) {
  class ReplicaHandlerCreateAdmissionMethods {
    async recoverRetainedReplicaCreateAdmissions() {
      this.throwIfShuttingDown();
      const owner = this.getReplicaCreateAdmissionOwner();
      const rows = await owner.snapshotTargetAdmissions(SERVICE_TYPE.PARTITION);
      const deferredOperationIds = await recoverRetainedCreateAdmissionRows(
        this,
        owner,
        rows,
        {
          reconcileLifecycle: reconcileCreateAdmissionLifecycle,
          onFailure: (row, error) =>
            this.logger.warn(
              REPLICA_HANDLER_LOG_MSG.CREATE_ADMISSION_RECOVERY_FAILED,
              {operationId: row.operation_id, error: error.message, errorCode: error.code},
            ),
        },
      );
      if (deferredOperationIds.length > 0) {
        const error = createAdmissionLifecycleError(
          `CREATE admission recovery deferred for ${deferredOperationIds.join(',')}`,
          CREATE_ADMISSION_ERROR_CODE.DEFERRED,
          true,
        );
        error.operationIds = Object.freeze([...deferredOperationIds]);
        throw error;
      }
    }
    async handleCreateReplica(request) {
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const operationType = explicitCreateOperationType(request);
      const admissionEvidence = internalCreateAdmissionEvidence(
        this,
        request,
      );
      if (isOperationLedgerCreate(operationType) && !admissionEvidence) {
        return claimOperationLedgerCreate(this, request, operationId);
      }
      await this.awaitRemovedReplicaCleanupAdmissionBarrier();
      const prepared = await buildPreparedCreateRequest(
        this,
        request,
        admissionEvidence,
      );
      const {createRequest} = prepared;
      this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_REQUEST, {
        operationId: createRequest.operationId,
        explicitOperationType: createRequest.explicitOperationType,
        partitionId: createRequest.partitionId,
        replicaId: createRequest.replicaId,
        nodeId: this.nodeId,
      });
      return executePreparedCreate(this, prepared, request?.tableName ?? null);
    }
    async requireActiveReplicaStorageAdmission(replicaId, partitionId) {
      return requireActiveReplicaStorageAdmission(
        this,
        replicaId,
        partitionId,
      );
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerCreateAdmissionMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) continue;
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerCreateAdmissionMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerCreateAdmissionMethods};
