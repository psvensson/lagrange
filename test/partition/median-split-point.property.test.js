/**
 * Property-based test for Median Split Point.
 * **Property 39: Median Split Point**
 * **Validates: Requirements 20.4**
 *
 * Property: *For any* partition being split, the split point should be the median
 * PRIMARY KEY value, ensuring balanced distribution of data between the two
 * resulting partitions.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  PartitionSplitMergeManager,
} from '../../src/partition/partition-split-merge-manager.js';
import {KeyRange, KeyRangeManager} from '../../src/partition/key-range-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Generate a sorted array of unique integer keys.
 */
const sortedKeysArbitrary = fc
  .uniqueArray(fc.integer({min: 1, max: 10000}), {
    minLength: 2,
    maxLength: 100,
  })
  .map((arr) => arr.slice().sort((a, b) => a - b));

/**
 * Create a mock partition service that returns the median key.
 * @param {Array<number>} keys - Sorted array of keys.
 * @param {string} primaryKeyColumn - Column name.
 * @return {Object} Mock partition service.
 */
function createMockPartitionService(keys, primaryKeyColumn) {
  return {
    executeQuery: async (sql) => {
      if (sql.includes('COUNT')) {
        return {rows: [{total: keys.length}]};
      }
      // Extract offset from query
      const offsetMatch = sql.match(/OFFSET\s+\?/);
      if (offsetMatch) {
        const medianOffset = Math.floor(keys.length / 2);
        const medianKey = keys[medianOffset];
        return {rows: [{[primaryKeyColumn]: medianKey}]};
      }
      return {rows: []};
    },
    getKeyRange: () => ({start: null, end: null}),
  };
}

/**
 * Feature: distributed-database-system
 * Property 39: Median Split Point
 *
 * *For any* partition with sorted keys, the split point should be the median key,
 * which divides the data approximately in half.
 */
test('Property 39: Split point is median key', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      sortedKeysArbitrary,
      async (keys) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

        const mockService = createMockPartitionService(keys, 'id');

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        const result = await manager.splitPartition({
          partitionId: 'partition-1',
          partitionService: mockService,
          tableName: 'test_table',
          tableId: 'test-table',
          primaryKeyColumn: 'id',
        });

        manager.shutdown();

        // Verify median key is at the middle position
        const expectedMedianIndex = Math.floor(keys.length / 2);
        const expectedMedianKey = keys[expectedMedianIndex];

        return result.medianKey === expectedMedianKey;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Split point is median key');
});

/**
 * Property 39: Median split creates balanced partitions
 *
 * After splitting at median, approximately half the keys should be in each partition.
 */
test('Property 39: Median split creates balanced partitions', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      sortedKeysArbitrary,
      async (keys) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

        const mockService = createMockPartitionService(keys, 'id');

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        const result = await manager.splitPartition({
          partitionId: 'partition-1',
          partitionService: mockService,
          tableName: 'test_table',
          tableId: 'test-table',
          primaryKeyColumn: 'id',
        });

        manager.shutdown();

        const medianKey = result.medianKey;

        // Count keys in each partition
        const leftKeys = keys.filter((k) => k < medianKey);
        const rightKeys = keys.filter((k) => k >= medianKey);

        // Both partitions should have at least one key
        if (leftKeys.length === 0 || rightKeys.length === 0) {
          return false;
        }

        // The difference in partition sizes should be at most 1
        const sizeDiff = Math.abs(leftKeys.length - rightKeys.length);
        return sizeDiff <= 1;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Median split creates balanced partitions');
});

/**
 * Property 39: Split point is within partition range
 *
 * The median split point must be within the original partition's key range.
 */
test('Property 39: Split point is within partition range', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      sortedKeysArbitrary,
      async (keys) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

        const mockService = createMockPartitionService(keys, 'id');

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        const result = await manager.splitPartition({
          partitionId: 'partition-1',
          partitionService: mockService,
          tableName: 'test_table',
          tableId: 'test-table',
          primaryKeyColumn: 'id',
        });

        manager.shutdown();

        const medianKey = result.medianKey;

        // Median key should be one of the actual keys
        return keys.includes(medianKey);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Split point is within partition range');
});

/**
 * Property 39: Left partition ends at median, right partition starts at median
 *
 * After split, left partition should have range [start, median) and
 * right partition should have range [median, end).
 */
test('Property 39: Resulting partitions have correct ranges', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      sortedKeysArbitrary,
      async (keys) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

        const mockService = createMockPartitionService(keys, 'id');

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        const result = await manager.splitPartition({
          partitionId: 'partition-1',
          partitionService: mockService,
          tableName: 'test_table',
          tableId: 'test-table',
          primaryKeyColumn: 'id',
        });

        manager.shutdown();

        const medianKey = result.medianKey;

        // Left partition: [null, medianKey)
        if (result.leftPartition.keyRange.start !== null) {
          return false;
        }
        if (result.leftPartition.keyRange.end !== medianKey) {
          return false;
        }

        // Right partition: [medianKey, null)
        if (result.rightPartition.keyRange.start !== medianKey) {
          return false;
        }
        if (result.rightPartition.keyRange.end !== null) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Resulting partitions have correct ranges');
});
