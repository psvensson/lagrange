/**
 * RouterDeliveryManager - Message delivery for MessageRouter.
 *
 * Handles message delivery including:
 * - Direct WebSocket delivery
 * - TransportRegistry-based delivery with fallback
 * - Correlation ID enrichment
 *
 * Requirements: 1.2, 1.4
 *
 * @module transport/router-delivery-manager
 */

import {v4 as uuidv4} from 'uuid';
import {
  CONNECTION_STATE,
  ROUTER_ADDRESS,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_MESSAGE_TYPE,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_NUM,
  TRANSPORT_STRING,
} from '../constants/transport.js';
import {COLUMN} from '../constants/index.js';
import {
  getOrCreateCorrelationId,
  withCorrelationId,
} from '../utils/correlation.js';
import {isRaftPacket} from '../raft/raft-packet-utils.js';

const LOCAL_STR_DELIVERY_FAILED = 'DELIVERY_FAILED';
const LOCAL_STR_DELIVERY_FAILED_2 = 'Delivery failed';

const ConnectionState = CONNECTION_STATE;
const RouterMessageType = ROUTER_MESSAGE_TYPE;

/**
 * RouterDeliveryManager handles message delivery for MessageRouter.
 */
class RouterDeliveryManager {
  /**
   * Create a new RouterDeliveryManager.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.logger - Logger instance.
   * @param {Map} options.nodeConnections - Map of node connections.
   * @param {Map} options.pendingMessages - Map of pending messages.
   * @param {number} options.messageTimeoutMs - Message timeout in ms.
   * @param {Function} options.sendRaw - Function to send raw messages.
   * @param {Function} options.parseAddress - Function to parse addresses.
   * @param {Function} options.isValidAddress - Function to validate addresses.
   * @param {Function} options.hasTransportRegistry - Function to check registry.
   * @param {Function} options.getTransportRegistry - Function to get registry.
   * @param {Function} options.getConnectionPool - Function to get pool.
   * @param {Object} options.outboundQueue - Outbound queue instance.
   */
  constructor(options) {
    this.nodeId = options.nodeId;
    this.logger = options.logger;
    this.nodeConnections = options.nodeConnections;
    this.pendingMessages = options.pendingMessages;
    this.messageTimeoutMs = options.messageTimeoutMs;
    this.sendRaw = options.sendRaw;
    this.parseAddress = options.parseAddress;
    this.isValidAddress = options.isValidAddress;
    this.hasTransportRegistry = options.hasTransportRegistry;
    this.getTransportRegistry = options.getTransportRegistry;
    this.getConnectionPool = options.getConnectionPool;
    this.outboundQueue = options.outboundQueue;

    /** Pending responses awaiting SERVICE_RESPONSE from remote handlers. */
    this.pendingResponses = new Map();
  }

  /**
   * Deliver a message to a target service.
   * Note: Message counting is handled by MessageRouter.deliver() to ensure
   * count increments even on delivery failure.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @param {Object} options - Delivery options.
   * @return {Promise<Object>} Delivery result.
   */
  async deliver(targetAddress, message, options = {}) {
    const correlationId = getOrCreateCorrelationId(message);
    const enrichedMessage = withCorrelationId(message, correlationId);
    const messageId = enrichedMessage.messageId || uuidv4();

    if (!this.isValidAddress(targetAddress)) {
      const stack = new Error().stack;
      this.logger.error(ROUTER_LOG_MSG.INVALID_ADDRESS, {
        correlationId,
        targetAddress,
        stack: stack.split(TRANSPORT_STRING.NEWLINE)
          .slice(TRANSPORT_NUM.TWO, TRANSPORT_NUM.SIX),
      });
      throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(targetAddress));
    }

    this.logger.debug(ROUTER_LOG_MSG.SENDING_MESSAGE, {
      correlationId,
      targetAddress,
      type: enrichedMessage.type,
      messageId,
    });

    const parsed = this.parseAddress(targetAddress);
    const targetNodeId = options.targetNodeId || parsed.nodeId;

    if (this.hasTransportRegistry()) {
      const result = await this.deliverViaTransportRegistry(
        targetAddress, messageId, enrichedMessage, targetNodeId,
      );
      return {...result, correlationId};
    }

    if (targetNodeId === this.nodeId) {
      const selfConn = this.nodeConnections.get(this.nodeId);
      const hasSelfConn = selfConn && selfConn.state === ConnectionState.CONNECTED;
      if (!hasSelfConn) {
        this.logger.warn(ROUTER_LOG_MSG.NO_SELF_CONNECTION, {
          correlationId, targetAddress, nodeId: this.nodeId,
        });
        return {
          messageId, correlationId, acknowledged: false,
          error: ROUTER_ERROR_MSG.noConnectionToNode(this.nodeId),
        };
      }
    }

    const result = await this.deliverRemote(
      targetAddress, messageId, enrichedMessage, targetNodeId,
    );
    return {...result, correlationId};
  }

  /**
   * Deliver via TransportRegistry with fallback.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<Object>} Delivery result.
   */
  async deliverViaTransportRegistry(targetAddress, messageId, payload, targetNodeId) {
    const transportRegistry = this.getTransportRegistry();
    const connectionPool = this.getConnectionPool();

    this.logger.debug(ROUTER_LOG_MSG.TRANSPORT_DELIVERY_START, {
      messageId, targetAddress, targetNodeId,
    });

    const candidates = transportRegistry.getDeliveryCandidates(targetNodeId);
    if (candidates.length === TRANSPORT_NUM.ZERO) {
      this.logger.warn(ROUTER_LOG_MSG.TRANSPORT_NO_ENDPOINTS, {
        messageId, targetNodeId,
      });
      return {
        messageId, acknowledged: false, success: false,
        error: ROUTER_ERROR_MSG.NO_ENDPOINTS_FOR_NODE,
        errorMessage: ROUTER_ERROR_MSG.noEndpointsForNode(targetNodeId),
      };
    }

    const attempts = [];
    for (const candidate of candidates) {
      const endpoint = candidate.endpoint;
      const provider = candidate.provider;
      const transportType = endpoint[COLUMN.TRANSPORT_TYPE];

      this.logger.debug(ROUTER_LOG_MSG.TRANSPORT_ENDPOINT_SELECTED, {
        messageId, targetNodeId, endpointId: endpoint[COLUMN.ENDPOINT_ID],
        transportType, priority: endpoint[COLUMN.PRIORITY],
      });

      const result = await this.deliverViaEndpoint(
        targetAddress, messageId, payload, targetNodeId, endpoint, provider, connectionPool,
      );

      if (result.acknowledged) {
        this.logger.debug(ROUTER_LOG_MSG.TRANSPORT_DELIVERY_SUCCESS, {
          messageId, targetNodeId, transportType, endpointId: endpoint[COLUMN.ENDPOINT_ID],
        });
        return {
          ...result, success: true,
          transportUsed: {
            endpointId: endpoint[COLUMN.ENDPOINT_ID],
            transportType, priority: endpoint[COLUMN.PRIORITY],
          },
        };
      }

      this.logger.debug(ROUTER_LOG_MSG.TRANSPORT_DELIVERY_FAILED, {
        messageId, targetNodeId, transportType,
        endpointId: endpoint[COLUMN.ENDPOINT_ID], error: result.error,
      });

      attempts.push({
        endpoint: {
          endpointId: endpoint[COLUMN.ENDPOINT_ID],
          transportType, priority: endpoint[COLUMN.PRIORITY],
        },
        error: {
          code: LOCAL_STR_DELIVERY_FAILED,
          message: result.error || LOCAL_STR_DELIVERY_FAILED_2,
        },
      });
    }

    this.logger.warn(ROUTER_LOG_MSG.TRANSPORT_ALL_FAILED, {
      messageId, targetNodeId, attemptCount: attempts.length,
    });

    return {
      messageId, acknowledged: false, success: false,
      error: ROUTER_ERROR_MSG.ALL_TRANSPORTS_FAILED, attempts,
    };
  }

  /**
   * Deliver via specific endpoint.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @param {Object} endpoint - Endpoint to use.
   * @param {Object} provider - Transport provider.
   * @param {Object} connectionPool - Connection pool.
   * @return {Promise<Object>} Delivery result.
   */
  async deliverViaEndpoint(
    targetAddress, messageId, payload, targetNodeId, endpoint, provider, connectionPool,
  ) {
    try {
      const connection = await connectionPool.getConnection(targetNodeId, endpoint, provider);
      const message = {
        type: RouterMessageType.SERVICE_MESSAGE,
        messageId, targetAddress,
        sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
        sourceNodeId: this.nodeId, payload, timestamp: Date.now(),
      };
      const result = await provider.send(connection.providerConnection, message);
      connectionPool.releaseConnection(targetNodeId);
      return {messageId, acknowledged: true, ...result};
    } catch (error) {
      this.logger.error(ROUTER_LOG_MSG.TRANSPORT_DELIVERY_FAILED, {
        messageId, targetNodeId, endpointId: endpoint[COLUMN.ENDPOINT_ID], error: error.message,
      });
      return {messageId, acknowledged: false, error: error.message};
    }
  }

  /**
   * Deliver via WebSocket.
   * Raft packets bypass the outbound queue entirely for low-latency
   * consensus communication. Non-Raft messages are enqueued as before.
   * Requirements: 1.1, 1.2, 1.3, 1.4
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<Object>} Delivery result.
   */
  async deliverRemote(targetAddress, messageId, payload, targetNodeId) {
    if (isRaftPacket(payload)) {
      return this.deliverRaftDirect(
        targetAddress, messageId, payload, targetNodeId,
      );
    }

    // Register pending response BEFORE sending so we don't miss
    // a SERVICE_RESPONSE that arrives before we register.
    const responsePromise = this.registerPendingResponse(
      messageId, this.messageTimeoutMs,
    );

    // Enqueue the send — the ACK releases the outbound queue slot.
    const ackResult = await this.outboundQueue.enqueueOutbound(
      targetNodeId, () => {
        const connection = this.nodeConnections.get(targetNodeId);
        if (!connection ||
            connection.state !== ConnectionState.CONNECTED) {
          this.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, {
            messageId, targetAddress, targetNodeId,
            localNodeId: this.nodeId,
            connectionExists: !!connection,
            connectionState: connection?.state,
            availableConnections: Array.from(
              this.nodeConnections.keys()),
          });
          return {
            messageId, acknowledged: false,
            error: ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
          };
        }
        return this.sendMessage(
          connection, targetAddress, messageId, payload, targetNodeId,
        );
      });

    // If ACK failed, clean up pending response and return failure.
    if (!ackResult.acknowledged) {
      const pending = this.pendingResponses.get(messageId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingResponses.delete(messageId);
      }
      return ackResult;
    }

    // Wait for the SERVICE_RESPONSE with the handler result.
    try {
      const handlerResult = await responsePromise;
      return {
        messageId,
        acknowledged: true,
        success: true,
        ...handlerResult,
      };
    } catch (error) {
      return {
        messageId,
        acknowledged: true,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Deliver a Raft packet directly via WebSocket, bypassing the
   * outbound queue. This ensures Raft consensus messages are never
   * delayed by application message traffic or queue backpressure.
   * Requirements: 1.1, 1.3
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Raft packet payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Object} Delivery result with direct flag.
   */
  deliverRaftDirect(targetAddress, messageId, payload, targetNodeId) {
    const connection = this.nodeConnections.get(targetNodeId);
    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      this.logger.warn(ROUTER_LOG_MSG.RAFT_DIRECT_DELIVERY_FAILED, {
        messageId, targetAddress, targetNodeId,
        localNodeId: this.nodeId,
        connectionExists: !!connection,
        connectionState: connection?.state,
      });
      return {
        messageId,
        acknowledged: false,
        error: ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
      };
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
      messageId, targetAddress, targetNodeId,
    });
    this.sendRaw(connection.ws, message);
    return {messageId, acknowledged: true, direct: true};
  }

  /**
   * Send message through WebSocket.
   * Resolves the returned promise immediately when the ACK arrives.
   * Requirements: 2.4
   * @param {Object} connection - Connection info.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<Object>} Send result.
   */
  sendMessage(connection, targetAddress, messageId, payload, targetNodeId) {
    return new Promise((resolve, reject) => {
      const message = {
        type: RouterMessageType.SERVICE_MESSAGE,
        messageId, targetAddress,
        sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
        sourceNodeId: this.nodeId, payload, timestamp: Date.now(),
      };

      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        resolve({
          messageId,
          acknowledged: false,
          error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
        });
      }, this.messageTimeoutMs);

      this.pendingMessages.set(messageId, {
        messageId, resolve, reject, timeout,
        sentAt: Date.now(), targetNodeId,
      });

      this.sendRaw(connection.ws, message);
    });
  }

  /**
   * Register a pending response for a message that expects a handler
   * result (not just an ACK). The returned promise resolves when the
   * corresponding SERVICE_RESPONSE arrives, or rejects on timeout.
   * Requirements: 2.5, 2.6
   * @param {string} messageId - Original message ID to correlate.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {Promise<*>} Resolves with handler result or rejects.
   */
  registerPendingResponse(messageId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(messageId);
        reject(new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT));
      }, timeoutMs);
      this.pendingResponses.set(messageId, {resolve, reject, timeoutId});
    });
  }

  /**
   * Resolve a pending response when a SERVICE_RESPONSE arrives.
   * Called by MessageRouter when RouterMessageHandler forwards a
   * SERVICE_RESPONSE message.
   * Requirements: 2.5
   * @param {string} messageId - Original message ID.
   * @param {*} result - Handler result (when successful).
   * @param {string} error - Error message (when handler failed).
   * @return {boolean} True if a pending response was found and resolved.
   */
  resolvePendingResponse(messageId, result, error) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending) return false;
    clearTimeout(pending.timeoutId);
    this.pendingResponses.delete(messageId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
    return true;
  }

  /**
   * Clean up all pending responses on shutdown.
   * Rejects all outstanding pending responses and clears timeouts.
   * @param {string} reason - Shutdown reason message.
   */
  clearPendingResponses(reason) {
    for (const [messageId, pending] of this.pendingResponses) {
      clearTimeout(pending.timeoutId);
      pending.resolve({
        messageId,
        acknowledged: false,
        error: reason,
        shutdown: true,
      });
      this.pendingResponses.delete(messageId);
    }
  }
}

export {RouterDeliveryManager};
