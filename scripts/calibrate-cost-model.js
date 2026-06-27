#!/usr/bin/env node
// Offline per-sink micro-benchmark that calibrates the virtual-time cost model's
// cost table (test/distributed/harness/cost-table.js). The cost model charges
// virtual-ms per op as cost(opKey, inputSize) = round(fixedMs + perUnitMs*inputSize).
// This tool measures REAL wall-clock self-time of the dominant LIVE-HEAD sim sinks
// at a sweep of input sizes, linear-fits {fixedMs, perUnitMs} per op, and emits a
// cost-table spec plus the raw (size -> median ms) table so the fit is auditable.
//
// Why measuring wall-time here is allowed: the OUTPUT is data baked into the cost
// table. Only the sim RUNTIME (virtual-network charging) must be wall-clock-free;
// an offline calibration tool is exactly where real measurement belongs — same
// posture as scripts/calibrate-machine.js, whose factor model these coefficients
// are anchored to (this reference box == LAGRANGE_MACHINE_FACTOR 1.0; a slower box
// scales these coefficients up by its factor — see the footer note).
//
// Calibrated LIVE sinks (re-profiled at HEAD; parseStepsHistory is memoized away
// and deliberately NOT calibrated):
//   1. priorityRecovery.snapshotBuild  -> buildPriorityRecoveryReplicaOperationContexts
//      (src/control-plane/priority-recovery-snapshot-rebalancer.js:58) — dominant
//      per-tick build; cost scales with replica_operations row count.
//   2. systemTableCache.deepClone      -> SystemTableCache.deepClone -> fastJsonClone
//      (src/cache/system-table-cache.js:931; src/utils/fast-json-clone.js) — cost
//      scales with row size (node-count / fields per row).
//   3. raft.uncommittedSuffixScan      -> SQLiteLogAdapter.getUncommittedEntriesUpToIndex
//      (src/raft/sqlite-log-adapter.js:355) — cost scales with uncommitted suffix length.
//
// Usage:
//   node scripts/calibrate-cost-model.js            # human table + emitted spec
//   node scripts/calibrate-cost-model.js --json     # machine-readable full result
//   node scripts/calibrate-cost-model.js --quick    # smaller iteration budget (fast, noisier)

import {performance} from 'node:perf_hooks';
import Database from 'better-sqlite3';

import {median} from '../test/distributed/harness/convergence-budget-calibration.js';
import {fastJsonClone} from '../src/utils/fast-json-clone.js';
import {buildPriorityRecoveryReplicaOperationContexts} from '../src/control-plane/priority-recovery-snapshot-rebalancer.js';
import {SQLiteLogAdapter} from '../src/raft/sqlite-log-adapter.js';

// ---------------------------------------------------------------------------
// Deterministic seeded source — mulberry32. No Math.random anywhere in fixtures.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIXTURE_SEED = 0x1a2b3c4d; // fixed seed -> reproducible inputs
const NODE_POOL = [
  '7493b0ab', '11601fe0', '35a891b8', 'ebc4aa0b', '8be8d30f',
  'a1d2e3f4', 'b2c3d4e5', 'c3d4e5f6',
];
const WORKFLOW_STEPS = ['PENDING', 'CREATING', 'SYNCING', 'PROMOTING', 'ACTIVE'];
const OP_TYPES = ['ADD', 'REMOVE', 'REPLACE'];
const STATUSES = ['creating', 'syncing', 'active', 'removed'];

// ---------------------------------------------------------------------------
// Fixture builders — realistic row shapes drawn from real test fixtures
// (test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js).
// ---------------------------------------------------------------------------

// A realistic replica_operations cache row (snake_case columns, JSON steps_history),
// shaped exactly like the rows the rebalancer reads each tick.
function makeReplicaOperationRow(rng, i) {
  const partitionIdx = i % 16;
  const partitionId = `lagrange_system_${partitionIdx % 4}-p${partitionIdx}`;
  const opType = OP_TYPES[Math.floor(rng() * OP_TYPES.length)];
  const stepCount = 2 + Math.floor(rng() * 5); // 2..6 timeline steps
  const baseMs = 1700000000000 + i * 137;
  const stepsHistory = [];
  for (let s = 0; s < stepCount; s += 1) {
    stepsHistory.push({
      step: WORKFLOW_STEPS[Math.min(s, WORKFLOW_STEPS.length - 1)],
      timestamp: baseMs + s * 53,
      previousStep: s > 0 ? WORKFLOW_STEPS[Math.min(s - 1, WORKFLOW_STEPS.length - 1)] : undefined,
      inFlight: s === stepCount - 1 ? rng() < 0.3 : false,
    });
  }
  const sourceNode = NODE_POOL[Math.floor(rng() * NODE_POOL.length)];
  let targetNode = NODE_POOL[Math.floor(rng() * NODE_POOL.length)];
  if (targetNode === sourceNode) {
    targetNode = NODE_POOL[(NODE_POOL.indexOf(sourceNode) + 1) % NODE_POOL.length];
  }
  return {
    operation_id: `op-${i}-${partitionId}`,
    type: opType,
    partition_id: partitionId,
    replica_id: `${partitionId}-r${i % 3}`,
    source_node_id: sourceNode,
    target_node_id: targetNode,
    status: STATUSES[Math.floor(rng() * STATUSES.length)],
    workflow_step: WORKFLOW_STEPS[Math.min(stepCount - 1, WORKFLOW_STEPS.length - 1)],
    created_at: baseMs,
    updated_at: baseMs + stepCount * 53,
    completed_at: null,
    error_message: null,
    entity_type: 'partition',
    entity_id: partitionId,
    steps_history: JSON.stringify(stepsHistory),
  };
}

function makeReplicaOperationRows(count) {
  const rng = mulberry32(FIXTURE_SEED);
  const rows = [];
  for (let i = 0; i < count; i += 1) rows.push(makeReplicaOperationRow(rng, i));
  return rows;
}

// Realistic service rows (partition service-table rows the snapshot build cross-references).
function makeServiceRows(rng, partitionCount) {
  const rows = [];
  for (let p = 0; p < partitionCount; p += 1) {
    const partitionId = `lagrange_system_${p % 4}-p${p}`;
    for (let v = 0; v < 3; v += 1) {
      rows.push({
        service_type: 'partition',
        node_id: NODE_POOL[(p + v) % NODE_POOL.length],
        partition_id: partitionId,
        replica_id: `${partitionId}-r${v}`,
        status: rng() < 0.7 ? 'active' : 'syncing',
        raft_role: v === 0 ? 'leader' : 'follower',
        address: `10.0.0.${(p * 3 + v) % 250}:8080`,
        state_entered_at: 1700000000000 + p * 211,
        updated_at: 1700000000000 + p * 211,
      });
    }
  }
  return rows;
}

// A realistic single control-plane cache row (the unit deepClone copies for read
// isolation). Size scales with the number of nodes/voters embedded — the live
// dimension that grows the per-row clone cost. inputSize unit = node count.
function makeControlPlaneRow(rng, nodeCount) {
  const nodeIds = [];
  for (let n = 0; n < nodeCount; n += 1) {
    nodeIds.push(NODE_POOL[n % NODE_POOL.length] + '-' + n);
  }
  return {
    revision: Math.floor(rng() * 1e6),
    epoch: 41,
    status: 'PUBLISHED',
    nodeId: nodeIds[0],
    activeNodeIds: nodeIds,
    members: nodeIds.map((id, idx) => ({
      nodeId: id,
      address: `10.0.0.${idx % 250}:8080`,
      role: idx === 0 ? 'leader' : 'follower',
      voter: idx < Math.min(5, nodeCount),
      committedIndex: 1000 + idx,
      applied: 1000 + idx,
      health: {fresh: true, watermark: idx * 7, source: 'authoritative'},
    })),
    partitions: nodeIds.map((id, idx) => ({
      id: `p${idx}`,
      leader: id,
      voters: nodeIds.slice(0, 3),
      committedIndex: idx * 100,
    })),
    acked: rng() < 0.5,
  };
}

// A realistic raft log command payload (committed-entry shape).
function makeRaftCommand(rng, i) {
  return {
    op: 'upsert',
    table: i % 2 ? 'control_plane_publications' : 'replica_operations',
    epoch: i,
    nodeIds: NODE_POOL.slice(0, 5),
    payload: {
      revision: i,
      status: i % 3 === 0 ? 'PUBLISHED' : 'OPEN',
      acked: rng() < 0.8,
      detail: {a: i, b: i * 2, c: `payload-${i}`},
    },
  };
}

// ---------------------------------------------------------------------------
// Sink invocations — each calls the REAL op the sim charges for.
// ---------------------------------------------------------------------------

// 1. priorityRecovery.snapshotBuild — REAL build, faithful (real op, real fixtures).
function makeSnapshotBuildSink(rowCount) {
  const replicaOperationRows = makeReplicaOperationRows(rowCount);
  const rng = mulberry32(FIXTURE_SEED ^ 0x9e3779b9);
  const partitionCount = Math.max(8, Math.ceil(rowCount / 4));
  const serviceRows = makeServiceRows(rng, partitionCount);
  const options = {nowMs: 1700000000000 + rowCount * 1000};
  return function run() {
    const out = buildPriorityRecoveryReplicaOperationContexts(
      replicaOperationRows, null, serviceRows, options,
    );
    // touch result so V8 cannot dead-code-eliminate
    return Object.keys(out.byOperationId).length + Object.keys(out.byPartitionId).length;
  };
}

// 2. systemTableCache.deepClone — REAL clone path (SystemTableCache.deepClone is a
//    1-line passthrough to fastJsonClone; faithful, calls the exact production fn).
function makeDeepCloneSink(nodeCount) {
  const rng = mulberry32(FIXTURE_SEED ^ 0x85ebca6b);
  const row = makeControlPlaneRow(rng, nodeCount);
  return function run() {
    const clone = fastJsonClone(row);
    return clone.members.length;
  };
}

// 3. raft.uncommittedSuffixScan — REAL adapter against a real in-memory sqlite DB.
//    Faithful: builds an actual _raft_log, sets the committed watermark so exactly
//    `suffixLen` rows are uncommitted, then calls the production scan method.
function makeRaftSuffixScanSink(suffixLen) {
  const COMMITTED_PREFIX = 200; // realistic already-committed body below the watermark
  const rng = mulberry32(FIXTURE_SEED ^ 0xc2b2ae35);
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db);
  const total = COMMITTED_PREFIX + suffixLen;
  for (let i = 1; i <= total; i += 1) {
    adapter.put({index: i, term: (i % 7) + 1, command: makeRaftCommand(rng, i)});
  }
  adapter.setCommittedIndex(COMMITTED_PREFIX); // suffix (COMMITTED_PREFIX, total] uncommitted
  const upTo = total;
  return {
    run() {
      const entries = adapter.getUncommittedEntriesUpToIndex(upTo, 0);
      return entries.length;
    },
    dispose() {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Measurement harness — warm up, then median per-call ms over `trials` batches.
// Each batch auto-sizes its iteration count to a wall-time budget (msPerBatch)
// with a min-iters floor, so a cheap op gets many iters and an expensive op
// (e.g. snapshotBuild at N=500) gets few — the whole tool stays bounded while
// every cell still amortizes timer/jitter noise.
// ---------------------------------------------------------------------------
function calibrateBatchIters(run, msPerBatch, minIters) {
  // Estimate per-call cost from a tiny probe, then pick iters to fill msPerBatch.
  const probeIters = Math.max(1, minIters >> 2);
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < probeIters; i += 1) sink += run();
  const probeMs = performance.now() - t0;
  if (!Number.isFinite(sink)) throw new Error('sink non-finite');
  const perCall = probeMs / probeIters || 1e-6;
  return Math.max(minIters, Math.ceil(msPerBatch / perCall));
}

function measureMedianMs(run, {msPerBatch, minIters, warmupBatches, trials}) {
  const iters = calibrateBatchIters(run, msPerBatch, minIters);
  for (let w = 0; w < warmupBatches; w += 1) {
    let sink = 0;
    for (let i = 0; i < iters; i += 1) sink += run();
    if (!Number.isFinite(sink)) throw new Error('sink non-finite');
  }
  const perCallMs = [];
  for (let t = 0; t < trials; t += 1) {
    const t0 = performance.now();
    let sink = 0;
    for (let i = 0; i < iters; i += 1) sink += run();
    const t1 = performance.now();
    if (!Number.isFinite(sink)) throw new Error('sink non-finite');
    perCallMs.push((t1 - t0) / iters);
  }
  return median(perCallMs);
}

// Ordinary-least-squares fit of y = fixed + perUnit*x.
function linearFit(points) {
  const n = points.length;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (const {x, y} of points) {
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) {
    return {fixedMs: sy / n, perUnitMs: 0, r2: 0};
  }
  const perUnitMs = (n * sxy - sx * sy) / denom;
  const fixedMs = (sy - perUnitMs * sx) / n;
  const meanY = sy / n;
  let ssTot = 0; let ssRes = 0;
  for (const {x, y} of points) {
    const pred = fixedMs + perUnitMs * x;
    ssTot += (y - meanY) ** 2;
    ssRes += (y - pred) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return {fixedMs, perUnitMs, r2};
}

const round = (v, dp = 4) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

// ---------------------------------------------------------------------------
// Sink definitions: opKey, input-size sweep, unit semantics, faithfulness, budget.
// ---------------------------------------------------------------------------
function buildSinkDefs(quick) {
  // Per-cell wall-time budget auto-sizes the iteration count; total run stays
  // bounded (~msPerBatch * (warmupBatches + trials) * #sizes per sink).
  const budget = quick ?
    {msPerBatch: 25, minIters: 30, warmupBatches: 2, trials: 5} :
    {msPerBatch: 80, minIters: 100, warmupBatches: 3, trials: 9};
  // raft scan touches a fresh DB per size; same budget shape.
  const raftBudget = quick ?
    {msPerBatch: 25, minIters: 10, warmupBatches: 2, trials: 5} :
    {msPerBatch: 80, minIters: 30, warmupBatches: 2, trials: 7};
  return [
    {
      opKey: 'priorityRecovery.snapshotBuild',
      unit: 'replica_operations rows',
      faithful: 'real op (buildPriorityRecoveryReplicaOperationContexts) on real ' +
        'snake_case rows + service rows; parseStepsHistory shares the production memo',
      sizes: [10, 50, 100, 200, 500],
      // The op is super-linear; the rolling-restart / CPU-saturation regime runs
      // tens of concurrent replica_operations (the metastable storm peaked ~20-50,
      // not 500). Fit the operating range too so the consumer can pick the slope
      // that matches the regime it models instead of a whole-sweep average.
      operatingRangeMax: 100,
      budget,
      make: (size) => ({run: makeSnapshotBuildSink(size)}),
    },
    {
      opKey: 'systemTableCache.deepClone',
      unit: 'embedded node count (row size proxy)',
      faithful: 'real op (fastJsonClone, the exact SystemTableCache.deepClone target) ' +
        'on a realistic single control-plane publication row',
      sizes: [3, 5, 10, 25, 50, 100],
      budget,
      make: (size) => ({run: makeDeepCloneSink(size)}),
    },
    {
      opKey: 'raft.uncommittedSuffixScan',
      unit: 'uncommitted suffix length (rows)',
      faithful: 'real op (SQLiteLogAdapter.getUncommittedEntriesUpToIndex) against a ' +
        'real in-memory better-sqlite3 _raft_log with the committed watermark set',
      sizes: [1, 5, 10, 25, 50, 100],
      budget: raftBudget,
      make: (size) => makeRaftSuffixScanSink(size),
    },
  ];
}

function calibrateSink(def) {
  const raw = [];
  for (const size of def.sizes) {
    const {run, dispose} = def.make(size);
    const medianMs = measureMedianMs(run, def.budget);
    raw.push({size, medianMs: round(medianMs, 6)});
    if (typeof dispose === 'function') dispose();
  }
  const fit = linearFit(raw.map(({size, medianMs}) => ({x: size, y: medianMs})));
  const fixedMs = Math.max(0, round(fit.fixedMs));
  const perUnitMs = Math.max(0, round(fit.perUnitMs, 6));
  // Convexity diagnostic: ratio of measured per-unit slope at the largest vs the
  // smallest sampled size. >>1 means the op is super-linear and a single linear
  // {fixedMs, perUnitMs} understates the high-N tail (and overstates the low-N head).
  const first = raw[0];
  const last = raw[raw.length - 1];
  const slopeLowMs = first.size > 0 ? first.medianMs / first.size : 0;
  const slopeHighMs = last.size > 0 ? last.medianMs / last.size : 0;
  const convexity = slopeLowMs > 0 ? round(slopeHighMs / slopeLowMs, 3) : null;
  // Per-point linear-model error so the fit fidelity is auditable.
  const fitTable = raw.map(({size, medianMs}) => {
    const predicted = round(fixedMs + perUnitMs * size, 6);
    return {size, medianMs, predicted, residualMs: round(medianMs - predicted, 6)};
  });
  let operatingRange = null;
  if (Number.isFinite(def.operatingRangeMax)) {
    const windowed = raw.filter(({size}) => size <= def.operatingRangeMax);
    if (windowed.length >= 2) {
      const wfit = linearFit(windowed.map(({size, medianMs}) => ({x: size, y: medianMs})));
      operatingRange = {
        maxSize: def.operatingRangeMax,
        fixedMs: Math.max(0, round(wfit.fixedMs)),
        perUnitMs: Math.max(0, round(wfit.perUnitMs, 6)),
        r2: round(wfit.r2, 4),
      };
    }
  }
  return {
    opKey: def.opKey,
    unit: def.unit,
    faithful: def.faithful,
    raw,
    fitTable,
    fixedMs,
    perUnitMs,
    r2: round(fit.r2, 4),
    convexity,
    operatingRange,
  };
}

function printHuman(results) {
  const w = process.stdout.write.bind(process.stdout);
  w('\n=== cost-model calibration (reference box; LAGRANGE_MACHINE_FACTOR=1.0) ===\n');
  for (const r of results) {
    w(`\n[${r.opKey}]  unit: ${r.unit}\n`);
    w(`  faithfulness: ${r.faithful}\n`);
    w('  raw (size -> median ms/call | linear-predicted | residual):\n');
    for (const {size, medianMs, predicted, residualMs} of r.fitTable) {
      w(`    ${String(size).padStart(5)}  ->  ${String(medianMs).padEnd(11)}` +
        ` | pred ${String(predicted).padEnd(11)} | resid ${residualMs}\n`);
    }
    w(`  fit: fixedMs=${r.fixedMs}  perUnitMs=${r.perUnitMs}  R^2=${r.r2}`);
    if (r.convexity !== null) {
      w(`  convexity(highN/lowN slope)=${r.convexity}`);
      if (r.convexity >= 1.5) {
        w(' [SUPER-LINEAR: linear fit understates the high-N tail]');
      }
    }
    w('\n');
    if (r.operatingRange) {
      w(`  operating-range fit (size<=${r.operatingRange.maxSize}): ` +
        `fixedMs=${r.operatingRange.fixedMs}  ` +
        `perUnitMs=${r.operatingRange.perUnitMs}  R^2=${r.operatingRange.r2}\n`);
    }
  }
  w('\n=== emitted cost-table spec (paste into createCostTable / harness) ===\n');
  w('# super-linear sinks use the operating-range fit (the regime the CPU-saturation\n' +
    '# repro models); whole-sweep slope is in `detail` of --json for the stress tail.\n');
  w(JSON.stringify(recommendedSpec(results), null, 2) + '\n');
  w('\nNote: these are absolute ms on THIS reference box (machine factor 1.0). On a\n' +
    'slower box scale every coefficient by LAGRANGE_MACHINE_FACTOR\n' +
    '(node scripts/calibrate-machine.js --emit-env), since the cost model charges\n' +
    'virtual-ms and both fixedMs and perUnitMs are wall-time-derived.\n');
}

// The coefficient to bake in: prefer the operating-range fit for super-linear sinks
// (a single linear slope over the whole sweep over-charges the mid-range — see the
// negative residuals), else the whole-sweep fit.
function recommendedSpec(results) {
  const spec = {};
  for (const r of results) {
    const useRange = r.operatingRange && r.convexity !== null && r.convexity >= 1.5;
    spec[r.opKey] = useRange ?
      {fixedMs: r.operatingRange.fixedMs, perUnitMs: r.operatingRange.perUnitMs} :
      {fixedMs: r.fixedMs, perUnitMs: r.perUnitMs};
  }
  return spec;
}

function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const json = args.includes('--json');
  const defs = buildSinkDefs(quick);
  const results = defs.map(calibrateSink);
  if (json) {
    process.stdout.write(JSON.stringify({
      referenceBox: true,
      machineFactor: 1.0,
      quick,
      spec: recommendedSpec(results),
      detail: results,
    }, null, 2) + '\n');
    return;
  }
  printHuman(results);
}

main();
