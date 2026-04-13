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
import { NUM } from '../constants/index.js';
import { DEFAULT_SAFETY_INTERVAL_MS } from './wasm-service-constants.js';

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
    if (stryMutAct_9fa48("162951")) {
      {}
    } else {
      stryCov_9fa48("162951");
      this.intervalMs = stryMutAct_9fa48("162952") ? intervalMs && DEFAULT_SAFETY_INTERVAL_MS : (stryCov_9fa48("162952"), intervalMs ?? DEFAULT_SAFETY_INTERVAL_MS);
      this.lastLeaderIndex = NUM.ZERO;
      this.lastLeaderTimestamp = NUM.ZERO;
      this.localAppliedIndex = NUM.ZERO;
    }
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
    if (stryMutAct_9fa48("162953")) {
      {}
    } else {
      stryCov_9fa48("162953");
      this.lastLeaderIndex = committedIndex;
      this.lastLeaderTimestamp = timestamp;
      return stryMutAct_9fa48("162954") ? {} : (stryCov_9fa48("162954"), {
        committedIndex,
        timestamp
      });
    }
  }

  /**
   * Called by followers when they receive the leader's broadcast.
   *
   * @param {number} committedIndex — leader's committed log index
   * @param {number} timestamp — leader's broadcast timestamp
   */
  updateLeaderState(committedIndex, timestamp) {
    if (stryMutAct_9fa48("162955")) {
      {}
    } else {
      stryCov_9fa48("162955");
      this.lastLeaderIndex = committedIndex;
      this.lastLeaderTimestamp = timestamp;
    }
  }

  /**
   * Called by followers to determine whether they can serve a
   * strong read from local state.
   *
   * @returns {boolean} true when local state is fresh enough
   */
  canServeRead() {
    if (stryMutAct_9fa48("162956")) {
      {}
    } else {
      stryCov_9fa48("162956");
      const withinIndex = stryMutAct_9fa48("162960") ? this.localAppliedIndex < this.lastLeaderIndex : stryMutAct_9fa48("162959") ? this.localAppliedIndex > this.lastLeaderIndex : stryMutAct_9fa48("162958") ? false : stryMutAct_9fa48("162957") ? true : (stryCov_9fa48("162957", "162958", "162959", "162960"), this.localAppliedIndex >= this.lastLeaderIndex);
      const withinTime = stryMutAct_9fa48("162964") ? Date.now() - this.lastLeaderTimestamp >= this.intervalMs : stryMutAct_9fa48("162963") ? Date.now() - this.lastLeaderTimestamp <= this.intervalMs : stryMutAct_9fa48("162962") ? false : stryMutAct_9fa48("162961") ? true : (stryCov_9fa48("162961", "162962", "162963", "162964"), (stryMutAct_9fa48("162965") ? Date.now() + this.lastLeaderTimestamp : (stryCov_9fa48("162965"), Date.now() - this.lastLeaderTimestamp)) < this.intervalMs);
      return stryMutAct_9fa48("162968") ? withinIndex || withinTime : stryMutAct_9fa48("162967") ? false : stryMutAct_9fa48("162966") ? true : (stryCov_9fa48("162966", "162967", "162968"), withinIndex && withinTime);
    }
  }

  /**
   * Called when a Raft entry is applied locally.
   *
   * @param {number} index — the applied log index
   */
  updateLocalAppliedIndex(index) {
    if (stryMutAct_9fa48("162969")) {
      {}
    } else {
      stryCov_9fa48("162969");
      this.localAppliedIndex = index;
    }
  }
}
export { SafetyInterval };