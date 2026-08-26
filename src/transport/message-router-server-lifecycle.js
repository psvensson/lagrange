import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  ConnectionState,
  INPROC,
  MESSAGE_ROUTER_LITERAL,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  TRANSPORT_EVENT,
  WebSocketServer,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

/**
 * Server and self-connection lifecycle for the message router: initialize,
 * start the WebSocket (or in-process) server, accept incoming connections, and
 * establish the loopback self-connection that makes local and remote routing
 * follow the same path.
 */
class MessageRouterServerLifecycle {
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
}

function defineMessageRouterServerLifecycle(serviceClass) {
  Object.defineProperties(
    serviceClass.prototype,
    Object.fromEntries(
      Object.entries(
        Object.getOwnPropertyDescriptors(
          MessageRouterServerLifecycle.prototype,
        ),
      ).filter(([name]) => name !== 'constructor'),
    ),
  );
}

export {defineMessageRouterServerLifecycle};
