/**
 * Tests for PostgresWireAdapter.
 * Verifies authentication, session mapping, feature negotiation,
 * and delegation to SqlCore.
 *
 * Requirements: 1.1, 3.1, 3.2, 3.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PostgresWireAdapter,
  PG_SESSION_STATE,
} from '../../src/query/pg/postgres-wire-adapter.js';
import {createTestPostgresWireAdapter} from
  '../helpers/pgwire-auth-handler.js';
import {EXECUTION_MODE} from '../../src/query/sql-adapter-constants.js';

/**
 * Create a minimal mock SqlCore that records executeRequest calls.
 * @return {Object} Mock with calls array and executeRequest method.
 */
function createMockSqlCore() {
  const calls = [];
  return {
    calls,
    async executeRequest(sqlRequest) {
      calls.push(sqlRequest);
      return {success: true, rows: [], affectedRows: 0};
    },
  };
}

test('PostgresWireAdapter - throws when sqlCore is missing', (t) => {
  t.throws(
    () => new PostgresWireAdapter(),
    /SqlCore.*required/,
  );
  t.end();
});

test('PostgresWireAdapter - requires an authentication owner', (t) => {
  t.throws(
    () => new PostgresWireAdapter({sqlCore: createMockSqlCore()}),
    /authentication owner/u,
  );
  t.end();
});

test('PostgresWireAdapter - authenticate creates session', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  const session = await adapter.authenticate('sess-1', {
    tenantId: 'tenant-a',
    user: 'alice',
  });

  t.equal(session.sessionId, 'sess-1');
  t.equal(session.tenantId, 'tenant-a');
  t.equal(session.state, PG_SESSION_STATE.AUTHENTICATED);
  t.ok(adapter.hasSession('sess-1'));
  t.end();
});

test('PostgresWireAdapter - authenticate requires tenantId', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await t.rejects(
    adapter.authenticate('sess-1', {user: 'alice'}),
    /Tenant ID is required/,
  );
  t.end();
});

test('PostgresWireAdapter - authenticate requires sessionId', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await t.rejects(
    adapter.authenticate('', {tenantId: 'tenant-a'}),
    /Session ID is required/,
  );
  t.end();
});

test('PostgresWireAdapter - custom authenticator rejects', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({
    sqlCore: mock,
    authenticator: async () => ({authenticated: false}),
  });

  await t.rejects(
    adapter.authenticate('sess-1', {tenantId: 'tenant-a'}),
    /Authentication failed/,
  );
  t.notOk(adapter.hasSession('sess-1'));
  t.end();
});

test('PostgresWireAdapter - custom authenticator accepts', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({
    sqlCore: mock,
    authenticator: async () => ({authenticated: true}),
  });

  const session = await adapter.authenticate('sess-1', {
    tenantId: 'tenant-a',
  });

  t.equal(session.state, PG_SESSION_STATE.AUTHENTICATED);
  t.end();
});

test('PostgresWireAdapter - execute delegates to sqlCore', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await adapter.authenticate('sess-1', {tenantId: 'tenant-a'});
  const result = await adapter.execute('sess-1', 'SELECT 1');

  t.equal(mock.calls.length, 1);
  t.equal(mock.calls[0].statement, 'SELECT 1');
  t.same(mock.calls[0].parameters, []);
  t.equal(mock.calls[0].sessionId, 'sess-1');
  t.equal(mock.calls[0].tenantId, 'tenant-a');
  t.equal(mock.calls[0].executionMode, EXECUTION_MODE.SQL_STATEMENT);
  t.ok(result.success);
  t.end();
});

test('PostgresWireAdapter - execute rejects unauthenticated', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await t.rejects(
    adapter.execute('unknown-sess', 'SELECT 1'),
    /must be authenticated/,
  );
  t.end();
});

test('PostgresWireAdapter - execute rejects closed session', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await adapter.authenticate('sess-1', {tenantId: 'tenant-a'});
  adapter.closeSession('sess-1');

  await t.rejects(
    adapter.execute('sess-1', 'SELECT 1'),
    /must be authenticated/,
  );
  t.end();
});

test('PostgresWireAdapter - negotiateFeatures reports unsupported', (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  const result = adapter.negotiateFeatures('sess-1', [
    'prepared_statements',
    'copy_protocol',
  ]);

  t.same(result.supported, []);
  t.same(result.unsupported, [
    'prepared_statements',
    'copy_protocol',
  ]);
  t.end();
});

test('PostgresWireAdapter - closeSession removes session', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await adapter.authenticate('sess-1', {tenantId: 'tenant-a'});
  t.ok(adapter.hasSession('sess-1'));

  adapter.closeSession('sess-1');
  t.notOk(adapter.hasSession('sess-1'));
  t.end();
});

test('PostgresWireAdapter - closing a session with its transaction open ' +
  'rolls the engine transaction back; a failure is logged', async (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});
  await adapter.authenticate('sess-open', {tenantId: 'tenant-a'});
  await adapter.authenticate('sess-idle', {tenantId: 'tenant-a'});
  adapter.closeSession('sess-open', {transactionOpen: true});
  adapter.closeSession('sess-idle', {transactionOpen: false});
  await new Promise((resolve) => setImmediate(resolve));
  t.same(mock.calls.map((request) => [request.sessionId, request.statement]),
    [['sess-open', 'ROLLBACK']], 'one ROLLBACK, for the open session only');
  t.notOk(adapter.hasSession('sess-open'), 'the session is released');

  const warnings = [];
  const failing = createTestPostgresWireAdapter({
    sqlCore: {async executeRequest(request) {
      return request.sessionId === 'gone' ?
        {success: false, errorCode: 'NO_TRANSACTION'} :
        {success: false, errorCode: 'ROLLBACK_FAILED', error: 'broke'};
    }},
    logger: {debug() {}, info() {}, error() {},
      warn: (message, fields) => warnings.push(fields)},
  });
  await failing.authenticate('gone', {tenantId: 'tenant-a'});
  await failing.authenticate('broken', {tenantId: 'tenant-a'});
  failing.closeSession('gone', {transactionOpen: true});
  failing.closeSession('broken', {transactionOpen: true});
  await new Promise((resolve) => setImmediate(resolve));
  t.same(warnings, [{sessionId: 'broken', error: 'broke'}],
    'only a real rollback failure is logged (NO_TRANSACTION: already ended)');
});

test('PostgresWireAdapter - closeSession is idempotent', (t) => {
  const mock = createMockSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  // Closing a non-existent session should not throw
  adapter.closeSession('nonexistent');
  t.notOk(adapter.hasSession('nonexistent'));
  t.end();
});

test('PostgresWireAdapter - propagates sqlCore errors', async (t) => {
  const mock = {
    async executeRequest() {
      throw new Error('table not found');
    },
  };
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await adapter.authenticate('sess-1', {tenantId: 'tenant-a'});

  await t.rejects(
    adapter.execute('sess-1', 'SELECT * FROM missing'),
    /table not found/,
  );
  t.end();
});
