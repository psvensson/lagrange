/**
 * Property-based test for PRIMARY KEY Requirement.
 * **Property 43: PRIMARY KEY Requirement**
 * **Validates: Requirements 20.2**
 *
 * Property: For any table creation without a PRIMARY KEY,
 * the system rejects the creation with an appropriate error.
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
 * Generate a random column definition without PRIMARY KEY.
 */
const nonPkColumnArbitrary = fc.record({
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
 * Property 43: PRIMARY KEY Requirement
 *
 * For any table creation without a PRIMARY KEY, the system rejects
 * the creation with an appropriate error.
 */
test('Property 43: Table without PRIMARY KEY is rejected', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      fc.array(nonPkColumnArbitrary, {minLength: 1, maxLength: 5}),
      async (tableName, columns) => {
        // Ensure unique column names
        const usedNames = new Set();
        const uniqueColumns = columns.filter((col) => {
          const lower = col.name.toLowerCase();
          if (usedNames.has(lower)) return false;
          usedNames.add(lower);
          return true;
        });

        if (uniqueColumns.length === 0) {
          return true; // Skip if no valid columns
        }

        // Build AST without PRIMARY KEY
        const ast = {
          tableName,
          columns: uniqueColumns,
          primaryKey: [], // No PRIMARY KEY
          ifNotExists: false,
        };

        const service = new TableCreationService();

        try {
          await service.createTable(ast);
          // Should not reach here - creation should fail
          return false;
        } catch (error) {
          // Verify error code and message
          if (error.code !== 'PRIMARY_KEY_REQUIRED') {
            return false;
          }
          if (!error.message.includes('PRIMARY KEY')) {
            return false;
          }
          return true;
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Tables without PRIMARY KEY are rejected with appropriate error');
});

/**
 * Property: Table with null PRIMARY KEY is rejected.
 */
test('Property 43: Table with null PRIMARY KEY is rejected', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      fc.array(nonPkColumnArbitrary, {minLength: 1, maxLength: 3}),
      async (tableName, columns) => {
        // Ensure unique column names
        const usedNames = new Set();
        const uniqueColumns = columns.filter((col) => {
          const lower = col.name.toLowerCase();
          if (usedNames.has(lower)) return false;
          usedNames.add(lower);
          return true;
        });

        if (uniqueColumns.length === 0) {
          return true; // Skip if no valid columns
        }

        // Build AST with null PRIMARY KEY
        const ast = {
          tableName,
          columns: uniqueColumns,
          primaryKey: null,
          ifNotExists: false,
        };

        const service = new TableCreationService();

        try {
          await service.createTable(ast);
          return false; // Should not succeed
        } catch (error) {
          return error.code === 'PRIMARY_KEY_REQUIRED';
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Tables with null PRIMARY KEY are rejected');
});

/**
 * Property: validatePrimaryKey returns valid=false for missing PRIMARY KEY.
 */
test('Property 43: validatePrimaryKey detects missing PRIMARY KEY', async (t) => {
  await fc.assert(
    fc.property(
      identifierArbitrary,
      fc.array(nonPkColumnArbitrary, {minLength: 1, maxLength: 3}),
      (tableName, columns) => {
        // Ensure unique column names
        const usedNames = new Set();
        const uniqueColumns = columns.filter((col) => {
          const lower = col.name.toLowerCase();
          if (usedNames.has(lower)) return false;
          usedNames.add(lower);
          return true;
        });

        if (uniqueColumns.length === 0) {
          return true; // Skip if no valid columns
        }

        // Build AST without PRIMARY KEY
        const ast = {
          tableName,
          columns: uniqueColumns,
          primaryKey: [],
        };

        const service = new TableCreationService();
        const result = service.validatePrimaryKey(ast);

        // Should return valid=false with error
        if (result.valid !== false) {
          return false;
        }
        if (result.code !== 'PRIMARY_KEY_REQUIRED') {
          return false;
        }
        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('validatePrimaryKey correctly detects missing PRIMARY KEY');
});
