/**
 * The interim typed refusals of WP2 (design coordinator-sqlite-merge §5.1),
 * each tagged with the work package that removes it. Until then the
 * coordinator's JavaScript evaluators cannot evaluate an explicit COLLATE
 * (or an ESCAPE) or apply a parameter LIMIT as SQLite does, so the statement
 * is refused, typed, where they would evaluate it, and runs where SQLite
 * evaluates it.
 */

import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {compilePredicate} from '../../src/live-query/live-query-service.js';
import {resolveExecutionSQL} from '../../src/live-query/live-query-group-helpers.js';
import {
  FANOUT_PLAN_KIND,
  buildSelectFanoutPlan,
} from '../../src/query/distributed/distributed-select-fanout-plan.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {SQLQueryEngineSelectExecution} from
  '../../src/query/sql-query-engine-select-execution.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) config.initialize();

const UNSUPPORTED = {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE};

function parse(sql) {
  return new SQLParser(sql).parse();
}

function plan(sql, partitionCount) {
  return buildSelectFanoutPlan(parse(sql), [], partitionCount);
}

describe('I1a (removed by WP3): COLLATE/ESCAPE in coordinator-evaluated positions', () => {
  test('HAVING is evaluated by the coordinator at every partition count', () => {
    for (const count of [1, 3]) {
      assert.throws(() => plan('SELECT x, COUNT(*) AS n FROM t GROUP BY x ' +
        'HAVING x = \'a\' COLLATE NOCASE', count), UNSUPPORTED);
      assert.throws(() => plan('SELECT x, COUNT(*) AS n FROM t GROUP BY x ' +
        'HAVING x LIKE \'a!%\' ESCAPE \'!\'', count), UNSUPPORTED);
    }
  });

  test('ORDER BY: refused where the coordinator sorts, run where the partition does', () => {
    // One partition's raw rows: the coordinator's re-sort keeps its order.
    assert.equal(plan('SELECT id FROM t ORDER BY x COLLATE NOCASE', 1).kind,
      FANOUT_PLAN_KIND.RAW_ROWS);
    assert.equal(plan('SELECT id FROM t ORDER BY id, x COLLATE NOCASE', 1).kind,
      FANOUT_PLAN_KIND.RAW_ROWS);
    // The re-sort by a later term, several partitions, or a partial aggregate
    // (the partitions do not sort): the coordinator orders the rows.
    assert.throws(() => plan('SELECT id FROM t ORDER BY x COLLATE NOCASE, id', 1), UNSUPPORTED);
    assert.throws(() => plan('SELECT id FROM t ORDER BY x COLLATE NOCASE', 2), UNSUPPORTED);
    assert.throws(() => plan('SELECT x, COUNT(*) AS n FROM t GROUP BY x ' +
      'ORDER BY x COLLATE NOCASE', 1), UNSUPPORTED);
    assert.throws(() => plan('SELECT x COLLATE NOCASE AS k FROM t ORDER BY k', 1), UNSUPPORTED);
  });

  test('GROUP BY terms and aggregate arguments are refused once partitions meet', () => {
    for (const sql of ['SELECT COUNT(*) AS n FROM t GROUP BY x COLLATE NOCASE',
      'SELECT MIN(x COLLATE NOCASE) AS m FROM t',
      'SELECT COUNT(DISTINCT x COLLATE NOCASE) AS n FROM t',
      'SELECT x COLLATE NOCASE AS k FROM t']) {
      assert.throws(() => plan(sql, 2), UNSUPPORTED, sql);
      assert.ok(plan(sql, 1), `${sql}: one partition's SQLite evaluates it`);
    }
  });

  test('a WHERE conjunct is pushed to the partitions and never refused', () => {
    assert.equal(plan('SELECT id FROM t WHERE x = \'a\' COLLATE NOCASE AND ' +
      'x LIKE \'a!%\' ESCAPE \'!\'', 5).kind, FANOUT_PLAN_KIND.RAW_ROWS);
  });
});

describe('LIMIT/OFFSET parameters (removed by WP3): the coordinator applies the limit', () => {
  test('a parameter LIMIT or OFFSET is refused at every partition count', () => {
    for (const count of [1, 2]) {
      assert.throws(() => buildSelectFanoutPlan(parse('SELECT id FROM t ORDER BY id LIMIT ?'),
        [2n], count), UNSUPPORTED);
      assert.throws(() => buildSelectFanoutPlan(parse('SELECT id FROM t ORDER BY id ' +
        'LIMIT 2 OFFSET ?'), [1n], count), UNSUPPORTED);
    }
    assert.equal(plan('SELECT id FROM t ORDER BY id LIMIT 2 OFFSET 1', 2).kind,
      FANOUT_PLAN_KIND.RAW_ROWS);
  });
});

describe('I1b (removed by WP3): a cross-partition join is evaluated by the coordinator', () => {
  const join = (sql) => QueryExecutor.prototype.executeCrossPartitionJoin.call({},
    parse(sql), ['p1'], [], {joinPartitions: new Map()}, null);

  test('COLLATE in ON, COLLATE or ESCAPE elsewhere, and a parameter LIMIT are refused', async () => {
    for (const sql of ['SELECT t.id FROM t JOIN u ON t.x = u.tk COLLATE NOCASE',
      'SELECT t.id FROM t JOIN u ON t.id = u.k WHERE t.x LIKE \'a!%\' ESCAPE \'!\'',
      'SELECT t.id FROM t JOIN u ON t.id = u.k ORDER BY t.x COLLATE NOCASE',
      'SELECT t.id FROM t JOIN u ON t.id = u.k LIMIT ?']) {
      const result = await join(sql);
      assert.equal(result.success, false, sql);
      assert.equal(result.errorCode, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, sql);
    }
  });
});

describe('I1c (removed by WP4): a write key is evaluated by the coordinator', () => {
  test('COLLATE in a write-key expression is refused', () => {
    const coordinator = new DistributedWriteCoordinator();
    const value = parse('SELECT \'a\' COLLATE NOCASE FROM t').columns[0].expression;
    assert.throws(() => coordinator.extractKeyValue(value),
      {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, message: /I1c/u});
  });
});

describe('I1d and I1e (removed by WP7): the live-query evaluator and fallback renderer', () => {
  test('a live-query predicate holding COLLATE or ESCAPE is refused', () => {
    for (const sql of ['SELECT * FROM t WHERE x = \'a\' COLLATE NOCASE',
      'SELECT * FROM t WHERE x LIKE \'a!%\' ESCAPE \'!\'']) {
      assert.throws(() => compilePredicate(parse(sql).where), UNSUPPORTED, sql);
    }
    assert.equal(compilePredicate(parse('SELECT * FROM t WHERE x = \'a\'').where)({x: 'a'}),
      true);
  });

  test('the fallback renderer refuses COLLATE; the engine renderer carries it', () => {
    const query = parse('SELECT x FROM t WHERE x = \'a\' COLLATE NOCASE');
    assert.throws(() => resolveExecutionSQL(null, null, query), UNSUPPORTED);
    const engine = {executor: {buildSelectSQL: (ast) => QueryExecutor.prototype
      .buildSelectSQL.call({}, ast)}};
    assert.match(resolveExecutionSQL(null, engine, query), /COLLATE NOCASE/u);
  });
});

describe('I2 (removed by WP3) and connection-state functions on coordinator paths', () => {
  const execute = (sql) => SQLQueryEngineSelectExecution.prototype.executeSelectOwned.call(
    {executeFromlessSelect: async () => ({success: true, evaluated: true})},
    parse(sql), [], 'session', {}, null, null);

  test('a FROM-less SELECT with clauses beyond its result columns is refused', async () => {
    for (const sql of ['SELECT 1 AS c0 LIMIT 0', 'SELECT 2 AS c0 ORDER BY 1',
      'SELECT 1 AS c0 WHERE 0', 'SELECT DISTINCT 1 AS c0', 'SELECT 1 UNION SELECT 2',
      'SELECT 1 AS c0 GROUP BY 1 HAVING 1']) {
      const result = await execute(sql);
      assert.equal(result.errorCode, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, sql);
    }
    assert.equal((await execute('SELECT 1 + 1 AS c0')).evaluated, true);
  });

  test('changes(), last_insert_rowid() and total_changes() are refused on reads', async () => {
    for (const sql of ['SELECT changes() AS c0 FROM t WHERE id = 10',
      'SELECT last_insert_rowid() AS c0', 'SELECT id FROM t WHERE id > TOTAL_CHANGES()']) {
      const result = await execute(sql);
      assert.equal(result.errorCode, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, sql);
    }
  });
});
