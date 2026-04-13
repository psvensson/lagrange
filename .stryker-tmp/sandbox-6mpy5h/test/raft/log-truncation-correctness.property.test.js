/**
 * Property test for Log Truncation Correctness.
 * Property 3: For any log with entries and any valid truncation index, after
 * truncation all entries at or after the truncation index should be removed,
 * and all entries before should be preserved.
 *
 * Validates: Requirements 3.4, 4.4
 *
 * Feature: raft-library-integration
 * Property 3: Log Truncation Correctness
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

/**
 * Create a mock node for the adapter.
 * @param {string} address - Node address.
 * @param {number} term - Current term.
 * @return {Object} Mock node.
 */
function createMockNode(address = 'test-node', term = 0) {
  return {address, term};
}

/**
 * Helper to promisify callback-based methods for SQLiteLogAdapter.
 * @param {Object} adapter - The adapter instance.
 * @param {string} method - Method name to call.
 * @param {...*} args - Arguments to pass.
 * @return {Promise<*>} Result of the method.
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
 * Property 3: Log Truncation Correctness
 *
 * For any log with entries and any valid truncation index, after truncation
 * all entries at or after the truncation index should be removed, and all
 * entries before should be preserved.
 */
test('Property 3: Log Truncation Correctness', async (t) => {
  /**
   * Property: InMemoryLogAdapter removeEntriesAfter removes entries after index.
   *
   * For any log and truncation index, entries after the index should
   * be removed.
   */
  t.test('InMemoryLogAdapter removeEntriesAfter removes entries after index', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 3, max: 10}),
        async (count) => {
          const node = createMockNode('test-node', 1);
          const adapter = new InMemoryLogAdapter(node);

          // Add entries
          for (let i = 1; i <= count; i++) {
            await adapter.saveCommand({type: 'TEST', i}, 1, i);
          }

          // Pick a truncation point in the middle
          const truncateAfter = Math.floor(count / 2);

          await adapter.removeEntriesAfter(truncateAfter);

          // Verify entries after truncation point are removed
          for (let i = truncateAfter + 1; i <= count; i++) {
            const exists = await adapter.has(i);
            if (exists) return false;
          }

          // Verify entries at and before truncation point are preserved
          for (let i = 1; i <= truncateAfter; i++) {
            const exists = await adapter.has(i);
            if (!exists) return false;
          }

          // Verify lastIndex is updated
          if (adapter.lastIndex !== truncateAfter) return false;

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('InMemoryLogAdapter removeEntriesAfter removes entries after index');
  });

  /**
   * Property: InMemoryLogAdapter removeEntriesAfter preserves entries at and before index.
   */
  t.test('InMemoryLogAdapter removeEntriesAfter preserves entries at index', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 3, max: 10}),
        async (count) => {
          const node = createMockNode('test-node', 1);
          const adapter = new InMemoryLogAdapter(node);

          // Add entries with specific data
          const originalEntries = [];
          for (let i = 1; i <= count; i++) {
            const entry = await adapter.saveCommand({type: 'TEST', value: i * 10}, 1, i);
            originalEntries.push(entry);
          }

          // Truncate from middle
          const truncateAfter = Math.floor(count / 2);
          await adapter.removeEntriesAfter(truncateAfter);

          // Verify preserved entries match original
          for (let i = 1; i <= truncateAfter; i++) {
            const entry = await adapter.get(i);
            if (entry.command.value !== originalEntries[i - 1].command.value) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('InMemoryLogAdapter removeEntriesAfter preserves entries at index');
  });

  /**
   * Property: InMemoryLogAdapter removeEntriesAfter(0) clears entire log.
   */
  t.test('InMemoryLogAdapter removeEntriesAfter(0) clears entire log', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 10}),
        async (count) => {
          const node = createMockNode('test-node', 1);
          const adapter = new InMemoryLogAdapter(node);

          for (let i = 1; i <= count; i++) {
            await adapter.saveCommand({type: 'TEST'}, 1, i);
          }

          await adapter.removeEntriesAfter(0);

          // All entries should be removed
          for (let i = 1; i <= count; i++) {
            const exists = await adapter.has(i);
            if (exists) return false;
          }

          return adapter.lastIndex === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('InMemoryLogAdapter removeEntriesAfter(0) clears entire log');
  });

  /**
   * Property: SQLiteLogAdapter truncation removes entries at and after index.
   */
  t.test('SQLiteLogAdapter truncation removes entries at and after index', async (t) => {
    // Generate entries with sequential indices starting from 1
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 3, max: 10}),
        async (count) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          // Create entries with sequential indices
          const entries = [];
          for (let i = 1; i <= count; i++) {
            entries.push({
              index: i,
              term: 1,
              command: {type: 'TEST', value: i},
            });
          }

          await promisify(adapter, 'append', entries);

          // Pick a truncation index (1-based for SQLite)
          const truncateIndex = Math.floor(count / 2) + 1;

          await promisify(adapter, 'truncateFrom', truncateIndex);
          const remaining = await promisify(adapter, 'getEntriesFrom', 1);

          db.close();

          // Should have exactly truncateIndex - 1 entries remaining
          const expectedCount = truncateIndex - 1;
          if (remaining.length !== expectedCount) return false;

          // All remaining entries should be from before the truncation point
          for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].index !== entries[i].index) return false;
            if (remaining[i].term !== entries[i].term) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('SQLiteLogAdapter truncation removes entries at and after index');
  });

  /**
   * Property: SQLiteLogAdapter truncation preserves entries before index.
   */
  t.test('SQLiteLogAdapter truncation preserves entries before index', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 3, max: 10}),
        async (count) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          const entries = [];
          for (let i = 1; i <= count; i++) {
            entries.push({
              index: i,
              term: 1,
              command: {type: 'TEST', value: i * 10},
            });
          }

          await promisify(adapter, 'append', entries);

          // Truncate from middle (1-based index)
          const truncateIndex = Math.floor(count / 2) + 1;

          await promisify(adapter, 'truncateFrom', truncateIndex);
          const remaining = await promisify(adapter, 'getEntriesFrom', 1);

          db.close();

          // Verify preserved entries match original
          for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].index !== entries[i].index) return false;
            if (remaining[i].term !== entries[i].term) return false;
            const cmd = typeof remaining[i].command === 'string' ?
              JSON.parse(remaining[i].command) : remaining[i].command;
            if (cmd.value !== entries[i].command.value) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('SQLiteLogAdapter truncation preserves entries before index');
  });

  /**
   * Property: SQLiteLogAdapter truncation at 1 clears entire log.
   */
  t.test('SQLiteLogAdapter truncation at 1 clears entire log', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 10}),
        async (count) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          const entries = [];
          for (let i = 1; i <= count; i++) {
            entries.push({index: i, term: 1, command: {type: 'TEST'}});
          }

          await promisify(adapter, 'append', entries);
          await promisify(adapter, 'truncateFrom', 1);

          const remaining = await promisify(adapter, 'getEntriesFrom', 1);
          const length = await promisify(adapter, 'getLength');

          db.close();

          return remaining.length === 0 && length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('SQLiteLogAdapter truncation at 1 clears entire log');
  });

  /**
   * Property: InMemoryLogAdapter truncation is idempotent.
   */
  t.test('InMemoryLogAdapter truncation is idempotent', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 3, max: 10}),
        async (count) => {
          const node = createMockNode('test-node', 1);
          const adapter = new InMemoryLogAdapter(node);

          for (let i = 1; i <= count; i++) {
            await adapter.saveCommand({type: 'TEST', i}, 1, i);
          }

          const truncateAfter = Math.floor(count / 2);

          // Truncate twice
          await adapter.removeEntriesAfter(truncateAfter);
          const afterFirst = await adapter.getEntriesAfter(0);

          await adapter.removeEntriesAfter(truncateAfter);
          const afterSecond = await adapter.getEntriesAfter(0);

          // Results should be identical
          if (afterFirst.length !== afterSecond.length) return false;

          for (let i = 0; i < afterFirst.length; i++) {
            if (afterFirst[i].index !== afterSecond[i].index) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('InMemoryLogAdapter truncation is idempotent');
  });

  /**
   * Property: SQLiteLogAdapter truncation is idempotent.
   */
  t.test('SQLiteLogAdapter truncation is idempotent', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 3, max: 10}),
        async (count) => {
          const db = new Database(':memory:');
          const adapter = new SQLiteLogAdapter(db);

          const entries = [];
          for (let i = 1; i <= count; i++) {
            entries.push({index: i, term: 1, command: {type: 'TEST'}});
          }

          await promisify(adapter, 'append', entries);

          const truncateIndex = Math.floor(count / 2) + 1;

          // Truncate twice
          await promisify(adapter, 'truncateFrom', truncateIndex);
          const afterFirst = await promisify(adapter, 'getEntriesFrom', 1);

          await promisify(adapter, 'truncateFrom', truncateIndex);
          const afterSecond = await promisify(adapter, 'getEntriesFrom', 1);

          db.close();

          // Results should be identical
          if (afterFirst.length !== afterSecond.length) return false;

          for (let i = 0; i < afterFirst.length; i++) {
            if (afterFirst[i].index !== afterSecond[i].index) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('SQLiteLogAdapter truncation is idempotent');
  });
});
