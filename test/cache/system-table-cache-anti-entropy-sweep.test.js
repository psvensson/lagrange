/**
 * Unit coverage for SystemTableCache.reconcileAgainstAuthoritativeTruth — the
 * anti-entropy backstop that heals a genuinely-lost CDC DELETE by evicting
 * cache-only rows absent from authoritative truth (Quest
 * cdc-cache-delete-resurrection, part 1b).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {SystemTableCache, CDC_OPERATIONS}
  from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {SYSTEM_TABLE_CACHE_MUTATION_MODE} from
  '../../src/cache/cache-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function insert(cache, table, row) {
  cache.applySystemTableChange(table, CDC_OPERATIONS.INSERT, row);
}

function reconcileComplete(cache, tableName, rows, observedAtMs) {
  const mutationSnapshot = cache.captureTableMutationSnapshot(tableName);
  return cache.reconcileAgainstAuthoritativeTruth(
    {[tableName]: rows},
    {
      authoritativeObservedAtMs: observedAtMs,
      mutationSnapshots: {[tableName]: mutationSnapshot},
    },
  );
}

test('sweep evicts a cache-only row absent from authoritative truth', (t) => {
  const cache = new SystemTableCache();
  insert(cache, TABLES.SERVICES, {service_id: 'resurrected', updated_at: 1000});
  insert(cache, TABLES.SERVICES, {service_id: 'real', updated_at: 1000});

  const result = cache.reconcileAgainstAuthoritativeTruth({
    [TABLES.SERVICES]: [{service_id: 'real', updated_at: 1000}],
  });

  t.equal(cache.get(TABLES.SERVICES, 'resurrected'), undefined,
    'the cache-only row is evicted');
  t.ok(cache.get(TABLES.SERVICES, 'real'), 'the authoritative row is kept');
  t.same(result.removed, [{tableName: TABLES.SERVICES, key: 'resurrected'}]);
  t.end();
});

test('sweep fences an older replay but allows a newer recreate', (t) => {
  const cache = new SystemTableCache();
  const deletedRow = {
    service_id: 'replayed-after-sweep',
    status: 'active',
    updated_at: 1000,
  };
  insert(cache, TABLES.SERVICES, deletedRow);

  reconcileComplete(cache, TABLES.SERVICES, [], 1500);
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPDATE,
    deletedRow,
  );
  t.equal(cache.get(TABLES.SERVICES, deletedRow.service_id), undefined,
    'a late replay cannot undo complete authoritative absence');

  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPDATE,
    {...deletedRow, status: 'starting', updated_at: 2000},
  );
  t.equal(cache.get(TABLES.SERVICES, deletedRow.service_id)?.status, 'starting',
    'a causally newer recreate supersedes the sweep tombstone');
  t.end();
});

test('authoritative fence prefers causal HLC over a conflicting wall time', (t) => {
  const cache = new SystemTableCache();
  const row = {
    service_id: 'hlc-observation-fence',
    status: 'active',
    updated_at: 1000,
    updated_at_hlc: '1000-0-node-a',
  };
  insert(cache, TABLES.SERVICES, row);
  reconcileComplete(cache, TABLES.SERVICES, [], 1500);
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE, {
    ...row,
    updated_at: 2000,
    updated_at_hlc: '1400-1-node-a',
  });
  t.equal(cache.has(TABLES.SERVICES, row.service_id), false,
    'a pre-observation HLC cannot be disguised by a later wall-time field');

  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE, {
    ...row,
    status: 'starting',
    updated_at_hlc: '1600-0-node-a',
  });
  t.equal(cache.get(TABLES.SERVICES, row.service_id)?.status, 'starting',
    'an HLC later than the leader observation may recreate the key');
  t.end();
});

test('empty-table sweep fences a delayed first delivery for an unseen key', (t) => {
  const cache = new SystemTableCache();
  const mutationSnapshot =
    cache.captureTableMutationSnapshot(TABLES.SERVICES);

  cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {
      authoritativeObservedAtMs: 1500,
      mutationSnapshots: {[TABLES.SERVICES]: mutationSnapshot},
    },
  );
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE, {
    service_id: 'unseen-before-empty-read',
    status: 'active',
    updated_at: 9000,
    updated_at_hlc: '1400-1-node-a',
  });
  t.equal(cache.has(TABLES.SERVICES, 'unseen-before-empty-read'), false,
    'the complete empty observation fences a pre-observation first delivery');

  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE, {
    service_id: 'unseen-before-empty-read',
    status: 'starting',
    updated_at: 1000,
    updated_at_hlc: '1600-0-node-a',
  });
  t.equal(
    cache.get(TABLES.SERVICES, 'unseen-before-empty-read')?.status,
    'starting',
    'a causally newer first delivery remains admissible',
  );
  t.end();
});

test('table absence frontier does not override a present key merge', (t) => {
  const cache = new SystemTableCache();
  const row = {
    service_id: 'present-at-complete-read',
    status: 'active',
    updated_at: 1000,
  };
  insert(cache, TABLES.SERVICES, row);
  reconcileComplete(cache, TABLES.SERVICES, [row], 1500);
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE, {
    ...row,
    status: 'starting',
    updated_at: 2000,
  });

  t.equal(cache.get(TABLES.SERVICES, row.service_id)?.status, 'starting',
    'the existing row owner still admits an ordinary causally newer merge');
  t.end();
});

test('complete-observation UPSERT mode requires read-boundary evidence', (t) => {
  const cache = new SystemTableCache();
  t.throws(
    () => cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPSERT,
      {service_id: 'unwitnessed-presence', updated_at: 2000},
      {
        mutationMode:
          SYSTEM_TABLE_CACHE_MUTATION_MODE
            .AUTHORITATIVE_OBSERVATION_RECONCILIATION,
      },
    ),
    /Invalid cache mutation mode/u,
    'a caller cannot bypass absence fences without a finite observation',
  );
  t.equal(cache.has(TABLES.SERVICES, 'unwitnessed-presence'), false,
    'the invalid mode does not mutate the cache');

  t.throws(
    () => cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPSERT,
      {service_id: 'missing-read-boundary', updated_at: 2000},
      {
        mutationMode:
          SYSTEM_TABLE_CACHE_MUTATION_MODE
            .AUTHORITATIVE_OBSERVATION_RECONCILIATION,
        authoritativeObservedAtMs: 2000,
      },
    ),
    /Invalid cache mutation mode/u,
    'a finite observation without its local pre-read boundary fails closed',
  );
  t.equal(cache.has(TABLES.SERVICES, 'missing-read-boundary'), false,
    'an incomplete temporal proof does not mutate the cache');

  cache.recordAuthoritativeObservation(TABLES.SERVICES, {
    observedAtMs: 2000,
    causeId: 'newer-complete-observation',
  });
  for (const observedAtMs of [1999, 2000]) {
    t.throws(
      () => cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATIONS.UPSERT,
        {
          service_id: `non-advancing-presence-${observedAtMs}`,
          updated_at: 1000,
        },
        {
          mutationMode:
            SYSTEM_TABLE_CACHE_MUTATION_MODE
              .AUTHORITATIVE_OBSERVATION_RECONCILIATION,
          authoritativeObservedAtMs: observedAtMs,
          authoritativeReadStartedAtMs: observedAtMs,
        },
      ),
      /Invalid cache mutation mode/u,
      'complete presence requires an observation strictly after the frontier',
    );
    t.equal(
      cache.has(TABLES.SERVICES, `non-advancing-presence-${observedAtMs}`),
      false,
      'an older or equal complete observation cannot install a missing key',
    );
  }
  t.end();
});

test('table absence frontier survives bounded key-tombstone eviction', (t) => {
  const cache = new SystemTableCache();
  const deletedRow = {
    service_id: 'frontier-retained-after-key-eviction',
    status: 'active',
    updated_at: 1000,
    updated_at_hlc: '1000-0-node-a',
  };
  insert(cache, TABLES.SERVICES, deletedRow);
  reconcileComplete(cache, TABLES.SERVICES, [], 1500);

  for (let index = 0; index < 1025; index += 1) {
    const row = {
      service_id: `later-delete-${index}`,
      updated_at: 2000 + index,
      updated_at_hlc: `${2000 + index}-0-node-a`,
    };
    insert(cache, TABLES.SERVICES, row);
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.DELETE,
      row,
    );
  }
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPDATE,
    deletedRow,
  );

  t.equal(cache.has(TABLES.SERVICES, deletedRow.service_id), false,
    'evicting a per-key tombstone cannot erase complete-table causal truth');
  t.end();
});

test('complete presence must be strictly later than a key tombstone', (t) => {
  const cache = new SystemTableCache();
  const row = {
    service_id: 'complete-presence-key-boundary',
    status: 'active',
    updated_at: 100,
    updated_at_hlc: '100-0-owner',
  };
  insert(cache, TABLES.SERVICES, row);
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.DELETE, {
    ...row,
    updated_at: 200,
    updated_at_hlc: '200-0-owner',
  });
  const completeReadStartedAtMs = Date.now() + 1;

  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPSERT,
    row,
    {
      mutationMode:
        SYSTEM_TABLE_CACHE_MUTATION_MODE
          .AUTHORITATIVE_OBSERVATION_RECONCILIATION,
      authoritativeObservedAtMs: 200,
      authoritativeReadStartedAtMs: completeReadStartedAtMs,
    },
  );
  t.equal(cache.has(TABLES.SERVICES, row.service_id), false,
    'equal-millisecond complete presence cannot order itself after DELETE');

  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPSERT,
    row,
    {
      mutationMode:
        SYSTEM_TABLE_CACHE_MUTATION_MODE
          .AUTHORITATIVE_OBSERVATION_RECONCILIATION,
      authoritativeObservedAtMs: 201,
      authoritativeReadStartedAtMs: completeReadStartedAtMs,
    },
  );
  t.same(cache.get(TABLES.SERVICES, row.service_id), row,
    'a strictly later complete observation supersedes the key tombstone');
  t.end();
});

test('sweep preserves a same-key mutation that lands during its owner read', (t) => {
  const cache = new SystemTableCache();
  const row = {
    service_id: 'same-key-sweep-race',
    status: 'active',
    updated_at: 1000,
  };
  insert(cache, TABLES.SERVICES, row);
  const mutationSnapshot =
    cache.captureTableMutationSnapshot(TABLES.SERVICES);

  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE, row);
  const result = cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {
      authoritativeObservedAtMs: 1500,
      mutationSnapshots: {[TABLES.SERVICES]: mutationSnapshot},
    },
  );

  t.same(cache.get(TABLES.SERVICES, row.service_id), row,
    'an equal-value same-key apply supersedes the earlier sweep snapshot');
  t.same(result.removed, [], 'the raced key is not reported as swept');
  t.end();
});

test('sweep upgrades a concurrent ordinary delete before late replay', (t) => {
  const cache = new SystemTableCache();
  const row = {
    service_id: 'concurrent-delete-sweep-race',
    status: 'active',
    updated_at: 1000,
  };
  insert(cache, TABLES.SERVICES, row);
  const mutationSnapshot =
    cache.captureTableMutationSnapshot(TABLES.SERVICES);

  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.DELETE, row);
  cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {
      authoritativeObservedAtMs: 1500,
      mutationSnapshots: {[TABLES.SERVICES]: mutationSnapshot},
    },
  );
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE, row);

  t.equal(cache.get(TABLES.SERVICES, row.service_id), undefined,
    'leader absence upgrades the concurrent delete tombstone before replay');
  t.end();
});

test('sweep leaves a table absent from the snapshot untouched', (t) => {
  const cache = new SystemTableCache();
  insert(cache, TABLES.NODES, {id: 'node-1', updated_at: 1000});

  cache.reconcileAgainstAuthoritativeTruth({[TABLES.SERVICES]: []});

  t.ok(cache.get(TABLES.NODES, 'node-1'),
    'a table not named in the snapshot is never swept');
  t.end();
});

test('sweep does NOT wipe a table given a non-array (malformed) value', (t) => {
  const cache = new SystemTableCache();
  insert(cache, TABLES.SERVICES, {service_id: 'svc-1', updated_at: 1000});

  cache.reconcileAgainstAuthoritativeTruth({[TABLES.SERVICES]: undefined});

  t.ok(cache.get(TABLES.SERVICES, 'svc-1'),
    'a malformed (non-array) authoritative set is not treated as empty');
  t.end();
});

test('keyless authoritative row cannot establish table absence', (t) => {
  const cache = new SystemTableCache();
  const row = {service_id: 'preserved-on-keyless-truth', updated_at: 1000};
  insert(cache, TABLES.SERVICES, row);
  const mutationSnapshot =
    cache.captureTableMutationSnapshot(TABLES.SERVICES);

  cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: [{status: 'missing-primary-key'}]},
    {
      authoritativeObservedAtMs: 1500,
      mutationSnapshots: {[TABLES.SERVICES]: mutationSnapshot},
    },
  );

  t.same(cache.get(TABLES.SERVICES, row.service_id), row,
    'a keyless truth row cannot authorize reconciliation');
  t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), null,
    'a keyless truth row cannot mint the table watermark');
  t.end();
});

test('malformed mutation snapshot cannot establish table absence', (t) => {
  const cache = new SystemTableCache();
  cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {
      authoritativeObservedAtMs: 1500,
      mutationSnapshots: {
        [TABLES.SERVICES]: {tableName: TABLES.NODES, entries: []},
      },
    },
  );
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE, {
    service_id: 'unseen-after-malformed-snapshot',
    updated_at: 1000,
    updated_at_hlc: '1000-0-owner',
  });

  t.ok(cache.has(TABLES.SERVICES, 'unseen-after-malformed-snapshot'),
    'an invalid pre-read proof cannot mint a missing-key fence');
  t.end();
});

test('authoritative observation requires an explicit pre-read snapshot', (t) => {
  const cache = new SystemTableCache();
  const row = {service_id: 'preserved-without-pre-read-proof', updated_at: 1000};
  insert(cache, TABLES.SERVICES, row);

  const result = cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {authoritativeObservedAtMs: 1500},
  );

  t.same(result.removed, [],
    'complete authority cannot silently capture its proof after the read');
  t.same(cache.get(TABLES.SERVICES, row.service_id), row,
    'the unproven sweep preserves the cached row');
  t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), null,
    'the unproven sweep cannot mint the table frontier');
  t.end();
});

test('schema-invalid object key cannot establish table absence', (t) => {
  const cache = new SystemTableCache();
  const key = {};
  cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {
      authoritativeObservedAtMs: 1500,
      mutationSnapshots: {
        [TABLES.SERVICES]: {
          tableName: TABLES.SERVICES,
          entries: [{
            key,
            record: {service_id: key},
            mutationRevision: 0,
          }],
        },
      },
    },
  );

  t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), null,
    'non-TEXT snapshot keys cannot mint complete-table authority');
  t.end();
});

test('malformed mutation snapshot entry cannot establish table absence', (t) => {
  const cache = new SystemTableCache();
  const row = {service_id: 'preserved-on-malformed-entry', updated_at: 1000};
  insert(cache, TABLES.SERVICES, row);
  cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {
      authoritativeObservedAtMs: 1500,
      mutationSnapshots: {
        [TABLES.SERVICES]: {
          tableName: TABLES.SERVICES,
          entries: [{key: row.service_id}],
        },
      },
    },
  );

  t.same(cache.get(TABLES.SERVICES, row.service_id), row,
    'a partial entry cannot authorize reconciliation');
  t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), null,
    'a partial entry cannot mint the table watermark');
  t.end();
});

test('invalid mutation revisions cannot establish table absence', (t) => {
  for (const mutationRevision of [0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const cache = new SystemTableCache();
    const row = {
      service_id: `preserved-on-invalid-revision-${mutationRevision}`,
      updated_at: 1000,
    };
    insert(cache, TABLES.SERVICES, row);
    const snapshot = cache.captureTableMutationSnapshot(TABLES.SERVICES);
    cache.reconcileAgainstAuthoritativeTruth(
      {[TABLES.SERVICES]: []},
      {
        authoritativeObservedAtMs: 1500,
        mutationSnapshots: {
          [TABLES.SERVICES]: {
            tableName: TABLES.SERVICES,
            entries: [{...snapshot.entries[0], mutationRevision}],
          },
        },
      },
    );

    t.same(cache.get(TABLES.SERVICES, row.service_id), row,
      'a non-owner-shaped revision cannot prove an unchanged key');
    t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), null,
      'invalid revision evidence cannot mint the table watermark');
  }
  t.end();
});

test('duplicate mutation snapshot keys cannot establish table absence', (t) => {
  const cache = new SystemTableCache();
  const row = {service_id: 'preserved-on-duplicate-entry', updated_at: 1000};
  insert(cache, TABLES.SERVICES, row);
  const snapshot = cache.captureTableMutationSnapshot(TABLES.SERVICES);
  cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {
      authoritativeObservedAtMs: 1500,
      mutationSnapshots: {
        [TABLES.SERVICES]: {
          tableName: TABLES.SERVICES,
          entries: [snapshot.entries[0], snapshot.entries[0]],
        },
      },
    },
  );

  t.same(cache.get(TABLES.SERVICES, row.service_id), row,
    'duplicate key evidence cannot authorize reconciliation');
  t.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICES), null,
    'duplicate key evidence cannot mint the table watermark');
  t.end();
});

test('age guard: a row newer than the read is not evicted; older is', (t) => {
  const cache = new SystemTableCache();
  insert(cache, TABLES.SERVICES, {service_id: 'stale', updated_at: 1000});
  insert(cache, TABLES.SERVICES, {service_id: 'fresh', updated_at: 9000});

  // Authoritative read taken at t=5000 holds neither row; only the row older
  // than the read should be evicted (the fresh one may post-date the snapshot).
  const result = cache.reconcileAgainstAuthoritativeTruth(
    {[TABLES.SERVICES]: []},
    {evictOlderThanMs: 5000},
  );

  t.equal(cache.get(TABLES.SERVICES, 'stale'), undefined,
    'the row older than the read is swept');
  t.ok(cache.get(TABLES.SERVICES, 'fresh'),
    'the row newer than the read is preserved (race guard)');
  t.same(result.removed, [{tableName: TABLES.SERVICES, key: 'stale'}]);
  t.end();
});

test('sweep notifies listeners with a DELETE for each evicted row', async (t) => {
  const cache = new SystemTableCache();
  insert(cache, TABLES.SERVICES, {service_id: 'gone', updated_at: 1000});

  const events = [];
  cache.onCacheChange((tableName, operation, record) => {
    events.push({tableName, operation, record});
  });

  cache.reconcileAgainstAuthoritativeTruth({[TABLES.SERVICES]: []});
  // Notifications are dispatched via setImmediate; let them flush.
  await new Promise((resolve) => setImmediate(resolve));

  const deletes = events.filter((e) => e.operation === CDC_OPERATIONS.DELETE);
  t.equal(deletes.length, 1, 'one DELETE notification emitted');
  t.equal(deletes[0].record.service_id, 'gone', 'the evicted row is reported');
  t.end();
});
