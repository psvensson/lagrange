from pathlib import Path
import importlib.util
import json
import os
import subprocess

root = Path.cwd(); out = Path(os.environ['PROOF_OUT'])
helper = out / 'owned-process.py'; reporter = out / 'report-diagnostic.mjs'
pinned = '44e968be4e2f2db03b37d8a26470fd0a3b256fee'
base = 'solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009/'
for file, name in [(helper, 'run-diagnostic.py'), (reporter, 'report-diagnostic.mjs')]:
    file.write_bytes(subprocess.check_output(['git', 'show', pinned + ':' + base + name]))
spec = importlib.util.spec_from_file_location('owned_process', helper)
owned = importlib.util.module_from_spec(spec); spec.loader.exec_module(owned)
owned.refuse_under_probe(root)
source = root / 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
process_test = root / 'test/integration/message-group-learner-process-loss.integration.test.js'
consumer = 'test/integration/message-group-learner-runtime-authorization.integration.test.js'
name = 'native refusal classifications retain conflict versus unavailability'
message = 'typed permanent native refusal must not become retryable unavailability'
mutations = [
    ('permanent-is-not-unavailable', source,
     'null : OUTCOME.CONFLICT;\n}\nfunction learnerWitnessUnavailable',
     'null : OUTCOME.UNAVAILABLE;\n}\nfunction learnerWitnessUnavailable',
     consumer, [name], message),
    ('unavailable-witness-is-not-conflict', source,
     '    if (learnerWitnessUnavailable(observed.membership)) return {refusal: OUTCOME.UNAVAILABLE};',
     '', consumer, [name], message),
    ('wrong-signal-is-not-sigkill', process_test,
     "process.kill(-child.pid, 'SIGKILL')", "process.kill(-child.pid, 'SIGTERM')",
     str(process_test.relative_to(root)), ['pending', 'ordinary-failed', 'record-answer-lost'],
     'a graceful exit is not process-loss evidence'),
]
results = []
for label, target, before, after, test, required, assertion in mutations:
    original = target.read_bytes(); text = original.decode()
    assert text.count(before) == 1, (label, 'mutation anchor drift')
    command = ['node', '--test', '--test-reporter=' + str(reporter), test]
    row, stdout = owned.execute(root, out, label, command, target, original,
                                text.replace(before, after).encode(), timeout=35)
    events = owned.parse_events(stdout)
    assert row['exit'] == 1 and not row['timedOut'] and row['cleanupComplete'], row
    summaries = [e for e in events if e['type'] == 'test:summary' and e.get('file') is None]
    assert len(summaries) == 1
    totals = summaries[0]['counts']
    assert totals['cancelled'] == totals['skipped'] == totals['todo'] == 0
    failures = [e for e in events if e['type'] == 'test:fail' and e.get('nesting') == 1]
    assert sorted(e['name'] for e in failures) == sorted(required), (label, failures)
    for failure in failures:
        assert Path(failure['file']).resolve() == (root / test).resolve()
        assert failure['failureType'] == 'testCodeFailure' and failure['assertionCode'] == 'ERR_ASSERTION'
        assert assertion in failure['assertionMessage'], failure
    assert target.read_bytes() == original
    row.update({'intendedAssertionsFailed': True, 'requiredTests': required, 'assertion': assertion})
    results.append(row)
(out / 'mutations.json').write_text(json.dumps(results, indent=2) + '\n')
