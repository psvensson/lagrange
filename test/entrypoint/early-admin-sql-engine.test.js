/**
 * Safety pins for the retired provisional admin SQL surface.
 *
 * Bootstrap remains independently reachable while startup is in progress.
 * The full admin/SQL surface must not exist until canonical startup authority,
 * infrastructure join, and transaction recovery have all completed.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  isEarlyAdminSqlEngineEnabled,
  startEarlyAdminSqlRuntime,
  shutdownEarlyAdminSqlRuntime,
} from '../../src/entrypoint-runtime-admin-composition.js';

const READY_RUNTIME = Object.freeze({
  nodeId: 'node-a',
  systemTableCache: {},
  messageRouter: {},
  partitionServices: new Map(),
  owner: {logger: null},
});

test('isEarlyAdminSqlEngineEnabled() is false after provisional admin retirement',
  (t) => {
    t.equal(isEarlyAdminSqlEngineEnabled(), false);
    t.end();
  });

test('provisional SQL runtime remains disabled even with complete inputs',
  async (t) => {
    t.equal(await startEarlyAdminSqlRuntime(null), null, 'null runtime → null');
    t.equal(
      await startEarlyAdminSqlRuntime({...READY_RUNTIME, messageRouter: null}),
      null, 'no messageRouter → null (cannot route a query yet)');
    t.equal(
      await startEarlyAdminSqlRuntime({...READY_RUNTIME, owner: null}),
      null, 'no owner → null (engine sub-services unavailable)');
    t.equal(
      await startEarlyAdminSqlRuntime(READY_RUNTIME),
      null,
      'complete provisional inputs still cannot open SQL before handoff',
    );
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
