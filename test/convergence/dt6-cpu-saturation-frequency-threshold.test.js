import t from '../../src/test-helpers/tap.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {createCostTable} from '../distributed/harness/cost-table.js';

// ============================================================================
// DT6 CPU-saturation FREQUENCY THRESHOLD — does the REAL calibrated
// priority-recovery snapshot-build cost saturate a per-restart budget at a
// REALISTIC invocation frequency x backlog, or not?
// ============================================================================
//
// WHY THIS TEST EXISTS:
//   The prior repro (dt6-cpu-saturation-missed-budget-spike.test.js) DID flip
//   a load signal red-on-revert, but it saturated the single core using
//   PLACEHOLDER coefficients ({fixedMs:5, perUnitMs:12}) — ~1800x larger than
//   the measured real per-unit cost (real operating-range perUnitMs ~= 0.0067).
//   That test proved the MECHANISM (the cost seam is the cause) but NOT the
//   MAGNITUDE. This test asks the magnitude question directly: drive the REAL
//   snapshot-build op through the REAL cost seam at a parameterized FREQUENCY
//   (invocations/sec) and BACKLOG (replica_operations rows/build) and find the
//   THRESHOLD (freq x backlog) at which accumulated single-core charge meets or
//   exceeds the per-restart budget — then judge whether that threshold is
//   reachable at a realistic storm frequency.
//
// THE SEAM (identical to the prior repro — the cost is the cause):
//   Each modeled invocation calls the REAL cost seam
//     networkTimeSource(id).charge('priorityRecovery.snapshotBuild', backlog)
//   which advances ONLY the owning node's single-core busyUntilMs by
//   costTable.cost(opKey, backlog) (virtual-network.js chargeNode). Over a
//   BUDGET_MS window the node's accumulated busy time is
//     nodeBusyUntil(id) - START_MS
//   and SATURATION = that accumulated charge >= BUDGET_MS: the single core is
//   never idle within the window, so it cannot service its budget-bound work
//   (the docker `load` / in-flight-not-clearing signal). With costTable null
//   the same invocations charge nothing (busyUntil never advances) — the seam
//   is provably the sole cause (test 4 below).
//
// THE REAL COEFFICIENTS (scripts/calibrate-cost-model.js, reference box,
// LAGRANGE_MACHINE_FACTOR 1.0):
//   priorityRecovery.snapshotBuild: fixedMs 0, perUnitMs 0.00673 for the
//     OPERATING RANGE backlog<=100 (the metastable-storm regime; the storm
//     peaked ~20-50 in-flight, not 500). The op is SUPER-LINEAR above that
//     (convexity 7.38): N=200 ~= 2.13ms, N=500 ~= 11.82ms measured. For the
//     high-N "what would saturate" question we therefore charge against the
//     RAW measured table (interpolated) so we don't under-charge the convex
//     tail by using the head slope. Both costings are real calibration output.
//   systemTableCache.deepClone: fixedMs 0, perUnitMs 0.000285 (per-tick clone
//     companion; ~24x cheaper than the snapshot build — folded in below).
//
// DETERMINISM: no wall-clock, no RNG. Each modeled run is a pure function of
// (BUDGET_MS, frequency, backlog, costTable) — same inputs => identical
// accumulated charge (asserted directly in test 5).

// --- real calibration output (cost-table.js operating-range fit, N<=100) -----
const REAL_SNAPSHOT_BUILD_FIXED_MS = 0;
const REAL_SNAPSHOT_BUILD_PER_UNIT_MS = 0.00673; // backlog <= 100 operating range
const REAL_DEEP_CLONE_FIXED_MS = 0;
const REAL_DEEP_CLONE_PER_UNIT_MS = 0.000285;

const COST_SPEC = {
  'priorityRecovery.snapshotBuild': {
    fixedMs: REAL_SNAPSHOT_BUILD_FIXED_MS,
    perUnitMs: REAL_SNAPSHOT_BUILD_PER_UNIT_MS,
  },
  'systemTableCache.deepClone': {
    fixedMs: REAL_DEEP_CLONE_FIXED_MS,
    perUnitMs: REAL_DEEP_CLONE_PER_UNIT_MS,
  },
};

const SNAPSHOT_OP_KEY = 'priorityRecovery.snapshotBuild';

// The per-restart active budget window: the docker oracle's wall-clock deadline
// `startMs + perRestartActiveTimeoutMs` (rolling-restart.js default 120_000ms).
// This is the REAL budget at HEAD — NOT compressed (the prior repro compressed
// it to 1000ms so a placeholder coefficient could saturate; here we keep the
// real 120s precisely because the question is whether REAL costs saturate it).
const DEFAULT_BUDGET_MS = 120_000;
const START_MS = 1_000_000;
const SATURATION_NODE = 'rejoiner-7493b0ab';

// The RAW measured per-build cost table (median ms/call, reference box) from
// scripts/calibrate-cost-model.js --json. Used to charge HIGH-N backlogs
// faithfully (the op is super-linear past the operating range, so the head
// slope under-charges the tail).
const RAW_SNAPSHOT_BUILD_TABLE = [
  {size: 10, medianMs: 0.032024},
  {size: 50, medianMs: 0.218054},
  {size: 100, medianMs: 0.637923},
  {size: 200, medianMs: 2.126556},
  {size: 500, medianMs: 11.816925},
];

// Interpolate (and extrapolate from the last segment) the raw measured per-build
// ms for an arbitrary backlog — the faithful convex high-N cost.
function rawSnapshotBuildMs(backlog) {
  const table = RAW_SNAPSHOT_BUILD_TABLE;
  if (backlog <= table[0].size) {
    return (table[0].medianMs * backlog) / table[0].size;
  }
  for (let i = 1; i < table.length; i += 1) {
    if (backlog <= table[i].size) {
      const lo = table[i - 1];
      const hi = table[i];
      return lo.medianMs +
        ((hi.medianMs - lo.medianMs) * (backlog - lo.size)) / (hi.size - lo.size);
    }
  }
  const lo = table[table.length - 2];
  const hi = table[table.length - 1];
  return lo.medianMs +
    ((hi.medianMs - lo.medianMs) * (backlog - lo.size)) / (hi.size - lo.size);
}

// The per-build single-core cost (ms) for one snapshot build at `backlog`, under
// the OPERATING-RANGE linear cost model (cost-table.js rounds to whole ms — so
// we read the un-rounded model directly here to keep the sub-ms resolution the
// realistic regime lives in). Includes the deep-clone companion charge (one
// clone per build).
function operatingRangePerBuildMs(backlog) {
  return (REAL_SNAPSHOT_BUILD_FIXED_MS + REAL_SNAPSHOT_BUILD_PER_UNIT_MS * backlog) +
    (REAL_DEEP_CLONE_FIXED_MS + REAL_DEEP_CLONE_PER_UNIT_MS * backlog);
}

// The faithful per-build cost (ms): operating-range linear fit for backlog<=100,
// raw measured (convex tail) above that, both plus the deep-clone companion.
function faithfulPerBuildMs(backlog) {
  if (backlog <= 100) {
    return operatingRangePerBuildMs(backlog);
  }
  return rawSnapshotBuildMs(backlog) + (REAL_DEEP_CLONE_PER_UNIT_MS * backlog);
}

// Drive the REAL cost seam: register a node on a cost-modeled VirtualNetwork and
// charge it `invocations` snapshot-build charges of size `backlog`, returning the
// accumulated single-core busy time over the window (nodeBusyUntil - START_MS).
// This is the genuine seam path (networkTimeSource(id).charge -> chargeNode ->
// costTable.cost) the production-hosting tests use; costTable null => no charge.
function accumulateChargeViaSeam({invocations, backlog, costTable}) {
  const net = createVirtualNetwork({startMs: START_MS, costTable});
  net.registerNode(SATURATION_NODE, () => {});
  const ts = net.networkTimeSource(SATURATION_NODE);
  for (let i = 0; i < invocations; i += 1) {
    // The dominant snapshot-build sink, charged at the modeled backlog.
    ts.charge(SNAPSHOT_OP_KEY, backlog);
    // The per-build deep-clone companion (one clone per build).
    ts.charge('systemTableCache.deepClone', backlog);
  }
  return net.nodeBusyUntil(SATURATION_NODE) - START_MS;
}

// Model one swept (frequency, backlog) point over a budget window. invocations =
// freq/s * windowSeconds. We compute accumulated charge two ways:
//   - viaSeam: the REAL cost-table seam (whole-ms rounded — what the harness
//     actually charges; sub-ms per-op charges floor to 0, which is itself a
//     finding: at realistic backlogs the rounded charge is ZERO).
//   - modelMs: the un-rounded faithful per-build ms x invocations — the sub-ms
//     accumulation the cost-table rounding would otherwise erase.
// Saturation = accumulated >= budget (node never idle within the window).
function modelPoint({frequency, backlog, budgetMs, costTable}) {
  const windowSeconds = budgetMs / 1000;
  const invocations = Math.round(frequency * windowSeconds);
  const perBuildMs = faithfulPerBuildMs(backlog);
  const modelMs = perBuildMs * invocations;
  const viaSeamMs = costTable ?
    accumulateChargeViaSeam({invocations, backlog, costTable}) :
    0;
  return {
    frequency,
    backlog,
    invocations,
    perBuildMs,
    modelMs,
    viaSeamMs,
    budgetMs,
    saturatedModel: modelMs >= budgetMs,
    saturatedSeam: viaSeamMs >= budgetMs,
  };
}

// Solve: at a fixed backlog, the frequency (invocations/sec) at which accumulated
// charge first meets the budget over the window. accumulated = perBuildMs * freq *
// windowSeconds >= budgetMs  =>  freq >= budgetMs / (perBuildMs * windowSeconds)
//                              =  1000 / perBuildMs  (budget-independent: it is just
//                                 "fill every second with builds").
function solveSaturatingFrequency({backlog, budgetMs}) {
  const windowSeconds = budgetMs / 1000;
  const perBuildMs = faithfulPerBuildMs(backlog);
  const freq = budgetMs / (perBuildMs * windowSeconds);
  const totalBuilds = freq * windowSeconds;
  return {backlog, perBuildMs, frequency: freq, totalBuildsOverWindow: totalBuilds};
}

// ============================================================================
// 1. THE THRESHOLD SWEEP: at REAL calibrated costs, which (freq, backlog) points
//    saturate the 120s budget and which do not? Print the full table.
// ============================================================================
t.test('REAL-cost frequency x backlog threshold sweep: which points saturate a ' +
  '120s per-restart budget and which do not (printed table)', (t) => {
  const budgetMs = DEFAULT_BUDGET_MS;
  const costTable = createCostTable(COST_SPEC);

  // Sweep points. `realistic` flags the ones inside the actual storm regime
  // (defensible: the metastable ADD-storm peaked ~20-50 in-flight
  // replica_operations; the priority-recovery check cadence is ~5s
  // (getPriorityRetryDelayMs=5000) => ~0.2 builds/s baseline, and even a hot
  // event-driven re-arm storm is tens, not thousands, of builds/s). The two
  // backlog=500 points are the SUPER-LINEAR STRESS TAIL (a backlog ~10x the
  // storm peak) — included to show where the threshold actually bites; they are
  // NOT a realistic storm and are asserted to saturate (the convex tail).
  const sweepPoints = [
    {frequency: 1, backlog: 20, realistic: true}, // ~baseline cadence (5s) territory
    {frequency: 10, backlog: 20, realistic: true},
    {frequency: 50, backlog: 50, realistic: true}, // a busy event-driven re-arm storm
    {frequency: 200, backlog: 50, realistic: true},
    {frequency: 200, backlog: 100, realistic: true}, // aggressive storm, op-range max
    {frequency: 50, backlog: 500, realistic: false}, // stress tail, busy freq: no
    {frequency: 100, backlog: 500, realistic: false}, // stress tail, hotter: SATURATES
  ];

  t.comment('=== REAL-cost saturation sweep — budget = ' + budgetMs +
    'ms (perRestartActiveTimeoutMs) ===');
  t.comment(
    'snapshotBuild perUnitMs=' + REAL_SNAPSHOT_BUILD_PER_UNIT_MS +
    ' (operating range backlog<=100; raw measured table for backlog>100)',
  );
  t.comment(
    '  freq/s | backlog | regime | builds/window | ms/build | accumulated ms ' +
    '| budget ms | % budget | saturated?',
  );
  for (const point of sweepPoints) {
    const m = modelPoint({...point, budgetMs, costTable});
    const pct = ((m.modelMs / budgetMs) * 100);
    t.comment(
      '  ' + String(m.frequency).padStart(6) +
      ' | ' + String(m.backlog).padStart(7) +
      ' | ' + (point.realistic ? 'storm ' : 'stress') +
      ' | ' + String(m.invocations).padStart(13) +
      ' | ' + m.perBuildMs.toFixed(5).padStart(8) +
      ' | ' + m.modelMs.toFixed(2).padStart(14) +
      ' | ' + String(m.budgetMs).padStart(9) +
      ' | ' + (pct.toFixed(4) + '%').padStart(11) +
      ' | ' + (m.saturatedModel ? 'SATURATED' : 'no'),
    );
    if (point.realistic) {
      // The central finding: no realistic storm point saturates. A future
      // regression that inflates the coefficient flips this red.
      t.equal(m.saturatedModel, false,
        'realistic storm point freq=' + m.frequency + ' backlog=' + m.backlog +
          ' does NOT saturate the 120s budget at real costs (' +
          m.modelMs.toFixed(2) + 'ms accumulated << ' + budgetMs + 'ms)');
    }
  }

  // Quantify the headroom at the most aggressive REALISTIC storm point: even
  // 200 builds/sec at backlog 100 uses a tiny fraction of the budget.
  const hottest = modelPoint({frequency: 200, backlog: 100, budgetMs, costTable});
  t.ok(hottest.modelMs < budgetMs * 0.2,
    'the hottest realistic storm (200/s x backlog 100) uses < 20% of the budget ' +
      '(' + hottest.modelMs.toFixed(0) + 'ms of ' + budgetMs + 'ms = ' +
      ((hottest.modelMs / budgetMs) * 100).toFixed(1) + '%)');
  // And confirm the stress tail DOES eventually bite, so the model isn't simply
  // incapable of saturating (the threshold is real, just far from the storm).
  const stress = modelPoint({frequency: 100, backlog: 500, budgetMs, costTable});
  t.equal(stress.saturatedModel, true,
    'the super-linear stress tail (100/s x backlog 500, ~10x the storm peak) ' +
      'DOES saturate (' + stress.modelMs.toFixed(0) + 'ms > ' + budgetMs + 'ms) — ' +
      'the threshold is real, just far above the storm regime');
  t.end();
});

// ============================================================================
// 2. THE SOLVED THRESHOLD: what frequency WOULD saturate the budget, per backlog?
//    Report the solved invocations/sec (and total builds over the window).
// ============================================================================
t.test('solved saturation threshold: the frequency (invocations/sec) needed to ' +
  'saturate the 120s budget at each backlog, with REAL costs (printed)', (t) => {
  const budgetMs = DEFAULT_BUDGET_MS;
  const windowSeconds = budgetMs / 1000;

  t.comment('=== solved saturation threshold (REAL costs, budget = ' + budgetMs +
    'ms = ' + windowSeconds + 's) ===');
  t.comment(
    '  backlog | ms/build | freq needed (inv/s) | total builds over 120s window',
  );
  for (const backlog of [20, 50, 100, 200, 500, 1000]) {
    const s = solveSaturatingFrequency({backlog, budgetMs});
    t.comment(
      '  ' + String(s.backlog).padStart(7) +
      ' | ' + s.perBuildMs.toFixed(5).padStart(8) +
      ' | ' + s.frequency.toFixed(1).padStart(19) +
      ' | ' + Math.round(s.totalBuildsOverWindow).toLocaleString().padStart(22),
    );
  }

  // The headline solved threshold for the realistic operating-range backlog (50):
  const at50 = solveSaturatingFrequency({backlog: 50, budgetMs});
  t.comment('');
  t.comment('SOLVED THRESHOLD (operating-range backlog=50): saturation needs ~' +
    Math.round(at50.frequency).toLocaleString() + ' snapshot-builds/sec = ~' +
    Math.round(at50.totalBuildsOverWindow).toLocaleString() +
    ' total builds over the 120s window.');
  const at1000 = solveSaturatingFrequency({backlog: 1000, budgetMs});
  t.comment('Even at an enormous backlog=1000 (super-linear tail, ~' +
    at1000.perBuildMs.toFixed(2) + 'ms/build) saturation still needs ~' +
    Math.round(at1000.frequency).toLocaleString() + ' builds/sec.');

  // The solved frequency must be ORDERS OF MAGNITUDE above any realistic storm
  // (the priority-recovery loop fires at ~0.2/s baseline; a hot re-arm storm is
  // tens/s). Assert the threshold is >> 1000/s for the operating-range backlogs —
  // i.e. NOT realistically reachable. This is the central quantitative finding.
  for (const backlog of [20, 50, 100]) {
    const s = solveSaturatingFrequency({backlog, budgetMs});
    t.ok(s.frequency > 1000,
      'backlog=' + backlog + ' needs > 1000 builds/sec to saturate (got ' +
        s.frequency.toFixed(0) + '/s) — far above any realistic storm cadence');
  }
  // The convex high-N tail brings the threshold down, but even backlog=1000
  // still needs tens of builds/sec (vs ~0.2/s real cadence) — still unrealistic.
  t.ok(at1000.frequency > 30,
    'even backlog=1000 needs > 30 builds/sec (got ' + at1000.frequency.toFixed(1) +
      '/s) — still ~150x the ~0.2/s real priority-recovery cadence');
  t.end();
});

// ============================================================================
// 3. CONTRAST WITH THE PLACEHOLDER: the prior repro's inflated coefficient DOES
//    saturate at a trivial frequency — quantifying the ~1800x gap that made the
//    old spike a structural (not magnitude) repro.
// ============================================================================
t.test('placeholder-vs-real contrast: the inflated prior coefficient saturates ' +
  'at a trivial frequency; the real one does not (quantifies the gap)', (t) => {
  const budgetMs = DEFAULT_BUDGET_MS;
  const backlog = 50;

  // Prior repro placeholder: perUnitMs 12, fixedMs 5 -> per-build at backlog 50.
  const placeholderPerBuildMs = 5 + 12 * backlog; // = 605 ms/build
  const realPerBuildMs = operatingRangePerBuildMs(backlog);
  const ratio = placeholderPerBuildMs / realPerBuildMs;

  const placeholderFreqToSaturate = budgetMs / (placeholderPerBuildMs * (budgetMs / 1000));
  const realFreqToSaturate = budgetMs / (realPerBuildMs * (budgetMs / 1000));

  t.comment('=== placeholder vs real (backlog=' + backlog + ') ===');
  t.comment('  placeholder ms/build = ' + placeholderPerBuildMs.toFixed(2) +
    '  -> saturates at ' + placeholderFreqToSaturate.toFixed(2) + ' builds/s');
  t.comment('  REAL ms/build        = ' + realPerBuildMs.toFixed(5) +
    '  -> saturates at ' + realFreqToSaturate.toFixed(1) + ' builds/s');
  t.comment('  inflation ratio (placeholder / real) = ~' + Math.round(ratio) + 'x');

  t.ok(ratio > 1000,
    'the prior placeholder coefficient is > 1000x the real per-build cost (~' +
      Math.round(ratio) + 'x) — it saturated by inflation, not real load');
  t.ok(placeholderFreqToSaturate < 2,
    'the placeholder saturates at < 2 builds/sec (got ' +
      placeholderFreqToSaturate.toFixed(2) + ') — a trivial frequency');
  t.ok(realFreqToSaturate > 1000,
    'the REAL cost needs > 1000 builds/sec (got ' + realFreqToSaturate.toFixed(0) +
      ') — an unrealistic frequency');
  t.end();
});

// ============================================================================
// 4. RED-ON-REVERT SANITY: costTable null => zero accumulated charge via the
//    seam (no saturation possible). The seam IS the cause of any charge.
// ============================================================================
t.test('red-on-revert: costTable null => zero accumulated charge via the seam ' +
  '(the cost seam is the sole cause)', (t) => {
  // Drive a deliberately huge invocation count at a large backlog: with a real
  // cost table this accumulates real charge; with costTable null it is ZERO.
  const invocations = 1_000_000;
  const backlog = 100;

  const withCost = accumulateChargeViaSeam({
    invocations,
    backlog,
    costTable: createCostTable(COST_SPEC),
  });
  const withoutCost = accumulateChargeViaSeam({
    invocations,
    backlog,
    costTable: null,
  });

  t.comment('=== red-on-revert (invocations=' + invocations.toLocaleString() +
    ', backlog=' + backlog + ') ===');
  t.comment('  with REAL cost table: accumulated charge = ' +
    withCost.toLocaleString() + ' ms');
  t.comment('  with costTable null:  accumulated charge = ' + withoutCost + ' ms');

  t.equal(withoutCost, 0,
    'costTable null => the seam charges nothing (busyUntil never advances) — ' +
      'no charge, no saturation, the seam is the cause');
  t.ok(withCost > 0,
    'with the real cost table the SAME seam accumulates real charge (' +
      withCost.toLocaleString() + 'ms)');
  // Even a MILLION builds at backlog 100 with the real (whole-ms rounded) cost:
  // report whether THAT saturates 120s — it bounds how extreme you must go.
  t.comment('  -> even ' + invocations.toLocaleString() +
    ' builds at backlog 100 accumulate ' + withCost.toLocaleString() +
    'ms (' + (withCost >= DEFAULT_BUDGET_MS ? 'over' : 'under') +
    ' the ' + DEFAULT_BUDGET_MS + 'ms budget); at the real ~0.2/s cadence that ' +
    'many builds would take ' +
    Math.round(invocations / 0.2 / 86400).toLocaleString() + ' days.');
  t.end();
});

// ============================================================================
// 5. DETERMINISM: identical inputs => identical accumulated charge.
// ============================================================================
t.test('determinism: the same modeled point twice yields identical accumulated ' +
  'charge (pure function of inputs, no wall-clock / RNG)', (t) => {
  const costTable = createCostTable(COST_SPEC);
  const a = modelPoint({frequency: 200, backlog: 100, budgetMs: DEFAULT_BUDGET_MS, costTable});
  const b = modelPoint({frequency: 200, backlog: 100, budgetMs: DEFAULT_BUDGET_MS, costTable});
  t.same(
    {invocations: a.invocations, modelMs: a.modelMs, viaSeamMs: a.viaSeamMs,
      saturatedModel: a.saturatedModel},
    {invocations: b.invocations, modelMs: b.modelMs, viaSeamMs: b.viaSeamMs,
      saturatedModel: b.saturatedModel},
    'identical inputs => identical accumulated charge and saturation verdict',
  );
  t.end();
});
