"""Bounded normal-driver proof; process ownership/reporter reused verbatim."""
from pathlib import Path
import collections,importlib.util,json,os,re,sys
root=Path.cwd();carrier=Path(os.environ['CARRIER']);out=Path(os.environ['PROOF_OUT'])
test='test/integration/message-group-learner-recipient.integration.test.js'
spec=importlib.util.spec_from_file_location('owned_process',carrier/'owned-process.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)

def command():
 return ['node','--test','--test-reporter='+str(carrier/'report-diagnostic.mjs'),test]

def failures(row,stdout):
 events=helper.parse_events(stdout)
 totals=[x for x in events if x['type']=='test:summary' and x.get('file') is None]
 leaves=[x for x in events if x['type']=='test:fail' and x.get('failureType')!='subtestsFailed']
 assert row['exit']==1 and not row['timedOut'] and row['cleanupComplete'],row
 assert len(totals)==1,totals
 assert totals[0]['counts']['cancelled']==totals[0]['counts']['skipped']==totals[0]['counts']['todo']==0,totals
 assert leaves and all(x.get('assertionCode')=='ERR_ASSERTION' for x in leaves),leaves
 return leaves

def exact(leaves,name,message):
 selected=[x for x in leaves if x['name']==name]
 assert len(selected)==1 and message in selected[0].get('assertionMessage',''),leaves

def red():
 helper.refuse_under_probe(root)
 source=root/'src/node/message-group-membership-recipient.js'
 row,stdout=helper.execute(root,out,'original-source',command(),source,source.read_bytes(),timeout=45)
 leaves=failures(row,stdout)
 for name,message in [
 ('callback retired between capture and invocation cannot borrow its replacement','captured old callback must not borrow successor registration'),
 ('retiring handler cannot unregister another owner at its address','retiring handler must preserve exact successor registration'),
 ('registered read uses the workflow normalized dispatch timeout','registered read must use normalized owner timeout'),
 ('shutdown after delivery but before final row read submits nothing','retired owner must refuse after the post-delivery authority read')]:
  exact(leaves,name,message)
 row['failures']=leaves
 (out/'original-source.json').write_text(json.dumps(row,indent=2)+'\n')
 print(json.dumps(row,indent=2))

def stats():
 for name in ['decisions','grammar','literals']:
  data=json.loads((out/(name+'.stdout.txt')).read_text());assert data['totalViolationCount']==0,(name,data)
 for name in ['complexity','cognitive']:
  def rows(phase):
   data=json.loads((out/(name+'-'+phase+'.json')).read_text())
   return collections.Counter((x['filePath'],x['message']) for x in data['violations'])
  assert not rows('after')-rows('before'),(name,rows('after')-rows('before'))

def timing():
 result={}
 for name,limit,count in [('recipient',30000,1),('consumer',30000,1),('process',30000,1),
 ('regressions',2000,4),('cache',30000,1),('neighbors',2000,2),('transport',2000,2),('gateway',2000,1)]:
  rows=re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',(out/(name+'.stdout.txt')).read_text(),re.M)
  assert len(rows)==count,(name,rows)
  result[name]={'limitMs':limit,'files':rows,'withinBudget':all(int(ms)<=limit for _,_,ms in rows)}
 (out/'timings.json').write_text(json.dumps(result,indent=2)+'\n')
 assert all(x['withinBudget'] for x in result.values()),result

def mutate():
 helper.refuse_under_probe(root)
 cases=[
 ('invoked-registration','src/node/message-group-membership-recipient.js',
 [('const router = invocation?.router;','const router = handler.messageRouter;'),
 ('const registration = invocation?.callback;','const registration = handler.registeredRouterHandler;')],
 'callback retired between capture and invocation cannot borrow its replacement',
 'captured old callback must not borrow successor registration'),
 ('exact-retirement','src/node/message-group-service-handler.js',
 [('messageRouter.unregisterExact(handlerAddress, registration);','messageRouter.unregister(handlerAddress);')],
 'retiring handler cannot unregister another owner at its address',
 'retiring handler must preserve exact successor registration'),
 ('owner-guard-binding','src/rebalancer/operation-workflow-message-group-native-read.js',
 [('readAtRecipient(owner, recipient, query), canSubmit))','readAtRecipient(owner, recipient, query)))')],
 'shutdown after delivery but before final row read submits nothing',
 'retired owner must refuse after the post-delivery authority read'),
 ('retry-guard','src/rebalancer/replica-operation-repository-mutation-gateway-methods.js',
 [("        if (typeof options.canSubmit === 'function' && options.canSubmit() !== true) {\n          return {success: false, admissionRefused: true};\n        }\n",'')],
 'a retired owner cannot submit a retry after pre-submission failure',
 'retired owner must not submit another gateway attempt'),
 ('lease-retry-guard','src/rebalancer/replica-operation-message-group-membership-authorization.js',
 [('canSubmit() &&\n        membershipClaimIsLocalAndLive(repository, input.claim, input.identity)','canSubmit()')],
 'lease expiry prevents a new retry but preserves an unresolved submitted attempt',
 'expired holder must not submit a new retry'),
 ]
 results=[]
 for name,relative,edits,leaf,message in cases:
  source=root/relative;original=source.read_bytes();changed=original.decode()
  for before,after in edits:
   assert changed.count(before)==1,(name,'mutation anchor drift',before)
   changed=changed.replace(before,after)
  row,stdout=helper.execute(root,out,name,command(),source,original,changed.encode(),timeout=45)
  assert source.read_bytes()==original
  exact(failures(row,stdout),leaf,message)
  row.update(intendedAssertionFailed=True,requiredTest=leaf,requiredAssertion=message)
  results.append(row);(out/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps(results,indent=2))

def report():
 r={'schema':'authority-submission/1','runId':os.environ['GITHUB_RUN_ID'],
 'baseSha':os.environ['EXPECTED'],'sourceSha':(out/'source-sha.txt').read_text().strip(),
 'redSha':(out/'red-sha.txt').read_text().strip(),
 'timings':json.loads((out/'timings.json').read_text()),
 'mutations':json.loads((out/'mutations.json').read_text()),
 'canonicalEvidence':json.loads((out/'canonical.json').read_text()),
 'normalDependencies':True,'physicalMultiHost':False,'fullDriver':False,'currentCreate':False,
 'successorIssuance':False,'commitAuthorityFinding':'4231684822 remains open',
 'independentApproval':False,'fullLabVerdict':'FAIL'}
 p=Path('solve/quests')/os.environ['QUEST']/'evidence'/('authority-submission-'+os.environ['GITHUB_RUN_ID']+'.json')
 p.write_text(json.dumps(r,indent=2)+'\n')

if __name__=='__main__': {'red':red,'stats':stats,'timing':timing,'mutate':mutate,'report':report}[sys.argv[1]]()
