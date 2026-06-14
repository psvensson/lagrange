import {
  handleLatencyCdcPropagationBatchMessage as runHandleLatencyBatchMessage,
  handleLatencyCdcPropagationMessage as runHandleLatencyMessage,
} from './message-group-service-cdc-propagation-runtime-methods.js';

const LOCAL_STR_WWEY1 = 'Deferred Raft response delivery';
const LOCAL_STR_OMLJF = 'Failed to send Raft response';

const MESSAGE_GROUP_SERVICE_INBOUND_INGRESS_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

function createMessageGroupServiceInboundIngressRuntimeMethods(deps = {}) {
  const {
    CDC_FORWARD_MAX_RELAY_DEPTH,
    HLCTimestamp,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    MESSAGE_GROUP_SERVICE_LITERAL,
    MessageStatus,
    NUM,
    RAFT_PACKET_TYPE,
    TYPEOF,
    buildLatencyCdcPropagationResult,
    isRaftPacket,
    normalizeCauseId,
    resolveRaftTransportDeliveryOptions,
    shouldDeferImmediateDeliveryRetry,
  } = deps;
  const cdcPropagationRuntimeDeps = {
    CDC_FORWARD_MAX_RELAY_DEPTH,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    MESSAGE_GROUP_SERVICE_LITERAL,
    NUM,
    buildLatencyCdcPropagationResult,
    normalizeCauseId,
  };

  class MessageGroupServiceInboundIngressRuntimeMethods {
    /**
     * Receive a message from another service or replica.
     * Detects Raft packets and routes them directly to liferaft.
     * Handles non-Raft messages as application messages.
     * Requirements: 2.2, 2.3, 5.2, 5.3
     * @param {Object} message - Incoming message.
     * @return {Promise<Object>} Processing result.
     */
    async receiveMessage(message) {
      if (!this.initialized) {
        throw new Error(
          MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED,
        );
      }
      // Extract payload - handle both envelope and direct packet formats
      const payload = message.payload || message;
      // Detect and handle Raft packets directly using isRaftPacket()
      // No type conversion needed - packets flow through unchanged
      // Requirements: 2.2, 2.3
      if (isRaftPacket(payload)) {
        if (this.raft) {
          this.logger.trace(
            MESSAGE_GROUP_SERVICE_LITERAL.RECEIVED_RAFT_PACKET,
            {
              type: payload.type,
              term: payload.term,
              address: payload.address,
              replicaId: this.replicaId,
              groupId: this.groupId,
            },
          );
          if (
            this.isJoiningExistingGroup === true &&
            payload.type === RAFT_PACKET_TYPE.VOTE
          ) {
            this.clearJoinExistingGroupTimers();
            const deniedVote = await this.raft.packet(RAFT_PACKET_TYPE.VOTED, {
              granted: false,
            });
            if (deniedVote) {
              const senderAddress = payload.address;
              const deliveryOptions = resolveRaftTransportDeliveryOptions({
                ...deniedVote,
                targetAddress: senderAddress,
              });
              try {
                const result = await this.transport.deliver(
                  senderAddress,
                  deniedVote,
                  deliveryOptions,
                );
                if (
                  !result?.acknowledged &&
                  shouldDeferImmediateDeliveryRetry(result)
                ) {
                  this.logger.debug(LOCAL_STR_WWEY1, {
                    destination: senderAddress,
                    retryAfterMs: result.retryAfterMs,
                    errorCode: result?.errorCode || null,
                  });
                }
              } catch (err) {
                this.logger.error(LOCAL_STR_OMLJF, {
                  error: err.message,
                  destination: senderAddress,
                });
              }
            }
            return {acknowledged: true};
          }
          if (this.raftRuntime) {
            return (
              this.raftRuntime.handleRaftPacket(message) || {
                acknowledged: true,
              }
            );
          }
        }
        return {acknowledged: true};
      }
      // Handle application messages (non-Raft)
      // Requirements: 2.3, 5.3
      return this.handleApplicationMessage(message);
    }
    /**
     * Handle application messages (non-Raft messages).
     * Requirements: 2.3, 5.3
     * @param {Object} message - Application message
     * @return {Promise<Object>} Processing result
     */
    async handleApplicationMessage(message) {
      const {messageId, payload, sourceGroup, sourceReplica} = message;
      this.logger.debug(
        MESSAGE_GROUP_SERVICE_LITERAL.RECEIVED_APPLICATION_MESSAGE,
        {
          messageId,
          sourceGroup,
          sourceReplica,
          groupId: this.groupId,
        },
      );
      // Check for duplicate
      if (this.acknowledgedMessages.has(messageId)) {
        this.logger.debug(
          MESSAGE_GROUP_SERVICE_LITERAL.DUPLICATE_MESSAGE_IGNORED,
          {messageId},
        );
        return {
          messageId,
          status: MESSAGE_GROUP_APPLICATION_STATUS.DUPLICATE,
          acknowledged: true,
        };
      }
      // Update HLC from remote timestamp if present and is a valid HLC string
      // The timestamp must be a string in HLC format (physical-logical-nodeId)
      if (message.timestamp && typeof message.timestamp === TYPEOF.STRING) {
        try {
          const remoteTimestamp = HLCTimestamp.fromString(message.timestamp);
          this.hlcClock.update(remoteTimestamp);
        } catch (err) {
          this.logger.debug(
            MESSAGE_GROUP_SERVICE_LITERAL.INVALID_HLC_TIMESTAMP_IN_MESSAGE_IGNORING,
            {
              timestamp: message.timestamp,
              error: err.message,
            },
          );
          throw err;
        }
      }
      // Process the message
      try {
        if (
          payload &&
          payload.type ===
            MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION
        ) {
          return this.handleLatencyCdcPropagationMessage(messageId, payload);
        }
        if (
          payload &&
          payload.type ===
            MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH
        ) {
          return this.handleLatencyCdcPropagationBatchMessage(
            messageId,
            payload,
          );
        }
        this.emit(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGERECEIVED, {
          messageId,
          payload,
          sourceGroup,
          sourceReplica,
        });
        return {
          messageId,
          status: MESSAGE_GROUP_APPLICATION_STATUS.RECEIVED,
          acknowledged: false,
        };
      } catch (error) {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_LITERAL.ERROR_PROCESSING_RECEIVED_MESSAGE,
          {
            messageId,
            error: error.message,
          },
        );
        throw error;
      }
    }
    /**
     * Handle grouped-latency CDC propagation message.
     * @param {string} messageId - Message ID.
     * @param {Object} payload - Propagation payload.
     * @return {Promise<Object>}
     * @private
     */
    async handleLatencyCdcPropagationMessage(messageId, payload) {
      return runHandleLatencyMessage(
        this,
        cdcPropagationRuntimeDeps,
        messageId,
        payload,
      );
    }
    /**
     * Handle grouped-latency CDC batch propagation message.
     * @param {string} messageId - Message ID.
     * @param {Object} payload - Propagation payload.
     * @return {Promise<Object>}
     * @private
     */
    async handleLatencyCdcPropagationBatchMessage(messageId, payload) {
      return runHandleLatencyBatchMessage(
        this,
        cdcPropagationRuntimeDeps,
        messageId,
        payload,
      );
    }
    /**
     * Acknowledge a message as successfully processed.
     * @param {string} messageId - Message ID to acknowledge.
     * @return {Promise<Object>} Acknowledgment result.
     */
    async acknowledgeMessage(messageId) {
      if (!this.initialized) {
        throw new Error(
          MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED,
        );
      }
      this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.ACKNOWLEDGING_MESSAGE, {
        messageId,
        groupId: this.groupId,
      });
      // Mark as acknowledged
      this.acknowledgedMessages.add(messageId);
      // Remove from pending if present
      const pendingMessage = this.pendingMessages.get(messageId);
      if (pendingMessage) {
        pendingMessage.status = MessageStatus.ACKNOWLEDGED;
        this.pendingMessages.delete(messageId);
      }
      // Persist acknowledgment to Raft log
      const entry = this.operationLedger.appendEntry({
        type: 'ACK',
        messageId,
        timestamp: this.hlcClock.now().toString(),
      });
      // Notify callback if registered
      const callback = this.messageCallbacks.get(messageId);
      if (callback) {
        callback({
          messageId,
          status: MessageStatus.ACKNOWLEDGED,
        });
        this.messageCallbacks.delete(messageId);
      }
      this.emit(MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEACKNOWLEDGED, {
        messageId,
      });
      return {
        messageId,
        status: MessageStatus.ACKNOWLEDGED,
        logIndex: entry.index,
      };
    }
  }

  return MessageGroupServiceInboundIngressRuntimeMethods;
}

function defineMessageGroupServiceInboundIngressRuntimeMethods(
  prototype,
  deps = {},
) {
  const MessageGroupServiceInboundIngressRuntimeMethods =
    createMessageGroupServiceInboundIngressRuntimeMethods(deps);
  const descriptors = Object.getOwnPropertyDescriptors(
    MessageGroupServiceInboundIngressRuntimeMethods.prototype,
  );
  delete descriptors[
    MESSAGE_GROUP_SERVICE_INBOUND_INGRESS_RUNTIME_LITERAL.CONSTRUCTOR
  ];
  Object.defineProperties(prototype, descriptors);
}

export {defineMessageGroupServiceInboundIngressRuntimeMethods};
