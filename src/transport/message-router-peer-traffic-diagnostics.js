/**
 * Per-peer traffic diagnostics for the message router. Observation only: no
 * router decision reads anything recorded here.
 *
 * The recorders are called once per frame on the send and receive paths and
 * only bump counters. `collectDue` turns the counters into at most one line
 * per active peer and one line per served (table, operation, caller) per
 * interval, then forgets idle keys, so the state is bounded by what was
 * active in the last interval. The lines are written by the router through
 * the logging service's console-only sink (never the logs table).
 *
 * One-way latency is `receiver clock - sender stamp` of ACK and PONG frames.
 * Across hosts it includes the clock skew between the two nodes, so compare
 * its changes over time, not its absolute value.
 */

import {isRaftTransportPayload} from '../raft/raft-packet-utils.js';
import {
  ROUTER_LOG_MSG,
  ROUTER_MESSAGE_TYPE,
  TRANSPORT_SUBSYSTEM,
} from '../constants/transport.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  registerPeriodicDiagnosticsReporter,
} from '../diagnostics/periodic-diagnostics-reporters.js';
import {
  NODE_HEALTH_SERIES,
  recordNodeHealthSample,
} from '../diagnostics/node-health-buffer.js';
import {buildDerivedDeliverySource} from './message-router-outbound-queue-admission.js';

const PEER_TRAFFIC_INTERVAL_MS = 1000;
const MAX_PEER_LINES_PER_INTERVAL = 16;
const MAX_SERVED_QUERY_LINES_PER_INTERVAL = 16;
const MAX_SERVED_QUERY_KEYS = 64;
const MAX_LATENCY_SAMPLES_PER_INTERVAL = 512;
const MEDIAN_QUANTILE = 0.5;
const SERVED_QUERY_KEY_SEPARATOR = '\u0000';
const UNIDENTIFIED_PEER = 'unidentified';
const DIAGNOSTICS_LOG_LEVEL = 'info';
// buildDerivedDeliverySource names a query delivery `query:<operation>:<table>`.
const DELIVERY_SOURCE_SEPARATOR = ':';
const QUERY_DELIVERY_SOURCE_KIND = 'query';
const QUERY_DELIVERY_SOURCE_FIELDS = 3;

// The router diagnostics lines the node health buffer also keeps.
const HEALTH_SERIES_BY_MESSAGE = Object.freeze({
  [ROUTER_LOG_MSG.PEER_TRAFFIC]: NODE_HEALTH_SERIES.PEER_TRAFFIC,
  [ROUTER_LOG_MSG.REMOTE_QUERY_SERVED]: NODE_HEALTH_SERIES.SERVED_QUERIES,
  [ROUTER_LOG_MSG.ACK_TIMEOUT_DETAIL]: NODE_HEALTH_SERIES.ACK_TIMEOUTS,
});

// Sync-section sites for the event-loop gap watchdog: the router's JSON
// encode and decode of wire frames are synchronous and scale with frame size.
const ROUTER_SYNC_SECTION = Object.freeze({
  FRAME_DECODE: 'router_frame_decode',
  FRAME_ENCODE: 'router_frame_encode',
});

const FRAME_CLASS = Object.freeze({
  ACK: 'ack',
  PONG: 'pong',
  RAFT: 'raft',
  REQUEST: 'request',
  RESPONSE: 'response',
  CONTROL: 'control',
});

const FRAME_CLASS_BY_MESSAGE_TYPE = Object.freeze({
  [ROUTER_MESSAGE_TYPE.ACK]: FRAME_CLASS.ACK,
  [ROUTER_MESSAGE_TYPE.PONG]: FRAME_CLASS.PONG,
  [ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE]: FRAME_CLASS.RESPONSE,
});

/**
 * @param {Object} frame - A router wire frame (parsed, or about to be sent).
 * @return {string} One of FRAME_CLASS.
 */
function classifyRouterFrame(frame) {
  if (frame?.type === ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE) {
    return frame.oneWay === true || isRaftTransportPayload(frame.payload) ?
      FRAME_CLASS.RAFT : FRAME_CLASS.REQUEST;
  }
  const frameClass = FRAME_CLASS_BY_MESSAGE_TYPE[frame?.type];
  return frameClass === undefined ? FRAME_CLASS.CONTROL : frameClass;
}

function createFrameCounts() {
  return {ack: 0, pong: 0, raft: 0, request: 0, response: 0, control: 0};
}

function createPeerWindow() {
  return {
    bytesSent: 0,
    bytesReceived: 0,
    framesSent: createFrameCounts(),
    framesReceived: createFrameCounts(),
    largestFrameSentBytes: 0,
    largestFrameReceivedBytes: 0,
    latencySamples: [],
    latencySampleCount: 0,
    latencyMaxMs: null,
  };
}

/**
 * @param {Array<number>} samples - Latency samples of one interval.
 * @return {number|null} The median, or null without samples.
 */
function medianOf(samples) {
  if (samples.length === 0) {
    return null;
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * MEDIAN_QUANTILE)];
}

class PeerTrafficDiagnostics {
  constructor() {
    this.peers = new Map();
    this.socketPeers = new WeakMap();
    this.servedQueries = new Map();
    this.omittedServedQueryKeys = 0;
    this.lastCollectedAtMs = null;
    this.observationFailures = 0;
    this.lastObservationFailure = null;
  }

  /**
   * An observation threw. It is counted and remembered here and never
   * reaches the frame or answer it was observing.
   * @param {*} error - What the observation threw.
   * @return {void}
   */
  recordObservationFailure(error) {
    this.observationFailures += 1;
    this.lastObservationFailure = error;
  }

  /**
   * @param {string} peerKey - Peer node id (connection id before IDENTIFY).
   * @return {Object} The peer's counters for the current interval.
   * @private
   */
  windowOf(peerKey) {
    let window = this.peers.get(peerKey);
    if (!window) {
      window = createPeerWindow();
      this.peers.set(peerKey, window);
    }
    return window;
  }

  recordReceived(peerKey, ws, bytes, frameClass) {
    if (this.socketPeers.get(ws) !== peerKey) {
      this.socketPeers.set(ws, peerKey);
    }
    const window = this.windowOf(peerKey);
    window.bytesReceived += bytes;
    window.framesReceived[frameClass] += 1;
    if (bytes > window.largestFrameReceivedBytes) {
      window.largestFrameReceivedBytes = bytes;
    }
  }

  recordSent(peerKey, bytes, frameClass) {
    const window = this.windowOf(peerKey);
    window.bytesSent += bytes;
    window.framesSent[frameClass] += 1;
    if (bytes > window.largestFrameSentBytes) {
      window.largestFrameSentBytes = bytes;
    }
  }

  /**
   * A frame sent on a socket whose peer is known only through the frames
   * received on it (ACK, PONG, response, keepalive).
   * @param {Object} ws - The socket.
   * @param {number} bytes - Encoded frame size.
   * @param {string} frameClass - One of FRAME_CLASS.
   * @return {void}
   */
  recordSentOnSocket(ws, bytes, frameClass) {
    this.recordSent(this.socketPeers.get(ws) ?? UNIDENTIFIED_PEER, bytes, frameClass);
  }

  recordOneWayLatency(peerKey, latencyMs) {
    if (!Number.isFinite(latencyMs)) {
      return;
    }
    const window = this.windowOf(peerKey);
    window.latencySampleCount += 1;
    if (window.latencyMaxMs === null || latencyMs > window.latencyMaxMs) {
      window.latencyMaxMs = latencyMs;
    }
    if (window.latencySamples.length < MAX_LATENCY_SAMPLES_PER_INTERVAL) {
      window.latencySamples.push(latencyMs);
    }
  }

  /**
   * @param {Object} served - {tableName, operation, sourceNodeId, rowCount,
   *   responseBytes, executionMs}; rowCount is null when the answer exposes
   *   no row array.
   * @return {void}
   */
  recordServedQuery(served) {
    const key = [served.tableName, served.operation, served.sourceNodeId]
      .join(SERVED_QUERY_KEY_SEPARATOR);
    let entry = this.servedQueries.get(key);
    if (!entry) {
      if (this.servedQueries.size >= MAX_SERVED_QUERY_KEYS) {
        this.omittedServedQueryKeys += 1;
        return;
      }
      entry = {
        tableName: served.tableName,
        operation: served.operation,
        sourceNodeId: served.sourceNodeId,
        queries: 0,
        rows: 0,
        queriesWithoutRowCount: 0,
        responseBytes: 0,
        largestResponseBytes: 0,
        executionMs: 0,
        maxExecutionMs: 0,
      };
      this.servedQueries.set(key, entry);
    }
    entry.queries += 1;
    if (Number.isFinite(served.rowCount)) {
      entry.rows += served.rowCount;
    } else {
      entry.queriesWithoutRowCount += 1;
    }
    entry.responseBytes += served.responseBytes;
    entry.largestResponseBytes =
      Math.max(entry.largestResponseBytes, served.responseBytes);
    entry.executionMs += served.executionMs;
    entry.maxExecutionMs = Math.max(entry.maxExecutionMs, served.executionMs);
  }

  /**
   * Close the interval when it is due.
   * @param {number} nowMs - Router clock.
   * @param {Function} describePeer - (peerKey) => live socket and queue
   *   gauges merged into that peer's line.
   * @return {{peerLines: Array<Object>, servedQueryLines: Array<Object>}|null}
   *   The interval's lines, or null while the interval is still open.
   */
  collectDue(nowMs, describePeer) {
    if (this.lastCollectedAtMs === null) {
      this.lastCollectedAtMs = nowMs;
      return null;
    }
    const intervalMs = nowMs - this.lastCollectedAtMs;
    if (intervalMs < PEER_TRAFFIC_INTERVAL_MS) {
      return null;
    }
    this.lastCollectedAtMs = nowMs;
    return {
      peerLines: this.drainPeerLines(intervalMs, describePeer),
      servedQueryLines: this.drainServedQueryLines(intervalMs),
    };
  }

  drainPeerLines(intervalMs, describePeer) {
    const active = [...this.peers.entries()].sort(([, left], [, right]) =>
      (right.bytesSent + right.bytesReceived) -
      (left.bytesSent + left.bytesReceived));
    this.peers.clear();
    const omittedPeers = Math.max(0, active.length - MAX_PEER_LINES_PER_INTERVAL);
    return active.slice(0, MAX_PEER_LINES_PER_INTERVAL).map(([peerNodeId, window]) => ({
      peerNodeId,
      intervalMs,
      ...describePeer(peerNodeId),
      bytesSent: window.bytesSent,
      bytesReceived: window.bytesReceived,
      framesSent: window.framesSent,
      framesReceived: window.framesReceived,
      largestFrameSentBytes: window.largestFrameSentBytes,
      largestFrameReceivedBytes: window.largestFrameReceivedBytes,
      oneWayLatencyP50Ms: medianOf(window.latencySamples),
      oneWayLatencyMaxMs: window.latencyMaxMs,
      oneWayLatencySamples: window.latencySampleCount,
      omittedPeers,
    }));
  }

  drainServedQueryLines(intervalMs) {
    const served = [...this.servedQueries.values()]
      .sort((left, right) => right.executionMs - left.executionMs);
    const omittedKeys = this.omittedServedQueryKeys +
      Math.max(0, served.length - MAX_SERVED_QUERY_LINES_PER_INTERVAL);
    this.servedQueries.clear();
    this.omittedServedQueryKeys = 0;
    return served.slice(0, MAX_SERVED_QUERY_LINES_PER_INTERVAL)
      .map((entry) => ({...entry, intervalMs, omittedKeys}));
  }
}

/**
 * Write one router diagnostics line to the console sink only. The logging
 * service's console-only entry has no persistence branch, so these lines can
 * never add a write to the logs table whose transport they describe.
 * @param {string} message - A ROUTER_LOG_MSG member.
 * @param {Object} context - The line's fields.
 * @return {void}
 */
function logRouterDiagnostics(message, context) {
  // The same line context, kept by the node health buffer (a diagnostics
  // sink, never read by the router). recordNodeHealthSample cannot throw.
  const healthSeries = HEALTH_SERIES_BY_MESSAGE[message];
  if (healthSeries !== undefined) {
    recordNodeHealthSample(healthSeries, () => context);
  }
  LoggingService.getInstance().logConsoleOnly(DIAGNOSTICS_LOG_LEVEL, message, {
    subsystem: TRANSPORT_SUBSYSTEM.ROUTER,
    ...context,
  });
}

/**
 * Live socket and outbound-queue gauges of one peer at line time.
 * @param {Object} router - The message router.
 * @param {string} peerKey - Peer node id (connection id before IDENTIFY).
 * @return {Object} Gauges merged into the peer's traffic line.
 */
function describePeerGauges(router, peerKey) {
  const connection = router.nodeConnections.get(peerKey);
  const queue = router.outboundQueues.get(peerKey);
  return {
    // The key is the peer's node id only when the router holds a connection
    // under it that names that node: before IDENTIFY an incoming socket is
    // keyed by its connection id (its record names no node), and a key the
    // router no longer holds is not established as either.
    peerIdentified: connection !== undefined && connection.nodeId === peerKey,
    connectionState: connection?.state ?? null,
    bufferedAmount: connection?.ws?.bufferedAmount ?? null,
    queueInFlight: queue ? queue.inFlight : 0,
    queuePending: queue ? queue.pending.length : 0,
  };
}

/**
 * Emit the due peer-traffic and served-query lines of one router.
 * @param {Object} router - The message router.
 * @return {void}
 */
function reportRouterPeerTraffic(router) {
  const due = router.peerTrafficDiagnostics.collectDue(
    router.timeSource.now(),
    (peerKey) => describePeerGauges(router, peerKey),
  );
  if (due === null) {
    return;
  }
  for (const line of due.peerLines) {
    logRouterDiagnostics(ROUTER_LOG_MSG.PEER_TRAFFIC,
      {localNodeId: router.nodeId, ...line});
  }
  for (const line of due.servedQueryLines) {
    logRouterDiagnostics(ROUTER_LOG_MSG.REMOTE_QUERY_SERVED,
      {localNodeId: router.nodeId, ...line});
  }
}

/**
 * Attach a router's traffic lines to the process's periodic diagnostics tick.
 * @param {Object} router - The message router.
 * @return {Function} Detach.
 */
function attachRouterPeerTrafficReporter(router) {
  return registerPeriodicDiagnosticsReporter(() => reportRouterPeerTraffic(router));
}

/**
 * Name the query an inbound service message asks this node to serve.
 * @param {string} targetAddress - The addressed handler.
 * @param {Object} payload - The service message payload.
 * @return {{operation: string, tableName: string}|null} Null when the
 *   message is not a query.
 */
function describeServedQuery(targetAddress, payload) {
  const fields = buildDerivedDeliverySource(targetAddress, payload)
    .split(DELIVERY_SOURCE_SEPARATOR);
  if (fields.length !== QUERY_DELIVERY_SOURCE_FIELDS ||
      fields[0] !== QUERY_DELIVERY_SOURCE_KIND) {
    return null;
  }
  return {operation: fields[1], tableName: fields[2]};
}

/**
 * Rows in a served query's answer, when the answer exposes a row array.
 * @param {*} answer - The handler's answer.
 * @return {number|null} The row count, or null when no row array is exposed.
 */
function countAnswerRows(answer) {
  if (Array.isArray(answer?.rows)) {
    return answer.rows.length;
  }
  if (Array.isArray(answer?.result?.rows)) {
    return answer.result.rows.length;
  }
  return null;
}

export {
  FRAME_CLASS,
  ROUTER_SYNC_SECTION,
  attachRouterPeerTrafficReporter,
  countAnswerRows,
  describeServedQuery,
  logRouterDiagnostics,
  reportRouterPeerTraffic,
  PEER_TRAFFIC_INTERVAL_MS,
  PeerTrafficDiagnostics,
  classifyRouterFrame,
};
