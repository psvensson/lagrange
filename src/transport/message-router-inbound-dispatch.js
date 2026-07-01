import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  ConnectionState,
  INCOMING_CONNECTION_ADOPTION,
  MESSAGE_ROUTER_LITERAL,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  RouterMessageType,
  SERVICE_RESPONSE_DISPOSITION_KIND,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  normalizeToWebSocketAddress,
} = MESSAGE_ROUTER_SHARED;

/**
 * Inbound dispatch for the message router: parse incoming frames, record peer
 * liveness, route control frames (IDENTIFY/PING/PONG/ACK), adopt or rekey
 * incoming connections on identification, and fan service messages/responses
 * out to registered handlers and pending waiters.
 */
class MessageRouterInboundDispatch {
  /**
   * Record inbound traffic from a peer (any parsed message on any socket).
   * Used as liveness evidence by the ACK-timeout quarantine guard.
   * @param {string} nodeId - Peer node id (or connection id pre-identify).
   * @return {void}
   */
  recordNodeInboundActivity(nodeId) {
    if (typeof nodeId === TRANSPORT_TYPEOF.STRING && nodeId.length > TRANSPORT_NUM.ZERO) {
      this.nodeInboundActivityAt.set(nodeId, Date.now());
    }
  }
  /**
   * @param {string} nodeId - Peer node id.
   * @return {number|null} Timestamp of last inbound traffic from the peer.
   */
  getNodeInboundActivityAt(nodeId) {
    return this.nodeInboundActivityAt.get(nodeId) ?? null;
  }
  handleMessage(connectionId, ws, data) {
    try {
      const message = JSON.parse(data.toString());
      this.recordNodeInboundActivity(connectionId);
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
        this.nodeInboundActivityAt.delete(connectionId);
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
        // Migrate the pre-identify inbound-activity stamp to the node key so
        // raw connection-id keys never accumulate across reconnect churn.
        const preIdentifyActivityAt =
          this.nodeInboundActivityAt.get(connectionId);
        this.nodeInboundActivityAt.delete(connectionId);
        if (preIdentifyActivityAt) {
          this.nodeInboundActivityAt.set(
            nodeId,
            Math.max(
              preIdentifyActivityAt,
              this.nodeInboundActivityAt.get(nodeId) || TRANSPORT_NUM.ZERO,
            ),
          );
        }
        this.nodeConnections.set(nodeId, connection);
        this.logger.info(ROUTER_LOG_MSG.REKEYED_CONNECTION, {
          oldKey: connectionId,
          newKey: nodeId,
          localNodeId: this.nodeId,
        });
        // Arm the keepalive on the adopted inbound connection. The outbound
        // dialer pings this side; without a ping from this side too, a half-open
        // inbound socket to a peer that died without a clean TCP close (e.g. a
        // hard restart) would linger undetected here with no liveness probe and
        // no re-dial. The adopted record carries a configuredAddress, so the
        // pong-timeout sever drives handleConnectionClose -> scheduleReconnect.
        this.startPingInterval(connection);
      } else {
        this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, {
          connectionId,
          nodeId,
          reason: MESSAGE_ROUTER_LITERAL.STRING_EXISTING_CONNECTION_PREFERRED,
        });
        this.retireConnection(connection);
        this.nodeConnections.delete(connectionId);
        this.nodeInboundActivityAt.delete(connectionId);
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
      // A non-error response that arrives after its waiter was retired still
      // proves the peer received and handled the request. When the caller
      // supplied an opaque responseContext, surface the late confirmation so the
      // caller can stop re-driving a duplicate. The absorb disposition, log, and
      // counters are unchanged for callers with no listener.
      if (disposition.responseContext && !error) {
        this.emit(TRANSPORT_EVENT.LATE_RESPONSE_HONORED, {
          messageId,
          deliverySource: disposition.deliverySource,
          targetNodeId: disposition.targetNodeId,
          responseContext: disposition.responseContext,
          retiredReason: disposition.retiredReason,
        });
      }
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
}

function defineMessageRouterInboundDispatch(serviceClass) {
  Object.defineProperties(
    serviceClass.prototype,
    Object.fromEntries(
      Object.entries(
        Object.getOwnPropertyDescriptors(
          MessageRouterInboundDispatch.prototype,
        ),
      ).filter(([name]) => name !== 'constructor'),
    ),
  );
}

export {defineMessageRouterInboundDispatch};
