/**
 * Property-based test for Initial Partition Full Range.
 * **Property 44: Initial Partition Full Range**
 * **Validates: Requirements 20.3**
 *
 * Property: For any table created, the initial partition covers
 * the full key range [NULL, NULL).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * SQL reserved keywords to avoid in column/table names.
 */
const SQL_RESERVED_KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'as', 'asc', 'between', 'by', 'case', 'check',
  'column', 'constraint', 'create', 'cross', 'current', 'default', 'delete',
  'desc', 'distinct', 'drop', 'else', 'end', 'escape', 'except', 'exists',
  'for', 'foreign', 'from', 'full', 'group', 'having', 'if', 'in', 'index',
  'inner', 'insert', 'intersect', 'into', 'is', 'join', 'key', 'left', 'like',
  'limit', 'not', 'null', 'on', 'or', 'order', 'outer', 'primary', 'references',
  'right', 'select', 'set', 'table', 'then', 'to', 'union', 'unique', 'update',
  'using', 'values', 'when', 'where', 'with',
]);

/**
 * Generate a valid identifier (table/column name).
 */
const identifierArbitrary = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s))
  .filter((s) => !SQL_RESERVED_KEYWORDS.has(s.toLowerCase()));

/**
 * Mock CDC integration service to capture partition metadata.
 */
class MockCDCIntegrationService {
  constructor() {
    this.insertedRows = [];
  }

  async insertSystemTableRow(tableName, row) {
    this.insertedRows.push({tableName, row});
  }

  async updateSystemTableRow() {
    return {success: true};
  }

  getPartitionRows() {
    return this.insertedRows.filter((r) => r.tableName === 'partitions');
  }
}

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
 * Feature: distributed-database-system
 * Property 44: Initial Partition Full Range
 *
 * For any table created, the initial partition covers the full key range
 * [NULL, NULL) meaning unbounded on both ends.
 */
test('Property 44: Initial partition has full key range [NULL, NULL)', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      identifierArbitrary,
      async (tableName, pkColumnName) => {
        const mockCDC = new MockCDCIntegrationService();

        // Create PRIMARY KEY column
        const pkColumn = {
          name: pkColumnName,
          dataType: {name: 'INTEGER'},
          primaryKey: true,
          notNull: true,
          unique: false,
        };

        // Build AST
        const ast = {
          tableName,
          columns: [pkColumn],
          primaryKey: [pkColumnName],
          ifNotExists: false,
        };

        const service = new TableCreationService({
          cdcIntegrationService: mockCDC,
        });

        const result = await service.executeCreateTableProvisioning(ast);

        if (!result.success) {
          return false;
        }

        // Verify partition was created
        const partitionRows = mockCDC.getPartitionRows();
        if (partitionRows.length !== 1) {
          return false;
        }

        const partition = partitionRows[0].row;

        // Verify full key range [NULL, NULL)
        if (partition.partition_key_start !== null) {
          return false;
        }
        if (partition.partition_key_end !== null) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Initial partition covers full key range [NULL, NULL)');
});

/**
 * Property: Initial partition is associated with the correct table.
 */
test('Property 44: Initial partition is linked to correct table', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      identifierArbitrary,
      async (tableName, pkColumnName) => {
        const mockCDC = new MockCDCIntegrationService();

        const ast = {
          tableName,
          columns: [{
            name: pkColumnName,
            dataType: {name: 'TEXT'},
            primaryKey: true,
            notNull: true,
            unique: false,
          }],
          primaryKey: [pkColumnName],
          ifNotExists: false,
        };

        const service = new TableCreationService({
          cdcIntegrationService: mockCDC,
        });

        const result = await service.executeCreateTableProvisioning(ast);

        if (!result.success) {
          return false;
        }

        // Get table and partition rows
        const tableRows = mockCDC.insertedRows.filter((r) => r.tableName === 'tables');
        const partitionRows = mockCDC.getPartitionRows();

        if (tableRows.length !== 1 || partitionRows.length !== 1) {
          return false;
        }

        const table = tableRows[0].row;
        const partition = partitionRows[0].row;

        // Verify partition is linked to table
        if (partition.table_id !== table.table_id) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Initial partition is correctly linked to its table');
});

/**
 * Property: Exactly one partition is created for new table.
 */
test('Property 44: Exactly one partition created for new table', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      fc.array(identifierArbitrary, {minLength: 1, maxLength: 3}),
      async (tableName, columnNames) => {
        // Ensure unique column names
        const uniqueNames = [...new Set(columnNames.map((n) => n.toLowerCase()))]
          .slice(0, 3)
          .map((_, i) => columnNames[i]);

        if (uniqueNames.length === 0) {
          return true;
        }

        const mockCDC = new MockCDCIntegrationService();

        // First column is PRIMARY KEY
        const columns = uniqueNames.map((name, idx) => ({
          name,
          dataType: {name: idx === 0 ? 'INTEGER' : 'TEXT'},
          primaryKey: idx === 0,
          notNull: idx === 0,
          unique: false,
        }));

        const ast = {
          tableName,
          columns,
          primaryKey: [uniqueNames[0]],
          ifNotExists: false,
        };

        const service = new TableCreationService({
          cdcIntegrationService: mockCDC,
        });

        const result = await service.executeCreateTableProvisioning(ast);

        if (!result.success) {
          return false;
        }

        // Verify exactly one partition created
        const partitionRows = mockCDC.getPartitionRows();
        return partitionRows.length === 1;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Exactly one partition is created for each new table');
});
