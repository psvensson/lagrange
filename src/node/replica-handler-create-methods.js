import {createReplicaRuntimePublication, publishReplicaRuntime} from './replica-runtime-publication.js';
import {isReplicaRuntimeProducerCurrent} from './replica-runtime-producer.js';
import {captureReplicaAdmission, isReplicaAdmissionCurrent} from './replica-state-machine-serialization.js';
import {buildReplicaLifecycleMutationPredicateFromState} from './replica-state-machine-lifecycle-observation.js';
import {isReplicaCreateAdmissionEvidence} from './replica-create-admission-evidence.js';
import {runtimePublicationRefused} from '../partition/partition-runtime-publication.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {REPLICA_CREATE_PHASE, failedReplicaCreateClaimsCleanup,
  replicaCreatePhaseAfterResume} from './replica-create-admission-input.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {
  ReplicaOperationMessageType,
} from '../rebalancer/replica-operation-constants.js';
import {
  ReplicaStatus,
} from '../rebalancer/replica-status.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
} from './replica-create-admission-owner.js';
import {assignReplicaHandlerCreateAdmissionMethods} from
  './replica-handler-create-admission-methods.js';
import {
  isSupersededAdmissionError,
  retireSupersededCreateAdmissionRuntime,
} from './replica-create-admission-retained-recovery.js';
import {REPLICA_CLEANUP_ERROR_CODE} from
  './replica-cleanup-tombstone-owner.js';
import * as priorExistence from './replica-prior-existence.js';
import {
  REPLICA_HANDLER_CREATE_DECISION,
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_PROGRESS,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
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
// Rows a create re-drives when nothing runs for them in this process: PENDING
// never opened; SYNCING is the ack-loss wedge, resumed at its own row (F3 c).
const RESTARTABLE_CREATE_STATUSES = new Set([
  ReplicaStatus.PENDING, ReplicaStatus.SYNCING]);

function canReleaseFreshCreateOnActivation(
  handler,
  partitionService,
  {skipLifecycleStatusPersistence, existed, createAdmissionEvidence},
) {
  if (
    skipLifecycleStatusPersistence ||
    existed !== false ||
    !createAdmissionEvidence
  ) {
    return false;
  }
  const router = handler.messageRouter;
  if (typeof router?.deliver !== REPLICA_HANDLER_TYPEOF.FUNCTION) {
    return false;
  }
  if (typeof router.getRegisteredHandler === REPLICA_HANDLER_TYPEOF.FUNCTION) {
    return (
      router.getRegisteredHandler(`${handler.nodeId}/service/replica-handler`) !== null &&
      partitionService?.db != null &&
      typeof partitionService?.raft?.readStatus === REPLICA_HANDLER_TYPEOF.FUNCTION
    );
  }
  return true;
}

function armCreateAdmissionRecoveryRearm(handler) {
  if (handler.shuttingDown) return;
  handler.replicaCreateAdmissionRecoveryRearmOwner?.arm?.(
    () => handler.startReplicaCreateAdmissionRecovery(),
    REPLICA_HANDLER_DEFAULT.CREATE_ADMISSION_RECOVERY_RETRY_MS,
  );
}

function lostBootPhysicalWorkerError(message) {
  return Object.assign(
    new Error(message),
    {
      code: CREATE_ADMISSION_ERROR_CODE.DEFERRED,
      errorCode: CREATE_ADMISSION_ERROR_CODE.DEFERRED,
      deferRetry: true,
      bootAuthorityUnavailable: true,
      bootIncarnationSuperseded: true,
    },
  );
}

async function settleCreateAdmissionProgress(
  handler,
  evidence,
  nextState,
  {replicaId = null, partitionId = null, partitionService = null} = {},
) {
  if (!evidence) return true;
  try {
    const progressed = await handler.getReplicaCreateAdmissionOwner()
      .markProgress(evidence, nextState);
    if (!progressed) armCreateAdmissionRecoveryRearm(handler);
    return true;
  } catch (error) {
    return settleCreateAdmissionProgressFailure(handler, evidence, error,
      {replicaId, partitionId, partitionService});
  }
}

// A progress mark that threw: a superseded admission retires its runtime
// (the create does not proceed); any other failure re-arms recovery.
async function settleCreateAdmissionProgressFailure(
  handler,
  evidence,
  error,
  {replicaId, partitionId, partitionService},
) {
  if (isSupersededAdmissionError(error)) {
    await retireSupersededCreateAdmissionRuntime(handler, {
      replicaId,
      partitionId,
      operationId: evidence.operationId,
      admissionToken: evidence.admissionToken,
      attemptToken: evidence.attemptToken,
      partitionService,
      error,
    });
    return false;
  }
  armCreateAdmissionRecoveryRearm(handler);
  return true;
}

function assignReplicaHandlerCreateMethods(ReplicaHandler) {
  assignReplicaHandlerCreateAdmissionMethods(ReplicaHandler);
  class ReplicaHandlerCreateMethods {
    /**
     * @param {Object|null} existingReplica
     * @param {string} replicaId
     * @return {string}
     * @private
     */
    resolvePendingReplicaCreateDecision(
      existingReplica,
      replicaId,
      createAdmissionEvidence = null,
    ) {
      const snapshot = {
        hasPendingStatus:
          RESTARTABLE_CREATE_STATUSES.has(existingReplica?.status) ||
          existingReplica?.status === ReplicaStatus.CREATING &&
            Boolean(createAdmissionEvidence),
        hasInProgressCreate: this.hasInProgressReplicaCreation(replicaId),
        hasTrackedService: Boolean(this.getTrackedService(replicaId)),
      };
      if (
        snapshot.hasPendingStatus &&
        !snapshot.hasInProgressCreate &&
        !snapshot.hasTrackedService
      ) {
        return REPLICA_HANDLER_CREATE_DECISION.RESTART_CREATE;
      }
      return REPLICA_HANDLER_CREATE_DECISION.REPORT_IN_PROGRESS;
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
        startedAt: this.timeSource.now(),
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
            let createStarted = false;
            const start = async () => {
              if (this.shuttingDown) {
                this.getReplicaCreateAdmissionOwner()
                  .releasePhysicalWorker(request?.createPhysicalWorkerClaim);
                this.inProgressOperations.delete(operationId);
                this.localServices.delete(replicaId);
                this.localReplicas.delete(replicaId);
                return;
              }
              const evidence = request?.createAdmissionEvidence;
              if (evidence && !await this.getReplicaCreateAdmissionOwner()
                .revalidatePhysicalWorker(request.createPhysicalWorkerClaim)) {
                throw lostBootPhysicalWorkerError(
                  `Current boot lost before queued CREATE ${operationId}`,
                );
              }
              createStarted = true;
              await this.createReplicaAsync(request);
            };
            resolve(start().catch((error) => {
              if (!createStarted) {
                this.getReplicaCreateAdmissionOwner()
                  .releasePhysicalWorker(request?.createPhysicalWorkerClaim);
                this.inProgressOperations.delete(operationId);
                this.localServices.delete(replicaId);
                this.localReplicas.delete(replicaId);
                if (error?.bootAuthorityUnavailable === true &&
                    error?.bootIncarnationSuperseded !== true) {
                  armCreateAdmissionRecoveryRearm(this);
                }
              }
              this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED, {
                operationId,
                replicaId,
                error: error.message,
                stack: error.stack,
              });
            }));
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
    async createReplicaAsync(input) {
      const request = Object.freeze({...input});
      const {
        operationId,
        explicitOperationType,
        partitionId,
        replicaId,
        bootstrapReplicaIds,
        bootstrapTableMetadata,
        bootstrapPartitionMetadata,
        bootstrapMembership,
        deferCdcPropagationHandshake = false,
        skipLifecycleStatusPersistence = false,
        pendingStatusPersisted = false,
        createAdmissionEvidence: requestAdmissionEvidence = null,
        createAttemptToken: requestAttemptToken = null,
      } = request;
      const factory = this.partitionServiceFactory;
      const producer = factory.captureProducer(this, replicaId);
      const operationMap = this.inProgressOperations;
      const operationRecord = operationMap.get(operationId);
      const admissionOwner = operationId ? this.getReplicaCreateAdmissionOwner() : null;
      let operationReleased = false;
      const releaseOperation = () => {
        if (!operationId || operationReleased) return;
        operationReleased = true;
        if (operationMap.get(operationId) === operationRecord) operationMap.delete(operationId);
        admissionOwner.releasePhysicalWorker(request.createPhysicalWorkerClaim);
      };
      let createAdmissionEvidence = requestAdmissionEvidence;
      let createAttemptToken = requestAttemptToken;
      const progress = this.startReplicaCreationProgress({
        partitionId,
        replicaId,
        peerTotal: 0,
      });
      let partitionService = null;
      const lifecycleOwner = producer.owner;
      // A restart of this identity's own admissible durable row (B1) already
      // carries published admission input before any step of this attempt.
      let createPhase = replicaCreatePhaseAfterResume(
        REPLICA_CREATE_PHASE.BEFORE_RUNTIME, request.resumedLifecycleStatus);
      try {
        producer.assertCurrent();
        this.throwIfShuttingDown();
        await this.settlePendingReplicaRuntimeCleanup(replicaId, partitionId);
        producer.assertCurrent();
        this.throwIfShuttingDown();
        const {existed, record: identityRecord} = await priorExistence
          .observeReplicaIdentity(this, replicaId, skipLifecycleStatusPersistence);
        producer.assertCurrent();
        // A refused or unreadable identity observation must not consume the
        // prior incarnation's retirement proof. Drop it only once this birth
        // has passed the authoritative observation.
        this.dropGroupRetiredTombstoneBeforeBirth(partitionId, replicaId);
        if (!skipLifecycleStatusPersistence) {
          const initialStatusOptions = {
            operationId,
            partitionId,
            replicaId,
            pendingStatusPersisted,
            createAdmissionEvidence,
            createAttemptToken,
            createPhysicalWorkerClaim: request.createPhysicalWorkerClaim,
          };
          const initialStatusPersisted =
            await this.persistReplicaCreateInitialStatus(initialStatusOptions);
          producer.assertCurrent();
          if (initialStatusPersisted !== true) {
            this.clearReplicaCreationProgress(progress);
            return;
          }
          createAdmissionEvidence =
            initialStatusOptions.createAdmissionEvidence;
          createAttemptToken = initialStatusOptions.createAttemptToken;
          createPhase = replicaCreatePhaseAfterResume(
            createPhase, initialStatusOptions.resumedLifecycleStatus);
        } else {
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.CREATING,
          });
        }
        if (this.replicaStateMachine !== lifecycleOwner) throw runtimePublicationRefused(replicaId);
        const trackedSource = lifecycleOwner.getState(replicaId);
        const runtimeSource = skipLifecycleStatusPersistence ? request.runtimeStorageAdmission?.row :
          {...buildReplicaLifecycleMutationPredicateFromState(trackedSource),
            address: trackedSource?.serviceAddress};
        if (!skipLifecycleStatusPersistence &&
            (!isReplicaCreateAdmissionEvidence(createAdmissionEvidence) ||
              runtimeSource.created_at !== createAdmissionEvidence.replicaCreatedAt ||
              runtimeSource.create_attempt_token !== createAdmissionEvidence.attemptToken) ||
            skipLifecycleStatusPersistence && request.runtimeStorageAdmission?.owner !== lifecycleOwner) {
          throw runtimePublicationRefused(replicaId);
        }
        const runtimeAdmission = skipLifecycleStatusPersistence ? request.runtimeStorageAdmission.admission :
          captureReplicaAdmission(lifecycleOwner, replicaId);
        const runtimePublication = createReplicaRuntimePublication(
          producer, runtimeSource, runtimeAdmission,
        );
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
            bootstrapTableMetadata,
            bootstrapPartitionMetadata,
            bootstrapMembership,
            explicitOperationType,
          },
        );
        producer.assertCurrent();
        this.throwIfShuttingDown();
        const {
          tableName,
          tableId,
          schema,
          keyRange,
          replicaIds,
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
        if (createAdmissionEvidence &&
            !await this.getReplicaCreateAdmissionOwner()
              .revalidatePhysicalWorker(request.createPhysicalWorkerClaim)) {
          throw lostBootPhysicalWorkerError(
            `Current boot lost before physical CREATE ${operationId}`,
          );
        }
        producer.assertCurrent();
        partitionService = await factory.create({
          partitionId, tableId, tableName, schema, keyRange,
          replicaId,
          replicaIds,
          runtimePublication,
          runtimeProducer: producer,
          publishRuntime: (service, hostServices) => publishReplicaRuntime(this, {
            replicaId, tableName, service, hostServices,
            sourceEvidence: runtimeSource, lifecycleOwner,
            createAdmissionOperationId: createAdmissionEvidence?.operationId || operationId,
            createAdmissionToken: createAdmissionEvidence?.admissionToken,
          }),
          onRuntimeCreated: (service) => {
            partitionService = service;
            service.createAdmissionOperationId = createAdmissionEvidence?.operationId || operationId;
            service.createAdmissionToken = createAdmissionEvidence?.admissionToken;
            service.createAttemptToken = runtimeSource.create_attempt_token;
          },
          nodeId: this.nodeId,
          dbPath,
          isJoiningExistingGroup,
          bootstrapMembership: context.bootstrapMembership,
          identityExisted: existed,
          identityRecorded: identityRecord?.recorded,
          deferCdcPropagationHandshake,
          // Start as learner if joining existing group
          suppressLifecycleLogs: true,
          onInitializationStage: (stageEvent) =>
            this.updateReplicaCreationProgress(progress, stageEvent),
          resolveHandlerRetirementLane: () => lifecycleOwner,
        });
        producer.assertCurrent();
        createPhase = REPLICA_CREATE_PHASE.RUNTIME_OPENED;
        if (
          this.shuttingDown &&
          typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          await partitionService.shutdown();
        }
        this.throwIfShuttingDown();
        if (!isReplicaAdmissionCurrent(lifecycleOwner, replicaId, runtimeAdmission)) {
          throw runtimePublicationRefused(replicaId);
        }
        publishReplicaRuntime(this, {
          replicaId, tableName, service: partitionService,
          sourceEvidence: runtimeSource, lifecycleOwner,
          createAdmissionOperationId: createAdmissionEvidence?.operationId || operationId,
          createAdmissionToken: createAdmissionEvidence?.admissionToken,
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
          producer.assertCurrent();
        } else {
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            tableName,
            status: ReplicaStatus.SYNCING,
            service: partitionService,
          });
        }
        // The SYNCING fact is committed: ask the partition leader to admit
        // this replica from its committed operation (quest
        // replica-admission-from-committed-operation). A pending answer is
        // re-sent on the learner-promotion cadence; it never fails the
        // create.
        if (isJoiningExistingGroup && !skipLifecycleStatusPersistence &&
            typeof operationId === 'string' && operationId.length > 0) {
          await partitionService.requestReplicaAdmission(operationId);
          producer.assertCurrent();
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
          producer.assertCurrent();
        }
        // CREATE cannot publish an ACTIVE service whose participant runtime
        // is still default closed. The lifecycle owner performs the same
        // cohort proof used at startup, including control group first,
        // before the operation exposes the replica as active.
        if (
          canReleaseFreshCreateOnActivation(this, partitionService, {
            skipLifecycleStatusPersistence,
            existed,
            createAdmissionEvidence,
          })
        ) {
          const createStartedAt =
            this.inProgressOperations.get(operationId)?.startedAt;
          await this.participantReleaseRecovery.releaseFreshCreate(partitionId, {
            createAdmissionEvidence,
            identityExisted: existed,
            deadlineAtMs: Number.isSafeInteger(createStartedAt) ?
              createStartedAt + this.syncTimeoutMs : null,
          });
          producer.assertCurrent();
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
            {
              partitionId,
              activationService: partitionService,
              createAdmissionEvidence,
              createAttemptToken,
            },
          );
          producer.assertCurrent();
          const settled = await settleCreateAdmissionProgress(
            this,
            createAdmissionEvidence,
            CREATE_ADMISSION_STATE.ACTIVE,
            {replicaId, partitionId, partitionService},
          );
          producer.assertCurrent();
          if (settled === false) {
            this.failReplicaCreationProgress(progress, null);
            releaseOperation();
            return;
          }
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
        releaseOperation();
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
        if (!isReplicaRuntimeProducerCurrent(producer)) {
          await this.fenceFailedReplicaCreateRuntime(
            replicaId, partitionId, partitionService, error);
          this.clearReplicaCreationProgress(progress);
          throw error;
        }
        if (error?.code ===
            REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS) {
          this.clearReplicaCreationProgress(progress);
          releaseOperation();
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
        if (error?.bootAuthorityUnavailable === true) {
          await this.fenceFailedReplicaCreateRuntime(
            replicaId,
            partitionId,
            partitionService,
            error,
          );
          this.clearReplicaCreationProgress(progress);
          releaseOperation();
          this.localServices.delete(replicaId);
          this.localReplicas.delete(replicaId);
          if (error?.bootIncarnationSuperseded !== true) {
            armCreateAdmissionRecoveryRearm(this);
          }
          throw error;
        }
        await this.fenceFailedReplicaCreateRuntime(
          replicaId,
          partitionId,
          partitionService,
          error,
        );
        if (!isReplicaRuntimeProducerCurrent(producer)) {
          this.clearReplicaCreationProgress(progress);
          throw error;
        }
        this.failReplicaCreationProgress(progress, error);
        this.logger.error(REPLICA_HANDLER_LOG_MSG.CREATE_FAILED, {
          operationId,
          replicaId,
          partitionId,
          error: error.message,
          stack: error.stack,
        });
        const claimCleanup = failedReplicaCreateClaimsCleanup(createPhase, error);
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
        // A claimed failure is terminal for its identity: the failed-create
        // cleanup owner removes it, so the coordinator must not re-dispatch it.
        if (error?.deferRetry === true && !claimCleanup) {
          failedOutcomeOptions.deferRetry = true;
        }
        try {
          // Confirm exact FAILED authority before publishing terminal outcome.
          const failedLifecyclePublished =
            await this.persistOrConfirmReplicaCreateFailed({
              operationId,
              replicaId,
              partitionId,
              errorMessage: error.message,
              claimCleanup,
              createAdmissionEvidence,
              createAttemptToken,
            });
          if (!isReplicaRuntimeProducerCurrent(producer)) throw error;
          if (failedLifecyclePublished) {
            await settleCreateAdmissionProgress(
              this,
              createAdmissionEvidence,
              CREATE_ADMISSION_STATE.FAILED,
            );
            if (!isReplicaRuntimeProducerCurrent(producer)) throw error;
          }
          if (failedLifecyclePublished) {
            this.setLocalReplica(replicaId, {
              replicaId,
              partitionId,
              status: ReplicaStatus.FAILED,
            });
          }
          // CL-016 failure-path symmetry: a locally-seeded SERVICES row must
          // never linger as a 'creating' ghost after terminal failure.
          if (failedLifecyclePublished &&
              this.shouldUsePriorityReplicaCreateStatusFallback(partitionId)) {
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
          releaseOperation();
        }
        this.emit(REPLICA_HANDLER_EVENT.CREATION_FAILED, {
          operationId,
          replicaId,
          partitionId,
          error: error.message,
          nodeId: this.nodeId,
        });
        throw error;
      } finally {
        // The exact runtime remains in pendingRuntimeShutdowns when cleanup
        // fails, but its physical CREATE worker claim must never remain held.
        // Existing success/error paths delete tracking first; this is the
        // fail-safe for a cleanup rejection that exits before those paths.
        releaseOperation();
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
