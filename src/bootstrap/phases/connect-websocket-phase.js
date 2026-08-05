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
  NUM,
  STATE,
} from '../../constants/index.js';
import {deriveTransportWebSocketAddress} from
  '../../config/listener-port-model.js';
import {CONNECTION_STATE} from '../../constants/transport.js';
import {
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  resolveNodeWebSocketAddress,
} from
  '../../transport/node-address-resolution.js';
import {
  resolveQueryTransportSelection,
} from '../shared/query-transport-selection.js';
import {
  MESSAGE_ROUTER_SHARED,
} from '../../transport/message-router-shared.js';

const OWNER_MESSAGE_ROUTER_SETUP = 'MessageRouterSetup';
const {
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} = MESSAGE_ROUTER_SHARED;
const ERR_MISSING_WS_ENDPOINT = 'Missing canonical node_endpoints websocket address';
const LOG_SEED_WS_FALLBACK =
  '[JOIN-DEBUG] Proceeding with peer mesh after seed websocket retry exhaustion';
const MESH_CONNECTIVITY_NODE_SOURCE = Object.freeze({
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
  SYSTEM_TABLE_CACHE: 'system_table_cache',
  SYSTEM_TABLE_CACHE_WITH_BOOTSTRAP_SUPPLEMENT:
    'system_table_cache_with_bootstrap_supplement',
});
const MESH_BOOTSTRAP_ADDRESS_SCOPE_STATE = Object.freeze({
  ALL: 'all',
  NODE_IDS: 'node_ids',
  NONE: 'none',
});
const MESH_CONNECTED_OR_IN_FLIGHT_STATES = new Set([
  CONNECTION_STATE.CONNECTED,
  CONNECTION_STATE.CONNECTING,
  CONNECTION_STATE.RECONNECTING,
]);
const MESH_CONNECTED_OR_CONNECTING_STATES = new Set([
  CONNECTION_STATE.CONNECTED,
  CONNECTION_STATE.CONNECTING,
]);

function getConnectedPeerNodeIds(messageRouter, localNodeId) {
  if (!messageRouter || typeof messageRouter !== 'object') {
    return [];
  }

  const connectedNodeIds = typeof messageRouter.getConnectedNodes ===
      'function' ?
    messageRouter.getConnectedNodes() :
    Array.from(messageRouter.nodeConnections?.entries?.() || [])
      .filter(([, connection]) => connection?.state === STATE.CONNECTED)
      .map(([nodeId]) => nodeId);

  return connectedNodeIds.filter((nodeId) => {
    return typeof nodeId === 'string' &&
      nodeId.length > 0 &&
      nodeId !== localNodeId;
  });
}

function markRetryableSeedWebSocketTimeout(error, retryAfterMs) {
  if (
    !error ||
    typeof error !== 'object' ||
    error.code !== WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE
  ) {
    return;
  }
  error.deferRetry = true;
  if (!Number.isFinite(error.retryAfterMs) || error.retryAfterMs <= 0) {
    error.retryAfterMs = Math.max(1, Math.floor(retryAfterMs));
  }
}

function normalizeBootstrapAddressScopeNodeIds(nodeIds = []) {
  return Array.isArray(nodeIds) ?
    nodeIds.filter((nodeId) =>
      typeof nodeId === 'string' && nodeId.length > 0,
    ) :
    [];
}

function mergeBootstrapAddressScopeNodeIds(...nodeIdLists) {
  const mergedNodeIds = new Set();
  for (const nodeIdList of nodeIdLists) {
    for (const nodeId of normalizeBootstrapAddressScopeNodeIds(nodeIdList)) {
      mergedNodeIds.add(nodeId);
    }
  }
  return Array.from(mergedNodeIds);
}

function buildBootstrapAddressScope(state, nodeIds = []) {
  return Object.freeze({
    state,
    nodeIds: new Set(normalizeBootstrapAddressScopeNodeIds(nodeIds)),
  });
}

function resolveBootstrapAdmissionPeerHintNodeIds(bootstrapResponse) {
  const topologySnapshotMeta = bootstrapResponse?.topologySnapshotMeta;
  return normalizeBootstrapAddressScopeNodeIds(
    topologySnapshotMeta?.bootstrapAdmissionPeerHintNodeIds);
}

function resolveBootstrapAddressScope(
  nodeSource,
  bootstrapSupplementNodeIds,
  bootstrapAdmissionPeerHintNodeIds = [],
) {
  if (nodeSource === MESH_CONNECTIVITY_NODE_SOURCE.BOOTSTRAP_SNAPSHOT) {
    return buildBootstrapAddressScope(MESH_BOOTSTRAP_ADDRESS_SCOPE_STATE.ALL);
  }

  const admissionPeerHintNodeIds = normalizeBootstrapAddressScopeNodeIds(
    bootstrapAdmissionPeerHintNodeIds,
  );
  const scopedNodeIds = mergeBootstrapAddressScopeNodeIds(
    bootstrapSupplementNodeIds,
    admissionPeerHintNodeIds,
  );
  if (
    nodeSource ===
      MESH_CONNECTIVITY_NODE_SOURCE
        .SYSTEM_TABLE_CACHE_WITH_BOOTSTRAP_SUPPLEMENT
  ) {
    return buildBootstrapAddressScope(
      MESH_BOOTSTRAP_ADDRESS_SCOPE_STATE.NODE_IDS,
      scopedNodeIds,
    );
  }

  if (
    nodeSource === MESH_CONNECTIVITY_NODE_SOURCE.SYSTEM_TABLE_CACHE &&
    admissionPeerHintNodeIds.length > 0
  ) {
    return buildBootstrapAddressScope(
      MESH_BOOTSTRAP_ADDRESS_SCOPE_STATE.NODE_IDS,
      admissionPeerHintNodeIds,
    );
  }

  return buildBootstrapAddressScope(
    MESH_BOOTSTRAP_ADDRESS_SCOPE_STATE.NONE,
  );
}

function resolveBootstrapResponseForMeshAddress(
  bootstrapResponse,
  bootstrapAddressScope,
  targetNodeId,
) {
  if (
    bootstrapAddressScope?.state === MESH_BOOTSTRAP_ADDRESS_SCOPE_STATE.ALL
  ) {
    return bootstrapResponse;
  }
  if (
    bootstrapAddressScope?.state ===
      MESH_BOOTSTRAP_ADDRESS_SCOPE_STATE.NODE_IDS &&
    bootstrapAddressScope.nodeIds.has(targetNodeId)
  ) {
    return bootstrapResponse;
  }
  return null;
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
        bootIncarnation: this.delegates.getBootIncarnation?.() || 0,
      });
    } catch (error) {
      logger.error(JOINING_LOG_MSG.ROUTER_INIT_FAILED, {
        nodeId: this.nodeId,
        wsPort: wsPort,
        error: error.message,
        stack: error.stack,
      });
      const routerInitFailed = JOINING_ERROR_MSG.routerInitFailed;
      const wrapped = new Error(routerInitFailed(error.message));
      // Preserve a transient-bind classification through the re-wrap (e.g.
      // EADDRINUSE on a still-draining prior listener during rejoin) so the
      // join retry loop treats it as retryable and backs off, instead of
      // exiting the node. A plain Error re-wrap would drop `code`/`retryable`.
      if (error && error.code !== undefined) {
        wrapped.code = error.code;
      }
      if (error && error.retryable !== undefined) {
        wrapped.retryable = error.retryable;
      }
      throw wrapped;
    }

    this.delegates.setMessageRouter(messageRouter);

    // Use MessageRouter directly for all services
    // MessageRouter handles both local and remote message delivery
    if (typeof messageRouter.setQueryMessageGroupServiceResolver ===
        'function') {
      messageRouter.setQueryMessageGroupServiceResolver(() =>
        resolveQueryTransportSelection(
          () =>
            typeof this.delegates
              .resolveQueryTransportMessageGroupSelection ===
              'function' ?
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
        'function') {
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
    if (seedConnectionError && connectedPeerNodeIds.length === 0) {
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
          'function' &&
        this.delegates.shouldRetryControlPlaneNodeStateUpdate(cause);
      if (!shouldDeferConnectedPublication) {
        throw error;
      }
      logger.warn(JOINING_LOG_MSG.CONNECTED_STATE_UPDATE_DEFERRED, {
        nodeId: this.nodeId,
        seedNodeId,
        error: error.message,
      });
      try {
        await this.connectToSeedNode(
          messageRouter,
          seedNodeId,
          seedWsAddress,
        );
      } catch (_seedReconnectError) {
        await this.connectToClusterNodes();
      }
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
    const now = typeof this.delegates.getNow === 'function' ?
      this.delegates.getNow() :
      () => Date.now();
    const sleep = typeof this.delegates.getSleep === 'function' ?
      this.delegates.getSleep() :
      (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
    const computeRetryDelayMs =
      typeof this.delegates.computeSeedContactRetryDelayMs === 'function' ?
        this.delegates.computeSeedContactRetryDelayMs :
        null;

    if (typeof sleep !== 'function') {
      await messageRouter.connectToNode(seedNodeId, seedWsAddress);
      return;
    }

    const retryPolicy = this.resolveSeedWebSocketRetryPolicy();
    const retryTimeoutMs = Number.isFinite(retryPolicy?.retryTimeoutMs) ?
      Math.max(1, Math.floor(retryPolicy.retryTimeoutMs)) :
      0;
    const initialDelayMs = Number.isFinite(retryPolicy?.initialDelayMs) ?
      Math.max(1, Math.floor(retryPolicy.initialDelayMs)) :
      NUM.HUNDRED;
    const maxDelayMs = Number.isFinite(retryPolicy?.maxDelayMs) ?
      Math.max(initialDelayMs, Math.floor(retryPolicy.maxDelayMs)) :
      initialDelayMs;
    const backoffMultiplier =
      Number.isFinite(retryPolicy?.backoffMultiplier) &&
      retryPolicy.backoffMultiplier > 1 ?
        retryPolicy.backoffMultiplier :
        2;

    if (retryTimeoutMs <= 0) {
      await messageRouter.connectToNode(seedNodeId, seedWsAddress);
      return;
    }

    const startMs = now();
    const deadlineMs = startMs + retryTimeoutMs;
    let baseDelayMs = initialDelayMs;
    let attempt = 0;
    let lastError = null;

    while (true) {
      attempt += 1;
      try {
        await messageRouter.connectToNode(seedNodeId, seedWsAddress);
        return;
      } catch (error) {
        lastError = error;
        const elapsedMs = Math.max(0, now() - startMs);
        const remainingMs = deadlineMs - now();

        if (getConnectedPeerNodeIds(messageRouter, this.nodeId).length === 0) {
          await this.connectToClusterNodes();
        }
        if (getConnectedPeerNodeIds(messageRouter, this.nodeId).length > 0) {
          break;
        }

        if (remainingMs <= 0) {
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
          1,
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
          Math.max(1, Math.floor(baseDelayMs * backoffMultiplier)),
          maxDelayMs,
        );
      }
    }

    markRetryableSeedWebSocketTimeout(lastError, maxDelayMs);
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
    const config = typeof this.delegates.getConfig === 'function' ?
      this.delegates.getConfig() || {} :
      {};
    const retryTimeoutMs =
      Number.isFinite(config.leadershipWaitTimeoutMs) ?
        Math.max(1, Math.floor(config.leadershipWaitTimeoutMs)) :
        0;
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
      config.leadershipWaitBackoffMultiplier > 1 ?
        config.leadershipWaitBackoffMultiplier :
        2;

    return {
      retryTimeoutMs,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
    };
  }

  /**
   * Attempt peer mesh connectivity for one resolved node snapshot.
   * @param {Object} options
   * @param {Array<Object>} options.otherNodes
   * @param {Object|null} options.bootstrapResponse
   * @param {Object|null} options.systemTableCache
   * @param {Object} options.messageRouter
   * @param {Object} options.logger
   * @param {Object} options.bootstrapAddressScope
   * @return {Promise<{missingEndpointNodeIds: string[]}>}
   * @private
   */
  async connectToClusterNodesFromSnapshot(options = {}) {
    const otherNodes = Array.isArray(options.otherNodes) ?
      options.otherNodes :
      [];
    const messageRouter = options.messageRouter;
    const bootstrapResponse = options.bootstrapResponse || null;
    const systemTableCache = options.systemTableCache || null;
    const logger = options.logger;
    const bootstrapAddressScope = options.bootstrapAddressScope ||
      buildBootstrapAddressScope(MESH_BOOTSTRAP_ADDRESS_SCOPE_STATE.NONE);
    const missingEndpointNodeIds = [];
    const reusableConnectionStates =
      options.requireReadyConnections === true ?
        MESH_CONNECTED_OR_CONNECTING_STATES :
        MESH_CONNECTED_OR_IN_FLIGHT_STATES;

    const connectionResults = await Promise.all(otherNodes.map(async (node) => {
      const targetNodeId = node.node_id;
      const nodeAddress = node.node_address;

      const connectionState =
        typeof messageRouter.getConnectionState === 'function' ?
          messageRouter.getConnectionState(targetNodeId) :
          messageRouter.nodeConnections?.get(targetNodeId)?.state ||
            null;

      if (reusableConnectionStates.has(connectionState)) {
        return null;
      }

      const addressBootstrapResponse = resolveBootstrapResponseForMeshAddress(
        bootstrapResponse,
        bootstrapAddressScope,
        targetNodeId,
      );
      const wsAddressResolution = resolveNodeWebSocketAddress({
        targetNodeId,
        bootstrapResponse: addressBootstrapResponse,
        systemTableCache,
      });
      if (wsAddressResolution.state !==
          NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED) {
        logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          nodeAddress,
          error: ERR_MISSING_WS_ENDPOINT,
        });
        return {
          targetNodeId,
          missingEndpoint: true,
        };
      }
      const wsAddress = wsAddressResolution.address;

      try {
        await messageRouter.connectToNode(targetNodeId, wsAddress);
        logger.info(JOINING_LOG_MSG.CLUSTER_NODE_CONNECTED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
        });
      } catch (error) {
        logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
          error: error.message,
        });
      }
      return null;
    }));

    for (const result of connectionResults) {
      if (result?.missingEndpoint === true &&
          typeof result.targetNodeId === 'string' &&
          result.targetNodeId.length > 0) {
        missingEndpointNodeIds.push(result.targetNodeId);
      }
    }

    return {
      missingEndpointNodeIds,
    };
  }

  /**
   * Refresh mesh-connectivity authority when endpoint rows are missing.
   * @param {string[]} missingEndpointNodeIds
   * @return {Promise<boolean>}
   * @private
   */
  async repairMeshConnectivityAuthority(missingEndpointNodeIds) {
    if (typeof this.delegates.repairMeshConnectivityAuthorityIfNeeded !==
        'function') {
      return false;
    }
    return this.delegates.repairMeshConnectivityAuthorityIfNeeded(
      missingEndpointNodeIds,
    );
  }

  /**
   * Connect to all cluster nodes for full mesh connectivity.
   * Skips nodes we're already connected to (checked via messageRouter).
   * All nodes are equal peers - no special treatment for any node.
   * @return {Promise<void>}
   */
  async connectToClusterNodes(options = {}) {
    const logger = this.delegates.getLogger();
    const messageRouter = this.delegates.getMessageRouter();
    const bootstrapResponse =
      this.delegates.getBootstrapResponse?.() || null;
    const bootstrapAdmissionPeerHintNodeIds =
      resolveBootstrapAdmissionPeerHintNodeIds(bootstrapResponse);
    const systemTableCache =
      this.delegates.getSystemTableCache?.() || null;
    let attemptedAuthorityRepair = false;

    while (true) {
      const {
        source: nodeSource,
        rows: nodesSnapshot,
        bootstrapSupplementNodeIds,
      } = this.delegates.resolveMeshConnectivityNodeRows();
      const bootstrapAddressScope = resolveBootstrapAddressScope(
        nodeSource,
        Array.isArray(bootstrapSupplementNodeIds) ?
          bootstrapSupplementNodeIds :
          [],
        bootstrapAdmissionPeerHintNodeIds,
      );

      if (!Array.isArray(nodesSnapshot) ||
          nodesSnapshot.length === 0) {
        return;
      }

      this.delegates.setLastClusterMeshSignature(
        this.delegates.buildClusterMeshSignature(nodesSnapshot),
      );

      const otherNodes = nodesSnapshot.filter((node) => {
        const nodeId = node?.node_id;
        return nodeId && nodeId !== this.nodeId;
      });

      if (otherNodes.length === 0) {
        return;
      }

      logger.info(JOINING_LOG_MSG.CONNECTING_TO_CLUSTER_NODES, {
        nodeId: this.nodeId,
        nodeSource,
        otherNodeCount: otherNodes.length,
        otherNodeIds: otherNodes.map((n) => n.node_id),
      });

      const {
        missingEndpointNodeIds,
      } = await this.connectToClusterNodesFromSnapshot({
        otherNodes,
        bootstrapResponse,
        bootstrapAddressScope,
        systemTableCache,
        messageRouter,
        logger,
        requireReadyConnections: options.requireReadyConnections === true,
      });

      if (!attemptedAuthorityRepair &&
          missingEndpointNodeIds.length > 0 &&
          await this.repairMeshConnectivityAuthority(
            missingEndpointNodeIds,
          )) {
        attemptedAuthorityRepair = true;
        continue;
      }

      logger.info(JOINING_LOG_MSG.CLUSTER_CONNECTIONS_COMPLETE, {
        nodeId: this.nodeId,
        connectedNodes: messageRouter.getConnectedNodes?.() ||
          Array.from(
            messageRouter.nodeConnections?.keys() || [],
          ),
      });
      return;
    }
  }
}

/**
 * Derive WebSocket address from node REST address.
 * Pure function — no instance state needed.
 * @param {string} nodeAddress - Node address in format "hostname:port".
 * @return {string|null} WebSocket address or null if cannot derive.
 */
function deriveWsAddressFromNodeAddress(nodeAddress) {
  return deriveTransportWebSocketAddress(nodeAddress);
}

export {
  ConnectWebSocketPhase,
  deriveWsAddressFromNodeAddress,
};
