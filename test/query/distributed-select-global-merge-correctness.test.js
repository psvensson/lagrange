/**
 * Guard: distributed SELECT global-merge correctness.
 *
 * The partition side executes the DELIVERED SQL against a real SQLite
 * database — exactly like partition-service-write-metrics-base
 * executeQuery (`db.prepare(sql).all(...params)`) — so the guard proves
 * the real pushdown/merge interaction, not a raw-row mock. Covers the
 * defects where multi-partition COUNT(*) returned the number of
 * partitions, SUM returned 0, AVG/MIN/MAX returned null, GROUP BY
 * collapsed, and LIMIT/OFFSET was applied both per-partition and again
 * at the merge.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  FANOUT_PLAN_KIND,
  buildSelectFanoutPlan,
} from '../../src/query/distributed/distributed-select-fanout-plan.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TABLE_DDL =
  'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER, dept TEXT)';

function buildCluster(partitionRows) {
  const partitionDbs = new Map();
  for (const [partitionId, rows] of Object.entries(partitionRows)) {
    const db = new Database(':memory:');
    db.exec(TABLE_DDL);
    const insert = db.prepare(
      'INSERT INTO t (id, amount, dept) VALUES (?, ?, ?)',
    );
    for (const row of rows) {
      insert.run(row.id, row.amount, row.dept ?? null);
    }
    partitionDbs.set(partitionId, db);
  }

  const deliveredSql = [];
  const messageRouter = {
    async deliver(address, message) {
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      const partitionId = address.split('/')[2];
      const db = partitionDbs.get(partitionId);
      deliveredSql.push({partitionId, sql: message.sql});
      const rows = db.prepare(message.sql).all(...(message.params || []));
      return {
        acknowledged: true,
        success: true,
        rows,
        count: rows.length,
        partitionId,
      };
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

  const executor = new QueryExecutor({messageRouter, systemCache});
  return {executor, deliveredSql, partitionIds: [...partitionDbs.keys()]};
}

// amounts 1..10 (sum 55), depts alternate a/b, spread over 2 partitions.
function standardCluster() {
  return buildCluster({
    p1: [1, 2, 3, 4, 5].map((i) => ({
      id: i,
      amount: i,
      dept: i % 2 === 0 ? 'a' : 'b',
    })),
    p2: [6, 7, 8, 9, 10].map((i) => ({
      id: i,
      amount: i,
      dept: i % 2 === 0 ? 'a' : 'b',
    })),
  });
}

async function select(executor, sql, partitionIds, params = []) {
  const ast = new SQLParser(sql).parse();
  const result = await executor.executeSelect(ast, partitionIds, params);
  if (!result.success) {
    throw new Error(`query failed: ${JSON.stringify(result)}`);
  }
  return result.rows;
}

test('global aggregates across partitions', async (t) => {
  const {executor, partitionIds} = standardCluster();

  t.same(
    await select(executor, 'SELECT COUNT(*) FROM t', partitionIds),
    [{'COUNT(*)': 10}],
    'COUNT(*) counts rows, not partitions',
  );
  t.same(
    await select(executor, 'SELECT COUNT(*) AS cnt FROM t', partitionIds),
    [{cnt: 10}],
    'aliased COUNT',
  );
  t.same(
    await select(executor, 'SELECT SUM(amount) FROM t', partitionIds),
    [{'SUM(amount)': 55}],
    'SUM combines partial sums',
  );
  t.same(
    await select(executor, 'SELECT AVG(amount) FROM t', partitionIds),
    [{'AVG(amount)': 5.5}],
    'AVG is globally weighted, not averaged averages',
  );
  t.same(
    await select(executor, 'SELECT MIN(amount) FROM t', partitionIds),
    [{'MIN(amount)': 1}],
    'MIN across partitions',
  );
  t.same(
    await select(executor, 'SELECT MAX(amount) FROM t', partitionIds),
    [{'MAX(amount)': 10}],
    'MAX across partitions',
  );
});

test('single-partition aggregates stay correct', async (t) => {
  const {executor} = standardCluster();

  t.same(
    await select(executor, 'SELECT COUNT(*) FROM t', ['p1']),
    [{'COUNT(*)': 5}],
    'single-partition COUNT is the row count',
  );
  t.same(
    await select(executor, 'SELECT SUM(amount) AS total FROM t', ['p1']),
    [{total: 15}],
    'single-partition SUM',
  );
});

test('DISTINCT aggregates deduplicate across partitions', async (t) => {
  // amount 3 appears in both partitions; distinct amounts = 1,2,3,4.
  const {executor, partitionIds} = buildCluster({
    p1: [
      {id: 1, amount: 1},
      {id: 2, amount: 2},
      {id: 3, amount: 3},
    ],
    p2: [
      {id: 4, amount: 3},
      {id: 5, amount: 4},
    ],
  });

  t.same(
    await select(
      executor,
      'SELECT COUNT(DISTINCT amount) AS distinct_amounts FROM t',
      partitionIds,
    ),
    [{distinct_amounts: 4}],
    'COUNT(DISTINCT) dedups across partitions',
  );
  // SUM(DISTINCT)/AVG(DISTINCT) do not parse (parser limitation), so
  // COUNT is the only DISTINCT aggregate reachable at execution.
});

test('GROUP BY combines per-group partials across partitions', async (t) => {
  const {executor, partitionIds} = standardCluster();

  const rows = await select(
    executor,
    'SELECT dept, COUNT(*) AS cnt, SUM(amount) AS total FROM t ' +
      'GROUP BY dept ORDER BY dept',
    partitionIds,
  );
  t.same(
    rows,
    [
      {dept: 'a', cnt: 5, total: 30},
      {dept: 'b', cnt: 5, total: 25},
    ],
    'per-group COUNT/SUM are global, groups not collapsed',
  );
});

test('GROUP BY expression keeps distinct groups', async (t) => {
  const {executor, partitionIds} = standardCluster();

  const rows = await select(
    executor,
    'SELECT amount % 2 AS parity, COUNT(*) AS cnt FROM t ' +
      'GROUP BY amount % 2 ORDER BY parity',
    partitionIds,
  );
  t.same(
    rows,
    [
      {parity: 0, cnt: 5},
      {parity: 1, cnt: 5},
    ],
    'expression group keys survive the merge',
  );
});

test('HAVING filters on global aggregate values', async (t) => {
  const {executor, partitionIds} = buildCluster({
    p1: [
      {id: 1, amount: 1, dept: 'a'},
      {id: 2, amount: 2, dept: 'b'},
    ],
    p2: [
      {id: 3, amount: 3, dept: 'a'},
      {id: 4, amount: 4, dept: 'b'},
      {id: 5, amount: 100, dept: 'b'},
    ],
  });

  const rows = await select(
    executor,
    'SELECT dept, SUM(amount) AS total FROM t GROUP BY dept ' +
      'HAVING SUM(amount) > 10',
    partitionIds,
  );
  t.same(
    rows,
    [{dept: 'b', total: 106}],
    'HAVING evaluates the combined aggregate, not per-partition partials',
  );
});

test('LIMIT/OFFSET applies globally exactly once', async (t) => {
  const {executor, partitionIds} = standardCluster();

  const rows = await select(
    executor,
    'SELECT id FROM t ORDER BY id LIMIT 3 OFFSET 4',
    partitionIds,
  );
  t.same(
    rows,
    [{id: 5}, {id: 6}, {id: 7}],
    'OFFSET is not re-applied per partition or at the merge twice',
  );

  const singlePartition = await select(
    executor,
    'SELECT id FROM t ORDER BY id LIMIT 2 OFFSET 2',
    ['p1'],
  );
  t.same(
    singlePartition,
    [{id: 3}, {id: 4}],
    'single-partition OFFSET returns rows instead of an empty slice',
  );
});

test('parameterized WHERE splits params from coordinator clauses', async (t) => {
  const {executor, partitionIds} = standardCluster();

  const rows = await select(
    executor,
    'SELECT COUNT(*) AS cnt FROM t WHERE amount > ?',
    partitionIds,
    [5],
  );
  t.same(rows, [{cnt: 5}], 'WHERE parameter reaches the partitions');
});

test('empty table aggregate semantics match SQLite', async (t) => {
  const {executor, partitionIds} = buildCluster({p1: [], p2: []});

  t.same(
    await select(
      executor,
      'SELECT COUNT(*) AS cnt, SUM(amount) AS total FROM t',
      partitionIds,
    ),
    [{cnt: 0, total: null}],
    'COUNT 0 and SUM null over no rows',
  );
});

test('non-aggregate SELECT rows pass through unchanged', async (t) => {
  const {executor, partitionIds} = standardCluster();

  const rows = await select(
    executor,
    'SELECT id, amount FROM t ORDER BY id',
    partitionIds,
  );
  t.equal(rows.length, 10, 'all raw rows survive the merge');
  t.same(rows[0], {id: 1, amount: 1}, 'row content intact');
});

test('aggregates nested in expressions combine globally', async (t) => {
  const {executor, partitionIds} = standardCluster();

  t.same(
    await select(
      executor,
      'SELECT SUM(amount) + 1 AS x FROM t',
      partitionIds,
    ),
    [{x: 56}],
    'expression over aggregate uses the combined value, not a partial',
  );
  t.same(
    await select(
      executor,
      'SELECT SUM(amount) + COUNT(*) AS x FROM t',
      partitionIds,
    ),
    [{x: 65}],
    'two aggregates in one expression both combine',
  );
  const grouped = await select(
    executor,
    'SELECT dept, SUM(amount) * 2 AS double_total FROM t ' +
      'GROUP BY dept ORDER BY dept',
    partitionIds,
  );
  t.same(
    grouped,
    [
      {dept: 'a', double_total: 60},
      {dept: 'b', double_total: 50},
    ],
    'per-group expression over combined aggregate',
  );
});

test('expression evaluation matches SQLite affinity and fallback', async (t) => {
  const {executor, partitionIds} = standardCluster();

  t.same(
    await select(
      executor,
      'SELECT SUM(amount) / COUNT(*) AS x FROM t',
      partitionIds,
    ),
    [{x: 5}],
    'integer/integer division truncates like SQLite (55/10 = 5)',
  );
  t.same(
    await select(
      executor,
      'SELECT SUM(amount) % COUNT(*) AS x FROM t',
      partitionIds,
    ),
    [{x: 5}],
    'modulo casts to integer like SQLite (55 % 10 = 5)',
  );

  // Operators outside the scalar evaluator force the RAW_ROWS fallback
  // instead of silently returning null through the partial path.
  const unsupported = new SQLParser(
    'SELECT SUM(amount) > 50 AND COUNT(*) > 2 AS x FROM t',
  ).parse();
  const plan = buildSelectFanoutPlan(unsupported, []);
  t.equal(
    plan.kind,
    FANOUT_PLAN_KIND.RAW_ROWS,
    'unsupported operator in aggregate expression falls back to legacy',
  );
});

test('SELECT * with aggregates and GROUP BY succeeds', async (t) => {
  const {executor, partitionIds} = standardCluster();

  const withCount = await select(
    executor,
    'SELECT *, COUNT(*) AS c FROM t',
    partitionIds,
  );
  t.equal(withCount.length, 1, 'one aggregate row');
  t.equal(withCount[0].c, 10, 'star does not break the global count');
  t.ok('id' in withCount[0], 'star surfaces raw columns');

  const grouped = await select(
    executor,
    'SELECT * FROM t GROUP BY dept',
    partitionIds,
  );
  t.equal(grouped.length, 2, 'one row per group');
  t.ok(
    grouped.every((row) => 'id' in row && 'dept' in row),
    'grouped star rows carry raw columns',
  );
});

test('partition SQL carries partials, not the bare aggregate', async (t) => {
  const {executor, deliveredSql, partitionIds} = standardCluster();

  await select(executor, 'SELECT AVG(amount) FROM t', partitionIds);
  const sql = deliveredSql[deliveredSql.length - 1].sql;
  t.match(sql, /SUM\(amount\)/, 'AVG ships as SUM partial');
  t.match(sql, /COUNT\(amount\)/, 'AVG ships as COUNT partial');
});
