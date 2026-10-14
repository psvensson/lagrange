#!/usr/bin/env node
// Read-only bounded summary of the existing exact MessageRouter.deliver trace.
// No new producer, no response manipulation, no source-layer effects.
import {createHash} from 'node:crypto';
import fs from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error('usage: summarize-seed-release-trace.mjs <raw-tap> <summary.json>');
}
const raw = fs.readFileSync(input);
const text = raw.toString('utf8');
const marker = '{"schema":"participant-release-delivery-trace/1"';
const all = text.split('\n').filter((line) => line.includes(marker));
if (all.length !== 1) {
  throw new Error(`expected one original delivery trace, found ${all.length}`);
}
const line = all[0];
const json = line.slice(line.indexOf(marker));
let trace;
try {
  trace = JSON.parse(json);
} catch (error) {
  throw new Error('original TAP trace is not complete JSON: ' + error.message);
}
if (!Array.isArray(trace.records) ||
    trace.records.length !== trace.recordedCount ||
    trace.droppedCount !== 0 || trace.captureErrorCount !== 0 ||
    trace.incompleteCount !== 0) {
  throw new Error('original tracer incomplete, refusing a release-work verdict');
}
const actions = {};
const partitions = new Map();
const releaseEvents = [];
const control = 'sql_transactions-p1';
const compact = (r) => ({
  call: r.callOrdinal, done: r.completionOrdinal, action: r.request?.action ?? null,
  partition: r.request?.partitionId ?? null, replica: r.request?.replicaId ?? null,
  outcome: r.response?.answer?.outcome ?? null,
  missing: r.response?.answer?.missingFact ?? null,
  controlOutcome: r.response?.answer?.controlOutcome ?? null,
  deadline: r.request?.deadlineAtMs ?? null,
});
for (const r of trace.records) {
  const action = r.request?.action ?? '<absent>';
  actions[action] = (actions[action] ?? 0) + 1;
  const partition = r.request?.partitionId ?? '<absent>';
  if (!partitions.has(partition)) {
    partitions.set(partition, {
      partition, deliveries: 0, release: 0, inspect: 0, observed: 0,
      controlUnavailable: 0, firstCall: r.callOrdinal, lastCall: r.callOrdinal,
      releaseCalls: [],
    });
  }
  const p = partitions.get(partition);
  p.deliveries += 1;
  p.lastCall = r.callOrdinal;
  if (action === 'release') {
    p.release += 1;
    p.releaseCalls.push(compact(r));
    releaseEvents.push(compact(r));
  }
  if (action === 'inspect') p.inspect += 1;
  if (action === 'observe_applied_position') p.observed += 1;
  if (r.response?.answer?.missingFact === 'current_control_owner_fact') {
    p.controlUnavailable += 1;
  }
}
releaseEvents.sort((a, b) => a.call - b.call);
const partitionSummary = [...partitions.values()].sort((a, b) =>
  a.firstCall - b.firstCall).map(({releaseCalls, ...p}) => ({
  ...p, releaseCalls: releaseCalls.slice(0, 12), releaseCallsTotal: releaseCalls.length,
}));
const controlEvents = trace.records.filter((r) =>
  r.request?.partitionId === control).map(compact);
const nonControlRelease = releaseEvents.filter((r) => r.partition !== control);
const uniqueRequested = new Set(nonControlRelease.map((r) => r.partition));
const releasedPerPartition = Object.fromEntries(
  partitionSummary.filter((p) => p.release > 0).map((p) => [p.partition,p.release]));
const result = {
  schema: 'seed-release-delivery-census/1',
  inputBytes: raw.length,
  inputSha256: createHash('sha256').update(raw).digest('hex'),
  sourceTraceSchema: trace.schema,
  matchedCount: trace.matchedCount, recordedCount: trace.recordedCount,
  completionCount: trace.completionCount,
  droppedCount: trace.droppedCount, captureErrorCount: trace.captureErrorCount,
  incompleteCount: trace.incompleteCount,
  actionCounts: actions,
  releaseCalls: releaseEvents.length,
  controlReleaseCalls: releasedPerPartition[control] ?? 0,
  nonControlReleaseCalls: nonControlRelease.length,
  uniqueNonControlPartitionsRequested: uniqueRequested.size,
  partitionCounts: partitionSummary.length,
  partitionSummary,
  controlFirst8: controlEvents.slice(0,8),
  controlLast8: controlEvents.slice(-8),
  releaseFirst15: releaseEvents.slice(0,15),
  releaseLast15: releaseEvents.slice(-15),
  // No inferred durations, authorization success, seed success or policy decision.
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({
  schema: result.schema, inputBytes: result.inputBytes,
  inputSha256: result.inputSha256,
  matchedCount: result.matchedCount,
  actionCounts: result.actionCounts,
  releaseCalls: result.releaseCalls,
  controlReleaseCalls: result.controlReleaseCalls,
  nonControlReleaseCalls: result.nonControlReleaseCalls,
  uniqueNonControlPartitionsRequested: result.uniqueNonControlPartitionsRequested,
  partitionCounts: result.partitionCounts,
  firstPartitionReleaseCounts: result.partitionSummary
    .filter((x) => x.release > 0).slice(0,18)
    .map((x) => ({partition: x.partition, release: x.release,
      deliveries: x.deliveries, controlUnavailable: x.controlUnavailable})),
}) + '\n');
