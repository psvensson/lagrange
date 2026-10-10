"""Preserve a verified WIP patch on real upstream ancestry; never certify it."""
from pathlib import Path, PurePosixPath
import hashlib, json, lzma, os, subprocess, sys

BASE = '60a60b2a6461d6fd9fa0f6f96fd3e25aa94651e4'
UPSTREAM = 'work/freshmg-registered-learner-read-20261009'
TARGET = 'handoff/rs-raft-safety-first-20261010'
QUEST = 'solve/quests/message-group-fresh-identity-membership'
EVIDENCE = QUEST + '/evidence/local-takeover-20261010'
HANDOFF = QUEST + '/local-takeover-20261010.md'
PAYLOAD_SHA = '742a8a8193e2481b66ac4d5a0ce17047da47f8ff03295b208c87060255f41cd8'
ORIGINAL_SHA = '9e6ee95d25ef8db3440cff378f08baec798137e7d771a832622944b70367cbf6'
carrier, root, out = [Path(p).resolve() for p in sys.argv[1:]]
out.mkdir(parents=True, exist_ok=False)

def command(*args, allow=(0,)):
    result = subprocess.run(args, cwd=root, text=True, capture_output=True, timeout=180)
    with (out / 'commands.log').open('a') as stream:
        stream.write(json.dumps(list(args)) + '\n' + result.stdout + result.stderr + '\nexit=' + str(result.returncode) + '\n')
    if result.returncode not in allow:
        raise RuntimeError(f'command failed: {args[0]} {args[1:3]} (see retained log)')
    return result.stdout.strip(), result.returncode

def sha(data):
    return hashlib.sha256(data).hexdigest()

def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def safe_path(name):
    p = PurePosixPath(name)
    if p.is_absolute() or not p.parts or '..' in p.parts or str(p) != name:
        raise ValueError('unsafe payload path: ' + name)
    return p

def validate(path, row, which):
    data = path.read_bytes()
    assert sha(data) == row[which + 'Sha256'], (row['path'], which, 'sha256')
    assert blob(data) == row[which + 'GitBlob'], (row['path'], which, 'blob')

assert os.environ.get('LAGRANGE_PROBE') != '1', 'publication is not a probe'
assert command('git', 'rev-parse', 'HEAD')[0] == BASE
assert command('git', 'status', '--porcelain')[0] == ''
remote = command('git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/' + UPSTREAM)[0]
assert remote.split()[0] == BASE, 'upstream advanced: do not overwrite or auto-rebase'
assert command('git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/' + TARGET, allow=(0, 2))[1] == 2, 'handoff branch already exists'
main_before = command('git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/main')[0]
raw = b''.join((carrier / f'payload-{i}.bin').read_bytes() for i in range(8))
assert sha(raw) == PAYLOAD_SHA
files = json.loads(lzma.decompress(raw))
assert isinstance(files, dict) and len(files) == 126
for name, content in files.items():
    safe_path(name)
    assert isinstance(content, str)
lines = files['RETAINED-SHA256SUMS'].splitlines()
assert len(lines) == 125
listed = set()
for line in lines:
    digest, name = line.split('  ', 1)
    assert name not in listed
    listed.add(name)
    assert sha(files[name].encode()) == digest, name
assert listed == set(files) - {'RETAINED-SHA256SUMS'}
checks = json.loads(files['apply-check.json'])
assert checks['upstreamBase'] == BASE and checks['changedFiles'] == 12
patch = files['changes.patch'].encode()
assert sha(patch) == checks['patchSha256']
(out / 'verified-input.patch').write_bytes(patch)
for row in checks['files']:
    target = root / safe_path(row['path'])
    if row['newFile']:
        assert not target.exists(), row['path']
    else:
        validate(target, row, 'before')
command('git', 'apply', '--check', str(out / 'verified-input.patch'))
command('git', 'apply', str(out / 'verified-input.patch'))
for row in checks['files']:
    validate(root / row['path'], row, 'after')
assert not (root / EVIDENCE).exists()
assert not (root / HANDOFF).exists()
for name, content in files.items():
    target = root / EVIDENCE / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content.encode())
(root / HANDOFF).write_bytes((carrier / 'local-takeover.md').read_bytes())
manifest = {'schema': 'local-takeover-preservation/1', 'baseSha': BASE,
            'targetBranch': TARGET, 'sourceFiles': checks['files'],
            'payloadSha256': PAYLOAD_SHA, 'originalAttachmentSha256': ORIGINAL_SHA,
            'retainedFileCount': len(files), 'originalAttachmentUploaded': False,
            'canonicalTestsRun': False, 'independentApproval': False,
            'mainMerge': False, 'driverActivation': False,
            'note': 'Preserved diagnostics are historical measurements; see ORIGINAL-ARCHIVE.txt.'}
(root / EVIDENCE / 'PUBLICATION.json').write_text(json.dumps(manifest, indent=2) + '\n')
paths = [row['path'] for row in checks['files']] + [EVIDENCE, HANDOFF]
command('git', 'add', '--', *paths)
staged = set(command('git', 'diff', '--cached', '--name-only')[0].splitlines())
expected = {row['path'] for row in checks['files']} | {EVIDENCE + '/' + n for n in files} | {EVIDENCE + '/PUBLICATION.json', HANDOFF}
assert staged == expected, ('unexpected staged paths', staged ^ expected)
command('git', 'config', 'user.name', 'github-actions[bot]')
command('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
# Repository-documented WIP preservation only; never main or Solver landing.
os.environ['LAGRANGE_SKIP_PRECOMMIT'] = '1'
command('git', 'commit', '-m', 'WIP handoff: preserve safety-first learner recording, diagnostics and local takeover instructions')
head = command('git', 'rev-parse', 'HEAD')[0]
assert command('git', 'rev-parse', 'HEAD^')[0] == BASE
assert command('git', 'status', '--porcelain')[0] == ''
for row in checks['files']:
    assert command('git', 'rev-parse', 'HEAD:' + row['path'])[0] == row['afterGitBlob']
command('git', 'push', 'origin', 'HEAD:refs/heads/' + TARGET)
remote_after = command('git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/' + TARGET)[0]
assert remote_after.split()[0] == head
assert command('git', 'status', '--porcelain')[0] == ''
main_after = command('git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/main')[0]
manifest.update({'publishedSha': head, 'remoteSha': remote_after.split()[0],
                 'mainBefore': main_before, 'mainAfter': main_after,
                 'cleanCheckout': True, 'changedPaths': sorted(staged)})
(out / 'publication-result.json').write_text(json.dumps(manifest, indent=2) + '\n')
(out / 'HEAD.txt').write_text(head + '\n')
command('git', 'bundle', 'create', str(out / 'handoff.bundle'), 'HEAD', '^' + BASE)
print(json.dumps({'publishedSha': head, 'branch': TARGET, 'changedFiles': len(staged),
                  'sourcePatchFiles': 12, 'retainedFiles': 126, 'verification': 'byte identity and remote preservation only'}, indent=2))
