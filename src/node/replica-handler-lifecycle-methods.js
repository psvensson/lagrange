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
import {
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
    }
    /**
     * Handle incoming message (called by message router).
     * @param {Object} envelope - Message envelope.
     * @return {Promise<Object>} Response.
     */
    async handleMessage(envelope) {
      const {payload, correlationId} = envelope;
      const type = payload?.[ReplicaOperationField.TYPE];
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.MESSAGE_RECEIVED, {
        type,
        correlationId,
        operationId: payload?.operationId,
      });
      let response;
      if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
        response = await this.handleCreateReplica(payload);
      } else if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        response = await this.handleRemoveReplica(payload);
      } else if (type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
        response = await this.handleStepDownReplica(payload);
      } else {
        const unknownMessageType =
          REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
        response = this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {error: unknownMessageType(type)},
        );
      }
      // Include correlationId in response for RPC matching
      return {
        ...response,
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
