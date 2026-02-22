import {DEFAULT_HEARTBEAT_INTERVAL_MS} from '../control-plane/control-plane-constants.js';
import {DEFAULT_REPLICA_STAGGER_DELAY_MS} from './bootstrap-constants.js';

const JOINING_DEFAULT = Object.freeze({
  httpTimeoutMs: 10000,
  leadershipWaitTimeoutMs: 30000,
  leadershipWaitInitialDelayMs: 100,
  leadershipWaitMaxDelayMs: 5000,
  leadershipWaitBackoffMultiplier: 2,
  leadershipWaitJitterRatio: 0.2,
  replicaStaggerDelayMs: DEFAULT_REPLICA_STAGGER_DELAY_MS,
  heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
  wsPort: null,
});

const JOINING_LOG_MSG = Object.freeze({
  STARTING: 'Starting node joining process',
  COMPLETED: 'Node joining completed successfully',
  READY_SIGNAL_ROUTER_MISSING: 'Cannot signal readiness without messageRouter',
  READY_SIGNAL_TARGET_MISSING: 'No control plane target address available for readiness',
  READY_SIGNAL_SUCCESS: 'Signaled readiness to seed node',
  READY_SIGNAL_NOT_ACK: 'Seed node did not acknowledge readiness',
  READY_SIGNAL_FAILED: 'Failed to signal readiness to seed node',
  HEARTBEAT_FAILED: 'Failed to send heartbeat to control plane',
  CONTROL_PLANE_TARGET_UPDATED: 'Control plane target address updated on leadership change',
  PHASE_STARTING: 'Starting joining phase',
  PHASE_COMPLETED: 'Joining phase completed',
  PHASE_FAILED: 'Joining phase failed',
  SEED_CONTACTING: 'Contacting seed node',
  SEED_CONTACT_RETRYING: 'Retrying seed bootstrap request',
  SEED_CONTACT_TERMINAL: 'Seed bootstrap request failed with terminal error',
  BOOTSTRAP_RESPONSE_RECEIVED: 'Received bootstrap response',
  SEED_CONTACT_FAILED: 'Failed to contact seed node',
  CONNECTING_TO_CLUSTER_NODES: 'Connecting to other cluster nodes',
  CLUSTER_NODE_CONNECTED: 'Connected to cluster node',
  CLUSTER_NODE_CONNECT_FAILED: 'Failed to connect to cluster node',
  CLUSTER_CONNECTIONS_COMPLETE: 'Cluster node connections complete',
  SELF_HOSTED_CREATING: 'Creating self-hosted message group',
  MESSAGE_ROUTER_REQUIRED: 'MessageRouter must be initialized before creating message groups',
  MESSAGE_GROUP_REPLICA_CREATED: 'Message group replica created',
  MESSAGE_GROUP_ELECTIONS_START: 'Starting elections for message group replicas',
  SELF_HOSTED_CREATED: 'Self-hosted message group created',
  JOIN_ASSIGNMENT_RECEIVED: '[JOIN-DEBUG] phaseJoinExistingMessageGroup - received assignment',
  JOIN_CREATING_WITH_PEERS: '[JOIN-DEBUG] Creating MessageGroupService with peers',
  JOIN_MESSAGE_RECEIVED: '[JOIN-DEBUG] Message received at joining node',
  JOIN_HANDLER_REGISTERED: '[JOIN-DEBUG] Registered message handler',
  JOIN_SERVICE_INITIALIZED: '[JOIN-DEBUG] MessageGroupService initialized',
  JOINED_EXISTING_GROUP: '[JOIN-DEBUG] Joined existing message group',
  REGISTERING_MESSAGE_GROUP_SERVICE: 'Registering message group service in cluster',
  MESSAGE_GROUP_REGISTER_NON_SUCCESS: 'Message group service registration returned non-success',
  MESSAGE_GROUP_REGISTERED: 'Message group service registered in cluster',
  MESSAGE_GROUP_REGISTER_FAILED: 'Failed to register message group service in cluster',
  WAITING_LEADERSHIP: 'Waiting for message group leadership',
  LEADERSHIP_ESTABLISHED: 'Message group leadership established',
  WS_SELF_CONNECTED: 'WebSocket server started and self-connection established',
  ROUTER_INIT_FAILED: 'MessageRouter initialization failed',
  RUNTIME_WIRING_READY: 'Runtime startup wiring initialized',
  SEED_WS_CONNECTING: '[JOIN-DEBUG] Connecting to seed node via WebSocket',
  SEED_WS_CONNECTED: '[JOIN-DEBUG] Connected to seed node via WebSocket',
  SEED_WS_CONNECT_FAILED: '[JOIN-DEBUG] Failed to connect to seed node via WebSocket',
  SEED_WS_MISSING: '[JOIN-DEBUG] No seed node WebSocket address provided',
  NODE_STATE_UPDATE_SENT: 'Sent NODE_STATE_UPDATE to control plane',
  NODE_STATE_UPDATE_FAILED: 'Failed to send NODE_STATE_UPDATE to control plane',
  WS_INFRA_READY: 'WebSocket infrastructure setup complete',
  STATE_QUERY_START: 'Querying system state',
  STATE_QUERY_HYDRATING_CACHE: 'Hydrating system table cache',
  STATE_QUERY_HYDRATION_FAILED: 'Failed to hydrate system table cache',
  STATE_QUERY_HYDRATION_COMPLETE: 'System table cache hydration complete',
  STATE_QUERY_TABLE: 'Would query system table',
  STATE_QUERY_COMPLETE: 'System state query complete',
  JOIN_FAILED: 'Node joining failed',
  CLEANUP_START: 'Cleaning up partially initialized services',
  PARTITION_CLEANED: 'Partition service cleaned up',
  PARTITION_CLEAN_FAILED: 'Error cleaning up partition service',
  MESSAGE_GROUP_CLEANED: 'Message group service cleaned up',
  MESSAGE_GROUP_CLEAN_FAILED: 'Error cleaning up message group service',
  CLEANUP_COMPLETE: 'Cleanup complete',
  REPLICA_HANDLER_ROUTER_MISSING: 'MessageRouter not available for ReplicaHandler',
  REPLICA_HANDLER_ROUTER_REQUIRED: 'MessageRouter must be initialized before ReplicaHandler',
  CDC_EVENT_RECEIVED: 'CDC event received from partition on joining node',
  CDC_SUBSCRIPTION_REGISTERED: 'CDC subscription set up for partition on joining node',
  CDC_SUBSCRIPTION_FAILED: 'CDC subscription failed for message group service',
  LATENCY_TOPOLOGY_READY: 'Latency topology services initialized for joining node',
  LATENCY_TOPOLOGY_STARTED: 'Latency topology lifecycle started for joining node',
  REPLICA_HANDLER_READY: 'ReplicaHandler initialized',
  CDC_INTEGRATION_CREATE: 'Creating CDC integration service for joining node',
  ENDPOINT_REGISTERING: 'Registering node endpoint in cluster',
  ENDPOINT_REGISTERED: 'Node endpoint registered in cluster',
  ENDPOINT_REGISTER_FAILED: 'Failed to register node endpoint in cluster',
  FAILED_JOIN_CLEANUP_START:
    'Starting failed join cleanup in reverse phase order',
  FAILED_JOIN_CLEANUP_QUERYING_STATE:
    'Removing node and service entries during failed join cleanup',
  FAILED_JOIN_CLEANUP_QUERYING_STATE_DONE:
    'Node and service entries removed during failed join cleanup',
  FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR:
    'Error removing entries during failed join cleanup',
  FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP:
    'Stopping message group services during failed join cleanup',
  FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_DONE:
    'Message group services stopped during failed join cleanup',
  FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_ERROR:
    'Error stopping message group services during failed join cleanup',
  FAILED_JOIN_CLEANUP_MESSAGE_GROUP:
    'Stopping message group replicas during failed join cleanup',
  FAILED_JOIN_CLEANUP_MESSAGE_GROUP_DONE:
    'Message group replicas stopped during failed join cleanup',
  FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR:
    'Error stopping message group replicas during failed join cleanup',
  FAILED_JOIN_CLEANUP_WEBSOCKET:
    'Disconnecting from seed and stopping router during failed join cleanup',
  FAILED_JOIN_CLEANUP_WEBSOCKET_DONE:
    'Disconnected from seed and router stopped during failed join cleanup',
  FAILED_JOIN_CLEANUP_WEBSOCKET_ERROR:
    'Error disconnecting during failed join cleanup',
  FAILED_JOIN_CLEANUP_COMPLETE:
    'Failed join cleanup complete',
  FAILED_JOIN_CLEANUP_SUMMARY:
    'Failed join cleanup summary',
});

const JOINING_ERROR_MSG = Object.freeze({
  NODE_ADDRESS_REQUIRED: 'Node address is required',
  SEED_NODE_ADDRESS_REQUIRED: 'Seed node address is required',
  SEED_WS_ADDRESS_REQUIRED: 'Seed node WebSocket address is required',
  SEED_NODE_ID_REQUIRED: 'Seed node ID is required',
  BOOTSTRAP_REQUEST_FAILED: 'Bootstrap request failed',
  MESSAGE_ROUTER_REQUIRED: 'MessageRouter must be initialized before creating message groups',
  MOVE_REPLICA_MISSING: 'MOVE_REPLICA strategy requires replicaToMove in assignment',
  CONTROL_PLANE_TARGET_MISSING: 'No reachable control plane target address available',
  CONTROL_PLANE_SERVICE_REQUIRED: 'Control plane service must be initialized',
  MESSAGE_GROUP_LEADER_REQUIRED: 'Message group leader is required for control plane routing',
  leadershipTimeout: (timeoutMs) =>
    `Message group failed to establish leadership within ${timeoutMs}ms`,
  contactSeedFailed: (message) => `Failed to contact seed node: ${message}`,
  routerInitFailed: (message) => `MessageRouter initialization failed: ${message}`,
  STATE_QUERY_FAILED: 'State query failed',
  STATE_QUERY_CACHE_REQUIRED: 'System table cache is required for state query',
  STATE_QUERY_ENGINE_REQUIRED: 'SQL query engine is required for state query',
  STATE_QUERY_LEADERS_REQUIRED: 'Partition leaders are required for state query',
  httpStatus: (status, body) => `HTTP ${status}: ${body}`,
  httpTimeout: (timeoutMs) => `Request timeout after ${timeoutMs}ms`,
  leaderMetadataIncomplete: (details) => `Leader metadata incomplete: ${details}`,
  bootstrapNotReady: (phase) =>
    `Seed bootstrap not ready${phase ? ` (phase: ${phase})` : ''}`,
  READY_SIGNAL_NOT_ACK: 'Control plane did not acknowledge ready signal',
  controlPlaneMessageFailed: (message) => `Control plane message failed: ${message}`,
  controlPlaneCdcSubscribeFailed: (tableName, message) =>
    `CDC subscription failed for ${tableName}: ${message}`,
  REPLICA_HANDLER_ROUTER_REQUIRED: 'MessageRouter must be initialized before ReplicaHandler',
  LATENCY_TOPOLOGY_MISSING: 'Latency topology services are not initialized',
});

const JOINING_CLEANUP_STEP = Object.freeze({
  QUERYING_STATE: 'querying_state',
  WAITING_LEADERSHIP: 'waiting_leadership',
  MESSAGE_GROUP: 'message_group',
  CONNECTING_WEBSOCKET: 'connecting_websocket',
});

const JOINING_CLEANUP_RESULT = Object.freeze({
  SUCCESS: 'success',
  ERROR: 'error',
  SKIPPED: 'skipped',
});

const JOINING_ERROR_NAME = Object.freeze({
  ABORT: 'AbortError',
});

const JOINING_HTTP = Object.freeze({
  BOOTSTRAP_PATH: '/bootstrap',
  REGISTER_SERVICE_PATH: '/register-service',
  METHOD_POST: 'POST',
  HEADER_CONTENT_TYPE: 'Content-Type',
  HEADER_CONNECTION: 'Connection',
  HEADER_RETRY_AFTER: 'Retry-After',
  CONTENT_TYPE_JSON: 'application/json',
  CONNECTION_CLOSE: 'close',
});

export {
  JOINING_CLEANUP_RESULT,
  JOINING_CLEANUP_STEP,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
};
