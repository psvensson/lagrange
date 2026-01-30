/**
 * Property-based test for Cache TTL Expiration.
 * Property 27: The system should maintain local metadata cache with TTL
 * (default 30 seconds) to reduce query overhead.
 * Validates: Requirements 17.6
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  MetadataCache,
  CacheEntryStatus,
} from '../../src/message-group/metadata-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

let cache;

beforeEach(async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(async () => {
  if (cache) {
    cache.shutdown();
    cache = null;
  }
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Feature: metadata-cache, Property 27: Cache TTL Expiration
 * For any cached entry, it should be available before TTL expires.
 * Validates: Requirements 17.6
 */
test('Property 27: Entries available before TTL expires', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate cache key
      fc.string({minLength: 3, maxLength: 30}),
      // Generate cache value
      fc.record({
        id: fc.uuid(),
        data: fc.string({minLength: 1, maxLength: 50}),
      }),
      // Generate TTL (100-500ms for testing)
      fc.integer({min: 100, max: 500}),
      async (key, value, ttlMs) => {
        cache = new MetadataCache({
          defaultTtlMs: ttlMs,
          cleanupIntervalMs: 60000, // Disable auto cleanup
        });
        cache.initialize();

        // Set value
        cache.set(key, value);

        // Property: Value should be available immediately
        const retrieved = cache.get(key);
        t.same(retrieved, value, 'Value should be available immediately');

        // Property: has() should return true
        t.ok(cache.has(key), 'has() should return true before expiration');

        // Wait for less than TTL
        await new Promise((r) => setTimeout(r, ttlMs / 2));

        // Property: Value should still be available
        const stillAvailable = cache.get(key);
        t.same(stillAvailable, value, 'Value should still be available');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 27: Cache TTL Expiration
 * For any cached entry, it should expire after TTL.
 * Validates: Requirements 17.6
 */
test('Property 27: Entries expire after TTL', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate cache key
      fc.string({minLength: 3, maxLength: 30}),
      // Generate cache value
      fc.record({
        id: fc.uuid(),
        data: fc.string({minLength: 1, maxLength: 50}),
      }),
      async (key, value) => {
        const ttlMs = 50; // Short TTL for testing

        cache = new MetadataCache({
          defaultTtlMs: ttlMs,
          cleanupIntervalMs: 60000,
        });
        cache.initialize();

        // Set value
        cache.set(key, value);

        // Wait for TTL to expire
        await new Promise((r) => setTimeout(r, ttlMs + 20));

        // Property: Value should be null after expiration
        const expired = cache.get(key);
        t.equal(expired, null, 'Value should be null after expiration');

        // Property: has() should return false
        t.notOk(cache.has(key), 'has() should return false after expiration');

        // Property: Stats should track expiration
        const stats = cache.getStats();
        t.ok(stats.expirations > 0, 'Expirations should be tracked');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 27: Cache TTL Expiration
 * Custom TTL per entry should override default.
 * Validates: Requirements 17.6
 */
test('Property 27: Custom TTL overrides default', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate two different TTLs
      fc.integer({min: 50, max: 100}),
      fc.integer({min: 150, max: 250}),
      async (shortTtl, longTtl) => {
        cache = new MetadataCache({
          defaultTtlMs: shortTtl,
          cleanupIntervalMs: 60000,
        });
        cache.initialize();

        // Set entry with default TTL
        cache.set('default-ttl', {data: 'default'});

        // Set entry with custom longer TTL
        cache.set('custom-ttl', {data: 'custom'}, {ttlMs: longTtl});

        // Wait for default TTL to expire but not custom
        await new Promise((r) => setTimeout(r, shortTtl + 20));

        // Property: Default TTL entry should be expired
        t.equal(
          cache.get('default-ttl'),
          null,
          'Default TTL entry should expire',
        );

        // Property: Custom TTL entry should still be available
        t.same(
          cache.get('custom-ttl'),
          {data: 'custom'},
          'Custom TTL entry should still be available',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 27: Cache TTL Expiration
 * Cache hit rate should reflect TTL behavior.
 * Validates: Requirements 17.6
 */
test('Property 27: Cache statistics reflect TTL behavior', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate number of entries
      fc.integer({min: 3, max: 8}),
      async (numEntries) => {
        cache = new MetadataCache({
          defaultTtlMs: 50,
          cleanupIntervalMs: 60000,
        });
        cache.initialize();

        // Set multiple entries
        for (let i = 0; i < numEntries; i++) {
          cache.set(`key-${i}`, {index: i});
        }

        // Access all entries (should be hits)
        for (let i = 0; i < numEntries; i++) {
          cache.get(`key-${i}`);
        }

        let stats = cache.getStats();

        // Property: All accesses should be hits
        t.equal(stats.hits, numEntries, 'All accesses should be hits');
        t.equal(stats.misses, 0, 'No misses before expiration');

        // Wait for TTL to expire
        await new Promise((r) => setTimeout(r, 70));

        // Access all entries again (should be misses due to expiration)
        for (let i = 0; i < numEntries; i++) {
          cache.get(`key-${i}`);
        }

        stats = cache.getStats();

        // Property: Expirations should be tracked
        t.equal(
          stats.expirations,
          numEntries,
          'All entries should have expired',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 27: Cache TTL Expiration
 * Updating an entry should reset its TTL.
 * Validates: Requirements 17.6
 */
test('Property 27: Updating entry resets TTL', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({minLength: 3, maxLength: 20}),
      async (key) => {
        const ttlMs = 80;

        cache = new MetadataCache({
          defaultTtlMs: ttlMs,
          cleanupIntervalMs: 60000,
        });
        cache.initialize();

        // Set initial value
        cache.set(key, {version: 1});

        // Wait for half TTL
        await new Promise((r) => setTimeout(r, ttlMs / 2));

        // Update the value (should reset TTL)
        cache.set(key, {version: 2});

        // Wait for original TTL to have expired
        await new Promise((r) => setTimeout(r, ttlMs / 2 + 10));

        // Property: Entry should still be available (TTL was reset)
        const value = cache.get(key);
        t.same(value, {version: 2}, 'Updated entry should still be available');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 27: Cache TTL Expiration
 * Cache entries should have accurate remaining TTL.
 * Validates: Requirements 17.6
 */
test('Property 27: Remaining TTL is accurate', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 200, max: 500}),
      async (ttlMs) => {
        cache = new MetadataCache({
          defaultTtlMs: ttlMs,
          cleanupIntervalMs: 60000,
        });
        cache.initialize();

        cache.set('test-key', {data: 'test'});

        // Get entries to check remaining TTL
        const entries = cache.getEntries();
        const entry = entries.find((e) => e.key === 'test-key');

        // Property: Remaining TTL should be close to original TTL
        t.ok(
          entry.remainingTtl > ttlMs - 50 && entry.remainingTtl <= ttlMs,
          `Remaining TTL ${entry.remainingTtl} should be close to ${ttlMs}`,
        );

        // Property: Status should be valid
        t.equal(entry.status, CacheEntryStatus.VALID, 'Status should be VALID');

        // Wait for some time
        await new Promise((r) => setTimeout(r, 100));

        // Check remaining TTL decreased
        const entriesAfter = cache.getEntries();
        const entryAfter = entriesAfter.find((e) => e.key === 'test-key');

        // Property: Remaining TTL should have decreased
        t.ok(
          entryAfter.remainingTtl < entry.remainingTtl,
          'Remaining TTL should decrease over time',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 27: Cache TTL Expiration
 * Partition-specific cache methods should respect TTL.
 * Validates: Requirements 17.6
 */
test('Property 27: Partition cache methods respect TTL', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.record({
        partition_id: fc.uuid(),
        replicas: fc.array(fc.string(), {minLength: 1, maxLength: 3}),
      }),
      async (partitionId, partitionData) => {
        cache = new MetadataCache({
          defaultTtlMs: 50,
          cleanupIntervalMs: 60000,
        });
        cache.initialize();

        // Set partition data
        cache.setPartition(partitionId, partitionData);

        // Property: Should be retrievable immediately
        // Note: getPartition is async and uses getOrQuery
        const key = `partition:${partitionId}`;
        const retrieved = cache.get(key);
        t.same(retrieved, partitionData, 'Partition should be retrievable');

        // Wait for TTL to expire
        await new Promise((r) => setTimeout(r, 70));

        // Property: Should be null after expiration
        const expired = cache.get(key);
        t.equal(expired, null, 'Partition should expire');

        return true;
      },
    ),
    {numRuns: 10},
  );
});
