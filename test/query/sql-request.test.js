/**
 * Tests for the canonical SqlRequest model.
 */

import {test} from '../../src/test-helpers/tap.js';
import {createSqlRequest, isSqlRequest} from '../../src/query/sql-request.js';
import {EXECUTION_MODE} from '../../src/query/sql-adapter-constants.js';
import {
  DEFAULT_QUERY_BUDGET,
  QUERY_BUDGET_NORMALIZATION_ERROR_MSG,
} from '../../src/wasm-service/query-budget-constants.js';

test('createSqlRequest - creates frozen request with defaults', (t) => {
  const req = createSqlRequest({statement: 'SELECT 1'});

  t.equal(req.statement, 'SELECT 1');
  t.equal(req.tenantId, 'system');
  t.equal(req.sessionId, 'default');
  t.same(req.parameters, []);
  t.equal(req.executionMode, EXECUTION_MODE.SQL_STATEMENT);
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

test('createSqlRequest - defensively freezes server security context', (t) => {
  const roles = ['service-operator'];
  const securityContext = {
    tenantId: 'tenant-a',
    principal: 'alice',
    roles,
  };
  const req = createSqlRequest({
    statement: 'SHOW SERVICES',
    securityContext,
  });

  roles.push('attacker');
  securityContext.principal = 'mallory';
  t.same(req.securityContext, {
    tenantId: 'tenant-a',
    principal: 'alice',
    roles: ['service-operator'],
  });
  t.ok(Object.isFrozen(req.securityContext));
  t.ok(Object.isFrozen(req.securityContext.roles));
  t.ok(isSqlRequest(req));
  t.end();
});

test('createSqlRequest - rejects malformed security context', (t) => {
  t.throws(() => createSqlRequest({
    statement: 'SHOW SERVICES',
    securityContext: {
      tenantId: 'tenant-a',
      principal: 'alice',
      roles: 'operator',
    },
  }), /security context/iu);
  t.end();
});

test('createSqlRequest - rejects tenant and security-context mismatch', (t) => {
  t.throws(() => createSqlRequest({
    statement: 'SHOW SERVICES',
    tenantId: 'tenant-b',
    securityContext: {
      tenantId: 'tenant-a',
      principal: 'alice',
      roles: ['service-operator'],
    },
  }), /security context/iu);
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

test('createSqlRequest - carries every limit by its canonical name', (t) => {
  const override = 42;
  for (const field of Object.keys(DEFAULT_QUERY_BUDGET)) {
    const request = createSqlRequest({
      statement: 'SELECT 1',
      budgets: {[field]: override},
    });
    t.equal(request.budgets[field], override, `${field} preserves the override`);
    t.same(
      Object.keys(request.budgets),
      Object.keys(DEFAULT_QUERY_BUDGET),
      `${field}: the request budget holds exactly the canonical limits`,
    );
    t.ok(Object.isFrozen(request.budgets));
  }
  t.end();
});

test('createSqlRequest - refuses unknown, misspelled or non-canonical budget fields', (t) => {
  for (const budgets of [
    {resultMaxRows: 5},
    {resultMaxRow: 5},
    {RESULT_MAX_ROW: 5},
    {RESULT_MAX_ROWS: 5, resultMaxRows: 5},
  ]) {
    t.throws(
      () => createSqlRequest({statement: 'SELECT 1', budgets}),
      new RegExp(QUERY_BUDGET_NORMALIZATION_ERROR_MSG.UNKNOWN_BUDGET_FIELD),
      `${Object.keys(budgets).join(',')} is refused, not defaulted`,
    );
  }
  t.end();
});

test('createSqlRequest - refuses limits that are not non-negative safe integers', (t) => {
  for (const limit of ['7', -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1, null, undefined, true]) {
    t.throws(
      () => createSqlRequest({statement: 'SELECT 1', budgets: {RESULT_MAX_ROWS: limit}}),
      new RegExp(QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_LIMIT),
      `RESULT_MAX_ROWS=${String(limit)} is refused`,
    );
  }
  t.equal(
    createSqlRequest({statement: 'SELECT 1', budgets: {RESULT_MAX_ROWS: 0}})
      .budgets.RESULT_MAX_ROWS,
    0,
  );
  for (const budgets of [null, [], 'RESULT_MAX_ROWS=5', new Map()]) {
    t.throws(
      () => createSqlRequest({statement: 'SELECT 1', budgets}),
      new RegExp(QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_OBJECT),
    );
  }
  t.end();
});

test('isSqlRequest - refuses a request whose budget is not normalized', (t) => {
  const request = createSqlRequest({statement: 'SELECT 1'});
  t.ok(isSqlRequest(request));
  t.notOk(isSqlRequest({...request, budgets: undefined}));
  t.notOk(isSqlRequest({...request, budgets: Object.freeze({})}));
  t.notOk(isSqlRequest({...request, budgets: {...request.budgets}}), 'unfrozen');
  t.notOk(isSqlRequest({
    ...request,
    budgets: Object.freeze({...request.budgets, resultMaxRows: 1}),
  }));
  t.notOk(isSqlRequest({
    ...request,
    budgets: Object.freeze({...request.budgets, RESULT_MAX_ROWS: '1'}),
  }));
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

test('createSqlRequest - dialect defaults to null', (t) => {
  const req = createSqlRequest({statement: 'SELECT 1'});
  t.equal(req.dialect, null);
  t.end();
});

test('createSqlRequest - accepts explicit dialect string', (t) => {
  const req = createSqlRequest({
    statement: 'SELECT 1',
    dialect: 'postgresql',
  });
  t.equal(req.dialect, 'postgresql');
  t.end();
});

test('isSqlRequest - accepts request with dialect null', (t) => {
  const req = createSqlRequest({statement: 'SELECT 1'});
  t.ok(isSqlRequest(req));
  t.equal(req.dialect, null);
  t.end();
});

test('isSqlRequest - accepts request with dialect string', (t) => {
  const req = createSqlRequest({
    statement: 'SELECT 1',
    dialect: 'postgresql',
  });
  t.ok(isSqlRequest(req));
  t.end();
});

test('isSqlRequest - rejects non-string dialect', (t) => {
  const fake = {
    statement: 'SELECT 1',
    parameters: [],
    tenantId: 'system',
    sessionId: 'default',
    executionMode: EXECUTION_MODE.SQL_STATEMENT,
    dialect: 123,
  };
  t.notOk(isSqlRequest(fake));
  t.end();
});

test('isSqlRequest - returns false for incomplete objects', (t) => {
  t.notOk(isSqlRequest({statement: 'SELECT 1'}));
  t.notOk(isSqlRequest({statement: 'SELECT 1', parameters: []}));
  t.end();
});
