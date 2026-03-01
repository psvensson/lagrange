/**
 * Scenario: Seven-Node Load During Partitioning
 *
 * Starts mixed load first, then verifies partition growth occurs while the
 * workload continues to make progress.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveSevenNodeLoadDuringPartitioningScenarioConfig,
} from '../harness/scenario-config.js';
import {
  sleep,
  queryTableDistribution,
} from './table-distribution-helpers.js';

const ZERO = 0;

/**
 * Pick seed node with deterministic fallback.
 * @param {Array<Object>} nodes
 * @return {Object}
 */
function getSeedNode(nodes) {
  return nodes.find((node) => node.role === 'seed') || nodes[0];
}

/**
 * Record newly observed partition IDs.
 * @param {Set<string>} baselinePartitionIds
 * @param {Set<string>} additionalPartitionIds
 * @param {Set<string>} currentPartitionIds
 */
function trackAdditionalPartitions(
  baselinePartitionIds,
  additionalPartitionIds,
  currentPartitionIds,
) {
  for (const partitionId of currentPartitionIds) {
    if (baselinePartitionIds.has(partitionId)) {
      continue;
    }
    additionalPartitionIds.add(partitionId);
  }
}

/**
 * Run the seven-node load-during-partitioning scenario.
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const {
    expectedNodeCount,
    loadOpsPerSec,
    loadDuration,
    loadOperations,
    tableName,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
    partitioningTimeoutMs,
    partitioningPollIntervalMs,
    minOpsAfterPartitioning,
    minSuccessRate,
  } = resolveSevenNodeLoadDuringPartitioningScenarioConfig(options);

  const nodes = cluster.getNodes();
  assert.equal(
    nodes.length,
    expectedNodeCount,
    'Scenario requires exactly ' + expectedNodeCount +
    ' nodes, got ' + nodes.length,
  );

  const seedNode = getSeedNode(nodes);
  assert.ok(seedNode, 'Seed node should be available');

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: CONVERGENCE_DEFAULTS.settleTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    operations: loadOperations,
  });

  let partitioningEvidence = null;
  try {
    const baseline = await queryTableDistribution(seedNode, {tableName});
    assert.ok(
      baseline.partitionCount > ZERO,
      'No partitions found for table "' + tableName + '" at scenario start',
    );

    const baselinePartitionIds = new Set(baseline.partitionIds);
    const additionalPartitionIds = new Set();
    const deadline = Date.now() + partitioningTimeoutMs;

    let sampleCount = ZERO;
    let metricsAtFirstPartitioning = null;
    let latestDistribution = baseline;
    let latestMetrics = loadRun.getMetrics();
    let successObserved = false;

    while (Date.now() <= deadline) {
      sampleCount += 1;
      latestDistribution = await queryTableDistribution(seedNode, {tableName});
      latestMetrics = loadRun.getMetrics();

      trackAdditionalPartitions(
        baselinePartitionIds,
        additionalPartitionIds,
        latestDistribution.partitionIds,
      );

      if (metricsAtFirstPartitioning === null &&
          additionalPartitionIds.size > ZERO) {
        metricsAtFirstPartitioning = latestMetrics.total;
      }

      const growthSatisfied =
        additionalPartitionIds.size >= minAdditionalPartitions;
      const spreadSatisfied =
        latestDistribution.replicaNodeCount >= minDistinctReplicaNodes;
      const operationsAfterPartitioning =
        metricsAtFirstPartitioning === null ?
          ZERO :
          latestMetrics.total - metricsAtFirstPartitioning;
      const workloadDuringPartitioningSatisfied =
        metricsAtFirstPartitioning !== null &&
        operationsAfterPartitioning >= minOpsAfterPartitioning;

      if (growthSatisfied &&
          spreadSatisfied &&
          workloadDuringPartitioningSatisfied) {
        successObserved = true;
        partitioningEvidence = {
          baselinePartitionCount: baseline.partitionCount,
          additionalPartitionCount: additionalPartitionIds.size,
          additionalPartitionIds: Array.from(additionalPartitionIds).sort(),
          replicaNodeCount: latestDistribution.replicaNodeCount,
          replicaNodeIds: Array.from(latestDistribution.replicaNodeIds).sort(),
          metricsAtFirstPartitioning,
          metricsAtSuccess: latestMetrics.total,
          operationsAfterPartitioning,
          sampleCount,
        };
        break;
      }

      if (Date.now() >= deadline) {
        break;
      }
      await sleep(partitioningPollIntervalMs);
    }

    assert.ok(
      successObserved,
      'Timed out waiting for partitioning-under-load evidence. ' +
      'Additional partitions=' + additionalPartitionIds.size +
      ', spread=' + latestDistribution.replicaNodeCount +
      ', metrics.total=' + latestMetrics.total +
      ', metricsAtFirstPartitioning=' + metricsAtFirstPartitioning,
    );
  } finally {
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
  }

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one mixed load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Mixed load success rate below threshold: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  await cluster.assertConsistency();

  return {
    expectedNodeCount,
    tableName,
    convergenceTiming: convergence,
    partitioningEvidence,
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
