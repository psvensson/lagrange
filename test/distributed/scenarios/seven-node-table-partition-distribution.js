/**
 * Scenario: Seven-Node Table Partition Distribution
 *
 * Verifies a target table grows by multiple partitions and replicas spread
 * over most nodes in a seven-node cluster.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  TABLE_NAME_LOGS,
  waitForPartitionGrowthAndSpread,
} from './table-distribution-helpers.js';

const EXPECTED_NODE_COUNT = 7;
const DEFAULT_LOAD_OPS_PER_SEC = 120;
const DEFAULT_LOAD_DURATION = '120s';
const LOAD_OPERATION_INSERT = 'INSERT';

const DEFAULT_MIN_ADDITIONAL_PARTITIONS = 2;
const DEFAULT_MIN_DISTINCT_REPLICA_NODES = 6;
const DEFAULT_DISTRIBUTION_TIMEOUT_MS = 90000;
const DEFAULT_DISTRIBUTION_POLL_INTERVAL_MS = 250;
const DEFAULT_MIN_SUCCESS_RATE = 0.5;
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
  const expectedNodeCount = Number.isFinite(options.expectedNodeCount) ?
    options.expectedNodeCount :
    EXPECTED_NODE_COUNT;
  const loadOpsPerSec = Number.isFinite(options.loadOpsPerSec) ?
    options.loadOpsPerSec :
    DEFAULT_LOAD_OPS_PER_SEC;
  const loadDuration = typeof options.loadDuration === 'string' ?
    options.loadDuration :
    DEFAULT_LOAD_DURATION;
  const tableName = typeof options.tableName === 'string' &&
    options.tableName.length > ZERO ?
    options.tableName :
    TABLE_NAME_LOGS;
  const minAdditionalPartitions =
    Number.isFinite(options.minAdditionalPartitions) ?
      options.minAdditionalPartitions :
      DEFAULT_MIN_ADDITIONAL_PARTITIONS;
  const minDistinctReplicaNodes =
    Number.isFinite(options.minDistinctReplicaNodes) ?
      options.minDistinctReplicaNodes :
      DEFAULT_MIN_DISTINCT_REPLICA_NODES;
  const distributionTimeoutMs =
    Number.isFinite(options.distributionTimeoutMs) ?
      options.distributionTimeoutMs :
      DEFAULT_DISTRIBUTION_TIMEOUT_MS;
  const distributionPollIntervalMs =
    Number.isFinite(options.distributionPollIntervalMs) ?
      options.distributionPollIntervalMs :
      DEFAULT_DISTRIBUTION_POLL_INTERVAL_MS;
  const minSuccessRate = Number.isFinite(options.minSuccessRate) ?
    options.minSuccessRate :
    DEFAULT_MIN_SUCCESS_RATE;

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
