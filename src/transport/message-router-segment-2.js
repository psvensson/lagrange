import { MESSAGE_ROUTER_SHARED } from "./message-router-shared.js";
import { MessageRouterSegment1 } from "./message-router-segment-1.js";

const {
  CONNECTION_CLOSE_DISPOSITION,
  CONNECTION_STATE,
  ConfigurationManager,
  ConnectionState,
  EMPTY_ROUTER_REASON,
  EventEmitter,
  HOST,
  INCOMING_CONNECTION_ADOPTION,
  INLINE_ACK_PASSTHROUGH_KEYS,
  INLINE_ACK_RESULT_FIELD,
  INPROC,
  IPV6_ANY_HOST,
  IPV6_HOST_PREFIX,
  IPV6_HOST_SUFFIX,
  InProcWebSocket,
  LoggingService,
  MESSAGE_ROUTER_LITERAL,
  METRICS_LOG_TAG,
  OUTBOUND_DELIVERY_PRIORITY,
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  OUTBOUND_QUEUE_BACKPRESSURE_SCOPE,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM,
  OutboundDeliveryPriority,
  OutboundDeliveryRegistryOwner,
  QUERY_DATA_PLANE_MESSAGE_TYPE,
  QUERY_TRANSPORT_DELIVERY_STATE,
  QUERY_TRANSPORT_SELECTION,
  QUEUE_WAIT_BUCKETS,
  QUEUE_WAIT_BUCKET_OVERFLOW,
  RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS,
  RECONNECT_DISPOSITION,
  RETIRED_PENDING_RESPONSE_REASON,
  ROUTER_ADDRESS,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_MESSAGE_TYPE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  ROUTER_VALID_ENTITY_TYPES,
  RouterConnectionAuthorityOwner,
  RouterMessageType,
  SERVICE_RESPONSE_DISPOSITION_KIND,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
  TRANSPORT_METRIC,
  TRANSPORT_METRIC_TRIGGER,
  TRANSPORT_NUM,
  TRANSPORT_PRESSURE_SUMMARY_FIELD,
  TRANSPORT_SUBSYSTEM,
  TRANSPORT_TYPEOF,
  UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS,
  URL,
  WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
  WebSocket,
  WebSocketServer,
  adjustInFlightPriorityCount,
  buildDerivedDeliverySource,
  buildPendingSourceSummary,
  buildQueryTransportSemanticOutcome,
  buildQueueWaitSummary,
  buildRetiredPendingClassification,
  buildServiceResponseDisposition,
  buildSupersededPendingResult,
  buildTransportDeliveryOutcome,
  canDispatchPendingItem,
  countInFlightByPriority,
  countPendingByPriority,
  countPendingBySource,
  createInProcWebSocketPair,
  createQueueWaitHistogram,
  dequeueNextPendingItem,
  extractSqlOperationKind,
  extractSqlTableName,
  isRaftPacket,
  isSupersedableHeartbeatNodeStateUpdate,
  isSupersedableRaftAppendFail,
  isSupersedableRaftHeartbeatAppend,
  normalizeDeliveryOutcome,
  normalizeIdentifier,
  normalizeOutboundDeliveryPriority,
  normalizeRetryAfterMs,
  normalizeToWebSocketAddress,
  peekNextPendingItem,
  queueMicrotaskFn,
  recordQueueWaitDuration,
  resolveBackgroundInFlightLimit,
  resolveBackgroundPendingLimit,
  resolveBoundedCriticalReserve,
  resolveDeliverySource,
  resolveNextPendingItemIndex,
  resolveNodeStateUpdateReplacementNodeId,
  resolveOperationIdFromMessage,
  resolvePendingReplacementKey,
  resolvePendingSourceLimit,
  resolveQueueWaitBucket,
  resolveRequestIdFromMessage,
  summarizeRaftAppendCommand,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

class MessageRouterSegment2 extends MessageRouterSegment1 {
  logUnmatchedServiceResponse(unmatchedResponseClassification) {
    const messageId = unmatchedResponseClassification?.messageId || null;
    const nowMs = Number(this.nowFn());
    const warnIntervalMs = this.unmatchedServiceResponseWarnIntervalMs;
    const lastWarnAtMs = this.lastUnmatchedServiceResponseWarnAtMs;
    const shouldWarnNow =
      !Number.isFinite(lastWarnAtMs) ||
      warnIntervalMs <= TRANSPORT_NUM.ZERO ||
      !Number.isFinite(nowMs) ||
      nowMs - lastWarnAtMs >= warnIntervalMs;
    if (!shouldWarnNow) {
      this.unmatchedServiceResponseWarnSuppressedCount += TRANSPORT_NUM.ONE;
      this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, {
        messageId,
        suppressedByRateLimit: true,
        unmatchedClassification:
          unmatchedResponseClassification?.classification ||
          MESSAGE_ROUTER_LITERAL.STRING_ORPHANED,
      });
      return;
    }
    const suppressedSinceLastWarn =
      this.unmatchedServiceResponseWarnSuppressedCount;
    this.unmatchedServiceResponseWarnSuppressedCount = TRANSPORT_NUM.ZERO;
    this.lastUnmatchedServiceResponseWarnAtMs = Number.isFinite(nowMs)
      ? nowMs
      : null;
    const context = {
      messageId,
      unmatchedClassification:
        unmatchedResponseClassification?.classification || "orphaned",
    };
    if (
      typeof unmatchedResponseClassification?.retiredReason ===
        TRANSPORT_TYPEOF.STRING &&
      unmatchedResponseClassification.retiredReason.length > TRANSPORT_NUM.ZERO
    ) {
      context.retiredReason = unmatchedResponseClassification.retiredReason;
    }
    if (
      typeof unmatchedResponseClassification?.deliverySource ===
        TRANSPORT_TYPEOF.STRING &&
      unmatchedResponseClassification.deliverySource.length > TRANSPORT_NUM.ZERO
    ) {
      context.deliverySource = unmatchedResponseClassification.deliverySource;
    }
    if (
      typeof unmatchedResponseClassification?.targetNodeId ===
        TRANSPORT_TYPEOF.STRING &&
      unmatchedResponseClassification.targetNodeId.length > TRANSPORT_NUM.ZERO
    ) {
      context.targetNodeId = unmatchedResponseClassification.targetNodeId;
    }
    if (suppressedSinceLastWarn > TRANSPORT_NUM.ZERO) {
      context.suppressedSinceLastWarn = suppressedSinceLastWarn;
    }
    this.logger.warn(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, context);
  }
  /**
   * @param {Object} disposition
   * @return {void}
   * @private
   */
  recordServiceResponseDisposition(disposition) {
    const classification =
      normalizeIdentifier(disposition?.classification) || "orphaned";
    this.serviceResponseDispositionCounts.set(
      classification,
      (this.serviceResponseDispositionCounts.get(classification) ||
        TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE,
    );
  }
  /**
   * @return {Object}
   */
  getServiceResponseDispositionCounts() {
    return Object.freeze(
      Object.fromEntries(
        [...this.serviceResponseDispositionCounts.entries()].sort(
          (left, right) =>
            left[TRANSPORT_NUM.ZERO].localeCompare(right[TRANSPORT_NUM.ZERO]),
        ),
      ),
    );
  }
  /**
   * Settle one SERVICE_RESPONSE if possible, otherwise classify its late
   * disposition under the retired-waiter model.
   *
   * @param {string} messageId
   * @param {Object} payload
   * @return {Object}
   * @private
   */
  resolveServiceResponseDisposition(messageId, payload = {}) {
    const settled = this.settlePendingResponse(messageId, payload);
    if (settled) {
      return buildServiceResponseDisposition({
        messageId,
        kind: SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED,
        classification: SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED,
      });
    }
    return this.classifyUnmatchedServiceResponse(messageId);
  }
  /**
   * Classify one SERVICE_RESPONSE that no longer has a live waiter.
   * @param {string} messageId
   * @return {Object}
   * @private
   */
  classifyUnmatchedServiceResponse(messageId) {
    const retiredPendingResponse =
      this.consumeRetiredPendingResponse(messageId);
    if (retiredPendingResponse) {
      return buildServiceResponseDisposition({
        messageId,
        kind: SERVICE_RESPONSE_DISPOSITION_KIND.ABSORBED,
        classification: buildRetiredPendingClassification(
          retiredPendingResponse.reason,
        ),
        absorbed: true,
        retiredReason:
          retiredPendingResponse.reason ||
          RETIRED_PENDING_RESPONSE_REASON.UNKNOWN,
        deliverySource: retiredPendingResponse.deliverySource || null,
        targetNodeId: retiredPendingResponse.targetNodeId || null,
      });
    }
    return buildServiceResponseDisposition({
      messageId,
      kind: SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED,
      classification: MESSAGE_ROUTER_LITERAL.STRING_ORPHANED,
    });
  }
  /**
   * Resolve the grace window for one retired SERVICE_RESPONSE waiter.
   * Mirrors retired-socket termination so one late response can still be
   * absorbed after timeout/defer/disconnect without persisting forever.
   * @return {number}
   * @private
   */
  getRetiredPendingResponseGraceMs() {
    return Math.max(this.reconnectIntervalMs, this.messageTimeoutMs);
  }
  /**
   * Prune expired retired SERVICE_RESPONSE waiters.
   * @param {number|null} [nowMs]
   * @return {void}
   * @private
   */
  pruneRetiredPendingResponses(nowMs = null) {
    const effectiveNowMs = Number.isFinite(nowMs)
      ? nowMs
      : Number(this.nowFn());
    for (const [messageId, entry] of this.retiredPendingResponses.entries()) {
      if (
        !entry ||
        !Number.isFinite(entry.expiresAtMs) ||
        !Number.isFinite(effectiveNowMs) ||
        entry.expiresAtMs <= effectiveNowMs
      ) {
        this.retiredPendingResponses.delete(messageId);
      }
    }
  }
  /**
   * Remember one response waiter that was intentionally retired before the
   * peer finished the round-trip.
   * @param {string} messageId
   * @return {void}
   * @private
   */
  rememberRetiredPendingResponse(
    messageId,
    pending = null,
    reason = RETIRED_PENDING_RESPONSE_REASON.UNKNOWN,
  ) {
    const normalizedMessageId = normalizeIdentifier(messageId);
    if (!normalizedMessageId) {
      return;
    }
    const nowMs = Number(this.nowFn());
    const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    this.pruneRetiredPendingResponses(effectiveNowMs);
    this.retiredPendingResponses.set(normalizedMessageId, {
      reason:
        typeof reason === TRANSPORT_TYPEOF.STRING &&
        reason.length > TRANSPORT_NUM.ZERO
          ? reason
          : RETIRED_PENDING_RESPONSE_REASON.UNKNOWN,
      deliverySource: normalizeIdentifier(pending?.deliverySource) || null,
      targetNodeId: normalizeIdentifier(pending?.targetNodeId) || null,
      expiresAtMs: effectiveNowMs + this.getRetiredPendingResponseGraceMs(),
    });
  }
  /**
   * Consume one retired waiter marker when a late response finally arrives.
   * @param {string} messageId
   * @return {Object|null}
   * @private
   */
  consumeRetiredPendingResponse(messageId) {
    const normalizedMessageId = normalizeIdentifier(messageId);
    if (!normalizedMessageId) {
      return null;
    }
    const nowMs = Number(this.nowFn());
    this.pruneRetiredPendingResponses(nowMs);
    const retiredEntry = this.retiredPendingResponses.get(normalizedMessageId);
    if (!retiredEntry) {
      return null;
    }
    this.retiredPendingResponses.delete(normalizedMessageId);
    return retiredEntry;
  }
  /**
   * Register a pending SERVICE_RESPONSE waiter.
   * @param {string} messageId - Correlated message ID.
   * @param {string|null} targetNodeId - Target node ID.
   * @return {Promise<*>} Resolves with handler result.
   * @private
   */
  registerPendingResponse(messageId, targetNodeId = null, options = {}) {
    return new Promise((resolve, reject) => {
      this.pendingResponses.set(messageId, {
        resolve,
        reject,
        timeoutId: null,
        targetNodeId,
        deliverySource: normalizeIdentifier(options?.deliverySource) || null,
      });
    });
  }
  /**
   * Arm timeout for a pending SERVICE_RESPONSE waiter.
   * Timeout is started after ACK to avoid premature rejection while still
   * waiting for sender-side ACK.
   * @param {string} messageId - Correlated message ID.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {boolean} True when timeout was armed.
   * @private
   */
  armPendingResponseTimeout(messageId, timeoutMs) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending || pending.timeoutId) {
      return false;
    }
    const timeoutId = setTimeout(() => {
      this.pendingResponses.delete(messageId);
      this.rememberRetiredPendingResponse(
        messageId,
        pending,
        RETIRED_PENDING_RESPONSE_REASON.TIMEOUT,
      );
      pending.reject(new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT));
    }, timeoutMs);
    if (typeof timeoutId.unref === TRANSPORT_TYPEOF.FUNCTION) {
      timeoutId.unref();
    }
    pending.timeoutId = timeoutId;
    return true;
  }
  /**
   * Settle pending SERVICE_RESPONSE waiter.
   * @param {string} messageId - Correlated message ID.
   * @param {Object} payload - Service response payload.
   * @param {*} payload.result - Handler result.
   * @param {string} payload.error - Handler error.
   * @return {boolean} True when pending waiter was found.
   * @private
   */
  settlePendingResponse(messageId, { result, error }) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending) {
      return false;
    }
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingResponses.delete(messageId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
    return true;
  }
  /**
   * Remove pending SERVICE_RESPONSE waiter without settling it.
   * @param {string} messageId - Correlated message ID.
   * @return {boolean} True when a waiter was removed.
   * @private
   */
  cancelPendingResponse(messageId, options = {}) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending) {
      return false;
    }
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingResponses.delete(messageId);
    if (options?.ignoreLateResponse === true) {
      this.rememberRetiredPendingResponse(
        messageId,
        pending,
        options?.retiredReason || RETIRED_PENDING_RESPONSE_REASON.CANCELLED,
      );
    }
    return true;
  }
  /**
   * Fail pending SERVICE_RESPONSE waiters for a target node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Failure reason.
   * @private
   */
  failPendingResponsesForNode(nodeId, error) {
    for (const [messageId, pending] of this.pendingResponses) {
      if (pending.targetNodeId === nodeId) {
        if (pending.timeoutId) {
          clearTimeout(pending.timeoutId);
        }
        this.pendingResponses.delete(messageId);
        this.rememberRetiredPendingResponse(
          messageId,
          pending,
          RETIRED_PENDING_RESPONSE_REASON.NODE_FAILURE,
        );
        pending.reject(error);
      }
    }
  }
  /**
   * Check whether an ACK includes legacy inline handler payload.
   * @param {Object} ackResult - ACK result.
   * @return {boolean} True when ACK carries handler payload.
   * @private
   */
  hasInlineAckPayload(ackResult) {
    if (
      !ackResult ||
      typeof ackResult !== TRANSPORT_TYPEOF.OBJECT ||
      ackResult.acknowledged !== true
    ) {
      return false;
    }
    return Object.keys(ackResult).some(
      (key) => !INLINE_ACK_PASSTHROUGH_KEYS.has(key),
    );
  }
  /**
   * Normalize SERVICE_RESPONSE payload to transport delivery shape.
   * @param {*} result - Handler result payload.
   * @return {Object} Normalized payload fields.
   * @private
   */
  normalizeServiceResponseResult(result) {
    if (!result || typeof result !== TRANSPORT_TYPEOF.OBJECT) {
      return {};
    }
    const { acknowledged: _ack, type: handlerType, ...rest } = result;
    if (
      handlerType &&
      !Object.prototype.hasOwnProperty.call(
        rest,
        MESSAGE_ROUTER_LITERAL.STRING_RESPONSETYPE,
      )
    ) {
      rest.responseType = handlerType;
    }
    return rest;
  }
  /**
   * Handle acknowledgment message.
   * Passes through flat ACK structure without additional nesting.
   * @param {Object} message - Acknowledgment message.
   * @private
   */
  handleAcknowledgment(message) {
    const { messageId, acknowledged, error, type: _type, ...rest } = message;
    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(messageId);
      if (acknowledged) {
        const connection = this.nodeConnections.get(pending.targetNodeId);
        if (
          connection &&
          connection.isIncoming !== true &&
          connection.isSelfConnection !== true
        ) {
          connection.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
          connection.lastAckAt = Date.now();
          connection.lastAckTimeoutAt = null;
        }
        const resolved = {
          messageId,
          acknowledged: true,
          ...rest,
        };
        if (error !== void 0) {
          resolved.error = error;
        }
        pending.resolve(resolved);
      } else {
        pending.reject(
          new Error(error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED),
        );
      }
    }
  }
  /**
   * Handle connection close.
   * Self-disconnection is treated as a fatal error (no reconnection).
   * Requirements: 2.1
   * @param {string} nodeId - Node ID.
   * @param {string|null} expectedConnectionId - Optional stale-close fence.
   * @private
   */
  handleConnectionClose(nodeId, expectedConnectionId = null) {
    const connection = this.nodeConnections.get(nodeId);
    if (
      expectedConnectionId &&
      connection &&
      connection.connectionId !== expectedConnectionId
    ) {
      this.logger.debug(
        MESSAGE_ROUTER_LITERAL.STRING_IGNORING_STALE_CONNECTION_CLOSE_EVENT,
        {
          nodeId,
          expectedConnectionId,
          actualConnectionId: connection.connectionId,
        },
      );
      return;
    }
    if (connection) {
      this.logger.info(ROUTER_LOG_MSG.CONNECTION_CLOSED, {
        nodeId,
        connectionId: connection.connectionId,
        isSelfConnection: connection.isSelfConnection,
      });
      connection.ws = null;
      this.clearPingInterval(connection);
      const disconnectError = new Error(
        ROUTER_ERROR_MSG.connectionClosed(nodeId),
      );
      this.failOutboundQueue(nodeId, disconnectError);
      this.failPendingMessagesForNode(nodeId, disconnectError);
      this.failPendingResponsesForNode(nodeId, disconnectError);
      this.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, {
        nodeId,
      });
      const closeDisposition =
        this.resolveConnectionCloseDisposition(connection);
      connection.state = closeDisposition.state;
      if (closeDisposition.kind === CONNECTION_CLOSE_DISPOSITION.SHUTDOWN) {
        return;
      }
      if (closeDisposition.kind === CONNECTION_CLOSE_DISPOSITION.RETIRED) {
        return;
      }
      if (
        closeDisposition.kind === CONNECTION_CLOSE_DISPOSITION.SELF_DISCONNECT
      ) {
        this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_LOST, {
          nodeId,
          connectionId: connection.connectionId,
        });
        this.emit(TRANSPORT_EVENT.SELF_DISCONNECT, {
          nodeId,
        });
        return;
      }
      if (closeDisposition.kind === CONNECTION_CLOSE_DISPOSITION.RECONNECT) {
        this.scheduleReconnect(connection);
      }
    }
  }
  resolveConnectionCloseDisposition(connection) {
    let kind = CONNECTION_CLOSE_DISPOSITION.NO_ACTION;
    let state = ConnectionState.DISCONNECTED;
    if (this.isShuttingDown) {
      kind = CONNECTION_CLOSE_DISPOSITION.SHUTDOWN;
    } else if (connection.retired) {
      kind = CONNECTION_CLOSE_DISPOSITION.RETIRED;
      state = ConnectionState.CLOSED;
    } else if (connection.isSelfConnection) {
      kind = CONNECTION_CLOSE_DISPOSITION.SELF_DISCONNECT;
    } else if (!connection.isIncoming && connection.address) {
      kind = CONNECTION_CLOSE_DISPOSITION.RECONNECT;
    }
    return {
      kind,
      state,
    };
  }
  /**
   * Schedule reconnection attempt.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  scheduleReconnect(connectionInfo) {
    if (this.isShuttingDown) {
      return;
    }
    const reconnectDisposition =
      this.resolveReconnectDisposition(connectionInfo);
    if (reconnectDisposition.state) {
      connectionInfo.state = reconnectDisposition.state;
    }
    if (reconnectDisposition.kind === RECONNECT_DISPOSITION.RETIRE) {
      this.retireConnection(connectionInfo);
      return;
    }
    if (reconnectDisposition.kind === RECONNECT_DISPOSITION.PENDING) {
      return;
    }
    if (
      reconnectDisposition.kind === RECONNECT_DISPOSITION.MAX_ATTEMPTS_REACHED
    ) {
      this.logger.error(ROUTER_LOG_MSG.MAX_RECONNECTS_REACHED, {
        nodeId: connectionInfo.nodeId,
        attempts: connectionInfo.reconnectAttempts,
      });
      return;
    }
    connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE;
    const delay =
      this.reconnectIntervalMs *
      Math.pow(
        this.reconnectBackoffMultiplier,
        connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE,
      );
    connectionInfo.reconnectDueAt = Date.now() + delay;
    this.logger.debug(ROUTER_LOG_MSG.SCHEDULING_RECONNECT, {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });
    connectionInfo.reconnectTimeout = setTimeout(async () => {
      connectionInfo.reconnectTimeout = null;
      connectionInfo.reconnectDueAt = null;
      if (connectionInfo.retired || !this.isCurrentConnection(connectionInfo)) {
        this.retireConnection(connectionInfo);
        connectionInfo.state = ConnectionState.CLOSED;
        return;
      }
      try {
        this.refreshReconnectAuthority(
          connectionInfo,
          connectionInfo.address || connectionInfo.configuredAddress,
        );
        if (
          (!connectionInfo.address ||
            connectionInfo.address.length === TRANSPORT_NUM.ZERO) &&
          typeof connectionInfo.configuredAddress === TRANSPORT_TYPEOF.STRING &&
          connectionInfo.configuredAddress.length > TRANSPORT_NUM.ZERO
        ) {
          connectionInfo.address = connectionInfo.configuredAddress;
        }
        await this.establishConnection(connectionInfo);
      } catch (error) {
        this.logger.error(ROUTER_LOG_MSG.RECONNECT_FAILED, {
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        if (this.isShuttingDown) {
          return;
        }
        this.scheduleReconnect(connectionInfo);
      }
    }, delay);
    if (
      typeof connectionInfo.reconnectTimeout?.unref ===
      MESSAGE_ROUTER_LITERAL.STRING_FUNCTION
    ) {
      connectionInfo.reconnectTimeout.unref();
    }
  }
  resolveReconnectDisposition(connectionInfo) {
    let kind = RECONNECT_DISPOSITION.SCHEDULE;
    let state = ConnectionState.RECONNECTING;
    if (connectionInfo.retired || !this.isCurrentConnection(connectionInfo)) {
      kind = RECONNECT_DISPOSITION.RETIRE;
      state = ConnectionState.CLOSED;
    } else if (connectionInfo.reconnectTimeout) {
      kind = RECONNECT_DISPOSITION.PENDING;
      state = null;
    } else if (connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts) {
      kind = RECONNECT_DISPOSITION.MAX_ATTEMPTS_REACHED;
      state = ConnectionState.CLOSED;
    }
    return {
      kind,
      state,
    };
  }
  /**
   * Start ping interval for connection.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  startPingInterval(connectionInfo) {
    connectionInfo.pingInterval = setInterval(() => {
      if (
        connectionInfo.ws &&
        connectionInfo.ws.readyState === WebSocket.OPEN
      ) {
        this.sendRaw(connectionInfo.ws, {
          type: RouterMessageType.PING,
          timestamp: Date.now(),
        });
      }
    }, this.pingIntervalMs);
    connectionInfo.pingInterval.unref();
  }
  /**
   * Register a service handler.
   * The handler will be invoked when messages arrive for this address.
   * Requirements: 5.1
   * @param {string} address - Service address in unified format (nodeId/entityType/entityId).
   * @param {Function} handler - Message handler function.
   */
  register(address, handler, _options = {}) {
    if (typeof handler !== TRANSPORT_TYPEOF.FUNCTION) {
      throw new Error(TRANSPORT_ERROR_MSG.HANDLER_MUST_BE_FUNCTION);
    }
    if (!this.isValidAddress(address)) {
      throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(address));
    }
    this.handlers.set(address, handler);
    this.logger.debug(ROUTER_LOG_MSG.HANDLER_REGISTERED, {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
  }
  /**
   * Register a worker delivery handler.
   * Alias for register() used by ReplicaWorkerManager.
   * @param {string} address - Worker unified address.
   * @param {Function} deliverFn - Worker delivery function.
   */
  registerWorkerHandler(address, deliverFn) {
    this.register(address, deliverFn);
  }
  /**
   * Parse a unified address into its components.
   * Address format: ${nodeId}/${entityType}/${entityId}
   * Requirements: 1.2, 9.1
   * @param {string} address - Address to parse.
   * @return {Object} Parsed address with nodeId, entityType, entityId.
   *                  Returns null values for malformed addresses.
   */
  parseAddress(address) {
    if (!address || typeof address !== TRANSPORT_TYPEOF.STRING) {
      return {
        nodeId: null,
        entityType: null,
        entityId: null,
      };
    }
    const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
    if (parts.length !== TRANSPORT_NUM.THREE) {
      return {
        nodeId: null,
        entityType: null,
        entityId: null,
      };
    }
    return {
      nodeId: parts[TRANSPORT_NUM.ZERO] || null,
      entityType: parts[TRANSPORT_NUM.ONE] || null,
      entityId: parts[TRANSPORT_NUM.TWO] || null,
    };
  }
  /**
   * Validate that an address follows the unified format.
   * Format: ${nodeId}/${entityType}/${entityId}
   * Valid entityTypes: message-group, partition, lifecycle, service
   * Requirements: 1.1, 1.3
   * @param {string} address - Address to validate.
   * @return {boolean} True if address is valid.
   */
  isValidAddress(address) {
    if (!address || typeof address !== TRANSPORT_TYPEOF.STRING) {
      return false;
    }
    const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
    if (parts.length !== TRANSPORT_NUM.THREE) {
      return false;
    }
    const [nodeId, entityType, entityId] = parts;
    if (!nodeId || !entityType || !entityId) {
      return false;
    }
    return ROUTER_VALID_ENTITY_TYPES.includes(entityType);
  }
  /**
   * Unregister a service handler.
   * @param {string} address - Service address.
   */
  unregister(address) {
    this.handlers.delete(address);
    this.logger.debug(ROUTER_LOG_MSG.HANDLER_UNREGISTERED, {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
  }
  /**
   * Unregister a worker delivery handler.
   * Alias for unregister() used by ReplicaWorkerManager.
   * @param {string} address - Worker unified address.
   */
  unregisterWorkerHandler(address) {
    this.unregister(address);
  }
  /**
   * Check whether a worker handler is registered.
   * @param {string} address - Worker unified address.
   * @return {boolean} True if registered.
   */
  hasWorkerHandler(address) {
    return this.handlers.has(address);
  }
  /**
   * Set the function to resolve service address to node ID.
   * @param {Function} resolver - Function(address) => nodeId or null.
   */
  setServiceNodeResolver(resolver) {
    this.resolveServiceNode = resolver;
  }
  /**
   * Set the function to resolve node ID to a WebSocket address.
   * @param {Function|null} resolver - Function(nodeId) => wsAddress or null.
   */
  setNodeAddressResolver(resolver) {
    this.resolveNodeAddress = resolver || null;
  }
  /**
   * Set resolver for query/data-plane message-group transport.
   * Resolver must return a local MessageGroupService with sendMessage().
   * @param {Function|null} resolver - Resolver function.
   */
  setQueryMessageGroupServiceResolver(resolver) {
    this.resolveQueryMessageGroupService = resolver || null;
  }
  /**
   * Return the canonical local query/data-plane transport readiness snapshot.
   * Reuses the existing query transport selection owner instead of duplicating
   * resolver logic in callers.
   * @return {{ready:boolean,reason:string|null,retryAfterMs:number}}
   */
  getQueryDataPlaneTransportReadiness() {
    return this.resolveQueryDataPlaneTransportSelection();
  }
  /**
   * Check whether a payload is a query/data-plane message.
   * @param {Object} message - Delivery payload.
   * @return {boolean} True for query/data-plane payloads.
   * @private
   */
  isQueryDataPlaneMessage(message) {
    return Boolean(
      message &&
      typeof message === TRANSPORT_TYPEOF.OBJECT &&
      message.type === QUERY_DATA_PLANE_MESSAGE_TYPE,
    );
  }
  /**
   * Resolve the query/data-plane transport selection.
   * Resolver may return a service directly or a typed selection object.
   * @return {{service:Object|null, reason:string, retryAfterMs:number}}
   * @private
   */
  resolveQueryDataPlaneTransportSelection() {
    let selectionResult;
    if (
      typeof this.resolveQueryMessageGroupService !== TRANSPORT_TYPEOF.FUNCTION
    ) {
      selectionResult = this.buildQueryTransportSelectionResult(
        QUERY_TRANSPORT_SELECTION.UNAVAILABLE,
      );
    } else {
      const selection = this.resolveQueryMessageGroupService();
      if (
        selection &&
        typeof selection.sendMessage === TRANSPORT_TYPEOF.FUNCTION
      ) {
        selectionResult = this.buildQueryTransportSelectionResult(
          QUERY_TRANSPORT_SELECTION.DIRECT_SERVICE,
          {
            service: selection,
          },
        );
      } else if (
        selection?.service &&
        typeof selection.service.sendMessage === TRANSPORT_TYPEOF.FUNCTION
      ) {
        selectionResult = this.buildQueryTransportSelectionResult(
          QUERY_TRANSPORT_SELECTION.SELECTION_SERVICE,
          selection,
        );
      } else {
        selectionResult = this.buildQueryTransportSelectionResult(
          QUERY_TRANSPORT_SELECTION.UNAVAILABLE,
          selection,
        );
      }
    }
    return selectionResult;
  }
  buildQueryTransportSelectionResult(kind, selection = {}) {
    if (kind === QUERY_TRANSPORT_SELECTION.DIRECT_SERVICE) {
      return buildQueryTransportSemanticOutcome({
        service: selection.service,
        retryAfterMs: TRANSPORT_NUM.ZERO,
      });
    } else if (kind === QUERY_TRANSPORT_SELECTION.SELECTION_SERVICE) {
      return buildQueryTransportSemanticOutcome({
        service: selection.service,
        retryAfterMs:
          Number.isFinite(selection.retryAfterMs) &&
          selection.retryAfterMs > TRANSPORT_NUM.ZERO
            ? Math.floor(selection.retryAfterMs)
            : TRANSPORT_NUM.ZERO,
      });
    }
    return buildQueryTransportSemanticOutcome(
      {
        reason:
          typeof selection?.reason === TRANSPORT_TYPEOF.STRING &&
          selection.reason.length > TRANSPORT_NUM.ZERO
            ? selection.reason
            : ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
        errorCode: ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
        retryAfterMs:
          Number.isFinite(selection?.retryAfterMs) &&
          selection.retryAfterMs > TRANSPORT_NUM.ZERO
            ? Math.floor(selection.retryAfterMs)
            : this.reconnectIntervalMs,
        deferRetry: true,
      },
      {
        defaultRetryAfterMs: this.reconnectIntervalMs,
      },
    );
  }
  /**
   * Build a typed deferred outcome for query/data-plane transport misses.
   * @param {{reason:string,retryAfterMs:number}} selection
   * @return {Object}
   * @private
   */
  buildDeferredQueryTransportOutcome(selection = {}) {
    const retryAfterMs =
      Number.isFinite(selection.retryAfterMs) &&
      selection.retryAfterMs > TRANSPORT_NUM.ZERO
        ? Math.floor(selection.retryAfterMs)
        : this.reconnectIntervalMs;
    return {
      acknowledged: false,
      error:
        selection.reason ||
        ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
      errorCode: MESSAGE_ROUTER_LITERAL.STRING_ROUTER_QUERY_TRANSPORT_NOT_READY,
      deferRetry: true,
      retryAfterMs,
    };
  }
  buildCanonicalDeferredQueryTransportOutcome(
    messageId,
    correlationId,
    failure,
  ) {
    return this.buildDeferredDeliveryFailure(
      messageId,
      correlationId,
      failure?.error ||
        failure?.message ||
        ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
      {
        errorCode:
          typeof failure?.errorCode === TRANSPORT_TYPEOF.STRING &&
          failure.errorCode.length > TRANSPORT_NUM.ZERO
            ? failure.errorCode
            : typeof failure?.code === TRANSPORT_TYPEOF.STRING &&
                failure.code.length > TRANSPORT_NUM.ZERO
              ? failure.code
              : null,
        retryAfterMs: Number.isFinite(failure?.retryAfterMs)
          ? failure.retryAfterMs
          : this.reconnectIntervalMs,
      },
    );
  }
  buildQueryTransportFailureError(failure, targetNodeId) {
    const normalizedMessage =
      typeof failure?.error === TRANSPORT_TYPEOF.STRING &&
      failure.error.length > TRANSPORT_NUM.ZERO
        ? failure.error
        : typeof failure?.message === TRANSPORT_TYPEOF.STRING &&
            failure.message.length > TRANSPORT_NUM.ZERO
          ? failure.message
          : ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED;
    const error =
      failure instanceof Error ? failure : new Error(normalizedMessage);
    error.message = normalizedMessage;
    if (
      typeof failure?.errorCode === TRANSPORT_TYPEOF.STRING &&
      failure.errorCode.length > TRANSPORT_NUM.ZERO
    ) {
      error.code = failure.errorCode;
    } else if (
      typeof failure?.code === TRANSPORT_TYPEOF.STRING &&
      failure.code.length > TRANSPORT_NUM.ZERO
    ) {
      error.code = failure.code;
    }
    if (failure?.deferRetry === true) {
      error.deferRetry = true;
    }
    if (Number.isFinite(failure?.retryAfterMs)) {
      error.retryAfterMs = Math.max(
        TRANSPORT_NUM.ZERO,
        Math.floor(failure.retryAfterMs),
      );
    }
    if (failure?.recoverableBeforeSend === true) {
      error.recoverableBeforeSend = true;
    }
    return error;
  }
  resolveQueryTransportDeliveryState(failure) {
    if (failure?.acknowledged === true) {
      return QUERY_TRANSPORT_DELIVERY_STATE.SUCCESS;
    }
    if (failure?.deferRetry === true) {
      return QUERY_TRANSPORT_DELIVERY_STATE.DEFER_RETRY;
    }
    return QUERY_TRANSPORT_DELIVERY_STATE.HARD_FAILURE;
  }
  async normalizeQueryTransportFailure({
    failure,
    targetNodeId,
    targetAddress,
    messageId,
    message,
    correlationId,
  }) {
    const deliveryState = this.resolveQueryTransportDeliveryState(failure);
    if (deliveryState === QUERY_TRANSPORT_DELIVERY_STATE.DEFER_RETRY) {
      return this.buildCanonicalDeferredQueryTransportOutcome(
        messageId,
        correlationId,
        failure,
      );
    }
    const transportError = this.buildQueryTransportFailureError(
      failure,
      targetNodeId,
    );
    const recoverableFailure = await this.resolveRecoverableDeliveryError({
      error: transportError,
      targetNodeId,
      targetAddress,
      messageId,
      payload: message,
      correlationId,
    });
    if (recoverableFailure) {
      return recoverableFailure;
    }
    if (
      deliveryState === QUERY_TRANSPORT_DELIVERY_STATE.HARD_FAILURE &&
      failure instanceof Error
    ) {
      throw failure;
    }
    return failure;
  }
  buildQueryTransportSendOptions(options = {}) {
    const transportDeliveryOptions = {};
    if (
      Number.isFinite(options?.timeoutMs) &&
      options.timeoutMs > TRANSPORT_NUM.ZERO
    ) {
      transportDeliveryOptions.timeoutMs = Math.floor(options.timeoutMs);
    }
    if (
      typeof options?.deliveryPriority === TRANSPORT_TYPEOF.STRING &&
      options.deliveryPriority.length > TRANSPORT_NUM.ZERO
    ) {
      transportDeliveryOptions.deliveryPriority = options.deliveryPriority;
    }
    if (
      typeof options?.deliverySource === TRANSPORT_TYPEOF.STRING &&
      options.deliverySource.length > TRANSPORT_NUM.ZERO
    ) {
      transportDeliveryOptions.deliverySource = options.deliverySource;
    }
    if (Object.keys(transportDeliveryOptions).length === TRANSPORT_NUM.ZERO) {
      return {};
    }
    return {
      transportDeliveryOptions,
    };
  }
  async resolveQueryTransportDeliveryOutcome(
    targetAddress,
    message,
    targetNodeId,
    messageId,
    correlationId,
    queryTransportSelection,
    options = {},
  ) {
    const queryTransport = queryTransportSelection.service;
    if (!queryTransport) {
      return this.buildDeferredQueryTransportOutcome(queryTransportSelection);
    }
    try {
      const queryResult = await queryTransport.sendMessage(
        targetAddress,
        message,
        this.buildQueryTransportSendOptions(options),
      );
      return await this.normalizeQueryTransportFailure({
        failure: queryResult,
        targetNodeId,
        targetAddress,
        messageId,
        message,
        correlationId,
      });
    } catch (error) {
      return this.normalizeQueryTransportFailure({
        failure: error,
        targetNodeId,
        targetAddress,
        messageId,
        message,
        correlationId,
      });
    }
  }
  buildDeliveryOutcomeResult(result) {
    return {
      result,
      queueWaitMs: TRANSPORT_NUM.ZERO,
    };
  }
  async resolveDeliveryOutcome(
    targetAddress,
    message,
    messageId,
    targetNodeId,
    correlationId,
    options,
  ) {
    if (this.isQueryDataPlaneMessage(message)) {
      const queryTransportSelection =
        this.resolveQueryDataPlaneTransportSelection();
      const queryResult = await this.resolveQueryTransportDeliveryOutcome(
        targetAddress,
        message,
        targetNodeId,
        messageId,
        correlationId,
        queryTransportSelection,
        options,
      );
      return this.buildDeliveryOutcomeResult(queryResult);
    }
    if (targetNodeId === this.nodeId) {
      return this.deliverLocal(
        targetAddress,
        messageId,
        message,
        correlationId,
      );
    }
    return this.deliverRemote(
      targetAddress,
      messageId,
      message,
      targetNodeId,
      correlationId,
      options,
    );
  }
  /**
   * Get or create outbound queue for a node.
   * @param {string} nodeId - Target node ID.
   * @return {Object} Queue state.
   * @private
   */
  getOutboundQueue(nodeId) {
    return this.outboundDeliveryRegistryOwner.getOutboundQueue(nodeId);
  }
  /**
   * Check if the outbound queue has immediate capacity for a node.
   * @param {string} nodeId - Target node ID.
   * @return {boolean} True if capacity is available.
   */
  isOutboundQueueAvailable(nodeId) {
    return this.outboundDeliveryRegistryOwner.isOutboundQueueAvailable(nodeId);
  }
  /**
   * Enqueue a delivery for a node with per-node concurrency limits.
   * @param {string} nodeId - Target node ID.
   * @param {Function} deliverFn - Function that returns a Promise result.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  enqueueOutbound(nodeId, deliverFn, options = {}) {
    return this.outboundDeliveryRegistryOwner.enqueue(
      nodeId,
      deliverFn,
      options,
    );
  }
  /**
   * Process queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @private
   */
  processOutboundQueue(nodeId) {
    this.outboundDeliveryRegistryOwner.process(nodeId);
  }
  /**
   * Fail queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to reject with.
   * @private
   */
  failOutboundQueue(nodeId, error) {
    this.outboundDeliveryRegistryOwner.fail(nodeId, error);
  }
  /**
   * Gracefully fail queued outbound deliveries (no rejection).
   * Used during shutdown to avoid unhandled rejections from fire-and-forget tasks.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to return as a failed delivery.
   * @private
   */
  failOutboundQueueGracefully(nodeId, error) {
    this.outboundDeliveryRegistryOwner.failGracefully(nodeId, error);
  }
  /**
   * Fail pending in-flight messages for a node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to reject with.
   * @private
   */
  failPendingMessagesForNode(nodeId, error) {
    for (const [messageId, pending] of this.pendingMessages) {
      if (pending.targetNodeId === nodeId) {
        clearTimeout(pending.timeout);
        this.pendingMessages.delete(messageId);
        pending.reject(error);
      }
    }
  }
  /**
   * Decide whether a transport-deliver metric should be emitted.
   * Emits immediately for faults, slow deliveries, and meaningful
   * queue-depth transitions; samples steady-state successful traffic.
   * @param {string} targetNodeId - Target node ID.
   * @param {number} durationMs - Delivery duration in milliseconds.
   * @param {number} queueDepth - Pending outbound queue depth.
   * @param {boolean} acknowledged - Whether delivery was acknowledged.
   * @return {string|null} Trigger code when metric should be emitted.
   * @private
   */
  getDeliverMetricTrigger(targetNodeId, durationMs, queueDepth, acknowledged) {
    if (!acknowledged) {
      const faultSampleCount =
        (this.deliverMetricFaultSampleByTarget.get(targetNodeId) ||
          TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE;
      this.deliverMetricFaultSampleByTarget.set(targetNodeId, faultSampleCount);
      if (
        faultSampleCount === TRANSPORT_NUM.ONE ||
        faultSampleCount % TRANSPORT_METRIC.DELIVER_FAULT_SAMPLE_EVERY ===
          TRANSPORT_NUM.ZERO
      ) {
        return TRANSPORT_METRIC_TRIGGER.FAULT;
      }
      return null;
    }
    this.deliverMetricFaultSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
    if (durationMs >= TRANSPORT_METRIC.DELIVER_SLOW_THRESHOLD_MS) {
      return TRANSPORT_METRIC_TRIGGER.SLOW;
    }
    const previousQueueDepth =
      this.deliverMetricQueueDepthByTarget.get(targetNodeId) ||
      TRANSPORT_NUM.ZERO;
    if (queueDepth >= TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD) {
      const queueDepthDelta = Math.abs(queueDepth - previousQueueDepth);
      if (
        previousQueueDepth <
          TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD ||
        queueDepthDelta >= TRANSPORT_METRIC.DELIVER_QUEUE_CHANGE_THRESHOLD
      ) {
        return TRANSPORT_METRIC_TRIGGER.BACKPRESSURE;
      }
    } else if (
      previousQueueDepth >=
      TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD
    ) {
      return TRANSPORT_METRIC_TRIGGER.QUEUE_DRAINED;
    }
    const sampleCount =
      (this.deliverMetricSampleByTarget.get(targetNodeId) ||
        TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE;
    this.deliverMetricSampleByTarget.set(targetNodeId, sampleCount);
    if (sampleCount >= TRANSPORT_METRIC.DELIVER_SUCCESS_SAMPLE_EVERY) {
      this.deliverMetricSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
      return TRANSPORT_METRIC_TRIGGER.SAMPLE;
    }
    return null;
  }
  /**
   * Deliver message locally by invoking the registered handler directly,
   * bypassing WebSocket serialization. Falls back to deliverRemote when
   * no handler is registered (e.g. join request/complete special handlers).
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} correlationId - Correlation ID.
   * @return {Promise<Object>} Delivery outcome with result and queueWaitMs.
   * @private
   */
}

export { MessageRouterSegment2 };
