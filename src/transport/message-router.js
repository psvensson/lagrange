import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {MessageRouterSegment3} from './message-router-segment-3.js';

const {
  ConnectionState,
  OutboundDeliveryPriority,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  RouterMessageType,
  TRANSPORT_DEFAULT,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  WebSocket,
  buildQueueWaitSummary,
  countInFlightByPriority,
  countPendingByPriority,
  resolveBackgroundInFlightLimit,
  resolveBackgroundPendingLimit,
} = MESSAGE_ROUTER_SHARED;

class MessageRouter extends MessageRouterSegment3 {
  getStats() {
    const connectionStats = {};
    for (const [nodeId, connection] of this.nodeConnections) {
      connectionStats[nodeId] = {
        state: connection.state,
        isIncoming: connection.isIncoming,
        reconnectAttempts: connection.reconnectAttempts,
        ackTimeoutStreak: connection.ackTimeoutStreak || TRANSPORT_NUM.ZERO,
      };
    }
    const outboundQueueStats = {};
    for (const [nodeId, queue] of this.outboundQueues) {
      outboundQueueStats[nodeId] = {
        inFlight: queue.inFlight,
        inFlightCritical: countInFlightByPriority(
          queue,
          OutboundDeliveryPriority.CRITICAL,
        ),
        inFlightBackground: countInFlightByPriority(
          queue,
          OutboundDeliveryPriority.BACKGROUND,
        ),
        pending: queue.pending.length,
        pendingCritical: countPendingByPriority(queue, OutboundDeliveryPriority.CRITICAL),
        pendingBackground: countPendingByPriority(queue, OutboundDeliveryPriority.BACKGROUND),
        criticalReserve: queue.criticalReserve,
        backgroundPendingLimit: resolveBackgroundPendingLimit(queue),
        backgroundMaxConcurrent: resolveBackgroundInFlightLimit(queue),
        maxConcurrent: queue.maxConcurrent,
        maxPending: queue.maxPending,
        queueWait: buildQueueWaitSummary(queue),
      };
    }
    return {
      routerId: this.routerId,
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      advertisedAddress: this.advertisedAddress,
      initialized: this.initialized,
      messageCount: this.messageCount,
      pendingMessages: this.pendingMessages.size,
      pendingResponses: this.pendingResponses.size,
      serviceResponseDispositions: this.getServiceResponseDispositionCounts(),
      handlers: this.handlers.size,
      connections: connectionStats,
      connectedNodes: this.getConnectedNodes().length,
      outboundQueues: outboundQueueStats,
    };
  }
  /**
   * Summarize current outbound queue pressure across all peer queues.
   * @return {Object} Pressure summary.
   */
  getOutboundPressureSummary() {
    return this.outboundDeliveryRegistryOwner.buildPressureSummary();
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
    const shutdownError = new Error(ROUTER_ERROR_MSG.SHUTDOWN);
    for (const [, pending] of this.pendingResponses) {
      clearTimeout(pending.timeoutId);
      pending.reject(shutdownError);
    }
    this.pendingResponses.clear();
    this.retiredPendingResponses.clear();
    this.serviceResponseDispositionCounts.clear();
    for (const [, pending] of this.pendingPings) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    }
    this.pendingPings.clear();
    for (const [nodeId] of this.outboundQueues) {
      this.failOutboundQueueGracefully(nodeId, shutdownError);
    }
    this.outboundQueues.clear();
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
            ws.terminate();
          }));
        }
      }
    }
    if (closePromises.length > TRANSPORT_NUM.ZERO) {
      let timeoutId;
      await Promise.race([Promise.all(closePromises), new Promise((resolve) => {
        timeoutId = setTimeout(resolve, TRANSPORT_DEFAULT.SHUTDOWN_WAIT_MS);
      })]).finally(() => {
        clearTimeout(timeoutId);
      });
    }
    if (this.server) {
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
    this.emit(TRANSPORT_EVENT.SHUTDOWN, {
      routerId: this.routerId,
    });
  }
}
export {
  ConnectionState,
  MessageRouter,
  RouterMessageType,
};

