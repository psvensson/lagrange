/**
 * The interim typed refusals of WP2 (design coordinator-sqlite-merge §5.1),
 * each tagged with the work package that removes it. Until then the
 * coordinator's JavaScript evaluators cannot evaluate an explicit COLLATE
 * (or an ESCAPE) or apply a parameter LIMIT as SQLite does, so the statement
 * is refused, typed, where they would evaluate it, and runs where SQLite
 * evaluates it.
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
import {renderTableDefinitionSql} from '../../src/query/sql-table-definition.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';

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
      assert.throws(() => plan('SELECT x COLLATE NOCASE AS k, COUNT(*) AS n FROM t ' +
        'GROUP BY id HAVING k = \'a\'', count), UNSUPPORTED);
      assert.throws(() => plan('SELECT SUM(a) AS s FROM t ' +
        'HAVING concat(SUM(a), \'\') = \'3\'', count), UNSUPPORTED);
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
      'SELECT x COLLATE NOCASE AS k FROM t']) {
      assert.throws(() => plan(sql, 2), UNSUPPORTED, sql);
      assert.ok(plan(sql, 1), `${sql}: one partition's SQLite evaluates it`);
    }
    for (const count of [1, 2]) {
      assert.throws(() => plan('SELECT COUNT(DISTINCT x COLLATE NOCASE) AS n FROM t', count),
        UNSUPPORTED);
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

  test('COLLATE in ON, COLLATE or ESCAPE elsewhere, parameter LIMIT, and unsupported HAVING are refused', async () => {
    for (const sql of ['SELECT t.id FROM t JOIN u ON t.x = u.tk COLLATE NOCASE',
      'SELECT t.id FROM t JOIN u ON t.id = u.k WHERE t.x LIKE \'a!%\' ESCAPE \'!\'',
      'SELECT t.id FROM t JOIN u ON t.id = u.k ORDER BY t.x COLLATE NOCASE',
      'SELECT t.id FROM t JOIN u ON t.id = u.k LIMIT ?',
      'SELECT SUM(t.a) AS s FROM t JOIN u ON t.id = u.id HAVING concat(SUM(t.a), \'\') = \'3\'']) {
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
    get() {
      return null;
    },
  };
  const executor = new QueryExecutor({systemCache});
  executor.executeOnPartitions = async (partitionIds, sql, params = []) =>
    partitionIds.map((partitionId) => ({
      partitionId,
      success: true,
      rowSetComplete: true,
      rows: dbByPartition.get(partitionId).prepare(sql).all(...params),
    }));
  return {executor, systemCache, tableRows};
}

describe('MF-3 composed SQLite + QueryExecutor + LiveQuery witnesses', () => {
  const usersDdl = 'CREATE TABLE users (id INTEGER PRIMARY KEY, ' +
    'name TEXT COLLATE NOCASE, score INTEGER)';
  const notesDdl = 'CREATE TABLE notes (k INTEGER PRIMARY KEY, author TEXT COLLATE NOCASE)';

  test('2-partition non-BINARY declared columns refuse coordinator JS merge but run pushed WHERE',
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

      // Pushed WHERE with no coordinator-side comparison executes on SQLite with NOCASE.
      const pushed = await executor.executeSelect(
        parse('SELECT id, name FROM users WHERE name = \'a\' ORDER BY id'),
        userPartitions,
        [],
      );
      assert.equal(pushed.success, true);
      assert.deepEqual(pushed.rows, [{id: 1, name: 'a'}, {id: 4, name: 'A'}]);

      // Every coordinator-evaluated clause over `name` (NOCASE) fails closed.
      for (const sql of [
        'SELECT name, COUNT(*) AS n FROM users GROUP BY name',
        'SELECT name AS k, COUNT(*) AS n FROM users GROUP BY k',
        'SELECT name AS k, COUNT(*) AS n FROM users GROUP BY 1',
        'SELECT DISTINCT name FROM users',
        'SELECT DISTINCT * FROM users',
        'SELECT id, name FROM users ORDER BY name',
        'SELECT name AS k FROM users ORDER BY k',
        'SELECT name AS k FROM users ORDER BY LOWER(k)',
        'SELECT id, name FROM users ORDER BY 2',
        'SELECT id, COUNT(*) AS n FROM users GROUP BY id HAVING MAX(score) > 0 AND name = \'a\'',
        'SELECT name AS k, COUNT(*) AS n FROM users GROUP BY id HAVING k = \'a\'',
        'SELECT MIN(name) AS m FROM users',
        'SELECT MAX(name) AS m FROM users',
        'SELECT COUNT(DISTINCT name) AS n FROM users',
        'SELECT SUM(score) AS s FROM users HAVING concat(SUM(score), \'\') = \'100\'',
      ]) {
        await assert.rejects(
          () => executor.executeSelect(parse(sql), userPartitions, []),
          UNSUPPORTED,
          sql,
        );
      }
      for (const sql of [
        'SELECT name AS k, COUNT(*) AS n FROM users GROUP BY id HAVING k = \'a\'',
        'SELECT SUM(score) AS s FROM users HAVING concat(SUM(score), \'\') = \'40\'',
      ]) {
        await assert.rejects(
          () => executor.executeSelect(parse(sql), ['users-p1'], []),
          UNSUPPORTED,
          sql,
        );
      }

      // Cross-partition JOIN referencing a non-BINARY column is refused.
      const joinRes = await executor.executeCrossPartitionJoin(
        parse('SELECT users.id FROM users JOIN notes ON users.name = notes.author'),
        userPartitions,
        [],
        {joinPartitions: new Map([['notes', ['notes-p1', 'notes-p2']]])},
        null,
      );
      assert.equal(joinRes.success, false);
      assert.equal(joinRes.errorCode, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);

      // Live-query predicate and QueryGroup registration refuse non-BINARY declared columns.
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

  test('compound SELECTs, CTEs, derived tables, and subqueries cannot bypass interim refusals',
    async () => {
      const {executor} = createSqliteBackedExecutor([
        {ddl: usersDdl, partitions: [[{id: 1, name: 'a', score: 10}]]},
        {ddl: notesDdl, partitions: [[{k: 1, author: 'A'}]]},
      ]);
      for (const [sql, params] of [
        ['SELECT id FROM users UNION ALL SELECT id FROM users LIMIT ?', [1]],
        ['SELECT name FROM users UNION SELECT name FROM users', []],
        ['SELECT name COLLATE NOCASE FROM users UNION ALL SELECT name FROM users', []],
        ['WITH c AS (SELECT id FROM users LIMIT ?) SELECT id FROM c', [1]],
        ['WITH c AS (SELECT id FROM users ORDER BY name COLLATE NOCASE) SELECT id FROM c', []],
        ['SELECT sub.id FROM (SELECT id FROM users LIMIT ?) AS sub', [1]],
        ['SELECT sub.id FROM (SELECT id FROM users ORDER BY name) AS sub', []],
        ['SELECT id FROM users WHERE id IN (SELECT k FROM notes LIMIT ?)', [1]],
        ['SELECT id FROM users WHERE id IN (SELECT k FROM notes WHERE author = \'a\' COLLATE NOCASE)',
          []],
      ]) {
        await assert.rejects(
          () => executor.executeSelect(parse(sql), ['users-p1'], params),
          UNSUPPORTED,
          sql,
        );
      }
    });

  test('1-partition ORIGINAL_RAW_ROWS refuses JS re-aggregation and ORDER BY skips undefined key',
    async () => {
      const {executor} = createSqliteBackedExecutor([{
        ddl: 'CREATE TABLE items (id INTEGER PRIMARY KEY, x TEXT, r INTEGER)',
        partitions: [[
          {id: 1, x: 'b', r: 99},
          {id: 2, x: 'A', r: 10},
          {id: 3, x: 'c', r: 50},
        ]],
      }]);

      // `typeof(COUNT(*))` forces ORIGINAL_RAW_ROWS; 1-partition JS re-aggregation is refused.
      await assert.rejects(
        () => executor.executeSelect(
          parse('SELECT MIN(x COLLATE NOCASE) AS m, typeof(COUNT(*)) AS tp FROM items'),
          ['items-p1'],
          [],
        ),
        UNSUPPORTED,
      );

      // 1-partition `ORDER BY x COLLATE NOCASE` with an `"undefined"` column alias preserves
      // SQLite's exact NOCASE order ('A', 'b', 'c') instead of sorting by row["undefined"].
      const sorted = await executor.executeSelect(
        parse('SELECT id, r AS "undefined" FROM items ORDER BY x COLLATE NOCASE'),
        ['items-p1'],
        [],
      );
      assert.equal(sorted.success, true);
      assert.deepEqual(sorted.rows.map((row) => row.id), [2, 1, 3]);
    });

  test('MF-3R1/R2/R3: combined aggregate expressions, DISTINCT agg, batch UNIQUE, setSystemCache',
    async () => {
      const accountsDdl = 'CREATE TABLE accounts (id INTEGER PRIMARY KEY, ' +
        'email TEXT COLLATE NOCASE UNIQUE, score INTEGER)';
      const {executor, systemCache} = createSqliteBackedExecutor([{
        ddl: accountsDdl,
        partitions: [
          [{id: 1, email: 'a@x.com', score: 10}],
          [{id: 2, email: 'B@x.com', score: 20}],
        ],
      }, {
        ddl: 'CREATE TABLE items2 (id INTEGER PRIMARY KEY, x TEXT)',
        partitions: [[{id: 1, x: 'a'}, {id: 2, x: 'A'}]],
      }]);

      // MF-3R1 (1): PARTIAL_AGGREGATE combined aggregate-scalar expression at 1 & 2 partitions.
      for (const partitions of [['accounts-p1'], ['accounts-p1', 'accounts-p2']]) {
        await assert.rejects(
          () => executor.executeSelect(
            parse('SELECT CASE WHEN COUNT(*) > 0 THEN email = \'A@X.COM\' ELSE 0 END AS v ' +
              'FROM accounts'),
            partitions,
            [],
          ),
          UNSUPPORTED,
        );
      }

      // MF-3R1 (2): 1-partition PARTIAL_AGGREGATE with multiple DISTINCT aggregates.
      await assert.rejects(
        () => executor.executeSelect(
          parse('SELECT COUNT(DISTINCT id), COUNT(DISTINCT x COLLATE NOCASE) FROM items2'),
          ['items2-p1'],
          [],
        ),
        UNSUPPORTED,
      );
      await assert.rejects(
        () => executor.executeSelect(
          parse('SELECT COUNT(DISTINCT id), COUNT(DISTINCT email) FROM accounts'),
          ['accounts-p1'],
          [],
        ),
        UNSUPPORTED,
      );

      // MF-3R1 (3): 1-partition ORIGINAL_RAW_ROWS re-projecting scalar COLLATE/non-BINARY column.
      await assert.rejects(
        () => executor.executeSelect(
          parse('SELECT CASE WHEN COUNT(*) > 0 THEN x = \'A\' COLLATE NOCASE ELSE 0 END AS v, ' +
            'typeof(COUNT(*)) AS tp FROM items2 GROUP BY id'),
          ['items2-p1'],
          [],
        ),
        UNSUPPORTED,
      );

      // MF-3R2: Multi-row INSERT on UNIQUE non-BINARY column fails closed (with & without cols).
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

      // MF-3R3 (a): LiveQueryService constructor refuses non-BINARY column predicates via cache.
      assert.throws(
        () => new LiveQueryService({
          parsedQuery: parse('SELECT id, email FROM accounts WHERE email = \'a@x.com\''),
          systemCache,
        }),
        UNSUPPORTED,
      );

      // MF-3R3 (b): Standalone QueryExecutor wired via setSystemCache enforces non-BINARY refusal.
      const lateWiredExecutor = new QueryExecutor();
      lateWiredExecutor.setSystemCache(systemCache);
      await assert.rejects(
        () => lateWiredExecutor.executeSelect(
          parse('SELECT DISTINCT email FROM accounts'),
          ['accounts-p1', 'accounts-p2'],
          [],
        ),
        UNSUPPORTED,
      );

      // JOIN queries also refuse unsupported coordinator-evaluated HAVING expressions.
      const joinHavingRes = await executor.executeSelect(
        parse(
          'SELECT SUM(accounts.id) AS s FROM accounts JOIN accounts AS a2 ' +
          'ON accounts.id = a2.id HAVING concat(SUM(accounts.id), \'\') = \'3\'',
        ),
        ['accounts-p1', 'accounts-p2'],
        [],
        {
          distributedPlan: {
            tablePlans: {a2: {partitions: ['accounts-p1', 'accounts-p2']}},
          },
        },
      );
      assert.equal(joinHavingRes.success, false);
      assert.equal(joinHavingRes.errorCode, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
    });
});
