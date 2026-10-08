#!/usr/bin/env python3
"""Bounded PR106 correction, tests measured before the shared observer changes."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
phase = sys.argv[2]
if phase == 'tests':
    p = root / 'test/rebalancer/message-group-membership-branch-authorization.test.js'
    s = p.read_text()
    old = '  let failReads = false;'
    assert s.count(old) == 1
    s = s.replace(old, old + '\n  let returnOperationReadFailure = false;', 1)
    old = "      if (failReads) throw new Error('injected owner read unavailable');"
    assert s.count(old) == 2
    new = """      if (returnOperationReadFailure && _table === 'replica_operations') {
        return {success: false, error: 'injected returned operation-read failure'};
      }
""" + old
    s = s.replace(old, new)
    old = '  reads: (available) => {\n    failReads = !available;\n  },'
    assert s.count(old) == 1
    s = s.replace(old, old + '\n  operationReads: (available) => {\n    returnOperationReadFailure = !available;\n  },', 1)
    s += r'''

test('returned operation-read failure is unavailable for claim, selection and settlement', async (t) => {
  for (const mode of ['claim', 'select', 'settle']) {
    await t.test(mode, async (t) => {
      const f = await setup(t, {initial: mode !== 'select'});
      if (mode === 'settle') await terminal(f);
      const before = f.row();
      f.operationReads(false); // nodes/boot still read from actual fixture SQL
      let answer;
      if (mode === 'claim') answer = await f.repository.claimMessageGroupMembershipOwner(f.claimRequest());
      else if (mode === 'select') answer = await f.repository.selectMessageGroupMembershipBranch(request());
      else answer = await settleInitial(f);
      assert.equal(answer.outcome, 'unavailable', 'no row observed is not a row conflict');
      assert.deepEqual(f.row(), before);
      assert.equal(f.claimWrites + f.writes + f.resolutionWrites, 0);
    });
  }
});

test('confirmed empty operation remains a conflict rather than unavailable', async (t) => {
  const f = await setup(t, {initial: true});
  const input = f.claimRequest();
  assert.equal(f.run('DELETE FROM replica_operations WHERE operation_id = ?', [O]).changes, 1);
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(input)).outcome, 'conflict');
  assert.equal((await settleInitial(f)).outcome, 'conflict');
  assert.equal(f.claimWrites + f.resolutionWrites, 0);
});

test('returned read failure after terminal resolution stays unknown until exact replay', async (t) => {
  const f = await setup(t, {initial: true}); await terminal(f);
  f.fault(() => f.operationReads(false));
  assert.equal((await settleInitial(f)).outcome, 'unknown');
  assert.equal(f.row().message_group_membership_obligation_state, 'definitive_non_admission');
  assert.equal(f.row().message_group_membership_lane_key, null);
  f.operationReads(true); f.reopen();
  assert.equal((await settleInitial(f)).outcome, 'recorded');
  assert.equal(f.resolutionChanges, 1);
});
'''
    p.write_text(s)
elif phase == 'source':
    p = root / 'src/rebalancer/replica-operation-message-group-membership-owner-claim.js'
    s = p.read_text()
    old = '''    const row = await repository.queryAuthoritativeOperationById(operationId, READ);
    return {available: true, row};'''
    new = '''    const observation = await repository.queryAuthoritativeOperationVisibilityObservation(
      operationId, {...READ, requireAbsenceConfirmation: true});
    return {available: observation.deferredOutcome === null,
      row: observation.operation};'''
    assert s.count(old) == 1, 'exact observer changed; do not guess'
    p.write_text(s.replace(old, new, 1))
else:
    raise ValueError('expected tests or source')
