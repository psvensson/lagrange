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
 * The code of a pending proposal released without an answer from consensus
 * (its replica stopped leading, or is shutting down): a named outcome whose
 * release answer says what the queue knew of the write (its proposal state),
 * so a proposer that holds a more specific answer of its own (the port's
 * refusal) reports that instead.
 * @type {string}
 */
const PROPOSAL_QUEUE_RELEASED_CODE = 'proposal_released_without_answer';

/**
 * Where a pending write stands with consensus. QUEUED: registered, not handed
 * to consensus (or handed and deferred with nothing entering the core).
 * PROPOSED: handed to consensus, so its entry may commit whatever this replica
 * answers.
 * @type {Object}
 */
const PROPOSAL_QUEUE_PROPOSAL_STATE = Object.freeze({
  QUEUED: 'queued',
  PROPOSED: 'proposed',
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
  PROPOSAL_QUEUE_PROPOSAL_STATE,
  PROPOSAL_QUEUE_RELEASED_CODE,
};
