import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
} from './replica-handler-constants.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_STATE,
} from './replica-handler-leader-handoff-methods.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaHandlerRemoveRequestMethods(ReplicaHandler) {
  class ReplicaHandlerRemoveRequestMethods {
    /**
     * @param {string} replicaId
     * @return {boolean}
     * @private
     */
    hasInProgressReplicaRemoval(replicaId) {
      for (const operation of this.inProgressOperations.values()) {
        if (
          operation?.type === ReplicaOperationMessageType.REMOVE_REPLICA &&
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
     * @return {void}
     * @private
     */
    trackReplicaRemovalOperation(operationId, partitionId, replicaId) {
      this.inProgressOperations.set(operationId, {
        type: ReplicaOperationMessageType.REMOVE_REPLICA,
        replicaId,
        partitionId,
        startedAt: Date.now(),
      });
    }
    /**
     * @param {Object} request
     * @return {void}
     * @private
     */
    startRemoveReplicaAsync(request) {
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      const reason = request?.[ReplicaOperationField.REASON];
      this.registerOperationTask(
        new Promise((resolve) => {
          setImmediate(() => {
            if (this.shuttingDown) {
              this.inProgressOperations.delete(operationId);
              resolve();
              return;
            }
            resolve(
              this.removeReplicaAsync({
                operationId,
                partitionId,
                replicaId,
                reason,
              }).catch((error) => {
                this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED, {
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
    /**
     * Handle REMOVE_REPLICA request.
     * Returns immediately with 'initiated', then does async work.
     * Implements idempotency per Requirements 10.2.
     * @param {Object} request - REMOVE_REPLICA request.
     * @return {Promise<Object>} Response.
     */
    async handleRemoveReplica(request) {
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      const reason = request?.[ReplicaOperationField.REASON];
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_REQUEST, {
        operationId,
        partitionId,
        replicaId,
        reason,
        nodeId: this.nodeId,
      });
      if (!operationId || !partitionId || !replicaId) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_MISSING_FIELDS, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: REPLICA_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
            nodeId: this.nodeId,
          },
        );
      }
      // Check if replica exists
      const replica = this.getLocalReplica(replicaId);
      if (!replica) {
        try {
          await this.reconcileRemovedReplicaCleanup(replicaId, partitionId);
        } catch (error) {
          this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
            operationId,
            replicaId,
            partitionId,
            error: error.message,
            stack: error.stack,
          });
          return this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.ERROR,
            {
              error: error.message,
              replicaId,
              nodeId: this.nodeId,
            },
          );
        }
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, {
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.NOT_FOUND,
          {
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      // Cross-check partition identity before any status write or shutdown:
      // a mismatched request must never shut down the wrong replica, corrupt
      // local metadata, or silently no-op the partition-scoped row delete.
      if (
        typeof replica.partitionId === 'string' &&
        replica.partitionId !== partitionId
      ) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_PARTITION_MISMATCH, {
          operationId,
          replicaId,
          localPartitionId: replica.partitionId,
          requestPartitionId: partitionId,
          nodeId: this.nodeId,
        });
        const partitionMismatch = REPLICA_HANDLER_ERROR_MSG
          .REMOVE_PARTITION_MISMATCH;
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: partitionMismatch(
              replicaId,
              replica.partitionId,
              partitionId,
            ),
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      // Check idempotency - already removing
      if (replica.status === ReplicaStatus.REMOVING) {
        if (!this.hasInProgressReplicaRemoval(replicaId)) {
          this.trackReplicaRemovalOperation(operationId, partitionId, replicaId);
          this.startRemoveReplicaAsync(request);
        }
        this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS, {
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.IN_PROGRESS,
          {
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      // Check idempotency - already removed. Cleanup reconcile is only safe
      // when the request targets the replica's recorded partition; a
      // mismatched partitionId would no-op the partition-scoped row delete
      // and could drive filesystem cleanup against the wrong identity.
      if (
        replica.status === ReplicaStatus.REMOVED &&
        (typeof replica.partitionId !== 'string' ||
          replica.partitionId === partitionId)
      ) {
        try {
          await this.reconcileRemovedReplicaCleanup(replicaId, partitionId);
        } catch (error) {
          this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
            operationId,
            replicaId,
            partitionId,
            error: error.message,
            stack: error.stack,
          });
          return this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.ERROR,
            {
              error: error.message,
              replicaId,
              nodeId: this.nodeId,
            },
          );
        }
        this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED, {
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.COMPLETED,
          {
            replicaId,
            nodeId: this.nodeId,
          },
        );
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
      this.trackReplicaRemovalOperation(operationId, partitionId, replicaId);
      const removalIngressStatus =
        replica.status === ReplicaStatus.FAILED ?
          ReplicaStatus.FAILED :
          ReplicaStatus.REMOVING;
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: removalIngressStatus,
        service: replica.service || this.getTrackedService(replicaId),
      });
      // Start async removal after ACK has returned.
      this.startRemoveReplicaAsync(request);
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
     * Handle STEP_DOWN_REPLICA request.
     * Returns immediately with a synchronous leader-handoff result.
     * @param {Object} request - STEP_DOWN_REPLICA request.
     * @return {Promise<Object>} Response.
     */
    async handleStepDownReplica(request) {
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      const reason = request?.[ReplicaOperationField.REASON];
      this.logger.info(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_REQUEST, {
        operationId,
        partitionId,
        replicaId,
        reason,
        nodeId: this.nodeId,
      });
      if (!operationId || !partitionId || !replicaId) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_MISSING_FIELDS, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_REQUIRED_FIELDS,
            nodeId: this.nodeId,
          },
        );
      }
      try {
        const handoffResult = this.requestTrackedPartitionLeaderHandoff(
          replicaId,
          reason,
        );
        if (
          handoffResult.state ===
            REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_APPLICABLE
        ) {
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_NOT_FOUND, {
            operationId,
            partitionId,
            replicaId,
            nodeId: this.nodeId,
          });
          return this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.NOT_FOUND,
            {
              operationId,
              replicaId,
              nodeId: this.nodeId,
            },
          );
        }
        if (
          handoffResult.state ===
            REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED
        ) {
          this.logger.error(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_FAILED, {
            operationId,
            partitionId,
            replicaId,
            nodeId: this.nodeId,
            error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_NOT_SUPPORTED,
          });
          return this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.ERROR,
            {
              error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_NOT_SUPPORTED,
              operationId,
              replicaId,
              nodeId: this.nodeId,
            },
          );
        }
        this.logger.info(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_COMPLETED, {
          operationId,
          partitionId,
          replicaId,
          handoffBranch: handoffResult.branch,
          handoffTrackedRole: handoffResult.trackedRole,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.COMPLETED,
          {
            operationId,
            replicaId,
            handoffBranch: handoffResult.branch,
            handoffTrackedRole: handoffResult.trackedRole,
            nodeId: this.nodeId,
          },
        );
      } catch (error) {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_FAILED, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
          error: error.message,
          stack: error.stack,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: error.message,
            operationId,
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerRemoveRequestMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRemoveRequestMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerRemoveRequestMethods};
