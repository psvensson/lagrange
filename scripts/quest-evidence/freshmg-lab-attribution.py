#!/usr/bin/env python3
"""Bounded deterministic attribution; never changes source or redefines acceptance."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

BASE = '97a030da287160e5597f0dd5ce5d60541caaf5e8'
CANDIDATE = '605789e86aaf7dcca8fa4406235388b998460eb0'
FILES = [
    'test/node/message-group-service-handler-membership.test.js',
    'test/rebalancer/spread-cure-transition-authorization-row.test.js',
    'test/rebalancer/message-group-membership-change-parked.test.js',
    'test/raft/raft-rs-backend/operation-port-regression.test.js',
    'test/raft/raft-rs-backend/peer-identity.test.js',
    'test/raft/raft-rs-backend/evidence-o1-static.test.js',
    'test/raft/raft-rs-backend/evidence-o1-restart-equivalence.test.js',
    'test/rebalancer/rebalance-coordinator-outcome-routing.test.js',
    'test/scripts/rule-set-revision.test.js',
    'test/query/partition-write-answer-consumers.test.js',
    'test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js',
    'test/rebalancer/rebalance-coordinator-operation-ownership.test.js',
    'test/scripts/steering-diet.test.js',
    'test/raft/raft-rs-backend/operation-port-boundary.test.js',
    'test/raft/raft-rs-backend/committed-membership-census.test.js',
    'test/rebalancer/replica-operation-membership-epoch-binding.test.js',
    'test/rebalancer/replace-replica-workflow.test.js',
]
DEFERRED = [
    'test/bootstrap/fresh-join-registration-runtime-replacement.integration.test.js',
    'test/bootstrap/phase-failure-handling.property.test.js',
    'test/integration/insert-or-ignore-raft-replay.integration.test.js',
    'test/integration/raft-leader-election.integration.test.js',
    'test/integration/seed-owner-read-diagnosis.integration.test.js',
    'test/integration/node-join-replica-activation.integration.test.js',
]


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root).decode().strip()


def measure(root, sha, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    assert git(root, 'rev-parse', 'HEAD') == sha
    assert git(root, 'status', '--porcelain') == ''
    assert all((root / name).is_file() for name in FILES)
    ledger = root / 'test-output/reports/test-results.ndjson'
    assert not ledger.exists(), 'fresh result ledger required; never consume old results'
    command = ['npm', 'run', 'test:file', '--', *FILES]
    (output / 'command.json').write_text(json.dumps(command, indent=2) + '\n')
    source = {'commit': sha, 'srcTree': git(root, 'rev-parse', 'HEAD:src'),
              'testBlobs': {f: git(root, 'rev-parse', 'HEAD:' + f) for f in FILES},
              'lockfileSha256': hashlib.sha256((root / 'package-lock.json').read_bytes()).hexdigest()}
    (output / 'source.json').write_text(json.dumps(source, indent=2) + '\n')
    env = os.environ.copy()
    env.pop('LAGRANGE_RETRY_FAILED_ONCE', None)
    start = time.monotonic()
    with (output / 'stdout.txt').open('wb') as out, (output / 'stderr.txt').open('wb') as err:
        code = subprocess.run(command, cwd=root, env=env, stdout=out, stderr=err, check=False).returncode
    (output / 'exit.txt').write_text(str(code) + '\n')
    rows = [json.loads(line) for line in ledger.read_text().splitlines() if line.strip()] if ledger.exists() else []
    selected = [r for r in rows if r.get('file') in FILES]
    assert len(selected) == len(FILES) and {r['file'] for r in selected} == set(FILES), 'missing/duplicate selected results'
    assert all(r.get('attempt') == 1 and r.get('retriedOnce') is False for r in selected), 'unexpected retry'
    assert code in (0, 1), 'runner infrastructure/usage failure is not product attribution'
    shutil.copyfile(ledger, output / 'test-results.ndjson')
    for name in FILES:
        retained = root / '.tap/test-results' / (name + '.tap')
        if retained.exists():
            target = output / 'tap' / (name + '.tap')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(retained, target)
    status = git(root, 'status', '--porcelain')
    (output / 'final-status.txt').write_text(status + ('\n' if status else ''))
    assert not status, 'measurement changed tracked source or left untracked content'
    summary = {'schema': 'freshmg-lab-attribution-measurement/1', 'sha': sha,
               'durationSeconds': round(time.monotonic() - start, 3),
               'exitCode': code, 'selected': selected, 'sourceChanged': False,
               'proofCeiling': 'same 17 selected files on one GCP runner, not original lab reproduction or cluster proof'}
    (output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({'sha': sha, 'exitCode': code, 'pass': sum(r['ok'] for r in selected),
                      'fail': sum(not r['ok'] for r in selected)}, indent=2))


def compare(root):
    root = Path(root)
    records = [json.loads((root / name / 'summary.json').read_text()) for name in ('base', 'candidate')]
    assert [r['sha'] for r in records] == [BASE, CANDIDATE]
    maps = [{r['file']: r for r in record['selected']} for record in records]
    comparison = []
    for name in FILES:
        b, c = maps[0][name], maps[1][name]
        if b['ok'] and not c['ok']:
            verdict = 'candidate_regression'
        elif not b['ok'] and not c['ok']:
            verdict = 'red_at_both_same_first_assertion' if b.get('firstFailureLine') == c.get('firstFailureLine') else 'red_at_both_different_first_assertion'
        elif b['ok'] and c['ok']:
            verdict = 'lab_failure_not_reproduced_on_gcp'
        else:
            verdict = 'base_red_candidate_green_lab_failure_still_open'
        comparison.append({'file': name, 'classification': verdict, 'base': b, 'candidate': c})
    source = [json.loads((root / name / 'source.json').read_text()) for name in ('base', 'candidate')]
    result = {'schema': 'freshmg-lab-attribution/1', 'runId': int(os.environ['GITHUB_RUN_ID']),
              'candidateSha': CANDIDATE, 'baseSha': BASE,
              'labRunId': 'freshmg-lab-20261008T150005Z',
              'labArchiveSha256': '6fbaf0e6af0b5cc799d0e32da034922de7de979c0f3a5980c504f6272e4265f4',
              'labVerdict': 'FAIL', 'physicalBaseline': 'NOT_RUN',
              'comparison': comparison, 'source': source,
              'deferredSlowFiles': DEFERRED,
              'independentApproval': False, 'distributedAcceptance': False,
              'limits': ['Inherited relative to this increment does not mean acceptable for release.',
                         'Same first assertion does not by itself prove identical underlying cause.',
                         'A GCP pass never erases the original lab failure.',
                         'The six slow failures remain open; no full-cone or per-file timing approval.']}
    (root / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
    for row in comparison:
        print(row['classification'] + ': ' + row['file'])


if __name__ == '__main__':
    if sys.argv[1] == 'measure':
        measure(sys.argv[2], sys.argv[3], sys.argv[4])
    elif sys.argv[1] == 'compare':
        compare(sys.argv[2])
    else:
        raise SystemExit('usage: measure checkout sha output | compare output-root')
