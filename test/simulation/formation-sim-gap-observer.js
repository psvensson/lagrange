// The simulator's event-loop gap observer: the production watchdog's rule,
// run over virtual scheduling.
//
// A gap is NOT derived from busyUntil or from charged work. Those are a
// different quantity: many sub-second charged slices produce a high busy
// fraction and no watchdog gap at all, which is exactly why busy fraction
// cannot stand in for the sealed starvation signature (owner decision
// 2026-09-14). What the production watchdog measures is the lateness of its
// own heartbeat, so this observer arms the same heartbeat on the node's
// virtual timer queue and applies the same pure rule to when the callback
// actually ran. The node's charged occupancy defers that timer exactly as it
// defers every other event, so the gap emerges from scheduling.
//
// The production inspector and sampling profiler are deliberately absent: the
// rule is shared with the live watchdog through observeHeartbeat, nothing
// else is.

import {
  WATCHDOG_DEFAULT,
  observeHeartbeat,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';

const ZERO = 0;

/**
 * One heartbeat per node on the virtual network, recording the gaps the
 * production watchdog would have logged.
 */
class GapObserver {
  /**
   * @param {object} options
   * @param {object} options.network the virtual network
   * @param {object} [options.charges] accumulator, for per-gap owner detail
   * @param {number} [options.intervalMs]
   * @param {number} [options.thresholdMs]
   */
  constructor({network, charges = null,
    intervalMs = WATCHDOG_DEFAULT.INTERVAL_MS,
    thresholdMs = WATCHDOG_DEFAULT.THRESHOLD_MS}) {
    this.network = network;
    this.charges = charges;
    this.intervalMs = intervalMs;
    this.thresholdMs = thresholdMs;
    this.expectedAtMs = new Map();
    this.gaps = new Map();
    this.running = new Set();
  }

  /**
   * Arm the heartbeat for one node. The first expectation is one interval
   * after the start, exactly as the watchdog sets it when it starts.
   * @param {string} nodeId
   */
  start(nodeId) {
    if (this.running.has(nodeId)) return;
    this.running.add(nodeId);
    this.gaps.set(nodeId, []);
    this.expectedAtMs.set(nodeId, this.network.now() + this.intervalMs);
    this.arm(nodeId);
  }

  arm(nodeId) {
    this.network.setTimer(nodeId, () => this.tick(nodeId), this.intervalMs);
  }

  // One heartbeat. The virtual network defers a timer whose owning node is
  // busy, so `now` here is when the callback could actually run.
  tick(nodeId) {
    if (!this.running.has(nodeId)) return;
    const nowMs = this.network.now();
    const beat = observeHeartbeat({
      expectedAtMs: this.expectedAtMs.get(nodeId), nowMs,
      intervalMs: this.intervalMs, thresholdMs: this.thresholdMs,
    });
    this.expectedAtMs.set(nodeId, beat.nextExpectedAtMs);
    if (beat.exceeded) {
      this.gaps.get(nodeId).push({
        nodeId, atMs: nowMs - beat.gapMs, gapMs: beat.gapMs,
        owners: this.ownersDuring(nodeId, nowMs - beat.gapMs, nowMs),
      });
    }
    this.arm(nodeId);
  }

  /**
   * Which owners were charged on this node inside the blocked interval. The
   * attribution is evidence about the gap, never its measurement.
   * @param {string} nodeId
   * @param {number} fromMs
   * @param {number} toMs
   * @returns {Object}
   */
  ownersDuring(nodeId, fromMs, toMs) {
    if (!this.charges) return {};
    const owners = {};
    for (const stretch of this.charges.stretchesFor(nodeId)) {
      if (stretch.endMs <= fromMs || stretch.startMs >= toMs) continue;
      for (const [owner, ms] of Object.entries(stretch.owners)) {
        owners[owner] = (owners[owner] || ZERO) + ms;
      }
    }
    return owners;
  }

  stop(nodeId) {
    this.running.delete(nodeId);
  }

  /**
   * The gaps observed on a node.
   * @param {string} nodeId
   * @returns {Array<{nodeId: string, atMs: number, gapMs: number, owners: Object}>}
   */
  gapsFor(nodeId) {
    return this.gaps.get(nodeId) || [];
  }

  /**
   * Total observed gap milliseconds for a node.
   * @param {string} nodeId
   * @returns {number}
   */
  gapMsFor(nodeId) {
    return this.gapsFor(nodeId).reduce((sum, gap) => sum + gap.gapMs, ZERO);
  }
}

export {GapObserver};
