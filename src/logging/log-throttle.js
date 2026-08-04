/**
 * Per-key, time-windowed log throttle for hot diagnostic paths.
 *
 * Live evidence (movielens-lagrange-service-affinity-live,
 * run-2026-08-04-full): unthrottled `info` diagnostics on the busiest node
 * emitted thousands of lines in a single run (2200 "Storage admission
 * allowed", 3300+ CDC "Fetching/Fetched row", 419 "Raft leadership
 * transition evidence"). Piped to a parent stream, that volume backs up the
 * stdout pipe and starves the event loop — the documented observer effect
 * that invites raft heartbeat starvation and leadership storms (see
 * `LAGRANGE_LOG_FILE` in src/logging/logging-service.js).
 *
 * A throttle that admits the first occurrence of each distinct key at once,
 * then at most one per `windowMs`, and summarizes the suppressed count on
 * the next admitted emit. Keeps the signal (first + periodic + a count)
 * while collapsing the flood. Time source is injectable for deterministic
 * tests; production uses the wall clock.
 */

import {TIME_MS} from '../constants/time.js';

const DEFAULT_WINDOW_MS = TIME_MS.SECOND * 5;
const NUM = Object.freeze({ZERO: 0, ONE: 1});

/**
 * @param {Object} [options]
 * @param {number} [options.windowMs] - Minimum ms between admitted emits per key.
 * @param {Function} [options.now] - Clock returning ms; defaults to Date.now.
 */
class LogThrottle {
  constructor(options = {}) {
    this._windowMs = Number.isFinite(options.windowMs) &&
      options.windowMs > NUM.ZERO ?
      Math.floor(options.windowMs) :
      DEFAULT_WINDOW_MS;
    this._now = typeof options.now === 'function' ? options.now : Date.now;
    /** key -> {lastAdmittedAtMs: number, suppressed: number} */
    this._state = new Map();
  }

  /**
   * Whether an emit for `key` is admitted now. On admission, returns the
   * count of suppressed occurrences since the last admitted emit (which the
   * caller may fold into the log context) and resets that counter; on
   * suppression, increments the counter and returns null.
   * @param {string} key - Distinct throttle bucket (e.g. message + node).
   * @return {?number} suppressed-since-last count when admitted, else null.
   */
  admit(key) {
    const bucket = typeof key === 'string' && key.length > NUM.ZERO ?
      key : '_';
    const now = this._now();
    const entry = this._state.get(bucket);
    if (!entry || now - entry.lastAdmittedAtMs >= this._windowMs) {
      const suppressed = entry ? entry.suppressed : NUM.ZERO;
      this._state.set(bucket, {lastAdmittedAtMs: now, suppressed: NUM.ZERO});
      return suppressed;
    }
    entry.suppressed += NUM.ONE;
    return null;
  }
}

export {LogThrottle};
