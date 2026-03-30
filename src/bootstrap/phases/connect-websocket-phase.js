/**
 * Connect WebSocket Phase — handles MessageRouter initialization,
 * seed node WebSocket connection, and full mesh connectivity during
 * the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {assertCritical} from '../../utils/assert.js';
import {MessageRouterSetup} from '../shared/message-router-setup.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  JOINING_UNIFIED_RECONCILE,
} from '../node-joining-constants.js';
import {
  ADDRESS,
  NUM,
  PROTOCOL,
  STATE,
  TYPEOF,
} from '../../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../../constants/entrypoint.js';
import {CONNECTION_STATE} from '../../constants/transport.js';
import {resolveNodeWebSocketAddress} from
  '../../transport/node-address-resolution.js';

const OWNER_MESSAGE_ROUTER_SETUP = 'MessageRouterSetup';
const ERR_MISSING_WS_ENDPOINT = 'Missing canonical node_endpoints websocket address';
const LOG_SEED_WS_FALLBACK =
  '[JOIN-DEBUG] Proceeding with peer mesh after seed websocket retry exhaustion';
const MESH_CONNECTED_OR_IN_FLIGHT_STATES = new Set([
  CONNECTION_STATE.CONNECTED,
  CONNECTION_STATE.CONNECTING,
  CONNECTION_STATE.RECONNECTING,
]);

function resolveQueryTransportSelection(getSelection) {
  if (typeof getSelection !== TYPEOF.FUNCTION) {
    return null;
  }
  const selection = getSelection();
  if (selection &&
      typeof selection.sendMessage === TYPEOF.FUNCTION) {
    return selection.initialized === true ? selection : null;
  }
  if (!selection || typeof selection !== TYPEOF.OBJECT) {
    return null;
  }

  const service = selection.service;
  if (service &&
      typeof service.sendMessage === TYPEOF.FUNCTION &&
      service.initialized === true) {
    return {
      ...selection,
      service,
    };
  }

  return {
    service: null,
    reason:
      typeof selection.reason === TYPEOF.STRING &&
      selection.reason.length > NUM.ZERO ?
        selection.reason :
        null,
    retryAfterMs:
      Number.isFinite(selection.retryAfterMs) &&
      selection.retryAfterMs > NUM.ZERO ?
        Math.floor(selection.retryAfterMs) :
        NUM.ZERO,
  };
}

function getConnectedPeerNodeIds(messageRouter, localNodeId) {
  if (!messageRouter || typeof messageRouter !== TYPEOF.OBJECT) {
    return [];
  }

  const connectedNodeIds = typeof messageRouter.getConnectedNodes ===
      TYPEOF.FUNCTION ?
    messageRouter.getConnectedNodes() :
    Array.from(messageRouter.nodeConnections?.entries?.() || [])
      .filter(([, connection]) => connection?.state === STATE.CONNECTED)
      .map(([nodeId]) => nodeId);

  return connectedNodeIds.filter((nodeId) => {
    return typeof nodeId === TYPEOF.STRING &&
      nodeId.length > NUM.ZERO &&
      nodeId !== localNodeId;
  });
}

/**
 * Handles the connect-websocket phase of the join process.
 */
class ConnectWebSocketPhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.delegates = options.delegates || {};
  }

  /**
   * Initialize MessageRouter, connect to seed node via WebSocket,
   * then establish full mesh connectivity with all cluster nodes.
   * @return {Promise<void>}
   */
  async phaseConnectWebSocket() {
    const wsPort = this.delegates.getWsPort();
    const identifyPayload = this.delegates.getIdentifyPayload();
    const nodeAddress = this.delegates.getNodeAddress();
    const advertisedNodeWsAddress =
      this.delegates.getAdvertisedNodeWsAddress?.() || null;
    const logger = this.delegates.getLogger();

    // Route message-router setup through the shared owner.
    let messageRouter;
    try {
      messageRouter = await MessageRouterSetup.create({
        nodeId: this.nodeId,
        nodeAddress,
        advertisedNodeWsAddress,
        wsPort: wsPort,
        identifyPayload,
        externalAdmissionEnabled: false,
      });
    } catch (error) {
      logger.error(JOINING_LOG_MSG.ROUTER_INIT_FAILED, {
        nodeId: this.nodeId,
        wsPort: wsPort,
        error: error.message,
        stack: error.stack,
      });
      const routerInitFailed = JOINING_ERROR_MSG.routerInitFailed;
      throw new Error(routerInitFailed(error.message));
    }

    this.delegates.setMessageRouter(messageRouter);

    // Use MessageRouter directly for all services
    // MessageRouter handles both local and remote message delivery
    if (typeof messageRouter.setQueryMessageGroupServiceResolver ===
        TYPEOF.FUNCTION) {
      messageRouter.setQueryMessageGroupServiceResolver(() =>
        resolveQueryTransportSelection(
          () =>
            typeof this.delegates
              .resolveQueryTransportMessageGroupSelection ===
              TYPEOF.FUNCTION ?
              this.delegates.resolveQueryTransportMessageGroupSelection() :
              this.delegates.getLeaderMessageGroupService(),
        ),
      );
    }
    this.delegates.setTransport(messageRouter);
    await this.delegates.initializeJoiningLifecycleOwners();
    await this.delegates.triggerJoinReconciler(
      JOINING_UNIFIED_RECONCILE.INFRA_READY_REASON,
    );
    if (typeof this.delegates.ensureBootstrapSnapshotHydrated ===
        TYPEOF.FUNCTION) {
      await this.delegates.ensureBootstrapSnapshotHydrated();
    }

    // Get seed node WebSocket address from bootstrap response or options
    const seedWsAddress = assertCritical(
      this.delegates.getSeedNodeWsAddress(),
      JOINING_ERROR_MSG.SEED_WS_ADDRESS_REQUIRED,
    );
    const seedNodeId = assertCritical(
      this.delegates.getSeedNodeId(),
      JOINING_ERROR_MSG.SEED_NODE_ID_REQUIRED,
    );

    logger.info(JOINING_LOG_MSG.SEED_WS_CONNECTING, {
      nodeId: this.nodeId,
      seedWsAddress,
      seedNodeId,
    });

    let seedConnectionError = null;
    try {
      await this.connectToSeedNode(messageRouter, seedNodeId, seedWsAddress);

      logger.info(JOINING_LOG_MSG.SEED_WS_CONNECTED, {
        nodeId: this.nodeId,
        seedNodeId,
        seedWsAddress,
        connectedNodes: messageRouter.getConnectedNodes?.() ||
          Array.from(
            messageRouter.nodeConnections?.keys() || [],
          ),
      });
    } catch (error) {
      seedConnectionError = error;
    }

    // Connect to all cluster nodes for full mesh connectivity
    // This ensures Raft messages can flow between all nodes
    await this.connectToClusterNodes();

    const connectedPeerNodeIds = getConnectedPeerNodeIds(
      messageRouter,
      this.nodeId,
    );
    if (seedConnectionError && connectedPeerNodeIds.length === NUM.ZERO) {
      logger.error(JOINING_LOG_MSG.SEED_WS_CONNECT_FAILED, {
        nodeId: this.nodeId,
        seedWsAddress,
        seedNodeId,
        error: seedConnectionError.message,
        stack: seedConnectionError.stack,
      });
      throw seedConnectionError;
    }
    if (seedConnectionError) {
      logger.warn(LOG_SEED_WS_FALLBACK, {
        nodeId: this.nodeId,
        seedNodeId,
        seedWsAddress,
        connectedPeerNodeIds,
        error: seedConnectionError.message,
      });
    }

    try {
      await this.delegates.sendControlPlaneNodeStateUpdate({
        state: STATE.CONNECTED,
        capabilities: this.delegates.getNodeCapabilities(),
      });
    } catch (error) {
      const cause = error?.cause || error;
      const shouldDeferConnectedPublication =
        typeof this.delegates.shouldRetryControlPlaneNodeStateUpdate ===
          TYPEOF.FUNCTION &&
        this.delegates.shouldRetryControlPlaneNodeStateUpdate(cause);
      if (!shouldDeferConnectedPublication) {
        throw error;
      }
      logger.warn(JOINING_LOG_MSG.CONNECTED_STATE_UPDATE_DEFERRED, {
        nodeId: this.nodeId,
        seedNodeId,
        error: error.message,
      });
    }

    logger.debug(JOINING_LOG_MSG.WS_INFRA_READY, {
      nodeId: this.nodeId,
      nodeAddress,
      wsPort: wsPort,
      hasMessageRouter: !!messageRouter,
      hasSelfConnection: wsPort ?
        messageRouter.hasSelfConnection() : false,
      owner: OWNER_MESSAGE_ROUTER_SETUP,
    });
  }

  /**
   * Connect to the seed node with bounded retry semantics.
   * Rolling restarts can temporarily make the seed WebSocket unavailable even
   * after bootstrap HTTP is reachable, so a single timeout should not abort
   * the full join while the existing join retry window still has budget left.
   * @param {Object} messageRouter
   * @param {string} seedNodeId
   * @param {string} seedWsAddress
   * @return {Promise<void>}
   * @private
   */
  async connectToSeedNode(messageRouter, seedNodeId, seedWsAddress) {
    const logger = this.delegates.getLogger();
    const now = typeof this.delegates.getNow === TYPEOF.FUNCTION ?
      this.delegates.getNow() :
      () => Date.now();
    const sleep = typeof this.delegates.getSleep === TYPEOF.FUNCTION ?
      this.delegates.getSleep() :
      (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
    const computeRetryDelayMs =
      typeof this.delegates.computeSeedContactRetryDelayMs === TYPEOF.FUNCTION ?
        this.delegates.computeSeedContactRetryDelayMs :
        null;

    if (typeof sleep !== TYPEOF.FUNCTION) {
      await messageRouter.connectToNode(seedNodeId, seedWsAddress);
      return;
    }

    const retryPolicy = this.resolveSeedWebSocketRetryPolicy();
    const retryTimeoutMs = Number.isFinite(retryPolicy?.retryTimeoutMs) ?
      Math.max(NUM.ONE, Math.floor(retryPolicy.retryTimeoutMs)) :
      NUM.ZERO;
    const initialDelayMs = Number.isFinite(retryPolicy?.initialDelayMs) ?
      Math.max(NUM.ONE, Math.floor(retryPolicy.initialDelayMs)) :
      NUM.HUNDRED;
    const maxDelayMs = Number.isFinite(retryPolicy?.maxDelayMs) ?
      Math.max(initialDelayMs, Math.floor(retryPolicy.maxDelayMs)) :
      initialDelayMs;
    const backoffMultiplier =
      Number.isFinite(retryPolicy?.backoffMultiplier) &&
      retryPolicy.backoffMultiplier > NUM.ONE ?
        retryPolicy.backoffMultiplier :
        NUM.TWO;

    if (retryTimeoutMs <= NUM.ZERO) {
      await messageRouter.connectToNode(seedNodeId, seedWsAddress);
      return;
    }

    const startMs = now();
    const deadlineMs = startMs + retryTimeoutMs;
    let baseDelayMs = initialDelayMs;
    let attempt = NUM.ZERO;
    let lastError = null;

    while (true) {
      attempt += NUM.ONE;
      try {
        await messageRouter.connectToNode(seedNodeId, seedWsAddress);
        return;
      } catch (error) {
        lastError = error;
        const elapsedMs = Math.max(NUM.ZERO, now() - startMs);
        const remainingMs = deadlineMs - now();

        if (getConnectedPeerNodeIds(messageRouter, this.nodeId).length === NUM.ZERO) {
          await this.connectToClusterNodes();
        }
        if (getConnectedPeerNodeIds(messageRouter, this.nodeId).length > NUM.ZERO) {
          break;
        }

        if (remainingMs <= NUM.ZERO) {
          break;
        }

        const nextDelayMs = computeRetryDelayMs ?
          computeRetryDelayMs({
            baseDelayMs,
            maxDelayMs,
            retryAfterMs: null,
          }) :
          Math.min(baseDelayMs, maxDelayMs);
        const boundedDelayMs = Math.max(
          NUM.ONE,
          Math.min(remainingMs, nextDelayMs),
        );

        logger.warn(JOINING_LOG_MSG.SEED_WS_RETRYING, {
          nodeId: this.nodeId,
          seedNodeId,
          seedWsAddress,
          attempt,
          elapsedMs,
          nextDelayMs: boundedDelayMs,
          error: error.message,
        });

        await sleep(boundedDelayMs);
        baseDelayMs = Math.min(
          Math.max(NUM.ONE, Math.floor(baseDelayMs * backoffMultiplier)),
          maxDelayMs,
        );
      }
    }

    throw lastError;
  }

  /**
   * Resolve bounded retry policy for seed websocket connectivity.
   * Keep this independent from HTTP seed-contact timeout so mocked
   * or fast-fail join paths do not inherit the full HTTP retry budget.
   * @return {Object}
   * @private
   */
  resolveSeedWebSocketRetryPolicy() {
    const config = typeof this.delegates.getConfig === TYPEOF.FUNCTION ?
      this.delegates.getConfig() || {} :
      {};
    const retryTimeoutMs =
      Number.isFinite(config.leadershipWaitTimeoutMs) ?
        Math.max(NUM.ONE, Math.floor(config.leadershipWaitTimeoutMs)) :
        NUM.ZERO;
    const initialDelayMs =
      Number.isFinite(config.leadershipWaitInitialDelayMs) ?
        Math.max(NUM.TEN, Math.floor(config.leadershipWaitInitialDelayMs)) :
        NUM.HUNDRED;
    const maxDelayMs =
      Number.isFinite(config.leadershipWaitMaxDelayMs) ?
        Math.max(initialDelayMs, Math.floor(config.leadershipWaitMaxDelayMs)) :
        initialDelayMs;
    const backoffMultiplier =
      Number.isFinite(config.leadershipWaitBackoffMultiplier) &&
      config.leadershipWaitBackoffMultiplier > NUM.ONE ?
        config.leadershipWaitBackoffMultiplier :
        NUM.TWO;

    return {
      retryTimeoutMs,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
    };
  }

  /**
   * Connect to all cluster nodes for full mesh connectivity.
   * Skips nodes we're already connected to (checked via messageRouter).
   * All nodes are equal peers - no special treatment for any node.
   * @return {Promise<void>}
   */
  async connectToClusterNodes() {
    const logger = this.delegates.getLogger();
    const messageRouter = this.delegates.getMessageRouter();
    const bootstrapResponse =
      this.delegates.getBootstrapResponse?.() || null;
    const systemTableCache =
      this.delegates.getSystemTableCache?.() || null;
    const {
      source: nodeSource,
      rows: nodesSnapshot,
    } = this.delegates.resolveMeshConnectivityNodeRows();

    if (!Array.isArray(nodesSnapshot) ||
        nodesSnapshot.length === NUM.ZERO) {
      return;
    }

    this.delegates.setLastClusterMeshSignature(
      this.delegates.buildClusterMeshSignature(nodesSnapshot),
    );

    // Filter to nodes that are not this node
    const otherNodes = nodesSnapshot.filter((node) => {
      const nodeId = node?.node_id;
      return nodeId && nodeId !== this.nodeId;
    });

    if (otherNodes.length === NUM.ZERO) {
      return;
    }

    logger.info(JOINING_LOG_MSG.CONNECTING_TO_CLUSTER_NODES, {
      nodeId: this.nodeId,
      nodeSource,
      otherNodeCount: otherNodes.length,
      otherNodeIds: otherNodes.map((n) => n.node_id),
    });

    // Connect to each node in parallel, skipping already-connected nodes
    const connectionPromises = otherNodes.map(async (node) => {
      const targetNodeId = node.node_id;
      const nodeAddress = node.node_address;

      const connectionState =
        typeof messageRouter.getConnectionState === TYPEOF.FUNCTION ?
          messageRouter.getConnectionState(targetNodeId) :
          messageRouter.nodeConnections?.get(targetNodeId)?.state ||
            null;

      if (MESH_CONNECTED_OR_IN_FLIGHT_STATES.has(connectionState)) {
        return;
      }

      const wsAddress = resolveNodeWebSocketAddress({
        targetNodeId,
        bootstrapResponse,
        systemTableCache,
      });
      if (!wsAddress) {
        logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          nodeAddress,
          error: ERR_MISSING_WS_ENDPOINT,
        });
        return;
      }

      try {
        await messageRouter.connectToNode(targetNodeId, wsAddress);
        logger.info(JOINING_LOG_MSG.CLUSTER_NODE_CONNECTED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
        });
      } catch (error) {
        // Log but don't fail - the node might be temporarily unavailable
        // Raft will handle retries and leader election
        logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
          error: error.message,
        });
      }
    });

    await Promise.all(connectionPromises);

    logger.info(JOINING_LOG_MSG.CLUSTER_CONNECTIONS_COMPLETE, {
      nodeId: this.nodeId,
      connectedNodes: messageRouter.getConnectedNodes?.() ||
        Array.from(
          messageRouter.nodeConnections?.keys() || [],
        ),
    });
  }
}

/**
 * Derive WebSocket address from node REST address.
 * Pure function — no instance state needed.
 * @param {string} nodeAddress - Node address in format "hostname:port".
 * @return {string|null} WebSocket address or null if cannot derive.
 */
function deriveWsAddressFromNodeAddress(nodeAddress) {
  if (!nodeAddress || typeof nodeAddress !== TYPEOF.STRING) {
    return null;
  }

  let hostname;
  let restPort;

  // Check if address is already a full WebSocket URL (ws:// or wss://)
  if (nodeAddress.startsWith(PROTOCOL.WS) ||
      nodeAddress.startsWith(PROTOCOL.WSS)) {
    // Parse URL format: ws://hostname:port or wss://hostname:port
    const isSecure = nodeAddress.startsWith(PROTOCOL.WSS);
    const protocolPrefix = isSecure ? PROTOCOL.WSS : PROTOCOL.WS;
    const withoutProtocol =
      nodeAddress.substring(protocolPrefix.length);

    const colonIndex =
      withoutProtocol.lastIndexOf(ADDRESS.PORT_SEPARATOR);
    if (colonIndex === NUM.NEGATIVE_ONE ||
        colonIndex === NUM.ZERO) {
      return null;
    }

    hostname =
      withoutProtocol.substring(NUM.ZERO, colonIndex);
    const portStr =
      withoutProtocol.substring(colonIndex + NUM.ONE);
    restPort = parseInt(portStr, NUM.TEN);

    if (!hostname || hostname.length === NUM.ZERO) {
      return null;
    }

    if (!Number.isFinite(restPort) || restPort <= NUM.ZERO) {
      return null;
    }

    // For WebSocket URLs, the port is already the WS port, return as-is
    return nodeAddress;
  }

  // Parse hostname:port format (REST API address)
  const colonIndex =
    nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
  if (colonIndex === NUM.NEGATIVE_ONE ||
      colonIndex === NUM.ZERO) {
    // No colon found or colon at start (empty hostname)
    return null;
  }

  hostname = nodeAddress.substring(NUM.ZERO, colonIndex);
  if (!hostname || hostname.length === NUM.ZERO) {
    return null;
  }

  const portStr = nodeAddress.substring(colonIndex + NUM.ONE);
  restPort = parseInt(portStr, NUM.TEN);

  if (!Number.isFinite(restPort) || restPort <= NUM.ZERO) {
    return null;
  }

  // WebSocket port = REST port + WS_PORT_OFFSET
  const wsPort = restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
  return `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`;
}

export {
  ConnectWebSocketPhase,
  deriveWsAddressFromNodeAddress,
};
