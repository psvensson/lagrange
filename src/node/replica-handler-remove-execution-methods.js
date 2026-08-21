import {WORKFLOW_STEP} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_REMOVE_EXECUTION_REASON = Object.freeze({
  DURABLE_REMOVE_CLEANUP_COMPLETE: 'durable_remove_cleanup_complete',
});
const FAILED_REMOVAL_TOLERATED_STATUS_WRITES = new Set([
  ReplicaStatus.REMOVING,
  ReplicaStatus.FAILED,
]);

function assignReplicaHandlerRemoveExecutionMethods(ReplicaHandler) {
  class ReplicaHandlerRemoveExecutionMethods {
    /**
     * Raise the partition-owned transaction admission fence synchronously,
     * before REMOVE_REPLICA returns an accepted status. This gives acceptance
     * one meaning: no new transaction can enter the retiring runtime.
     * @param {string} replicaId
     * @param {Object|null} [replica]
     * @return {Object|null}
     * @private
     */
    fenceReplicaServingAdmissionForRemoval(replicaId, replica = null) {
      const service = replica?.service || this.getTrackedService(replicaId);
      service?.fenceServingAdmissionForRemoval?.();
      return service || null;
    }

    /**
     * Let transactions admitted before the removal fence finish under their
     * existing owner before deleting the routable service row or runtime.
     * @param {Object|null} service
     * @return {Promise<void>}
     * @private
     */
    async waitForReplicaServingDrain(service) {
      await service?.waitForRemovalServingDrain?.();
    }

    /**
     * Build one canonical snapshot for REMOVE execution.
     * Failed replicas skip the transitional REMOVING write because the state
     * machine only permits failed -> removed durable cleanup.
     * @param {string} replicaId
     * @return {Object}
     * @private
     */
    buildReplicaRemovalLifecycleSnapshot(replicaId) {
      const trackedState =
        typeof this.replicaStateMachine?.getState ===
          REPLICA_HANDLER_TYPEOF.FUNCTION ?
          this.replicaStateMachine.getState(replicaId) :
          null;
      const trackedStatus =
        typeof trackedState === REPLICA_HANDLER_TYPEOF.STRING ?
          trackedState :
          typeof trackedState?.state === REPLICA_HANDLER_TYPEOF.STRING ?
            trackedState.state :
            null;
      const localReplica = this.getLocalReplica(replicaId);
      const cachedServiceRow =
        this.systemTableCache?.get?.(SYSTEM_TABLE_NAME.SERVICES, replicaId) ||
        null;
      const cachedStatus =
        typeof cachedServiceRow?.status === REPLICA_HANDLER_TYPEOF.STRING ?
          cachedServiceRow.status :
          null;
      const localStatus =
        typeof localReplica?.status === REPLICA_HANDLER_TYPEOF.STRING ?
          localReplica.status :
          null;
      const currentStatus =
        trackedStatus ||
        localStatus ||
        cachedStatus ||
        null;
      const durableStatus = trackedStatus || cachedStatus;
      return Object.freeze({
        trackedState,
        trackedStatus,
        localStatus,
        cachedStatus,
        currentStatus,
        skipRemovingStatusWrite:
          durableStatus === ReplicaStatus.FAILED ||
          durableStatus === ReplicaStatus.REMOVING,
      });
    }
    /**
     * Read one tracked replica lifecycle state from the shared state machine.
     * @param {string} replicaId
     * @return {string|null}
     * @private
     */
    getTrackedReplicaLifecycleState(replicaId) {
      const trackedState =
        typeof this.replicaStateMachine?.getState ===
          REPLICA_HANDLER_TYPEOF.FUNCTION ?
          this.replicaStateMachine.getState(replicaId) :
          null;
      if (typeof trackedState === REPLICA_HANDLER_TYPEOF.STRING) {
        return trackedState;
      }
      return typeof trackedState?.state === REPLICA_HANDLER_TYPEOF.STRING ?
        trackedState.state :
        null;
    }
    /**
     * Failed replicas can proceed directly to durable REMOVE cleanup.
     * This tolerates the race where REMOVE planning snapshots ACTIVE but the
     * shared state machine flips to FAILED before the REMOVING write lands.
     * @param {string} replicaId
     * @param {string} requestedStatus
     * @return {boolean}
     * @private
     */
    shouldSkipReplicaRemovalLifecycleWrite(replicaId, requestedStatus) {
      return this.getTrackedReplicaLifecycleState(replicaId) ===
        ReplicaStatus.FAILED &&
        FAILED_REMOVAL_TOLERATED_STATUS_WRITES.has(requestedStatus);
    }
    /**
     * Reconcile durable cleanup for replicas already marked REMOVED locally.
     * This keeps idempotent REMOVE retries from leaving stale service rows
     * routable after the local replica is already gone — and it is the
     * canonical retry the startup cleanup-debt sweep drives against
     * orphaned files (audit finding 12), so it must delete the replica's
     * DB/WAL/SHM files even when no live service is tracked: a removal
     * that crashed between the services-row DELETE and the file unlink
     * leaves exactly that shape (no row, no tracked service, files on
     * disk), and skipping file deletion here is what stranded the orphan.
     * @param {string} replicaId
     * @param {string} partitionId
     * @return {Promise<boolean>} True when stale cleanup work ran.
     * @private
     */
    async reconcileRemovedReplicaCleanup(replicaId, partitionId) {
      const trackedService = this.getTrackedService(replicaId);
      await this.getPartitionServiceRowOwner().removeReplica({
        partitionId,
        replicaId,
        nodeId: this.nodeId,
      });
      await this.cleanupRemovedReplicaLocalRuntime(
        replicaId,
        partitionId,
        trackedService,
      );
      this.localServices.delete(replicaId);
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVED,
        service: null,
      });
      if (
        typeof this.replicaStateMachine?.completeDurableRemoval ===
        REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        this.replicaStateMachine.completeDurableRemoval(replicaId, {
          partitionId,
          nodeId: this.nodeId,
          reason:
            REPLICA_REMOVE_EXECUTION_REASON.DURABLE_REMOVE_CLEANUP_COMPLETE,
          serviceId: replicaId,
        });
      }
      return true;
    }
    /**
     * Async replica removal - reports progress via CDC.
     * @param {Object} request - Removal request.
     * @return {Promise<void>}
     * @private
     */
    async removeReplicaAsync(request) {
      const {operationId, partitionId, replicaId, reason} = request;
      let serviceRowRemoved = false;
      let cleanupError = null;
      const service = this.getTrackedService(replicaId);
      const removalLifecycleSnapshot =
        this.buildReplicaRemovalLifecycleSnapshot(replicaId);
      let skipRemovingStatusWrite =
        removalLifecycleSnapshot.skipRemovingStatusWrite === true;
      try {
        this.throwIfShuttingDown();
        await this.waitForReplicaServingDrain(service);
        if (!skipRemovingStatusWrite) {
          try {
            await this.persistReplicaStatusWithRetry(
              replicaId,
              ReplicaStatus.REMOVING,
              {partitionId},
            );
          } catch (error) {
            if (!this.shouldSkipReplicaRemovalLifecycleWrite(
              replicaId,
              ReplicaStatus.REMOVING,
            )) {
              if (!isRetryableControlPlaneError(error)) {
                throw error;
              }
              this.logger.warn(
                REPLICA_HANDLER_LOG_MSG.REMOVE_STATUS_WRITE_DEFERRED,
                {
                  operationId,
                  replicaId,
                  partitionId,
                  nodeId: this.nodeId,
                  error: error.message,
                },
              );
            } else {
              skipRemovingStatusWrite = true;
              this.setLocalReplica(replicaId, {
                replicaId,
                partitionId,
                status: ReplicaStatus.FAILED,
                service,
              });
            }
          }
        }
        // Delete the authoritative row before local shutdown so routing never points at a dead handler.
        try {
          await this.getPartitionServiceRowOwner().removeReplica({
            partitionId,
            replicaId,
            nodeId: this.nodeId,
          });
          serviceRowRemoved = true;
        } catch (deleteError) {
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.DELETE_SERVICE_ROW_FAILED, {
            replicaId,
            error: deleteError.message,
          });
          throw deleteError;
        }
        try {
          await this.cleanupRemovedReplicaLocalRuntime(
            replicaId,
            partitionId,
            service,
          );
        } catch (error) {
          cleanupError = error;
          this.logger.warn(
            REPLICA_HANDLER_LOG_MSG.LOCAL_CLEANUP_RETRY_REQUIRED,
            {
              replicaId,
              partitionId,
              nodeId: this.nodeId,
              error: error.message,
            },
          );
        }
        if (
          typeof this.replicaStateMachine?.completeDurableRemoval ===
          REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          this.replicaStateMachine.completeDurableRemoval(replicaId, {
            partitionId,
            nodeId: this.nodeId,
            reason:
              REPLICA_REMOVE_EXECUTION_REASON.DURABLE_REMOVE_CLEANUP_COMPLETE,
            serviceId: replicaId,
          });
        }
        // Remove from local service tracking
        if (!cleanupError) {
          this.localServices.delete(replicaId);
        }
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          status: ReplicaStatus.REMOVED,
          service: cleanupError ? service : null,
        });
        // Clean up in-progress tracking
        if (operationId) {
          this.inProgressOperations.delete(operationId);
        }
        // Emit removed outcome only after source-row cleanup is durable.
        this.emitExecutorOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
          operationId,
          WORKFLOW_STEP.REMOVED,
          {replicaId},
        );
        this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_COMPLETED, {
          operationId,
          replicaId,
          partitionId,
          reason,
          nodeId: this.nodeId,
          cleanupDeferred: cleanupError !== null,
        });
        this.emit(REPLICA_HANDLER_EVENT.REMOVED, {
          operationId,
          replicaId,
          partitionId,
          reason,
          nodeId: this.nodeId,
        });
      } catch (error) {
        if (this.shuttingDown) {
          if (operationId) {
            this.inProgressOperations.delete(operationId);
          }
          return;
        }
        this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
          operationId,
          replicaId,
          partitionId,
          error: error.message,
          stack: error.stack,
        });
        // Emit failed outcome — coordinator will transition workflow.
        this.emitExecutorOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
          operationId,
          WORKFLOW_STEP.FAILED,
          {
            replicaId,
            errorMessage: error.message,
          },
        );
        if (!serviceRowRemoved) {
          if (
            !skipRemovingStatusWrite &&
            !this.shouldSkipReplicaRemovalLifecycleWrite(
              replicaId,
              ReplicaStatus.FAILED,
            )
          ) {
            try {
              await this.persistReplicaStatusWithRetry(
                replicaId,
                ReplicaStatus.FAILED,
                {
                  partitionId,
                  errorMessage: error.message,
                },
              );
            } catch (statusError) {
              if (!isRetryableControlPlaneError(statusError)) {
                throw statusError;
              }
              this.logger.warn(
                REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED_STATUS_WRITE_DEFERRED,
                {
                  operationId,
                  replicaId,
                  partitionId,
                  nodeId: this.nodeId,
                  error: statusError.message,
                },
              );
            }
          }
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.FAILED,
            service,
          });
        }
        // Clean up in-progress tracking
        if (operationId) {
          this.inProgressOperations.delete(operationId);
        }
        this.emit(REPLICA_HANDLER_EVENT.REMOVAL_FAILED, {
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
    ReplicaHandlerRemoveExecutionMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRemoveExecutionMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerRemoveExecutionMethods};
