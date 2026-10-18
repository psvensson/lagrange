import os, pathlib, subprocess, json, shutil, time
root=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1')
out=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/static-node22')
out.mkdir(exist_ok=True)
env=dict(os.environ)
env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH']
base='381750de29af647d446b19adedf1da53eb712093'
files=subprocess.check_output(['git','diff','--name-only',base,'HEAD','--','src','test'],cwd=root,text=True).splitlines()
src=[f for f in files if f.startswith('src/') and f.endswith('.js')]
js=[f for f in files if f.endswith('.js')]
checks=[('fast-static',['node','scripts/check-fast-static.js','--base',base,'--explain'])]
checks += [(f'decision-{i:02}', ['node','scripts/check-guideline-decision-boundaries.js','--json',file]) for i,file in enumerate(src,1)]
checks += [
 ('eslint',['node','node_modules/eslint/bin/eslint.js',*js]),
 ('complexity',['node','scripts/check-complexity.js','--scoped',*src]),
 ('cognitive',['node','scripts/check-cognitive-complexity.js','--scoped',*src]),
 ('literals',['node','scripts/check-guideline-literals.js','--json',*src]),
 ('silent-catch',['node','scripts/check-guideline-silent-catch.js','--json',*src]),
 ('shards',['npm','run','audit:shards']),
 ('impact-contracts',['npm','run','audit:impact-contracts']),
 ('duplication',['npm','run','test:duplication']),
 ('unused',['npm','run','test:unused:ratchet']),
]
results=[]
for name,command in checks:
 started=time.time()
 with (out/(name+'.log')).open('w') as log:
  r=subprocess.run(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 results.append(dict(name=name,command=command,exitCode=r.returncode,seconds=round(time.time()-started,3)))
 (out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps({k:v for k,v in results[-1].items() if k!='command'}),flush=True)
for file in (root/'test-output/analysis').glob('*'):
 if file.is_file() and any(key in file.name for key in ['complexity','duplication','unused']): shutil.copyfile(file,out/file.name)
