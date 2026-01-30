import {NUM, STRING, TIME_MS} from '../constants/index.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';

const REPLICA_LIFECYCLE_SUBSYSTEM = 'replica-lifecycle';

const REPLICA_LIFECYCLE_STATUS = Object.freeze({
  STARTING: 'starting',
  SYNCING: 'syncing',
  ACTIVE: 'active',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed',
});

const REPLICA_LIFECYCLE_VALID_TRANSITIONS = Object.freeze({
  [REPLICA_LIFECYCLE_STATUS.STARTING]: [
    REPLICA_LIFECYCLE_STATUS.SYNCING,
    REPLICA_LIFECYCLE_STATUS.FAILED,
  ],
  [REPLICA_LIFECYCLE_STATUS.SYNCING]: [
    REPLICA_LIFECYCLE_STATUS.ACTIVE,
    REPLICA_LIFECYCLE_STATUS.FAILED,
  ],
  [REPLICA_LIFECYCLE_STATUS.ACTIVE]: [
    REPLICA_LIFECYCLE_STATUS.STOPPING,
    REPLICA_LIFECYCLE_STATUS.FAILED,
  ],
  [REPLICA_LIFECYCLE_STATUS.STOPPING]: [
    REPLICA_LIFECYCLE_STATUS.STOPPED,
    REPLICA_LIFECYCLE_STATUS.FAILED,
  ],
  [REPLICA_LIFECYCLE_STATUS.STOPPED]: [],
  [REPLICA_LIFECYCLE_STATUS.FAILED]: [],
});

const REPLICA_LIFECYCLE_MESSAGE_TYPE = Object.freeze({
  CREATE_REPLICA: 'CREATE_REPLICA',
  REMOVE_REPLICA: 'REMOVE_REPLICA',
  CREATE_REPLICA_ACK: 'CREATE_REPLICA_ACK',
  REMOVE_REPLICA_ACK: 'REMOVE_REPLICA_ACK',
});

const REPLICA_LIFECYCLE_ACK_STATUS = Object.freeze({
  INITIATED: 'initiated',
  ALREADY_EXISTS: 'already_exists',
  IN_PROGRESS: 'in_progress',
  NOT_FOUND: 'not_found',
  ERROR: 'error',
});

const REPLICA_LIFECYCLE_PENDING_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

const REPLICA_LIFECYCLE_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing replica lifecycle manager',
  INITIALIZED: 'Replica lifecycle manager initialized',
  HANDLER_SET: 'ReplicaHandler set for lifecycle manager',
  CLEARING_LOCAL_REPLICAS: 'Clearing local replica tracking after handler set',
  NO_MESSAGE_GROUP: 'No message group service available for handler registration',
  HANDLERS_REGISTERED: 'Registered lifecycle message handlers',
  INVALID_TRANSITION: 'Invalid status transition attempted',
  STATUS_UPDATE: 'Updating replica status',
  CDC_UPDATE_FAILED: 'CDC status update failed',
  CREATE_REQUEST: 'Received CREATE_REPLICA message',
  CREATE_ALREADY_ACTIVE: 'Replica already exists in active state',
  CREATE_IN_PROGRESS: 'Replica creation already in progress',
  CREATE_NON_ACTIVE: 'Replica exists in non-active state',
  ASYNC_CREATE_FAILED: 'Async replica creation failed',
  CREATE_COMPLETE: 'Replica creation completed successfully',
  CREATE_FAILED: 'Replica creation failed',
  STATUS_FAILED_UPDATE: 'Failed to update replica status to failed',
  REMOVE_REQUEST: 'Received REMOVE_REPLICA message',
  REMOVE_NOT_FOUND: 'Replica not found for removal',
  REMOVE_IN_PROGRESS: 'Replica removal already in progress',
  ASYNC_REMOVE_FAILED: 'Async replica removal failed',
  GRACEFUL_SHUTDOWN: 'Initiating graceful shutdown',
  REMOVE_COMPLETE: 'Replica removal completed successfully',
  REMOVE_FAILED: 'Replica removal failed',
  RAFT_SYNC_START: 'Starting Raft log sync',
  RAFT_SYNC_COMPLETE: 'Raft log sync completed',
  CLEANUP_RESOURCES: 'Cleaning up replica resources',
  REMOVED_DB_FILE: 'Removed database file',
  REMOVED_EMPTY_DIR: 'Removed empty partition directory',
  CLEANUP_FAILED: 'Error cleaning up replica resources',
  RECOVERY_START: 'Handling node recovery - checking for orphaned replicas',
  RECOVERY_CACHE_MISSING: 'No system table cache available for recovery check',
  RECOVERY_FOUND: 'Found orphaned replicas in transitional states',
  RECOVERY_PROCESSING: 'Processing orphaned replica',
  RECOVERY_MARKED_FAILED: 'Marked orphaned replica as failed',
  RECOVERY_COMPLETED_REMOVAL: 'Completed removal of stopping replica',
  RECOVERY_FAILED: 'Failed to clean up orphaned replica',
  EXPIRED_OPERATIONS_CLEANED: 'Cleaned up expired pending operations',
  ALREADY_REGISTERED: 'Replica already registered',
  REGISTERED_REPLICA: 'Registered existing replica',
  SHUTTING_DOWN: 'Shutting down replica lifecycle manager',
});

const REPLICA_LIFECYCLE_ERROR_MSG = Object.freeze({
  INVALID_TRANSITION: (currentStatus, newStatus) =>
    `Invalid status transition: ${currentStatus} -> ${newStatus}`,
  STATUS_UPDATE_FAILED: (error) => `Failed to update replica status: ${error}`,
  REPLICA_SERVICE_MISSING: (replicaId) => `Replica service not found: ${replicaId}`,
  RECOVERY_CLEANUP_ERROR: 'Node recovery cleanup',
  MISSING_SYSTEM_TABLE_CACHE: 'ReplicaLifecycleManager requires systemTableCache',
  REPLICA_HANDLER_REQUIRED:
    'ReplicaHandler or createPartitionService is required for lifecycle operations',
});

const REPLICA_LIFECYCLE_EVENT = Object.freeze({
  STATUS_CHANGED: 'statusChanged',
  CREATED: 'replicaCreated',
  CREATION_FAILED: 'replicaCreationFailed',
  REMOVED: 'replicaRemoved',
  REMOVAL_FAILED: 'replicaRemovalFailed',
  RECOVERY_COMPLETE: 'recoveryComplete',
  SHUTDOWN: 'shutdown',
});

const REPLICA_LIFECYCLE_DEFAULT = Object.freeze({
  OPERATION_TIMEOUT_MS: TIME_MS.MINUTE / NUM.TWO,
  SYNC_TIMEOUT_MS: TIME_MS.MINUTE,
  EXPIRED_OPERATION_MAX_AGE_MS: TIME_MS.MINUTE * NUM.FIVE,
  UNKNOWN_NODE_ID: STRING.UNKNOWN,
  DATA_DIR: STORAGE_DEFAULT.DATA_DIR,
});

const REPLICA_LIFECYCLE_NUM = Object.freeze({
  ZERO: NUM.ZERO,
});

export {
  REPLICA_LIFECYCLE_ACK_STATUS,
  REPLICA_LIFECYCLE_DEFAULT,
  REPLICA_LIFECYCLE_ERROR_MSG,
  REPLICA_LIFECYCLE_EVENT,
  REPLICA_LIFECYCLE_LOG_MSG,
  REPLICA_LIFECYCLE_MESSAGE_TYPE,
  REPLICA_LIFECYCLE_NUM,
  REPLICA_LIFECYCLE_PENDING_STATUS,
  REPLICA_LIFECYCLE_STATUS,
  REPLICA_LIFECYCLE_SUBSYSTEM,
  REPLICA_LIFECYCLE_VALID_TRANSITIONS,
};
