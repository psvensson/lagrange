import os,pathlib,subprocess,json,hashlib,time,difflib,shutil
root=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-recovery-u1')
out=pathlib.Path('/workspace/scratch/6d2a7b72384f/verify-u1-evidence/mutations')
out.mkdir(exist_ok=True)
env=dict(os.environ)
env['PATH']='/workspace/scratch/6d2a7b72384f/node22-download/node-v22.16.0-linux-x64/bin:'+env['PATH']
restart='src/node/runtime-service-restart-inventory.js'
route='src/node/runtime-service-bound-creation-route.js'
opening='src/wasm-service/wasm-creation-opening.js'
bootstrap='src/service/service-consensus-bootstrap.js'
restartTest='test/wasm-service/bound-creation-restart.integration.test.js'
routeTest='test/node/runtime-service-bound-route.test.js'
localTest='test/wasm-service/wasm-creation-local-record.test.js'
serviceTest='test/service/service-consensus-creation-intent.test.js'
publicationTest='test/wasm-service/wasm-creation-publication.integration.test.js'
mutations=[
 dict(id='M01-inventory-reads-resource-authority',file='src/service/service-lifecycle-recovery.js',test=serviceTest,
 old='    return inventoryConsensusCreationRow(operationRow);',
 new="    const entry = inventoryConsensusCreationRow(operationRow);\n    if (entry.token) await manager._serviceDefinitionsOwner.resolveInstanceResource(entry.intent.consensusBinding, entry.token);\n    return entry;",control='inventory-owner-read-control.js'),
 dict(id='M02-reentry-under-scan-id',file=restart,test=restartTest,
 old='    scheduleBoundReentry(handler, plan.creation);',
 new="    scheduleBoundReentry(handler, {...plan.creation, operationId: 'independent-scan-id'});"),
 dict(id='M03-memo-after-reentry',file=restart,test=restartTest,
 old="  for (const plan of plans) {\n    handler.localReplicas.set(plan.creation.replicaId, {replicaId: plan.creation.replicaId,\n      entityId: plan.creation.entityId, status: RESTART_MEMO[plan.action],\n      operationId: plan.creation.operationId});\n  }\n  handler.restartLatch.open();\n  setImmediate(() => {\n    for (const plan of plans) startPlan(handler, plan);\n  });",
 new="  handler.restartLatch.open();\n  setImmediate(() => {\n    for (const plan of plans) startPlan(handler, plan);\n    for (const plan of plans) handler.localReplicas.set(plan.creation.replicaId, {replicaId: plan.creation.replicaId, entityId: plan.creation.entityId, status: RESTART_MEMO[plan.action], operationId: plan.creation.operationId});\n  });"),
 dict(id='M04-row-completed-at-published',file=bootstrap,test=publicationTest,
 old='    return await confirmPublishedAuthority(manager, owned, confirmed);',
 new='    await completeConsensusCreation(manager, retained);\n    return await confirmPublishedAuthority(manager, owned, confirmed);'),
 dict(id='M05-closed-redrive-skipped',file=restart,test=restartTest,
 old='    redriveRetiredCreation(handler, plan.creation).catch((error) => {',
 new='    return;\n    redriveRetiredCreation(handler, plan.creation).catch((error) => {'),
 dict(id='M06-tombstone-inferred-from-storage-missing',file=opening,test=localTest,
 old="  if (!fs.existsSync(target.dbPath)) {\n    return {outcome: WASM_CREATION_RETIREMENT.CREATION_STORAGE_MISSING};\n  }",
 new="  if (!fs.existsSync(target.dbPath)) {\n    return {outcome: WASM_CREATION_RETIREMENT.RETIRED};\n  }"),
 dict(id='M07-five-field-local-identity',file=opening,test=localTest,
 old='  const fields = Object.keys(identity);',
 new='  const fields = Object.keys(identity).filter((field) => DERIVED_IDENTITY_FIELDS.includes(field));'),
 dict(id='M08-foreign-node-filter-removed',file=restart,test=restartTest,
 old='    } else if (entry.nodeId === handler.nodeId) {',
 new='    } else {'),
 dict(id='M09-redrive-emits-remove-outcome',file=restart,test=restartTest,
 old='  return decision;\n}\n\n// RV5.1:',
 new="  handler.emitExecutorOutcome('RUNTIME_SERVICE_REMOVE_COMPLETED', creation.operationId, 'REMOVED', {replicaId: creation.replicaId});\n  return decision;\n}\n\n// RV5.1:"),
 dict(id='M10-pending-terminal-without-resolution',file=route,test=routeTest,
 old='  const resolved = await manager.resolveRetainedReservation(creationOperationId);',
 new='  return {decision: {kind: DECISION.COMPLETED}};\n  const resolved = await manager.resolveRetainedReservation(creationOperationId);'),
 dict(id='M11-unavailable-grant-wake-pending',file=route,test=routeTest,
 old='  return PENDING_WAKE_REASONS.has(found.diagnostic.reason) && !found.unavailableGrant;',
 new='  return PENDING_WAKE_REASONS.has(found.diagnostic.reason);'),
 dict(id='M12-corrupt-retirement-kept-redrivable',file=route,test=restartTest,
 old='const PERMANENT_RETIREMENT_REFUSALS = new Set([OUTCOME.INVALID_REQUEST,\n  OUTCOME.CONTENT_CONFLICT, OUTCOME.INVALID_LINEAGE, OUTCOME.CORRUPT_STATE]);',
 new='const PERMANENT_RETIREMENT_REFUSALS = new Set([OUTCOME.INVALID_REQUEST,\n  OUTCOME.CONTENT_CONFLICT, OUTCOME.INVALID_LINEAGE]);'),
 dict(id='M13-arbitrary-lifecycle-code-permanent',file=bootstrap,test=routeTest,
 old='  if (PERMANENT_OPEN_REFUSALS.has(result?.outcome)) {',
 new="  if (typeof result?.outcome === 'string' && !unavailableOpen(result)) {"),
]
files=[x for x in subprocess.check_output(['git','ls-files','src'],cwd=root,text=True).splitlines() if (root/x).is_file()]
def hashes():return {f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files}
baseline=hashes()
(out/'source-before.json').write_text(json.dumps(baseline,indent=2)+'\n')
results=[]
for spec in mutations:
 target=root/spec['file']; original=target.read_bytes(); content=original.decode()
 assert content.count(spec['old'])==1,(spec['id'],content.count(spec['old']))
 test=root/spec['test']; testOriginal=test.read_bytes()
 mutated=content.replace(spec['old'],spec['new'],1)
 (out/(spec['id']+'.patch')).write_text(''.join(difflib.unified_diff(content.splitlines(True),mutated.splitlines(True),fromfile='a/'+spec['file'],tofile='b/'+spec['file'])))
 started=time.time()
 try:
  target.write_text(mutated)
  if spec.get('control'):
   control=out.parent/'independent'/spec['control']; test.write_bytes(testOriginal+b'\n'+control.read_bytes())
  with (out/(spec['id']+'.runner.log')).open('w') as log:
   run=subprocess.run(['npm','run','test:file','--',spec['test']],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
  for suffix in ['.tap','.tap.stderr']:
   path=root/'.tap/test-results'/(spec['test']+suffix)
   if path.exists():shutil.copyfile(path,out/(spec['id']+suffix))
 finally:
  target.write_bytes(original);test.write_bytes(testOriginal)
 assert hashes()==baseline,spec['id']+' source restoration mismatch'
 results.append(dict(id=spec['id'],file=spec['file'],test=spec['test'],exitCode=run.returncode,seconds=round(time.time()-started,3),sourceRestored=True))
 (out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps(results[-1]),flush=True)
(out/'source-after.json').write_text(json.dumps(hashes(),indent=2)+'\n')
