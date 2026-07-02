/**
 * Worker process isolation constants for replica worker management.
 *
 * This module defines constants for worker process operations, status values,
 * events, and error messages used by ReplicaWorkerManager, WorkerMessageBridge,
 * and the worker entry point (replica-worker.js).
 *
 * @module worker/worker-constants
 * @see Requirements 5.1, 5.2, 5.3 - Worker Process Lifecycle Management
 */

import {NUM, SUBSYSTEM, TIME_MS} from '../constants/index.js';

/**
 * Subsystem identifier for worker process logging.
 * @type {string}
 * @see src/constants/subsystems.js - Centralized subsystem identifiers
 */
const WORKER_SUBSYSTEM = SUBSYSTEM.WORKER;

/**
 * Worker operation types sent to worker processes.
 * These operations are handled by the replica-worker.js entry point.
 *
 * @type {Readonly<Object>}
 * @see Requirements 5.2, 5.3, 5.4, 5.5
 */
const WORKER_OPERATION = Object.freeze({
  /** Create a new partition replica in the worker process */
  CREATE_PARTITION_REPLICA: 'CREATE_PARTITION_REPLICA',
  /** Create a new message group replica in the worker process */
  CREATE_MESSAGE_GROUP_REPLICA: 'CREATE_MESSAGE_GROUP_REPLICA',
  /** Stop and cleanup a replica in the worker process */
  STOP_REPLICA: 'STOP_REPLICA',
  /** Deliver a message to a replica in the worker process */
  DELIVER_MESSAGE: 'DELIVER_MESSAGE',
  /** Health check request to verify worker is responsive */
  HEALTH_CHECK: 'HEALTH_CHECK',
});

/**
 * Worker process status values.
 * Tracks the lifecycle state of a worker process.
 *
 * @type {Readonly<Object>}
 * @see Requirements 5.6
 */
const WORKER_STATUS = Object.freeze({
  /** Worker process is being spawned */
  STARTING: 'starting',
  /** Worker process is running and ready */
  RUNNING: 'running',
  /** Worker process is shutting down */
  STOPPING: 'stopping',
  /** Worker process has terminated */
  STOPPED: 'stopped',
});

/**
 * Worker lifecycle event names.
 * Emitted by ReplicaWorkerBase during state transitions.
 *
 * @type {Readonly<Object>}
 * @see Requirements 6.5
 */
const WORKER_EVENT = Object.freeze({
  /** Worker has completed initialization */
  INITIALIZED: 'initialized',
  /** Worker has started and is ready to process messages */
  STARTED: 'started',
  /** Worker has stopped gracefully */
  STOPPED: 'stopped',
  /** Worker has failed with an error */
  FAILED: 'failed',
  /** A replica has been created in a worker process */
  REPLICA_CREATED: 'replica_created',
  /** A replica has been stopped in a worker process */
  REPLICA_STOPPED: 'replica_stopped',
  /** A replica has failed in a worker process */
  REPLICA_FAILED: 'replica_failed',
});

/**
 * Worker health status values.
 * Used by ReplicaWorkerManager for health monitoring.
 *
 * @type {Readonly<Object>}
 * @see Requirements 5.6
 */
const WORKER_HEALTH_STATUS = Object.freeze({
  /** Worker is responding to health checks */
  HEALTHY: 'healthy',
  /** Worker is not responding or has errors */
  UNHEALTHY: 'unhealthy',
  /** Worker health status is not yet determined */
  UNKNOWN: 'unknown',
});

/**
 * Worker message types for IPC communication.
 * Used by WorkerMessageBridge for message envelope typing.
 *
 * @type {Readonly<Object>}
 * @see Requirements 7.1, 7.2, 7.3
 */
const WORKER_MESSAGE_TYPE = Object.freeze({
  /** Request message expecting a response */
  REQUEST: 'request',
  /** Response to a previous request */
  RESPONSE: 'response',
  /** One-way event notification */
  EVENT: 'event',
});

/**
 * Worker entity types for unified address format.
 *
 * @type {Readonly<Object>}
 * @see Requirements 7.4
 */
const WORKER_ENTITY_TYPE = Object.freeze({
  /** Partition replica entity */
  PARTITION: 'partition',
  /** Message group replica entity */
  MESSAGE_GROUP: 'message-group',
});

/**
 * Cache message types for SystemCacheProxy communication.
 * Used for querying system cache data from message group workers.
 *
 * @type {Readonly<Object>}
 * @see Requirements 9.1, 9.2
 */
const CACHE_MESSAGE_TYPE = Object.freeze({
  /** Get a single record by key */
  CACHE_GET: 'CACHE_GET',
  /** Response to CACHE_GET */
  CACHE_GET_RESPONSE: 'CACHE_GET_RESPONSE',
  /** Execute SQL query on cache */
  CACHE_QUERY: 'CACHE_QUERY',
  /** Response to CACHE_QUERY */
  CACHE_QUERY_RESPONSE: 'CACHE_QUERY_RESPONSE',
  /** Filter records by predicate */
  CACHE_FILTER: 'CACHE_FILTER',
  /** Response to CACHE_FILTER */
  CACHE_FILTER_RESPONSE: 'CACHE_FILTER_RESPONSE',
  /** Get all records from a table */
  CACHE_GET_ALL: 'CACHE_GET_ALL',
  /** Response to CACHE_GET_ALL */
  CACHE_GET_ALL_RESPONSE: 'CACHE_GET_ALL_RESPONSE',
});

/**
 * Leadership status message types.
 * Used for querying Raft leadership status from workers.
 *
 * @type {Readonly<Object>}
 * @see Requirements 10.4
 */
const LEADERSHIP_MESSAGE_TYPE = Object.freeze({
  /** Query leadership status */
  GET_LEADERSHIP_STATUS: 'GET_LEADERSHIP_STATUS',
  /** Response with leadership status */
  LEADERSHIP_STATUS: 'LEADERSHIP_STATUS',
});

/**
 * Facade message types for thin facade delegation.
 * Used by main-process facades (PartitionService, MessageGroupService)
 * to delegate operations to worker processes.
 *
 * @type {Readonly<Object>}
 * @see Requirements 4.1, 4.2, 4.3, 4.4
 */
const FACADE_MESSAGE_TYPE = Object.freeze({
  /** Execute a SQL query on the worker */
  QUERY: 'QUERY',
  /** Legacy alias for query execution used by integration tests */
  EXECUTE_QUERY: 'EXECUTE_QUERY',
  /** Start Raft election on the worker */
  START_ELECTION: 'START_ELECTION',
  /** Forward a write operation to the worker */
  FORWARD_WRITE: 'FORWARD_WRITE',
  /** System table write operation */
  SYSTEM_TABLE_WRITE: 'SYSTEM_TABLE_WRITE',
  /** Send a message via the message group worker */
  SEND_MESSAGE: 'SEND_MESSAGE',
  /** Receive/handle a message via the message group worker */
  RECEIVE_MESSAGE: 'RECEIVE_MESSAGE',
});

/**
 * CDC subscription message types.
 * Used for message-based CDC subscription management.
 *
 * @type {Readonly<Object>}
 * @see Requirements 10.5, 10.6
 */
const CDC_MESSAGE_TYPE = Object.freeze({
  /** Subscribe to CDC events from a partition */
  SUBSCRIBE_CDC: 'SUBSCRIBE_CDC',
  /** Unsubscribe from CDC events */
  UNSUBSCRIBE_CDC: 'UNSUBSCRIBE_CDC',
  /** CDC event notification */
  CDC_EVENT: 'CDC_EVENT',
});

/**
 * Seed cache message types.
 * Used during seed node bootstrap to populate initial system cache
 * before partitions exist.
 *
 * @type {Readonly<Object>}
 * @see Requirements 12.4, 12.5, 12.6
 */
const SEED_CACHE_MESSAGE_TYPE = Object.freeze({
  /** Seed cache request (sent to message group leader during bootstrap) */
  SEED_CACHE: 'SEED_CACHE',
  /** Seed cache response */
  SEED_CACHE_RESPONSE: 'SEED_CACHE_RESPONSE',
  /** Set bootstrap phase flag (sent after partitions are created) */
  SET_BOOTSTRAP_PHASE: 'SET_BOOTSTRAP_PHASE',
});

/**
 * Join message types for node joining bootstrap protocol.
 * Used when a new node joins the cluster via WebSocket connection to seed node.
 *
 * @type {Readonly<Object>}
 * @see Requirements 13.1, 13.2, 13.3, 13.7
 */
const JOIN_MESSAGE_TYPE = Object.freeze({
  /** Join request sent by joining node to seed node with nodeId and address */
  JOIN_REQUEST: 'JOIN_REQUEST',
  /** Join response from seed node with message group assignment and Raft peers */
  JOIN_RESPONSE: 'JOIN_RESPONSE',
  /** Join complete sent by joining node after message group replica is ready */
  JOIN_COMPLETE: 'JOIN_COMPLETE',
  /** Join complete acknowledgment from seed node with next steps */
  JOIN_COMPLETE_ACK: 'JOIN_COMPLETE_ACK',
});

/**
 * Worker log messages for consistent logging.
 *
 * @type {Readonly<Object>}
 */
const WORKER_LOG_MSG = Object.freeze({
  // Lifecycle messages
  INITIALIZING: 'Initializing worker process',
  INITIALIZED: 'Worker process initialized',
  STARTING: 'Starting worker process',
  STARTED: 'Worker process started',
  STOPPING: 'Stopping worker process',
  STOPPED: 'Worker process stopped',
  FAILED: 'Worker process failed',

  // Operation messages
  OPERATION_RECEIVED: 'Worker operation received',
  OPERATION_COMPLETED: 'Worker operation completed',
  OPERATION_FAILED: 'Worker operation failed',

  // Health check messages
  HEALTH_CHECK_RECEIVED: 'Health check received',
  HEALTH_CHECK_PASSED: 'Health check passed',
  HEALTH_CHECK_FAILED: 'Health check failed',

  // Message bridge messages
  REGISTERING: 'Registering worker with message router',
  REGISTERED: 'Worker registered with message router',
  UNREGISTERING: 'Unregistering worker from message router',
  UNREGISTERED: 'Worker unregistered from message router',
  MESSAGE_RECEIVED: 'Message received from main process',
  MESSAGE_SENT: 'Message sent to main process',

  // Replica messages
  CREATING_PARTITION_REPLICA: 'Creating partition replica in worker',
  PARTITION_REPLICA_CREATED: 'Partition replica created in worker',
  CREATING_MESSAGE_GROUP_REPLICA: 'Creating message group replica in worker',
  MESSAGE_GROUP_REPLICA_CREATED: 'Message group replica created in worker',
  STOPPING_REPLICA: 'Stopping replica in worker',
  REPLICA_STOPPED: 'Replica stopped in worker',

  // Crash detection messages
  CRASH_DETECTED: 'Worker process crash detected',
  CRASH_CLEANUP: 'Cleaning up after worker crash',
  CRASH_NOTIFIED: 'Rebalancer notified of worker crash',
});

/**
 * Worker error messages for consistent error reporting.
 *
 * @type {Readonly<Object>}
 */
const WORKER_ERROR_MSG = Object.freeze({
  // Initialization errors
  NOT_INITIALIZED: 'Worker process not initialized',
  ALREADY_INITIALIZED: 'Worker process already initialized',
  INITIALIZATION_FAILED: 'Worker process initialization failed',

  // Operation errors
  UNKNOWN_OPERATION: 'Unknown worker operation',
  OPERATION_TIMEOUT: 'Worker operation timed out',
  OPERATION_FAILED: 'Worker operation failed',

  // Message errors
  MESSAGE_SERIALIZATION_FAILED: 'Failed to serialize message',
  MESSAGE_DESERIALIZATION_FAILED: 'Failed to deserialize message',
  MESSAGE_DELIVERY_FAILED: 'Failed to deliver message',

  // Address errors
  ADDRESS_NOT_SET: 'Worker unified address not set',

  // Registration errors (legacy - kept for compatibility)
  REGISTRATION_FAILED: 'Failed to register worker with message router',
  UNREGISTRATION_FAILED: 'Failed to unregister worker from message router',
  ALREADY_REGISTERED: 'Worker already registered',
  NOT_REGISTERED: 'Worker not registered',

  // Replica errors
  REPLICA_CREATION_FAILED: 'Failed to create replica in worker',
  REPLICA_NOT_FOUND: 'Replica not found in worker',
  REPLICA_STOP_FAILED: 'Failed to stop replica in worker',
  REPLICA_ALREADY_EXISTS: 'Replica already exists in worker',

  // Health check errors
  HEALTH_CHECK_TIMEOUT: 'Health check timed out',

  // Timeout error message generators - Requirements 7.1, 7.2
  createReplicaTimeout: (timeoutMs) => `CREATE_REPLICA timeout after ${timeoutMs}ms`,
  operationTimeout: (operation, timeoutMs) =>
    `${operation} timeout after ${timeoutMs}ms`,

  // Dynamic error message generators
  unknownOperation: (operation) => `Unknown worker operation: ${operation}`,
  replicaNotFound: (replicaId) => `Replica not found: ${replicaId}`,
  workerNotFound: (workerId) => `Worker not found: ${workerId}`,
  operationFailed: (operation, error) =>
    `Worker operation ${operation} failed: ${error}`,
  crashDetected: (replicaId, error) =>
    `Worker crash detected for replica ${replicaId}: ${error}`,
});

/**
 * Worker default configuration values.
 *
 * @type {Readonly<Object>}
 */
const WORKER_DEFAULT = Object.freeze({
  /** Default health check interval in milliseconds */
  HEALTH_CHECK_INTERVAL_MS: TIME_MS.SECOND * NUM.FIVE,
  /** Default health check timeout in milliseconds */
  HEALTH_CHECK_TIMEOUT_MS: TIME_MS.SECOND * 2,
  /** Maximum time to detect a crash in milliseconds */
  CRASH_DETECTION_THRESHOLD_MS: TIME_MS.SECOND * NUM.FIVE,
  /** Default operation timeout in milliseconds */
  OPERATION_TIMEOUT_MS: TIME_MS.SECOND * NUM.THIRTY,
  /** Default shutdown timeout in milliseconds */
  SHUTDOWN_TIMEOUT_MS: TIME_MS.SECOND * NUM.TEN,
});

/**
 * Worker response status values.
 *
 * @type {Readonly<Object>}
 */
const WORKER_RESPONSE_STATUS = Object.freeze({
  /** Operation completed successfully */
  OK: 'ok',
  /** Operation failed with error */
  ERROR: 'error',
});

/**
 * Worker address format constants.
 *
 * @type {Readonly<Object>}
 * @see Requirements 7.4
 */
const WORKER_ADDRESS = Object.freeze({
  /** Separator for unified address format */
  SEPARATOR: '/',
  /** Build unified address from components */
  build: (nodeId, entityType, replicaId) =>
    `${nodeId}/${entityType}/${replicaId}`,
});

export {
  CACHE_MESSAGE_TYPE,
  CDC_MESSAGE_TYPE,
  FACADE_MESSAGE_TYPE,
  JOIN_MESSAGE_TYPE,
  LEADERSHIP_MESSAGE_TYPE,
  SEED_CACHE_MESSAGE_TYPE,
  WORKER_ADDRESS,
  WORKER_DEFAULT,
  WORKER_ENTITY_TYPE,
  WORKER_ERROR_MSG,
  WORKER_EVENT,
  WORKER_HEALTH_STATUS,
  WORKER_LOG_MSG,
  WORKER_MESSAGE_TYPE,
  WORKER_OPERATION,
  WORKER_RESPONSE_STATUS,
  WORKER_STATUS,
  WORKER_SUBSYSTEM,
};
