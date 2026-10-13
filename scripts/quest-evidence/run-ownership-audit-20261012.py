"""Exact WIP preservation/proof for operator audit findings; never merge/approve."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess

BASE = 'd93065458382aad493557f084b5e3afc3f060d1d'
INPUT_TREE = 'f8811d2f569120d275b9a903fdec0ac47c3e4586'
QUEST = 'snapshot-lifecycle-staging-boundary'
TX1 = 'replicated-transaction-decision-and-apply'
ROOT = Path.cwd()
E = ROOT / os.environ['EVIDENCE']
E.mkdir(parents=True, exist_ok=True)
PATCHES = ROOT / f'solve/quests/{TX1}/evidence/ownership-audit-20261012'
BOUNDARY = 'test/raft/raft-rs-backend/operation-port-boundary.test.js'
STAGING = 'test/raft/snapshot-lifecycle-staging.test.js'
NATIVE = 'test/integration/message-group-learner-runtime-authorization.integration.test.js'
OPENING = 'test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js'
SNAPSHOT = 'src/raft/snapshot-install.js'
PORT = 'src/raft/raft-operation-port.js'
AUDIT = "import {auditRaftRsOperationBoundary as audit} from './scripts/checks/raft-rs-operation-boundary-audit.js';const v=audit({root:process.cwd()});console.log(JSON.stringify(v,null,2));process.exitCode=v.length?1:0;"
META = ['test/shards/primary-classes.json', 'test/shards/resource-classes.json',
        'test/shards/subsystem-classes.json', 'test/shards/impact-graph-seal.json']
EXPECTED = {
 'src/raft/snapshot-install.js': '31d998947e8717178f668209e9919d37ce46ea5981348418a5385c465e792c5d',
 'src/raft/raft-rs-replica-lifecycle-owner.js': 'ef9129c4548241b3dc22deca633e013430bc0f6e5f54795d3069969f65e4d778',
 'scripts/checks/raft-rs-operation-boundary-audit.js': '3c4970448aac78988fc230cb51b883b038be4cbf6873419e68c86973bfef98ab',
 'test/shards/impact-contracts.json': 'c8cb4a6d4341ffe3a2eb3cb5cc4500d1fe98119ee194c21a43d7c315c23083d3',
 'test/raft/snapshot-lifecycle-staging.test.js': 'de29c1e8f0e217a8f1db3f68f266a680a85bdf65feb68cc390c63b0a059a18c4',
 'src/raft/raft-operation-port.js': '4ca686604bbe9797a1015808f5702ee137f9c9031e63f09885bb3ef7ad923909',
 'test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js': 'af6043d4e78baa4388376e99069fe87a6535a8b762967dbcbcb737e285b1a9c4',
}

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

def run(name, args, limit=120):
    record = {'command': args, 'completed': False, 'exit': None, 'limitSeconds': limit}
    with (E / f'{name}.log').open('w') as log:
        process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        try:
            record['exit'] = process.wait(timeout=limit)
            record['completed'] = True
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            record['classification'] = 'external-bound-expired; not a passing test result'
    (E / f'{name}.json').write_text(json.dumps(record, indent=2) + '\n')
    return record

def must(name, args, limit=120):
    result = run(name, args, limit)
    assert result['completed'] and result['exit'] == 0, (name, result)
    return result

def commit(message, paths):
    subprocess.run(['git', 'add', '--', *paths], check=True)
    env = {**os.environ, 'LAGRANGE_SKIP_PRECOMMIT': '1'}
    subprocess.run(['git', 'commit', '-m', message], env=env, check=True)
    return git('rev-parse', 'HEAD')

def note(quest, kind, message):
    must(f'note-{quest}-{kind}', ['node', 'scripts/solve.js', 'note', '--id', quest,
                                 '--' + kind, message, '--json'])

def tests(name, paths, limit=120):
    result = run(name, ['npm', 'run', '-s', 'test:file', '--', *paths], limit)
    dest = E / f'{name}-tap'
    dest.mkdir()
    reports = []
    for file in paths:
        source = ROOT / '.tap/test-results' / f'{file}.tap'
        text = source.read_text() if source.exists() else ''
        if source.exists():
            target = dest / f'{file}.tap'
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        counts = {k: int(v) for k, v in re.findall(
            r'^# (tests|pass|fail|skipped|todo|cancelled) (\d+)\s*$', text, re.M)}
        times = [float(v) for v in re.findall(r'^\s+duration_ms:\s*([\d.]+)', text, re.M)]
        bound = 30000 if '.integration.test.js' in file or file.startswith(('test/integration/', 'test/bootstrap/')) else 2000
        reports.append({'file': file, 'counts': counts, 'maxCaseMs': max(times, default=None),
                        'durationLimitMs': bound, 'durationsPass': bool(times) and max(times) <= bound,
                        'sourceSha256': hashlib.sha256((ROOT / file).read_bytes()).hexdigest()})
    result['files'] = reports
    (E / f'{name}.json').write_text(json.dumps(result, indent=2) + '\n')
    return result

def complete_green(result):
    return result['completed'] and result['exit'] == 0 and all(
        f['counts'].get('tests', 0) > 0 and f['counts'].get('fail') == 0 and
        all(f['counts'].get(key) == 0 for key in ['skipped', 'todo', 'cancelled'])
        for f in result['files'])

def audit(name):
    return run(name, ['node', '--input-type=module', '-e', AUDIT])

assert git('rev-parse', 'HEAD:src') == INPUT_TREE
assert git('rev-parse', 'HEAD') == os.environ['GITHUB_SHA']
assert not git('status', '--porcelain')
for name, digest in [('snapshot-source.patch', 'f12875a9bafb33875da154e599bc3d157515d5737c1037ca6efd9b375bd74f0e'),
                     ('opening-observation.patch', 'dbad8595470dd8c08ed86d17f0cee91bcb5aad26215c65fa77d9dc69d124c524')]:
    assert hashlib.sha256((PATCHES / name).read_bytes()).hexdigest() == digest, name
baseline_audit = audit('boundary-baseline')

# Seal a separate bounded staging interaction. No local append-only log replaces
# the remote log; canonical notes append here against the actual current tree.
q = ROOT / f'solve/quests/{QUEST}'
assert not q.exists()
(q / 'evidence').mkdir(parents=True)
required = ['symbol-limited-staging-boundary-and-class-refusal',
            'staging-identity-idempotence-and-refusal', 'native-snapshot-install-regression']
spec = {'schema': 'solve-quest/2', 'id': QUEST, 'class': 'fix', 'epic': 'raft-rs-full-cutover',
        'statement': 'Validated native snapshot installation obtains only a receiver-local immutable staging result from the existing replica lifecycle owner; it cannot import or instantiate the lifecycle class or obtain runtime/retirement capabilities, never ignores a refused staging result, preserves exact active incarnation on retry and refuses conflicting, retired or lifecycle-less surviving native history. Existing CREATE authorization, staging custody, durable native reconstruction and atomic install remain with their existing owners.',
        'doneWhen': {'probe': 'test-receipt', 'args': {'file': f'solve/quests/{QUEST}/evidence/receipt.json', 'requiredReceipts': required}},
        'constraints': [{'id': 'existing-lifecycle-owner', 'statement': 'No second lifecycle store, alternate install path, general allowlist exception, weakened authority check or new runtime capability.'},
                        {'id': 'preserve-history', 'statement': 'Keep prior audits and native failures; no merge without independent review and exact candidate gates.'}]}
(q / 'quest.json').write_text(json.dumps(spec, indent=2) + '\n')
(q / 'evidence/receipt.json').write_text(json.dumps({'schema': 'test-receipt/1', 'quest': QUEST,
 'status': 'fail', 'receipts': [{'id': name, 'passed': False,
 'detail': 'Retained measurements are bounded; complete sealed proof and independent review remain pending.'} for name in required]}, indent=2) + '\n')
(q / 'design.md').write_text('''# Snapshot lifecycle staging boundary -- WIP design

Owner/input and all seven dispositions are in
../../epics/raft-rs-full-cutover/ownership-audit-disposition-20261012.md.
The current snapshot reconstructStagedRaftRsState owns validated CREATE intent,
receiver identity, private staging, native reconstruction and atomic publication.
The NEW prepareReplicaLifecycleForSnapshot operation in the EXISTING lifecycle
owner owns row creation, exact incarnation reuse and typed refusal. No lifecycle
class, runtime, registry entry or retirement capability crosses the boundary.

Matching ACTIVE identity returns frozen CORE_OK with the current incarnation.
Conflicting identity, retirement and surviving native history without lifecycle
refuse through the existing owner. Storage failure propagates; it never creates
success. The snapshot caller checks the answer before native reconstruction.
There is no new cache, retry driver, durable store or install permission.

The boundary checker permits only that static named import at snapshot-install;
namespace, dynamic, mixed, re-export, old class and unrelated-caller imports stay
refused. Positive and negative tests, source-only consumer revert and the real
native snapshot authorization regression are required. This is static confinement,
not a claim of protection against arbitrary trusted-host code. Independent review
must attack invalid identity, refusal propagation in the full installer, failed
staging writes/cleanup and marker recovery. Unmeasured clauses remain open. No
sealed receipt or approving verification is fabricated from a passing unit set.
''')
epic = ROOT / 'solve/epics/raft-rs-full-cutover.md'
anchor = '  - transaction-topology-admission-barrier\n'
text = epic.read_text()
assert text.count(anchor) == 1
text = text.replace(anchor, anchor + '  - ' + QUEST + '\n')
epic.write_text(text)
commit('WIP rs-raft: scope snapshot lifecycle staging without changing release acceptance',
       [str(q.relative_to(ROOT)), str(epic.relative_to(ROOT))])
must('seal-staging', ['node', 'scripts/solve.js', 'start', '--id', QUEST, '--json'])
note(QUEST, 'attempt', 'Narrow lifecycle-owned snapshot staging API; preserve CREATE/install custody, exact incarnation and refusal. Symbol-limited audit and real SQLite/native snapshot witnesses. Independent approval remains absent.')
must('apply-snapshot-check', ['git', 'apply', '--check', str(PATCHES / 'snapshot-source.patch')])
must('apply-snapshot', ['git', 'apply', str(PATCHES / 'snapshot-source.patch')])
must('metadata-staging', ['npm', 'run', '-s', 'test:metadata:refresh'])
commit('WIP rs-raft: route snapshot staging through lifecycle-owned immutable result',
       [SNAPSHOT, 'src/raft/raft-rs-replica-lifecycle-owner.js', 'scripts/checks/raft-rs-operation-boundary-audit.js',
        'test/shards/impact-contracts.json', STAGING, *META, str(q.relative_to(ROOT))])
freeze_baseline = tests('freeze-baseline', [BOUNDARY])

note(TX1, 'finding', 'All seven operator audit findings are dispositioned in the cutover epic. Real WASM commit plus surviving lifecycle and missing native history reopens fresh genesis; uncorrected safety red. Preserve legacy fences and explicit retirement obligations. Latest independent review also requires refusal preservation across cleanup failure.')
note(TX1, 'attempt', 'Reuse canonical deepFreeze in the public operation-port factory; unchanged public-value boundary assertion is the discriminator. Add real WASM intact/lost-history tests; the unsafe lost-history case remains intentionally blocking, not skipped or weakened. No transaction or WASM production path is changed.')
must('apply-opening-check', ['git', 'apply', '--check', str(PATCHES / 'opening-observation.patch')])
must('apply-opening', ['git', 'apply', str(PATCHES / 'opening-observation.patch')])
for file, digest in EXPECTED.items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
must('metadata-opening', ['npm', 'run', '-s', 'test:metadata:refresh'])
candidate = commit('WIP rs-raft: preserve nested port immutability and expose WASM lost-history refusal gap',
                   [PORT, OPENING, *META, f'solve/quests/{TX1}/log.ndjson'])
(E / 'candidate-sha.txt').write_text(candidate + '\n')
(E / 'candidate-content.json').write_text(json.dumps(EXPECTED, indent=2) + '\n')
(E / 'source.patch').write_text(subprocess.check_output(['git', 'diff', BASE, '--', 'src', 'scripts/checks/raft-rs-operation-boundary-audit.js'], text=True))

snapshot_tests = tests('snapshot-candidate', [STAGING, NATIVE, BOUNDARY])
opening_tests = tests('wasm-history', [OPENING])
prior = ['operation-port-provenance.test.js', 'operation-port-ready-recovery.test.js',
 'operation-port-throw-containment.test.js', 'operation-port-lifecycle.test.js',
 'lifecycle-registry-runtime-generation.test.js', 'durable-rejoin-record-refusal.test.js',
 'restart-from-durable-record.test.js', 'partition-construction-seam.test.js',
 'participation-gate.test.js', 'runtime-trap-and-restore.test.js',
 'message-group-on-raft-rs.test.js', 'wasm-service-group-on-raft-rs.test.js',
 'runtime-load-recovery.integration.test.js', 'runtime-replacement-review.integration.test.js']
regressions = tests('prior-regressions', ['test/raft/raft-rs-backend/' + p for p in prior] +
                    ['test/partition/partition-port-refusal-outcomes.test.js'])
boundary_candidate = audit('boundary-candidate')

# Restore only each consumer under test, keeping the new checker and all tests.
p = ROOT / SNAPSHOT
saved = p.read_bytes()
try:
    p.write_bytes(subprocess.check_output(['git', 'show', f'{BASE}:{SNAPSHOT}']))
    boundary_revert = audit('boundary-source-revert')
finally:
    p.write_bytes(saved)
p = ROOT / PORT
saved = p.read_bytes()
try:
    p.write_bytes(subprocess.check_output(['git', 'show', f'{BASE}:{PORT}']))
    freeze_revert = tests('freeze-source-revert', [BOUNDARY])
finally:
    p.write_bytes(saved)
must('source-restored', ['git', 'diff', '--exit-code', '--', 'src'])

lint = run('lint', ['npx', 'eslint', SNAPSHOT, PORT, 'src/raft/raft-rs-replica-lifecycle-owner.js',
 'scripts/checks/raft-rs-operation-boundary-audit.js', STAGING, OPENING])
literals = run('changed-literals', ['node', 'scripts/check-guideline-literals.js', SNAPSHOT,
                                  PORT, 'src/raft/raft-rs-replica-lifecycle-owner.js'])
impact = run('impact', ['npm', 'run', '-s', 'audit:impact-contracts'])
guidelines = run('guidelines', ['npm', 'run', '-s', 'audit:guidelines'])
whitespace = run('whitespace', ['git', 'diff', '--check', BASE])

wasm_text = (E / 'wasm-history-tap' / f'{OPENING}.tap').read_text()
freeze_text = (E / 'freeze-source-revert-tap' / f'{BOUNDARY}.tap').read_text()
checks = {
 'exact-local-source-content': True,
 'snapshot-behavioral-cases': complete_green(snapshot_tests),
 'prior-regression-cases': complete_green(regressions),
 'snapshot-duration-bars': all(f['durationsPass'] for f in snapshot_tests['files']),
 'prior-regression-duration-bars': all(f['durationsPass'] for f in regressions['files']),
 'boundary-positive': boundary_candidate['exit'] == 0 and (E / 'boundary-candidate.log').read_text().strip() == '[]',
 'boundary-old-source-negative': boundary_revert['exit'] == 1 and 'lifecycle-owner-import-bypass' in (E / 'boundary-source-revert.log').read_text(),
 'public-freeze-negative': freeze_baseline['exit'] == 1 and freeze_revert['exit'] == 1 and
  'every public value, function and nested result is frozen' in freeze_text,
 'wasm-loss-reproduced': opening_tests['exit'] == 1 and opening_tests['files'][0]['counts'].get('tests') == 12 and
  opening_tests['files'][0]['counts'].get('pass') == 11 and opening_tests['files'][0]['counts'].get('fail') == 1 and
  'surviving lifecycle history must not be reopened as fresh genesis' in wasm_text,
 'lint': lint['exit'] == 0, 'changed-literals': literals['exit'] == 0,
 'impact': impact['exit'] == 0, 'whitespace': whitespace['exit'] == 0,
}
summary = {'candidate': candidate, 'input': BASE, 'checks': checks,
 'snapshotTests': snapshot_tests, 'priorRegressions': regressions, 'openingTests': opening_tests,
 'allSevenFindingsDispositioned': True, 'wasmHistoryFixed': False,
 'transactionMigrationClosed': False, 'cleanupRefusalReviewClosed': False,
 'guidelineExit': guidelines['exit'], 'independentApproval': False,
 'questLanded': False, 'mergeReady': False, 'allRunGatesPassed': False,
 'scope': 'Bounded native/SQLite snapshot and operation-port tests; WASM lost-history remains an ordinary failing safety test. No physical multi-host or full release certification.'}
(E / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'checks': checks, 'mergeReady': False}, indent=2))
assert not git('diff', '--name-only', '--', 'src')
