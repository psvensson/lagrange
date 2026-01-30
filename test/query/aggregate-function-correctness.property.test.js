/**
 * Property 53: Aggregate Function Correctness
 * Validates: Requirements 22.7
 *
 * For any cross-partition query with aggregate functions (COUNT, SUM, AVG, MIN, MAX),
 * the system should produce results equivalent to executing the query on a
 * single-partition table.
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

// Mock message router that routes queries to mock partition data
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

/**
 * Reference implementation for COUNT.
 */
function referenceCount(rows, column) {
  if (column === '*') {
    return rows.length;
  }
  return rows.filter((r) => r[column] !== null && r[column] !== undefined).length;
}

/**
 * Reference implementation for SUM.
 */
function referenceSum(rows, column) {
  return rows.reduce((sum, r) => sum + (Number(r[column]) || 0), 0);
}

/**
 * Reference implementation for AVG.
 */
function referenceAvg(rows, column) {
  const values = rows
    .map((r) => r[column])
    .filter((v) => v !== null && v !== undefined);
  if (values.length === 0) return null;
  const sum = values.reduce((s, v) => s + (Number(v) || 0), 0);
  return sum / values.length;
}

/**
 * Reference implementation for MIN.
 */
function referenceMin(rows, column) {
  const values = rows
    .map((r) => r[column])
    .filter((v) => v !== null && v !== undefined);
  if (values.length === 0) return null;
  return values.reduce((min, v) => v < min ? v : min, values[0]);
}

/**
 * Reference implementation for MAX.
 */
function referenceMax(rows, column) {
  const values = rows
    .map((r) => r[column])
    .filter((v) => v !== null && v !== undefined);
  if (values.length === 0) return null;
  return values.reduce((max, v) => v > max ? v : max, values[0]);
}

test('Property 53: Aggregate Function Correctness', async (t) => {
  await t.test('COUNT(*) is correct across partitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 4}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            value: fc.integer({min: 0, max: 1000}),
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

          const ast = new SQLParser('SELECT COUNT(*) as cnt FROM test').parse();
          const result = await executor.executeSelect(ast, partitionIds);

          mockPartitionData.clear();

          // Reference: COUNT(*) on all rows
          const expected = referenceCount(rows, '*');

          // Property: COUNT(*) should equal total row count
          if (!result.success || result.rows.length !== 1) return false;
          return result.rows[0].cnt === expected;
        },
      ),
      {numRuns: 10},
    );
    t.pass('COUNT(*) is correct across partitions');
  });

  await t.test('SUM is correct across partitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 4}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            amount: fc.integer({min: 0, max: 1000}),
          }),
          {minLength: 1, maxLength: 20},
        ),
        async (partitionCount, rows) => {
          const partitionIds = [];

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

          const ast = new SQLParser('SELECT SUM(amount) as total FROM test').parse();
          const result = await executor.executeSelect(ast, partitionIds);

          mockPartitionData.clear();

          // Reference: SUM on all rows
          const expected = referenceSum(rows, 'amount');

          // Property: SUM should equal sum of all values
          if (!result.success || result.rows.length !== 1) return false;
          return result.rows[0].total === expected;
        },
      ),
      {numRuns: 10},
    );
    t.pass('SUM is correct across partitions');
  });

  await t.test('AVG is correct across partitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 4}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            score: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 1, maxLength: 20},
        ),
        async (partitionCount, rows) => {
          const partitionIds = [];

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

          const ast = new SQLParser('SELECT AVG(score) as avg_score FROM test').parse();
          const result = await executor.executeSelect(ast, partitionIds);

          mockPartitionData.clear();

          // Reference: AVG on all rows
          const expected = referenceAvg(rows, 'score');

          // Property: AVG should be computed correctly (not average of averages)
          if (!result.success || result.rows.length !== 1) return false;

          const actual = result.rows[0].avg_score;

          // Handle null case
          if (expected === null) {
            return actual === null;
          }

          // Allow small floating point tolerance
          return Math.abs(actual - expected) < 0.0001;
        },
      ),
      {numRuns: 10},
    );
    t.pass('AVG is correct across partitions');
  });

  await t.test('MIN is correct across partitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 4}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            value: fc.integer({min: -1000, max: 1000}),
          }),
          {minLength: 1, maxLength: 20},
        ),
        async (partitionCount, rows) => {
          const partitionIds = [];

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

          const ast = new SQLParser('SELECT MIN(value) as min_val FROM test').parse();
          const result = await executor.executeSelect(ast, partitionIds);

          mockPartitionData.clear();

          // Reference: MIN on all rows
          const expected = referenceMin(rows, 'value');

          // Property: MIN should be the global minimum
          if (!result.success || result.rows.length !== 1) return false;
          return result.rows[0].min_val === expected;
        },
      ),
      {numRuns: 10},
    );
    t.pass('MIN is correct across partitions');
  });

  await t.test('MAX is correct across partitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 4}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            value: fc.integer({min: -1000, max: 1000}),
          }),
          {minLength: 1, maxLength: 20},
        ),
        async (partitionCount, rows) => {
          const partitionIds = [];

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

          const ast = new SQLParser('SELECT MAX(value) as max_val FROM test').parse();
          const result = await executor.executeSelect(ast, partitionIds);

          mockPartitionData.clear();

          // Reference: MAX on all rows
          const expected = referenceMax(rows, 'value');

          // Property: MAX should be the global maximum
          if (!result.success || result.rows.length !== 1) return false;
          return result.rows[0].max_val === expected;
        },
      ),
      {numRuns: 10},
    );
    t.pass('MAX is correct across partitions');
  });

  await t.test('multiple aggregates in single query', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 3}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            amount: fc.integer({min: 1, max: 100}),
          }),
          {minLength: 2, maxLength: 15},
        ),
        async (partitionCount, rows) => {
          const partitionIds = [];

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

          const sql = 'SELECT COUNT(*) as cnt, SUM(amount) as total, ' +
                      'AVG(amount) as avg_amt, MIN(amount) as min_amt, ' +
                      'MAX(amount) as max_amt FROM test';
          const ast = new SQLParser(sql).parse();
          const result = await executor.executeSelect(ast, partitionIds);

          mockPartitionData.clear();

          // Reference values
          const expectedCount = referenceCount(rows, '*');
          const expectedSum = referenceSum(rows, 'amount');
          const expectedAvg = referenceAvg(rows, 'amount');
          const expectedMin = referenceMin(rows, 'amount');
          const expectedMax = referenceMax(rows, 'amount');

          if (!result.success || result.rows.length !== 1) return false;

          const row = result.rows[0];

          // Check all aggregates
          if (row.cnt !== expectedCount) return false;
          if (row.total !== expectedSum) return false;
          if (Math.abs(row.avg_amt - expectedAvg) > 0.0001) return false;
          if (row.min_amt !== expectedMin) return false;
          if (row.max_amt !== expectedMax) return false;

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Multiple aggregates in single query work correctly');
  });
});
