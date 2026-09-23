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
 * The code of a pending proposal released without an answer (its replica
 * stopped leading): a named outcome, so a proposer that holds a more specific
 * answer of its own reports that instead.
 * @type {string}
 */
const PROPOSAL_QUEUE_RELEASED_CODE = 'proposal_released_without_answer';

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
  PROPOSAL_QUEUE_RELEASED_CODE,
};
