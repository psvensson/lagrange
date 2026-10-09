from pathlib import Path
p=Path('test/integration/message-group-learner-runtime-authorization.integration.test.js')
s=p.read_text()
a="  const db = new Database(path.join(dir, 'operations.sqlite'));";assert s.count(a)==1
s=s.replace(a,"  let db = new Database(path.join(dir, 'operations.sqlite'));")
a='  let beforeOperation = null;';assert s.count(a)==1
s=s.replace(a,a+'\n  let beforeReceiptWrite = null;')
a='    executeQuery: async (sql, params) => execute(sql, params),';assert s.count(a)==1
s=s.replace(a,'''    executeQuery: async (sql, params) => {
      if (beforeReceiptWrite && sql.includes('message_group_learner_stamp = ?')) {
        const callback = beforeReceiptWrite;
        beforeReceiptWrite = null;
        const outcome = await callback(sql, params);
        if (outcome !== undefined) return outcome;
      }
      return execute(sql, params);
    },''')
a='request, receiver, observe, db, gateway, transport,';assert s.count(a)==1
s=s.replace(a,'''request, receiver, observe, gateway, transport,
    get db() {
      return db;
    },
    pauseReceiptWrite(callback) {
      beforeReceiptWrite = callback;
    },
    reopenOperations() {
      const previous = db;
      previous.close();
      db = new Database(path.join(dir, 'operations.sqlite'));
      db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL');
      assert.equal(previous.open, false);
      assert.equal(db === previous, false);
      assert.equal(db.pragma('journal_mode', {simple: true}), 'wal');
      assert.equal(db.pragma('synchronous', {simple: true}), 2);
      return repositoryFor(NODE);
    },''')
a='async function installationAdmission(t, f) {';assert s.count(a)==1
helper='''async function learnerCommitRequest(f) {
  const origin = await readLearnerAction(f);
  assert.equal(origin.kind, membershipRead.COMMITTED_LEARNER_ACTION_KIND.COMMITTED);
  const stamp = await f.cluster.node(f.cluster.leaderReplicaId()).readCommittedMembership({
    purpose: membershipRead.COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
  assert.equal(stamp.kind, membershipRead.COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
  return {operationId: O, identity: f.request.identity, permit: f.request.permit,
    executionClaim: f.row().message_group_membership_owner_claim,
    receipt: JSON.stringify(origin.receipt), learnerStamp: JSON.stringify(stamp)};
}
function assertRecordedLearner(f, before, proposed) {
  const row = f.row();
  assert.equal(row.message_group_membership_phase, 'learner_committed');
  const permit = JSON.parse(row.message_group_membership_permit);
  assert.deepEqual(permit, {...JSON.parse(f.request.permit), permitState: 'committed',
    proposalIndex: proposed.proposalIndex}, 'recording changes result fields, not old execution fences');
  assert.notEqual(row.message_group_learner_stamp, null);
  const rest = {...row};
  for (const key of ['message_group_membership_phase', 'message_group_membership_permit',
    'message_group_learner_stamp']) delete rest[key];
  const original = {...before};
  for (const key of ['message_group_membership_phase', 'message_group_membership_permit',
    'message_group_learner_stamp']) delete original[key];
  assert.deepEqual(rest, original, 'ordinary state, holder, lane and all other obligations remain');
  assert.equal(f.cluster.replicas.has(TARGET), false, 'receipt recording does not create a target');
}
'''
s=s.replace(a,helper+a)
a="    await t.test('actual origin-bearing image installs and reopens on the exact fresh learner',";assert s.count(a)==1
cases='''    await t.test('reconstructed owners record the original committed learner without reproposal',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const before = f.row();
        const proposals = f.proposalCount();
        for (const id of FOUNDERS) f.cluster.restart(id);
        assert.ok(f.cluster.settle(() => f.cluster.leaderReplicaId() !== null));
        const freshRepository = f.reopenOperations();
        assert.equal(freshRepository === f.repository, false);
        const request = await learnerCommitRequest(f);
        assert.equal(typeof freshRepository.recordMessageGroupLearnerCommit, 'function',
          'the repository must conditionally record recovered native origin');
        const result = await freshRepository.recordMessageGroupLearnerCommit(request);
        assert.equal(result.outcome, 'recorded');
        assertRecordedLearner(f, before, proposed);
        assert.equal(f.proposalCount(), proposals, 'recovery must not repropose the committed action');
        const recorded = f.row();
        const changes = f.db.prepare('SELECT total_changes() AS n').get().n;
        assert.equal((await freshRepository.recordMessageGroupLearnerCommit(request)).outcome,
          'recorded');
        assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n, changes,
          'exact recording replay must not write SQL again');
        assert.deepEqual(f.row(), recorded);
      });
    await t.test('failed ordinary settlement retains and records the existing learner debt',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const request = await learnerCommitRequest(f);
        await settleOperation(f);
        const before = f.row();
        const result = await f.repository.recordMessageGroupLearnerCommit(request);
        assert.equal(result.outcome, 'recorded');
        assertRecordedLearner(f, before, proposed);
        assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
        assert.equal(f.row().message_group_membership_obligation_state, 'unknown');
        assert.notEqual(f.row().message_group_membership_lane_key, null);
      });
    await t.test('successful ordinary settlement cannot acquire a new learner-result transition',
      async (t) => {
        const f = await fixture(t);
        assertCommittedLearner(f, await f.run());
        const request = await learnerCommitRequest(f);
        await settleOperation(f, true);
        const before = f.row();
        assert.equal((await f.repository.recordMessageGroupLearnerCommit(request)).outcome, 'conflict');
        assert.deepEqual(f.row(), before);
      });
    await t.test('lost recording answer is resolved by the exact durable row', async (t) => {
      const f = await fixture(t);
      const proposed = await f.run(); assertCommittedLearner(f, proposed);
      const request = await learnerCommitRequest(f);
      const before = f.row();
      let engaged = false;
      f.pauseReceiptWrite((sql, params) => {
        engaged = true;
        assert.equal(f.execute(sql, params).affectedRows, 1);
        return {success: false, error: 'recording answer deliberately lost'};
      });
      assert.equal((await f.repository.recordMessageGroupLearnerCommit(request)).outcome, 'recorded');
      assert.equal(engaged, true);
      assertRecordedLearner(f, before, proposed);
    });
    await t.test('unavailable post-write evidence stays unknown and survives reopening', async (t) => {
      const f = await fixture(t);
      const proposed = await f.run(); assertCommittedLearner(f, proposed);
      const request = await learnerCommitRequest(f);
      const before = f.row();
      let engaged = false;
      f.pauseReceiptWrite((sql, params) => {
        engaged = true;
        assert.equal(f.execute(sql, params).affectedRows, 1);
        f.failReads('replica_operations');
        return {success: false, error: 'lost and temporarily unreadable recording'};
      });
      assert.equal((await f.repository.recordMessageGroupLearnerCommit(request)).outcome, 'unknown');
      assert.equal(engaged, true);
      assertRecordedLearner(f, before, proposed);
      f.failReads(null);
      const fresh = f.reopenOperations();
      assert.equal((await fresh.recordMessageGroupLearnerCommit(request)).outcome, 'recorded');
      assertRecordedLearner(f, before, proposed);
    });
    await t.test('holder renewal wins against a delayed learner-result CAS', async (t) => {
      const f = await fixture(t);
      const proposed = await f.run(); assertCommittedLearner(f, proposed);
      const request = await learnerCommitRequest(f);
      let renewed;
      f.pauseReceiptWrite(async () => {
        f.clock.advance(1);
        renewed = await f.repository.claimMessageGroupMembershipOwner({operationId: O,
          identity: f.request.identity, expectedClaim: request.executionClaim});
        assert.equal(renewed.outcome, 'recorded');
        assert.notEqual(renewed.claim, request.executionClaim);
      });
      assert.equal((await f.repository.recordMessageGroupLearnerCommit(request)).outcome, 'unknown',
        'a superseded holder cannot win the delayed recording compare-and-set');
      assert.ok(renewed);
      assert.equal(f.row().message_group_learner_stamp, null);
      assert.equal(f.row().message_group_membership_permit, f.request.permit);
      const before = f.row();
      assert.equal((await f.repository.recordMessageGroupLearnerCommit({...request,
        executionClaim: renewed.claim})).outcome, 'recorded');
      assertRecordedLearner(f, before, proposed);
    });
    await t.test('wrong origins and unresolved evidence never advance the operation', async (t) => {
      const f = await fixture(t);
      assertCommittedLearner(f, await f.run());
      const request = await learnerCommitRequest(f);
      const origin = JSON.parse(request.receipt);
      const before = f.row();
      const invalid = [{...request, receipt: null}, {...request, learnerStamp: '{}'},
        {...request, receipt: JSON.stringify({...origin, groupId: 'another-group'})},
        {...request, receipt: JSON.stringify({...origin, term: String(BigInt(origin.term) + 1n)})}];
      for (const [key, value] of [['operationId', 'another-operation'],
        ['transitionIdentity', 'another-transition'], ['permitSequence', 2]]) {
        invalid.push({...request, receipt: JSON.stringify({...origin,
          context: {...origin.context, [key]: value}})});
      }
      for (const input of invalid) {
        assert.equal((await f.repository.recordMessageGroupLearnerCommit(input)).outcome, 'invalid');
        assert.deepEqual(f.row(), before);
      }
      const stamp = JSON.parse(request.learnerStamp);
      const withoutTarget = {...stamp, learners: [], identities: {...stamp.identities}};
      delete withoutTarget.identities[deriveRaftRsPeerId(TARGET)];
      withoutTarget.configurationKey = 'incompatible-current-configuration';
      assert.equal((await f.repository.recordMessageGroupLearnerCommit({...request,
        learnerStamp: JSON.stringify(withoutTarget)})).outcome, 'invalid');
      assert.deepEqual(f.row(), before);
    });
'''
s=s.replace(a,cases+a)
a='  // Fixture actuation through the real repository, NOT a production driver.';assert s.count(a)==1
s=s.replace(a,"  assert.equal((await f.repository.recordMessageGroupLearnerCommit(\n    await learnerCommitRequest(f))).outcome, 'recorded');\n"+a)
a='  const before = await f.repository.queryAuthoritativeOperationById(O);\n  assert.equal((await f.repository.recordMessageGroupLearnerCommit(\n    await learnerCommitRequest(f))).outcome, \'recorded\');';assert s.count(a)==1
s=s.replace(a,"  assert.equal((await f.repository.recordMessageGroupLearnerCommit(\n    await learnerCommitRequest(f))).outcome, 'recorded');\n  const before = await f.repository.queryAuthoritativeOperationById(O);")
a="        assert.equal(f.row().message_group_membership_permit, f.request.permit,\n          'checkpoint recovery cannot refresh the original issued action');";assert s.count(a)==1
s=s.replace(a,"        assert.deepEqual(JSON.parse(f.row().message_group_membership_permit),\n          {...JSON.parse(f.request.permit), permitState: 'committed',\n            proposalIndex: proposed.proposalIndex},\n          'checkpoint recovery cannot refresh the original issued action');")
p.write_text(s)
