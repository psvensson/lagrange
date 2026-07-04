/**
 * Runtime config, delay, and group-id helpers for LatencyGroupManager.
 */

import {TABLES} from '../constants/index.js';
import {
  LATENCY_TOPOLOGY_CONFIG_KEY,
  LATENCY_TOPOLOGY_DEFAULT,
} from './latency-topology-constants.js';
import {
  LATENCY_GROUP_MANAGER_DEFAULT,
} from './latency-group-manager-constants.js';

function resolveLatencyGroupManagerConfig(config) {
  return {
    pinnedGroupId: resolvePinnedGroupIdConfig(config),
    groupThresholdMs: resolveNumericConfig(
      config,
      LATENCY_TOPOLOGY_CONFIG_KEY.GROUP_THRESHOLD_MS,
      LATENCY_TOPOLOGY_DEFAULT.GROUP_THRESHOLD_MS,
      LATENCY_GROUP_MANAGER_DEFAULT.MIN_GROUP_THRESHOLD_MS,
    ),
    recalcIntervalMs: resolveNumericConfig(
      config,
      LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_INTERVAL_MS,
      LATENCY_TOPOLOGY_DEFAULT.RECALC_INTERVAL_MS,
      LATENCY_GROUP_MANAGER_DEFAULT.MIN_RECALC_INTERVAL_MS,
    ),
    recalcJitterRatio: resolveRatioConfig(
      config,
      LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_JITTER_RATIO,
      LATENCY_TOPOLOGY_DEFAULT.RECALC_JITTER_RATIO,
    ),
  };
}

// Operator-pinned latency group (zone label). Empty string is the
// explicit "not pinned" value: assignment then follows measured RTT.
function resolvePinnedGroupIdConfig(config) {
  const value = config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PINNED_GROUP_ID);
  return typeof value === 'string' ? value.trim() : '';
}

function resolveNumericConfig(config, key, fallback, minValue) {
  const value = config.get(key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minValue, value);
}

function resolveRatioConfig(config, key, fallback) {
  const value = config.get(key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(
    LATENCY_GROUP_MANAGER_DEFAULT.MAX_RECALC_JITTER_RATIO,
    Math.max(LATENCY_GROUP_MANAGER_DEFAULT.MIN_RECALC_JITTER_RATIO, value),
  );
}

function computeNextLatencyGroupCycleDelayMs(options) {
  const jitterRange = options.recalcIntervalMs * options.recalcJitterRatio;
  if (jitterRange <= 0) {
    return options.recalcIntervalMs;
  }

  const rawRandom = options.randomFn();
  const randomValue = Number.isFinite(rawRandom) ?
    rawRandom :
    LATENCY_GROUP_MANAGER_DEFAULT.RANDOM_CENTER;
  const centeredRandom =
    (randomValue - LATENCY_GROUP_MANAGER_DEFAULT.RANDOM_CENTER) * 2;
  const jitterOffset = Math.round(centeredRandom * jitterRange);
  return Math.max(
    LATENCY_GROUP_MANAGER_DEFAULT.MIN_DELAY_MS,
    options.recalcIntervalMs + jitterOffset,
  );
}

function buildLatencyGroupId(options) {
  const baseTimestamp = Number.isFinite(options.timestamp) ?
    Math.floor(options.timestamp) :
    options.nowFn();
  let attempt = 0;

  while (true) {
    const retrySuffix = attempt === 0 ?
      '' :
      `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}` +
        `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_RETRY_MARKER}` +
        `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}` +
        `${attempt}`;
    const groupId = `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_PREFIX}` +
      `${options.nodeId}` +
      `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}` +
      `${baseTimestamp}${retrySuffix}`;
    if (!hasLatencyGroup(options.systemTableCache, groupId)) {
      return groupId;
    }
    attempt += 1;
  }
}

function hasLatencyGroup(systemTableCache, groupId) {
  const hasFn = systemTableCache?.has;
  if (typeof hasFn !== 'function') {
    return false;
  }
  const hasResult = hasFn.call(
    systemTableCache,
    TABLES.LATENCY_GROUPS,
    groupId,
  );

  // `buildLatencyGroupId()` is synchronous; async cache responses are treated
  // as non-colliding to preserve the original non-blocking retry behavior.
  if (hasResult && typeof hasResult.then === 'function') {
    return false;
  }

  return Boolean(hasResult);
}

export {
  buildLatencyGroupId,
  computeNextLatencyGroupCycleDelayMs,
  resolveLatencyGroupManagerConfig,
};
