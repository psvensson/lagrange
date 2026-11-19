import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  CoordinatorMergeProcessPool,
} from '../../src/query/distributed/coordinator-merge-process.js';
import {
  CoordinatorMergeSession,
  GUARD_OUTCOME,
} from '../../src/query/distributed/coordinator-merge-session.js';
import {DistributedMergeEngine} from '../../src/query/distributed/distributed-merge-engine.js';
import {
  FANOUT_PLAN_KIND,
  buildSelectFanoutPlan,
} from '../../src/query/distributed/distributed-select-fanout-plan.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {encodeTypedRowSet} from '../../src/query/sql-value-codec.js';
import {presentSqlValue} from '../../src/query/sql-value-presentation.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function createExecutor() {
  return new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: {
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: []});
      },
    },
    systemCache: {
      filter() {
        return [];
      },
    },
  });
}

test('DistributedMergeEngine - applies global ORDER/LIMIT semantics', async (t) => {
  const mergeEngine = new DistributedMergeEngine();
  const executor = createExecutor();
  const ast = new SQLParser(
    'SELECT * FROM users ORDER BY score DESC LIMIT 2',
  ).parse();

  const result = await mergeEngine.mergePartitionResults(
    [
      {success: true, rows: [{id: 1, score: 10}, {id: 2, score: 40}]},
      {success: true, rows: [{id: 3, score: 30}, {id: 4, score: 20}]},
    ],
    ast,
    executor,
  );

  t.equal(result.rows.length, 2);
  t.equal(result.rows[0].score, 40);
  t.equal(result.rows[1].score, 30);
});

test('DistributedMergeEngine - applies global DISTINCT semantics', async (t) => {
  const mergeEngine = new DistributedMergeEngine();
  const executor = createExecutor();
  const ast = new SQLParser(
    'SELECT DISTINCT status FROM users',
  ).parse();

  const result = await mergeEngine.mergePartitionResults(
    [
      {success: true, rows: [{status: 'active'}, {status: 'inactive'}]},
      {success: true, rows: [{status: 'active'}, {status: 'pending'}]},
    ],
    ast,
    executor,
  );

  t.equal(result.rows.length, 3);
});

test('CoordinatorMergeSession - enforces merge resource bounds, engine identity, and guarded partial', async (t) => {
  // 1. Engine identity mismatch refusal
  t.throws(
    () => new CoordinatorMergeSession({
      expectedEngineEnvelope: {
        sqliteVersion: '3.0.0',
        sqliteSourceId: 'mismatch',
        compileOptionsDigest: 'mismatch',
      },
    }),
    {code: QUERY_ERROR_CODE.QUERY_ENGINE_MISMATCH},
  );

  // 2. MERGE_INPUT_MAX_ROWS bound refusal
  const session2 = new CoordinatorMergeSession({
    mergeInputMaxRows: 2,
    memoryLimitBytes: 1024 * 1024,
  });
  session2.createTable('t', null, ['id']);
  let rowCapErr = null;
  try {
    await session2.ingestTableFragments('t', [
      {rowSet: encodeTypedRowSet(['id'], [[1n], [2n], [3n]])},
    ]);
  } catch (err) {
    rowCapErr = err;
  } finally {
    session2.close();
  }
  t.equal(rowCapErr?.code, QUERY_ERROR_CODE.QUERY_MERGE_INPUT_ROWS_EXCEEDED);

  // 3. MEMORY_LIMIT_BYTES bound refusal (PRAGMA max_page_count + byte accounting)
  const session3 = new CoordinatorMergeSession({
    mergeInputMaxRows: 100,
    memoryLimitBytes: 16,
  });
  let memCapErr = null;
  try {
    session3.createTable('t', null, ['v']);
    await session3.ingestTableFragments('t', [
      {rowSet: encodeTypedRowSet(['v'], [['a'.repeat(128)]])},
    ]);
  } catch (err) {
    memCapErr = err;
  } finally {
    session3.close();
  }
  t.equal(memCapErr?.code, QUERY_ERROR_CODE.QUERY_MERGE_MEMORY_EXHAUSTED);

  // 4. Guard evaluation: GUARD_HELD (1) vs GUARD_FAILED (0) vs QUERY_MERGE_PARTIAL_OVERFLOW
  const session4 = new CoordinatorMergeSession();
  session4.createTable('__partial', null, ['__gp_0_c']);
  await session4.ingestTableFragments('__partial', [
    {rowSet: encodeTypedRowSet(['__gp_0_c'], [[5n]])},
  ]);
  t.equal(
    session4.evaluateGuardSql(
      'SELECT CASE WHEN MAX(__gp_0_c) < 10 THEN 1 ELSE 0 END FROM __partial',
    ),
    GUARD_OUTCOME.GUARD_HELD,
  );
  t.equal(
    session4.evaluateGuardSql(
      'SELECT CASE WHEN MAX(__gp_0_c) > 10 THEN 1 ELSE 0 END FROM __partial',
    ),
    GUARD_OUTCOME.GUARD_FAILED,
  );
  t.throws(
    () => session4.evaluateGuardSql('SELECT 2 FROM __partial'),
    {code: QUERY_ERROR_CODE.QUERY_MERGE_PARTIAL_OVERFLOW},
  );
  session4.close();

  // 5. Presentation refuses unsafe BigInt when safeIntegers is false
  t.throws(
    () => presentSqlValue(9007199254740993n, {safeIntegers: false}),
    {code: QUERY_ERROR_CODE.INTEGER_PRECISION_UNREPRESENTABLE},
  );
  t.equal(presentSqlValue(9007199254740993n, {safeIntegers: true}), 9007199254740993n);

  // 6. CoordinatorMergeProcessPool executes COORDINATOR_EVALUATED merge in child worker
  const pool = new CoordinatorMergeProcessPool({maxWorkers: 1});
  try {
    const pooled = await pool.execute({
      tables: [{
        tableName: 't',
        schema: {columns: [{name: 'a', type: 'INTEGER'}]},
        declaredColumns: ['a'],
        fragments: [{rowSet: encodeTypedRowSet(['a'], [[10n], [20n]])}],
      }],
      sql: 'SELECT SUM(a) AS total FROM t',
      params: [],
      expectedColumns: ['total'],
    });
    t.same(pooled.rows, [{total: 30n}]);
  } finally {
    pool.shutdown();
  }
});

test('GUARDED_PARTIAL (3f) - carry-normalized partial-row fixtures Case A, Case B, and >= 2^31 overflow', async (t) => {
  const mergeEngine = new DistributedMergeEngine();
  const ast = new SQLParser('SELECT SUM(a) AS s FROM t').parse();
  const fanoutPlan = buildSelectFanoutPlan(ast, [], 2);
  t.equal(fanoutPlan.kind, FANOUT_PLAN_KIND.GUARDED_PARTIAL);

  const partialCols = [
    '__gp_0_c',
    '__gp_0_nonint',
    '__gp_0_abs',
    '__gp_0_hi',
    '__gp_0_lo_carry',
    '__gp_0_lo_low',
  ];

  // Helper to compute partition partial tuple for n copies of integer value v:
  const makePartialFragment = (entries) => {
    let c = 0n;
    let abs = 0;
    let hiSum = 0n;
    let loSum = 0n;
    for (const [count, val] of entries) {
      c += count;
      abs += Number(count) * Math.abs(Number(val));
      hiSum += count * (val >> 32n);
      loSum += count * (val & 4294967295n);
    }
    const loCarry = loSum >> 32n;
    const loLow = loSum & 4294967295n;
    return {
      success: true,
      rowSet: encodeTypedRowSet(partialCols, [[c, 0n, abs, hiSum, loCarry, loLow]]),
    };
  };

  // Case A (Rev 6 §1): one row of -(2^62 - 2^40) plus 1.5 * 2^30 rows of -1 across 2 partitions.
  const negBig = -((1n << 62n) - (1n << 40n));
  const countP1 = 1n << 30n;
  const countP2 = 1n << 29n;
  const caseAResult = await mergeEngine.mergePartitionResults(
    [
      makePartialFragment([[1n, negBig], [countP1, -1n]]),
      makePartialFragment([[countP2, -1n]]),
    ],
    ast,
    null,
    fanoutPlan,
    [],
    {safeIntegers: true},
  );
  t.equal(caseAResult.guardOutcome, GUARD_OUTCOME.GUARD_HELD);
  t.equal(caseAResult.rows[0].s, -4611684920526372864n);

  // Case B (Rev 6 §1): two partitions of (2^31 - 1) rows of -1 -> -4294967294n.
  const maxSafeGroupRows = (1n << 31n) - 1n;
  const caseBResult = await mergeEngine.mergePartitionResults(
    [
      makePartialFragment([[maxSafeGroupRows, -1n]]),
      makePartialFragment([[maxSafeGroupRows, -1n]]),
    ],
    ast,
    null,
    fanoutPlan,
    [],
    {safeIntegers: true},
  );
  t.equal(caseBResult.guardOutcome, GUARD_OUTCOME.GUARD_HELD);
  t.equal(caseBResult.rows[0].s, -4294967294n);

  // >= 2^31 rows in one partition group -> QUERY_MERGE_PARTIAL_OVERFLOW
  let overflowErr = null;
  try {
    await mergeEngine.mergePartitionResults(
      [
        makePartialFragment([[1n << 31n, 1n]]),
        makePartialFragment([[1n, 1n]]),
      ],
      ast,
      null,
      fanoutPlan,
      [],
      {safeIntegers: true},
    );
  } catch (err) {
    overflowErr = err;
  }
  t.equal(overflowErr?.code, QUERY_ERROR_CODE.QUERY_MERGE_PARTIAL_OVERFLOW);
});
