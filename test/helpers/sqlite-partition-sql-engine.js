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

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {
  resolveDeclaredPartitionKeyType,
} from '../../src/partition/partition-boundary-representation.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  createCanonicalSystemCache,
  tableRowFromDdl,
} from '../test-helpers/canonical-system-metadata-seed.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
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
  const primaryKeyList = Array.isArray(table.primaryKey) ?
    table.primaryKey :
    [table.primaryKey];
  const tableRow = tableRowFromDdl(table);
  const defaultPartitionKeyType =
    resolveDeclaredPartitionKeyType(tableRow, primaryKeyList) || 'TEXT';
  const partitionRows = partitions.map((partition) => ({
    partition_version: 1,
    state: 'NORMAL',
    partition_key_type: defaultPartitionKeyType,
    ...partition,
    table_id: table.name,
    table_name: table.name,
    leader_node_id: FIXTURE_NODE,
  }));
  return createCanonicalSystemCache({
    [TABLES.TABLES]: [tableRow],
    [TABLES.PARTITIONS]: partitionRows,
    [TABLES.SERVICES]: partitionRows.map((partitionRow) => ({
      service_id: partitionRow.partition_id,
      service_type: 'partition',
      partition_id: partitionRow.partition_id,
      node_id: FIXTURE_NODE,
      raft_role: 'leader',
      address: `${FIXTURE_NODE}/partition/${partitionRow.partition_id}`,
      status: 'active',
    })),
  });
}

function createPartitionRouter(databases, uncountedPartitions) {
  return {
    async deliver(address, message) {
      const partitionId = address.split('/')[ADDRESS_PARTITION_SEGMENT];
      if (message.type === QUERY_OPERATION.TRANSACTION) {
        return buildDeliveryEnvelope({acknowledged: true},
          answerParticipantTransactionRequest(message, partitionId));
      }
      const database = databases.get(partitionId);
      if (message.type !== QUERY_MESSAGE || !database) {
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      }
      const prepared = database.prepare(message.sql);
      const params = message.params || [];
      if (SQL_READ_PATTERN.test(message.sql)) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: prepared.all(...params),
        });
      }
      const {changes} = prepared.run(...params);
      return uncountedPartitions.has(partitionId) ?
        buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: []}) :
        buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: [], changes});
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
  const gateway = createTransactionPersistenceGateway();
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createSystemCache(table, partitions),
    controlPlaneSystemTableGateway: gateway,
    messageRouter: createPartitionRouter(
      databases,
      new Set(uncountedPartitions),
    ),
  });
  return {
    engine,
    databases,
    close() {
      gateway.db.close();
      for (const database of databases.values()) database.close();
    },
  };
}

export {createSqlitePartitionSqlEngine};
