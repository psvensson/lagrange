import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ATTRIBUTION,
  HOST_FACT_STATE,
  INFRASTRUCTURE_SUSPECT,
  LINK_VERDICT,
  NODE_LOG_MESSAGE,
  NODE_LOG_OWNER_SOURCE,
  NODE_VERDICT,
  RUN_HEALTH_THRESHOLD,
  RUN_HEALTH_THRESHOLD_TABLE,
  THRESHOLD_SOURCE,
  UNAVAILABLE_REASON,
  VERDICT_STATE,
} from '../run-health/run-health-constants.js';
import {
  EVIDENCE_SOURCE,
  createRunHealthEvidence,
  ingestClusterHealth,
  ingestNodeLogLine,
} from '../run-health/run-health-evidence.js';
import {classifyRunHealth} from '../run-health/run-health-classifier.js';
import {
  insertRunHealthSummary,
  renderRunHealthMarkdown,
} from '../run-health/run-health-markdown.js';
import {
  arrayFilter,
  arrayFind,
  arrayMap,
  arraySome,
  includesOf,
  stringEndsWith,
  stringStartsWith,
} from '../run-health/captured-intrinsics.js';

import {NODE_HEALTH_RESPONSE_STATE} from
  '../../../../src/diagnostics/node-health-collection.js';

const START = Date.parse('2026-11-11T05:00:00.000Z');
const COMPLETE_RESPONSE = Object.freeze({state: NODE_HEALTH_RESPONSE_STATE.COMPLETE,
  maxBytes: 2_097_152, withheldRawSamples: 0});
const SECOND = 1000;
const NODE_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const NODE_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const ADDRESS = Object.freeze({[NODE_A]: '192.168.1.10', [NODE_B]: '192.168.1.11'});
const RUN_SECONDS = 120;

function measuredRates(overrides = {}) {
  return {
    state: HOST_FACT_STATE.MEASURED,
    intervalMs: 2 * SECOND,
    hostCpuStealShare: 0,
    hostCpuIowaitShare: 0.01,
    tcpRetransmittedSegments: 1,
    tcpOutSegments: 1000,
    thermalCoreThrottleEvents: 0,
    thermalPackageThrottleEvents: 0,
    ...overrides,
  };
}

// One node's samples every 2 s. `shape(second)` overrides fields per sample.
function nodeSamples(nodeId, shape = () => ({})) {
  const samples = [];
  for (let second = 0; second <= RUN_SECONDS; second += 2) {
    const override = shape(second);
    samples.push({
      timestamp: START + second * SECOND,
      nodeId,
      nodeAddress: ADDRESS[nodeId],
      cpuPercent: 40,
      containerMemoryWorkingSetBytes: 300,
      containerMemoryLimitBytes: 1000,
      host: {memoryPressure: {state: HOST_FACT_STATE.MEASURED, fullAvg10Percent: 0}},
      ...override,
      rates: measuredRates(override.rates),
    });
  }
  return samples;
}

function logLine(nodeId, second, msg, fields = {}) {
  return JSON.stringify({level: 30, time: new Date(START + second * SECOND).toISOString(),
    nodeId, ...fields, msg});
}

function peerTrafficLine(nodeId, peerNodeId, second, fields = {}) {
  return logLine(nodeId, second, NODE_LOG_MESSAGE.PEER_TRAFFIC, {
    localNodeId: nodeId, peerNodeId, intervalMs: SECOND, connectionState: 'connected',
    bufferedAmount: 0, queueInFlight: 0, queuePending: 0, bytesSent: 20_000,
    bytesReceived: 20_000, framesSent: {raft: 8, request: 2}, framesReceived: {raft: 8, ack: 2},
    largestFrameSentBytes: 4_000, largestFrameReceivedBytes: 4_000,
    oneWayLatencyP50Ms: 3, oneWayLatencyMaxMs: 6, oneWayLatencySamples: 4, ...fields,
  });
}

// Both nodes log healthy traffic about each other every second, plus
// delay samples. `shape(from, second)` overrides one line's fields, or
// returns null to drop the line.
function healthyEvidence(shape = () => ({})) {
  const evidence = createRunHealthEvidence();
  for (const [from, to] of [[NODE_A, NODE_B], [NODE_B, NODE_A]]) {
    for (let second = 0; second <= RUN_SECONDS; second += 1) {
      const fields = shape(from, second);
      if (fields !== null) {
        ingestNodeLogLine(evidence, from, peerTrafficLine(from, to, second, fields));
      }
      ingestNodeLogLine(evidence, from, logLine(from, second, 'Process memory sample'));
      if (second % 10 === 0) {
        ingestNodeLogLine(evidence, from, logLine(from, second,
          NODE_LOG_MESSAGE.EVENT_LOOP_DELAY_SAMPLE, {intervalMs: 10_000, delayP50Ms: 20,
            delayP99Ms: 40, delayMaxMs: 80, eventLoopUtilization: 0.4}));
      }
    }
    evidence.nodes.get(from).logIsComplete = true;
  }
  return evidence;
}

function measuredPair(overrides = {}) {
  return {from: 'host-a', to: 'host-b', outcome: 'measured',
    roundTripMs: {samples: [4, 5, 6], p50: 5, max: 8},
    upload: {bytes: 2_097_152, elapsedMs: 800, bytesPerSecond: 2_600_000},
    download: {bytes: 2_097_152, elapsedMs: 900, bytesPerSecond: 2_300_000},
    tcpSegments: {retransmitted: 1, sent: 1500}, ...overrides};
}

function linkBaseline(pre = measuredPair(), post = measuredPair()) {
  return {
    schemaVersion: 1,
    hosts: [{name: 'host-a', ip: ADDRESS[NODE_A]}, {name: 'host-b', ip: ADDRESS[NODE_B]}],
    preRun: {measuredAt: START - 10_000, pairs: [pre]},
    postRun: {measuredAt: START + 200_000, pairs: [post]},
  };
}

function healthyInput(overrides = {}) {
  return {
    samples: [...nodeSamples(NODE_A), ...nodeSamples(NODE_B)],
    evidence: healthyEvidence(),
    linkBaseline: linkBaseline(),
    ...overrides,
  };
}

function nodeVerdict(runHealth, nodeId, name) {
  return arrayFind(arrayFind(runHealth.nodes, (node) => node.nodeId === nodeId)
    .verdicts, (verdict) => verdict.verdict === name);
}

function linkVerdict(runHealth, from, to, name) {
  return arrayFind(arrayFind(runHealth.links, (link) => link.from === from && link.to === to)
    .verdicts, (verdict) => verdict.verdict === name);
}

describe('run health classifier: known-good run', () => {
  it('classifies a healthy, fully observed run as not infrastructure suspect', () => {
    const runHealth = classifyRunHealth(healthyInput());
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.FALSE);
    assert.deepEqual(runHealth.reasons, []);
    assert.equal(runHealth.checks.unknown, 0);
    assert.equal(runHealth.checks.flagged, 0);
    assert.equal(runHealth.checks.total, 2 * 6 + 2 * 4);
    assert.equal(runHealth.nodes[0].address, ADDRESS[NODE_A]);
  });

  it('reports the offered load of every link beside its verdicts', () => {
    const runHealth = classifyRunHealth(healthyInput());
    const link = arrayFind(runHealth.links, (entry) => entry.from === NODE_A);
    assert.equal(link.offeredLoad.meanBytesSentPerSecond, 20_000);
    assert.equal(link.offeredLoad.largestFrameSentBytes, 4_000);
    assert.deepEqual(link.offeredLoad.framesSentByClass,
      {raft: 8 * (RUN_SECONDS + 1), request: 2 * (RUN_SECONDS + 1)});
    assert.deepEqual(link.baseline.throughputBytesPerSecond, [2_600_000, 2_600_000]);
    // The reverse direction reads the same pair's download side.
    assert.deepEqual(arrayFind(runHealth.links, (entry) => entry.from === NODE_B)
      .baseline.throughputBytesPerSecond, [2_300_000, 2_300_000]);
  });

  it('is deterministic', () => {
    assert.deepEqual(classifyRunHealth(healthyInput()), classifyRunHealth(healthyInput()));
  });
});

describe('run health classifier: known-bad nodes', () => {
  it('flags sustained container CPU as workload, not as infrastructure', () => {
    const runHealth = classifyRunHealth(healthyInput({samples: [
      ...nodeSamples(NODE_A, (second) => (second >= 20 && second <= 60 ? {cpuPercent: 99} : {})),
      ...nodeSamples(NODE_B),
    ]}));
    const verdict = nodeVerdict(runHealth, NODE_A, NODE_VERDICT.CPU_SATURATED);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.equal(verdict.attribution, ATTRIBUTION.WORKLOAD);
    assert.equal(verdict.evidence.longestSaturatedMs, 40 * SECOND);
    assert.equal(verdict.evidence.longestSaturatedStartsAtRunMs, 20 * SECOND);
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.FALSE);
    assert.deepEqual(runHealth.workloadFindings, [{subject: `node ${NODE_A}`,
      verdict: NODE_VERDICT.CPU_SATURATED, attribution: ATTRIBUTION.WORKLOAD}]);
  });

  it('does not flag a CPU burst shorter than the sustained window', () => {
    const runHealth = classifyRunHealth(healthyInput({samples: [
      ...nodeSamples(NODE_A, (second) => (second >= 20 && second <= 40 ? {cpuPercent: 99} : {})),
      ...nodeSamples(NODE_B),
    ]}));
    assert.equal(nodeVerdict(runHealth, NODE_A, NODE_VERDICT.CPU_SATURATED).state,
      VERDICT_STATE.CLEAR);
  });

  it('flags machine steal and iowait as infrastructure', () => {
    const runHealth = classifyRunHealth(healthyInput({samples: [
      ...nodeSamples(NODE_A, (second) => (second >= 10 && second <= 50 ?
        {rates: {hostCpuStealShare: 0.2, hostCpuIowaitShare: 0.05}} : {})),
      ...nodeSamples(NODE_B),
    ]}));
    assert.equal(nodeVerdict(runHealth, NODE_A, NODE_VERDICT.HOST_CPU_CONTENDED).attribution,
      ATTRIBUTION.INFRASTRUCTURE);
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.TRUE);
    assert.match(runHealth.reasons[0], /host_cpu_contended flagged/u);
  });

  it('flags any thermal throttle event, and a measured zero is clear', () => {
    const runHealth = classifyRunHealth(healthyInput({samples: [
      ...nodeSamples(NODE_A, (second) => (second === 30 ?
        {rates: {thermalPackageThrottleEvents: 2}} : {})),
      ...nodeSamples(NODE_B),
    ]}));
    const verdict = nodeVerdict(runHealth, NODE_A, NODE_VERDICT.THERMALLY_THROTTLED);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.equal(verdict.evidence.packageThrottleEvents, 2);
    assert.equal(nodeVerdict(runHealth, NODE_B, NODE_VERDICT.THERMALLY_THROTTLED).state,
      VERDICT_STATE.CLEAR);
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.TRUE);
  });

  it('flags memory pressure by cause: the container limit or the machine', () => {
    const runHealth = classifyRunHealth(healthyInput({samples: [
      ...nodeSamples(NODE_A, () => ({containerMemoryWorkingSetBytes: 950})),
      ...nodeSamples(NODE_B, (second) => (second === 40 ? {host: {memoryPressure:
        {state: HOST_FACT_STATE.MEASURED, fullAvg10Percent: 3.5}}} : {})),
    ]}));
    assert.equal(nodeVerdict(runHealth, NODE_A, NODE_VERDICT.MEMORY_PRESSURE).attribution,
      ATTRIBUTION.WORKLOAD);
    assert.equal(nodeVerdict(runHealth, NODE_B, NODE_VERDICT.MEMORY_PRESSURE).attribution,
      ATTRIBUTION.INFRASTRUCTURE);
  });

  it('flags a lossy host and carries it to the links that touch it', () => {
    const runHealth = classifyRunHealth(healthyInput({samples: [
      ...nodeSamples(NODE_A, () => ({rates: {tcpRetransmittedSegments: 30}})),
      ...nodeSamples(NODE_B),
    ]}));
    const verdict = nodeVerdict(runHealth, NODE_A, NODE_VERDICT.LOSSY);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.equal(verdict.evidence.retransmitRatio, 0.03);
    assert.equal(nodeVerdict(runHealth, NODE_B, NODE_VERDICT.LOSSY).state, VERDICT_STATE.CLEAR);
    assert.equal(linkVerdict(runHealth, NODE_B, NODE_A, LINK_VERDICT.LOSSY).state,
      VERDICT_STATE.FLAGGED);
  });

  it('does not flag retransmits the idle link baseline already showed', () => {
    const lossyBaseline = measuredPair({tcpSegments: {retransmitted: 80, sent: 1600}});
    const runHealth = classifyRunHealth(healthyInput({
      samples: [...nodeSamples(NODE_A, () => ({rates: {tcpRetransmittedSegments: 30}})),
        ...nodeSamples(NODE_B)],
      linkBaseline: linkBaseline(lossyBaseline, lossyBaseline),
    }));
    assert.equal(nodeVerdict(runHealth, NODE_A, NODE_VERDICT.LOSSY).state, VERDICT_STATE.CLEAR);
  });

  it('flags an event-loop gap and attributes it by the machine evidence', () => {
    const withGap = () => {
      const evidence = healthyEvidence();
      ingestNodeLogLine(evidence, NODE_A, logLine(NODE_A, 30,
        NODE_LOG_MESSAGE.EVENT_LOOP_GAP_DETECTED, {gapMs: 2141, unexplainedMs: 2141}));
      return evidence;
    };
    const workload = classifyRunHealth(healthyInput({evidence: withGap()}));
    const verdict = nodeVerdict(workload, NODE_A, NODE_VERDICT.EVENT_LOOP_DELAYED);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.equal(verdict.attribution, ATTRIBUTION.WORKLOAD);
    assert.equal(verdict.evidence.maxGapMs, 2141);
    const noHostFacts = classifyRunHealth(healthyInput({evidence: withGap(),
      samples: arrayMap([...nodeSamples(NODE_A), ...nodeSamples(NODE_B)], (sample) =>
        ({...sample, rates: undefined, host: undefined}))}));
    assert.equal(nodeVerdict(noHostFacts, NODE_A, NODE_VERDICT.EVENT_LOOP_DELAYED).attribution,
      ATTRIBUTION.UNDETERMINED);
  });

  it('flags a delay sample at the watchdog threshold', () => {
    const evidence = healthyEvidence();
    ingestNodeLogLine(evidence, NODE_B, logLine(NODE_B, 50,
      NODE_LOG_MESSAGE.EVENT_LOOP_DELAY_SAMPLE, {intervalMs: 10_000, delayP50Ms: 30,
        delayP99Ms: 900, delayMaxMs: RUN_HEALTH_THRESHOLD.eventLoopDelayMs,
        eventLoopUtilization: 0.97}));
    const runHealth = classifyRunHealth(healthyInput({evidence}));
    assert.equal(nodeVerdict(runHealth, NODE_B, NODE_VERDICT.EVENT_LOOP_DELAYED).state,
      VERDICT_STATE.FLAGGED);
  });
});

describe('run health classifier: known-bad links', () => {
  const backlog = (second) => second >= 40 && second < 50;

  it('a backlog on a link that carried its ceiling is workload', () => {
    const runHealth = classifyRunHealth(healthyInput({evidence: healthyEvidence(
      (from, second) => (from === NODE_A && backlog(second) ?
        {bufferedAmount: 900_000, bytesSent: 3_000_000} : {}))}));
    const verdict = linkVerdict(runHealth, NODE_A, NODE_B, LINK_VERDICT.BANDWIDTH_LIMITED);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.equal(verdict.attribution, ATTRIBUTION.WORKLOAD);
    assert.equal(verdict.evidence.offeredBytesPerSecondDuringBacklog, 3_000_000);
    assert.equal(verdict.evidence.longestBacklogIntervals, 10);
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.FALSE);
  });

  it('a backlog below the measured ceiling is the link', () => {
    const runHealth = classifyRunHealth(healthyInput({evidence: healthyEvidence(
      (from, second) => (from === NODE_A && backlog(second) ?
        {bufferedAmount: 900_000, bytesSent: 200_000} : {}))}));
    const verdict = linkVerdict(runHealth, NODE_A, NODE_B, LINK_VERDICT.BANDWIDTH_LIMITED);
    assert.equal(verdict.attribution, ATTRIBUTION.INFRASTRUCTURE);
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.TRUE);
  });

  it('a backlog without a baseline is flagged with an undetermined cause', () => {
    const runHealth = classifyRunHealth(healthyInput({linkBaseline: null,
      evidence: healthyEvidence((from, second) => (from === NODE_A && backlog(second) ?
        {bufferedAmount: 900_000, bytesSent: 200_000} : {}))}));
    assert.equal(linkVerdict(runHealth, NODE_A, NODE_B,
      LINK_VERDICT.BANDWIDTH_LIMITED).attribution, ATTRIBUTION.UNDETERMINED);
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.UNKNOWN);
  });

  it('a backlog shorter than the delivery bound is clear', () => {
    const runHealth = classifyRunHealth(healthyInput({evidence: healthyEvidence(
      (from, second) => (from === NODE_A && second >= 40 && second < 43 ?
        {bufferedAmount: 900_000} : {}))}));
    assert.equal(linkVerdict(runHealth, NODE_A, NODE_B, LINK_VERDICT.BANDWIDTH_LIMITED).state,
      VERDICT_STATE.CLEAR);
  });

  it('flags a link silent for a delivery bound while both processes logged', () => {
    // 5.3 s without inbound from the peer; both nodes keep logging.
    const runHealth = classifyRunHealth(healthyInput({evidence: healthyEvidence(
      (from, second) => (from === NODE_A && second > 60 && second < 67 ? null : {}))}));
    const verdict = linkVerdict(runHealth, NODE_A, NODE_B, LINK_VERDICT.STALLED);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.equal(verdict.attribution, ATTRIBUTION.INFRASTRUCTURE);
    assert.equal(verdict.evidence.longestInboundSilenceMs, 6 * SECOND);
    assert.equal(verdict.evidence.localProcessLoggedDuringSilence, true);
    assert.equal(verdict.evidence.peerProcessLoggedDuringSilence, true);
    assert.equal(linkVerdict(runHealth, NODE_B, NODE_A, LINK_VERDICT.STALLED).state,
      VERDICT_STATE.CLEAR);
  });

  it('flags latency above the link floor by more than a baseline round trip', () => {
    const runHealth = classifyRunHealth(healthyInput({evidence: healthyEvidence(
      (from, second) => (from === NODE_B && second >= 70 && second < 80 ?
        {oneWayLatencyP50Ms: 60, oneWayLatencyMaxMs: 300} : {}))}));
    const verdict = linkVerdict(runHealth, NODE_B, NODE_A, LINK_VERDICT.LATENCY_DEGRADED);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.equal(verdict.attribution, ATTRIBUTION.INFRASTRUCTURE);
    assert.equal(verdict.evidence.floorP50Ms, 3);
    assert.equal(verdict.evidence.maxP50ExcessOverFloorMs, 57);
    assert.equal(linkVerdict(runHealth, NODE_A, NODE_B, LINK_VERDICT.LATENCY_DEGRADED).state,
      VERDICT_STATE.CLEAR);
  });

  it('a constant clock skew between hosts is not latency degradation', () => {
    const runHealth = classifyRunHealth(healthyInput({evidence: healthyEvidence(
      (from) => (from === NODE_B ? {oneWayLatencyP50Ms: 4000, oneWayLatencyMaxMs: 4004} : {}))}));
    assert.equal(linkVerdict(runHealth, NODE_B, NODE_A, LINK_VERDICT.LATENCY_DEGRADED).state,
      VERDICT_STATE.CLEAR);
  });

  it('flags an idle path that got slower between the two baselines', () => {
    const runHealth = classifyRunHealth(healthyInput({linkBaseline: linkBaseline(
      measuredPair(), measuredPair({roundTripMs: {samples: [40], p50: 40, max: 90}}))}));
    const verdict = linkVerdict(runHealth, NODE_A, NODE_B, LINK_VERDICT.LATENCY_DEGRADED);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.deepEqual(verdict.evidence.baselineRoundTrip,
      {preRunP50Ms: 5, preRunMaxMs: 8, postRunP50Ms: 40, degraded: true});
  });
});

describe('run health classifier: unavailable inputs are unknown, never clear', () => {
  it('an old run with CPU-only samples and no diagnostic lines is unknown', () => {
    const samples = arrayMap([...nodeSamples(NODE_A), ...nodeSamples(NODE_B)], (sample) => ({
      timestamp: sample.timestamp, nodeId: sample.nodeId, cpuPercent: sample.cpuPercent,
      containerMemoryWorkingSetBytes: 300, containerMemoryLimitBytes: 1000,
      rxBytes: 0, txBytes: 0,
      processDiagnosticsError: 'Process resource diagnostics unavailable (status=-1)',
    }));
    const runHealth = classifyRunHealth({samples, evidence: createRunHealthEvidence()});
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.UNKNOWN);
    assert.equal(nodeVerdict(runHealth, NODE_A, NODE_VERDICT.CPU_SATURATED).state,
      VERDICT_STATE.CLEAR);
    assert.equal(nodeVerdict(runHealth, NODE_A, NODE_VERDICT.LOSSY).reason,
      UNAVAILABLE_REASON.NO_HOST_FACTS);
    assert.equal(nodeVerdict(runHealth, NODE_A, NODE_VERDICT.EVENT_LOOP_DELAYED).reason,
      UNAVAILABLE_REASON.NO_NODE_LOG);
    for (const link of runHealth.links) {
      assert.equal(link.offeredLoad, null);
      assert.equal(link.baseline.reason, UNAVAILABLE_REASON.NO_LINK_BASELINE);
      for (const verdict of link.verdicts) assert.equal(verdict.state, VERDICT_STATE.UNKNOWN);
    }
    assert.equal(runHealth.nodes[0].collection.untypedProcessDiagnosticsErrors,
      samples.length / 2);
    assert.ok(arraySome(runHealth.reasons, (reason) =>
      includesOf(reason, 'bandwidth_limited: no_peer_traffic_lines_in_node_log')));
  });

  it('a typed unavailable host fact is the reason of the unknown verdict', () => {
    const noCounter = {state: HOST_FACT_STATE.UNAVAILABLE, reason: 'no_thermal_throttle_counter'};
    const runHealth = classifyRunHealth(healthyInput({samples: [
      ...nodeSamples(NODE_A, () => ({rates: {thermalCoreThrottleEvents: noCounter,
        thermalPackageThrottleEvents: noCounter}})),
      ...nodeSamples(NODE_B),
    ]}));
    const verdict = nodeVerdict(runHealth, NODE_A, NODE_VERDICT.THERMALLY_THROTTLED);
    assert.equal(verdict.state, VERDICT_STATE.UNKNOWN);
    assert.equal(verdict.reason, 'host_fact_unavailable:no_thermal_throttle_counter');
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.UNKNOWN);
  });

  it('no gap line in a curated log proves nothing; in a complete log it is clear', () => {
    const evidence = createRunHealthEvidence();
    ingestNodeLogLine(evidence, NODE_A, logLine(NODE_A, 1, 'Data directory configured'));
    const input = {samples: nodeSamples(NODE_A), evidence};
    assert.equal(nodeVerdict(classifyRunHealth(input), NODE_A,
      NODE_VERDICT.EVENT_LOOP_DELAYED).reason, UNAVAILABLE_REASON.NO_EVENT_LOOP_LINES);
    evidence.nodes.get(NODE_A).logIsComplete = true;
    assert.equal(nodeVerdict(classifyRunHealth(input), NODE_A,
      NODE_VERDICT.EVENT_LOOP_DELAYED).state, VERDICT_STATE.CLEAR);
  });

  it('a flagged infrastructure verdict wins over unknown inputs', () => {
    const runHealth = classifyRunHealth({evidence: createRunHealthEvidence(),
      samples: nodeSamples(NODE_A, (second) => (second === 10 ?
        {rates: {thermalCoreThrottleEvents: 1}} : {}))});
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.TRUE);
  });

  it('no inputs at all is unknown', () => {
    const runHealth = classifyRunHealth({samples: [], evidence: createRunHealthEvidence()});
    assert.equal(runHealth.infrastructureSuspect, INFRASTRUCTURE_SUSPECT.UNKNOWN);
    assert.deepEqual(runHealth.reasons, ['no inputs: no_resource_samples']);
  });
});

describe('run health evidence', () => {
  it('reads the lines of a run that predates the traffic diagnostics', () => {
    const evidence = createRunHealthEvidence();
    const prefix = '2026-11-11T05:16:58.185Z [' + NODE_A + '] info: ';
    ingestNodeLogLine(evidence, NODE_A, prefix + logLine(NODE_A, 100,
      NODE_LOG_MESSAGE.QUARANTINE_SKIPPED_PEER_ALIVE, {subsystem: 'message-router',
        targetNodeId: NODE_B, ackTimeoutStreak: 2, lastInboundAgoMs: 5325,
        livenessWindowMs: 30000}));
    ingestNodeLogLine(evidence, NODE_A, logLine(NODE_A, 101, 'Wait bound spent',
      {event: 'wait_bound_spent', wait: 'MESSAGE_TIMEOUT_MS (delivery ACK)', boundMs: 499,
        scope: {nodeId: NODE_A, targetNodeId: NODE_B}}));
    ingestNodeLogLine(evidence, NODE_A, logLine(NODE_A, 102, 'Replica handoff deferred',
      {targetNodeId: NODE_B, transportReasonCode: 'ROUTER_MESSAGE_TIMEOUT'}));
    ingestNodeLogLine(evidence, NODE_A,
      '{"level":"info","message":"Event loop gap watchdog started","thresholdMs":1000}');
    ingestNodeLogLine(evidence, NODE_A, 'not json at all ROUTER_MESSAGE_TIMEOUT');
    const peer = evidence.nodes.get(NODE_A).peers.get(NODE_B);
    assert.deepEqual(peer.slowNotDead,
      {count: 1, maxLastInboundAgoMs: 5325, atMs: START + 100 * SECOND});
    assert.deepEqual(peer.boundsSpentByWait, {'MESSAGE_TIMEOUT_MS (delivery ACK)': 1});
    assert.equal(peer.routerTimeoutMentions, 1);
    assert.equal(evidence.nodes.get(NODE_A).lines, 5);
    const runHealth = classifyRunHealth({samples: [], evidence});
    const verdict = linkVerdict(runHealth, NODE_A, NODE_B, LINK_VERDICT.STALLED);
    assert.equal(verdict.state, VERDICT_STATE.FLAGGED);
    assert.equal(verdict.attribution, ATTRIBUTION.UNDETERMINED);
    assert.equal(verdict.evidence.maxLastInboundAgoMs, 5325);
  });

  it('an inbound age below the bound, seen only at ACK timeouts, stays unknown', () => {
    const evidence = createRunHealthEvidence();
    ingestNodeLogLine(evidence, NODE_A, logLine(NODE_A, 100,
      NODE_LOG_MESSAGE.QUARANTINE_SKIPPED_PEER_ALIVE, {targetNodeId: NODE_B,
        lastInboundAgoMs: 109}));
    const verdict = linkVerdict(classifyRunHealth({samples: [], evidence}),
      NODE_A, NODE_B, LINK_VERDICT.STALLED);
    assert.equal(verdict.state, VERDICT_STATE.UNKNOWN);
    assert.equal(verdict.reason, UNAVAILABLE_REASON.ONLY_ACK_TIMEOUT_INSTANTS);
  });

  it('sums served queries per table and caller', () => {
    const evidence = createRunHealthEvidence();
    for (const caller of [NODE_B, NODE_B, 'cccc']) {
      ingestNodeLogLine(evidence, NODE_A, logLine(NODE_A, 5,
        NODE_LOG_MESSAGE.REMOTE_QUERY_SERVED, {tableName: 'replica_operations',
          operation: 'select', sourceNodeId: caller, queries: 2, rows: 100,
          responseBytes: 50_000, largestResponseBytes: 30_000, executionMs: 12,
          maxExecutionMs: 9, intervalMs: 1000}));
    }
    const runHealth = classifyRunHealth({samples: [], evidence});
    assert.deepEqual(runHealth.nodes[0].servedQueries, [{tableName: 'replica_operations',
      queries: 6, rows: 300, responseBytes: 150_000, largestResponseBytes: 30_000,
      executionMs: 36, maxExecutionMs: 9,
      bytesByCaller: {[NODE_B]: 100_000, cccc: 50_000}}]);
  });

  it('prefers a collected series over the same series in the log', () => {
    const evidence = healthyEvidence();
    ingestClusterHealth(evidence, {nodes: [
      {nodeId: NODE_A, state: 'collected', health: {response: COMPLETE_RESPONSE, collectors: {
        eventLoop: {state: 'measured', downsampled: [],
          raw: [{atMs: START, delayP50Ms: 1, delayP99Ms: 2, delayMaxMs: 1500,
            eventLoopUtilization: 0.9}]},
        process: {state: 'measured', downsampled: [], raw: [{atMs: START, maxTickGapMs: 10}]},
        peerTraffic: {state: 'measured', evictedKeys: 0, byKey: {[NODE_B]: {downsampled: [],
          raw: [{atMs: START, intervalMs: 1000, bytesSent: 7, bytesReceived: 7,
            bufferedAmount: 0, framesSent_raft: 3}]}}},
        servedQueries: {state: 'unavailable', reason: 'producer_has_recorded_nothing'},
      }}},
      {nodeId: NODE_B, state: 'unreachable', reason: 'no_answer_within_bound'},
    ]});
    const nodeA = evidence.nodes.get(NODE_A);
    assert.equal(nodeA.sources.eventLoopDelay, EVIDENCE_SOURCE.NODE_HEALTH);
    assert.equal(nodeA.eventLoopDelaySamples.length, 1);
    assert.equal(nodeA.peers.get(NODE_B).traffic.length, 1);
    assert.deepEqual(evidence.nodes.get(NODE_B).healthCollection,
      {state: 'unreachable', reason: 'no_answer_within_bound'});
    assert.equal(evidence.nodes.get(NODE_B).sources.eventLoopDelay, EVIDENCE_SOURCE.NODE_LOG);
    const runHealth = classifyRunHealth({samples: [], evidence});
    assert.equal(nodeVerdict(runHealth, NODE_A, NODE_VERDICT.EVENT_LOOP_DELAYED).state,
      VERDICT_STATE.FLAGGED);
    assert.deepEqual(arrayFind(runHealth.links, (link) => link.from === NODE_A)
      .offeredLoad.framesSentByClass, {raft: 3});
  });
});

describe('run health evidence from a bounded node health answer', () => {
  it('keeps the log series when the node withheld raw samples to stay in its bound', () => {
    const evidence = healthyEvidence();
    const logSamples = evidence.nodes.get(NODE_A).eventLoopDelaySamples.length;
    const response = {state: NODE_HEALTH_RESPONSE_STATE.RAW_WITHHELD, maxBytes: 2_097_152,
      withheldRawSamples: 4800};
    ingestClusterHealth(evidence, {nodes: [{nodeId: NODE_A, state: 'collected', health: {
      response,
      collectors: {eventLoop: {state: 'measured', raw: [], downsampled: [
        {startMs: START, samples: 6, sum: {delayMaxMs: 6}, max: {delayMaxMs: 1}}]}},
    }}]});
    const nodeA = evidence.nodes.get(NODE_A);
    assert.deepEqual(nodeA.healthCollection, {state: 'collected', response});
    assert.equal(nodeA.sources.eventLoopDelay, EVIDENCE_SOURCE.NODE_LOG,
      'an incomplete slice never replaces the log series with an empty one');
    assert.equal(nodeA.eventLoopDelaySamples.length, logSamples);
  });
});

describe('run health evidence from every collected series', () => {
  it('reads served queries, ACK timeouts and CDC timing from the node health', () => {
    const evidence = createRunHealthEvidence();
    ingestNodeLogLine(evidence, NODE_A, logLine(NODE_A, 3, NODE_LOG_MESSAGE.ACK_TIMEOUT_DETAIL,
      {targetNodeId: NODE_B, payloadBytes: 1}));
    ingestClusterHealth(evidence, {nodes: [{nodeId: NODE_A, state: 'collected', health: {
      response: COMPLETE_RESPONSE,
      collectors: {
        servedQueries: {state: 'measured', evictedKeys: 0, byKey: {replica_operations: {raw: [],
          downsampled: [
            {startMs: START, samples: 2, sum: {queries: 4, rows: 10, responseBytes: 900,
              executionMs: 7}, max: {largestResponseBytes: 600, maxExecutionMs: 5}},
            {startMs: START + 60_000, samples: 1, sum: {queries: 1, rows: 1, responseBytes: 100,
              executionMs: 1}, max: {largestResponseBytes: 100, maxExecutionMs: 1}}]}}},
        ackTimeouts: {state: 'measured', evicted: 0, events: [
          {atMs: START, targetNodeId: NODE_B, payloadBytes: 4096, bufferedAmountNow: 70_000}]},
        cdcWaves: {state: 'measured', downsampled: [], raw: [
          {atMs: START, waveMs: 40, sourceApplyMs: 3, failedTargets: 0},
          {atMs: START + 1, waveMs: 900, sourceApplyMs: 8, failedTargets: 2}]},
        cdcApplies: {state: 'measured', evictedKeys: 0, byKey: {services: {raw: [],
          downsampled: [{startMs: START, samples: 9, sum: {lagMs: 900}, max: {lagMs: 350}}]}}},
      }}}]});
    const runHealth = classifyRunHealth({samples: [], evidence});
    const node = arrayFind(runHealth.nodes, (entry) => entry.nodeId === NODE_A);
    assert.deepEqual(node.servedQueries, [{tableName: 'replica_operations', queries: 5,
      rows: 11, responseBytes: 1000, largestResponseBytes: 600, executionMs: 8,
      maxExecutionMs: 5, bytesByCaller: {}}]);
    assert.deepEqual(node.cdc, {
      waves: {rawWaves: 2, maxWaveMs: 900, maxSourceApplyMs: 8, failedTargets: 2},
      maxApplyLagMsByTable: {services: 350},
    });
    // The collected ACK timeouts replace the one read from the log.
    const link = arrayFind(runHealth.links,
      (entry) => entry.from === NODE_A && entry.to === NODE_B);
    assert.equal(link.deliverySymptoms.ackTimeoutDetails, 1);
    assert.equal(link.deliverySymptoms.largestTimedOutPayloadBytes, 4096);
    assert.equal(link.deliverySymptoms.maxBufferedAmountAtTimeoutBytes, 70_000);
  });
});

describe('run health thresholds and vocabulary', () => {
  it('every threshold has a value, a source and a justification, and judgments are few', () => {
    for (const entry of RUN_HEALTH_THRESHOLD_TABLE) {
      assert.ok(Number.isFinite(entry.value), entry.name);
      assert.ok(includesOf(Object.values(THRESHOLD_SOURCE), entry.source), entry.name);
      assert.ok(entry.justification.length > 40, entry.name);
      assert.equal(RUN_HEALTH_THRESHOLD[entry.name], entry.value);
    }
    assert.deepEqual(arrayMap(arrayFilter(RUN_HEALTH_THRESHOLD_TABLE,
      (entry) => entry.source === THRESHOLD_SOURCE.JUDGMENT),
    (entry) => entry.name),
    ['saturationRatio', 'hostCpuContentionRatio', 'tcpRetransmitRatio']);
    assert.equal(RUN_HEALTH_THRESHOLD.linkStallMs, 5000);
    assert.equal(RUN_HEALTH_THRESHOLD.sustainedWindowMs, 30000);
    assert.equal(RUN_HEALTH_THRESHOLD.linkBacklogSustainedIntervals, 5);
  });

  it('the restated node log messages still exist in their owner source', () => {
    for (const [message, source] of Object.entries(NODE_LOG_OWNER_SOURCE)) {
      assert.ok(includesOf(readFileSync(source, 'utf8'), `'${message}'`),
        `${source} no longer writes ${message}`);
    }
  });
});

describe('run health markdown', () => {
  it('summarizes the classification and goes directly under the bundle title', () => {
    const runHealth = classifyRunHealth(healthyInput({samples: [
      ...nodeSamples(NODE_A, (second) => (second >= 20 && second <= 60 ? {cpuPercent: 99} : {})),
      ...nodeSamples(NODE_B, (second) => (second === 30 ?
        {rates: {thermalCoreThrottleEvents: 4}} : {})),
    ]}));
    const markdown = renderRunHealthMarkdown(runHealth);
    assert.match(markdown, /^## Run Health\n/u);
    assert.match(markdown, /Infrastructure suspect: YES/u);
    assert.match(markdown, /FLAGGED thermally_throttled \[infrastructure\]/u);
    assert.match(markdown, /Workload \(not infrastructure\): node aaaaaaaa.* cpu_saturated/u);
    assert.match(markdown, /offered load: sent 20 KiB\/s mean/u);
    const bundle = insertRunHealthSummary('# Failure Bundle\n\n- Scenario: x\n', runHealth);
    assert.ok(stringStartsWith(bundle, '# Failure Bundle\n\n## Run Health\n'));
    assert.ok(stringEndsWith(bundle, '\n- Scenario: x\n'));
  });
});
