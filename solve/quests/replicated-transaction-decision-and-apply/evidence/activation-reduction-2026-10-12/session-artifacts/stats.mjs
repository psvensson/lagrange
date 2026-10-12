import fs from 'node:fs';
const file = process.argv[2];
const ev = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('{"t":')).map((l) => JSON.parse(l));
const r1 = ev.filter((e) => e.ev === 'apply' && e.replicaId === 'sql_transactions-p1-r1');
const byType = {};
for (const e of r1) { const k = `${e.type}:${e.result}${e.replayed ? '(replayed)' : ''}`; byType[k] = (byType[k] ?? 0) + 1; }
console.log('control leader apply counts:', JSON.stringify(byType), 'lastIndex', Math.max(...r1.map((e) => e.index)));
const d1 = ev.filter((e) => e.ev === 'attempt.end' && e.depth === 1);
const d2 = ev.filter((e) => e.ev === 'attempt.end' && e.depth === 2);
const stat = (xs) => xs.length === 0 ? null : ({n: xs.length, min: Math.min(...xs), max: Math.max(...xs), mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)});
console.log('depth1 attempts elapsed:', JSON.stringify(stat(d1.map((e) => e.elapsedMs))));
console.log('depth2 (nested control) attempts elapsed:', JSON.stringify(stat(d2.map((e) => e.elapsedMs))));
const outcomes = {};
for (const e of d2) { const k = `${e.outcome}:${e.missingFact ?? ''}:${e.stage ?? ''}`; outcomes[k] = (outcomes[k] ?? 0) + 1; }
console.log('nested outcomes:', JSON.stringify(outcomes));
const starts = ev.filter((e) => e.ev === 'attempt.start' && e.depth === 1 && e.partitionId !== 'sql_transactions-p1').map((e) => e.t);
const gaps = starts.slice(1).map((t, i) => t - starts[i]);
console.log('dependent attempt cadence ms:', JSON.stringify(stat(gaps)));
// per-seed-partition
for (const e of ev.filter((x) => x.ev === 'seed.partition.end')) console.log('seed.partition.end', JSON.stringify(e));
// nested first attempts: wasClosed false count
console.log('control wasClosed=false count:', ev.filter((e) => e.ev === 'attempt.wasClosed' && e.partitionId === 'sql_transactions-p1' && e.wasClosed === false).length);
console.log('observe reasons:', JSON.stringify(ev.filter((e) => e.ev === 'observe.return').reduce((m, e) => { const k = `${e.line}:${e.why}:${e.defect ?? ''}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
console.log('retire sources:', JSON.stringify(ev.filter((e) => e.ev === 'retire.obligation' && e.partitionId === 'sql_transactions-p1').reduce((m, e) => { m[e.source] = (m[e.source] ?? 0) + 1; return m; }, {})));
console.log('retire answers (control):', JSON.stringify(ev.filter((e) => e.ev === 'retire.answer' && e.partitionId === 'sql_transactions-p1').reduce((m, e) => { const k = `${e.outcome}:${e.retiredOutcome ?? ''}:rev${e.controlRevision}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
console.log('action outcomes (control):', JSON.stringify(ev.filter((e) => e.ev === 'action' && e.partitionId === 'sql_transactions-p1').reduce((m, e) => { const k = `${e.action}:${e.outcome}:${e.missingFact ?? ''}:${e.reservedOutcome ?? ''}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
console.log('receive.* / run.* / attempt.throw:', JSON.stringify(ev.filter((e) => e.ev.startsWith('receive.') || e.ev.startsWith('run.') || e.ev === 'attempt.throw' || e.ev === 'admission.invalidated').map((e) => ({ev: e.ev, ...e})).slice(0, 10)));
const followerRet = ev.filter((e) => e.ev === 'local.invalidate' && e.partitionId === 'sql_transactions-p1' && e.obligation);
console.log('control invalidations that created obligations:', JSON.stringify(followerRet.map((e) => ({t: e.t, replicaId: e.replicaId, current: e.current, gen: e.currentAdmissionGeneration, retainedBefore: e.retained, conflict: e.conflict}))));
console.log('local.clear by replica:', JSON.stringify(ev.filter((e) => e.ev === 'local.clear').reduce((m, e) => { const k = `${e.replicaId}:${e.matched}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})));
