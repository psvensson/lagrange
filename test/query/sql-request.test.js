/**
 * Tests for the canonical SqlRequest model.
 */

import {test} from '../../src/test-helpers/tap.js';
import {createSqlRequest, isSqlRequest} from '../../src/query/sql-request.js';
import {EXECUTION_MODE} from '../../src/query/sql-adapter-constants.js';
import {DEFAULT_QUERY_BUDGET} from '../../src/wasm-service/query-budget-constants.js';

test('createSqlRequest - creates frozen request with defaults', (t) => {
  const req = createSqlRequest({statement: 'SELECT 1'});

  t.equal(req.statement, 'SELECT 1');
  t.equal(req.tenantId, 'system');
  t.equal(req.sessionId, 'default');
  t.same(req.parameters, []);
  t.equal(req.executionMode, EXECUTION_MODE.SQL_STATEMENT);
  t.equal(req.callbackModuleRef, null);
  t.equal(req.callbackExport, null);
  t.equal(req.hints, null);
  t.ok(Object.isFrozen(req));
  t.ok(Object.isFrozen(req.budgets));
  t.end();
});

test('createSqlRequest - accepts explicit fields', (t) => {
  const req = createSqlRequest({
    statement: 'SELECT * FROM users',
    parameters: [42],
    tenantId: 'tenant-a',
    sessionId: 'sess-1',
    executionMode: EXECUTION_MODE.SQL_STATEMENT,
    hints: {preferBroadcast: true},
  });

  t.equal(req.tenantId, 'tenant-a');
  t.equal(req.sessionId, 'sess-1');
  t.same(req.parameters, [42]);
  t.ok(req.hints);
  t.equal(req.hints.preferBroadcast, true);
  t.ok(Object.isFrozen(req.hints));
  t.end();
});

test('createSqlRequest - partition_callback requires module ref', (t) => {
  t.throws(() => {
    createSqlRequest({
      statement: 'SELECT * FROM orders',
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackExport: 'run_batch',
    });
  }, /callbackModuleRef is required/);
  t.end();
});

test('createSqlRequest - partition_callback requires export', (t) => {
  t.throws(() => {
    createSqlRequest({
      statement: 'SELECT * FROM orders',
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef: 'mod-1',
    });
  }, /callbackExport is required/);
  t.end();
});

test('createSqlRequest - throws on missing statement', (t) => {
  t.throws(() => createSqlRequest({}), /statement.*required/i);
  t.end();
});

test('createSqlRequest - throws on non-string statement', (t) => {
  t.throws(() => createSqlRequest({statement: 123}), /must be a string/);
  t.end();
});

test('createSqlRequest - throws on non-array parameters', (t) => {
  t.throws(
    () => createSqlRequest({statement: 'SELECT 1', parameters: 'bad'}),
    /must be an array/,
  );
  t.end();
});

test('createSqlRequest - merges budget overrides', (t) => {
  const req = createSqlRequest({
    statement: 'SELECT 1',
    budgets: {LOOKUP_MAX_KEYS: 5},
  });

  t.equal(req.budgets.LOOKUP_MAX_KEYS, 5);
  // Other defaults preserved
  t.equal(
    req.budgets.EMIT_MAX_BYTES,
    DEFAULT_QUERY_BUDGET.EMIT_MAX_BYTES,
  );
  t.end();
});

test('isSqlRequest - returns true for valid request', (t) => {
  const req = createSqlRequest({statement: 'SELECT 1'});
  t.ok(isSqlRequest(req));
  t.end();
});

test('isSqlRequest - returns false for non-objects', (t) => {
  t.notOk(isSqlRequest(null));
  t.notOk(isSqlRequest(undefined));
  t.notOk(isSqlRequest('string'));
  t.notOk(isSqlRequest(42));
  t.end();
});

test('isSqlRequest - returns false for incomplete objects', (t) => {
  t.notOk(isSqlRequest({statement: 'SELECT 1'}));
  t.notOk(isSqlRequest({statement: 'SELECT 1', parameters: []}));
  t.end();
});
