import fs from 'node:fs';
const file = process.argv[2];
const ev = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('{"t":')).map((l) => JSON.parse(l));
const plan = ev.find((e) => e.ev === 'seed.plan');
const t0 = plan.t;
const rel = (t) => ((t - t0) / 1000).toFixed(3);
// --- dependent attempt timeline
console.log('## dependent timeline');
const attempts = [];
let cur = null;
for (const e of ev) {
  if (e.ev === 'attempt.start' && e.depth === 1) { cur = {partitionId: e.partitionId, start: e.t, observe: null, nested: null, nestedStage: null, end: null}; attempts.push(cur); }
  else if (cur && e.ev === 'observe.return' && e.dependent === cur.partitionId) cur.observe = `L${e.line}:${e.why}${e.defect ? ':' + e.defect : ''}`;
  else if (cur && e.ev === 'attempt.end' && e.depth === 2) { cur.nested = `${e.outcome}${e.missingFact ? ':' + e.missingFact : ''}`; cur.nestedMs = e.elapsedMs; }
  else if (cur && e.ev === 'attempt.end' && e.depth === 1 && e.partitionId === cur.partitionId) { cur.end = e.t; cur.outcome = `${e.outcome}${e.missingFact ? ':' + e.missingFact : ''}${e.stage ? ' @' + e.stage : ''}`; cur.elapsed = e.elapsedMs; cur.auth = e.authorizationId; cur = null; }
}
const seedEnds = ev.filter((e) => e.ev === 'seed.partition.end');
let n = 0; const perPartition = {};
for (const a of attempts) { perPartition[a.partitionId] = (perPartition[a.partitionId] ?? 0) + 1; a.n = perPartition[a.partitionId]; }
// compress
const key = (a) => `${a.partitionId}|${a.observe ?? '-'}|${a.nested ?? '-'}|${a.outcome}`;
let i = 0;
while (i < attempts.length) {
  let j = i;
  while (j + 1 < attempts.length && key(attempts[j + 1]) === key(attempts[i]) && attempts[i].n > 3) j += 1;
  const a = attempts[i]; const b = attempts[j];
  const span = j > i ? `#${a.n}-#${b.n} (${j - i + 1}x)` : `#${a.n}`;
  const elapsed = j > i ? `${Math.min(...attempts.slice(i, j + 1).map((x) => x.elapsed))}-${Math.max(...attempts.slice(i, j + 1).map((x) => x.elapsed))}` : String(a.elapsed);
  console.log(`| ${a.partitionId} | ${span} | ${rel(a.start)}${j > i ? '..' + rel(b.start) : ''} | ${a.observe ?? '(control: no observe)'} | ${a.nested ?? '-'} | ${a.outcome}${a.auth ? ' auth=' + a.auth : ''} | ${elapsed} |`);
  i = j + 1;
}
for (const e of seedEnds) console.log(`seed.partition.end ${e.partitionId} attempts=${e.attempts} outcome=${e.outcome} elapsedMs=${e.elapsedMs} remainingMs=${e.remainingMs}`);
// --- control log by index (leader r1) compressed
console.log('\n## control log (leader apply) by index');
const r1 = ev.filter((e) => e.ev === 'apply' && e.replicaId === 'sql_transactions-p1-r1').sort((a, b) => a.index - b.index);
const akey = (e) => `${e.type}|${e.authorizationId}|${e.result}|${e.replayed}|${e.after.state}|${e.after.auth}|${e.after.rev}|${e.before.rev}`;
i = 0;
while (i < r1.length) {
  let j = i;
  while (j + 1 < r1.length && r1[j + 1].index === r1[j].index + 1 && akey(r1[j + 1]) === akey(r1[i]) && r1[i].index > 19) j += 1;
  const e = r1[i]; const f = r1[j];
  const span = j > i ? `${e.index}-${f.index} (${j - i + 1}x)` : String(e.index);
  console.log(`| ${span} | ${rel(e.t)} | ${e.type} | ${e.authorizationId ?? '-'} | exp=${e.expectedControlRevision ?? e.expectedPauseGeneration ?? '-'} | ${e.retirementId ?? '-'}${e.retiredAdmissionGeneration ? '(ag' + e.retiredAdmissionGeneration + ')' : ''} | ${e.result}${e.replayed ? '(replayed)' : ''} | ${e.before.state ?? 'empty'}/${e.before.auth ?? '-'}/rev${e.before.rev} -> ${e.after.state ?? 'empty'}/${e.after.auth ?? '-'}/rev${e.after.rev}${e.after.retirement ? '/ret=' + e.after.retirement : ''}${e.after.resumeAuth ? '/resume=' + e.after.resumeAuth + '@' + e.after.resumeAuthRev : ''} |`);
  i = j + 1;
}
// pair compression for alternating patterns: report counts
const retireReplayed = r1.filter((e) => e.type === 'RETIRE_PARTICIPANT_RELEASE' && e.replayed).length;
const reserveStale = r1.filter((e) => e.type === 'RESERVE_PARTICIPANT_RELEASE' && e.result === 'STALE').length;
console.log(`totals: entries=${r1.length} lastIndex=${r1[r1.length-1].index} RETIRE(replayed)=${retireReplayed} RESERVE(STALE)=${reserveStale}`);
