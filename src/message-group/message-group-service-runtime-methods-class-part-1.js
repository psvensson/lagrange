function createMessageGroupServiceRuntimeMethodsClassPart1(deps = {}) {
  const {
    CDC_FORWARD_MAX_RELAY_DEPTH,
    DIRECT_ONLY_MESSAGE_TYPES,
    HLCTimestamp,
    MESSAGE_DELIVERY_MODE,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    MESSAGE_GROUP_SERVICE_LITERAL,
    MessageStatus,
    NUM,
    QUERY_MESSAGE_TYPE,
    RAFT_PACKET_TYPE,
    TYPEOF,
    buildDeferredDeliveryError,
    buildLatencyCdcPropagationResult,
    isRaftPacket,
    normalizeCauseId,
    normalizeMessageDeliveryMode,
    resolveRaftTransportDeliveryOptions,
    resolveTransportDeliveryOptions,
    shouldDeferImmediateDeliveryRetry,
    uuidv4,
  } = deps;

  class MessageGroupServiceRuntimeMethodsPart1 {
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
        Number.isInteger(options?.maxAttempts) && options.maxAttempts > NUM.ZERO ?
          options.maxAttempts :
          this.retryMaxAttempts;
      const disableRetryDelay = options?.disableRetryDelay === true;
      for (let attempt = NUM.ZERO; attempt < maxAttempts; attempt++) {
        messageEnvelope.attempts++;
        try {
          // Calculate delay with exponential backoff and jitter
          if (!disableRetryDelay && attempt > NUM.ZERO) {
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
              attempt: attempt + NUM.ONE,
              ...result,
            };
          }
          if (shouldDeferImmediateDeliveryRetry(result)) {
            return {
              delivered: false,
              attempt: attempt + NUM.ONE,
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
              attempt: attempt + NUM.ONE,
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
            Math.max(NUM.ZERO, Math.floor(lastError.retryAfterMs)) :
            NUM.ZERO,
          errorCode:
            typeof lastError.code === TYPEOF.STRING ? lastError.code : null,
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
        typeof payload === TYPEOF.OBJECT &&
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
        typeof payload === TYPEOF.OBJECT &&
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
            maxAttempts: NUM.ONE,
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
                  this.logger.debug('Deferred Raft response delivery', {
                    destination: senderAddress,
                    retryAfterMs: result.retryAfterMs,
                    errorCode: result?.errorCode || null,
                  });
                }
              } catch (err) {
                this.logger.error('Failed to send Raft response', {
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
      const tableName = payload.tableName;
      const operation = payload.operation;
      const data = payload.data;
      const eventTimestamp =
        typeof payload.timestamp === 'string' &&
        payload.timestamp.length > NUM.ZERO ?
          payload.timestamp :
          null;
      const causeId = normalizeCauseId(payload.causeId);
      const replayOnly = payload?.replayOnly === true;
      const relayDepth =
        Number.isInteger(payload.relayDepth) && payload.relayDepth >= NUM.ZERO ?
          payload.relayDepth :
          NUM.ZERO;
      if (!tableName || !operation || !data) {
        throw new Error(
          MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_PAYLOAD,
        );
      }
      // Followers relay toward the current leader without applying locally.
      // Allow one additional bounded hop so stale first-hop routing can
      // converge during elections without creating open-ended loops.
      if (!this.isCurrentRaftLeader()) {
        if (
          this.shouldUseStrictCDCForwarding({
            tableName,
            operation,
          })
        ) {
          const ingressDecision = this.resolveCdcIngressDecision({
            tableName,
            operation,
            relayDepth,
          });
          if (
            ingressDecision.action === MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER
          ) {
            return buildLatencyCdcPropagationResult({
              messageId,
              status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
              acknowledged: true,
              success: false,
              error:
                ingressDecision.reason ||
                MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
              deferRetry: true,
              retryAfterMs: Number.isFinite(
                ingressDecision.strictForwardRetryAfterMs,
              ) ?
                ingressDecision.strictForwardRetryAfterMs :
                this.resolveStrictCdcForwardRetryAfterMs(),
              tableName,
              operation,
            });
          }
          if (
            ingressDecision.action ===
            MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL
          ) {
            const applyOptions = {
              skipSubscriptionCheck: true,
              relayDepth,
            };
            if (eventTimestamp) {
              applyOptions.timestamp = eventTimestamp;
            }
            if (causeId) {
              applyOptions.causeId = causeId;
            }
            if (replayOnly) {
              applyOptions.replayOnly = true;
            }
            await this.applyCDCEvent(tableName, operation, data, applyOptions);
            return buildLatencyCdcPropagationResult({
              messageId,
              status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
              acknowledged: true,
              tableName,
              operation,
            });
          }
        }
        if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
          throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
        }
        await this.forwardCDCEventToLeader(tableName, operation, data, {
          timestamp: eventTimestamp || undefined,
          relayDepth: relayDepth + NUM.ONE,
          causeId,
          replayOnly,
        });
        return buildLatencyCdcPropagationResult({
          messageId,
          status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
          acknowledged: true,
          tableName,
          operation,
        });
      }
      const applyOptions = {skipSubscriptionCheck: true};
      if (eventTimestamp) {
        applyOptions.timestamp = eventTimestamp;
      }
      if (causeId) {
        applyOptions.causeId = causeId;
      }
      await this.applyCDCEvent(tableName, operation, data, applyOptions);
      return buildLatencyCdcPropagationResult({
        messageId,
        status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
        acknowledged: true,
        tableName,
        operation,
      });
    }
    /**
     * Handle grouped-latency CDC batch propagation message.
     * @param {string} messageId - Message ID.
     * @param {Object} payload - Propagation payload.
     * @return {Promise<Object>}
     * @private
     */
    async handleLatencyCdcPropagationBatchMessage(messageId, payload) {
      const events = Array.isArray(payload.events) ? payload.events : [];
      const replayOnly = payload?.replayOnly === true;
      const relayDepth =
        Number.isInteger(payload.relayDepth) && payload.relayDepth >= NUM.ZERO ?
          payload.relayDepth :
          NUM.ZERO;
      if (
        events.length === NUM.ZERO ||
        events.some(
          (event) => !event?.tableName || !event?.operation || !event?.data,
        )
      ) {
        throw new Error(
          MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_BATCH_PAYLOAD,
        );
      }
      if (!this.isCurrentRaftLeader()) {
        const strictEvent = events.find((event) => {
          return this.shouldUseStrictCDCForwarding({
            tableName: event?.tableName || null,
            operation: event?.operation || null,
          });
        });
        if (strictEvent) {
          const ingressDecision = this.resolveCdcIngressDecision({
            tableName: strictEvent.tableName,
            operation: strictEvent.operation,
            relayDepth,
          });
          if (
            ingressDecision.action === MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER
          ) {
            return buildLatencyCdcPropagationResult({
              messageId,
              status:
                MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
              acknowledged: true,
              success: false,
              error:
                ingressDecision.reason ||
                MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
              deferRetry: true,
              retryAfterMs: Number.isFinite(
                ingressDecision.strictForwardRetryAfterMs,
              ) ?
                ingressDecision.strictForwardRetryAfterMs :
                this.resolveStrictCdcForwardRetryAfterMs(),
              eventCount: events.length,
            });
          }
          if (
            ingressDecision.action ===
            MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL
          ) {
            await this.applyCDCBatch(events, {
              skipSubscriptionCheck: true,
              replayOnly,
              relayDepth,
            });
            return buildLatencyCdcPropagationResult({
              messageId,
              status:
                MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
              acknowledged: true,
              eventCount: events.length,
            });
          }
        }
        if (relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
          throw new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
        }
        await this.forwardCDCBatchToLeader(events, {
          relayDepth: relayDepth + NUM.ONE,
          replayOnly,
        });
        return buildLatencyCdcPropagationResult({
          messageId,
          status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
          acknowledged: true,
          eventCount: events.length,
        });
      }
      await this.applyCDCBatch(events, {skipSubscriptionCheck: true});
      return {
        messageId,
        status: MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
        acknowledged: true,
        eventCount: events.length,
      };
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
    /**
     * Subscribe to CDC events from a system table.
     * @param {string} tableName - System table name.
     * @return {Promise<void>}
     */
    async subscribeToCDC(tableName) {
      this.cdcHandler.subscribe(tableName);
      this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.SUBSCRIBED_TO_CDC, {
        tableName,
        groupId: this.groupId,
      });
    }
    /**
     * Apply a CDC event to the system table cache.
     * @param {string} tableName - System table name.
     * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
     * @param {Object} data - Record data.
     * @param {Object} [options]
     * @param {boolean} [options.skipReplication]
     * @param {boolean} [options.skipSubscriptionCheck]
     * @return {Promise<void>}
     */
    async applyCDCEvent(tableName, operation, data, options = {}) {
      return this.applyCDCBatch(
        [
          {
            tableName,
            operation,
            data,
            ...options,
          },
        ],
        options,
      );
    }
    /**
     * Normalize CDC batch events into one canonical replicated command payload.
     * @param {Array<Object>} events
     * @param {Object} [options]
     * @return {Array<Object>}
     * @private
     */
    normalizeCDCBatchEvents(events, options = {}) {
      return (Array.isArray(events) ? events : [])
        .filter((event) => event?.tableName && event?.operation && event?.data)
        .map((event) => {
          const timestamp =
            typeof event.timestamp === 'string' &&
            event.timestamp.length > NUM.ZERO ?
              event.timestamp :
              typeof options.timestamp === 'string' &&
                  options.timestamp.length > NUM.ZERO ?
                options.timestamp :
                this.hlcClock.now().toString();
          const causeId = normalizeCauseId(event.causeId ?? options.causeId);
          return {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            timestamp,
            causeId,
            replayOnly:
              event.replayOnly === true || options.replayOnly === true,
          };
        });
    }
    /**
     * Emit canonical cdcApplied notifications for one or more events.
     * @param {Array<Object>} events
     * @param {?number} logIndex
     * @private
     */
    emitCDCAppliedEvents(events, logIndex = null) {
      for (const event of events) {
        this.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, {
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
          logIndex,
          causeId: normalizeCauseId(event.causeId),
        });
      }
    }
    normalizeLeaderReplicaId(candidate) {
      return this.forwardingOwner.normalizeLeaderReplicaId(candidate);
    }
    resolveLivePeerAddressFromRaftNodes(peerId) {
      return this.forwardingOwner.resolveLivePeerAddressFromRaftNodes(peerId);
    }
    resolveCDCForwardSelection(logContext = {}) {
      return this.forwardingOwner.resolveCDCForwardSelection(logContext);
    }
  }

  return MessageGroupServiceRuntimeMethodsPart1;
}

export {createMessageGroupServiceRuntimeMethodsClassPart1};
