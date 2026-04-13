/**
 * RouterMessageHandler - Handles incoming WebSocket messages for MessageRouter.
 * Extracts message handling logic from MessageRouter for better separation of concerns.
 *
 * @module transport/router-message-handler
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { CONNECTION_STATE, ROUTER_ERROR_MSG, ROUTER_LOG_MSG, ROUTER_MESSAGE_TYPE, TRANSPORT_EVENT } from '../constants/transport.js';
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
  * @param {Function} options.onServiceResponse - Callback for SERVICE_RESPONSE messages.
  */
  constructor(options) {
    if (stryMutAct_9fa48("159020")) {
      {}
    } else {
      stryCov_9fa48("159020");
      this.logger = options.logger;
      this.handlers = options.handlers;
      this.pendingMessages = options.pendingMessages;
      this.pendingPings = options.pendingPings;
      this.nodeConnections = options.nodeConnections;
      this.nodeId = options.nodeId;
      this.sendRaw = options.sendRaw;
      this.emit = options.emit;
      this.onServiceResponse = options.onServiceResponse;
    }
  }

  /**
   * Handle incoming WebSocket message.
   * Parses message and dispatches to appropriate handler.
   * @param {string} connectionId - Connection ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Buffer|string} data - Raw message data.
   */
  handleMessage(connectionId, ws, data) {
    if (stryMutAct_9fa48("159021")) {
      {}
    } else {
      stryCov_9fa48("159021");
      try {
        if (stryMutAct_9fa48("159022")) {
          {}
        } else {
          stryCov_9fa48("159022");
          const message = JSON.parse(data.toString());
          this.logger.debug(ROUTER_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("159023") ? {} : (stryCov_9fa48("159023"), {
            connectionId,
            type: message.type,
            messageId: message.messageId
          }));

          // Handle identification
          if (stryMutAct_9fa48("159026") ? message.type !== RouterMessageType.IDENTIFY : stryMutAct_9fa48("159025") ? false : stryMutAct_9fa48("159024") ? true : (stryCov_9fa48("159024", "159025", "159026"), message.type === RouterMessageType.IDENTIFY)) {
            if (stryMutAct_9fa48("159027")) {
              {}
            } else {
              stryCov_9fa48("159027");
              this.handleIdentification(connectionId, ws, message);
              return;
            }
          }

          // Handle ping/pong
          if (stryMutAct_9fa48("159030") ? message.type !== RouterMessageType.PING : stryMutAct_9fa48("159029") ? false : stryMutAct_9fa48("159028") ? true : (stryCov_9fa48("159028", "159029", "159030"), message.type === RouterMessageType.PING)) {
            if (stryMutAct_9fa48("159031")) {
              {}
            } else {
              stryCov_9fa48("159031");
              this.sendRaw(ws, stryMutAct_9fa48("159032") ? {} : (stryCov_9fa48("159032"), {
                type: RouterMessageType.PONG,
                pingId: stryMutAct_9fa48("159035") ? message.pingId && null : stryMutAct_9fa48("159034") ? false : stryMutAct_9fa48("159033") ? true : (stryCov_9fa48("159033", "159034", "159035"), message.pingId || null),
                timestamp: Date.now()
              }));
              return;
            }
          }
          if (stryMutAct_9fa48("159038") ? message.type !== RouterMessageType.PONG : stryMutAct_9fa48("159037") ? false : stryMutAct_9fa48("159036") ? true : (stryCov_9fa48("159036", "159037", "159038"), message.type === RouterMessageType.PONG)) {
            if (stryMutAct_9fa48("159039")) {
              {}
            } else {
              stryCov_9fa48("159039");
              if (stryMutAct_9fa48("159042") ? message.pingId || this.pendingPings.has(message.pingId) : stryMutAct_9fa48("159041") ? false : stryMutAct_9fa48("159040") ? true : (stryCov_9fa48("159040", "159041", "159042"), message.pingId && this.pendingPings.has(message.pingId))) {
                if (stryMutAct_9fa48("159043")) {
                  {}
                } else {
                  stryCov_9fa48("159043");
                  const pending = this.pendingPings.get(message.pingId);
                  clearTimeout(pending.timeout);
                  this.pendingPings.delete(message.pingId);
                  pending.resolve(stryMutAct_9fa48("159044") ? false : (stryCov_9fa48("159044"), true));
                }
              }
              return;
            }
          }

          // Handle acknowledgment
          if (stryMutAct_9fa48("159047") ? message.type !== RouterMessageType.ACK : stryMutAct_9fa48("159046") ? false : stryMutAct_9fa48("159045") ? true : (stryCov_9fa48("159045", "159046", "159047"), message.type === RouterMessageType.ACK)) {
            if (stryMutAct_9fa48("159048")) {
              {}
            } else {
              stryCov_9fa48("159048");
              this.handleAcknowledgment(message);
              return;
            }
          }

          // Handle SERVICE_RESPONSE (deferred handler result)
          if (stryMutAct_9fa48("159051") ? message.type !== RouterMessageType.SERVICE_RESPONSE : stryMutAct_9fa48("159050") ? false : stryMutAct_9fa48("159049") ? true : (stryCov_9fa48("159049", "159050", "159051"), message.type === RouterMessageType.SERVICE_RESPONSE)) {
            if (stryMutAct_9fa48("159052")) {
              {}
            } else {
              stryCov_9fa48("159052");
              this.handleServiceResponse(message);
              return;
            }
          }

          // Handle service message
          if (stryMutAct_9fa48("159055") ? message.type !== RouterMessageType.SERVICE_MESSAGE : stryMutAct_9fa48("159054") ? false : stryMutAct_9fa48("159053") ? true : (stryCov_9fa48("159053", "159054", "159055"), message.type === RouterMessageType.SERVICE_MESSAGE)) {
            if (stryMutAct_9fa48("159056")) {
              {}
            } else {
              stryCov_9fa48("159056");
              this.handleServiceMessage(ws, message);
              return;
            }
          }

          // Unknown message type
          this.logger.warn(ROUTER_LOG_MSG.MESSAGE_UNKNOWN, stryMutAct_9fa48("159057") ? {} : (stryCov_9fa48("159057"), {
            type: message.type,
            connectionId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("159058")) {
          {}
        } else {
          stryCov_9fa48("159058");
          this.logger.error(ROUTER_LOG_MSG.MESSAGE_PARSE_FAILED, stryMutAct_9fa48("159059") ? {} : (stryCov_9fa48("159059"), {
            connectionId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Handle identification message from remote node.
   * @param {string} connectionId - Connection ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Identification message.
   */
  handleIdentification(connectionId, ws, message) {
    if (stryMutAct_9fa48("159060")) {
      {}
    } else {
      stryCov_9fa48("159060");
      const nodeId = stryMutAct_9fa48("159061") ? message.nodeId : (stryCov_9fa48("159061"), message?.nodeId);
      const nodeAddress = stryMutAct_9fa48("159064") ? message?.nodeAddress && message?.address : stryMutAct_9fa48("159063") ? false : stryMutAct_9fa48("159062") ? true : (stryCov_9fa48("159062", "159063", "159064"), (stryMutAct_9fa48("159065") ? message.nodeAddress : (stryCov_9fa48("159065"), message?.nodeAddress)) || (stryMutAct_9fa48("159066") ? message.address : (stryCov_9fa48("159066"), message?.address)));
      if (stryMutAct_9fa48("159069") ? !nodeId && !nodeAddress : stryMutAct_9fa48("159068") ? false : stryMutAct_9fa48("159067") ? true : (stryCov_9fa48("159067", "159068", "159069"), (stryMutAct_9fa48("159070") ? nodeId : (stryCov_9fa48("159070"), !nodeId)) || (stryMutAct_9fa48("159071") ? nodeAddress : (stryCov_9fa48("159071"), !nodeAddress)))) {
        if (stryMutAct_9fa48("159072")) {
          {}
        } else {
          stryCov_9fa48("159072");
          this.logger.warn(ROUTER_LOG_MSG.IDENTIFICATION_MISSING_FIELDS, stryMutAct_9fa48("159073") ? {} : (stryCov_9fa48("159073"), {
            connectionId,
            hasNodeId: stryMutAct_9fa48("159074") ? !nodeId : (stryCov_9fa48("159074"), !(stryMutAct_9fa48("159075") ? nodeId : (stryCov_9fa48("159075"), !nodeId))),
            hasNodeAddress: stryMutAct_9fa48("159076") ? !nodeAddress : (stryCov_9fa48("159076"), !(stryMutAct_9fa48("159077") ? nodeAddress : (stryCov_9fa48("159077"), !nodeAddress)))
          }));
          try {
            if (stryMutAct_9fa48("159078")) {
              {}
            } else {
              stryCov_9fa48("159078");
              ws.close();
            }
          } catch (error) {
            if (stryMutAct_9fa48("159079")) {
              {}
            } else {
              stryCov_9fa48("159079");
              this.logger.warn(ROUTER_LOG_MSG.FAILED_CLOSE_UNIDENTIFIED, stryMutAct_9fa48("159080") ? {} : (stryCov_9fa48("159080"), {
                connectionId,
                error: error.message
              }));
              throw error;
            }
          }
          return;
        }
      }
      this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_RECEIVED, stryMutAct_9fa48("159081") ? {} : (stryCov_9fa48("159081"), {
        connectionId,
        remoteNodeId: nodeId,
        remoteNodeAddress: nodeAddress,
        localNodeId: this.nodeId,
        existingConnectionForNode: this.nodeConnections.has(nodeId)
      }));

      // Update connection with node ID
      const connection = this.nodeConnections.get(connectionId);
      if (stryMutAct_9fa48("159084") ? connection || connection.isIncoming : stryMutAct_9fa48("159083") ? false : stryMutAct_9fa48("159082") ? true : (stryCov_9fa48("159082", "159083", "159084"), connection && connection.isIncoming)) {
        if (stryMutAct_9fa48("159085")) {
          {}
        } else {
          stryCov_9fa48("159085");
          connection.nodeId = nodeId;
          connection.nodeAddress = nodeAddress;
          const existing = this.nodeConnections.get(nodeId);
          const isSelfConnection = stryMutAct_9fa48("159088") ? existing?.isSelfConnection || nodeId === this.nodeId : stryMutAct_9fa48("159087") ? false : stryMutAct_9fa48("159086") ? true : (stryCov_9fa48("159086", "159087", "159088"), (stryMutAct_9fa48("159089") ? existing.isSelfConnection : (stryCov_9fa48("159089"), existing?.isSelfConnection)) && (stryMutAct_9fa48("159091") ? nodeId !== this.nodeId : stryMutAct_9fa48("159090") ? true : (stryCov_9fa48("159090", "159091"), nodeId === this.nodeId)));
          const existingConnected = stryMutAct_9fa48("159094") ? Boolean(existing) || existing.state === ConnectionState.CONNECTED : stryMutAct_9fa48("159093") ? false : stryMutAct_9fa48("159092") ? true : (stryCov_9fa48("159092", "159093", "159094"), Boolean(existing) && (stryMutAct_9fa48("159096") ? existing.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("159095") ? true : (stryCov_9fa48("159095", "159096"), existing.state === ConnectionState.CONNECTED)));
          const preferIncomingConnection = stryMutAct_9fa48("159100") ? this.nodeId.localeCompare(nodeId) <= 0 : stryMutAct_9fa48("159099") ? this.nodeId.localeCompare(nodeId) >= 0 : stryMutAct_9fa48("159098") ? false : stryMutAct_9fa48("159097") ? true : (stryCov_9fa48("159097", "159098", "159099", "159100"), this.nodeId.localeCompare(nodeId) > 0);
          const existingPreferredIncomingConnection = stryMutAct_9fa48("159103") ? existingConnected && preferIncomingConnection || existing?.isIncoming === true : stryMutAct_9fa48("159102") ? false : stryMutAct_9fa48("159101") ? true : (stryCov_9fa48("159101", "159102", "159103"), (stryMutAct_9fa48("159105") ? existingConnected || preferIncomingConnection : stryMutAct_9fa48("159104") ? true : (stryCov_9fa48("159104", "159105"), existingConnected && preferIncomingConnection)) && (stryMutAct_9fa48("159107") ? existing?.isIncoming !== true : stryMutAct_9fa48("159106") ? true : (stryCov_9fa48("159106", "159107"), (stryMutAct_9fa48("159108") ? existing.isIncoming : (stryCov_9fa48("159108"), existing?.isIncoming)) === (stryMutAct_9fa48("159109") ? false : (stryCov_9fa48("159109"), true)))));
          const shouldAdoptIncomingConnection = stryMutAct_9fa48("159112") ? !existing && !isSelfConnection && (!existingConnected || preferIncomingConnection && !existingPreferredIncomingConnection) : stryMutAct_9fa48("159111") ? false : stryMutAct_9fa48("159110") ? true : (stryCov_9fa48("159110", "159111", "159112"), (stryMutAct_9fa48("159113") ? existing : (stryCov_9fa48("159113"), !existing)) || (stryMutAct_9fa48("159115") ? !isSelfConnection || !existingConnected || preferIncomingConnection && !existingPreferredIncomingConnection : stryMutAct_9fa48("159114") ? false : (stryCov_9fa48("159114", "159115"), (stryMutAct_9fa48("159116") ? isSelfConnection : (stryCov_9fa48("159116"), !isSelfConnection)) && (stryMutAct_9fa48("159118") ? !existingConnected && preferIncomingConnection && !existingPreferredIncomingConnection : stryMutAct_9fa48("159117") ? true : (stryCov_9fa48("159117", "159118"), (stryMutAct_9fa48("159119") ? existingConnected : (stryCov_9fa48("159119"), !existingConnected)) || (stryMutAct_9fa48("159121") ? preferIncomingConnection || !existingPreferredIncomingConnection : stryMutAct_9fa48("159120") ? false : (stryCov_9fa48("159120", "159121"), preferIncomingConnection && (stryMutAct_9fa48("159122") ? existingPreferredIncomingConnection : (stryCov_9fa48("159122"), !existingPreferredIncomingConnection)))))))));
          if (stryMutAct_9fa48("159124") ? false : stryMutAct_9fa48("159123") ? true : (stryCov_9fa48("159123", "159124"), isSelfConnection)) {
            if (stryMutAct_9fa48("159125")) {
              {}
            } else {
              stryCov_9fa48("159125");
              this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, stryMutAct_9fa48("159126") ? {} : (stryCov_9fa48("159126"), {
                connectionId,
                nodeId,
                reason: ROUTER_LOG_MSG.SELF_CONNECTION_ALREADY_REGISTERED
              }));
            }
          } else if (stryMutAct_9fa48("159128") ? false : stryMutAct_9fa48("159127") ? true : (stryCov_9fa48("159127", "159128"), shouldAdoptIncomingConnection)) {
            if (stryMutAct_9fa48("159129")) {
              {}
            } else {
              stryCov_9fa48("159129");
              if (stryMutAct_9fa48("159132") ? existing && existing.ws || existing.connectionId !== connectionId : stryMutAct_9fa48("159131") ? false : stryMutAct_9fa48("159130") ? true : (stryCov_9fa48("159130", "159131", "159132"), (stryMutAct_9fa48("159134") ? existing || existing.ws : stryMutAct_9fa48("159133") ? true : (stryCov_9fa48("159133", "159134"), existing && existing.ws)) && (stryMutAct_9fa48("159136") ? existing.connectionId === connectionId : stryMutAct_9fa48("159135") ? true : (stryCov_9fa48("159135", "159136"), existing.connectionId !== connectionId)))) {
                if (stryMutAct_9fa48("159137")) {
                  {}
                } else {
                  stryCov_9fa48("159137");
                  try {
                    if (stryMutAct_9fa48("159138")) {
                      {}
                    } else {
                      stryCov_9fa48("159138");
                      existing.ws.terminate();
                    }
                  } catch (error) {
                    if (stryMutAct_9fa48("159139")) {
                      {}
                    } else {
                      stryCov_9fa48("159139");
                      this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, stryMutAct_9fa48("159140") ? {} : (stryCov_9fa48("159140"), {
                        nodeId,
                        error: error.message
                      }));
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("159143") ? existing || this.nodeConnections.get(nodeId) === existing : stryMutAct_9fa48("159142") ? false : stryMutAct_9fa48("159141") ? true : (stryCov_9fa48("159141", "159142", "159143"), existing && (stryMutAct_9fa48("159145") ? this.nodeConnections.get(nodeId) !== existing : stryMutAct_9fa48("159144") ? true : (stryCov_9fa48("159144", "159145"), this.nodeConnections.get(nodeId) === existing)))) {
                if (stryMutAct_9fa48("159146")) {
                  {}
                } else {
                  stryCov_9fa48("159146");
                  this.nodeConnections.delete(nodeId);
                }
              }
              this.nodeConnections.delete(connectionId);
              this.nodeConnections.set(nodeId, connection);
              this.logger.info(ROUTER_LOG_MSG.REKEYED_CONNECTION, stryMutAct_9fa48("159147") ? {} : (stryCov_9fa48("159147"), {
                oldKey: connectionId,
                newKey: nodeId,
                localNodeId: this.nodeId
              }));
            }
          } else {
            if (stryMutAct_9fa48("159148")) {
              {}
            } else {
              stryCov_9fa48("159148");
              this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, stryMutAct_9fa48("159149") ? {} : (stryCov_9fa48("159149"), {
                connectionId,
                nodeId,
                reason: stryMutAct_9fa48("159150") ? "" : (stryCov_9fa48("159150"), 'existing_connection_preferred')
              }));
              this.nodeConnections.delete(connectionId);
              try {
                if (stryMutAct_9fa48("159151")) {
                  {}
                } else {
                  stryCov_9fa48("159151");
                  ws.terminate();
                }
              } catch (error) {
                if (stryMutAct_9fa48("159152")) {
                  {}
                } else {
                  stryCov_9fa48("159152");
                  this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, stryMutAct_9fa48("159153") ? {} : (stryCov_9fa48("159153"), {
                    nodeId,
                    error: error.message
                  }));
                }
              }
            }
          }
        }
      }
      this.emit(TRANSPORT_EVENT.NODE_CONNECTED, stryMutAct_9fa48("159154") ? {} : (stryCov_9fa48("159154"), {
        nodeId,
        nodeAddress,
        connectionId
      }));
      this.emit(TRANSPORT_EVENT.NODE_IDENTIFIED, stryMutAct_9fa48("159155") ? {} : (stryCov_9fa48("159155"), {
        nodeId,
        nodeAddress,
        connectionId
      }));
    }
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
    if (stryMutAct_9fa48("159156")) {
      {}
    } else {
      stryCov_9fa48("159156");
      const {
        targetAddress,
        messageId,
        payload
      } = message;
      this.logger.debug(ROUTER_LOG_MSG.SERVICE_MESSAGE_HANDLING, stryMutAct_9fa48("159157") ? {} : (stryCov_9fa48("159157"), {
        messageId,
        targetAddress,
        sourceNodeId: message.sourceNodeId,
        registeredHandlers: Array.from(this.handlers.keys()),
        hasHandler: this.handlers.has(targetAddress)
      }));

      // Send ACK immediately — release outbound queue slot on sender
      this.sendRaw(ws, stryMutAct_9fa48("159158") ? {} : (stryCov_9fa48("159158"), {
        type: RouterMessageType.ACK,
        messageId,
        acknowledged: stryMutAct_9fa48("159159") ? false : (stryCov_9fa48("159159"), true)
      }));

      // Find handler for target address
      const handler = this.handlers.get(targetAddress);
      if (stryMutAct_9fa48("159162") ? false : stryMutAct_9fa48("159161") ? true : stryMutAct_9fa48("159160") ? handler : (stryCov_9fa48("159160", "159161", "159162"), !handler)) {
        if (stryMutAct_9fa48("159163")) {
          {}
        } else {
          stryCov_9fa48("159163");
          // No handler - send SERVICE_RESPONSE with error and emit event
          this.sendRaw(ws, stryMutAct_9fa48("159164") ? {} : (stryCov_9fa48("159164"), {
            type: RouterMessageType.SERVICE_RESPONSE,
            messageId,
            sourceAddress: message.sourceAddress,
            error: ROUTER_ERROR_MSG.noHandlerForAddress(targetAddress)
          }));
          this.emit(TRANSPORT_EVENT.MESSAGE, stryMutAct_9fa48("159165") ? {} : (stryCov_9fa48("159165"), {
            messageId,
            targetAddress,
            payload,
            sourceAddress: message.sourceAddress,
            sourceNodeId: message.sourceNodeId
          }));
          return;
        }
      }

      // Create envelope similar to InMemoryTransport
      const envelope = stryMutAct_9fa48("159166") ? {} : (stryCov_9fa48("159166"), {
        messageId,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
        targetAddress,
        payload,
        timestamp: message.timestamp
      });

      // Invoke handler asynchronously, send SERVICE_RESPONSE when done
      // Use a function wrapper to ensure synchronous throws from
      // the handler are caught by the promise chain.
      new Promise(stryMutAct_9fa48("159167") ? () => undefined : (stryCov_9fa48("159167"), resolve => resolve(handler(envelope)))).then(result => {
        if (stryMutAct_9fa48("159168")) {
          {}
        } else {
          stryCov_9fa48("159168");
          this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_SENT, stryMutAct_9fa48("159169") ? {} : (stryCov_9fa48("159169"), {
            messageId,
            targetAddress
          }));
          this.sendRaw(ws, stryMutAct_9fa48("159170") ? {} : (stryCov_9fa48("159170"), {
            type: RouterMessageType.SERVICE_RESPONSE,
            messageId,
            sourceAddress: message.sourceAddress,
            result
          }));
        }
      }).catch(error => {
        if (stryMutAct_9fa48("159171")) {
          {}
        } else {
          stryCov_9fa48("159171");
          this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_ERROR, stryMutAct_9fa48("159172") ? {} : (stryCov_9fa48("159172"), {
            messageId,
            targetAddress,
            error: error.message
          }));
          this.sendRaw(ws, stryMutAct_9fa48("159173") ? {} : (stryCov_9fa48("159173"), {
            type: RouterMessageType.SERVICE_RESPONSE,
            messageId,
            sourceAddress: message.sourceAddress,
            error: error.message
          }));
        }
      });
    }
  }
  /**
   * Handle acknowledgment message.
   * Passes through flat ACK structure without additional nesting.
   * @param {Object} message - Acknowledgment message.
   */
  handleAcknowledgment(message) {
    if (stryMutAct_9fa48("159174")) {
      {}
    } else {
      stryCov_9fa48("159174");
      const {
        messageId,
        acknowledged,
        error,
        type: _type,
        ...rest
      } = message;
      const pending = this.pendingMessages.get(messageId);
      if (stryMutAct_9fa48("159176") ? false : stryMutAct_9fa48("159175") ? true : (stryCov_9fa48("159175", "159176"), pending)) {
        if (stryMutAct_9fa48("159177")) {
          {}
        } else {
          stryCov_9fa48("159177");
          clearTimeout(pending.timeout);
          this.pendingMessages.delete(messageId);
          if (stryMutAct_9fa48("159179") ? false : stryMutAct_9fa48("159178") ? true : (stryCov_9fa48("159178", "159179"), acknowledged)) {
            if (stryMutAct_9fa48("159180")) {
              {}
            } else {
              stryCov_9fa48("159180");
              pending.resolve(stryMutAct_9fa48("159181") ? {} : (stryCov_9fa48("159181"), {
                messageId,
                acknowledged: stryMutAct_9fa48("159182") ? false : (stryCov_9fa48("159182"), true),
                ...rest
              }));
            }
          } else {
            if (stryMutAct_9fa48("159183")) {
              {}
            } else {
              stryCov_9fa48("159183");
              pending.reject(new Error(stryMutAct_9fa48("159186") ? error && 'Message not acknowledged' : stryMutAct_9fa48("159185") ? false : stryMutAct_9fa48("159184") ? true : (stryCov_9fa48("159184", "159185", "159186"), error || (stryMutAct_9fa48("159187") ? "" : (stryCov_9fa48("159187"), 'Message not acknowledged')))));
            }
          }
        }
      }
    }
  }

  /**
   * Handle SERVICE_RESPONSE message (deferred handler result).
   * This adapter does not own response semantics. It forwards the full message
   * to the injected owner callback when present, while preserving the legacy
   * `(messageId, result, error)` callback signature for older tests/helpers.
   * Requirements: 2.2, 2.3
   * @param {Object} message - SERVICE_RESPONSE message.
   */
  handleServiceResponse(message) {
    if (stryMutAct_9fa48("159188")) {
      {}
    } else {
      stryCov_9fa48("159188");
      const {
        messageId,
        result,
        error
      } = message;
      this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_RECEIVED, stryMutAct_9fa48("159189") ? {} : (stryCov_9fa48("159189"), {
        messageId,
        hasResult: stryMutAct_9fa48("159192") ? result === undefined : stryMutAct_9fa48("159191") ? false : stryMutAct_9fa48("159190") ? true : (stryCov_9fa48("159190", "159191", "159192"), result !== undefined),
        hasError: stryMutAct_9fa48("159195") ? error === undefined : stryMutAct_9fa48("159194") ? false : stryMutAct_9fa48("159193") ? true : (stryCov_9fa48("159193", "159194", "159195"), error !== undefined)
      }));
      if (stryMutAct_9fa48("159197") ? false : stryMutAct_9fa48("159196") ? true : (stryCov_9fa48("159196", "159197"), this.onServiceResponse)) {
        if (stryMutAct_9fa48("159198")) {
          {}
        } else {
          stryCov_9fa48("159198");
          if (stryMutAct_9fa48("159202") ? this.onServiceResponse.length < 2 : stryMutAct_9fa48("159201") ? this.onServiceResponse.length > 2 : stryMutAct_9fa48("159200") ? false : stryMutAct_9fa48("159199") ? true : (stryCov_9fa48("159199", "159200", "159201", "159202"), this.onServiceResponse.length >= 2)) {
            if (stryMutAct_9fa48("159203")) {
              {}
            } else {
              stryCov_9fa48("159203");
              this.onServiceResponse(messageId, result, error);
            }
          } else {
            if (stryMutAct_9fa48("159204")) {
              {}
            } else {
              stryCov_9fa48("159204");
              this.onServiceResponse(message);
            }
          }
          return;
        }
      }
      this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, stryMutAct_9fa48("159205") ? {} : (stryCov_9fa48("159205"), {
        messageId,
        delegatedResponseHandler: stryMutAct_9fa48("159206") ? true : (stryCov_9fa48("159206"), false)
      }));
    }
  }
}
export { RouterMessageHandler };