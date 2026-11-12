/**
 * The explicit collection functions for node health.
 *
 * RULE - health data is a HINT (see node-health-buffer.js). These functions
 * are the only read surface of the node health buffer. They are called by an
 * operator or a test harness through the admin diagnostics route; no product
 * decision owner may import this module
 * (scripts/checks/check-health-hint-imports.js enforces it).
 *
 * collectNodeHealth returns this node's buffer slice. Every collector is a
 * named state: `measured` with its samples, or `unavailable` with the reason
 * it has none. The slice is bounded in bytes (NODE_HEALTH_RESPONSE_MAX_BYTES):
 * when the full slice is larger, its raw samples are withheld and only the
 * minute buckets answer, and the slice says so and counts what it withheld;
 * when even the buckets are larger, every collector is unavailable with that
 * reason. A withheld sample is never silently missing.
 *
 * collectClusterHealth asks every member the caller names, through the
 * requester the caller supplies, within the caller's bound. A member that
 * does not answer in time, or whose request fails, is an explicit
 * `unreachable` entry: never omitted, and never replaced by an earlier
 * answer. There is no cache in this module.
 */

import {
  NODE_HEALTH_RETENTION,
  NODE_HEALTH_SERIES,
  NODE_HEALTH_STATE,
  NODE_HEALTH_UNAVAILABLE_REASON,
  nodeHealthEntryCapacity,
  sharedNodeHealthBuffer,
} from './node-health-buffer.js';

const NODE_HEALTH_COLLECTION_STATE = Object.freeze({
  COLLECTED: 'collected',
  UNREACHABLE: 'unreachable',
});

// The largest serialized slice one collection answers. A full buffer is
// ~4.6 MB serialized (16 peers x 300 raw lines dominate); its minute buckets
// alone are ~1.7 MB, so the bucket form of a full buffer always fits.
const NODE_HEALTH_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

const NODE_HEALTH_RESPONSE_STATE = Object.freeze({
  COMPLETE: 'complete',
  RAW_WITHHELD: 'raw_samples_withheld',
  OVER_BOUND: 'over_response_bound',
});

const NODE_HEALTH_UNREACHABLE_REASON = Object.freeze({
  NO_ANSWER_WITHIN_BOUND: 'no_answer_within_bound',
  REQUEST_FAILED: 'request_failed',
});

function unavailable(reason) {
  return {state: NODE_HEALTH_STATE.UNAVAILABLE, reason};
}

function emptyReason(buffer, everRecorded) {
  if (buffer.firstTickAtMs === null) {
    return NODE_HEALTH_UNAVAILABLE_REASON.FEED_NOT_STARTED;
  }
  return everRecorded ?
    NODE_HEALTH_UNAVAILABLE_REASON.NOTHING_SINCE :
    NODE_HEALTH_UNAVAILABLE_REASON.PRODUCER_NOT_ATTACHED;
}

// A non-empty slice as answered; with `withholdRaw` its raw samples are
// counted into `withheld.rawSamples` instead of answered.
function answeredSlice(slice, withholdRaw, withheld) {
  if (!withholdRaw) return slice;
  withheld.rawSamples += slice.raw.length;
  return {raw: [], downsampled: slice.downsampled};
}

function isEmptySlice(slice) {
  return slice.raw.length === 0 && slice.downsampled.length === 0;
}

function collectSeries(buffer, series, sinceMs, withholdRaw, withheld) {
  const slice = series.slice(sinceMs);
  return isEmptySlice(slice) ?
    unavailable(emptyReason(buffer, series.entryCount() > 0)) :
    {state: NODE_HEALTH_STATE.MEASURED, ...answeredSlice(slice, withholdRaw, withheld)};
}

function collectKeyedSeries(buffer, keyed, sinceMs, withholdRaw, withheld) {
  const kept = {};
  for (const [key, series] of keyed.byKey) {
    const slice = series.slice(sinceMs);
    if (!isEmptySlice(slice)) kept[key] = answeredSlice(slice, withholdRaw, withheld);
  }
  return Object.keys(kept).length === 0 ?
    unavailable(emptyReason(buffer, keyed.entryCount() > 0)) :
    {state: NODE_HEALTH_STATE.MEASURED, byKey: kept, evictedKeys: keyed.evictedKeys};
}

function collectAckTimeouts(buffer, sinceMs) {
  const events = buffer.ackTimeouts.filter((event) => event.atMs >= sinceMs);
  // An empty list from an attached producer is a measurement: no timeout.
  return events.length === 0 && buffer.ackTimeouts.length === 0 &&
      buffer.peerTraffic.entryCount() === 0 ?
    unavailable(emptyReason(buffer, false)) :
    {state: NODE_HEALTH_STATE.MEASURED, events, evicted: buffer.evictedAckTimeouts};
}

function collectCollectors(buffer, sinceMs, withholdRaw, withheld) {
  return {
    [NODE_HEALTH_SERIES.PROCESS]:
      collectSeries(buffer, buffer.process, sinceMs, withholdRaw, withheld),
    [NODE_HEALTH_SERIES.EVENT_LOOP]:
      collectSeries(buffer, buffer.eventLoop, sinceMs, withholdRaw, withheld),
    [NODE_HEALTH_SERIES.PEER_TRAFFIC]:
      collectKeyedSeries(buffer, buffer.peerTraffic, sinceMs, withholdRaw, withheld),
    [NODE_HEALTH_SERIES.SERVED_QUERIES]:
      collectKeyedSeries(buffer, buffer.servedQueries, sinceMs, withholdRaw, withheld),
    [NODE_HEALTH_SERIES.ACK_TIMEOUTS]: collectAckTimeouts(buffer, sinceMs),
    [NODE_HEALTH_SERIES.CDC_WAVES]:
      collectSeries(buffer, buffer.cdcWaves, sinceMs, withholdRaw, withheld),
    [NODE_HEALTH_SERIES.CDC_APPLIES]:
      collectKeyedSeries(buffer, buffer.cdcApplies, sinceMs, withholdRaw, withheld),
  };
}

function overBoundCollectors() {
  return Object.fromEntries(Object.values(NODE_HEALTH_SERIES).map((series) =>
    [series, unavailable(NODE_HEALTH_UNAVAILABLE_REASON.OVER_RESPONSE_BOUND)]));
}

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

/**
 * This node's health since a time, bounded in serialized bytes.
 * @param {Object} [options]
 * @param {number} [options.sinceMs] Only samples at or after this wall-clock
 *   time; everything retained when omitted.
 * @param {Object} [options.buffer] The node's health buffer.
 * @param {number} [options.nowMs] The collection time.
 * @param {number} [options.maxBytes] The serialized bound of the answer.
 * @return {Object} The slice, one named state per collector, and its
 *   `response` state: complete, raw samples withheld (counted), or over the
 *   bound.
 */
function collectNodeHealth({sinceMs = 0, buffer = sharedNodeHealthBuffer,
  nowMs = Date.now(), maxBytes = NODE_HEALTH_RESPONSE_MAX_BYTES} = {}) {
  const header = {
    collectedAt: nowMs,
    sinceMs,
    retention: {...NODE_HEALTH_RETENTION, entryCapacity: nodeHealthEntryCapacity()},
    entriesHeld: buffer.entryCount(),
    hostUnavailable: buffer.hostUnavailable,
    // Samples a producer offered that the buffer could not take.
    recordFailures: buffer.recordFailures,
    recordsBeforeFirstTick: buffer.recordsBeforeFirstTick,
    // Peer-traffic lines of sockets not yet identified: counted, not kept.
    unidentifiedPeerLines: buffer.unidentifiedPeerLines,
  };
  const complete = {...header,
    response: {state: NODE_HEALTH_RESPONSE_STATE.COMPLETE, maxBytes,
      withheldRawSamples: 0},
    collectors: collectCollectors(buffer, sinceMs, false, {rawSamples: 0})};
  if (serializedBytes(complete) <= maxBytes) return complete;
  const withheld = {rawSamples: 0};
  const bucketsOnly = {...header,
    response: {state: NODE_HEALTH_RESPONSE_STATE.RAW_WITHHELD, maxBytes,
      withheldRawSamples: 0},
    collectors: collectCollectors(buffer, sinceMs, true, withheld)};
  bucketsOnly.response.withheldRawSamples = withheld.rawSamples;
  if (serializedBytes(bucketsOnly) <= maxBytes) return bucketsOnly;
  return {...header,
    response: {state: NODE_HEALTH_RESPONSE_STATE.OVER_BOUND, maxBytes,
      withheldRawSamples: withheld.rawSamples},
    collectors: overBoundCollectors()};
}

function unreachable(nodeId, reason, detail) {
  return {nodeId, state: NODE_HEALTH_COLLECTION_STATE.UNREACHABLE, reason, detail};
}

// One member's answer, or its unreachable entry when the bound is spent
// first or the request fails. The bound's timer is always cleared.
function collectMemberHealth(nodeId, {sinceMs, timeoutMs, requestNodeHealth,
  setTimer, clearTimer}) {
  return new Promise((resolvePromise) => {
    const timer = setTimer(() => resolvePromise(unreachable(nodeId,
      NODE_HEALTH_UNREACHABLE_REASON.NO_ANSWER_WITHIN_BOUND,
      `no answer within ${timeoutMs} ms`)), timeoutMs);
    Promise.resolve()
      .then(() => requestNodeHealth(nodeId, {sinceMs, timeoutMs}))
      .then((health) => resolvePromise({nodeId,
        state: NODE_HEALTH_COLLECTION_STATE.COLLECTED, health}),
      (error) => resolvePromise(unreachable(nodeId,
        NODE_HEALTH_UNREACHABLE_REASON.REQUEST_FAILED,
        String(error?.message ?? error))))
      .finally(() => clearTimer(timer));
  });
}

/**
 * The health of every named member, one entry per member in the order named.
 * @param {Object} options
 * @param {Array<string>} options.memberNodeIds The members to ask.
 * @param {Function} options.requestNodeHealth (nodeId, {sinceMs, timeoutMs})
 *   => Promise of that node's collectNodeHealth answer, over the admin
 *   diagnostics route.
 * @param {number} options.timeoutMs The caller's bound for each member.
 * @param {number} [options.sinceMs]
 * @param {Function} [options.setTimer] setTimeout stand-in (tests).
 * @param {Function} [options.clearTimer] clearTimeout stand-in (tests).
 * @param {number} [options.nowMs]
 * @return {Promise<Object>} {collectedAt, sinceMs, timeoutMs, nodes}.
 */
async function collectClusterHealth({memberNodeIds, requestNodeHealth, timeoutMs,
  sinceMs = 0, setTimer = setTimeout, clearTimer = clearTimeout, nowMs = Date.now()}) {
  const nodes = await Promise.all(memberNodeIds.map((nodeId) =>
    collectMemberHealth(nodeId,
      {sinceMs, timeoutMs, requestNodeHealth, setTimer, clearTimer})));
  return {collectedAt: nowMs, sinceMs, timeoutMs, nodes};
}

export {
  NODE_HEALTH_COLLECTION_STATE,
  NODE_HEALTH_RESPONSE_MAX_BYTES,
  NODE_HEALTH_RESPONSE_STATE,
  NODE_HEALTH_UNREACHABLE_REASON,
  collectClusterHealth,
  collectNodeHealth,
};
