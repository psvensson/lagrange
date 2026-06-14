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
import {resolveSnapshotStateForTransition} from './replica-handler-transition-policy.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

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
        },
      );
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
        const localReplica = previousLocalReplica;
        const previousLocalStatus = localReplica?.status || null;
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          status: newStatus,
          service: localService,
        });
        const trackedState =
          this.replicaStateMachine?.getState?.(replicaId) || null;
        if (
          !trackedState &&
          newStatus !== ReplicaStatus.PENDING &&
          typeof this.replicaStateMachine?.registerReplicaSnapshot ===
            REPLICA_HANDLER_TYPEOF.FUNCTION &&
          (existing || localReplica)
        ) {
          this.replicaStateMachine.registerReplicaSnapshot(replicaId, {
            partitionId,
            nodeId: existing?.node_id || this.nodeId,
            state: resolveSnapshotStateForTransition(
              existing?.status,
              previousLocalStatus,
              newStatus,
            ),
            serviceId: existing?.service_id || replicaId,
            serviceType:
              existing?.service_type || REPLICA_HANDLER_SERVICE.TYPE,
            serviceAddress:
              existing?.address || this.buildTrackedServiceAddress(replicaId),
          });
        }
        const transitionResult = await Promise.resolve(
          this.replicaStateMachine.transition(replicaId, newStatus, {
            partitionId,
            nodeId: existing?.node_id || this.nodeId,
            errorMessage: additionalData.errorMessage,
            serviceId: existing?.service_id || replicaId,
            serviceType:
              existing?.service_type || REPLICA_HANDLER_SERVICE.TYPE,
            serviceAddress:
              existing?.address || this.buildTrackedServiceAddress(replicaId),
          }),
        );
        if (transitionResult === false) {
          throw new Error(
            `Replica state transition rejected for ${replicaId}: ${newStatus}`,
          );
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
