/**
 * Property 53: Aggregate Function Correctness
 * Validates: Requirements 22.7
 *
 * For any cross-partition query with aggregate functions (COUNT, SUM, AVG, MIN, MAX),
 * the system should produce results equivalent to executing the query on a
 * single-partition table.
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
 * Create a mock partition with specific data.
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
 * Reference implementation for COUNT.
 * @param {Array} rows - Input rows.
 * @param {string} column - Column name or '*'.
 * @return {number} Count.
 */
function referenceCount(rows, column) {
  if (column === '*') {
    return rows.length;
  }
  return rows.filter((r) => r[column] !== null && r[column] !== undefined).length;
}

/**
 * Reference implementation for SUM.
 * @param {Array} rows - Input rows.
 * @param {string} column - Column name.
 * @return {number} Sum.
 */
function referenceSum(rows, column) {
  return rows.reduce((sum, r) => sum + (Number(r[column]) || 0), 0);
}

/**
 * Reference implementation for AVG.
 * @param {Array} rows - Input rows.
 * @param {string} column - Column name.
 * @return {number|null} Average.
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
 * @param {Array} rows - Input rows.
 * @param {string} column - Column name.
 * @return {*} Minimum value.
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
 * @param {Array} rows - Input rows.
 * @param {string} column - Column name.
 * @return {*} Maximum value.
 */
function referenceMax(rows, column) {
  const values = rows
    .map((r) => r[column])
    .filter((v) => v !== null && v !== undefined);
  if (values.length === 0) return null;
  return values.reduce((max, v) => v > max ? v : max, values[0]);
}

/**
 * Property 53: Aggregate Function Correctness
 * For any cross-partition query with aggregate functions (COUNT, SUM, AVG, MIN, MAX),
 * the system should produce results equivalent to executing the query on a
 * single-partition table.
 * **Validates: Requirements 22.7**
 */
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
          const partitions = new Map();

          // Distribute rows across partitions
          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            partitions.set(`p${i}`, createMockPartition(partitionRows));
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT COUNT(*) as cnt FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

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
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            partitions.set(`p${i}`, createMockPartition(partitionRows));
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT SUM(amount) as total FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

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
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            partitions.set(`p${i}`, createMockPartition(partitionRows));
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT AVG(score) as avg_score FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

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
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            partitions.set(`p${i}`, createMockPartition(partitionRows));
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT MIN(value) as min_val FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

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
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            partitions.set(`p${i}`, createMockPartition(partitionRows));
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT MAX(value) as max_val FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

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
          const partitions = new Map();

          for (let i = 0; i < partitionCount; i++) {
            const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
            partitions.set(`p${i}`, createMockPartition(partitionRows));
          }

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const sql = 'SELECT COUNT(*) as cnt, SUM(amount) as total, ' +
                      'AVG(amount) as avg_amt, MIN(amount) as min_amt, ' +
                      'MAX(amount) as max_amt FROM test';
          const ast = new SQLParser(sql).parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

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
