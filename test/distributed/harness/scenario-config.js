import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from './constants.js';

const ZERO = 0;
const DEFAULT_LOG_TABLE_NAME = 'logs';

const DEFAULT_MIXED_LOAD_OPERATIONS = Object.freeze([
  'INSERT',
  'SELECT',
  'UPDATE',
  'DELETE',
]);

function normalizeFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeNonEmptyString(value, fallback) {
  return typeof value === 'string' && value.length > ZERO ? value : fallback;
}

function normalizeNonEmptyArray(value, fallback) {
  return Array.isArray(value) && value.length > ZERO ? value : fallback;
}

function normalizeObject(value) {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value) ?
    value :
    null;
}

function resolveScenarioOptions(options = {}, cluster = null, scenarioKey = '') {
  const normalizedOptions = normalizeObject(options) || {};
  if (typeof scenarioKey !== 'string' || scenarioKey.length <= ZERO) {
    return normalizedOptions;
  }

  const scenarios = normalizeObject(cluster?._config?.scenarios);
  const clusterOverrides = normalizeObject(scenarios?.[scenarioKey]);
  if (!clusterOverrides) {
    return normalizedOptions;
  }

  return {
    ...clusterOverrides,
    ...normalizedOptions,
  };
}

function resolveSevenNodeReadWriteLoadDistributionScenarioConfig(options = {}) {
  return Object.freeze({
    expectedNodeCount: normalizeFiniteNumber(options.expectedNodeCount, 7),
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 140),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '120s'),
    loadOperations: normalizeNonEmptyArray(
      options.loadOperations,
      DEFAULT_MIXED_LOAD_OPERATIONS,
    ),
    tableName: normalizeNonEmptyString(options.tableName, DEFAULT_LOG_TABLE_NAME),
    minAdditionalPartitions:
      normalizeFiniteNumber(options.minAdditionalPartitions, 2),
    minDistinctReplicaNodes:
      normalizeFiniteNumber(options.minDistinctReplicaNodes, 5),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 180000),
    controlPlaneQuiescenceTimeoutMs:
      normalizeFiniteNumber(options.controlPlaneQuiescenceTimeoutMs, 180000),
    controlPlaneQuiescenceNoProgressTimeoutMs:
      normalizeFiniteNumber(
        options.controlPlaneQuiescenceNoProgressTimeoutMs,
        90000,
      ),
    distributionTimeoutMs:
      normalizeFiniteNumber(options.distributionTimeoutMs, 180000),
    distributionPollIntervalMs:
      normalizeFiniteNumber(options.distributionPollIntervalMs, 250),
    postDistributionSoakMs:
      normalizeFiniteNumber(
        options.postDistributionSoakMs,
        SCENARIO_TIMING_DEFAULTS.shortSoakMs,
      ),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.75),
  });
}

function resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig(
  options = {},
) {
  const base = resolveSevenNodeReadWriteLoadDistributionScenarioConfig(options);
  return Object.freeze({
    ...base,
    preRestartDelayMs: normalizeFiniteNumber(
      options.preRestartDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 180000),
    transactionReplayTimeoutMs:
      normalizeFiniteNumber(options.transactionReplayTimeoutMs, 30000),
    transactionReplayPollIntervalMs:
      normalizeFiniteNumber(options.transactionReplayPollIntervalMs, 250),
  });
}

function resolveSevenNodeTablePartitionDistributionScenarioConfig(options = {}) {
  return Object.freeze({
    expectedNodeCount: normalizeFiniteNumber(options.expectedNodeCount, 7),
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 120),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '120s'),
    tableName: normalizeNonEmptyString(options.tableName, DEFAULT_LOG_TABLE_NAME),
    minAdditionalPartitions:
      normalizeFiniteNumber(options.minAdditionalPartitions, 2),
    minDistinctReplicaNodes:
      normalizeFiniteNumber(options.minDistinctReplicaNodes, 5),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 180000),
    controlPlaneQuiescenceTimeoutMs:
      normalizeFiniteNumber(options.controlPlaneQuiescenceTimeoutMs, 180000),
    controlPlaneQuiescenceNoProgressTimeoutMs:
      normalizeFiniteNumber(
        options.controlPlaneQuiescenceNoProgressTimeoutMs,
        90000,
      ),
    distributionTimeoutMs:
      normalizeFiniteNumber(options.distributionTimeoutMs, 90000),
    distributionPollIntervalMs:
      normalizeFiniteNumber(options.distributionPollIntervalMs, 250),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.5),
  });
}

function resolveSevenNodeLoadDuringPartitioningScenarioConfig(options = {}) {
  return Object.freeze({
    expectedNodeCount: normalizeFiniteNumber(options.expectedNodeCount, 7),
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 140),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '240s'),
    loadOperations: normalizeNonEmptyArray(
      options.loadOperations,
      DEFAULT_MIXED_LOAD_OPERATIONS,
    ),
    tableName: normalizeNonEmptyString(options.tableName, DEFAULT_LOG_TABLE_NAME),
    minAdditionalPartitions:
      normalizeFiniteNumber(options.minAdditionalPartitions, 1),
    minDistinctReplicaNodes:
      normalizeFiniteNumber(options.minDistinctReplicaNodes, 5),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 180000),
    controlPlaneQuiescenceTimeoutMs:
      normalizeFiniteNumber(options.controlPlaneQuiescenceTimeoutMs, 180000),
    controlPlaneQuiescenceNoProgressTimeoutMs:
      normalizeFiniteNumber(
        options.controlPlaneQuiescenceNoProgressTimeoutMs,
        90000,
      ),
    partitioningTimeoutMs:
      normalizeFiniteNumber(options.partitioningTimeoutMs, 180000),
    splitAttemptTimeoutMs:
      normalizeFiniteNumber(options.splitAttemptTimeoutMs, 60000),
    partitioningPollIntervalMs:
      normalizeFiniteNumber(options.partitioningPollIntervalMs, 250),
    minOpsAfterPartitioning:
      normalizeFiniteNumber(options.minOpsAfterPartitioning, 20),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.7),
  });
}

function resolveSeedRestartUnderLoadScenarioConfig(options = {}) {
  return Object.freeze({
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 50),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '60s'),
    preRestartDelayMs: normalizeFiniteNumber(
      options.preRestartDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    preRestartActiveTimeoutMs:
      normalizeFiniteNumber(options.preRestartActiveTimeoutMs, 180000),
    restartReadinessTimeoutMs:
      normalizeFiniteNumber(options.restartReadinessTimeoutMs, 360000),
    postRestartActiveTimeoutMs:
      normalizeFiniteNumber(options.postRestartActiveTimeoutMs, 240000),
    postRestartQuietWindowMs:
      normalizeFiniteNumber(
        options.postRestartQuietWindowMs,
        CONVERGENCE_DEFAULTS.quietWindowMs,
      ),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 240000),
    consistencyTimeoutMs:
      normalizeFiniteNumber(options.consistencyTimeoutMs, 300000),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.8),
  });
}

function resolvePartitionKillHealUnderLoadScenarioConfig(options = {}) {
  return Object.freeze({
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 50),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '60s'),
    preFaultDelayMs: normalizeFiniteNumber(
      options.preFaultDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    partitionHoldMs: normalizeFiniteNumber(options.partitionHoldMs, 5000),
    postKillDelayMs: normalizeFiniteNumber(options.postKillDelayMs, 1000),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 180000),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.75),
  });
}

function resolveDiskFullUnderLoadScenarioConfig(options = {}) {
  return Object.freeze({
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 50),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '60s'),
    preFaultDelayMs: normalizeFiniteNumber(
      options.preFaultDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    faultHoldMs: normalizeFiniteNumber(options.faultHoldMs, 5000),
    postReleaseDelayMs: normalizeFiniteNumber(options.postReleaseDelayMs, 1000),
    diskFillSizeMb: normalizeFiniteNumber(options.diskFillSizeMb, 256),
    diskPressurePath: normalizeNonEmptyString(
      options.diskPressurePath,
      '/tmp/lagrange-chaos/disk-pressure.bin',
    ),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 180000),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.8),
  });
}

function resolveSlowFollowerUnderLoadScenarioConfig(options = {}) {
  return Object.freeze({
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 50),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '60s'),
    preFaultDelayMs: normalizeFiniteNumber(
      options.preFaultDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    faultHoldMs: normalizeFiniteNumber(options.faultHoldMs, 5000),
    postHealDelayMs: normalizeFiniteNumber(options.postHealDelayMs, 1000),
    latencyMs: normalizeFiniteNumber(options.latencyMs, 200),
    jitterMs: normalizeFiniteNumber(options.jitterMs, 50),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 180000),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.8),
  });
}

function resolveWriteAckVisibilityScenarioConfig(options = {}) {
  return Object.freeze({
    writeCount: normalizeFiniteNumber(options.writeCount, 8),
    propagationTimeoutMs:
      normalizeFiniteNumber(options.propagationTimeoutMs, 10000),
    pollIntervalMs: normalizeFiniteNumber(options.pollIntervalMs, 200),
  });
}

function resolveThreeNodeSeedRebalanceScenarioConfig(options = {}) {
  return Object.freeze({
    rebalanceWaitTimeoutMs:
      normalizeFiniteNumber(options.rebalanceWaitTimeoutMs, 120000),
    rebalancePollIntervalMs:
      normalizeFiniteNumber(options.rebalancePollIntervalMs, 250),
  });
}

function resolveTableDistributionQueryConfig(options = {}) {
  return Object.freeze({
    tableName: normalizeNonEmptyString(options.tableName, DEFAULT_LOG_TABLE_NAME),
  });
}

function resolvePartitionGrowthAndSpreadScenarioConfig(options = {}) {
  return Object.freeze({
    tableName: normalizeNonEmptyString(options.tableName, DEFAULT_LOG_TABLE_NAME),
    timeoutMs: normalizeFiniteNumber(options.timeoutMs, 90000),
    pollIntervalMs: normalizeFiniteNumber(options.pollIntervalMs, 250),
    minAdditionalPartitions:
      normalizeFiniteNumber(options.minAdditionalPartitions, 2),
    minDistinctReplicaNodes:
      normalizeFiniteNumber(options.minDistinctReplicaNodes, 5),
  });
}

export {
  resolveDiskFullUnderLoadScenarioConfig,
  resolvePartitionKillHealUnderLoadScenarioConfig,
  resolvePartitionGrowthAndSpreadScenarioConfig,
  resolveScenarioOptions,
  resolveSeedRestartUnderLoadScenarioConfig,
  resolveSlowFollowerUnderLoadScenarioConfig,
  resolveSevenNodeLoadDuringPartitioningScenarioConfig,
  resolveSevenNodeReadWriteLoadDistributionScenarioConfig,
  resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig,
  resolveSevenNodeTablePartitionDistributionScenarioConfig,
  resolveTableDistributionQueryConfig,
  resolveThreeNodeSeedRebalanceScenarioConfig,
  resolveWriteAckVisibilityScenarioConfig,
};
