/**
 * Run health: the per-link verdicts and the offered load of each link.
 *
 * A link is one direction between two nodes, described by what the local
 * node recorded about its peer. Every verdict is reported next to the load
 * the product offered on that link, because the two questions are different:
 * "the link is slow" (infrastructure) and "the product sent too much"
 * (workload). A backlog on a link that carried at least its measured idle
 * ceiling is workload; a backlog below that ceiling is the link.
 */

import {
  ATTRIBUTION,
  LINK_VERDICT,
  PEER_TRAFFIC_INTERVAL_MS,
  RUN_HEALTH_THRESHOLD,
  UNAVAILABLE_REASON,
  VERDICT_STATE,
} from './run-health-constants.js';
import {clear, flagged, unknown} from './run-health-node-verdicts.js';
import {
  arrayFilter,
  arrayMap,
  includesOf,
  stringStartsWith,
} from './captured-intrinsics.js';

const MS_PER_SECOND = 1000;
const FRAMES_SENT = 'framesSent';
const FRAMES_RECEIVED = 'framesReceived';
// Two traffic lines belong to one run of consecutive intervals when they
// are at most this far apart (one interval of slack for a late tick).
const CONSECUTIVE_LINE_GAP_MS = 2 * PEER_TRAFFIC_INTERVAL_MS;

function finite(values) {
  return arrayFilter(values, (value) => Number.isFinite(value));
}

function maxOf(values) {
  const numbers = finite(values);
  return numbers.length === 0 ? null : Math.max(...numbers);
}

// Frame counts by class of one traffic sample: a nested object in a log
// line, flattened `framesSent_<class>` fields in a health buffer sample.
function frameCounts(sample, field) {
  if (sample[field] !== null && typeof sample[field] === 'object') return sample[field];
  const prefix = `${field}_`;
  return Object.fromEntries(arrayMap(arrayFilter(Object.entries(sample),
    ([key]) => stringStartsWith(key, prefix)),
  ([key, count]) => [key.slice(prefix.length), count]));
}

function sumFrameCounts(traffic, field) {
  const totals = {};
  for (const sample of traffic) {
    for (const [frameClass, count] of Object.entries(frameCounts(sample, field))) {
      totals[frameClass] = (totals[frameClass] ?? 0) + count;
    }
  }
  return totals;
}

/**
 * What the product offered on one direction of a link.
 * @param {Array<Object>} traffic - The local node's peer-traffic samples.
 * @return {Object|null} Null without traffic samples.
 */
function offeredLoad(traffic) {
  if (traffic.length === 0) return null;
  const observedMs = traffic.reduce((sum, sample) => sum + (sample.intervalMs ?? 0), 0);
  const perSecond = (bytes) => (observedMs > 0 ?
    Math.round(bytes / (observedMs / MS_PER_SECOND)) : null);
  const rate = (sample, field) => (sample.intervalMs > 0 ?
    sample[field] / (sample.intervalMs / MS_PER_SECOND) : Number.NaN);
  const bytesSent = traffic.reduce((sum, sample) => sum + (sample.bytesSent ?? 0), 0);
  const bytesReceived = traffic.reduce((sum, sample) => sum + (sample.bytesReceived ?? 0), 0);
  return {
    activeIntervals: traffic.length,
    observedMs,
    bytesSent,
    bytesReceived,
    meanBytesSentPerSecond: perSecond(bytesSent),
    meanBytesReceivedPerSecond: perSecond(bytesReceived),
    peakBytesSentPerSecond: maxOf(arrayMap(traffic, (sample) => rate(sample, 'bytesSent'))),
    peakBytesReceivedPerSecond: maxOf(arrayMap(traffic, (sample) => rate(sample, 'bytesReceived'))),
    framesSentByClass: sumFrameCounts(traffic, FRAMES_SENT),
    framesReceivedByClass: sumFrameCounts(traffic, FRAMES_RECEIVED),
    largestFrameSentBytes: maxOf(arrayMap(traffic, (sample) => sample.largestFrameSentBytes)),
    largestFrameReceivedBytes: maxOf(arrayMap(traffic,
      (sample) => sample.largestFrameReceivedBytes)),
    maxBufferedAmountBytes: maxOf(arrayMap(traffic, (sample) => sample.bufferedAmount)),
    maxQueuePending: maxOf(arrayMap(traffic, (sample) => sample.queuePending)),
  };
}

// Runs of consecutive traffic samples that satisfy a predicate.
function consecutiveRuns(traffic, holds) {
  const runs = [];
  let current = null;
  for (const sample of traffic) {
    const continues = current !== null &&
      sample.atMs - current[current.length - 1].atMs <= CONSECUTIVE_LINE_GAP_MS;
    if (!holds(sample)) {
      current = null;
    } else if (continues) {
      current.push(sample);
    } else {
      current = [sample];
      runs.push(current);
    }
  }
  return runs;
}

function longestRun(runs) {
  return runs.reduce((best, run) => (run.length > best.length ? run : best), []);
}

function ceilingAttribution(offeredBytesPerSecond, ceilings) {
  if (ceilings.length === 0 || !Number.isFinite(offeredBytesPerSecond)) {
    return ATTRIBUTION.UNDETERMINED;
  }
  const multiple = RUN_HEALTH_THRESHOLD.baselineCeilingMultiple;
  if (offeredBytesPerSecond >= Math.max(...ceilings) * multiple) return ATTRIBUTION.WORKLOAD;
  if (offeredBytesPerSecond < Math.min(...ceilings) * multiple) {
    return ATTRIBUTION.INFRASTRUCTURE;
  }
  return ATTRIBUTION.UNDETERMINED;
}

function bandwidthLimited(traffic, baseline) {
  if (traffic.length === 0) {
    return unknown(LINK_VERDICT.BANDWIDTH_LIMITED, UNAVAILABLE_REASON.NO_PEER_TRAFFIC_LINES);
  }
  const needed = RUN_HEALTH_THRESHOLD.linkBacklogSustainedIntervals;
  const backlog = longestRun(consecutiveRuns(traffic, (sample) => sample.bufferedAmount > 0));
  const ceilings = baseline === null ? [] : baseline.throughputBytesPerSecond;
  const evidence = {
    longestBacklogIntervals: backlog.length,
    maxBufferedAmountBytes: maxOf(arrayMap(traffic, (sample) => sample.bufferedAmount)),
    baselineThroughputBytesPerSecond: ceilings,
  };
  const threshold = {
    linkBacklogSustainedIntervals: needed,
    baselineCeilingMultiple: RUN_HEALTH_THRESHOLD.baselineCeilingMultiple,
  };
  if (backlog.length < needed) {
    return clear(LINK_VERDICT.BANDWIDTH_LIMITED, evidence, threshold);
  }
  const observedMs = backlog.reduce((sum, sample) => sum + sample.intervalMs, 0);
  const offered = backlog.reduce((sum, sample) => sum + sample.bytesSent, 0) /
    (observedMs / MS_PER_SECOND);
  return flagged(LINK_VERDICT.BANDWIDTH_LIMITED, ceilingAttribution(offered, ceilings), {
    ...evidence,
    backlogStartsAtMs: backlog[0].atMs,
    offeredBytesPerSecondDuringBacklog: Math.round(offered),
  }, threshold);
}

function latencyDegraded(traffic, baseline, endpointLoopDelayed) {
  const timed = arrayFilter(traffic, (sample) => Number.isFinite(sample.oneWayLatencyP50Ms));
  if (baseline !== null && baseline.roundTripDegraded !== null &&
      baseline.roundTripDegraded.degraded) {
    // The idle path itself got slower between the pre- and post-run probes.
    return flagged(LINK_VERDICT.LATENCY_DEGRADED, ATTRIBUTION.INFRASTRUCTURE,
      {baselineRoundTrip: baseline.roundTripDegraded},
      {latencyExcessBaselineRttMultiple: RUN_HEALTH_THRESHOLD.latencyExcessBaselineRttMultiple});
  }
  if (timed.length === 0) {
    return unknown(LINK_VERDICT.LATENCY_DEGRADED, traffic.length === 0 ?
      UNAVAILABLE_REASON.NO_PEER_TRAFFIC_LINES : UNAVAILABLE_REASON.NO_LATENCY_SAMPLES);
  }
  // One-way latency includes the clock skew between the two hosts, so it is
  // read against this link's own floor in this run, never as an absolute.
  const floor = Math.min(...arrayMap(timed, (sample) => sample.oneWayLatencyP50Ms));
  const excess = (sample) => sample.oneWayLatencyP50Ms - floor;
  const evidence = {
    latencySamples: timed.length,
    floorP50Ms: floor,
    maxP50ExcessOverFloorMs: Math.max(...arrayMap(timed, excess)),
    maxOneWayLatencyMs: maxOf(arrayMap(timed, (sample) => sample.oneWayLatencyMaxMs)),
    baselineRoundTripMaxMs: baseline === null ? null : baseline.roundTripMaxMs,
  };
  if (baseline === null || !Number.isFinite(baseline.roundTripMaxMs)) {
    return unknown(LINK_VERDICT.LATENCY_DEGRADED,
      UNAVAILABLE_REASON.NO_LINK_BASELINE, evidence);
  }
  const limit = baseline.roundTripMaxMs *
    RUN_HEALTH_THRESHOLD.latencyExcessBaselineRttMultiple;
  const degraded = longestRun(consecutiveRuns(timed, (sample) => excess(sample) > limit));
  const threshold = {
    latencyExcessBaselineRttMultiple: RUN_HEALTH_THRESHOLD.latencyExcessBaselineRttMultiple,
    linkBacklogSustainedIntervals: RUN_HEALTH_THRESHOLD.linkBacklogSustainedIntervals,
  };
  if (degraded.length < RUN_HEALTH_THRESHOLD.linkBacklogSustainedIntervals) {
    return clear(LINK_VERDICT.LATENCY_DEGRADED,
      {...evidence, longestDegradedIntervals: degraded.length}, threshold);
  }
  // A late ACK is processing delay when either end's event loop was
  // delayed; otherwise the time was spent on the path.
  return flagged(LINK_VERDICT.LATENCY_DEGRADED,
    endpointLoopDelayed ? ATTRIBUTION.WORKLOAD : ATTRIBUTION.INFRASTRUCTURE,
    {...evidence, longestDegradedIntervals: degraded.length,
      degradedStartsAtMs: degraded[0].atMs, eitherEndEventLoopDelayed: endpointLoopDelayed},
    threshold);
}

// Whether a node logged anything strictly inside a span: the process was
// alive and running its loop while the link was silent.
function loggedInside(nodeEvidence, startMs, endMs) {
  if (nodeEvidence === undefined) return null;
  for (let second = Math.floor(startMs / MS_PER_SECOND) + 1;
    second < Math.floor(endMs / MS_PER_SECOND); second += 1) {
    if (nodeEvidence.loggedSeconds.has(second)) return true;
  }
  return false;
}

function longestInboundSilence(traffic) {
  const inbound = arrayFilter(traffic, (sample) => sample.bytesReceived > 0);
  let longest = {silenceMs: 0, startMs: null, endMs: null};
  for (let index = 1; index < inbound.length; index += 1) {
    const silenceMs = inbound[index].atMs - inbound[index - 1].atMs -
      (inbound[index].intervalMs ?? 0);
    if (silenceMs > longest.silenceMs) {
      longest = {silenceMs, startMs: inbound[index - 1].atMs, endMs: inbound[index].atMs};
    }
  }
  return longest;
}

function stalled(peerEvidence, localEvidence, remoteEvidence) {
  const limit = RUN_HEALTH_THRESHOLD.linkStallMs;
  const threshold = {linkStallMs: limit};
  const traffic = peerEvidence.traffic;
  if (traffic.length > 0) {
    const silence = longestInboundSilence(traffic);
    const evidence = {
      longestInboundSilenceMs: silence.silenceMs,
      silenceStartsAtMs: silence.startMs,
      localProcessLoggedDuringSilence: silence.startMs === null ? null :
        loggedInside(localEvidence, silence.startMs, silence.endMs),
      peerProcessLoggedDuringSilence: silence.startMs === null ? null :
        loggedInside(remoteEvidence, silence.startMs, silence.endMs),
    };
    if (silence.silenceMs < limit) return clear(LINK_VERDICT.STALLED, evidence, threshold);
    // Silent while both processes kept logging: the processes were alive,
    // so the silence was on the path. If either was not logging, its own
    // loop may have been blocked and the cause is undetermined.
    const bothAlive = evidence.localProcessLoggedDuringSilence === true &&
      evidence.peerProcessLoggedDuringSilence === true;
    return flagged(LINK_VERDICT.STALLED,
      bothAlive ? ATTRIBUTION.INFRASTRUCTURE : ATTRIBUTION.UNDETERMINED, evidence, threshold);
  }
  const slow = peerEvidence.slowNotDead;
  const evidence = {
    slowNotDeadDecisions: slow.count,
    maxLastInboundAgoMs: slow.maxLastInboundAgoMs,
    observedAtMs: slow.atMs,
  };
  if (Number.isFinite(slow.maxLastInboundAgoMs) && slow.maxLastInboundAgoMs >= limit) {
    return flagged(LINK_VERDICT.STALLED, ATTRIBUTION.UNDETERMINED, evidence, threshold);
  }
  // Inbound age is only written when an ACK timeout streak reaches the
  // quarantine decision; a silence between those instants was not observed.
  return unknown(LINK_VERDICT.STALLED, slow.count > 0 ?
    UNAVAILABLE_REASON.ONLY_ACK_TIMEOUT_INSTANTS :
    UNAVAILABLE_REASON.NO_PEER_TRAFFIC_LINES, evidence);
}

function linkLossy(localLossy, remoteLossy) {
  const ends = {local: localLossy, peer: remoteLossy};
  const evidence = Object.fromEntries(arrayMap(Object.entries(ends), ([end, verdict]) =>
    [end, verdict === undefined ? {state: VERDICT_STATE.UNKNOWN} :
      {state: verdict.state, reason: verdict.reason, ...verdict.evidence}]));
  const states = arrayMap(Object.values(ends), (verdict) =>
    (verdict === undefined ? VERDICT_STATE.UNKNOWN : verdict.state));
  if (includesOf(states, VERDICT_STATE.FLAGGED)) {
    return flagged(LINK_VERDICT.LOSSY, ATTRIBUTION.INFRASTRUCTURE, evidence,
      {tcpRetransmitRatio: RUN_HEALTH_THRESHOLD.tcpRetransmitRatio});
  }
  return includesOf(states, VERDICT_STATE.UNKNOWN) ?
    unknown(LINK_VERDICT.LOSSY, UNAVAILABLE_REASON.NO_HOST_FACTS, evidence) :
    clear(LINK_VERDICT.LOSSY, evidence,
      {tcpRetransmitRatio: RUN_HEALTH_THRESHOLD.tcpRetransmitRatio});
}

function deliverySymptoms(peerEvidence) {
  const details = peerEvidence.ackTimeoutDetails;
  return {
    ackTimeoutDetails: details.length,
    largestTimedOutPayloadBytes: maxOf(arrayMap(details, (detail) => detail.payloadBytes)),
    maxBufferedAmountAtTimeoutBytes: maxOf(arrayMap(details, (detail) => detail.bufferedAmountNow)),
    routerTimeoutMentions: peerEvidence.routerTimeoutMentions,
    boundsSpentByWait: peerEvidence.boundsSpentByWait,
    slowNotDeadDecisions: peerEvidence.slowNotDead.count,
  };
}

/**
 * Every link verdict of one direction.
 * @param {Object} input - {from, to, peerEvidence, localEvidence,
 *   remoteEvidence, baseline, localLossy, remoteLossy, endpointLoopDelayed}.
 * @return {Object} {from, to, verdicts, offeredLoad, deliverySymptoms}.
 */
function classifyLink({from, to, peerEvidence, localEvidence, remoteEvidence,
  baseline, baselineUnavailableReason, localLossy, remoteLossy, endpointLoopDelayed}) {
  return {
    from,
    to,
    baseline: baseline === null ?
      {state: VERDICT_STATE.UNKNOWN, reason: baselineUnavailableReason} : baseline,
    offeredLoad: offeredLoad(peerEvidence.traffic),
    deliverySymptoms: deliverySymptoms(peerEvidence),
    verdicts: [
      bandwidthLimited(peerEvidence.traffic, baseline),
      latencyDegraded(peerEvidence.traffic, baseline, endpointLoopDelayed),
      linkLossy(localLossy, remoteLossy),
      stalled(peerEvidence, localEvidence, remoteEvidence),
    ],
  };
}

export {classifyLink};
