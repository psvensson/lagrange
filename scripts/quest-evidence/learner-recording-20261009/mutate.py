#!/usr/bin/env python3
"""Use the established private-process-group executor; assert exact nested failures."""
import importlib.util
import json
import os
from pathlib import Path
import sys
sys.dont_write_bytecode = True
out=Path(sys.argv[1]).resolve();reporter=Path(sys.argv[2]).resolve();root=Path.cwd()
spec=importlib.util.spec_from_file_location('owned_process',out/'tooling/process-owner.py')
owner=importlib.util.module_from_spec(spec);spec.loader.exec_module(owner)
owner.refuse_under_probe(root)
test='test/integration/message-group-learner-runtime-authorization.integration.test.js'
auth='src/rebalancer/replica-operation-message-group-membership-authorization.js'
claim='src/rebalancer/replica-operation-message-group-membership-owner-claim.js'
command=['node','--test','--test-reporter='+str(reporter),test]
controls=[('action-binding',auth,
 'encodeCommittedMembershipContext(origin.context) ===\n      encodeCommittedMembershipContext(learnerActionOf(input)) &&', '',
 'wrong original action evidence cannot advance the learner operation',"Expected values to be strictly equal"),
 ('holder-cas',claim,"  ['message_group_membership_owner_claim', 'messageGroupMembershipOwnerClaim'],\n",'',
 'holder replacement during native evidence acquisition defeats the old row CAS','the old holder cannot install a learner stamp'),
 ('terminal-cas',claim,"  ['status', 'status'], ['workflow_step', 'workflowStep'], ['completed_at', 'completedAt'],\n",'',
 'terminal settlement racing recording is retained and retried as exact debt','terminal-state changes must defeat the earlier recording basis')]
results=[]
for name,rel,old,new,test_name,message in controls:
 source=root/rel;original=source.read_bytes();raw=original.decode();assert raw.count(old)==1,(name,'target drift')
 row,stdout=owner.execute(root,out,'mutation-'+name,command,source,original,raw.replace(old,new).encode(),timeout=45)
 events=[json.loads(line) for line in stdout.splitlines()]
 summaries=[e for e in events if e['type']=='test:summary' and e.get('file') is None]
 assert row['cleanupComplete'] and not row['timedOut'] and row['exit']==1,row
 assert len(summaries)==1 and summaries[0]['counts']['cancelled']==summaries[0]['counts']['skipped']==0,summaries
 failures=[e for e in events if e['type']=='test:fail' and e['name']==test_name]
 assert len(failures)==1,failures
 failure=failures[0]
 assert failure.get('failureType')=='testCodeFailure' and failure.get('assertionCode')=='ERR_ASSERTION',failure
 assert message in failure.get('assertionMessage',''),failure
 assert source.read_bytes()==original
 results.append({'name':name,'requiredFailure':failure,'measurement':row})
 (out/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
# Restored positive is a full canonical-input test with no weakened source.
source=root/auth;original=source.read_bytes()
row,stdout=owner.execute(root,out,'restored-positive',command,source,original,timeout=45)
events=[json.loads(line) for line in stdout.splitlines()]
assert row['exit']==0 and row['cleanupComplete'] and not row['timedOut'],row
assert not any(e['type']=='test:fail' for e in events)
results.append({'name':'restored-positive','measurement':row})
(out/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
