#!/usr/bin/env bash
set -euo pipefail
out="$GITHUB_WORKSPACE/learner-origin-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
test_file=test/integration/message-group-learner-runtime-authorization.integration.test.js
export PROOF_OUT="$out"
python3 - <<'PY'
from pathlib import Path
import json,os,re,subprocess
out=Path(os.environ['PROOF_OUT']);test='test/integration/message-group-learner-runtime-authorization.integration.test.js'
mutations=[
 ('missing-committed-origin','src/raft/raft-rs-operation-port.js',
  'registry.recordCommittedLearnerAdmission(context.replicaIdentity,\n          encodeCommittedLearnerAdmission({groupId, ...position, context}));',
  'void position;',
  'uncommitted learner intent is unresolved, not a historical receipt',
  'only exact applied action evidence is success'),
 ('payload-origin-binding','src/raft/snapshot-checkpoint-store.js',
  'reservation.learnerAdmission !== described[index].learnerAdmission', 'false',
  'checkpoint validates origin against both payload and applied boundary',
  'even a digest-matched payload cannot erase its described origin')]
results=[]
for name,file,old,new,testname,message in mutations:
 p=Path(file);original=p.read_bytes();text=original.decode()
 assert text.count(old)==1,(name,'mutation anchor drift')
 try:
  p.write_text(text.replace(old,new,1))
  run=subprocess.run(['npm','run','test:file','--',test],text=True,capture_output=True,timeout=60)
  (out/(name+'.stdout.txt')).write_text(run.stdout)
  (out/(name+'.stderr.txt')).write_text(run.stderr)
  (out/(name+'.exit.txt')).write_text(str(run.returncode)+'\n')
  assert run.returncode==1,(name,run.returncode)
  # Bind the error to the actual direct subtest's failing TAP block. A passing
  # title, unrelated failure, cancellation, import error or timeout is not credit.
  blocks=re.split(r'(?=^    # Subtest: )',run.stdout,flags=re.M)
  matching=[b for b in blocks if b.startswith('    # Subtest: '+testname+'\n')]
  assert len(matching)==1,(name,'missing/ambiguous failing test')
  b=matching[0]
  assert re.search(r'^    not ok \d+ - '+re.escape(testname)+r'$',b,re.M),(name,b)
  assert "code: 'ERR_ASSERTION'" in b and message in b,(name,b)
  assert re.search(r'^# cancelled 0$',run.stdout,re.M),(name,'cancellation')
  assert re.search(r'^# skipped 0$',run.stdout,re.M),(name,'skip')
  results.append({'name':name,'test':testname,'assertion':message,'exit':run.returncode})
 finally:
  p.write_bytes(original)
 assert p.read_bytes()==original
(out/'mutation-results.json').write_text(json.dumps(results,indent=2)+'\n')
PY
git diff --exit-code -- src
