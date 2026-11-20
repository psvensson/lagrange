import Database from 'better-sqlite3';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
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
import {QUERY_ERROR_CODE, QUERY_MESSAGE_TYPE} from '../../src/query/query-constants.js';
import {collectBoundedTypedRowSet} from '../../src/query/query-result-budget.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {decodeTypedParams, encodeTypedRowSet} from '../../src/query/sql-value-codec.js';
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

function createSqliteClusterExecutor(tableSpecs) {
  const dbs = new Map();
  const tableRows = [];
  const serviceRows = [];

  for (const spec of tableSpecs) {
    tableRows.push({
      table_id: spec.tableName,
      table_name: spec.tableName,
      schema_definition: JSON.stringify(spec.schema),
    });
    spec.partitions.forEach((rows, idx) => {
      const partitionId = `${spec.tableName}-p${idx + 1}`;
      const db = new Database(':memory:');
      db.defaultSafeIntegers(true);
      db.exec(spec.ddl);
      const cols = spec.schema.columns.map((c) => c.name);
      const insertSql = `INSERT INTO ${spec.tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      const stmt = db.prepare(insertSql);
      for (const row of rows) {
        stmt.run(...cols.map((c) => row[c]));
      }
      dbs.set(partitionId, db);
      serviceRows.push(
        PartitionServiceRowOwner.buildServiceRow({
          partitionId,
          replicaId: partitionId,
          nodeId: 'test-node',
          status: SERVICE_STATUS.ACTIVE,
          service: {isLeader: true},
        }),
      );
    });
  }

  const systemCache = {
    getAll(table) {
      if (table === TABLES.TABLES) return tableRows;
      if (table === TABLES.SERVICES) return serviceRows;
      return [];
    },
    filter(table, predicate) {
      return this.getAll(table).filter(predicate);
    },
    get(table, key) {
      if (table === TABLES.TABLES) {
        return tableRows.find((r) => r.table_name === key || r.table_id === key) || null;
      }
      return null;
    },
  };

  const messageRouter = {
    async deliver(address, request) {
      if (request.type !== QUERY_MESSAGE_TYPE.QUERY) {
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      }
      const partitionId = address.split('/')[2];
      const db = dbs.get(partitionId);
      const params = request.typedParams ?
        decodeTypedParams(request.typedParams) :
        (request.params || []);
      const {rowSet} = collectBoundedTypedRowSet(db.prepare(request.sql), params, {});
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rowSet,
        rowSetComplete: true,
        partitionId,
      });
    },
  };

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter,
    systemCache,
  });

  const close = () => {
    executor.mergeEngine?.close?.();
    for (const db of dbs.values()) db.close();
  };

  return {executor, close};
}

test('Review 3 Item 4a: QueryExecutor interrupts expensive multiway CROSS JOIN COUNT(*) on deadline and remains responsive', async (t) => {
  const rowsP1 = Array.from({length: 80}, (_, i) => ({id: BigInt(i + 1)}));
  const rowsP2 = Array.from({length: 80}, (_, i) => ({id: BigInt(i + 81)}));
  const {executor, close} = createSqliteClusterExecutor([{
    tableName: 't',
    ddl: 'CREATE TABLE t (id INTEGER PRIMARY KEY)',
    schema: {columns: [{name: 'id', type: 'INTEGER'}], primaryKey: ['id']},
    partitions: [rowsP1, rowsP2],
  }]);

  try {
    // 5-way self-join over 160 rows = 160^5 = 104,857,600,000 combinations inside SQLite before first row
    const heavyAst = new SQLParser(
      'SELECT COUNT(*) AS n FROM t a JOIN t b ON 1 = 1 JOIN t c ON 1 = 1 JOIN t d ON 1 = 1 JOIN t e ON 1 = 1',
    ).parse();
    const startMs = Date.now();
    let caughtError = null;
    try {
      await executor.executeSelect(
        heavyAst,
        ['t-p1', 't-p2'],
        [],
        {deadlineMs: Date.now() + 80},
      );
    } catch (error) {
      caughtError = error;
    }
    const elapsedMs = Date.now() - startMs;
    t.equal(caughtError?.code, QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED);
    t.ok(elapsedMs < 2500, `interrupted in ${elapsedMs}ms (< 2500ms)`);

    // Coordinator remains responsive for a subsequent query immediately after SIGKILL
    const lightAst = new SQLParser('SELECT COUNT(*) AS n FROM t').parse();
    const nextResult = await executor.executeSelect(
      lightAst,
      ['t-p1', 't-p2'],
      [],
      {deadlineMs: Date.now() + 5000},
    );
    t.equal(nextResult.success, true);
    t.same(nextResult.rows, [{n: 160}]);
  } finally {
    close();
  }
});

test('Review 3 Item 4b: QueryExecutor cross-partition JOIN preserves safeIntegers: true for small and >2^53 BigInts', async (t) => {
  const bigVal = 9007199254740993n;
  const {executor, close} = createSqliteClusterExecutor([
    {
      tableName: 'orders',
      ddl: 'CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, small_val INTEGER)',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER'},
          {name: 'user_id', type: 'INTEGER'},
          {name: 'small_val', type: 'INTEGER'},
        ],
        primaryKey: ['id'],
      },
      partitions: [[{id: 1n, user_id: 10n, small_val: 42n}], []],
    },
    {
      tableName: 'ledger',
      ddl: 'CREATE TABLE ledger (user_id INTEGER PRIMARY KEY, big_val INTEGER)',
      schema: {
        columns: [
          {name: 'user_id', type: 'INTEGER'},
          {name: 'big_val', type: 'INTEGER'},
        ],
        primaryKey: ['user_id'],
      },
      partitions: [[], [{user_id: 10n, big_val: bigVal}]],
    },
  ]);

  try {
    const joinAst = new SQLParser(
      'SELECT orders.small_val AS small_val, ledger.big_val AS big_val ' +
      'FROM orders JOIN ledger ON orders.user_id = ledger.user_id',
    ).parse();
    const res = await executor.executeSelect(
      joinAst,
      ['orders-p1', 'orders-p2'],
      [],
      {
        safeIntegers: true,
        distributedPlan: {
          tablePlans: new Map([
            ['orders', {partitions: ['orders-p1', 'orders-p2']}],
            ['ledger', {partitions: ['ledger-p1', 'ledger-p2']}],
          ]),
        },
      },
    );
    t.equal(res.success, true);
    t.equal(res.rows.length, 1);
    t.equal(typeof res.rows[0].small_val, 'bigint');
    t.equal(res.rows[0].small_val, 42n);
    t.equal(typeof res.rows[0].big_val, 'bigint');
    t.equal(res.rows[0].big_val, bigVal);
  } finally {
    close();
  }
});

test('Review 3 Item 4c: PARTIAL_AGGREGATE preserves explicit COLLATE BINARY override over NOCASE base column', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'INTEGER'},
      {name: 'name', type: 'TEXT', collation: 'NOCASE'},
    ],
    primaryKey: ['id'],
  };
  const {executor, close} = createSqliteClusterExecutor([{
    tableName: 't',
    ddl: 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT COLLATE NOCASE)',
    schema,
    partitions: [
      [{id: 1n, name: 'a'}],
      [{id: 2n, name: 'A'}],
    ],
  }]);

  try {
    const binaryAst = new SQLParser(
      'SELECT COUNT(DISTINCT name COLLATE BINARY) AS n FROM t',
    ).parse();
    const binaryPlan = buildSelectFanoutPlan(binaryAst, [], 2, {schema});
    t.equal(binaryPlan.kind, FANOUT_PLAN_KIND.PARTIAL_AGGREGATE);

    const binaryRes = await executor.executeSelect(binaryAst, ['t-p1', 't-p2'], []);
    t.equal(binaryRes.success, true);
    t.same(binaryRes.rows, [{n: 2}]);

    const nocaseAst = new SQLParser(
      'SELECT COUNT(DISTINCT name) AS n FROM t',
    ).parse();
    const nocaseRes = await executor.executeSelect(nocaseAst, ['t-p1', 't-p2'], []);
    t.equal(nocaseRes.success, true);
    t.same(nocaseRes.rows, [{n: 1}]);
  } finally {
    close();
  }
});

test('Review 4 Item 4: CoordinatorMergeProcessPool handles already-aborted requests and cancellation between IPC phases cleanly, followed by a successful pooled query', async (t) => {
  const rowsP1 = [{id: 1n, v: 10n}, {id: 2n, v: 20n}];
  const rowsP2 = [{id: 3n, v: 30n}, {id: 4n, v: 40n}];
  const {executor, close} = createSqliteClusterExecutor([{
    tableName: 't',
    ddl: 'CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER'},
        {name: 'v', type: 'INTEGER'},
      ],
      primaryKey: ['id'],
    },
    partitions: [rowsP1, rowsP2],
  }]);

  try {
    // Force COORDINATOR_EVALUATED path (e.g. expression GROUP BY) so the worker pool is used:
    const coordEvalAst = new SQLParser(
      'SELECT (id % 2) AS parity, SUM(v) AS total FROM t GROUP BY (id % 2) ORDER BY parity',
    ).parse();

    // 1. Already-aborted AbortSignal before entering the merge worker pool:
    const preAbortedController = new AbortController();
    preAbortedController.abort();
    let preAbortedErr = null;
    try {
      await executor.executeSelect(
        coordEvalAst,
        ['t-p1', 't-p2'],
        [],
        {signal: preAbortedController.signal},
      );
    } catch (err) {
      preAbortedErr = err;
    }
    t.equal(preAbortedErr?.code, QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED);

    // 2. Also test sendAndWait directly when signal is already aborted on entry to a phase
    // after worker acquisition, and cancellation occurring between INIT_SESSION and INGEST_BATCH:
    const pool = executor.mergeEngine.processPool;
    const workerForPreAbortedPhase = await pool.acquireWorker(Date.now() + 5000);
    let phaseEntryAbortErr = null;
    try {
      await pool.sendAndWait(
        workerForPreAbortedPhase,
        {type: 'INIT_SESSION', sessionOptions: {}, tables: []},
        5000,
        {signal: preAbortedController.signal},
      );
    } catch (err) {
      phaseEntryAbortErr = err;
    } finally {
      pool.releaseWorker(workerForPreAbortedPhase, false);
    }
    t.equal(phaseEntryAbortErr?.code, QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED);

    // 3. Cancellation triggered between IPC phases (after INIT_SESSION succeeds, before
    // the next sendAndWait phase runs):
    const betweenPhasesController = new AbortController();
    const originalSendAndWait = pool.sendAndWait.bind(pool);
    let ipcPhaseCount = 0;
    pool.sendAndWait = async function(...args) {
      ipcPhaseCount += 1;
      const res = await originalSendAndWait(...args);
      if (ipcPhaseCount === 1) {
        // Abort immediately after INIT_SESSION completes, before INGEST_FRAGMENT / EXECUTE_MERGE
        betweenPhasesController.abort();
      }
      return res;
    };
    let betweenPhasesErr = null;
    try {
      await executor.executeSelect(
        coordEvalAst,
        ['t-p1', 't-p2'],
        [],
        {signal: betweenPhasesController.signal},
      );
    } catch (err) {
      betweenPhasesErr = err;
    } finally {
      pool.sendAndWait = originalSendAndWait;
    }
    t.equal(betweenPhasesErr?.code, QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED);
    t.equal(ipcPhaseCount, 2);

    // 4. Subsequent query through the pool succeeds cleanly:
    const followUp = await executor.executeSelect(
      coordEvalAst,
      ['t-p1', 't-p2'],
      [],
      {deadlineMs: Date.now() + 5000},
    );
    t.equal(followUp.success, true);
    t.same(followUp.rows, [
      {parity: 0, total: 60},
      {parity: 1, total: 40},
    ]);

    // 5. Parameterized aggregate window and generic window functions bind positional
    // parameters in SQL lexical order (function args before OVER (ORDER BY ?)):
    const aggWindowAst = new SQLParser(
      'SELECT id, SUM(?) OVER (ORDER BY ?, id) AS win_sum FROM t ORDER BY id',
    ).parse();
    const aggWindowRes = await executor.executeSelect(
      aggWindowAst,
      ['t-p1', 't-p2'],
      [2n, 1n],
      {deadlineMs: Date.now() + 5000},
    );
    t.equal(aggWindowRes.success, true);
    t.same(aggWindowRes.rows, [
      {id: 1, win_sum: 2},
      {id: 2, win_sum: 4},
      {id: 3, win_sum: 6},
      {id: 4, win_sum: 8},
    ]);

    const genericWindowAst = new SQLParser(
      'SELECT id, LAG(?, 1, ?) OVER (ORDER BY ?, id) AS lag_val FROM t ORDER BY id',
    ).parse();
    const genericWindowRes = await executor.executeSelect(
      genericWindowAst,
      ['t-p1', 't-p2'],
      [100n, -1n, 1n],
      {deadlineMs: Date.now() + 5000},
    );
    t.equal(genericWindowRes.success, true);
    t.same(genericWindowRes.rows, [
      {id: 1, lag_val: -1},
      {id: 2, lag_val: 100},
      {id: 3, lag_val: 100},
      {id: 4, lag_val: 100},
    ]);
  } finally {
    close();
  }
});
