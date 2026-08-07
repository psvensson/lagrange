import {
  ERRNO,
  NUM,
  STRING,
  TIME_MS,
  TYPEOF,
} from '../constants/index.js';
import {
  OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
} from '../rebalancer/replica-operation-step-policy.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';

const REPLICA_HANDLER_SUBSYSTEM = 'replica-handler';

const REPLICA_HANDLER_DEFAULT = Object.freeze({
  NODE_ID: STRING.UNKNOWN,
  DATA_DIR: STORAGE_DEFAULT.DATA_DIR,
  SYNC_TIMEOUT_MS: TIME_MS.MINUTE,
  STATUS_WRITE_RETRY_TIMEOUT_MS: TIME_MS.SECOND * NUM.THIRTY,
});

const REPLICA_HANDLER_ADDRESS = Object.freeze({
  SERVICE_SEGMENT: 'service',
  HANDLER_ID: 'replica-handler',
});

const REPLICA_HANDLER_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing ReplicaHandler',
  MESSAGE_RECEIVED: 'ReplicaHandler received message',
  CREATE_REQUEST: 'Handling CREATE_REPLICA request',
  CREATE_MISSING_FIELDS: 'CREATE_REPLICA missing required fields',
  CREATE_ALREADY_ACTIVE: 'Replica already exists in active state',
  CREATE_IN_PROGRESS: 'Replica creation already in progress',
  CREATE_RESTARTING_PENDING:
    'Restarting pending replica creation without live local task',
  CREATE_STATUS_WRITE_DEFERRED:
    'Replica create status write deferred after retryable control-plane failure',
  WAITING_METADATA_PROPAGATION:
    'Waiting for partition/table metadata propagation before replica creation',
  HYDRATED_METADATA_FROM_QUERY:
    'Hydrated replica metadata from authoritative system-table query',
  METADATA_HYDRATION_QUERY_FAILED:
    'Failed to hydrate replica metadata from authoritative system-table query',
  WAITING_VOTER_READY: 'Waiting for replica voter-ready activation',
  VOTER_READY_ACTIVATED: 'Replica reached voter-ready activation state',
  VOTER_READY_TIMEOUT: 'Replica did not reach voter-ready activation before timeout',
  OPERATION_IN_PROGRESS: 'Operation already in progress',
  OPERATION_NOT_FOUND: 'Replica operation not found in system table cache',
  ASYNC_CREATE_FAILED: 'Async replica creation failed',
  CREATE_COMPLETED: 'Replica creation completed',
  CREATE_FAILED: 'Replica creation failed',
  REMOVE_REQUEST: 'Handling REMOVE_REPLICA request',
  REMOVE_MISSING_FIELDS: 'REMOVE_REPLICA missing required fields',
  REMOVE_NOT_FOUND: 'Replica not found for removal',
  REMOVE_PARTITION_MISMATCH: 'Replica partition identity mismatch on removal',
  REMOVE_IN_PROGRESS: 'Replica removal already in progress',
  REMOVE_ALREADY_REMOVED: 'Replica already removed',
  STEP_DOWN_REQUEST: 'Handling STEP_DOWN_REPLICA request',
  STEP_DOWN_MISSING_FIELDS: 'STEP_DOWN_REPLICA missing required fields',
  STEP_DOWN_NOT_FOUND: 'Replica not found for leader handoff',
  STEP_DOWN_COMPLETED: 'Replica leader handoff completed',
  STEP_DOWN_FAILED: 'Replica leader handoff failed',
  ASYNC_REMOVE_FAILED: 'Async replica removal failed',
  GRACEFUL_SHUTDOWN: 'Initiating graceful shutdown',
  DELETE_SERVICE_ROW_FAILED: 'Failed to delete service row',
  LOCAL_CLEANUP_RETRY_REQUIRED:
    'Replica local cleanup requires retry after durable removal',
  REMOVE_COMPLETED: 'Replica removal completed',
  REMOVE_FAILED: 'Replica removal failed',
  REMOVE_STATUS_WRITE_DEFERRED:
    'Replica removal status write deferred after retryable control-plane failure',
  REMOVE_FAILED_STATUS_WRITE_DEFERRED:
    'Replica failed-status write deferred after retryable control-plane failure',
  UPDATE_STATUS: 'Updating replica status',
  UPDATE_STATUS_RETRY:
    'Retrying replica status persistence after retryable control-plane failure',
  CDC_UNAVAILABLE: 'CDC integration service not available',
  UPDATE_STATUS_FAILED: 'Failed to update replica status via CDC',
  PARSE_STEPS_HISTORY_FAILED: 'Failed to parse steps_history',
  CLEANUP_RESOURCES: 'Cleaning up replica resources',
  REMOVED_DB_FILE: 'Removed database file',
  REMOVED_EMPTY_DIR: 'Removed empty partition directory',
  CLEANUP_FAILED: 'Error cleaning up replica resources',
  ALREADY_REGISTERED: 'Replica already registered',
  REGISTERED_REPLICA: 'Registered existing replica',
  NO_MESSAGE_ROUTER: 'No message router provided for registration',
  REGISTERED_ROUTER: 'Registered ReplicaHandler with message router',
  UNREGISTERED_ROUTER: 'Unregistered ReplicaHandler from message router',
  SHUTTING_DOWN: 'Shutting down ReplicaHandler',
  REMOVED_CLEANUP_SWEEP_DELETED:
    'Startup sweep deleted removed-replica cleanup-debt files',
  REMOVED_CLEANUP_SWEEP_FAILED:
    'Startup sweep failed to delete removed-replica cleanup-debt files',
  REMOVED_CLEANUP_SWEEP_SKIPPED:
    'Startup removed-replica cleanup-debt sweep skipped: ' +
    'partitions directory unreadable',
  REMOVED_CLEANUP_SWEEP_RESULT:
    'Startup removed-replica cleanup-debt sweep result',
});

const REPLICA_HANDLER_ERROR_MSG = Object.freeze({
  UNKNOWN_MESSAGE_TYPE: (type) => `Unknown message type: ${type}`,
  CREATE_PARTITION_SERVICE_REQUIRED: 'ReplicaHandler requires createPartitionService',
  CREATE_REQUIRED_FIELDS:
    'CREATE_REPLICA requires operationId, partitionId, and replicaId',
  CDC_REQUIRED: 'ReplicaHandler requires cdcIntegrationService',
  REMOVE_REQUIRED_FIELDS:
    'REMOVE_REPLICA requires operationId, partitionId, and replicaId',
  STEP_DOWN_REQUIRED_FIELDS:
    'STEP_DOWN_REPLICA requires operationId, partitionId, and replicaId',
  STEP_DOWN_NOT_SUPPORTED:
    'STEP_DOWN_REPLICA requires a tracked partition service with raft ownership',
  CACHE_NOT_AVAILABLE: 'System table cache not available',
  CACHE_MISSING_FILTER: 'System table cache missing filter',
  PARTITION_METADATA_MISSING: (partitionId) =>
    `Partition metadata not found for ${partitionId}`,
  REMOVE_PARTITION_MISMATCH: (replicaId, localPartitionId, requestPartitionId) =>
    `Replica ${replicaId} belongs to partition ${localPartitionId}, ` +
    `not requested partition ${requestPartitionId}`,
  TABLE_METADATA_MISSING: (tableId) =>
    `Table metadata not found for ${tableId}`,
  SCHEMA_PARSE_FAILED: (message) =>
    `Failed to parse schema_definition: ${message}`,
});

const REPLICA_HANDLER_EVENT = Object.freeze({
  CREATED: 'replicaCreated',
  CREATION_FAILED: 'replicaCreationFailed',
  REMOVED: 'replicaRemoved',
  REMOVAL_FAILED: 'replicaRemovalFailed',
  SHUTDOWN: 'shutdown',
});

const REPLICA_HANDLER_WORKFLOW = Object.freeze({
  COMPLETION_STEPS: OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
});

const REPLICA_HANDLER_PROGRESS = Object.freeze({
  PREFIX: '[replica-create]',
  SPINNER_IDLE: '|',
  STAGE_RESOLVING_CONTEXT: 'resolving_context',
  STAGE_WAITING_VOTER_READY: 'waiting_voter_ready',
});

const REPLICA_HANDLER_SERVICE = Object.freeze({
  TYPE: SERVICE_TYPE.PARTITION,
});

const REPLICA_HANDLER_ERRNO = Object.freeze({
  ENOENT: ERRNO.ENOENT,
});

const REPLICA_HANDLER_TYPEOF = Object.freeze({
  FUNCTION: TYPEOF.FUNCTION,
  OBJECT: TYPEOF.OBJECT,
  STRING: TYPEOF.STRING,
});

const REPLICA_HANDLER_NUM = Object.freeze({
  ZERO: 0,
});

export {
  REPLICA_HANDLER_ADDRESS,
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_ERRNO,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_NUM,
  REPLICA_HANDLER_PROGRESS,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_SUBSYSTEM,
  REPLICA_HANDLER_TYPEOF,
  REPLICA_HANDLER_WORKFLOW,
};
