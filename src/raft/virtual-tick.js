/**
 * VirtualTick — a tick-tock-compatible named-timer manager backed by a DT4
 * TimeSource (deterministic-directed-testing-plan.md DT4, the Raft election seam).
 *
 * Base @markwylde/liferaft schedules ALL of its timing — the heartbeat and the
 * randomized election timeout — through `raft.timers = new Tick(raft)` (the
 * `tick-tock` library), which uses native setTimeout/setInterval. That is the one
 * opaque clock in the freeze→leadership chain. VirtualTick mirrors the exact
 * tick-tock surface liferaft uses (setTimeout / setInterval / setImmediate /
 * active / clear / adjust / end) but schedules on an injected TimeSource, so a
 * VirtualTimeSource lets the convergence harness advance election timing
 * deterministically — making the seed "miss the election timeout" on demand
 * instead of via SIGSTOP/sampling.
 *
 * This is OPT-IN: only the local LifeRaft wrapper swaps `this.timers` for a
 * VirtualTick when a timeSource is explicitly provided; production keeps the real
 * Tick, so behavior is unchanged. Durations are parsed with the same `millisecond`
 * package tick-tock uses, so '50 ms' / numeric inputs resolve identically.
 */

import ms from 'millisecond';

const TIMER_NAME_SEPARATOR = /[, ]+/;

/**
 * A named-timer manager with tick-tock semantics, scheduled on a TimeSource.
 */
class VirtualTick {
  /**
   * @param {Object} context - callback `this` (the raft node), as tick-tock.
   * @param {Object} timeSource - a DT4 TimeSource (now/setTimeout/clearTimeout/
   *   setInterval/clearInterval).
   */
  constructor(context, timeSource) {
    this.context = context || this;
    this.timeSource = timeSource;
    // name -> {handle, fns, repeating}
    this.timers = {};
  }

  /**
   * Build the fire callback for a named timer: re-check presence, snapshot fns,
   * optionally clear from memory (one-shot), then invoke each with the context —
   * matching tick-tock's `tock`.
   * @param {string} name
   * @param {boolean} clear - clear from memory before firing (timeout/immediate).
   * @return {Function}
   */
  _tock(name, clear) {
    return () => {
      if (!this.timers || !(name in this.timers)) {
        return;
      }
      const fns = this.timers[name].fns.slice();
      if (clear) {
        this.clear(name);
      }
      for (const fn of fns) {
        fn.call(this.context);
      }
    };
  }

  setTimeout(name, fn, time) {
    if (this.timers[name]) {
      this.timers[name].fns.push(fn);
      return this;
    }
    this.timers[name] = {
      handle: this.timeSource.setTimeout(this._tock(name, true), ms(time)),
      fns: [fn],
      repeating: false,
    };
    return this;
  }

  setInterval(name, fn, time) {
    if (this.timers[name]) {
      this.timers[name].fns.push(fn);
      return this;
    }
    this.timers[name] = {
      handle: this.timeSource.setInterval(this._tock(name, false), ms(time)),
      fns: [fn],
      repeating: true,
    };
    return this;
  }

  setImmediate(name, fn) {
    return this.setTimeout(name, fn, 0);
  }

  active(name) {
    return Boolean(this.timers) && name in this.timers;
  }

  /**
   * Clear named timers (a single string splits on commas/spaces, like tick-tock)
   * or every timer when no name is given.
   * @param {...string} names
   * @return {VirtualTick}
   */
  clear(...names) {
    if (!this.timers) {
      return this;
    }
    let targets = names;
    if (names.length === 1 && typeof names[0] === 'string') {
      targets = names[0].split(TIMER_NAME_SEPARATOR);
    }
    if (targets.length === 0) {
      targets = Object.keys(this.timers);
    }
    for (const name of targets) {
      const timer = this.timers[name];
      if (!timer) {
        continue;
      }
      this._cancelHandle(timer);
      delete this.timers[name];
    }
    return this;
  }

  /**
   * Re-arm a timer to a new duration, preserving timeout-vs-interval semantics —
   * matching tick-tock's `adjust`.
   * @param {string} name
   * @param {*} time
   * @return {VirtualTick}
   */
  adjust(name, time) {
    const timer = this.timers ? this.timers[name] : null;
    if (!timer) {
      return this;
    }
    this._cancelHandle(timer);
    timer.handle = timer.repeating ?
      this.timeSource.setInterval(this._tock(name, false), ms(time)) :
      this.timeSource.setTimeout(this._tock(name, true), ms(time));
    return this;
  }

  end() {
    if (!this.context) {
      return false;
    }
    this.clear();
    this.context = null;
    this.timers = null;
    return true;
  }

  /**
   * Cancel a timer's underlying TimeSource handle (interval vs timeout).
   * @param {Object} timer
   */
  _cancelHandle(timer) {
    if (timer.repeating) {
      this.timeSource.clearInterval(timer.handle);
    } else {
      this.timeSource.clearTimeout(timer.handle);
    }
  }
}

export {VirtualTick};
