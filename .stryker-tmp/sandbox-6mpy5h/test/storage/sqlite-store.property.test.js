/**
 * Property-based tests for SQLiteStore.
 * Validates query round-trip: inserting data and selecting it back
 * returns equivalent rows.
 *
 * Feature: raft-architecture-consolidation
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SQLiteStore} from '../../src/storage/sqlite-store.js';

/**
 * Fixed test schema with three columns covering TEXT and INTEGER types.
 */
const TEST_TABLE_NAME = 'test_items';
const TEST_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'name', type: 'TEXT'},
    {name: 'value', type: 'INTEGER'},
  ],
});

/**
 * Create a silent logger for tests.
 * @return {Object} Logger with no-op methods.
 */
function createSilentLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Arbitrary for generating valid row data matching the test schema.
 * - id: non-empty alphanumeric string (unique per row)
 * - name: arbitrary unicode string
 * - value: integer within SQLite safe range
 */
const rowDataArb = fc.record({
  id: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,29}$/),
  name: fc.string({minLength: 0, maxLength: 50}),
  value: fc.integer({min: -2147483648, max: 2147483647}),
});

// Feature: raft-architecture-consolidation, Property 9:
//   SQLiteStore query round-trip
/**
 * Property 9: SQLiteStore query round-trip
 *
 * For any valid table schema and row data matching that schema,
 * inserting the row via executeQuery() and then selecting it back
 * via executeQuery() should return a row equivalent to the original
 * data.
 *
 * **Validates: Requirements 5.2, 5.3**
 */
test('Property 9: SQLiteStore query round-trip', async (t) => {
  await fc.assert(
    fc.property(
      rowDataArb,
      (row) => {
        const store = new SQLiteStore({
          dbPath: ':memory:',
          schema: TEST_SCHEMA,
          tableName: TEST_TABLE_NAME,
          logger: createSilentLogger(),
        });

        try {
          store.initialize();

          // INSERT the generated row
          const insertResult = store.executeQuery(
            `INSERT INTO ${TEST_TABLE_NAME} (id, name, value)` +
            ' VALUES (?, ?, ?)',
            [row.id, row.name, row.value],
          );

          // Write should report 1 change
          t.equal(
            insertResult.changes,
            1,
            'INSERT should report 1 change',
          );

          // SELECT the row back by primary key
          const selectResult = store.executeQuery(
            `SELECT id, name, value FROM ${TEST_TABLE_NAME}` +
            ' WHERE id = ?',
            [row.id],
          );

          // Should return exactly 1 row
          t.equal(
            selectResult.rowCount,
            1,
            'SELECT should return exactly 1 row',
          );

          const retrieved = selectResult.rows[0];

          // Round-trip: retrieved data matches original
          t.equal(retrieved.id, row.id, 'id should match');
          t.equal(retrieved.name, row.name, 'name should match');
          t.equal(retrieved.value, row.value, 'value should match');

          return true;
        } finally {
          store.close();
        }
      },
    ),
    {numRuns: 10},
  );
});
