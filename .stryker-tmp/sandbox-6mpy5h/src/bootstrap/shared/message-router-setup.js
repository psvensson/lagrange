/**
 * MessageRouterSetup - Shared message router creation and configuration.
 *
 * This component extracts the common message router setup logic used by both
 * BootstrapService and NodeJoiningService. It handles:
 * - Creating the MessageRouter instance
 * - Configuring the WebSocket server
 * - Setting up self-connection for local routing
 * - Configuring the service node resolver
 *
 * Requirements: 3.1 - Shared Message_Router_Setup component
 *
 * @module bootstrap/shared/message-router-setup
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
import { MessageRouter } from '../../transport/message-router.js';
import { LoggingService } from '../../logging/logging-service.js';
import { NodeService } from '../../node/node-service.js';
import { DependencyError } from '../bootstrap-errors.js';
import { SUBSYSTEM } from '../../constants/index.js';
import { NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE, resolveNodeWebSocketAddress } from '../../transport/node-address-resolution.js';

/**
 * Subsystem identifier for logging.
 */
const MESSAGE_ROUTER_SETUP_SUBSYSTEM = SUBSYSTEM.MESSAGE_ROUTER_SETUP;

/**
 * Log messages for MessageRouterSetup.
 */
const LOG_MSG = Object.freeze(stryMutAct_9fa48("29533") ? {} : (stryCov_9fa48("29533"), {
  CREATING: stryMutAct_9fa48("29534") ? "" : (stryCov_9fa48("29534"), 'Creating MessageRouter'),
  CREATED: stryMutAct_9fa48("29535") ? "" : (stryCov_9fa48("29535"), 'MessageRouter created successfully'),
  INIT_FAILED: stryMutAct_9fa48("29536") ? "" : (stryCov_9fa48("29536"), 'MessageRouter initialization failed'),
  SELF_CONNECTED: stryMutAct_9fa48("29537") ? "" : (stryCov_9fa48("29537"), 'WebSocket server started and self-connection established')
}));

/**
 * Error messages for MessageRouterSetup.
 */
const ERROR_MSG = Object.freeze(stryMutAct_9fa48("29538") ? {} : (stryCov_9fa48("29538"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("29539") ? "" : (stryCov_9fa48("29539"), 'nodeId is required for MessageRouterSetup'),
  initFailed: stryMutAct_9fa48("29540") ? () => undefined : (stryCov_9fa48("29540"), message => stryMutAct_9fa48("29541") ? `` : (stryCov_9fa48("29541"), `MessageRouter initialization failed: ${message}`))
}));
function createNodeWebSocketAddressResolver() {
  if (stryMutAct_9fa48("29542")) {
    {}
  } else {
    stryCov_9fa48("29542");
    return targetNodeId => {
      if (stryMutAct_9fa48("29543")) {
        {}
      } else {
        stryCov_9fa48("29543");
        if (stryMutAct_9fa48("29546") ? false : stryMutAct_9fa48("29545") ? true : stryMutAct_9fa48("29544") ? targetNodeId : (stryCov_9fa48("29544", "29545", "29546"), !targetNodeId)) {
          if (stryMutAct_9fa48("29547")) {
            {}
          } else {
            stryCov_9fa48("29547");
            return null;
          }
        }
        const nodeService = NodeService.getInstance();
        const cache = stryMutAct_9fa48("29550") ? (nodeService.getReadOnlySystemTableCache() || nodeService.getSystemTableCache()) && null : stryMutAct_9fa48("29549") ? false : stryMutAct_9fa48("29548") ? true : (stryCov_9fa48("29548", "29549", "29550"), (stryMutAct_9fa48("29552") ? nodeService.getReadOnlySystemTableCache() && nodeService.getSystemTableCache() : stryMutAct_9fa48("29551") ? false : (stryCov_9fa48("29551", "29552"), nodeService.getReadOnlySystemTableCache() || nodeService.getSystemTableCache())) || null);
        if (stryMutAct_9fa48("29555") ? false : stryMutAct_9fa48("29554") ? true : stryMutAct_9fa48("29553") ? cache : (stryCov_9fa48("29553", "29554", "29555"), !cache)) {
          if (stryMutAct_9fa48("29556")) {
            {}
          } else {
            stryCov_9fa48("29556");
            return null;
          }
        }
        const resolution = resolveNodeWebSocketAddress(stryMutAct_9fa48("29557") ? {} : (stryCov_9fa48("29557"), {
          targetNodeId,
          systemTableCache: cache
        }));
        if (stryMutAct_9fa48("29560") ? resolution.state === NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED : stryMutAct_9fa48("29559") ? false : stryMutAct_9fa48("29558") ? true : (stryCov_9fa48("29558", "29559", "29560"), resolution.state !== NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED)) {
          if (stryMutAct_9fa48("29561")) {
            {}
          } else {
            stryCov_9fa48("29561");
            return null;
          }
        }
        return resolution.address;
      }
    };
  }
}

/**
 * Shared message router setup used by both bootstrap paths.
 * Provides a static factory method to create and configure a MessageRouter.
 */
class MessageRouterSetup {
  /**
   * Create and configure a message router.
   *
   * This method handles the complete setup of a MessageRouter including:
   * - Creating the router instance with provided configuration
   * - Setting up the service node resolver for address-based routing
   * - Starting the WebSocket server (if wsPort is provided)
   * - Establishing self-connection for uniform message routing
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {string} options.nodeAddress - Node address for WebSocket server.
   * @param {number} options.wsPort - WebSocket server port (optional).
   * @param {Object} options.identifyPayload - Optional payload for IDENTIFY messages.
   * @return {Promise<MessageRouter>} Configured message router.
   * @throws {DependencyError} If nodeId is not provided.
   * @throws {Error} If router initialization fails.
   */
  static async create({
    nodeId,
    nodeAddress,
    advertisedNodeWsAddress,
    wsPort,
    identifyPayload,
    externalAdmissionEnabled
  }) {
    if (stryMutAct_9fa48("29562")) {
      {}
    } else {
      stryCov_9fa48("29562");
      // Validate required dependencies
      if (stryMutAct_9fa48("29565") ? false : stryMutAct_9fa48("29564") ? true : stryMutAct_9fa48("29563") ? nodeId : (stryCov_9fa48("29563", "29564", "29565"), !nodeId)) {
        if (stryMutAct_9fa48("29566")) {
          {}
        } else {
          stryCov_9fa48("29566");
          throw new DependencyError(stryMutAct_9fa48("29567") ? "" : (stryCov_9fa48("29567"), 'MessageRouterSetup'), stryMutAct_9fa48("29568") ? "" : (stryCov_9fa48("29568"), 'nodeId'));
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ? loggingService.forSubsystem(MESSAGE_ROUTER_SETUP_SUBSYSTEM) : console;
      logger.info(LOG_MSG.CREATING, stryMutAct_9fa48("29569") ? {} : (stryCov_9fa48("29569"), {
        nodeId,
        nodeAddress,
        wsPort
      }));

      // Create MessageRouter instance
      const messageRouter = new MessageRouter(stryMutAct_9fa48("29570") ? {} : (stryCov_9fa48("29570"), {
        nodeId,
        nodeAddress,
        advertisedAddress: stryMutAct_9fa48("29573") ? advertisedNodeWsAddress && null : stryMutAct_9fa48("29572") ? false : stryMutAct_9fa48("29571") ? true : (stryCov_9fa48("29571", "29572", "29573"), advertisedNodeWsAddress || null),
        wsPort,
        identifyPayload,
        externalAdmissionEnabled
      }));

      // Set up resolver to extract nodeId from address pattern "${nodeId}/..."
      // This enables routing messages to remote nodes based on address patterns
      // like "joining-node-id/lifecycle" -> routes to node "joining-node-id"
      messageRouter.setServiceNodeResolver(address => {
        if (stryMutAct_9fa48("29574")) {
          {}
        } else {
          stryCov_9fa48("29574");
          const match = address.match(stryMutAct_9fa48("29577") ? /^([/]+)\// : stryMutAct_9fa48("29576") ? /^([^/])\// : stryMutAct_9fa48("29575") ? /([^/]+)\// : (stryCov_9fa48("29575", "29576", "29577"), /^([^/]+)\//));
          return match ? match[1] : null;
        }
      });
      messageRouter.setNodeAddressResolver(createNodeWebSocketAddressResolver());

      // Initialize the router
      // If wsPort is specified, start server and establish self-connection
      // This ensures all messages (local and remote) go through WebSocket
      if (stryMutAct_9fa48("29579") ? false : stryMutAct_9fa48("29578") ? true : (stryCov_9fa48("29578", "29579"), wsPort)) {
        if (stryMutAct_9fa48("29580")) {
          {}
        } else {
          stryCov_9fa48("29580");
          try {
            if (stryMutAct_9fa48("29581")) {
              {}
            } else {
              stryCov_9fa48("29581");
              await messageRouter.initialize(stryMutAct_9fa48("29582") ? {} : (stryCov_9fa48("29582"), {
                startServer: stryMutAct_9fa48("29583") ? false : (stryCov_9fa48("29583"), true)
              }));
              logger.info(LOG_MSG.SELF_CONNECTED, stryMutAct_9fa48("29584") ? {} : (stryCov_9fa48("29584"), {
                nodeId,
                wsPort,
                hasSelfConnection: messageRouter.hasSelfConnection()
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("29585")) {
              {}
            } else {
              stryCov_9fa48("29585");
              logger.error(LOG_MSG.INIT_FAILED, stryMutAct_9fa48("29586") ? {} : (stryCov_9fa48("29586"), {
                nodeId,
                wsPort,
                error: error.message,
                stack: error.stack
              }));
              throw new Error(ERROR_MSG.initFailed(error.message));
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("29587")) {
          {}
        } else {
          stryCov_9fa48("29587");
          // No wsPort - initialize without server (for testing or single-node scenarios)
          try {
            if (stryMutAct_9fa48("29588")) {
              {}
            } else {
              stryCov_9fa48("29588");
              await messageRouter.initialize(stryMutAct_9fa48("29589") ? {} : (stryCov_9fa48("29589"), {
                startServer: stryMutAct_9fa48("29590") ? true : (stryCov_9fa48("29590"), false)
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("29591")) {
              {}
            } else {
              stryCov_9fa48("29591");
              logger.error(LOG_MSG.INIT_FAILED, stryMutAct_9fa48("29592") ? {} : (stryCov_9fa48("29592"), {
                nodeId,
                error: error.message,
                stack: error.stack
              }));
              throw new Error(ERROR_MSG.initFailed(error.message));
            }
          }
        }
      }
      logger.info(LOG_MSG.CREATED, stryMutAct_9fa48("29593") ? {} : (stryCov_9fa48("29593"), {
        nodeId,
        nodeAddress,
        wsPort,
        hasSelfConnection: wsPort ? messageRouter.hasSelfConnection() : stryMutAct_9fa48("29594") ? true : (stryCov_9fa48("29594"), false)
      }));
      return messageRouter;
    }
  }
}
export { MessageRouterSetup };