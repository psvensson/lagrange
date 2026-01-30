/**
 * Property 49: Distributed Query Parallelism
 * Validates: Requirements 22.1
 *
 * For any SELECT query spanning multiple partitions, the system should
 * execute it by querying all relevant partitions in parallel.
 * All queries route through message router using service addresses from system cache.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data storage
const mockPartitionData = new Map();

// Execution tracker for timing tests
let executionTracker = {starts: [], ends: []};

// Mock message router that routes queries to mock partition data with timing
function createTimedMockMessageRouter(delay) {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const startTime = Date.now();
        executionTracker.starts.push({partitionId, time: startTime});

        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, delay));

        const endTime = Date.now();
        executionTracker.ends.push({partitionId, time: endTime});

        const data = mockPartitionData.get(partitionId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: data.length || 1,
        };
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };
}

// Simple mock message router without timing
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: data.length || 1,
        };
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(partitionIds) {
  const services = partitionIds.map((pid) => ({
    service_id: pid,
    service_type: 'partition',
    partition_id: pid,
    node_id: 'test-node',
    address: `test-node/partition/${pid}`,
    status: 'active',
  }));

  return {
    services,
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
  };
}

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
          executionTracker = {starts: [], ends: []};
          const delay = 50; // 50ms delay per partition to reduce timing flakiness
          const partitionIds = [];

          // Distribute rows across partitions
          for (let i = 0; i < partitionCount; i++) {
            const pid = `p${i}`;
            partitionIds.push(pid);
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            mockPartitionData.set(pid, partitionRows);
          }

          const executor = new QueryExecutor({
            messageRouter: createTimedMockMessageRouter(delay),
            systemCache: createMockSystemCache(partitionIds),
          });

          const ast = new SQLParser('SELECT * FROM test').parse();

          const startTime = Date.now();
          await executor.executeSelect(ast, partitionIds);
          const totalTime = Date.now() - startTime;

          mockPartitionData.clear();

          // Property: All partitions should start execution before any finishes
          // (indicating parallel execution)
          if (executionTracker.starts.length >= 2) {
            const firstEnd = Math.min(...executionTracker.ends.map((e) => e.time));
            const lastStart = Math.max(...executionTracker.starts.map((s) => s.time));

            // In parallel execution, all starts should happen before first end
            // Allow some tolerance for timing variations
            const tolerance = Math.max(10, Math.floor(delay * 0.2));
            const isParallel = lastStart <= firstEnd + tolerance;

            if (!isParallel) {
              return false;
            }
          }

          // Property: Total time should be closer to single partition time
          // than to sum of all partition times (parallel vs sequential)
          const sequentialTime = partitionCount * delay;

          // Total time should be meaningfully less than sequential time
          return totalTime <= sequentialTime - (delay / 2);
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
          const partitionIds = [];

          // Distribute rows across partitions
          for (let i = 0; i < partitionCount; i++) {
            const pid = `p${i}`;
            partitionIds.push(pid);
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            mockPartitionData.set(pid, partitionRows);
          }

          const executor = new QueryExecutor({
            messageRouter: createMockMessageRouter(),
            systemCache: createMockSystemCache(partitionIds),
          });

          const ast = new SQLParser('SELECT * FROM test').parse();
          const result = await executor.executeSelect(ast, partitionIds);

          mockPartitionData.clear();

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
          const partitionIds = [];

          for (let i = 0; i < partitionCount; i++) {
            const pid = `p${i}`;
            partitionIds.push(pid);
            mockPartitionData.set(pid, [{id: i}]);
          }

          const executor = new QueryExecutor({
            messageRouter: createMockMessageRouter(),
            systemCache: createMockSystemCache(partitionIds),
          });

          const ast = new SQLParser('SELECT * FROM test').parse();
          const result = await executor.executeSelect(ast, partitionIds);

          mockPartitionData.clear();

          // Property: Result should track which partitions were queried
          return result.partitions.length === partitionCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Partition count is tracked in result');
  });
});
