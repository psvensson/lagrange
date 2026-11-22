import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {EXPR_TYPE} from '../../src/query/parser-constants.js';
import {PARSER_DIALECT, PG_EXPR_TYPE} from '../../src/query/pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {
  renderExpression,
  renderExpressionWithParameters,
  renderSelect,
  renderSelectWithParameters,
} from '../../src/query/sql-statement-renderer.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {DistributedQueryPlanner} from '../../src/query/distributed/distributed-query-planner.js';
import {buildJoinPushdownPlan} from '../../src/query/distributed/join-pushdown-plan.js';
import {WINDOW_NO_PARTITION_NAME} from '../../src/query/sql-parser-source-text.js';
import {clearMemoryReservations} from '../../src/partition/partition-locking-read-reservation.js';
import {truncateDbReservations} from '../../src/partition/partition-locking-read-store.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from '../test-helpers/participant-protocol-double.js';
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
    systemCache: createMockSystemCache([], [{partition_id: 'p1'}], []),
  });
}

test('D1: SQL Boolean keyword vs numeric literal vs JS Boolean parameter vs quoted identifier', () => {
  const executor = createExecutor();
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER)');
    const insert = db.prepare('INSERT INTO t (id, n) VALUES (?, ?)');
    insert.run(1, 0);
    insert.run(2, 1);
    insert.run(3, 2);

    // 1. SQL Boolean keyword TRUE on right of IS tests truth value in SQLite (1 and 2 match)
    const isTrueAst = new SQLParser('DELETE FROM t WHERE n IS TRUE').parse();
    const isTrueParams = [];
    const isTrueSql = executor.buildDeleteSQL(isTrueAst, isTrueParams);
    assert.equal(isTrueSql, 'DELETE FROM t WHERE (n IS TRUE)');
    assert.deepEqual(isTrueParams, []);

    // 2. Bound JS Boolean parameter [true] on right of IS normalizes to integer 1 (only n = 1 matches)
    const isParamAst = new SQLParser('DELETE FROM t WHERE n IS ?').parse();
    const isParamOut = [true];
    const isParamSql = executor.buildDeleteSQL(isParamAst, isParamOut);
    assert.equal(isParamSql, 'DELETE FROM t WHERE (n IS 1)');
    assert.deepEqual(isParamOut, []);

    db.exec('BEGIN');
    const paramDeleted = db.prepare(isParamSql).run(...isParamOut).changes;
    const remainingAfterParam = db.prepare('SELECT id, n FROM t ORDER BY id').all();
    assert.equal(paramDeleted, 1);
    assert.deepEqual(remainingAfterParam, [
      {id: 1, n: 0},
      {id: 3, n: 2},
    ]);
    db.exec('ROLLBACK');

    db.exec('BEGIN');
    const keywordDeleted = db.prepare(isTrueSql).run(...isTrueParams).changes;
    const remainingAfterKeyword = db.prepare('SELECT id, n FROM t ORDER BY id').all();
    assert.equal(keywordDeleted, 2);
    assert.deepEqual(remainingAfterKeyword, [
      {id: 1, n: 0},
    ]);
    db.exec('ROLLBACK');

    // 3. UPDATE with JS boolean parameters in SET and WHERE emits 1/0, never TRUE/FALSE
    const updateAst = new SQLParser('UPDATE t SET n = ? WHERE n IS ?').parse();
    const updateParams = [false, true];
    const updateSql = executor.buildUpdateSQL(updateAst, updateParams);
    assert.equal(updateSql, 'UPDATE t SET n = 0 WHERE (n IS 1)');
    assert.deepEqual(updateParams, []);

    // 4. INSERT with JS boolean parameters emits 1/0
    const insertAst = new SQLParser('INSERT INTO t (id, n) VALUES (?, ?)').parse();
    const insertParams = [4, true];
    const insertSql = executor.buildInsertSQL(insertAst, insertParams);
    assert.equal(insertSql, 'INSERT INTO t (id, n) VALUES (?, 1)');
    assert.deepEqual(insertParams, [4]);

    // 5. Double-quoted "TRUE" is a COLUMN_REF identifier, never a boolean or integer literal
    db.exec('CREATE TABLE t_quoted (id INTEGER PRIMARY KEY, "TRUE" TEXT)');
    db.prepare('INSERT INTO t_quoted (id, "TRUE") VALUES (?, ?)').run(1, 'yes');
    const quotedAst = new SQLParser('SELECT "TRUE" FROM t_quoted WHERE "TRUE" = ?').parse();
    assert.equal(quotedAst.columns[0].expression.type, EXPR_TYPE.COLUMN_REF);
    assert.equal(quotedAst.columns[0].expression.column, 'TRUE');
    const quotedSql = renderSelect(quotedAst);
    assert.equal(
      quotedSql,
      'SELECT "TRUE" FROM t_quoted WHERE ("TRUE" = ?)',
    );
    assert.deepEqual(db.prepare(quotedSql).all('yes'), [{TRUE: 'yes'}]);
  } finally {
    db.close();
  }
});

test('D2 & Counterexample 1b: write command rendering collects parameters in exact SQL emission order and fails closed on unbound indices', () => {
  const executor = createExecutor();

  // Hand-constructed AST nodes with object keys in reverse of SQL emission order
  const updateAst = {
    type: 'UPDATE',
    table: 'items',
    assignments: [
      {
        column: 'val',
        // right key defined before left key
        value: {
          type: EXPR_TYPE.BINARY,
          operator: '+',
          right: {type: EXPR_TYPE.PARAMETER, index: 1},
          left: {type: EXPR_TYPE.PARAMETER, index: 0},
        },
      },
    ],
    // high and low keys defined before expression key
    where: {
      type: EXPR_TYPE.BETWEEN,
      high: {type: EXPR_TYPE.PARAMETER, index: 4},
      low: {type: EXPR_TYPE.PARAMETER, index: 3},
      expression: {type: EXPR_TYPE.PARAMETER, index: 2},
    },
  };

  const params = ['p0', 'p1', 'p2', 'p3', 'p4'];
  const sql = executor.buildUpdateSQL(updateAst, params);
  assert.equal(sql, 'UPDATE items SET val = (? + ?) WHERE (? BETWEEN ? AND ?)');
  assert.deepEqual(params, ['p0', 'p1', 'p2', 'p3', 'p4']);

  // Mixed inlined storage-class literals (boolean, bigint) and bound parameters with reversed key order
  const mixedParams = [100n, 'rhs', 'col_val', false, true];
  const mixedSql = executor.buildUpdateSQL(updateAst, mixedParams);
  assert.equal(mixedSql, 'UPDATE items SET val = (100 + ?) WHERE (? BETWEEN 0 AND 1)');
  assert.deepEqual(mixedParams, ['rhs', 'col_val']);

  // Unbound parameter index (missing index, out-of-bounds, undefined) fails closed with SYNTAX_ERROR
  assert.throws(
    () => executor.buildDeleteSQL(
      {
        type: 'DELETE',
        table: 'items',
        where: {
          type: EXPR_TYPE.BINARY,
          operator: '=',
          left: {type: EXPR_TYPE.COLUMN_REF, table: null, column: 'id'},
          right: {type: EXPR_TYPE.PARAMETER, index: 2},
        },
      },
      ['only-one'],
    ),
    (err) =>
      err.code === QUERY_ERROR_CODE.SYNTAX_ERROR &&
      err.errorCode === QUERY_ERROR_CODE.SYNTAX_ERROR &&
      /Unbound parameter index: 2/u.test(err.message),
  );

  assert.throws(
    () => executor.buildDeleteSQL(
      {
        type: 'DELETE',
        table: 'items',
        where: {
          type: EXPR_TYPE.BINARY,
          operator: '=',
          left: {type: EXPR_TYPE.COLUMN_REF, table: null, column: 'id'},
          right: {type: EXPR_TYPE.PARAMETER},
        },
      },
      ['only-one'],
    ),
    (err) =>
      err.code === QUERY_ERROR_CODE.SYNTAX_ERROR &&
      err.errorCode === QUERY_ERROR_CODE.SYNTAX_ERROR &&
      /Unbound parameter index: undefined/u.test(err.message),
  );

  assert.throws(
    () => executor.buildInsertSQL(
      new SQLParser('INSERT INTO items (id, val) VALUES (?, ?)').parse(),
      [1, undefined],
    ),
    (err) =>
      err.code === QUERY_ERROR_CODE.SYNTAX_ERROR &&
      err.errorCode === QUERY_ERROR_CODE.SYNTAX_ERROR &&
      /Unbound parameter index: 1/u.test(err.message),
  );

  // Unbound SQL rendering with no params array passed renders '?' placeholders as-is
  const unboundDeleteSql = executor.buildDeleteSQL(
    new SQLParser('DELETE FROM items WHERE id = ?').parse(),
  );
  assert.equal(unboundDeleteSql, 'DELETE FROM items WHERE (id = ?)');
});

test('D2: PostgreSQL convertFunction converts function arguments before OVER (ORDER BY ...) so lexical parameter numbering is preserved', () => {
  const parser = new SQLParser('SELECT 1', {dialect: PARSER_DIALECT.POSTGRESQL});
  const externalFnExpr = {
    type: 'function',
    name: {name: [{type: 'default', value: 'coalesce'}]},
    args: {
      type: 'expr_list',
      value: [
        {type: 'var', name: 1, prefix: '$', members: []},
        {type: 'var', name: 2, prefix: '$', members: []},
      ],
    },
    over: {
      partitionby: [
        {
          expr: {
            type: 'column_ref',
            table: null,
            column: WINDOW_NO_PARTITION_NAME,
          },
          as: null,
        },
      ],
      orderby: [
        {
          expr: {type: 'var', name: 3, prefix: '$', members: []},
          type: 'ASC',
        },
      ],
    },
  };

  const converted = parser.convertExpression(externalFnExpr);
  assert.equal(converted.type, PG_EXPR_TYPE.FUNCTION_CALL);
  assert.equal(converted.args[0].type, EXPR_TYPE.PARAMETER);
  assert.equal(converted.args[0].index, 0);
  assert.equal(converted.args[1].type, EXPR_TYPE.PARAMETER);
  assert.equal(converted.args[1].index, 1);
  assert.equal(converted.over.orderBy[0].expression.type, EXPR_TYPE.PARAMETER);
  assert.equal(converted.over.orderBy[0].expression.index, 2);
  assert.deepEqual(parser.positionalParams, [1, 2, 3]);
  assert.equal(renderExpression(converted), 'coalesce(?, ?) OVER (ORDER BY ? ASC)');
});

test('Counterexample 2: join-pushdown-plan collects parameters in SQL emission order regardless of AST object key order', () => {
  const ast = {
    type: 'SELECT',
    distinct: false,
    columns: [
      {
        type: EXPR_TYPE.COLUMN,
        expression: {type: EXPR_TYPE.COLUMN_REF, table: 'u', column: 'id'},
        alias: null,
      },
    ],
    from: {type: EXPR_TYPE.TABLE, name: 'users', alias: 'u'},
    joins: [
      {
        joinType: 'INNER',
        table: {type: EXPR_TYPE.TABLE, name: 'orders', alias: 'o'},
        condition: {
          type: EXPR_TYPE.BINARY,
          operator: '=',
          left: {type: EXPR_TYPE.COLUMN_REF, table: 'u', column: 'id'},
          right: {type: EXPR_TYPE.COLUMN_REF, table: 'o', column: 'user_id'},
        },
      },
    ],
    where: {
      type: EXPR_TYPE.BINARY,
      operator: 'AND',
      // Reversed key order on main conjunct: right before left
      left: {
        type: EXPR_TYPE.BINARY,
        operator: '=',
        right: {type: EXPR_TYPE.PARAMETER, index: 1},
        left: {
          type: EXPR_TYPE.BINARY,
          operator: '+',
          right: {type: EXPR_TYPE.PARAMETER, index: 0},
          left: {type: EXPR_TYPE.COLUMN_REF, table: 'u', column: 'age'},
        },
      },
      // Reversed key order on join conjunct: high, low before expression
      right: {
        type: EXPR_TYPE.BETWEEN,
        high: {type: EXPR_TYPE.PARAMETER, index: 4},
        low: {type: EXPR_TYPE.PARAMETER, index: 3},
        expression: {
          type: EXPR_TYPE.BINARY,
          operator: '+',
          right: {type: EXPR_TYPE.PARAMETER, index: 2},
          left: {type: EXPR_TYPE.COLUMN_REF, table: 'o', column: 'amount'},
        },
      },
    },
    groupBy: null,
    having: null,
    orderBy: null,
    limit: null,
  };

  const plan = buildJoinPushdownPlan(ast, ['u_add', 'u_target', 'o_add', 'o_low', 'o_high']);
  assert.deepEqual(plan.main.params, ['u_add', 'u_target']);
  assert.deepEqual(plan.joins[0].params, ['o_add', 'o_low', 'o_high']);
});

test('Counterexample 3: DistributedQueryPlanner buildReadFragmentPlans slices per-fragment parameters in emitted placeholder order', () => {
  const partitions = [
    {partition_id: 'users-p1', table_name: 'users', partition_key_start: null, partition_key_end: null},
    {partition_id: 'orders-p1', table_name: 'orders', partition_key_start: null, partition_key_end: null},
  ];
  const tables = [
    {table_name: 'users', primaryKey: 'id'},
    {table_name: 'orders', primaryKey: 'order_id'},
  ];
  const systemCache = createMockSystemCache(tables, partitions);
  const resolver = new PartitionResolver({systemCache});
  const planner = new DistributedQueryPlanner({
    partitionResolver: resolver,
    getTablePartitions: (tableName) =>
      partitions.filter((p) => p.table_name === tableName),
  });

  const ast = new SQLParser(
    'SELECT u.name, o.amount FROM users AS u ' +
    'JOIN orders AS o ON u.id = o.user_id ' +
    'WHERE u.region = ? AND o.amount BETWEEN ? AND ?',
  ).parse();
  const plan = planner.planSelect(ast, ['east', 10, 50]);

  const userFragment = plan.fragmentPlans.find((f) => f.tableAlias === 'u');
  const orderFragment = plan.fragmentPlans.find((f) => f.tableAlias === 'o');

  assert.deepEqual(userFragment.params, ['east']);
  assert.deepEqual(orderFragment.params, [10, 50]);
});

test('Counterexample 4: PostgreSQL $N _paramMapping is applied exactly once across parseCache hits and locking-read write footprint checks', async () => {
  clearMemoryReservations();
  const tables = [
    {table_name: 'orders', primaryKey: 'id', partition_key_type: 'INTEGER'},
  ];
  const partitions = [
    {
      table_name: 'orders',
      partition_id: 'orders-p1',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
    },
  ];
  const systemCache = createMockSystemCache(tables, partitions);
  const gateway = createTransactionPersistenceGateway();
  const ordersDb = new Database(':memory:');
  const partitionServices = new Map([['orders-p1', {db: ordersDb, partitionId: 'orders-p1'}]]);

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    controlPlaneSystemTableGateway: gateway,
    partitionServicesProvider: () => partitionServices,
    messageRouter: {
      async deliver(_address, message) {
        if (message.type === 'TRANSACTION') {
          return buildDeliveryEnvelope(
            {acknowledged: true},
            answerParticipantTransactionRequest(message),
          );
        }
        return buildDeliveryEnvelope(
          {acknowledged: true},
          {success: true, rows: [{id: 10, total: 50}], affectedRows: 1, changes: 1},
        );
      },
    },
  });

  try {
    await engine.transactionCoordinator.begin('s-holder');
    const lockRes = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = $1 FOR UPDATE',
      [10],
      {sessionId: 's-holder', dialect: PARSER_DIALECT.POSTGRESQL},
    );
    assert.equal(lockRes.success, true, lockRes.error);

    // Lexical order of placeholders is $2 then $1 -> _paramMapping = [2, 1].
    // params = [10, 999] means $1 (id) = 10, $2 (total) = 999.
    // Test both cache miss (1st call) and cache hit (2nd call)!
    const updateSql = 'UPDATE orders SET total = $2 WHERE id = $1';

    await engine.transactionCoordinator.begin('s-writer-1');
    const attempt1 = await engine.executeQuery(
      updateSql,
      [10, 999],
      {sessionId: 's-writer-1', dialect: PARSER_DIALECT.POSTGRESQL},
    );
    assert.equal(attempt1.success, false);
    assert.equal(attempt1.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(attempt1.sqlState, '55P03');

    await engine.transactionCoordinator.begin('s-writer-2');
    const attempt2 = await engine.executeQuery(
      updateSql,
      [10, 999],
      {sessionId: 's-writer-2', dialect: PARSER_DIALECT.POSTGRESQL},
    );
    assert.equal(attempt2.success, false);
    assert.equal(attempt2.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(attempt2.sqlState, '55P03');

    // Updating a non-locked row id ($1 = 20) to total ($2 = 10) must NOT falsely conflict with id = 10
    await engine.transactionCoordinator.begin('s-writer-disjoint');
    const disjointAttempt = await engine.executeQuery(
      updateSql,
      [20, 10],
      {sessionId: 's-writer-disjoint', dialect: PARSER_DIALECT.POSTGRESQL},
    );
    assert.equal(disjointAttempt.success, true, disjointAttempt.error);
    await engine.transactionCoordinator.commit('s-writer-disjoint');
  } finally {
    truncateDbReservations(ordersDb);
    clearMemoryReservations();
    ordersDb.close();
    gateway.db.close();
  }
});

test('Finding 1 regression: aggregate-local ORDER BY binds argument parameters before ORDER BY parameters across Aggregate, FunctionCall, DISTINCT, and write subqueries', () => {
  const executor = createExecutor();
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    const insert = db.prepare('INSERT INTO t (id, val) VALUES (?, ?)');
    insert.run(1, 'a');
    insert.run(2, 'b');
    insert.run(3, 'c');

    const resolveFrom = (params) => (node) => params[node.index];

    // 1. Aggregate node: SELECT SUM(? ORDER BY id + ?) AS total FROM t with unequal [2n, 100n]
    const sumAst = new SQLParser('SELECT SUM(? ORDER BY id + ?) AS total FROM t').parse();
    const sumRendered = renderSelectWithParameters(sumAst, resolveFrom([2n, 100n]));
    assert.equal(sumRendered.sql, 'SELECT SUM(? ORDER BY (id + ?) ASC) AS total FROM t');
    assert.deepEqual(sumRendered.params, [2n, 100n]);
    const sumRow = db.prepare(sumRendered.sql).safeIntegers(true).get(...sumRendered.params);
    assert.equal(sumRow.total, 6n);

    // 2. DISTINCT Aggregate node: SELECT SUM(DISTINCT ? ORDER BY id + ?) AS total FROM t
    const distinctSumAst = new SQLParser(
      'SELECT SUM(DISTINCT ? ORDER BY id + ?) AS total FROM t',
    ).parse();
    const distinctSumRendered = renderSelectWithParameters(
      distinctSumAst,
      resolveFrom([7n, 100n]),
    );
    assert.equal(
      distinctSumRendered.sql,
      'SELECT SUM(DISTINCT ? ORDER BY (id + ?) ASC) AS total FROM t',
    );
    assert.deepEqual(distinctSumRendered.params, [7n, 100n]);
    const distinctSumRow = db
      .prepare(distinctSumRendered.sql)
      .safeIntegers(true)
      .get(...distinctSumRendered.params);
    assert.equal(distinctSumRow.total, 7n);

    // 3. Single-arg GROUP_CONCAT(? ORDER BY id + ?) (FunctionCall node) and hand-constructed Aggregate shape
    const gcSingleAst = new SQLParser(
      'SELECT GROUP_CONCAT(? ORDER BY id + ?) AS joined FROM t',
    ).parse();
    const gcSingleRendered = renderSelectWithParameters(
      gcSingleAst,
      resolveFrom(['item', 100n]),
    );
    assert.deepEqual(gcSingleRendered.params, ['item', 100n]);
    const gcSingleRow = db.prepare(gcSingleRendered.sql).get(...gcSingleRendered.params);
    assert.equal(gcSingleRow.joined, 'item,item,item');

    const gcAggregateShape = {
      type: EXPR_TYPE.AGGREGATE,
      function: 'GROUP_CONCAT',
      argument: {type: EXPR_TYPE.PARAMETER, index: 0},
      distinct: false,
      orderBy: [
        {
          expression: {
            type: EXPR_TYPE.BINARY,
            operator: '+',
            left: {type: EXPR_TYPE.COLUMN_REF, table: null, column: 'id'},
            right: {type: EXPR_TYPE.PARAMETER, index: 1},
          },
          direction: 'ASC',
        },
      ],
    };
    const gcAggRendered = renderExpressionWithParameters(
      gcAggregateShape,
      resolveFrom(['agg-item', 200n]),
    );
    assert.equal(gcAggRendered.sql, 'GROUP_CONCAT(? ORDER BY (id + ?) ASC)');
    assert.deepEqual(gcAggRendered.params, ['agg-item', 200n]);

    // 4. Multi-arg FunctionCall: GROUP_CONCAT(val || ?, ? ORDER BY id + ?)
    const gcMultiAst = new SQLParser(
      'SELECT GROUP_CONCAT(val || ?, ? ORDER BY id + ?) AS joined FROM t',
    ).parse();
    const gcMultiRendered = renderSelectWithParameters(
      gcMultiAst,
      resolveFrom(['!', '|', 100n]),
    );
    assert.equal(
      gcMultiRendered.sql,
      'SELECT GROUP_CONCAT((val || ?), ? ORDER BY (id + ?) ASC) AS joined FROM t',
    );
    assert.deepEqual(gcMultiRendered.params, ['!', '|', 100n]);
    const gcMultiRow = db.prepare(gcMultiRendered.sql).get(...gcMultiRendered.params);
    assert.equal(gcMultiRow.joined, 'a!|b!|c!');

    // 5. Subquery & mutation consumer through renderSelectWithParameters & buildUpdateSQL
    const selectWithSubqueries = new SQLParser(
      'SELECT (SELECT SUM(? ORDER BY id + ?) FROM t) AS sub_sum, ' +
      '(SELECT GROUP_CONCAT(val || ?, ? ORDER BY id + ?) FROM t) AS sub_gc ' +
      'FROM t WHERE id = ?',
    ).parse();
    const subRendered = renderSelectWithParameters(
      selectWithSubqueries,
      resolveFrom([2n, 100n, '!', ':', 200n, 1n]),
    );
    assert.deepEqual(subRendered.params, [2n, 100n, '!', ':', 200n, 1n]);
    const subRow = db.prepare(subRendered.sql).safeIntegers(true).get(...subRendered.params);
    assert.deepEqual(subRow, {sub_sum: 6n, sub_gc: 'a!:b!:c!'});

    const innerSubqueryAst = new SQLParser(
      'SELECT GROUP_CONCAT(val || ?, ? ORDER BY id + ?) AS joined FROM t',
    ).parse();
    const updateWithAggSubquery = {
      type: 'UPDATE',
      table: 't',
      assignments: [
        {
          column: 'val',
          value: {
            type: PG_EXPR_TYPE.SUBQUERY,
            query: innerSubqueryAst,
          },
        },
      ],
      where: {
        type: EXPR_TYPE.BINARY,
        operator: '=',
        left: {type: EXPR_TYPE.COLUMN_REF, table: null, column: 'id'},
        right: {type: EXPR_TYPE.PARAMETER, index: 3},
      },
    };
    const updateParams = ['!', ':', 100n, 1];
    const updateSql = executor.buildUpdateSQL(updateWithAggSubquery, updateParams);
    assert.equal(
      updateSql,
      'UPDATE t SET val = (SELECT GROUP_CONCAT((val || ?), ? ORDER BY (id + 100) ASC) AS joined FROM t) WHERE (id = ?)',
    );
    assert.deepEqual(updateParams, ['!', ':', 1]);
    db.prepare(updateSql).run(...updateParams);
    assert.equal(
      db.prepare('SELECT val FROM t WHERE id = 1').get().val,
      'a!:b!:c!',
    );

    // 6. EXISTS(...) OVER (...) and keyword functions with OVER (...) are refused, never dropped
    assert.throws(
      () => new SQLParser('SELECT EXISTS(SELECT 1 FROM t WHERE id = ?) OVER (ORDER BY id + ?) FROM t').parse(),
      (err) => err?.code === 'UNSUPPORTED_SQL_FEATURE',
    );
    assert.throws(
      () => new SQLParser('SELECT 1').convertExpression({
        type: 'function',
        name: {name: [{type: 'origin', value: 'CURRENT_TIME'}]},
        args: null,
        over: {orderby: [{expr: {type: 'number', value: 1}, type: 'ASC'}]},
      }),
      (err) => err?.code === 'UNSUPPORTED_SQL_FEATURE',
    );
  } finally {
    db.close();
  }
});
