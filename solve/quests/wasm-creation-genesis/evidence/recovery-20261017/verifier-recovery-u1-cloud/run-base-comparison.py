import os,pathlib,subprocess,shutil,json,hashlib
root=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1');out=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/base-comparison');out.mkdir(exist_ok=True)
env=dict(os.environ);env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH']
base='381750de29af647d446b19adedf1da53eb712093'
files=subprocess.check_output(['git','diff','--name-only',base,'HEAD','--','src'],cwd=root,text=True).splitlines()
test='test/runtime/wasm-driver-contract-conformance.test.js';files.append(test)
original={file:(root/file).read_bytes() for file in files}
baseFiles={}
for file in files:
 r=subprocess.run(['git','show',base+':'+file],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if r.returncode!=0:
  assert file=='src/node/runtime-service-restart-inventory.js',r.stderr
  baseFiles[file]=None
 else:baseFiles[file]=r.stdout
results=[]
try:
 for file,blob in baseFiles.items():
  if blob is None:(root/file).unlink()
  else:(root/file).write_bytes(blob)
 with (out/'wasm-driver-contract-conformance.runner.log').open('w') as log:
  r=subprocess.run(['npm','run','test:file','--',test],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 results.append(dict(test=test,exitCode=r.returncode,sourceBase=base))
 for suffix in ['.tap','.tap.stderr']:
  artifact=root/'.tap/test-results'/(test+suffix)
  if artifact.exists():shutil.copyfile(artifact,out/('wasm-driver-contract-conformance'+suffix))
 with (out/'complexity.log').open('w') as log:
  r=subprocess.run(['node','scripts/check-complexity.js','--scoped',*[f for f,b in baseFiles.items() if b is not None and f.startswith('src/')]],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 results.append(dict(check='complexity',exitCode=r.returncode,sourceBase=base))
finally:
 for file,blob in original.items():(root/file).write_bytes(blob)
assert all((root/f).read_bytes()==b for f,b in original.items())
(out/'results.json').write_text(json.dumps(dict(results=results,restored=True,files={f:hashlib.sha256(b).hexdigest() for f,b in original.items()}),indent=2)+'\n')
print(json.dumps(results))
