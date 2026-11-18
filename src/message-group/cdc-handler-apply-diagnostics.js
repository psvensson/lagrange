/**
 * Diagnostics for CDC events applied to the system-table cache (log line
 * only): per table, at most one line per window, carrying the last applied
 * source position and the largest apply lag seen since the previous line.
 *
 * Lag is `this node's clock - the event's origin HLC wall component`, so it
 * includes the clock skew between the origin node and this one; compare its
 * changes, not its absolute value. Console sink only.
 */

import {ThrottledDiagnosticsLine} from '../diagnostics/throttled-diagnostics-line.js';
import {
  NODE_HEALTH_SERIES,
  recordNodeHealthSample,
} from '../diagnostics/node-health-buffer.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';

const CDC_EVENT_APPLIED_TO_CACHE = 'CDC event applied to cache';
const CDC_APPLIED_LINE_WINDOW_MS = 5000;

const appliedLine = new ThrottledDiagnosticsLine({
  message: CDC_EVENT_APPLIED_TO_CACHE,
  windowMs: CDC_APPLIED_LINE_WINDOW_MS,
  maxField: 'maxLagMs',
});

/**
 * An unreadable origin timestamp has no lag; it never fails the apply that
 * is being described.
 * @param {Object} applied - {timestamp, nowMs}.
 * @return {number|null} Apply lag in ms, or null.
 */
function originLagMs(applied) {
  let lagMs = null;
  try {
    lagMs = applied.nowMs - HLCTimestamp.fromString(applied.timestamp).physical;
  } catch (_unreadableTimestamp) {
    lagMs = null;
  }
  return lagMs;
}

/**
 * @param {Object} applied - {subsystem, tableName, operation, timestamp,
 *   sourcePartition, sourceLogIndex, sourceOrdinal, receivedAt, nowMs}.
 * @return {void}
 */
function reportCdcEventAppliedToCache(applied) {
  const lagMs = originLagMs(applied);
  // Every apply, not only the throttled line; it cannot throw.
  recordNodeHealthSample(NODE_HEALTH_SERIES.CDC_APPLIES, () => ({
    tableName: applied.tableName,
    lagMs,
    receivedToAppliedMs: applied.nowMs - applied.receivedAt,
  }));
  appliedLine.report(applied.tableName, lagMs, () => ({
    subsystem: applied.subsystem,
    tableName: applied.tableName,
    operation: applied.operation,
    originHlc: applied.timestamp,
    lagMs,
    receivedToAppliedMs: applied.nowMs - applied.receivedAt,
    sourcePartition: applied.sourcePartition ?? null,
    sourceLogIndex: applied.sourceLogIndex ?? null,
    sourceOrdinal: applied.sourceOrdinal ?? null,
  }));
}

export {CDC_EVENT_APPLIED_TO_CACHE, reportCdcEventAppliedToCache};
