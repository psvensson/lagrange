import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import WebSocket, {WebSocketServer} from 'ws';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  CONNECTION_STATE,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
  TRANSPORT_NUM,
  TRANSPORT_SUBSYSTEM,
  TRANSPORT_TYPEOF,
  WS_ERROR_MSG,
  WS_LOG_MSG,
  WS_MESSAGE_TYPE,
} from '../constants/transport.js';
import {
  buildTransportStats,
  createIncomingConnectionRecord,
  createOutgoingConnectionRecord,
  findConnectedConnection,
} from './websocket-transport-connection-records.js';
import {
  buildDeliveryMessage,
  buildIdentificationMessage,
  buildMessageTimeoutResult,
  buildNoConnectionResult,
  buildPendingMessageRecord,
  buildPongMessage,
  buildServiceAcknowledgment,
  buildServiceFailureAcknowledgment,
} from './websocket-transport-messages.js';

const ConnectionState = CONNECTION_STATE;
const WSMessageType = WS_MESSAGE_TYPE;

const MSG_TRANSPORT_NOT_INITIALIZED = 'Transport is not initialized';
const MSG_REPLACING_CONNECTION = 'Replacing existing connection on new peer identification';
const MSG_IGNORING_CLOSE_STALE = 'Ignoring close event for stale socket';
const MSG_SKIPPING_RECONNECT_SCHEDULING = 'Skipping reconnect scheduling for non-canonical connection';
const MSG_SKIPPING_RECONNECT_EXECUTION = 'Skipping reconnect execution for non-canonical connection';
const MSG_CONNECTION_ESTABLISHMENT_TIMEOUT = 'Connection establishment timed out';

class WebSocketTransport extends EventEmitter {
  constructor(options = {}) {
    super();

    this.localNodeId = options.localNodeId || uuidv4();
    this.localAddress = options.localAddress ||
      TRANSPORT_FORMAT.buildLocalAddress(this.localNodeId);
    this.transportId = uuidv4();
    this.connections = new Map();
    this.pendingMessages = new Map();
    this.messageHandlers = new Map();
    const config = ConfigurationManager.getInstance();
    this.reconnectIntervalMs =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) ||
      TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS;
    this.reconnectMaxAttempts =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) ||
      TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS;
    this.reconnectBackoffMultiplier =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) ||
      TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER;
    this.pingIntervalMs =
      config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) ||
      TRANSPORT_DEFAULT.PING_INTERVAL_MS;
    this.messageTimeoutMs =
      config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) ||
      TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
    this.wsHost =
      config.get(TRANSPORT_CONFIG_KEY.WS_HOST) ||
      TRANSPORT_DEFAULT.WS_HOST;
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.WEBSOCKET) : console;
    this.initialized = false;
    this.shutdownCalled = false;
    this.messageCount = TRANSPORT_NUM.ZERO;
    this.server = null;
  }
  async initialize(options = {}) {
    if (this.initialized) {
      return;
    }
    this.shutdownCalled = false;

    this.logger.debug(WS_LOG_MSG.INITIALIZING, {
      transportId: this.transportId,
      localNodeId: this.localNodeId,
    });
    if (options.peerNodes &&
        options.peerNodes.length > TRANSPORT_NUM.ZERO) {
      for (const peer of options.peerNodes) {
        await this.connectToPeer(peer);
      }
    }

    this.initialized = true;

    this.emit(TRANSPORT_EVENT.INITIALIZED, {
      transportId: this.transportId,
      localNodeId: this.localNodeId,
    });
  }
  async startServer(port, host = null) {
    return new Promise((resolve, reject) => {
      try {
        const bindHost = host || this.wsHost || TRANSPORT_DEFAULT.WS_HOST;
        this.server = new WebSocketServer({port, host: bindHost});

        this.server.on(TRANSPORT_EVENT.CONNECTION, (ws, req) => {
          this.handleIncomingConnection(ws, req);
        });

        this.server.on(TRANSPORT_EVENT.LISTENING, () => {
          this.logger.info(WS_LOG_MSG.SERVER_LISTENING, {
            port,
            host: this.server?.options?.host || bindHost,
            transportId: this.transportId,
          });
          resolve();
        });

        this.server.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(WS_LOG_MSG.SERVER_ERROR, {
            error: error.message,
            transportId: this.transportId,
          });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  handleIncomingConnection(ws, _req) {
    const connectionId = uuidv4();
    const connection = createIncomingConnectionRecord(connectionId, ws);
    this.connections.set(connectionId, connection);

    this.logger.debug(WS_LOG_MSG.INCOMING_CONNECTION, {
      connectionId,
      transportId: this.transportId,
    });
    ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(connectionId, ws, data);
    });

    ws.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleConnectionClose(connection.nodeId || connectionId, ws);
    });

    ws.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(WS_LOG_MSG.CONNECTION_ERROR, {
        connectionId,
        error: error.message,
      });
      try {
        ws.terminate();
      } catch (_err) {
        // Best-effort terminate: socket may already be destroyed.
      }
    });

    this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
      connectionId,
      incoming: true,
    });
  }
  async connectToPeer(peer) {
    const {nodeId, address} = peer;
    if (this.connections.has(nodeId)) {
      const existing = this.connections.get(nodeId);
      if (existing.state === ConnectionState.CONNECTED ||
          existing.state === ConnectionState.CONNECTING) {
        this.logger.debug(WS_LOG_MSG.ALREADY_CONNECTED, {
          nodeId,
          state: existing.state,
        });
        return;
      }
      if (existing.ws) {
        try {
          existing.ws.terminate();
        } catch (_err) {
          // Best-effort terminate: socket may already be destroyed.
        }
      }
      if (existing.reconnectTimeout) {
        clearTimeout(existing.reconnectTimeout);
        existing.reconnectTimeout = null;
      }
    }

    this.logger.debug(WS_LOG_MSG.CONNECTING, {
      nodeId,
      address,
      transportId: this.transportId,
    });

    const connectionInfo = createOutgoingConnectionRecord({
      connectionId: uuidv4(),
      nodeId,
      address,
    });

    this.connections.set(nodeId, connectionInfo);

    await this.establishConnection(connectionInfo);
  }
  async establishConnection(connectionInfo) {
    return new Promise((resolve, reject) => {
      if (this.shutdownCalled) {
        connectionInfo.state = ConnectionState.DISCONNECTED;
        reject(new Error(MSG_TRANSPORT_NOT_INITIALIZED));
        return;
      }
      let settled = false;
      let timeoutId = null;
      let ws = null;
      const clearConnectTimeout = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
      const rejectConnection = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearConnectTimeout();
        connectionInfo.state = ConnectionState.DISCONNECTED;
        if (connectionInfo.ws === ws) {
          connectionInfo.ws = null;
        }
        reject(error);
      };
      try {
        connectionInfo.state = ConnectionState.CONNECTING;
        ws = new WebSocket(connectionInfo.address);
        connectionInfo.ws = ws;

        timeoutId = setTimeout(() => {
          if (connectionInfo.state === ConnectionState.CONNECTING && connectionInfo.ws === ws) {
            this.logger.warn(MSG_CONNECTION_ESTABLISHMENT_TIMEOUT, {
              nodeId: connectionInfo.nodeId,
              address: connectionInfo.address,
            });
            rejectConnection(new Error(MSG_CONNECTION_ESTABLISHMENT_TIMEOUT));
            try {
              ws.terminate();
            } catch (_err) {
              // Best-effort terminate: socket may already be destroyed.
            }
          }
        }, this.messageTimeoutMs);
        if (typeof timeoutId.unref === TRANSPORT_TYPEOF.FUNCTION) {
          timeoutId.unref();
        }

        ws.on(TRANSPORT_EVENT.OPEN, () => {
          if (settled) {
            return;
          }
          settled = true;
          clearConnectTimeout();
          if (this.connections.get(connectionInfo.nodeId) !== connectionInfo) {
            connectionInfo.state = ConnectionState.CLOSED;
            if (connectionInfo.ws === ws) {
              connectionInfo.ws = null;
            }
            try {
              ws.terminate();
            } catch (_err) {
              // Best-effort terminate: socket may already be destroyed.
            }
            resolve();
            return;
          }
          connectionInfo.state = ConnectionState.CONNECTED;
          connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;

          this.logger.info(WS_LOG_MSG.CONNECTED, {
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
          if (!settled) {
            rejectConnection(new Error(WS_ERROR_MSG.NO_CONNECTION));
            return;
          }
          this.handleConnectionClose(connectionInfo.nodeId, ws);
        });

        ws.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(WS_LOG_MSG.WS_ERROR, {
            nodeId: connectionInfo.nodeId,
            error: error.message,
          });

          try {
            ws.terminate();
          } catch (_err) {
            // Best-effort terminate: socket may already be destroyed.
          }

          if (connectionInfo.state === ConnectionState.CONNECTING && connectionInfo.ws === ws) {
            rejectConnection(error);
          }
        });
      } catch (error) {
        rejectConnection(error);
      }
    });
  }
  sendIdentification(connectionInfo) {
    this.sendRaw(
      connectionInfo.ws,
      buildIdentificationMessage(this.localNodeId, this.localAddress),
    );
  }
  handleMessage(connectionId, ws, data) {
    try {
      const message = JSON.parse(data.toString());

      this.logger.debug(WS_LOG_MSG.MESSAGE_RECEIVED, {
        connectionId,
        type: message.type,
        messageId: message.messageId,
      });
      if (message.type === WSMessageType.IDENTIFY) {
        this.handleIdentification(connectionId, ws, message);
        return;
      }
      if (message.type === WSMessageType.PING) {
        this.sendRaw(ws, buildPongMessage());
        return;
      }

      if (message.type === WSMessageType.PONG) {
        return;
      }
      if (message.type === WSMessageType.ACK) {
        this.handleAcknowledgment(message);
        return;
      }
      if (message.type === WSMessageType.SERVICE_MESSAGE ||
          message.type === WSMessageType.RAFT_MESSAGE) {
        this.handleServiceMessage(ws, message);
        return;
      }
      this.logger.warn(WS_LOG_MSG.MESSAGE_UNKNOWN, {
        type: message.type,
        connectionId,
      });
    } catch (error) {
      this.logger.error(WS_LOG_MSG.MESSAGE_PARSE_FAILED, {
        connectionId,
        error: error.message,
      });
      throw error;
    }
  }
  handleIdentification(connectionId, ws, message) {
    const {nodeId} = message;

    this.logger.debug(WS_LOG_MSG.IDENTIFICATION_RECEIVED, {
      connectionId,
      nodeId,
    });
    const connection = this.connections.get(connectionId);
    if (connection && connection.isIncoming) {
      connection.nodeId = nodeId;
      const existing = this.connections.get(nodeId);
      if (existing) {
        this.logger.warn(MSG_REPLACING_CONNECTION, {
          nodeId,
          existingConnectionId: existing.connectionId,
          newConnectionId: connectionId,
        });

        if (existing.ws) {
          try {
            existing.ws.terminate();
          } catch (_err) {
            // Best-effort terminate: socket may already be destroyed.
          }
        }

        this.handleConnectionClose(nodeId, existing.ws);
      }
      this.connections.delete(connectionId);
      this.connections.set(nodeId, connection);
    }

    this.emit(TRANSPORT_EVENT.PEER_IDENTIFIED, {nodeId, connectionId});
  }
  async handleServiceMessage(ws, message) {
    const {targetAddress, messageId, payload} = message;
    const handler = this.messageHandlers.get(targetAddress);

    if (handler) {
      try {
        const result = await handler({
          messageId,
          payload,
          sourceAddress: message.sourceAddress,
          sourceNodeId: message.sourceNodeId,
        });

        this.sendRaw(ws, buildServiceAcknowledgment(messageId, result));
      } catch (error) {
        this.sendRaw(ws, buildServiceFailureAcknowledgment(messageId, error));
      }
    } else {
      this.emit(TRANSPORT_EVENT.MESSAGE, {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });
      this.sendRaw(ws, buildServiceAcknowledgment(messageId));
    }
  }
  handleAcknowledgment(message) {
    const {messageId, acknowledged, error, type: _type, ...rest} = message;

    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(messageId);

      if (acknowledged) {
        pending.resolve({messageId, acknowledged: true, ...rest});
      } else {
        pending.reject(new Error(error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED));
      }
    }
  }
  handleConnectionClose(nodeId, ws) {
    const connection = this.connections.get(nodeId);

    if (connection) {
      if (ws && connection.ws !== ws) {
        this.logger.debug(MSG_IGNORING_CLOSE_STALE, {
          nodeId,
          isIncoming: connection.isIncoming,
        });
        return;
      }

      this.logger.info(WS_LOG_MSG.CONNECTION_CLOSED, {
        nodeId,
        connectionId: connection.connectionId,
      });

      connection.state = ConnectionState.DISCONNECTED;
      if (connection.ws) {
        try {
          connection.ws.terminate();
        } catch (_err) {
          // Best-effort terminate: socket may already be destroyed.
        }
      }
      connection.ws = null;
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
        connection.pingInterval = null;
      }

      this.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, {nodeId});
      if (!connection.isIncoming) {
        this.scheduleReconnect(connection);
      } else {
        this.connections.delete(nodeId);
      }
    }
  }
  scheduleReconnect(connectionInfo) {
    if (this.connections.get(connectionInfo.nodeId) !== connectionInfo) {
      this.logger.debug(MSG_SKIPPING_RECONNECT_SCHEDULING, {
        nodeId: connectionInfo.nodeId,
      });
      return;
    }

    if (connectionInfo.reconnectTimeout) {
      clearTimeout(connectionInfo.reconnectTimeout);
      connectionInfo.reconnectTimeout = null;
    }

    if (connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.logger.error(WS_LOG_MSG.MAX_RECONNECTS_REACHED, {
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

    this.logger.debug(WS_LOG_MSG.SCHEDULING_RECONNECT, {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });

    connectionInfo.reconnectTimeout = setTimeout(async () => {
      connectionInfo.reconnectTimeout = null;
      if (this.connections.get(connectionInfo.nodeId) !== connectionInfo) {
        this.logger.debug(MSG_SKIPPING_RECONNECT_EXECUTION, {
          nodeId: connectionInfo.nodeId,
        });
        return;
      }
      if (this.shutdownCalled) {
        return;
      }
      try {
        await this.establishConnection(connectionInfo);
      } catch (error) {
        this.logger.error(WS_LOG_MSG.RECONNECT_FAILED, {
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        if (!this.shutdownCalled &&
            this.connections.get(connectionInfo.nodeId) === connectionInfo) {
          this.scheduleReconnect(connectionInfo);
        }
      }
    }, delay);
    if (typeof connectionInfo.reconnectTimeout.unref === TRANSPORT_TYPEOF.FUNCTION) {
      connectionInfo.reconnectTimeout.unref();
    }
  }
  startPingInterval(connectionInfo) {
    connectionInfo.pingInterval = setInterval(() => {
      if (connectionInfo.ws &&
          connectionInfo.ws.readyState === WebSocket.OPEN) {
        this.sendRaw(connectionInfo.ws, {
          type: WSMessageType.PING,
          timestamp: Date.now(),
        });
      }
    }, this.pingIntervalMs);
    connectionInfo.pingInterval.unref();
  }
  register(address, handler) {
    if (typeof handler !== TRANSPORT_TYPEOF.FUNCTION) {
      throw new Error(TRANSPORT_ERROR_MSG.HANDLER_MUST_BE_FUNCTION);
    }

    this.messageHandlers.set(address, handler);

    this.logger.debug(WS_LOG_MSG.HANDLER_REGISTERED, {
      address,
      transportId: this.transportId,
    });
  }
  unregister(address) {
    this.messageHandlers.delete(address);
  }
  async deliver(targetAddress, message, options = {}) {
    const {targetNodeId} = options;
    const messageId = message.messageId || uuidv4();
    this.messageCount += TRANSPORT_NUM.ONE;

    const connection = targetNodeId ?
      this.connections.get(targetNodeId) :
      findConnectedConnection(this.connections);

    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      return buildNoConnectionResult(messageId);
    }

    return this.sendMessage(connection, targetAddress, messageId, message);
  }
  sendMessage(connection, targetAddress, messageId, payload) {
    return new Promise((resolve, reject) => {
      const message = buildDeliveryMessage({
        messageId,
        targetAddress,
        sourceAddress: this.localAddress,
        sourceNodeId: this.localNodeId,
        payload,
      });
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        resolve(buildMessageTimeoutResult(messageId));
      }, this.messageTimeoutMs);
      this.pendingMessages.set(messageId, buildPendingMessageRecord({
        messageId,
        resolve,
        reject,
        timeout,
      }));
      this.sendRaw(connection.ws, message);
    });
  }
  sendRaw(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  getConnectionState(nodeId) {
    const connection = this.connections.get(nodeId);
    return connection ? connection.state : null;
  }
  getConnectedNodes() {
    const connected = [];
    for (const [nodeId, connection] of this.connections) {
      if (connection.state === ConnectionState.CONNECTED) {
        connected.push(nodeId);
      }
    }
    return connected;
  }
  getStats() {
    return buildTransportStats({
      transportId: this.transportId,
      localNodeId: this.localNodeId,
      localAddress: this.localAddress,
      initialized: this.initialized,
      messageCount: this.messageCount,
      pendingMessageCount: this.pendingMessages.size,
      connections: this.connections,
      connectedNodeCount: this.getConnectedNodes().length,
    });
  }
  async shutdown() {
    this.shutdownCalled = true;
    this.logger.debug(WS_LOG_MSG.SHUTTING_DOWN, {
      transportId: this.transportId,
    });
    for (const [, connection] of this.connections) {
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }
      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
        connection.reconnectTimeout = null;
      }
      if (connection.ws) {
        connection.ws.terminate();
      }
    }
    if (this.server) {
      for (const client of this.server.clients || []) {
        client.terminate();
      }

      const httpServer = this.server._server || null;

      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      if (httpServer) {
        if (typeof httpServer.closeAllConnections === TRANSPORT_TYPEOF.FUNCTION) {
          httpServer.closeAllConnections();
        }
        await new Promise((resolve) => {
          httpServer.close(resolve);
        });
        if (typeof httpServer.unref === TRANSPORT_TYPEOF.FUNCTION) {
          httpServer.unref();
        }
      }
    }
    for (const [, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(WS_ERROR_MSG.SHUTDOWN));
    }

    this.connections.clear();
    this.pendingMessages.clear();
    this.messageHandlers.clear();
    this.initialized = false;

    this.emit(TRANSPORT_EVENT.SHUTDOWN, {transportId: this.transportId});
  }
}

export {
  WebSocketTransport,
  ConnectionState,
  WSMessageType,
};
