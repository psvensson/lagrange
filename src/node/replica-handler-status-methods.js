/**
 * ReplicaHandler replica-status persistence methods.
 *
 * Owns the retry wrapper around the replica lifecycle state-machine
 * transition, the transition itself, and executor-outcome emission used in
 * place of direct replica_operations writes.
 *
 * Requirements: 10.2, 3.1
 */
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {runRetryableControlPlaneWrite} from '../bootstrap/shared/retryable-control-plane-write.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_SERVICE,
} from './replica-handler-constants.js';
import {settlePartitionServiceActiveAdmission} from
  '../bootstrap/shared/partition-service-activation.js';
import {isReplicaServiceHandlerBound} from
  './replica-transport-handler-identity.js';
import {isReplicaRuntimeObservationCurrent, runtimeObservationChangedError} from
  './replica-runtime-observation.js';
import {isCreateSyncingDeferral} from
  './replica-state-machine-create-syncing-edge.js';
import {
  IDENTITY_WAIT,
  IDENTITY_WAIT_AWAITED,
  reportIdentityWaitSpent,
} from './replica-prior-existence.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_STATUS_WRITE_WAIT = Object.freeze({
  wait: 'REPLICA_HANDLER_DEFAULT.STATUS_WRITE_RETRY_TIMEOUT_MS',
  awaited: 'replica status write accepted by the services-table owner',
});

function assignReplicaHandlerStatusMethods(ReplicaHandler) {
  class ReplicaHandlerStatusMethods {
    /**
     * Update replica status through the replica lifecycle state machine.
     * The state machine owns services-table lifecycle persistence.
     * @param {string} replicaId - Replica ID.
     * @param {string} newStatus - New status.
     * @param {Object} additionalData - Additional data to update.
     * @return {Promise<void>}
     * @private
     */
    async persistReplicaStatusWithRetry(
      replicaId,
      newStatus,
      additionalData = {},
    ) {
      const startedAt = Date.now();
      return runRetryableControlPlaneWrite(
        () => this.updateReplicaStatus(replicaId, newStatus, additionalData),
        {
          timeoutMs: REPLICA_HANDLER_DEFAULT.STATUS_WRITE_RETRY_TIMEOUT_MS,
          onRetry: ({
            attempt,
            delayMs,
            remainingMs,
            retryAfterMs,
            resultOrError,
          }) => {
            this.logger.warn(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS_RETRY, {
              replicaId,
              partitionId:
                additionalData.partitionId !== undefined ?
                  additionalData.partitionId :
                  null,
              newStatus,
              attempt,
              delayMs,
              remainingMs,
              retryAfterMs,
              error: resultOrError?.error || resultOrError?.message || null,
              nodeId: this.nodeId,
            });
          },
          logger: this.logger,
          spentWait: REPLICA_STATUS_WRITE_WAIT,
          scope: {
            nodeId: this.nodeId,
            replicaId,
            partitionId: additionalData.partitionId !== undefined ?
              additionalData.partitionId :
              null,
            newStatus,
          },
        },
      ).catch((error) => {
        if (isCreateSyncingDeferral(error)) {
          reportIdentityWaitSpent(this.logger,
            REPLICA_HANDLER_LOG_MSG.CREATE_SYNCING_DEFERRAL_SPENT, {
              wait: IDENTITY_WAIT.CREATE_SYNCING_DEFERRAL,
              awaited: IDENTITY_WAIT_AWAITED.CREATE_SYNCING_DEFERRAL,
              boundMs: REPLICA_HANDLER_DEFAULT.STATUS_WRITE_RETRY_TIMEOUT_MS,
              elapsedMs: Date.now() - startedAt,
              lastObserved: error.cause?.message ?? error.message,
              scope: {replicaId, partitionId: additionalData.partitionId ??
                null, nodeId: this.nodeId},
            });
        }
        throw error;
      });
    }
    /**
     * Update replica status through the replica lifecycle state machine.
     * The state machine owns services-table lifecycle persistence.
     * @param {string} replicaId - Replica ID.
     * @param {string} newStatus - New status.
     * @param {Object} additionalData - Additional data to update.
     * @return {Promise<void>}
     * @private
     */
    async updateReplicaStatus(replicaId, newStatus, additionalData = {}) {
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS, {
        replicaId,
        newStatus,
        nodeId: this.nodeId,
      });
      const previousLocalReplica = this.localReplicas.get(replicaId) || null;
      const lifecycleOwner = this.replicaStateMachine;
      const runtimeObservation = additionalData.runtimeObservation;
      const localService = this.getTrackedService(replicaId);
      try {
        if (runtimeObservation &&
            !isReplicaRuntimeObservationCurrent(runtimeObservation)) {
          throw runtimeObservationChangedError(replicaId);
        }
        const existing = runtimeObservation ? runtimeObservation.sourceEvidence :
          this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
        const partitionId =
          additionalData.partitionId !== undefined ?
            additionalData.partitionId :
            existing?.partition_id || null;
        const trackedState = lifecycleOwner.getState(replicaId);
        const transitionContext = {
          partitionId,
          nodeId: existing?.node_id || this.nodeId,
          errorMessage: additionalData.errorMessage,
          // What triggered the new status (the row's trigger_reason): a
          // group retired as a unit marks its REMOVING row so.
          reason: additionalData.triggerReason,
          cleanupToken: additionalData.cleanupToken,
          createAttemptToken: additionalData.createAttemptToken,
          createAdmissionEvidence: additionalData.createAdmissionEvidence,
          serviceId: existing?.service_id || replicaId,
          serviceType:
            existing?.service_type || REPLICA_HANDLER_SERVICE.TYPE,
          serviceAddress:
            existing?.address || this.buildTrackedServiceAddress(replicaId),
          // A durable ACTIVE is bound to the exact runtime this activation
          // created (additionalData.activationService): its transport handler
          // stays registered through the activation effect boundary, and the
          // runtime retires it through this lifecycle owner (the create path
          // passes resolveHandlerRetirementLane) (owner decision N2, S-F2).
          ...(runtimeObservation ? {runtimeObservation,
            timestamp: runtimeObservation.timestamp} : {}),
          isEffectHandlerCurrent: () => runtimeObservation ?
            isReplicaRuntimeObservationCurrent(runtimeObservation, false) :
            this.replicaStateMachine === lifecycleOwner &&
              isReplicaServiceHandlerBound(additionalData.activationService, lifecycleOwner),
        };
        const requiresAuthoritativeAdmission = Boolean(runtimeObservation) ||
          !trackedState && newStatus !== ReplicaStatus.PENDING && existing;
        let transitionResult = await Promise.resolve(
          requiresAuthoritativeAdmission ?
            lifecycleOwner.transitionAuthoritativeReplicaGeneration(
              existing,
              newStatus,
              transitionContext,
            ) :
            lifecycleOwner.transition(
              replicaId,
              newStatus,
              transitionContext,
            ),
        );
        // REMOVING is the one convergent cleanup intent. A concurrent
        // failure observation may win between the snapshot above and the
        // transition attempt; FAILED is not deletion authority, so retry the
        // newly-valid FAILED -> REMOVING edge at this same persistence
        // boundary instead of abandoning the durable removal protocol.
        if (transitionResult === false &&
            newStatus === ReplicaStatus.REMOVING) {
          if (this.replicaStateMachine !== lifecycleOwner) return false;
          const latestState = lifecycleOwner.getState(replicaId)?.state;
          if (latestState === ReplicaStatus.REMOVING) {
            transitionResult = true;
          } else if (latestState === ReplicaStatus.FAILED) {
            transitionResult = await Promise.resolve(
              lifecycleOwner.transition(replicaId, newStatus, {
                partitionId,
                nodeId: existing?.node_id || this.nodeId,
                reason: additionalData.triggerReason,
                errorMessage: additionalData.errorMessage,
                cleanupToken: additionalData.cleanupToken,
                createAttemptToken: additionalData.createAttemptToken,
                createAdmissionEvidence:
                  additionalData.createAdmissionEvidence,
                serviceId: existing?.service_id || replicaId,
                serviceType:
                  existing?.service_type || REPLICA_HANDLER_SERVICE.TYPE,
                serviceAddress:
                  existing?.address ||
                  this.buildTrackedServiceAddress(replicaId),
              }),
            );
          }
        }
        if (transitionResult === false) {
          if (runtimeObservation) throw runtimeObservationChangedError(replicaId);
          throw new Error(
            `Replica state transition rejected for ${replicaId}: ${newStatus}`,
          );
        }
        if (this.shuttingDown || this.replicaStateMachine !== lifecycleOwner ||
            (this.localReplicas.get(replicaId) || null) !== previousLocalReplica ||
            this.getTrackedService(replicaId) !== localService ||
            lifecycleOwner.getState(replicaId)?.state !== newStatus ||
            runtimeObservation &&
              !isReplicaRuntimeObservationCurrent(runtimeObservation, false)) return false;
        this.setLocalReplica(replicaId, {
          replicaId, partitionId, status: newStatus, service: localService,
        });
        if (newStatus === ReplicaStatus.ACTIVE) {
          this.seedLocalPriorityServiceRow?.(
            replicaId,
            partitionId,
            ReplicaStatus.ACTIVE,
            {markLocalOnly: false},
          );
          await settlePartitionServiceActiveAdmission({
            partitionId,
            replicaId,
            service: localService,
          });
        }
        return true;
      } catch (error) {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS_FAILED, {
          replicaId,
          newStatus,
          error: error.message,
        });
        throw error;
      }
    }
    /**
     * Emit a typed executor outcome instead of writing to
     * replica_operations directly. The coordinator consumes these
     * outcomes through the owner-key reconcile queue.
     *
     * @param {string} outcomeType - EXECUTOR_OUTCOME_TYPE value.
     * @param {string} operationId - Replica operation ID.
     * @param {string} workflowStep - WORKFLOW_STEP the executor reached.
     * @param {Object} [options] - Optional replicaId, errorMessage.
     */
    emitExecutorOutcome(outcomeType, operationId, workflowStep, options = {}) {
      if (this.executorOutcomeEmitter) {
        this.executorOutcomeEmitter.emitOutcome(
          outcomeType,
          operationId,
          workflowStep,
          options,
        );
      }
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerStatusMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerStatusMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerStatusMethods};
