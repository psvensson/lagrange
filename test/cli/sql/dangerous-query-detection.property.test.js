import {test} from 'tap';
import fc from 'fast-check';
import {SQLQueryView} from '../../../src/cli/sql/sql-query-view.js';

/**
 * Property 21: Dangerous Query Detection
 * Validates: Requirements 10.1
 *
 * For any DELETE statement without a WHERE clause, or UPDATE statement
 * without a WHERE clause, the query SHALL be classified as dangerous
 * and require confirmation.
 */

test('Property 21: Dangerous Query Detection', async (t) => {
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
      .filter((s) => !s.includes('\'') && !s.includes('"'))
      .map((s) => `'${s}'`),
  );

  // Generate DELETE without WHERE (dangerous)
  const dangerousDeleteArb = tableNameArb.map(
    (table) => `DELETE FROM ${table}`,
  );

  // Generate DELETE with WHERE (safe)
  const safeDeleteArb = fc.tuple(tableNameArb, columnNameArb, valueArb).map(
    ([table, col, val]) => `DELETE FROM ${table} WHERE ${col} = ${val}`,
  );

  // Generate UPDATE without WHERE (dangerous)
  const dangerousUpdateArb = fc.tuple(tableNameArb, columnNameArb, valueArb).map(
    ([table, col, val]) => `UPDATE ${table} SET ${col} = ${val}`,
  );

  // Generate UPDATE with WHERE (safe)
  const safeUpdateArb = fc.tuple(
    tableNameArb,
    columnNameArb,
    valueArb,
    columnNameArb,
    valueArb,
  ).map(
    ([table, setCol, setVal, whereCol, whereVal]) =>
      `UPDATE ${table} SET ${setCol} = ${setVal} WHERE ${whereCol} = ${whereVal}`,
  );

  // Generate INSERT (never dangerous)
  const insertArb = fc.tuple(tableNameArb, columnNameArb, valueArb).map(
    ([table, col, val]) => `INSERT INTO ${table} (${col}) VALUES (${val})`,
  );

  // Generate SELECT (never dangerous)
  const selectArb = fc.tuple(tableNameArb, columnNameArb).map(
    ([table, col]) => `SELECT ${col} FROM ${table}`,
  );

  t.test('DELETE without WHERE is detected as dangerous', async (t) => {
    fc.assert(
      fc.property(
        dangerousDeleteArb,
        (sql) => {
          const view = new SQLQueryView();
          return view.isDangerousQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('DELETE without WHERE is detected as dangerous');
  });

  t.test('DELETE with WHERE is not dangerous', async (t) => {
    fc.assert(
      fc.property(
        safeDeleteArb,
        (sql) => {
          const view = new SQLQueryView();
          return view.isDangerousQuery(sql) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('DELETE with WHERE is not dangerous');
  });

  t.test('UPDATE without WHERE is detected as dangerous', async (t) => {
    fc.assert(
      fc.property(
        dangerousUpdateArb,
        (sql) => {
          const view = new SQLQueryView();
          return view.isDangerousQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('UPDATE without WHERE is detected as dangerous');
  });

  t.test('UPDATE with WHERE is not dangerous', async (t) => {
    fc.assert(
      fc.property(
        safeUpdateArb,
        (sql) => {
          const view = new SQLQueryView();
          return view.isDangerousQuery(sql) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('UPDATE with WHERE is not dangerous');
  });

  t.test('INSERT is never dangerous', async (t) => {
    fc.assert(
      fc.property(
        insertArb,
        (sql) => {
          const view = new SQLQueryView();
          return view.isDangerousQuery(sql) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('INSERT is never dangerous');
  });

  t.test('SELECT is never dangerous', async (t) => {
    fc.assert(
      fc.property(
        selectArb,
        (sql) => {
          const view = new SQLQueryView();
          return view.isDangerousQuery(sql) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('SELECT is never dangerous');
  });

  t.test('DELETE detection is case insensitive', async (t) => {
    const caseVariants = ['DELETE', 'delete', 'Delete', 'dElEtE'];

    fc.assert(
      fc.property(
        fc.constantFrom(...caseVariants),
        tableNameArb,
        (deleteKeyword, table) => {
          const view = new SQLQueryView();
          const sql = `${deleteKeyword} FROM ${table}`;
          return view.isDangerousQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('DELETE detection is case insensitive');
  });

  t.test('UPDATE detection is case insensitive', async (t) => {
    const caseVariants = ['UPDATE', 'update', 'Update', 'uPdAtE'];

    fc.assert(
      fc.property(
        fc.constantFrom(...caseVariants),
        tableNameArb,
        columnNameArb,
        valueArb,
        (updateKeyword, table, col, val) => {
          const view = new SQLQueryView();
          const sql = `${updateKeyword} ${table} SET ${col} = ${val}`;
          return view.isDangerousQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('UPDATE detection is case insensitive');
  });

  t.test('WHERE detection is case insensitive', async (t) => {
    const whereVariants = ['WHERE', 'where', 'Where', 'wHeRe'];

    fc.assert(
      fc.property(
        fc.constantFrom(...whereVariants),
        tableNameArb,
        columnNameArb,
        valueArb,
        (whereKeyword, table, col, val) => {
          const view = new SQLQueryView();
          const sql = `UPDATE ${table} SET x = 1 ${whereKeyword} ${col} = ${val}`;
          return view.isDangerousQuery(sql) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('WHERE detection is case insensitive');
  });

  t.test('DELETE with trailing semicolon is still dangerous', async (t) => {
    fc.assert(
      fc.property(
        tableNameArb,
        (table) => {
          const view = new SQLQueryView();
          const sql = `DELETE FROM ${table};`;
          return view.isDangerousQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('DELETE with trailing semicolon is still dangerous');
  });

  t.test('whitespace variations are handled', async (t) => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t'), {minLength: 0, maxLength: 3}),
        tableNameArb,
        (ws, table) => {
          const view = new SQLQueryView();
          const sql = `${ws}DELETE FROM ${table}${ws}`;
          return view.isDangerousQuery(sql) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('whitespace variations are handled');
  });
});
