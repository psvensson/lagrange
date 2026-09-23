/**
 * ProposalQueue - Bounded queue for pending Raft write proposals.
 *
 * Provides backpressure when the queue reaches its configured capacity,
 * preventing unbounded memory consumption under load.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 *
 * @module partition/proposal-queue
 */

import {
  PROPOSAL_QUEUE_DEFAULT,
  PROPOSAL_QUEUE_ERROR_MSG,
  PROPOSAL_QUEUE_PROPOSAL_STATE,
  PROPOSAL_QUEUE_RELEASED_CODE,
} from './proposal-queue-constants.js';
import {resolveTimeSource} from '../time/time-source.js';

/**
 * Bounded queue for pending Raft write proposals with backpressure.
 *
 * Wraps a Map of pending commits with capacity enforcement.
 * When the queue is full, new proposals are rejected immediately
 * with a backpressure error rather than consuming unbounded memory.
 *
 * @class
 */
class ProposalQueue {
  /**
   * Create a new ProposalQueue.
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.maxCapacity] - Maximum queue capacity.
   *   Defaults to PROPOSAL_QUEUE_DEFAULT.MAX_CAPACITY.
   */
  constructor(options = {}) {
    this.maxCapacity =
      options.maxCapacity || PROPOSAL_QUEUE_DEFAULT.MAX_CAPACITY;
    this.pendingCommits = new Map();
    // Each pending write's PROPOSAL_QUEUE_PROPOSAL_STATE, owned here so a
    // release can say what it knew of the write.
    this.proposals = new Map();
    // The deadlines in this queue were armed by the owning replica's clock,
    // so they are cleared on the same one. Clearing a non-host handle through
    // the global would miss it, or cancel an unrelated host timer that
    // happened to share its numeric id.
    this.timeSource = resolveTimeSource(options);
  }

  /**
   * Current number of pending proposals in the queue.
   * @return {number} Queue size.
   */
  get size() {
    return this.pendingCommits.size;
  }

  /**
   * Whether the queue is at capacity.
   * @return {boolean} True if size >= maxCapacity.
   */
  get isFull() {
    return this.size >= this.maxCapacity;
  }

  /**
   * Get a pending proposal entry without removing it.
   *
   * @param {string} entryId - Unique identifier for the proposal.
   * @return {Object|undefined} The pending entry, or undefined if not found.
   */
  get(entryId) {
    return this.pendingCommits.get(entryId);
  }

  /**
   * Check if a proposal exists in the queue.
   *
   * @param {string} entryId - Unique identifier for the proposal.
   * @return {boolean} True if the entry exists.
   */
  has(entryId) {
    return this.pendingCommits.has(entryId);
  }

  /**
   * Enqueue a new proposal. Throws if the queue is at capacity.
   *
   * @param {string} entryId - Unique identifier for the proposal.
   * @param {Object} entry - Proposal entry containing resolve/reject
   *   callbacks and timeout information.
   * @throws {Error} Backpressure error when queue is at capacity.
   */
  enqueue(entryId, entry) {
    if (this.pendingCommits.has(entryId)) {
      throw new Error(PROPOSAL_QUEUE_ERROR_MSG.DUPLICATE_ENTRY);
    }
    if (this.isFull) {
      throw new Error(PROPOSAL_QUEUE_ERROR_MSG.BACKPRESSURE);
    }
    this.pendingCommits.set(entryId, entry);
    this.proposals.set(entryId, PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED);
  }

  /**
   * Record where a pending write stands with consensus.
   *
   * @param {string} entryId - Unique identifier of the proposal.
   * @param {string} proposal - A PROPOSAL_QUEUE_PROPOSAL_STATE.
   * @return {boolean} True if the write is still pending (a released or
   *   answered write is never handed to consensus afterwards).
   */
  markProposal(entryId, proposal) {
    if (!this.pendingCommits.has(entryId)) {
      return false;
    }
    this.proposals.set(entryId, proposal);
    return true;
  }

  /**
   * Resolve a pending proposal and remove it from the queue.
   * Frees capacity for new proposals.
   *
   * @param {string} entryId - Unique identifier of the proposal.
   * @param {Object} result - Resolution result to pass to the
   *   proposal's resolve callback.
   * @return {boolean} True if the entry was found and resolved.
   */
  resolve(entryId, result) {
    const pending = this.pendingCommits.get(entryId);
    if (!pending) {
      return false;
    }
    if (pending.timeoutId) {
      this.timeSource.clearTimeout(pending.timeoutId);
    }
    this.pendingCommits.delete(entryId);
    this.proposals.delete(entryId);
    if (pending.resolve) {
      pending.resolve(result);
    }
    return true;
  }

  /**
   * Reject a pending proposal and remove it from the queue.
   * Frees capacity for new proposals.
   *
   * @param {string} entryId - Unique identifier of the proposal.
   * @param {Error|string} error - Error to pass to the proposal's
   *   reject callback.
   * @return {boolean} True if the entry was found and rejected.
   */
  reject(entryId, error) {
    const pending = this.pendingCommits.get(entryId);
    if (!pending) {
      return false;
    }
    if (pending.timeoutId) {
      this.timeSource.clearTimeout(pending.timeoutId);
    }
    this.pendingCommits.delete(entryId);
    this.proposals.delete(entryId);
    if (pending.reject) {
      const err = error instanceof Error ? error : new Error(error);
      pending.reject(err);
    }
    return true;
  }

  /**
   * Release every pending proposal without an answer from consensus. Each is
   * rejected with a PROPOSAL_QUEUE_RELEASED_CODE error carrying the answer
   * `answerOf` gives it from what the queue knew of it.
   *
   * @param {Function} answerOf - ({entryId, proposal, logIndex}) => the
   *   released write's answer ({success: false, error, ...}).
   */
  release(answerOf) {
    for (const [entryId, pending] of this.pendingCommits) {
      if (pending.timeoutId) {
        this.timeSource.clearTimeout(pending.timeoutId);
      }
      const answer = answerOf(Object.freeze({
        entryId,
        proposal: this.proposals.get(entryId),
        logIndex: Number.isFinite(pending.logIndex) ? pending.logIndex : null,
      }));
      this.pendingCommits.delete(entryId);
      this.proposals.delete(entryId);
      if (pending.reject) {
        const released = new Error(answer.error);
        released.code = PROPOSAL_QUEUE_RELEASED_CODE;
        released.answer = answer;
        pending.reject(released);
      }
    }
  }

  /**
   * Release every pending proposal with one plain reason (shutdown).
   *
   * @param {string} reason - Reason for clearing the queue.
   */
  clear(reason) {
    this.release(() => ({success: false, error: reason}));
  }

  /**
   * Get queue statistics for monitoring.
   *
   * @return {Object} Stats object with size and maxCapacity.
   */
  getStats() {
    return {
      size: this.size,
      maxCapacity: this.maxCapacity,
    };
  }
}

export {ProposalQueue};
