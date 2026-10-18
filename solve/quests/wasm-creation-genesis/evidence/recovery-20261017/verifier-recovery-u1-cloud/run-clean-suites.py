import os, pathlib, subprocess, json, shutil, time
root=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1')
out=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/runs-node22')
out.mkdir(exist_ok=True)
env=dict(os.environ)
env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH']
files=[
 'test/wasm-service/bound-creation-restart.integration.test.js',
 'test/node/runtime-service-bound-route.test.js',
 'test/service/service-consensus-creation-intent.test.js',
 'test/wasm-service/wasm-creation-local-record.test.js',
 'test/service/service-type-adapter.test.js',
 'test/wasm-service/wasm-service-lifecycle.test.js',
 'test/wasm-service/wasm-creation-publication.integration.test.js',
 'test/runtime/wasm-driver-contract-conformance.test.js',
 'test/wasm-service/bound-creation-handler-embedding.integration.test.js',
 'test/node/runtime-service-handler.test.js',
]
results=[]
for file in files:
 name=pathlib.Path(file).name
 started=time.time()
 with (out/(name+'.runner.log')).open('w') as log:
  r=subprocess.run(['npm','run','test:file','--',file],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 for suffix in ['.tap','.tap.stderr']:
  artifact=root/'.tap/test-results'/(file+suffix)
  if artifact.exists(): shutil.copyfile(artifact,out/(name+suffix))
 results.append(dict(file=file,exitCode=r.returncode,seconds=round(time.time()-started,3)))
 (out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps(results[-1]),flush=True)
