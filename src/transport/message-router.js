/**
 * MessageRouter - Unified message routing for local and cross-node communication.
 * Routes messages through local handlers or WebSocket connections.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import WebSocket, {WebSocketServer} from 'ws';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  CONNECTION_STATE,
  ROUTER_ADDRESS,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_MESSAGE_TYPE,
  ROUTER_VALID_ENTITY_TYPES,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
  TRANSPORT_NUM,
  TRANSPORT_SUBSYSTEM,
  TRANSPORT_TYPEOF,
} from '../constants/transport.js';

const ConnectionState = CONNECTION_STATE;
const RouterMessageType = ROUTER_MESSAGE_TYPE;

// In-process transport for test environments. This is only enabled when explicitly
// requested via options.inProcess to avoid hidden behavior in production.
const INPROC = globalThis.__DDB_INPROC_MESSAGE_ROUTER__ ||= {
  serversByPort: new Map(), // port -> {router, nodeId}
};

class InProcWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = WebSocket.CONNECTING;
    this._peer = null;
  }

  _setPeer(peer) {
    this._peer = peer;
  }

  _open() {
    this.readyState = WebSocket.OPEN;
    queueMicrotask(() => this.emit(TRANSPORT_EVENT.OPEN));
  }

  send(data) {
    if (this.readyState !== WebSocket.OPEN || !this._peer) {
      return;
    }
    // Deliver asynchronously to preserve ordering without recursion.
    queueMicrotask(() => {
      if (this._peer.readyState === WebSocket.OPEN) {
        this._peer.emit(TRANSPORT_EVENT.MESSAGE, data);
      }
    });
  }

  close() {
    this.terminate();
  }

  terminate() {
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }
    this.readyState = WebSocket.CLOSED;
    queueMicrotask(() => this.emit(TRANSPORT_EVENT.CLOSE));
    if (this._peer && this._peer.readyState !== WebSocket.CLOSED) {
      this._peer.readyState = WebSocket.CLOSED;
      queueMicrotask(() => this._peer.emit(TRANSPORT_EVENT.CLOSE));
    }
  }
}

function createInProcWebSocketPair() {
  const a = new InProcWebSocket();
  const b = new InProcWebSocket();
  a._setPeer(b);
  b._setPeer(a);
  a._open();
  b._open();
  return {a, b};
}

/**
 * MessageRouter provides unified message routing for both local and remote services.
 * - Local messages are delivered directly to registered handlers
 * - Remote messages are sent via WebSocket connections to other nodes
 */
class MessageRouter extends EventEmitter {
  /**
   * Create a new MessageRouter.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {string} options.nodeAddress - Local node address (for WebSocket server).
   * @param {number} options.wsPort - WebSocket server port.
   * @param {string} options.wsHost - Optional WebSocket bind host.
   */
  constructor(options = {}) {
    super();

    const nodeWsPort = options.wsPort || TRANSPORT_DEFAULT.WS_PORT;
    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress = options.nodeAddress ||
      TRANSPORT_FORMAT.buildDefaultNodeAddress(nodeWsPort);
    this.wsPort = options.wsPort || null;
    this.routerId = uuidv4();
    this.identifyPayload = options.identifyPayload || null;

    // Registered handlers (address -> handler function)
    // Handlers are invoked when messages arrive via WebSocket
    this.handlers = new Map();
    this.inProcess = options.inProcess === true;

    // Node connections (nodeId -> connection info)
    // Includes self-connection for local routing
    this.nodeConnections = new Map();

    // Pending messages awaiting acknowledgment
    this.pendingMessages = new Map();
    this.pendingPings = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    const configuredWsHost = config.get(TRANSPORT_CONFIG_KEY.WS_HOST);
    // Bind to localhost by default so tests (and local dev) don't require
    // listening on all interfaces (0.0.0.0), which can be disallowed in some
    // sandboxed environments. Production deployments can override via
    // `transport.wsHost` (e.g. 0.0.0.0).
    this.wsHost = options.wsHost ||
      (typeof configuredWsHost === TRANSPORT_TYPEOF.STRING &&
        configuredWsHost.length > TRANSPORT_NUM.ZERO ?
        configuredWsHost :
        TRANSPORT_DEFAULT.WS_HOST);
    this.messageTimeoutMs =
      config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) ||
      TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
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
      config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_MAX_CONCURRENT);
    this.outboundQueueMaxConcurrent =
      Number.isFinite(configuredMaxConcurrent) &&
      configuredMaxConcurrent > TRANSPORT_NUM.ZERO ?
        Math.floor(configuredMaxConcurrent) :
        TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CONCURRENCY;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.ROUTER) : console;

    // State
    this.initialized = false;
    this.server = null;
    this.messageCount = TRANSPORT_NUM.ZERO;
    this.isShuttingDown = false;
    this.inProcessTransport = false;

    // Per-node outbound delivery queues
    this.outboundQueues = new Map();

    // Function to resolve service address to node ID
    this.resolveServiceNode = options.resolveServiceNode || null;
  }

  /**
   * Set optional payload to include with IDENTIFY messages.
   * @param {Object|null} payload - Additional identify payload.
   */
  setIdentificationPayload(payload) {
    this.identifyPayload = payload || null;
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
    if (this.initialized) {
      return;
    }
    this.isShuttingDown = false;

    this.logger.info(ROUTER_LOG_MSG.INITIALIZING, {
      routerId: this.routerId,
      nodeId: this.nodeId,
      wsPort: this.wsPort,
      wsHost: this.wsHost,
    });

    // Start WebSocket server if port specified
    if (options.startServer && this.wsPort) {
      await this.startServer();

      // Establish self-connection for uniform message routing
      // All messages (local and remote) go through WebSocket
      try {
        await this.connectToSelf();
      } catch (error) {
        this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_FAILED, {
          error: error.message,
          nodeId: this.nodeId,
        });
        // Clean up server if self-connection fails
        if (this.server) {
          await new Promise((resolve) => this.server.close(resolve));
          this.server = null;
        }
        throw new Error(ROUTER_ERROR_MSG.SELF_CONNECTION_FAILED(error.message));
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
      try {
        if (this.inProcess) {
          this.startInProcessServer();
          resolve();
          return;
        }
        const serverOptions = {port: this.wsPort};
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
          resolve();
        });

        wsServer.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(ROUTER_LOG_MSG.WS_SERVER_ERROR, {
            error: error.message,
            routerId: this.routerId,
          });
          reject(error);
        });
      } catch (error) {
        reject(error);
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
      throw new Error('Invalid wsPort for in-process server');
    }
    if (INPROC.serversByPort.has(portKey)) {
      const err = new Error(`listen EADDRINUSE: address already in use 127.0.0.1:${portKey}`);
      err.code = 'EADDRINUSE';
      throw err;
    }
    this.inProcessTransport = true;
    INPROC.serversByPort.set(portKey, {router: this, nodeId: this.nodeId});

    // Minimal server-like object for diagnostics; shutdown() handles in-process servers separately.
    this.server = {
      clients: new Set(),
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

    this.logger.debug(ROUTER_LOG_MSG.INCOMING_CONNECTION, {
      connectionId,
      routerId: this.routerId,
    });

    // Set up message handler
    ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(connectionId, ws, data);
    });

    ws.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleConnectionClose(connectionId);
    });

    ws.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ROUTER_LOG_MSG.WS_CONNECTION_ERROR, {
        connectionId,
        error: error.message,
      });
    });

    // Store connection temporarily until we know the peer node ID
    this.nodeConnections.set(connectionId, {
      connectionId,
      ws,
      state: ConnectionState.CONNECTED,
      nodeId: null,
      isIncoming: true,
      createdAt: Date.now(),
    });

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
    const selfAddress = TRANSPORT_FORMAT.buildDefaultNodeAddress(this.wsPort);
    this.logger.debug(ROUTER_LOG_MSG.SELF_CONNECTION_START, {
      nodeId: this.nodeId,
      address: selfAddress,
    });
    await this.connectToNode(this.nodeId, selfAddress, {isSelfConnection: true});
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
    // Check if already connected
    if (this.nodeConnections.has(nodeId)) {
      const existing = this.nodeConnections.get(nodeId);
      if (existing.state === ConnectionState.CONNECTED) {
        this.logger.debug(ROUTER_LOG_MSG.ALREADY_CONNECTED, {nodeId});
        return;
      }
    }

    this.logger.debug(ROUTER_LOG_MSG.CONNECTING, {
      nodeId,
      address,
      routerId: this.routerId,
    });

    const connectionInfo = {
      connectionId: uuidv4(),
      nodeId,
      address,
      ws: null,
      state: ConnectionState.CONNECTING,
      reconnectAttempts: TRANSPORT_NUM.ZERO,
      isIncoming: false,
      isSelfConnection: options.isSelfConnection || false,
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
      try {
        const ws = new WebSocket(connectionInfo.address);

        ws.on(TRANSPORT_EVENT.OPEN, () => {
          connectionInfo.ws = ws;
          connectionInfo.state = ConnectionState.CONNECTED;
          connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;

          this.logger.info(ROUTER_LOG_MSG.CONNECTED, {
            nodeId: connectionInfo.nodeId,
            address: connectionInfo.address,
          });

          // Send identification message
          this.sendIdentification(connectionInfo);

          // Start ping interval
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
          this.handleConnectionClose(connectionInfo.nodeId);
        });

        ws.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(ROUTER_LOG_MSG.WS_ERROR, {
            nodeId: connectionInfo.nodeId,
            error: error.message,
          });

          if (connectionInfo.state === ConnectionState.CONNECTING) {
            reject(error);
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
      err.code = 'ECONNREFUSED';
      throw err;
    }

    const {a: clientWs, b: serverWs} = createInProcWebSocketPair();

    // Track the server-side ws so shutdown() can terminate it if needed.
    if (this.server?.clients) {
      this.server.clients.add(serverWs);
    }

    // Simulate server accepting incoming connection.
    target.router.handleIncomingConnection(serverWs, null);

    // Simulate the client-side "open" behavior from establishConnection().
    // Wire up client-side handlers so ACKs, pings, and service messages can flow back.
    clientWs.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(connectionInfo.nodeId, clientWs, data);
    });
    clientWs.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleConnectionClose(connectionInfo.nodeId);
    });
    clientWs.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ROUTER_LOG_MSG.WS_ERROR, {
        nodeId: connectionInfo.nodeId,
        error: error?.message || String(error),
      });
    });

    connectionInfo.ws = clientWs;
    connectionInfo.state = ConnectionState.CONNECTED;
    connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;

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
      nodeAddress: this.nodeAddress,
      address: this.nodeAddress,
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

      // Handle identification
      if (message.type === RouterMessageType.IDENTIFY) {
        this.handleIdentification(connectionId, ws, message);
        return;
      }

      // Handle ping/pong
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

      // Handle acknowledgment
      if (message.type === RouterMessageType.ACK) {
        this.handleAcknowledgment(message);
        return;
      }

      // Handle service message
      if (message.type === RouterMessageType.SERVICE_MESSAGE) {
        this.handleServiceMessage(ws, message);
        return;
      }

      // Unknown message type
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

    // Update connection with node ID
    const connection = this.nodeConnections.get(connectionId);
    if (connection && connection.isIncoming) {
      connection.nodeId = nodeId;
      connection.nodeAddress = nodeAddress;

      const existing = this.nodeConnections.get(nodeId);
      const isSelfConnection = existing?.isSelfConnection && nodeId === this.nodeId;

      if (!existing || !isSelfConnection) {
        if (existing && existing.ws && existing.connectionId !== connectionId) {
          try {
            existing.ws.terminate();
          } catch (error) {
            this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {
              nodeId,
              error: error.message,
            });
            throw error;
          }
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
          reason: ROUTER_LOG_MSG.SELF_CONNECTION_ALREADY_REGISTERED,
        });
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
   * Flattens handler result into ACK to avoid nested result structures.
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

    // Find handler for target address
    const handler = this.handlers.get(targetAddress);

    if (handler) {
      try {
        // Create envelope similar to InMemoryTransport
        const envelope = {
          messageId,
          sourceAddress: message.sourceAddress,
          sourceNodeId: message.sourceNodeId,
          targetAddress,
          payload,
          timestamp: message.timestamp,
        };

        // Call handler (may be sync or async)
        const resultPromise = Promise.resolve(handler(envelope));

        resultPromise
          .then((result) => {
            // Flatten handler result into ACK - spread result fields directly
            // This avoids nested {result: {result: ...}} structures
            const ack = {
              type: RouterMessageType.ACK,
              messageId,
              acknowledged: true,
            };
            // Spread handler result fields (excluding 'acknowledged' to avoid override)
            // Keep handler's 'type' as 'responseType' to preserve it
            if (result && typeof result === TRANSPORT_TYPEOF.OBJECT) {
              const {acknowledged: _ack, type: handlerType, ...rest} = result;
              Object.assign(ack, rest);
              if (handlerType) {
                ack.responseType = handlerType;
              }
            }
            this.sendRaw(ws, ack);
          })
          .catch((error) => {
            this.sendRaw(ws, {
              type: RouterMessageType.ACK,
              messageId,
              acknowledged: false,
              error: error.message,
            });
          });
      } catch (error) {
        this.sendRaw(ws, {
          type: RouterMessageType.ACK,
          messageId,
          acknowledged: false,
          error: error.message,
        });
      }
    } else {
      // No handler - emit event for external handling
      this.emit(TRANSPORT_EVENT.MESSAGE, {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });

      // Send acknowledgment (message received but no handler)
      this.sendRaw(ws, {
        type: RouterMessageType.ACK,
        messageId,
        acknowledged: true,
        noHandler: true,
        error: ROUTER_ERROR_MSG.NO_HANDLER_FOR_ADDRESS(targetAddress),
      });
    }
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
        // Pass through flat structure - spread all fields from ACK
        pending.resolve({messageId, acknowledged: true, ...rest});
      } else {
        pending.reject(new Error(error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED));
      }
    }
  }

  /**
   * Handle connection close.
   * Self-disconnection is treated as a fatal error (no reconnection).
   * Requirements: 2.1
   * @param {string} nodeId - Node ID.
   * @private
   */
  handleConnectionClose(nodeId) {
    const connection = this.nodeConnections.get(nodeId);

    if (connection) {
      this.logger.info(ROUTER_LOG_MSG.CONNECTION_CLOSED, {
        nodeId,
        connectionId: connection.connectionId,
        isSelfConnection: connection.isSelfConnection,
      });

      connection.state = ConnectionState.DISCONNECTED;
      connection.ws = null;

      // Stop ping interval
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
        connection.pingInterval = null;
      }

      const disconnectError = new Error(
        ROUTER_ERROR_MSG.CONNECTION_CLOSED(nodeId),
      );
      this.failOutboundQueue(nodeId, disconnectError);
      this.failPendingMessagesForNode(nodeId, disconnectError);

      this.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, {nodeId});

      if (this.isShuttingDown) {
        return;
      }

      // Self-disconnection is fatal - do not attempt reconnection
      if (connection.isSelfConnection) {
        this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_LOST, {
          nodeId,
          connectionId: connection.connectionId,
        });
        this.emit(TRANSPORT_EVENT.SELF_DISCONNECT, {nodeId});
        return;
      }

      // Attempt reconnection for outgoing connections to other nodes
      if (!connection.isIncoming && connection.address) {
        this.scheduleReconnect(connection);
      }
    }
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
    if (connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.logger.error(ROUTER_LOG_MSG.MAX_RECONNECTS_REACHED, {
        nodeId: connectionInfo.nodeId,
        attempts: connectionInfo.reconnectAttempts,
      });
      connectionInfo.state = ConnectionState.CLOSED;
      return;
    }

    connectionInfo.state = ConnectionState.RECONNECTING;
    connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE;

    const delay = this.reconnectIntervalMs *
      Math.pow(
        this.reconnectBackoffMultiplier,
        connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE,
      );

    this.logger.debug(ROUTER_LOG_MSG.SCHEDULING_RECONNECT, {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });

    connectionInfo.reconnectTimeout = setTimeout(async () => {
      try {
        await this.establishConnection(connectionInfo);
      } catch (error) {
        this.logger.error(ROUTER_LOG_MSG.RECONNECT_FAILED, {
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        throw error;
      }
    }, delay);
  }

  /**
   * Start ping interval for connection.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  startPingInterval(connectionInfo) {
    connectionInfo.pingInterval = setInterval(() => {
      if (connectionInfo.ws &&
          connectionInfo.ws.readyState === WebSocket.OPEN) {
        this.sendRaw(connectionInfo.ws, {
          type: RouterMessageType.PING,
          timestamp: Date.now(),
        });
      }
    }, this.pingIntervalMs);
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

    // Validate address format
    if (!this.isValidAddress(address)) {
      throw new Error(ROUTER_ERROR_MSG.INVALID_ADDRESS_FORMAT(address));
    }

    this.handlers.set(address, handler);

    this.logger.debug(ROUTER_LOG_MSG.HANDLER_REGISTERED, {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
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
      return {nodeId: null, entityType: null, entityId: null};
    }

    const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
    if (parts.length !== TRANSPORT_NUM.THREE) {
      return {nodeId: null, entityType: null, entityId: null};
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

    // All parts must be non-empty
    if (!nodeId || !entityType || !entityId) {
      return false;
    }

    // entityType must be one of the valid types
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
   * Set the function to resolve service address to node ID.
   * @param {Function} resolver - Function(address) => nodeId or null.
   */
  setServiceNodeResolver(resolver) {
    this.resolveServiceNode = resolver;
  }

  /**
   * Get or create outbound queue for a node.
   * @param {string} nodeId - Target node ID.
   * @return {Object} Queue state.
   * @private
   */
  getOutboundQueue(nodeId) {
    if (!this.outboundQueues.has(nodeId)) {
      this.outboundQueues.set(nodeId, {
        nodeId,
        inFlight: TRANSPORT_NUM.ZERO,
        pending: [],
        maxConcurrent: this.outboundQueueMaxConcurrent,
      });
    }
    return this.outboundQueues.get(nodeId);
  }

  /**
   * Check if the outbound queue has immediate capacity for a node.
   * @param {string} nodeId - Target node ID.
   * @return {boolean} True if capacity is available.
   */
  isOutboundQueueAvailable(nodeId) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return true;
    }
    return queue.inFlight < queue.maxConcurrent;
  }

  /**
   * Enqueue a delivery for a node with per-node concurrency limits.
   * @param {string} nodeId - Target node ID.
   * @param {Function} deliverFn - Function that returns a Promise result.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  enqueueOutbound(nodeId, deliverFn) {
    const queue = this.getOutboundQueue(nodeId);

    return new Promise((resolve, reject) => {
      queue.pending.push({deliverFn, resolve, reject});
      this.processOutboundQueue(nodeId);
    });
  }

  /**
   * Process queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @private
   */
  processOutboundQueue(nodeId) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    while (queue.inFlight < queue.maxConcurrent &&
      queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = queue.pending.shift();
      queue.inFlight += TRANSPORT_NUM.ONE;

      Promise.resolve()
        .then(() => item.deliverFn())
        .then((result) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          item.resolve(result);
          this.processOutboundQueue(nodeId);
        })
        .catch((error) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          item.reject(error);
          this.processOutboundQueue(nodeId);
        });
    }
  }

  /**
   * Fail queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to reject with.
   * @private
   */
  failOutboundQueue(nodeId, error) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = queue.pending.shift();
      item.reject(error);
    }
  }

  /**
   * Gracefully fail queued outbound deliveries (no rejection).
   * Used during shutdown to avoid unhandled rejections from fire-and-forget tasks.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to return as a failed delivery.
   * @private
   */
  failOutboundQueueGracefully(nodeId, error) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    const errorMessage = error?.message || ROUTER_ERROR_MSG.SHUTDOWN;
    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = queue.pending.shift();
      item.resolve({
        acknowledged: false,
        error: errorMessage,
        shutdown: true,
      });
    }
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
   * Deliver a message to a target service via WebSocket.
   * All messages go through WebSocket, including local messages via self-connection.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @param {Object} options - Delivery options.
   * @param {string} options.targetNodeId - Target node ID (if known).
   * @return {Promise<Object>} Delivery result.
   */
  async deliver(targetAddress, message, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const messageId = message.messageId || uuidv4();
    this.messageCount += TRANSPORT_NUM.ONE;

    // Determine target node - always route via WebSocket
    let targetNodeId = options.targetNodeId;

    // If no targetNodeId provided, try to extract from address or use resolver
    if (!targetNodeId) {
      // Try to parse nodeId from unified address format (nodeId/entityType/entityId)
      const parsed = this.parseAddress(targetAddress);
      if (parsed.nodeId) {
        targetNodeId = parsed.nodeId;
      }
    }

    if (!targetNodeId && this.resolveServiceNode) {
      targetNodeId = this.resolveServiceNode(targetAddress);
    }

    if (!targetNodeId) {
      throw new Error(ROUTER_ERROR_MSG.INVALID_ADDRESS_FORMAT(targetAddress));
    }

    // If the target resolves to this node but we do not have a self-connection
    // (eg startServer=false), reject rather than silently bypassing transport.
    if (targetNodeId === this.nodeId) {
      const selfConn = this.nodeConnections.get(this.nodeId);
      const hasSelfConn = selfConn && selfConn.state === ConnectionState.CONNECTED;
      if (!hasSelfConn) {
        return {
          messageId,
          acknowledged: false,
          error: ROUTER_ERROR_MSG.NO_CONNECTION_TO_NODE(this.nodeId),
        };
      }
    }

    // Deliver via WebSocket connection
    return this.deliverRemote(targetAddress, messageId, message, targetNodeId);
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
  async deliverRemote(targetAddress, messageId, payload, targetNodeId) {
    return this.enqueueOutbound(targetNodeId, () => {
      const connection = this.nodeConnections.get(targetNodeId);

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

        return {
          messageId,
          acknowledged: false,
          error: ROUTER_ERROR_MSG.NO_CONNECTION_TO_NODE(targetNodeId),
        };
      }

      return this.sendMessage(
        connection,
        targetAddress,
        messageId,
        payload,
        targetNodeId,
      );
    });
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
  sendMessage(connection, targetAddress, messageId, payload, targetNodeId) {
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

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        resolve({
          messageId,
          acknowledged: false,
          error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
        });
      }, this.messageTimeoutMs);

      // Track pending message
      this.pendingMessages.set(messageId, {
        messageId,
        resolve,
        reject,
        timeout,
        sentAt: Date.now(),
        targetNodeId,
      });

      // Send message
      this.sendRaw(connection.ws, message);
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
    if (!connection || connection.state !== ConnectionState.CONNECTED || !connection.ws) {
      return false;
    }

    const pingId = uuidv4();
    const timeout = timeoutMs ?? this.pingTimeoutMs;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPings.delete(pingId);
        resolve(false);
      }, timeout);

      this.pendingPings.set(pingId, {resolve, timeout: timer});
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
    return connection &&
           connection.isSelfConnection &&
           connection.state === ConnectionState.CONNECTED;
  }

  /**
   * Get router statistics.
   * @return {Object} Router stats.
   */
  getStats() {
    const connectionStats = {};
    for (const [nodeId, connection] of this.nodeConnections) {
      connectionStats[nodeId] = {
        state: connection.state,
        isIncoming: connection.isIncoming,
        reconnectAttempts: connection.reconnectAttempts,
      };
    }

    const outboundQueueStats = {};
    for (const [nodeId, queue] of this.outboundQueues) {
      outboundQueueStats[nodeId] = {
        inFlight: queue.inFlight,
        pending: queue.pending.length,
        maxConcurrent: queue.maxConcurrent,
      };
    }

    return {
      routerId: this.routerId,
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      initialized: this.initialized,
      messageCount: this.messageCount,
      pendingMessages: this.pendingMessages.size,
      handlers: this.handlers.size,
      connections: connectionStats,
      connectedNodes: this.getConnectedNodes().length,
      outboundQueues: outboundQueueStats,
    };
  }

  /**
   * Shutdown the message router.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.debug(ROUTER_LOG_MSG.SHUTTING_DOWN, {
      routerId: this.routerId,
    });
    this.isShuttingDown = true;

    // Clear pending messages first to avoid timeout callbacks
    for (const [, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.resolve({
        messageId: pending.messageId,
        acknowledged: false,
        error: ROUTER_ERROR_MSG.SHUTDOWN,
        shutdown: true,
      });
    }
    this.pendingMessages.clear();

    for (const [, pending] of this.pendingPings) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    }
    this.pendingPings.clear();

    const shutdownError = new Error(ROUTER_ERROR_MSG.SHUTDOWN);
    for (const [nodeId] of this.outboundQueues) {
      this.failOutboundQueueGracefully(nodeId, shutdownError);
    }
    this.outboundQueues.clear();

    // Close all connections and wait for them to close
    const closePromises = [];
    for (const [, connection] of this.nodeConnections) {
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
        connection.pingInterval = null;
      }
      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
        connection.reconnectTimeout = null;
      }
      if (connection.ws) {
        const ws = connection.ws;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          closePromises.push(new Promise((resolve) => {
            ws.once(TRANSPORT_EVENT.CLOSE, resolve);
            ws.terminate(); // Force close instead of graceful close
          }));
        }
      }
    }

    // Wait for all connections to close (with timeout that gets cleared)
    if (closePromises.length > TRANSPORT_NUM.ZERO) {
      let timeoutId;
      await Promise.race([
        Promise.all(closePromises),
        new Promise((resolve) => {
          timeoutId = setTimeout(resolve, TRANSPORT_DEFAULT.SHUTDOWN_WAIT_MS);
        }),
      ]).finally(() => {
        clearTimeout(timeoutId);
      });
    }

    // Close server and all its client connections
    if (this.server) {
      // In-process server: just terminate tracked clients and unregister.
      if (this.inProcessTransport) {
        for (const client of this.server.clients || []) {
          client.terminate();
        }
        await new Promise((resolve) => this.server.close(resolve));
        this.server = null;
        this.inProcessTransport = false;
      } else {
        const wsServer = this.server;
        const httpServer = wsServer._server || null;

        // Terminate all clients connected to the server
        for (const client of wsServer.clients) {
          client.terminate();
        }

        await new Promise((resolve) => {
          wsServer.close(() => resolve());
        });

        if (httpServer) {
          if (typeof httpServer.closeAllConnections === TRANSPORT_TYPEOF.FUNCTION) {
            httpServer.closeAllConnections();
          }
          await new Promise((resolve) => {
            httpServer.close(() => resolve());
          });
          if (typeof httpServer.unref === TRANSPORT_TYPEOF.FUNCTION) {
            httpServer.unref();
          }
        }

        this.server = null;
      }
    }

    this.nodeConnections.clear();
    this.handlers.clear();
    this.initialized = false;

    this.emit(TRANSPORT_EVENT.SHUTDOWN, {routerId: this.routerId});
  }
}

export {
  MessageRouter,
  ConnectionState,
  RouterMessageType,
};
