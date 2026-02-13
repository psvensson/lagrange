/**
 * Tests for InternalSqlAdapter.
 * Verifies that internal SQL calls are normalized into canonical
 * SqlRequest objects and delegated to SqlCore.
 *
 * Requirements: 1.1, 1.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {InternalSqlAdapter} from '../../src/query/internal-sql-adapter.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
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

test('InternalSqlAdapter - throws when sqlCore is missing', (t) => {
  t.throws(
    () => new InternalSqlAdapter(),
    /SqlCore.*required/,
  );
  t.end();
});

test('InternalSqlAdapter - execute delegates to sqlCore', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new InternalSqlAdapter({sqlCore: mock});

  const result = await adapter.execute('SELECT 1');

  t.equal(mock.calls.length, 1);
  t.equal(mock.calls[0].statement, 'SELECT 1');
  t.same(mock.calls[0].parameters, []);
  t.equal(mock.calls[0].executionMode, EXECUTION_MODE.SQL_STATEMENT);
  t.ok(result.success);
  t.end();
});

test('InternalSqlAdapter - passes parameters to sqlCore', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new InternalSqlAdapter({sqlCore: mock});

  await adapter.execute('SELECT * FROM t WHERE id = ?', [42]);

  t.equal(mock.calls[0].statement, 'SELECT * FROM t WHERE id = ?');
  t.same(mock.calls[0].parameters, [42]);
  t.end();
});

test('InternalSqlAdapter - passes sessionId to sqlCore', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new InternalSqlAdapter({sqlCore: mock});

  await adapter.execute('SELECT 1', [], {sessionId: 'sess-42'});

  t.equal(mock.calls[0].sessionId, 'sess-42');
  t.end();
});

test('InternalSqlAdapter - buildRequest returns valid SqlRequest', (t) => {
  const mock = createMockSqlCore();
  const adapter = new InternalSqlAdapter({sqlCore: mock});

  const req = adapter.buildRequest('INSERT INTO t VALUES (1)');

  t.ok(isSqlRequest(req));
  t.equal(req.statement, 'INSERT INTO t VALUES (1)');
  t.equal(req.executionMode, EXECUTION_MODE.SQL_STATEMENT);
  t.equal(req.tenantId, 'system');
  t.ok(Object.isFrozen(req));
  t.end();
});

test('InternalSqlAdapter - buildRequest accepts overrides', (t) => {
  const mock = createMockSqlCore();
  const adapter = new InternalSqlAdapter({sqlCore: mock});

  const req = adapter.buildRequest('SELECT 1', [1], {
    tenantId: 'tenant-x',
    sessionId: 'sess-x',
    hints: {preferLookup: true},
  });

  t.equal(req.tenantId, 'tenant-x');
  t.equal(req.sessionId, 'sess-x');
  t.same(req.parameters, [1]);
  t.ok(req.hints.preferLookup);
  t.end();
});

test('InternalSqlAdapter - propagates sqlCore errors', async (t) => {
  const mock = {
    async executeRequest() {
      throw new Error('partition unavailable');
    },
  };
  const adapter = new InternalSqlAdapter({sqlCore: mock});

  await t.rejects(
    adapter.execute('SELECT 1'),
    /partition unavailable/,
  );
  t.end();
});
