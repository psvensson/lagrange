/**
 * Coordinator interim typed refusals (design coordinator-sqlite-merge §5.1).
 *
 * WP3 removes interims I1a, I1b, I2, and I3 by routing distributed SELECTs,
 * cross-partition JOINs, and FROM-less SELECTs through CoordinatorMergeSession
 * (in-memory SQLite). Interims I1c (write-key evaluation, removed by WP4) and
 * I1d/I1e (live-query predicate and fallback renderer, removed by WP7), plus
 * the permanent refusal of connection-state functions on coordinator read paths,
 * remain enforced and verified here.
 */

import assert from 'node:assert/strict';
import {after, describe, test} from 'node:test';

import Database from 'better-sqlite3';

import {TABLES} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {QueryGroup} from '../../src/live-query/live-query-group.js';
import {LiveQueryService, compilePredicate} from '../../src/live-query/live-query-service.js';
import {resolveExecutionSQL} from '../../src/live-query/live-query-group-helpers.js';
import {
  FANOUT_PLAN_KIND,
  buildSelectFanoutPlan,
} from '../../src/query/distributed/distributed-select-fanout-plan.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {enforceCoordinatorUniqueConstraints} from
  '../../src/query/distributed/distributed-write-constraint-helpers.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {SQLQueryEngineSelectExecution} from
  '../../src/query/sql-query-engine-select-execution.js';
import {executeFromlessSelectInSession} from
  '../../src/query/sql-select-execution-helpers.js';
import {renderTableDefinitionSql} from '../../src/query/sql-table-definition.js';
import {encodeTypedRowSet} from '../../src/query/sql-value-codec.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) config.initialize();

const UNSUPPORTED = {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE};

function parse(sql) {
  return new SQLParser(sql).parse();
}

function plan(sql, partitionCount, params = []) {
  return buildSelectFanoutPlan(parse(sql), params, partitionCount);
}

describe('I1a (removed by WP3): COLLATE/ESCAPE in coordinator-evaluated positions now planned for SQLite merge', () => {
  test('HAVING with COLLATE, ESCAPE, or scalar functions over aggregates plans cleanly at every partition count', () => {
    for (const count of [1, 3]) {
      assert.ok(plan('SELECT x, COUNT(*) AS n FROM t GROUP BY x ' +
        'HAVING x = \'a\' COLLATE NOCASE', count));
      assert.ok(plan('SELECT x, COUNT(*) AS n FROM t GROUP BY x ' +
        'HAVING x LIKE \'a!%\' ESCAPE \'!\'', count));
      assert.ok(plan('SELECT x COLLATE NOCASE AS k, COUNT(*) AS n FROM t ' +
        'GROUP BY id HAVING k = \'a\'', count));
      assert.ok(plan('SELECT SUM(a) AS s FROM t ' +
        'HAVING concat(SUM(a), \'\') = \'3\'', count));
    }
  });

  test('ORDER BY with COLLATE plans SINGLE_PARTITION at 1 partition and FRAGMENT_MERGE at >= 2 partitions', () => {
    assert.equal(plan('SELECT id FROM t ORDER BY x COLLATE NOCASE', 1).kind,
      FANOUT_PLAN_KIND.SINGLE_PARTITION);
    assert.equal(plan('SELECT id FROM t ORDER BY id, x COLLATE NOCASE', 1).kind,
      FANOUT_PLAN_KIND.SINGLE_PARTITION);
    assert.equal(plan('SELECT id FROM t ORDER BY x COLLATE NOCASE, id', 1).kind,
      FANOUT_PLAN_KIND.SINGLE_PARTITION);
    assert.equal(plan('SELECT id FROM t ORDER BY x COLLATE NOCASE', 2).kind,
      FANOUT_PLAN_KIND.FRAGMENT_MERGE);
    assert.equal(plan('SELECT x, COUNT(*) AS n FROM t GROUP BY x ' +
      'ORDER BY x COLLATE NOCASE', 2).kind,
    FANOUT_PLAN_KIND.PARTIAL_AGGREGATE);
  });

  test('GROUP BY terms and aggregate arguments with explicit COLLATE route to COORDINATOR_EVALUATED', () => {
    for (const sql of [
      'SELECT COUNT(*) AS n FROM t GROUP BY x COLLATE NOCASE',
      'SELECT MIN(x COLLATE NOCASE) AS m FROM t',
      'SELECT COUNT(DISTINCT x COLLATE NOCASE) AS n FROM t',
    ]) {
      assert.equal(plan(sql, 2).kind, FANOUT_PLAN_KIND.COORDINATOR_EVALUATED, sql);
    }
  });

  test('a WHERE conjunct is pushed to the partitions and never refused', () => {
    assert.equal(plan('SELECT id FROM t WHERE x = \'a\' COLLATE NOCASE AND ' +
      'x LIKE \'a!%\' ESCAPE \'!\'', 5).kind, FANOUT_PLAN_KIND.FRAGMENT_MERGE);
  });
});

describe('LIMIT/OFFSET parameters (removed by WP3): coordinator and partition SQL-rendered overfetch limit', () => {
  test('a parameter LIMIT or OFFSET is planned at every partition count', () => {
    assert.equal(plan('SELECT id FROM t ORDER BY id LIMIT ?', 1, [2n]).kind,
      FANOUT_PLAN_KIND.SINGLE_PARTITION);
    const multiLimit = plan('SELECT id FROM t ORDER BY id LIMIT ? OFFSET ?', 2, [2n, 1n]);
    assert.equal(multiLimit.kind, FANOUT_PLAN_KIND.FRAGMENT_MERGE);
    assert.match(multiLimit.partitionSql, /LIMIT CASE WHEN/u);
    assert.deepEqual(multiLimit.partitionParams, [2n, 2n, 1n]);
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
  const mockEngine = {
    recordServicePartitionAccess() {},
    executeFromlessSelect(ast, params, _sessionId, queryOptions) {
      return executeFromlessSelectInSession(ast, params, queryOptions);
    },
  };
  const execute = (sql, params = []) =>
    SQLQueryEngineSelectExecution.prototype.executeSelectOwned.call(
      mockEngine,
      parse(sql),
      params,
      'session',
      {},
      null,
      null,
    );

  test('a FROM-less SELECT with clauses beyond its result columns executes in CoordinatorMergeSession', async () => {
    const rLimit0 = await execute('SELECT 1 AS c0 LIMIT 0');
    assert.equal(rLimit0.success, true);
    assert.deepEqual(rLimit0.rows, []);

    const rOrder = await execute('SELECT 2 AS c0 ORDER BY 1');
    assert.equal(rOrder.success, true);
    assert.deepEqual(rOrder.rows, [{c0: 2}]);

    const rWhere0 = await execute('SELECT 1 AS c0 WHERE 0');
    assert.equal(rWhere0.success, true);
    assert.deepEqual(rWhere0.rows, []);

    const rDistinct = await execute('SELECT DISTINCT 1 AS c0');
    assert.equal(rDistinct.success, true);
    assert.deepEqual(rDistinct.rows, [{c0: 1}]);

    const rUnion = await execute('SELECT 1 AS c0 UNION SELECT 2 AS c0 ORDER BY 1');
    assert.equal(rUnion.success, true);
    assert.deepEqual(rUnion.rows, [{c0: 1}, {c0: 2}]);

    const rSum = await execute('SELECT 1 + 1 AS c0');
    assert.equal(rSum.success, true);
    assert.deepEqual(rSum.rows, [{c0: 2}]);
  });

  test('changes(), last_insert_rowid() and total_changes() are refused on reads', async () => {
    for (const sql of ['SELECT changes() AS c0 FROM t WHERE id = 10',
      'SELECT last_insert_rowid() AS c0', 'SELECT id FROM t WHERE id > TOTAL_CHANGES()',
      'SELECT id FROM t WHERE id IN (SELECT changes() FROM u)']) {
      const result = await execute(sql);
      assert.equal(result.errorCode, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, sql);
    }
  });
});

const openDatabases = [];
after(() => openDatabases.forEach((db) => db.close()));

function deriveSchema(ddl) {
  const ast = parse(ddl);
  return {
    tableName: ast.tableName,
    ...TableCreationService.prototype.buildSchemaDefinition(ast.columns, ast),
  };
}

function createSqliteBackedExecutor(tableFixtures) {
  const dbByPartition = new Map();
  const tableRows = [];
  const partitionRows = [];
  for (const fixture of tableFixtures) {
    const schema = deriveSchema(fixture.ddl);
    tableRows.push({
      table_name: schema.tableName,
      schema_definition: JSON.stringify(schema),
    });
    fixture.partitions.forEach((rows, index) => {
      const partitionId = `${schema.tableName}-p${index + 1}`;
      const db = new Database(':memory:');
      db.defaultSafeIntegers(true);
      openDatabases.push(db);
      db.exec(renderTableDefinitionSql(schema.tableName, schema));
      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        db.prepare(`INSERT INTO "${schema.tableName}" (${cols.join(', ')}) VALUES (${placeholders})`)
          .run(...cols.map((col) => row[col]));
      }
      dbByPartition.set(partitionId, db);
      partitionRows.push({partition_id: partitionId, table_name: schema.tableName});
    });
  }
  const systemCache = {
    getAll(table) {
      return table === TABLES.TABLES ? tableRows : partitionRows;
    },
    find(table, predicate) {
      return (table === TABLES.TABLES ? tableRows : partitionRows).find(predicate) || null;
    },
    filter(table, predicate) {
      return (table === TABLES.TABLES ? tableRows : partitionRows).filter(predicate);
    },
    get() {
      return null;
    },
  };
  const executor = new QueryExecutor({systemCache});
  executor.executeOnPartitions = async (partitionIds, sql, params = []) =>
    partitionIds.map((partitionId) => {
      const db = dbByPartition.get(partitionId);
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);
      const rawStmt = db.prepare(sql).raw(true).safeIntegers(true);
      const cols = rawStmt.columns().map((c) => c.name);
      const rawRows = rawStmt.all(...params);
      return {
        partitionId,
        success: true,
        rowSetComplete: true,
        rows,
        rowSet: encodeTypedRowSet(cols, rawRows),
      };
    });
  return {executor, systemCache, tableRows};
}

describe('MF-3 composed SQLite + QueryExecutor + LiveQuery witnesses', () => {
  const usersDdl = 'CREATE TABLE users (id INTEGER PRIMARY KEY, ' +
    'name TEXT COLLATE NOCASE, score INTEGER)';
  const notesDdl = 'CREATE TABLE notes (k INTEGER PRIMARY KEY, author TEXT COLLATE NOCASE)';

  test('2-partition non-BINARY declared columns execute through CoordinatorMergeSession while LiveQuery refuses (I1d/I1e)',
    async () => {
      const {executor, systemCache} = createSqliteBackedExecutor([
        {
          ddl: usersDdl,
          partitions: [
            [{id: 1, name: 'a', score: 10}, {id: 2, name: 'c', score: 30}],
            [{id: 3, name: 'B', score: 20}, {id: 4, name: 'A', score: 40}],
          ],
        },
        {
          ddl: notesDdl,
          partitions: [[{k: 1, author: 'A'}], [{k: 2, author: 'b'}]],
        },
      ]);
      const userPartitions = ['users-p1', 'users-p2'];

      // Pushed WHERE executes on SQLite with NOCASE.
      const pushed = await executor.executeSelect(
        parse('SELECT id, name FROM users WHERE name = \'a\' ORDER BY id'),
        userPartitions,
        [],
      );
      assert.equal(pushed.success, true);
      assert.deepEqual(pushed.rows, [{id: 1, name: 'a'}, {id: 4, name: 'A'}]);

      // GROUP BY over NOCASE declared column folds 'a' and 'A' into one group.
      const grouped = await executor.executeSelect(
        parse('SELECT COUNT(*) AS n FROM users GROUP BY name ORDER BY n DESC'),
        userPartitions,
        [],
      );
      assert.equal(grouped.success, true);
      assert.deepEqual(grouped.rows, [{n: 2}, {n: 1}, {n: 1}]);

      // DISTINCT over NOCASE declared column folds 'a' and 'A'.
      const distinctRes = await executor.executeSelect(
        parse('SELECT COUNT(DISTINCT name) AS n FROM users'),
        userPartitions,
        [],
      );
      assert.equal(distinctRes.success, true);
      assert.deepEqual(distinctRes.rows, [{n: 3}]);

      // Cross-partition JOIN referencing a non-BINARY column executes with NOCASE in SQLite.
      const joinRes = await executor.executeCrossPartitionJoin(
        parse('SELECT users.id AS id FROM users JOIN notes ON users.name = notes.author ORDER BY users.id'),
        userPartitions,
        [],
        {joinPartitions: new Map([['notes', ['notes-p1', 'notes-p2']]])},
        null,
      );
      assert.equal(joinRes.success, true);
      assert.deepEqual(joinRes.rows, [{id: 1}, {id: 3}, {id: 4}]);

      // Live-query predicate and QueryGroup registration still refuse non-BINARY declared columns (I1d/I1e, bound WP7).
      const usersSchema = JSON.parse(systemCache.getAll(TABLES.TABLES)[0].schema_definition);
      assert.throws(
        () => compilePredicate(parse('SELECT * FROM users WHERE name = \'a\'').where, [],
          usersSchema),
        UNSUPPORTED,
      );
      assert.throws(
        () => new QueryGroup({
          parsedQuery: parse('SELECT id, name FROM users WHERE name = \'a\''),
          systemCache,
        }),
        UNSUPPORTED,
      );
      assert.throws(
        () => new QueryGroup({
          parsedQuery: parse('SELECT name AS k, COUNT(*) AS n FROM users GROUP BY id HAVING k = \'a\''),
          systemCache,
        }),
        UNSUPPORTED,
      );
    });

  test('compound SELECTs, CTEs, derived tables, and subqueries execute through CoordinatorMergeSession',
    async () => {
      const {executor} = createSqliteBackedExecutor([
        {ddl: usersDdl, partitions: [[{id: 1, name: 'a', score: 10}], [{id: 2, name: 'A', score: 20}]]},
        {ddl: notesDdl, partitions: [[{k: 1, author: 'A'}]]},
      ]);
      const userPartitions = ['users-p1', 'users-p2'];
      for (const [sql, params, expectedRows] of [
        ['SELECT id FROM users UNION ALL SELECT id FROM users ORDER BY id LIMIT ?', [2], [{id: 1}, {id: 1}]],
        ['SELECT COUNT(*) AS n FROM (SELECT name FROM users UNION SELECT name FROM users) AS u', [], [{n: 1}]],
        ['WITH c AS (SELECT id FROM users ORDER BY id LIMIT ?) SELECT id FROM c', [1], [{id: 1}]],
        ['SELECT id FROM users WHERE id IN (SELECT k FROM notes WHERE author = \'a\' COLLATE NOCASE)', [], [{id: 1}]],
      ]) {
        const res = await executor.executeSelect(parse(sql), userPartitions, params, {
          distributedPlan: {
            tablePlans: new Map([['notes', {partitions: ['notes-p1']}]]),
          },
        });
        assert.equal(res.success, true, sql);
        assert.deepEqual(res.rows, expectedRows, sql);
      }
    });

  test('MF-3R2/R3: batch UNIQUE write-key refusal (I1c, bound WP4) and LiveQueryService refusal (I1d, bound WP7)',
    async () => {
      const accountsDdl = 'CREATE TABLE accounts (id INTEGER PRIMARY KEY, ' +
        'email TEXT COLLATE NOCASE UNIQUE, score INTEGER)';
      const {systemCache} = createSqliteBackedExecutor([{
        ddl: accountsDdl,
        partitions: [
          [{id: 1, email: 'a@x.com', score: 10}],
          [{id: 2, email: 'B@x.com', score: 20}],
        ],
      }]);

      // MF-3R2: Multi-row INSERT on UNIQUE non-BINARY column fails closed (I1c, bound WP4).
      const writeCoordinator = new DistributedWriteCoordinator({
        getTableInfo: (name) => systemCache.find(TABLES.TABLES, (t) => t.table_name === name),
        getTablePartitions: () => [
          {partition_id: 'accounts-p1'},
          {partition_id: 'accounts-p2'},
        ],
        queryExecutor: {executeOnPartitions: async () => []},
      });
      for (const sql of [
        'INSERT INTO accounts (id, email, score) VALUES (10, \'alice@x.com\', 1), ' +
          '(200, \'ALICE@X.COM\', 2)',
        'INSERT INTO accounts VALUES (10, \'alice@x.com\', 1), (200, \'ALICE@X.COM\', 2)',
      ]) {
        await assert.rejects(
          () => enforceCoordinatorUniqueConstraints(writeCoordinator, parse(sql), []),
          {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, message: /I1c/u},
        );
      }

      // MF-3R3 (a): LiveQueryService constructor refuses non-BINARY column predicates via cache (I1d, bound WP7).
      assert.throws(
        () => new LiveQueryService({
          parsedQuery: parse('SELECT id, email FROM accounts WHERE email = \'a@x.com\''),
          systemCache,
        }),
        UNSUPPORTED,
      );
    });
});
