/**
 * SQL front-end fidelity (design coordinator-sqlite-merge §2.5, WP2): the
 * parser's AST and the one renderer carry a statement exactly, or refuse it
 * with the typed UNSUPPORTED_SQL_FEATURE.
 *
 * Every equivalence is decided by SQLite: the statement as written and
 * render(parse(statement)) run on one database and must return the same
 * column names, storage classes and values.
 */

import assert from 'node:assert/strict';
import {after, test} from 'node:test';

import Database from 'better-sqlite3';

import {SQLParser} from '../../src/query/sql-parser.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {SQL_STORAGE_CLASS} from '../../src/query/parser-constants.js';
import {renderExpression, renderLiteral, renderSelect} from
  '../../src/query/sql-statement-renderer.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';

const db = new Database(':memory:');
db.defaultSafeIntegers(true);
db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, a, x TEXT, c TEXT COLLATE NOCASE, r REAL);
  INSERT INTO t VALUES (1, 1, 'a', 'A', 0.5), (2, 2.0, 'B', 'b', 1.5), (3, 3, 'a%', 'a', 2.5),
    (4, 'abc', 'A', 'B', NULL), (5, 2.5, NULL, NULL, -0.0), (6, 4, 'b ', 'b ', 3.25);
  CREATE TABLE u (k INTEGER PRIMARY KEY, v);
  INSERT INTO u VALUES (1, 10), (2, 20), (3, 30);`);
after(() => db.close());

function parse(sql, options) {
  return new SQLParser(sql, options).parse();
}

function typedRows(sql, params = []) {
  const statement = db.prepare(sql);
  return {
    columns: statement.columns().map((column) => column.name),
    rows: statement.raw(true).all(...params).map((row) => row.map((value) =>
      (value === null ? 'null' : `${typeof value}:${Object.is(value, -0) ? '-0' : value}`))),
  };
}

function assertRoundTrip(sql, params = []) {
  const rendered = renderSelect(parse(sql));
  assert.deepEqual(typedRows(rendered, params), typedRows(sql, params),
    `render(parse(Q)) differs from Q\n  Q: ${sql}\n  rendered: ${rendered}`);
  return rendered;
}

function assertTypedRefusal(sql, options) {
  assert.throws(() => parse(sql, options),
    (error) => error.code === QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, sql);
}

function selectedLiteral(sql) {
  return parse(sql).columns[0].expression;
}

test('a literal carries its storage class; its JS-visible value is unchanged', () => {
  assert.deepEqual(selectedLiteral('SELECT 2.0 FROM t'),
    {type: 'literal', value: '2.0', sqlType: SQL_STORAGE_CLASS.REAL});
  assert.deepEqual(selectedLiteral('SELECT 2 FROM t'),
    {type: 'literal', value: 2, sqlType: SQL_STORAGE_CLASS.INTEGER});
  assert.deepEqual(selectedLiteral('SELECT \'it\'\'s\' FROM t'),
    {type: 'literal', value: 'it\'s', sqlType: SQL_STORAGE_CLASS.TEXT});
  assert.deepEqual(selectedLiteral('SELECT NULL FROM t'),
    {type: 'literal', value: null, sqlType: SQL_STORAGE_CLASS.NULL});
  assert.deepEqual(selectedLiteral('SELECT TRUE FROM t'),
    {type: 'literal', value: true, sqlType: SQL_STORAGE_CLASS.INTEGER});
  assert.deepEqual(selectedLiteral('SELECT 1. FROM t'),
    {type: 'literal', value: '1', sqlType: SQL_STORAGE_CLASS.REAL});
});

test('the renderer emits each literal in its class: 2.0 stays REAL, 2 stays INTEGER', () => {
  const rendered = assertRoundTrip(
    'SELECT 2.0 AS a, 2 AS b, 1. AS c, typeof(2.0) AS d, typeof(1.) AS e, TRUE AS f FROM t');
  assert.match(rendered, /SELECT 2\.0 AS a, 2 AS b, 1\.0 AS c/u);
  // The confirmed defect: a decimal literal rendered as text returned no rows.
  assertRoundTrip('SELECT id FROM t WHERE a / 2.0 > 1.2 ORDER BY id');
  assertRoundTrip('SELECT id FROM t WHERE a BETWEEN -1 AND 2.5 ORDER BY id');
  assertRoundTrip('SELECT id, CASE WHEN 0.0 THEN a ELSE 1.2 END AS v FROM t ORDER BY id');
});

test('negative zero survives as REAL -0.0; integer -0 is 0', () => {
  const rendered = assertRoundTrip('SELECT -0.0 AS z, -0 AS i, 1 - -0.0 AS d FROM t WHERE id = 1');
  assert.deepEqual(typedRows(rendered).rows[0], ['number:-0', 'bigint:0', 'number:1']);
});

test('integer literals beyond 2^53 are refused, typed, never rounded (I3, until WP3)', () => {
  assertTypedRefusal('SELECT 9007199254740993 FROM t');
  assertTypedRefusal('SELECT -9223372036854775808 FROM t');
  assert.deepEqual(selectedLiteral('SELECT 9007199254740990 FROM t'),
    {type: 'literal', value: 9007199254740990, sqlType: SQL_STORAGE_CLASS.INTEGER});
});

test('a BLOB literal is refused, typed (until WP3); a BLOB-class node renders as X\'..\'', () => {
  assertTypedRefusal('SELECT x\'41\' FROM t');
  assert.equal(renderLiteral({type: 'literal', value: Buffer.from('AB'),
    sqlType: SQL_STORAGE_CLASS.BLOB}), 'X\'4142\'');
});

test('the renderer refuses a literal without a storage class, never guessing one', () => {
  assert.throws(() => renderExpression({type: 'literal', value: 2}),
    {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE});
});

test('COLLATE is a node in every position and is rendered, never dropped', () => {
  const where = parse('SELECT id FROM t WHERE x = \'a\' COLLATE NOCASE').where;
  assert.deepEqual(where.right, {type: 'collate', collation: 'NOCASE',
    expression: {type: 'literal', value: 'a', sqlType: SQL_STORAGE_CLASS.TEXT}});
  assertRoundTrip('SELECT id FROM t WHERE x = \'a\' COLLATE NOCASE ORDER BY id');
  assertRoundTrip('SELECT id FROM t WHERE x COLLATE NOCASE = \'A\' ORDER BY id');
  assertRoundTrip('SELECT id FROM t ORDER BY x COLLATE NOCASE DESC, id');
  assertRoundTrip('SELECT x COLLATE NOCASE AS k, COUNT(*) AS n FROM t ' +
    'GROUP BY x COLLATE NOCASE ORDER BY 1, 2');
  assertRoundTrip('SELECT COUNT(DISTINCT x COLLATE NOCASE) AS n, MIN(x COLLATE NOCASE) AS m FROM t');
});

test('LIKE ... ESCAPE is carried and rendered', () => {
  const like = parse('SELECT id FROM t WHERE x LIKE \'a!%\' ESCAPE \'!\'').where;
  assert.deepEqual(like.escape, {type: 'literal', value: '!', sqlType: SQL_STORAGE_CLASS.TEXT});
  assertRoundTrip('SELECT id FROM t WHERE x LIKE \'a!%\' ESCAPE \'!\' ORDER BY id');
  assertRoundTrip('SELECT id FROM t WHERE x NOT LIKE \'a!%\' ESCAPE \'!\' ORDER BY id');
});

test('result columns are named as SQLite names them: alias, column, or source span', () => {
  const rendered = assertRoundTrip('SELECT Sum( a ), lower( "x" ), a+1, -0.0, ' +
    'x COLLATE NOCASE, CAST(a AS TEXT), t.id, (x), count(*) /* c */ FROM t');
  assert.match(rendered, /SUM\(a\) AS "Sum\( a \)"/u);
  assertRoundTrip('SELECT * FROM (SELECT Sum( a ), x FROM t GROUP BY x) ORDER BY 2');
  assertRoundTrip('WITH c(p, q) AS (SELECT a+1, x FROM t) SELECT q, p FROM c ORDER BY 1, 2');
  assertRoundTrip('SELECT a+1 FROM t UNION ALL SELECT v * 2 FROM u ORDER BY 1');
  assertRoundTrip('SELECT a IS NULL, NULL, CURRENT_DATE IS NOT NULL FROM t ORDER BY 1');
});

test('LIMIT and OFFSET accept parameters, bound in text order; LIMIT m, n is OFFSET m', () => {
  assert.deepEqual(parse('SELECT id FROM t ORDER BY id LIMIT ? OFFSET ?').limit,
    {count: {type: 'parameter', index: 0}, offset: {type: 'parameter', index: 1}});
  assert.deepEqual(parse('SELECT id FROM t WHERE id > ? LIMIT ?, ?').limit,
    {count: {type: 'parameter', index: 2}, offset: {type: 'parameter', index: 1}});
  assert.deepEqual(parse('SELECT id FROM t LIMIT 2, 3').limit, {count: 3, offset: 2});
  assertRoundTrip('SELECT id FROM t ORDER BY id LIMIT 2, 3');
  assertRoundTrip('SELECT id FROM t ORDER BY id LIMIT ? OFFSET ?', [2n, 1n]);
  assertRoundTrip('SELECT id FROM t WHERE id > ? ORDER BY id LIMIT ?, ?', [1n, 1n, 2n]);
  assertTypedRefusal('SELECT id FROM t LIMIT :__lagrange_limit_parameter');
});

test('constructs the front end used to rewrite are carried exactly', () => {
  // A double-quoted token is an identifier (this build has SQLITE_DQS=0).
  assert.deepEqual(parse('SELECT "x" FROM t').columns[0].expression,
    {type: 'column_ref', table: null, column: 'x'});
  assertRoundTrip('SELECT "x", id FROM t WHERE "x" = \'a\' ORDER BY id');
  // concat() is not PostgreSQL's ||: NULL arguments are skipped.
  assertRoundTrip('SELECT concat(x, a) AS v FROM t ORDER BY id');
  // CAST keeps its declared type: NUMERIC is not REAL.
  assertRoundTrip('SELECT CAST(\'1.0\' AS NUMERIC) AS n, typeof(CAST(\'1\' AS NUMERIC)) AS tn, ' +
    'CAST(a AS VARCHAR(10)) AS s FROM t ORDER BY id');
  assert.equal(parse('SELECT CAST(a AS NUMERIC) FROM t').columns[0].expression.affinity, 'NUMERIC');
  assertRoundTrip('SELECT id FROM t WHERE a NOT BETWEEN 1 AND 2 ORDER BY id');
  assertRoundTrip('SELECT t.* FROM t JOIN u ON t.id = u.k ORDER BY t.id');
  assertRoundTrip('SELECT id FROM t WHERE id IN (SELECT k + 1 FROM u) ORDER BY id');
  assertRoundTrip('SELECT CURRENT_TIMESTAMP IS NOT NULL AS v FROM t WHERE id = 1');
  assertRoundTrip('SELECT 1 AS c0 LIMIT 0');
});

test('syntax the AST cannot carry is refused, typed, never dropped', () => {
  for (const sql of [
    'SELECT count(*) OVER (PARTITION BY x) FROM t',
    'SELECT x FROM t, u',
    'SELECT x FROM t JOIN u USING (k)',
    'SELECT x FROM t NATURAL JOIN u',
    'SELECT x FROM t CROSS JOIN u',
    'SELECT x FROM main.t',
    'SELECT x IS \'a\' FROM t',
    'SELECT x FROM t WHERE x = :named',
  ]) {
    assertTypedRefusal(sql);
  }
});

test('SQLite decides whether unparsed text is SQL: valid SQLite is a typed refusal', () => {
  for (const sql of ['SELECT a GLOB x FROM t', 'SELECT a IS DISTINCT FROM x FROM t',
    'SELECT SUM(DISTINCT a) FROM t', 'SELECT x FROM t EXCEPT SELECT v FROM u',
    'SELECT row_number() OVER (ORDER BY id) FROM t']) {
    assertTypedRefusal(sql);
  }
  for (const sql of ['SELEC 1', 'SELECT FROM WHERE', 'SELECT (1']) {
    assert.throws(() => parse(sql), (error) =>
      error.code !== QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, sql);
  }
  // PostgreSQL mode keeps its own grammar: no SQLite verdict.
  assert.throws(() => parse('SELECT a GLOB x FROM t', {dialect: PARSER_DIALECT.POSTGRESQL}),
    (error) => error.code !== QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
});

test('CREATE TABLE carries column collation and accepts an untyped column', () => {
  const ast = parse('CREATE TABLE g (id INTEGER PRIMARY KEY, name TEXT COLLATE NOCASE, ' +
    'tail TEXT COLLATE "rtrim", un, c TEXT CHECK (c COLLATE NOCASE <> \'x\'))');
  assert.deepEqual(ast.columns.map((column) => [column.name, column.collation,
    column.dataType?.name ?? null]), [['id', null, 'INTEGER'], ['name', 'NOCASE', 'TEXT'],
    ['tail', 'RTRIM', 'TEXT'], ['un', null, null], ['c', null, 'TEXT']]);
  assert.equal(ast.columns[4].checkSql, '((c COLLATE NOCASE) <> \'x\')');
});
