"""Preserve the sealed native port while testing delayed recipient answers."""
from pathlib import Path
import os

p = Path('test/integration/message-group-learner-recipient.integration.test.js')
s = p.read_text()
def replace(before, after, count=1):
    global s
    assert s.count(before) == count, ('test correction anchor drift', before)
    s = s.replace(before, after)

anchor = "import {MessageRouter} from '../../src/transport/message-router.js';"
replace(anchor, anchor + "\nimport {createRaftOperationPort} from '../../src/raft/raft-operation-port.js';")
replace("""  const proxy = new Proxy(native, {get(target, key) {
    if (key === 'readCommittedMembership') return async (query) => {
      const answer = await native.readCommittedMembership(query);
      entered.resolve(); await release.promise; return answer;
    };
    return Reflect.get(target, key);
  }});""", """  // A Proxy cannot replace a non-configurable frozen port method. This
  // explicit scheduling wrapper uses the existing constructor and delegates
  // every operation and every observation to the actual native port.
  const proxy = createRaftOperationPort({...native,
    readCommittedMembership: async (query) => {
      const answer = await native.readCommittedMembership(query);
      entered.resolve(); await release.promise; return answer;
    },
  });""")
anchor = "test('registered message-group recipient carries historical evidence to its workflow owner',"
replace(anchor, """async function assertNativeReadEntered(held, pending) {
  const entered = await Promise.race([
    held.entered.then(() => true), pending.then(() => false),
  ]);
  assert.equal(entered, true,
    'the actual native read must engage before delivery completes');
}

""" + anchor)
replace('await held.entered;', 'await assertNativeReadEntered(held, pending);', 3)
replace('fx.service.raft = fx.native; held.release();', """const oldDatabase = fx.f.cluster.replica(fx.replicaId).db;
    const recovered = fx.f.cluster.restart(fx.replicaId);
    assert.equal(oldDatabase.open, false, 'the prior recipient database must close');
    assert.equal(recovered.db === oldDatabase, false, 'recovery must open another database');
    assert.equal(recovered.node === fx.native, false, 'recovery must open another native port');
    fx.service.raft = recovered.node;
    held.release();""")
anchor = 'assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_IN_FLIGHT);'
replace(anchor, anchor + """
    const proposals = fx.f.proposalCount();
    assert.equal((await record(fx)).outcome, 'recorded',
      'a fresh invocation must recover after actual native reconstruction');
    assert.equal(fx.f.proposalCount(), proposals, 'recovery must not propose membership again');""")
p.write_text(s)

tools = Path(os.environ['CARRIER']) / 'tools.py'
text = tools.read_text()
anchor = "        ('joint-is-temporary','src/rebalancer/replica-operation-message-group-membership-authorization.js',"
assert text.count(anchor) == 1
text = text.replace(anchor, """        ('native-port-binding','src/node/message-group-membership-recipient.js',
         [(' && service.raft === port','')],
         recipient,'native port replacement invalidates a held result',
         'replaced port cannot return a stale witness'),
""" + anchor)
tools.write_text(text)
