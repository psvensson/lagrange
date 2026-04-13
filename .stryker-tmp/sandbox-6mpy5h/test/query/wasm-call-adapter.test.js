/**
 * Tests for WasmCallAdapter.
 * Verifies that DB.call(select, fn) is normalized into a canonical
 * SqlRequest with PARTITION_CALLBACK mode and delegated to SqlCore.
 *
 * Requirements: 1.1, 4.1, 4.2
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {WasmCallAdapter} from '../../src/query/wasm-call-adapter.js';
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
      return {success: true, rows: [{id: 1}], affectedRows: 0};
    },
  };
}

const VALID_CALLBACK = Object.freeze({
  moduleRef: 'orders-score-v3',
  exportName: 'run_batch',
});

test('WasmCallAdapter - throws when sqlCore is missing', (t) => {
  t.throws(
    () => new WasmCallAdapter(),
    /SqlCore.*required/,
  );
  t.end();
});

test('WasmCallAdapter - call delegates to sqlCore', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  const result = await adapter.call(
    'SELECT * FROM orders',
    VALID_CALLBACK,
  );

  t.equal(mock.calls.length, 1);
  t.equal(mock.calls[0].statement, 'SELECT * FROM orders');
  t.same(mock.calls[0].parameters, []);
  t.equal(mock.calls[0].executionMode, EXECUTION_MODE.PARTITION_CALLBACK);
  t.ok(result.success);
  // Adapter must NOT attach callback metadata to the result;
  // SqlRequest already carries it and SqlCore owns dispatch.
  t.equal(result.callbackModuleRef, undefined);
  t.equal(result.callbackExport, undefined);
  t.equal(result.executionMode, undefined);
  t.end();
});

test('WasmCallAdapter - call passes parameters', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  await adapter.call(
    'SELECT * FROM orders WHERE status = ?',
    VALID_CALLBACK,
    {parameters: ['active']},
  );

  t.same(mock.calls[0].parameters, ['active']);
  t.end();
});

test('WasmCallAdapter - call requires select statement', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  await t.rejects(
    adapter.call('', VALID_CALLBACK),
    /SELECT statement is required/,
  );
  t.end();
});

test('WasmCallAdapter - call requires non-string rejects', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  await t.rejects(
    adapter.call(123, VALID_CALLBACK),
    /SELECT statement is required/,
  );
  t.end();
});

test('WasmCallAdapter - call requires callback ref', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  await t.rejects(
    adapter.call('SELECT 1', null),
    /callback function reference is required/,
  );
  t.end();
});

test('WasmCallAdapter - call requires moduleRef', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  await t.rejects(
    adapter.call('SELECT 1', {exportName: 'run'}),
    /callback function reference is required/,
  );
  t.end();
});

test('WasmCallAdapter - call requires exportName', async (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  await t.rejects(
    adapter.call('SELECT 1', {moduleRef: 'mod-1'}),
    /callback function reference is required/,
  );
  t.end();
});

test('WasmCallAdapter - buildRequest returns valid SqlRequest', (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  const req = adapter.buildRequest(
    'SELECT * FROM orders',
    VALID_CALLBACK,
  );

  t.ok(isSqlRequest(req));
  t.equal(req.executionMode, EXECUTION_MODE.PARTITION_CALLBACK);
  t.equal(req.callbackModuleRef, 'orders-score-v3');
  t.equal(req.callbackExport, 'run_batch');
  t.equal(req.statement, 'SELECT * FROM orders');
  t.ok(Object.isFrozen(req));
  t.end();
});

test('WasmCallAdapter - buildRequest accepts overrides', (t) => {
  const mock = createMockSqlCore();
  const adapter = new WasmCallAdapter({sqlCore: mock});

  const req = adapter.buildRequest(
    'SELECT * FROM orders',
    VALID_CALLBACK,
    {
      tenantId: 'tenant-x',
      sessionId: 'sess-x',
      parameters: [1, 2],
      hints: {preferLookup: true},
    },
  );

  t.equal(req.tenantId, 'tenant-x');
  t.equal(req.sessionId, 'sess-x');
  t.same(req.parameters, [1, 2]);
  t.ok(req.hints.preferLookup);
  t.end();
});

test('WasmCallAdapter - propagates sqlCore errors', async (t) => {
  const mock = {
    async executeRequest() {
      throw new Error('partition unavailable');
    },
  };
  const adapter = new WasmCallAdapter({sqlCore: mock});

  await t.rejects(
    adapter.call('SELECT 1', VALID_CALLBACK),
    /partition unavailable/,
  );
  t.end();
});
