#!/usr/bin/env python3
"""Deterministic, exact-base T1 preparation; never permission to land."""
from pathlib import Path
import hashlib
import json
import sys

mode, root_arg = sys.argv[1:]
root = Path(root_arg)
source = root / 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
test = root / 'test/rebalancer/message-group-membership-branch-authorization.test.js'


def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def replace_once(text, before, after):
    assert text.count(before) == 1, repr(before)
    return text.replace(before, after, 1)


if mode == 'test':
    assert blob(source.read_bytes()) == '50f0e012d79f41076eee805d0cc5d3d82781c0a6'
    assert blob(test.read_bytes()) == 'ded10abe3b4049508283c18042dfe20b8b66b481'
    addition = Path(__file__).with_name('t1-tests.append.js').read_text()
    assert 'T1 terminal learner selects exact target abandonment' not in test.read_text()
    test.write_text(test.read_text() + addition)
elif mode == 'source':
    assert blob(source.read_bytes()) == '50f0e012d79f41076eee805d0cc5d3d82781c0a6'
    text = source.read_text()
    text = replace_once(text, 'const SQL = `UPDATE replica_operations SET', '''// An existing membership obligation can outlive ordinary operation settlement.
// Only pre-promotion target abandonment may be newly selected after settlement;
// the exact completion timestamp joins the same operation-row CAS, never a new lane.
function branchSettlementGuard(repository, row, spec) {
  if (!repository.isOperationTerminal(row)) {
    return row.completedAt === null ? {sql: 'completed_at IS NULL', params: []} : null;
  }
  if (spec.phase !== PHASE.TARGET_REMOVAL_IN_FLIGHT ||
    !Number.isSafeInteger(row.completedAt) || row.completedAt <= 0) return null;
  return {sql: 'completed_at = ?', params: [row.completedAt]};
}
const branchSelectionSql = (settlement) => `UPDATE replica_operations SET''')
    text = replace_once(text,
        'AND status = ? AND workflow_step = ? AND completed_at IS NULL',
        'AND status = ? AND workflow_step = ? AND ${settlement.sql}')
    text = replace_once(text,
        '  if (repository.isOperationTerminal(row) || row.completedAt !== null ||',
        '  const settlement = branchSettlementGuard(repository, row, spec);\n  if (!settlement ||')
    text = replace_once(text,
        '    row.workflowStep, PHASE.LEARNER_COMMITTED, priorPermit,',
        '    row.workflowStep, ...settlement.params, PHASE.LEARNER_COMMITTED, priorPermit,')
    text = replace_once(text,
        '    await repository.executeOperationMutationWithRetry(SQL, params);',
        '    await repository.executeOperationMutationWithRetry(branchSelectionSql(settlement), params);')
    source.write_text(text)
elif mode in ('mutant-completion', 'mutant-promotion', 'mutant-holder'):
    text = source.read_text()
    changes = {
        'mutant-completion': ("{sql: 'completed_at = ?', params: [row.completedAt]}",
                              "{sql: '1 = 1', params: []}"),
        'mutant-promotion': ('spec.phase !== PHASE.TARGET_REMOVAL_IN_FLIGHT ||', 'false ||'),
        'mutant-holder': ('AND message_group_membership_owner_claim = ?', 'AND ? IS NOT NULL'),
    }
    source.write_text(replace_once(text, *changes[mode]))
else:
    raise SystemExit('unknown mode')
print(json.dumps({'mode': mode, 'sourceBlob': blob(source.read_bytes()),
    'testBlob': blob(test.read_bytes())}))
