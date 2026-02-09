/**
 * Constants for PartitionCoordinator - orchestrator that wires
 * RaftGroup, SQLiteStore, and CDCEmitter together for partition
 * replicas.
 *
 * Requirements: 5.6, 5.7, 5.8, 5.9
 *
 * @module partition/partition-coordinator-constants
 */

/**
 * PartitionCoordinator lifecycle states.
 */
const COORDINATOR_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZING: 'initializing',
  INITIALIZED: 'initialized',
  SHUTTING_DOWN: 'shutting_down',
  SHUT_DOWN: 'shut_down',
});

/**
 * Error messages for PartitionCoordinator validation and runtime.
 * Static messages are strings; dynamic messages are functions.
 */
const COORDINATOR_ERROR_MSG = Object.freeze({
  MISSING_RAFT_GROUP: 'PartitionCoordinator requires raftGroup',
  MISSING_SQLITE_STORE: 'PartitionCoordinator requires sqliteStore',
  MISSING_CDC_EMITTER: 'PartitionCoordinator requires cdcEmitter',
  MISSING_PARTITION_ID:
    'PartitionCoordinator requires partitionId',
  MISSING_TABLE_ID: 'PartitionCoordinator requires tableId',
  NOT_INITIALIZED: 'PartitionCoordinator not initialized',
  ALREADY_INITIALIZED:
    'PartitionCoordinator already initialized',
  ALREADY_SHUT_DOWN: 'PartitionCoordinator already shut down',
  initializeFailed: (component) =>
    `PartitionCoordinator failed to initialize ${component}`,
  shutdownFailed: (component) =>
    `PartitionCoordinator failed to shut down ${component}`,
});

/**
 * Log messages emitted by PartitionCoordinator during lifecycle.
 */
const COORDINATOR_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing PartitionCoordinator',
  INITIALIZING_SQLITE_STORE: 'Initializing SQLiteStore',
  INITIALIZING_RAFT_GROUP: 'Initializing RaftGroup',
  INITIALIZING_CDC_EMITTER: 'Initializing CDCEmitter',
  INITIALIZED: 'PartitionCoordinator initialized',
  EXECUTING_QUERY: 'Executing query via PartitionCoordinator',
  WRITE_DETECTED: 'Write operation detected, emitting CDC event',
  SHUTDOWN_START: 'Shutting down PartitionCoordinator',
  SHUTTING_DOWN_CDC_EMITTER: 'Shutting down CDCEmitter',
  SHUTTING_DOWN_RAFT_GROUP: 'Shutting down RaftGroup',
  SHUTTING_DOWN_SQLITE_STORE: 'Shutting down SQLiteStore',
  SHUTDOWN_COMPLETE: 'PartitionCoordinator shutdown complete',
  SHUTDOWN_COMPONENT_FAILED:
    'Component shutdown failed, continuing cleanup',
});

/**
 * Component names used in log and error messages.
 */
const COORDINATOR_COMPONENT = Object.freeze({
  SQLITE_STORE: 'SQLiteStore',
  RAFT_GROUP: 'RaftGroup',
  CDC_EMITTER: 'CDCEmitter',
});

/**
 * Regex pattern for detecting SELECT (read) queries.
 * Matches the SELECT keyword at the start of a trimmed,
 * uppercased SQL string.
 */
const COORDINATOR_READ_PATTERN = /^SELECT\b/;

export {
  COORDINATOR_COMPONENT,
  COORDINATOR_ERROR_MSG,
  COORDINATOR_LOG_MSG,
  COORDINATOR_READ_PATTERN,
  COORDINATOR_STATE,
};
