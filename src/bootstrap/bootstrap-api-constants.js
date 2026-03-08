import {HOST, NUM, STRING} from '../constants/index.js';
import {BOOTSTRAP_LOG_PREFIX, BOOTSTRAP_SUBSYSTEM} from './bootstrap-constants.js';

const BOOTSTRAP_API_SUBSYSTEM = BOOTSTRAP_SUBSYSTEM.API;

const BOOTSTRAP_API_ROUTE = Object.freeze({
  HEALTH: '/health',
  LIVEZ: '/livez',
  STARTUPZ: '/startupz',
  READYZ: '/readyz',
  BOOTSTRAP_READY: '/bootstrap/ready',
  BOOTSTRAP: '/bootstrap',
  REGISTER_SERVICE: '/register-service',
  CLUSTER_STATE: '/cluster/state',
});

const BOOTSTRAP_API_HEALTH_STATUS = 'healthy';
const BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING = 'initializing';
const BOOTSTRAP_API_MESSAGE_GROUP_PREFIX = 'mg-';

const BOOTSTRAP_API_DEFAULT = Object.freeze({
  MG_ID_LENGTH: NUM.EIGHT,
  WS_HOST: HOST.LOCALHOST,
  MOVE_REPLICA_ASSIGNMENT_LEASE_MS: NUM.THIRTY_THOUSAND,
  SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT_MS: NUM.FIVE_THOUSAND,
  SERVICE_REGISTRATION_CACHE_VISIBILITY_POLL_INTERVAL_MS: NUM.TEN,
});

const BOOTSTRAP_API_CACHE_VISIBILITY = Object.freeze({
  REASON_CACHE_UNAVAILABLE: 'cache_unavailable',
  REASON_SERVICE_ROW_MISSING: 'service_row_missing',
  REASON_FIELD_MISMATCH: 'field_mismatch',
  REASON_STORAGE_ROW_VISIBLE_CACHE_STALE: 'storage_row_visible_cache_stale',
  REASON_STORAGE_ROW_MISSING: 'storage_row_missing',
  REASON_STORAGE_LOOKUP_FAILED: 'storage_lookup_failed',
  REASON_VISIBLE: 'visible',
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
  MOVE_REPLICA_SOURCE_REMOVAL_START:
    'Removing local source replica before MOVE_REPLICA ownership commit',
  MOVE_REPLICA_SOURCE_REMOVED: 'Removed local source replica for MOVE_REPLICA handoff',
  MOVE_REPLICA_SOURCE_REMOVAL_FAILED:
    'Failed to remove local source replica during MOVE_REPLICA handoff',
  MOVE_REPLICA_HANDOFF_STARTED:
    'Started MOVE_REPLICA handoff operation tracking',
  MOVE_REPLICA_HANDOFF_PHASE_APPLIED:
    'Applied MOVE_REPLICA handoff phase',
  MOVE_REPLICA_HANDOFF_COMPLETED:
    'Completed MOVE_REPLICA handoff operation',
  MOVE_REPLICA_HANDOFF_FAILED:
    'MOVE_REPLICA handoff operation failed',
  MOVE_REPLICA_ASSIGNMENT_RESERVED:
    'Reserved MOVE_REPLICA assignment for joining node',
  MOVE_REPLICA_ASSIGNMENT_EXPIRED:
    'Expired stale MOVE_REPLICA assignment reservation',
  MOVE_REPLICA_ASSIGNMENT_CONFLICT:
    'MOVE_REPLICA assignment reservation conflict detected',
  MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED:
    'MOVE_REPLICA assignment token validation failed',
  SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT:
    'Service registration cache visibility timeout diagnostics',
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
  STALE_NODE_REJOIN_ALLOWED:
    'Allowing re-registration of dead node',
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
  ASSIGNMENT_TOKEN_REQUIRED:
    'assignment_id is required for MOVE_REPLICA register-service',
  ASSIGNMENT_TOKEN_UNKNOWN:
    'assignment_id does not reference an active MOVE_REPLICA assignment',
  ASSIGNMENT_TOKEN_EXPIRED:
    'assignment_id lease has expired for MOVE_REPLICA handoff',
  ASSIGNMENT_TOKEN_MISMATCH:
    'assignment_id does not match requested node_id/replica_id',
  REPLICA_OWNER_CONFLICT:
    'active replica owner conflict for message-group replica',
  SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT: (serviceId, nodeId, timeoutMs) =>
    `Timed out waiting for services cache visibility for service ${serviceId} ` +
    `on node ${nodeId} after ${timeoutMs}ms`,
  UPDATE_NODE_STATUS_UNSUPPORTED:
    'updateNodeStatus is not supported; use CDC integration service',
});

const BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE = Object.freeze({
  ASSIGNMENT_TOKEN_REQUIRED: 'ASSIGNMENT_TOKEN_REQUIRED',
  ASSIGNMENT_TOKEN_UNKNOWN: 'ASSIGNMENT_TOKEN_UNKNOWN',
  ASSIGNMENT_TOKEN_EXPIRED: 'ASSIGNMENT_TOKEN_EXPIRED',
  ASSIGNMENT_TOKEN_MISMATCH: 'ASSIGNMENT_TOKEN_MISMATCH',
  REPLICA_OWNER_CONFLICT: 'REPLICA_OWNER_CONFLICT',
});

const BOOTSTRAP_API_SQL = Object.freeze({
  UPSERT_SERVICE: `INSERT OR REPLACE INTO services (
        service_id, service_type, node_id, partition_id, group_id,
        replica_id, raft_role, status, address, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  INSERT_REPLICA_OPERATION: `INSERT INTO replica_operations (
        operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
        status, workflow_step, created_at, updated_at, completed_at, error_message,
        steps_history, entity_type, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  UPDATE_REPLICA_OPERATION: `UPDATE replica_operations SET
        status = ?, workflow_step = ?, updated_at = ?, completed_at = ?,
        error_message = ?, steps_history = ?
      WHERE operation_id = ?`,
  SELECT_REPLICA_OPERATION_BY_ID: `SELECT *
      FROM replica_operations
      WHERE operation_id = ?`,
  SELECT_MOVE_ASSIGNMENT_RESERVATIONS: `SELECT *
      FROM replica_operations
      WHERE type = ?`,
  SELECT_REGISTERED_SERVICE_BY_ID: `SELECT
        service_id, service_type, node_id, group_id, replica_id,
        raft_role, status, address, created_at, updated_at
      FROM services
      WHERE service_id = ?
      LIMIT 1`,
});

const BOOTSTRAP_API_HANDOFF_PHASE = Object.freeze({
  PREPARE_TARGET: 'prepare_target',
  VERIFY_TARGET: 'verify_target',
  REMOVE_SOURCE: 'remove_source',
  COMMIT_METADATA: 'commit_metadata',
  FAILED: 'failed',
});

const BOOTSTRAP_API_HANDOFF_STATUS = Object.freeze({
  PREPARING: 'creating',
  VERIFYING: 'syncing',
  REMOVING: 'removing',
  COMMITTED: 'active',
  FAILED: 'failed',
});

const BOOTSTRAP_API_HANDOFF_OPERATION = Object.freeze({
  TYPE: 'ADD',
});

const BOOTSTRAP_API_ASSIGNMENT = Object.freeze({
  FIELD_ID: 'assignment_id',
  OPERATION_TYPE: 'MOVE_ASSIGNMENT',
  ACTIVE_RESERVATION_STATUSES: Object.freeze([
    'creating',
    'syncing',
    'removing',
  ]),
  TERMINAL_STATUSES: Object.freeze([
    'active',
    'failed',
    'removed',
  ]),
});

const BOOTSTRAP_API_CLOSE_ERROR_CODE = 'ERR_SERVER_NOT_RUNNING';

const BOOTSTRAP_API_CLUSTER_STATE = Object.freeze({
  HEALTHY: BOOTSTRAP_API_HEALTH_STATUS,
  UNKNOWN: STRING.UNKNOWN,
});

const BOOTSTRAP_API_PROBE_SCOPE = Object.freeze({
  BOOTSTRAP_JOIN: 'bootstrap_join',
});

const BOOTSTRAP_API_PROBE_REASON = Object.freeze({
  BOOTSTRAP_PHASE_INCOMPLETE: 'BOOTSTRAP_PHASE_INCOMPLETE',
});

const BOOTSTRAP_API_LIVENESS = Object.freeze({
  ALIVE: true,
  STATE_RUNNING: 'running',
});

export {
  BOOTSTRAP_API_CACHE_VISIBILITY,
  BOOTSTRAP_API_CLUSTER_STATE,
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_CLOSE_ERROR_CODE,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HEALTH_STATUS,
  BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING,
  BOOTSTRAP_API_HANDOFF_PHASE,
  BOOTSTRAP_API_HANDOFF_OPERATION,
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_LIVENESS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_MESSAGE_GROUP_PREFIX,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_PROBE_SCOPE,
  BOOTSTRAP_API_ROUTE,
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
  BOOTSTRAP_API_SQL,
  BOOTSTRAP_API_SUBSYSTEM,
};
