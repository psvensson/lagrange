/**
 * Tests for SQL Execution Guard.
 * Verifies fail-fast behavior for single-engine policy.
 *
 * Requirements: 1.3, 1.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  registerSqlCore,
  isSqlCoreRegistered,
  resetSqlCoreGuard,
  rejectFallbackExecution,
} from '../../src/query/sql-execution-guard.js';

test('registerSqlCore - first registration succeeds', (t) => {
  resetSqlCoreGuard();
  t.notOk(isSqlCoreRegistered());

  registerSqlCore({});
  t.ok(isSqlCoreRegistered());

  resetSqlCoreGuard();
  t.end();
});

test('registerSqlCore - second registration throws', (t) => {
  resetSqlCoreGuard();

  registerSqlCore({});

  t.throws(
    () => registerSqlCore({}),
    /second SQL execution path is not allowed/,
  );

  resetSqlCoreGuard();
  t.end();
});

test('rejectFallbackExecution - always throws with reason', (t) => {
  t.throws(
    () => rejectFallbackExecution('unsupported LATERAL JOIN'),
    /Alternate SQL execution path rejected.*unsupported LATERAL JOIN/,
  );
  t.end();
});

test('resetSqlCoreGuard - allows re-registration', (t) => {
  resetSqlCoreGuard();
  registerSqlCore({});
  t.ok(isSqlCoreRegistered());

  resetSqlCoreGuard();
  t.notOk(isSqlCoreRegistered());

  // Should succeed again after reset
  registerSqlCore({});
  t.ok(isSqlCoreRegistered());

  resetSqlCoreGuard();
  t.end();
});
