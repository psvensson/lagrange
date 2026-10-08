#!/usr/bin/env python3
"""Bounded PR109 self-review. No production edits and no Solver probe work."""
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path.cwd()
OUT = Path(os.environ['PROOF_OUT'])
HELPER = Path('test/raft/raft-rs-backend/partition-node-cluster.js')
RESTART = 'test/raft/raft-rs-backend/evidence-o1-restart-equivalence.test.js'
CONSUMER = Path('test/integration/message-group-learner-runtime-authorization.integration.test.js')
QUEST = Path('solve/quests/message-group-fresh-identity-membership')


def run(name, command, timeout=180, expected=0):
    start = time.monotonic()
    (OUT / (name + '.command.json')).write_text(json.dumps(command) + '\n')
    with (OUT / (name + '.stdout.txt')).open('wb') as out, (OUT / (name + '.stderr.txt')).open('wb') as err:
        result = subprocess.run(command, stdout=out, stderr=err, timeout=timeout)
    record = {'exit': result.returncode, 'wallSeconds': time.monotonic() - start}
    (OUT / (name + '.result.json')).write_text(json.dumps(record, indent=2) + '\n')
    print(name, record, flush=True)
    if expected is not None:
        assert result.returncode == expected, (name, result.returncode)
    return record


def test(name, *paths, expected=0):
    return run(name, ['npm', 'run', 'test:file', '--', *paths], expected=expected)


def rows(name):
    text = (OUT / (name + '.stdout.txt')).read_text()
    found = re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)', text, re.M)
    return [{'path': path, 'reportedAssertions': int(count), 'durationMs': int(ms)}
            for path, count, ms in found]


def replace_once(text, old, new):
    assert text.count(old) == 1, ('changed anchor', old[:100])
    return text.replace(old, new, 1)


def fixture_change():
    original = HELPER.read_text()
    text = replace_once(original, "import Database from 'better-sqlite3';", """import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import {SQLITE_STORE_PRAGMA} from '../../../src/storage/sqlite-store-constants.js';
import {RAFT_RS_SYNCHRONOUS_PRAGMA} from
  '../../../src/raft/raft-rs-durable-store-constants.js';""")
    text = replace_once(text, '    const openedDatabase = new Database(dbFile);', """    const openedDatabase = new Database(dbFile);
    // Use the partition's WAL journal, but retain the stricter default FULL
    // synchronization for ALL fixture commits. Native Ready durability and
    // independent disk oracles remain unchanged, including on every reopen.
    openedDatabase.pragma(SQLITE_STORE_PRAGMA.JOURNAL_MODE_WAL);
    assert.equal(openedDatabase.pragma('journal_mode', {simple: true}), 'wal',
      'partition fixture must use the production WAL journal');
    assert.equal(openedDatabase.pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.READ,
      {simple: true}), RAFT_RS_SYNCHRONOUS_PRAGMA.FULL_LEVEL,
    'partition fixture must retain FULL synchronization');""")
    HELPER.write_text(text)
    return original, text


def assert_marker(name, marker):
    text = (OUT / (name + '.stdout.txt')).read_text() + (OUT / (name + '.stderr.txt')).read_text()
    assert marker in text and 'ERR_ASSERTION' in text, (name, 'wrong failure', marker)


def measure_boot_window():
    original = CONSUMER.read_text()
    text = replace_once(original, '  let beforeNodes = null;',
                        '  let beforeNodes = null;\n  let beforeOperation = null;')
    text = replace_once(text, "      if (table === 'nodes' && beforeNodes) await beforeNodes();",
        "      if (table === 'nodes' && beforeNodes) await beforeNodes();\n" +
        "      if (table === 'replica_operations' && beforeOperation) await beforeOperation();")
    text = replace_once(text, '    pauseNodes: (callback) => {',
        '    pauseOperation: (callback) => { beforeOperation = callback; },\n    pauseNodes: (callback) => {')
    at = text.index("    await t.test('request and host binding mutations during the read cannot retarget the proposal'")
    text = text[:at] + """    await t.test('R3 final operation await can outlive the canonical boot observation', async (t) => {
      const f = await fixture(t);
      let enter;
      let release;
      const entered = new Promise((resolve) => { enter = resolve; });
      const held = new Promise((resolve) => { release = resolve; });
      let reads = 0;
      f.pauseOperation(async () => {
        reads += 1;
        if (reads === 2) { enter(); await held; }
      });
      t.after(() => release());
      const before = f.proposalCount();
      const pending = f.run();
      await entered;
      f.execute('UPDATE nodes SET boot_incarnation = 2 WHERE node_id = ?', [NODE]);
      assert.equal(f.db.prepare('SELECT boot_incarnation FROM nodes WHERE node_id = ?')
        .get(NODE).boot_incarnation, 2, 'actual node row changed while final read is pending');
      release();
      const result = await pending;
      t.diagnostic(JSON.stringify({kind: 'r3-final-read-boot-window', reads,
        canonicalBoot: 2, requestedBoot: 1, outcome: result.outcome,
        reason: result.reason, nativeProposalDelta: f.proposalCount() - before}));
      assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        'stale boot after final operation await must not reach native proposal');
      assertNoProposal(f, before);
    });
""" + text[at:]
    try:
        CONSUMER.write_text(text)
        (OUT / 'boot-window-test.js').write_text(text)
        result = test('boot-window-red', str(CONSUMER), expected=1)
        assert_marker('boot-window-red', 'stale boot after final operation await must not reach native proposal')
        run('boot-window-patch', ['git', 'diff', '--', str(CONSUMER)])
        return {'measured': True, 'resolved': False, 'result': result,
                'ceiling': 'supplied boot row and real native port; sender/recipient share one node fixture; no independent cross-group or physical proof'}
    finally:
        CONSUMER.write_text(original)


def correct_evidence():
    machine = json.loads((QUEST / 'evidence/lab-attribution-37803287356.json').read_text())
    actual = [item for item in machine['comparison']
              if item['base']['ok'] and item['candidate']['ok']]
    assert len(actual) == 1
    assert actual[0]['file'] == 'test/rebalancer/replace-replica-workflow.test.js'
    owner = next(item for item in machine['comparison']
                 if item['file'] == 'test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js')
    assert not owner['base']['ok'] and not owner['candidate']['ok']
    digest = machine['canonicalEvidence']['uploaded']['sha256']
    assert digest == machine['archiveSha256']
    assert machine['canonicalEvidence']['entry']['evidence'] == 'sha256:' + digest
    correction = {'schema': 'lab-attribution-correction/1',
                  'supersedesProseOnly': 'lab-20261008T150005Z-followup.md',
                  'findings': [4222356651, 4222356687],
                  'gcpPassBoth': actual[0], 'ownerPathFailedBoth': owner,
                  'canonicalSha256': digest, 'rawHistoricalEvidenceChanged': False}
    (OUT / 'lab-correction.json').write_text(json.dumps(correction, indent=2) + '\n')
    dest = QUEST / 'evidence/lab-attribution-37803287356-correction.md'
    assert not dest.exists()
    dest.write_text('# Correction to the lab-attribution prose\n\n'
        'This append-only correction overrides two statements in '
        '`lab-20261008T150005Z-followup.md`. The original machine evidence '
        'and original lab verdict are unchanged.\n\n'
        'The file passing at BOTH GCP checkouts was '
        '`test/rebalancer/replace-replica-workflow.test.js`, not '
        '`rebalance-coordinator-owner-path-convergence.test.js`; the latter '
        'failed at both checkouts. The original lab failure is not erased.\n\n'
        'The canonical archive digest, derived from all three matching machine '
        'record fields, is:\n\n`' + digest + '`\n\n'
        'The previously written `d1183234...a516bb` value was not that '
        'canonical digest. No new test, causal attribution or source approval '
        'is claimed by this correction.\n')


def main():
    subprocess.run(['node', '--input-type=module', '-e',
        "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; "
        "refuseUnderProbe('the PR109 self-review harness');"], check=True)
    OUT.mkdir(parents=True, exist_ok=True)
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == os.environ['EXPECTED']
    assert not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()
    run('source-manifest', ['git', 'ls-tree', '-r', 'HEAD', '--', 'src', str(HELPER), RESTART, str(CONSUMER)])
    run('fixture-before-mode', ['node', '--input-type=module', '-e',
        "import Database from 'better-sqlite3'; import fs from 'node:fs'; "
        "import os from 'node:os'; import path from 'node:path'; "
        "const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r3-sqlite-mode-')); "
        "const db=new Database(path.join(dir,'mode.sqlite')); "
        "try {console.log(JSON.stringify({journal:db.pragma('journal_mode',{simple:true}),"
        "synchronous:db.pragma('synchronous',{simple:true})}));} "
        "finally {db.close();fs.rmSync(dir,{recursive:true,force:true});}"])
    test('restart-before', RESTART)
    before = rows('restart-before')
    assert len(before) == 1
    original, changed = fixture_change()
    try:
        run('fixture-lint', ['npm', 'exec', '--no', '--', 'eslint', str(HELPER), '--fix'])
        changed = HELPER.read_text()
        run('fixture-metrics', ['npm', 'run', 'test:metrics:scoped:strict', '--', str(HELPER)])
        test('restart-after', RESTART)
        after = rows('restart-after')
        assert len(after) == 1
        assert before[0]['reportedAssertions'] == after[0]['reportedAssertions'] == 16
        test('consumer-and-neighbor', str(CONSUMER),
             'test/raft/raft-rs-backend/evidence-o1-admission-liveness.test.js',
             'test/raft/raft-rs-backend/evidence-o1-proposal-ingress.test.js')
        window = measure_boot_window()
        for name, old, new, marker in [
            ('missing-wal', '    openedDatabase.pragma(SQLITE_STORE_PRAGMA.JOURNAL_MODE_WAL);', '',
             'partition fixture must use the production WAL journal'),
            ('weakened-sync', '    openedDatabase.pragma(SQLITE_STORE_PRAGMA.JOURNAL_MODE_WAL);',
             "    openedDatabase.pragma(SQLITE_STORE_PRAGMA.JOURNAL_MODE_WAL);\n    openedDatabase.pragma('synchronous = NORMAL');",
             'partition fixture must retain FULL synchronization')]:
            try:
                HELPER.write_text(replace_once(changed, old, new))
                test('mutation-' + name, RESTART, expected=1)
                assert_marker('mutation-' + name, marker)
            finally:
                HELPER.write_text(changed)
        correct_evidence()
        report = {'schema': 'freshmg-self-review-r3/1', 'baseSha': os.environ['EXPECTED'],
                  'before': before, 'after': after, 'restartBudgetMs': 2000,
                  'restartBudgetSatisfied': after[0]['durationMs'] <= 2000,
                  'neighborResults': rows('consumer-and-neighbor'),
                  'all16CasesPreserved': True, 'productionSourceChanged': False,
                  'journalChange': 'fixture DELETE/FULL -> WAL/FULL',
                  'mutationControls': ['missing-wal', 'weakened-sync'], 'bootWindow': window,
                  'independentApproval': False, 'fullLabVerdict': 'FAIL', 'distributedAcceptance': False}
        (OUT / 'review-r3.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2), flush=True)
    except BaseException:
        (OUT / 'proposed-fixture-helper.js').write_text(HELPER.read_text())
        HELPER.write_text(original)
        raise
    run('runtime-unchanged', ['git', 'diff', '--exit-code', os.environ['EXPECTED'], '--', 'src'])
    run('diff-check', ['git', 'diff', '--check'])


if __name__ == '__main__':
    main()
