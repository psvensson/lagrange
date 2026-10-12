"""Measure real participant admission; fixture repair is not a production repair."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path.cwd()
OUT = Path(os.environ['EVIDENCE']) / 'measurement'
OUT.mkdir(parents=True, exist_ok=False)
ENV = dict(os.environ, LAGRANGE_RETRY_FAILED_ONCE='0')
BASE = os.environ.get('PROOF_BASE', '64b85decf37d58d9c52cabbd95b207ae027bd050')
SOURCE_TREE = '34af50ee2245c8bd99b0f87e484beb6871d11c3c'
PARTITION = 'test/partition/partition-unreadable-durable-record.test.js'
NATIVE = 'test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js'
RESTART = 'test/integration/transaction-coordinator-restart.integration.test.js'
FIXTURE = 'test/test-helpers/transaction-coordinator-group-fixture.js'
HELPER = 'test/partition/partition-release-fixture.js'
FENCE = 'src/partition/partition-participant-transaction-legacy-fence.js'
FOCUSED = [PARTITION, NATIVE, RESTART]
WIDER = FOCUSED + [
    'test/partition/participant-release-protocol.test.js',
    'test/partition/partition-participant-transaction-apply.test.js',
    'test/partition/participant-decision-canonical-record.test.js',
    'test/query/transaction-coordinator-participant-protocol.test.js',
    'test/query/transaction-evidence-binding-production.test.js',
    'test/query/transaction-recovery-ownership.test.js',
    'test/query/transaction-begin-collision-production.test.js',
    'test/partition/partition-transaction-replicated-apply-v3.test.js',
    'test/raft/raft-rs-backend/operation-port-ready-recovery.test.js',
    'test/raft/raft-rs-backend/operation-port-provenance.test.js',
    'test/raft/raft-rs-backend/runtime-opening-history.integration.test.js',
    'test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js',
    'test/raft/raft-rs-backend/startup-cleanup.integration.test.js',
    'test/node/replica-runtime-cleanup-custody.integration.test.js',
    'test/partition/partition-participant-transaction-staging.test.js',
    'test/partition/partition-legacy-session-statement-admission.test.js',
]


def git(*args):
    return subprocess.check_output(['git', *args], env=ENV).decode().strip()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def command(name, args, limit=360):
    with (OUT / (name + '.log')).open('xb') as log:
        try:
            result = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT,
                                    env=ENV, timeout=limit)
            code = result.returncode
        except subprocess.TimeoutExpired:
            code = 124
            log.write(b'\nINCOMPLETE: outer measurement limit, not behavioral evidence\n')
    (OUT / (name + '-exit.txt')).write_text(str(code) + '\n')
    return code


def measure(name, files):
    before = {file: digest(Path(file).read_bytes()) for file in files}
    code = command(name, ['npm', 'run', '-s', 'test:file', '--', *files])
    tap = OUT / (name + '-tap')
    if Path('.tap/test-results').exists():
        shutil.move('.tap/test-results', tap)
    reports = []
    classes = json.loads(Path('test/shards/primary-classes.json').read_text())['classes']
    for file in files:
        p = tap / (file + '.tap')
        text = p.read_text() if p.exists() else ''
        counts = {}
        for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
            found = re.search(r'^# ' + key + r' (\d+)\s*$', text, re.M)
            counts[key] = int(found[1]) if found else None
        durations = [float(value) for value in re.findall(r'^\s*duration_ms: ([\d.]+)', text, re.M)]
        target = {'unit': 2000, 'integration': 30000}.get(classes[file])
        reports.append({'file': file, 'counts': counts,
                        'failed': re.findall(r'^not ok \d+ - (.*)$', text, re.M),
                        'assertionFailures': text.count("code: 'ERR_ASSERTION'"),
                        'testSha256': before[file], 'class': classes[file],
                        'maxCaseMs': max(durations) if durations else None,
                        'targetMs': target, 'toleranceMs': target * 10 if target else None,
                        'durationWithinTolerance': bool(durations) and target is not None and max(durations) <= target * 10})
        assert before[file] == digest(Path(file).read_bytes())
    result = {'exit': code, 'files': reports}
    (OUT / (name + '.json')).write_text(json.dumps(result, indent=2) + '\n')
    return result


def totals(result):
    return {key: sum(row['counts'][key] or 0 for row in result['files'])
            for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}


def engaged(result):
    return result['exit'] in [0, 1] and all(row['counts']['tests'] and
        all(row['counts'][key] == 0 for key in ['cancelled', 'skipped', 'todo'])
        for row in result['files'])


candidate = git('rev-parse', 'HEAD')
assert git('rev-parse', 'HEAD:src') == git('rev-parse', BASE + ':src') == SOURCE_TREE
assert not git('status', '--porcelain'), 'measurement begins on the exact clean candidate'
# Retain AS-SHIPPED tests and their own composition, not pretend identical tests
# expose a new production fix. The runtime source is unchanged in every arm.
originals = {file: Path(file).read_bytes() for file in FOCUSED + [FIXTURE]}
try:
    for file in originals:
        Path(file).write_bytes(subprocess.check_output(['git', 'show', BASE + ':' + file]))
    as_shipped = measure('as-shipped-fixtures', FOCUSED)
finally:
    for file, data in originals.items():
        Path(file).write_bytes(data)
assert not git('status', '--porcelain')
focused = measure('candidate-focused', FOCUSED)
# A real semantic negative: UNKNOWN cannot be replaced by an invented decision.
p = Path(FENCE)
original = p.read_bytes()
needle = b'PARTICIPANT_COMMIT_OUTCOME.UNKNOWN : legacy};'
assert original.count(needle) == 1
mutant = original.replace(needle, b'PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED : legacy};', 1)
try:
    p.write_bytes(mutant)
    negative = measure('legacy-outcome-negative', [NATIVE])
finally:
    p.write_bytes(original)
assert command('restored-source', ['git', 'diff', '--exit-code', '--', 'src']) == 0
wider = measure('wider', WIDER)
checks = {}
checks['as-shipped-preconditions-reproduced'] = engaged(as_shipped) and totals(as_shipped)['tests'] == 12 and totals(as_shipped)['fail'] == 12 and all(row['assertionFailures'] == row['counts']['fail'] for row in as_shipped['files'])
checks['candidate-focused'] = engaged(focused) and focused['exit'] == 0 and totals(focused)['tests'] == totals(focused)['pass'] == 13
n = negative['files'][0]
checks['negative-engaged'] = engaged(negative) and negative['exit'] == 1 and totals(negative)['tests'] == 6 and totals(negative)['pass'] == 5 and n['assertionFailures'] == 1 and len(n['failed']) == 1 and n['failed'][0].startswith('TX1 native L6:')
checks['negative-test-unchanged'] = n['testSha256'] == focused['files'][1]['testSha256']
checks['source-unchanged'] = p.read_bytes() == original and git('rev-parse', 'HEAD:src') == SOURCE_TREE and not git('status', '--porcelain')
checks['focused-timing-tolerance'] = all(row['durationWithinTolerance'] for row in focused['files'])
checks['all-wider-files-engaged'] = engaged(wider) and len(wider['files']) == 19 and totals(wider)['tests'] == 251
commands = {
    'lint': ['node_modules/.bin/eslint', *FOCUSED, FIXTURE, HELPER],
    'impact': ['npm', 'run', '-s', 'audit:impact-contracts'],
    'boundary': ['node', '--input-type=module', '-e', "import {auditRaftRsOperationBoundary} from './scripts/checks/raft-rs-operation-boundary-audit.js';const v=auditRaftRsOperationBoundary({root:process.cwd()});console.log(JSON.stringify(v,null,2));process.exitCode=v.length?1:0;"],
    'shards': ['npm', 'run', '-s', 'audit:shards'],
    'whitespace': ['git', 'diff', '--check', BASE, 'HEAD'],
}
for name, args in commands.items():
    checks[name] = command(name, args) == 0
# Historical patch-artifact whitespace is not a failure in this changed test
# delta. Keep the complete-range gate above separate from the exact source base.
checks['changed-delta-whitespace'] = command('changed-delta-whitespace', ['git', 'diff', '--check', 'HEAD^1', 'HEAD']) == 0
code = command('guidelines', ['npm', 'run', '-s', 'audit:guidelines'])
summary = {'candidate': candidate, 'publishedInput': BASE, 'productionSourceTree': SOURCE_TREE,
           'productionChanged': False, 'checks': checks, 'asShippedFixtures': totals(as_shipped),
           'focused': totals(focused), 'negative': totals(negative), 'wider': totals(wider),
           'widerFailedFiles': [row['file'] for row in wider['files'] if row['counts']['fail']],
           'widerOverTolerance': [row['file'] for row in wider['files'] if not row['durationWithinTolerance']],
           'guidelineExit': code, 'independentApproval': False, 'mergeReady': False,
           'negativeSource': {'path': FENCE, 'originalSha256': digest(original), 'mutantSha256': digest(mutant), 'restored': p.read_bytes() == original},
           'scope': 'Actual three-replica participant Raft/SQLite and real release-owner requests; six engaged storage faults; SQL engine recovery over a local coordinator gateway double. No replicated coordinator-store, coordinator process-kill, historical legacy-session migration, downstream CDC delivery, split/merge or physical multi-host certification.'}
summary['focusedProofPassed'] = all(value for key, value in checks.items() if key not in ['whitespace'])
summary['allRunGatesPassed'] = all(checks.values()) and wider['exit'] == 0 and totals(wider)['fail'] == 0 and code == 0
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
(OUT / 'final-status.txt').write_text(git('status', '--porcelain') + '\n')
(OUT / 'source-identities.json').write_text(json.dumps({file: digest(Path(file).read_bytes()) for file in WIDER + [FIXTURE, HELPER, FENCE]}, indent=2) + '\n')
print(json.dumps(summary, indent=2))
