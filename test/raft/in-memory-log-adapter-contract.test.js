import {test} from '../../src/test-helpers/tap.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';

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
