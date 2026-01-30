/**
 * Property-based test for Contiguous Non-Overlapping Ranges.
 * **Property 40: Contiguous Non-Overlapping Ranges**
 * **Validates: Requirements 20.5**
 *
 * Property: Partition key ranges must be contiguous and non-overlapping.
 * The union of all partition ranges must cover the entire key space.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
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
 * Generate a random table ID.
 */
const tableIdArbitrary = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s));

/**
 * Generate sorted unique split points for partitioning.
 */
const splitPointsArbitrary = fc.array(
  fc.integer({min: 1, max: 1000}),
  {minLength: 0, maxLength: 5},
).map((arr) => [...new Set(arr)].sort((a, b) => a - b));

/**
 * Feature: distributed-database-system
 * Property 40: Initial partition covers full key space
 *
 * When a table is created, the initial partition should have
 * range [NULL, NULL) covering the entire key space.
 */
test('Property 40: Initial partition covers full key space', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableIdArbitrary,
      async (tableId) => {
        const manager = new KeyRangeManager(tableId);

        // Add initial partition with full range
        const initialRange = KeyRange.fullRange();
        manager.addPartition('partition-1', initialRange);

        // Verify full range
        const range = manager.getRange('partition-1');
        if (!range.isFullRange()) {
          return false;
        }

        // Validate ranges
        const validation = manager.validateRanges();
        if (!validation.valid) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Initial partition covers full key space');
});

/**
 * Property 40: Ranges remain contiguous after splits
 *
 * After splitting a partition, the resulting ranges should
 * still be contiguous and non-overlapping.
 */
test('Property 40: Ranges remain contiguous after splits', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableIdArbitrary,
      splitPointsArbitrary,
      async (tableId, splitPoints) => {
        const manager = new KeyRangeManager(tableId);

        // Start with full range
        manager.addPartition('partition-0', KeyRange.fullRange());

        // Perform splits at each split point
        let currentPartitions = ['partition-0'];

        for (let i = 0; i < splitPoints.length; i++) {
          const splitKey = splitPoints[i];

          // Find partition containing this key
          const partitionId = manager.findPartitionForKey(splitKey);
          if (!partitionId) {
            continue; // Key might be at boundary
          }

          const leftId = `partition-${i * 2 + 1}`;
          const rightId = `partition-${i * 2 + 2}`;

          try {
            manager.splitPartition(partitionId, splitKey, leftId, rightId);
            currentPartitions = currentPartitions.filter((p) => p !== partitionId);
            currentPartitions.push(leftId, rightId);
          } catch (_e) {
            // Split might fail if key is at boundary
            continue;
          }
        }

        // Validate ranges are still contiguous and non-overlapping
        const validation = manager.validateRanges();
        if (!validation.valid) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Ranges remain contiguous after splits');
});

/**
 * Property 40: No overlapping ranges allowed
 *
 * Adding a partition with an overlapping range should throw an error.
 */
test('Property 40: No overlapping ranges allowed', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableIdArbitrary,
      fc.integer({min: 10, max: 100}),
      fc.integer({min: 50, max: 150}),
      async (tableId, start1, end1) => {
        const manager = new KeyRangeManager(tableId);

        // Add first partition
        manager.addPartition('partition-1', new KeyRange(null, end1));

        // Try to add overlapping partition
        const overlappingRange = new KeyRange(start1, null);

        // If ranges overlap, should throw
        const existingRange = manager.getRange('partition-1');
        if (overlappingRange.overlaps(existingRange)) {
          try {
            manager.addPartition('partition-2', overlappingRange);
            return false; // Should have thrown
          } catch (e) {
            if (!e.message.includes('overlap')) {
              return false;
            }
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('No overlapping ranges allowed');
});

/**
 * Property 40: Any key maps to exactly one partition
 *
 * For a valid set of contiguous ranges, any key should map
 * to exactly one partition.
 */
test('Property 40: Any key maps to exactly one partition', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableIdArbitrary,
      splitPointsArbitrary,
      fc.array(fc.integer({min: -100, max: 1100}), {minLength: 1, maxLength: 10}),
      async (tableId, splitPoints, testKeys) => {
        const manager = new KeyRangeManager(tableId);

        // Build contiguous ranges from split points
        const sortedSplits = [...new Set(splitPoints)].sort((a, b) => a - b);

        if (sortedSplits.length === 0) {
          // Single partition covering all
          manager.addPartition('partition-0', KeyRange.fullRange());
        } else {
          // First partition: [NULL, first split)
          manager.addPartition('partition-0', new KeyRange(null, sortedSplits[0]));

          // Middle partitions
          for (let i = 0; i < sortedSplits.length - 1; i++) {
            manager.addPartition(
              `partition-${i + 1}`,
              new KeyRange(sortedSplits[i], sortedSplits[i + 1]),
            );
          }

          // Last partition: [last split, NULL)
          manager.addPartition(
            `partition-${sortedSplits.length}`,
            new KeyRange(sortedSplits[sortedSplits.length - 1], null),
          );
        }

        // Validate ranges
        const validation = manager.validateRanges();
        if (!validation.valid) {
          return false;
        }

        // Test that each key maps to exactly one partition
        for (const key of testKeys) {
          const _partitions = manager.findPartitionsInRange(new KeyRange(key, key + 1));

          // Key should be in at least one partition
          const containingPartition = manager.findPartitionForKey(key);
          if (!containingPartition) {
            return false;
          }

          // Count how many partitions contain this key
          let containCount = 0;
          for (const [_partitionId, range] of manager.ranges) {
            if (range.contains(key)) {
              containCount++;
            }
          }

          // Should be exactly one
          if (containCount !== 1) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Any key maps to exactly one partition');
});

/**
 * Property 40: Merged partitions maintain contiguity
 *
 * After merging adjacent partitions, ranges should still be
 * contiguous and non-overlapping.
 */
test('Property 40: Merged partitions maintain contiguity', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableIdArbitrary,
      fc.integer({min: 1, max: 3}),
      async (tableId, numSplits) => {
        const manager = new KeyRangeManager(tableId);

        // Create initial splits
        const splitPoints = [];
        for (let i = 1; i <= numSplits; i++) {
          splitPoints.push(i * 100);
        }

        // Build contiguous ranges
        manager.addPartition('partition-0', new KeyRange(null, splitPoints[0]));
        for (let i = 0; i < splitPoints.length - 1; i++) {
          manager.addPartition(
            `partition-${i + 1}`,
            new KeyRange(splitPoints[i], splitPoints[i + 1]),
          );
        }
        manager.addPartition(
          `partition-${splitPoints.length}`,
          new KeyRange(splitPoints[splitPoints.length - 1], null),
        );

        // Validate before merge
        let validation = manager.validateRanges();
        if (!validation.valid) {
          return false;
        }

        // Merge first two partitions
        if (manager.getPartitionCount() >= 2) {
          const sorted = manager.getSortedPartitions();
          const leftId = sorted[0].partitionId;
          const rightId = sorted[1].partitionId;

          manager.mergePartitions(leftId, rightId, 'merged-partition');

          // Validate after merge
          validation = manager.validateRanges();
          if (!validation.valid) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Merged partitions maintain contiguity');
});
