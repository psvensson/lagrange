#!/usr/bin/env python3
"""One-shot C0 evidence collector. Original failed runs remain failed."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import zipfile

root = Path.cwd()
out = root / 'test-output/c0-final-classification'
out.mkdir(parents=True, exist_ok=True)
quest = 'cutover-transition-authority-review'
target = 'ae20b6601ca27bcab7758840bc4830945558b524'
items = [
    (11538213446, 37751962637, 'terminal-owner', '1c267f14ae8f48778577a8880733e77e5c6e226adb09afcd1293bcac9391a623'),
    (11538781160, 37751962572, 'strengthened-crash', 'b10baeb4c6c758ddd5a17163b30839d380af9da9c71c285ac9c011ca65c38041'),
    (11538510400, 37750464523, 'saved-mutation-reproduction', '86951d6a149e81fed33936275f8f5e90956bd0b7b3eba8020a2fbdd3ee71b933'),
    (11538075738, 37750464523, 'saved-publication', 'b58de48d2bd38129d1b81a7b12041c924c277a5bec41f4e055e2cec175fda990'),
    (11538695190, 37751224863, 'failed-terminal-harness', '59199568fa679e8de20598de237b3a267fc17bbc776bee2319c230ffae0d8c21'),
]
evidence = {'schema': 'c0-classification-evidence/1',
    'runtimeSha': '82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af',
    'correctedWitnessSha': target, 'independentApproval': False,
    'distributedAcceptance': False, 'artifacts': []}
sha = lambda data: hashlib.sha256(data).hexdigest()
for aid, run, label, digest in items:
    raw = subprocess.check_output(['gh', 'api', f'repos/psvensson/lagrange/actions/artifacts/{aid}/zip'])
    assert sha(raw) == digest, f'archive mismatch {aid}'
    archive = zipfile.ZipFile(io.BytesIO(raw))
    assert len(set(archive.namelist())) == len(archive.namelist())
    assert sum(i.file_size for i in archive.infolist()) < 10000000
    assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in archive.namelist())
    members = {n: archive.read(n) for n in archive.namelist() if not n.endswith('/')}
    by_name = {Path(n).name: n for n in members}
    assert len(by_name) == len(members), 'ambiguous member basenames'
    verified = 0
    if 'SHA256SUMS' in by_name:
        for line in members[by_name['SHA256SUMS']].decode().splitlines():
            expected, name = line.split(None, 1)
            name = name.lstrip('*')
            assert sha(members[by_name[Path(name).name]]) == expected, f'member mismatch {name}'
            verified += 1
    entry = {'id': aid, 'runId': run, 'label': label, 'sha256': digest,
        'manifestMembersVerified': verified, 'members': {n: sha(b) for n, b in members.items()}}
    for base in ['terminal-obligation.json', 'process-loss.json', 'reproducer.json', 'restored.json']:
        if base not in by_name:
            continue
        value = json.loads(members[by_name[base]])
        if label == 'failed-terminal-harness' and base == 'terminal-obligation.json':
            assert value['measurementStatus'] == 'failed'
            entry['retainedFailure'] = {'sourceSha': value['sourceSha'],
                'error': value.get('error'), 'proofCeiling': value['proofCeiling']}
        elif base in ['terminal-obligation.json', 'process-loss.json']:
            assert value['sourceSha'] == target and value['measurementStatus'] == 'measured'
        entry[base] = value if base != 'process-loss.json' else {
            'measurementStatus': value['measurementStatus'], 'sourceSha': value['sourceSha'],
            'proofCeiling': value['proofCeiling'], 'sourceDigests': value['sourceDigests'],
            'cases': [{'name': c['name'], 'passed': c['passed'],
                'cut': next(m for m in c['before']['messages'] if m['kind'] == 'cut'),
                'reopened': next(m for m in c['after']['messages'] if m['kind'] == 'result')}
                for c in value['cases']]}
    for base in ['focused.stdout.txt', 'snapshot.stdout.txt', 'regressions.txt', 'final-status.txt', 'runtime-source-diff.txt']:
        if base in by_name:
            entry[base] = members[by_name[base]].decode()
    # Reuse an existing canonical asset only after independently re-downloading
    # and verifying it. Never clobber an earlier verified artifact.
    local = out / f'c0-{label}-{run}.zip'
    local.write_bytes(raw)
    asset = quest + '--' + local.name
    release = json.loads(subprocess.check_output(['gh', 'release', 'view', 'solve-evidence', '--json', 'assets'], text=True))
    existing = next((a for a in release['assets'] if a['name'] == asset), None)
    if existing:
        verify_dir = out / ('verify-' + label)
        verify_dir.mkdir()
        subprocess.run(['gh', 'release', 'download', 'solve-evidence', '--pattern', asset, '--dir', str(verify_dir)], check=True)
        assert sha((verify_dir / asset).read_bytes()) == digest
        entry['uploaded'] = {'sha256': digest, 'bytes': len(raw), 'asset': asset, 'url': existing['url']}
        subprocess.run(['node', 'scripts/solve.js', 'note', '--id', quest, '--finding',
            f'Reused canonical {asset} after fresh download/hash verification: {digest}; original run {run}, {verified} manifest members checked. Original failure/measurement verdict unchanged.', '--kind', 'evidence', '--evidence', 'sha256:' + digest, '--json'], check=True)
    else:
        result = subprocess.check_output(['node', 'scripts/solve.js', 'evidence', 'add', str(local),
            '--id', quest, '--text', f'Exact {label} artifact from {run}; archive and {verified} member digests verified. Original verdict and proof ceiling retained.', '--json'], text=True)
        entry['uploaded'] = json.loads(result)['uploaded']
    (out / f'{label}-verified.json').write_text(json.dumps(entry, indent=2) + '\n')
    evidence['artifacts'].append(entry)
q = root / 'solve/quests' / quest
(q / 'evidence/classification-gcp-20261008.json').write_text(json.dumps(evidence, indent=2) + '\n')
receipt = json.loads((q / 'evidence/receipt.json').read_text())
receipt.update(sourceSha=target, evidence=f'solve/quests/{quest}/evidence/classification-gcp-20261008.json', status='fail')
for name in ['cutover-terminal-obligation-baseline.js', 'cutover-workflow-crash-baseline.js']:
    p = 'scripts/quest-evidence/' + name
    receipt.setdefault('testFileDigests', {})[p] = sha((root / p).read_bytes())
details = {
    'replacement-source-target-and-obligations-classified': 'J1 is selected by the operator in operator-decision-20261008-j1.md. Exact O/S/T subjects and durable promotion-authorization boundary are classified; no WIP permit or full replacement acceptance is claimed.',
    'workflow-commit-projection-and-restart-classified': 'Actual repository commit and volatile mirror/progress relation classified. Corrected ordinary terminal entries retain exact SQL membership debt and reject a competing group operation with no physical work. Six strengthened process-loss cases pass on ae20b660. Missing membership recovery driver is a named FreshMG implementation obligation.',
    'snapshot-local-open-wipe-and-install-classified': 'Four gates and existing owners classified in classification-disposition-20261008.md. Missing callback/Ready/application-image integration belongs to the existing snapshot product frontier. No successful intact catch-up or multi-host claim.',
    'source-bound-deterministic-discriminators-measured': 'Original red and failed-harness artifacts preserved alongside corrected GCP proofs through canonical hash-verified evidence uploads. Proof ceilings and positive controls retained.',
    'independent-category-complete-contract-review': 'Outstanding actual independent review of the new classification packet. Earlier rejections and author self-review remain unchanged.'}
for r in receipt['receipts']:
    r['passed'] = r['id'] != 'independent-category-complete-contract-review'
    r['detail'] = details[r['id']]
(q / 'evidence/receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
