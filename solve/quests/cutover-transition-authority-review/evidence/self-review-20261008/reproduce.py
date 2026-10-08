#!/usr/bin/env python3
"""Reproduce the self-review harness mutants; no runtime edits or network calls."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import uuid
import zipfile

if os.environ.get('LAGRANGE_PROBE'):
    raise SystemExit('Refused: this is an execution harness, not a Solver probe.')

HERE = Path(__file__).resolve().parent
ROOT = next((p for p in HERE.parents if (p / 'package.json').is_file()
             and (p / 'src').is_dir()), None)
if ROOT is None:
    raise SystemExit('Run this from the complete Lagrange repository checkout.')
SCRIPTS = ROOT / 'scripts/quest-evidence'
OUTPUT = ROOT / 'test-output/c0-self-review' / uuid.uuid4().hex
OUTPUT.mkdir(parents=True, exist_ok=False)
SOURCE_LABEL = '82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af'
with zipfile.ZipFile(HERE / 'local-continuation-original.zip') as archive:
    original = archive.read('files/scripts/quest-evidence/cutover-workflow-crash-baseline.js').decode()
strengthened = (SCRIPTS / 'cutover-workflow-crash-projection-baseline.js').read_text()

def mutation(text: str, name: str) -> str:
    if name == 'none':
        return text
    if name == 'inside-cut-with-no-sql':
        old = "if (kind !== 'before-commit') {"
        new = "if (kind !== 'before-commit' && kind !== 'inside-transaction') {"
    elif name == 'after-mark-with-no-mark':
        old = "if (kind === 'after-local-mark' || kind === 'acknowledged') {"
        new = "if (kind === 'acknowledged') {"
    else:
        old = "if (kind === 'write-unavailable') db.exec('PRAGMA query_only=ON');"
        assert text.count(old) == 1
        text = text.replace(old, '// Reviewer substitutes an unrelated error.', 1)
        old = "      db.exec('BEGIN IMMEDIATE');"
        new = "      if (kind === 'write-unavailable') throw new Error('unrelated fixture error');\n" + old
    assert text.count(old) == 1, f'mutation anchor changed: {name}'
    return text.replace(old, new, 1)

results = []
for version, text in [('original', original), ('strengthened', strengthened)]:
    for name in ['none', 'inside-cut-with-no-sql', 'after-mark-with-no-mark', 'wrong-refusal-kind']:
        changed = mutation(text, name)
        fd, temporary = tempfile.mkstemp(prefix='.c0-review-', suffix='.js', dir=SCRIPTS)
        os.close(fd)
        temporary = Path(temporary)
        temporary.write_text(changed)
        result_file = OUTPUT / f'{version}-{name}.json'
        try:
            child = subprocess.Popen(['node', str(temporary), str(result_file), SOURCE_LABEL],
                                     cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, start_new_session=True)
            try:
                stdout, stderr = child.communicate(timeout=120)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)  # only this fresh harness process group
                child.communicate()
                raise RuntimeError(f'harness failed to complete: {version}/{name}')
            (OUTPUT / f'{version}-{name}.stdout.txt').write_text(stdout)
            (OUTPUT / f'{version}-{name}.stderr.txt').write_text(stderr)
            result = json.loads(result_file.read_text())
            entry = {'version': version, 'mutation': name, 'exit': child.returncode,
                     'status': result['measurementStatus'], 'cases': len(result['cases']),
                     'harnessSha256': hashlib.sha256(changed.encode()).hexdigest(),
                     'error': result.get('error', {}).get('message')}
            results.append(entry)
            (OUTPUT / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
            if version == 'original' or name == 'none':
                assert child.returncode == 0 and entry['cases'] == 9, entry
            else:
                assert child.returncode != 0 and entry['status'] == 'failed', entry
        finally:
            temporary.unlink(missing_ok=True)
print(json.dumps({'status': 'measured', 'output': str(OUTPUT), 'results': results}, indent=2))
