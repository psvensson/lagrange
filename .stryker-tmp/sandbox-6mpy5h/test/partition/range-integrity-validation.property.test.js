/**
 * Property-based test for Range Integrity Validation.
 * **Property 44: Range Integrity Validation**
 * **Validates: Requirements 20.9**
 *
 * Property: *For any* partition split or merge operation, the system should
 * validate that the resulting ranges maintain integrity (contiguous,
 * non-overlapping, and covering the original key space).
 */
// @ts-nocheck


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
 * Generate sorted unique split points.
 */
const splitPointsArbitrary = fc.array(
  fc.integer({min: 1, max: 1000}),
  {minLength: 1, maxLength: 5},
).map((arr) => [...new Set(arr)].sort((a, b) => a - b));

/**
 * Create a mock partition service.
 * @param {number} medianKey - The median key to return.
 * @return {Object} Mock partition service.
 */
function createMockPartitionService(medianKey) {
  return {
    executeQuery: async (sql) => {
      if (sql.includes('COUNT')) {
        return {rows: [{total: 100}]};
      }
      return {rows: [{id: medianKey}]};
    },
    getKeyRange: () => ({start: null, end: null}),
  };
}

/**
 * Feature: distributed-database-system
 * Property 44: Range Integrity Validation
 *
 * *For any* split operation, the resulting ranges should be contiguous
 * and cover the original range exactly.
 */
test('Property 44: Split maintains range integrity', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 1000}),
      async (medianKey) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

        const mockService = createMockPartitionService(medianKey);

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        await manager.splitPartition({
          partitionId: 'partition-1',
          partitionService: mockService,
          tableName: 'test_table',
          tableId: 'test-table',
          primaryKeyColumn: 'id',
        });

        manager.shutdown();

        // Validate ranges after split
        const validation = keyRangeManager.validateRanges();
        return validation.valid;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Split maintains range integrity');
});

/**
 * Property 44: Merge maintains range integrity
 *
 * After merging adjacent partitions, ranges should remain contiguous.
 */
test('Property 44: Merge maintains range integrity', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 1000}),
      async (boundaryKey) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-1', new KeyRange(null, boundaryKey));
        keyRangeManager.addPartition('partition-2', new KeyRange(boundaryKey, null));

        // Validate before merge
        let validation = keyRangeManager.validateRanges();
        if (!validation.valid) {
          return false;
        }

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        await manager.mergePartitions({
          leftPartitionId: 'partition-1',
          rightPartitionId: 'partition-2',
          tableId: 'test-table',
        });

        manager.shutdown();

        // Validate ranges after merge
        validation = keyRangeManager.validateRanges();
        return validation.valid;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Merge maintains range integrity');
});

/**
 * Property 44: Multiple splits maintain range integrity
 *
 * After multiple consecutive splits, ranges should remain contiguous
 * and non-overlapping.
 */
test('Property 44: Multiple splits maintain range integrity', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      splitPointsArbitrary,
      async (splitPoints) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-0', KeyRange.fullRange());

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        // Perform splits at each split point
        for (let i = 0; i < splitPoints.length; i++) {
          const splitKey = splitPoints[i];

          // Find partition containing this key
          const partitionId = keyRangeManager.findPartitionForKey(splitKey);
          if (!partitionId) {
            continue;
          }

          const mockService = createMockPartitionService(splitKey);

          try {
            await manager.splitPartition({
              partitionId,
              partitionService: mockService,
              tableName: 'test_table',
              tableId: 'test-table',
              primaryKeyColumn: 'id',
            });
          } catch (_e) {
            // Split might fail if key is at boundary
            continue;
          }

          // Validate after each split
          const validation = keyRangeManager.validateRanges();
          if (!validation.valid) {
            manager.shutdown();
            return false;
          }
        }

        manager.shutdown();

        // Final validation
        const validation = keyRangeManager.validateRanges();
        return validation.valid;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Multiple splits maintain range integrity');
});

/**
 * Property 44: Split then merge restores original range
 *
 * Splitting a partition and then merging the results should restore
 * the original key range.
 */
test('Property 44: Split then merge restores original range', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 1000}),
      async (medianKey) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

        const mockService = createMockPartitionService(medianKey);

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        // Split the partition
        const splitResult = await manager.splitPartition({
          partitionId: 'partition-1',
          partitionService: mockService,
          tableName: 'test_table',
          tableId: 'test-table',
          primaryKeyColumn: 'id',
        });

        // Merge the resulting partitions back
        const mergeResult = await manager.mergePartitions({
          leftPartitionId: splitResult.leftPartition.partitionId,
          rightPartitionId: splitResult.rightPartition.partitionId,
          tableId: 'test-table',
        });

        manager.shutdown();

        // Merged partition should have full range again
        if (mergeResult.mergedPartition.keyRange.start !== null) {
          return false;
        }
        if (mergeResult.mergedPartition.keyRange.end !== null) {
          return false;
        }

        // Should have exactly one partition
        if (keyRangeManager.getPartitionCount() !== 1) {
          return false;
        }

        // Validate ranges
        const validation = keyRangeManager.validateRanges();
        return validation.valid;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Split then merge restores original range');
});

/**
 * Property 44: Invalid split ranges are rejected
 *
 * The system should reject split operations that would create invalid ranges.
 */
test('Property 44: Invalid split ranges are rejected', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 1000}),
      async (medianKey) => {
        const manager = new PartitionSplitMergeManager();

        const originalRange = new KeyRange(null, null);
        const leftRange = new KeyRange(null, medianKey);
        const rightRange = new KeyRange(medianKey, null);

        // Valid ranges should pass
        try {
          manager.validateRangeIntegrity(leftRange, rightRange, originalRange);
        } catch (_e) {
          manager.shutdown();
          return false;
        }

        // Invalid: left doesn't start at original start
        const badLeftRange = new KeyRange(10, medianKey);
        let errorThrown = false;
        try {
          manager.validateRangeIntegrity(badLeftRange, rightRange, originalRange);
        } catch (e) {
          errorThrown = e.message.includes('left start');
        }
        if (!errorThrown) {
          manager.shutdown();
          return false;
        }

        // Invalid: right doesn't end at original end
        const badRightRange = new KeyRange(medianKey, 2000);
        errorThrown = false;
        try {
          manager.validateRangeIntegrity(leftRange, badRightRange, originalRange);
        } catch (e) {
          errorThrown = e.message.includes('right end');
        }
        if (!errorThrown) {
          manager.shutdown();
          return false;
        }

        manager.shutdown();
        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Invalid split ranges are rejected');
});

/**
 * Property 44: Key space coverage is preserved
 *
 * After any split or merge operation, every key should map to exactly
 * one partition.
 */
test('Property 44: Key space coverage is preserved', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 1000}),
      fc.array(fc.integer({min: -100, max: 1100}), {minLength: 5, maxLength: 20}),
      async (medianKey, testKeys) => {
        const keyRangeManager = new KeyRangeManager('test-table');
        keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

        const mockService = createMockPartitionService(medianKey);

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        // Split the partition
        await manager.splitPartition({
          partitionId: 'partition-1',
          partitionService: mockService,
          tableName: 'test_table',
          tableId: 'test-table',
          primaryKeyColumn: 'id',
        });

        manager.shutdown();

        // Every test key should map to exactly one partition
        for (const key of testKeys) {
          let containCount = 0;
          for (const [_partitionId, range] of keyRangeManager.ranges) {
            if (range.contains(key)) {
              containCount++;
            }
          }
          if (containCount !== 1) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Key space coverage is preserved');
});
