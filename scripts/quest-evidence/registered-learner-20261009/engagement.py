"""Correct the scheduling wrapper, not native behavior or acceptance limits."""
from pathlib import Path

p = Path('test/integration/message-group-learner-recipient.integration.test.js')
s = p.read_text()
a = "import {MessageRouter} from '../../src/transport/message-router.js';"
assert s.count(a) == 1
s = s.replace(a, a + "\nimport {createRaftOperationPort} from '../../src/raft/raft-operation-port.js';")
a = """  const proxy = new Proxy(native, {get(target, key) {
    if (key === 'readCommittedMembership') {
      return async (query) => {
        const answer = await native.readCommittedMembership(query);
        entered.resolve(); await release.promise; return answer;
      };
    }
    return Reflect.get(target, key);
  }});"""
b = """  // Native port methods are non-configurable/non-writable. A Proxy cannot
  // return another function for them. Use the existing port constructor for
  // this explicit scheduling-only wrapper; every answer is still native.
  const proxy = createRaftOperationPort({...native,
    readCommittedMembership: async (query) => {
      const answer = await native.readCommittedMembership(query);
      entered.resolve(); await release.promise; return answer;
    },
  });"""
assert s.count(a) == 1
s = s.replace(a, b)
a = "test('registered message-group recipient carries historical evidence to its workflow owner',"
b = """async function assertNativeReadEntered(held, pending) {
  const entered = await Promise.race([
    held.entered.then(() => true), pending.then(() => false),
  ]);
  assert.equal(entered, true,
    'the actual native read must engage before delivery completes');
}

""" + a
assert s.count(a) == 1
s = s.replace(a, b)
assert s.count('await held.entered;') == 3
s = s.replace('await held.entered;', 'await assertNativeReadEntered(held, pending);')
p.write_text(s)
