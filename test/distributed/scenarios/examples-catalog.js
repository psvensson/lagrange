/**
 * Distributed scenario that executes the shared examples catalog
 * runner against a live cluster.
 */

import assert from 'node:assert/strict';
import {join, resolve} from 'node:path';
import {runExamplesCatalog} from '../../../scripts/examples/build-upload-run.js';
import {escapeSql, rowsFromResult} from './table-distribution-helpers.js';

const SCENARIO_OUTPUT_SUBDIR = 'examples';
const DEFAULT_EXPECTED_NODE_COUNT = 7;
const DEFAULT_BASELINE_REPLICATION_FACTOR = 3;
const ZERO = 0;
const TABLE_NAME_REGEX = /\bfrom\s+([A-Za-z_][A-Za-z0-9_]*)/i;
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const SQL_SELECT_TABLE_PARTITIONS_PREFIX =
  'SELECT partition_id FROM partitions WHERE table_name = \'';
const SQL_SELECT_TABLE_PARTITIONS_SUFFIX = '\'';
const SQL_SELECT_TABLE_ID_PREFIX =
  'SELECT table_id FROM tables WHERE table_name = \'';
const SQL_SELECT_TABLE_ID_SUFFIX = '\'';
const SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX =
  'SELECT partition_id FROM partitions WHERE table_id = \'';
const SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX = '\'';
const SQL_SELECT_ACTIVE_PARTITION_SERVICES =
  'SELECT partition_id, node_id, status FROM services ' +
  'WHERE service_type = \'' + SERVICE_TYPE_PARTITION + '\' ' +
  'AND status = \'' + STATUS_ACTIVE + '\'';

function buildOutputPath(cluster) {
  const outputRoot = cluster?._config?.outputDir || 'test-output';
  const runId = `examples-catalog-${Date.now()}`;
  return resolve(join(outputRoot, SCENARIO_OUTPUT_SUBDIR, `${runId}.json`));
}

function resolveScenarioConfig(cluster) {
  const overrides = cluster?._scenarioOverrides?.examplesCatalog || {};
  const expectedNodeCount = Number.isInteger(overrides.expectedNodeCount) ?
    overrides.expectedNodeCount :
    (Number.isInteger(cluster?._config?.size) ?
      cluster._config.size :
      DEFAULT_EXPECTED_NODE_COUNT);
  const baselineReplicationFactor =
    Number.isInteger(overrides.baselineReplicationFactor) ?
      overrides.baselineReplicationFactor :
      (Number.isInteger(cluster?._config?.benchmark?.replicationFactor) ?
        cluster._config.benchmark.replicationFactor :
        DEFAULT_BASELINE_REPLICATION_FACTOR);
  const localReplicaRouting = overrides.localReplicaRouting !== false;
  return {
    expectedNodeCount,
    baselineReplicationFactor,
    localReplicaRouting,
  };
}

function parseTableName(statement) {
  const text = String(statement || '');
  const match = TABLE_NAME_REGEX.exec(text);
  return match ? match[1] : null;
}

async function queryActivePartitionServicesAcrossNodes(nodes) {
  const mergedRows = [];
  for (const node of nodes) {
    if (!node || typeof node.query !== 'function') {
      continue;
    }
    try {
      const result = await node.query(SQL_SELECT_ACTIVE_PARTITION_SERVICES);
      mergedRows.push(...rowsFromResult(result));
    } catch (_error) {
      // Best-effort: fall back to whatever we can collect.
    }
  }
  return mergedRows;
}

async function resolveTablePartitionIds(seedNode, tableName) {
  if (!tableName) {
    return [];
  }
  const partitionSql = SQL_SELECT_TABLE_PARTITIONS_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_PARTITIONS_SUFFIX;
  const tableIdSql = SQL_SELECT_TABLE_ID_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_ID_SUFFIX;
  const partitionResult = await seedNode.query(partitionSql);
  let partitionRows = rowsFromResult(partitionResult);
  if (partitionRows.length === ZERO) {
    const tableResult = await seedNode.query(tableIdSql);
    const tableRows = rowsFromResult(tableResult);
    const tableId = tableRows.find((row) =>
      typeof row?.table_id === 'string' && row.table_id.length > ZERO,
    )?.table_id || null;
    if (tableId) {
      const partitionByIdSql = SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX +
        escapeSql(tableId) +
        SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX;
      const partitionByIdResult = await seedNode.query(partitionByIdSql);
      partitionRows = rowsFromResult(partitionByIdResult);
    }
  }

  return partitionRows
    .map((row) => row?.partition_id)
    .filter((partitionId) =>
      typeof partitionId === 'string' && partitionId.length > ZERO,
    );
}

async function resolveLocalReplicaNodes(nodes, seedNode, tableName) {
  const partitionIds = await resolveTablePartitionIds(seedNode, tableName);
  if (partitionIds.length === ZERO) {
    return [];
  }
  const partitionSet = new Set(partitionIds);
  const serviceRows = await queryActivePartitionServicesAcrossNodes(nodes);
  const nodeIdSet = new Set();
  for (const row of serviceRows) {
    const partitionId = row?.partition_id;
    const nodeId = row?.node_id;
    if (!partitionSet.has(partitionId)) {
      continue;
    }
    if (typeof nodeId === 'string' && nodeId.length > ZERO) {
      nodeIdSet.add(nodeId);
    }
  }
  return nodes.filter((node) => nodeIdSet.has(node.id));
}

function createClusterClient(nodes, seedNode, options = {}) {
  const routingCache = new Map();
  const localReplicaRouting = options.localReplicaRouting === true;

  const pickNodeForTable = async (statement) => {
    if (!localReplicaRouting) {
      return seedNode;
    }
    const tableName = parseTableName(statement);
    if (!tableName) {
      return seedNode;
    }
    const cached = routingCache.get(tableName);
    if (cached && Array.isArray(cached.nodes) && cached.nodes.length > ZERO) {
      cached.cursor = (cached.cursor + 1) % cached.nodes.length;
      return cached.nodes[cached.cursor];
    }
    const replicaNodes = await resolveLocalReplicaNodes(
      nodes,
      seedNode,
      tableName,
    );
    if (replicaNodes.length === ZERO) {
      return seedNode;
    }
    routingCache.set(tableName, {
      nodes: replicaNodes,
      cursor: ZERO,
    });
    return replicaNodes[ZERO];
  };

  return {
    query: (sql, params) => seedNode.query(sql, params),
    partitionCallback: async (payload) => {
      const statement = payload?.statement || '';
      const preferredNode = await pickNodeForTable(statement);
      try {
        return await preferredNode.partitionCallback(payload);
      } catch (error) {
        if (preferredNode === seedNode) {
          throw error;
        }
        return seedNode.partitionCallback(payload);
      }
    },
  };
}

export async function run(cluster) {
  const nodes = cluster.getNodes();
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('examples-catalog requires at least one active node');
  }

  const scenarioConfig = resolveScenarioConfig(cluster);
  if (Number.isInteger(scenarioConfig.expectedNodeCount)) {
    assert.equal(
      nodes.length,
      scenarioConfig.expectedNodeCount,
      'Scenario requires ' + scenarioConfig.expectedNodeCount +
        ' nodes, got ' + nodes.length,
    );
  }
  const configuredBaselineReplicationFactor =
    cluster?._config?.benchmark?.replicationFactor;
  if (Number.isInteger(configuredBaselineReplicationFactor)) {
    assert.equal(
      configuredBaselineReplicationFactor,
      scenarioConfig.baselineReplicationFactor,
      'Scenario requires Postgres baseline replication factor ' +
        scenarioConfig.baselineReplicationFactor +
        ', got ' + configuredBaselineReplicationFactor,
    );
  }

  const seedNode = nodes[0];
  const outputPath = buildOutputPath(cluster);
  const artifact = await runExamplesCatalog({
    client: createClusterClient(nodes, seedNode, {
      localReplicaRouting: scenarioConfig.localReplicaRouting,
    }),
    outputPath,
    failOnRequired: true,
  });

  return {
    exampleResults: artifact.summary,
    artifactPath: artifact.artifactPath,
    examples: artifact.examples,
    expectedNodeCount: scenarioConfig.expectedNodeCount,
    baselineReplicationFactor: scenarioConfig.baselineReplicationFactor,
    localReplicaRouting: scenarioConfig.localReplicaRouting,
  };
}
