const ERRORS = Object.freeze({
  // Query execution / routing
  QUERY_FAILED: 'Query failed',
  SYSTEM_CACHE_NOT_AVAILABLE: 'System cache not available',
  SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE:
    'System cache not available for partition lookup',
  NO_LEADER_AVAILABLE_FOR_WRITE: 'No leader available for write operation',
  // A write refused while this replica's consensus group is held by its host
  // failure (the partition write kernel appends the reason and retry time).
  CONSENSUS_RECOVERY_IN_PROGRESS:
    'Consensus recovery in progress on this replica',
  // A pending write released after it was handed to consensus.
  WRITE_OUTCOME_UNKNOWN:
    'The proposal was accepted into consensus and its outcome is not known ' +
    'to this replica; a retry with the same entryId is idempotent',
  PARTITION_SERVICE_NOT_FOUND: 'Partition service not found',
  NO_HANDLER_FOR_ADDRESS: 'No handler registered for address',
});

// The answers of a partition write this replica did not take, which a caller
// may route again (to the current leader, or here once the replica recovers):
// no leader here, a consensus recovery in progress here, or a released write
// whose outcome this replica cannot know. Routers classify by these, never by
// a text of their own.
const REROUTABLE_WRITE_ERROR_FRAGMENTS = Object.freeze([
  ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
  ERRORS.CONSENSUS_RECOVERY_IN_PROGRESS,
  ERRORS.WRITE_OUTCOME_UNKNOWN,
]);

/**
 * Whether an error text is the answer of a partition write a caller may route
 * again.
 * @param {*} message - The error text.
 * @return {boolean} Whether it names one of those answers.
 */
function isReroutableWriteError(message) {
  return typeof message === 'string' &&
    REROUTABLE_WRITE_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment));
}

const ERRNO = Object.freeze({
  EPERM: 'EPERM',
  EACCES: 'EACCES',
  EADDRINUSE: 'EADDRINUSE',
  ENOENT: 'ENOENT',
  NOT_RUNNING: 'ERR_SERVER_NOT_RUNNING',
});

export {ERRORS, ERRNO, REROUTABLE_WRITE_ERROR_FRAGMENTS, isReroutableWriteError};
