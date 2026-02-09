/**
 * Join Handler - Handles JOIN_REQUEST messages from joining nodes.
 *
 * This handler is registered with the MessageRouter on the seed node to handle
 * the node joining bootstrap protocol. When a new node wants to join the cluster,
 * it sends a JOIN_REQUEST via WebSocket. The seed node responds with a JOIN_RESPONSE
 * containing the message group replica assignment and Raft peer information.
 *
 * Requirements: 13.2, 13.3
 * - 13.2: THE joining node SHALL send a JOIN_REQUEST message with its nodeId and address
 * - 13.3: THE seed node SHALL respond with a JOIN_RESPONSE containing message group
 *         replica assignment and Raft peer information
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ENTITY_TYPE, NUM, SUBSYSTEM} from '../constants/index.js';
import {ROUTER_MESSAGE_TYPE} from '../constants/transport.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
} from './system-table-schemas-constants.js';

/**
 * Subsystem identifier for join handler logging.
 */
const JOIN_HANDLER_SUBSYSTEM = SUBSYSTEM.BOOTSTRAP;

/**
 * Join handler log messages.
 */
const JOIN_HANDLER_LOG_MSG = Object.freeze({
  REQUEST_RECEIVED: 'JOIN_REQUEST received from joining node',
  REQUEST_INVALID: 'Invalid JOIN_REQUEST - missing required fields',
  ASSIGNMENT_CREATED: 'Message group assignment created for joining node',
  RESPONSE_SENT: 'JOIN_RESPONSE sent to joining node',
  HANDLER_REGISTERED: 'Join handler registered with message router',
  HANDLER_UNREGISTERED: 'Join handler unregistered from message router',
  // JOIN_COMPLETE handling - Requirement 13.7
  COMPLETE_RECEIVED: 'JOIN_COMPLETE received from joining node',
  COMPLETE_INVALID: 'Invalid JOIN_COMPLETE - missing required fields',
  COMPLETE_VERIFIED: 'Joining node message group replica verified ready',
  COMPLETE_ACK_SENT: 'JOIN_COMPLETE_ACK sent to joining node',
});

/**
 * Join handler error messages.
 */
const JOIN_HANDLER_ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId is required in JOIN_REQUEST',
  ADDRESS_REQUIRED: 'address is required in JOIN_REQUEST',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter is required',
  NODE_ID_MISSING: 'nodeId is required for join handler',
  SYSTEM_CACHE_REQUIRED: 'systemTableCache is required for join handler',
  // JOIN_COMPLETE errors - Requirement 13.7
  COMPLETE_NODE_ID_REQUIRED: 'nodeId is required in JOIN_COMPLETE',
  COMPLETE_REPLICA_ID_REQUIRED: 'messageGroupReplicaId is required in JOIN_COMPLETE',
  COMPLETE_NOT_READY: 'Joining node message group replica is not ready',
});

/**
 * JoinHandler handles JOIN_REQUEST messages from joining nodes.
 * It assigns message group replicas to joining nodes and returns
 * the necessary Raft peer information.
 */
class JoinHandler {
  /**
   * Create a new JoinHandler.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - This node's ID (seed node).
   * @param {string} options.nodeAddress - This node's address.
   * @param {Object} options.messageRouter - MessageRouter instance.
   * @param {Object} options.systemTableCache - System table cache for lookups.
   * @param {Map} options.messageGroupServices - Map of message group services.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.nodeAddress = options.nodeAddress;
    this.messageRouter = options.messageRouter;
    this.systemTableCache = options.systemTableCache;
    this.messageGroupServices = options.messageGroupServices || new Map();

    // Counter for generating unique replica IDs
    this.replicaCounter = NUM.ZERO;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(JOIN_HANDLER_SUBSYSTEM) : console;
  }

  /**
   * Handle a JOIN_REQUEST message.
   * Validates the request, assigns a message group replica, and returns JOIN_RESPONSE.
   * Requirements: 13.2, 13.3
   * @param {Object} message - JOIN_REQUEST message.
   * @return {Object} JOIN_RESPONSE message.
   */
  handleJoinRequest(message) {
    const {nodeId, address, capabilities} = message;

    this.logger.info(JOIN_HANDLER_LOG_MSG.REQUEST_RECEIVED, {
      joiningNodeId: nodeId,
      joiningAddress: address,
      hasCapabilities: !!capabilities,
    });

    // Validate required fields
    if (!nodeId) {
      this.logger.warn(JOIN_HANDLER_LOG_MSG.REQUEST_INVALID, {
        reason: JOIN_HANDLER_ERROR_MSG.NODE_ID_REQUIRED,
      });
      return this.createErrorResponse(JOIN_HANDLER_ERROR_MSG.NODE_ID_REQUIRED);
    }

    if (!address) {
      this.logger.warn(JOIN_HANDLER_LOG_MSG.REQUEST_INVALID, {
        reason: JOIN_HANDLER_ERROR_MSG.ADDRESS_REQUIRED,
      });
      return this.createErrorResponse(JOIN_HANDLER_ERROR_MSG.ADDRESS_REQUIRED);
    }

    // Create message group assignment for the joining node
    const assignment = this.createMessageGroupAssignment(nodeId, address);

    this.logger.info(JOIN_HANDLER_LOG_MSG.ASSIGNMENT_CREATED, {
      joiningNodeId: nodeId,
      groupId: assignment.groupId,
      replicaId: assignment.replicaId,
      peerCount: assignment.raftPeers.length,
    });

    // Build and return JOIN_RESPONSE
    const response = {
      type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
      success: true,
      messageGroupAssignment: assignment,
      error: null,
    };

    this.logger.debug(JOIN_HANDLER_LOG_MSG.RESPONSE_SENT, {
      joiningNodeId: nodeId,
      success: true,
    });

    return response;
  }

  /**
   * Handle a JOIN_COMPLETE message.
   * Validates the message, verifies the joining node's message group replica is ready,
   * and returns JOIN_COMPLETE_ACK with next steps.
   * Requirement: 13.7
   * @param {Object} message - JOIN_COMPLETE message.
   * @return {Object} JOIN_COMPLETE_ACK message.
   */
  handleJoinComplete(message) {
    const {nodeId, messageGroupReplicaId, ready} = message;

    this.logger.info(JOIN_HANDLER_LOG_MSG.COMPLETE_RECEIVED, {
      joiningNodeId: nodeId,
      messageGroupReplicaId,
      ready,
    });

    // Validate required fields
    if (!nodeId) {
      this.logger.warn(JOIN_HANDLER_LOG_MSG.COMPLETE_INVALID, {
        reason: JOIN_HANDLER_ERROR_MSG.COMPLETE_NODE_ID_REQUIRED,
      });
      return this.createJoinCompleteErrorResponse(
        JOIN_HANDLER_ERROR_MSG.COMPLETE_NODE_ID_REQUIRED,
      );
    }

    if (!messageGroupReplicaId) {
      this.logger.warn(JOIN_HANDLER_LOG_MSG.COMPLETE_INVALID, {
        reason: JOIN_HANDLER_ERROR_MSG.COMPLETE_REPLICA_ID_REQUIRED,
      });
      return this.createJoinCompleteErrorResponse(
        JOIN_HANDLER_ERROR_MSG.COMPLETE_REPLICA_ID_REQUIRED,
      );
    }

    // Verify the joining node's message group replica is ready
    // The 'ready' flag indicates the joining node has confirmed its replica is synchronized
    if (!ready) {
      this.logger.warn(JOIN_HANDLER_LOG_MSG.COMPLETE_INVALID, {
        reason: JOIN_HANDLER_ERROR_MSG.COMPLETE_NOT_READY,
        joiningNodeId: nodeId,
        messageGroupReplicaId,
      });
      return this.createJoinCompleteErrorResponse(
        JOIN_HANDLER_ERROR_MSG.COMPLETE_NOT_READY,
      );
    }

    this.logger.info(JOIN_HANDLER_LOG_MSG.COMPLETE_VERIFIED, {
      joiningNodeId: nodeId,
      messageGroupReplicaId,
    });

    // Build next steps for the joining node
    const nextSteps = this.buildNextSteps(nodeId, messageGroupReplicaId);

    // Build and return JOIN_COMPLETE_ACK
    const response = {
      type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
      success: true,
      nextSteps,
    };

    this.logger.debug(JOIN_HANDLER_LOG_MSG.COMPLETE_ACK_SENT, {
      joiningNodeId: nodeId,
      success: true,
      nextStepsCount: nextSteps.length,
    });

    return response;
  }

  /**
   * Build next steps instructions for a joining node after JOIN_COMPLETE.
   * These instructions guide the joining node on what to do next
   * (e.g., partition replica assignments, CDC subscriptions).
   * @param {string} joiningNodeId - Joining node's ID.
   * @param {string} _messageGroupReplicaId - Joining node's message group replica ID.
   * @return {Array<string>} Array of next step instructions.
   * @private
   */
  buildNextSteps(joiningNodeId, _messageGroupReplicaId) {
    // For now, return basic next steps
    // In a more sophisticated implementation, this could include:
    // - Partition replica assignments based on rebalancing
    // - CDC subscription instructions
    // - Additional configuration steps
    return [
      `Node ${joiningNodeId} successfully joined the cluster`,
      'Message group replica is synchronized and ready',
      'Use message groups for all subsequent communication',
      'Await partition replica assignments from rebalancer',
    ];
  }

  /**
   * Create an error response for invalid JOIN_COMPLETE requests.
   * @param {string} errorMessage - Error message.
   * @return {Object} JOIN_COMPLETE_ACK with error.
   * @private
   */
  createJoinCompleteErrorResponse(errorMessage) {
    return {
      type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
      success: false,
      nextSteps: [],
      error: errorMessage,
    };
  }

  /**
   * Create message group assignment for a joining node.
   * Assigns the joining node to the initial message group with a new replica.
   * @param {string} joiningNodeId - Joining node's ID.
   * @param {string} joiningAddress - Joining node's address.
   * @return {Object} Message group assignment with groupId, replicaId, and raftPeers.
   * @private
   */
  createMessageGroupAssignment(joiningNodeId, _joiningAddress) {
    // Use the initial message group for now
    // In a more sophisticated implementation, this could use MessageGroupAssignment
    // to determine optimal placement
    const groupId = INITIAL_MESSAGE_GROUP_ID;

    // Generate a unique replica ID for the joining node
    const replicaId = this.generateReplicaId(groupId);

    // Build Raft peer information from existing replicas
    const raftPeers = this.buildRaftPeers(groupId, joiningNodeId);

    return {
      groupId,
      replicaId,
      raftPeers,
    };
  }

  /**
   * Generate a unique replica ID for a message group.
   * @param {string} groupId - Message group ID.
   * @return {string} Generated replica ID.
   * @private
   */
  generateReplicaId(groupId) {
    this.replicaCounter++;
    // Use UUID suffix for uniqueness across restarts
    const uniqueSuffix = uuidv4().substring(NUM.ZERO, NUM.EIGHT);
    return `${groupId}-r-${uniqueSuffix}`;
  }

  /**
   * Build Raft peer information for a message group.
   * Returns the addresses of existing replicas that the joining node
   * needs to connect to for Raft consensus.
   * @param {string} groupId - Message group ID.
   * @param {string} joiningNodeId - Joining node's ID (excluded from peers).
   * @return {Array<Object>} Array of {replicaId, address} objects.
   * @private
   */
  buildRaftPeers(groupId, joiningNodeId) {
    const peers = [];

    // Get existing replicas from message group services
    for (const [replicaId, service] of this.messageGroupServices) {
      // Skip if this replica belongs to the joining node
      if (service.nodeId === joiningNodeId) {
        continue;
      }

      // Build unified address for the replica
      const address = `${service.nodeId}/${ENTITY_TYPE.MESSAGE_GROUP}/${replicaId}`;

      peers.push({
        replicaId,
        address,
      });
    }

    // If no services available, use initial replica IDs with seed node address
    if (peers.length === NUM.ZERO && this.nodeId) {
      for (const replicaId of INITIAL_MESSAGE_GROUP_REPLICA_IDS) {
        const address = `${this.nodeId}/${ENTITY_TYPE.MESSAGE_GROUP}/${replicaId}`;
        peers.push({
          replicaId,
          address,
        });
      }
    }

    return peers;
  }

  /**
   * Create an error response for invalid requests.
   * @param {string} errorMessage - Error message.
   * @return {Object} JOIN_RESPONSE with error.
   * @private
   */
  createErrorResponse(errorMessage) {
    return {
      type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
      success: false,
      messageGroupAssignment: null,
      error: errorMessage,
    };
  }

  /**
   * Register the join handler with the message router.
   * This sets up the handler to receive JOIN_REQUEST and JOIN_COMPLETE messages via WebSocket.
   * @return {void}
   */
  register() {
    if (!this.messageRouter) {
      throw new Error(JOIN_HANDLER_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }

    // Register JOIN_REQUEST handler
    // It will be invoked when JOIN_REQUEST messages are received
    this.messageRouter.setJoinRequestHandler((message) => {
      return this.handleJoinRequest(message);
    });

    // Register JOIN_COMPLETE handler
    // It will be invoked when JOIN_COMPLETE messages are received
    this.messageRouter.setJoinCompleteHandler((message) => {
      return this.handleJoinComplete(message);
    });

    this.logger.info(JOIN_HANDLER_LOG_MSG.HANDLER_REGISTERED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Unregister the join handler from the message router.
   * @return {void}
   */
  unregister() {
    if (this.messageRouter) {
      if (this.messageRouter.setJoinRequestHandler) {
        this.messageRouter.setJoinRequestHandler(null);
      }
      if (this.messageRouter.setJoinCompleteHandler) {
        this.messageRouter.setJoinCompleteHandler(null);
      }
    }

    this.logger.info(JOIN_HANDLER_LOG_MSG.HANDLER_UNREGISTERED, {
      nodeId: this.nodeId,
    });
  }
}

export {
  JoinHandler,
  JOIN_HANDLER_ERROR_MSG,
  JOIN_HANDLER_LOG_MSG,
};
