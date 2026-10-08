#!/usr/bin/env python3
"""Bounded test-first correction for PR #107; mutate only named existing owners."""
from pathlib import Path
import hashlib
import sys

root = Path(sys.argv[1]).resolve()
mode = sys.argv[2]
source = root / 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
unit = root / 'test/rebalancer/message-group-membership-branch-authorization.test.js'
cache = root / 'test/integration/message-group-membership-claim-cache.integration.test.js'

def read_exact(path, expected):
    raw = path.read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert actual == expected, f'Unexpected source identity: {path}: {actual}'
    return raw.decode()

def once(text, old, new):
    assert text.count(old) == 1, repr(old)
    return text.replace(old, new, 1)

if mode == 'tests':
    read_exact(source, '26887591ac88517db655262b21a1e348bc342483')
    text = read_exact(unit, '9009aaae31a5452b54ff3d25f236084db2eddd3e')
    text += r'''

// Review 4219025228: successful source retirement is not failed learner debt.
// Supply a contradictory retained learner hint deliberately. Never authorize
// another target REMOVE from successful or mixed ordinary terminal facts.
async function writeSettlementFixture(f, status, workflowStep) {
  assert.equal(f.run('UPDATE replica_operations SET status = ?, workflow_step = ?, ' +
    'completed_at = ? WHERE operation_id = ?', [status, workflowStep, NOW + 1, O]).changes, 1);
}

test('T1 successful REMOVED replacement refuses target abandonment across reopen', async (t) => {
  const f = await setup(t);
  await writeSettlementFixture(f, ReplicaStatus.REMOVED, WORKFLOW_STEP.REMOVED);
  const before = f.row();
  for (const reopen of [false, true]) {
    if (reopen) f.reopen();
    assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
      .outcome, 'conflict', 'successful replacement must never authorize target abandonment');
    assert.equal((await f.repository.selectMessageGroupMembershipBranch(request()))
      .outcome, 'conflict');
    assert.deepEqual(f.row(), before, 'successful row and retained debt stay unchanged');
    assert.equal(f.writes, 0, 'refusal precedes every membership mutation');
  }
});

test('T1 only exact FAILED status and step may select terminal abandonment', async (t) => {
  for (const [status, step] of [
    [ReplicaStatus.REMOVED, WORKFLOW_STEP.FAILED],
    [ReplicaStatus.FAILED, WORKFLOW_STEP.REMOVED],
    [ReplicaStatus.PENDING, WORKFLOW_STEP.FAILED],
    [ReplicaStatus.FAILED, WORKFLOW_STEP.PENDING],
  ]) {
    await t.test(`${status}/${step}`, async (t) => {
      const f = await setup(t);
      await writeSettlementFixture(f, status, step);
      const before = f.row();
      assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
        .outcome, 'conflict', 'inconsistent terminal facts are not failed-learner authority');
      assert.deepEqual(f.row(), before);
      assert.equal(f.writes, 0);
    });
  }
});

test('T1 success racing the failed-row CAS cannot receive target removal intent', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.fault(() => writeSettlementFixture(f, ReplicaStatus.REMOVED, WORKFLOW_STEP.REMOVED));
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unknown', 'changed ordinary state defeats the stale abandonment CAS');
  assert.equal(f.row().status, ReplicaStatus.REMOVED);
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.REMOVED);
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  assert.equal(f.row().message_group_membership_permit, JSON.stringify(prior));
});

test('T1 a delayed failed-row abandonment cannot apply after success is observed', async (t) => {
  const f = await setup(t);
  await terminal(f);
  f.fault('delayed');
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'unknown');
  await writeSettlementFixture(f, ReplicaStatus.REMOVED, WORKFLOW_STEP.REMOVED);
  const successful = f.row();
  assert.deepEqual(f.flush().map((answer) => answer.changes), [0]);
  f.reopen();
  assert.equal((await f.repository.selectMessageGroupMembershipBranch(request('abort_learner')))
    .outcome, 'conflict');
  assert.deepEqual(f.row(), successful);
});
'''
    reply = """        if (action === 'lost-and-unreadable') failReads = true;
        if (action === 'lost' || action === 'lost-and-unreadable') {
          return {success: false, error: 'authorization result lost'};
        }
        return answer;"""
    text = once(text, reply, '        return faultedMembershipWriteAnswer(action, answer);')
    text = once(text, '  const gateway = {', """  function faultedMembershipWriteAnswer(action, answer) {
    if (action === 'lost-and-unreadable') failReads = true;
    if (action === 'lost' || action === 'lost-and-unreadable') {
      return {success: false, error: 'authorization result lost'};
    }
    return answer;
  }
  const gateway = {""")
    unit.write_text(text)
    text = read_exact(cache, '4f2b5f11058d08c0a27627aabcde724db3eca179')
    old = "test('repository claim and T1 terminal abandonment reach real SystemTableCache',"
    start = text.index(old)
    head, body = text[:start], text[start:]
    body = once(body, old,
        'test(`repository claim and ${settlement.status} T1 boundary reach real SystemTableCache`,')
    body = once(body, 'status: ReplicaStatus.FAILED, workflowStep: WORKFLOW_STEP.FAILED,',
        'status: settlement.status, workflowStep: settlement.step,')
    body = once(body, 'status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED,',
        'status: settlement.status, workflow_step: settlement.step,')
    anchor = "      assert.equal(selected.outcome, 'recorded', 'T1 must record exact terminal abandonment');"
    negative = """      if (settlement.status === ReplicaStatus.REMOVED) {
        assert.equal(selected.outcome, 'conflict',
          'live successful replacement must never authorize target abandonment');
        assert.equal(writes.length, writesBefore, 'success refusal performs no membership write');
        const current = await repository.queryAuthoritativeOperationById(id);
        assert.equal(current.status, ReplicaStatus.REMOVED);
        assert.equal(current.workflowStep, WORKFLOW_STEP.REMOVED);
        assert.equal(current.messageGroupMembershipPermit, JSON.stringify(prior));
        assert.equal(current.messageGroupMembershipPhase, 'learner_committed');
        assert.equal(current.messageGroupMembershipLaneKey, `message-group:${group}`);
        assert.deepEqual(cache.get(TABLE, id), terminalBefore);
        assert.equal(cache.getAll('services').some((row) => row.group_id === group), false);
        mark('successful-replacement-protected');
        return;
      }
"""
    body = once(body, anchor, negative + anchor)
    body = once(body,
        '        leaderTerm: 3, leaderConfigurationStamp: {configurationKey: raftRsConfStateKey(sourceOnly),',
        '        leaderTerm: 3, leaderConfigurationStamp: {\n'
        '          configurationKey: raftRsConfStateKey(sourceOnly),')
    # Two ordinary tests, not a runtime flag; each fully boots and tears down.
    cases = """for (const settlement of [
  {status: ReplicaStatus.FAILED, step: WORKFLOW_STEP.FAILED},
  {status: ReplicaStatus.REMOVED, step: WORKFLOW_STEP.REMOVED},
]) {
"""
    cache.write_text(head + cases + ''.join('  '+line if line.strip() else line
        for line in body.splitlines(keepends=True)) + '}\n')
    print('Test-first: exact successful/failed terminal decision, mixed states and delayed CAS.')
elif mode == 'fix':
    text = read_exact(source, '26887591ac88517db655262b21a1e348bc342483')
    text = once(text, "import {committedStampOfAnswer}",
        "import {WORKFLOW_STEP} from '../constants/workflow.js';\n"
        "import {ReplicaStatus} from './replica-status.js';\n"
        "import {committedStampOfAnswer}")
    text = once(text,
        '// Only pre-promotion target abandonment may be newly selected after settlement;',
        '// Only exact failed settlement may newly select pre-promotion target abandonment;')
    text = once(text, '  if (spec.phase !== PHASE.TARGET_REMOVAL_IN_FLIGHT ||\n',
        '  if (row.status !== ReplicaStatus.FAILED || row.workflowStep !== WORKFLOW_STEP.FAILED ||\n'
        '    spec.phase !== PHASE.TARGET_REMOVAL_IN_FLIGHT ||\n')
    source.write_text(text)
    print('Only exact FAILED/FAILED may newly select terminal abandonment; SQL CAS unchanged.')
elif mode == 'mutant-status':
    source.write_text(once(source.read_text(), 'row.status !== ReplicaStatus.FAILED || ', ''))
elif mode == 'mutant-step':
    source.write_text(once(source.read_text(), 'row.workflowStep !== WORKFLOW_STEP.FAILED ||\n    ', ''))
elif mode == 'mutant-sql':
    source.write_text(once(source.read_text(), 'AND status = ? AND workflow_step = ?',
        'AND (? IS NOT NULL) AND (? IS NOT NULL)'))
else:
    raise SystemExit('Unsupported bounded action')
