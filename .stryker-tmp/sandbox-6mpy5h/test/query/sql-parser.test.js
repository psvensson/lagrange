/**
 * SQL Parser Tests
 * Tests for the SQL parser using node-sql-parser.
 * Requirements: 7.1, 7.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

test('SQLParser - parses simple SELECT', async (t) => {
  const parser = new SQLParser('SELECT * FROM users');
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.equal(ast.columns.length, 1);
  t.equal(ast.columns[0].type, 'star');
  t.equal(ast.from.name, 'users');
});

test('SQLParser - parses SELECT with columns', async (t) => {
  const parser = new SQLParser('SELECT id, name, email FROM users');
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.equal(ast.columns.length, 3);
  t.equal(ast.columns[0].expression.column, 'id');
  t.equal(ast.columns[1].expression.column, 'name');
  t.equal(ast.columns[2].expression.column, 'email');
});

test('SQLParser - parses SELECT with WHERE', async (t) => {
  const parser = new SQLParser('SELECT * FROM users WHERE id = \'user-1\'');
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.ok(ast.where);
  t.equal(ast.where.type, 'binary');
  t.equal(ast.where.operator, '=');
  t.equal(ast.where.left.column, 'id');
  t.equal(ast.where.right.value, 'user-1');
});

test('SQLParser - parses SELECT with ORDER BY', async (t) => {
  const parser = new SQLParser('SELECT * FROM users ORDER BY name ASC, id DESC');
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.ok(ast.orderBy);
  t.equal(ast.orderBy.length, 2);
  t.equal(ast.orderBy[0].expression.column, 'name');
  t.equal(ast.orderBy[0].direction, 'ASC');
  t.equal(ast.orderBy[1].expression.column, 'id');
  t.equal(ast.orderBy[1].direction, 'DESC');
});

test('SQLParser - parses SELECT with LIMIT', async (t) => {
  const parser = new SQLParser('SELECT * FROM users LIMIT 10 OFFSET 20');
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.ok(ast.limit);
  t.equal(ast.limit.count, 10);
  t.equal(ast.limit.offset, 20);
});

test('SQLParser - parses SELECT with GROUP BY', async (t) => {
  const parser = new SQLParser('SELECT status, COUNT(*) FROM tasks GROUP BY status');
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.ok(ast.groupBy);
  t.equal(ast.groupBy.length, 1);
  t.equal(ast.groupBy[0].column, 'status');
});

test('SQLParser - parses SELECT with aggregate functions', async (t) => {
  const parser = new SQLParser('SELECT COUNT(*), SUM(amount), AVG(price) FROM orders');
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.equal(ast.columns.length, 3);
  t.equal(ast.columns[0].expression.type, 'aggregate');
  t.equal(ast.columns[0].expression.function, 'COUNT');
  t.equal(ast.columns[1].expression.function, 'SUM');
  t.equal(ast.columns[2].expression.function, 'AVG');
});

test('SQLParser - parses SELECT with JOIN', async (t) => {
  const parser = new SQLParser(
    'SELECT u.name, o.total FROM users u ' +
    'INNER JOIN orders o ON u.id = o.user_id',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.equal(ast.joins.length, 1);
  t.equal(ast.joins[0].joinType, 'INNER');
  t.equal(ast.joins[0].table.name, 'orders');
  t.equal(ast.joins[0].table.alias, 'o');
});

test('SQLParser - parses SELECT with LEFT JOIN', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users LEFT JOIN orders ON users.id = orders.user_id',
  );
  const ast = parser.parse();

  t.equal(ast.joins.length, 1);
  t.equal(ast.joins[0].joinType, 'LEFT');
});

test('SQLParser - parses SELECT with IN clause', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE id IN (\'a\', \'b\', \'c\')',
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'in');
  t.equal(ast.where.values.length, 3);
});

test('SQLParser - parses SELECT with NOT IN clause', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE status NOT IN (\'deleted\', \'banned\')',
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'in');
  t.equal(ast.where.negated, true);
  t.equal(ast.where.values.length, 2);
});

test('SQLParser - parses SELECT with BETWEEN', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM items WHERE price BETWEEN 10 AND 100',
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'between');
  t.equal(ast.where.low.value, 10);
  t.equal(ast.where.high.value, 100);
});

test('SQLParser - parses INSERT statement', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'user-1\', \'John\')',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.table, 'users');
  t.same(ast.columns, ['id', 'name']);
  t.equal(ast.values.length, 1);
  t.equal(ast.values[0][0].value, 'user-1');
  t.equal(ast.values[0][1].value, 'John');
});

test('SQLParser - parses INSERT with multiple rows', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\'), (\'b\', \'Bob\')',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.values.length, 2);
});

test('SQLParser - preserves INSERT OR REPLACE modifier', async (t) => {
  const parser = new SQLParser(
    'INSERT OR REPLACE INTO users (id, name) VALUES (\'a\', \'Alice\')',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.orReplace, true);
  t.equal(ast.orIgnore, false);
});

test('SQLParser - preserves INSERT OR IGNORE modifier', async (t) => {
  const parser = new SQLParser(
    'INSERT OR IGNORE INTO users (id, name) VALUES (\'a\', \'Alice\')',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.orIgnore, true);
  t.equal(ast.orReplace, false);
});

test('SQLParser - parses UPDATE statement', async (t) => {
  const parser = new SQLParser(
    'UPDATE users SET name = \'Jane\' WHERE id = \'user-1\'',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'UPDATE');
  t.equal(ast.table, 'users');
  t.equal(ast.assignments.length, 1);
  t.equal(ast.assignments[0].column, 'name');
  t.equal(ast.assignments[0].value.value, 'Jane');
  t.ok(ast.where);
});

test('SQLParser - parses UPDATE with multiple assignments', async (t) => {
  const parser = new SQLParser(
    'UPDATE users SET name = \'Jane\', status = \'active\' WHERE id = \'user-1\'',
  );
  const ast = parser.parse();

  t.equal(ast.assignments.length, 2);
  t.equal(ast.assignments[0].column, 'name');
  t.equal(ast.assignments[1].column, 'status');
});

test('SQLParser - parses DELETE statement', async (t) => {
  const parser = new SQLParser('DELETE FROM users WHERE id = \'user-1\'');
  const ast = parser.parse();

  t.equal(ast.type, 'DELETE');
  t.equal(ast.table, 'users');
  t.ok(ast.where);
});

test('SQLParser - parses DELETE without WHERE', async (t) => {
  const parser = new SQLParser('DELETE FROM temp_data');
  const ast = parser.parse();

  t.equal(ast.type, 'DELETE');
  t.equal(ast.table, 'temp_data');
  t.equal(ast.where, null);
});

test('SQLParser - parses ALTER TABLE ADD COLUMN', async (t) => {
  const parser = new SQLParser(
    'ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 42',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'ALTER_TABLE');
  t.equal(ast.table, 'users');
  t.equal(ast.operation.action, 'add');
  t.equal(ast.operation.columnName, 'age');
  t.equal(ast.operation.dataType, 'INTEGER');
  t.equal(ast.operation.defaultValue, 42);
  t.match(ast.rawSql, /ALTER TABLE users ADD COLUMN age/i);
});

test('SQLParser - parses ALTER TABLE RENAME COLUMN', async (t) => {
  const parser = new SQLParser(
    'ALTER TABLE users RENAME COLUMN name TO full_name',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'ALTER_TABLE');
  t.equal(ast.table, 'users');
  t.equal(ast.operation.action, 'rename');
  t.equal(ast.operation.columnName, 'name');
  t.equal(ast.operation.newColumnName, 'full_name');
});

test('SQLParser - parses ALTER COLUMN TYPE in PostgreSQL mode', async (t) => {
  const parser = new SQLParser(
    'ALTER TABLE users ALTER COLUMN age TYPE TEXT',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'ALTER_TABLE');
  t.equal(ast.table, 'users');
  t.equal(ast.operation.action, 'alter');
  t.equal(ast.operation.columnName, 'age');
  t.equal(ast.operation.dataType, 'TEXT');
});

test('SQLParser - parses complex WHERE with AND/OR', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE status = \'active\' AND (role = \'admin\' OR role = \'mod\')',
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'binary');
  t.equal(ast.where.operator, 'AND');
});

test('SQLParser - parses IS NULL', async (t) => {
  const parser = new SQLParser('SELECT * FROM users WHERE deleted_at IS NULL');
  const ast = parser.parse();

  t.equal(ast.where.operator, 'IS NULL');
});

test('SQLParser - parses IS NOT NULL', async (t) => {
  const parser = new SQLParser('SELECT * FROM users WHERE email IS NOT NULL');
  const ast = parser.parse();

  t.equal(ast.where.operator, 'IS NOT NULL');
});

test('SQLParser - parses DISTINCT', async (t) => {
  const parser = new SQLParser('SELECT DISTINCT status FROM users');
  const ast = parser.parse();

  t.equal(ast.distinct, true);
});

test('SQLParser - parses column aliases', async (t) => {
  const parser = new SQLParser('SELECT name AS user_name FROM users');
  const ast = parser.parse();

  t.equal(ast.columns[0].alias, 'user_name');
});

test('SQLParser - parses table aliases', async (t) => {
  const parser = new SQLParser('SELECT u.name FROM users AS u');
  const ast = parser.parse();

  t.equal(ast.from.alias, 'u');
});

test('SQLParser - parses qualified column names', async (t) => {
  const parser = new SQLParser('SELECT users.name FROM users');
  const ast = parser.parse();

  t.equal(ast.columns[0].expression.table, 'users');
  t.equal(ast.columns[0].expression.column, 'name');
});

test('SQLParser - parses BEGIN TRANSACTION', async (t) => {
  const parser = new SQLParser('BEGIN TRANSACTION');
  const ast = parser.parse();

  t.equal(ast.type, 'BEGIN_TRANSACTION');
});

test('SQLParser - parses COMMIT', async (t) => {
  const parser = new SQLParser('COMMIT');
  const ast = parser.parse();

  t.equal(ast.type, 'COMMIT');
});

test('SQLParser - parses ROLLBACK', async (t) => {
  const parser = new SQLParser('ROLLBACK');
  const ast = parser.parse();

  t.equal(ast.type, 'ROLLBACK');
});

test('SQLParser - handles semicolon at end', async (t) => {
  const parser = new SQLParser('SELECT * FROM users;');
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
});

test('SQLParser - throws on invalid SQL', async (t) => {
  const parser = new SQLParser('INVALID SQL STATEMENT');

  t.throws(() => parser.parse());
});

test('SQLParser - parses HAVING clause', async (t) => {
  const parser = new SQLParser(
    'SELECT status, COUNT(*) as cnt FROM tasks ' +
    'GROUP BY status HAVING COUNT(*) > 5',
  );
  const ast = parser.parse();

  t.ok(ast.having);
  t.equal(ast.having.type, 'binary');
  t.equal(ast.having.operator, '>');
});

test('SQLParser - parses LIKE clause', async (t) => {
  const parser = new SQLParser('SELECT * FROM users WHERE name LIKE \'J%\'');
  const ast = parser.parse();

  t.equal(ast.where.type, 'like');
  t.equal(ast.where.pattern.value, 'J%');
});

test('SQLParser - parses negative numbers', async (t) => {
  const parser = new SQLParser('SELECT * FROM items WHERE balance < -100');
  const ast = parser.parse();

  t.equal(ast.where.right.value, -100);
});

test('SQLParser - parses boolean values', async (t) => {
  const parser = new SQLParser('SELECT * FROM users WHERE active = TRUE');
  const ast = parser.parse();

  t.equal(ast.where.right.value, true);
});

test('SQLParser - parses NULL values', async (t) => {
  const parser = new SQLParser('INSERT INTO users (id, email) VALUES (\'a\', NULL)');
  const ast = parser.parse();

  t.equal(ast.values[0][1].value, null);
});

test('SQLParser - parses parameter placeholders', async (t) => {
  const parser = new SQLParser('SELECT * FROM users WHERE id = ?');
  const ast = parser.parse();

  t.equal(ast.where.right.type, 'parameter');
});

// --- Subquery and derived table tests (Requirements: 9.1, 9.2, 9.3, 12.1) ---

test('SQLParser - parses IN subquery in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)',
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'in');
  t.equal(ast.where.negated, false);
  t.ok(ast.where.subquery);
  t.equal(ast.where.subquery.type, 'subquery');
  t.equal(ast.where.subquery.query.type, 'SELECT');
  t.equal(ast.where.subquery.query.from.name, 'orders');
});

test('SQLParser - parses NOT IN subquery in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders)',
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'in');
  t.equal(ast.where.negated, true);
  t.ok(ast.where.subquery);
  t.equal(ast.where.subquery.type, 'subquery');
  t.equal(ast.where.subquery.query.type, 'SELECT');
});

test('SQLParser - parses scalar subquery in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE age = (SELECT MAX(age) FROM users)',
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'binary');
  t.equal(ast.where.operator, '=');
  t.equal(ast.where.right.type, 'subquery');
  t.equal(ast.where.right.query.type, 'SELECT');
});

test('SQLParser - parses derived table in FROM in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'SELECT t.id FROM (SELECT id, name FROM users) AS t',
  );
  const ast = parser.parse();

  t.equal(ast.from.type, 'table');
  t.equal(ast.from.name, null);
  t.equal(ast.from.alias, 't');
  t.ok(ast.from.subquery);
  t.equal(ast.from.subquery.type, 'SELECT');
  t.equal(ast.from.subquery.from.name, 'users');
  t.equal(ast.from.subquery.columns.length, 2);
});

test('SQLParser - parses IN subquery in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'in');
  t.equal(ast.where.negated, false);
  t.ok(ast.where.subquery);
  t.equal(ast.where.subquery.type, 'subquery');
  t.equal(ast.where.subquery.query.type, 'SELECT');
  t.equal(ast.where.subquery.query.from.name, 'orders');
});

test('SQLParser - parses NOT IN subquery in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders)',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'in');
  t.equal(ast.where.negated, true);
  t.ok(ast.where.subquery);
  t.equal(ast.where.subquery.query.type, 'SELECT');
});

test('SQLParser - parses scalar subquery in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE age = (SELECT MAX(age) FROM users)',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'binary');
  t.equal(ast.where.operator, '=');
  t.equal(ast.where.right.type, 'subquery');
  t.equal(ast.where.right.query.type, 'SELECT');
});

test('SQLParser - parses EXISTS subquery in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE EXISTS ' +
    '(SELECT 1 FROM orders WHERE orders.user_id = users.id)',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'exists');
  t.ok(ast.where.query);
  t.equal(ast.where.query.type, 'SELECT');
  t.equal(ast.where.query.from.name, 'orders');
});

test('SQLParser - parses derived table in FROM in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT t.id FROM (SELECT id, name FROM users) AS t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.from.type, 'table');
  t.equal(ast.from.name, null);
  t.equal(ast.from.alias, 't');
  t.ok(ast.from.subquery);
  t.equal(ast.from.subquery.type, 'SELECT');
  t.equal(ast.from.subquery.from.name, 'users');
});

test('SQLParser - IN subquery preserves values list for non-subquery',
  async (t) => {
    const parser = new SQLParser(
      'SELECT * FROM users WHERE id IN (\'a\', \'b\', \'c\')',
    );
    const ast = parser.parse();

    t.equal(ast.where.type, 'in');
    t.equal(ast.where.subquery, undefined);
    t.equal(ast.where.values.length, 3);
  });

test('SQLParser - scalar subquery with comparison operators',
  async (t) => {
    const parser = new SQLParser(
      'SELECT * FROM items WHERE price > (SELECT AVG(price) FROM items)',
    );
    const ast = parser.parse();

    t.equal(ast.where.type, 'binary');
    t.equal(ast.where.operator, '>');
    t.equal(ast.where.right.type, 'subquery');
    t.equal(ast.where.right.query.type, 'SELECT');
  });

test('SQLParser - derived table subquery has correct inner columns',
  async (t) => {
    const parser = new SQLParser(
      'SELECT t.x FROM (SELECT id AS x FROM users) AS t',
    );
    const ast = parser.parse();

    t.equal(ast.from.subquery.columns.length, 1);
    t.equal(ast.from.subquery.columns[0].alias, 'x');
  });

// --- CTE (WITH clause) tests (Requirements: 10.1, 10.2, 10.3) ---

test('SQLParser - parses simple CTE in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'WITH cte AS (SELECT 1 AS x) SELECT * FROM cte',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.ok(ast.ctes);
  t.equal(ast.ctes.length, 1);
  t.equal(ast.ctes[0].name, 'cte');
  t.equal(ast.ctes[0].query.type, 'SELECT');
  t.equal(ast.ctes[0].recursive, false);
  t.equal(ast.recursive, false);
  t.equal(ast.from.name, 'cte');
});

test('SQLParser - parses multiple CTEs in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y) ' +
    'SELECT * FROM a, b',
  );
  const ast = parser.parse();

  t.equal(ast.ctes.length, 2);
  t.equal(ast.ctes[0].name, 'a');
  t.equal(ast.ctes[1].name, 'b');
  t.equal(ast.ctes[0].query.type, 'SELECT');
  t.equal(ast.ctes[1].query.type, 'SELECT');
});

test('SQLParser - parses simple CTE in PG mode', async (t) => {
  const parser = new SQLParser(
    'WITH cte AS (SELECT 1 AS x) SELECT * FROM cte',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.ok(ast.ctes);
  t.equal(ast.ctes.length, 1);
  t.equal(ast.ctes[0].name, 'cte');
  t.equal(ast.ctes[0].query.type, 'SELECT');
  t.equal(ast.ctes[0].recursive, false);
  t.equal(ast.recursive, false);
  t.equal(ast.from.name, 'cte');
});

test('SQLParser - parses WITH RECURSIVE in PG mode', async (t) => {
  const parser = new SQLParser(
    'WITH RECURSIVE cte AS (' +
    'SELECT 1 AS x UNION ALL SELECT x + 1 FROM cte WHERE x < 10' +
    ') SELECT * FROM cte',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.ok(ast.ctes);
  t.equal(ast.ctes.length, 1);
  t.equal(ast.ctes[0].name, 'cte');
  t.equal(ast.ctes[0].recursive, true);
  t.equal(ast.recursive, true);
  t.equal(ast.ctes[0].query.type, 'SELECT');
});

test('SQLParser - parses multiple CTEs in PG mode', async (t) => {
  const parser = new SQLParser(
    'WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y) ' +
    'SELECT * FROM a, b',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.ctes.length, 2);
  t.equal(ast.ctes[0].name, 'a');
  t.equal(ast.ctes[1].name, 'b');
  t.equal(ast.ctes[0].query.type, 'SELECT');
  t.equal(ast.ctes[1].query.type, 'SELECT');
});

test('SQLParser - no CTE returns null ctes', async (t) => {
  const parser = new SQLParser('SELECT * FROM users');
  const ast = parser.parse();

  t.equal(ast.ctes, null);
  t.equal(ast.recursive, false);
});

// --- Set operation tests (Requirements: 13.1) ---

test('SQLParser - parses UNION in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'SELECT 1 AS x UNION SELECT 2 AS x',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.ok(ast.setOperation);
  t.equal(ast.setOperation.type, 'UNION');
  t.ok(ast.setOperation.right);
  t.equal(ast.setOperation.right.type, 'SELECT');
});

test('SQLParser - parses UNION ALL in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'SELECT 1 AS x UNION ALL SELECT 2 AS x',
  );
  const ast = parser.parse();

  t.ok(ast.setOperation);
  t.equal(ast.setOperation.type, 'UNION ALL');
  t.equal(ast.setOperation.right.type, 'SELECT');
});

test('SQLParser - parses UNION in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT 1 AS x UNION SELECT 2 AS x',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'SELECT');
  t.ok(ast.setOperation);
  t.equal(ast.setOperation.type, 'UNION');
  t.ok(ast.setOperation.right);
  t.equal(ast.setOperation.right.type, 'SELECT');
});

test('SQLParser - parses UNION ALL in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT 1 AS x UNION ALL SELECT 2 AS x',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.ok(ast.setOperation);
  t.equal(ast.setOperation.type, 'UNION ALL');
  t.equal(ast.setOperation.right.type, 'SELECT');
});

test('SQLParser - parses INTERSECT in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT 1 AS x INTERSECT SELECT 1 AS x',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.ok(ast.setOperation);
  t.equal(ast.setOperation.type, 'INTERSECT');
  t.equal(ast.setOperation.right.type, 'SELECT');
});

test('SQLParser - parses EXCEPT in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT 1 AS x EXCEPT SELECT 2 AS x',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.ok(ast.setOperation);
  t.equal(ast.setOperation.type, 'EXCEPT');
  t.equal(ast.setOperation.right.type, 'SELECT');
});

test('SQLParser - parses chained UNION in PG mode', async (t) => {
  const parser = new SQLParser(
    'SELECT 1 AS x UNION SELECT 2 AS x UNION SELECT 3 AS x',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.ok(ast.setOperation);
  t.equal(ast.setOperation.type, 'UNION');
  t.ok(ast.setOperation.right.setOperation);
  t.equal(ast.setOperation.right.setOperation.type, 'UNION');
  t.equal(ast.setOperation.right.setOperation.right.type, 'SELECT');
});

test('SQLParser - no set operation returns null', async (t) => {
  const parser = new SQLParser('SELECT * FROM users');
  const ast = parser.parse();

  t.equal(ast.setOperation, null);
});

test('SQLParser - CTE inner query with set operation in PG mode',
  async (t) => {
    const parser = new SQLParser(
      'WITH RECURSIVE cte AS (' +
      'SELECT 1 AS x UNION ALL SELECT x + 1 FROM cte WHERE x < 5' +
      ') SELECT * FROM cte',
      {dialect: PARSER_DIALECT.POSTGRESQL},
    );
    const ast = parser.parse();

    t.ok(ast.ctes);
    t.equal(ast.ctes[0].query.type, 'SELECT');
    t.ok(ast.ctes[0].query.setOperation);
    t.equal(ast.ctes[0].query.setOperation.type, 'UNION ALL');
  });

// --- RETURNING clause tests (Requirements: 3.1) ---

test('SQLParser - INSERT RETURNING * in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') RETURNING *',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.table, 'users');
  t.equal(ast.returning, '*');
});

test('SQLParser - INSERT RETURNING columns in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') RETURNING id, name',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.same(ast.returning, ['id', 'name']);
});

test('SQLParser - INSERT without RETURNING in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\')',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.returning, null);
});

test('SQLParser - UPDATE RETURNING * in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\' RETURNING *',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'UPDATE');
  t.equal(ast.returning, '*');
});

test('SQLParser - UPDATE RETURNING columns in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\' RETURNING id, name',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'UPDATE');
  t.same(ast.returning, ['id', 'name']);
});

test('SQLParser - UPDATE without RETURNING', async (t) => {
  const parser = new SQLParser(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\'',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'UPDATE');
  t.equal(ast.returning, null);
});

test('SQLParser - DELETE RETURNING * in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'DELETE FROM users WHERE id = \'a\' RETURNING *',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'DELETE');
  t.equal(ast.returning, '*');
});

test('SQLParser - DELETE RETURNING columns in SQLite mode', async (t) => {
  const parser = new SQLParser(
    'DELETE FROM users WHERE id = \'a\' RETURNING id, name',
  );
  const ast = parser.parse();

  t.equal(ast.type, 'DELETE');
  t.same(ast.returning, ['id', 'name']);
});

test('SQLParser - DELETE without RETURNING', async (t) => {
  const parser = new SQLParser('DELETE FROM users WHERE id = \'a\'');
  const ast = parser.parse();

  t.equal(ast.type, 'DELETE');
  t.equal(ast.returning, null);
});

test('SQLParser - INSERT RETURNING * in PG mode', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') RETURNING *',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.returning, '*');
});

test('SQLParser - INSERT RETURNING columns in PG mode', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') RETURNING id, name',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.same(ast.returning, ['id', 'name']);
});

test('SQLParser - UPDATE RETURNING * in PG mode', async (t) => {
  const parser = new SQLParser(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\' RETURNING *',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'UPDATE');
  t.equal(ast.returning, '*');
});

test('SQLParser - DELETE RETURNING columns in PG mode', async (t) => {
  const parser = new SQLParser(
    'DELETE FROM users WHERE id = \'a\' RETURNING id, name',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'DELETE');
  t.same(ast.returning, ['id', 'name']);
});

test('SQLParser - INSERT ON CONFLICT DO NOTHING in PG mode', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') ' +
    'ON CONFLICT (id) DO NOTHING',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.table, 'users');
  t.equal(ast.orIgnore, true);
  t.equal(ast.orReplace, false);
});

test('SQLParser - INSERT ON CONFLICT DO UPDATE in PG mode', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') ' +
    'ON CONFLICT (id) DO UPDATE SET name = \'Bob\'',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.table, 'users');
  t.equal(ast.orReplace, true);
  t.equal(ast.orIgnore, false);
});

test('SQLParser - INSERT without ON CONFLICT in PG mode', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\')',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  t.equal(ast.orIgnore, false);
  t.equal(ast.orReplace, false);
});

test('SQLParser - SQLite INSERT OR REPLACE unchanged in default mode',
  async (t) => {
    const parser = new SQLParser(
      'INSERT OR REPLACE INTO users (id, name) ' +
      'VALUES (\'a\', \'Alice\')',
    );
    const ast = parser.parse();

    t.equal(ast.type, 'INSERT');
    t.equal(ast.orReplace, true);
    t.equal(ast.orIgnore, false);
  });

test('SQLParser - SQLite INSERT OR IGNORE unchanged in default mode',
  async (t) => {
    const parser = new SQLParser(
      'INSERT OR IGNORE INTO users (id, name) ' +
      'VALUES (\'a\', \'Alice\')',
    );
    const ast = parser.parse();

    t.equal(ast.type, 'INSERT');
    t.equal(ast.orIgnore, true);
    t.equal(ast.orReplace, false);
  });
