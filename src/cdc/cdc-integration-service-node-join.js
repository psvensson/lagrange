import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';

const {
  ADDRESS,
  CDC_ERROR_MSG,
  CDC_EVENT,
  CDC_INTEGRATION_SERVICE_ERROR,
  CDC_LOG_MSG,
  CDC_OPERATION,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  COLUMN,
  ENTRYPOINT_DEFAULT,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  NUM,
  PROTOCOL,
  STATE,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  buildCDCNodeJoinedResult,
  resolveNodeWebSocketAddress,
} = CDC_INTEGRATION_SERVICE_SHARED;

/**
 * Derive WebSocket address from node REST address.
 * @param {string} nodeAddress - Node address in format "hostname:port".
 * @return {string|null} WebSocket address or null if cannot derive.
 */
export function deriveWsAddressFromNodeAddress(nodeAddress) {
  if (!nodeAddress || typeof nodeAddress !== TYPEOF.STRING) {
    return null;
  }

  // Parse hostname:port format
  const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
  if (colonIndex === NUM.NEGATIVE_ONE || colonIndex === NUM.ZERO) {
    // No colon found or colon at start (empty hostname)
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
 * Handle node joined CDC event for mesh connectivity.
 * @param {Object} context - Service context (providing emit, logger, and nodeId).
 * @param {Object} cdcEvent - The CDC event object.
 * @return {Promise<Object>} Node joined handling result.
 */
export async function handleNodeJoinedCDC(context, cdcEvent) {
  // Validate cdcEvent
  if (!cdcEvent || typeof cdcEvent !== TYPEOF.OBJECT) {
    return {
      processed: false,
      error: CDC_ERROR_MSG.INVALID_EVENT,
    };
  }

  // Check if this is a nodes table INSERT event
  const tableName = cdcEvent.tableName;
  if (tableName !== SYSTEM_TABLE_NAME.NODES) {
    return {
      processed: false,
      error: `${CDC_ERROR_MSG.NOT_NODES_TABLE_PREFIX}'${tableName}'`,
    };
  }

  // Only process INSERT operations (new nodes joining)
  const operation = cdcEvent.operation;
  if (operation !== CDC_OPERATION.INSERT) {
    return {
      processed: false,
      error: CDC_ERROR_MSG.NOT_INSERT_OPERATION,
    };
  }

  // Extract node data
  const targetNodeId = cdcEvent.data?.[COLUMN.NODE_ID];
  const nodeAddress = cdcEvent.data?.[COLUMN.NODE_ADDRESS];
  if (!targetNodeId) {
    return {
      processed: false,
      error: CDC_ERROR_MSG.NODE_ID_MISSING,
    };
  }

  // Skip if this is our own node
  if (targetNodeId === context.nodeId) {
    context.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_SELF, {
      nodeId: context.nodeId,
      targetNodeId,
    });
    return buildCDCNodeJoinedResult({
      processed: true,
      nodeId: targetNodeId,
      connected: false,
      skipped: true,
      reason: CDC_SKIP_REASON.SELF,
    });
  }

  // Skip if no message router is set
  if (!context.messageRouter) {
    return {
      processed: false,
      error: CDC_ERROR_MSG.MESSAGE_ROUTER_NOT_SET,
    };
  }
  const connectionState =
    typeof context.messageRouter.getConnectionState === TYPEOF.FUNCTION ?
      context.messageRouter.getConnectionState(targetNodeId) :
      context.messageRouter.nodeConnections?.get(targetNodeId)?.state || null;
  if (connectionState === STATE.CONNECTED) {
    context.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_CONNECTED, {
      nodeId: context.nodeId,
      targetNodeId,
    });
    return buildCDCNodeJoinedResult({
      processed: true,
      nodeId: targetNodeId,
      connected: false,
      skipped: true,
      reason: CDC_SKIP_REASON.ALREADY_CONNECTED,
    });
  }
  const wsAddressResolution = resolveNodeWebSocketAddress({
    targetNodeId,
    systemTableCache: context.systemTableCache,
  });
  if (
    wsAddressResolution.state !==
    NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED
  ) {
    context.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
      nodeId: context.nodeId,
      targetNodeId,
      nodeAddress,
      error:
        CDC_INTEGRATION_SERVICE_ERROR.MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS,
    });
    return buildCDCNodeJoinedResult({
      processed: false,
      nodeId: targetNodeId,
      error:
        CDC_INTEGRATION_SERVICE_ERROR.MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS,
    });
  }
  const wsAddress = wsAddressResolution.address;
  context.logger.info(CDC_LOG_MSG.NEW_NODE_DETECTED, {
    nodeId: context.nodeId,
    targetNodeId,
    wsAddress,
  });

  // Establish connection to the new node asynchronously
  const connectPromise = context.messageRouter.connectToNode(targetNodeId, wsAddress)
    .then(() => {
      context.logger.info(CDC_LOG_MSG.NEW_NODE_CONNECTED, {
        nodeId: context.nodeId,
        targetNodeId,
        wsAddress,
      });

      // Emit nodeJoined event
      context.emit(CDC_EVENT.NODE_JOINED, {
        nodeId: targetNodeId,
        nodeAddress,
        wsAddress,
        timestamp: Date.now(),
        source: CDC_SOURCE.CDC,
      });
      return {success: true};
    })
    .catch((connectError) => {
      // Log but don't fail - the node might be temporarily unavailable
      // Raft will handle retries and leader election
      context.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: context.nodeId,
        targetNodeId,
        wsAddress,
        error: connectError.message,
      });
      return {success: false, error: connectError};
    });

  const result = buildCDCNodeJoinedResult({
    processed: true,
    nodeId: targetNodeId,
    connected: true,
    wsAddress,
  });
  result.connectPromise = connectPromise;
  return result;
}
