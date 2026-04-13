/**
 * RouterServerManager - WebSocket server management for MessageRouter.
 *
 * Handles WebSocket server lifecycle including:
 * - Server startup (real and in-process)
 * - Incoming connection handling
 * - Server shutdown
 *
 * Requirements: 1.2, 1.4
 *
 * @module transport/router-server-manager
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
import { WebSocketServer } from 'ws';
import { CONNECTION_STATE, ROUTER_ERROR_MSG, ROUTER_LOG_MSG, TRANSPORT_DEFAULT, TRANSPORT_EVENT, TRANSPORT_TYPEOF } from '../constants/transport.js';
import { INPROC } from './inproc-transport.js';
const ConnectionState = CONNECTION_STATE;

/**
 * RouterServerManager handles WebSocket server lifecycle for MessageRouter.
 *
 * This class manages:
 * - WebSocket server startup and configuration
 * - In-process server for testing
 * - Incoming connection handling
 * - Server shutdown and cleanup
 *
 * @interface
 *
 * @description
 * RouterServerManager is responsible for all server-side operations
 * in the MessageRouter. It handles both real WebSocket servers and
 * in-process servers for testing.
 *
 * Key features:
 * - Real WebSocket server with configurable host/port
 * - In-process server for fast testing without network
 * - Clean connection tracking and cleanup
 * - Graceful shutdown with client termination
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.nodeId - Local node ID
 * @param {Object} options.logger - Logger instance
 * @param {string} options.routerId - Router ID for logging
 * @param {number} [options.wsPort] - WebSocket server port
 * @param {string} [options.wsHost] - WebSocket bind host
 * @param {boolean} [options.inProcess=false] - Enable in-process transport
 * @param {Map} options.nodeConnections - Map of node connections
 * @param {Function} options.onMessage - Callback for incoming messages
 * @param {Function} options.onConnectionClose - Callback for connection close
 * @param {Function} options.emit - Function to emit events
 *
 * @example
 * const serverManager = new RouterServerManager({
 *   nodeId: 'node-1',
 *   logger: loggingService.forSubsystem('message-router'),
 *   routerId: 'router-123',
 *   wsPort: 8080,
 *   wsHost: 'localhost',
 *   nodeConnections: new Map(),
 *   onMessage: (connectionId, ws, data) => { ... },
 *   onConnectionClose: (connectionId) => { ... },
 *   emit: (event, data) => { ... },
 * });
 */
class RouterServerManager {
  /**
   * Create a new RouterServerManager instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.logger - Logger instance.
   * @param {string} options.routerId - Router ID for logging.
   * @param {number} [options.wsPort] - WebSocket server port.
   * @param {string} [options.wsHost] - WebSocket bind host.
   * @param {boolean} [options.inProcess=false] - Enable in-process transport.
   * @param {Map} options.nodeConnections - Map of node connections.
   * @param {Function} options.onMessage - Callback for incoming messages.
   * @param {Function} options.onConnectionClose - Callback for connection close.
   * @param {Function} options.emit - Function to emit events.
   */
  constructor(options) {
    if (stryMutAct_9fa48("159207")) {
      {}
    } else {
      stryCov_9fa48("159207");
      if (stryMutAct_9fa48("159210") ? false : stryMutAct_9fa48("159209") ? true : stryMutAct_9fa48("159208") ? options.nodeId : (stryCov_9fa48("159208", "159209", "159210"), !options.nodeId)) {
        if (stryMutAct_9fa48("159211")) {
          {}
        } else {
          stryCov_9fa48("159211");
          throw new Error(stryMutAct_9fa48("159212") ? "" : (stryCov_9fa48("159212"), 'RouterServerManager requires nodeId'));
        }
      }
      if (stryMutAct_9fa48("159215") ? false : stryMutAct_9fa48("159214") ? true : stryMutAct_9fa48("159213") ? options.logger : (stryCov_9fa48("159213", "159214", "159215"), !options.logger)) {
        if (stryMutAct_9fa48("159216")) {
          {}
        } else {
          stryCov_9fa48("159216");
          throw new Error(stryMutAct_9fa48("159217") ? "" : (stryCov_9fa48("159217"), 'RouterServerManager requires logger'));
        }
      }
      if (stryMutAct_9fa48("159220") ? false : stryMutAct_9fa48("159219") ? true : stryMutAct_9fa48("159218") ? options.routerId : (stryCov_9fa48("159218", "159219", "159220"), !options.routerId)) {
        if (stryMutAct_9fa48("159221")) {
          {}
        } else {
          stryCov_9fa48("159221");
          throw new Error(stryMutAct_9fa48("159222") ? "" : (stryCov_9fa48("159222"), 'RouterServerManager requires routerId'));
        }
      }
      if (stryMutAct_9fa48("159225") ? false : stryMutAct_9fa48("159224") ? true : stryMutAct_9fa48("159223") ? options.nodeConnections : (stryCov_9fa48("159223", "159224", "159225"), !options.nodeConnections)) {
        if (stryMutAct_9fa48("159226")) {
          {}
        } else {
          stryCov_9fa48("159226");
          throw new Error(stryMutAct_9fa48("159227") ? "" : (stryCov_9fa48("159227"), 'RouterServerManager requires nodeConnections'));
        }
      }
      if (stryMutAct_9fa48("159230") ? false : stryMutAct_9fa48("159229") ? true : stryMutAct_9fa48("159228") ? options.onMessage : (stryCov_9fa48("159228", "159229", "159230"), !options.onMessage)) {
        if (stryMutAct_9fa48("159231")) {
          {}
        } else {
          stryCov_9fa48("159231");
          throw new Error(stryMutAct_9fa48("159232") ? "" : (stryCov_9fa48("159232"), 'RouterServerManager requires onMessage callback'));
        }
      }
      if (stryMutAct_9fa48("159235") ? false : stryMutAct_9fa48("159234") ? true : stryMutAct_9fa48("159233") ? options.onConnectionClose : (stryCov_9fa48("159233", "159234", "159235"), !options.onConnectionClose)) {
        if (stryMutAct_9fa48("159236")) {
          {}
        } else {
          stryCov_9fa48("159236");
          throw new Error(stryMutAct_9fa48("159237") ? "" : (stryCov_9fa48("159237"), 'RouterServerManager requires onConnectionClose callback'));
        }
      }
      if (stryMutAct_9fa48("159240") ? false : stryMutAct_9fa48("159239") ? true : stryMutAct_9fa48("159238") ? options.emit : (stryCov_9fa48("159238", "159239", "159240"), !options.emit)) {
        if (stryMutAct_9fa48("159241")) {
          {}
        } else {
          stryCov_9fa48("159241");
          throw new Error(stryMutAct_9fa48("159242") ? "" : (stryCov_9fa48("159242"), 'RouterServerManager requires emit function'));
        }
      }
      this.nodeId = options.nodeId;
      this.logger = options.logger;
      this.routerId = options.routerId;
      this.wsPort = stryMutAct_9fa48("159245") ? options.wsPort && null : stryMutAct_9fa48("159244") ? false : stryMutAct_9fa48("159243") ? true : (stryCov_9fa48("159243", "159244", "159245"), options.wsPort || null);
      this.wsHost = stryMutAct_9fa48("159248") ? options.wsHost && TRANSPORT_DEFAULT.WS_HOST : stryMutAct_9fa48("159247") ? false : stryMutAct_9fa48("159246") ? true : (stryCov_9fa48("159246", "159247", "159248"), options.wsHost || TRANSPORT_DEFAULT.WS_HOST);
      this.inProcess = stryMutAct_9fa48("159251") ? options.inProcess !== true : stryMutAct_9fa48("159250") ? false : stryMutAct_9fa48("159249") ? true : (stryCov_9fa48("159249", "159250", "159251"), options.inProcess === (stryMutAct_9fa48("159252") ? false : (stryCov_9fa48("159252"), true)));
      this.nodeConnections = options.nodeConnections;
      this.onMessage = options.onMessage;
      this.onConnectionClose = options.onConnectionClose;
      this.emit = options.emit;

      // State
      this.server = null;
      this.inProcessTransport = stryMutAct_9fa48("159253") ? true : (stryCov_9fa48("159253"), false);
    }
  }

  /**
   * Start WebSocket server to accept incoming connections.
   * @return {Promise<void>}
   */
  async startServer() {
    if (stryMutAct_9fa48("159254")) {
      {}
    } else {
      stryCov_9fa48("159254");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("159255")) {
          {}
        } else {
          stryCov_9fa48("159255");
          try {
            if (stryMutAct_9fa48("159256")) {
              {}
            } else {
              stryCov_9fa48("159256");
              if (stryMutAct_9fa48("159258") ? false : stryMutAct_9fa48("159257") ? true : (stryCov_9fa48("159257", "159258"), this.inProcess)) {
                if (stryMutAct_9fa48("159259")) {
                  {}
                } else {
                  stryCov_9fa48("159259");
                  this.startInProcessServer();
                  resolve();
                  return;
                }
              }
              const serverOptions = stryMutAct_9fa48("159260") ? {} : (stryCov_9fa48("159260"), {
                port: this.wsPort
              });
              if (stryMutAct_9fa48("159262") ? false : stryMutAct_9fa48("159261") ? true : (stryCov_9fa48("159261", "159262"), this.wsHost)) {
                if (stryMutAct_9fa48("159263")) {
                  {}
                } else {
                  stryCov_9fa48("159263");
                  serverOptions.host = this.wsHost;
                }
              }
              const wsServer = new WebSocketServer(serverOptions);
              this.server = wsServer;
              wsServer.on(TRANSPORT_EVENT.CONNECTION, (ws, req) => {
                if (stryMutAct_9fa48("159264")) {
                  {}
                } else {
                  stryCov_9fa48("159264");
                  this.handleIncomingConnection(ws, req);
                }
              });
              wsServer.on(TRANSPORT_EVENT.LISTENING, () => {
                if (stryMutAct_9fa48("159265")) {
                  {}
                } else {
                  stryCov_9fa48("159265");
                  this.logger.info(ROUTER_LOG_MSG.WS_SERVER_LISTENING, stryMutAct_9fa48("159266") ? {} : (stryCov_9fa48("159266"), {
                    port: this.wsPort,
                    routerId: this.routerId
                  }));
                  resolve();
                }
              });
              wsServer.on(TRANSPORT_EVENT.ERROR, error => {
                if (stryMutAct_9fa48("159267")) {
                  {}
                } else {
                  stryCov_9fa48("159267");
                  this.logger.error(ROUTER_LOG_MSG.WS_SERVER_ERROR, stryMutAct_9fa48("159268") ? {} : (stryCov_9fa48("159268"), {
                    error: error.message,
                    routerId: this.routerId
                  }));
                  reject(error);
                }
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("159269")) {
              {}
            } else {
              stryCov_9fa48("159269");
              reject(error);
            }
          }
        }
      });
    }
  }

  /**
   * Start an in-process "server" registered by port for test-only transport.
   * @private
   */
  startInProcessServer() {
    if (stryMutAct_9fa48("159270")) {
      {}
    } else {
      stryCov_9fa48("159270");
      const portKey = Number(this.wsPort);
      if (stryMutAct_9fa48("159273") ? false : stryMutAct_9fa48("159272") ? true : stryMutAct_9fa48("159271") ? Number.isFinite(portKey) : (stryCov_9fa48("159271", "159272", "159273"), !Number.isFinite(portKey))) {
        if (stryMutAct_9fa48("159274")) {
          {}
        } else {
          stryCov_9fa48("159274");
          throw new Error(stryMutAct_9fa48("159275") ? "" : (stryCov_9fa48("159275"), 'Invalid wsPort for in-process server'));
        }
      }
      if (stryMutAct_9fa48("159277") ? false : stryMutAct_9fa48("159276") ? true : (stryCov_9fa48("159276", "159277"), INPROC.serversByPort.has(portKey))) {
        if (stryMutAct_9fa48("159278")) {
          {}
        } else {
          stryCov_9fa48("159278");
          const err = new Error(ROUTER_ERROR_MSG.addressInUse(portKey));
          err.code = stryMutAct_9fa48("159279") ? "" : (stryCov_9fa48("159279"), 'EADDRINUSE');
          throw err;
        }
      }
      this.inProcessTransport = stryMutAct_9fa48("159280") ? false : (stryCov_9fa48("159280"), true);
      INPROC.serversByPort.set(portKey, stryMutAct_9fa48("159281") ? {} : (stryCov_9fa48("159281"), {
        router: this,
        nodeId: this.nodeId
      }));

      // Minimal server-like object for diagnostics; shutdown handles in-process
      // servers separately.
      this.server = stryMutAct_9fa48("159282") ? {} : (stryCov_9fa48("159282"), {
        clients: new Set(),
        close: cb => {
          if (stryMutAct_9fa48("159283")) {
            {}
          } else {
            stryCov_9fa48("159283");
            INPROC.serversByPort.delete(portKey);
            stryMutAct_9fa48("159284") ? cb() : (stryCov_9fa48("159284"), cb?.());
          }
        }
      });
      this.logger.info(ROUTER_LOG_MSG.WS_SERVER_LISTENING, stryMutAct_9fa48("159285") ? {} : (stryCov_9fa48("159285"), {
        port: this.wsPort,
        routerId: this.routerId
      }));
    }
  }

  /**
   * Handle incoming WebSocket connection from another node.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} _req - HTTP request.
   */
  handleIncomingConnection(ws, _req) {
    if (stryMutAct_9fa48("159286")) {
      {}
    } else {
      stryCov_9fa48("159286");
      const connectionId = uuidv4();
      this.logger.debug(ROUTER_LOG_MSG.INCOMING_CONNECTION, stryMutAct_9fa48("159287") ? {} : (stryCov_9fa48("159287"), {
        connectionId,
        routerId: this.routerId
      }));

      // Set up message handler
      ws.on(TRANSPORT_EVENT.MESSAGE, data => {
        if (stryMutAct_9fa48("159288")) {
          {}
        } else {
          stryCov_9fa48("159288");
          this.onMessage(connectionId, ws, data);
        }
      });
      ws.on(TRANSPORT_EVENT.CLOSE, () => {
        if (stryMutAct_9fa48("159289")) {
          {}
        } else {
          stryCov_9fa48("159289");
          this.onConnectionClose(connectionId);
        }
      });
      ws.on(TRANSPORT_EVENT.ERROR, error => {
        if (stryMutAct_9fa48("159290")) {
          {}
        } else {
          stryCov_9fa48("159290");
          this.logger.error(ROUTER_LOG_MSG.WS_CONNECTION_ERROR, stryMutAct_9fa48("159291") ? {} : (stryCov_9fa48("159291"), {
            connectionId,
            error: error.message
          }));
        }
      });

      // Store connection temporarily until we know the peer node ID
      this.nodeConnections.set(connectionId, stryMutAct_9fa48("159292") ? {} : (stryCov_9fa48("159292"), {
        connectionId,
        ws,
        state: ConnectionState.CONNECTED,
        nodeId: null,
        isIncoming: stryMutAct_9fa48("159293") ? false : (stryCov_9fa48("159293"), true),
        createdAt: Date.now()
      }));
      this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, stryMutAct_9fa48("159294") ? {} : (stryCov_9fa48("159294"), {
        connectionId,
        incoming: stryMutAct_9fa48("159295") ? false : (stryCov_9fa48("159295"), true)
      }));
    }
  }

  /**
   * Check if server is running.
   * @return {boolean} True if server is running.
   */
  isRunning() {
    if (stryMutAct_9fa48("159296")) {
      {}
    } else {
      stryCov_9fa48("159296");
      return stryMutAct_9fa48("159299") ? this.server === null : stryMutAct_9fa48("159298") ? false : stryMutAct_9fa48("159297") ? true : (stryCov_9fa48("159297", "159298", "159299"), this.server !== null);
    }
  }

  /**
   * Check if using in-process transport.
   * @return {boolean} True if using in-process transport.
   */
  isInProcessTransport() {
    if (stryMutAct_9fa48("159300")) {
      {}
    } else {
      stryCov_9fa48("159300");
      return this.inProcessTransport;
    }
  }

  /**
   * Get the server instance.
   * @return {Object|null} Server instance or null.
   */
  getServer() {
    if (stryMutAct_9fa48("159301")) {
      {}
    } else {
      stryCov_9fa48("159301");
      return this.server;
    }
  }

  /**
   * Get server clients (for in-process transport).
   * @return {Set} Set of client connections.
   */
  getClients() {
    if (stryMutAct_9fa48("159302")) {
      {}
    } else {
      stryCov_9fa48("159302");
      return stryMutAct_9fa48("159305") ? this.server?.clients && new Set() : stryMutAct_9fa48("159304") ? false : stryMutAct_9fa48("159303") ? true : (stryCov_9fa48("159303", "159304", "159305"), (stryMutAct_9fa48("159306") ? this.server.clients : (stryCov_9fa48("159306"), this.server?.clients)) || new Set());
    }
  }

  /**
   * Shutdown the server and close all connections.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("159307")) {
      {}
    } else {
      stryCov_9fa48("159307");
      if (stryMutAct_9fa48("159310") ? false : stryMutAct_9fa48("159309") ? true : stryMutAct_9fa48("159308") ? this.server : (stryCov_9fa48("159308", "159309", "159310"), !this.server)) {
        if (stryMutAct_9fa48("159311")) {
          {}
        } else {
          stryCov_9fa48("159311");
          return;
        }
      }

      // In-process server: just terminate tracked clients and unregister.
      if (stryMutAct_9fa48("159313") ? false : stryMutAct_9fa48("159312") ? true : (stryCov_9fa48("159312", "159313"), this.inProcessTransport)) {
        if (stryMutAct_9fa48("159314")) {
          {}
        } else {
          stryCov_9fa48("159314");
          for (const client of stryMutAct_9fa48("159317") ? this.server.clients && [] : stryMutAct_9fa48("159316") ? false : stryMutAct_9fa48("159315") ? true : (stryCov_9fa48("159315", "159316", "159317"), this.server.clients || (stryMutAct_9fa48("159318") ? ["Stryker was here"] : (stryCov_9fa48("159318"), [])))) {
            if (stryMutAct_9fa48("159319")) {
              {}
            } else {
              stryCov_9fa48("159319");
              client.terminate();
            }
          }
          await new Promise(stryMutAct_9fa48("159320") ? () => undefined : (stryCov_9fa48("159320"), resolve => this.server.close(resolve)));
          this.server = null;
          this.inProcessTransport = stryMutAct_9fa48("159321") ? true : (stryCov_9fa48("159321"), false);
          return;
        }
      }

      // Real WebSocket server
      const wsServer = this.server;
      const httpServer = stryMutAct_9fa48("159324") ? wsServer._server && null : stryMutAct_9fa48("159323") ? false : stryMutAct_9fa48("159322") ? true : (stryCov_9fa48("159322", "159323", "159324"), wsServer._server || null);

      // Terminate all clients connected to the server
      for (const client of wsServer.clients) {
        if (stryMutAct_9fa48("159325")) {
          {}
        } else {
          stryCov_9fa48("159325");
          client.terminate();
        }
      }
      await new Promise(resolve => {
        if (stryMutAct_9fa48("159326")) {
          {}
        } else {
          stryCov_9fa48("159326");
          wsServer.close(stryMutAct_9fa48("159327") ? () => undefined : (stryCov_9fa48("159327"), () => resolve()));
        }
      });
      if (stryMutAct_9fa48("159329") ? false : stryMutAct_9fa48("159328") ? true : (stryCov_9fa48("159328", "159329"), httpServer)) {
        if (stryMutAct_9fa48("159330")) {
          {}
        } else {
          stryCov_9fa48("159330");
          if (stryMutAct_9fa48("159333") ? typeof httpServer.closeAllConnections !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("159332") ? false : stryMutAct_9fa48("159331") ? true : (stryCov_9fa48("159331", "159332", "159333"), typeof httpServer.closeAllConnections === TRANSPORT_TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("159334")) {
              {}
            } else {
              stryCov_9fa48("159334");
              httpServer.closeAllConnections();
            }
          }
          await new Promise(resolve => {
            if (stryMutAct_9fa48("159335")) {
              {}
            } else {
              stryCov_9fa48("159335");
              httpServer.close(stryMutAct_9fa48("159336") ? () => undefined : (stryCov_9fa48("159336"), () => resolve()));
            }
          });
          if (stryMutAct_9fa48("159339") ? typeof httpServer.unref !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("159338") ? false : stryMutAct_9fa48("159337") ? true : (stryCov_9fa48("159337", "159338", "159339"), typeof httpServer.unref === TRANSPORT_TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("159340")) {
              {}
            } else {
              stryCov_9fa48("159340");
              httpServer.unref();
            }
          }
        }
      }
      this.server = null;
    }
  }
}
export { RouterServerManager };