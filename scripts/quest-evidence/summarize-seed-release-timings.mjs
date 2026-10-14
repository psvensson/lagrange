#!/usr/bin/env node
// Read-only latency census from the *existing* MessageRouter.deliver tracer.
// Interval union measures time with pending calls; it is NOT exclusive CPU
// attribution, not a release authority, and never fills truncated TAP records.
import {createHash} from 'node:crypto';
import fs from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error('usage: summarize-seed-release-timings.mjs <full TAP> <output json>');
}
const bytes = fs.readFileSync(input);
const marker = '{"schema":"participant-release-delivery-trace/1"';
const lines = bytes.toString('utf8').split('\n').filter((line) => line.includes(marker));
if (lines.length !== 1) throw new Error(`expected one full original trace, got ${lines.length}`);
const line = lines[0];
const trace = JSON.parse(line.slice(line.indexOf(marker)));
if (!Array.isArray(trace.records) ||
    trace.records.length !== trace.recordedCount ||
    trace.completionCount !== trace.recordedCount ||
    trace.captureErrorCount !== 0 || trace.droppedCount !== 0 ||
    trace.incompleteCount !== 0 || trace.diagnosticClock !==
    'monotonic-process-elapsed-ms') {
  throw new Error('incomplete or incompatible monotonic source, refuse attribution');
}

function unionMs(intervals) {
  const sorted = intervals.slice().sort((a,b) => a.start-b.start);
  let total = 0;
  let from = null;
  let to = null;
  for (const {start,end} of sorted) {
    if (from === null) {from=start;to=end;continue;}
    if (start > to) {total += to-from;from=start;to=end;}
    else to = Math.max(to,end);
  }
  if (from !== null) total += to-from;
  return Math.round(total*100)/100;
}
function peakActive(intervals) {
  const events = intervals.flatMap(({start,end})=>[
    {at:start,delta:1}, {at:end,delta:-1},
  ]).sort((a,b)=>a.at-b.at || a.delta-b.delta);
  let n=0,peak=0;
  for(const e of events){n+=e.delta;peak=Math.max(peak,n);}
  return peak;
}
function quantiles(values) {
  if(values.length===0)return {count:0,medianMs:null,p95Ms:null,maxMs:null,sumMs:0};
  const a=values.slice().sort((a,b)=>a-b);
  return {count:a.length,
    medianMs:Math.round(a[Math.floor((a.length-1)*.5)]*100)/100,
    p95Ms:Math.round(a[Math.floor((a.length-1)*.95)]*100)/100,
    maxMs:Math.round(a[a.length-1]*100)/100,
    sumMs:Math.round(a.reduce((x,y)=>x+y,0)*100)/100};
}

const intervals = [];
for (const record of trace.records) {
  const start=record.callStartedMs, end=record.completedMs;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start){
    throw new Error(`invalid monotonic pair at call ordinal ${record.callOrdinal}`);
  }
  intervals.push({start,end,ms:end-start,
    call:record.callOrdinal,
    action:record.request?.action??null,
    partition:record.request?.partitionId??null,
    outcome:record.response?.answer?.outcome??null,
    missing:record.response?.answer?.missingFact??null});
}
const control='sql_transactions-p1';
const ctrl=intervals.filter(x=>x.partition===control);
const release=intervals.filter(x=>x.action==='release');
const ctrlRel=release.filter(x=>x.partition===control);
const depRel=release.filter(x=>x.partition!==control);
const actionNames=[...new Set(intervals.map(x=>x.action))].sort();
const actions=Object.fromEntries(actionNames.map(action=>[action,
  quantiles(intervals.filter(x=>x.action===action).map(x=>x.ms))]));
const byPartition=[...new Set(intervals.map(x=>x.partition))].sort().map(partition=>{
  const a=intervals.filter(x=>x.partition===partition);
  return {partition,deliveries:a.length,requests:a.filter(x=>x.action==='release').length,
    duration:quantiles(a.map(x=>x.ms)),unionPendingMs:unionMs(a)};
});
const result={
  schema:'seed-release-timed-owner-census/1',
  source: {sha256:createHash('sha256').update(bytes).digest('hex'),
    bytes:bytes.length,traceSchema:trace.schema,
    records:trace.recordedCount,errors:trace.captureErrorCount,
    dropped:trace.droppedCount,incomplete:trace.incompleteCount},
  // These are in-flight wall-time intervals only. They are not exclusive CPU.
  traceElapsedMs:trace.traceElapsedMs,
  delivered:quantiles(intervals.map(x=>x.ms)),
  allUnionPendingMs:unionMs(intervals),
  allPeakPending:peakActive(intervals),
  control:{deliveries:ctrl.length,releaseRequests:ctrlRel.length,
    releaseDuration:quantiles(ctrlRel.map(x=>x.ms)),
    allDuration:quantiles(ctrl.map(x=>x.ms)),
    unionPendingMs:unionMs(ctrl),
    releaseUnionPendingMs:unionMs(ctrlRel),
    maxInFlightReleaseRequests:peakActive(ctrlRel)},
  dependent:{releaseRequests:depRel.length,
    releaseDuration:quantiles(depRel.map(x=>x.ms)),
    releaseUnionPendingMs:unionMs(depRel),
    maxInFlightReleaseRequests:peakActive(depRel)},
  actions,byPartition,
  slowestDeliveries:intervals.slice().sort((a,b)=>b.ms-a.ms).slice(0,16),
  firstReleaseRequests:release.slice(0,20),
  lastReleaseRequests:release.slice(-20),
  limitation:'Monotonic TAP observation only. Overlapping intervals cannot be summed as elapsed time or treated as proof of a causal private owner branch.',
};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({
  source:result.source,
  control:result.control,
  dependent:result.dependent,
  allPeakPending:result.allPeakPending,
  allUnionPendingMs:result.allUnionPendingMs,
  actions:result.actions,
  slowest:result.slowestDeliveries.slice(0,8),
})+'\n');
