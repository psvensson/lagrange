
// T1: an ordinary terminal result does not erase its admitted learner debt.
// These are repository-row tests, not runtime REMOVE or physical cleanup proof.
function withoutBranchIntent(row) {
  const copy = {...row};
  delete copy.message_group_membership_phase;
  delete copy.message_group_membership_permit;
  return copy;
}

test('T1 terminal learner selects exact target abandonment without reviving ordinary state', async (t) => {
  const f = await setup(t);
  await terminal(f);
  const before = f.row();
  const input = request('abort_learner');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_phase, 'target_removal_proposal_in_flight');
  assert.equal(f.row().message_group_membership_permit, input.nextPermit);
  assert.equal(JSON.parse(input.nextPermit).replicaIdentity, T);
  assert.deepEqual(withoutBranchIntent(f.row()), withoutBranchIntent(before));
  assert.equal(f.writes, 1);
  f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.equal(f.writes, 1, 'exact replay only observes already selected intent');
  assert.equal((await settleInitial(f)).outcome, 'conflict', 'admitted debt is not non-admission');
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
});

test('T1 terminal state rejects promotion and malformed completion timestamps', async (t) => {
  for (const completedAt of [NOW + 1, null, 0, -1, 0.5]) {
    await t.test(String(completedAt), async (t) => {
      const f = await setup(t);
      await terminal(f);
      assert.equal(f.run('UPDATE replica_operations SET completed_at = ? WHERE operation_id = ?',
        [completedAt, O]).changes, 1);
      const before = f.row();
      assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome,
        'conflict', 'ordinary terminality never admits a new promotion');
      if (completedAt !== NOW + 1) {
        assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
          .outcome, 'conflict');
      }
      assert.deepEqual(f.row(), before);
      assert.equal(f.writes, 0);
    });
  }
});

test('T1 exact terminal timestamp defeats a stale abandonment CAS', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.fault(() => {
    assert.equal(f.run('UPDATE replica_operations SET completed_at = ? WHERE operation_id = ?',
      [NOW + 2, O]).changes, 1);
  });
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unknown');
  assert.equal(f.row().completed_at, NOW + 2);
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});

test('T1 a terminal settlement crossing the nonterminal abort read requires a fresh basis', async (t) => {
  const f = await setup(t);
  f.fault(() => terminal(f));
  const input = request('abort_learner');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  const settled = f.row();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.deepEqual(withoutBranchIntent(f.row()), withoutBranchIntent(settled));
});

test('T1 delayed preterminal promotion loses to terminal abandonment and cannot revive', async (t) => {
  const f = await setup(t);
  f.fault('delayed');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'unknown');
  await terminal(f);
  const input = request('abort_learner');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.deepEqual(f.flush().map((r) => r.changes), [0]);
  f.reopen();
  assert.equal(f.row().message_group_membership_permit, input.nextPermit);
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request())).outcome, 'conflict');
});

test('T1 promotion committed first stays forward-only after terminal settlement', async (t) => {
  const f = await setup(t);
  const input = request();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  await terminal(f);
  const before = f.row();
  f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'conflict');
  assert.deepEqual(f.row(), before, 'J1 cannot be switched by terminal reconciliation');
});

test('T1 expired holder takeover permits only the current exact terminal-abort owner', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.clock.advance(30000);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'stale_owner');
  const successor = f.repo(TARGET_NODE);
  const claimed = await successor.claimMessageGroupMembershipOwner(f.claimRequest());
  assert.equal(claimed.outcome, 'recorded');
  const claim = JSON.parse(claimed.claim);
  const input = request('abort_learner', {workflowOwnerNodeId: TARGET_NODE,
    workflowOwnerFence: `${TARGET_NODE}:1:${claim.generation}`,
    membershipLeaseExpiresAt: claim.expiresAt, proposerNodeId: TARGET_NODE});
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'stale_owner');
  const before = f.row();
  assert.equal((await successor.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.deepEqual(withoutBranchIntent(f.row()), withoutBranchIntent(before));
});

test('T1 holder renewal between terminal read and mutation preserves the old learner phase', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.fault(async () => {
    f.clock.advance(1);
    assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome,
      'recorded');
  });
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unknown');
  assert.equal(JSON.parse(f.row().message_group_membership_owner_claim).generation, 2);
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});

test('T1 lost abandonment answer retains debt and exact replay survives reopen', async (t) => {
  const f = await setup(t);
  await terminal(f);
  const before = f.row();
  const input = request('abort_learner');
  f.fault('lost-and-unreadable');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'unknown');
  f.reads(true); f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.equal(f.writes, 1);
  assert.deepEqual(withoutBranchIntent(f.row()), withoutBranchIntent(before));
});

test('T1 source substitution and unavailable operation authority cannot issue removal intent', async (t) => {
  const f = await setup(t);
  await terminal(f);
  const before = f.row();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(
    request('abort_learner', {replicaIdentity: S, peerId: peerOf(S)}))).outcome, 'invalid');
  f.operationReads(false);
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unavailable');
  assert.deepEqual(f.row(), before);
  assert.equal(f.writes, 0);
});
