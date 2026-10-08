#!/usr/bin/env python3
"""Apply reviewed C0-only corrections to an exact checkout, never src/."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
report = Path(sys.argv[2]).resolve()
changes = {}

def edit(name, expected_blob, changeset):
    path = root / name
    data = path.read_bytes()
    assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == expected_blob, f'changed input: {name}'
    text = data.decode()
    for old, new in changeset:
        assert text.count(old) == 1, f'nonunique correction anchor in {name}: {old[:60]}'
        text = text.replace(old, new, 1)
    path.write_text(text)
    changes[name] = {'oldBlob': expected_blob, 'newSha256': hashlib.sha256(path.read_bytes()).hexdigest()}

edit('.github/workflows/cutover-workflow-crash.yml',
     '5fca74a6be5257fdc34d82177c211f14e41d61bd', [
    ('      - name: Bind diagnostic status to existing policy (no runtime change)',
     "      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e\n        with:\n          node-version: '22'\n          package-manager-cache: false\n      - name: Bind diagnostic status to existing policy (no runtime change)")])
edit('solve/quests/cutover-transition-authority-review/recovery-policy-proposal.md',
     '4a12e8d860b8ee229ca242424d1c43bb132d3fed', [
    ('## Three identities must not be conflated', '## Four identity dimensions must not be conflated'),
    ('## Recommended bounded choice',
     '## Operator decision recorded after this proposal\n\nThe user approved the conservative promotion-authorization boundary on\n2026-10-08; see [the explicit decision](operator-decision-20261008-j1.md).\nThis historical proposal remains an input to that decision, not independent\nverification or evidence that the implementation is complete.\n\n## Recommended bounded choice')])
edit('scripts/quest-evidence/cutover-workflow-crash-baseline.js',
     '822cc59fbd4fa1f862cbe2f4abdce6757bfd3afe', [
    ('  let mutationChanges = 0;', '  let mutationChanges = 0;\n  let sqliteWriteError = null;'),
    ('    mutationAttempts, mutationChanges,', '    mutationAttempts, mutationChanges, sqliteWriteError,'),
    ('      } catch (error) {\n        return {success: false, error: error.message, errorCode: error.code};',
     '      } catch (error) {\n        if (isStepWrite) sqliteWriteError = {code: error.code, message: error.message};\n        return {success: false, error: error.message, errorCode: error.code};'),
    ("      assert.equal(before.signal, 'SIGKILL');",
     """      assert.equal(before.signal, 'SIGKILL');
      const expectedPoint = ['committed_answer_lost', 'terminal_committed'].includes(name) ?
        'committed_answer_lost' : name;
      assert.equal(cut.point, expectedPoint, 'the named interruption must engage');
      const cutState = cut.observation;
      const sqlApplied = !['before_sql', 'readonly_refusal'].includes(name);
      assert.equal(cutState.mutationAttempts, 1, 'exactly one real SQL transition attempted');
      assert.equal(cutState.mutationChanges, sqlApplied ? 1 : 0,
        'cut must not silently bypass the real SQLite update');
      assert.equal(cutState.inTransaction, name === 'uncommitted_sql',
        'the uncommitted cut requires an open SQLite transaction');
      assert.equal(cutState.row.workflow_step,
        sqlApplied ? targetStep(name) : WORKFLOW_STEP.PENDING);
      assert.equal(cutState.mirrorStep, targetStep(name), 'local candidate really advanced');
      assert.equal(cutState.committedMark, name === 'after_mark',
        'post-mark cut cannot pass while the local mark is absent');
      if (name === 'readonly_refusal') {
        assert.equal(cutState.sqliteWriteError?.code, 'SQLITE_READONLY',
          'an unrelated exception cannot satisfy the read-only fault');
      } else {
        assert.equal(cutState.sqliteWriteError, null);
      }""")])
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text(json.dumps({'schema':'c0-reviewed-corrections/1', 'files':changes,
    'runtimeChanges':False, 'independentApproval':False}, indent=2)+'\n')
print(report.read_text())
