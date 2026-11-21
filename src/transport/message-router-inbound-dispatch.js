import {
  QUERY_TRACE_STAGE as STAGE,
  getOutboundServicesQueryTrace,
  isServicesQueryTraceOpen,
  isTracedServicesReadFrame,
  recordServicesQueryTrace,
} from '../diagnostics/services-query-delivery-trace.js';
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {ROUTER_IDENTIFY_CHANNEL} from '../constants/transport.js';
import {
  runTransportInboundActivity,
} from '../diagnostics/formation-owner-attribution.js';

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

const AUTH_REJECTED_EVENT = 'authenticationRejected';

function isUnidentifiedPlaceholderSocket(connection, connectionId) {
  return (
    connection.nodeId === null &&
    connection.connectionId === connectionId &&
    connection.ws.readyState === undefined
  );
}

function doesConnectionBelongToSocket(connection, connectionId, ws) {
  if (!connection || connection.retired === true) {
    return false;
  }
  if (!connection.ws || connection.ws === ws) {
    return true;
  }
  return isUnidentifiedPlaceholderSocket(connection, connectionId);
}

function inboundQueryTrace(router, message, nodeKey, connectionId) {
  const {messageId, payload, targetAddress, sourceNodeId, type} = message;
  if (type === RouterMessageType.SERVICE_MESSAGE) {
    if (!isTracedServicesReadFrame(router, targetAddress, payload, messageId)) return null;
    return (stage, fields) => recordServicesQueryTrace(router, stage, {
      messageId, targetAddress, sourceNodeId, connectionId,
      activeConnectionId: router.nodeConnections.get(nodeKey)?.connectionId,
      ...fields,
    });
  }
  if (type !== RouterMessageType.ACK && type !== RouterMessageType.SERVICE_RESPONSE) return null;
  const outbound = getOutboundServicesQueryTrace(router, messageId);
  if (!outbound) return null;
  return (stage, fields) => recordServicesQueryTrace(router, stage, {
    ...outbound, messageId, connectionId, frameType: type,
    activeConnectionId: router.nodeConnections.get(nodeKey)?.connectionId,
    ...fields,
  });
}

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
      this.nodeInboundActivityAt.set(nodeId, this.timeSource.now());
    }
  }
  /**
   * @param {string} nodeId - Peer node id.
   * @return {number|null} Timestamp of last inbound traffic from the peer.
   */
  getNodeInboundActivityAt(nodeId) {
    return this.nodeInboundActivityAt.get(nodeId) ?? null;
  }
  handleMessage(connectionId, ws, data, socketConnectionId) {
    return runTransportInboundActivity(() =>
      this.dispatchInboundMessage(connectionId, ws, data, socketConnectionId));
  }
  dispatchInboundMessage(connectionId, ws, data, socketConnectionId) {
    try {
      const message = JSON.parse(data.toString());
      const trace = isServicesQueryTraceOpen() ?
        inboundQueryTrace(this, message, connectionId, socketConnectionId) : null;
      trace?.(STAGE.FRAME_PARSED, {observedAtMs: this.timeSource.now()});
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
      if (!this.ensureInboundConnectionAuthenticated(connectionId, ws)) {
        trace?.(STAGE.FRAME_AUTH_REFUSED);
        return;
      }
      this.routeAuthenticatedInboundFrame(connectionId, ws, message, trace);
    } catch (error) {
      this.logger.error(ROUTER_LOG_MSG.MESSAGE_PARSE_FAILED, {
        connectionId,
        error: error.message,
      });
      throw error;
    }
  }
  ensureInboundConnectionAuthenticated(connectionId, ws) {
    if (this.isInboundMessageAuthenticated(connectionId)) {
      return true;
    }
    try {
      ws.terminate();
    } catch (_err) {
      void _err;
    }
    return false;
  }
  routeAuthenticatedInboundFrame(connectionId, ws, message, trace) {
    if (message.type === RouterMessageType.PING) {
      this.sendRaw(ws, {
        type: RouterMessageType.PONG,
        pingId: message.pingId || null,
        timestamp: this.timeSource.now(),
      });
      return;
    }
    if (message.type === RouterMessageType.PONG) {
      if (message.pingId && this.pendingPings.has(message.pingId)) {
        const pending = this.pendingPings.get(message.pingId);
        this.timeSource.clearTimeout(pending.timeout);
        this.pendingPings.delete(message.pingId);
        pending.resolve(true);
      }
      return;
    }
    if (message.type === RouterMessageType.ACK) {
      trace?.(STAGE.ACK_RECEIVED, {pending: this.pendingMessages.has(message.messageId),
        acknowledged: message.acknowledged === true, observedAtMs: this.timeSource.now()});
      this.handleAcknowledgment(message);
      return;
    }
    if (message.type === RouterMessageType.SERVICE_RESPONSE) {
      this.handleServiceResponse(message, trace);
      return;
    }
    if (message.type === RouterMessageType.SERVICE_MESSAGE) {
      const delivery = this.connectionAuthorityOwner.captureIncomingDelivery(connectionId, ws);
      this.handleServiceMessage(ws, message, delivery, trace);
      return;
    }
    this.logger.warn(ROUTER_LOG_MSG.MESSAGE_UNKNOWN, {
      type: message.type,
      connectionId,
    });
  }
  isInboundMessageAuthenticated(connectionId) {
    if (!this.trustProvider?.isTlsRequired()) {
      return true;
    }
    const conn = this.nodeConnections.get(connectionId);
    if (!conn || !conn.isIncoming) {
      return true;
    }
    return conn.authenticatedIdentify === true;
  }
  rejectUnauthenticatedIdentify(connectionId, connection, ws, message, authResult) {
    this.emit(AUTH_REJECTED_EVENT, {
      connectionId,
      nodeId: message?.nodeId || null,
      code: authResult.code,
      reason: authResult.reason,
    });
    if (connection && connection.isIncoming) {
      this.retireConnection(connection);
      this.nodeConnections.delete(connectionId);
      this.nodeInboundActivityAt.delete(connectionId);
    }
    try {
      ws.terminate();
    } catch (_err) {
      void _err;
    }
    return false;
  }
  verifyIncomingIdentifyTrust(connectionId, connection, ws, message) {
    if (!this.trustProvider?.isTlsRequired()) {
      return true;
    }
    const peerCert =
      connection?.peerCertificate ||
      ws?._socket?.getPeerCertificate?.(true) ||
      null;
    const authResult = this.trustProvider.verifyIdentifyFrame(
      message,
      peerCert,
      {nowMs: this.timeSource.now()},
    );
    if (!authResult.valid) {
      return this.rejectUnauthenticatedIdentify(
        connectionId,
        connection,
        ws,
        message,
        authResult,
      );
    }
    if (connection) {
      connection.authenticatedIdentify = true;
    }
    return true;
  }
  bindIncomingConnectionAddress(connection, ws, nodeId, normalizedAddress) {
    connection.nodeId = nodeId;
    connection.nodeAddress = normalizedAddress;
    connection.configuredAddress = normalizedAddress;
    this.rememberReconnectAddress(connection, ws, normalizedAddress);
  }
  rejectRefusedIncomingConnection(connectionId, connection, ws, nodeId) {
    this.retireConnection(connection);
    this.nodeConnections.delete(connectionId);
    this.nodeInboundActivityAt.delete(connectionId);
    try {
      ws.terminate();
    } catch (error) {
      this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {nodeId, error: error.message});
    }
  }
  applyIncomingAdoptionDecision(
    connectionId, connection, ws, nodeId, normalizedAddress, bootIncarnation,
  ) {
    const adoptionDecision = this.connectionAuthorityOwner.resolveIncomingConnectionAdoption(
      nodeId, bootIncarnation,
    );
    const existing = adoptionDecision.existing;
    if (adoptionDecision.state === INCOMING_CONNECTION_ADOPTION.KEEP_SELF_CONNECTION) {
      this.bindIncomingConnectionAddress(connection, ws, nodeId, normalizedAddress);
      this.connectionAuthorityOwner.bindCurrentPrimaryBootIncarnation(
        nodeId, existing, bootIncarnation,
      );
      this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, {
        connectionId, nodeId, reason: ROUTER_LOG_MSG.SELF_CONNECTION_ALREADY_REGISTERED,
      });
      return true;
    }
    if (adoptionDecision.state === INCOMING_CONNECTION_ADOPTION.ADOPT_INCOMING) {
      this.bindIncomingConnectionAddress(connection, ws, nodeId, normalizedAddress);
      if (existing === connection && connection.ws === ws &&
          this.nodeConnections.get(nodeId) === connection) {
        this.connectionAuthorityOwner.bindCurrentPrimaryBootIncarnation(
          nodeId, connection, bootIncarnation,
        );
      } else {
        this.terminateReplacedIncomingConnection(nodeId, connectionId, existing);
        this.rekeyAdoptedIncomingConnection(connectionId, nodeId, connection, bootIncarnation);
        this.logger.info(ROUTER_LOG_MSG.REKEYED_CONNECTION, {
          connectionId, nodeId, localNodeId: this.nodeId,
        });
        this.sendIdentification(connection);
        this.startPingInterval(connection);
      }
      return true;
    }
    this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, {
      connectionId, nodeId, reason: MESSAGE_ROUTER_LITERAL.STRING_EXISTING_CONNECTION_PREFERRED,
    });
    this.rejectRefusedIncomingConnection(connectionId, connection, ws, nodeId);
    return false;
  }
  handleIncomingIdentification(
    connectionId, connection, ws, message, nodeId, nodeAddress, bootIncarnation,
  ) {
    if (!this.externalAdmissionEnabled && nodeId !== this.nodeId) {
      connection.state = ConnectionState.CLOSED;
      this.retireConnection(connection);
      this.nodeConnections.delete(connectionId);
      this.nodeInboundActivityAt.delete(connectionId);
      this.logger.info(
        MESSAGE_ROUTER_LITERAL.STRING_REJECTING_INCOMING_CONNECTION_WHILE_EXTERNAL_ADMISSION_IS_CLOSED,
        {connectionId, remoteNodeId: nodeId, localNodeId: this.nodeId},
      );
      this.closeUnidentifiedSocket(connectionId, ws, false);
      return false;
    }
    if (message.channel === ROUTER_IDENTIFY_CHANNEL.BULK) {
      this.adoptBulkChannelSocket(connectionId, ws, nodeId);
      return false;
    }
    if (this.connectionAuthorityOwner.shouldRefuseStaleBootIncarnationIdentification(
      nodeId, bootIncarnation,
    )) {
      this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_STALE_BOOT_INCARNATION, {
        connectionId, remoteNodeId: nodeId, localNodeId: this.nodeId, bootIncarnation,
      });
      this.rejectRefusedIncomingConnection(connectionId, connection, ws, nodeId);
      return false;
    }
    const normalizedAddress = normalizeToWebSocketAddress(nodeAddress) || nodeAddress;
    return this.applyIncomingAdoptionDecision(
      connectionId, connection, ws, nodeId, normalizedAddress, bootIncarnation,
    );
  }
  handleOutboundIdentificationReply(connectionId, connection, ws, nodeId, bootIncarnation) {
    if (this.connectionAuthorityOwner.shouldRefuseStaleBootIncarnationIdentification(
      nodeId, bootIncarnation,
    )) {
      this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_STALE_BOOT_INCARNATION, {
        connectionId, remoteNodeId: nodeId, localNodeId: this.nodeId, bootIncarnation,
      });
      try {
        ws.terminate();
      } catch (error) {
        this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {nodeId, error: error.message});
      }
      return;
    }
    this.connectionAuthorityOwner.bindCurrentPrimaryBootIncarnation(
      nodeId, connection, bootIncarnation,
    );
  }
  closeUnidentifiedSocket(connectionId, ws, rethrow) {
    try {
      ws.close();
    } catch (error) {
      this.logger.warn(ROUTER_LOG_MSG.FAILED_CLOSE_UNIDENTIFIED, {
        connectionId, error: error.message,
      });
      if (rethrow) throw error;
    }
  }
  dispatchIdentifiedConnection(
    connectionId, connection, ws, message, nodeId, nodeAddress, bootIncarnation,
  ) {
    if (connection.isIncoming) {
      return this.handleIncomingIdentification(
        connectionId, connection, ws, message, nodeId, nodeAddress, bootIncarnation,
      );
    }
    if (connection.ws === ws) {
      this.handleOutboundIdentificationReply(
        connectionId, connection, ws, nodeId, bootIncarnation,
      );
      return false;
    }
    return true;
  }
  terminateDisownedSocket(ws) {
    try {
      ws?.terminate?.();
    } catch (_err) {
      void _err;
    }
  }
  handleIdentification(connectionId, ws, message) {
    const nodeId = message ? message.nodeId : null;
    const nodeAddress = message ? message.nodeAddress || message.address : null;
    const bootIncarnation = this.connectionAuthorityOwner.readIncomingBootIncarnation(message);
    if (!nodeId || !nodeAddress) {
      this.logger.warn(ROUTER_LOG_MSG.IDENTIFICATION_MISSING_FIELDS, {
        connectionId, hasNodeId: Boolean(nodeId), hasNodeAddress: Boolean(nodeAddress),
      });
      this.closeUnidentifiedSocket(connectionId, ws, true);
      return;
    }
    const connection = this.nodeConnections.get(connectionId);
    if (!doesConnectionBelongToSocket(connection, connectionId, ws)) {
      this.terminateDisownedSocket(ws);
      return;
    }
    if (!this.verifyIncomingIdentifyTrust(connectionId, connection, ws, message)) return;
    this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_RECEIVED, {
      connectionId, remoteNodeId: nodeId, remoteNodeAddress: nodeAddress,
      localNodeId: this.nodeId, existingConnectionForNode: this.nodeConnections.has(nodeId),
    });
    if (!this.dispatchIdentifiedConnection(
      connectionId, connection, ws, message, nodeId, nodeAddress, bootIncarnation,
    )) {
      return;
    }
    if (message.channel === ROUTER_IDENTIFY_CHANNEL.BULK) {
      this.closeUnidentifiedSocket(connectionId, ws, false);
      return;
    }
    this.emit(TRANSPORT_EVENT.NODE_CONNECTED, {nodeId, nodeAddress, connectionId});
    this.emit(TRANSPORT_EVENT.NODE_IDENTIFIED, {nodeId, nodeAddress, connectionId});
  }
  terminateReplacedIncomingConnection(nodeId, connectionId, existing) {
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
  }
  rekeyAdoptedIncomingConnection(
    connectionId,
    nodeId,
    connection,
    bootIncarnation,
  ) {
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
    this.connectionAuthorityOwner.bindCurrentPrimaryBootIncarnation(
      nodeId,
      connection,
      bootIncarnation,
    );
  }
  /**
   * Attach the bulk transfer channel registry that adopts identified
   * bulk-channel sockets (src/transport/bulk-transfer-channel.js).
   * @param {Object} registry - Bulk channel registry.
   * @return {void}
   */
  attachBulkChannelRegistry(registry) {
    this.bulkChannelRegistry = registry;
  }
  /**
   * Hand an identified `channel: bulk` socket to the bulk channel registry.
   * Deletes the pre-identify connection record, DETACHES the router's
   * message/close/error listeners (so a binary chunk frame can never reach
   * the router's JSON parser, and close/reconnect handling no-ops because the
   * record is gone), then lets the registry attach its own listeners in the
   * same tick (pre-claim frame discipline).
   * @param {string} connectionId - Pre-identify connection ID.
   * @param {WebSocket} ws - The bulk-channel socket.
   * @param {string} nodeId - Identified peer node id.
   * @private
   */
  adoptBulkChannelSocket(connectionId, ws, nodeId) {
    this.nodeConnections.delete(connectionId);
    this.nodeInboundActivityAt.delete(connectionId);
    ws.removeAllListeners(TRANSPORT_EVENT.MESSAGE);
    ws.removeAllListeners(TRANSPORT_EVENT.CLOSE);
    ws.removeAllListeners(TRANSPORT_EVENT.ERROR);
    if (!this.bulkChannelRegistry) {
      this.logger.warn(ROUTER_LOG_MSG.BULK_CHANNEL_NO_REGISTRY, {
        connectionId,
        remoteNodeId: nodeId,
      });
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
    this.bulkChannelRegistry.adoptIncomingSocket({nodeId, ws});
    this.logger.info(ROUTER_LOG_MSG.BULK_CHANNEL_ADOPTED, {
      connectionId,
      remoteNodeId: nodeId,
      localNodeId: this.nodeId,
    });
  }
  /**
   * Handle service message from remote node.
   * Sends ACK immediately to release sender-side queue pressure, then
   * resolves the handler asynchronously via SERVICE_RESPONSE.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Service message.
   * @param {Object|null} delivery - Owner-bound local delivery lifetime.
   * @private
   */
  handleServiceMessage(ws, message, delivery = null, trace = null) {
    const {targetAddress, messageId, payload} = message;
    this.logger.debug(ROUTER_LOG_MSG.SERVICE_MESSAGE_HANDLING, {
      messageId,
      targetAddress,
      sourceNodeId: message.sourceNodeId,
      registeredHandlers: Array.from(this.handlers.keys()),
      hasHandler: this.handlers.has(targetAddress),
    });
    const traceAck = trace && ((stage, fields) => trace(`ack_${stage}`, fields));
    const traceResponse = trace && ((stage, fields) => trace(`response_${stage}`, fields));
    this.sendRaw(ws, {
      type: RouterMessageType.ACK,
      messageId,
      acknowledged: true,
    }, traceAck);
    const handler = this.handlers.get(targetAddress);
    if (!handler) {
      trace?.(STAGE.PARTITION_HANDLER_MISSING);
      this.emit(TRANSPORT_EVENT.MESSAGE, {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });
      // The router's own fact travels at frame level; no answer slot exists.
      this.sendRaw(ws, {
        type: RouterMessageType.SERVICE_RESPONSE,
        messageId,
        sourceAddress: message.sourceAddress,
        noHandler: true,
        error: ROUTER_ERROR_MSG.noHandlerForAddress(targetAddress),
      }, traceResponse);
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
      // The local-only second argument is not part of the wire envelope.
      .then(() => {
        trace?.(STAGE.PARTITION_DISPATCH, {hasDeliveryAuthority: delivery !== null});
        return handler(envelope, delivery);
      })
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
        }, traceResponse);
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
        }, traceResponse);
      });
  }
  /**
   * Handle SERVICE_RESPONSE message and settle pending response waiters.
   * @param {Object} message - Service response message.
   * @private
   */
  handleServiceResponse(message, trace) {
    const {messageId, result, error, noHandler} = message;
    this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_RECEIVED, {
      messageId,
      hasError: Boolean(error),
    });
    const disposition = this.resolveServiceResponseDisposition(messageId, {
      result,
      error,
      noHandler,
    });
    this.recordServiceResponseDisposition(disposition);
    trace?.(STAGE.RESPONSE_RECEIVED, {disposition: disposition.kind, absorbed: disposition.absorbed,
      observedAtMs: this.timeSource.now()});
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
