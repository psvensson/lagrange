// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
  getSystemCachePrimaryKeyField,
} from '../../src/cache/system-cache-key-descriptor.js';
import {
  PRIMARY_KEY_FIELDS,
} from '../../src/cache/system-table-cache.js';
import {
  PRIMARY_KEY_COLUMNS,
} from '../../src/worker/sqlite-system-cache.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {TABLES} from '../../src/constants/index.js';

test('System cache key descriptor is the single owner across caches', async (t) => {
  t.same(PRIMARY_KEY_FIELDS, SYSTEM_CACHE_KEY_DESCRIPTOR);
  t.same(PRIMARY_KEY_COLUMNS, SYSTEM_CACHE_KEY_DESCRIPTOR);
});

test('System cache key descriptor fails fast for unknown tables', async (t) => {
  t.throws(
    () => getSystemCachePrimaryKeyField('unknown_table'),
    /System cache key descriptor missing for table/,
  );
});

test('Default hydration table selection excludes logs', async (t) => {
  t.equal(CACHE_HYDRATION_TABLES.includes(TABLES.LOGS), false);
});

test('Latency topology tables have canonical key descriptors', async (t) => {
  t.equal(
    SYSTEM_CACHE_KEY_DESCRIPTOR[TABLES.LATENCY_GROUPS],
    'group_id',
  );
  t.equal(
    SYSTEM_CACHE_KEY_DESCRIPTOR[TABLES.INTER_GROUP_LATENCIES],
    'latency_edge_id',
  );
});
