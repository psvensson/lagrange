/**
 * Property-based test for Automatic Partition Key from PRIMARY KEY.
 * **Property 42: Automatic Partition Key from PRIMARY KEY**
 * **Validates: Requirements 20.1**
 *
 * Property: For any table created with a PRIMARY KEY, the system
 * automatically uses the PRIMARY KEY as the partition key.
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
 * Generate a random column definition.
 */
const columnArbitrary = fc.record({
  name: identifierArbitrary,
  dataType: fc.record({
    name: fc.constantFrom('TEXT', 'INTEGER', 'REAL', 'BLOB'),
  }),
  primaryKey: fc.constant(false),
  notNull: fc.boolean(),
  unique: fc.boolean(),
});

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
 * Property 42: Automatic Partition Key from PRIMARY KEY
 *
 * For any table created with a PRIMARY KEY, the system automatically
 * uses the PRIMARY KEY as the partition key.
 */
test('Property 42: Single-column PRIMARY KEY becomes partition key', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      identifierArbitrary,
      fc.array(columnArbitrary, {minLength: 0, maxLength: 3}),
      async (tableName, pkColumnName, additionalColumns) => {
        // Ensure unique column names
        const usedNames = new Set([pkColumnName.toLowerCase()]);
        const uniqueAdditionalColumns = additionalColumns.filter((col) => {
          const lower = col.name.toLowerCase();
          if (usedNames.has(lower)) return false;
          usedNames.add(lower);
          return true;
        });

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
          columns: [pkColumn, ...uniqueAdditionalColumns],
          primaryKey: [pkColumnName],
          ifNotExists: false,
        };

        const service = new TableCreationService();
        const result = await service.executeCreateTableProvisioning(ast);

        // Verify partition key equals PRIMARY KEY
        if (!result.success) {
          return false;
        }

        if (result.partitionKey !== pkColumnName) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Single-column PRIMARY KEY is automatically used as partition key');
});

/**
 * Property: Composite PRIMARY KEY becomes composite partition key.
 */
test('Property 42: Composite PRIMARY KEY becomes partition key', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      fc.array(identifierArbitrary, {minLength: 2, maxLength: 3}),
      async (tableName, pkColumnNames) => {
        // Ensure unique column names
        const uniquePkNames = [...new Set(pkColumnNames.map((n) => n.toLowerCase()))]
          .slice(0, 3)
          .map((_, i) => pkColumnNames[i]);

        if (uniquePkNames.length < 2) {
          return true; // Skip if not enough unique names
        }

        // Create columns for composite PRIMARY KEY
        const columns = uniquePkNames.map((name, idx) => ({
          name,
          dataType: {name: idx === 0 ? 'INTEGER' : 'TEXT'},
          primaryKey: false, // Table-level constraint
          notNull: true,
          unique: false,
        }));

        // Build AST with table-level PRIMARY KEY
        const ast = {
          tableName,
          columns,
          primaryKey: uniquePkNames,
          ifNotExists: false,
        };

        const service = new TableCreationService();
        const result = await service.executeCreateTableProvisioning(ast);

        // Verify partition key equals comma-separated PRIMARY KEY columns
        if (!result.success) {
          return false;
        }

        const expectedPartitionKey = uniquePkNames.join(',');
        if (result.partitionKey !== expectedPartitionKey) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Composite PRIMARY KEY is automatically used as partition key');
});

/**
 * Property: derivePartitionKey correctly derives from PRIMARY KEY.
 */
test('Property 42: derivePartitionKey derives from PRIMARY KEY', async (t) => {
  await fc.assert(
    fc.property(
      fc.array(identifierArbitrary, {minLength: 1, maxLength: 4}),
      (pkColumns) => {
        // Ensure unique column names
        const uniquePkColumns = [...new Set(pkColumns.map((n) => n.toLowerCase()))]
          .slice(0, 4)
          .map((_, i) => pkColumns[i]);

        if (uniquePkColumns.length === 0) {
          return true; // Skip empty
        }

        const service = new TableCreationService();
        const partitionKey = service.derivePartitionKey(uniquePkColumns);

        // Partition key should be comma-separated PRIMARY KEY columns
        const expected = uniquePkColumns.join(',');
        return partitionKey === expected;
      },
    ),
    {numRuns: 10},
  );

  t.pass('derivePartitionKey correctly derives partition key from PRIMARY KEY');
});
