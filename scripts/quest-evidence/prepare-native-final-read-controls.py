#!/usr/bin/env python3
"""Continue R3 through the existing native owners, without production changes."""
from pathlib import Path

p = Path('test/integration/message-group-learner-runtime-authorization.integration.test.js')
s = p.read_text()

def change(old, new):
    global s
    assert s.count(old) == 1, ('source changed', old)
    s = s.replace(old, new, 1)

change('  let beforeNodes = null;', '  let beforeNodes = null;\n  let beforeOperation = null;')
change("      if (table === 'nodes' && beforeNodes) await beforeNodes();",
       "      if (table === 'nodes' && beforeNodes) await beforeNodes();\n" +
       "      if (table === 'replica_operations' && beforeOperation) await beforeOperation();")
change('    pauseNodes: (callback) => {',
       '    pauseOperation: (callback) => {\n      beforeOperation = callback;\n    },\n    pauseNodes: (callback) => {')
change('function assertNoProposal(f, before) {', """async function holdFinalOperationRead(t, f) {
  let enter;
  let release;
  const entered = new Promise((resolve) => { enter = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  let readCount = 0;
  f.pauseOperation(async () => {
    readCount += 1;
    if (readCount === 2) { enter(); await held; }
  });
  t.after(() => release());
  const pending = f.run();
  await entered;
  assert.equal(readCount, 2, 'the real final operation read must be held');
  return {pending, release};
}
function interveningLearnerTransition(f, replicaIdentity) {
  const status = f.port.readStatus();
  return {operationId: 'intervening-operation', transitionIdentity: 'intervening-transition',
    permitSequence: 1, stage: portContract.RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
    replicaIdentity, peerAddress: f.cluster.addressOf(replicaIdentity),
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration, leaderTerm: status.term,
    leaderConfigurationStamp: {configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex}};
}
function assertNoProposal(f, before) {""")
anchor = "    await t.test('request and host binding mutations during the read cannot retarget the proposal'"
i = s.index(anchor)
s = s[:i] + """    await t.test('actual recipient close during the final read refuses the delayed native action',
      async (t) => {
        const f = await fixture(t);
        const before = f.proposalCount();
        const held = await holdFinalOperationRead(t, f);
        await f.port.close();
        held.release();
        const result = await held.pending;
        assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
          'a closed recipient must not accept the old native action');
        assertNoProposal(f, before);
        assert.equal(f.row().message_group_membership_permit, f.request.permit,
          'recipient loss does not silently cancel the durable issued action');
      });
    await t.test('actual committed configuration drift refuses the delayed original native action',
      async (t) => {
        const f = await fixture(t);
        const held = await holdFinalOperationRead(t, f);
        const other = 'intervening-learner';
        const transition = interveningLearnerTransition(f, other);
        const reserved = admission.reserveGroupPeerIdentity(f.receiver, other);
        assert.equal(reserved.outcome, portContract.RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED);
        // This fixture acts through the native owner, not through a fabricated
        // status response. It does not stand for another admitted workflow.
        const proposal = await f.port[portContract.RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](
          transition);
        assert.equal(proposal.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
        const peer = deriveRaftRsPeerId(other);
        assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
          f.cluster.node(id).readStatus().confState.learners.includes(peer))),
        'the intervening learner is actually applied on all surviving voters');
        assert.ok(f.port.readStatus().membershipGenerationIndex >
          transition.leaderConfigurationStamp.membershipGenerationIndex,
        'the actual native configuration generation must advance');
        const afterIntervening = f.proposalCount();
        held.release();
        const result = await held.pending;
        assert.equal(result.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_CONFIGURATION,
          'an intervening committed configuration must fence the old native action');
        assertNoProposal(f, afterIntervening);
        assert.equal(f.row().message_group_membership_permit, f.request.permit,
          'native configuration refusal retains the exact unresolved operation');
      });
""" + s[i:]
p.write_text(s)
