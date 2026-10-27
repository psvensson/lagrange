"""Measure exact envelope source controls and the real M1 persistence fixture.

A completed measurement is not independent review or merge approval. Failed wider
fixtures and wait-bound diagnostics stay in the retained results.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path.cwd()
OUT = Path(os.environ['EVIDENCE'])
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('PROOF_BASE', '4c8f02e8e6d9da3520fa909885b9391ba6a442a0')
SOURCE = 'src/partition/partition-participant-transaction-bytes.js'
FOCUSED = 'test/partition/participant-envelope-admission.test.js'
M1 = 'test/integration/seed-migration-cutover-persisted.integration.test.js'
ENV = dict(os.environ, LAGRANGE_RETRY_FAILED_ONCE='0')
WIDER = [
    'test/partition/partition-unreadable-durable-record.test.js',
    'test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js',
    'test/integration/transaction-coordinator-restart.integration.test.js',
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
    FOCUSED, M1,
]


def git(*args):
    return subprocess.check_output(['git', *args], env=ENV).decode().strip()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(label, args, limit=600):
    with (OUT / (label + '.log')).open('xb') as log:
        try:
            result = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT,
                                    env=ENV, timeout=limit)
            code = result.returncode
        except subprocess.TimeoutExpired:
            log.write(b'\nINCOMPLETE: outer run limit, not a behavioral verdict.\n')
            code = 124
    (OUT / (label + '.exit')).write_text(str(code) + '\n')
    return code


def measure(label, files):
    before = {name: sha(Path(name).read_bytes()) for name in files}
    code = run(label, ['npm', 'run', '-s', 'test:file', '--', *files])
    tap = OUT / (label + '-tap')
    if Path('.tap/test-results').exists():
        shutil.move('.tap/test-results', tap)
    observations = []
    for name in files:
        raw = tap / (name + '.tap')
        text = raw.read_text() if raw.exists() else ''
        counts = {}
        for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
            found = re.search(r'^# ' + key + r' (\d+)\s*$', text, re.M)
            counts[key] = int(found.group(1)) if found else None
        durations = [float(x) for x in re.findall(r'^\s*duration_ms: ([\d.]+)', text, re.M)]
        target = 30000 if '.integration.test.js' in name else 2000
        observations.append({
            'file': name, 'counts': counts,
            'names': re.findall(r'^# Subtest: (.*)$', text, re.M),
            'failed': re.findall(r'^not ok \d+ - (.*)$', text, re.M),
            'assertionFailures': text.count("code: 'ERR_ASSERTION'"),
            'testSha256': before[name],
            'testUnchanged': before[name] == sha(Path(name).read_bytes()),
            'maxCaseMs': max(durations) if durations else None,
            'targetMs': target, 'toleranceMs': target * 10,
            'durationWithinTolerance': bool(durations) and max(durations) <= target * 10,
            'waitBoundDiagnostics': text.count('"event":"wait_bound_spent"'),
            'independentM1Readback': '"kind":"TX1_M1_PERSISTENCE"' in text and
                                    '"distinctFiles":12' in text and
                                    '"independentlyReadAfterShutdown":true' in text,
        })
    result = {'exit': code, 'files': observations}
    (OUT / (label + '.json')).write_text(json.dumps(result, indent=2) + '\n')
    return result


def complete(result):
    return all(f['counts']['tests'] is not None and f['counts']['tests'] > 0 and
               all(f['counts'][k] == 0 for k in ['cancelled', 'skipped', 'todo']) and
               f['testUnchanged'] for f in result['files'])


def totals(result):
    return {k: sum(f['counts'][k] or 0 for f in result['files'])
            for k in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}


assert not git('status', '--porcelain'), 'start only from a clean, committed candidate'
candidate = git('rev-parse', 'HEAD')
source_tree = git('rev-parse', 'HEAD:src')
old = subprocess.check_output(['git', 'show', BASE + ':' + SOURCE])
new = Path(SOURCE).read_bytes()
assert old != new
(OUT / 'source-identities.json').write_text(json.dumps({
    'path': SOURCE, 'baseline': BASE, 'candidate': candidate,
    'beforeSha256': sha(old), 'afterSha256': sha(new),
    'sourceTree': source_tree, 'testTree': git('rev-parse', 'HEAD:test'),
}, indent=2) + '\n')
try:
    Path(SOURCE).write_bytes(old)
    original = measure('envelope-original-source', [FOCUSED])
finally:
    Path(SOURCE).write_bytes(new)
positive = measure('envelope-candidate', [FOCUSED])
try:
    Path(SOURCE).write_bytes(old)
    reverted = measure('envelope-source-revert', [FOCUSED])
finally:
    Path(SOURCE).write_bytes(new)
assert Path(SOURCE).read_bytes() == new
assert not git('diff', '--', 'src')
wider = measure('wider', WIDER)
changed = [SOURCE, FOCUSED, 'test/test-helpers/participant-transaction-fixture.js',
           'test/partition/partition-participant-transaction-apply.test.js',
           'test/partition/partition-participant-transaction-staging.test.js', M1,
           'test/integration/helpers/tx1-migration-disk-reader.js']
run('lint', ['node_modules/.bin/eslint', *changed])
run('changed-literals', ['node', '--input-type=module', '-e',
    "import {collectMagicLiteralViolations} from './scripts/check-guideline-literals.js';"
    "const v=collectMagicLiteralViolations(JSON.parse(process.argv[1]),{});"
    "console.log(JSON.stringify(v));process.exitCode=v.length?1:0;", json.dumps([SOURCE])])
run('impact', ['npm', 'run', '-s', 'audit:impact-contracts'])
run('shards', ['npm', 'run', '-s', 'audit:shards'])
run('boundary', ['node', '--input-type=module', '-e',
    "import {auditRaftRsOperationBoundary} from './scripts/checks/raft-rs-operation-boundary-audit.js';"
    "const v=auditRaftRsOperationBoundary({root:process.cwd()});"
    "console.log(JSON.stringify(v));process.exitCode=v.length?1:0;"])
run('whitespace', ['git', 'diff', '--check', BASE, 'HEAD'])
guidelines = run('guidelines', ['npm', 'run', '-s', 'audit:guidelines'])
a, c, r = (result['files'][0] for result in [original, positive, reverted])
m1 = next(f for f in wider['files'] if f['file'] == M1)
checks = {
    'negative-assertions': complete(original) and complete(reverted) and
        original['exit'] == reverted['exit'] == 1 and
        a['counts']['tests'] == r['counts']['tests'] == 2 and
        a['counts']['fail'] == r['counts']['fail'] == 1 and
        a['failed'] == r['failed'] == [c['names'][0]] and
        a['assertionFailures'] == r['assertionFailures'] == 1,
    'candidate-envelope': complete(positive) and positive['exit'] == 0 and
        c['counts']['tests'] == c['counts']['pass'] == 2,
    'identical-control-tests': a['testSha256'] == c['testSha256'] == r['testSha256'] and
        a['names'] == c['names'] == r['names'],
    'm1-persistence': m1['counts']['tests'] == m1['counts']['pass'] == 1 and
        m1['independentM1Readback'],
    'all-wider-files-engaged': complete(wider) and len(wider['files']) == len(WIDER),
    'wider-behavior': complete(wider) and wider['exit'] == 0 and totals(wider)['fail'] == 0,
    'duration-tolerance': all(f['durationWithinTolerance'] for f in wider['files']),
    'source-restored': Path(SOURCE).read_bytes() == new and not git('diff', '--', 'src'),
}
for label in ['lint', 'changed-literals', 'impact', 'shards', 'boundary', 'whitespace']:
    checks[label] = (OUT / (label + '.exit')).read_text().strip() == '0'
summary = {
    'candidate': candidate, 'baseline': BASE, 'sourceTree': source_tree,
    'checks': checks, 'envelopeOriginal': totals(original),
    'envelopeCandidate': totals(positive), 'envelopeSourceRevert': totals(reverted),
    'wider': totals(wider), 'widerFailedFiles': [f['file'] for f in wider['files'] if f['counts']['fail']],
    'm1': m1, 'guidelineExit': guidelines,
    'independentApproval': False, 'mergeReady': False,
    'scope': 'Preproposal envelope-shape fix with controlled committed replay; actual seed M1 coordinator-system-table persistence and separate-process readback of twelve files after orderly shutdown on one host. Not coordinator crash recovery, historical legacy admission, complete seed certification, split/merge or physical multi-host proof.',
}
summary['focusedProofPassed'] = all(checks[k] for k in
    ['negative-assertions', 'candidate-envelope', 'identical-control-tests', 'm1-persistence', 'source-restored'])
summary['allRunGatesPassed'] = all(checks.values()) and guidelines == 0
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
(OUT / 'final-status.txt').write_text(git('status', '--porcelain') + '\n')
print(json.dumps(summary, indent=2), flush=True)
