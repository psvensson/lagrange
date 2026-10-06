/**
 * ReplicaHandler lifecycle + message dispatch methods.
 *
 * Owns initialization and the inbound message router entrypoint that fans
 * out to the create / remove / step-down request handlers.
 *
 * Requirements: 10.2, 3.1
 */
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaHandlerLifecycleMethods(ReplicaHandler) {
  class ReplicaHandlerLifecycleMethods {
    /**
     * Initialize the replica handler.
     */
    initialize() {
      if (this.initialized) {
        return;
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.INITIALIZING, {
        nodeId: this.nodeId,
        dataDir: this.dataDir,
      });
      this.initialized = true;
      // Removal-cleanup debt owner (audit finding 12): a failed/stranded
      // replica-removal cleanup must not orphan DB/WAL files indefinitely,
      // so every startup reconciles the partitions directory against
      // authoritative rows via the idempotent reconcile cleanup path.
      this.removedReplicaCleanupAdmissionBarrier =
        this.captureRemovedReplicaCleanupStartupAuthorities();
      this.removedReplicaCleanupDebtSweepTask =
        this.removedReplicaCleanupAdmissionBarrier.then(
          (startupAuthorities) =>
            this.sweepRemovedReplicaCleanupDebt(startupAuthorities),
        ).catch((error) => {
          this.logger.warn(
            REPLICA_HANDLER_LOG_MSG.REMOVED_CLEANUP_SWEEP_FAILED,
            {nodeId: this.nodeId, error: error.message},
          );
        });
      this.startReplicaCreateAdmissionRecovery();
    }

    startReplicaCreateAdmissionRecovery() {
      if (this.shuttingDown) return null;
      if (this.replicaCreateAdmissionRecoveryRetryTimer) {
        clearTimeout(this.replicaCreateAdmissionRecoveryRetryTimer);
        this.replicaCreateAdmissionRecoveryRetryTimer = null;
      }
      const barrier = this.recoverRetainedReplicaCreateAdmissions();
      this.replicaCreateAdmissionRecoveryBarrier = barrier;
      this.replicaCreateAdmissionRecoveryTask = barrier.catch((error) => {
        if (this.shuttingDown) return;
        this.logger.warn(
          REPLICA_HANDLER_LOG_MSG.CREATE_ADMISSION_RECOVERY_FAILED,
          {nodeId: this.nodeId, error: error.message},
        );
        const timer = setTimeout(() => {
          if (this.replicaCreateAdmissionRecoveryRetryTimer === timer) {
            this.replicaCreateAdmissionRecoveryRetryTimer = null;
          }
          this.startReplicaCreateAdmissionRecovery();
        }, REPLICA_HANDLER_DEFAULT.CREATE_ADMISSION_RECOVERY_RETRY_MS);
        timer.unref?.();
        this.replicaCreateAdmissionRecoveryRetryTimer = timer;
      });
      return barrier;
    }

    async awaitReplicaCreateAdmissionRecoveryBarrier() {
      if (this.replicaCreateAdmissionRecoveryBarrier) {
        await this.replicaCreateAdmissionRecoveryBarrier;
      }
    }
    /**
     * Handle incoming message (called by message router).
     * @param {Object} envelope - Message envelope.
     * @return {Promise<Object>} Response.
     */
    async handleMessage(envelope) {
      await this.awaitRemovedReplicaCleanupAdmissionBarrier();
      const {payload, correlationId} = envelope;
      const type = payload?.[ReplicaOperationField.TYPE];
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.MESSAGE_RECEIVED, {
        type,
        correlationId,
        operationId: payload?.operationId,
      });
      let response;
      if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
        const operationType = payload?.[ReplicaOperationField.OPERATION_TYPE];
        if (operationType !== OperationType.ADD &&
            operationType !== OperationType.REPLACE) {
          response = this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.ERROR,
            {
              error: 'CREATE_REPLICA requires ADD or REPLACE operationType',
              errorCode: 'REPLICA_CREATE_ADMISSION_INVALID',
              nodeId: this.nodeId,
            },
          );
        } else {
          response = await this.handleCreateReplica(payload);
        }
      } else if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        response = await this.handleRemoveReplica(payload);
      } else if (type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
        response = await this.handleStepDownReplica(payload);
      } else if (
        type === ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP
      ) {
        response = await this.handleReadReplicaMembership(payload);
      } else if (type === ReplicaOperationMessageType.RETIRE_REPLICA_PEER) {
        response = await this.handleRetireReplicaPeer(payload);
      } else if (
        type === ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP
      ) {
        response = await this.handleReadCommittedMembership(payload);
      } else {
        const unknownMessageType =
          REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
        response = this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {error: unknownMessageType(type)},
        );
      }
      // Include correlationId in response for RPC matching; a request's
      // attempt sequence is echoed so the requester drops a late answer of
      // an earlier attempt.
      const attemptSeq = payload?.[ReplicaOperationField.ATTEMPT_SEQ];
      return {
        ...response,
        ...(attemptSeq === undefined ? {} :
          {[ReplicaOperationField.ATTEMPT_SEQ]: attemptSeq}),
        correlationId,
      };
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerLifecycleMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerLifecycleMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerLifecycleMethods};
