import { MESSAGE_ROUTER_SHARED } from "./message-router-shared.js";
import { MessageRouterSegment2 } from "./message-router-segment-2.js";

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

class MessageRouterSegment3 extends MessageRouterSegment2 {
  async deliverLocal(targetAddress, messageId, payload, correlationId) {
    const handler = this.handlers.get(targetAddress);
    if (!handler) {
      return this.deliverRemote(
        targetAddress,
        messageId,
        payload,
        this.nodeId,
        correlationId,
      );
    }
    const envelope = {
      messageId,
      sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
      sourceNodeId: this.nodeId,
      targetAddress,
      payload,
      timestamp: Date.now(),
    };
    try {
      const result = await Promise.resolve(handler(envelope));
      return {
        result: {
          messageId,
          correlationId,
          acknowledged: true,
          ...(result && typeof result === TRANSPORT_TYPEOF.OBJECT
            ? (() => {
                const {
                  acknowledged: _ack,
                  type: handlerType,
                  ...rest
                } = result;
                const merged = {
                  ...rest,
                };
                if (handlerType) merged.responseType = handlerType;
                return merged;
              })()
            : {}),
        },
        queueWaitMs: TRANSPORT_NUM.ZERO,
      };
    } catch (error) {
      return {
        result: {
          messageId,
          correlationId,
          acknowledged: false,
          error: error.message,
        },
        queueWaitMs: TRANSPORT_NUM.ZERO,
      };
    }
  }
  /**
   * Deliver a message to a target service via WebSocket connections.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @param {Object} options - Delivery options.
   * @param {string} options.targetNodeId - Target node ID (if known).
   * @return {Promise<Object>} Delivery result with transportUsed field when using registry.
   */
  async deliver(targetAddress, message, options = {}) {
    const deliverStartMs = Date.now();
    if (!this.initialized) {
      await this.initialize();
    }
    const deliveryTimeoutMs =
      Number.isFinite(options.timeoutMs) &&
      options.timeoutMs > TRANSPORT_NUM.ZERO
        ? Math.floor(options.timeoutMs)
        : this.messageTimeoutMs;
    const messageId = message.messageId || uuidv4();
    const correlationId = message.correlationId || messageId;
    const requestId = resolveRequestIdFromMessage(message);
    const operationId = resolveOperationIdFromMessage(message);
    const deliverySource = resolveDeliverySource(
      targetAddress,
      message,
      options,
    );
    this.messageCount += TRANSPORT_NUM.ONE;
    let targetNodeId = options.targetNodeId;
    if (!targetNodeId) {
      const parsed = this.parseAddress(targetAddress);
      if (parsed.nodeId) {
        targetNodeId = parsed.nodeId;
      }
    }
    if (!targetNodeId && this.resolveServiceNode) {
      targetNodeId = this.resolveServiceNode(targetAddress);
    }
    if (!targetNodeId) {
      throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(targetAddress));
    }
    const deliveryOutcome = await this.resolveDeliveryOutcome(
      targetAddress,
      message,
      messageId,
      targetNodeId,
      correlationId,
      {
        ...options,
        deliverySource,
        timeoutMs: deliveryTimeoutMs,
      },
    );
    const normalizedOutcome = normalizeDeliveryOutcome(deliveryOutcome);
    const result = normalizedOutcome.result;
    const queueWaitMs = normalizedOutcome.queueWaitMs;
    try {
      const queue = this.outboundQueues.get(targetNodeId);
      const queueDepth = queue ? queue.pending.length : TRANSPORT_NUM.ZERO;
      const queueWaitSummary = buildQueueWaitSummary(queue);
      const durationMs = Date.now() - deliverStartMs;
      const acknowledged = result?.acknowledged === true;
      const trigger = this.getDeliverMetricTrigger(
        targetNodeId,
        durationMs,
        queueDepth,
        acknowledged,
      );
      if (trigger) {
        this.deliverMetricQueueDepthByTarget.set(targetNodeId, queueDepth);
        if (trigger !== TRANSPORT_METRIC_TRIGGER.SAMPLE) {
          this.deliverMetricSampleByTarget.set(
            targetNodeId,
            TRANSPORT_NUM.ZERO,
          );
        }
        this.logger.info(METRICS_LOG_TAG.TRANSPORT_DELIVER, {
          targetNodeId,
          messageId,
          correlationId,
          requestId,
          operationId,
          durationMs,
          messageCount: this.messageCount,
          queueDepth,
          queueWaitMs,
          queueWaitSummary,
          acknowledged,
          trigger,
          error: acknowledged ? null : result?.error || null,
        });
      }
    } catch (_metricsErr) {}
    return result;
  }
  /**
   * Deliver a native Raft packet on an already-open socket so consensus
   * traffic does not contend with the general outbound queue.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Object|null} Direct delivery result when sent, else null.
   * @private
   */
  tryDeliverRaftDirect(targetAddress, messageId, payload, targetNodeId) {
    if (!isRaftPacket(payload)) {
      return null;
    }
    const connection = this.nodeConnections.get(targetNodeId);
    if (
      !connection ||
      connection.state !== ConnectionState.CONNECTED ||
      !connection.ws ||
      connection.ws.readyState !== WebSocket.OPEN
    ) {
      return null;
    }
    const message = {
      type: RouterMessageType.SERVICE_MESSAGE,
      messageId,
      targetAddress,
      sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
      sourceNodeId: this.nodeId,
      payload,
      timestamp: Date.now(),
    };
    this.logger.debug(ROUTER_LOG_MSG.RAFT_DIRECT_DELIVERY, {
      messageId,
      targetAddress,
      targetNodeId,
    });
    try {
      connection.ws.send(JSON.stringify(message));
      return {
        messageId,
        acknowledged: true,
        direct: true,
      };
    } catch (_sendError) {
      return null;
    }
  }
  /**
   * Deliver message to node via WebSocket.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async deliverRemote(
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
    options = {},
  ) {
    const directRaftDelivery = this.tryDeliverRaftDirect(
      targetAddress,
      messageId,
      payload,
      targetNodeId,
    );
    if (directRaftDelivery) {
      return directRaftDelivery;
    }
    const deliveryTimeoutMs =
      Number.isFinite(options.timeoutMs) &&
      options.timeoutMs > TRANSPORT_NUM.ZERO
        ? Math.floor(options.timeoutMs)
        : this.messageTimeoutMs;
    const responsePromise = this.registerPendingResponse(
      messageId,
      targetNodeId,
      {
        deliverySource: resolveDeliverySource(targetAddress, payload, options),
      },
    );
    let earlyResponseError = null;
    responsePromise.catch((error) => {
      earlyResponseError = error;
    });
    let ackResult;
    let queueWaitMs = TRANSPORT_NUM.ZERO;
    try {
      const ackOutcome = await this.enqueueOutbound(
        targetNodeId,
        () => {
          const connection = this.nodeConnections.get(targetNodeId);
          const reconnectInProgress = this.buildReconnectInProgressFailure(
            targetNodeId,
            messageId,
            correlationId,
          );
          if (reconnectInProgress) {
            return reconnectInProgress;
          }
          if (
            (!connection || connection.state !== ConnectionState.CONNECTED) &&
            !this.isShuttingDown
          ) {
            const reconnectAddress =
              this.resolveReconnectAddresses(targetNodeId)[
                TRANSPORT_NUM.ZERO
              ] || null;
            if (reconnectAddress) {
              return this.tryDeliverAfterReconnect(
                reconnectAddress,
                targetAddress,
                messageId,
                payload,
                targetNodeId,
                correlationId,
                deliveryTimeoutMs,
              );
            }
          }
          if (!connection || connection.state !== ConnectionState.CONNECTED) {
            this.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, {
              messageId,
              targetAddress,
              targetNodeId,
              localNodeId: this.nodeId,
              connectionExists: !!connection,
              connectionState: connection?.state,
              availableConnections: Array.from(this.nodeConnections.keys()),
            });
            return this.buildDeferredDeliveryFailure(
              messageId,
              correlationId,
              ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
              {
                errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
                retryAfterMs: this.reconnectIntervalMs,
              },
            );
          }
          return this.sendMessage(
            connection,
            targetAddress,
            messageId,
            payload,
            targetNodeId,
            correlationId,
            deliveryTimeoutMs,
          );
        },
        {
          deliveryPriority: options.deliveryPriority,
          deliverySource: options.deliverySource,
          targetAddress,
          message: payload,
        },
      );
      const normalizedAckOutcome = normalizeDeliveryOutcome(ackOutcome);
      ackResult = normalizedAckOutcome.result;
      queueWaitMs = normalizedAckOutcome.queueWaitMs;
    } catch (error) {
      const deferredFailure = await this.resolveRecoverableDeliveryError({
        error,
        targetNodeId,
        targetAddress,
        messageId,
        payload,
        correlationId,
      });
      if (deferredFailure) {
        this.cancelPendingResponse(messageId, {
          ignoreLateResponse: true,
          retiredReason: RETIRED_PENDING_RESPONSE_REASON.DEFERRED_DELIVERY,
        });
        return {
          result: deferredFailure,
          queueWaitMs: TRANSPORT_NUM.ZERO,
        };
      }
      this.cancelPendingResponse(messageId, {
        ignoreLateResponse: true,
        retiredReason: RETIRED_PENDING_RESPONSE_REASON.CANCELLED,
      });
      if (error?.code === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE) {
        return {
          result: this.buildDeferredDeliveryFailure(
            messageId,
            correlationId,
            error.message,
            {
              errorCode: error.code,
              retryAfterMs: this.reconnectIntervalMs,
            },
          ),
          queueWaitMs: TRANSPORT_NUM.ZERO,
        };
      }
      throw error;
    }
    if (!ackResult?.acknowledged) {
      this.cancelPendingResponse(messageId, {
        ignoreLateResponse: true,
        retiredReason: RETIRED_PENDING_RESPONSE_REASON.ACK_REJECTED,
      });
      return {
        result: ackResult,
        queueWaitMs,
      };
    }
    if (this.hasInlineAckPayload(ackResult)) {
      this.cancelPendingResponse(messageId, {
        ignoreLateResponse: true,
        retiredReason: RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK,
      });
      return {
        result: ackResult,
        queueWaitMs,
      };
    }
    this.armPendingResponseTimeout(messageId, deliveryTimeoutMs);
    try {
      if (earlyResponseError) {
        throw earlyResponseError;
      }
      const serviceResult = await responsePromise;
      return {
        result: {
          messageId,
          correlationId,
          acknowledged: true,
          ...this.normalizeServiceResponseResult(serviceResult),
        },
        queueWaitMs,
      };
    } catch (error) {
      return {
        result: {
          messageId,
          correlationId,
          acknowledged: true,
          error: error.message,
        },
        queueWaitMs,
      };
    }
  }
  /**
   * Resolve a WebSocket address for one target node when delivery needs an
   * on-demand connection recovery.
   * @param {string} targetNodeId
   * @return {string|null}
   * @private
   */
  resolveNodeAddressForDelivery(targetNodeId) {
    return this.connectionAuthorityOwner.resolveNodeAddressForDelivery(
      targetNodeId,
    );
  }
  /**
   * Resolve the current canonical reconnect address for one peer.
   * Authoritative endpoint/cache data wins over historical connection memory.
   * @param {string} targetNodeId
   * @param {string|null} fallbackAddress
   * @return {string|null}
   * @private
   */
  resolveCanonicalReconnectAddress(targetNodeId, fallbackAddress = null) {
    return this.connectionAuthorityOwner.resolveCanonicalReconnectAddress(
      targetNodeId,
      fallbackAddress,
    );
  }
  /**
   * Refresh reconnect ownership to the latest canonical address for a peer.
   * This prevents scheduled reconnects from carrying stale hostnames forward
   * after authoritative endpoint data has changed.
   * @param {Object|null} connectionInfo
   * @param {string|null} fallbackAddress
   * @return {string|null}
   * @private
   */
  refreshReconnectAuthority(connectionInfo, fallbackAddress = null) {
    return this.connectionAuthorityOwner.refreshReconnectAuthority(
      connectionInfo,
      fallbackAddress,
    );
  }
  /**
   * Return true when one peer already owns a reconnect timer.
   * @param {Object|null} connectionInfo
   * @return {boolean}
   * @private
   */
  hasScheduledReconnect(connectionInfo) {
    return Boolean(
      connectionInfo &&
      connectionInfo.state === ConnectionState.RECONNECTING &&
      connectionInfo.reconnectTimeout,
    );
  }
  /**
   * Compute one bounded retry-after hint for an armed reconnect.
   * @param {Object|null} connectionInfo
   * @return {number}
   * @private
   */
  resolveReconnectRetryAfterMs(connectionInfo) {
    const dueAt = connectionInfo?.reconnectDueAt;
    if (!Number.isFinite(dueAt)) {
      return this.reconnectIntervalMs;
    }
    return Math.max(TRANSPORT_NUM.ZERO, Math.ceil(dueAt - Date.now()));
  }
  /**
   * Build one closed-connection error with recovery metadata.
   * @param {string} targetNodeId
   * @param {Object} [options]
   * @param {boolean} [options.beforeSend=false]
   * @param {number} [options.retryAfterMs]
   * @return {Error}
   * @private
   */
  buildConnectionClosedError(targetNodeId, options = {}) {
    const error = new Error(ROUTER_ERROR_MSG.connectionClosed(targetNodeId));
    error.code = ROUTER_CONNECTION_CLOSED_ERROR_CODE;
    error.deferRetry = true;
    error.retryAfterMs = normalizeRetryAfterMs(
      options.retryAfterMs,
      this.reconnectIntervalMs,
    );
    error.recoverableBeforeSend = options.beforeSend === true;
    return error;
  }
  /**
   * Return one deferred outcome when a reconnect timer already owns recovery.
   * @param {string} targetNodeId
   * @param {string} messageId
   * @param {string} correlationId
   * @return {Object|null}
   * @private
   */
  buildReconnectInProgressFailure(targetNodeId, messageId, correlationId) {
    const connection = this.nodeConnections.get(targetNodeId) || null;
    if (!this.hasScheduledReconnect(connection)) {
      return null;
    }
    return this.buildDeferredDeliveryFailure(
      messageId,
      correlationId,
      ROUTER_ERROR_MSG.connectionClosed(targetNodeId),
      {
        errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
        retryAfterMs: this.resolveReconnectRetryAfterMs(connection),
      },
    );
  }
  /**
   * Convert one recoverable transport send failure into a deferred delivery.
   * @param {Object} options
   * @param {Error} options.error
   * @param {string} options.targetNodeId
   * @param {string} options.targetAddress
   * @param {string} options.messageId
   * @param {Object} options.payload
   * @param {string} options.correlationId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveRecoverableDeliveryError({
    error,
    targetNodeId,
    targetAddress,
    messageId,
    payload,
    correlationId,
  }) {
    if (!error || this.isShuttingDown) {
      return null;
    }
    const retryAfterMs = Number.isFinite(error?.retryAfterMs)
      ? Math.max(TRANSPORT_NUM.ZERO, Math.floor(error.retryAfterMs))
      : this.resolveReconnectRetryAfterMs(
          this.nodeConnections.get(targetNodeId) || null,
        );
    if (
      error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE &&
      error.recoverableBeforeSend === true
    ) {
      const reconnectInProgress = this.buildReconnectInProgressFailure(
        targetNodeId,
        messageId,
        correlationId,
      );
      if (reconnectInProgress) {
        return reconnectInProgress;
      }
      const reconnectAddress =
        this.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] ||
        null;
      if (reconnectAddress) {
        try {
          return await this.tryDeliverAfterReconnect(
            reconnectAddress,
            targetAddress,
            messageId,
            payload,
            targetNodeId,
            correlationId,
          );
        } catch (reconnectError) {
          return this.buildDeferredDeliveryFailure(
            messageId,
            correlationId,
            reconnectError?.message ||
              ROUTER_ERROR_MSG.connectionClosed(targetNodeId),
            {
              errorCode:
                reconnectError?.code || ROUTER_CONNECTION_CLOSED_ERROR_CODE,
              retryAfterMs: Number.isFinite(reconnectError?.retryAfterMs)
                ? reconnectError.retryAfterMs
                : retryAfterMs,
            },
          );
        }
      }
    }
    if (
      error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
      error.message === ROUTER_ERROR_MSG.connectionClosed(targetNodeId)
    ) {
      return this.buildDeferredDeliveryFailure(
        messageId,
        correlationId,
        error.message,
        {
          errorCode: error.code || ROUTER_CONNECTION_CLOSED_ERROR_CODE,
          retryAfterMs,
        },
      );
    }
    return null;
  }
  /**
   * Build one suppression key for a reconnect address.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {string|null}
   * @private
   */
  getReconnectAddressSuppressionKey(targetNodeId, address) {
    return this.connectionAuthorityOwner.getReconnectAddressSuppressionKey(
      targetNodeId,
      address,
    );
  }
  /**
   * Remove expired reconnect-address suppressions.
   * @param {number} [nowMs]
   * @return {void}
   * @private
   */
  pruneReconnectAddressSuppressions(nowMs = Date.now()) {
    this.connectionAuthorityOwner.pruneReconnectAddressSuppressions(nowMs);
  }
  /**
   * Return whether one reconnect address is temporarily suppressed.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {boolean}
   * @private
   */
  isReconnectAddressSuppressed(targetNodeId, address) {
    return this.connectionAuthorityOwner.isReconnectAddressSuppressed(
      targetNodeId,
      address,
    );
  }
  /**
   * Temporarily suppress one reconnect address after a fatal DNS failure.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {void}
   * @private
   */
  suppressReconnectAddress(targetNodeId, address) {
    this.connectionAuthorityOwner.suppressReconnectAddress(
      targetNodeId,
      address,
    );
  }
  /**
   * Clear suppression for one reconnect address after a successful dial.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {void}
   * @private
   */
  clearReconnectAddressSuppression(targetNodeId, address) {
    this.connectionAuthorityOwner.clearReconnectAddressSuppression(
      targetNodeId,
      address,
    );
  }
  /**
   * Return whether one reconnect error indicates a stale DNS-owned address.
   * @param {Error|null} error
   * @return {boolean}
   * @private
   */
  shouldSuppressReconnectAddress(error) {
    return this.connectionAuthorityOwner.shouldSuppressReconnectAddress(error);
  }
  /**
   * Resolve ordered reconnect addresses for one target node.
   * Prefer canonical endpoint authority first. Transport-observed addresses
   * remain bounded fallback evidence and must not outrank peer identity.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Array<string>}
   * @private
   */
  resolveReconnectAddresses(targetNodeId, preferredAddress = null) {
    return this.connectionAuthorityOwner.resolveReconnectAddresses(
      targetNodeId,
      preferredAddress,
    );
  }
  /**
   * Ensure one reconnect owner record exists even when the first cold dial
   * fails before a durable socket was established.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Object|null}
   * @private
   */
  ensureReconnectOwnerConnection(targetNodeId, preferredAddress = null) {
    const existing = this.nodeConnections.get(targetNodeId) || null;
    if (existing) {
      this.refreshReconnectAuthority(existing, preferredAddress);
      if (
        typeof preferredAddress === TRANSPORT_TYPEOF.STRING &&
        preferredAddress.length > TRANSPORT_NUM.ZERO
      ) {
        if (
          typeof existing.configuredAddress !== TRANSPORT_TYPEOF.STRING ||
          existing.configuredAddress.length === TRANSPORT_NUM.ZERO
        ) {
          existing.configuredAddress = preferredAddress;
        }
        if (
          typeof existing.address !== TRANSPORT_TYPEOF.STRING ||
          existing.address.length === TRANSPORT_NUM.ZERO
        ) {
          existing.address = preferredAddress;
        }
      }
      return existing;
    }
    if (
      typeof preferredAddress !== TRANSPORT_TYPEOF.STRING ||
      preferredAddress.length === TRANSPORT_NUM.ZERO
    ) {
      return null;
    }
    const canonicalPreferredAddress =
      this.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress) ||
      preferredAddress;
    const connectionInfo = {
      connectionId: uuidv4(),
      nodeId: targetNodeId,
      address: canonicalPreferredAddress,
      configuredAddress: canonicalPreferredAddress,
      observedAddress: null,
      ws: null,
      state: ConnectionState.DISCONNECTED,
      reconnectAttempts: TRANSPORT_NUM.ZERO,
      reconnectTimeout: null,
      reconnectDueAt: null,
      pingInterval: null,
      isIncoming: false,
      isSelfConnection: false,
      ackTimeoutStreak: TRANSPORT_NUM.ZERO,
      lastAckAt: null,
      lastAckTimeoutAt: null,
      retired: false,
      createdAt: Date.now(),
    };
    this.nodeConnections.set(targetNodeId, connectionInfo);
    return connectionInfo;
  }
  /**
   * Arm one reconnect owner after a failed cold dial so subsequent deliveries
   * defer behind the same cooldown instead of redialing immediately.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Object|null}
   * @private
   */
  armReconnectAfterConnectFailure(targetNodeId, preferredAddress = null) {
    const connection = this.ensureReconnectOwnerConnection(
      targetNodeId,
      preferredAddress,
    );
    if (
      !connection ||
      connection.isIncoming === true ||
      connection.isSelfConnection === true ||
      connection.state === ConnectionState.CONNECTED ||
      this.hasScheduledReconnect(connection)
    ) {
      return connection;
    }
    if (
      typeof connection.address !== TRANSPORT_TYPEOF.STRING ||
      connection.address.length === TRANSPORT_NUM.ZERO
    ) {
      return connection;
    }
    connection.state = ConnectionState.DISCONNECTED;
    this.scheduleReconnect(connection);
    return connection;
  }
  /**
   * Ensure a remote node connection exists for delivery recovery.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {Promise<Object|null>}
   * @private
   */
  async ensureNodeConnection(targetNodeId, address) {
    const existing = this.nodeConnections.get(targetNodeId);
    if (existing && existing.state === ConnectionState.CONNECTED) {
      return existing;
    }
    if (this.hasScheduledReconnect(existing)) {
      return null;
    }
    if (this.pendingNodeConnections.has(targetNodeId)) {
      return this.pendingNodeConnections.get(targetNodeId);
    }
    const connectionPromise = (async () => {
      const reconnectAddresses = this.resolveReconnectAddresses(
        targetNodeId,
        address,
      );
      let lastError = null;
      try {
        for (const reconnectAddress of reconnectAddresses) {
          try {
            await this.connectToNode(targetNodeId, reconnectAddress);
            this.clearReconnectAddressSuppression(
              targetNodeId,
              reconnectAddress,
            );
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (this.shouldSuppressReconnectAddress(error)) {
              this.suppressReconnectAddress(targetNodeId, reconnectAddress);
            }
            this.transportPressureMetrics[
              TRANSPORT_PRESSURE_SUMMARY_FIELD.RECONNECT_BEFORE_DELIVERY_FAILURE_COUNT
            ] += TRANSPORT_NUM.ONE;
            this.logger.warn(
              "Failed to reconnect target node before delivery",
              {
                targetNodeId,
                address: reconnectAddress,
                localNodeId: this.nodeId,
                error: error?.message || String(error),
              },
            );
          }
        }
      } finally {
        this.pendingNodeConnections.delete(targetNodeId);
        this.recordPendingNodeConnectionSnapshot();
      }
      this.armReconnectAfterConnectFailure(
        targetNodeId,
        reconnectAddresses[reconnectAddresses.length - TRANSPORT_NUM.ONE] ||
          address,
      );
      const connection = this.nodeConnections.get(targetNodeId) || null;
      if (!connection || connection.state !== ConnectionState.CONNECTED) {
        if (lastError && reconnectAddresses.length === TRANSPORT_NUM.ZERO) {
          this.transportPressureMetrics[
            TRANSPORT_PRESSURE_SUMMARY_FIELD.RECONNECT_BEFORE_DELIVERY_FAILURE_COUNT
          ] += TRANSPORT_NUM.ONE;
          this.logger.warn("Failed to reconnect target node before delivery", {
            targetNodeId,
            address: null,
            localNodeId: this.nodeId,
            error: lastError?.message || String(lastError),
          });
        }
      }
      return connection && connection.state === ConnectionState.CONNECTED
        ? connection
        : null;
    })();
    this.pendingNodeConnections.set(targetNodeId, connectionPromise);
    this.recordPendingNodeConnectionSnapshot();
    return connectionPromise;
  }
  /**
   * Reconnect to one node and retry the send once.
   * @param {string} reconnectAddress
   * @param {string} targetAddress
   * @param {string} messageId
   * @param {Object} payload
   * @param {string} targetNodeId
   * @param {string} correlationId
   * @return {Promise<Object>}
   * @private
   */
  async tryDeliverAfterReconnect(
    reconnectAddress,
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
    timeoutMs = null,
  ) {
    const connection = await this.ensureNodeConnection(
      targetNodeId,
      reconnectAddress,
    );
    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      const reconnectInProgress = this.buildReconnectInProgressFailure(
        targetNodeId,
        messageId,
        correlationId,
      );
      if (reconnectInProgress) {
        return reconnectInProgress;
      }
      this.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, {
        messageId,
        targetAddress,
        targetNodeId,
        localNodeId: this.nodeId,
        connectionExists: !!connection,
        connectionState: connection?.state,
        availableConnections: Array.from(this.nodeConnections.keys()),
        reconnectAddress,
        recoveredViaResolver: true,
      });
      return this.buildDeferredDeliveryFailure(
        messageId,
        correlationId,
        ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
        {
          errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
          retryAfterMs: this.reconnectIntervalMs,
        },
      );
    }
    return this.sendMessage(
      connection,
      targetAddress,
      messageId,
      payload,
      targetNodeId,
      correlationId,
      timeoutMs,
    );
  }
  /**
   * Retire one superseded socket after a bounded grace window.
   * Keeps late ACK / SERVICE_RESPONSE frames from being cut off immediately
   * while still ensuring stale sockets cannot accumulate indefinitely.
   * @param {WebSocket|null} staleWs
   * @return {void}
   * @private
   */
  scheduleRetiredSocketTermination(staleWs) {
    if (
      !staleWs ||
      (typeof staleWs.terminate !== TRANSPORT_TYPEOF.FUNCTION &&
        typeof staleWs.close !== TRANSPORT_TYPEOF.FUNCTION)
    ) {
      return;
    }
    const graceMs = Math.max(this.reconnectIntervalMs, this.messageTimeoutMs);
    const timeout = setTimeout(() => {
      try {
        if (typeof staleWs.terminate === TRANSPORT_TYPEOF.FUNCTION) {
          staleWs.terminate();
        } else if (typeof staleWs.close === TRANSPORT_TYPEOF.FUNCTION) {
          staleWs.close();
        }
      } catch (_closeErr) {}
    }, graceMs);
    if (typeof timeout?.unref === TRANSPORT_TYPEOF.FUNCTION) {
      timeout.unref();
    }
  }
  /**
   * Quarantine one remote connection after an ACK timeout so recovery is
   * owned by a single reconnect state machine instead of cascading socket
   * resets across all callers.
   * @param {string} targetNodeId
   * @param {Object|null} connection
   * @param {string} messageId
   * @param {string} targetAddress
   * @return {Object|null}
   * @private
   */
  quarantineConnectionAfterAckTimeout(
    targetNodeId,
    connection,
    messageId,
    targetAddress,
  ) {
    if (
      !connection ||
      connection.isIncoming === true ||
      connection.isSelfConnection === true
    ) {
      return;
    }
    const activeConnection = this.nodeConnections.get(targetNodeId);
    if (
      !activeConnection ||
      activeConnection.connectionId !== connection.connectionId ||
      activeConnection.state !== ConnectionState.CONNECTED
    ) {
      return activeConnection || null;
    }
    activeConnection.ackTimeoutStreak =
      (activeConnection.ackTimeoutStreak || TRANSPORT_NUM.ZERO) +
      TRANSPORT_NUM.ONE;
    activeConnection.lastAckTimeoutAt = Date.now();
    if (
      activeConnection.ackTimeoutStreak < this.ackTimeoutQuarantineThreshold
    ) {
      this.logger.debug(
        MESSAGE_ROUTER_LITERAL.STRING_OBSERVED_ACK_TIMEOUT_BELOW_QUARANTINE_THRESHOLD,
        {
          messageId,
          targetAddress,
          targetNodeId,
          localNodeId: this.nodeId,
          connectionId: activeConnection.connectionId,
          ackTimeoutStreak: activeConnection.ackTimeoutStreak,
          ackTimeoutQuarantineThreshold: this.ackTimeoutQuarantineThreshold,
        },
      );
      return activeConnection;
    }
    this.logger.warn(
      MESSAGE_ROUTER_LITERAL.STRING_QUARANTINING_TARGET_CONNECTION_AFTER_ACK_TIMEOUT,
      {
        messageId,
        targetAddress,
        targetNodeId,
        localNodeId: this.nodeId,
        connectionId: activeConnection.connectionId,
        ackTimeoutStreak: activeConnection.ackTimeoutStreak,
        ackTimeoutQuarantineThreshold: this.ackTimeoutQuarantineThreshold,
      },
    );
    const staleWs = activeConnection.ws || null;
    const reconnectOwner = {
      connectionId: uuidv4(),
      nodeId: activeConnection.nodeId,
      nodeAddress: activeConnection.nodeAddress,
      address: activeConnection.address,
      configuredAddress:
        activeConnection.configuredAddress || activeConnection.address,
      observedAddress: activeConnection.observedAddress || null,
      ws: null,
      state: ConnectionState.DISCONNECTED,
      reconnectAttempts: activeConnection.reconnectAttempts,
      reconnectTimeout: null,
      reconnectDueAt: null,
      pingInterval: null,
      isIncoming: false,
      isSelfConnection: false,
      ackTimeoutStreak: TRANSPORT_NUM.ZERO,
      lastAckAt: activeConnection.lastAckAt || null,
      lastAckTimeoutAt: activeConnection.lastAckTimeoutAt || null,
      retired: false,
      createdAt: Date.now(),
    };
    this.retireConnection(activeConnection);
    activeConnection.state = ConnectionState.CLOSED;
    this.nodeConnections.set(targetNodeId, reconnectOwner);
    this.scheduleReconnect(reconnectOwner);
    this.scheduleRetiredSocketTermination(staleWs);
    return reconnectOwner;
  }
  /**
   * Build one failed-delivery result that asks upstream owners to defer
   * immediate retries instead of multiplying pressure on the same target.
   * @param {string} messageId
   * @param {string} correlationId
   * @param {string} error
   * @param {Object} options
   * @param {string|null} [options.errorCode]
   * @param {number} [options.retryAfterMs]
   * @return {Object}
   * @private
   */
  buildDeferredDeliveryFailure(messageId, correlationId, error, options = {}) {
    const result = {
      messageId,
      correlationId,
      acknowledged: false,
      error,
      deferRetry: true,
      retryAfterMs: normalizeRetryAfterMs(
        options.retryAfterMs,
        this.reconnectIntervalMs,
      ),
    };
    if (
      typeof options.errorCode === TRANSPORT_TYPEOF.STRING &&
      options.errorCode.length > TRANSPORT_NUM.ZERO
    ) {
      result.errorCode = options.errorCode;
    }
    return result;
  }
  /**
   * Send message through WebSocket connection.
   * @param {Object} connection - Connection info.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @return {Promise<Object>} Send result.
   * @private
   */
  sendMessage(
    connection,
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
    timeoutMs = null,
  ) {
    return new Promise((resolve, reject) => {
      const message = {
        type: RouterMessageType.SERVICE_MESSAGE,
        messageId,
        targetAddress,
        sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
        sourceNodeId: this.nodeId,
        payload,
        timestamp: Date.now(),
      };
      const deliveryTimeoutMs =
        Number.isFinite(timeoutMs) && timeoutMs > TRANSPORT_NUM.ZERO
          ? Math.floor(timeoutMs)
          : this.messageTimeoutMs;
      const failBeforeSend = () => {
        const activeConnection =
          this.nodeConnections.get(targetNodeId) || connection;
        const retryAfterMs =
          this.resolveReconnectRetryAfterMs(activeConnection);
        if (
          activeConnection &&
          activeConnection.isIncoming !== true &&
          activeConnection.isSelfConnection !== true
        ) {
          const staleWs = activeConnection.ws;
          this.handleConnectionClose(
            targetNodeId,
            activeConnection.connectionId,
          );
          try {
            if (typeof staleWs?.terminate === TRANSPORT_TYPEOF.FUNCTION) {
              staleWs.terminate();
            } else if (typeof staleWs?.close === TRANSPORT_TYPEOF.FUNCTION) {
              staleWs.close();
            }
          } catch (_closeErr) {}
        }
        reject(
          this.buildConnectionClosedError(targetNodeId, {
            beforeSend: true,
            retryAfterMs,
          }),
        );
      };
      if (!connection?.ws || connection.ws.readyState !== WebSocket.OPEN) {
        failBeforeSend();
        return;
      }
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        const recoveryOwner = this.quarantineConnectionAfterAckTimeout(
          targetNodeId,
          connection,
          messageId,
          targetAddress,
        );
        resolve(
          this.buildDeferredDeliveryFailure(
            messageId,
            correlationId,
            TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
            {
              errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
              retryAfterMs: this.resolveReconnectRetryAfterMs(
                recoveryOwner || connection,
              ),
            },
          ),
        );
      }, deliveryTimeoutMs);
      this.pendingMessages.set(messageId, {
        messageId,
        resolve,
        reject,
        timeout,
        sentAt: Date.now(),
        targetNodeId,
      });
      try {
        connection.ws.send(JSON.stringify(message));
      } catch (_sendError) {
        clearTimeout(timeout);
        this.pendingMessages.delete(messageId);
        failBeforeSend();
      }
    });
  }
  /**
   * Send raw message through WebSocket.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Message to send.
   * @private
   */
  sendRaw(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  /**
   * Check if a service is registered.
   * @param {string} address - Service address.
   * @return {boolean} True if registered.
   */
  isRegistered(address) {
    return this.handlers.has(address);
  }
  /**
   * Get all registered service addresses.
   * @return {Array<string>} Service addresses.
   */
  getRegisteredAddresses() {
    return Array.from(this.handlers.keys());
  }
  /**
   * Get connection state for a node.
   * @param {string} nodeId - Node ID.
   * @return {string|null} Connection state.
   */
  getConnectionState(nodeId) {
    const connection = this.nodeConnections.get(nodeId);
    return connection ? connection.state : null;
  }
  /**
   * Ping a node to verify it responds within a timeout.
   * @param {string} nodeId - Node ID to ping.
   * @param {number} timeoutMs - Optional timeout override.
   * @return {Promise<boolean>} True if pong received before timeout.
   */
  async pingNode(nodeId, timeoutMs = null) {
    const connection = this.nodeConnections.get(nodeId);
    if (
      !connection ||
      connection.state !== ConnectionState.CONNECTED ||
      !connection.ws
    ) {
      return false;
    }
    const pingId = uuidv4();
    const timeout = timeoutMs ?? this.pingTimeoutMs;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPings.delete(pingId);
        resolve(false);
      }, timeout);
      this.pendingPings.set(pingId, {
        resolve,
        timeout: timer,
      });
      this.sendRaw(connection.ws, {
        type: RouterMessageType.PING,
        pingId,
        timestamp: Date.now(),
      });
    });
  }
  /**
   * Get all connected node IDs.
   * @return {Array<string>} Connected node IDs.
   */
  getConnectedNodes() {
    const connected = [];
    for (const [_nodeId, connection] of this.nodeConnections) {
      if (connection.state === ConnectionState.CONNECTED && connection.nodeId) {
        connected.push(connection.nodeId);
      }
    }
    return connected;
  }
  /**
   * Check if self-connection is established.
   * @return {boolean} True if self-connection exists and is connected.
   */
  hasSelfConnection() {
    const connection = this.nodeConnections.get(this.nodeId);
    return (
      connection &&
      connection.isSelfConnection &&
      connection.state === ConnectionState.CONNECTED
    );
  }
  /**
   * Get router statistics.
   * @return {Object} Router stats.
   */
}

export { MessageRouterSegment3 };
