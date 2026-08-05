import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  ConnectionState,
  HOST,
  INPROC,
  IPV6_ANY_HOST,
  IPV6_HOST_PREFIX,
  IPV6_HOST_SUFFIX,
  MESSAGE_ROUTER_LITERAL,
  ROUTER_LOG_MSG,
  RouterMessageType,
  TRANSPORT_DEFAULT,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  URL,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
  WebSocket,
  createInProcWebSocketPair,
  normalizeToWebSocketAddress,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;


class MessageRouterConnectionLifecycleMethods {
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
    if (!connectionInfo) {
      return;
    }
    if (connectionInfo.keepalivePongTimer) {
      clearTimeout(connectionInfo.keepalivePongTimer);
      connectionInfo.keepalivePongTimer = null;
    }
    if (connectionInfo.keepalivePingId) {
      this.pendingPings.delete(connectionInfo.keepalivePingId);
      connectionInfo.keepalivePingId = null;
    }
    if (!connectionInfo.pingInterval) {
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
    try {
      await this.establishConnection(connectionInfo);
    } catch (error) {
      if (options.autoReconnect !== false) {
        this.handleConnectionClose(nodeId, connectionInfo.connectionId);
      }
      throw error;
    }
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
        const attempts = connectionInfo.reconnectAttempts || TRANSPORT_NUM.ZERO;
        const currentConnectTimeoutMs = Math.min(
          30000,
          this.connectTimeoutMs + attempts * 5000,
        );
        let connectTimeout = setTimeout(() => {
          const error = new Error(
            `WebSocket connection timeout after ${currentConnectTimeoutMs}ms`,
          );
          error.code = WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE;
          rejectPendingConnection(error);
          try {
            ws.terminate();
          } catch (_error) {
            void _error;
          }
        }, currentConnectTimeoutMs);
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
            const current =
              this.nodeConnections.get(connectionInfo.nodeId) || null;
            const currentIsLive = Boolean(
              current &&
                current.state === ConnectionState.CONNECTED &&
                current.ws,
            );
            if (currentIsLive) {
              // A healthy connection already won this peer slot; drop this
              // redundant dial rather than flapping the live connection.
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
            // The current record is dead/non-connected (e.g. a stalled inbound
            // or reconnecting owner). Let this freshly-opened outbound take over
            // so an inbound/outbound establish race cannot strand the peer with
            // no live connection. resolveIncomingConnectionAdoption still dedups
            // deterministically once a side is CONNECTED.
            if (current && current !== connectionInfo) {
              this.retireConnection(current);
            }
            this.nodeConnections.set(connectionInfo.nodeId, connectionInfo);
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
    // Stamp this boot's incarnation so receivers fence stale-incarnation
    // (zombie) identifications. 0 (pre-incarnation) leaves the field OFF the
    // frame — the UNKNOWN compat policy.
    if (this.bootIncarnation > TRANSPORT_NUM.ZERO) {
      message.bootIncarnation = this.bootIncarnation;
    }
    if (this.identifyPayload && !connectionInfo.isSelfConnection) {
      message.bootstrap = this.identifyPayload;
    }
    this.sendRaw(connectionInfo.ws, message);
  }
}

function createMessageRouterConnectionLifecycleMethods() {
  return Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(
        MessageRouterConnectionLifecycleMethods.prototype,
      ),
    ).filter(([name]) => name !== 'constructor'),
  );
}

export {createMessageRouterConnectionLifecycleMethods};
