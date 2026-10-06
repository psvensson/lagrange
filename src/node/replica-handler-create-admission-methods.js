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
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
  getOperationMetadataObject,
  getOperationMetadataStringArray,
} from '../rebalancer/replica-status.js';
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
  REPLICA_HANDLER_CREATE_DECISION,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const CREATE_OWNER_DEFERRED_CODE = 'CREATE_OWNER_DEFERRED';
const EMPTY_ADMISSION_STEPS_HISTORY = Object.freeze([]);
const ROTATING_ADMISSION_RECOVERY_REFUSED = false;

function parseAdmissionStepsHistory(row) {
  if (Array.isArray(row?.steps_history)) return row.steps_history;
  if (typeof row?.steps_history !== REPLICA_HANDLER_TYPEOF.STRING) {
    return EMPTY_ADMISSION_STEPS_HISTORY;
  }
  try {
    const parsed = JSON.parse(row.steps_history);
    return Array.isArray(parsed) ? parsed : EMPTY_ADMISSION_STEPS_HISTORY;
  } catch (_error) {
    return EMPTY_ADMISSION_STEPS_HISTORY;
  }
}

function createAdmissionLifecycleError(message, code, deferRetry = false) {
  const error = new Error(message);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = deferRetry;
  return error;
}

function buildRetainedCreateRequest(row, evidence) {
  const stepsHistory = parseAdmissionStepsHistory(row);
  const request = {
    [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.CREATE_REPLICA,
    [ReplicaOperationField.OPERATION_ID]: row.operation_id,
    [ReplicaOperationField.OPERATION_TYPE]: row.type,
    [ReplicaOperationField.ENTITY_TYPE]: row.entity_type,
    [ReplicaOperationField.ENTITY_ID]: row.entity_id,
    [ReplicaOperationField.PARTITION_ID]: row.partition_id,
    [ReplicaOperationField.REPLICA_ID]: row.replica_id,
    [ReplicaOperationField.CREATE_ADMISSION_TOKEN]: evidence.admissionToken,
    [ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT]:
      evidence.workflowUpdatedAt,
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN]:
      evidence.attemptToken,
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ]: evidence.attemptSeq,
    createAdmissionEvidence: evidence,
  };
  const replicaIds = getOperationMetadataStringArray(
    stepsHistory,
    OPERATION_METADATA_KEY.REPLICA_IDS,
  );
  const peerAddresses = getOperationMetadataStringArray(
    stepsHistory,
    OPERATION_METADATA_KEY.PEER_ADDRESSES,
  );
  const metadata = [
    [ReplicaOperationField.BOOTSTRAP_TABLE_METADATA,
      OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA],
    [ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA,
      OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA],
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP,
      OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP],
  ];
  if (replicaIds.length > 0) {
    request[ReplicaOperationField.REPLICA_IDS] = replicaIds;
  }
  if (peerAddresses.length > 0) {
    request[ReplicaOperationField.PEER_ADDRESSES] = peerAddresses;
  }
  for (const [field, key] of metadata) {
    const value = getOperationMetadataObject(stepsHistory, key);
    if (value) request[field] = value;
  }
  return request;
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
  return row?.service_id === evidence.replicaId &&
    row?.replica_id === evidence.replicaId &&
    row?.partition_id === evidence.partitionId &&
    row?.node_id === handler.nodeId &&
    row?.service_type === SERVICE_TYPE.PARTITION &&
    row?.created_at === evidence.replicaCreatedAt &&
    row?.create_attempt_token === evidence.attemptToken;
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
  const exactIncarnation = row?.service_id === evidence.replicaId &&
    row?.replica_id === evidence.replicaId &&
    row?.partition_id === evidence.partitionId &&
    row?.node_id === handler.nodeId &&
    row?.service_type === SERVICE_TYPE.PARTITION &&
    row?.created_at === evidence.replicaCreatedAt;
  if (!exactIncarnation) return ROTATING_ADMISSION_RECOVERY_REFUSED;
  if (row.create_attempt_token === evidence.attemptToken) {
    installCreateAdmissionLifecycleSnapshot(handler, row, evidence);
    const finished = await handler.getReplicaCreateAdmissionOwner()
      .finishFailedAttemptRotation(evidence);
    return finished ? {evidence: finished, row} : null;
  }
  if (row.status !== ReplicaStatus.FAILED ||
      row.cleanup_token !== null && row.cleanup_token !== undefined ||
      row.create_attempt_token !== evidence.previousAttemptToken) {
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
  let currentEvidence = evidence;
  if (evidence.admissionState === CREATE_ADMISSION_STATE.ADMITTED) {
    currentEvidence = await handler.getReplicaCreateAdmissionOwner()
      .markMaterialized(evidence);
    if (!currentEvidence) {
      throw createAdmissionLifecycleError(
        `CREATE admission materialization deferred ${evidence.operationId}`,
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        true,
      );
    }
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

function assignReplicaHandlerCreateAdmissionMethods(ReplicaHandler) {
  class ReplicaHandlerCreateAdmissionMethods {
    async recoverRetainedReplicaCreateAdmissions() {
      this.throwIfShuttingDown();
      const owner = this.getReplicaCreateAdmissionOwner();
      const rows = await owner.snapshotTargetAdmissions();
      for (const row of rows) {
        this.throwIfShuttingDown();
        if (row.create_admission_state === CREATE_ADMISSION_STATE.CLOSED) {
          continue;
        }
        await owner.runExclusive(row.operation_id, async () => {
          this.throwIfShuttingDown();
          const evidence = await owner.takeoverRetained(row);
          if (!evidence) return;
          const reconciled = await reconcileCreateAdmissionLifecycle(
            this,
            evidence,
          );
          const lifecycleStatus = reconciled.row?.status || null;
          if (lifecycleStatus === ReplicaStatus.ACTIVE ||
              lifecycleStatus === ReplicaStatus.FAILED) {
            const settledState = lifecycleStatus === ReplicaStatus.ACTIVE ?
              CREATE_ADMISSION_STATE.ACTIVE :
              CREATE_ADMISSION_STATE.FAILED;
            if (reconciled.evidence.admissionState !== settledState &&
                !await owner.markProgress(
                  reconciled.evidence,
                  settledState,
                )) {
              const error = new Error(
                `CREATE admission progress deferred ${row.operation_id}`,
              );
              error.code = CREATE_ADMISSION_ERROR_CODE.DEFERRED;
              error.deferRetry = true;
              throw error;
            }
            return;
          }
          await this.handleCreateReplica(
            buildRetainedCreateRequest(row, reconciled.evidence),
          );
        });
      }
    }
    /**
     * Handle CREATE_REPLICA request.
     * Returns immediately with 'initiated', then does async work.
     * Implements idempotency per Requirements 10.2.
     * @param {Object} request - CREATE_REPLICA request.
     * @return {Promise<Object>} Response.
     */
    async handleCreateReplica(request) {
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const explicitOperationType =
        typeof request?.[ReplicaOperationField.OPERATION_TYPE] ===
        REPLICA_HANDLER_TYPEOF.STRING ?
          request[ReplicaOperationField.OPERATION_TYPE] :
          null;
      const candidateAdmissionEvidence =
        request?.createAdmissionEvidence || null;
      const admissionEvidence = matchesInternalAdmissionEvidence(
        this,
        request,
        candidateAdmissionEvidence,
      ) ? candidateAdmissionEvidence : null;
      if (isOperationLedgerCreate(explicitOperationType) &&
          !admissionEvidence) {
        const owner = this.getReplicaCreateAdmissionOwner();
        try {
          await this.awaitReplicaCreateAdmissionRecoveryBarrier();
          return await owner.runExclusive(operationId, async () => {
            const evidence = await owner.claim(
              buildCreateAdmissionRequest(this, request),
            );
            return this.handleCreateReplica({
              ...request,
              createAdmissionEvidence: evidence,
            });
          });
        } catch (error) {
          return this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.ERROR,
            {
              error: error?.message || String(error),
              errorCode: error?.errorCode || error?.code ||
                CREATE_ADMISSION_ERROR_CODE.DEFERRED,
              deferRetry: error?.deferRetry === true,
              operationId,
              nodeId: this.nodeId,
            },
          );
        }
      }
      await this.awaitRemovedReplicaCleanupAdmissionBarrier();
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      const bootstrapReplicaIds = Array.isArray(
        request?.[ReplicaOperationField.REPLICA_IDS],
      ) ?
        request[ReplicaOperationField.REPLICA_IDS] :
        [];
      const bootstrapPeerAddresses = Array.isArray(
        request?.[ReplicaOperationField.PEER_ADDRESSES],
      ) ?
        request[ReplicaOperationField.PEER_ADDRESSES] :
        [];
      const bootstrapTableMetadata =
        request?.[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] &&
        typeof request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] ===
          REPLICA_HANDLER_TYPEOF.OBJECT ?
          request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] :
          null;
      const bootstrapPartitionMetadata =
        request?.[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] &&
        typeof request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] ===
          REPLICA_HANDLER_TYPEOF.OBJECT ?
          request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] :
          null;
      const tableName = request?.tableName || null;
      // The committed-membership stamp, carried unchanged to the target's
      // port (owner decision O1); validated in resolveReplicaContext.
      const bootstrapMembership =
        request?.[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP] ?? null;
      let reconciledAdmission = {evidence: admissionEvidence, row: null};
      if (admissionEvidence) {
        reconciledAdmission = await reconcileCreateAdmissionLifecycle(
          this,
          admissionEvidence,
        );
      }
      const createRequest = {
        operationId,
        explicitOperationType,
        partitionId,
        replicaId,
        bootstrapReplicaIds,
        bootstrapPeerAddresses,
        bootstrapTableMetadata,
        bootstrapPartitionMetadata,
        bootstrapMembership,
        createAdmissionEvidence: reconciledAdmission.evidence,
        createAttemptToken: reconciledAdmission.evidence?.attemptToken || null,
        deferCdcPropagationHandshake: classifySystemPartition({
          partitionId,
          partitionRow: bootstrapPartitionMetadata,
        }).priorityControlPlane,
      };
      this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_REQUEST, {
        operationId,
        explicitOperationType,
        partitionId,
        replicaId,
        nodeId: this.nodeId,
      });
      if (!operationId || !partitionId || !replicaId) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_MISSING_FIELDS, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: REPLICA_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
            nodeId: this.nodeId,
          },
        );
      }
      if (reconciledAdmission.evidence?.operationTerminal === true &&
          reconciledAdmission.row?.status === ReplicaStatus.FAILED) {
        await this.getReplicaCreateAdmissionOwner().markProgress(
          reconciledAdmission.evidence,
          CREATE_ADMISSION_STATE.FAILED,
        );
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            operationId,
            replicaId,
            [ReplicaOperationField.REPLICA_STATUS]: ReplicaStatus.FAILED,
            error: `Terminal CREATE attempt already failed for ${replicaId}`,
            nodeId: this.nodeId,
          },
        );
      }
      // Check idempotency - existing replica
      const existingReplica = this.getLocalReplica(replicaId);
      const needsReplicaRuntimeRepair =
        existingReplica?.status === ReplicaStatus.ACTIVE &&
        !this.isReplicaCreateAlreadySatisfied(existingReplica);
      const needsFailedCreateReplay =
        existingReplica?.status === ReplicaStatus.FAILED;
      if (existingReplica) {
        if (this.isReplicaCreateAlreadySatisfied(existingReplica)) {
          this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE, {
            replicaId: existingReplica.replicaId,
            nodeId: this.nodeId,
          });
          this.emitExecutorOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            operationId,
            WORKFLOW_STEP.ACTIVE,
            {
              replicaId: existingReplica.replicaId,
              partitionId: existingReplica.partitionId || partitionId,
            },
          );
          return this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.ALREADY_EXISTS,
            {
              replicaId: existingReplica.replicaId,
              [ReplicaOperationField.REPLICA_STATUS]: ReplicaStatus.ACTIVE,
              nodeId: this.nodeId,
            },
          );
        }
        if (
          existingReplica.status === ReplicaStatus.PENDING ||
          existingReplica.status === ReplicaStatus.CREATING ||
          existingReplica.status === ReplicaStatus.SYNCING
        ) {
          const pendingDecision = this.resolvePendingReplicaCreateDecision(
            existingReplica,
            replicaId,
            createRequest.createAdmissionEvidence,
          );
          if (
            pendingDecision === REPLICA_HANDLER_CREATE_DECISION.RESTART_CREATE
          ) {
            if (createRequest.createAdmissionEvidence &&
                !this.getReplicaCreateAdmissionOwner().claimPhysicalWorker(
                  createRequest.createAdmissionEvidence,
                )) {
              return this.buildReplicaOperationResponse(
                ReplicaOperationResponseStatus.IN_PROGRESS,
                {operationId, replicaId, nodeId: this.nodeId},
              );
            }
            this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_RESTARTING_PENDING, {
              replicaId: existingReplica.replicaId,
              status: existingReplica.status,
              nodeId: this.nodeId,
            });
            this.trackReplicaCreateOperation(
              operationId, partitionId, replicaId, tableName);
            createRequest.pendingStatusPersisted =
              existingReplica.status === ReplicaStatus.PENDING;
            this.startCreateReplicaAsync(createRequest);
            return this.buildReplicaOperationResponse(
              ReplicaOperationResponseStatus.INITIATED,
              {
                operationId,
                replicaId,
                nodeId: this.nodeId,
              },
            );
          }
          this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_IN_PROGRESS, {
            replicaId: existingReplica.replicaId,
            status: existingReplica.status,
            nodeId: this.nodeId,
          });
          this.emitReplicaCreateInProgressOutcome(
            existingReplica,
            operationId,
          );
          return this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.IN_PROGRESS,
            {
              replicaId: existingReplica.replicaId,
              [ReplicaOperationField.REPLICA_STATUS]: existingReplica.status,
              nodeId: this.nodeId,
            },
          );
        }
      }
      // Check idempotency - in-progress operation
      if (this.inProgressOperations.has(operationId)) {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, {
          operationId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.IN_PROGRESS,
          {
            operationId,
            nodeId: this.nodeId,
          },
        );
      }
      // Track in-progress operation
      if (needsReplicaRuntimeRepair) {
        await this.requireActiveReplicaStorageAdmission(
          replicaId,
          partitionId,
        );
      } else if (!needsFailedCreateReplay) {
        await this.persistReplicaStatusWithRetry(
          replicaId,
          ReplicaStatus.PENDING,
          {
            partitionId,
            createAdmissionEvidence: createRequest.createAdmissionEvidence,
            createAttemptToken: createRequest.createAttemptToken,
          },
        );
        if (createRequest.createAdmissionEvidence) {
          createRequest.createAdmissionEvidence =
            await this.getReplicaCreateAdmissionOwner()
              .markMaterialized(createRequest.createAdmissionEvidence);
          if (!createRequest.createAdmissionEvidence) {
            throw new Error(
              `CREATE admission materialization deferred for ${operationId}`,
            );
          }
        }
        createRequest.pendingStatusPersisted = true;
      }
      this.trackReplicaCreateOperation(
        operationId,
        partitionId,
        replicaId,
        tableName,
      );
      if (createRequest.createAdmissionEvidence &&
          !this.getReplicaCreateAdmissionOwner().claimPhysicalWorker(
            createRequest.createAdmissionEvidence,
          )) {
        this.inProgressOperations.delete(operationId);
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.IN_PROGRESS,
          {operationId, replicaId, nodeId: this.nodeId},
        );
      }
      createRequest.skipLifecycleStatusPersistence = needsReplicaRuntimeRepair;
      this.startCreateReplicaAsync(createRequest);
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.INITIATED,
        {
          operationId,
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }
    /**
     * Prove that an existing replica path still belongs to the exact cached
     * live generation before reopening it.
     * @param {string} replicaId
     * @param {string} partitionId
     * @return {Promise<Object>}
     */
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
