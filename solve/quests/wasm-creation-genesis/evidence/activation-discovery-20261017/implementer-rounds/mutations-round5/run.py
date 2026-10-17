#!/usr/bin/env python3
# Stage 1c r3 mutations: apply (patch or exact replacement), run the catcher
# gated, restore byte-identically from a saved copy, record sha256 before/after.
import hashlib, json, os, re, shutil, subprocess, sys
W='/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016'
S='/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/mutations-1c-r5'
E=W+'/solve/quests/wasm-creation-genesis/evidence/activation-discovery-20261017/verifier-1c-round1/mutations'
ROUTE='src/node/runtime-service-bound-creation-route.js'
U='test/node/runtime-service-bound-route.test.js'
L='test/wasm-service/wasm-service-lifecycle.test.js'
N='test/wasm-service/bound-creation-handler-embedding.integration.test.js'
M=[
 ('R5-B','replace',ROUTE,("  return existing.deferRetry === true ? reenterRetainedCreation(handler, existing, params) : null;",
   "  return reenterRetainedCreation(handler, existing, params);"),[U]),
 ('R5-A','replace',ROUTE,("    {replicaId, entityId, status, ...named, ...deferral});","    {replicaId, entityId, status, ...named});"),[U]),
 ('R5-C','replace',ROUTE,("  if (!namesCreation(existing) || existing.operationId === operationId) return false;",
   "  if (namesCreation(existing) || !namesCreation(existing)) return false;"),[U]),
 ('M4-B','replace',ROUTE,("const NAMED_MEMO_REPLIES = new Map([[ReplicaStatus.FAILED, reenterDeferredCreation],\n  [ReplicaStatus.REMOVING, deferDuringRetirement]]);",
   "const NAMED_MEMO_REPLIES = new Map([[ReplicaStatus.REMOVING, deferDuringRetirement]]);"),[U]),
 ('RA','replace',ROUTE,("const creation = {operationId: existing.operationId,","const creation = {operationId: params.operationId,"),[U]),
 ('RB','replace',ROUTE,("  return decision.names || !namesCreation(handler.localReplicas.get(replicaId));","  return true;"),[U]),
]
def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
only=sys.argv[1:]
for mid,kind,target,spec,catchers in M:
  if only and mid not in only: continue
  tp=os.path.join(W,target); backup=os.path.join(S,mid+'.orig')
  shutil.copy2(tp,backup); before=sha(tp)
  rec={'id':mid,'file':target,'sha_before':before,'catchers':{}}
  if kind=='patch':
    r=subprocess.run(['patch','-p1','--no-backup-if-mismatch','-i',spec],cwd=W,capture_output=True,text=True)
    rec['apply']=r.stdout.strip()+r.stderr.strip()
    ok=r.returncode==0
  else:
    s=open(tp).read(); pairs=spec if kind=='replace2' else [spec]
    ok=all(s.count(o)==1 for o,_ in pairs)
    if ok:
      for o,n in pairs: s=s.replace(o,n)
      open(tp,'w').write(s)
    rec['apply']='exact replacement' if ok else 'ANCHOR_NOT_FOUND'
  rec['applied']=ok; rec['sha_mutated']=sha(tp)
  if ok:
    for c in catchers:
      subprocess.run(['node','scripts/checks/wait-for-thermal-headroom.js'],cwd=W)
      log=os.path.join(S,f'{mid}-{os.path.basename(c)}.log')
      with open(log,'w') as fh:
        r=subprocess.run(['npm','run','test:file','--',c],cwd=W,stdout=fh,stderr=subprocess.STDOUT)
      txt=open(log).read()
      fails=re.findall(r'^\s+not ok \d+ - .*$',txt,re.M)
      errs=re.findall(r"error: \|-\n\s+(.*)|error: '(.*)'",txt)
      rec['catchers'][c]={'rc':r.returncode,'first_not_ok':fails[0].strip() if fails else None,
        'first_error':(errs[0][0] or errs[0][1]) if errs else None,'not_ok_count':len(fails),'log':log}
  shutil.copy2(backup,tp); rec['sha_after']=sha(tp); rec['restored']=rec['sha_after']==before
  os.remove(backup)
  print(json.dumps(rec)); sys.stdout.flush()
  with open(os.path.join(S,'results.ndjson'),'a') as fh: fh.write(json.dumps(rec)+'\n')
