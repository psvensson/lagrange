import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {ROUTER_IDENTIFY_CHANNEL} from '../constants/transport.js';
import {
  runTransportInboundActivity,
} from '../diagnostics/formation-owner-attribution.js';
import {
  recordOutboundSocketAcknowledgement,
} from './message-router-peer-liveness.js';
import {
  enterSyncSection,
  exitSyncSection,
} from '../diagnostics/event-loop-gap-watchdog.js';
import {
  FRAME_CLASS,
  ROUTER_SYNC_SECTION,
  classifyRouterFrame,
  countAnswerRows,
  describeServedQuery,
} from './message-router-peer-traffic-diagnostics.js';

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
  /**
   * Credit an acknowledged ACK frame, in time or late, to the outbound socket
   * it arrived on. Only the node's current outbound record whose socket is
   * exactly `ws` is credited: an ACK on a retired or inbound socket, or on
   * the self-connection, is no evidence about the current outbound socket.
   * @param {string} connectionId - Listener key (node id once identified).
   * @param {WebSocket} ws - The socket the frame arrived on.
   * @param {Object} message - The ACK frame.
   * @return {void}
   */
  recordInboundSocketAcknowledgement(connectionId, ws, message) {
    if (!message.acknowledged) {
      return;
    }
    const connection = this.nodeConnections.get(connectionId);
    if (
      !connection ||
      connection.ws !== ws ||
      connection.isIncoming === true ||
      connection.isSelfConnection === true
    ) {
      return;
    }
    recordOutboundSocketAcknowledgement(connection, this.timeSource.now());
  }
  decodeInboundFrame(data) {
    const decodeToken = enterSyncSection(ROUTER_SYNC_SECTION.FRAME_DECODE);
    try {
      return JSON.parse(data.toString());
    } finally {
      exitSyncSection(ROUTER_SYNC_SECTION.FRAME_DECODE, decodeToken);
    }
  }
  /**
   * Diagnostics only: count the frame for its peer and, for ACK and PONG
   * frames, sample the one-way latency from the sender's stamp (it includes
   * the clock skew between the two hosts).
   * @param {string} connectionId - Listener key (node id once identified).
   * @param {WebSocket} ws - The socket the frame arrived on.
   * @param {Buffer|string} data - The raw frame.
   * @param {Object} message - The parsed frame.
   * @return {void}
   */
  observeInboundFrame(connectionId, ws, data, message) {
    try {
      const frameClass = classifyRouterFrame(message);
      this.peerTrafficDiagnostics.recordReceived(
        connectionId, ws, data.length, frameClass);
      if (frameClass === FRAME_CLASS.ACK || frameClass === FRAME_CLASS.PONG) {
        this.peerTrafficDiagnostics.recordOneWayLatency(
          connectionId, this.timeSource.now() - message.timestamp);
      }
    } catch (error) {
      // An observation must never change what happens to the frame.
      this.peerTrafficDiagnostics.recordObservationFailure(error);
    }
  }
  handleMessage(connectionId, ws, data) {
    return runTransportInboundActivity(() =>
      this.dispatchInboundMessage(connectionId, ws, data));
  }
  dispatchInboundMessage(connectionId, ws, data) {
    try {
      const message = this.decodeInboundFrame(data);
      this.recordNodeInboundActivity(connectionId);
      this.observeInboundFrame(connectionId, ws, data, message);
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
        return;
      }
      this.routeAuthenticatedInboundFrame(connectionId, ws, message);
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
  routeAuthenticatedInboundFrame(connectionId, ws, message) {
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
      this.recordInboundSocketAcknowledgement(connectionId, ws, message);
      this.handleAcknowledgment(message);
      return;
    }
    if (message.type === RouterMessageType.SERVICE_RESPONSE) {
      this.handleServiceResponse(message);
      return;
    }
    if (message.type === RouterMessageType.SERVICE_MESSAGE) {
      const delivery = this.connectionAuthorityOwner.captureIncomingDelivery(connectionId, ws);
      // The sender's identity is the receiving connection's, read while it is
      // current; a frame's own sourceNodeId is never routing authority.
      const senderNodeId = this.nodeConnections.get(connectionId)?.nodeId ?? null;
      this.handleServiceMessage(ws, message, delivery, senderNodeId);
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
    const bootIncarnation = this.connectionAuthorityOwner
      .readIncomingBootIncarnation(message);
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
    const connection = this.nodeConnections.get(connectionId);
    if (!this.verifyIncomingIdentifyTrust(connectionId, connection, ws, message)) {
      return;
    }
    this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_RECEIVED, {
      connectionId,
      remoteNodeId: nodeId,
      remoteNodeAddress: nodeAddress,
      localNodeId: this.nodeId,
      existingConnectionForNode: this.nodeConnections.has(nodeId),
    });
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
      // Bulk-channel fork: AFTER the external-admission gate, BEFORE any
      // record mutation. The socket is handed to the bulk channel registry;
      // the primary per-peer connection is never rekeyed, evicted, or
      // reconnect-fought, and no NODE_CONNECTED/NODE_IDENTIFIED is emitted.
      if (message.channel === ROUTER_IDENTIFY_CHANNEL.BULK) {
        this.adoptBulkChannelSocket(connectionId, ws, nodeId);
        return;
      }
      // Incarnation fence: a stale-incarnation (zombie) IDENTIFY must never
      // rekey the peer slot. Refuse the adoption BEFORE the adoption decision
      // and BEFORE any record mutation: terminate the incoming socket, keep
      // the existing connection. UNKNOWN incarnation never fences.
      if (
        this.connectionAuthorityOwner.shouldRefuseStaleBootIncarnationIdentification(
          nodeId,
          bootIncarnation,
        )
      ) {
        this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_STALE_BOOT_INCARNATION, {
          connectionId,
          remoteNodeId: nodeId,
          localNodeId: this.nodeId,
          bootIncarnation,
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
        return;
      }
      const normalizedAddress =
        normalizeToWebSocketAddress(nodeAddress) || nodeAddress;
      connection.nodeId = nodeId;
      connection.dialerIdentifiedAt = this.connectionAuthorityOwner
        .readDialerIdentifiedAt(message);
      connection.nodeAddress = normalizedAddress;
      connection.configuredAddress = normalizedAddress;
      this.rememberReconnectAddress(connection, ws, normalizedAddress);
      const adoptionDecision =
        this.connectionAuthorityOwner.resolveIncomingConnectionAdoption(
          nodeId,
          bootIncarnation,
          connection,
        );
      const existing = adoptionDecision.existing;
      if (
        adoptionDecision.state ===
        INCOMING_CONNECTION_ADOPTION.KEEP_SELF_CONNECTION
      ) {
        this.connectionAuthorityOwner.bindCurrentPrimaryBootIncarnation(
          nodeId,
          existing,
          bootIncarnation,
        );
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
        this.connectionAuthorityOwner.bindCurrentPrimaryBootIncarnation(
          nodeId,
          connection,
          bootIncarnation,
        );
        this.logger.info(ROUTER_LOG_MSG.REKEYED_CONNECTION, {
          oldKey: connectionId,
          newKey: nodeId,
          localNodeId: this.nodeId,
        });
        // Identity is bidirectional: only the dialer sends IDENTIFY on open,
        // so answer the adopted primary with this side's own IDENTIFY. That
        // reply is the only way the dialer's outbound record learns this
        // boot's incarnation (formation-release cohort capture reads the
        // current primary regardless of direction). Sent for a primary
        // adoption only: never for a bulk socket (forked above), never for a
        // kept self-connection, and never in reply to a reply (the outbound
        // branch below binds without answering).
        this.sendIdentification(connection);
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
        return;
      }
    } else if (connection && connection.ws === ws) {
      // The acceptor's IDENTIFY reply on this side's outbound primary. A
      // stale reply is fenced exactly like a stale inbound IDENTIFY (the
      // socket is terminated); a live one binds the peer's incarnation to
      // the outbound record. The reply is never answered and never re-emits
      // NODE_CONNECTED/NODE_IDENTIFIED: CONNECTION_ESTABLISHED already
      // announced this dial.
      if (
        this.connectionAuthorityOwner
          .shouldRefuseStaleBootIncarnationIdentification(
            nodeId,
            bootIncarnation,
          )
      ) {
        this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_STALE_BOOT_INCARNATION, {
          connectionId,
          remoteNodeId: nodeId,
          localNodeId: this.nodeId,
          bootIncarnation,
        });
        try {
          ws.terminate();
        } catch (error) {
          this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, {
            nodeId,
            error: error.message,
          });
        }
        return;
      }
      this.connectionAuthorityOwner.bindCurrentPrimaryBootIncarnation(
        nodeId,
        connection,
        bootIncarnation,
      );
      return;
    }
    if (message.channel === ROUTER_IDENTIFY_CHANNEL.BULK) {
      // A bulk-channel IDENTIFY that did not match an incoming record above
      // has nothing to adopt and is never a primary identification.
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
   * @param {string|null} senderNodeId - The identified node the receiving
   *   connection belongs to, or null before identification.
   * @private
   */
  handleServiceMessage(ws, message, delivery = null, senderNodeId = null) {
    const {targetAddress, messageId, payload} = message;
    const isOneWay = message.oneWay === true;
    this.logger.debug(ROUTER_LOG_MSG.SERVICE_MESSAGE_HANDLING, {
      messageId,
      targetAddress,
      sourceNodeId: message.sourceNodeId,
      registeredHandlerCount: this.handlers.size,
      hasHandler: this.handlers.has(targetAddress),
    });
    if (!isOneWay) {
      this.sendRaw(ws, {
        type: RouterMessageType.ACK,
        messageId,
        acknowledged: true,
        // Sender stamp for the receiver's one-way latency sample.
        timestamp: this.timeSource.now(),
      });
    }
    const handler = this.handlers.get(targetAddress);
    if (!handler) {
      this.emit(TRANSPORT_EVENT.MESSAGE, {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });
      if (!isOneWay) {
        // The router's own fact travels at frame level; no answer slot exists.
        this.sendRaw(ws, {
          type: RouterMessageType.SERVICE_RESPONSE,
          messageId,
          sourceAddress: message.sourceAddress,
          noHandler: true,
          error: ROUTER_ERROR_MSG.noHandlerForAddress(targetAddress),
        });
      }
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
    const handlingStartedAtMs = this.timeSource.now();
    Promise.resolve()
      // The local-only second argument is not part of the wire envelope.
      .then(() => handler(envelope, delivery))
      .then((result) => {
        if (isOneWay) {
          return;
        }
        this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_SENT, {
          messageId,
          targetAddress,
        });
        const responseBytes = this.sendRaw(this.resolveAnswerSocket(ws, senderNodeId), {
          type: RouterMessageType.SERVICE_RESPONSE,
          messageId,
          sourceAddress: message.sourceAddress,
          result,
        });
        this.observeServedQuery(message, result, responseBytes, handlingStartedAtMs);
      })
      .catch((error) => {
        this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_ERROR, {
          messageId,
          targetAddress,
          error: error.message,
        });
        if (isOneWay) {
          return;
        }
        this.sendRaw(this.resolveAnswerSocket(ws, senderNodeId), {
          type: RouterMessageType.SERVICE_RESPONSE,
          messageId,
          sourceAddress: message.sourceAddress,
          error: error.message,
        });
      });
  }
  /**
   * The socket a handler's answer travels on. The answer is settled by
   * messageId on any socket from this node, so it goes on the sender node's
   * current primary connection: a socket superseded while the handler ran is
   * retired and would swallow the answer. A sender with no current primary
   * (not yet identified, or reconnecting) is answered on the receiving socket.
   * @param {WebSocket} receivedOn - The socket the request arrived on.
   * @param {string|null} senderNodeId - The receiving connection's node.
   * @return {WebSocket} The socket to answer on.
   */
  resolveAnswerSocket(receivedOn, senderNodeId) {
    const primary = senderNodeId === null ? undefined :
      this.nodeConnections.get(senderNodeId);
    return primary?.state === ConnectionState.CONNECTED && primary.ws ?
      primary.ws : receivedOn;
  }
  /**
   * Diagnostics only: account one answered remote query (table, operation,
   * caller node, rows, encoded response bytes, handling time) for the
   * per-second served-query line.
   * @param {Object} message - The served service message.
   * @param {*} result - The handler's answer.
   * @param {number} responseBytes - Encoded SERVICE_RESPONSE size.
   * @param {number} handlingStartedAtMs - Router clock at handler dispatch.
   * @return {void}
   */
  observeServedQuery(message, result, responseBytes, handlingStartedAtMs) {
    try {
      const served = describeServedQuery(message.targetAddress, message.payload);
      if (served !== null) {
        this.peerTrafficDiagnostics.recordServedQuery({
          ...served,
          sourceNodeId: message.sourceNodeId,
          rowCount: countAnswerRows(result),
          responseBytes,
          executionMs: this.timeSource.now() - handlingStartedAtMs,
        });
      }
    } catch (error) {
      // The answer was already sent; an observation failure must not reach
      // the handler-failure path and send a second response.
      this.peerTrafficDiagnostics.recordObservationFailure(error);
    }
  }
  /**
   * Handle SERVICE_RESPONSE message and settle pending response waiters.
   * @param {Object} message - Service response message.
   * @private
   */
  handleServiceResponse(message) {
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
