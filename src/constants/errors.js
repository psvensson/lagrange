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
  PARTITION_SERVICE_NOT_FOUND: 'Partition service not found',
  NO_HANDLER_FOR_ADDRESS: 'No handler registered for address',
});

// The texts of the partition write answers a caller may route again (to the
// current leader, or here once the state they name has passed): no leader
// here, a consensus recovery in progress here, or a write this replica did
// not propose. A router that holds the answer branches on its code (the
// partition write kernel's isReroutableWriteFailureCode); these texts are for
// the routers that receive only an error text, which classify by them, never
// by a text of their own. The text of a released write whose outcome this
// replica cannot know is not among them: a re-proposal is idempotent only
// under the write's entryId, which a text does not carry, so that answer is
// the client's to decide.
const REROUTABLE_WRITE_ERROR_FRAGMENTS = Object.freeze([
  ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
  ERRORS.CONSENSUS_RECOVERY_IN_PROGRESS,
  ERRORS.WRITE_SERVICE_SHUTDOWN,
  ERRORS.WRITE_BACKPRESSURE,
  ERRORS.WRITE_CONSENSUS_REFUSED,
  ERRORS.WRITE_COMMIT_DEADLINE_EXCEEDED,
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

/**
 * Whether an error text is the answer of a partition write that did not fail
 * for good: one a caller may route again, or one whose outcome is not known
 * to the replica that answered (never a failed write, and never routed again
 * by its text). The text of the partition write kernel's
 * isRetryableWriteFailureCode.
 * @param {*} message - The error text.
 * @return {boolean} Whether it names one of those answers.
 */
function isRetryableWriteError(message) {
  return isReroutableWriteError(message) || (typeof message === 'string' &&
    message.includes(ERRORS.WRITE_OUTCOME_UNKNOWN));
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
  REROUTABLE_WRITE_ERROR_FRAGMENTS,
  isReroutableWriteError,
  isRetryableWriteError,
};
