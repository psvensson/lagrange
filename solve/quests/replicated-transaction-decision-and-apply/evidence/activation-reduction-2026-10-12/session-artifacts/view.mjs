import fs from 'node:fs';
const file = process.argv[2];
const mode = process.argv[3];
const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('{"t":'));
const events = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const t0 = events[0]?.t ?? 0;
const rel = (e) => ((e.t - t0) / 1000).toFixed(3);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
if (mode === 'seed') {
  for (const e of events) if (e.ev.startsWith('seed.')) {
    if (e.ev === 'seed.answer' && e.attempt > 3 && e.attempt % 50 !== 0) continue;
    console.log(rel(e), e.ev, JSON.stringify(pick(e, ['count','order','allPartitionServices','index','partitionId','attempt','attempts','outcome','missingFact','controlOutcome','controlReason','stage','stageReason','elapsedMs','remainingMs'])));
  }
}
if (mode === 'flow') {
  const limit = Number(process.argv[4] ?? 400);
  let n = 0;
  for (const e of events) {
    if (['apply','action','local.invalidate','admission.newPause'].includes(e.ev)) continue;
    if (e.ev === 'seed.answer') continue;
    n += 1; if (n > limit) break;
    const o = {...e}; delete o.t; delete o.ev; delete o.caller;
    if (o.members) o.members = o.members.map((m) => `${m.replicaId?.slice(-2)}:${m.work ? `a${m.work.appliedIndex}/c${m.work.commitIndex}/l${m.work.lastIndex}` : m.outcome}${m.paused ? ' paused' : ''}${m.queryState ? ' q=' + m.queryState : ''}`);
    if (o.work) o.work = o.work.map((m) => `${m.replicaId?.slice(-2)}:a${m.work.appliedIndex}/c${m.work.commitIndex}/l${m.work.lastIndex}`);
    if (o.heldReplicas) o.heldReplicas = o.heldReplicas.map((m) => `${m.replicaId?.slice(-2)}:a${m.work.appliedIndex}/c${m.work.commitIndex}/l${m.work.lastIndex}`);
    console.log(rel(e), e.ev.padEnd(24), JSON.stringify(o));
  }
}
if (mode === 'apply') {
  const replica = process.argv[4] ?? 'sql_transactions-p1-r1';
  for (const e of events) if (e.ev === 'apply' && e.replicaId === replica) {
    console.log(rel(e), `idx=${e.index}`, e.type.padEnd(28), `auth=${e.authorizationId}`, `exp=${e.expectedControlRevision ?? e.expectedPauseGeneration}`, `ret=${e.retirementId ?? '-'}`, `rag=${e.retiredAdmissionGeneration ?? '-'}`, `=> ${e.result}${e.replayed ? '(replayed)' : ''}`, `before=${e.before.state}/${e.before.auth}/rev${e.before.rev}`, `after=${e.after.state}/${e.after.auth}/rev${e.after.rev}/ret${e.after.retirement}/resume${e.after.resumeAuth}@${e.after.resumeAuthRev}`);
  }
}
if (mode === 'local') {
  const prefix = process.argv[4] ?? 'sql_transactions-p1';
  for (const e of events) if (['local.publish','local.invalidate','local.retain','local.clear','admission.newPause','admission.open','admission.invalidated'].includes(e.ev) && e.partitionId === prefix) {
    if (e.ev === 'local.invalidate' && e.current === null && e.retained === null) continue; // no-op invalidations
    const o = {...e}; delete o.t; delete o.ev; delete o.partitionId;
    console.log(rel(e), e.ev.padEnd(22), JSON.stringify(o));
  }
}
if (mode === 'actions') {
  const prefix = process.argv[4] ?? 'sql_transactions-p1';
  for (const e of events) if (e.ev === 'action' && e.partitionId === prefix) {
    const o = {...e}; delete o.t; delete o.ev; delete o.partitionId;
    console.log(rel(e), JSON.stringify(o));
  }
}
if (mode === 'count') {
  const c = {};
  for (const e of events) { const k = `${e.ev}${e.why ? ':' + e.why : ''}${e.defect ? ':' + e.defect : ''}${e.ev === 'attempt.end' ? ':' + e.partitionId + ':d' + e.depth + ':' + e.outcome + ':' + (e.missingFact ?? '') + ':' + (e.stage ?? '') + ':' + (e.stageReason ?? '') : ''}${e.ev === 'retire.answer' ? ':' + e.outcome + ':' + (e.retiredOutcome ?? '') : ''}${e.ev === 'reconstruct' ? ':' + e.why : ''}${e.ev === 'retire.obligation' ? ':' + e.source : ''}${e.ev === 'attempt.wasClosed' ? ':' + e.partitionId + ':' + e.wasClosed : ''}`; c[k] = (c[k] ?? 0) + 1; }
  for (const [k, v] of Object.entries(c).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(6), k);
}
