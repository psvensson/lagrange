/**
 * Property test for SQLite Storage Round-Trip and Restart Recovery.
 * Property 2: For any Raft state (currentTerm, votedFor, log entries) stored in
 * the SQLiteLogAdapter, retrieving that state (including after simulated restart)
 * should return the same values that were stored.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.6
 *
 * Feature: raft-library-integration
 * Property 2: SQLite Storage Round-Trip and Restart Recovery
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import fs from 'fs';
import Database from 'better-sqlite3';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

/**
 * Helper to promisify callback-based methods.
 */
function promisify(adapter, method, ...args) {
  return new Promise((resolve, reject) => {
    adapter[method](...args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Feature: raft-library-integration
 * Property 2: SQLite Storage Round-Trip and Restart Recovery
 *
 * For any Raft state (currentTerm, votedFor, log entries) stored in the
 * SQLiteLogAdapter, retrieving that state (including after simulated restart)
 * should return the same values that were stored.
 */
test('Property 2: SQLite Storage Round-Trip and Restart Recovery', async (t) => {
  /**
   * Property: currentTerm round-trip.
   *
   * For any non-negative integer term, storing and retrieving it should
   * return the same value.
   */
  t.test('currentTerm round-trip preserves value', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({max: 1000000}),
        async (term) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          await promisify(adapter, 'setTerm', term);
          const retrieved = await promisify(adapter, 'getTerm');

          db.close();
          return retrieved === term;
        },
      ),
      {numRuns: 10},
    );

    t.pass('currentTerm round-trip preserves value');
  });

  /**
   * Property: votedFor round-trip.
   *
   * For any candidate ID (string or null), storing and retrieving it should
   * return the same value.
   */
  t.test('votedFor round-trip preserves value', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(null),
          fc.string({minLength: 1, maxLength: 50}),
        ),
        async (candidateId) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          await promisify(adapter, 'setVotedFor', candidateId);
          const retrieved = await promisify(adapter, 'getVotedFor');

          db.close();
          return retrieved === candidateId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('votedFor round-trip preserves value');
  });

  /**
   * Property: log entries round-trip.
   *
   * For any array of log entries, appending and retrieving them should
   * return the same entries in the same order.
   */
  t.test('log entries round-trip preserves entries', async (t) => {
    // Generate log entry with sequential indices
    const logEntriesArb = fc.array(
      fc.record({
        term: fc.nat({max: 1000}),
        command: fc.record({
          type: fc.constantFrom('CDC', 'MESSAGE', 'ACK', 'SQL'),
          data: fc.string({maxLength: 100}),
        }),
      }),
      {minLength: 0, maxLength: 10},
    ).map((entries) => entries.map((e, i) => ({...e, index: i + 1})));

    await fc.assert(
      fc.asyncProperty(
        logEntriesArb,
        async (entries) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          await promisify(adapter, 'append', entries);
          const retrieved = await promisify(adapter, 'getEntriesFrom', 1);

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

    t.pass('log entries round-trip preserves entries');
  });

  /**
   * Property: state persists after simulated restart.
   *
   * For any Raft state, closing and reopening the database should
   * preserve all stored values.
   */
  t.test('state persists after simulated restart', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({max: 1000000}),
        fc.oneof(fc.constant(null), fc.string({minLength: 1, maxLength: 50})),
        fc.nat({max: 1000000}),
        async (term, votedFor, commitIndex) => {
          // Use a file-based database for persistence test
          const dbPath = `/tmp/raft-test-${Date.now()}-${Math.random()}.db`;
          let db = new Database(dbPath);
          let adapter = new SQLiteLogAdapter(db);

          // Store state
          await promisify(adapter, 'setTerm', term);
          await promisify(adapter, 'setVotedFor', votedFor);
          await promisify(adapter, 'setCommitIndex', commitIndex);

          // Close database (simulating shutdown)
          db.close();

          // Reopen database (simulating restart)
          db = new Database(dbPath);
          adapter = new SQLiteLogAdapter(db);

          // Retrieve state
          const retrievedTerm = await promisify(adapter, 'getTerm');
          const retrievedVotedFor = await promisify(adapter, 'getVotedFor');
          const retrievedCommitIndex = await promisify(adapter, 'getCommitIndex');

          db.close();

          // Clean up
          try {
            fs.unlinkSync(dbPath);
          } catch (_e) {
            // Ignore cleanup errors
          }

          return retrievedTerm === term &&
                 retrievedVotedFor === votedFor &&
                 retrievedCommitIndex === commitIndex;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state persists after simulated restart');
  });

  /**
   * Property: log entries persist after simulated restart.
   *
   * For any log entries, closing and reopening the database should
   * preserve all entries.
   */
  t.test('log entries persist after simulated restart', async (t) => {
    const logEntriesArb = fc.array(
      fc.record({
        term: fc.nat({max: 1000}),
        command: fc.record({
          type: fc.constantFrom('CDC', 'MESSAGE', 'ACK', 'SQL'),
          data: fc.string({maxLength: 50}),
        }),
      }),
      {minLength: 1, maxLength: 5},
    ).map((entries) => entries.map((e, i) => ({...e, index: i + 1})));

    await fc.assert(
      fc.asyncProperty(
        logEntriesArb,
        async (entries) => {
          const dbPath = `/tmp/raft-test-${Date.now()}-${Math.random()}.db`;
          let db = new Database(dbPath);
          let adapter = new SQLiteLogAdapter(db);

          // Store entries
          await promisify(adapter, 'append', entries);

          // Close database
          db.close();

          // Reopen database
          db = new Database(dbPath);
          adapter = new SQLiteLogAdapter(db);

          // Retrieve entries
          const retrieved = await promisify(adapter, 'getEntriesFrom', 1);

          db.close();

          // Clean up
          try {
            fs.unlinkSync(dbPath);
          } catch (_e) {
            // Ignore cleanup errors
          }

          // Check entries match
          if (retrieved.length !== entries.length) return false;

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

    t.pass('log entries persist after simulated restart');
  });

  /**
   * Property: getLastEntry returns the last appended entry.
   */
  t.test('getLastEntry returns the last appended entry', async (t) => {
    const logEntriesArb = fc.array(
      fc.record({
        term: fc.nat({max: 1000}),
        command: fc.string({maxLength: 50}),
      }),
      {minLength: 1, maxLength: 10},
    ).map((entries) => entries.map((e, i) => ({...e, index: i + 1})));

    await fc.assert(
      fc.asyncProperty(
        logEntriesArb,
        async (entries) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          await promisify(adapter, 'append', entries);
          const lastEntry = await promisify(adapter, 'getLastEntryCallback');

          db.close();

          const expectedLast = entries[entries.length - 1];
          return lastEntry.index === expectedLast.index &&
                 lastEntry.term === expectedLast.term &&
                 JSON.stringify(lastEntry.command) ===
                   JSON.stringify(expectedLast.command);
        },
      ),
      {numRuns: 10},
    );

    t.pass('getLastEntry returns the last appended entry');
  });

  /**
   * Property: getLastEntry returns null for empty log.
   */
  t.test('getLastEntry returns null for empty log', async (t) => {
    const db = new Database(':memory:');
    const adapter = new SQLiteLogAdapter(db);
    const lastEntry = await promisify(adapter, 'getLastEntryCallback');
    db.close();
    t.equal(lastEntry, null, 'getLastEntry returns null for empty log');
  });

  /**
   * Property: getLength returns correct count.
   */
  t.test('getLength returns correct count after appends', async (t) => {
    const logEntriesArb = fc.array(
      fc.record({
        term: fc.nat({max: 1000}),
        command: fc.string({maxLength: 50}),
      }),
      {minLength: 0, maxLength: 10},
    ).map((entries) => entries.map((e, i) => ({...e, index: i + 1})));

    await fc.assert(
      fc.asyncProperty(
        logEntriesArb,
        async (entries) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          await promisify(adapter, 'append', entries);
          const length = await promisify(adapter, 'getLength');

          db.close();
          return length === entries.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getLength returns correct count after appends');
  });

  /**
   * Property: commitIndex round-trip.
   */
  t.test('commitIndex round-trip preserves value', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({max: 1000000}),
        async (commitIndex) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          await promisify(adapter, 'setCommitIndex', commitIndex);
          const retrieved = await promisify(adapter, 'getCommitIndex');

          db.close();
          return retrieved === commitIndex;
        },
      ),
      {numRuns: 10},
    );

    t.pass('commitIndex round-trip preserves value');
  });
});
