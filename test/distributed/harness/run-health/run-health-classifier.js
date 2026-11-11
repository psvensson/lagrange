/**
 * Run health classifier: a pure function from a run's resource samples,
 * evidence (node log lines and collected node health) and link baseline to
 * the run's `runHealth` section.
 *
 * It classifies and flags; it decides nothing. A scenario's outcome, its
 * bounds and its failure class are untouched by anything computed here.
 *
 * `infrastructureSuspect` is
 *   true     when any flagged verdict is attributed to infrastructure,
 *   false    when every check that can show an infrastructure problem was
 *            evaluated and none is flagged,
 *   unknown  otherwise - at least one such check had no input.
 * A flagged verdict attributed to the workload (the node's own CPU, a link
 * that carried at least its measured ceiling) is reported, and is NOT
 * infrastructure evidence.
 */

import {
  ATTRIBUTION,
  INFRASTRUCTURE_SUSPECT,
  LINK_VERDICT,
  NODE_VERDICT,
  RUN_HEALTH_SCHEMA_VERSION,
  RUN_HEALTH_THRESHOLD_TABLE,
  UNAVAILABLE_REASON,
  VERDICT_STATE,
} from './run-health-constants.js';
import {classifyNode} from './run-health-node-verdicts.js';
import {classifyLink} from './run-health-link-verdicts.js';
import {
  arrayFilter,
  arrayFind,
  arrayFlatMap,
  arrayMap,
  includesOf,
} from './captured-intrinsics.js';

const BASELINE_MEASURED = 'measured';
const BASELINE_PHASES = Object.freeze(['preRun', 'postRun']);
const RATIO_DECIMALS = 4;

// The checks whose `unknown` keeps the overall classification unknown: the
// ones that can show a machine or network problem.
const INFRASTRUCTURE_CHECKS = Object.freeze(new Set([
  NODE_VERDICT.HOST_CPU_CONTENDED,
  NODE_VERDICT.MEMORY_PRESSURE,
  NODE_VERDICT.THERMALLY_THROTTLED,
  NODE_VERDICT.LOSSY,
  LINK_VERDICT.BANDWIDTH_LIMITED,
  LINK_VERDICT.LATENCY_DEGRADED,
  LINK_VERDICT.STALLED,
]));

const EMPTY_PEER_EVIDENCE = Object.freeze({
  traffic: Object.freeze([]),
  ackTimeoutDetails: Object.freeze([]),
  routerTimeoutMentions: 0,
  boundsSpentByWait: Object.freeze({}),
  slowNotDead: Object.freeze({count: 0, maxLastInboundAgoMs: null, atMs: null}),
});

function groupSamplesByNode(samples) {
  const byNode = new Map();
  for (const sample of samples) {
    if (typeof sample?.nodeId !== 'string') continue;
    if (!byNode.has(sample.nodeId)) byNode.set(sample.nodeId, []);
    byNode.get(sample.nodeId).push(sample);
  }
  for (const nodeSamples of byNode.values()) {
    nodeSamples.sort((left, right) => left.timestamp - right.timestamp);
  }
  return byNode;
}

function measuredPairs(linkBaseline, phase) {
  const pairs = linkBaseline?.[phase]?.pairs;
  return Array.isArray(pairs) ?
    arrayFilter(pairs, (pair) => pair.outcome === BASELINE_MEASURED) : [];
}

function hostNameOfAddress(linkBaseline, address) {
  const host = arrayFind(linkBaseline?.hosts ?? [], (entry) => entry.ip === address);
  return host === undefined ? null : host.name;
}

// One phase's measurement of a direction: the pair probed from `from` gives
// its upload, the pair probed from `to` gives its download.
function phaseDirection(linkBaseline, phase, fromHost, toHost) {
  for (const pair of measuredPairs(linkBaseline, phase)) {
    if (pair.from === fromHost && pair.to === toHost) {
      return {roundTripMs: pair.roundTripMs, bytesPerSecond: pair.upload.bytesPerSecond};
    }
    if (pair.from === toHost && pair.to === fromHost) {
      return {roundTripMs: pair.roundTripMs, bytesPerSecond: pair.download.bytesPerSecond};
    }
  }
  return null;
}

/**
 * The link baseline of one direction, or the reason there is none.
 * @param {Object|null} linkBaseline
 * @param {string|null} fromAddress
 * @param {string|null} toAddress
 * @return {{baseline: Object|null, reason: string|null}}
 */
function directionBaseline(linkBaseline, fromAddress, toAddress) {
  if (linkBaseline === null || linkBaseline === undefined) {
    return {baseline: null, reason: UNAVAILABLE_REASON.NO_LINK_BASELINE};
  }
  const fromHost = hostNameOfAddress(linkBaseline, fromAddress);
  const toHost = hostNameOfAddress(linkBaseline, toAddress);
  if (fromHost === null || toHost === null) {
    return {baseline: null, reason: UNAVAILABLE_REASON.HOST_OF_NODE_UNKNOWN};
  }
  const [pre, post] = arrayMap(BASELINE_PHASES, (phase) =>
    phaseDirection(linkBaseline, phase, fromHost, toHost));
  const phases = arrayFilter([pre, post], (phase) => phase !== null);
  if (phases.length === 0) {
    return {baseline: null, reason: UNAVAILABLE_REASON.LINK_BASELINE_PAIR_UNAVAILABLE};
  }
  return {
    reason: null,
    baseline: {
      fromHost,
      toHost,
      phasesMeasured: phases.length,
      throughputBytesPerSecond: arrayFilter(arrayMap(phases,
        (phase) => phase.bytesPerSecond),
      (value) => Number.isFinite(value)),
      roundTripMaxMs: Math.max(...arrayMap(phases, (phase) => phase.roundTripMs.max)),
      // Comparable only when both the pre- and the post-run probe measured.
      roundTripDegraded: pre === null || post === null ? null : {
        preRunP50Ms: pre.roundTripMs.p50,
        preRunMaxMs: pre.roundTripMs.max,
        postRunP50Ms: post.roundTripMs.p50,
        degraded: post.roundTripMs.p50 > pre.roundTripMs.max,
      },
    },
  };
}

function baselineRetransmitRatio(linkBaseline) {
  const ratios = arrayMap(arrayFilter(arrayFlatMap(BASELINE_PHASES,
    (phase) => measuredPairs(linkBaseline, phase)),
  (pair) => pair.tcpSegments !== null && pair.tcpSegments !== undefined &&
      pair.tcpSegments.sent > 0), (pair) => pair.tcpSegments.retransmitted / pair.tcpSegments.sent);
  return ratios.length === 0 ? null : Number(Math.max(...ratios).toFixed(RATIO_DECIMALS));
}

function verdictOf(result, name) {
  return arrayFind(result.verdicts, (verdict) => verdict.verdict === name);
}

function servedQueriesOf(nodeEvidence) {
  if (nodeEvidence === undefined) return [];
  return [...nodeEvidence.servedQueries.values()]
    .sort((left, right) => right.responseBytes - left.responseBytes);
}

function describeInputs(samples, evidence, linkBaseline) {
  return {
    resourceSamples: samples.length,
    linkBaseline: linkBaseline === null || linkBaseline === undefined ?
      {state: VERDICT_STATE.UNKNOWN, reason: UNAVAILABLE_REASON.NO_LINK_BASELINE} :
      {
        state: BASELINE_MEASURED,
        preRunPairsMeasured: measuredPairs(linkBaseline, BASELINE_PHASES[0]).length,
        postRunPairsMeasured: measuredPairs(linkBaseline, BASELINE_PHASES[1]).length,
      },
    nodeEvidence: arrayMap([...evidence.nodes.values()], (node) => ({
      nodeId: node.nodeId,
      logLines: node.lines,
      logSource: node.logSource === undefined ? null : node.logSource,
      logIsComplete: node.logIsComplete === true,
      seriesSources: node.sources,
      healthCollection: node.healthCollection === undefined ? null : node.healthCollection,
      peerTrafficSamples: [...node.peers.values()]
        .reduce((sum, peer) => sum + peer.traffic.length, 0),
      eventLoopDelaySamples: node.eventLoopDelaySamples.length,
      eventLoopGapEvents: node.eventLoopGaps.length,
    })),
  };
}

function subjectOf(entry) {
  return entry.kind === 'node' ? `node ${entry.subject}` : `link ${entry.subject}`;
}

function summarize(nodes, links) {
  const all = [
    ...arrayFlatMap(nodes, (node) => arrayMap(node.verdicts, (verdict) =>
      ({kind: 'node', subject: node.nodeId, verdict}))),
    ...arrayFlatMap(links, (link) => arrayMap(link.verdicts, (verdict) =>
      ({kind: 'link', subject: `${link.from} -> ${link.to}`, verdict}))),
  ];
  const flaggedEntries = arrayFilter(all, (entry) => entry.verdict.state === VERDICT_STATE.FLAGGED);
  const describe = (entry) => ({
    subject: subjectOf(entry),
    verdict: entry.verdict.verdict,
    attribution: entry.verdict.attribution,
  });
  const infrastructure = arrayFilter(flaggedEntries,
    (entry) => entry.verdict.attribution === ATTRIBUTION.INFRASTRUCTURE);
  const unknownChecks = arrayFilter(all, (entry) =>
    entry.verdict.state === VERDICT_STATE.UNKNOWN &&
    INFRASTRUCTURE_CHECKS.has(entry.verdict.verdict));
  const unknownByReason = {};
  for (const entry of unknownChecks) {
    const key = `${entry.verdict.verdict}: ${entry.verdict.reason}`;
    unknownByReason[key] = (unknownByReason[key] ?? 0) + 1;
  }
  let suspect = INFRASTRUCTURE_SUSPECT.FALSE;
  if (infrastructure.length > 0) suspect = INFRASTRUCTURE_SUSPECT.TRUE;
  else if (unknownChecks.length > 0 || all.length === 0) {
    suspect = INFRASTRUCTURE_SUSPECT.UNKNOWN;
  }
  const reasons = [
    ...arrayMap(infrastructure, (entry) =>
      `${subjectOf(entry)}: ${entry.verdict.verdict} flagged, attributed to infrastructure`),
    ...arrayMap(Object.entries(unknownByReason), ([key, count]) =>
      `unknown (${count} check${count === 1 ? '' : 's'}) ${key}`),
  ];
  if (all.length === 0) reasons.push(`no inputs: ${UNAVAILABLE_REASON.NO_SAMPLES}`);
  return {
    infrastructureSuspect: suspect,
    reasons,
    infrastructureFindings: arrayMap(infrastructure, describe),
    workloadFindings: arrayMap(arrayFilter(flaggedEntries,
      (entry) => entry.verdict.attribution === ATTRIBUTION.WORKLOAD),
    describe),
    undeterminedFindings: arrayMap(arrayFilter(flaggedEntries,
      (entry) => entry.verdict.attribution === ATTRIBUTION.UNDETERMINED),
    describe),
    checks: {
      total: all.length,
      flagged: flaggedEntries.length,
      clear: arrayFilter(all, (entry) => entry.verdict.state === VERDICT_STATE.CLEAR).length,
      unknown: arrayFilter(all, (entry) => entry.verdict.state === VERDICT_STATE.UNKNOWN).length,
    },
  };
}

/**
 * Classify one run.
 * @param {Object} input
 * @param {Array<Object>} input.samples - The run's samples.ndjson records.
 * @param {Object} input.evidence - run-health-evidence.js record.
 * @param {Object|null} [input.linkBaseline] - The lab adapter's link
 *   baseline, or null when the run has none.
 * @return {Object} The `runHealth` section.
 */
function classifyRunHealth({samples, evidence, linkBaseline = null}) {
  const samplesByNode = groupSamplesByNode(samples);
  const peersNamed = arrayFlatMap([...evidence.nodes.values()], (node) => [...node.peers.keys()]);
  // The resource samples list the run's nodes. A peer key that is not one
  // of them is a connection the router had not identified yet, not a node;
  // only a run without samples takes its nodes from the peers its logs name.
  const nodeIds = [...new Set([...samplesByNode.keys(), ...evidence.nodes.keys(),
    ...(samplesByNode.size === 0 ? peersNamed : [])])].sort();
  const timestamps = arrayFilter(arrayMap(samples,
    (sample) => sample.timestamp),
  (value) => Number.isFinite(value));
  const runStartAtMs = timestamps.length === 0 ? 0 : Math.min(...timestamps);
  const retransmitRatio = baselineRetransmitRatio(linkBaseline);
  const nodes = arrayMap(nodeIds, (nodeId) => ({
    ...classifyNode({
      nodeId,
      samples: samplesByNode.get(nodeId) ?? [],
      nodeEvidence: evidence.nodes.get(nodeId),
      runStartAtMs,
      baselineRetransmitRatio: retransmitRatio,
    }),
    servedQueries: servedQueriesOf(evidence.nodes.get(nodeId)),
    cdc: evidence.nodes.get(nodeId)?.cdc ?? null,
  }));
  const nodeById = new Map(arrayMap(nodes, (node) => [node.nodeId, node]));
  const loopDelayed = (nodeId) => verdictOf(nodeById.get(nodeId),
    NODE_VERDICT.EVENT_LOOP_DELAYED).state === VERDICT_STATE.FLAGGED;
  const links = [];
  for (const from of nodeIds) {
    for (const to of nodeIds) {
      if (from === to) continue;
      const localEvidence = evidence.nodes.get(from);
      const peerEvidence = localEvidence?.peers.get(to);
      const {baseline, reason} = directionBaseline(linkBaseline,
        nodeById.get(from).address, nodeById.get(to).address);
      links.push(classifyLink({
        from,
        to,
        peerEvidence: peerEvidence === undefined ? EMPTY_PEER_EVIDENCE : peerEvidence,
        localEvidence,
        remoteEvidence: evidence.nodes.get(to),
        baseline,
        baselineUnavailableReason: reason,
        localLossy: verdictOf(nodeById.get(from), NODE_VERDICT.LOSSY),
        remoteLossy: verdictOf(nodeById.get(to), NODE_VERDICT.LOSSY),
        endpointLoopDelayed: loopDelayed(from) || loopDelayed(to),
      }));
    }
  }
  return {
    schemaVersion: RUN_HEALTH_SCHEMA_VERSION,
    ...summarize(nodes, links),
    runStartAtMs,
    nodes,
    links,
    inputs: {
      ...describeInputs(samples, evidence, linkBaseline),
      peerKeysThatAreNotNodes:
        [...new Set(arrayFilter(peersNamed, (peer) => !includesOf(nodeIds, peer)))],
    },
    thresholds: RUN_HEALTH_THRESHOLD_TABLE,
  };
}

const VERDICT_ID_SEPARATOR = ':';

/**
 * The compact form a scenario's report entry carries: the overall
 * classification and the id of every flagged verdict
 * (`node:<nodeId>:<verdict>` or `link:<from>-><to>:<verdict>`), each with
 * its attribution.
 * @param {Object} runHealth - classifyRunHealth's result.
 * @return {Object}
 */
function summarizeRunHealth(runHealth) {
  const flaggedOf = (kind, subject, verdicts) => arrayMap(
    arrayFilter(verdicts, (verdict) => verdict.state === VERDICT_STATE.FLAGGED),
    (verdict) => ({
      id: [kind, subject, verdict.verdict].join(VERDICT_ID_SEPARATOR),
      attribution: verdict.attribution,
    }));
  return {
    infrastructureSuspect: runHealth.infrastructureSuspect,
    checks: runHealth.checks,
    flagged: [
      ...arrayFlatMap(runHealth.nodes, (node) => flaggedOf('node', node.nodeId, node.verdicts)),
      ...arrayFlatMap(runHealth.links,
        (link) => flaggedOf('link', `${link.from}->${link.to}`, link.verdicts)),
    ],
    reasons: runHealth.reasons,
  };
}

export {classifyRunHealth, summarizeRunHealth};
