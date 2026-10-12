import fs from 'node:fs';
const file = process.argv[2];
const ev = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('{"t":')).map((l) => JSON.parse(l));
const plan = ev.find((e) => e.ev === 'seed.plan'); const t0 = plan.t; const rel = (t) => ((t - t0) / 1000).toFixed(3);
const stat = (xs) => xs.length === 0 ? null : ({n: xs.length, min: Math.min(...xs), p50: xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)], max: Math.max(...xs), mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), sum: xs.reduce((a, b) => a + b, 0)});
console.log('## seed partitions');
const ends = ev.filter((e) => e.ev === 'seed.partition.end');
for (const e of ends) console.log(`| ${rel(e.t)} | ${e.partitionId} | attempts=${e.attempts} | ${e.outcome} | ${e.elapsedMs} ms | remaining ${e.remainingMs} ms |`);
const ok = ends.filter((e) => e.outcome === 'cut_over' && e.partitionId !== 'sql_transactions-p1');
console.log('successful dependents:', ok.length, 'elapsed stats:', JSON.stringify(stat(ok.map((e) => e.elapsedMs))), 'attempts stats:', JSON.stringify(stat(ok.map((e) => e.attempts))));
console.log('## per-dependent: nested control cutovers and control-log entries consumed');
const r1 = ev.filter((e) => e.ev === 'apply' && e.replicaId === 'sql_transactions-p1-r1');
const starts = ev.filter((e) => e.ev === 'seed.partition.start');
for (let i = 0; i < starts.length; i++) {
  const s = starts[i]; const end = ends.find((e) => e.partitionId === s.partitionId);
  const until = end ? end.t : Infinity;
  const nested = ev.filter((e) => e.ev === 'control.nested.end' && e.dependent === s.partitionId && e.t >= s.t && e.t <= until);
  const observes = ev.filter((e) => e.ev === 'observe.return' && e.dependent === s.partitionId && e.t >= s.t && e.t <= until);
  const entries = r1.filter((e) => e.t >= s.t && e.t <= until);
  const types = {}; for (const e of entries) { const k = `${e.type.replace('_PARTICIPANT_RELEASE', '').replace('_PARTICIPANT_ADMISSION', '')}:${e.result}${e.replayed ? '(r)' : ''}`; types[k] = (types[k] ?? 0) + 1; }
  const obsWhy = {}; for (const o of observes) { const k = `L${o.line}:${o.why}${o.defect ? ':' + o.defect : ''}`; obsWhy[k] = (obsWhy[k] ?? 0) + 1; }
  const attempts = ev.filter((e) => e.ev === 'attempt.end' && e.depth === 1 && e.partitionId === s.partitionId && e.t >= s.t && e.t <= until).map((e) => `${e.outcome}${e.missingFact ? ':' + e.missingFact : ''}${e.stage ? '@' + e.stage : ''}`);
  console.log(`| ${s.partitionId} | ${rel(s.t)} | ${end ? end.elapsedMs + ' ms' : 'unfinished'} | attempts=${attempts.length} [${attempts.join(', ')}] | observe=${JSON.stringify(obsWhy)} | nested=${nested.length} [${nested.map((n) => n.outcome + (n.missingFact ? ':' + n.missingFact : '')).join(', ')}] | control entries=${entries.length} ${JSON.stringify(types)} |`);
}
console.log('## C2 witness: local.publish on control members naming a dependent authorization');
const controlAuth = ev.find((e) => e.ev === 'complete.authorized' && e.partitionId === 'sql_transactions-p1')?.authorizationId;
for (const e of ev.filter((e) => e.ev === 'local.publish' && e.partitionId === 'sql_transactions-p1' && e.authorizationId !== controlAuth).slice(0, 12)) console.log(rel(e.t), JSON.stringify({replicaId: e.replicaId, authorizationId: e.authorizationId, previous: e.previous, admissionGeneration: e.admissionGeneration, caller: e.caller.split(' <- ')[0]}));
console.log('## C3/C4 witnesses: control invalidations with obligations, reconstructs, retire answers, newPause open->closed');
for (const e of ev.filter((e) => e.ev === 'local.invalidate' && e.partitionId === 'sql_transactions-p1' && e.obligation)) console.log(rel(e.t), 'invalidate', JSON.stringify({replicaId: e.replicaId, current: e.current, gen: e.currentAdmissionGeneration, retained: e.retained, conflict: e.conflict, caller: e.caller.split(' <- ')[1]}));
for (const e of ev.filter((e) => e.ev === 'admission.newPause' && e.partitionId === 'sql_transactions-p1' && e.previousState === 'open')) console.log(rel(e.t), 'newPause', JSON.stringify({replicaId: e.replicaId, generation: e.generation, previousGeneration: e.previousGeneration, caller: e.caller.split(' <- ')[1]}));
for (const e of ev.filter((e) => e.ev === 'retire.obligation' && e.partitionId === 'sql_transactions-p1' && e.source !== 'none')) console.log(rel(e.t), 'retire.obligation', JSON.stringify({source: e.source, current: e.current, obligation: e.obligation}));
for (const e of ev.filter((e) => e.ev === 'reconstruct' && e.partitionId === 'sql_transactions-p1' && e.why === 'reconstructed').slice(0, 3)) console.log(rel(e.t), 'reconstruct', JSON.stringify({authorizationId: e.authorizationId, rev: e.controlAuthorizationRevision, retired: e.retiredTarget, current: e.currentTarget}));
const ra = ev.filter((e) => e.ev === 'retire.answer' && e.partitionId === 'sql_transactions-p1');
console.log('retire answers:', JSON.stringify(ra.reduce((m, e) => { const k = `${e.authorizationId}:${e.outcome}:${e.retiredOutcome ?? ''}:rev${e.controlRevision}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
for (const e of ra.filter((e) => e.outcome !== 'retired').slice(0, 3)) console.log(rel(e.t), 'retire.answer', JSON.stringify(e));
for (const e of ev.filter((e) => e.ev === 'run.caught' || e.ev === 'attempt.throw' || e.ev === 'receive.throw' || e.ev === 'run.inflight' || e.ev === 'admission.invalidated').slice(0, 6)) console.log(rel(e.t), JSON.stringify(e));
console.log('## control log apply counts (r1):', JSON.stringify(r1.reduce((m, e) => { const k = `${e.type}:${e.result}${e.replayed ? '(r)' : ''}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})), 'lastIndex', Math.max(...r1.map((e) => e.index)));
const retireIdx = r1.filter((e) => e.type === 'RETIRE_PARTICIPANT_RELEASE');
console.log('RETIRE entries:', JSON.stringify(retireIdx.slice(0, 8).map((e) => ({index: e.index, auth: e.authorizationId, ret: e.retirementId, result: e.result, replayed: e.replayed, before: `${e.before.state}/${e.before.auth}/rev${e.before.rev}`, after: `${e.after.state}/${e.after.auth}/rev${e.after.rev}`}))));
const staleReserve = r1.filter((e) => e.type === 'RESERVE_PARTICIPANT_RELEASE' && e.result === 'STALE');
console.log('STALE RESERVE entries (first 3):', JSON.stringify(staleReserve.slice(0, 3).map((e) => ({index: e.index, auth: e.authorizationId, before: `${e.before.state}/${e.before.auth}/rev${e.before.rev}`}))));
console.log('observe reasons:', JSON.stringify(ev.filter((e) => e.ev === 'observe.return').reduce((m, e) => { const k = `L${e.line}:${e.why}:${e.defect ?? ''}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
console.log('depth1 dependent attempt outcomes:', JSON.stringify(ev.filter((e) => e.ev === 'attempt.end' && e.depth === 1 && e.partitionId !== 'sql_transactions-p1').reduce((m, e) => { const k = `${e.outcome}:${e.missingFact ?? ''}:${e.stage ?? ''}:${e.controlOutcome ?? ''}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
console.log('perturbation sleeps:', ev.filter((e) => e.ev === 'seed.perturbation.preSleep').length);
