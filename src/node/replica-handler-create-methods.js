import {NUM, WORKFLOW_STEP} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isPriorityControlPlanePartition,
} from '../bootstrap/system-partition-classification.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_PROGRESS,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_HANDLER_LITERAL = Object.freeze({
  VALUE: '',
  UPSERT: 'UPSERT',
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
      const createRequest = {
        operationId,
        explicitOperationType,
        partitionId,
        replicaId,
        bootstrapReplicaIds,
        bootstrapPeerAddresses,
        bootstrapTableMetadata,
        bootstrapPartitionMetadata,
        deferCdcPropagationHandshake: isPriorityControlPlanePartition({
          partitionId,
          partitionRow: bootstrapPartitionMetadata,
        }),
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
          );
          if (
            pendingDecision === REPLICA_CREATE_PENDING_DECISION.RESTART_CREATE
          ) {
            this.logger.info(
              REPLICA_HANDLER_LOG_MSG.CREATE_RESTARTING_PENDING,
              {
                replicaId: existingReplica.replicaId,
                status: existingReplica.status,
                nodeId: this.nodeId,
              },
            );
            this.trackReplicaCreateOperation(
              operationId,
              partitionId,
              replicaId,
              tableName,
            );
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
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        tableName,
        status: ReplicaStatus.PENDING,
      });
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
     * @param {Object|null} existingReplica
     * @param {string} replicaId
     * @return {string}
     * @private
     */
    resolvePendingReplicaCreateDecision(existingReplica, replicaId) {
      const snapshot = {
        hasPendingStatus: existingReplica?.status === ReplicaStatus.PENDING,
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
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {void}
     * @private
     */
    deferRetryableReplicaCreateStatusWrite(options = {}) {
      const {operationId, partitionId, replicaId, error} = options;
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }
      this.localServices.delete(replicaId);
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_STATUS_WRITE_DEFERRED, {
        operationId,
        partitionId,
        replicaId,
        error: error?.message || this.formatReplicaCreationError(error),
        retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
          Math.floor(error.retryAfterMs) :
          null,
        nodeId: this.nodeId,
      });
    }
    /**
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {Promise<boolean>}
     * @private
     */
    async persistReplicaCreateInitialStatus(options = {}) {
      const {operationId, partitionId, replicaId} = options;
      if (this.shouldUsePriorityReplicaCreateStatusFallback(partitionId)) {
        await this.commitPriorityReplicaCreateStatusLocally({
          operationId,
          partitionId,
          replicaId,
        });
        return true;
      }
      try {
        await this.persistReplicaStatusWithRetry(replicaId, ReplicaStatus.PENDING, {
          partitionId,
        });
        this.throwIfShuttingDown();
        await this.persistReplicaStatusWithRetry(replicaId, ReplicaStatus.CREATING, {
          partitionId,
        });
        return true;
      } catch (error) {
        if (isRetryableControlPlaneError(error) !== true) {
          throw error;
        }
        this.deferRetryableReplicaCreateStatusWrite({
          operationId,
          partitionId,
          replicaId,
          error,
        });
        return false;
      }
    }
    /**
     * @param {string} partitionId
     * @return {boolean}
     * @private
     */
    shouldUsePriorityReplicaCreateStatusFallback(partitionId) {
      return isPriorityControlPlanePartition({partitionId});
    }
    /**
     * Priority control-plane recovery cannot require a second durable status
     * write before the local service exists; that service may be part of the
     * write path needed to make the status durable.
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {Promise<boolean>}
     * @private
     */
    async persistPriorityReplicaCreateCreatingStatus(options = {}) {
      const {operationId, partitionId, replicaId} = options;
      try {
        await this.updateReplicaStatus(replicaId, ReplicaStatus.CREATING, {
          partitionId,
        });
        return true;
      } catch (error) {
        if (isRetryableControlPlaneError(error) !== true) {
          throw error;
        }
        await this.commitPriorityReplicaCreateStatusLocally({
          operationId,
          partitionId,
          replicaId,
          error,
        });
        return true;
      }
    }
    /**
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @param {Error} options.error
     * @return {Promise<boolean>}
     * @private
     */
    /**
     * CL-016: the priority local-commit fallback must make the LOCAL cache
     * reflect local truth. isReplicaVoterReady, routing viability, and
     * fan-out target resolution all read the SERVICES row from the local
     * systemTableCache; during priority recovery the durable row write
     * EXPECTEDLY defers (it writes through the very control plane being
     * recovered), so without this seed the voter-ready check polls a row
     * that cannot exist within its budget — every priority REPLACE replica
     * timed out regardless of raft catch-up speed.
     * Bootstrap hydration exception: sanctioned direct
     * applySystemTableChange call site — local-only truth, superseded later
     * by the durable write's CDC round-trip (newer updated_at wins in the
     * cache merge).
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {string} status - ReplicaStatus value reflecting local truth.
     * @return {boolean} Whether the row was applied.
     * @private
     */
    seedLocalPriorityServiceRow(replicaId, partitionId, status) {
      if (
        !this.systemTableCache ||
        typeof this.systemTableCache.applySystemTableChange !==
          REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return false;
      }
      const nowMs = Date.now();
      this.systemTableCache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        REPLICA_HANDLER_LITERAL.UPSERT,
        {
          service_id: replicaId,
          service_type: REPLICA_HANDLER_SERVICE.TYPE,
          partition_id: partitionId,
          node_id: this.nodeId,
          status,
          address: this.buildTrackedServiceAddress(replicaId),
          created_at: nowMs,
          updated_at: nowMs,
        },
        {causeId: `priority-local-create:${replicaId}`},
      );
      // Lifecycle persistence must UPSERT for this row until a durable
      // write confirms remote existence (the local row no longer proxies
      // it).
      this.replicaStateMachine?.markServiceRowLocalOnly?.(replicaId);
      return true;
    }
    async commitPriorityReplicaCreateStatusLocally(options = {}) {
      const {operationId, partitionId, replicaId, error} = options;
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.CREATING,
      });
      this.seedLocalPriorityServiceRow(
        replicaId,
        partitionId,
        ReplicaStatus.CREATING,
      );
      const transitionContext = {
        partitionId,
        nodeId: this.nodeId,
        errorMessage: error?.message || null,
        serviceId: replicaId,
        serviceType: REPLICA_HANDLER_SERVICE.TYPE,
        serviceAddress: this.buildTrackedServiceAddress(replicaId),
      };
      const trackedState =
        this.replicaStateMachine?.getState?.(replicaId) || null;
      if (trackedState?.state !== ReplicaStatus.CREATING) {
        if (
          typeof this.replicaStateMachine?._applyTransition ===
            REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          const result = await Promise.resolve(
            this.replicaStateMachine._applyTransition(
              replicaId,
              ReplicaStatus.CREATING,
              transitionContext,
              {
                persist: false,
                validate: trackedState !== null,
              },
            ),
          );
          if (result === false) {
            throw new Error(
              `Replica local state transition rejected for ${replicaId}: ` +
                ReplicaStatus.CREATING,
            );
          }
        } else if (
          !trackedState &&
          typeof this.replicaStateMachine?.registerReplicaSnapshot ===
            REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          this.replicaStateMachine.registerReplicaSnapshot(replicaId, {
            ...transitionContext,
            state: ReplicaStatus.CREATING,
          });
        }
      }
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_STATUS_WRITE_DEFERRED, {
        operationId,
        partitionId,
        replicaId,
        status: ReplicaStatus.CREATING,
        localProgressCommitted: true,
        error: error?.message || this.formatReplicaCreationError(error),
        retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
          Math.floor(error.retryAfterMs) :
          null,
        nodeId: this.nodeId,
      });
      return true;
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
        deferCdcPropagationHandshake = false,
        skipLifecycleStatusPersistence = false,
      } = request;
      const progress = this.startReplicaCreationProgress({
        partitionId,
        replicaId,
        peerTotal: NUM.ZERO,
      });
      let partitionService = null;
      try {
        this.throwIfShuttingDown();
        if (!skipLifecycleStatusPersistence) {
          const initialStatusPersisted =
            await this.persistReplicaCreateInitialStatus({
              operationId,
              partitionId,
              replicaId,
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
        const isJoiningExistingGroup = existingReplicaCount > NUM.ZERO;
        this.updateReplicaCreationProgress(progress, {
          peerTotal: Array.isArray(replicaIds) ?
            Math.max(NUM.ZERO, replicaIds.length - NUM.ONE) :
            NUM.ZERO,
        });
        partitionService = await this.createPartitionService({
          partitionId,
          tableId,
          tableName,
          schema,
          keyRange,
          replicaId,
          replicaIds,
          peerAddresses: peerAddresses || [],
          // Pass unified peer addresses for routing
          nodeId: this.nodeId,
          dbPath,
          leaderAddress,
          isJoiningExistingGroup,
          deferCdcPropagationHandshake,
          // Start as learner if joining existing group
          suppressLifecycleLogs: true,
          onInitializationStage: (stageEvent) =>
            this.updateReplicaCreationProgress(progress, stageEvent),
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
          await this.updateReplicaStatus(replicaId, ReplicaStatus.SYNCING, {
            partitionId,
          });
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
        // Emit active outcome - coordinator will transition workflow.
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
            {partitionId},
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
        if (errorCode.length > NUM.ZERO) {
          failedOutcomeOptions.errorCode = errorCode;
        }
        if (
          Number.isFinite(error?.retryAfterMs) &&
          error.retryAfterMs > NUM.ZERO
        ) {
          failedOutcomeOptions.retryAfterMs = Math.floor(error.retryAfterMs);
        }
        if (error?.deferRetry === true) {
          failedOutcomeOptions.deferRetry = true;
        }
        // Emit failed outcome - coordinator will transition workflow.
        this.emitExecutorOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
          operationId,
          WORKFLOW_STEP.FAILED,
          failedOutcomeOptions,
        );
        try {
          await this.updateReplicaStatus(replicaId, ReplicaStatus.FAILED, {
            partitionId,
            errorMessage: error.message,
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
