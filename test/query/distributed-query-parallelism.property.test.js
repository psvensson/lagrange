/**
 * Property 49: Distributed Query Parallelism
 * Validates: Requirements 22.1
 *
 * For any SELECT query spanning multiple partitions, the system should
 * execute it by querying all relevant partitions in parallel.
 */

import {test} from 'tap';
import fc from 'fast-check';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration
const config = ConfigurationManager.getInstance();
config.initialize();

/**
 * Create a mock partition that tracks execution timing.
 * @param {Array} data - Data to return.
 * @param {number} delay - Simulated delay in ms.
 * @param {Object} tracker - Execution tracker object.
 * @param {string} partitionId - Partition ID for tracking.
 * @return {Object} Mock partition.
 */
function createTimedMockPartition(data, delay, tracker, partitionId) {
  return {
    data,
    executeQuery: async function(sql, _params) {
      const startTime = Date.now();
      tracker.starts.push({partitionId, time: startTime});

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, delay));

      const endTime = Date.now();
      tracker.ends.push({partitionId, time: endTime});

      if (sql.toUpperCase().startsWith('SELECT')) {
        return {rows: this.data, changes: 0};
      }
      return {rows: [], changes: 1};
    },
  };
}

/**
 * Create a simple mock partition without timing.
 * @param {Array} data - Data to return.
 * @return {Object} Mock partition.
 */
function createMockPartition(data) {
  return {
    data,
    executeQuery: async function(sql, _params) {
      if (sql.toUpperCase().startsWith('SELECT')) {
        return {rows: this.data, changes: 0};
      }
      return {rows: [], changes: 1};
    },
  };
}

/**
 * Property 49: Distributed Query Parallelism
 * For any SELECT query spanning multiple partitions, the system should
 * execute it by querying all relevant partitions in parallel.
 * **Validates: Requirements 22.1**
 */
test('Property 49: Distributed Query Parallelism', async (t) => {
  await t.test('queries execute on all partitions in parallel', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}), // Number of partitions
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 1000}),
            value: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 1, maxLength: 10},
        ),
        async (partitionCount, rows) => {
          const tracker = {starts: [], ends: []};
          const partitions = new Map();
          const delay = 10; // 10ms delay per partition

          // Distribute rows across partitions
          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            const partitionId = `p${i}`;
            partitions.set(
              partitionId,
              createTimedMockPartition(partitionRows, delay, tracker, partitionId),
            );
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT * FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const startTime = Date.now();
          await executor.executeSelect(ast, partitionIds);
          const totalTime = Date.now() - startTime;

          // Property: All partitions should start execution before any finishes
          // (indicating parallel execution)
          if (tracker.starts.length >= 2) {
            const firstEnd = Math.min(...tracker.ends.map((e) => e.time));
            const lastStart = Math.max(...tracker.starts.map((s) => s.time));

            // In parallel execution, all starts should happen before first end
            // Allow some tolerance for timing variations
            const isParallel = lastStart <= firstEnd + 5;

            if (!isParallel) {
              return false;
            }
          }

          // Property: Total time should be closer to single partition time
          // than to sum of all partition times (parallel vs sequential)
          const sequentialTime = partitionCount * delay;
          const _parallelTime = delay + 20; // Single delay + overhead

          // Total time should be much less than sequential time
          return totalTime < sequentialTime;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Queries execute on all partitions in parallel');
  });

  await t.test('all partition results are combined', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 1000}),
            value: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 1, maxLength: 20},
        ),
        async (partitionCount, rows) => {
          const partitions = new Map();

          // Distribute rows across partitions
          const partitionData = Array.from({length: partitionCount}, () => []);
          for (let i = 0; i < rows.length; i++) {
            partitionData[i % partitionCount].push(rows[i]);
          }

          for (let i = 0; i < partitionCount; i++) {
            partitions.set(`p${i}`, createMockPartition(partitionData[i]));
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT * FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

          // Property: Result should contain all rows from all partitions
          return result.success === true && result.rows.length === rows.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('All partition results are combined correctly');
  });

  await t.test('partition count is tracked in result', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 5}),
        async (partitionCount) => {
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            partitions.set(`p${i}`, createMockPartition([{id: i}]));
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT * FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

          // Property: Result should track which partitions were queried
          return result.partitions.length === partitionCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Partition count is tracked in result');
  });
});
