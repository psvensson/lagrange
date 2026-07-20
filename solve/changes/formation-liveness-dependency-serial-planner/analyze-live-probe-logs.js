/**
 * Analyze immutable per-node logs captured alongside the ordered formation
 * probe gate. The controlled A/B's largest fixed matched-window ACK-skip count
 * is the comparison threshold; escalation additionally requires a correlated
 * level-50 transport/reconnect/CDC signal in at least two probes.
 *
 * Usage:
 *   node analyze-live-probe-logs.js <capture-manifest> <gate-summary>
 *     <live-ab-analysis> <output-json>
 */

import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const EXPECTED_ARGUMENT_COUNT = 4;
const ACK_SKIP_MESSAGE =
  'Skipping ACK-timeout quarantine: peer demonstrably alive (slow, not dead)';
const EXECUTING_MOVE_MESSAGE = 'Executing rebalancing move';
const SKIPPED_MOVE_MESSAGE = 'Rebalancing move skipped';
const EVENT_LOOP_GAP_MESSAGE = 'Event loop gap detected';
const LEVEL_ERROR = 50;
const CORRELATED_MESSAGE_PATTERN = /websocket|reconnect|cdc/i;

function parseJsonLine(line) {
  const jsonStart = line.indexOf('{');
  if (jsonStart < 0) {
    return null;
  }
  try {
    return JSON.parse(line.slice(jsonStart));
  } catch {
    return null;
  }
}

function countAckSkipInMatchedWindow(sample) {
  const entries =
    sample?.logCensus?.matchedFormationWindow?.topNodesP1Level40Messages || [];
  const match = entries.find((entry) => entry.message === ACK_SKIP_MESSAGE);
  return Number(match?.count || 0);
}

function countAllTargetAckSkipInMatchedWindow(sample) {
  return Number(
    sample?.logCensus?.matchedFormationWindow
      ?.ackTimeoutPeerAliveSkips || 0,
  );
}

function resolveFixedAckReferences(analysis) {
  const fixedSamples = analysis.samples
    .filter((sample) => sample.arm === 'fixed' && sample.measuring === true);
  if (fixedSamples.length === 0) {
    throw new Error('Live A/B analysis has no measuring fixed samples');
  }
  const nodesP1 = fixedSamples.map(countAckSkipInMatchedWindow);
  const allTargets = fixedSamples.map(
    countAllTargetAckSkipInMatchedWindow,
  );
  if (allTargets.some((count) => count <= 0)) {
    throw new Error(
      'Live A/B analysis lacks matched-window all-target ACK-skip counts',
    );
  }
  return {
    nodesP1Exclusive: Math.max(...nodesP1),
    allTargetsExclusive: Math.max(...allTargets),
    fixedSamples: fixedSamples.map((sample, index) => ({
      id: sample.id,
      nodesP1: nodesP1[index],
      allTargets: allTargets[index],
    })),
  };
}

function createCensus() {
  return {
    structuredEvents: 0,
    level50: 0,
    ackTimeoutPeerAliveSkips: 0,
    ackTimeoutPeerAliveSkipsNodesP1: 0,
    ackTimeoutPeerAliveSkipsByTargetNode: {},
    ackTimeoutPeerAliveSkipsByTargetSurface: {},
    correlatedLevel50: 0,
    correlatedLevel50ByMessage: {},
    executedMoves: 0,
    executedMovesByEntity: {},
    executedMovesByType: {},
    executedMovesByTimestamp: {},
    maxMovesAtOneTimestamp: 0,
    skippedMoves: 0,
    skippedMovesByReason: {},
    skippedMovesByAdmissionReason: {},
    eventLoopGaps: 0,
    maxEventLoopGapMs: 0,
    maxEventLoopUtilization: 0,
    maxBlockedPercentOfWall: 0,
    cdcFailuresByPartition: {},
  };
}

function incrementCount(map, key) {
  const normalizedKey = String(key || 'unknown');
  map[normalizedKey] = (map[normalizedKey] || 0) + 1;
}

function ackTargetSurface(address) {
  const normalizedAddress = String(address || '');
  const partitionMatch = normalizedAddress.match(/\/partition\/([^/]+)/);
  if (partitionMatch) {
    return `partition:${partitionMatch[1]}`;
  }
  const messageGroupMatch = normalizedAddress.match(/\/message-group\/([^/]+)/);
  if (messageGroupMatch) {
    return `message-group:${messageGroupMatch[1]}`;
  }
  if (normalizedAddress.includes('/swim/')) {
    return 'swim';
  }
  return normalizedAddress || 'unknown';
}

function addEventToCensus(census, event) {
  census.structuredEvents += 1;
  const message = String(event.msg || event.message || '');
  const level = Number(event.level);
  if (message === ACK_SKIP_MESSAGE) {
    census.ackTimeoutPeerAliveSkips += 1;
    if (String(event.targetAddress || '').includes('/partition/nodes-p1-')) {
      census.ackTimeoutPeerAliveSkipsNodesP1 += 1;
    }
    incrementCount(
      census.ackTimeoutPeerAliveSkipsByTargetNode,
      event.targetNodeId,
    );
    incrementCount(
      census.ackTimeoutPeerAliveSkipsByTargetSurface,
      ackTargetSurface(event.targetAddress),
    );
  }
  if (level >= LEVEL_ERROR) {
    census.level50 += 1;
    if (CORRELATED_MESSAGE_PATTERN.test(message)) {
      census.correlatedLevel50 += 1;
      incrementCount(census.correlatedLevel50ByMessage, message);
    }
  }
  if (message === EXECUTING_MOVE_MESSAGE) {
    census.executedMoves += 1;
    incrementCount(census.executedMovesByEntity, event.entityId);
    incrementCount(census.executedMovesByType, event.moveType);
    incrementCount(census.executedMovesByTimestamp, event.time);
    census.maxMovesAtOneTimestamp = Math.max(
      census.maxMovesAtOneTimestamp,
      census.executedMovesByTimestamp[String(event.time || 'unknown')],
    );
  }
  if (message === SKIPPED_MOVE_MESSAGE) {
    census.skippedMoves += 1;
    incrementCount(census.skippedMovesByReason, event.reason);
    incrementCount(
      census.skippedMovesByAdmissionReason,
      event.admissionReason,
    );
  }
  if (message === EVENT_LOOP_GAP_MESSAGE) {
    census.eventLoopGaps += 1;
    census.maxEventLoopGapMs = Math.max(
      census.maxEventLoopGapMs,
      Number(event.gapMs || 0),
    );
    census.maxEventLoopUtilization = Math.max(
      census.maxEventLoopUtilization,
      Number(event.eventLoopUtilization || 0),
    );
    census.maxBlockedPercentOfWall = Math.max(
      census.maxBlockedPercentOfWall,
      Number(event?.cumulative?.blockedPercentOfWall || 0),
    );
  }
  if (
    level >= LEVEL_ERROR &&
    /CDC/.test(message) &&
    typeof event.partitionId === 'string'
  ) {
    incrementCount(census.cdcFailuresByPartition, event.partitionId);
  }
}

async function readNodeLog(path) {
  const text = await readFile(path, 'utf8');
  const events = [];
  const sourceFingerprints = new Set();
  for (const line of text.split('\n')) {
    const event = parseJsonLine(line);
    if (!event) {
      continue;
    }
    events.push(event);
    for (const candidate of [
      event.bootedSrcFingerprint,
      event.srcFingerprint,
      event.sourceFingerprint,
      event?.provenance?.srcFingerprint,
    ]) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        sourceFingerprints.add(candidate);
      }
    }
  }
  return {
    events,
    sourceFingerprints: [...sourceFingerprints].sort(),
  };
}

function analyzeEvents(events, exclusiveEndTime = null) {
  const census = createCensus();
  for (const event of events) {
    if (
      exclusiveEndTime !== null &&
      String(event.time || '') >= exclusiveEndTime
    ) {
      continue;
    }
    addEventToCensus(census, event);
  }
  return census;
}

function mergeCountMaps(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

function mergeCensus(target, source) {
  for (const key of [
    'structuredEvents',
    'level50',
    'ackTimeoutPeerAliveSkips',
    'ackTimeoutPeerAliveSkipsNodesP1',
    'correlatedLevel50',
    'executedMoves',
    'skippedMoves',
    'eventLoopGaps',
  ]) {
    target[key] += source[key];
  }
  for (const key of [
    'ackTimeoutPeerAliveSkipsByTargetNode',
    'ackTimeoutPeerAliveSkipsByTargetSurface',
    'correlatedLevel50ByMessage',
    'executedMovesByEntity',
    'executedMovesByType',
    'executedMovesByTimestamp',
    'skippedMovesByReason',
    'skippedMovesByAdmissionReason',
    'cdcFailuresByPartition',
  ]) {
    mergeCountMaps(target[key], source[key]);
  }
  target.maxMovesAtOneTimestamp = Math.max(
    target.maxMovesAtOneTimestamp,
    source.maxMovesAtOneTimestamp,
  );
  target.maxEventLoopGapMs = Math.max(
    target.maxEventLoopGapMs,
    source.maxEventLoopGapMs,
  );
  target.maxEventLoopUtilization = Math.max(
    target.maxEventLoopUtilization,
    source.maxEventLoopUtilization,
  );
  target.maxBlockedPercentOfWall = Math.max(
    target.maxBlockedPercentOfWall,
    source.maxBlockedPercentOfWall,
  );
}

function resolveShutdownCutoff(nodeLogs) {
  const shutdownTimes = nodeLogs
    .flatMap((nodeLog) => nodeLog.events)
    .filter((event) => event.signal === 'SIGTERM')
    .map((event) => event.time)
    .filter((time) => typeof time === 'string' && time.length > 0)
    .sort();
  return shutdownTimes[0] || null;
}

function resolveSeedNodeId(nodeLogs) {
  const candidates = {};
  for (const nodeLog of nodeLogs) {
    for (const event of nodeLog.events) {
      if (
        typeof event.seedNodeId === 'string' &&
        event.seedNodeId !== event.nodeId &&
        /Connecting to seed node/.test(String(event.msg || ''))
      ) {
        incrementCount(candidates, event.seedNodeId);
      }
    }
  }
  const orderedCandidates = Object.entries(candidates)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return orderedCandidates[0]?.[0] || null;
}

async function analyzeCluster(cluster, slot, ackReference) {
  const rawNodeLogs = [];
  for (const node of cluster.nodes) {
    rawNodeLogs.push({
      node,
      ...(await readNodeLog(node.logPath)),
    });
  }
  const shutdownCutoffExclusive = resolveShutdownCutoff(rawNodeLogs);
  const seedNodeId = resolveSeedNodeId(rawNodeLogs);
  const nodeResults = [];
  const total = createCensus();
  const preShutdown = createCensus();
  const sourceFingerprints = new Set();
  for (const nodeLog of rawNodeLogs) {
    const census = analyzeEvents(nodeLog.events);
    const nodePreShutdown = analyzeEvents(
      nodeLog.events,
      shutdownCutoffExclusive,
    );
    nodeResults.push({
      nodeId: nodeLog.node.nodeId,
      seed: nodeLog.node.nodeId === seedNodeId,
      logPath: nodeLog.node.logPath,
      sourceFingerprints: nodeLog.sourceFingerprints,
      total: census,
      preShutdown: nodePreShutdown,
    });
    mergeCensus(total, census);
    mergeCensus(preShutdown, nodePreShutdown);
    for (const fingerprint of nodeLog.sourceFingerprints) {
      sourceFingerprints.add(fingerprint);
    }
  }
  const ackSkipHighNodesP1 =
    preShutdown.ackTimeoutPeerAliveSkipsNodesP1 >
      ackReference.nodesP1Exclusive;
  const ackSkipHighAllTargets =
    preShutdown.ackTimeoutPeerAliveSkips >
      ackReference.allTargetsExclusive;
  const ackSkipHigh = ackSkipHighNodesP1 || ackSkipHighAllTargets;
  return {
    slot,
    clusterId: cluster.clusterId,
    firstSeenAt: cluster.firstSeenAt,
    completedAt: cluster.completedAt,
    seedNodeId,
    shutdownCutoffExclusive,
    ackReferenceExclusive: ackReference,
    comparisonWindow: 'pre-SIGTERM',
    ackSkipHighNodesP1,
    ackSkipHighAllTargets,
    ackSkipHigh,
    highWithCorrelatedFailure:
      ackSkipHigh && preShutdown.correlatedLevel50 > 0,
    sourceFingerprints: [...sourceFingerprints].sort(),
    total,
    preShutdown,
    nodes: nodeResults,
  };
}

const args = process.argv.slice(2);
if (args.length !== EXPECTED_ARGUMENT_COUNT) {
  throw new Error(
    'Usage: node analyze-live-probe-logs.js <capture-manifest> ' +
    '<gate-summary> <live-ab-analysis> <output-json>',
  );
}
const [manifestArg, gateSummaryArg, liveAbArg, outputArg] =
  args.map((arg) => resolve(arg));
const [manifest, gateSummary, liveAbAnalysis] = await Promise.all([
  readFile(manifestArg, 'utf8').then(JSON.parse),
  readFile(gateSummaryArg, 'utf8').then(JSON.parse),
  readFile(liveAbArg, 'utf8').then(JSON.parse),
]);
const ackReference = resolveFixedAckReferences(liveAbAnalysis);
const orderedClusters = [...manifest.clusters]
  .sort((left, right) => left.firstSeenAt.localeCompare(right.firstSeenAt));
const probes = [];
for (let index = 0; index < orderedClusters.length; index += 1) {
  probes.push(await analyzeCluster(
    orderedClusters[index],
    index + 1,
    ackReference,
  ));
}
const highWithCorrelatedFailureCount = probes
  .filter((probe) => probe.highWithCorrelatedFailure)
  .length;
const output = {
  schemaVersion: 'formation-probe-log-analysis-v3',
  gateSummary: gateSummaryArg,
  captureManifest: manifestArg,
  liveAbAnalysis: liveAbArg,
  sourceFingerprint: gateSummary.sourceFingerprint,
  sourceStable: gateSummary.sourceStable,
  gatePassed: gateSummary.gatePassed,
  ackSkipHighDefinition:
    'like-for-like pre-SIGTERM count exceeds the largest fixed A/B ' +
    `matched-window count: nodes-p1 > ${ackReference.nodesP1Exclusive} or ` +
    `all targets > ${ackReference.allTargetsExclusive}`,
  escalationDefinition:
    'high pre-SIGTERM ACK-skip count with a pre-SIGTERM correlated level-50 ' +
    'transport, reconnect, or CDC event in at least two probes',
  highWithCorrelatedFailureCount,
  escalationRequired: highWithCorrelatedFailureCount >= 2,
  probes,
};
await writeFile(outputArg, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  output: outputArg,
  gatePassed: output.gatePassed,
  sourceStable: output.sourceStable,
  ackSkipHighDefinition: output.ackSkipHighDefinition,
  highWithCorrelatedFailureCount,
  escalationRequired: output.escalationRequired,
  probes: probes.map((probe) => ({
    slot: probe.slot,
    seedNodeId: probe.seedNodeId,
    shutdownCutoffExclusive: probe.shutdownCutoffExclusive,
    ackTimeoutPeerAliveSkips:
      probe.preShutdown.ackTimeoutPeerAliveSkips,
    ackTimeoutPeerAliveSkipsNodesP1:
      probe.preShutdown.ackTimeoutPeerAliveSkipsNodesP1,
    correlatedLevel50: probe.preShutdown.correlatedLevel50,
    level50: probe.preShutdown.level50,
    seedEventLoopGaps: probe.nodes
      .find((node) => node.seed)?.preShutdown.eventLoopGaps || 0,
    seedMaxEventLoopGapMs: probe.nodes
      .find((node) => node.seed)?.preShutdown.maxEventLoopGapMs || 0,
    seedMaxBlockedPercentOfWall: probe.nodes
      .find((node) => node.seed)?.preShutdown.maxBlockedPercentOfWall || 0,
    seedExecutedMoves: probe.nodes
      .find((node) => node.seed)?.preShutdown.executedMoves || 0,
    seedMaxMovesAtOneTimestamp: probe.nodes
      .find((node) => node.seed)?.preShutdown.maxMovesAtOneTimestamp || 0,
    ackSkipHighNodesP1: probe.ackSkipHighNodesP1,
    ackSkipHighAllTargets: probe.ackSkipHighAllTargets,
    ackSkipHigh: probe.ackSkipHigh,
  })),
}, null, 2));
