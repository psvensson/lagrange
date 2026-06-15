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
