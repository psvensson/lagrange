// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {
  IN_MEMORY_LOG_COMPACTION_RETENTION,
} from '../../src/raft/in-memory-log-adapter.js';

function createMockNode(address = 'test-node', term = 1) {
  return {address, term};
}

test('InMemoryLogAdapter.get returns null for missing index', async (t) => {
  const adapter = new InMemoryLogAdapter(createMockNode());
  const entry = await adapter.get(999);
  t.equal(entry, null, 'missing entry should return null');
});

test('InMemoryLogAdapter.commit missing index does not throw', async (t) => {
  const adapter = new InMemoryLogAdapter(createMockNode('n1', 7));
  const result = await adapter.commit(42);
  t.same(result, {
    index: 42,
    term: 7,
    committed: false,
  });
});

test('getEntryBefore returns default when entry is null ' +
    '(append-fail after restart)', async (t) => {
  const term = 5;
  const adapter = new InMemoryLogAdapter(createMockNode('n1', term));
  const result = await adapter.getEntryBefore(null);
  t.same(result, {index: 0, term},
    'null entry should return default info, not crash');
});

test('getEntryInfoBefore returns default when entry is null ' +
    '(liferaft appendPacket path)', async (t) => {
  const term = 3;
  const adapter = new InMemoryLogAdapter(createMockNode('n1', term));
  const result = await adapter.getEntryInfoBefore(null);
  t.same(result, {index: 0, term, committedIndex: 0},
    'null entry should return default info with committedIndex');
});

test('InMemoryLogAdapter - commit compacts entries below retention ' +
    'window to bound memory (uses compactCommittedEntries)',
async (t) => {
  // Regression: under sustained load the in-memory raft log for message
  // groups grew unboundedly because committed entries were never removed.
  // commit() must compact entries older than the retention window.
  const adapter = new InMemoryLogAdapter(createMockNode('n1', 1));
  const totalEntries = IN_MEMORY_LOG_COMPACTION_RETENTION + 50;

  for (let i = 1; i <= totalEntries; i++) {
    await adapter.saveCommand({data: i}, 1, i);
  }
  t.equal(adapter.entries.size, totalEntries,
    'all entries should exist before compaction');

  // Commit all entries — this should trigger compaction
  for (let i = 1; i <= totalEntries; i++) {
    await adapter.commit(i);
  }

  t.ok(adapter.entries.size <= IN_MEMORY_LOG_COMPACTION_RETENTION,
    'entries map should be bounded by retention window after commit; ' +
    'actual=' + adapter.entries.size +
    ' retention=' + IN_MEMORY_LOG_COMPACTION_RETENTION);
  t.equal(adapter.committedIndex, totalEntries,
    'committedIndex should reflect the last committed entry');
  t.equal(adapter.lastIndex, totalEntries,
    'lastIndex should still reflect the last entry');

  // The most recent entries should still be accessible
  const lastEntry = await adapter.get(totalEntries);
  t.ok(lastEntry, 'last entry should still be accessible');
  t.equal(lastEntry.index, totalEntries);

  // Entries well below the retention window should be compacted
  const veryOldEntry = await adapter.get(1);
  t.equal(veryOldEntry, null,
    'entries below retention window should be compacted');
});

test('InMemoryLogAdapter - commit does not compact when below ' +
    'retention threshold', async (t) => {
  const adapter = new InMemoryLogAdapter(createMockNode('n1', 1));
  const count = 10;

  for (let i = 1; i <= count; i++) {
    await adapter.saveCommand({data: i}, 1, i);
    await adapter.commit(i);
  }

  t.equal(adapter.entries.size, count,
    'should not compact when entry count is below retention threshold');
});
