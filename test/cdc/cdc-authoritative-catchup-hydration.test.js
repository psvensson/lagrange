/**
 * CL-014 guards: post-subscription catch-up hydration must close the
 * (bootstrap-snapshot, fan-out-targetability] window for ALL CDC-propagated
 * tables, best-effort per table, never blocking the caller.
 *
 * Production witness (stat-gate-20260611T110228Z run2): remote CDC fan-out
 * is point-in-time with no replay; all four joiners stayed frozen at
 * publication epoch 1 while the owner committed epochs 2-5 inside the
 * window — the root of the scenario's historical CONVERGED/STALLED
 * non-determinism (a run converged iff the last publication write
 * postdated the last joiner's targetability).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  hydrateCdcPropagatedTablesFromAuthority,
} from '../../src/cdc/cdc-integration-service-authoritative-catchup.js';
function createServiceStub({readResults}) {
  const applied = [];
  const reads = [];
  return {
    applied,
    reads,
    logger: {info: () => {}, warn: () => {}, debug: () => {}, error: () => {}},
    getPrimaryKeyField: () => 'id',
    executeAuthoritativeSystemTableRead: async (tableName) => {
      reads.push(tableName);
      const queue = readResults[tableName];
      if (!queue || queue.length === 0) {
        return {success: false, error: 'unavailable'};
      }
      const next = queue.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    applyAuthoritativeCacheRepair: (tableName, operation, row, key) => {
      applied.push({tableName, operation, key});
      return true;
    },
  };
}

test('CL-014: authoritative catch-up hydration', async (t) => {
  await t.test('applies all rows from every readable table', async (t) => {
    const service = createServiceStub({
      readResults: {
        control_plane_publications: [
          {success: true, rows: [{id: 'pub-5', epoch: 5}, {id: 'pub-4', epoch: 4}]},
        ],
        nodes: [{success: true, rows: [{id: 'node-1'}]}],
      },
    });

    const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
      tables: ['control_plane_publications', 'nodes'],
      sleep: async () => {},
    });

    t.equal(summary.tablesAttempted, 2, 'both tables attempted');
    t.equal(summary.tablesHydrated, 2, 'both tables hydrated');
    t.equal(summary.rowsApplied, 3, 'all rows applied');
    t.same(summary.tablesFailed, [], 'no failures');
    t.same(
      service.applied.map((entry) => entry.key),
      ['pub-5', 'pub-4', 'node-1'],
      'rows applied through the canonical repair path',
    );
  });

  await t.test(
    'pressure-deferred reads retry within bounds, then record failure ' +
      'and continue to the next table',
    async (t) => {
      const sleeps = [];
      const service = createServiceStub({
        readResults: {
          control_plane_publications: [
            {success: false, error: 'pressure', retryAfterMs: 25, deferRetry: true},
            {success: false, error: 'pressure', retryAfterMs: 25, deferRetry: true},
            {success: false, error: 'pressure', retryAfterMs: 25, deferRetry: true},
          ],
          services: [{success: true, rows: [{id: 'svc-1'}]}],
        },
      });

      const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
        tables: ['control_plane_publications', 'services'],
        maxAttemptsPerTable: 3,
        sleep: async (delayMs) => {
          sleeps.push(delayMs);
        },
      });

      t.same(
        summary.tablesFailed,
        ['control_plane_publications'],
        'exhausted table recorded as failed',
      );
      t.equal(summary.tablesHydrated, 1, 'later table still hydrated');
      t.equal(sleeps.length, 2, 'bounded retries slept between attempts');
      t.same(sleeps, [25, 25], 'honors retryAfterMs');
    },
  );

  await t.test('a throwing read never escapes', async (t) => {
    const service = createServiceStub({
      readResults: {
        control_plane_publications: [new Error('boom')],
        services: [{success: true, rows: []}],
      },
    });

    const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
      tables: ['control_plane_publications', 'services'],
      sleep: async () => {},
    });

    t.same(summary.tablesFailed, ['control_plane_publications']);
    t.equal(summary.tablesHydrated, 1, 'remaining tables processed');
  });

  await t.test('rows without a primary key are skipped safely', async (t) => {
    const service = createServiceStub({
      readResults: {
        services: [{success: true, rows: [{id: 'ok'}, {other: 'no-key'}]}],
      },
    });
    const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
      tables: ['services'],
      sleep: async () => {},
    });
    t.equal(summary.rowsApplied, 1, 'keyless row skipped');
    t.equal(summary.tablesHydrated, 1, 'table still counts as hydrated');
  });

  await t.test(
    'anti-entropy sweep runs ONLY for an owner-authoritative read, never for ' +
      'a local-replica or failed read',
    async (t) => {
      const sweeps = [];
      const service = createServiceStub({
        readResults: {
          // Owner-authoritative read -> safe to sweep.
          services: [
            {success: true, rows: [{id: 'svc-1'}], source: 'owner_rpc_lane'},
          ],
          // Local-replica read (a possibly-lagging follower) -> must NOT sweep.
          tables: [
            {success: true, rows: [], source: 'local_partition_replica'},
          ],
          // Failed read -> must NOT sweep.
          nodes: [{success: false, error: 'unavailable'}],
        },
      });
      service.applyAuthoritativeCacheSweep = (tableName, rows, readStartedAtMs) => {
        sweeps.push({tableName, rows, readStartedAtMs});
        return 2;
      };

      const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
        tables: ['services', 'tables', 'nodes'],
        maxAttemptsPerTable: 1,
        sleep: async () => {},
        now: () => 5000,
      });

      t.same(sweeps.map((s) => s.tableName), ['services'],
        'sweep runs only for the owner-authoritative read');
      t.same(sweeps[0].rows, [{id: 'svc-1'}], 'sweep gets the authoritative rows');
      t.equal(sweeps[0].readStartedAtMs, 5000, 'sweep gets the read-start time');
      t.equal(summary.rowsSwept, 2, 'evicted count is accumulated');
    });
});
