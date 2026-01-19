/**
 * Property-based test for Query-on-Miss Behavior.
 * Property 28: When cached metadata expires or is missing, the system
 * should query system partitions directly and update the cache.
 * Validates: Requirements 17.5, 17.7
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {MetadataCache} from '../../src/message-group/metadata-cache.js';
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
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * For any cache miss, system should query system partition.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Cache miss triggers system partition query', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate cache key
      fc.string({minLength: 3, maxLength: 30}),
      // Generate query result
      fc.record({
        id: fc.uuid(),
        data: fc.string({minLength: 1, maxLength: 50}),
      }),
      async (key, queryResult) => {
        let queryCount = 0;
        let lastQueryOptions = null;

        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
          querySystemPartition: async (options) => {
            queryCount++;
            lastQueryOptions = options;
            return queryResult;
          },
        });
        cache.initialize();

        // Property: Cache miss should trigger query
        const result = await cache.getOrQuery(key, {
          tableName: 'test_table',
          sql: 'SELECT * FROM test_table WHERE id = ?',
          params: [key],
        });

        t.equal(queryCount, 1, 'Query should be called once on miss');
        t.same(result, queryResult, 'Should return query result');
        t.equal(
          lastQueryOptions.tableName,
          'test_table',
          'Query options should be passed',
        );

        // Property: Stats should track query-on-miss
        const stats = cache.getStats();
        t.equal(stats.queryOnMiss, 1, 'queryOnMiss should be tracked');
        t.equal(stats.misses, 1, 'Miss should be tracked');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Query result should be cached for subsequent access.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Query result is cached', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({minLength: 3, maxLength: 30}),
      fc.record({
        id: fc.uuid(),
        value: fc.integer(),
      }),
      async (key, queryResult) => {
        let queryCount = 0;

        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
          querySystemPartition: async () => {
            queryCount++;
            return queryResult;
          },
        });
        cache.initialize();

        // First access - should query
        await cache.getOrQuery(key, {tableName: 'test'});
        t.equal(queryCount, 1, 'First access should query');

        // Second access - should hit cache
        const result = await cache.getOrQuery(key, {tableName: 'test'});
        t.equal(queryCount, 1, 'Second access should not query');
        t.same(result, queryResult, 'Should return cached result');

        // Property: Stats should show hit
        const stats = cache.getStats();
        t.equal(stats.hits, 1, 'Second access should be a hit');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Expired entries should trigger fresh query.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Expired entries trigger fresh query', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({minLength: 3, maxLength: 30}),
      async (key) => {
        let queryCount = 0;
        let queryVersion = 0;

        cache = new MetadataCache({
          defaultTtlMs: 50, // Short TTL
          cleanupIntervalMs: 60000,
          querySystemPartition: async () => {
            queryCount++;
            queryVersion++;
            return {version: queryVersion};
          },
        });
        cache.initialize();

        // First query
        const result1 = await cache.getOrQuery(key, {tableName: 'test'});
        t.equal(result1.version, 1, 'First query should return version 1');
        t.equal(queryCount, 1, 'Should have queried once');

        // Wait for TTL to expire
        await new Promise((r) => setTimeout(r, 70));

        // Second query after expiration
        const result2 = await cache.getOrQuery(key, {tableName: 'test'});
        t.equal(result2.version, 2, 'Second query should return version 2');
        t.equal(queryCount, 2, 'Should have queried twice');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Multiple consecutive failures should trigger cache refresh.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Consecutive failures trigger refresh', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 2, max: 4}),
      async (threshold) => {
        let queryCount = 0;

        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
          consecutiveFailureThreshold: threshold,
          querySystemPartition: async () => {
            queryCount++;
            return {refreshed: true};
          },
        });
        cache.initialize();

        // Set initial value
        cache.set('test-key', {original: true});

        // Record failures below threshold
        for (let i = 0; i < threshold - 1; i++) {
          await cache.recordFailure('test-key', {tableName: 'test'});
        }

        // Property: Entry should still exist (below threshold)
        t.ok(cache.has('test-key'), 'Entry should exist below threshold');
        t.equal(queryCount, 0, 'No refresh query below threshold');

        // Record one more failure to exceed threshold
        await cache.recordFailure('test-key', {tableName: 'test'});

        // Property: Refresh should have been triggered
        t.equal(queryCount, 1, 'Refresh query should be triggered');

        // Property: Stats should track refresh
        const stats = cache.getStats();
        t.equal(stats.refreshes, 1, 'Refresh should be tracked');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Null query results should not be cached.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Null results are not cached', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({minLength: 3, maxLength: 30}),
      async (key) => {
        let queryCount = 0;

        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
          querySystemPartition: async () => {
            queryCount++;
            return null; // Return null
          },
        });
        cache.initialize();

        // First query
        const result1 = await cache.getOrQuery(key, {tableName: 'test'});
        t.equal(result1, null, 'Should return null');
        t.equal(queryCount, 1, 'Should have queried');

        // Second query - should query again since null wasn't cached
        const result2 = await cache.getOrQuery(key, {tableName: 'test'});
        t.equal(result2, null, 'Should return null again');
        t.equal(queryCount, 2, 'Should query again for null result');

        // Property: Entry should not be in cache
        t.notOk(cache.has(key), 'Null result should not be cached');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Query errors should propagate to caller.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Query errors propagate', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({minLength: 3, maxLength: 30}),
      fc.string({minLength: 5, maxLength: 50}),
      async (key, errorMessage) => {
        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
          querySystemPartition: async () => {
            throw new Error(errorMessage);
          },
        });
        cache.initialize();

        // Property: Error should propagate
        let caughtError = null;
        try {
          await cache.getOrQuery(key, {tableName: 'test'});
        } catch (error) {
          caughtError = error;
        }

        t.ok(caughtError, 'Error should be thrown');
        t.ok(
          caughtError.message.includes(errorMessage),
          'Error message should be preserved',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Partition-specific getters should use query-on-miss.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Partition getters use query-on-miss', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.record({
        partition_id: fc.uuid(),
        table_id: fc.uuid(),
        replicas: fc.array(fc.string(), {minLength: 1, maxLength: 3}),
      }),
      async (partitionId, partitionData) => {
        let queryCount = 0;
        let lastQueryOptions = null;

        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
          querySystemPartition: async (options) => {
            queryCount++;
            lastQueryOptions = options;
            return partitionData;
          },
        });
        cache.initialize();

        // Use getPartition which should trigger query-on-miss
        const result = await cache.getPartition(partitionId);

        // Property: Should have queried
        t.equal(queryCount, 1, 'Should query for partition');

        // Property: Query should target partitions table
        t.equal(
          lastQueryOptions.tableName,
          'partitions',
          'Should query partitions table',
        );

        // Property: Result should match
        t.same(result, partitionData, 'Should return partition data');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Without query function, cache miss returns null.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: No query function returns null on miss', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({minLength: 3, maxLength: 30}),
      async (key) => {
        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
          // No querySystemPartition function
        });
        cache.initialize();

        // Property: Should return null without query function
        const result = await cache.getOrQuery(key, {tableName: 'test'});
        t.equal(result, null, 'Should return null without query function');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Setting query function dynamically should work.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Dynamic query function setting', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({minLength: 3, maxLength: 30}),
      fc.record({id: fc.uuid()}),
      async (key, queryResult) => {
        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
        });
        cache.initialize();

        // Initially no query function
        const result1 = await cache.getOrQuery(key, {tableName: 'test'});
        t.equal(result1, null, 'Should return null initially');

        // Set query function dynamically
        cache.setQueryFunction(async () => queryResult);

        // Now should query
        const result2 = await cache.getOrQuery(`${key}-2`, {tableName: 'test'});
        t.same(result2, queryResult, 'Should return query result');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: metadata-cache, Property 28: Query-on-Miss Behavior
 * Failure counter reset on successful access.
 * Validates: Requirements 17.5, 17.7
 */
test('Property 28: Failure counter resets on success', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 2, max: 4}),
      async (threshold) => {
        let queryCount = 0;

        cache = new MetadataCache({
          defaultTtlMs: 30000,
          cleanupIntervalMs: 60000,
          consecutiveFailureThreshold: threshold,
          querySystemPartition: async () => {
            queryCount++;
            return {data: 'refreshed'};
          },
        });
        cache.initialize();

        // Set initial value
        cache.set('test-key', {data: 'original'});

        // Record some failures (but not enough to trigger refresh)
        for (let i = 0; i < threshold - 1; i++) {
          await cache.recordFailure('test-key', {tableName: 'test'});
        }

        // Reset failure counter
        cache.resetFailureCounter('test-key');

        // Record same number of failures again
        for (let i = 0; i < threshold - 1; i++) {
          await cache.recordFailure('test-key', {tableName: 'test'});
        }

        // Property: No refresh should have occurred (counter was reset)
        t.equal(queryCount, 0, 'No refresh after counter reset');

        // Property: Entry should still exist
        t.ok(cache.has('test-key'), 'Entry should still exist');

        return true;
      },
    ),
    {numRuns: 10},
  );
});
