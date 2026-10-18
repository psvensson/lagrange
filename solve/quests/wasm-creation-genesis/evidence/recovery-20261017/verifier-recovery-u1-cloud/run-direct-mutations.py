import os,pathlib,subprocess,json,hashlib,difflib,time,shutil
r=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1');o=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/mutations-direct');o.mkdir(exist_ok=True)
env=dict(os.environ);env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH']
f='test/wasm-service/bound-creation-restart.integration.test.js';test=r/f;original=test.read_bytes();control=(o.parent/'independent/mutation-direct-controls.js').read_bytes()
specs=[('M02','src/node/runtime-service-restart-inventory.js','    scheduleBoundReentry(handler, plan.creation);',"    scheduleBoundReentry(handler, {...plan.creation, operationId: 'independent-scan-id'});"),('M05','src/node/runtime-service-restart-inventory.js','    redriveRetiredCreation(handler, plan.creation).catch((error) => {','    return;\n    redriveRetiredCreation(handler, plan.creation).catch((error) => {'),('M12','src/node/runtime-service-bound-creation-route.js','const PERMANENT_RETIREMENT_REFUSALS = new Set([OUTCOME.INVALID_REQUEST,\n  OUTCOME.CONTENT_CONFLICT, OUTCOME.INVALID_LINEAGE, OUTCOME.CORRUPT_STATE]);','const PERMANENT_RETIREMENT_REFUSALS = new Set([OUTCOME.INVALID_REQUEST,\n  OUTCOME.CONTENT_CONFLICT, OUTCOME.INVALID_LINEAGE]);')]
files=subprocess.check_output(['git','ls-files','src'],cwd=r,text=True).splitlines()
def hashes():return {f:hashlib.sha256((r/f).read_bytes()).hexdigest() for f in files if (r/f).is_file()}
baseline=hashes();(o/'source-before.json').write_text(json.dumps(baseline,indent=2)+'\n');results=[]
for name,file,old,new in specs:
 target=r/file;blob=target.read_bytes();text=blob.decode();assert text.count(old)==1
 mutant=text.replace(old,new,1);(o/(name+'.patch')).write_text(''.join(difflib.unified_diff(text.splitlines(True),mutant.splitlines(True),fromfile='a/'+file,tofile='b/'+file)))
 started=time.time()
 try:
  target.write_text(mutant);test.write_bytes(original+b'\n'+control)
  with (o/(name+'.runner.log')).open('w') as log:run=subprocess.run(['npm','run','test:file','--',f],cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT)
  for suffix in ['.tap','.tap.stderr']:
   p=r/'.tap/test-results'/(f+suffix)
   if p.exists():shutil.copyfile(p,o/(name+suffix))
 finally:target.write_bytes(blob);test.write_bytes(original)
 assert hashes()==baseline;results.append(dict(name=name,exitCode=run.returncode,seconds=round(time.time()-started,3),sourceRestored=True));(o/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results[-1]),flush=True)
(o/'source-after.json').write_text(json.dumps(hashes(),indent=2)+'\n')
