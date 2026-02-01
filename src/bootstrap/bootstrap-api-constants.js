import {HOST, NUM, STRING} from '../constants/index.js';
import {BOOTSTRAP_LOG_PREFIX, BOOTSTRAP_SUBSYSTEM} from './bootstrap-constants.js';

const BOOTSTRAP_API_SUBSYSTEM = BOOTSTRAP_SUBSYSTEM.API;

const BOOTSTRAP_API_ROUTE = Object.freeze({
  HEALTH: '/health',
  BOOTSTRAP: '/bootstrap',
  REGISTER_SERVICE: '/register-service',
  CLUSTER_STATE: '/cluster/state',
});

const BOOTSTRAP_API_HEALTH_STATUS = 'healthy';
const BOOTSTRAP_API_MESSAGE_GROUP_PREFIX = 'mg-';

const BOOTSTRAP_API_DEFAULT = Object.freeze({
  MG_ID_LENGTH: NUM.EIGHT,
  WS_HOST: HOST.LOCALHOST,
});

const BOOTSTRAP_API_LOG_MSG = Object.freeze({
  SQL_ENGINE_SET: 'SQL query engine set for bootstrap API',
  STARTED: 'Bootstrap API started',
  RECEIVED_BOOTSTRAP_REQUEST: 'Received bootstrap request',
  VALIDATION_FAILED: 'Bootstrap request validation failed',
  CONFLICT_DETECTED: 'Bootstrap request conflict detected',
  RESPONSE_PREPARED: 'Bootstrap response prepared',
  BOOTSTRAP_FAILED: 'Bootstrap request failed',
  REGISTER_NODE_UNSUPPORTED: 'register-node endpoint is not supported',
  RECEIVED_REGISTER_SERVICE: 'Received register-service request',
  SQL_ENGINE_MISSING: 'SQL query engine not available for service registration',
  SERVICE_REGISTERED: 'Service registered in services table',
  REGISTER_SERVICE_FAILED: 'Failed to register service',
  CACHE_UNAVAILABLE_LEADER: 'System table cache not available for leader lookup',
  CACHE_UNAVAILABLE_GROUPS: 'System table cache not available for message group lookup',
  CACHE_UNAVAILABLE_PARTITIONS: 'System table cache not available for partition leader lookup',
  JOIN_ASSIGNMENT: `${BOOTSTRAP_LOG_PREFIX.JOIN_DEBUG} Determining message group assignment`,
  JOIN_MOVABLE_REPLICA:
    `${BOOTSTRAP_LOG_PREFIX.JOIN_DEBUG} Found movable replica - using MOVE_REPLICA strategy`,
  LEADERS_NOT_READY: 'Bootstrap blocked - missing raft group leaders',
  UPDATE_NODE_STATUS_UNSUPPORTED:
    'updateNodeStatus is not supported - use CDC integration service',
  SHUTDOWN: 'Bootstrap API shutdown',
  SERVER_CLOSE_ERROR: 'Bootstrap server close error',
  READY_NODES_FOR_BOOTSTRAP: 'Ready nodes for bootstrap response',
});

const BOOTSTRAP_API_ERROR = Object.freeze({
  SYSTEM_TABLE_CACHE_REQUIRED: 'BootstrapAPI requires systemTableCache',
  NODE_ID_REQUIRED: 'nodeId is required',
  NODE_ID_INVALID: 'nodeId must be a valid UUID',
  NODE_ADDRESS_REQUIRED: 'nodeAddress is required',
  NODE_ADDRESS_INVALID: 'nodeAddress must be a non-empty string',
  SEED_NODE_ID_CONFLICT: 'Cannot bootstrap with seed node ID',
  SEED_NODE_ADDRESS_CONFLICT: 'Cannot use seed node address',
  NODE_ID_ALREADY_REGISTERED: (nodeId) => `Node ID ${nodeId} is already registered`,
  NODE_ADDRESS_IN_USE: (nodeAddress) => `Node address ${nodeAddress} is already in use`,
  INTERNAL_BOOTSTRAP_ERROR: 'Internal server error during bootstrap',
  BOOTSTRAP_NOT_READY: 'Bootstrap not ready',
  RAFT_LEADERS_NOT_READY:
    'Bootstrap unavailable until all raft group leaders are elected',
  REGISTER_NODE_UNSUPPORTED:
    'register-node is not supported; use WebSocket IDENTIFY + NODE_STATE_UPDATE',
  SERVICE_ID_REQUIRED: 'service_id is required',
  SERVICE_TYPE_REQUIRED: 'service_type is required',
  SERVICE_NODE_ID_REQUIRED: 'node_id is required',
  SQL_ENGINE_UNAVAILABLE: 'SQL query engine not available',
  SERVICE_REGISTRATION_FAILED: 'Failed to register service',
  UPDATE_NODE_STATUS_UNSUPPORTED:
    'updateNodeStatus is not supported; use CDC integration service',
});

const BOOTSTRAP_API_SQL = Object.freeze({
  UPSERT_SERVICE: `INSERT OR REPLACE INTO services (
        service_id, service_type, node_id, partition_id, group_id,
        replica_id, raft_role, status, address, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
});

const BOOTSTRAP_API_CLOSE_ERROR_CODE = 'ERR_SERVER_NOT_RUNNING';

const BOOTSTRAP_API_CLUSTER_STATE = Object.freeze({
  HEALTHY: BOOTSTRAP_API_HEALTH_STATUS,
  UNKNOWN: STRING.UNKNOWN,
});

export {
  BOOTSTRAP_API_CLUSTER_STATE,
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_CLOSE_ERROR_CODE,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HEALTH_STATUS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_MESSAGE_GROUP_PREFIX,
  BOOTSTRAP_API_ROUTE,
  BOOTSTRAP_API_SQL,
  BOOTSTRAP_API_SUBSYSTEM,
};
