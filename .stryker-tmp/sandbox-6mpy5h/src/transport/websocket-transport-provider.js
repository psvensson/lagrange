/**
 * WebSocketTransportProvider - WebSocket implementation of TransportProvider.
 *
 * Refactors existing WebSocket functionality into the transport abstraction layer.
 * Supports connection establishment with identification handshake, message sending
 * with acknowledgment, ping/pong health checks, and reconnection with exponential
 * backoff.
 *
 * Requirements: 7.1, 7.2, 7.4, 7.5
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
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { TransportProvider } from './transport-provider.js';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { TRANSPORT_TYPE } from '../constants/transport-types.js';
import { CONNECTION_STATE, TRANSPORT_CONFIG_KEY, TRANSPORT_DEFAULT, TRANSPORT_ERROR_MSG, TRANSPORT_EVENT, TRANSPORT_NUM, WS_MESSAGE_TYPE } from '../constants/transport.js';

/**
 * Subsystem name for logging.
 */
const WS_PROVIDER_SUBSYSTEM = stryMutAct_9fa48("159545") ? "" : (stryCov_9fa48("159545"), 'websocket-transport-provider');

/**
 * Log messages for WebSocketTransportProvider.
 */
const WS_PROVIDER_LOG_MSG = Object.freeze(stryMutAct_9fa48("159546") ? {} : (stryCov_9fa48("159546"), {
  CONNECTING: stryMutAct_9fa48("159547") ? "" : (stryCov_9fa48("159547"), 'Connecting to endpoint'),
  CONNECTED: stryMutAct_9fa48("159548") ? "" : (stryCov_9fa48("159548"), 'Connected to endpoint'),
  CONNECTION_FAILED: stryMutAct_9fa48("159549") ? "" : (stryCov_9fa48("159549"), 'Connection failed'),
  DISCONNECTING: stryMutAct_9fa48("159550") ? "" : (stryCov_9fa48("159550"), 'Disconnecting from endpoint'),
  DISCONNECTED: stryMutAct_9fa48("159551") ? "" : (stryCov_9fa48("159551"), 'Disconnected from endpoint'),
  SENDING_MESSAGE: stryMutAct_9fa48("159552") ? "" : (stryCov_9fa48("159552"), 'Sending message'),
  MESSAGE_SENT: stryMutAct_9fa48("159553") ? "" : (stryCov_9fa48("159553"), 'Message sent'),
  MESSAGE_RECEIVED: stryMutAct_9fa48("159554") ? "" : (stryCov_9fa48("159554"), 'Message received'),
  IDENTIFICATION_SENT: stryMutAct_9fa48("159555") ? "" : (stryCov_9fa48("159555"), 'Identification sent'),
  IDENTIFICATION_RECEIVED: stryMutAct_9fa48("159556") ? "" : (stryCov_9fa48("159556"), 'Identification received'),
  PING_SENT: stryMutAct_9fa48("159557") ? "" : (stryCov_9fa48("159557"), 'Ping sent'),
  PONG_RECEIVED: stryMutAct_9fa48("159558") ? "" : (stryCov_9fa48("159558"), 'Pong received'),
  RECONNECTING: stryMutAct_9fa48("159559") ? "" : (stryCov_9fa48("159559"), 'Attempting reconnection'),
  RECONNECT_FAILED: stryMutAct_9fa48("159560") ? "" : (stryCov_9fa48("159560"), 'Reconnection failed'),
  MAX_RECONNECTS_REACHED: stryMutAct_9fa48("159561") ? "" : (stryCov_9fa48("159561"), 'Max reconnection attempts reached'),
  SHUTDOWN_STARTED: stryMutAct_9fa48("159562") ? "" : (stryCov_9fa48("159562"), 'Shutdown started'),
  SHUTDOWN_COMPLETE: stryMutAct_9fa48("159563") ? "" : (stryCov_9fa48("159563"), 'Shutdown complete'),
  HEALTH_CHECK: stryMutAct_9fa48("159564") ? "" : (stryCov_9fa48("159564"), 'Health check performed'),
  PROVIDER_UNAVAILABLE: stryMutAct_9fa48("159565") ? "" : (stryCov_9fa48("159565"), 'Provider is unavailable')
}));

/**
 * Error messages for WebSocketTransportProvider.
 */
const WS_PROVIDER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("159566") ? {} : (stryCov_9fa48("159566"), {
  CONNECTION_FAILED: stryMutAct_9fa48("159567") ? "" : (stryCov_9fa48("159567"), 'CONNECTION_FAILED'),
  CONNECTION_TIMEOUT: stryMutAct_9fa48("159568") ? "" : (stryCov_9fa48("159568"), 'CONNECTION_TIMEOUT'),
  SEND_FAILED: stryMutAct_9fa48("159569") ? "" : (stryCov_9fa48("159569"), 'SEND_FAILED'),
  CONNECTION_CLOSED: stryMutAct_9fa48("159570") ? "" : (stryCov_9fa48("159570"), 'CONNECTION_CLOSED'),
  PROVIDER_UNAVAILABLE: stryMutAct_9fa48("159571") ? "" : (stryCov_9fa48("159571"), 'PROVIDER_UNAVAILABLE'),
  MESSAGE_TIMEOUT: stryMutAct_9fa48("159572") ? "" : (stryCov_9fa48("159572"), 'MESSAGE_TIMEOUT'),
  MESSAGE_NOT_ACKNOWLEDGED: stryMutAct_9fa48("159573") ? "" : (stryCov_9fa48("159573"), 'MESSAGE_NOT_ACKNOWLEDGED'),
  connectionFailed: stryMutAct_9fa48("159574") ? () => undefined : (stryCov_9fa48("159574"), (address, message) => stryMutAct_9fa48("159575") ? `` : (stryCov_9fa48("159575"), `Failed to connect to ${address}: ${message}`)),
  sendFailed: stryMutAct_9fa48("159576") ? () => undefined : (stryCov_9fa48("159576"), message => stryMutAct_9fa48("159577") ? `` : (stryCov_9fa48("159577"), `Failed to send message: ${message}`))
}));

/**
 * WebSocketTransportProvider implements the TransportProvider interface
 * for WebSocket-based communication.
 */
class WebSocketTransportProvider extends TransportProvider {
  /**
   * Create a new WebSocketTransportProvider.
   * @param {Object} options - Configuration options
   * @param {string} [options.localNodeId] - Local node ID for identification
   * @param {string} [options.localAddress] - Local service address
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("159578")) {
      {}
    } else {
      stryCov_9fa48("159578");
      super();
      this.localNodeId = stryMutAct_9fa48("159581") ? options.localNodeId && uuidv4() : stryMutAct_9fa48("159580") ? false : stryMutAct_9fa48("159579") ? true : (stryCov_9fa48("159579", "159580", "159581"), options.localNodeId || uuidv4());
      this.localAddress = stryMutAct_9fa48("159584") ? options.localAddress && null : stryMutAct_9fa48("159583") ? false : stryMutAct_9fa48("159582") ? true : (stryCov_9fa48("159582", "159583", "159584"), options.localAddress || null);

      // Event emitter for transport events
      this.events = new EventEmitter();

      // Active connections (connectionId -> connection info)
      this.connections = new Map();

      // Pending messages awaiting acknowledgment (messageId -> pending info)
      this.pendingMessages = new Map();

      // Configuration from ConfigurationManager
      const config = ConfigurationManager.getInstance();
      this.reconnectIntervalMs = stryMutAct_9fa48("159587") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) && TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS : stryMutAct_9fa48("159586") ? false : stryMutAct_9fa48("159585") ? true : (stryCov_9fa48("159585", "159586", "159587"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) || TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS);
      this.reconnectMaxAttempts = stryMutAct_9fa48("159590") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) && TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS : stryMutAct_9fa48("159589") ? false : stryMutAct_9fa48("159588") ? true : (stryCov_9fa48("159588", "159589", "159590"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) || TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS);
      this.reconnectBackoffMultiplier = stryMutAct_9fa48("159593") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) && TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER : stryMutAct_9fa48("159592") ? false : stryMutAct_9fa48("159591") ? true : (stryCov_9fa48("159591", "159592", "159593"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) || TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER);
      this.pingIntervalMs = stryMutAct_9fa48("159596") ? config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) && TRANSPORT_DEFAULT.PING_INTERVAL_MS : stryMutAct_9fa48("159595") ? false : stryMutAct_9fa48("159594") ? true : (stryCov_9fa48("159594", "159595", "159596"), config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) || TRANSPORT_DEFAULT.PING_INTERVAL_MS);
      this.messageTimeoutMs = stryMutAct_9fa48("159599") ? config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) && TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS : stryMutAct_9fa48("159598") ? false : stryMutAct_9fa48("159597") ? true : (stryCov_9fa48("159597", "159598", "159599"), config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) || TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS);

      // Logging
      this.logger = LoggingService.getInstance().forSubsystem(WS_PROVIDER_SUBSYSTEM);

      // State
      this.available = stryMutAct_9fa48("159600") ? false : (stryCov_9fa48("159600"), true);
      this.isShuttingDown = stryMutAct_9fa48("159601") ? true : (stryCov_9fa48("159601"), false);
    }
  }

  /**
   * Get the transport type identifier.
   * @return {string} Transport type ('ws')
   */
  getType() {
    if (stryMutAct_9fa48("159602")) {
      {}
    } else {
      stryCov_9fa48("159602");
      return TRANSPORT_TYPE.WEBSOCKET;
    }
  }

  /**
   * Check if this transport is currently available.
   * @return {boolean} True if transport can accept connections
   */
  isAvailable() {
    if (stryMutAct_9fa48("159603")) {
      {}
    } else {
      stryCov_9fa48("159603");
      return stryMutAct_9fa48("159606") ? this.available || !this.isShuttingDown : stryMutAct_9fa48("159605") ? false : stryMutAct_9fa48("159604") ? true : (stryCov_9fa48("159604", "159605", "159606"), this.available && (stryMutAct_9fa48("159607") ? this.isShuttingDown : (stryCov_9fa48("159607"), !this.isShuttingDown)));
    }
  }

  /**
   * Connect to a remote endpoint.
   * @param {Object} endpoint - Endpoint record from node_endpoints table
   * @param {string} endpoint.endpoint_id - Unique identifier for the endpoint
   * @param {string} endpoint.node_id - Target node ID
   * @param {string} endpoint.transport_type - Transport type (must be 'ws')
   * @param {string} endpoint.address - WebSocket address (e.g., ws://host:port)
   * @param {number} endpoint.priority - Endpoint priority
   * @param {Object|string} endpoint.metadata - Transport-specific configuration
   * @param {string} endpoint.status - Endpoint status
   * @return {Promise<Object>} Connection object with connection details
   * @throws {Error} If connection fails
   */
  async connect(endpoint) {
    if (stryMutAct_9fa48("159608")) {
      {}
    } else {
      stryCov_9fa48("159608");
      if (stryMutAct_9fa48("159611") ? false : stryMutAct_9fa48("159610") ? true : stryMutAct_9fa48("159609") ? this.isAvailable() : (stryCov_9fa48("159609", "159610", "159611"), !this.isAvailable())) {
        if (stryMutAct_9fa48("159612")) {
          {}
        } else {
          stryCov_9fa48("159612");
          const error = this.createTransportError(WS_PROVIDER_ERROR_MSG.PROVIDER_UNAVAILABLE, WS_PROVIDER_LOG_MSG.PROVIDER_UNAVAILABLE, endpoint);
          throw error;
        }
      }
      const connectionId = uuidv4();
      const address = endpoint.address;
      this.logger.debug(WS_PROVIDER_LOG_MSG.CONNECTING, stryMutAct_9fa48("159613") ? {} : (stryCov_9fa48("159613"), {
        connectionId,
        nodeId: endpoint.node_id,
        address
      }));
      const connectionInfo = stryMutAct_9fa48("159614") ? {} : (stryCov_9fa48("159614"), {
        connectionId,
        nodeId: endpoint.node_id,
        endpointId: endpoint.endpoint_id,
        address,
        ws: null,
        state: CONNECTION_STATE.CONNECTING,
        reconnectAttempts: TRANSPORT_NUM.ZERO,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        lastPingTime: null,
        lastPongTime: null,
        latency: null,
        pingInterval: null,
        metadata: this.parseMetadata(endpoint.metadata)
      });
      this.connections.set(connectionId, connectionInfo);
      await this.establishConnection(connectionInfo);
      return stryMutAct_9fa48("159615") ? {} : (stryCov_9fa48("159615"), {
        connectionId,
        nodeId: endpoint.node_id,
        endpointId: endpoint.endpoint_id,
        transportType: this.getType(),
        state: connectionInfo.state,
        createdAt: connectionInfo.createdAt
      });
    }
  }

  /**
   * Establish WebSocket connection to endpoint.
   * @param {Object} connectionInfo - Connection information
   * @return {Promise<void>}
   * @private
   */
  async establishConnection(connectionInfo) {
    if (stryMutAct_9fa48("159616")) {
      {}
    } else {
      stryCov_9fa48("159616");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("159617")) {
          {}
        } else {
          stryCov_9fa48("159617");
          let timeoutId = null;
          const cleanup = () => {
            if (stryMutAct_9fa48("159618")) {
              {}
            } else {
              stryCov_9fa48("159618");
              if (stryMutAct_9fa48("159620") ? false : stryMutAct_9fa48("159619") ? true : (stryCov_9fa48("159619", "159620"), timeoutId)) {
                if (stryMutAct_9fa48("159621")) {
                  {}
                } else {
                  stryCov_9fa48("159621");
                  clearTimeout(timeoutId);
                  timeoutId = null;
                }
              }
            }
          };
          const ws = new WebSocket(connectionInfo.address);

          // Set connection timeout
          timeoutId = setTimeout(() => {
            if (stryMutAct_9fa48("159622")) {
              {}
            } else {
              stryCov_9fa48("159622");
              cleanup();
              ws.terminate();
              connectionInfo.state = CONNECTION_STATE.DISCONNECTED;
              const error = this.createTransportError(WS_PROVIDER_ERROR_MSG.CONNECTION_TIMEOUT, stryMutAct_9fa48("159623") ? "" : (stryCov_9fa48("159623"), 'Connection timeout'), stryMutAct_9fa48("159624") ? {} : (stryCov_9fa48("159624"), {
                address: connectionInfo.address
              }));
              reject(error);
            }
          }, this.messageTimeoutMs);
          ws.on(TRANSPORT_EVENT.OPEN, () => {
            if (stryMutAct_9fa48("159625")) {
              {}
            } else {
              stryCov_9fa48("159625");
              cleanup();
              connectionInfo.ws = ws;
              connectionInfo.state = CONNECTION_STATE.CONNECTED;
              connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
              connectionInfo.lastActivity = Date.now();
              this.logger.info(WS_PROVIDER_LOG_MSG.CONNECTED, stryMutAct_9fa48("159626") ? {} : (stryCov_9fa48("159626"), {
                connectionId: connectionInfo.connectionId,
                nodeId: connectionInfo.nodeId,
                address: connectionInfo.address
              }));

              // Send identification message
              this.sendIdentification(connectionInfo);

              // Start ping interval
              this.startPingInterval(connectionInfo);
              this.events.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, stryMutAct_9fa48("159627") ? {} : (stryCov_9fa48("159627"), {
                connectionId: connectionInfo.connectionId,
                nodeId: connectionInfo.nodeId
              }));
              resolve();
            }
          });
          ws.on(TRANSPORT_EVENT.MESSAGE, data => {
            if (stryMutAct_9fa48("159628")) {
              {}
            } else {
              stryCov_9fa48("159628");
              this.handleMessage(connectionInfo, data);
            }
          });
          ws.on(TRANSPORT_EVENT.CLOSE, () => {
            if (stryMutAct_9fa48("159629")) {
              {}
            } else {
              stryCov_9fa48("159629");
              cleanup();
              this.handleConnectionClose(connectionInfo);
            }
          });
          ws.on(TRANSPORT_EVENT.ERROR, error => {
            if (stryMutAct_9fa48("159630")) {
              {}
            } else {
              stryCov_9fa48("159630");
              this.logger.error(WS_PROVIDER_LOG_MSG.CONNECTION_FAILED, stryMutAct_9fa48("159631") ? {} : (stryCov_9fa48("159631"), {
                connectionId: connectionInfo.connectionId,
                nodeId: connectionInfo.nodeId,
                error: error.message
              }));
              if (stryMutAct_9fa48("159634") ? connectionInfo.state !== CONNECTION_STATE.CONNECTING : stryMutAct_9fa48("159633") ? false : stryMutAct_9fa48("159632") ? true : (stryCov_9fa48("159632", "159633", "159634"), connectionInfo.state === CONNECTION_STATE.CONNECTING)) {
                if (stryMutAct_9fa48("159635")) {
                  {}
                } else {
                  stryCov_9fa48("159635");
                  cleanup();
                  connectionInfo.state = CONNECTION_STATE.DISCONNECTED;
                  const transportError = this.createTransportError(WS_PROVIDER_ERROR_MSG.CONNECTION_FAILED, WS_PROVIDER_ERROR_MSG.connectionFailed(connectionInfo.address, error.message), stryMutAct_9fa48("159636") ? {} : (stryCov_9fa48("159636"), {
                    address: connectionInfo.address
                  }), error);
                  reject(transportError);
                }
              }
            }
          });
        }
      });
    }
  }

  /**
   * Send identification message to peer.
   * @param {Object} connectionInfo - Connection information
   * @private
   */
  sendIdentification(connectionInfo) {
    if (stryMutAct_9fa48("159637")) {
      {}
    } else {
      stryCov_9fa48("159637");
      const message = stryMutAct_9fa48("159638") ? {} : (stryCov_9fa48("159638"), {
        type: WS_MESSAGE_TYPE.IDENTIFY,
        nodeId: this.localNodeId,
        address: this.localAddress,
        timestamp: Date.now()
      });
      this.sendRaw(connectionInfo.ws, message);
      this.logger.debug(WS_PROVIDER_LOG_MSG.IDENTIFICATION_SENT, stryMutAct_9fa48("159639") ? {} : (stryCov_9fa48("159639"), {
        connectionId: connectionInfo.connectionId,
        nodeId: this.localNodeId
      }));
    }
  }

  /**
   * Handle incoming message.
   * @param {Object} connectionInfo - Connection information
   * @param {Buffer|string} data - Message data
   * @private
   */
  handleMessage(connectionInfo, data) {
    if (stryMutAct_9fa48("159640")) {
      {}
    } else {
      stryCov_9fa48("159640");
      connectionInfo.lastActivity = Date.now();
      let message;
      try {
        if (stryMutAct_9fa48("159641")) {
          {}
        } else {
          stryCov_9fa48("159641");
          message = JSON.parse(data.toString());
        }
      } catch (error) {
        if (stryMutAct_9fa48("159642")) {
          {}
        } else {
          stryCov_9fa48("159642");
          this.logger.error(stryMutAct_9fa48("159643") ? "" : (stryCov_9fa48("159643"), 'Failed to parse message'), stryMutAct_9fa48("159644") ? {} : (stryCov_9fa48("159644"), {
            connectionId: connectionInfo.connectionId,
            error: error.message
          }));
          throw error;
        }
      }
      this.logger.debug(WS_PROVIDER_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("159645") ? {} : (stryCov_9fa48("159645"), {
        connectionId: connectionInfo.connectionId,
        type: message.type,
        messageId: message.messageId
      }));

      // Handle identification
      if (stryMutAct_9fa48("159648") ? message.type !== WS_MESSAGE_TYPE.IDENTIFY : stryMutAct_9fa48("159647") ? false : stryMutAct_9fa48("159646") ? true : (stryCov_9fa48("159646", "159647", "159648"), message.type === WS_MESSAGE_TYPE.IDENTIFY)) {
        if (stryMutAct_9fa48("159649")) {
          {}
        } else {
          stryCov_9fa48("159649");
          this.handleIdentification(connectionInfo, message);
          return;
        }
      }

      // Handle ping
      if (stryMutAct_9fa48("159652") ? message.type !== WS_MESSAGE_TYPE.PING : stryMutAct_9fa48("159651") ? false : stryMutAct_9fa48("159650") ? true : (stryCov_9fa48("159650", "159651", "159652"), message.type === WS_MESSAGE_TYPE.PING)) {
        if (stryMutAct_9fa48("159653")) {
          {}
        } else {
          stryCov_9fa48("159653");
          this.sendRaw(connectionInfo.ws, stryMutAct_9fa48("159654") ? {} : (stryCov_9fa48("159654"), {
            type: WS_MESSAGE_TYPE.PONG,
            timestamp: Date.now()
          }));
          return;
        }
      }

      // Handle pong
      if (stryMutAct_9fa48("159657") ? message.type !== WS_MESSAGE_TYPE.PONG : stryMutAct_9fa48("159656") ? false : stryMutAct_9fa48("159655") ? true : (stryCov_9fa48("159655", "159656", "159657"), message.type === WS_MESSAGE_TYPE.PONG)) {
        if (stryMutAct_9fa48("159658")) {
          {}
        } else {
          stryCov_9fa48("159658");
          connectionInfo.lastPongTime = Date.now();
          if (stryMutAct_9fa48("159660") ? false : stryMutAct_9fa48("159659") ? true : (stryCov_9fa48("159659", "159660"), connectionInfo.lastPingTime)) {
            if (stryMutAct_9fa48("159661")) {
              {}
            } else {
              stryCov_9fa48("159661");
              connectionInfo.latency = stryMutAct_9fa48("159662") ? connectionInfo.lastPongTime + connectionInfo.lastPingTime : (stryCov_9fa48("159662"), connectionInfo.lastPongTime - connectionInfo.lastPingTime);
            }
          }
          this.logger.debug(WS_PROVIDER_LOG_MSG.PONG_RECEIVED, stryMutAct_9fa48("159663") ? {} : (stryCov_9fa48("159663"), {
            connectionId: connectionInfo.connectionId,
            latency: connectionInfo.latency
          }));
          return;
        }
      }

      // Handle acknowledgment
      if (stryMutAct_9fa48("159666") ? message.type !== WS_MESSAGE_TYPE.ACK : stryMutAct_9fa48("159665") ? false : stryMutAct_9fa48("159664") ? true : (stryCov_9fa48("159664", "159665", "159666"), message.type === WS_MESSAGE_TYPE.ACK)) {
        if (stryMutAct_9fa48("159667")) {
          {}
        } else {
          stryCov_9fa48("159667");
          this.handleAcknowledgment(message);
          return;
        }
      }

      // Emit message event for other message types
      this.events.emit(TRANSPORT_EVENT.MESSAGE, stryMutAct_9fa48("159668") ? {} : (stryCov_9fa48("159668"), {
        connectionId: connectionInfo.connectionId,
        nodeId: connectionInfo.nodeId,
        message
      }));
    }
  }

  /**
   * Handle identification message from peer.
   * @param {Object} connectionInfo - Connection information
   * @param {Object} message - Identification message
   * @private
   */
  handleIdentification(connectionInfo, message) {
    if (stryMutAct_9fa48("159669")) {
      {}
    } else {
      stryCov_9fa48("159669");
      this.logger.debug(WS_PROVIDER_LOG_MSG.IDENTIFICATION_RECEIVED, stryMutAct_9fa48("159670") ? {} : (stryCov_9fa48("159670"), {
        connectionId: connectionInfo.connectionId,
        remoteNodeId: message.nodeId
      }));
      this.events.emit(TRANSPORT_EVENT.PEER_IDENTIFIED, stryMutAct_9fa48("159671") ? {} : (stryCov_9fa48("159671"), {
        connectionId: connectionInfo.connectionId,
        nodeId: message.nodeId
      }));
    }
  }

  /**
   * Handle acknowledgment message.
   * @param {Object} message - Acknowledgment message
   * @private
   */
  handleAcknowledgment(message) {
    if (stryMutAct_9fa48("159672")) {
      {}
    } else {
      stryCov_9fa48("159672");
      const {
        messageId,
        acknowledged,
        error,
        type: _type,
        ...rest
      } = message;
      const pending = this.pendingMessages.get(messageId);
      if (stryMutAct_9fa48("159674") ? false : stryMutAct_9fa48("159673") ? true : (stryCov_9fa48("159673", "159674"), pending)) {
        if (stryMutAct_9fa48("159675")) {
          {}
        } else {
          stryCov_9fa48("159675");
          clearTimeout(pending.timeout);
          this.pendingMessages.delete(messageId);
          if (stryMutAct_9fa48("159677") ? false : stryMutAct_9fa48("159676") ? true : (stryCov_9fa48("159676", "159677"), acknowledged)) {
            if (stryMutAct_9fa48("159678")) {
              {}
            } else {
              stryCov_9fa48("159678");
              pending.resolve(stryMutAct_9fa48("159679") ? {} : (stryCov_9fa48("159679"), {
                success: stryMutAct_9fa48("159680") ? false : (stryCov_9fa48("159680"), true),
                messageId,
                acknowledged: stryMutAct_9fa48("159681") ? false : (stryCov_9fa48("159681"), true),
                latency: stryMutAct_9fa48("159682") ? Date.now() + pending.sentAt : (stryCov_9fa48("159682"), Date.now() - pending.sentAt),
                ...rest
              }));
            }
          } else {
            if (stryMutAct_9fa48("159683")) {
              {}
            } else {
              stryCov_9fa48("159683");
              pending.reject(new Error(stryMutAct_9fa48("159686") ? error && TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED : stryMutAct_9fa48("159685") ? false : stryMutAct_9fa48("159684") ? true : (stryCov_9fa48("159684", "159685", "159686"), error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED)));
            }
          }
        }
      }
    }
  }

  /**
   * Handle connection close.
   * @param {Object} connectionInfo - Connection information
   * @private
   */
  handleConnectionClose(connectionInfo) {
    if (stryMutAct_9fa48("159687")) {
      {}
    } else {
      stryCov_9fa48("159687");
      this.logger.info(WS_PROVIDER_LOG_MSG.DISCONNECTED, stryMutAct_9fa48("159688") ? {} : (stryCov_9fa48("159688"), {
        connectionId: connectionInfo.connectionId,
        nodeId: connectionInfo.nodeId
      }));
      connectionInfo.state = CONNECTION_STATE.DISCONNECTED;
      connectionInfo.ws = null;

      // Stop ping interval
      if (stryMutAct_9fa48("159690") ? false : stryMutAct_9fa48("159689") ? true : (stryCov_9fa48("159689", "159690"), connectionInfo.pingInterval)) {
        if (stryMutAct_9fa48("159691")) {
          {}
        } else {
          stryCov_9fa48("159691");
          clearInterval(connectionInfo.pingInterval);
          connectionInfo.pingInterval = null;
        }
      }
      this.events.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, stryMutAct_9fa48("159692") ? {} : (stryCov_9fa48("159692"), {
        connectionId: connectionInfo.connectionId,
        nodeId: connectionInfo.nodeId
      }));

      // Schedule reconnection if not shutting down
      if (stryMutAct_9fa48("159695") ? false : stryMutAct_9fa48("159694") ? true : stryMutAct_9fa48("159693") ? this.isShuttingDown : (stryCov_9fa48("159693", "159694", "159695"), !this.isShuttingDown)) {
        if (stryMutAct_9fa48("159696")) {
          {}
        } else {
          stryCov_9fa48("159696");
          this.scheduleReconnect(connectionInfo);
        }
      }
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff.
   * @param {Object} connectionInfo - Connection information
   * @private
   */
  scheduleReconnect(connectionInfo) {
    if (stryMutAct_9fa48("159697")) {
      {}
    } else {
      stryCov_9fa48("159697");
      if (stryMutAct_9fa48("159701") ? connectionInfo.reconnectAttempts < this.reconnectMaxAttempts : stryMutAct_9fa48("159700") ? connectionInfo.reconnectAttempts > this.reconnectMaxAttempts : stryMutAct_9fa48("159699") ? false : stryMutAct_9fa48("159698") ? true : (stryCov_9fa48("159698", "159699", "159700", "159701"), connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts)) {
        if (stryMutAct_9fa48("159702")) {
          {}
        } else {
          stryCov_9fa48("159702");
          this.logger.error(WS_PROVIDER_LOG_MSG.MAX_RECONNECTS_REACHED, stryMutAct_9fa48("159703") ? {} : (stryCov_9fa48("159703"), {
            connectionId: connectionInfo.connectionId,
            nodeId: connectionInfo.nodeId,
            attempts: connectionInfo.reconnectAttempts
          }));
          connectionInfo.state = CONNECTION_STATE.CLOSED;
          return;
        }
      }
      connectionInfo.state = CONNECTION_STATE.RECONNECTING;
      stryMutAct_9fa48("159704") ? connectionInfo.reconnectAttempts -= TRANSPORT_NUM.ONE : (stryCov_9fa48("159704"), connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE);
      const delay = stryMutAct_9fa48("159705") ? this.reconnectIntervalMs / Math.pow(this.reconnectBackoffMultiplier, connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE) : (stryCov_9fa48("159705"), this.reconnectIntervalMs * Math.pow(this.reconnectBackoffMultiplier, stryMutAct_9fa48("159706") ? connectionInfo.reconnectAttempts + TRANSPORT_NUM.ONE : (stryCov_9fa48("159706"), connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE)));
      this.logger.debug(WS_PROVIDER_LOG_MSG.RECONNECTING, stryMutAct_9fa48("159707") ? {} : (stryCov_9fa48("159707"), {
        connectionId: connectionInfo.connectionId,
        nodeId: connectionInfo.nodeId,
        attempt: connectionInfo.reconnectAttempts,
        delayMs: delay
      }));
      setTimeout(async () => {
        if (stryMutAct_9fa48("159708")) {
          {}
        } else {
          stryCov_9fa48("159708");
          if (stryMutAct_9fa48("159710") ? false : stryMutAct_9fa48("159709") ? true : (stryCov_9fa48("159709", "159710"), this.isShuttingDown)) {
            if (stryMutAct_9fa48("159711")) {
              {}
            } else {
              stryCov_9fa48("159711");
              return;
            }
          }
          try {
            if (stryMutAct_9fa48("159712")) {
              {}
            } else {
              stryCov_9fa48("159712");
              await this.establishConnection(connectionInfo);
            }
          } catch (error) {
            if (stryMutAct_9fa48("159713")) {
              {}
            } else {
              stryCov_9fa48("159713");
              this.logger.error(WS_PROVIDER_LOG_MSG.RECONNECT_FAILED, stryMutAct_9fa48("159714") ? {} : (stryCov_9fa48("159714"), {
                connectionId: connectionInfo.connectionId,
                nodeId: connectionInfo.nodeId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }, delay);
    }
  }

  /**
   * Start ping interval for connection health monitoring.
   * @param {Object} connectionInfo - Connection information
   * @private
   */
  startPingInterval(connectionInfo) {
    if (stryMutAct_9fa48("159715")) {
      {}
    } else {
      stryCov_9fa48("159715");
      connectionInfo.pingInterval = setInterval(() => {
        if (stryMutAct_9fa48("159716")) {
          {}
        } else {
          stryCov_9fa48("159716");
          if (stryMutAct_9fa48("159719") ? connectionInfo.ws || connectionInfo.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("159718") ? false : stryMutAct_9fa48("159717") ? true : (stryCov_9fa48("159717", "159718", "159719"), connectionInfo.ws && (stryMutAct_9fa48("159721") ? connectionInfo.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("159720") ? true : (stryCov_9fa48("159720", "159721"), connectionInfo.ws.readyState === WebSocket.OPEN)))) {
            if (stryMutAct_9fa48("159722")) {
              {}
            } else {
              stryCov_9fa48("159722");
              connectionInfo.lastPingTime = Date.now();
              this.sendRaw(connectionInfo.ws, stryMutAct_9fa48("159723") ? {} : (stryCov_9fa48("159723"), {
                type: WS_MESSAGE_TYPE.PING,
                timestamp: connectionInfo.lastPingTime
              }));
              this.logger.debug(WS_PROVIDER_LOG_MSG.PING_SENT, stryMutAct_9fa48("159724") ? {} : (stryCov_9fa48("159724"), {
                connectionId: connectionInfo.connectionId
              }));
            }
          }
        }
      }, this.pingIntervalMs);
      connectionInfo.pingInterval.unref();
    }
  }

  /**
   * Send a message through an established connection.
   * @param {Object} connection - Active connection object from connect()
   * @param {Object} message - Message to send
   * @return {Promise<Object>} Delivery result with acknowledgment status
   * @throws {Error} If send fails
   */
  async send(connection, message) {
    if (stryMutAct_9fa48("159725")) {
      {}
    } else {
      stryCov_9fa48("159725");
      const connectionInfo = this.connections.get(connection.connectionId);
      if (stryMutAct_9fa48("159728") ? !connectionInfo && connectionInfo.state !== CONNECTION_STATE.CONNECTED : stryMutAct_9fa48("159727") ? false : stryMutAct_9fa48("159726") ? true : (stryCov_9fa48("159726", "159727", "159728"), (stryMutAct_9fa48("159729") ? connectionInfo : (stryCov_9fa48("159729"), !connectionInfo)) || (stryMutAct_9fa48("159731") ? connectionInfo.state === CONNECTION_STATE.CONNECTED : stryMutAct_9fa48("159730") ? false : (stryCov_9fa48("159730", "159731"), connectionInfo.state !== CONNECTION_STATE.CONNECTED)))) {
        if (stryMutAct_9fa48("159732")) {
          {}
        } else {
          stryCov_9fa48("159732");
          return stryMutAct_9fa48("159733") ? {} : (stryCov_9fa48("159733"), {
            success: stryMutAct_9fa48("159734") ? true : (stryCov_9fa48("159734"), false),
            error: WS_PROVIDER_ERROR_MSG.CONNECTION_CLOSED
          });
        }
      }
      const messageId = stryMutAct_9fa48("159737") ? message.messageId && uuidv4() : stryMutAct_9fa48("159736") ? false : stryMutAct_9fa48("159735") ? true : (stryCov_9fa48("159735", "159736", "159737"), message.messageId || uuidv4());
      const sentAt = Date.now();
      this.logger.debug(WS_PROVIDER_LOG_MSG.SENDING_MESSAGE, stryMutAct_9fa48("159738") ? {} : (stryCov_9fa48("159738"), {
        connectionId: connection.connectionId,
        messageId
      }));
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("159739")) {
          {}
        } else {
          stryCov_9fa48("159739");
          const wsMessage = stryMutAct_9fa48("159740") ? {} : (stryCov_9fa48("159740"), {
            type: WS_MESSAGE_TYPE.SERVICE_MESSAGE,
            messageId,
            sourceNodeId: this.localNodeId,
            sourceAddress: this.localAddress,
            ...message,
            timestamp: sentAt
          });

          // Set up timeout
          const timeout = setTimeout(() => {
            if (stryMutAct_9fa48("159741")) {
              {}
            } else {
              stryCov_9fa48("159741");
              this.pendingMessages.delete(messageId);
              resolve(stryMutAct_9fa48("159742") ? {} : (stryCov_9fa48("159742"), {
                success: stryMutAct_9fa48("159743") ? true : (stryCov_9fa48("159743"), false),
                messageId,
                error: WS_PROVIDER_ERROR_MSG.MESSAGE_TIMEOUT
              }));
            }
          }, this.messageTimeoutMs);

          // Track pending message
          this.pendingMessages.set(messageId, stryMutAct_9fa48("159744") ? {} : (stryCov_9fa48("159744"), {
            messageId,
            resolve,
            reject,
            timeout,
            sentAt
          }));

          // Send message
          this.sendRaw(connectionInfo.ws, wsMessage);
          connectionInfo.lastActivity = Date.now();
          this.logger.debug(WS_PROVIDER_LOG_MSG.MESSAGE_SENT, stryMutAct_9fa48("159745") ? {} : (stryCov_9fa48("159745"), {
            connectionId: connection.connectionId,
            messageId
          }));
        }
      });
    }
  }

  /**
   * Send raw message through WebSocket.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message to send
   * @private
   */
  sendRaw(ws, message) {
    if (stryMutAct_9fa48("159746")) {
      {}
    } else {
      stryCov_9fa48("159746");
      if (stryMutAct_9fa48("159749") ? ws || ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("159748") ? false : stryMutAct_9fa48("159747") ? true : (stryCov_9fa48("159747", "159748", "159749"), ws && (stryMutAct_9fa48("159751") ? ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("159750") ? true : (stryCov_9fa48("159750", "159751"), ws.readyState === WebSocket.OPEN)))) {
        if (stryMutAct_9fa48("159752")) {
          {}
        } else {
          stryCov_9fa48("159752");
          ws.send(JSON.stringify(message));
        }
      }
    }
  }

  /**
   * Close a connection.
   * @param {Object} connection - Connection to close
   * @return {Promise<void>}
   */
  async disconnect(connection) {
    if (stryMutAct_9fa48("159753")) {
      {}
    } else {
      stryCov_9fa48("159753");
      const connectionInfo = this.connections.get(connection.connectionId);
      if (stryMutAct_9fa48("159756") ? false : stryMutAct_9fa48("159755") ? true : stryMutAct_9fa48("159754") ? connectionInfo : (stryCov_9fa48("159754", "159755", "159756"), !connectionInfo)) {
        if (stryMutAct_9fa48("159757")) {
          {}
        } else {
          stryCov_9fa48("159757");
          return;
        }
      }
      this.logger.debug(WS_PROVIDER_LOG_MSG.DISCONNECTING, stryMutAct_9fa48("159758") ? {} : (stryCov_9fa48("159758"), {
        connectionId: connection.connectionId,
        nodeId: connectionInfo.nodeId
      }));

      // Stop ping interval
      if (stryMutAct_9fa48("159760") ? false : stryMutAct_9fa48("159759") ? true : (stryCov_9fa48("159759", "159760"), connectionInfo.pingInterval)) {
        if (stryMutAct_9fa48("159761")) {
          {}
        } else {
          stryCov_9fa48("159761");
          clearInterval(connectionInfo.pingInterval);
          connectionInfo.pingInterval = null;
        }
      }

      // Close WebSocket - use terminate() for immediate cleanup
      if (stryMutAct_9fa48("159763") ? false : stryMutAct_9fa48("159762") ? true : (stryCov_9fa48("159762", "159763"), connectionInfo.ws)) {
        if (stryMutAct_9fa48("159764")) {
          {}
        } else {
          stryCov_9fa48("159764");
          connectionInfo.ws.terminate();
          connectionInfo.ws = null;
        }
      }
      connectionInfo.state = CONNECTION_STATE.CLOSED;
      this.connections.delete(connection.connectionId);
      this.logger.info(WS_PROVIDER_LOG_MSG.DISCONNECTED, stryMutAct_9fa48("159765") ? {} : (stryCov_9fa48("159765"), {
        connectionId: connection.connectionId,
        nodeId: connectionInfo.nodeId
      }));
    }
  }

  /**
   * Get health status of a connection.
   * @param {Object} connection - Connection to check
   * @return {Object} Health status with latency, state, lastActivity
   */
  getHealthStatus(connection) {
    if (stryMutAct_9fa48("159766")) {
      {}
    } else {
      stryCov_9fa48("159766");
      const connectionInfo = this.connections.get(connection.connectionId);
      if (stryMutAct_9fa48("159769") ? false : stryMutAct_9fa48("159768") ? true : stryMutAct_9fa48("159767") ? connectionInfo : (stryCov_9fa48("159767", "159768", "159769"), !connectionInfo)) {
        if (stryMutAct_9fa48("159770")) {
          {}
        } else {
          stryCov_9fa48("159770");
          return stryMutAct_9fa48("159771") ? {} : (stryCov_9fa48("159771"), {
            state: CONNECTION_STATE.CLOSED,
            latency: null,
            lastActivity: null,
            healthy: stryMutAct_9fa48("159772") ? true : (stryCov_9fa48("159772"), false)
          });
        }
      }
      const now = Date.now();
      const isConnected = stryMutAct_9fa48("159775") ? connectionInfo.state !== CONNECTION_STATE.CONNECTED : stryMutAct_9fa48("159774") ? false : stryMutAct_9fa48("159773") ? true : (stryCov_9fa48("159773", "159774", "159775"), connectionInfo.state === CONNECTION_STATE.CONNECTED);
      const isWebSocketOpen = stryMutAct_9fa48("159778") ? connectionInfo.ws || connectionInfo.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("159777") ? false : stryMutAct_9fa48("159776") ? true : (stryCov_9fa48("159776", "159777", "159778"), connectionInfo.ws && (stryMutAct_9fa48("159780") ? connectionInfo.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("159779") ? true : (stryCov_9fa48("159779", "159780"), connectionInfo.ws.readyState === WebSocket.OPEN)));
      const isRecentActivity = stryMutAct_9fa48("159783") ? connectionInfo.lastActivity || now - connectionInfo.lastActivity < this.pingIntervalMs * TRANSPORT_NUM.TWO : stryMutAct_9fa48("159782") ? false : stryMutAct_9fa48("159781") ? true : (stryCov_9fa48("159781", "159782", "159783"), connectionInfo.lastActivity && (stryMutAct_9fa48("159786") ? now - connectionInfo.lastActivity >= this.pingIntervalMs * TRANSPORT_NUM.TWO : stryMutAct_9fa48("159785") ? now - connectionInfo.lastActivity <= this.pingIntervalMs * TRANSPORT_NUM.TWO : stryMutAct_9fa48("159784") ? true : (stryCov_9fa48("159784", "159785", "159786"), (stryMutAct_9fa48("159787") ? now + connectionInfo.lastActivity : (stryCov_9fa48("159787"), now - connectionInfo.lastActivity)) < (stryMutAct_9fa48("159788") ? this.pingIntervalMs / TRANSPORT_NUM.TWO : (stryCov_9fa48("159788"), this.pingIntervalMs * TRANSPORT_NUM.TWO)))));
      this.logger.debug(WS_PROVIDER_LOG_MSG.HEALTH_CHECK, stryMutAct_9fa48("159789") ? {} : (stryCov_9fa48("159789"), {
        connectionId: connection.connectionId,
        state: connectionInfo.state,
        latency: connectionInfo.latency,
        healthy: stryMutAct_9fa48("159792") ? isConnected || isWebSocketOpen : stryMutAct_9fa48("159791") ? false : stryMutAct_9fa48("159790") ? true : (stryCov_9fa48("159790", "159791", "159792"), isConnected && isWebSocketOpen)
      }));
      return stryMutAct_9fa48("159793") ? {} : (stryCov_9fa48("159793"), {
        state: connectionInfo.state,
        latency: connectionInfo.latency,
        lastActivity: connectionInfo.lastActivity,
        lastPingTime: connectionInfo.lastPingTime,
        lastPongTime: connectionInfo.lastPongTime,
        healthy: stryMutAct_9fa48("159796") ? isConnected && isWebSocketOpen || isRecentActivity : stryMutAct_9fa48("159795") ? false : stryMutAct_9fa48("159794") ? true : (stryCov_9fa48("159794", "159795", "159796"), (stryMutAct_9fa48("159798") ? isConnected || isWebSocketOpen : stryMutAct_9fa48("159797") ? true : (stryCov_9fa48("159797", "159798"), isConnected && isWebSocketOpen)) && isRecentActivity)
      });
    }
  }

  /**
   * Shutdown the transport provider.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("159799")) {
      {}
    } else {
      stryCov_9fa48("159799");
      this.logger.info(WS_PROVIDER_LOG_MSG.SHUTDOWN_STARTED, stryMutAct_9fa48("159800") ? {} : (stryCov_9fa48("159800"), {
        connectionCount: this.connections.size
      }));
      this.isShuttingDown = stryMutAct_9fa48("159801") ? false : (stryCov_9fa48("159801"), true);
      this.available = stryMutAct_9fa48("159802") ? true : (stryCov_9fa48("159802"), false);

      // Close all connections
      for (const [connectionId, connectionInfo] of this.connections) {
        if (stryMutAct_9fa48("159803")) {
          {}
        } else {
          stryCov_9fa48("159803");
          // Stop ping interval
          if (stryMutAct_9fa48("159805") ? false : stryMutAct_9fa48("159804") ? true : (stryCov_9fa48("159804", "159805"), connectionInfo.pingInterval)) {
            if (stryMutAct_9fa48("159806")) {
              {}
            } else {
              stryCov_9fa48("159806");
              clearInterval(connectionInfo.pingInterval);
              connectionInfo.pingInterval = null;
            }
          }

          // Close WebSocket - use terminate() for immediate cleanup
          if (stryMutAct_9fa48("159808") ? false : stryMutAct_9fa48("159807") ? true : (stryCov_9fa48("159807", "159808"), connectionInfo.ws)) {
            if (stryMutAct_9fa48("159809")) {
              {}
            } else {
              stryCov_9fa48("159809");
              connectionInfo.ws.terminate();
              connectionInfo.ws = null;
            }
          }
          connectionInfo.state = CONNECTION_STATE.CLOSED;
          this.logger.debug(WS_PROVIDER_LOG_MSG.DISCONNECTED, stryMutAct_9fa48("159810") ? {} : (stryCov_9fa48("159810"), {
            connectionId,
            nodeId: connectionInfo.nodeId
          }));
        }
      }

      // Clear pending messages
      for (const [messageId, pending] of this.pendingMessages) {
        if (stryMutAct_9fa48("159811")) {
          {}
        } else {
          stryCov_9fa48("159811");
          clearTimeout(pending.timeout);
          pending.reject(new Error(stryMutAct_9fa48("159812") ? "" : (stryCov_9fa48("159812"), 'Provider shutdown')));
          this.logger.debug(stryMutAct_9fa48("159813") ? "" : (stryCov_9fa48("159813"), 'Pending message cancelled'), stryMutAct_9fa48("159814") ? {} : (stryCov_9fa48("159814"), {
            messageId
          }));
        }
      }
      this.connections.clear();
      this.pendingMessages.clear();
      this.events.emit(TRANSPORT_EVENT.SHUTDOWN, stryMutAct_9fa48("159815") ? {} : (stryCov_9fa48("159815"), {
        transportType: this.getType()
      }));
      this.logger.info(WS_PROVIDER_LOG_MSG.SHUTDOWN_COMPLETE);
    }
  }

  /**
   * Create a standardized transport error.
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} endpoint - Endpoint that was attempted
   * @param {Error} [cause] - Original error if available
   * @return {Error} Standardized transport error
   * @private
   */
  createTransportError(code, message, endpoint, cause = null) {
    if (stryMutAct_9fa48("159816")) {
      {}
    } else {
      stryCov_9fa48("159816");
      const error = new Error(message);
      error.code = code;
      error.transportType = this.getType();
      error.endpoint = endpoint;
      if (stryMutAct_9fa48("159818") ? false : stryMutAct_9fa48("159817") ? true : (stryCov_9fa48("159817", "159818"), cause)) {
        if (stryMutAct_9fa48("159819")) {
          {}
        } else {
          stryCov_9fa48("159819");
          error.cause = cause;
        }
      }
      return error;
    }
  }

  /**
   * Parse endpoint metadata.
   * @param {Object|string} metadata - Metadata to parse
   * @return {Object} Parsed metadata object
   * @private
   */
  parseMetadata(metadata) {
    if (stryMutAct_9fa48("159820")) {
      {}
    } else {
      stryCov_9fa48("159820");
      if (stryMutAct_9fa48("159823") ? false : stryMutAct_9fa48("159822") ? true : stryMutAct_9fa48("159821") ? metadata : (stryCov_9fa48("159821", "159822", "159823"), !metadata)) {
        if (stryMutAct_9fa48("159824")) {
          {}
        } else {
          stryCov_9fa48("159824");
          return {};
        }
      }
      if (stryMutAct_9fa48("159827") ? typeof metadata !== 'string' : stryMutAct_9fa48("159826") ? false : stryMutAct_9fa48("159825") ? true : (stryCov_9fa48("159825", "159826", "159827"), typeof metadata === (stryMutAct_9fa48("159828") ? "" : (stryCov_9fa48("159828"), 'string')))) {
        if (stryMutAct_9fa48("159829")) {
          {}
        } else {
          stryCov_9fa48("159829");
          try {
            if (stryMutAct_9fa48("159830")) {
              {}
            } else {
              stryCov_9fa48("159830");
              return JSON.parse(metadata);
            }
          } catch (_error) {
            if (stryMutAct_9fa48("159831")) {
              {}
            } else {
              stryCov_9fa48("159831");
              return {};
            }
          }
        }
      }
      return metadata;
    }
  }

  /**
   * Get the event emitter for subscribing to transport events.
   * @return {EventEmitter} Event emitter
   */
  getEventEmitter() {
    if (stryMutAct_9fa48("159832")) {
      {}
    } else {
      stryCov_9fa48("159832");
      return this.events;
    }
  }

  /**
   * Get the number of active connections.
   * @return {number} Number of connections
   */
  getConnectionCount() {
    if (stryMutAct_9fa48("159833")) {
      {}
    } else {
      stryCov_9fa48("159833");
      return this.connections.size;
    }
  }

  /**
   * Set the local node ID for identification.
   * @param {string} nodeId - Local node ID
   */
  setLocalNodeId(nodeId) {
    if (stryMutAct_9fa48("159834")) {
      {}
    } else {
      stryCov_9fa48("159834");
      this.localNodeId = nodeId;
    }
  }

  /**
   * Set the local address for identification.
   * @param {string} address - Local address
   */
  setLocalAddress(address) {
    if (stryMutAct_9fa48("159835")) {
      {}
    } else {
      stryCov_9fa48("159835");
      this.localAddress = address;
    }
  }
}
export { WebSocketTransportProvider, WS_PROVIDER_SUBSYSTEM, WS_PROVIDER_LOG_MSG, WS_PROVIDER_ERROR_MSG };