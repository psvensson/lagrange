  // Record initial intent through actual SQL/Raft/CDC before supplying the
  // separate committed-learner fixture. This still does not propose membership.
  assert.equal(typeof repository.authorizeMessageGroupLearner, 'function',
    'initial learner authorization method must exist on the real repository');
  const initialPermit = JSON.stringify({...prior, permitState: 'in_flight', proposalIndex: null});
  const initialInput = {operationId: id, identity, permit: initialPermit};
  const intentWritesBefore = writes.length;
  assert.equal((await repository.authorizeMessageGroupLearner(initialInput)).outcome,
    'recorded', 'initial learner intent must cross the real SQL/Raft boundary');
  assert.equal(writes.length, intentWritesBefore + 1, 'one actual initial intent CAS');
  await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: {
    message_group_membership_phase: 'learner_proposal_in_flight',
    message_group_membership_permit: initialPermit,
    message_group_membership_obligation_state: 'unknown'}});
  const issued = cache.get(TABLE, id);
  assert.equal(issued.message_group_membership_lane_key, `message-group:${group}`);
  assert.equal(issued.message_group_membership_owner_claim, claimed.claim);
  assert.equal(issued.message_group_membership_identity, identity);
  assert.equal(issued.status, ReplicaStatus.PENDING);
  assert.equal(issued.workflow_step, WORKFLOW_STEP.PENDING);
  assert.equal(issued.completed_at, null);
  assert.equal(issued.message_group_learner_stamp, null);
  assert.equal(issued.message_group_voter_stamp, null);
  assert.equal(issued.message_group_removal_stamp, null);
  assert.equal((await repository.authorizeMessageGroupLearner(initialInput)).outcome, 'recorded');
  assert.equal(writes.length, intentWritesBefore + 1, 'initial replay is observation only');
  mark('initial-learner-intent-cache-visible');
