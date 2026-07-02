const MESSAGE_GROUP_SERVICE_OUTBOUND_DISPATCH_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

function createMessageGroupServiceOutboundDispatchRuntimeMethods(deps = {}) {
  const {
    DIRECT_ONLY_MESSAGE_TYPES,
    MESSAGE_DELIVERY_MODE,
    MESSAGE_GROUP_SERVICE_LITERAL,
    MessageStatus,
    QUERY_MESSAGE_TYPE,
    buildDeferredDeliveryError,
    normalizeMessageDeliveryMode,
    resolveTransportDeliveryOptions,
    shouldDeferImmediateDeliveryRetry,
    uuidv4,
  } = deps;

  class MessageGroupServiceOutboundDispatchRuntimeMethods {
    async sendMessage(targetService, message, options = {}) {
      if (!this.initialized) {
        throw new Error(
          MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED,
        );
      }
      const messageId = uuidv4();
      const timestamp = this.hlcClock.now();
      const messageEnvelope = {
        id: messageId,
        sourceReplica: this.replicaId,
        sourceGroup: this.groupId,
        targetService,
        payload: message,
        timestamp: timestamp.toString(),
        status: MessageStatus.PENDING,
        attempts: 0,
        createdAt: this.now(),
      };
      this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.SENDING_MESSAGE, {
        messageId,
        targetService,
        groupId: this.groupId,
      });
      // Track pending message
      this.pendingMessages.set(messageId, messageEnvelope);
      const deliveryMode = this.resolveMessageDeliveryMode(
        targetService,
        message,
        options,
      );
      const transportDeliveryOptions = resolveTransportDeliveryOptions(
        targetService,
        options?.transportDeliveryOptions || null,
        {
          payload: message,
          sourceGroup: this.groupId,
          sourceReplica: this.replicaId,
        },
      );
      if (deliveryMode === MESSAGE_DELIVERY_MODE.DIRECT_ONLY) {
        return this.deliverDirectOnlyMessage(messageEnvelope, {
          transportDeliveryOptions,
        });
      }
      // Simultaneous delivery and persistence (non-blocking)
      const deliveryPromise = this.attemptDirectDelivery(messageEnvelope, {
        transportDeliveryOptions,
      });
      const persistPromise = this.persistToRaftLog(messageEnvelope);
      try {
        // Wait for delivery to complete - we need the result for ACK extraction
        // Persistence happens in parallel but we prioritize delivery result
        const [deliveryResult, _persistResult] = await Promise.all([
          deliveryPromise,
          persistPromise,
        ]);
        if (deliveryResult.delivered) {
          // Direct delivery succeeded
          messageEnvelope.status = MessageStatus.DELIVERED;
          this.logger.debug(
            MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERED_DIRECTLY,
            {
              messageId,
              targetService,
            },
          );
          // Spread the transport result directly - ACK structure is flat
          const {
            delivered: _d,
            attempt: _a,
            ...transportResult
          } = deliveryResult;
          return {
            messageId,
            status: MessageStatus.DELIVERED,
            deliveryType: MESSAGE_GROUP_SERVICE_LITERAL.DIRECT,
            ...transportResult,
          };
        }
        this.logger.debug(
          MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_PERSISTED_TO_RAFT_LOG_DELIVERY_FAILED,
          {
            messageId,
            targetService,
          },
        );
        return {
          messageId,
          status: MessageStatus.PENDING,
          deliveryType: MESSAGE_GROUP_SERVICE_LITERAL.PERSISTED,
        };
      } catch (error) {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_SEND_MESSAGE,
          {
            messageId,
            targetService,
            error: error.message,
          },
        );
        messageEnvelope.status = MessageStatus.FAILED;
        throw error;
      }
    }
    /**
     * Attempt direct delivery to target service.
     * Throws error if transport is unavailable (defense in depth).
     * @param {Object} messageEnvelope - Message envelope.
     * @param {Object} options
     * @param {number} [options.maxAttempts]
     * @param {boolean} [options.disableRetryDelay]
     * @return {Promise<Object>} Delivery result.
     * @private
     */
    async attemptDirectDelivery(messageEnvelope, options = {}) {
      const {id: messageId, targetService, payload} = messageEnvelope;
      // Transport is guaranteed to exist (validated in constructor)
      // but we still check at runtime for defense in depth
      if (!this.transport) {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_LITERAL.WEBSOCKET_TRANSPORT_NOT_AVAILABLE_FOR_MESSAGE_DELIVERY,
          {
            messageId,
            targetService,
            groupId: this.groupId,
          },
        );
        throw new Error(
          MESSAGE_GROUP_SERVICE_LITERAL.WEBSOCKET_TRANSPORT_REQUIRED_BUT_NOT_AVAILABLE,
        );
      }
      let lastError = null;
      const maxAttempts =
        Number.isInteger(options?.maxAttempts) && options.maxAttempts > 0 ?
          options.maxAttempts :
          this.retryMaxAttempts;
      const disableRetryDelay = options?.disableRetryDelay === true;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        messageEnvelope.attempts++;
        try {
          // Calculate delay with exponential backoff and jitter
          if (!disableRetryDelay && attempt > 0) {
            const baseDelay = Math.min(
              this.retryInitialDelayMs *
                Math.pow(this.retryBackoffMultiplier, attempt - 1),
              this.retryMaxDelayMs,
            );
            const jitter = baseDelay * this.retryJitterFactor * Math.random();
            const delay = baseDelay + jitter;
            await this.sleep(delay);
          }
          // Attempt delivery via transport
          const deliveryOptions = resolveTransportDeliveryOptions(
            targetService,
            options?.transportDeliveryOptions || null,
            {
              payload,
              sourceGroup: this.groupId,
              sourceReplica: this.replicaId,
            },
          );
          const result = await this.transport.deliver(
            targetService,
            {
              messageId,
              payload,
              sourceGroup: this.groupId,
              sourceReplica: this.replicaId,
            },
            deliveryOptions,
          );
          if (result && result.acknowledged) {
            // Spread transport result directly - ACK structure is flat
            return {
              delivered: true,
              attempt: attempt + 1,
              ...result,
            };
          }
          if (shouldDeferImmediateDeliveryRetry(result)) {
            return {
              delivered: false,
              attempt: attempt + 1,
              error:
                result?.error ||
                MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERY_DEFERRED,
              deferRetry: true,
              retryAfterMs: result.retryAfterMs,
              errorCode: result?.errorCode || null,
            };
          }
          lastError = new Error(
            result?.error ||
              MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERY_NOT_ACKNOWLEDGED,
          );
        } catch (error) {
          lastError = error;
          this.logger.debug(
            MESSAGE_GROUP_SERVICE_LITERAL.DELIVERY_ATTEMPT_FAILED,
            {
              messageId,
              targetService,
              attempt: attempt + 1,
              error: error.message,
            },
          );
        }
      }
      if (lastError?.deferRetry === true) {
        return {
          delivered: false,
          error:
            lastError.message ||
            MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_DELIVERY_DEFERRED,
          deferRetry: true,
          retryAfterMs: Number.isFinite(lastError.retryAfterMs) ?
            Math.max(0, Math.floor(lastError.retryAfterMs)) :
            0,
          errorCode:
            typeof lastError.code === 'string' ? lastError.code : null,
        };
      }
      return {
        delivered: false,
        error:
          lastError?.message ||
          MESSAGE_GROUP_SERVICE_LITERAL.MAX_RETRIES_EXCEEDED,
      };
    }
    /**
     * Determine whether payload should use fast non-durable query delivery.
     * @param {Object} payload
     * @return {boolean}
     * @private
     */
    isQueryDeliveryPayload(payload) {
      return Boolean(
        payload &&
        typeof payload === 'object' &&
        payload.type === QUERY_MESSAGE_TYPE.QUERY,
      );
    }
    /**
     * Determine whether payload is an idempotent control-plane message that
     * should use direct delivery without duplicate Raft durability.
     * @param {Object} payload
     * @return {boolean}
     * @private
     */
    isDirectOnlyControlPlanePayload(payload) {
      return Boolean(
        payload &&
        typeof payload === 'object' &&
        DIRECT_ONLY_MESSAGE_TYPES.has(payload.type),
      );
    }
    /**
     * Resolve the canonical delivery mode for one outbound message.
     * @param {string} _targetService
     * @param {Object} payload
     * @param {Object} [options]
     * @return {string}
     * @private
     */
    resolveMessageDeliveryMode(_targetService, payload, options = {}) {
      const explicitMode = normalizeMessageDeliveryMode(options?.deliveryMode);
      if (explicitMode !== MESSAGE_DELIVERY_MODE.AUTO) {
        return explicitMode;
      }
      if (
        this.isQueryDeliveryPayload(payload) ||
        this.isDirectOnlyControlPlanePayload(payload)
      ) {
        return MESSAGE_DELIVERY_MODE.DIRECT_ONLY;
      }
      return MESSAGE_DELIVERY_MODE.DIRECT_WITH_RAFT_DURABILITY;
    }
    /**
     * Send one message through the fast direct-only path.
     * @param {Object} messageEnvelope
     * @return {Promise<Object>}
     * @private
     */
    async deliverDirectOnlyMessage(messageEnvelope, options = {}) {
      const {id: messageId, targetService, payload} = messageEnvelope;
      const failureDescription = this.isQueryDeliveryPayload(payload) ?
        'Query message delivery failed' :
        'Message delivery failed';
      try {
        const deliveryResult = await this.attemptDirectDelivery(
          messageEnvelope,
          {
            maxAttempts: 1,
            disableRetryDelay: true,
            transportDeliveryOptions: options?.transportDeliveryOptions || null,
          },
        );
        if (!deliveryResult.delivered) {
          throw shouldDeferImmediateDeliveryRetry(deliveryResult) ?
            buildDeferredDeliveryError(deliveryResult) :
            new Error(deliveryResult.error || failureDescription);
        }
        messageEnvelope.status = MessageStatus.DELIVERED;
        this.pendingMessages.delete(messageId);
        const {
          delivered: _d,
          attempt: _a,
          ...transportResult
        } = deliveryResult;
        return {
          messageId,
          status: MessageStatus.DELIVERED,
          deliveryType: MESSAGE_GROUP_SERVICE_LITERAL.DIRECT,
          ...transportResult,
        };
      } catch (error) {
        const logLevel = error?.deferRetry === true ? 'debug' : 'error';
        this.logger[logLevel](
          MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_SEND_MESSAGE,
          {
            messageId,
            targetService,
            error: error.message,
            deferRetry: error?.deferRetry === true,
            retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
              error.retryAfterMs :
              null,
          },
        );
        messageEnvelope.status = MessageStatus.FAILED;
        this.pendingMessages.delete(messageId);
        throw error;
      }
    }
    /**
     * Persist message to Raft log.
     * Uses liferaft's command method for log replication.
     * Note: Does not wait for commit - fire and forget for performance.
     * @param {Object} messageEnvelope - Message envelope.
     * @return {Promise<Object>} Persistence result.
     * @private
     */
    async persistToRaftLog(messageEnvelope) {
      const entry = this.operationLedger.appendEntry({
        type: 'MESSAGE',
        message: messageEnvelope,
      });
      // Only use the live raft owner for command ingress.
      const isOperationalRaftLeader = this.isCurrentRaftLeader();
      if (isOperationalRaftLeader) {
        // Fire and forget - don't wait for commit
        // The command will be replicated via heartbeats
        this.raftProvider.propose(
          this.raft,
          {
            type: MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE,
            message: messageEnvelope,
          },
          (err) => {
            if (err) {
              this.logger.debug(
                MESSAGE_GROUP_SERVICE_LITERAL.RAFT_COMMAND_FAILED,
                {
                  messageId: messageEnvelope.id,
                  error: err.message,
                },
              );
            }
          },
        );
      }
      return {
        success: true,
        index: entry.index,
        term: entry.term,
      };
    }
  }

  return MessageGroupServiceOutboundDispatchRuntimeMethods;
}

function defineMessageGroupServiceOutboundDispatchRuntimeMethods(
  prototype,
  deps = {},
) {
  const MessageGroupServiceOutboundDispatchRuntimeMethods =
    createMessageGroupServiceOutboundDispatchRuntimeMethods(deps);
  const descriptors = Object.getOwnPropertyDescriptors(
    MessageGroupServiceOutboundDispatchRuntimeMethods.prototype,
  );
  delete descriptors[
    MESSAGE_GROUP_SERVICE_OUTBOUND_DISPATCH_RUNTIME_LITERAL.CONSTRUCTOR
  ];
  Object.defineProperties(prototype, descriptors);
}

export {defineMessageGroupServiceOutboundDispatchRuntimeMethods};
