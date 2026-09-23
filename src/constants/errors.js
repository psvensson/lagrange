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
  // The writes this replica did not propose, by why (the partition write
  // kernel appends what it knows): its service shut down first, its proposal
  // queue is at capacity, the consensus port refused the proposal, or the
  // write was not handed to consensus before its commit deadline.
  WRITE_SERVICE_SHUTDOWN:
    'The partition service shut down before the write was proposed; it was ' +
    'not proposed',
  WRITE_BACKPRESSURE:
    'Partition write backpressure: the proposal queue is at capacity and the ' +
    'write was not proposed',
  WRITE_CONSENSUS_REFUSED:
    'The consensus port refused the proposal; the write was not proposed',
  WRITE_COMMIT_DEADLINE_EXCEEDED:
    'The write was not proposed before its commit deadline',
  // A committed write whose own application failed in the host environment
  // (the partition's committed-statement outcome owner appends the host's
  // code and message): it is committed and applied again when the host
  // recovers, so it did not fail for good.
  COMMITTED_STATEMENT_ENVIRONMENT_FAILED:
    'Committed partition statement failed in the host environment; the ' +
    'entry is not consumed and is applied again when the host recovers',
  PARTITION_SERVICE_NOT_FOUND: 'Partition service not found',
  NO_HANDLER_FOR_ADDRESS: 'No handler registered for address',
});

// The texts of the partition write answers that did not fail for good (the
// partition write kernel's isRetryableWriteFailureCode, by its codes' texts):
// no leader here, a consensus recovery in progress here, a write this replica
// did not propose, a write whose outcome is not known to this replica, or a
// committed write whose own application failed in the host environment.
// Partition write answers carry their code across every boundary, and a
// caller routes them again by that code alone (the kernel's
// isReroutableWriteFailureCode); these texts are only for the control
// plane's retry of a failure that reached it as text, never for routing a
// write again.
const RETRYABLE_WRITE_ERROR_FRAGMENTS = Object.freeze([
  ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
  ERRORS.CONSENSUS_RECOVERY_IN_PROGRESS,
  ERRORS.WRITE_SERVICE_SHUTDOWN,
  ERRORS.WRITE_BACKPRESSURE,
  ERRORS.WRITE_CONSENSUS_REFUSED,
  ERRORS.WRITE_COMMIT_DEADLINE_EXCEEDED,
  ERRORS.WRITE_OUTCOME_UNKNOWN,
  ERRORS.COMMITTED_STATEMENT_ENVIRONMENT_FAILED,
]);

/**
 * Whether an error text is the answer of a partition write that did not fail
 * for good (never a failed write). The text of the partition write kernel's
 * isRetryableWriteFailureCode, for a failure that reached its caller as text.
 * @param {*} message - The error text.
 * @return {boolean} Whether it names one of those answers.
 */
function isRetryableWriteError(message) {
  return typeof message === 'string' &&
    RETRYABLE_WRITE_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment));
}

const ERRNO = Object.freeze({
  EPERM: 'EPERM',
  EACCES: 'EACCES',
  EADDRINUSE: 'EADDRINUSE',
  ENOENT: 'ENOENT',
  NOT_RUNNING: 'ERR_SERVER_NOT_RUNNING',
});

export {
  ERRORS,
  ERRNO,
  isRetryableWriteError,
};
