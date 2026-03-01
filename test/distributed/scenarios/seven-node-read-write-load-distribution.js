/**
 * Scenario: Seven-Node Read/Write Load with Distribution
 *
 * Verifies a table remains broadly distributed while serving mixed read and
 * write traffic.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveSevenNodeReadWriteLoadDistributionScenarioConfig,
} from '../harness/scenario-config.js';
import {
  sleep,
  queryTableDistribution,
  waitForPartitionGrowthAndSpread,
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
 * Run the seven-node read/write load + distribution scenario.
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
    distributionTimeoutMs,
    distributionPollIntervalMs,
    postDistributionSoakMs,
    minSuccessRate,
  } = resolveSevenNodeReadWriteLoadDistributionScenarioConfig(options);

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

  let distribution = null;
  try {
    distribution = await waitForPartitionGrowthAndSpread(seedNode, {
      tableName,
      timeoutMs: distributionTimeoutMs,
      pollIntervalMs: distributionPollIntervalMs,
      minAdditionalPartitions,
      minDistinctReplicaNodes,
    });

    if (postDistributionSoakMs > ZERO) {
      await sleep(postDistributionSoakMs);
    }
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
    'Mixed read/write success rate below threshold: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  const finalDistribution = await queryTableDistribution(seedNode, {tableName});
  assert.ok(
    finalDistribution.replicaNodeCount >= minDistinctReplicaNodes,
    'Table replicas are no longer broadly spread after load. Spread=' +
    finalDistribution.replicaNodeCount + ', expected >= ' +
    minDistinctReplicaNodes,
  );

  await cluster.assertConsistency();

  return {
    expectedNodeCount,
    tableName,
    convergenceTiming: convergence,
    distribution,
    finalDistribution: {
      partitionCount: finalDistribution.partitionCount,
      replicaNodeCount: finalDistribution.replicaNodeCount,
      replicaNodeIds: Array.from(finalDistribution.replicaNodeIds).sort(),
    },
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
