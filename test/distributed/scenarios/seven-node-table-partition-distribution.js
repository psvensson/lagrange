/**
 * Scenario: Seven-Node Table Partition Distribution
 *
 * Verifies a target table grows by multiple partitions and replicas spread
 * over most nodes in a seven-node cluster.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveSevenNodeTablePartitionDistributionScenarioConfig,
} from '../harness/scenario-config.js';
import {
  waitForPartitionGrowthAndSpread,
} from './table-distribution-helpers.js';

const LOAD_OPERATION_INSERT = 'INSERT';
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
 * Run the seven-node table partition distribution scenario.
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const {
    expectedNodeCount,
    loadOpsPerSec,
    loadDuration,
    tableName,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
    distributionTimeoutMs,
    distributionPollIntervalMs,
    minSuccessRate,
  } = resolveSevenNodeTablePartitionDistributionScenarioConfig(options);

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
    operations: [LOAD_OPERATION_INSERT],
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
  } finally {
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
  }

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Write success rate below threshold: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  await cluster.assertConsistency();

  return {
    expectedNodeCount,
    tableName,
    convergenceTiming: convergence,
    distribution,
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
