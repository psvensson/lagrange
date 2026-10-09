#!/usr/bin/env python3
"""Narrow measured canonical followup. Changes no acceptance or runtime protocol."""
from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    assert text.count(old) == 1, (path, 'source anchor changed', old)
    p.write_text(text.replace(old, new))


source = 'src/raft/raft-rs-committed-membership-context.js'
replace(source,
        "import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';",
        "import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';\n"
        "import {RAFT_RS_ZERO_INDEX} from './raft-rs-durable-store-constants.js';")
replace(source, "if (entry.term === '0') throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);",
        "if (entry.term === RAFT_RS_ZERO_INDEX) {\n"
        "        throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);\n      }")

dir = 'solve/quests/message-group-fresh-identity-membership/evidence/issued-action-recovery-20261009/'
replace(dir + 'run-diagnostic.py',
        "def test_command(root: Path) -> list[str]:\n"
        "    return ['node', '--no-warnings', '--loader', str(root / RELATIVE / 'diagnostic-loader.mjs'),\n"
        "            '--test', '--test-reporter=' + str(root / RELATIVE / 'report-diagnostic.mjs'), TEST]",
        "def test_command(root: Path, normal_sqlite: bool = False) -> list[str]:\n"
        "    command = ['node', '--no-warnings']\n"
        "    if not normal_sqlite:\n"
        "        command += ['--loader', str(root / RELATIVE / 'diagnostic-loader.mjs')]\n"
        "    return command + ['--test',\n"
        "        '--test-reporter=' + str(root / RELATIVE / 'report-diagnostic.mjs'), TEST]")
replace(dir + 'run-diagnostic.py',
        "    parser.add_argument('output', type=Path)\n    args = parser.parse_args()",
        "    parser.add_argument('output', type=Path)\n"
        "    parser.add_argument('--normal-sqlite', action='store_true',\n"
        "                        help='use locked better-sqlite3 without the diagnostic loader')\n"
        "    args = parser.parse_args()")
replace(dir + 'run-diagnostic.py', '    command = test_command(root)',
        '    command = test_command(root, normal_sqlite=args.normal_sqlite)')
replace(dir + 'run-diagnostic.py',
        '"if (entry.term === \'0\') throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);"',
        '"if (entry.term === RAFT_RS_ZERO_INDEX) {\\n"\n'
        '         "        throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);\\n      }"')
replace(dir + 'run-record-controls.py', 'import importlib.util', 'import argparse\nimport importlib.util')
replace(dir + 'run-record-controls.py',
        "    if len(sys.argv) != 2:\n"
        "        raise SystemExit('usage: python run-record-controls.py /isolated/evidence/output')\n"
        "    output = Path(sys.argv[1]).resolve()",
        "    parser = argparse.ArgumentParser(description=__doc__)\n"
        "    parser.add_argument('output', type=Path)\n"
        "    parser.add_argument('--normal-sqlite', action='store_true')\n"
        "    args = parser.parse_args()\n"
        "    output = args.output.resolve()")
replace(dir + 'run-record-controls.py', '    command = diag.test_command(ROOT)',
        '    command = diag.test_command(ROOT, normal_sqlite=args.normal_sqlite)')
replace(dir + 'run-record-controls.py', 'import sys\n', '')
