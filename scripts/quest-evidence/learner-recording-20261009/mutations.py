#!/usr/bin/env python3
"""Bounded recording falsifiers. Reuse PR110's process-lifetime owner/reporter."""
from pathlib import Path
from collections import Counter
import importlib.util
import hashlib
import json
import os
import subprocess
import sys

root, out = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
base = '44e968be4e2f2db03b37d8a26470fd0a3b256fee'
helper = 'solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009/'
# The surrounding workflow already invokes the canonical probe refusal before
# output creation. This script also refuses before loading execution helpers.
subprocess.run(['node', '--input-type=module', '-e',
    "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('learner recording mutations');"],
    cwd=root, check=True, timeout=5)
out.mkdir(parents=True, exist_ok=True)
for name in ['run-diagnostic.py', 'report-diagnostic.mjs']:
    data = subprocess.check_output(['git', 'show', base + ':' + helper + name], cwd=root)
    (out / name).write_bytes(data)
spec = importlib.util.spec_from_file_location('owned_recording_measurement', out / 'run-diagnostic.py')
owner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owner)
source = root / 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
original = source.read_bytes()
file = root / 'test/integration/message-group-learner-runtime-authorization.integration.test.js'
command = ['node', '--no-warnings', '--test', '--test-reporter=' + str(out / 'report-diagnostic.mjs'), str(file)]
summary = []
expected_tests = None


def run(name, changed=None, required=None):
    global expected_tests
    row, stdout = owner.execute(root, out, name, command, source, original, changed, timeout=45)
    events = owner.parse_events(stdout)
    assert not row['timedOut'] and row['cleanupComplete'] is True, row
    tests = [e for e in events if e['type'] in ('test:pass', 'test:fail')]
    identities = Counter((e['name'], e.get('nesting')) for e in tests)
    if expected_tests is None:
        assert required is None and row['exit'] == 0
        expected_tests = identities
    assert identities == expected_tests, 'test selection or completion changed'
    for e in tests:
        assert Path(e.get('file', '')).resolve() == file
        assert not e.get('skip') and not e.get('todo')
    totals = [e for e in events if e['type'] == 'test:summary' and e.get('file') is None]
    assert len(totals) == 1
    counts = totals[0]['counts']
    assert counts['tests'] == len(tests)
    assert counts['cancelled'] == counts['skipped'] == counts['todo'] == 0
    failures = [e for e in tests if e['type'] == 'test:fail']
    assert counts['failed'] == len(failures)
    if required is None:
        assert row['exit'] == 0 and not failures and totals[0]['success'] is True
    else:
        assert row['exit'] == 1 and totals[0]['success'] is False
        leaves = [e for e in failures if e.get('failureType') != 'subtestsFailed']
        assert leaves
        for e in leaves:
            assert e.get('failureType') == 'testCodeFailure' and e.get('assertionCode') == 'ERR_ASSERTION', e
        found = [e for e in leaves if e['name'] == required[0]]
        assert len(found) == 1, (name, 'required test did not fail', leaves)
        assert required[1] in found[0].get('assertionMessage', ''), found
    row.update(accepted=True, requiredFailure=required, counts=counts)
    summary.append(row)
    (out / 'mutation-results.json').write_text(json.dumps(summary, indent=2) + '\n')
    assert source.read_bytes() == original


run('positive')
raw = original.decode()
old = '    JSON.stringify(origin.context) === JSON.stringify(query.action) &&\n'
assert raw.count(old) == 1
run('original-action', raw.replace(old, '').encode(), (
    'wrong action or inconsistent observation cannot advance the operation',
    'wrong action or incoherent native evidence must refuse recording'))
old = 'async function recordObservedLearner(repository, row, input, evidence) {\n  const basis = membershipRowWhere(row);'
assert raw.count(old) == 1
new = old + '''
  const holderPredicate = 'message_group_membership_owner_claim = ?';
  const prefix = basis.where.split(holderPredicate)[0];
  basis.params.splice((prefix.match(/\\?/gu) || []).length, 1);
  basis.where = basis.where.replace(' AND ' + holderPredicate, '');'''
run('exact-holder-cas', raw.replace(old, new).encode(), (
    'holder changes at the actual CAS cannot be overwritten',
    'old holder must not overwrite the successor row'))
start = raw.index('async function recordObservedLearner(')
end = raw.index('function finishLearnerRecording(', start)
section = raw[start:end]
old = 'if (!after.available) return result(OUTCOME.UNKNOWN);'
assert section.count(old) == 1
changed = raw[:start] + section.replace(old, 'if (!after.available) return result(OUTCOME.RECORDED);') + raw[end:]
run('unavailable-is-not-recorded', changed.encode(), (
    'unknown readback keeps debt and exact replay recovers without native redispatch',
    'unavailable authoritative readback must not report recording'))
run('restored-positive')
assert source.read_bytes() == original
(out / 'source-restored.sha256').write_text(hashlib.sha256(original).hexdigest() + '\n')
print(json.dumps(summary, indent=2))
