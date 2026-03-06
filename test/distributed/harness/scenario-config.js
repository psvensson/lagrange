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
      normalizeFiniteNumber(options.minDistinctReplicaNodes, 6),
    distributionTimeoutMs:
      normalizeFiniteNumber(options.distributionTimeoutMs, 90000),
    distributionPollIntervalMs:
      normalizeFiniteNumber(options.distributionPollIntervalMs, 250),
    postDistributionSoakMs:
      normalizeFiniteNumber(options.postDistributionSoakMs, 3000),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.75),
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
      normalizeFiniteNumber(options.minDistinctReplicaNodes, 6),
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
    partitioningTimeoutMs:
      normalizeFiniteNumber(options.partitioningTimeoutMs, 180000),
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
    preRestartDelayMs: normalizeFiniteNumber(options.preRestartDelayMs, 5000),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 60000),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.8),
  });
}

function resolvePartitionKillHealUnderLoadScenarioConfig(options = {}) {
  return Object.freeze({
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 50),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '60s'),
    preFaultDelayMs: normalizeFiniteNumber(options.preFaultDelayMs, 5000),
    partitionHoldMs: normalizeFiniteNumber(options.partitionHoldMs, 5000),
    postKillDelayMs: normalizeFiniteNumber(options.postKillDelayMs, 1000),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 60000),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.9),
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
      normalizeFiniteNumber(options.rebalanceWaitTimeoutMs, 20000),
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
      normalizeFiniteNumber(options.minDistinctReplicaNodes, 6),
  });
}

export {
  resolvePartitionKillHealUnderLoadScenarioConfig,
  resolvePartitionGrowthAndSpreadScenarioConfig,
  resolveSeedRestartUnderLoadScenarioConfig,
  resolveSevenNodeLoadDuringPartitioningScenarioConfig,
  resolveSevenNodeReadWriteLoadDistributionScenarioConfig,
  resolveSevenNodeTablePartitionDistributionScenarioConfig,
  resolveTableDistributionQueryConfig,
  resolveThreeNodeSeedRebalanceScenarioConfig,
  resolveWriteAckVisibilityScenarioConfig,
};
