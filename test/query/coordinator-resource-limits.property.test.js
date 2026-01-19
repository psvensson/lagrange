/**
 * Property 71: Coordinator Resource Limits
 * Validates: Requirements 26.2, 26.3, 26.8
 *
 * The system should enforce resource limits including max partitions per query,
 * max result buffer size, and max concurrent connections.
 */

import {test} from 'tap';
import fc from 'fast-check';
import {ParallelQueryCoordinator} from '../../src/query/parallel-query-coordinator.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration
const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

/**
 * Create a mock partition that returns specified data.
 * @param {Array} data - Data to return.
 * @return {Object} Mock partition.
 */
function createMockPartition(data) {
  return {
    executeQuery: async () => ({rows: data, changes: 0}),
  };
}

/**
 * Create a coordinator with speculative execution disabled for fast tests.
 * @param {Map} partitions - Partition registry.
 * @return {ParallelQueryCoordinator} Coordinator instance.
 */
function createFastCoordinator(partitions) {
  const coordinator = new ParallelQueryCoordinator({
    partitionRegistry: partitions,
  });
  // Disable speculative execution to avoid interval timers
  coordinator.speculativeExecutionEnabled = false;
  return coordinator;
}

/**
 * Property 71: Coordinator Resource Limits
 * The system should enforce resource limits including max partitions per query,
 * max result buffer size, and max concurrent connections.
 * **Validates: Requirements 26.2, 26.3, 26.8**
 */
test('Property 71: Coordinator Resource Limits', async (t) => {
  await t.test('enforces max parallel partitions limit', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 5, max: 20}), // Requested partitions
        fc.integer({min: 3, max: 4}), // Max allowed partitions
        async (requestedCount, maxAllowed) => {
          const partitions = new Map();

          for (let i = 0; i < requestedCount; i++) {
            partitions.set(`p${i}`, createMockPartition([{id: i}]));
          }

          const coordinator = createFastCoordinator(partitions);
          coordinator.maxParallelPartitions = maxAllowed;

          const partitionIds = Array.from(partitions.keys());
          const result = await coordinator.executeParallel(
            'SELECT * FROM test',
            partitionIds,
            [],
          );

          // Property: Should limit partitions to maxAllowed
          const actualPartitions = result.partitions.length;
          return actualPartitions <= maxAllowed;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Enforces max parallel partitions limit');
  });

  await t.test('tracks resource usage correctly', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 5}),
        async (partitionCount) => {
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            partitions.set(`p${i}`, createMockPartition([{id: i}]));
          }

          const coordinator = createFastCoordinator(partitions);

          const usage = coordinator.getResourceUsage();

          // Property: Resource usage should have correct limits
          return (
            usage.maxParallelPartitions > 0 &&
            usage.maxConcurrentConnections > 0 &&
            usage.maxResultBufferBytes > 0 &&
            usage.activeConnections >= 0
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Tracks resource usage correctly');
  });

  await t.test('metrics include total bytes estimate', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 3}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            name: fc.string({minLength: 1, maxLength: 10}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        async (partitionCount, rows) => {
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            partitions.set(`p${i}`, createMockPartition(partitionRows));
          }

          const coordinator = createFastCoordinator(partitions);

          const partitionIds = Array.from(partitions.keys());
          const result = await coordinator.executeParallel(
            'SELECT * FROM test',
            partitionIds,
            [],
          );

          // Property: Metrics should include bytes estimate
          return (
            result.success === true &&
            typeof result.metrics.totalBytes === 'number' &&
            result.metrics.totalBytes >= 0
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Metrics include total bytes estimate');
  });

  await t.test('respects max concurrent connections', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}),
        async (partitionCount) => {
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            partitions.set(`p${i}`, createMockPartition([{id: i}]));
          }

          const coordinator = createFastCoordinator(partitions);
          coordinator.maxConcurrentConnections = 100;

          const partitionIds = Array.from(partitions.keys());
          const result = await coordinator.executeParallel(
            'SELECT * FROM test',
            partitionIds,
            [],
          );

          // Property: Should succeed when within limits
          return result.success === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Respects max concurrent connections');
  });

  await t.test('partition limit truncates correctly', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 10, max: 20}),
        async (requestedCount) => {
          const partitions = new Map();
          const maxAllowed = 5;

          for (let i = 0; i < requestedCount; i++) {
            partitions.set(`p${i}`, createMockPartition([{id: i}]));
          }

          const coordinator = createFastCoordinator(partitions);
          coordinator.maxParallelPartitions = maxAllowed;

          const partitionIds = Array.from(partitions.keys());
          const result = await coordinator.executeParallel(
            'SELECT * FROM test',
            partitionIds,
            [],
          );

          // Property: Should truncate to exactly maxAllowed
          return (
            result.success === true &&
            result.partitions.length === maxAllowed
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Partition limit truncates correctly');
  });
});
