import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {
  MESSAGE_ROUTER_DELIVERY_PRESSURE_ROUTING_METHODS,
} from './message-router-delivery-pressure-routing.js';
import {MessageRouterSegment1} from './message-router-segment-1.js';
import {applyBoundedJitter} from '../utils/retry-jitter.js';

const LOCAL_NUM_ZERO = 0;

const {
  CONNECTION_CLOSE_DISPOSITION,
  ConnectionState,
  INLINE_ACK_PASSTHROUGH_KEYS,
  MESSAGE_ROUTER_LITERAL,
  RECONNECT_DISPOSITION,
  RETIRED_PENDING_RESPONSE_REASON,
  ROUTER_ADDRESS,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_VALID_ENTITY_TYPES,
  RouterMessageType,
  SERVICE_RESPONSE_DISPOSITION_KIND,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  WebSocket,
  buildRetiredPendingClassification,
  buildServiceResponseDisposition,
  normalizeIdentifier,
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
    this.lastUnmatchedServiceResponseWarnAtMs = Number.isFinite(nowMs) ?
      nowMs :
      null;
    const context = {
      messageId,
      unmatchedClassification:
        unmatchedResponseClassification?.classification || 'orphaned',
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
      normalizeIdentifier(disposition?.classification) || 'orphaned';
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
    const effectiveNowMs = Number.isFinite(nowMs) ?
      nowMs :
      Number(this.nowFn());
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
        reason.length > TRANSPORT_NUM.ZERO ?
          reason :
          RETIRED_PENDING_RESPONSE_REASON.UNKNOWN,
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
  settlePendingResponse(messageId, {result, error}) {
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
    const {acknowledged: _ack, type: handlerType, ...rest} = result;
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
    const {messageId, acknowledged, error, type: _type, ...rest} = message;
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
          this.ownerCircuitBreaker?.recordSuccess?.(pending.targetNodeId);
        }
        const resolved = {
          messageId,
          acknowledged: true,
          ...rest,
        };
        if (error !== void LOCAL_NUM_ZERO) {
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
        if (connection.isIncoming === true) {
          // A re-established connection is an outbound dial to the peer's
          // remembered address, so this record is now an outbound reconnect
          // owner rather than an inbound connection.
          connection.isIncoming = false;
        }
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
    } else if (connection.address) {
      // Schedule a reconnect on close for any non-self peer with a remembered
      // dial address — including a closed INBOUND connection. Otherwise an
      // inbound-only record (e.g. after a rolling restart) closes into a
      // lingering DISCONNECTED state with no reconnect, control-plane handoffs
      // to that node time out forever, and publication never drains. The
      // deterministic resolveIncomingConnectionAdoption tie-break dedups if the
      // peer also dials in.
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
    const delay = applyBoundedJitter(
      this.reconnectIntervalMs *
        Math.pow(
          this.reconnectBackoffMultiplier,
          connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE,
        ),
    );
    connectionInfo.reconnectDueAt = Date.now() + delay;
    this.logger.debug(ROUTER_LOG_MSG.SCHEDULING_RECONNECT, {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });
    connectionInfo.reconnectTimeout = setTimeout(() => {
      connectionInfo.reconnectTimeout = null;
      connectionInfo.reconnectDueAt = null;
      if (connectionInfo.retired || !this.isCurrentConnection(connectionInfo)) {
        this.retireConnection(connectionInfo);
        connectionInfo.state = ConnectionState.CLOSED;
        return;
      }
      const connectionPromise = (async () => {
        try {
          this.refreshReconnectAuthority(
            connectionInfo,
            connectionInfo.address || connectionInfo.configuredAddress,
          );
          if ((!connectionInfo.address || connectionInfo.address.length === TRANSPORT_NUM.ZERO) &&
              typeof connectionInfo.configuredAddress === TRANSPORT_TYPEOF.STRING &&
              connectionInfo.configuredAddress.length > TRANSPORT_NUM.ZERO) {
            connectionInfo.address = connectionInfo.configuredAddress;
          }
          await this.establishConnection(connectionInfo);
          return connectionInfo.state === ConnectionState.CONNECTED ? connectionInfo : null;
        } catch (error) {
          this.logger.error(ROUTER_LOG_MSG.RECONNECT_FAILED, {
            nodeId: connectionInfo.nodeId,
            error: error.message,
          });
          if (this.isShuttingDown) {
            return null;
          }
          this.scheduleReconnect(connectionInfo);
          return null;
        } finally {
          this.pendingNodeConnections.delete(connectionInfo.nodeId);
          this.recordPendingNodeConnectionSnapshot();
        }
      })();
      this.pendingNodeConnections.set(connectionInfo.nodeId, connectionPromise);
      this.recordPendingNodeConnectionSnapshot();
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

Object.defineProperties(
  MessageRouterSegment2.prototype,
  Object.fromEntries(
    Object.entries(MESSAGE_ROUTER_DELIVERY_PRESSURE_ROUTING_METHODS).map(
      ([name, value]) => [
        name,
        {
          value,
          configurable: true,
          writable: true,
        },
      ],
    ),
  ),
);

export {MessageRouterSegment2};
