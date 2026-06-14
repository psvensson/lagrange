import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {applyBoundedJitter} from '../utils/retry-jitter.js';

const {
  CONNECTION_CLOSE_DISPOSITION,
  ConnectionState,
  MESSAGE_ROUTER_LITERAL,
  RECONNECT_DISPOSITION,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  RouterMessageType,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  WebSocket,
} = MESSAGE_ROUTER_SHARED;

/**
 * Connection-close handling and reconnect scheduling for the message router:
 * decide a close disposition (shutdown / retired / self-disconnect / reconnect),
 * drain pending work for the failed node, and drive the backoff-jittered
 * reconnect attempt loop plus the per-connection ping keepalive.
 */
class MessageRouterConnectionCloseReconnect {
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
}

function defineMessageRouterConnectionCloseReconnect(serviceClass) {
  Object.defineProperties(
    serviceClass.prototype,
    Object.fromEntries(
      Object.entries(
        Object.getOwnPropertyDescriptors(
          MessageRouterConnectionCloseReconnect.prototype,
        ),
      ).filter(([name]) => name !== 'constructor'),
    ),
  );
}

export {defineMessageRouterConnectionCloseReconnect};
