#!/usr/bin/env python3
"""Isolated diagnostic only; normal dependencies/runner remain the acceptance gate.

The caller must use a disposable checkout. Every temporary source mutation is
restored, including timeout/attribution failure. Probe refusal precedes output
creation. Per-test events, not arbitrary stdout text, establish each negative.
"""
import argparse
from collections import Counter
import hashlib
import json
import os
import signal
from pathlib import Path
import subprocess
import sys
import time

RELATIVE = Path('solve/quests/message-group-fresh-identity-membership/evidence/'
                'issued-action-recovery-20261009')
TEST = 'test/raft/raft-rs-backend/issued-action-recovery.test.js'
SOURCE = 'src/raft/raft-rs-committed-membership-context.js'
EXPECTED_TESTS = (
    'exact original learner evidence survives a lost reply and native reconstruction',
    'unanswered prior-term learner can commit under a new leader without reissue',
    'an isolated unanswered learner may instead be overwritten: absence stays unresolved',
    'all six original context dimensions must match, not just learner role',
    'malformed or unavailable durable evidence cannot become non-commitment',
    'configuration without action history cannot authorize recovery by guess',
    'historical ADD evidence is not current CREATE eligibility after actual REMOVE',
    'snapshot-covered residual log bytes cannot impersonate a retained action receipt',
)


def refuse_under_probe(root: Path) -> None:
    """Ask the existing JS owner; do not copy its environment policy in Python."""
    script = ("import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; "
              "refuseUnderProbe('the issued-action diagnostic');")
    result = subprocess.run(['node', '--input-type=module', '-e', script],
                            cwd=root, capture_output=True, text=True, timeout=5)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or 'probe guard unavailable')


def text(value) -> str:
    return value.decode('utf-8', errors='replace') if isinstance(value, bytes) else value or ''


def parse_events(stdout: str) -> list[dict]:
    events = []
    for line in stdout.splitlines():
        event = json.loads(line)
        if not isinstance(event, dict) or 'type' not in event:
            raise ValueError('invalid structured test event')
        events.append(event)
    return events


def accept_measurement(row: dict, events: list[dict], expected_file: Path,
                       failure: tuple[str, str] | None = None,
                       expected_tests: tuple[str, ...] = EXPECTED_TESTS) -> None:
    """A failure must be the named test's real assertion, never an incidental red."""
    assert not row['timedOut'], 'timeout is not negative proof'
    tests = [event for event in events if event['type'] in ('test:pass', 'test:fail')]
    assert Counter(event.get('name') for event in tests) == Counter(expected_tests), \
        'selected test identities differ'
    for event in tests:
        assert Path(event.get('file', '')).resolve() == expected_file.resolve(), \
            'test event belongs to another file'
        assert event.get('nesting') == 0, 'unexpected nested test'
        assert not event.get('skip') and not event.get('todo'), 'unexercised test'
    totals = [event for event in events if event['type'] == 'test:summary' and
              event.get('file') is None]
    assert len(totals) == 1, 'missing or repeated complete-run summary'
    counts = totals[0]['counts']
    failures = [event for event in tests if event['type'] == 'test:fail']
    assert counts['tests'] == len(expected_tests)
    assert counts['cancelled'] == counts['skipped'] == counts['todo'] == 0
    assert counts['failed'] == len(failures)
    assert counts['passed'] == len(tests) - len(failures)
    if failure is None:
        assert row['exit'] == 0 and not failures and totals[0]['success'] is True
        return
    assert row['exit'] == 1 and totals[0]['success'] is False
    # No setup/import/cancellation failure may masquerade as a mutation catch.
    for event in failures:
        assert event.get('failureType') == 'testCodeFailure'
        assert event.get('assertionCode') == 'ERR_ASSERTION'
    name, assertion = failure
    matching = [event for event in failures if event.get('name') == name]
    assert len(matching) == 1, 'required test did not fail'
    assert assertion in matching[0].get('assertionMessage', ''), \
        'wrong assertion failed in required test'


def execute(root: Path, output: Path, name: str, command: list[str],
            source: Path, original: bytes, changed: bytes | None = None,
            timeout: float = 30) -> tuple[dict, str]:
    """Own the worker group until streams are drained, before restoring source.

    The diagnostic runs on POSIX workers. Ordinary Node test descendants inherit
    this private process group; deliberately detached hostile children are not
    part of its trust model. A cleanup failure stops the measurement campaign.
    """
    if os.name != 'posix':
        raise RuntimeError('diagnostic process-group ownership requires POSIX')
    assert source.read_bytes() == original, 'source changed outside this measurement'
    started = time.perf_counter()
    stdout = stderr = ''
    process = None
    row = {'name': name, 'command': command, 'exit': None, 'timedOut': False,
           'cleanupComplete': False}
    try:
        if changed is not None:
            source.write_bytes(changed)
        row['sourceSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
        process = subprocess.Popen(command, cwd=root, text=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=True)
        row['processGroupId'] = process.pid
        try:
            stdout, stderr = process.communicate(timeout=timeout)
            row['exit'] = process.returncode
        except subprocess.TimeoutExpired as error:
            stdout, stderr = text(error.stdout), text(error.stderr)
            row['timedOut'] = True
        finally:
            # Kill this measurement's group even if its leader exited first.
            # Never target the caller's group, another test, or a guessed PID.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                stdout, stderr = process.communicate(timeout=5)
                row['exit'] = process.returncode
                row['cleanupComplete'] = True
            except subprocess.TimeoutExpired as error:
                stdout, stderr = text(error.stdout), text(error.stderr)
                row['cleanupError'] = 'owned process streams did not close after group termination'
                process.stdout.close()
                process.stderr.close()
                process.wait(timeout=5)
                raise RuntimeError(row['cleanupError']) from error
        return row, stdout
    finally:
        row['wallMs'] = round((time.perf_counter() - started) * 1000, 3)
        try:
            (output / (name + '.stdout.txt')).write_text(stdout)
            (output / (name + '.stderr.txt')).write_text(stderr)
            (output / (name + '.result.json')).write_text(json.dumps(row, indent=2) + '\n')
        finally:
            source.write_bytes(original)

def measure(root: Path, output: Path, name: str, command: list[str], source: Path,
            original: bytes, changed: bytes | None = None,
            failure: tuple[str, str] | None = None) -> dict:
    row, stdout = execute(root, output, name, command, source, original, changed)
    row['accepted'] = False
    try:
        events = parse_events(stdout)
        accept_measurement(row, events, root / TEST, failure)
        row['accepted'] = True
        row['requiredFailure'] = failure
        return row
    finally:
        (output / (name + '.result.json')).write_text(json.dumps(row, indent=2) + '\n')


def test_command(root: Path, normal_sqlite: bool = False) -> list[str]:
    command = ['node', '--no-warnings']
    if not normal_sqlite:
        command += ['--loader', str(root / RELATIVE / 'diagnostic-loader.mjs')]
    return command + ['--test',
        '--test-reporter=' + str(root / RELATIVE / 'report-diagnostic.mjs'), TEST]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--normal-sqlite', action='store_true',
                        help='use locked better-sqlite3 without the diagnostic loader')
    args = parser.parse_args()
    root, output = args.root.resolve(), args.output.resolve()
    refuse_under_probe(root)  # Must precede mkdir, reading mutation bytes, or fixture work.
    source = root / SOURCE
    original = source.read_bytes()
    output.mkdir(parents=True, exist_ok=True)
    command = test_command(root, normal_sqlite=args.normal_sqlite)
    results = []
    mutations = [
        ('unapplied-is-not-committed', 'index > window.applied ||', '', EXPECTED_TESTS[1],
         'retention in a log is not applied commitment'),
        ('operation-id-binding', 'MANAGED_CONTEXT_KEYS.every((key) => context[key] === action[key])',
         "MANAGED_CONTEXT_KEYS.filter((key) => key !== 'operationId').every((key) => context[key] === action[key])",
         EXPECTED_TESTS[3], 'wrong original action must not obtain this learner'),
        ('snapshot-exclusion', 'index <= window.snapshot ||', '', EXPECTED_TESTS[7],
         'covered raw entries cannot establish which actions the installed image contains'),
        ('historical-terms', 'entryTerm > term', 'entryTerm !== term', EXPECTED_TESTS[1],
         'the exact durable applied action must yield a historical receipt'),
        ('zero-term-context',
         "if (entry.term === RAFT_RS_ZERO_INDEX) {\n"
         "        throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);\n      }",
         '', EXPECTED_TESTS[4], 'malformed durable evidence must not yield a receipt'),
    ]
    try:
        results.append(measure(root, output, 'positive', command, source, original))
        for name, old, new, test_name, assertion in mutations:
            raw = original.decode()
            assert raw.count(old) == 1, (name, 'mutation target drift')
            results.append(measure(root, output, name, command, source, original,
                                   raw.replace(old, new).encode(), (test_name, assertion)))
        results.append(measure(root, output, 'restored-positive', command, source, original))
        assert source.read_bytes() == original
    finally:
        (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, AssertionError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
