/**
 * Property-based tests for SQLParser PG mode.
 *
 * Feature: pg-sql-compat-layer
 * PBT Library: fast-check
 * Runner: node:test
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {SQLParser, EXPR_TYPE} from '../../src/query/sql-parser.js';
import {PARSER_DIALECT, PG_EXPR_TYPE} from '../../src/query/pg/pg-compat-constants.js';
import {PG_TYPE_AFFINITY_MAP} from '../../src/query/pg/pg-type-affinity.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

/**
 * Generator for valid SQL identifier names.
 * Produces lowercase alpha identifiers that avoid SQL reserved words.
 */
const SQL_RESERVED = new Set([
  'select', 'from', 'where', 'insert', 'update', 'delete',
  'into', 'values', 'set', 'create', 'drop', 'table', 'index',
  'and', 'or', 'not', 'null', 'true', 'false', 'as', 'on',
  'join', 'left', 'right', 'inner', 'outer', 'order', 'by',
  'group', 'having', 'limit', 'offset', 'union', 'all', 'in',
  'between', 'like', 'is', 'case', 'when', 'then', 'else',
  'end', 'cast', 'exists', 'with', 'recursive', 'distinct',
  'asc', 'desc', 'begin', 'commit', 'rollback', 'int',
  'integer', 'text', 'real', 'blob', 'boolean', 'varchar',
  'char', 'float', 'numeric', 'decimal', 'primary', 'key',
  'if', 'do', 'for', 'to',
]);

const identArb = fc.stringMatching(/^[a-z][a-z]{2,8}$/)
  .filter((s) => !SQL_RESERVED.has(s));

/**
 * Strips internal metadata fields (prefixed with _) from AST
 * and normalizes trivial dialect differences for comparison.
 * PG mode may produce {count: undefined, offset: null} for limit
 * while SQLite mode produces null — both mean "no limit".
 */
function stripMeta(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripMeta);
  if (typeof obj !== 'object') return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    // Normalize empty limit objects to null
    if (k === 'limit' && v && typeof v === 'object' &&
        v.count === undefined && v.offset === null) {
      result[k] = null;
      continue;
    }
    result[k] = stripMeta(v);
  }
  return result;
}


/**
 * Feature: pg-sql-compat-layer
 * Property 1: Backward Compatibility
 * **Validates: Requirements 1.2**
 *
 * For any valid SQLite SQL, parsing with default dialect produces
 * unchanged AST — no PG-specific translations are applied.
 */
describe('Property 1: Backward Compatibility', () => {
  it('default dialect produces standard AST for any valid SQLite SQL', () => {
    const colArb = identArb;
    const tableArb = identArb;

    // Generate simple SELECT queries with optional WHERE
    const sqlArb = fc.tuple(
      fc.array(colArb, {minLength: 1, maxLength: 3}),
      tableArb,
      fc.boolean(),
    ).map(([cols, table, hasWhere]) => {
      const colList = cols.join(', ');
      const where = hasWhere ? ` WHERE ${cols[0]} = ?` : '';
      return `SELECT ${colList} FROM ${table}${where}`;
    });

    fc.assert(
      fc.property(sqlArb, (sql) => {
        // Parse with default dialect (no options)
        const defaultParser = new SQLParser(sql);
        const defaultAst = defaultParser.parse();

        // Parse with explicit sqlite dialect
        const sqliteParser = new SQLParser(sql, {
          dialect: PARSER_DIALECT.SQLITE,
        });
        const sqliteAst = sqliteParser.parse();

        // Both must produce identical ASTs
        assert.deepStrictEqual(
          stripMeta(defaultAst),
          stripMeta(sqliteAst),
        );

        // Must be a SELECT with correct structure
        assert.equal(defaultAst.type, 'SELECT');
        assert.ok(Array.isArray(defaultAst.columns));
        assert.ok(defaultAst.from);
      }),
      {numRuns: 10},
    );
  });
});


/**
 * Feature: pg-sql-compat-layer
 * Property 2: Dual-Dialect AST Equivalence
 * **Validates: Requirements 1.3**
 *
 * For any SQL valid in both dialects, PG and SQLite mode produce
 * identical ASTs (after stripping internal metadata).
 */
describe('Property 2: Dual-Dialect AST Equivalence', () => {
  it('PG and SQLite mode produce identical ASTs for common SQL', () => {
    const colArb = identArb;
    const tableArb = identArb;
    const intArb = fc.integer({min: 1, max: 9999});

    // Generate SQL valid in BOTH dialects — no ? (PG uses $N),
    // use integer literals in WHERE instead.
    const sqlArb = fc.tuple(
      fc.array(colArb, {minLength: 1, maxLength: 3}),
      tableArb,
      fc.boolean(),
      intArb,
    ).map(([cols, table, hasWhere, val]) => {
      const colList = cols.join(', ');
      const where = hasWhere ? ` WHERE ${cols[0]} = ${val}` : '';
      return `SELECT ${colList} FROM ${table}${where}`;
    });

    fc.assert(
      fc.property(sqlArb, (sql) => {
        const sqliteParser = new SQLParser(sql, {
          dialect: PARSER_DIALECT.SQLITE,
        });
        const sqliteAst = sqliteParser.parse();

        const pgParser = new SQLParser(sql, {
          dialect: PARSER_DIALECT.POSTGRESQL,
        });
        const pgAst = pgParser.parse();

        // Strip metadata and normalize trivial dialect differences
        assert.deepStrictEqual(
          stripMeta(pgAst),
          stripMeta(sqliteAst),
        );
      }),
      {numRuns: 10},
    );
  });
});


/**
 * Feature: pg-sql-compat-layer
 * Property 5: Type Cast Translation Round-Trip
 * **Validates: Requirements 6.1, 6.2, 6.4**
 *
 * For any cast with PG type from PG_TYPE_AFFINITY_MAP, parsing in
 * PG mode produces a cast AST node with the correct SQLite affinity.
 */
describe('Property 5: Type Cast Translation Round-Trip', () => {
  it('CAST with PG type produces correct SQLite affinity', () => {
    const pgTypes = Object.keys(PG_TYPE_AFFINITY_MAP)
      .filter((t) => !t.includes(' '));
    const pgTypeArb = fc.constantFrom(...pgTypes);
    const colArb = identArb;
    const tableArb = identArb;

    fc.assert(
      fc.property(pgTypeArb, colArb, tableArb, (pgType, col, table) => {
        const sql = `SELECT CAST(${col} AS ${pgType}) FROM ${table}`;
        const parser = new SQLParser(sql, {
          dialect: PARSER_DIALECT.POSTGRESQL,
        });
        const ast = parser.parse();

        assert.equal(ast.type, 'SELECT');
        assert.equal(ast.columns.length, 1);

        const expr = ast.columns[0].expression;
        assert.equal(expr.type, PG_EXPR_TYPE.CAST);

        // Affinity must match the map
        const expectedAffinity = PG_TYPE_AFFINITY_MAP[pgType];
        assert.equal(expr.affinity, expectedAffinity);

        // Inner expression must be the column reference
        assert.equal(expr.expression.type, EXPR_TYPE.COLUMN_REF);
        assert.equal(expr.expression.column, col);
      }),
      {numRuns: 10},
    );
  });
});
