/** Required commit-authority witness: failures remain failures, not acceptance
 * of the observed defect. Metadata changes are supplied scheduling physics.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
const rootImport = (name) => import(pathToFileURL(path.resolve(name)).href);
const {refuseUnderProbe} = await rootImport('src/test-helpers/probe-guard.js');
refuseUnderProbe('the required commit-authority witness');
const {RAFT_MEMBERSHIP_TRANSITION_REASON: TRANSITION_REASON} =
  await rootImport('src/raft/raft-operation-port-constants.js');
const {fixture, FOUNDERS, NODE, SUCCESSOR} =
  await rootImport('test/test-helpers/learner-operation-fixture.js');

async function committedFixture(t) {
  const f = await fixture(t);
  assert.equal((await f.run()).reason, TRANSITION_REASON.PROPOSED);
  const peer = JSON.parse(f.request.identity).targetPeerId;
  assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
    f.cluster.node(id).readStatus().confState.learners.includes(peer))),
  'the native learner must be committed before testing recorder authority');
  return f;
}
function heldRecordingGateway(f, t) {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const execute = f.gateway.executeQuery;
  let submissions = 0;
  f.gateway.executeQuery = async (sql, ...args) => {
    if (sql.includes('message_group_learner_stamp = ?')) {
      submissions += 1; entered.resolve(); await release.promise;
    }
    return execute(sql, ...args);
  };
  t.after(release.resolve);
  return {entered: entered.promise, release: release.resolve,
    submissions: () => submissions};
}
const record = (f, repository = f.repository, request = f.request) =>
  repository.recordMessageGroupLearnerOutcome(request,
    (query) => f.port.readCommittedMembership(query));

for (const change of ['lease-expiry', 'canonical-boot-revocation']) {
  test(`${change} before the held write executes must fence recording`,
    {timeout: 30000}, async (t) => {
      const f = await committedFixture(t); const before = {...f.row()};
      const claim = JSON.parse(f.request.executionClaim);
      const held = heldRecordingGateway(f, t); const pending = record(f);
      assert.equal(await Promise.race([held.entered.then(() => true),
        pending.then(() => false)]), true, 'the actual gateway submission must engage');
      assert.equal(f.clock.now() < claim.expiresAt, true);
      if (change === 'lease-expiry') f.clock.advance(claim.expiresAt - f.clock.now() + 1);
      else f.execute('UPDATE nodes SET boot_incarnation = ? WHERE node_id = ?', [2, NODE]);
      assert.equal(f.row().message_group_membership_owner_claim,
        before.message_group_membership_owner_claim,
        'this schedule deliberately has no successor row mutation');
      held.release(); const response = await pending; const after = {...f.row()};
      console.log(JSON.stringify({schedule: change, response: response.outcome,
        beforePhase: before.message_group_membership_phase,
        afterPhase: after.message_group_membership_phase,
        submissions: held.submissions(), originalPermit: f.request.permit,
        sourceClaim: f.request.executionClaim, clockAtReadback: f.clock.now()}));
      assert.deepEqual(after, before,
        'commit-authority gate: revoked authority must not advance the operation row');
    });
}

test('an authoritative successor row defeats the held older writer and can recover',
  {timeout: 30000}, async (t) => {
    const f = await committedFixture(t);
    const claim = JSON.parse(f.request.executionClaim);
    const held = heldRecordingGateway(f, t); const pending = record(f);
    assert.equal(await Promise.race([held.entered.then(() => true),
      pending.then(() => false)]), true);
    f.clock.advance(claim.expiresAt - f.clock.now() + 1);
    const successor = f.repositoryFor(SUCCESSOR);
    const adopted = await successor.claimMessageGroupMembershipOwner({
      operationId: f.request.operationId, identity: f.request.identity,
      expectedClaim: f.request.executionClaim});
    assert.equal(adopted.outcome, 'recorded');
    const winner = {...f.row()}; held.release();
    assert.equal((await pending).outcome, 'unknown');
    assert.deepEqual(f.row(), winner, 'the stale writer must not overwrite the successor');
    const proposals = f.proposalCount();
    const request = {...f.request, executionClaim: adopted.claim};
    assert.equal((await record(f, successor, request)).outcome, 'recorded');
    assert.equal(f.proposalCount(), proposals);
    assert.equal(f.row().message_group_membership_obligation_state,
      winner.message_group_membership_obligation_state);
  });

test('a live unopposed holder records the actual committed learner',
  {timeout: 30000}, async (t) => {
    const f = await committedFixture(t); const proposals = f.proposalCount();
    assert.equal((await record(f)).outcome, 'recorded');
    assert.equal(f.row().message_group_membership_phase, 'learner_committed');
    assert.equal(f.proposalCount(), proposals);
  });
