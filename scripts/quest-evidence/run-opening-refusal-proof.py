"""Bounded exact-source measurement; no independent verdict or landing."""
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

E = Path(os.environ['EVIDENCE']); E.mkdir(parents=True, exist_ok=True)
BASE = '789002b06462c238ac57510b08865c812aa9ac12'
QUEST = 'replicated-transaction-decision-and-apply'
TD = 'test/raft/raft-rs-backend/'
TEST = TD + 'runtime-opening-refusal.integration.test.js'
TEST_HASH = '08a39cfbc476ad23c1e7dfce1dca97c0a5a367e446a47b1f40d9e13fe17ed900'
SRC = ['src/raft/raft-operation-port.js', 'src/raft/raft-rs-operation-port.js',
       'src/partition/partition-consensus-port-opening.js',
       'src/message-group/message-group-consensus-port.js',
       'src/wasm-service/wasm-service-consensus-port.js']
META = ['test/shards/' + n + '.json' for n in ['primary-classes', 'resource-classes', 'subsystem-classes', 'impact-graph-seal']]
REGRESSIONS = [TD + n + '.test.js' for n in [
    'operation-port-provenance', 'operation-port-ready-recovery', 'operation-port-throw-containment',
    'operation-port-lifecycle', 'lifecycle-registry-runtime-generation', 'durable-rejoin-record-refusal',
    'restart-from-durable-record', 'partition-construction-seam', 'participation-gate',
    'runtime-trap-and-restore', 'message-group-on-raft-rs', 'wasm-service-group-on-raft-rs',
]] + ['test/partition/partition-port-refusal-outcomes.test.js', TEST,
      TD + 'runtime-load-recovery.integration.test.js', TD + 'runtime-replacement-review.integration.test.js']

def command(args):
    return subprocess.check_output(args, text=True).strip()

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def run(args, label, required=False):
    with (E / (label + '.log')).open('wb') as output:
        try:
            result = subprocess.run(args, stdout=output, stderr=subprocess.STDOUT, timeout=180)
            code = result.returncode
        except subprocess.TimeoutExpired:
            code = 124
    (E / (label + '-exit.txt')).write_text(str(code) + '\n')
    if required and code:
        raise RuntimeError(label + ' failed; original output retained')
    return code

def note(text, label):
    run(['node', 'scripts/solve.js', 'note', '--id', QUEST, '--attempt', text, '--json'], label, True)

def commit(message, paths):
    subprocess.run(['git', 'add', '--', *paths], check=True)
    subprocess.run(['git', 'commit', '-m', message], env={**os.environ, 'LAGRANGE_SKIP_PRECOMMIT': '1'}, check=True)
    return command(['git', 'rev-parse', 'HEAD'])

def restore(ref):
    for name in SRC:
        Path(name).write_bytes(subprocess.check_output(['git', 'show', ref + ':' + name]))

def measure(label, files):
    assert sha(TEST) == TEST_HASH
    for name in files:
        for ext in ['.tap', '.tap.stderr']:
            path = Path('.tap/test-results') / (name + ext)
            if path.exists(): path.unlink()
    code = run(['npm', 'run', '-s', 'test:file', '--', *files], label)
    folder = E / (label + '-tap'); folder.mkdir()
    parsed = []
    for name in files:
        path = Path('.tap/test-results') / (name + '.tap')
        if not path.is_file(): continue
        destination = folder / (name + '.tap'); destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)
        limit = 30000 if name.endswith('.integration.test.js') else 2000
        for m in re.finditer(r'^(ok|not ok) \d+ - (.+)\n  ---\n  duration_ms: ([\d.]+)', path.read_text(), re.M):
            parsed.append({'file': name, 'name': m.group(2), 'passed': m.group(1) == 'ok', 'durationMs': float(m.group(3)), 'limitMs': limit})
    record = {'exit': code, 'cases': parsed, 'sourceDigests': {name: sha(name) for name in SRC}, 'testSha256': sha(TEST)}
    (E / (label + '.json')).write_text(json.dumps(record, indent=2) + '\n')
    return record

subprocess.run(['git', 'diff', '--exit-code', BASE, '--', 'src', 'test/shards/impact-contracts.json'], check=True)
assert sha(TEST) == TEST_HASH
run(['npm', 'run', '-s', 'test:metadata:refresh'], 'metadata-baseline', True)
note('PR117 review 5489491066 / 4247007955: actual service initialization loses HOST_FAILURE startup typing; refused runtime constructors also publish or overwrite membership reservation owners. Measure all ten real native witnesses on unchanged production source before correction. No approval or landing.', 'attempt-baseline')
baseline = commit('WIP rs-raft: retain exact native opening-refusal baseline', [*META, 'solve/quests/' + QUEST + '/log.ndjson'])
(E / 'baseline-sha.txt').write_text(baseline + '\n')
first = measure('baseline', [TEST])
run(['python3', 'scripts/quest-evidence/prepare-opening-refusal.py'], 'prepare', True)
run(['npm', 'run', '-s', 'test:metadata:refresh'], 'metadata-candidate', True)
note('Opening-refusal correction: one canonical failure predicate across the three startup adapters; exact owner answer and original shared retry window retained. Publish membership reservation owner only after successful port construction. Same-name refused constructor cannot replace live owner. Source/test bytes match local measured 069ea51c. No independent source approval or Quest landing.', 'attempt-candidate')
candidate = commit('WIP rs-raft: preserve typed startup failure and publish membership owner only after construction', [*SRC, 'test/shards/impact-contracts.json', *META, 'solve/quests/' + QUEST + '/log.ndjson'])
(E / 'candidate-sha.txt').write_text(candidate + '\n')
(E / 'source.patch').write_bytes(subprocess.check_output(['git', 'diff', BASE, 'HEAD', '--', 'src']))
fixed = measure('candidate', [TEST])
try:
    restore(baseline)
    reverted = measure('revert', [TEST])
    run(['npm', 'run', '-s', 'audit:guidelines'], 'baseline-guidelines')
finally:
    restore(candidate)
regression = measure('regressions', REGRESSIONS)
run(['node_modules/.bin/eslint', *SRC, TEST], 'lint')
run(['npm', 'run', '-s', 'audit:impact-contracts'], 'impact-contracts')
run(['node', 'scripts/check-guideline-literals.js', *SRC], 'changed-literals')
run(['npm', 'run', '-s', 'audit:guidelines'], 'guidelines')
audit = "import {auditRaftRsOperationBoundary} from './scripts/checks/raft-rs-operation-boundary-audit.js'; const violations=auditRaftRsOperationBoundary({root:process.cwd()}); console.log(JSON.stringify({violations},null,2)); process.exitCode=violations.length?1:0;"
run(['node', '--input-type=module', '-e', audit], 'boundary')
run(['git', 'diff', '--check', BASE, 'HEAD'], 'whitespace')
subprocess.run(['git', 'diff', '--exit-code', '--', 'src', 'test'], check=True)
checks = {}
for name, value, passing in [('baseline', first, False), ('candidate', fixed, True), ('revert', reverted, False)]:
    checks[name + '-count-and-outcome'] = len(value['cases']) == 10 and all(c['passed'] == passing for c in value['cases']) and value['exit'] == (0 if passing else 1)
    checks[name + '-test-identity'] = value['testSha256'] == TEST_HASH
    text = (E / (name + '-tap') / (TEST + '.tap')).read_text()
    if not passing:
        checks[name + '-assertion-failures'] = text.count("code: 'ERR_ASSERTION'") == 10
        checks[name + '-engaged-reasons'] = all(s in text for s in [
            'partition initialize must expose its existing typed refusal',
            'message-group initialize must expose its existing typed refusal',
            'WASM initialize must expose its existing startup refusal',
            'no failed constructor may publish a membership reservation owner',
            'a refused same-name opening must not replace the live reservation owner'])
checks['source-only-revert'] = first['sourceDigests'] == reverted['sourceDigests']
checks['source-treatment'] = all(fixed['sourceDigests'][p] != first['sourceDigests'][p] for p in SRC)
checks['regressions'] = regression['exit'] == 0 and len(regression['cases']) == 80 and all(c['passed'] for c in regression['cases'])
checks['duration-bars'] = all(c['durationMs'] <= c['limitMs'] for c in fixed['cases'] + regression['cases'])
for name in ['lint', 'impact-contracts', 'changed-literals', 'whitespace']:
    checks[name] = (E / (name + '-exit.txt')).read_text().strip() == '0'
summary = {'candidate': candidate, 'baseline': baseline, 'localContentCandidate': '069ea51cce08f486f8dee77e24dbf3f862986112', 'node': command(['node', '--version']), 'checks': checks, 'focusedProofPassed': all(checks.values()), 'guidelinesMatchBaseline': (E / 'guidelines.log').read_bytes() == (E / 'baseline-guidelines.log').read_bytes(), 'boundaryExit': int((E / 'boundary-exit.txt').read_text()), 'guidelineExit': int((E / 'guidelines-exit.txt').read_text()), 'independentApproval': False, 'mergeReady': False, 'scope': 'Ten native opening cases through real service initializers and 80 total focused regression cases. In-process raft-rs, SQLite, actual routers, injected core faults. Not full SQL/CDC startup or physical multi-host certification.'}
summary['allRunGatesPassed'] = summary['focusedProofPassed'] and summary['boundaryExit'] == 0 and summary['guidelineExit'] == 0
(E / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
