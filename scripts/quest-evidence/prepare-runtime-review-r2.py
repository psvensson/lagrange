#!/usr/bin/env python3
"""PR109 R2: demonstrate the reported await window before its bounded repair."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
mode = sys.argv[2]
if mode == 'tests':
    path = root / 'test/integration/message-group-learner-runtime-authorization.integration.test.js'
    text = path.read_text()
    anchor = "test('durable learner intent is consumed only through the bound repository and real runtime',"
    assert text.count(anchor) == 1
    helper = '''// Execute a real repository change while the authoritative boot read is
// awaiting its fixture callback. The callback clears itself before repository
// writes so their own authoritative boot reads cannot recurse into the pause.
async function duringBootRead(f, change) {
  let crossed = false;
  f.pauseNodes(async () => {
    assert.equal(crossed, false, 'the intended boot-read window engages once');
    crossed = true;
    f.pauseNodes(null);
    await change();
  });
  const result = await f.run();
  assert.equal(crossed, true, 'the authorization must reach the paused boot read');
  return result;
}

'''
    text = text.replace(anchor, helper + anchor, 1)
    anchor = "    await t.test('request and host binding mutations during the read cannot retarget the proposal', async (t) => {"
    assert text.count(anchor) == 1
    tests = '''    await t.test('renewal during the boot read defeats the previously observed holder', async (t) => {
      const f = await fixture(t);
      const count = f.proposalCount();
      const result = await duringBootRead(f, async () => {
        f.clock.advance(1);
        const renewed = await f.repository.claimMessageGroupMembershipOwner({
          operationId: O, identity: f.request.identity, expectedClaim: f.request.executionClaim});
        assert.equal(renewed.outcome, 'recorded', 'the competing real holder CAS must win');
        assert.notEqual(renewed.claim, f.request.executionClaim);
      });
      assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        'a holder replaced during boot observation cannot reach native proposal');
      assertNoProposal(f, count);
    });
    await t.test('successful settlement during the boot read defeats stale nonterminal state', async (t) => {
      const f = await fixture(t);
      const count = f.proposalCount();
      const result = await duringBootRead(f, () => settleOperation(f, true));
      assert.equal(f.row().status, ReplicaStatus.REMOVED);
      assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        'successful settlement during boot observation cannot authorize a learner');
      assertNoProposal(f, count);
    });
    await t.test('failure during the boot read retains the already-issued exact learner action', async (t) => {
      const f = await fixture(t);
      const result = await duringBootRead(f, () => settleOperation(f));
      assert.equal(f.row().status, ReplicaStatus.FAILED);
      assert.equal(f.row().message_group_membership_permit, f.request.permit);
      assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
      assertCommittedLearner(f, result);
    });
    await t.test('unavailable final operation observation is not stale permission', async (t) => {
      const f = await fixture(t);
      const count = f.proposalCount();
      const result = await duringBootRead(f, async () => {
        f.failReads('replica_operations');
      });
      assert.equal(result.reason, portContract.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE,
        'unavailable final operation observation must retain a retryable refusal');
      assert.equal(result.retryable, true);
      assertNoProposal(f, count);
    });
'''
    path.write_text(text.replace(anchor, tests + anchor, 1))
elif mode == 'source':
    path = root / 'src/rebalancer/replica-operation-message-group-learner-observation.js'
    text = path.read_text()
    old = '''  if (!boots || !claimedSenderIsLive(repository, input.claim,
    input.decodedIdentity, receiver)) return refuse(REASON.STALE_OWNER);
'''
    assert text.count(old) == 1
    new = '''  if (!boots) return refuse(REASON.STALE_OWNER);
  // The boot read may suspend after the initial operation observation. Re-read
  // through the same durable owner before deciding; the earlier row cannot
  // authorize a holder or operation state that changed across that await.
  const current = await observeMembershipOperation(repository, input.operationId);
  if (!current.available) return unavailable();
  if (!exactIssuedIntent(repository, current.row, input)) return refuse(REASON.MISMATCH);
  if (!claimedSenderIsLive(repository, input.claim,
    input.decodedIdentity, receiver)) return refuse(REASON.STALE_OWNER);
'''
    path.write_text(text.replace(old, new, 1))
else:
    raise ValueError(mode)
