/**
 * Locking read canonical AST and wait-policy seal tests.
 *
 * Covers:
 * - Stage B1 wait-policy seal contract verification
 * - Stage B2 canonical AST generation for SELECT ... FOR UPDATE
 * - Fail-closed refusal for unsupported locking clauses, subqueries, and clauses
 *
 * @module test/query/locking-read-canonical-ast.test
 */

import fs from 'node:fs';
import {execSync} from 'node:child_process';
import {test} from '../../src/test-helpers/tap.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {PG_ERROR_CODE} from '../../src/runtime/pgwire-protocol-constants.js';
import {
  LOCKING_READ_STRENGTH,
  LOCKING_READ_WAIT_POLICY,
  SQLError,
} from '../../src/query/sql-locking-read-grammar.js';
import {BaseError} from '../../src/utils/base-error.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
config.initialize();

const POLICY_PATH =
  'solve/specs/release-0-3-queryable-core/locking-read-wait-policy.json';
const ARCHITECTURE_PATH = 'architecture/postgres-locking-reads.md';

test('Stage B1: locking-read-wait-policy.json sealed contract invariants', async (t) => {
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const architecture = fs.readFileSync(ARCHITECTURE_PATH, 'utf8');

  t.equal(policy.version, 1, 'policy version is 1');
  t.equal(policy.scope, 'phase_0_3_select_for_update', 'scope is phase 0.3 select for update');
  t.equal(policy.conflictMode, 'fail_fast_refusal', 'conflictMode is fail_fast_refusal');
  t.equal(policy.waitPolicy, 'fail_fast_refusal', 'waitPolicy is fail_fast_refusal');
  t.equal(policy.conflictSqlState, '55P03', 'conflictSqlState is 55P03');
  t.equal(policy.unsupportedFeatureSqlState, '0A000', 'unsupportedFeatureSqlState is 0A000');
  t.equal(policy.waitQueue, false, 'waitQueue is false');
  t.equal(policy.localExpiry, 'forbidden', 'localExpiry is forbidden');
  t.equal(
    policy.reservationPersistence,
    'durable_replicated_until_transaction_resolution',
    'reservationPersistence is durable until transaction resolution',
  );

  const expectedExcluded = [
    'blocking_wait',
    'waiter_queue',
    'deadlock_detector',
    'for_no_key_update',
    'for_share',
    'for_key_share',
    'nowait',
    'skip_locked',
  ];
  t.ok(Array.isArray(policy.excludedFromInitialSlice), 'excludedFromInitialSlice is an array');
  for (const item of expectedExcluded) {
    t.ok(
      policy.excludedFromInitialSlice.includes(item),
      `excludedFromInitialSlice includes ${item}`,
    );
  }

  t.ok(
    architecture.includes('## Sealed Phase 0.3 wait/conflict policy'),
    'architecture document contains sealed policy section',
  );

  const checkOutput = execSync('node scripts/checks/locking-read-wait-policy-seal-v3.js', {
    encoding: 'utf8',
  });
  t.equal(checkOutput.trim(), '0', 'v3 policy checker reports 0 metric discrepancy');
});

test('Stage B2: SELECT ... FOR UPDATE parses into canonical locking AST', async (t) => {
  const pgParser = new SQLParser('SELECT * FROM accounts WHERE id = 1 FOR UPDATE', {
    dialect: PARSER_DIALECT.POSTGRESQL,
  });
  const pgAst = pgParser.parse();
  t.equal(pgAst.type, 'SELECT', 'statement is SELECT');
  t.ok(pgAst.locking, 'ast.locking is present');
  t.equal(pgAst.locking.strength, LOCKING_READ_STRENGTH.UPDATE, 'strength is UPDATE');
  t.equal(pgAst.locking.waitPolicy, LOCKING_READ_WAIT_POLICY.FAIL_FAST, 'waitPolicy is FAIL_FAST');

  const sqliteParser = new SQLParser('SELECT * FROM accounts WHERE id = 1 FOR UPDATE', {
    dialect: PARSER_DIALECT.SQLITE,
  });
  const sqliteAst = sqliteParser.parse();
  t.equal(sqliteAst.type, 'SELECT');
  t.ok(sqliteAst.locking, 'ast.locking is present in sqlite mode');
  t.equal(sqliteAst.locking.strength, 'UPDATE');
  t.equal(sqliteAst.locking.waitPolicy, 'FAIL_FAST');
});

test('Stage B2: SELECT ... ORDER BY ... LIMIT ... FOR UPDATE with trailing semicolon', async (t) => {
  const parser = new SQLParser(
    'SELECT id, name FROM users WHERE active = 1 ORDER BY id LIMIT 10 OFFSET 20 FOR UPDATE;',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();
  t.equal(ast.type, 'SELECT');
  t.equal(ast.limit.count, 10);
  t.equal(ast.limit.offset, 20);
  t.equal(ast.orderBy.length, 1);
  t.equal(ast.locking.strength, 'UPDATE');
  t.equal(ast.locking.waitPolicy, 'FAIL_FAST');
});

test('Stage B2: Parameterized queries with FOR UPDATE preserve parameter mappings', async (t) => {
  const parser = new SQLParser(
    'SELECT id, balance FROM accounts WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );
  const ast = parser.parse();
  t.equal(ast.type, 'SELECT');
  t.equal(ast.locking.strength, 'UPDATE');
  t.equal(ast.locking.waitPolicy, 'FAIL_FAST');
  t.ok(Array.isArray(ast._paramMapping), 'positional params preserved');
  t.equal(ast._paramMapping.length, 2);

  const sqliteParser = new SQLParser(
    'SELECT id, balance FROM accounts WHERE id = ? FOR UPDATE',
    {dialect: PARSER_DIALECT.SQLITE},
  );
  const sqliteAst = sqliteParser.parse();
  t.equal(sqliteAst.type, 'SELECT');
  t.equal(sqliteAst.locking.strength, 'UPDATE');
  t.equal(sqliteAst.locking.waitPolicy, 'FAIL_FAST');
});

test('Stage B2: Queries without locking clause set ast.locking to null', async (t) => {
  const standardAst = new SQLParser('SELECT id FROM accounts WHERE id = 1').parse();
  t.equal(standardAst.locking, null, 'standard select has null locking');

  const stringLiteralAst = new SQLParser(
    'SELECT id, note FROM orders WHERE note = \'FOR UPDATE\'',
  ).parse();
  t.equal(stringLiteralAst.locking, null, 'string literal FOR UPDATE does not set locking');

  const shareLiteralAst = new SQLParser(
    'SELECT id FROM orders WHERE note = \'FOR SHARE\'',
  ).parse();
  t.equal(shareLiteralAst.locking, null, 'string literal FOR SHARE does not set locking');

  const commentAst = new SQLParser(
    'SELECT id FROM accounts WHERE id = 1 -- FOR UPDATE',
  ).parse();
  t.equal(commentAst.locking, null, 'line comment FOR UPDATE does not set locking');

  const blockCommentAst = new SQLParser(
    'SELECT id FROM accounts /* FOR UPDATE */ WHERE id = 1',
  ).parse();
  t.equal(blockCommentAst.locking, null, 'block comment FOR UPDATE does not set locking');

  const quotedIdentAst = new SQLParser(
    'SELECT "FOR UPDATE" FROM accounts WHERE id = 1',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  ).parse();
  t.equal(quotedIdentAst.locking, null, 'quoted identifier does not set locking');

  const dollarQuotedAst = new SQLParser(
    'SELECT id, note FROM orders WHERE note = $$FOR UPDATE$$',
    {dialect: PARSER_DIALECT.POSTGRESQL},
  ).parse();
  t.equal(dollarQuotedAst.locking, null, 'dollar quoted string does not set locking');
});

test('Stage B2: Fail-closed rejections for unsupported locking clauses', async (t) => {
  const unsupportedQueries = [
    ['FOR SHARE', 'SELECT * FROM t FOR SHARE'],
    ['FOR KEY SHARE', 'SELECT * FROM t FOR KEY SHARE'],
    ['FOR NO KEY UPDATE', 'SELECT * FROM t FOR NO KEY UPDATE'],
    ['NOWAIT', 'SELECT * FROM t FOR UPDATE NOWAIT'],
    ['SKIP LOCKED', 'SELECT * FROM t FOR UPDATE SKIP LOCKED'],
    ['OF table', 'SELECT * FROM t FOR UPDATE OF t'],
    ['Subquery locking', 'SELECT * FROM (SELECT id FROM t FOR UPDATE) s'],
    ['WHERE IN subquery', 'SELECT * FROM t WHERE id IN (SELECT id FROM s FOR UPDATE)'],
    ['CTE locking', 'WITH s AS (SELECT id FROM t FOR UPDATE) SELECT * FROM s'],
    ['UPDATE statement', 'UPDATE accounts SET balance = 100 FOR UPDATE'],
    ['INSERT statement', 'INSERT INTO accounts (id) VALUES (1) FOR UPDATE'],
    ['DELETE statement', 'DELETE FROM accounts WHERE id = 1 FOR UPDATE'],
    ['DISTINCT with FOR UPDATE', 'SELECT DISTINCT id FROM t FOR UPDATE'],
    ['GROUP BY with FOR UPDATE', 'SELECT id FROM t GROUP BY id FOR UPDATE'],
    ['HAVING with FOR UPDATE', 'SELECT id FROM t HAVING id > 0 FOR UPDATE'],
    ['Aggregate COUNT with FOR UPDATE', 'SELECT COUNT(*) FROM t FOR UPDATE'],
    ['Aggregate SUM with FOR UPDATE', 'SELECT SUM(val) FROM t FOR UPDATE'],
    ['Aggregate AVG with FOR UPDATE', 'SELECT AVG(val) FROM t FOR UPDATE'],
    ['Aggregate MIN/MAX with FOR UPDATE', 'SELECT MIN(val), MAX(val) FROM t FOR UPDATE'],
    ['Set operation UNION with FOR UPDATE', 'SELECT id FROM t1 UNION SELECT id FROM t2 FOR UPDATE'],
    ['Set operation INTERSECT with FOR UPDATE', 'SELECT id FROM t1 INTERSECT SELECT id FROM t2 FOR UPDATE'],
    ['Set operation EXCEPT with FOR UPDATE', 'SELECT id FROM t1 EXCEPT SELECT id FROM t2 FOR UPDATE'],
    ['Misplaced FOR UPDATE', 'SELECT * FROM t FOR UPDATE WHERE id = 1'],
  ];

  for (const [label, sql] of unsupportedQueries) {
    const parser = new SQLParser(sql, {dialect: PARSER_DIALECT.POSTGRESQL});
    let caught = null;
    try {
      parser.parse();
    } catch (err) {
      caught = err;
    }
    t.ok(caught !== null, `${label} throws: ${sql}`);
    t.equal(
      caught?.code,
      QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      `${label} code is UNSUPPORTED_SQL_FEATURE`,
    );
    t.equal(
      caught?.sqlState,
      PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
      `${label} sqlState is 0A000`,
    );
    t.equal(
      caught?.details?.sqlState,
      '0A000',
      `${label} details.sqlState is 0A000`,
    );
  }
});

test('Stage B2: SQLError domain error structure and preservation', async (t) => {
  const errFeature = new SQLError('unsupported feature message', {
    code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
    sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
  });
  t.ok(errFeature instanceof Error, 'instance of Error');
  t.ok(errFeature instanceof BaseError, 'instance of BaseError');
  t.ok(errFeature instanceof SQLError, 'instance of SQLError');
  t.equal(errFeature.name, 'SQLError');
  t.equal(errFeature.code, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
  t.equal(errFeature.sqlState, '0A000');
  t.equal(errFeature.details?.sqlState, '0A000');

  const errConflict = new SQLError('lock conflict message', {
    code: QUERY_ERROR_CODE.TRANSACTION_CONFLICT,
    sqlState: PG_ERROR_CODE.LOCK_NOT_AVAILABLE,
  });
  t.equal(errConflict.sqlState, '55P03');
  t.equal(errConflict.details?.sqlState, '55P03');
});
