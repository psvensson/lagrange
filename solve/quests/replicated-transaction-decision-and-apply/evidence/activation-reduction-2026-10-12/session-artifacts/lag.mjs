import fs from 'node:fs';
for (const file of process.argv.slice(2)) {
  const ev = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('{"t":')).map((l) => JSON.parse(l));
  const applies = ev.filter((e) => e.ev === 'apply' && e.partitionId === 'sql_transactions-p1');
  const byIndex = new Map();
  for (const e of applies) { if (!byIndex.has(e.index)) byIndex.set(e.index, {}); byIndex.get(e.index)[e.replicaId.slice(-2)] = e.t; }
  const lags = [];
  for (const [index, m] of byIndex) { if (m.r1 && m.r2 && m.r3) lags.push({index, r2: m.r2 - m.r1, r3: m.r3 - m.r1}); }
  const stat = (xs) => ({n: xs.length, min: Math.min(...xs), p50: xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)], max: Math.max(...xs), mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)});
  console.log(file.split('/').pop(), 'follower apply lag ms (r2 vs r1):', JSON.stringify(stat(lags.map((l) => l.r2))), '(r3 vs r1):', JSON.stringify(stat(lags.map((l) => l.r3))));
  const first = lags.filter((l) => l.index <= 20);
  console.log('  per-index lag for idx<=20:', JSON.stringify(first));
  const confirm = applies.find((e) => e.type === 'CONFIRM_PARTICIPANT_RELEASE' && e.replicaId === 'sql_transactions-p1-r1');
  const observe = ev.find((e) => e.ev === 'observe.return');
  console.log('  CONFIRM idx', confirm.index, 'applied on r1 at', confirm.t, '; first observe.return at', observe.t, 'gap', observe.t - confirm.t, 'ms; observe why', observe.why, observe.defect ?? '');
  const seedPlan = ev.find((e) => e.ev === 'seed.plan');
  const firstNewPause = ev.find((e) => e.ev === 'admission.newPause');
  console.log('  seed.plan at', seedPlan.t, 'first trace event at', ev[0].t, ev[0].ev);
}
