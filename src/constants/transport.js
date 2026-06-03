import {
  ADDRESS,
  ENTITY_TYPE,
  HOST,
  NUM,
  PROTOCOL,
  STRING,
  TYPEOF,
} from './index.js';
import {ENTRYPOINT_DEFAULT} from './entrypoint.js';

const CONNECTION_STATE = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed',
});

const ROUTER_MESSAGE_TYPE = Object.freeze({
  SERVICE_MESSAGE: 'service_message',
  SERVICE_RESPONSE: 'service_response',
  ACK: 'ack',
  IDENTIFY: 'identify',
  PING: 'ping',
  PONG: 'pong',
  JOIN_REQUEST: 'join_request',
  JOIN_RESPONSE: 'join_response',
  JOIN_COMPLETE: 'join_complete',
  JOIN_COMPLETE_ACK: 'join_complete_ack',
});

const WS_MESSAGE_TYPE = Object.freeze({
  RAFT_MESSAGE: 'raft_message',
  SERVICE_MESSAGE: 'service_message',
  SERVICE_RESPONSE: 'service_response',
  PING: 'ping',
  PONG: 'pong',
  ACK: 'ack',
  IDENTIFY: 'identify',
});

const TRANSPORT_CONFIG_KEY = Object.freeze({
  WS_HOST: 'transport.wsHost',
  MESSAGE_TIMEOUT_MS: 'transport.messageTimeoutMs',
  ACK_TIMEOUT_QUARANTINE_THRESHOLD:
    'transport.ackTimeoutQuarantineThreshold',
  PING_TIMEOUT_MS: 'transport.pingTimeoutMs',
  RECONNECT_INTERVAL_MS: 'transport.reconnectIntervalMs',
  RECONNECT_MAX_ATTEMPTS: 'transport.reconnectMaxAttempts',
  PING_INTERVAL_MS: 'transport.pingIntervalMs',
  RECONNECT_BACKOFF_MULTIPLIER: 'transport.reconnectBackoffMultiplier',
  OUTBOUND_QUEUE_MAX_CONCURRENT: 'transport.outboundQueueMaxConcurrent',
  OUTBOUND_QUEUE_MAX_PENDING: 'transport.outboundQueueMaxPending',
  OUTBOUND_QUEUE_CRITICAL_RESERVE: 'transport.outboundQueueCriticalReserve',
  OUTBOUND_QUEUE_READINESS_RESERVE: 'transport.outboundQueueReadinessReserve',
  CONNECTION_POOL_TTL_MS: 'transport.connectionPoolTtlMs',
  CONNECTION_POOL_CLEANUP_INTERVAL_MS: 'transport.connectionPoolCleanupIntervalMs',
});

const TRANSPORT_DEFAULT = Object.freeze({
  WS_PORT: ENTRYPOINT_DEFAULT.REST_API_PORT + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET,
  WS_HOST: HOST.LOCALHOST,
  WS_PROTOCOL: PROTOCOL.WS,
  LOCAL_ADDRESS_PREFIX: 'ws-',
  MESSAGE_TIMEOUT_MS: 5000,
  ACK_TIMEOUT_QUARANTINE_THRESHOLD: 2,
  PING_TIMEOUT_MS: 1000,
  RECONNECT_INTERVAL_MS: 1000,
  RECONNECT_MAX_ATTEMPTS: 10,
  PING_INTERVAL_MS: 30000,
  RECONNECT_BACKOFF_MULTIPLIER: 1.5,
  OUTBOUND_QUEUE_CONCURRENCY: 32,
  OUTBOUND_QUEUE_MAX_PENDING: 64,
  OUTBOUND_QUEUE_CRITICAL_RESERVE: NUM.SIXTEEN,
  OUTBOUND_QUEUE_READINESS_RESERVE: NUM.ZERO,
  // Production node routers reserve outbound headroom so readiness/publication
  // reads survive CRITICAL recovery backpressure during rolling restart. The
  // global default above stays 0 so isolated queue-mechanics unit tests keep
  // their critical-capacity assumptions; production opts in explicitly via the
  // MessageRouter constructor (see bootstrap/shared/message-router-setup.js).
  PRODUCTION_OUTBOUND_QUEUE_READINESS_RESERVE: NUM.EIGHT,
  SHUTDOWN_WAIT_MS: 100,
  RPC_TIMEOUT_MS: 30000,
  EMPTY: STRING.EMPTY,
  CONNECTION_POOL_TTL_MS: 300000, // 5 minutes
  CONNECTION_POOL_CLEANUP_INTERVAL_MS: 60000, // 1 minute
  // Backoff hint surfaced on outbound-queue backpressure errors so a shed
  // CRITICAL recovery handoff yields to the readiness reserve and retries with
  // a real delay instead of hammering the queue at the base cadence.
  OUTBOUND_QUEUE_BACKPRESSURE_RETRY_AFTER_MS: 500,
});

const OUTBOUND_DELIVERY_PRIORITY = Object.freeze({
  CRITICAL: 'critical',
  READINESS: 'readiness',
  BACKGROUND: 'background',
});

const TRANSPORT_STRING = Object.freeze({
  NEWLINE: '\n',
});

const TRANSPORT_FORMAT = Object.freeze({
  buildWebSocketAddress: (host, port) =>
    `${TRANSPORT_DEFAULT.WS_PROTOCOL}${host}:${port}`,
  buildDefaultNodeAddress: (port) =>
    `${TRANSPORT_DEFAULT.WS_PROTOCOL}${TRANSPORT_DEFAULT.WS_HOST}:${port}`,
  buildLocalAddress: (nodeId) =>
    `${TRANSPORT_DEFAULT.LOCAL_ADDRESS_PREFIX}${nodeId}`,
});

/**
 * Normalize a node address to a WebSocket address.
 *
 * If the address already starts with ws:// or wss://, return it as-is.
 * If it is a bare host:port (REST API address), derive the WebSocket
 * address by applying the standard WS_PORT_OFFSET.
 * Returns null for addresses that cannot be normalized.
 *
 * @param {string} nodeAddress - Raw node address.
 * @return {string|null} WebSocket address or null.
 */
function normalizeToWebSocketAddress(nodeAddress) {
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
  const restPort = Number(
    nodeAddress.substring(colonIndex + NUM.ONE),
  );
  if (!hostname || !Number.isFinite(restPort) ||
      restPort <= NUM.ZERO) {
    return null;
  }

  const wsPort = restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
  return `${PROTOCOL.WS}${hostname}` +
    `${ADDRESS.PORT_SEPARATOR}${wsPort}`;
}

const TRANSPORT_EVENT = Object.freeze({
  INITIALIZED: 'initialized',
  CONNECTION: 'connection',
  LISTENING: 'listening',
  ERROR: 'error',
  MESSAGE: 'message',
  CLOSE: 'close',
  OPEN: 'open',
  CONNECTION_ESTABLISHED: 'connectionEstablished',
  CONNECTION_CLOSED: 'connectionClosed',
  NODE_CONNECTED: 'nodeConnected',
  NODE_IDENTIFIED: 'nodeIdentified',
  PEER_IDENTIFIED: 'peerIdentified',
  SELF_DISCONNECT: 'selfDisconnect',
  TIMEOUT: 'timeout',
  RESPONSE: 'response',
  SHUTDOWN: 'shutdown',
});

const TRANSPORT_SUBSYSTEM = Object.freeze({
  ROUTER: 'message-router',
  WEBSOCKET: 'websocket-transport',
  RPC: 'rpc-client',
});

const ROUTER_VALID_ENTITY_TYPES = Object.freeze([
  ENTITY_TYPE.MESSAGE_GROUP,
  ENTITY_TYPE.PARTITION,
  ENTITY_TYPE.LIFECYCLE,
  ENTITY_TYPE.SERVICE,
  ENTITY_TYPE.BOOTSTRAP,
]);

const ROUTER_EXPECTED_ENTITY_TYPES = Object.freeze([
  ENTITY_TYPE.MESSAGE_GROUP,
  ENTITY_TYPE.PARTITION,
  ENTITY_TYPE.LIFECYCLE,
  ENTITY_TYPE.SERVICE,
  ENTITY_TYPE.BOOTSTRAP,
]);

const ROUTER_ADDRESS = Object.freeze({
  SEPARATOR: ADDRESS.SEPARATOR,
  SERVICE_ID: 'router',
  buildSourceAddress: (nodeId) =>
    `${nodeId}${ADDRESS.SEPARATOR}${ROUTER_ADDRESS.SERVICE_ID}`,
});

const TRANSPORT_ERROR_MSG = Object.freeze({
  HANDLER_MUST_BE_FUNCTION: 'Handler must be a function',
  MESSAGE_NOT_ACKNOWLEDGED: 'Message not acknowledged',
  MESSAGE_TIMEOUT: 'Message timeout',
});

const ROUTER_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing MessageRouter',
  INVALID_ADDRESS: 'Invalid target address',
  SENDING_MESSAGE: 'Sending message',
  SELF_CONNECTION_FAILED: 'Failed to establish self-connection',
  WS_SERVER_LISTENING: 'MessageRouter WebSocket server listening',
  WS_SERVER_ERROR: 'MessageRouter WebSocket server error',
  INCOMING_CONNECTION: 'Incoming WebSocket connection',
  WS_CONNECTION_ERROR: 'WebSocket connection error',
  SELF_CONNECTION_START: 'Establishing self-connection',
  ALREADY_CONNECTED: 'Already connected to node',
  CONNECTING: 'Connecting to node',
  CONNECTED: 'Connected to node',
  WS_ERROR: 'WebSocket error',
  MESSAGE_RECEIVED: 'Received message',
  MESSAGE_UNKNOWN: 'Unknown message type',
  MESSAGE_PARSE_FAILED: 'Failed to parse message',
  IDENTIFICATION_MISSING_FIELDS: 'Identification missing required fields',
  FAILED_CLOSE_UNIDENTIFIED: 'Failed to close unidentified connection',
  IDENTIFICATION_RECEIVED: 'Received identification from remote node',
  FAILED_TERMINATE_EXISTING: 'Failed to terminate existing connection',
  REKEYED_CONNECTION: 'Re-keyed incoming connection to node ID',
  KEEP_ORIGINAL_CONNECTION: 'Keeping incoming connection under original ID',
  SELF_CONNECTION_ALREADY_REGISTERED: 'self-connection already registered',
  SERVICE_MESSAGE_HANDLING: 'Handling service message',
  SERVICE_RESPONSE_RECEIVED: 'Received service response',
  SERVICE_RESPONSE_NO_PENDING: 'No pending service response request',
  SERVICE_RESPONSE_ERROR: 'Service response indicated error',
  SERVICE_RESPONSE_SENT: 'Service response sent',
  MESSAGE_NOT_ACKED: 'Message not acknowledged',
  CONNECTION_CLOSED: 'Connection closed',
  SELF_CONNECTION_LOST: 'Self-connection lost - fatal error',
  NO_SELF_CONNECTION: 'No self-connection available for local delivery',
  MAX_RECONNECTS_REACHED: 'Max reconnection attempts reached',
  SCHEDULING_RECONNECT: 'Scheduling reconnection',
  RECONNECT_FAILED: 'Reconnection failed',
  HANDLER_REGISTERED: 'Registered handler',
  HANDLER_UNREGISTERED: 'Unregistered handler',
  NO_TARGET_CONNECTION: 'No connection to target node for message delivery',
  SHUTTING_DOWN: 'Shutting down MessageRouter',
  TRANSPORT_REGISTRY_SET: 'TransportRegistry configured for MessageRouter',
  TRANSPORT_DELIVERY_START: 'Starting transport-based delivery',
  TRANSPORT_ENDPOINT_SELECTED: 'Selected endpoint for delivery',
  TRANSPORT_DELIVERY_SUCCESS: 'Transport delivery succeeded',
  TRANSPORT_DELIVERY_FAILED: 'Transport delivery failed, trying fallback',
  TRANSPORT_ALL_FAILED: 'All transport endpoints failed',
  TRANSPORT_NO_ENDPOINTS: 'No endpoints available for node',
  TRANSPORT_FALLBACK_WS: 'Falling back to WebSocket delivery',
  JOIN_REQUEST_RECEIVED: 'Join request received',
  JOIN_RESPONSE_SENT: 'Join response sent',
  JOIN_REQUEST_FAILED: 'Failed to process join request',
  JOIN_COMPLETE_RECEIVED: 'Join complete received',
  JOIN_COMPLETE_ACK_SENT: 'Join complete acknowledgment sent',
  JOIN_COMPLETE_FAILED: 'Failed to process join complete message',
  RAFT_DIRECT_DELIVERY: 'Delivering raft packet directly',
  RAFT_DIRECT_DELIVERY_FAILED: 'Failed to deliver raft packet directly',
});

const ROUTER_ERROR_MSG = Object.freeze({
  invalidAddressFormat: (address) =>
    `Invalid address format: ${address}. ` +
    'Expected format: nodeId/entityType/entityId where entityType is one of: ' +
    `${ROUTER_EXPECTED_ENTITY_TYPES.join(', ')}`,
  noConnectionToNode: (nodeId) => `No connection to node ${nodeId}`,
  connectionClosed: (nodeId) => `Connection to node ${nodeId} closed`,
  selfConnectionFailed: (message) => `Self-connection failed: ${message}`,
  noHandlerForAddress: (address) => `No handler registered for address ${address}`,
  QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED:
    'Query/data-plane message-group transport is not configured',
  PENDING_RESPONSE_TIMEOUT: 'Pending response timeout',
  SHUTDOWN: 'Router shutdown',
  ALL_TRANSPORTS_FAILED: 'All transport endpoints failed',
  NO_ENDPOINTS_FOR_NODE: 'No endpoints available for node',
  noEndpointsForNode: (nodeId) => `No endpoints available for node ${nodeId}`,
  outboundQueueBackpressured: (nodeId, maxPending) =>
    `Outbound queue for node ${nodeId} is saturated ` +
    `(maxPending=${maxPending})`,
});

const WS_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing WebSocketTransport',
  SERVER_LISTENING: 'WebSocket server listening',
  SERVER_ERROR: 'WebSocket server error',
  INCOMING_CONNECTION: 'Incoming WebSocket connection',
  CONNECTION_ERROR: 'WebSocket connection error',
  ALREADY_CONNECTED: 'Already connected to peer',
  CONNECTING: 'Connecting to peer',
  CONNECTED: 'Connected to peer',
  WS_ERROR: 'WebSocket error',
  MESSAGE_RECEIVED: 'Received message',
  MESSAGE_UNKNOWN: 'Unknown message type',
  MESSAGE_PARSE_FAILED: 'Failed to parse message',
  IDENTIFICATION_RECEIVED: 'Received identification',
  MESSAGE_NOT_ACKED: 'Message not acknowledged',
  CONNECTION_CLOSED: 'Connection closed',
  MAX_RECONNECTS_REACHED: 'Max reconnection attempts reached',
  SCHEDULING_RECONNECT: 'Scheduling reconnection',
  RECONNECT_FAILED: 'Reconnection failed',
  HANDLER_REGISTERED: 'Registered message handler',
  NO_TARGET_CONNECTION: 'No connection to target node',
  SHUTTING_DOWN: 'Shutting down WebSocketTransport',
});

const WS_ERROR_MSG = Object.freeze({
  NO_CONNECTION: 'No connection to target node',
  SHUTDOWN: 'Transport shutdown',
});

const RPC_LOG_MSG = Object.freeze({
  CALL_INITIATED: 'RPC call initiated',
  TIMEOUT: 'RPC timeout',
  SEND_FAILED: 'RPC send failed',
  NO_PENDING: 'No pending request for correlation ID',
  RESPONSE_RECEIVED: 'RPC response received',
  REQUEST_CANCELLED: 'RPC request cancelled',
  SHUTTING_DOWN: 'Shutting down RPC client',
});

const RPC_ERROR_MSG = Object.freeze({
  NO_MESSAGE_GROUP: 'RPCClient: No message group service configured',
  timeout: (timeoutMs) => `RPC timeout after ${timeoutMs}ms`,
  cancelled: (reason) => `RPC cancelled: ${reason}`,
  SHUTDOWN: 'RPC client shutdown',
});

const RPC_DEFAULT = Object.freeze({
  TIMEOUT_MS: TRANSPORT_DEFAULT.RPC_TIMEOUT_MS,
  CANCEL_REASON: 'Cancelled',
});

const TRANSPORT_TYPEOF = Object.freeze({
  FUNCTION: TYPEOF.FUNCTION,
  OBJECT: TYPEOF.OBJECT,
  STRING: TYPEOF.STRING,
});

const TRANSPORT_NUM = Object.freeze({
  ZERO: NUM.ZERO,
  ONE: NUM.ONE,
  TWO: NUM.TWO,
  THREE: NUM.THREE,
  FOUR: NUM.FOUR,
  FIVE: NUM.FIVE,
  SIX: NUM.SIX,
});

const TRANSPORT_METRIC = Object.freeze({
  DELIVER_SUCCESS_SAMPLE_EVERY: NUM.TWO_HUNDRED_FIFTY_SIX,
  DELIVER_FAULT_SAMPLE_EVERY: NUM.TWO_HUNDRED_FIFTY_SIX,
  DELIVER_SLOW_THRESHOLD_MS: 25,
  DELIVER_QUEUE_BACKPRESSURE_THRESHOLD: NUM.THIRTY,
  DELIVER_QUEUE_CHANGE_THRESHOLD: NUM.SIXTEEN,
});

const TRANSPORT_METRIC_TRIGGER = Object.freeze({
  SAMPLE: 'sample',
  SLOW: 'slow',
  BACKPRESSURE: 'backpressure',
  QUEUE_DRAINED: 'queue_drained',
  FAULT: 'fault',
});

export {
  CONNECTION_STATE,
  OUTBOUND_DELIVERY_PRIORITY,
  ROUTER_MESSAGE_TYPE,
  ROUTER_VALID_ENTITY_TYPES,
  ROUTER_EXPECTED_ENTITY_TYPES,
  ROUTER_ADDRESS,
  ROUTER_LOG_MSG,
  ROUTER_ERROR_MSG,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
  TRANSPORT_METRIC,
  TRANSPORT_METRIC_TRIGGER,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_NUM,
  TRANSPORT_STRING,
  TRANSPORT_SUBSYSTEM,
  TRANSPORT_TYPEOF,
  WS_LOG_MSG,
  WS_ERROR_MSG,
  WS_MESSAGE_TYPE,
  RPC_DEFAULT,
  RPC_LOG_MSG,
  RPC_ERROR_MSG,
  normalizeToWebSocketAddress,
};
