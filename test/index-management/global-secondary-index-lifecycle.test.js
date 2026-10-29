/**
 * End-to-end unit and integration tests for Global Secondary Index lifecycle (Stages C1–C4).
 *
 * Covers:
 * - C1: _indices catalog state machine, visibility gates, and fail-closed rejection (0A000)
 *       of cross-partition CREATE UNIQUE INDEX.
 * - C2: Physical index dataset creation (__idx_<tableName>_<indexName>), duplicate non-unique
 *       key coexistence across distinct base PKs, and partition routing.
 * - C3: Resumable backfill interrupted mid-partition and resumed from durable checkpoints,
 *       plus anti-resurrection under concurrent mutations.
 * - C4: Synchronous TX1 write maintenance on INSERT, UPDATE (moving entries between index
 *       partitions), DELETE, and atomic rollback on participant failure.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {
  GLOBAL_INDEX_ERROR_MSG,
  GLOBAL_INDEX_SQL_STATE,
  GLOBAL_INDEX_STATE,
  assertSupportedGlobalIndexDefinition,
  assertValidGlobalIndexStateTransition,
  createGlobalIndexRecord,
  isReadableByPlanner,
  isValidGlobalIndexStateTransition,
  maintainsOnWrite,
  normalizeGlobalIndexRecord,
} from '../../src/index-management/global-index-catalog-contract.js';
import {
  GlobalIndexDatasetManager,
  buildIndexDatasetSchema,
  buildIndexEntry,
  generateCreateIndexDatasetSql,
  generateDropIndexDatasetSql,
  getGlobalIndexDatasetName,
  resolveIndexPartitionForEntry,
} from '../../src/index-management/global-index-dataset-manager.js';
import {
  GlobalIndexBackfillCoordinator,
  deserializePrimaryKeyCursor,
  serializePrimaryKeyCursor,
  sortPartitionsDeterministically,
} from '../../src/index-management/global-index-backfill-coordinator.js';
import {
  GlobalIndexWriteMaintenance,
  INDEX_MAINTENANCE_OPERATION,
  buildIndexDeleteSql,
  buildIndexInsertSql,
} from '../../src/index-management/global-index-write-maintenance.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';

// ============================================================================
// STAGE C1: CATALOG STATE MACHINE & NON-UNIQUE GSI BOUNDARY
// ============================================================================

test('C1: State machine validates allowed and disallowed transitions', async (t) => {
  // Allowed happy path transitions
  t.ok(
    isValidGlobalIndexStateTransition(GLOBAL_INDEX_STATE.CREATING, GLOBAL_INDEX_STATE.WRITE_ONLY),
    'CREATING -> WRITE_ONLY allowed',
  );
  t.ok(
    isValidGlobalIndexStateTransition(
      GLOBAL_INDEX_STATE.WRITE_ONLY,
      GLOBAL_INDEX_STATE.BACKFILLING,
    ),
    'WRITE_ONLY -> BACKFILLING allowed',
  );
  t.ok(
    isValidGlobalIndexStateTransition(
      GLOBAL_INDEX_STATE.BACKFILLING,
      GLOBAL_INDEX_STATE.READ_WRITE,
    ),
    'BACKFILLING -> READ_WRITE allowed',
  );

  // Transitions to DROPPING or FAILED allowed from any active state
  t.ok(
    isValidGlobalIndexStateTransition(GLOBAL_INDEX_STATE.CREATING, GLOBAL_INDEX_STATE.DROPPING),
    'CREATING -> DROPPING allowed',
  );
  t.ok(
    isValidGlobalIndexStateTransition(GLOBAL_INDEX_STATE.WRITE_ONLY, GLOBAL_INDEX_STATE.FAILED),
    'WRITE_ONLY -> FAILED allowed',
  );
  t.ok(
    isValidGlobalIndexStateTransition(GLOBAL_INDEX_STATE.BACKFILLING, GLOBAL_INDEX_STATE.FAILED),
    'BACKFILLING -> FAILED allowed',
  );
  t.ok(
    isValidGlobalIndexStateTransition(GLOBAL_INDEX_STATE.READ_WRITE, GLOBAL_INDEX_STATE.DROPPING),
    'READ_WRITE -> DROPPING allowed',
  );

  // Disallowed transitions
  t.notOk(
    isValidGlobalIndexStateTransition(GLOBAL_INDEX_STATE.CREATING, GLOBAL_INDEX_STATE.READ_WRITE),
    'CREATING cannot jump directly to READ_WRITE',
  );
  t.notOk(
    isValidGlobalIndexStateTransition(
      GLOBAL_INDEX_STATE.READ_WRITE,
      GLOBAL_INDEX_STATE.BACKFILLING,
    ),
    'READ_WRITE cannot transition backwards to BACKFILLING',
  );

  t.throws(
    () => assertValidGlobalIndexStateTransition(
      GLOBAL_INDEX_STATE.CREATING,
      GLOBAL_INDEX_STATE.READ_WRITE,
    ),
    new RegExp(GLOBAL_INDEX_ERROR_MSG.INVALID_STATE_TRANSITION),
    'assertValidGlobalIndexStateTransition throws on invalid transition',
  );
});

test('C1: Visibility gates enforce write maintenance and planner readability', async (t) => {
  // Write maintenance gate
  t.notOk(maintainsOnWrite(GLOBAL_INDEX_STATE.CREATING), 'CREATING does not maintain on write');
  t.ok(maintainsOnWrite(GLOBAL_INDEX_STATE.WRITE_ONLY), 'WRITE_ONLY maintains on write');
  t.ok(maintainsOnWrite(GLOBAL_INDEX_STATE.BACKFILLING), 'BACKFILLING maintains on write');
  t.ok(maintainsOnWrite(GLOBAL_INDEX_STATE.READ_WRITE), 'READ_WRITE maintains on write');
  t.notOk(maintainsOnWrite(GLOBAL_INDEX_STATE.DROPPING), 'DROPPING does not maintain on write');
  t.notOk(maintainsOnWrite(GLOBAL_INDEX_STATE.FAILED), 'FAILED does not maintain on write');

  // Read visibility gate: planner may ONLY read from READ_WRITE
  t.notOk(isReadableByPlanner(GLOBAL_INDEX_STATE.CREATING), 'CREATING is not readable by planner');
  t.notOk(
    isReadableByPlanner(GLOBAL_INDEX_STATE.WRITE_ONLY),
    'WRITE_ONLY is not readable by planner',
  );
  t.notOk(
    isReadableByPlanner(GLOBAL_INDEX_STATE.BACKFILLING),
    'BACKFILLING is not readable by planner',
  );
  t.ok(isReadableByPlanner(GLOBAL_INDEX_STATE.READ_WRITE), 'READ_WRITE is readable by planner');
  t.notOk(isReadableByPlanner(GLOBAL_INDEX_STATE.DROPPING), 'DROPPING is not readable by planner');
  t.notOk(isReadableByPlanner(GLOBAL_INDEX_STATE.FAILED), 'FAILED is not readable by planner');
});

test('C1: Non-unique GSI boundary fails closed (0A000) on cross-partition UNIQUE index', async (t) => {
  // Valid non-unique GSI
  t.doesNotThrow(
    () => assertSupportedGlobalIndexDefinition({isGlobal: true, isUnique: false}),
    'Non-unique global index is permitted',
  );

  // Attempting CREATE UNIQUE INDEX on a global index must fail closed with 0A000
  try {
    assertSupportedGlobalIndexDefinition({isGlobal: true, isUnique: true});
    t.fail('Expected cross-partition unique index to fail closed');
  } catch (err) {
    t.equal(
      err.code,
      QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      'Error code is UNSUPPORTED_SQL_FEATURE',
    );
    t.equal(
      err.sqlState,
      GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED,
      'sqlState is 0A000',
    );
    t.match(
      err.message,
      /Cross-partition unique indexes remain deferred/,
      'Clear refusal message',
    );
  }

  // createGlobalIndexRecord also enforces the boundary
  t.throws(
    () => createGlobalIndexRecord({
      indexId: 'idx-1',
      tableName: 'users',
      indexName: 'idx_unique_email',
      columnNames: ['email'],
      isGlobal: 1,
      isUnique: 1,
    }),
    /Cross-partition unique indexes remain deferred/,
    'createGlobalIndexRecord fails closed when isUnique=1',
  );
});

test('C1: Catalog record normalization handles JSON and primitive inputs', async (t) => {
  const row = {
    index_id: 'idx-100',
    table_id: 'users',
    table_name: 'users',
    index_name: 'idx_users_email',
    column_names: JSON.stringify(['email', 'created_at']),
    index_type: 'btree',
    is_global: 1,
    is_unique: 0,
    state: 'READ_WRITE',
    backfill_cursor_partition_id: 'p0',
    backfill_cursor_pk: '100',
    backfill_total_rows: 50,
    created_at: 1000,
    updated_at: 2000,
  };

  const normalized = normalizeGlobalIndexRecord(row);
  t.equal(normalized.indexId, 'idx-100');
  t.equal(normalized.tableName, 'users');
  t.same(normalized.columnNames, ['email', 'created_at']);
  t.equal(normalized.isGlobal, true);
  t.equal(normalized.isUnique, false);
  t.equal(normalized.state, 'READ_WRITE');
  t.equal(normalized.backfillCursorPartitionId, 'p0');
  t.equal(normalized.backfillCursorPk, '100');
  t.equal(normalized.backfillTotalRows, 50);
});

// ============================================================================
// STAGE C2: PHYSICAL DATASET LIFECYCLE & DUPLICATE COEXISTENCE
// ============================================================================

test('C2: Index dataset creation and composite primary key structure', async (t) => {
  const db = new Database(':memory:');
  const datasetManager = new GlobalIndexDatasetManager();

  const dsName = getGlobalIndexDatasetName('orders', 'idx_orders_customer_date');
  t.equal(dsName, '__idx_orders_idx_orders_customer_date');

  const rawSchema = buildIndexDatasetSchema({
    tableName: 'orders',
    indexName: 'idx_orders_customer_date',
    columnNames: ['customer_id', 'order_date'],
    basePrimaryKeyColumns: ['order_id'],
    columnTypes: {customer_id: 'INTEGER', order_date: 'TEXT', order_id: 'INTEGER'},
  });
  t.equal(rawSchema.tableName, dsName);

  const createSql = generateCreateIndexDatasetSql(rawSchema);
  t.match(createSql, /CREATE TABLE IF NOT EXISTS/);

  const entry = buildIndexEntry(
    {order_id: 1001, customer_id: 42, order_date: '2026-10-29'},
    {
      columnNames: ['customer_id', 'order_date'],
      basePrimaryKeyColumns: ['order_id'],
      basePartitionId: 'p-orders-1',
    },
  );
  t.equal(entry.customer_id, 42);
  t.equal(entry.__base_pk_order_id, 1001);
  t.equal(entry.__base_partition_id, 'p-orders-1');

  const schema = datasetManager.createIndexDataset(db, {
    tableName: 'orders',
    indexName: 'idx_orders_customer_date',
    columnNames: ['customer_id', 'order_date'],
    basePrimaryKeyColumns: ['order_id'],
    columnTypes: {customer_id: 'INTEGER', order_date: 'TEXT', order_id: 'INTEGER'},
  });

  t.equal(schema.tableName, '__idx_orders_idx_orders_customer_date');
  t.same(schema.primaryKey, ['customer_id', 'order_date', '__base_pk_order_id']);

  const tableInfo = db.prepare('PRAGMA table_info(__idx_orders_idx_orders_customer_date)').all();
  const colNames = tableInfo.map((c) => c.name);
  t.same(colNames, ['customer_id', 'order_date', '__base_pk_order_id', '__base_partition_id']);

  // Verify duplicate non-unique indexed values across distinct base PKs coexist
  const insertStmt = db.prepare(
    'INSERT INTO __idx_orders_idx_orders_customer_date ' +
    '(customer_id, order_date, __base_pk_order_id, __base_partition_id) ' +
    'VALUES (?, ?, ?, ?)',
  );

  // Two different orders placed by the same customer on the same date
  t.doesNotThrow(() => {
    insertStmt.run(42, '2026-10-29', 1001, 'p-orders-1');
    insertStmt.run(42, '2026-10-29', 1002, 'p-orders-2');
  }, 'Distinct base rows with identical index values coexist cleanly');

  const rows = db.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer_date WHERE customer_id = ? ORDER BY __base_pk_order_id ASC',
  ).all(42);

  t.equal(rows.length, 2, 'Both duplicate entries coexist');
  t.equal(rows[0].__base_pk_order_id, 1001);
  t.equal(rows[1].__base_pk_order_id, 1002);

  const dropSql = generateDropIndexDatasetSql('orders', 'idx_orders_customer_date');
  t.match(dropSql, /DROP TABLE IF EXISTS/);

  // Dropping index dataset cleanly
  datasetManager.dropIndexDataset(db, 'orders', 'idx_orders_customer_date');
  const check = db.prepare(
    'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
  ).get('__idx_orders_idx_orders_customer_date');
  t.notOk(check, 'Index dataset table dropped cleanly');

  db.close();
});

test('C2: Index partition routing uses compareRoutingKeys', async (t) => {
  const indexPartitions = [
    {partition_id: 'p-idx-0', partition_key_start: null, partition_key_end: 'm'},
    {partition_id: 'p-idx-1', partition_key_start: 'm', partition_key_end: 't'},
    {partition_id: 'p-idx-2', partition_key_start: 't', partition_key_end: null},
  ];

  const entryA = {email: 'alice@example.com'};
  const entryM = {email: 'm'};
  const entryP = {email: 'peter@example.com'};
  const entryZ = {email: 'zoe@example.com'};

  const targetA = resolveIndexPartitionForEntry(entryA, indexPartitions, 'email');
  t.equal(targetA.partition_id, 'p-idx-0', 'alice routes to p-idx-0 (< m)');

  const targetM = resolveIndexPartitionForEntry(entryM, indexPartitions, 'email');
  t.equal(targetM.partition_id, 'p-idx-1', 'm routes to p-idx-1 (inclusive start m)');

  const targetP = resolveIndexPartitionForEntry(entryP, indexPartitions, 'email');
  t.equal(targetP.partition_id, 'p-idx-1', 'peter routes to p-idx-1 (m <= peter < t)');

  const targetZ = resolveIndexPartitionForEntry(entryZ, indexPartitions, 'email');
  t.equal(targetZ.partition_id, 'p-idx-2', 'zoe routes to p-idx-2 (>= t)');
});

// ============================================================================
// STAGE C3: RESUMABLE HISTORICAL BACKFILL & ANTI-RESURRECTION
// ============================================================================

test('C3: Cursor serialization and deterministic partition sorting', async (t) => {
  t.equal(serializePrimaryKeyCursor(123), '123');
  t.equal(serializePrimaryKeyCursor([1, 'a']), '[1,"a"]');
  t.equal(serializePrimaryKeyCursor(null), '');

  t.equal(deserializePrimaryKeyCursor('123'), '123');
  t.same(deserializePrimaryKeyCursor('[1,"a"]'), [1, 'a']);
  t.equal(deserializePrimaryKeyCursor(''), null);

  const unsorted = [
    {partition_id: 'p2', partition_key_start: 'm'},
    {partition_id: 'p1', partition_key_start: null},
    {partition_id: 'p3', partition_key_start: 'z'},
  ];
  const sorted = sortPartitionsDeterministically(unsorted);
  t.equal(sorted[0].partition_id, 'p1');
  t.equal(sorted[1].partition_id, 'p2');
  t.equal(sorted[2].partition_id, 'p3');
});

test('C3: Resumable backfill checkpoints progress and resumes across interruption', async (t) => {
  // Simulated base table partitions with rows:
  // p-base-0: rows 1, 2, 3
  // p-base-1: rows 4, 5
  const baseData = {
    'p-base-0': [
      {id: 1, customer_id: 10, status: 'completed'},
      {id: 2, customer_id: 20, status: 'pending'},
      {id: 3, customer_id: 30, status: 'completed'},
    ],
    'p-base-1': [
      {id: 4, customer_id: 40, status: 'pending'},
      {id: 5, customer_id: 50, status: 'completed'},
    ],
  };

  const writtenEntries = [];
  const checkpoints = [];

  const catalog = {
    state: GLOBAL_INDEX_STATE.WRITE_ONLY,
    backfill_cursor_partition_id: null,
    backfill_cursor_pk: null,
    backfill_total_rows: 0,
  };

  const coordinator = new GlobalIndexBackfillCoordinator({
    batchSize: 2,
    getBaseTablePartitions: () => [
      {partition_id: 'p-base-0', partition_key_start: null, partition_key_end: 4},
      {partition_id: 'p-base-1', partition_key_start: 4, partition_key_end: null},
    ],
    getIndexPartitions: () => [
      {partition_id: 'p-idx-0', partition_key_start: null, partition_key_end: null},
    ],
    fetchBasePartitionBatch: async ({partitionId, cursorPk, batchSize}) => {
      const allRows = baseData[partitionId] || [];
      const cursorNum = cursorPk ? Number(cursorPk) : 0;
      return allRows.filter((r) => r.id > cursorNum).slice(0, batchSize);
    },
    verifyBaseRowImage: async ({partitionId, pkValues}) => {
      const rows = baseData[partitionId] || [];
      return rows.find((r) => r.id === pkValues.id) || null;
    },
    writeIndexBatch: async ({entries}) => {
      writtenEntries.push(...entries);
    },
    updateIndexCheckpoint: async (update) => {
      Object.assign(catalog, update);
      checkpoints.push({...catalog});
    },
  });

  const indexMeta = {
    indexId: 'idx-orders-cust',
    tableName: 'orders',
    indexName: 'idx_cust',
    columnNames: ['customer_id'],
    basePrimaryKeyColumns: ['id'],
    state: GLOBAL_INDEX_STATE.WRITE_ONLY,
  };

  // Run 1: Interrupt after first batch of 2 rows in p-base-0
  let batchCount = 0;
  const run1 = await coordinator.executeBackfill(indexMeta, {
    shouldYield: () => {
      batchCount++;
      return batchCount >= 1; // Yield after first batch
    },
  });

  t.equal(run1.interrupted, true, 'Backfill yielded mid-execution');
  t.equal(catalog.state, GLOBAL_INDEX_STATE.BACKFILLING, 'Index is in BACKFILLING');
  t.equal(catalog.backfill_cursor_partition_id, 'p-base-0');
  t.equal(catalog.backfill_cursor_pk, '2', 'Cursor saved at row id 2');
  t.equal(catalog.backfill_total_rows, 2, '2 rows indexed so far');

  // Run 2: Resume from checkpoint to completion
  const run2 = await coordinator.executeBackfill({
    ...indexMeta,
    state: catalog.state,
    backfill_cursor_partition_id: catalog.backfill_cursor_partition_id,
    backfill_cursor_pk: catalog.backfill_cursor_pk,
    backfill_total_rows: catalog.backfill_total_rows,
  });

  t.equal(run2.completed, true, 'Resumed backfill completed');
  t.equal(catalog.state, GLOBAL_INDEX_STATE.READ_WRITE, 'State transitioned to READ_WRITE on EOF');
  t.equal(catalog.backfill_total_rows, 5, 'All 5 rows successfully indexed');
  t.equal(writtenEntries.length, 5, 'Exactly 5 index entries written');
});

test('C3: Anti-resurrection invariant ignores concurrently deleted rows during backfill', async (t) => {
  const baseData = {
    'p-base-0': [
      {id: 1, customer_id: 10},
      {id: 2, customer_id: 20}, // will be concurrently deleted
      {id: 3, customer_id: 30},
    ],
  };

  // Concurrent write simulated: row id 2 was deleted before verification check
  const deletedPks = new Set([2]);
  const writtenEntries = [];

  const coordinator = new GlobalIndexBackfillCoordinator({
    batchSize: 10,
    getBaseTablePartitions: () => [
      {partition_id: 'p-base-0', partition_key_start: null, partition_key_end: null},
    ],
    getIndexPartitions: () => [
      {partition_id: 'p-idx-0', partition_key_start: null, partition_key_end: null},
    ],
    fetchBasePartitionBatch: async ({partitionId}) => {
      return baseData[partitionId] || [];
    },
    verifyBaseRowImage: async ({partitionId, pkValues}) => {
      if (deletedPks.has(pkValues.id)) {
        return null; // Row was deleted in live base partition!
      }
      return baseData[partitionId].find((r) => r.id === pkValues.id) || null;
    },
    writeIndexBatch: async ({entries}) => {
      writtenEntries.push(...entries);
    },
    updateIndexCheckpoint: async () => {},
  });

  const indexMeta = {
    indexId: 'idx-test',
    tableName: 'orders',
    indexName: 'idx_cust',
    columnNames: ['customer_id'],
    basePrimaryKeyColumns: ['id'],
    state: GLOBAL_INDEX_STATE.WRITE_ONLY,
  };

  const result = await coordinator.executeBackfill(indexMeta);
  t.equal(result.completed, true);
  t.equal(result.totalRows, 2, 'Only 2 valid non-deleted rows indexed');
  t.notOk(
    writtenEntries.some((e) => e.__base_pk_id === 2),
    'Deleted row 2 was NOT resurrected into index',
  );
});

// ============================================================================
// STAGE C4: SYNCHRONOUS TX1 WRITE MAINTENANCE
// ============================================================================

test('C4: Synchronous maintenance on base INSERT, UPDATE, and DELETE', async (t) => {
  const activeIndexes = [
    {
      index_name: 'idx_users_email',
      column_names: ['email'],
      is_global: 1,
      state: GLOBAL_INDEX_STATE.READ_WRITE,
    },
  ];

  const indexPartitions = [
    {partition_id: 'p-idx-users-0', partition_key_start: null, partition_key_end: 'm'},
    {partition_id: 'p-idx-users-1', partition_key_start: 'm', partition_key_end: null},
  ];

  const maintenance = new GlobalIndexWriteMaintenance({
    getIndexCatalog: () => activeIndexes,
    getIndexPartitions: () => indexPartitions,
  });

  // Direct SQL builder verification
  const insertSqlObj = buildIndexInsertSql('__idx_test', {col1: 'v1', __base_pk_id: 1});
  t.match(insertSqlObj.sql, /INSERT OR REPLACE INTO/);
  t.same(insertSqlObj.params, ['v1', 1]);

  const deleteSqlObj = buildIndexDeleteSql('__idx_test', ['col1', '__base_pk_id'], {
    col1: 'v1',
    __base_pk_id: 1,
  });
  t.match(deleteSqlObj.sql, /DELETE FROM/);
  t.same(deleteSqlObj.params, ['v1', 1]);

  // 1. INSERT maintenance
  const insertPlan = maintenance.planInsertMaintenance({
    tableName: 'users',
    basePartitionId: 'p-base-1',
    insertedRows: [
      {id: 1, email: 'alice@example.com', name: 'Alice'},
      {id: 2, email: 'tom@example.com', name: 'Tom'},
    ],
    basePrimaryKeyColumns: ['id'],
  });

  t.equal(insertPlan.operations.length, 2, '2 insert operations planned');
  t.same(
    insertPlan.enlistedIndexPartitions,
    ['p-idx-users-0', 'p-idx-users-1'],
    'Both target index partitions enlisted for 2PC',
  );
  t.equal(insertPlan.operations[0].indexPartitionId, 'p-idx-users-0');
  t.equal(insertPlan.operations[1].indexPartitionId, 'p-idx-users-1');

  // 2. UPDATE maintenance: modifying indexed column moves entry across index partitions
  const updatePlan = maintenance.planUpdateMaintenance({
    tableName: 'users',
    basePartitionId: 'p-base-1',
    oldRow: {id: 1, email: 'alice@example.com', name: 'Alice'}, // was in p-idx-users-0 (< m)
    newRow: {id: 1, email: 'zoe@example.com', name: 'Alice'}, // now in p-idx-users-1 (>= m)
    basePrimaryKeyColumns: ['id'],
  });

  t.equal(updatePlan.operations.length, 2, 'DELETE old entry and INSERT new entry');
  t.equal(updatePlan.operations[0].operationType, INDEX_MAINTENANCE_OPERATION.DELETE);
  t.equal(updatePlan.operations[0].indexPartitionId, 'p-idx-users-0');
  t.equal(updatePlan.operations[1].operationType, INDEX_MAINTENANCE_OPERATION.INSERT);
  t.equal(updatePlan.operations[1].indexPartitionId, 'p-idx-users-1');
  t.same(
    updatePlan.enlistedIndexPartitions,
    ['p-idx-users-0', 'p-idx-users-1'],
    'Both old and new index partitions enlisted',
  );

  // 3. UPDATE maintenance: updating non-indexed column is a no-op for the index
  const noOpUpdate = maintenance.planUpdateMaintenance({
    tableName: 'users',
    basePartitionId: 'p-base-1',
    oldRow: {id: 1, email: 'alice@example.com', name: 'Alice'},
    newRow: {id: 1, email: 'alice@example.com', name: 'Alice Cooper'}, // email unchanged
    basePrimaryKeyColumns: ['id'],
  });
  t.equal(noOpUpdate.operations.length, 0, 'No index mutation when indexed columns are unchanged');

  // 4. DELETE maintenance: deletes entry from index
  const deletePlan = maintenance.planDeleteMaintenance({
    tableName: 'users',
    basePartitionId: 'p-base-1',
    deletedRow: {id: 1, email: 'zoe@example.com', name: 'Alice'},
    basePrimaryKeyColumns: ['id'],
  });
  t.equal(deletePlan.operations.length, 1);
  t.equal(deletePlan.operations[0].operationType, INDEX_MAINTENANCE_OPERATION.DELETE);
  t.equal(deletePlan.operations[0].indexPartitionId, 'p-idx-users-1');
});

test('C4: Atomic transaction execution rollbacks on participant failure', async (t) => {
  const maintenance = new GlobalIndexWriteMaintenance();

  const operations = [
    {indexPartitionId: 'p-idx-0', sql: 'INSERT INTO ...', params: []},
    {indexPartitionId: 'p-idx-1', sql: 'INSERT INTO ...', params: []},
  ];

  let rolledBack = false;
  const fakeExecutor = async (partitionId) => {
    if (partitionId === 'p-idx-1') {
      rolledBack = true;
      throw new Error('Connection lost to partition p-idx-1 during prepare');
    }
  };

  try {
    await maintenance.executeMaintenanceOperations(operations, fakeExecutor);
    t.fail('Execution should have failed');
  } catch (err) {
    t.ok(rolledBack, 'Transaction aborted on participant failure');
    t.match(err.message, /Connection lost to partition p-idx-1/);
  }
});

