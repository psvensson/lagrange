/**
 * SQLParser PG-mode unit tests.
 * Tests PG-specific syntax that is NOT already covered in sql-parser.test.js.
 * Requirements: 1.4, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2,
 *               9.1, 9.2, 9.3, 10.1, 10.3, 11.1, 11.2,
 *               12.1, 13.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLParser, EXPR_TYPE} from '../../src/query/sql-parser.js';
import {
  PARSER_DIALECT,
  PG_EXPR_TYPE,
} from '../../src/query/pg/pg-compat-constants.js';
import {validateParamMapping} from '../../src/query/pg/pg-translate.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

test('PG mode - CREATE TABLE projects schema identifiers as strings',
  async (t) => {
    const parser = new SQLParser(
      'CREATE TABLE "global.request_binding_audit" ' +
        '(key INTEGER PRIMARY KEY, value INTEGER)',
      {dialect: PARSER_DIALECT.POSTGRESQL},
    );
    const ast = parser.parse();

    t.equal(ast.tableName, 'global.request_binding_audit');
    t.same(ast.columns.map((column) => column.name), ['key', 'value']);
    t.same(ast.primaryKey, ['key']);
  },
);

test('PG mode - SELECT without LIMIT omits the parser sentinel',
  async (t) => {
    const ast = new SQLParser(
      'SELECT key FROM "global.request_binding_audit"',
      {dialect: PARSER_DIALECT.POSTGRESQL},
    ).parse();

    t.equal(ast.limit, null);
  },
);

test('PG mode - parameterized LIMIT fails instead of becoming unbounded',
  async (t) => {
    t.throws(
      () => new SQLParser(
        'SELECT key FROM "global.request_binding_audit" LIMIT $1',
        {dialect: PARSER_DIALECT.POSTGRESQL},
      ).parse(),
      /LIMIT count must be an integer literal/u,
    );
  },
);

test('PG mode - LIMIT ALL is the explicit unbounded form', async (t) => {
  const ast = new SQLParser(
    'SELECT key FROM "global.request_binding_audit" LIMIT ALL',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  ).parse();

  t.equal(ast.limit, null);
});

test('PG mode - LIMIT ALL with OFFSET fails instead of dropping OFFSET',
  async (t) => {
    t.throws(
      () => new SQLParser(
        'SELECT key FROM "global.request_binding_audit" LIMIT ALL OFFSET 5',
        {dialect: PARSER_DIALECT.POSTGRESQL},
      ).parse(),
      /LIMIT ALL with OFFSET is unsupported/u,
    );
  },
);

test('PG mode - OFFSET without LIMIT fails instead of becoming LIMIT',
  async (t) => {
    t.throws(
      () => new SQLParser(
        'SELECT key FROM "global.request_binding_audit" OFFSET 5',
        {dialect: PARSER_DIALECT.POSTGRESQL},
      ).parse(),
      /OFFSET without LIMIT is unsupported/u,
    );
  },
);

test('PG mode - INSERT and UPDATE project identifiers as strings',
  async (t) => {
    const insert = new SQLParser(
      'INSERT INTO wasm_operations (operation_id, tenant_id) VALUES ($1, $2)',
      {dialect: PARSER_DIALECT.POSTGRESQL},
    ).parse();
    const update = new SQLParser(
      'UPDATE wasm_operations SET state = $1, updated_at = $2 ' +
        'WHERE operation_id = $3',
      {dialect: PARSER_DIALECT.POSTGRESQL},
    ).parse();

    t.same(insert.columns, ['operation_id', 'tenant_id']);
    t.same(
      update.assignments.map((assignment) => assignment.column),
      ['state', 'updated_at'],
    );
  },
);

// --- Positional parameter tests (Requirements: 2.1, 2.2, 2.3, 2.4) ---

test('PG mode - $1 positional param produces parameter node', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE id = $1',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.type, 'binary');
  t.equal(ast.where.right.type, EXPR_TYPE.PARAMETER);
  t.ok(ast._paramMapping);
  t.same(ast._paramMapping, [1]);
});

test('PG mode - multiple params in order', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM t WHERE a = $1 AND b = $2',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.same(ast._paramMapping, [1, 2]);
});

test('PG mode - params in reverse order', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM t WHERE a = $2 AND b = $1',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.same(ast._paramMapping, [2, 1]);
});

test('PG mode - three params out of order', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM t WHERE a = $3 AND b = $1 AND c = $2',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.same(ast._paramMapping, [3, 1, 2]);
});

// --- Type cast tests (Requirements: 6.1, 6.2) ---

test('PG mode - ::text cast produces cast node', async (t) => {
  const parser = new SQLParser(
    'SELECT name::text FROM users',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.CAST);
  t.equal(col.affinity, 'TEXT');
  t.ok(col.expression);
});

test('PG mode - ::integer cast produces INTEGER affinity', async (t) => {
  const parser = new SQLParser(
    'SELECT price::integer FROM items',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.CAST);
  t.equal(col.affinity, 'INTEGER');
});

test('PG mode - CAST(x AS varchar) produces TEXT affinity', async (t) => {
  const parser = new SQLParser(
    'SELECT CAST(id AS varchar) FROM users',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.CAST);
  t.equal(col.affinity, 'TEXT');
});

// --- ILIKE tests (Requirements: 14.1, 14.2) ---

test('PG mode - ILIKE produces LIKE with LOWER wrapping', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE name ILIKE \'%test%\'',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.type, EXPR_TYPE.LIKE);
  t.equal(ast.where.negated, false);
  t.equal(ast.where.expression.type, PG_EXPR_TYPE.FUNCTION_CALL);
  t.equal(ast.where.expression.name, 'lower');
  t.equal(ast.where.pattern.type, PG_EXPR_TYPE.FUNCTION_CALL);
  t.equal(ast.where.pattern.name, 'lower');
});

test('PG mode - NOT ILIKE produces negated LIKE with LOWER', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE name NOT ILIKE \'%test%\'',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.type, EXPR_TYPE.LIKE);
  t.equal(ast.where.negated, true);
  t.equal(ast.where.expression.type, PG_EXPR_TYPE.FUNCTION_CALL);
  t.equal(ast.where.expression.name, 'lower');
  t.equal(ast.where.pattern.type, PG_EXPR_TYPE.FUNCTION_CALL);
  t.equal(ast.where.pattern.name, 'lower');
});

// --- Boolean literal tests (Requirements: 5.1, 5.2) ---

test('PG mode - TRUE in WHERE becomes literal 1', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE active = TRUE',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.right.type, EXPR_TYPE.LITERAL);
  t.equal(ast.where.right.value, 1);
});

test('PG mode - FALSE in WHERE becomes literal 0', async (t) => {
  const parser = new SQLParser(
    'SELECT * FROM users WHERE active = FALSE',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.where.right.type, EXPR_TYPE.LITERAL);
  t.equal(ast.where.right.value, 0);
});

test('PG mode - TRUE in INSERT VALUES becomes literal 1', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO t (a) VALUES (TRUE)',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  t.equal(ast.type, 'INSERT');
  const val = ast.values[0][0];
  t.equal(val.type, EXPR_TYPE.LITERAL);
  t.equal(val.value, 1);
});

test('PG mode - FALSE in INSERT VALUES becomes literal 0', async (t) => {
  const parser = new SQLParser(
    'INSERT INTO t (a) VALUES (FALSE)',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const val = ast.values[0][0];
  t.equal(val.type, EXPR_TYPE.LITERAL);
  t.equal(val.value, 0);
});

// --- CASE WHEN tests (Requirements: 11.1, 11.2) ---

test('PG mode - searched CASE WHEN produces case node', async (t) => {
  const parser = new SQLParser(
    'SELECT CASE WHEN x > 0 THEN \'pos\' ELSE \'neg\' END FROM t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.CASE);
  t.equal(col.operand, null);
  t.equal(col.conditions.length, 1);
  t.ok(col.conditions[0].when);
  t.ok(col.conditions[0].then);
  t.ok(col.elseExpr);
});

test('PG mode - simple CASE with operand', async (t) => {
  const parser = new SQLParser(
    'SELECT CASE x WHEN 1 THEN \'one\' WHEN 2 THEN \'two\' END FROM t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.CASE);
  t.ok(col.operand);
  t.equal(col.conditions.length, 2);
  t.equal(col.elseExpr, null);
});

test('PG mode - CASE with multiple WHEN and ELSE', async (t) => {
  const parser = new SQLParser(
    'SELECT CASE WHEN a = 1 THEN \'x\' WHEN a = 2 THEN \'y\' ' +
    'ELSE \'z\' END FROM t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.CASE);
  t.equal(col.conditions.length, 2);
  t.ok(col.elseExpr);
});

// --- Function call tests (Requirements: 7.2, 7.3) ---

test('PG mode - CONCAT(a, b) produces binary || node', async (t) => {
  const parser = new SQLParser(
    'SELECT CONCAT(a, b) FROM t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, EXPR_TYPE.BINARY);
  t.equal(col.operator, '||');
});

test('PG mode - CONCAT(a, b, c) chains || operators', async (t) => {
  const parser = new SQLParser(
    'SELECT CONCAT(a, b, c) FROM t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, EXPR_TYPE.BINARY);
  t.equal(col.operator, '||');
  t.equal(col.left.type, EXPR_TYPE.BINARY);
  t.equal(col.left.operator, '||');
});

test('PG mode - NOW() produces datetime(\'now\') call', async (t) => {
  const parser = new SQLParser(
    'SELECT NOW()',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.FUNCTION_CALL);
  t.equal(col.name, 'datetime');
  t.equal(col.args.length, 1);
  t.equal(col.args[0].value, 'now');
});

// --- EXTRACT tests (Requirements: 8.2) ---

test('PG mode - EXTRACT(YEAR FROM col) produces cast+strftime',
  async (t) => {
    const parser = new SQLParser(
      'SELECT EXTRACT(YEAR FROM created_at) FROM t',
      {dialect: PARSER_DIALECT.POSTGRESQL},
    );
    const ast = parser.parse();

    const col = ast.columns[0].expression;
    t.equal(col.type, PG_EXPR_TYPE.CAST);
    t.equal(col.affinity, 'INTEGER');
    t.equal(col.expression.type, PG_EXPR_TYPE.FUNCTION_CALL);
    t.equal(col.expression.name, 'strftime');
    t.equal(col.expression.args[0].value, '%Y');
  });

test('PG mode - EXTRACT(MONTH FROM col) uses %m format', async (t) => {
  const parser = new SQLParser(
    'SELECT EXTRACT(MONTH FROM created_at) FROM t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.CAST);
  t.equal(col.expression.args[0].value, '%m');
});

// --- Scalar subquery in SELECT list (Requirements: 9.2) ---

test('PG mode - scalar subquery in SELECT list', async (t) => {
  const parser = new SQLParser(
    'SELECT (SELECT COUNT(*) FROM t2) FROM t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.SUBQUERY);
  t.equal(col.query.type, 'SELECT');
});

// --- Error case tests (Requirements: 1.4, 2.3, 2.4) ---

test('PG mode - invalid SQL throws error', async (t) => {
  const parser = new SQLParser(
    'SELECT FROM',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );

  t.throws(() => parser.parse());
});

test('PG mode - completely invalid SQL throws error', async (t) => {
  const parser = new SQLParser(
    'NOT VALID SQL AT ALL',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );

  t.throws(() => parser.parse());
});

test('validateParamMapping - gap at $2 throws error', async (t) => {
  t.throws(
    () => validateParamMapping([1, 3], 3),
    {message: /gap at 2/},
  );
});

test('validateParamMapping - out-of-bounds $5 throws error', async (t) => {
  t.throws(
    () => validateParamMapping([1, 2, 5], 3),
    {message: /references index 5/},
  );
});

test('validateParamMapping - valid sequential mapping passes', async (t) => {
  validateParamMapping([1, 2, 3], 3);
  t.pass('no error thrown');
});

test('validateParamMapping - empty mapping passes', async (t) => {
  validateParamMapping([], 0);
  t.pass('no error thrown');
});

test('validateParamMapping - repeated params with no gap passes',
  async (t) => {
    validateParamMapping([1, 2, 1], 2);
    t.pass('no error thrown');
  });

// --- Unknown function pass-through (Requirements: 7.4) ---

test('PG mode - unknown function passes through', async (t) => {
  const parser = new SQLParser(
    'SELECT MY_CUSTOM_FN(a) FROM t',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();

  const col = ast.columns[0].expression;
  t.equal(col.type, PG_EXPR_TYPE.FUNCTION_CALL);
  t.equal(col.name, 'MY_CUSTOM_FN');
  t.equal(col.args.length, 1);
});

// --- Default dialect preserves SQLite behavior (Requirements: 1.2) ---

test('Default dialect - no _paramMapping on AST', async (t) => {
  const parser = new SQLParser('SELECT * FROM users WHERE id = ?');
  const ast = parser.parse();

  t.equal(ast._paramMapping, undefined);
});
