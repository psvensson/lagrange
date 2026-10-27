"""Exact-content cleanup reconciliation proof; never independent approval."""
import gzip, hashlib, json, os, re, shutil, subprocess
from pathlib import Path

BASE = '3ea4dd5053c5f60682cfc7bdcabfa32e0472682d'
LOCAL = '5dadfc6fe04e80cb4fa864664171bd406e06c3a3'
EXPECTED = {'src':'25f9beeb40f07a035d2f043b47d99eb94e323b4d',
            'test':'1ac7fd5d3a86c2e6c71eb70c2520b66759d4dbc0',
            'solve':'fd30cad0b994903dd6c53cdc6ba915a29dc58118'}
E = Path(os.environ['EVIDENCE']); E.mkdir(parents=True, exist_ok=True)
ENV = dict(os.environ, LAGRANGE_RETRY_FAILED_ONCE='0', LAGRANGE_SKIP_PRECOMMIT='1')
FOCUS = ['test/raft/raft-rs-backend/startup-cleanup.integration.test.js',
         'test/node/replica-runtime-cleanup-custody.integration.test.js',
         'test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js',
         'test/raft/raft-opening-cleanup-error.test.js']
WIDER = ['test/raft/raft-opening-cleanup-error.test.js'] + [
    'test/raft/raft-rs-backend/'+name for name in [
    'operation-port-provenance.test.js','operation-port-ready-recovery.test.js',
    'operation-port-throw-containment.test.js','operation-port-lifecycle.test.js',
    'lifecycle-registry-runtime-generation.test.js','durable-rejoin-record-refusal.test.js',
    'restart-from-durable-record.test.js','partition-construction-seam.test.js',
    'participation-gate.test.js','runtime-trap-and-restore.test.js',
    'message-group-on-raft-rs.test.js','wasm-service-group-on-raft-rs.test.js',
    'runtime-load-recovery.integration.test.js','runtime-replacement-review.integration.test.js',
    'runtime-opening-refusal.integration.test.js','runtime-opening-history.integration.test.js']] + [
    'test/partition/partition-port-refusal-outcomes.test.js',
    'test/partition/partition-unreadable-durable-record.test.js',
    'test/wasm-service/wasm-service-replica.test.js','test/wasm-service/wasm-service-lifecycle.test.js',
    'test/message-group/message-group-service-lifecycle-and-ledger.test.js',
    FOCUS[0],FOCUS[1],'test/node/replica-handler.test.js',
    'test/node/replica-failed-create-cleanup-generation.test.js',
    'test/node/replica-removal-graceful-shutdown.property.test.js',
    'test/node/replica-removal-consensus-exit-reported-once.test.js']
KNOWN = ['test/partition/partition-unreadable-durable-record.test.js','test/node/replica-handler.test.js']
sha = lambda b: hashlib.sha256(b).hexdigest()

def git(*args):
    return subprocess.check_output(['git',*args],env=ENV).decode().strip()

def run(label,args,required=False,limit=480):
    with (E/(label+'.log')).open('wb') as log:
        try: code=subprocess.run(args,env=ENV,stdout=log,stderr=subprocess.STDOUT,timeout=limit).returncode
        except subprocess.TimeoutExpired:
            code=124; log.write(b'\nOUTER LIMIT: incomplete, never behavioral proof\n')
    (E/(label+'-exit.txt')).write_text(str(code)+'\n')
    if required and code: raise RuntimeError(f'{label}: exit {code}; see retained log')
    return code

def measure(label,files):
    # No prior run's TAP can satisfy a missing result.
    prior=Path('.tap/test-results')
    if prior.exists():
        stale=E/(label+'-preexisting-tap'); assert not stale.exists()
        shutil.move(prior,stale)
    code=run(label,['npm','run','-s','test:file','--',*files])
    dest=E/(label+'-tap')
    if prior.exists(): shutil.move(prior,dest)
    reports=[]
    for name in files:
        p=dest/(name+'.tap'); text=p.read_text() if p.exists() else ''
        matches={k:re.search(r'^# '+k+r' (\d+)\s*$',text,re.M)
                 for k in ['tests','pass','fail','cancelled','skipped','todo']}
        counts={k:int(v.group(1)) if v else None for k,v in matches.items()}
        is_node=counts['tests'] is not None
        legacy=re.search(r'^# \{ ([^\n]+) \}\s*$',text,re.M)
        legacy_counts={k:int(v) for k,v in re.findall(r'(\w+):\s*(\d+)',legacy.group(1))} if legacy else None
        root_failures=re.findall(r'^not ok \d+ - (.*?)(?: # time=.*)?$',text,re.M)
        unfinished='test unfinished' in text or 'test did not finish' in text
        durations=[float(x) for x in re.findall(r'^\s*duration_ms:\s*([\d.]+)',text,re.M)] if is_node else [
            float(x) for x in re.findall(r'^\s*(?:not )?ok \d+[^\n]*# time=([\d.]+)ms',text,re.M)]
        target=30000 if '.integration.test.js' in name else 2000
        parsed=is_node or legacy_counts is not None
        skipped=sum((counts[k] or 0) for k in ['cancelled','skipped','todo']) if is_node else sum(
            (legacy_counts or {}).get(k,0) for k in ['skip','todo','cancelled'])
        reported_fail=(counts['fail'] if is_node else (legacy_counts or {}).get('fail',0))
        passed=bool(text) and parsed and not root_failures and not unfinished and reported_fail==0 and skipped==0
        reports.append({'file':name,'format':'node-cases' if is_node else 'legacy-tap-assertions',
            'parsed':parsed,'passed':passed,'counts':counts if is_node else None,
            'legacyAssertionCounts':legacy_counts,'rootFailures':root_failures,'unfinished':unfinished,
            'assertionFailures':text.count("code: 'ERR_ASSERTION'"),
            'names':re.findall(r'^# Subtest: (.*)$',text,re.M),
            'sourceSha256':sha(Path(name).read_bytes()),'maxCaseMs':max(durations) if durations else None,
            'targetMs':target,'toleranceMs':target*10,
            'durationPassed':bool(durations) and max(durations)<=target*10})
    result={'exit':code,'files':reports,'passedFiles':sum(x['passed'] for x in reports),
            'failedFiles':[x['file'] for x in reports if not x['passed']]}
    (E/(label+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    return result

def node_counts(result):
    assert all(f['format']=='node-cases' and f['parsed'] for f in result['files'])
    return {k:sum(f['counts'][k] for f in result['files'])
            for k in ['tests','pass','fail','cancelled','skipped','todo']}

assert git('rev-parse','HEAD')==os.environ['GITHUB_SHA']
assert not git('status','--porcelain'), 'input must be clean, including untracked files'
for directory in EXPECTED:
    assert git('rev-parse','HEAD:'+directory)==git('rev-parse',BASE+':'+directory)
packed=(E/'reconciliation.patch.gz').read_bytes()
assert sha(packed)=='865067bf738aae26e9b3f40bf8f832a46ae981620ef5b977a37ca9dbaa5ece53'
patch=gzip.decompress(packed)
assert sha(patch)=='7882f08ae213f46c49b6527449e3688e4c5a8da8990a5b10e71e51a92f90a223'
p=E/'execution.patch'; p.write_bytes(patch)
run('apply-check',['git','apply','--check',str(p)],True)
run('apply',['git','apply','--index',str(p)],True)
p.unlink() # Exact executed bytes remain in the checksum-bound gzip.
index_tree=git('write-tree')
for directory,expected in EXPECTED.items(): assert git('rev-parse',index_tree+':'+directory)==expected
run('candidate-commit',['git','commit','-m','WIP cleanup: reconcile exact service releases and retain host custody'],True)
CANDIDATE=git('rev-parse','HEAD'); (E/'candidate-sha.txt').write_text(CANDIDATE+'\n')
source_paths=git('diff','--name-only',BASE,CANDIDATE,'--','src').splitlines()
assert len(source_paths)==14
manifest={}
for name in source_paths:
    old=subprocess.run(['git','show',BASE+':'+name],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    manifest[name]={'before':old.stdout if old.returncode==0 else None,'after':Path(name).read_bytes()}
(E/'source-identities.json').write_text(json.dumps({n:{k:sha(v) if v is not None else None for k,v in d.items()} for n,d in manifest.items()},indent=2)+'\n')

def restore(arm):
    for name,images in manifest.items():
        data=images[arm]; path=Path(name)
        if data is None: path.unlink(missing_ok=True)
        else: path.write_bytes(data)
    for name,images in manifest.items():
        actual=Path(name).read_bytes() if Path(name).exists() else None
        assert actual==images[arm], f'failed exact {arm}: {name}'

try:
    restore('before'); baseline=measure('baseline',FOCUS)
    inherited=measure('baseline-known-failures',KNOWN)
    restore('after'); candidate=measure('candidate',FOCUS)
    restore('before'); reverted=measure('source-revert',FOCUS)
finally: restore('after')
run('restored-source',['git','diff','--exit-code','--','src'],True)
wider=measure('wider',WIDER)
run('lint',['node_modules/.bin/eslint',*source_paths,FOCUS[0],FOCUS[1],
            'test/raft/raft-rs-backend/startup-cleanup-native-fixture.js'])
run('literals',['node','--input-type=module','-e',
    "import {collectMagicLiteralViolations} from './scripts/check-guideline-literals.js'; "
    "const r=await collectMagicLiteralViolations(JSON.parse(process.argv[1]),{}); "
    "console.log(JSON.stringify(r,null,2)); process.exitCode=r.totalViolationCount===0?0:1;",json.dumps(source_paths)])
run('impact',['npm','run','-s','audit:impact-contracts'])
run('boundary',['node','--input-type=module','-e',
    "import {auditRaftRsOperationBoundary} from './scripts/checks/raft-rs-operation-boundary-audit.js'; "
    "const v=auditRaftRsOperationBoundary({root:process.cwd()}); console.log(JSON.stringify(v,null,2)); process.exitCode=v.length?1:0;"])
run('whitespace',['git','diff','--check',os.environ['GITHUB_SHA'],CANDIDATE])
run('guidelines',['npm','run','-s','audit:guidelines'])
run('host-quest-probe',['node','scripts/solve.js','probe','--id','replica-cleanup-host-custody','--json'])
run('final-source',['git','diff','--exit-code','--','src'],True)
A=node_counts(baseline); C=node_counts(candidate); R=node_counts(reverted)
checks={
    'exact-source-and-test-trees':all(git('rev-parse',CANDIDATE+':'+d)==v for d,v in EXPECTED.items()),
    'baseline':A=={'tests':66,'pass':50,'fail':16,'cancelled':0,'skipped':0,'todo':0},
    'candidate':C=={'tests':66,'pass':66,'fail':0,'cancelled':0,'skipped':0,'todo':0} and candidate['exit']==0,
    'source-only-revert':R==A and baseline['exit']==reverted['exit']==1,
    'negative-assertions':sum(f['assertionFailures'] for f in baseline['files'])==16 and sum(f['assertionFailures'] for f in reverted['files'])==16,
    'identical-focused-tests':all(a['sourceSha256']==c['sourceSha256']==r['sourceSha256'] and a['names']==c['names']==r['names'] and a['rootFailures']==r['rootFailures'] for a,c,r in zip(baseline['files'],candidate['files'],reverted['files'])),
    'focused-duration-tolerance':all(f['durationPassed'] for f in candidate['files']),
}
for label in ['lint','literals','impact','boundary','whitespace','restored-source','final-source']:
    checks[label]=(E/(label+'-exit.txt')).read_text().strip()=='0'
known_binding={}
for previous in inherited['files']:
    current=next(f for f in wider['files'] if f['file']==previous['file'])
    known_binding[current['file']]=previous['sourceSha256']==current['sourceSha256'] and previous['rootFailures']==current['rootFailures'] and previous['unfinished']==current['unfinished'] and not current['passed']
summary={'input':os.environ['GITHUB_SHA'],'publishedSourceBaseline':BASE,'candidate':CANDIDATE,
    'localContentCandidate':LOCAL,'exactDirectoryTrees':EXPECTED,'checks':checks,
    'nativeAndControlledBaseline':A,'nativeAndControlledCandidate':C,'nativeAndControlledRevert':R,
    'wider':{'requestedFiles':len(WIDER),'parsedFiles':sum(f['parsed'] for f in wider['files']),
             'passedFiles':wider['passedFiles'],'failedFiles':wider['failedFiles'],
             'nodeCaseCounts':{k:sum(f['counts'][k] or 0 for f in wider['files'] if f['format']=='node-cases') for k in ['tests','pass','fail','cancelled','skipped','todo']},
             'legacyTapFiles':sum(f['format']=='legacy-tap-assertions' for f in wider['files']),
             'allWithinDurationTolerance':all(f['durationPassed'] for f in wider['files']),
             'exit':wider['exit'],'baselineFailureBinding':known_binding,
             'countCaution':'Legacy TAP leaf assertions and queued unfinished cases are not added to Node case counts.'},
    'guidelineExit':int((E/'guidelines-exit.txt').read_text()),
    'focusedProofPassed':all(checks.values()),'independentApproval':False,'mergeReady':False,
    'scope':'Both retained cleanup populations and eight host-custody cases; real services/native faults/SQLite plus controlled close/registry-succession boundaries. Not complete remote CREATE, snapshot receiver replacement, all outer NodeService lifetimes, full SQL/CDC startup or physical lab proof.'}
summary['allRunGatesPassed']=summary['focusedProofPassed'] and wider['exit']==0 and wider['passedFiles']==len(WIDER) and summary['wider']['allWithinDurationTolerance'] and summary['guidelineExit']==0
(E/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
