
// Initial operation-row authorization: actual claim, action and T0 CAS share
// one canonical SQLite row. Runtime dispatch/physical CREATE remain absent.
async function ownedInitial(t) {
  const f = await setup(t, {initial: true});
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome,
    'recorded', 'initial holder must actually be acquired');
  return f;
}
function learnerRequest(changes = {}) {
  return {operationId: O, identity: ENCODED_IDENTITY,
    permit: JSON.stringify({...prior, permitState: 'in_flight', proposalIndex: null, ...changes})};
}
async function authorizeInitial(f, input = learnerRequest(), repository = f.repository) {
  assert.equal(typeof repository.authorizeMessageGroupLearner, 'function',
    'existing repository must record the initial exact learner intent');
  return repository.authorizeMessageGroupLearner(input);
}
function withoutLearnerIntent(row) {
  const copy = {...row};
  delete copy.message_group_membership_phase;
  delete copy.message_group_membership_permit;
  delete copy.message_group_membership_obligation_state;
  return copy;
}

test('initial learner intent commits once and exact replay survives reopen', async (t) => {
  const f = await ownedInitial(t);
  const before = f.row();
  const input = learnerRequest();
  assert.equal((await authorizeInitial(f, input)).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_phase, 'learner_proposal_in_flight');
  assert.equal(f.row().message_group_membership_permit, input.permit);
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
  assert.deepEqual(withoutLearnerIntent(f.row()), withoutLearnerIntent(before));
  f.reopen();
  assert.equal((await authorizeInitial(f, input)).outcome, 'recorded');
  assert.equal(f.writes, 1);
});

test('initial learner authorization requires the actual live holder, not a copied payload', async (t) => {
  const f = await setup(t, {initial: true});
  assert.equal((await authorizeInitial(f)).outcome, 'stale_owner');
  await f.repository.claimMessageGroupMembershipOwner(f.claimRequest());
  assert.equal((await authorizeInitial(f, learnerRequest(), f.repo(TARGET_NODE))).outcome, 'stale_owner');
  for (const override of [{workflowOwnerFence: 'copied-fence'},
    {membershipLeaseExpiresAt: LEASE + 1}, {proposerBootIncarnation: 2}]) {
    assert.equal((await authorizeInitial(f, learnerRequest(override))).outcome, 'stale_owner');
  }
  assert.equal(f.writes, 0);
});

test('initial learner permit cannot substitute the source or select a later stage', async (t) => {
  const f = await ownedInitial(t);
  assert.equal((await authorizeInitial(f, learnerRequest({replicaIdentity: S, peerId: peerOf(S)})))
    .outcome, 'invalid', 'the source is not the initial learner target');
  for (const override of [{permitStage: 'promote'}, {permitSequence: 2},
    {permitState: 'committed', proposalIndex: 5}, {transitionIdentity: 'other-operation'}]) {
    assert.equal((await authorizeInitial(f, learnerRequest(override))).outcome, 'invalid');
  }
  assert.equal((await authorizeInitial(f, {...learnerRequest(), identity: '{}'})).outcome, 'invalid');
  assert.equal(f.writes, 0);
});

test('terminal non-admission first permanently defeats delayed learner authorization', async (t) => {
  const f = await ownedInitial(t);
  f.fault('delayed');
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  await terminal(f);
  assert.equal((await settleInitial(f)).outcome, 'recorded');
  assert.deepEqual(f.flush().map((r) => r.changes), [0]);
  assert.equal((await authorizeInitial(f)).outcome, 'conflict');
  assert.equal(f.row().message_group_membership_lane_key, null);
  assert.equal(f.row().message_group_membership_permit, null);
  assert.equal(f.row().message_group_membership_obligation_state, 'definitive_non_admission');
});

test('ordinary terminal settlement racing initial authorization defeats its exact CAS', async (t) => {
  const f = await ownedInitial(t);
  f.fault(() => terminal(f));
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, null,
    'terminal settlement defeats stale initial learner intent');
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
  assert.equal((await settleInitial(f)).outcome, 'recorded');
});

test('issued learner intent outlives terminal settlement and cannot be erased by T0', async (t) => {
  const f = await ownedInitial(t);
  assert.equal((await authorizeInitial(f)).outcome, 'recorded');
  await terminal(f); f.reopen();
  assert.equal((await settleInitial(f)).outcome, 'conflict');
  assert.equal((await authorizeInitial(f)).outcome, 'recorded',
    'exact issued intent remains observable, never a new dispatch grant');
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
  assert.equal(f.row().status, ReplicaStatus.FAILED);
  assert.equal(f.writes, 1);
});

test('holder renewal during initial authorization defeats the old holder predicate', async (t) => {
  const f = await ownedInitial(t);
  f.fault(async () => {
    f.clock.advance(1);
    assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  });
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, null,
    'renewed holder defeats initial learner intent CAS');
  assert.equal(JSON.parse(f.row().message_group_membership_owner_claim).generation, 2);
});

test('lost learner write answer is resolved by exact durable readback after reopen', async (t) => {
  const f = await ownedInitial(t);
  f.fault('lost-and-unreadable');
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, learnerRequest().permit);
  f.reads(true); f.reopen();
  assert.equal((await authorizeInitial(f)).outcome, 'recorded');
  assert.equal(f.writes, 1);
});

test('refused learner mutation or unavailable read never becomes recorded permission', async (t) => {
  const f = await ownedInitial(t);
  f.operationReads(false);
  assert.equal((await authorizeInitial(f)).outcome, 'unavailable');
  assert.equal(f.writes, 0);
  f.operationReads(true); f.fault('refused');
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, null);
  assert.equal((await authorizeInitial(f)).outcome, 'recorded');
});

test('changed canonical boot after learner intent commit remains unknown to the stale owner', async (t) => {
  const f = await ownedInitial(t);
  f.fault(() => f.run('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [OWNER]));
  assert.equal((await authorizeInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_permit, learnerRequest().permit);
  assert.equal((await authorizeInitial(f)).outcome, 'unavailable');
});

test('successor observes original issued learner intent without rewriting its context', async (t) => {
  const f = await ownedInitial(t);
  assert.equal((await authorizeInitial(f)).outcome, 'recorded');
  const originalPermit = f.row().message_group_membership_permit;
  f.clock.advance(30000);
  const successor = f.repo(TARGET_NODE);
  assert.equal((await successor.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  assert.equal((await authorizeInitial(f, learnerRequest(), successor)).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_permit, originalPermit);
  assert.equal((await authorizeInitial(f)).outcome, 'stale_owner');
  assert.equal(f.writes, 1);
});

test('initial intent competitors record only one exact permit; all other phases retain debt', async (t) => {
  const f = await ownedInitial(t);
  const first = learnerRequest();
  const other = learnerRequest({leaderTerm: prior.leaderTerm + 1});
  const attempts = await Promise.all([authorizeInitial(f, first), authorizeInitial(f, other, f.repo())]);
  assert.equal(attempts.filter((r) => r.outcome === 'recorded').length, 1);
  assert.ok([first.permit, other.permit].includes(f.row().message_group_membership_permit));
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
});
