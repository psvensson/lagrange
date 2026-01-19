import {test} from 'tap';
import fc from 'fast-check';
import {SQLQueryView} from '../../../src/cli/sql/sql-query-view.js';

/**
 * Property 20: Read-Only Mode Enforcement
 * Validates: Requirements 10.3, 10.4
 *
 * For any SQL statement in read-only mode, if the statement is not
 * a SELECT query, the execution SHALL be rejected with an error message.
 */

test('Property 20: Read-Only Mode Enforcement', async (t) => {
  // Arbitrary for table names
  const tableNameArb = fc.string({minLength: 1, maxLength: 20})
    .filter((s) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s));

  // Arbitrary for column names
  const columnNameArb = fc.string({minLength: 1, maxLength: 15})
    .filter((s) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s));

  // Arbitrary for values
  const valueArb = fc.oneof(
    fc.integer().map((n) => String(n)),
    fc.string({minLength: 1, maxLength: 20})
      .filter((s) => !s.includes('\''))
      .map((s) => `'${s}'`),
  );

  // Generate SELECT queries
  const selectQueryArb = fc.tuple(tableNameArb, columnNameArb).map(
    ([table, col]) => `SELECT ${col} FROM ${table}`,
  );

  // Generate INSERT queries (not dangerous, so no confirmation needed)
  const insertQueryArb = fc.tuple(tableNameArb, columnNameArb, valueArb).map(
    ([table, col, val]) => `INSERT INTO ${table} (${col}) VALUES (${val})`,
  );

  // Generate UPDATE queries WITH WHERE (not dangerous)
  const updateQueryArb = fc.tuple(tableNameArb, columnNameArb, valueArb).map(
    ([table, col, val]) => `UPDATE ${table} SET ${col} = ${val} WHERE id = 1`,
  );

  // Generate DELETE queries WITH WHERE (not dangerous)
  const deleteQueryArb = tableNameArb.map(
    (table) => `DELETE FROM ${table} WHERE id = 1`,
  );

  t.test('SELECT queries are allowed in read-only mode', async (t) => {
    fc.assert(
      fc.property(
        selectQueryArb,
        (sql) => {
          const view = new SQLQueryView({readOnlyMode: true});
          view.initialize();

          // isSelectQuery should return true
          return view.isSelectQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('SELECT queries are allowed in read-only mode');
  });

  t.test('INSERT queries are rejected in read-only mode', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        insertQueryArb,
        async (sql) => {
          const view = new SQLQueryView({readOnlyMode: true});
          view.initialize();
          view.setQuery(sql);

          const result = await view.executeQuery();

          // Should be rejected
          return result === false &&
                     view.resultsPanel.resultType === 'error' &&
                     view.resultsPanel.error.message.includes('Read-only');
        },
      ),
      {numRuns: 10},
    );
    t.pass('INSERT queries are rejected in read-only mode');
  });

  t.test('UPDATE queries with WHERE are rejected in read-only mode', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        updateQueryArb,
        async (sql) => {
          const view = new SQLQueryView({readOnlyMode: true});
          view.initialize();
          view.setQuery(sql);

          const result = await view.executeQuery();

          return result === false &&
                     view.resultsPanel.resultType === 'error' &&
                     view.resultsPanel.error.message.includes('Read-only');
        },
      ),
      {numRuns: 10},
    );
    t.pass('UPDATE queries with WHERE are rejected in read-only mode');
  });

  t.test('DELETE queries with WHERE are rejected in read-only mode', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        deleteQueryArb,
        async (sql) => {
          const view = new SQLQueryView({readOnlyMode: true});
          view.initialize();
          view.setQuery(sql);

          const result = await view.executeQuery();

          return result === false &&
                     view.resultsPanel.resultType === 'error' &&
                     view.resultsPanel.error.message.includes('Read-only');
        },
      ),
      {numRuns: 10},
    );
    t.pass('DELETE queries with WHERE are rejected in read-only mode');
  });

  t.test('write queries allowed when read-only mode disabled', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        insertQueryArb,
        async (sql) => {
          const view = new SQLQueryView({readOnlyMode: false});
          view.initialize();
          view.setQuery(sql);

          const result = await view.executeQuery();

          // Should not be rejected due to read-only
          // (will succeed because INSERT is not dangerous)
          return result === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('write queries allowed when read-only mode disabled');
  });

  t.test('read-only error includes clear message', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        insertQueryArb,
        async (sql) => {
          const view = new SQLQueryView({readOnlyMode: true});
          view.initialize();
          view.setQuery(sql);

          await view.executeQuery();

          // Error message should be clear about read-only restriction
          const msg = view.resultsPanel.error?.message || '';
          return msg.includes('Read-only') &&
                     msg.includes('SELECT');
        },
      ),
      {numRuns: 10},
    );
    t.pass('read-only error includes clear message');
  });

  t.test('toggling read-only mode affects enforcement', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        insertQueryArb,
        async (sql) => {
          const view = new SQLQueryView({readOnlyMode: false});
          view.initialize();

          // Enable read-only mode
          view.setReadOnly(true);
          view.setQuery(sql);

          const result1 = await view.executeQuery();
          const rejected1 = result1 === false;

          // Disable read-only mode
          view.setReadOnly(false);
          view.resultsPanel.clear();
          view.setQuery(sql);

          const result2 = await view.executeQuery();

          // First should be rejected, second should succeed
          return rejected1 && result2 === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('toggling read-only mode affects enforcement');
  });

  t.test('case insensitive SELECT detection', async (t) => {
    const caseVariants = [
      'SELECT', 'select', 'Select', 'sElEcT', 'SELECT', 'select',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...caseVariants),
        tableNameArb,
        (selectKeyword, table) => {
          const view = new SQLQueryView({readOnlyMode: true});
          const sql = `${selectKeyword} * FROM ${table}`;

          return view.isSelectQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('case insensitive SELECT detection');
  });

  t.test('whitespace before SELECT is handled', async (t) => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n'), {maxLength: 5}),
        tableNameArb,
        (whitespace, table) => {
          const view = new SQLQueryView({readOnlyMode: true});
          const sql = `${whitespace}SELECT * FROM ${table}`;

          return view.isSelectQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('whitespace before SELECT is handled');
  });
});
