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

import {MessageRouter} from '../../transport/message-router.js';
import {LoggingService} from '../../logging/logging-service.js';
import {NodeService} from '../../node/node-service.js';
import {DependencyError} from '../bootstrap-errors.js';
import {
  ADDRESS,
  COLUMN,
  NUM,
  PROTOCOL,
  SUBSYSTEM,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../../constants/entrypoint.js';
import {ENDPOINT_STATUS, TRANSPORT_TYPE} from '../../constants/transport-types.js';

/**
 * Subsystem identifier for logging.
 */
const MESSAGE_ROUTER_SETUP_SUBSYSTEM = SUBSYSTEM.MESSAGE_ROUTER_SETUP;

/**
 * Log messages for MessageRouterSetup.
 */
const LOG_MSG = Object.freeze({
  CREATING: 'Creating MessageRouter',
  CREATED: 'MessageRouter created successfully',
  INIT_FAILED: 'MessageRouter initialization failed',
  SELF_CONNECTED: 'WebSocket server started and self-connection established',
});

/**
 * Error messages for MessageRouterSetup.
 */
const ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId is required for MessageRouterSetup',
  initFailed: (message) => `MessageRouter initialization failed: ${message}`,
});

function deriveWsAddressFromNodeAddress(nodeAddress) {
  if (!nodeAddress || typeof nodeAddress !== TYPEOF.STRING) {
    return null;
  }
  if (nodeAddress.startsWith(PROTOCOL.WS) ||
      nodeAddress.startsWith(PROTOCOL.WSS)) {
    return nodeAddress;
  }

  const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
  if (colonIndex <= NUM.ZERO) {
    return null;
  }

  const hostname = nodeAddress.substring(NUM.ZERO, colonIndex);
  const restPort = Number(nodeAddress.substring(colonIndex + NUM.ONE));
  if (!hostname || !Number.isFinite(restPort) || restPort <= NUM.ZERO) {
    return null;
  }

  const wsPort = restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
  return `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`;
}

function createNodeWebSocketAddressResolver() {
  return (targetNodeId) => {
    if (!targetNodeId) {
      return null;
    }

    const nodeService = NodeService.getInstance();
    const cache = nodeService.getReadOnlySystemTableCache() ||
      nodeService.getSystemTableCache() ||
      null;
    if (!cache) {
      return null;
    }

    const endpointRows = typeof cache.filter === TYPEOF.FUNCTION ?
      cache.filter(TABLES.NODE_ENDPOINTS, (row) => {
        return row?.[COLUMN.NODE_ID] === targetNodeId &&
          row?.[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE &&
          row?.[COLUMN.TRANSPORT_TYPE] === TRANSPORT_TYPE.WEBSOCKET &&
          typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
          row[COLUMN.ADDRESS].length > NUM.ZERO;
      }) :
      [];
    if (endpointRows.length > NUM.ZERO) {
      const sorted = [...endpointRows].sort((left, right) => {
        return Number(left?.[COLUMN.PRIORITY] || NUM.ZERO) -
          Number(right?.[COLUMN.PRIORITY] || NUM.ZERO);
      });
      const endpointAddress =
        sorted[NUM.ZERO]?.[COLUMN.ADDRESS] || null;
      return deriveWsAddressFromNodeAddress(endpointAddress) ||
        endpointAddress;
    }

    const nodeRow = typeof cache.get === TYPEOF.FUNCTION ?
      cache.get(TABLES.NODES, targetNodeId) :
      null;
    const nodeAddress = nodeRow?.[COLUMN.NODE_ADDRESS] || null;
    return deriveWsAddressFromNodeAddress(nodeAddress);
  };
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
  static async create({nodeId, nodeAddress, wsPort, identifyPayload}) {
    // Validate required dependencies
    if (!nodeId) {
      throw new DependencyError('MessageRouterSetup', 'nodeId');
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(MESSAGE_ROUTER_SETUP_SUBSYSTEM) : console;

    logger.info(LOG_MSG.CREATING, {
      nodeId,
      nodeAddress,
      wsPort,
    });

    // Create MessageRouter instance
    const messageRouter = new MessageRouter({
      nodeId,
      nodeAddress,
      wsPort,
      identifyPayload,
    });

    // Set up resolver to extract nodeId from address pattern "${nodeId}/..."
    // This enables routing messages to remote nodes based on address patterns
    // like "joining-node-id/lifecycle" -> routes to node "joining-node-id"
    messageRouter.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[NUM.ONE] : null;
    });
    messageRouter.setNodeAddressResolver(
      createNodeWebSocketAddressResolver(),
    );

    // Initialize the router
    // If wsPort is specified, start server and establish self-connection
    // This ensures all messages (local and remote) go through WebSocket
    if (wsPort) {
      try {
        await messageRouter.initialize({startServer: true});

        logger.info(LOG_MSG.SELF_CONNECTED, {
          nodeId,
          wsPort,
          hasSelfConnection: messageRouter.hasSelfConnection(),
        });
      } catch (error) {
        logger.error(LOG_MSG.INIT_FAILED, {
          nodeId,
          wsPort,
          error: error.message,
          stack: error.stack,
        });
        throw new Error(ERROR_MSG.initFailed(error.message));
      }
    } else {
      // No wsPort - initialize without server (for testing or single-node scenarios)
      try {
        await messageRouter.initialize({startServer: false});
      } catch (error) {
        logger.error(LOG_MSG.INIT_FAILED, {
          nodeId,
          error: error.message,
          stack: error.stack,
        });
        throw new Error(ERROR_MSG.initFailed(error.message));
      }
    }

    logger.info(LOG_MSG.CREATED, {
      nodeId,
      nodeAddress,
      wsPort,
      hasSelfConnection: wsPort ? messageRouter.hasSelfConnection() : false,
    });

    return messageRouter;
  }
}

export {MessageRouterSetup};
