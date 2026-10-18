import os,pathlib,subprocess,shutil,json
root=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1');out=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/independent')
env=dict(os.environ);env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH']
items=[('test/service/service-consensus-creation-intent.test.js',['reservation-races.js','reservation-future-binding.js','inventory-owner-read-control.js']),('test/wasm-service/bound-creation-restart.integration.test.js',['restart-races.js','inventory-overlap.js','retirement-shutdown.js'])]
backups={file:(root/file).read_bytes() for file,_ in items}
try:
 for file,snippets in items:
  (root/file).write_bytes(backups[file]+b'\n'+b'\n'.join((out/p).read_bytes() for p in snippets))
 patch=subprocess.check_output(['git','diff','--',*[file for file,_ in items]],cwd=root)
 (out/'independent-witnesses-extended.patch').write_bytes(patch)
 for file,_ in items:
  name=pathlib.Path(file).name
  with (out/(name+'.extended.runner.log')).open('w') as log:r=subprocess.run(['npm','run','test:file','--',file],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
  for suffix in ['.tap','.tap.stderr']:
   p=root/'.tap/test-results'/(file+suffix)
   if p.exists():shutil.copyfile(p,out/(name+'.extended'+suffix))
  print(json.dumps(dict(file=file,exitCode=r.returncode)),flush=True)
finally:
 for file,blob in backups.items():(root/file).write_bytes(blob)
