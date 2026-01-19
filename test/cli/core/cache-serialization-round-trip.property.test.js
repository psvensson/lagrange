/**
 * Property Test: Cache Serialization Round-Trip
 *
 * Property 10: Cache Serialization Round-Trip
 * *For any* Remote Cache state, serializing to JSON and deserializing should
 * produce an equivalent cache state with all entities preserved.
 *
 * Validates: Requirements 13.7
 */

import {test} from 'tap';
import fc from 'fast-check';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

/**
 * Arbitrary for generating a node record
 */
const nodeArb = fc.record({
  node_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  node_address: fc.string({minLength: 5, maxLength: 30}),
  status: fc.constantFrom('active', 'inactive', 'failed'),
  cpu_usage_percent: fc.float({min: 0, max: 100}),
  memory_usage_percent: fc.float({min: 0, max: 100}),
});

/**
 * Arbitrary for generating a service record
 */
const serviceArb = fc.record({
  service_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  node_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  service_type: fc.constantFrom('partition', 'message_group', 'node'),
  status: fc.constantFrom('running', 'stopped', 'failed'),
});

/**
 * Arbitrary for generating a table record
 */
const tableArb = fc.record({
  table_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  table_name: fc.string({minLength: 1, maxLength: 20}),
  table_policies: fc.string({minLength: 0, maxLength: 50}),
});

/**
 * Arbitrary for generating a partition record
 */
const partitionArb = fc.record({
  partition_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  table_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  replica_count: fc.integer({min: 1, max: 5}),
  status: fc.constantFrom('active', 'inactive'),
});

/**
 * Arbitrary for generating a message group record
 */
const messageGroupArb = fc.record({
  group_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  replica_count: fc.integer({min: 1, max: 5}),
  status: fc.constantFrom('healthy', 'degraded', 'failed'),
});

/**
 * Arbitrary for generating a log record
 */
const logArb = fc.record({
  log_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  level: fc.constantFrom('ERROR', 'WARN', 'INFO', 'DEBUG'),
  node_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  message: fc.string({minLength: 1, maxLength: 100}),
  timestamp: fc.integer({min: 0, max: Date.now()}),
});

/**
 * Arbitrary for generating a config record
 */
const configArb = fc.record({
  key: fc.string({minLength: 1, maxLength: 20})
    .filter((s) => /^[a-z0-9._-]+$/i.test(s)),
  value: fc.string({minLength: 0, maxLength: 50}),
  type: fc.constantFrom('string', 'number', 'boolean'),
});

/**
 * Arbitrary for generating a context record
 */
const contextArb = fc.record({
  context_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  context_type: fc.constantFrom('function', 'trigger', 'procedure'),
  name: fc.string({minLength: 1, maxLength: 30}),
});

/**
 * Arbitrary for generating a complete cache dump
 */
const cacheDumpArb = fc.record({
  nodes: fc.array(nodeArb, {minLength: 0, maxLength: 5}),
  services: fc.array(serviceArb, {minLength: 0, maxLength: 5}),
  tables: fc.array(tableArb, {minLength: 0, maxLength: 5}),
  partitions: fc.array(partitionArb, {minLength: 0, maxLength: 5}),
  message_groups: fc.array(messageGroupArb, {minLength: 0, maxLength: 5}),
  logs: fc.array(logArb, {minLength: 0, maxLength: 5}),
  config: fc.array(configArb, {minLength: 0, maxLength: 5}),
  contexts: fc.array(contextArb, {minLength: 0, maxLength: 5}),
});

/**
 * Helper to compare two cache states
 */
function cachesAreEqual(cache1, cache2) {
  const tableNames = Object.keys(cache1.tables);

  for (const tableName of tableNames) {
    const map1 = cache1.tables[tableName];
    const map2 = cache2.tables[tableName];

    if (map1.size !== map2.size) {
      return false;
    }

    for (const [key, value1] of map1) {
      const value2 = map2.get(key);
      if (!value2) {
        return false;
      }
      // Compare JSON representations for deep equality
      if (JSON.stringify(value1) !== JSON.stringify(value2)) {
        return false;
      }
    }
  }

  return true;
}

test('Property 10: Cache Serialization Round-Trip', async (t) => {
  /**
   * Feature: admin-cli, Property 10: Cache Serialization Round-Trip
   * Validates: Requirements 13.7
   */
  fc.assert(
    fc.property(
      cacheDumpArb,
      (dump) => {
        // Create and populate original cache
        const originalCache = new RemoteCache();
        originalCache.loadFromDump(dump);

        // Serialize
        const serialized = originalCache.serialize();

        // Deserialize into new cache
        const restoredCache = new RemoteCache();
        restoredCache.deserialize(serialized);

        // Verify caches are equal
        return cachesAreEqual(originalCache, restoredCache);
      },
    ),
    {numRuns: 10},
  );
  t.pass('Serialization round-trip preserves all cache data');
});

test('Property 10: Cache Serialization - lastUpdate preserved', async (t) => {
  /**
   * Feature: admin-cli, Property 10: Cache Serialization Round-Trip
   * Validates: Requirements 13.7
   */
  fc.assert(
    fc.property(
      cacheDumpArb,
      (dump) => {
        const originalCache = new RemoteCache();
        originalCache.loadFromDump(dump);
        const originalLastUpdate = originalCache.lastUpdate;

        const serialized = originalCache.serialize();
        const restoredCache = new RemoteCache();
        restoredCache.deserialize(serialized);

        return restoredCache.lastUpdate === originalLastUpdate;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Serialization round-trip preserves lastUpdate timestamp');
});

test('Property 10: Cache Serialization - entity counts preserved', async (t) => {
  /**
   * Feature: admin-cli, Property 10: Cache Serialization Round-Trip
   * Validates: Requirements 13.7
   */
  fc.assert(
    fc.property(
      cacheDumpArb,
      (dump) => {
        const originalCache = new RemoteCache();
        originalCache.loadFromDump(dump);
        const originalStats = originalCache.getStats();

        const serialized = originalCache.serialize();
        const restoredCache = new RemoteCache();
        restoredCache.deserialize(serialized);
        const restoredStats = restoredCache.getStats();

        // Compare table counts
        for (const tableName of Object.keys(originalStats.tableCounts)) {
          if (originalStats.tableCounts[tableName] !==
                  restoredStats.tableCounts[tableName]) {
            return false;
          }
        }
        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Serialization round-trip preserves entity counts');
});

test('Property 10: Cache Serialization - JSON is valid', async (t) => {
  /**
   * Feature: admin-cli, Property 10: Cache Serialization Round-Trip
   * Validates: Requirements 13.7
   */
  fc.assert(
    fc.property(
      cacheDumpArb,
      (dump) => {
        const cache = new RemoteCache();
        cache.loadFromDump(dump);

        const serialized = cache.serialize();

        // Verify it's valid JSON
        try {
          const parsed = JSON.parse(serialized);
          return parsed.data !== undefined && parsed.lastUpdate !== undefined;
        } catch (_e) {
          return false;
        }
      },
    ),
    {numRuns: 10},
  );
  t.pass('Serialized cache is valid JSON with expected structure');
});

test('Property 10: Cache Serialization - multiple round-trips', async (t) => {
  /**
   * Feature: admin-cli, Property 10: Cache Serialization Round-Trip
   * Validates: Requirements 13.7
   */
  fc.assert(
    fc.property(
      cacheDumpArb,
      fc.integer({min: 2, max: 5}),
      (dump, roundTrips) => {
        let cache = new RemoteCache();
        cache.loadFromDump(dump);

        // Perform multiple round-trips
        for (let i = 0; i < roundTrips; i++) {
          const serialized = cache.serialize();
          cache = new RemoteCache();
          cache.deserialize(serialized);
        }

        // Compare with original
        const originalCache = new RemoteCache();
        originalCache.loadFromDump(dump);

        return cachesAreEqual(originalCache, cache);
      },
    ),
    {numRuns: 10},
  );
  t.pass('Multiple serialization round-trips preserve cache data');
});
