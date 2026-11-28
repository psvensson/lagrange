import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {clearMemoryReservations} from '../../src/partition/partition-locking-read-reservation.js';
import {
  buildSchemaDefinition,
  derivePartitionKey,
} from '../../src/query/table-creation-service-schema-derivation.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';

function createMockMessageRouter(mockPartitionData) {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: data,
          changes: 1,
        });
      }
      // A participant answers the transaction protocol (TX1 design 2.2): a
      // PREPARE names its state and digest, a COMMIT its outcome.
      if (message.type === 'TRANSACTION') {
        return buildDeliveryEnvelope({acknowledged: true},
          answerParticipantTransactionRequest(message));
      }
      return buildDeliveryEnvelope({acknowledged: true}, {success: true, changes: 1});
    },
  };
}

function resolveFixtureTableColumns(table, primaryKeyList, partitionKeyType) {
  if (Array.isArray(table.columns) && table.columns.length > 0) return table.columns;
  return primaryKeyList.map((name) => ({
    name,
    type: partitionKeyType,
    primaryKey: true,
    notNull: true,
  }));
}

function resolveFixtureSchemaDefinition(table, tableName, primaryKeyList, partitionKeyType) {
  if (table.schema_definition) return table.schema_definition;
  if (table.schema) return JSON.stringify(table.schema);
  const canonicalSchema = buildSchemaDefinition(
    resolveFixtureTableColumns(table, primaryKeyList, partitionKeyType),
    table.tableConstraints || [],
    primaryKeyList,
  );
  return JSON.stringify({...canonicalSchema, tableName});
}

function buildCanonicalFixtureTableRow(table) {
  const tableName = table.table_name || table.tableName || table.table_id;
  const tableId = table.table_id || table.tableId || tableName;
  const rawPrimaryKey = table.primaryKey || table.primary_key || table.partition_key || 'id';
  const primaryKeyList = Array.isArray(rawPrimaryKey) ? rawPrimaryKey : [rawPrimaryKey];
  const partitionKey = table.partition_key || derivePartitionKey(primaryKeyList);
  const partitionKeyType = table.partition_key_type || table.partitionKeyType || 'TEXT';
  return {
    table_id: tableId,
    table_name: tableName,
    primary_key: partitionKey,
    primaryKey: rawPrimaryKey,
    partition_key: partitionKey,
    partition_key_type: partitionKeyType,
    active_partition_version: 1,
    schema_definition: resolveFixtureSchemaDefinition(
      table, tableName, primaryKeyList, partitionKeyType,
    ),
    ...table,
  };
}

function findOwnerTableForPartition(normalizedTables, partition) {
  const targetName = partition.table_name || partition.tableName;
  const targetId = partition.table_id || partition.tableId;
  return normalizedTables.find(
    (t) => t.table_name === targetName || t.table_id === targetId,
  );
}

function resolvePartitionTableIdentity(partition, ownerTable) {
  const tableName = partition.table_name || partition.tableName || ownerTable?.table_name || null;
  const tableId = partition.table_id || partition.tableId || ownerTable?.table_id || tableName;
  return {tableName, tableId};
}

function buildCanonicalFixturePartitionRow(partition, ownerTable) {
  const {tableName, tableId} = resolvePartitionTableIdentity(partition, ownerTable);
  const leaderNodeId = partition.leader_node_id || partition.leaderNodeId || 'test-node';
  return {
    partition_key_type: ownerTable?.partition_key_type || 'TEXT',
    partition_version: 1,
    state: 'NORMAL',
    ...partition,
    table_id: tableId,
    table_name: tableName,
    leader_node_id: leaderNodeId,
  };
}

/**
 * Create a canonical SystemTableCache populated with tables, partitions, and
 * active partition leader service rows for transaction routing tests.
 */
function createMockSystemCache(tables = [], partitions = []) {
  clearMemoryReservations();
  const cache = new SystemTableCache();
  const normalizedTables = tables.map(buildCanonicalFixtureTableRow);
  for (const tableRow of normalizedTables) {
    cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATION.INSERT, tableRow);
  }
  for (const partition of partitions) {
    const ownerTable = findOwnerTableForPartition(normalizedTables, partition);
    const partitionRow = buildCanonicalFixturePartitionRow(partition, ownerTable);
    const leaderNodeId = partitionRow.leader_node_id;
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, partitionRow);
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      service_id: partitionRow.partition_id,
      service_type: 'partition',
      partition_id: partitionRow.partition_id,
      node_id: leaderNodeId,
      address: `${leaderNodeId}/partition/${partitionRow.partition_id}`,
      status: 'active',
      raft_role: 'leader',
    });
  }
  return cache;
}

export {createMockMessageRouter, createMockSystemCache};
