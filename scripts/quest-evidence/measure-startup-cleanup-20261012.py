"""Exact-candidate startup-refusal/custody measurement, not independent review."""
import gzip, hashlib, json, os, re, shutil, subprocess
from pathlib import Path

E = Path(os.environ['EVIDENCE']); E.mkdir(parents=True, exist_ok=True)
P = json.loads(gzip.decompress((E/'execution-input.json.gz').read_bytes()))
QUEST = 'startup-refusal-cleanup-custody'
NATIVE = 'test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js'
UNIT = 'test/raft/raft-opening-cleanup-error.test.js'
INHERITED = 'test/partition/partition-unreadable-durable-record.test.js'
ENV = dict(os.environ, LAGRANGE_RETRY_FAILED_ONCE='0', LAGRANGE_SKIP_PRECOMMIT='1')
sha = lambda b: hashlib.sha256(b).hexdigest()

def command(label, args, required=False, limit=300):
    with (E/f'{label}.log').open('wb') as log:
        try:
            result = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT, env=ENV, timeout=limit)
            code = result.returncode
        except subprocess.TimeoutExpired:
            code = 124
            log.write(b'\nOUTER MEASUREMENT LIMIT: incomplete, not behavioral proof\n')
    (E/f'{label}-exit.txt').write_text(str(code)+'\n')
    if required and code != 0:
        raise RuntimeError(f'{label} refused; see retained output, exit {code}')
    return code

def git(*args):
    return subprocess.check_output(['git', *args], env=ENV).decode().strip()

def identity(group, arm):
    actual = {}
    for name, expected in P['manifest'][group].items():
        path = Path(name); value = sha(path.read_bytes()) if path.exists() else None
        actual[name] = value
        assert value == expected[arm], f'{group}/{arm} content mismatch: {name}'
    return actual

def apply(group):
    identity(group, 'before')
    patch = E/f'{group}.patch'
    patch.write_text(P['patches'][group])
    command(f'{group}-apply-check', ['git','apply','--check',str(patch)], True)
    command(f'{group}-apply', ['git','apply',str(patch)], True)
    identity(group, 'after')
    compressed = gzip.compress(patch.read_bytes(), mtime=0)
    (E/f'{group}.patch.gz').write_bytes(compressed)
    patch.unlink()  # This executed byte stream is preserved exactly in gzip above.

def commit(label, message, paths):
    command(label+'-stage', ['git','add','--',*paths], True)
    command(label+'-commit', ['git','commit','-m',message], True)
    head = git('rev-parse','HEAD'); (E/f'{label}-sha.txt').write_text(head+'\n')
    return head

def test(label, files):
    code = command(label, ['npm','run','-s','test:file','--',*files], limit=480)
    tap = E/(label+'-tap')
    if Path('.tap/test-results').exists():
        shutil.move('.tap/test-results', tap)
    reports = []
    for name in files:
        p = tap/(name+'.tap'); text = p.read_text() if p.exists() else ''
        counts = {}
        for key in ['tests','pass','fail','cancelled','skipped','todo']:
            found = re.search(r'^# '+key+r' (\d+)\s*$',text,re.M)
            counts[key] = int(found.group(1)) if found else None
        names = re.findall(r'^# Subtest: (.*)$',text,re.M)
        failed = re.findall(r'^not ok \d+ - (.*)$',text,re.M)
        durations = [float(x) for x in re.findall(r'^\s*duration_ms: ([\d.]+)',text,re.M)]
        target = 30000 if '.integration.test.js' in name else 2000
        reports.append({'file':name, 'counts':counts, 'names':names, 'failed':failed,
                        'assertionFailures':text.count("code: 'ERR_ASSERTION'"),
                        'sourceSha256':sha(Path(name).read_bytes()),
                        'maxCaseMs':max(durations) if durations else None,
                        'targetMs':target, 'toleranceMs':target*10,
                        'durationPassed':bool(durations) and max(durations)<=target*10})
    result = {'exit':code,'files':reports}
    (E/f'{label}.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

def counts(result):
    return {key:sum(f['counts'].get(key) or 0 for f in result['files'])
            for key in ['tests','pass','fail','cancelled','skipped','todo']}

def complete(result):
    return all(f['counts']['tests'] is not None and f['counts']['tests'] > 0 and
               all(f['counts'][key] == 0 for key in ['cancelled','skipped','todo'])
               for f in result['files'])

assert git('rev-parse','HEAD') == os.environ['GITHUB_SHA']
assert git('rev-parse','HEAD:src') == P['sourceRootBefore']
assert git('rev-parse',P['base']+':src') == P['sourceRootBefore']
assert not git('status','--porcelain')
apply('declaration')
command('metadata-baseline', ['npm','run','-s','test:metadata:refresh'], True)
command('seal', ['node','scripts/solve.js','start','--id',QUEST,'--json'], True)
command('baseline-attempt', ['node','scripts/solve.js','note','--id',QUEST,'--attempt',
    'Measure existing cleanup masking/custody through unchanged 27-case native/adapter boundary file. The one new-export pure error unit is candidate-only, never an import-failure negative.', '--json'], True)
baseline = commit('baseline','WIP startup cleanup: seal and retain all-owner failure witnesses',
                  list(P['manifest']['declaration'])+['test/shards',f'solve/quests/{QUEST}/log.ndjson'])
base_tests = test('baseline-native',[NATIVE])
inherited_base = test('baseline-inherited',[INHERITED])
command('guidelines-baseline',['npm','run','-s','audit:guidelines'])
preimages = {name:Path(name).read_bytes() for name in P['manifest']['source']}
apply('source')
command('metadata-candidate',['npm','run','-s','test:metadata:refresh'],True)
command('candidate-attempt',['node','scripts/solve.js','note','--id',QUEST,'--attempt',
    'Preserve exact primary refusal and secondary cleanup error through existing owners; retain failed-close handles, join concurrent close, refuse overwrite while cleanup is owed, consume transport retirement and keep WASM cleanup nonterminal. Existing method-key literal named without changing bytes. Source-only controls and full selected regressions required; no source approval claimed.','--json'],True)
candidate = commit('candidate','WIP startup cleanup: preserve refusal and exact release custody',
                   list(P['manifest']['source'])+['test/shards',f'solve/quests/{QUEST}/log.ndjson'])
assert git('rev-parse','HEAD:src') == P['sourceRootAfter']
candidate_tests = test('candidate-native',[NATIVE,UNIT])
for name, data in preimages.items(): Path(name).write_bytes(data)
try:
    identity('source','before')
    revert_tests = test('source-revert-native',[NATIVE])
finally:
    for name in preimages:
        Path(name).write_bytes(subprocess.check_output(['git','show',candidate+':'+name]))
identity('source','after')
command('restored-source-check',['git','diff','--exit-code','--','src'],True)
regressions = test('regressions',P['regressionFiles'])
source_files = list(P['manifest']['source'])
command('lint',['node_modules/.bin/eslint',*source_files,NATIVE,UNIT])
command('changed-literals',['node','--input-type=module','-e',
    "import {collectMagicLiteralViolations} from './scripts/check-guideline-literals.js'; "
    "const v=collectMagicLiteralViolations(JSON.parse(process.argv[1]),{}); console.log(JSON.stringify(v,null,2)); process.exitCode=v.length?1:0;",json.dumps(source_files)])
command('impact',['npm','run','-s','audit:impact-contracts'])
command('boundary',['node','--input-type=module','-e',
    "import {auditRaftRsOperationBoundary} from './scripts/checks/raft-rs-operation-boundary-audit.js'; "
    "const v=auditRaftRsOperationBoundary({root:process.cwd()}); console.log(JSON.stringify(v,null,2)); process.exitCode=v.length?1:0;"])
command('whitespace',['git','diff','--check',os.environ['GITHUB_SHA'],'HEAD'])
command('guidelines-candidate',['npm','run','-s','audit:guidelines'])

a=base_tests['files'][0]; c=candidate_tests['files'][0]; r=revert_tests['files'][0]
expected_failures=[name for name in c['names'] if name.startswith('startup cleanup custody:')]
checks={
    'baseline-engaged':complete(base_tests) and counts(base_tests)['tests']==27 and counts(base_tests)['pass']==12 and counts(base_tests)['fail']==15,
    'candidate-native':complete(candidate_tests) and counts(candidate_tests)['tests']==28 and counts(candidate_tests)['pass']==28 and counts(candidate_tests)['fail']==0 and candidate_tests['exit']==0,
    'source-only-revert':complete(revert_tests) and counts(revert_tests)==counts(base_tests) and revert_tests['exit']==1,
    'negative-assertions':len(expected_failures)==15 and a['failed']==expected_failures and r['failed']==expected_failures and a['assertionFailures']==15 and r['assertionFailures']==15,
    'same-native-test':a['sourceSha256']==c['sourceSha256']==r['sourceSha256'] and a['names']==c['names']==r['names'],
    'all-files-engaged':complete(regressions) and len(regressions['files'])==22 and counts(regressions)['tests']==293,
    'regressions':complete(regressions) and regressions['exit']==0 and counts(regressions)['fail']==0,
    'hardware-duration-tolerance':all(f['durationPassed'] for result in [candidate_tests,regressions] for f in result['files']),
}
for label in ['lint','changed-literals','impact','boundary','whitespace']:
    checks[label]=(E/f'{label}-exit.txt').read_text().strip()=='0'
failed_files=[f['file'] for f in regressions['files'] if f['counts']['fail']]
current_inherited=next(f for f in regressions['files'] if f['file']==INHERITED)
checks['inherited-failure-binding']=failed_files==[INHERITED] and complete(inherited_base) and inherited_base['files'][0]['failed']==current_inherited['failed'] and inherited_base['files'][0]['sourceSha256']==current_inherited['sourceSha256'] and current_inherited['counts']['fail']==6
summary={'input':os.environ['GITHUB_SHA'],'baseline':baseline,'candidate':candidate,
         'localContentCandidate':P['localCandidate'],'sourceTree':P['sourceRootAfter'],
         'checks':checks,'nativeBaseline':counts(base_tests),'nativeCandidate':counts(candidate_tests),
         'nativeRevert':counts(revert_tests),'regressions':counts(regressions),
         'guidelineExit':int((E/'guidelines-candidate-exit.txt').read_text()),
         'independentApproval':False,'mergeReady':False,
         'scope':'Actual service initialization/native fault cases plus explicitly controlled close and partition-adapter boundaries; all three existing lifecycle owners. Not snapshot receiver validation, full SQL/CDC startup, all arbitrary callback failures, or physical multi-host certification.'}
summary['focusedProofPassed']=all(value for key,value in checks.items() if key not in ['regressions','inherited-failure-binding'])
summary['allRunGatesPassed']=all(checks.values()) and summary['guidelineExit']==0
(E/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(E/'test-source.json').write_text(json.dumps({name:sha(Path(name).read_bytes()) for name in P['regressionFiles']},indent=2)+'\n')
(E/'source-identities.json').write_text(json.dumps(P['manifest'],indent=2)+'\n')
receipt_path=Path(f'solve/quests/{QUEST}/evidence/receipt.json')
receipt=json.loads(receipt_path.read_text())
for item in receipt['receipts']:
    item['passed']=summary['focusedProofPassed'] and item['id'] not in ['unchanged-native-and-lifecycle-regressions','independent-review-and-static-gates']
receipt['status']='FAIL'; receipt['candidate']=candidate
receipt['evidence']=f'run {os.environ["GITHUB_RUN_ID"]}; focused proof is not independent acceptance'
receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
command('probe',['node','scripts/solve.js','probe','--id',QUEST,'--json'])
print(json.dumps(summary,indent=2))
