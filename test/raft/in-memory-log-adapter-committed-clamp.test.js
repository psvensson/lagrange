import {test} from '../../src/test-helpers/tap.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';

// DT6 item 8 — committedIndex-clamp hygiene (CL-042 readout anomaly). removeEntriesAfter recomputes
// lastIndex but historically never lowered committedIndex, so truncating below the committed point
// left committedIndex > lastIndex — a misleading readout. The clamp keeps committedIndex <= the
// surviving log tail. In correct raft the log is never truncated below the committed point, so the
// clamp is a no-op on every safe path (covered by the second test).

function mockNode(address = 'n1', term = 1) {
  return {address, term};
}

test('removeEntriesAfter clamps committedIndex to the surviving log tail (CL-042 hygiene)',
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

    t.equal(adapter.lastIndex, 1, 'lastIndex recomputed to the surviving tail');
    t.equal(adapter.committedIndex, 1,
      'committedIndex was clamped down to the surviving tail (no committedIndex > lastIndex)');
    t.ok(adapter.committedIndex <= adapter.lastIndex,
      'committedIndex never exceeds lastIndex after truncation');
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
