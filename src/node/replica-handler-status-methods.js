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
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {settlePartitionServiceActiveAdmission} from
  '../bootstrap/shared/partition-service-activation.js';
import {isReplicaServiceHandlerBound} from
  './replica-transport-handler-identity.js';
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
      const previousLocalReplica = this.localReplicas.has(replicaId) ?
        {...this.localReplicas.get(replicaId)} :
        null;
      try {
        const existing = this.systemTableCache.get(
          SYSTEM_TABLE_NAME.SERVICES,
          replicaId,
        );
        const partitionId =
          additionalData.partitionId !== undefined ?
            additionalData.partitionId :
            existing?.partition_id || null;
        const localService = this.getTrackedService(replicaId);
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          status: newStatus,
          service: localService,
        });
        const trackedState =
          this.replicaStateMachine?.getState?.(replicaId) || null;
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
          isEffectHandlerCurrent: () => isReplicaServiceHandlerBound(
            additionalData.activationService, this.replicaStateMachine),
        };
        const requiresAuthoritativeAdmission = !trackedState &&
          newStatus !== ReplicaStatus.PENDING && existing &&
          typeof this.replicaStateMachine
            ?.transitionAuthoritativeReplicaGeneration ===
              REPLICA_HANDLER_TYPEOF.FUNCTION;
        let transitionResult = await Promise.resolve(
          requiresAuthoritativeAdmission ?
            this.replicaStateMachine.transitionAuthoritativeReplicaGeneration(
              existing,
              newStatus,
              transitionContext,
            ) :
            this.replicaStateMachine.transition(
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
          const latest = this.replicaStateMachine?.getState?.(replicaId);
          const latestState = typeof latest === REPLICA_HANDLER_TYPEOF.STRING ?
            latest : latest?.state;
          if (latestState === ReplicaStatus.REMOVING) {
            transitionResult = true;
          } else if (latestState === ReplicaStatus.FAILED) {
            transitionResult = await Promise.resolve(
              this.replicaStateMachine.transition(replicaId, newStatus, {
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
          throw new Error(
            `Replica state transition rejected for ${replicaId}: ${newStatus}`,
          );
        }
        if (newStatus === ReplicaStatus.ACTIVE) {
          await settlePartitionServiceActiveAdmission({
            partitionId,
            replicaId,
            service: localService,
          });
        }
      } catch (error) {
        if (previousLocalReplica) {
          this.localReplicas.set(replicaId, previousLocalReplica);
        } else {
          this.localReplicas.delete(replicaId);
        }
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
