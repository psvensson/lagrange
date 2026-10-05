/**
 * The one QPM authority for automatic split/merge decisions.
 *
 * Semantics: `queriesPerMinute` is the average write rate (the local
 * leader's CDC `eventsGenerated` counter) over the most recent span of AT
 * LEAST one traffic window during which this node continuously led the
 * partition: one leadership term, one counter instance, no counter
 * regression. The span runs from the anchor (the newest retained sample at
 * least one window old) to the reading itself, and is reported as
 * `trafficObservedMs`. Until such a span exists the QPM is null (no
 * signal), never 0.
 *
 * Sampling is decoupled from how often anyone asks. The provider keeps,
 * per led partition, a bounded ring of (time, counter) samples stored on
 * its OWN fixed cadence (window / TRAFFIC_SAMPLES_PER_WINDOW): a call
 * stores a sample only when the newest stored one is at least one cadence
 * step old, so extra calls never add samples (dense calls cannot evict the
 * anchor), and every call still reads the counter at its own time. With
 * dense calls the span exceeds the window by less than one cadence step
 * plus one call gap; with sparse calls (a node whose partitions take no
 * writes evaluates only on the periodic timer) the span is the time since
 * the previous call, so samples are retained for max(2 windows, evaluation
 * interval + window) - a periodic-only partition has a signal from its
 * second periodic evaluation on. A longer span is an average over more
 * than one window: for a merge that is still "at or below the threshold on
 * average over at least one window"; for a split it can only delay a
 * split on a recent burst (conservative).
 *
 * The sampling is lazily driven (no timer of its own): a partition nobody
 * asks about needs no measurement, and a per-partition or node-level tick
 * would add timer load for an answer the next call produces exactly.
 */

import {CDC_PIPELINE_METRIC} from '../constants/index.js';
import {resolveTrafficMeasurement} from './partition-split-merge-policy.js';

const LOCAL_STR_FUNCTION = 'function';

const ONE_MINUTE_MS = 60 * 1000;
// Stored samples per window: the provider's own sampling cadence is
// window / TRAFFIC_SAMPLES_PER_WINDOW (5 s for the default 60 s window).
const TRAFFIC_SAMPLES_PER_WINDOW = 12;
// The ring never holds more than the anchor plus the samples newer than
// one window, which the cadence spaces at least one step apart.
const TRAFFIC_SAMPLE_CAPACITY = TRAFFIC_SAMPLES_PER_WINDOW + 1;
// Retention is never below this many windows.
const MINIMUM_RETENTION_WINDOWS = 2;

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

/**
 * Read the leader's counter and the continuity it belongs to: the counter
 * instance and the consensus core's leadership term. A different instance
 * (service restart) or term (leadership lost and regained between two
 * calls) is a new span even when the counter did not regress.
 * @param {Object} partitionService - Local leader partition service.
 * @return {{count: number|null, counterSource: Object|null,
 *   term: number|null}}
 */
function readLeaderCounter(partitionService) {
  const counterSource = partitionService?.cdcPipelineMetrics || null;
  if (!counterSource ||
      typeof counterSource.getSnapshot !== LOCAL_STR_FUNCTION) {
    return {count: null, counterSource: null, term: null};
  }
  const snapshot = counterSource.getSnapshot();
  const raft = partitionService.raft;
  const status = typeof raft?.readStatus === LOCAL_STR_FUNCTION ?
    raft.readStatus() :
    null;
  const term = Number(status?.term);
  return {
    count: normalizeCounterValue(
      snapshot?.[CDC_PIPELINE_METRIC.EVENTS_GENERATED],
    ),
    counterSource,
    term: Number.isFinite(term) ? term : null,
  };
}

/**
 * Whether a reading continues the record's span.
 * @param {Object} record - {counterSource, term, samples}.
 * @param {Object} reading - {nowMs, count, counterSource, term}.
 * @return {boolean}
 */
function continuesSpan(record, reading) {
  const newest = record.samples[record.samples.length - 1];
  return record.counterSource === reading.counterSource &&
    record.term === reading.term &&
    (!newest || (reading.count >= newest.count &&
      reading.nowMs >= newest.atMs));
}

/**
 * Observe one reading: restart the span on a continuity break, drop every
 * sample older than the anchor, store the reading only on the cadence, and
 * resolve the rate over [anchor, now].
 * @param {Object} record - Mutable {counterSource, term, samples}.
 * @param {Object} reading - {nowMs, count, counterSource, term}.
 * @param {Object} plan - Sampling plan {windowMs, cadenceMs}.
 * @return {{queriesPerMinute: number|null, trafficObservedMs: number}}
 */
function observeTraffic(record, reading, plan) {
  if (!continuesSpan(record, reading)) {
    record.counterSource = reading.counterSource;
    record.term = reading.term;
    record.samples = [];
  }
  const samples = record.samples;
  const anchorHorizonMs = reading.nowMs - plan.windowMs;
  let anchorIndex = -1;
  while (anchorIndex + 1 < samples.length &&
      samples[anchorIndex + 1].atMs <= anchorHorizonMs) {
    anchorIndex += 1;
  }
  if (anchorIndex > 0) {
    samples.splice(0, anchorIndex);
  }
  const newest = samples[samples.length - 1];
  if (!newest || reading.nowMs - newest.atMs >= plan.cadenceMs) {
    samples.push({atMs: reading.nowMs, count: reading.count});
  }
  if (anchorIndex < 0) {
    return {
      queriesPerMinute: null,
      trafficObservedMs: reading.nowMs - samples[0].atMs,
    };
  }
  const anchor = samples[0];
  const spanMs = reading.nowMs - anchor.atMs;
  return {
    queriesPerMinute: ((reading.count - anchor.count) * ONE_MINUTE_MS) /
      spanMs,
    trafficObservedMs: spanMs,
  };
}

/**
 * Forget partitions whose newest stored sample is older than the
 * retention horizon (dissolved split and merge sources, partitions this
 * node no longer leads and is no longer asked about).
 * @param {Map} records - Records by partition id.
 * @param {number} nowMs - Now.
 * @param {number} retentionMs - Retention horizon.
 */
function forgetStaleTrafficRecords(records, nowMs, retentionMs) {
  for (const [partitionId, record] of records) {
    const newest = record.samples[record.samples.length - 1];
    if (!newest || nowMs - newest.atMs > retentionMs) {
      records.delete(partitionId);
    }
  }
}

/**
 * Resolve the provider's sampling plan from the shared measurement
 * resolver (the same one the manager uses).
 * @param {Object} options - Provider options.
 * @return {Object} {windowMs, cadenceMs, retentionMs, evaluationIntervalMs}.
 */
function resolveSamplingPlan(options) {
  const {trafficWindowMs, evaluationIntervalMs} = resolveTrafficMeasurement({
    trafficWindowMs: options.trafficWindowMs,
    evaluationIntervalMs: options.evaluationIntervalMs,
  });
  return {
    windowMs: trafficWindowMs,
    cadenceMs: trafficWindowMs / TRAFFIC_SAMPLES_PER_WINDOW,
    retentionMs: Math.max(
      MINIMUM_RETENTION_WINDOWS * trafficWindowMs,
      evaluationIntervalMs + trafficWindowMs,
    ),
    evaluationIntervalMs,
  };
}

/**
 * Describe the retained measurement state (diagnostics).
 * @param {Map} records - Records by partition id.
 * @param {Object} plan - Sampling plan.
 * @return {Object}
 */
function describeTrafficRecords(records, plan) {
  let maxSamplesPerPartition = 0;
  for (const record of records.values()) {
    maxSamplesPerPartition = Math.max(maxSamplesPerPartition,
      record.samples.length);
  }
  return {
    partitionCount: records.size,
    maxSamplesPerPartition,
    sampleCapacity: TRAFFIC_SAMPLE_CAPACITY,
    trafficWindowMs: plan.windowMs,
    cadenceMs: plan.cadenceMs,
    retentionMs: plan.retentionMs,
    evaluationIntervalMs: plan.evaluationIntervalMs,
  };
}

/**
 * Create the provider.
 * @param {Object} [options={}] - {partitionServices, now, trafficWindowMs,
 *   evaluationIntervalMs}: the raw configured window and evaluation
 *   interval, resolved here through the shared resolver.
 * @return {Function} (partitionId, partition) => metrics, with
 *   `describeTrafficSamples()` for diagnostics.
 */
function createManagedSplitMetricsProvider(options = {}) {
  const partitionServices = options.partitionServices || null;
  const nowFn = typeof options.now === LOCAL_STR_FUNCTION ?
    options.now :
    () => Date.now();
  const plan = resolveSamplingPlan(options);
  const records = new Map();
  let lastStaleSweepAtMs = null;

  const getPartitionMetrics = (partitionId, partition) => {
    const normalizedPartitionId =
      partitionId || partition?.partition_id || partition?.partitionId || null;
    const nowMs = nowFn();
    if (lastStaleSweepAtMs === null ||
        nowMs - lastStaleSweepAtMs >= plan.windowMs) {
      lastStaleSweepAtMs = nowMs;
      forgetStaleTrafficRecords(records, nowMs, plan.retentionMs);
    }
    const localLeaderService = findLocalLeaderPartitionService(
      partitionServices,
      normalizedPartitionId,
    );

    if (!localLeaderService) {
      // Not the local leader: this node observes no traffic for it, and a
      // later leadership starts a fresh span.
      records.delete(normalizedPartitionId);
      return {
        sizeBytes: normalizePartitionSize(partition),
        ...NO_TRAFFIC_SIGNAL,
      };
    }

    const liveSizeBytes = Number(localLeaderService.getSize());
    const sizeBytes = Number.isFinite(liveSizeBytes) ?
      liveSizeBytes :
      normalizePartitionSize(partition);
    const reading = readLeaderCounter(localLeaderService);
    if (reading.count === null) {
      records.delete(normalizedPartitionId);
      return {sizeBytes, ...NO_TRAFFIC_SIGNAL};
    }
    let record = records.get(normalizedPartitionId);
    if (!record) {
      record = {counterSource: null, term: null, samples: []};
      records.set(normalizedPartitionId, record);
    }
    return {
      sizeBytes,
      ...observeTraffic(record, {...reading, nowMs}, plan),
    };
  };
  getPartitionMetrics.describeTrafficSamples = () =>
    describeTrafficRecords(records, plan);
  return getPartitionMetrics;
}

export {
  createManagedSplitMetricsProvider,
};
