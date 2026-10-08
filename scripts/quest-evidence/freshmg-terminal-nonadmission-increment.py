#!/usr/bin/env python3
"""Apply a bounded FreshMG T0 increment to the exact inherited checkout.

The runner commits and measures tests before applying the source correction.
No production planner, runtime transport or CREATE gate is altered.
"""
import sys
from pathlib import Path

root = Path(sys.argv[1])
phase = sys.argv[2]


def replace(path, old, new):
    p = root / path
    s = p.read_text()
    assert s.count(old) == 1, f'{path}: exact source anchor changed'
    p.write_text(s.replace(old, new, 1))


if phase == 'tests':
    p = root / 'test/rebalancer/message-group-membership-branch-authorization.test.js'
    replace(p.relative_to(root), '  let claimWrites = 0;',
            '  let claimWrites = 0;\n  let resolutionWrites = 0;\n  let resolutionChanges = 0;')
    replace(p.relative_to(root),
            "        sql.includes('SET message_group_membership_owner_claim')) {",
            "        sql.includes('SET message_group_membership_owner_claim') ||\n        sql.includes('SET message_group_membership_lane_key')) {")
    replace(p.relative_to(root), '        else claimWrites++;',
            "        else if (sql.includes('SET message_group_membership_owner_claim')) claimWrites++;\n        else resolutionWrites++;")
    replace(p.relative_to(root), '        const answer = run(sql, params);',
            "        const answer = run(sql, params);\n        if (sql.includes('SET message_group_membership_lane_key')) {\n          resolutionChanges += answer.changes ?? 0;\n        }")
    replace(p.relative_to(root), '  }, get claimWrites() {',
            '  }, get resolutionWrites() {\n    return resolutionWrites;\n  }, get resolutionChanges() {\n    return resolutionChanges;\n  }, get claimWrites() {')
    with p.open('a') as f:
        f.write(r'''

async function settleInitial(f, repository = f.repository, identity = ENCODED_IDENTITY) {
  assert.equal(typeof repository.settleMessageGroupMembershipNonAdmission, 'function',
    'the existing repository must own terminal-first membership resolution');
  return repository.settleMessageGroupMembershipNonAdmission({operationId: O, identity});
}
function withoutResolution(row) {
  const copy = {...row};
  delete copy.message_group_membership_lane_key;
  delete copy.message_group_membership_obligation_state;
  return copy;
}

test('terminal-first NULL holder settles non-admission without creating an execution claim', async (t) => {
  const f = await setup(t, {initial: true});
  await terminal(f);
  const before = f.row();
  assert.equal((await settleInitial(f, f.repo(TARGET_NODE))).outcome, 'recorded');
  assert.equal(f.row().message_group_membership_lane_key, null);
  assert.equal(f.row().message_group_membership_obligation_state, 'definitive_non_admission');
  assert.deepEqual(withoutResolution(f.row()), withoutResolution(before));
  assert.equal(f.row().message_group_membership_owner_claim, null);
  assert.equal(f.resolutionChanges, 1);
  f.reopen();
  assert.equal((await settleInitial(f, f.repo('third-node'))).outcome, 'recorded');
  assert.equal(f.resolutionWrites, 1, 'exact replay recognizes the settled row');
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'conflict');
});

test('terminal-first concurrent settlers may observe one resolution but mutate once', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  const results = await Promise.all([settleInitial(f), settleInitial(f, f.repo(TARGET_NODE))]);
  assert.ok(results.every((r) => r.outcome === 'recorded'));
  assert.equal(f.resolutionChanges, 1);
  assert.equal(f.row().message_group_membership_owner_claim, null);
});

test('terminal-first resolver cannot settle a live operation or authorize a learner', async (t) => {
  const f = await setup(t, {initial: true}); const before = f.row();
  assert.equal((await settleInitial(f)).outcome, 'conflict');
  assert.deepEqual(f.row(), before); assert.equal(f.resolutionWrites, 0);
});

test('terminal-first existing holder must be current; expiry permits exact takeover then resolution', async (t) => {
  const f = await setup(t, {initial: true});
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  await terminal(f);
  assert.equal((await settleInitial(f, f.repo(TARGET_NODE))).outcome, 'stale_owner');
  f.clock.advance(30000);
  const next = f.repo(TARGET_NODE);
  assert.equal((await next.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  assert.equal((await settleInitial(f, next)).outcome, 'recorded');
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
});

test('terminal-first held-claim renewal defeats stale resolution without erasing the winner', async (t) => {
  const f = await setup(t, {initial: true});
  await f.repository.claimMessageGroupMembershipOwner(f.claimRequest()); await terminal(f);
  const before = f.row().message_group_membership_owner_claim;
  f.fault(async () => {
    f.clock.advance(1);
    assert.equal((await f.repository.claimMessageGroupMembershipOwner(f.claimRequest())).outcome, 'recorded');
  });
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.notEqual(f.row().message_group_membership_owner_claim, before);
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
  assert.equal((await settleInitial(f)).outcome, 'recorded');
});

test('terminal-first cannot erase an issued permit, a stamp, or a changed source', async (t) => {
  for (const [column, value] of [
    ['message_group_membership_permit', JSON.stringify(prior)],
    ['message_group_learner_stamp', JSON.stringify(learnerStamp)],
    ['message_group_voter_stamp', '{}'],
    ['message_group_removal_stamp', '{}'],
    ['source_replica_id', 'wrong-source'],
  ]) await t.test(column, async (t) => {
    const f = await setup(t, {initial: true}); await terminal(f);
    assert.equal(f.run(`UPDATE replica_operations SET ${column} = ? WHERE operation_id = ?`, [value, O]).changes, 1);
    const before = f.row();
    assert.equal((await settleInitial(f)).outcome, 'conflict');
    assert.deepEqual(f.row(), before); assert.equal(f.resolutionWrites, 0);
  });
});

test('terminal-first requires exact positive terminal time rather than a terminal-looking status', async (t) => {
  for (const completion of [null, 0, -1]) await t.test(String(completion), async (t) => {
    const f = await setup(t, {initial: true}); await terminal(f);
    f.run('UPDATE replica_operations SET completed_at = ? WHERE operation_id = ?', [completion, O]);
    assert.equal((await settleInitial(f)).outcome, 'conflict');
    assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
  });
});

test('terminal-first lost reply and unavailable read remain exact replay, not a new grant', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  f.fault('lost-and-unreadable');
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_lane_key, null);
  f.reads(true); f.reopen();
  assert.equal((await settleInitial(f)).outcome, 'recorded');
  assert.equal(f.resolutionChanges, 1); assert.equal(f.resolutionWrites, 1);
});

test('terminal-first delayed losing SQL cannot rewrite a resolved lane', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  f.fault('delayed');
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_lane_key, `message-group:${GROUP}`);
  assert.equal((await settleInitial(f, f.repo(TARGET_NODE))).outcome, 'recorded');
  assert.deepEqual(f.flush().map((r) => r.changes), [0]);
});

test('terminal-first cannot act on unavailable or changed current boot', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  assert.equal((await settleInitial(f, f.repo('missing-node'))).outcome, 'unavailable');
  f.fault(() => f.run('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [OWNER]));
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_obligation_state, 'definitive_non_admission');
});

test('terminal-first resolution permits a distinct later operation through the existing lane index', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  const old = await f.repository.queryAuthoritativeOperationById(O);
  const nextIdentity = {...JSON.parse(ENCODED_IDENTITY), operationId: 'next-operation',
    targetReplicaId: 'fresh-next-target', targetPeerId: peerOf('fresh-next-target'),
    transitionIdentity: 'next-transition'};
  const next = {...old, operationId: nextIdentity.operationId,
    replicaId: nextIdentity.targetReplicaId, createdAt: NOW + 1, updatedAt: NOW + 1,
    status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.PENDING,
    completedAt: null, stepsHistory: [], messageGroupMembershipOwnerClaim: null,
    messageGroupMembershipIdentity: JSON.stringify(nextIdentity)};
  const conflict = await f.repository.persistNewOperation(next, {returnDisposition: true});
  assert.equal(conflict.disposition, 'membership_lane_conflict');
  assert.equal((await settleInitial(f)).outcome, 'recorded');
  await f.repository.persistNewOperation(next, {returnDisposition: true});
  const admitted = await f.repository.queryAuthoritativeOperationById(next.operationId);
  assert.equal(admitted?.replicaId, next.replicaId);
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
});
''')
elif phase == 'source':
    p = 'src/rebalancer/replica-operation-message-group-membership-owner-claim.js'
    replace(p, 'function membershipRowIdentityMatches(row, identity, encodedIdentity) {',
            'function membershipRowIdentityMatches(row, identity, encodedIdentity,\n  laneKey = identity.membershipLaneKey) {')
    replace(p, '    row.messageGroupMembershipLaneKey === identity.membershipLaneKey &&',
            '    row.messageGroupMembershipLaneKey === laneKey &&')
    replace(p, 'function claimUpdate(row, next) {\n  const params = [next];\n  const fields = row.messageGroupMembershipOwnerClaim === null ?\n    [...CLAIM_FIELDS, [\'lease_expires_at\', \'ownerLeaseExpiresAt\']] : CLAIM_FIELDS;\n  const predicates = fields.map(([column, field]) => {',
            'function membershipRowWhere(row, fields = CLAIM_FIELDS) {\n  const params = [];\n  const predicates = fields.map(([column, field]) => {')
    replace(p, '  return {sql: `UPDATE replica_operations SET message_group_membership_owner_claim = ?\n    WHERE ${predicates.join(\' AND \')}`, params};\n}',
            "  return {where: predicates.join(' AND '), params};\n}\nfunction claimUpdate(row, next) {\n  const fields = row.messageGroupMembershipOwnerClaim === null ?\n    [...CLAIM_FIELDS, ['lease_expires_at', 'ownerLeaseExpiresAt']] : CLAIM_FIELDS;\n  const basis = membershipRowWhere(row, fields);\n  return {sql: `UPDATE replica_operations SET message_group_membership_owner_claim = ?\n    WHERE ${basis.where}`, params: [next, ...basis.params]};\n}")
    with (root / p).open('a') as f:
        f.write(r'''

const DEFINITIVE_NON_ADMISSION = 'definitive_non_admission';
function neverAuthorized(row) {
  return row.messageGroupMembershipPhase === INITIAL_PHASE &&
    row.messageGroupMembershipPermit === null &&
    row.messageGroupLearnerStamp === null && row.messageGroupVoterStamp === null &&
    row.messageGroupRemovalStamp === null;
}
function exactTerminal(repository, row) {
  return repository.isOperationTerminal(row) &&
    Number.isSafeInteger(row.completedAt) && row.completedAt > 0;
}
function isDefinitivelySettled(repository, row, identity, encodedIdentity) {
  return membershipRowIdentityMatches(row, identity, encodedIdentity, null) &&
    exactTerminal(repository, row) && neverAuthorized(row) &&
    row.messageGroupMembershipObligationState === DEFINITIVE_NON_ADMISSION;
}
/** Resolve never-authorized terminal intent; no new holder or external grant. */
async function settleMessageGroupMembershipNonAdmission(repository, request) {
  if (!request || typeof request !== 'object') return answer(OUTCOME.INVALID);
  const {operationId, identity: encodedIdentity} = request;
  const identity = decodeMembershipIdentity(encodedIdentity);
  if (!identity || identity.operationId !== operationId) return answer(OUTCOME.INVALID);
  if (!await membershipBootIsCurrent(repository)) return answer(OUTCOME.UNAVAILABLE);
  const before = await observeMembershipOperation(repository, operationId);
  if (!before.available) return answer(OUTCOME.UNAVAILABLE);
  const row = before.row;
  if (isDefinitivelySettled(repository, row, identity, encodedIdentity)) {
    return answer(OUTCOME.RECORDED, row);
  }
  if (!membershipRowIdentityMatches(row, identity, encodedIdentity) ||
    !exactTerminal(repository, row) || !neverAuthorized(row) ||
    row.messageGroupMembershipObligationState !== INITIAL_OBLIGATION) {
    return answer(OUTCOME.CONFLICT, row);
  }
  if (row.messageGroupMembershipOwnerClaim !== null &&
    !membershipClaimIsLocalAndLive(repository,
      decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim), identity)) {
    return answer(OUTCOME.STALE_OWNER, row);
  }
  const basis = membershipRowWhere(row);
  try {
    await repository.executeOperationMutationWithRetry(
      `UPDATE replica_operations SET message_group_membership_lane_key = NULL,
        message_group_membership_obligation_state = ? WHERE ${basis.where}`,
      [DEFINITIVE_NON_ADMISSION, ...basis.params]);
  } catch {
    // No reply cannot prove no mutation. Inspect the exact terminal row.
  }
  const after = await observeMembershipOperation(repository, operationId);
  if (!after.available || !await membershipBootIsCurrent(repository)) {
    return answer(OUTCOME.UNKNOWN);
  }
  return isDefinitivelySettled(repository, after.row, identity, encodedIdentity) ?
    answer(OUTCOME.RECORDED, after.row) : answer(OUTCOME.UNKNOWN, after.row);
}
export {settleMessageGroupMembershipNonAdmission};
''')
    p = 'src/rebalancer/replica-operation-repository.js'
    replace(p, 'import {claimMessageGroupMembershipOwner} from',
            'import {claimMessageGroupMembershipOwner, settleMessageGroupMembershipNonAdmission} from')
    s = (root / p).read_text()
    anchor = '  claimMessageGroupMembershipOwner(request) {'
    assert s.count(anchor) == 1
    addition = '''  settleMessageGroupMembershipNonAdmission(request) {
    return settleMessageGroupMembershipNonAdmission(this, request);
  }

'''
    (root / p).write_text(s.replace(anchor, addition + anchor, 1))
else:
    raise ValueError('expected tests or source')
