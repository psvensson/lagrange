/**
 * Guard: cross-partition JOIN pushdown.
 *
 * The partition side executes the DELIVERED SQL against a real SQLite
 * database per partition, so the guard proves the real pushdown: the
 * join table's own WHERE conjuncts, the required column projection,
 * and the join-key IN semi-filter land in the per-partition SQL
 * (reducing join-table row transfer) while join results stay identical
 * to a single-database oracle — including the OUTER-join rule that a
 * right-table WHERE conjunct of a LEFT JOIN is NOT pushed below the
 * join (SQL applies WHERE after the join).
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {MigrationPipeline} from '../../src/migration/migration-pipeline.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {QUERY_JOIN_PUSHDOWN} from '../../src/query/query-constants.js';
import {
  PARTITION_SERVICE_REMOTE_QUERY_METHODS,
} from '../../src/partition/partition-service-remote-query-methods.js';
import {
  ParallelQueryCoordinator,
} from '../../src/query/distributed/parallel-query-coordinator.js';
import {
  areSqlScalarsEqualWithAffinity,
  buildColumnAffinityMapFromColumns,
  compareSqlScalarsWithAffinity,
  residualPredicateAdmitsRow,
} from '../../src/query/distributed/residual-predicate-evaluator.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TABLE_DDL = {
  users:
    'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, ' +
    'age INTEGER, region TEXT)',
  orders:
    'CREATE TABLE orders (order_id INTEGER PRIMARY KEY, ' +
    'user_id INTEGER, amount INTEGER, status TEXT)',
};

const INSERT_SQL = {
  users: 'INSERT INTO users (id, name, age, region) VALUES (?, ?, ?, ?)',
  orders:
    'INSERT INTO orders (order_id, user_id, amount, status) ' +
    'VALUES (?, ?, ?, ?)',
};

function insertRows(db, table, rows) {
  const insert = db.prepare(INSERT_SQL[table]);
  for (const row of rows) {
    insert.run(...row);
  }
}

/**
 * Build a cluster whose partitions each host one table slice backed by
 * a real SQLite database executing the delivered SQL, plus a single-DB
 * oracle holding every row of both tables.
 * @param {Object} partitionSpec - partitionId -> {table, rows}.
 * @return {Object} {executor, deliveries, tablePlans, oracle,
 *   partitionIdsByTable}.
 */
function buildJoinCluster(partitionSpec) {
  const partitionDbs = new Map();
  const partitionIdsByTable = {users: [], orders: []};
  const oracle = new Database(':memory:');
  oracle.exec(TABLE_DDL.users);
  oracle.exec(TABLE_DDL.orders);

  for (const [partitionId, spec] of Object.entries(partitionSpec)) {
    const db = new Database(':memory:');
    db.exec(TABLE_DDL[spec.table]);
    insertRows(db, spec.table, spec.rows);
    insertRows(oracle, spec.table, spec.rows);
    partitionDbs.set(partitionId, db);
    partitionIdsByTable[spec.table].push(partitionId);
  }

  const deliveries = [];
  const messageRouter = {
    async deliver(address, message) {
      if (message.type !== 'QUERY') {
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      }
      const partitionId = address.split('/')[2];
      const db = partitionDbs.get(partitionId);
      const rows = db.prepare(message.sql).all(...(message.params || []));
      deliveries.push({
        partitionId,
        sql: message.sql,
        params: message.params || [],
        rowCount: rows.length,
      });
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rows,
        count: rows.length,
        partitionId,
      });
    },
  };

  const services = [...partitionDbs.keys()].map((partitionId) => ({
    service_id: partitionId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${partitionId}`,
    status: 'active',
  }));
  const systemCache = {
    services,
    filter(type, predicate) {
      return type === 'services' ? this.services.filter(predicate) : [];
    },
    get() {
      return null;
    },
    getAll(type) {
      return type === 'services' ? this.services : [];
    },
  };

  const tablePlans = new Map();
  tablePlans.set('orders', {partitions: partitionIdsByTable.orders});

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter, systemCache});
  return {executor, deliveries, tablePlans, oracle, partitionIdsByTable};
}

function standardJoinCluster() {
  return buildJoinCluster({
    users_p1: {
      table: 'users',
      rows: [
        [1, 'alice', 35, 'east'],
        [2, 'bob', 28, 'west'],
      ],
    },
    users_p2: {
      table: 'users',
      rows: [
        [3, 'carol', 40, 'east'],
        [4, 'dave', 50, 'west'],
        [5, 'erin', 60, 'north'],
      ],
    },
    orders_p1: {
      table: 'orders',
      rows: [
        [10, 1, 5, 'paid'],
        [11, 2, 10, 'paid'],
        [12, 3, 100, 'void'],
      ],
    },
    orders_p2: {
      table: 'orders',
      rows: [
        [13, 3, 7, 'paid'],
        [14, 4, 45, 'paid'],
        [15, 9, 1, 'paid'],
      ],
    },
  });
}

const TOTAL_ORDER_ROWS = 6;

async function runJoin(cluster, sql, params = []) {
  const ast = new SQLParser(sql).parse();
  const result = await cluster.executor.executeSelect(
    ast,
    cluster.partitionIdsByTable.users,
    params,
    {distributedPlan: {tablePlans: cluster.tablePlans}},
  );
  if (!result.success) {
    throw new Error(`join query failed: ${JSON.stringify(result)}`);
  }
  return result.rows;
}

function sortRows(rows) {
  return [...rows]
    .map((row) => JSON.stringify(sortKeys(row)))
    .sort();
}

function sortKeys(row) {
  const out = {};
  for (const key of Object.keys(row).sort()) {
    out[key] = row[key];
  }
  return out;
}

function ordersDeliveries(cluster) {
  return cluster.deliveries.filter((delivery) =>
    delivery.sql.includes('FROM orders'),
  );
}

function usersDeliveries(cluster) {
  return cluster.deliveries.filter((delivery) =>
    delivery.sql.includes('FROM users'),
  );
}

test('INNER JOIN pushes join-table WHERE, semi-filter, and keeps ' +
  'oracle-identical results with a cross-table residual', async (t) => {
  const cluster = standardJoinCluster();
  const sql =
    'SELECT * FROM users AS u INNER JOIN orders AS o ' +
    'ON u.id = o.user_id ' +
    'WHERE u.age > ? AND o.status = ? AND u.age > o.amount';
  const params = [30, 'paid'];

  const rows = await runJoin(cluster, sql, params);
  const oracleRows = cluster.oracle.prepare(sql).all(...params);
  t.ok(oracleRows.length > 0, 'oracle produces rows (test is non-vacuous)');
  t.same(
    sortRows(rows),
    sortRows(oracleRows),
    'join results identical to single-DB oracle',
  );

  for (const delivery of usersDeliveries(cluster)) {
    t.match(delivery.sql, /WHERE \(u\.age > \?\)/,
      'main-table WHERE conjunct pushed into users SQL');
    t.same(delivery.params, [30], 'main fetch binds only its own param');
    t.notMatch(delivery.sql, /status/,
      'join-table conjunct not sent to the main table');
  }
  const orderFetches = ordersDeliveries(cluster);
  t.ok(orderFetches.length > 0, 'orders fetch happened');
  for (const delivery of orderFetches) {
    t.match(delivery.sql, /o\.status = \?/,
      'join-table WHERE conjunct pushed into orders SQL');
    t.match(delivery.sql, /user_id IN \(\?, \?, \?, \?\)/,
      'join-key semi-filter pushed with parameter placeholders');
    t.same(delivery.params.slice(0, 1), ['paid'],
      'pushed conjunct param bound first');
    t.same([...delivery.params.slice(1)].sort(), [1, 3, 4, 5],
      'distinct filtered main-side keys bound as IN params');
    t.notMatch(delivery.sql, /age/,
      'cross-table residual conjunct stays coordinator-side');
  }
  const transferred = orderFetches.reduce(
    (sum, delivery) => sum + delivery.rowCount,
    0,
  );
  t.ok(
    transferred < TOTAL_ORDER_ROWS,
    `join-table row transfer reduced (${transferred} < ` +
      `${TOTAL_ORDER_ROWS})`,
  );
});

test('LEFT JOIN does NOT push right-table WHERE below the join but ' +
  'results still match the oracle', async (t) => {
  const cluster = standardJoinCluster();
  const sql =
    'SELECT * FROM users AS u LEFT JOIN orders AS o ' +
    'ON u.id = o.user_id WHERE o.status = ?';
  const params = ['paid'];

  const rows = await runJoin(cluster, sql, params);
  const oracleRows = cluster.oracle.prepare(sql).all(...params);
  t.ok(oracleRows.length > 0, 'oracle produces rows');
  t.same(
    sortRows(rows),
    sortRows(oracleRows),
    'LEFT JOIN + right-table WHERE matches the oracle ' +
      '(WHERE applied after the join)',
  );

  for (const delivery of ordersDeliveries(cluster)) {
    t.notMatch(delivery.sql, /status/,
      'right-table WHERE conjunct NOT pushed for LEFT JOIN');
    t.notMatch(delivery.sql, / IN \(/,
      'no join-key semi-filter for LEFT JOIN');
    t.same(delivery.params, [],
      'no params delivered to the LEFT JOIN right fetch');
  }
});

test('LEFT JOIN pushes main-table WHERE and preserves NULL-extended ' +
  'rows', async (t) => {
  const cluster = standardJoinCluster();
  const sql =
    'SELECT * FROM users AS u LEFT JOIN orders AS o ' +
    'ON u.id = o.user_id WHERE u.age > ?';
  const params = [30];

  const rows = await runJoin(cluster, sql, params);
  const oracleRows = cluster.oracle.prepare(sql).all(...params);
  t.same(sortRows(rows), sortRows(oracleRows),
    'LEFT JOIN with main-table WHERE matches the oracle');
  t.ok(
    rows.some((row) => row.order_id === null),
    'NULL-extended row for a user without orders survives',
  );
  for (const delivery of usersDeliveries(cluster)) {
    t.match(delivery.sql, /WHERE \(u\.age > \?\)/,
      'main-table conjunct pushed for LEFT JOIN');
  }
});

test('fully-qualified SELECT list pushes the join-table projection',
  async (t) => {
    const cluster = standardJoinCluster();
    const sql =
      'SELECT u.name, o.amount FROM users AS u INNER JOIN orders AS o ' +
      'ON u.id = o.user_id WHERE o.status = ?';
    const params = ['paid'];

    const rows = await runJoin(cluster, sql, params);
    const oracleRows = cluster.oracle.prepare(sql).all(...params);
    t.same(
      sortRows(rows.map((row) => ({name: row.name, amount: row.amount}))),
      sortRows(oracleRows),
      'projected values match the oracle',
    );
    for (const delivery of ordersDeliveries(cluster)) {
      t.match(delivery.sql, /^SELECT amount, status, user_id FROM orders/,
        'orders fetch projects only the needed columns');
      t.notMatch(delivery.sql, /SELECT \*/,
        'orders fetch is not SELECT *');
    }
  });

test('SELECT * falls back to star projection for the join table',
  async (t) => {
    const cluster = standardJoinCluster();
    await runJoin(
      cluster,
      'SELECT * FROM users AS u INNER JOIN orders AS o ' +
        'ON u.id = o.user_id',
    );
    for (const delivery of ordersDeliveries(cluster)) {
      t.match(delivery.sql, /^SELECT \* FROM orders/,
        'star SELECT keeps the full join-table row');
    }
  });

test('unqualified WHERE column is attributed to the main table',
  async (t) => {
    const cluster = standardJoinCluster();
    const sql =
      'SELECT * FROM users AS u INNER JOIN orders AS o ' +
      'ON u.id = o.user_id WHERE age > ?';
    const params = [30];

    const rows = await runJoin(cluster, sql, params);
    const oracleRows = cluster.oracle.prepare(sql).all(...params);
    t.same(sortRows(rows), sortRows(oracleRows),
      'unqualified main-table WHERE matches the oracle');
    for (const delivery of usersDeliveries(cluster)) {
      t.match(delivery.sql, /WHERE \(age > \?\)/,
        'unqualified conjunct pushed to the main table');
    }
    for (const delivery of ordersDeliveries(cluster)) {
      t.notMatch(delivery.sql, /age/,
        'unqualified conjunct not sent to the join table');
    }
  });

test('above-threshold key sets skip the IN semi-filter but keep ' +
  'WHERE pushdown', async (t) => {
  const maxValues = QUERY_JOIN_PUSHDOWN.JOIN_KEY_PUSHDOWN_MAX_VALUES;
  const userCount = maxValues + 1;
  const usersP1 = [];
  const usersP2 = [];
  for (let id = 1; id <= userCount; id++) {
    const row = [id, `user-${id}`, 30 + (id % 20), 'east'];
    (id % 2 === 0 ? usersP1 : usersP2).push(row);
  }
  const cluster = buildJoinCluster({
    users_p1: {table: 'users', rows: usersP1},
    users_p2: {table: 'users', rows: usersP2},
    orders_p1: {
      table: 'orders',
      rows: [
        [10, 1, 5, 'paid'],
        [11, 2, 10, 'void'],
      ],
    },
    orders_p2: {
      table: 'orders',
      rows: [
        [12, 3, 7, 'paid'],
      ],
    },
  });
  const sql =
    'SELECT * FROM users AS u INNER JOIN orders AS o ' +
    'ON u.id = o.user_id WHERE o.status = ?';
  const params = ['paid'];

  const rows = await runJoin(cluster, sql, params);
  const oracleRows = cluster.oracle.prepare(sql).all(...params);
  t.same(sortRows(rows), sortRows(oracleRows),
    'over-threshold join matches the oracle');
  const orderFetches = ordersDeliveries(cluster);
  t.ok(orderFetches.length > 0, 'orders fetch happened');
  for (const delivery of orderFetches) {
    t.notMatch(delivery.sql, / IN \(/,
      'semi-filter skipped above the key threshold');
    t.match(delivery.sql, /o\.status = \?/,
      'join-table WHERE conjunct still pushed');
    t.same(delivery.params, ['paid'],
      'pushed conjunct param still bound');
  }
});

test('empty filtered main side skips the INNER join-table fetch and ' +
  'returns no rows', async (t) => {
  const cluster = standardJoinCluster();
  const sql =
    'SELECT * FROM users AS u INNER JOIN orders AS o ' +
    'ON u.id = o.user_id WHERE u.age > ?';
  const params = [1000];

  const rows = await runJoin(cluster, sql, params);
  t.same(rows, [], 'no rows when the filtered main side is empty');
  t.same(ordersDeliveries(cluster), [],
    'join-table fetch skipped for an empty INNER left side');
});

test('residual predicates follow SQL three-valued NULL semantics',
  async (t) => {
    const cluster = buildJoinCluster({
      users_p1: {
        table: 'users',
        rows: [
          [1, null, null, 'east'],
          [2, 'bob', 28, 'west'],
        ],
      },
      users_p2: {
        table: 'users',
        rows: [
          [3, 'paid', 40, 'east'],
        ],
      },
      orders_p1: {
        table: 'orders',
        rows: [
          [10, 1, 100, null],
          [11, 2, 10, 'paid'],
          [12, 3, 7, 'paid'],
        ],
      },
      orders_p2: {
        table: 'orders',
        rows: [],
      },
    });

    const nullComparisons = [
      // NULL = NULL and NULL = value are UNKNOWN, never matches.
      'SELECT * FROM users AS u JOIN orders AS o ON u.id = o.user_id ' +
        'WHERE u.name = o.status',
      // NULL < value is UNKNOWN (JS null < 100 would keep the row).
      'SELECT * FROM users AS u JOIN orders AS o ON u.id = o.user_id ' +
        'WHERE u.age < o.amount',
      // NULL <> value is UNKNOWN (JS null !== 'x' would keep the row).
      'SELECT * FROM users AS u JOIN orders AS o ON u.id = o.user_id ' +
        'WHERE u.name <> o.status',
    ];
    for (const sql of nullComparisons) {
      const rows = await runJoin(cluster, sql);
      const oracleRows = cluster.oracle.prepare(sql).all();
      t.same(sortRows(rows), sortRows(oracleRows),
        `NULL-involved comparison matches SQLite: ${sql.slice(-30)}`);
    }
  });

test('LEFT JOIN residual comparisons filter NULL-extended rows like ' +
  'SQLite', async (t) => {
  const cluster = standardJoinCluster();

  // erin (id 5) has no orders: her NULL-extended row has o.status NULL,
  // so `o.status <> 'void'` is UNKNOWN and must filter her out.
  const notEqualSql =
    'SELECT * FROM users AS u LEFT JOIN orders AS o ' +
    'ON u.id = o.user_id WHERE o.status <> ?';
  const rows = await runJoin(cluster, notEqualSql, ['void']);
  const oracleRows = cluster.oracle.prepare(notEqualSql).all('void');
  t.same(sortRows(rows), sortRows(oracleRows),
    'NULL-extended row is filtered by <> like SQLite');
  t.notOk(rows.some((row) => row.order_id === null),
    'no NULL-extended row survives the <> residual');

  // IS NULL is the one predicate that keeps the NULL-extended row.
  const isNullSql =
    'SELECT * FROM users AS u LEFT JOIN orders AS o ' +
    'ON u.id = o.user_id WHERE o.status IS NULL';
  const isNullRows = await runJoin(cluster, isNullSql);
  const isNullOracle = cluster.oracle.prepare(isNullSql).all();
  t.same(sortRows(isNullRows), sortRows(isNullOracle),
    'IS NULL keeps exactly the NULL-extended rows');
  t.ok(isNullRows.length > 0, 'the NULL-extended row is present');
});

test('STOCK_LEVEL_COUNT join and residual predicates match SQLite numeric ' +
  'INTEGER columns against PG-wire text-format string bind parameters',
async (t) => {
  const orderLineDb = new Database(':memory:');
  orderLineDb.exec(
    'CREATE TABLE order_line (warehouse_id INTEGER, district_id INTEGER, ' +
      'order_id INTEGER, line_number INTEGER, item_id INTEGER)',
  );
  const insertOl = orderLineDb.prepare(
    'INSERT INTO order_line VALUES (?, ?, ?, ?, ?)',
  );
  for (let item = 1; item <= 5; item += 1) {
    insertOl.run(1, 1, 1, item, item);
  }
  insertOl.run(1, 1, 2, 1, 6);

  const stockDb = new Database(':memory:');
  stockDb.exec(
    'CREATE TABLE stock (warehouse_id INTEGER, item_id INTEGER, ' +
      'quantity INTEGER)',
  );
  const insertStock = stockDb.prepare('INSERT INTO stock VALUES (?, ?, ?)');
  for (let item = 1; item <= 5; item += 1) {
    insertStock.run(1, item, 10 + item);
    insertStock.run(2, item, 10 + item);
  }
  insertStock.run(1, 6, 25);

  const partitionDbs = new Map([
    ['order_line_p1', orderLineDb],
    ['stock_p1', stockDb],
  ]);
  const messageRouter = {
    async deliver(address, message) {
      if (message.type !== 'QUERY') {
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      }
      const partitionId = address.split('/')[2];
      const db = partitionDbs.get(partitionId);
      const rows = db.prepare(message.sql).all(...(message.params || []));
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rows,
        count: rows.length,
        partitionId,
      });
    },
  };
  const services = [...partitionDbs.keys()].map((partitionId) => ({
    service_id: partitionId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${partitionId}`,
    status: 'active',
  }));
  const systemCache = {
    services,
    filter(type, predicate) {
      return type === 'services' ? this.services.filter(predicate) : [];
    },
    get() {
      return null;
    },
    getAll(type) {
      return type === 'services' ? this.services : [];
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter,
    systemCache,
  });
  const tablePlans = new Map([['s', {partitions: ['stock_p1']}]]);

  const stockLevelSql =
    'SELECT COUNT(DISTINCT ol.item_id) AS low_stock ' +
    'FROM order_line AS ol JOIN stock AS s ' +
    'ON s.warehouse_id = $1 AND s.item_id = ol.item_id ' +
    'WHERE ol.warehouse_id = $2 AND ol.district_id = $3 ' +
    'AND ol.order_id >= $4 AND ol.order_id < $5 AND s.quantity < $6';
  const stringParams = ['1', '1', '1', '1', '2', '19'];
  const ast = new SQLParser(stockLevelSql, {dialect: 'postgresql'}).parse();
  const result = await executor.executeSelect(
    ast,
    ['order_line_p1'],
    stringParams,
    {distributedPlan: {tablePlans}},
  );
  t.equal(result.success, true, 'STOCK_LEVEL_COUNT select succeeds');
  t.same(
    result.rows,
    [{low_stock: 5}],
    'STOCK_LEVEL_COUNT with string bind params returns low_stock = 5',
  );

  const leftJoinResidualSql =
    'SELECT COUNT(DISTINCT ol.item_id) AS low_stock ' +
    'FROM order_line AS ol LEFT JOIN stock AS s ' +
    'ON s.item_id = ol.item_id ' +
    'WHERE ol.warehouse_id = $1 AND ol.district_id = $2 ' +
    'AND ol.order_id = $3 AND s.warehouse_id = $4 AND s.quantity < $5';
  const residualAst = new SQLParser(leftJoinResidualSql, {
    dialect: 'postgresql',
  }).parse();
  const residualResult = await executor.executeSelect(
    residualAst,
    ['order_line_p1'],
    ['1', '1', '1', '1', '19'],
    {distributedPlan: {tablePlans}},
  );
  t.equal(residualResult.success, true, 'LEFT JOIN residual select succeeds');
  t.same(
    residualResult.rows,
    [{low_stock: 5}],
    'residual WHERE predicates coerce PG-wire string params against SQLite numeric columns',
  );

  // Safe-integer boundary and SQLite Section 4.2 affinity controls:
  const evalColVsLiteralEq = (colVal, literalVal, affinity = 'NUMERIC') =>
    executor.evaluateBinary(
      {a: colVal},
      {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'a', affinity},
        right: {type: 'literal', value: literalVal},
      },
    );
  const evalResidualColVsLiteralEq = (colVal, literalVal, affinity = 'NUMERIC') =>
    residualPredicateAdmitsRow(
      {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'a', affinity},
        right: {type: 'literal', value: literalVal},
      },
      {a: colVal},
    );
  for (const [colVal, literalVal, affinity, label] of [
    ['9007199254740993', 9007199254740992, 'NUMERIC', 'unsafe 64-bit integer string vs rounded number'],
    ['1.0', 1, 'TEXT', 'TEXT column "1.0" vs integer literal 1'],
    ['01', '1', 'TEXT', 'leading-zero string vs canonical string'],
    [1, '01', 'BLOB', 'BLOB column holding numeric 1 vs bound text "01"'],
    ['abc', 'def', 'TEXT', 'distinct non-numeric strings'],
    [null, 1, 'NUMERIC', 'null vs number'],
    [undefined, '1', 'TEXT', 'undefined vs string'],
    [true, '1', 'NUMERIC', 'boolean true vs string 1'],
    [false, '0', 'NUMERIC', 'boolean false vs string 0'],
    [NaN, '0', 'NUMERIC', 'NaN vs string 0'],
  ]) {
    t.equal(evalColVsLiteralEq(colVal, literalVal, affinity), false, `evaluateBinary rejects ${label}`);
    t.equal(
      evalResidualColVsLiteralEq(colVal, literalVal, affinity),
      false,
      `residualPredicateAdmitsRow rejects ${label}`,
    );
  }
  t.equal(
    evalColVsLiteralEq(1, '01', 'NUMERIC'),
    true,
    'evaluateBinary coerces numeric text "01" against NUMERIC column 1',
  );
  t.equal(
    evalResidualColVsLiteralEq(1, '01', 'NUMERIC'),
    true,
    'residualPredicateAdmitsRow coerces numeric text "01" against NUMERIC column 1',
  );
  t.equal(
    evalColVsLiteralEq(1, '01', null),
    false,
    'unannotated column_ref defaults to NONE affinity, never runtime typeof inference',
  );
  t.equal(
    areSqlScalarsEqualWithAffinity('01', 1, 'NONE', 'NONE'),
    false,
    'NONE vs NONE performs no coercion',
  );
  t.equal(
    compareSqlScalarsWithAffinity(1, '01', 'NONE', 'NONE'),
    -1,
    'NONE vs NONE orders number < string',
  );
});

test('SQLite Section 4.2 affinity parity against better-sqlite3 oracle: ' +
  'declared column affinity, IN list right-hand NONE affinity, and aggregate NONE affinity', async (t) => {
  const leftDb = new Database(':memory:');
  const rightDb = new Database(':memory:');
  const oracleDb = new Database(':memory:');
  t.after(() => {
    leftDb.close();
    rightDb.close();
    oracleDb.close();
  });

  const ddl = `
    CREATE TABLE a (
      id INTEGER PRIMARY KEY,
      label TEXT
    );
    CREATE TABLE b (
      id INTEGER PRIMARY KEY,
      a_id INTEGER,
      blob_col BLOB,
      mixed NUMERIC,
      t TEXT,
      n INTEGER
    );
  `;
  for (const db of [leftDb, rightDb, oracleDb]) {
    db.exec(ddl);
  }
  for (const db of [leftDb, oracleDb]) {
    db.prepare('INSERT INTO a VALUES (?, ?)').run(1, 'row-1');
    db.prepare('INSERT INTO a VALUES (?, ?)').run(2, 'row-2');
  }
  for (const db of [rightDb, oracleDb]) {
    // Row 1: blob_col holds numeric 1, mixed holds '1x', t holds '01', n holds 1
    db.prepare('INSERT INTO b VALUES (?, ?, ?, ?, ?, ?)').run(10, 1, 1, '1x', '01', 1);
    // Row 2 (positive control row): blob_col holds Buffer('1'), mixed holds 1, t holds '1', n holds 1
    db.prepare('INSERT INTO b VALUES (?, ?, ?, ?, ?, ?)').run(20, 2, Buffer.from('1'), 1, '1', 1);
  }

  const partitionDbs = new Map([
    ['a_p1', leftDb],
    ['b_p1', rightDb],
  ]);
  const messageRouter = {
    async deliver(address, message) {
      if (message.type !== 'QUERY') {
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      }
      const partitionId = address.split('/')[2];
      const db = partitionDbs.get(partitionId);
      const rows = db.prepare(message.sql).all(...(message.params || []));
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rows,
        count: rows.length,
        partitionId,
      });
    },
  };
  const services = [...partitionDbs.keys()].map((partitionId) => ({
    service_id: partitionId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${partitionId}`,
    status: 'active',
  }));
  const systemCache = {
    services,
    filter(type, predicate) {
      return type === 'services' ? this.services.filter(predicate) : [];
    },
    get() {
      return null;
    },
    getAll(type) {
      return type === 'services' ? this.services : [];
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter,
    systemCache,
  });
  const tablePlans = new Map([['b', {partitions: ['b_p1']}]]);

  const execJoin = async (sql, params = [], parserOptions = {}) => {
    const ast = new SQLParser(sql, parserOptions).parse();
    const res = await executor.executeSelect(
      ast,
      ['a_p1'],
      params,
      {distributedPlan: {tablePlans}},
    );
    t.equal(res.success, true, `executeSelect succeeds for: ${sql}`);
    return res.rows.map((r) => r.id);
  };

  // Counterexample 1: BLOB column containing numeric 1 compared with bound text '01'
  const blobSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.blob_col = ?';
  const blobOracle = oracleDb.prepare(blobSql).all('01').map((r) => r.id);
  t.same(blobOracle, [], 'SQLite oracle rejects BLOB column holding numeric 1 vs bound text "01"');
  t.same(await execJoin(blobSql, ['01']), blobOracle,
    'candidate matches SQLite oracle for BLOB column holding numeric 1 vs "01"');

  // Counterexample 2: NUMERIC column containing text '1x' evaluated with mixed < 2
  const mixedSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.mixed < 2';
  const mixedOracle = oracleDb.prepare(mixedSql).all().map((r) => r.id);
  t.same(mixedOracle, [2], 'SQLite oracle excludes row 1 ("1x" < 2 is false) and keeps control row 2');
  t.same(await execJoin(mixedSql), mixedOracle,
    'candidate matches SQLite oracle for NUMERIC column holding "1x" with mixed < 2');

  // Counterexample 3: TEXT column '01' evaluated with t IN (n) where INTEGER column n contains 1
  const inSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.t IN (b.n)';
  const inOracle = oracleDb.prepare(inSql).all().map((r) => r.id);
  t.same(inOracle, [2], 'SQLite oracle excludes row 1 ("01" IN (1)) and keeps control row 2 ("1" IN (1))');
  t.same(await execJoin(inSql), inOracle,
    'candidate matches SQLite oracle for TEXT column in IN (INTEGER column)');

  // Counterexample 4: HAVING SUM(b.n) = '01' where group sum is 1
  const havingSql =
    'SELECT a.id, SUM(b.n) AS total FROM a LEFT JOIN b ON a.id = b.a_id ' +
    'GROUP BY a.id HAVING SUM(b.n) = \'01\'';
  const havingOracle = oracleDb.prepare(havingSql).all().map((r) => r.id);
  t.same(havingOracle, [], 'SQLite oracle returns [] for HAVING SUM(b.n) = "01" when sum is 1');
  t.same(await execJoin(havingSql), havingOracle,
    'candidate matches SQLite oracle for HAVING SUM(b.n) = "01"');

  // Positive controls: TEXT '1.0' = 1 -> [], INTEGER 1 = '1' -> [1, 2], INTEGER 1 = '01' -> [1, 2], BLOB binding
  const intEqOneSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.n = \'1\' ORDER BY a.id';
  t.same(await execJoin(intEqOneSql), oracleDb.prepare(intEqOneSql).all().map((r) => r.id),
    'INTEGER 1 = "1" positive control matches oracle');

  const intEqZeroOneSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.n = \'01\' ORDER BY a.id';
  t.same(await execJoin(intEqZeroOneSql), oracleDb.prepare(intEqZeroOneSql).all().map((r) => r.id),
    'INTEGER 1 = "01" positive control matches oracle');

  const blobBindOnIntSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.n = ?';
  t.same(
    await execJoin(blobBindOnIntSql, [Buffer.from('1')]),
    oracleDb.prepare(blobBindOnIntSql).all(Buffer.from('1')).map((r) => r.id),
    'numeric BLOB binding against INTEGER column matches oracle ([])',
  );
  const blobBindOnBlobSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.blob_col = ?';
  t.same(
    await execJoin(blobBindOnBlobSql, [Buffer.from('1')]),
    oracleDb.prepare(blobBindOnBlobSql).all(Buffer.from('1')).map((r) => r.id),
    'BLOB binding against BLOB column matches oracle ([2])',
  );

  // Counterexample 5 (Non-join HAVING): SELECT n, COUNT(*) AS total FROM b GROUP BY n HAVING n = '01'
  const nonJoinHavingSql =
    'SELECT n, COUNT(*) AS total FROM b GROUP BY n HAVING n = \'01\'';
  const nonJoinHavingAst = new SQLParser(nonJoinHavingSql).parse();
  const nonJoinHavingRes = await executor.executeSelect(
    nonJoinHavingAst,
    ['b_p1'],
    [],
  );
  t.equal(nonJoinHavingRes.success, true, 'non-join HAVING select succeeds');
  t.same(
    nonJoinHavingRes.rows,
    oracleDb.prepare(nonJoinHavingSql).all(),
    'non-join HAVING n = "01" annotates combineSpec.having and matches SQLite oracle',
  );

  // Counterexample 6 (Quoted '(' default in CREATE TABLE):
  const parenDdl = `
    CREATE TABLE b_paren (
      id INTEGER PRIMARY KEY,
      a_id INTEGER,
      label TEXT DEFAULT '(',
      n INTEGER
    );
  `;
  for (const db of [rightDb, oracleDb]) {
    db.exec(parenDdl);
    db.prepare('INSERT INTO b_paren (id, a_id, n) VALUES (?, ?, ?)').run(10, 1, 1);
  }
  tablePlans.set('bp', {partitions: ['b_p1']});
  const parenSql =
    'SELECT a.id FROM a LEFT JOIN b_paren AS bp ON a.id = bp.a_id WHERE bp.n = \'01\'';
  t.same(
    await execJoin(parenSql),
    oracleDb.prepare(parenSql).all().map((r) => r.id),
    'DDL parser preserves column after DEFAULT "(" and matches SQLite oracle ([1])',
  );

  // Counterexample 7 (Retained executor across ALTER TABLE ADD COLUMN, including INT8):
  for (const db of [rightDb, oracleDb]) {
    db.exec('ALTER TABLE b ADD COLUMN added_n INTEGER DEFAULT 1');
  }
  const alterSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.added_n = \'01\' ORDER BY a.id';
  const alterOracle = oracleDb.prepare(alterSql).all().map((r) => r.id);
  t.same(alterOracle, [1, 2], 'SQLite oracle returns [1, 2] after ALTER TABLE ADD COLUMN');
  t.same(
    await execJoin(alterSql),
    alterOracle,
    'retained executor observes newly added INTEGER column affinity after ALTER TABLE',
  );

  const alterInt8Ast = new SQLParser('ALTER TABLE b ADD COLUMN n8 INT8 DEFAULT 1').parse();
  const alterInt8Spec = new MigrationPipeline({migrationCoordinator: {}}).buildAlterSpec(
    alterInt8Ast,
  );
  for (const db of [rightDb, oracleDb]) {
    db.exec(alterInt8Spec.sql);
  }
  const int8ParamSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.n8 = $1 ORDER BY a.id';
  const intControlParamSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.n = $1 ORDER BY a.id';
  t.same(
    await execJoin(intControlParamSql, ['01'], {dialect: 'postgresql'}),
    oracleDb.prepare('SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.n = ? ORDER BY a.id')
      .all('01')
      .map((r) => r.id),
    'existing INTEGER column n with bound text parameter "01" matches SQLite oracle',
  );
  t.same(
    await execJoin(int8ParamSql, [1], {dialect: 'postgresql'}),
    oracleDb.prepare('SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.n8 = ? ORDER BY a.id')
      .all(1)
      .map((r) => r.id),
    'ALTER TABLE added INT8 column n8 with bound numeric parameter 1 returns [1, 2]',
  );
  t.same(
    await execJoin(int8ParamSql, ['01'], {dialect: 'postgresql'}),
    oracleDb.prepare('SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.n8 = ? ORDER BY a.id')
      .all('01')
      .map((r) => r.id),
    'ALTER TABLE added INT8 column n8 with bound text parameter "01" preserves NUMERIC affinity and returns [1, 2]',
  );

  // End-to-end PG-dialect witness for quoted "INT8" type in ALTER TABLE:
  const alterPgQn8Ast = new SQLParser(
    'ALTER TABLE b ADD COLUMN qn8 "INT8" DEFAULT 1;',
    {dialect: 'postgresql'},
  ).parse();
  const alterPgQn8Spec = new MigrationPipeline({migrationCoordinator: {}}).buildAlterSpec(
    alterPgQn8Ast,
  );
  t.equal(
    buildColumnAffinityMapFromColumns([
      {name: alterPgQn8Spec.columnName, type: alterPgQn8Spec.dataType},
    ]).get('qn8'),
    'NUMERIC',
    'buildColumnAffinityMapFromColumns maps PG-dialect quoted "INT8" to NUMERIC',
  );
  for (const db of [rightDb, oracleDb]) {
    db.exec(alterPgQn8Spec.sql);
  }
  const qn8ParamSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.qn8 = $1 ORDER BY a.id';
  const qn8OracleSql =
    'SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.qn8 = ? ORDER BY a.id';
  const qn8TextOracle = oracleDb.prepare(qn8OracleSql).all('01').map((r) => r.id);
  t.same(qn8TextOracle, [1, 2], 'oracle returns [1, 2] for quoted "INT8" vs bound "01"');
  t.same(
    await execJoin(qn8ParamSql, ['01'], {dialect: 'postgresql'}),
    qn8TextOracle,
    'PG-dialect ALTER TABLE quoted "INT8" column qn8 with bound "01" returns [1, 2]',
  );
  const qn8NumOracle = oracleDb.prepare(qn8OracleSql).all(1).map((r) => r.id);
  t.same(qn8NumOracle, [1, 2], 'oracle returns [1, 2] for quoted "INT8" vs bound 1');
  t.same(
    await execJoin(qn8ParamSql, [1], {dialect: 'postgresql'}),
    qn8NumOracle,
    'PG-dialect ALTER TABLE quoted "INT8" column qn8 with bound 1 returns [1, 2]',
  );

  // SQLite 3.49.2 oracle parity matrix for quoted/split/NONE datatype names:
  const quotedTypeMatrix = [
    ['q_dq', '"INT8" DEFAULT 1', [1, 2], 'quoted "INT8"'],
    ['q_bt', '`INT8` DEFAULT 1', [1, 2], 'backtick `INT8`'],
    ['q_br', '[INT8] DEFAULT 1', [1, 2], 'bracket [INT8]'],
    ['q_sq', '\'INT8\' DEFAULT 1', [1, 2], 'single-quoted INT8'],
    ['q_esc', '"INT""8" DEFAULT 1', [1, 2], 'escaped-quote "INT""8"'],
    ['q_vp', '"VARCHAR"(32) DEFAULT 1', [], 'quoted "VARCHAR"(32)'],
    ['q_dp', '"DOUBLE" "PRECISION" DEFAULT 1', [1, 2], 'quoted "DOUBLE" "PRECISION"'],
    ['q_ci_q', '"CHAR" "INT" DEFAULT 1', [], 'quoted "CHAR" "INT" (TEXT)'],
    ['q_ci_b', 'CHAR INT DEFAULT 1', [1, 2], 'unquoted CHAR INT (NUMERIC)'],
    ['q_bi_q', '"BLOB" "INT" DEFAULT 1', [], 'quoted "BLOB" "INT" (NONE)'],
    ['q_vi_q', 'VARYING "INT" DEFAULT 1', [1, 2], 'mixed VARYING "INT" (NUMERIC)'],
    ['q_def', '"DEFAULT" DEFAULT 1', [1, 2], 'quoted "DEFAULT"'],
    ['q_pri', '"PRIMARY" "INT8" DEFAULT 1', [1, 2], 'quoted "PRIMARY" "INT8"'],
    ['q_none', 'NONE DEFAULT 1', [1, 2], 'declared NONE (NUMERIC)'],
  ];
  for (const [col, def, expectedIds, label] of quotedTypeMatrix) {
    for (const db of [rightDb, oracleDb]) {
      db.exec(`ALTER TABLE b ADD COLUMN ${col} ${def}`);
    }
    const pgSql =
      `SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.${col} = $1 ORDER BY a.id`;
    const sqliteSql =
      `SELECT a.id FROM a LEFT JOIN b ON a.id = b.a_id WHERE b.${col} = ? ORDER BY a.id`;
    const oracleIds = oracleDb.prepare(sqliteSql).all('01').map((r) => r.id);
    t.same(oracleIds, expectedIds, `SQLite oracle matches expected for ${label}`);
    t.same(
      await execJoin(pgSql, ['01'], {dialect: 'postgresql'}),
      oracleIds,
      `parity matrix matches SQLite oracle for ${label}`,
    );
  }

  // Counterexample 8 (Schema-read failure propagation and finite-failure recovery):
  let failSchemaReads = true;
  let schemaFailureAttempts = 0;
  const origDeliver = messageRouter.deliver.bind(messageRouter);
  messageRouter.deliver = async (address, message) => {
    if (
      failSchemaReads &&
      message.type === 'QUERY' &&
      String(message.sql).includes('sqlite_master') &&
      address.endsWith('/b_p1')
    ) {
      schemaFailureAttempts += 1;
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: false,
        error: 'SQLITE_BUSY: database is locked',
        errorCode: 'SQLITE_BUSY',
        partitionId: 'b_p1',
      });
    }
    return origDeliver(address, message);
  };
  const failedSchemaAst = new SQLParser(intEqZeroOneSql).parse();
  const failedSchemaRes = await executor.executeSelect(
    failedSchemaAst,
    ['a_p1'],
    [],
    {distributedPlan: {tablePlans}},
  );
  t.equal(
    failedSchemaRes.success,
    false,
    'failed schema read propagates failure instead of returning an incomplete success',
  );
  t.equal(
    schemaFailureAttempts,
    3,
    'existing read retry owner makes 3 attempts on schema read failure',
  );
  failSchemaReads = false;
  t.same(
    await execJoin(intEqZeroOneSql),
    [1, 2],
    'once schema-read failure clears, the same executor returns the complete matching rows',
  );
});

test('transactional reads redirect from follower replicas, pin session ' +
  'leader affinity, and disable speculative hedging', async (t) => {
  const followerService = {
    partitionId: 'orders-p1',
    replicaId: 'orders-p1-r2',
    role: 'follower',
    tableName: 'orders',
    logger: {debug() {}, warn() {}, info() {}, error() {}},
    isWriteQuery: PARTITION_SERVICE_REMOTE_QUERY_METHODS.isWriteQuery,
    rejectStalePartitionEpochWrite:
      PARTITION_SERVICE_REMOTE_QUERY_METHODS.rejectStalePartitionEpochWrite,
    resolveLeaderAddress: () => 'node-1/partition/orders-p1-r1',
  };
  const redirectAnswer =
    await PARTITION_SERVICE_REMOTE_QUERY_METHODS.handleRemoteQuery.call(
      followerService,
      {
        sql: 'SELECT order_id FROM orders WHERE warehouse_id = ?',
        params: [1],
        transactionId: 'tx-order-status-1',
        participantId: 'tx-order-status-1:orders-p1',
        commitMode: 'TWO_PHASE',
        transactionEpoch: 1,
      },
    );
  t.equal(redirectAnswer.success, false, 'follower refuses transactional SELECT');
  t.equal(
    redirectAnswer.redirect,
    'LEADER_REDIRECT',
    'follower redirects transactional SELECT to leader',
  );
  t.equal(
    redirectAnswer.leaderAddress,
    'node-1/partition/orders-p1-r1',
    'redirect points to the partition leader address',
  );

  let speculativeCalled = false;
  const coordinator = new ParallelQueryCoordinator({
    partitionQueryExecutor: async (_sql, partitionId) => ({
      success: true,
      rows: [{id: 1}],
      partitionId,
    }),
  });
  coordinator.speculativeExecutionEnabled = true;
  coordinator.executeWithSpeculativeExecution = async () => {
    speculativeCalled = true;
    return [];
  };
  await coordinator.executeParallel(
    'SELECT * FROM orders',
    ['orders-p1', 'orders-p2'],
    [],
    {
      forRead: true,
      transactionIdentity: {
        transactionId: 'tx-order-status-1',
        participantId: 'tx-order-status-1:orders-p1',
        commitMode: 'TWO_PHASE',
        transactionEpoch: 1,
      },
    },
  );
  t.equal(
    speculativeCalled,
    false,
    'speculative read hedging is disabled when transactionIdentity is present',
  );

  const systemCache = {
    partitions: [
      {
        partition_id: 'orders-p1',
        table_name: 'orders',
        leader_node_id: 'node-2',
      },
    ],
    services: [
      {
        service_id: 'orders-p1-r1',
        service_type: 'partition',
        partition_id: 'orders-p1',
        node_id: 'node-1',
        raft_role: 'leader',
        address: 'node-1/partition/orders-p1-r1',
        status: 'active',
      },
      {
        service_id: 'orders-p1-r2',
        service_type: 'partition',
        partition_id: 'orders-p1',
        node_id: 'node-2',
        raft_role: 'follower',
        address: 'node-2/partition/orders-p1-r2',
        status: 'active',
      },
    ],
    get(type, id) {
      return type === 'partitions' ?
        this.partitions.find((p) => p.partition_id === id) || null :
        null;
    },
    filter(type, predicate) {
      if (type === 'services') return this.services.filter(predicate);
      if (type === 'partitions') return this.partitions.filter(predicate);
      return [];
    },
    getAll(type) {
      if (type === 'services') return this.services;
      if (type === 'partitions') return this.partitions;
      return [];
    },
  };
  const deliveredAddresses = [];
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter: {
      async deliver(address) {
        deliveredAddresses.push(address);
        if (address === 'node-2/partition/orders-p1-r2') {
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: false,
            redirect: 'LEADER_REDIRECT',
            leaderAddress: 'node-1/partition/orders-p1-r1',
            partitionId: 'orders-p1',
          });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [{order_id: 42}],
          count: 1,
          partitionId: 'orders-p1',
        });
      },
    },
  });
  const txCandidates = executor.getPartitionServiceCandidates(
    'orders-p1',
    true,
    true,
    false,
    undefined,
    {transactionIdentity: {transactionId: 'tx-order-status-1'}},
  );
  t.equal(
    txCandidates.length,
    1,
    'transactional read candidate resolution omits follower fallbacks behind canonical leader',
  );
  const txReadResult = await executor.executeOnPartition(
    'orders-p1',
    'SELECT order_id FROM orders WHERE warehouse_id = ?',
    [1],
    true,
    true,
    false,
    {
      sessionId: 'sess-tx-1',
      transactionIdentity: {
        transactionId: 'tx-order-status-1',
        participantId: 'tx-order-status-1:orders-p1',
        commitMode: 'TWO_PHASE',
        transactionEpoch: 1,
      },
    },
  );
  t.equal(txReadResult.success, true, 'transactional read follows LEADER_REDIRECT');
  t.equal(
    executor.getSessionPartitionAddress('sess-tx-1', 'orders-p1'),
    'node-1/partition/orders-p1-r1',
    'session partition affinity is pinned to the redirected leader after transactional read',
  );

  // Non-leader-unavailable refusal on the canonical leader does NOT fall back to followers:
  let mode = 'refuse_non_leader';
  const traceAddresses = [];
  const tracedExecutor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter: {
      async deliver(address) {
        traceAddresses.push(address);
        if (mode === 'refuse_non_leader') {
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: false,
            error: 'Participant transaction refused: NOT_ACTIVE',
            failureCode: 'NOT_ACTIVE',
            partitionId: 'orders-p1',
          });
        }
        if (address === 'node-2/partition/orders-p1-r2') {
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: false,
            error: 'No leader available for write operation',
            failureCode: 'NOT_LEADER',
            partitionId: 'orders-p1',
          });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [{order_id: 99}],
          count: 1,
          partitionId: 'orders-p1',
        });
      },
    },
  });
  tracedExecutor.readRetryAttempts = 1;
  const refusedTxRead = await tracedExecutor.executeOnPartition(
    'orders-p1',
    'SELECT order_id FROM orders WHERE warehouse_id = ?',
    [1],
    true,
    true,
    false,
    {
      sessionId: 'sess-tx-2',
      transactionIdentity: {
        transactionId: 'tx-order-status-2',
        participantId: 'tx-order-status-2:orders-p1',
        commitMode: 'TWO_PHASE',
        transactionEpoch: 1,
      },
    },
  );
  t.equal(refusedTxRead.success, false, 'non-leader refusal fails the attempt');
  t.same(
    traceAddresses,
    ['node-2/partition/orders-p1-r2'],
    'executeOnPartition does not fall back to follower replicas behind a canonical leader',
  );

  // Stale canonical/pinned leader returning NOT_LEADER clears the pin and widens to remaining replicas:
  mode = 'not_leader_widen';
  traceAddresses.length = 0;
  tracedExecutor.setSessionPartitionAddress(
    'sess-tx-3',
    'orders-p1',
    'node-2/partition/orders-p1-r2',
  );
  const widenedTxRead = await tracedExecutor.executeOnPartition(
    'orders-p1',
    'SELECT order_id FROM orders WHERE warehouse_id = ?',
    [1],
    true,
    true,
    false,
    {
      sessionId: 'sess-tx-3',
      transactionIdentity: {
        transactionId: 'tx-order-status-3',
        participantId: 'tx-order-status-3:orders-p1',
        commitMode: 'TWO_PHASE',
        transactionEpoch: 1,
      },
    },
  );
  t.equal(widenedTxRead.success, true, 'NOT_LEADER widens transactional read to remaining replica');
  t.same(
    traceAddresses,
    ['node-2/partition/orders-p1-r2', 'node-1/partition/orders-p1-r1'],
    'stale leader is tried first, then widened to the new leader replica',
  );
  t.equal(
    tracedExecutor.getSessionPartitionAddress('sess-tx-3', 'orders-p1'),
    'node-1/partition/orders-p1-r1',
    'stale pin is replaced with the widened leader replica address',
  );
});

test('JOIN HAVING preserves supplied query parameters, matches literal ' +
  'HAVING and WHERE controls, and distinguishes bound NULL from unbound ' +
  'placeholders', async (t) => {
  const cluster = buildJoinCluster({
    users_p1: {
      table: 'users',
      rows: [
        [1, 'alice', 35, 'east'],
      ],
    },
    users_p2: {
      table: 'users',
      rows: [
        [2, 'bob', 28, 'west'],
      ],
    },
    orders_p1: {
      table: 'orders',
      rows: [
        [10, 1, 25, 'paid'],
      ],
    },
    orders_p2: {
      table: 'orders',
      rows: [
        [11, 2, 40, 'paid'],
      ],
    },
  });

  // 1. JOIN with literal HAVING u.id > 0 -> 2 rows
  const literalHavingSql =
    'SELECT u.id, COUNT(*) AS cnt FROM users AS u ' +
    'JOIN orders AS o ON u.id = o.user_id ' +
    'GROUP BY u.id HAVING u.id > 0 ORDER BY u.id';
  const literalRows = await runJoin(cluster, literalHavingSql);
  const literalOracle = cluster.oracle.prepare(literalHavingSql).all();
  t.equal(literalRows.length, 2, 'literal JOIN HAVING u.id > 0 returns 2 rows');
  t.same(literalRows, literalOracle, 'literal JOIN HAVING matches SQLite oracle');

  // 2. JOIN with parameterized HAVING u.id > ? with [0] -> 2 rows
  const paramHavingSql =
    'SELECT u.id, COUNT(*) AS cnt FROM users AS u ' +
    'JOIN orders AS o ON u.id = o.user_id ' +
    'GROUP BY u.id HAVING u.id > ? ORDER BY u.id';
  const paramHavingRows = await runJoin(cluster, paramHavingSql, [0]);
  const paramHavingOracle = cluster.oracle.prepare(paramHavingSql).all(0);
  t.equal(paramHavingRows.length, 2, 'parameterized JOIN HAVING u.id > ? [0] returns 2 rows');
  t.same(paramHavingRows, paramHavingOracle, 'parameterized JOIN HAVING matches SQLite oracle');

  // 3. JOIN with parameterized WHERE control and combined WHERE + HAVING
  const paramWhereSql =
    'SELECT u.id, o.amount FROM users AS u ' +
    'JOIN orders AS o ON u.id = o.user_id ' +
    'WHERE u.id > ? ORDER BY u.id';
  const paramWhereRows = await runJoin(cluster, paramWhereSql, [0]);
  t.equal(paramWhereRows.length, 2, 'parameterized JOIN WHERE control returns 2 rows');
  t.same(
    paramWhereRows.map((row) => ({id: row.id, amount: row.amount})),
    cluster.oracle.prepare(paramWhereSql).all(0),
    'parameterized JOIN WHERE control matches SQLite oracle',
  );

  const combinedWhereHavingSql =
    'SELECT u.id, SUM(o.amount) AS total FROM users AS u ' +
    'JOIN orders AS o ON u.id = o.user_id ' +
    'WHERE u.age >= ? AND o.status = ? ' +
    'GROUP BY u.id HAVING SUM(o.amount) > ? AND u.id IN (?, ?) ORDER BY u.id';
  const combinedParams = [20, 'paid', 10, 1, 2];
  const combinedRows = await runJoin(cluster, combinedWhereHavingSql, combinedParams);
  t.equal(combinedRows.length, 2, 'combined JOIN WHERE + HAVING with IN (?, ?) returns 2 rows');
  t.same(
    combinedRows,
    cluster.oracle.prepare(combinedWhereHavingSql).all(...combinedParams),
    'combined JOIN WHERE + HAVING matches SQLite oracle',
  );

  // 4. Non-JOIN parameterized HAVING control on same cluster
  const nonJoinHavingSql =
    'SELECT u.id, COUNT(*) AS cnt FROM users AS u ' +
    'GROUP BY u.id HAVING u.id > ? ORDER BY u.id';
  const nonJoinAst = new SQLParser(nonJoinHavingSql).parse();
  const nonJoinRes = await cluster.executor.executeSelect(
    nonJoinAst,
    cluster.partitionIdsByTable.users,
    [0],
  );
  t.equal(nonJoinRes.success, true, 'non-JOIN parameterized HAVING control succeeds');
  t.equal(nonJoinRes.rows.length, 2, 'non-JOIN parameterized HAVING control returns 2 rows');
  t.same(
    nonJoinRes.rows,
    cluster.oracle.prepare(nonJoinHavingSql).all(0),
    'non-JOIN parameterized HAVING control matches SQLite oracle',
  );

  // 5. Deliberately bound SQL NULL parameter vs genuinely unbound placeholder
  const boundNullComparisonRows = await runJoin(cluster, paramHavingSql, [null]);
  t.same(
    boundNullComparisonRows,
    cluster.oracle.prepare(paramHavingSql).all(null),
    'bound SQL NULL in HAVING u.id > ? returns 0 rows without error',
  );

  const boundNullIsNullSql =
    'SELECT u.id, COUNT(*) AS cnt FROM users AS u ' +
    'JOIN orders AS o ON u.id = o.user_id ' +
    'GROUP BY u.id HAVING ? IS NULL ORDER BY u.id';
  const boundNullIsNullRows = await runJoin(cluster, boundNullIsNullSql, [null]);
  t.equal(boundNullIsNullRows.length, 2, 'bound SQL NULL satisfies HAVING ? IS NULL');

  await t.rejects(
    cluster.executor.executeSelect(
      new SQLParser(paramHavingSql).parse(),
      cluster.partitionIdsByTable.users,
      [],
      {distributedPlan: {tablePlans: cluster.tablePlans}},
    ),
    {code: 'SYNTAX_ERROR', message: /Unbound parameter index: 0/u},
    'JOIN HAVING with missing parameter rejects with SYNTAX_ERROR',
  );
  await t.rejects(
    cluster.executor.executeSelect(
      new SQLParser(paramHavingSql).parse(),
      cluster.partitionIdsByTable.users,
      [undefined],
      {distributedPlan: {tablePlans: cluster.tablePlans}},
    ),
    {code: 'SYNTAX_ERROR', message: /Unbound parameter index: 0/u},
    'JOIN HAVING with undefined parameter rejects with SYNTAX_ERROR',
  );
  t.throws(
    () => cluster.executor.applyHaving(
      [{id: 1, cnt: 1}],
      new SQLParser(paramHavingSql).parse().having,
    ),
    {code: 'SYNTAX_ERROR', message: /Unbound parameter index: 0/u},
    'direct applyHaving without params rejects unbound placeholder',
  );
});
