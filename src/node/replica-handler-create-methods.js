import {createPartitionConstructionHandoff} from
  '../bootstrap/shared/partition-service-construction.js';
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
import {CREATE_ADMISSION_STATE} from './replica-create-admission-state.js';
import {assignReplicaHandlerCreateAdmissionMethods} from
  './replica-handler-create-admission-methods.js';
import {
  isSupersededAdmissionError,
  retireSupersededCreateAdmissionRuntime,
} from './replica-create-admission-retained-recovery.js';
import {readHandlerNowMs} from './replica-handler-voter-readiness-methods.js';
import {REPLICA_CLEANUP_ERROR_CODE} from
  './replica-cleanup-tombstone-owner.js';
import {
  armCreateAdmissionRecoveryRearm,
  canRetainCreateActivation,
  hasDecidedCreateWorkReadiness,
  queuedCreateMayStart,
  lostBootPhysicalWorkerError,
  traceCreateWorker,
  measureCreateStage,
  matchesRetainedCreateActivation,
  observeCreateActivation,
  ownsReplicaCreateWork,
  releaseReplicaCreateWork,
  replicaCreateWork,
  requireVoterReadinessInputs,
  requireFreshCreateReleaseRoute,
  requireReplicaCreateWork,
  retainCreateReadinessWake,
  retireReplicaCreateWork,
  stopCreateReadinessWake,
  waitForMaterializedCreateReadiness,
} from './replica-handler-create-work.js';
import * as priorExistence from './replica-prior-existence.js';
import {
  REPLICA_HANDLER_CREATE_DECISION,
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

async function settleCreateAdmissionProgress(
  handler,
  evidence,
  nextState,
  {replicaId = null, partitionId = null, partitionService = null, isCreateCurrent} = {},
) {
  if (!evidence) return true;
  try {
    const progressed = await handler.getReplicaCreateAdmissionOwner()
      .markProgress(evidence, nextState);
    if (!progressed && isCreateCurrent?.() !== false) {
      armCreateAdmissionRecoveryRearm(handler);
    }
    return true;
  } catch (error) {
    return settleCreateAdmissionProgressFailure(handler, evidence, error,
      {replicaId, partitionId, partitionService, isCreateCurrent});
  }
}

// A progress mark that threw: a superseded admission retires its runtime
// (the create does not proceed); any other failure re-arms recovery.
async function settleCreateAdmissionProgressFailure(
  handler,
  evidence,
  error,
  {replicaId, partitionId, partitionService, isCreateCurrent},
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
  if (isCreateCurrent?.() !== false) armCreateAdmissionRecoveryRearm(handler);
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
      const work = replicaCreateWork(this, request);
      // Start async creation after ACK has returned.
      this.registerOperationTask(
        new Promise((resolve) => {
          setImmediate(() => {
            let createStarted = false;
            const start = async () => {
              if (!queuedCreateMayStart(this, work, request, 'queued_callback')) return;
              requireVoterReadinessInputs(this, request);
              if (request.createAdmissionEvidence) {
                let valid;
                try {
                  valid = await this.getReplicaCreateAdmissionOwner()
                    .revalidatePhysicalWorker(request.createPhysicalWorkerClaim);
                } catch (error) {
                  traceCreateWorker(this, request, 'revalidate', 'error', error);
                  throw error;
                }
                traceCreateWorker(this, request, 'revalidate', valid ? 'current' : 'refused');
                if (!valid) throw lostBootPhysicalWorkerError(
                  `Current boot lost before queued CREATE ${operationId}`,
                );
              } else {
                traceCreateWorker(this, request, 'revalidate', 'not_required');
              }
              if (!queuedCreateMayStart(this, work, request, 'post_revalidation')) return;
              createStarted = true;
              await this.createReplicaAsync(request, work);
            };
            resolve(start().catch((error) => {
              if (!createStarted && ownsReplicaCreateWork(this, work) &&
                  error?.bootAuthorityUnavailable === true &&
                  error?.bootIncarnationSuperseded !== true) {
                const tracked =
                  this.replicaStateMachine?.replicas?.get?.(replicaId);
                if (tracked) tracked.timeoutStartedAt = null;
                armCreateAdmissionRecoveryRearm(this);
              }
              this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED, {
                operationId,
                replicaId,
                error: error.message,
                stack: error.stack,
              });
            }).finally(() => {
              if (!createStarted) releaseReplicaCreateWork(this, work);
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
    async resumeRetainedReplicaCreateActivation(evidence) {
      const retained = this.inProgressOperations.get(evidence.operationId)?.retainedActivation;
      if (!retained) return false;
      const {work, activate, failCreate, release} = retained;
      if (!matchesRetainedCreateActivation(work.createAdmissionEvidence, evidence) ||
          !ownsReplicaCreateWork(this, work) || work.openedService?.isShutdown === true) {
        try {
          await retireReplicaCreateWork(this, work);
        } finally {
          release();
        }
        return true;
      }
      if (work.activationObservation ||
          work.waitingForReadiness && !hasDecidedCreateWorkReadiness(this, work)) return true;
      // The old caller has settled. This existing recovery turn has its own
      // bound and begins with a fresh observation of the same admitted work.
      try {
        const nowMs = readHandlerNowMs(this);
        await activate(retained.deadlineAtMs > nowMs ?
          retained.deadlineAtMs : nowMs + this.syncTimeoutMs);
      } catch (error) {
        await failCreate(error);
      } finally {
        if (!work.retained) release();
      }
      return true;
    }

    /**
     * Async replica creation - reports progress via CDC.
     * @param {Object} request - Creation request.
     * @return {Promise<void>}
     * @private
     */
    async createReplicaAsync(request, work = replicaCreateWork(this, request)) {
      traceCreateWorker(this, request, 'createReplicaAsync', 'entered');
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
      let createAdmissionEvidence = requestAdmissionEvidence;
      let createAttemptToken = requestAttemptToken;
      const createStartedAt = work.tracker?.startedAt;
      const createDeadlineAtMs = Number.isSafeInteger(createStartedAt) ?
        createStartedAt + this.syncTimeoutMs : null;
      const activationDeadlineAtMs = createDeadlineAtMs ??
        readHandlerNowMs(this) + this.syncTimeoutMs;
      const isCreateCurrent = () =>
        ownsReplicaCreateWork(this, work) && !this.shuttingDown;
      // A restart of this identity's own admissible durable row (B1) already
      // carries published admission input before any step of this attempt.
      let createPhase = replicaCreatePhaseAfterResume(
        REPLICA_CREATE_PHASE.BEFORE_RUNTIME, request.resumedLifecycleStatus);
      const failCreate = async (error) => {
        if (!ownsReplicaCreateWork(this, work) ||
            isSupersededAdmissionError(error) && !error?.bootAuthorityUnavailable) {
          return retireReplicaCreateWork(this, work, error);
        }
        if (this.shuttingDown) {
          return retireReplicaCreateWork(this, work, error);
        }
        if (error?.code ===
            REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS) {
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
          await retireReplicaCreateWork(this, work, error);
          if (ownsReplicaCreateWork(this, work) &&
              error?.bootIncarnationSuperseded !== true) {
            armCreateAdmissionRecoveryRearm(this);
          }
          throw error;
        }
        await retireReplicaCreateWork(this, work, error);
        if (!ownsReplicaCreateWork(this, work) || this.shuttingDown) return;
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
        // Confirm exact FAILED authority before publishing terminal outcome.
        const failedLifecyclePublished =
          await this.persistOrConfirmReplicaCreateFailed({
            operationId, replicaId, partitionId, errorMessage: error.message,
            claimCleanup, createAdmissionEvidence, createAttemptToken,
            isCreateCurrent,
          });
        if (!isCreateCurrent()) return;
        if (!failedLifecyclePublished) throw error;
        const settled = await settleCreateAdmissionProgress(
          this, createAdmissionEvidence, CREATE_ADMISSION_STATE.FAILED,
          {isCreateCurrent},
        );
        if (!settled || !isCreateCurrent()) return;
        this.setLocalReplica(replicaId, {
          replicaId, partitionId, status: ReplicaStatus.FAILED,
        });
        this.projectConfirmedCreateFailure(replicaId, partitionId);
        this.failReplicaCreationProgress(work.progress, error);
        releaseReplicaCreateWork(this, work);
        this.emitExecutorOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
          operationId,
          WORKFLOW_STEP.FAILED,
          failedOutcomeOptions,
        );
        this.emit(REPLICA_HANDLER_EVENT.CREATION_FAILED, {
          operationId,
          replicaId,
          partitionId,
          error: error.message,
          nodeId: this.nodeId,
        });
        throw error;
      };
      try {
        requireReplicaCreateWork(this, work);
        const progress = this.startReplicaCreationProgress({
          partitionId,
          replicaId,
          peerTotal: 0,
        });
        work.progress = progress;
        await this.settlePendingReplicaRuntimeCleanup(replicaId, partitionId);
        requireReplicaCreateWork(this, work);
        const {existed, record: identityRecord} = await priorExistence
          .observeReplicaIdentity(this, replicaId, skipLifecycleStatusPersistence);
        requireReplicaCreateWork(this, work);
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
            isCreateCurrent,
            beginRuntimeRetirement: () => {
              work.retiring = true;
            },
          };
          const initialStatusPersisted =
            await this.persistReplicaCreateInitialStatus(initialStatusOptions);
          requireReplicaCreateWork(this, work);
          if (initialStatusPersisted !== true) return;
          work.service = this.getTrackedService(replicaId);
          work.retiring = false;
          createAdmissionEvidence =
            initialStatusOptions.createAdmissionEvidence;
          work.createAdmissionEvidence = createAdmissionEvidence;
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
        requireReplicaCreateWork(this, work);
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
        requireReplicaCreateWork(this, work);
        const construction = createPartitionConstructionHandoff(replicaId,
          () => requireReplicaCreateWork(this, work));
        const capturePartition = (service, publish) => {
          try {
            return construction.retain(service, publish);
          } finally {
            work.openedService = construction.opened;
          }
        };
        const partitionService = await this.createPartitionService({
          partitionId, tableId, tableName, schema, keyRange,
          replicaId,
          replicaIds,
          nodeId: this.nodeId,
          dbPath,
          isJoiningExistingGroup,
          bootstrapMembership: context.bootstrapMembership,
          identityExisted: existed,
          identityRecorded: identityRecord?.recorded,
          deferCdcPropagationHandshake,
          // Start as learner if joining existing group
          suppressLifecycleLogs: true,
          onInitializationStage: (stageEvent) => {
            if (isCreateCurrent()) this.updateReplicaCreationProgress(progress, stageEvent);
          },
          resolveHandlerRetirementLane: () => this.replicaStateMachine,
          onPartitionConstructed: capturePartition,
        });
        createPhase = REPLICA_CREATE_PHASE.RUNTIME_OPENED;
        construction.publish(partitionService);
        // Store service reference in localServices
        const admissionOperationId =
          createAdmissionEvidence?.operationId || operationId || null;
        const admissionToken =
          createAdmissionEvidence?.admissionToken || null;
        const admissionAttemptToken =
          createAdmissionEvidence?.attemptToken ||
          request.createAttemptToken ||
          null;
        if (partitionService && typeof partitionService === REPLICA_HANDLER_TYPEOF.OBJECT) {
          partitionService.createAdmissionOperationId = admissionOperationId;
          partitionService.createAdmissionToken = admissionToken;
          partitionService.createAttemptToken = admissionAttemptToken;
        }
        this.localServices.set(replicaId, partitionService);
        work.service = partitionService;
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          tableName,
          service: partitionService,
          createAdmissionOperationId: admissionOperationId,
          createAdmissionToken: admissionToken,
          createAttemptToken: admissionAttemptToken,
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
          await priorExistence.recordReplicaIdentity(
            this, replicaId, partitionId, identityRecord, isCreateCurrent);
        } else {
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            tableName,
            status: ReplicaStatus.SYNCING,
            service: partitionService,
          });
        }
        // A retained local identity, an ACTIVE-runtime repair, or bootstrap
        // without operation admission already belongs to its own release
        // owner. Fresh materialized CREATE always enters the release protocol.
        const requiresParticipantRelease = !skipLifecycleStatusPersistence &&
          existed === false && Boolean(createAdmissionEvidence);
        let participantReleased = !requiresParticipantRelease;
        const activate = async (deadlineAtMs) => {
          work.retained = false;
          stopCreateReadinessWake(work);
          try {
            requireReplicaCreateWork(this, work);
            // SYNCING owns the attached runtime. The caller's budget bounds
            // observation, while the service owns and drives the same request.
            if (!work.admissionReady) {
              await measureCreateStage(this, work, 'voter_readiness', () =>
                waitForMaterializedCreateReadiness(
                  this, work, request, deadlineAtMs, isJoiningExistingGroup));
            }
            // The named release operation owns a committed origin even when
            // this caller cannot observe its reply. Only a current, timely
            // answer advances the local activation checkpoint.
            if (!participantReleased) {
              requireFreshCreateReleaseRoute(this);
              work.releaseTrace = {hops: {}};
              await measureCreateStage(this, work, 'participant_release', () =>
                observeCreateActivation(this, work, deadlineAtMs, () =>
                  this.participantReleaseRecovery.releaseFreshCreate(partitionId, {
                    createAdmissionEvidence, identityExisted: existed, deadlineAtMs, trace: work.releaseTrace,
                  })));
              requireReplicaCreateWork(this, work);
              participantReleased = true;
            }
            if (work.claim && !await measureCreateStage(this, work, 'activation_worker_revalidation', () =>
              observeCreateActivation(this, work, deadlineAtMs, () =>
                work.owner.revalidatePhysicalWorker(work.claim)))) {
              return retireReplicaCreateWork(this, work);
            }
            requireReplicaCreateWork(this, work);
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
                  isCreateCurrent,
                },
              );
              requireReplicaCreateWork(this, work);
              const settled = await settleCreateAdmissionProgress(
                this,
                createAdmissionEvidence,
                CREATE_ADMISSION_STATE.ACTIVE,
                {replicaId, partitionId, partitionService, isCreateCurrent},
              );
              if (settled === false) return;
              requireReplicaCreateWork(this, work);
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
            releaseReplicaCreateWork(this, work);
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
            if (!canRetainCreateActivation(this, work, error)) throw error;
            work.retained = true;
            work.tracker.retainedActivation = {
              work, activate, failCreate,
              deadlineAtMs: activationDeadlineAtMs,
              release: () => releaseReplicaCreateWork(this, work),
            };
            if (work.waitingForReadiness) retainCreateReadinessWake(this, work);
            else if (work.admissionReady || !work.activationObservation) {
              armCreateAdmissionRecoveryRearm(this);
            }
          }
        };
        await activate(activationDeadlineAtMs);
      } catch (error) {
        return await failCreate(error);
      } finally {
        if (!work.retained) releaseReplicaCreateWork(this, work);
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
