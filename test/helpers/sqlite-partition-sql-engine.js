/**
 * The real SQL engine (SqlCore: parse, route, the write coordinator and its
 * result aggregation) over a fixture partition hop: each partition of one
 * table is a better-sqlite3 database that answers the partition's own reply
 * shape - `{acknowledged, success, rows}` for reads and
 * `{acknowledged, success, rows: [], changes}` for writes (the partition
 * apply's `.run()` count). Everything above the partition reply is the
 * production engine, so a result read from it has the shape the engine
 * really produces.
 */

import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

const FIXTURE_NODE = 'sqlite-partition-node';
const QUERY_MESSAGE = 'QUERY';
const SQL_READ_PATTERN = /^\s*(SELECT|WITH|PRAGMA)\b/iu;
const ADDRESS_PARTITION_SEGMENT = 2;

function ensureConfiguration() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize();
  }
}

function createSystemCache(table, partitions) {
  const tables = [{table_name: table.name, primaryKey: table.primaryKey}];
  const partitionRows = partitions.map((partition) => ({
    ...partition,
    table_name: table.name,
    leader_node_id: FIXTURE_NODE,
  }));
  const services = partitionRows.map((partition) => ({
    service_id: partition.partition_id,
    service_type: 'partition',
    partition_id: partition.partition_id,
    node_id: FIXTURE_NODE,
    raft_role: 'leader',
    address: `${FIXTURE_NODE}/partition/${partition.partition_id}`,
    status: 'active',
  }));
  const byType = {partitions: partitionRows, services, tables};
  return {
    get(type, key) {
      return type === 'tables' ?
        tables.find((entry) => entry.table_name === key) :
        null;
    },
    filter(type, predicate) {
      return (byType[type] || []).filter(predicate);
    },
    getAll(type) {
      return byType[type] || [];
    },
  };
}

function createPartitionRouter(databases, uncountedPartitions) {
  return {
    async deliver(address, message) {
      const database = databases.get(
        address.split('/')[ADDRESS_PARTITION_SEGMENT]);
      if (message.type !== QUERY_MESSAGE || !database) {
        return {acknowledged: true, success: true};
      }
      const prepared = database.prepare(message.sql);
      const params = message.params || [];
      if (SQL_READ_PATTERN.test(message.sql)) {
        return {acknowledged: true, success: true, rows: prepared.all(...params)};
      }
      const {changes} = prepared.run(...params);
      const partitionId = address.split('/')[ADDRESS_PARTITION_SEGMENT];
      return uncountedPartitions.has(partitionId) ?
        {acknowledged: true, success: true, rows: []} :
        {acknowledged: true, success: true, rows: [], changes};
    },
  };
}

/**
 * @param {object} options
 * @param {{name: string, primaryKey: string, ddl: string}} options.table -
 *   The one table, its key column and the DDL each partition database runs.
 * @param {object[]} options.partitions - Partition rows
 *   ({partition_id, partition_key_start, partition_key_end}).
 * @param {string[]} [options.uncountedPartitions] - Partitions whose write
 *   answers carry no `changes` count (the write still applies).
 * @return {{engine: SQLQueryEngine, databases: Map, close: Function}} The
 *   engine, each partition's database by partition id, and the release of
 *   every partition database.
 */
function createSqlitePartitionSqlEngine({
  table,
  partitions,
  uncountedPartitions = [],
}) {
  ensureConfiguration();
  const databases = new Map(partitions.map((partition) => {
    const database = new Database(':memory:');
    database.exec(table.ddl);
    return [partition.partition_id, database];
  }));
  const engine = new SQLQueryEngine({
    systemCache: createSystemCache(table, partitions),
    messageRouter: createPartitionRouter(
      databases,
      new Set(uncountedPartitions),
    ),
  });
  return {
    engine,
    databases,
    close() {
      for (const database of databases.values()) database.close();
    },
  };
}

export {createSqlitePartitionSqlEngine};
