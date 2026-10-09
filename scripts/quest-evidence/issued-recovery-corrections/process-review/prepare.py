#!/usr/bin/env python3
"""Prepare bounded PR110 review corrections on the exact named base."""
from pathlib import Path
import hashlib
import shutil
import sys

HERE = Path(__file__).resolve().parent
REL = Path('solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009')
root = Path.cwd()
if sys.argv[1] == 'tests':
    dest = root / REL / 'test-process-lifetime.py'
    assert not dest.exists(), 'do not replace an existing lifetime witness'
    shutil.copyfile(HERE / 'test-process-lifetime.py', dest)
    raise SystemExit(0)
assert sys.argv[1] == 'fix'
p = root / REL / 'run-diagnostic.py'
raw = p.read_bytes()
assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == '22268a383a22f3fcb958bace1d920828c9994bd9', 'diagnostic changed since review'
s = raw.decode()
s = s.replace('import json\n', 'import json\nimport os\nimport signal\n', 1)
a = s.index('def execute(')
b = s.index('\n\ndef measure(', a)
s = s[:a] + '''def execute(root: Path, output: Path, name: str, command: list[str],
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
            (output / (name + '.result.json')).write_text(json.dumps(row, indent=2) + '\\n')
        finally:
            source.write_bytes(original)
''' .rstrip() + s[b:]
compile(s, str(p), 'exec')
p.write_text(s)

p = root / REL / 'test-proof-checker.py'
s = p.read_text()
old = "if (record?.hardState?.term === '2') throw new Error('unrelated term refusal');"
new = "if (Number(record?.hardState?.term) > 1) throw new Error('unrelated term refusal');"
assert s.count(old) == 1, 'attribution fault changed'
s = s.replace(old, new)
old = "        self.assertEqual(sum(e['type'] == 'test:fail' for e in events), 2)"
new = old + "\n        self.assertEqual({e['name'] for e in events if e['type'] == 'test:fail'},\n                         set(diag.EXPECTED_TESTS[1:3]))"
assert s.count(old) == 1, 'attribution failure assertion changed'
p.write_text(s.replace(old, new))

p = root / 'architecture/contracts/issued-membership-action-recovery.md'
s = p.read_text()
old = '''Local execution substitutes node:sqlite for better-sqlite3 through the clearly
named diagnostic adapter. The raw Ready helper is the repository's historical
low-level test driver, NOT the production operation-port/runtime Ready loop.
The evidence therefore does not establish production persistence ordering,
client reply handling, physical restart, power-loss safety, or distributed
SQL/CDC. Snapshot-cut tests intentionally project record views; they do not
install or compact a real snapshot. Canonical dependency/runner and GCP proof
remain required. No normal gate result is inferred from this diagnostic.'''
new = '''The original local diagnostic substituted node:sqlite for better-sqlite3.
Subsequent Actions 37904808160 and 37905655755 ran the 22 recovery/storage cases
with the locked normal better-sqlite3 dependency and classified runner; all
three files met their existing 2000-ms limits. The five codec and seven storage
mutations also ran with the normal driver in 37904808160. The separate checker
self-tests still use the explicitly named diagnostic adapter.

The raw Ready helper remains the historical low-level test driver, NOT the
production operation-port/runtime Ready loop. Normal-driver component evidence
does not establish production persistence ordering, client response handling,
physical restart, power-loss safety, or distributed SQL/CDC. Snapshot-cut tests
project record views rather than installing or compacting an actual snapshot.
Complete runtime, change-impact/static and physical Actions/GCP acceptance
remain required; the earlier local diagnostic is not relabeled canonical.'''
assert s.count(old) == 1, 'proof boundary paragraph changed'
s = s.replace(old, new)
old = '''projected arbitrary records. Local runs still use the explicit node:sqlite
adapter; its open and transaction flags now come from SQLite itself. Normal
better-sqlite3, actual runtime/Ready, process loss, native snapshot installation,
and the full source/gateway gates remain required.'''
new = '''projected arbitrary records. The original local node:sqlite adapter obtains
its open and transaction flags from SQLite itself. The later normal-driver
coverage is recorded above. Actual runtime/Ready, process loss, native snapshot
installation, and full source/gateway gates remain required.

### Diagnostic subprocess lifetime

The POSIX diagnostic owns one private process group per measurement, including
ordinary Node test descendants. It terminates that group even when the initial
process exits first, drains retained output and reaps its direct child before
restoring temporarily changed source. Timeout remains failed evidence, never
a mutation success. Cleanup failures stop the campaign. No caller/lab process
group is targeted, and this is not containment of deliberately detached hostile
processes. The worker-lifetime witness verifies real child/grandchild engagement
and refusal to leave them runnable after both timeout and normal parent exit.'''
assert s.count(old) == 1, 'corrective proof paragraph changed'
p.write_text(s.replace(old, new))
