/**
 * Scenario: Seven-Node Postgres Baseline Partition Split
 *
 * Reuses the shared Postgres baseline comparison benchmark, but forces the
 * benchmark table to split during the run and verifies that the resulting
 * partitioning spreads across the seven-node cluster.
 */

import assert from 'node:assert/strict';
import {run as runPostgresBaselineComparison} from
  './postgres-baseline-comparison.js';
import {queryTableDistribution, sleep} from './table-distribution-helpers.js';

const ZERO = 0;
const DEFAULT_EXPECTED_NODE_COUNT = 7;
const DEFAULT_BASELINE_LOAD_NODE_COUNT = 7;
const DEFAULT_REQUIRED_SUT_LOAD_NODE_COUNT = 7;
const DEFAULT_DURATION_SECONDS = 150;
const DEFAULT_LOAD_DURATION = '150s';
const DEFAULT_TABLE_NAME = 'benchmark_partition_split_events';
const DEFAULT_MIN_TOTAL_PARTITIONS = 2;
const DEFAULT_MIN_ADDITIONAL_PARTITIONS = 1;
const DEFAULT_MIN_DISTINCT_REPLICA_NODES = 5;
const DEFAULT_PARTITION_OBSERVATION_TIMEOUT_MS = 30000;
const DEFAULT_PARTITION_OBSERVATION_POLL_INTERVAL_MS = 500;
const DEFAULT_SPLIT_STORAGE_THRESHOLD_BYTES = 16384;
const DEFAULT_SPLIT_TRAFFIC_THRESHOLD_QPM = 120;
const DEFAULT_MERGE_STORAGE_THRESHOLD_BYTES = 1;
const DEFAULT_MERGE_TRAFFIC_THRESHOLD_QPM = 1;

const DEFAULT_BENCHMARK_TABLE_POLICIES = Object.freeze({
  externalCdcAllowed: false,
  splitStorageThreshold: DEFAULT_SPLIT_STORAGE_THRESHOLD_BYTES,
  splitTrafficThreshold: DEFAULT_SPLIT_TRAFFIC_THRESHOLD_QPM,
  mergeStorageThreshold: DEFAULT_MERGE_STORAGE_THRESHOLD_BYTES,
  mergeTrafficThreshold: DEFAULT_MERGE_TRAFFIC_THRESHOLD_QPM,
});

function resolveScenarioOverrides(cluster) {
  return cluster?._scenarioOverrides?.
    sevenNodePostgresBaselinePartitionSplit || {};
}

function getSeedNode(nodes) {
  return nodes.find((node) => node.role === 'seed') || nodes[ZERO] || null;
}

function resolveScenarioConfig(cluster) {
  const benchmarkConfig = cluster?._config?.benchmark || {};
  return {
    expectedNodeCount: DEFAULT_EXPECTED_NODE_COUNT,
    baselineLoadNodeCount:
      Number.isInteger(benchmarkConfig.clients) &&
        benchmarkConfig.clients > ZERO ?
        benchmarkConfig.clients :
        DEFAULT_BASELINE_LOAD_NODE_COUNT,
    requiredSutLoadNodeCount:
      Number.isInteger(benchmarkConfig.requiredSutLoadNodeCount) &&
        benchmarkConfig.requiredSutLoadNodeCount > ZERO ?
        benchmarkConfig.requiredSutLoadNodeCount :
        DEFAULT_REQUIRED_SUT_LOAD_NODE_COUNT,
    durationSeconds:
      Number.isInteger(benchmarkConfig.durationSeconds) &&
        benchmarkConfig.durationSeconds > ZERO ?
        benchmarkConfig.durationSeconds :
        DEFAULT_DURATION_SECONDS,
    loadDuration:
      typeof benchmarkConfig.loadDuration === 'string' &&
        benchmarkConfig.loadDuration.length > ZERO ?
        benchmarkConfig.loadDuration :
        DEFAULT_LOAD_DURATION,
    tableName:
      typeof benchmarkConfig.tableName === 'string' &&
        benchmarkConfig.tableName.length > ZERO ?
        benchmarkConfig.tableName :
        DEFAULT_TABLE_NAME,
    benchmarkTablePolicies:
      benchmarkConfig.benchmarkTablePolicies &&
        typeof benchmarkConfig.benchmarkTablePolicies === 'object' ?
        {
          ...DEFAULT_BENCHMARK_TABLE_POLICIES,
          ...benchmarkConfig.benchmarkTablePolicies,
        } :
        {...DEFAULT_BENCHMARK_TABLE_POLICIES},
    minTotalPartitions: DEFAULT_MIN_TOTAL_PARTITIONS,
    minAdditionalPartitions: DEFAULT_MIN_ADDITIONAL_PARTITIONS,
    minDistinctReplicaNodes: DEFAULT_MIN_DISTINCT_REPLICA_NODES,
    partitionObservationTimeoutMs: DEFAULT_PARTITION_OBSERVATION_TIMEOUT_MS,
    partitionObservationPollIntervalMs:
      DEFAULT_PARTITION_OBSERVATION_POLL_INTERVAL_MS,
  };
}

function buildScenarioBenchmarkConfig(currentBenchmarkConfig, scenarioConfig) {
  return {
    ...currentBenchmarkConfig,
    clients: scenarioConfig.baselineLoadNodeCount,
    durationSeconds: scenarioConfig.durationSeconds,
    loadDuration: scenarioConfig.loadDuration,
    tableName: scenarioConfig.tableName,
    requiredSutLoadNodeCount: scenarioConfig.requiredSutLoadNodeCount,
    strictParity:
      currentBenchmarkConfig?.strictParity === false ? false : true,
    benchmarkTablePolicies: scenarioConfig.benchmarkTablePolicies,
  };
}

async function waitForSplitEvidence(seedNode, baselineDistribution, config) {
  const deadline = Date.now() + config.partitionObservationTimeoutMs;
  let sampleCount = ZERO;
  let latest = baselineDistribution;

  while (Date.now() <= deadline) {
    sampleCount += 1;
    latest = await queryTableDistribution(seedNode, {
      tableName: config.tableName,
    });
    const additionalPartitionCount = Math.max(
      ZERO,
      latest.partitionCount - baselineDistribution.partitionCount,
    );
    if (latest.partitionCount >= config.minTotalPartitions &&
        additionalPartitionCount >= config.minAdditionalPartitions &&
        latest.replicaNodeCount >= config.minDistinctReplicaNodes) {
      return {
        baselinePartitionCount: baselineDistribution.partitionCount,
        partitionCount: latest.partitionCount,
        additionalPartitionCount,
        partitionIds: Array.from(latest.partitionIds).sort(),
        replicaNodeCount: latest.replicaNodeCount,
        replicaNodeIds: Array.from(latest.replicaNodeIds).sort(),
        sampleCount,
      };
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleep(config.partitionObservationPollIntervalMs);
  }

  throw new Error(
    'Timed out waiting for benchmark table "' + config.tableName +
    '" to split and spread. baselinePartitions=' +
    baselineDistribution.partitionCount + ', latestPartitions=' +
    latest.partitionCount + ', latestReplicaNodeCount=' +
    latest.replicaNodeCount + ', samples=' + sampleCount,
  );
}

function buildPartitioningRebalanceAssessment(baselineResult, splitEvidence) {
  const benchmarkDetails = baselineResult?.details?.benchmark || {};
  const rebalancingPressure = benchmarkDetails.rebalancingPressure || {};
  const loadPressure = rebalancingPressure.load || {};
  const criticalState = loadPressure.criticalState || {};

  return {
    splitObserved: true,
    baselinePartitionCount: splitEvidence.baselinePartitionCount,
    partitionCount: splitEvidence.partitionCount,
    additionalPartitionCount: splitEvidence.additionalPartitionCount,
    partitionIds: splitEvidence.partitionIds,
    replicaNodeCount: splitEvidence.replicaNodeCount,
    replicaNodeIds: splitEvidence.replicaNodeIds,
    loadSampleCount:
      Number.isInteger(loadPressure.sampleCount) ?
        loadPressure.sampleCount :
        ZERO,
    maxReplicaOpsInFlight:
      Number.isInteger(loadPressure.maxReplicaOpsInFlight) ?
        loadPressure.maxReplicaOpsInFlight :
        null,
    maxLeaderChangesWithinCooldown:
      Number.isInteger(loadPressure.maxLeaderChangesWithinCooldown) ?
        loadPressure.maxLeaderChangesWithinCooldown :
        null,
    pinning: loadPressure.pinning || null,
    criticalRebalancingState: criticalState,
    postLoadDrainStatus: benchmarkDetails.postLoadDrainStatus || null,
  };
}

function buildQueryServingAssessment(baselineResult) {
  const benchmarkDetails = baselineResult?.details?.benchmark || {};
  const comparison = baselineResult?.details?.comparison || {};
  const baseline = baselineResult?.details?.baseline || {};
  const throughputRatio = Number(
    comparison.throughputRatioSutToBaseline || ZERO,
  );
  const p99LatencyRatio = Number(
    comparison.p99LatencyRatioSutToBaselineAvg || ZERO,
  );

  return {
    workload: benchmarkDetails.workload || null,
    operations: benchmarkDetails.operations || [],
    tableName: benchmarkDetails.tableName || null,
    comparedAgainst:
      Number.isInteger(baseline.replicationFactor) &&
        baseline.replicationFactor > ZERO ?
        String(baseline.replicationFactor) + '-replica-postgres-baseline' :
        'postgres-baseline',
    throughputRatioSutToBaseline: throughputRatio,
    p99LatencyRatioSutToBaselineAvg: p99LatencyRatio,
    throughputImproved: throughputRatio > 1,
    p99LatencyImprovedOrEqual:
      p99LatencyRatio > ZERO && p99LatencyRatio <= 1,
    outperformedBaseline:
      throughputRatio > 1 &&
      p99LatencyRatio > ZERO &&
      p99LatencyRatio <= 1,
  };
}

async function run(cluster) {
  const scenarioConfig = resolveScenarioConfig(cluster);
  const scenarioOverrides = resolveScenarioOverrides(cluster);
  const nodes = cluster.getNodes();

  assert.equal(
    nodes.length,
    scenarioConfig.expectedNodeCount,
    'Scenario requires exactly ' + scenarioConfig.expectedNodeCount +
    ' nodes, got ' + nodes.length,
  );

  const seedNode = getSeedNode(nodes);
  assert.ok(seedNode, 'Seed node should be available');

  const baselineDistribution = await queryTableDistribution(seedNode, {
    tableName: scenarioConfig.tableName,
  });
  const originalConfig = cluster?._config || {};
  const nextBenchmarkConfig = buildScenarioBenchmarkConfig(
    originalConfig.benchmark || {},
    scenarioConfig,
  );

  cluster._config = {
    ...originalConfig,
    benchmark: nextBenchmarkConfig,
  };

  let baselineResult;
  try {
    baselineResult =
      typeof scenarioOverrides.runBaselineComparison === 'function' ?
        await scenarioOverrides.runBaselineComparison(cluster) :
        await runPostgresBaselineComparison(cluster);
  } finally {
    cluster._config = originalConfig;
  }

  const splitEvidence = await waitForSplitEvidence(
    seedNode,
    baselineDistribution,
    scenarioConfig,
  );
  const partitioningRebalanceAssessment =
    buildPartitioningRebalanceAssessment(baselineResult, splitEvidence);
  const queryServingAssessment =
    buildQueryServingAssessment(baselineResult);

  return {
    ...baselineResult,
    splitEvidence,
    details: {
      ...baselineResult.details,
      partitioningRebalanceAssessment,
      queryServingAssessment,
    },
  };
}

export {run};
