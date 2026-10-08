import {WORKFLOW_STEP} from '../constants/index.js';
import {
  SERVICE_TYPE,
  isPartitionCleanupServiceRow,
} from '../constants/service.js';
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {REPLICA_CLEANUP_ERROR_CODE} from
  './replica-cleanup-tombstone-owner.js';
import {observeAuthoritativeReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';
import {durableRowVersion} from './replica-state-machine-recovery.js';
import * as priorExistence from './replica-prior-existence.js';
import {
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_PROGRESS,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const CREATE_OWNER_DEFERRED_CODE = 'CREATE_OWNER_DEFERRED';
const REPLICA_HANDLER_LITERAL = Object.freeze({
  VALUE: '',
});
const REPLICA_CREATE_IN_PROGRESS_OUTCOME_BY_STATUS = Object.freeze(
  new Map([
    [
      ReplicaStatus.PENDING,
      Object.freeze({
        outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
        workflowStep: WORKFLOW_STEP.CREATING,
      }),
    ],
    [
      ReplicaStatus.CREATING,
      Object.freeze({
        outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
        workflowStep: WORKFLOW_STEP.CREATING,
      }),
    ],
    [
      ReplicaStatus.SYNCING,
      Object.freeze({
        outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
        workflowStep: WORKFLOW_STEP.SYNCING,
      }),
    ],
  ]),
);
const REPLICA_CREATE_PENDING_DECISION = Object.freeze({
  REPORT_IN_PROGRESS: 'report_in_progress',
  RESTART_CREATE: 'restart_create',
});
// Rows a create re-drives when nothing runs for them in this process: PENDING
// never opened; SYNCING is the ack-loss wedge, resumed at its own row (F3 c).
const RESTARTABLE_CREATE_STATUSES = new Set([
  ReplicaStatus.PENDING, ReplicaStatus.SYNCING]);

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

function assignReplicaHandlerCreateMethods(ReplicaHandler) {
  class ReplicaHandlerCreateMethods {
    /**
     * Handle CREATE_REPLICA request.
     * Returns immediately with 'initiated', then does async work.
     * Implements idempotency per Requirements 10.2.
     * @param {Object} request - CREATE_REPLICA request.
     * @return {Promise<Object>} Response.
     */
    async handleCreateReplica(request) {
      await this.awaitRemovedReplicaCleanupAdmissionBarrier();
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const explicitOperationType =
        typeof request?.[ReplicaOperationField.OPERATION_TYPE] ===
        REPLICA_HANDLER_TYPEOF.STRING ?
          request[ReplicaOperationField.OPERATION_TYPE] :
          null;
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
            existingReplica, replicaId);
          if (
            pendingDecision === REPLICA_CREATE_PENDING_DECISION.RESTART_CREATE
          ) {
            this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_RESTARTING_PENDING, {
              replicaId: existingReplica.replicaId,
              status: existingReplica.status,
              nodeId: this.nodeId,
            });
            this.trackReplicaCreateOperation(
              operationId, partitionId, replicaId, tableName);
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
          {partitionId},
        );
        createRequest.pendingStatusPersisted = true;
      }
      this.trackReplicaCreateOperation(
        operationId,
        partitionId,
        replicaId,
        tableName,
      );
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
    /**
     * @param {Object|null} existingReplica
     * @param {string} replicaId
     * @return {string}
     * @private
     */
    resolvePendingReplicaCreateDecision(existingReplica, replicaId) {
      const snapshot = {
        hasPendingStatus:
          RESTARTABLE_CREATE_STATUSES.has(existingReplica?.status),
        hasInProgressCreate: this.hasInProgressReplicaCreation(replicaId),
        hasTrackedService: Boolean(this.getTrackedService(replicaId)),
      };
      if (
        snapshot.hasPendingStatus &&
        !snapshot.hasInProgressCreate &&
        !snapshot.hasTrackedService
      ) {
        return REPLICA_CREATE_PENDING_DECISION.RESTART_CREATE;
      }
      return REPLICA_CREATE_PENDING_DECISION.REPORT_IN_PROGRESS;
    }
    /**
     * @param {string} replicaId
     * @return {boolean}
     * @private
     */
    hasInProgressReplicaCreation(replicaId) {
      for (const operation of this.inProgressOperations.values()) {
        if (
          operation?.type === ReplicaOperationMessageType.CREATE_REPLICA &&
          operation?.replicaId === replicaId
        ) {
          return true;
        }
      }
      return false;
    }
    /**
     * @param {string} operationId
     * @param {string} partitionId
     * @param {string} replicaId
     * @param {string|null} tableName
     * @return {void}
     * @private
     */
    trackReplicaCreateOperation(
      operationId,
      partitionId,
      replicaId,
      tableName,
    ) {
      this.inProgressOperations.set(operationId, {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        replicaId,
        partitionId,
        tableName,
        startedAt: Date.now(),
      });
    }
    /**
     * @param {Object} request
     * @return {void}
     * @private
     */
    startCreateReplicaAsync(request) {
      const operationId = request?.operationId;
      const replicaId = request?.replicaId;
      // Start async creation after ACK has returned.
      this.registerOperationTask(
        new Promise((resolve) => {
          setImmediate(() => {
            if (this.shuttingDown) {
              this.inProgressOperations.delete(operationId);
              this.localServices.delete(replicaId);
              this.localReplicas.delete(replicaId);
              resolve();
              return;
            }
            resolve(
              this.createReplicaAsync(request).catch((error) => {
                this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED, {
                  operationId,
                  replicaId,
                  error: error.message,
                  stack: error.stack,
                });
              }),
            );
          });
        }),
      );
    }
    emitReplicaCreateInProgressOutcome(existingReplica, operationId) {
      const outcome = REPLICA_CREATE_IN_PROGRESS_OUTCOME_BY_STATUS.get(
        existingReplica?.status,
      );
      if (!outcome) {
        return false;
      }
      this.emitExecutorOutcome(
        outcome.outcomeType,
        operationId,
        outcome.workflowStep,
        {
          replicaId: existingReplica.replicaId,
          partitionId: existingReplica.partitionId,
        },
      );
      return true;
    }
    /**
     * Async replica creation - reports progress via CDC.
     * @param {Object} request - Creation request.
     * @return {Promise<void>}
     * @private
     */
    async createReplicaAsync(request) {
      const {
        operationId,
        explicitOperationType,
        partitionId,
        replicaId,
        bootstrapReplicaIds,
        bootstrapPeerAddresses,
        bootstrapTableMetadata,
        bootstrapPartitionMetadata,
        bootstrapMembership,
        deferCdcPropagationHandshake = false,
        skipLifecycleStatusPersistence = false,
        pendingStatusPersisted = false,
      } = request;
      const progress = this.startReplicaCreationProgress({
        partitionId,
        replicaId,
        peerTotal: 0,
      });
      let partitionService = null;
      try {
        this.throwIfShuttingDown();
        const {existed, record: identityRecord} = await priorExistence
          .observeReplicaIdentity(this, replicaId, skipLifecycleStatusPersistence);
        if (!skipLifecycleStatusPersistence) {
          const initialStatusPersisted =
            await this.persistReplicaCreateInitialStatus({
              operationId,
              partitionId,
              replicaId,
              pendingStatusPersisted,
            });
          if (initialStatusPersisted !== true) {
            this.clearReplicaCreationProgress(progress);
            return;
          }
        } else {
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.CREATING,
          });
        }
        this.applyBootstrapMetadataPayload({
          partitionId,
          bootstrapTableMetadata,
          bootstrapPartitionMetadata,
        });
        this.updateReplicaCreationProgress(progress, {
          stage: REPLICA_HANDLER_PROGRESS.STAGE_RESOLVING_CONTEXT,
        });
        const context = await this.resolveReplicaContextWithRetry(
          partitionId,
          replicaId,
          {
            bootstrapReplicaIds,
            bootstrapPeerAddresses,
            bootstrapTableMetadata,
            bootstrapPartitionMetadata,
            bootstrapMembership,
            explicitOperationType,
          },
        );
        this.throwIfShuttingDown();
        const {
          tableName,
          tableId,
          schema,
          keyRange,
          leaderAddress,
          replicaIds,
          peerAddresses,
          existingReplicaCount,
        } = context;
        // Generate database path
        const dbPath = this.getPartitionDbPath(partitionId, replicaId);
        // Determine if this replica is joining an already-established Raft group.
        // Provisional sibling service rows alone are not enough; fresh partition
        // bring-up must bootstrap voters until a leader or active voter exists.
        const isJoiningExistingGroup = existingReplicaCount > 0;
        this.updateReplicaCreationProgress(progress, {
          peerTotal: Array.isArray(replicaIds) ?
            Math.max(0, replicaIds.length - 1) :
            0,
        });
        partitionService = await this.createPartitionService({
          partitionId, tableId, tableName, schema, keyRange,
          replicaId,
          replicaIds,
          peerAddresses: peerAddresses || [],
          // Pass unified peer addresses for routing
          nodeId: this.nodeId,
          dbPath,
          leaderAddress,
          isJoiningExistingGroup,
          bootstrapMembership: context.bootstrapMembership,
          identityExisted: existed,
          identityRecorded: identityRecord?.recorded,
          deferCdcPropagationHandshake,
          // Start as learner if joining existing group
          suppressLifecycleLogs: true,
          onInitializationStage: (stageEvent) =>
            this.updateReplicaCreationProgress(progress, stageEvent),
          resolveHandlerRetirementLane: () => this.replicaStateMachine,
        });
        if (
          this.shuttingDown &&
          typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          await partitionService.shutdown();
        }
        this.throwIfShuttingDown();
        // Store service reference in localServices
        this.localServices.set(replicaId, partitionService);
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          tableName,
          service: partitionService,
        });
        // Emit syncing outcome - coordinator will transition workflow.
        this.emitExecutorOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
          operationId,
          WORKFLOW_STEP.SYNCING,
          {replicaId, partitionId},
        );
        this.updateReplicaCreationProgress(progress, {
          stage: ReplicaStatus.SYNCING,
        });
        if (!skipLifecycleStatusPersistence) {
          await priorExistence.recordReplicaIdentity(this, replicaId, partitionId, identityRecord);
        } else {
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            tableName,
            status: ReplicaStatus.SYNCING,
            service: partitionService,
          });
        }
        // Sync from leader if address provided
        const service = this.localServices.get(replicaId);
        if (service && leaderAddress) {
          if (typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION) {
            await service.syncFromLeader(leaderAddress);
          }
        }
        this.throwIfShuttingDown();
        if (
          this.shouldGateActivationOnVoterReadiness(
            partitionId,
            operationId,
            isJoiningExistingGroup,
            explicitOperationType,
          )
        ) {
          this.updateReplicaCreationProgress(progress, {
            stage: REPLICA_HANDLER_PROGRESS.STAGE_WAITING_VOTER_READY,
          });
          await this.waitForVoterReadyActivation(replicaId, partitionId);
        }
        // Voter readiness is executor evidence, not permission to complete
        // the operation. Publish it before the SERVICES write so formation
        // cannot depend on a round-trip through the control plane being
        // recovered. The operation owner independently requires authoritative
        // ACTIVE SERVICES alignment before ADD completion or REPLACE source
        // retirement.
        this.emitExecutorOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
          operationId,
          WORKFLOW_STEP.ACTIVE,
          {replicaId, partitionId},
        );
        if (!skipLifecycleStatusPersistence) {
          await this.persistReplicaStatusWithRetry(
            replicaId,
            ReplicaStatus.ACTIVE,
            {partitionId, activationService: partitionService},
          );
        } else {
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            tableName,
            status: ReplicaStatus.ACTIVE,
            service: partitionService,
          });
        }
        this.finishReplicaCreationProgress(progress, ReplicaStatus.ACTIVE);
        // Clean up in-progress tracking
        if (operationId) {
          this.inProgressOperations.delete(operationId);
        }
        this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_COMPLETED, {
          operationId,
          replicaId,
          partitionId,
          nodeId: this.nodeId,
        });
        this.emit(REPLICA_HANDLER_EVENT.CREATED, {
          operationId,
          replicaId,
          partitionId,
          nodeId: this.nodeId,
        });
      } catch (error) {
        if (this.shuttingDown) {
          this.clearReplicaCreationProgress(progress);
          if (
            partitionService &&
            typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION
          ) {
            try {
              await partitionService.shutdown();
            } catch (_shutdownErr) {
              void _shutdownErr;
            }
          }
          if (operationId) {
            this.inProgressOperations.delete(operationId);
          }
          this.localServices.delete(replicaId);
          this.localReplicas.delete(replicaId);
          return;
        }
        if (error?.code ===
            REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS) {
          this.clearReplicaCreationProgress(progress);
          if (operationId) this.inProgressOperations.delete(operationId);
          this.localServices.delete(replicaId);
          this.localReplicas.delete(replicaId);
          this.emitExecutorOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
            operationId,
            WORKFLOW_STEP.FAILED,
            {
              replicaId,
              partitionId,
              errorCode: error.code,
              errorMessage: error.message,
              deferRetry: true,
            },
          );
          throw error;
        }
        await this.fenceFailedReplicaCreateRuntime(
          replicaId,
          partitionId,
          partitionService,
        );
        this.failReplicaCreationProgress(progress, error);
        this.logger.error(REPLICA_HANDLER_LOG_MSG.CREATE_FAILED, {
          operationId,
          replicaId,
          partitionId,
          error: error.message,
          stack: error.stack,
        });
        const failedOutcomeOptions = {
          replicaId,
          partitionId,
          errorMessage: error.message,
        };
        const errorCode =
          typeof error?.errorCode === REPLICA_HANDLER_TYPEOF.STRING ?
            error.errorCode :
            typeof error?.code === REPLICA_HANDLER_TYPEOF.STRING ?
              error.code :
              REPLICA_HANDLER_LITERAL.VALUE;
        if (errorCode.length > 0) {
          failedOutcomeOptions.errorCode = errorCode;
        }
        if (
          Number.isFinite(error?.retryAfterMs) &&
          error.retryAfterMs > 0
        ) {
          failedOutcomeOptions.retryAfterMs = Math.floor(error.retryAfterMs);
        }
        if (error?.deferRetry === true) {
          failedOutcomeOptions.deferRetry = true;
        }
        try {
          // Confirm exact FAILED authority before publishing terminal outcome.
          await this.persistOrConfirmReplicaCreateFailed({
            operationId,
            replicaId,
            partitionId,
            errorMessage: error.message,
            claimCleanup: error?.deferRetry !== true,
          });
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.FAILED,
          });
          // CL-016 failure-path symmetry: a locally-seeded SERVICES row must
          // never linger as a 'creating' ghost after terminal failure.
          if (this.shouldUsePriorityReplicaCreateStatusFallback(partitionId)) {
            this.seedLocalPriorityServiceRow(
              replicaId,
              partitionId,
              ReplicaStatus.FAILED,
            );
          }
          this.emitExecutorOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
            operationId,
            WORKFLOW_STEP.FAILED,
            failedOutcomeOptions,
          );
        } finally {
          // Clean up in-progress tracking even when FAILED status persistence is deferred.
          if (operationId) {
            this.inProgressOperations.delete(operationId);
          }
        }
        this.emit(REPLICA_HANDLER_EVENT.CREATION_FAILED, {
          operationId,
          replicaId,
          partitionId,
          error: error.message,
          nodeId: this.nodeId,
        });
        throw error;
      }
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerCreateMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerCreateMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerCreateMethods};
