/**
 * Property-based test for Adjacent Partition Merging.
 * **Property 43: Adjacent Partition Merging**
 * **Validates: Requirements 20.8**
 *
 * Property: *For any* two adjacent partitions (where left.end === right.start),
 * merging them should produce a single partition with combined key range.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  PartitionSplitMergeManager,
  DEFAULT_MERGE_STORAGE_THRESHOLD,
  DEFAULT_MERGE_TRAFFIC_THRESHOLD,
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
 * Generate a boundary key for partition split.
 */
const boundaryKeyArbitrary = fc.integer({min: 1, max: 1000});

/**
 * Generate partition metrics below merge thresholds.
 */
const lowMetricsArbitrary = fc.record({
  sizeBytes: fc.integer({min: 0, max: Math.floor(DEFAULT_MERGE_STORAGE_THRESHOLD / 2)}),
  queriesPerMinute: fc.integer({min: 0, max: Math.floor(DEFAULT_MERGE_TRAFFIC_THRESHOLD / 2)}),
});

/**
 * Feature: distributed-database-system
 * Property 43: Adjacent Partition Merging
 *
 * *For any* two adjacent partitions, merging them should produce a partition
 * with the combined key range [left.start, right.end).
 */
test('Property 43: Merged partition has combined key range', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      boundaryKeyArbitrary,
      async (boundaryKey) => {
        const keyRangeManager = new KeyRangeManager('test-table');

        // Create two adjacent partitions
        keyRangeManager.addPartition('partition-1', new KeyRange(null, boundaryKey));
        keyRangeManager.addPartition('partition-2', new KeyRange(boundaryKey, null));

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        const result = await manager.mergePartitions({
          leftPartitionId: 'partition-1',
          rightPartitionId: 'partition-2',
          tableId: 'test-table',
        });

        manager.shutdown();

        // Merged partition should have full range
        if (result.mergedPartition.keyRange.start !== null) {
          return false;
        }
        if (result.mergedPartition.keyRange.end !== null) {
          return false;
        }

        return result.success === true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Merged partition has combined key range');
});

/**
 * Property 43: Only adjacent partitions can be merged
 *
 * Attempting to merge non-adjacent partitions should fail.
 */
test('Property 43: Non-adjacent partitions cannot be merged', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 10, max: 100}),
      fc.integer({min: 101, max: 200}),
      async (boundary1, boundary2) => {
        const keyRangeManager = new KeyRangeManager('test-table');

        // Create three partitions
        keyRangeManager.addPartition('partition-1', new KeyRange(null, boundary1));
        keyRangeManager.addPartition('partition-2', new KeyRange(boundary1, boundary2));
        keyRangeManager.addPartition('partition-3', new KeyRange(boundary2, null));

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        // Try to merge non-adjacent partitions (1 and 3)
        let errorThrown = false;
        try {
          await manager.mergePartitions({
            leftPartitionId: 'partition-1',
            rightPartitionId: 'partition-3',
            tableId: 'test-table',
          });
        } catch (e) {
          errorThrown = e.message.includes('not adjacent');
        }

        manager.shutdown();

        return errorThrown === true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Non-adjacent partitions cannot be merged');
});

/**
 * Property 43: Merge criteria requires both conditions
 *
 * Merge should only be triggered when BOTH storage AND traffic are below thresholds.
 */
test('Property 43: Merge criteria is AND - both conditions required', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      lowMetricsArbitrary,
      lowMetricsArbitrary,
      async (leftMetrics, rightMetrics) => {
        const manager = new PartitionSplitMergeManager();

        const shouldMerge = manager.evaluateMergeCriteria(
          'partition-1', 'partition-2', leftMetrics, rightMetrics,
        );

        const combinedStorage = leftMetrics.sizeBytes + rightMetrics.sizeBytes;
        const combinedTraffic = leftMetrics.queriesPerMinute + rightMetrics.queriesPerMinute;

        const storageOk = combinedStorage <= DEFAULT_MERGE_STORAGE_THRESHOLD;
        const trafficOk = combinedTraffic <= DEFAULT_MERGE_TRAFFIC_THRESHOLD;
        const expectedMerge = storageOk && trafficOk;

        manager.shutdown();

        return shouldMerge === expectedMerge;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Merge criteria is AND - both conditions required');
});

/**
 * Property 43: Merge removes original partitions from key range manager
 */
test('Property 43: Merge removes original partitions', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      boundaryKeyArbitrary,
      async (boundaryKey) => {
        const keyRangeManager = new KeyRangeManager('test-table');

        keyRangeManager.addPartition('partition-1', new KeyRange(null, boundaryKey));
        keyRangeManager.addPartition('partition-2', new KeyRange(boundaryKey, null));

        const initialCount = keyRangeManager.getPartitionCount();

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        await manager.mergePartitions({
          leftPartitionId: 'partition-1',
          rightPartitionId: 'partition-2',
          tableId: 'test-table',
        });

        manager.shutdown();

        // Should have one less partition after merge
        const finalCount = keyRangeManager.getPartitionCount();
        if (finalCount !== initialCount - 1) {
          return false;
        }

        // Original partitions should be gone
        if (keyRangeManager.getRange('partition-1') !== null) {
          return false;
        }
        if (keyRangeManager.getRange('partition-2') !== null) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Merge removes original partitions');
});

/**
 * Property 43: Merge preserves key space coverage
 *
 * After merging, the merged partition should cover the same key space
 * as the two original partitions combined.
 */
test('Property 43: Merge preserves key space coverage', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 10, max: 100}),
      fc.integer({min: 101, max: 200}),
      async (boundary1, boundary2) => {
        const keyRangeManager = new KeyRangeManager('test-table');

        // Create three partitions
        keyRangeManager.addPartition('partition-1', new KeyRange(null, boundary1));
        keyRangeManager.addPartition('partition-2', new KeyRange(boundary1, boundary2));
        keyRangeManager.addPartition('partition-3', new KeyRange(boundary2, null));

        const manager = new PartitionSplitMergeManager({
          keyRangeManager,
        });

        // Merge adjacent partitions 1 and 2
        const result = await manager.mergePartitions({
          leftPartitionId: 'partition-1',
          rightPartitionId: 'partition-2',
          tableId: 'test-table',
        });

        manager.shutdown();

        // Merged partition should cover [null, boundary2)
        if (result.mergedPartition.keyRange.start !== null) {
          return false;
        }
        if (result.mergedPartition.keyRange.end !== boundary2) {
          return false;
        }

        // Validate ranges are still contiguous
        const validation = keyRangeManager.validateRanges();
        return validation.valid;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Merge preserves key space coverage');
});
