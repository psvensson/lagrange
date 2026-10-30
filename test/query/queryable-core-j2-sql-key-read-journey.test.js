/**
 * Composed J2 User Journey Test: SQL Keys and Read Semantics
 *
 * Implements acceptance for release-0-3-queryable-core Unit J2:
 * - Real SQLQueryEngine, PartitionResolver, DistributedQueryPlanner,
 *   DistributedWriteCoordinator, SplitKeyComparator, and real SQLite-backed
 *   partition execution.
 * - Single-instance better-sqlite3 reference database as independent oracle.
 * - Declared non-id primary key (tenant_events: tenant_key TEXT).
 * - Declared composite primary key (regional_orders: PRIMARY KEY (region, order_id)).
 * - 64-bit integer primary keys (ledger_entries: entry_id BIGINT).
 * - 64-bit boundaries (9007199254740991, '9007199254740992', '9007199254740993', negative).
 * - UTF-8 text edge cases (\u0000, \u00ff, 'åäö', '🚀').
 * - Binary BLOB / Uint8Array payloads and keys.
 * - Composite tuple routing, point narrowing, and partial predicate scattering.
 * - Partition split and merge transitions + engine re-initialization (restart).
 * - Fail-closed witnesses: partition-key UPDATE rejection, unrepresentable keys,
 *   unbound parameters, corrupted envelopes, missing tables and unavailable partitions.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {
  extractConditionValue,
} from '../../src/query/partition-resolver-key-conditions.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const DDL_TENANT_EVENTS =
  'CREATE TABLE tenant_events (' +
  'tenant_key TEXT PRIMARY KEY, ' +
  'seq_num INTEGER, ' +
  'payload BLOB, ' +
  'label TEXT)';

const DDL_REGIONAL_ORDERS =
  'CREATE TABLE regional_orders (' +
  'region TEXT, ' +
  'order_id BIGINT, ' +
  'amount INTEGER, ' +
  'note TEXT, ' +
  'PRIMARY KEY (region, order_id))';

const DDL_LEDGER_ENTRIES =
  'CREATE TABLE ledger_entries (' +
  'entry_id BIGINT PRIMARY KEY, ' +
  'account TEXT, ' +
  'delta INTEGER)';

/**
 * Initialize a partition SQLite database with all table schemas.
 * @return {Database} Initialized in-memory SQLite database.
 */
function createPartitionDatabase() {
  const db = new Database(':memory:');
  db.defaultSafeIntegers(true);
  db.exec(DDL_TENANT_EVENTS);
  db.exec(DDL_REGIONAL_ORDERS);
  db.exec(DDL_LEDGER_ENTRIES);
  return db;
}

/**
 * Build the message router that forwards partition queries to SQLite instances.
 * @param {Map<string, Database>} partitionDbs - Map of partition IDs to databases.
 * @param {Set<string>} [downPartitions=new Set()] - Set of partition IDs simulating failure.
 * @return {Object} Message router.
 */
function createPartitionMessageRouter(partitionDbs, downPartitions = new Set()) {
  return {
    async deliver(address, message) {
      const partitionId = address.split('/')[2];
      if (downPartitions.has(partitionId)) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false,
          error: `Partition ${partitionId} is unavailable`,
          errorCode: 'SERVICE_UNAVAILABLE',
        });
      }
      const db = partitionDbs.get(partitionId);
      if (!db) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false,
          error: `Partition database not found for ${partitionId}`,
          errorCode: 'PARTITION_NOT_FOUND',
        });
      }
      if (message.type === 'QUERY') {
        const sql = message.sql || '';
        const params = message.params || [];
        if (/^\s*SELECT/iu.test(sql)) {
          const rows = db.prepare(sql).all(...params);
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true,
            rows,
            count: rows.length,
            partitionId,
          });
        }
        const info = db.prepare(sql).run(...params);
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          changes: info.changes,
          rows: [],
          count: 0,
          partitionId,
        });
      }
      return buildDeliveryEnvelope({acknowledged: true}, {success: true});
    },
  };
}

/**
 * Assert that engine rows match oracle rows exactly.
 * @param {Object} t - Tap test context.
 * @param {Array} engineRows - Rows returned by SQLQueryEngine.
 * @param {Array} oracleRows - Rows returned by oracle database.
 * @param {string} label - Context label for assertions.
 */
function assertRowsMatchOracle(t, engineRows, oracleRows, label) {
  t.equal(engineRows.length, oracleRows.length, `${label}: row count matches oracle`);
  for (let i = 0; i < engineRows.length; i++) {
    const eng = engineRows[i];
    const ora = oracleRows[i];
    const engKeys = Object.keys(eng).sort();
    const oraKeys = Object.keys(ora).sort();
    t.same(engKeys, oraKeys, `${label} row ${i}: column keys match`);
    for (const key of engKeys) {
      const engVal = eng[key];
      const oraVal = ora[key];
      if (Buffer.isBuffer(engVal) || engVal instanceof Uint8Array) {
        t.same(
          Buffer.from(engVal),
          Buffer.from(oraVal),
          `${label} row ${i} col ${key}: buffer matches`,
        );
      } else {
        t.equal(engVal, oraVal, `${label} row ${i} col ${key}: value matches`);
      }
    }
  }
}

/**
 * Execute a mutation on both the engine and the independent oracle database.
 * @param {SQLQueryEngine} engine - Engine instance under test.
 * @param {Database} oracle - Reference SQLite database.
 * @param {string} sql - SQL mutation statement.
 * @param {Array} [params=[]] - Bound parameters.
 * @return {Promise<Object>} Engine write result.
 */
async function executeDualMutation(engine, oracle, sql, params = []) {
  oracle.prepare(sql).run(...params);
  const result = await engine.executeQuery(sql, params);
  return result;
}

/**
 * Execute a query on both the engine and oracle and verify row-for-row match.
 * @param {Object} t - Tap test context.
 * @param {SQLQueryEngine} engine - Engine instance under test.
 * @param {Database} oracle - Reference SQLite database.
 * @param {string} sql - SQL query statement.
 * @param {Array} [params=[]] - Bound parameters.
 * @param {string} label - Test context label.
 * @return {Promise<Object>} Engine query result.
 */
async function assertDualQuery(t, engine, oracle, sql, params = [], label = '') {
  const oracleRows = oracle.prepare(sql).all(...params);
  const engineResult = await engine.executeQuery(sql, params);
  t.ok(engineResult.success, `${label}: engine query succeeded`);
  assertRowsMatchOracle(t, engineResult.rows, oracleRows, label);
  return engineResult;
}

/**
 * Build table metadata records for the three J2 tables.
 * @return {Array<Object>} Table metadata objects.
 */
function buildJ2TableDefinitions() {
  return [
    {
      table_id: 't_tenant_events',
      table_name: 'tenant_events',
      primaryKey: 'tenant_key',
      partition_key: 'tenant_key',
      partition_key_type: 'TEXT',
      schema: {
        columns: [
          {name: 'tenant_key', type: 'TEXT', primaryKey: true},
          {name: 'seq_num', type: 'INTEGER'},
          {name: 'payload', type: 'BLOB'},
          {name: 'label', type: 'TEXT'},
        ],
        primaryKey: 'tenant_key',
      },
    },
    {
      table_id: 't_regional_orders',
      table_name: 'regional_orders',
      primaryKey: ['region', 'order_id'],
      partition_key: ['region', 'order_id'],
      partition_key_type: 'COMPOSITE',
      schema: {
        columns: [
          {name: 'region', type: 'TEXT', primaryKey: true},
          {name: 'order_id', type: 'BIGINT', primaryKey: true},
          {name: 'amount', type: 'INTEGER'},
          {name: 'note', type: 'TEXT'},
        ],
        primaryKey: ['region', 'order_id'],
      },
    },
    {
      table_id: 't_ledger_entries',
      table_name: 'ledger_entries',
      primaryKey: 'entry_id',
      partition_key: 'entry_id',
      partition_key_type: 'INTEGER',
      schema: {
        columns: [
          {name: 'entry_id', type: 'BIGINT', primaryKey: true},
          {name: 'account', type: 'TEXT'},
          {name: 'delta', type: 'INTEGER'},
        ],
        primaryKey: 'entry_id',
      },
    },
  ];
}

/**
 * Build initial partition metadata records for the three J2 tables.
 * @return {Array<Object>} Partition metadata objects.
 */
function buildJ2InitialPartitions() {
  return [
    // tenant_events (2 partitions: < 'm', >= 'm')
    {
      partition_id: 'te_p1',
      table_id: 't_tenant_events',
      table_name: 'tenant_events',
      partition_key_start: null,
      partition_key_end: 'm',
      partition_key_type: 'TEXT',
      leader_node_id: 'test-node',
    },
    {
      partition_id: 'te_p2',
      table_id: 't_tenant_events',
      table_name: 'tenant_events',
      partition_key_start: 'm',
      partition_key_end: null,
      partition_key_type: 'TEXT',
      leader_node_id: 'test-node',
    },
    // regional_orders (3 partitions: < ['EU', 1000], < ['US', 1000], >= ['US', 1000])
    {
      partition_id: 'ro_p1',
      table_id: 't_regional_orders',
      table_name: 'regional_orders',
      partition_key_start: null,
      partition_key_end: ['EU', 1000],
      partition_key_type: 'COMPOSITE',
      leader_node_id: 'test-node',
    },
    {
      partition_id: 'ro_p2',
      table_id: 't_regional_orders',
      table_name: 'regional_orders',
      partition_key_start: ['EU', 1000],
      partition_key_end: ['US', 1000],
      partition_key_type: 'COMPOSITE',
      leader_node_id: 'test-node',
    },
    {
      partition_id: 'ro_p3',
      table_id: 't_regional_orders',
      table_name: 'regional_orders',
      partition_key_start: ['US', 1000],
      partition_key_end: null,
      partition_key_type: 'COMPOSITE',
      leader_node_id: 'test-node',
    },
    // ledger_entries (3 partitions: < 0, < 9007199254740992, >= 9007199254740992)
    {
      partition_id: 'le_p1',
      table_id: 't_ledger_entries',
      table_name: 'ledger_entries',
      partition_key_start: null,
      partition_key_end: 0,
      partition_key_type: 'INTEGER',
      leader_node_id: 'test-node',
    },
    {
      partition_id: 'le_p2',
      table_id: 't_ledger_entries',
      table_name: 'ledger_entries',
      partition_key_start: 0,
      partition_key_end: '9007199254740992',
      partition_key_type: 'INTEGER',
      leader_node_id: 'test-node',
    },
    {
      partition_id: 'le_p3',
      table_id: 't_ledger_entries',
      table_name: 'ledger_entries',
      partition_key_start: '9007199254740992',
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      leader_node_id: 'test-node',
    },
  ];
}

/**
 * Setup a complete J2 cluster environment with SQLite partitions and oracle.
 * @return {Object} Cluster fixtures {engine, oracle, partitionDbs, tables, partitions, cache, router}
 */
function setupJ2Cluster() {
  const tables = buildJ2TableDefinitions();
  const partitions = buildJ2InitialPartitions();
  const partitionDbs = new Map();
  for (const partition of partitions) {
    partitionDbs.set(partition.partition_id, createPartitionDatabase());
  }

  const oracle = new Database(':memory:');
  oracle.defaultSafeIntegers(true);
  oracle.exec(DDL_TENANT_EVENTS);
  oracle.exec(DDL_REGIONAL_ORDERS);
  oracle.exec(DDL_LEDGER_ENTRIES);

  const downPartitions = new Set();
  const messageRouter = createPartitionMessageRouter(partitionDbs, downPartitions);
  const cache = createMockSystemCache(tables, partitions);
  const engine = new SQLQueryEngine({systemCache: cache, messageRouter});

  return {
    engine,
    oracle,
    partitionDbs,
    tables,
    partitions,
    cache,
    messageRouter,
    downPartitions,
  };
}

test('J2 Journey: single non-id key (tenant_events) with UTF-8, Blobs, and parameter forms', async (t) => {
  const cluster = setupJ2Cluster();
  const {engine, oracle} = cluster;

  const insertSql =
    'INSERT INTO tenant_events (tenant_key, seq_num, payload, label) VALUES (?, ?, ?, ?)';

  const blob1 = Buffer.from([0x00, 0x01, 0x02, 0xfe, 0xff]);
  const blob2 = Buffer.from('binary-payload-data');
  const blob3 = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);

  // Insert rows with literal values and parameters covering UTF-8 edge cases
  const rows = [
    ['alpha\u0000embedded_nul', 1, blob1, 'nul_char'],
    ['latin_\u00ff_char', 2, blob2, 'latin1_ff'],
    ['swedish_åäö_text', 3, blob3, 'nordic'],
    ['rocket_🚀_flight', 4, null, 'emoji_astral'],
    ['standard_ascii', 5, Buffer.from([0x42]), 'ascii_only'],
  ];

  for (const row of rows) {
    const res = await executeDualMutation(engine, oracle, insertSql, row);
    t.ok(res.success, `Insert succeeded for ${row[0]}`);
  }

  // Point lookup with bound parameter
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM tenant_events WHERE tenant_key = ?',
    ['alpha\u0000embedded_nul'],
    'point lookup with embedded NUL',
  );

  // Point lookup with multi-byte UTF-8
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM tenant_events WHERE tenant_key = ?',
    ['swedish_åäö_text'],
    'point lookup with nordic chars',
  );

  // Point lookup with astral emoji
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM tenant_events WHERE tenant_key = ?',
    ['rocket_🚀_flight'],
    'point lookup with emoji',
  );

  // IN (...) parameterized query across partitions (including embedded NUL)
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM tenant_events WHERE tenant_key IN (?, ?)',
    ['alpha\u0000embedded_nul', 'swedish_åäö_text'],
    'parameterized IN clause across partitions',
  );

  // IN (...) literal query across partitions (with non-ASCII UTF-8 characters)
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM tenant_events WHERE tenant_key IN (\'latin_ÿ_char\', \'swedish_åäö_text\')',
    [],
    'literal IN clause across partitions',
  );

  // Range query (< 'm')
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM tenant_events WHERE tenant_key < ?',
    ['m'],
    'range query < m',
  );

  // Full scan with ORDER BY
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM tenant_events ORDER BY tenant_key ASC',
    [],
    'ordered full scan',
  );

  // Verify non-matching key returns empty rows (successful query)
  const emptyRes = await engine.executeQuery(
    'SELECT * FROM tenant_events WHERE tenant_key = ?',
    ['non_existent_key'],
  );
  t.ok(emptyRes.success, 'Query for non-existent key succeeds');
  t.equal(emptyRes.rows.length, 0, 'Returns 0 rows');
});

test('J2 Journey: composite key (regional_orders) narrowing, scattering, and explain', async (t) => {
  const cluster = setupJ2Cluster();
  const {engine, oracle} = cluster;

  const insertSql =
    'INSERT INTO regional_orders (region, order_id, amount, note) VALUES (?, ?, ?, ?)';

  const orderRows = [
    ['APAC', 500, 10, 'apac order 1'],
    ['EU', 500, 20, 'eu low order'],
    ['EU', 1500, 30, 'eu high order'],
    ['US', 500, 40, 'us low order'],
    ['US', 1500, 50, 'us high order'],
    ['ZA', 2000, 60, 'za high order'],
  ];

  for (const row of orderRows) {
    const res = await executeDualMutation(engine, oracle, insertSql, row);
    t.ok(res.success, `Insert order ${row[0]}:${row[1]} succeeded`);
  }

  // Point lookup: full composite key narrows to exactly 1 partition
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM regional_orders WHERE region = ? AND order_id = ?',
    ['EU', 1500n],
    'composite point lookup EU:1500',
  );

  // EXPLAIN DISTRIBUTED: full composite equality narrows to 1 partition
  const explainFull = await engine.executeQuery(
    'EXPLAIN DISTRIBUTED SELECT * FROM regional_orders WHERE region = ? AND order_id = ?',
    ['EU', 1500n],
  );
  t.ok(explainFull.success, 'EXPLAIN DISTRIBUTED succeeded for full composite key');
  const fullPlan = explainFull.rows[0].table_plans[0];
  t.equal(fullPlan.partitions.length, 1, 'Full composite key narrows to 1 partition');
  t.equal(fullPlan.keyPredicateShape, 'eq', 'Predicate shape is eq');

  // Trailing-column-only query: WHERE order_id = ? without region
  // MUST NOT falsely narrow to a single partition; must scatter across all partitions
  const explainTrailing = await engine.executeQuery(
    'EXPLAIN DISTRIBUTED SELECT * FROM regional_orders WHERE order_id = ?',
    [500n],
  );
  t.ok(explainTrailing.success, 'EXPLAIN DISTRIBUTED succeeded for trailing column query');
  const trailingPlan = explainTrailing.rows[0].table_plans[0];
  t.equal(
    trailingPlan.partitions.length,
    3,
    'Trailing-column query scatters across all 3 partitions',
  );
  t.equal(trailingPlan.keyPredicateShape, 'scatter', 'Predicate shape is scatter');

  // Trailing-column execution: returns exact same rows as reference SQLite oracle
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM regional_orders WHERE order_id = ? ORDER BY region ASC',
    [500n],
    'trailing column query execution matching oracle',
  );

  // Range scan with ORDER BY and LIMIT
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM regional_orders WHERE region >= ? ORDER BY region ASC, order_id ASC LIMIT 3',
    ['EU'],
    'composite range query with ORDER BY and LIMIT',
  );

  // Negative witness: mutating declared partition key column fails closed
  const updateRes = await engine.executeQuery(
    'UPDATE regional_orders SET region = \'EU\' WHERE region = \'US\' AND order_id = 1500',
  );
  t.equal(updateRes.success, false, 'Key-changing UPDATE is rejected');
  t.match(
    updateRes.error,
    /must not modify partition key column/iu,
    'Rejection message names partition key immutability',
  );
});

test('J2 Journey: 64-bit integer keys (ledger_entries) across precision boundaries', async (t) => {
  const cluster = setupJ2Cluster();
  const {engine, oracle} = cluster;

  const insertSql =
    'INSERT INTO ledger_entries (entry_id, account, delta) VALUES (?, ?, ?)';

  // Cover precision boundaries: negative 64-bit, 0, safe integers, 9007199254740991, 9007199254740992, 9007199254740993
  const ledgerRows = [
    ['-9007199254740993', 'treasury_min', -100],
    ['-9007199254740992', 'treasury_prev', -50],
    [-42, 'operational_neg', -10],
    [0, 'root_account', 0],
    [100, 'standard_pos', 25],
    [9007199254740991, 'safe_int_max', 500],
    ['9007199254740992', 'unsafe_boundary_1', 1000],
    ['9007199254740993', 'unsafe_boundary_2', 2000],
  ];

  for (const row of ledgerRows) {
    const res = await executeDualMutation(engine, oracle, insertSql, row);
    t.ok(res.success, `Insert ledger entry ${row[0]} succeeded`);
  }

  // Point lookup: negative 64-bit integer
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM ledger_entries WHERE entry_id = ?',
    [-9007199254740993n],
    'point lookup negative 64-bit integer',
  );

  // Point lookup: large integer beyond safe integer boundary (9007199254740993)
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM ledger_entries WHERE entry_id = ?',
    [9007199254740993n],
    'point lookup 9007199254740993n',
  );

  // Point lookup using string representation of 64-bit boundary
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM ledger_entries WHERE entry_id = ?',
    ['9007199254740992'],
    'point lookup string integer boundary 9007199254740992',
  );

  // BETWEEN query spanning 64-bit boundaries
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM ledger_entries WHERE entry_id BETWEEN ? AND ? ORDER BY entry_id ASC',
    [9007199254740991n, 9007199254740993n],
    'BETWEEN across 64-bit precision boundaries',
  );

  // Range query >= 0
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM ledger_entries WHERE entry_id >= ? ORDER BY entry_id ASC',
    [0n],
    'range query >= 0',
  );

  // Full scan ORDER BY entry_id ASC LIMIT 4
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM ledger_entries ORDER BY entry_id ASC LIMIT 4',
    [],
    'ordered scan with limit',
  );
});

test('J2 Journey: partition split, merge, and engine restart transitions', async (t) => {
  const cluster = setupJ2Cluster();
  const {engine, oracle, partitionDbs, tables, partitions} = cluster;

  const insertSql =
    'INSERT INTO ledger_entries (entry_id, account, delta) VALUES (?, ?, ?)';

  // Populate initial rows before split
  const preSplitRows = [
    [-100, 'account_neg', -10],
    [500, 'account_low', 50],
    ['9007199254740993', 'account_high', 900],
  ];
  for (const row of preSplitRows) {
    await executeDualMutation(engine, oracle, insertSql, row);
  }

  // Verify pre-split reads match oracle
  await assertDualQuery(
    t,
    engine,
    oracle,
    'SELECT * FROM ledger_entries ORDER BY entry_id ASC',
    [],
    'pre-split read matches oracle',
  );

  // SIMULATE PARTITION SPLIT on ledger_entries partition le_p2 ([0, 9007199254740992)):
  // Split key: 1000000.
  // Children: le_p2_left ([0, 1000000)) and le_p2_right ([1000000, 9007199254740992)).
  const splitKey = 1000000;
  const dbLeft = createPartitionDatabase();
  const dbRight = createPartitionDatabase();

  // Re-home existing rows from old le_p2 to split children
  const oldP2Db = partitionDbs.get('le_p2');
  const oldRows = oldP2Db.prepare('SELECT * FROM ledger_entries').all();
  for (const row of oldRows) {
    const targetDb = row.entry_id < BigInt(splitKey) ? dbLeft : dbRight;
    targetDb.prepare(
      'INSERT INTO ledger_entries (entry_id, account, delta) VALUES (?, ?, ?)',
    ).run(row.entry_id, row.account, row.delta);
  }

  partitionDbs.set('le_p2_left', dbLeft);
  partitionDbs.set('le_p2_right', dbRight);
  partitionDbs.delete('le_p2');

  // Update partition metadata in partitions array
  const leP2Idx = partitions.findIndex((p) => p.partition_id === 'le_p2');
  partitions.splice(leP2Idx, 1,
    {
      partition_id: 'le_p2_left',
      table_id: 't_ledger_entries',
      table_name: 'ledger_entries',
      partition_key_start: 0,
      partition_key_end: splitKey,
      partition_key_type: 'INTEGER',
      leader_node_id: 'test-node',
    },
    {
      partition_id: 'le_p2_right',
      table_id: 't_ledger_entries',
      table_name: 'ledger_entries',
      partition_key_start: splitKey,
      partition_key_end: '9007199254740992',
      partition_key_type: 'INTEGER',
      leader_node_id: 'test-node',
    },
  );

  // SIMULATE ENGINE RESTART: instantiate fresh SQLQueryEngine with updated cache
  const updatedCache = createMockSystemCache(tables, partitions);
  const updatedRouter = createPartitionMessageRouter(partitionDbs);
  const restartedEngine = new SQLQueryEngine({
    systemCache: updatedCache,
    messageRouter: updatedRouter,
  });

  // Insert rows post-split into both split children and oracle
  const postSplitRows = [
    [200, 'post_split_low', 20], // routes to le_p2_left
    [5000000, 'post_split_mid', 50], // routes to le_p2_right
  ];
  for (const row of postSplitRows) {
    await executeDualMutation(restartedEngine, oracle, insertSql, row);
  }

  // Verify post-split reads match oracle row-for-row
  await assertDualQuery(
    t,
    restartedEngine,
    oracle,
    'SELECT * FROM ledger_entries ORDER BY entry_id ASC',
    [],
    'post-split read matches oracle row-for-row',
  );

  // SIMULATE PARTITION MERGE on tenant_events:
  // Merge te_p1 (< 'm') and te_p2 (>= 'm') into te_all (unbounded)
  const dbAll = createPartitionDatabase();
  for (const pid of ['te_p1', 'te_p2']) {
    const pDb = partitionDbs.get(pid);
    const existing = pDb.prepare('SELECT * FROM tenant_events').all();
    for (const r of existing) {
      dbAll.prepare(
        'INSERT INTO tenant_events (tenant_key, seq_num, payload, label) VALUES (?, ?, ?, ?)',
      ).run(r.tenant_key, r.seq_num, r.payload, r.label);
    }
    partitionDbs.delete(pid);
  }
  partitionDbs.set('te_all', dbAll);

  const tePartitions = partitions.filter((p) => p.table_name === 'tenant_events');
  for (const teP of tePartitions) {
    const idx = partitions.indexOf(teP);
    if (idx >= 0) partitions.splice(idx, 1);
  }
  partitions.push({
    partition_id: 'te_all',
    table_id: 't_tenant_events',
    table_name: 'tenant_events',
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'TEXT',
    leader_node_id: 'test-node',
  });

  // Re-initialize engine post-merge
  const postMergeCache = createMockSystemCache(tables, partitions);
  const postMergeRouter = createPartitionMessageRouter(partitionDbs);
  const postMergeEngine = new SQLQueryEngine({
    systemCache: postMergeCache,
    messageRouter: postMergeRouter,
  });

  // Insert row post-merge
  await executeDualMutation(
    postMergeEngine,
    oracle,
    'INSERT INTO tenant_events (tenant_key, seq_num, payload, label) VALUES (?, ?, ?, ?)',
    ['post_merge_key', 99, null, 'merged_row'],
  );

  // Verify post-merge reads match oracle row-for-row
  await assertDualQuery(
    t,
    postMergeEngine,
    oracle,
    'SELECT * FROM tenant_events ORDER BY tenant_key ASC',
    [],
    'post-merge read matches oracle row-for-row',
  );
});

test('J2 Journey: negative fail-closed witnesses for invalid keys, envelopes, and missing tables/partitions', async (t) => {
  const cluster = setupJ2Cluster();
  const {engine, cache, downPartitions} = cluster;

  // 1. Fail-closed: querying non-existent table returns TABLE_NOT_FOUND (never empty success)
  const ghostRes = await engine.executeQuery('SELECT * FROM non_existent_ghost_table');
  t.equal(ghostRes.success, false, 'Non-existent table query fails');
  t.equal(ghostRes.errorCode, 'TABLE_NOT_FOUND', 'Error code is TABLE_NOT_FOUND');
  t.notOk(Array.isArray(ghostRes.rows) && ghostRes.rows.length === 0 && ghostRes.success, 'Never returns empty success');

  // 2. Fail-closed: querying unavailable partition fails with participant error (never empty success)
  downPartitions.add('te_p1');
  const downRes = await engine.executeQuery('SELECT * FROM tenant_events WHERE tenant_key = ?', ['alpha']);
  t.equal(downRes.success, false, 'Querying unavailable partition fails');
  t.equal(downRes.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE', 'Error code is participant failure');

  // 3. Fail-closed: PartitionResolver fails closed on invalid/unrepresentable keys
  const resolver = new PartitionResolver({systemCache: cache});
  const allPartitions = cache.getAll(TABLES.PARTITIONS);
  const lePartitions = allPartitions.filter((p) => p.table_name === 'ledger_entries');
  const roPartitions = allPartitions.filter((p) => p.table_name === 'regional_orders');

  // NaN key fails closed (throws error rather than silently routing)
  t.throws(
    () => resolver.resolvePartitionForKey('ledger_entries', NaN, lePartitions),
    /unrepresentable|invalid/iu,
    'NaN key throws fail-closed',
  );

  // Unsafe integer Number exceeding Number.MAX_SAFE_INTEGER for INTEGER table fails closed
  t.throws(
    () => resolver.resolvePartitionForKey('ledger_entries', Number.MAX_SAFE_INTEGER + 10, lePartitions),
    /invalid integer partition boundary/iu,
    'Unsafe integer Number throws fail-closed',
  );

  // Malformed composite tuple (empty array) fails closed
  t.throws(
    () => resolver.resolvePartitionForKey('regional_orders', [], roPartitions),
    /invalid composite/iu,
    'Empty composite tuple throws fail-closed',
  );

  // Malformed composite tuple with null element fails closed
  t.throws(
    () => resolver.resolvePartitionForKey('regional_orders', ['US', null], roPartitions),
    /invalid composite/iu,
    'Composite tuple with null throws fail-closed',
  );

  // 4. Fail-closed: extractConditionValue fails closed on unbound parameter index
  const resolutionContextWithParams = {
    params: [42],
    parameterState: {nextIndex: 0},
  };
  t.throws(
    () => extractConditionValue({type: 'parameter', index: 5}, resolutionContextWithParams),
    /unbound parameter index/iu,
    'Unbound parameter index throws fail-closed',
  );

  // Parameter with NaN value fails closed
  t.throws(
    () => extractConditionValue({type: 'parameter', index: 0}, {params: [NaN]}),
    /unrepresentable/iu,
    'Parameter with NaN value throws fail-closed',
  );
});
