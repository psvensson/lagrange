/**
 * Run health evidence: one normalized, per-node record of what a run's node
 * logs and collected node health say about event-loop delay, per-peer
 * traffic, served queries and ACK timeouts. Pure: lines and collected
 * health in, evidence out; nothing here reads a file.
 *
 * Two sources feed the same record. The node health collection
 * (collectClusterHealth over the admin diagnostics route) is preferred
 * wherever it measured a series; the node log is read for what the
 * collection does not carry and for runs that predate it. Each series
 * names the source it came from. A series neither source carries is absent,
 * and the classifier reports it as unknown, never as healthy.
 */

import {
  NODE_LOG_FIELD,
  NODE_LOG_MESSAGE,
} from './run-health-constants.js';
import {NODE_HEALTH_RESPONSE_STATE} from
  '../../../../src/diagnostics/node-health-collection.js';
import {
  arrayFilter,
  arrayMap,
  arraySome,
  includesOf,
  indexOfIn,
} from './captured-intrinsics.js';

const EVIDENCE_SOURCE = Object.freeze({
  NODE_LOG: 'node_log',
  NODE_HEALTH: 'node_health_collection',
});

const MS_PER_SECOND = 1000;
const JSON_START = '{';
const TIME_FIELD = /"time":"([^"]+)"/u;
const NODE_HEALTH_COLLECTED = 'collected';
const NODE_HEALTH_MEASURED = 'measured';
// A line is parsed only when it can carry evidence; every other line
// contributes its timestamp alone (proof the process was logging).
const EVIDENCE_NEEDLES = Object.freeze([
  ...Object.values(NODE_LOG_MESSAGE),
  NODE_LOG_FIELD.WAIT_BOUND_SPENT_EVENT,
  NODE_LOG_FIELD.ROUTER_MESSAGE_TIMEOUT,
]);

function createNodeEvidence(nodeId) {
  return {
    nodeId,
    lines: 0,
    firstLineAtMs: null,
    lastLineAtMs: null,
    // Distinct wall-clock seconds in which the node logged anything.
    loggedSeconds: new Set(),
    sources: {},
    eventLoopDelaySamples: [],
    eventLoopGaps: [],
    processSamples: [],
    peers: new Map(),
    servedQueries: new Map(),
    // CDC delivery and apply timing, from the node health collection only.
    cdc: null,
  };
}

function createRunHealthEvidence() {
  return {nodes: new Map()};
}

function nodeEvidenceOf(evidence, nodeId) {
  let node = evidence.nodes.get(nodeId);
  if (node === undefined) {
    node = createNodeEvidence(nodeId);
    evidence.nodes.set(nodeId, node);
  }
  return node;
}

function peerEvidenceOf(node, peerNodeId) {
  let peer = node.peers.get(peerNodeId);
  if (peer === undefined) {
    peer = {
      peerNodeId,
      traffic: [],
      ackTimeoutDetails: [],
      routerTimeoutMentions: 0,
      boundsSpentByWait: {},
      slowNotDead: {count: 0, maxLastInboundAgoMs: null, atMs: null},
    };
    node.peers.set(peerNodeId, peer);
  }
  return peer;
}

function noteLineTime(node, atMs) {
  node.lines += 1;
  if (!Number.isFinite(atMs)) return;
  if (node.firstLineAtMs === null || atMs < node.firstLineAtMs) node.firstLineAtMs = atMs;
  if (node.lastLineAtMs === null || atMs > node.lastLineAtMs) node.lastLineAtMs = atMs;
  node.loggedSeconds.add(Math.floor(atMs / MS_PER_SECOND));
}

// The structured logger writes the message as `msg`; a line written before
// the logger is initialized carries it as `message`. One decoder, here.
function messageOf(record) {
  return Object.hasOwn(record, 'msg') ? record.msg : record.message;
}

function recordServedQuery(node, record) {
  const table = String(record.tableName);
  let served = node.servedQueries.get(table);
  if (served === undefined) {
    served = {tableName: table, queries: 0, rows: 0, responseBytes: 0,
      largestResponseBytes: 0, executionMs: 0, maxExecutionMs: 0, bytesByCaller: {}};
    node.servedQueries.set(table, served);
  }
  served.queries += record.queries ?? 0;
  served.rows += record.rows ?? 0;
  served.responseBytes += record.responseBytes ?? 0;
  served.largestResponseBytes =
    Math.max(served.largestResponseBytes, record.largestResponseBytes ?? 0);
  served.executionMs += record.executionMs ?? 0;
  served.maxExecutionMs = Math.max(served.maxExecutionMs, record.maxExecutionMs ?? 0);
  if (record.sourceNodeId !== undefined) {
    const caller = String(record.sourceNodeId);
    served.bytesByCaller[caller] =
      (served.bytesByCaller[caller] ?? 0) + (record.responseBytes ?? 0);
  }
}

function recordSlowNotDead(node, record, atMs) {
  const peer = peerEvidenceOf(node, String(record.targetNodeId));
  peer.slowNotDead.count += 1;
  if (Number.isFinite(record.lastInboundAgoMs) &&
      (peer.slowNotDead.maxLastInboundAgoMs === null ||
        record.lastInboundAgoMs > peer.slowNotDead.maxLastInboundAgoMs)) {
    peer.slowNotDead.maxLastInboundAgoMs = record.lastInboundAgoMs;
    peer.slowNotDead.atMs = atMs;
  }
}

function recordByMessage(node, record, atMs) {
  const message = messageOf(record);
  if (message === NODE_LOG_MESSAGE.PEER_TRAFFIC) {
    node.sources.peerTraffic = EVIDENCE_SOURCE.NODE_LOG;
    peerEvidenceOf(node, String(record.peerNodeId)).traffic.push({...record, atMs});
  } else if (message === NODE_LOG_MESSAGE.REMOTE_QUERY_SERVED) {
    node.sources.servedQueries = EVIDENCE_SOURCE.NODE_LOG;
    recordServedQuery(node, record);
  } else if (message === NODE_LOG_MESSAGE.ACK_TIMEOUT_DETAIL) {
    peerEvidenceOf(node, String(record.targetNodeId)).ackTimeoutDetails.push({
      atMs, boundMs: record.boundMs, elapsedMs: record.elapsedMs,
      payloadBytes: record.payloadBytes, bufferedAmountNow: record.bufferedAmountNow,
      queuePending: record.queuePending, deliverySource: record.deliverySource,
    });
  } else if (message === NODE_LOG_MESSAGE.EVENT_LOOP_DELAY_SAMPLE) {
    node.sources.eventLoopDelay = EVIDENCE_SOURCE.NODE_LOG;
    node.eventLoopDelaySamples.push({atMs, intervalMs: record.intervalMs,
      delayP50Ms: record.delayP50Ms, delayP99Ms: record.delayP99Ms,
      delayMaxMs: record.delayMaxMs, eventLoopUtilization: record.eventLoopUtilization});
  } else if (message === NODE_LOG_MESSAGE.EVENT_LOOP_GAP_DETECTED) {
    node.sources.eventLoopGaps = EVIDENCE_SOURCE.NODE_LOG;
    node.eventLoopGaps.push({atMs, gapMs: record.gapMs,
      unexplainedMs: record.unexplainedMs});
  } else if (message === NODE_LOG_MESSAGE.QUARANTINE_SKIPPED_PEER_ALIVE) {
    recordSlowNotDead(node, record, atMs);
  } else {
    return false;
  }
  return true;
}

function recordTimeoutMention(node, record, text) {
  const waitScope = record.scope;
  if (record.event === NODE_LOG_FIELD.WAIT_BOUND_SPENT_EVENT &&
      typeof waitScope?.targetNodeId === 'string') {
    const peer = peerEvidenceOf(node, waitScope.targetNodeId);
    const wait = String(record.wait);
    peer.boundsSpentByWait[wait] = (peer.boundsSpentByWait[wait] ?? 0) + 1;
  } else if (typeof record.targetNodeId === 'string' &&
      includesOf(text, NODE_LOG_FIELD.ROUTER_MESSAGE_TIMEOUT)) {
    peerEvidenceOf(node, record.targetNodeId).routerTimeoutMentions += 1;
  }
}

/**
 * Add one node log line to the evidence.
 * @param {Object} evidence - createRunHealthEvidence().
 * @param {string} nodeId - The node whose log the line is from.
 * @param {string} line - One log line, with or without the playback prefix.
 * @return {void}
 */
function ingestNodeLogLine(evidence, nodeId, line) {
  const node = nodeEvidenceOf(evidence, nodeId);
  const timeMatch = TIME_FIELD.exec(line);
  const atMs = timeMatch === null ? Number.NaN : Date.parse(timeMatch[1]);
  noteLineTime(node, atMs);
  if (!arraySome(EVIDENCE_NEEDLES, (needle) => includesOf(line, needle))) return;
  const jsonAt = indexOfIn(line, JSON_START);
  if (jsonAt < 0) return;
  let record = null;
  try {
    record = JSON.parse(line.slice(jsonAt));
  } catch (error) {
    node.unparseableEvidenceLines = (node.unparseableEvidenceLines ?? 0) + 1;
    node.lastUnparseableLineError = String(error.message);
  }
  if (record === null || typeof record !== 'object') return;
  if (!recordByMessage(node, record, atMs)) recordTimeoutMention(node, record, line);
}

function isMeasured(collector) {
  return collector !== null && typeof collector === 'object' &&
    collector.state === NODE_HEALTH_MEASURED;
}

function bucketTotal(slice, field) {
  return slice.downsampled.reduce((sum, bucket) => sum + (bucket.sum[field] ?? 0), 0);
}

function bucketMax(slice, field) {
  const values = arrayFilter([...arrayMap(slice.downsampled, (bucket) => bucket.max[field]),
    ...arrayMap(slice.raw, (sample) => sample[field])], (value) => Number.isFinite(value));
  return values.length === 0 ? null : Math.max(...values);
}

// Served queries are kept by the node per table as one-minute buckets; the
// caller breakdown exists only in the console lines.
function servedQueriesFromBuckets(byTable) {
  const served = new Map();
  for (const [tableName, slice] of Object.entries(byTable)) {
    served.set(tableName, {
      tableName,
      queries: bucketTotal(slice, 'queries'),
      rows: bucketTotal(slice, 'rows'),
      responseBytes: bucketTotal(slice, 'responseBytes'),
      largestResponseBytes: bucketMax(slice, 'largestResponseBytes') ?? 0,
      executionMs: bucketTotal(slice, 'executionMs'),
      maxExecutionMs: bucketMax(slice, 'maxExecutionMs') ?? 0,
      bytesByCaller: {},
    });
  }
  return served;
}

function cdcTimingOf(collectors) {
  const waves = collectors.cdcWaves;
  const applies = collectors.cdcApplies;
  return {
    waves: isMeasured(waves) ? {
      rawWaves: waves.raw.length,
      maxWaveMs: bucketMax(waves, 'waveMs'),
      maxSourceApplyMs: bucketMax(waves, 'sourceApplyMs'),
      failedTargets: waves.raw.reduce((sum, wave) => sum + (wave.failedTargets ?? 0), 0) +
        bucketTotal(waves, 'failedTargets'),
    } : {state: waves?.state ?? null, reason: waves?.reason ?? null},
    // Apply lag includes the clock skew between the origin and this node.
    maxApplyLagMsByTable: isMeasured(applies) ?
      Object.fromEntries(arrayMap(Object.entries(applies.byKey), ([table, slice]) =>
        [table, bucketMax(slice, 'lagMs')])) :
      {state: applies?.state ?? null, reason: applies?.reason ?? null},
  };
}

// Each series the node's collection measured replaces the log's.
function ingestCollectedSeries(node, collectors) {
  if (isMeasured(collectors.eventLoop)) {
    node.sources.eventLoopDelay = EVIDENCE_SOURCE.NODE_HEALTH;
    node.eventLoopDelaySamples = arrayMap(collectors.eventLoop.raw, (sample) => ({...sample}));
  }
  if (isMeasured(collectors.process)) {
    node.sources.process = EVIDENCE_SOURCE.NODE_HEALTH;
    node.processSamples = arrayMap(collectors.process.raw, (sample) => ({...sample}));
  }
  if (isMeasured(collectors.peerTraffic)) {
    node.sources.peerTraffic = EVIDENCE_SOURCE.NODE_HEALTH;
    for (const [peerNodeId, slice] of Object.entries(collectors.peerTraffic.byKey)) {
      peerEvidenceOf(node, peerNodeId).traffic = arrayMap(slice.raw, (sample) => ({...sample}));
    }
  }
  if (isMeasured(collectors.servedQueries)) {
    node.sources.servedQueries = EVIDENCE_SOURCE.NODE_HEALTH;
    node.servedQueries = servedQueriesFromBuckets(collectors.servedQueries.byKey);
  }
  if (isMeasured(collectors.ackTimeouts)) {
    node.sources.ackTimeouts = EVIDENCE_SOURCE.NODE_HEALTH;
    for (const peer of node.peers.values()) peer.ackTimeoutDetails = [];
    for (const event of collectors.ackTimeouts.events) {
      peerEvidenceOf(node, String(event.targetNodeId)).ackTimeoutDetails.push({...event});
    }
  }
}

/**
 * Add a collected cluster health answer. A series the collection measured
 * replaces the same series read from the log, so one fact has one source.
 * @param {Object} evidence - createRunHealthEvidence().
 * @param {Object} clusterHealth - collectClusterHealth's result.
 * @return {void}
 */
function ingestClusterHealth(evidence, clusterHealth) {
  for (const entry of clusterHealth?.nodes ?? []) {
    const node = nodeEvidenceOf(evidence, entry.nodeId);
    if (entry.state !== NODE_HEALTH_COLLECTED) {
      node.healthCollection = {state: entry.state, reason: entry.reason};
      continue;
    }
    const response = entry.health?.response ?? null;
    node.healthCollection = {state: entry.state, response};
    // A slice whose raw samples the node withheld to stay inside its byte
    // bound (or that exceeded it) is not the complete series: the log's
    // series stay the source, and the report names the withheld count.
    if (response?.state !== NODE_HEALTH_RESPONSE_STATE.COMPLETE) continue;
    const collectors = entry.health?.collectors ?? {};
    ingestCollectedSeries(node, collectors);
    node.cdc = cdcTimingOf(collectors);
  }
}

export {
  EVIDENCE_SOURCE,
  createRunHealthEvidence,
  ingestClusterHealth,
  ingestNodeLogLine,
};
