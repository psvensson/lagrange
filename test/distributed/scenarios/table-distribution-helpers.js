/**
 * Shared helpers for distributed scenarios that validate table partition
 * growth and replica spread.
 */

import assert from 'node:assert/strict';

const TABLE_NAME_LOGS = 'logs';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const ZERO = 0;

const SQL_SELECT_TABLE_PARTITIONS_PREFIX =
  'SELECT partition_id FROM partitions WHERE table_name = \'';
const SQL_SELECT_TABLE_PARTITIONS_SUFFIX = '\'';
const SQL_SELECT_ACTIVE_PARTITION_SERVICES =
  'SELECT partition_id, node_id, status FROM services ' +
  'WHERE service_type = \'' + SERVICE_TYPE_PARTITION + '\' ' +
  'AND status = \'' + STATUS_ACTIVE + '\'';

const DEFAULT_WAIT_TIMEOUT_MS = 90000;
const DEFAULT_WAIT_POLL_INTERVAL_MS = 250;
const DEFAULT_MIN_ADDITIONAL_PARTITIONS = 2;
const DEFAULT_MIN_DISTINCT_REPLICA_NODES = 6;

/**
 * Sleep helper for polling loops.
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Normalize SQL query results into a rows array.
 * @param {*} result
 * @return {Array<Object>}
 */
function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

/**
 * Escape single quotes for SQL string literals.
 * @param {string} value
 * @return {string}
 */
function escapeSql(value) {
  return String(value).replace(/'/g, '\'\'');
}

/**
 * Query the current partition + replica distribution for a single table.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @return {Promise<Object>}
 */
async function queryTableDistribution(seedNode, options = {}) {
  assert.ok(
    seedNode && typeof seedNode.query === 'function',
    'queryTableDistribution requires a seed node with query(sql)',
  );

  const tableName = typeof options.tableName === 'string' &&
    options.tableName.length > ZERO ?
    options.tableName :
    TABLE_NAME_LOGS;
  const partitionSql = SQL_SELECT_TABLE_PARTITIONS_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_PARTITIONS_SUFFIX;

  const [partitionResult, servicesResult] = await Promise.all([
    seedNode.query(partitionSql),
    seedNode.query(SQL_SELECT_ACTIVE_PARTITION_SERVICES),
  ]);

  const partitionRows = rowsFromResult(partitionResult);
  const serviceRows = rowsFromResult(servicesResult);

  const partitionIds = new Set();
  for (const row of partitionRows) {
    const partitionId = row?.partition_id;
    if (typeof partitionId !== 'string' || partitionId.length === ZERO) {
      continue;
    }
    partitionIds.add(partitionId);
  }

  const replicaNodeIds = new Set();
  const replicasByPartition = new Map();
  for (const row of serviceRows) {
    const partitionId = row?.partition_id;
    const nodeId = row?.node_id;
    if (!partitionIds.has(partitionId)) {
      continue;
    }
    if (typeof nodeId !== 'string' || nodeId.length === ZERO) {
      continue;
    }
    replicaNodeIds.add(nodeId);
    if (!replicasByPartition.has(partitionId)) {
      replicasByPartition.set(partitionId, new Set());
    }
    replicasByPartition.get(partitionId).add(nodeId);
  }

  return {
    tableName,
    partitionIds,
    partitionCount: partitionIds.size,
    replicaNodeIds,
    replicaNodeCount: replicaNodeIds.size,
    replicasByPartition,
  };
}

/**
 * Wait until a table has grown by additional partitions and its replicas are
 * spread across enough distinct nodes.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pollIntervalMs]
 * @param {number} [options.minAdditionalPartitions]
 * @param {number} [options.minDistinctReplicaNodes]
 * @return {Promise<Object>}
 */
async function waitForPartitionGrowthAndSpread(seedNode, options = {}) {
  const tableName = typeof options.tableName === 'string' &&
    options.tableName.length > ZERO ?
    options.tableName :
    TABLE_NAME_LOGS;
  const timeoutMs = Number.isFinite(options.timeoutMs) ?
    options.timeoutMs :
    DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) ?
    options.pollIntervalMs :
    DEFAULT_WAIT_POLL_INTERVAL_MS;
  const minAdditionalPartitions =
    Number.isFinite(options.minAdditionalPartitions) ?
      options.minAdditionalPartitions :
      DEFAULT_MIN_ADDITIONAL_PARTITIONS;
  const minDistinctReplicaNodes =
    Number.isFinite(options.minDistinctReplicaNodes) ?
      options.minDistinctReplicaNodes :
      DEFAULT_MIN_DISTINCT_REPLICA_NODES;

  const baseline = await queryTableDistribution(seedNode, {tableName});
  assert.ok(
    baseline.partitionCount > ZERO,
    'No partitions found for table "' + tableName + '"',
  );

  const baselinePartitionIds = new Set(baseline.partitionIds);
  const additionalPartitionIds = new Set();
  const deadline = Date.now() + timeoutMs;

  let latest = baseline;
  let sampleCount = 1;

  while (Date.now() <= deadline) {
    latest = await queryTableDistribution(seedNode, {tableName});
    sampleCount += 1;

    for (const partitionId of latest.partitionIds) {
      if (baselinePartitionIds.has(partitionId)) {
        continue;
      }
      additionalPartitionIds.add(partitionId);
    }

    const growthSatisfied =
      additionalPartitionIds.size >= minAdditionalPartitions;
    const spreadSatisfied =
      latest.replicaNodeCount >= minDistinctReplicaNodes;
    if (growthSatisfied && spreadSatisfied) {
      return {
        tableName,
        sampleCount,
        baselinePartitionCount: baseline.partitionCount,
        currentPartitionCount: latest.partitionCount,
        additionalPartitionCount: additionalPartitionIds.size,
        additionalPartitionIds: Array.from(additionalPartitionIds).sort(),
        replicaNodeCount: latest.replicaNodeCount,
        replicaNodeIds: Array.from(latest.replicaNodeIds).sort(),
      };
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    'Timed out waiting for table "' + tableName + '" to add at least ' +
    minAdditionalPartitions + ' partitions and spread replicas to at least ' +
    minDistinctReplicaNodes + ' nodes. Baseline=' +
    baseline.partitionCount + ', latest=' + latest.partitionCount +
    ', additionalSeen=' + additionalPartitionIds.size +
    ', spread=' + latest.replicaNodeCount + ', samples=' + sampleCount,
  );
}

export {
  TABLE_NAME_LOGS,
  sleep,
  rowsFromResult,
  queryTableDistribution,
  waitForPartitionGrowthAndSpread,
};
