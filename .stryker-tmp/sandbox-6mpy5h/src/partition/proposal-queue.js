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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { PROPOSAL_QUEUE_DEFAULT, PROPOSAL_QUEUE_ERROR_MSG } from './proposal-queue-constants.js';

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
    if (stryMutAct_9fa48("107634")) {
      {}
    } else {
      stryCov_9fa48("107634");
      this.maxCapacity = stryMutAct_9fa48("107637") ? options.maxCapacity && PROPOSAL_QUEUE_DEFAULT.MAX_CAPACITY : stryMutAct_9fa48("107636") ? false : stryMutAct_9fa48("107635") ? true : (stryCov_9fa48("107635", "107636", "107637"), options.maxCapacity || PROPOSAL_QUEUE_DEFAULT.MAX_CAPACITY);
      this.pendingCommits = new Map();
    }
  }

  /**
   * Current number of pending proposals in the queue.
   * @return {number} Queue size.
   */
  get size() {
    if (stryMutAct_9fa48("107638")) {
      {}
    } else {
      stryCov_9fa48("107638");
      return this.pendingCommits.size;
    }
  }

  /**
   * Whether the queue is at capacity.
   * @return {boolean} True if size >= maxCapacity.
   */
  get isFull() {
    if (stryMutAct_9fa48("107639")) {
      {}
    } else {
      stryCov_9fa48("107639");
      return stryMutAct_9fa48("107643") ? this.size < this.maxCapacity : stryMutAct_9fa48("107642") ? this.size > this.maxCapacity : stryMutAct_9fa48("107641") ? false : stryMutAct_9fa48("107640") ? true : (stryCov_9fa48("107640", "107641", "107642", "107643"), this.size >= this.maxCapacity);
    }
  }

  /**
   * Get a pending proposal entry without removing it.
   *
   * @param {string} entryId - Unique identifier for the proposal.
   * @return {Object|undefined} The pending entry, or undefined if not found.
   */
  get(entryId) {
    if (stryMutAct_9fa48("107644")) {
      {}
    } else {
      stryCov_9fa48("107644");
      return this.pendingCommits.get(entryId);
    }
  }

  /**
   * Check if a proposal exists in the queue.
   *
   * @param {string} entryId - Unique identifier for the proposal.
   * @return {boolean} True if the entry exists.
   */
  has(entryId) {
    if (stryMutAct_9fa48("107645")) {
      {}
    } else {
      stryCov_9fa48("107645");
      return this.pendingCommits.has(entryId);
    }
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
    if (stryMutAct_9fa48("107646")) {
      {}
    } else {
      stryCov_9fa48("107646");
      if (stryMutAct_9fa48("107648") ? false : stryMutAct_9fa48("107647") ? true : (stryCov_9fa48("107647", "107648"), this.isFull)) {
        if (stryMutAct_9fa48("107649")) {
          {}
        } else {
          stryCov_9fa48("107649");
          throw new Error(PROPOSAL_QUEUE_ERROR_MSG.BACKPRESSURE);
        }
      }
      this.pendingCommits.set(entryId, entry);
    }
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
    if (stryMutAct_9fa48("107650")) {
      {}
    } else {
      stryCov_9fa48("107650");
      const pending = this.pendingCommits.get(entryId);
      if (stryMutAct_9fa48("107653") ? false : stryMutAct_9fa48("107652") ? true : stryMutAct_9fa48("107651") ? pending : (stryCov_9fa48("107651", "107652", "107653"), !pending)) {
        if (stryMutAct_9fa48("107654")) {
          {}
        } else {
          stryCov_9fa48("107654");
          return stryMutAct_9fa48("107655") ? true : (stryCov_9fa48("107655"), false);
        }
      }
      if (stryMutAct_9fa48("107657") ? false : stryMutAct_9fa48("107656") ? true : (stryCov_9fa48("107656", "107657"), pending.timeoutId)) {
        if (stryMutAct_9fa48("107658")) {
          {}
        } else {
          stryCov_9fa48("107658");
          clearTimeout(pending.timeoutId);
        }
      }
      this.pendingCommits.delete(entryId);
      if (stryMutAct_9fa48("107660") ? false : stryMutAct_9fa48("107659") ? true : (stryCov_9fa48("107659", "107660"), pending.resolve)) {
        if (stryMutAct_9fa48("107661")) {
          {}
        } else {
          stryCov_9fa48("107661");
          pending.resolve(result);
        }
      }
      return stryMutAct_9fa48("107662") ? false : (stryCov_9fa48("107662"), true);
    }
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
    if (stryMutAct_9fa48("107663")) {
      {}
    } else {
      stryCov_9fa48("107663");
      const pending = this.pendingCommits.get(entryId);
      if (stryMutAct_9fa48("107666") ? false : stryMutAct_9fa48("107665") ? true : stryMutAct_9fa48("107664") ? pending : (stryCov_9fa48("107664", "107665", "107666"), !pending)) {
        if (stryMutAct_9fa48("107667")) {
          {}
        } else {
          stryCov_9fa48("107667");
          return stryMutAct_9fa48("107668") ? true : (stryCov_9fa48("107668"), false);
        }
      }
      if (stryMutAct_9fa48("107670") ? false : stryMutAct_9fa48("107669") ? true : (stryCov_9fa48("107669", "107670"), pending.timeoutId)) {
        if (stryMutAct_9fa48("107671")) {
          {}
        } else {
          stryCov_9fa48("107671");
          clearTimeout(pending.timeoutId);
        }
      }
      this.pendingCommits.delete(entryId);
      if (stryMutAct_9fa48("107673") ? false : stryMutAct_9fa48("107672") ? true : (stryCov_9fa48("107672", "107673"), pending.reject)) {
        if (stryMutAct_9fa48("107674")) {
          {}
        } else {
          stryCov_9fa48("107674");
          const err = error instanceof Error ? error : new Error(error);
          pending.reject(err);
        }
      }
      return stryMutAct_9fa48("107675") ? false : (stryCov_9fa48("107675"), true);
    }
  }

  /**
   * Clear all pending proposals. Used during shutdown or leadership loss.
   * Rejects all pending proposals with the given reason.
   *
   * @param {string} reason - Reason for clearing the queue.
   */
  clear(reason) {
    if (stryMutAct_9fa48("107676")) {
      {}
    } else {
      stryCov_9fa48("107676");
      for (const [entryId, pending] of this.pendingCommits) {
        if (stryMutAct_9fa48("107677")) {
          {}
        } else {
          stryCov_9fa48("107677");
          if (stryMutAct_9fa48("107679") ? false : stryMutAct_9fa48("107678") ? true : (stryCov_9fa48("107678", "107679"), pending.timeoutId)) {
            if (stryMutAct_9fa48("107680")) {
              {}
            } else {
              stryCov_9fa48("107680");
              clearTimeout(pending.timeoutId);
            }
          }
          if (stryMutAct_9fa48("107682") ? false : stryMutAct_9fa48("107681") ? true : (stryCov_9fa48("107681", "107682"), pending.reject)) {
            if (stryMutAct_9fa48("107683")) {
              {}
            } else {
              stryCov_9fa48("107683");
              pending.reject(new Error(reason));
            }
          }
          this.pendingCommits.delete(entryId);
        }
      }
    }
  }

  /**
   * Get queue statistics for monitoring.
   *
   * @return {Object} Stats object with size and maxCapacity.
   */
  getStats() {
    if (stryMutAct_9fa48("107684")) {
      {}
    } else {
      stryCov_9fa48("107684");
      return stryMutAct_9fa48("107685") ? {} : (stryCov_9fa48("107685"), {
        size: this.size,
        maxCapacity: this.maxCapacity
      });
    }
  }
}
export { ProposalQueue };