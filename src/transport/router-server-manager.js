/**
 * RouterServerManager - WebSocket server management for MessageRouter.
 *
 * Handles WebSocket server lifecycle including:
 * - Server startup (real and in-process)
 * - Incoming connection handling
 * - Server shutdown
 *
 * Requirements: 1.2, 1.4
 *
 * @module transport/router-server-manager
 */

import {v4 as uuidv4} from 'uuid';
import {WebSocketServer} from 'ws';
import {
  CONNECTION_STATE,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  TRANSPORT_DEFAULT,
  TRANSPORT_EVENT,
  TRANSPORT_TYPEOF,
} from '../constants/transport.js';
import {
  INPROC,
} from './inproc-transport.js';

const LOCAL_STR_1MC96 = 'RouterServerManager requires nodeId';
const LOCAL_STR_XQYG0 = 'RouterServerManager requires logger';
const LOCAL_STR_1FXN6 = 'RouterServerManager requires routerId';
const LOCAL_STR_1O5ND = 'RouterServerManager requires nodeConnections';
const LOCAL_STR_REN10 = 'RouterServerManager requires onMessage callback';
const LOCAL_STR_1A5M9 = 'RouterServerManager requires onConnectionClose callback';
const LOCAL_STR_16804 = 'RouterServerManager requires emit function';
const LOCAL_STR_17COI = 'Invalid wsPort for in-process server';
const LOCAL_STR_EADDRINUSE = 'EADDRINUSE';

const ConnectionState = CONNECTION_STATE;

/**
 * RouterServerManager handles WebSocket server lifecycle for MessageRouter.
 *
 * This class manages:
 * - WebSocket server startup and configuration
 * - In-process server for testing
 * - Incoming connection handling
 * - Server shutdown and cleanup
 *
 * @interface
 *
 * @description
 * RouterServerManager is responsible for all server-side operations
 * in the MessageRouter. It handles both real WebSocket servers and
 * in-process servers for testing.
 *
 * Key features:
 * - Real WebSocket server with configurable host/port
 * - In-process server for fast testing without network
 * - Clean connection tracking and cleanup
 * - Graceful shutdown with client termination
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.nodeId - Local node ID
 * @param {Object} options.logger - Logger instance
 * @param {string} options.routerId - Router ID for logging
 * @param {number} [options.wsPort] - WebSocket server port
 * @param {string} [options.wsHost] - WebSocket bind host
 * @param {boolean} [options.inProcess=false] - Enable in-process transport
 * @param {Map} options.nodeConnections - Map of node connections
 * @param {Function} options.onMessage - Callback for incoming messages
 * @param {Function} options.onConnectionClose - Callback for connection close
 * @param {Function} options.emit - Function to emit events
 *
 * @example
 * const serverManager = new RouterServerManager({
 *   nodeId: 'node-1',
 *   logger: loggingService.forSubsystem('message-router'),
 *   routerId: 'router-123',
 *   wsPort: 8080,
 *   wsHost: 'localhost',
 *   nodeConnections: new Map(),
 *   onMessage: (connectionId, ws, data) => { ... },
 *   onConnectionClose: (connectionId) => { ... },
 *   emit: (event, data) => { ... },
 * });
 */
class RouterServerManager {
  /**
   * Create a new RouterServerManager instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.logger - Logger instance.
   * @param {string} options.routerId - Router ID for logging.
   * @param {number} [options.wsPort] - WebSocket server port.
   * @param {string} [options.wsHost] - WebSocket bind host.
   * @param {boolean} [options.inProcess=false] - Enable in-process transport.
   * @param {Map} options.nodeConnections - Map of node connections.
   * @param {Function} options.onMessage - Callback for incoming messages.
   * @param {Function} options.onConnectionClose - Callback for connection close.
   * @param {Function} options.emit - Function to emit events.
   */
  constructor(options) {
    if (!options.nodeId) {
      throw new Error(LOCAL_STR_1MC96);
    }
    if (!options.logger) {
      throw new Error(LOCAL_STR_XQYG0);
    }
    if (!options.routerId) {
      throw new Error(LOCAL_STR_1FXN6);
    }
    if (!options.nodeConnections) {
      throw new Error(LOCAL_STR_1O5ND);
    }
    if (!options.onMessage) {
      throw new Error(LOCAL_STR_REN10);
    }
    if (!options.onConnectionClose) {
      throw new Error(LOCAL_STR_1A5M9);
    }
    if (!options.emit) {
      throw new Error(LOCAL_STR_16804);
    }

    this.nodeId = options.nodeId;
    this.logger = options.logger;
    this.routerId = options.routerId;
    this.wsPort = options.wsPort || null;
    this.wsHost = options.wsHost || TRANSPORT_DEFAULT.WS_HOST;
    this.inProcess = options.inProcess === true;
    this.nodeConnections = options.nodeConnections;
    this.onMessage = options.onMessage;
    this.onConnectionClose = options.onConnectionClose;
    this.emit = options.emit;

    // State
    this.server = null;
    this.inProcessTransport = false;
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
      throw new Error(LOCAL_STR_17COI);
    }
    if (INPROC.serversByPort.has(portKey)) {
      const err = new Error(ROUTER_ERROR_MSG.addressInUse(portKey));
      err.code = LOCAL_STR_EADDRINUSE;
      throw err;
    }
    this.inProcessTransport = true;
    INPROC.serversByPort.set(portKey, {router: this, nodeId: this.nodeId});

    // Minimal server-like object for diagnostics; shutdown handles in-process
    // servers separately.
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
   */
  handleIncomingConnection(ws, _req) {
    const connectionId = uuidv4();

    this.logger.debug(ROUTER_LOG_MSG.INCOMING_CONNECTION, {
      connectionId,
      routerId: this.routerId,
    });

    // Set up message handler
    ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.onMessage(connectionId, ws, data);
    });

    ws.on(TRANSPORT_EVENT.CLOSE, () => {
      this.onConnectionClose(connectionId);
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
   * Check if server is running.
   * @return {boolean} True if server is running.
   */
  isRunning() {
    return this.server !== null;
  }

  /**
   * Check if using in-process transport.
   * @return {boolean} True if using in-process transport.
   */
  isInProcessTransport() {
    return this.inProcessTransport;
  }

  /**
   * Get the server instance.
   * @return {Object|null} Server instance or null.
   */
  getServer() {
    return this.server;
  }

  /**
   * Get server clients (for in-process transport).
   * @return {Set} Set of client connections.
   */
  getClients() {
    return this.server?.clients || new Set();
  }

  /**
   * Shutdown the server and close all connections.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (!this.server) {
      return;
    }

    // In-process server: just terminate tracked clients and unregister.
    if (this.inProcessTransport) {
      for (const client of this.server.clients || []) {
        client.terminate();
      }
      await new Promise((resolve) => this.server.close(resolve));
      this.server = null;
      this.inProcessTransport = false;
      return;
    }

    // Real WebSocket server
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

export {RouterServerManager};
