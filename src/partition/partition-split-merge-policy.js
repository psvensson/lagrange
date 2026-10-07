/**
 * The automatic split/merge policy: hysteresis thresholds, the minimum age
 * a partition must reach before it may be merged, the no-signal rule, and
 * the one validator of the traffic measurement configuration.
 * PartitionSplitMergeManager is its only consumer; these are pure
 * functions of their inputs so the policy has one statement.
 *
 * Invariants:
 *  - Hysteresis: the effective merge threshold of each dimension is at
 *    most MERGE_HYSTERESIS_FACTOR (< 1) x the split threshold of the same
 *    dimension, so a merge-eligible pair forms a partition that does not
 *    qualify to split on the measurement that merged it.
 *  - No signal is not low load: a partition whose QPM is null (less than
 *    one full traffic window observed) is never merge-eligible and never
 *    splits on traffic.
 *  - Recent span: a merge reads each partition's rate over a span no
 *    longer than the merge span limit (two windows plus one sampling
 *    cadence step); a longer span is deferred, never eligible, and the
 *    manager re-evaluates once the authority has a short span.
 *  - Minimum age: both partitions of a pair must be at least the minimum
 *    merge age old by the DURABLE partitions.created_at, so the decision
 *    survives a manager restart or leader change; an unknown age is not
 *    eligible.
 */

import {
  SPLIT_MERGE_DEFAULT,
  SPLIT_MERGE_MERGE_DECISION,
} from './partition-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NUMBER = 'number';

/**
 * Whether one metrics payload carries a valid (full-window) traffic signal.
 * @param {Object} metrics - Partition metrics.
 * @return {boolean}
 */
function hasTrafficSignal(metrics) {
  return Number.isFinite(metrics?.queriesPerMinute);
}

/**
 * Resolve the durable creation time of one partition row.
 * @param {Object|string|null} partition - Partition row.
 * @return {number|null} Epoch ms, or null when the row carries none.
 */
function resolvePartitionCreatedAtMs(partition) {
  if (!partition || typeof partition !== LOCAL_STR_OBJECT) {
    return null;
  }
  const createdAt = Number(partition.created_at ?? partition.createdAt);
  return Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null;
}

/**
 * Resolve one configured positive duration: a finite value above 0 (a
 * numeric string counts), else the default.
 * @param {*} configured - Raw configured value.
 * @param {number} fallback - Default.
 * @return {number}
 */
function resolvePositiveDurationMs(configured, fallback) {
  const value = typeof configured === LOCAL_STR_STRING &&
    configured.trim() !== '' ?
    Number(configured) :
    configured;
  return typeof value === LOCAL_STR_NUMBER && Number.isFinite(value) &&
    value > 0 ?
    value :
    fallback;
}

/**
 * The ONE validator of the traffic measurement configuration, used by the
 * manager (policy) and the metrics provider (measurement) alike: the QPM
 * window (`partition.trafficWindowMs`) and the periodic evaluation
 * interval (`partition.evaluationIntervalMs`, which bounds how sparse the
 * provider's calls can be), plus what derives from them: the provider's
 * sampling cadence and the longest span a merge may read.
 * @param {{trafficWindowMs: *, evaluationIntervalMs: *}} configured - Raw
 *   configured values.
 * @return {{trafficWindowMs: number, evaluationIntervalMs: number,
 *   sampleCadenceMs: number, mergeTrafficSpanLimitMs: number}}
 */
function resolveTrafficMeasurement(configured = {}) {
  const trafficWindowMs = resolvePositiveDurationMs(
    configured.trafficWindowMs,
    SPLIT_MERGE_DEFAULT.TRAFFIC_WINDOW_MS,
  );
  const sampleCadenceMs =
    trafficWindowMs / SPLIT_MERGE_DEFAULT.TRAFFIC_SAMPLES_PER_WINDOW;
  return {
    trafficWindowMs,
    evaluationIntervalMs: resolvePositiveDurationMs(
      configured.evaluationIntervalMs,
      SPLIT_MERGE_DEFAULT.EVALUATION_INTERVAL_MS,
    ),
    sampleCadenceMs,
    mergeTrafficSpanLimitMs: trafficWindowMs *
      SPLIT_MERGE_DEFAULT.MERGE_TRAFFIC_SPAN_WINDOWS + sampleCadenceMs,
  };
}

/**
 * Resolve the effective minimum merge age: the configured age, never below
 * MERGE_MINIMUM_AGE_TRAFFIC_WINDOWS traffic windows.
 * @param {number} configuredMs - Configured minimum age.
 * @param {number} trafficWindowMs - QPM measurement window.
 * @return {number}
 */
function resolveMergeMinimumAgeMs(configuredMs, trafficWindowMs) {
  const configured = Number.isFinite(configuredMs) && configuredMs >= 0 ?
    configuredMs :
    SPLIT_MERGE_DEFAULT.MERGE_MINIMUM_PARTITION_AGE_MS;
  return Math.max(
    configured,
    trafficWindowMs * SPLIT_MERGE_DEFAULT.MERGE_MINIMUM_AGE_TRAFFIC_WINDOWS,
  );
}

/**
 * Clamp one merge threshold under the hysteresis bound of its split
 * threshold.
 * @param {number} mergeThreshold - Configured merge threshold.
 * @param {number} splitThreshold - Split threshold, same dimension.
 * @return {number}
 */
function clampMergeThreshold(mergeThreshold, splitThreshold) {
  if (!Number.isFinite(splitThreshold)) {
    return mergeThreshold;
  }
  return Math.min(
    mergeThreshold,
    splitThreshold * SPLIT_MERGE_DEFAULT.MERGE_HYSTERESIS_FACTOR,
  );
}

/**
 * Resolve the effective (hysteresis-clamped) merge thresholds.
 * @param {Object} policy - Table policy overrides.
 * @param {Object} defaults - Manager thresholds.
 * @return {{storageThreshold: number, trafficThreshold: number}}
 */
function resolveEffectiveMergeThresholds(policy, defaults) {
  return {
    storageThreshold: clampMergeThreshold(
      policy.mergeStorageThreshold ?? defaults.mergeStorageThreshold,
      policy.splitStorageThreshold ?? defaults.splitStorageThreshold,
    ),
    trafficThreshold: clampMergeThreshold(
      policy.mergeTrafficThreshold ?? defaults.mergeTrafficThreshold,
      policy.splitTrafficThreshold ?? defaults.splitTrafficThreshold,
    ),
  };
}

// The merge gates in decision order: the first gate that refuses names the
// decision; a pair no gate refuses is ELIGIBLE.
const MERGE_GATES = Object.freeze([
  Object.freeze({
    decision: SPLIT_MERGE_MERGE_DECISION.PARTITION_AGE_UNKNOWN,
    refuses: (input) => !Number.isFinite(input.leftCreatedAtMs) ||
      !Number.isFinite(input.rightCreatedAtMs),
  }),
  Object.freeze({
    decision: SPLIT_MERGE_MERGE_DECISION.PARTITION_BELOW_MINIMUM_AGE,
    refuses: (input) => input.nowMs -
      Math.max(input.leftCreatedAtMs, input.rightCreatedAtMs) <
      input.minimumAgeMs,
  }),
  Object.freeze({
    decision: SPLIT_MERGE_MERGE_DECISION.TRAFFIC_SIGNAL_UNAVAILABLE,
    refuses: (input) => input.trafficKnown !== true,
  }),
  Object.freeze({
    decision: SPLIT_MERGE_MERGE_DECISION.TRAFFIC_SPAN_TOO_LONG,
    refuses: (input) => input.trafficSpanMs > input.trafficSpanLimitMs,
  }),
  Object.freeze({
    decision: SPLIT_MERGE_MERGE_DECISION.ABOVE_MERGE_THRESHOLD,
    refuses: (input) => input.withinThresholds() !== true,
  }),
]);

/**
 * The longer of the two spans a pair's rates were read over; a span the
 * metrics source does not state (no `trafficObservedMs`) is not one the
 * span gate can refuse - the production QPM authority states every span.
 * @param {Object} leftMetrics - Left partition metrics.
 * @param {Object} rightMetrics - Right partition metrics.
 * @return {number} Milliseconds, 0 when neither states a span.
 */
function resolvePairTrafficSpanMs(leftMetrics, rightMetrics) {
  const spanOf = (metrics) => {
    const spanMs = Number(metrics?.trafficObservedMs);
    return Number.isFinite(spanMs) ? spanMs : 0;
  };
  return Math.max(spanOf(leftMetrics), spanOf(rightMetrics));
}

/**
 * Decide one adjacent pair: minimum durable age of BOTH partitions, then a
 * full-window traffic signal on both read over a recent span, then the
 * hysteresis thresholds.
 * @param {Object} input - {nowMs, minimumAgeMs, leftCreatedAtMs,
 *   rightCreatedAtMs, trafficKnown, trafficSpanMs, trafficSpanLimitMs,
 *   withinThresholds()}.
 * @return {string} A SPLIT_MERGE_MERGE_DECISION value.
 */
function resolveMergeDecision(input) {
  const refusal = MERGE_GATES.find((gate) => gate.refuses(input));
  return refusal ? refusal.decision : SPLIT_MERGE_MERGE_DECISION.ELIGIBLE;
}

export {
  hasTrafficSignal,
  resolveEffectiveMergeThresholds,
  resolveMergeDecision,
  resolveMergeMinimumAgeMs,
  resolvePairTrafficSpanMs,
  resolvePartitionCreatedAtMs,
  resolveTrafficMeasurement,
};
