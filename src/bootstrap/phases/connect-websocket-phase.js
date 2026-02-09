/**
 * Connect WebSocket Phase - Second phase of joining node bootstrap.
 *
 * Establishes WebSocket connectivity:
 * - Creates and configures MessageRouter
 * - Connects to seed node via WebSocket
 * - Connects to all cluster nodes for full mesh connectivity
 * - Sends initial NODE_STATE_UPDATE to control plane
 *
 * Requirements: 2.6, 2.7, 2.8, 3.7
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {assertCritical} from '../../utils/assert.js';
import {MessageRouterSetup} from '../shared/message-router-setup.js';
import {
  ADDRESS,
  NUM,
  PROTOCOL,
  STATE,
  TYPEOF,
} from '../../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../../constants/entrypoint.js';
import {BOOTSTRAP_SUBSYSTEM} from '../bootstrap-constants.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../message-group-assignment.js';
import {
  ControlPlaneMessageType,
  ControlPlaneField,
  DEFAULT_NODE_CAPABILITIES,
} from '../../control-plane/control-plane-constants.js';
import {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';

/**
 * Phase constants for connect websocket setup.
 */
const CONNECT_WEBSOCKET_PHASE = Object.freeze({
  NAME: 'connect_websocket',
  EVENT_START: 'connect_websocket:start',
  EVENT_COMPLETE: 'connect_websocket:complete',
  EVENT_FAILED: 'connect_websocket:failed',
});

/**
 * ConnectWebSocketPhase handles WebSocket connectivity for joining nodes.
 * Creates MessageRouter and establishes connections to cluster nodes.
 */
class ConnectWebSocketPhase extends EventEmitter {
  /**
   * Create connect websocket phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (REQUIRED).
   * @param {string} options.nodeAddress - Node address (REQUIRED).
   * @param {string} options.seedNodeId - Seed node ID (REQUIRED).
   * @param {string} options.seedNodeWsAddress - Seed node WebSocket address (REQUIRED).
   * @param {Object} options.bootstrapResponse - Bootstrap response from seed (REQUIRED).
   * @param {number} options.wsPort - WebSocket port for this node.
   * @param {Object} options.config - Configuration options.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for ConnectWebSocketPhase',
    );
    this.nodeAddress = assertCritical(
      options.nodeAddress,
      'nodeAddress is required for ConnectWebSocketPhase',
    );
    this.seedNodeId = assertCritical(
      options.seedNodeId,
      'seedNodeId is required for ConnectWebSocketPhase',
    );
    this.seedNodeWsAddress = assertCritical(
      options.seedNodeWsAddress,
      'seedNodeWsAddress is required for ConnectWebSocketPhase',
    );
    this.bootstrapResponse = assertCritical(
      options.bootstrapResponse,
      'bootstrapResponse is required for ConnectWebSocketPhase',
    );

    this.wsPort = options.wsPort ?? null;
    this.config = {...JOINING_DEFAULT, ...options.config};

    // Services created during this phase
    this.messageRouter = null;
    this.controlPlaneTargetAddress = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.NODE_JOINING) : console;
  }

  /**
   * Execute the connect websocket phase.
   * @return {Promise<Object>} Phase result with message router.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(CONNECT_WEBSOCKET_PHASE.EVENT_START, {
      nodeId: this.nodeId,
    });

    try {
      // Build identify payload for IDENTIFY messages
      const identifyPayload = this.buildIdentifyPayload();

      // Create MessageRouter using shared setup component
      this.messageRouter = await MessageRouterSetup.create({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
        identifyPayload,
      });

      this.logger.info(JOINING_LOG_MSG.WS_SELF_CONNECTED, {
        nodeId: this.nodeId,
        wsPort: this.wsPort,
        hasSelfConnection: this.messageRouter.hasSelfConnection(),
      });

      // Connect to seed node via WebSocket
      this.logger.info(JOINING_LOG_MSG.SEED_WS_CONNECTING, {
        nodeId: this.nodeId,
        seedWsAddress: this.seedNodeWsAddress,
        seedNodeId: this.seedNodeId,
      });

      await this.messageRouter.connectToNode(this.seedNodeId, this.seedNodeWsAddress);

      this.logger.info(JOINING_LOG_MSG.SEED_WS_CONNECTED, {
        nodeId: this.nodeId,
        seedNodeId: this.seedNodeId,
        seedWsAddress: this.seedNodeWsAddress,
        connectedNodes: this.messageRouter.getConnectedNodes?.() ||
          Array.from(this.messageRouter.nodeConnections?.keys() || []),
      });

      // Connect to all cluster nodes for full mesh connectivity
      await this.connectToClusterNodes();

      // Send initial NODE_STATE_UPDATE to control plane
      await this.sendInitialStateUpdate();

      this.logger.debug(JOINING_LOG_MSG.WS_INFRA_READY, {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
        hasMessageRouter: !!this.messageRouter,
        hasSelfConnection: this.wsPort ? this.messageRouter.hasSelfConnection() : false,
      });

      const duration = Date.now() - startTime;

      const result = {
        phaseName: CONNECT_WEBSOCKET_PHASE.NAME,
        duration,
        services: {
          messageRouter: this.messageRouter,
        },
        metadata: {
          controlPlaneTargetAddress: this.controlPlaneTargetAddress,
          connectedNodes: this.messageRouter.getConnectedNodes?.() ||
            Array.from(this.messageRouter.nodeConnections?.keys() || []),
        },
      };

      this.emit(CONNECT_WEBSOCKET_PHASE.EVENT_COMPLETE, result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(JOINING_LOG_MSG.SEED_WS_CONNECT_FAILED, {
        nodeId: this.nodeId,
        seedWsAddress: this.seedNodeWsAddress,
        seedNodeId: this.seedNodeId,
        error: error.message,
        stack: error.stack,
      });

      this.emit(CONNECT_WEBSOCKET_PHASE.EVENT_FAILED, {
        phaseName: CONNECT_WEBSOCKET_PHASE.NAME,
        duration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Build bootstrap payload for IDENTIFY message.
   * @return {Object|null} Identify bootstrap payload.
   * @private
   */
  buildIdentifyPayload() {
    if (!this.bootstrapResponse) {
      return null;
    }

    return {
      seedNodeId: this.seedNodeId,
      seedNodeWsAddress: this.seedNodeWsAddress,
      messageGroupAssignment: this.bootstrapResponse.messageGroupAssignment,
      partitionLeaders: this.bootstrapResponse.partitionLeaders,
      clusterConfig: this.bootstrapResponse.clusterConfig,
      timestamp: this.bootstrapResponse.timestamp,
    };
  }

  /**
   * Connect to all cluster nodes for full mesh connectivity.
   * @return {Promise<void>}
   * @private
   */
  async connectToClusterNodes() {
    const snapshots = this.bootstrapResponse?.systemTableSnapshots;
    const nodesSnapshot = snapshots?.nodes;

    if (!Array.isArray(nodesSnapshot) || nodesSnapshot.length === NUM.ZERO) {
      return;
    }

    // Filter to nodes that are not this node
    const otherNodes = nodesSnapshot.filter((node) => {
      const nodeId = node?.node_id;
      return nodeId && nodeId !== this.nodeId;
    });

    if (otherNodes.length === NUM.ZERO) {
      return;
    }

    this.logger.info(JOINING_LOG_MSG.CONNECTING_TO_CLUSTER_NODES, {
      nodeId: this.nodeId,
      otherNodeCount: otherNodes.length,
      otherNodeIds: otherNodes.map((n) => n.node_id),
    });

    // Connect to each node in parallel, skipping already-connected nodes
    const connectionPromises = otherNodes.map(async (node) => {
      const targetNodeId = node.node_id;
      const nodeAddress = node.node_address;

      // Skip if already connected
      if (this.messageRouter.nodeConnections?.has(targetNodeId)) {
        return;
      }

      if (!nodeAddress) {
        this.logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          error: 'Missing node_address',
        });
        return;
      }

      // Derive WebSocket address from node address
      const wsAddress = this.deriveWsAddressFromNodeAddress(nodeAddress);
      if (!wsAddress) {
        this.logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          nodeAddress,
          error: 'Could not derive WebSocket address',
        });
        return;
      }

      try {
        await this.messageRouter.connectToNode(targetNodeId, wsAddress);
        this.logger.info(JOINING_LOG_MSG.CLUSTER_NODE_CONNECTED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
        });
      } catch (error) {
        // Log but don't fail - the node might be temporarily unavailable
        this.logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
          error: error.message,
        });
      }
    });

    await Promise.all(connectionPromises);

    this.logger.info(JOINING_LOG_MSG.CLUSTER_CONNECTIONS_COMPLETE, {
      nodeId: this.nodeId,
      connectedNodes: this.messageRouter.getConnectedNodes?.() ||
        Array.from(this.messageRouter.nodeConnections?.keys() || []),
    });
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   * @private
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    if (!nodeAddress || typeof nodeAddress !== TYPEOF.STRING) {
      return null;
    }

    // Check if address is already a full WebSocket URL
    if (nodeAddress.startsWith(PROTOCOL.WS) || nodeAddress.startsWith(PROTOCOL.WSS)) {
      const isSecure = nodeAddress.startsWith(PROTOCOL.WSS);
      const protocolPrefix = isSecure ? PROTOCOL.WSS : PROTOCOL.WS;
      const withoutProtocol = nodeAddress.substring(protocolPrefix.length);

      const colonIndex = withoutProtocol.lastIndexOf(ADDRESS.PORT_SEPARATOR);
      if (colonIndex === NUM.NEGATIVE_ONE || colonIndex === NUM.ZERO) {
        return null;
      }

      const hostname = withoutProtocol.substring(NUM.ZERO, colonIndex);
      const portStr = withoutProtocol.substring(colonIndex + NUM.ONE);
      const restPort = parseInt(portStr, NUM.TEN);

      if (!hostname || hostname.length === NUM.ZERO) {
        return null;
      }

      if (!Number.isFinite(restPort) || restPort <= NUM.ZERO) {
        return null;
      }

      // For WebSocket URLs, the port is already the WS port
      return nodeAddress;
    }

    // Parse hostname:port format (REST API address)
    const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
    if (colonIndex === NUM.NEGATIVE_ONE || colonIndex === NUM.ZERO) {
      return null;
    }

    const hostname = nodeAddress.substring(NUM.ZERO, colonIndex);
    if (!hostname || hostname.length === NUM.ZERO) {
      return null;
    }

    const portStr = nodeAddress.substring(colonIndex + NUM.ONE);
    const restPort = parseInt(portStr, NUM.TEN);

    if (!Number.isFinite(restPort) || restPort <= NUM.ZERO) {
      return null;
    }

    // WebSocket port = REST port + WS_PORT_OFFSET
    const wsPort = restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
    return `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`;
  }

  /**
   * Send initial NODE_STATE_UPDATE to control plane.
   * @return {Promise<void>}
   * @private
   */
  async sendInitialStateUpdate() {
    const targetAddress = this.resolveControlPlaneTargetAddress();
    if (!targetAddress) {
      this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_TARGET_MISSING, {
        nodeId: this.nodeId,
        state: STATE.CONNECTED,
      });
      return;
    }

    this.controlPlaneTargetAddress = targetAddress;

    const registerMessage = {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: this.nodeId,
      [ControlPlaneField.NODE_ADDRESS]: this.nodeAddress,
      [ControlPlaneField.CAPABILITIES]: [...DEFAULT_NODE_CAPABILITIES],
      [ControlPlaneField.STATE]: STATE.CONNECTED,
    };

    try {
      await this.messageRouter.deliver(targetAddress, registerMessage);
      this.logger.info(JOINING_LOG_MSG.NODE_STATE_UPDATE_SENT, {
        nodeId: this.nodeId,
        targetAddress: targetAddress,
        state: STATE.CONNECTED,
      });
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.NODE_STATE_UPDATE_FAILED, {
        nodeId: this.nodeId,
        targetAddress: targetAddress,
        state: STATE.CONNECTED,
        error: error.message,
      });
      throw new Error(JOINING_ERROR_MSG.controlPlaneMessageFailed(error.message));
    }
  }

  /**
   * Resolve the control plane message target address.
   * @return {string|null} Target address or null.
   * @private
   */
  resolveControlPlaneTargetAddress() {
    const assignment = this.bootstrapResponse?.messageGroupAssignment;
    if (!assignment) {
      return null;
    }

    const seedNodeId = this.bootstrapResponse?.seedNodeId || this.seedNodeId;
    const replicaToMove = assignment.replicaToMove || null;

    const candidates = [
      ...(Array.isArray(assignment.peerAddresses) ? assignment.peerAddresses : []),
      ...(Array.isArray(assignment.replicaAddresses) ? assignment.replicaAddresses : []),
    ].filter(Boolean);

    const parseAddress = (addr) => {
      const m = addr.match(/^([^/]+)\/message-group\/(.+)$/);
      return m ? {nodeId: m[NUM.ONE], replicaId: m[NUM.TWO]} : null;
    };

    // Prefer a replica on the seed node that is not being moved
    const prefer = candidates.find((addr) => {
      const parsed = parseAddress(addr);
      if (!parsed) return false;
      if (seedNodeId && parsed.nodeId !== seedNodeId) return false;
      if (replicaToMove && parsed.replicaId === replicaToMove) return false;
      return true;
    });
    if (prefer) return prefer;

    // Fall back to any non-moved replica
    const nextBest = candidates.find((addr) => {
      const parsed = parseAddress(addr);
      if (!parsed) return false;
      if (replicaToMove && parsed.replicaId === replicaToMove) return false;
      return true;
    });
    if (nextBest) return nextBest;

    // For CREATE_SELF_HOSTED, we don't have a target yet
    if (assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED) {
      return null;
    }

    return null;
  }

  /**
   * Clean up resources on failure.
   * @return {Promise<void>}
   */
  async cleanup() {
    if (this.messageRouter) {
      try {
        await this.messageRouter.shutdown();
      } catch (error) {
        this.logger.warn('Failed to shutdown message router during cleanup', {
          error: error.message,
        });
      }
      this.messageRouter = null;
    }
    this.controlPlaneTargetAddress = null;
  }

  /**
   * Get the message router.
   * @return {Object|null} Message router or null.
   */
  getMessageRouter() {
    return this.messageRouter;
  }

  /**
   * Get the control plane target address.
   * @return {string|null} Control plane target address or null.
   */
  getControlPlaneTargetAddress() {
    return this.controlPlaneTargetAddress;
  }
}

export {ConnectWebSocketPhase, CONNECT_WEBSOCKET_PHASE};
