import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {createMessageRouterConnectionLifecycleMethods} from './message-router-connection-lifecycle-methods.js';

const {
  ConfigurationManager,
  ConnectionState,
  EventEmitter,
  HOST,
  INCOMING_CONNECTION_ADOPTION,
  INPROC,
  IPV6_ANY_HOST,
  IPV6_HOST_PREFIX,
  IPV6_HOST_SUFFIX,
  LoggingService,
  MESSAGE_ROUTER_LITERAL,
  OutboundDeliveryRegistryOwner,
  RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  RouterConnectionAuthorityOwner,
  RouterMessageType,
  SERVICE_RESPONSE_DISPOSITION_KIND,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
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
  createInProcWebSocketPair,
  normalizeToWebSocketAddress,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

class MessageRouterSegment1 extends EventEmitter {
  constructor(options = {}) {
    super();
    const nodeWsPort = options.wsPort || TRANSPORT_DEFAULT.WS_PORT;
    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress =
      options.nodeAddress ||
      TRANSPORT_FORMAT.buildDefaultNodeAddress(nodeWsPort);
    this.advertisedAddress =
      options.advertisedAddress ||
      normalizeToWebSocketAddress(this.nodeAddress) ||
      this.nodeAddress;
    this.wsPort = options.wsPort || null;
    this.routerId = uuidv4();
    this.identifyPayload = options.identifyPayload || null;
    this.handlers = /* @__PURE__ */ new Map();
    this.inProcess = options.inProcess === true;
    this.nodeConnections = /* @__PURE__ */ new Map();
    this.pendingMessages = /* @__PURE__ */ new Map();
    this.pendingResponses = /* @__PURE__ */ new Map();
    this.retiredPendingResponses = /* @__PURE__ */ new Map();
    this.pendingPings = /* @__PURE__ */ new Map();
    const config = ConfigurationManager.getInstance();
    const configuredWsHost = config.get(TRANSPORT_CONFIG_KEY.WS_HOST);
    this.wsHost =
      options.wsHost ||
      (typeof configuredWsHost === TRANSPORT_TYPEOF.STRING &&
      configuredWsHost.length > TRANSPORT_NUM.ZERO ?
        configuredWsHost :
        TRANSPORT_DEFAULT.WS_HOST);
    this.messageTimeoutMs =
      config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) ||
      TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
    this.ackTimeoutQuarantineThreshold =
      Number.isFinite(options.ackTimeoutQuarantineThreshold) &&
      options.ackTimeoutQuarantineThreshold >= TRANSPORT_NUM.ONE ?
        Math.floor(options.ackTimeoutQuarantineThreshold) :
        Number.isFinite(
          config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD),
        ) &&
            config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD) >=
              TRANSPORT_NUM.ONE ?
          Math.floor(
            config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD),
          ) :
          TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_THRESHOLD;
    const configuredConnectTimeoutMs = config.get(
      WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY,
    );
    this.connectTimeoutMs =
      Number.isFinite(options.connectTimeoutMs) &&
      options.connectTimeoutMs > TRANSPORT_NUM.ZERO ?
        Math.floor(options.connectTimeoutMs) :
        Number.isFinite(configuredConnectTimeoutMs) &&
            configuredConnectTimeoutMs > TRANSPORT_NUM.ZERO ?
          Math.floor(configuredConnectTimeoutMs) :
          this.messageTimeoutMs;
    this.pingTimeoutMs =
      config.get(TRANSPORT_CONFIG_KEY.PING_TIMEOUT_MS) ||
      TRANSPORT_DEFAULT.PING_TIMEOUT_MS;
    this.reconnectIntervalMs =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) ||
      TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS;
    this.reconnectMaxAttempts =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) ||
      TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS;
    this.pingIntervalMs =
      config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) ||
      TRANSPORT_DEFAULT.PING_INTERVAL_MS;
    this.reconnectBackoffMultiplier =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) ||
      TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER;
    const configuredMaxConcurrent =
      Number.isFinite(options.outboundQueueMaxConcurrent) &&
      options.outboundQueueMaxConcurrent > TRANSPORT_NUM.ZERO ?
        options.outboundQueueMaxConcurrent :
        config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_MAX_CONCURRENT);
    this.outboundQueueMaxConcurrent =
      Number.isFinite(configuredMaxConcurrent) &&
      configuredMaxConcurrent > TRANSPORT_NUM.ZERO ?
        Math.floor(configuredMaxConcurrent) :
        TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CONCURRENCY;
    const configuredMaxPending =
      Number.isFinite(options.outboundQueueMaxPending) &&
      options.outboundQueueMaxPending >= TRANSPORT_NUM.ZERO ?
        options.outboundQueueMaxPending :
        config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_MAX_PENDING);
    this.outboundQueueMaxPending =
      Number.isFinite(configuredMaxPending) &&
      configuredMaxPending >= TRANSPORT_NUM.ZERO ?
        Math.floor(configuredMaxPending) :
        TRANSPORT_DEFAULT.OUTBOUND_QUEUE_MAX_PENDING;
    const configuredCriticalReserve =
      Number.isFinite(options.outboundQueueCriticalReserve) &&
      options.outboundQueueCriticalReserve >= TRANSPORT_NUM.ZERO ?
        options.outboundQueueCriticalReserve :
        config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_CRITICAL_RESERVE);
    const maxCriticalReserve = Math.max(
      TRANSPORT_NUM.ZERO,
      this.outboundQueueMaxPending - TRANSPORT_NUM.ONE,
    );
    this.outboundQueueCriticalReserve =
      Number.isFinite(configuredCriticalReserve) &&
      configuredCriticalReserve >= TRANSPORT_NUM.ZERO ?
        Math.min(Math.floor(configuredCriticalReserve), maxCriticalReserve) :
        Math.min(
          TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CRITICAL_RESERVE,
          maxCriticalReserve,
        );
    const configuredReadinessReserve =
      Number.isFinite(options.outboundQueueReadinessReserve) &&
      options.outboundQueueReadinessReserve >= TRANSPORT_NUM.ZERO ?
        options.outboundQueueReadinessReserve :
        config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_READINESS_RESERVE);
    const maxReadinessReserve = Math.max(
      TRANSPORT_NUM.ZERO,
      this.outboundQueueMaxPending - TRANSPORT_NUM.ONE,
    );
    this.outboundQueueReadinessReserve =
      Number.isFinite(configuredReadinessReserve) &&
      configuredReadinessReserve >= TRANSPORT_NUM.ZERO ?
        Math.min(Math.floor(configuredReadinessReserve), maxReadinessReserve) :
        Math.min(
          TRANSPORT_DEFAULT.OUTBOUND_QUEUE_READINESS_RESERVE,
          maxReadinessReserve,
        );
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.ROUTER) :
      console;
    this.nowFn =
      typeof options.nowFn === MESSAGE_ROUTER_LITERAL.STRING_FUNCTION ?
        options.nowFn :
        Date.now;
    this.unmatchedServiceResponseWarnIntervalMs =
      Number.isFinite(options.unmatchedServiceResponseWarnIntervalMs) &&
      options.unmatchedServiceResponseWarnIntervalMs >= TRANSPORT_NUM.ZERO ?
        Math.floor(options.unmatchedServiceResponseWarnIntervalMs) :
        UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS;
    this.lastUnmatchedServiceResponseWarnAtMs = null;
    this.unmatchedServiceResponseWarnSuppressedCount = TRANSPORT_NUM.ZERO;
    this.serviceResponseDispositionCounts = /* @__PURE__ */ new Map();
    this.initialized = false;
    this.server = null;
    this.messageCount = TRANSPORT_NUM.ZERO;
    this.isShuttingDown = false;
    this.inProcessTransport = false;
    this.externalAdmissionEnabled = options.externalAdmissionEnabled !== false;
    this.outboundQueues = /* @__PURE__ */ new Map();
    this.deliverMetricSampleByTarget = /* @__PURE__ */ new Map();
    this.deliverMetricFaultSampleByTarget = /* @__PURE__ */ new Map();
    this.deliverMetricQueueDepthByTarget = /* @__PURE__ */ new Map();
    this.resolveServiceNode = options.resolveServiceNode || null;
    this.resolveNodeAddress = options.resolveNodeAddress || null;
    this.resolveQueryMessageGroupService =
      options.resolveQueryMessageGroupService || null;
    this.pendingNodeConnections = /* @__PURE__ */ new Map();
    this.transportPressureMetrics = {
      reconnectBeforeDeliveryFailureCount: TRANSPORT_NUM.ZERO,
      maxObservedPendingNodeConnectionCount: TRANSPORT_NUM.ZERO,
    };
    this.reconnectAddressSuppressionMs =
      Number.isFinite(options.reconnectAddressSuppressionMs) &&
      options.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO ?
        Math.floor(options.reconnectAddressSuppressionMs) :
        RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS;
    this.suppressedReconnectAddresses = /* @__PURE__ */ new Map();
    this.connectionAuthorityOwner = new RouterConnectionAuthorityOwner(this);
    this.outboundDeliveryRegistryOwner = new OutboundDeliveryRegistryOwner(
      this,
    );
  }
  recordPendingNodeConnectionSnapshot() {
    this.transportPressureMetrics[
      TRANSPORT_PRESSURE_SUMMARY_FIELD.MAX_OBSERVED_PENDING_NODE_CONNECTION_COUNT
    ] = Math.max(
      this.transportPressureMetrics[
        TRANSPORT_PRESSURE_SUMMARY_FIELD
          .MAX_OBSERVED_PENDING_NODE_CONNECTION_COUNT
      ],
      this.pendingNodeConnections.size,
    );
  }
  /**
   * Set optional payload to include with IDENTIFY messages.
   * @param {Object|null} payload - Additional identify payload.
   */
  setIdentificationPayload(payload) {
    this.identifyPayload = payload || null;
  }
  /**
   * Toggle whether remote incoming node connections are admitted.
   * Self-connection remains allowed so local routing can initialize
   * before bootstrap/join ownership opens external transport.
   * @param {boolean} enabled
   * @return {void}
   */
  setExternalAdmissionEnabled(enabled) {
    this.externalAdmissionEnabled = enabled !== false;
  }
  /**
   * Return whether remote incoming node connections are currently admitted.
   * @return {boolean}
   */
  isExternalAdmissionEnabled() {
    return this.externalAdmissionEnabled === true;
  }
  /**
   * Initialize the message router.
   * Starts WebSocket server and establishes self-connection for uniform routing.
   * Requirements: 2.2, 8.2
   * @param {Object} options - Initialization options.
   * @param {boolean} options.startServer - Whether to start WebSocket server.
   * @return {Promise<void>}
   */
  async initialize(options = {}) {
    const shouldStartServer = options.startServer === true && this.wsPort;
    if (this.initialized) {
      let startedServerNow = false;
      if (shouldStartServer && !this.server) {
        await this.startServer();
        startedServerNow = true;
      }
      if (shouldStartServer && !this.hasSelfConnection()) {
        try {
          await this.connectToSelf();
        } catch (error) {
          if (startedServerNow && this.server) {
            await new Promise((resolve) => this.server.close(resolve));
            this.server = null;
          }
          throw new Error(ROUTER_ERROR_MSG.selfConnectionFailed(error.message));
        }
      }
      return;
    }
    this.isShuttingDown = false;
    this.logger.info(ROUTER_LOG_MSG.INITIALIZING, {
      routerId: this.routerId,
      nodeId: this.nodeId,
      wsPort: this.wsPort,
      wsHost: this.wsHost,
    });
    if (shouldStartServer) {
      await this.startServer();
      try {
        await this.connectToSelf();
      } catch (error) {
        this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_FAILED, {
          error: error.message,
          nodeId: this.nodeId,
        });
        if (this.server) {
          await new Promise((resolve) => this.server.close(resolve));
          this.server = null;
        }
        throw new Error(ROUTER_ERROR_MSG.selfConnectionFailed(error.message));
      }
    }
    this.initialized = true;
    this.emit(TRANSPORT_EVENT.INITIALIZED, {
      routerId: this.routerId,
      nodeId: this.nodeId,
    });
  }
  /**
   * Start WebSocket server to accept incoming connections.
   * @return {Promise<void>}
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const rejectOnce = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      try {
        if (this.inProcess) {
          this.startInProcessServer();
          resolveOnce();
          return;
        }
        const serverOptions = {
          port: this.wsPort,
        };
        if (this.wsHost) {
          serverOptions.host = this.wsHost;
        }
        const wsServer = new WebSocketServer(serverOptions);
        this.server = wsServer;
        wsServer.on(TRANSPORT_EVENT.CONNECTION, (ws, req) => {
          this.handleIncomingConnection(ws, req);
        });
        wsServer.on(TRANSPORT_EVENT.LISTENING, () => {
          this.logger.info(ROUTER_LOG_MSG.WS_SERVER_LISTENING, {
            port: this.wsPort,
            routerId: this.routerId,
          });
          resolveOnce();
        });
        wsServer.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(ROUTER_LOG_MSG.WS_SERVER_ERROR, {
            error: error.message,
            routerId: this.routerId,
          });
          rejectOnce(error);
        });
      } catch (error) {
        rejectOnce(error);
      }
    });
  }
  /**
   * Start an in-process "server" registered by port for test-only transport.
   * @private
   */
  startInProcessServer() {
    const portKey = Number(this.wsPort);
    if (!Number.isFinite(portKey)) {
      throw new Error(
        MESSAGE_ROUTER_LITERAL.STRING_INVALID_WSPORT_FOR_IN_PROCESS_SERVER,
      );
    }
    if (INPROC.serversByPort.has(portKey)) {
      const err = new Error(
        `listen EADDRINUSE: address already in use 127.0.0.1:${portKey}`,
      );
      err.code = MESSAGE_ROUTER_LITERAL.STRING_EADDRINUSE;
      throw err;
    }
    this.inProcessTransport = true;
    INPROC.serversByPort.set(portKey, {
      router: this,
      nodeId: this.nodeId,
    });
    this.server = {
      clients: /* @__PURE__ */ new Set(),
      close: (cb) => {
        INPROC.serversByPort.delete(portKey);
        cb?.();
      },
    };
    this.logger.info(ROUTER_LOG_MSG.WS_SERVER_LISTENING, {
      port: this.wsPort,
      routerId: this.routerId,
    });
  }
  /**
   * Handle incoming WebSocket connection from another node.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} _req - HTTP request.
   * @private
   */
  handleIncomingConnection(ws, _req) {
    const connectionId = uuidv4();
    const connectionInfo = {
      connectionId,
      ws,
      state: ConnectionState.CONNECTED,
      nodeId: null,
      isIncoming: true,
      retired: false,
      createdAt: Date.now(),
    };
    this.logger.debug(ROUTER_LOG_MSG.INCOMING_CONNECTION, {
      connectionId,
      routerId: this.routerId,
    });
    ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(connectionInfo.nodeId || connectionId, ws, data);
    });
    ws.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleConnectionClose(
        connectionInfo.nodeId || connectionId,
        connectionInfo.connectionId,
      );
    });
    ws.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ROUTER_LOG_MSG.WS_CONNECTION_ERROR, {
        connectionId,
        error: error.message,
      });
    });
    this.nodeConnections.set(connectionId, connectionInfo);
    this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
      connectionId,
      incoming: true,
    });
  }
  /**
   * Connect to self via loopback.
   * This enables uniform routing for all messages - local and remote use the same path.
   * Requirements: 2.1, 2.4
   * @return {Promise<void>}
   */
  async connectToSelf() {
    const selfAddress = this.buildSelfConnectionAddress();
    this.logger.debug(ROUTER_LOG_MSG.SELF_CONNECTION_START, {
      nodeId: this.nodeId,
      address: selfAddress,
    });
    await this.connectToNode(this.nodeId, selfAddress, {
      isSelfConnection: true,
    });
  }
  /**
   * Handle incoming message from WebSocket.
   * @param {string} connectionId - Connection or node ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(connectionId, ws, data) {
    try {
      const message = JSON.parse(data.toString());
      this.logger.debug(ROUTER_LOG_MSG.MESSAGE_RECEIVED, {
        connectionId,
        type: message.type,
        messageId: message.messageId,
      });
      if (message.type === RouterMessageType.IDENTIFY) {
        this.handleIdentification(connectionId, ws, message);
        return;
      }
      if (message.type === RouterMessageType.PING) {
        this.sendRaw(ws, {
          type: RouterMessageType.PONG,
          pingId: message.pingId || null,
          timestamp: Date.now(),
        });
        return;
      }
      if (message.type === RouterMessageType.PONG) {
        if (message.pingId && this.pendingPings.has(message.pingId)) {
          const pending = this.pendingPings.get(message.pingId);
          clearTimeout(pending.timeout);
          this.pendingPings.delete(message.pingId);
          pending.resolve(true);
        }
        return;
      }
      if (message.type === RouterMessageType.ACK) {
        this.handleAcknowledgment(message);
        return;
      }
      if (message.type === RouterMessageType.SERVICE_RESPONSE) {
        this.handleServiceResponse(message);
        return;
      }
      if (message.type === RouterMessageType.SERVICE_MESSAGE) {
        this.handleServiceMessage(ws, message);
        return;
      }
      this.logger.warn(ROUTER_LOG_MSG.MESSAGE_UNKNOWN, {
        type: message.type,
        connectionId,
      });
    } catch (error) {
      this.logger.error(ROUTER_LOG_MSG.MESSAGE_PARSE_FAILED, {
        connectionId,
        error: error.message,
      });
      throw error;
    }
  }
  /**
   * Handle identification message from remote node.
   * @param {string} connectionId - Connection ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Identification message.
   * @private
   */
  handleIdentification(connectionId, ws, message) {
    const nodeId = message?.nodeId;
    const nodeAddress = message?.nodeAddress || message?.address;
    if (!nodeId || !nodeAddress) {
      this.logger.warn(ROUTER_LOG_MSG.IDENTIFICATION_MISSING_FIELDS, {
        connectionId,
        hasNodeId: !!nodeId,
        hasNodeAddress: !!nodeAddress,
      });
      try {
        ws.close();
      } catch (error) {
        this.logger.warn(ROUTER_LOG_MSG.FAILED_CLOSE_UNIDENTIFIED, {
          connectionId,
          error: error.message,
        });
        throw error;
      }
      return;
    }
    this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_RECEIVED, {
      connectionId,
      remoteNodeId: nodeId,
      remoteNodeAddress: nodeAddress,
      localNodeId: this.nodeId,
      existingConnectionForNode: this.nodeConnections.has(nodeId),
    });
    const connection = this.nodeConnections.get(connectionId);
    if (connection && connection.isIncoming) {
      if (!this.externalAdmissionEnabled && nodeId !== this.nodeId) {
        connection.state = ConnectionState.CLOSED;
        this.retireConnection(connection);
        this.nodeConnections.delete(connectionId);
        this.logger.info(
          MESSAGE_ROUTER_LITERAL.STRING_REJECTING_INCOMING_CONNECTION_WHILE_EXTERNAL_ADMISSION_IS_CLOSED,
          {
            connectionId,
            remoteNodeId: nodeId,
            localNodeId: this.nodeId,
          },
        );
        try {
          ws.close();
        } catch (error) {
          this.logger.warn(ROUTER_LOG_MSG.FAILED_CLOSE_UNIDENTIFIED, {
            connectionId,
            error: error.message,
          });
        }
        return;
      }
      const normalizedAddress =
        normalizeToWebSocketAddress(nodeAddress) || nodeAddress;
      connection.nodeId = nodeId;
      connection.nodeAddress = normalizedAddress;
      connection.configuredAddress = normalizedAddress;
      this.rememberReconnectAddress(connection, ws, normalizedAddress);
      const adoptionDecision =
        this.connectionAuthorityOwner.resolveIncomingConnectionAdoption(nodeId);
      const existing = adoptionDecision.existing;
      if (
        adoptionDecision.state ===
        INCOMING_CONNECTION_ADOPTION.KEEP_SELF_CONNECTION
      ) {
        this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, {
          connectionId,
          nodeId,
          reason: ROUTER_LOG_MSG.SELF_CONNECTION_ALREADY_REGISTERED,
        });
      } else if (
        adoptionDecision.state === INCOMING_CONNECTION_ADOPTION.ADOPT_INCOMING
      ) {
        if (existing && existing.ws && existing.connectionId !== connectionId) {
          this.retireConnection(existing);
          try {
            existing.ws.terminate();
          } catch (error) {
            this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {
              nodeId,
              error: error.message,
            });
          }
        }
        if (existing && this.nodeConnections.get(nodeId) === existing) {
          this.nodeConnections.delete(nodeId);
        }
        this.nodeConnections.delete(connectionId);
        this.nodeConnections.set(nodeId, connection);
        this.logger.info(ROUTER_LOG_MSG.REKEYED_CONNECTION, {
          oldKey: connectionId,
          newKey: nodeId,
          localNodeId: this.nodeId,
        });
      } else {
        this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, {
          connectionId,
          nodeId,
          reason: MESSAGE_ROUTER_LITERAL.STRING_EXISTING_CONNECTION_PREFERRED,
        });
        this.retireConnection(connection);
        this.nodeConnections.delete(connectionId);
        try {
          ws.terminate();
        } catch (error) {
          this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {
            nodeId,
            error: error.message,
          });
        }
      }
    }
    this.emit(TRANSPORT_EVENT.NODE_CONNECTED, {
      nodeId,
      nodeAddress,
      connectionId,
    });
    this.emit(TRANSPORT_EVENT.NODE_IDENTIFIED, {
      nodeId,
      nodeAddress,
      connectionId,
    });
  }
  /**
   * Handle service message from remote node.
   * Sends ACK immediately to release sender-side queue pressure, then
   * resolves the handler asynchronously via SERVICE_RESPONSE.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Service message.
   * @private
   */
  handleServiceMessage(ws, message) {
    const {targetAddress, messageId, payload} = message;
    this.logger.debug(ROUTER_LOG_MSG.SERVICE_MESSAGE_HANDLING, {
      messageId,
      targetAddress,
      sourceNodeId: message.sourceNodeId,
      registeredHandlers: Array.from(this.handlers.keys()),
      hasHandler: this.handlers.has(targetAddress),
    });
    this.sendRaw(ws, {
      type: RouterMessageType.ACK,
      messageId,
      acknowledged: true,
    });
    const handler = this.handlers.get(targetAddress);
    if (!handler) {
      this.emit(TRANSPORT_EVENT.MESSAGE, {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });
      this.sendRaw(ws, {
        type: RouterMessageType.SERVICE_RESPONSE,
        messageId,
        sourceAddress: message.sourceAddress,
        result: {
          noHandler: true,
          error: ROUTER_ERROR_MSG.noHandlerForAddress(targetAddress),
        },
      });
      return;
    }
    const envelope = {
      messageId,
      sourceAddress: message.sourceAddress,
      sourceNodeId: message.sourceNodeId,
      targetAddress,
      payload,
      timestamp: message.timestamp,
    };
    Promise.resolve()
      .then(() => handler(envelope))
      .then((result) => {
        this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_SENT, {
          messageId,
          targetAddress,
        });
        this.sendRaw(ws, {
          type: RouterMessageType.SERVICE_RESPONSE,
          messageId,
          sourceAddress: message.sourceAddress,
          result,
        });
      })
      .catch((error) => {
        this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_ERROR, {
          messageId,
          targetAddress,
          error: error.message,
        });
        this.sendRaw(ws, {
          type: RouterMessageType.SERVICE_RESPONSE,
          messageId,
          sourceAddress: message.sourceAddress,
          error: error.message,
        });
      });
  }
  /**
   * Handle SERVICE_RESPONSE message and settle pending response waiters.
   * @param {Object} message - Service response message.
   * @private
   */
  handleServiceResponse(message) {
    const {messageId, result, error} = message;
    this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_RECEIVED, {
      messageId,
      hasError: Boolean(error),
    });
    const disposition = this.resolveServiceResponseDisposition(messageId, {
      result,
      error,
    });
    this.recordServiceResponseDisposition(disposition);
    if (disposition.kind === SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED) {
      return;
    }
    if (disposition.absorbed === true) {
      this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, {
        messageId,
        ignoredRetiredPending: true,
        unmatchedClassification: disposition.classification,
        retiredReason: disposition.retiredReason,
        deliverySource: disposition.deliverySource,
        targetNodeId: disposition.targetNodeId,
      });
      return;
    }
    this.logUnmatchedServiceResponse(disposition);
  }
  /**
   * Rate-limit unmatched service-response warnings so response storms do not
   * bury the underlying transport/control-plane failure that caused them.
   * @param {Object} unmatchedResponseClassification
   * @return {void}
   * @private
   */
}

Object.defineProperties(MessageRouterSegment1.prototype, createMessageRouterConnectionLifecycleMethods());

export {MessageRouterSegment1};
