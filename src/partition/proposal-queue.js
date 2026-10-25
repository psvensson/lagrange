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
  PROPOSAL_QUEUE_ADMISSION_CLASS,
  PROPOSAL_QUEUE_BACKPRESSURE_CODE,
  PROPOSAL_QUEUE_DEFAULT,
  PROPOSAL_QUEUE_ERROR_MSG,
  PROPOSAL_QUEUE_PROPOSAL_STATE,
  PROPOSAL_QUEUE_RELEASED_CODE,
} from './proposal-queue-constants.js';
import {resolveTimeSource} from '../time/time-source.js';

function releasedProposalOperation() {
  return Object.assign(new Error(PROPOSAL_QUEUE_RELEASED_CODE),
    {code: PROPOSAL_QUEUE_RELEASED_CODE});
}

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
   * @param {Object<string, number>} [options.reservedCapacities] - Protected
   *   capacity per owner-defined admission class, within the same total bound.
   */
  constructor(options = {}) {
    this.maxCapacity =
      options.maxCapacity || PROPOSAL_QUEUE_DEFAULT.MAX_CAPACITY;
    this.reservedCapacities = new Map(Object.entries(options.reservedCapacities ?? {}));
    const reserved = [...this.reservedCapacities.values()];
    if (reserved.some((count) => !Number.isSafeInteger(count) || count < 0) ||
        reserved.reduce((sum, count) => sum + count, 0) > this.maxCapacity) {
      throw new Error(PROPOSAL_QUEUE_ERROR_MSG.INVALID_RESERVED_CAPACITY);
    }
    this.pendingCommits = new Map();
    // Proposal state and optional raw-operation custody share this existing
    // queue metadata. A retired response can still consume its original slot.
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

  /** Whether this entry still owns a response, rather than only raw cleanup. */
  isResponsePending(entryId) {
    return this.proposals.get(entryId)?.responsePending === true;
  }

  /**
   * Enqueue a new proposal. Throws if the queue is at capacity.
   *
   * @param {string} entryId - Unique identifier for the proposal.
   * @param {Object} entry - Proposal entry containing resolve/reject
   *   callbacks and timeout information.
   * @param {string} [admissionClass=PROPOSAL_QUEUE_ADMISSION_CLASS.ORDINARY] - Owner-selected capacity class.
   * @throws {Error} Backpressure error when queue is at capacity, typed with
   *   PROPOSAL_QUEUE_BACKPRESSURE_CODE and the queue's retryAfterMs.
   */
  enqueue(entryId, entry, admissionClass = PROPOSAL_QUEUE_ADMISSION_CLASS.ORDINARY) {
    if (this.pendingCommits.has(entryId)) {
      throw new Error(PROPOSAL_QUEUE_ERROR_MSG.DUPLICATE_ENTRY);
    }
    if (this.size >= this.capacityFor(admissionClass)) {
      throw Object.assign(new Error(PROPOSAL_QUEUE_ERROR_MSG.BACKPRESSURE), {
        code: PROPOSAL_QUEUE_BACKPRESSURE_CODE,
        retryAfterMs: PROPOSAL_QUEUE_DEFAULT.BACKPRESSURE_RETRY_AFTER_MS,
      });
    }
    this.pendingCommits.set(entryId, entry);
    this.proposals.set(entryId, {state: PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED,
      responsePending: true, rawOperation: null, admissionClass});
  }

  // Capacity not currently used by another reserved class stays available
  // to that class. All classes share the remaining slots and one hard bound.
  capacityFor(admissionClass) {
    let unavailable = 0;
    for (const [kind, reserved] of this.reservedCapacities) {
      if (kind === admissionClass) continue;
      let used = 0;
      for (const proposal of this.proposals.values()) {
        if (proposal.admissionClass === kind) used += 1;
      }
      unavailable += Math.max(0, reserved - used);
    }
    return this.maxCapacity - unavailable;
  }

  /**
   * Retain one raw operation before it begins. Response retirement keeps this
   * exact key/capacity occupied until the operation actually settles. Callers
   * must fence operation admission themselves; an admitted operation is never
   * cancelled here. Another attempt for this same entry joins its still-open
   * operation. Ordinary queue users do not opt into this retention.
   * @param {string} entryId - The reserved entry.
   * @param {Function} operation - The original operation, before a response race.
   * @return {Promise<*>} The original owned operation promise.
   */
  ownOperation(entryId, operation) {
    const pending = this.pendingCommits.get(entryId);
    const custody = this.proposals.get(entryId);
    if (!pending || !custody?.responsePending) {
      throw releasedProposalOperation();
    }
    if (custody.rawOperation !== null) return custody.rawOperation;
    const raw = Promise.resolve().then(() => {
      if (!custody.responsePending || this.pendingCommits.get(entryId) !== pending ||
          this.proposals.get(entryId) !== custody) throw releasedProposalOperation();
      return operation();
    });
    custody.rawOperation = raw;
    const closed = () => {
      if (custody.rawOperation !== raw) return;
      custody.rawOperation = null;
      this.removeClosedEntry(entryId, pending, custody);
    };
    raw.then(closed, closed);
    return raw;
  }

  /** Remove only this settled entry, after all its raw operations close. */
  removeClosedEntry(entryId, pending, custody) {
    if (custody.responsePending || custody.rawOperation !== null ||
        this.pendingCommits.get(entryId) !== pending || this.proposals.get(entryId) !== custody) {
      return;
    }
    this.pendingCommits.delete(entryId);
    this.proposals.delete(entryId);
  }

  /** Retire one response; raw closure, when present, owns later removal. */
  takeResponse(entryId) {
    const pending = this.pendingCommits.get(entryId);
    const custody = this.proposals.get(entryId);
    if (!pending || !custody?.responsePending) return null;
    custody.responsePending = false;
    if (pending.timeoutId !== null && pending.timeoutId !== undefined) {
      this.timeSource.clearTimeout(pending.timeoutId);
    }
    this.removeClosedEntry(entryId, pending, custody);
    return pending;
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
    if (!this.isResponsePending(entryId)) {
      return false;
    }
    this.proposals.get(entryId).state = proposal;
    return true;
  }

  /**
   * Resolve a pending response. Frees capacity once optional raw work closes.
   *
   * @param {string} entryId - Unique identifier of the proposal.
   * @param {Object} result - Resolution result to pass to the
   *   proposal's resolve callback.
   * @return {boolean} True if the entry was found and resolved.
   */
  resolve(entryId, result) {
    const pending = this.takeResponse(entryId);
    if (!pending) {
      return false;
    }
    if (pending.resolve) {
      pending.resolve(result);
    }
    return true;
  }

  /**
   * Reject a pending response. Frees capacity once optional raw work closes.
   *
   * @param {string} entryId - Unique identifier of the proposal.
   * @param {Error|string} error - Error to pass to the proposal's
   *   reject callback.
   * @return {boolean} True if the entry was found and rejected.
   */
  reject(entryId, error) {
    const pending = this.takeResponse(entryId);
    if (!pending) {
      return false;
    }
    if (pending.reject) {
      const err = error instanceof Error ? error : new Error(error);
      pending.reject(err);
    }
    return true;
  }

  /**
   * Release every pending proposal without an answer from consensus (its
   * replica stopped leading, or is shutting down). Each is released as
   * releaseEntry releases one.
   *
   * @param {Function} answerOf - ({entryId, proposal, logIndex}) => the
   *   released write's answer ({success: false, error, ...}).
   */
  release(answerOf) {
    for (const entryId of [...this.pendingCommits.keys()]) {
      this.releaseEntry(entryId, answerOf);
    }
  }

  /**
   * Release one pending proposal without an answer from consensus (its
   * commit deadline passed). It is rejected with a
   * PROPOSAL_QUEUE_RELEASED_CODE error carrying the answer `answerOf` gives
   * it from what the queue knew of it; this is the queue's one release.
   *
   * @param {string} entryId - Unique identifier of the proposal.
   * @param {Function} answerOf - ({entryId, proposal, logIndex}) => the
   *   released write's answer ({success: false, error, ...}).
   * @return {boolean} True if the entry was pending and was released.
   */
  releaseEntry(entryId, answerOf) {
    const pending = this.pendingCommits.get(entryId);
    if (!pending || !this.isResponsePending(entryId)) {
      return false;
    }
    const answer = answerOf(Object.freeze({
      entryId,
      proposal: this.proposals.get(entryId).state,
      logIndex: Number.isFinite(pending.logIndex) ? pending.logIndex : null,
    }));
    const released = pending.reject ? Object.assign(new Error(answer.error),
      {code: PROPOSAL_QUEUE_RELEASED_CODE, answer}) : null;
    return this.reject(entryId, released);
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
