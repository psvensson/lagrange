/**
 * Constants for PartitionReplicationHandler.
 * Extracted from partition-service-constants.js for single responsibility.
 * Requirements: 1.1, 1.8, 2.1, 2.5
 *
 * @module partition/partition-replication-handler-constants
 */

import {TIME_MS} from '../constants/time.js';

/**
 * Log messages for replication handler operations.
 * @type {Object}
 */
const PARTITION_REPLICATION_HANDLER_LOG_MSG = Object.freeze({
  PROPOSE_WRITE_CALLED: 'proposeWrite called',
  FORWARDING_WRITE_TO_LEADER: 'Forwarding write to leader',
  FORWARD_WRITE_SUCCESS: 'Forward write succeeded',
  APPLY_WRITE_CALLED: 'applyWrite called',
  APPLY_WRITE_SINGLE_REPLICA: 'applyWrite single-replica direct execution',
  APPLY_WRITE_MULTI_REPLICA: 'applyWrite multi-replica Raft proposal',
  APPLY_WRITE_SUCCESS: 'applyWrite succeeded',
  RAFT_COMMAND_SENT: 'Raft command sent for replication',
  HANDLING_FORWARD_WRITE: 'Handling forwarded write from follower',
  RESOLVING_LEADER_ADDRESS: 'Resolving leader address for write forwarding',
  LEADER_ADDRESS_RESOLVED: 'Leader address resolved',
  NO_LEADER_AVAILABLE: 'No leader available for write',
  EXECUTE_SQL: 'Executing SQL from write entry',
  CDC_EVENT_GENERATION_FAILED: 'CDC event generation failed after write',
});

/**
 * Error messages for replication handler operations.
 * @type {Object}
 */
const PARTITION_REPLICATION_HANDLER_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'PartitionReplicationHandler not initialized',
  NO_LEADER_AVAILABLE: 'No leader available for write',
  INVALID_FORWARD_WRITE: 'Invalid FORWARD_WRITE message - missing operation',
  FORWARD_WRITE_FAILED: 'Failed to forward write to leader',
  APPLY_WRITE_FAILED: 'Failed to apply write',
  RAFT_COMMAND_FAILED: 'Raft command failed',
  RAFT_COMMIT_TIMEOUT: 'Raft commit timeout',
  /**
   * Generate error message for forward write failure.
   * @param {string} message - Original error message.
   * @return {string} Formatted error message.
   */
  forwardWriteFailed: (message) =>
    `Failed to forward write to leader: ${message}`,
});

/**
 * Default values for replication handler.
 * @type {Object}
 */
const PARTITION_REPLICATION_HANDLER_DEFAULT = Object.freeze({
  EMPTY_PARAMS: [],
  RAFT_COMMIT_TIMEOUT_MS: TIME_MS.DEFAULT_RPC_TIMEOUT,
});

export {
  PARTITION_REPLICATION_HANDLER_LOG_MSG,
  PARTITION_REPLICATION_HANDLER_ERROR_MSG,
  PARTITION_REPLICATION_HANDLER_DEFAULT,
};
