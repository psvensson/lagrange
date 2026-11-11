/**
 * Run health: the per-node verdicts. Pure functions of one node's resource
 * samples and evidence; each returns a verdict record
 * {verdict, state, attribution, evidence, threshold, reason}.
 */

import {
  ATTRIBUTION,
  HOST_FACT_STATE,
  NODE_VERDICT,
  PERCENT,
  RUN_HEALTH_THRESHOLD,
  UNAVAILABLE_REASON,
  VERDICT_STATE,
} from './run-health-constants.js';
import {
  arrayFilter,
  arrayFind,
  arrayMap,
} from './captured-intrinsics.js';

const SHARE_DECIMALS = 4;

function round(value, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function flagged(verdict, attribution, evidence, threshold) {
  return {verdict, state: VERDICT_STATE.FLAGGED, attribution, evidence, threshold};
}

function clear(verdict, evidence, threshold) {
  return {verdict, state: VERDICT_STATE.CLEAR, attribution: null, evidence, threshold};
}

function unknown(verdict, reason, evidence = {}) {
  return {verdict, state: VERDICT_STATE.UNKNOWN, attribution: null, reason, evidence};
}

/**
 * The longest run of consecutive points that satisfy a predicate.
 * @param {Array<Object>} points - Ordered by `atMs`.
 * @param {Function} holds - (point) => boolean.
 * @return {{durationMs: number, startAtMs: number|null, points: number}}
 */
function longestStreak(points, holds) {
  let best = {durationMs: 0, startAtMs: null, points: 0};
  let current = null;
  for (const point of points) {
    if (!holds(point)) {
      current = null;
      continue;
    }
    current = current === null ?
      {startAtMs: point.atMs, endAtMs: point.atMs, points: 1} :
      {...current, endAtMs: point.atMs, points: current.points + 1};
    const durationMs = current.endAtMs - current.startAtMs;
    if (best.startAtMs === null || durationMs > best.durationMs) {
      best = {durationMs, startAtMs: current.startAtMs, points: current.points};
    }
  }
  return best;
}

function spanMs(points) {
  return points.length < 2 ? 0 : points[points.length - 1].atMs - points[0].atMs;
}

function measuredNumbers(samples, read) {
  return arrayFilter(arrayMap(samples,
    (sample) => ({atMs: sample.timestamp, value: read(sample)})),
  (point) => Number.isFinite(point.value));
}

function rateOf(sample, field) {
  return sample.rates?.state === HOST_FACT_STATE.MEASURED ? sample.rates[field] : undefined;
}

// Why a rate has no number in any sample: the typed reason the samples
// carry, or the reason there are no host facts at all.
function rateUnavailableReason(samples, field) {
  for (const sample of samples) {
    const value = rateOf(sample, field);
    if (value !== undefined && !Number.isFinite(value) && typeof value?.reason === 'string') {
      return `${UNAVAILABLE_REASON.HOST_FACT_UNAVAILABLE}:${value.reason}`;
    }
  }
  return UNAVAILABLE_REASON.NO_HOST_FACTS;
}

function sustainedThreshold(ratioName) {
  return {
    [ratioName]: RUN_HEALTH_THRESHOLD[ratioName],
    sustainedWindowMs: RUN_HEALTH_THRESHOLD.sustainedWindowMs,
  };
}

function cpuSaturated(samples, runStartAtMs) {
  const points = measuredNumbers(samples, (sample) => sample.cpuPercent);
  if (points.length === 0) {
    return unknown(NODE_VERDICT.CPU_SATURATED, UNAVAILABLE_REASON.NO_CONTAINER_CPU);
  }
  const limit = RUN_HEALTH_THRESHOLD.saturationRatio * PERCENT;
  const streak = longestStreak(points, (point) => point.value >= limit);
  const evidence = {
    samples: points.length,
    meanPercentOfOneCore: round(points.reduce((sum, p) => sum + p.value, 0) / points.length),
    shareOfSamplesAtOrAboveThreshold:
      round(arrayFilter(points, (p) => p.value >= limit).length / points.length, SHARE_DECIMALS),
    longestSaturatedMs: streak.durationMs,
    longestSaturatedStartsAtRunMs:
      streak.startAtMs === null ? null : streak.startAtMs - runStartAtMs,
  };
  const threshold = sustainedThreshold('saturationRatio');
  if (streak.durationMs >= RUN_HEALTH_THRESHOLD.sustainedWindowMs) {
    // Container CPU is the node's own consumption: machine steal and I/O
    // wait are not part of it. Whether the machine is too small for this
    // workload is a capacity question these samples cannot answer.
    return flagged(NODE_VERDICT.CPU_SATURATED, ATTRIBUTION.WORKLOAD, evidence, threshold);
  }
  return spanMs(points) < RUN_HEALTH_THRESHOLD.sustainedWindowMs ?
    unknown(NODE_VERDICT.CPU_SATURATED, UNAVAILABLE_REASON.WINDOW_NOT_COVERED, evidence) :
    clear(NODE_VERDICT.CPU_SATURATED, evidence, threshold);
}

function hostCpuContended(samples) {
  const points = arrayFilter(arrayMap(samples, (sample) => ({
    atMs: sample.timestamp,
    value: rateOf(sample, 'hostCpuStealShare') + rateOf(sample, 'hostCpuIowaitShare'),
  })), (point) => Number.isFinite(point.value));
  if (points.length === 0) {
    return unknown(NODE_VERDICT.HOST_CPU_CONTENDED,
      rateUnavailableReason(samples, 'hostCpuStealShare'));
  }
  const limit = RUN_HEALTH_THRESHOLD.hostCpuContentionRatio;
  const streak = longestStreak(points, (point) => point.value >= limit);
  const evidence = {
    readings: points.length,
    maxStealPlusIowaitShare:
      round(Math.max(...arrayMap(points, (p) => p.value)), SHARE_DECIMALS),
    longestContendedMs: streak.durationMs,
  };
  const threshold = sustainedThreshold('hostCpuContentionRatio');
  if (streak.durationMs >= RUN_HEALTH_THRESHOLD.sustainedWindowMs) {
    return flagged(NODE_VERDICT.HOST_CPU_CONTENDED, ATTRIBUTION.INFRASTRUCTURE,
      evidence, threshold);
  }
  return spanMs(points) < RUN_HEALTH_THRESHOLD.sustainedWindowMs ?
    unknown(NODE_VERDICT.HOST_CPU_CONTENDED, UNAVAILABLE_REASON.WINDOW_NOT_COVERED, evidence) :
    clear(NODE_VERDICT.HOST_CPU_CONTENDED, evidence, threshold);
}

// The largest value, or null for none (values are taken as measured).
function maxOrNull(values) {
  return values.length === 0 ? null : Math.max(...values);
}

function eventLoopDelayed(nodeEvidence, hostContended) {
  if (nodeEvidence === undefined) {
    return unknown(NODE_VERDICT.EVENT_LOOP_DELAYED, UNAVAILABLE_REASON.NO_NODE_LOG);
  }
  const limit = RUN_HEALTH_THRESHOLD.eventLoopDelayMs;
  const gaps = nodeEvidence.eventLoopGaps;
  const delays = nodeEvidence.eventLoopDelaySamples;
  const tickGaps = arrayFilter(arrayMap(nodeEvidence.processSamples,
    (sample) => sample.maxTickGapMs),
  (gap) => Number.isFinite(gap));
  const delayedSamples = arrayFilter(delays, (sample) => sample.delayMaxMs >= limit);
  const lateTicks = arrayFilter(tickGaps, (gap) => gap >= limit);
  const evidence = {
    gapEvents: gaps.length,
    maxGapMs: maxOrNull(arrayMap(gaps, (gap) => gap.gapMs)),
    totalGapMs: gaps.reduce((sum, gap) => sum + (gap.gapMs ?? 0), 0),
    delaySamples: delays.length,
    delaySamplesAtOrAboveThreshold: delayedSamples.length,
    maxDelayP99Ms: maxOrNull(arrayMap(delays, (sample) => sample.delayP99Ms)),
    maxDelayMs: maxOrNull(arrayMap(delays, (sample) => sample.delayMaxMs)),
    maxEventLoopUtilization:
      maxOrNull(arrayMap(delays, (sample) => sample.eventLoopUtilization)),
    maxDiagnosticsTickGapMs: maxOrNull(tickGaps),
    sources: nodeEvidence.sources,
  };
  const threshold = {eventLoopDelayMs: limit};
  if (gaps.length > 0 || delayedSamples.length > 0 || lateTicks.length > 0) {
    // A blocked loop is the process's own doing unless the machine took the
    // CPU away; without host facts the two cannot be told apart.
    const attribution = hostContended.state === VERDICT_STATE.FLAGGED ?
      ATTRIBUTION.INFRASTRUCTURE :
      (hostContended.state === VERDICT_STATE.CLEAR ?
        ATTRIBUTION.WORKLOAD : ATTRIBUTION.UNDETERMINED);
    return flagged(NODE_VERDICT.EVENT_LOOP_DELAYED, attribution, evidence, threshold);
  }
  // No gap line is a measured zero only in a complete log: the watchdog
  // writes one line per gap. A curated playback log proves nothing by
  // omission, and neither does a log without any delay sample.
  if (delays.length === 0 && tickGaps.length === 0 && nodeEvidence.logIsComplete !== true) {
    return unknown(NODE_VERDICT.EVENT_LOOP_DELAYED,
      nodeEvidence.lines === 0 ? UNAVAILABLE_REASON.NO_NODE_LOG :
        UNAVAILABLE_REASON.NO_EVENT_LOOP_LINES, evidence);
  }
  return clear(NODE_VERDICT.EVENT_LOOP_DELAYED, evidence, threshold);
}

function memoryPressure(samples) {
  const container = measuredNumbers(samples, (sample) =>
    (sample.containerMemoryLimitBytes > 0 ?
      sample.containerMemoryWorkingSetBytes / sample.containerMemoryLimitBytes : Number.NaN));
  const stall = measuredNumbers(samples, (sample) => (
    sample.host?.memoryPressure?.state === HOST_FACT_STATE.MEASURED ?
      sample.host.memoryPressure.fullAvg10Percent : Number.NaN));
  if (container.length === 0 && stall.length === 0) {
    return unknown(NODE_VERDICT.MEMORY_PRESSURE, UNAVAILABLE_REASON.NO_CONTAINER_MEMORY);
  }
  const maxContainerShare = container.length === 0 ? null :
    round(Math.max(...arrayMap(container, (p) => p.value)), SHARE_DECIMALS);
  const maxStallPercent = stall.length === 0 ? null :
    Math.max(...arrayMap(stall, (p) => p.value));
  const evidence = {
    maxWorkingSetShareOfContainerLimit: maxContainerShare,
    maxHostMemoryFullStallPercent: maxStallPercent,
    hostMemoryPressure: stall.length === 0 ?
      UNAVAILABLE_REASON.NO_HOST_FACTS : HOST_FACT_STATE.MEASURED,
  };
  const threshold = {
    saturationRatio: RUN_HEALTH_THRESHOLD.saturationRatio,
    pressureStallPercent: RUN_HEALTH_THRESHOLD.pressureStallPercent,
  };
  if (maxStallPercent !== null && maxStallPercent > RUN_HEALTH_THRESHOLD.pressureStallPercent) {
    return flagged(NODE_VERDICT.MEMORY_PRESSURE, ATTRIBUTION.INFRASTRUCTURE,
      evidence, threshold);
  }
  if (maxContainerShare !== null &&
      maxContainerShare >= RUN_HEALTH_THRESHOLD.saturationRatio) {
    // The node's own working set against the limit the run configured.
    return flagged(NODE_VERDICT.MEMORY_PRESSURE, ATTRIBUTION.WORKLOAD, evidence, threshold);
  }
  // The container share is clear; the machine side is only clear if measured.
  return stall.length === 0 ?
    unknown(NODE_VERDICT.MEMORY_PRESSURE, UNAVAILABLE_REASON.NO_HOST_FACTS, evidence) :
    clear(NODE_VERDICT.MEMORY_PRESSURE, evidence, threshold);
}

function sumRate(samples, field) {
  const values = arrayFilter(arrayMap(samples,
    (sample) => rateOf(sample, field)),
  (value) => Number.isFinite(value));
  return {readings: values.length, total: values.reduce((sum, value) => sum + value, 0)};
}

function thermallyThrottled(samples) {
  const core = sumRate(samples, 'thermalCoreThrottleEvents');
  const packageEvents = sumRate(samples, 'thermalPackageThrottleEvents');
  if (core.readings === 0 && packageEvents.readings === 0) {
    return unknown(NODE_VERDICT.THERMALLY_THROTTLED,
      rateUnavailableReason(samples, 'thermalCoreThrottleEvents'));
  }
  const evidence = {
    coreThrottleEvents: core.total,
    packageThrottleEvents: packageEvents.total,
    readings: Math.max(core.readings, packageEvents.readings),
  };
  const threshold = {thermalThrottleEvents: RUN_HEALTH_THRESHOLD.thermalThrottleEvents};
  return core.total + packageEvents.total >= RUN_HEALTH_THRESHOLD.thermalThrottleEvents ?
    flagged(NODE_VERDICT.THERMALLY_THROTTLED, ATTRIBUTION.INFRASTRUCTURE,
      evidence, threshold) :
    clear(NODE_VERDICT.THERMALLY_THROTTLED, evidence, threshold);
}

function lossy(samples, baselineRetransmitRatio) {
  const retransmitted = sumRate(samples, 'tcpRetransmittedSegments');
  const sent = sumRate(samples, 'tcpOutSegments');
  if (retransmitted.readings === 0 || sent.readings === 0) {
    return unknown(NODE_VERDICT.LOSSY,
      rateUnavailableReason(samples, 'tcpRetransmittedSegments'));
  }
  const ratio = sent.total > 0 ? retransmitted.total / sent.total : 0;
  const evidence = {
    scope: 'every TCP connection of the node\'s host network namespace',
    retransmittedSegments: retransmitted.total,
    sentSegments: sent.total,
    retransmitRatio: round(ratio, SHARE_DECIMALS),
    linkBaselineRetransmitRatio: baselineRetransmitRatio,
  };
  const threshold = {tcpRetransmitRatio: RUN_HEALTH_THRESHOLD.tcpRetransmitRatio};
  const aboveBaseline = baselineRetransmitRatio === null || ratio > baselineRetransmitRatio;
  return ratio >= RUN_HEALTH_THRESHOLD.tcpRetransmitRatio && aboveBaseline ?
    flagged(NODE_VERDICT.LOSSY, ATTRIBUTION.INFRASTRUCTURE, evidence, threshold) :
    clear(NODE_VERDICT.LOSSY, evidence, threshold);
}

// What the collection itself could not read for this node, by typed reason.
function collectionGaps(samples) {
  const count = (read) => {
    const reasons = {};
    for (const sample of samples) {
      const reason = read(sample);
      if (typeof reason === 'string') reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    return reasons;
  };
  return {
    samples: samples.length,
    containerNetworkUnavailable:
      count((sample) => sample.containerNetworkUnavailable?.reason),
    processDiagnosticsUnavailable:
      count((sample) => sample.processDiagnosticsUnavailable?.reason),
    // Samples written before the typed reasons existed.
    untypedProcessDiagnosticsErrors: arrayFilter(samples, (sample) =>
      typeof sample.processDiagnosticsError === 'string' &&
      sample.processDiagnosticsUnavailable === undefined).length,
    hostFactsMissing: arrayFilter(samples, (sample) => sample.host === undefined).length,
  };
}

/**
 * Every node verdict of one node.
 * @param {Object} input - {nodeId, samples, nodeEvidence, runStartAtMs,
 *   baselineRetransmitRatio}.
 * @return {Object} {nodeId, address, verdicts, collection}.
 */
function classifyNode({nodeId, samples, nodeEvidence, runStartAtMs,
  baselineRetransmitRatio = null}) {
  const contended = hostCpuContended(samples);
  const address = arrayFind(arrayMap(samples,
    (sample) => sample.nodeAddress),
  (value) => typeof value === 'string');
  return {
    nodeId,
    address: address === undefined ? null : address,
    verdicts: [
      cpuSaturated(samples, runStartAtMs),
      contended,
      eventLoopDelayed(nodeEvidence, contended),
      memoryPressure(samples),
      thermallyThrottled(samples),
      lossy(samples, baselineRetransmitRatio),
    ],
    collection: collectionGaps(samples),
  };
}

export {classifyNode, clear, flagged, unknown};
