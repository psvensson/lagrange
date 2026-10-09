#!/usr/bin/env python3
"""Exact-failure mutation proof; isolated checkout only, never a Solver probe.

Canonical dependencies are the default. --sqlite-driver diagnostic explicitly
selects the node:sqlite adapter; neither mode claims full production acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

RELATIVE = Path('solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009')
TEST = 'test/raft/raft-rs-backend/issued-action-recovery.test.js'
SOURCE = 'src/raft/raft-rs-committed-membership-context.js'
HISTORICAL = 'unanswered prior-term learner can commit under a new leader without reissue'
MALFORMED = 'malformed or unavailable durable evidence cannot become non-commitment'
BINDING = 'all six original context dimensions must match, not just learner role'
SNAPSHOT = 'snapshot-covered residual log bytes cannot impersonate a retained action receipt'
REOPEN = 'exact original learner evidence survives a lost reply and native reconstruction'


def refuse_probe(root):
    """Ask the repository's existing marker owner before any output or mutation."""
    uri = (root / 'src/test-helpers/probe-guard.js').as_uri()
    command = ['node', '--input-type=module', '--eval',
               'import {refuseUnderProbe} from ' + json.dumps(uri) +
               '; refuseUnderProbe("issued-action recovery diagnostic");']
    subprocess.run(command, cwd=root, check=True, timeout=10)


def error_chain(error):
    while isinstance(error, dict):
        yield error
        error = error.get('cause')


def validate_result(row, events, expected=None, test_file=TEST):
    outcomes = [e for e in events if e['type'] in ('test:pass', 'test:fail')]
    assert len(outcomes) == 8, ('wrong test count', outcomes)
    assert len({e.get('name') for e in outcomes}) == 8, 'duplicate test outcome'
    assert all(e.get('file', '').endswith(test_file) and e.get('nesting') == 0
               for e in outcomes), ('unexpected test surface', outcomes)
    assert not any(e.get('skip') or e.get('todo') for e in outcomes), 'skipped/todo test'
    summaries = [e for e in events if e['type'] == 'test:summary']
    assert summaries and all(e['counts'].get('cancelled') == 0 and
                             e['counts'].get('skipped') == 0 and
                             e['counts'].get('todo') == 0 for e in summaries), summaries
    failed = [e for e in outcomes if e['type'] == 'test:fail']
    if expected is None:
        assert row['exit'] == 0 and not failed, row
        return
    assert row['exit'] == 1 and failed, row
    # Every failure must be an assertion, not a missing dependency, setup error
    # or cancellation. The REQUIRED failure must have both the exact test name
    # and its assertion code/message in that test's error chain.
    assert all(any(error.get('code') == 'ERR_ASSERTION'
                   for error in error_chain(e.get('error'))) for e in failed), failed
    name, message = expected
    required = [e for e in failed if e.get('name') == name]
    assert len(required) == 1, ('designated test did not fail', name, failed)
    assert any(error.get('code') == 'ERR_ASSERTION' and
               message in (error.get('message') or '')
               for error in error_chain(required[0].get('error'))), required[0]


def text(value):
    return value.decode(errors='replace') if isinstance(value, bytes) else value or ''


def execute(root, output, name, command, timeout=30):
    """Always retain timeout output and an explicit non-success result."""
    started = time.perf_counter()
    timed_out = False
    try:
        process = subprocess.run(command, cwd=root, text=True, capture_output=True,
                                 timeout=timeout)
        status, stdout, stderr = process.returncode, process.stdout, process.stderr
    except subprocess.TimeoutExpired as error:
        status, stdout, stderr = 124, text(error.stdout), text(error.stderr)
        timed_out = True
    (output / (name + '.stdout.txt')).write_text(stdout)
    (output / (name + '.stderr.txt')).write_text(stderr)
    row = {'name': name, 'exit': status, 'timedOut': timed_out,
           'wallMs': round((time.perf_counter() - started) * 1000, 3), 'command': command}
    (output / (name + '.result.json')).write_text(json.dumps(row, indent=2) + '\n')
    return row


def measure(root, output, name, driver='canonical', change=None, expected=None, timeout=30,
            test_file=TEST):
    refuse_probe(root)
    output.mkdir(parents=True, exist_ok=True)
    for suffix in ['events.jsonl', 'stdout.txt', 'stderr.txt', 'result.json']:
        assert not (output / (name + '.' + suffix)).exists(), 'refuse to overwrite prior evidence'
    source = root / (change[0] if change else SOURCE)
    original = source.read_bytes()
    events_file = output / (name + '.events.jsonl')
    command = ['node', '--no-warnings']
    if driver == 'diagnostic':
        command += ['--loader', str(root / RELATIVE / 'diagnostic-loader.mjs')]
    command += ['--test', '--test-reporter=tap', '--test-reporter-destination=stdout',
                '--test-reporter=' + str(root / RELATIVE / 'failure-reporter.mjs'),
                '--test-reporter-destination=' + str(events_file), test_file]
    try:
        if change:
            _, old, replacement = change
            code = original.decode()
            assert code.count(old) == 1, (name, 'mutation target drift')
            source.write_text(code.replace(old, replacement, 1))
        row = execute(root, output, name, command, timeout)
        row['sourceSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
        events = [json.loads(line) for line in events_file.read_text().splitlines()] if events_file.exists() else []
        validate_result(row, events, expected, test_file)
        return row
    finally:
        source.write_bytes(original)
        assert source.read_bytes() == original


def campaign(root, output, driver):
    mutations = [
        ('unapplied-is-not-committed', SOURCE, 'index > window.applied ||', '',
         HISTORICAL, 'retention in a log is not applied commitment'),
        ('operation-id-binding', SOURCE,
         'MANAGED_CONTEXT_KEYS.every((key) => context[key] === action[key])',
         "MANAGED_CONTEXT_KEYS.filter((key) => key !== 'operationId').every((key) => context[key] === action[key])",
         BINDING, 'wrong original action must not obtain this learner'),
        ('snapshot-exclusion', SOURCE, 'index <= window.snapshot ||', '',
         SNAPSHOT, 'covered raw entries cannot establish which actions'),
        ('historical-terms', SOURCE, 'entryTerm > term', 'entryTerm !== term',
         HISTORICAL, 'Expected values to be strictly equal'),
        ('zero-term-context', SOURCE,
         "if (entry.term === ZERO) throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);", '',
         MALFORMED, 'malformed durable evidence must be unavailable'),
        ('omit-WAL-selection', TEST, "      db.pragma('journal_mode = WAL');", '',
         REOPEN, 'every fixture open must actually use WAL'),
        ('omit-reopen', TEST, '  c.restart(id);', '',
         REOPEN, 'reconstruction must open a new SQLite connection'),
        ('omit-close', TEST, '  c.crash(id);', '',
         REOPEN, 'reconstruction must close the previous SQLite connection'),
    ]
    results = [measure(root, output, 'positive', driver)]
    for name, path, old, replacement, test_name, message in mutations:
        results.append(measure(root, output, name, driver,
                               (path, old, replacement), (test_name, message)))
    results.append(measure(root, output, 'restored-positive', driver))
    store = 'src/raft/raft-rs-durable-store.js'
    store_test = 'test/raft/raft-rs-backend/durable-store-membership-action.test.js'
    results.append(measure(root, output, 'store-positive', driver, test_file=store_test))
    store_mutations = [
        ('progress-envelope', 'return boundary.committed <= last;', 'return true;',
         'durable progress beyond the actual retained suffix is unavailable',
         'incoherent or uncommitted record must not produce action evidence'),
        ('suffix-continuity', 'index !== last + 1n || ', '',
         'an unexplained interior log gap is unavailable',
         'incoherent or uncommitted record must not produce action evidence'),
        ('nonregressing-terms', 'term < previousTerm || ', '',
         'regressing retained entry terms are unavailable',
         'incoherent or uncommitted record must not produce action evidence'),
        ('coherent-read-snapshot', 'return this.db.transaction(() => {', 'return (() => {',
         'all record tables belong to one SQL snapshot despite an intervening committed writer',
         'one snapshot must exclude the intervening write'),
        ('legitimate-snapshot-prefix', 'if (index <= boundary.cut) continue;', '',
         'a coherent snapshot-covered prefix may be absent; no receipt is invented',
         'covered residual entries do not create receipts'),
    ]
    for name, old, replacement, test_name, message in store_mutations:
        results.append(measure(root, output, name, driver,
            (store, old, replacement), (test_name, message), test_file=store_test))
    results.append(measure(root, output, 'store-restored-positive', driver, test_file=store_test))
    (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--sqlite-driver', choices=['canonical', 'diagnostic'], default='canonical')
    args = parser.parse_args()
    root, output = args.root.resolve(), args.output.resolve()
    refuse_probe(root)
    print(json.dumps(campaign(root, output, args.sqlite_driver), indent=2))


if __name__ == '__main__':
    main()
