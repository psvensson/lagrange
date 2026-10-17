from pathlib import Path
import subprocess, json, hashlib, datetime, re
root=Path('/mnt/data/event-reconcile/repo'); out=root.parent/'evidence'
tests=[
 'test/wasm-service/wasm-creation-reconciliation.test.js',
 'test/wasm-service/wasm-creation-reconciliation.integration.test.js',
 'test/wasm-service/wasm-creation-genesis.integration.test.js',
 'test/wasm-service/wasm-retained-bootstrap.integration.test.js',
 'test/runtime/node-shutdown-cell-worker-teardown.test.js',
 'test/service/service-consensus-creation-intent.test.js',
 'test/service/service-consensus-creation-recovery.integration.test.js',
 'test/control-plane/service-instance-creation-cas.test.js',
 'test/control-plane/service-instance-selection-admission.test.js',
 'test/bootstrap/wasm-meta-table-schemas.test.js',
 'test/wasm-service/wasm-writer-state-v1.test.js',
 'test/runtime/wasm-component-driver.test.js',
 'test/runtime/service-runtime-lifecycle.test.js',
 'test/runtime/service-runtime-lifecycle-journal.test.js',
 'test/runtime/service-runtime-lifecycle-idempotency.test.js',
 'test/wasm-service/wasm-service-lifecycle.test.js',
 'test/wasm-service/wasm-strong-write-v1-native-completion.test.js',
 'test/workflow/owner-key-reconcile-queue.test.js',
 'test/workflow/owner-key-reconcile-queue-current-work.test.js',
 'test/workflow/owner-key-reconcile-queue-failure-atomicity.test.js',
 'test/workflow/reconcile-queue-retry-wait-bound-spent.test.js',
]
# Bind actual bytes independently of synthetic reconstruction Git ancestry.
paths=[p for d in ('src','test') for p in (root/d).rglob('*') if p.is_file()]
identities={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
(out/'frozen-input-file-identities.json').write_text(json.dumps(identities,sort_keys=True,indent=2)+'\n')
cmd=['node','scripts/run-classified-test-files.js',*tests]
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
r=subprocess.run(cmd,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=40)
(out/'frozen-native-and-neighbors.log').write_bytes(r.stdout)
(out/'frozen-native-and-neighbors.exit').write_text(str(r.returncode)+'\n')
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==sha for p,sha in identities.items())
text=r.stdout.decode()
rows=[dict(path=a,assertions=int(b),duration_ms=int(c)) for a,b,c in re.findall(r'^ok (test/\S+) \((\d+) assertions, (\d+)ms\)',text,re.M)]
receipt={'scope':'cloud-container classified native/component tests, not home-lab/replicated-metadata/physical-multi-host proof','baseRemote':'6ba84863490bff9a43874a03f69ad2afff4b5898','startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':cmd,'tests':tests,'exitCode':r.returncode,'fileResults':rows,'passingFiles':len(rows),'reportedAssertions':sum(x['assertions'] for x in rows),'sourceTestBytesUnchanged':True,'logSha256':hashlib.sha256(r.stdout).hexdigest(),'identityManifestSha256':hashlib.sha256((out/'frozen-input-file-identities.json').read_bytes()).hexdigest(),'nodeVersion':subprocess.check_output(['node','--version'],text=True).strip(),'retryDisabled':True}
(out/'frozen-native-and-neighbors.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(text)
print('EXACT_SOURCE_TEST_FILES',len(identities),'PASSING_FILES',len(rows),'REPORTED_ASSERTIONS',receipt['reportedAssertions'],'EXIT',r.returncode)
