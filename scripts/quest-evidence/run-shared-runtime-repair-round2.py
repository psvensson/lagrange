"""Exact-candidate Actions attempt, not a probe, verifier, or landing tool."""
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

E=Path(os.environ['EVIDENCE']); E.mkdir(parents=True,exist_ok=True)
BASE='9529902fd39be90db5f3ba6725de8bc7145df279'
INPUT='dca0d4f2fce3fc350c4a36d21f612268885ee5e0'
QUEST='replicated-transaction-decision-and-apply'
SRC=['src/raft/raft-rs-runtime-owner.js','src/raft/raft-rs-runtime-owner-constants.js','src/raft/raft-rs-runtime-faults.js']
TD='test/raft/raft-rs-backend/'
NATIVE=[TD+'runtime-load-recovery.integration.test.js',TD+'runtime-replacement-review.integration.test.js']
REGRESSIONS=[TD+x+'.test.js' for x in ['operation-port-provenance','operation-port-ready-recovery','operation-port-throw-containment','runtime-trap-and-restore','operation-port-lifecycle','restart-from-durable-record','participation-gate','durable-rejoin-record-refusal']]
META=['test/shards/'+x+'.json' for x in ['primary-classes','resource-classes','subsystem-classes','impact-graph-seal']]

def command(args):
    return subprocess.check_output(args,text=True).strip()

def run(args,label,required=False):
    with (E/(label+'.log')).open('w') as out:
        result=subprocess.run(args,stdout=out,stderr=subprocess.STDOUT,timeout=300)
    (E/(label+'-exit.txt')).write_text(str(result.returncode)+'\n')
    if required and result.returncode: raise RuntimeError(f'{label} failed; see retained log')
    return result.returncode

def note(text,label):
    run(['node','scripts/solve.js','note','--id',QUEST,'--attempt',text,'--json'],label,True)

def commit(message,paths):
    subprocess.run(['git','add','--',*paths],check=True)
    subprocess.run(['git','commit','-m',message],env={**os.environ,'LAGRANGE_SKIP_PRECOMMIT':'1'},check=True)
    return command(['git','rev-parse','HEAD'])

def restore(ref):
    for f in SRC: Path(f).write_bytes(subprocess.check_output(['git','show',ref+':'+f]))

def measure(label,files):
    code=run(['npm','run','-s','test:file','--',*files],label)
    for source,suffix in [('test-output/runtime-load-native','load'),('test-output/runtime-review-native','review'),('.tap/test-results','tap')]:
        if Path(source).is_dir(): shutil.move(source,str(E/(label+'-'+suffix)))
    return code

subprocess.run(['git','diff','--exit-code',INPUT,'--','src'],check=True)
run(['python3','scripts/quest-evidence/refine-shared-runtime-repair.py'],'preparation',True)
prepared={f:Path(f).read_bytes() for f in SRC}
for f in SRC: run(['node','--check',f],'syntax-'+Path(f).name,True)
restore(BASE)
run(['npm','run','-s','test:metadata:refresh'],'metadata-baseline',True)
note('PR117 round two: unchanged stale-Ready behavioral assertion; new resumption is scheduled on the next owned turn after busy queue settlement. Manifest-read witness distinguishes both successful integrity checks from one native instantiation. Prior failed run 38234868864 remains unchanged. Baseline before source correction.','attempt-baseline')
baseline=commit('WIP rs-raft: retain round-two baseline and exact loader-read witness',[*SRC,TD+'runtime-replacement-review-child.js',*META,'solve/quests/'+QUEST+'/log.ndjson'])
(E/'baseline-sha.txt').write_text(baseline+'\n')
measure('baseline',NATIVE)
for f,b in prepared.items(): Path(f).write_bytes(b)
run(['npm','run','-s','test:metadata:refresh'],'metadata-candidate',True)
note('PR117 round two source: retain shared replacement and backoff; defer owed busy-group resumption to the next owned clock turn with lifecycle admission and exact timer cancellation. Old Ready completion must still enter no replacement handles. Not independent approval, Quest landing or certification.','attempt-candidate')
candidate=commit('WIP rs-raft: separate stale Ready completion from owned replacement resumption',[*SRC,*META,'solve/quests/'+QUEST+'/log.ndjson'])
(E/'candidate-sha.txt').write_text(candidate+'\n')
(E/'source.patch').write_bytes(subprocess.check_output(['git','diff',BASE,'--','src']))
(E/'candidate-sources.json').write_text(json.dumps({f:hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in SRC+NATIVE+[TD+'runtime-replacement-review-child.js']},indent=2)+'\n')
measure('candidate',NATIVE)
try:
    restore(BASE)
    measure('revert',NATIVE)
    run(['npm','run','-s','audit:guidelines'],'baseline-guidelines')
finally:
    restore(candidate)
measure('regressions',REGRESSIONS)

# Importing an audit module alone executes no audit. Invoke the exported
# owner on the real nonempty source tree and retain its actual violations.
audit="import fs from 'node:fs'; import {auditRaftRsOperationBoundary as audit} from './scripts/checks/raft-rs-operation-boundary-audit.js'; if(!fs.existsSync('src/raft/raft-rs-runtime-owner.js'))process.exit(2); const violations=audit({root:process.cwd()}); console.log(JSON.stringify({auditor:'auditRaftRsOperationBoundary',violations},null,2)); process.exit(violations.length?1:0);"
run(['node','--input-type=module','-e',audit],'boundary-audit')
tripwire=Path('src/temporary-runtime-boundary-negative.js')
assert not tripwire.exists()
try:
    tripwire.write_text("import {createRuntimeDispatcher} from './raft/raft-rs-runtime-owner.js';\n")
    run(['node','--input-type=module','-e',audit],'boundary-negative')
finally:
    tripwire.unlink()
run(['npm','run','-s','audit:guidelines'],'guidelines')
run(['git','diff','--check'],'whitespace')
subprocess.run(['git','diff','--exit-code','--','src','test'],check=True)

checks={}; data={}
cases={'load':['control','missing-glue','changed-glue','repeated-refusal'],'review':['control','partial-restore','reentrant-restore','reload-backoff','trap-during-restore','close-during-restore','mixed-clocks','last-close']}
for mode in ['baseline','candidate','revert']:
    data[mode]={}
    for kind,names in cases.items():
        for name in names:
            p=E/f'{mode}-{kind}'/f'{name}.json'; x=json.loads(p.read_text()) if p.exists() else {}
            prefix='NATIVE_RECOVERY ' if kind=='load' else 'RUNTIME_REVIEW '
            line=next((s for s in x.get('stdout','').splitlines() if s.startswith(prefix)),None)
            r=json.loads(line[len(prefix):]) if line else {}
            key=kind+':'+name
            data[mode][key]={'exit':x.get('status'),'phase':r.get('phase'),'traps':r.get('traps'),'source':x.get('sourceDigests',{}).get(SRC[0])}
            checks[f'{mode}:engaged:{key}']=x.get('error') is None and x.get('signal') is None and r.get('traps')==1
            if mode=='candidate': checks[f'candidate:pass:{key}']=x.get('status')==0 and r.get('phase')=='complete'
for key in data['baseline']:
    checks['revert:identity:'+key]=data['baseline'][key]==data['revert'][key]
    checks['candidate:treatment:'+key]=data['candidate'][key]['source'] is not None and data['candidate'][key]['source']!=data['baseline'][key]['source']
for mode in ['baseline','revert']:
    for name in ['partial-restore','reentrant-restore','reload-backoff']:
        checks[f'{mode}:behavioral-red:{name}']=data[mode]['review:'+name]['exit']==1
for mode in ['baseline','candidate','revert','regressions']:
    checks['runner:'+mode]=(E/f'{mode}-exit.txt').read_text().strip()==('1' if mode in ['baseline','revert'] else '0')
timings=[]
for p in (E/'regressions-tap').rglob('*.tap'):
    for duration in re.findall(r'^\s+duration_ms:\s*([\d.]+)',p.read_text(),re.M):
        if float(duration)>2000: timings.append({'file':str(p),'durationMs':float(duration)})
checks['unit-duration-bar']=not timings
checks['boundary-positive']=(E/'boundary-audit-exit.txt').read_text().strip()=='0'
negative=(E/'boundary-negative.log').read_text()
checks['boundary-negative']=(E/'boundary-negative-exit.txt').read_text().strip()=='1' and 'temporary-runtime-boundary-negative.js' in negative and 'runtime-owner-import-bypass' in negative
checks['whitespace']=(E/'whitespace-exit.txt').read_text().strip()=='0'
guideline_codes={name:(E/f'{name}-exit.txt').read_text().strip() for name in ['baseline-guidelines','guidelines']}
summary={'candidate':candidate,'baseline':baseline,'checks':checks,'cases':data,'focusedProofPassed':all(checks.values()),'timingViolations':timings,'guidelineExitCodes':guideline_codes,'guidelineOutputMatchesBaseline':(E/'guidelines.log').read_bytes()==(E/'baseline-guidelines.log').read_bytes(),'allRunGatesPassed':all(checks.values()) and guideline_codes['guidelines']=='0','independentApproval':False,'mergeReady':False,'scope':'12 native single-process cases and eight existing files, active boundary audit plus a negative control; not physical RF3 or full release certification.'}
(E/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
