#!/usr/bin/env python3
"""Negative controls in disposable detached worktrees; never changes the candidate."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
source = 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
claim = 'src/rebalancer/replica-operation-message-group-membership-owner-claim.js'
test = 'test/rebalancer/message-group-membership-branch-authorization.test.js'
mutations = [
    ('branch-without-holder-cas', source,
     'AND message_group_source_lifecycle_claim = ? AND message_group_membership_owner_claim = ?',
     'AND message_group_source_lifecycle_claim = ? AND (? IS NOT NULL)',
     'changed owner claim at the actual UPDATE defeats stale branch selection'),
    ('branch-without-terminal-cas', source,
     'AND status = ? AND workflow_step = ? AND completed_at IS NULL',
     'AND (? IS NOT NULL) AND (? IS NOT NULL)',
     'terminal settlement between owner read and CAS cannot be overwritten by authorization'),
    ('takeover-without-prior-claim', claim,
     "  ['message_group_membership_owner_claim', 'messageGroupMembershipOwnerClaim'],\n",
     '', 'delayed losing takeover cannot overwrite the exact winner'),
]
positive = 'promotion authorization commits exact target intent; replay/reopen never writes it twice'
report = {'schema': 'freshmg-cas-mutation-controls/1', 'candidate': head,
          'sourceApproval': False, 'distributedAcceptance': False, 'cases': []}
base_digests = {f: hashlib.sha256((root / f).read_bytes()).hexdigest() for f in (source, claim, test)}
try:
    for name, file, old, new, failure in mutations:
        parent = Path(tempfile.mkdtemp(prefix='freshmg-negative-', dir=os.environ.get('RUNNER_TEMP')))
        work = parent / 'tree'
        subprocess.run(['git', '-C', str(root), 'worktree', 'add', '--detach', str(work), head],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            (work / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
            path = work / file
            original = path.read_text()
            assert original.count(old) == 1, (name, 'mutation anchor is not unique')
            path.write_text(original.replace(old, new))
            result = subprocess.run(['npm', 'run', 'test:file', '--', test], cwd=work,
                text=True, capture_output=True, timeout=150)
            (out / (name + '.stdout.txt')).write_text(result.stdout)
            (out / (name + '.stderr.txt')).write_text(result.stderr)
            has_named_failure = any(line.startswith('not ok ') and failure in line
                                    for line in result.stdout.splitlines())
            has_positive = any(line.startswith('ok ') and positive in line
                               for line in result.stdout.splitlines())
            case = {'name': name, 'exitCode': result.returncode, 'file': file,
                    'namedFailure': failure, 'intendedFailureObserved': has_named_failure,
                    'positiveControlPassed': has_positive,
                    'mutatedSha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            report['cases'].append(case)
            assert result.returncode == 1 and has_named_failure and has_positive, case
        finally:
            # Remove only this run's disposable, deliberately mutated worktree.
            subprocess.run(['git', '-C', str(root), 'worktree', 'remove', '--force', str(work)], check=True)
    report['passed'] = True
finally:
    report['candidateSourceUnchanged'] = all(hashlib.sha256((root / f).read_bytes()).hexdigest() == d
                                            for f, d in base_digests.items())
    report['sourceSha256'] = base_digests
    (out / 'mutations.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    assert report['candidateSourceUnchanged']
