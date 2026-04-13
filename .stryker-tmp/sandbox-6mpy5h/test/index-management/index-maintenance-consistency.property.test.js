/**
 * Property-based test for Index Maintenance Consistency.
 * **Property 15: Index Maintenance Consistency**
 * **Validates: Requirements 13.2, 13.3, 13.5**
 *
 * Property: For any data change operation, all relevant indices should be
 * automatically updated to maintain consistency with the base table data.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PartitionService} from '../../src/partition/partition-service.js';
import {IndexService} from '../../src/index-management/index-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Generate a random partition ID.
 */
const partitionIdArbitrary = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `partition-${s}`);

/**
 * SQL reserved keywords to avoid in table/column names.
 */
const SQL_RESERVED_KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'as', 'asc', 'between', 'by', 'case', 'check',
  'column', 'constraint', 'create', 'cross', 'current', 'default', 'delete',
  'desc', 'distinct', 'drop', 'else', 'end', 'escape', 'except', 'exists',
  'for', 'foreign', 'from', 'full', 'group', 'having', 'if', 'in', 'index',
  'inner', 'insert', 'intersect', 'into', 'is', 'join', 'key', 'left', 'like',
  'limit', 'not', 'null', 'on', 'or', 'order', 'outer', 'primary', 'references',
  'right', 'select', 'set', 'table', 'then', 'to', 'union', 'unique', 'update',
  'using', 'values', 'when', 'where', 'with', 'value', 'name', 'id',
]);

/**
 * Generate a random table name.
 */
const tableNameArbitrary = fc.string({minLength: 3, maxLength: 15})
  .filter((s) => /^[a-z][a-z0-9_]*$/i.test(s))
  .filter((s) => !SQL_RESERVED_KEYWORDS.has(s.toLowerCase()))
  .map((s) => `tbl_${s}`);

/**
 * Generate a random column name for indexing.
 */
const columnNameArbitrary = fc.string({minLength: 3, maxLength: 15})
  .filter((s) => /^[a-z][a-z0-9_]*$/i.test(s))
  .filter((s) => !SQL_RESERVED_KEYWORDS.has(s.toLowerCase()))
  .map((s) => `col_${s}`);

/**
 * Generate random data for insert/update operations.
 */
const dataArbitrary = fc.record({
  id: fc.integer({min: 1, max: 10000}),
  col_data: fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\'')),
  col_num: fc.integer({min: 0, max: 1000000}),
});

/**
 * Create a partition with a schema that includes indexable columns.
 */
async function createTestPartition(partitionId, tableName) {
  const partition = new PartitionService({
    partitionId,
    tableId: tableName,
    tableName,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    dbPath: ':memory:',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'col_data', type: 'TEXT'},
        {name: 'col_num', type: 'INTEGER'},
      ],
    },
  });

  await partition.initialize();

  // Force leader role for testing
  partition.role = 'leader';
  partition.isLeader = true;

  return partition;
}

/**
 * Create an index on a partition.
 */
async function createIndexOnPartition(partition, indexName, columnName) {
  const sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${partition.tableName}(${columnName})`;
  await partition.executeQuery(sql, []);
}

/**
 * Query data using an index (via WHERE clause on indexed column).
 */
async function queryWithIndex(partition, columnName, value) {
  const sql = `SELECT * FROM ${partition.tableName} WHERE ${columnName} = ?`;
  const result = await partition.executeQuery(sql, [value]);
  return result.rows || [];
}

/**
 * Get all rows from a partition.
 */
async function _getAllRows(partition) {
  const sql = `SELECT * FROM ${partition.tableName}`;
  const result = await partition.executeQuery(sql, []);
  return result.rows || [];
}

/**
 * Feature: distributed-database-system
 * Property 15: Index consistency after INSERT operations
 *
 * For any INSERT operation, the index should be updated to include
 * the new data, allowing queries to find the inserted row via the index.
 * Validates: Requirement 13.3
 */
test('Property 15: Index consistency after INSERT operations', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableNameArbitrary,
      dataArbitrary,
      async (partitionId, tableName, data) => {
        const partition = await createTestPartition(partitionId, tableName);

        try {
          // Create an index on col_num column
          const indexName = `idx_${tableName}_col_num`;
          await createIndexOnPartition(partition, indexName, 'col_num');

          // Insert data
          await partition.insertData(tableName, data);

          // Query using the indexed column
          const results = await queryWithIndex(partition, 'col_num', data.col_num);

          // Verify the inserted row can be found via the index
          if (!results || results.length === 0) {
            return false;
          }

          // Verify the data matches
          const row = results[0];
          if (row.id !== data.id) {
            return false;
          }
          if (row.col_num !== data.col_num) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Index consistency maintained after INSERT operations');
});

/**
 * Property 15: Index consistency after UPDATE operations
 *
 * For any UPDATE operation, the index should be updated to reflect
 * the new values, allowing queries to find rows by new values.
 * Validates: Requirement 13.3
 */
test('Property 15: Index consistency after UPDATE operations', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableNameArbitrary,
      dataArbitrary,
      fc.integer({min: 1, max: 1000000}),
      async (partitionId, tableName, data, newValue) => {
        // Ensure newValue is different from original
        const updatedValue = newValue === data.col_num ? newValue + 1 : newValue;

        const partition = await createTestPartition(partitionId, tableName);

        try {
          // Create an index on col_num column
          const indexName = `idx_${tableName}_col_num`;
          await createIndexOnPartition(partition, indexName, 'col_num');

          // Insert initial data
          await partition.insertData(tableName, data);

          // Update the indexed column
          await partition.updateData(tableName, {id: data.id}, {col_num: updatedValue});

          // Query using the OLD value - should NOT find the row
          const oldResults = await queryWithIndex(partition, 'col_num', data.col_num);

          // Query using the NEW value - should find the row
          const newResults = await queryWithIndex(partition, 'col_num', updatedValue);

          // Old value should not find the row (unless old == new)
          if (data.col_num !== updatedValue && oldResults && oldResults.length > 0) {
            return false;
          }

          // New value should find the row
          if (!newResults || newResults.length === 0) {
            return false;
          }

          // Verify the updated data
          const row = newResults[0];
          if (row.id !== data.id) {
            return false;
          }
          if (row.col_num !== updatedValue) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Index consistency maintained after UPDATE operations');
});

/**
 * Property 15: Index consistency after DELETE operations
 *
 * For any DELETE operation, the index should be updated to remove
 * the deleted data, so queries no longer find the deleted row.
 * Validates: Requirement 13.3
 */
test('Property 15: Index consistency after DELETE operations', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableNameArbitrary,
      dataArbitrary,
      async (partitionId, tableName, data) => {
        const partition = await createTestPartition(partitionId, tableName);

        try {
          // Create an index on col_num column
          const indexName = `idx_${tableName}_col_num`;
          await createIndexOnPartition(partition, indexName, 'col_num');

          // Insert data
          await partition.insertData(tableName, data);

          // Verify data exists via index
          const beforeResults = await queryWithIndex(partition, 'col_num', data.col_num);
          if (!beforeResults || beforeResults.length === 0) {
            return false;
          }

          // Delete the data
          await partition.deleteData(tableName, {id: data.id});

          // Query using the indexed column - should NOT find the row
          const afterResults = await queryWithIndex(partition, 'col_num', data.col_num);

          // Deleted row should not be found
          if (afterResults && afterResults.length > 0) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Index consistency maintained after DELETE operations');
});

/**
 * Property 15: Multiple indices remain consistent
 *
 * When multiple indices exist on a table, all indices should be
 * updated consistently when data changes occur.
 * Validates: Requirements 13.3, 13.5
 */
test('Property 15: Multiple indices remain consistent', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableNameArbitrary,
      dataArbitrary,
      async (partitionId, tableName, data) => {
        const partition = await createTestPartition(partitionId, tableName);

        try {
          // Create indices on both col_data and col_num columns
          const indexName1 = `idx_${tableName}_col_data`;
          const indexName2 = `idx_${tableName}_col_num`;
          await createIndexOnPartition(partition, indexName1, 'col_data');
          await createIndexOnPartition(partition, indexName2, 'col_num');

          // Insert data
          await partition.insertData(tableName, data);

          // Query using both indices
          const results1 = await queryWithIndex(partition, 'col_data', data.col_data);
          const results2 = await queryWithIndex(partition, 'col_num', data.col_num);

          // Both indices should find the same row
          if (!results1 || results1.length === 0) {
            return false;
          }
          if (!results2 || results2.length === 0) {
            return false;
          }

          // Both should return the same row
          if (results1[0].id !== results2[0].id) {
            return false;
          }
          if (results1[0].id !== data.id) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Multiple indices remain consistent after data changes');
});

/**
 * Property 15: Index metadata stored in system (simulated)
 *
 * When an index is created, its metadata should be trackable.
 * This validates the IndexService's ability to track index metadata.
 * Validates: Requirement 13.2
 */
test('Property 15: Index metadata tracking', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableNameArbitrary,
      columnNameArbitrary,
      async (tableName, columnName) => {
        // Create an IndexService with a mock system table cache
        const indexService = new IndexService({
          systemTableCache: {
            getAll: () => [],
            get: () => null,
            filter: () => [],
          },
        });

        await indexService.initialize();

        try {
          const indexName = `idx_${tableName}_${columnName}`;

          // Create index metadata (without actual partition)
          const indexMetadata = {
            indexId: `idx-test-${Date.now()}`,
            tableId: tableName,
            indexName,
            columnNames: [columnName],
            indexType: 'btree',
            createdAt: Date.now(),
          };

          // Simulate CDC event for index creation
          await indexService.handleCDCEvent({
            tableName: 'indices',
            operation: 'INSERT',
            data: {
              index_id: indexMetadata.indexId,
              table_id: indexMetadata.tableId,
              index_name: indexMetadata.indexName,
              column_names: JSON.stringify(indexMetadata.columnNames),
              index_type: indexMetadata.indexType,
              created_at: indexMetadata.createdAt,
            },
          });

          // Verify index metadata is tracked
          const storedIndex = indexService.getIndex(tableName, indexName);
          if (!storedIndex) {
            return false;
          }
          if (storedIndex.indexName !== indexName) {
            return false;
          }
          if (storedIndex.columnNames[0] !== columnName) {
            return false;
          }

          // Verify index appears in table's indices
          const tableIndices = indexService.getIndicesForTable(tableName);
          if (tableIndices.length !== 1) {
            return false;
          }

          return true;
        } finally {
          await indexService.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Index metadata is properly tracked');
});
