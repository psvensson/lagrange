#!/usr/bin/env python3
"""Read-owner diagnostic and exact-assertion mutations in an isolated checkout."""
import importlib.util
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('diagnostic', HERE / 'run-diagnostic.py')
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)
ROOT = HERE.parents[4]
TEST = 'test/raft/raft-rs-backend/issued-action-record-read.test.js'
SOURCE = 'src/raft/raft-rs-durable-store.js'
TESTS = (
    'owner-selected action read is read-only and bound to the requested stored group',
    'applied and committed beyond retained history cannot produce evidence',
    'an interior gap in the complete retained suffix cannot produce evidence',
    'decreasing retained terms cannot produce evidence',
    'a snapshot-anchored compacted prefix is supported without fabricating covered receipts',
    'a pruned prefix without a snapshot and an impossible snapshot boundary are refused',
    'action reads refuse both caller and store-owned uncommitted transactions',
    'one read snapshot survives a real writer commit between record SELECTs',
    'read failures never recreate missing tables or manufacture a receipt',
)


def main():
    diag.refuse_under_probe(ROOT)
    if len(sys.argv) != 2:
        raise SystemExit('usage: python run-record-controls.py /isolated/evidence/output')
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    source = ROOT / SOURCE
    original = source.read_bytes()
    command = diag.test_command(ROOT)
    command[-1] = TEST
    rows = []

    def run(name, old=None, new=None, failure=None):
        changed = None
        if old is not None:
            assert original.decode().count(old) == 1, (name, 'mutation target drift')
            changed = original.decode().replace(old, new).encode()
        row, stdout = diag.execute(ROOT, output, name, command, source, original, changed)
        row['accepted'] = False
        rows.append(row)
        try:
            diag.accept_measurement(row, diag.parse_events(stdout), ROOT / TEST,
                                    failure, expected_tests=TESTS)
            row['accepted'] = True
            row['requiredFailure'] = failure
        finally:
            (output / 'results.json').write_text(json.dumps(rows, indent=2) + '\n')

    run('record-positive')
    mutations = [
        ('record-progress', 'return boundary.committed <= previousIndex;', 'return true;',
         TESTS[1], 'the store must refuse progress beyond its retained suffix'),
        ('record-gap', 'index !== previousIndex + 1n', 'index <= previousIndex',
         TESTS[2], 'the store must refuse an unexplained interior log gap'),
        ('record-term-order', 'term < previousTerm', 'false', TESTS[3],
         'the store must refuse decreasing terms across increasing indices'),
        ('record-read-snapshot',
         'return this.db.transaction(() =>\n        readActionEvidenceIn(this.db, groupId, action, decodeEntry))();',
         'return readActionEvidenceIn(this.db, groupId, action, decodeEntry);', TESTS[7],
         'later SELECTs must not incorporate the intervening writer commit'),
        ('record-uncommitted',
         'if (this.db.inTransaction) {\n      return actionEvidenceUnavailable(',
         'if (false) {\n      return actionEvidenceUnavailable(', TESTS[6],
         'an uncommitted view must not be labeled durable'),
        ('record-covered-suffix', 'if (index <= boundary.snapshotIndex) continue;',
         'if (false) continue;', TESTS[4], 'covered residual bytes are not snapshot provenance'),
        ('record-group-binding', 'const record = readDurableRecordIn(db, groupId);',
         "const record = readDurableRecordIn(db, 'owned-action-read');", TESTS[0],
         'a caller group label cannot relabel a different group record'),
    ]
    for name, old, new, test, assertion in mutations:
        run(name, old, new, (test, assertion))
    run('record-restored-positive')
    assert source.read_bytes() == original
    print(json.dumps(rows, indent=2))


if __name__ == '__main__':
    main()
