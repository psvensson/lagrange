/**
 * One schema authority (design coordinator-sqlite-merge §2.7, WP2): the
 * catalog records each column's collation, one owner renders a schema's
 * CREATE TABLE, the partition and the coordinator use it, and a
 * partition-key column must be BINARY.
 */

import assert from 'node:assert/strict';
import {after, test} from 'node:test';

import Database from 'better-sqlite3';

import {createPartitionServiceTable, readPartitionServiceTableSchemaIn,
  PARTITION_TABLE_OBSERVATION} from '../../src/partition/partition-service-table-bootstrap.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {
  renderTableColumnsSql,
  renderTableDefinitionSql,
  sqliteDeclaredTypeAffinity,
} from '../../src/query/sql-table-definition.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';

const DDL = 'CREATE TABLE gc (id INTEGER PRIMARY KEY, name TEXT COLLATE NOCASE NOT NULL, ' +
  'tail VARCHAR(20) COLLATE RTRIM, plain TEXT COLLATE BINARY, n NUMERIC, un, ' +
  'amount REAL DEFAULT 2.0 CHECK (amount >= 0.5))';
const databases = [];
after(() => databases.forEach((db) => db.close()));

function memoryDatabase() {
  const db = new Database(':memory:');
  databases.push(db);
  return db;
}

function catalogSchema(ddl = DDL) {
  const ast = new SQLParser(ddl).parse();
  return {tableName: ast.tableName,
    ...TableCreationService.prototype.buildSchemaDefinition(ast.columns, ast)};
}

function partitionTableSql(schema) {
  const db = memoryDatabase();
  createPartitionServiceTable({db, tableName: schema.tableName, schema, partitionId: 'p1',
    logger: {debug() {}},
    ensureServicesTableColumns() {}, ensureTablesTableColumns() {},
    ensureMessageGroupsTableColumns() {}, ensurePartitionsTableColumns() {},
    ensureSqlTransactionsTableColumns() {}, ensureReplicaOperationsTableColumns() {}});
  return {db, sql: db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?')
    .pluck().get(schema.tableName)};
}

test('the catalog records each column\'s collation, BINARY when none is declared', () => {
  const schema = catalogSchema();
  assert.deepEqual(schema.columns.map((column) => [column.name, column.type, column.collation]), [
    ['id', 'INTEGER', 'BINARY'], ['name', 'TEXT', 'NOCASE'], ['tail', 'TEXT', 'RTRIM'],
    ['plain', 'TEXT', 'BINARY'], ['n', 'REAL', 'BINARY'], ['un', 'BLOB', 'BINARY'],
    ['amount', 'REAL', 'BINARY']]);
  assert.equal(schema.columns.find((column) => column.name === 'amount').defaultValue, '2.0');
});

test('the partition creates exactly the table the shared renderer renders', () => {
  const schema = catalogSchema();
  const {db, sql} = partitionTableSql(schema);
  assert.equal(sql, renderTableDefinitionSql(schema.tableName, schema),
    'partition table SQL equals the coordinator\'s table SQL');
  assert.match(sql, /name TEXT COLLATE NOCASE NOT NULL/u);
  assert.match(sql, /tail TEXT COLLATE RTRIM/u);
  assert.doesNotMatch(sql, /COLLATE BINARY/u, 'BINARY is SQLite\'s default, never rendered');
  assert.equal(readPartitionServiceTableSchemaIn(db, schema).state,
    PARTITION_TABLE_OBSERVATION.COMPLETE, 'the partition recognizes its own table bytes');
  db.prepare('INSERT INTO gc (id, name, tail) VALUES (1, \'Ab\', \'x  \')').run();
  assert.equal(db.prepare('SELECT COUNT(*) FROM gc WHERE name = \'aB\' AND tail = \'x\'')
    .pluck().get(), 1, 'the declared collations govern comparison on the partition');
});

test('the column-only projection keeps every column\'s affinity and collation', () => {
  const schema = catalogSchema();
  const full = partitionTableSql(schema).db;
  const columnsOnly = memoryDatabase();
  columnsOnly.exec(renderTableColumnsSql(schema.tableName, schema));
  assert.doesNotMatch(renderTableColumnsSql(schema.tableName, schema),
    /PRIMARY KEY|NOT NULL|CHECK|DEFAULT/u);
  const probes = [1n, 1.0, '1.0', ' 2', 'abc', Buffer.from('A'), null];
  for (const column of schema.columns.filter((col) => col.name !== 'id')) {
    const stored = (db) => {
      db.exec('DELETE FROM gc');
      const insert = db.prepare(`INSERT INTO gc (id, name, ${column.name}) VALUES (?, 'n', ?)`);
      probes.forEach((value, index) => insert.run(BigInt(index + 1), column.name === 'name' ?
        'n' : value));
      return db.prepare(`SELECT typeof(${column.name}) || ':' || quote(${column.name}), ` +
        `${column.name} = 'ABC' FROM gc ORDER BY rowid`).raw().all();
    };
    assert.deepEqual(stored(columnsOnly), stored(full), `column ${column.name}`);
  }
});

test('a non-BINARY partition-key column is refused, typed', () => {
  for (const ddl of ['CREATE TABLE k1 (id TEXT COLLATE NOCASE PRIMARY KEY, v)',
    'CREATE TABLE k2 (a INTEGER, b TEXT COLLATE RTRIM, PRIMARY KEY (a, b))']) {
    assert.throws(() => catalogSchema(ddl), {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE},
      ddl);
  }
  assert.doesNotThrow(() => catalogSchema('CREATE TABLE k3 (id TEXT COLLATE BINARY PRIMARY KEY, ' +
    'v TEXT COLLATE NOCASE)'));
});

// SQLite's own answer: CAST to a type applies that type's affinity, and
// '1.5' / '1.0' tell the five affinities apart.
function measuredAffinity(db, type) {
  const probe = (text) => db.prepare(`SELECT typeof(CAST(? AS ${type}))`).pluck().get(text);
  const signature = `${probe('1.5')}/${probe('1.0')}`;
  return {'integer/integer': 'INTEGER', 'real/integer': 'NUMERIC', 'real/real': 'REAL',
    'text/text': 'TEXT', 'blob/blob': 'BLOB'}[signature];
}

test('signed numeric DEFAULT literals keep their REAL or INTEGER storage class', () => {
  const schema = catalogSchema('CREATE TABLE sd (id INTEGER PRIMARY KEY, ' +
    'neg_real BLOB DEFAULT -2.5, neg_zero BLOB DEFAULT -0.0, neg_int BLOB DEFAULT -3)');
  const {db} = partitionTableSql(schema);
  db.prepare('INSERT INTO sd (id) VALUES (1)').run();
  assert.deepEqual(
    db.prepare('SELECT typeof(neg_real), neg_real, typeof(neg_zero), typeof(neg_int), neg_int ' +
      'FROM sd').raw().get(),
    ['real', -2.5, 'real', 'integer', -3],
  );
  assert.throws(
    () => catalogSchema('CREATE TABLE big_def (id INTEGER PRIMARY KEY, v INTEGER DEFAULT ' +
      '-9223372036854775808)'),
    {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE},
  );
});

test('a declared type\'s affinity is SQLite\'s own (CAST measures it)', () => {
  const db = memoryDatabase();
  for (const type of ['INT', 'BIGINT', 'VARCHAR(10)', 'CLOB', 'BLOB', 'REAL', 'FLOAT',
    'DOUBLE PRECISION', 'NUMERIC', 'DECIMAL(10,2)', 'BOOLEAN', 'DATE', 'POINT',
    'FLOATING POINT', 'STRING']) {
    assert.equal(sqliteDeclaredTypeAffinity(type), measuredAffinity(db, type), type);
  }
  assert.equal(sqliteDeclaredTypeAffinity(''), 'BLOB', 'no declared type: BLOB affinity');
});

test('MF-1/MF-4 DDL witnesses: collation DDL injection, quoted keyword constraints, intrinsic types', () => {
  // MF-1a: Unknown and injection-shaped column collations fail closed at parse, derivation, and render.
  for (const ddl of [
    'CREATE TABLE p1 (id INT PRIMARY KEY, c TEXT COLLATE UNICODE)',
    'CREATE TABLE p2 (id INT PRIMARY KEY, c TEXT COLLATE "NOCASE); CREATE TABLE pwned (z INT); --")',
  ]) {
    assert.throws(() => catalogSchema(ddl), {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE}, ddl);
  }
  assert.throws(
    () => TableCreationService.prototype.buildSchemaDefinition([
      {name: 'id', dataType: {name: 'INTEGER'}, primaryKey: true},
      {name: 'c', dataType: {name: 'TEXT'}, collation: 'NOCASE); CREATE TABLE pwned (z INT); --'},
    ]),
    {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE},
  );
  const poisonedSchema = {
    tableName: 'safe',
    columns: [
      {name: 'id', type: 'INTEGER', collation: 'BINARY', primaryKey: true},
      {name: 'c', type: 'TEXT', collation: 'NOCASE); CREATE TABLE pwned (z INT); --'},
    ],
    primaryKey: ['id'],
    tableConstraints: [],
  };
  assert.throws(() => renderTableDefinitionSql('safe', poisonedSchema),
    {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE});
  assert.throws(() => renderTableColumnsSql('safe', poisonedSchema),
    {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE});

  // MF-1b: Quoted SQLite keywords in composite PRIMARY KEY and UNIQUE render and execute cleanly.
  const ordersSchema = catalogSchema(
    'CREATE TABLE orders (tenant INTEGER, "order" INTEGER, "select" TEXT, ' +
    'PRIMARY KEY (tenant, "order"), UNIQUE ("select"))',
  );
  const {db, sql} = partitionTableSql(ordersSchema);
  assert.match(sql, /PRIMARY KEY \(tenant, "order"\)/u);
  assert.match(sql, /UNIQUE \("select"\)/u);
  assert.equal(readPartitionServiceTableSchemaIn(db, ordersSchema).state,
    PARTITION_TABLE_OBSERVATION.COMPLETE);
  db.prepare('INSERT INTO orders (tenant, "order", "select") VALUES (1, 10, \'a\')').run();
  assert.throws(() =>
    db.prepare('INSERT INTO orders (tenant, "order", "select") VALUES (2, 20, \'a\')').run());

  // MF-4: Object.prototype property names on normalizeDataType never return prototype functions.
  for (const protoType of ['constructor', 'toString', 'valueOf', '__proto__']) {
    assert.equal(
      TableCreationService.prototype.normalizeDataType(protoType),
      protoType.toUpperCase(),
    );
  }
});
