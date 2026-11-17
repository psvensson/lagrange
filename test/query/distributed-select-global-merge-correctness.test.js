/**
 * Guard: distributed SELECT global-merge correctness.
 *
 * The partition side executes the DELIVERED SQL against a real SQLite
 * database through the partition's bounded collector — so the guard proves
 * the real pushdown/merge interaction, not a raw-row mock. Covers the
 * defects where multi-partition COUNT(*) returned the number of
 * partitions, SUM returned 0, AVG/MIN/MAX returned null, GROUP BY
 * collapsed, and LIMIT/OFFSET was applied both per-partition and again
 * at the merge.
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {QUERY_MESSAGE_TYPE, QUERY_SORT_DIRECTION} from '../../src/query/query-constants.js';
import {collectBoundedSqliteRows} from '../../src/query/query-result-budget.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {SERVICE_STATUS} from '../../src/constants/index.js';
import {
  FANOUT_PLAN_KIND,
  buildSelectFanoutPlan,
  substituteParameterLiterals,
} from '../../src/query/distributed/distributed-select-fanout-plan.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TABLE_DDL =
  'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER, dept TEXT)';

function createTableDatabase(rows) {
  const db = new Database(':memory:');
  db.exec(TABLE_DDL);
  const insert = db.prepare(
    'INSERT INTO t (id, amount, dept) VALUES (?, ?, ?)',
  );
  for (const row of rows) {
    insert.run(row.id, row.amount, row.dept ?? null);
  }
  return db;
}

function buildCluster(partitionRows) {
  const partitionDbs = new Map(Object.entries(partitionRows).map(
    ([partitionId, rows]) => [partitionId, createTableDatabase(rows)],
  ));

  const deliveredSql = [];
  const messageRouter = {
    async deliver(address, message) {
      if (message.type !== QUERY_MESSAGE_TYPE.QUERY) {
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      }
      const partitionId = address.split('/')[2];
      const db = partitionDbs.get(partitionId);
      assert.equal(typeof message.sql, 'string');
      assert.ok(Array.isArray(message.params));
      deliveredSql.push({partitionId, sql: message.sql, params: message.params});
      const rows = collectBoundedSqliteRows(db.prepare(message.sql), message.params, {
        maxRows: message.resultMaxRows,
        maxBytes: message.resultMaxBytes,
        deadlineMs: message.resultDeadlineMs,
      });
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rows,
        count: rows.length,
        rowSetComplete: true,
        partitionId,
      });
    },
  };

  const services = [...partitionDbs.keys()].map((partitionId) =>
    PartitionServiceRowOwner.buildServiceRow({
      partitionId,
      replicaId: partitionId,
      nodeId: 'test-node',
      status: SERVICE_STATUS.ACTIVE,
      service: {isLeader: true},
    }),
  );
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
    messageRouter, systemCache});
  return {executor, deliveredSql, partitionIds: [...partitionDbs.keys()], partitionDbs,
    close: () => {
      for (const db of partitionDbs.values()) db.close();
    },
  };
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

test('substituteParameterLiterals and partial-aggregate HAVING handle root ' +
  'parameters, IN-list arrays, nested arrays, CASE, and function arguments',
async (t) => {
  const {executor, partitionIds} = standardCluster();

  // Direct AST rewrite checks for root node, array entries, and nested arrays
  t.same(
    substituteParameterLiterals({type: 'parameter', index: 0}, [1]),
    {type: 'literal', value: 1},
    'root parameter node is replaced with literal',
  );
  t.same(
    substituteParameterLiterals(
      [
        {type: 'parameter', index: 0},
        [{type: 'parameter', index: 1}],
      ],
      [10, 20],
    ),
    [
      {type: 'literal', value: 10},
      [{type: 'literal', value: 20}],
    ],
    'array and nested-array parameter entries are replaced recursively',
  );

  // 1. HAVING 1 and HAVING ? ([1] vs [0])
  t.same(
    await select(executor, 'SELECT COUNT(*) AS cnt FROM t HAVING 1', partitionIds),
    [{cnt: 10}],
    'HAVING 1 keeps the global aggregate row',
  );
  t.same(
    await select(
      executor,
      'SELECT COUNT(*) AS cnt FROM t HAVING ?',
      partitionIds,
      [1],
    ),
    [{cnt: 10}],
    'HAVING ? with [1] rewrites root parameter node and keeps the row',
  );
  t.same(
    await select(
      executor,
      'SELECT COUNT(*) AS cnt FROM t HAVING ?',
      partitionIds,
      [0],
    ),
    [],
    'HAVING ? with [0] filters out the row',
  );

  // 2. HAVING id IN (1, 2) and HAVING id IN (?, ?) ([1, 2])
  t.same(
    await select(
      executor,
      'SELECT id, COUNT(*) AS cnt FROM t GROUP BY id ' +
        'HAVING id IN (1, 2) ORDER BY id',
      partitionIds,
    ),
    [
      {id: 1, cnt: 1},
      {id: 2, cnt: 1},
    ],
    'HAVING id IN (1, 2) keeps matching groups',
  );
  t.same(
    await select(
      executor,
      'SELECT id, COUNT(*) AS cnt FROM t GROUP BY id ' +
        'HAVING id IN (?, ?) ORDER BY id',
      partitionIds,
      [1, 2],
    ),
    [
      {id: 1, cnt: 1},
      {id: 2, cnt: 1},
    ],
    'HAVING id IN (?, ?) with [1, 2] rewrites array parameter nodes and keeps 2 groups',
  );
  t.same(
    await select(
      executor,
      'SELECT COUNT(*) AS cnt FROM t GROUP BY id HAVING id IN (?, ?)',
      partitionIds,
      [1, 2],
    ),
    [{cnt: 1}, {cnt: 1}],
    'HAVING id IN (?, ?) works even when id is not projected in SELECT',
  );
  t.same(
    await select(
      executor,
      'SELECT COUNT(*) AS cnt FROM t HAVING id IN (1, 2)',
      partitionIds,
    ),
    [{cnt: 10}],
    'un-grouped HAVING id IN (1, 2) ships bare id partial and keeps global count',
  );
  t.same(
    await select(
      executor,
      'SELECT COUNT(*) AS cnt FROM t HAVING id IN (?, ?)',
      partitionIds,
      [1, 2],
    ),
    [{cnt: 10}],
    'un-grouped HAVING id IN (?, ?) with [1, 2] matches literal HAVING id IN (1, 2)',
  );

  // 3. CASE parameter positions (searched CASE, simple CASE, and SELECT CASE)
  t.same(
    await select(
      executor,
      'SELECT dept, SUM(amount) AS total FROM t GROUP BY dept ' +
        'HAVING CASE WHEN SUM(amount) > ? THEN ? ELSE ? END = ? ORDER BY dept',
      partitionIds,
      [28, 1, 0, 1],
    ),
    [{dept: 'a', total: 30}],
    'searched CASE with parameters in HAVING filters combined aggregates',
  );
  t.same(
    await select(
      executor,
      'SELECT dept, SUM(amount) AS total FROM t GROUP BY dept ' +
        'HAVING CASE dept WHEN ? THEN ? ELSE ? END = ? ORDER BY dept',
      partitionIds,
      ['b', 7, 0, 7],
    ),
    [{dept: 'b', total: 25}],
    'simple CASE with operand and branch parameters in HAVING',
  );
  t.same(
    await select(
      executor,
      'SELECT dept, CASE WHEN SUM(amount) > ? THEN ? ELSE ? END AS tier ' +
        'FROM t GROUP BY dept ORDER BY dept',
      partitionIds,
      [28, 'high', 'low'],
    ),
    [
      {dept: 'a', tier: 'high'},
      {dept: 'b', tier: 'low'},
    ],
    'SELECT expression column with CASE and parameters evaluates over combined aggregate',
  );

  // 4. Function-arg parameter positions in HAVING and SELECT
  t.same(
    await select(
      executor,
      'SELECT dept, SUM(amount) AS total FROM t GROUP BY dept ' +
        'HAVING COALESCE(SUM(amount), ?) > ? AND LOWER(dept) = LOWER(?)',
      partitionIds,
      [0, 20, 'B'],
    ),
    [{dept: 'b', total: 25}],
    'function arguments with parameters in HAVING evaluate correctly',
  );
  t.same(
    await select(
      executor,
      'SELECT COALESCE(SUM(amount), ?) + ? AS adjusted FROM t WHERE amount > ?',
      partitionIds,
      [0, 5, 100],
    ),
    [{adjusted: 5}],
    'WHERE param + SELECT COALESCE(SUM(amount), ?) + ? over empty filtered set',
  );
});

test('bound SQL NULL parameter vs unbound parameter placeholder in ' +
  'distributed SELECT', async (t) => {
  const {executor, partitionIds} = standardCluster();

  // Bound SQL NULL parameter is legal and distinct from unbound placeholder
  t.same(
    await select(
      executor,
      'SELECT COUNT(*) AS cnt FROM t HAVING ?',
      partitionIds,
      [null],
    ),
    [],
    'bound SQL NULL in HAVING ? filters out the row without throwing',
  );
  t.same(
    await select(
      executor,
      'SELECT COUNT(*) AS cnt FROM t HAVING ? IS NULL',
      partitionIds,
      [null],
    ),
    [{cnt: 10}],
    'bound SQL NULL in HAVING ? IS NULL evaluates to true',
  );
  t.same(
    await select(
      executor,
      'SELECT SUM(amount) + ? AS total FROM t',
      partitionIds,
      [null],
    ),
    [{total: null}],
    'bound SQL NULL in SELECT aggregate expression yields null',
  );

  // Unbound / missing parameter placeholders must throw SYNTAX_ERROR
  for (const [sql, params, expectedIndex] of [
    ['SELECT COUNT(*) AS cnt FROM t HAVING ?', [], 0],
    ['SELECT COUNT(*) AS cnt FROM t HAVING ?', [undefined], 0],
    ['SELECT id, COUNT(*) AS cnt FROM t GROUP BY id HAVING id IN (?, ?)', [1], 1],
    [
      'SELECT dept, COUNT(*) AS cnt FROM t WHERE amount > ? ' +
        'GROUP BY dept HAVING COUNT(*) > ?',
      [2],
      1,
    ],
    ['SELECT SUM(amount) + ? AS total FROM t', [], 0],
  ]) {
    const ast = new SQLParser(sql).parse();
    await t.rejects(
      executor.executeSelect(ast, partitionIds, params),
      {
        code: 'SYNTAX_ERROR',
        message: new RegExp(`Unbound parameter index: ${expectedIndex}`, 'u'),
      },
      `unbound parameter at index ${expectedIndex} rejects for: ${sql}`,
    );
  }
});

test('SELECT and HAVING scalar operations match the native SQLite oracle', async (t) => {
  const partitionRows = {
    p1: [
      {id: 1, amount: -1.5, dept: '😀'},
      {id: 2, amount: 1.5, dept: 'abc'},
    ],
    p2: [
      {id: 3, amount: -1, dept: '😀'},
      {id: 4, amount: 1, dept: 'abc'},
    ],
  };
  const {executor, deliveredSql, close} = buildCluster(partitionRows);
  t.teardown(close);
  const grouped = ' FROM t GROUP BY dept ';
  const cases = [
    ['SELECT dept, ROUND(SUM(amount), 0) AS value' + grouped + 'ORDER BY dept', []],
    ['SELECT SUBSTR(MAX(dept), 3, -2) AS value FROM t WHERE dept = ?', ['abc']],
    ['SELECT SUBSTRING(MAX(dept), 3, -2) AS value FROM t WHERE dept = ?', ['abc']],
    ['SELECT SUBSTR(MAX(dept), 1, 2) AS value FROM t WHERE dept = ?', ['abc']],
    ['SELECT LENGTH(MAX(dept)) AS value FROM t WHERE dept = ?', ['😀']],
    ['SELECT LENGTH(MAX(dept)) AS value FROM t WHERE dept = ?', ['abc']],
    ['SELECT dept, SUM(amount) AS total' + grouped +
      'HAVING ROUND(SUM(amount), ?) = SUM(amount) - ? ORDER BY dept', [0, 0.5]],
    ['SELECT dept, SUM(amount) AS total' + grouped +
      'HAVING ROUND(SUM(amount), ?) = SUM(amount) + ? ORDER BY dept', [0, 0.5]],
    ['SELECT dept, COUNT(*) AS cnt' + grouped +
      'HAVING SUBSTR(MAX(dept), ?, ?) = ? ORDER BY dept', [3, -2, 'ab']],
    ['SELECT dept, COUNT(*) AS cnt' + grouped +
      'HAVING LENGTH(MAX(dept)) = ? ORDER BY dept', [1]],
    ['SELECT dept, COUNT(*) AS cnt' + grouped +
      'HAVING LENGTH(MAX(dept)) = ? ORDER BY dept', [3]],
    ['SELECT dept, ROUND(SUM(amount) > 0) AS value' + grouped + 'ORDER BY dept', []],
    ['SELECT dept, COUNT(*) AS cnt' + grouped +
      'HAVING ROUND(SUM(amount) > 0) = 1 ORDER BY dept', []],
    ['SELECT dept, COUNT(*) AS cnt' + grouped +
      'HAVING ROUND(SUM(amount) > 0) = 0 ORDER BY dept', []],
    ['SELECT dept, COUNT(*) AS cnt' + grouped +
      'HAVING ROUND(CASE WHEN SUM(amount) > 0 THEN 1 ELSE 0 END) = 1 ORDER BY dept', []],
    ['SELECT dept, ROUND(SUM(amount), TRUE) AS value' + grouped + 'ORDER BY dept', []],
    ['SELECT dept, ROUND(SUM(amount), FALSE) AS value' + grouped + 'ORDER BY dept', []],
    ['SELECT SUBSTR(MAX(dept), TRUE, TRUE) AS value FROM t WHERE dept = ?', ['abc']],
    ['SELECT SUBSTR(MAX(dept), FALSE, 2) AS value FROM t WHERE dept = ?', ['abc']],
    ['SELECT dept, COUNT(*) AS cnt' + grouped +
      'HAVING SUBSTR(MAX(dept), SUM(amount) > 0, 1) = \'a\' ORDER BY dept', []],
    ['SELECT dept, COUNT(*) AS cnt' + grouped +
      'HAVING LENGTH(SUM(amount) > 0) = 1 ORDER BY dept', []],
    ['SELECT ROUND(SUM(amount), ?) AS value FROM t', [null]],
    ['SELECT COUNT(*) AS cnt FROM t HAVING ROUND(SUM(amount), ?) IS NULL', [null]],
    ['SELECT ROUND(SUM(amount), 0) AS rounded, LENGTH(MAX(dept)) AS length, ' +
      'SUBSTR(MAX(dept), 1, 2) AS part FROM t WHERE id < ?', [0]],
  ];
  for (const partitionIds of [['p1'], ['p1', 'p2']]) {
    const oracle = createTableDatabase(partitionIds.flatMap((id) => partitionRows[id]));
    t.teardown(() => oracle.close());
    for (const [sql, params] of cases) {
      const plan = buildSelectFanoutPlan(new SQLParser(sql).parse(), params);
      t.equal(plan.kind, FANOUT_PLAN_KIND.PARTIAL_AGGREGATE,
        'the existing coordinator expression path is admitted');
      const expected = oracle.prepare(sql).all(...params);
      const deliveryStart = deliveredSql.length;
      t.same(await select(executor, sql, partitionIds, params), expected,
        `${partitionIds.join(',')}: ${sql}`);
      const deliveries = deliveredSql.slice(deliveryStart);
      t.same(new Set(deliveries.map(({partitionId}) => partitionId)), new Set(partitionIds),
        'actual partition SQL ran on every selected partition');
      t.ok(deliveries.every(({sql: delivered}) =>
        !/\b(?:ROUND|LENGTH|SUBSTR(?:ING)?)\s*\(/u.test(delivered)),
      'the repaired scalar is evaluated at the coordinator after native partials');
    }
  }
});

test('QueryExecutor.applyOrderBy matches SQLite UTF-8 BINARY ordering', async (t) => {
  const textValues = [
    'abc', '😀', '\u{10000}', '\uE000', 'a', 'A', 'aa', 'a!', '',
    'é', 'e\u0301', 'a\u0000a', 'a\u0000b',
  ];
  const rows = textValues.flatMap((dept, index) => [
    {id: index * 2 + 1, amount: 1, dept},
    {id: index * 2 + 2, amount: 2, dept},
  ]);
  const partitionRows = {
    p1: rows,
    p2: rows.map((row) => ({...row, id: row.id + rows.length})),
  };
  const {executor, deliveredSql, partitionIds, partitionDbs, close} = buildCluster(partitionRows);
  t.teardown(close);
  const oracle = createTableDatabase(Object.values(partitionRows).flat());
  t.teardown(() => oracle.close());

  const encodingPragma = 'encoding';
  const expectedEncoding = 'UTF-8';
  for (const [partitionId, db] of partitionDbs) {
    t.equal(db.pragma(encodingPragma, {simple: true}), expectedEncoding,
      `${partitionId} executes delivered SQL in a UTF-8 database`);
  }
  t.equal(oracle.pragma(encodingPragma, {simple: true}), expectedEncoding,
    'the independent native oracle uses the same text encoding');

  const projections = [
    {kind: FANOUT_PLAN_KIND.RAW_ROWS,
      sql: 'SELECT id, dept, amount FROM t', secondary: 'id'},
    {kind: FANOUT_PLAN_KIND.PARTIAL_AGGREGATE,
      sql: 'SELECT dept, amount, COUNT(*) AS cnt FROM t GROUP BY dept, amount',
      secondary: 'amount'},
  ];
  const ascendingDirection = 'ASC';
  const directions = [ascendingDirection, QUERY_SORT_DIRECTION.DESC];
  const windows = ['', ' LIMIT 5 OFFSET 3'];
  for (const projection of projections) {
    for (const direction of directions) {
      for (const window of windows) {
        const sql = `${projection.sql} ORDER BY dept ${direction}, ` +
          `${projection.secondary} ${QUERY_SORT_DIRECTION.DESC}${window}`;
        const plan = buildSelectFanoutPlan(new SQLParser(sql).parse());
        t.equal(plan.kind, projection.kind, 'the intended live merge consumer is admitted');
        const expected = oracle.prepare(sql).all();
        t.ok(expected.length > 1, 'the oracle requires a nontrivial ordered result');
        const deliveryStart = deliveredSql.length;
        t.same(await select(executor, sql, partitionIds), expected,
          `${projection.kind}: ${sql}`);
        const deliveries = deliveredSql.slice(deliveryStart);
        t.same(new Set(deliveries.map(({partitionId}) => partitionId)), new Set(partitionIds),
          'actual SQL ran against both native partition databases');
        if (projection.kind === FANOUT_PLAN_KIND.PARTIAL_AGGREGATE) {
          t.ok(deliveries.every(({sql: delivered}) =>
            !/\b(?:ORDER BY|LIMIT)\b/u.test(delivered)),
          'partial rows reach the coordinator before global sorting and slicing');
        }
      }
    }
  }

  const numericSql = 'SELECT id, amount, dept FROM t ORDER BY amount DESC, id ASC';
  t.same(await select(executor, numericSql, partitionIds), oracle.prepare(numericSql).all(),
    'numeric ordering and its secondary key retain native behavior on the same rows');
});
