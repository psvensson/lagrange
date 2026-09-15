// Per-node, per-owner charging of virtual time: every owner turn segment
// accrues its calibrated microseconds; whole milliseconds are charged to the
// node's single core through the network time source (busyUntil), so work
// on one node contends serially while other nodes proceed. Busy time is
// tracked as contiguous stretches: a charge that lands on an idle node opens
// a stretch, a charge on a busy node extends the open one. A stretch at
// least the gap threshold long is one event-loop gap, the simulated
// analogue of the watchdog's blocked time; busy time and gap time are
// reported separately, as the live verdict distinguishes them.

import {CalibrationRefusal, REFUSAL, ownerKey} from './formation-sim-coefficients.js';

const MICROSECONDS_PER_MILLISECOND = 1000;
const GAP_THRESHOLD_MS = 1000;
const KEY_SEPARATOR = ':';

class ChargeAccumulator {
  /**
   * @param {object} options
   * @param {object} options.network the virtual network
   * @param {object} options.calibration loadCalibration() result
   */
  constructor({network, calibration}) {
    this.network = network;
    this.calibration = calibration;
    this.pendingUs = new Map();
    this.chargedMs = new Map();
    this.segments = new Map();
    this.stretches = new Map();
  }

  key(nodeId, owner) {
    return `${nodeId}${KEY_SEPARATOR}${owner}`;
  }

  /**
   * Account one owner segment on a node; charges whole milliseconds as they
   * accrue.
   * @param {string} nodeId
   * @param {string} owner
   * @param {number} [count]
   */
  // Both entry points share one gate, so the refusal sits on the invariant
  // rather than on whichever door the caller used.
  calibratedEntry(nodeId, owner) {
    const entry = this.calibration.owners[owner];
    if (!entry) {
      throw new CalibrationRefusal(REFUSAL.UNCALIBRATED_OWNER,
        `${owner} is not an owner this calibration knows`);
    }
    // Observed-inactive: the calibration never saw this owner run, so there
    // is no mean to charge. The baseline admits it only while its count
    // stays zero; a real segment here is an uncalibrated cost, and the run
    // fails closed rather than pricing it at nothing (owner amendment 1).
    if (entry.calibrated !== true) {
      throw new CalibrationRefusal(REFUSAL.UNCALIBRATED_OWNER,
        `${owner} ran on node ${nodeId} but the calibration measured no ` +
        'segment for it; supply a justified candidate cost before comparing');
    }
    return entry;
  }

  segment(nodeId, owner, count = 1) {
    // A segment count is a whole number of turns that happened. Anything
    // else is a caller bug, and silently accumulating it would let a
    // negative count cancel real charged work.
    if (!Number.isInteger(count) || count < 1) {
      throw new CalibrationRefusal(REFUSAL.INVALID,
        `${owner} on node ${nodeId} needs a positive whole segment count, got ${count}`);
    }
    const entry = this.calibratedEntry(nodeId, owner);
    const key = this.key(nodeId, owner);
    this.segments.set(key, (this.segments.get(key) || 0) + count);
    const usPerSegment = entry.usPerSegment;
    if (!(usPerSegment > 0)) return;
    const pending = (this.pendingUs.get(key) || 0) + usPerSegment * count;
    const wholeMs = Math.floor(pending / MICROSECONDS_PER_MILLISECOND);
    this.pendingUs.set(key, pending - wholeMs * MICROSECONDS_PER_MILLISECOND);
    if (wholeMs > 0) this.charge(nodeId, owner, wholeMs);
  }

  charge(nodeId, owner, ms) {
    const usPerSegment = this.calibratedEntry(nodeId, owner).usPerSegment;
    if (!(usPerSegment > 0) || !(ms > 0)) return;
    const before = this.network.nodeBusyUntil(nodeId);
    const now = this.network.now();
    this.network.networkTimeSource(nodeId).charge(ownerKey(owner),
      ms * MICROSECONDS_PER_MILLISECOND / usPerSegment);
    const after = this.network.nodeBusyUntil(nodeId);
    const chargedMs = after - Math.max(before, now);
    const key = this.key(nodeId, owner);
    this.chargedMs.set(key, (this.chargedMs.get(key) || 0) + chargedMs);
    this.extendStretch(nodeId, owner, before, now, after, chargedMs);
  }

  // A charge on an idle node opens a stretch at now; on a busy node it
  // extends the open stretch's end.
  extendStretch(nodeId, owner, before, now, after, chargedMs) {
    const list = this.stretches.get(nodeId) || [];
    const open = list.length > 0 ? list[list.length - 1] : null;
    if (open && before > now && open.endMs === before) {
      open.endMs = after;
      open.owners[owner] = (open.owners[owner] || 0) + chargedMs;
    } else {
      list.push({nodeId, startMs: now, endMs: after, owners: {[owner]: chargedMs}});
    }
    this.stretches.set(nodeId, list);
  }

  /**
   * Charged virtual milliseconds per owner for one node.
   * @param {string} nodeId
   * @param {string[]} owners
   * @returns {Object}
   */
  ownerChargedMs(nodeId, owners) {
    const result = {};
    for (const owner of owners) {
      result[owner] = this.chargedMs.get(this.key(nodeId, owner)) || 0;
    }
    return result;
  }

  ownerSegments(nodeId, owners) {
    const result = {};
    for (const owner of owners) {
      result[owner] = this.segments.get(this.key(nodeId, owner)) || 0;
    }
    return result;
  }

  /**
   * The node's contiguous busy stretches, as charged. This is occupancy
   * evidence, NOT the gap measurement: gaps are observed by the heartbeat in
   * formation-sim-gap-observer.js, because charged work and watchdog lateness
   * are different quantities (owner decision 2026-09-14).
   * @param {string} nodeId
   * @returns {Array<{startMs: number, endMs: number, owners: Object}>}
   */
  stretchesFor(nodeId) {
    return this.stretches.get(nodeId) || [];
  }

  /**
   * The node's busy stretches at least the gap threshold long.
   * @param {string} nodeId
   * @returns {Array<{nodeId: string, atMs: number, gapMs: number, owners: Object}>}
   */
  gapsFor(nodeId) {
    return (this.stretches.get(nodeId) || [])
      .filter((stretch) => stretch.endMs - stretch.startMs >= GAP_THRESHOLD_MS)
      .map((stretch) => ({
        nodeId, atMs: stretch.startMs, gapMs: stretch.endMs - stretch.startMs,
        owners: stretch.owners,
      }));
  }

  /**
   * Total gap milliseconds for a node (contiguous stretches, never overlapping).
   * @param {string} nodeId
   * @returns {number}
   */
  gapMsFor(nodeId) {
    return this.gapsFor(nodeId).reduce((sum, gap) => sum + gap.gapMs, 0);
  }
}

export {ChargeAccumulator, GAP_THRESHOLD_MS};
