/**
 * Scenario: Three-Node Seed Rebalance
 *
 * Verifies that after cluster startup with at least three nodes,
 * at least one partition has replicas on both the seed node and a
 * non-seed node.
 */
// @ts-nocheck


import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveThreeNodeSeedRebalanceScenarioConfig,
} from '../harness/scenario-config.js';

const MIN_NODE_COUNT = 3;
const MIN_NON_SEED_COUNT = 2;
const MIN_REBALANCED_PARTITIONS = 1;
const PARTITION_SERVICE_TYPE = 'partition';
const MESSAGE_GROUP_SERVICE_TYPE = 'message_group';
const ACTIVE_STATUS = 'active';
const REBALANCE_SETTLE_TIMEOUT_MS = 120000;
const REBALANCE_SAMPLE_LIMIT = 10;
const QUERYABLE_NODE_ERROR_LIMIT = 5;

const SQL_SELECT_ACTIVE_PARTITION_SERVICES =
  'SELECT partition_id, node_id, status FROM services ' +
  'WHERE service_type = \'' + PARTITION_SERVICE_TYPE + '\' ' +
  'AND status = \'' + ACTIVE_STATUS + '\'';
const SQL_SELECT_ACTIVE_MESSAGE_GROUP_SERVICES =
  'SELECT group_id, node_id, status FROM services ' +
  'WHERE service_type = \'' + MESSAGE_GROUP_SERVICE_TYPE + '\' ' +
  'AND status = \'' + ACTIVE_STATUS + '\'';

/**
 * Build partition placement map from services rows.
 *
 * @param {Array<Object>} rows
 * @return {Map<string, Set<string>>}
 */
function buildPlacementByEntity(rows, entityField) {
  const byEntity = new Map();
  for (const row of rows) {
    const entityId = row[entityField];
    const nodeId = row.node_id;
    if (typeof entityId !== 'string' || entityId.length === 0) {
      continue;
    }
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      continue;
    }
    if (!byEntity.has(entityId)) {
      byEntity.set(entityId, new Set());
    }
    byEntity.get(entityId).add(nodeId);
  }
  return byEntity;
}

/**
 * Identify partitions that include both seed and non-seed replicas.
 *
 * @param {Map<string, Set<string>>} placementByPartition
 * @param {string} seedNodeId
 * @param {Set<string>} nonSeedNodeIds
 * @return {Array<string>}
 */
function findRebalancedEntities(
  placementByEntity,
  seedNodeId,
  nonSeedNodeIds,
) {
  const rebalancedEntities = [];
  for (const [entityId, nodeIds] of placementByEntity.entries()) {
    const hasSeedReplica = nodeIds.has(seedNodeId);
    const hasNonSeedReplica = Array.from(nodeIds).some(
      (nodeId) => nonSeedNodeIds.has(nodeId),
    );
    if (hasSeedReplica && hasNonSeedReplica) {
      rebalancedEntities.push(entityId);
    }
  }
  return rebalancedEntities;
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
 * Query active partition services from all queryable nodes and merge rows.
 * Some deployments expose node-local service projections per admin endpoint,
 * so a single-node query can miss non-local replica placements.
 *
 * @param {Array<Object>} nodes
 * @param {string} sql
 * @param {Object} [options]
 * @param {boolean} [options.allowEmpty]
 * @return {Promise<Array<Object>>}
 */
async function queryActiveServicesAcrossNodes(nodes, sql, options = {}) {
  const allowEmpty = options.allowEmpty === true;
  const mergedRows = [];
  const queryErrors = [];

  for (const node of nodes) {
    if (!node || typeof node.query !== 'function') {
      continue;
    }
    try {
      const servicesResult = await node.query(sql);
      const rows = Array.isArray(servicesResult?.rows) ?
        servicesResult.rows :
        [];
      mergedRows.push(...rows);
    } catch (error) {
      queryErrors.push(
        String(node.id || 'unknown-node') + ': ' +
        String(error?.message || error),
      );
    }
  }

  if (mergedRows.length > 0 || allowEmpty) {
    return mergedRows;
  }

  const summarizedErrors = queryErrors.slice(
    0,
    QUERYABLE_NODE_ERROR_LIMIT,
  ).join('; ');
  throw new Error(
    'Unable to query active partition services from any node' +
    (summarizedErrors.length > 0 ? ': ' + summarizedErrors : ''),
  );
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

  const {
    rebalanceWaitTimeoutMs,
    rebalancePollIntervalMs,
  } = resolveThreeNodeSeedRebalanceScenarioConfig(options);

  const rebalanceDeadline = Date.now() + rebalanceWaitTimeoutMs;
  let rebalancedPartitions = [];
  let partitionServiceRows = [];
  let messageGroupServiceRows = [];
  let rebalancedMessageGroups = [];
  let rebalanceQueryCount = 0;

  while (Date.now() <= rebalanceDeadline) {
    rebalanceQueryCount += 1;
    partitionServiceRows = await queryActiveServicesAcrossNodes(
      nodes,
      SQL_SELECT_ACTIVE_PARTITION_SERVICES,
    );
    assert.ok(
      partitionServiceRows.length > 0,
      'Expected active partition service rows',
    );
    messageGroupServiceRows = await queryActiveServicesAcrossNodes(
      nodes,
      SQL_SELECT_ACTIVE_MESSAGE_GROUP_SERVICES,
      {allowEmpty: true},
    );

    const placementByPartition = buildPlacementByEntity(
      partitionServiceRows,
      'partition_id',
    );
    rebalancedPartitions = findRebalancedEntities(
      placementByPartition,
      seedNode.id,
      nonSeedNodeIds,
    );
    const placementByMessageGroup = buildPlacementByEntity(
      messageGroupServiceRows,
      'group_id',
    );
    rebalancedMessageGroups = findRebalancedEntities(
      placementByMessageGroup,
      seedNode.id,
      nonSeedNodeIds,
    );

    if (rebalancedPartitions.length >= MIN_REBALANCED_PARTITIONS ||
      rebalancedMessageGroups.length >= MIN_REBALANCED_PARTITIONS) {
      break;
    }

    if (Date.now() >= rebalanceDeadline) {
      break;
    }

    await sleep(rebalancePollIntervalMs);
  }

  assert.ok(
    rebalancedPartitions.length >= MIN_REBALANCED_PARTITIONS ||
      rebalancedMessageGroups.length >= MIN_REBALANCED_PARTITIONS,
    'Expected at least one partition or message-group rebalance off seed node ' +
    seedNode.id +
    ', found partitions=' + rebalancedPartitions.length +
    ', message_groups=' + rebalancedMessageGroups.length +
    ' after ' + rebalanceQueryCount + ' placement query attempts',
  );

  return {
    seedNodeId: seedNode.id,
    totalNodes: nodes.length,
    activePartitionReplicaRows: partitionServiceRows.length,
    activeMessageGroupReplicaRows: messageGroupServiceRows.length,
    rebalancedPartitionCount: rebalancedPartitions.length,
    rebalancedPartitionSample: rebalancedPartitions.slice(
      0,
      REBALANCE_SAMPLE_LIMIT,
    ),
    rebalancedMessageGroupCount: rebalancedMessageGroups.length,
    rebalancedMessageGroupSample: rebalancedMessageGroups.slice(
      0,
      REBALANCE_SAMPLE_LIMIT,
    ),
    rebalanceQueryCount,
    convergence,
  };
}

export {run};
