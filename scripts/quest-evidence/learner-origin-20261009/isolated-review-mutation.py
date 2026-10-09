"""One intentional mutation per disposable Actions worker; never publishes source."""
import hashlib,json,os,re,sys
from pathlib import Path
out=Path('proof');name=os.environ['MUTATION']
cases={
'input-snapshot':([('src/raft/raft-rs-committed-membership-context.js','const captured = snapshotLearnerContext(context);','const captured = context;')], 'historical read snapshots exact own-data actions without invoking accessors','accessor action must be rejected before validation or encoding'),
'future-term':([('src/raft/raft-rs-committed-membership-read.js',' ||\n      BigInt(origin.term) > BigInt(status.term)','')], 'queued origin read refuses malformed bytes and impossible future terms','future-term origin cannot be committed historical evidence'),
'replay-noop':([('src/raft/raft-rs-peer-identity.js','if (row.learner_admission === null) {','if (true) {'),('src/raft/raft-rs-peer-identity-constants.js','WHERE replica_identity = ? AND learner_admission IS NULL','WHERE replica_identity = ?')], 'registry replay is a no-op and conflicting origin rolls back without replacement','identical origin replay performs no SQL update'),
'conflicting-origin':([('src/raft/raft-rs-peer-identity.js','(row.learner_admission !== null && row.learner_admission !== encoded)','false')], 'registry replay is a no-op and conflicting origin rolls back without replacement','conflicting origin must reject the enclosing application transaction')}
if sys.argv[1]=='prepare':
 out.mkdir(exist_ok=True)
 changes,test,message=cases[name];paths=[]
 for file,old,new in changes:
  p=Path(file);original=p.read_bytes();text=original.decode();assert text.count(old)==1,(name,'target drift',file)
  p.write_text(text.replace(old,new,1))
  paths.append({'file':file,'originalSha256':hashlib.sha256(original).hexdigest(),'mutatedSha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 r={'case':name,'baseSha':os.environ['EXPECTED'],'paths':paths,'test':test,'assertion':message,'isolatedCheckout':True,'sourcePublished':False}
 if name=='replay-noop':r['scope']='Compound unconditional rewrite: bypass JS no-op and SQL NULL predicate; bypassing JS alone correctly leaves SQL no-op and is not a behavior-changing mutation.'
 (out/'mutation.json').write_text(json.dumps(r,indent=2)+'\n')
elif sys.argv[1]=='check':
 r=json.loads((out/'mutation.json').read_text());s=(out/'test.stdout.txt').read_text();code=int((out/'test.exit.txt').read_text())
 assert code==1,code
 blocks=re.split(r'(?=^    # Subtest: )',s,flags=re.M)
 matched=[b for b in blocks if b.startswith('    # Subtest: '+r['test']+'\n')]
 assert len(matched)==1,'missing exact test'
 b=matched[0]
 assert re.search(r'^    not ok \d+ - '+re.escape(r['test'])+'$',b,re.M),'required test did not fail'
 assert "code: 'ERR_ASSERTION'" in b and r['assertion'] in b,'wrong assertion failure'
 for field in ['cancelled','skipped']:
  assert re.search(r'^# '+field+' 0$',s,re.M),'unexercised test'
 r['intendedAssertionFailed']=True;r['exit']=code
 (out/'result.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
else:raise SystemExit(2)
