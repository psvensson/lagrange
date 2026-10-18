import os,pathlib,subprocess,json,time
r=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1');o=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/static-final');o.mkdir(exist_ok=True)
env=dict(os.environ);env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH']
results=[]
for name,cmd in [('shards',['npm','run','audit:shards']),('fast-static',['node','scripts/check-fast-static.js','--base','381750de29af647d446b19adedf1da53eb712093','--explain'])]:
 started=time.time()
 with (o/(name+'.log')).open('w') as log:p=subprocess.run(cmd,cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT)
 results.append(dict(check=name,command=cmd,exitCode=p.returncode,seconds=round(time.time()-started,3)));(o/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results[-1]),flush=True)
