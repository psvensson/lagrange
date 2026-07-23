/**
 * Unit tests for SQLiteStore.
 * Validates database lifecycle, query execution, and error handling.
 * Requirements: 5.1, 5.2, 5.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  QUERY_RESULT_BUDGET_ERROR_CODE,
} from '../../src/query/query-result-budget.js';
import {SQLiteStore} from '../../src/storage/sqlite-store.js';
import {
  SQLITE_STORE_ERROR_MSG,
} from '../../src/storage/sqlite-store-constants.js';

/**
 * Test table name used across all tests.
 */
const TEST_TABLE_NAME = 'test_items';

/**
 * Test schema with TEXT and INTEGER columns.
 */
const TEST_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'name', type: 'TEXT', notNull: true},
    {name: 'value', type: 'INTEGER', defaultValue: 0},
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
 * Create an initialized in-memory SQLiteStore with the test schema.
 * @return {SQLiteStore} An initialized store.
 */
function createInitializedStore() {
  const store = new SQLiteStore({
    dbPath: ':memory:',
    schema: TEST_SCHEMA,
    tableName: TEST_TABLE_NAME,
    logger: createSilentLogger(),
  });
  store.initialize();
  return store;
}

// ============================================================
// Initialize Tests (Requirement 5.1)
// ============================================================

test('initialize creates database and table from schema', async (t) => {
  const store = new SQLiteStore({
    dbPath: ':memory:',
    schema: TEST_SCHEMA,
    tableName: TEST_TABLE_NAME,
    logger: createSilentLogger(),
  });

  try {
    store.initialize();

    t.ok(store.initialized, 'should mark store as initialized');
    t.ok(store.db, 'should have a database instance');

    // Verify table exists by querying sqlite_master
    const result = store.executeQuery(
      'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
      ['table', TEST_TABLE_NAME],
    );

    t.equal(result.rowCount, 1, 'should have created the table');
    t.equal(
      result.rows[0].name, TEST_TABLE_NAME,
      'table name should match',
    );
  } finally {
    store.close();
  }
});

test('initialize with no schema skips table creation', async (t) => {
  const store = new SQLiteStore({
    dbPath: ':memory:',
    logger: createSilentLogger(),
  });

  try {
    store.initialize();

    t.ok(store.initialized, 'should mark store as initialized');

    // Verify no user tables exist
    const result = store.executeQuery(
      'SELECT name FROM sqlite_master WHERE type = ?',
      ['table'],
    );

    t.equal(result.rowCount, 0, 'should have no tables');
  } finally {
    store.close();
  }
});

// ============================================================
// executeQuery SELECT Tests (Requirement 5.2)
// ============================================================

test('executeQuery with SELECT returns rows', async (t) => {
  const store = createInitializedStore();

  try {
    // Insert test data
    store.executeQuery(
      `INSERT INTO ${TEST_TABLE_NAME} (id, name, value)` +
      ' VALUES (?, ?, ?)',
      [1, 'alpha', 10],
    );
    store.executeQuery(
      `INSERT INTO ${TEST_TABLE_NAME} (id, name, value)` +
      ' VALUES (?, ?, ?)',
      [2, 'beta', 20],
    );

    const result = store.executeQuery(
      `SELECT id, name, value FROM ${TEST_TABLE_NAME}` +
      ' ORDER BY id',
    );

    t.equal(result.rowCount, 2, 'should return 2 rows');
    t.equal(result.rows[0].id, 1, 'first row id should be 1');
    t.equal(result.rows[0].name, 'alpha', 'first row name');
    t.equal(result.rows[0].value, 10, 'first row value');
    t.equal(result.rows[1].id, 2, 'second row id should be 2');
    t.equal(result.rows[1].name, 'beta', 'second row name');
  } finally {
    store.close();
  }
});

test('executeQuery bounds SELECT rows, bytes, and wall-time while iterating',
  async (t) => {
    const store = createInitializedStore();

    try {
      store.executeQuery(
        `INSERT INTO ${TEST_TABLE_NAME} (id, name, value)` +
        ' VALUES (?, ?, ?)',
        [1, 'x'.repeat(4_096), 10],
      );
      t.throws(
        () => store.executeQuery(
          `SELECT * FROM ${TEST_TABLE_NAME}`,
          [],
          {resultMaxBytes: 128},
        ),
        {
          code: QUERY_RESULT_BUDGET_ERROR_CODE.BYTES_EXHAUSTED,
        },
      );
      t.throws(
        () => store.executeQuery(
          `SELECT * FROM ${TEST_TABLE_NAME}`,
          [],
          {resultMaxRows: 0},
        ),
        {
          code: QUERY_RESULT_BUDGET_ERROR_CODE.ROWS_EXHAUSTED,
        },
      );
      t.throws(
        () => store.executeQuery(
          `SELECT * FROM ${TEST_TABLE_NAME}`,
          [],
          {resultDeadlineMs: Date.now() - 1},
        ),
        {
          code: QUERY_RESULT_BUDGET_ERROR_CODE.WALL_TIME_EXHAUSTED,
        },
      );
    } finally {
      store.close();
    }
  },
);

test('executeQuery SELECT on empty table returns empty rows',
  async (t) => {
    const store = createInitializedStore();

    try {
      const result = store.executeQuery(
        `SELECT * FROM ${TEST_TABLE_NAME}`,
      );

      t.equal(result.rowCount, 0, 'should return 0 rows');
      t.ok(Array.isArray(result.rows), 'rows should be an array');
      t.equal(result.rows.length, 0, 'rows array should be empty');
    } finally {
      store.close();
    }
  });

// ============================================================
// executeQuery Write Tests (Requirement 5.3)
// ============================================================

test('executeQuery with INSERT returns change count', async (t) => {
  const store = createInitializedStore();

  try {
    const result = store.executeQuery(
      `INSERT INTO ${TEST_TABLE_NAME} (id, name, value)` +
      ' VALUES (?, ?, ?)',
      [1, 'gamma', 30],
    );

    t.equal(result.changes, 1, 'should report 1 change');
    t.ok(
      result.lastInsertRowid !== undefined,
      'should include lastInsertRowid',
    );
  } finally {
    store.close();
  }
});

test('executeQuery with UPDATE returns change count', async (t) => {
  const store = createInitializedStore();

  try {
    store.executeQuery(
      `INSERT INTO ${TEST_TABLE_NAME} (id, name, value)` +
      ' VALUES (?, ?, ?)',
      [1, 'delta', 40],
    );

    const result = store.executeQuery(
      `UPDATE ${TEST_TABLE_NAME} SET value = ? WHERE id = ?`,
      [99, 1],
    );

    t.equal(result.changes, 1, 'should report 1 change');
  } finally {
    store.close();
  }
});

test('executeQuery with DELETE returns change count', async (t) => {
  const store = createInitializedStore();

  try {
    store.executeQuery(
      `INSERT INTO ${TEST_TABLE_NAME} (id, name, value)` +
      ' VALUES (?, ?, ?)',
      [1, 'epsilon', 50],
    );

    const result = store.executeQuery(
      `DELETE FROM ${TEST_TABLE_NAME} WHERE id = ?`,
      [1],
    );

    t.equal(result.changes, 1, 'should report 1 change');
  } finally {
    store.close();
  }
});

// ============================================================
// close Tests
// ============================================================

test('close shuts down database cleanly', async (t) => {
  const store = createInitializedStore();

  store.close();

  t.ok(store.closed, 'should mark store as closed');
  t.equal(store.db, null, 'should clear database reference');
  t.equal(store.initialized, false, 'should clear initialized flag');
});

test('close is idempotent - double close is safe', async (t) => {
  const store = createInitializedStore();

  store.close();
  store.close();

  t.ok(store.closed, 'should remain closed after double close');
  t.equal(store.db, null, 'db should remain null');
});

// ============================================================
// Error Handling Tests
// ============================================================

test('executeQuery on closed database throws ALREADY_CLOSED',
  async (t) => {
    const store = createInitializedStore();
    store.close();

    t.throws(
      () => store.executeQuery('SELECT 1'),
      {message: SQLITE_STORE_ERROR_MSG.NOT_INITIALIZED},
      'should throw NOT_INITIALIZED after close',
    );
  });

test('executeQuery before initialize throws NOT_INITIALIZED',
  async (t) => {
    const store = new SQLiteStore({
      dbPath: ':memory:',
      logger: createSilentLogger(),
    });

    t.throws(
      () => store.executeQuery('SELECT 1'),
      {message: SQLITE_STORE_ERROR_MSG.NOT_INITIALIZED},
      'should throw NOT_INITIALIZED before initialize',
    );
  });

test('executeQuery with missing SQL throws MISSING_SQL',
  async (t) => {
    const store = createInitializedStore();

    try {
      t.throws(
        () => store.executeQuery(''),
        {message: SQLITE_STORE_ERROR_MSG.MISSING_SQL},
        'should throw MISSING_SQL for empty string',
      );

      t.throws(
        () => store.executeQuery(null),
        {message: SQLITE_STORE_ERROR_MSG.MISSING_SQL},
        'should throw MISSING_SQL for null',
      );

      t.throws(
        () => store.executeQuery(undefined),
        {message: SQLITE_STORE_ERROR_MSG.MISSING_SQL},
        'should throw MISSING_SQL for undefined',
      );
    } finally {
      store.close();
    }
  });

// ============================================================
// getDatabase Tests
// ============================================================

test('getDatabase returns the raw database instance', async (t) => {
  const store = createInitializedStore();

  try {
    const db = store.getDatabase();

    t.ok(db, 'should return a database instance');
    t.equal(db, store.db, 'should return the internal db reference');
  } finally {
    store.close();
  }
});

test('getDatabase before initialize throws NOT_INITIALIZED',
  async (t) => {
    const store = new SQLiteStore({
      dbPath: ':memory:',
      logger: createSilentLogger(),
    });

    t.throws(
      () => store.getDatabase(),
      {message: SQLITE_STORE_ERROR_MSG.NOT_INITIALIZED},
      'should throw NOT_INITIALIZED',
    );
  });

test('getDatabase on closed database throws ALREADY_CLOSED',
  async (t) => {
    const store = createInitializedStore();
    store.close();

    t.throws(
      () => store.getDatabase(),
      {message: SQLITE_STORE_ERROR_MSG.NOT_INITIALIZED},
      'should throw after close',
    );
  });

// ============================================================
// Schema Tests
// ============================================================

test('initialize creates table with correct column definitions',
  async (t) => {
    const store = createInitializedStore();

    try {
      // Query pragma to inspect table columns
      const result = store.executeQuery(
        `SELECT * FROM pragma_table_info('${TEST_TABLE_NAME}')`,
      );

      t.equal(result.rowCount, 3, 'should have 3 columns');

      const idCol = result.rows.find((r) => r.name === 'id');
      const nameCol = result.rows.find((r) => r.name === 'name');
      const valueCol = result.rows.find((r) => r.name === 'value');

      t.ok(idCol, 'should have id column');
      t.equal(idCol.type, 'INTEGER', 'id should be INTEGER');
      t.equal(idCol.pk, 1, 'id should be primary key');

      t.ok(nameCol, 'should have name column');
      t.equal(nameCol.type, 'TEXT', 'name should be TEXT');
      t.equal(nameCol.notnull, 1, 'name should be NOT NULL');

      t.ok(valueCol, 'should have value column');
      t.equal(valueCol.type, 'INTEGER', 'value should be INTEGER');
      t.equal(
        String(valueCol.dflt_value), '0',
        'value should default to 0',
      );
    } finally {
      store.close();
    }
  });
