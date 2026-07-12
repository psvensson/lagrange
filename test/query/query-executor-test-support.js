/**
 * Shared test support for the QueryExecutor suites.
 *
 * Extracted verbatim from query-executor.test.js so the parent suite and its
 * re-enabled concern suites share one copy of the partition-routing mocks
 * instead of duplicating the helper bodies in every file.
 *
 * The mock message router EXECUTES the delivered SQL against a real
 * in-memory SQLite database seeded from mockPartitionData — mirroring
 * partition-service-write-metrics-base executeQuery
 * (`db.prepare(sql).all(...params)`). A mock that ignores the SQL and
 * returns raw rows hides pushdown/merge defects (the distributed
 * aggregate bug shipped green behind exactly that mock).
 */

import Database from 'better-sqlite3';
import {SQLParser} from '../../src/query/sql-parser.js';
import {AST_TYPE, EXPR_TYPE} from '../../src/query/parser-constants.js';

// Mock partition data storage shared by the mock message router and the suites.
export const mockPartitionData = new Map();

function collectColumnRefs(node, into) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((entry) => collectColumnRefs(entry, into));
    return;
  }
  if (node.type === EXPR_TYPE.COLUMN_REF && node.column) {
    into.add(node.column);
  }
  for (const value of Object.values(node)) {
    collectColumnRefs(value, into);
  }
}

function bindableValue(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value === undefined) {
    return null;
  }
  return value;
}

/**
 * Execute the delivered SQL over the partition's mock rows through a
 * real SQLite database, so the mock behaves like a partition replica.
 * @param {string} sql - Delivered partition SQL.
 * @param {Array} params - Delivered positional parameters.
 * @param {Array<Object>} data - Mock rows for the partition.
 * @return {Array<Object>} Result rows.
 */
function executeSqlOverMockRows(sql, params, data) {
  const ast = new SQLParser(sql).parse();
  if (ast.type !== AST_TYPE.SELECT) {
    // Writes keep the legacy mock contract (rows echoed back); only
    // SELECT fan-out fidelity is load-bearing for merge semantics.
    return data;
  }
  const tableName = ast.from?.name;
  const columns = new Set();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  collectColumnRefs(ast, columns);
  if (columns.size === 0) {
    columns.add('id');
  }

  const db = new Database(':memory:');
  const columnList = [...columns];
  db.exec(
    `CREATE TABLE ${tableName} (${columnList.map((c) => `"${c}"`).join(', ')})`,
  );
  const insert = db.prepare(
    `INSERT INTO ${tableName} (${columnList.map((c) => `"${c}"`).join(', ')})` +
      ` VALUES (${columnList.map(() => '?').join(', ')})`,
  );
  for (const row of data) {
    insert.run(...columnList.map((column) => bindableValue(row[column])));
  }
  const rows = db
    .prepare(sql)
    .all(...(params || []).map((value) => bindableValue(value)));
  db.close();
  return rows;
}

// Mock message router that routes queries to mock partition data
export function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/partitionId)
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        const rows = executeSqlOverMockRows(
          message.sql,
          message.params,
          data,
        );
        return {
          acknowledged: true,
          success: true,
          rows,
          changes: rows.length || 1,
        };
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };
}

// Mock system cache with services for routing
export function createMockSystemCache(partitionIds) {
  const services = partitionIds.map((pid) => ({
    service_id: pid,
    service_type: 'partition',
    partition_id: pid,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${pid}`,
    status: 'active',
  }));
  const partitions = partitionIds.map((partitionId) => ({
    partition_id: partitionId,
    leader_node_id: 'test-node',
  }));

  return {
    services,
    partitions,
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
}

// Helper to parse SQL
export function parseSQL(sql) {
  const parser = new SQLParser(sql);
  return parser.parse();
}
