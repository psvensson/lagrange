import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {
  compareRoutingKeys,
  compareSplitKey,
} from '../../src/partition/split-key-comparator.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {
  partitionServiceTableSql,
} from '../../src/partition/partition-service-table-bootstrap.js';
import {
  DistributedWriteCoordinator,
} from '../../src/query/distributed/distributed-write-coordinator.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  createMockSystemCache,
  createMockMessageRouter,
} from './sql-query-engine-test-support.js';

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
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], [{partition_id: 'p1'}], [], []),
  });

  const stringLiteral = {type: 'literal', value: 'O\'Reilly'};
  assert.equal(executor.buildExpressionSQL(stringLiteral), '\'O\'\'Reilly\'');

  const castExpr = {type: 'cast', expr: {type: 'literal', value: 5}, affinity: 'INTEGER'};
  assert.equal(executor.buildExpressionSQL(castExpr), 'CAST(5 AS INTEGER)');

  const caseExpr = {
    type: 'case',
    conditions: [{when: {type: 'literal', value: 1}, then: {type: 'literal', value: 'yes'}}],
    elseExpr: {type: 'literal', value: 'no'},
  };
  assert.equal(executor.buildExpressionSQL(caseExpr), 'CASE WHEN 1 THEN \'yes\' ELSE \'no\' END');

  assert.throws(
    () => executor.buildExpressionSQL({type: 'unknown_special_node'}),
    (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
  );
});

test('Q01: QueryExecutor buildInsertSQL & buildUpdateSQL bind literals to params and inline expressions', async () => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], [{partition_id: 'p1'}], [], []),
  });

  const insertAst = {
    type: 'INSERT',
    table: 't',
    columns: ['id', 'amount'],
    values: [[
      {type: 'literal', value: 2},
      {
        type: 'binary',
        operator: '+',
        left: {type: 'literal', value: 2},
        right: {type: 'literal', value: 3},
      },
    ]],
  };

  const insertParams = [];
  const insertSql = executor.buildInsertSQL(insertAst, insertParams);
  assert.equal(insertSql, 'INSERT INTO t (id, amount) VALUES (?, (2 + 3))');
  assert.deepEqual(insertParams, [2]);

  const updateAst = {
    type: 'UPDATE',
    table: 't',
    assignments: [{
      column: 'amount',
      value: {
        type: 'binary',
        operator: '+',
        left: {type: 'column_ref', column: 'amount'},
        right: {type: 'literal', value: 1},
      },
    }],
    where: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'id'},
      right: {type: 'literal', value: 1},
    },
  };

  const updateParams = [];
  const updateSql = executor.buildUpdateSQL(updateAst, updateParams);
  assert.equal(updateSql, 'UPDATE t SET amount = (amount + 1) WHERE (id = 1)');
  assert.deepEqual(updateParams, []);
});

test('Q01: DistributedWriteCoordinator extractKeyValue evaluates constant expressions and fails closed', async () => {
  const coordinator = new DistributedWriteCoordinator();

  assert.equal(coordinator.extractKeyValue({type: 'literal', value: 42}), 42);

  const addExpr = {
    type: 'binary',
    operator: '+',
    left: {type: 'literal', value: 10},
    right: {type: 'literal', value: 20},
  };
  assert.equal(coordinator.extractKeyValue(addExpr), 30);

  const concatExpr = {
    type: 'binary',
    operator: '||',
    left: {type: 'literal', value: 'hello_'},
    right: {type: 'literal', value: 'world'},
  };
  assert.equal(coordinator.extractKeyValue(concatExpr), 'hello_world');

  const fnExpr = {
    type: 'function',
    name: 'UPPER',
    args: [{type: 'literal', value: 'abc'}],
  };
  assert.equal(coordinator.extractKeyValue(fnExpr), 'ABC');

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

  const ddl = partitionServiceTableSql('t_check', schema);
  assert.match(ddl, /amount INTEGER CHECK \(amount\s*>=\s*0\)/);
});

test('Q02: Composite primary key emits table-level PRIMARY KEY and omits individual column PRIMARY KEY', async () => {
  const parser = new SQLParser('CREATE TABLE t_composite (id INTEGER, name TEXT, PRIMARY KEY(id, name))', {dialect: 'postgresql'});
  const ast = parser.parse();
  assert.deepEqual(ast.primaryKey, ['id', 'name']);

  const schema = TableCreationService.prototype.buildSchemaDefinition(ast.columns);
  assert.deepEqual(schema.primaryKey, ['id', 'name']);

  const ddl = partitionServiceTableSql('t_composite', schema);
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
  const ddl = partitionServiceTableSql('t_pk', schema);
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
    async executeOnPartitions(partitionIds, sql, params) {
      if (params[0] === 'existing@example.com') {
        return [{success: true, rows: [{1: 1}]}];
      }
      return [{success: true, rows: []}];
    },
  };

  const insertDuplicateExisting = {
    type: 'INSERT',
    table: 'u',
    columns: ['id', 'email'],
    values: [[
      {type: 'literal', value: 2},
      {type: 'literal', value: 'existing@example.com'},
    ]],
  };

  await assert.rejects(
    async () => coordinator.enforceCrossPartitionUniqueConstraints(insertDuplicateExisting, []),
    (err) => err.message.includes('UNIQUE constraint failed: u.email'),
  );

  const insertBatchDuplicate = {
    type: 'INSERT',
    table: 'u',
    columns: ['id', 'email'],
    values: [
      [{type: 'literal', value: 1}, {type: 'literal', value: 'same@example.com'}],
      [{type: 'literal', value: 2}, {type: 'literal', value: 'same@example.com'}],
    ],
  };

  await assert.rejects(
    async () => coordinator.enforceCrossPartitionUniqueConstraints(insertBatchDuplicate, []),
    (err) => err.message.includes('UNIQUE constraint failed: u.email'),
  );

  const insertValid = {
    type: 'INSERT',
    table: 'u',
    columns: ['id', 'email'],
    values: [[
      {type: 'literal', value: 3},
      {type: 'literal', value: 'unique@example.com'},
    ]],
  };

  await assert.doesNotReject(
    async () => coordinator.enforceCrossPartitionUniqueConstraints(insertValid, []),
  );
});

function insertAstExpressionType(ast, rowIdx, colIdx) {
  return ast.values[rowIdx][colIdx].type;
}
