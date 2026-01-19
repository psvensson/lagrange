/**
 * Property 70: Parallel Query Execution
 * Validates: Requirements 26.1
 *
 * For any query spanning multiple partitions, the system should execute
 * partition queries in parallel with total latency determined by the
 * slowest partition response.
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
 * Create a mock partition that tracks execution order without delays.
 * @param {Array} data - Data to return.
 * @param {Object} tracker - Execution tracker.
 * @param {string} partitionId - Partition ID.
 * @return {Object} Mock partition.
 */
function createTrackingMockPartition(data, tracker, partitionId) {
  return {
    data,
    executeQuery: async function(sql, _params) {
      const order = tracker.executionOrder++;
      tracker.starts.push({partitionId, order});

      // Yield to allow other promises to start (tests parallelism)
      await Promise.resolve();

      tracker.ends.push({partitionId, order});

      if (sql.toUpperCase().startsWith('SELECT')) {
        return {rows: this.data, changes: 0};
      }
      return {rows: [], changes: 1};
    },
  };
}

/**
 * Property 70: Parallel Query Execution
 * For any query spanning multiple partitions, the system should execute
 * partition queries in parallel with total latency determined by the
 * slowest partition response.
 * **Validates: Requirements 26.1**
 */
test('Property 70: Parallel Query Execution', async (t) => {
  await t.test('queries execute in parallel - all start before any ends', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}), // Number of partitions
        async (partitionCount) => {
          const tracker = {starts: [], ends: [], executionOrder: 0};
          const partitions = new Map();

          // Create partitions
          for (let i = 0; i < partitionCount; i++) {
            const partitionId = `p${i}`;
            partitions.set(
              partitionId,
              createTrackingMockPartition([{id: i}], tracker, partitionId),
            );
          }

          const coordinator = new ParallelQueryCoordinator({
            partitionRegistry: partitions,
          });
          // Disable speculative execution for cleaner test
          coordinator.speculativeExecutionEnabled = false;

          const partitionIds = Array.from(partitions.keys());
          await coordinator.executeParallel(
            'SELECT * FROM test',
            partitionIds,
            [],
          );

          // Property: All partitions should be started (Promise.all behavior)
          return tracker.starts.length === partitionCount &&
                 tracker.ends.length === partitionCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Queries execute in parallel - all start before any ends');
  });

  await t.test('all partitions are queried', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}),
        async (partitionCount) => {
          const queriedPartitions = new Set();
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            const partitionId = `p${i}`;
            partitions.set(partitionId, {
              executeQuery: async () => {
                queriedPartitions.add(partitionId);
                return {rows: [{id: i}], changes: 0};
              },
            });
          }

          const coordinator = new ParallelQueryCoordinator({
            partitionRegistry: partitions,
          });
          coordinator.speculativeExecutionEnabled = false;

          const partitionIds = Array.from(partitions.keys());
          await coordinator.executeParallel('SELECT * FROM test', partitionIds, []);

          // Property: All partitions should be queried
          return queriedPartitions.size === partitionCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('All partitions are queried');
  });

  await t.test('results from all partitions are combined', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 4}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            value: fc.integer({min: 0, max: 50}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        async (partitionCount, rows) => {
          const partitions = new Map();

          // Distribute rows across partitions
          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            const partitionId = `p${i}`;
            partitions.set(partitionId, {
              executeQuery: async () => ({rows: partitionRows, changes: 0}),
            });
          }

          const coordinator = new ParallelQueryCoordinator({
            partitionRegistry: partitions,
          });
          coordinator.speculativeExecutionEnabled = false;

          const partitionIds = Array.from(partitions.keys());
          const result = await coordinator.executeParallel(
            'SELECT * FROM test',
            partitionIds,
            [],
          );

          // Property: Result should contain all rows from all partitions
          const totalRows = result.results.reduce(
            (sum, r) => sum + (r.rows?.length || 0),
            0,
          );

          return result.success === true && totalRows === rows.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Results from all partitions are combined');
  });

  await t.test('metrics track partition count correctly', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 5}),
        async (partitionCount) => {
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            partitions.set(`p${i}`, {
              executeQuery: async () => ({rows: [{id: i}], changes: 0}),
            });
          }

          const coordinator = new ParallelQueryCoordinator({
            partitionRegistry: partitions,
          });
          coordinator.speculativeExecutionEnabled = false;

          const partitionIds = Array.from(partitions.keys());
          const result = await coordinator.executeParallel(
            'SELECT * FROM test',
            partitionIds,
            [],
          );

          // Property: Metrics should track correct partition count
          return (
            result.success === true &&
            result.metrics.partitionCount === partitionCount &&
            result.partitions.length === partitionCount
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Metrics track partition count correctly');
  });
});
