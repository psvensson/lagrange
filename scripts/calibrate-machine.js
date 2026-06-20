#!/usr/bin/env node
// Machine speed probe for the rolling-restart convergence gate.
//
// Measures how fast THIS host runs the rolling-restart hot-path work mix
// (sqlite full-log scan + readiness-snapshot JSON serialize + CPU), so the gate
// can scale its WORK-BOUND budgets (settleTimeoutMs, maxSustainedOverTargetMs)
// relative to the machine it runs on instead of a hardcoded value calibrated on
// one box. See test/distributed/harness/convergence-budget-calibration.js for the
// factor model and which budgets scale (and which deliberately do not).
//
// The workload mirrors the documented seed hot path: CL-018 (raft log full-table
// JSON.parse per heartbeat), CL-010/011/019 (readiness diagnostics JSON
// serialize/parse), plus a CPU term. It does NOT need to match production exactly
// -- only to SCALE with hardware the same way, which the docker --cpus
// triangulation validates.
//
// Usage:
//   node scripts/calibrate-machine.js                       # print factor vs stored baseline
//   node scripts/calibrate-machine.js --establish-baseline  # write THIS machine as reference
//   node scripts/calibrate-machine.js --cpus 0.5            # apply cpuScaling for a --cpus limit
//   node scripts/calibrate-machine.js --emit-env            # print LAGRANGE_MACHINE_FACTOR=<v>
//   node scripts/calibrate-machine.js --json                # full JSON result
//
// Baseline + triangulation table live in test/distributed/calibration-baseline.json.

import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import Database from 'better-sqlite3';
import {
  composeMachineFactor,
  cpuScalingFromTable,
  median,
  MACHINE_FACTOR_MAX,
} from '../test/distributed/harness/convergence-budget-calibration.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(
  HERE, '../test/distributed/calibration-baseline.json');

// Workload sizing — tuned so one trial is ~100ms on a modern core (stable signal,
// cheap to run). These are the FIXED probe definition; changing them invalidates a
// stored baseline (baseline records the workload version).
const WORKLOAD_VERSION = 1;
const LOG_ROWS = 2000; // raft-log rows to scan+parse (CL-018 mirror)
const LOG_SCANS = 20; // full-table scans per trial
const JSON_ROUNDS = 2000; // readiness-snapshot serialize/parse rounds (CL-010/011/019)
const CPU_ITERS = 5_000_000; // arithmetic term
const WARMUP_TRIALS = 1;
const MEASURED_TRIALS = 7;

// A representative raft-log entry payload (shape/size like a real committed entry).
function makeLogPayload(i) {
  return JSON.stringify({
    index: i,
    term: (i % 7) + 1,
    command: {op: 'upsert', table: 'control_plane_publications', epoch: i,
      nodeIds: ['7493b0ab', '11601fe0', '35a891b8', 'ebc4aa0b', '8be8d30f'],
      payload: {revision: i, status: i % 3 === 0 ? 'PUBLISHED' : 'OPEN',
        acked: (i % 5) !== 0}},
    committedAt: 1700000000000 + i * 37,
  });
}

// A representative readiness-snapshot object (nested, ~like the diagnostics blob).
const READINESS_SNAPSHOT = {
  nodeId: '7493b0ab', epoch: 41, recoveryProtocolState: 'steady_published',
  dimensions: Object.fromEntries(Array.from({length: 24}, (_, k) =>
    [`dim_${k}`, {state: k % 2 ? 'ready' : 'pending', sinceMs: k * 1000,
      evidence: {fresh: true, watermark: k * 7, source: 'authoritative'}}])),
  partitions: Array.from({length: 8}, (_, p) => ({id: `p${p}`, leader: 'node-1',
    voters: ['a', 'b', 'c'], committedIndex: p * 100, applied: p * 100})),
};

function runSqlite() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE log (idx INTEGER PRIMARY KEY, term INTEGER, payload TEXT)');
  const insert = db.prepare('INSERT INTO log (idx, term, payload) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (let i = 0; i < LOG_ROWS; i += 1) insert.run(i, (i % 7) + 1, makeLogPayload(i));
  });
  tx();
  const selectAll = db.prepare('SELECT payload FROM log');
  let sink = 0;
  for (let s = 0; s < LOG_SCANS; s += 1) {
    for (const row of selectAll.iterate()) {
      const parsed = JSON.parse(row.payload);
      sink += parsed.term + parsed.command.epoch;
    }
  }
  db.close();
  return sink;
}

function runJson() {
  let sink = 0;
  for (let r = 0; r < JSON_ROUNDS; r += 1) {
    const s = JSON.stringify(READINESS_SNAPSHOT);
    const parsed = JSON.parse(s);
    sink += s.length + parsed.epoch;
  }
  return sink;
}

function runCpu() {
  let acc = 0;
  for (let i = 0; i < CPU_ITERS; i += 1) acc += Math.sqrt(i % 1024) * 1.0000001;
  return acc;
}

function oneTrial() {
  const t0 = performance.now();
  const a = runSqlite();
  const b = runJson();
  const c = runCpu();
  const t1 = performance.now();
  // touch sinks so V8 cannot dead-code-eliminate the work
  if (!Number.isFinite(a + b + c)) throw new Error('probe sink non-finite');
  return t1 - t0;
}

function measure() {
  for (let w = 0; w < WARMUP_TRIALS; w += 1) oneTrial();
  const samples = [];
  for (let t = 0; t < MEASURED_TRIALS; t += 1) samples.push(oneTrial());
  return {samples, medianMs: median(samples)};
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = {establishBaseline: false, emitEnv: false, json: false, cpus: null};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--establish-baseline') args.establishBaseline = true;
    else if (a === '--emit-env') args.emitEnv = true;
    else if (a === '--json') args.json = true;
    else if (a === '--cpus') args.cpus = Number(argv[++i]);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const {samples, medianMs} = measure();

  if (args.establishBaseline) {
    const baseline = {
      workloadVersion: WORKLOAD_VERSION,
      referenceMedianMs: medianMs,
      referenceSamples: samples,
      // Triangulation table (node --cpus -> settle multiplier). Populated by the
      // triangulation gates; empty == 1.0 everywhere (today's behaviour).
      cpuScalingTable: (loadBaseline() || {}).cpuScalingTable || {},
      capturedNote: 'reference host; factor 1.0 by definition',
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
    process.stderr.write(
      `calibrate: established baseline referenceMedianMs=${medianMs.toFixed(2)} ` +
      `(workloadVersion=${WORKLOAD_VERSION}) -> ${BASELINE_PATH}\n`);
    if (args.emitEnv) process.stdout.write('LAGRANGE_MACHINE_FACTOR=1.0\n');
    else if (args.json) process.stdout.write(JSON.stringify(baseline, null, 2) + '\n');
    else process.stdout.write('1.0\n');
    return;
  }

  const baseline = loadBaseline();
  const referenceMedianMs = baseline && Number.isFinite(baseline.referenceMedianMs) ?
    baseline.referenceMedianMs : medianMs; // no baseline -> treat self as reference
  const workloadMismatch =
    baseline && baseline.workloadVersion !== WORKLOAD_VERSION;
  const cpuScaling = args.cpus ?
    cpuScalingFromTable(args.cpus, (baseline || {}).cpuScalingTable) :
    1.0;
  const composed = composeMachineFactor(
    {hostMedianMs: medianMs, referenceMedianMs, cpuScaling});

  const result = {
    workloadVersion: WORKLOAD_VERSION,
    hostMedianMs: medianMs,
    referenceMedianMs,
    cpus: args.cpus,
    ...composed,
    workloadMismatch: Boolean(workloadMismatch),
    baselinePresent: Boolean(baseline),
  };

  if (composed.exceedsCap) {
    process.stderr.write(
      `calibrate: WARNING raw factor ${composed.rawCombined.toFixed(2)} exceeds ` +
      `cap ${MACHINE_FACTOR_MAX}; this machine may be too slow / noisy for a ` +
      `trustworthy gate (clamped to ${composed.combined}).\n`);
  }
  if (workloadMismatch) {
    process.stderr.write(
      `calibrate: WARNING baseline workloadVersion ${baseline.workloadVersion} != ` +
      `${WORKLOAD_VERSION}; re-establish the baseline.\n`);
  }

  if (args.emitEnv) {
    process.stdout.write(`LAGRANGE_MACHINE_FACTOR=${composed.combined}\n`);
  } else if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(`${composed.combined}\n`);
  }
}

main();
