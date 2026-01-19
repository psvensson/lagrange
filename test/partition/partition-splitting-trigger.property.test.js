/**
 * Property-based test for Partition Splitting Trigger.
 * **Property 7: Partition Splitting Trigger**
 * **Validates: Requirements 3.6**
 *
 * Property: *For any* partition metrics, when storage >= 10GB OR traffic >= 1000 qpm,
 * the partition should be marked for splitting.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {
  PartitionSplitMergeManager,
  DEFAULT_SPLIT_STORAGE_THRESHOLD,
  DEFAULT_SPLIT_TRAFFIC_THRESHOLD,
} from '../../src/partition/partition-split-merge-manager.js';
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
 * Generate partition metrics with storage and traffic values.
 */
const metricsArbitrary = fc.record({
  sizeBytes: fc.integer({min: 0, max: 20 * 1024 * 1024 * 1024}), // 0 to 20GB
  queriesPerMinute: fc.integer({min: 0, max: 2000}), // 0 to 2000 qpm
});

/**
 * Feature: distributed-database-system
 * Property 7: Partition Splitting Trigger
 *
 * *For any* partition metrics, when storage >= split_storage_threshold OR
 * traffic >= split_traffic_threshold, the partition should be marked for splitting.
 */
test('Property 7: Split triggered when storage exceeds threshold', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: DEFAULT_SPLIT_STORAGE_THRESHOLD, max: 20 * 1024 * 1024 * 1024}),
      fc.integer({min: 0, max: DEFAULT_SPLIT_TRAFFIC_THRESHOLD - 1}),
      async (sizeBytes, queriesPerMinute) => {
        const manager = new PartitionSplitMergeManager();

        const metrics = {sizeBytes, queriesPerMinute};
        const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics);

        manager.shutdown();

        // When storage >= threshold, should split regardless of traffic
        return shouldSplit === true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Split triggered when storage exceeds threshold');
});

/**
 * Property 7: Split triggered when traffic exceeds threshold
 */
test('Property 7: Split triggered when traffic exceeds threshold', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 0, max: DEFAULT_SPLIT_STORAGE_THRESHOLD - 1}),
      fc.integer({min: DEFAULT_SPLIT_TRAFFIC_THRESHOLD, max: 2000}),
      async (sizeBytes, queriesPerMinute) => {
        const manager = new PartitionSplitMergeManager();

        const metrics = {sizeBytes, queriesPerMinute};
        const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics);

        manager.shutdown();

        // When traffic >= threshold, should split regardless of storage
        return shouldSplit === true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Split triggered when traffic exceeds threshold');
});

/**
 * Property 7: No split when both metrics below thresholds
 */
test('Property 7: No split when both metrics below thresholds', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 0, max: DEFAULT_SPLIT_STORAGE_THRESHOLD - 1}),
      fc.integer({min: 0, max: DEFAULT_SPLIT_TRAFFIC_THRESHOLD - 1}),
      async (sizeBytes, queriesPerMinute) => {
        const manager = new PartitionSplitMergeManager();

        const metrics = {sizeBytes, queriesPerMinute};
        const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics);

        manager.shutdown();

        // When both below thresholds, should not split
        return shouldSplit === false;
      },
    ),
    {numRuns: 10},
  );

  t.pass('No split when both metrics below thresholds');
});

/**
 * Property 7: Split criteria is OR (either condition triggers split)
 */
test('Property 7: Split criteria is OR - either condition triggers split', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      metricsArbitrary,
      async (metrics) => {
        const manager = new PartitionSplitMergeManager();

        const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics);

        const storageExceeds = metrics.sizeBytes >= DEFAULT_SPLIT_STORAGE_THRESHOLD;
        const trafficExceeds = metrics.queriesPerMinute >= DEFAULT_SPLIT_TRAFFIC_THRESHOLD;
        const expectedSplit = storageExceeds || trafficExceeds;

        manager.shutdown();

        // Split decision should match OR of both conditions
        return shouldSplit === expectedSplit;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Split criteria is OR - either condition triggers split');
});

/**
 * Property 7: Custom policy thresholds are respected
 */
test('Property 7: Custom policy thresholds are respected', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1 * 1024 * 1024 * 1024, max: 15 * 1024 * 1024 * 1024}),
      fc.integer({min: 100, max: 1500}),
      metricsArbitrary,
      async (customStorageThreshold, customTrafficThreshold, metrics) => {
        const manager = new PartitionSplitMergeManager();

        const policy = {
          splitStorageThreshold: customStorageThreshold,
          splitTrafficThreshold: customTrafficThreshold,
        };

        const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics, policy);

        const storageExceeds = metrics.sizeBytes >= customStorageThreshold;
        const trafficExceeds = metrics.queriesPerMinute >= customTrafficThreshold;
        const expectedSplit = storageExceeds || trafficExceeds;

        manager.shutdown();

        // Split decision should use custom thresholds
        return shouldSplit === expectedSplit;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Custom policy thresholds are respected');
});
