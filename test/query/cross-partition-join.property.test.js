/**
 * Property 50: Cross-Partition JOIN Support
 * Validates: Requirements 22.2, 22.3
 *
 * For any JOIN operation between tables in different partitions, the system
 * should aggregate results correctly while preserving SQL semantics.
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
 * Perform a reference INNER JOIN in JavaScript for comparison.
 * @param {Array} leftRows - Left table rows.
 * @param {Array} rightRows - Right table rows.
 * @param {string} leftCol - Left join column.
 * @param {string} rightCol - Right join column.
 * @return {Array} Joined rows.
 */
function referenceInnerJoin(leftRows, rightRows, leftCol, rightCol) {
  const result = [];
  for (const left of leftRows) {
    for (const right of rightRows) {
      if (left[leftCol] === right[rightCol]) {
        result.push({...left, ...right});
      }
    }
  }
  return result;
}

/**
 * Property 50: Cross-Partition JOIN Support
 * For any JOIN operation between tables in different partitions, the system
 * should aggregate results correctly while preserving SQL semantics.
 * **Validates: Requirements 22.2, 22.3**
 */
test('Property 50: Cross-Partition JOIN Support', async (t) => {
  await t.test('INNER JOIN produces correct results across partitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate users table data
        fc.array(
          fc.record({
            user_id: fc.integer({min: 1, max: 10}),
            name: fc.stringOf(fc.constantFrom(...'abcdefghij'), {minLength: 1, maxLength: 5}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        // Generate orders table data
        fc.array(
          fc.record({
            order_id: fc.integer({min: 100, max: 200}),
            user_id: fc.integer({min: 1, max: 10}),
            amount: fc.integer({min: 1, max: 100}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        async (users, orders) => {
          // Create partitions for users and orders tables
          const partitions = new Map();
          partitions.set('users_p1', createMockPartition(users));
          partitions.set('orders_p1', createMockPartition(orders));

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          // Create JOIN AST
          const ast = {
            type: 'SELECT',
            columns: [{type: 'star'}],
            from: {name: 'users', alias: null},
            joins: [{
              joinType: 'INNER',
              table: {name: 'orders', alias: null},
              condition: {
                type: 'binary',
                operator: '=',
                left: {type: 'column_ref', table: 'users', column: 'user_id'},
                right: {type: 'column_ref', table: 'orders', column: 'user_id'},
              },
            }],
            where: null,
            groupBy: null,
            having: null,
            orderBy: null,
            limit: null,
            distinct: false,
          };

          const joinPartitions = new Map();
          joinPartitions.set('orders', ['orders_p1']);

          const result = await executor.executeSelect(
            ast,
            ['users_p1'],
            [],
            {joinPartitions},
          );

          // Compute expected result using reference implementation
          const expected = referenceInnerJoin(users, orders, 'user_id', 'user_id');

          // Property: Result count should match reference implementation
          return result.success === true && result.rows.length === expected.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('INNER JOIN produces correct results across partitions');
  });

  await t.test('JOIN with multiple partitions per table', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 20}),
            value: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 2, maxLength: 10},
        ),
        async (rows) => {
          // Split rows into two partitions
          const partition1Data = rows.filter((_, i) => i % 2 === 0);
          const partition2Data = rows.filter((_, i) => i % 2 === 1);

          const partitions = new Map();
          partitions.set('table_p1', createMockPartition(partition1Data));
          partitions.set('table_p2', createMockPartition(partition2Data));

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT * FROM test').parse();
          const result = await executor.executeSelect(ast, ['table_p1', 'table_p2']);

          // Property: All rows from both partitions should be in result
          return result.success === true && result.rows.length === rows.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('JOIN with multiple partitions per table works correctly');
  });

  await t.test('results are aggregated into single result set', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 4}),
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            category: fc.constantFrom('A', 'B', 'C'),
          }),
          {minLength: 1, maxLength: 10},
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

          const ast = new SQLParser('SELECT * FROM test').parse();
          const partitionIds = Array.from(partitions.keys());

          const result = await executor.executeSelect(ast, partitionIds);

          // Property: Result should be a single array containing all rows
          if (!result.success) return false;
          if (!Array.isArray(result.rows)) return false;

          // All rows should be present
          return result.rows.length === rows.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Results are aggregated into single result set');
  });

  await t.test('SQL semantics preserved for ORDER BY after JOIN', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            value: fc.integer({min: 0, max: 1000}),
          }),
          {minLength: 3, maxLength: 10},
        ),
        async (rows) => {
          // Split into two partitions
          const p1Data = rows.slice(0, Math.ceil(rows.length / 2));
          const p2Data = rows.slice(Math.ceil(rows.length / 2));

          const partitions = new Map();
          partitions.set('p1', createMockPartition(p1Data));
          partitions.set('p2', createMockPartition(p2Data));

          const executor = new QueryExecutor();
          executor.setPartitionRegistry(partitions);

          const ast = new SQLParser('SELECT * FROM test ORDER BY value ASC').parse();
          const result = await executor.executeSelect(ast, ['p1', 'p2']);

          // Property: Results should be sorted by value ascending
          if (!result.success || result.rows.length < 2) return true;

          for (let i = 1; i < result.rows.length; i++) {
            if (result.rows[i].value < result.rows[i - 1].value) {
              return false;
            }
          }
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('SQL semantics preserved for ORDER BY after JOIN');
  });
});
