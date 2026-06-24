/**
 * Falsifier + safety pins for the early-admin SQL engine lever
 * (default-off LAGRANGE_EARLY_ADMIN_SQL_ENGINE).
 *
 * A still-joining/bootstrapping node brings up its admin runtime BEFORE the
 * authoritative SQL engine exists (built from post-join artifacts). In that
 * window admin SQL reads fail `QUERY_ENGINE_UNAVAILABLE` — and under load that
 * window can span the whole readiness budget (rolling-restart gate
 * stat-gate-20260623T183833Z: a 30s acknowledged-write visibility query failing
 * "SQL query engine not available" was the actual scenario-failing assertion).
 *
 * The lever builds a provisional cache-backed engine for that early window,
 * superseded by the authoritative engine post-join (attachSqlEngineToAdminRuntime)
 * and then disposed. This test pins the externally-observable safety contract:
 *  - flag-off is byte-identical (no early engine; the legacy `null` is preserved),
 *  - flag-on degrades safely to null when the runtime cannot support an engine,
 *  - the dispose path tears down ONLY the early engine's own sub-services and is
 *    null-safe + error-swallowing.
 * The flag-on full-engine-construction + gate-fix is validated by the integration
 * gate (a real owner/runtime is required to construct SQLQueryEngine).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  isEarlyAdminSqlEngineEnabled,
  startEarlyAdminSqlRuntime,
  shutdownEarlyAdminSqlRuntime,
} from '../../src/entrypoint-runtime-admin-composition.js';

const FLAG = 'LAGRANGE_EARLY_ADMIN_SQL_ENGINE';

function withFlag(t, value) {
  const previous = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  t.teardown(() => {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  });
}

const READY_RUNTIME = Object.freeze({
  nodeId: 'node-a',
  systemTableCache: {},
  messageRouter: {},
  partitionServices: new Map(),
  owner: {logger: null},
});

test('flag default-off: isEarlyAdminSqlEngineEnabled() is false', (t) => {
  withFlag(t, undefined);
  t.equal(isEarlyAdminSqlEngineEnabled(), false);
  t.end();
});

test('flag off: startEarlyAdminSqlRuntime returns null (legacy null engine preserved)',
  async (t) => {
    withFlag(t, undefined);
    const result = await startEarlyAdminSqlRuntime(READY_RUNTIME);
    t.equal(result, null,
      'no early engine is built when the lever is off — byte-identical path');
    t.end();
  });

test('flag on but runtime missing messageRouter/owner: degrades to null (no throw)',
  async (t) => {
    withFlag(t, 'true');
    t.equal(isEarlyAdminSqlEngineEnabled(), true);
    t.equal(await startEarlyAdminSqlRuntime(null), null, 'null runtime → null');
    t.equal(
      await startEarlyAdminSqlRuntime({...READY_RUNTIME, messageRouter: null}),
      null, 'no messageRouter → null (cannot route a query yet)');
    t.equal(
      await startEarlyAdminSqlRuntime({...READY_RUNTIME, owner: null}),
      null, 'no owner → null (engine sub-services unavailable)');
    t.end();
  });

test('shutdownEarlyAdminSqlRuntime: null-safe', async (t) => {
  await shutdownEarlyAdminSqlRuntime(null);
  await shutdownEarlyAdminSqlRuntime(undefined);
  t.pass('disposing a null early runtime is a no-op');
  t.end();
});

test('shutdownEarlyAdminSqlRuntime: detaches migration recovery + shuts the engine down',
  async (t) => {
    let detached = 0;
    let shutdownCalls = 0;
    await shutdownEarlyAdminSqlRuntime({
      detachMigrationRecovery: () => {
        detached++;
      },
      sqlQueryEngine: {
        shutdown: async () => {
          shutdownCalls++;
        },
      },
    });
    t.equal(detached, 1, 'migration recovery detached exactly once');
    t.equal(shutdownCalls, 1, 'early engine shut down exactly once');
    t.end();
  });

test('shutdownEarlyAdminSqlRuntime: swallows detach/shutdown errors (best-effort)',
  async (t) => {
    let shutdownCalls = 0;
    await t.resolves(shutdownEarlyAdminSqlRuntime({
      detachMigrationRecovery: () => {
        throw new Error('detach boom');
      },
      sqlQueryEngine: {
        shutdown: async () => {
          shutdownCalls++;
          throw new Error('shutdown boom');
        },
      },
    }), 'a throwing detach/shutdown never propagates out of dispose');
    t.equal(shutdownCalls, 1, 'shutdown is still attempted after a detach throw');
    t.end();
  });

test('shutdownEarlyAdminSqlRuntime: tolerates an engine without a shutdown method',
  async (t) => {
    await t.resolves(
      shutdownEarlyAdminSqlRuntime({sqlQueryEngine: {}, detachMigrationRecovery: null}),
      'a missing shutdown method is a no-op, not a crash');
    t.end();
  });
