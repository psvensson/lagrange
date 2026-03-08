/**
 * RouterMessageHandler - Handles incoming WebSocket messages for MessageRouter.
 * Extracts message handling logic from MessageRouter for better separation of concerns.
 *
 * @module transport/router-message-handler
 */

import {
  CONNECTION_STATE,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_MESSAGE_TYPE,
  TRANSPORT_EVENT,
} from '../constants/transport.js';

const RouterMessageType = ROUTER_MESSAGE_TYPE;
const ConnectionState = CONNECTION_STATE;

/**
 * RouterMessageHandler handles all incoming WebSocket message processing.
 * It dispatches messages to appropriate handlers based on message type.
 */
class RouterMessageHandler {
  /**
   * Create a new RouterMessageHandler.
   * @param {Object} options - Configuration options.
   * @param {Object} options.logger - Logger instance.
   * @param {Map} options.handlers - Map of address to handler functions.
   * @param {Map} options.pendingMessages - Map of pending message promises.
   * @param {Map} options.pendingPings - Map of pending ping promises.
   * @param {Map} options.nodeConnections - Map of node connections.
   * @param {string} options.nodeId - Local node ID.
   * @param {Function} options.sendRaw - Function to send raw WebSocket messages.
   * @param {Function} options.emit - Function to emit events.
   * @param {Function} options.getJoinRequestHandler - Function to get join request handler.
   * @param {Function} options.getJoinCompleteHandler - Function to get join complete handler.
   * @param {Function} options.onServiceResponse - Callback for SERVICE_RESPONSE messages.
   */
  constructor(options) {
    this.logger = options.logger;
    this.handlers = options.handlers;
    this.pendingMessages = options.pendingMessages;
    this.pendingPings = options.pendingPings;
    this.nodeConnections = options.nodeConnections;
    this.nodeId = options.nodeId;
    this.sendRaw = options.sendRaw;
    this.emit = options.emit;
    this.getJoinRequestHandler = options.getJoinRequestHandler;
    this.getJoinCompleteHandler = options.getJoinCompleteHandler;
    this.onServiceResponse = options.onServiceResponse;
  }

  /**
   * Handle incoming WebSocket message.
   * Parses message and dispatches to appropriate handler.
   * @param {string} connectionId - Connection ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Buffer|string} data - Raw message data.
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

      // Handle SERVICE_RESPONSE (deferred handler result)
      if (message.type === RouterMessageType.SERVICE_RESPONSE) {
        this.handleServiceResponse(message);
        return;
      }

      // Handle service message
      if (message.type === RouterMessageType.SERVICE_MESSAGE) {
        this.handleServiceMessage(ws, message);
        return;
      }

      // Handle JOIN_REQUEST from joining nodes
      if (message.type === RouterMessageType.JOIN_REQUEST) {
        this.handleJoinRequest(ws, message);
        return;
      }

      // Handle JOIN_COMPLETE from joining nodes
      if (message.type === RouterMessageType.JOIN_COMPLETE) {
        this.handleJoinComplete(ws, message);
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
      const existingConnected = Boolean(existing) &&
        existing.state === ConnectionState.CONNECTED;
      const preferIncomingConnection =
        this.nodeId.localeCompare(nodeId) > 0;
      const shouldAdoptIncomingConnection = !existing ||
        (!isSelfConnection &&
          (!existingConnected || preferIncomingConnection));

      if (isSelfConnection) {
        this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, {
          connectionId,
          nodeId,
          reason: ROUTER_LOG_MSG.SELF_CONNECTION_ALREADY_REGISTERED,
        });
      } else if (shouldAdoptIncomingConnection) {
        if (existing &&
            existing.ws &&
            existing.connectionId !== connectionId) {
          try {
            existing.ws.terminate();
          } catch (error) {
            this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {
              nodeId,
              error: error.message,
            });
          }
        }
        if (existing &&
            this.nodeConnections.get(nodeId) === existing) {
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
          reason: 'existing_connection_preferred',
        });
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
   * Sends ACK immediately to release the sender's outbound queue slot,
   * then invokes the handler asynchronously and sends a SERVICE_RESPONSE
   * with the handler result or error.
   * Requirements: 2.1, 2.2, 2.3
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Service message.
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

    // Send ACK immediately — release outbound queue slot on sender
    this.sendRaw(ws, {
      type: RouterMessageType.ACK,
      messageId,
      acknowledged: true,
    });

    // Find handler for target address
    const handler = this.handlers.get(targetAddress);

    if (!handler) {
      // No handler - send SERVICE_RESPONSE with error and emit event
      this.sendRaw(ws, {
        type: RouterMessageType.SERVICE_RESPONSE,
        messageId,
        sourceAddress: message.sourceAddress,
        error: ROUTER_ERROR_MSG.noHandlerForAddress(targetAddress),
      });
      this.emit(TRANSPORT_EVENT.MESSAGE, {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });
      return;
    }

    // Create envelope similar to InMemoryTransport
    const envelope = {
      messageId,
      sourceAddress: message.sourceAddress,
      sourceNodeId: message.sourceNodeId,
      targetAddress,
      payload,
      timestamp: message.timestamp,
    };

    // Invoke handler asynchronously, send SERVICE_RESPONSE when done
    // Use a function wrapper to ensure synchronous throws from
    // the handler are caught by the promise chain.
    new Promise((resolve) => resolve(handler(envelope)))
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
   * Handle JOIN_REQUEST message from a joining node.
   * Invokes the registered join request handler and sends JOIN_RESPONSE.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - JOIN_REQUEST message.
   */
  handleJoinRequest(ws, message) {
    const joinRequestHandler = this.getJoinRequestHandler();

    this.logger.info(ROUTER_LOG_MSG.JOIN_REQUEST_RECEIVED, {
      nodeId: message.nodeId,
      address: message.address,
      hasHandler: !!joinRequestHandler,
    });

    if (!joinRequestHandler) {
      this.sendRaw(ws, {
        type: RouterMessageType.JOIN_RESPONSE,
        success: false,
        messageGroupAssignment: null,
        error: ROUTER_ERROR_MSG.JOIN_HANDLER_NOT_REGISTERED,
      });
      return;
    }

    try {
      const response = joinRequestHandler(message);

      Promise.resolve(response)
        .then((result) => {
          this.sendRaw(ws, result);
          this.logger.info(ROUTER_LOG_MSG.JOIN_RESPONSE_SENT, {
            nodeId: message.nodeId,
            success: result.success,
          });
        })
        .catch((error) => {
          this.logger.error(ROUTER_LOG_MSG.JOIN_REQUEST_FAILED, {
            nodeId: message.nodeId,
            error: error.message,
          });
          this.sendRaw(ws, {
            type: RouterMessageType.JOIN_RESPONSE,
            success: false,
            messageGroupAssignment: null,
            error: error.message,
          });
        });
    } catch (error) {
      this.logger.error(ROUTER_LOG_MSG.JOIN_REQUEST_FAILED, {
        nodeId: message.nodeId,
        error: error.message,
      });
      this.sendRaw(ws, {
        type: RouterMessageType.JOIN_RESPONSE,
        success: false,
        messageGroupAssignment: null,
        error: error.message,
      });
    }
  }

  /**
   * Handle JOIN_COMPLETE message from a joining node.
   * Invokes the registered join complete handler and sends JOIN_COMPLETE_ACK.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - JOIN_COMPLETE message.
   */
  handleJoinComplete(ws, message) {
    const joinCompleteHandler = this.getJoinCompleteHandler();

    this.logger.info(ROUTER_LOG_MSG.JOIN_COMPLETE_RECEIVED, {
      nodeId: message.nodeId,
      messageGroupReplicaId: message.messageGroupReplicaId,
      ready: message.ready,
      hasHandler: !!joinCompleteHandler,
    });

    if (!joinCompleteHandler) {
      this.sendRaw(ws, {
        type: RouterMessageType.JOIN_COMPLETE_ACK,
        success: false,
        nextSteps: [],
        error: ROUTER_ERROR_MSG.JOIN_COMPLETE_HANDLER_NOT_REGISTERED,
      });
      return;
    }

    try {
      const response = joinCompleteHandler(message);

      Promise.resolve(response)
        .then((result) => {
          this.sendRaw(ws, result);
          this.logger.info(ROUTER_LOG_MSG.JOIN_COMPLETE_ACK_SENT, {
            nodeId: message.nodeId,
            success: result.success,
          });
        })
        .catch((error) => {
          this.logger.error(ROUTER_LOG_MSG.JOIN_COMPLETE_FAILED, {
            nodeId: message.nodeId,
            error: error.message,
          });
          this.sendRaw(ws, {
            type: RouterMessageType.JOIN_COMPLETE_ACK,
            success: false,
            nextSteps: [],
            error: error.message,
          });
        });
    } catch (error) {
      this.logger.error(ROUTER_LOG_MSG.JOIN_COMPLETE_FAILED, {
        nodeId: message.nodeId,
        error: error.message,
      });
      this.sendRaw(ws, {
        type: RouterMessageType.JOIN_COMPLETE_ACK,
        success: false,
        nextSteps: [],
        error: error.message,
      });
    }
  }

  /**
   * Handle acknowledgment message.
   * Passes through flat ACK structure without additional nesting.
   * @param {Object} message - Acknowledgment message.
   */
  handleAcknowledgment(message) {
    const {messageId, acknowledged, error, type: _type, ...rest} = message;

    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(messageId);

      if (acknowledged) {
        pending.resolve({messageId, acknowledged: true, ...rest});
      } else {
        pending.reject(new Error(error || 'Message not acknowledged'));
      }
    }
  }

  /**
   * Handle SERVICE_RESPONSE message (deferred handler result).
   * Forwards to the onServiceResponse callback which will be wired
   * to RouterDeliveryManager.resolvePendingResponse in task 3.2.
   * Requirements: 2.2, 2.3
   * @param {Object} message - SERVICE_RESPONSE message.
   */
  handleServiceResponse(message) {
    const {messageId, result, error} = message;

    this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_RECEIVED, {
      messageId,
      hasResult: result !== undefined,
      hasError: error !== undefined,
    });

    if (this.onServiceResponse) {
      this.onServiceResponse(messageId, result, error);
      return;
    }

    this.logger.warn(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, {
      messageId,
    });
  }
}

export {RouterMessageHandler};
