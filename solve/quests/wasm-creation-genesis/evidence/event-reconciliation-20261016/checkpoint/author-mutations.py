from pathlib import Path
import subprocess, hashlib, json, difflib
root=Path('/mnt/data/event-reconcile/repo')
evidence=Path('/mnt/data/event-reconcile/evidence')
source=root/'src/wasm-service/wasm-creation-reconciliation.js'
original=source.read_bytes()
tests=[root/'test/wasm-service/wasm-creation-reconciliation.integration.test.js',root/'test/wasm-service/wasm-creation-reconciliation.test.js']
test_hashes={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in tests}
variants=[
 ('event-disconnected','if (this.current(context)) this.queue.enqueue(this.replica.replicaId, event, context);','if (this.current(context)) return;',tests[0]),
 ('applied-wake-removed','RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.APPLIED_PROGRESS,','RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.TERM_CHANGE,',tests[0]),
 ('post-await-owner-check-removed','return this.current(context) ? result : this.stoppedResult();','return result;',tests[1]),
]
records=[]
for name,before,after,test in variants:
 assert source.read_bytes()==original
 text=original.decode(); assert text.count(before)==1
 variant=text.replace(before,after,1)
 (evidence/(name+'.patch')).write_text(''.join(difflib.unified_diff(text.splitlines(True),variant.splitlines(True),fromfile='a/'+str(source.relative_to(root)),tofile='b/'+str(source.relative_to(root)))))
 try:
  source.write_text(variant)
  cmd=['node','scripts/run-classified-test-files.js',str(test.relative_to(root))]
  r=subprocess.run(cmd,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=35)
  (evidence/(name+'.log')).write_bytes(r.stdout)
  (evidence/(name+'.exit')).write_text(str(r.returncode)+'\n')
  record={'name':name,'candidateSourceSha256':hashlib.sha256(original).hexdigest(),'mutatedSourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'testSha256':test_hashes,'command':cmd,'exit':r.returncode}
  records.append(record)
  print(name,r.returncode,r.stdout.decode()[-2100:])
 finally:
  source.write_bytes(original)
  assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==sha for p,sha in test_hashes.items())
assert source.read_bytes()==original
(evidence/'mutations.json').write_text(json.dumps(records,indent=2)+'\n')
