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
import { v4 as uuidv4 } from 'uuid';
import { CONNECTION_STATE, ROUTER_ADDRESS, ROUTER_ERROR_MSG, ROUTER_LOG_MSG, ROUTER_MESSAGE_TYPE, TRANSPORT_ERROR_MSG, TRANSPORT_NUM, TRANSPORT_STRING } from '../constants/transport.js';
import { COLUMN } from '../constants/index.js';
import { getOrCreateCorrelationId, withCorrelationId } from '../utils/correlation.js';
import { isRaftPacket } from '../raft/raft-packet-utils.js';
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
    if (stryMutAct_9fa48("158864")) {
      {}
    } else {
      stryCov_9fa48("158864");
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
    if (stryMutAct_9fa48("158865")) {
      {}
    } else {
      stryCov_9fa48("158865");
      const correlationId = getOrCreateCorrelationId(message);
      const enrichedMessage = withCorrelationId(message, correlationId);
      const messageId = stryMutAct_9fa48("158868") ? enrichedMessage.messageId && uuidv4() : stryMutAct_9fa48("158867") ? false : stryMutAct_9fa48("158866") ? true : (stryCov_9fa48("158866", "158867", "158868"), enrichedMessage.messageId || uuidv4());
      if (stryMutAct_9fa48("158871") ? false : stryMutAct_9fa48("158870") ? true : stryMutAct_9fa48("158869") ? this.isValidAddress(targetAddress) : (stryCov_9fa48("158869", "158870", "158871"), !this.isValidAddress(targetAddress))) {
        if (stryMutAct_9fa48("158872")) {
          {}
        } else {
          stryCov_9fa48("158872");
          const stack = new Error().stack;
          this.logger.error(ROUTER_LOG_MSG.INVALID_ADDRESS, stryMutAct_9fa48("158873") ? {} : (stryCov_9fa48("158873"), {
            correlationId,
            targetAddress,
            stack: stryMutAct_9fa48("158874") ? stack.split(TRANSPORT_STRING.NEWLINE) : (stryCov_9fa48("158874"), stack.split(TRANSPORT_STRING.NEWLINE).slice(TRANSPORT_NUM.TWO, TRANSPORT_NUM.SIX))
          }));
          throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(targetAddress));
        }
      }
      this.logger.debug(ROUTER_LOG_MSG.SENDING_MESSAGE, stryMutAct_9fa48("158875") ? {} : (stryCov_9fa48("158875"), {
        correlationId,
        targetAddress,
        type: enrichedMessage.type,
        messageId
      }));
      const parsed = this.parseAddress(targetAddress);
      const targetNodeId = stryMutAct_9fa48("158878") ? options.targetNodeId && parsed.nodeId : stryMutAct_9fa48("158877") ? false : stryMutAct_9fa48("158876") ? true : (stryCov_9fa48("158876", "158877", "158878"), options.targetNodeId || parsed.nodeId);
      if (stryMutAct_9fa48("158880") ? false : stryMutAct_9fa48("158879") ? true : (stryCov_9fa48("158879", "158880"), this.hasTransportRegistry())) {
        if (stryMutAct_9fa48("158881")) {
          {}
        } else {
          stryCov_9fa48("158881");
          const result = await this.deliverViaTransportRegistry(targetAddress, messageId, enrichedMessage, targetNodeId);
          return stryMutAct_9fa48("158882") ? {} : (stryCov_9fa48("158882"), {
            ...result,
            correlationId
          });
        }
      }
      if (stryMutAct_9fa48("158885") ? targetNodeId !== this.nodeId : stryMutAct_9fa48("158884") ? false : stryMutAct_9fa48("158883") ? true : (stryCov_9fa48("158883", "158884", "158885"), targetNodeId === this.nodeId)) {
        if (stryMutAct_9fa48("158886")) {
          {}
        } else {
          stryCov_9fa48("158886");
          const selfConn = this.nodeConnections.get(this.nodeId);
          const hasSelfConn = stryMutAct_9fa48("158889") ? selfConn || selfConn.state === ConnectionState.CONNECTED : stryMutAct_9fa48("158888") ? false : stryMutAct_9fa48("158887") ? true : (stryCov_9fa48("158887", "158888", "158889"), selfConn && (stryMutAct_9fa48("158891") ? selfConn.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("158890") ? true : (stryCov_9fa48("158890", "158891"), selfConn.state === ConnectionState.CONNECTED)));
          if (stryMutAct_9fa48("158894") ? false : stryMutAct_9fa48("158893") ? true : stryMutAct_9fa48("158892") ? hasSelfConn : (stryCov_9fa48("158892", "158893", "158894"), !hasSelfConn)) {
            if (stryMutAct_9fa48("158895")) {
              {}
            } else {
              stryCov_9fa48("158895");
              this.logger.warn(ROUTER_LOG_MSG.NO_SELF_CONNECTION, stryMutAct_9fa48("158896") ? {} : (stryCov_9fa48("158896"), {
                correlationId,
                targetAddress,
                nodeId: this.nodeId
              }));
              return stryMutAct_9fa48("158897") ? {} : (stryCov_9fa48("158897"), {
                messageId,
                correlationId,
                acknowledged: stryMutAct_9fa48("158898") ? true : (stryCov_9fa48("158898"), false),
                error: ROUTER_ERROR_MSG.noConnectionToNode(this.nodeId)
              });
            }
          }
        }
      }
      const result = await this.deliverRemote(targetAddress, messageId, enrichedMessage, targetNodeId);
      return stryMutAct_9fa48("158899") ? {} : (stryCov_9fa48("158899"), {
        ...result,
        correlationId
      });
    }
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
    if (stryMutAct_9fa48("158900")) {
      {}
    } else {
      stryCov_9fa48("158900");
      const transportRegistry = this.getTransportRegistry();
      const connectionPool = this.getConnectionPool();
      this.logger.debug(ROUTER_LOG_MSG.TRANSPORT_DELIVERY_START, stryMutAct_9fa48("158901") ? {} : (stryCov_9fa48("158901"), {
        messageId,
        targetAddress,
        targetNodeId
      }));
      const candidates = transportRegistry.getDeliveryCandidates(targetNodeId);
      if (stryMutAct_9fa48("158904") ? candidates.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158903") ? false : stryMutAct_9fa48("158902") ? true : (stryCov_9fa48("158902", "158903", "158904"), candidates.length === TRANSPORT_NUM.ZERO)) {
        if (stryMutAct_9fa48("158905")) {
          {}
        } else {
          stryCov_9fa48("158905");
          this.logger.warn(ROUTER_LOG_MSG.TRANSPORT_NO_ENDPOINTS, stryMutAct_9fa48("158906") ? {} : (stryCov_9fa48("158906"), {
            messageId,
            targetNodeId
          }));
          return stryMutAct_9fa48("158907") ? {} : (stryCov_9fa48("158907"), {
            messageId,
            acknowledged: stryMutAct_9fa48("158908") ? true : (stryCov_9fa48("158908"), false),
            success: stryMutAct_9fa48("158909") ? true : (stryCov_9fa48("158909"), false),
            error: ROUTER_ERROR_MSG.NO_ENDPOINTS_FOR_NODE,
            errorMessage: ROUTER_ERROR_MSG.noEndpointsForNode(targetNodeId)
          });
        }
      }
      const attempts = stryMutAct_9fa48("158910") ? ["Stryker was here"] : (stryCov_9fa48("158910"), []);
      for (const candidate of candidates) {
        if (stryMutAct_9fa48("158911")) {
          {}
        } else {
          stryCov_9fa48("158911");
          const endpoint = candidate.endpoint;
          const provider = candidate.provider;
          const transportType = endpoint[COLUMN.TRANSPORT_TYPE];
          this.logger.debug(ROUTER_LOG_MSG.TRANSPORT_ENDPOINT_SELECTED, stryMutAct_9fa48("158912") ? {} : (stryCov_9fa48("158912"), {
            messageId,
            targetNodeId,
            endpointId: endpoint[COLUMN.ENDPOINT_ID],
            transportType,
            priority: endpoint[COLUMN.PRIORITY]
          }));
          const result = await this.deliverViaEndpoint(targetAddress, messageId, payload, targetNodeId, endpoint, provider, connectionPool);
          if (stryMutAct_9fa48("158914") ? false : stryMutAct_9fa48("158913") ? true : (stryCov_9fa48("158913", "158914"), result.acknowledged)) {
            if (stryMutAct_9fa48("158915")) {
              {}
            } else {
              stryCov_9fa48("158915");
              this.logger.debug(ROUTER_LOG_MSG.TRANSPORT_DELIVERY_SUCCESS, stryMutAct_9fa48("158916") ? {} : (stryCov_9fa48("158916"), {
                messageId,
                targetNodeId,
                transportType,
                endpointId: endpoint[COLUMN.ENDPOINT_ID]
              }));
              return stryMutAct_9fa48("158917") ? {} : (stryCov_9fa48("158917"), {
                ...result,
                success: stryMutAct_9fa48("158918") ? false : (stryCov_9fa48("158918"), true),
                transportUsed: stryMutAct_9fa48("158919") ? {} : (stryCov_9fa48("158919"), {
                  endpointId: endpoint[COLUMN.ENDPOINT_ID],
                  transportType,
                  priority: endpoint[COLUMN.PRIORITY]
                })
              });
            }
          }
          this.logger.debug(ROUTER_LOG_MSG.TRANSPORT_DELIVERY_FAILED, stryMutAct_9fa48("158920") ? {} : (stryCov_9fa48("158920"), {
            messageId,
            targetNodeId,
            transportType,
            endpointId: endpoint[COLUMN.ENDPOINT_ID],
            error: result.error
          }));
          attempts.push(stryMutAct_9fa48("158921") ? {} : (stryCov_9fa48("158921"), {
            endpoint: stryMutAct_9fa48("158922") ? {} : (stryCov_9fa48("158922"), {
              endpointId: endpoint[COLUMN.ENDPOINT_ID],
              transportType,
              priority: endpoint[COLUMN.PRIORITY]
            }),
            error: stryMutAct_9fa48("158923") ? {} : (stryCov_9fa48("158923"), {
              code: stryMutAct_9fa48("158924") ? "" : (stryCov_9fa48("158924"), 'DELIVERY_FAILED'),
              message: stryMutAct_9fa48("158927") ? result.error && 'Delivery failed' : stryMutAct_9fa48("158926") ? false : stryMutAct_9fa48("158925") ? true : (stryCov_9fa48("158925", "158926", "158927"), result.error || (stryMutAct_9fa48("158928") ? "" : (stryCov_9fa48("158928"), 'Delivery failed')))
            })
          }));
        }
      }
      this.logger.warn(ROUTER_LOG_MSG.TRANSPORT_ALL_FAILED, stryMutAct_9fa48("158929") ? {} : (stryCov_9fa48("158929"), {
        messageId,
        targetNodeId,
        attemptCount: attempts.length
      }));
      return stryMutAct_9fa48("158930") ? {} : (stryCov_9fa48("158930"), {
        messageId,
        acknowledged: stryMutAct_9fa48("158931") ? true : (stryCov_9fa48("158931"), false),
        success: stryMutAct_9fa48("158932") ? true : (stryCov_9fa48("158932"), false),
        error: ROUTER_ERROR_MSG.ALL_TRANSPORTS_FAILED,
        attempts
      });
    }
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
  async deliverViaEndpoint(targetAddress, messageId, payload, targetNodeId, endpoint, provider, connectionPool) {
    if (stryMutAct_9fa48("158933")) {
      {}
    } else {
      stryCov_9fa48("158933");
      try {
        if (stryMutAct_9fa48("158934")) {
          {}
        } else {
          stryCov_9fa48("158934");
          const connection = await connectionPool.getConnection(targetNodeId, endpoint, provider);
          const message = stryMutAct_9fa48("158935") ? {} : (stryCov_9fa48("158935"), {
            type: RouterMessageType.SERVICE_MESSAGE,
            messageId,
            targetAddress,
            sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
            sourceNodeId: this.nodeId,
            payload,
            timestamp: Date.now()
          });
          const result = await provider.send(connection.providerConnection, message);
          connectionPool.releaseConnection(targetNodeId);
          return stryMutAct_9fa48("158936") ? {} : (stryCov_9fa48("158936"), {
            messageId,
            acknowledged: stryMutAct_9fa48("158937") ? false : (stryCov_9fa48("158937"), true),
            ...result
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("158938")) {
          {}
        } else {
          stryCov_9fa48("158938");
          this.logger.error(ROUTER_LOG_MSG.TRANSPORT_DELIVERY_FAILED, stryMutAct_9fa48("158939") ? {} : (stryCov_9fa48("158939"), {
            messageId,
            targetNodeId,
            endpointId: endpoint[COLUMN.ENDPOINT_ID],
            error: error.message
          }));
          return stryMutAct_9fa48("158940") ? {} : (stryCov_9fa48("158940"), {
            messageId,
            acknowledged: stryMutAct_9fa48("158941") ? true : (stryCov_9fa48("158941"), false),
            error: error.message
          });
        }
      }
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
    if (stryMutAct_9fa48("158942")) {
      {}
    } else {
      stryCov_9fa48("158942");
      if (stryMutAct_9fa48("158944") ? false : stryMutAct_9fa48("158943") ? true : (stryCov_9fa48("158943", "158944"), isRaftPacket(payload))) {
        if (stryMutAct_9fa48("158945")) {
          {}
        } else {
          stryCov_9fa48("158945");
          return this.deliverRaftDirect(targetAddress, messageId, payload, targetNodeId);
        }
      }

      // Register pending response BEFORE sending so we don't miss
      // a SERVICE_RESPONSE that arrives before we register.
      const responsePromise = this.registerPendingResponse(messageId, this.messageTimeoutMs);

      // Enqueue the send — the ACK releases the outbound queue slot.
      const ackResult = await this.outboundQueue.enqueueOutbound(targetNodeId, () => {
        if (stryMutAct_9fa48("158946")) {
          {}
        } else {
          stryCov_9fa48("158946");
          const connection = this.nodeConnections.get(targetNodeId);
          if (stryMutAct_9fa48("158949") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("158948") ? false : stryMutAct_9fa48("158947") ? true : (stryCov_9fa48("158947", "158948", "158949"), (stryMutAct_9fa48("158950") ? connection : (stryCov_9fa48("158950"), !connection)) || (stryMutAct_9fa48("158952") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("158951") ? false : (stryCov_9fa48("158951", "158952"), connection.state !== ConnectionState.CONNECTED)))) {
            if (stryMutAct_9fa48("158953")) {
              {}
            } else {
              stryCov_9fa48("158953");
              this.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, stryMutAct_9fa48("158954") ? {} : (stryCov_9fa48("158954"), {
                messageId,
                targetAddress,
                targetNodeId,
                localNodeId: this.nodeId,
                connectionExists: stryMutAct_9fa48("158955") ? !connection : (stryCov_9fa48("158955"), !(stryMutAct_9fa48("158956") ? connection : (stryCov_9fa48("158956"), !connection))),
                connectionState: stryMutAct_9fa48("158957") ? connection.state : (stryCov_9fa48("158957"), connection?.state),
                availableConnections: Array.from(this.nodeConnections.keys())
              }));
              return stryMutAct_9fa48("158958") ? {} : (stryCov_9fa48("158958"), {
                messageId,
                acknowledged: stryMutAct_9fa48("158959") ? true : (stryCov_9fa48("158959"), false),
                error: ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId)
              });
            }
          }
          return this.sendMessage(connection, targetAddress, messageId, payload, targetNodeId);
        }
      });

      // If ACK failed, clean up pending response and return failure.
      if (stryMutAct_9fa48("158962") ? false : stryMutAct_9fa48("158961") ? true : stryMutAct_9fa48("158960") ? ackResult.acknowledged : (stryCov_9fa48("158960", "158961", "158962"), !ackResult.acknowledged)) {
        if (stryMutAct_9fa48("158963")) {
          {}
        } else {
          stryCov_9fa48("158963");
          const pending = this.pendingResponses.get(messageId);
          if (stryMutAct_9fa48("158965") ? false : stryMutAct_9fa48("158964") ? true : (stryCov_9fa48("158964", "158965"), pending)) {
            if (stryMutAct_9fa48("158966")) {
              {}
            } else {
              stryCov_9fa48("158966");
              clearTimeout(pending.timeoutId);
              this.pendingResponses.delete(messageId);
            }
          }
          return ackResult;
        }
      }

      // Wait for the SERVICE_RESPONSE with the handler result.
      try {
        if (stryMutAct_9fa48("158967")) {
          {}
        } else {
          stryCov_9fa48("158967");
          const handlerResult = await responsePromise;
          return stryMutAct_9fa48("158968") ? {} : (stryCov_9fa48("158968"), {
            messageId,
            acknowledged: stryMutAct_9fa48("158969") ? false : (stryCov_9fa48("158969"), true),
            success: stryMutAct_9fa48("158970") ? false : (stryCov_9fa48("158970"), true),
            ...handlerResult
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("158971")) {
          {}
        } else {
          stryCov_9fa48("158971");
          return stryMutAct_9fa48("158972") ? {} : (stryCov_9fa48("158972"), {
            messageId,
            acknowledged: stryMutAct_9fa48("158973") ? false : (stryCov_9fa48("158973"), true),
            success: stryMutAct_9fa48("158974") ? true : (stryCov_9fa48("158974"), false),
            error: error.message
          });
        }
      }
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
    if (stryMutAct_9fa48("158975")) {
      {}
    } else {
      stryCov_9fa48("158975");
      const connection = this.nodeConnections.get(targetNodeId);
      if (stryMutAct_9fa48("158978") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("158977") ? false : stryMutAct_9fa48("158976") ? true : (stryCov_9fa48("158976", "158977", "158978"), (stryMutAct_9fa48("158979") ? connection : (stryCov_9fa48("158979"), !connection)) || (stryMutAct_9fa48("158981") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("158980") ? false : (stryCov_9fa48("158980", "158981"), connection.state !== ConnectionState.CONNECTED)))) {
        if (stryMutAct_9fa48("158982")) {
          {}
        } else {
          stryCov_9fa48("158982");
          this.logger.warn(ROUTER_LOG_MSG.RAFT_DIRECT_DELIVERY_FAILED, stryMutAct_9fa48("158983") ? {} : (stryCov_9fa48("158983"), {
            messageId,
            targetAddress,
            targetNodeId,
            localNodeId: this.nodeId,
            connectionExists: stryMutAct_9fa48("158984") ? !connection : (stryCov_9fa48("158984"), !(stryMutAct_9fa48("158985") ? connection : (stryCov_9fa48("158985"), !connection))),
            connectionState: stryMutAct_9fa48("158986") ? connection.state : (stryCov_9fa48("158986"), connection?.state)
          }));
          return stryMutAct_9fa48("158987") ? {} : (stryCov_9fa48("158987"), {
            messageId,
            acknowledged: stryMutAct_9fa48("158988") ? true : (stryCov_9fa48("158988"), false),
            error: ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId)
          });
        }
      }
      const message = stryMutAct_9fa48("158989") ? {} : (stryCov_9fa48("158989"), {
        type: RouterMessageType.SERVICE_MESSAGE,
        messageId,
        targetAddress,
        sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
        sourceNodeId: this.nodeId,
        payload,
        timestamp: Date.now()
      });
      this.logger.debug(ROUTER_LOG_MSG.RAFT_DIRECT_DELIVERY, stryMutAct_9fa48("158990") ? {} : (stryCov_9fa48("158990"), {
        messageId,
        targetAddress,
        targetNodeId
      }));
      this.sendRaw(connection.ws, message);
      return stryMutAct_9fa48("158991") ? {} : (stryCov_9fa48("158991"), {
        messageId,
        acknowledged: stryMutAct_9fa48("158992") ? false : (stryCov_9fa48("158992"), true),
        direct: stryMutAct_9fa48("158993") ? false : (stryCov_9fa48("158993"), true)
      });
    }
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
    if (stryMutAct_9fa48("158994")) {
      {}
    } else {
      stryCov_9fa48("158994");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("158995")) {
          {}
        } else {
          stryCov_9fa48("158995");
          const message = stryMutAct_9fa48("158996") ? {} : (stryCov_9fa48("158996"), {
            type: RouterMessageType.SERVICE_MESSAGE,
            messageId,
            targetAddress,
            sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
            sourceNodeId: this.nodeId,
            payload,
            timestamp: Date.now()
          });
          const timeout = setTimeout(() => {
            if (stryMutAct_9fa48("158997")) {
              {}
            } else {
              stryCov_9fa48("158997");
              this.pendingMessages.delete(messageId);
              resolve(stryMutAct_9fa48("158998") ? {} : (stryCov_9fa48("158998"), {
                messageId,
                acknowledged: stryMutAct_9fa48("158999") ? true : (stryCov_9fa48("158999"), false),
                error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT
              }));
            }
          }, this.messageTimeoutMs);
          this.pendingMessages.set(messageId, stryMutAct_9fa48("159000") ? {} : (stryCov_9fa48("159000"), {
            messageId,
            resolve,
            reject,
            timeout,
            sentAt: Date.now(),
            targetNodeId
          }));
          this.sendRaw(connection.ws, message);
        }
      });
    }
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
    if (stryMutAct_9fa48("159001")) {
      {}
    } else {
      stryCov_9fa48("159001");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("159002")) {
          {}
        } else {
          stryCov_9fa48("159002");
          const timeoutId = setTimeout(() => {
            if (stryMutAct_9fa48("159003")) {
              {}
            } else {
              stryCov_9fa48("159003");
              this.pendingResponses.delete(messageId);
              reject(new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT));
            }
          }, timeoutMs);
          this.pendingResponses.set(messageId, stryMutAct_9fa48("159004") ? {} : (stryCov_9fa48("159004"), {
            resolve,
            reject,
            timeoutId
          }));
        }
      });
    }
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
    if (stryMutAct_9fa48("159005")) {
      {}
    } else {
      stryCov_9fa48("159005");
      const pending = this.pendingResponses.get(messageId);
      if (stryMutAct_9fa48("159008") ? false : stryMutAct_9fa48("159007") ? true : stryMutAct_9fa48("159006") ? pending : (stryCov_9fa48("159006", "159007", "159008"), !pending)) return stryMutAct_9fa48("159009") ? true : (stryCov_9fa48("159009"), false);
      clearTimeout(pending.timeoutId);
      this.pendingResponses.delete(messageId);
      if (stryMutAct_9fa48("159011") ? false : stryMutAct_9fa48("159010") ? true : (stryCov_9fa48("159010", "159011"), error)) {
        if (stryMutAct_9fa48("159012")) {
          {}
        } else {
          stryCov_9fa48("159012");
          pending.reject(new Error(error));
        }
      } else {
        if (stryMutAct_9fa48("159013")) {
          {}
        } else {
          stryCov_9fa48("159013");
          pending.resolve(result);
        }
      }
      return stryMutAct_9fa48("159014") ? false : (stryCov_9fa48("159014"), true);
    }
  }

  /**
   * Clean up all pending responses on shutdown.
   * Rejects all outstanding pending responses and clears timeouts.
   * @param {string} reason - Shutdown reason message.
   */
  clearPendingResponses(reason) {
    if (stryMutAct_9fa48("159015")) {
      {}
    } else {
      stryCov_9fa48("159015");
      for (const [messageId, pending] of this.pendingResponses) {
        if (stryMutAct_9fa48("159016")) {
          {}
        } else {
          stryCov_9fa48("159016");
          clearTimeout(pending.timeoutId);
          pending.resolve(stryMutAct_9fa48("159017") ? {} : (stryCov_9fa48("159017"), {
            messageId,
            acknowledged: stryMutAct_9fa48("159018") ? true : (stryCov_9fa48("159018"), false),
            error: reason,
            shutdown: stryMutAct_9fa48("159019") ? false : (stryCov_9fa48("159019"), true)
          }));
          this.pendingResponses.delete(messageId);
        }
      }
    }
  }
}
export { RouterDeliveryManager };