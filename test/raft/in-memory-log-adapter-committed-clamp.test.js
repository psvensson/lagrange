import {test} from '../../src/test-helpers/tap.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';

// A conflict truncation may delete only the uncommitted suffix. Lowering committedIndex to match a
// destructive truncation launders committed-entry loss into a superficially consistent readout.

function mockNode(address = 'n1', term = 1) {
  return {address, term};
}

test('removeEntriesAfter preserves the committed prefix and monotonic watermark',
  async (t) => {
    const adapter = new InMemoryLogAdapter(mockNode());
    await adapter.saveCommand('c1', 1);
    await adapter.saveCommand('c2', 1);
    await adapter.saveCommand('c3', 1);
    await adapter.commit(3);
    t.equal(adapter.committedIndex, 3, 'committedIndex advanced to 3');
    t.equal(adapter.lastIndex, 3, 'lastIndex is 3');

    // Truncate below the committed point (the anomalous case).
    await adapter.removeEntriesAfter(1);

    t.equal(adapter.lastIndex, 3, 'committed log tail survives');
    t.equal(adapter.committedIndex, 3, 'committedIndex never regresses');
    t.same((await adapter.get(3)).command, 'c3', 'committed entry survives');
  });

test('a truncation at/above the committed point leaves committedIndex unchanged (clamp is a no-op)',
  async (t) => {
    const adapter = new InMemoryLogAdapter(mockNode());
    await adapter.saveCommand('c1', 1);
    await adapter.saveCommand('c2', 1);
    await adapter.saveCommand('c3', 1);
    await adapter.commit(2);
    t.equal(adapter.committedIndex, 2, 'committedIndex is 2');

    // Truncate only the uncommitted tail (the correct-raft case): clamp must not touch committedIndex.
    await adapter.removeEntriesAfter(2);

    t.equal(adapter.lastIndex, 2, 'lastIndex is 2');
    t.equal(adapter.committedIndex, 2,
      'committedIndex unchanged when truncation stays at/above the committed point');
  });
