/**
 * Constants for PartitionRaftNode module.
 * Requirements: 2.1, 2.5, 2.6
 *
 * @module partition/partition-raft-node-constants
 */

/**
 * Log messages for PartitionRaftNode operations.
 * @type {Object}
 */
const PARTITION_RAFT_NODE_LOG_MSG = Object.freeze({
  /** Logged when election start is deferred during initialization. */
  DEFERRING_ELECTION_START: 'Deferring election start',
});

export {
  PARTITION_RAFT_NODE_LOG_MSG,
};
