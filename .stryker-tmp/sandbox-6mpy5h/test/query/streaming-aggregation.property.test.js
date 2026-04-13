/**
 * Property 75: Streaming Aggregation
 * Validates: Requirements 26.9
 *
 * The system should implement streaming aggregation to reduce memory footprint
 * for large result sets, including external merge sort for ordered results.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {StreamingAggregator} from '../../src/query/streaming-aggregator.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration
const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

/**
 * Property 75: Streaming Aggregation
 * The system should implement streaming aggregation to reduce memory footprint
 * for large result sets, including external merge sort for ordered results.
 * **Validates: Requirements 26.9**
 */
test('Property 75: Streaming Aggregation', async (t) => {
  await t.test('processes rows in chunks', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            value: fc.integer({min: 0, max: 50}),
          }),
          {minLength: 5, maxLength: 20},
        ),
        fc.integer({min: 2, max: 5}), // Chunk size
        async (rows, chunkSize) => {
          const aggregator = new StreamingAggregator({chunkSize});

          aggregator.addRows(rows);
          const allRows = aggregator.getAllRows();

          // Property: All rows should be preserved
          return allRows.length === rows.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Processes rows in chunks');
  });

  await t.test('external merge sort produces correct order', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            name: fc.string({minLength: 1, maxLength: 5}),
          }),
          {minLength: 5, maxLength: 15},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 3});

          aggregator.addRows(rows);

          const orderBy = [{column: 'id', direction: 'ASC'}];
          const sorted = aggregator.applySortedMerge(orderBy);

          // Property: Result should be sorted by id ascending
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].id < sorted[i - 1].id) {
              return false;
            }
          }
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('External merge sort produces correct order');
  });

  await t.test('merge sort handles descending order', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            value: fc.integer({min: 0, max: 50}),
          }),
          {minLength: 5, maxLength: 15},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 3});

          aggregator.addRows(rows);

          const orderBy = [{column: 'value', direction: 'DESC'}];
          const sorted = aggregator.applySortedMerge(orderBy);

          // Property: Result should be sorted by value descending
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].value > sorted[i - 1].value) {
              return false;
            }
          }
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Merge sort handles descending order');
  });

  await t.test('streaming COUNT aggregate is correct', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
          }),
          {minLength: 1, maxLength: 20},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 5});

          aggregator.addRows(rows);

          const ast = {
            columns: [{
              expression: {type: 'aggregate', function: 'COUNT', argument: {type: 'star'}},
              alias: 'count',
            }],
          };

          const result = aggregator.computeStreamingAggregates(ast);

          // Property: COUNT should equal number of rows
          return result.rows[0].count === rows.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Streaming COUNT aggregate is correct');
  });

  await t.test('streaming SUM aggregate is correct', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            amount: fc.integer({min: 1, max: 100}),
          }),
          {minLength: 1, maxLength: 15},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 3});

          aggregator.addRows(rows);

          const ast = {
            columns: [{
              expression: {
                type: 'aggregate',
                function: 'SUM',
                argument: {type: 'column_ref', column: 'amount'},
              },
              alias: 'total',
            }],
          };

          const result = aggregator.computeStreamingAggregates(ast);
          const expectedSum = rows.reduce((sum, r) => sum + r.amount, 0);

          // Property: SUM should equal sum of all amounts
          return result.rows[0].total === expectedSum;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Streaming SUM aggregate is correct');
  });

  await t.test('streaming AVG aggregate is correct', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            score: fc.integer({min: 1, max: 100}),
          }),
          {minLength: 1, maxLength: 15},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 3});

          aggregator.addRows(rows);

          const ast = {
            columns: [{
              expression: {
                type: 'aggregate',
                function: 'AVG',
                argument: {type: 'column_ref', column: 'score'},
              },
              alias: 'avg_score',
            }],
          };

          const result = aggregator.computeStreamingAggregates(ast);
          const expectedAvg = rows.reduce((sum, r) => sum + r.score, 0) / rows.length;

          // Property: AVG should equal average of all scores
          return Math.abs(result.rows[0].avg_score - expectedAvg) < 0.001;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Streaming AVG aggregate is correct');
  });

  await t.test('streaming MIN/MAX aggregates are correct', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            value: fc.integer({min: 1, max: 100}),
          }),
          {minLength: 1, maxLength: 15},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 3});

          aggregator.addRows(rows);

          const ast = {
            columns: [
              {
                expression: {
                  type: 'aggregate',
                  function: 'MIN',
                  argument: {type: 'column_ref', column: 'value'},
                },
                alias: 'min_val',
              },
              {
                expression: {
                  type: 'aggregate',
                  function: 'MAX',
                  argument: {type: 'column_ref', column: 'value'},
                },
                alias: 'max_val',
              },
            ],
          };

          const result = aggregator.computeStreamingAggregates(ast);
          const expectedMin = Math.min(...rows.map((r) => r.value));
          const expectedMax = Math.max(...rows.map((r) => r.value));

          // Property: MIN and MAX should be correct
          return (
            result.rows[0].min_val === expectedMin &&
            result.rows[0].max_val === expectedMax
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Streaming MIN/MAX aggregates are correct');
  });

  await t.test('streaming GROUP BY produces correct groups', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            category: fc.constantFrom('A', 'B', 'C'),
            amount: fc.integer({min: 1, max: 50}),
          }),
          {minLength: 3, maxLength: 15},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 3});

          aggregator.addRows(rows);

          const ast = {
            columns: [
              {expression: {type: 'column_ref', column: 'category'}},
              {
                expression: {
                  type: 'aggregate',
                  function: 'SUM',
                  argument: {type: 'column_ref', column: 'amount'},
                },
                alias: 'total',
              },
            ],
            groupBy: [{column: 'category'}],
          };

          const result = aggregator.computeStreamingGroupBy(ast);

          // Calculate expected groups
          const expected = new Map();
          for (const row of rows) {
            const current = expected.get(row.category) || 0;
            expected.set(row.category, current + row.amount);
          }

          // Property: Each group should have correct sum
          for (const resultRow of result.rows) {
            const expectedTotal = expected.get(resultRow.category);
            if (resultRow.total !== expectedTotal) {
              return false;
            }
          }

          return result.rows.length === expected.size;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Streaming GROUP BY produces correct groups');
  });

  await t.test('tracks memory usage correctly', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({min: 1, max: 100}),
            data: fc.string({minLength: 5, maxLength: 20}),
          }),
          {minLength: 5, maxLength: 15},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 3});

          aggregator.addRows(rows);

          const stats = aggregator.getStats();

          // Property: Stats should track rows and bytes
          return (
            stats.totalRows === rows.length &&
            stats.estimatedBytes > 0 &&
            stats.chunkCount > 0
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Tracks memory usage correctly');
  });

  await t.test('reset clears all state', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({id: fc.integer({min: 1, max: 100})}),
          {minLength: 5, maxLength: 10},
        ),
        async (rows) => {
          const aggregator = new StreamingAggregator({chunkSize: 3});

          aggregator.addRows(rows);
          aggregator.reset();

          const stats = aggregator.getStats();

          // Property: After reset, all state should be cleared
          return (
            stats.totalRows === 0 &&
            stats.estimatedBytes === 0
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Reset clears all state');
  });
});
