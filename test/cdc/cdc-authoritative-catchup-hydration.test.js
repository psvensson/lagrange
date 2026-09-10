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
import {
  applyCDCIntegrationServiceCacheVisibilityWait,
} from '../../src/cdc/cdc-integration-service-cache-visibility-wait.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';

class AuthoritativeCatchupCacheRepairHost {}
applyCDCIntegrationServiceCacheVisibilityWait(
  AuthoritativeCatchupCacheRepairHost,
);

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

function createLeaderCatchupService(cache, rows, observedAtMs) {
  const service = new AuthoritativeCatchupCacheRepairHost();
  service.cacheMutationTarget = cache;
  service.systemTableCache = cache;
  service.getPrimaryKeyField = () => 'service_id';
  service.logger = {info() {}, warn() {}, debug() {}, error() {}};
  service.executeAuthoritativeSystemTableRead = async () => ({
    success: true,
    rows,
    source: 'owner_rpc_lane',
    readAuthorityWitness: {
      state: 'observed',
      partitionId: INITIAL_PARTITION_IDS.services,
      role: RAFT_ROLE.LEADER,
      servingNodeId: 'N1',
      servingReplicaId: 'services-p1-r1',
      observedAtMs,
    },
  });
  return service;
}

function hydrateServicesFromLeader(cache, rows, observedAtMs, options = {}) {
  return hydrateCdcPropagatedTablesFromAuthority(
    createLeaderCatchupService(cache, rows, observedAtMs),
    {tables: [TABLES.SERVICES], maxAttemptsPerTable: 1, ...options},
  );
}

test('authoritative DELETE repair requires observable post-apply proof', (t) => {
  const service = new AuthoritativeCatchupCacheRepairHost();
  service.cacheMutationTarget = {applySystemTableChange() {}};

  t.equal(
    service.applyAuthoritativeCacheRepair(
      TABLES.SERVICES,
      CDC_OPERATION.DELETE,
      {service_id: 'unobservable-delete'},
      'unobservable-delete',
    ),
    false,
    'a write-only or no-op target cannot report verified absence',
  );
  t.end();
});

test(
  'CL-014: an already-aligned authoritative catch-up is side-effect-idempotent',
  async (t) => {
    const cache = new SystemTableCache();
    const rows = Array.from({length: 64}, (_unused, index) => ({
      node_id: `node-aligned-${index}`,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 20_000,
      created_at: 1_000,
      updated_at: 2_000,
    }));
    const service = new AuthoritativeCatchupCacheRepairHost();
    service.cacheMutationTarget = cache;
    service.systemTableCache = cache;
    service.logger = {
      info() {},
      warn() {},
      debug() {},
      error() {},
    };
    service.getPrimaryKeyField = () => 'node_id';
    service.executeAuthoritativeSystemTableRead = async () => ({
      success: true,
      rows,
      source: 'local_partition_replica',
    });
    for (const row of rows) {
      service.applyAuthoritativeCacheRepair(
        TABLES.NODES,
        CDC_OPERATION.UPSERT,
        row,
        row.node_id,
      );
    }
    const baselineMutationVersion = cache.getTableMutationVersion(TABLES.NODES);
    const observedChanges = [];
    cache.onCacheChange((tableName, operation, record) => {
      observedChanges.push({tableName, operation, record});
    });

    const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
      tables: [TABLES.NODES],
      maxAttemptsPerTable: 1,
    });
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(summary.tablesHydrated, 1,
      'the authoritative table read still completes');
    t.equal(summary.rowsApplied, rows.length,
      'all aligned rows still satisfy the repair contract');
    t.equal(observedChanges.length, 0,
      'an aligned catch-up must not wake cache consumers');
    t.equal(cache.getTableMutationVersion(TABLES.NODES), baselineMutationVersion,
      'an aligned catch-up must not mint a new cache mutation generation');
  },
);

test(
  'CL-014: generic SERVICES catch-up retains non-lifecycle field repair',
  async (t) => {
    const cache = new SystemTableCache();
    const cachedRow = {
      service_id: 'replica-operations-p1-r2',
      service_type: 'partition',
      partition_id: 'replica_operations-p1',
      replica_id: 'replica-operations-p1-r2',
      node_id: 'node-b',
      address: 'node-b/partition/replica-operations-p1-r2',
      status: 'active',
      raft_role: 'follower',
      state_entered_at: 2_000,
      created_at: 1_000,
      updated_at: 2_000,
    };
    const authoritativeRow = {
      ...cachedRow,
      raft_role: 'leader',
    };
    const service = new AuthoritativeCatchupCacheRepairHost();
    service.cacheMutationTarget = cache;
    service.systemTableCache = cache;
    service.applyAuthoritativeCacheRepair(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      cachedRow,
      cachedRow.service_id,
    );
    const baselineMutationVersion =
      cache.getTableMutationVersion(TABLES.SERVICES);
    const observedChanges = [];
    cache.onCacheChange((tableName, operation, record) => {
      observedChanges.push({tableName, operation, record});
    });

    const applied = service.applyAuthoritativeCacheRepair(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      authoritativeRow,
      authoritativeRow.service_id,
    );
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(applied, true, 'the repair contract remains satisfied');
    t.equal(
      cache.get(TABLES.SERVICES, authoritativeRow.service_id)?.raft_role,
      'leader',
      'generic reconciliation must apply a changed routing field',
    );
    t.equal(observedChanges.length, 1,
      'a semantically changed row must still wake cache consumers');
    t.equal(
      cache.getTableMutationVersion(TABLES.SERVICES),
      baselineMutationVersion + 1,
      'a semantically changed row must mint one mutation generation',
    );
  },
);

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
    'anti-entropy sweep runs ONLY for a leader-witnessed owner read, never for ' +
      'an arbitrary owner replica, local replica, or failed read',
    async (t) => {
      const sweeps = [];
      const service = createServiceStub({
        readResults: {
          // A leader-witnessed owner read is complete enough to authorize a sweep.
          services: [
            {
              success: true,
              rows: [{id: 'svc-1'}],
              source: 'owner_rpc_lane',
              readAuthorityWitness: {
                state: 'observed',
                partitionId: INITIAL_PARTITION_IDS.services,
                role: RAFT_ROLE.LEADER,
                servingNodeId: 'N1',
                servingReplicaId: 'services-p1-r1',
                observedAtMs: 5100,
              },
            },
          ],
          // The owner-RPC lane may be served by a stale follower. It can
          // hydrate, but cannot authorize cache-only deletion.
          message_groups: [
            {
              success: true,
              rows: [],
              source: 'owner_rpc_lane',
              readAuthorityWitness: {
                state: 'observed',
                partitionId: INITIAL_PARTITION_IDS.message_groups,
                role: RAFT_ROLE.FOLLOWER,
                servingNodeId: 'N2',
                servingReplicaId: 'message_groups-p1-r2',
              },
            },
          ],
          // A leader-shaped witness without a causal observation time is not
          // sufficient authority for destructive reconciliation.
          partitions: [
            {
              success: true,
              rows: [],
              source: 'owner_rpc_lane',
              readAuthorityWitness: {
                state: 'observed',
                partitionId: INITIAL_PARTITION_IDS.partitions,
                role: RAFT_ROLE.LEADER,
                servingNodeId: 'N3',
                servingReplicaId: 'partitions-p1-r1',
              },
            },
          ],
          // Local-replica read (a possibly-lagging follower) -> must NOT sweep.
          tables: [
            {success: true, rows: [], source: 'local_partition_replica'},
          ],
          // Failed read -> must NOT sweep.
          nodes: [{success: false, error: 'unavailable'}],
        },
      });
      service.applyAuthoritativeCacheSweep = (tableName, rows, options) => {
        sweeps.push({tableName, rows, options});
        return 2;
      };

      const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
        tables: ['services', 'message_groups', 'partitions', 'tables', 'nodes'],
        maxAttemptsPerTable: 1,
        sleep: async () => {},
        now: () => 5000,
      });

      t.same(sweeps.map((s) => s.tableName), ['services'],
        'sweep runs only for the leader-witnessed owner read');
      t.same(sweeps[0].rows, [{id: 'svc-1'}], 'sweep gets the authoritative rows');
      t.equal(sweeps[0].options.readStartedAtMs, 5000,
        'sweep gets the read-start time');
      t.equal(sweeps[0].options.authoritativeObservedAtMs, 5100,
        'sweep gets the serving leader observation time');
      t.equal(summary.rowsSwept, 2, 'evicted count is accumulated');
    });
});

test('CL-014: a sweep without its pre-read causal proof fails closed', (t) => {
  const cache = new SystemTableCache();
  const row = {service_id: 'missing-proof', status: 'active', updated_at: 1000};
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, row);
  const service = new AuthoritativeCatchupCacheRepairHost();
  service.cacheMutationTarget = cache;
  service.systemTableCache = cache;
  const snapshot = service.captureAuthoritativeCacheSweepSnapshot(
    TABLES.SERVICES,
  );

  t.equal(service.applyAuthoritativeCacheSweep(
    TABLES.SERVICES,
    [],
    {authoritativeObservedAtMs: 1500},
  ), 0, 'a missing pre-read mutation snapshot cannot authorize deletion');
  t.equal(service.applyAuthoritativeCacheSweep(
    TABLES.SERVICES,
    [],
    {mutationSnapshot: snapshot},
  ), 0, 'a missing leader observation time cannot authorize deletion');
  t.ok(cache.has(TABLES.SERVICES, row.service_id),
    'both incomplete proof combinations preserve the cache row');
  t.end();
});

test('CL-014: malformed authoritative rows cannot mint absence truth', (t) => {
  const cache = new SystemTableCache();
  const existing = {
    service_id: 'preserved-on-malformed-read',
    status: 'active',
    updated_at: 1000,
  };
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.UPSERT,
    existing,
  );
  const service = new AuthoritativeCatchupCacheRepairHost();
  service.cacheMutationTarget = cache;
  service.systemTableCache = cache;
  service.getPrimaryKeyField = () => 'service_id';
  const snapshot = service.captureAuthoritativeCacheSweepSnapshot(
    TABLES.SERVICES,
  );

  t.equal(service.applyAuthoritativeCacheSweep(
    TABLES.SERVICES,
    [{status: 'missing-primary-key'}],
    {
      mutationSnapshot: snapshot,
      authoritativeObservedAtMs: 1500,
    },
  ), 0, 'a keyless row makes the complete-table proof unusable');
  t.ok(cache.has(TABLES.SERVICES, existing.service_id),
    'malformed authority cannot sweep a cached row');

  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
    service_id: 'unseen-after-malformed-read',
    updated_at: 1000,
    updated_at_hlc: '1000-0-owner',
  });
  t.ok(cache.has(TABLES.SERVICES, 'unseen-after-malformed-read'),
    'malformed authority cannot fence a previously unseen key');
  t.end();
});

test('CL-014: a successful non-array row set fails closed', async (t) => {
  const cache = new SystemTableCache();
  const service = new AuthoritativeCatchupCacheRepairHost();
  service.cacheMutationTarget = cache;
  service.systemTableCache = cache;
  service.getPrimaryKeyField = () => 'service_id';
  service.logger = {info() {}, warn() {}, debug() {}, error() {}};
  service.executeAuthoritativeSystemTableRead = async () => ({
    success: true,
    rows: null,
    source: 'owner_rpc_lane',
    readAuthorityWitness: {
      state: 'observed',
      partitionId: INITIAL_PARTITION_IDS.services,
      role: RAFT_ROLE.LEADER,
      servingNodeId: 'N1',
      servingReplicaId: 'services-p1-r1',
      observedAtMs: 1500,
    },
  });

  const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
    tables: [TABLES.SERVICES],
    maxAttemptsPerTable: 1,
  });

  t.equal(summary.tablesHydrated, 0,
    'invalid rows cannot count as a completed hydration');
  t.same(summary.tablesFailed, [TABLES.SERVICES],
    'the malformed table is reported as failed');
  t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), null,
    'invalid rows cannot mint the authoritative table watermark');
  t.end();
});

test(
  'CL-014: duplicate leader rows cannot use complete-presence authority',
  async (t) => {
    const cache = new SystemTableCache();
    await hydrateServicesFromLeader(cache, [], 150);
    const duplicateKey = 'duplicate-complete-presence';
    const summary = await hydrateServicesFromLeader(
      cache,
      [
        {service_id: duplicateKey, status: 'active', updated_at: 100},
        {service_id: duplicateKey, status: 'failed', updated_at: 110},
      ],
      200,
    );

    t.equal(summary.tablesHydrated, 0,
      'a conflicting complete row set is not called hydrated');
    t.same(summary.tablesFailed, [TABLES.SERVICES],
      'duplicate complete truth fails as one table unit');
    t.equal(cache.has(TABLES.SERVICES, duplicateKey), false,
      'invalid complete truth cannot bypass the earlier absence frontier');
    t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), 150,
      'invalid complete truth cannot advance the table frontier');
  },
);

test(
  'CL-014: invalid fallback key fails before any complete-presence apply',
  async (t) => {
    const cache = new SystemTableCache();
    await hydrateServicesFromLeader(cache, [], 150);
    const validKey = 'valid-before-invalid-key';
    const summary = await hydrateServicesFromLeader(
      cache,
      [
        {service_id: validKey, status: 'active', updated_at: 100},
        {service_id: 0, status: 'active', updated_at: 100},
      ],
      200,
    );

    t.equal(summary.tablesHydrated, 0,
      'the malformed complete set is not called hydrated');
    t.same(summary.tablesFailed, [TABLES.SERVICES],
      'the invalid fallback key produces a structured table failure');
    t.equal(cache.has(TABLES.SERVICES, validKey), false,
      'whole-set validation prevents a valid prefix from being installed');
    t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), 150,
      'the malformed set cannot advance the table frontier');
  },
);

test(
  'CL-014: full catch-up preserves a same-key apply that lands during its read',
  async (t) => {
    const cache = new SystemTableCache();
    const row = {
      service_id: 'same-key-catchup-race',
      status: 'active',
      updated_at: 1000,
    };
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, row);
    const service = new AuthoritativeCatchupCacheRepairHost();
    service.cacheMutationTarget = cache;
    service.systemTableCache = cache;
    service.getPrimaryKeyField = () => 'service_id';
    service.logger = {info() {}, warn() {}, debug() {}, error() {}};
    service.executeAuthoritativeSystemTableRead = async () => {
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, row);
      return {
        success: true,
        rows: [],
        source: 'owner_rpc_lane',
        readAuthorityWitness: {
          state: 'observed',
          partitionId: INITIAL_PARTITION_IDS.services,
          role: RAFT_ROLE.LEADER,
          servingNodeId: 'N1',
          servingReplicaId: 'services-p1-r1',
          observedAtMs: 1500,
        },
      };
    };

    const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
      tables: [TABLES.SERVICES],
      maxAttemptsPerTable: 1,
    });

    t.same(cache.get(TABLES.SERVICES, row.service_id), row,
      'the pre-read table snapshot protects an equal-value same-key apply');
    t.equal(summary.rowsSwept, 0, 'the raced row is not reported as swept');
  },
);

test(
  'CL-014: full catch-up upgrades a concurrent delete into a replay fence',
  async (t) => {
    const cache = new SystemTableCache();
    const row = {
      service_id: 'concurrent-delete-catchup-race',
      status: 'active',
      updated_at: 1000,
    };
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, row);
    const service = new AuthoritativeCatchupCacheRepairHost();
    service.cacheMutationTarget = cache;
    service.systemTableCache = cache;
    service.getPrimaryKeyField = () => 'service_id';
    service.logger = {info() {}, warn() {}, debug() {}, error() {}};
    service.executeAuthoritativeSystemTableRead = async () => {
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.DELETE, row);
      return {
        success: true,
        rows: [],
        source: 'owner_rpc_lane',
        readAuthorityWitness: {
          state: 'observed',
          partitionId: INITIAL_PARTITION_IDS.services,
          role: RAFT_ROLE.LEADER,
          servingNodeId: 'N1',
          servingReplicaId: 'services-p1-r1',
          observedAtMs: 1500,
        },
      };
    };

    const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
      tables: [TABLES.SERVICES],
      maxAttemptsPerTable: 1,
    });
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, row);

    t.equal(cache.has(TABLES.SERVICES, row.service_id), false,
      'the leader observation upgrades the ordinary delete before replay');
    t.equal(summary.rowsSwept, 0,
      'an already-absent row is fenced without reporting a second deletion');
  },
);

test(
  'CL-014: complete empty catch-up fences a buffered first CDC delivery',
  async (t) => {
    const cache = new SystemTableCache();
    const handler = new CDCHandler(cache, {bufferSize: 10});
    handler.initialize();
    handler.subscribe(TABLES.SERVICES);
    const delayedRow = {
      service_id: 'buffered-before-empty-catchup',
      status: 'active',
      updated_at: 100,
      updated_at_hlc: '100-0-owner',
    };
    t.equal(handler.handleEvent({
      tableName: TABLES.SERVICES,
      operation: CDC_OPERATION.UPDATE,
      data: delayedRow,
      timestamp: delayedRow.updated_at_hlc,
    }), true, 'the pre-observation CDC event is buffered');

    const service = new AuthoritativeCatchupCacheRepairHost();
    service.cacheMutationTarget = cache;
    service.systemTableCache = cache;
    service.getPrimaryKeyField = () => 'service_id';
    service.logger = {info() {}, warn() {}, debug() {}, error() {}};
    service.executeAuthoritativeSystemTableRead = async () => ({
      success: true,
      rows: [],
      source: 'owner_rpc_lane',
      readAuthorityWitness: {
        state: 'observed',
        partitionId: INITIAL_PARTITION_IDS.services,
        role: RAFT_ROLE.LEADER,
        servingNodeId: 'N1',
        servingReplicaId: 'services-p1-r1',
        observedAtMs: 150,
      },
    });

    const summary = await hydrateCdcPropagatedTablesFromAuthority(service, {
      tables: [TABLES.SERVICES],
      maxAttemptsPerTable: 1,
    });
    handler.flushBuffer(TABLES.SERVICES);

    t.equal(summary.tablesHydrated, 1,
      'the complete empty leader read hydrates the table');
    t.equal(cache.has(TABLES.SERVICES, delayedRow.service_id), false,
      'flushing the older buffered event cannot undo leader-observed absence');

    const successor = {
      ...delayedRow,
      status: 'starting',
      updated_at_hlc: '200-0-owner',
    };
    t.equal(handler.applyImmediate({
      tableName: TABLES.SERVICES,
      operation: CDC_OPERATION.UPDATE,
      data: successor,
      timestamp: successor.updated_at_hlc,
    }), true, 'the later CDC event reaches the cache owner');
    t.equal(cache.get(TABLES.SERVICES, successor.service_id)?.status, 'starting',
      'a causally later insert remains live');
    handler.shutdown();
  },
);

test(
  'CL-014: a later complete leader read restores an unseen fenced recreate',
  async (t) => {
    const cache = new SystemTableCache();
    const durableRow = {
      service_id: 'unseen-same-ms-recreate',
      status: 'active',
      updated_at: 150,
    };
    await hydrateServicesFromLeader(cache, [], 150);
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      ...durableRow,
      updated_at_hlc: '150-1-owner',
    });
    t.equal(cache.has(TABLES.SERVICES, durableRow.service_id), false,
      'same-millisecond CDC remains conservatively fenced');

    const summary = await hydrateServicesFromLeader(cache, [durableRow], 200);

    t.same(cache.get(TABLES.SERVICES, durableRow.service_id), durableRow,
      'newer complete leader presence repairs the bounded false negative');
    t.equal(summary.rowsApplied, 1,
      'the reported repair corresponds to a real cache apply');
    t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), 200,
      'the frontier advances only after the proven-present row is installed');
  },
);

test(
  'CL-014: complete leader presence supersedes a retained key tombstone',
  async (t) => {
    const cache = new SystemTableCache();
    const original = {
      service_id: 'known-same-ms-recreate',
      status: 'active',
      updated_at: 100,
      updated_at_hlc: '100-0-owner',
    };
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      original,
    );
    await hydrateServicesFromLeader(cache, [], 150);
    const durableRow = {
      service_id: original.service_id,
      status: 'starting',
      updated_at: 150,
    };
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      ...durableRow,
      updated_at_hlc: '150-1-owner',
    });
    t.equal(cache.has(TABLES.SERVICES, durableRow.service_id), false,
      'the retained authoritative key tombstone fences ambiguous CDC');

    await hydrateServicesFromLeader(cache, [durableRow], 200, {
      now: () => Date.now() + 1,
    });

    t.same(cache.get(TABLES.SERVICES, durableRow.service_id), durableRow,
      'complete leader presence supersedes both retained fence layers');
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      ...durableRow,
      status: 'active',
    });
    t.equal(cache.get(TABLES.SERVICES, durableRow.service_id)?.status, 'active',
      'the superseded key tombstone no longer intercepts ordinary merges');
  },
);

test(
  'CL-014: an out-of-order complete leader observation cannot regress truth',
  async (t) => {
    const cache = new SystemTableCache();
    await hydrateServicesFromLeader(cache, [], 200);
    const staleDurableRow = {
      service_id: 'stale-complete-presence',
      status: 'active',
      updated_at: 100,
    };

    const summary = await hydrateServicesFromLeader(
      cache,
      [staleDurableRow],
      150,
    );

    t.equal(summary.tablesHydrated, 0,
      'the non-advancing complete observation is not called hydrated');
    t.same(summary.tablesFailed, [TABLES.SERVICES],
      'the stale table observation fails closed');
    t.equal(summary.rowsApplied, 0,
      'no row is reported as repaired by stale complete truth');
    t.equal(cache.has(TABLES.SERVICES, staleDurableRow.service_id), false,
      'an older complete observation cannot resurrect a missing key');
    t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), 200,
      'the complete-table frontier remains monotonic');
  },
);

test(
  'CL-014: complete presence cannot overtake a concurrent newer delete',
  async (t) => {
    const cache = new SystemTableCache();
    const durableRow = {
      service_id: 'deleted-during-complete-read',
      status: 'active',
      updated_at: 100,
      updated_at_hlc: '100-0-owner',
    };
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      durableRow,
    );
    const service = createLeaderCatchupService(cache, [durableRow], 200);
    const leaderResult = service.executeAuthoritativeSystemTableRead;
    service.executeAuthoritativeSystemTableRead = async (...args) => {
      cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.DELETE,
        {...durableRow, updated_at: 300, updated_at_hlc: '300-0-owner'},
      );
      return leaderResult(...args);
    };

    const summary = await hydrateCdcPropagatedTablesFromAuthority(
      service,
      {tables: [TABLES.SERVICES], maxAttemptsPerTable: 1},
    );

    t.equal(cache.has(TABLES.SERVICES, durableRow.service_id), false,
      'leader presence observed at 200 cannot erase a delete at 300');
    t.equal(summary.rowsApplied, 0,
      'a causally fenced repair is not reported as applied');
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPDATE,
      durableRow,
    );
    t.equal(cache.has(TABLES.SERVICES, durableRow.service_id), false,
      'the newer delete tombstone remains available to fence replay');
  },
);

test(
  'CL-014: post-snapshot delete precedes a later response witness',
  async (t) => {
    const cache = new SystemTableCache();
    const durableRow = {
      service_id: 'deleted-between-snapshot-and-witness',
      status: 'active',
      updated_at: 100,
      updated_at_hlc: '100-0-owner',
    };
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      durableRow,
    );
    const service = createLeaderCatchupService(cache, [durableRow], 200);
    const leaderResult = service.executeAuthoritativeSystemTableRead;
    service.executeAuthoritativeSystemTableRead = async (...args) => {
      cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.DELETE,
        {...durableRow, updated_at: 199, updated_at_hlc: '199-0-owner'},
      );
      return leaderResult(...args);
    };

    const summary = await hydrateCdcPropagatedTablesFromAuthority(
      service,
      {
        tables: [TABLES.SERVICES],
        maxAttemptsPerTable: 1,
        now: () => 100,
      },
    );

    t.equal(cache.has(TABLES.SERVICES, durableRow.service_id), false,
      'a post-snapshot delete survives even when the witness is later');
    t.equal(summary.rowsApplied, 0,
      'the stale snapshot row is not reported as repaired');
  },
);
