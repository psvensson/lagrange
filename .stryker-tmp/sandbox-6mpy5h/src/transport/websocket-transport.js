/**
 * WebSocketTransport - Inter-node communication using WebSocket.
 * Supports single WebSocket connection per node pair.
 * Requirements: 9.1, 4.16
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
import WebSocket, { WebSocketServer } from 'ws';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONNECTION_STATE, TRANSPORT_CONFIG_KEY, TRANSPORT_DEFAULT, TRANSPORT_ERROR_MSG, TRANSPORT_EVENT, TRANSPORT_FORMAT, TRANSPORT_NUM, TRANSPORT_SUBSYSTEM, TRANSPORT_TYPEOF, WS_ERROR_MSG, WS_LOG_MSG, WS_MESSAGE_TYPE } from '../constants/transport.js';
const ConnectionState = CONNECTION_STATE;
const WSMessageType = WS_MESSAGE_TYPE;

/**
 * WebSocketTransport provides inter-node communication.
 * Maintains single WebSocket connection per node pair.
 */
class WebSocketTransport extends EventEmitter {
  /**
   * Create a new WebSocketTransport.
   * @param {Object} options - Configuration options.
   * @param {string} options.localNodeId - Local node ID.
   * @param {string} options.localAddress - Local service address.
   * @param {Array<Object>} options.peerNodes - Peer node configurations.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("159836")) {
      {}
    } else {
      stryCov_9fa48("159836");
      super();
      this.localNodeId = stryMutAct_9fa48("159839") ? options.localNodeId && uuidv4() : stryMutAct_9fa48("159838") ? false : stryMutAct_9fa48("159837") ? true : (stryCov_9fa48("159837", "159838", "159839"), options.localNodeId || uuidv4());
      this.localAddress = stryMutAct_9fa48("159842") ? options.localAddress && TRANSPORT_FORMAT.buildLocalAddress(this.localNodeId) : stryMutAct_9fa48("159841") ? false : stryMutAct_9fa48("159840") ? true : (stryCov_9fa48("159840", "159841", "159842"), options.localAddress || TRANSPORT_FORMAT.buildLocalAddress(this.localNodeId));
      this.transportId = uuidv4();

      // Peer connections (nodeId -> connection info)
      this.connections = new Map();

      // Pending messages awaiting acknowledgment
      this.pendingMessages = new Map();

      // Message handlers by address
      this.messageHandlers = new Map();

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.reconnectIntervalMs = stryMutAct_9fa48("159845") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) && TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS : stryMutAct_9fa48("159844") ? false : stryMutAct_9fa48("159843") ? true : (stryCov_9fa48("159843", "159844", "159845"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) || TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS);
      this.reconnectMaxAttempts = stryMutAct_9fa48("159848") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) && TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS : stryMutAct_9fa48("159847") ? false : stryMutAct_9fa48("159846") ? true : (stryCov_9fa48("159846", "159847", "159848"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) || TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS);
      this.reconnectBackoffMultiplier = stryMutAct_9fa48("159851") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) && TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER : stryMutAct_9fa48("159850") ? false : stryMutAct_9fa48("159849") ? true : (stryCov_9fa48("159849", "159850", "159851"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) || TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER);
      this.pingIntervalMs = stryMutAct_9fa48("159854") ? config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) && TRANSPORT_DEFAULT.PING_INTERVAL_MS : stryMutAct_9fa48("159853") ? false : stryMutAct_9fa48("159852") ? true : (stryCov_9fa48("159852", "159853", "159854"), config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) || TRANSPORT_DEFAULT.PING_INTERVAL_MS);
      this.messageTimeoutMs = stryMutAct_9fa48("159857") ? config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) && TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS : stryMutAct_9fa48("159856") ? false : stryMutAct_9fa48("159855") ? true : (stryCov_9fa48("159855", "159856", "159857"), config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) || TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS);
      this.wsHost = stryMutAct_9fa48("159860") ? config.get(TRANSPORT_CONFIG_KEY.WS_HOST) && TRANSPORT_DEFAULT.WS_HOST : stryMutAct_9fa48("159859") ? false : stryMutAct_9fa48("159858") ? true : (stryCov_9fa48("159858", "159859", "159860"), config.get(TRANSPORT_CONFIG_KEY.WS_HOST) || TRANSPORT_DEFAULT.WS_HOST);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.WEBSOCKET) : console;

      // State
      this.initialized = stryMutAct_9fa48("159861") ? true : (stryCov_9fa48("159861"), false);
      this.messageCount = TRANSPORT_NUM.ZERO;

      // WebSocket server (if acting as server)
      this.server = null;
    }
  }

  /**
   * Initialize the transport.
   * @param {Object} options - Initialization options.
   * @param {number} options.port - Port to listen on (if server).
   * @param {Array<Object>} options.peerNodes - Peer nodes to connect to.
   * @return {Promise<void>}
   */
  async initialize(options = {}) {
    if (stryMutAct_9fa48("159862")) {
      {}
    } else {
      stryCov_9fa48("159862");
      if (stryMutAct_9fa48("159864") ? false : stryMutAct_9fa48("159863") ? true : (stryCov_9fa48("159863", "159864"), this.initialized)) {
        if (stryMutAct_9fa48("159865")) {
          {}
        } else {
          stryCov_9fa48("159865");
          return;
        }
      }
      this.logger.debug(WS_LOG_MSG.INITIALIZING, stryMutAct_9fa48("159866") ? {} : (stryCov_9fa48("159866"), {
        transportId: this.transportId,
        localNodeId: this.localNodeId
      }));

      // Connect to peer nodes if provided
      if (stryMutAct_9fa48("159869") ? options.peerNodes || options.peerNodes.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("159868") ? false : stryMutAct_9fa48("159867") ? true : (stryCov_9fa48("159867", "159868", "159869"), options.peerNodes && (stryMutAct_9fa48("159872") ? options.peerNodes.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("159871") ? options.peerNodes.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("159870") ? true : (stryCov_9fa48("159870", "159871", "159872"), options.peerNodes.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("159873")) {
          {}
        } else {
          stryCov_9fa48("159873");
          for (const peer of options.peerNodes) {
            if (stryMutAct_9fa48("159874")) {
              {}
            } else {
              stryCov_9fa48("159874");
              await this.connectToPeer(peer);
            }
          }
        }
      }
      this.initialized = stryMutAct_9fa48("159875") ? false : (stryCov_9fa48("159875"), true);
      this.emit(TRANSPORT_EVENT.INITIALIZED, stryMutAct_9fa48("159876") ? {} : (stryCov_9fa48("159876"), {
        transportId: this.transportId,
        localNodeId: this.localNodeId
      }));
    }
  }

  /**
   * Start WebSocket server.
   * @param {number} port - Port to listen on.
   * @param {string} [host] - Host/interface to bind to.
   * @return {Promise<void>}
   */
  async startServer(port, host = null) {
    if (stryMutAct_9fa48("159877")) {
      {}
    } else {
      stryCov_9fa48("159877");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("159878")) {
          {}
        } else {
          stryCov_9fa48("159878");
          try {
            if (stryMutAct_9fa48("159879")) {
              {}
            } else {
              stryCov_9fa48("159879");
              // Prefer binding to a specific host (usually 127.0.0.1) to avoid sandbox
              // restrictions that may disallow binding to 0.0.0.0.
              const bindHost = stryMutAct_9fa48("159882") ? (host || this.wsHost) && TRANSPORT_DEFAULT.WS_HOST : stryMutAct_9fa48("159881") ? false : stryMutAct_9fa48("159880") ? true : (stryCov_9fa48("159880", "159881", "159882"), (stryMutAct_9fa48("159884") ? host && this.wsHost : stryMutAct_9fa48("159883") ? false : (stryCov_9fa48("159883", "159884"), host || this.wsHost)) || TRANSPORT_DEFAULT.WS_HOST);
              this.server = new WebSocketServer(stryMutAct_9fa48("159885") ? {} : (stryCov_9fa48("159885"), {
                port,
                host: bindHost
              }));
              this.server.on(TRANSPORT_EVENT.CONNECTION, (ws, req) => {
                if (stryMutAct_9fa48("159886")) {
                  {}
                } else {
                  stryCov_9fa48("159886");
                  this.handleIncomingConnection(ws, req);
                }
              });
              this.server.on(TRANSPORT_EVENT.LISTENING, () => {
                if (stryMutAct_9fa48("159887")) {
                  {}
                } else {
                  stryCov_9fa48("159887");
                  this.logger.info(WS_LOG_MSG.SERVER_LISTENING, stryMutAct_9fa48("159888") ? {} : (stryCov_9fa48("159888"), {
                    port,
                    host: stryMutAct_9fa48("159891") ? this.server?.options?.host && bindHost : stryMutAct_9fa48("159890") ? false : stryMutAct_9fa48("159889") ? true : (stryCov_9fa48("159889", "159890", "159891"), (stryMutAct_9fa48("159893") ? this.server.options?.host : stryMutAct_9fa48("159892") ? this.server?.options.host : (stryCov_9fa48("159892", "159893"), this.server?.options?.host)) || bindHost),
                    transportId: this.transportId
                  }));
                  resolve();
                }
              });
              this.server.on(TRANSPORT_EVENT.ERROR, error => {
                if (stryMutAct_9fa48("159894")) {
                  {}
                } else {
                  stryCov_9fa48("159894");
                  this.logger.error(WS_LOG_MSG.SERVER_ERROR, stryMutAct_9fa48("159895") ? {} : (stryCov_9fa48("159895"), {
                    error: error.message,
                    transportId: this.transportId
                  }));
                  reject(error);
                }
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("159896")) {
              {}
            } else {
              stryCov_9fa48("159896");
              reject(error);
            }
          }
        }
      });
    }
  }

  /**
   * Handle incoming WebSocket connection.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} _req - HTTP request.
   * @private
   */
  handleIncomingConnection(ws, _req) {
    if (stryMutAct_9fa48("159897")) {
      {}
    } else {
      stryCov_9fa48("159897");
      const connectionId = uuidv4();
      this.logger.debug(WS_LOG_MSG.INCOMING_CONNECTION, stryMutAct_9fa48("159898") ? {} : (stryCov_9fa48("159898"), {
        connectionId,
        transportId: this.transportId
      }));

      // Set up message handler
      ws.on(TRANSPORT_EVENT.MESSAGE, data => {
        if (stryMutAct_9fa48("159899")) {
          {}
        } else {
          stryCov_9fa48("159899");
          this.handleMessage(connectionId, ws, data);
        }
      });
      ws.on(TRANSPORT_EVENT.CLOSE, () => {
        if (stryMutAct_9fa48("159900")) {
          {}
        } else {
          stryCov_9fa48("159900");
          this.handleConnectionClose(connectionId);
        }
      });
      ws.on(TRANSPORT_EVENT.ERROR, error => {
        if (stryMutAct_9fa48("159901")) {
          {}
        } else {
          stryCov_9fa48("159901");
          this.logger.error(WS_LOG_MSG.CONNECTION_ERROR, stryMutAct_9fa48("159902") ? {} : (stryCov_9fa48("159902"), {
            connectionId,
            error: error.message
          }));
        }
      });

      // Store connection temporarily until we know the peer node ID
      this.connections.set(connectionId, stryMutAct_9fa48("159903") ? {} : (stryCov_9fa48("159903"), {
        connectionId,
        ws,
        state: ConnectionState.CONNECTED,
        nodeId: null,
        isIncoming: stryMutAct_9fa48("159904") ? false : (stryCov_9fa48("159904"), true),
        createdAt: Date.now()
      }));
      this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, stryMutAct_9fa48("159905") ? {} : (stryCov_9fa48("159905"), {
        connectionId,
        incoming: stryMutAct_9fa48("159906") ? false : (stryCov_9fa48("159906"), true)
      }));
    }
  }

  /**
   * Connect to a peer node.
   * @param {Object} peer - Peer configuration.
   * @param {string} peer.nodeId - Peer node ID.
   * @param {string} peer.address - Peer WebSocket address.
   * @return {Promise<void>}
   */
  async connectToPeer(peer) {
    if (stryMutAct_9fa48("159907")) {
      {}
    } else {
      stryCov_9fa48("159907");
      const {
        nodeId,
        address
      } = peer;

      // Check if already connected
      if (stryMutAct_9fa48("159909") ? false : stryMutAct_9fa48("159908") ? true : (stryCov_9fa48("159908", "159909"), this.connections.has(nodeId))) {
        if (stryMutAct_9fa48("159910")) {
          {}
        } else {
          stryCov_9fa48("159910");
          const existing = this.connections.get(nodeId);
          if (stryMutAct_9fa48("159913") ? existing.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("159912") ? false : stryMutAct_9fa48("159911") ? true : (stryCov_9fa48("159911", "159912", "159913"), existing.state === ConnectionState.CONNECTED)) {
            if (stryMutAct_9fa48("159914")) {
              {}
            } else {
              stryCov_9fa48("159914");
              this.logger.debug(WS_LOG_MSG.ALREADY_CONNECTED, stryMutAct_9fa48("159915") ? {} : (stryCov_9fa48("159915"), {
                nodeId
              }));
              return;
            }
          }
        }
      }
      this.logger.debug(WS_LOG_MSG.CONNECTING, stryMutAct_9fa48("159916") ? {} : (stryCov_9fa48("159916"), {
        nodeId,
        address,
        transportId: this.transportId
      }));
      const connectionInfo = stryMutAct_9fa48("159917") ? {} : (stryCov_9fa48("159917"), {
        connectionId: uuidv4(),
        nodeId,
        address,
        ws: null,
        state: ConnectionState.CONNECTING,
        reconnectAttempts: TRANSPORT_NUM.ZERO,
        isIncoming: stryMutAct_9fa48("159918") ? true : (stryCov_9fa48("159918"), false),
        createdAt: Date.now()
      });
      this.connections.set(nodeId, connectionInfo);
      await this.establishConnection(connectionInfo);
    }
  }

  /**
   * Establish WebSocket connection to peer.
   * @param {Object} connectionInfo - Connection information.
   * @return {Promise<void>}
   * @private
   */
  async establishConnection(connectionInfo) {
    if (stryMutAct_9fa48("159919")) {
      {}
    } else {
      stryCov_9fa48("159919");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("159920")) {
          {}
        } else {
          stryCov_9fa48("159920");
          try {
            if (stryMutAct_9fa48("159921")) {
              {}
            } else {
              stryCov_9fa48("159921");
              const ws = new WebSocket(connectionInfo.address);
              ws.on(TRANSPORT_EVENT.OPEN, () => {
                if (stryMutAct_9fa48("159922")) {
                  {}
                } else {
                  stryCov_9fa48("159922");
                  connectionInfo.ws = ws;
                  connectionInfo.state = ConnectionState.CONNECTED;
                  connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
                  this.logger.info(WS_LOG_MSG.CONNECTED, stryMutAct_9fa48("159923") ? {} : (stryCov_9fa48("159923"), {
                    nodeId: connectionInfo.nodeId,
                    address: connectionInfo.address
                  }));

                  // Send identification message
                  this.sendIdentification(connectionInfo);

                  // Start ping interval
                  this.startPingInterval(connectionInfo);
                  this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, stryMutAct_9fa48("159924") ? {} : (stryCov_9fa48("159924"), {
                    nodeId: connectionInfo.nodeId,
                    connectionId: connectionInfo.connectionId
                  }));
                  resolve();
                }
              });
              ws.on(TRANSPORT_EVENT.MESSAGE, data => {
                if (stryMutAct_9fa48("159925")) {
                  {}
                } else {
                  stryCov_9fa48("159925");
                  this.handleMessage(connectionInfo.nodeId, ws, data);
                }
              });
              ws.on(TRANSPORT_EVENT.CLOSE, () => {
                if (stryMutAct_9fa48("159926")) {
                  {}
                } else {
                  stryCov_9fa48("159926");
                  this.handleConnectionClose(connectionInfo.nodeId);
                }
              });
              ws.on(TRANSPORT_EVENT.ERROR, error => {
                if (stryMutAct_9fa48("159927")) {
                  {}
                } else {
                  stryCov_9fa48("159927");
                  this.logger.error(WS_LOG_MSG.WS_ERROR, stryMutAct_9fa48("159928") ? {} : (stryCov_9fa48("159928"), {
                    nodeId: connectionInfo.nodeId,
                    error: error.message
                  }));
                  if (stryMutAct_9fa48("159931") ? connectionInfo.state !== ConnectionState.CONNECTING : stryMutAct_9fa48("159930") ? false : stryMutAct_9fa48("159929") ? true : (stryCov_9fa48("159929", "159930", "159931"), connectionInfo.state === ConnectionState.CONNECTING)) {
                    if (stryMutAct_9fa48("159932")) {
                      {}
                    } else {
                      stryCov_9fa48("159932");
                      reject(error);
                    }
                  }
                }
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("159933")) {
              {}
            } else {
              stryCov_9fa48("159933");
              connectionInfo.state = ConnectionState.DISCONNECTED;
              reject(error);
            }
          }
        }
      });
    }
  }

  /**
   * Send identification message to peer.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  sendIdentification(connectionInfo) {
    if (stryMutAct_9fa48("159934")) {
      {}
    } else {
      stryCov_9fa48("159934");
      const message = stryMutAct_9fa48("159935") ? {} : (stryCov_9fa48("159935"), {
        type: WSMessageType.IDENTIFY,
        nodeId: this.localNodeId,
        address: this.localAddress,
        timestamp: Date.now()
      });
      this.sendRaw(connectionInfo.ws, message);
    }
  }

  /**
   * Handle incoming message.
   * @param {string} connectionId - Connection or node ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(connectionId, ws, data) {
    if (stryMutAct_9fa48("159936")) {
      {}
    } else {
      stryCov_9fa48("159936");
      try {
        if (stryMutAct_9fa48("159937")) {
          {}
        } else {
          stryCov_9fa48("159937");
          const message = JSON.parse(data.toString());
          this.logger.debug(WS_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("159938") ? {} : (stryCov_9fa48("159938"), {
            connectionId,
            type: message.type,
            messageId: message.messageId
          }));

          // Handle identification
          if (stryMutAct_9fa48("159941") ? message.type !== WSMessageType.IDENTIFY : stryMutAct_9fa48("159940") ? false : stryMutAct_9fa48("159939") ? true : (stryCov_9fa48("159939", "159940", "159941"), message.type === WSMessageType.IDENTIFY)) {
            if (stryMutAct_9fa48("159942")) {
              {}
            } else {
              stryCov_9fa48("159942");
              this.handleIdentification(connectionId, ws, message);
              return;
            }
          }

          // Handle ping/pong
          if (stryMutAct_9fa48("159945") ? message.type !== WSMessageType.PING : stryMutAct_9fa48("159944") ? false : stryMutAct_9fa48("159943") ? true : (stryCov_9fa48("159943", "159944", "159945"), message.type === WSMessageType.PING)) {
            if (stryMutAct_9fa48("159946")) {
              {}
            } else {
              stryCov_9fa48("159946");
              this.sendRaw(ws, stryMutAct_9fa48("159947") ? {} : (stryCov_9fa48("159947"), {
                type: WSMessageType.PONG,
                timestamp: Date.now()
              }));
              return;
            }
          }
          if (stryMutAct_9fa48("159950") ? message.type !== WSMessageType.PONG : stryMutAct_9fa48("159949") ? false : stryMutAct_9fa48("159948") ? true : (stryCov_9fa48("159948", "159949", "159950"), message.type === WSMessageType.PONG)) {
            if (stryMutAct_9fa48("159951")) {
              {}
            } else {
              stryCov_9fa48("159951");
              // Update connection health
              return;
            }
          }

          // Handle acknowledgment
          if (stryMutAct_9fa48("159954") ? message.type !== WSMessageType.ACK : stryMutAct_9fa48("159953") ? false : stryMutAct_9fa48("159952") ? true : (stryCov_9fa48("159952", "159953", "159954"), message.type === WSMessageType.ACK)) {
            if (stryMutAct_9fa48("159955")) {
              {}
            } else {
              stryCov_9fa48("159955");
              this.handleAcknowledgment(message);
              return;
            }
          }

          // Handle service message
          if (stryMutAct_9fa48("159958") ? message.type === WSMessageType.SERVICE_MESSAGE && message.type === WSMessageType.RAFT_MESSAGE : stryMutAct_9fa48("159957") ? false : stryMutAct_9fa48("159956") ? true : (stryCov_9fa48("159956", "159957", "159958"), (stryMutAct_9fa48("159960") ? message.type !== WSMessageType.SERVICE_MESSAGE : stryMutAct_9fa48("159959") ? false : (stryCov_9fa48("159959", "159960"), message.type === WSMessageType.SERVICE_MESSAGE)) || (stryMutAct_9fa48("159962") ? message.type !== WSMessageType.RAFT_MESSAGE : stryMutAct_9fa48("159961") ? false : (stryCov_9fa48("159961", "159962"), message.type === WSMessageType.RAFT_MESSAGE)))) {
            if (stryMutAct_9fa48("159963")) {
              {}
            } else {
              stryCov_9fa48("159963");
              this.handleServiceMessage(ws, message);
              return;
            }
          }

          // Unknown message type
          this.logger.warn(WS_LOG_MSG.MESSAGE_UNKNOWN, stryMutAct_9fa48("159964") ? {} : (stryCov_9fa48("159964"), {
            type: message.type,
            connectionId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("159965")) {
          {}
        } else {
          stryCov_9fa48("159965");
          this.logger.error(WS_LOG_MSG.MESSAGE_PARSE_FAILED, stryMutAct_9fa48("159966") ? {} : (stryCov_9fa48("159966"), {
            connectionId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Handle identification message.
   * @param {string} connectionId - Connection ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Identification message.
   * @private
   */
  handleIdentification(connectionId, ws, message) {
    if (stryMutAct_9fa48("159967")) {
      {}
    } else {
      stryCov_9fa48("159967");
      const {
        nodeId
      } = message;
      this.logger.debug(WS_LOG_MSG.IDENTIFICATION_RECEIVED, stryMutAct_9fa48("159968") ? {} : (stryCov_9fa48("159968"), {
        connectionId,
        nodeId
      }));

      // Update connection with node ID
      const connection = this.connections.get(connectionId);
      if (stryMutAct_9fa48("159971") ? connection || connection.isIncoming : stryMutAct_9fa48("159970") ? false : stryMutAct_9fa48("159969") ? true : (stryCov_9fa48("159969", "159970", "159971"), connection && connection.isIncoming)) {
        if (stryMutAct_9fa48("159972")) {
          {}
        } else {
          stryCov_9fa48("159972");
          connection.nodeId = nodeId;

          // Re-key by node ID
          this.connections.delete(connectionId);
          this.connections.set(nodeId, connection);
        }
      }
      this.emit(TRANSPORT_EVENT.PEER_IDENTIFIED, stryMutAct_9fa48("159973") ? {} : (stryCov_9fa48("159973"), {
        nodeId,
        connectionId
      }));
    }
  }

  /**
   * Handle service message.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Service message.
   * @private
   */
  async handleServiceMessage(ws, message) {
    if (stryMutAct_9fa48("159974")) {
      {}
    } else {
      stryCov_9fa48("159974");
      const {
        targetAddress,
        messageId,
        payload
      } = message;

      // Find handler for target address
      const handler = this.messageHandlers.get(targetAddress);
      if (stryMutAct_9fa48("159976") ? false : stryMutAct_9fa48("159975") ? true : (stryCov_9fa48("159975", "159976"), handler)) {
        if (stryMutAct_9fa48("159977")) {
          {}
        } else {
          stryCov_9fa48("159977");
          try {
            if (stryMutAct_9fa48("159978")) {
              {}
            } else {
              stryCov_9fa48("159978");
              // Await the handler result in case it's async
              const result = await handler(stryMutAct_9fa48("159979") ? {} : (stryCov_9fa48("159979"), {
                messageId,
                payload,
                sourceAddress: message.sourceAddress,
                sourceNodeId: message.sourceNodeId
              }));

              // Send acknowledgment with flat structure - spread handler result directly
              const ack = stryMutAct_9fa48("159980") ? {} : (stryCov_9fa48("159980"), {
                type: WSMessageType.ACK,
                messageId,
                acknowledged: stryMutAct_9fa48("159981") ? false : (stryCov_9fa48("159981"), true)
              });
              if (stryMutAct_9fa48("159984") ? result || typeof result === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("159983") ? false : stryMutAct_9fa48("159982") ? true : (stryCov_9fa48("159982", "159983", "159984"), result && (stryMutAct_9fa48("159986") ? typeof result !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("159985") ? true : (stryCov_9fa48("159985", "159986"), typeof result === TRANSPORT_TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("159987")) {
                  {}
                } else {
                  stryCov_9fa48("159987");
                  const {
                    acknowledged: _ack,
                    type: handlerType,
                    ...rest
                  } = result;
                  Object.assign(ack, rest);
                  if (stryMutAct_9fa48("159989") ? false : stryMutAct_9fa48("159988") ? true : (stryCov_9fa48("159988", "159989"), handlerType)) {
                    if (stryMutAct_9fa48("159990")) {
                      {}
                    } else {
                      stryCov_9fa48("159990");
                      ack.responseType = handlerType;
                    }
                  }
                }
              }
              this.sendRaw(ws, ack);
            }
          } catch (error) {
            if (stryMutAct_9fa48("159991")) {
              {}
            } else {
              stryCov_9fa48("159991");
              this.sendRaw(ws, stryMutAct_9fa48("159992") ? {} : (stryCov_9fa48("159992"), {
                type: WSMessageType.ACK,
                messageId,
                acknowledged: stryMutAct_9fa48("159993") ? true : (stryCov_9fa48("159993"), false),
                error: error.message
              }));
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("159994")) {
          {}
        } else {
          stryCov_9fa48("159994");
          // No handler - emit event for external handling
          this.emit(TRANSPORT_EVENT.MESSAGE, stryMutAct_9fa48("159995") ? {} : (stryCov_9fa48("159995"), {
            messageId,
            targetAddress,
            payload,
            sourceAddress: message.sourceAddress,
            sourceNodeId: message.sourceNodeId
          }));

          // Send acknowledgment
          this.sendRaw(ws, stryMutAct_9fa48("159996") ? {} : (stryCov_9fa48("159996"), {
            type: WSMessageType.ACK,
            messageId,
            acknowledged: stryMutAct_9fa48("159997") ? false : (stryCov_9fa48("159997"), true)
          }));
        }
      }
    }
  }

  /**
   * Handle acknowledgment message.
   * @param {Object} message - Acknowledgment message.
   * @private
   */
  handleAcknowledgment(message) {
    if (stryMutAct_9fa48("159998")) {
      {}
    } else {
      stryCov_9fa48("159998");
      const {
        messageId,
        acknowledged,
        error,
        type: _type,
        ...rest
      } = message;
      const pending = this.pendingMessages.get(messageId);
      if (stryMutAct_9fa48("160000") ? false : stryMutAct_9fa48("159999") ? true : (stryCov_9fa48("159999", "160000"), pending)) {
        if (stryMutAct_9fa48("160001")) {
          {}
        } else {
          stryCov_9fa48("160001");
          clearTimeout(pending.timeout);
          this.pendingMessages.delete(messageId);
          if (stryMutAct_9fa48("160003") ? false : stryMutAct_9fa48("160002") ? true : (stryCov_9fa48("160002", "160003"), acknowledged)) {
            if (stryMutAct_9fa48("160004")) {
              {}
            } else {
              stryCov_9fa48("160004");
              // Flat structure - spread all fields from ACK
              pending.resolve(stryMutAct_9fa48("160005") ? {} : (stryCov_9fa48("160005"), {
                messageId,
                acknowledged: stryMutAct_9fa48("160006") ? false : (stryCov_9fa48("160006"), true),
                ...rest
              }));
            }
          } else {
            if (stryMutAct_9fa48("160007")) {
              {}
            } else {
              stryCov_9fa48("160007");
              pending.reject(new Error(stryMutAct_9fa48("160010") ? error && TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED : stryMutAct_9fa48("160009") ? false : stryMutAct_9fa48("160008") ? true : (stryCov_9fa48("160008", "160009", "160010"), error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED)));
            }
          }
        }
      }
    }
  }

  /**
   * Handle connection close.
   * @param {string} nodeId - Node ID.
   * @private
   */
  handleConnectionClose(nodeId) {
    if (stryMutAct_9fa48("160011")) {
      {}
    } else {
      stryCov_9fa48("160011");
      const connection = this.connections.get(nodeId);
      if (stryMutAct_9fa48("160013") ? false : stryMutAct_9fa48("160012") ? true : (stryCov_9fa48("160012", "160013"), connection)) {
        if (stryMutAct_9fa48("160014")) {
          {}
        } else {
          stryCov_9fa48("160014");
          this.logger.info(WS_LOG_MSG.CONNECTION_CLOSED, stryMutAct_9fa48("160015") ? {} : (stryCov_9fa48("160015"), {
            nodeId,
            connectionId: connection.connectionId
          }));
          connection.state = ConnectionState.DISCONNECTED;
          connection.ws = null;

          // Stop ping interval
          if (stryMutAct_9fa48("160017") ? false : stryMutAct_9fa48("160016") ? true : (stryCov_9fa48("160016", "160017"), connection.pingInterval)) {
            if (stryMutAct_9fa48("160018")) {
              {}
            } else {
              stryCov_9fa48("160018");
              clearInterval(connection.pingInterval);
              connection.pingInterval = null;
            }
          }
          this.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, stryMutAct_9fa48("160019") ? {} : (stryCov_9fa48("160019"), {
            nodeId
          }));

          // Attempt reconnection for outgoing connections
          if (stryMutAct_9fa48("160022") ? false : stryMutAct_9fa48("160021") ? true : stryMutAct_9fa48("160020") ? connection.isIncoming : (stryCov_9fa48("160020", "160021", "160022"), !connection.isIncoming)) {
            if (stryMutAct_9fa48("160023")) {
              {}
            } else {
              stryCov_9fa48("160023");
              this.scheduleReconnect(connection);
            }
          }
        }
      }
    }
  }

  /**
   * Schedule reconnection attempt.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  scheduleReconnect(connectionInfo) {
    if (stryMutAct_9fa48("160024")) {
      {}
    } else {
      stryCov_9fa48("160024");
      if (stryMutAct_9fa48("160028") ? connectionInfo.reconnectAttempts < this.reconnectMaxAttempts : stryMutAct_9fa48("160027") ? connectionInfo.reconnectAttempts > this.reconnectMaxAttempts : stryMutAct_9fa48("160026") ? false : stryMutAct_9fa48("160025") ? true : (stryCov_9fa48("160025", "160026", "160027", "160028"), connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts)) {
        if (stryMutAct_9fa48("160029")) {
          {}
        } else {
          stryCov_9fa48("160029");
          this.logger.error(WS_LOG_MSG.MAX_RECONNECTS_REACHED, stryMutAct_9fa48("160030") ? {} : (stryCov_9fa48("160030"), {
            nodeId: connectionInfo.nodeId,
            attempts: connectionInfo.reconnectAttempts
          }));
          connectionInfo.state = ConnectionState.CLOSED;
          return;
        }
      }
      connectionInfo.state = ConnectionState.RECONNECTING;
      stryMutAct_9fa48("160031") ? connectionInfo.reconnectAttempts -= TRANSPORT_NUM.ONE : (stryCov_9fa48("160031"), connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE);
      const delay = stryMutAct_9fa48("160032") ? this.reconnectIntervalMs / Math.pow(this.reconnectBackoffMultiplier, connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE) : (stryCov_9fa48("160032"), this.reconnectIntervalMs * Math.pow(this.reconnectBackoffMultiplier, stryMutAct_9fa48("160033") ? connectionInfo.reconnectAttempts + TRANSPORT_NUM.ONE : (stryCov_9fa48("160033"), connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE)));
      this.logger.debug(WS_LOG_MSG.SCHEDULING_RECONNECT, stryMutAct_9fa48("160034") ? {} : (stryCov_9fa48("160034"), {
        nodeId: connectionInfo.nodeId,
        attempt: connectionInfo.reconnectAttempts,
        delayMs: delay
      }));
      setTimeout(async () => {
        if (stryMutAct_9fa48("160035")) {
          {}
        } else {
          stryCov_9fa48("160035");
          try {
            if (stryMutAct_9fa48("160036")) {
              {}
            } else {
              stryCov_9fa48("160036");
              await this.establishConnection(connectionInfo);
            }
          } catch (error) {
            if (stryMutAct_9fa48("160037")) {
              {}
            } else {
              stryCov_9fa48("160037");
              this.logger.error(WS_LOG_MSG.RECONNECT_FAILED, stryMutAct_9fa48("160038") ? {} : (stryCov_9fa48("160038"), {
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
   * Start ping interval for connection.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  startPingInterval(connectionInfo) {
    if (stryMutAct_9fa48("160039")) {
      {}
    } else {
      stryCov_9fa48("160039");
      connectionInfo.pingInterval = setInterval(() => {
        if (stryMutAct_9fa48("160040")) {
          {}
        } else {
          stryCov_9fa48("160040");
          if (stryMutAct_9fa48("160043") ? connectionInfo.ws || connectionInfo.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("160042") ? false : stryMutAct_9fa48("160041") ? true : (stryCov_9fa48("160041", "160042", "160043"), connectionInfo.ws && (stryMutAct_9fa48("160045") ? connectionInfo.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("160044") ? true : (stryCov_9fa48("160044", "160045"), connectionInfo.ws.readyState === WebSocket.OPEN)))) {
            if (stryMutAct_9fa48("160046")) {
              {}
            } else {
              stryCov_9fa48("160046");
              this.sendRaw(connectionInfo.ws, stryMutAct_9fa48("160047") ? {} : (stryCov_9fa48("160047"), {
                type: WSMessageType.PING,
                timestamp: Date.now()
              }));
            }
          }
        }
      }, this.pingIntervalMs);
      connectionInfo.pingInterval.unref();
    }
  }

  /**
   * Register a message handler for an address.
   * @param {string} address - Service address.
   * @param {Function} handler - Message handler.
   */
  register(address, handler) {
    if (stryMutAct_9fa48("160048")) {
      {}
    } else {
      stryCov_9fa48("160048");
      if (stryMutAct_9fa48("160051") ? typeof handler === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("160050") ? false : stryMutAct_9fa48("160049") ? true : (stryCov_9fa48("160049", "160050", "160051"), typeof handler !== TRANSPORT_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("160052")) {
          {}
        } else {
          stryCov_9fa48("160052");
          throw new Error(TRANSPORT_ERROR_MSG.HANDLER_MUST_BE_FUNCTION);
        }
      }
      this.messageHandlers.set(address, handler);
      this.logger.debug(WS_LOG_MSG.HANDLER_REGISTERED, stryMutAct_9fa48("160053") ? {} : (stryCov_9fa48("160053"), {
        address,
        transportId: this.transportId
      }));
    }
  }

  /**
   * Unregister a message handler.
   * @param {string} address - Service address.
   */
  unregister(address) {
    if (stryMutAct_9fa48("160054")) {
      {}
    } else {
      stryCov_9fa48("160054");
      this.messageHandlers.delete(address);
    }
  }

  /**
   * Deliver a message to a target node/service.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @param {Object} options - Delivery options.
   * @param {string} options.targetNodeId - Target node ID.
   * @return {Promise<Object>} Delivery result.
   */
  async deliver(targetAddress, message, options = {}) {
    if (stryMutAct_9fa48("160055")) {
      {}
    } else {
      stryCov_9fa48("160055");
      const {
        targetNodeId
      } = options;
      const messageId = stryMutAct_9fa48("160058") ? message.messageId && uuidv4() : stryMutAct_9fa48("160057") ? false : stryMutAct_9fa48("160056") ? true : (stryCov_9fa48("160056", "160057", "160058"), message.messageId || uuidv4());
      stryMutAct_9fa48("160059") ? this.messageCount -= TRANSPORT_NUM.ONE : (stryCov_9fa48("160059"), this.messageCount += TRANSPORT_NUM.ONE);

      // Find connection to target node
      let connection = null;
      if (stryMutAct_9fa48("160061") ? false : stryMutAct_9fa48("160060") ? true : (stryCov_9fa48("160060", "160061"), targetNodeId)) {
        if (stryMutAct_9fa48("160062")) {
          {}
        } else {
          stryCov_9fa48("160062");
          connection = this.connections.get(targetNodeId);
        }
      } else {
        if (stryMutAct_9fa48("160063")) {
          {}
        } else {
          stryCov_9fa48("160063");
          // Try to find connection by iterating
          for (const [, conn] of this.connections) {
            if (stryMutAct_9fa48("160064")) {
              {}
            } else {
              stryCov_9fa48("160064");
              if (stryMutAct_9fa48("160067") ? conn.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("160066") ? false : stryMutAct_9fa48("160065") ? true : (stryCov_9fa48("160065", "160066", "160067"), conn.state === ConnectionState.CONNECTED)) {
                if (stryMutAct_9fa48("160068")) {
                  {}
                } else {
                  stryCov_9fa48("160068");
                  connection = conn;
                  break;
                }
              }
            }
          }
        }
      }
      if (stryMutAct_9fa48("160071") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("160070") ? false : stryMutAct_9fa48("160069") ? true : (stryCov_9fa48("160069", "160070", "160071"), (stryMutAct_9fa48("160072") ? connection : (stryCov_9fa48("160072"), !connection)) || (stryMutAct_9fa48("160074") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("160073") ? false : (stryCov_9fa48("160073", "160074"), connection.state !== ConnectionState.CONNECTED)))) {
        if (stryMutAct_9fa48("160075")) {
          {}
        } else {
          stryCov_9fa48("160075");
          return stryMutAct_9fa48("160076") ? {} : (stryCov_9fa48("160076"), {
            messageId,
            acknowledged: stryMutAct_9fa48("160077") ? true : (stryCov_9fa48("160077"), false),
            error: WS_ERROR_MSG.NO_CONNECTION
          });
        }
      }
      return this.sendMessage(connection, targetAddress, messageId, message);
    }
  }

  /**
   * Send message through connection.
   * @param {Object} connection - Connection info.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @return {Promise<Object>} Send result.
   * @private
   */
  sendMessage(connection, targetAddress, messageId, payload) {
    if (stryMutAct_9fa48("160078")) {
      {}
    } else {
      stryCov_9fa48("160078");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("160079")) {
          {}
        } else {
          stryCov_9fa48("160079");
          const message = stryMutAct_9fa48("160080") ? {} : (stryCov_9fa48("160080"), {
            type: WSMessageType.SERVICE_MESSAGE,
            messageId,
            targetAddress,
            sourceAddress: this.localAddress,
            sourceNodeId: this.localNodeId,
            payload,
            timestamp: Date.now()
          });

          // Set up timeout
          const timeout = setTimeout(() => {
            if (stryMutAct_9fa48("160081")) {
              {}
            } else {
              stryCov_9fa48("160081");
              this.pendingMessages.delete(messageId);
              resolve(stryMutAct_9fa48("160082") ? {} : (stryCov_9fa48("160082"), {
                messageId,
                acknowledged: stryMutAct_9fa48("160083") ? true : (stryCov_9fa48("160083"), false),
                error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT
              }));
            }
          }, this.messageTimeoutMs);

          // Track pending message
          this.pendingMessages.set(messageId, stryMutAct_9fa48("160084") ? {} : (stryCov_9fa48("160084"), {
            messageId,
            resolve,
            reject,
            timeout,
            sentAt: Date.now()
          }));

          // Send message
          this.sendRaw(connection.ws, message);
        }
      });
    }
  }

  /**
   * Send raw message through WebSocket.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Message to send.
   * @private
   */
  sendRaw(ws, message) {
    if (stryMutAct_9fa48("160085")) {
      {}
    } else {
      stryCov_9fa48("160085");
      if (stryMutAct_9fa48("160088") ? ws || ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("160087") ? false : stryMutAct_9fa48("160086") ? true : (stryCov_9fa48("160086", "160087", "160088"), ws && (stryMutAct_9fa48("160090") ? ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("160089") ? true : (stryCov_9fa48("160089", "160090"), ws.readyState === WebSocket.OPEN)))) {
        if (stryMutAct_9fa48("160091")) {
          {}
        } else {
          stryCov_9fa48("160091");
          ws.send(JSON.stringify(message));
        }
      }
    }
  }

  /**
   * Get connection state for a node.
   * @param {string} nodeId - Node ID.
   * @return {string|null} Connection state.
   */
  getConnectionState(nodeId) {
    if (stryMutAct_9fa48("160092")) {
      {}
    } else {
      stryCov_9fa48("160092");
      const connection = this.connections.get(nodeId);
      return connection ? connection.state : null;
    }
  }

  /**
   * Get all connected node IDs.
   * @return {Array<string>} Connected node IDs.
   */
  getConnectedNodes() {
    if (stryMutAct_9fa48("160093")) {
      {}
    } else {
      stryCov_9fa48("160093");
      const connected = stryMutAct_9fa48("160094") ? ["Stryker was here"] : (stryCov_9fa48("160094"), []);
      for (const [nodeId, connection] of this.connections) {
        if (stryMutAct_9fa48("160095")) {
          {}
        } else {
          stryCov_9fa48("160095");
          if (stryMutAct_9fa48("160098") ? connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("160097") ? false : stryMutAct_9fa48("160096") ? true : (stryCov_9fa48("160096", "160097", "160098"), connection.state === ConnectionState.CONNECTED)) {
            if (stryMutAct_9fa48("160099")) {
              {}
            } else {
              stryCov_9fa48("160099");
              connected.push(nodeId);
            }
          }
        }
      }
      return connected;
    }
  }

  /**
   * Get transport statistics.
   * @return {Object} Transport stats.
   */
  getStats() {
    if (stryMutAct_9fa48("160100")) {
      {}
    } else {
      stryCov_9fa48("160100");
      const connectionStats = {};
      for (const [nodeId, connection] of this.connections) {
        if (stryMutAct_9fa48("160101")) {
          {}
        } else {
          stryCov_9fa48("160101");
          connectionStats[nodeId] = stryMutAct_9fa48("160102") ? {} : (stryCov_9fa48("160102"), {
            state: connection.state,
            isIncoming: connection.isIncoming,
            reconnectAttempts: connection.reconnectAttempts
          });
        }
      }
      return stryMutAct_9fa48("160103") ? {} : (stryCov_9fa48("160103"), {
        transportId: this.transportId,
        localNodeId: this.localNodeId,
        localAddress: this.localAddress,
        initialized: this.initialized,
        messageCount: this.messageCount,
        pendingMessages: this.pendingMessages.size,
        connections: connectionStats,
        connectedNodes: this.getConnectedNodes().length
      });
    }
  }

  /**
   * Shutdown the transport.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("160104")) {
      {}
    } else {
      stryCov_9fa48("160104");
      this.logger.debug(WS_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("160105") ? {} : (stryCov_9fa48("160105"), {
        transportId: this.transportId
      }));

      // Close all connections - use terminate() for immediate cleanup
      for (const [, connection] of this.connections) {
        if (stryMutAct_9fa48("160106")) {
          {}
        } else {
          stryCov_9fa48("160106");
          if (stryMutAct_9fa48("160108") ? false : stryMutAct_9fa48("160107") ? true : (stryCov_9fa48("160107", "160108"), connection.pingInterval)) {
            if (stryMutAct_9fa48("160109")) {
              {}
            } else {
              stryCov_9fa48("160109");
              clearInterval(connection.pingInterval);
            }
          }
          if (stryMutAct_9fa48("160111") ? false : stryMutAct_9fa48("160110") ? true : (stryCov_9fa48("160110", "160111"), connection.ws)) {
            if (stryMutAct_9fa48("160112")) {
              {}
            } else {
              stryCov_9fa48("160112");
              connection.ws.terminate();
            }
          }
        }
      }

      // Close server and underlying HTTP server
      if (stryMutAct_9fa48("160114") ? false : stryMutAct_9fa48("160113") ? true : (stryCov_9fa48("160113", "160114"), this.server)) {
        if (stryMutAct_9fa48("160115")) {
          {}
        } else {
          stryCov_9fa48("160115");
          // Terminate all connected clients first
          for (const client of stryMutAct_9fa48("160118") ? this.server.clients && [] : stryMutAct_9fa48("160117") ? false : stryMutAct_9fa48("160116") ? true : (stryCov_9fa48("160116", "160117", "160118"), this.server.clients || (stryMutAct_9fa48("160119") ? ["Stryker was here"] : (stryCov_9fa48("160119"), [])))) {
            if (stryMutAct_9fa48("160120")) {
              {}
            } else {
              stryCov_9fa48("160120");
              client.terminate();
            }
          }
          const httpServer = stryMutAct_9fa48("160123") ? this.server._server && null : stryMutAct_9fa48("160122") ? false : stryMutAct_9fa48("160121") ? true : (stryCov_9fa48("160121", "160122", "160123"), this.server._server || null);
          await new Promise(resolve => {
            if (stryMutAct_9fa48("160124")) {
              {}
            } else {
              stryCov_9fa48("160124");
              this.server.close(resolve);
            }
          });

          // Also close the underlying HTTP server if present
          if (stryMutAct_9fa48("160126") ? false : stryMutAct_9fa48("160125") ? true : (stryCov_9fa48("160125", "160126"), httpServer)) {
            if (stryMutAct_9fa48("160127")) {
              {}
            } else {
              stryCov_9fa48("160127");
              if (stryMutAct_9fa48("160130") ? typeof httpServer.closeAllConnections !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("160129") ? false : stryMutAct_9fa48("160128") ? true : (stryCov_9fa48("160128", "160129", "160130"), typeof httpServer.closeAllConnections === TRANSPORT_TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("160131")) {
                  {}
                } else {
                  stryCov_9fa48("160131");
                  httpServer.closeAllConnections();
                }
              }
              await new Promise(resolve => {
                if (stryMutAct_9fa48("160132")) {
                  {}
                } else {
                  stryCov_9fa48("160132");
                  httpServer.close(resolve);
                }
              });
              if (stryMutAct_9fa48("160135") ? typeof httpServer.unref !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("160134") ? false : stryMutAct_9fa48("160133") ? true : (stryCov_9fa48("160133", "160134", "160135"), typeof httpServer.unref === TRANSPORT_TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("160136")) {
                  {}
                } else {
                  stryCov_9fa48("160136");
                  httpServer.unref();
                }
              }
            }
          }
        }
      }

      // Clear pending messages
      for (const [, pending] of this.pendingMessages) {
        if (stryMutAct_9fa48("160137")) {
          {}
        } else {
          stryCov_9fa48("160137");
          clearTimeout(pending.timeout);
          pending.reject(new Error(WS_ERROR_MSG.SHUTDOWN));
        }
      }
      this.connections.clear();
      this.pendingMessages.clear();
      this.messageHandlers.clear();
      this.initialized = stryMutAct_9fa48("160138") ? true : (stryCov_9fa48("160138"), false);
      this.emit(TRANSPORT_EVENT.SHUTDOWN, stryMutAct_9fa48("160139") ? {} : (stryCov_9fa48("160139"), {
        transportId: this.transportId
      }));
    }
  }
}
export { WebSocketTransport, ConnectionState, WSMessageType };