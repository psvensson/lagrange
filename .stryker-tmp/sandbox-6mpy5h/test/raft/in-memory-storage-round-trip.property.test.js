/**
 * Property test for In-Memory Storage Round-Trip.
 * Property 1: For any Raft state stored in the InMemoryLogAdapter,
 * retrieving that state should return the same values that were stored.
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 *
 * Feature: raft-library-integration
 * Property 1: In-Memory Storage Round-Trip
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';

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
 * Feature: raft-library-integration
 * Property 1: In-Memory Storage Round-Trip
 *
 * For any Raft state stored in the InMemoryLogAdapter, retrieving that state
 * should return the same values that were stored.
 */
test('Property 1: In-Memory Storage Round-Trip', async (t) => {
  /**
   * Property: saveCommand round-trip preserves command data.
   *
   * For any command, term, and index, saving and retrieving should
   * return the same values.
   */
  t.test('saveCommand round-trip preserves value', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({max: 1000}),
        fc.nat({max: 100}),
        fc.string({maxLength: 50}),
        async (term, index, commandData) => {
          const node = createMockNode('test-node', term);
          const adapter = new InMemoryLogAdapter(node);

          const command = {type: 'TEST', data: commandData};
          const savedEntry = await adapter.saveCommand(command, term, index + 1);

          // Verify saved entry has correct values
          if (savedEntry.term !== term) return false;
          if (savedEntry.index !== index + 1) return false;
          if (JSON.stringify(savedEntry.command) !== JSON.stringify(command)) {
            return false;
          }

          // Retrieve and verify
          const retrieved = await adapter.get(index + 1);
          return retrieved.term === term &&
                 retrieved.index === index + 1 &&
                 JSON.stringify(retrieved.command) === JSON.stringify(command);
        },
      ),
      {numRuns: 10},
    );

    t.pass('saveCommand round-trip preserves value');
  });

  /**
   * Property: getLastEntry returns the last saved entry.
   *
   * For any sequence of saved commands, getLastEntry should return
   * the entry with the highest index.
   */
  t.test('getLastEntry returns the last saved entry', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 10}),
        async (count) => {
          const node = createMockNode('test-node', 1);
          const adapter = new InMemoryLogAdapter(node);

          let lastEntry = null;
          for (let i = 1; i <= count; i++) {
            lastEntry = await adapter.saveCommand({type: 'TEST', i}, 1, i);
          }

          const retrieved = await adapter.getLastEntry();
          return retrieved.index === lastEntry.index &&
                 retrieved.term === lastEntry.term;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getLastEntry returns the last saved entry');
  });

  /**
   * Property: getLastEntry returns default for empty log.
   */
  t.test('getLastEntry returns default for empty log', async (t) => {
    const node = createMockNode('test-node', 5);
    const adapter = new InMemoryLogAdapter(node);

    const lastEntry = await adapter.getLastEntry();
    t.equal(lastEntry.index, 0, 'index should be 0 for empty log');
    t.equal(lastEntry.term, 5, 'term should match node term');
  });

  /**
   * Property: getLastInfo returns correct info after saves.
   */
  t.test('getLastInfo returns correct info', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 10}),
        fc.nat({max: 100}),
        async (count, term) => {
          const node = createMockNode('test-node', term);
          const adapter = new InMemoryLogAdapter(node);

          for (let i = 1; i <= count; i++) {
            await adapter.saveCommand({type: 'TEST'}, term, i);
          }

          const info = await adapter.getLastInfo();
          return info.index === count && info.term === term;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getLastInfo returns correct info');
  });

  /**
   * Property: has returns true for existing entries.
   */
  t.test('has returns true for existing entries', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 10}),
        async (index) => {
          const node = createMockNode('test-node', 1);
          const adapter = new InMemoryLogAdapter(node);

          await adapter.saveCommand({type: 'TEST'}, 1, index);

          const exists = await adapter.has(index);
          const notExists = await adapter.has(index + 100);

          return exists === true && notExists === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('has returns true for existing entries');
  });

  /**
   * Property: get returns null for non-existent entries.
   */
  t.test('get returns null for non-existent entries', async (t) => {
    const node = createMockNode('test-node', 1);
    const adapter = new InMemoryLogAdapter(node);

    const entry = await adapter.get(999);
    t.equal(entry, null, 'missing entries should return null');
  });

  /**
   * Property: getEntriesAfter returns entries after index.
   */
  t.test('getEntriesAfter returns entries after index', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 3, max: 10}),
        async (count) => {
          const node = createMockNode('test-node', 1);
          const adapter = new InMemoryLogAdapter(node);

          for (let i = 1; i <= count; i++) {
            await adapter.saveCommand({type: 'TEST', i}, 1, i);
          }

          const midpoint = Math.floor(count / 2);
          const entries = await adapter.getEntriesAfter(midpoint);

          // Should have entries from midpoint+1 to count
          if (entries.length !== count - midpoint) return false;

          // Entries should be sorted by index
          for (let i = 0; i < entries.length; i++) {
            if (entries[i].index !== midpoint + 1 + i) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getEntriesAfter returns entries after index');
  });

  /**
   * Property: commit marks entry as committed.
   */
  t.test('commit marks entry as committed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 10}),
        async (index) => {
          const node = createMockNode('test-node', 1);
          const adapter = new InMemoryLogAdapter(node);

          await adapter.saveCommand({type: 'TEST'}, 1, index);

          // Before commit
          const beforeCommit = await adapter.get(index);
          if (beforeCommit.committed !== false) return false;

          // After commit
          await adapter.commit(index);
          const afterCommit = await adapter.get(index);

          return afterCommit.committed === true &&
                 adapter.committedIndex === index;
        },
      ),
      {numRuns: 10},
    );

    t.pass('commit marks entry as committed');
  });

  /**
   * Property: end clears all entries.
   */
  t.test('end clears all entries', async (t) => {
    const node = createMockNode('test-node', 1);
    const adapter = new InMemoryLogAdapter(node);

    // Add some entries
    for (let i = 1; i <= 5; i++) {
      await adapter.saveCommand({type: 'TEST'}, 1, i);
    }
    await adapter.commit(3);

    // End should clear everything
    adapter.end();

    t.equal(adapter.lastIndex, 0, 'lastIndex should be 0');
    t.equal(adapter.committedIndex, 0, 'committedIndex should be 0');

    const lastEntry = await adapter.getLastEntry();
    t.equal(lastEntry.index, 0, 'getLastEntry should return default');
  });

  /**
   * Property: commandAck adds acknowledgment.
   */
  t.test('commandAck adds acknowledgment', async (t) => {
    const node = createMockNode('test-node', 1);
    const adapter = new InMemoryLogAdapter(node);

    await adapter.saveCommand({type: 'TEST'}, 1, 1);

    // Initial entry has one response (from the node itself)
    const before = await adapter.get(1);
    t.equal(before.responses.length, 1, 'should have 1 initial response');

    // Add ack from another node
    await adapter.commandAck(1, 'other-node');

    const after = await adapter.get(1);
    t.equal(after.responses.length, 2, 'should have 2 responses after ack');
    t.ok(
      after.responses.some((r) => r.address === 'other-node'),
      'should have ack from other-node',
    );
  });
});
