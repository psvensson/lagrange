/**
 * Scenario: Three-Node Seed Rebalance
 *
 * Verifies that after cluster startup with at least three nodes,
 * at least one partition has replicas on both the seed node and a
 * non-seed node.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const MIN_NODE_COUNT = 3;
const MIN_NON_SEED_COUNT = 2;
const MIN_REBALANCED_PARTITIONS = 1;
const PARTITION_SERVICE_TYPE = 'partition';
const ACTIVE_STATUS = 'active';
const REBALANCE_SETTLE_TIMEOUT_MS = 20000;
const REBALANCE_WAIT_TIMEOUT_MS = 20000;
const REBALANCE_POLL_INTERVAL_MS = CONVERGENCE_DEFAULTS.sampleIntervalMs;
const REBALANCE_SAMPLE_LIMIT = 10;

const SQL_SELECT_ACTIVE_PARTITION_SERVICES =
  'SELECT partition_id, node_id, status FROM services ' +
  'WHERE service_type = \'' + PARTITION_SERVICE_TYPE + '\' ' +
  'AND status = \'' + ACTIVE_STATUS + '\'';

/**
 * Build partition placement map from services rows.
 *
 * @param {Array<Object>} rows
 * @return {Map<string, Set<string>>}
 */
function buildPlacementByPartition(rows) {
  const byPartition = new Map();
  for (const row of rows) {
    const partitionId = row.partition_id;
    const nodeId = row.node_id;
    if (typeof partitionId !== 'string' || partitionId.length === 0) {
      continue;
    }
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      continue;
    }
    if (!byPartition.has(partitionId)) {
      byPartition.set(partitionId, new Set());
    }
    byPartition.get(partitionId).add(nodeId);
  }
  return byPartition;
}

/**
 * Identify partitions that include both seed and non-seed replicas.
 *
 * @param {Map<string, Set<string>>} placementByPartition
 * @param {string} seedNodeId
 * @param {Set<string>} nonSeedNodeIds
 * @return {Array<string>}
 */
function findRebalancedPartitions(
  placementByPartition,
  seedNodeId,
  nonSeedNodeIds,
) {
  const rebalancedPartitions = [];
  for (const [partitionId, nodeIds] of placementByPartition.entries()) {
    const hasSeedReplica = nodeIds.has(seedNodeId);
    const hasNonSeedReplica = Array.from(nodeIds).some(
      (nodeId) => nonSeedNodeIds.has(nodeId),
    );
    if (hasSeedReplica && hasNonSeedReplica) {
      rebalancedPartitions.push(partitionId);
    }
  }
  return rebalancedPartitions;
}

/**
 * Sleep helper for polling loops.
 *
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Run the three-node-seed-rebalance scenario.
 *
 * @param {Object} cluster
 * @param {Object} [options]
 * @param {number} [options.rebalanceWaitTimeoutMs]
 * @param {number} [options.rebalancePollIntervalMs]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const nodes = cluster.getNodes();
  assert.ok(
    nodes.length >= MIN_NODE_COUNT,
    'Scenario requires at least ' + MIN_NODE_COUNT +
    ' nodes, got ' + nodes.length,
  );

  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[0];
  assert.ok(seedNode, 'Seed node handle should be available');

  const nonSeedNodeIds = new Set(
    nodes
      .filter((node) => node.id !== seedNode.id)
      .map((node) => node.id),
  );
  assert.ok(
    nonSeedNodeIds.size >= MIN_NON_SEED_COUNT,
    'Scenario requires at least two non-seed nodes, got ' + nonSeedNodeIds.size,
  );

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: REBALANCE_SETTLE_TIMEOUT_MS,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  const rebalanceWaitTimeoutMs =
    Number.isFinite(options.rebalanceWaitTimeoutMs) ?
      options.rebalanceWaitTimeoutMs :
      REBALANCE_WAIT_TIMEOUT_MS;
  const rebalancePollIntervalMs =
    Number.isFinite(options.rebalancePollIntervalMs) ?
      options.rebalancePollIntervalMs :
      REBALANCE_POLL_INTERVAL_MS;

  const rebalanceDeadline = Date.now() + rebalanceWaitTimeoutMs;
  let rebalancedPartitions = [];
  let serviceRows = [];
  let rebalanceQueryCount = 0;

  while (Date.now() <= rebalanceDeadline) {
    rebalanceQueryCount += 1;
    const servicesResult = await seedNode.query(
      SQL_SELECT_ACTIVE_PARTITION_SERVICES,
    );
    serviceRows = Array.isArray(servicesResult.rows) ?
      servicesResult.rows :
      [];
    assert.ok(serviceRows.length > 0, 'Expected active partition service rows');

    const placementByPartition = buildPlacementByPartition(serviceRows);
    rebalancedPartitions = findRebalancedPartitions(
      placementByPartition,
      seedNode.id,
      nonSeedNodeIds,
    );

    if (rebalancedPartitions.length >= MIN_REBALANCED_PARTITIONS) {
      break;
    }

    if (Date.now() >= rebalanceDeadline) {
      break;
    }

    await sleep(rebalancePollIntervalMs);
  }

  assert.ok(
    rebalancedPartitions.length >= MIN_REBALANCED_PARTITIONS,
    'Expected at least one partition rebalanced off seed node ' +
    seedNode.id + ', found ' + rebalancedPartitions.length +
    ' after ' + rebalanceQueryCount + ' placement query attempts',
  );

  return {
    seedNodeId: seedNode.id,
    totalNodes: nodes.length,
    activePartitionReplicaRows: serviceRows.length,
    rebalancedPartitionCount: rebalancedPartitions.length,
    rebalancedPartitionSample: rebalancedPartitions.slice(
      0,
      REBALANCE_SAMPLE_LIMIT,
    ),
    rebalanceQueryCount,
    convergence,
  };
}

export {run};
