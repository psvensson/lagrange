import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {
  compareRoutingKeys,
  compareSplitKey,
} from '../../src/partition/split-key-comparator.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {
  renderTableDefinitionSql,
} from '../../src/query/sql-table-definition.js';
import {
  DistributedWriteCoordinator,
} from '../../src/query/distributed/distributed-write-coordinator.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  createMockSystemCache,
  createMockMessageRouter,
} from './sql-query-engine-test-support.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
// =========================================================================
// Q03: Storage-Compatible Key Ordering
// =========================================================================

test('Q03: compareSplitKey and compareRoutingKeys agree on ASCII case ordering', async () => {
  assert.equal(compareSplitKey('Z', 'a'), -1);
  assert.equal(compareRoutingKeys('Z', 'a'), -1);
  assert.equal(compareSplitKey('a', 'Z'), 1);
  assert.equal(compareRoutingKeys('a', 'Z'), 1);
  assert.equal(compareSplitKey('a', 'a'), 0);
  assert.equal(compareRoutingKeys('a', 'a'), 0);
});

test('Q03: UTF-8 byte ordering matches SQLite BINARY collation', async () => {
  const strings = ['ABC', 'abc', '123', 'Zebra', 'apple'];
  const sortedBySplitKey = [...strings].sort((a, b) => compareSplitKey(a, b));
  const sortedByRoutingKeys = [...strings].sort((a, b) => compareRoutingKeys(a, b));
  const expected = ['123', 'ABC', 'Zebra', 'abc', 'apple'];
  assert.deepEqual(sortedBySplitKey, expected);
  assert.deepEqual(sortedByRoutingKeys, expected);
});

// =========================================================================
// Q01: SQL Mutation Expression Evaluation, Safe Literal Rendering & Fail-Closed AST
// =========================================================================

test('Q01: PostgreSQL dollar-quoted strings are normalized to string literals', async () => {
  const parser1 = new SQLParser('SELECT $$hello$$ AS msg', {dialect: 'postgresql'});
  const ast1 = parser1.parse();
  assert.equal(ast1.columns[0].expression.type, 'literal');
  assert.equal(ast1.columns[0].expression.value, 'hello');

  const parser2 = new SQLParser('SELECT $tag$hello\'world$tag$ AS msg', {dialect: 'postgresql'});
  const ast2 = parser2.parse();
  assert.equal(ast2.columns[0].expression.type, 'literal');
  assert.equal(ast2.columns[0].expression.value, 'hello\'world');

  const parser3 = new SQLParser('SELECT \'don\'\'t touch $$this$$\' AS s', {dialect: 'postgresql'});
  const ast3 = parser3.parse();
  assert.equal(ast3.columns[0].expression.value, 'don\'t touch $$this$$');
});

test('Q01: INSERT permits constant expressions and rejects column references/subqueries/aggregates', async () => {
  const insertConst = new SQLParser('INSERT INTO t(id, amount) VALUES (1, 2 + 3)', {dialect: 'postgresql'}).parse();
  assert.equal(insertAstExpressionType(insertConst, 0, 1), 'binary');

  assert.throws(
    () => new SQLParser('INSERT INTO t(id, amount) VALUES (1, other_col + 1)', {dialect: 'postgresql'}).parse(),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );

  assert.throws(
    () => new SQLParser('INSERT INTO t(id, amount) VALUES (1, (SELECT 2))', {dialect: 'postgresql'}).parse(),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );

  assert.throws(
    () => new SQLParser('INSERT INTO t(id, amount) VALUES (1, COUNT(*))', {dialect: 'postgresql'}).parse(),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );
});

test('Q01: UPDATE permits column references and rejects subqueries/aggregates', async () => {
  const updateExpr = new SQLParser('UPDATE t SET amount = amount + 1 WHERE id = 1', {dialect: 'postgresql'}).parse();
  assert.equal(updateExpr.assignments[0].value.type, 'binary');

  assert.throws(
    () => new SQLParser('UPDATE t SET amount = (SELECT 2) WHERE id = 1', {dialect: 'postgresql'}).parse(),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );

  assert.throws(
    () => new SQLParser('UPDATE t SET amount = COUNT(*) WHERE id = 1', {dialect: 'postgresql'}).parse(),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );
});

test('Q01: QueryExecutor buildExpressionSQL safely escapes single quotes and supports CAST/CASE', async () => {
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], [{partition_id: 'p1'}], [], []),
  });

  const stringLiteral = {type: 'literal', value: 'O\'Reilly', sqlType: 'TEXT'};
  assert.equal(executor.buildExpressionSQL(stringLiteral), '\'O\'\'Reilly\'');

  const castExpr = {type: 'cast', expression: {type: 'literal', value: 5, sqlType: 'INTEGER'},
    targetType: 'INTEGER', affinity: 'INTEGER'};
  assert.equal(executor.buildExpressionSQL(castExpr), 'CAST(5 AS INTEGER)');

  const caseExpr = {
    type: 'case',
    conditions: [{when: {type: 'literal', value: 1, sqlType: 'INTEGER'},
      thenExpression: {type: 'literal', value: 'yes', sqlType: 'TEXT'}}],
    elseExpr: {type: 'literal', value: 'no', sqlType: 'TEXT'},
  };
  assert.equal(executor.buildExpressionSQL(caseExpr), 'CASE WHEN 1 THEN \'yes\' ELSE \'no\' END');

  assert.throws(
    () => executor.buildExpressionSQL({type: 'unknown_special_node'}),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );
  // A literal is rendered only in the storage class it carries.
  assert.throws(
    () => executor.buildExpressionSQL({type: 'literal', value: 5}),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );
});

test('Q01: QueryExecutor buildInsertSQL & buildUpdateSQL preserve SQL literal storage classes and slice per-partition params', async () => {
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], [{partition_id: 'p1'}], [], []),
  });

  const insertAst = {
    type: 'INSERT',
    table: 't',
    columns: ['id', 'amount'],
    values: [[
      {type: 'literal', value: 2, sqlType: 'INTEGER'},
      {
        type: 'binary',
        operator: '+',
        left: {type: 'literal', value: 2, sqlType: 'INTEGER'},
        right: {type: 'literal', value: 3, sqlType: 'INTEGER'},
      },
    ]],
  };

  const insertParams = [];
  const insertSql = executor.buildInsertSQL(insertAst, insertParams);
  assert.equal(insertSql, 'INSERT INTO t (id, amount) VALUES (2, (2 + 3))');
  assert.deepEqual(insertParams, []);

  const updateAst = {
    type: 'UPDATE',
    table: 't',
    assignments: [{
      column: 'amount',
      value: {
        type: 'binary',
        operator: '+',
        left: {type: 'column_ref', column: 'amount'},
        right: {type: 'literal', value: 1, sqlType: 'INTEGER'},
      },
    }],
    where: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'id'},
      right: {type: 'literal', value: 1, sqlType: 'INTEGER'},
    },
  };

  const updateParams = [];
  const updateSql = executor.buildUpdateSQL(updateAst, updateParams);
  assert.equal(updateSql, 'UPDATE t SET amount = (amount + 1) WHERE (id = 1)');
  assert.deepEqual(updateParams, []);
});

test('Q01: DistributedWriteCoordinator extractKeyValue evaluates constant expressions via SQLite and fails closed', async () => {
  const coordinator = new DistributedWriteCoordinator();
  const parseExpr = (sql) => new SQLParser(`SELECT ${sql}`).parse().columns[0].expression;

  assert.equal(coordinator.extractKeyValue(parseExpr('42')), 42);
  assert.equal(coordinator.extractKeyValue(parseExpr('10 + 20')), 30);
  assert.equal(coordinator.extractKeyValue(parseExpr('\'hello_\' || \'world\'')), 'hello_world');
  assert.equal(coordinator.extractKeyValue(parseExpr('UPPER(\'abc\')')), 'ABC');
  assert.equal(coordinator.extractKeyValue(parseExpr('TRIM(\'xxabcxx\', \'x\')')), 'abc');
  assert.equal(coordinator.extractKeyValue(parseExpr('\'a\' COLLATE NOCASE')), 'a');
  assert.equal(
    coordinator.extractKeyValue(parseExpr('\'42\''), [], {name: 'id', type: 'INTEGER'}),
    42,
  );
  assert.equal(
    coordinator.extractKeyValue(parseExpr('100'), [], {name: 'k', type: 'TEXT'}),
    '100',
  );

  assert.throws(
    () => coordinator.extractKeyValue({type: 'column_ref', column: 'x'}),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );
});

// =========================================================================
// Q02: Schema Constraint Agreement Across Parser, Metadata & Partition DDL
// =========================================================================

test('Q02: CREATE TABLE with REFERENCES or FOREIGN KEY fails closed', async () => {
  assert.throws(
    () => new SQLParser('CREATE TABLE c (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES p(id))', {dialect: 'postgresql'}).parse(),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE' && err.message.includes('FOREIGN KEY / REFERENCES'),
  );

  assert.throws(
    () => new SQLParser('CREATE TABLE c (id INTEGER PRIMARY KEY, pid INTEGER, FOREIGN KEY (pid) REFERENCES p(id))', {dialect: 'postgresql'}).parse(),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE' && err.message.includes('FOREIGN KEY / REFERENCES'),
  );
});

test('Q02: CHECK constraints are parsed and preserved in column checkSql and tableConstraints', async () => {
  const parser = new SQLParser('CREATE TABLE t_check (id INTEGER PRIMARY KEY, amount INTEGER CHECK(amount >= 0))', {dialect: 'postgresql'});
  const ast = parser.parse();
  const amountCol = ast.columns.find((c) => c.name === 'amount');
  assert.ok(amountCol.checkSql);
  assert.match(amountCol.checkSql, /amount\s*>=\s*0/);

  const schema = TableCreationService.prototype.buildSchemaDefinition(ast.columns);
  const amountSchema = schema.columns.find((c) => c.name === 'amount');
  assert.equal(amountSchema.checkSql, amountCol.checkSql);

  const ddl = renderTableDefinitionSql('t_check', schema);
  assert.match(ddl, /amount INTEGER CHECK \(\(amount\s*>=\s*0\)\)/);
});

test('Q02: Composite primary key emits table-level PRIMARY KEY and omits individual column PRIMARY KEY', async () => {
  const parser = new SQLParser('CREATE TABLE t_composite (id INTEGER, name TEXT, PRIMARY KEY(id, name))', {dialect: 'postgresql'});
  const ast = parser.parse();
  assert.deepEqual(ast.primaryKey, ['id', 'name']);

  const schema = TableCreationService.prototype.buildSchemaDefinition(ast.columns);
  assert.deepEqual(schema.primaryKey, ['id', 'name']);

  const ddl = renderTableDefinitionSql('t_composite', schema);
  assert.match(ddl, /id INTEGER, name TEXT, PRIMARY KEY \(id, name\)/);
  assert.ok(!ddl.includes('id INTEGER PRIMARY KEY'));
  assert.ok(!ddl.includes('name TEXT PRIMARY KEY'));
});

test('Q02: Single-column table PRIMARY KEY sets col.primaryKey = true and emits inline PRIMARY KEY', async () => {
  const parser = new SQLParser('CREATE TABLE t_pk (id INTEGER, amount INTEGER, PRIMARY KEY(id), UNIQUE(amount))', {dialect: 'postgresql'});
  const ast = parser.parse();
  const idCol = ast.columns.find((c) => c.name === 'id');
  assert.equal(idCol.primaryKey, true);

  const schema = TableCreationService.prototype.buildSchemaDefinition(ast.columns);
  const ddl = renderTableDefinitionSql('t_pk', schema);
  assert.match(ddl, /id INTEGER PRIMARY KEY/);
  assert.match(ddl, /UNIQUE \(amount\)/);
});

test('Q02: Cross-partition UNIQUE constraint enforcement rejects duplicate candidate rows', async () => {
  const mockTableMetadata = {
    table_name: 'u',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'email', type: 'TEXT', unique: true},
      ],
      primaryKey: ['id'],
      tableConstraints: [{type: 'UNIQUE', columns: ['email']}],
    },
  };

  const coordinator = new DistributedWriteCoordinator({
    getTableInfo: () => mockTableMetadata,
    getTablePartitions: () => [
      {partition_id: 'p1', table_name: 'u'},
      {partition_id: 'p2', table_name: 'u'},
    ],
  });

  coordinator.queryExecutor = {
    async executeOnPartitions(partitionIds, _sql, params) {
      return partitionIds.map((_pid, idx) => ({
        success: true,
        rows: idx === 0 && params[0] === 'existing@example.com' ? [{1: 1}] : [],
      }));
    },
  };

  const parseSql = (sql) => new SQLParser(sql, {dialect: 'sqlite'}).parse();
  const insertDuplicateExisting = parseSql(
    'INSERT INTO u (id, email) VALUES (2, \'existing@example.com\')',
  );

  await assert.rejects(
    async () => coordinator.enforceCrossPartitionUniqueConstraints(insertDuplicateExisting, []),
    (err) => err.message.includes('UNIQUE constraint failed: u.email'),
  );

  const insertBatchDuplicate = parseSql(
    'INSERT INTO u (id, email) VALUES (1, \'same@example.com\'), (2, \'same@example.com\')',
  );

  await assert.rejects(
    async () => coordinator.enforceCrossPartitionUniqueConstraints(insertBatchDuplicate, []),
    (err) => err.message.includes('UNIQUE constraint failed: u.email'),
  );

  const insertValid = parseSql(
    'INSERT INTO u (id, email) VALUES (3, \'unique@example.com\')',
  );

  await assert.doesNotReject(
    async () => coordinator.enforceCrossPartitionUniqueConstraints(insertValid, []),
  );
});

test('Q02: UPDATE uniqueness distinguishes self-update, zero-row stale CAS, competing owner, and multi-row target conflict', async () => {
  const schema = {
    columns: [
      {name: 'node_id', type: 'TEXT', primaryKey: true},
      {name: 'node_address', type: 'TEXT', notNull: true, unique: true},
      {name: 'status', type: 'TEXT'},
    ],
    primaryKey: ['node_id'],
    tableConstraints: [],
  };
  const ddl = renderTableDefinitionSql('nodes', schema);
  const db1 = new Database(':memory:');
  const db2 = new Database(':memory:');
  try {
    db1.exec(ddl);
    db2.exec(ddl);
    db1.prepare('INSERT INTO nodes (node_id, node_address, status) VALUES (?, ?, ?)')
      .run('node-1', 'ws://localhost:50553', 'active');
    db2.prepare('INSERT INTO nodes (node_id, node_address, status) VALUES (?, ?, ?)')
      .run('node-2', 'ws://localhost:50552', 'active');
    const dbs = new Map([['nodes-p1', db1], ['nodes-p2', db2]]);

    let probeCallCount = 0;
    const coordinator = new DistributedWriteCoordinator({
      getTableInfo: () => ({
        table_name: 'nodes',
        schema_definition: JSON.stringify(schema),
      }),
      getTablePartitions: () => [
        {partition_id: 'nodes-p1', table_name: 'nodes'},
        {partition_id: 'nodes-p2', table_name: 'nodes'},
      ],
    });
    coordinator.queryExecutor = {
      async executeOnPartitions(partitionIds, sql, params) {
        probeCallCount += 1;
        return partitionIds.map((pid) => ({
          success: true,
          rows: dbs.get(pid).prepare(sql).all(...params),
        }));
      },
    };

    const parseSql = (sql) => new SQLParser(sql, {dialect: 'sqlite'}).parse();

    // 1. Self-update: the single matched target row already owns the address.
    await assert.doesNotReject(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET node_address = ? WHERE node_id = ?'),
        ['ws://localhost:50553', 'node-1'],
      ),
    );

    // 2. Stale CAS / predicate matches zero rows: even if an existing row owns the address,
    // zero rows are updated so the precheck must not mask the zero-row CAS outcome.
    await assert.doesNotReject(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET node_address = ?, status = ? WHERE node_id = ? AND status = ?'),
        ['ws://localhost:50553', 'active', 'node-1', 'joining'],
      ),
    );

    // 3. Competing owner: 1 target row matches WHERE and another row on nodes-p2 owns the address.
    await assert.rejects(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET node_address = ? WHERE node_id = ?'),
        ['ws://localhost:50552', 'node-1'],
      ),
      (err) => err.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
        err.message.includes('UNIQUE constraint failed: nodes.node_address'),
    );

    // 4. Multiple updated rows across partitions receive the same unique value.
    await assert.rejects(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET node_address = ? WHERE status = ?'),
        ['ws://localhost:50559', 'active'],
      ),
      (err) => err.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
        err.message.includes('UNIQUE constraint failed: nodes.node_address'),
    );

    // 5. Unrelated column update does not probe uniqueness.
    const callsBeforeUnrelated = probeCallCount;
    await assert.doesNotReject(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET status = ? WHERE node_id = ?'),
        ['active', 'node-1'],
      ),
    );
    assert.equal(probeCallCount, callsBeforeUnrelated);

    // 6. Parameterized subquery in WHERE (IN (SELECT ?), EXISTS, scalar subquery):
    // rendered SQL and bindings remain aligned through the canonical renderer
    // and catch competing ownership on nodes-p2.
    await assert.rejects(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET node_address = ? WHERE node_id = \'node-1\' AND node_id IN (SELECT ?)'),
        ['ws://localhost:50552', 'node-1'],
      ),
      (err) => err.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
        err.message.includes('UNIQUE constraint failed: nodes.node_address'),
    );
    await assert.rejects(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET node_address = ? WHERE EXISTS (SELECT 1 WHERE node_id = ?)'),
        ['ws://localhost:50552', 'node-1'],
      ),
      (err) => err.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
        err.message.includes('UNIQUE constraint failed: nodes.node_address'),
    );
    await assert.doesNotReject(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET node_address = ? WHERE node_id = \'node-1\' AND node_id IN (SELECT ?)'),
        ['ws://localhost:50553', 'node-1'],
      ),
    );

    // 7. Failed or incomplete partition observation stops the mutation instead
    // of treating missing/failed partition results as empty observations.
    coordinator.queryExecutor = {
      async executeOnPartitions() {
        return [
          {success: true, rows: []},
          {
            success: false,
            errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
            error: 'partition nodes-p2 unreachable during uniqueness probe',
          },
        ];
      },
    };
    await assert.rejects(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('UPDATE nodes SET node_address = ? WHERE node_id = ?'),
        ['ws://localhost:50552', 'node-1'],
      ),
      (err) => err.code === 'DISTRIBUTED_PARTICIPANT_FAILURE' &&
        err.message.includes('partition nodes-p2 unreachable'),
    );
    await assert.rejects(
      () => coordinator.enforceCrossPartitionUniqueConstraints(
        parseSql('INSERT INTO nodes (node_id, node_address, status) VALUES (?, ?, ?)'),
        ['node-3', 'ws://localhost:50552', 'active'],
      ),
      (err) => err.code === 'DISTRIBUTED_PARTICIPANT_FAILURE' &&
        err.message.includes('partition nodes-p2 unreachable'),
    );
  } finally {
    db1.close();
    db2.close();
  }
});

function insertAstExpressionType(ast, rowIdx, colIdx) {
  return ast.values[rowIdx][colIdx].type;
}

test('Review 4 Item 1: two-partition public INSERT and UPDATE preserve storage class between uniqueness precheck and actual mutation', async () => {
  const db1 = new Database(':memory:');
  const db2 = new Database(':memory:');
  db1.defaultSafeIntegers(true);
  db2.defaultSafeIntegers(true);

  const ddl = 'CREATE TABLE t (id INTEGER PRIMARY KEY, u TEXT UNIQUE, raw BLOB)';
  const ast = new SQLParser(ddl).parse();
  const schema = TableCreationService.prototype.buildSchemaDefinition(ast.columns, ast);
  const renderedDdl = renderTableDefinitionSql('t', schema);
  db1.exec(renderedDdl);
  db2.exec(renderedDdl);

  // Partition 2 starts with id = 200, u = '100.0'
  db2.prepare('INSERT INTO "t" ("id", "u", "raw") VALUES (?, ?, ?)').run(200n, '100.0', 100.0);

  const dbsByPartition = new Map([
    ['t-p1', db1],
    ['t-p2', db2],
  ]);

  const tableInfo = {
    table_id: 't',
    table_name: 't',
    primaryKey: 'id',
    partition_key: 'id',
    partition_key_type: 'INTEGER',
    schema_definition: JSON.stringify(schema),
  };
  const partitions = [
    {
      partition_id: 't-p1',
      table_name: 't',
      partition_key_start: null,
      partition_key_end: 100,
      partition_key_type: 'INTEGER',
    },
    {
      partition_id: 't-p2',
      table_name: 't',
      partition_key_start: 100,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
    },
  ];

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([tableInfo], partitions, [], []),
  });

  executor.executeOnPartition = async (partitionId, sql, params = [], forRead = false) => {
    const db = dbsByPartition.get(partitionId);
    const stmt = db.prepare(sql);
    if (forRead || stmt.reader) {
      return {
        partitionId,
        success: true,
        rows: stmt.all(...params),
        rowSetComplete: true,
      };
    }
    const info = stmt.run(...params);
    return {
      partitionId,
      success: true,
      changes: info.changes,
      rows: [],
    };
  };
  executor.executeOnPartitions = async (partitionIds, sql, params = [], _ts, forRead = false) =>
    Promise.all(
      partitionIds.map((pid) => executor.executeOnPartition(pid, sql, params, forRead)),
    );

  const coordinator = new DistributedWriteCoordinator({
    queryExecutor: executor,
    getTableInfo: () => tableInfo,
    getTablePartitions: () => partitions,
    partitionResolver: {
      resolvePartitionForKey(_tableName, keyValue) {
        return Number(keyValue) < 100 ? 't-p1' : 't-p2';
      },
    },
  });

  const parseSql = (sql) => new SQLParser(sql).parse();

  try {
    // 1. Non-conflicting SQL INTEGER literal 100 routed to t-p1 while t-p2 holds '100.0':
    // Both precheck and actual mutation must treat SQL literal 100 as INTEGER -> TEXT '100'
    // (NOT '100.0') and INTEGER 100 in BLOB/no-affinity `raw`.
    const insertIntLiteral = await coordinator.executeInsert(
      parseSql('INSERT INTO t (id, u, raw) VALUES (1, 100, 100)'),
      [],
    );
    assert.equal(insertIntLiteral.success, true);

    const p1Row1 = db1
      .prepare('SELECT id, u, typeof(u) AS u_type, raw, typeof(raw) AS raw_type FROM "t" WHERE id = 1')
      .get();
    assert.deepEqual(p1Row1, {
      id: 1n,
      u: '100',
      u_type: 'text',
      raw: 100n,
      raw_type: 'integer',
    });

    // 2. Conflicting cases across partitions:
    // (a) SQL REAL literal 100.0 routed to t-p1 conflicts with existing '100.0' on t-p2:
    await assert.rejects(
      () => coordinator.executeInsert(
        parseSql('INSERT INTO t (id, u, raw) VALUES (2, 100.0, 100.0)'),
        [],
      ),
      {code: 'SQLITE_CONSTRAINT_UNIQUE'},
    );
    // (b) JS numeric parameter 100 (which binds as SQLite REAL 100.0 -> TEXT '100.0')
    // routed to t-p1 conflicts with existing '100.0' on t-p2:
    await assert.rejects(
      () => coordinator.executeInsert(
        parseSql('INSERT INTO t (id, u, raw) VALUES (?, ?, ?)'),
        [2, 100, 100],
      ),
      {code: 'SQLITE_CONSTRAINT_UNIQUE'},
    );
    // (c) SQL INTEGER literal 100 routed to t-p2 conflicts with '100' now stored on t-p1:
    await assert.rejects(
      () => coordinator.executeInsert(
        parseSql('INSERT INTO t (id, u, raw) VALUES (201, 100, 100)'),
        [],
      ),
      {code: 'SQLITE_CONSTRAINT_UNIQUE'},
    );
    // (d) JS BigInt parameter 100n (which binds as SQLite INTEGER 100 -> TEXT '100')
    // routed to t-p2 conflicts with '100' stored on t-p1:
    await assert.rejects(
      () => coordinator.executeInsert(
        parseSql('INSERT INTO t (id, u, raw) VALUES (?, ?, ?)'),
        [201n, 100n, 100n],
      ),
      {code: 'SQLITE_CONSTRAINT_UNIQUE'},
    );

    // 3. Non-conflicting controls verifying JS Number parameter vs JS BigInt parameter
    // storage-class fidelity on actual mutation:
    const insertRealParam = await coordinator.executeInsert(
      parseSql('INSERT INTO t (id, u, raw) VALUES (?, ?, ?)'),
      [3, 200, 200],
    );
    assert.equal(insertRealParam.success, true);
    const p1Row3 = db1
      .prepare('SELECT id, u, typeof(u) AS u_type, raw, typeof(raw) AS raw_type FROM "t" WHERE id = 3')
      .get();
    assert.deepEqual(p1Row3, {
      id: 3n,
      u: '200.0',
      u_type: 'text',
      raw: 200,
      raw_type: 'real',
    });

    const insertBigIntParam = await coordinator.executeInsert(
      parseSql('INSERT INTO t (id, u, raw) VALUES (?, ?, ?)'),
      [204n, 200n, 200n],
    );
    assert.equal(insertBigIntParam.success, true);
    const p2Row204 = db2
      .prepare('SELECT id, u, typeof(u) AS u_type, raw, typeof(raw) AS raw_type FROM "t" WHERE id = 204')
      .get();
    assert.deepEqual(p2Row204, {
      id: 204n,
      u: '200',
      u_type: 'text',
      raw: 200n,
      raw_type: 'integer',
    });

    // 4. Multi-row parameterized INSERT spanning both partitions slices each partition's
    // bound parameters accurately:
    const multiRowRes = await coordinator.executeInsert(
      parseSql('INSERT INTO t (id, u, raw) VALUES (?, ?, ?), (?, ?, ?)'),
      [5n, 500n, 500n, 205, 500, 500],
    );
    assert.equal(multiRowRes.success, true);
    assert.equal(db1.prepare('SELECT u FROM "t" WHERE id = 5').pluck().get(), '500');
    assert.equal(db2.prepare('SELECT u FROM "t" WHERE id = 205').pluck().get(), '500.0');

    // 5. SQL BLOB literal X'cafe' in INSERT preserves Uint8Array storage class:
    const blobLiteralInsert = await coordinator.executeInsert(
      parseSql('INSERT INTO t (id, u, raw) VALUES (6, \'blob-6\', X\'cafe\')'),
      [],
    );
    assert.equal(blobLiteralInsert.success, true);
    const p1Row6 = db1
      .prepare('SELECT id, u, raw, typeof(raw) AS raw_type FROM "t" WHERE id = 6')
      .get();
    assert.deepEqual(p1Row6, {
      id: 6n,
      u: 'blob-6',
      raw: Buffer.from('cafe', 'hex'),
      raw_type: 'blob',
    });

    // 6. Two-partition UPDATE preserving storage class between uniqueness precheck and mutation:
    // (a) UPDATE on t-p1 with JS Number parameter 500 (-> REAL 500.0 -> TEXT '500.0') conflicts
    // with '500.0' on t-p2 (id = 205):
    await assert.rejects(
      () => coordinator.executeUpdate(
        parseSql('UPDATE t SET u = ?, raw = ? WHERE id = ?'),
        [500, 500, 1],
      ),
      {code: 'SQLITE_CONSTRAINT_UNIQUE'},
    );
    // (b) UPDATE on t-p2 with SQL INTEGER literal 500 (-> TEXT '500') conflicts with '500' on t-p1 (id = 5):
    await assert.rejects(
      () => coordinator.executeUpdate(
        parseSql('UPDATE t SET u = 500, raw = 500 WHERE id = 204'),
        [],
      ),
      {code: 'SQLITE_CONSTRAINT_UNIQUE'},
    );
    // (c) Non-conflicting UPDATE on t-p1 with SQL INTEGER literal 700 and SQL BLOB literal X'beef'
    // vs UPDATE on t-p2 with JS Number parameter 700 (-> '700.0'):
    const updateIntLiteral = await coordinator.executeUpdate(
      parseSql('UPDATE t SET u = 700, raw = X\'beef\' WHERE id = 1'),
      [],
      {partitionIds: ['t-p1']},
    );
    assert.equal(updateIntLiteral.success, true);
    assert.deepEqual(
      db1.prepare('SELECT u, typeof(u) AS u_type, raw, typeof(raw) AS raw_type FROM "t" WHERE id = 1').get(),
      {
        u: '700',
        u_type: 'text',
        raw: Buffer.from('beef', 'hex'),
        raw_type: 'blob',
      },
    );
    const updateRealParam = await coordinator.executeUpdate(
      parseSql('UPDATE t SET u = ?, raw = ? WHERE id = ?'),
      [700, 700, 204n],
      {partitionIds: ['t-p2']},
    );
    assert.equal(updateRealParam.success, true);
    assert.deepEqual(
      db2.prepare('SELECT u, typeof(u) AS u_type, raw, typeof(raw) AS raw_type FROM "t" WHERE id = 204').get(),
      {
        u: '700.0',
        u_type: 'text',
        raw: 700,
        raw_type: 'real',
      },
    );
  } finally {
    db1.close();
    db2.close();
  }
});
