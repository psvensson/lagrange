#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const CLASS_CORRUPT = 'CORRUPT';
const CLASS_NODE_EXIT = 'NODE_EXIT';
const CLASS_ORACLE_BLIND = 'ORACLE_BLIND';
const CLASS_CONVERGED = 'CONVERGED';
const CLASS_TOPOLOGY_BLOCKED = 'TOPOLOGY_BLOCKED';
const CLASS_STALLED = 'STALLED';
const CLASS_SLOW = 'SLOW';

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function asNumber(value, fallback = null) {
  return typeof value === 'number' && Number.isFinite(value) ?
    value :
    fallback;
}

function normalizePassed(scenario) {
  return hasOwn(scenario, 'passed') ? scenario.passed : null;
}

function classifyOracleBlind(scenario) {
  const diagnostics = scenario?.details?.diagnostics || {};
  return scenario?.classification ||
    (((diagnostics.unexpectedNodeExits || []).length > 0) ?
      'unexpected_node_exit' :
      null) ||
    diagnostics.oracleBlind?.classification ||
    '';
}

function isTopologyBlockedScenario(scenario) {
  const quiescence = scenario?.details?.diagnostics?.quiescence || {};
  return scenario?.verdict === 'BLOCK_TOPOLOGY_CONVERGENCE' ||
    scenario?.verdictReason === 'topology_progress_blocked' ||
    scenario?.dominantReason === 'critical_system_spread_open' ||
    quiescence.canonicalBlocker === 'critical_system_spread_open' ||
    quiescence.state === 'critical_spread_open';
}

export function classifyStatGateScenario(scenario = {}) {
  const activeGate = scenario?.details?.diagnostics?.activeGate || {};
  const hardBreaches = asNumber(scenario?.invariantBreaches?.hardCount, 0);
  const missing = asNumber(
    scenario?.publicationConvergence?.missingPublishedCount,
    null,
  );
  const failedNoProgress = activeGate.failedNoProgress;
  const cyclesNoProgress = asNumber(
    activeGate.coordinatorCyclesSinceProgress,
    0,
  );
  const gateState = activeGate.state || '';
  const oracleBlindClassification = classifyOracleBlind(scenario);
  const passed = normalizePassed(scenario);

  let classification = CLASS_SLOW;
  if (hardBreaches > 0) {
    classification = CLASS_CORRUPT;
  } else if (oracleBlindClassification === 'unexpected_node_exit') {
    classification = CLASS_NODE_EXIT;
  } else if (oracleBlindClassification === 'oracle_blind') {
    classification = CLASS_ORACLE_BLIND;
  } else if (passed === false) {
    classification = isTopologyBlockedScenario(scenario) ?
      CLASS_TOPOLOGY_BLOCKED :
      CLASS_STALLED;
  } else if (missing === 0) {
    classification = CLASS_CONVERGED;
  } else if (
    failedNoProgress === true ||
    cyclesNoProgress >= 10 ||
    gateState === 'stalled'
  ) {
    classification = CLASS_STALLED;
  }

  return {
    passed,
    missing,
    hardBreaches,
    cyclesNoProgress,
    failedNoProgress,
    gateState,
    oracleBlind: oracleBlindClassification === 'oracle_blind',
    unexpectedNodeExit: oracleBlindClassification === 'unexpected_node_exit',
    reason: scenario?.dominantReason || 'none',
    closureWitnessClass: extractClosureWitnessClass(scenario),
    duration: asNumber(scenario?.duration, null),
    class: classification,
  };
}

const CLOSURE_WITNESS_SIGNAL_PREFIX = 'closureWitnessClass=';

// The failure classification carries typed key=value signal strings; the
// closure-witness class is the one cross-gate trend queries group by.
function extractClosureWitnessClass(scenario) {
  const signals = scenario?.failureClassification?.signals;
  if (!Array.isArray(signals)) {
    return null;
  }
  const match = signals.find(
    (signal) =>
      typeof signal === 'string' &&
      signal.startsWith(CLOSURE_WITNESS_SIGNAL_PREFIX),
  );
  return match ? match.slice(CLOSURE_WITNESS_SIGNAL_PREFIX.length) : null;
}

export function classifyRunReport(report = {}) {
  return classifyStatGateScenario(report.scenarios?.[0] || {});
}

// --- Gate-level Wilson verdict (docs/convergence-donewhen-metric.md §5/§7a) ---
//
// §7a: the ONLY sealed closure for rolling-restart convergence is the SAFETY
// floor (0 every run) + the Wilson-95 lower bound of the PASS rate >= the
// sealed bar. Until this existed the gate emitted raw rates and the operator
// applied the bar by hand; this mechanizes that arithmetic. It does NOT
// compute a required-N: §4 deliberately deprioritizes sample-size math — an
// INCONCLUSIVE verdict just says the interval straddles the bar.

const SEALED_BARS_PATH = 'test/distributed/config/convergence-sealed-bars.json';
const WILSON_Z_95 = 1.959963985;

const GATE_VERDICT = Object.freeze({
  SAFETY_VIOLATED: 'SAFETY_VIOLATED',
  ABOVE_BAR: 'ABOVE_BAR',
  BELOW_BAR: 'BELOW_BAR',
  INCONCLUSIVE: 'INCONCLUSIVE',
  NO_SEALED_BAR: 'NO_SEALED_BAR',
});

// Pure: Wilson score interval for `successes` out of `trials` at z.
export function wilsonInterval(successes, trials, z = WILSON_Z_95) {
  if (!Number.isInteger(trials) || trials <= 0) {
    return {lowerBound: null, upperBound: null, pointEstimate: null};
  }
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const halfWidth =
    (z / denominator) * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials));
  return {
    lowerBound: Math.max(0, center - halfWidth),
    upperBound: Math.min(1, center + halfWidth),
    pointEstimate: p,
  };
}

function loadSealedBars(path = SEALED_BARS_PATH) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// Pure: derive the gate verdict from an aggregate gate summary (the stat-gate
// OUT_JSON shape) and the sealed-bars config. Safety floor dominates: a gate
// with any CORRUPT / NODE_EXIT / ORACLE_BLIND / stale-source run can never be
// ABOVE_BAR regardless of its pass rate (§5 clause 1).
export function buildGateVerdict(gateSummary = {}, sealedBars = {}) {
  const runs = asNumber(gateSummary.runs, 0);
  const runsDetail = Array.isArray(gateSummary.runsDetail) ?
    gateSummary.runsDetail :
    [];
  const passes = runsDetail.filter((run) => run?.passed === true).length;
  const wilson = wilsonInterval(passes, runs);
  const safetyCounts = {
    corrupt: asNumber(gateSummary.corruptCount, 0),
    nodeExit: asNumber(gateSummary.nodeExitCount, 0),
    oracleBlind: asNumber(gateSummary.oracleBlindCount, 0),
    staleSource: asNumber(gateSummary.staleSourceRuns, 0),
  };
  const safetyClean = Object.values(safetyCounts).every((count) => count === 0);
  const scenarioBar = sealedBars.scenarios?.[gateSummary.scenario] || null;
  const bar = asNumber(scenarioBar?.wilsonLowerBoundBar, null);
  const promotionWindowMinRuns = asNumber(
    scenarioBar?.promotionWindowMinRuns,
    null,
  );

  let verdict;
  let reason;
  if (!safetyClean) {
    verdict = GATE_VERDICT.SAFETY_VIOLATED;
    reason = 'safety floor breached (must be 0 every run): ' +
      JSON.stringify(safetyCounts);
  } else if (bar === null) {
    verdict = GATE_VERDICT.NO_SEALED_BAR;
    reason = `no sealed bar for scenario "${gateSummary.scenario}" in ` +
      SEALED_BARS_PATH;
  } else if (wilson.lowerBound === null) {
    verdict = GATE_VERDICT.INCONCLUSIVE;
    reason = 'no runs to judge';
  } else if (wilson.lowerBound >= bar) {
    verdict = GATE_VERDICT.ABOVE_BAR;
    reason = `Wilson-95 lower bound ${wilson.lowerBound.toFixed(3)} >= sealed ` +
      `bar ${bar}`;
  } else if (wilson.upperBound < bar) {
    verdict = GATE_VERDICT.BELOW_BAR;
    reason = `Wilson-95 upper bound ${wilson.upperBound.toFixed(3)} < sealed ` +
      `bar ${bar}`;
  } else {
    verdict = GATE_VERDICT.INCONCLUSIVE;
    reason = `Wilson-95 interval [${wilson.lowerBound.toFixed(3)}, ` +
      `${wilson.upperBound.toFixed(3)}] straddles the sealed bar ${bar}; ` +
      'more runs would narrow it (advisory only — §4 deliberately does not ' +
      'compute a required N)';
  }

  const promotionNote =
    promotionWindowMinRuns !== null && runs < promotionWindowMinRuns ?
      `promotion verdicts require an N>=${promotionWindowMinRuns} ` +
        `fixed-code window (§5); this gate has N=${runs}` :
      null;

  return {
    verdict,
    reason,
    passes,
    runs,
    wilson: {
      lowerBound: wilson.lowerBound,
      upperBound: wilson.upperBound,
      pointEstimate: wilson.pointEstimate,
      confidence: 0.95,
    },
    safetyCounts,
    safetyClean,
    sealedBar: bar,
    promotionNote,
  };
}

function formatGateVerdictMarkdown(gateVerdict) {
  const wilson = gateVerdict.wilson;
  const interval = wilson.lowerBound === null ?
    'n/a' :
    `[${wilson.lowerBound.toFixed(3)}, ${wilson.upperBound.toFixed(3)}]`;
  const lines = [
    '',
    '## sealed-bar verdict (docs/convergence-donewhen-metric.md §5)',
    `- **verdict: ${gateVerdict.verdict}** — ${gateVerdict.reason}`,
    `- passes: ${gateVerdict.passes}/${gateVerdict.runs} ` +
      `(point estimate ${wilson.pointEstimate === null ?
        'n/a' :
        wilson.pointEstimate.toFixed(3)})`,
    `- Wilson-95 interval: ${interval}; sealed bar: ${gateVerdict.sealedBar}`,
    `- safety floor clean: ${gateVerdict.safetyClean} ` +
      JSON.stringify(gateVerdict.safetyCounts),
  ];
  if (gateVerdict.promotionNote) {
    lines.push(`- note: ${gateVerdict.promotionNote}`);
  }
  return lines.join('\n');
}

function runCli(argv) {
  const [command, file] = argv;
  if (command === 'classify-run' && file) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ok: true,
      output: JSON.stringify(classifyRunReport(report)),
    };
  }
  if (command === 'gate-verdict' && file) {
    const gateSummary = JSON.parse(fs.readFileSync(file, 'utf8'));
    const gateVerdict = buildGateVerdict(gateSummary, loadSealedBars());
    return {
      ok: true,
      output: JSON.stringify(gateVerdict),
    };
  }
  if (command === 'gate-verdict-md' && file) {
    const gateSummary = JSON.parse(fs.readFileSync(file, 'utf8'));
    const gateVerdict = buildGateVerdict(gateSummary, loadSealedBars());
    return {
      ok: true,
      output: formatGateVerdictMarkdown(gateVerdict),
    };
  }
  return {
    ok: false,
    output: 'usage: rolling-restart-stat-gate-summary.js ' +
      '<classify-run|gate-verdict|gate-verdict-md> <file.json>',
  };
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const result = runCli(process.argv.slice(2));
  (result.ok ? process.stdout : process.stderr).write(`${result.output}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

export {
  CLASS_CONVERGED,
  CLASS_CORRUPT,
  CLASS_NODE_EXIT,
  CLASS_ORACLE_BLIND,
  CLASS_SLOW,
  CLASS_STALLED,
  CLASS_TOPOLOGY_BLOCKED,
  GATE_VERDICT,
  runCli,
};
