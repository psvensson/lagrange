import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from './constants.js';

const ZERO = 0;
const DEFAULT_LOG_TABLE_NAME = 'logs';
const WORKLOAD_PROFILE_DEFAULT = 'default';
const WORKLOAD_PROFILE_BENCHMARK_EVENTS = 'benchmark_events_mixed';

const DEFAULT_MIXED_LOAD_OPERATIONS = Object.freeze([
  'INSERT',
  'SELECT',
  'UPDATE',
  'DELETE',
]);
const DEFAULT_BENCHMARK_LOAD_OPERATIONS = Object.freeze([
  'INSERT',
  'SELECT',
]);
const LOAD_WORKLOAD_OPERATION_DEFAULTS = Object.freeze({
  [WORKLOAD_PROFILE_DEFAULT]: DEFAULT_MIXED_LOAD_OPERATIONS,
  [WORKLOAD_PROFILE_BENCHMARK_EVENTS]: DEFAULT_BENCHMARK_LOAD_OPERATIONS,
});

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

function resolveLoadWorkloadConfig(
  options = {},
  defaultWorkloadProfile = WORKLOAD_PROFILE_DEFAULT,
) {
  const workloadProfile = normalizeNonEmptyString(
    options.workloadProfile,
    defaultWorkloadProfile,
  );
  const defaultOperations =
    LOAD_WORKLOAD_OPERATION_DEFAULTS[workloadProfile] ||
    DEFAULT_MIXED_LOAD_OPERATIONS;
  return Object.freeze({
    workloadProfile,
    loadOperations: normalizeNonEmptyArray(
      options.loadOperations,
      defaultOperations,
    ),
  });
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
  const loadWorkload = resolveLoadWorkloadConfig(
    options,
    WORKLOAD_PROFILE_BENCHMARK_EVENTS,
  );
  return Object.freeze({
    expectedNodeCount: normalizeFiniteNumber(options.expectedNodeCount, 7),
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 140),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '120s'),
    workloadProfile: loadWorkload.workloadProfile,
    loadOperations: loadWorkload.loadOperations,
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
  const loadWorkload = resolveLoadWorkloadConfig(
    options,
    WORKLOAD_PROFILE_BENCHMARK_EVENTS,
  );
  return Object.freeze({
    expectedNodeCount: normalizeFiniteNumber(options.expectedNodeCount, 7),
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 140),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '240s'),
    workloadProfile: loadWorkload.workloadProfile,
    loadOperations: loadWorkload.loadOperations,
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

function resolveSnapshotLiveRebuildScenarioConfig(options = {}) {
  return Object.freeze({
    // Preload targeting: the default 'logs' table starts as a single data
    // partition, so preloading it to the declared floor lands all the bytes in
    // that one partition (whole-table == target-partition bytes at this scale).
    // Keys use a single contiguous zero-padded prefix so they stay inside one
    // partition's key range. Byte floor is deliberately SMALLER than the 256 MiB
    // production snapshot default so a rebuild transfers real multi-chunk bytes
    // without an unreasonable preload wall-time; Phase C calibrates the exact
    // floor. preloadRows * preloadPayloadBytes approximates floorBytes.
    tableName: normalizeNonEmptyString(options.tableName, DEFAULT_LOG_TABLE_NAME),
    floorBytes: normalizeFiniteNumber(options.floorBytes, 25165824),
    preloadRows: normalizeFiniteNumber(options.preloadRows, 3072),
    preloadPayloadBytes: normalizeFiniteNumber(options.preloadPayloadBytes, 8192),
    preloadBatchSize: normalizeFiniteNumber(options.preloadBatchSize, 64),
    preloadQueryTimeoutMs:
      normalizeFiniteNumber(options.preloadQueryTimeoutMs, 30000),
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 30),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '180s'),
    queryTimeoutMs: normalizeFiniteNumber(options.queryTimeoutMs, 10000),
    preLoadReadinessStableWindowMs: normalizeFiniteNumber(
      options.preLoadReadinessStableWindowMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    preLoadReadinessTimeoutMs:
      normalizeFiniteNumber(options.preLoadReadinessTimeoutMs, 300000),
    preWipeSettleMs: normalizeFiniteNumber(
      options.preWipeSettleMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    rejoinReadinessTimeoutMs:
      normalizeFiniteNumber(options.rejoinReadinessTimeoutMs, 360000),
    rejoinActiveTimeoutMs:
      normalizeFiniteNumber(options.rejoinActiveTimeoutMs, 300000),
    perNodeConvergenceTimeoutMs:
      normalizeFiniteNumber(options.perNodeConvergenceTimeoutMs, 300000),
    postRebuildSoakMs: normalizeFiniteNumber(
      options.postRebuildSoakMs,
      SCENARIO_TIMING_DEFAULTS.shortSoakMs,
    ),
    consistencyTimeoutMs:
      normalizeFiniteNumber(options.consistencyTimeoutMs, 300000),
    consistencyPollIntervalMs:
      normalizeFiniteNumber(options.consistencyPollIntervalMs, 250),
    consistencyForceRepairAfterMs:
      normalizeFiniteNumber(options.consistencyForceRepairAfterMs, 0),
    // Time to wait for the target table's replicas to spread off the seed
    // before resolving a rebuild target (a fresh cluster hosts everything on
    // the seed until the rebalancer spreads followers).
    targetSpreadTimeoutMs:
      normalizeFiniteNumber(options.targetSpreadTimeoutMs, 180000),
    targetSpreadPollIntervalMs:
      normalizeFiniteNumber(options.targetSpreadPollIntervalMs, 2000),
    acknowledgedWriteVisibilityTimeoutMs:
      normalizeFiniteNumber(options.acknowledgedWriteVisibilityTimeoutMs, 30000),
    acknowledgedWriteVisibilityPollIntervalMs:
      normalizeFiniteNumber(
        options.acknowledgedWriteVisibilityPollIntervalMs,
        500,
      ),
    // Optional restartability leg (config-gated): kill the follower again
    // mid-transfer and restart to prove resume from the verified boundary.
    restartabilityLegEnabled:
      options.restartabilityLegEnabled === true,
    restartabilityMidTransferDelayMs:
      normalizeFiniteNumber(options.restartabilityMidTransferDelayMs, 1500),
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

const PARTITION_MERGE_SCENARIO_VARIANT = Object.freeze({
  HAPPY_PATH: 'happy-path',
  SOURCE_LEADER_KILL_BACKFILL: 'source-leader-kill-backfill',
  SOURCE_LEADER_KILL_CUTOVER: 'source-leader-kill-cutover',
  REPLACE_CHURN: 'merge-under-replace-churn',
  ABORT_RETRY: 'abort-retry',
});

const PARTITION_MERGE_DEFAULT_TABLE_NAME = 'benchmark_merge_events';

// Phase 1: aggressive splits, merges disabled (threshold 1 byte / 1 qpm can
// never be satisfied by a real partition pair).
const PARTITION_MERGE_SPLIT_PHASE_TABLE_POLICIES = Object.freeze({
  externalCdcAllowed: false,
  splitStorageThreshold: 16384,
  splitTrafficThreshold: 120,
  mergeStorageThreshold: 1,
  mergeTrafficThreshold: 1,
});

// Phase 2: splits effectively disabled, merges enabled for any adjacent
// pair the scenario produced (combined size and traffic sit far below
// these bounds).
const PARTITION_MERGE_MERGE_PHASE_TABLE_POLICIES = Object.freeze({
  externalCdcAllowed: false,
  splitStorageThreshold: 1073741824,
  splitTrafficThreshold: 1000000,
  mergeStorageThreshold: 268435456,
  mergeTrafficThreshold: 1000000,
});

function normalizePartitionMergeVariant(value) {
  const variants = Object.values(PARTITION_MERGE_SCENARIO_VARIANT);
  return variants.includes(value) ?
    value :
    PARTITION_MERGE_SCENARIO_VARIANT.HAPPY_PATH;
}

function resolvePartitionMergeUnderLoadScenarioConfig(options = {}) {
  const splitPhaseTablePolicies = normalizeObject(
    options.splitPhaseTablePolicies,
  ) || PARTITION_MERGE_SPLIT_PHASE_TABLE_POLICIES;
  const mergePhaseTablePolicies = normalizeObject(
    options.mergePhaseTablePolicies,
  ) || PARTITION_MERGE_MERGE_PHASE_TABLE_POLICIES;
  return Object.freeze({
    expectedNodeCount: normalizeFiniteNumber(options.expectedNodeCount, 5),
    tableName: normalizeNonEmptyString(
      options.tableName,
      PARTITION_MERGE_DEFAULT_TABLE_NAME,
    ),
    variant: normalizePartitionMergeVariant(options.variant),
    splitPhaseTablePolicies,
    mergePhaseTablePolicies,
    splitLoadOpsPerSec: normalizeFiniteNumber(options.splitLoadOpsPerSec, 60),
    splitLoadDuration: normalizeNonEmptyString(
      options.splitLoadDuration,
      '150s',
    ),
    mergeLoadOpsPerSec: normalizeFiniteNumber(options.mergeLoadOpsPerSec, 20),
    mergeLoadDuration: normalizeNonEmptyString(
      options.mergeLoadDuration,
      '360s',
    ),
    // waitForPartitionGrowthAndSpread counts CUMULATIVE new partition
    // ids (one split yields 2); two splits (4 new ids) leave 3 current
    // partitions for the merge phase.
    minAdditionalPartitions:
      normalizeFiniteNumber(options.minAdditionalPartitions, 4),
    preMergePartitionCount:
      normalizeFiniteNumber(options.preMergePartitionCount, 3),
    preMergeTopologyTimeoutMs:
      normalizeFiniteNumber(options.preMergeTopologyTimeoutMs, 90000),
    minDistinctReplicaNodes:
      normalizeFiniteNumber(options.minDistinctReplicaNodes, 3),
    loadNodeRequiredCount:
      normalizeFiniteNumber(options.loadNodeRequiredCount, 2),
    convergenceTimeoutMs:
      normalizeFiniteNumber(options.convergenceTimeoutMs, 120000),
    controlPlaneQuiescenceTimeoutMs:
      normalizeFiniteNumber(options.controlPlaneQuiescenceTimeoutMs, 180000),
    controlPlaneQuiescenceNoProgressTimeoutMs:
      normalizeFiniteNumber(
        options.controlPlaneQuiescenceNoProgressTimeoutMs,
        90000,
      ),
    splitDistributionTimeoutMs:
      normalizeFiniteNumber(options.splitDistributionTimeoutMs, 240000),
    distributionPollIntervalMs:
      normalizeFiniteNumber(options.distributionPollIntervalMs, 500),
    requiredCompletedMerges:
      normalizeFiniteNumber(options.requiredCompletedMerges, 2),
    mergeCompletionTimeoutMs:
      normalizeFiniteNumber(options.mergeCompletionTimeoutMs, 300000),
    mergeLogScanPollIntervalMs:
      normalizeFiniteNumber(options.mergeLogScanPollIntervalMs, 2000),
    probeKeyCount: normalizeFiniteNumber(options.probeKeyCount, 12),
    probeIntervalMs: normalizeFiniteNumber(options.probeIntervalMs, 400),
    probeQueryTimeoutMs:
      normalizeFiniteNumber(options.probeQueryTimeoutMs, 5000),
    dissolutionSettleTimeoutMs:
      normalizeFiniteNumber(options.dissolutionSettleTimeoutMs, 120000),
    dissolutionPollIntervalMs:
      normalizeFiniteNumber(options.dissolutionPollIntervalMs, 1000),
    ackVisibilityTimeoutMs:
      normalizeFiniteNumber(options.ackVisibilityTimeoutMs, 90000),
    ackVisibilityPollIntervalMs:
      normalizeFiniteNumber(options.ackVisibilityPollIntervalMs, 500),
    minSuccessRate: normalizeFiniteNumber(options.minSuccessRate, 0.5),
    cutoverWaitBoundMs:
      normalizeFiniteNumber(options.cutoverWaitBoundMs, 120000),
    variantKillTriggerTimeoutMs:
      normalizeFiniteNumber(options.variantKillTriggerTimeoutMs, 240000),
    variantRestartDelayMs:
      normalizeFiniteNumber(options.variantRestartDelayMs, 15000),
    finalConsistencyTimeoutMs:
      normalizeFiniteNumber(options.finalConsistencyTimeoutMs, 180000),
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
  PARTITION_MERGE_SCENARIO_VARIANT,
  resolveDiskFullUnderLoadScenarioConfig,
  resolvePartitionKillHealUnderLoadScenarioConfig,
  resolvePartitionGrowthAndSpreadScenarioConfig,
  resolvePartitionMergeUnderLoadScenarioConfig,
  resolveScenarioOptions,
  resolveSeedRestartUnderLoadScenarioConfig,
  resolveSlowFollowerUnderLoadScenarioConfig,
  resolveSnapshotLiveRebuildScenarioConfig,
  resolveSevenNodeLoadDuringPartitioningScenarioConfig,
  resolveSevenNodeReadWriteLoadDistributionScenarioConfig,
  resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig,
  resolveSevenNodeTablePartitionDistributionScenarioConfig,
  resolveTableDistributionQueryConfig,
  resolveThreeNodeSeedRebalanceScenarioConfig,
  resolveWriteAckVisibilityScenarioConfig,
};
