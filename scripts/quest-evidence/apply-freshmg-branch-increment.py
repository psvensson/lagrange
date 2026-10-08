#!/usr/bin/env python3
"""Materialize one hash-bound WIP increment; no unlisted paths or runtime execution."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys

carrier = Path(__file__).resolve().parents[2]
root = Path(sys.argv[1]).resolve()
phase = sys.argv[2]
assert phase in ('test', 'source')
allowed = {
    'test/rebalancer/message-group-membership-branch-authorization.test.js',
    'src/rebalancer/replica-operation-message-group-membership-permit.js',
    'src/rebalancer/replica-operation-message-group-membership-authorization.js',
    'src/rebalancer/replica-operation-message-group-membership-owner-claim.js',
    'src/bootstrap/replica-operation-message-group-membership-schema-constants.js',
    'src/rebalancer/replica-operation-message-group-membership-fields.js',
    'src/rebalancer/replica-operation-repository-row-methods.js',
    'src/rebalancer/replica-operation-repository.js',
}
parts = carrier / 'scripts/quest-evidence/freshmg-branch-payload'
encoded = ''.join((parts / f'{i:02}.part').read_text().strip() for i in range(4))
raw = gzip.decompress(base64.b64decode(encoded, validate=True))
assert hashlib.sha256(raw).hexdigest() == 'df2b838d4253234a21480765c5c6b90d941d82139199a3e4f91115e012352306'
data = json.loads(raw)
assert data['schema'] == 'freshmg-branch-increment/1'
assert set(entry['path'] for entry in data['files']) == allowed
assert len(data['files']) == len(allowed)
head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
assert head == data['base'], (head, data['base'])
changed = []
for entry in data['files']:
    name = entry['path']
    if (phase == 'test') != name.startswith('test/'):
        continue
    dest = root / name
    assert dest.resolve().is_relative_to(root)
    if entry['beforeSha256'] is None:
        assert not dest.exists(), f'not a new file: {name}'
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(entry['content'])
    else:
        assert hashlib.sha256(dest.read_bytes()).hexdigest() == entry['beforeSha256'], name
        subprocess.run(['git', '-C', str(root), 'apply', '--check', '--include=' + name],
                       input=entry['patch'], text=True, check=True)
        subprocess.run(['git', '-C', str(root), 'apply', '--include=' + name],
                       input=entry['patch'], text=True, check=True)
    assert hashlib.sha256(dest.read_bytes()).hexdigest() == entry['sha256'], name
    changed.append(name)
correction = carrier / 'scripts/quest-evidence/freshmg-initial-claim-correction.patch'
assert hashlib.sha256(correction.read_bytes()).hexdigest() == 'c242f7efa0d7b626e24ca3c90faba8058b647920f44e3c6afe09a30fc25fd626'
include = 'test/**' if phase == 'test' else 'src/**'
subprocess.run(['git', '-C', str(root), 'apply', '--check', '--include=' + include, str(correction)], check=True)
subprocess.run(['git', '-C', str(root), 'apply', '--include=' + include, str(correction)], check=True)
if phase == 'source':
    # A RECORDED observation is not an old/expired process's authority to execute.
    p = root / 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
    s = p.read_text()
    old = '''    return result(OUTCOME.RECORDED, row);
  }
  if (this.isOperationTerminal(row)'''
    new = '''    const currentClaim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
    if (!membershipClaimIsLocalAndLive(this, currentClaim, identity)) {
      return result(OUTCOME.STALE_OWNER, row);
    }
    if (!await membershipBootIsCurrent(this)) return result(OUTCOME.UNAVAILABLE, row);
    return result(OUTCOME.RECORDED, row);
  }
  if (this.isOperationTerminal(row)'''
    assert s.count(old) == 1
    s = s.replace(old, new)
    old = '''    observed.messageGroupMembershipOwnerClaim === row.messageGroupMembershipOwnerClaim &&
    await membershipBootIsCurrent(this))'''
    new = '''    observed.messageGroupMembershipOwnerClaim === row.messageGroupMembershipOwnerClaim &&
    membershipClaimIsLocalAndLive(this, claim, identity) &&
    await membershipBootIsCurrent(this))'''
    assert s.count(old) == 1
    p.write_text(s.replace(old, new))
out = root / 'test-output/freshmg-increment'
out.mkdir(parents=True, exist_ok=True)
report = {'schema': 'freshmg-materialization/1', 'base': head, 'phase': phase,
          'payloadSha256': hashlib.sha256(raw).hexdigest(), 'paths': changed,
          'sha256': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in changed},
          'sourceApproval': False, 'runtimeActivation': False}
(out / f'{phase}-materialization.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
