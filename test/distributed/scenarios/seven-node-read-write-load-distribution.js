/**
 * Scenario: Seven-Node Read/Write Load with Distribution
 *
 * Verifies a table remains broadly distributed while serving mixed read and
 * write traffic.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  TABLE_NAME_LOGS,
  sleep,
  queryTableDistribution,
  waitForPartitionGrowthAndSpread,
} from './table-distribution-helpers.js';

const EXPECTED_NODE_COUNT = 7;
const DEFAULT_LOAD_OPS_PER_SEC = 140;
const DEFAULT_LOAD_DURATION = '120s';
const LOAD_OPERATION_INSERT = 'INSERT';
const LOAD_OPERATION_SELECT = 'SELECT';
const LOAD_OPERATION_UPDATE = 'UPDATE';
const LOAD_OPERATION_DELETE = 'DELETE';
const DEFAULT_LOAD_OPERATIONS = Object.freeze([
  LOAD_OPERATION_INSERT,
  LOAD_OPERATION_SELECT,
  LOAD_OPERATION_UPDATE,
  LOAD_OPERATION_DELETE,
]);

const DEFAULT_MIN_ADDITIONAL_PARTITIONS = 2;
const DEFAULT_MIN_DISTINCT_REPLICA_NODES = 6;
const DEFAULT_DISTRIBUTION_TIMEOUT_MS = 90000;
const DEFAULT_DISTRIBUTION_POLL_INTERVAL_MS = 250;
const DEFAULT_POST_DISTRIBUTION_SOAK_MS = 3000;
const DEFAULT_MIN_SUCCESS_RATE = 0.75;
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
  const expectedNodeCount = Number.isFinite(options.expectedNodeCount) ?
    options.expectedNodeCount :
    EXPECTED_NODE_COUNT;
  const loadOpsPerSec = Number.isFinite(options.loadOpsPerSec) ?
    options.loadOpsPerSec :
    DEFAULT_LOAD_OPS_PER_SEC;
  const loadDuration = typeof options.loadDuration === 'string' ?
    options.loadDuration :
    DEFAULT_LOAD_DURATION;
  const loadOperations = Array.isArray(options.loadOperations) &&
    options.loadOperations.length > ZERO ?
    options.loadOperations :
    DEFAULT_LOAD_OPERATIONS;
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
  const postDistributionSoakMs =
    Number.isFinite(options.postDistributionSoakMs) ?
      options.postDistributionSoakMs :
      DEFAULT_POST_DISTRIBUTION_SOAK_MS;
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
