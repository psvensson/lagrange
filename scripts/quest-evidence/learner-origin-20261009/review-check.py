#!/usr/bin/env python3
"""Named failure attribution for this bounded PR111 corrective attempt only."""
import argparse, hashlib, json, os, re, subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('mode',choices=['red','mutate','timings']);a=p.parse_args()
out=Path(os.environ['PROOF_OUT']);test='test/integration/message-group-learner-runtime-authorization.integration.test.js'
A=('historical read snapshots exact own-data actions without invoking accessors', 'accessor action must be rejected before validation or encoding')
B=('queued origin read refuses malformed bytes and impossible future terms','future-term origin cannot be committed historical evidence')
C=('registry replay is a no-op and conflicting origin rolls back without replacement','identical origin replay performs no SQL update')
def failure(stdout,name,message):
 blocks=re.split(r'(?=^    # Subtest: )',stdout,flags=re.M)
 rows=[b for b in blocks if b.startswith('    # Subtest: '+name+'\n')]
 assert len(rows)==1,(name,'ambiguous or missing subtest')
 b=rows[0]
 assert re.search(r'^    not ok \d+ - '+re.escape(name)+r'$',b,re.M),(name,'not a failing subtest',b)
 assert "code: 'ERR_ASSERTION'" in b and message in b,(name,'wrong assertion',b)
 for key in ['cancelled','skipped']:
  assert re.search(r'^# '+key+' 0$',stdout,re.M),(name,key)
if a.mode=='red':
 stdout=(out/'red.stdout.txt').read_text();assert (out/'red.exit.txt').read_text().strip()=='1'
 failure(stdout,*A);failure(stdout,*B)
elif a.mode=='mutate':
 mutations=[
 ('input-snapshot','src/raft/raft-rs-committed-membership-context.js','const captured = snapshotLearnerContext(context);','const captured = context;',A),
 ('future-term','src/raft/raft-rs-committed-membership-read.js',' ||\n      BigInt(origin.term) > BigInt(status.term)','',B),
 ('replay-noop','src/raft/raft-rs-peer-identity.js','if (row.learner_admission === null) {','if (true) {',C),
 ('conflicting-origin','src/raft/raft-rs-peer-identity.js','(row.learner_admission !== null && row.learner_admission !== encoded)','false',
  ('registry replay is a no-op and conflicting origin rolls back without replacement','conflicting origin must reject the enclosing application transaction'))]
 results=[]
 for name,file,old,new,assertion in mutations:
  path=Path(file);original=path.read_bytes();text=original.decode();assert text.count(old)==1,(name,'anchor drift')
  try:
   path.write_text(text.replace(old,new,1))
   run=subprocess.run(['npm','run','test:file','--',test],text=True,capture_output=True,timeout=90)
   (out/(name+'.stdout.txt')).write_text(run.stdout);(out/(name+'.stderr.txt')).write_text(run.stderr)
   (out/(name+'.exit.txt')).write_text(str(run.returncode)+'\n')
   assert run.returncode==1,(name,run.returncode)
   failure(run.stdout,*assertion)
   results.append({'name':name,'test':assertion[0],'assertion':assertion[1],'exit':run.returncode,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
  except subprocess.TimeoutExpired as e:
   (out/(name+'.timeout.json')).write_text(json.dumps({'timeoutSeconds':e.timeout}))
   for stream in ['stdout','stderr']:
    value=getattr(e,stream) or b''
    (out/(name+'.'+stream+'.txt')).write_bytes(value.encode() if isinstance(value,str) else value)
   raise
  finally:
   path.write_bytes(original)
  assert path.read_bytes()==original
 (out/'mutation-results.json').write_text(json.dumps(results,indent=2)+'\n')
else:
 timings={}
 for name,limit,count in [('consumer',30000,1),('regressions',2000,4),('neighbors',2000,2)]:
  rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/(name+'.stdout.txt')).read_text(),re.M)
  assert len(rows)==count,(name,rows)
  timings[name]={'limitMs':limit,'files':rows,'withinBudget':all(int(ms)<=limit for _,_,ms in rows)}
 (out/'timings.json').write_text(json.dumps(timings,indent=2)+'\n')
 assert all(x['withinBudget'] for x in timings.values()),timings
