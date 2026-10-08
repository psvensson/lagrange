#!/usr/bin/env python3
"""Repair fixture engagement and routing prose; no source or gate weakening."""
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1]).resolve()

def replace_once(path, old, new):
    file = root / path
    text = file.read_text()
    assert text.count(old) == 1, f'exact source anchor changed: {path}'
    file.write_text(text.replace(old, new, 1))

replace_once('docs/steering/router.md',
    'Every rule in [`rules.md`](rules.md) names an owner key. This table is the\n'
    'only place a key becomes a path, so renaming or replacing an implementation\n'
    'changes one row here and no rule. Consult an owner when the work touches it;\n'
    'nothing below is read by default.',
    '[`rules.md`](rules.md) names owner keys; only this table maps them to paths.\n'
    'Rename paths here, not in rules. Read owners only when relevant to the task.')

replace_once('test/raft/raft-rs-backend/evidence-o1-restart-equivalence.test.js',
    '    db.exec(`INSERT INTO ${RAFT_RS_TABLE.APPLIED_STATE} SELECT group_id, ` +\n'
    "      'applied_index, voters, learners, voters_outgoing, learners_next, ' +\n"
    "      'auto_leave FROM gated');",
    '    // Preserve every non-gate field of the actual schema, including later\n'
    '    // membership-generation additions. Only gate-column absence is varied.\n'
    '    const columns = db.pragma(`table_info(${RAFT_RS_TABLE.APPLIED_STATE})`)\n'
    '      .map((row) => row.name);\n'
    '''    const selectedColumns = columns.map((column) =>\n'''
    '''      `"${column.replaceAll('"', '""')}"`).join(', ');\n'''
    '    const previous = db.prepare(`SELECT ${selectedColumns} FROM gated ` +\n'
    "      'ORDER BY group_id').all();\n"
    "    assert.ok(previous.length > 0, 'setup: actual durable records must be copied');\n"
    '    db.exec(`INSERT INTO ${RAFT_RS_TABLE.APPLIED_STATE} (${selectedColumns}) ` +\n'
    '      `SELECT ${selectedColumns} FROM gated`);\n'
    '    assert.deepEqual(db.prepare(`SELECT ${selectedColumns} FROM ` +\n'
    '      `${RAFT_RS_TABLE.APPLIED_STATE} ORDER BY group_id`).all(), previous,\n'
    "    'setup: all non-gate durable values survive the pre-gate reconstruction');")

changed = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root).decode().splitlines()
assert sorted(changed) == [
    'docs/steering/router.md',
    'test/raft/raft-rs-backend/evidence-o1-restart-equivalence.test.js',
], changed
subprocess.run(['git', 'diff', '--exit-code', '--', 'src'], cwd=root, check=True)
subprocess.run(['git', 'diff', '--check'], cwd=root, check=True)
print('Preserved all rules/route destinations, the 360-line bound, and typed pre-gate refusal assertions.')
