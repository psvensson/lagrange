/**
 * SQL Parser Tests
 * Tests for the SQL parser using node-sql-parser.
 * Requirements: 7.1, 7.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLParser} from '../../src/query/sql-parser.js';

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
