/**
 * Property test for SQLite Log Adapter Round-Trip.
 * Property 7: For any valid log entry, writing it to SQLiteLogAdapter and
 * reading it back SHALL produce an equivalent entry with the same index,
 * term, and command.
 *
 * Validates: Requirements 12.2, 12.5
 *
 * Feature: simplified-raft-transport
 * Property 7: SQLite Log Adapter Round-Trip
 */

import {test} from 'tap';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

/**
 * Feature: simplified-raft-transport
 * Property 7: SQLite Log Adapter Round-Trip
 *
 * For any valid log entry, writing it to SQLiteLogAdapter and reading it back
 * SHALL produce an equivalent entry with the same index, term, and command.
 */
test('Property 7: SQLite Log Adapter Round-Trip', async (t) => {
  /**
   * Property: Single entry put/get round-trip.
   *
   * For any valid log entry, put() then get() should return an equivalent entry.
   */
  t.test('put/get round-trip preserves entry', async (t) => {
    const entryArb = fc.record({
      index: fc.integer({min: 1, max: 10000}),
      term: fc.nat({max: 1000}),
      command: fc.record({
        type: fc.constantFrom('CDC', 'MESSAGE', 'ACK', 'SQL', 'DATA'),
        data: fc.string({maxLength: 100}),
        key: fc.string({maxLength: 50}),
      }),
    });

    await fc.assert(
      fc.asyncProperty(
        entryArb,
        async (entry) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          adapter.put(entry);
          const retrieved = adapter.get(entry.index);

          db.close();

          return retrieved !== null &&
                 retrieved.index === entry.index &&
                 retrieved.term === entry.term &&
                 JSON.stringify(retrieved.command) === JSON.stringify(entry.command);
        },
      ),
      {numRuns: 10},
    );

    t.pass('put/get round-trip preserves entry');
  });

  /**
   * Property: Multiple entries put/getRange round-trip.
   *
   * For any array of log entries, put() each then getRange() should return
   * all entries in order.
   */
  t.test('put/getRange round-trip preserves multiple entries', async (t) => {
    const entriesArb = fc.array(
      fc.record({
        term: fc.nat({max: 1000}),
        command: fc.record({
          type: fc.constantFrom('CDC', 'MESSAGE', 'ACK'),
          data: fc.string({maxLength: 50}),
        }),
      }),
      {minLength: 1, maxLength: 10},
    ).map((entries) => entries.map((e, i) => ({...e, index: i + 1})));

    await fc.assert(
      fc.asyncProperty(
        entriesArb,
        async (entries) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          // Put all entries
          for (const entry of entries) {
            adapter.put(entry);
          }

          // Get range
          const retrieved = adapter.getRange(1, entries.length);

          db.close();

          // Check length matches
          if (retrieved.length !== entries.length) return false;

          // Check each entry matches
          for (let i = 0; i < entries.length; i++) {
            if (retrieved[i].index !== entries[i].index) return false;
            if (retrieved[i].term !== entries[i].term) return false;
            if (JSON.stringify(retrieved[i].command) !==
                JSON.stringify(entries[i].command)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('put/getRange round-trip preserves multiple entries');
  });

  /**
   * Property: getLastInfo returns correct info after puts.
   *
   * For any sequence of log entries, getLastInfo() should return the
   * index and term of the last entry.
   */
  t.test('getLastInfo returns correct info after puts', async (t) => {
    const entriesArb = fc.array(
      fc.record({
        term: fc.nat({max: 1000}),
        command: fc.string({maxLength: 50}),
      }),
      {minLength: 1, maxLength: 10},
    ).map((entries) => entries.map((e, i) => ({...e, index: i + 1})));

    await fc.assert(
      fc.asyncProperty(
        entriesArb,
        async (entries) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          // Put all entries
          for (const entry of entries) {
            adapter.put(entry);
          }

          const lastInfo = adapter.getLastInfo();

          db.close();

          const expectedLast = entries[entries.length - 1];
          return lastInfo.index === expectedLast.index &&
                 lastInfo.term === expectedLast.term;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getLastInfo returns correct info after puts');
  });

  /**
   * Property: removeFrom removes entries correctly.
   *
   * For any sequence of entries and a removal index, removeFrom() should
   * remove all entries at or after that index.
   */
  t.test('removeFrom removes entries at and after index', async (t) => {
    const testDataArb = fc.tuple(
      fc.array(
        fc.record({
          term: fc.nat({max: 1000}),
          command: fc.string({maxLength: 50}),
        }),
        {minLength: 2, maxLength: 10},
      ).map((entries) => entries.map((e, i) => ({...e, index: i + 1}))),
      fc.integer({min: 1, max: 10}),
    ).filter(([entries, removeIndex]) => removeIndex <= entries.length);

    await fc.assert(
      fc.asyncProperty(
        testDataArb,
        async ([entries, removeIndex]) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          // Put all entries
          for (const entry of entries) {
            adapter.put(entry);
          }

          // Remove from index
          adapter.removeFrom(removeIndex);

          // Check entries before removeIndex still exist
          for (let i = 1; i < removeIndex; i++) {
            const entry = adapter.get(i);
            if (!entry || entry.index !== i) {
              db.close();
              return false;
            }
          }

          // Check entries at and after removeIndex are gone
          for (let i = removeIndex; i <= entries.length; i++) {
            const entry = adapter.get(i);
            if (entry !== null) {
              db.close();
              return false;
            }
          }

          db.close();
          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('removeFrom removes entries at and after index');
  });

  /**
   * Property: get returns null for non-existent index.
   */
  t.test('get returns null for non-existent index', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 10000}),
        async (index) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          const result = adapter.get(index);

          db.close();
          return result === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('get returns null for non-existent index');
  });

  /**
   * Property: getLastInfo returns default for empty log.
   */
  t.test('getLastInfo returns default for empty log', async (t) => {
    const db = new Database(':memory:');
    const adapter = new SQLiteLogAdapter(db);

    const lastInfo = adapter.getLastInfo();

    db.close();

    t.equal(lastInfo.index, 0, 'index is 0 for empty log');
    t.equal(lastInfo.term, 0, 'term is 0 for empty log');
  });

  /**
   * Property: getRange returns empty array for non-existent range.
   */
  t.test('getRange returns empty array for non-existent range', async (t) => {
    const db = new Database(':memory:');
    const adapter = new SQLiteLogAdapter(db);

    const result = adapter.getRange(1, 10);

    db.close();

    t.same(result, [], 'getRange returns empty array for non-existent range');
  });
});
