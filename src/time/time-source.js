/**
 * TimeSource — the DT4 virtual-clock seam (deterministic-directed-testing-plan.md
 * DT4, step 1). A single abstraction for "what time is it" + timer scheduling, so
 * the convergence harness can drive the freeze→leadership-loss→stall chain by
 * advancing a virtual clock in-process instead of sampling docker runs.
 *
 * Two implementations share one interface:
 *   - RealTimeSource: delegates to the platform globals. It is the DEFAULT and is
 *     byte-for-byte the current behavior (Date.now / setTimeout / setInterval), so
 *     threading it through a subsystem changes nothing in production.
 *   - VirtualTimeSource: a deterministic fake clock the harness advances with
 *     advance(ms); timers fire in (dueAt, scheduling-order) order, intervals
 *     reschedule, and nothing fires until time is advanced.
 *
 * Interface (both implementations):
 *   now(): number
 *   setTimeout(fn, ms, ...args): handle
 *   clearTimeout(handle): void
 *   setInterval(fn, ms, ...args): handle
 *   clearInterval(handle): void
 */

import {NUM, TYPEOF} from '../constants/index.js';

// A repeating timer with a 0ms (or negative) interval would reschedule onto the
// same instant and spin forever inside a single advance(); clamp the reschedule
// step to this minimum, matching the platform's own sub-millisecond clamping.
const LOCAL_MIN_INTERVAL_MS = 1;

// advance() re-derives the due set after every firing so timers scheduled by a
// callback are honored within the same window. A callback that re-arms a 0-delay
// timer every time would loop unboundedly; cap iterations and fail loud (a
// deterministic test must not hang) rather than spin.
const LOCAL_MAX_ADVANCE_ITERATIONS = 1000000;

/**
 * Real-time TimeSource — the default. Delegates directly to platform globals so
 * behavior is identical to calling them inline.
 */
class RealTimeSource {
  now() {
    return Date.now();
  }

  setTimeout(fn, ms, ...args) {
    return setTimeout(fn, ms, ...args);
  }

  clearTimeout(handle) {
    clearTimeout(handle);
  }

  setInterval(fn, ms, ...args) {
    return setInterval(fn, ms, ...args);
  }

  clearInterval(handle) {
    clearInterval(handle);
  }
}

/**
 * Deterministic virtual TimeSource. Time only moves when advance() is called;
 * timers fire in (dueAt, scheduling-order) order. Handles are opaque numeric ids.
 */
class VirtualTimeSource {
  /**
   * @param {Object} [options]
   * @param {number} [options.startMs=0] - initial value of now().
   */
  constructor(options = {}) {
    const startMs = Number(options.startMs);
    this._now = Number.isFinite(startMs) ? startMs : NUM.ZERO;
    // id -> {id, fn, args, intervalMs, dueAt, repeating, seq}
    this._timers = new Map();
    this._seq = NUM.ZERO;
  }

  now() {
    return this._now;
  }

  setTimeout(fn, ms, ...args) {
    return this._schedule(fn, ms, args, false);
  }

  setInterval(fn, ms, ...args) {
    return this._schedule(fn, ms, args, true);
  }

  clearTimeout(handle) {
    this._timers.delete(handle);
  }

  clearInterval(handle) {
    this._timers.delete(handle);
  }

  _schedule(fn, ms, args, repeating) {
    if (typeof fn !== TYPEOF.FUNCTION) {
      throw new TypeError('VirtualTimeSource timer callback must be a function');
    }
    const rawMs = Number(ms);
    const delayMs = Number.isFinite(rawMs) && rawMs > NUM.ZERO ?
      rawMs :
      NUM.ZERO;
    const id = ++this._seq;
    this._timers.set(id, {
      id,
      fn,
      args,
      delayMs,
      dueAt: this._now + delayMs,
      repeating,
      seq: id,
    });
    return id;
  }

  /**
   * Advance the virtual clock by ms, firing every timer that comes due in
   * deterministic (dueAt, scheduling-order) order. Callbacks may schedule or
   * clear further timers; those scheduled within the window fire too.
   * @param {number} ms - non-negative milliseconds to advance.
   */
  advance(ms) {
    const rawMs = Number(ms);
    const stepMs = Number.isFinite(rawMs) && rawMs > NUM.ZERO ? rawMs : NUM.ZERO;
    const target = this._now + stepMs;
    let iterations = NUM.ZERO;
    for (;;) {
      const next = this._earliestDueTimer(target);
      if (!next) {
        break;
      }
      if (++iterations > LOCAL_MAX_ADVANCE_ITERATIONS) {
        throw new Error(
          'VirtualTimeSource.advance exceeded ' +
          `${LOCAL_MAX_ADVANCE_ITERATIONS} firings — a callback is re-arming a ` +
          'zero-delay timer without progress',
        );
      }
      this._now = next.dueAt;
      if (next.repeating) {
        const step = next.delayMs > NUM.ZERO ?
          next.delayMs :
          LOCAL_MIN_INTERVAL_MS;
        next.dueAt += step;
      } else {
        this._timers.delete(next.id);
      }
      next.fn(...next.args);
    }
    this._now = target;
  }

  /**
   * The timer due at or before target with the smallest (dueAt, seq), or null.
   * @param {number} target
   * @return {Object|null}
   */
  _earliestDueTimer(target) {
    let best = null;
    for (const timer of this._timers.values()) {
      if (timer.dueAt > target) {
        continue;
      }
      if (
        best === null ||
        timer.dueAt < best.dueAt ||
        (timer.dueAt === best.dueAt && timer.seq < best.seq)
      ) {
        best = timer;
      }
    }
    return best;
  }

  /**
   * Number of timers still scheduled (test/diagnostic helper).
   * @return {number}
   */
  pendingTimerCount() {
    return this._timers.size;
  }
}

/**
 * Resolve a TimeSource from a caller's options: an explicit, valid
 * options.timeSource if present, otherwise a RealTimeSource. This is the collapse
 * helper subsystems use so their default stays byte-for-byte the platform clock.
 * @param {Object} [options]
 * @return {RealTimeSource|VirtualTimeSource|Object}
 */
function resolveTimeSource(options = {}) {
  const candidate = options && options.timeSource;
  if (candidate && typeof candidate.now === TYPEOF.FUNCTION) {
    return candidate;
  }
  return new RealTimeSource();
}

export {RealTimeSource, VirtualTimeSource, resolveTimeSource};
