import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

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
   * Build WebSocket address for self-connection.
   * Uses bound server address when available to avoid localhost DNS family mismatch.
   * @return {string}
   * @private
   */
  buildSelfConnectionAddress() {
    const host = this.resolveSelfConnectionHost();
    const normalizedHost = this.normalizeWebSocketHost(host);
    return TRANSPORT_FORMAT.buildWebSocketAddress(normalizedHost, this.wsPort);
  }
  /**
   * Resolve host used for self-connection.
   * @return {string}
   * @private
   */
  resolveSelfConnectionHost() {
    const configuredHost = this.wsHost || TRANSPORT_DEFAULT.WS_HOST;
    const defaultHost =
      configuredHost === HOST.ANY || configuredHost === IPV6_ANY_HOST ?
        HOST.LOCALHOST :
        configuredHost;
    if (
      !this.server ||
      typeof this.server.address !== TRANSPORT_TYPEOF.FUNCTION
    ) {
      return defaultHost;
    }
    const serverAddress = this.server.address();
    if (!serverAddress || typeof serverAddress !== TRANSPORT_TYPEOF.OBJECT) {
      return defaultHost;
    }
    const boundHost = serverAddress.address;
    if (
      typeof boundHost !== TRANSPORT_TYPEOF.STRING ||
      boundHost.length === TRANSPORT_NUM.ZERO
    ) {
      return defaultHost;
    }
    if (boundHost === HOST.ANY || boundHost === IPV6_ANY_HOST) {
      return defaultHost;
    }
    return boundHost;
  }
  /**
   * Normalize host for URL usage.
   * @param {string} host - Hostname or IP.
   * @return {string}
   * @private
   */
  normalizeWebSocketHost(host) {
    if (!host.includes(MESSAGE_ROUTER_LITERAL.STRING_VALUE)) {
      return host;
    }
    if (host.startsWith(IPV6_HOST_PREFIX) && host.endsWith(IPV6_HOST_SUFFIX)) {
      return host;
    }
    return `${IPV6_HOST_PREFIX}${host}${IPV6_HOST_SUFFIX}`;
  }
  /**
   * Extract one websocket port from an address.
   * @param {string|null} address
   * @return {number|null}
   * @private
   */
  extractWebSocketPort(address) {
    if (
      typeof address !== TRANSPORT_TYPEOF.STRING ||
      address.length === TRANSPORT_NUM.ZERO
    ) {
      return null;
    }
    try {
      const parsed = new URL(address);
      const port = Number(parsed.port);
      return Number.isFinite(port) && port > TRANSPORT_NUM.ZERO ? port : null;
    } catch {
      return null;
    }
  }
  /**
   * Build a directly-routable websocket address from an observed socket IP.
   * @param {WebSocket|null} ws
   * @param {string|null} candidateAddress
   * @return {string|null}
   * @private
   */
  buildObservedReconnectAddress(ws, candidateAddress = null) {
    return this.connectionAuthorityOwner.buildObservedReconnectAddress(
      ws,
      candidateAddress,
    );
  }
  /**
   * Remember the most directly-routable reconnect address observed for one
   * connection while retaining the configured resolver address as fallback.
   * @param {Object|null} connectionInfo
   * @param {WebSocket|null} ws
   * @param {string|null} candidateAddress
   * @return {void}
   * @private
   */
  rememberReconnectAddress(connectionInfo, ws, candidateAddress = null) {
    this.connectionAuthorityOwner.rememberReconnectAddress(
      connectionInfo,
      ws,
      candidateAddress,
    );
  }
  /**
   * Clear an armed reconnect timer for one connection.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  clearReconnectTimeout(connectionInfo) {
    if (!connectionInfo?.reconnectTimeout) {
      if (connectionInfo) {
        connectionInfo.reconnectDueAt = null;
      }
      return;
    }
    clearTimeout(connectionInfo.reconnectTimeout);
    connectionInfo.reconnectTimeout = null;
    connectionInfo.reconnectDueAt = null;
  }
  /**
   * Clear one heartbeat interval.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  clearPingInterval(connectionInfo) {
    if (!connectionInfo?.pingInterval) {
      return;
    }
    clearInterval(connectionInfo.pingInterval);
    connectionInfo.pingInterval = null;
  }
  /**
   * Retire a superseded connection object so it stops reconnecting.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  retireConnection(connectionInfo) {
    if (!connectionInfo || typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT) {
      return;
    }
    connectionInfo.retired = true;
    this.clearReconnectTimeout(connectionInfo);
    this.clearPingInterval(connectionInfo);
  }
  /**
   * Return whether a connection object is still the active entry for its peer.
   * @param {Object|null} connectionInfo
   * @return {boolean}
   * @private
   */
  isCurrentConnection(connectionInfo) {
    if (!connectionInfo || typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT) {
      return false;
    }
    return this.nodeConnections.get(connectionInfo.nodeId) === connectionInfo;
  }
  /**
   * Connect to a remote node via WebSocket.
   * @param {string} nodeId - Remote node ID.
   * @param {string} address - Remote node WebSocket address.
   * @param {Object} options - Connection options.
   * @param {boolean} options.isSelfConnection - Whether this is a self-connection.
   * @return {Promise<void>}
   */
  async connectToNode(nodeId, address, options = {}) {
    if (this.nodeConnections.has(nodeId)) {
      const existing2 = this.nodeConnections.get(nodeId);
      if (existing2.state === ConnectionState.CONNECTED) {
        this.logger.debug(ROUTER_LOG_MSG.ALREADY_CONNECTED, {
          nodeId,
        });
        return;
      }
    }
    this.logger.debug(ROUTER_LOG_MSG.CONNECTING, {
      nodeId,
      address,
      routerId: this.routerId,
    });
    const normalizedAddress = normalizeToWebSocketAddress(address) || address;
    const existing = this.nodeConnections.get(nodeId) || null;
    if (existing) {
      this.refreshReconnectAuthority(existing, normalizedAddress);
      this.retireConnection(existing);
    }
    const configuredAddress =
      this.resolveCanonicalReconnectAddress(nodeId, normalizedAddress) ||
      normalizedAddress;
    const connectionInfo = {
      connectionId: uuidv4(),
      nodeId,
      address: normalizedAddress,
      configuredAddress,
      observedAddress: existing?.observedAddress || null,
      ws: null,
      state: ConnectionState.CONNECTING,
      reconnectAttempts: TRANSPORT_NUM.ZERO,
      reconnectTimeout: null,
      reconnectDueAt: null,
      isIncoming: false,
      isSelfConnection: options.isSelfConnection || false,
      ackTimeoutStreak: TRANSPORT_NUM.ZERO,
      lastAckAt: null,
      lastAckTimeoutAt: null,
      retired: false,
      createdAt: Date.now(),
    };
    this.nodeConnections.set(nodeId, connectionInfo);
    await this.establishConnection(connectionInfo);
  }
  /**
   * Establish WebSocket connection to a remote node.
   * @param {Object} connectionInfo - Connection information.
   * @return {Promise<void>}
   * @private
   */
  async establishConnection(connectionInfo) {
    if (this.inProcessTransport) {
      return this.establishInProcessConnection(connectionInfo);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        const ws = new WebSocket(connectionInfo.address);
        let connectionEstablished = false;
        const clearConnectTimeout = () => {
          if (connectTimeout) {
            clearTimeout(connectTimeout);
            connectTimeout = null;
          }
        };
        const rejectPendingConnection = (error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearConnectTimeout();
          connectionInfo.state = ConnectionState.DISCONNECTED;
          connectionInfo.ws = null;
          reject(error);
        };
        let connectTimeout = setTimeout(() => {
          const error = new Error(
            `WebSocket connection timeout after ${this.connectTimeoutMs}ms`,
          );
          error.code = WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE;
          rejectPendingConnection(error);
          try {
            ws.terminate();
          } catch (_error) {
            void _error;
          }
        }, this.connectTimeoutMs);
        if (
          typeof connectTimeout?.unref ===
          MESSAGE_ROUTER_LITERAL.STRING_FUNCTION
        ) {
          connectTimeout.unref();
        }
        ws.on(TRANSPORT_EVENT.OPEN, () => {
          if (settled) {
            return;
          }
          if (
            !connectionInfo.isSelfConnection &&
            !this.isCurrentConnection(connectionInfo)
          ) {
            settled = true;
            clearConnectTimeout();
            connectionInfo.state = ConnectionState.CLOSED;
            connectionInfo.ws = null;
            try {
              ws.terminate();
            } catch (_error) {
              void _error;
            }
            resolve();
            return;
          }
          settled = true;
          connectionEstablished = true;
          clearConnectTimeout();
          connectionInfo.ws = ws;
          connectionInfo.state = ConnectionState.CONNECTED;
          connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
          connectionInfo.reconnectDueAt = null;
          connectionInfo.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
          connectionInfo.lastAckTimeoutAt = null;
          this.rememberReconnectAddress(
            connectionInfo,
            ws,
            connectionInfo.address,
          );
          this.logger.info(ROUTER_LOG_MSG.CONNECTED, {
            nodeId: connectionInfo.nodeId,
            address: connectionInfo.address,
          });
          this.sendIdentification(connectionInfo);
          this.startPingInterval(connectionInfo);
          this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
            nodeId: connectionInfo.nodeId,
            connectionId: connectionInfo.connectionId,
          });
          resolve();
        });
        ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
          this.handleMessage(connectionInfo.nodeId, ws, data);
        });
        ws.on(TRANSPORT_EVENT.CLOSE, () => {
          if (!connectionEstablished) {
            if (!settled) {
              rejectPendingConnection(
                new Error(
                  MESSAGE_ROUTER_LITERAL.STRING_WEBSOCKET_CONNECTION_CLOSED_BEFORE_OPEN_FOR_NODE +
                    connectionInfo.nodeId,
                ),
              );
            }
            return;
          }
          this.handleConnectionClose(
            connectionInfo.nodeId,
            connectionInfo.connectionId,
          );
        });
        ws.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(ROUTER_LOG_MSG.WS_ERROR, {
            nodeId: connectionInfo.nodeId,
            error: error.message,
          });
          if (
            !connectionEstablished &&
            connectionInfo.state === ConnectionState.CONNECTING
          ) {
            rejectPendingConnection(error);
          }
        });
      } catch (error) {
        connectionInfo.state = ConnectionState.DISCONNECTED;
        reject(error);
      }
    });
  }
  /**
   * Establish a duplex in-process connection to a router registered on the target port.
   * @param {Object} connectionInfo - Connection information.
   * @return {Promise<void>}
   * @private
   */
  async establishInProcessConnection(connectionInfo) {
    const url = new URL(connectionInfo.address);
    const portKey = Number(url.port);
    const target = INPROC.serversByPort.get(portKey);
    if (!target?.router) {
      const err = new Error(`connect ECONNREFUSED ${connectionInfo.address}`);
      err.code = MESSAGE_ROUTER_LITERAL.STRING_ECONNREFUSED;
      throw err;
    }
    const {a: clientWs, b: serverWs} = createInProcWebSocketPair();
    if (this.server?.clients) {
      this.server.clients.add(serverWs);
    }
    target.router.handleIncomingConnection(serverWs, null);
    clientWs.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(connectionInfo.nodeId, clientWs, data);
    });
    clientWs.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleConnectionClose(
        connectionInfo.nodeId,
        connectionInfo.connectionId,
      );
    });
    clientWs.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ROUTER_LOG_MSG.WS_ERROR, {
        nodeId: connectionInfo.nodeId,
        error: error?.message || String(error),
      });
    });
    if (
      !connectionInfo.isSelfConnection &&
      !this.isCurrentConnection(connectionInfo)
    ) {
      connectionInfo.state = ConnectionState.CLOSED;
      clientWs.terminate();
      return;
    }
    connectionInfo.ws = clientWs;
    connectionInfo.state = ConnectionState.CONNECTED;
    connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
    connectionInfo.reconnectDueAt = null;
    connectionInfo.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
    connectionInfo.lastAckTimeoutAt = null;
    this.rememberReconnectAddress(
      connectionInfo,
      clientWs,
      connectionInfo.address,
    );
    this.logger.info(ROUTER_LOG_MSG.CONNECTED, {
      nodeId: connectionInfo.nodeId,
      address: connectionInfo.address,
    });
    this.sendIdentification(connectionInfo);
    this.startPingInterval(connectionInfo);
    this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
      nodeId: connectionInfo.nodeId,
      connectionId: connectionInfo.connectionId,
    });
  }
  /**
   * Send identification message to remote node.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  sendIdentification(connectionInfo) {
    const message = {
      type: RouterMessageType.IDENTIFY,
      nodeId: this.nodeId,
      nodeAddress: this.advertisedAddress,
      address: this.advertisedAddress,
      timestamp: Date.now(),
    };
    if (this.identifyPayload && !connectionInfo.isSelfConnection) {
      message.bootstrap = this.identifyPayload;
    }
    this.sendRaw(connectionInfo.ws, message);
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

export {MessageRouterSegment1};
