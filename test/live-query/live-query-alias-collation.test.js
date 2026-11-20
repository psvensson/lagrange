/**
 * Discriminating witnesses for relation occurrence bindings, alias-scoped
 * column collations, ambiguous unqualified column refusal, and Tier 1 vs Tier 2
 * QueryGroup SQLite predicate lifecycle (WP3 & WP7).
 */

import Database from 'better-sqlite3';

import {
  LIVE_QUERY_EVENT,
  LIVE_QUERY_OPERATION,
} from '../../src/live-query/live-query-constants.js';
import {QueryGroup} from '../../src/live-query/live-query-group.js';
import {
  LiveQueryService,
  buildProbeTableDefinitions,
  compilePredicate,
  extractTableBindings,
  normalizeWhereAstForRenderer,
} from '../../src/live-query/live-query-service.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {renderTableDefinitionSql} from '../../src/query/sql-table-definition.js';
import {test} from '../../src/test-helpers/tap.js';

const TABLES_TABLE = 'tables';
const PARTITIONS_TABLE = 'partitions';
const USERS_TABLE = 'users';
const ORDERS_TABLE = 'orders';

const USERS_SCHEMA = Object.freeze({
  tableName: USERS_TABLE,
  columns: [
    {name: 'id', type: 'INTEGER', collation: 'BINARY', primaryKey: true, notNull: false},
    {name: 'name', type: 'TEXT', collation: 'NOCASE', primaryKey: false, notNull: true},
    {name: 'tag', type: 'TEXT', collation: 'RTRIM', primaryKey: false, notNull: true},
    {name: 'code', type: 'TEXT', collation: 'BINARY', primaryKey: false, notNull: true},
    {name: 'score', type: 'INTEGER', collation: 'BINARY', primaryKey: false, notNull: true},
  ],
  primaryKey: ['id'],
  tableConstraints: [],
});

const ORDERS_SCHEMA = Object.freeze({
  tableName: ORDERS_TABLE,
  columns: [
    {name: 'id', type: 'INTEGER', collation: 'BINARY', primaryKey: true, notNull: false},
    {name: 'user_id', type: 'INTEGER', collation: 'BINARY', primaryKey: false, notNull: true},
    {name: 'code', type: 'TEXT', collation: 'NOCASE', primaryKey: false, notNull: true},
    {name: 'amount', type: 'INTEGER', collation: 'BINARY', primaryKey: false, notNull: true},
  ],
  primaryKey: ['id'],
  tableConstraints: [],
});

function createBackingStore() {
  const db = new Database(':memory:');
  db.exec(renderTableDefinitionSql(USERS_TABLE, USERS_SCHEMA));
  db.exec(renderTableDefinitionSql(ORDERS_TABLE, ORDERS_SCHEMA));

  db.prepare(
    'INSERT INTO users (id, name, tag, code, score) VALUES (?, ?, ?, ?, ?)',
  ).run(1, 'Alice', 'padded   ', 'AbC', 10);
  db.prepare(
    'INSERT INTO users (id, name, tag, code, score) VALUES (?, ?, ?, ?, ?)',
  ).run(2, 'bob', 'other', 'xyz', 20);

  db.prepare(
    'INSERT INTO orders (id, user_id, code, amount) VALUES (?, ?, ?, ?)',
  ).run(100, 1, 'ORD-ALPHA', 50);
  db.prepare(
    'INSERT INTO orders (id, user_id, code, amount) VALUES (?, ?, ?, ?)',
  ).run(101, 2, 'ORD-BETA', 75);

  const tableRecords = new Map([
    [
      USERS_TABLE,
      {
        table_name: USERS_TABLE,
        tableName: USERS_TABLE,
        schema: USERS_SCHEMA,
        schema_definition: JSON.stringify(USERS_SCHEMA),
        active_partition_version: 1,
      },
    ],
    [
      ORDERS_TABLE,
      {
        table_name: ORDERS_TABLE,
        tableName: ORDERS_TABLE,
        schema: ORDERS_SCHEMA,
        schema_definition: JSON.stringify(ORDERS_SCHEMA),
        active_partition_version: 1,
      },
    ],
  ]);

  const partitionRecords = [
    {
      partition_id: 'users-p0',
      partitionId: 'users-p0',
      table_name: USERS_TABLE,
      tableName: USERS_TABLE,
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      partition_version: 1,
      state: 'NORMAL',
    },
    {
      partition_id: 'orders-p0',
      partitionId: 'orders-p0',
      table_name: ORDERS_TABLE,
      tableName: ORDERS_TABLE,
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      partition_version: 1,
      state: 'NORMAL',
    },
  ];

  const systemCache = {
    get: (table, key) => (table === TABLES_TABLE ? (tableRecords.get(key) || null) : null),
    find: (table, predicate) => {
      if (table !== TABLES_TABLE) return null;
      for (const rec of tableRecords.values()) {
        if (predicate(rec)) return rec;
      }
      return null;
    },
    filter: (table, predicate) =>
      (table === PARTITIONS_TABLE ? partitionRecords.filter(predicate) : []),
  };

  const sqlQueryEngine = {
    executeQuery: async (sql, params = []) => ({
      rows: db.prepare(sql).all(...params),
      appliedIndex: 1,
    }),
  };

  return {db, systemCache, sqlQueryEngine};
}

test('1. unaliased single-table query preserves NOCASE and RTRIM column collations', async (t) => {
  const {db, systemCache} = createBackingStore();
  t.teardown(() => db.close());

  const sql = 'SELECT name, tag FROM users WHERE name = \'alice\' AND tag = \'padded\'';
  const ast = new SQLParser(sql).parse();

  t.same(
    extractTableBindings(ast),
    [
      {
        occurrenceId: 'root:0:users:users',
        queryScope: 'root',
        tableName: 'users',
        alias: null,
        effectiveName: 'users',
      },
    ],
    'unaliased single-table query emits canonical root occurrence binding',
  );

  const service = new LiveQueryService({parsedQuery: ast, systemCache});
  t.teardown(() => service.cleanup());

  t.equal(
    service.evaluatePredicate({id: 1, name: 'ALICE', tag: 'padded    ', code: 'AbC', score: 10}),
    true,
    'NOCASE matches uppercase ALICE and RTRIM ignores trailing spaces on tag',
  );
  t.equal(
    service.evaluatePredicate({id: 1, name: 'ALICE', tag: ' padded', code: 'AbC', score: 10}),
    false,
    'RTRIM does not ignore leading space',
  );
  t.equal(
    service.evaluatePredicate({id: 2, name: 'bob', tag: 'padded', code: 'AbC', score: 10}),
    false,
    'non-matching name is rejected',
  );
});

test('2. single-table query with one alias preserves NOCASE collation on probe table "u"', async (t) => {
  const {db, systemCache, sqlQueryEngine} = createBackingStore();
  t.teardown(() => db.close());

  const sql = 'SELECT u.name FROM users u WHERE u.name = \'alice\'';
  const ast = new SQLParser(sql).parse();

  t.same(
    extractTableBindings(ast),
    [
      {
        occurrenceId: 'root:0:users:u',
        queryScope: 'root',
        tableName: 'users',
        alias: 'u',
        effectiveName: 'u',
      },
    ],
    'single-table query with alias u records occurrenceId root:0:users:u',
  );

  const probeDefs = buildProbeTableDefinitions(
    normalizeWhereAstForRenderer(ast.where),
    [USERS_SCHEMA],
    {parsedQuery: ast},
  );
  t.equal(probeDefs.length, 1, 'materializes one probe table');
  t.equal(probeDefs[0].tableName, 'u', 'probe table is named after alias u');
  t.equal(probeDefs[0].sourceTableName, 'users', 'probe table records sourceTableName users');
  t.equal(
    probeDefs[0].columns.find((c) => c.name === 'name')?.collation,
    'NOCASE',
    'probe table u preserves NOCASE collation on column name',
  );

  const group = new QueryGroup({
    parsedQuery: ast,
    rawSql: sql,
    systemCache,
    sqlQueryEngine,
  });
  t.teardown(() => group.cleanup());

  t.equal(group.isComplex, false, 'single-table aliased query uses Tier 1 incremental evaluation');
  const snapshot = await group.initialize({
    subscribeToPartition: async () => ({streamVersion: 1}),
  });
  t.same(snapshot, [{name: 'Alice'}], 'initial snapshot matches mixed-case Alice');

  const updateEvent = await group.handleCDCEvent(
    {
      operation: LIVE_QUERY_OPERATION.UPDATE,
      old_data: {id: 1, name: 'Alice', tag: 'padded   ', code: 'AbC', score: 10},
      data: {id: 1, name: 'ALICE', tag: 'padded   ', code: 'AbC', score: 25},
      hlc_timestamp: '1000:1',
      logIndex: 2,
    },
    'users-p0',
  );
  t.ok(updateEvent, 'CDC UPDATE emits incremental event');
  t.equal(updateEvent.type, LIVE_QUERY_EVENT.UPDATE, 'row remains matched under NOCASE on u.name');
  t.same(updateEvent.new, {name: 'ALICE'}, 'projected row reflects updated name');
});

test('3. self-join with two aliases of one source table preserves NOCASE on both "a" and "b" and distinct occurrence metadata', async (t) => {
  const {db, systemCache} = createBackingStore();
  t.teardown(() => db.close());

  const sql =
    'SELECT a.name, b.name FROM users a JOIN users b ON a.id = b.id WHERE a.name = \'alice\' AND b.name = \'BOB\'';
  const ast = new SQLParser(sql).parse();

  const bindings = extractTableBindings(ast);
  t.same(
    bindings,
    [
      {
        occurrenceId: 'root:0:users:a',
        queryScope: 'root',
        tableName: 'users',
        alias: 'a',
        effectiveName: 'a',
      },
      {
        occurrenceId: 'root:1:users:b',
        queryScope: 'root',
        tableName: 'users',
        alias: 'b',
        effectiveName: 'b',
      },
    ],
    'self-join bindings have distinct occurrenceIds root:0:users:a and root:1:users:b in root scope',
  );

  const probeDefs = buildProbeTableDefinitions(
    normalizeWhereAstForRenderer(ast.where),
    [USERS_SCHEMA],
    {parsedQuery: ast},
  );
  t.equal(probeDefs.length, 2, 'materializes two distinct probe tables a and b');
  t.same(
    probeDefs.map((d) => ({
      occurrenceId: d.occurrenceId,
      tableName: d.tableName,
      sourceTableName: d.sourceTableName,
      nameCollation: d.columns.find((c) => c.name === 'name')?.collation,
    })),
    [
      {
        occurrenceId: 'root:0:users:a',
        tableName: 'a',
        sourceTableName: 'users',
        nameCollation: 'NOCASE',
      },
      {
        occurrenceId: 'root:1:users:b',
        tableName: 'b',
        sourceTableName: 'users',
        nameCollation: 'NOCASE',
      },
    ],
    'both probe tables a and b share catalog schema and NOCASE collation of users',
  );

  const service = new LiveQueryService({parsedQuery: ast, systemCache});
  t.teardown(() => service.cleanup());

  t.equal(
    service.evaluatePredicate({
      a: {id: 1, name: 'ALICE'},
      b: {id: 1, name: 'bob'},
    }),
    true,
    'matches when a.name is ALICE (NOCASE -> alice) and b.name is bob (NOCASE -> BOB)',
  );
  t.equal(
    service.evaluatePredicate({
      a: {id: 1, name: 'ALICE'},
      b: {id: 1, name: 'ALICE'},
    }),
    false,
    'rejects when b.name does not match BOB',
  );
  t.equal(
    service.evaluatePredicate({
      a: {id: 1, name: 'bob'},
      b: {id: 1, name: 'bob'},
    }),
    false,
    'rejects when a.name does not match alice',
  );

  // Verify nested scopes (CTE, FROM subquery, WHERE subquery) receive nested:<index> queryScope
  const nestedSql =
    'WITH cte_orders AS (SELECT o1.user_id FROM orders o1) ' +
    'SELECT u_root.name FROM users u_root ' +
    'JOIN (SELECT u_sub.id FROM users u_sub) sq ON u_root.id = sq.id ' +
    'WHERE u_root.id IN (SELECT o2.user_id FROM orders o2)';
  const nestedAst = new SQLParser(nestedSql).parse();
  t.same(
    extractTableBindings(nestedAst),
    [
      {
        occurrenceId: 'root:0:users:u_root',
        queryScope: 'root',
        tableName: 'users',
        alias: 'u_root',
        effectiveName: 'u_root',
      },
      {
        occurrenceId: 'nested:0:0:orders:o1',
        queryScope: 'nested:0',
        tableName: 'orders',
        alias: 'o1',
        effectiveName: 'o1',
      },
      {
        occurrenceId: 'nested:1:0:users:u_sub',
        queryScope: 'nested:1',
        tableName: 'users',
        alias: 'u_sub',
        effectiveName: 'u_sub',
      },
      {
        occurrenceId: 'nested:2:0:orders:o2',
        queryScope: 'nested:2',
        tableName: 'orders',
        alias: 'o2',
        effectiveName: 'o2',
      },
    ],
    'extractTableBindings distinguishes root scope from nested CTE, FROM subquery, and WHERE subquery scopes',
  );
});

test('4. two different tables with overlapping column names (code) retain distinct collations (BINARY vs NOCASE)', async (t) => {
  const {db, systemCache} = createBackingStore();
  t.teardown(() => db.close());

  const sql =
    'SELECT u.code, o.code FROM users u JOIN orders o ON u.id = o.user_id ' +
    'WHERE u.code = \'AbC\' AND o.code = \'ord-alpha\'';
  const ast = new SQLParser(sql).parse();

  t.same(
    extractTableBindings(ast),
    [
      {
        occurrenceId: 'root:0:users:u',
        queryScope: 'root',
        tableName: 'users',
        alias: 'u',
        effectiveName: 'u',
      },
      {
        occurrenceId: 'root:1:orders:o',
        queryScope: 'root',
        tableName: 'orders',
        alias: 'o',
        effectiveName: 'o',
      },
    ],
    'extractTableBindings records users as u and orders as o',
  );

  const probeDefs = buildProbeTableDefinitions(
    normalizeWhereAstForRenderer(ast.where),
    [USERS_SCHEMA, ORDERS_SCHEMA],
    {parsedQuery: ast},
  );
  t.same(
    probeDefs.map((d) => ({
      tableName: d.tableName,
      sourceTableName: d.sourceTableName,
      codeCollation: d.columns.find((c) => c.name === 'code')?.collation,
    })),
    [
      {tableName: 'u', sourceTableName: 'users', codeCollation: 'BINARY'},
      {tableName: 'o', sourceTableName: 'orders', codeCollation: 'NOCASE'},
    ],
    'probe table u keeps BINARY on code while probe table o keeps NOCASE on code',
  );

  const service = new LiveQueryService({parsedQuery: ast, systemCache});
  t.teardown(() => service.cleanup());

  t.equal(
    service.evaluatePredicate({
      u: {id: 1, code: 'AbC'},
      o: {id: 100, user_id: 1, code: 'ORD-ALPHA'},
    }),
    true,
    'matches exact-case u.code under BINARY and uppercase o.code under NOCASE',
  );
  t.equal(
    service.evaluatePredicate({
      u: {id: 1, code: 'abc'},
      o: {id: 100, user_id: 1, code: 'ORD-ALPHA'},
    }),
    false,
    'rejects lowercase u.code because users.code has BINARY collation',
  );
  t.equal(
    service.evaluatePredicate({
      u: {id: 1, code: 'AbC'},
      o: {id: 100, user_id: 1, code: 'ORD-BETA'},
    }),
    false,
    'rejects non-matching o.code',
  );
});

test('5. ambiguous unqualified column reference in multi-binding scope is refused fail-closed with UNSUPPORTED_SQL_FEATURE', async (t) => {
  const {db, systemCache, sqlQueryEngine} = createBackingStore();
  t.teardown(() => db.close());

  const ambiguousSql =
    'SELECT u.id, o.id FROM users u JOIN orders o ON u.id = o.user_id WHERE code = \'abc\'';
  const ambiguousAst = new SQLParser(ambiguousSql).parse();

  const probeDefs = buildProbeTableDefinitions(
    normalizeWhereAstForRenderer(ambiguousAst.where),
    [USERS_SCHEMA, ORDERS_SCHEMA],
    {parsedQuery: ambiguousAst},
  );
  t.equal(
    probeDefs.every((def) => def.columns.some((col) => col.name === 'code')),
    true,
    'both probe tables u and o retain their declared code column definitions',
  );

  for (const [label, fn] of [
    [
      'compilePredicate',
      () => compilePredicate(
        ambiguousAst.where,
        [],
        [USERS_SCHEMA, ORDERS_SCHEMA],
        {parsedQuery: ambiguousAst},
      ),
    ],
    [
      'LiveQueryService',
      () => new LiveQueryService({parsedQuery: ambiguousAst, systemCache}),
    ],
    [
      'QueryGroup',
      () => new QueryGroup({
        parsedQuery: ambiguousAst,
        rawSql: ambiguousSql,
        systemCache,
        sqlQueryEngine,
      }),
    ],
  ]) {
    let caught = null;
    try {
      fn();
    } catch (error) {
      caught = error;
    }
    t.ok(caught, `${label} throws on ambiguous unqualified column reference`);
    t.equal(
      caught?.code,
      QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      `${label} maps ambiguous column error to QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE`,
    );
    t.match(
      caught?.message,
      /ambiguous column name: code/i,
      `${label} surfaces SQLite ambiguous column name diagnostics`,
    );
  }

  // Unambiguous unqualified column (user_id exists only on orders, not on users) succeeds:
  const unambiguousSql =
    'SELECT u.id, o.id FROM users u JOIN orders o ON u.id = o.user_id WHERE user_id = 1';
  const unambiguousAst = new SQLParser(unambiguousSql).parse();
  const unambiguousPred = compilePredicate(
    unambiguousAst.where,
    [],
    [USERS_SCHEMA, ORDERS_SCHEMA],
    {parsedQuery: unambiguousAst},
  );
  t.teardown(() => unambiguousPred.close());
  t.equal(
    unambiguousPred({u: {id: 1}, o: {id: 100, user_id: 1}}),
    true,
    'unambiguous unqualified column declared on only one joined table compiles and matches',
  );
});

test('6. QueryGroup Tier 1 vs Tier 2 lifecycle closes Tier 1 SQLite handle on cleanup and keeps no open Tier 1 SQLite database on Tier 2 while refreshing on INSERT/UPDATE/DELETE', async (t) => {
  const {db, systemCache, sqlQueryEngine} = createBackingStore();
  t.teardown(() => db.close());

  // Tier 1 simple QueryGroup lifecycle:
  const tier1Sql = 'SELECT u.id, u.name, u.score FROM users u WHERE u.name = \'alice\'';
  const tier1Group = new QueryGroup({
    parsedQuery: new SQLParser(tier1Sql).parse(),
    rawSql: tier1Sql,
    systemCache,
    sqlQueryEngine,
  });

  t.equal(tier1Group.isComplex, false, 'single-table filter query is Tier 1');
  t.equal(tier1Group.predicate.isOpen, true, 'Tier 1 predicate owns an open SQLite handle while active');
  t.equal(tier1Group.predicate.closed, false, 'Tier 1 predicate is not closed before cleanup');
  t.equal(
    tier1Group.predicate({id: 1, name: 'ALICE', score: 10}),
    true,
    'Tier 1 predicate evaluates rows while open',
  );

  tier1Group.cleanup();
  t.equal(tier1Group.predicate.isOpen, false, 'QueryGroup.cleanup() closes Tier 1 SQLite handle');
  t.equal(tier1Group.predicate.closed, true, 'Tier 1 predicate reports closed after cleanup');
  t.equal(
    tier1Group.predicate({id: 1, name: 'ALICE', score: 10}),
    false,
    'closed Tier 1 predicate no longer evaluates rows',
  );

  // Tier 2 complex QueryGroup with JOIN and ORDER BY:
  const tier2Sql =
    'SELECT u.id, u.name, o.code, o.amount ' +
    'FROM users u JOIN orders o ON u.id = o.user_id ' +
    'WHERE u.name = \'alice\' ORDER BY o.id ASC';
  const tier2Group = new QueryGroup({
    parsedQuery: new SQLParser(tier2Sql).parse(),
    rawSql: tier2Sql,
    systemCache,
    sqlQueryEngine,
  });
  t.teardown(() => tier2Group.cleanup());

  t.equal(tier2Group.isComplex, true, 'JOIN + ORDER BY query is classified as Tier 2 complex');
  t.equal(
    tier2Group.predicate.isOpen,
    false,
    'Tier 2 QueryGroup does not leave an unused Tier 1 SQLite database open',
  );
  t.equal(
    tier2Group.predicate.closed,
    true,
    'Tier 2 QueryGroup predicate handle is closed immediately after WHERE validation',
  );

  const resets = [];
  tier2Group.addClient({
    id: 'client-tier2',
    send: (msg) => resets.push(JSON.parse(msg)),
  });

  const initialRows = await tier2Group.initialize({
    subscribeToPartition: async () => ({streamVersion: 1}),
  });
  t.same(
    initialRows,
    [{id: 1, name: 'Alice', code: 'ORD-ALPHA', amount: 50}],
    'Tier 2 initial snapshot executes JOIN query via sqlQueryEngine',
  );

  // 1) INSERT matching order for Alice (user_id = 1)
  db.prepare('INSERT INTO orders (id, user_id, code, amount) VALUES (?, ?, ?, ?)').run(
    102,
    1,
    'ORD-GAMMA',
    90,
  );
  await tier2Group.handleCDCEvent(
    {
      operation: LIVE_QUERY_OPERATION.INSERT,
      data: {id: 102, user_id: 1, code: 'ORD-GAMMA', amount: 90},
      hlc_timestamp: '2000:1',
      logIndex: 2,
    },
    'orders-p0',
  );
  t.equal(resets.length, 1, 'Tier 2 emits reset after CDC INSERT');
  t.equal(resets[0].type, LIVE_QUERY_EVENT.RESET);
  t.same(
    resets[0].rows,
    [
      {id: 1, name: 'Alice', code: 'ORD-ALPHA', amount: 50},
      {id: 1, name: 'Alice', code: 'ORD-GAMMA', amount: 90},
    ],
    'Tier 2 refresh reflects newly inserted joined row in ORDER BY order',
  );

  // 2) UPDATE order amount
  db.prepare('UPDATE orders SET amount = 120 WHERE id = 100').run();
  await tier2Group.handleCDCEvent(
    {
      operation: LIVE_QUERY_OPERATION.UPDATE,
      old_data: {id: 100, user_id: 1, code: 'ORD-ALPHA', amount: 50},
      data: {id: 100, user_id: 1, code: 'ORD-ALPHA', amount: 120},
      hlc_timestamp: '2000:2',
      logIndex: 3,
    },
    'orders-p0',
  );
  t.equal(resets.length, 2, 'Tier 2 emits reset after CDC UPDATE');
  t.same(
    resets[1].rows,
    [
      {id: 1, name: 'Alice', code: 'ORD-ALPHA', amount: 120},
      {id: 1, name: 'Alice', code: 'ORD-GAMMA', amount: 90},
    ],
    'Tier 2 refresh reflects updated amount',
  );

  // 3) DELETE order id = 102
  db.prepare('DELETE FROM orders WHERE id = 102').run();
  await tier2Group.handleCDCEvent(
    {
      operation: LIVE_QUERY_OPERATION.DELETE,
      old_data: {id: 102, user_id: 1, code: 'ORD-GAMMA', amount: 90},
      hlc_timestamp: '2000:3',
      logIndex: 4,
    },
    'orders-p0',
  );
  t.equal(resets.length, 3, 'Tier 2 emits reset after CDC DELETE');
  t.same(
    resets[2].rows,
    [{id: 1, name: 'Alice', code: 'ORD-ALPHA', amount: 120}],
    'Tier 2 refresh reflects deleted row removal',
  );
});
