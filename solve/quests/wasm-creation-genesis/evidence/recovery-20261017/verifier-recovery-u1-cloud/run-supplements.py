import os,pathlib,subprocess,json,shutil,time
r=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1');o=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/independent')
f='test/wasm-service/bound-creation-restart.integration.test.js';target=r/f;original=target.read_bytes()
env=dict(os.environ);env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH']
results=[]
for name in ['older-reenter-inventory','mutation-direct-controls']:
 started=time.time()
 try:
  target.write_bytes(original+b'\n'+(o/(name+'.js')).read_bytes())
  with (o/(name+'.runner.log')).open('w') as log:
   run=subprocess.run(['npm','run','test:file','--',f],cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT)
  for suffix in ['.tap','.tap.stderr']:
   p=r/'.tap/test-results'/(f+suffix)
   if p.exists():shutil.copyfile(p,o/(name+suffix))
 finally:target.write_bytes(original)
 results.append(dict(name=name,exitCode=run.returncode,seconds=round(time.time()-started,3)))
 (o/'supplement-results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps(results[-1]),flush=True)
