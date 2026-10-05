/**
 * The one QPM authority for automatic split/merge decisions.
 *
 * Traffic is measured over a full window (`trafficWindowMs`, default one
 * minute: the unit the thresholds are stated in) from the local leader's
 * CDC `eventsGenerated` counter. The rate is taken from the newest sample
 * that is at least one window old, so it does not depend on how often the
 * manager happens to ask (a re-sample microseconds after the previous one
 * reads the same windowed rate, not a zero delta).
 *
 * No data is not low load: until this node has observed a partition as its
 * local leader for one whole window, `queriesPerMinute` is null (no signal),
 * never 0. A leadership gap, a missing counter, or a counter regression
 * (service restart) restarts the observation window.
 */

import {CDC_PIPELINE_METRIC} from '../constants/index.js';
import {SPLIT_MERGE_DEFAULT} from './partition-constants.js';

const LOCAL_STR_FUNCTION = 'function';

const ONE_MINUTE_MS = 60 * 1000;
// Retained samples per partition: the window anchor plus at most this many
// newer samples (older-than-anchor samples are pruned on every call).
const MAX_TRAFFIC_SAMPLES_PER_PARTITION = 64;
// Partitions not sampled for this many windows are forgotten (dissolved
// split sources and merge sources never come back under the same id).
const STALE_SAMPLE_WINDOWS = 2;

const NO_TRAFFIC_SIGNAL = Object.freeze({
  queriesPerMinute: null,
  trafficObservedMs: 0,
});

function normalizePartitionSize(partition) {
  const sizeBytes = Number(partition?.size_bytes ?? partition?.sizeBytes ?? 0);
  return Number.isFinite(sizeBytes) ? sizeBytes : 0;
}

function findLocalLeaderPartitionService(partitionServices, partitionId) {
  if (!partitionServices ||
      !partitionId ||
      typeof partitionServices.values !== LOCAL_STR_FUNCTION) {
    return null;
  }

  for (const service of partitionServices.values()) {
    if (!service ||
        service.partitionId !== partitionId ||
        service.isLeader !== true ||
        typeof service.getSize !== LOCAL_STR_FUNCTION) {
      continue;
    }
    return service;
  }

  return null;
}

function normalizeCounterValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function resolveGeneratedWriteCount(partitionService) {
  if (!partitionService?.cdcPipelineMetrics ||
      typeof partitionService.cdcPipelineMetrics.getSnapshot !== LOCAL_STR_FUNCTION) {
    return null;
  }
  const snapshot = partitionService.cdcPipelineMetrics.getSnapshot();
  return normalizeCounterValue(
    snapshot?.[CDC_PIPELINE_METRIC.EVENTS_GENERATED],
  );
}

/**
 * Append one counter sample and prune everything older than the window
 * anchor (the newest sample at least one window old).
 * @param {Array<Object>} samples - Mutable sample list, oldest first.
 * @param {number} generatedWriteCount - Counter value now.
 * @param {number} nowMs - Sample time.
 * @param {number} windowMs - Measurement window.
 * @return {Array<Object>} The pruned list.
 */
function appendTrafficSample(samples, generatedWriteCount, nowMs, windowMs) {
  const last = samples[samples.length - 1];
  if (last && (generatedWriteCount < last.generatedWriteCount ||
      nowMs < last.sampledAtMs)) {
    samples.length = 0;
  }
  samples.push({sampledAtMs: nowMs, generatedWriteCount});
  let anchorIndex = 0;
  for (let index = 0; index < samples.length; index += 1) {
    if (samples[index].sampledAtMs <= nowMs - windowMs) {
      anchorIndex = index;
    }
  }
  if (anchorIndex > 0) {
    samples.splice(0, anchorIndex);
  }
  if (samples.length > MAX_TRAFFIC_SAMPLES_PER_PARTITION) {
    samples.splice(1, samples.length - MAX_TRAFFIC_SAMPLES_PER_PARTITION);
  }
  return samples;
}

/**
 * Observe one partition's counter and resolve its windowed traffic.
 * @param {Object} input - Observation input.
 * @return {{queriesPerMinute: number|null, trafficObservedMs: number}}
 */
function observeWindowedTraffic(input) {
  const {partitionId, generatedWriteCount, nowMs, windowMs, trafficSamples} =
    input;
  if (generatedWriteCount === null) {
    trafficSamples.delete(partitionId);
    return NO_TRAFFIC_SIGNAL;
  }
  const samples = appendTrafficSample(
    trafficSamples.get(partitionId) || [],
    generatedWriteCount,
    nowMs,
    windowMs,
  );
  trafficSamples.set(partitionId, samples);
  const anchor = samples[0];
  const trafficObservedMs = nowMs - anchor.sampledAtMs;
  if (trafficObservedMs < windowMs) {
    return {queriesPerMinute: null, trafficObservedMs};
  }
  const deltaWrites = generatedWriteCount - anchor.generatedWriteCount;
  return {
    queriesPerMinute: (deltaWrites * ONE_MINUTE_MS) / trafficObservedMs,
    trafficObservedMs,
  };
}

/**
 * Forget partitions not sampled for STALE_SAMPLE_WINDOWS windows.
 * @param {Map} trafficSamples - Samples by partition id.
 * @param {number} nowMs - Now.
 * @param {number} windowMs - Measurement window.
 */
function forgetStaleTrafficSamples(trafficSamples, nowMs, windowMs) {
  for (const [partitionId, samples] of trafficSamples) {
    const last = samples[samples.length - 1];
    if (!last || nowMs - last.sampledAtMs > windowMs * STALE_SAMPLE_WINDOWS) {
      trafficSamples.delete(partitionId);
    }
  }
}

function resolveTrafficWindowMs(value) {
  return Number.isFinite(value) && value > 0 ?
    value :
    SPLIT_MERGE_DEFAULT.TRAFFIC_WINDOW_MS;
}

function createManagedSplitMetricsProvider(options = {}) {
  const partitionServices = options.partitionServices || null;
  const nowFn = typeof options.now === 'function' ?
    options.now :
    () => Date.now();
  const windowMs = resolveTrafficWindowMs(options.trafficWindowMs);
  const trafficSamples = new Map();
  let lastStaleSweepAtMs = null;

  return (partitionId, partition) => {
    const normalizedPartitionId =
      partitionId || partition?.partition_id || partition?.partitionId || null;
    const nowMs = nowFn();
    if (lastStaleSweepAtMs === null || nowMs - lastStaleSweepAtMs >= windowMs) {
      lastStaleSweepAtMs = nowMs;
      forgetStaleTrafficSamples(trafficSamples, nowMs, windowMs);
    }
    const localLeaderService = findLocalLeaderPartitionService(
      partitionServices,
      normalizedPartitionId,
    );

    if (localLeaderService) {
      const liveSizeBytes = Number(localLeaderService.getSize());
      const traffic = observeWindowedTraffic({
        partitionId: normalizedPartitionId,
        generatedWriteCount: resolveGeneratedWriteCount(localLeaderService),
        nowMs,
        windowMs,
        trafficSamples,
      });
      return {
        sizeBytes: Number.isFinite(liveSizeBytes) ?
          liveSizeBytes :
          normalizePartitionSize(partition),
        ...traffic,
      };
    }

    // Not the local leader: this node observes no traffic for it, and a
    // later leadership starts a fresh window.
    trafficSamples.delete(normalizedPartitionId);
    return {
      sizeBytes: normalizePartitionSize(partition),
      ...NO_TRAFFIC_SIGNAL,
    };
  };
}

export {
  createManagedSplitMetricsProvider,
};
