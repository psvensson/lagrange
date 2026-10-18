import os,pathlib,subprocess,json,time,shutil
root=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1');out=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/static-prereq-reruns');out.mkdir(exist_ok=True)
env=dict(os.environ);env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH'];env['NODE_OPTIONS']='--max-old-space-size=6144'
checks=[('fast-static',['node','scripts/check-fast-static.js','--base','381750de29af647d446b19adedf1da53eb712093','--explain']),('shards',['npm','run','audit:shards']),('duplication',['npm','run','test:duplication']),('seal-refresh',['node','scripts/generate-global-owner-debt-inventory.js','--refresh-import-graph-only'])]
results=[]
for name,cmd in checks:
 started=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(cmd,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 results.append(dict(check=name,command=cmd,exitCode=r.returncode,seconds=round(time.time()-started,3)))
 (out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps({k:v for k,v in results[-1].items() if k!='command'}),flush=True)
for directory in ['jscpd-src-scripts','jscpd-test']:
 source=root/'test-output/analysis'/directory/'jscpd-report.json'
 if source.exists():shutil.copyfile(source,out/(directory+'.json'))
shutil.copyfile(root/'test/shards/impact-graph-seal.json',out/'impact-graph-seal.local.json')
