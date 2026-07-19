/**
 * Constants for ProposalQueue module.
 * Requirements: 3.1
 *
 * @module partition/proposal-queue-constants
 */

/**
 * Default configuration values for the ProposalQueue.
 * @type {Object}
 */
const PROPOSAL_QUEUE_DEFAULT = Object.freeze({
  MAX_CAPACITY: 1000,
});

/**
 * Error messages for ProposalQueue operations.
 * @type {Object}
 */
const PROPOSAL_QUEUE_ERROR_MSG = Object.freeze({
  BACKPRESSURE: 'Proposal queue at capacity — backpressure applied',
  DUPLICATE_ENTRY: 'Proposal queue already owns this entry ID',
});

/**
 * Log messages for ProposalQueue operations.
 * @type {Object}
 */
const PROPOSAL_QUEUE_LOG_MSG = Object.freeze({
  ENQUEUE: 'Proposal enqueued',
  RESOLVE: 'Proposal resolved',
  REJECT: 'Proposal rejected',
});

export {
  PROPOSAL_QUEUE_DEFAULT,
  PROPOSAL_QUEUE_ERROR_MSG,
  PROPOSAL_QUEUE_LOG_MSG,
};
