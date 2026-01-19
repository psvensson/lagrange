import {test} from 'tap';
import fc from 'fast-check';
import {ResultsPanel, RESULT_TYPE} from '../../../src/cli/sql/results-panel.js';

/**
 * Property 15: Query Result Completeness
 * Validates: Requirements 7.9, 7.10, 7.12
 *
 * For any successful query execution, the result display SHALL include:
 * - Row count (for SELECT)
 * - Affected rows (for write operations)
 * - Execution time
 * - Partition information
 */

test('Property 15: Query Result Completeness', async (t) => {
  // Arbitrary for generating row data
  const rowArb = fc.record({
    id: fc.integer({min: 1, max: 10000}),
    name: fc.string({minLength: 1, maxLength: 20}),
    value: fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null)),
  });

  // Arbitrary for partition names
  const partitionArb = fc.string({minLength: 1, maxLength: 20})
    .filter((s) => s.trim().length > 0);

  // Arbitrary for execution time
  const execTimeArb = fc.integer({min: 0, max: 10000});

  t.test('SELECT results include row count', async (t) => {
    fc.assert(
      fc.property(
        fc.array(rowArb, {minLength: 0, maxLength: 20}),
        execTimeArb,
        (rows, execTime) => {
          const panel = new ResultsPanel();

          panel.displaySelectResult({rows}, execTime);

          // Row count should be set
          return panel.rowCount === rows.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('SELECT results include row count');
  });

  t.test('SELECT results include execution time', async (t) => {
    fc.assert(
      fc.property(
        fc.array(rowArb, {minLength: 0, maxLength: 10}),
        execTimeArb,
        (rows, execTime) => {
          const panel = new ResultsPanel();

          panel.displaySelectResult({rows}, execTime);

          return panel.executionTime === execTime;
        },
      ),
      {numRuns: 10},
    );
    t.pass('SELECT results include execution time');
  });

  t.test('SELECT results include partition information', async (t) => {
    fc.assert(
      fc.property(
        fc.array(rowArb, {minLength: 1, maxLength: 10}),
        fc.array(partitionArb, {minLength: 1, maxLength: 5}),
        execTimeArb,
        (rows, partitions, execTime) => {
          const panel = new ResultsPanel();

          panel.displaySelectResult({rows, partitions}, execTime);

          // Partitions should be stored
          return JSON.stringify(panel.partitions) ===
                     JSON.stringify(partitions);
        },
      ),
      {numRuns: 10},
    );
    t.pass('SELECT results include partition information');
  });

  t.test('INSERT results include affected rows', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 1000}),
        execTimeArb,
        (affectedRows, execTime) => {
          const panel = new ResultsPanel();

          panel.displayWriteResult({
            operation: 'INSERT',
            affectedRows,
          }, execTime);

          return panel.affectedRows === affectedRows &&
                     panel.resultType === RESULT_TYPE.INSERT;
        },
      ),
      {numRuns: 10},
    );
    t.pass('INSERT results include affected rows');
  });

  t.test('UPDATE results include affected rows', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 1000}),
        execTimeArb,
        (affectedRows, execTime) => {
          const panel = new ResultsPanel();

          panel.displayWriteResult({
            operation: 'UPDATE',
            affectedRows,
          }, execTime);

          return panel.affectedRows === affectedRows &&
                     panel.resultType === RESULT_TYPE.UPDATE;
        },
      ),
      {numRuns: 10},
    );
    t.pass('UPDATE results include affected rows');
  });

  t.test('DELETE results include affected rows', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 1000}),
        execTimeArb,
        (affectedRows, execTime) => {
          const panel = new ResultsPanel();

          panel.displayWriteResult({
            operation: 'DELETE',
            affectedRows,
          }, execTime);

          return panel.affectedRows === affectedRows &&
                     panel.resultType === RESULT_TYPE.DELETE;
        },
      ),
      {numRuns: 10},
    );
    t.pass('DELETE results include affected rows');
  });

  t.test('write results include execution time', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('INSERT', 'UPDATE', 'DELETE'),
        fc.integer({min: 0, max: 100}),
        execTimeArb,
        (operation, affectedRows, execTime) => {
          const panel = new ResultsPanel();

          panel.displayWriteResult({operation, affectedRows}, execTime);

          return panel.executionTime === execTime;
        },
      ),
      {numRuns: 10},
    );
    t.pass('write results include execution time');
  });

  t.test('write results include partition information', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('INSERT', 'UPDATE', 'DELETE'),
        fc.integer({min: 0, max: 100}),
        fc.array(partitionArb, {minLength: 1, maxLength: 5}),
        execTimeArb,
        (operation, affectedRows, partitions, execTime) => {
          const panel = new ResultsPanel();

          panel.displayWriteResult({
            operation,
            affectedRows,
            partitions,
          }, execTime);

          return JSON.stringify(panel.partitions) ===
                     JSON.stringify(partitions);
        },
      ),
      {numRuns: 10},
    );
    t.pass('write results include partition information');
  });

  t.test('status line includes row count for SELECT', async (t) => {
    fc.assert(
      fc.property(
        fc.array(rowArb, {minLength: 0, maxLength: 20}),
        execTimeArb,
        (rows, execTime) => {
          const panel = new ResultsPanel();

          panel.displaySelectResult({rows}, execTime);

          const statusLine = panel.getStatusLine();
          const rowCount = rows.length;

          // Status line should contain row count
          return statusLine.includes(`${rowCount} row`);
        },
      ),
      {numRuns: 10},
    );
    t.pass('status line includes row count for SELECT');
  });

  t.test('status line includes execution time', async (t) => {
    fc.assert(
      fc.property(
        fc.array(rowArb, {minLength: 1, maxLength: 10}),
        execTimeArb,
        (rows, execTime) => {
          const panel = new ResultsPanel();

          panel.displaySelectResult({rows}, execTime);

          const statusLine = panel.getStatusLine();

          return statusLine.includes(`${execTime}ms`);
        },
      ),
      {numRuns: 10},
    );
    t.pass('status line includes execution time');
  });

  t.test('status line includes partition info when present', async (t) => {
    fc.assert(
      fc.property(
        fc.array(rowArb, {minLength: 1, maxLength: 5}),
        fc.array(partitionArb, {minLength: 1, maxLength: 3}),
        execTimeArb,
        (rows, partitions, execTime) => {
          const panel = new ResultsPanel();

          panel.displaySelectResult({rows, partitions}, execTime);

          const statusLine = panel.getStatusLine();

          // Status line should mention partitions
          return statusLine.includes('Partitions:');
        },
      ),
      {numRuns: 10},
    );
    t.pass('status line includes partition info when present');
  });

  t.test('status line includes affected rows for write ops', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('INSERT', 'UPDATE', 'DELETE'),
        fc.integer({min: 0, max: 100}),
        execTimeArb,
        (operation, affectedRows, execTime) => {
          const panel = new ResultsPanel();

          panel.displayWriteResult({operation, affectedRows}, execTime);

          const statusLine = panel.getStatusLine();

          // Status line should contain affected rows
          return statusLine.includes(`${affectedRows} row`) &&
                     statusLine.includes('affected');
        },
      ),
      {numRuns: 10},
    );
    t.pass('status line includes affected rows for write ops');
  });
});
