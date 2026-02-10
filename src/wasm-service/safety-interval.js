import {NUM} from '../constants/index.js';
import {DEFAULT_SAFETY_INTERVAL_MS} from './wasm-service-constants.js';

/**
 * SafetyInterval implements a CockroachDB-style closed-timestamp
 * mechanism for strong read consistency without routing all reads
 * to the Raft leader.
 *
 * The leader periodically broadcasts its committed log index and
 * timestamp. Followers track this state and their own applied
 * index. A follower can serve a read locally when:
 *   1. Its applied index >= the last leader broadcast index
 *   2. The time since the last leader broadcast < intervalMs
 */
class SafetyInterval {
  /**
   * @param {number} [intervalMs] — staleness bound in milliseconds
   */
  constructor(intervalMs) {
    this.intervalMs = intervalMs ?? DEFAULT_SAFETY_INTERVAL_MS;
    this.lastLeaderIndex = NUM.ZERO;
    this.lastLeaderTimestamp = NUM.ZERO;
    this.localAppliedIndex = NUM.ZERO;
  }

  /**
   * Called by the leader to produce the state object that should
   * be broadcast to followers.
   *
   * @param {number} committedIndex — leader's committed log index
   * @param {number} timestamp — current timestamp (ms since epoch)
   * @returns {{ committedIndex: number, timestamp: number }}
   */
  broadcastState(committedIndex, timestamp) {
    this.lastLeaderIndex = committedIndex;
    this.lastLeaderTimestamp = timestamp;
    return {committedIndex, timestamp};
  }

  /**
   * Called by followers when they receive the leader's broadcast.
   *
   * @param {number} committedIndex — leader's committed log index
   * @param {number} timestamp — leader's broadcast timestamp
   */
  updateLeaderState(committedIndex, timestamp) {
    this.lastLeaderIndex = committedIndex;
    this.lastLeaderTimestamp = timestamp;
  }

  /**
   * Called by followers to determine whether they can serve a
   * strong read from local state.
   *
   * @returns {boolean} true when local state is fresh enough
   */
  canServeRead() {
    const withinIndex =
      this.localAppliedIndex >= this.lastLeaderIndex;
    const withinTime =
      (Date.now() - this.lastLeaderTimestamp) < this.intervalMs;
    return withinIndex && withinTime;
  }

  /**
   * Called when a Raft entry is applied locally.
   *
   * @param {number} index — the applied log index
   */
  updateLocalAppliedIndex(index) {
    this.localAppliedIndex = index;
  }
}

export {SafetyInterval};
