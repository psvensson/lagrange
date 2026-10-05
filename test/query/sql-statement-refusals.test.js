/**
 * Statements the engine must refuse whole instead of executing a different
 * statement: transaction control recognised only as a whole statement (the
 * standard spellings included), INSERT ... SELECT, RETURNING, and a
 * statement sent for an explicit transaction the engine no longer holds
 * (never run as autocommit).
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';
import {
  TRANSACTION_CONTROL_KIND,
  classifyTransactionControlStatement,
} from '../../src/query/sql-transaction-control-grammar.js';
import {
  admitExpectedTransaction,
  withSessionTransactionState,
} from '../../src/query/sql-query-engine-statement-admission.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from './sql-query-engine-test-support.js';

ConfigurationManager.getInstance().initialize();

const PG = {dialect: PARSER_DIALECT.POSTGRESQL};

const SPELLINGS = Object.freeze([
  ['BEGIN', 'BEGIN_TRANSACTION'],
  ['begin;', 'BEGIN_TRANSACTION'],
  ['BEGIN WORK', 'BEGIN_TRANSACTION'],
  ['BEGIN TRANSACTION', 'BEGIN_TRANSACTION'],
  ['BEGIN READ WRITE', 'BEGIN_TRANSACTION'],
  ['begin transaction read write;', 'BEGIN_TRANSACTION'],
  ['START TRANSACTION', 'BEGIN_TRANSACTION'],
  ['START TRANSACTION READ WRITE', 'BEGIN_TRANSACTION'],
  ['COMMIT', 'COMMIT'],
  ['COMMIT WORK', 'COMMIT'],
  ['COMMIT TRANSACTION;', 'COMMIT'],
  ['END', 'COMMIT'],
  ['END WORK', 'COMMIT'],
  ['ROLLBACK', 'ROLLBACK'],
  ['ROLLBACK WORK', 'ROLLBACK'],
  ['ROLLBACK TRANSACTION ; ;', 'ROLLBACK'],
  ['ABORT', 'ROLLBACK'],
  ['abort transaction', 'ROLLBACK'],
  // Comments outside quotes are whitespace (PostgreSQL), including one
  // holding a ';' or a statement keyword, and nested block comments.
  ['BEGIN -- start', 'BEGIN_TRANSACTION'],
  ['BEGIN /* trace */', 'BEGIN_TRANSACTION'],
  ['-- leading\nBEGIN', 'BEGIN_TRANSACTION'],
  ['/* a */ START /* b */ TRANSACTION -- c', 'BEGIN_TRANSACTION'],
  ['BEGIN -- ; INSERT INTO t (id) VALUES (1)', 'BEGIN_TRANSACTION'],
  ['BEGIN /* ; COMMIT */', 'BEGIN_TRANSACTION'],
  ['BEGIN /* outer /* inner; ROLLBACK */ still comment */;',
    'BEGIN_TRANSACTION'],
  ['COMMIT -- x', 'COMMIT'],
  ['COMMIT /* ROLLBACK */', 'COMMIT'],
  ['END -- done\n', 'COMMIT'],
  ['ROLLBACK /* x */', 'ROLLBACK'],
  ['ROLLBACK -- ; COMMIT', 'ROLLBACK'],
  ['ABORT/* x */WORK', 'ROLLBACK'],
]);
// Modes the engine does not provide: refused by name (0A000 on the wire),
// never accepted unenforced.
const UNSUPPORTED_MODES = Object.freeze([
  ['START TRANSACTION READ ONLY', 'READ ONLY'],
  ['BEGIN READ ONLY', 'READ ONLY'],
  ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'ISOLATION LEVEL SERIALIZABLE'],
  ['BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED, READ WRITE',
    'ISOLATION LEVEL READ COMMITTED'],
  ['BEGIN READ WRITE, ISOLATION LEVEL REPEATABLE READ',
    'ISOLATION LEVEL REPEATABLE READ'],
  ['start transaction isolation level read uncommitted',
    'ISOLATION LEVEL READ UNCOMMITTED'],
  ['BEGIN READ WRITE NOT DEFERRABLE', 'NOT DEFERRABLE'],
  ['BEGIN DEFERRABLE -- x', 'DEFERRABLE'],
]);
// A transaction keyword followed by anything that is not part of the
// statement: a syntax error, nothing executes (never the keyword's
// statement with the rest dropped).
const MALFORMED = Object.freeze([
  'BEGIN\nINSERT INTO t (id) VALUES (1)',
  'BEGIN INSERT INTO t (id) VALUES (1)',
  'BEGIN WORK WORK',
  'BEGIN ISOLATION LEVEL',
  'BEGIN READ ONLY,',
  'BEGIN , READ ONLY',
  'START',
  'START WORK',
  'COMMIT DELETE FROM t',
  'COMMIT AND CHAIN',
  'END TRANSACTION t',
  'ROLLBACK TO SAVEPOINT s',
  'ABORT WORK now',
  'BEGIN -- x\nINSERT INTO t (id) VALUES (1)',
  'BEGIN /* unterminated',
  'COMMIT /* x */ DELETE FROM t',
  'BEGIN "-- quoted"',
  'ROLLBACK \'/* quoted */\'',
]);
const NOT_TRANSACTION_CONTROL = Object.freeze([
  'SELECT 1',
  'BEGINNING',
  'BEGIN; INSERT INTO t (id) VALUES (1)',
  'COMMIT; DELETE FROM t',
  'BEGIN -- x\n; INSERT INTO t (id) VALUES (1)',
  'SELECT \'BEGIN -- x\'',
  // A comment marker inside quotes is text, not a comment: the `;` after
  // it still makes this two statements.
  'BEGIN \'/*\'; SELECT 1 -- */',
  '',
]);

test('transaction control is recognised only as a whole statement',
  async (t) => {
    for (const [sql, type] of SPELLINGS) {
      t.equal(classifyTransactionControlStatement(sql), type, sql);
      t.equal(new SQLParser(sql, PG).parse().type, type, `parsed: ${sql}`);
    }
    for (const sql of MALFORMED) {
      t.equal(classifyTransactionControlStatement(sql),
        TRANSACTION_CONTROL_KIND.MALFORMED, sql);
      t.throws(() => new SQLParser(sql, PG).parse(),
        {code: 'TRANSACTION_CONTROL_SYNTAX_ERROR'}, `refused: ${sql}`);
    }
    for (const [sql, mode] of UNSUPPORTED_MODES) {
      t.equal(classifyTransactionControlStatement(sql),
        TRANSACTION_CONTROL_KIND.UNSUPPORTED_MODE, sql);
      t.throws(() => new SQLParser(sql, PG).parse(),
        {code: 'UNSUPPORTED_SQL_FEATURE',
          message: `transaction mode ${mode} is not supported (the engine ` +
            'does not provide or enforce it; only READ WRITE is accepted); ' +
            'nothing was executed'}, `refused: ${sql}`);
    }
    for (const sql of NOT_TRANSACTION_CONTROL) {
      t.equal(classifyTransactionControlStatement(sql),
        TRANSACTION_CONTROL_KIND.NONE, JSON.stringify(sql));
    }
    t.equal(classifyTransactionControlStatement(null),
      TRANSACTION_CONTROL_KIND.NONE);
  });

test('INSERT ... SELECT and RETURNING expressions are refused, typed',
  async (t) => {
    for (const dialect of [undefined, PARSER_DIALECT.POSTGRESQL]) {
      for (const sql of [
        'INSERT INTO t (id) SELECT id FROM u',
        'INSERT INTO t SELECT * FROM u',
        'INSERT INTO t (id) (SELECT 1)',
      ]) {
        t.throws(() => new SQLParser(sql, {dialect}).parse(),
          {code: 'UNSUPPORTED_SQL_FEATURE',
            message: 'INSERT ... SELECT is not supported'},
          `${dialect}: ${sql}`);
      }
    }
    t.throws(() => new SQLParser(
      'DELETE FROM t WHERE id = 1 RETURNING id + 1', PG).parse(),
    {code: 'UNSUPPORTED_SQL_FEATURE', message: 'RETURNING is not supported'});
    t.same(new SQLParser('INSERT INTO t (id) VALUES (1)', PG).parse().values,
      [[{type: 'literal', value: 1}]], 'VALUES inserts still parse');
  });

function createRecordingEngine() {
  const delivered = [];
  const router = createMockMessageRouter();
  const deliver = router.deliver.bind(router);
  router.deliver = async (address, message) => {
    if (message.type === 'QUERY') delivered.push(message.sql);
    return deliver(address, message);
  };
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{partition_id: 'p1', table_name: 'users', partition_key_start: null,
        partition_key_end: null}],
    ),
    messageRouter: router,
  });
  return {engine, delivered};
}

test('the engine refuses RETURNING and INSERT ... SELECT before any write',
  async (t) => {
    const {engine, delivered} = createRecordingEngine();
    for (const [sql, message] of [
      ['INSERT INTO users (id) VALUES (\'a\') RETURNING id',
        'RETURNING is not supported'],
      ['UPDATE users SET name = \'b\' WHERE id = \'a\' RETURNING *',
        'RETURNING is not supported'],
      ['DELETE FROM users WHERE id = \'a\' RETURNING id',
        'RETURNING is not supported'],
      ['INSERT INTO users (id) SELECT id FROM users',
        'INSERT ... SELECT is not supported'],
    ]) {
      const result = await engine.executeQuery(sql, [], PG);
      t.equal(result.success, false, sql);
      t.equal(result.errorCode, 'UNSUPPORTED_SQL_FEATURE', sql);
      t.equal(result.error, message, sql);
    }
    const malformed = await engine.executeQuery(
      'BEGIN\nINSERT INTO users (id) VALUES (\'z\')', [], PG);
    t.equal(malformed.errorCode, 'TRANSACTION_CONTROL_SYNTAX_ERROR');
    t.notOk(engine.hasActiveTransaction(), 'no transaction was begun');
    t.same(delivered, [], 'no partition write was delivered');
  });

function sessionRequest(statement, sessionId, expectedTransactionId) {
  return createSqlRequest({
    statement, sessionId, dialect: PARSER_DIALECT.POSTGRESQL,
    ...(expectedTransactionId ? {expectedTransactionId} : {}),
  });
}

test('a statement for a transaction the engine no longer holds is refused, ' +
  'never run as autocommit', async (t) => {
  const {engine, delivered} = createRecordingEngine();
  const sessionId = 'expiry-session';
  const begun = await engine.executeRequest(sessionRequest('BEGIN',
    sessionId));
  t.equal(begun.success, true);
  t.ok(begun.transactionId, 'BEGIN answers its transaction id');
  // The engine drops the transaction (the budget sweep's rollback).
  await engine.transactionCoordinator.rollback(sessionId);
  for (const statement of [
    'INSERT INTO users (id) VALUES (\'late\')',
    'UPDATE users SET name = \'x\'',
    'SELECT id FROM users',
    'BEGIN',
    'SHOW SERVICES',
  ]) {
    const refused = await engine.executeRequest(sessionRequest(statement,
      sessionId, begun.transactionId));
    t.equal(refused.success, false, statement);
    t.equal(refused.errorCode, 'NO_TRANSACTION', statement);
    t.equal(refused.transactionId, begun.transactionId, statement);
    t.match(refused.error, /is no longer active on the server/u, statement);
  }
  t.notOk(engine.hasActiveTransaction(sessionId), 'BEGIN did not reopen');
  // The BEGIN decision itself re-checks (a sweep between the dispatch check
  // and the BEGIN must not open a fresh transaction under the old block).
  const direct = await engine.executeQuery('BEGIN', [], {sessionId,
    expectedTransactionId: begun.transactionId});
  t.equal(direct.errorCode, 'NO_TRANSACTION', 'BEGIN re-checks');
  t.notOk(engine.hasActiveTransaction(sessionId), 'still no transaction');
  t.same(delivered, [], 'nothing was written outside the transaction');
  for (const end of ['COMMIT', 'ROLLBACK']) {
    const ended = await engine.executeRequest(sessionRequest(end, sessionId,
      begun.transactionId));
    t.equal(ended.errorCode, 'NO_TRANSACTION', `${end} answers itself`);
    t.equal(ended.sessionTransactionActive, false,
      `${end}: the engine says it holds no transaction`);
  }
});

test('executeQuery itself refuses any statement for a transaction the ' +
  'engine no longer holds (the facade and internal owners call it ' +
  'directly, past the request dispatch)', async (t) => {
  const {engine, delivered} = createRecordingEngine();
  const sessionId = 'direct-session';
  const begun = await engine.executeQuery('BEGIN', [], {sessionId});
  await engine.transactionCoordinator.rollback(sessionId);
  for (const statement of [
    'SELECT id FROM users',
    'CREATE TABLE late_tbl (id INTEGER PRIMARY KEY)',
    'INSERT INTO users (id) VALUES (\'late\')',
    'DELETE FROM users',
  ]) {
    const refused = await engine.executeQuery(statement, [], {sessionId,
      expectedTransactionId: begun.transactionId});
    t.equal(refused.errorCode, 'NO_TRANSACTION', statement);
    t.equal(refused.transactionId, begun.transactionId, statement);
  }
  for (const end of ['COMMIT', 'ROLLBACK']) {
    const ended = await engine.executeQuery(end, [], {sessionId,
      expectedTransactionId: begun.transactionId});
    t.equal(ended.errorCode, 'NO_TRANSACTION', `${end} answers itself`);
    t.equal(ended.statementType, end, `${end} executed`);
  }
  t.same(delivered, [], 'nothing ran outside the transaction');
  const plain = await engine.executeQuery('SELECT id FROM users', [],
    {sessionId: 'no-expectation'});
  t.equal(plain.errorCode, undefined, 'no expectation: runs as before');
});

test('a COMMIT that throws is answered as a failed COMMIT carrying the ' +
  'coordinator\'s commit-point fact', async (t) => {
  const {engine} = createRecordingEngine();
  for (const reached of [true, false, undefined]) {
    engine.transactionCoordinator.commit = async () => {
      const error = new Error('persist failed');
      if (reached !== undefined) error.commitPointReached = reached;
      throw error;
    };
    const result = await engine.executeQuery('COMMIT', [],
      {sessionId: 'throwing-commit'});
    t.equal(result.success, false);
    t.equal(result.statementType, 'COMMIT', 'answered as the COMMIT');
    t.equal(result.error, 'persist failed');
    t.equal(result.commitPointReached, reached, `fact: ${reached}`);
  }
});

test('the write path re-checks the expected transaction where it decides ' +
  'autocommit', async (t) => {
  const {engine} = createRecordingEngine();
  const plan = {partitionStatements: new Map([['p1', {}]]),
    operationId: 'op-1'};
  const unheld = await engine.openWriteTransaction('race-session', plan,
    {expectedTransactionId: 'tx-gone'});
  t.equal(unheld.failure?.errorCode, 'NO_TRANSACTION',
    'refused, not DIRECT_AUTOCOMMIT');
  const begun = await engine.executeQuery('BEGIN', [],
    {sessionId: 'race-session'});
  const held = await engine.openWriteTransaction('race-session', plan,
    {expectedTransactionId: begun.transactionId});
  t.equal(held.failure, undefined);
  t.equal(held.ownership, 'EXPLICIT');
  const plain = await engine.openWriteTransaction('other-session', plan, {});
  t.equal(plain.failure, undefined, 'no expectation: autocommit as before');
});

test('admitExpectedTransaction and withSessionTransactionState',
  async (t) => {
    const coordinator = {
      getTransaction: (sessionId) =>
        sessionId === 's' ? {transactionId: 'tx-1'} : null,
      hasActiveTransaction: (sessionId) => sessionId === 's',
    };
    for (const [sessionId, expected, state] of [
      ['s', null, 'admitted'], ['x', undefined, 'admitted'],
      ['s', 'tx-1', 'admitted'], ['s', 'tx-2', 'refused'],
      ['x', 'tx-1', 'refused'],
    ]) {
      const admission = admitExpectedTransaction(coordinator, sessionId,
        expected);
      t.equal(admission.state, state, `${sessionId} expecting ${expected}`);
      if (state === 'refused') {
        t.equal(admission.failure.errorCode, 'NO_TRANSACTION');
      }
    }
    const ok = {success: true};
    t.equal(withSessionTransactionState(ok, coordinator, 's'), ok);
    t.equal(withSessionTransactionState({success: false}, coordinator, 's')
      .sessionTransactionActive, true);
    t.equal(withSessionTransactionState({success: false}, coordinator, 'x')
      .sessionTransactionActive, false);
    t.throws(() => createSqlRequest({statement: 'SELECT 1',
      expectedTransactionId: 7}), /expectedTransactionId/u);
    t.notOk(Object.hasOwn(createSqlRequest({statement: 'SELECT 1'}),
      'expectedTransactionId'), 'absent unless set');
  });
